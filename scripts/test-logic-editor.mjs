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

function editorFixture() {
  const editor = Object.assign(Object.create(context.LogicEditor.prototype), {
    options: {}, inputNames: ['A', 'B'], availableInputNames: ['A', 'B', 'C', 'D'],
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
assert.deepEqual(editor.snapshot(), unchanged, '他の配線で埋まった入力端子を拒否');
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
console.log('logic-editor: 入力追加・交換・配線左端の付け替え・履歴・接続制限・分岐経路を検証');
