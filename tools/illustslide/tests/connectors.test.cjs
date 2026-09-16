'use strict';
const assert = require('node:assert/strict');
const Core = require('../core.js');
global.IlapoCore = Core;
global.IlapoGeometry = { bounds(o) {
  if (o.box) return o.box;
  const n = String(o.d || '').match(/-?(?:\d+\.?\d*|\.\d+)/g)?.map(Number) || [o.x, o.y];
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}, visualBounds(o) { return this.bounds(o); } };
const C = require('../connectors.js');

const page = { objects: [
  { id: 'left', type: 'path', box: { x: 10, y: 20, width: 40, height: 30 }, matrix: [1, 0, 0, 1, 0, 0] },
  { id: 'right', type: 'path', box: { x: 150, y: 30, width: 60, height: 40 }, matrix: [1, 0, 0, 1, 0, 0] }
] };
const c = C.make({ x: 0, y: 0, objectId: 'left', port: 'right', ratio: .25 }, { x: 0, y: 0, objectId: 'right', port: 'left', ratio: .75 }, { route: 'orthogonal', label: '関連', labelOffset: { x: 3, y: -4 }, startArrow: 'open', endArrow: 'triangle', style: { stroke: '#123456', dash: '5 2' } });
page.objects.push(c);
const p = C.points(c, page);
assert.deepEqual(p[0], { x: 50, y: 27.5 });
assert.deepEqual(p[p.length - 1], { x: 150, y: 60 });
assert.equal(c.matrix.join(','), '1,0,0,1,0,0');
const parts = C.renderedParts(c, page);
assert.equal(parts.length, 4);
assert.equal(parts[0].style.dash, '5 2');
assert.equal(parts[1].style.dash, '');
assert.equal(parts[2].style.fill, '#123456');
assert.equal(parts[3].style.stroke, 'none');
assert(parts.every(o => o.matrix.join(',') === '1,0,0,1,0,0'));
C.sync(page);
assert.deepEqual({ x: c.from.x, y: c.from.y }, { x: 50, y: 27.5 });
page.objects.find(o => o.id === 'right').box.x += 40;
C.sync(page);
const afterMove = { from: { x: c.from.x, y: c.from.y }, to: { x: c.to.x, y: c.to.y } };
C.sync(page);
assert.deepEqual({ from: { x: c.from.x, y: c.from.y }, to: { x: c.to.x, y: c.to.y } }, afterMove, 'sync must not oscillate from its endpoint cache');
page.objects.splice(0, 1);
C.sync(page);
assert.equal(c.from.objectId, null);
assert.deepEqual({ x: c.from.x, y: c.from.y }, { x: 50, y: 27.5 });

const free = C.make({ x: 1, y: 2 }, { x: 10, y: 20 }, { waypoints: [{ x: 5, y: 9 }], labelOffset: { x: 2, y: 3 } });
const moved = C.transform(free, [2, 0, 0, 3, 10, -5]);
assert.deepEqual({ x: moved.from.x, y: moved.from.y }, { x: 12, y: 1 });
assert.deepEqual(moved.waypoints[0], { x: 20, y: 22 });
assert.deepEqual(moved.labelOffset, { x: 4, y: 9 });
assert.deepEqual(moved.matrix, [1, 0, 0, 1, 0, 0]);
const attached = C.transform(c, [1, 0, 0, 1, 100, 100]);
assert.equal(attached.to.x, c.to.x + 100);
assert.equal(attached.to.y, c.to.y + 100);
assert.ok(C.bounds(c, false, page).width > 0);

const orthogonal = C.make({ x: 0, y: 0 }, { x: 100, y: 50 }, { route: 'orthogonal' });
const orthogonalPoints = C.points(orthogonal);
assert(orthogonalPoints.slice(1).every((q, i) => q.x === orthogonalPoints[i].x || q.y === orthogonalPoints[i].y), 'each orthogonal segment is horizontal or vertical');
const via = C.make({ x: 0, y: 0, objectId: 'left', port: 'top' }, { x: 0, y: 0, objectId: 'right', port: 'bottom' }, { route: 'orthogonal', waypoints: [{ x: 90, y: -30 }, { x: 150, y: 90 }] });
const routePage = { objects: [
  { id: 'left', type: 'path', box: { x: 10, y: 20, width: 40, height: 30 }, matrix: [1, 0, 0, 1, 0, 0] },
  { id: 'right', type: 'path', box: { x: 150, y: 30, width: 60, height: 40 }, matrix: [1, 0, 0, 1, 0, 0] }, via
] };
const viaPoints = C.points(via, routePage);
assert(viaPoints.some(p => p.x === 90 && p.y === -30) && viaPoints.some(p => p.x === 150 && p.y === 90), 'every explicit waypoint remains on the route');
assert.equal(viaPoints[1].x, viaPoints[0].x, 'top port leaves vertically');
assert.equal(viaPoints.at(-2).x, viaPoints.at(-1).x, 'bottom port enters vertically');
const sameRow = C.make({ x: 0, y: 0, objectId: 'left', port: 'top' }, { x: 0, y: 0, objectId: 'right', port: 'right' }, { route: 'orthogonal' });
const sameRowPoints = C.points(sameRow, routePage);
assert.equal(sameRowPoints[1].x, sameRowPoints[0].x, 'top port still starts vertically on an otherwise horizontal route');
assert.equal(sameRowPoints.at(-2).y, sameRowPoints.at(-1).y, 'right port still ends horizontally');

const image = { id: 'photo', type: 'image', x: 10, y: 20, width: 40, height: 20, matrix: [0, 1, -1, 0, 100, 50] };
const imageConnector = C.make({ x: 0, y: 0, objectId: 'photo', port: 'top', ratio: .25 }, { x: 200, y: 200 });
assert.deepEqual(C.points(imageConnector, { objects: [image, imageConnector] })[0], { x: 80, y: 70 }, 'fixed image port is calculated locally then transformed');
assert.doesNotThrow(() => Core.validateObject(C.make({ x: 1, y: 2 }, { x: 3, y: 4 })), 'make output satisfies Core connector validation');
console.log('connectors.test.cjs: passed');
