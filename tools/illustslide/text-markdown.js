/* illustSlideのrun専用Markdown変換。HTMLを生成せず、安全な文字データだけを返す。 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoTextMarkdown = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_DEPTH = 64;
  function parse(input) {
    var source = String(input == null ? '' : input).replace(/\r\n?|\u000b|\f/g, '\n');
    var runs = [], diagnostics = [];
    function diagnostic(kind, syntax, message) {
      diagnostics.push({ kind: kind, syntax: syntax, message: message });
    }
    function same(a, b) {
      return a.script === b.script && a.bold === b.bold && a.italic === b.italic && a.fill === b.fill;
    }
    function add(text, state) {
      if (!text) return;
      var run = { text: text, script: state.script };
      if (state.bold !== undefined) run.bold = state.bold;
      if (state.italic !== undefined) run.italic = state.italic;
      if (state.fill !== undefined) run.fill = state.fill;
      var previous = runs[runs.length - 1];
      if (previous && same(previous, run)) previous.text += text;
      else runs.push(run);
    }
    function nextState(state, change) { return Object.assign({}, state, change); }
    function escapedAt(i) {
      if (source[i] !== '\\' || i + 1 >= source.length) return '';
      if (source.slice(i + 1, i + 3) === '**' || source.slice(i + 1, i + 3) === '{{' || source.slice(i + 1, i + 3) === '}}') return source.slice(i + 1, i + 3);
      return /[\\*^_`{}]/.test(source[i + 1]) ? source[i + 1] : '';
    }
    function unsupportedAt(i, state) {
      if (source.slice(i, i + 3) === '[[[') {
        var tableEnd = /^\[\[\[\s*table\b/i.test(source.slice(i)) ? source.search(/\[\[\[\/table\s*\]\]\]/i) : -1;
        var blockEnd = tableEnd >= i ? tableEnd + source.slice(tableEnd).match(/^\[\[\[\/table\s*\]\]\]/i)[0].length - 3 : source.indexOf(']]]', i + 3);
        var block = blockEnd < 0 ? source.slice(i) : source.slice(i, blockEnd + 3);
        add(block, state); diagnostic('unsupported', 'block-shortcode', 'ブロック記法は使えません。原文のまま挿入しました。');
        return i + block.length;
      }
      if (source.slice(i, i + 2) === '[[') {
        var shortEnd = source.indexOf(']]', i + 2);
        var short = shortEnd < 0 ? source.slice(i) : source.slice(i, shortEnd + 2);
        add(short, state); diagnostic('unsupported', 'shortcode', 'ショートコードは使えません。原文のまま挿入しました。');
        return i + short.length;
      }
      if (source[i] === '<') {
        var tagEnd = source.indexOf('>', i + 1);
        if (tagEnd >= 0) {
          add(source.slice(i, tagEnd + 1), state);
          diagnostic('unsupported', 'html', 'HTMLは実行せず、文字として挿入しました。');
          return tagEnd + 1;
        }
      }
      if (source[i] === '[') {
        var link = /^\[[^\]\n]+\]\([^\)\n]+\)/.exec(source.slice(i));
        if (link) { add(link[0], state); diagnostic('unsupported', 'link', 'リンク記法は使えません。原文のまま挿入しました。'); return i + link[0].length; }
      }
      return i;
    }
    function parsePart(at, state, stop, depth) {
      var i = at;
      while (i < source.length) {
        if (stop && source.slice(i, i + stop.length) === stop) return { at: i + stop.length, closed: true };
        var escaped = escapedAt(i);
        if (escaped) { add(escaped, state); i += escaped.length + 1; continue; }
        var unsupported = unsupportedAt(i, state);
        if (unsupported !== i) { i = unsupported; continue; }
        if (source[i] === '`') {
          var codeEnd = source.indexOf('`', i + 1);
          if (codeEnd < 0) { add('`', state); diagnostic('malformed', 'inline-code', '閉じるバッククォートがないため、原文のまま挿入しました。'); i++; continue; }
          add(source.slice(i + 1, codeEnd), state);
          diagnostic('unsupported', 'inline-code', 'インラインコードは等幅表示にせず、通常の文字として挿入しました。');
          i = codeEnd + 1; continue;
        }
        var marker = source.slice(i, i + 2) === '**' ? '**' : (source[i] === '*' || source[i] === '^' || source[i] === '_' ? source[i] : '');
        if (marker) {
          if (depth >= MAX_DEPTH) {
            add(marker, state); diagnostic('malformed', marker, '閉じる記号がないため、原文のまま挿入しました。'); i += marker.length; continue;
          }
          var changed = marker === '**' ? { bold: true } : marker === '*' ? { italic: true } : { script: marker === '^' ? 'super' : 'sub' };
          var runCount = runs.length, diagnosticCount = diagnostics.length;
          var child = parsePart(i + marker.length, nextState(state, changed), marker, depth + 1);
          if (child.closed) { i = child.at; continue; }
          runs.splice(runCount); diagnostics.splice(diagnosticCount);
          add(source.slice(i), state); diagnostic('malformed', marker, '閉じる記号がないため、原文のまま挿入しました。'); return { at: source.length, closed: false };
        }
        if (source.slice(i, i + 2) === '{{') {
          var header = /^\{\{color\s*=\s*(#[0-9a-fA-F]{6})\s*\|/.exec(source.slice(i));
          var close = source.indexOf('}}', i + 2);
          if (header && close >= 0 && depth < MAX_DEPTH) {
            var contentAt = i + header[0].length;
            var colorRunCount = runs.length, colorDiagnosticCount = diagnostics.length;
            var colored = parsePart(contentAt, nextState(state, { fill: header[1].toUpperCase() }), '}}', depth + 1);
            if (colored.closed) { i = colored.at; continue; }
            runs.splice(colorRunCount); diagnostics.splice(colorDiagnosticCount);
            add(source.slice(i), state); diagnostic('malformed', 'curly-span', '閉じる }} がないため、原文のまま挿入しました。'); return { at: source.length, closed: false };
          }
          var curly = close < 0 ? source.slice(i) : source.slice(i, close + 2);
          add(curly, state);
          diagnostic(close < 0 ? 'malformed' : 'unsupported', 'curly-span', close < 0 ? '閉じる }} がないため、原文のまま挿入しました。' : '色指定は #RRGGBB のみ使えます。原文のまま挿入しました。');
          i += curly.length; continue;
        }
        add(source[i], state); i++;
      }
      return { at: i, closed: false };
    }
    parsePart(0, { script: 'normal' }, '', 0);
    return { runs: runs.length ? runs : [{ text: '', script: 'normal' }], diagnostics: diagnostics };
  }
  return { parse: parse };
}));
