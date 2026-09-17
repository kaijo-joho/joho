/* 位置合わせを画面・保存・描画処理から独立して検証する。 */
'use strict';
const assert = require('node:assert/strict');
const Guides = require('../guides.js');
const object = (id, x, y, width, height, extra = {}) => ({ id, type: 'path', group: null, box: { x, y, width, height }, ...extra });
const prepare = (objects, selected = ['moving'], board = { infinite: true }, viewport, options) => Guides.prepare({ id: 'page', board, objects }, selected, object => object.box, viewport, options);
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6, `${actual} should equal ${expected}`);

const moving = object('moving', 0, 0, 60, 40), target = object('target', 100, 100, 60, 40);
const source = [moving, target], backup = JSON.stringify(source), session = prepare(source);
let result = Guides.move(session, { x: 98, y: 0 }, { zoom: 1 });
near(result.box.x, 100); near(result.box.y, 0);
assert(result.lines.some(line => line.axis === 'x' && line.position === 100));
assert.equal(JSON.stringify(source), backup, 'guides cannot change the document');
near(Guides.move(session, { x: 98, y: 0 }, { zoom: 4 }).box.x, 98, 'tolerance follows screen pixels');
near(Guides.move(session, { x: 88, y: 0 }, { zoom: .5 }).box.x, 100);

result = Guides.move(session, { x: 98, y: 0 }, { zoom: 1, fallback: { x: 90, y: 0 } });
near(result.box.x, 100);
result = Guides.move(session, { x: 98, y: 0 }, { enabled: false, fallback: { x: 90, y: 0 } });
near(result.box.x, 90); assert.deepEqual(result.lines, []); assert.deepEqual(result.distances, []);
result = Guides.move(session, { x: 98, y: 0 }, { alt: true, fallback: { x: 90, y: 0 } });
near(result.box.x, 98); assert.deepEqual(result.lines, []); assert.deepEqual(result.distances, []);

const board = prepare([object('moving', 20, 20, 60, 40)], ['moving'], { infinite: false, width: 500, height: 400 });
result = Guides.move(board, { x: 198, y: 158 }, { zoom: 1 });
near(result.box.x, 220); near(result.box.y, 180);
assert.equal(result.lines.length, 2, 'both centers align with the artboard');
assert.equal(prepare([moving]).targets.length, 0, 'an infinite canvas has no artificial origin targets');

const between = prepare([object('left', 0, 100, 60, 40), object('moving', 100, 100, 40, 40), object('right', 220, 100, 50, 40)]);
result = Guides.move(between, { x: 18, y: 0 }, { zoom: 1 });
near(result.box.x, 120);
assert.deepEqual(result.distances.filter(distance => distance.axis === 'x').map(distance => distance.value), [60, 60]);
const after = prepare([object('a', 0, 100, 40, 40), object('b', 70, 100, 40, 40), object('moving', 180, 100, 20, 40)]);
result = Guides.move(after, { x: -42, y: 0 }, { zoom: 1 });
near(result.box.x, 140);
assert.deepEqual(result.distances.filter(distance => distance.axis === 'x').map(distance => distance.value), [30, 30]);
const vertical = prepare([object('a', 100, 0, 40, 60), object('moving', 100, 100, 40, 40), object('b', 100, 220, 40, 50)]);
result = Guides.move(vertical, { x: 0, y: 18 }, { zoom: 1 });
near(result.box.y, 120);
assert.deepEqual(result.distances.filter(distance => distance.axis === 'y').map(distance => distance.value), [60, 60]);

const grouped = prepare([
  moving, object('group-a', 200, 80, 20, 40, { group: 'g' }), object('group-b', 260, 90, 30, 20, { group: 'g', locked: true }),
  object('reference', 0, 0, 600, 500, { type: 'image', reference: true }), object('connector', 0, 0, 500, 20, { type: 'connector' }),
  object('offscreen', 9999, 9999, 20, 20)
], ['moving'], { infinite: true }, { x: -50, y: -50, width: 500, height: 400 });
assert.equal(grouped.targets.length, 1, 'groups count once; guides omit the moving objects, reference images, connectors and offscreen targets');
assert.deepEqual(grouped.targets[0].box, { x: 200, y: 80, width: 90, height: 40 });

const hidden = prepare([moving, target, object('hidden', 98, 0, 60, 40)], ['moving'], { infinite: true }, undefined, { isVisible: object => object.id !== 'hidden' });
assert.equal(hidden.targets.length, 1, 'hidden layer objects are excluded from guide targets');
assert.equal(Guides.move(hidden, { x: 96, y: 0 }, { zoom: 1 }).box.x, 100, 'visible targets remain available to guides');

const resizing = prepare([object('moving', 0, 0, 50, 20), object('target', 100, 100, 30, 40)]);
result = Guides.resize(resizing, { x: 0, y: 0, width: 97, height: 20 }, { x: 'end', zoom: 1 });
near(result.box.width, 100); near(result.box.height, 20); near(result.box.x, 0);
result = Guides.resize(resizing, { x: 0, y: 0, width: 97, height: 38.8 }, { x: 'end', y: 'end', uniform: true, zoom: 1 });
near(result.box.width, 100); near(result.box.height, 40);
result = Guides.resize(resizing, { x: 0, y: 0, width: 97, height: 20 }, { x: 'end', alt: true });
near(result.box.width, 97); assert.deepEqual(result.lines, []);
const fromLeft = prepare([object('moving', 100, 100, 50, 20), object('target', 20, 250, 30, 40)]);
result = Guides.resize(fromLeft, { x: 22, y: 100, width: 128, height: 20 }, { x: 'start', zoom: 1 });
near(result.box.x, 20); near(result.box.width, 130); near(result.box.x + result.box.width, 150);

const output = Guides.markup({ lines: [], distances: [{ axis: 'x', start: 0, end: 96, position: 0, value: 96 }] }, 2, 'mm');
assert(output.includes('25.4 mm'));
assert(output.includes('font-size="5.5"'));
assert(!output.includes('NaN'));
console.log('guides.test.cjs: passed');
