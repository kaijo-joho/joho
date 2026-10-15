import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './store-fixture.mjs';

const id = n => n.toString(16).padStart(32, '0');
const q = { tool: 'python', questionId: 'demo-q1', version: 'v1' };
const errorCode = expected => error => error.toolsStoreCode === expected;
const plain = value => JSON.parse(JSON.stringify(value));

test('本人のsessionだけ確立し、構成を変更せずUserLockを解放する', () => {
  const f = setup(), session = f.call('session');
  assert.equal(session.actorKey, f.T.actorKey('student@example.test'));
  assert.equal(session.schemaVersion, 1);
  assert.equal(f.data.writes.length + f.history.writes.length, 0);
  assert.equal(f.locks.acquisitions, 1); assert.equal(f.locks.releases, 1);
});
test('無効既定・別の本人・教員実行・別origin・認証期限を拒否する', () => {
  const f = setup();
  f.config.enabled = false; assert.throws(() => f.call('session'), errorCode('disabled')); f.config.enabled = true;
  const other = f.issue({ account: 'different@example.test' });
  assert.throws(() => f.call('session', {}, other), errorCode('account_mismatch'));
  f.identity.effective = 'teacher@example.test';
  assert.throws(() => f.call('session'), errorCode('execution_mode_mismatch')); f.identity.effective = f.identity.active;
  assert.throws(() => f.call('session', {}, f.binding, 'https://wrong.example'), errorCode('origin_denied'));
  f.advance(3600000); assert.throws(() => f.call('session'), errorCode('binding_expired'));
});
test('古い世代・upgrading・退役・別所有者・別生徒のGSSを拒否する', () => {
  const f = setup();
  f.guide.getRange(3, 2).setValues([['b'.repeat(32)]]);
  assert.throws(() => f.call('session'), errorCode('binding_stale'));
  f.guide.getRange(3, 2).setValues([['a'.repeat(32)]]);
  for (const state of ['upgrading', 'retired']) {
    f.guide.getRange(4, 2).setValues([[state]]); assert.throws(() => f.call('session'), errorCode('store_inactive'));
  }
  f.guide.getRange(4, 2).setValues([['active']]);
  f.guide.getRange(2, 2).setValues([['c'.repeat(64)]]); assert.throws(() => f.call('session'), errorCode('account_mismatch'));
  f.guide.getRange(2, 2).setValues([[f.T.actorKey(f.identity.active)]]);
  f.config.teacherOwners = ['other-teacher@example.test']; assert.throws(() => f.call('session'), errorCode('owner_mismatch'));
  assert.equal(f.locks.acquisitions, f.locks.releases);
});
test('編集権限を失った保存先へは接続済みと表示せず、保存要求も止める', () => {
  const f = setup(); f.dependencies.canEdit = () => false;
  assert.throws(() => f.call('session'), errorCode('permission_denied'));
  assert.throws(() => f.save(), errorCode('permission_denied'));
  assert.equal(f.data.writes.length, 0);
});
test('本番側の所有者/編集者照合はSpreadsheetサービスだけで行いDriveスコープを求めない', () => {
  const f = setup(), deps = { ...f.dependencies }; delete deps.owner; delete deps.canEdit;
  const service = f.context.ToolsStoreService.create(f.config, deps);
  assert.equal(service.call('session', {}, f.binding, f.config.allowedOrigins[0]).schemaVersion, 1);
  f.book.getEditors = () => [];
  assert.throws(() => service.call('session', {}, f.binding, f.config.allowedOrigins[0]), errorCode('permission_denied'));
});
test('教員限定meta/header保護・生徒書込範囲・隠し状態を検査する', () => {
  const cases = [
    f => { f.guide.protections = []; },
    f => { f.data.protections = []; },
    f => { f.history.protections = []; },
    f => { f.guide.protections[0].isWarningOnly = () => true; },
    f => { f.data.protections[0].canEdit = () => true; }
  ];
  for (const mutate of cases) { const f = setup(); mutate(f); assert.throws(() => f.call('session'), errorCode('protection_mismatch')); }
  const f = setup(); f.data.protectRange(2, 1, 10, 14); assert.throws(() => f.call('session'), errorCode('body_not_editable'));
  const visible = setup(); visible.data.hidden = false; assert.throws(() => visible.call('session'), errorCode('schema_mismatch'));
  const warning = setup(); warning.data.protectRange(2, 1, 1024, 14, { warning: true }); assert.equal(warning.call('session').schemaVersion, 1);
});
test('余分な空列は許可し、ヘッダ改変や式・行範囲逸脱は拒否する', () => {
  const f = setup(); f.data.columns = 26; assert.equal(f.call('session').schemaVersion, 1);
  f.data.getRange(1, 15).setValues([['unexpected']]); assert.throws(() => f.call('session'), errorCode('schema_mismatch'));
  const formula = setup(); formula.guide.getRange(1, 2).setValues([['=1']]); assert.throws(() => formula.call('session'), errorCode('schema_mismatch'));
  const out = setup(); out.data.getRange(out.C.DRAFT_ROWS + 1, 1).setValues([['unexpected']]); assert.throws(() => out.call('session'), errorCode('schema_mismatch'));
});
test('同一生徒の重複実行はbusy、他生徒のロックを共有しない', () => {
  const f = setup(); f.locks.denied = true;
  assert.throws(() => f.save(), errorCode('busy'));
  assert.equal(f.data.writes.length, 0);
  assert.equal(f.locks.releases, 0);
});
test('全文・stdin・フォルダをCAS保存し、一覧は本文を返さず復元は全文を返す', () => {
  const f = setup();
  const first = f.save({ folder: '授業/練習', code: 'name = input("名前: ")\nprint(name)', stdin: '海城' });
  assert.equal(first.state, 'saved'); assert.equal(first.draft.seq, 1);
  const restored = f.call('getDraft', q);
  assert.equal(restored.draft.code, first.draft.code); assert.equal(restored.draft.stdin, '海城');
  const listed = f.call('listDrafts', { tool: 'python' });
  assert.equal(listed.drafts.length, 1); assert.equal(listed.drafts[0].folder, '授業/練習'); assert.equal('code' in listed.drafts[0], false);
  const second = f.save({ expectedRevision: first.draft.revision, code: 'print(2)' });
  assert.equal(second.draft.seq, 2); assert.notEqual(second.draft.revision, first.draft.revision);
  assert.equal(f.call('getDraft', q).draft.code, 'print(2)');
});
test('別端末/古いブラウザの同時保存は競合し、初回接続未取得のnullで上書きできない', () => {
  const f = setup(), first = f.save();
  const conflict = f.save({ clientId: 'c'.repeat(32), code: 'older local work' });
  assert.equal(conflict.state, 'conflict'); assert.equal(conflict.draft.revision, first.draft.revision);
  assert.equal(f.call('getDraft', q).draft.code, 'print(1)');
});
test('版ごとに独立保存し、旧版を新版で上書きしない', () => {
  const f = setup(); f.save({ code: 'old version' }); f.save({ version: 'v2', code: 'new version' });
  assert.equal(f.call('getDraft', q).draft.code, 'old version');
  assert.equal(f.call('getDraft', { ...q, version: 'v2' }).draft.code, 'new version');
  assert.equal(f.call('listDrafts', { tool: 'python' }).drafts.length, 2);
});
test('20万字のcode/stdin・サロゲート境界・数式先頭を欠落/式実行なしで往復する', () => {
  const f = setup();
  const code = 'x'.repeat(44999) + '🐍' + 'y'.repeat(200000 - 45001);
  const stdin = '=HYPERLINK("https://invalid.example")\n' + 'z'.repeat(200000 - 36);
  // 固定長を保ち、セル境界がサロゲート対の途中になるようにする。
  const actualStdin = stdin.slice(0, 200000).padEnd(200000, 'z');
  const first = f.save({ code, stdin: actualStdin, title: '=1+2', folder: '=folder' });
  const restored = f.call('getDraft', q);
  assert.equal(restored.draft.code, code); assert.equal(restored.draft.stdin, actualStdin);
  assert.equal(first.draft.code.length, 200000);
  for (const sheet of [f.data, f.history]) for (const value of sheet.cells.values()) {
    if (typeof value === 'string') { assert.equal(value.startsWith('='), false); assert.equal(value.length <= 45002, true); }
  }
});
test('上限超過/不正ID/未指定CAS/toolは書込前に拒否する', () => {
  const f = setup();
  for (const override of [{ code: 'x'.repeat(200001) }, { stdin: 'x'.repeat(200001) }, { requestId: 'invalid' }, { expectedRevision: undefined }, { tool: 'html' }, { questionId: 'bad\nkey' }, { preserveRevision: 'd'.repeat(32) }]) {
    assert.throws(() => f.save(override), error => ['invalid_request', 'invalid_tool'].includes(error.toolsStoreCode));
  }
  assert.equal(f.data.writes.length, 0);
});
test('応答消失後に同じimmutable要求を再送/照会してもseqや履歴を増やさない', () => {
  const f = setup(), requestId = id(5000), input = { requestId, code: 'accepted but response lost' };
  const first = f.save(input), writes = f.data.writes.length, rows = f.history.getLastRow();
  const retry = f.save(input), lookup = f.call('lookupSave', { tool: 'python', requestId });
  assert.equal(retry.state, 'saved'); assert.equal(retry.duplicate, true); assert.equal(retry.draft.revision, first.draft.revision);
  assert.equal(lookup.draft.codeHash, f.T.hash(input.code)); assert.equal('code' in lookup.draft, false);
  assert.equal(f.data.writes.length, writes); assert.equal(f.history.getLastRow(), rows);
  assert.throws(() => f.save({ ...input, code: 'mutated request' }), errorCode('request_reused'));
});
test('別の小問に同じrequestIdを使うと拒否し、元の受理記録を曖昧にしない', () => {
  const f = setup(), requestId = id(5001); f.save({ requestId });
  assert.throws(() => f.save({ requestId, questionId: 'other-question' }), errorCode('request_reused'));
});
test('古いackは本文でなく証拠metadataを返し、保持範囲外はmissingでCAS競合にする', () => {
  const f = setup(), requestId = id(6000), first = f.save({ requestId }); let prior = first;
  for (let i = 0; i < 3; i++) prior = f.save({ expectedRevision: prior.draft.revision, code: 'edit' + i });
  const old = f.call('lookupSave', { tool: 'python', requestId });
  assert.equal(old.draft.revision, first.draft.revision); assert.equal('code' in old.draft, false);
  for (let i = 0; i < 16; i++) prior = f.save({ expectedRevision: prior.draft.revision, code: 'later' + i });
  assert.equal(f.call('lookupSave', { tool: 'python', requestId }).state, 'missing');
  assert.equal(f.save({ requestId }).state, 'conflict');
});
test('通常autosaveは毎回履歴本文を書かず、5分経過時に直前版をcheckpointする', () => {
  const f = setup(), first = f.save(); let prior = first;
  for (let i = 0; i < 4; i++) { f.advance(20000); prior = f.save({ expectedRevision: prior.draft.revision, code: 'edit' + i }); }
  assert.equal(f.history.getLastRow(), 2);
  const before = prior; f.advance(300001); prior = f.save({ expectedRevision: prior.draft.revision, code: 'after checkpoint' });
  assert.equal(f.history.getLastRow(), 3); assert.equal(prior.checkpoint.revision, before.draft.revision);
  assert.equal(f.call('getDraft', { ...q, revision: before.draft.revision }).draft.code, before.draft.code);
});
test('ローカル採用/端末変更は時間間隔に関係なく直前remoteを保持する', () => {
  const f = setup(), first = f.save(), remote = f.save({ expectedRevision: first.draft.revision, code: 'remote version' });
  const chosen = f.save({ expectedRevision: remote.draft.revision, preserveRevision: remote.draft.revision, code: 'local chosen' });
  assert.equal(chosen.checkpoint.revision, remote.draft.revision);
  assert.equal(f.call('getDraft', { ...q, revision: remote.draft.revision }).draft.code, 'remote version');
  const other = f.save({ expectedRevision: chosen.draft.revision, clientId: 'c'.repeat(32), code: 'loan device edit' });
  assert.equal(other.checkpoint.revision, chosen.draft.revision);
});
test('通常保存の処理は古い履歴索引を全走査しない', () => {
  const f = setup(), first = f.save(); f.history.searches = []; f.history.reads = [];
  f.save({ expectedRevision: first.draft.revision, code: 'second edit' });
  assert.equal(f.history.searches.length, 0); assert.equal(f.history.reads.filter(read => read.row > 1).length, 0);
});
test('本文途中の失敗では前commitの全文が残り、同じ要求の再送で回復する', () => {
  const f = setup(), first = f.save(), requestId = id(7000);
  let once = true;
  f.data.writeFailure = (range, values) => values[0][1] === 'data' && once ? (once = false, { after: 3 }) : null;
  assert.throws(() => f.save({ requestId, expectedRevision: first.draft.revision, code: 'new body' }), errorCode('storage_write_uncertain'));
  assert.equal(f.call('getDraft', q).draft.code, 'print(1)');
  assert.equal(f.call('lookupSave', { tool: 'python', requestId }).state, 'missing');
  f.data.writeFailure = null;
  const recovered = f.save({ requestId, expectedRevision: first.draft.revision, code: 'new body' });
  assert.equal(recovered.draft.seq, 2); assert.equal(f.call('getDraft', q).draft.code, 'new body');
});
test('commit途中の失敗でも前版を保持し、再送でcommitを完了する', () => {
  const f = setup(), first = f.save(), requestId = id(7001);
  let once = true;
  f.data.writeFailure = (range, values) => values[0][1] === 'commit' && once ? (once = false, { after: 2 }) : null;
  assert.throws(() => f.save({ requestId, expectedRevision: first.draft.revision, code: 'not yet committed' }), errorCode('storage_write_uncertain'));
  assert.equal(f.call('getDraft', q).draft.revision, first.draft.revision);
  f.data.writeFailure = null;
  const recovered = f.save({ requestId, expectedRevision: first.draft.revision, code: 'not yet committed' });
  assert.equal(recovered.draft.seq, 2);
});
test('書込が完了してからAPI例外になっても読戻しで受理を確認する', () => {
  const f = setup();
  f.data.writeFailure = () => ({ after: 14 });
  f.history.writeFailure = () => ({ after: 14 });
  assert.equal(f.save().state, 'saved');
  assert.equal(f.call('getDraft', q).draft.seq, 1);
});
test('初回bank途中の失敗は空commitを根拠に同じ問版へ再準備できる', () => {
  const f = setup(), requestId = id(7002);
  let once = true; f.data.writeFailure = (range, values) => values[0][1] === 'data' && once ? (once = false, { after: 1 }) : null;
  assert.throws(() => f.save({ requestId }), errorCode('storage_write_uncertain'));
  f.data.writeFailure = null;
  assert.equal(f.save({ requestId }).state, 'saved');
});
test('履歴の部分書込では直前remoteを消さず、再送で履歴保持を完了する', () => {
  const f = setup(), first = f.save(), remote = f.save({ expectedRevision: first.draft.revision, code: 'remote never discarded' }), requestId = id(7003);
  let once = true;
  f.history.writeFailure = () => once ? (once = false, { after: 3 }) : null;
  const input = { requestId, expectedRevision: remote.draft.revision, preserveRevision: remote.draft.revision, code: 'local choice' };
  assert.throws(() => f.save(input), errorCode('storage_write_uncertain'));
  assert.equal(f.call('getDraft', q).draft.code, 'remote never discarded');
  f.history.writeFailure = null; f.save(input);
  assert.equal(f.call('getDraft', { ...q, revision: remote.draft.revision }).draft.code, 'remote never discarded');
});
test('両bankが壊れた場合は新規扱いせず、復元・上書きを停止する', () => {
  const f = setup(), first = f.save();
  for (const [key, value] of f.data.cells) if (key.endsWith(',5') && !key.startsWith('1,') && typeof value === 'string') f.data.cells.set(key, 'j:corrupted');
  assert.throws(() => f.call('getDraft', q), errorCode('storage_incomplete'));
  assert.throws(() => f.save({ expectedRevision: first.draft.revision }), errorCode('storage_incomplete'));
});
test('不明フィールドや文字列以外の表示項目はGSSに到達する前に拒否する', () => {
  const f = setup();
  for (const [action, input] of [['session', { spreadsheetId: 'arbitrary' }], ['listDrafts', { tool: 'python', account: 'other' }], ['getDraft', { ...q, origin: 'spoof' }], ['lookupSave', { tool: 'python', requestId: id(500), extra: true }]]) {
    assert.throws(() => f.call(action, input), errorCode('invalid_request'));
  }
  for (const override of [{ unexpected: true }, { setId: false }, { title: 0 }, { folder: [] }, { folder: 'x'.repeat(301) }]) assert.throws(() => f.save(override), errorCode('invalid_request'));
  assert.equal(f.data.writes.length, 0);
});
test('処理の途中で教員が更新中にした場合もcommit前に停止する', () => {
  const f = setup(), first = f.save();
  f.data.writeFailure = (range, values) => {
    if (values[0][1] === 'data') f.guide.getRange(4, 2).setValues([['upgrading']]);
    return null;
  };
  assert.throws(() => f.save({ expectedRevision: first.draft.revision, code: 'never committed while upgrading' }), errorCode('store_inactive'));
  f.data.writeFailure = null; f.guide.getRange(4, 2).setValues([['active']]);
  assert.equal(f.call('getDraft', q).draft.code, first.draft.code);
});
test('専用フォルダ列は式安全な文字列で保存し、不整合を正常復元しない', () => {
  const f = setup(); f.save({ folder: '=授業' });
  const folders = [...f.data.cells.entries()].filter(([key]) => key.endsWith(',4') && !key.startsWith('1,'));
  assert.equal(folders.some(([, value]) => value === 'j:=授業'), true);
  for (const [key] of folders) f.data.cells.set(key, 'j:different folder');
  assert.throws(() => f.call('getDraft', q), errorCode('storage_incomplete'));
});
test('40名の合成同時利用は別UserLock・別GSSへ分散し、相互の本文を返さない', async () => {
  const students = Array.from({ length: 40 }, (_, i) => setup({ account: `student${i}@example.test` }));
  const accepted = await Promise.all(students.map(async (f, i) => f.save({ code: `print(${i})` })));
  for (let i = 0; i < students.length; i++) {
    const f = students[i]; assert.equal(accepted[i].state, 'saved'); assert.equal(f.call('getDraft', q).draft.code, `print(${i})`);
    assert.equal(f.locks.acquisitions, f.locks.releases); assert.equal(f.locks.held, false);
    const other = f.issue({ account: `student${(i + 1) % 40}@example.test` });
    assert.throws(() => f.call('getDraft', q, other), errorCode('account_mismatch'));
  }
  assert.equal(new Set(accepted.map((_, i) => students[i].call('session').actorKey)).size, 40);
});
