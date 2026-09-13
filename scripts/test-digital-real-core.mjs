import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../js/digital-real-core.js');
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks += 1; }
function close(actual, expected) { assert.ok(Math.abs(actual - expected) <= Math.abs(expected || 1) * 1e-12); checks += 1; }
function throws(fn, type = RangeError) { assert.throws(fn, type); checks += 1; }
function float32Bits(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);
  return view.getUint32(0, false).toString(2).padStart(32, '0');
}

const browser = {};
vm.runInNewContext(await readFile(new URL('../js/digital-real-core.js', import.meta.url), 'utf8'), browser);
equal(typeof browser.DigitalRealCore, 'object');
equal(Object.isFrozen(browser.DigitalRealCore), true);
equal(Object.keys(core).sort(), ['decodeFixed', 'decodeFloat', 'encodeFixed', 'fixedRange', 'floatParts', 'normalizeBinary', 'normalizeBits', 'parseDecimal', 'toBinary']);

// 10進入力は文字として検査する。Number の指数表記などは学習用入力に混ぜない。
for (const [raw, expected] of [['１２,３４５.６', 12345.6], [' −0.25 ', -0.25], ['ー.5', -0.5], ['-0', 0]]) equal(core.parseDecimal(raw), expected);
for (const raw of ['', '1e-3', 'Infinity', 'NaN', '1,23.4', '12,34,567', '1.2345678901234', '1234567890123', '1 2', '.']) equal(core.parseDecimal(raw), null);
equal(core.normalizeBits(' ０ １\n１ ０ ', 4), '0110');
for (const raw of ['011', '01100', '0120', '0b11', 3]) equal(core.normalizeBits(raw, 4), null);
throws(() => core.normalizeBits('0', 0));

// 2倍して整数部を取り出す手順は、0.025 のように JavaScript の丸め誤差が出やすい数でも文字の値を保つ。
equal(core.toBinary('6.75'), {
  sign: 0, integerBits: '110', fractionBits: '11', bits: '110.11', exact: true,
  steps: [
    { before: '0.75', doubled: '1.5', bit: 1, after: '0.5' },
    { before: '0.5', doubled: '1', bit: 1, after: '0' }
  ], value: 6.75
});
const point025 = core.toBinary('0.025', 12);
equal(point025.bits, '0.000001100110');
equal(point025.exact, false);
equal(point025.steps.slice(0, 3), [
  { before: '0.025', doubled: '0.05', bit: 0, after: '0.05' },
  { before: '0.05', doubled: '0.1', bit: 0, after: '0.1' },
  { before: '0.1', doubled: '0.2', bit: 0, after: '0.2' }
]);
equal(core.toBinary('-0.5'), { sign: 1, integerBits: '0', fractionBits: '1', bits: '0.1', exact: true, steps: [{ before: '0.5', doubled: '1', bit: 1, after: '0' }], value: -0.5 });
equal(core.toBinary('0'), { sign: 0, integerBits: '0', fractionBits: '', bits: '0', exact: true, steps: [], value: 0 });

equal(core.fixedRange(4, 8), { integerBits: 4, fractionBits: 4, min: 0, max: 15.9375, step: 0.0625 });
equal(core.encodeFixed('0', 4, 8).bits, '00000000');
equal(core.encodeFixed('5.3125', 4, 8), { bits: '01010101', pointBits: '0101.0101', value: 5.3125, exact: true });
equal(core.encodeFixed('6.75', 4, 8).bits, '01101100');
equal(core.encodeFixed('15.9375', 4, 8).bits, '11111111');
equal(core.decodeFixed('01010101', 4, 8), 5.3125);
throws(() => core.encodeFixed('15.9376', 4, 8));
throws(() => core.encodeFixed('-0.0625', 4, 8));
throws(() => core.encodeFixed('0.1', 4, 8));
throws(() => core.decodeFixed('0101010', 4, 8));

equal(core.normalizeBinary('101.1100'), { sign: 0, significand: '1.0111', fractionBits: '0111', exponent: 2, zero: false });
equal(core.normalizeBinary('-0.1010'), { sign: 1, significand: '1.01', fractionBits: '01', exponent: -1, zero: false });
equal(core.normalizeBinary('0.001'), { sign: 0, significand: '1', fractionBits: '', exponent: -3, zero: false });
equal(core.normalizeBinary('000'), { sign: 0, significand: '0', fractionBits: '', exponent: 0, zero: true });
for (const raw of ['1.0.1', '2.01', '', '+']) equal(core.normalizeBinary(raw), null);

// 原稿の確定例。32ビットの通常値は DataView（IEEE 754 binary32）とも照合する。
const f575 = core.floatParts('5.75', 32);
equal(f575.bits, '01000000101110000000000000000000');
equal(f575.bits, float32Bits(5.75));
equal(f575.significand, '1.01110000000000000000000');
equal(f575.exponent, 2);
const t025 = core.floatParts('0.025', 32, 'truncate');
const n025 = core.floatParts('0.025', 32, 'nearest');
equal(t025.bits, '00111100110011001100110011001100');
equal(n025.bits, '00111100110011001100110011001101');
equal(n025.bits, float32Bits(0.025));
equal(core.floatParts('3.125', 16).bits, '0100001001000000');
equal(core.floatParts('-3.125', 16).bits, '1100001001000000');

// 同距離では末尾ビットが偶数になる側を選ぶ。桁上がり、最小のサブノーマル、あふれも独立した既知パターンで確かめる。
equal(core.floatParts('1.00048828125', 16, 'nearest').bits, '0011110000000000'); // 1 + 2^-11
equal(core.floatParts('1.00146484375', 16, 'nearest').bits, '0011110000000010'); // 1 + 3*2^-11
equal(core.floatParts('1.99951171875', 16, 'nearest').bits, '0100000000000000');
equal(core.floatParts('0.00000006', 16).bits, '0000000000000001');
equal(core.floatParts('0.00000001', 16).kind, 'zero');
equal(core.floatParts('0.0000001', 16).bits, '0000000000000010');
equal(core.floatParts('70000', 16).kind, 'infinity');
equal(core.floatParts('-70000', 16).bits, '1111110000000000');

for (const raw of ['1.1', '0.1', '-0.025', '123.456']) {
  const value = Number(raw);
  equal(core.floatParts(raw, 32).bits, float32Bits(value));
}
const decoded = core.decodeFloat('01000000101110000000000000000000', 32);
equal(decoded, { value: 5.75, kind: 'normal', sign: 0, storedExponent: 129, exponent: 2, fractionBits: '01110000000000000000000' });
equal(core.decodeFloat('0000000000000001', 16), { value: 2 ** -24, kind: 'subnormal', sign: 0, storedExponent: 0, exponent: -14, fractionBits: '0000000001' });
equal(core.decodeFloat('1111110000000000', 16).value, -Infinity);
equal(core.decodeFloat('0111110000000001', 16).kind, 'nan');
throws(() => core.floatParts('1', 64));
throws(() => core.floatParts('bad'), TypeError);
throws(() => core.decodeFloat('0101', 16));

close(core.floatParts('0.5', 32).value, 0.5);
console.log(`digital-real-core: ${checks}件の検証に合格（正確な10進入力、固定小数点、IEEE丸め・境界）`);
