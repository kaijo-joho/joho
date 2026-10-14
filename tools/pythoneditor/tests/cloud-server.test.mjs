import test from 'node:test';
import assert from 'node:assert/strict';

import { createCloudFixture as fixture, T0, DUE } from './cloud-fixture.mjs';
const json = value => JSON.parse(JSON.stringify(value));
function failure(fn,code) { assert.throws(fn,e=>e.pythonEditorCode===code); }

test('GSS下書きのCAS・履歴・同一要求の再送・競合時の両内容保持',()=>{
  const f=fixture(),d=f.draft();
  const a=f.dispatch('saveDraft',d); assert.equal(a.state,'saved');
  assert.equal(f.dispatch('saveDraft',d).draft.revision,a.draft.revision);
  const conflict=f.dispatch('saveDraft',f.draft('loan device'));
  assert.equal(conflict.state,'conflict');assert.equal(conflict.draft.code,'one');
  const b=f.dispatch('saveDraft',f.draft('loan device',a.draft.revision));assert.equal(b.draft.seq,2);
  assert.equal(f.dispatch('getDraft',{questionId:'q1',version:'v1',revision:a.draft.revision}).draft.code,'one');
  assert.equal(f.dispatch('getDraft',{questionId:'q1',version:'v1'}).history.length,2);
  failure(()=>f.dispatch('saveDraft',{...d,code:'changed'}),'request_conflict');
});
test('正式採点はローカルの点数を信用せず、コード全文を保持して区間だけ判定',()=>{
  const f=fixture(),input=f.submission('# outside print\n# start\nx = 2\nx = 3\n# end','wrong'); input.score=1;
  const result=f.dispatch('submit',input);assert.equal(result.receipt.state,'submitted');assert.equal(result.receipt.score,1/3);
  assert.equal(f.store.findRequest(f.environment.actor.key,input.requestId).body.code,input.code);
  assert.ok(!JSON.stringify(result).includes('keyword'));assert.ok(!JSON.stringify(result).includes('rulesV2'));
});
test('受付だけでは未提出、結果保存失敗から同じ要求で回復',()=>{
  const f=fixture(),input=f.submission(),sheet=f.sheets.Python提出結果;
  sheet.beforeWrite=()=>{throw new Error('network');};failure(()=>f.dispatch('submit',input),'storage_write_failed');
  assert.equal(f.dispatch('getSubmission',{requestId:input.requestId}).receipt.state,'pending');
  sheet.beforeWrite=null;f.setNow('2026-10-15T02:00:00.000Z');
  assert.equal(f.dispatch('resumeSubmission',{requestId:input.requestId}).receipt.score,1);
  assert.equal(f.dispatch('submit',input).receipt.receivedAt,T0);assert.equal(sheet.values.length,2);
});
test('書込後の応答消失・再送で二重登録しない',()=>{
  const f=fixture(),input=f.submission();
  f.sheets.Python提出受付.afterWrite=()=>{throw new Error('lost response');};
  f.sheets.Python提出結果.afterWrite=()=>{throw new Error('lost response');};
  const r=f.dispatch('submit',input);assert.equal(r.receipt.state,'submitted');
  f.dispatch('submit',input);assert.equal(f.sheets.Python提出受付.values.length,2);assert.equal(f.sheets.Python提出結果.values.length,2);
  failure(()=>f.dispatch('submit',{...input,code:'changed'}),'stale_output');
  const different={...input,stdin:'changed'};failure(()=>f.dispatch('submit',different),'request_conflict');
  const second=f.submission();f.dispatch('submit',second);
  assert.equal(f.dispatch('questionStatus',{questionId:'q1',version:'v1',assignmentId:'exercise1'}).receipt.requestId,second.requestId);
});
test('締切ちょうどは対象、ロック待ち・採点が締切を越えても元の受付時刻で判定',()=>{
  const f=fixture(),input=f.submission();f.setLockHook(()=>f.setNow('2026-10-14T01:10:00.000Z'));
  const r=f.dispatch('submit',input,DUE);assert.equal(r.receipt.receivedAt,DUE);assert.equal(r.receipt.late,false);assert.equal(r.bestScore,1);
});
test('1問の締切内最高点と全再提出履歴。遅い満点は最高点に含めない',()=>{
  const f=fixture();f.dispatch('submit',f.submission('# start\nx = 2\nx = 3\n# end','wrong'));
  f.setNow('2026-10-14T01:00:00.001Z');const late=f.dispatch('submit',f.submission());assert.equal(late.receipt.late,true);assert.equal(late.bestScore,1/3);assert.equal(late.history.length,2);
  f.setNow('2026-10-14T00:30:00.000Z');assert.equal(f.dispatch('submit',f.submission()).bestScore,1);
});
test('旧版の基準を変更せず、新版と別に固定して採点する',()=>{
  const f=fixture(),old=f.submission(),body=json(f.snapBody);body.question.version='v2';body.rules.q1.rules[1].keyword='new-output';
  f.freeze(body);f.config.assignments.push({...f.config.assignments[0],version:'v2'});
  assert.equal(f.dispatch('submit',old).receipt.score,1);
  const newer={...f.submission(),version:'v2'};assert.equal(f.dispatch('submit',newer).receipt.score,2/3);
  const changed=json(f.snapBody);changed.rules.q1.rules[0].keyword='while';failure(()=>f.freeze(changed),'snapshot_conflict');
});
test('マーカー削除・重複を全コード採点へ迂回させない',()=>{
  for(const code of ['x = 2\nprint("value:", x)','# start\nx = 2\nprint("value:", x)\n# end\n# start']) {
    const f=fixture(),r=f.dispatch('submit',f.submission(code));assert.equal(r.receipt.score,0);assert.equal(r.receipt.diagnostics.length,1);
  }
});
test('停止・出力上限・未実行は出力判定に使用しない。randomは現行同様に出力除外',()=>{
  for(const outcome of ['stopped','not_run']) {
    const f=fixture(),s=f.submission();s.run.outcome=outcome;assert.equal(f.dispatch('submit',s).receipt.score,2/3);
  }
  const f=fixture(),s=f.submission();s.run.truncated=true;assert.equal(f.dispatch('submit',s).receipt.score,2/3);
  const random=f.submission('# start\nimport random\nprint(random.random())\n# end','different');assert.equal(f.dispatch('submit',random).receipt.score,1);
});
test('数式注入を避けて50,000文字以上のコード・入力をテキスト分割し、欠損なく復元',()=>{
  const f=fixture(),code='='+'a'.repeat(150000)+'\n=IMPORTXML("blocked")';
  const r=f.dispatch('saveDraft',f.draft(code));assert.equal(r.draft.code,code);
  const row=f.sheets.Python下書き履歴.values[1];assert.ok(row.slice(10).filter(Boolean).length>3);
  assert.ok(row.slice(10).every(s=>s===''||s.startsWith('j:')&&s.length<=40002));
  failure(()=>f.dispatch('saveDraft',f.draft('a'.repeat(200001))),'invalid_input');
});
test('他人の下書き・送信番号・結果は取得できない',()=>{
  const f=fixture(),s=f.submission();f.dispatch('saveDraft',f.draft());f.dispatch('submit',s);
  const other=f.env('other@example.invalid');assert.equal(f.dispatch('getDraft',{questionId:'q1',version:'v1'},T0,other).draft,null);
  assert.equal(f.dispatch('listDrafts',{},T0,other).drafts.length,0);assert.equal(f.dispatch('getSubmission',{requestId:s.requestId},T0,other).receipt,null);
});
test('権限・設定が確定前に変わったら結果行を書かず、再認証後に回復できる',()=>{
  const f=fixture(),s=f.submission();let n=0;f.setRecheck(()=>{if(++n===2)f.P.fail('login_required');});
  failure(()=>f.dispatch('submit',s),'login_required');assert.equal(f.dispatch('getSubmission',{requestId:s.requestId}).receipt.state,'pending');
  f.setRecheck(null);assert.equal(f.dispatch('resumeSubmission',{requestId:s.requestId}).receipt.state,'submitted');
});
test('期間前・利用学年外・未採用版・受付停止・ロック混雑を拒否する',()=>{
  const f=fixture();failure(()=>f.dispatch('submit',f.submission(),'2026-10-13T23:59:59.999Z'),'outside_period');
  f.config.assignments[0].grades=[3];failure(()=>f.dispatch('saveDraft',f.draft()),'not_allowed');
  f.config.assignments[0].grades=[4];failure(()=>f.dispatch('getDraft',{questionId:'q1',version:'unknown'}),'snapshot_missing');
  f.config.enabled=false;failure(()=>f.dispatch('saveDraft',f.draft()),'unavailable');f.config.enabled=true;
  f.setLocked(true);failure(()=>f.dispatch('saveDraft',f.draft()),'busy');
});
test('40人の合成要求を保存・採点して、本人別に40件保持する（実GAS負荷試験とは別）',async()=>{
  const f=fixture();const reports=await Promise.all(Array.from({length:40},async(_,i)=>{
    const env=f.env(`learner-${i}@example.invalid`);f.dispatch('saveDraft',f.draft(`code-${i}`),T0,env);
    return f.dispatch('submit',f.submission(),T0,env);
  }));assert.equal(reports.length,40);assert.ok(reports.every(r=>r.receipt.score===1));
  assert.equal(f.sheets.Python下書き履歴.values.length,41);assert.equal(f.sheets.Python提出受付.values.length,41);assert.equal(f.sheets.Python提出結果.values.length,41);
});
test('保存本文の改変・送信番号の重複・ヘッダー変更は不整合として止める',()=>{
  const f=fixture();f.dispatch('saveDraft',f.draft());f.sheets.Python下書き履歴.values[1][10]='j:{"code":"changed","stdin":"","parentRevision":null}';
  failure(()=>f.dispatch('getDraft',{questionId:'q1',version:'v1'}),'storage_ambiguous');
  const g=fixture(),s=g.submission();g.dispatch('submit',s);g.sheets.Python提出受付.values.push(g.sheets.Python提出受付.values[1]);
  failure(()=>g.dispatch('getSubmission',{requestId:s.requestId}),'storage_ambiguous');
});
test('公開投影は問題・雛形のみで、採点基準・秘密・模範解答を返さない',()=>{
  const f=fixture();const session=f.dispatch('session');assert.equal(session.catalog.sets[0].questions.length,1);
  const serialized=JSON.stringify(session.catalog);assert.ok(!serialized.includes('rules'));assert.ok(!serialized.includes('keyword'));assert.ok(!serialized.includes('ranges'));
});
test('課題設定の新版行だけを読み、旧py・重複・不正日時は拒否する',()=>{
  const f=fixture(),headers=['id','status','year','grade','item','targetId','subTargetId','startAt','standardDueAt','finalDueAt','gradingMode'];
  let rows=[headers,['2026-4-pythoneditor-exercise','active',2026,4,'pythoneditor','exercise','v1',new Date(T0),new Date(DUE),new Date('2026-10-15T01:00:00.000Z'),'auto']];
  const property={schema:1,enabled:false,editorOrigin:'https://editor.example.test',storageSpreadsheetId:'FIXTURE_STORE_NOT_REAL_ID_12345',assignmentIds:[rows[1][0]]};
  f.ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=>JSON.stringify(property)})};
  f.ctx.Common={SSID:{fileList:'MASTER'},TEACHERS:[]};
  f.ctx.SpreadsheetApp={openById:()=>({getSheetByName:()=>({getLastRow:()=>rows.length,getLastColumn:()=>headers.length,getRange:()=>({getValues:()=>rows.map(r=>r.slice())})})})};
  const a=f.ctx.PythonEditorConfig.config();assert.equal(a.assignments[0].dueAt,DUE);assert.equal(a.assignments[0].official,true);
  rows[1][1]='practice';assert.equal(f.ctx.PythonEditorConfig.config().assignments[0].official,false);
  rows[1][4]='py';failure(()=>f.ctx.PythonEditorConfig.config(),'unavailable');rows[1][4]='pythoneditor';
  rows.push(rows[1]);failure(()=>f.ctx.PythonEditorConfig.config(),'unavailable');rows.pop();rows[1][8]='unparsed date';failure(()=>f.ctx.PythonEditorConfig.config(),'unavailable');
});
test('学校アカウント・名簿・本人固定をRPC入口でも検査する',()=>{
  const f=fixture();let email='fixture-learner@gfe.kaijo.ed.jp',registered=true;
  f.ctx.Session={getActiveUser:()=>({getEmail:()=>email})};
  f.ctx.Common={TEACHERS:['fixture-teacher@gfe.kaijo.ed.jp'],SSID:{fileList:'MASTER'},getUser:()=>registered?{userId:email,'年':4}:null};
  f.ctx.SpreadsheetApp={openById:()=>({})};
  assert.equal(f.ctx.PythonEditorConfig.identity(false).grade,4);registered=false;failure(()=>f.ctx.PythonEditorConfig.identity(false),'not_allowed');
  email='external@example.invalid';failure(()=>f.ctx.PythonEditorConfig.identity(false),'login_required');email='fixture-teacher@gfe.kaijo.ed.jp';assert.equal(f.ctx.PythonEditorConfig.identity(false).grade,null);
  f.ctx.PythonEditorService.environment=()=>f.environment;
  assert.equal(f.ctx.pythonEditorRpc('getSubmission',{requestId:'a'.repeat(32)},'c'.repeat(64)).error.code,'login_required');
  assert.equal(f.ctx.pythonEditorRpc('getSubmission',{requestId:'a'.repeat(32)},f.environment.actor.key).ok,true);
});
test('長いUnicode本文をセル境界で分断せず、古い未完了受付も最新提出と別に照会できる',()=>{
  const f=fixture(),unicode='😀'.repeat(70000);assert.equal(f.dispatch('saveDraft',f.draft(unicode)).draft.code,unicode);
  f.sheets.Python提出結果.beforeWrite=()=>{throw new Error('offline');};const s=f.submission();failure(()=>f.dispatch('submit',s),'storage_write_failed');
  f.sheets.Python提出結果.beforeWrite=null;f.setNow('2026-10-14T00:01:00.000Z');f.dispatch('submit',f.submission());
  const result=f.dispatch('questionStatus',{questionId:'q1',version:'v1',assignmentId:'exercise1'});assert.equal(result.receipt.state,'submitted');assert.equal(result.pending[0].requestId,s.requestId);
});
test('ロック混雑の到着証明を再送すると、締切後も元のサーバー到着時刻を使う。偽造・他人用は拒否',()=>{
  const f=fixture(),input=f.submission();let ticket;
  f.setLocked(true);
  try{f.dispatch('submit',input,DUE);}catch(e){assert.equal(e.pythonEditorCode,'busy');ticket=json(e.intakeTicket);}
  assert.ok(ticket?.signature);f.setLocked(false);f.setNow('2026-10-14T02:00:00.000Z');
  const altered=structuredClone(ticket);altered.payload.receivedAt=T0;
  failure(()=>f.dispatch('submit',{...input,intakeTicket:altered}),'invalid_input');
  const different=f.submission();failure(()=>f.dispatch('submit',{...different,intakeTicket:ticket}),'request_conflict');
  const result=f.dispatch('submit',{...input,intakeTicket:ticket});assert.equal(result.receipt.receivedAt,DUE);assert.equal(result.receipt.late,false);assert.equal(result.bestScore,1);
});
