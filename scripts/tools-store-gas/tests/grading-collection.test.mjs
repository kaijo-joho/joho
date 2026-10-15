import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, DUE, T0, json } from './student-grading-fixture.mjs';
const errorCode = code => error => (error.toolsStoreCode || error.pythonEditorCode) === code;
function query(f, requestId, account) { return f.call('getSubmission', { requestId }, account); }

test('中央の受付/結果/履歴を保存し読戻してから本人へ完了ackを発行する', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  const result = f.collector.run();
  assert.equal(result.students[0].completed, 1); assert.equal(result.students[0].errors.length, 0);
  assert.equal(f.centralRows('Python提出受付'), 1); assert.equal(f.centralRows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 1);
  const state = query(f, input.requestId);
  assert.equal(state.receipt.state, 'submitted'); assert.equal(state.receipt.score, 1); assert.equal(state.bestScore, 1); assert.equal(state.rating.earned, 1); assert.equal(state.history.length, 1);
  const ack = f.stores().ack.findResult(f.T.actorKey(f.accounts[0]), input.requestId);
  assert.equal(ack.body.collection.keyId, 'synthetic-v1'); assert.match(ack.body.collection.resultHash, /^[a-f0-9]{64}$/);
});

test('collector再実行と同一要求再送は中央/本人ackを二重登録しない', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input); f.collector.run(); f.collector.run(); f.call('submit', input); f.collector.run();
  assert.equal(f.centralRows('Python提出受付'), 1); assert.equal(f.centralRows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 1); assert.equal(f.gradeCalls(), 1);
});

test('中央受付だけ成功/結果失敗ならackせず、次回同じ時刻と全文で続行する', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  f.centralBook.sheets['Python提出結果'].writeFailure = () => ({ after: 0 });
  const first = f.collector.run(); assert.equal(first.students[0].errors.length, 1); assert.equal(f.centralRows('Python提出受付'), 1); assert.equal(f.centralRows('Python提出結果'), 0);
  assert.equal(query(f, input.requestId).receipt.state, 'pending'); assert.equal(f.rows('Python提出完了'), 0);
  f.centralBook.sheets['Python提出結果'].writeFailure = null; f.setNow('2026-10-15T02:00:00.000Z');
  const second = f.collector.run(); assert.equal(second.students[0].completed, 1); assert.equal(f.centralRows('Python提出受付'), 1); assert.equal(f.centralRows('Python提出結果'), 1);
  assert.equal(query(f, input.requestId).receipt.receivedAt, T0); assert.equal(query(f, input.requestId).receipt.late, false);
});

test('中央結果まで成功して本人ack応答消失でも中央重複せず完了を再確認できる', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  const ack = f.bookFor().sheets['Python提出完了']; ack.writeFailure = () => ({ after: 0 });
  f.collector.run(); assert.equal(f.centralRows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 0);
  assert.equal(query(f, input.requestId).receipt.state, 'pending');
  ack.writeFailure = null; f.collector.run();
  assert.equal(f.centralRows('Python提出受付'), 1); assert.equal(f.centralRows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 1);
  assert.equal(query(f, input.requestId).receipt.state, 'submitted');
});

test('中央の別読戻しが不明なら結果行があってもackを出さない', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  const original = f.central.findResult; f.central.findResult = () => { throw Error('readback lost'); };
  f.collector.run(); assert.equal(f.centralRows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 0);
  f.central.findResult = original; f.collector.run(); assert.equal(f.rows('Python提出完了'), 1); assert.equal(f.centralRows('Python提出結果'), 1);
});

test('締切内の1問最高点を採用し、締切後高得点は履歴だけに残す', () => {
  const f = fixture(), low = f.submission('# start\nx = 2\nprint("different")\n# end', 'different\n');
  const first = f.call('submit', low); assert.ok(first.provisional.score < 1); f.collector.run();
  f.setNow('2026-10-15T02:00:00.000Z'); const late = f.submission(); f.call('submit', late); f.collector.run();
  const result = query(f, late.requestId);
  assert.equal(result.receipt.score, 1); assert.equal(result.receipt.late, true); assert.equal(result.bestScore, first.provisional.score);
  assert.equal(result.history.length, 2); assert.equal(result.history.filter(h => h.late).length, 1);
});

test('同じ問の再提出履歴を保持し、締切内の高い結果で★を更新する', () => {
  const f = fixture(), low = f.submission('# start\nx=1\n# end', '');
  f.call('submit', low); f.collector.run(); const high = f.submission(); f.call('submit', high); f.collector.run();
  const result = query(f, high.requestId); assert.equal(result.bestScore, 1); assert.equal(result.history.length, 2); assert.equal(result.rating.earned, 1);
  assert.equal(f.centralRows('Python提出受付'), 2); assert.equal(f.centralRows('Python提出結果'), 2);
});

