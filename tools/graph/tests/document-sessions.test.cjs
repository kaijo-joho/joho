const assert = require('assert');
const Core = require('../core.js');
const Sessions = require('../document-sessions.js');

function documentWithName(name) {
  const document = Core.createDocument();
  document.name = name;
  return document;
}

const tab = Sessions.create(documentWithName('範囲テスト'));
const initial = Sessions.checkpoint(tab);
Sessions.saved(tab, initial, 'browser');
assert.equal(Sessions.dirty(tab), false, '明示保存直後は未変更');

tab.history.changeView(document => {
  document.axes.x.min = -5;
  document.axes.x.max = 5;
  document.axes.y.min = -4;
  document.axes.y.max = 4;
});
assert.equal(Sessions.dirty(tab), false, '表示範囲だけの変更は未変更扱い');
assert.deepEqual(tab.history.editRanges.axes.x, { min: -10, max: 10 }, '表示変更は編集範囲の基準を動かさない');

tab.history.change(document => {
  document.axes.x.min = -3;
  document.axes.x.max = 3;
});
assert.equal(Sessions.dirty(tab), true, '座標ダイアログ相当の範囲変更は変更扱い');
assert.deepEqual(tab.history.editRanges.axes.x, { min: -3, max: 3 });

tab.history.undo();
assert.equal(Sessions.dirty(tab), false, '範囲変更をUndoすると明示保存基準へ戻る');
assert.deepEqual(tab.history.editRanges.axes.x, { min: -10, max: 10 });
assert.deepEqual([tab.history.document.axes.x.min, tab.history.document.axes.x.max], [-5, 5], 'Undo後も表示範囲は復元する');

tab.history.redo();
assert.equal(Sessions.dirty(tab), true, 'Redoすると範囲変更が再び未保存になる');
assert.deepEqual(tab.history.editRanges.axes.x, { min: -3, max: 3 });

const snapshot = Sessions.checkpoint(tab);
const snapshotDocument = Core.clone(snapshot.document);
tab.history.change(document => { document.name = '保存開始後の編集'; });
assert.deepEqual(snapshot.document, snapshotDocument, 'checkpointは開始時文書のスナップショットを保持する');
Sessions.saved(tab, snapshot, 'browser');
assert.equal(Sessions.dirty(tab), true, '開始後の編集がある保存完了では変更状態を維持する');
assert.equal(tab.history.document.name, '保存開始後の編集');

const viewOnlyAfterSave = Sessions.checkpoint(tab);
Sessions.saved(tab, viewOnlyAfterSave, 'browser');
tab.history.changeView(document => {
  document.axes.x.min = 0;
  document.axes.x.max = 1;
  document.equalScale = !document.equalScale;
});
assert.equal(Sessions.dirty(tab), false, '保存後の表示範囲・等縮尺変更は未変更扱い');
assert.deepEqual(tab.history.editRanges.axes.x, { min: -3, max: 3 });

const first = Sessions.create(documentWithName('一つ目'));
const second = Sessions.create(documentWithName('二つ目'));
first.history.change(document => { document.name = '一つ目の変更'; });
assert.equal(first.history.document.name, '一つ目の変更');
assert.equal(second.history.document.name, '二つ目');
assert.equal(first.history.canUndo, true, '一つ目だけUndo履歴を持つ');
assert.equal(second.history.canUndo, false, '二つ目へUndo履歴が混ざらない');
first.history.undo();
assert.equal(first.history.document.name, '一つ目');
second.history.change(document => { document.name = '二つ目の変更'; });
second.history.undo();
assert.equal(second.history.document.name, '二つ目');

const savedSource = Sessions.create(documentWithName('再開基準'));
const savedSnapshot = Sessions.checkpoint(savedSource);
savedSource.history.changeView(document => {
  document.axes.x.min = -6;
  document.axes.x.max = 6;
});
const autoViewSnapshot = Sessions.checkpoint(savedSource);
const resumedViewOnly = Sessions.create(autoViewSnapshot.document, {
  editRanges: autoViewSnapshot.editRanges,
  savedDocument: savedSnapshot.document,
  savedEditRanges: savedSnapshot.editRanges
});
assert.equal(Sessions.dirty(resumedViewOnly), false, '自動保存した表示範囲だけの変更を再開しても未変更');

const manualSource = Sessions.create(documentWithName('手動範囲'));
const manualSaved = Sessions.checkpoint(manualSource);
manualSource.history.change(document => {
  document.axes.x.min = -2;
  document.axes.x.max = 2;
});
const autoManualSnapshot = Sessions.checkpoint(manualSource);
const resumedManual = Sessions.create(autoManualSnapshot.document, {
  editRanges: autoManualSnapshot.editRanges,
  savedDocument: manualSaved.document,
  savedEditRanges: manualSaved.editRanges
});
assert.equal(Sessions.dirty(resumedManual), true, '自動保存した手動範囲変更を再開すると未変更ではない');

const suppliedRanges = { equalScale: false, axes: { x: { min: -1, max: 1 }, y: { min: -2, max: 2 }, z: { min: -3, max: 3 } } };
const copiedRangesTab = Sessions.create(documentWithName('コピー'), { editRanges: suppliedRanges });
suppliedRanges.axes.x.min = -99;
assert.equal(copiedRangesTab.history.editRanges.axes.x.min, -1, 'セッションの編集範囲は入力メタデータを参照共有しない');

console.log('document-sessions: 表示範囲と編集範囲の分離・Undo/Redo・checkpoint・文書別履歴を検証');
