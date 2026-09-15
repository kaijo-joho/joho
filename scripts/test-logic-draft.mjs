import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Draft = require('../tools/logic/recovery.js');
const Storage = require('../js/logic-storage.js');
class MemoryStorage {
  values = new Map();
  writes = 0;
  getItem(key) { if (this.failRead) throw new Error('blocked'); return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite) throw new Error('quota'); this.values.set(key, value); this.writes++; }
  removeItem(key) { this.values.delete(key); }
}
const snapshot = Storage.normalizeSnapshot({ inputNames: ['A', 'B'], inputValues: { A: 0, B: 1 }, graph: {
  nodes: [
    { id: 'a', type: 'input', name: 'A', x: 70, y: 180 }, { id: 'b', type: 'input', name: 'B', x: 70, y: 280 },
    { id: 'gate', type: 'AND', x: 400, y: 250 }, { id: 'f', type: 'output', x: 800, y: 250 }
  ], wires: [
    { id: 'ag', from: 'a', to: 'gate', port: 0 }, { id: 'bg', from: 'b', to: 'gate', port: 1 },
    { id: 'gf', from: 'gate', to: 'f', port: 0, bends: [{ x: 580, y: 250 }, { x: 580, y: 300 }, { x: 690, y: 300 }, { x: 690, y: 250 }] }
  ]
} });
const memory = new MemoryStorage();
const named = new Storage.Store(memory);
for (let i = 0; i < 30; i++) named.save({ name: `既存${i}`, snapshot });
const namedRaw = memory.getItem(Storage.STORAGE_KEY);
const file = { id: named.list()[0].id, name: '既存0', savedSnapshot: snapshot };
const value = { snapshot, file };
const draft = new Draft.Store(memory);
assert.equal(draft.load(), null);
assert.equal(draft.save(value), true);
const raw = memory.getItem(Draft.KEY), writes = memory.writes;
assert.equal(draft.save(value), false);
assert.equal(memory.writes, writes, '同じ内容では保存し直さない');
const loaded = new Draft.Store(memory).load();
assert.deepEqual(loaded.snapshot, snapshot);
assert.deepEqual(loaded.file, file);
assert.equal(memory.getItem(Storage.STORAGE_KEY), namedRaw, '30件の名前付き保存とは別枠');
const incomplete = structuredClone(value);
incomplete.snapshot.graph.wires.pop();
incomplete.snapshot.graph.nodes.push({ id: 'f2', type: 'output', x: 800, y: 350 });
assert.equal(draft.save(incomplete), true, '未接続部品・複数出力も復元できる');
assert.deepEqual(new Draft.Store(memory).load().snapshot, Storage.normalizeSnapshot(incomplete.snapshot));
assert.equal(memory.getItem(Storage.STORAGE_KEY), namedRaw);

// 不正な下書き・新しい版を勝手に上書きせず、読み込み時に回路も検証する。
for (const corrupt of ['{broken', JSON.stringify({ version: 2 }), 'x'.repeat(Storage.MAX_DOCUMENT_LENGTH + 1),
  JSON.stringify({ ...JSON.parse(raw), snapshot: { graph: {} } }),
  JSON.stringify({ ...JSON.parse(raw), file: { ...file, name: 'x'.repeat(61) } })]) {
  memory.setItem(Draft.KEY, corrupt);
  const broken = new Draft.Store(memory);
  assert.throws(() => broken.load(), /復元できません/);
  assert.throws(() => broken.save(value), /停止中/);
  assert.equal(memory.getItem(Draft.KEY), corrupt);
}
memory.setItem(Draft.KEY, raw);
const first = new Draft.Store(memory), second = new Draft.Store(memory);
first.load(); second.load();
second.save(incomplete);
const otherTab = memory.getItem(Draft.KEY);
const changed = structuredClone(value); changed.snapshot.inputValues.A = 1;
assert.throws(() => first.save(changed), /別のタブ/);
assert.equal(first.blocked, true);
assert.equal(memory.getItem(Draft.KEY), otherTab, '別タブの下書きを上書きしない');
const recoverable = new Draft.Store(memory); recoverable.load(); memory.failWrite = true;
assert.throws(() => recoverable.save(value), /quota/);
memory.failWrite = false;
assert.equal(memory.getItem(Draft.KEY), otherTab, '容量不足で既存下書きを消さない');
assert.equal(recoverable.save(value), true, '保存領域が回復すると再度保存できる');
memory.failRead = true;
assert.throws(() => new Draft.Store(memory).load(), /復元できません/);
console.log('logic-draft: recovery, validation, named-save isolation, conflicts and storage failures passed');
