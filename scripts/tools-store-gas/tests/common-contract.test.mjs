import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCommon } from './common-fixture.mjs';

const { contract: T } = loadCommon();
const now = Date.UTC(2026, 9, 15);
const config = { bindingKey: 'synthetic-test-key-only-32-characters', allowedOrigins: ['https://school.example'], bindingLifetimeMs: 3600000 };
const input = { account: 'student@example.test', spreadsheetId: 'synthetic_spreadsheet_identifier_0001', generation: 'a'.repeat(32), tool: 'python', origin: config.allowedOrigins[0] };
function code(expected) { return error => error.toolsStoreCode === expected; }

test('bindingは本人・保存先・世代・origin・寿命を固定する', () => {
  const token = T.issueBinding(input, config, now), payload = T.verifyBinding(token, config, now + 5000);
  assert.equal(payload.actorKey, T.actorKey(input.account));
  assert.equal(payload.spreadsheetId, input.spreadsheetId);
  assert.equal(payload.origin, input.origin);
  assert.equal(payload.expiresAt, now + 3600000);
  assert.equal(T.actorKey('  STUDENT@example.test '), payload.actorKey);
});
test('署名・audience・origin・期限の改竄を拒否する', () => {
  const token = T.issueBinding(input, config, now);
  assert.throws(() => T.verifyBinding(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), config, now), code('binding_invalid'));
  assert.throws(() => T.verifyBinding(token, { ...config, bindingKey: 'different-synthetic-key-32-characters' }, now), code('binding_invalid'));
  assert.throws(() => T.verifyBinding(token, { ...config, allowedOrigins: ['https://wrong.example'] }, now), code('binding_invalid'));
  assert.throws(() => T.verifyBinding(token, config, now + 3600000), code('binding_expired'));
  assert.throws(() => T.verifyBinding(token, config, now - 31000), code('binding_expired'));
});
test('未設定鍵・過大寿命・未許可tool・不正GSSを発行しない', () => {
  assert.throws(() => T.issueBinding(input, { ...config, bindingKey: '' }, now), code('configuration_required'));
  assert.throws(() => T.issueBinding(input, { ...config, bindingLifetimeMs: 90000000 }, now), code('configuration_required'));
  assert.throws(() => T.issueBinding({ ...input, tool: 'html' }, config, now), code('binding_invalid'));
  assert.throws(() => T.issueBinding({ ...input, spreadsheetId: '../arbitrary' }, config, now), code('binding_invalid'));
});
test('共通レイアウトは14列・初期1024問版・旧256問版互換で履歴/確認容量を変えない', () => {
  assert.equal(T.constants.HEADERS.length, 14);
  assert.equal(T.constants.DRAFTS, 1024);
  assert.equal(T.constants.DRAFT_ROWS, 1 + 1024 * 4);
  assert.equal(T.constants.MIN_DRAFTS, 256);
  assert.equal(T.constants.MIN_DRAFT_ROWS, 1 + 256 * 4);
  assert.equal(T.constants.HISTORY_ROWS, 2049);
  assert.equal(T.constants.CONFIRMATION.MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(T.constants.CONFIRMATION.RECEIPT_ROWS, 4097);
  assert.equal(T.constants.CHUNK * T.constants.PARTS >= T.constants.MAX_TEXT, true);
  assert.equal(T.constants.CHECKPOINT_MS, 300000);
});
test('実容量は物理的な完全4行ブロックで算出し1024問版を超えない', () => {
  assert.equal(T.draftCapacity(1025), 256);
  assert.equal(T.draftCapacity(1028), 256);
  assert.equal(T.draftCapacity(1029), 257);
  assert.equal(T.draftCapacity(4097), 1024);
  assert.equal(T.draftCapacity(10000), 1024);
  assert.equal(T.draftCapacity(0), 0);
  assert.equal(T.draftCapacity(undefined), 0);
});
