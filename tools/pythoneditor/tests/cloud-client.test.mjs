import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudWorkspace, CloudJournal, GoogleBridge, bridgeURL, googleOrigin, codeHash, submissionText } from '../cloud.mjs';
import { DraftStore } from '../storage.mjs';
const actorKey='a'.repeat(64),q={questionId:'q1',version:'v1'},policy={...q,assignmentId:'assignment1',canSubmit:true};
const T0='2026-10-14T00:00:00.000Z';
const session={actorKey,policies:[policy]};
const entry={...q,code:'print(2)',stdin:'2'};
class Storage {constructor(){this.values=new Map();}get length(){return this.values.size;}key(i){return [...this.values.keys()][i];}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}removeItem(k){this.values.delete(k);}}

test('許可した固定GAS URLのみを使い、パラメーター経由の接続先・異なるoriginを拒否',()=>{
  const config={enabled:true,bridgeURL:'https://script.google.com/macros/s/EXAMPLE/exec'};
  assert.match(bridgeURL(config,'https://example.test','a'.repeat(64)),/kind=pythoneditor/);
  for(const url of ['https://evil.test/exec','http://script.google.com/macros/s/ID/exec','https://script.google.com/macros/s/ID/exec?redirect=evil'])assert.throws(()=>bridgeURL({...config,bridgeURL:url},'https://example.test','a'.repeat(64)));
  assert.throws(()=>bridgeURL({enabled:false},'https://example.test','a'.repeat(64)),/準備中/);
  assert.ok(googleOrigin('https://a-script.script.googleusercontent.com'));assert.ok(!googleOrigin('https://script.googleusercontent.com.evil.test'));
  assert.ok(googleOrigin('https://n-pythoneditor-fixture-0lu-script.googleusercontent.com'));assert.ok(!googleOrigin('https://evil-googleusercontent.com'));
});
test('クラウドの既存内容と違う初回保存は読取だけで競合を返す',async()=>{
  const actions=[],cloud=new CloudWorkspace(async(action)=>{actions.push(action);return{draft:{...q,revision:'b'.repeat(32),code:'loan',stdin:''}};},session,new Storage());
  assert.equal((await cloud.save(entry)).state,'conflict');assert.deepEqual(actions,['getDraft']);assert.equal(cloud.bases.size,0);
});
test('応答消失後の下書き再送は、途中の編集に置換せず同じ全文・ID・更新番号を使う',async()=>{
  const calls=[],storage=new Storage();let saved=false;
  const rpc=async(action,input,key)=>{assert.equal(key,actorKey);if(action==='getDraft')return{draft:null};calls.push(structuredClone(input));if(!saved)throw new Error('offline');return{state:'saved',draft:{...q,revision:'b'.repeat(32),code:input.code,stdin:input.stdin},currentRevision:'b'.repeat(32)};};
  const cloud=new CloudWorkspace(rpc,session,storage);await assert.rejects(cloud.save(entry),/offline/);
  saved=true;const restored=new CloudWorkspace(rpc,session,storage),r=await restored.save({...entry,code:'edited meanwhile'});
  assert.deepEqual(calls[1],calls[0]);assert.equal(r.sent.code,'print(2)');assert.equal(storage.length,0);
});
test('正式提出の控え保存が失敗したら、GASへ送信しない',async()=>{
  const storage=new Storage();storage.setItem=()=>{throw new Error('quota');};let calls=0;
  const cloud=new CloudWorkspace(async()=>{calls++;},session,storage);
  await assert.rejects(cloud.submit({...entry,assignmentId:policy.assignmentId,run:{}}),/送信は開始していません/);assert.equal(calls,0);
});
test('正式提出の応答消失・再読み込み・コード変更後も同じ不変要求を再送',async()=>{
  const calls=[],storage=new Storage();let complete=false;
  const rpc=async(_a,input)=>{calls.push(structuredClone(input));if(!complete)throw new Error('lost');return{receipt:{...q,state:'submitted',requestId:input.requestId},bestScore:1,history:[]};};
  const cloud=new CloudWorkspace(rpc,session,storage);const payload=await submissionText(entry,policy,null);await assert.rejects(cloud.submit(payload));
  complete=true;await new CloudWorkspace(rpc,session,storage).submit({...payload,code:'new code'});assert.deepEqual(calls[1],calls[0]);assert.equal(storage.length,0);
});
test('受付済みは控えを削除せず、結果保存完了後の照会でだけ削除',async()=>{
  const storage=new Storage();let complete=false;
  const rpc=async(_a,input)=>({receipt:{...q,state:complete?'submitted':'pending',requestId:input.requestId},bestScore:null,history:[]});
  const cloud=new CloudWorkspace(rpc,session,storage);await cloud.submit(await submissionText(entry,policy,null));assert.equal(storage.length,1);
  assert.equal((await cloud.recover(q,policy.assignmentId)).receipt.state,'pending');assert.equal(storage.length,1);
  complete=true;await cloud.recover(q,policy.assignmentId);assert.equal(storage.length,0);
});
test('サーバーに未受付でも送信控えを保持して、照会は新たな提出を作らない',async()=>{
  const storage=new Storage(),journal=new CloudJournal(storage,actorKey);journal.put('submit',{...entry,assignmentId:policy.assignmentId,requestId:'b'.repeat(32)});const actions=[];
  const cloud=new CloudWorkspace(async a=>{actions.push(a);return{receipt:null,history:[],bestScore:null};},session,storage);
  assert.equal((await cloud.recover(q,policy.assignmentId)).unreceived,true);assert.deepEqual(actions,['getSubmission']);assert.equal(storage.length,1);
});
test('別アカウントに再認証しても、以前の本人の要求を再送しない',async()=>{
  const storage=new Storage(),journal=new CloudJournal(storage,actorKey);journal.put('submit',{...entry,requestId:'b'.repeat(32)});
  const actions=[],cloud=new CloudWorkspace(async a=>{actions.push(a);return{receipt:null};},{...session,actorKey:'c'.repeat(64)},storage);
  await cloud.recover(q,policy.assignmentId);assert.deepEqual(actions,['questionStatus']);assert.equal(storage.length,1);
});
test('古い実行結果は現在のコード・入力へ結合せず、未実行として送信',async()=>{
  const run={code:entry.code,stdin:entry.stdin,text:'2\n',stdout:'2\n',inputEcho:'',stderr:'',error:'',outcome:'success',truncated:false};
  assert.equal((await submissionText(entry,policy,run)).run.codeHash,await codeHash(entry.code));
  const stale=await submissionText({...entry,code:'print(3)'},policy,run);assert.equal(stale.run.outputText,'');assert.equal(stale.run.outcome,'not_run');
  const inputChanged=await submissionText({...entry,stdin:'4'},policy,run);assert.equal(inputChanged.run.outcome,'not_run');
});
test('更新番号は明示した選択でだけ進め、競合の控えを保持する',async()=>{
  const storage=new Storage(),calls=[],cloud=new CloudWorkspace(async(a,input)=>{calls.push(input);return{state:'conflict',draft:{...q,revision:'c'.repeat(32),code:'remote'}};},session,storage);
  cloud.adoptRevision(q,'b'.repeat(32));const conflict=await cloud.save(entry);assert.equal(conflict.state,'conflict');assert.equal(calls[0].expectedRevision,'b'.repeat(32));assert.equal(cloud.bases.get('v1/q1'),'b'.repeat(32));
  cloud.adoptRevision(q,conflict.draft.revision);await cloud.save(entry);assert.equal(calls[1].expectedRevision,'c'.repeat(32));
});
test('bridgeは異なるnonce/origin/sourceと、タイムアウト後の古い応答を反映しない',async()=>{
  let listener;const callbacks=[],frames=[];
  const win={location:{origin:'https://editor.test'},addEventListener:(_a,fn)=>listener=fn,removeEventListener(){}};
  const doc={createElement:()=>({remove(){}}),body:{append(frame){frames.push(frame);}}};
  const bridge=new GoogleBridge({enabled:true,bridgeURL:'https://script.google.com/macros/s/EXAMPLE/exec'},{win,doc,timeout:50});
  const connection=bridge.connect();const channel=new URL(frames[0].src).searchParams.get('channel');
  const source={postMessage(data){callbacks.push(data);if(data.action==='session')queueMicrotask(()=>listener({source,origin:'https://script.googleusercontent.com',data:{protocol:'python-editor-rpc-v1',channel,type:'response',id:data.id,result:{ok:true,value:session}}}));}};
  listener({source,origin:'https://evil.test',data:{protocol:'python-editor-rpc-v1',channel,type:'ready'}});assert.equal(callbacks.length,0);
  listener({source,origin:'https://script.googleusercontent.com',data:{protocol:'python-editor-rpc-v1',channel,type:'ready'}});assert.equal(await connection,session);
  const call=bridge.call('getSubmission',{requestId:'b'.repeat(32)},actorKey),request=callbacks.at(-1);
  listener({source:{},origin:'https://script.googleusercontent.com',data:{protocol:'python-editor-rpc-v1',channel,type:'response',id:request.id,result:{ok:true,value:'bad'}}});
  await assert.rejects(call,e=>e.code==='timeout');
  listener({source,origin:'https://script.googleusercontent.com',data:{protocol:'python-editor-rpc-v1',channel,type:'response',id:request.id,result:{ok:true,value:'old'}}});assert.equal(bridge.requests.size,0);bridge.dispose();
});
test('取り込み前の控えが容量不足なら、後の自動保存でも別タブの元内容を上書きしない',()=>{
  const storage=new Storage(),store=new DraftStore(storage),other=new DraftStore(storage);
  store.write({...entry,updatedAt:T0,practiced:false});other.read(q);other.write({...entry,code:'other tab',updatedAt:T0,practiced:false});
  const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(k.includes('archive.'))throw new Error('quota');set(k,v);};
  assert.throws(()=>store.prepareImport({...entry,updatedAt:T0,practiced:false},'before cloud import'),/quota/);
  assert.throws(()=>store.write({...entry,code:'must not replace',updatedAt:T0,practiced:false}),/競合/);
  assert.equal(other.read(q).code,'other tab');
});
test('サーバー到着証明を控えに保持して再送し、コード本文と送信番号は変えない',async()=>{
  const storage=new Storage(),ticket={payload:{receivedAt:T0},signature:'fixture'},calls=[];let fail=true;
  const rpc=async(_a,input)=>{calls.push(input);if(fail){const e=new Error('busy');e.intakeTicket=ticket;throw e;}return{receipt:{state:'submitted',requestId:input.requestId}};};
  const cloud=new CloudWorkspace(rpc,session,storage),body=await submissionText(entry,policy,null);await assert.rejects(cloud.submit(body));
  fail=false;await new CloudWorkspace(rpc,session,storage).submit(body);assert.deepEqual(calls[1].intakeTicket,ticket);assert.equal(calls[1].requestId,calls[0].requestId);assert.equal(calls[1].code,calls[0].code);
});
