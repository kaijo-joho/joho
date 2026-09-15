import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { normalizeSnapshot } = require('../js/logic-storage.js');

// 複数選択の複製・移動・配置と、未完成案内をDOMなしで検証する。
const context = vm.createContext({ console, document: { elementFromPoint: () => null } });
for (const name of ['logic-core', 'logic-renderer', 'logic-layout', 'logic-editor']) {
  vm.runInContext(await readFile(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context);
}

function fixture(options = {}) {
  const editor = Object.assign(Object.create(context.LogicEditor.prototype), {
    options: { allowMultipleSelection: true, allowMultipleOutputs: true, ...options },
    inputNames: ['A', 'B'], availableInputNames: ['A', 'B', 'C', 'D'], inputValues: { A: 0, B: 0 },
    history: [], historyIndex: -1, selectedNodeIds: new Set(), selectionMode: false,
    canvasWrap: { focus() {} }, svg: { setPointerCapture() {}, contains() { return false; } },
    toSvgPoint: (x, y) => ({ x, y }), render() {}, updateToolbar() {}
  });
  editor.resetBaseGraph();
  editor.loadExpression('A-B');
  return editor;
}

const editor = fixture();
const and = editor.graph.nodes.find(node => node.type === 'AND');
editor.inputValues.A = 1;
editor.setNodeSelection(['input-A', and.id], and.id);
const beforeDuplicate = editor.snapshot();
const clones = editor.duplicateSelection();
assert.equal(clones.length, 2);
const cloneInput = clones.find(node => node.type === 'input');
const cloneGate = clones.find(node => node.type === 'AND');
assert.equal(cloneInput.name, 'C', '入力の複製は空いているCへ再割当する');
assert.equal(editor.inputValues.C, 1, '入力の複製は元の0/1も引き継ぐ');
assert.ok(editor.graph.wires.some(wire => wire.from === cloneInput.id && wire.to === cloneGate.id), '選択内の配線だけを複製する');
assert.equal(editor.graph.wires.filter(wire => wire.from === cloneGate.id && wire.to === 'output-F').length, 0, '境界をまたぐ配線は複製しない');
editor.undo();
assert.deepEqual(editor.snapshot(), beforeDuplicate, '複製全体を1回のUndoで戻す');

const edgeCopy = fixture();
const edgeGate = edgeCopy.graph.nodes.find(node => node.type === 'AND');
Object.assign(edgeCopy.findNode('input-A'), { x: 790, y: 180 });
Object.assign(edgeGate, { x: 855, y: 180 });
edgeCopy.graph.wires.find(wire => wire.from === 'input-A').bends = [{ x: 810, y: 180 }, { x: 810, y: 166 }];
edgeCopy.setNodeSelection(['input-A', edgeGate.id], edgeGate.id);
const edgeOriginal = edgeCopy.getSelectedNodes();
const edgeClones = edgeCopy.duplicateSelection();
assert.deepEqual(JSON.parse(JSON.stringify(edgeClones.map((node, index) => ({ x: node.x - edgeOriginal[index].x, y: node.y - edgeOriginal[index].y })))),
  [{ x: -36, y: 36 }, { x: -36, y: 36 }], '端でも選択全体を同じ量だけ移動して複製する');
assert.deepEqual(JSON.parse(JSON.stringify(edgeCopy.graph.wires.find(wire => wire.from === edgeClones[0].id).bends)),
  [{ x: 774, y: 216 }, { x: 774, y: 202 }], '端での複製でも手動折れ点は同じ差分を保つ');

const exhausted = fixture();
exhausted.inputNames = ['A', 'B', 'C', 'D'];
exhausted.inputValues = { A: 0, B: 0, C: 0, D: 0 };
exhausted.graph.nodes.push(
  { id: 'input-C', type: 'input', name: 'C', x: 72, y: 300 },
  { id: 'input-D', type: 'input', name: 'D', x: 72, y: 400 }
);
exhausted.setNodeSelection(['input-A'], 'input-A');
const beforeExhausted = exhausted.snapshot();
assert.equal(exhausted.duplicateSelection(), null);
assert.deepEqual(exhausted.snapshot(), beforeExhausted, '入力名の空きがなければ原子的に失敗する');

const moving = fixture();
const movingGate = moving.graph.nodes.find(node => node.type === 'AND');
moving.graph.wires.find(wire => wire.to === movingGate.id && wire.port === 0).bends = [{ x: 190, y: 220 }, { x: 190, y: movingGate.y - 14 }];
moving.setNodeSelection(['input-A', movingGate.id], movingGate.id);
const oldInput = { ...moving.findNode('input-A') };
const oldGate = { ...movingGate };
const oldBends = JSON.parse(JSON.stringify(moving.graph.wires.find(wire => wire.to === movingGate.id && wire.port === 0).bends));
const pointer = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {} });
moving.startDrag(pointer(oldGate.x, oldGate.y), movingGate);
moving.handlePointerMove(pointer(oldGate.x + 40, oldGate.y + 30));
moving.handlePointerUp(pointer(oldGate.x + 40, oldGate.y + 30));
assert.deepEqual([moving.findNode('input-A').x, moving.findNode('input-A').y], [oldInput.x + 40, oldInput.y + 30]);
assert.deepEqual([movingGate.x, movingGate.y], [oldGate.x + 40, oldGate.y + 30]);
assert.deepEqual(JSON.parse(JSON.stringify(moving.graph.wires.find(wire => wire.to === movingGate.id && wire.port === 0).bends)),
  oldBends.map(point => ({ x: point.x + 40, y: point.y + 30 })), '内部の手動配線もまとめて移動する');

