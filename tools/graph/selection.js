/* Selection and portable style operations for the graph editor. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphSelection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STYLE_KEYS = Object.freeze(['color', 'width', 'dash', 'opacity', 'points', 'lines', 'pointSize', 'fontSize', 'labelVisible']);
  const has = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  function key(ref) {
    if (!object(ref) || typeof ref.type !== 'string') return null;
    const identity = ref.type === 'parameter' ? ref.name : ref.id;
    if (typeof identity !== 'string' || !identity) return null;
    return ref.type + ':' + identity;
  }

  function resolve(doc, ref) {
    if (!doc || !object(ref) || !['series', 'annotation', 'chart', 'parameter'].includes(ref.type)) return null;
    const identity = ref.type === 'parameter' ? ref.name : ref.id;
    if (typeof identity !== 'string' || !identity) return null;
    const collection = { series: doc.series, annotation: doc.annotations, chart: doc.charts, parameter: doc.parameters }[ref.type];
    if (!Array.isArray(collection)) return null;
    return collection.find(item => item && (ref.type === 'parameter' ? item.name === identity : item.id === identity)) || null;
  }

  function chartField(chart, canonical) {
    if (!chart) return undefined;
    const style = object(chart.style) ? chart.style : null;
    if (canonical === 'color') {
      if (has(chart, 'color')) return chart.color;
      if (style && has(style, 'color')) return style.color;
    }
    if (canonical === 'opacity') {
      if (has(chart, 'opacity')) return chart.opacity;
      if (style && has(style, 'opacity')) return style.opacity;
    }
    const aliases = { width: ['lineWidth', 'width'], dash: ['lineDash', 'dash'], pointSize: ['markerSize', 'pointSize'] };
    if (aliases[canonical] && style) for (const field of aliases[canonical]) if (has(style, field)) return style[field];
    if (canonical === 'fontSize' && has(chart, 'fontSize')) return chart.fontSize;
    return undefined;
  }

  function valueFor(type, item, canonical) {
    if (!item) return undefined;
    if (type === 'series') return object(item.style) && has(item.style, canonical) ? item.style[canonical] : undefined;
    if (type === 'annotation') {
      if (['color', 'width', 'dash', 'opacity'].includes(canonical)) return object(item.style) && has(item.style, canonical) ? item.style[canonical] : undefined;
      if (canonical === 'fontSize') return object(item.label) && has(item.label, 'size') ? item.label.size : undefined;
      if (canonical === 'labelVisible') return object(item.label) && has(item.label, 'visible') ? item.label.visible : undefined;
      return undefined;
    }
    if (type === 'chart') return chartField(item, canonical);
    return undefined;
  }

  function supported(ref, item) {
    if (!object(ref) || !item || !['series', 'annotation', 'chart', 'parameter'].includes(ref.type)) return [];
    let allowed = STYLE_KEYS;
    if (ref.type === 'series' && item.kind === 'surface') allowed = ['color', 'opacity'];
    if (ref.type === 'annotation') {
      const lineKinds = ['guide', 'tangent', 'intersection', 'segment', 'tangentIntersection', 'regression'];
      allowed = lineKinds.includes(item.kind) ? ['color', 'width', 'dash', 'opacity', 'fontSize', 'labelVisible'] : ['color', 'opacity', 'fontSize', 'labelVisible'];
    }
    if (ref.type === 'chart') {
      if (item.kind === 'residual') allowed = ['color', 'opacity', 'pointSize', 'fontSize'];
      else if (item.kind === 'scatter') allowed = item.model ? ['color', 'width', 'dash', 'opacity', 'pointSize', 'fontSize'] : ['color', 'width', 'opacity', 'pointSize', 'fontSize'];
      else allowed = ['color', 'width', 'opacity', 'fontSize'];
    }
    return STYLE_KEYS.filter(styleKey => allowed.includes(styleKey) && valueFor(ref.type, item, styleKey) !== undefined);
  }

  function normalizeRefs(doc, refs) {
    if (!Array.isArray(refs)) return [];
    const seen = new Set(), out = [];
    for (const ref of refs) {
      const k = key(ref), item = resolve(doc, ref);
      if (!k || !item || seen.has(k)) continue;
      seen.add(k); out.push({ ref, item });
    }
    return out;
  }

  function common(doc, refs) {
    const entries = normalizeRefs(doc, refs);
    if (!entries.length) return {};
    const keys = entries.reduce((set, entry, index) => {
      const current = new Set(supported(entry.ref, entry.item));
      if (!index) return current;
      return new Set([...set].filter(value => current.has(value)));
    }, new Set());
    const result = {};
    for (const styleKey of STYLE_KEYS) if (keys.has(styleKey)) {
      const first = valueFor(entries[0].ref.type, entries[0].item, styleKey);
      result[styleKey] = entries.every(entry => Object.is(valueFor(entry.ref.type, entry.item, styleKey), first)) ? clone(first) : null;
    }
    return result;
  }

  function capture(doc, ref) {
    const item = resolve(doc, ref);
    if (!item) return null;
    const snapshot = {};
    for (const styleKey of supported(ref, item)) snapshot[styleKey] = clone(valueFor(ref.type, item, styleKey));
    return snapshot;
  }

  function valid(styleKey, value) {
    if (styleKey === 'color') return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    if (styleKey === 'dash') return ['solid', 'dot', 'dash'].includes(value);
    if (styleKey === 'points' || styleKey === 'lines' || styleKey === 'labelVisible') return typeof value === 'boolean';
    if (['width', 'pointSize', 'fontSize'].includes(styleKey)) return typeof value === 'number' && Number.isFinite(value) && (styleKey === 'width' ? value >= .5 && value <= 20 : styleKey === 'pointSize' ? value >= 2 && value <= 30 : value >= 8 && value <= 48);
    if (styleKey === 'opacity') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
    return false;
  }

  function setValue(type, item, styleKey, value) {
    if (type === 'series' || type === 'annotation') {
      if (!object(item.style)) item.style = {};
      if (styleKey === 'fontSize') { if (!object(item.label)) item.label = {}; item.label.size = value; }
      else if (styleKey === 'labelVisible') { if (!object(item.label)) item.label = {}; item.label.visible = value; }
      else item.style[styleKey] = value;
    } else if (type === 'chart') {
      if (styleKey === 'color') { if (has(item, 'color')) item.color = value; else { if (!object(item.style)) item.style = {}; item.style.color = value; } }
      else if (styleKey === 'fontSize') item.fontSize = value;
      else { if (!object(item.style)) item.style = {}; const field = ({width: has(item.style, 'lineWidth') ? 'lineWidth' : 'width', dash: has(item.style, 'lineDash') ? 'lineDash' : 'dash', pointSize: has(item.style, 'markerSize') ? 'markerSize' : 'pointSize', opacity: has(item, 'opacity') ? null : has(item.style, 'opacity') ? 'opacity' : null})[styleKey]; if (styleKey === 'opacity' && has(item, 'opacity')) item.opacity = value; else if (field) item.style[field] = value; }
    }
  }

  function apply(doc, refs, patch) {
    if (!doc || !object(patch)) throw new Error('スタイル指定が不正です。');
    const entries = normalizeRefs(doc, refs), provided = STYLE_KEYS.filter(styleKey => has(patch, styleKey));
    if (!entries.length || !provided.length) throw new Error('スタイルを適用できる対象がありません。');
    // Bulk controls normally use common(), while paste may span different
    // object kinds. Apply each snapshot field wherever that field exists.
    const compatible = provided.filter(styleKey => entries.some(entry => supported(entry.ref, entry.item).includes(styleKey)));
    if (!compatible.length) throw new Error('共通するスタイルがありません。');
    for (const styleKey of compatible) if (!valid(styleKey, patch[styleKey])) throw new Error('スタイルの値が不正です。');
    // A rendered series must retain at least one visible primitive. Check the
    // prospective pair before mutating anything so a mixed apply is atomic.
    for (const entry of entries) if (entry.ref.type === 'series' && supported(entry.ref, entry.item).includes('points') && supported(entry.ref, entry.item).includes('lines')) {
      const points = has(patch, 'points') ? patch.points : entry.item.style.points;
      const lines = has(patch, 'lines') ? patch.lines : entry.item.style.lines;
      if (points === false && lines === false) throw new Error('点または線を少なくとも1つ表示してください。');
    }
    for (const entry of entries) for (const styleKey of compatible) if (supported(entry.ref, entry.item).includes(styleKey)) setValue(entry.ref.type, entry.item, styleKey, clone(patch[styleKey]));
    return { refs: entries.map(entry => entry.ref), keys: compatible };
  }

  function paste(doc, refs, snapshot) {
    if (!object(snapshot)) throw new Error('コピーしたスタイルが不正です。');
    return apply(doc, refs, snapshot);
  }

  return { STYLE_KEYS, key, resolve, supported, common, capture, apply, paste, normalizeRefs };
});
