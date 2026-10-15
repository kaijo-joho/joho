import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './store-fixture.mjs';

test('新版採点は独立フラグと本人binding/権限/構成を通過してから呼ぶ', () => {
  const f = setup(), calls = [];
  f.dependencies.studentGrading = { prepareIntake() { return 'synthetic-proof'; }, call(...args) { calls.push(args); return { state: 'pending' }; } };
  const input = { requestId: 'b'.repeat(32) };
  assert.throws(() => f.call('submit', input), e => e.toolsStoreCode === 'grading_disabled');
  assert.equal(calls.length, 0);
  f.config.studentGrading = { enabled: true };
  assert.equal(f.call('submit', input).state, 'pending');
  const [action, sent, ctx] = calls[0];
  assert.equal(action, 'submit'); assert.equal(sent, input);
  assert.equal(ctx.account, f.identity.active); assert.equal(ctx.actorKey, f.T.actorKey(ctx.account));
  assert.equal(ctx.binding.spreadsheetId, f.call('session').spreadsheetId);
  assert.equal(ctx.book, f.book); assert.equal(typeof ctx.recheck, 'function');
  f.identity.effective = 'teacher@example.test';
  assert.throws(() => f.call('questionStatus', {}), e => e.toolsStoreCode === 'execution_mode_mismatch');
  assert.equal(calls.length, 1);
});

test('到着時刻はUserLock・認証待ちの前に固定し、失敗してもロックを解放する', () => {
  const f = setup({ config: { studentGrading: { enabled: true } } });
  const expected = new Date(Date.UTC(2026, 9, 15)).toISOString();
  const lock = f.dependencies.lock;
  f.dependencies.lock = () => { f.advance(120000); return lock(); };
  f.dependencies.studentGrading = { prepareIntake(_input, ctx) { assert.equal(ctx.receivedAt, expected); return 'signed-first-arrival'; }, call(_a, _i, ctx) { assert.equal(ctx.receivedAt, expected); throw new Error('synthetic failure'); } };
  assert.throws(() => f.call('submit', {}), e => e.toolsStoreCode === 'service_unavailable' && e.intakeTicket === 'signed-first-arrival' && !e.message.includes('synthetic failure'));
  assert.equal(f.locks.acquisitions, 1); assert.equal(f.locks.releases, 1);
});

test('到着証明発行後のSheets例外でも、内部文面を隠して元時刻の証明を保持する', () => {
  const f = setup({ config: { studentGrading: { enabled: true } } });
  f.dependencies.studentGrading = { prepareIntake() { return 'verified-proof'; }, call() { throw new Error('private source and account'); } };
  assert.throws(() => f.call('submit', {}), e => e.toolsStoreCode === 'service_unavailable' && e.intakeTicket === 'verified-proof' && !e.message.includes('private'));
  assert.equal(f.locks.releases, 1);
});

test('outer UserLock混雑でも本人/構成検証後の到着証明を返し、書込は開始しない', () => {
  const f = setup({ config: { studentGrading: { enabled: true } } });
  let prepared = 0, writes = 0;
  f.dependencies.studentGrading = { prepareIntake(_input, ctx) { prepared++; assert.equal(ctx.book, f.book); return 'signed-first-arrival'; }, call() { writes++; } };
  f.locks.denied = true;
  assert.throws(() => f.call('submit', {}), error => error.toolsStoreCode === 'busy' && error.intakeTicket === 'signed-first-arrival');
  assert.equal(prepared, 1); assert.equal(writes, 0); assert.equal(f.locks.releases, 0);
  f.dependencies.canEdit = () => false;
  assert.throws(() => f.call('submit', {}), error => error.toolsStoreCode === 'permission_denied' && !error.intakeTicket);
  assert.equal(prepared, 1);
});

test('学生bridgeに管理用の同期・回収・構成操作を公開しない', () => {
  const f = setup({ config: { studentGrading: { enabled: true } } });
  for (const name of ['syncToolsGradingPackages_', 'runToolsGradingCollectionV1_', 'publish', 'installToolsGradingSyncTrigger_']) {
    assert.throws(() => f.call(name, {}), e => e.toolsStoreCode === 'invalid_action');
  }
  assert.equal(f.locks.acquisitions, 0);
});

test('RPCの内部例外は汎用文面にし、到着証明は既知エラーだけへ添付する', () => {
  const f = setup(), ctx = f.context;
  ctx.toolsStoreConfig_ = () => ({});
  const original = ctx.ToolsStoreService;
  ctx.ToolsStoreService = { create: () => ({ call() { throw Object.assign(new Error('private source'), { intakeTicket: 'private' }); } }) };
  const first = ctx.toolsStoreRpc('submit', {}, '', '');
  assert.equal(first.error.code, 'service_unavailable'); assert.equal('intakeTicket' in first.error, false);
  assert.equal(first.error.message.includes('private'), false);
  ctx.ToolsStoreService = { create: () => ({ call() { throw Object.assign(new Error('再試行してください'), { toolsStoreCode: 'busy', intakeTicket: 'signed-server-proof' }); } }) };
  assert.equal(ctx.toolsStoreRpc('submit', {}, '', '').error.intakeTicket, 'signed-server-proof');
  ctx.ToolsStoreService = original;
});
