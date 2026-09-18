'use strict';
const assert = require('node:assert/strict');
const C = require('../core.js'), L = require('../layers.js');
const original = C.createDocument();
original.pages[0].objects = [C.makeShape('rect', 0, 0, 20, 20), C.makeShape('ellipse', 30, 0, 20, 20)];
const [first, second] = original.pages[0].objects.map(object => object.id);
assert.deepEqual(C.validateDocument(original), original, '旧作品を開くだけでは任意の表示キーを追加しない');
assert.equal(L.visible(original.pages[0], first), true);
const history = new C.History(original);
history.change(doc => L.setObjectVisible(doc.pages[0], first, false));
const hidden = history.document;
assert.equal(hidden.version, 8);
assert.equal(L.visible(hidden.pages[0], first), false);
assert.equal(L.visible(hidden.pages[0], second), true);
assert.equal(L.visible(hidden.pages[0], 'missing'), false);
assert.equal(hidden.pages[0].layers, undefined, '個別の非表示だけで明示レイヤーを作らない');
history.undo(); assert.deepEqual(history.document, original);
history.redo(); assert.deepEqual(history.document, hidden);
history.change(doc => L.setObjectVisible(doc.pages[0], first, true));
assert.equal(history.document.version, 8, '再表示しても文書バージョンを下げない');
for (const value of [0, 1, null, '', 'false', undefined]) {
  const invalid = C.clone(original); invalid.pages[0].objects[0].visible = value;
  assert.throws(() => C.validateDocument(invalid), /visible/);
  assert.throws(() => L.setObjectVisible(invalid.pages[0], first, value), /boolean/);
}
assert.throws(() => L.setObjectVisible(original.pages[0], 'missing', false), /unknown object/);
const grouped = C.clone(hidden), p = grouped.pages[0];
p.objects.forEach(object => object.group = 'group');
const copies = C.duplicateObjects(p, [second]);
assert.equal(copies.length, 2, 'グループの複製は隠れた部品も保持する');
assert.equal(p.objects.find(object => object.id === copies[0]).visible, false);
const layer = L.create(p, '上'); L.moveObjects(p, [second], layer);
L.setVisible(p, layer, false);
assert.equal(L.visible(p, second), false);
L.setVisible(p, layer, true);
assert.equal(L.visible(p, second), true);
assert.equal(L.visible(p, first), false, 'レイヤーの再表示で個別非表示を解除しない');
L.setLocked(p, layer, true); p.objects[0].locked = true;
L.setObjectVisible(p, first, true); assert.equal(L.visible(p, first), true, '固定と表示は別の属性');
const animated = C.clone(hidden), a = animated.pages[0];
a.animations = [
  {id: 'hide-only', targets: [first], effect: 'fade', mode: 'in', trigger: 'click', duration: 600, delay: 0},
  {id: 'mixed', targets: [first, second], effect: 'fade', mode: 'out', trigger: 'click', duration: 600, delay: 0}
];
const before = C.clone(a), output = L.forOutput(a);
assert.deepEqual(a, before, '出力用の可視性判定で原稿や動きを変更しない');
assert.deepEqual(output.objects.map(object => object.id), [second]);
assert.deepEqual(output.animations.map(effect => effect.targets), [[second]]);
assert.equal(C.validateDocument({...animated, pages: [output]}).version, 8);
console.log('object-visibility.test.cjs: passed');
