import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../js/digital-text-core.js');
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks += 1; }
function throws(fn, type) { assert.throws(fn, type); checks += 1; }

const browser = { TextEncoder, TextDecoder };
vm.runInNewContext(await readFile(new URL('../js/digital-text-core.js', import.meta.url), 'utf8'), browser);
equal(typeof browser.DigitalTextCore, 'object');
equal(Object.isFrozen(browser.DigitalTextCore), true);
equal(Object.keys(core).sort(), ['asciiEntry', 'decodeAscii', 'decodeBytes', 'encodeAscii', 'parseBytes', 'utf8']);

for (let code = 0; code < 128; code += 1) {
  const entry = core.asciiEntry(code);
  equal(entry.code, code);
  equal(entry.character.charCodeAt(0), code);
  equal(entry.hex, code.toString(16).toUpperCase().padStart(2, '0'));
  equal(entry.bits, code.toString(2).padStart(8, '0'));
  equal(core.decodeAscii(entry.bits, 2).bytes, [code]);
}
equal(core.asciiEntry(0).label, 'NUL');
equal(core.asciiEntry(0).name, 'ヌル（値0）');
equal(core.asciiEntry(9).name, '水平タブ');
equal(core.asciiEntry(10).name, '改行');
equal(core.asciiEntry(13).name, '行頭復帰');
equal(core.asciiEntry(32).label, 'SP');
equal(core.asciiEntry(0x5C).character, '\\');
equal(core.asciiEntry(0x7E).character, '~');

for (const [text, hex] of [['Kaijo', '4B 61 69 6A 6F'], ['JohO', '4A 6F 68 4F'], ['JIScode', '4A 49 53 63 6F 64 65']]) {
  equal(core.encodeAscii(text).hex, hex);
  equal(core.decodeAscii(hex, 16).text, text);
}
equal(core.parseBytes(' ０１０００００１\n０１００００１０ ', 2), [65, 66]);
equal(core.parseBytes(' Ｅ６ ９７\tＡ５ ', 16), [230, 151, 165]);
for (const raw of ['', '0101', '0000000x', 'ABC', 'GG', '0x41']) equal(core.parseBytes(raw, raw === 'ABC' || raw === 'GG' || raw === '0x41' ? 16 : 2), null);
equal(core.decodeAscii('10000000', 2), null);
throws(() => core.asciiEntry(128), RangeError);
throws(() => core.encodeAscii('あ'), RangeError);
throws(() => core.parseBytes([], 2), TypeError);
throws(() => core.parseBytes('00000000', 10), RangeError);

equal(core.utf8('A').entries[0].byteLength, 1);
equal(core.utf8('あ').entries[0].byteLength, 3);
equal(core.utf8('😀').entries[0].byteLength, 4);
equal(core.utf8('Aあ').byteLength, 4);
equal(core.utf8('e\u0301').codePointCount, 2);
equal(core.utf8('\u0085').entries[0].label, '制御文字 (U+0085)');
throws(() => core.utf8('\uD800'), RangeError);
throws(() => core.utf8('\uDC00'), RangeError);
const xss = '<img src=x onerror=alert(1)>';
equal(core.utf8(xss).text, xss);
equal(core.encodeAscii(xss).text, xss);

equal(core.decodeBytes([0xE6, 0x97, 0xA5, 0xE6, 0x9C, 0xAC], 'utf-8'), { ok: true, text: '日本' });
equal(core.decodeBytes([0x93, 0xFA, 0x96, 0x7B], 'shift_jis'), { ok: true, text: '日本' });
equal(core.decodeBytes([0x1B, 0x24, 0x42, 0x46, 0x7C, 0x4B, 0x5C, 0x1B, 0x28, 0x42], 'iso-2022-jp'), { ok: true, text: '日本' });
equal(core.decodeBytes([0xE6, 0x97], 'utf-8').ok, false);
throws(() => core.decodeBytes([256], 'utf-8'), RangeError);
throws(() => core.decodeBytes([1], 'utf16'), RangeError);

console.log(`digital-text-core: ${checks}件の検証に合格（ASCII、UTF-8、文字コード復号）`);
