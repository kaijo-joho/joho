import test from 'node:test';
import assert from 'node:assert/strict';
import { codeHash } from '../cloud.mjs';
import { validateJournal, mergeJournals } from '../confirmation-store.mjs';
import { canonical, splitJournal, sameConfirmationJournal, mergeConfirmationJournals, ConfirmationCloudClient, ConfirmationSync } from '../confirmation-cloud.mjs';
import { setup as gasFixture } from '../../../scripts/tools-store-gas/tests/store-fixture.mjs';

const copy = value => structuredClone(value);
const empty = () => ({ schema: 1, trials: [], responses: {} });
const answer = value => ({ schema: 1, trials: [], responses: { 'v1/check': { answer: value } } });
const session = actor => ({ actorKey: (actor || 'a').repeat(64), spreadsheetId: 'spreadsheet-test-0001', confirmationJournal: { schema: 1, enabled: true, maxBytes: 4194304, chunkSize: 32000 } });
const error = code => Object.assign(new Error(code), { code });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class Storage {
  constructor() { this.rows = new Map(); this.broken = false; }
  getItem(key) { if (this.broken) throw error('quota'); return this.rows.get(key) ?? null; }
  setItem(key, value) { if (this.broken) throw error('quota'); this.rows.set(key, value); }
  removeItem(key) { if (this.broken) throw error('quota'); this.rows.delete(key); }
}
async function trial(id, stdout = 'ok') {
  const code = 'print("ok")';
  return { schema: 1, id, source: { questionId: 'code1', version: 'v1' }, code, codeHash: await codeHash(code), inputs: [], stdout, stderr: '', outcome: 'success', truncated: false, at: '2026-10-17T00:00:00.000Z' };
}
class Server {
  constructor(journal = empty()) { this.journal = copy(journal); this.revision = journal.trials.length || Object.keys(journal.responses).length ? '1'.repeat(32) : null; this.sequence = 2; this.uploads = new Map(); this.calls = []; this.leases = new Map(); }
  async manifest() {
    const text = canonical(this.journal), base = { revision: this.revision, journalHash: await codeHash(text), byteLength: new TextEncoder().encode(text).byteLength, chunkSize: 32000 };
    if (this.revision === null) return { ...base, journal: empty(), chunkCount: 0 };
    const readId = (this.sequence++).toString(16).padStart(32, '0'), chunks = splitJournal(text);
    this.leases.set(readId, { revision: this.revision, chunks }); return { ...base, readId, chunkCount: chunks.length };
  }
  async rpc(action, input) {
    this.calls.push({ action, input: copy(input) });
    if (this.before) await this.before(action, input);
    if (action === 'getConfirmationJournal') return this.manifest();
    if (action === 'releaseConfirmationRead') { this.leases.delete(input.readId); return { state: 'released', revision: input.revision }; }
    if (action === 'getConfirmationJournalChunk') {
      const lease = this.leases.get(input.readId);
      if (!lease || lease.revision !== input.revision) throw error('confirmation_read_expired');
      const text = lease.chunks[input.index]; return { revision: lease.revision, index: input.index, text, chunkHash: await codeHash(text) };
    }
    if (action === 'lookupConfirmationSave') {
      const upload = this.uploads.get(input.requestId);
      return upload?.result ? copy(upload.result) : { state: upload ? 'pending' : 'missing', requestId: input.requestId };
    }
    if (action === 'beginConfirmationSave') {
      let upload = this.uploads.get(input.requestId);
      if (upload && canonical(upload.input) !== canonical(input)) throw error('request_reused');
      if (!upload) { upload = { input: copy(input), chunks: new Map() }; this.uploads.set(input.requestId, upload); }
      if (upload.result) return copy(upload.result);
      if (input.expectedRevision !== this.revision) return { state: 'conflict', ...await this.manifest() };
      return { state: 'uploading', requestId: input.requestId, received: [...upload.chunks.keys()] };
    }
    if (action === 'putConfirmationChunk') {
      const upload = this.uploads.get(input.requestId), previous = upload.chunks.get(input.index);
      if (previous !== undefined && previous !== input.text) throw error('request_reused');
      upload.chunks.set(input.index, input.text);
      return { state: 'uploading', requestId: input.requestId, index: input.index, chunkHash: await codeHash(input.text) };
    }
    if (action === 'saveConfirmationJournal') {
      const upload = this.uploads.get(input.requestId);
      if (upload.result) return copy(upload.result);
      if (input.expectedRevision !== this.revision) return { state: 'conflict', ...await this.manifest() };
      const text = [...upload.chunks.entries()].sort(([a], [b]) => a - b).map(([, value]) => value).join('');
      assert.equal(await codeHash(text), upload.input.journalHash);
      this.journal = validateJournal(JSON.parse(text)); this.revision = (this.sequence++).toString(16).padStart(32, '0');
      upload.result = { state: 'saved', revision: this.revision, requestId: input.requestId, journalHash: upload.input.journalHash };
      if (this.loseCommit) { this.loseCommit = false; throw error('timeout'); }
      return copy(upload.result);
    }
    throw error('unknown');
  }
}
function client(server, storage = new Storage(), options = {}, who = session()) { return new ConfirmationCloudClient(server.rpc.bind(server), who, storage, options); }
class Store {
  constructor(journal = empty()) { this.journal = copy(journal); this.beforeAdopt = null; }
  snapshot() { return copy(this.journal); }
  async idle() {}
  async refresh() {}
  async adoptRemote(incoming, { expectedLocal, isCurrent } = {}) {
    if (this.beforeAdopt) await this.beforeAdopt();
    if (isCurrent && !isCurrent()) throw error('journal_changed');
    const changed = Object.keys(incoming.responses).some(key => canonical(incoming.responses[key]) !== canonical(expectedLocal.responses[key]) && canonical(this.journal.responses[key]) !== canonical(expectedLocal.responses[key]));
    if (changed) throw error('journal_changed');
    this.journal = { ...mergeJournals({ ...this.journal, responses: {} }, { ...incoming, responses: {} }), responses: copy(incoming.responses) };
  }
}
const options = () => ({ minIntervalMs: 0, jitterMs: 0, setTimer: () => 1, clearTimer: () => {} });
class Clock {
  time = 1000; next = 0; jobs = new Map();
  now = () => this.time;
  set = (fn, ms) => { const id = ++this.next; this.jobs.set(id, { fn, at: this.time + ms }); return id; };
  clear = id => this.jobs.delete(id);
  async advance(ms) {
    const end = this.time + ms; let count = 0;
    while (true) {
      const next = [...this.jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break;
      assert.ok(++count < 1000, 'timer loop'); this.time = next[1].at; this.jobs.delete(next[0]); await next[1].fn();
    }
    this.time = end;
  }
  options = () => ({ now: this.now, setTimer: this.set, clearTimer: this.clear, random: () => 0 });
}
const waitUntil = async check => { for (let index = 0; index < 100 && !check(); index++) await new Promise(resolve => setImmediate(resolve)); assert.ok(check()); };

test('canonical object keys and chunks preserve Unicode surrogate pairs', () => {
  assert.equal(canonical({ z: [{ c: 1, a: 2 }], a: 'a' }), '{"a":"a","z":[{"a":2,"c":1}]}');
  const text = 'x'.repeat(31999) + '😀' + '末尾';
  const chunks = splitJournal(text);
  assert.equal(chunks[0].length, 31999); assert.equal(chunks.join(''), text); assert.ok(chunks.every(value => value.length <= 32000));
});

test('session without explicit confirmation capability is rejected', () => {
  assert.throws(() => new ConfirmationCloudClient(() => {}, { ...session(), confirmationJournal: undefined }, new Storage()), { code: 'confirmation_upgrade_required' });
});

test('empty journal and multi-chunk journal are read at one fixed revision and leases are released', async () => {
  const server = new Server(), c = client(server);
  assert.deepEqual((await c.read()).journal, empty());
  server.journal = { ...empty(), trials: [await trial('run-a', '😀'.repeat(35000))] }; server.revision = '1'.repeat(32);
  const result = await c.read();
  assert.deepEqual(result.journal, server.journal); assert.ok(server.calls.filter(row => row.action === 'getConfirmationJournalChunk').length > 2); assert.equal(server.leases.size, 0);
});

test('bad chunk hash rejects all incoming data and releases the lease', async () => {
  const server = new Server(answer('cloud')), rpc = server.rpc.bind(server);
  server.rpc = async (action, input) => { const result = await rpc(action, input); if (action === 'getConfirmationJournalChunk') result.chunkHash = '0'.repeat(64); return result; };
  await assert.rejects(client(server).read(), { code: 'confirmation_hash' }); assert.equal(server.leases.size, 0);
});

test('wrong complete byte length and wrong trial code hash are rejected', async () => {
  const server = new Server(answer('cloud')), rpc = server.rpc.bind(server);
  server.rpc = async (action, input) => { const result = await rpc(action, input); if (action === 'getConfirmationJournal') result.byteLength++; return result; };
  await assert.rejects(client(server).read(), { code: 'confirmation_hash' });
  const bad = { ...empty(), trials: [{ ...await trial('run-a'), codeHash: '0'.repeat(64) }] };
  await assert.rejects(client(new Server(bad)).read(), { code: 'confirmation_hash' });
});

test('a changing cloud revision does not mix chunks with the original read lease', async () => {
  const original = { ...empty(), trials: [await trial('run-a', 'x'.repeat(65000))] }, server = new Server(original), rpc = server.rpc.bind(server);
  server.rpc = async (action, input) => { const result = await rpc(action, input); if (action === 'getConfirmationJournalChunk' && input.index === 0) { server.journal = answer('changed'); server.revision = 'f'.repeat(32); } return result; };
  assert.deepEqual((await client(server).read()).journal, original);
});

test('save chunks, hash and immutable request number match the server and pending is cleared', async () => {
  const server = new Server(), storage = new Storage(), c = client(server, storage), journal = { ...empty(), trials: [await trial('run-a', 'x'.repeat(70000))] };
  const result = await c.save(journal, { expectedRevision: null });
  assert.equal(result.state, 'saved'); assert.deepEqual(server.journal, journal); assert.equal(c.pending(), null);
  const ids = new Set(server.calls.filter(row => /ConfirmationSave|ConfirmationChunk|saveConfirmationJournal/.test(row.action)).map(row => row.input.requestId)); assert.equal(ids.size, 1);
});

test('commit response loss resumes the same immutable request after reload without a duplicate commit', async () => {
  const server = new Server(), storage = new Storage(), first = client(server, storage); server.loseCommit = true;
  await assert.rejects(first.save(answer('first'), { expectedRevision: null }), { code: 'timeout' });
  const id = first.pending().input.requestId, second = client(server, storage), recovered = await second.recover();
  assert.equal(recovered.requestId, id); assert.deepEqual(recovered.sent, answer('first')); assert.equal(second.pending(), null);
  assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, 1);
});

