import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const runtime = {};
vm.runInNewContext(await readFile(new URL('../js/image-core.js', import.meta.url), 'utf8'), runtime);
const core = runtime.ImageCore;
let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks += 1; };

// 原本「情報_授業スライド_03デジタル.pptm」56枚目の16画素。
const codes = [6, 5, 4, 3, 5, 4, 3, 2, 4, 3, 2, 1, 3, 2, 1, 0];
const binary = ['110', '101', '100', '011', '101', '100', '011', '010', '100', '011', '010', '001', '011', '010', '001', '000'];
for (const [index, sample] of core.grayscaleExample().entries()) {
  equal(sample.code, codes[index]); equal(sample.binary, binary[index]);
}
equal(core.quantize(0, 3), 0);
equal(core.quantize(31.999, 3), 0);
equal(core.quantize(32, 3), 1);
equal(core.quantize(223.999, 3), 6);
equal(core.quantize(224, 3), 7);
equal(core.quantize(255, 3), 7);
equal(core.quantize(-1, 3), 0);
equal(core.quantize(256, 3), 7);
for (let value = 0; value < 256; value += 1) equal(core.tone(core.quantize(value, 8), 8), value);
equal(core.tone(0, 1), 0); equal(core.tone(1, 1), 255);
equal(core.binary(0, 3), '000'); equal(core.binary(1, 3), '001');
equal(core.levels(8), 256);

// 原本57枚目の2問。換算基準を暗黙に切り替えない。
equal(core.imageSize(4096, 3072, 24, 1024).megabytes, 36);
equal(core.imageSize(1000, 800, 15, 1000).megabytes, 1.5);
equal(core.imageSize(4, 4, 3).bytes, 6);
equal(core.imageSize(4096, 3072, 24, 1000).megabytes, 37.748736);
equal(core.imageSize(100, 100, 6).bytes / core.imageSize(50, 50, 6).bytes, 4);

// 画素の平均を取り、RGBを混同しない。端の画素も欠落させない。
const data = Uint8ClampedArray.from([0, 30, 60, 255, 100, 130, 160, 255, 200, 230, 240, 255]);
equal(JSON.stringify(core.sampleRgb(data, 3, 1, 1, 1)), '[[100,130,153.33333333333334]]');
equal(JSON.stringify(core.sampleRgb(data, 3, 1, 2, 1)), '[[0,30,60],[150,180,200]]');
for (const action of [() => core.levels(0), () => core.levels(9), () => core.binary(8, 3), () => core.quantize(NaN, 3), () => core.imageSize(0, 4, 3), () => core.imageSize(4, 4, 3, 999), () => core.sampleRgb(data, 3, 1, 4, 1)]) {
  assert.throws(action); checks += 1;
}
console.log(`image-core: ${checks}件の検証に合格（原本の16画素・2問、量子化境界、RGB平均、単位換算）`);
