import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const security = require('../tools/shared/assignment-security.js');
const launch = require('../tools/shared/assignment-launch.js');
const { normalizeSnapshot } = require('../js/logic-storage.js');
const { subtle } = webcrypto;
const rsa = { modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
// テストの実行中にだけ鍵を作る。配付用の秘密鍵・実在する課題や生徒情報は保存しない。
const signer = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', ...rsa }, false, ['sign', 'verify']);
const recovery = await subtle.generateKey({ name: 'RSA-OAEP', ...rsa }, false, ['wrapKey', 'unwrapKey']);
const signingJwk = await subtle.exportKey('jwk', signer.publicKey);
const recoveryJwk = await subtle.exportKey('jwk', recovery.publicKey);
const currentTime = 1800000000000;
const clone = value => JSON.parse(JSON.stringify(value));
const hasCode = code => error => error instanceof security.AssignmentError && error.code === code;

class MemoryKeys {
  constructor(record) { this.values = new Map(record ? [[record.appId, record]] : []); this.adds = 0; this.reads = 0; }
  async read(appId) { this.reads++; return this.values.get(appId); }
  async add(record) {
    this.adds++;
    if (this.values.has(record.appId)) throw new DOMException('Duplicate', 'ConstraintError');
    this.values.set(record.appId, record);
  }
}
function makeClient(keyStore, extra = {}) {
  return security.createClient({ appId: 'logic', issuer: 'fm2',
    signingKeys: { 'sign-test': signingJwk }, recoveryKeys: { 'recover-test': recoveryJwk },
    crypto: webcrypto, now: () => currentTime, keyStore,
    validateDocument: document => typeof document.text === 'string', ...extra });
}
async function grantFor(registration, changes = {}, headerChanges = {}) {
  const header = { alg: 'RS256', typ: 'joho-assignment+jwt', kid: 'sign-test', ...headerChanges };
  const claims = { v: 1, iss: 'fm2', aud: registration.appId, sub: 'test-recipient', jti: 'test-issue',
    assignmentId: 'test-assignment', iat: currentTime / 1000 - 10, exp: currentTime / 1000 + 3600,
    browserKeyId: registration.browserKeyId, recoveryKeyId: 'recover-test', allowImport: false, ...changes };
  const data = [header, claims].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const signature = await subtle.sign('RSASSA-PKCS1-v1_5', signer.privateKey, Buffer.from(data));
  return data + '.' + Buffer.from(signature).toString('base64url');
}
const keys = new MemoryKeys();
const client = makeClient(keys);
const registration = await client.prepareBrowser();
const grant = await grantFor(registration);
const initial = await client.start(grant, { document: { text: '最初の作品' }, name: 'テスト課題' });
const sealed = await client.seal(initial);

test('読み込むだけではストレージ・ネットワーク・DOMに触れない', async () => {
  const context = { TextEncoder, TextDecoder };
  for (const name of ['indexedDB', 'localStorage', 'fetch', 'document', 'window', 'crypto']) {
    Object.defineProperty(context, name, { get() { throw new Error('Unexpected access: ' + name); } });
  }
  for (const file of ['assignment-security.js', 'assignment-launch.js']) {
    runInNewContext(await readFile(new URL('../tools/shared/' + file, import.meta.url), 'utf8'), context);
  }
  assert.equal(typeof context.JohoAssignmentSecurity.createClient, 'function');
  assert.equal(typeof context.JohoAssignmentLaunch.receive, 'function');
  const empty = new MemoryKeys();
  makeClient(empty);
  assert.equal(empty.reads + empty.adds, 0);
});

test('信頼する発行者・復旧公開鍵・教材の検証がない場合は開始しない', () => {
  assert.throws(() => makeClient(keys, { signingKeys: {} }), hasCode('TRUST_REQUIRED'));
  assert.throws(() => makeClient(keys, { recoveryKeys: {} }), hasCode('TRUST_REQUIRED'));
  assert.throws(() => makeClient(keys, { validateDocument: undefined }), hasCode('VALIDATOR_REQUIRED'));
  assert.throws(() => makeClient(keys, { signingKeys: { bad: { ...signingJwk, d: 'private' } } }), hasCode('INVALID_KEY'));
  assert.throws(() => makeClient(keys, { recoveryKeys: { bad: { ...recoveryJwk, alg: 'RSA1_5' } } }), hasCode('INVALID_KEY'));
});

test('ブラウザ鍵は秘密鍵のまま保持し、再準備しても作り直さない', async () => {
  assert.deepEqual(await client.prepareBrowser(), registration);
  assert.equal(keys.adds, 1);
  const record = keys.values.get('logic');
  assert.equal(record.privateKey.extractable, false);
  await assert.rejects(subtle.exportKey('jwk', record.privateKey));
  assert.deepEqual(Object.keys(registration).sort(), ['appId', 'browserKeyId', 'publicJwk']);
  assert.deepEqual(Object.keys(registration.publicJwk).sort(), ['e', 'kty', 'n']);
  const race = new MemoryKeys();
  const first = makeClient(race), second = makeClient(race);
  const [a, b] = await Promise.all([first.prepareBrowser(), second.prepareBrowser()]);
  assert.equal(a.browserKeyId, b.browserKeyId, '別タブ相当の競合でも勝った鍵を共用する');
  assert.equal(race.values.size, 1);
});

test('暗号化保存・復号で本文と履歴を保ち、毎回別の鍵・IVで保存する', async () => {
  assert.deepEqual(await client.open(sealed), initial);
  assert.deepEqual(await client.openForRecovery(sealed, recovery.privateKey), initial);
  const again = await client.seal(initial);
  const one = JSON.parse(sealed), two = JSON.parse(again);
  for (const field of ['iv', 'browser', 'recovery', 'ciphertext']) assert.notEqual(one.encryption[field], two.encryption[field]);
  assert.equal(sealed.includes('最初の作品'), false);
  assert.equal(sealed.includes('テスト課題'), false);
  assert.equal(sealed.includes('privateKey'), false);
});

test('別ブラウザ・消えた鍵では開かず、教員用の復旧経路は残す', async () => {
  const missing = new MemoryKeys(), other = makeClient(missing);
  await assert.rejects(other.open(sealed), hasCode('WRONG_BROWSER'));
  assert.equal(missing.adds, 0, 'ファイル読込は鍵を新規発行しない');
  assert.deepEqual(await other.openForRecovery(sealed, recovery.privateKey), initial);
  await other.prepareBrowser();
  await assert.rejects(other.open(sealed), hasCode('WRONG_BROWSER'));
  await assert.rejects(other.start(grant, { document: { text: '' } }), hasCode('WRONG_BROWSER'));
  await assert.rejects(client.openForRecovery(sealed, missing.values.get('logic').privateKey), hasCode('DECRYPT_FAILED'));
});

test('保存障害・破損した鍵を黙って上書きしない', async () => {
  let adds = 0;
  await assert.rejects(makeClient({ async read() { throw new Error('blocked'); }, async add() { adds++; } }).prepareBrowser(), hasCode('STORAGE_UNAVAILABLE'));
  assert.equal(adds, 0);
  const quota = { async read() {}, async add() { throw new DOMException('Full', 'QuotaExceededError'); } };
  await assert.rejects(makeClient(quota).prepareBrowser(), hasCode('STORAGE_UNAVAILABLE'));
  const corrupt = new MemoryKeys({ ...keys.values.get('logic'), keyId: 'broken' });
  await assert.rejects(makeClient(corrupt).prepareBrowser(), hasCode('INVALID_KEY'));
  assert.equal(corrupt.adds, 0);
  assert.equal(corrupt.values.get('logic').keyId, 'broken');
  const mismatched = new MemoryKeys({ ...keys.values.get('logic'), privateKey: recovery.privateKey });
  await assert.rejects(makeClient(mismatched).prepareBrowser(), hasCode('INVALID_KEY'));
  assert.equal(mismatched.adds, 0);
});

test('署名・発行者・アプリ・開始期限・復旧鍵IDを検査する', async () => {
  for (const [changes, code] of [
    [{ iss: 'other' }, 'WRONG_APP'], [{ aud: 'chemistry' }, 'WRONG_APP'],
    [{ recoveryKeyId: 'unknown' }, 'RECOVERY_UNAVAILABLE'],
    [{ exp: currentTime / 1000 }, 'GRANT_EXPIRED'],
    [{ iat: currentTime / 1000 + 301 }, 'GRANT_EXPIRED'],
    [{ sub: '氏名入りのIDは不可' }, 'INVALID_GRANT'], [{ allowImport: 'true' }, 'INVALID_GRANT']
  ]) await assert.rejects(client.verifyGrant(await grantFor(registration, changes)), hasCode(code));
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { kid: 'unknown' }, { jku: 'https://untrusted.test/keys' }]) {
    await assert.rejects(client.verifyGrant(await grantFor(registration, {}, header)), hasCode('INVALID_GRANT'));
  }
  const parts = grant.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  claims.sub = 'someone-else'; parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
  await assert.rejects(client.verifyGrant(parts.join('.')), hasCode('SIGNATURE_INVALID'));
  await assert.rejects(client.verifyGrant('unsigned'), hasCode('INVALID_GRANT'));
  const future = makeClient(keys, { now: () => currentTime + 7200000 });
  await assert.rejects(future.start(grant, { document: { text: '' } }), hasCode('GRANT_EXPIRED'));
  const work = await future.open(sealed);
  assert.deepEqual(await future.open(await future.seal(work)), initial, '開始期限切れでも既存作品の保存・閲覧は奪わない');
});