test('40生徒を5名ずつcursorで再開し、署名改竄1人でも残り全員を集約する', () => {
  const f = fixture({ students: 40 });
  for (const account of f.accounts) f.call('submit', f.submission(), account);
  const bad = f.bookFor(f.accounts[0]).sheets['Python提出結果']; bad.getRange(2, 9, 1, 1).setValues([['0'.repeat(64)]]);
  const seen = new Set(); let errors = 0;
  for (let i = 0; i < 8; i++) {
    const report = f.collector.run({ maxStudents: 5 });
    assert.equal(report.students.length, 5); report.students.forEach(s => { seen.add(s.actorKey); errors += s.errors.length; });
  }
  assert.equal(seen.size, 40); assert.equal(errors, 1); assert.equal(f.centralRows('Python提出結果'), 39);
  assert.equal(f.rows('Python提出完了', f.accounts[0]), 0); assert.equal(f.rows('Python提出完了', f.accounts[39]), 1);
});

test('採点未完了の古い要求が多数あっても個人内cursorで後続を集約する', () => {
  const f = fixture(), table = f.bookFor().sheets['Python提出結果']; table.writeFailure = () => ({ after: 0 });
  for (let i = 0; i < 4; i++) assert.throws(() => f.call('submit', f.submission()));
  table.writeFailure = null; const ready = f.submission(); f.call('submit', ready);
  for (let i = 0; i < 3; i++) f.collector.run({ maxReceiptsPerStudent: 2 });
  assert.equal(query(f, ready.requestId).receipt.state, 'submitted'); assert.equal(f.centralRows('Python提出結果'), 1);
});

test('同期待ち/世代差し替え/中央採用版差異では中央へ記録せず停止する', () => {
  let f = fixture(), input = f.submission(); f.call('submit', input); f.meta.expiresAt = Date.parse(T0);
  assert.throws(() => f.collector.run(), errorCode('packages_expired')); assert.equal(f.centralRows('Python提出受付'), 0);
  f = fixture(); input = f.submission(); f.call('submit', input);
  const original = f.central.findSnapshot; f.central.findSnapshot = q => ({ ...original(q), payloadHash: '0'.repeat(64) });
  const report = f.collector.run(); assert.equal(report.students[0].errors[0].code, 'collector_snapshot_mismatch'); assert.equal(f.centralRows('Python提出受付'), 0);
});

test('本人GSS/中央GSSの所有者と中央の編集者/閲覧者を教員allowlistで検証する', () => {
  let f = fixture(); f.call('submit', f.submission()); f.bookFor().owner = f.accounts[0];
  assert.equal(f.collector.run().students[0].errors[0].code, 'collector_owner_mismatch'); assert.equal(f.centralRows('Python提出結果'), 0);
  for (const field of ['editors', 'viewers']) {
    f = fixture(); f.call('submit', f.submission()); f.centralBook[field].push(f.accounts[0]);
    assert.throws(() => f.collector.run(), errorCode('collector_central_acl_unverified')); assert.equal(f.centralRows('Python提出受付'), 0);
  }
});

test('教員effective本人・collectorフラグ・ScriptLockが揃わなければ動かない', () => {
  let f = fixture(); f.collectorIdentity.active = f.accounts[0]; f.collectorIdentity.effective = f.accounts[0]; assert.throws(() => f.collector.run(), errorCode('sync_not_allowed'));
  f = fixture(); f.collectorIdentity.active = ''; assert.throws(() => f.collector.run(), errorCode('sync_not_allowed'));
  f = fixture(); f.config.studentGrading.collectorEnabled = false; assert.throws(() => f.collector.run(), errorCode('collector_disabled'));
  f = fixture(); f.lockState.held = true; assert.throws(() => f.collector.run(), errorCode('collector_busy'));
});

test('旧版は対応する中央採用版で集約し、当時の期限で正式化する', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  const newer = json(f.snapshotBody); newer.question.version = 'v2'; newer.rules.q1.rules[0].keyword = 'different'; f.freeze(newer);
  f.assignments[0].enabled = false; f.assignments[0].dueAt = '2026-10-15T00:00:01.000Z';
  f.setNow('2026-10-15T02:00:00.000Z'); f.collector.run();
  const result = query(f, input.requestId); assert.equal(result.receipt.state, 'submitted'); assert.equal(result.receipt.version, 'v1'); assert.equal(result.receipt.dueAt, DUE); assert.equal(result.receipt.score, 1);
});

