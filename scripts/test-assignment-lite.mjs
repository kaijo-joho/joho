import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = globalThis.JohoAssignmentLite = require('../tools/shared/assignment-lite.js');
require('../tools/shared/assignment-lite-client.js');
require('../tools/shared/assignment-lite-bridge.js');
require('./fixtures/assignment-lite-mock.js');
const { Client } = globalThis.JohoAssignmentLiteClient;
let count = 0;
async function test(name, run) { await run(); console.log('✓ ' + name); count++; }
const vector = JSON.parse(await readFile(new URL('./fixtures/assignment-lite-vector.json', import.meta.url)));
const route = { bookId: 'synthetic_book', pid: 'logic_test', itemId: 'work' };
const doc = { graph: { nodes: [{ id: 'a', type: 'input', name: 'A', x: 72, y: 260 }, { id: 'f', type: 'output', name: 'F', x: 828, y: 260 }], wires: [] }, inputNames: ['A'], inputValues: { A: 0 } };
const changed = x => { const value = P.clone(doc); value.graph.nodes[1].x = x; return value; };
const session = { sessionId: 'synthetic_session', appId: 'logic', browserKeyId: vector.input.browserKeyId, allowImport: false, recoveryOf: '', baselineHash: '' };
const first = () => P.append({ format: P.FORMAT, version: 1, appId: 'logic', sessionId: session.sessionId, name: '合成回路', entries: [] }, session, 'start', doc);
class MemoryVault {
  constructor() { this.records = new Map(); }
  async identity() { if (!this.keys) { const { keyMaterial, ...keys } = await P.createKeys(); this.keys = keys; this.material = keyMaterial; } return this.keys; }
  forgetMaterial() { this.material = null; }
  async load(id) { return this.records.get(id) || null; }
  async save(data, keys, token) {
    assert.equal(this.records.get(data.session.sessionId)?.token || null, token, 'CAS');
    const value = { token: P.requestId(), envelope: await P.encrypt(data, keys) }; this.records.set(data.session.sessionId, value); return value;
  }
}
await test('fm2合成ベクター：鍵ID・transcript・MACが完全一致', async () => {
  assert.equal(await P.sha(P.decode32(vector.keyMaterial)), vector.input.browserKeyId);
  assert.equal(P.transcript(vector.input), vector.transcript);
  const key = await crypto.subtle.importKey('raw', P.decode32(vector.keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  assert.equal(await P.sign(key, vector.input), vector.mac);
  for (let i = 0; i < 100; i++) P.id(P.requestId());
});
await test('canonical：UTF-16順・数値・不正値・未知の型を検査', () => {
  assert.equal(P.canonical({ b: -0, a: ['日本語', 1] }), '{"a":["日本語",1],"b":0}');
  for (const value of [undefined, NaN, Infinity, new Date(), [,,], { a: undefined }, { a: '\ud800' }, JSON.parse('{"__proto__":1}'), { constructor: 1 }, { a: () => {} }]) assert.throws(() => P.canonical(value));
  assert.throws(() => P.transcript({ ...vector.input, revision: '0' }));
  assert.throws(() => P.decode32(vector.mac.slice(0, -1) + 'B'));
});
await test('履歴：確定操作・Undo追記・未知キー・循環・持込み・上限', async () => {
  let work = first(); work = P.append(work, session, 'edit', changed(700)); work = P.append(work, session, 'undo', doc);
  const inspected = await P.inspectWork(P.canonical(work), session); assert.equal(inspected.historyCount, 3);
  const head = await P.inspectWork(P.canonical(first()), session);
  // 初期時刻は同じ元workから使う。
  P.assertExtends(inspected, { historyCount: 1, historyHash: inspected.prefixHashes[0] });
  assert.throws(() => P.append(work, session, 'import', doc));
  assert.throws(() => P.validateWork({ ...work, extra: 1 }, session));
  assert.throws(() => P.validateLogic({ ...doc, extra: 1 }));
  const cycle = P.clone(doc); cycle.graph.nodes.push({ id: 'n', type: 'NOT', x: 400, y: 250 }); cycle.graph.wires.push({ id: 'w', from: 'n', to: 'n', port: 0 }); assert.throws(() => P.validateLogic(cycle));
  const many = { ...work, entries: Array.from({ length: 1001 }, (_, i) => ({ ...work.entries[0], seq: i + 1, action: i ? 'edit' : 'start' })) };
  assert.throws(() => P.validateWork(many, session)); assert.equal(head.historyCount, 1);
});
await test('非export鍵・AES往復・別鍵・AAD/暗号文改ざん拒否', async () => {
  const keys = await P.createKeys(), other = await P.createKeys();
  assert.equal(keys.aes.extractable, false); assert.equal(keys.hmac.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', keys.aes)); await assert.rejects(crypto.subtle.exportKey('raw', keys.hmac));
  const data = { session, workText: P.canonical(first()) }, encrypted = await P.encrypt(data, keys);
  assert.deepEqual(await P.decrypt(encrypted, keys, session.sessionId), data);
  await assert.rejects(P.decrypt(encrypted, other, session.sessionId));
  await assert.rejects(P.decrypt({ ...encrypted, sessionId: 'other' }, keys, 'other'));
  await assert.rejects(P.decrypt({ ...encrypted, ciphertext: 'A' + encrypted.ciphertext.slice(1) }, keys, session.sessionId));
  assert.notEqual((await P.encrypt(data, keys)).iv, encrypted.iv);
});
await test('開始・暗号保存・checkpoint応答喪失・同じIDで再送・再開', async () => {
  const vault = new MemoryVault(), server = new AssignmentLiteMock();
  const client = new Client({ vault, request: (...args) => server.request(...args) });
  await client.start(route, doc); assert.equal(vault.material, null); assert.equal(client.submitted, false);
  client.record('edit', changed(600), '移動'); client.record('undo', doc); await client.queue;
  assert.equal(client.work.entries.length, 3);
  server.loseNextResponse = true; await assert.rejects(client.checkpoint()); const pendingId = client.pending.requestId;
  assert.throws(() => client.record('edit', changed(500))); await client.checkpoint();
  const calls = server.calls.filter(value => value.operation === 'checkpoint');
  assert.equal(calls[0].data.requestId, pendingId); assert.deepEqual(calls[0].data, calls[1].data);
  assert.equal(client.receipt.submitted, false); assert.equal(client.submitted, false);
  const next = new Client({ vault, request: (...args) => server.request(...args) }); await next.start(route, doc);
  assert.equal(next.work.entries.length, 3); assert.equal(server.calls.filter(value => value.operation === 'register-key').length, 1);
  const stale = new Client({ vault, request: (...args) => server.request(...args) }); await stale.start(route, doc);
  await assert.rejects(next.persist(), /CAS/, '別タブ上書きを拒否');
});
await test('提出：途中保存と区別・全フォーム認証・すり替え・再送・正式結果', async () => {
  const server = new AssignmentLiteMock(), client = new Client({ vault: new MemoryVault(), request: (...args) => server.request(...args) });
  await client.start(route, doc); await client.prepareSubmit(); const frozen = P.clone(client.frozen);
  assert.equal(client.submitted, false); assert.throws(() => client.record('edit', changed(700)));
  const payload = { bookId: route.bookId, pid: route.pid, requestId: 'submit_synthetic', values: { title: '合成タイトル' }, files: [frozen.file] };
  const request = { prepareId: frozen.prepareId, sessionId: frozen.sessionId, revision: frozen.revision, payload };
  const proof = await client.handle('sign-submit', request);
  assert.deepEqual(await client.handle('sign-submit', request), proof);
  await assert.rejects(client.handle('sign-submit', { ...request, payload: { ...payload, values: { title: 'すり替え' } } }));
  await assert.rejects(client.handle('sign-submit', { ...request, payload: { ...payload, pid: 'other' } }));
  await assert.rejects(client.handle('sign-submit', { ...request, payload: { ...payload, files: [{ ...frozen.file, base64: P.b64(P.utf8.encode('{}')) }] } }));
  assert.equal(proof.mac, await P.sign(server.keys, { ...route, purpose: 'submit', sessionId: frozen.sessionId, browserKeyId: proof.browserKeyId,
    requestId: payload.requestId, revision: frozen.revision, payloadHash: await P.submissionHash(payload), challenge: '' }));
  await assert.rejects(client.handle('submission-result', { prepareId: frozen.prepareId, requestId: 'other', submitted: true, attemptId: 'synthetic_attempt' }));
  await client.handle('submission-result', { prepareId: frozen.prepareId, requestId: payload.requestId, submitted: true, attemptId: 'synthetic_attempt' }); assert.equal(client.submitted, true);
});
await test('教員復旧は新sessionのrecover開始・baseline改ざん拒否', async () => {
  const vault = new MemoryVault(), keys = await vault.identity(), server = new AssignmentLiteMock();
  server.session = { ...session, sessionId: 'synthetic_recovered', browserKeyId: keys.browserKeyId, recoveryOf: 'synthetic_checkpoint', baselineHash: await P.sha(P.canonical(changed(500))) };
  server.recoveryDocument = changed(500);
  const client = new Client({ vault, request: (...args) => server.request(...args) }); await client.start(route, doc);
  assert.equal(client.work.entries[0].action, 'recover'); assert.deepEqual(client.document, changed(500));
  const work = P.clone(client.work); work.entries[0].document = doc; await assert.rejects(P.inspectWork(P.canonical(work), client.session));
});
await test('登録応答喪失後の再試行・再読込で同じ鍵を使用', async () => {
  const vault = new MemoryVault(), server = new AssignmentLiteMock(); let lose = true;
  const request = async (...args) => { const result = await server.request(...args); if (args[0] === 'register-key' && lose) { lose = false; throw new Error('合成：登録応答喪失'); } return result; };
  const client = new Client({ vault, request }); await assert.rejects(client.start(route, doc));
  const keyId = vault.keys.browserKeyId; assert(vault.material);
  await client.start(route, doc); assert.equal(vault.keys.browserKeyId, keyId); assert.equal(vault.material, null);
  const next = new Client({ vault, request }); await next.start(route, doc); assert.equal(next.keys.browserKeyId, keyId);
});
await test('保存失敗でも暗号ファイルへ退避。正常な保存へ自動フォールバックしない', async () => {
  const vault = new MemoryVault(), server = new AssignmentLiteMock(), client = new Client({ vault, request: (...args) => server.request(...args) });
  await client.start(route, doc); const stored = vault.records.get(client.session.sessionId);
  vault.save = async () => { throw new Error('合成：容量不足'); };
  client.record('edit', changed(620)); await assert.rejects(client.queue); assert(client.localError); assert(client.locked);
  assert.deepEqual(vault.records.get(client.session.sessionId), stored);
  const envelope = await client.backup(), data = await P.decrypt(envelope, client.keys, client.session.sessionId);
  assert.equal(JSON.parse(data.workText).entries.at(-1).document.graph.nodes[1].x, 620);
});
await test('ブリッジ：origin/source/nonce/operation/相関検査、固定許可先', async () => {
  let listener, sent;
  const host = { addEventListener: (_, cb) => { listener = cb; }, removeEventListener() {} };
  const peer = { postMessage: (data, origin) => { sent = { data, origin }; } };
  const options = { host, peer, origin: 'https://fm2.example.test', trustedOrigins: ['https://fm2.example.test'], nonce: P.b64url(P.random(24)), timeout: 150 };
  assert.throws(() => JohoAssignmentLiteBridge.create({ ...options, origin: 'http://fm2.example.test' }));
  assert.throws(() => JohoAssignmentLiteBridge.create({ ...options, trustedOrigins: ['*'] }));
  const bridge = JohoAssignmentLiteBridge.create(options), pending = bridge.request('start', {});
  const response = { type: 'joho.assignment-lite.response', version: 1, nonce: options.nonce, requestId: sent.data.requestId, operation: 'start', ok: true, result: { good: true } };
  await listener({ source: {}, origin: options.origin, data: response });
  await listener({ source: peer, origin: 'https://evil.test', data: response });
  await listener({ source: peer, origin: options.origin, data: { ...response, nonce: 'wrong' } });
  await listener({ source: peer, origin: options.origin, data: { ...response, operation: 'resume' } });
  await listener({ source: peer, origin: options.origin, data: response }); assert.deepEqual(await pending, { good: true });
  assert.equal(sent.origin, options.origin); assert.throws(() => bridge.request('arbitrary-rpc', {})); bridge.close();
});
console.log(`editor-lite: ${count} suites passed (合成データのみ)`);
