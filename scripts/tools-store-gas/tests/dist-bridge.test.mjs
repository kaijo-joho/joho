import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../dist/25_toolsStoreConnection.html', import.meta.url), 'utf8');
const distribution = readFileSync(new URL('../dist/19_tools_store_distribution.js', import.meta.url), 'utf8');
const origin = 'https://school.example.test';
const channel = 'a'.repeat(64);
const id = 'b'.repeat(32);
function setup() {
  const sent = [], calls = [], handlers = {}, message = { textContent: '' };
  const top = { postMessage: (value, target) => sent.push({ value, target }) };
  const state = {};
  const run = {
    withSuccessHandler(fn) { state.success = fn; return this; },
    withFailureHandler(fn) { state.failure = fn; return this; },
    getToolsStoreConnectionV1(input) { calls.push(input); }
  };
  const context = vm.createContext({ window: { top, addEventListener: (kind, callback) => handlers[kind] = callback },
    document: { getElementById: () => message }, google: { script: { run } }, console });
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= toolsStoreBootJson ?>', JSON.stringify({ protocol: 'tools-store-rpc-v1', origin, channel }));
  vm.runInContext(js, context);
  const base = { protocol: 'tools-store-rpc-v1', channel, type: 'request', id, action: 'session', input: { tool: 'python' } };
  return { sent, calls, handlers, top, state, message, base,
    emit: (data = base, extras = {}) => handlers.message({ source: top, origin, data, ...extras }) };
}

test('readyはサーバー検査済みorigin/channelへだけ送る', () => {
  const f = setup();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].target, origin);
  assert.equal(f.sent[0].value.type, 'ready'); assert.equal(f.sent[0].value.channel, channel);
});

test('source/origin/channel/protocol/idの違う要求ではGASを呼ばない', () => {
  const f = setup();
  f.emit(f.base, { source: {} }); f.emit(f.base, { origin: 'https://evil.example' });
  f.emit({ ...f.base, channel: 'c'.repeat(64) }); f.emit({ ...f.base, protocol: 'other' });
  f.emit({ ...f.base, id: 'forged' }); f.emit({ ...f.base, type: 'response' });
  assert.equal(f.calls.length, 0); assert.equal(f.sent.length, 1);
});

test('parentの任意GSS/ユーザー/URL/originや別action/bindingを拒否', () => {
  const f = setup();
  for (const input of [{ tool: 'python', account: 'other' }, { tool: 'python', spreadsheetId: 'other-id' },
    { tool: 'python', storeURL: 'https://evil.example' }, { tool: 'python', origin: 'https://evil.example' }, { tool: 'html' }]) f.emit({ ...f.base, input });
  f.emit({ ...f.base, action: 'saveDraft' }); f.emit({ ...f.base, binding: 'forged' });
  assert.equal(f.calls.length, 0);
  assert.ok(f.sent.slice(1).every(row => row.value.result.error.code === 'invalid_request'));
});

test('sessionはboot.originを付けてGASへ渡し、応答を同じparentへ返す', () => {
  const f = setup(); f.emit();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].tool, 'python'); assert.equal(f.calls[0].origin, origin);
  const result = { ok: true, value: { account: 'student@school.example.test', binding: 'signed-synthetic', spreadsheetId: 'synthetic' } };
  f.state.success(result);
  assert.equal(f.sent.length, 2); assert.equal(f.sent[1].target, origin);
  assert.equal(f.sent[1].value.id, id); assert.equal(f.sent[1].value.result, result);
});

test('同時要求と同一ID再送は重複provisionを呼ばない', () => {
  const f = setup(); f.emit(); f.emit(); f.emit({ ...f.base, id: 'd'.repeat(32) });
  assert.equal(f.calls.length, 1);
  f.state.success({ ok: true, value: {} }); f.emit();
  assert.equal(f.calls.length, 1);
});

test('Google内部例外をそのまま返さない', () => {
  const f = setup(); f.emit(); f.state.failure(new Error('SECRET internal email and id'));
  const last = f.sent.at(-1).value.result;
  assert.equal(last.error.code, 'transport'); assert.ok(!JSON.stringify(last).includes('SECRET'));
});

test('render入口はallowlist/64hex nonceを検証し、boot JSONのHTML終端をescapeする', () => {
  assert.match(distribution, /c\.allowedOrigins\.indexOf\(input\.origin\) >= 0/);
  assert.match(distribution, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(distribution, /JSON\.stringify\(boot\)\.replace\(\/</);
  assert.match(distribution, /function renderToolsStoreConnectionV1_\(event\)/);
  assert.ok(!distribution.includes('function doGet('), 'dist追加パッケージは既存doGetを置換しない');
  assert.ok(!html.includes('localStorage'), '接続情報/署名をGAS子のstorageへ保存しない');
});
