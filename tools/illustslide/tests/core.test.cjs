'use strict';
const assert = require('assert');
const Core = require('../core.js');

const doc = Core.createDocument();
assert.equal(doc.format, 'kaijo-ilapo');
assert.equal(doc.pages.length, 1);
assert.equal(Core.boardPreset('a4').width, 210 * 96 / 25.4);
assert.equal(Core.boardPreset('16:9').height, 720);
assert(Math.abs(Core.boardPreset('b5', true).width - 257 * 96 / 25.4) < 1e-9);
assert(Math.abs(Core.boardPreset('businessCard').width - 55 * 96 / 25.4) < 1e-9);
assert.deepEqual(Core.boardPreset(18), { width: 18, height: 18, unit: 'px', infinite: false });
assert.equal(Core.boardPreset('36').width, 36);
assert.equal(Core.boardPreset(72).height, 72);

const page = doc.pages[0];
const rect = Core.makeShape('rect', 1.5, 2.5, 30, 40, { fill: '#12Abef', opacity: .5 });
assert.equal(Object.hasOwn(rect.style, 'fillOpacity'), false, 'new optional channels do not bloat existing-style objects');
const translucent = Core.makeShape('rect', 0, 0, 10, 10, { fillOpacity: .4, strokeOpacity: .7 });
assert.equal(Core.validateDocument({ format: 'kaijo-ilapo', version: 1, id: 'opacity', name: '', pages: [{ ...Core.createPage(), objects: [translucent] }] }).version, 7, 'channel opacity upgrades the document format');
const labelOpacity = Core.makeShape('rect', 0, 0, 10, 10);
labelOpacity.label = { runs: [{ text: '注記', script: 'normal' }], style: { ...Core.DEFAULT_STYLE, fillOpacity: .4 }, align: 'center', padding: 0 };
assert.equal(Core.validateDocument({ format: 'kaijo-ilapo', version: 1, id: 'label-opacity', name: '', pages: [{ ...Core.createPage(), objects: [labelOpacity] }] }).version, 7, 'shape-label channel opacity upgrades the document format');
assert.throws(() => Core.validateObject({ ...translucent, style: { ...translucent.style, fillOpacity: 1.1 } }), /fillOpacity/);
assert.throws(() => Core.validateObject({ ...translucent, style: { ...translucent.style, strokeOpacity: '0.5' } }), /strokeOpacity/);
const text = Core.makeText(4, 5, 'x²');
page.objects.push(rect, text);
assert.equal(Core.validateDocument(doc).pages[0].objects.length, 2);
assert.throws(() => Core.validateDocument({ ...doc, pages: [{ ...page, objects: [rect, { ...rect }] }] }), /duplicate object id/);
assert.throws(() => Core.validateDocument({ ...doc, pages: [{ ...page, objects: [{ ...rect, style: { ...rect.style, fill: 'red' } }] }] }), /fill/);
assert.throws(() => Core.validateDocument({ ...doc, pages: [{ ...page, objects: [{ ...rect, d: '<script>' }] }] }), /path/);
for (const d of ['M', 'M0', 'M0 0 L1', 'M0 0 C1 2 3', 'M0 0 L1e999 0', 'M0 0 A1 1 0 7 1 2 3']) {
  assert.throws(() => Core.validateDocument({ ...doc, pages: [{ ...page, objects: [{ ...rect, d }] }] }), /path/);
}
assert.throws(() => Core.validateDocument({ ...doc, pages: [{ ...page, objects: [{ ...text, runs: [{ text: 'x', script: 'bad' }] }] }] }), /script/);

assert.deepEqual(Core.multiply([1, 0, 0, 1, 4, 3], [2, 0, 0, 2, 1, 1]), [2, 0, 0, 2, 5, 4]);
Core.groupObjects(page, [rect.id, text.id]);
assert.equal(page.objects[0].group, page.objects[1].group);
assert.deepEqual(Core.expandSelection(page, [rect.id]).sort(), [rect.id, text.id].sort());
Core.transformObjects(page, [rect.id], [1, 0, 0, 1, 10, 20]);
assert.equal(rect.matrix[4], 10);
const duplicate = Core.duplicateObjects(page, [rect.id], 3, 4);
assert.equal(duplicate.length, 2);
assert.notEqual(page.objects[2].group, rect.group);
Core.ungroupObjects(page, [rect.id]);
assert.equal(rect.group, null);
Core.reorderObjects(page, [text.id], 'back');
assert.equal(page.objects[0].id, text.id);
Core.reorderObjects(page, [text.id], 'forward');
assert.equal(page.objects[1].id, text.id);

const pageCopy = Core.duplicatePage(doc, page.id);
assert.equal(doc.pages.length, 2);
Core.movePage(doc, pageCopy, -1);
assert.equal(doc.pages[0].id, pageCopy);
Core.removePage(doc, pageCopy);
assert.throws(() => Core.removePage(doc, page.id), /at least one page/);

const history = new Core.History(doc);
history.change(d => d.name = '変更');
assert(history.canUndo);
history.undo(); assert.equal(history.document.name, '無題');
history.redo(); assert.equal(history.document.name, '変更');
const intact = Core.clone(history.document);
assert.throws(() => history.change(d => d.pages[0].objects[0].style.fill = 'bad'), /fill/);
assert.deepEqual(history.document, intact);
for (let i = 0; i < 105; i++) history.change(d => d.name = '履歴' + i);
assert.equal(history._undo.length, Core.HISTORY_LIMIT);

const memory = new Map();
const storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
const store = new Core.Store(storage);
store.save(doc, 'auto'); store.save(doc, 'saved');
memory.set('kaijo-ilapo:auto', '{broken');
assert.equal(store.list().length, 1);
assert.throws(() => store.save({ nope: true }, 'saved'), /document/);
console.log('IlapoCore tests passed');
