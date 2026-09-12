import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const commonJsCore = require('../js/output-core.js');
const runtime = {};
vm.runInNewContext(await readFile(new URL('../js/output-core.js', import.meta.url), 'utf8'), runtime);
const core = runtime.OutputCore;
let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks += 1; };
const jsonEqual = (actual, expected) => equal(JSON.stringify(actual), JSON.stringify(expected));

equal(Object.isFrozen(core), true);
equal(typeof commonJsCore.screenPixels, 'function');
equal(commonJsCore.screenPixels(64, 20), 1280);

// 原本70枚目: 64 ppiで幅20インチなら、横方向に1280画素が並ぶ。
equal(core.screenPixels(64, 20), 1280);
equal(core.screenPixels(10, 0.1), 1);

// 原本72枚目: 300 dpiなら、1インチ四方は300×300ドット。
jsonEqual(core.dotGrid(300), { perSide: 300, total: 90000 });
equal(core.dotGrid(600).perSide / core.dotGrid(300).perSide, 2);
equal(core.dotGrid(600).total / core.dotGrid(300).total, 4);

// 原本73枚目: 400 dpi、101.6 mm×76.2 mm、余白なし・拡大縮小なし。
jsonEqual(core.printPixels(101.6, 76.2, 400), { width: 1600, height: 1200, total: 1920000 });
jsonEqual(core.printPixels(25.4, 25.4, 300), { width: 300, height: 300, total: 90000 });

// 原本71枚目: t=0から0.1秒間の表示。フレーム番号は1始まり。
jsonEqual(core.refreshFrames(60, 30), {
  sourceCount: 6,
  updateCount: 3,
  frames: [
    { update: 1, time: 0, frame: 1 },
    { update: 2, time: 1 / 30, frame: 3 },
    { update: 3, time: 2 / 30, frame: 5 }
  ],
  uniqueCount: 3
});
jsonEqual(core.refreshFrames(30, 60).frames.map(entry => entry.frame), [1, 1, 2, 2, 3, 3]);
jsonEqual(core.refreshFrames(60, 120).frames.map(entry => entry.frame), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
equal(core.refreshFrames(60, 120).uniqueCount, 6);
equal(core.refreshFrames(24, 60, 0.5).frames.at(-1).frame, 12);

for (const action of [
  () => core.screenPixels(64, 1 / 3),
  () => core.screenPixels(0, 20),
  () => core.dotGrid(300.5),
  () => core.dotGrid(Infinity),
  () => core.printPixels(0, 76.2, 400),
  () => core.printPixels(101.6, NaN, 400),
  () => core.refreshFrames(60.5, 30),
  () => core.refreshFrames(60, 0),
  () => core.refreshFrames(60, 30, 0.11),
  () => core.refreshFrames(60, 30, Infinity)
]) {
  assert.throws(action); checks += 1;
}

console.log(`output-core: ${checks}件の検証に合格（原本のppi・dpi・印刷問題、更新間引き、境界、CommonJS）`);
