import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// 描画を除く実際の編集・履歴・経路選択を、ブラウザに依存せず検証する。
let dropTarget = null;
const context = vm.createContext({
  console,
  document: { elementFromPoint: () => dropTarget }
});
for (const name of ['logic-core', 'logic-renderer', 'logic-editor']) {
  vm.runInContext(await readFile(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context);
}
const plain = value => JSON.parse(JSON.stringify(value));

function editorFixture(options = { allowInputDeletion: true }) {
  const editor = Object.assign(Object.create(context.LogicEditor.prototype), {
    options, inputNames: ['A', 'B'], availableInputNames: ['A', 'B', 'C', 'D'],
    inputValues: { A: 0, B: 0 }, history: [], historyIndex: -1,
    canvasWrap: { focus() {} }, svg: { contains: target => Boolean(target) },
    toSvgPoint: (x, y) => ({ x, y }), render() {}, updateToolbar() {}
  });
  editor.resetBaseGraph();
  editor.loadExpression('A-B');
  return editor;
}

function dragSource(editor, wire, targetNode, targetKind = 'output') {
  editor.selectWire(wire.id);
  editor.beginPortGesture({
    button: 0, pointerId: 1, clientX: 0, clientY: 0,
    preventDefault() {}, stopPropagation() {}
  }, editor.findNode(wire.from), 'output', 0);
  assert.equal(editor.connectionDrag.rewireWireId, wire.id, '選択した配線の左端は新規配線ではなく付け替え');
  editor.connectionDrag.moved = true;
  const attributes = { 'data-kind': targetKind, 'data-node-id': targetNode, 'data-port': '0' };
  dropTarget = targetNode ? { closest() { return this; }, getAttribute: name => attributes[name] } : null;
  editor.handlePointerUp({ pointerId: 1, clientX: 30, clientY: 20 });
}

const editor = editorFixture();
assert.deepEqual(plain(editor.graph.nodes.filter(node => node.type === 'input').map(node => node.name)), ['A', 'B']);
const originalNodes = plain(editor.graph.nodes);
editor.addInput();
assert.deepEqual(plain(editor.inputNames), ['A', 'B', 'C']);
assert.deepEqual(plain(editor.graph.nodes.slice(0, originalNodes.length)), originalNodes, '入力追加で既存部品を動かさない');
editor.undo();
assert.deepEqual(plain(editor.inputNames), ['A', 'B']);
assert.equal(editor.findNode('input-C'), undefined);
editor.redo();
editor.addInput();
editor.addInput();
assert.deepEqual(plain(editor.inputNames), ['A', 'B', 'C', 'D'], '追加はDまで');

const gate = editor.graph.nodes.find(node => node.type === 'AND');
const beforeSwap = plain(editor.graph);
editor.selected = { kind: 'node', id: gate.id };
editor.swapSelectedGate();
assert.equal(gate.type, 'OR');
assert.deepEqual(plain(editor.graph.wires), beforeSwap.wires, '交換で接続を維持');
assert.deepEqual([gate.x, gate.y], [beforeSwap.nodes.find(node => node.id === gate.id).x, beforeSwap.nodes.find(node => node.id === gate.id).y]);
assert.equal(editor.getAnalysis().truthCode, '0111', '交換後の真理値を再計算');
editor.undo();
assert.equal(editor.findNode(gate.id).type, 'AND');
editor.redo();
assert.equal(editor.findNode(gate.id).type, 'OR');

// 分岐元を共有する場合も、選んだ1本だけ接続元を変更する。
const wire = editor.graph.wires.find(candidate => candidate.from === 'input-A');
const otherWire = editor.graph.wires.find(candidate => candidate.from === 'input-B');
otherWire.from = 'input-A';
editor.resetHistory();
dragSource(editor, wire, 'input-C');
assert.equal(wire.from, 'input-C');
assert.equal(otherWire.from, 'input-A', '同じ始点の別配線を変更しない');
assert.equal(editor.graph.wires.length, 3, '付け替えで配線を増やさない');
editor.undo();
assert.equal(editor.graph.wires.find(candidate => candidate.id === wire.id).from, 'input-A');
editor.redo();
assert.equal(editor.graph.wires.find(candidate => candidate.id === wire.id).from, 'input-C');

const selected = editor.graph.wires.find(candidate => candidate.id === wire.id);
const unchanged = editor.snapshot();
dragSource(editor, selected, null);
assert.deepEqual(editor.snapshot(), unchanged, '空白へのドロップは変更せずキャンセル');
dragSource(editor, selected, 'output-F', 'input');
assert.deepEqual(editor.snapshot(), unchanged, '左端を入力端子へドロップしても接続先に化けない');
editor.rewireConnection(selected.id, gate.id, gate.id, 0);
assert.deepEqual(editor.snapshot(), unchanged, '循環接続を拒否');
editor.rewireConnection(selected.id, 'input-B', gate.id, 1);
assert.equal(editor.incomingWire(gate.id, 1).id, selected.id, '接続先の古い配線を、操作した配線へ置き換える');
assert.equal(editor.graph.wires.length, unchanged.graph.wires.length - 1);
assert.equal(editor.incomingWire(gate.id, 0), null, '元の接続先は空く');
editor.undo();
assert.deepEqual(editor.snapshot(), unchanged, '1回のUndoで、元の配線と置き換えられた配線を両方復元');
editor.redo();
assert.equal(editor.incomingWire(gate.id, 1).id, selected.id);
editor.undo();
editor.rewireConnection(selected.id, 'input-B', gate.id, 2);
assert.deepEqual(editor.snapshot(), unchanged, '存在しない端子を拒否');
editor.connectionDrag = { pointerId: 2, rewireWireId: selected.id, moved: true };
editor.cancelPointerGesture({ pointerId: 2 });
assert.equal(editor.connectionDrag, null, 'タッチの中断でドラッグ状態を解除');
assert.deepEqual(editor.snapshot(), unchanged, 'タッチの中断で配線を失わない');

editor.canvasWrap = { scrollLeft: 0, scrollTop: 0, scrollHeight: 416, clientHeight: 320 };
const slide = { scrollTop: 0 };
editor.pan = { pointerId: 3, x: 300, y: 300, scrollLeft: 0, scrollTop: 0, slide, slideTop: 0 };
editor.handlePointerMove({ pointerId: 3, clientX: 100, clientY: 100, preventDefault() {} });
assert.equal(editor.canvasWrap.scrollLeft, 200, '空白スワイプで横へ移動');
assert.equal(editor.canvasWrap.scrollTop, 96, '回路内を下端までスクロール');
assert.equal(slide.scrollTop, 104, '残りの移動量は外側のスライドへ渡す');
editor.handlePointerUp({ pointerId: 3 });
assert.equal(editor.pan, null);
assert.deepEqual(editor.snapshot(), unchanged, 'スクロールは回路を編集しない');

const example = editorFixture();
example.loadExpression('(A-B)_C');
assert.deepEqual(plain(example.inputNames), ['A', 'B', 'C'], '回路例に必要な追加入力も読み込める');
assert.equal(example.getAnalysis().valid, true);

// 自由編集だけで入力を削除でき、全分岐・値・配置を履歴から復元できる。
const removable = editorFixture();
removable.loadExpression('(A-B)_A');
removable.setInputValues({ A: 1, B: 0 });
removable.resetHistory();
const beforeDeletion = removable.snapshot();
removable.selected = { kind: 'node', id: 'input-A' };
removable.deleteSelected();
assert.equal(removable.findNode('input-A'), undefined);
assert.equal('A' in removable.inputValues, false);
assert.equal(removable.inputNames.includes('A'), false);
assert.ok(removable.graph.wires.every(wire => wire.from !== 'input-A'));
removable.undo();
assert.deepEqual(removable.snapshot(), beforeDeletion);
removable.redo();
removable.addInput();
assert.equal(removable.findNode('input-A').name, 'A');
assert.equal(removable.inputValues.A, 0, '追加し直すと初期値0');
removable.selected = { kind: 'node', id: 'output-F' };
const beforeFixed = removable.snapshot();
removable.deleteSelected();
assert.deepEqual(removable.snapshot(), beforeFixed, '出力Fは削除できない');
const quiz = editorFixture({});
quiz.selected = { kind: 'node', id: 'input-A' };
const beforeQuiz = quiz.snapshot();
quiz.deleteSelected();
assert.deepEqual(quiz.snapshot(), beforeQuiz, '問題モードの指定入力は削除できない');

// 複数出力は自由編集だけで有効化する。追加・接続・削除も既存の履歴操作を通す。
const multi = editorFixture({ allowInputDeletion: true, allowMultipleOutputs: true });
const originalOutputWire = plain(multi.incomingWire('output-F', 0));
const originalParts = plain(multi.graph.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })));
multi.addOutput();
const secondOutput = multi.selected.id;
assert.deepEqual(plain(multi.graph.nodes.filter(node => node.type === 'output').map(node => node.name)), ['F₁', 'F₂']);
assert.equal(multi.getAnalysis().valid, false, '追加直後のF₂が未接続なら回路は未完成');
assert.match(multi.getAnalysis().errors.join(' '), /出力F₂/);
assert.deepEqual(
  plain(multi.graph.nodes.filter(node => node.id !== secondOutput).map(node => ({ id: node.id, x: node.x, y: node.y }))),
  originalParts,
  '出力追加で既存部品のIDと位置を変えない'
);
const existingAnd = multi.graph.nodes.find(node => node.type === 'AND');
multi.startConnection(existingAnd.id);
multi.finishConnection(secondOutput, 0);
const completedMulti = multi.getAnalysis();
assert.equal(completedMulti.valid, true, '既存ANDをF₂へ分岐すると複数出力回路が完成する');
assert.deepEqual(plain(completedMulti.outputs.map(output => output.truthCode)), ['0001', '0001']);
assert.deepEqual(plain(completedMulti.truthTable.map(row => [row.outputs['output-F'], row.outputs[secondOutput]])), [[0, 0], [0, 0], [0, 0], [1, 1]]);
multi.selected = { kind: 'node', id: secondOutput };
assert.equal(multi.canDeleteNode(multi.findNode(secondOutput)), true, '2つ以上の出力では選択出力を削除できる');
multi.deleteSelected();
assert.deepEqual(plain(multi.graph.nodes.filter(node => node.type === 'output').map(node => node.name)), ['F']);
assert.deepEqual(plain(multi.incomingWire('output-F', 0)), originalOutputWire, 'F₁へ戻っても元の配線を保つ');
multi.undo();
assert.equal(multi.findNode(secondOutput).name, 'F₂', 'Undoで削除した出力名を復元する');
assert.equal(multi.incomingWire(secondOutput, 0).from, existingAnd.id, 'Undoで削除出力の配線も復元する');
multi.redo();
assert.equal(multi.findNode(secondOutput), undefined, 'Redoで出力削除を再適用する');
multi.undo();

