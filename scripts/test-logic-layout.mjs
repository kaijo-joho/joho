import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { arrange } = require('../js/logic-layout.js');
const pointMap = points => new Map(points.map(point => [point.id, point]));
const node = (id, type, x, y, name) => ({ id, type, x, y, ...(name ? { name } : {}) });
const wire = (id, from, to, port) => ({ id, from, to, port });
const offsets = (target, port) => (target.type === 'AND' || target.type === 'OR') ? (port === 0 ? -14 : 14) : 0;
const basic = () => ({
  nodes: [node('A', 'input', 0, 400, 'A'), node('B', 'input', 0, 100, 'B'), node('g', 'AND', 400, 250), node('F', 'output', 0, 0)],
  wires: [wire('a', 'A', 'g', 0), wire('b', 'B', 'g', 1), wire('f', 'g', 'F', 0)]
});

const original = basic();
const originalSnapshot = structuredClone(original);
const andPoints = pointMap(arrange(original));
assert.equal(andPoints.get('A').x, 45);
assert.equal(andPoints.get('F').x, 855);
assert.ok(andPoints.get('g').x > andPoints.get('A').x && andPoints.get('g').x < andPoints.get('F').x);
assert.equal(original.nodes[0].x, 0, '入力グラフを変更しない');
assert.deepEqual(original, originalSnapshot, '接続・種類・名前を含む入力グラフを変更しない');
assert.deepEqual(arrange(original), arrange(original), '同じ回路は常に同じ位置になる');
assert.equal(andPoints.get('B').y - andPoints.get('A').y, 84, '少数の入力は広がりすぎず最小間隔を保つ');
const basicWithOffsets = pointMap(arrange(basic(), { inputOffset: offsets }));
assert.equal(basicWithOffsets.get('g').y, basicWithOffsets.get('F').y, '単純ANDの出力とFを直線にする');
assert.ok(Math.abs(basicWithOffsets.get('A').y - basicWithOffsets.get('B').y) >= 84, '入力部品を重ねて両端子へ合わせない');
assert.equal(basicWithOffsets.get('A').y, basicWithOffsets.get('g').y - 14, '二入力ANDでは入力順を保って端子0を優先できる');
const directInput = { nodes: [node('A', 'input', 0, 0, 'A'), node('F', 'output', 0, 0)], wires: [wire('af', 'A', 'F', 0)] };
const directPoints = pointMap(arrange(directInput, { inputOffset: offsets }));
assert.equal(directPoints.get('A').y, directPoints.get('F').y, 'NOTや出力への単独入力は直線にできる');
const directWithUnusedInput = {
  nodes: [node('A', 'input', 0, 0, 'A'), node('B', 'input', 0, 0, 'B'), node('F', 'output', 0, 0)],
  wires: [wire('af', 'A', 'F', 0)]
};
const unusedInputPoints = pointMap(arrange(directWithUnusedInput, { inputOffset: offsets }));
assert.equal(unusedInputPoints.get('A').y, unusedInputPoints.get('F').y, '接続済み入力を単独出力へ直線化する');
assert.ok(unusedInputPoints.get('B').y - unusedInputPoints.get('A').y >= 84, '未接続入力も移動後の入力と重ならない');

const clampedChoice = {
  nodes: [node('A', 'input', 0, 0, 'A'), node('B', 'input', 0, 0, 'B'), node('g1', 'NOT', 0, 0), node('g2', 'NOT', 0, 0), node('g3', 'AND', 0, 0), node('F1', 'output', 0, 0), node('F2', 'output', 0, 0), node('F3', 'output', 0, 0)],
  wires: [wire('a1', 'A', 'g1', 0), wire('b2', 'B', 'g2', 0), wire('g1f1', 'g1', 'F1', 0), wire('g13', 'g1', 'g3', 0), wire('g23', 'g2', 'g3', 1), wire('g2f3', 'g2', 'F3', 0), wire('g3f2', 'g3', 'F2', 0)]
};
const clampedPoints = pointMap(arrange(clampedChoice, { inputOffset: offsets }));
assert.equal(clampedPoints.get('g1').y, clampedPoints.get('F1').y, '実現可能な候補をclamp後の位置で採点して直線を優先する');
assert.ok(clampedPoints.get('g2').y - clampedPoints.get('g1').y >= 84, 'clamp後も同列のゲート間隔を保つ');

const notChain = {
  nodes: [node('A', 'input', 0, 0, 'A'), node('n1', 'NOT', 0, 0), node('n2', 'NOT', 0, 0), node('F', 'output', 0, 0)],
  wires: [wire('a', 'A', 'n1', 0), wire('n1', 'n1', 'n2', 0), wire('n2', 'n2', 'F', 0)]
};
const chainPoints = pointMap(arrange(notChain));
assert.ok(chainPoints.get('n1').x < chainPoints.get('n2').x);
assert.ok(chainPoints.get('n2').x - chainPoints.get('n1').x >= 110);
const chainWithOffsets = pointMap(arrange(notChain, { inputOffset: offsets }));
assert.equal(chainWithOffsets.get('n1').y, chainWithOffsets.get('n2').y, 'NOT鎖は端子中心を一直線にする');
assert.equal(chainWithOffsets.get('n2').y, chainWithOffsets.get('F').y);

