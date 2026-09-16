(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.GraphCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphTemplateLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  const KEY = 'kaijo-graph:templates';
  const FORMAT = 'kaijo-graph-template';
  const LIBRARY_FORMAT = 'kaijo-graph-templates';
  const VERSION = 1;
  const MAX_ITEMS = 20;
  const MAX_LIBRARY_BYTES = 8 * 1024 * 1024;
  const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
  let serial = 0;

  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const byteLength = value => {
    const text = String(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  };
  const id = () => 'template_' + Date.now().toString(36) + '_' + (++serial).toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const text = (value, label, max, required) => {
    if (typeof value !== 'string') fail(label + 'が不正です。');
    const result = value.trim();
    if ((required && !result) || result.length > max) fail(label + 'は' + max + '文字以内で入力してください。');
    return result;
  };

  function cleanDocument(value) {
    if (!Core || typeof Core.validateDocument !== 'function') fail('グラフ文書の検証を読み込めません。');
    const source = typeof value === 'string' ? parseJSON(value, 'グラフ文書') : value;
    if (!isObject(source)) fail('グラフ文書が不正です。');
    const clean = Core.validateDocument(clone(source));
    if (byteLength(JSON.stringify(clean)) > MAX_DOCUMENT_BYTES) fail('テンプレートの文書は2MiB以内にしてください。');
    return clean;
  }

  function parseJSON(value, label) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { fail(label + 'のJSONが不正です。'); }
  }

  function validate(value) {
    const source = parseJSON(value, 'テンプレート');
    if (!isObject(source) || source.format !== FORMAT || source.version !== VERSION) fail('テンプレートの形式またはバージョンが不正です。');
    return {
      format: FORMAT,
      version: VERSION,
      name: text(source.name, 'テンプレート名', 160, true),
      description: source.description === undefined ? '' : text(source.description, 'テンプレートの説明', 1000, false),
      document: cleanDocument(source.document)
    };
  }

  function create(document, options) {
    const settings = options === undefined ? {} : options;
    if (!isObject(settings)) fail('テンプレートの設定が不正です。');
    const name = text(settings.name, 'テンプレート名', 160, true);
    const description = settings.description === undefined ? '' : text(settings.description, 'テンプレートの説明', 1000, false);
    if (settings.includeData !== undefined && typeof settings.includeData !== 'boolean') fail('データの設定が不正です。');
    const source = typeof document === 'string' ? parseJSON(document, 'グラフ文書') : document;
    if (!isObject(source)) fail('グラフ文書が不正です。');
    // Normalize/migrate first.  Clearing data on a legacy document would
    // otherwise add v10 fields to a v7/v8 payload before Core sees it.
    const draft = clone(cleanDocument(source));
    if (settings.includeData === false) {
      for (const series of draft.series || []) {
        if (!isObject(series) || !['data2d', 'data3d'].includes(series.kind)) continue;
        series.rows = [];
        series.excludedRows = [];
        if (isObject(series.dataTable)) series.dataTable.rows = [];
        if (series.kind === 'data2d' && isObject(series.errorBars)) series.errorBars = { x: [], y: [] };
      }

    }
    return { format: FORMAT, version: VERSION, name, description, document: cleanDocument(draft) };
  }

  function envelope(items) { return { format: LIBRARY_FORMAT, version: VERSION, items }; }
  function validateEnvelope(value) {
    const source = parseJSON(value, 'テンプレートライブラリ');
    if (!isObject(source) || source.format !== LIBRARY_FORMAT || source.version !== VERSION || !Array.isArray(source.items) || source.items.length > MAX_ITEMS) fail('保存済みテンプレートライブラリが不正です。');
    const seen = new Set();
    return source.items.map(item => {
      if (!isObject(item) || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) || seen.has(item.id)) fail('保存済みテンプレートライブラリが不正です。');
      seen.add(item.id);
      if (typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) fail('保存済みテンプレートライブラリが不正です。');
      const template = validate({ format: FORMAT, version: VERSION, name: item.name, description: item.description, document: item.document });
      return { id: item.id, name: template.name, description: template.description, document: template.document, updatedAt: item.updatedAt };
    });
  }

  class Library {
    constructor(storage) {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') fail('保存領域を利用できません。');
      this.storage = storage;
    }
    _read() {
      let raw;
      try { raw = this.storage.getItem(KEY); } catch (error) { throw error; }
      if (raw === null || raw === undefined || raw === '') return [];
      if (typeof raw !== 'string' || byteLength(raw) > MAX_LIBRARY_BYTES) fail('保存済みテンプレートライブラリは8MiB以内にしてください。');
      return validateEnvelope(raw);
    }
    _write(items, previousRaw) {
      const serialized = JSON.stringify(envelope(items));
      if (byteLength(serialized) > MAX_LIBRARY_BYTES) fail('テンプレートライブラリ全体は8MiB以内にしてください。');
      try { this.storage.setItem(KEY, serialized); }
      catch (error) {
        try {
          if (previousRaw === null || previousRaw === undefined) {
            if (typeof this.storage.removeItem === 'function') this.storage.removeItem(KEY);
          } else this.storage.setItem(KEY, previousRaw);
        } catch (_) { /* 保存領域が復元も拒否した場合は元データを変更しない実装を期待する。 */ }
        throw error;
      }
    }
    list() { return this._read().map(clone); }
    save(template, existingId) {
      const clean = validate(template);
      if (byteLength(JSON.stringify(clean.document)) > MAX_DOCUMENT_BYTES) fail('テンプレートの文書は2MiB以内にしてください。');
      const raw = this.storage.getItem(KEY);
      const items = raw === null || raw === undefined || raw === '' ? [] : this._read();
      let itemId = existingId === undefined ? id() : existingId;
      if (typeof itemId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(itemId)) fail('テンプレートIDが不正です。');
      const index = items.findIndex(item => item.id === itemId);
      if (index < 0 && items.length >= MAX_ITEMS) fail('テンプレートは20件まで保存できます。');
      const entry = { id: itemId, name: clean.name, description: clean.description, document: clean.document, updatedAt: new Date().toISOString() };
      const next = items.slice();
      if (index < 0) next.push(entry); else next[index] = entry;
      this._write(next, raw);
      return clone(entry);
    }
    remove(itemId) {
      if (typeof itemId !== 'string') fail('テンプレートIDが不正です。');
      const raw = this.storage.getItem(KEY);
      const items = raw === null || raw === undefined || raw === '' ? [] : this._read();
      const next = items.filter(item => item.id !== itemId);
      if (next.length === items.length) return false;
      this._write(next, raw);
      return true;
    }
    export(itemId) {
      const item = this._read().find(entry => entry.id === itemId);
      if (!item) fail('テンプレートが見つかりません。');
      return JSON.stringify({ format: FORMAT, version: VERSION, name: item.name, description: item.description, document: clone(item.document) });
    }
    import(value) {
      const template = validate(value);
      return this.save(template);
    }
  }

  return { create, validate, Library, KEY, FORMAT, VERSION };
});
