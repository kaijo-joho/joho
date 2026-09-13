(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DigitalRealCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEN = 10n;

  function normalizedText(raw) {
    return typeof raw === 'string' ? raw.normalize('NFKC').trim().replace(/[−ー]/g, '-') : null;
  }

  // 画面に返す Number とは別に、以下の内部関数では入力を正確な分数で扱う。
  function decimalFraction(raw) {
    const text = normalizedText(raw);
    if (!text || /[eE]|Infinity|NaN/.test(text)) return null;
    const match = /^([+-]?)(?:(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d*))?|\.(\d+))$/.exec(text);
    if (!match) return null;
    const sign = match[1] === '-' ? -1n : 1n;
    const wholeText = (match[2] || '0').replaceAll(',', '');
    const decimalText = match[3] !== undefined ? match[3] : (match[4] || '');
    if (wholeText.length > 12 || decimalText.length > 12) return null;
    const denominator = TEN ** BigInt(decimalText.length);
    let numerator = BigInt(wholeText) * denominator + BigInt(decimalText || '0');
    if (numerator === 0n) return { numerator: 0n, denominator: 1n, negative: false };
    numerator *= sign;
    return { numerator, denominator, negative: sign < 0n };
  }

  function parseDecimal(raw) {
    const fraction = decimalFraction(raw);
    if (!fraction) return null;
    const value = Number(fraction.numerator) / Number(fraction.denominator);
    return Object.is(value, -0) ? 0 : value;
  }

  function assertWidth(width) {
    if (!Number.isInteger(width) || width < 1 || width > 32) throw new RangeError('ビット数');
    return width;
  }

  function normalizeBits(raw, width) {
    assertWidth(width);
    if (typeof raw !== 'string') return null;
    const bits = raw.normalize('NFKC').replace(/\s+/g, '');
    return new RegExp(`^[01]{${width}}$`).test(bits) ? bits : null;
  }

  function decimalText(numerator, denominator) {
    if (numerator === 0n) return '0';
    const negative = numerator < 0n;
    let digits = (negative ? -numerator : numerator).toString();
    let places = 0;
    let work = denominator;
    while (work > 1n && work % TEN === 0n) { work /= TEN; places += 1; }
    if (work !== 1n) return `${negative ? '-' : ''}${digits}/${denominator}`;
    if (places) {
      digits = digits.padStart(places + 1, '0');
      digits = `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, '');
    }
    return `${negative ? '-' : ''}${digits}`;
  }

  function toBinary(raw, maxFractionBits = 24) {
    if (!Number.isInteger(maxFractionBits) || maxFractionBits < 0 || maxFractionBits > 64) throw new RangeError('小数部の桁数');
    const parsed = decimalFraction(raw);
    if (!parsed) throw new TypeError('10進小数');
    const sign = parsed.numerator < 0n ? 1 : 0;
    const numerator = sign ? -parsed.numerator : parsed.numerator;
    const integer = numerator / parsed.denominator;
    let remainder = numerator % parsed.denominator;
    if (numerator === 0n) return { sign: 0, integerBits: '0', fractionBits: '', bits: '0', exact: true, steps: [], value: 0 };
    const steps = [];
    let fractionBits = '';
    while (remainder !== 0n && fractionBits.length < maxFractionBits) {
      const before = remainder;
      const doubled = before * 2n;
      const bit = doubled >= parsed.denominator ? 1 : 0;
      remainder = bit ? doubled - parsed.denominator : doubled;
      fractionBits += String(bit);
      steps.push({
        before: decimalText(before, parsed.denominator),
        doubled: decimalText(doubled, parsed.denominator),
        bit,
        after: decimalText(remainder, parsed.denominator)
      });
    }
    const integerBits = integer.toString(2);
    return {
      sign,
      integerBits,
      fractionBits,
      bits: fractionBits ? `${integerBits}.${fractionBits}` : integerBits,
      exact: remainder === 0n,
      steps,
      value: parseDecimal(raw)
    };
  }

  function fixedRange(fractionBits = 4, totalBits = 8) {
    assertWidth(totalBits);
    if (!Number.isInteger(fractionBits) || fractionBits < 0 || fractionBits >= totalBits) throw new RangeError('小数部のビット数');
    return {
      integerBits: totalBits - fractionBits,
      fractionBits,
      min: 0,
      max: (2 ** totalBits - 1) / 2 ** fractionBits,
      step: 1 / 2 ** fractionBits
    };
  }

  function encodeFixed(raw, fractionBits = 4, totalBits = 8) {
    fixedRange(fractionBits, totalBits);
    const parsed = decimalFraction(raw);
    if (!parsed) throw new TypeError('10進小数');
    const scale = 1n << BigInt(fractionBits);
    const scaled = parsed.numerator * scale;
    if (scaled < 0n || scaled % parsed.denominator !== 0n) throw new RangeError('固定小数点で表せない値');
    const stored = scaled / parsed.denominator;
    if (stored >= (1n << BigInt(totalBits))) throw new RangeError('固定小数点の範囲');
    const bits = stored.toString(2).padStart(totalBits, '0');
    return {
      bits,
      pointBits: fractionBits ? `${bits.slice(0, -fractionBits)}.${bits.slice(-fractionBits)}` : bits,
      value: Number(stored) / 2 ** fractionBits,
      exact: true
    };
  }

  function decodeFixed(rawBits, fractionBits = 4, totalBits = 8) {
    fixedRange(fractionBits, totalBits);
    const bits = normalizeBits(rawBits, totalBits);
    if (bits === null) throw new RangeError('ビット列');
    return Number(BigInt(`0b${bits}`)) / 2 ** fractionBits;
  }

  function normalizeBinary(raw) {
    const text = normalizedText(raw);
    if (!text) return null;
    const compact = text.replace(/\s+/g, '');
    const match = /^([+-]?)(?:([01]+)(?:\.([01]*))?|\.([01]+))$/.exec(compact);
    if (!match) return null;
    const sign = match[1] === '-' ? 1 : 0;
    const whole = match[2] || '';
    const fraction = match[3] !== undefined ? match[3] : (match[4] || '');
    const all = `${whole}${fraction}`;
    if (!all.includes('1')) return { sign: 0, significand: '0', fractionBits: '', exponent: 0, zero: true };
    let exponent;
    let rest;
    const firstWhole = whole.indexOf('1');
    if (firstWhole !== -1) {
      exponent = whole.length - firstWhole - 1;
      rest = `${whole.slice(firstWhole + 1)}${fraction}`;
    } else {
      const firstFraction = fraction.indexOf('1');
      exponent = -(firstFraction + 1);
      rest = fraction.slice(firstFraction + 1);
    }
    rest = rest.replace(/0+$/, '');
    return { sign, significand: rest ? `1.${rest}` : '1', fractionBits: rest, exponent, zero: false };
  }

  function formatBits(value, width) {
    return value.toString(2).padStart(width, '0');
  }

  function comparePowerOfTwo(numerator, denominator, exponent) {
    return exponent >= 0
      ? numerator === (denominator << BigInt(exponent)) ? 0 : (numerator > (denominator << BigInt(exponent)) ? 1 : -1)
      : (numerator << BigInt(-exponent)) === denominator ? 0 : ((numerator << BigInt(-exponent)) > denominator ? 1 : -1);
  }

  function floorLog2(numerator, denominator) {
    let exponent = numerator.toString(2).length - denominator.toString(2).length;
    if (comparePowerOfTwo(numerator, denominator, exponent) < 0) exponent -= 1;
    return exponent;
  }

  function scaledDivision(numerator, denominator, shift) {
    return shift >= 0
      ? { numerator: numerator << BigInt(shift), denominator }
      : { numerator, denominator: denominator << BigInt(-shift) };
  }

  function roundedInteger(numerator, denominator, shift, rounding) {
    const scaled = scaledDivision(numerator, denominator, shift);
    let quotient = scaled.numerator / scaled.denominator;
    const remainder = scaled.numerator % scaled.denominator;
    if (rounding === 'nearest') {
      const doubled = remainder * 2n;
      if (doubled > scaled.denominator || (doubled === scaled.denominator && quotient % 2n === 1n)) quotient += 1n;
    }
    return quotient;
  }

  function fractionValue(numerator, denominator, sign) {
    const value = Number(numerator) / Number(denominator);
    return sign ? -value : value;
  }

  function floatParts(raw, totalBits = 32, rounding = 'nearest') {
    if (totalBits !== 16 && totalBits !== 32) throw new RangeError('浮動小数点のビット数');
    if (rounding !== 'nearest' && rounding !== 'truncate') throw new RangeError('丸め');
    const parsed = decimalFraction(raw);
    if (!parsed) throw new TypeError('10進小数');
    const sign = parsed.numerator < 0n ? 1 : 0;
    const numerator = sign ? -parsed.numerator : parsed.numerator;
    const exponentWidth = totalBits === 16 ? 5 : 8;
    const fractionWidth = totalBits - exponentWidth - 1;
    const bias = 2 ** (exponentWidth - 1) - 1;
    const maxStoredExponent = 2 ** exponentWidth - 1;
    const maxExponent = maxStoredExponent - 1 - bias;
    const minNormalExponent = 1 - bias;
    const signBits = String(sign);
    const zeroResult = function (kind, fraction, storedExponent, exponent, significand, exact) {
      const exponentBits = formatBits(storedExponent, exponentWidth);
      const fractionBits = formatBits(fraction, fractionWidth);
      return {
        totalBits, exponentWidth, fractionWidth, bias, sign, signBits, exponentBits, fractionBits,
        storedExponent, exponent, significand, bits: `${signBits}${exponentBits}${fractionBits}`,
        value: 0, exact, kind
      };
    };
    if (numerator === 0n) return zeroResult('zero', 0n, 0, 0, '0', true);

    function infinity() {
      const exponentBits = formatBits(maxStoredExponent, exponentWidth);
      const fractionBits = '0'.repeat(fractionWidth);
      return {
        totalBits, exponentWidth, fractionWidth, bias, sign, signBits, exponentBits, fractionBits,
        storedExponent: maxStoredExponent, exponent: null, significand: '∞', bits: `${signBits}${exponentBits}${fractionBits}`,
        value: sign ? -Infinity : Infinity, exact: false, kind: 'infinity'
      };
    }

    let exponent = floorLog2(numerator, parsed.denominator);
    if (exponent > maxExponent) return infinity();
    const hidden = 1n << BigInt(fractionWidth);
    let storedExponent;
    let fraction;
    let kind;
    let significand;
    let representedNumerator;
    let representedDenominator;

    if (exponent >= minNormalExponent) {
      let significandInteger = roundedInteger(numerator, parsed.denominator, fractionWidth - exponent, rounding);
      if (significandInteger >= hidden * 2n) {
        significandInteger >>= 1n;
        exponent += 1;
      }
      if (exponent > maxExponent) return infinity();
      storedExponent = exponent + bias;
      fraction = significandInteger - hidden;
      kind = 'normal';
      const fractionBits = formatBits(fraction, fractionWidth);
      significand = `1.${fractionBits}`;
      const represented = scaledDivision(significandInteger, 1n, exponent - fractionWidth);
      representedNumerator = represented.numerator;
      representedDenominator = represented.denominator;
    } else {
      const quantumExponent = minNormalExponent - fractionWidth;
      const subnormalInteger = roundedInteger(numerator, parsed.denominator, -quantumExponent, rounding);
      if (subnormalInteger === 0n) return zeroResult('zero', 0n, 0, 0, '0', false);
      if (subnormalInteger >= hidden) {
        storedExponent = 1;
        fraction = 0n;
        exponent = minNormalExponent;
        kind = 'normal';
        significand = `1.${'0'.repeat(fractionWidth)}`;
        const represented = scaledDivision(hidden, 1n, exponent - fractionWidth);
        representedNumerator = represented.numerator;
        representedDenominator = represented.denominator;
      } else {
        storedExponent = 0;
        fraction = subnormalInteger;
        exponent = minNormalExponent;
        kind = 'subnormal';
        significand = `0.${formatBits(fraction, fractionWidth)}`;
        const represented = scaledDivision(fraction, 1n, quantumExponent);
        representedNumerator = represented.numerator;
        representedDenominator = represented.denominator;
      }
    }
    const exponentBits = formatBits(storedExponent, exponentWidth);
    const fractionBits = formatBits(fraction, fractionWidth);
    const exact = numerator * representedDenominator === representedNumerator * parsed.denominator;
    return {
      totalBits, exponentWidth, fractionWidth, bias, sign, signBits, exponentBits, fractionBits,
      storedExponent, exponent, significand, bits: `${signBits}${exponentBits}${fractionBits}`,
      value: fractionValue(representedNumerator, representedDenominator, sign), exact, kind
    };
  }

  function decodeFloat(rawBits, totalBits = 32) {
    if (totalBits !== 16 && totalBits !== 32) throw new RangeError('浮動小数点のビット数');
    const bits = normalizeBits(rawBits, totalBits);
    if (bits === null) throw new RangeError('ビット列');
    const exponentWidth = totalBits === 16 ? 5 : 8;
    const fractionWidth = totalBits - exponentWidth - 1;
    const bias = 2 ** (exponentWidth - 1) - 1;
    const sign = bits[0] === '1' ? 1 : 0;
    const storedExponent = Number.parseInt(bits.slice(1, 1 + exponentWidth), 2);
    const fractionBits = bits.slice(1 + exponentWidth);
    const fraction = BigInt(`0b${fractionBits}`);
    const maxStoredExponent = 2 ** exponentWidth - 1;
    let kind;
    let exponent;
    let magnitude;
    if (storedExponent === maxStoredExponent) {
      kind = fraction === 0n ? 'infinity' : 'nan';
      exponent = null;
      magnitude = fraction === 0n ? Infinity : NaN;
    } else if (storedExponent === 0) {
      kind = fraction === 0n ? 'zero' : 'subnormal';
      exponent = fraction === 0n ? 0 : 1 - bias;
      magnitude = fraction === 0n ? 0 : Number(fraction) * 2 ** (1 - bias - fractionWidth);
    } else {
      kind = 'normal';
      exponent = storedExponent - bias;
      magnitude = (1 + Number(fraction) / 2 ** fractionWidth) * 2 ** exponent;
    }
    return { value: sign ? -magnitude : magnitude, kind, sign, storedExponent, exponent, fractionBits };
  }

  return Object.freeze({ parseDecimal, normalizeBits, toBinary, fixedRange, encodeFixed, decodeFixed, normalizeBinary, floatParts, decodeFloat });
});
