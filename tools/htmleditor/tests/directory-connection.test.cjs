const test=require('node:test');
const assert=require('node:assert/strict');
const HtmlFileSystem=require('../filesystem.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const file=(name,text='source')=>new File([text],name);
const directory=(name,files={'index.html':file('index.html',name)})=>({
  kind:'directory',name,
  async queryPermission(){return'granted';},
  async *entries(){for(const [name,value]of Object.entries(files))yield[name,{kind:'file',async getFile(){return value;}}];}
});
const timeout=error=>error.name==='TimeoutError'&&/時間切れ/.test(error.message);

test('許可確認の応答喪失は時間切れとし、後からgrantedでも新しい接続先へ影響しない',async()=>{
  const fs=new HtmlFileSystem({directoryTimeoutMs:20}),late=deferred();
  await fs.reconnectDirectory(directory('before'));
  const previous=fs.dirHandle;
  const stale={...directory('stale'),queryPermission:()=>late.promise};
  await assert.rejects(fs.reconnectDirectory(stale),timeout);
  assert.equal(fs.dirHandle,previous);assert.equal(await fs.readFile('index.html'),'before');
  await fs.reconnectDirectory(directory('after'));
  late.resolve('granted');await delay(0);
  assert.equal(fs.getDirectoryName(),'after');assert.equal(await fs.readFile('index.html'),'after');
});

test('明示再接続の許可要求が返らなくても、既存のファイルと接続を保持して復帰する',async()=>{
  const fs=new HtmlFileSystem({directoryTimeoutMs:20}),late=deferred();
  await fs.reconnectDirectory(directory('existing'));
  const stale={...directory('stale'),async queryPermission(){return'prompt';},requestPermission:()=>late.promise};
  assert.equal(await fs.reconnectDirectory(stale),false,'起動時は許可要求を出さない');
  await assert.rejects(fs.reconnectDirectory(stale,{requestPermission:true}),timeout);
  assert.equal(fs.getDirectoryName(),'existing');assert.equal(await fs.readFile('index.html'),'existing');
  late.resolve('granted');await delay(0);assert.equal(fs.getDirectoryName(),'existing');
});

test('一覧・getFile・CSS読取の停止は部分的な素材URLだけを破棄し、現在の素材を保持する',async()=>{
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  let serial=0;const revoked=[];
  URL.createObjectURL=()=> 'blob:directory-test-'+(++serial);
  URL.revokeObjectURL=value=>revoked.push(value);
  try{
    for(const phase of ['entries','file','css']){
      const fs=new HtmlFileSystem({directoryTimeoutMs:20}),late=deferred();
      await fs.reconnectDirectory(directory('existing',{'old.png':file('old.png')}));
      const old=fs.resolveResourceUrl('old.png'),entries=fs.fileEntries;
      const waitingFile={size:4,arrayBuffer:()=>late.promise};
      const stalled={...directory('stalled'),async *entries(){
        yield['partial.png',{kind:'file',async getFile(){return file('partial.png');}}];
        if(phase==='entries')await late.promise;
        else yield[phase==='css'?'delayed.css':'delayed.html',{kind:'file',getFile:()=>phase==='file'?late.promise:Promise.resolve(waitingFile)}];
      }};
      const nextUrl='blob:directory-test-'+(serial+1);
      await assert.rejects(fs.reconnectDirectory(stalled),timeout);
      assert.equal(fs.fileEntries,entries);assert.equal(fs.resolveResourceUrl('old.png'),old);
      assert.ok(revoked.includes(nextUrl));assert.ok(!revoked.includes(old));
      late.resolve(phase==='file'?file('delayed.html'):new TextEncoder().encode('body{}'));
      await delay(0);assert.equal(fs.fileEntries,entries);assert.deepEqual(fs.getFileList(),['old.png']);
      fs.disconnect();
    }
  }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}
});

test('接続変更・解除・読取り専用取込は古い確認を中止し、遅い完了通知を採用しない',async()=>{
  for(const action of ['connect','disconnect','import']){
    const fs=new HtmlFileSystem({directoryTimeoutMs:1000}),late=deferred(),events=[];
    fs.onChange((name,value)=>events.push([name,value?.dirName]));
    await fs.reconnectDirectory(directory('existing'));
    const pending=fs.reconnectDirectory({...directory('stale'),queryPermission:()=>late.promise});
    const stopped=assert.rejects(pending,error=>error.name==='AbortError');
    if(action==='connect')await fs.reconnectDirectory(directory('new'));
    else if(action==='disconnect')fs.disconnect();
    else await fs.importFiles([file('imported.html')]);
    await stopped;const expected=fs.getDirectoryName(),count=events.length;
    late.resolve('granted');await delay(0);
    assert.equal(fs.getDirectoryName(),expected);assert.equal(events.length,count);
    assert.equal(fs.getFileList().includes('stale'),false);
  }
});

test('OSのフォルダ選択を待つ時間を読み込みの期限に含めず、取消では接続を保持する',async()=>{
  const original=global.window,selected=deferred(),fs=new HtmlFileSystem({directoryTimeoutMs:20});
  try{
    global.window={showDirectoryPicker:()=>selected.promise};
    await fs.reconnectDirectory(directory('existing'));
    let finished=false;const pending=fs.openDirectory().finally(()=>finished=true);
    await delay(45);assert.equal(finished,false);
    selected.resolve(directory('selected'));assert.equal(await pending,'selected');
    global.window.showDirectoryPicker=async()=>{const error=new Error('cancel');error.name='AbortError';throw error;};
    await assert.rejects(fs.openDirectory(),error=>error.name==='AbortError');
    assert.equal(fs.getDirectoryName(),'selected');
  }finally{global.window=original;}
});

test('再走査の時間切れでは開いたファイル名と現在の読取り結果を保持する',async()=>{
  const fs=new HtmlFileSystem({directoryTimeoutMs:20}),root=directory('existing'),late=deferred();
  await fs.reconnectDirectory(root);await fs.readFile('index.html');
  const entries=fs.fileEntries;
  root.entries=async function*(){await late.promise;yield['new.html',{kind:'file',async getFile(){return file('new.html');}}];};
  await assert.rejects(fs.scanDirectory(),timeout);
  assert.equal(fs.fileEntries,entries);assert.equal(fs.getCurrentFilePath(),'index.html');
  late.resolve();await delay(0);assert.equal(await fs.readFile('index.html'),'existing');
  assert.deepEqual(fs.getFileList(),['index.html']);
});
