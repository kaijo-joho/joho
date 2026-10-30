/* DOM adapter for rich text in the OMR editor. No model, storage, or network side effects. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OMRRichText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEFAULT = { font_size: 9, color: '#000000', bold: false, italic: false, underline: false };
  var BLOCKS = new Set(['DIV', 'P']);
  var IGNORED = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'NOSCRIPT']);
  var PROPS = ['font_size', 'color', 'bold', 'italic', 'underline'];

  function cssSize(value, fallback) {
    var m = String(value || '').trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(pt|px|pc|in|cm|mm)?$/i);
    if (!m) return fallback;
    var n = Number(m[1]), unit = (m[2] || 'pt').toLowerCase();
    if (!Number.isFinite(n)) return fallback;
    if (unit === 'px') n *= 72 / 96;
    else if (unit === 'pc') n *= 12;
    else if (unit === 'in') n *= 72;
    else if (unit === 'cm') n *= 72 / 2.54;
    else if (unit === 'mm') n *= 72 / 25.4;
    return Math.max(6, Math.min(48, Math.round(n * 1000) / 1000));
  }

  function hexColor(value, fallback) {
    var s = String(value || '').trim().toLowerCase();
    var h = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (h) return h[1].length === 3 ? '#' + h[1].split('').map(function (c) { return c + c; }).join('') : '#' + h[1];
    var rgb = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:\d*\.?\d+))?\s*\)$/i);
    if (rgb) return '#' + rgb.slice(1, 4).map(function (v) { return Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, '0'); }).join('');
    return fallback;
  }

  function same(a, b) { return PROPS.every(function (k) { return a[k] === b[k]; }); }
  function appendUnit(units, text, style, start, end) {
    units.push({ text: text, style: Object.assign({}, style), start: start, end: end });
  }
  function point(node, offset) { return { node: node, offset: offset }; }
  function firstPoint(node) {
    if (node.nodeType === 3) return point(node, 0);
    if (node.nodeType === 1 && node.tagName === 'BR') return point(node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node));
    if (node.childNodes && node.childNodes.length) return firstPoint(node.childNodes[0]);
    return point(node, 0);
  }
  function lastPoint(node) {
    if (node.nodeType === 3) return point(node, node.nodeValue.length);
    if (node.nodeType === 1 && node.tagName === 'BR') return point(node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1);
    if (node.childNodes && node.childNodes.length) return lastPoint(node.childNodes[node.childNodes.length - 1]);
    return point(node, node.childNodes ? node.childNodes.length : 0);
  }
  function comparePoints(a, b, doc) {
    if (a.node === b.node) return a.offset === b.offset ? 0 : a.offset < b.offset ? -1 : 1;
    var ra = doc.createRange(), rb = doc.createRange();
    ra.setStart(a.node, a.offset); ra.collapse(true);
    rb.setStart(b.node, b.offset); rb.collapse(true);
    return ra.compareBoundaryPoints(ra.START_TO_START, rb);
  }

  function unitsFor(editor) {
    var units = [], doc = editor.ownerDocument;
    function emptyPlaceholder(block) {
      var children = Array.from(block.childNodes).filter(function (n) { return !(n.nodeType === 3 && !n.nodeValue.trim()); });
      return children.length === 1 && children[0].nodeType === 1 && children[0].tagName === 'BR';
    }
    function styleFor(node, inherited) {
      var s = Object.assign({}, inherited), st = node.style || {};
      if (node.tagName === 'B' || node.tagName === 'STRONG') s.bold = true;
      if (node.tagName === 'I' || node.tagName === 'EM') s.italic = true;
      if (node.tagName === 'U') s.underline = true;
      if (st.fontSize) s.font_size = cssSize(st.fontSize, s.font_size);
      if (st.color) s.color = hexColor(st.color, s.color);
      if (st.fontWeight) s.bold = st.fontWeight === 'bold' || Number(st.fontWeight) >= 600;
      if (st.fontStyle) s.italic = st.fontStyle === 'italic' || st.fontStyle === 'oblique';
      if (st.textDecoration) s.underline = /\bunderline\b/i.test(st.textDecoration);
      return s;
    }
    function visit(node, inherited, isRoot) {
      if (node.nodeType === 3) {
        for (var i = 0; i < node.nodeValue.length; i++) appendUnit(units, node.nodeValue[i], inherited, point(node, i), point(node, i + 1));
        return;
      }
      if (node.nodeType !== 1 || IGNORED.has(node.tagName)) return;
      var style = styleFor(node, inherited);
      if (node.tagName === 'BR') {
        appendUnit(units, '\n', style, point(node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node)), point(node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1));
        return;
      }
      var children = Array.from(node.childNodes).filter(function (n) { return !(n.nodeType === 1 && IGNORED.has(n.tagName)); });
      if (BLOCKS.has(node.tagName) && emptyPlaceholder(node)) children = [];
      var processed = [];
      children.forEach(function (child) {
        if (child.nodeType === 3 && !child.nodeValue && !child.nodeValue.length) return;
        var isBlock = child.nodeType === 1 && BLOCKS.has(child.tagName);
        var previous = processed[processed.length - 1];
        var previousBlock = previous && previous.nodeType === 1 && BLOCKS.has(previous.tagName);
        if ((isBlock || previousBlock) && previous) {
          appendUnit(units, '\n', style, lastPoint(previous), firstPoint(child));
        }
        visit(child, style, false);
        processed.push(child);
      });
    }
    // Root is treated as a sibling container too; DIV/P boundaries become one newline.
    visit(editor, Object.assign({}, DEFAULT), true);
    return units;
  }

  function runsFromUnits(units) {
    var runs = [];
    units.forEach(function (u) {
      var prev = runs[runs.length - 1];
      if (prev && same(prev, u.style)) prev.text += u.text;
      else runs.push(Object.assign({ text: u.text }, u.style));
    });
    return runs.length ? runs : [Object.assign({ text: '' }, DEFAULT)];
  }
  function read(editor) {
    if (!editor || !editor.ownerDocument) throw new TypeError('editor must be a DOM element');
    return runsFromUnits(unitsFor(editor));
  }

  function write(editor, runs) {
    if (!editor || !editor.ownerDocument || !Array.isArray(runs)) throw new TypeError('editor and runs are required');
    var doc = editor.ownerDocument, fragment = doc.createDocumentFragment();
    runs.forEach(function (run) {
      if (!run || typeof run.text !== 'string') return;
      var span = doc.createElement('span');
      span.style.fontSize = Number(run.font_size || DEFAULT.font_size) + 'pt';
      span.style.color = hexColor(run.color, DEFAULT.color);
      span.style.fontWeight = run.bold ? '700' : '400';
      span.style.fontStyle = run.italic ? 'italic' : 'normal';
      span.style.textDecoration = run.underline ? 'underline' : 'none';
      var parts = run.text.split('\n');
      parts.forEach(function (part, i) {
        if (part) span.appendChild(doc.createTextNode(part));
        if (i < parts.length - 1) span.appendChild(doc.createElement('br'));
      });
      if (!run.text) span.appendChild(doc.createTextNode(''));
      fragment.appendChild(span);
    });
    editor.replaceChildren(fragment);
    return editor;
  }

  function selectedAt(range, unit, doc) {
    if (!range) return false;
    var startCmp = comparePoints(unit.start, point(range.startContainer, range.startOffset), doc);
    var endCmp = comparePoints(unit.start, point(range.endContainer, range.endOffset), doc);
    return startCmp >= 0 && endCmp < 0;
  }
  function offsetAt(units, p, doc) {
    var count = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (comparePoints(u.end, p, doc) <= 0) { count++; continue; }
      if (comparePoints(u.start, p, doc) >= 0) return count;
      return count;
    }
    return count;
  }
  function pointAt(units, offset, editor) {
    if (!units.length) return point(editor, 0);
    if (offset <= 0) return units[0].start;
    if (offset >= units.length) return units[units.length - 1].end;
    return units[offset - 1].end;
  }
  function formatValue(property, value, fallback) {
    if (property === 'fontSize') return cssSize(value, fallback);
    if (property === 'color') return hexColor(value, fallback);
    if (property === 'fontWeight') return value === 'bold' || Number(value) >= 600;
    if (property === 'fontStyle') return value === 'italic' || value === 'oblique';
    if (property === 'textDecoration') return /\bunderline\b/i.test(String(value));
    throw new TypeError('unsupported formatting property');
  }
  function format(editor, range, property, value) {
    if (!editor || !editor.ownerDocument) throw new TypeError('editor must be a DOM element');
    var doc = editor.ownerDocument, units = unitsFor(editor), active = range && editor.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
    var whole = !active || active.collapsed;
    var caret = active && active.collapsed ? offsetAt(units, point(active.startContainer, active.startOffset), doc) : null;
    var start = whole ? 0 : offsetAt(units, point(active.startContainer, active.startOffset), doc);
    var end = whole ? units.length : offsetAt(units, point(active.endContainer, active.endOffset), doc);
    var key = ({ fontSize: 'font_size', color: 'color', fontWeight: 'bold', fontStyle: 'italic', textDecoration: 'underline' })[property];
    if (!key) throw new TypeError('unsupported formatting property');
    var out = units.map(function (u, i) {
      var style = Object.assign({}, u.style);
      if ((whole || (i >= start && i < end)) && selectedAt(active, u, doc)) style[key] = formatValue(property, value, style[key]);
      else if (whole) style[key] = formatValue(property, value, style[key]);
      return { text: u.text, style: style };
    });
    var runs = runsFromUnits(out.map(function (u) { return { text: u.text, style: u.style }; }));
    // A no-range or collapsed selection intentionally formats the whole document.
    if (whole) {
      var all = formatValue(property, value, DEFAULT[key]);
      runs = runs.map(function (r) { var copy = Object.assign({}, r); copy[key] = all; return copy; });
      out = out.map(function (u) { u.style[key] = all; return u; });
    }
    var savedStart = caret === null ? start : caret, savedEnd = caret === null ? end : caret;
    write(editor, runs);
    var newUnits = unitsFor(editor), a = pointAt(newUnits, savedStart, editor), b = pointAt(newUnits, savedEnd, editor), restored = doc.createRange();
    restored.setStart(a.node, a.offset); restored.setEnd(b.node, b.offset);
    return { runs: runs, range: restored };
  }

  return { read: read, write: write, format: format };
});
