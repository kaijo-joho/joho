(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const PX_PER_MM = 96 / 25.4;
  const PX_PER_PT = 96 / 72;
  const HISTORY_LIMIT = 100;
  const LIMITS = Object.freeze({ pages: 100, objectsPerPage: 5000, objects: 10000, pathLength: 100000, textLength: 100000, runs: 1000, coordinate: 10000000 });
  const presets = Object.freeze({
    18: Object.freeze({ width: 18, height: 18, unit: 'px', infinite: false }),
    36: Object.freeze({ width: 36, height: 36, unit: 'px', infinite: false }),
    72: Object.freeze({ width: 72, height: 72, unit: 'px', infinite: false }),
    a4: Object.freeze({ width: 210 * PX_PER_MM, height: 297 * PX_PER_MM, unit: 'mm', infinite: false }),
    b5: Object.freeze({ width: 182 * PX_PER_MM, height: 257 * PX_PER_MM, unit: 'mm', infinite: false }),
    businessCard: Object.freeze({ width: 55 * PX_PER_MM, height: 91 * PX_PER_MM, unit: 'mm', infinite: false }),
    '16:9': Object.freeze({ width: 1280, height: 720, unit: 'px', infinite: false }),
    free: Object.freeze({ width: 1280, height: 720, unit: 'px', infinite: true })
  });
  const DEFAULT_STYLE = Object.freeze({ fill: '#FFFFFF', stroke: '#000000', strokeWidth: 1, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 18 * PX_PER_PT, fontFamily: 'sans-serif', bold: false, italic: false });
  const PATH_COMMANDS = /^[Mm][0-9eE+\-.,\s]*[MmZzLlHhVvCcSsQqTtAa0-9eE+\-.,\s]*$/;
  let sequence = 0;

  function uid(prefix) {
    const safe = typeof prefix === 'string' && prefix ? prefix.replace(/[^A-Za-z0-9_-]/g, '') : 'id';
    sequence = (sequence + 1) % 0x1000000;
    let random = '';
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      const bytes = new Uint32Array(1); root.crypto.getRandomValues(bytes); random = bytes[0].toString(36);
    } else random = Math.floor(Math.random() * 0x100000000).toString(36);
    return safe + '_' + Date.now().toString(36) + '_' + sequence.toString(36) + '_' + random;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(message) { throw new TypeError('Ilapo document: ' + message); }
  function plainObject(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object'); }
  function keysOnly(value, allowed, label) { for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(label + '.' + key + ' is not allowed'); }
  function finite(value, label, positive) { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > LIMITS.coordinate || (positive && value <= 0)) fail(label + ' must be a finite ' + (positive ? 'positive ' : '') + 'number'); return value; }
  function string(value, label, allowEmpty) { if (typeof value !== 'string' || (!allowEmpty && !value)) fail(label + ' must be a ' + (allowEmpty ? '' : 'non-empty ') + 'string'); return value; }
  function id(value, label) { return string(value, label, false); }
  function bool(value, label) { if (typeof value !== 'boolean') fail(label + ' must be boolean'); return value; }
  function array(value, label) { if (!Array.isArray(value)) fail(label + ' must be an array'); return value; }
  function color(value, label) { if (value !== 'none' && (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value))) fail(label + ' must be #RRGGBB or none'); return value; }
  function matrix(value, label) { array(value, label); if (value.length !== 6) fail(label + ' must have six values'); return value.map((n, i) => finite(n, label + '[' + i + ']')); }

  function normalizeStyle(value, partial) {
    if (value === undefined && partial) return clone(DEFAULT_STYLE);
    plainObject(value, 'style');
    keysOnly(value, Object.keys(DEFAULT_STYLE), 'style');
    const out = partial ? Object.assign(clone(DEFAULT_STYLE), value) : value;
    for (const key of Object.keys(DEFAULT_STYLE)) if (!(key in out)) fail('style.' + key + ' is required');
    color(out.fill, 'style.fill'); color(out.stroke, 'style.stroke');
    finite(out.strokeWidth, 'style.strokeWidth'); if (out.strokeWidth < 0) fail('style.strokeWidth must not be negative');
    finite(out.opacity, 'style.opacity'); if (out.opacity < 0 || out.opacity > 1) fail('style.opacity must be between 0 and 1');
    string(out.dash, 'style.dash', true);
    if (out.dash && !/^\s*(?:\d+(?:\.\d+)?\s*)+$/.test(out.dash)) fail('style.dash must contain non-negative numbers separated by spaces');
    if (!['butt', 'round', 'square'].includes(out.linecap)) fail('style.linecap is invalid');
    if (!['miter', 'round', 'bevel'].includes(out.linejoin)) fail('style.linejoin is invalid');
    finite(out.fontSize, 'style.fontSize', true);
    if (!['sans-serif', 'serif', 'monospace'].includes(out.fontFamily)) fail('style.fontFamily is invalid');
    bool(out.bold, 'style.bold'); bool(out.italic, 'style.italic');
    return clone(out);
  }
  function validPath(d) {
    if (typeof d !== 'string' || !d.length || d.length > LIMITS.pathLength || !PATH_COMMANDS.test(d)) return false;
    const tokenPattern = /[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
    const tokens = []; let match, end = 0;
    while ((match = tokenPattern.exec(d))) { if (!/^[\s,]*$/.test(d.slice(end, match.index))) return false; tokens.push(match[0]); end = tokenPattern.lastIndex; }
    if (!/^[\s,]*$/.test(d.slice(end)) || !/^[Mm]$/.test(tokens[0] || '')) return false;
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
    let index = 0;
    while (index < tokens.length) {
      const command = tokens[index++].toUpperCase(); if (!(command in arity)) return false;
      const values = []; while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index])) values.push(Number(tokens[index++]));
      const count = arity[command];
      if (!count) { if (values.length) return false; continue; }
      if (!values.length || values.length % count || values.some(n => !Number.isFinite(n) || Math.abs(n) > LIMITS.coordinate)) return false;
      if (command === 'A') for (let i = 0; i < values.length; i += 7) if (values[i] < 0 || values[i+1] < 0 || ![0,1].includes(values[i+3]) || ![0,1].includes(values[i+4])) return false;
    }
    return true;
  }
  function validateObject(value) {
    plainObject(value, 'object');
    const base = ['id', 'type', 'name', 'group', 'locked', 'matrix', 'style'];
    if (value.type === 'path') keysOnly(value, base.concat('d'), 'object');
    else if (value.type === 'text') keysOnly(value, base.concat('x', 'y', 'runs'), 'object');
    else fail('object.type is invalid');
    const out = { id: id(value.id, 'object.id'), type: value.type, name: string(value.name, 'object.name', true), group: value.group === null ? null : id(value.group, 'object.group'), locked: bool(value.locked, 'object.locked'), matrix: matrix(value.matrix, 'object.matrix'), style: normalizeStyle(value.style, false) };
    if (out.type === 'path') { if (!validPath(value.d)) fail('object.d is not a supported SVG path'); out.d = value.d; }
    else {
      out.x = finite(value.x, 'object.x'); out.y = finite(value.y, 'object.y'); array(value.runs, 'object.runs');
      if (!value.runs.length || value.runs.length > LIMITS.runs) fail('object.runs has an invalid length');
      let total = 0;
      out.runs = value.runs.map((run, i) => { plainObject(run, 'object.runs[' + i + ']'); keysOnly(run, ['text', 'script'], 'object.runs[' + i + ']'); const text = string(run.text, 'object.runs[' + i + '].text', true); total += text.length; if (total > LIMITS.textLength) fail('object.runs is too long'); if (!['normal', 'super', 'sub'].includes(run.script)) fail('object.runs[' + i + '].script is invalid'); return { text, script: run.script }; });
    }
    return out;
  }
  function validateBoard(value) {
    plainObject(value, 'page.board'); keysOnly(value, ['width', 'height', 'unit', 'infinite'], 'page.board');
    const out = { width: finite(value.width, 'page.board.width', true), height: finite(value.height, 'page.board.height', true), unit: value.unit, infinite: bool(value.infinite, 'page.board.infinite') };
    if (!['px', 'mm', 'pt'].includes(out.unit)) fail('page.board.unit is invalid'); return out;
  }
  function validatePage(value) {
    plainObject(value, 'page'); keysOnly(value, ['id', 'name', 'board', 'objects'], 'page');
    const objects = array(value.objects, 'page.objects'); if (objects.length > LIMITS.objectsPerPage) fail('page.objects exceeds the limit');
    const ids = new Set();
    const out = { id: id(value.id, 'page.id'), name: string(value.name, 'page.name', true), board: validateBoard(value.board), objects: objects.map(validateObject) };
    out.objects.forEach(object => { if (ids.has(object.id)) fail('duplicate object id: ' + object.id); ids.add(object.id); });
    return out;
  }
  function validateDocument(input) {
    plainObject(input, 'document'); keysOnly(input, ['format', 'version', 'id', 'name', 'pages'], 'document');
    if (input.format !== 'kaijo-ilapo') fail('format is invalid'); if (input.version !== 1) fail('version is invalid');
    const pages = array(input.pages, 'document.pages'); if (!pages.length || pages.length > LIMITS.pages) fail('document.pages has an invalid length');
    const ids = new Set(); let count = 0;
    const out = { format: 'kaijo-ilapo', version: 1, id: id(input.id, 'document.id'), name: string(input.name, 'document.name', true), pages: pages.map(validatePage) };
    for (const page of out.pages) { if (ids.has(page.id)) fail('duplicate page id: ' + page.id); ids.add(page.id); count += page.objects.length; }
    if (count > LIMITS.objects) fail('document exceeds the object limit'); return out;
  }
  function boardPreset(key, landscape) {
    const aliases = { A4: 'a4', 'JIS B5': 'b5', B5: 'b5', '名刺': 'businessCard', card: 'businessCard', widescreen: '16:9' };
    const preset = presets[key] || presets[aliases[key] || String(key).toLowerCase()]; if (!preset) throw new RangeError('Unknown board preset: ' + key);
    const out = clone(preset); if (landscape) { const w = out.width; out.width = out.height; out.height = w; } return out;
  }
  function createPage(name, board) { return { id: uid('page'), name: name === undefined ? 'ページ' : string(name, 'page.name', true), board: board === undefined ? boardPreset('a4') : validateBoard(board), objects: [] }; }
  function createDocument() { return { format: 'kaijo-ilapo', version: 1, id: uid('document'), name: '無題', pages: [createPage('ページ 1')] }; }
  function shapePath(kind, x, y, w, h) {
    const x2 = x + w, y2 = y + h, cx = x + w / 2, cy = y + h / 2;
    if (kind === 'rect') return `M ${x} ${y} H ${x2} V ${y2} H ${x} Z`;
    if (kind === 'roundrect') { const r = Math.min(w, h) / 6; return `M ${x + r} ${y} H ${x2 - r} A ${r} ${r} 0 0 1 ${x2} ${y + r} V ${y2 - r} A ${r} ${r} 0 0 1 ${x2 - r} ${y2} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y2 - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`; }
    if (kind === 'ellipse') return `M ${x2} ${cy} A ${w / 2} ${h / 2} 0 1 0 ${x} ${cy} A ${w / 2} ${h / 2} 0 1 0 ${x2} ${cy} Z`;
    if (kind === 'triangle') return `M ${cx} ${y} L ${x2} ${y2} H ${x} Z`;
    if (kind === 'pentagon') { const points = Array.from({ length: 5 }, (_, i) => { const angle = -Math.PI / 2 + i * Math.PI * 2 / 5; return [cx + Math.cos(angle) * w / 2, cy + Math.sin(angle) * h / 2]; }); return 'M ' + points.map(p => p[0] + ' ' + p[1]).join(' L ') + ' Z'; }
    if (kind === 'line') return `M ${x} ${y} L ${x2} ${y2}`;
    throw new RangeError('Unknown shape: ' + kind);
  }
  function makeShape(kind, x, y, w, h, style) { finite(x, 'x'); finite(y, 'y'); finite(w, 'width'); finite(h, 'height'); if (w < 0 || h < 0 || (kind !== 'line' && (!w || !h))) throw new RangeError('Shape width and height must be positive'); return { id: uid('object'), type: 'path', name: kind, group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0], style: normalizeStyle(style, true), d: shapePath(kind, x, y, w, h) }; }
  function makeText(x, y, text, style) { finite(x, 'x'); finite(y, 'y'); return { id: uid('object'), type: 'text', name: 'テキスト', group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0], style: normalizeStyle(style, true), x, y, runs: [{ text: string(text, 'text', true), script: 'normal' }] }; }
  function multiply(a, b) { matrix(a, 'a'); matrix(b, 'b'); return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
  function idsSet(page, ids) { validatePage(page); array(ids, 'ids'); const known = new Set(page.objects.map(o => o.id)); const result = new Set(); ids.forEach(value => { id(value, 'ids[]'); if (!known.has(value)) throw new RangeError('Unknown object id: ' + value); result.add(value); }); return result; }
  function expandSelection(page, ids) { const selected = idsSet(page, ids); const groups = new Set(page.objects.filter(o => selected.has(o.id) && o.group !== null).map(o => o.group)); page.objects.forEach(o => { if (groups.has(o.group)) selected.add(o.id); }); return page.objects.filter(o => selected.has(o.id)).map(o => o.id); }
  function transformObjects(page, ids, transform) { const selected = new Set(expandSelection(page, ids)); const m = matrix(transform, 'matrix'); page.objects.forEach(o => { if (selected.has(o.id) && !o.locked) o.matrix = multiply(m, o.matrix); }); return Array.from(selected); }
  function duplicateObjects(page, ids, dx, dy) { const selected = new Set(expandSelection(page, ids)); const groups = new Map(); const copies = []; const offset = [1, 0, 0, 1, dx === undefined ? 10 : finite(dx, 'dx'), dy === undefined ? 10 : finite(dy, 'dy')]; page.objects.forEach(o => { if (!selected.has(o.id)) return; const copy = clone(o); copy.id = uid('object'); if (copy.group !== null) { if (!groups.has(copy.group)) groups.set(copy.group, uid('group')); copy.group = groups.get(copy.group); } copy.matrix = multiply(offset, copy.matrix); copies.push(copy); }); page.objects.push(...copies); return copies.map(o => o.id); }
  function groupObjects(page, ids) { const selected = expandSelection(page, ids); if (selected.length < 2) return selected; const group = uid('group'); const set = new Set(selected); page.objects.forEach(o => { if (set.has(o.id)) o.group = group; }); return selected; }
  function ungroupObjects(page, ids) { const selected = new Set(expandSelection(page, ids)); page.objects.forEach(o => { if (selected.has(o.id)) o.group = null; }); return Array.from(selected); }
  function removeObjects(page, ids) { const selected = new Set(expandSelection(page, ids)); page.objects.splice(0, page.objects.length, ...page.objects.filter(o => !selected.has(o.id))); return Array.from(selected); }
  function reorderObjects(page, ids, mode) {
    const selected = new Set(expandSelection(page, ids));
    if (!['front', 'back', 'forward', 'backward'].includes(mode)) throw new RangeError('Unknown reorder mode: ' + mode);
    const source = page.objects;
    if (mode === 'front') page.objects = source.filter(o => !selected.has(o.id)).concat(source.filter(o => selected.has(o.id)));
    else if (mode === 'back') page.objects = source.filter(o => selected.has(o.id)).concat(source.filter(o => !selected.has(o.id)));
    else if (mode === 'forward') { for (let i = source.length - 2; i >= 0; i--) if (selected.has(source[i].id) && !selected.has(source[i + 1].id)) [source[i], source[i + 1]] = [source[i + 1], source[i]]; }
    else { for (let i = 1; i < source.length; i++) if (selected.has(source[i].id) && !selected.has(source[i - 1].id)) [source[i], source[i - 1]] = [source[i - 1], source[i]]; }
    return page.objects.filter(o => selected.has(o.id)).map(o => o.id);
  }
  function docAndPage(doc, pageId) { validateDocument(doc); const page = doc.pages.find(p => p.id === pageId); if (!page) throw new RangeError('Unknown page id: ' + pageId); return page; }
  function duplicatePage(doc, pageId) { const page = docAndPage(doc, pageId); const copy = clone(page); copy.id = uid('page'); copy.name = page.name + ' のコピー'; const objectIds = new Map(); const groups = new Map(); copy.objects.forEach(o => { objectIds.set(o.id, uid('object')); if (o.group !== null && !groups.has(o.group)) groups.set(o.group, uid('group')); }); copy.objects.forEach(o => { o.id = objectIds.get(o.id); if (o.group !== null) o.group = groups.get(o.group); }); doc.pages.splice(doc.pages.indexOf(page) + 1, 0, copy); return copy.id; }
  function removePage(doc, pageId) { const page = docAndPage(doc, pageId); if (doc.pages.length <= 1) throw new RangeError('A document must contain at least one page'); doc.pages.splice(doc.pages.indexOf(page), 1); return pageId; }
  function movePage(doc, pageId, delta) { const page = docAndPage(doc, pageId); if (!Number.isInteger(delta)) throw new TypeError('delta must be an integer'); const from = doc.pages.indexOf(page); const to = Math.max(0, Math.min(doc.pages.length - 1, from + delta)); if (from !== to) { doc.pages.splice(from, 1); doc.pages.splice(to, 0, page); } return to; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  class History { constructor(doc) { this.document = validateDocument(doc || createDocument()); this._undo = []; this._redo = []; } get canUndo() { return this._undo.length > 0; } get canRedo() { return this._redo.length > 0; } change(fn) { if (typeof fn !== 'function') throw new TypeError('change requires a function'); const before = clone(this.document); const next = clone(this.document); try { fn(next); const checked = validateDocument(next); if (!same(before, checked)) { this._undo.push(before); if (this._undo.length > HISTORY_LIMIT) this._undo.shift(); this._redo = []; this.document = checked; } return this.document; } catch (error) { this.document = before; throw error; } } undo() { if (!this.canUndo) return this.document; this._redo.push(clone(this.document)); this.document = this._undo.pop(); return this.document; } redo() { if (!this.canRedo) return this.document; this._undo.push(clone(this.document)); this.document = this._redo.pop(); return this.document; } replace(doc) { this.document = validateDocument(doc); this._undo = []; this._redo = []; return this.document; } }
  class Store { constructor(storage) { this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null); if (!this.storage || typeof this.storage.getItem !== 'function' || typeof this.storage.setItem !== 'function') throw new TypeError('Store requires Storage'); } _key(kind) { if (!['auto', 'saved'].includes(kind)) throw new RangeError('Store kind must be auto or saved'); return 'kaijo-ilapo:' + kind; } save(doc, kind) { const entry = { kind, at: new Date().toISOString(), document: validateDocument(doc) }; this.storage.setItem(this._key(kind), JSON.stringify(entry)); return clone(entry); } list() { const found = []; ['auto', 'saved'].forEach(kind => { try { const raw = this.storage.getItem(this._key(kind)); if (!raw) return; const entry = JSON.parse(raw); if (!entry || entry.kind !== kind || typeof entry.at !== 'string') return; found.push({ kind, at: entry.at, document: validateDocument(entry.document) }); } catch (_) { /* A corrupt slot must not hide the other slot. */ } }); return found.sort((a, b) => b.at.localeCompare(a.at)); } }
  return { uid, clone, createDocument, createPage, boardPreset, presets, validateDocument, makeShape, makeText, multiply, transformObjects, expandSelection, duplicateObjects, groupObjects, ungroupObjects, removeObjects, reorderObjects, duplicatePage, removePage, movePage, History, Store, LIMITS, HISTORY_LIMIT };
}));
