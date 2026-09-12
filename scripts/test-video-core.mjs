import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const runtime = {};
vm.runInNewContext(await readFile(new URL('../js/video-core.js', import.meta.url), 'utf8'), runtime);
const core = runtime.VideoCore;
let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks += 1; };

equal(Object.isFrozen(core), true);

// 原本「情報_授業スライド_03デジタル.pptm」61枚目: 1 MB/frame, 24 fps, 1.5 GB (1 GB = 1024 MB)。
const binaryMegabyte = 1024 ** 2;
equal(core.playbackSeconds(1.5 * 1024 * binaryMegabyte, binaryMegabyte, 24), 64);

// 同じ原本: 800 × 600画素・24 bitの1枚を1000進で換算し、30 fpsで60秒再生する。
const frameBytes = 800 * 600 * 24 / 8;
equal(frameBytes / 1000 ** 2, 1.44);
equal(JSON.stringify(core.videoSize(frameBytes, 30, 60)), JSON.stringify({
  frames: 1800,
  bytes: 2592000000,
  kilobytes: 2592000,
  megabytes: 2592
}));

// 同じ2秒の移動はfpsを増やしても同じ時刻を示す。フレーム数だけが増える。
equal(core.frameCount(12, 2), 24);
equal(core.frameCount(24, 2), 48);
equal(core.frameAt(0.5, 12, 2), 6);
equal(core.frameAt(0.5, 24, 2), 12);
equal(core.frameAt(0.5, 12, 2) / 12, core.frameAt(0.5, 24, 2) / 24);

// ループの始点・終点と、二進浮動小数点でずれるフレーム境界を確認する。
equal(core.frameAt(0, 24, 2), 0);
equal(core.frameAt(2, 24, 2), 0);
equal(core.frameAt(4, 24, 2), 0);
equal(core.frameAt(1 / 24, 24, 2), 1);
equal(core.frameAt(0.1 + 0.2, 30, 2), 9);
equal(core.frameAt(1 / 24 - 1e-8, 24, 2), 0);
equal(core.frameAt(47 / 24, 24, 2), 47);

for (const action of [
  () => core.frameCount(24, 1.1),
  () => core.frameCount(0, 2),
  () => core.frameCount(24, Infinity),
  () => core.frameAt(-0.01, 24, 2),
  () => core.frameAt(1, 24.5, 2),
  () => core.videoSize(0, 24, 2),
  () => core.videoSize(Infinity, 24, 2),
  () => core.videoSize(1000, 24, 2, 999),
  () => core.playbackSeconds(-1, 1000, 24),
  () => core.playbackSeconds(1000, 0, 24),
  () => core.playbackSeconds(1000, 1000, NaN)
]) {
  assert.throws(action); checks += 1;
}

console.log(`video-core: ${checks}件の検証に合格（原本2問、fpsと時間の対応、ループ境界、無効引数）`);
