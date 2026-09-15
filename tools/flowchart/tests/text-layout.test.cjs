const assert = require('node:assert/strict');
const Core = require('../core.js');
const Render = require('../render.js');
const Parts = require('../parts.js');

const cases = [];
const test = (name, run) => { run(); cases.push(name); };
const clone = value => JSON.parse(JSON.stringify(value));
const has = (value, key) => Object.hasOwn(value, key);

function documentWithNodes(...nodes) {
  const doc = Core.createDocument('flowchart');
  doc.nodes = nodes;
  return doc;
}

function viewBox(svg) {
  return svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
}

function corners(bounds) {
  return [[bounds.x, bounds.y], [bounds.x + bounds.w, bounds.y], [bounds.x, bounds.y + bounds.h], [bounds.x + bounds.w, bounds.y + bounds.h]];
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[j];
    if ((ay > point[1]) !== (by > point[1]) && point[0] < (bx - ax) * (point[1] - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function assertTextFitsShape(node) {
  const bounds = Render.nodeTextLayout(node).bounds, cut = Math.min(20, node.w * .17);
  const polygon = node.kind === 'manualInput' ? [[0, node.h * .22], [node.w, 0], [node.w, node.h], [0, node.h]]
    : node.kind === 'inputOutput' ? [[cut, 0], [node.w, 0], [node.w - cut, node.h], [0, node.h]]
      : node.kind === 'display' ? [[cut, 0], [node.w - cut, 0], [node.w + cut, node.h / 2], [node.w - cut, node.h], [cut, node.h], [0, node.h / 2]]
        : node.kind === 'loopStart' ? [[cut, 0], [node.w - cut, 0], [node.w, cut], [node.w, node.h], [0, node.h], [0, cut]]
          : node.kind === 'loopEnd' ? [[0, 0], [node.w, 0], [node.w, node.h - cut], [node.w - cut, node.h], [cut, node.h], [0, node.h - cut]]
            : [[0, 0], [node.w, 0], [node.w, node.h], [0, node.h]];
  for (const [x, y] of corners(bounds)) {
    const point = [x - node.x, y - node.y];
    if (node.kind === 'state' && node.variant !== 'round') {
      const dx = (point[0] - node.w / 2) / (node.w / 2), dy = (point[1] - node.h / 2) / (node.h / 2);
      assert.ok(dx * dx + dy * dy <= 1.000001);
    } else if (node.kind === 'decision') assert.ok(Math.abs((point[0] - node.w / 2) / (node.w / 2)) + Math.abs((point[1] - node.h / 2) / (node.h / 2)) <= 1.000001);
    else if (node.kind === 'terminal') {
      const r = Math.min(node.w, node.h) / 2, cx = point[0] < r ? r : point[0] > node.w - r ? node.w - r : point[0], cy = point[1] < r ? r : point[1] > node.h - r ? node.h - r : point[1];
      assert.ok((point[0] - cx) ** 2 + (point[1] - cy) ** 2 <= r * r + .000001);
    } else assert.ok(pointInPolygon(point, polygon));
  }
}

test('Legacy documents keep canonical styles without text-layout properties', () => {
  const node = Core.createNode('process', 10, 20, { id: 'legacy', text: '従来の文字' });
  const doc = documentWithNodes(node);
  const legacy = Core.serializeDocument(doc);
  const parsed = Core.parseDocument(legacy);

  for (const key of Object.keys(Core.TEXT_LAYOUT_DEFAULTS)) {
    assert.equal(has(node.style, key), false);
    assert.equal(has(parsed.nodes[0].style, key), false);
  }
  assert.equal(Core.serializeDocument(parsed), legacy);

  const explicitDefaults = Core.createNode('process', 0, 0, {
    style: { textAlign: 'center', textVertical: 'middle', textPaddingX: 12, textPaddingY: 13 }
  });
  for (const key of Object.keys(Core.TEXT_LAYOUT_DEFAULTS)) assert.equal(has(explicitDefaults.style, key), false);
});

test('Text layout validation rejects invalid values without changing documents', () => {
  const doc = documentWithNodes(Core.createNode('process', 0, 0, { id: 'node' }));
  const before = Core.serializeDocument(doc);
  for (const patch of [
    { textAlign: 'justify' }, { textVertical: 'baseline' },
    { textPaddingX: -1 }, { textPaddingX: 161 }, { textPaddingY: '20' }
  ]) {
    const invalid = clone(doc);
    invalid.nodes[0].style = { ...invalid.nodes[0].style, ...patch };
    assert.throws(() => Core.parseDocument(invalid));
    assert.equal(Core.serializeDocument(doc), before);
  }
});

test('Text layout returns the requested horizontal, vertical and padding geometry', () => {
  const base = Core.createNode('process', 10, 20, { id: 'base', w: 200, h: 100, text: '配置' });
  const leftTop = Core.createNode('process', 10, 20, {
    id: 'left_top', w: 200, h: 100, text: '配置',
    style: { textAlign: 'left', textVertical: 'top', textPaddingX: 30, textPaddingY: 20 }
  });
  const rightBottom = Core.createNode('process', 10, 20, {
    id: 'right_bottom', w: 200, h: 100, text: '配置',
    style: { textAlign: 'right', textVertical: 'bottom', textPaddingX: 20, textPaddingY: 20 }
  });
  const middle = Render.nodeTextLayout(base), left = Render.nodeTextLayout(leftTop), right = Render.nodeTextLayout(rightBottom);

  assert.deepEqual({ x: middle.x, y: middle.y, width: middle.width, anchor: middle.anchor }, { x: 110, y: 70, width: 176, anchor: 'middle' });
  assert.deepEqual({ x: left.x, y: left.y, width: left.width, anchor: left.anchor }, { x: 40, y: 50.8, width: 140, anchor: 'start' });
  assert.deepEqual({ x: right.x, y: right.y, width: right.width, anchor: right.anchor }, { x: 190, y: 89.2, width: 160, anchor: 'end' });
  assert.deepEqual(left.box, { x: 40, y: 40, w: 140, h: 60 });
  assert.deepEqual(right.box, { x: 30, y: 40, w: 160, h: 60 });
  assert.ok(left.bounds.x >= left.box.x && left.bounds.y >= left.box.y);
  assert.ok(right.bounds.x + right.bounds.w <= right.box.x + right.box.w);
});

test('Non-central text stays within curved, diagonal and cut-corner shapes', () => {
  const entries = [
    ['state', { w: 160, h: 110 }], ['terminal', { w: 180, h: 72 }], ['decision', { w: 180, h: 120 }],
    ['manualInput', { w: 180, h: 90 }], ['inputOutput', { w: 180, h: 80 }], ['display', { w: 180, h: 80 }], ['loopStart', { w: 180, h: 80 }], ['loopEnd', { w: 180, h: 80 }]
  ];
  for (const [kind, size] of entries) {
    const node = Core.createNode(kind, 40, 50, { id: `safe_${kind}`, ...size, text: '文字', style: { textAlign: 'left', textVertical: 'top', textPaddingX: 0, textPaddingY: 0 } });
    assertTextFitsShape(node);
    const long = { ...node, text: '余白を含めて安全に収める長い文字列です' };
    const fitted = { ...long, ...Render.fitNode(long) };
    assert.ok(fitted.w <= 4000 && fitted.h <= 4000);
    assertTextFitsShape(fitted);
  }
});

test('Default centered text layout remains byte-for-byte equivalent in geometry', () => {
  const state = Core.createNode('state', 10, 20, { w: 120, h: 120, text: '既定' }), terminal = Core.createNode('terminal', 10, 20, { w: 160, h: 52, text: '既定' });
  assert.deepEqual(Render.nodeTextLayout(state), { x: 70, y: 80, width: 96, anchor: 'middle', lines: ['既定'], step: 21.6, box: { x: 22, y: 37.57359312880715, w: 96, h: 84.8528137423857 }, bounds: { x: 54, y: 69.2, w: 32, h: 21.6 } });
  assert.deepEqual(Render.nodeTextLayout(terminal), { x: 90, y: 46, width: 136, anchor: 'middle', lines: ['既定'], step: 21.6, box: { x: 22, y: 33, w: 136, h: 26 }, bounds: { x: 74, y: 35.2, w: 32, h: 21.6 } });
});

test('Long text keeps SVG export bounds complete and fitNode includes custom padding', () => {
  const node = Core.createNode('process', 100, 80, {
    id: 'long', w: 90, h: 40,
    text: 'とても長い文字列を余白付きで表示するための確認です',
    style: { textAlign: 'left', textVertical: 'top', textPaddingX: 36, textPaddingY: 28 }
  });
  const fitted = Render.fitNode(node);
  assert.ok(fitted.w >= 90 && fitted.h >= 40);
  assert.ok(fitted.w >= 72, 'Horizontal padding is included in the fitted width');
  const fittedNode = { ...node, ...fitted }, layout = Render.nodeTextLayout(fittedNode);
  assert.ok(layout.lines.length >= 1 && layout.box.w >= 10 && layout.box.h > 0);

  const doc = documentWithNodes(fittedNode), bounds = Render.documentBounds(doc), svg = Render.svgDocument(doc, { padding: 0 }), box = viewBox(svg);
  assert.ok(bounds.x <= layout.bounds.x && bounds.y <= layout.bounds.y);
  assert.ok(bounds.x + bounds.w >= layout.bounds.x + layout.bounds.w);
  assert.ok(bounds.y + bounds.h >= layout.bounds.y + layout.bounds.h);
  [bounds.x, bounds.y, bounds.w, bounds.h].forEach((value, index) => assert.ok(Math.abs(box[index] - value) < .001));
  assert.equal((svg.match(/<tspan/g) || []).length, layout.lines.length);
});

test('Style copying applies text layout only from nodes to node targets', () => {
  const source = Core.createNode('process', 0, 0, {
    id: 'source', style: { fill: '#ffeeaa', textAlign: 'left', textVertical: 'top', textPaddingX: 31, textPaddingY: 22 }
  });
  const target = Core.createNode('process', 260, 0, {
    id: 'target', style: { fill: '#dbeafe', textAlign: 'right', textVertical: 'bottom', textPaddingX: 17, textPaddingY: 18 }
  });
  const edge = Core.createEdge({ nodeId: source.id }, { nodeId: target.id }, { id: 'edge', style: { stroke: '#dc2626', bold: true } });
  const doc = documentWithNodes(source, target); doc.edges = [edge];

  const nodePayload = Core.copyStyle(doc, source.id);
  Core.pasteStyle(doc, [target.id, edge.id], nodePayload);
  const pastedNode = doc.nodes.find(item => item.id === target.id), pastedEdge = doc.edges[0];
  assert.equal(pastedNode.style.fill, '#ffeeaa');
  for (const key of Object.keys(Core.TEXT_LAYOUT_DEFAULTS)) assert.equal(pastedNode.style[key], source.style[key]);
  assert.equal(pastedEdge.style.fill, '#ffffff');
  for (const key of Object.keys(Core.TEXT_LAYOUT_DEFAULTS)) assert.equal(has(pastedEdge.style, key), false);

  const edgePayload = Core.copyStyle(doc, edge.id), layoutBefore = clone(pastedNode.style);
  Core.pasteStyle(doc, [target.id], edgePayload);
  assert.equal(pastedNode.style.fill, layoutBefore.fill);
  for (const key of Object.keys(Core.TEXT_LAYOUT_DEFAULTS)) assert.equal(pastedNode.style[key], layoutBefore[key]);
});

test('JSON, parts capture and placement retain text layout, and history restores it', () => {
  const source = Core.createNode('process', 60, 80, {
    id: 'source', text: '部品として保存',
    style: { textAlign: 'right', textVertical: 'bottom', textPaddingX: 27, textPaddingY: 19 }
  });
  const doc = documentWithNodes(source), item = Parts.capture(doc, [source.id], '文字配置');
  const library = Parts.parseLibrary({ format: 'kaijo-flowchart-parts', version: 1, items: [item] });
  const restored = Parts.parseLibrary(Parts.serializeLibrary(library)).items[0];
  assert.deepEqual(restored.selection.nodes[0].style, source.style);
  assert.deepEqual(Parts.documentFor(restored).nodes[0].style, source.style);

  const destination = Core.createDocument('flowchart');
  Parts.place(destination, restored, { x: 300, y: 240 });
  assert.deepEqual(destination.nodes[0].style, source.style);

  const target = Core.createNode('process', 380, 80, { id: 'target' });
  doc.nodes.push(target);
  const history = new Core.History(doc), payload = Core.copyStyle(doc, source.id), before = Core.serializeDocument(doc);
  assert.deepEqual(Core.pasteStyle(doc, [target.id], payload), [target.id]);
  const after = Core.serializeDocument(doc);
  assert.equal(history.commit(doc), true);
  assert.equal(Core.serializeDocument(history.undo()), before);
  assert.equal(Core.serializeDocument(history.redo()), after);
});

console.log(JSON.stringify({ ok: true, cases }, null, 2));
