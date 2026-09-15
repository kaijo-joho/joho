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
  const ARCHIVE_KEY = 'joho.logic-draft-archive.v1';
  const MAX_ARCHIVES = 5;

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

  function clone(value) {
    return normalize(value);
  }

  function validUpdatedAt(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
  }

  function readCurrent(raw) {
    if (raw === null) return null;
    if (typeof raw !== 'string' || raw.length > Storage.MAX_DOCUMENT_LENGTH) throw new Error();
    const value = JSON.parse(raw);
    if (value.version !== 1 || !validUpdatedAt(value.updatedAt)) throw new Error();
    const data = normalize(value);
    return { data, updatedAt: value.updatedAt };
  }

  function normalizeArchive(record) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string'
      || !record.id.length || record.id.length > 120 || !validUpdatedAt(record.updatedAt)) throw new Error();
    const data = normalize(record);
    return { id: record.id, updatedAt: record.updatedAt, ...data };
  }

  function readArchives(raw) {
    if (raw === null) return [];
    if (typeof raw !== 'string' || raw.length > Storage.MAX_DOCUMENT_LENGTH) throw new Error();
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
      || !Array.isArray(value.archives) || value.archives.length > MAX_ARCHIVES
      || Object.keys(value).some(key => key !== 'version' && key !== 'archives')) throw new Error();
    const archives = value.archives.map(normalizeArchive);
    if (new Set(archives.map(record => record.id)).size !== archives.length) throw new Error();
    return archives;
  }

  function archiveError() {
    return new Error('最近の下書きを読み取れませんでした。自動復元用の下書きはそのままです。');
  }

  function candidate(record, archived) {
    const data = clone(record);
    return { id: record.id, archived, updatedAt: record.updatedAt, ...data };
  }

  class Store {
    constructor(storage) {
      this.storage = storage;
      this.raw = undefined;
      this.content = null;
      this.blocked = false;
      this.serial = 0;
      this.archiveError = null;
      this.archiveRaw = undefined;
    }

    load() {
      try {
        this.raw = this.storage.getItem(KEY);
        const current = readCurrent(this.raw);
        if (current === null) return null;
        const { data, updatedAt } = current;
        this.content = JSON.stringify(data);
        return { ...clone(data), updatedAt };
      } catch (_) {
        // 読めなかった元データを、新しい初期回路で上書きしない。
        this.blocked = true;
        throw new Error('下書きを復元できませんでした。名前付き保存・ファイル保存をご利用ください。');
      }
    }

    list() {
      let current;
      if (this.raw !== undefined) {
        // 一度読み込んだStoreは、新しい主キーを黙って採用して別タブ保護を解除しない。
        this.assertUnchanged();
        try { current = readCurrent(this.raw); }
        catch (_) { throw new Error('下書きを復元できませんでした。名前付き保存・ファイル保存をご利用ください。'); }
      } else {
        try { current = readCurrent(this.storage.getItem(KEY)); }
        catch (_) { throw new Error('下書きを復元できませんでした。名前付き保存・ファイル保存をご利用ください。'); }
      }
      const result = [];
      this.archiveError = null;
      if (current) result.push(candidate({ id: 'draft-current', updatedAt: current.updatedAt, ...current.data }, false));
      try {
        // 保持順は古い順。画面には最近のものから渡す。
        const archiveRaw = this.storage.getItem(ARCHIVE_KEY);
        const archives = readArchives(archiveRaw);
        this.archiveRaw = archiveRaw;
        archives.slice().reverse().forEach(record => result.push(candidate(record, true)));
      } catch (_) {
        // 壊れたアーカイブを主下書きの利用不能へ波及させない。
        this.archiveError = archiveError().message;
        Object.defineProperty(result, 'archiveError', { value: this.archiveError, enumerable: false });
      }
      return result;
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

    preserve() {
      if (this.blocked || this.raw === undefined) {
        throw new Error('下書きを読み込んでから最近の下書きを残してください。');
      }
      if (this.content === null) return false;
      // 主キーが別タブで変わっていたら、どちらの内容も退避しない。
      this.assertUnchanged();
      let archiveRaw, archives;
      try {
        archiveRaw = this.storage.getItem(ARCHIVE_KEY);
        if (this.archiveRaw !== undefined && archiveRaw !== this.archiveRaw) throw archiveError();
        archives = readArchives(archiveRaw);
      } catch (_) {
        // 壊れたアーカイブを初期化して、以前の候補を失うことはしない。
        throw archiveError();
      }
      this.archiveRaw = archiveRaw;
      if (archives.some(record => JSON.stringify(normalize(record)) === this.content)) return false;
      const idBase = `draft-archive-${Date.now().toString(36)}-${++this.serial}`;
      let id = idBase;
      let suffix = 0;
      while (archives.some(record => record.id === id)) id = `${idBase}-${++suffix}`;
      const entry = { id, updatedAt: new Date().toISOString(), ...normalize(JSON.parse(this.content)) };
      const next = [...archives, entry].slice(-MAX_ARCHIVES);
      const nextRaw = JSON.stringify({ version: 1, archives: next });
      if (nextRaw.length > Storage.MAX_DOCUMENT_LENGTH) throw new Error('最近の下書きが大きすぎます。ファイルに保存してください。');
      // setItemの直前にも両方を比較する。片方だけを消去・更新する操作は行わない。
      try {
        if (this.storage.getItem(KEY) !== this.raw) {
          this.blocked = true;
          throw new Error('別のタブで下書きが更新されたため、このタブの自動保存を停止しました。必要な回路は名前付き保存・ファイル保存してください。');
        }
        if (this.storage.getItem(ARCHIVE_KEY) !== archiveRaw) throw archiveError();
        this.storage.setItem(ARCHIVE_KEY, nextRaw);
      } catch (error) {
        if (error.message === archiveError().message || /別のタブ/.test(error.message)) throw error;
        throw new Error('最近の下書きを保存できませんでした。ファイルに保存してください。');
      }
      this.archiveRaw = nextRaw;
      return true;
    }
  }

  return Object.freeze({ KEY, ARCHIVE_KEY, MAX_ARCHIVES, normalize, Store });
});
