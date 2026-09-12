(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DigitalBasicsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function integer(value, min, max, name) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(name);
    return value;
  }
  function combinations(bits) { return 2 ** integer(bits, 0, 40, 'ビット数'); }
  function requiredBits(count) {
    integer(count, 1, 2 ** 40, '通り数');
    let bits = 0;
    while (combinations(bits) < count) bits += 1;
    return bits;
  }
  function binaryPatterns(bits) {
    integer(bits, 1, 8, '表示するビット数');
    return Array.from({ length: combinations(bits) }, (_, i) => i.toString(2).padStart(bits, '0'));
  }
  function quantizeLength(value, step) {
    if (!Number.isFinite(value) || value < 0 || value > 10 || ![0.1, 0.5, 1, 2].includes(step)) throw new RangeError('長さと区切り');
    // この図では境界ちょうどを大きい側へそろえる。浮動小数点の計算ずれを吸収する。
    return Number((Math.floor(value / step + 0.5 + 1e-12) * step).toFixed(1));
  }
  const UNITS = Object.freeze(['bit', 'B', 'KB', 'MB', 'GB', 'TB']);
  function unitBits(unit, base) {
    if (![1000, 1024].includes(base) || !UNITS.includes(unit)) throw new RangeError('単位と換算規則');
    return unit === 'bit' ? 1 : 8 * base ** (UNITS.indexOf(unit) - 1);
  }
  function convert(value, from, to, base = 1024) {
    if (!Number.isFinite(value) || value < 0 || value > 1e6) throw new RangeError('換算する数値');
    return value * unitBits(from, base) / unitBits(to, base);
  }
  function capacityRatioExponent(largerKB, smallerKB) {
    integer(largerKB, 1, 100, '比較するKB'); integer(smallerKB, 1, largerKB, '比較するKB');
    return (largerKB - smallerKB) * 1024 * 8;
  }
  function parseAnswer(raw) {
    const value = String(raw).normalize('NFKC').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) return null;
    const number = Number(value.replaceAll(',', ''));
    return Number.isFinite(number) ? number : null;
  }
  function expectedAnswer(id) {
    switch (id) {
      case 'count8': return combinations(8);
      case 'need120': return requiredBits(120);
      case 'count2bytes': return combinations(2 * 8);
      case 'need500': return requiredBits(500);
      case 'ratio': return capacityRatioExponent(2, 1);
      case 'gb4': return convert(4, 'GB', 'MB');
      case 'pixels': return 4096 * 3072 / unitBits('MB', 1024);
      case 'square': return 2048 * 2048 * unitBits('B', 1024) / unitBits('MB', 1024);
      case 'power': return Math.log2(unitBits('MB', 1024) / 8);
      case 'decimal': return convert(4, 'GB', 'MB', 1000);
      default: throw new RangeError('問題ID');
    }
  }
  return Object.freeze({ combinations, requiredBits, binaryPatterns, quantizeLength, UNITS, unitBits, convert, capacityRatioExponent, parseAnswer, expectedAnswer });
});
