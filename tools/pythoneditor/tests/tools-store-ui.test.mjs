import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolsBridge } from '../tools-store.mjs?v=20261017-save-events1';
import { ToolsDraftPanel } from '../tools-store-ui.mjs';

class Storage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
const connection = letter => ({ account: `${letter}@example.invalid`, actorKey: letter.repeat(64), binding: letter,
  storeURL: 'https://script.google.com/macros/s/SYNTHETIC/exec', spreadsheetId: 'synthetic_' + letter.repeat(20), schemaVersion: 1 });
const deferred = () => { let resolve; const promise = new Promise(fn => { resolve = fn; }); return { promise, resolve }; };

test('a late cached account session cannot replace a newer manual connection or its cache', async () => {
  const original = ToolsBridge.prototype.connect, previous = new Map(['window','document','localStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const a = connection('a'), b = connection('b'), pending = { a: deferred(), b: deferred() }, cached = [];
  Object.assign(globalThis, { window: {}, document: {}, localStorage: new Storage() });
  ToolsBridge.prototype.connect = function () { return pending[this.binding].promise; };
  const panel = Object.assign(Object.create(ToolsDraftPanel.prototype), { generation: 0, loads: new Map(), update() {},
    host: { draftEntries: () => [], question: () => null }, cache: item => cached.push(item.account) });
  try {
    const stale = panel.attach(a), current = panel.attach(b);
    pending.b.resolve(b); assert.equal(await current, true);
    const currentBridge = panel.bridge;
    pending.a.resolve(a); assert.equal(await stale, false);
    assert.equal(panel.connected, true); assert.equal(panel.client.session.account, b.account);
    assert.equal(panel.bridge, currentBridge); assert.deepEqual(cached, [b.account]);
  } finally {
    panel.auto?.dispose(); panel.bridge?.dispose(); ToolsBridge.prototype.connect = original;
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
test('switching accounts protects and separates the previous account conflict preview', async () => {
  const original = ToolsBridge.prototype.connect, previous = new Map(['window','document','localStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const b = connection('b'), archived = [], closed = [];
  Object.assign(globalThis, { window: {}, document: { getElementById: id => ({ close: () => closed.push(id) }) }, localStorage: new Storage() });
  ToolsBridge.prototype.connect = async function () { return b; };
  const draft = { questionId: 'code', version: 'v1', code: 'account A cloud answer', stdin: '' };
  const panel = Object.assign(Object.create(ToolsDraftPanel.prototype), { generation: 0, loads: new Map(), update() {}, cache() {},
    client: { session: connection('a') }, conflicts: new Map([['v1/code', { draft }]]), conflict: { draft },
    host: { draftEntries: () => [], question: () => null, archive: (value, reason) => archived.push({ value, reason }) } });
  try {
    await panel.attach(b);
    assert.equal(panel.client.session.account, b.account); assert.equal(panel.conflicts.size, 0); assert.equal(panel.conflict, null);
    assert.equal(archived[0].value.code, draft.code); assert.match(archived[0].reason, /切り替え前/);
    assert.deepEqual(closed, ['cloud-conflict', 'confirmation-cloud-conflict']);
  } finally {
    panel.auto?.dispose(); panel.bridge?.dispose(); ToolsBridge.prototype.connect = original;
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});

function savePanel(overrides = {}) {
  return Object.assign(Object.create(ToolsDraftPanel.prototype), { generation: 1, connected: true, loads: new Map(),
    update() {}, showConflict() {}, showConfirmationConflict() {},
    host: { confirmationStore: { snapshot: () => ({ trials: [], responses: {} }) } },
    auto: { edit() {}, flush: async () => ({ saved: true, statuses: [] }), unsaved: () => false }, ...overrides });
}
test('transition fixes the old question before awaiting trial writes, then flushes code and confirmation records', async () => {
  const pending = deferred(), events = [], old = { questionId: 'old', version: 'v1', kind: 'code' };
  const entry = { code: 'old snapshot', updatedAt: '2026-10-17T00:00:00Z' };
  const panel = savePanel({ host: { pendingRecords: () => pending.promise },
    auto: { edit: (q, value) => events.push(['edit', q.questionId, value.code]), flush: async () => { events.push(['code']); return { saved: true, statuses: [] }; }, unsaved: () => false },
    confirmation: { flush: async () => { events.push(['confirmation']); return { status: 'saved' }; }, unsaved: () => false } });
  const saving = panel.saveAll(old, entry);
  assert.deepEqual(events, [['edit', 'old', 'old snapshot']]);
  panel.host.question = () => { throw Error('must not read the new selection'); };
  pending.resolve(); assert.deepEqual(await saving, { connected: true, saved: true });
  assert.deepEqual(events, [['edit', 'old', 'old snapshot'], ['code'], ['confirmation']]);
});
test('a replaced connection and authentication failure cannot become finish-save success', async () => {
  for (const cause of ['generation', 'auth']) {
    let confirmationWrites = 0; const panel = savePanel();
    panel.auto.flush = async () => { if (cause === 'generation') panel.generation++; else panel.connected = false; return { saved: true, statuses: [] }; };
    panel.confirmation = { flush: async () => { confirmationWrites++; return { status: 'saved' }; }, unsaved: () => false };
    assert.deepEqual(await panel.saveAll(), { connected: false, saved: false }); assert.equal(confirmationWrites, 0);
  }
});
test('finish-save does not accept conflict, pending edits, or an unprepared confirmation store as saved', async () => {
  for (const kind of ['conflict', 'pending', 'confirmation']) {
    const panel = savePanel();
    if (kind === 'conflict') panel.auto.flush = async () => ({ saved: true, statuses: [{ status: 'conflict', dirty: false }] });
    if (kind === 'pending') panel.auto.unsaved = () => true;
    if (kind === 'confirmation') { panel.confirmationUnavailable = true; panel.host.confirmationStore.snapshot = () => ({ trials: [{}], responses: {} }); }
    assert.deepEqual(await panel.saveAll(), { connected: true, saved: false });
  }
});