const manyOutputs = editorFixture({ allowInputDeletion: true, allowMultipleOutputs: true });
for (let index = 0; index < 10; index += 1) manyOutputs.addOutput();
const manyOutputNodes = manyOutputs.graph.nodes.filter(node => node.type === 'output');
assert.equal(manyOutputNodes.length, 11);
assert.equal(manyOutputNodes.at(-1).name, 'F₁₁', '10個を超える出力名も下付き数字で付ける');
assert.equal(new Set(manyOutputNodes.map(node => node.id)).size, manyOutputNodes.length, '追加出力IDは一意');
const lastOutputId = manyOutputNodes.at(-1).id;
manyOutputs.undo();
manyOutputs.addOutput();
assert.notEqual(manyOutputs.selected.id, lastOutputId, 'Undo後の再追加でも出力IDを使い回さない');
assert.equal(new Set(manyOutputs.graph.nodes.filter(node => node.type === 'output').map(node => node.id)).size, 11);

const oneOutput = editorFixture({ allowInputDeletion: true, allowMultipleOutputs: true });
oneOutput.selected = { kind: 'node', id: 'output-F' };
const oneOutputBefore = oneOutput.snapshot();
assert.equal(oneOutput.canDeleteNode(oneOutput.findNode('output-F')), false, '出力が1つだけなら削除不可');
oneOutput.deleteSelected();
assert.deepEqual(oneOutput.snapshot(), oneOutputBefore);
quiz.addOutput();
assert.deepEqual(quiz.snapshot(), beforeQuiz, '問題モードでは複数出力を追加できない');

