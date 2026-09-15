const assert = require('node:assert/strict');
const C = require('../core.js');
const R = require('../render.js');
const Parts = require('../parts.js');

const cases = [];
const test = (name, run) => { run(); cases.push(name); };
const ids = doc => doc.nodes.map(node => node.id);
const clone = value => JSON.parse(JSON.stringify(value));

function documentWithNodes(names = 'abcd') {
  const doc = C.createDocument();
  doc.nodes = [...names].map((name, index) => C.createNode('process', index * 220, 80, { id: name, text: name.toUpperCase() }));
  return doc;
}

test('Front, forward, backward, and back retain the selected block order', () => {
  const expected = { front: 'adbc', forward: 'adbc', backward: 'bcad', back: 'bcad' };
  for (const action of Object.keys(expected)) {
    const doc = documentWithNodes();
    assert.equal(C.reorderNodes(doc, ['b', 'c'], action), true);
    assert.equal(ids(doc).join(''), expected[action]);
  }
});

test('Multiple selected nodes and unselected nodes each retain their relative order', () => {
  const expected = { front: 'acebd', forward: 'acbed', backward: 'badce', back: 'bdace' };
  for (const [action, order] of Object.entries(expected)) {
    const doc = documentWithNodes('abcde');
    assert.equal(C.reorderNodes(doc, ['b', 'd'], action), true);
    assert.equal(ids(doc).join(''), order);
    assert.deepEqual(ids(doc).filter(id => ['b', 'd'].includes(id)), ['b', 'd']);
    assert.deepEqual(ids(doc).filter(id => !['b', 'd'].includes(id)), ['a', 'c', 'e']);
  }
});

test('Group selection expands to its nodes without altering its edges or node contents', () => {
  const doc = documentWithNodes();
  const edge = C.createEdge({ nodeId: 'a' }, { nodeId: 'c' }, { id: 'inside', label: { text: 'つながり', dx: 22, dy: -18 }, waypoints: [{ x: 190, y: 130 }] });
  doc.edges = [edge]; doc.groups = [{ id: 'group_ac', memberIds: ['a', 'c', 'inside'] }];
  const before = clone(doc);
  assert.deepEqual(C.expandSelection(doc, ['group_ac']).sort(), ['a', 'c', 'inside']);
  assert.equal(C.reorderNodes(doc, ['group_ac'], 'front'), true);
  assert.equal(ids(doc).join(''), 'bdac');
  assert.deepEqual(doc.edges, before.edges);
  assert.deepEqual(doc.groups, before.groups);
  for (const id of ['a', 'b', 'c', 'd']) assert.deepEqual(C.getNode(doc, id), before.nodes.find(node => node.id === id));
});

test('Fixed members reject group reordering atomically while fixed unselected nodes may be crossed', () => {
  const doc = documentWithNodes();
  const edge = C.createEdge({ nodeId: 'a' }, { nodeId: 'b' }, { id: 'fixed_edge', locked: true });
  doc.edges = [edge]; doc.groups = [{ id: 'fixed_group', memberIds: ['a', 'b', 'fixed_edge'] }];
  const before = clone(doc);
  assert.deepEqual(C.nodeOrderActions(doc, ['a']), { front: false, forward: false, backward: false, back: false });
  assert.throws(() => C.reorderNodes(doc, ['a'], 'front'), /固定/);
  assert.deepEqual(doc, before);

  const crossing = documentWithNodes();
  crossing.nodes.find(node => node.id === 'd').locked = true;
  assert.equal(C.reorderNodes(crossing, ['b'], 'front'), true);
  assert.equal(ids(crossing).join(''), 'acdb');
});

test('Invalid operations are atomic and boundary or empty operations are no-ops', () => {
  const doc = documentWithNodes(), before = clone(doc);
  assert.throws(() => C.reorderNodes(doc, ['b'], 'middle'), /不正/);
  assert.throws(() => C.reorderNodes(doc, 'b', 'front'), /選択/);
  assert.deepEqual(doc, before);
  assert.equal(C.reorderNodes(doc, ['a'], 'back'), false);
  assert.equal(C.reorderNodes(doc, ['d'], 'front'), false);
  assert.equal(C.reorderNodes(doc, ['missing'], 'front'), false);
  assert.equal(C.reorderNodes(C.createDocument(), [], 'front'), false);
  assert.deepEqual(C.nodeOrderActions(doc, ['a']), { front: true, forward: true, backward: false, back: false });
});

