import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, DUE, T0, json } from './student-grading-fixture.mjs';
const errorCode = code => error => (error.toolsStoreCode || error.pythonEditorCode) === code;

test('本人GSSへ受付と採点を署名保存するが、中央ack前はpendingで正式得点を返さない', () => {
  const f = fixture(), input = f.submission(), result = f.call('submit', input);
  assert.equal(result.receipt.state, 'pending'); assert.equal(result.receipt.score, null);
  assert.equal(result.provisional.state, 'graded_waiting_collection'); assert.equal(result.provisional.score, 1);
  assert.equal(result.bestScore, null); assert.equal(result.rating.earned, null); assert.equal(result.history.length, 0);
  assert.equal(f.rows('Python提出受付'), 1); assert.equal(f.rows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 0);
  assert.equal(f.centralRows('Python提出受付'), 0); assert.equal(f.centralRows('Python提出結果'), 0);
  assert.equal(f.gradeCalls(), 1);
});

test('再送とresumeは同じ要求・署名採点結果を再利用し二重登録/再採点しない', () => {
  const f = fixture(), input = f.submission();
  f.call('submit', input); f.call('submit', input); f.call('resumeSubmission', { requestId: input.requestId });
  assert.equal(f.rows('Python提出受付'), 1); assert.equal(f.rows('Python提出結果'), 1); assert.equal(f.gradeCalls(), 1);
  const changed = f.submission('# start\nprint(3)\n# end', '', input.requestId);
  assert.throws(() => f.call('submit', changed), errorCode('request_conflict'));
});

test('クライアント点数/採点基準/他人ID/未知項目を受理しない', () => {
  const f = fixture();
  for (const extra of [{ score: 1 }, { rules: [] }, { actorKey: 'a'.repeat(64) }, { spreadsheetId: 'fake' }]) {
    assert.throws(() => f.call('submit', { ...f.submission(), ...extra }), errorCode('invalid_request'));
  }
  const input = f.submission(); input.run.score = 1;
  assert.throws(() => f.call('submit', input), errorCode('invalid_request'));
  assert.equal(f.rows('Python提出受付'), 0);
});

test('到着時刻は認証/採点待ちより前のserver captured時刻、未受付の再試行は新到着時刻', () => {
  const f = fixture(); f.setNow('2026-10-15T01:10:00.000Z');
  const onTime = f.call('submit', f.submission(), undefined, DUE);
  assert.equal(onTime.receipt.receivedAt, DUE); assert.equal(onTime.receipt.late, false);
  const late = f.call('submit', f.submission()); assert.equal(late.receipt.late, true);
  assert.equal(late.receipt.receivedAt, '2026-10-15T01:10:00.000Z');
});

test('受付前書込失敗は署名intakeTicketを返し、同一全文だけ元到着時刻で再送できる', () => {
  const f = fixture(), input = f.submission(), table = f.bookFor().sheets['Python提出受付']; f.setNow(DUE);
  table.writeFailure = () => ({ after: 0 });
  let ticket;
  try { f.call('submit', input, undefined, DUE); assert.fail('must fail'); } catch (error) { ticket = error.intakeTicket; assert.ok(ticket); }
  table.writeFailure = null; f.setNow('2026-10-15T01:10:00.000Z');
  const result = f.call('submit', { ...input, intakeTicket: ticket });
  assert.equal(result.receipt.receivedAt, DUE); assert.equal(result.receipt.late, false);
  const wrong = f.submission('# start\nprint(4)\n# end', '', 'f'.repeat(32));
  assert.throws(() => f.call('submit', { ...wrong, intakeTicket: ticket }), errorCode('request_conflict'));
});

test('採点表への書込失敗では受付を保持し、締切後resumeでも元の時刻で再処理する', () => {
  const f = fixture(), input = f.submission(), table = f.bookFor().sheets['Python提出結果'];
  table.writeFailure = () => ({ after: 0 });
  assert.throws(() => f.call('submit', input), errorCode('storage_write_failed'));
  assert.equal(f.rows('Python提出受付'), 1); assert.equal(f.rows('Python提出結果'), 0);
  table.writeFailure = null; f.setNow('2026-10-15T02:00:00.000Z');
  const result = f.call('resumeSubmission', { requestId: input.requestId });
  assert.equal(result.receipt.receivedAt, T0); assert.equal(result.receipt.late, false); assert.equal(result.provisional.score, 1);
});