const multiInputDeletion = editorFixture({ allowInputDeletion: true, allowMultipleOutputs: true });
multiInputDeletion.addOutput();
const inputDeletionOutput = multiInputDeletion.selected.id;
multiInputDeletion.startConnection('input-A');
multiInputDeletion.finishConnection(inputDeletionOutput, 0);
assert.equal(multiInputDeletion.incomingWire(inputDeletionOutput, 0).from, 'input-A');
multiInputDeletion.selected = { kind: 'node', id: 'input-A' };
multiInputDeletion.deleteSelected();
assert.equal(multiInputDeletion.findNode('input-A'), undefined);
assert.ok(multiInputDeletion.graph.wires.every(wire => wire.from !== 'input-A' && wire.to !== 'input-A'), '入力削除で複数出力への分岐配線も除去する');
multiInputDeletion.undo();
assert.equal(multiInputDeletion.incomingWire(inputDeletionOutput, 0).from, 'input-A', 'Undoで複数出力への入力配線を戻す');

const resetOutputs = editorFixture({ allowInputDeletion: true, allowMultipleOutputs: true });
resetOutputs.addOutput();
resetOutputs.clear();
assert.deepEqual(plain(resetOutputs.graph.nodes.filter(node => node.type === 'output').map(node => node.name)), ['F'], '全消去は出力1つのFへ戻す');
resetOutputs.addOutput();
resetOutputs.loadExpression('A-B');
assert.deepEqual(plain(resetOutputs.graph.nodes.filter(node => node.type === 'output').map(node => node.name)), ['F'], '式の読込みも出力1つのFへ戻す');

