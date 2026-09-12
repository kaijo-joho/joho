import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const core = require('../js/digital-basics-core.js');
let checks = 0;
function equal(actual, expected) { assert.equal(actual, expected); checks += 1; }
function throws(fn) { assert.throws(fn); checks += 1; }
const browser = {};
vm.runInNewContext(await readFile(new URL('../js/digital-basics-core.js', import.meta.url), 'utf8'), browser);
equal(browser.DigitalBasicsCore.requiredBits(120), 7);
equal(Object.isFrozen(core), true);

// 原本4・6枚目の答えを、固定値と照合する。
for (const [id, expected] of Object.entries({ count8: 256, need120: 7, count2bytes: 65536, need500: 9, ratio: 8192, gb4: 4096, pixels: 1.5, square: 4, power: 20, decimal: 4000 })) equal(core.expectedAnswer(id), expected);
// 必要数ちょうどで足りること、境界を1つ超えると次の桁が必要になること。
for (let bits = 1; bits <= 20; bits += 1) {
  const count = 2 ** bits;
  equal(core.requiredBits(count), bits);
  equal(core.requiredBits(count + 1), bits + 1);
  if (bits > 1) equal(core.requiredBits(count - 1), bits);
}
equal(core.requiredBits(1), 0);
for (let bits = 1; bits <= 8; bits += 1) {
  const patterns = core.binaryPatterns(bits);
  equal(new Set(patterns).size, 2 ** bits);
  equal(patterns[0], '0'.repeat(bits)); equal(patterns.at(-1), '1'.repeat(bits));
  equal(patterns.every(value => value.length === bits && /^[01]+$/.test(value)), true);
}
for (const [value, step, expected] of [[5.3, 1, 5], [5.3, .1, 5.3], [5.5, 1, 6], [5.35, .1, 5.4], [0, 2, 0], [10, 2, 10], [4.999, 2, 4]]) equal(core.quantizeLength(value, step), expected);
for (const base of [1000, 1024]) {
  equal(core.convert(8, 'bit', 'B', base), 1);
  equal(core.convert(1, 'B', 'bit', base), 8);
  equal(core.convert(1, 'MB', 'B', base), base * base);
  equal(core.convert(base, 'KB', 'MB', base), 1);
  equal(core.convert(0, 'TB', 'bit', base), 0);
}
for (const [value, expected] of [['６５，５３６', 65536], [' 1.5 ', 1.5], ['0', 0], ['', null], [' ', null], ['1,5', null], ['1e3', null], ['0x10', null], ['Infinity', null], ['−1', null], ['12,34,567', null], ['256通り', null]]) equal(core.parseAnswer(value), expected);
for (const fn of [() => core.combinations(-1), () => core.combinations(1.5), () => core.requiredBits(0), () => core.requiredBits(NaN), () => core.binaryPatterns(9), () => core.quantizeLength(11, 1), () => core.quantizeLength(5, 3), () => core.convert(Infinity, 'B', 'KB'), () => core.convert(4, 'GB', 'MB', 100), () => core.convert(4, 'invalid', 'B'), () => core.expectedAnswer('unknown')]) throws(fn);
console.log(`digital-basics-core: ${checks}件の検証に合格（原本例題、桁の境界、単位換算、入力検証）`);
