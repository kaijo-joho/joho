#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const A = require('../animation.js');
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, message || `${actual} !== ${expected}`);
const style = (fill = '#000000', stroke = '#FFFFFF') => ({ fill, stroke, strokeWidth: 1, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 18, fontFamily: 'sans-serif', bold: false, italic: false });
const path = (id, overrides = {}) => Object.assign({ id, type: 'path', name: id, group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0], style: style() }, overrides);
const animation = (id, targets, effect, extra = {}) => Object.assign({ id, targets, effect, trigger: 'with', duration: 100, delay: 0 }, extra);
const object = (frame, id) => frame.page.objects.find(o => o.id === id);

const timeline = { objects: [path('a')], animations: [
  animation('in', ['a'], 'fade', { mode: 'in', duration: 100 }),
  animation('move-after', ['a'], 'move', { trigger: 'after', delay: 20, duration: 80, dx: 20, dy: -8 }),
  animation('wipe-with', ['a'], 'wipe', { trigger: 'with', duration: 30, mode: 'in', direction: 'right' }),
  animation('click', ['a'], 'color', { trigger: 'click', duration: 40, delay: 10, channel: 'fill', color: '#FF0000' })
] };
const plan = A.compile(timeline);
assert.equal(plan.groups.length, 2); assert.equal(plan.steps, 1);
assert.deepEqual(plan.groups[0].items.map(i => [i.start, i.end]), [[0, 100], [120, 200], [120, 150]]);
assert.deepEqual(plan.groups[1].items.map(i => [i.start, i.end]), [[10, 50]]);
near(A.frame(timeline, 0, 50, { plan }).visuals.a.opacity, .5);
near(object(A.frame(timeline, 0, 160, { plan }), 'a').matrix[4], 10);
near(object(A.frame(timeline, 0, Infinity, { plan }), 'a').matrix[4], 20);
assert.equal(object(A.frame(timeline, 0, Infinity, { plan }), 'a').style.fill, '#000000', 'future click color does not apply early');
assert.equal(object(A.frame(timeline, 1, 0, { plan }), 'a').style.fill, '#000000');
assert.equal(object(A.frame(timeline, 1, Infinity, { plan }), 'a').style.fill, '#FF0000');
const instant = { objects: [path('instant')], animations: [animation('instant-in', ['instant'], 'fade', { mode: 'in', duration: 0, delay: 0 })] };
assert.equal(A.frame(instant, 0, 0).visuals.instant.opacity, 1, 'zero-duration effects complete at their delayed start');

const fades = { objects: [path('f'), path('out')], animations: [
  animation('fade-in', ['f'], 'fade', { mode: 'in', duration: 100 }),
  animation('fade-out', ['f'], 'fade', { trigger: 'after', mode: 'out', duration: 100 }),
  animation('fade-in-2', ['f'], 'fade', { trigger: 'after', mode: 'in', duration: 100 }),
  animation('out-first', ['out'], 'fade', { trigger: 'with', mode: 'out', duration: 100 })
] };
const fadePlan = A.compile(fades);
assert.equal(A.frame(fades, 0, 0, { plan: fadePlan }).visuals.f.opacity, 0);
assert.equal(A.frame(fades, 0, 0, { plan: fadePlan }).visuals.out.opacity, 1);
near(A.frame(fades, 0, 50, { plan: fadePlan }).visuals.f.opacity, .5);
near(A.frame(fades, 0, 150, { plan: fadePlan }).visuals.f.opacity, .5);
near(A.frame(fades, 0, 250, { plan: fadePlan }).visuals.f.opacity, .5);
near(A.frame(fades, 0, Infinity, { plan: fadePlan }).visuals.f.opacity, 1);

const wipe = { objects: [path('w')], animations: [animation('wipe-id', ['w'], 'wipe', { mode: 'out', direction: 'down', duration: 100 })] };
assert.deepEqual(A.frame(wipe, 0, 50).visuals.w, { opacity: 1, reveal: { fraction: .5, direction: 'down', animationId: 'wipe-id' } });

