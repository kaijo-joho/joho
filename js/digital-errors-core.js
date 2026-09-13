(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DigitalErrorsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEN = 10n;

  function text(raw) {
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    const value = String(raw).normalize('NFKC').trim().replace(/[−ー]/g, '-');
    return value && !/[eE]|Infinity|NaN/.test(value) ? value : null;
  }

  // 指数表記を受け付けず、有限小数をそのまま整数比にする。
  function decimal(raw, maximumPlaces) {
    const value = text(raw);
    const match = value && /^(\+?)(\d+)(?:\.(\d*))?$/.exec(value);
    if (!match) throw new TypeError('10進小数');
    const fraction = match[3] || '';
    if (maximumPlaces !== undefined && fraction.length > maximumPlaces) throw new TypeError('10進小数');
    const places = fraction.length;
    return reduce(BigInt(match[2] + fraction), TEN ** BigInt(places));
  }

  function gcd(a, b) { while (b) { const next = a % b; a = b; b = next; } return a; }
  function reduce(n, d) { const g = gcd(n < 0n ? -n : n, d); return { n: n / g, d: d / g }; }
  function add(a, b) { return reduce(a.n * b.d + b.n * a.d, a.d * b.d); }
  function subtract(a, b) { return reduce(a.n * b.d - b.n * a.d, a.d * b.d); }
  function abs(a) { return { n: a.n < 0n ? -a.n : a.n, d: a.d }; }
  function power10(power) { return TEN ** BigInt(power); }

  function decimalText(value) {
    const negative = value.n < 0n;
    let numerator = negative ? -value.n : value.n;
    let denominator = value.d;
    let twos = 0;
    let fives = 0;
    while (denominator % 2n === 0n) { denominator /= 2n; twos += 1; }
    while (denominator % 5n === 0n) { denominator /= 5n; fives += 1; }
    if (denominator !== 1n) throw new RangeError('有限小数ではない値');
    const places = Math.max(twos, fives);
    numerator *= 2n ** BigInt(places - twos);
    numerator *= 5n ** BigInt(places - fives);
    let digits = numerator.toString();
    if (places) {
      digits = digits.padStart(places + 1, '0');
      digits = `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, '');
    }
    return `${negative ? '-' : ''}${digits}`;
  }

  function assertInteger(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(label);
  }
  function roundedDivision(n, d) {
    let q = n / d;
    const r = n % d;
    const twice = r * 2n;
    if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
    return q;
  }
  function scaled(n, d, shift) { return shift >= 0 ? { n: n * power10(shift), d } : { n, d: d * power10(-shift) }; }
  function comparePower10(a, exponent) {
    return exponent >= 0 ? (a.n === a.d * power10(exponent) ? 0 : a.n > a.d * power10(exponent) ? 1 : -1)
      : (a.n * power10(-exponent) === a.d ? 0 : a.n * power10(-exponent) > a.d ? 1 : -1);
  }
  function decimalExponent(a) {
    let exponent = a.n.toString().length - a.d.toString().length;
    if (comparePower10(a, exponent) < 0) exponent -= 1;
    return exponent;
  }
  function truncateSignificant(a, precision) {
    if (a.n === 0n) return { n: 0n, d: 1n };
    const shift = precision - 1 - decimalExponent(a);
    const x = scaled(a.n, a.d, shift);
    const q = x.n / x.d;
    return shift >= 0 ? reduce(q, power10(shift)) : { n: q * power10(-shift), d: 1n };
  }

  function roundBinaryFraction(raw, bits = 8, mode = 'truncate') {
    assertInteger(bits, 1, 16, '小数部ビット数');
    if (mode !== 'truncate' && mode !== 'nearest') throw new RangeError('丸め方法');
    const original = decimal(raw, 6);
    if (original.n < 0n || original.n >= original.d) throw new RangeError('0以上1未満の小数');
    const unit = 1n << BigInt(bits);
    const multiplied = original.n * unit;
    const integer = mode === 'nearest' ? roundedDivision(multiplied, original.d) : multiplied / original.d;
    const stored = reduce(integer, unit);
    return { original: decimalText(original), stored: decimalText(stored), error: decimalText(abs(subtract(original, stored))), bits: integer.toString(2).padStart(bits, '0'), fractionBits: bits, exact: original.n * unit === integer * original.d };
  }

  function geometricPartial(count) {
    assertInteger(count, 1, 16, '項数');
    const denominator = 1n << BigInt(count);
    const sum = reduce(denominator - 1n, denominator);
    const remainder = reduce(1n, denominator);
    const terms = Array.from({ length: count }, (_, index) => decimalText(reduce(1n, 1n << BigInt(index + 1))));
    return { count, denominator: denominator.toString(), sum: decimalText(sum), remainder: decimalText(remainder), terms };
  }

  function informationLoss(exponent = -4, precision = 4) {
    assertInteger(exponent, -6, -1, '指数');
    if (![4, 6, 8].includes(precision)) throw new RangeError('有効数字');
    const largeExact = decimal('1.234');
    const smallExact = exponent >= 0 ? { n: 1234n * power10(exponent - 3), d: 1n } : reduce(1234n, power10(3 - exponent));
    const large = truncateSignificant(largeExact, precision);
    const small = truncateSignificant(smallExact, precision);
    const exactSum = add(largeExact, smallExact);
    const storedSum = truncateSignificant(add(large, small), precision);
    return { large: decimalText(large), small: decimalText(small), exactSum: decimalText(exactSum), storedSum: decimalText(storedSum), error: decimalText(abs(subtract(exactSum, storedSum))), lost: storedSum.n === large.n && storedSum.d === large.d };
  }

  function cancellation() {
    const left = decimal('0.0316069');
    const right = decimal('0.0315753');
    const difference = subtract(left, right);
    const uncertainty = decimal('0.0000001');
    return { left: decimalText(left), right: decimalText(right), difference: decimalText(difference), uncertainty: decimalText(uncertainty), low: decimalText(subtract(difference, uncertainty)), high: decimalText(add(difference, uncertainty)) };
  }

  function signedAddition(a, b, width = 8) {
    // この教材は 8 bit の補数表現だけを扱う。width は呼び出し側の明示性のため残す。
    if (width !== 8) throw new RangeError('ビット数');
    const min = -128;
    const max = 127;
    if (!Number.isInteger(a) || !Number.isInteger(b)) throw new TypeError('整数');
    if (a < min || a > max || b < min || b > max) throw new RangeError('符号付き整数の範囲');
    const sum = a + b;
    const modulus = 256;
    const raw = ((sum % modulus) + modulus) % modulus;
    const wrapped = raw >= 128 ? raw - modulus : raw;
    return { left: a, right: b, sum, min, max, overflow: sum < min || sum > max, bits: raw.toString(2).padStart(width, '0'), wrapped };
  }

  function underflow(exponent = 14) {
    assertInteger(exponent, 12, 26, '指数');
    const trueValue = reduce(1025n, 1n << BigInt(exponent + 10));
    const minNormalExponent = -14;
    const fractionWidth = 10;
    const quantumExponent = minNormalExponent - fractionWidth;
    let kind;
    let integer;
    if (-exponent >= minNormalExponent) { // 正規化数: 仮数部の整数を 2^10 倍する。
      integer = 1025n;
      kind = 'normal';
    } else {
      integer = roundedDivision(trueValue.n * (1n << BigInt(-quantumExponent)), trueValue.d);
      kind = integer === 0n ? 'zero' : (integer >= 1024n ? 'normal' : 'subnormal');
    }
    let stored;
    let bits;
    if (kind === 'normal') {
      const actualExponent = -exponent;
      const expField = actualExponent + 15;
      stored = reduce(integer, 1n << BigInt(fractionWidth - actualExponent));
      bits = `0${expField.toString(2).padStart(5, '0')}${(integer - 1024n).toString(2).padStart(10, '0')}`;
    } else if (kind === 'subnormal') {
      stored = reduce(integer, 1n << 24n);
      bits = `000000${integer.toString(2).padStart(10, '0')}`;
    } else { stored = { n: 0n, d: 1n }; bits = '0'.repeat(16); }
    return { exponent, trueValue: decimalText(trueValue), stored: decimalText(stored), error: decimalText(abs(subtract(trueValue, stored))), kind, exact: trueValue.n === stored.n && trueValue.d === stored.d, bits };
  }

  function summationOrder(count = 10, precision = 4) {
    if (![10, 100, 1000].includes(count)) throw new RangeError('加算回数');
    if (![4, 6, 8].includes(precision)) throw new RangeError('有効数字');
    const one = { n: 1n, d: 1n };
    const small = decimal('0.0001');
    let largeFirst = one;
    let subtotal = { n: 0n, d: 1n };
    for (let index = 0; index < count; index += 1) {
      largeFirst = truncateSignificant(add(largeFirst, small), precision);
      subtotal = truncateSignificant(add(subtotal, small), precision);
    }
    const smallFirst = truncateSignificant(add(subtotal, one), precision);
    return { exact: decimalText(add(one, reduce(BigInt(count), 10000n))), largeFirst: decimalText(largeFirst), smallFirst: decimalText(smallFirst), smallSubtotal: decimalText(subtotal) };
  }

  return Object.freeze({ roundBinaryFraction, geometricPartial, informationLoss, cancellation, signedAddition, underflow, summationOrder });
});
