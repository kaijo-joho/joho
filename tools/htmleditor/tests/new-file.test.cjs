const test = require('node:test');
const assert = require('node:assert/strict');
const HtmlFileSystem = require('../filesystem.js');
const exception = name => Object.assign(new Error(name), {name});
function fixture(initial = {}) {
 const state = {permission:'granted', writes:0, reads:0, aborted:0, ...initial};
 const files = new Map();
 function fileHandle(name, text = '') {
  const handle = {
   kind:'file', name, text,
   async getFile() {
    state.reads++;
    if(state.failReadback && handle.text)throw Error('readback failed');
    return {size:Buffer.byteLength(handle.text), lastModified:100, async arrayBuffer(){return Buffer.from(handle.text);}};
   },
   async isSameEntry(other){return other===handle;},
   async createWritable() {
    let pending;
    return {
     async write(value){state.writes++;if(state.failWrite)throw Error('write failed');pending=value;state.onWrite?.();},
     async close(){handle.text=state.corruptWrite ? pending+'破損' : pending;},
     async abort(){state.aborted++;}
    };
   }
  };
  files.set(name,handle);return handle;
 }
 const directory = {
  kind:'directory', name:'HTML実習',
  async queryPermission(){return state.permission;},
  async requestPermission(){state.requests=(state.requests||0)+1;return state.permission=state.requestResult||'denied';},
  async getFileHandle(name, options){
   if(files.has(name)){if(files.get(name).kind!=='file')throw exception('TypeMismatchError');return files.get(name);}
   if(!options.create)throw exception('NotFoundError');
   return fileHandle(name);
  }
 };
 const fs = new HtmlFileSystem();fs.dirHandle=directory;fs.dirName=directory.name;
 return {fs, files, state, directory, fileHandle};
}
test('新規HTMLは書込・close・読戻し確認後だけ一覧へ追加し、編集中パスは保持する', async () => {
 const h=fixture();h.fs.currentFilePath='html12-01.html';
 const result=await h.fs.writeNewFile('html13-01.html','<!doctype html>\n<html><body>新規</body></html>');
 assert.equal(result.directory,h.directory);assert.equal(result.path,'html13-01.html');
 assert.equal(h.state.writes,1);assert.equal(h.fs.currentFilePath,'html12-01.html');
 assert.equal(h.fs.fileEntries.has('html13-01.html'),true);
 assert.match(h.files.get('html13-01.html').text,/新規/);
});
test('一覧に未反映の同名ファイル・空ファイル・ディレクトリも上書きしない', async () => {
 for(const content of ['編集済み','']) {
  const h=fixture();h.fileHandle('html13-01.html',content);
  assert.equal(await h.fs.hasFile('html13-01.html'),true);
  await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),{name:'FileExistsError'});
  assert.equal(h.state.writes,0);assert.equal(h.files.get('html13-01.html').text,content);
 }
 const h=fixture();h.files.set('html13-01.html',{kind:'directory'});
 assert.equal(await h.fs.hasFile('html13-01.html'),true);
 await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),{name:'FileExistsError'});
});
test('新規保存の途中失敗は成功とせず、自分が作った空ファイルへ同じ内容で再試行できる', async () => {
 const h=fixture({failWrite:true});
 await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),/write failed/);
 assert.equal(h.fs.fileEntries.has('html13-01.html'),false);assert.equal(h.state.aborted,1);
 h.state.failWrite=false;await h.fs.writeNewFile('html13-01.html','ひな形');
 assert.equal(h.files.get('html13-01.html').text,'ひな形');assert.equal(h.fs.newFileAttempts.size,0);
});
test('読戻し失敗の再試行は同じ保存済み内容を確認し、再書込しない', async () => {
 const h=fixture({failReadback:true});
 await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),/readback failed/);
 assert.equal(h.fs.fileEntries.has('html13-01.html'),false);assert.equal(h.state.writes,1);
 h.state.failReadback=false;await h.fs.writeNewFile('html13-01.html','ひな形');
 assert.equal(h.state.writes,1);assert.equal(h.fs.fileEntries.has('html13-01.html'),true);
});
test('失敗後に外部編集・別ファイルへの置換・別候補への変更があれば再試行で上書きしない', async () => {
 for(const change of ['edit','replace','candidate']) {
  const h=fixture({failWrite:true});await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'));
  h.state.failWrite=false;
  if(change==='edit')h.files.get('html13-01.html').text='外部で編集';
  if(change==='replace')h.fileHandle('html13-01.html');
  await assert.rejects(h.fs.writeNewFile('html13-01.html',change==='candidate'?'別候補':'ひな形'),{name:'FileExistsError'});
  assert.equal(h.state.writes,1);
 }
});
test('権限確認は利用者操作から要求し、拒否・権限切れはファイルを作らない', async () => {
 const h=fixture({permission:'prompt',requestResult:'granted'});
 assert.equal(await h.fs.requireWritePermission(),h.directory);assert.equal(h.state.requests,1);
 h.state.permission='denied';await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),/許可/);
 assert.equal(h.files.size,0);
 const denied=fixture({permission:'prompt'});await assert.rejects(denied.fs.requireWritePermission(),/許可されません/);
 assert.equal(denied.files.size,0);
});
test('保存中の接続先変更はabortし、別のフォルダや現在の文書へ反映しない', async () => {
 const h=fixture();h.state.onWrite=()=>{h.fs.dirHandle={};};
 await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形',h.directory),/接続先/);
 assert.equal(h.state.aborted,1);assert.equal(h.files.get('html13-01.html').text,'');
 assert.equal(h.fs.fileEntries.size,0);
});
test('新規保存は安全な直下HTML/CSS名と2MiB上限を守る', async () => {
 const h=fixture();
 for(const path of ['../html13-01.html','images/html13-01.html','/html13-01.html','photo.jpg'])await assert.rejects(h.fs.writeNewFile(path,'ひな形'));
 await assert.rejects(h.fs.writeNewFile('html13-01.html','x'.repeat(2*1024*1024+1)));
 assert.equal(h.files.size,0);
});
test('新規保存の重複は保存済み内容が同じでも新規として上書きしない', async () => {
 const h=fixture();await h.fs.writeNewFile('html13-01.html','ひな形');
 await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),{name:'FileExistsError'});
 assert.equal(h.state.writes,1);
});
test('保存後の内容不一致は成功にせず、再試行で不一致ファイルを上書きしない', async () => {
 const h=fixture({corruptWrite:true});
 await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),/内容が一致しません/);
 assert.equal(h.fs.fileEntries.size,0);assert.equal(h.files.get('html13-01.html').text,'ひな形破損');
 h.state.corruptWrite=false;
 await assert.rejects(h.fs.writeNewFile('html13-01.html','ひな形'),{name:'FileExistsError'});
 assert.equal(h.state.writes,1);
});
test('複数タブの新規保存は同じWeb Lockで直列化し、後続は同名ファイルを上書きしない', async () => {
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator'),names=[];
 let tail=Promise.resolve();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(name,action){names.push(name);const next=tail.then(action);tail=next.catch(()=>{});return next;}}}});
 try {
  const h=fixture(), other=new HtmlFileSystem();other.dirHandle=h.directory;other.dirName=h.directory.name;
  const results=await Promise.allSettled([h.fs.writeNewFile('html13-01.html','先のひな形'),other.writeNewFile('html13-01.html','後のひな形')]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.name,'FileExistsError');
  assert.deepEqual(names,['joho.htmleditor.new-file','joho.htmleditor.new-file']);
  assert.equal(h.files.get('html13-01.html').text,'先のひな形');assert.equal(h.state.writes,1);
 } finally {if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});
