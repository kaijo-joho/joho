import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ConfirmationStore, validateJournal, CONFIRMATION_STORAGE_KEY, LEGACY_CONFIRMATION_STORAGE_KEY, JOURNAL_LIMITS } from '../confirmation-store.mjs';

class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
}
const source = { questionId: 'source', version: 'v1' };
const hash = code => createHash('sha256').update(code).digest('hex');
const run = (changes = {}) => ({ source: { ...source }, code: 'print("north")', inputs: [{ prompt: '方向: ', value: '北' }],
  stdout: 'north\n', stderr: '', outcome: 'success', truncated: false, at: '2026-10-16T01:02:03.000Z', ...changes });
const trial = (id = 'trial-1', changes = {}) => {
  const value = run(changes);
  return { schema: 1, id, ...value, codeHash: hash(value.code) };
};
const journal = (trials = [], responses = {}) => ({ schema: 1, trials, responses });

test('portable journal preserves code, consumed inputs, output and responses without object aliases', async () => {
  const raw = journal([trial()], { 'v1/check': { answer: 0, selections: { conditionB: 'trial-1', conditionA: 'trial-1' } } });
  const value = validateJournal(raw);
  assert.deepEqual(value.responses['v1/check'], { answer: 0, selections: { conditionA: 'trial-1', conditionB: 'trial-1' } });
  raw.trials[0].inputs[0].value = '変更';
  raw.responses['v1/check'].answer = 1;
  assert.equal(value.trials[0].inputs[0].value, '北');
  assert.equal(value.responses['v1/check'].answer, 0);
});

test('portable journal refuses unknown metadata, scores, malformed versions and selection references', async () => {
  for (const value of [
    { ...journal(), actorKey: 'private-account' },
    journal([{ ...trial(), score: 100 }]),
    journal([], { 'v1/check': { correct: true } }),
    journal([], { 'v1/check': { answer: Infinity } }),
    journal([], { 'check': { answer: 'yes' } }),
    journal([], { 'v1/check': { selections: { first: 'missing' } } }),
    journal([{ ...trial(), source: { questionId: 'source', version: '../v1' } }]),
    journal([{ ...trial(), at: 'not-a-time' }]),
    journal([{ ...trial(), codeHash: 'wrong' }]),
    { schema: 2, trials: [], responses: {} },
    JSON.parse('{"schema":1,"trials":[],"responses":{"__proto__":{"answer":1}}}')
  ]) assert.throws(() => validateJournal(value));
});

test('even identical duplicate trial IDs are refused within a portable journal', async () => {
  assert.throws(() => validateJournal(journal([trial(), trial()])), /重複/);
});

test('record generates identity and SHA-256, reloads from a dedicated key and filters explicit versions', async () => {
  const storage = new MemoryStorage();
  const store = new ConfirmationStore(storage);
  const recorded = await store.record(run());
  assert.match(recorded.id, /^trial-[a-f0-9-]{36}$/);
  assert.equal(recorded.codeHash, hash(recorded.code));
  assert.equal(recorded.schema, 1);
  assert.equal(recorded.at, '2026-10-16T01:02:03.000Z');
  await store.record(run({ source: { questionId: 'source', version: 'v2' }, code: 'print(2)' }));
  assert.equal(store.lastError, null);
  assert.deepEqual([...storage.data.keys()], [CONFIRMATION_STORAGE_KEY]);
  const reloaded = new ConfirmationStore(storage);
  assert.equal(reloaded.trials([source]).length, 1);
  assert.equal(reloaded.trials([{ ...source, version: 'v2' }]).length, 1);
  assert.deepEqual(reloaded.trials([]), []);
  assert.equal(reloaded.snapshot().trials.length, 2);
  recorded.code = 'changed';
  reloaded.snapshot().trials[0].code = 'changed';
  reloaded.trials([source])[0].inputs[0].value = 'changed';
  assert.equal(store.snapshot().trials[0].code, 'print("north")');
  assert.equal(reloaded.trials([source])[0].inputs[0].value, '北');
});

test('record snapshots its input before asynchronous hashing and concurrent calls retain both runs', async () => {
  const store = new ConfirmationStore(new MemoryStorage()), input = run();
  const first = store.record(input);
  input.source.version = 'v9'; input.code = 'changed'; input.inputs[0].value = 'changed';
  const [a, b] = await Promise.all([first, store.record(run({ code: 'print(2)' }))]);
  assert.notEqual(a.id, b.id);
  assert.equal(a.source.version, 'v1'); assert.equal(a.code, 'print("north")'); assert.equal(a.inputs[0].value, '北');
  assert.equal(store.snapshot().trials.length, 2);
});

