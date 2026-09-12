(function (root, createCore) {
  'use strict';

  const core = Object.freeze(createCore());
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.OutputCore = core;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const MAX_SAFE = Number.MAX_SAFE_INTEGER;

  function positiveFinite(value, name) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name}は0より大きい有限の数値で指定してください`);
    return value;
  }

  function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name}は正の整数で指定してください`);
    return value;
  }

  function stableInteger(value, name) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_SAFE) throw new RangeError(`${name}が範囲外です`);
    const rounded = Math.round(value);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 16;
    if (Math.abs(value - rounded) > tolerance) throw new RangeError(`${name}は整数になるように指定してください`);
    return rounded;
  }

  function stabilize(value, name) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_SAFE) throw new RangeError(`${name}が範囲外です`);
    const rounded = Math.round(value);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 16;
    return Math.abs(value - rounded) <= tolerance ? rounded : value;
  }

  function screenPixels(ppi, widthInches) {
    return stableInteger(positiveFinite(ppi, '画面解像度') * positiveFinite(widthInches, '画面の幅'), '画素数');
  }

  function dotGrid(dpi) {
    const perSide = positiveInteger(dpi, '印刷解像度');
    const total = perSide * perSide;
    if (!Number.isSafeInteger(total)) throw new RangeError('ドット数が大きすぎます');
    return { perSide, total };
  }

  function printPixels(widthMm, heightMm, dpi) {
    const dotsPerInch = positiveFinite(dpi, '印刷解像度');
    const width = stabilize(positiveFinite(widthMm, '印刷幅') / 25.4 * dotsPerInch, '横の画素数');
    const height = stabilize(positiveFinite(heightMm, '印刷高さ') / 25.4 * dotsPerInch, '縦の画素数');
    const total = stabilize(width * height, '全画素数');
    return { width, height, total };
  }

  function refreshFrames(fps, hz, duration = 0.1) {
    const frameRate = positiveInteger(fps, 'フレームレート');
    const refreshRate = positiveInteger(hz, 'リフレッシュレート');
    const seconds = positiveFinite(duration, '時間');
    const sourceCount = stableInteger(frameRate * seconds, '元動画のフレーム数');
    const updateCount = stableInteger(refreshRate * seconds, '画面更新回数');
    const frames = Array.from({ length: updateCount }, (_, index) => {
      const position = index * frameRate / refreshRate;
      const nearest = Math.round(position);
      const tolerance = Number.EPSILON * Math.max(1, Math.abs(position)) * 16;
      const frame = (Math.abs(position - nearest) <= tolerance ? nearest : Math.floor(position)) + 1;
      return { update: index + 1, time: index / refreshRate, frame };
    });
    return { sourceCount, updateCount, frames, uniqueCount: new Set(frames.map(entry => entry.frame)).size };
  }

  return { screenPixels, dotGrid, printPixels, refreshFrames };
});
