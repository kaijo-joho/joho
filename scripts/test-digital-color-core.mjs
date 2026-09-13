import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../js/digital-color-core.js');
let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; }
function throws(operation, error, message) { assert.throws(operation, error, message); checks += 1; }

// CommonJSとブラウザの両方から同じDOMなしAPIを利用できる。
const browser = {};
vm.runInNewContext(await readFile(new URL('../js/digital-color-core.js', import.meta.url), 'utf8'), browser);
equal(typeof browser.DigitalColorCore, 'object', 'ブラウザのグローバルAPI');
equal(Object.isFrozen(core), true, 'APIは固定する');

// 原稿で扱うRGB値・16進カラーコード。
equal(core.rgb(47, 82, 130), {
  channels: [47, 82, 130], hex: '#2F5282', bits: ['00101111', '01010010', '10000010'],
  hexParts: ['2F', '52', '82'], css: 'rgb(47, 82, 130)'
}, '青の原稿例（139ではなく130）');
equal(core.rgb(114, 199, 111).hex, '#72C76F', '緑の原稿例');
equal(core.parseHex('#CA3127').channels, [202, 49, 39], '16進カラーコードの原稿例');
equal(core.parseHex(' ｃａ３１２７ ').hex, '#CA3127', '全角英数字を正規化する');
for (const [raw, value] of [['0', 0], ['255', 255], [' ００４２ ', 42]]) equal(core.parseChannel(raw), value, `RGB値 ${raw}`);

// 8bit各値をRGB→16進→RGBで復元できる。
for (let value = 0; value <= 255; value += 1) {
  const color = core.rgb(value, value, value);
  equal(core.parseHex(color.hex).channels, [value, value, value], `${value}の16進往復`);
}

// 段階数と色数は1チャネルとRGB全体を区別する。
equal(core.depth(4), { bitsPerChannel: 4, levels: 16, totalBits: 12, colors: 4096 }, '4bitは各色16段階・全体4096色');
equal(core.depth(8), { bitsPerChannel: 8, levels: 256, totalBits: 24, colors: 16777216 }, '8bitは各色256段階・全体16777216色');

// コード値の等間隔量子化。両端を保ち、8bitでは恒等変換になる。
equal(core.quantize(0, 4), { index: 0, value: 0, bits: '0000' }, '量子化の下端');
equal(core.quantize(255, 4), { index: 15, value: 255, bits: '1111' }, '量子化の上端');
equal(core.quantize(127, 4), { index: 7, value: 119, bits: '0111' }, '中間の4bit量子化');
for (let value = 0; value <= 255; value += 1) equal(core.quantize(value, 8), { index: value, value, bits: value.toString(2).padStart(8, '0') }, `${value}の8bit恒等量子化`);

// RGB加法混色とCMY減法混色の全8通り。
const primaryNames = ['R', 'G', 'B'];
for (let mask = 0; mask < 8; mask += 1) {
  const switches = primaryNames.map((_, index) => Boolean(mask & (1 << (2 - index))));
  equal(core.mixAdditive(switches).channels, switches.map(on => on ? 255 : 0), `加法混色 ${mask}`);
  equal(core.mixSubtractive(switches).channels, switches.map(on => on ? 0 : 255), `減法混色 ${mask}`);
}

for (const [channels, name] of [
  [[0, 0, 0], '黒'], [[255, 255, 255], '白'], [[255, 0, 0], '赤'], [[0, 255, 0], '緑'],
  [[0, 0, 255], '青'], [[255, 255, 0], '黄'], [[0, 255, 255], 'シアン'], [[255, 0, 255], 'マゼンタ'],
  [[128, 128, 128], '灰色']
]) equal(core.basicName(channels), name, `${name}の基本色名`);
equal(core.basicName([47, 82, 130]), null, '基本8色以外は色名を決めない');

for (const raw of ['', ' ', '256', '-1', '+1', '1.0', '1e2', '0x10', '1 2', '１２ ３', null, 12]) equal(core.parseChannel(raw), null, `不正なチャンネル入力 ${String(raw)}`);
for (const raw of ['', '#', '#ABC', '#12345678', '12345', '#12 3456', '#GG0000', '0x112233', null, 123456]) equal(core.parseHex(raw), null, `不正な16進カラーコード ${String(raw)}`);

for (const operation of [
  () => core.rgb('0', 0, 0), () => core.quantize(0.5, 4), () => core.depth('4'),
  () => core.mixAdditive([true, false]), () => core.mixSubtractive([true, 0, false]), () => core.basicName([0, 0])
]) throws(operation, TypeError, '型・形状が不正な引数');
for (const operation of [
  () => core.rgb(-1, 0, 0), () => core.quantize(256, 4), () => core.depth(0),
  () => core.depth(9), () => core.basicName([0, 0, 256])
]) throws(operation, RangeError, '範囲外の引数');

console.log(`digital-color-core: ${checks}件の検証に合格（RGB、16進数、量子化、混色、入力検証）`);