test('interrupted chunks resume received indexes without sending modified new edits under the old request', async () => {
  const server = new Server(), storage = new Storage(), first = client(server, storage), journal = { ...empty(), trials: [await trial('run-a', 'x'.repeat(80000))] };
  let once = true; server.before = (action, input) => { if (once && action === 'putConfirmationChunk' && input.index === 1) { once = false; throw error('timeout'); } };
  await assert.rejects(first.save(journal, { expectedRevision: null }), { code: 'timeout' });
  const id = first.pending().input.requestId, second = client(server, storage), result = await second.save(answer('newer'), { expectedRevision: null });
  assert.equal(result.requestId, id); assert.deepEqual(result.sent, journal);
  assert.equal(server.calls.filter(row => row.action === 'putConfirmationChunk' && row.input.index === 0).length, 1);
});

test('a different actor and a different GSS never pick up another pending request', async () => {
  const server = new Server(), storage = new Storage(), c = client(server, storage); server.before = action => { if (action === 'beginConfirmationSave') throw error('timeout'); };
  await assert.rejects(c.save(answer('private'), { expectedRevision: null }));
  const differentActor = client(server, storage, {}, session('b'));
  const differentStore = client(server, storage, {}, { ...session(), spreadsheetId: 'different-spreadsheet-0001' });
  assert.equal(await differentActor.recover(), null); assert.equal(await differentStore.recover(), null); assert.ok(c.pending());
});

