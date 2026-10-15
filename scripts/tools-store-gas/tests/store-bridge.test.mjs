import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function bridge() {
  const boot = { protocol: 'tools-store-rpc-v1', channel: 'c'.repeat(64), origin: 'https://school.example' };
  const listeners = {}, sent = [], calls = [], peer = { postMessage: (...args) => sent.push(args) };
  const run = { withSuccessHandler(fn) { this.success = fn; return this; }, withFailureHandler(fn) { this.failure = fn; return this; }, toolsStoreRpc(...args) { calls.push({ args, success: this.success, failure: this.failure }); } };
  const window = { top: peer, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const context = vm.createContext({ window, document: { getElementById: () => ({ textContent: '' }) }, google: { script: { run } } });
  const html = readFileSync(new URL('../store/20_tools_store_bridge.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= bootJson ?>', JSON.stringify(boot));
  vm.runInContext(script, context);
  const valid = { origin: boot.origin, source: peer, data: { protocol: boot.protocol, channel: boot.channel, type: 'request', id: 'a'.repeat(32), action: 'session', input: {}, binding: 'synthetic.binding' } };
  return { boot, peer, sent, calls, valid, emit: message => listeners.message(message) };
}

test('store bridgeのready/responseはallowlistの親originだけへ返す', () => {
  const f = bridge();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0][0].type, 'ready'); assert.equal(f.sent[0][1], f.boot.origin);
  f.emit(f.valid); assert.equal(f.calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args)), ['session', {}, 'synthetic.binding', f.boot.origin]);
  f.calls[0].success({ ok: true, value: { schemaVersion: 1 } });
  assert.equal(f.sent[1][0].id, f.valid.data.id); assert.equal(f.sent[1][1], f.boot.origin);
});
test('store bridgeはorigin/source/channel/protocol/id/action/本文の不正を無視する', () => {
  const f = bridge();
  const changes = [
    { origin: 'https://wrong.example' }, { source: {} },
    { data: { ...f.valid.data, channel: 'd'.repeat(64) } },
    { data: { ...f.valid.data, protocol: 'other' } },
    { data: { ...f.valid.data, id: '../../unsafe' } },
    { data: { ...f.valid.data, action: 'adminCreate' } },
    { data: { ...f.valid.data, binding: 'x'.repeat(4097) } },
    { data: { ...f.valid.data, input: null } }
  ];
  for (const change of changes) f.emit({ ...f.valid, ...change });
  assert.equal(f.calls.length, 0); assert.equal(f.sent.length, 1);
});
test('通信失敗のresponseは内部例外や本人情報を露出せず未確定を返す', () => {
  const f = bridge(); f.emit(f.valid);
  f.calls[0].failure(new Error('synthetic internal details must not reach browser'));
  const result = f.sent[1][0].result;
  assert.equal(result.ok, false); assert.equal(result.error.code, 'transport_failed');
  assert.equal(JSON.stringify(result).includes('synthetic internal'), false);
});