test('error, stop, environment failure, EOF and truncated runs remain available as history', async () => {
  const store = new ConfirmationStore(new MemoryStorage());
  for (const outcome of ['error', 'stopped', 'environment_error'])
    await store.record(run({ outcome, stderr: 'error details', inputs: [{ prompt: '値: ', value: '', eof: true }], truncated: true }));
  assert.deepEqual(store.trials([source]).map(t => t.outcome), ['error', 'stopped', 'environment_error']);
  assert.ok(store.trials([source]).every(t => t.truncated && t.inputs[0].eof && t.stderr === 'error details'));
});

test('record supplies a timestamp but rejects caller IDs, hashes, unknown fields and unknown schemas', async () => {
  const store = new ConfirmationStore(new MemoryStorage()), input = run(); delete input.at;
  const recorded = await store.record(input);
  assert.ok(Number.isFinite(Date.parse(recorded.at)));
  for (const extra of [{ id: 'chosen' }, { codeHash: hash('other') }, { score: 3 }, { schema: 2 }]) {
    await assert.rejects(store.record(run(extra)));
    assert.ok(store.lastError);
  }
  assert.equal(store.snapshot().trials.length, 1);
});

test('responses are versioned, can be explicitly edited and round-trip zero and selected run IDs', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage), value = await store.record(run());
  await store.setResponse('v1/check', { answer: 0, selections: { first: value.id } });
  await store.setResponse('v2/check', { answer: 'later' });
  await store.setResponse('v1/check', { answer: 3, selections: { first: value.id } });
  const reloaded = new ConfirmationStore(storage);
  assert.deepEqual(reloaded.response('v1/check'), { answer: 3, selections: { first: value.id } });
  assert.deepEqual(reloaded.response('v2/check'), { answer: 'later' });
  assert.equal(reloaded.response('v1/missing'), null);
  reloaded.response('v1/check').selections.first = 'changed';
  assert.equal(reloaded.response('v1/check').selections.first, value.id);
});

test('quota failure retains all new trials and answers in memory and a later write recovers them', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage), originalSet = storage.setItem;
  await store.record(run());
  const persisted = storage.getItem(CONFIRMATION_STORAGE_KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  await store.record(run({ code: 'print(2)' }));
  assert.equal(store.lastError.code, 'storage');
  await store.setResponse('v1/check', { answer: 'kept' });
  assert.equal(store.snapshot().trials.length, 2);
  assert.equal(store.response('v1/check').answer, 'kept');
  assert.equal(storage.getItem(CONFIRMATION_STORAGE_KEY), persisted);
  storage.setItem = originalSet;
  await store.setResponse('v1/second', { answer: 0 });
  assert.equal(store.lastError, null);
  assert.equal(new ConfirmationStore(storage).snapshot().trials.length, 2);
  assert.equal(new ConfirmationStore(storage).response('v1/check').answer, 'kept');
});

test('unavailable or unreadable storage leaves usable in-memory recording', async () => {
  for (const storage of [null, { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }]) {
    const store = new ConfirmationStore(storage);
    assert.equal(store.lastError.code, 'storage');
    await store.record(run());
    await store.setResponse('v1/check', { answer: 2 });
    assert.equal(store.snapshot().trials.length, 1);
    assert.equal(store.response('v1/check').answer, 2);
    assert.equal(store.lastError.code, 'storage');
  }
});

test('corrupt or future-version browser journals are not overwritten by recording or restoring', async () => {
  for (const raw of ['{broken', JSON.stringify({ schema: 2, trials: [], responses: {} })]) {
    const storage = new MemoryStorage(); storage.setItem(CONFIRMATION_STORAGE_KEY, raw);
    const store = new ConfirmationStore(storage);
    assert.equal(store.lastError.code, 'storage_invalid');
    await store.record(run());
    await store.restore(journal([trial('old-trial', { source: { ...source, version: 'v0' } })]));
    assert.equal(store.snapshot().trials.length, 2);
    assert.equal(storage.getItem(CONFIRMATION_STORAGE_KEY), raw);
    assert.equal(store.lastError.code, 'storage_invalid');
  }
});