test('pending corruption is retained and prevents a new send', async () => {
  const server = new Server(), storage = new Storage(), c = client(server, storage); storage.setItem(c.prefix + 'pending', '{broken');
  await assert.rejects(c.save(answer('new'), { expectedRevision: null }), { code: 'confirmation_journal_invalid' });
  assert.equal(storage.getItem(c.prefix + 'pending'), '{broken'); assert.equal(server.calls.length, 0);
});

test('browser storage failure warns and keeps the same request in memory for recovery', async () => {
  const server = new Server(), storage = new Storage(); storage.broken = true; let warnings = 0;
  const c = client(server, storage, { warn: () => warnings++ }); server.loseCommit = true;
  await assert.rejects(c.save(answer('held'), { expectedRevision: null }), { code: 'timeout' }); const id = c.pending().input.requestId;
  assert.equal((await c.recover()).requestId, id); assert.equal(warnings, 1); assert.equal(c.pending(), null);
});

test('missing Web Locks prevents unsafe cross-tab upload', async () => {
  const server = new Server(), c = client(server, new Storage(), { locks: null });
  await assert.rejects(c.save(answer('held'), { expectedRevision: null }), { code: 'storage_lock' }); assert.equal(server.calls.length, 0);
});

test('two clients for the same actor serialize access to an existing pending request', async () => {
  const server = new Server(), storage = new Storage(), a = client(server, storage), b = client(server, storage), gate = deferred();
  let blocked = false; server.before = async action => { if (!blocked && action === 'beginConfirmationSave') { blocked = true; await gate.promise; } };
  const one = a.save(answer('a'), { expectedRevision: null });
  while (!blocked) await new Promise(resolve => setTimeout(resolve, 0));
  const two = b.save(answer('b'), { expectedRevision: null }); gate.resolve();
  const results = await Promise.all([one, two]); assert.equal(results[0].state, 'saved'); assert.equal(results[1].state, 'conflict');
  assert.deepEqual(server.journal, answer('a')); assert.deepEqual(results[1].sent, answer('b'));
});

