import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudFixture as fixture} from './cloud-fixture.mjs';
const equal=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const status=f=>f.dispatch('questionStatus',{questionId:'q1',version:'v1',assignmentId:'exercise1'});
test('星はコード条件だけを数え、行数・出力判定と点数を変えない',()=>{
  const f=fixture();const before=f.dispatch('session').ratings[0];assert.equal(before.rating.earned,null);assert.equal(before.rating.total,1);
  const s=f.dispatch('submit',f.submission());assert.equal(s.receipt.score,1);assert.equal(s.receipt.checks.length,3);equal(s.rating,{earned:1,total:1,version:'v1'});
  equal(f.dispatch('session').ratings[0].rating,s.rating);
});
test('未完了の採点や締切後の満点で星を増やさない',()=>{
  const f=fixture(),s=f.submission();f.sheets.Python提出結果.beforeWrite=()=>{throw new Error('offline');};assert.throws(()=>f.dispatch('submit',s));
  assert.equal(status(f).receipt.state,'pending');equal(status(f).rating,{earned:null,total:1,version:'v1'});
  f.sheets.Python提出結果.beforeWrite=null;f.setNow('2026-10-14T01:00:00.001Z');const late=f.dispatch('submit',f.submission());assert.equal(late.rating.earned,null);
});
test('低い再提出でも締切内最高点の提出の星を保持し、チェックを寄せ集めない',()=>{
  const f=fixture();f.dispatch('submit',f.submission());f.setNow('2026-10-14T00:30:00.000Z');
  const next=f.dispatch('submit',f.submission('# start\nx = 2\nx = 3\n# end','wrong'));assert.equal(next.receipt.score,1/3);equal(next.rating,{earned:1,total:1,version:'v1'});
});
test('最新20件より古い最高点も星へ反映する',()=>{
  const f=fixture();f.dispatch('submit',f.submission());
  for(let i=0;i<24;i++)f.dispatch('submit',f.submission('# start\nx = 2\nx = 3\n# end','wrong'));
  assert.equal(status(f).history.length,20);assert.equal(status(f).rating.earned,1);
});
test('旧版の最高点の星は旧基準の分母と版で返す',()=>{
  const f=fixture();f.dispatch('submit',f.submission());const body=structuredClone(f.snapBody);body.question.version='v2';body.rules.q1.rules[0].keyword='while';
  body.rules.q1.rules.push({...body.rules.q1.rules[0],ruleId:'extra',keyword:'break'});f.freeze(body);f.config.assignments.push({...f.config.assignments[0],version:'v2'});
  const next=f.dispatch('submit',{...f.submission(),version:'v2'});assert.equal(next.bestScore,1);equal(next.rating,{earned:1,total:1,version:'v1'});
  const newer=f.dispatch('session').ratings.find(r=>r.version==='v2');assert.equal(newer.rating.version,'v1');assert.equal(newer.rating.total,1);
});
test('マーカー不正でもコード条件の星の分母は保持する',()=>{
  const f=fixture(),r=f.dispatch('submit',f.submission('print("no markers")'));assert.equal(r.receipt.score,0);equal(r.rating,{earned:0,total:1,version:'v1'});
});
test('一覧は本人の結果だけを一度読み、基準や解答を含めない',()=>{
  const f=fixture();f.dispatch('submit',f.submission());let scans=0;const read=f.store.resultsForActor;f.store.resultsForActor=actor=>{scans++;return read(actor);};
  const own=f.dispatch('session');assert.equal(scans,1);assert.equal(own.ratings[0].rating.earned,1);
  const other=f.dispatch('session',{},undefined,f.env('other@example.invalid'));assert.equal(other.ratings[0].rating.earned,null);
  const text=JSON.stringify(own.ratings);for(const value of ['keyword','value: 2','answerCode','snapshotHash','rulesV2'])assert.ok(!text.includes(value));
});