test('暗号文・IV・両方の鍵の包み・ヘッダーの改変を検出する', async () => {
  for (const field of ['ciphertext', 'iv', 'browser', 'recovery']) {
    const changed = JSON.parse(sealed);
    const bytes = Buffer.from(changed.encryption[field], 'base64url'); bytes[0] ^= 1;
    changed.encryption[field] = bytes.toString('base64url');
    await assert.rejects(client.open(JSON.stringify(changed)), hasCode('DECRYPT_FAILED'));
    await assert.rejects(client.openForRecovery(JSON.stringify(changed), recovery.privateKey), hasCode('DECRYPT_FAILED'));
  }
  const replacedGrant = JSON.parse(sealed);
  replacedGrant.grant = await grantFor(registration, { jti: 'different-issue' });
  await assert.rejects(client.open(JSON.stringify(replacedGrant)), hasCode('DECRYPT_FAILED'), '有効な別署名への差し替えもAADが拒否');
  for (const alter of [
    value => { value.version = 2; }, value => { value.extra = true; },
    value => { value.encryption.alg = 'none'; }, value => { value.encryption.wrap = 'RSA1_5'; },
    value => { value.encryption.iv = ''; }, value => { value.encryption.ciphertext += '='; }
  ]) {
    const changed = JSON.parse(sealed); alter(changed);
    await assert.rejects(client.open(JSON.stringify(changed)));
  }
});

