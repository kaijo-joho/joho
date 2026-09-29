const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Core = require('../core.js'), source = fs.readFileSync(path.join(__dirname, '..', 'document-store.js'), 'utf8');
function loadCommonJS() { const module = { exports: {} }; vm.runInNewContext(source, { module, require: request => { assert.equal(request, './core.js'); return Core; }, globalThis: {}, Date, JSON, Number, Array, Object, RegExp, TypeError, RangeError, Error, Set }, { filename: 'document-store.js' }); return module.exports; }
function loadBrowser() { const window = { IlapoCore: Core }; vm.runInNewContext(source, { globalThis: window, Date, JSON, Number, Array, Object, RegExp, TypeError, RangeError, Error, Set }, { filename: 'document-store.js' }); return window.IlapoDocumentStore; }
class MemoryStorage { constructor() { this.values = new Map(); } get length() { return this.values.size; } key(index) { return Array.from(this.values.keys())[index] ?? null; } getItem(key) { return this.values.has(key) ? this.values.get(key) : null; } setItem(key, value) { this.values.set(key, String(value)); } }
function documentWith(id, name) { const value = Core.createDocument(); value.id = id; value.name = name; return Core.validateDocument(value); }
const DocumentStore = loadCommonJS(); assert.equal(typeof DocumentStore, 'function'); assert.equal(typeof loadBrowser(), 'function');
const storage = new MemoryStorage(), store = new DocumentStore(storage), duplicateId = documentWith('shared-document', 'first');
const auto = store.save(duplicateId, 'auto', 'tab_A'); store.save(duplicateId, 'saved', 'tab_A'); store.save(Object.assign({}, duplicateId, { name: 'second tab' }), 'auto', 'tab_B');
assert(storage.getItem('kaijo-ilapo:document:tab_A:auto')); assert(storage.getItem('kaijo-ilapo:document:tab_B:auto'), 'same document.id does not merge tabs'); assert.equal(store.list().filter(entry => !entry.legacy).length, 3);
assert.notStrictEqual(auto.document, duplicateId); auto.document.name = 'mutated return'; assert.notEqual(store.list().find(entry => entry.storageId === 'tab_A' && entry.kind === 'auto').document.name, 'mutated return'); const listed = store.list(); listed[0].document.name = 'mutated list return'; assert.notEqual(store.list()[0].document.name, 'mutated list return');
assert.throws(() => store.save(duplicateId, 'auto', ''), /storageId/); assert.throws(() => store.save(duplicateId, 'auto', 'tab:bad'), /storageId/); const savedBeforeInvalid = storage.getItem('kaijo-ilapo:document:tab_A:saved'); assert.throws(() => store.save({ nope: true }, 'saved', 'tab_C'), /document/); assert.equal(storage.getItem('kaijo-ilapo:document:tab_A:saved'), savedBeforeInvalid);
for (let index = 0; index < 8; index += 1) storage.setItem('kaijo-ilapo:document:extra_' + index + ':auto', JSON.stringify({ storageId: 'extra_' + index, kind: 'auto', at: '2030-01-01T00:00:0' + index + '.000Z', document: duplicateId }));
assert.equal(store.list().filter(entry => /^extra_/.test(entry.storageId || '')).length, 8); assert.equal(store.list()[0].storageId, 'extra_7');
storage.setItem('kaijo-ilapo:auto', JSON.stringify({ kind: 'auto', at: '2026-09-18T01:00:00.000Z', document: duplicateId })); storage.setItem('kaijo-ilapo:saved', JSON.stringify({ kind: 'saved', at: '2026-09-18T02:00:00.000Z', document: duplicateId }));
const legacy = store.list().filter(entry => entry.legacy); assert.equal(legacy.length, 2); assert(legacy.every(entry => entry.storageId === null && entry.legacy)); assert(storage.getItem('kaijo-ilapo:auto'));
storage.setItem('kaijo-ilapo:document:tab_bad:auto', '{broken'); assert.equal(store.list().filter(entry => entry.storageId === 'tab_A').length, 2);
const before = storage.getItem('kaijo-ilapo:document:tab_A:saved'), failing = new MemoryStorage(); failing.values = storage.values; failing.setItem = () => { throw new Error('quota'); }; assert.throws(() => new DocumentStore(failing).save(duplicateId, 'saved', 'tab_A'), /quota/); assert.equal(storage.getItem('kaijo-ilapo:document:tab_A:saved'), before);
const unavailable = new MemoryStorage(); unavailable.getItem = () => { throw new Error('storage unavailable'); }; assert.throws(() => new DocumentStore(unavailable).list(), /storage unavailable/);
const resumeKey = 'kaijo-ilapo:resume', beforeResume = new Map(storage.values), beforeList = store.list();
assert.equal(store.loadResume(), null);
const working = documentWith('working', '直前に開いた作品'), state = {storageId:'tab_A', pageId:working.pages[0].id, dirty:true, saveDestination:'browser'};
store.saveResume(working, state);
const resumed = store.loadResume();
assert.deepEqual(resumed.document, working); assert.equal(resumed.pageId, state.pageId); assert.equal(resumed.dirty, true); assert.equal(resumed.saveDestination, 'browser');
for (const [key, value] of beforeResume) assert.equal(storage.getItem(key), value, '再開記録は既存の保存候補を変更しない');
assert.deepEqual(store.list(), beforeList, '再開記録を保存候補へ混ぜない');
resumed.document.name = 'outside mutation'; assert.equal(store.loadResume().document.name, working.name);
store.saveResume(working, {...state, pageId:'deleted-page', dirty:false, saveDestination:null});
assert.equal(store.loadResume().pageId, working.pages[0].id); assert.equal(store.loadResume().dirty, false);
const validResume = storage.getItem(resumeKey);
assert.throws(() => store.saveResume({nope:true}, state)); assert.equal(storage.getItem(resumeKey), validResume);
assert.throws(() => store.saveResume(working, {...state, storageId:'unsafe:id'})); assert.equal(storage.getItem(resumeKey), validResume);
assert.throws(() => new DocumentStore(failing).saveResume(working, state), /quota/); assert.equal(storage.getItem(resumeKey), validResume);
for (const raw of ['{broken', 'null', JSON.stringify({...JSON.parse(validResume),version:99}), JSON.stringify({...JSON.parse(validResume),dirty:'false'}), JSON.stringify({...JSON.parse(validResume),saveDestination:'local'})]) {
  storage.setItem(resumeKey, raw); assert.throws(() => store.loadResume()); assert.equal(storage.getItem(resumeKey), raw, '壊れた再開記録は読出しで上書きしない');
  assert.deepEqual(store.list(), beforeList, '再開記録が壊れていても保存候補を読み出せる');
}
assert.throws(() => new DocumentStore(unavailable).loadResume(), /storage unavailable/);
console.log('IlapoDocumentStore tests passed');
