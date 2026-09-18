const assert = require('node:assert/strict');
const Core = require('../core.js');
const Workspace = require('../document-workspace.js');

function makeDocument(id, name) {
  const value = Core.createDocument();
  value.id = id;
  value.name = name;
  return Core.validateDocument(value);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, ng) => { resolve = ok; reject = ng; });
  return { promise, resolve, reject };
}
function handle(name) {
  let revision = 1;
  const writes = [];
  return {
    name,
    writes,
    async getFile() { return { lastModified: revision, size: writes.length }; },
    async createWritable() {
      return {
        async write(bytes) { writes.push(bytes); },
        async close() { revision += 1; },
        async abort() {}
      };
    },
    async isSameEntry(other) { return other === this; }
  };
}
function storeRecorder() {
  const calls = [];
  return { calls, save(documentValue, kind, storageId) { calls.push({ document: Core.clone(documentValue), kind, storageId }); } };
}

(async () => {
  const stored = storeRecorder();
  const workspace = new Workspace({ store: stored, encode: async value => JSON.stringify(value), download: async () => {} });
  const first = workspace.add(makeDocument('same-id', '一つ目'));
  const second = workspace.add(makeDocument('same-id', '二つ目'));
  assert.notEqual(first.storageId, second.storageId, '同じdocument.idを再度開いても保存領域を分離する');
  first.history.change(value => { value.name = '一つ目の編集'; }); workspace.changed(first); workspace.autosave(first);
  second.history.change(value => { value.name = '二つ目の編集'; }); workspace.changed(second); workspace.autosave(second);
  assert.equal(workspace.saveBrowser(first), true);
  assert.deepEqual(stored.calls.map(call => [call.kind, call.storageId]), [
    ['auto', first.storageId], ['auto', second.storageId], ['saved', first.storageId]
  ], '作品ごとに独立した履歴・自動保存・明示保存を使う');
  assert.equal(first.history.document.name, '一つ目の編集');
  assert.equal(second.history.document.name, '二つ目の編集');

  const encoded = [];
  const gate = deferred();
  const localHandle = handle('one.zip');
  const delayed = new Workspace({
    encode: async value => { encoded.push(Core.clone(value)); await gate.promise; return JSON.stringify(value); },
    pickFile: async () => localHandle,
    download: async () => {}
  });
  const origin = delayed.add(makeDocument('origin', '起点'));
  const unrelated = delayed.add(makeDocument('other', '別作品'));
  origin.history.change(value => { value.name = '起点の保存時点'; });
  delayed.changed(origin);
  const saving = delayed.saveLocal(origin);
  await Promise.resolve();
  unrelated.history.change(value => { value.name = '別作品の後編集'; });
  delayed.changed(unrelated);
  gate.resolve();
  assert.equal(await saving, true);
  assert.equal(encoded.length, 1);
  assert.equal(encoded[0].id, 'origin', '遅延中のローカル保存は起点作品のスナップショットを使う');
  assert.equal(encoded[0].name, '起点の保存時点');
  assert.equal(unrelated.history.document.name, '別作品の後編集');

  const dirtyGate = deferred();
  const dirtyWorkspace = new Workspace({ encode: async value => { await dirtyGate.promise; return JSON.stringify(value); }, pickFile: async () => handle('dirty.zip'), download: async () => {} });
  const dirtySession = dirtyWorkspace.add(makeDocument('dirty', '保存前'));
  const dirtySave = dirtyWorkspace.saveLocal(dirtySession);
  await Promise.resolve();
  dirtySession.history.change(value => { value.name = '保存途中の編集'; }); dirtyWorkspace.changed(dirtySession);
  assert.equal(dirtyWorkspace.close(dirtySession), false, '保存中のタブは閉じない');
  dirtyGate.resolve();
  assert.equal(await dirtySave, true);
  assert.equal(dirtyWorkspace.dirty(dirtySession), true, '保存開始後の編集はdirtyのまま残す');

  const oldDestination = handle('previous.zip');
  const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
  const cancelled = new Workspace({ encode: async value => JSON.stringify(value), pickFile: async () => { throw abort; }, download: async () => {} });
  const cancelSession = cancelled.add(makeDocument('cancel', '取消'), { lastSave: { kind: 'local', handle: oldDestination } });
  assert.equal(await cancelled.saveLocal(cancelSession), false);
  assert.equal(cancelSession.lastSave.handle, oldDestination, 'picker取消で既存の保存先を失わない');
  assert.equal(cancelled.close(cancelSession), true);

  const writeFailure = handle('broken.zip');
  writeFailure.createWritable = async () => ({ async write() { throw new Error('disk full'); }, async close() {}, async abort() {} });
  const failed = new Workspace({ encode: async value => JSON.stringify(value), pickFile: async () => writeFailure, download: async () => {} });
  const failedSession = failed.add(makeDocument('failed', '失敗'), { lastSave: { kind: 'local', handle: oldDestination } });
  assert.equal(await failed.saveLocal(failedSession), false);
  assert.equal(failedSession.lastSave.handle, oldDestination, '書込失敗で既存の保存先を失わない');

  const collisionHandle = handle('collision.zip');
  const collision = new Workspace({ encode: async value => JSON.stringify(value), pickFile: async () => collisionHandle, download: async () => {} });
  const autoSession = collision.add(makeDocument('auto', '自動'));
  const explicitSession = collision.add(makeDocument('explicit', '明示'));
  assert.equal(await collision.startAutosave(autoSession), true);
  assert.equal(await collision.saveLocal(explicitSession), false, '別sessionで自動保存と明示保存に同じhandleを使えない');
  const reverse = new Workspace({ encode: async value => JSON.stringify(value), pickFile: async () => collisionHandle, download: async () => {} });
  const firstExplicit = reverse.add(makeDocument('explicit-first', '明示先'));
  const secondAuto = reverse.add(makeDocument('auto-second', '自動先'));
  assert.equal(await reverse.saveLocal(firstExplicit), true);
  assert.equal(await reverse.startAutosave(secondAuto), false, '異なるsessionで明示保存と自動保存の順序を替えても衝突を防ぐ');
  const initialRead=deferred(), reading=deferred(), delayedAutoHandle=handle('slow-auto.zip');
  const getFile=delayedAutoHandle.getFile;let firstRead=true;
  delayedAutoHandle.getFile=async()=>{if(firstRead){firstRead=false;reading.resolve();await initialRead.promise;}return getFile();};
  const slowAuto=new Workspace({store:storeRecorder(),encode:async value=>JSON.stringify(value),pickFile:async()=>delayedAutoHandle});
  const slowSession=slowAuto.add(makeDocument('slow-auto','開始前'));
  const starting=slowAuto.startAutosave(slowSession);await reading.promise;
  slowSession.history.change(value=>value.name='開始待ちの編集');slowAuto.changed(slowSession);slowAuto.autosave(slowSession);
  initialRead.resolve();assert.equal(await starting,true);
  assert.equal(JSON.parse(delayedAutoHandle.writes.at(-1)).name,'開始待ちの編集','自動保存の開始待ちに確定した最新の編集もファイルへ反映する');
  slowAuto.close(slowSession);

  console.log('IlapoDocumentWorkspace tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
