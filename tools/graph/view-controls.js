(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphViewControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMIT = 1e9;
  const DIRECTIONS = new Set(['both', 'x', 'y']);
  const fail = message => { throw new Error(message); };

  function validAxis(axis, key) {
    if (!axis || typeof axis !== 'object' || Array.isArray(axis)) fail(key + '軸の設定が不正です。');
    const { min, max } = axis;
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || Math.abs(min) > LIMIT || Math.abs(max) > LIMIT || min >= max) {
      fail(key + '軸の範囲が不正です。');
    }
    if (axis.scale !== undefined && axis.scale !== 'linear' && axis.scale !== 'log') fail(key + '軸の目盛が不正です。');
    if (axis.scale === 'log' && min <= 0) fail(key + '軸の対数範囲が不正です。');
    return axis.scale || 'linear';
  }

  function zoomRange(axis, key, factor) {
    const scale = validAxis(axis, key);
    let min, max;
    if (scale === 'log') {
      const lo = Math.log10(axis.min), hi = Math.log10(axis.max), center = (lo + hi) / 2, half = (hi - lo) * factor / 2;
      min = 10 ** (center - half);
      max = 10 ** (center + half);
    } else {
      const center = (axis.min + axis.max) / 2, half = (axis.max - axis.min) * factor / 2;
      min = center - half;
      max = center + half;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(min) > LIMIT || Math.abs(max) > LIMIT || min >= max || scale === 'log' && min <= 0) {
      fail(key + '軸の拡大縮小後の範囲が許容範囲を超えています。');
    }
    return { min, max };
  }

  function zoomAxes(doc, direction, factor) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('グラフ文書が不正です。');
    if (doc.mode === '3d') fail('拡大縮小ボタンは2Dグラフで使用してください。');
    if (doc.mode !== '2d') fail('グラフ文書の表示モードが不正です。');
    if (!DIRECTIONS.has(direction)) fail('拡大縮小の方向が不正です。');
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) fail('拡大縮小倍率は正の有限値で指定してください。');
    if (!doc.axes || typeof doc.axes !== 'object' || Array.isArray(doc.axes)) fail('グラフ文書の軸設定が不正です。');
    const x = doc.axes.x, y = doc.axes.y;
    validAxis(x, 'x'); validAxis(y, 'y');
    if (factor === 1) return { x: { min: x.min, max: x.max }, y: { min: y.min, max: y.max } };
    return {
      x: direction === 'y' ? { min: x.min, max: x.max } : zoomRange(x, 'x', factor),
      y: direction === 'x' ? { min: y.min, max: y.max } : zoomRange(y, 'y', factor)
    };
  }

  return { zoomAxes };
});
