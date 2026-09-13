(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DigitalIntegerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTHS = Object.freeze([4, 6, 8]);

  function assertWidth(width) {
    if (!WIDTHS.includes(width)) throw new RangeError('ビット数');
    return width;
  }

  function range(width) {
    assertWidth(width);
    const size = 2 ** width;
    return { min: -(size / 2), max: size / 2 - 1, unsignedMax: size - 1, size };
  }

  function assertSignedInteger(value, width) {
    const limits = range(width);
    if (!Number.isSafeInteger(value) || value < limits.min || value > limits.max) throw new RangeError('符号付き整数');
    return value;
  }

  function normalizedText(raw) {
    return typeof raw === 'string' ? raw.normalize('NFKC').trim().replace(/[−ー]/g, '-') : null;
  }

  function parseInteger(raw) {
    const text = normalizedText(raw);
    if (!text || !/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
    const value = Number(text.replaceAll(',', ''));
    return Number.isSafeInteger(value) ? (Object.is(value, -0) ? 0 : value) : null;
  }

  function normalizeBits(raw, width) {
    assertWidth(width);
    if (typeof raw !== 'string') return null;
    const bits = raw.normalize('NFKC').replace(/\s+/g, '');
    return new RegExp(`^[01]{${width}}$`).test(bits) ? bits : null;
  }

  function requireBits(raw, width) {
    const bits = normalizeBits(raw, width);
    if (bits === null) throw new RangeError('ビット列');
    return bits;
  }

  function formatUnsigned(value, width) {
    const limits = range(width);
    if (!Number.isSafeInteger(value) || value < 0 || value > limits.unsignedMax) throw new RangeError('符号なし整数');
    return value.toString(2).padStart(width, '0');
  }

  function encode(value, width) {
    const limits = range(width);
    assertSignedInteger(value, width);
    return formatUnsigned(value < 0 ? limits.size + value : value, width);
  }

  function decode(bits, width) {
    const normalized = requireBits(bits, width);
    const limits = range(width);
    const value = Number.parseInt(normalized, 2);
    return value > limits.max ? value - limits.size : value;
  }

  function complement(bits, width) {
    const original = requireBits(bits, width);
    const limits = range(width);
    const ones = Array.from(original, function (bit) { return bit === '0' ? '1' : '0'; }).join('');
    const sum = Number.parseInt(ones, 2) + 1;
    return {
      original,
      ones,
      twos: formatUnsigned(sum % limits.size, width),
      carry: sum >= limits.size
    };
  }

  function arithmetic(a, b, width, operation) {
    const limits = range(width);
    assertSignedInteger(a, width);
    assertSignedInteger(b, width);
    if (operation !== 'add' && operation !== 'subtract') throw new RangeError('演算');

    const leftBits = encode(a, width);
    const rightBits = encode(b, width);
    const operandBits = operation === 'add' ? rightBits : complement(rightBits, width).twos;
    const sum = Number.parseInt(leftBits, 2) + Number.parseInt(operandBits, 2);
    const bits = formatUnsigned(sum % limits.size, width);
    const expected = operation === 'add' ? a + b : a - b;
    return {
      leftBits,
      rightBits,
      operandBits,
      fullBits: sum.toString(2).padStart(width + 1, '0'),
      bits,
      decoded: decode(bits, width),
      expected,
      carry: sum >= limits.size,
      overflow: expected < limits.min || expected > limits.max
    };
  }

  return Object.freeze({ range, parseInteger, normalizeBits, formatUnsigned, encode, decode, complement, arithmetic });
});