test('collector/installerの公開RPCなし、Drive依存/trigger実作成はない', () => {
  const source = readFileSync(new URL('../store/33_grading_collection.js', import.meta.url), 'utf8');
  assert.match(source, /function runToolsGradingCollectionV1_\(/); assert.match(source, /function installToolsGradingCollectionTriggerV1_\(/);
  assert.ok(!source.includes('DriveApp')); assert.ok(!source.includes('function runToolsGradingCollectionV1('));
});

test('候補installerは明示確認を要求し、自分のUIDを冪等記録する（fake triggerのみ）', () => {
  const f = fixture();
  assert.throws(() => f.collector.installTrigger({ minutes: 1, confirmation: 'wrong' }), errorCode('sync_invalid_config'));
  assert.equal(f.triggers.length, 0);
  const input = { minutes: 1, confirmation: 'INSTALL_TOOLS_GRADING_COLLECTION_TRIGGER_V1' };
  const result = f.collector.installTrigger(input); assert.equal(result.state, 'installed'); assert.equal(f.triggers.length, 1);
  assert.equal(f.collector.installTrigger(input).state, 'existing'); assert.equal(f.triggers.length, 1);
});

test('登録済みcreator UIDのteacher triggerだけactive空を許し、他UID/他handlerを拒否する', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  const result = f.collector.installTrigger({ minutes: 1, confirmation: 'INSTALL_TOOLS_GRADING_COLLECTION_TRIGGER_V1' });
  f.collectorIdentity.active = '';
  assert.throws(() => f.collector.run({}, { triggerUid: 'forged' }), errorCode('sync_not_allowed'));
  const report = f.collector.run({}, { triggerUid: result.uid }); assert.equal(report.students[0].completed, 1);
  const record = JSON.parse(f.properties.getProperty('TOOLS_GRADING_COLLECTION_TRIGGER_V1')); record.handler = 'syncToolsGradingPackages_';
  f.properties.setProperty('TOOLS_GRADING_COLLECTION_TRIGGER_V1', JSON.stringify(record));
  assert.throws(() => f.collector.run({}, { triggerUid: result.uid }), errorCode('sync_not_allowed'));
});

test('LAST_RUNは機密値を含まない8KB未満の集計、teacher inspectで確認できる', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input); f.collector.run();
  const status = f.collector.inspect(), last = status.lastRun;
  assert.equal(last.state, 'ok'); assert.equal(last.processedStudents, 1); assert.equal(last.completed, 1); assert.equal(last.waitingGrade, 0); assert.equal(last.failedStudents, 0);
  assert.equal(last.nextCursor, 0); assert.ok(last.durationMs >= 0); assert.equal(last.at, T0);
  const raw = f.properties.getProperty(f.ctx.ToolsGradingCollection.statusProperty);
  assert.ok(Buffer.byteLength(raw, 'utf8') < 8000);
  for (const secret of [f.accounts[0], f.config.studentGrading.signingKey, input.code, f.T.actorKey(f.accounts[0])]) assert.ok(!raw.includes(secret));
  f.config.studentGrading.collectorEnabled = false; assert.equal(f.collector.inspect().collectorEnabled, false);
});

test('LAST_RUNは個人エラー/採点待ち/中央ACL停止を集計し、停止理由を残す', () => {
  let f = fixture({ students: 2 });
  f.call('submit', f.submission(), f.accounts[0]); f.call('submit', f.submission(), f.accounts[1]);
  f.bookFor(f.accounts[0]).sheets['Python提出結果'].getRange(2, 9, 1, 1).setValues([['0'.repeat(64)]]);
  f.collector.run(); const partial = f.collector.inspect().lastRun;
  assert.equal(partial.state, 'partial_error'); assert.equal(partial.failedStudents, 1); assert.equal(partial.completed, 1); assert.equal(partial.errorCodes.storage_ambiguous, 1);
  f = fixture(); f.call('submit', f.submission()); f.centralBook.viewers.push(f.accounts[0]);
  assert.throws(() => f.collector.run(), errorCode('collector_central_acl_unverified'));
  const blocked = f.collector.inspect().lastRun; assert.equal(blocked.state, 'failed'); assert.equal(blocked.processedStudents, 0); assert.equal(blocked.errorCodes.collector_central_acl_unverified, 1);
});

test('LAST_RUN記録失敗のtyped errorで既に保存済みの中央結果/署名ackを巻き戻さない', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  const original = f.properties.setProperty;
  f.properties.setProperty = (key, value) => { if (key === f.ctx.ToolsGradingCollection.statusProperty) throw Error('status storage unavailable'); return original(key, value); };
  assert.throws(() => f.collector.run(), errorCode('collector_status_write_failed'));
  assert.equal(f.centralRows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 1); assert.equal(query(f, input.requestId).receipt.state, 'submitted');
  f.properties.setProperty = original; f.collector.run(); assert.equal(f.collector.inspect().lastRun.state, 'ok'); assert.equal(f.centralRows('Python提出結果'), 1);
});

test('teacher以外はLAST_RUNを照会できず、未知fieldや機密値入りのstatusを公開しない', () => {
  const f = fixture(); f.collector.run();
  const raw = JSON.parse(f.properties.getProperty(f.ctx.ToolsGradingCollection.statusProperty)); raw.privateNote = 'do not expose';
  f.properties.setProperty(f.ctx.ToolsGradingCollection.statusProperty, JSON.stringify(raw)); assert.throws(() => f.collector.inspect(), errorCode('collector_status_invalid'));
  f.collectorIdentity.active = f.accounts[0]; f.collectorIdentity.effective = f.accounts[0]; assert.throws(() => f.collector.inspect(), errorCode('sync_not_allowed'));
});
