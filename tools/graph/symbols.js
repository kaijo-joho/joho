(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphSymbols = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'exp', 'ln', 'log', 'floor', 'ceil', 'round', 'min', 'max']);
  const CONSTANTS = new Set(['pi', 'π', 'e']);
  const ID_START = /^\p{ID_Start}$/u, ID_CONTINUE = /^[\p{ID_Continue}_]$/u, IDENTIFIER = /^\p{ID_Start}[\p{ID_Continue}_]{0,31}$/u;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const symbols = axes => Object.fromEntries(['x', 'y', 'z'].map(key => [key, axes && axes[key] && typeof axes[key].symbol === 'string' ? axes[key].symbol : key]));

  function validateAxes(axes, parameters) {
    if (!axes || typeof axes !== 'object') throw new Error('軸の設定が不正です。');
    const seen = new Set(), names = new Set((parameters || []).map(item => typeof item === 'string' ? item : item && item.name));
    for (const key of ['x', 'y', 'z']) {
      const symbol = axes[key] && axes[key].symbol;
      if (typeof symbol !== 'string' || !IDENTIFIER.test(symbol)) throw new Error('軸記号はUnicodeの識別子を32文字以内で入力してください。');
      if (seen.has(symbol)) throw new Error('軸記号が重複しています。');
      if (names.has(symbol)) throw new Error('軸記号は係数名と重複できません。');
      if (FUNCTIONS.has(symbol) || CONSTANTS.has(symbol)) throw new Error('軸記号に関数名や定数名は使えません。');
      seen.add(symbol);
    }
    return true;
  }

  function scope(kind) {
    if (kind === 'function') return ['x', 'y'];
    if (kind === 'surface') return ['x', 'y', 'z'];
    if (kind === 'implicit') return ['x', 'y'];
    return [];
  }
  function rewrite(text, replacements) {
    if (typeof text !== 'string') return text;
    let output = '', index = 0;
    while (index < text.length) {
      const rest = text.slice(index);
      const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (number) { output += number[0]; index += number[0].length; continue; }
      const first = String.fromCodePoint(text.codePointAt(index));
      if (ID_START.test(first)) {
        let end = index + first.length;
        while (end < text.length) { const char = String.fromCodePoint(text.codePointAt(end)); if (!ID_CONTINUE.test(char)) break; end += char.length; }
        const word = text.slice(index, end); output += Object.hasOwn(replacements, word) ? replacements[word] : word; index = end; continue;
      }
      output += first; index += first.length;
    }
    return output;
  }
  function toCanonical(text, doc, kind) {
    const map = {}, local = scope(kind), axes = symbols(doc && doc.axes);
    for (const key of local) map[axes[key]] = key;
    if (kind === 'polar') { map.θ = 'theta'; map.π = 'pi'; }
    else map.π = 'pi';
    return rewrite(text, map);
  }
  function toDisplay(text, doc, kind) {
    const map = {}, local = scope(kind), axes = symbols(doc && doc.axes);
    for (const key of local) map[key] = axes[key];
    map.pi = 'π'; if (kind === 'polar') map.theta = 'θ';
    return rewrite(text, map);
  }

  const escape = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  function richText(text) {
    return escape(text).replace(/([\p{L}\p{N}_]+)_(?:\{([\p{L}\p{N}_]+)\}|([\p{L}\p{N}]))/gu, (_, base, braced, single) => base + '<sub>' + (braced || single) + '</sub>').replace(/([\p{L}\p{N}_]+)\^(?:\{([\p{L}\p{N}_]+)\}|([\p{L}\p{N}]))/gu, (_, base, braced, single) => base + '<sup>' + (braced || single) + '</sup>').replace(/\r?\n/g, '<br>');
  }

  function decimal(value) {
    if (!finite(value)) return '';
    if (value === 0) return '0';
    const rounded = Number(value.toPrecision(12));
    return String(rounded);
  }
  function rational(value, maxDenominator) {
    let best = null;
    for (let d = 1; d <= maxDenominator; d++) { const n = Math.round(value * d), error = Math.abs(value - n / d); if (!best || error < best.error) best = { n, d, error }; }
    return best && (best.n !== 0 || value === 0) && best.error <= 1e-8 * Math.max(1, Math.abs(value)) ? best : null;
  }
  function formatTick(value, format) {
    if (!finite(value)) return '';
    if (format === 'pi') {
      const r = rational(value / Math.PI, 200); if (r) { if (r.n === 0) return '0'; const sign = r.n < 0 ? '-' : '', n = Math.abs(r.n); if (r.d === 1) return sign + (n === 1 ? 'π' : n + 'π'); return sign + (n === 1 ? 'π' : n + 'π') + '/' + r.d; }
    }
    if (format === 'fraction') { const r = rational(value, 100); if (r) { if (r.d === 1) return String(r.n); return r.n + '/' + r.d; } }
    return decimal(value);
  }
  function niceStep(value) {
    const exponent = Math.floor(Math.log10(value)), fraction = value / Math.pow(10, exponent), base = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return base * Math.pow(10, exponent);
  }
  function ticksFor(axis) {
    if (!axis || axis.scale === 'log') return {};
    const ticks = axis.ticks || {}, step = ticks.step, format = ticks.format || 'auto';
    if (!finite(axis.min) || !finite(axis.max) || axis.min >= axis.max) return {};
    const span = axis.max - axis.min;
    if (!finite(span)) return {};
    let requested = step;
    if (!(finite(requested) && requested > 0)) {
      if (format === 'pi') requested = Math.PI * niceStep(span / Math.PI / 8);
      else if (format === 'fraction' || format === 'decimal') requested = niceStep(span / 8);
      else return {};
    }
    const ratio = span / requested;
    const actual = !finite(ratio) ? span / 199 : requested * Math.max(1, Math.ceil(ratio / 199));
    if (!finite(actual) || actual <= 0) return {};
    const firstIndex = Math.ceil(axis.min / actual - 1e-12), lastIndex = Math.floor(axis.max / actual + 1e-12), count = Math.max(0, Math.min(200, lastIndex - firstIndex + 1)), tickvals = [];
    for (let index = 0; index < count; index++) tickvals.push(Number((actual * (firstIndex + index)).toPrecision(14)));
    return { tickmode: 'array', tickvals, ticktext: tickvals.map(value => formatTick(value, format)) };
  }
  return { validateAxes, toCanonical, toDisplay, richText, formatTick, ticksFor };
}));
