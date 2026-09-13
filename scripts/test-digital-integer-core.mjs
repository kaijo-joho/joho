import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../js/digital-integer-core.js');
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks += 1; }
function throws(fn) { assert.throws(fn, RangeError); checks += 1; }

const browser = {};
vm.runInNewContext(await readFile(new URL('../js/digital-integer-core.js', import.meta.url), 'utf8'), browser);
equal(typeof browser.DigitalIntegerCore, 'object');
equal(Object.isFrozen(browser.DigitalIntegerCore), true);
equal(Object.keys(core).sort(), ['arithmetic', 'complement', 'decode', 'encode', 'formatUnsigned', 'normalizeBits', 'parseInteger', 'range']);

// 授業で使う4・6・8ビットの符号付き整数の範囲。
equal(core.range(4), { min: -8, max: 7, unsignedMax: 15, size: 16 });
equal(core.range(6), { min: -32, max: 31, unsignedMax: 63, size: 64 });
equal(core.range(8), { min: -128, max: 127, unsignedMax: 255, size: 256 });

// 原稿の補数例と、演習で扱う正数の固定答え。
equal(core.complement('0110', 4), { original: '0110', ones: '1001', twos: '1010', carry: false });
equal(core.complement('00100101', 8), { original: '00100101', ones: '11011010', twos: '11011011', carry: false });
for (const [value, width, original, ones, twos] of [
  [2, 4, '0010', '1101', '1110'],
  [4, 4, '0100', '1011', '1100'],
  [5, 4, '0101', '1010', '1011'],
  [7, 4, '0111', '1000', '1001'],
  [50, 8, '00110010', '11001101', '11001110'],
  [85, 8, '01010101', '10101010', '10101011'],
  [127, 8, '01111111', '10000000', '10000001'],
  [17, 8, '00010001', '11101110', '11101111']
]) {
  equal(core.encode(value, width), original);
  equal(core.complement(original, width), { original, ones, twos, carry: false });
  equal(core.decode(twos, width), -value);
}

// 0と最小値は、2の補数の循環と符号付き読取りを分けて確認する。
equal(core.encode(0, 4), '0000');
equal(core.decode('0000', 4), 0);
equal(core.complement('0000', 4), { original: '0000', ones: '1111', twos: '0000', carry: true });
equal(core.encode(-8, 4), '1000');
equal(core.decode('1000', 4), -8);
equal(core.complement('1000', 4), { original: '1000', ones: '0111', twos: '1000', carry: false });
equal(core.encode(-32, 6), '100000');
equal(core.encode(-128, 8), '10000000');
equal(core.formatUnsigned(0, 6), '000000');
equal(core.formatUnsigned(63, 6), '111111');

// 桁あふれと符号付きの範囲外は別の概念として扱う。
equal(core.arithmetic(6, -6, 4, 'add'), {
  leftBits: '0110', rightBits: '1010', operandBits: '1010', fullBits: '10000', bits: '0000', decoded: 0, expected: 0, carry: true, overflow: false
});
equal(core.arithmetic(7, 1, 4, 'add'), {
  leftBits: '0111', rightBits: '0001', operandBits: '0001', fullBits: '01000', bits: '1000', decoded: -8, expected: 8, carry: false, overflow: true
});
equal(core.arithmetic(-8, 1, 4, 'subtract'), {
  leftBits: '1000', rightBits: '0001', operandBits: '1111', fullBits: '10111', bits: '0111', decoded: 7, expected: -9, carry: true, overflow: true
});
equal(core.arithmetic(-8, -1, 4, 'subtract'), {
  leftBits: '1000', rightBits: '1111', operandBits: '0001', fullBits: '01001', bits: '1001', decoded: -7, expected: -7, carry: false, overflow: false
});
equal(core.arithmetic(-8, -8, 4, 'subtract'), {
  leftBits: '1000', rightBits: '1000', operandBits: '1000', fullBits: '10000', bits: '0000', decoded: 0, expected: 0, carry: true, overflow: false
});
equal(core.arithmetic(7, -8, 4, 'subtract'), {
  leftBits: '0111', rightBits: '1000', operandBits: '1000', fullBits: '01111', bits: '1111', decoded: -1, expected: 15, carry: false, overflow: true
});

// 数値入力は全角を統一し、正しい3桁区切りと先頭の符号だけを許可する。
for (const [raw, expected] of [
  [' １２,３４５ ', 12345], ['＋１２', 12], ['−１２', -12], ['ー１２', -12], ['-0', 0], ['000123', 123]
]) equal(core.parseInteger(raw), expected);
for (const raw of ['', ' ', '+', '-', '1,23', '12,34,567', '1,2345', '1.0', '.1', '1e3', '0x10', '1 2', '--1', '+-1', '９９９９９９９９９９９９９９９９９']) equal(core.parseInteger(raw), null);

equal(core.normalizeBits(' ０ １ １ ０ ', 4), '0110');
equal(core.normalizeBits('１\n０\t１\r０', 4), '1010');
for (const raw of ['', '010', '01010', '0120', '0b10', '-010', 10]) equal(core.normalizeBits(raw, 4), null);

for (const fn of [
  () => core.range(5), () => core.normalizeBits('0000', 5), () => core.formatUnsigned(-1, 4), () => core.formatUnsigned(16, 4),
  () => core.encode(8, 4), () => core.encode(-9, 4), () => core.decode('010', 4), () => core.complement('0102', 4),
  () => core.arithmetic(8, 0, 4, 'add'), () => core.arithmetic(0, -9, 4, 'add'), () => core.arithmetic(0, 0, 4, 'multiply')
]) throws(fn);

console.log(`digital-integer-core: ${checks}件の検証に合格（補数、範囲、演算、入力検証）`);