test('本人binding/registry/名簿の不一致や同期期限切れを拒否', () => {
  let f = fixture({ students: 2 }), context = f.context(); context.actorKey = f.T.actorKey(f.accounts[1]);
  assert.throws(() => f.student.call('submit', f.submission(), context), errorCode('grading_context_invalid'));
  f = fixture(); context = f.context(); f.registry[0].spreadsheetId = 'different_synthetic_book_0001';
  assert.throws(() => f.student.call('submit', f.submission(), context), errorCode('grading_registry_mismatch'));
  f = fixture(); delete f.actors[f.T.actorKey(f.accounts[0])];
  assert.throws(() => f.call('submit', f.submission()), errorCode('grading_not_allowed'));
  f = fixture(); f.meta.expiresAt = Date.parse(T0);
  assert.throws(() => f.call('submit', f.submission()), errorCode('packages_expired'));
});

test('ローカル採点行を完了表へコピーしてもHMAC domainが違うため正式点数にならない', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  const book = f.bookFor(), local = book.sheets['Python提出結果'], ack = book.sheets['Python提出完了'];
  ack.getRange(2, 1, 1, 34).setValues(local.getRange(2, 1, 1, 34).getValues());
  assert.throws(() => f.call('getSubmission', { requestId: input.requestId }), errorCode('storage_ambiguous'));
  assert.equal(f.centralRows('Python提出結果'), 0);
});

test('署名受付のコード・出力・締切・時刻・SHA差替えは検知する', () => {
  for (const change of [row => row[7] = DUE, row => row[8] = '0'.repeat(64), row => { const m = JSON.parse(row[9]); m.policy.dueAt = '2026-10-16T01:00:00.000Z'; row[9] = JSON.stringify(m); },
    row => row[10] = row[10].replace('value:', 'changed:')]) {
    const f = fixture(), input = f.submission(); f.call('submit', input);
    const s = f.bookFor().sheets['Python提出受付'], row = s.getRange(2, 1, 1, 34).getValues()[0]; change(row); s.getRange(2, 1, 1, 34).setValues([row]);
    assert.throws(() => f.call('getSubmission', { requestId: input.requestId }), errorCode('storage_ambiguous'));
  }
});

test('別生徒の署名行をコピーしてもactor/GSSID結合で拒否する', () => {
  const f = fixture({ students: 2 }), input = f.submission(); f.call('submit', input, f.accounts[0]);
  const first = f.bookFor(f.accounts[0]), second = f.bookFor(f.accounts[1]);
  for (const name of ['Python提出受付', 'Python提出結果']) second.sheets[name].getRange(2, 1, 1, 34).setValues(first.sheets[name].getRange(2, 1, 1, 34).getValues());
  const state = f.call('getSubmission', { requestId: input.requestId }, f.accounts[1]);
  assert.equal(state.receipt, null); assert.equal(f.rows('Python提出完了', f.accounts[1]), 0);
});

test('gradingSessionは同期済採用版だけ返し、秘密の採点基準/名簿/registryを返さない', () => {
  const f = fixture(), result = f.call('gradingSession', {});
  assert.equal(result.catalog.sets.length, 1); assert.equal(result.policies.length, 1); assert.equal(result.ratings[0].rating.earned, null);
  const encoded = JSON.stringify(result); assert.ok(!encoded.includes('keywordsArr')); assert.ok(!encoded.includes('signingKey')); assert.ok(!encoded.includes('synthetic_student_grading_book'));
  assert.equal(result.account, f.accounts[0]);
});

test('40人は別GSSへそれぞれ1受付/1採点を保存し、共有centralへの書込はない', async () => {
  const f = fixture({ students: 40 });
  const result = await Promise.all(f.accounts.map(account => Promise.resolve().then(() => f.call('submit', f.submission(), account))));
  assert.equal(result.length, 40); assert.ok(result.every(r => r.receipt.state === 'pending' && r.provisional.score === 1));
  for (const account of f.accounts) { assert.equal(f.rows('Python提出受付', account), 1); assert.equal(f.rows('Python提出結果', account), 1); }
  assert.equal(f.centralRows('Python提出受付'), 0); assert.equal(f.centralRows('Python提出結果'), 0);
});

