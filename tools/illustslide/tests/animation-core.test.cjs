'use strict';
const assert = require('node:assert/strict');
const Core = require('../core.js');

function basePage() {
  const page = Core.createPage('アニメーション');
  const rect = Core.makeShape('rect', 0, 0, 40, 30);
  rect.id = 'rect';
  const text = Core.makeText(60, 30, '説明');
  text.id = 'text';
  page.objects.push(rect, text);
  return page;
}
function animation(overrides) { return Object.assign({ id: 'anim', targets: ['rect'], effect: 'fade', trigger: 'click', duration: 200, delay: 0, mode: 'in' }, overrides); }
function documentWith(page, version = 3) { return { format: 'kaijo-ilapo', version, id: 'doc', name: '図', pages: [page] }; }

const page = basePage();
page.animations = [animation()];
const source = documentWith(page);
const snapshot = Core.clone(source);
const checked = Core.validateDocument(source);
assert.deepEqual(source, snapshot, 'validation must not mutate its input');
assert.equal(checked.version, 3);
assert.deepEqual(checked.pages[0].animations[0].targets, ['rect']);
const move = animation({ effect: 'move', dx: 20, dy: -4 }); delete move.mode;
assert.doesNotThrow(() => Core.validateAnimation(move, page));

assert.throws(() => Core.validateDocument(documentWith(Object.assign(basePage(), { animations: [animation({ targets: ['missing'] })] }))), /unknown animation target/);
assert.throws(() => Core.validateDocument(documentWith(Object.assign(basePage(), { animations: [animation({ targets: ['rect', 'rect'] })] }))), /duplicate animation target/);
assert.throws(() => Core.validateDocument(documentWith(Object.assign(basePage(), { animations: [animation({ nope: true })] }))), /not allowed/);
assert.throws(() => Core.validateDocument(documentWith(Object.assign(basePage(), { animations: [animation({ effect: 'wipe', direction: 'diagonal' })] }))), /wipe/);
assert.throws(() => Core.validateDocument(documentWith(Object.assign(basePage(), { animations: [animation({ duration: 10001 })] }))), /duration/);
const specialTargets = { objects: [{ id: 'image', type: 'image', reference: true }, { id: 'connector', type: 'connector' }] };
assert.throws(() => Core.validateAnimation(animation({ targets: ['image'] }), specialTargets), /reference image/);
const connectorColor = animation({ targets: ['connector'], effect: 'color', channel: 'fill', color: '#123456' }); delete connectorColor.mode;
assert.throws(() => Core.validateAnimation(connectorColor, specialTargets), /connector fill/);
const invalidColor = animation({ effect: 'color', channel: 'fill', color: 'none' }); delete invalidColor.mode;
assert.throws(() => Core.validateAnimation(invalidColor, page), /#RRGGBB/);

const v1 = documentWith(basePage(), 1);
assert.equal(Core.validateDocument(v1).version, 1, 'old v1 stays v1 when it has no newer features');
const v2 = documentWith(basePage(), 2);
assert.equal(Core.validateDocument(v2).version, 2, 'old v2 stays v2 when it has no newer features');
assert.equal(Core.validateDocument(documentWith(Object.assign(basePage(), { animations: [animation()] }), 1)).version, 3, 'effects upgrade a document to v3');
assert.equal(Core.validateDocument(documentWith(Object.assign(basePage(), { animations: [] }), 3)).version, 3, 'explicit v3 remains v3 even with no effects');

const history = new Core.History(checked);
history.change(doc => doc.pages[0].objects.splice(0, 1));
assert.equal(history.document.pages[0].animations.length, 0, 'history prunes targets removed by direct array edits');
history.undo();
assert.equal(history.document.pages[0].animations.length, 1, 'undo restores pruned effects');

const duplicated = Core.clone(checked).pages[0];
const newIds = Core.duplicateObjects(duplicated, ['rect']);
assert.equal(duplicated.animations.length, 2);
assert.deepEqual(duplicated.animations[1].targets, [newIds[0]]);
assert.notEqual(duplicated.animations[1].id, duplicated.animations[0].id);
Core.removeObjects(duplicated, newIds);
assert.equal(duplicated.animations.length, 1, 'removeObjects prunes copied effects');

const partial = Core.clone(checked).pages[0];
partial.animations[0].targets = ['rect', 'text'];
const partialIds = Core.duplicateObjects(partial, ['rect']);
assert.deepEqual(partial.animations.at(-1).targets, [partialIds[0]], 'partial object duplication does not retarget the original unselected objects');

const copiedDoc = Core.clone(checked);
const copyId = Core.duplicatePage(copiedDoc, copiedDoc.pages[0].id);
const copy = copiedDoc.pages.find(p => p.id === copyId);
assert.equal(copy.animations.length, 1);
assert.notEqual(copy.animations[0].id, checked.pages[0].animations[0].id);
assert.notEqual(copy.animations[0].targets[0], checked.pages[0].animations[0].targets[0]);
assert.doesNotThrow(() => Core.validateDocument(copiedDoc));
console.log('animation-core.test.cjs: passed');
