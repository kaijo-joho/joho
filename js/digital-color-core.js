(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DigitalColorCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CHANNEL_MIN = 0;
  const CHANNEL_MAX = 255;

  function assertChannel(value, label = 'RGB値') {
    if (!Number.isInteger(value)) throw new TypeError(label);
    if (value < CHANNEL_MIN || value > CHANNEL_MAX) throw new RangeError(label);
    return value;
  }

  function assertDepth(value) {
    if (!Number.isInteger(value)) throw new TypeError('ビット数');
    if (value < 1 || value > 8) throw new RangeError('ビット数');
    return value;
  }

  function normalizedText(raw) {
    return typeof raw === 'string' ? raw.normalize('NFKC').trim() : null;
  }

  function parseChannel(raw) {
    const text = normalizedText(raw);
    if (!text || !/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) && value >= CHANNEL_MIN && value <= CHANNEL_MAX ? value : null;
  }

  function rgb(red, green, blue) {
    const channels = [
      assertChannel(red, '赤のRGB値'),
      assertChannel(green, '緑のRGB値'),
      assertChannel(blue, '青のRGB値')
    ];
    const hexParts = channels.map(function (channel) { return channel.toString(16).toUpperCase().padStart(2, '0'); });
    return {
      channels,
      hex: `#${hexParts.join('')}`,
      bits: channels.map(function (channel) { return channel.toString(2).padStart(8, '0'); }),
      hexParts,
      css: `rgb(${channels.join(', ')})`
    };
  }

  function parseHex(raw) {
    const text = normalizedText(raw);
    if (!text || !/^#?[0-9a-f]{6}$/i.test(text)) return null;
    const hex = text.startsWith('#') ? text.slice(1) : text;
    return rgb(
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16)
    );
  }

  function depth(bitsPerChannel) {
    const bits = assertDepth(bitsPerChannel);
    return {
      bitsPerChannel: bits,
      levels: 2 ** bits,
      totalBits: 3 * bits,
      colors: 2 ** (3 * bits)
    };
  }

  // これは光量ではなく、0〜255のRGBコード値を等間隔に丸める授業用モデルである。
  function quantize(value, bitsPerChannel) {
    const channel = assertChannel(value);
    const bits = assertDepth(bitsPerChannel);
    const maximumIndex = 2 ** bits - 1;
    const index = Math.round(channel / CHANNEL_MAX * maximumIndex);
    return {
      index,
      value: Math.round(index / maximumIndex * CHANNEL_MAX),
      bits: index.toString(2).padStart(bits, '0')
    };
  }

  function assertMixChannels(channels, name) {
    if (!Array.isArray(channels) || channels.length !== 3) throw new TypeError(`${name}の3成分`);
    if (channels.some(function (channel) { return typeof channel !== 'boolean'; })) throw new TypeError(`${name}の成分`);
    return channels;
  }

  function mixAdditive(channels) {
    const rgbOn = assertMixChannels(channels, 'RGB');
    return rgb(rgbOn[0] ? 255 : 0, rgbOn[1] ? 255 : 0, rgbOn[2] ? 255 : 0);
  }

  function mixSubtractive(channels) {
    const cmyOn = assertMixChannels(channels, 'CMY');
    return rgb(cmyOn[0] ? 0 : 255, cmyOn[1] ? 0 : 255, cmyOn[2] ? 0 : 255);
  }

  function basicName(channels) {
    if (!Array.isArray(channels) || channels.length !== 3) throw new TypeError('RGBの3成分');
    const [red, green, blue] = channels.map(function (channel) { return assertChannel(channel); });
    const names = {
      '0,0,0': '黒',
      '255,255,255': '白',
      '255,0,0': '赤',
      '0,255,0': '緑',
      '0,0,255': '青',
      '255,255,0': '黄',
      '0,255,255': 'シアン',
      '255,0,255': 'マゼンタ'
    };
    const key = [red, green, blue].join(',');
    if (Object.hasOwn(names, key)) return names[key];
    return red === green && green === blue ? '灰色' : null;
  }

  return Object.freeze({ parseChannel, rgb, parseHex, depth, quantize, mixAdditive, mixSubtractive, basicName });
});