test('旧版受付は同期済み当時問題・採点基準・当時期限でresumeする', () => {
  const f = fixture(), input = f.submission(), table = f.bookFor().sheets['Python提出結果'];
  table.writeFailure = () => ({ after: 0 }); assert.throws(() => f.call('submit', input)); table.writeFailure = null;
  f.assignments[0].enabled = false; f.assignments[0].dueAt = '2026-10-15T00:00:01.000Z';
  const bodyV2 = json(f.snapshotBody); bodyV2.question.version = 'v2'; bodyV2.rules.q1.rules[0].keyword = 'never'; f.freeze(bodyV2);
  f.setNow('2026-10-15T02:00:00.000Z');
  const result = f.call('resumeSubmission', { requestId: input.requestId });
  assert.equal(result.receipt.version, 'v1'); assert.equal(result.receipt.dueAt, DUE); assert.equal(result.provisional.score, 1);
});

test('無効・固定見出し/保護/非表示不備なら採点表を作成/増設せず停止する', () => {
  let f = fixture(); f.config.studentGrading.enabled = false;
  assert.throws(() => f.call('submit', f.submission()), errorCode('grading_disabled'));
  f = fixture(); f.bookFor().sheets['Python提出結果'].protections = [];
  assert.throws(() => f.call('submit', f.submission()), errorCode('grading_storage_not_ready'));
  f = fixture(); f.bookFor().sheets['Python提出完了'].hidden = false;
  assert.throws(() => f.call('submit', f.submission()), errorCode('grading_storage_not_ready'));
});

test('生徒が手動で空行を増やしても事前確保2048件を超えて採点行を書き足さない', () => {
  const f = fixture(), table = f.bookFor().sheets['Python提出受付'];
  table.rows = 5000; table.getRange(2049, 1, 1, 1).setValues([['occupied synthetic row']]);
  assert.throws(() => f.call('submit', f.submission()), errorCode('grading_storage_full'));
  assert.equal(table.getLastRow(), 2049); assert.equal(table.getRange(2050, 1, 1, 1).getValues()[0][0], '');
});

test('UserLock前prepareIntakeは書込せずstring proofを発行しbusy後も元到着を維持する', () => {
  const f = fixture(), input = f.submission(); f.setNow(DUE);
  const proof = f.student.prepareIntake(input, f.context(undefined, DUE));
  assert.equal(typeof proof, 'string'); assert.ok(proof.length < 8000);
  assert.equal(f.rows('Python提出受付'), 0); assert.equal(f.rows('Python提出結果'), 0);
  f.setNow('2026-10-15T01:10:00.000Z');
  const again = f.student.prepareIntake({ ...input, intakeTicket: proof }, f.context()); assert.equal(again, proof);
  const result = f.call('submit', { ...input, intakeTicket: proof });
  assert.equal(result.receipt.receivedAt, DUE); assert.equal(result.receipt.late, false);
});

test('prepareIntakeの再利用でも本人/要求/コード/出力/期限の変更を許さない', () => {
  const f = fixture({ students: 2 }), input = f.submission(), proof = f.student.prepareIntake(input, f.context());
  const changed = f.submission('# start\nprint(3)\n# end', '', input.requestId);
  assert.throws(() => f.student.prepareIntake({ ...changed, intakeTicket: proof }, f.context()), errorCode('request_conflict'));
  assert.throws(() => f.student.prepareIntake({ ...input, intakeTicket: proof }, f.context(f.accounts[1])), errorCode('invalid_input'));
  const altered = JSON.parse(proof); altered.payload.receivedAt = '2026-10-15T00:00:01.000Z';
  assert.throws(() => f.student.prepareIntake({ ...input, intakeTicket: JSON.stringify(altered) }, f.context()), errorCode('invalid_input'));
  assert.equal(f.rows('Python提出受付'), 0);
});

test('既に受付済みのprepareIntakeは新policy変更後も原版/原期限/元到着で照会する', () => {
  const f = fixture(), input = f.submission(); f.call('submit', input);
  f.assignments[0].enabled = false; f.assignments[0].dueAt = '2026-10-15T00:00:01.000Z'; f.setNow('2026-10-15T02:00:00.000Z');
  const proof = f.student.prepareIntake(input, f.context()), payload = JSON.parse(proof).payload;
  assert.equal(payload.receivedAt, T0);
  const original = f.stores().local.findRequest(f.T.actorKey(f.accounts[0]), input.requestId);
  assert.equal(payload.policyHash, f.P.hashText(f.P.canonical(original.policy))); assert.equal(original.policy.dueAt, DUE);
});
