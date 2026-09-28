const test = require('node:test');
const assert = require('node:assert/strict');
const FolderMemory = require('../folder-memory.js');
const HtmlFileSystem = require('../filesystem.js');

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

class FakeDatabase {
  constructor() { this.values = new Map(); this.objectStoreNames = { contains: () => true }; this.onversionchange = null; }
  close() {}
  createObjectStore() {}
  transaction(_name, mode) {
    if (this.failTransaction) throw this.failTransaction;
    const db = this;
    const tx = { error: null, abort() { this.aborted = true; this.onabort?.(); } };
    tx.objectStore = () => ({
      get(key) {
        const request = {};
        setTimeout(() => {
          if (tx.aborted) return;
          request.result = db.values.get(key);
          request.onsuccess?.();
          if (!db.hangTransaction) tx.oncomplete?.();
        }, 0);
        return request;
      },
      put(value, key) {
        const request = {};
        setTimeout(() => {
          if (tx.aborted) return;
          if (db.failWrite) {
            tx.error = db.failWrite;
            tx.onabort?.();
            return;
          }
          if (!db.hangTransaction) {
            db.values.set(key, value);
            request.result = key;
            request.onsuccess?.();
            tx.oncomplete?.();
          } else {
            tx.pendingWrite = [key, value];
          }
        }, 0);
        return request;
      },
      delete(key) {
        const request = {};
        setTimeout(() => {
          if (tx.aborted) return;
          if (!db.hangTransaction) {
            db.values.delete(key);
            request.onsuccess?.();
            tx.oncomplete?.();
          }
        }, 0);
        return request;
      }
    });
    const oldAbort = tx.abort.bind(tx);
    tx.abort = () => { tx.pendingWrite = null; oldAbort(); };
    return tx;
  }
}

class FakeIndexedDB {
  constructor(db = new FakeDatabase()) { this.db = db; this.behavior = 'ok'; }
  open() {
    const request = {};
    if (this.behavior === 'hang') return request;
    setTimeout(() => {
      if (this.behavior === 'blocked') { request.onblocked?.(); return; }
      if (this.behavior === 'error') { request.error = new Error('open error'); request.onerror?.(); return; }
      request.result = this.db;
      request.onsuccess?.();
    }, 0);
    return request;
  }
}

const handle = (name = 'HTML実習', state = {}) => ({
  kind: 'directory', name,
  async *entries() {
    if (state.scanError) throw state.scanError;
    for (const [path, text] of Object.entries(state.files || {'index.html':'<p>ok</p>'})) {
      const file = { size: Buffer.byteLength(text), async arrayBuffer() { return Buffer.from(text); } };
      yield [path, { kind:'file', async getFile() { return file; } }];
    }
  },
  async queryPermission(options) { state.queries = (state.queries || []).concat(options); return state.permission || 'granted'; },
  async requestPermission(options) { state.requests = (state.requests || []).concat(options); return state.requestResult || 'granted'; }
});

test('記憶領域はディレクトリハンドルだけを保存・読込・削除する', async () => {
  const idb = new FakeIndexedDB();
  const memory = FolderMemory.create(idb);
  assert.equal(await memory.load(), null);
  const directory = handle();
  await memory.save(directory);
  assert.equal(await memory.load(), directory);
  assert.deepEqual([...idb.db.values.keys()], ['directory']);
  await memory.forget();
  assert.equal(await memory.load(), null);
});

test('未対応、壊れた値、blocked/open/書込エラーは明示的にrejectする', async () => {
  assert.throws(() => FolderMemory.create(null), /記憶できません/);
  const idb = new FakeIndexedDB();
  const memory = FolderMemory.create(idb);
  await assert.rejects(memory.save({kind:'file'}), /壊れています/);
  idb.db.values.set('directory', {kind:'file'});
  await assert.rejects(memory.load(), /壊れています/);
  idb.db.values.set('directory', null);
  await assert.rejects(memory.load(), /壊れています/);
  idb.behavior = 'blocked';
  await assert.rejects(FolderMemory.create(idb).load(), /別の画面/);
  idb.behavior = 'error';
  await assert.rejects(FolderMemory.create(idb).load(), /open error/);
  idb.behavior = 'ok';
  idb.db.failWrite = new Error('quota exceeded');
  await assert.rejects(memory.save(handle()), /quota exceeded/);
  assert.equal(idb.db.values.has('directory'), true, '失敗した書込では既存値を保持');
});

test('openとtransactionのtimeout後に遅れて接続・書込しない', async () => {
  const blockedIdb = new FakeIndexedDB();
  blockedIdb.behavior = 'hang';
  await assert.rejects(FolderMemory.create(blockedIdb).load(), /時間切れ/);
  const idb = new FakeIndexedDB();
  idb.db.hangTransaction = true;
  const memory = FolderMemory.create(idb);
  await assert.rejects(memory.save(handle()), /時間切れ/);
  await tick();
  assert.equal(idb.db.values.has('directory'), false);
});

test('再接続はreadwrite許可を確認し、prompt時だけ明示操作で要求する', async () => {
  const fs = new HtmlFileSystem();
  const prompted = {permission:'prompt'};
  const pending = handle('候補', prompted);
  assert.equal(await fs.reconnectDirectory(pending), false);
  assert.deepEqual(prompted.queries, [{mode:'readwrite'}]);
  assert.equal(prompted.requests, undefined, '自動再接続から許可要求しない');
  assert.equal(fs.dirHandle, null);

  const requested = {permission:'prompt'};
  assert.equal(await fs.reconnectDirectory(handle('HTML実習', requested), {requestPermission:true}), true);
  assert.deepEqual(requested.requests, [{mode:'readwrite'}]);
  assert.deepEqual(fs.getFileList(), ['index.html']);
  assert.equal(fs.isConnected(), true);
});

test('grantedは自動再接続でき、deniedとscan失敗は既存状態を変えない', async () => {
  const fs = new HtmlFileSystem();
  const granted = {permission:'granted'};
  assert.equal(await fs.reconnectDirectory(handle('先のフォルダ', granted)), true);
  assert.equal(granted.requests, undefined);
  const previous = fs.dirHandle;

  const denied = {permission:'denied'};
  assert.equal(await fs.reconnectDirectory(handle('拒否フォルダ', denied)), false);
  assert.equal(denied.requests, undefined);
  assert.equal(fs.dirHandle, previous);
  const userDenied = {permission:'prompt', requestResult:'denied'};
  assert.equal(await fs.reconnectDirectory(handle('許可されなかったフォルダ', userDenied), {requestPermission:true}), false);
  assert.deepEqual(userDenied.requests, [{mode:'readwrite'}]);
  assert.equal(fs.dirHandle, previous);
  await assert.rejects(fs.reconnectDirectory({kind:'file', entries:async function*(){}}), /ハンドル/);

  const broken = {permission:'granted', scanError:new Error('scan failed')};
  await assert.rejects(fs.reconnectDirectory(handle('読込失敗', broken)), /scan failed/);
  assert.equal(fs.dirHandle, previous);
  assert.deepEqual(fs.getFileList(), ['index.html']);
});
