import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,catalog,clone,crypto,Sheet} from './fixture.mjs';

test('本人GSS本文＋署名受付＋outbox読戻し後だけ受付済み。60秒後の再提出は無制限',()=>{
  const h=fixture(),a=h.input(),first=h.call('submit',a);assert.equal(first.state,'accepted');
  assert.equal(h.stores.size,1);assert.equal(h.properties.values.size,1);assert.equal(h.teacherRows.size,0);
  const saved=h.repository(h.bindingFor('10101@school.invalid')).read(a.submissionId);assert.equal(saved.source,a.source);assert.equal(saved.complete,true);assert.equal(saved.envelope.body.receivedAt,first.receivedAt);
  assert.equal(h.call('submit',a).receivedAt,first.receivedAt);
  assert.throws(()=>h.call('submit',h.input(a.source,'2'.repeat(32))),/cooldown/);
  for(let i=2;i<8;i++){h.advance(60000);assert.equal(h.call('submit',h.input(a.source,i.toString(16).repeat(32))).state,'accepted');}
  assert.equal(h.properties.values.size,7);assert.equal(h.stats.intakeScriptLocks,0);
});

test('本文保存後にoutboxが失敗しても、同じIDで初回時刻を保って再開する',()=>{
  const h=fixture(),a=h.input(),time=h.now();h.properties.beforeSet=()=>{throw Error('quota');};
  assert.throws(()=>h.call('submit',a),/quota/);assert.equal(h.properties.values.size,0);
  assert.equal(h.repository(h.bindingFor('10101@school.invalid')).read(a.submissionId).complete,true);
  h.advance(3600001);h.properties.beforeSet=null;h.policy={...h.policy,intakeEnabled:false};
  assert.equal(h.call('lookup',{submissionId:a.submissionId}).receivedAt,time);
  assert.equal(h.call('submit',a).receivedAt,time);assert.equal(h.properties.values.size,1);
});

test('同じIDに異なる本文・採点結果を上書きせず、選び直しは新しいIDにする',()=>{
  const h=fixture(),a=h.input();h.call('submit',a);
  assert.throws(()=>h.call('submit',h.input('changed')),/request_conflict/);
  const changed=clone(a);changed.assessment.result.score=0;assert.throws(()=>h.call('submit',changed),/request_conflict/);
  const old=h.repository(h.bindingFor('10101@school.invalid')).read(a.submissionId).source;
  h.advance(60000);const b=h.input('changed','2'.repeat(32));h.call('submit',b);assert.equal(h.properties.values.size,2);
  assert.equal(h.repository(h.bindingFor('10101@school.invalid')).read(a.submissionId).source,old);
});

test('署名preparedの後で中断しても、別課題の保存を壊さず追記再開できる',()=>{
  const h=fixture(),a=h.input();h.repository(h.bindingFor('10101@school.invalid'));
  const sheet=h.stores.get('10101@school.invalid');let fail=true;
  sheet.beforeWrite=({values})=>{if(fail&&values.length>1){fail=false;throw Error('interrupted');}};
  assert.throws(()=>h.call('submit',a),/interrupted/);const timestamp=h.now();h.advance(60000);
  const b=h.input('other data','2'.repeat(32));h.call('submit',b);
  const received=h.call('submit',a);assert.equal(received.receivedAt,timestamp);
  assert.equal(h.repository(h.bindingFor('10101@school.invalid')).read(b.submissionId).source,b.source);
});

test('本文・署名・合計・採点版・本人・受付設定が違えば受付を確定しない',()=>{
  for(const mutate of [a=>a.assessment.sourceSha256='0'.repeat(64),a=>a.assessment.rubricVersion='wrong',a=>a.assessment.result.score=0,
    a=>a.assessment.result.rules[0].points=99,a=>a.assessment.result.rules[0].passed=false,a=>a.fileName='other.html']){
    const h=fixture(),a=h.input();mutate(a);assert.throws(()=>h.call('submit',a));assert.equal(h.properties.values.size,0);
  }
  for(const options of [{badStore:true},{authorizationError:true}]){const h=fixture(options);assert.throws(()=>h.call('submit',h.input()));assert.equal(h.properties.values.size,0);}
  const mismatch=fixture();mismatch.mismatch();assert.throws(()=>mismatch.call('submit',mismatch.input()),/execution_mode/);
  const disabled=fixture();disabled.config.enabled=false;assert.throws(()=>disabled.call('submit',disabled.input()),/disabled/);
});

