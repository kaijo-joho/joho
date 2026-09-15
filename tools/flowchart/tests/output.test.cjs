const assert = require('node:assert/strict');
const Core = require('../core.js');
const Output = require('../output.js');
const Render = require('../render.js');

const cases = [];
const test = (name, fn) => { fn(); cases.push(name); };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message || `${actual} != ${expected}`);

test('Image layout preserves asymmetric padding and negative drawing coordinates at every supported scale', () => {
  const box = { x: -100, y: -50, w: 300, h: 200 }, padding = { top: 10, right: 30, bottom: 40, left: 20 };
  for (const scale of [1, 2, 4]) {
    const layout = Output.imageLayout(box, { padding, mode: 'scale', scale });
    assert.deepEqual(layout.viewBox, { x: -120, y: -60, w: 350, h: 250 });
    assert.deepEqual(layout.padding, padding);
    assert.equal(layout.width, 350 * scale);
    assert.equal(layout.height, 250 * scale);
    assert.equal(layout.scale, scale);
    assert.equal(layout.adjusted, false);
  }
  assert.deepEqual(Output.padding(0), { top: 0, right: 0, bottom: 0, left: 0 });
});

test('Specified image width and height retain the viewBox aspect ratio', () => {
  const box = { x: -10, y: 20, w: 300, h: 200 }, padding = { top: 10, right: 30, bottom: 40, left: 20 };
  const byWidth = Output.imageLayout(box, { padding, mode: 'width', width: 700 });
  const byHeight = Output.imageLayout(box, { padding, mode: 'height', height: 500 });
  assert.deepEqual(byWidth.viewBox, { x: -30, y: 10, w: 350, h: 250 });
  assert.equal(byWidth.width, 700); assert.equal(byWidth.height, 500); close(byWidth.scale, 2);
  assert.equal(byHeight.width, 700); assert.equal(byHeight.height, 500); close(byHeight.scale, 2);
  const rounded = Output.imageLayout({ x: 0, y: 0, w: 333, h: 100 }, { padding: 0, mode: 'width', width: 1000 });
  assert.equal(rounded.width, 1000); assert.equal(rounded.height, 300);
  assert.ok(Math.abs(rounded.width / rounded.height - 333 / 100) <= 1 / rounded.height + 1e-12, 'Only integer pixel rounding may affect the final ratio');
});

test('Image layout limits each dimension to 8192px and total pixels to 32000000', () => {
  const dimensionLimited = Output.imageLayout({ x: -300, y: 10, w: 5000, h: 1000 }, { padding: 0, mode: 'scale', scale: 4 });
  assert.equal(dimensionLimited.width, 8192);
  assert.equal(dimensionLimited.height, 1638);
  assert.ok(dimensionLimited.width <= 8192 && dimensionLimited.height <= 8192);
  assert.ok(dimensionLimited.width * dimensionLimited.height <= 32000000);
  assert.equal(dimensionLimited.adjusted, true);

  const pixelLimited = Output.imageLayout({ x: -100, y: -100, w: 4000, h: 4000 }, { padding: 0, mode: 'scale', scale: 4 });
  assert.equal(pixelLimited.width, pixelLimited.height);
  assert.ok(pixelLimited.width < 8192, 'The pixel cap, rather than the per-side cap, applies here');
  assert.ok(pixelLimited.width * pixelLimited.height <= 32000000);
  close(pixelLimited.scale, Math.sqrt(32000000 / 16000000));
  assert.equal(pixelLimited.adjusted, true);
});

test('Image output rejects invalid boxes, margins, modes, scales and requested dimensions', () => {
  assert.throws(() => Output.imageLayout({ x: 0, y: 0, w: 0, h: 10 }), /大きさ/);
  assert.throws(() => Output.padding({ top: 0, right: -1, bottom: 0, left: 0 }), /余白/);
  assert.throws(() => Output.padding({ top: 0, right: 0, bottom: 0 }), /余白/);
  assert.throws(() => Output.imageLayout({ x: 0, y: 0, w: 10, h: 10 }, { padding: 0, mode: 'scale', scale: 3 }), /倍率/);
  assert.throws(() => Output.imageLayout({ x: 0, y: 0, w: 10, h: 10 }, { padding: 0, mode: 'width', width: 1.5 }), /整数/);
  assert.throws(() => Output.imageLayout({ x: 0, y: 0, w: 10, h: 10 }, { padding: 0, mode: 'height', height: 0 }), /寸法/);
  assert.throws(() => Output.imageLayout({ x: 0, y: 0, w: 10, h: 10 }, { padding: 0, mode: 'diagonal' }), /指定方法/);
});