test('three way response merge uses explicit baseline and keeps immutable trials', async () => {
  const old = answer('old'), hashes = { 'v1/check': await codeHash(canonical(old.responses['v1/check'])) };
  const left = { ...answer('old'), trials: [await trial('left')] }, right = { ...answer('remote'), trials: [await trial('right')] };
  const merged = await mergeConfirmationJournals(left, right, hashes);
  assert.deepEqual(merged.keys, []); assert.equal(merged.journal.responses['v1/check'].answer, 'remote'); assert.equal(merged.journal.trials.length, 2);
  const changed = await mergeConfirmationJournals(answer('mine'), answer('remote'), hashes);
  assert.deepEqual(changed.keys, ['v1/check']);
  assert.equal((await mergeConfirmationJournals(answer('mine'), answer('remote'), hashes, { 'v1/check': 'cloud' })).journal.responses['v1/check'].answer, 'remote');
});

test('different bytes under one immutable trial ID are rejected instead of chosen', async () => {
  const a = await trial('same'), b = { ...a, stdout: 'different' };
  await assert.rejects(mergeConfirmationJournals({ ...empty(), trials: [a] }, { ...empty(), trials: [b] }), { code: 'journal_conflict' });
});

test('connect restores first cloud journal, then local edits save without a manual file operation', async () => {
  const server = new Server(answer('cloud')), store = new Store(), sync = new ConfirmationSync(store, client(server), options());
  await sync.connect(); assert.deepEqual(store.snapshot(), answer('cloud')); assert.equal(sync.state().status, 'saved');
  store.journal = answer('local'); sync.edit(); await sync.flush(); assert.deepEqual(server.journal, answer('local')); assert.equal(sync.unsaved(), false); sync.dispose();
});

test('a slow cloud read merges the latest local edit and never replaces it with the initially captured state', async () => {
  const server = new Server(), store = new Store(), gate = deferred(); let blocked = false;
  server.before = async action => { if (action === 'getConfirmationJournal') { blocked = true; await gate.promise; } };
  const sync = new ConfirmationSync(store, client(server), options()), connecting = sync.connect();
  while (!blocked) await new Promise(resolve => setTimeout(resolve, 0));
  store.journal = answer('typed while waiting'); sync.edit(); gate.resolve(); await connecting;
  assert.equal(store.snapshot().responses['v1/check'].answer, 'typed while waiting'); assert.equal(sync.state().dirty, true); sync.dispose();
});

test('first connection with differing answers pauses until both sides are backed up and explicitly selected', async () => {
  const server = new Server({ ...answer('cloud'), trials: [await trial('remote')] }), store = new Store({ ...answer('local'), trials: [await trial('local')] }); let conflicts;
  const sync = new ConfirmationSync(store, client(server), { ...options(), conflict: value => { conflicts = value; } });
  await sync.connect(); assert.equal(sync.state().status, 'conflict'); assert.deepEqual(conflicts.keys, ['v1/check']); assert.equal(store.snapshot().trials.length, 1);
  await assert.rejects(sync.resolve('cloud', { backup: async () => false }), { code: 'confirmation_backup' }); assert.equal(store.snapshot().responses['v1/check'].answer, 'local');
  let preserved;
  await sync.resolve('cloud', { backup: async value => { preserved = value; return true; } });
  assert.equal(preserved.local.responses['v1/check'].answer, 'local'); assert.equal(preserved.remote.responses['v1/check'].answer, 'cloud');
  assert.equal(store.snapshot().trials.length, 2); assert.equal(store.snapshot().responses['v1/check'].answer, 'cloud'); assert.equal(sync.state().dirty, true);
  await sync.flush(); assert.equal(server.journal.trials.length, 2); sync.dispose();
});

test('force flush merges independent CAS changes and waits until the merged journal is saved', async () => {
  const server = new Server(), store = new Store(), c = client(server), sync = new ConfirmationSync(store, c, options()); await sync.connect();
  store.journal.responses['v1/local'] = { answer: 'left' }; sync.edit();
  server.journal.responses['v1/remote'] = { answer: 'right' }; server.revision = '9'.repeat(32);
  await sync.flush(); assert.equal(sync.state().status, 'saved'); assert.equal(c.pending(), null);
  assert.deepEqual(store.snapshot().responses, { 'v1/local': { answer: 'left' }, 'v1/remote': { answer: 'right' } });
  await sync.flush(); assert.deepEqual(server.journal.responses, store.snapshot().responses); assert.equal(sync.state().status, 'saved'); sync.dispose();
});

