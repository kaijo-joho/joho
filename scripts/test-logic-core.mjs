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

const displayCases = [
  ['A-B', 'A ∧ B'],
  ['A_B', 'A ∨ B'],
  ['A^B', 'A ⊕ B'],
  ['nA', '¬A'],
  ['n(A-B)', '¬(A ∧ B)'],
  ['(A-B)_C', '(A ∧ B) ∨ C']
];

for (const [expression, expected] of cases) {
  const ast = LogicCore.parse(expression);
  assert.equal(LogicCore.truthCode(ast), expected, `${expression}のtruthCode`);
}

for (const [expression, expected] of displayCases) {
  assert.equal(LogicCore.toDisplayExpr(LogicCore.parse(expression)), expected, `${expression}の表示用論理式`);
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
assert.equal(LogicCore.createSvgFilename('(A-B)_C'), 'logic-circuit.svg');
assert.equal(LogicCore.createSvgFilename('A-(B-C)'), 'logic-circuit.svg');

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
assert.equal(LogicRenderer.gateGeometry('OR').inputX, -25, 'ORの入力端子をゲート本体の曲線へ接触させる');
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

const multiAndOrGraph = {
  nodes: [
    { id: 'A', type: 'input', name: 'A' },
    { id: 'B', type: 'input', name: 'B' },
    { id: 'and', type: 'AND' },
    { id: 'or', type: 'OR' },
    { id: 'out-and', type: 'output', name: 'ignored' },
    { id: 'out-or', type: 'output' }
  ],
  wires: [
    { from: 'A', to: 'and', port: 0 }, { from: 'B', to: 'and', port: 1 },
    { from: 'A', to: 'or', port: 0 }, { from: 'B', to: 'or', port: 1 },
    { from: 'and', to: 'out-and', port: 0 }, { from: 'or', to: 'out-or', port: 0 }
  ]
};
const multiAndOr = LogicCore.graphAnalysis(multiAndOrGraph, undefined, { allowMultipleOutputs: true });
assert.equal(multiAndOr.valid, true, '複数出力のAND・ORを解析できる');
assert.deepEqual(multiAndOr.outputs.map(output => [output.id, output.name, output.structureExpr, output.truthCode]), [
  ['out-and', 'F₁', 'A-B', '0001'],
  ['out-or', 'F₂', 'A_B', '0111']
]);
assert.deepEqual(multiAndOr.truthTable.map(row => [row.output, row.outputs['out-and'], row.outputs['out-or']]), [
  [0, 0, 0], [0, 0, 1], [0, 0, 1], [1, 1, 1]
]);
assert.equal(multiAndOr.structureExpr, 'A-B', '先頭出力は従来の別名として残す');
assert.equal(multiAndOr.truthCode, '0001', '先頭出力のtruthCodeを従来互換で残す');
assert.equal(LogicCore.graphAnalysis(multiAndOrGraph).valid, false, '既定では複数出力を許可しない');

const sharedGateGraph = structuredClone(multiAndOrGraph);
sharedGateGraph.nodes = sharedGateGraph.nodes.filter(node => node.id !== 'or');
sharedGateGraph.wires = sharedGateGraph.wires.filter(wire => wire.to !== 'or' && wire.from !== 'or');
sharedGateGraph.nodes.find(node => node.id === 'out-or').id = 'out-not';
sharedGateGraph.nodes.push({ id: 'not', type: 'NOT' });
sharedGateGraph.wires.push({ from: 'and', to: 'not', port: 0 }, { from: 'not', to: 'out-not', port: 0 });
const sharedGate = LogicCore.graphAnalysis(sharedGateGraph, undefined, { allowMultipleOutputs: true });
assert.equal(sharedGate.valid, true, '共有ゲートを複数の出力へ分岐できる');
assert.deepEqual(sharedGate.outputs.map(output => output.truthCode), ['0001', '1110']);

const inputUnionGraph = {
  nodes: [
    { id: 'A', type: 'input', name: 'A' }, { id: 'B', type: 'input', name: 'B' }, { id: 'C', type: 'input', name: 'C' },
    { id: 'and-bc', type: 'AND' }, { id: 'out-a', type: 'output' }, { id: 'out-bc', type: 'output' }
  ],
  wires: [
    { from: 'A', to: 'out-a', port: 0 }, { from: 'B', to: 'and-bc', port: 0 },
    { from: 'C', to: 'and-bc', port: 1 }, { from: 'and-bc', to: 'out-bc', port: 0 }
  ]
};
const inputUnion = LogicCore.graphAnalysis(inputUnionGraph, undefined, { allowMultipleOutputs: true });
assert.deepEqual(inputUnion.inputs, ['A', 'B', 'C'], '各出力が使う入力の和集合を表にする');
assert.deepEqual(inputUnion.outputs.map(output => output.truthCode), ['00001111', '00010001']);

const incompleteExtraOutput = structuredClone(multiAndOrGraph);
incompleteExtraOutput.wires = incompleteExtraOutput.wires.filter(wire => wire.to !== 'out-or');
const incompleteMulti = LogicCore.graphAnalysis(incompleteExtraOutput, undefined, { allowMultipleOutputs: true });
assert.equal(incompleteMulti.valid, false, '未接続の出力が一つでもあれば無効');
assert.match(incompleteMulti.errors.join(' '), /出力F₂/);
assert.equal(incompleteMulti.truthTable.length, 0);
assert.equal(incompleteMulti.outputs[0].structureExpr, 'A-B', '無効時も安全に構築できた出力の情報は残す');

const invalidPort = structuredClone(validGraph);
invalidPort.wires.find(wire => wire.to === 'g1' && wire.port === 1).port = 2;
assert.equal(LogicCore.graphAnalysis(invalidPort).valid, false);
assert.match(LogicCore.graphAnalysis(invalidPort).errors.join(' '), /入力端子が不正/);
const nandGraph = structuredClone(validGraph);
nandGraph.nodes.find(node => node.id === 'g1').type = 'NAND';
assert.equal(LogicCore.graphAnalysis(nandGraph).valid, false);
assert.match(LogicCore.graphAnalysis(nandGraph).errors.join(' '), /AND・OR・NOT/);

const orphanMulti = structuredClone(multiAndOrGraph);
orphanMulti.nodes.push({ id: 'orphan', type: 'NOT' });
orphanMulti.wires.push({ from: 'A', to: 'orphan', port: 0 });
assert.match(LogicCore.graphAnalysis(orphanMulti, undefined, { allowMultipleOutputs: true }).errors.join(' '), /いずれの出力にもつながっていない/);

const multiCycle = structuredClone(cyclic);
multiCycle.nodes.push({ id: 'F2', type: 'output' });
multiCycle.wires.push({ from: 'A', to: 'F2', port: 0 });
assert.equal(LogicCore.graphAnalysis(multiCycle, undefined, { allowMultipleOutputs: true }).valid, false, '複数出力でも循環を拒否する');

const directOutputs = {
  nodes: [{ id: 'A', type: 'input', name: 'A' }, { id: 'F1', type: 'output' }, { id: 'F2', type: 'output' }],
  wires: [{ from: 'A', to: 'F1', port: 0 }, { from: 'A', to: 'F2', port: 0 }]
};
const directAnalysis = LogicCore.graphAnalysis(directOutputs, undefined, { allowMultipleOutputs: true });
assert.equal(directAnalysis.valid, true, '入力から出力へ直接つなげられる');
assert.deepEqual(directAnalysis.outputs.map(output => output.truthCode), ['01', '01']);
assert.equal(LogicCore.outputName(0, 1), 'F');
assert.equal(LogicCore.outputName(9, 12), 'F₁₀');
assert.equal(LogicCore.outputName(11, 12), 'F₁₂');
assert.equal(LogicCore.graphAnalysis({ nodes: [], wires: [] }, undefined, { allowMultipleOutputs: true }).valid, false);

console.log(`logic-core: ${cases.length + displayCases.length + 44}件の検証に合格`);
