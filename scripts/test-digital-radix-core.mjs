import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../js/digital-radix-core.js');
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks += 1; }
function throws(fn) { assert.throws(fn, RangeError); checks += 1; }

const browser = {};
vm.runInNewContext(await readFile(new URL('../js/digital-radix-core.js', import.meta.url), 'utf8'), browser);
equal(browser.DigitalRadixCore.formatNumeral(255, 16), 'FF');
equal(Object.isFrozen(core), true);

// 原稿の10進数から2進数への例。計算結果は固定値で照合する。
for (const [decimal, binary] of [[37, '100101'], [82, '1010010'], [215, '11010111'], [124, '1111100'], [503, '111110111']]) {
  equal(core.formatNumeral(decimal, 2), binary);
  equal(core.parseNumeral(binary, 2), decimal);
}

// 原稿の2進数・16進数の対応例。
for (const [binary, decimal] of [['10101', 21], ['11010', 26], ['111001', 57], ['1001100', 76], ['1010110', 86]]) equal(core.parseNumeral(binary, 2), decimal);
equal(core.groupBinary('1011011').groups.map(group => group.hex).join(''), '5B');
for (const [hex, binary, decimal] of [['C4', '11000100', 196], ['DE', '11011110', 222]]) {
  const expanded = core.expandHex(hex);
  equal(expanded.binary, binary);
  equal(core.parseNumeral(hex, 16), decimal);
}
for (const [decimal, hex] of [[255, 'FF'], [124, '7C'], [101, '65'], [204, 'CC'], [164, 'A4'], [79, '4F'], [109, '6D'], [153, '99']]) equal(core.formatNumeral(decimal, 16), hex);

// 表記をそろえつつ、先頭の0は学習用の桁として残す。
equal(core.normalizeNumeral(' １０１ ０１ ', 2), '10101');
equal(core.normalizeNumeral(' ０,１２３ ', 10), '0123');
equal(core.normalizeNumeral(' ｃ４ ', 16), 'C4');
equal(core.normalizeNumeral('000101', 2), '000101');
equal(core.normalizeNumeral('0 0 0 F', 16), '000F');
equal(core.parseNumeral('６５,５３５', 10), 65535);

// 0、2の累乗の境界、4ビットの境界、16ビットの最大値を別々に確認する。
equal(core.divisionSteps(0, 16), [{ dividend: 0, divisor: 16, quotient: 0, remainder: 0, digit: '0' }]);
for (const [value, width] of [[1, 1], [2, 2], [3, 2], [15, 4], [16, 5], [255, 8], [256, 9], [32767, 15], [32768, 16]]) equal(core.formatNumeral(value, 2).length, width);
equal(core.groupBinary('1111'), { binary: '1111', padded: '1111', padding: 0, groups: [{ binary: '1111', hex: 'F', value: 15 }] });
equal(core.groupBinary('10000'), { binary: '10000', padded: '00010000', padding: 3, groups: [{ binary: '0001', hex: '1', value: 1 }, { binary: '0000', hex: '0', value: 0 }] });
equal(core.formatNumeral(65535, 2), '1111111111111111');
equal(core.formatNumeral(65535, 16), 'FFFF');
equal(core.parseNumeral('65535', 10), 65535);

// 余りを下から読んで値を復元することと、重みの和を独立に計算することを確認する。
for (const [value, base] of [[37, 2], [503, 2], [255, 16], [65535, 16]]) {
  const steps = core.divisionSteps(value, base);
  equal(steps.at(-1).quotient, 0);
  equal(steps.reduce((sum, step, index) => sum + step.remainder * base ** index, 0), value);
  equal(steps.every(step => step.dividend === step.quotient * base + step.remainder && step.remainder < base), true);
}
for (const [raw, base, expected] of [['000101', 2, 5], ['101', 16, 257], ['C4', 16, 196], ['65535', 10, 65535]]) {
  const terms = core.placeTerms(raw, base);
  equal(terms.reduce((sum, term) => sum + term.product, 0), expected);
}
equal(core.expandHex('101'), { hex: '101', binary: '000100000001', minimal: '100000001', groups: [{ hex: '1', binary: '0001', value: 1 }, { hex: '0', binary: '0000', value: 0 }, { hex: '1', binary: '0001', value: 1 }] });
equal(core.expandHex('0000').minimal, '0');

for (const [raw, base] of [['', 2], [' ', 10], ['-1', 10], ['12.3', 10], ['0b101', 2], ['0xFF', 16], ['102', 2], ['G', 16], ['1,23', 10], ['12,34,567', 10], ['65,536', 10], ['11111111111111111', 2], ['10000', 16]]) {
  equal(core.normalizeNumeral(raw, base), null);
  equal(core.parseNumeral(raw, base), null);
}
equal(core.normalizeNumeral('10', 3), null);
equal(core.parseNumeral('10', 3), null);
for (const fn of [
  () => core.formatNumeral(-1, 2), () => core.formatNumeral(65536, 16), () => core.formatNumeral(1, 3), () => core.formatNumeral(1, 2, 17),
  () => core.divisionSteps(1.5, 2), () => core.divisionSteps(1, 8), () => core.placeTerms('102', 2), () => core.placeTerms('10', 8),
  () => core.groupBinary('102'), () => core.expandHex('10000')
]) throws(fn);

console.log(`digital-radix-core: ${checks}件の検証に合格（原稿例、基数変換、桁の境界、入力検証）`);