test('a late background acknowledgement confirms only the sent snapshot and leaves newer edits dirty', async () => {
  const server = new Server(), store = new Store(), sync = new ConfirmationSync(store, client(server), { ...options(), idleMs: 0, maxWaitMs: 0 }); await sync.connect();
  const gate = deferred(); let blocked = false;
  server.before = async action => { if (action === 'saveConfirmationJournal') { blocked = true; await gate.promise; } };
  store.journal = answer('first'); sync.edit(); const saving = sync.flush({ force: false });
  while (!blocked) await new Promise(resolve => setTimeout(resolve, 0));
  store.journal = answer('newer'); sync.edit(); gate.resolve(); await saving;
  assert.deepEqual(server.journal, answer('first')); assert.deepEqual(store.snapshot(), answer('newer')); assert.equal(sync.state().dirty, true); sync.dispose();
});

test('recovery of a saved old request establishes that exact baseline before merging the next edit', async () => {
  const server = new Server(), storage = new Storage(), first = client(server, storage); server.loseCommit = true;
  await assert.rejects(first.save(answer('first'), { expectedRevision: null }));
  const store = new Store(answer('next')), sync = new ConfirmationSync(store, client(server, storage), options());
  await sync.connect(); assert.equal(sync.state().status, 'waiting'); assert.deepEqual(store.snapshot(), answer('next'));
  await sync.flush(); assert.deepEqual(server.journal, answer('next')); sync.dispose();
});

test('authentication failure pauses with local records and pending request retained', async () => {
  const server = new Server(), store = new Store(), c = client(server), sync = new ConfirmationSync(store, c, options()); await sync.connect();
  server.before = action => { if (action === 'beginConfirmationSave') throw error('auth_required'); };
  store.journal = answer('keep'); sync.edit(); await assert.rejects(sync.flush(), { code: 'auth_required' });
  assert.equal(sync.state().status, 'auth'); assert.equal(sync.state().connected, false); assert.ok(c.pending()); assert.deepEqual(store.snapshot(), answer('keep')); sync.dispose();
});

test('dispose while reading prevents a late cloud response from changing the store', async () => {
  const server = new Server(answer('cloud')), store = new Store(), gate = deferred(); let blocked = false;
  server.before = async action => { if (action === 'getConfirmationJournal') { blocked = true; await gate.promise; } };
  const sync = new ConfirmationSync(store, client(server), options()), connecting = sync.connect();
  while (!blocked) await new Promise(resolve => setTimeout(resolve, 0));
  sync.dispose(); gate.resolve(); await connecting; assert.deepEqual(store.snapshot(), empty()); assert.equal(sync.state().status, 'disconnected');
});

test('dispose while waiting for the local storage lock fences the eventual remote adoption', async () => {
  const server = new Server(answer('cloud')), store = new Store(), gate = deferred(); let blocked = false;
  store.beforeAdopt = async () => { blocked = true; await gate.promise; };
  const sync = new ConfirmationSync(store, client(server), options()), connecting = sync.connect();
  while (!blocked) await new Promise(resolve => setTimeout(resolve, 0));
  sync.dispose(); gate.resolve(); await connecting; assert.deepEqual(store.snapshot(), empty()); assert.equal(sync.state().status, 'disconnected');
});

test('a first connection timeout retries reading before any upload and retains local work', async () => {
  const server = new Server(), store = new Store(answer('keep')); let once = true, timer;
  server.before = action => { if (once && action === 'getConfirmationJournal') { once = false; throw error('timeout'); } };
  const sync = new ConfirmationSync(store, client(server), { ...options(), setTimer: fn => { timer = fn; return 1; } });
  await assert.rejects(sync.connect(), { code: 'timeout' }); assert.equal(sync.state().status, 'retry');
  sync.edit(); await sync.flush(); assert.equal(server.calls.filter(row => row.action === 'beginConfirmationSave').length, 0);
  timer(); await sync.queue; assert.equal(sync.state().status, 'waiting'); assert.deepEqual(store.snapshot(), answer('keep'));
  await sync.flush(); assert.deepEqual(server.journal, answer('keep')); sync.dispose();
});

test('an edit queued immediately before remote adoption is preserved by a fresh three way merge', async () => {
  const server = new Server({ ...empty(), trials: [await trial('remote')] }), store = new Store(), actual = store.adoptRemote.bind(store); let once = true;
  store.adoptRemote = async (journal, options) => {
    if (once) { once = false; store.journal = answer('late'); throw error('journal_changed'); }
    return actual(journal, options);
  };
  const sync = new ConfirmationSync(store, client(server), options()); await sync.connect();
  assert.equal(store.snapshot().responses['v1/check'].answer, 'late'); assert.equal(store.snapshot().trials.length, 1); assert.equal(sync.state().dirty, true); sync.dispose();
});

