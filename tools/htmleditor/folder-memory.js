/* HTMLエディタの接続フォルダーハンドルだけを保存する。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlEditorFolderMemory = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DB_NAME = 'joho.htmleditor.folder-memory.v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'directory';
  const OPEN_TIMEOUT_MS = 2000;
  const TRANSACTION_TIMEOUT_MS = 2000;

  function validateHandle(handle) {
    if (!handle || handle.kind !== 'directory' || typeof handle.name !== 'string' || !handle.name || typeof handle.entries !== 'function') {
      throw new Error('保存されたフォルダーハンドルが壊れています。フォルダーを選び直してください。');
    }
  }

  function create(indexedDB) {
    if (!indexedDB || typeof indexedDB.open !== 'function') {
      throw new Error('このブラウザーではフォルダー接続を記憶できません。');
    }
    let db = null;
    let openPromise = null;
    let closed = false;

    function close() {
      closed = true;
      if (db) { db.close(); db = null; }
    }

    function open() {
      if (closed) return Promise.reject(new Error('フォルダー接続の記憶領域は閉じられています。'));
      if (db) return Promise.resolve(db);
      if (openPromise) return openPromise;
      openPromise = new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        let request;
        const finish = (error, value) => {
          if (settled) {
            if (value) value.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (error) { openPromise = null; reject(error); }
          else {
            db = value;
            db.onversionchange = () => close();
            resolve(db);
          }
        };
        try { request = indexedDB.open(DB_NAME, DB_VERSION); }
        catch (error) { finish(error); return; }
        timer = setTimeout(() => finish(new Error('フォルダー接続の記憶領域を開けませんでした（時間切れ）。')), OPEN_TIMEOUT_MS);
        request.onupgradeneeded = () => {
          try {
            const upgradeDb = request.result;
            if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) upgradeDb.createObjectStore(STORE_NAME);
          } catch (error) {
            try { request.transaction.abort(); } catch (_) {}
            finish(new Error(`フォルダー接続の記憶領域を準備できません: ${error.message || error}`));
          }
        };
        request.onblocked = () => finish(new Error('フォルダー接続の記憶領域が別の画面で使用中です。ページを再読み込みしてください。'));
        request.onerror = () => finish(request.error || new Error('フォルダー接続の記憶領域を開けませんでした。'));
        request.onsuccess = () => finish(null, request.result);
      });
      return openPromise;
    }

    async function transact(mode, action, readResult) {
      const connection = await open();
      return new Promise((resolve, reject) => {
        let settled = false;
        let result;
        let timer;
        let tx;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        };
        try {
          tx = connection.transaction(STORE_NAME, mode);
          const store = tx.objectStore(STORE_NAME);
          const request = action(store);
          if (readResult && request) request.onsuccess = () => { result = request.result; };
        } catch (error) { finish(error); return; }
        timer = setTimeout(() => {
          finish(new Error('フォルダー接続の記憶領域への処理が時間切れになりました。'));
          try { tx.abort(); } catch (_) {}
        }, TRANSACTION_TIMEOUT_MS);
        tx.oncomplete = () => finish(null, result);
        tx.onabort = () => finish(tx.error || new Error('フォルダー接続の記憶領域への処理が中断されました。'));
        tx.onerror = () => finish(tx.error || new Error('フォルダー接続の記憶領域への処理に失敗しました。'));
      });
    }

    return {
      async load() {
        const handle = await transact('readonly', store => store.get(HANDLE_KEY), true);
        if (handle === undefined) return null;
        validateHandle(handle);
        return handle;
      },
      async save(handle) {
        validateHandle(handle);
        await transact('readwrite', store => store.put(handle, HANDLE_KEY), false);
      },
      async forget() {
        await transact('readwrite', store => store.delete(HANDLE_KEY), false);
      }
    };
  }

  return { create };
}));