const layout = fixture();
const layoutGate = layout.graph.nodes.find(node => node.type === 'AND');
layout.graph.nodes.push({ id: 'other', type: 'OR', x: 600, y: 100 });
layout.setNodeSelection([layoutGate.id, 'other'], layoutGate.id);
assert.equal(layout.alignSelection('centerY'), true);
assert.equal(layoutGate.y, layout.findNode('other').y, '選択部品を中央揃えできる');
layout.undo();
assert.notEqual(layoutGate.y, layout.findNode('other').y, '配置も1回のUndoで戻す');

const mixedLayout = fixture();
const mixedGate = mixedLayout.graph.nodes.find(node => node.type === 'AND');
Object.assign(mixedLayout.findNode('input-A'), { x: 120, y: 110 });
Object.assign(mixedGate, { x: 430, y: 230 });
mixedLayout.setNodeSelection(['input-A', mixedGate.id], mixedGate.id);
assert.equal(mixedLayout.alignSelection('left'), true);
assert.equal(mixedLayout.nodeBodyBounds(mixedLayout.findNode('input-A')).left, mixedLayout.nodeBodyBounds(mixedGate).left,
  '入力ボックスとゲートは見た目の左端で揃える');
assert.equal(mixedLayout.alignSelection('bottom'), true);
assert.equal(mixedLayout.nodeBodyBounds(mixedLayout.findNode('input-A')).bottom, mixedLayout.nodeBodyBounds(mixedGate).bottom,
  '入力ボックスとゲートは見た目の下端で揃える');

const diagnostics = fixture({ enableDiagnostics: true });
diagnostics.graph = {
  nodes: [
    { id: 'input-A', type: 'input', name: 'A', x: 72, y: 100 },
    { id: 'output-F', type: 'output', name: 'F', x: 828, y: 260 },
    { id: 'detached', type: 'NOT', x: 450, y: 300 }
  ], wires: []
};
const issues = diagnostics.getDiagnostics();
assert.ok(issues.some(issue => issue.kind === 'input-unconnected' && issue.nodeId === 'input-A'));
assert.ok(issues.some(issue => issue.kind === 'port-unconnected' && issue.nodeId === 'output-F' && issue.port === 0));
assert.ok(issues.some(issue => issue.kind === 'gate-unreachable' && issue.nodeId === 'detached'));
assert.equal(diagnostics.focusDiagnostic('gate:detached'), true);
assert.equal(diagnostics.selected.id, 'detached');

const groupDelete = fixture({ allowInputDeletion: true });
const deleteGate = groupDelete.graph.nodes.find(node => node.type === 'AND');
groupDelete.setNodeSelection(['input-A', deleteGate.id], deleteGate.id);
groupDelete.deleteSelected();
assert.equal(groupDelete.findNode('input-A'), undefined);
assert.equal(groupDelete.findNode(deleteGate.id), undefined);
groupDelete.undo();
assert.ok(groupDelete.findNode('input-A') && groupDelete.findNode(deleteGate.id), '複数選択の削除も1回のUndoで戻す');

const outputGroupDelete = fixture();
outputGroupDelete.graph.nodes.push({ id: 'output-extra', type: 'output', name: 'F₂', x: 720, y: 360 });
outputGroupDelete.updateOutputNames();
outputGroupDelete.setNodeSelection(['output-F', 'output-extra'], 'output-F');
const beforeOutputGroupDelete = outputGroupDelete.snapshot();
outputGroupDelete.deleteSelected();
assert.deepEqual(outputGroupDelete.snapshot(), beforeOutputGroupDelete, '全出力を含む選択は原子的に削除を拒否してFを残す');

const bendBoundaryMove = fixture();
const boundaryGate = bendBoundaryMove.graph.nodes.find(node => node.type === 'AND');
bendBoundaryMove.graph.wires.find(wire => wire.to === boundaryGate.id && wire.port === 0).bends = [
  { x: 20, y: 180 }, { x: 20, y: boundaryGate.y - 14 }
];
bendBoundaryMove.setNodeSelection(['input-A', boundaryGate.id], boundaryGate.id);
bendBoundaryMove.startDrag(pointer(boundaryGate.x, boundaryGate.y), boundaryGate);
bendBoundaryMove.handlePointerMove(pointer(boundaryGate.x - 160, boundaryGate.y));
bendBoundaryMove.handlePointerUp(pointer(boundaryGate.x - 160, boundaryGate.y));
assert.equal(bendBoundaryMove.graph.wires.find(wire => wire.to === boundaryGate.id && wire.port === 0).bends[0].x, 0,
  '内部折れ点はグループ移動でも保存形式の左端を越えない');
assert.doesNotThrow(() => normalizeSnapshot(bendBoundaryMove.snapshot()), '移動後の内部折れ点を含むスナップショットを保存形式へ正規化できる');

console.log('logic-selection: 複数選択の複製・原子性・内部手動配線移動・配置・削除・未完成診断を検証');
