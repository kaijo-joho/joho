/* Convert editable illustSlide text to ordinary compound SVG paths. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoTextOutline = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var FONTS = Object.freeze({
    sans: Object.freeze({ id: 'sans', label: 'ゴシック（Noto Sans JP）', regular: 'fonts/NotoSansJP-Regular.woff', bold: 'fonts/NotoSansJP-Bold.woff' }),
    serif: Object.freeze({ id: 'serif', label: '明朝（Noto Serif JP）', regular: 'fonts/NotoSerifJP-Regular.woff', bold: 'fonts/NotoSerifJP-Bold.woff' })
  });
  var MAX_GLYPHS = 2000, MAX_PATH_LENGTH = 90000, ITALIC_SLOPE = .2;
  var prepared = Object.create(null), loading = Object.create(null);

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value, fallback) { value = Number(value); return Number.isFinite(value) ? value : fallback; }
  function fail(message) { throw new Error('文字をアウトライン化できません: ' + message); }
  function fontInfo(fontId) { var info = FONTS[fontId]; if (!info) fail('変換用フォントを選択してください。'); return info; }
  function face(bundle, style) { return style && style.bold ? bundle.bold : bundle.regular; }
  function codePoints(text) { return Array.from(String(text)); }
  function faceHasText(font, text) {
    codePoints(text).forEach(function (character) {
      if (/^[\n\r\t ]$/.test(character)) return;
      var glyph = font.charToGlyph(character);
      if (!glyph || glyph.index === 0) fail('「' + character + '」は選択した変換用フォントにありません。別のフォントを選ぶか、文字を変更してください。');
    });
  }
  function load(url) {
    if (!root.fetch || !root.opentype || typeof root.opentype.parse !== 'function') return Promise.reject(new Error('opentype.js またはフォント読み込み機能を利用できません。'));
    return root.fetch(url).then(function (response) {
      if (!response.ok) throw new Error('フォントを読み込めませんでした（' + response.status + '）。');
      return response.arrayBuffer();
    }).then(function (buffer) { return root.opentype.parse(buffer); });
  }
  function prepare(fontId) {
    var info = fontInfo(fontId);
    if (prepared[fontId]) return Promise.resolve(prepared[fontId]);
    if (!loading[fontId]) {
      loading[fontId] = Promise.all([load(info.regular), load(info.bold)]).then(function (loaded) {
        var bundle = { id: info.id, label: info.label, regular: loaded[0], bold: loaded[1] };
        prepared[fontId] = bundle; delete loading[fontId]; return bundle;
      }, function (error) {
        delete loading[fontId]; throw error;
      });
    }
    return loading[fontId];
  }
  function textSource(object, options) {
    options = options || {};
    if (object && object.type === 'text') return { source: object, kind: 'text' };
    if (object && object.type === 'path' && object.label) {
      if (!root.IlapoTextLayout || typeof root.IlapoTextLayout.shapeText !== 'function') fail('図形内文字の配置機能を読み込めません。');
      var shaped = root.IlapoTextLayout.shapeText(object);
      if (!shaped) fail('図形内文字を配置できません。');
      return { source: shaped, kind: 'shape-label', ownerId: object.id };
    }
    if (object && object.type === 'connector') {
      if (!root.IlapoConnectors || typeof root.IlapoConnectors.renderedParts !== 'function') fail('接続矢印の描画機能を読み込めません。');
      var label = root.IlapoConnectors.renderedParts(object, options.page).filter(function (part) { return part.type === 'text'; });
      if (label.length !== 1) fail('この接続矢印にはアウトライン化できるラベルがありません。');
      return { source: label[0], kind: 'connector-label', ownerId: object.id };
    }
    fail('文字、図形内文字、または接続矢印ラベルを選択してください。');
  }
  function baselineShift(style, kind) { return kind === 'super' ? -style.fontSize * .4 : kind === 'sub' ? style.fontSize * .45 : 0; }
  function scriptSize(style, kind) { return style.fontSize * (kind === 'normal' ? 1 : .7); }
  function transformItalic(path, baseline) {
    if (!path || !Array.isArray(path.commands)) return '';
    function x(value, y) { return finite(value, 0) + (baseline - finite(y, 0)) * ITALIC_SLOPE; }
    function n(value) { value = finite(value, 0); return Math.abs(value) < 1e-9 ? '0' : String(Math.round(value * 1000) / 1000); }
    return path.commands.map(function (command) {
      if (command.type === 'Z') return 'Z';
      if (command.type === 'M' || command.type === 'L') return command.type + n(x(command.x, command.y)) + ' ' + n(command.y);
      if (command.type === 'C') return 'C' + n(x(command.x1, command.y1)) + ' ' + n(command.y1) + ' ' + n(x(command.x2, command.y2)) + ' ' + n(command.y2) + ' ' + n(x(command.x, command.y)) + ' ' + n(command.y);
      if (command.type === 'Q') return 'Q' + n(x(command.x1, command.y1)) + ' ' + n(command.y1) + ' ' + n(x(command.x, command.y)) + ' ' + n(command.y);
      fail('選択したフォントに未対応の輪郭命令があります。');
    }).join('');
  }
  function pathData(path, italic, baseline) {
    if (italic) return transformItalic(path, baseline);
    if (!path || typeof path.toPathData !== 'function') fail('選択したフォントの輪郭を読み取れません。');
    return path.toPathData(3);
  }
  function layoutFor(source, bundle) {
    if (!root.IlapoTextLayout || typeof root.IlapoTextLayout.layout !== 'function') fail('文字配置機能を読み込めません。');
    return root.IlapoTextLayout.layout(source, { measure: function (text, style) {
      var selected = face(bundle, style);
      faceHasText(selected, text);
      return selected.getAdvanceWidth(String(text), finite(style.fontSize, 16), { kerning: true });
    } });
  }
  function makeD(source, bundle) {
    if ((source.runs || []).reduce(function (count, run) { return count + codePoints(run.text).length; }, 0) > MAX_GLYPHS) fail('文字数が多すぎます（最大 ' + MAX_GLYPHS + ' 文字）。文章を分けてください。');
    var style = source.style || {}, layout = layoutFor(source, bundle), out = [], glyphCount = 0, length = 0;
    layout.lines.forEach(function (line) {
      var cursor = finite(line.x, 0);
      (line.runs || []).forEach(function (run) {
        var effective=Object.assign({},style);if(run.bold!==undefined)effective.bold=!!run.bold;if(run.italic!==undefined)effective.italic=!!run.italic;if(run.fill!==undefined)effective.fill=run.fill;
        var kind = run.script === 'super' || run.script === 'sub' ? run.script : 'normal', size = scriptSize(effective, kind), baseline = finite(line.y, 0) + baselineShift(effective, kind), selected = face(bundle, effective), text = String(run.text == null ? '' : run.text), pieces=[];
        faceHasText(selected, text);
        var glyphs = selected.stringToGlyphs(text);
        glyphCount += glyphs.length;
        if (glyphCount > MAX_GLYPHS) fail('文字数が多すぎます（最大 ' + MAX_GLYPHS + ' 字形）。文章を分けてください。');
        selected.forEachGlyph(text, cursor, baseline, size, { kerning: true }, function (glyph, x, y, fontSize) {
          if (!glyph || glyph.index === 0) fail('選択した変換用フォントにない文字があります。');
          var piece = pathData(glyph.getPath(x, y, fontSize), !!effective.italic, baseline);
          length += piece.length;
          if (length > MAX_PATH_LENGTH) fail('輪郭データが大きすぎます（最大 ' + MAX_PATH_LENGTH + ' 文字）。文章を分けてください。');
          if (piece) pieces.push(piece);
        });
        if(pieces.length){var key=[effective.fill,effective.bold,effective.italic].join('|'),last=out[out.length-1];if(last&&last.key===key)last.d+=pieces.join('');else out.push({d:pieces.join(''),style:effective,key:key});}
        cursor += selected.getAdvanceWidth(text, size, { kerning: true });
      });
    });
    if (!out.length) fail('可視の文字がありません。');
    return out;
  }
  function convert(object, options) {
    options = options || {};
    var fontId = options.fontId || 'sans', sourceInfo = textSource(object, options), bundle = prepared[fontId];
    fontInfo(fontId);
    if (!bundle) fail('変換用フォントを読み込んでから実行してください。');
    var source = sourceInfo.source, pieces = makeD(source, bundle), base = clone(source.style || {}), objects=pieces.map(function(piece,index){return {
      id: String(source.id || 'text') + '-outline' + (index?'-'+index:''), type: 'path', name: String(source.name || '文字') + '（文字アウトライン）', group: source.group == null ? null : source.group,
      locked: !!source.locked, matrix: Array.isArray(source.matrix) ? source.matrix.slice() : [1, 0, 0, 1, 0, 0], style: Object.assign({},base,piece.style), d: piece.d
    };});
    return { objects: objects, fontId: fontId, fontLabel: bundle.label, sourceKind: sourceInfo.kind, ownerId: sourceInfo.ownerId || null };
  }
  function fonts() { return Object.keys(FONTS).map(function (key) { return { id: FONTS[key].id, label: FONTS[key].label }; }); }
  return { fonts: fonts, prepare: prepare, convert: convert, limits: Object.freeze({ glyphs: MAX_GLYPHS, pathLength: MAX_PATH_LENGTH }) };
}));
