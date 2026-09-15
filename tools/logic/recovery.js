// 自動復元用の下書き。名前付き保存とは別に管理し、既存の検証・保存形式を共用する。
(function (root, factory) {
  const storage = typeof module === 'object' && module.exports
    ? require('../../js/logic-storage.js') : root.LogicStorage;
  const api = factory(storage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogicDraft = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Storage) {
  'use strict';
  const KEY = 'joho.logic-draft.v1';

  function normalize(value) {
    if (!value || typeof value !== 'object' || !value.file) throw new Error('下書きの形式が不正です。');
    const { id, name, savedSnapshot } = value.file;
    if (id !== null && (typeof id !== 'string' || !id.length || id.length > 120)) throw new Error('保存先の情報が不正です。');
    if (typeof name !== 'string' || name.length > 60) throw new Error('回路名が不正です。');
    return {
      snapshot: Storage.normalizeSnapshot(value.snapshot),
      file: { id, name, savedSnapshot: savedSnapshot == null ? null : Storage.normalizeSnapshot(savedSnapshot) }
    };
  }

  class Store {
    constructor(storage) {
      this.storage = storage;
      this.raw = undefined;
      this.content = null;
      this.blocked = false;
    }

    load() {
      try {
        this.raw = this.storage.getItem(KEY);
        if (this.raw === null) return null;
        if (typeof this.raw !== 'string' || this.raw.length > Storage.MAX_DOCUMENT_LENGTH) throw new Error();
        const value = JSON.parse(this.raw);
        if (value.version !== 1 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error();
        const data = normalize(value);
        this.content = JSON.stringify(data);
        return { ...data, updatedAt: value.updatedAt };
      } catch (_) {
        // 読めなかった元データを、新しい初期回路で上書きしない。
        this.blocked = true;
        throw new Error('下書きを復元できませんでした。名前付き保存・ファイル保存をご利用ください。');
      }
    }

    assertUnchanged() {
      if (this.storage.getItem(KEY) !== this.raw) {
        this.blocked = true;
        throw new Error('別のタブで下書きが更新されたため、このタブの自動保存を停止しました。必要な回路は名前付き保存・ファイル保存してください。');
      }
    }

    save(value) {
      if (this.blocked || this.raw === undefined) throw new Error('下書きの自動保存は停止中です。名前付き保存・ファイル保存をご利用ください。');
      const data = normalize(value);
      const content = JSON.stringify(data);
      // 別タブの変更を上書きしない。表示だけの操作でも保存を発生させない。
      this.assertUnchanged();
      if (content === this.content) return false;
      const raw = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), ...data });
      if (raw.length > Storage.MAX_DOCUMENT_LENGTH) throw new Error('下書きが大きすぎます。ファイルに保存してください。');
      this.storage.setItem(KEY, raw);
      this.raw = raw;
      this.content = content;
      return true;
    }
  }

  return Object.freeze({ KEY, normalize, Store });
});
