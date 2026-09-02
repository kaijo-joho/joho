import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LogicCore = require('../js/logic-core.js');
require('../js/logic-renderer.js');
const LogicRenderer = globalThis.LogicRenderer;

const cases = [
  ['A-B', '0001'],
  ['A_B', '0111'],
  ['A^B', '0110'],
  ['nA', '10'],
  ['n(A-B)', '1110'],
  ['n(A_B)', '1000'],
  ['(A-B)_C', '01010111']
];

for (const [expression, expected] of cases) {
  const ast = LogicCore.parse(expression);
  assert.equal(LogicCore.truthCode(ast), expected, `${expression}のtruthCode`);
}

const ab = LogicCore.parseAndAnalyze('A-B');
const ba = LogicCore.parseAndAnalyze('B-A');
assert.notEqual(ab.structureExpr, ba.structureExpr, '入力順の異なる構造は区別する');
assert.equal(ab.truthCode, ba.truthCode, '交換則で論理的には同値');

const left = LogicCore.parseAndAnalyze('(A-B)-C');
const right = LogicCore.parseAndAnalyze('A-(B-C)');
assert.notEqual(left.structureExpr, right.structureExpr, '結合順の異なる構造は区別する');
assert.equal(left.truthCode, right.truthCode, 'ANDの結合則で論理的には同値');

const equivalentA = LogicCore.parseAndAnalyze('A_B');
const equivalentB = LogicCore.parseAndAnalyze('n(nA-nB)');
assert.equal(equivalentA.truthCode, equivalentB.truthCode, '異なる構造の論理的同値をtruthCodeで判定する');

assert.equal(LogicCore.parseAndAnalyze('A-B^C_D').structureExpr, '((A-B)^C)_D', '優先順位 NOT > AND > XOR > OR');
assert.equal(LogicCore.createSvgFilename('(A-B)_C'), 'lc__~28A-B~29_C.svg');
assert.notEqual(LogicCore.createSvgFilename('(A-B)-C'), LogicCore.createSvgFilename('A-(B-C)'));

assert.throws(() => LogicCore.parse('A+ B'), LogicCore.LogicSyntaxError);
assert.throws(() => LogicCore.parse('A-'), LogicCore.LogicSyntaxError);

function collectGateTypes(ast, found = []) {
  if (ast.type === 'gate') {
    found.push(ast.gate);
    ast.inputs.forEach(child => collectGateTypes(child, found));
  }
  return found;
}

const xorAst = LogicCore.parse('A^B');
const basicXorAst = LogicCore.toBasicGateAst(xorAst);
assert.deepEqual(
  [...new Set(collectGateTypes(basicXorAst))].sort(),
  ['AND', 'NOT', 'OR'],
  'XORの回路図はAND・OR・NOTだけへ展開する'
);
assert.equal(LogicCore.truthCode(basicXorAst), LogicCore.truthCode(xorAst), 'XOR展開後も論理的な意味を保つ');

const nestedXorAst = LogicCore.parse('n((A^B)_C)');
const basicNestedXorAst = LogicCore.toBasicGateAst(nestedXorAst);
assert.equal(
  collectGateTypes(basicNestedXorAst).every(gate => LogicCore.BASIC_GATES.includes(gate)),
  true,
  '複合回路内のXORも基本ゲートへ展開する'
);
assert.equal(
  LogicCore.truthCode(basicNestedXorAst),
  LogicCore.truthCode(nestedXorAst),
  '複合回路の展開後も論理的な意味を保つ'
);

assert.equal(
  LogicRenderer.orthogonalWirePath({ x: 10, y: 20 }, { x: 110, y: 80 }),
  'M 10 20 H 60 V 80 H 110',
  '曲がる配線は水平・垂直の直交線にする'
);
assert.equal(
  LogicRenderer.orthogonalWirePath({ x: 10, y: 20 }, { x: 110, y: 20 }),
  'M 10 20 H 110',
  '同じ高さの配線は一本の直線にする'
);
assert.throws(() => LogicRenderer.gateGeometry('XOR'), /AND・OR・NOT/);

const validGraph = {
  nodes: [
    { id: 'A', type: 'input', name: 'A' },
    { id: 'B', type: 'input', name: 'B' },
    { id: 'g1', type: 'AND' },
    { id: 'F', type: 'output' }
  ],
  wires: [
    { id: 'w1', from: 'A', to: 'g1', port: 0 },
    { id: 'w2', from: 'B', to: 'g1', port: 1 },
    { id: 'w3', from: 'g1', to: 'F', port: 0 }
  ]
};
assert.equal(LogicCore.graphAnalysis(validGraph).structureExpr, 'A-B');
assert.equal(LogicCore.graphAnalysis(validGraph).truthCode, '0001');

const xorGraph = structuredClone(validGraph);
xorGraph.nodes.find(node => node.id === 'g1').type = 'XOR';
assert.equal(LogicCore.graphAnalysis(xorGraph).valid, false);
assert.match(LogicCore.graphAnalysis(xorGraph).errors.join(' '), /AND・OR・NOT/);

const incomplete = structuredClone(validGraph);
incomplete.wires.pop();
assert.equal(LogicCore.graphAnalysis(incomplete).valid, false);
assert.match(LogicCore.graphAnalysis(incomplete).errors.join(' '), /出力F/);

const cyclic = {
  nodes: [
    { id: 'A', type: 'input', name: 'A' },
    { id: 'g1', type: 'NOT' },
    { id: 'g2', type: 'NOT' },
    { id: 'F', type: 'output' }
  ],
  wires: [
    { id: 'w1', from: 'g1', to: 'g2', port: 0 },
    { id: 'w2', from: 'g2', to: 'g1', port: 0 },
    { id: 'w3', from: 'g2', to: 'F', port: 0 }
  ]
};
assert.equal(LogicCore.graphAnalysis(cyclic).valid, false);
assert.match(LogicCore.graphAnalysis(cyclic).errors.join(' '), /循環/);

console.log(`logic-core: ${cases.length + 20}件の検証に合格`);