test('履歴は独立したスナップショットで保持し、Undoも追記する', async () => {
  const document = { text: '変更後' };
  const edited = await client.record(initial, document);
  document.text = '後から変更';
  assert.equal(initial.work.entries.length, 1);
  assert.equal(edited.work.entries.at(-1).document.text, '変更後');
  const noop = await client.record(edited, { text: '変更後' });
  assert.equal(noop.work.entries.length, 2);
  const undone = await client.record(noop, { text: '最初の作品' }, { action: 'undo' });
  assert.deepEqual(undone.work.entries.map(item => item.action), ['start', 'edit', 'undo']);
  assert.deepEqual(await client.open(await client.seal(undone)), undone);
  for (const alter of [
    value => { value.work.entries[0].seq = 3; }, value => { value.work.issueId = 'other'; },
    value => { value.work.entries[0].browserKeyId = 'A'.repeat(43); },
    value => { value.work.entries[0].at = 'yesterday'; }, value => { value.work.entries[0].document = { wrong: true }; }
  ]) {
    const changed = clone(initial); alter(changed);
    await assert.rejects(client.seal(changed), hasCode('INVALID_WORK'));
  }
  await assert.rejects(client.start(grant, { document: { text: '' }, imported: true }), hasCode('IMPORT_NOT_ALLOWED'));
  await assert.rejects(client.record(initial, { text: '持ち込み' }, { action: 'import' }), hasCode('IMPORT_NOT_ALLOWED'));
  const importGrant = await grantFor(registration, { allowImport: true });
  const imported = await client.start(importGrant, { document: { text: '持ち込み' }, imported: true });
  assert.equal(imported.work.entries[0].action, 'start-import');
  const asyncValidator = makeClient(keys, { validateDocument: async () => true });
  await assert.rejects(asyncValidator.seal(initial), hasCode('INVALID_WORK'), '検証コールバックは同期処理を要求する');
  const rejectingValidator = makeClient(keys, { validateDocument: async () => { throw new Error('validation'); } });
  await assert.rejects(rejectingValidator.seal(initial), hasCode('INVALID_WORK'), '非同期検証の例外を未処理で残さない');
});