test('締切は冒頭のサーバー時刻で判定し、開始日時は提出を妨げない',()=>{
  const h=fixture();h.policy={...h.policy,startAt:h.now()+100000,finalDueAt:h.now()};
  const original=h.dep.authorize;h.dep.authorize=input=>{h.advance(120000);return original(input);};
  const value=h.call('submit',h.input());assert.equal(value.receivedAt,h.policy.finalDueAt);
  const late=fixture();late.policy={...late.policy,finalDueAt:late.now()-1};assert.throws(()=>late.call('submit',late.input()),/deadline_passed/);
});

test('HTML11の★はサーバーで本人・対象・保存・待機記録が確認された後だけ',()=>{
  const h=fixture(),b=catalog.bindings.find(b=>b.targetId==='html11-01');h.policy={...h.policy,binding:{...b,snapshot:catalog.snapshots[b.rubricSha256]}};
  const a=h.input();assert.equal(a.assessment,null);assert.equal(h.call('submit',a).result.score,1);
  const bad=fixture(),c=bad.input();c.targetId='html11-01';assert.throws(()=>bad.call('submit',c));
});

test('本文はBase64分割で数式化・セル上限・絵文字・改行を壊さず保存する',()=>{
  for(const source of ['=IMPORTXML("https://invalid", "//x")','<html>漢字😀\r\n\\\"\u0001</html>'.repeat(5000),'x'.repeat(2097152)]){
    const h=fixture(),a=h.input(source);h.call('submit',a);const s=h.repository(h.bindingFor('10101@school.invalid')).read(a.submissionId);assert.equal(s.source,source);
    for(const row of h.stores.get('10101@school.invalid').rows)for(const cell of row)assert.ok(typeof cell!=='string'||cell.length<=50000);
  }
  const tooBig=fixture();assert.throws(()=>tooBig.call('submit',tooBig.input('x'.repeat(2097153))),/request_invalid/);
});

test('40名×2回の合成提出が別キー・別GSSへ保存され、旧ログを保って同じ命名へ転記される',()=>{
  const h=fixture(),old={Timestamp:1700000000000,userId:'10101',kadai:'html12-01',score:.25,recordJson:'untouched-legacy'};
  h.teacherRows.set('legacy',old);const before=JSON.stringify(old);
  for(let round=0;round<2;round++){
    for(let i=1;i<=40;i++){h.actor('101'+String(i).padStart(2,'0')+'@school.invalid');h.call('submit',h.input('body '+i+' round '+round,(round+1).toString().repeat(32)));}
    h.advance(60000);
  }
  assert.equal(h.stores.size,40);assert.equal(h.properties.values.size,80);assert.equal(h.stats.intakeScriptLocks,0);
  h.teacher();const result=h.collector.collect(100);assert.equal(result.processed,80);assert.equal(result.failed,0);assert.equal(h.properties.values.size,0);
  assert.equal(h.teacherRows.size,81);assert.equal(JSON.stringify(h.teacherRows.get('legacy')),before);assert.equal(h.T.sheetName('10101'),'101_html');assert.equal(h.T.sheetName('kaijo_stu3'),'kaijo');assert.equal(h.T.sheetName('informatics'),'other');
  for(const row of h.teacherRows.values())if(row.submissionId){assert.equal(row.assignmentType,'html');assert.equal(row.score,1);assert.equal(row.receiptKind,'html-local-receipt-v1');assert.equal(row.Timestamp,1800000000000+Number(row.submissionId[0]-1)*60000);}
});

test('転記応答消失・読戻し失敗・削除失敗から再実行しても二重行にならない',()=>{
  const h=fixture();h.call('submit',h.input());h.teacher();let fail=true;
  h.properties.beforeDelete=()=>{if(fail){fail=false;throw Error('delete unavailable');}};
  assert.equal(h.collector.collect(10).failed,1);assert.equal(h.teacherRows.size,1);assert.equal(h.properties.values.size,1);
  assert.equal(h.collector.collect(10).processed,1);assert.equal(h.teacherRows.size,1);assert.equal(h.properties.values.size,0);
});