// 新規接続も同じ置き換え規則。循環する場合は、置き換え対象も含め何も消さない。
const replace = editorFixture();
const replaceGate = replace.graph.nodes.find(node => node.type === 'AND');
const replaceBefore = replace.snapshot();
replace.startConnection('input-B');
replace.finishConnection(replaceGate.id, 0);
assert.equal(replace.incomingWire(replaceGate.id, 0).from, 'input-B');
assert.equal(replace.graph.wires.length, replaceBefore.graph.wires.length);
replace.undo();
assert.deepEqual(replace.snapshot(), replaceBefore);
const toF = replace.incomingWire('output-F', 0);
replace.rewireConnection(toF.id, replaceGate.id, replaceGate.id, 0);
assert.deepEqual(replace.snapshot(), replaceBefore, '循環する置き換えでは両配線を保持');
replace.startConnection(replaceGate.id);
replace.finishConnection(replaceGate.id, 0);
assert.deepEqual(replace.snapshot(), replaceBefore, '循環する新規接続でも既存の接続を保持');
replace.startConnection('input-A');
replace.finishConnection(replaceGate.id, 2);
assert.deepEqual(replace.snapshot(), replaceBefore, '新規接続の存在しない端子も拒否');

// パレットから配置する位置・キャンセル・履歴。実際のpointer captureとclickはブラウザで検証。
const palette = editorFixture();
palette.canvasWrap.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 520 });
const paletteButton = { focus() {}, classList: { remove() {}, toggle() {} } };
const pointer = (x, y) => ({ button: 0, pointerId: 7, clientX: x, clientY: y, preventDefault() {} });
dropTarget = {};
const beforePalette = palette.snapshot();
palette.beginPaletteDrag(pointer(20, -30), 'OR', paletteButton);
palette.handlePointerMove(pointer(370, 310));
assert.deepEqual(plain(palette.paletteDrag.position), { x: 370, y: 310 });
assert.deepEqual(palette.snapshot(), beforePalette, 'ドラッグ中はプレビューだけで回路を変更しない');
palette.handlePointerUp(pointer(370, 310));
const placedGate = palette.findNode(palette.selected.id);
assert.deepEqual([placedGate.type, placedGate.x, placedGate.y], ['OR', 370, 310]);
assert.equal(palette.suppressPaletteClick, true, '直後のclickを抑止');
palette.undo();
assert.deepEqual(palette.snapshot(), beforePalette);
for (const end of ['outside', 'escape', 'pointercancel']) {
  palette.beginPaletteDrag(pointer(20, -30), 'NOT', paletteButton);
  palette.handlePointerMove(pointer(300, 200));
  if (end === 'outside') palette.handlePointerUp(pointer(-20, 200));
  if (end === 'escape') palette.handleDocumentKeyDown({ key: 'Escape', preventDefault() {} });
  if (end === 'pointercancel') palette.cancelPointerGesture({ pointerId: 7 });
  assert.equal(palette.paletteDrag, null);
  assert.deepEqual(palette.snapshot(), beforePalette, `${end}で部品・履歴を増やさない`);
  assert.equal(palette.historyIndex, 0);
}