test('サイズ・履歴の上限で古い履歴を勝手に捨てない', async () => {
  const full = clone(initial);
  full.work.entries = Array.from({ length: security.MAX_ENTRIES }, (_, seq) => ({
    ...full.work.entries[0], seq, action: seq ? 'checkpoint' : 'start'
  }));
  await assert.rejects(client.record(full, { text: '追加分' }), hasCode('HISTORY_LIMIT'));
  assert.equal(full.work.entries.length, security.MAX_ENTRIES);
  await assert.rejects(client.record(initial, { text: 'x'.repeat(security.MAX_WORK_BYTES) }), hasCode('SIZE_LIMIT'));
  await assert.rejects(client.open('x'.repeat(security.MAX_FILE_BYTES + 1)), hasCode('SIZE_LIMIT'));
  assert.equal(initial.work.entries.length, 1);
});

test('正規化でアクセサー・非JSON型・危険な項目・過大な入力を拒否する', () => {
  assert.equal(security.canonical({ b: 2, a: [null, true, '日本語'] }), '{"a":[null,true,"日本語"],"b":2}');
  for (const value of [NaN, Infinity, undefined, new Date(), new Array(1), JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => security.canonical(value), hasCode('INVALID_DATA'));
  }
  let accessed = false;
  const array = [1]; Object.defineProperty(array, 0, { get() { accessed = true; return 1; } });
  assert.throws(() => security.canonical(array), hasCode('INVALID_DATA'));
  const object = {}; Object.defineProperty(object, 'x', { enumerable: true, get() { accessed = true; return 1; } });
  assert.throws(() => security.canonical(object), hasCode('INVALID_DATA'));
  assert.equal(accessed, false);
  assert.throws(() => security.canonical(['a'.repeat(100), 'b'.repeat(100)], 150), hasCode('SIZE_LIMIT'));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => security.canonical(cyclic), hasCode('SIZE_LIMIT'));
});