test('merge restores older versions, preserves local trials and answers and deduplicates identical IDs', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage), value = await store.record(run());
  await store.setResponse('v1/check', { answer: 'local' });
  const older = trial('old-trial', { source: { ...source, version: 'v0' } });
  await store.restore(journal([value, older], { 'v0/check': { answer: 'old' } }));
  await store.restore(journal([older], { 'v0/check': { answer: 'old' } }));
  assert.deepEqual(store.snapshot().trials.map(t => t.id), [value.id, 'old-trial']);
  assert.equal(store.trials([{ ...source, version: 'v0' }]).length, 1);
  assert.equal(store.response('v1/check').answer, 'local');
  assert.equal(store.response('v0/check').answer, 'old');
  assert.deepEqual(new ConfirmationStore(storage).snapshot(), store.snapshot());
});

test('conflicting trial IDs, responses, malformed import and destructive restore are atomic refusals', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage), value = await store.record(run());
  await store.setResponse('v1/check', { answer: 1 });
  const before = store.snapshot(), persisted = storage.getItem(CONFIRMATION_STORAGE_KEY);
  for (const [input, options] of [
    [journal([trial('new'), { ...value, stdout: 'different' }])],
    [journal([trial('new')], { 'v1/check': { answer: 2 } })],
    [{ ...journal(), schema: 7 }],
    [journal(), { merge: false }]
  ]) {
    await assert.rejects(store.restore(input, options));
    assert.ok(store.lastError);
    assert.deepEqual(store.snapshot(), before);
    assert.equal(storage.getItem(CONFIRMATION_STORAGE_KEY), persisted);
  }
});

test('semantically identical selections with a different property order do not cause false conflicts', async () => {
  const store = new ConfirmationStore(new MemoryStorage());
  await store.restore(journal([trial('one'), trial('two')], { 'v1/check': { selections: { b: 'two', a: 'one' } } }));
  await store.restore(journal([trial('two'), trial('one')], { 'v1/check': { selections: { a: 'one', b: 'two' } } }));
  assert.equal(store.snapshot().trials.length, 2);
  assert.equal(store.lastError, null);
});

test('record count limit refuses a new record without evicting any previous record', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage);
  const many = Array.from({ length: JOURNAL_LIMITS.trials }, (_, index) => trial('t' + index));
  await store.restore(journal(many));
  const saved = storage.getItem(CONFIRMATION_STORAGE_KEY);
  await assert.rejects(store.record(run()), error => error.code === 'journal_limit');
  assert.equal(store.lastError.code, 'journal_limit');
  assert.equal(store.snapshot().trials.length, JOURNAL_LIMITS.trials);
  assert.equal(store.snapshot().trials[0].id, 't0');
  assert.equal(storage.getItem(CONFIRMATION_STORAGE_KEY), saved);
});

test('total byte limit accounts for UTF-8 and refuses imports without removing prior history', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage); await store.record(run());
  const before = store.snapshot(), saved = storage.getItem(CONFIRMATION_STORAGE_KEY);
  const large = Array.from({ length: 10 }, (_, index) => trial('large' + index, { code: '#日本語'.repeat(45000) }));
  await assert.rejects(store.restore(journal(large)), error => error.code === 'journal_limit');
  assert.deepEqual(store.snapshot(), before);
  assert.equal(storage.getItem(CONFIRMATION_STORAGE_KEY), saved);
});

test('two tabs retain independently appended trials and non-conflicting answers', async () => {
  const storage = new MemoryStorage(), first = new ConfirmationStore(storage), second = new ConfirmationStore(storage);
  const a = await first.record(run());
  const b = await second.record(run({ code: 'print(2)' }));
  await second.setResponse('v1/second', { answer: 2 });
  await first.setResponse('v1/first', { answer: 1 });
  const latest = new ConfirmationStore(storage);
  assert.deepEqual(new Set(latest.snapshot().trials.map(t => t.id)), new Set([a.id, b.id]));
  assert.equal(latest.response('v1/first').answer, 1);
  assert.equal(latest.response('v1/second').answer, 2);
});

