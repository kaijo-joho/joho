const assert = require('assert');
const Core = require('../core.js');
const { Store, PREFIX } = require('../document-store.js');

class MemoryStorage {
  constructor() { this.values = new Map(); this.failSet = false; }
  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { if (this.failSet) throw new Error('quota'); this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const storage = new MemoryStorage();
const store = new Store(storage);
const first = Core.createDocument(); first.name = '一つ目';
const second = Core.createDocument(); second.name = '二つ目';
const editRanges = { equalScale: false, axes: { x: { min: -3, max: 3 }, y: { min: -4, max: 4 }, z: { min: -5, max: 5 } } };

for (const [id, doc] of [['doc-one', first], ['doc-two', second]]) {
  store.save(id, 'auto', doc);
  store.save(id, 'saved', doc);
}
assert.equal(storage.values.size, 4, '文書IDと保存種類ごとに別キーを使う');
assert.equal(storage.getItem(PREFIX + 'doc-one:auto') !== storage.getItem(PREFIX + 'doc-two:auto'), true);
assert.equal(store.load('doc-one', 'auto').document.name, '一つ目');
assert.equal(store.load('doc-one', 'saved').document.name, '一つ目');
assert.equal(store.load('doc-two', 'auto').document.name, '二つ目');
assert.equal(store.load('doc-two', 'saved').document.name, '二つ目');

const withRanges = store.save('with-ranges', 'auto', first, { editRanges });
assert.deepEqual(withRanges.editRanges, editRanges, '編集範囲メタデータを保存結果へ含める');
assert.deepEqual(store.load('with-ranges', 'auto').editRanges, editRanges, '編集範囲メタデータを読み込む');
assert.throws(() => store.save('bad-ranges', 'auto', first, { editRanges: { equalScale: false, axes: {} } }), /保存範囲/);

storage.setItem('kaijo-graph:auto', JSON.stringify({ document: first, at: '2026-09-18T00:00:00.000Z' }));
storage.setItem('kaijo-graph:saved', '{broken');
const listed = store.list();
assert.equal(listed.entries.some(entry => entry.id === 'legacy' && entry.kind === 'auto'), true, '旧自動保存を一覧へ含める');
assert.equal(listed.entries.some(entry => entry.id === 'doc-one' && entry.kind === 'saved'), true, '一部破損でも他文書を返す');
assert(listed.errors.some(error => /kaijo-graph:saved/.test(error) && /読み取れません/.test(error)));
assert.equal(storage.getItem('kaijo-graph:saved'), '{broken', '旧破損データを削除しない');

assert.throws(() => store.save('', 'auto', first), /文書ID/);
assert.throws(() => store.save('bad:id', 'auto', first), /文書ID/);
assert.throws(() => store.save('x'.repeat(101), 'auto', first), /文書ID/);
assert.throws(() => store.save('ok', 'manual', first), /保存種類/);
assert.throws(() => store.load('ok', 'manual'), /保存種類/);
storage.setItem(PREFIX + 'bad:auto', '{broken');
assert.throws(() => store.load('bad', 'auto'), /読み取れません/);
assert(store.list().errors.some(error => error.includes(PREFIX + 'bad:auto')));

const before = store.load('doc-one', 'saved');
storage.failSet = true;
assert.throws(() => store.save('doc-one', 'saved', second), /quota/);
storage.failSet = false;
assert.deepEqual(store.load('doc-one', 'saved'), before, '容量エラーで既存文書を維持する');

storage.setItem(PREFIX + 'old:auto', JSON.stringify({ id: 'old', kind: 'auto', at: '2026-09-18T01:00:00.000Z', document: first }));
storage.setItem(PREFIX + 'new:auto', JSON.stringify({ id: 'new', kind: 'auto', at: '2026-09-18T03:00:00.000Z', document: second }));
const ordered = store.list().entries.filter(entry => entry.id === 'old' || entry.id === 'new');
assert.deepEqual(ordered.map(entry => entry.id), ['new', 'old'], '一覧を保存日時の新しい順に並べる');

const metadataStorage = new MemoryStorage();
const metadataStore = new Store(metadataStorage);
metadataStorage.setItem(PREFIX + 'broken-meta:auto', JSON.stringify({
  id: 'broken-meta', kind: 'auto', at: '2026-09-18T04:00:00.000Z', document: first,
  editRanges: { equalScale: false, axes: { x: { min: 2, max: 2 } } }
}));
const brokenMetadata = metadataStore.load('broken-meta', 'auto');
assert.equal(brokenMetadata.document.name, '一つ目', '付加メタデータ破損時も本文を返す');
assert.equal(Object.prototype.hasOwnProperty.call(brokenMetadata, 'editRanges'), false, '破損した付加メタデータを省略する');
assert.equal(metadataStore.list().errors.length, 0, '本文が検証できる付加メタデータ破損は一覧エラーにしない');

console.log('document-store: 複数文書・旧キー互換・破損分離・保存失敗保持・日時順を検証');