test('教材別アダプターで論理回路の既存データを往復できる', async () => {
  const circuit = { graph: { nodes: [
    { id: 'a', type: 'input', name: 'A', x: 72, y: 200 },
    { id: 'b', type: 'input', name: 'B', x: 72, y: 300 },
    { id: 'and', type: 'AND', x: 450, y: 250 },
    { id: 'f', type: 'output', name: 'F', x: 828, y: 250 }
  ], wires: [
    { id: 'a-and', from: 'a', to: 'and', port: 0 }, { id: 'b-and', from: 'b', to: 'and', port: 1 },
    { id: 'and-f', from: 'and', to: 'f', port: 0 }
  ] }, inputNames: ['A', 'B'], inputValues: { A: 0, B: 1 } };
  const adapter = makeClient(keys, { validateDocument: document => { normalizeSnapshot(document); } });
  const session = await adapter.start(grant, { document: circuit });
  assert.deepEqual((await adapter.open(await adapter.seal(session))).work.entries[0].document, circuit);
  const bad = clone(circuit); bad.graph.wires[0].to = 'missing';
  await assert.rejects(adapter.record(session, bad));
  const chemistryKeys = new MemoryKeys();
  const chemistry = makeClient(chemistryKeys, { appId: 'chemistry', validateDocument: document => Array.isArray(document.atoms) });
  const chemistryGrant = await grantFor(await chemistry.prepareBrowser());
  const molecule = await chemistry.start(chemistryGrant, { document: { atoms: [], bonds: [] } });
  assert.deepEqual(await chemistry.open(await chemistry.seal(molecule)), molecule);
  await assert.rejects(client.verifyGrant(chemistryGrant), hasCode('WRONG_APP'));
});

class Messages {
  constructor() { this.listeners = new Set(); }
  addEventListener(type, callback) { assert.equal(type, 'message'); this.listeners.add(callback); }
  removeEventListener(type, callback) { assert.equal(type, 'message'); this.listeners.delete(callback); }
  emit(event) { for (const callback of this.listeners) callback(event); }
}
function exchange(extra = {}) {
  const target = new Messages();
  let sent;
  const ready = new Promise(resolve => { sent = resolve; });
  const source = { postMessage(data, origin) { sent({ data, origin }); } };
  const result = launch.receive({ client, sourceWindow: source, sourceOrigin: 'https://issuer.test',
    eventTarget: target, crypto: webcrypto, timeoutMs: 500, ...extra });
  return { target, source, ready, result };
}

test('起動通知は既知のorigin・Window・nonce・署名・鍵の一致をすべて要求する', async () => {
  const { target, source, ready, result } = exchange();
  const message = await ready;
  assert.equal(message.origin, 'https://issuer.test');
  assert.equal(message.data.type, 'joho.assignment.ready');
  assert.equal(JSON.stringify(message.data).includes('private'), false);
  assert.equal(message.data.nonce.length, 48);
  const data = { type: 'joho.assignment.launch', version: 1, nonce: message.data.nonce, grant };
  target.emit({ origin: 'https://wrong.test', source, data });
  target.emit({ origin: 'https://issuer.test', source: {}, data });
  target.emit({ origin: 'https://issuer.test', source, data: { ...data, nonce: 'wrong' } });
  assert.equal(target.listeners.size, 1);
  target.emit({ origin: 'https://issuer.test', source, data });
  assert.deepEqual(await result, { grant, claims: await client.verifyGrant(grant) });
  assert.equal(target.listeners.size, 0);
});

test('起動失敗・タイムアウト・取消でリスナーを残さない', async () => {
  for (const origin of ['*', 'http://issuer.test', 'https://issuer.test/path']) {
    await assert.rejects(exchange({ sourceOrigin: origin }).result);
  }
  for (const badGrant of ['unsigned', await grantFor(registration, { browserKeyId: 'A'.repeat(43) })]) {
    const { target, source, ready, result } = exchange();
    const expected = assert.rejects(result);
    const { data } = await ready;
    target.emit({ origin: 'https://issuer.test', source,
      data: { type: 'joho.assignment.launch', version: 1, nonce: data.nonce, grant: badGrant } });
    await expected; assert.equal(target.listeners.size, 0);
  }
  const timeout = exchange();
  await assert.rejects(timeout.result, /接続を確認/);
  assert.equal(timeout.target.listeners.size, 0);
  const abort = new AbortController();
  const cancelled = exchange({ signal: abort.signal });
  const expected = assert.rejects(cancelled.result, /取り消し/);
  await cancelled.ready; abort.abort(); await expected;
  assert.equal(cancelled.target.listeners.size, 0);
  await assert.rejects(exchange({ signal: abort.signal }).result, /取り消し/);
});
