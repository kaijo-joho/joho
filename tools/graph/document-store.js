(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.GraphCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphDocumentStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  if (!Core || typeof Core.validateDocument !== 'function') throw new Error('GraphCoreを読み込めません。');

  const PREFIX = 'kaijo-graph:documents:';
  const LEGACY_PREFIX = 'kaijo-graph:';
  const KINDS = ['auto', 'saved'];
  const ID_PATTERN = /^[A-Za-z0-9_/-]{1,100}$/;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const message = cause => cause instanceof Error ? cause.message : String(cause);
  const fail = text => { throw new Error(text); };
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function sanitizeEditRanges(value) {
    if (!object(value) || typeof value.equalScale !== 'boolean' || !object(value.axes)) return null;
    const axes = {};
    for (const key of ['x', 'y', 'z']) {
      const axis = value.axes[key];
      if (!object(axis) || !Number.isFinite(axis.min) || !Number.isFinite(axis.max)
        || axis.min < -1e9 || axis.max > 1e9 || axis.min >= axis.max) return null;
      axes[key] = { min: axis.min, max: axis.max };
    }
    return { equalScale: value.equalScale, axes };
  }

  function checkId(id) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) fail('文書IDが不正です。');
    return id;
  }

  function checkKind(kind) {
    if (!KINDS.includes(kind)) fail('保存種類が不正です。');
    return kind;
  }

  function keyFor(id, kind) {
    return PREFIX + id + ':' + kind;
  }

  function legacyKeyFor(kind) {
    return LEGACY_PREFIX + kind;
  }

  function parseEntry(raw, expectedId, expectedKind, legacy) {
    if (typeof raw !== 'string') fail('保存データを読み取れません。');
    let value;
    try { value = JSON.parse(raw); } catch (_) { fail('保存データを読み取れません。'); }
    if (!object(value) || typeof value.at !== 'string' || !Object.prototype.hasOwnProperty.call(value, 'document')) {
      fail('保存データの形式が不正です。');
    }
    if (!legacy && (value.id !== expectedId || value.kind !== expectedKind)) fail('保存データの文書IDまたは保存種類が一致しません。');
    let document;
    try { document = Core.validateDocument(value.document); } catch (cause) { throw cause; }
    const entry = { id: legacy ? 'legacy' : expectedId, kind: expectedKind, at: value.at, document };
    if (hasOwn(value, 'editRanges')) {
      const editRanges = sanitizeEditRanges(value.editRanges);
      if (editRanges) entry.editRanges = editRanges;
    }
    return entry;
  }

  function sortEntries(entries) {
    return entries.sort((left, right) => {
      const a = Date.parse(left.at), b = Date.parse(right.at);
      const av = Number.isFinite(a) ? a : -Infinity, bv = Number.isFinite(b) ? b : -Infinity;
      return bv - av;
    });
  }

  class Store {
    constructor(storage) {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        fail('保存領域を利用できません。');
      }
      this.storage = storage;
    }

    _read(key) {
      return this.storage.getItem(key);
    }

    save(id, kind, doc, options = {}) {
      checkId(id); checkKind(kind);
      if (!object(options)) fail('保存オプションが不正です。');
      const document = Core.validateDocument(doc);
      const entry = { id, kind, at: new Date().toISOString(), document };
      if (hasOwn(options, 'editRanges')) {
        const editRanges = sanitizeEditRanges(options.editRanges);
        if (!editRanges) fail('保存範囲メタデータが不正です。');
        entry.editRanges = editRanges;
      }
      const raw = JSON.stringify(entry);
      const key = keyFor(id, kind);
      let previous = null;
      try { previous = this._read(key); } catch (cause) { throw cause; }
      try {
        this.storage.setItem(key, raw);
      } catch (cause) {
        // localStorage writes are atomic, but restore a previous value when a
        // test double or another storage implementation changed it before throwing.
        try {
          if (previous === null) {
            if (typeof this.storage.removeItem === 'function') this.storage.removeItem(key);
          } else {
            this.storage.setItem(key, previous);
          }
        } catch (_) { /* Preserve the original write error. */ }
        throw cause;
      }
      return entry;
    }

    load(id, kind) {
      checkId(id); checkKind(kind);
      const currentKey = keyFor(id, kind);
      let raw = this._read(currentKey);
      let legacy = false;
      if ((raw === null || raw === undefined) && id === 'legacy') {
        raw = this._read(legacyKeyFor(kind));
        legacy = raw !== null && raw !== undefined;
      }
      if (raw === null || raw === undefined) return null;
      return parseEntry(raw, id, kind, legacy);
    }

    list() {
      const entries = [], errors = [], seen = new Set();
      const addError = (key, cause) => errors.push(key + ': ' + message(cause));
      const addCurrent = (key, raw) => {
        const match = /^kaijo-graph:documents:([A-Za-z0-9_/-]{1,100}):(auto|saved)$/.exec(key);
        if (!match) { addError(key, new Error('保存キーが不正です。')); return; }
        try { entries.push(parseEntry(raw, match[1], match[2], false)); }
        catch (cause) { addError(key, cause); }
      };

      try {
        if (!Number.isInteger(this.storage.length) || this.storage.length < 0 || typeof this.storage.key !== 'function') {
          fail('保存領域の一覧を読み取れません。');
        }
        for (let index = 0; index < this.storage.length; index += 1) {
          let key;
          try { key = this.storage.key(index); }
          catch (cause) { addError('storage.key(' + index + ')', cause); continue; }
          if (typeof key !== 'string' || !key.startsWith(PREFIX) || seen.has(key)) continue;
          seen.add(key);
          let raw;
          try { raw = this._read(key); }
          catch (cause) { addError(key, cause); continue; }
          if (raw !== null && raw !== undefined) addCurrent(key, raw);
        }
      } catch (cause) {
        addError(PREFIX, cause);
      }

      for (const kind of KINDS) {
        const key = legacyKeyFor(kind);
        let raw;
        try { raw = this._read(key); }
        catch (cause) { addError(key, cause); continue; }
        if (raw === null || raw === undefined) continue;
        try { entries.push(parseEntry(raw, 'legacy', kind, true)); }
        catch (cause) { addError(key, cause); }
      }
      return { entries: sortEntries(entries), errors };
    }
  }

  return Object.freeze({ Store, PREFIX });
});
