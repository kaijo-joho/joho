(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./digital-color-core.js'));
  else root.ColorStudyCore = factory(root.DigitalColorCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (digitalColor) {
  'use strict';

  function percent(value) {
    if (!Number.isFinite(value)) throw new TypeError('割合には有限の数値を指定してください。');
    if (value < 0 || value > 100) throw new RangeError('割合は0〜100です。');
    return value / 100;
  }

  // CSS Color 4のHSL→sRGB。見本は8bitに四捨五入し、背景と表示値を一致させる。
  function hslToRgb(hue, saturation, lightness) {
    if (!Number.isFinite(hue)) throw new TypeError('色相には有限の数値を指定してください。');
    const h = ((hue % 360) + 360) % 360;
    const s = percent(saturation);
    const l = percent(lightness);
    const a = s * Math.min(l, 1 - l);
    function channel(n) {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    }
    return [channel(0), channel(8), channel(4)];
  }

  function toHex(channels) {
    if (!Array.isArray(channels) || channels.length !== 3) throw new TypeError('RGBは3成分です。');
    return digitalColor.rgb(...channels).hex;
  }

  function readableText(channels) {
    toHex(channels);
    const linear = channels.map(function (value) {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
  }

  return Object.freeze({ hslToRgb, toHex, readableText });
});