test('RAM-only local records can still reach cloud when no incoming content must replace them', async () => {
  const server = new Server(), storage = new Storage(), store = new Store(answer('RAMのみ')); storage.broken = true;
  store.adoptRemote = async () => { throw error('storage'); };
  const sync = new ConfirmationSync(store, client(server, storage), options());
  await sync.connect(); assert.equal(sync.state().status, 'waiting'); await sync.flush();
  assert.deepEqual(server.journal, answer('RAMのみ')); assert.equal(sync.state().status, 'saved'); sync.dispose();
});

test('different actor reconnect is rejected without sending another account records', async () => {
  const server = new Server(), sync = new ConfirmationSync(new Store(), client(server), options());
  assert.throws(() => sync.reconnect(client(server, new Storage(), {}, session('b'))), { code: 'actor_mismatch' }); assert.equal(server.calls.length, 0); sync.dispose();
});

test('frontend transport saves and reads actual candidate GAS repository chunks without contract translation', async () => {
  const gas = gasFixture({ confirmation: true }), who = JSON.parse(JSON.stringify(gas.call('session'))), storage = new Storage();
  const rpc = async (action, input) => JSON.parse(JSON.stringify(gas.call(action, JSON.parse(JSON.stringify(input)))));
  const c = new ConfirmationCloudClient(rpc, who, storage), journal = { ...answer('保存と復元'), trials: [await trial('actual-contract', '😀'.repeat(35000))] };
  const initial = await c.read(); assert.deepEqual(initial.journal, empty());
  const saved = await c.save(journal, { expectedRevision: initial.revision }); assert.equal(saved.state, 'saved');
  const restored = await c.read(); assert.equal(restored.revision, saved.revision); assert.deepEqual(restored.journal, journal);
  assert.equal(gas.locks.held, false); assert.equal(gas.locks.acquisitions, gas.locks.releases);
});

test('actual candidate GAS response-loss recovery uses the original request and does not append another receipt', async () => {
  const gas = gasFixture({ confirmation: true }), who = JSON.parse(JSON.stringify(gas.call('session'))), storage = new Storage(); let lose = true;
  const rpc = async (action, input) => { const value = JSON.parse(JSON.stringify(gas.call(action, JSON.parse(JSON.stringify(input))))); if (action === 'saveConfirmationJournal' && lose) { lose = false; throw error('timeout'); } return value; };
  const first = new ConfirmationCloudClient(rpc, who, storage);
  await assert.rejects(first.save(answer('通信断後も保持'), { expectedRevision: null }), { code: 'timeout' });
  const requestId = first.pending().input.requestId, second = new ConfirmationCloudClient(rpc, who, storage), recovered = await second.recover();
  assert.equal(recovered.requestId, requestId); assert.deepEqual((await second.read()).journal, answer('通信断後も保持'));
  const receiptKeys = [...gas.confirmationReceipts.cells.entries()].filter(([key, value]) => key.endsWith(',1') && String(value).startsWith('r:'));
  assert.equal(receiptKeys.length, 1);
});

test('same immutable trial set in reverse order is synced without rewriting either history order or canonical bytes', async () => {
  const a = await trial('first'), b = await trial('second'), local = { ...empty(), trials: [a, b] }, remote = { ...empty(), trials: [b, a] };
  assert.equal(sameConfirmationJournal(local, remote), true); assert.notEqual(canonical(local), canonical(remote));
  assert.equal(sameConfirmationJournal(local, { ...remote, trials: [{ ...b, stdout: 'changed' }, a] }), false);
  const server = new Server(remote), store = new Store(local), c = client(server), sync = new ConfirmationSync(store, c, options());
  await sync.connect(); assert.equal(sync.state().status, 'saved'); assert.equal(sync.unsaved(), false); await sync.flush();
  await sync.reconnect(client(server, c.storage)); assert.equal(sync.state().status, 'saved'); await sync.flush();
  assert.deepEqual(store.snapshot().trials.map(value => value.id), ['first', 'second']); assert.deepEqual(server.journal.trials.map(value => value.id), ['second', 'first']);
  assert.equal(server.calls.filter(row => row.action === 'beginConfirmationSave').length, 0); sync.dispose();
});

test('an acknowledgement stays saved when another tab only reverses the same trials during upload', async () => {
  const a = await trial('first'), b = await trial('second'), server = new Server(), store = new Store(), sync = new ConfirmationSync(store, client(server), options()); await sync.connect();
  const gate = deferred(); let blocked = false;
  server.before = async action => { if (action === 'saveConfirmationJournal') { blocked = true; await gate.promise; } };
  store.journal = { ...empty(), trials: [a, b] }; sync.edit(); const saving = sync.flush();
  while (!blocked) await new Promise(resolve => setTimeout(resolve, 0));
  store.journal.trials.reverse(); sync.edit(); gate.resolve(); await saving;
  assert.equal(sync.state().status, 'saved'); assert.equal(sync.state().dirty, false); assert.deepEqual(store.snapshot().trials.map(value => value.id), ['second', 'first']); sync.dispose();
});