const andOr = {
  nodes: [node('A', 'input', 0, 100, 'A'), node('B', 'input', 0, 260, 'B'), node('C', 'input', 0, 400, 'C'), node('and', 'AND', 0, 200), node('or', 'OR', 0, 260), node('F', 'output', 0, 0)],
  wires: [wire('aa', 'A', 'and', 0), wire('ba', 'B', 'and', 1), wire('ao', 'and', 'or', 0), wire('co', 'C', 'or', 1), wire('of', 'or', 'F', 0)]
};
const andOrPoints = pointMap(arrange(andOr, { inputOffset: offsets }));
assert.equal(andOrPoints.get('and').y, andOrPoints.get('or').y - 14, 'AND出力とORの端子0を直線にする');
assert.equal(andOrPoints.get('or').y, andOrPoints.get('F').y, 'OR出力とFを直線にする');
const andOrPort1 = structuredClone(andOr);
andOrPort1.wires.find(item => item.id === 'ao').port = 1;
const port1Points = pointMap(arrange(andOrPort1, { inputOffset: offsets }));
assert.equal(port1Points.get('and').y, port1Points.get('or').y + 14, '端子1もオフセットに合わせる');

const xorLike = {
  nodes: [node('A', 'input', 0, 100, 'A'), node('B', 'input', 0, 300, 'B'), node('or', 'OR', 0, 300), node('and', 'AND', 0, 100), node('not', 'NOT', 0, 200), node('last', 'AND', 0, 200), node('F', 'output', 0, 0)],
  wires: [wire('ao', 'A', 'or', 0), wire('bo', 'B', 'or', 1), wire('aa', 'A', 'and', 0), wire('ba', 'B', 'and', 1), wire('an', 'and', 'not', 0), wire('ol', 'or', 'last', 0), wire('nl', 'not', 'last', 1), wire('lf', 'last', 'F', 0)]
};
const xorPoints = pointMap(arrange(xorLike));
assert.ok(xorPoints.get('or').x < xorPoints.get('last').x);
assert.ok(xorPoints.get('not').x < xorPoints.get('last').x);

const branching = basic();
branching.nodes.push(node('F2', 'output', 0, 0), node('loose', 'NOT', 0, 470));
branching.wires.push(wire('f2', 'g', 'F2', 0));
const branchPoints = pointMap(arrange(branching));
assert.equal(branchPoints.get('F').x, branchPoints.get('F2').x);
assert.notEqual(branchPoints.get('F').y, branchPoints.get('F2').y);
assert.ok(branchPoints.get('loose').x > 45 && branchPoints.get('loose').x < 855, '未接続ゲートも段へ置く');

function applyPositions(graph, positions) {
  const next = structuredClone(graph);
  const byId = pointMap(positions);
  next.nodes.forEach(item => Object.assign(item, byId.get(item.id)));
  return next;
}
const unfinished = { nodes: [node('A', 'input', 0, 0, 'A'), node('g', 'AND', 0, 0), node('F', 'output', 0, 0)], wires: [wire('a', 'A', 'g', 0)] };
assert.doesNotThrow(() => arrange(unfinished), '未接続ゲート・出力も配置できる');
function assertColumnSpacing(points) {
  const columns = new Map();
  points.forEach(point => columns.set(point.x, [...(columns.get(point.x) || []), point.y]));
  columns.forEach(values => {
    values.sort((left, right) => left - right);
    values.slice(1).forEach((value, index) => assert.ok(value - values[index] >= 84, '同じ列の部品間隔は84px以上'));
  });
}
for (const fixture of [basic(), xorLike, branching, unfinished, directWithUnusedInput, clampedChoice]) {
  const first = arrange(fixture);
  assert.deepEqual(arrange(applyPositions(fixture, first)), first, '配置結果を適用しても再配置で入れ替わらない');
  assertColumnSpacing(first);
  first.forEach(point => {
    assert.ok(point.x >= 45 && point.x <= 855 && point.y >= 42 && point.y <= 478, '標準キャンバス内に収める');
  });
}
for (const fixture of [andOr, andOrPort1, branching, clampedChoice, directWithUnusedInput]) {
  const first = arrange(fixture, { inputOffset: offsets });
  assert.deepEqual(arrange(applyPositions(fixture, first), { inputOffset: offsets }), first, '端子オフセット付きでも再整列は安定する');
  assertColumnSpacing(first);
}
assert.deepEqual(arrange({ nodes: [], wires: [] }), [], '入力なし・部品なしも配置できる');
const noInput = { nodes: [node('g', 'NOT', 0, 0), node('F', 'output', 0, 0)], wires: [wire('f', 'g', 'F', 0)] };
assert.doesNotThrow(() => arrange(noInput), '入力なしの作りかけ回路も配置できる');
assert.throws(() => arrange({ nodes: [node('g1', 'NOT', 0, 0), node('g2', 'NOT', 0, 0)], wires: [wire('1', 'g1', 'g2', 0), wire('2', 'g2', 'g1', 0)] }), /循環/);
assert.throws(() => arrange({ nodes: [node('F', 'output', 0, 0)], wires: [wire('bad', 'nope', 'F', 0)] }), /存在しない/);
const crowded = { nodes: Array.from({ length: 7 }, (_, index) => node(`g${index}`, 'AND', 0, index)), wires: [] };
assert.throws(() => arrange(crowded), /多すぎる/);
const deep = { nodes: [node('A', 'input', 0, 0, 'A'), node('F', 'output', 0, 0)], wires: [] };
for (let index = 0; index < 7; index += 1) deep.nodes.push(node(`n${index}`, 'NOT', 0, 0));
deep.wires.push(wire('start', 'A', 'n0', 0));
for (let index = 1; index < 7; index += 1) deep.wires.push(wire(`n${index}`, `n${index - 1}`, `n${index}`, 0));
deep.wires.push(wire('end', 'n6', 'F', 0));
assert.throws(() => arrange(deep), /横に長すぎる/);

console.log('logic-layout: DAG段・未完成回路・複数出力・例外境界を検証');
