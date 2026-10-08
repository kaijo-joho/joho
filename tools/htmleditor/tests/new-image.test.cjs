const test=require('node:test'),assert=require('node:assert/strict');
const HtmlFileSystem=require('../filesystem.js');
const error=name=>Object.assign(Error(name),{name});
const candidate=Uint8Array.from([255,216,255,1,2,3,4]);
function fixture(options={}) {
  const state={writes:0,aborts:0,permission:'granted',...options}, files=new Map();
  function add(name,raw=new Uint8Array()) {
    const handle={kind:'file',name,raw:new Uint8Array(raw),async isSameEntry(other){return this===other;},
      async getFile(){if(state.failRead&&handle.raw.length)throw Error('read failed');const file=new Blob([handle.raw],{type:'image/jpeg'});file.lastModified=12;return file;},
      async createWritable(){let pending;return {
        async write(raw){state.writes++;if(state.failWrite)throw Error('write failed');pending=new Uint8Array(raw);state.onWrite?.();},
        async close(){handle.raw=state.corrupt?Uint8Array.from([...pending,9]):pending;},async abort(){state.aborts++;}
      };}
    };files.set(name,handle);return handle;
  }
  const images={kind:'directory',name:'images',async isSameEntry(other){return this===other;},async getFileHandle(name,opt){
    if(files.has(name)){if(files.get(name).kind!=='file')throw error('TypeMismatchError');return files.get(name);}
    if(!opt.create)throw error('NotFoundError');return add(name);
  }};
  const directory={kind:'directory',name:'HTML実習',async queryPermission(){return state.permission;},
    async requestPermission(){return state.permission=state.request||'denied';},
    async getDirectoryHandle(name,opt){assert.equal(name,'images');assert.equal(opt.create,false);state.folderReads=(state.folderReads||0)+1;
      if(state.noImages)throw error('NotFoundError');if(state.imagesFile)throw error('TypeMismatchError');return state.imagesReplacement||images;}
  };
  const fs=new HtmlFileSystem();fs.dirHandle=directory;fs.dirName=directory.name;fs.currentFilePath='html14-01.html';
  return {fs,state,images,directory,files,add};
}
test('画像は既存imagesへ新規保存し、読戻し・Blob参照を追加して編集中パスを維持',async()=>{
  const h=fixture(),events=[];h.fs.onChange((event,data)=>events.push([event,data]));
  const result=await h.fs.writeNewImage('photo01.jpg',candidate,h.directory,h.images);
  assert.equal(result.path,'images/photo01.jpg');assert.equal(h.fs.currentFilePath,'html14-01.html');
  assert.deepEqual(h.files.get('photo01.jpg').raw,candidate);assert.equal(h.state.writes,1);
  assert(h.fs.fileEntries.has(result.path));assert(h.fs.resolveResourceUrl('./images/photo01.jpg','html14-01.html')?.startsWith('blob:'));
  assert.equal(events[0][0],'file-created');h.fs.disconnect();
});
test('imagesがない・同名の通常ファイルの場合は作成せず案内する',async()=>{
  for(const option of [{noImages:true},{imagesFile:true}]){
    const h=fixture(option);await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate),/Finder.*images.*自動では作成しません/);
    assert.equal(h.files.size,0);assert.equal(h.state.writes,0);
  }
});
test('既存画像・空ファイル・同名フォルダは同じ内容でも上書きしない',async()=>{
  for(const raw of [candidate,new Uint8Array()]){
    const h=fixture();h.add('photo01.jpg',raw);assert.equal(await h.fs.hasImage('photo01.jpg',h.images),true);
    await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate),{name:'FileExistsError'});assert.equal(h.state.writes,0);
  }
  const h=fixture();h.files.set('photo01.jpg',{kind:'directory'});assert(await h.fs.hasImage('photo01.jpg',h.images));
  await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate),{name:'FileExistsError'});
});
test('書込失敗の同じ候補だけ再試行でき、読戻し失敗なら再書込せず検証する',async()=>{
  for(const failure of ['failWrite','failRead']){
    const h=fixture({[failure]:true});await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate));
    assert.equal(h.fs.fileEntries.size,0);assert.equal(h.fs.blobUrlMap.size,0);assert.equal(h.fs.newFileAttempts.size,1);
    h.state[failure]=false;await h.fs.writeNewImage('photo01.jpg',new Uint8Array(candidate));
    assert.equal(h.state.writes,failure==='failWrite'?2:1);assert.deepEqual(h.files.get('photo01.jpg').raw,candidate);h.fs.disconnect();
  }
});
test('途中失敗後の外部編集・置換・別候補は上書きしない',async()=>{
  for(const change of ['edit','replace','candidate']){
    const h=fixture({failWrite:true});await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate));h.state.failWrite=false;
    if(change==='edit')h.files.get('photo01.jpg').raw=Uint8Array.from([1]);
    if(change==='replace')h.add('photo01.jpg');
    await assert.rejects(h.fs.writeNewImage('photo01.jpg',change==='candidate'?Uint8Array.from([9]):candidate),{name:'FileExistsError'});
    assert.equal(h.state.writes,1);
  }
});
test('内容不一致は成功にせず、再試行で破損画像を上書きしない',async()=>{
  const h=fixture({corrupt:true});await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate),/一致しません/);
  assert.equal(h.fs.fileEntries.size,0);assert.equal(h.fs.blobUrlMap.size,0);h.state.corrupt=false;
  await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate),{name:'FileExistsError'});assert.equal(h.state.writes,1);
});
test('接続先・imagesの置換と権限切れは書込前・途中とも止める',async()=>{
  const denied=fixture({permission:'denied'});await assert.rejects(denied.fs.writeNewImage('photo01.jpg',candidate),/許可/);assert.equal(denied.files.size,0);
  const replaced=fixture({imagesReplacement:{}});await assert.rejects(replaced.fs.writeNewImage('photo01.jpg',candidate,replaced.directory,replaced.images),/保存先が変わりました/);
  for(const change of ['root','images']){
    const h=fixture();h.state.onWrite=()=>{if(change==='root')h.fs.dirHandle={};else h.state.imagesReplacement={};};
    await assert.rejects(h.fs.writeNewImage('photo01.jpg',candidate),/変わりました/);assert.equal(h.state.aborts,1);
    assert.equal(h.files.get('photo01.jpg').raw.length,0);assert.equal(h.fs.fileEntries.size,0);
  }
});
test('保存するバイト列は呼出し直後に固定し、無効名・容量・ファイル数は作成前に拒否',async()=>{
  const h=fixture(),source=new Uint8Array(candidate);const pending=h.fs.writeNewImage('photo01.jpg',source);source[0]=0;
  await pending;assert.deepEqual(h.files.get('photo01.jpg').raw,candidate);h.fs.disconnect();
  for(const name of ['../p.jpg','images/p.jpg','p.svg','p.html','/p.jpg','p%2f.jpg','p.jpg?x'])await assert.rejects(fixture().fs.writeNewImage(name,candidate));
  for(const raw of ['',new Uint8Array(),new Uint8Array(8*1024*1024+1)])await assert.rejects(fixture().fs.writeNewImage('p.jpg',raw));
  const full=fixture();for(let i=0;i<200;i++)full.fs.fileEntries.set(String(i),{file:{size:1}});
  await assert.rejects(full.fs.writeNewImage('p.jpg',candidate),/ファイル数/);assert.equal(full.files.size,0);
  const large=fixture();large.fs.fileEntries.set('large',{file:{size:50*1024*1024}});
  await assert.rejects(large.fs.writeNewImage('p.jpg',candidate),/容量/);assert.equal(large.files.size,0);
});
test('複数タブの新規画像もHTMLと同じWeb Lockで直列化する',async()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),locks=[];let tail=Promise.resolve();
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(name,fn){locks.push(name);const promise=tail.then(fn);tail=promise.catch(()=>{});return promise;}}}});
  try{
    const h=fixture(),other=new HtmlFileSystem();other.dirHandle=h.directory;
    const result=await Promise.allSettled([h.fs.writeNewImage('p.jpg',candidate),other.writeNewImage('p.jpg',candidate)]);
    assert.equal(result[0].status,'fulfilled');assert.equal(result[1].reason.name,'FileExistsError');assert.equal(h.state.writes,1);
    assert.deepEqual(locks,['joho.htmleditor.new-file','joho.htmleditor.new-file']);h.fs.disconnect();
  }finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
});