// 報告された配置：Aの配線との交差を避けるだけの余分な折り返しを作らない。
editor.graph = {
  nodes: [
    { id: 'a', type: 'input', name: 'A', x: 72, y: 80 },
    { id: 'b', type: 'input', name: 'B', x: 72, y: 210 },
    { id: 'and', type: 'AND', x: 470, y: 155 },
    { id: 'or', type: 'OR', x: 550, y: 290 },
    { id: 'f', type: 'output', name: 'F', x: 828, y: 265 }
  ],
  wires: [
    { id: 'a-or', from: 'a', to: 'or', port: 0 },
    { id: 'b-and', from: 'b', to: 'and', port: 1 },
    { id: 'b-or', from: 'b', to: 'or', port: 1 },
    { id: 'or-f', from: 'or', to: 'f', port: 0 }
  ]
};
const routing = editor.computeWireRouting();
assert.equal(routing.routes.get('b-and').segments.length, 1, '分岐バスからANDまでは直線');
assert.equal(routing.routes.get('b-or').segments.length, 1, '分岐バスからORまでは直線');
assert.equal(routing.bundles[0].junctions.length, 1, '分岐点のみ●、上下の角には付けない');
const segments = [...routing.routes.values(), ...routing.bundles].flatMap(route => route.segments);
for (const segment of segments) {
  assert.ok(segment.from.x === segment.to.x || segment.from.y === segment.to.y, '配線は水平・垂直');
}
for (let i = 0; i < segments.length; i += 1) {
  for (const other of segments.slice(i + 1)) {
    const segment = segments[i];
    if (segment.axis !== other.axis || segment.fixed !== other.fixed) continue;
    assert.ok(Math.min(segment.end, other.end) - Math.max(segment.start, other.start) <= 1, '線分を重ねない');
  }
}
console.log('logic-editor: ドラッグ追加・入力削除・複数出力・交換・両端の付け替え・接続の置き換え・履歴・接続制限・分岐経路を検証');