test('Print fit honours both available dimensions and width mode shrinks rather than overflowing', () => {
  const fit = Output.printLayout({ x: -30, y: -20, w: 100, h: 80 }, { availableWidth: 200, availableHeight: 100, mode: 'fit', align: 'center', valign: 'middle' });
  assert.deepEqual(fit, { width: 125, height: 100, x: 37.5, y: 0, adjusted: false });
  const scaledDown = Output.printLayout({ x: 0, y: 0, w: 100, h: 50 }, { availableWidth: 200, availableHeight: 200, mode: 'width', width: 300, align: 'right', valign: 'bottom' });
  assert.deepEqual(scaledDown, { width: 200, height: 100, x: 0, y: 100, adjusted: true });
});

test('Print layout supports every horizontal and vertical placement combination', () => {
  const horizontal = { left: 0, center: 50, right: 100 }, vertical = { top: 0, middle: 75, bottom: 150 };
  for (const [align, expectedX] of Object.entries(horizontal)) for (const [valign, expectedY] of Object.entries(vertical)) {
    const layout = Output.printLayout({ x: -100, y: -80, w: 100, h: 50 }, { availableWidth: 200, availableHeight: 200, mode: 'width', width: 100, align, valign });
    assert.deepEqual(layout, { width: 100, height: 50, x: expectedX, y: expectedY, adjusted: false }, `${align}/${valign}`);
  }
});

test('Print layout rejects bad available space, requested width and alignment values', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 }, standard = { availableWidth: 200, availableHeight: 100 };
  assert.throws(() => Output.printLayout(box, { ...standard, availableWidth: 0 }), /印刷領域/);
  assert.throws(() => Output.printLayout(box, { ...standard, mode: 'width', width: 0 }), /印刷する図の幅/);
  assert.throws(() => Output.printLayout(box, { ...standard, mode: 'height' }), /配置/);
  assert.throws(() => Output.printLayout(box, { ...standard, align: 'near' }), /配置/);
  assert.throws(() => Output.printLayout(box, { ...standard, valign: 'baseline' }), /配置/);
});

test('SVG applies asymmetric padding to its viewBox and background without changing document colors or data', () => {
  const doc = Core.createDocument('flowchart');
  doc.title = '負の座標の図';
  const node = Core.createNode('process', -80, -30, { id: 'colored_node', text: '色', style: { fill: '#ffdd66', stroke: '#7c2d12', color: '#1d4ed8', bold: true } });
  const edge = Core.createEdge({ nodeId: node.id, side: 'right', offset: .5 }, { x: 260, y: -10 }, { id: 'colored_edge', kind: 'straight', style: { stroke: '#d946ef', strokeWidth: 4 }, label: { text: '線' } });
  doc.nodes = [node]; doc.edges = [edge];
  const before = Core.serializeDocument(doc), bounds = Render.documentBounds(doc), padding = { top: 11, right: 23, bottom: 37, left: 41 };
  const x = bounds.x - padding.left, y = bounds.y - padding.top, w = bounds.w + padding.left + padding.right, h = bounds.h + padding.top + padding.bottom;
  const svg = Render.svgDocument(doc, { padding, idPrefix: 'asymmetric' });
  assert.match(svg, new RegExp(`viewBox="${x} ${y} ${w} ${h}"`));
  assert.match(svg, new RegExp(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`));
  assert.match(svg, /fill="#ffdd66" stroke="#7c2d12"/);
  assert.match(svg, /fill="#1d4ed8"/);
  assert.match(svg, /stroke="#d946ef"/);
  assert.doesNotMatch(svg, /#273442|#e8eef7|var\(--/);
  assert.equal(Core.serializeDocument(doc), before);
  const transparent = Render.svgDocument(doc, { padding, transparent: true });
  assert.doesNotMatch(transparent, new RegExp(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`));
});

console.log(JSON.stringify({ ok: true, cases }, null, 2));
