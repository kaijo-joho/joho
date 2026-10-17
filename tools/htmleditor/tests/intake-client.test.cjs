const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {create}=require('../intake-client.js');
const sha256=async s=>createHash('sha256').update(s).digest('hex');
function harness(){
  const values=new Map(),calls=[],lockCalls=[];let actor='a'.repeat(64),generation='b'.repeat(32),counter=0,behavior=null,quota=false;
  const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(quota)throw Error('quota');values.set(k,v);}};
  const client=create({storage,sha256,session:async()=>({actorKey:actor,generation}),randomId:()=>String(++counter).padStart(32,'0'),
    locks:{request:async(k,_o,f)=>{lockCalls.push(k);return f();}},rpc:async(action,input,context)=>{calls.push({action,input,context});return behavior(action,input);}});
  const source='<html><body>保存済み</body></html>',fileName='html12-01.html';
  return {client,calls,values,lockCalls,source,fileName,
    async prepare(text=source){return client.prepare({source:text,fileName,assessment:{kind:'html-local-result-v1',targetId:'html12-01',sourceSha256:await sha256(text)}});},
    behavior:f=>behavior=f,quota:v=>quota=v,switchAccount(){actor='c'.repeat(64);},switchGeneration(){generation='d'.repeat(32);},
    accepted:input=>({state:'accepted',submissionId:input.submissionId,sourceSha256:createHash('sha256').update(input.source).digest('hex'),targetId:input.targetId,receivedAt:1800000000000})};
}
test('準備は固定データをブラウザへ保存するだけ。送信は明示操作時だけ',async()=>{
  const h=harness();await h.prepare();assert.equal(h.calls.length,0);await assert.rejects(h.client.send(),/user_action/);
  h.behavior((_action,input)=>h.accepted(input));const result=await h.client.send({userInitiated:true});assert.equal(result.state,'accepted');assert.equal(h.calls.length,1);assert.equal(h.calls[0].input.source,h.source);assert.equal((await h.client.pending()).state,'accepted');
});
test('応答消失後は同じIDを先に照会し、受領済みなら再送しない',async()=>{
  const h=harness();const first=await h.prepare();let saved;
  h.behavior((action,input)=>{assert.equal(action,'submit');saved=h.accepted(input);throw Error('response lost');});
  await assert.rejects(h.client.send({userInitiated:true}),/response lost/);
  await assert.rejects(h.prepare('new source'),/pending_exists/);
  h.behavior((action,input)=>{assert.equal(action,'lookup');assert.equal(input.submissionId,first.submissionId);return saved;});
  assert.equal((await h.client.send({userInitiated:true})).submissionId,first.submissionId);assert.deepEqual(h.calls.map(c=>c.action),['submit','lookup']);
});
test('未受付/部分保存なら元のIDと本文でのみ再開し、編集後は新しいID',async()=>{
  const h=harness();const first=await h.prepare();h.behavior(()=>{throw Error('offline');});await assert.rejects(h.client.send({userInitiated:true}));
  h.behavior((action,input)=>action==='lookup'?{state:'incomplete'}:h.accepted(input));await h.client.send({userInitiated:true});
  assert.equal(h.calls.at(-1).input.submissionId,first.submissionId);assert.equal(h.calls.at(-1).input.source,h.source);
  const next=await h.prepare('edited');assert.notEqual(next.submissionId,first.submissionId);assert.notEqual(next.sourceSha256,first.sourceSha256);
});
test('本人・保存世代変更、本文破損、保存領域不足では未確認データを自動送信しない',async()=>{
  const h=harness();await h.prepare();h.switchAccount();await assert.rejects(h.client.send({userInitiated:true}),/pending_missing/);assert.equal(h.calls.length,0);
  const g=harness();await g.prepare();g.switchGeneration();await assert.rejects(g.client.send({userInitiated:true}),/pending_missing/);
  const broken=harness();await broken.prepare();const [key,raw]=[...broken.values][0],r=JSON.parse(raw);r.input.source='changed';broken.values.set(key,JSON.stringify(r));await assert.rejects(broken.client.send({userInitiated:true}),/pending_corrupt/);assert.equal(broken.calls.length,0);
  const full=harness();full.quota(true);await assert.rejects(full.prepare(),/quota/);assert.equal(full.calls.length,0);
});
test('受領内容不一致・照会応答中のアカウント切替を成功表示しない',async()=>{
  const h=harness();await h.prepare();h.behavior((_a,input)=>({...h.accepted(input),sourceSha256:'0'.repeat(64)}));await assert.rejects(h.client.send({userInitiated:true}),/receipt_mismatch/);assert.equal((await h.client.pending()).state,'uncertain');
  let saved;h.behavior((_a,input)=>{saved={state:'accepted',submissionId:input.submissionId,sourceSha256:createHash('sha256').update(h.source).digest('hex'),targetId:'html12-01',receivedAt:1800000000000};h.switchAccount();return saved;});await assert.rejects(h.client.send({userInitiated:true}),/account_changed/);
});