test('two-tab answer conflict refuses to overwrite either the local or persisted answer', async () => {
  const storage = new MemoryStorage(), initial = new ConfirmationStore(storage);
  await initial.setResponse('v1/check', { answer: 1 });
  const first = new ConfirmationStore(storage), second = new ConfirmationStore(storage);
  await first.setResponse('v1/check', { answer: 2 });
  await assert.rejects(second.setResponse('v1/check', { answer: 3 }), error => error.code === 'journal_conflict');
  assert.equal(second.response('v1/check').answer, 1);
  assert.equal(new ConfirmationStore(storage).response('v1/check').answer, 2);
  assert.equal(second.lastError.code, 'journal_conflict');
});

test('a newly visible tab update before a write is merged rather than discarded', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage), get = storage.getItem.bind(storage);
  let reads = 0;
  storage.getItem = key => {
    if (++reads === 2) storage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(journal([trial('other-tab')])));
    return get(key);
  };
  const value = await store.record(run());
  assert.equal(store.lastError, null);
  assert.deepEqual(new Set(store.snapshot().trials.map(t => t.id)), new Set([value.id, 'other-tab']));
  assert.equal(new ConfirmationStore(storage).snapshot().trials.length, 2);
});

test('failed readback reports uncertainty and keeps the complete in-memory record', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage), set = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { set(key, value); storage.getItem = () => { throw new Error('readback denied'); }; };
  await store.record(run());
  assert.equal(store.snapshot().trials.length, 1);
  assert.equal(store.lastError.code, 'storage');
  assert.equal(JSON.parse(storage.data.get(CONFIRMATION_STORAGE_KEY)).trials.length, 1);
});

test('clearing the browser key in another tab does not delete answers or trials from memory', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage);
  await store.record(run()); await store.setResponse('v1/check', { answer: 'retain' });
  storage.data.delete(CONFIRMATION_STORAGE_KEY);
  await store.record(run({ code: 'print(2)' }));
  assert.equal(store.snapshot().trials.length, 2);
  assert.equal(new ConfirmationStore(storage).response('v1/check').answer, 'retain');
});

test('a new execution stays in memory when an earlier unsaved answer conflicts with another tab', async () => {
  const storage = new MemoryStorage(), first = new ConfirmationStore(storage), set = storage.setItem.bind(storage);
  await first.setResponse('v1/check', { answer: 'initial' });
  storage.setItem = () => { throw new Error('temporarily unavailable'); };
  await first.setResponse('v1/check', { answer: 'local pending' });
  storage.setItem = set;
  const second = new ConfirmationStore(storage); await second.setResponse('v1/check', { answer: 'remote' });
  const value = await first.record(run());
  assert.equal(first.lastError.code, 'journal_conflict');
  assert.equal(first.snapshot().trials[0].id, value.id);
  assert.equal(first.response('v1/check').answer, 'local pending');
  assert.equal(new ConfirmationStore(storage).response('v1/check').answer, 'remote');
});

test('response count limit refuses an oversized journal and leaves existing answers intact', async () => {
  const store = new ConfirmationStore(new MemoryStorage()); await store.setResponse('v1/check', { answer: 1 });
  const responses = Object.fromEntries(Array.from({ length: JOURNAL_LIMITS.responses + 1 }, (_, index) => ['v1/q' + index, { answer: index }]));
  await assert.rejects(store.restore(journal([], responses)), error => error.code === 'journal_limit');
  assert.deepEqual(store.snapshot().responses, { 'v1/check': { answer: 1 } });
});

test('a second tab entering during the first write waits and retains both answers', async () => {
  const storage = new MemoryStorage(), a = new ConfirmationStore(storage), b = new ConfirmationStore(storage);
  const set = storage.setItem.bind(storage); let second;
  storage.setItem = (key, value) => {
    if (!second) second = b.setResponse('v1/second', { answer: 'B' });
    set(key, value);
  };
  await a.setResponse('v1/first', { answer: 'A' }); await second;
  assert.equal(a.lastError, null); assert.equal(b.lastError, null);
  assert.deepEqual(new ConfirmationStore(storage).snapshot().responses, {
    'v1/first': { answer: 'A' }, 'v1/second': { answer: 'B' }
  });
});

