/* 非エクスポート鍵と暗号文専用。旧RSA試作・通常エディタの保存先には触れない。 */
(function (root) {
  'use strict';
  const P = root.JohoAssignmentLite;
  const DB = 'joho.assignment-lite.v1';
  class Vault {
    constructor({ indexedDB = root.indexedDB, name = DB } = {}) { this.indexedDB = indexedDB; this.name = name; this.material = null; }
    async open() {
      if (this.db) return this.db;
      P.assert(this.indexedDB, 'このブラウザでは課題用の鍵を保存できません。');
      this.db = await new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.name, 1);
        request.onupgradeneeded = () => { request.result.createObjectStore('keys'); request.result.createObjectStore('drafts'); };
        request.onerror = () => reject(new Error('課題用の保存領域を開けません。ブラウザの設定を確認してください。'));
        request.onblocked = () => reject(new Error('別のタブの課題を閉じて再試行してください。'));
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.db = null; }; resolve(db); };
      });
      return this.db;
    }
    async transaction(store, change) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite'); let result, reason;
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(reason || new Error('課題を保存できません。元データは消さず、容量・別タブを確認してください。'));
        try { change(tx.objectStore(store), value => { result = value; }, error => { reason = error; tx.abort(); }); }
        catch (error) { reason = error; tx.abort(); }
      });
    }
    get(store, key) { return this.transaction(store, (s, done) => { s.get(key).onsuccess = event => done(event.target.result || null); }); }
    async identity() {
      let record = await this.get('keys', 'browser');
      if (!record) {
        const draftCount = await this.transaction('drafts', (store, done) => { store.count().onsuccess = event => done(event.target.result); });
        P.assert(draftCount === 0, '課題の暗号文はありますが、鍵が見つかりません。別鍵へ置き換えず教員に相談してください。');
        const generated = await P.createKeys();
        record = await this.transaction('keys', (store, done) => {
          store.get('browser').onsuccess = event => {
            if (event.target.result) { done(event.target.result); return; }
            const { keyMaterial, ...keys } = generated;
            store.add(keys, 'browser'); done(keys);
          };
        });
        if (record.browserKeyId === generated.browserKeyId) this.material = generated.keyMaterial;
        generated.keyMaterial = null;
        record = await this.get('keys', 'browser'); // 保存後のCryptoKeyを読み戻して検査する。
      }
      P.exact(record, ['browserKeyId', 'aes', 'hmac']);
      P.decode32(record.browserKeyId);
      P.assert(record.aes?.extractable === false && record.aes.algorithm?.name === 'AES-GCM' && record.aes.algorithm.length === 256 &&
        record.hmac?.extractable === false && record.hmac.algorithm?.name === 'HMAC' && record.hmac.algorithm.hash.name === 'SHA-256' && record.hmac.algorithm.length === 256 &&
        P.canonical([...record.hmac.usages].sort()) === '["sign"]' && P.canonical([...record.aes.usages].sort()) === '["decrypt","encrypt"]', '課題の鍵が不正です。自動で置き換えず、教員に相談してください。');
      return record;
    }
    forgetMaterial() { this.material = null; }
    load(sessionId) { P.id(sessionId); return this.get('drafts', sessionId); }
    async save(data, keys, expectedToken) {
      const envelope = await P.encrypt(data, keys), token = P.requestId();
      await this.transaction('drafts', (store, done, fail) => {
        store.get(data.session.sessionId).onsuccess = event => {
          if ((event.target.result?.token || null) !== expectedToken) {
            fail(new Error('別のタブで課題が更新されました。元データを保持して、このタブの作業を止めてください。')); return;
          }
          store.put({ token, envelope }, data.session.sessionId); done(true);
        };
      });
      return { token, envelope };
    }
  }
  root.JohoAssignmentLiteStore = Object.freeze({ DB, Vault });
})(globalThis);
