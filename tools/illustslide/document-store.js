(function (root, factory) {
  var api = factory(root, typeof module === 'object' && module.exports ? require('./core.js') : root.IlapoCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoDocumentStore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core) {
  'use strict';
  if (!Core || typeof Core.validateDocument !== 'function' || typeof Core.clone !== 'function') throw new Error('IlapoDocumentStore requires IlapoCore');
  var PREFIX = 'kaijo-ilapo:document:', LEGACY_PREFIX = 'kaijo-ilapo:', KINDS = ['auto', 'saved'];
  var STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, DOCUMENT_KEY = /^kaijo-ilapo:document:([A-Za-z0-9][A-Za-z0-9._-]{0,127}):(auto|saved)$/;
  function clone(value) { return Core.clone(value); }
  function validKind(kind) { if (KINDS.indexOf(kind) < 0) throw new RangeError('DocumentStore kind must be auto or saved'); return kind; }
  function validStorageId(storageId) { if (typeof storageId !== 'string' || !STORAGE_ID.test(storageId)) throw new TypeError('DocumentStore storageId must be a non-empty safe ID'); return storageId; }
  function validAt(at) { return typeof at === 'string' && at && Number.isFinite(Date.parse(at)); }
  function checkedEntry(value, kind, storageId, legacy) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== kind || !validAt(value.at)) return null;
    if (!legacy && value.storageId !== storageId) return null;
    try { var entry = { storageId: legacy ? null : storageId, kind: kind, at: value.at, document: Core.validateDocument(value.document) }; if (legacy) entry.legacy = true; return entry; } catch (_) { return null; }
  }
  function parseEntry(raw, kind, storageId, legacy) { if (!raw) return null; try { return checkedEntry(JSON.parse(raw), kind, storageId, legacy); } catch (_) { return null; } }
  function DocumentStore(storage) {
    this.storage = storage || (typeof root.localStorage !== 'undefined' ? root.localStorage : null);
    if (!this.storage || typeof this.storage.getItem !== 'function' || typeof this.storage.setItem !== 'function' || typeof this.storage.key !== 'function') throw new TypeError('DocumentStore requires Storage');
  }
  DocumentStore.prototype._key = function (storageId, kind) { return PREFIX + validStorageId(storageId) + ':' + validKind(kind); };
  DocumentStore.prototype.save = function (documentValue, kind, storageId) {
    kind = validKind(kind); storageId = validStorageId(storageId);
    var entry = { storageId: storageId, kind: kind, at: new Date().toISOString(), document: Core.validateDocument(documentValue) };
    var serialized = JSON.stringify(entry);
    this.storage.setItem(this._key(storageId, kind), serialized);
    return clone(entry);
  };
  DocumentStore.prototype.list = function () {
    var found = [];
    for (var i = 0; i < this.storage.length; i += 1) {
      var key = this.storage.key(i), match = typeof key === 'string' && DOCUMENT_KEY.exec(key);
      if (!match) continue;
      var entry = parseEntry(this.storage.getItem(key), match[2], match[1], false);
      if (entry) found.push(entry);
    }
    KINDS.forEach(function (kind) { var entry = parseEntry(this.storage.getItem(LEGACY_PREFIX + kind), kind, null, true); if (entry) found.push(entry); }, this);
    return found.sort(function (a, b) { return b.at.localeCompare(a.at); }).map(clone);
  };
  return DocumentStore;
}));
