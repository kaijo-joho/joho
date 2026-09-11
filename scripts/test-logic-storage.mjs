import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { STORAGE_KEY, normalizeSnapshot, Store } = require('../js/logic-storage.js');

class MemoryStorage {
  constructor() { this.values = new Map(); this.failGet = false; this.failSet = false; }
  getItem(key) { if (this.failGet) throw new Error('blocked'); return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { if (this.failSet) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const clone = value => JSON.parse(JSON.stringify(value));
const validSnapshot = () => ({
  graph: {
    nodes: [
      { id: 'input-A', type: 'input', name: 'A', x: 72, y: 200 },
      { id: 'input-B', type: 'input', name: 'B', x: 72, y: 300 },
      { id: 'and', type: 'AND', x: 450, y: 250 },
      { id: 'output-F', type: 'output', name: 'wrong', x: 828, y: 250 }
    ],
    wires: [
      { id: 'a-and', from: 'input-A', to: 'and', port: 0 },
      { id: 'b-and', from: 'input-B', to: 'and', port: 1 },
      { id: 'and-f', from: 'and', to: 'output-F', port: 0 }
    ]
  }, inputNames: ['B', 'A'], inputValues: { A: 0, B: 1 }
});

const normalized = normalizeSnapshot(validSnapshot());
assert.deepEqual(normalized.inputNames, ['A', 'B']);
assert.equal(normalized.graph.nodes.at(-1).name, 'F');
assert.notEqual(normalized, validSnapshot());
const incomplete = validSnapshot();
incomplete.graph.wires.pop();
assert.doesNotThrow(() => normalizeSnapshot(incomplete), '未接続出力も保存できる');
const noOutput = validSnapshot();
noOutput.graph.nodes = noOutput.graph.nodes.filter(node => node.type !== 'output');
noOutput.graph.wires = noOutput.graph.wires.filter(wire => wire.to !== 'output-F');
assert.throws(() => normalizeSnapshot(noOutput), /出力を1つ以上/);
const multi = validSnapshot();
multi.graph.nodes.push({ id: 'output-2', type: 'output', x: 828, y: 350 });
multi.graph.wires.push({ id: 'and-f2', from: 'and', to: 'output-2', port: 0 });
assert.deepEqual(normalizeSnapshot(multi).graph.nodes.filter(node => node.type === 'output').map(node => node.name), ['F₁', 'F₂']);
const bent = validSnapshot();
bent.graph.wires[2].bends = [{ x: 600, y: 250 }, { x: 600, y: 300 }, { x: 700, y: 300 }, { x: 700, y: 250 }];
const bentNormalized = normalizeSnapshot(bent);
assert.deepEqual(bentNormalized.graph.wires[2].bends, bent.graph.wires[2].bends, '配線の折れ点をコピーする');
const fileRaw = require('../js/logic-storage.js').serializeFile({ name: '  回路ファイル  ', snapshot: bent });
assert.deepEqual(require('../js/logic-storage.js').parseFile(fileRaw), { name: '回路ファイル', snapshot: bentNormalized }, 'ファイル形式で座標・値・折れ点を往復する');
assert.throws(() => require('../js/logic-storage.js').parseFile('{"format":"joho.logic-circuit","version":1,"name":"x"}'), /形式|対応/);
assert.throws(() => require('../js/logic-storage.js').parseFile('x'.repeat(1024 * 1024 + 1)), /大きすぎる/);
const badBends = clone(bent);
badBends.graph.wires[2].bends[1].x = 601;
assert.throws(() => normalizeSnapshot(badBends), /折れ点/);

for (const mutate of [
  snapshot => { snapshot.graph.nodes[0].id = '__proto__'; },
  snapshot => { snapshot.graph.nodes[0].x = Infinity; },
  snapshot => { snapshot.graph.wires[0].to = 'missing'; },
  snapshot => { snapshot.graph.wires[0].to = 'input-B'; },
  snapshot => { snapshot.graph.wires[0].port = 3; },
  snapshot => { snapshot.graph.wires.push({ ...snapshot.graph.wires[0] }); },
  snapshot => { snapshot.graph.wires.push({ id: 'cycle', from: 'and', to: 'and', port: 0 }); },
  snapshot => { snapshot.inputValues.A = 2; }
]) {
  const altered = clone(validSnapshot());
  mutate(altered);
  assert.throws(() => normalizeSnapshot(altered), '改ざんスナップショットを拒否する');
}

const storage = new MemoryStorage();
const store = new Store(storage);
const saved = store.save({ name: '  AND回路  ', snapshot: validSnapshot() });
assert.equal(saved.name, 'AND回路');
assert.equal(store.list().length, 1);
assert.notEqual(store.get(saved.id).snapshot, saved.snapshot, '取得結果はコピーする');
const fetched = store.get(saved.id);
fetched.snapshot.graph.nodes[0].x = 0;
assert.equal(store.get(saved.id).snapshot.graph.nodes[0].x, 72, '取得後の変更は保存済みスナップショットへ影響しない');
assert.throws(() => store.save({ name: 'AND回路', snapshot: validSnapshot() }), /同じ名前/);
const updated = store.save({ id: saved.id, name: 'OR回路', snapshot: incomplete });
assert.equal(updated.id, saved.id);
assert.equal(store.get(saved.id).name, 'OR回路');
assert.throws(() => store.save({ id: 'unknown', name: '新規', snapshot: validSnapshot() }), /見つかりません/);
const second = store.save({ name: '別名', snapshot: multi });
assert.equal(store.remove(second.id), true);
assert.equal(store.remove(second.id), false);
for (let index = 0; index < 29; index += 1) store.save({ name: `回路${index}`, snapshot: incomplete });
assert.equal(store.list().length, 30);
assert.throws(() => store.save({ name: '31件目', snapshot: validSnapshot() }), /30件まで/);

const raw = storage.getItem(STORAGE_KEY);
storage.setItem(STORAGE_KEY, '{broken');
assert.throws(() => store.list(), /壊れています/);
assert.equal(storage.getItem(STORAGE_KEY), '{broken', '壊れた保存内容を勝手に上書きしない');
storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, records: [] }));
assert.throws(() => store.list(), /対応していません/);
assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify({ version: 2, records: [] }));
storage.setItem(STORAGE_KEY, 'x'.repeat(1024 * 1024 + 1));
assert.throws(() => store.list(), /大きすぎる/);
assert.equal(storage.getItem(STORAGE_KEY).length, 1024 * 1024 + 1, '巨大なrawも勝手に上書きしない');
storage.setItem(STORAGE_KEY, raw);
const beforeOversizedWrite = storage.getItem(STORAGE_KEY);
assert.throws(
  () => store.write({ version: 1, records: [], padding: 'x'.repeat(1024 * 1024 + 1) }),
  /大きすぎます/
);
assert.equal(storage.getItem(STORAGE_KEY), beforeOversizedWrite, '書込み文書が上限超過でも既存rawを維持する');
storage.failSet = true;
const beforeQuota = storage.getItem(STORAGE_KEY);
assert.throws(() => store.save({ id: saved.id, name: '容量不足', snapshot: validSnapshot() }), /失敗/);
assert.equal(storage.getItem(STORAGE_KEY), beforeQuota, '保存失敗時に既存rawを維持する');
storage.failSet = false;
storage.failGet = true;
assert.throws(() => store.list(), /読み取れません/);

console.log('logic-storage: 正規化・複数出力・改ざん拒否・保存更新削除・保存障害を検証');