test('転記中に届く新規提出を、古いプロパティ一覧で削除しない',()=>{
  const h=fixture();h.call('submit',h.input());h.teacher();let once=true;
  h.teacherLog.hook=()=>{if(!once)return;once=false;h.actor('10202@school.invalid');h.call('submit',h.input('arrived during collection','2'.repeat(32)));h.teacher();};
  const r=h.collector.collect(10);assert.equal(r.processed,1);assert.equal(h.properties.values.size,1);
  assert.equal(h.collector.collect(10).processed,1);assert.equal(h.teacherRows.size,2);
});

test('待機記録の消失・破損は署名付き本人GSSから復旧し、本文破損は再署名しない',()=>{
  const h=fixture();const a=h.input();h.call('submit',a);const saved=h.repository(h.bindingFor('10101@school.invalid')).read(a.submissionId),key=[...h.properties.values.keys()][0];
  h.properties.values.delete(key);h.teacher();assert.equal(h.collector.recover([saved],false).restored,1);
  h.properties.values.set(key,'corrupt');assert.equal(h.collector.collect(10).invalid,1);assert.equal(h.collector.recover([saved],false).conflicts,1);
  assert.equal(h.collector.recover([saved],true).restored,1);assert.equal(h.quarantine.length,1);assert.equal(h.quarantine[0].raw,'corrupt');
  assert.equal(h.collector.recover([{...saved,source:'changed'}],true).conflicts,1);
});

test('鍵更新後も旧鍵を検証用に保持し、同じ受付・転記は同一内容になる',()=>{
  const h=fixture(),a=h.input();h.call('submit',a);const old=[...h.properties.values.values()][0];
  h.config.receiptKeys['synthetic-2']='another-not-real-key-for-unit-tests-only';h.config.activeKeyId='synthetic-2';h.call('lookup',{submissionId:a.submissionId});assert.equal([...h.properties.values.values()][0],old);
  h.teacher();assert.equal(h.collector.collect(10).processed,1);
  h.actor('10101@school.invalid');h.call('lookup',{submissionId:a.submissionId});h.teacher();assert.equal(h.collector.collect(10).processed,1);assert.equal(h.teacherRows.size,1);
});

test('教員転記は生徒権限から呼べず、本番用公開入口は既定で無効',()=>{
  const h=fixture();assert.throws(()=>h.collector.collect(10),/teacher_required/);assert.throws(()=>h.collector.recover([],true),/teacher_required/);
  assert.equal(h.context.htmlIntakeRpc('submit',{},'','').error.code,'disabled');
});

test('物理列token/tokneと手動列を維持し、旧gradeと同じ書込ロックなしでは追記しない',()=>{
  const h=fixture();h.call('submit',h.input());const envelope=JSON.parse([...h.properties.values.values()][0]),body=envelope.body;
  const projected=h.context.HtmlIntakeTeacherLog.project(body,envelope),headers=Object.keys(projected).map(k=>k==='tokne'?'token':k).concat(['manual']);
  const sheet=new Sheet(headers);sheet.rows.push(headers.map(k=>k==='manual'?'keep':k==='userId'?'legacy':''));
  const before=JSON.stringify(sheet.rows[1]),book={getSheetByName:name=>{assert.equal(name,'101_html');return sheet;}};
  const unsafe=h.context.HtmlIntakeTeacherLog.create(book,{flush(){}});assert.throws(()=>unsafe.append(projected,body),/legacy_writer_lock_required/);
  let held=false;
  const safe=h.context.HtmlIntakeTeacherLog.create(book,{flush(){assert.equal(held,true);},legacyWriterLock:()=>({tryLock(){held=true;return true;},releaseLock(){held=false;}})});
  safe.append(projected,body);assert.equal(JSON.stringify(safe.find(body)),JSON.stringify(projected));assert.equal(JSON.stringify(sheet.rows[1]),before);
  safe.append(projected,body);assert.equal(sheet.rows.length,3);assert.equal(held,false);
});
