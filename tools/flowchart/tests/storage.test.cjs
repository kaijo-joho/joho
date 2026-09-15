const assert = require('node:assert/strict');
const Core = require('../core.js');
const Storage = require('../storage.js');
const cases = [];
function test(name, run) { run(); cases.push(name); }
function memory(initial = {}) { const data = new Map(Object.entries(initial)); return { data, getItem(key) { return data.has(key) ? data.get(key) : null; }, setItem(key, value) { data.set(key, value); } }; }
const sample = () => Core.createTemplate('flow-branch');

test('Automatic and manual browser saves remain separate', () => {
  const store = memory(), doc = sample(), manual = Core.clone(doc); manual.title = '明示保存';
  Storage.writeBrowser(store, 'auto', doc, { saved: Core.serializeDocument(manual), savedAt: '2026-09-15T00:00:00.000Z' });
  Storage.writeBrowser(store, 'manual', manual, { savedAt: '2026-09-15T01:00:00.000Z' });
  const loaded = Storage.readBrowser(store);
  assert.equal(loaded.auto.document.title, doc.title); assert.equal(loaded.auto.saved, Core.serializeDocument(manual));
  assert.equal(loaded.manual.document.title, manual.title); assert.notEqual(store.data.get(Storage.AUTO_KEY), store.data.get(Storage.MANUAL_KEY));
});
test('Unsaved state stays empty and matching saved data is omitted from browser storage', () => {
  const store = memory(), doc = sample();
  const first = Storage.writeBrowser(store, 'auto', doc); assert.equal(first.saved, '');
  const second = Storage.writeBrowser(store, 'manual', doc, { saved: Core.serializeDocument(doc) });
  assert.equal(second.saved, Core.serializeDocument(doc)); assert.equal(Object.hasOwn(JSON.parse(store.data.get(Storage.MANUAL_KEY)), 'saved'), false);
  assert.equal(Storage.readBrowser(store).manual.saved, Core.serializeDocument(doc));
});
test('Manual browser saving uses its document as the saved baseline by default', () => {
  const store = memory(), doc = sample(), result = Storage.writeBrowser(store, 'manual', doc);
  assert.equal(result.saved, Core.serializeDocument(doc)); assert.equal(Storage.readBrowser(store).manual.saved, Core.serializeDocument(doc));
});
test('Reading never rewrites storage and keeps the usable half of corrupt records', () => {
  const doc = sample(), store = memory({ [Storage.AUTO_KEY]: JSON.stringify({ format: 'kaijo-diagram-snapshot', version: 1, document: doc, method: 'auto', location: 'browser', savedAt: null, view: null, saved: Core.serializeDocument(doc) }), [Storage.MANUAL_KEY]: '{broken' });
  const before = [...store.data.entries()]; const loaded = Storage.readBrowser(store);
  assert.equal(loaded.auto.document.id, doc.id); assert.equal(loaded.manual, null); assert.equal(loaded.errors[0].method, 'manual'); assert.deepEqual([...store.data.entries()], before);
});
test('Storage quota and security failures preserve existing snapshots', () => {
  const doc = sample(), store = memory(); Storage.writeBrowser(store, 'manual', doc); const before = store.data.get(Storage.MANUAL_KEY);
  store.setItem = () => { throw new Error('SecurityError'); }; assert.throws(() => Storage.writeBrowser(store, 'manual', doc)); assert.equal(store.data.get(Storage.MANUAL_KEY), before);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() {} }; const result = Storage.readBrowser(blocked); assert.equal(result.errors.length, 2);
});
test('Old recovery offers a memory-only manual candidate only when its document id matches', () => {
  const doc = sample(), changed = Core.clone(doc); changed.title = '作業中';
  const store = memory({ [Storage.AUTO_KEY]: JSON.stringify({ document: changed, saved: Core.serializeDocument(doc), view: { x: 1, y: 2, scale: 1 } }) });
  const loaded = Storage.readBrowser(store); assert.equal(loaded.auto.legacy, true); assert.equal(loaded.manual.legacy, true); assert.equal(loaded.manual.document.title, doc.title);
  const other = sample(); store.data.set(Storage.AUTO_KEY, JSON.stringify({ document: changed, saved: Core.serializeDocument(other), view: null })); assert.equal(Storage.readBrowser(store).manual, null);
  store.data.set(Storage.MANUAL_KEY, '{broken'); assert.equal(Storage.readBrowser(store).manual, null);
});
test('Malformed and mismatched snapshots do not become recovery candidates', () => {
  const doc = sample(), other = sample();
  const store = memory({ [Storage.AUTO_KEY]: JSON.stringify({ format: 'kaijo-diagram-snapshot', version: 1, document: doc, method: 'manual', location: 'browser', savedAt: null, view: null, saved: Core.serializeDocument(other) }) });
  const loaded = Storage.readBrowser(store); assert.equal(loaded.auto, null); assert.equal(loaded.errors.length, 1);
});
test('Files round trip new metadata and accept old files with file time', () => {
  const doc = sample(), saved = Storage.serializeFile(doc, { method: 'auto', savedAt: '2026-09-15T03:04:05+09:00' }), fresh = Storage.parseFile(saved);
  assert.equal(fresh.method, 'auto'); assert.equal(fresh.savedAt, '2026-09-14T18:04:05.000Z'); assert.equal(fresh.legacy, undefined); assert.deepEqual(fresh.document, Core.parseDocument(doc));
  assert.equal(fresh.saved, '', 'An automatic file is not an explicit-save baseline');
  const old = Storage.parseFile(Core.serializeDocument(doc), { lastModified: '2026-09-15T00:00:00Z' }); assert.equal(old.method, 'manual'); assert.equal(old.savedAt, '2026-09-15T00:00:00.000Z'); assert.equal(old.legacy, true);
});
test('File byte limits and broken saveInfo are handled safely', () => {
  const doc = sample(), broken = { ...doc, saveInfo: { method: 'other', savedAt: 'nope' } }; const loaded = Storage.parseFile(JSON.stringify(broken));
  assert.equal(loaded.method, 'manual'); assert.equal(loaded.legacy, true); assert.throws(() => Storage.parseFile('x'.repeat(2 * 1024 * 1024 + 1))); assert.throws(() => Storage.serializeFile({ ...doc, title: 'x'.repeat(1000) }));
});
console.log(`storage tests passed: ${cases.length}`);
