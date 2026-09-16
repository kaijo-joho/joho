/* Text layout shared by SVG, canvas exports, and geometry. */
(function (root, factory) {
  'use strict'; var api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; root.IlapoTextLayout = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var IDENTITY = [1, 0, 0, 1, 0, 0], DEFAULT_STYLE = { fontSize: 16, fontFamily: 'sans-serif', bold: false, italic: false };
  function number(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
  function positive(v, d) { v = number(v, d); return v > 0 ? v : d; }
  function script(v) { return v === 'super' || v === 'sub' ? v : 'normal'; }
  function style(v) { return Object.assign({}, DEFAULT_STYLE, v || {}, { fontSize: positive(v && v.fontSize, 16) }); }
  function font(s) { return (s.italic ? 'italic ' : '') + (s.bold ? 'bold ' : '') + s.fontSize + 'px ' + s.fontFamily; }
  function scriptStyle(s, kind) { var result = Object.assign({}, s); result.fontSize *= kind === 'normal' ? 1 : .7; return result; }
  function cloneRuns(runs) { return runs.map(function (run) { return { text: String(run.text == null ? '' : run.text), script: script(run.script) }; }); }
  function input(value, options) {
    options = options || {}; var object = value && typeof value === 'object' && !Array.isArray(value) ? value : null, runs = Array.isArray(value) ? value : object && Array.isArray(object.runs) ? object.runs : [{ text: value == null ? '' : String(value), script: 'normal' }], layout = Object.assign({}, object && object.layout || {}, options.layout || {});
    return { x: number(options.x, number(object && object.x, 0)), y: number(options.y, number(object && object.y, 0)), runs: cloneRuns(options.runs || runs), style: style(options.style || object && object.style), width: options.width !== undefined ? options.width : layout.width, align: options.align || layout.align || 'left', measure: options.measure };
  }
  function fallbackGraphemes(text) {
    var out = [], join = false, regional = false;
    Array.from(String(text)).forEach(function (part) { var mark = /[\p{M}\ufe00-\ufe0f\p{Emoji_Modifier}]/u.test(part), flag = /\p{Regional_Indicator}/u.test(part); if (!out.length) { out.push(part); regional = flag; return; } if (part === '\u200d') { out[out.length - 1] += part; join = true; regional = false; return; } if (mark || join || (flag && regional)) out[out.length - 1] += part; else out.push(part); join = false; regional = flag && !regional; }); return out;
  }
  function graphemes(text) {
    text = String(text); if (typeof Intl !== 'undefined' && Intl.Segmenter) return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), function (part) { return { text: part.segment, index: part.index }; });
    var at = 0; return fallbackGraphemes(text).map(function (part) { var result = { text: part, index: at }; at += part.length; return result; });
  }
  /* Segment all stored runs together: a combining mark in the next run belongs to
     its preceding base, rather than becoming a separately styled/wrappable glyph. */
  function units(runs) {
    var text = '', spans = [], at = 0; runs.forEach(function (run) { var value = String(run.text); if (value) { spans.push({ start: at, end: at + value.length, script: script(run.script) }); text += value; at += value.length; } });
    var span = 0; return { text: text, list: graphemes(text).map(function (part) { while (span + 1 < spans.length && part.index >= spans[span].end) span++; return { text: part.text, start: part.index, end: part.index + part.text.length, script: spans[span] ? spans[span].script : 'normal' }; }) };
  }
  function segments(text, list) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) return Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text), function (part) { return { start: part.index, end: part.index + part.segment.length, text: part.segment, word: !!part.isWordLike }; });
    var result = [], active = null; list.forEach(function (unit) { var type = /^\s+$/u.test(unit.text) ? 'space' : /^[\p{L}\p{N}_]+$/u.test(unit.text) ? 'word' : 'other'; if (!active || active.type !== type) { active = { start: unit.start, end: unit.end, text: unit.text, word: type === 'word', type: type }; result.push(active); } else { active.end = unit.end; active.text += unit.text; } }); return result;
  }
  function tokens(runs) {
    var all = units(runs), at = 0, result = [];
    segments(all.text, all.list).forEach(function (segment) { var part = []; while (at < all.list.length && all.list[at].start < segment.end) { if (all.list[at].end > segment.start) part.push(all.list[at]); at++; } part.forEach(function (unit) { if (unit.text === '\n') result.push({ break: true }); }); part = part.filter(function (unit) { return unit.text !== '\n'; }); if (!part.length) return; if (/^\s+$/u.test(segment.text)) result.push({ units: part, space: true }); else if (segment.word) result.push({ units: part, word: true }); else part.forEach(function (unit) { result.push({ units: [unit] }); }); }); return result;
  }
  function fallbackMetric(text, s) { var width = graphemes(text).length * s.fontSize * .6; return { width: width, left: 0, right: width, ascent: s.fontSize * .8, descent: s.fontSize * .2 }; }
  function metric(text, s, kind, measure) {
    var adjusted = scriptStyle(s, kind), result;
    if (typeof document !== 'undefined') { var canvas = metric.canvas || (metric.canvas = document.createElement('canvas')), ctx = canvas.getContext && canvas.getContext('2d'); if (ctx) { ctx.font = font(adjusted); var m = ctx.measureText(String(text)), width = m.width, left = Number(m.actualBoundingBoxLeft), right = Number(m.actualBoundingBoxRight), ascent = Number(m.actualBoundingBoxAscent), descent = Number(m.actualBoundingBoxDescent), fontAscent = Number(m.fontBoundingBoxAscent), fontDescent = Number(m.fontBoundingBoxDescent); result = { width: width, left: Number.isFinite(left) ? left : 0, right: Number.isFinite(right) ? right : width, ascent: Number.isFinite(ascent) ? ascent : adjusted.fontSize * .8, descent: Number.isFinite(descent) ? descent : adjusted.fontSize * .2, fontAscent: Number.isFinite(fontAscent) ? fontAscent : adjusted.fontSize, fontDescent: Number.isFinite(fontDescent) ? fontDescent : adjusted.fontSize * .25 }; } }
    result = result || fallbackMetric(text, adjusted); if (!Number.isFinite(result.fontAscent)) result.fontAscent = adjusted.fontSize; if (!Number.isFinite(result.fontDescent)) result.fontDescent = adjusted.fontSize * .25; if (measure) { var supplied = Number(measure(String(text), adjusted, kind, font(adjusted))); if (Number.isFinite(supplied) && supplied >= 0) { result.width = supplied; result.right = result.left + supplied; } } return result;
  }
  function blank() { return { rough: 0, runs: [] }; }
  function append(line, part, s, measure) { part.forEach(function (unit) { var last = line.runs[line.runs.length - 1], width = metric(unit.text, s, unit.script, measure).width; if (last && last.script === unit.script) last.parts.push(unit.text); else line.runs.push({ script: unit.script, parts: [unit.text] }); line.rough += width; }); }
  function tokenWidth(part, s, measure) { return part.reduce(function (sum, unit) { return sum + metric(unit.text, s, unit.script, measure).width; }, 0); }
  function put(lines, line, token, width, s, measure) {
    if (token.break) { lines.push(line); return blank(); } var total = tokenWidth(token.units, s, measure);
    if (width === null || line.rough + total <= width || (!token.word && line.rough === 0)) { append(line, token.units, s, measure); return line; }
    if (token.space) { lines.push(line); return blank(); }
    if (token.word) { if (line.runs.length) lines.push(line); line = blank(); token.units.forEach(function (unit) { var unitWidth = metric(unit.text, s, unit.script, measure).width; if (line.rough && line.rough + unitWidth > width) { lines.push(line); line = blank(); } append(line, [unit], s, measure); }); return line; }
    lines.push(line); line = blank(); append(line, token.units, s, measure); return line;
  }
  function baselineShift(s, kind) { return kind === 'super' ? -s.fontSize * .4 : kind === 'sub' ? s.fontSize * .45 : 0; }
  /* Re-measure each finished same-script run so browser kerning determines line width. */
  function finished(line, s, measure) {
    var cursor = 0, ink = null, visual = null, runs = line.runs.map(function (run) { var text = run.parts.join(''), m = metric(text, s, run.script, measure), base = baselineShift(s, run.script), bounds = { left: cursor - m.left, right: cursor + m.right, top: base - m.ascent, bottom: base + m.descent }, safe = { left: cursor - m.left - .5, right: cursor + m.right + .5, top: base - Math.max(m.ascent, m.fontAscent) - .5, bottom: base + Math.max(m.descent, m.fontDescent) + .5 }; cursor += m.width; if (text) { ink = ink ? { left: Math.min(ink.left, bounds.left), right: Math.max(ink.right, bounds.right), top: Math.min(ink.top, bounds.top), bottom: Math.max(ink.bottom, bounds.bottom) } : bounds; visual = visual ? { left: Math.min(visual.left, safe.left), right: Math.max(visual.right, safe.right), top: Math.min(visual.top, safe.top), bottom: Math.max(visual.bottom, safe.bottom) } : safe; } return { text: text, script: run.script }; }); return { width: cursor, runs: runs, ink: ink, visual: visual };
  }
  function layout(value, options) {
    var data = input(value, options), width = data.width === null || data.width === undefined ? null : positive(data.width, null), align = /^(left|center|right)$/.test(data.align) ? data.align : 'left', raw = [], line = blank(); tokens(data.runs).forEach(function (token) { line = put(raw, line, token, width, data.style, data.measure); }); raw.push(line);
    var complete = raw.map(function (item) { return finished(item, data.style, data.measure); }), widest = complete.reduce(function (max, item) { return Math.max(max, item.width); }, 0), boxWidth = width === null ? widest : width, lineHeight = data.style.fontSize * 1.2, ink = null, visual = null;
    var lines = complete.map(function (item, index) { var offset = align === 'center' ? (boxWidth - item.width) / 2 : align === 'right' ? boxWidth - item.width : 0, x = data.x + offset, y = data.y + index * lineHeight; if (item.ink) { var next = { left: x + item.ink.left, right: x + item.ink.right, top: y + item.ink.top, bottom: y + item.ink.bottom }; ink = ink ? { left: Math.min(ink.left, next.left), right: Math.max(ink.right, next.right), top: Math.min(ink.top, next.top), bottom: Math.max(ink.bottom, next.bottom) } : next; } if (item.visual) { var safe = { left: x + item.visual.left, right: x + item.visual.right, top: y + item.visual.top, bottom: y + item.visual.bottom }; visual = visual ? { left: Math.min(visual.left, safe.left), right: Math.max(visual.right, safe.right), top: Math.min(visual.top, safe.top), bottom: Math.max(visual.bottom, safe.bottom) } : safe; } return { x: x, y: y, width: item.width, runs: cloneRuns(item.runs) }; });
    var height = Math.max(1, lines.length) * lineHeight, bounds = { x: data.x, y: data.y - data.style.fontSize, width: boxWidth, height: height }, inkBounds = ink ? { x: ink.left, y: ink.top, width: Math.max(0, ink.right - ink.left), height: Math.max(0, ink.bottom - ink.top) } : { x: data.x, y: data.y, width: 0, height: 0 };
    var visualBounds = visual ? { x: visual.left, y: visual.top, width: Math.max(0, visual.right - visual.left), height: Math.max(0, visual.bottom - visual.top) } : inkBounds;
    return { lines: lines, bounds: bounds, inkBounds: inkBounds, visualBounds: visualBounds, width: boxWidth, height: height, lineHeight: lineHeight, style: data.style, align: align };
  }
  function localBounds(path) { var geometry = root.IlapoGeometry; if (!geometry || !geometry.bounds) return null; try { return geometry.bounds(Object.assign({}, path, { matrix: IDENTITY })); } catch (_) { return null; } }
  function shapeText(path) {
    if (!path || path.type !== 'path' || !path.label) return null; var label = path.label, box = localBounds(path); if (!box) return null;
    var matrix = Array.isArray(path.matrix) && path.matrix.length === 6 ? path.matrix.map(Number) : IDENTITY.slice(); if (matrix.some(function (value) { return !Number.isFinite(value); })) matrix = IDENTITY.slice(); var sx = Math.hypot(matrix[0], matrix[1]), sy = Math.hypot(matrix[2], matrix[3]), normalized = [sx > 1e-9 ? matrix[0] / sx : 1, sx > 1e-9 ? matrix[1] / sx : 0, sy > 1e-9 ? matrix[2] / sy : 0, sy > 1e-9 ? matrix[3] / sy : 1, matrix[4], matrix[5]], requested = Math.max(0, number(label.padding, 0)), totalWidth = Math.max(0, box.width * sx), totalHeight = Math.max(0, box.height * sy), padX = Math.min(requested, totalWidth / 2), padY = Math.min(requested, totalHeight / 2), x = box.x * sx + padX;
    var object = { id: String(path.id || 'path') + '-label', type: 'text', name: path.name || '図形ラベル', group: path.group || null, locked: true, x: x, y: 0, runs: cloneRuns(Array.isArray(label.runs) ? label.runs : []), style: Object.assign({}, label.style || {}), matrix: normalized, layout: { width: Math.max(1e-6, totalWidth - padX * 2), align: /^(left|center|right)$/.test(label.align) ? label.align : 'left' } };
    var result = layout(object), target = box.y * sy + padY + (totalHeight - 2 * padY) / 2, center = result.inkBounds.y + result.inkBounds.height / 2; object.y = target - center; return object;
  }
  return { layout: layout, shapeText: shapeText };
}));
