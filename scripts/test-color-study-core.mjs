import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../js/color-study-core.js');
let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; }
for (const [h, rgb] of [[0,[255,0,0]], [30,[255,128,0]], [60,[255,255,0]], [90,[128,255,0]], [120,[0,255,0]], [180,[0,255,255]], [240,[0,0,255]], [300,[255,0,255]]]) {
  equal(core.hslToRgb(h, 100, 50), rgb, `RGB環の色相${h}`);
  equal(core.hslToRgb(h + 360, 100, 50), rgb, '色相1周の周期');
  equal(core.hslToRgb(h - 360, 100, 50), rgb, '負の色相の正規化');
  equal(core.hslToRgb(h, 0, 50), [128,128,128], '彩度0は色相に依存しない');
  equal(core.hslToRgb(h, 100, 0), [0,0,0], '明度0は黒');
  equal(core.hslToRgb(h, 100, 100), [255,255,255], '明度100は白');
}
equal(core.hslToRgb(0, 50, 50), [191,64,64], '中間彩度を8bitへ四捨五入');
equal(core.hslToRgb(210, 50, 50), [64,128,191], '3成分の異なる中間色');
equal(core.toHex([64,128,191]), '#4080BF', '既存のRGB変換とHEXを共用');
equal(core.readableText([255,255,0]), '#000000', '黄色の見出しは黒');
equal(core.readableText([0,0,255]), '#FFFFFF', '青色の見出しは白');
equal(core.readableText([0,0,0]), '#FFFFFF', '黒地には白');
equal(core.readableText([255,255,255]), '#000000', '白地には黒');
for (const operation of [() => core.hslToRgb(NaN,100,50), () => core.hslToRgb('0',100,50), () => core.hslToRgb(0,Infinity,50), () => core.toHex([0,0]), () => core.readableText([0,0,'0'])]) {
  assert.throws(operation, TypeError); checks += 1;
}
for (const operation of [() => core.hslToRgb(0,-1,50), () => core.hslToRgb(0,100,101), () => core.toHex([0,256,0])]) {
  assert.throws(operation, RangeError); checks += 1;
}
console.log(`color-study-core: ${checks}件の検証に合格`);