test('an expired conflict revision recovers the latest authorized GAS journal after nine bank updates and requires explicit merge before releasing pending', async () => {
  const gas = gasFixture({ confirmation: true }), who = JSON.parse(JSON.stringify(gas.call('session'))), storage = new Storage(), calls = [];
  const rpc = async (action, input) => {
    calls.push({ action, input: copy(input) });
    try { return JSON.parse(JSON.stringify(gas.call(action, JSON.parse(JSON.stringify(input))))); }
    catch (caught) { throw Object.assign(new Error(caught.message), { code: caught.toolsStoreCode }); }
  };
  const writer = new ConfirmationCloudClient(rpc, who, new Storage()), first = new ConfirmationCloudClient(rpc, who, storage);
  let saved = await writer.save(answer('cloud-0'), { expectedRevision: null });
  const conflict = await first.save(answer('local'), { expectedRevision: null }); assert.equal(conflict.state, 'conflict');
  const requestId = conflict.requestId, oldText = first.pending().text;
  const store = new Store(answer('local')), sync = new ConfirmationSync(store, first, options()); await sync.connect(); assert.equal(sync.state().status, 'conflict');
  for (let index = 1; index <= 9; index++) saved = await writer.save(answer('cloud-' + index), { expectedRevision: saved.revision });
  await assert.rejects(rpc('lookupConfirmationSave', { tool: 'python', requestId }), { code: 'confirmation_revision_unavailable' });
  const next = new ConfirmationCloudClient(rpc, who, storage), recovery = await next.recover();
  assert.equal(recovery.previousRevisionUnavailable, true); assert.equal(recovery.revision, saved.revision); assert.deepEqual(recovery.sent, answer('local')); assert.deepEqual(recovery.journal, answer('cloud-9'));
  assert.equal(next.pending().text, oldText); assert.equal(next.pending().input.requestId, requestId);
  await sync.reconnect(next);
  assert.equal(sync.state().status, 'conflict'); assert.equal(next.pending().text, oldText);
  await sync.resolve('local', { backup: async () => false }).catch(caught => { assert.equal(caught.code, 'confirmation_backup'); });
  assert.equal(next.pending().input.requestId, requestId);
  await sync.resolve('local', { backup: async ({ local, remote }) => { assert.deepEqual(local, answer('local')); assert.deepEqual(remote, answer('cloud-9')); return true; } });
  assert.equal(next.pending(), null); assert.equal(sync.state().status, 'waiting'); await sync.flush();
  assert.deepEqual((await next.read()).journal, answer('local')); assert.equal(sync.state().status, 'saved');
  assert.equal(calls.filter(row => row.action === 'beginConfirmationSave' && row.input.requestId === requestId).length, 1); sync.dispose();
});

test('expired conflict fallback preserves pending if the same authorized latest read denies access', async () => {
  const server = new Server(), storage = new Storage(), c = client(server, storage); let phase = 'create';
  server.before = action => {
    if (phase === 'create' && action === 'beginConfirmationSave') throw error('timeout');
    if (phase === 'recover' && action === 'lookupConfirmationSave') throw error('confirmation_revision_unavailable');
    if (phase === 'recover' && action === 'getConfirmationJournal') throw error('permission_denied');
  };
  await assert.rejects(c.save(answer('held'), { expectedRevision: null }), { code: 'timeout' }); const pending = c.pending(); phase = 'recover';
  await assert.rejects(c.recover(), { code: 'permission_denied' }); assert.deepEqual(c.pending(), pending);
  assert.equal(server.calls.filter(row => row.action === 'getConfirmationJournal').length, 1);
});

test('authentication and permission rejection never trigger an alternative latest read', async () => {
  for (const code of ['auth_required', 'permission_denied', 'account_mismatch', 'binding_stale']) {
    const server = new Server(), c = client(server); server.before = action => { if (action === 'beginConfirmationSave') throw error('timeout'); };
    await assert.rejects(c.save(answer('held'), { expectedRevision: null }), { code: 'timeout' }); const pending = c.pending();
    server.before = action => { if (action === 'lookupConfirmationSave') throw error(code); };
    await assert.rejects(c.recover(), { code }); assert.deepEqual(c.pending(), pending);
    assert.equal(server.calls.filter(row => row.action === 'getConfirmationJournal').length, 0);
  }
});

test('confirmation insurance save defaults to ten minutes from first dirty despite continuous input and stays quiet when clean', async () => {
  const server = new Server(), store = new Store(), clock = new Clock(), sync = new ConfirmationSync(store, client(server), clock.options()); await sync.connect();
  store.journal = answer('first'); sync.edit();
  for (let index = 1; index < 10; index++) { await clock.advance(60000); store.journal = answer('continued-' + index); sync.edit(); }
  await clock.advance(59999); assert.deepEqual(server.journal, empty()); await clock.advance(1); assert.deepEqual(server.journal, answer('continued-9'));
  const count = server.calls.filter(row => row.action === 'saveConfirmationJournal').length; await clock.advance(1200000);
  assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, count); sync.dispose();
});

