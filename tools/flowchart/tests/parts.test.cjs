const assert = require('node:assert/strict');
const Core = require('../core.js');
const Render = require('../render.js');
const Parts = require('../parts.js');

const cases = [];
const test = (name, fn) => { fn(); cases.push(name); };
const clone = value => JSON.parse(JSON.stringify(value));
const stamp = '2026-09-15T00:00:00.000Z';

function selection(nodeId = 'node_a') {
  return {
    format: 'kaijo-diagram-selection', version: 3,
    nodes: [Core.createNode('process', 20, 30, { id: nodeId, text: '<script>文字</script>' })], edges: [], groups: []
  };
}

function rawItem(id, name, contents = selection()) {
  return { id, name, diagramType: 'flowchart', updatedAt: stamp, selection: contents };
}

test('Capturing preserves internal diagram structure, formatting, labels, groups and manual route points', () => {
  const doc = Core.createDocument('flowchart');
  const a = Core.createNode('process', 60, 90, { id: 'inside_a', text: '開始', locked: true, style: { fill: '#ffeeaa', bold: true } });
  const b = Core.createNode('decision', 360, 250, { id: 'inside_b', text: '判定', style: { stroke: '#b83232', fontSize: 21 } });
  const outside = Core.createNode('decision', 720, 180, { id: 'outside', text: '外部' });
  const inside = Core.createEdge({ nodeId: a.id, side: 'right', offset: .5 }, { nodeId: b.id, side: 'left', offset: .25 }, {
    id: 'inside_edge', kind: 'orthogonal', locked: true, label: { text: '内部線', t: .3, dx: 31, dy: -27 },
    waypoints: [{ x: 220, y: 122 }, { x: 220, y: 280 }, { x: 330, y: 280 }], style: { dashed: true, stroke: '#1d4ed8' }
  });
  const external = Core.createEdge({ nodeId: b.id, side: 'right', offset: .5 }, { nodeId: outside.id, side: 'auto', offset: .5 }, {
    id: 'external_edge', kind: 'curve', bend: { x: 620, y: 60 }, label: { text: '外へ', t: .72, dx: 18, dy: 14 }
  });
  doc.nodes = [a, b, outside]; doc.edges = [inside, external]; doc.groups = [{ id: 'inside_group', memberIds: [a.id, b.id, inside.id] }];
  const before = Core.serializeDocument(doc), expected = Render.edgeGeometry(doc, external).to;
  const item = Parts.capture(doc, [a.id, external.id], '  手順セット  ');
  assert.equal(item.name, '手順セット');
  assert.equal(item.diagramType, 'flowchart');
  assert.match(item.updatedAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(Core.serializeDocument(doc), before, 'capture must not alter the source');
  const copiedInside = item.selection.edges.find(edge => edge.id === inside.id);
  const copiedExternal = item.selection.edges.find(edge => edge.id === external.id);
  assert.deepEqual(copiedInside.waypoints, inside.waypoints);
  assert.deepEqual(copiedInside.label, inside.label);
  assert.deepEqual(copiedInside.style, inside.style);
  assert.equal(copiedInside.locked, true);
  assert.deepEqual(copiedExternal.bend, external.bend);
  assert.deepEqual(copiedExternal.label, external.label);
  assert.deepEqual(copiedExternal.to, expected, 'External endpoint follows the rendered outline, not a rectangle or center');
  assert.ok(!('nodeId' in copiedExternal.to));
  const copiedA = item.selection.nodes.find(node => node.id === a.id), copiedB = item.selection.nodes.find(node => node.id === b.id);
  assert.deepEqual({ x: copiedB.x - copiedA.x, y: copiedB.y - copiedA.y }, { x: b.x - a.x, y: b.y - a.y });
  assert.deepEqual(item.selection.groups, [{ id: 'inside_group', memberIds: [a.id, b.id, inside.id] }]);
  assert.ok(item.selection.nodes.every(node => node.laneId === null));
});

test('Preview documents are clean standalone documents and safely render plain text', () => {
  const item = rawItem('part_preview', '表示用', selection('preview_node'));
  const preview = Parts.documentFor(item);
  assert.equal(preview.format, 'kaijo-diagram');
  assert.equal(preview.diagramType, 'flowchart');
  assert.deepEqual(preview.lanes, []);
  assert.equal(preview.lesson, null);
  const svg = Render.svgDocument(preview);
  assert.match(svg, /&lt;script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
});

test('Placing uses the preview bounds center, generates IDs, unlocks copies and assigns current lanes', () => {
  const source = Core.createDocument('flowchart');
  const node = Core.createNode('process', 100, 80, { id: 'source_node', text: '配置', locked: true });
  const edge = Core.createEdge({ nodeId: node.id, side: 'right', offset: .5 }, { x: 360, y: 120 }, {
    id: 'source_edge', kind: 'orthogonal', locked: true, label: { text: '接続', dx: 12, dy: -22 }, waypoints: [{ x: 270, y: 112 }]
  });
  source.nodes = [node]; source.edges = [edge];
  const item = Parts.capture(source, [node.id, edge.id], '配置用');
  const originalItem = clone(item), originalSource = Core.serializeDocument(source);
  const destination = Core.createDocument('activity');
  destination.lanes = [{ id: 'destination_lane', title: '担当', x: 0, y: 0, w: 1000, h: 800, locked: false }];
  const beforeCount = destination.nodes.length + destination.edges.length;
  const ids = Parts.place(destination, item, { x: 500, y: 350 });
  assert.equal(ids.length, 2);
  assert.equal(destination.nodes.length + destination.edges.length, beforeCount + 2);
  assert.ok(ids.every(id => ![node.id, edge.id].includes(id)));
  const pastedNode = destination.nodes.find(n => ids.includes(n.id));
  const pastedEdge = destination.edges.find(e => ids.includes(e.id));
  assert.equal(pastedNode.locked, false);
  assert.equal(pastedEdge.locked, false);
  assert.equal(pastedNode.laneId, 'destination_lane');
  assert.deepEqual(pastedEdge.waypoints.map(p => ({ x: p.x - pastedNode.x, y: p.y - pastedNode.y })), edge.waypoints.map(p => ({ x: p.x - node.x, y: p.y - node.y })));
  const pastedBounds = Render.documentBounds({ ...destination, nodes: [pastedNode], edges: [pastedEdge], lanes: [], groups: [] });
  assert.ok(Math.abs(pastedBounds.x + pastedBounds.w / 2 - 500) < 1e-8);
  assert.ok(Math.abs(pastedBounds.y + pastedBounds.h / 2 - 350) < 1e-8);
  assert.equal(Core.serializeDocument(source), originalSource);
  assert.deepEqual(item, originalItem);
});

test('A set can be placed into another diagram type without reusing source IDs', () => {
  const item = rawItem('part_cross', '別図種', selection('cross_node'));
  const state = Core.createDocument('state');
  const ids = Parts.place(state, item, { x: 250, y: 180 });
  assert.equal(ids.length, 1);
  assert.notEqual(ids[0], 'cross_node');
  assert.equal(state.nodes[0].kind, 'process');
  Core.parseDocument(state);
});

test('Library parsing normalizes input without mutation and rejects malformed references, duplicate IDs and oversized input', () => {
  const input = { format: 'kaijo-flowchart-parts', version: 1, items: [rawItem('part_one', '  名前  ')] };
  const before = clone(input), library = Parts.parseLibrary(input);
  assert.equal(library.items[0].name, '名前');
  assert.deepEqual(input, before);
  assert.throws(() => Parts.parseLibrary({ format: 'kaijo-flowchart-parts', version: 1, items: [rawItem('same', 'A'), rawItem('same', 'B')] }), /重複/);
  const broken = rawItem('broken', '壊れた', { format: 'kaijo-diagram-selection', version: 3, nodes: [], edges: [Core.createEdge({ nodeId: 'missing' }, { x: 10, y: 20 })], groups: [] });
  assert.throws(() => Parts.parseLibrary({ format: 'kaijo-flowchart-parts', version: 1, items: [broken] }), /接続先/);
  assert.throws(() => Parts.parseLibrary('x'.repeat(2 * 1024 * 1024 + 1)), /2MB/);
});

test('Add, rename and remove return new libraries and never overwrite an existing ID', () => {
  const first = rawItem('part_first', '最初');
  const library = Parts.add(Parts.emptyLibrary(), first);
  assert.equal(library.items.length, 1);
  assert.equal(Parts.emptyLibrary().items.length, 0);
  assert.throws(() => Parts.add(library, first), /同じID/);
  assert.throws(() => Parts.rename(library, 'part_first', 'x'.repeat(81)), /1〜80文字/);
  const renamed = Parts.rename(library, 'part_first', '  改名  ');
  assert.equal(renamed.items[0].name, '改名');
  assert.equal(library.items[0].name, '最初');
  const removed = Parts.remove(renamed, 'part_first');
  assert.deepEqual(removed, Parts.emptyLibrary());
  assert.equal(renamed.items.length, 1);
});

test('Capacity and failed placement are atomic', () => {
  const items = Array.from({ length: 100 }, (_, index) => rawItem(`part_${index}`, `セット${index}`));
  const full = Parts.parseLibrary({ format: 'kaijo-flowchart-parts', version: 1, items });
  const fullBefore = clone(full);
  assert.throws(() => Parts.add(full, rawItem('part_extra', '追加')), /100件/);
  assert.deepEqual(full, fullBefore);
  assert.throws(() => Parts.merge(full, Parts.add(Parts.emptyLibrary(), rawItem('part_extra', '追加'))), /100件/);
  assert.deepEqual(full, fullBefore);

  const destination = Core.createDocument();
  destination.nodes = Array.from({ length: 1000 }, (_, index) => Core.createNode('process', 0, 0, { id: `full_node_${index}` }));
  const before = Core.serializeDocument(destination);
  assert.throws(() => Parts.place(destination, rawItem('part_place', '配置失敗'), { x: 20, y: 20 }), /多すぎ/);
  assert.equal(Core.serializeDocument(destination), before);
  assert.throws(() => Parts.place(destination, rawItem('part_place', '配置失敗'), { x: NaN, y: 20 }), /配置位置/);
  assert.equal(Core.serializeDocument(destination), before);
});

test('Merge keeps both sets when IDs or names collide and numbers copied names', () => {
  const base = Parts.parseLibrary({ format: 'kaijo-flowchart-parts', version: 1, items: [rawItem('part_shared', 'よく使う'), rawItem('part_base', '別名')] });
  const incoming = Parts.parseLibrary({ format: 'kaijo-flowchart-parts', version: 1, items: [rawItem('part_shared', 'よく使う'), rawItem('part_other', 'よく使う')] });
  const baseBefore = clone(base), incomingBefore = clone(incoming), merged = Parts.merge(base, incoming);
  assert.equal(merged.items.length, 4);
  assert.equal(new Set(merged.items.map(item => item.id)).size, 4);
  assert.ok(merged.items.some(item => item.name === 'よく使う (2)'));
  assert.ok(merged.items.some(item => item.name === 'よく使う (3)'));
  assert.deepEqual(base, baseBefore);
  assert.deepEqual(incoming, incomingBefore);
});

console.log(JSON.stringify({ ok: true, cases }, null, 2));
