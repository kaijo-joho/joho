'use strict';

const assert = require('node:assert/strict');
const C = require('../core.js');

const document = C.createDocument();
const history = new C.History(document);
const group = Symbol('inspector field');

history.change(value => { value.name = 'あ'; }, { group });
history.change(value => { value.name = 'あい'; }, { group });
history.change(value => { value.name = 'あいう'; }, { group });
assert.equal(history.document.name, 'あいう');
assert.equal(history._undo.length, 1, 'a continuous group has one undo entry');
history.undo();
assert.equal(history.document.name, '無題', 'undo restores the state before the group');
history.redo();
assert.equal(history.document.name, 'あいう', 'redo restores the final grouped state');

history.change(value => { value.name = '別の操作'; });
assert.equal(history._undo.length, 2, 'an ungrouped change starts a new undo entry');
history.undo();
assert.equal(history.document.name, 'あいう');

history.change(() => {});
history.change(value => { value.name = '新しい連続操作'; }, { group });
assert.equal(history._undo.length, 2, 'an ordinary no-op still ends the previous group');
history.undo();
assert.equal(history.document.name, 'あいう');

const reverted = new C.History(C.createDocument());
const revertGroup = Symbol('revert');
reverted.change(value => { value.name = '途中'; }, { group: revertGroup });
reverted.change(value => { value.name = '無題'; }, { group: revertGroup });
assert.equal(reverted._undo.length, 0, 'returning to the grouped baseline removes its empty undo entry');
assert.equal(reverted.canUndo, false);

const resumed = new C.History(C.createDocument());
resumed.change(value => { value.name = '先の操作'; });
resumed.change(value => { value.name = '入力中'; }, { group });
resumed.change(value => { value.name = '先の操作'; }, { group });
resumed.change(value => { value.name = '続き'; }, { group });
resumed.undo();
assert.equal(resumed.document.name, '先の操作', 'returning then continuing must not absorb earlier history');
resumed.undo();
assert.equal(resumed.document.name, '無題');

const guarded = new C.History(C.createDocument());
const guardedGroup = Symbol('guarded');
guarded.change(value => { value.name = '有効'; }, { group: guardedGroup });
const beforeDocument = C.clone(guarded.document);
const beforeUndo = C.clone(guarded._undo);
const beforeRedo = C.clone(guarded._redo);
assert.throws(() => guarded.change(value => { value.pages[0].board.width = -1; }, { group: guardedGroup }));
assert.deepEqual(guarded.document, beforeDocument, 'invalid grouped changes retain the document');
assert.deepEqual(guarded._undo, beforeUndo, 'invalid grouped changes retain undo history');
assert.deepEqual(guarded._redo, beforeRedo, 'invalid grouped changes retain redo history');
guarded.change(value => { value.name = '有効な続き'; }, { group: guardedGroup });
assert.equal(guarded._undo.length, 1, 'a failed edit does not split its group');

console.log('history-groups.test.cjs: passed');
