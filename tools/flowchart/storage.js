/* Browser and file persistence for the flowchart editor. */
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.DiagramCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DiagramStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  if (!Core) throw new Error('DiagramCore を読み込めません。');
  const AUTO_KEY = 'kaijo.diagram.recovery.v1';
  const MANUAL_KEY = 'kaijo.diagram.saved.v1';
  const LIMIT = 2 * 1024 * 1024;
  const SNAPSHOT_FORMAT = 'kaijo-diagram-snapshot';
  const bytes = value => new TextEncoder().encode(value).length;
  const clone = value => JSON.parse(JSON.stringify(value));
  const failure = value => { throw new Error(value); };
  const method = value => {
    if (!['auto', 'manual'].includes(value)) failure('保存方法が不正です。');
    return value;
  };
  const time = (value, fallback = null) => {
    if (value === undefined) return fallback;
    if (value === null) return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) failure('保存日時が不正です。');
    return new Date(value).toISOString();
  };
  const fileTime = value => {
    if (value === undefined || value === null || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const view = value => {
    if (value === undefined || value === null) return null;
    if (!value || typeof value !== 'object' || ![value.x, value.y, value.scale].every(Number.isFinite)
      || value.x < -100000 || value.x > 100000 || value.y < -100000 || value.y > 100000 || value.scale < .02 || value.scale > 4) failure('表示位置が不正です。');
    return { x: value.x, y: value.y, scale: value.scale };
  };
  const document = value => Core.parseDocument(value);
  const saved = (value, id, fallback = '') => {
    if (value === undefined) return fallback;
    if (value === '') return '';
    if (typeof value !== 'string' || bytes(value) > LIMIT) failure('保存済みの文書が不正です。');
    const clean = document(value);
    if (clean.id !== id) failure('保存済みの文書が一致しません。');
    return Core.serializeDocument(clean);
  };
  const snapshot = (value, expectedMethod, location, legacy) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) failure('保存データが不正です。');
    const clean = document(value.document);
    const output = {
      document: clean,
      method: expectedMethod,
      location,
      savedAt: time(value.savedAt),
      view: view(value.view),
      saved: saved(value.saved, clean.id, Core.serializeDocument(clean))
    };
    if (legacy) output.legacy = true;
    return output;
  };
  const parseCurrent = (raw, expectedMethod) => {
    if (typeof raw !== 'string' || bytes(raw) > LIMIT) failure('保存データが不正です。');
    let value;
    try { value = JSON.parse(raw); } catch { failure('保存データを読み取れません。'); }
    if (value.format !== SNAPSHOT_FORMAT || value.version !== 1 || value.method !== expectedMethod || value.location !== 'browser') failure('保存データの形式が不正です。');
    return snapshot(value, expectedMethod, 'browser', false);
  };
  const parseLegacyAuto = raw => {
    if (typeof raw !== 'string' || bytes(raw) > LIMIT) failure('復元データが不正です。');
    let value;
    try { value = JSON.parse(raw); } catch { failure('復元データを読み取れません。'); }
    if (!value || typeof value !== 'object' || value.format === SNAPSHOT_FORMAT) failure('復元データの形式が不正です。');
    const clean = document(value.document);
    let lastSaved = '';
    try { lastSaved = saved(value.saved, clean.id); } catch { /* Old recovery can still restore its current document. */ }
    return { auto: { document: clean, method: 'auto', location: 'browser', savedAt: null, view: (() => { try { return view(value.view); } catch { return null; } })(), saved: lastSaved, legacy: true }, legacySaved: value.saved };
  };
  const error = (errors, methodName, cause) => errors.push({ method: methodName, message: cause instanceof Error ? cause.message : String(cause) });

  function readBrowser(storage) {
    const errors = [], out = { auto: null, manual: null, errors };
    let autoRaw = null, manualRaw = null, manualPresent = false;
    try { autoRaw = storage.getItem(AUTO_KEY); } catch (cause) { error(errors, 'auto', cause); }
    try { manualRaw = storage.getItem(MANUAL_KEY); manualPresent = manualRaw !== null; } catch (cause) { error(errors, 'manual', cause); manualPresent = true; }
    let legacy = null;
    if (autoRaw !== null) try {
      let parsed; try { parsed = JSON.parse(autoRaw); } catch { parsed = null; }
      if (parsed && parsed.format === SNAPSHOT_FORMAT) out.auto = parseCurrent(autoRaw, 'auto');
      else { legacy = parseLegacyAuto(autoRaw); out.auto = legacy.auto; }
    } catch (cause) { error(errors, 'auto', cause); }
    if (manualRaw !== null) try { out.manual = parseCurrent(manualRaw, 'manual'); } catch (cause) { error(errors, 'manual', cause); }
    if (!manualPresent && legacy && typeof legacy.legacySaved === 'string') try {
      const clean = document(legacy.legacySaved);
      if (clean.id === legacy.auto.document.id) out.manual = { document: clean, method: 'manual', location: 'browser', savedAt: null, view: legacy.auto.view, saved: Core.serializeDocument(clean), legacy: true };
    } catch { /* A legacy saved value is optional and never replaces a present manual record. */ }
    return out;
  }

  function writeBrowser(storage, saveMethod, input, options = {}) {
    const chosen = method(saveMethod), clean = document(input), serialized = Core.serializeDocument(clean);
    const output = {
      document: clean, method: chosen, location: 'browser', savedAt: time(options.savedAt, new Date().toISOString()),
      view: view(options.view), saved: options.saved === undefined ? (chosen === 'manual' ? serialized : '') : saved(options.saved, clean.id)
    };
    const storedValue = { format: SNAPSHOT_FORMAT, version: 1, ...output };
    if (output.saved === serialized) delete storedValue.saved;
    const stored = JSON.stringify(storedValue);
    if (bytes(stored) > LIMIT) failure('保存データは2MB以内にしてください。');
    storage.setItem(chosen === 'auto' ? AUTO_KEY : MANUAL_KEY, stored);
    return clone(output);
  }

  function serializeFile(input, options = {}) {
    const clean = document(input), chosen = method(options.method === undefined ? 'manual' : options.method);
    const value = { ...clean, saveInfo: { method: chosen, savedAt: time(options.savedAt, new Date().toISOString()) } };
    const text = JSON.stringify(value, null, 2);
    if (bytes(text) > LIMIT) failure('ファイルは2MB以内にしてください。');
    return text;
  }

  function parseFile(text, options = {}) {
    if (typeof text !== 'string' || bytes(text) > LIMIT) failure('ファイルは2MB以内にしてください。');
    let value;
    try { value = JSON.parse(text); } catch { failure('JSONファイルを読み取れません。'); }
    const clean = document(value);
    let chosen = 'manual', savedAt = fileTime(options.lastModified), legacy = true;
    try {
      if (value.saveInfo !== undefined) {
        if (!value.saveInfo || typeof value.saveInfo !== 'object' || Array.isArray(value.saveInfo)) failure('保存情報が不正です。');
        chosen = method(value.saveInfo.method); savedAt = time(value.saveInfo.savedAt); legacy = false;
      }
    } catch { chosen = 'manual'; savedAt = fileTime(options.lastModified); legacy = true; }
    const output = { document: clean, method: chosen, location: 'local', savedAt, view: null, saved: chosen === 'manual' ? Core.serializeDocument(clean) : '' };
    if (legacy) output.legacy = true;
    return output;
  }
  return Object.freeze({ AUTO_KEY, MANUAL_KEY, readBrowser, writeBrowser, serializeFile, parseFile });
});