const connector = { id: 'connector', type: 'connector', name: '', group: null, locked: true, matrix: [1, 0, 0, 1, 0, 0], style: style('none', '#000000'), from: { x: 1, y: 2, objectId: 'a', port: 'auto', ratio: .5, normal: { x: 1, y: 0 } }, to: { x: 20, y: 3, objectId: 'b', port: 'auto', ratio: .5, normal: { x: -1, y: 0 } }, waypoints: [{ x: 8, y: 4 }], labelOffset: { x: 4, y: -2 } };
const moves = { objects: [path('locked', { locked: true }), connector], animations: [
  animation('locked-move', ['locked'], 'move', { dx: 10, dy: 0, duration: 100 }),
  animation('connector-move', ['connector'], 'move', { trigger: 'after', dx: 6, dy: 9, duration: 100 })
] };
const movesPlan = A.compile(moves), halfMove = A.frame(moves, 0, 50, { plan: movesPlan }), fullMove = A.frame(moves, 0, Infinity, { plan: movesPlan });
near(object(halfMove, 'locked').matrix[4], 5); near(object(fullMove, 'locked').matrix[4], 10);
assert.equal(object(halfMove, 'connector').from.objectId, 'a', 'future moves do not detach early');
assert.equal(object(fullMove, 'connector').from.objectId, null); assert.equal(object(fullMove, 'connector').to.objectId, null);
assert.deepEqual(object(fullMove, 'connector').from.normal, { x: 1, y: 0 }); assert.deepEqual(object(fullMove, 'connector').labelOffset, { x: 4, y: -2 });
near(object(fullMove, 'connector').from.x, 7); near(object(fullMove, 'connector').from.y, 11);
assert.deepEqual(moves.objects[1].from, connector.from, 'frame never mutates the input connector');

const colors = { objects: [path('color', { style: style('#000000', 'none') }), path('__proto__'), path('constructor'), path('none', { style: style('none', '#000000') })], animations: [
  animation('red', ['color'], 'color', { channel: 'fill', color: '#FF0000', duration: 100 }),
  animation('blue-same-start', ['color'], 'color', { channel: 'fill', color: '#0000FF', duration: 100 }),
  animation('proto', ['__proto__'], 'color', { channel: 'fill', color: '#00FF00', duration: 100 }),
  animation('constructor', ['constructor'], 'color', { channel: 'stroke', color: '#FF00FF', duration: 100 }),
  animation('none', ['none'], 'color', { channel: 'fill', color: '#123456', duration: 100 })
] };
const colorPlan = A.compile(colors), colorHalf = A.frame(colors, 0, 50, { plan: colorPlan });
assert.equal(object(colorHalf, 'color').style.fill, '#000080', 'same-start later effect starts from base color and wins');
assert.equal(object(colorHalf, '__proto__').style.fill, '#008000'); assert.equal(object(colorHalf, 'constructor').style.stroke, '#FF80FF');
assert.equal(object(A.frame(colors, 0, 0, { plan: colorPlan }), 'none').style.fill, 'none');
assert.equal(object(colorHalf, 'none').style.fill, '#123456', 'none switches to a real color after animation begins');
const chainedColors = { objects: [path('chain')], animations: [
  animation('to-red', ['chain'], 'color', { channel: 'fill', color: '#FF0000', duration: 100 }),
  animation('to-blue', ['chain'], 'color', { trigger: 'after', channel: 'fill', color: '#0000FF', duration: 100 })
] };
assert.equal(object(A.frame(chainedColors, 0, 150), 'chain').style.fill, '#800080', 'later color interpolates from the completed earlier color');

const richText = (id, runs, fill = '#111111') => ({ id, type: 'text', name: id, group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0], x: 0, y: 0, runs, style: style(fill, 'none') });
const richColors = { objects: [richText('rich', [{ text: '赤', script: 'normal', fill: '#FF0000' }, { text: '親', script: 'normal' }, { text: '無', script: 'normal', fill: 'none' }])], animations: [
  animation('rich-red', ['rich'], 'color', { channel: 'fill', color: '#00FF00', duration: 100 }),
  animation('rich-blue-same-start', ['rich'], 'color', { channel: 'fill', color: '#0000FF', duration: 100 }),
  animation('rich-chain', ['rich'], 'color', { trigger: 'after', channel: 'fill', color: '#FFFFFF', duration: 100 })
] };
const richPlan = A.compile(richColors), richHalf = object(A.frame(richColors, 0, 50, { plan: richPlan }), 'rich');
assert.deepEqual(richHalf.runs.map(run => run.fill), ['#800080', '#090988', '#0000FF'], '同時に重なる後続の文字色アニメーションは各runの元色から補間して優先する');
assert.equal(richHalf.style.fill, '#111111', '文字の親スタイルは部分色アニメーションで書き換えない');
const richChained = object(A.frame(richColors, 0, 150, { plan: richPlan }), 'rich');
assert.deepEqual(richChained.runs.map(run => run.fill), ['#8080FF', '#8080FF', '#8080FF'], '連続する文字色アニメーションは前の終了色から補間する');
assert.deepEqual(object(A.frame(richColors, 0, 0, { plan: richPlan }), 'rich').runs, richColors.objects[0].runs, '時刻を戻した評価では元のrun色と省略属性を保持する');

const untouched = JSON.stringify(colors); A.frame(colors, 0, 50, { plan: colorPlan }); assert.equal(JSON.stringify(colors), untouched, 'plan/frame leave input unchanged');
for (const args of [[timeline, -1, 0], [timeline, 2, 0], [timeline, 0, -1], [timeline, 0, NaN]]) assert.throws(() => A.frame(...args), /Invalid animation position/);
console.log('animation.test.cjs: passed (26 assertion statements)');