test('JSON migration and normal round trips preserve node order without a new format field', () => {
  const doc = documentWithNodes();
  C.reorderNodes(doc, ['a', 'c'], 'front');
  const expected = ids(doc);
  const current = C.parseDocument(C.serializeDocument(doc));
  assert.deepEqual(ids(current), expected);
  const old = clone(doc); old.version = 1; delete old.groups; delete old.lesson;
  for (const item of [...old.nodes, ...old.edges, ...old.lanes]) delete item.locked;
  const migrated = C.parseDocument(old);
  assert.equal(migrated.version, 3);
  assert.deepEqual(ids(migrated), expected);
  assert.deepEqual(ids(C.parseDocument(C.serializeDocument(migrated))), expected);
});

test('Copy, paste, part capture, and part placement retain document node order', () => {
  const source = documentWithNodes('abc');
  C.reorderNodes(source, ['a'], 'front');
  assert.equal(ids(source).join(''), 'bca');
  const payload = C.copySelection(source, ids(source));
  assert.deepEqual(payload.nodes.map(node => node.text), ['B', 'C', 'A']);
  const pasted = documentWithNodes('z');
  const pastedIds = C.pasteSelection(pasted, payload);
  assert.deepEqual(pasted.nodes.filter(node => pastedIds.includes(node.id)).map(node => node.text), ['B', 'C', 'A']);

  const item = Parts.capture(source, ids(source), '重なり順');
  assert.deepEqual(Parts.documentFor(item).nodes.map(node => node.text), ['B', 'C', 'A']);
  const placed = documentWithNodes('z');
  const placedIds = Parts.place(placed, item, { x: 800, y: 280 });
  assert.deepEqual(placed.nodes.filter(node => placedIds.includes(node.id)).map(node => node.text), ['B', 'C', 'A']);
});

test('SVG scene and selected export follow node order after arrows', () => {
  const doc = documentWithNodes('abc');
  doc.edges = [C.createEdge({ nodeId: 'a' }, { nodeId: 'c' }, { id: 'edge_ac' })];
  C.reorderNodes(doc, ['a'], 'front');
  const scene = R.sceneMarkup(doc, { interactive: true });
  const edgeAt = scene.indexOf('data-edge="edge_ac"'), nodeAt = ids(doc).map(id => scene.indexOf(`data-node="${id}"`));
  assert.ok(edgeAt >= 0 && nodeAt.every(index => index > edgeAt));
  assert.deepEqual([...nodeAt].sort((a, b) => a - b), nodeAt);
  const selected = R.sceneMarkup(doc, { interactive: true, selectedIds: ['a', 'c'] });
  assert.ok(selected.indexOf('data-node="c"') < selected.indexOf('data-node="a"'));
  assert.equal(selected.includes('data-node="b"'), false);
});

test('Painting order does not reroute automatic arrows or move their labels', () => {
  const doc = C.createDocument();
  // Several equally short detours previously depended on obstacle array order.
  doc.nodes = [[30,270,80,60],[180,210,140,80],[240,210,80,100],[270,60,50,60],[180,240,50,100],
    [120,330,110,60],[270,330,110,60],[30,210,110,80],[210,270,80,100],[240,300,80,100]]
    .map(([x,y,w,h], index) => C.createNode('process', x, y, { id:`route_${index}`, w, h }));
  const edge = C.createEdge({x:0,y:80}, {x:520,y:380}, {label:{text:'重なりと経路'}});
  doc.edges = [edge];
  const before = R.edgeGeometry(doc, edge);
  for (const id of ids(doc)) {
    C.reorderNodes(doc, [id], 'front');
    const after = R.edgeGeometry(doc, doc.edges[0]);
    assert.equal(after.path, before.path);
    assert.deepEqual(after.label, before.label);
  }
});

test('A reorder is one reversible History change', () => {
  const doc = documentWithNodes(), before = clone(doc), history = new C.History(doc);
  assert.equal(C.reorderNodes(doc, ['b', 'd'], 'front'), true);
  assert.equal(history.commit(doc), true);
  assert.deepEqual(history.undo(), before);
  assert.deepEqual(history.redo(), doc);
});

console.log(JSON.stringify({ ok: true, cases }, null, 2));
