/* 軸ごとの表示書式。未指定の項目は呼び出し元の既定表示を保つ。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphAxisStyle = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const color = value => value === null || typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const width = value => Number.isFinite(value) && value >= .5 && value <= 10;
  const fail = () => { throw new Error('軸の書式が不正です。'); };
  const fields = ['color', 'width', 'grid', 'gridColor', 'gridWidth', 'gridDash', 'tickMarks', 'tickLabels'];

  function validate(value) {
    if (!object(value)) fail();
    const out = {};
    for (const key of fields) {
      if (!own(value, key)) continue;
      const item = value[key];
      if ((key === 'color' || key === 'gridColor') && !color(item)) fail();
      if ((key === 'width' || key === 'gridWidth') && !width(item)) fail();
      if ((key === 'grid' || key === 'tickMarks' || key === 'tickLabels') && typeof item !== 'boolean') fail();
      if (key === 'gridDash' && !['solid', 'dash', 'dot'].includes(item)) fail();
      out[key] = item;
    }
    return out;
  }

  function apply(layoutAxis, style, options) {
    const target = layoutAxis && typeof layoutAxis === 'object' ? layoutAxis : {};
    if (!style || !object(style)) return target;
    const safe = validate(style), foreground = options?.foreground || '#172033', gridColor = options?.gridColor || '#cbd5e1';
    if (own(safe, 'color')) {
      const value = safe.color || foreground;
      target.color = value;
      target.linecolor = value;
      target.tickcolor = value;
      target.tickfont = {...target.tickfont,color:value};
      if(target.title&&typeof target.title==='object')target.title={...target.title,font:{...target.title.font,color:value}};
    }
    if (own(safe, 'width')) target.linewidth = safe.width;
    if(options?.showLine&&(own(safe,'color')||own(safe,'width')))target.showline=true;
    if (own(safe, 'grid')) target.showgrid = safe.grid;
    if (own(safe, 'gridColor')) target.gridcolor = safe.gridColor || gridColor;
    if (own(safe, 'gridWidth')) target.gridwidth = safe.gridWidth;
    if (own(safe, 'gridDash')) target.griddash = safe.gridDash;
    if (own(safe, 'tickMarks')) target.ticks = safe.tickMarks ? 'outside' : '';
    if (own(safe, 'tickLabels')) target.showticklabels = safe.tickLabels;
    return target;
  }

  return Object.freeze({ validate, apply });
}));