test('legacy journals migrate on first write while the old key remains byte-for-byte intact', async () => {
  const storage = new MemoryStorage(), legacy = JSON.stringify(journal([trial()], { 'v1/old': { answer: 7 } }));
  storage.setItem(LEGACY_CONFIRMATION_STORAGE_KEY, legacy);
  const store = new ConfirmationStore(storage);
  assert.equal(store.snapshot().trials.length, 1);
  await store.setResponse('v1/new', { answer: 8 });
  assert.equal(storage.getItem(LEGACY_CONFIRMATION_STORAGE_KEY), legacy);
  assert.equal(new ConfirmationStore(storage).response('v1/new').answer, 8);
  storage.setItem(LEGACY_CONFIRMATION_STORAGE_KEY, JSON.stringify(journal([trial('late-old-tab')])));
  assert.equal(store.legacySnapshot().trials[0].id, 'late-old-tab');
  assert.equal(store.snapshot().trials[0].id, 'trial-1');
});

test('unsupported cross-tab locking keeps new work in memory and reports a storage warning', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage, { locks: null });
  await store.setResponse('v1/check', { answer: 8 });
  assert.equal(store.response('v1/check').answer, 8);
  assert.equal(store.lastError.code, 'storage_lock');
  assert.equal(storage.getItem(CONFIRMATION_STORAGE_KEY), null);
});

test('pending answer writes can be awaited and other-tab refresh does not trigger write ping-pong', async () => {
  const storage = new MemoryStorage(), first = new ConfirmationStore(storage), second = new ConfirmationStore(storage);
  let changes = 0; first.subscribe(() => changes++);
  first.setResponse('v1/first', { answer: 1 }); await first.idle();
  assert.equal(changes, 1);
  await second.setResponse('v1/second', { answer: 2 });
  const bytes = storage.getItem(CONFIRMATION_STORAGE_KEY);
  await first.refresh();
  assert.equal(first.response('v1/second').answer, 2);
  assert.equal(storage.getItem(CONFIRMATION_STORAGE_KEY), bytes);
});

test('cloud merge retains new local trials, backs up replaced answers and refuses late overwrites', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage);
  await store.setResponse('v1/check', { answer: 'before' }); const expectedLocal = store.snapshot();
  const localTrial = await store.record(run());
  await store.adoptRemote(journal([trial('remote')], { 'v1/check': { answer: 'cloud' } }), { expectedLocal });
  assert.equal(store.response('v1/check').answer, 'cloud');
  assert.deepEqual(new Set(store.snapshot().trials.map(t => t.id)), new Set([localTrial.id, 'remote']));
  assert.equal(store.backups()[0].journal.responses['v1/check'].answer, 'before');
  const before = store.snapshot();
  await assert.rejects(store.adoptRemote(journal([], { 'v1/check': { answer: 'late cloud' } }), { expectedLocal }), e => e.code === 'journal_changed');
  assert.deepEqual(store.snapshot(), before);
});

test('cloud replacement stops if a durable before-copy cannot be stored', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage);
  await store.setResponse('v1/check', { answer: 'local' }); const before = store.snapshot();
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(store.adoptRemote(journal([], { 'v1/check': { answer: 'remote' } }), { expectedLocal: before }), e => e.code === 'storage_backup');
  assert.deepEqual(store.snapshot(), before);
});
test('idle waits for execution hashing as well as the later storage commit', async () => {
  const store = new ConfirmationStore(new MemoryStorage()), digest = crypto.subtle.digest.bind(crypto.subtle);
  let release; const held = new Promise(resolve => { release = resolve; });
  crypto.subtle.digest = async (...args) => { await held; return digest(...args); };
  try {
    const recording = store.record(run()); let idle = false;
    const waiting = store.idle().then(() => { idle = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(idle, false); assert.equal(store.snapshot().trials.length, 0);
    release(); await recording; await waiting;
    assert.equal(idle, true); assert.equal(store.snapshot().trials.length, 1);
  } finally { release(); crypto.subtle.digest = digest; }
});
test('refresh cannot clear a quota warning while new trials exist only in memory', async () => {
  const storage = new MemoryStorage(), store = new ConfirmationStore(storage);
  await store.setResponse('v1/check', { answer: 'saved' });
  const set = storage.setItem.bind(storage); storage.setItem = () => { throw new Error('quota'); };
  await store.record(run()); assert.equal(store.lastError.code, 'storage');
  await store.refresh(); assert.equal(store.lastError.code, 'storage');
  assert.equal(new ConfirmationStore(storage).snapshot().trials.length, 0); assert.equal(store.snapshot().trials.length, 1);
  storage.setItem = set; await store.setResponse('v1/check', { answer: 'saved' }); await store.refresh();
  assert.equal(store.lastError, null); assert.equal(new ConfirmationStore(storage).snapshot().trials.length, 1);
});
