(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DigitalRadixCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_VALUE = 65535;
  const BASES = Object.freeze([2, 10, 16]);
  const MAX_DIGITS = Object.freeze({ 2: 16, 10: 5, 16: 4 });

  function supportedBase(base) {
    return BASES.includes(base);
  }

  function assertBase(base) {
    if (!supportedBase(base)) throw new RangeError('基数');
    return base;
  }

  function assertValue(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_VALUE) throw new RangeError('符号なし整数');
    return value;
  }

  function normalizedText(raw) {
    return typeof raw === 'string' ? raw.normalize('NFKC').trim() : null;
  }

  function normalizeNumeral(raw, base) {
    if (!supportedBase(base)) return null;
    let text = normalizedText(raw);
    if (!text) return null;
    text = text.toUpperCase();

    if (base === 10) {
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
      text = text.replaceAll(',', '');
    } else {
      text = text.replaceAll(/\s+/g, '');
      const pattern = base === 2 ? /^[01]+$/ : /^[0-9A-F]+$/;
      if (!pattern.test(text)) return null;
    }

    if (text.length > MAX_DIGITS[base]) return null;
    const value = Number.parseInt(text, base);
    return Number.isSafeInteger(value) && value <= MAX_VALUE ? text : null;
  }

  function parseNumeral(raw, base) {
    const text = normalizeNumeral(raw, base);
    return text === null ? null : Number.parseInt(text, base);
  }

  function formatNumeral(value, base, minWidth = 0) {
    assertValue(value);
    assertBase(base);
    if (!Number.isSafeInteger(minWidth) || minWidth < 0 || minWidth > 16) throw new RangeError('最小桁数');
    return value.toString(base).toUpperCase().padStart(minWidth, '0');
  }

  function divisionSteps(value, base) {
    assertValue(value);
    assertBase(base);
    const steps = [];
    do {
      const quotient = Math.floor(value / base);
      const remainder = value % base;
      steps.push({ dividend: value, divisor: base, quotient, remainder, digit: formatNumeral(remainder, base) });
      value = quotient;
    } while (value > 0);
    return steps;
  }

  function requireNumeral(raw, base) {
    assertBase(base);
    const numeral = normalizeNumeral(raw, base);
    if (numeral === null) throw new RangeError('数の表記');
    return numeral;
  }

  function placeTerms(raw, base) {
    const numeral = requireNumeral(raw, base);
    return Array.from(numeral, function (digit, index) {
      const power = numeral.length - index - 1;
      const digitValue = Number.parseInt(digit, base);
      const weight = base ** power;
      return { digit, digitValue, power, weight, product: digitValue * weight };
    });
  }

  function groupBinary(raw) {
    const binary = requireNumeral(raw, 2);
    const padding = (4 - binary.length % 4) % 4;
    const padded = '0'.repeat(padding) + binary;
    const groups = [];
    for (let index = 0; index < padded.length; index += 4) {
      const group = padded.slice(index, index + 4);
      const value = Number.parseInt(group, 2);
      groups.push({ binary: group, hex: formatNumeral(value, 16), value });
    }
    return { binary, padded, padding, groups };
  }

  function expandHex(raw) {
    const hex = requireNumeral(raw, 16);
    const groups = Array.from(hex, function (digit) {
      const value = Number.parseInt(digit, 16);
      return { hex: digit, binary: formatNumeral(value, 2, 4), value };
    });
    const binary = groups.map(function (group) { return group.binary; }).join('');
    const minimal = binary.replace(/^0+/, '') || '0';
    return { hex, binary, minimal, groups };
  }

  return Object.freeze({ normalizeNumeral, parseNumeral, formatNumeral, divisionSteps, placeTerms, groupBinary, expandHex });
});