test('confirmation manual flush skips debounce and minimum interval for the next edit', async () => {
  const server = new Server(), store = new Store(), clock = new Clock(), sync = new ConfirmationSync(store, client(server), clock.options()); await sync.connect();
  store.journal = answer('one'); sync.edit(); await sync.flush(); store.journal = answer('two'); sync.edit();
  assert.equal((await sync.flush({ force: true })).status, 'saved'); assert.deepEqual(server.journal, answer('two'));
  assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, 2); sync.dispose();
});

test('confirmation force flush coalesces clicks and waits for edits made during its communication', async () => {
  const server = new Server(), store = new Store(), sync = new ConfirmationSync(store, client(server), options()); await sync.connect();
  const gate = deferred(); let blocked = false;
  server.before = async action => { if (!blocked && action === 'saveConfirmationJournal') { blocked = true; await gate.promise; } };
  store.journal = answer('before'); sync.edit(); const first = sync.flush(); await waitUntil(() => blocked);
  store.journal = answer('after'); sync.edit(); const repeated = sync.flush(); assert.equal(first, repeated); let finished = false; first.then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false); gate.resolve(); assert.equal((await first).status, 'saved'); assert.deepEqual(server.journal, answer('after'));
  assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, 2); await sync.flush(); assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, 2); sync.dispose();
});

test('confirmation manual flush waits behind background communication and then sends the latest edit', async () => {
  const server = new Server(), store = new Store(), sync = new ConfirmationSync(store, client(server), { ...options(), idleMs: 0, maxWaitMs: 0 }); await sync.connect();
  const gate = deferred(); let blocked = false;
  server.before = async action => { if (!blocked && action === 'saveConfirmationJournal') { blocked = true; await gate.promise; } };
  store.journal = answer('before'); sync.edit(); const background = sync.flush({ force: false }); await waitUntil(() => blocked);
  store.journal = answer('newest'); sync.edit(); const manual = sync.flush(); gate.resolve(); await background;
  assert.equal((await manual).status, 'saved'); assert.deepEqual(server.journal, answer('newest')); sync.dispose();
});

test('confirmation flush returns a single lost response and recovers its immutable request using backoff', async () => {
  const server = new Server(), store = new Store(), clock = new Clock(), c = client(server), sync = new ConfirmationSync(store, c, clock.options()); await sync.connect();
  server.loseCommit = true; store.journal = answer('held'); sync.edit(); const first = sync.flush(), repeated = sync.flush(); assert.equal(first, repeated);
  await assert.rejects(first, { code: 'timeout' }); assert.equal(sync.state().status, 'retry'); const requestId = c.pending().input.requestId;
  assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, 1);
  await clock.advance(20000); assert.equal(sync.state().status, 'saved'); assert.equal(c.pending(), null);
  assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, 1);
  assert.ok(server.calls.some(row => row.action === 'lookupConfirmationSave' && row.input.requestId === requestId)); sync.dispose();
});

test('confirmation manual flush queued behind a failed background save leaves retry to backoff', async () => {
  const server = new Server(), store = new Store(), sync = new ConfirmationSync(store, client(server), { ...options(), idleMs: 0, maxWaitMs: 0 }); await sync.connect();
  const gate = deferred(); let blocked = false;
  server.before = async action => { if (action === 'saveConfirmationJournal') { blocked = true; await gate.promise; throw error('timeout'); } };
  store.journal = answer('held'); sync.edit(); const background = sync.flush({ force: false }); await waitUntil(() => blocked); const manual = sync.flush(); gate.resolve();
  await assert.rejects(background, { code: 'timeout' }); assert.equal((await manual).status, 'retry');
  assert.equal(server.calls.filter(row => row.action === 'saveConfirmationJournal').length, 1); sync.dispose();
});

test('confirmation changes during insurance communication start a new ten minute window', async () => {
  const server = new Server(), store = new Store(), clock = new Clock(), sync = new ConfirmationSync(store, client(server), clock.options()); await sync.connect();
  const gate = deferred(); let blocked = false;
  server.before = async action => { if (!blocked && action === 'saveConfirmationJournal') { blocked = true; await gate.promise; } };
  store.journal = answer('first'); sync.edit(); const advancing = clock.advance(600000); await waitUntil(() => blocked);
  store.journal = answer('next'); sync.edit(); gate.resolve(); await advancing; assert.deepEqual(server.journal, answer('first'));
  await clock.advance(599999); assert.deepEqual(server.journal, answer('first')); await clock.advance(1); assert.deepEqual(server.journal, answer('next')); sync.dispose();
});
