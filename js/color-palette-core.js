(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ColorPaletteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RGB_MAX = 255;
  const GAMUT_TOLERANCE = 1e-7;
  const LIGHTNESS_STEPS = 10;

  function assertFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(label);
    return value;
  }

  function assertRgbChannel(value, label) {
    assertFiniteNumber(value, label);
    if (value < 0 || value > RGB_MAX) throw new RangeError(label);
    return value;
  }

  function assertLightness(value) {
    assertFiniteNumber(value, '明度 L');
    if (value < 0 || value > 1) throw new RangeError('明度 L');
    return value;
  }

  function assertChroma(value) {
    assertFiniteNumber(value, '彩度 C');
    if (value < 0) throw new RangeError('彩度 C');
    return value;
  }

  function normalizeHue(value) {
    assertFiniteNumber(value, '色相 H');
    return ((value % 360) + 360) % 360;
  }

  function srgbToLinear(value) {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function linearToSrgb(value) {
    return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  }

  function rgbToOklch(red, green, blue) {
    const r = srgbToLinear(assertRgbChannel(red, '赤のRGB値') / RGB_MAX);
    const g = srgbToLinear(assertRgbChannel(green, '緑のRGB値') / RGB_MAX);
    const b = srgbToLinear(assertRgbChannel(blue, '青のRGB値') / RGB_MAX);

    const lRoot = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const mRoot = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const sRoot = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot;
    const a = 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot;
    const bAxis = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot;
    const C = Math.hypot(a, bAxis);

    // Hue is powerless for near-neutral colors; avoid exposing matrix-rounding noise as a hue name.
    if (C < 1e-6) return { l: L < 1e-8 ? 0 : (L > 1 - 1e-8 ? 1 : L), c: 0, h: 0 };
    return { l: L, c: C, h: normalizeHue(Math.atan2(bAxis, a) * 180 / Math.PI) };
  }

  function oklchToLinearRgb(lightness, chroma, hue) {
    const L = assertLightness(lightness);
    const C = assertChroma(chroma);
    const H = normalizeHue(hue) * Math.PI / 180;
    const a = C * Math.cos(H);
    const b = C * Math.sin(H);
    const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
    const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
    const sRoot = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = lRoot ** 3;
    const m = mRoot ** 3;
    const s = sRoot ** 3;

    // OKLab作者の逆変換（public domain）：この行列は直接linear sRGBを返す。
    // https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
    return {
      r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    };
  }

  function isInSrgbGamut(linear) {
    return linear.r >= -GAMUT_TOLERANCE && linear.r <= 1 + GAMUT_TOLERANCE
      && linear.g >= -GAMUT_TOLERANCE && linear.g <= 1 + GAMUT_TOLERANCE
      && linear.b >= -GAMUT_TOLERANCE && linear.b <= 1 + GAMUT_TOLERANCE;
  }

  function encodeSrgbChannel(value) {
    const bounded = Math.max(0, Math.min(1, value));
    return Math.round(linearToSrgb(bounded) * RGB_MAX);
  }

  function mapToSrgb(lightness, chroma, hue) {
    const L = assertLightness(lightness);
    const requestedC = assertChroma(chroma);
    const H = normalizeHue(hue);
    const raw = oklchToLinearRgb(L, requestedC, H);
    const inGamut = isInSrgbGamut(raw);

    if (L === 0 || L === 1) {
      const endpoint = L === 0 ? 0 : 255;
      return {
        l: L, c: 0, h: H,
        r: endpoint, g: endpoint, b: endpoint,
        inGamut: requestedC === 0 && inGamut,
        mapped: requestedC !== 0 || !inGamut
      };
    }

    let effectiveC = requestedC;
    let effectiveLinear = raw;
    if (!inGamut) {
      // 固定L/HでCを下げる。CSSのMINDE等とは別の、色域内を厳密に選ぶ二分探索。
      // https://www.w3.org/TR/css-color-4/#css-gamut-mapping
      // C=0 is neutral and in sRGB for every interior L.
      let low = 0;
      let high = requestedC;
      for (let iteration = 0; iteration < 48; iteration += 1) {
        const middle = (low + high) / 2;
        const candidate = oklchToLinearRgb(L, middle, H);
        if (isInSrgbGamut(candidate)) low = middle;
        else high = middle;
      }
      effectiveC = low;
      effectiveLinear = oklchToLinearRgb(L, effectiveC, H);
    }

    return {
      l: L,
      c: effectiveC,
      h: H,
      r: encodeSrgbChannel(effectiveLinear.r),
      g: encodeSrgbChannel(effectiveLinear.g),
      b: encodeSrgbChannel(effectiveLinear.b),
      inGamut,
      mapped: !inGamut
    };
  }

  function oklchToRgb(lightness, chroma, hue) {
    const color = mapToSrgb(lightness, chroma, hue);
    return { r: color.r, g: color.g, b: color.b };
  }

  function rgbToHex(red, green, blue) {
    const channels = [
      assertRgbChannel(red, '赤のRGB値'),
      assertRgbChannel(green, '緑のRGB値'),
      assertRgbChannel(blue, '青のRGB値')
    ];
    if (channels.some(function (channel) { return !Number.isInteger(channel); })) throw new TypeError('HEX変換には整数のRGB値が必要です');
    return channels.map(function (channel) { return channel.toString(16).toUpperCase().padStart(2, '0'); }).join('');
  }

  function generateLightnessSteps(baseLightness) {
    const baseL = assertLightness(baseLightness);
    const baseIndex = baseL === 1 ? 0 : (baseL === 0 ? LIGHTNESS_STEPS - 1
      : Math.max(1, Math.min(LIGHTNESS_STEPS - 2, Math.round((1 - baseL) * (LIGHTNESS_STEPS - 1)))));
    const steps = [];

    // Keep the base near its familiar tenth-step position, then distribute the two sides to the range endpoints.
    // This retains a near-uniform scale for ordinary L while avoiding missing base rows and clamped duplicates.
    for (let index = 0; index < LIGHTNESS_STEPS; index += 1) {
      if (index === baseIndex) {
        steps.push(baseL);
      } else if (index < baseIndex) {
        steps.push(1 + (baseL - 1) * index / baseIndex);
      } else {
        steps.push(baseL * (LIGHTNESS_STEPS - 1 - index) / (LIGHTNESS_STEPS - 1 - baseIndex));
      }
    }
    return { steps, baseIndex };
  }

  return Object.freeze({
    rgbToOklch,
    oklchToLinearRgb,
    mapToSrgb,
    oklchToRgb,
    rgbToHex,
    generateLightnessSteps
  });
});
