import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudPanel } from '../cloud-ui.mjs';
import { CloudWorkspace } from '../cloud.mjs';
import { questionKey } from '../core.mjs';
const actorKey='a'.repeat(64),q={questionId:'q1',version:'v2',setId:'exercise'};
class Storage {
  data=new Map();get length(){return this.data.size;}key(i){return[...this.data.keys()][i]||null;}
  getItem(k){return this.data.get(k)||null;}setItem(k,v){this.data.set(k,v);}removeItem(k){this.data.delete(k);}
}
test('一覧にない旧版の未確認提出も、別本人への接続前に保護する',()=>{
  const storage=new Storage(),cloud=new CloudWorkspace(()=>{}, {actorKey,policies:[]},storage);
  cloud.journal.put('submit',{questionId:'old-q',version:'old-v1',assignmentId:'old-assignment',requestId:'b'.repeat(32),code:'old code'});
  const panel={cloud,connectionGeneration:7,connected:true,submission:{code:'new code'},hasPendingSubmissions:CloudPanel.prototype.hasPendingSubmissions};
  assert.throws(()=>CloudPanel.prototype.beforeDraftAttach.call(panel,{actorKey:'c'.repeat(64)}),e=>e.code==='pending_account');
  assert.equal(panel.connectionGeneration,7);assert.equal(storage.length,1);assert.equal(panel.connected,true);
  CloudPanel.prototype.beforeDraftAttach.call(panel,{actorKey});
  assert.equal(panel.connectionGeneration,8);assert.equal(panel.submission,null);assert.equal(storage.length,1);
});
test('別の版の採点・回収待ちは現在版の提出と区別する',()=>{
  const state={receipt:{questionId:q.questionId,version:'v1',state:'pending'},provisional:{state:'graded_waiting_collection',score:1}};
  const panel={ready:()=>true,cloud:{policy:()=>({assignmentId:'exercise1'}),journal:{pending:()=>null}},states:new Map([[questionKey(q),state]])};
  assert.equal(CloudPanel.prototype.navigationStatus.call(panel,q),'別の版で採点・保存待ち');
  state.receipt.state='submitted';assert.equal(CloudPanel.prototype.navigationStatus.call(panel,q),'別の版で提出');
});
function submissionPanel({teacher=false,canSubmit=false,pending=true,pendingQuestion=q,assignmentId='exercise1'}={}) {
  const storage=new Storage(),policy={...q,assignmentId:'exercise1',canSubmit,dueAt:'2026-10-15T01:00:00.000Z'};
  const cloud=new CloudWorkspace(()=>{}, {actorKey,teacher,policies:[policy]},storage);
  if(pending){const record=cloud.journal.put('submit',{...pendingQuestion,assignmentId,requestId:'b'.repeat(32),code:'original code',stdin:'',run:{outcome:'not_run'}});cloud.journal.ticket(record,'signed-arrival-proof');}
  const panel=Object.assign(Object.create(CloudPanel.prototype),{cloud,connected:true,working:false,connectionGeneration:3,states:new Map(),ratings:new Map(),schoolKeys:new Set(),codeComparisons:new Map(),
    host:{question:()=>q,running:()=>false,entry(){throw Error('未確認の提出を現在の編集へ置換してはいけない');}},open(){this.opened=true;}});
  return {panel,storage};
}
async function withDocument(fn) {
  const previous=globalThis.document,elements=new Map();
  globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',classList:{toggle(){}},setAttribute(){},replaceChildren(){},append(){}});return elements.get(id);}};
  try{return await fn(elements);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}
test('最終受付後も同じ問題の署名到着証明を持つ未確認要求だけ再送確認を開ける',()=>withDocument(async elements=>{
  const {panel,storage}=submissionPanel();panel.render();
  assert.equal(elements.get('formal-submit').disabled,false);
  await panel.prepareSubmit();assert.equal(panel.opened,true);assert.equal(panel.submission.input.code,'original code');
  assert.equal(panel.submission.input.requestId,'b'.repeat(32));assert.equal(storage.length,1);
  assert.match(elements.get('submit-description').textContent,/同じ番号・同じ全文/);
}));
test('最終受付後の新規提出・別問題/別assignmentの控えは再送許可に使わない',()=>withDocument(async elements=>{
  for(const options of [{pending:false},{pendingQuestion:{...q,questionId:'q2'}},{pendingQuestion:{...q,version:'v1'}},{assignmentId:'other-assignment'}]){
    const {panel}=submissionPanel(options);panel.render();assert.equal(elements.get('formal-submit').disabled,true);
    await panel.prepareSubmit();assert.equal(panel.opened,undefined);
  }
}));
test('教員session・不明policy・未接続は控えがあっても正式提出を開始しない',()=>withDocument(async elements=>{
  for(const change of [panel=>{panel.cloud.session.teacher=true;},panel=>{panel.cloud.policy=()=>null;},panel=>{panel.connected=false;}]){
    const {panel}=submissionPanel({canSubmit:true});change(panel);panel.render();assert.equal(elements.get('formal-submit').disabled,true);
    await panel.prepareSubmit();assert.equal(panel.opened,undefined);
  }
}));
