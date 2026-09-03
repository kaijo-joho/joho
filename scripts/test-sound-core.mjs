import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SoundCore = require('../js/sound-core.js');
let checks = 0;

function equal(actual, expected, message) {
  checks += 1;
  assert.equal(actual, expected, message);
}

function deepEqual(actual, expected, message) {
  checks += 1;
  assert.deepEqual(actual, expected, message);
}

function close(actual, expected, message, tolerance = 1e-9) {
  checks += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`);
}

function throws(operation, matcher, message) {
  checks += 1;
  assert.throws(operation, matcher, message);
}

// 標本化と波形計算
close(SoundCore.samplingPeriod(10), 0.1, '10Hzの標本化周期は0.1秒');
close(SoundCore.samplingPeriod(5), 0.2, '5Hzの標本化周期は0.2秒');
close(SoundCore.sineValue({ amplitude: 3, frequency: 2, phase: Math.PI / 2, offset: 4 }, 0), 7, '正弦波の振幅・位相・中心値');
close(SoundCore.sumSineWaves([
  { amplitude: 2, frequency: 1, phase: Math.PI / 2 },
  { amplitude: 1, frequency: 2, phase: Math.PI / 2 }
], 0), 3, '正弦波の重ね合わせ');
equal(SoundCore.sampleCount(0, 1.5, 10), 16, '0〜1.5秒を10Hzで端点込みなら16標本');
const sampled = SoundCore.sampleSignal(t => t * 2, { start: 0, end: 0.3, sampleRate: 10 });
equal(sampled.length, 4, '標本列の長さ');
close(sampled[3].value, 0.6, '指定時刻の波形値を標本化');

// 量子化：授業の基本範囲は0以上8未満。
equal(SoundCore.quantizationLevels(3), 8, '3bitは8段階');
equal(SoundCore.quantizationLevels(4), 16, '4bitは16段階');
close(SoundCore.quantizationWidth(3), 1, '3bit・範囲8の量子化幅は1');
close(SoundCore.quantizationWidth(4), 0.5, '4bit・範囲8の量子化幅は0.5');
equal(SoundCore.quantize(2, { bitDepth: 3 }).code, 2, '3bitで2は番号2');
equal(SoundCore.quantize(2.49, { bitDepth: 3 }).code, 2, '境界直前は下側');
equal(SoundCore.quantize(2.5, { bitDepth: 3 }).code, 3, 'ちょうど中間は上側へ丸める');
equal(SoundCore.quantize(2.51, { bitDepth: 3 }).code, 3, '境界直後は上側');
equal(SoundCore.quantize(0, { bitDepth: 3 }).code, 0, '最小値');
equal(SoundCore.quantize(-0.2, { bitDepth: 3 }).code, 0, '最小値未満をクリップ');
equal(SoundCore.quantize(-0.2, { bitDepth: 3 }).clipped, true, '下側クリッピングを記録');
equal(SoundCore.quantize(7.49, { bitDepth: 3 }).code, 7, '最大段階付近');
equal(SoundCore.quantize(7.5, { bitDepth: 3 }).code, 7, '上端の中間は最大番号へ飽和');
equal(SoundCore.quantize(8, { bitDepth: 3 }).code, 7, '範囲上端を最大番号へクリップ');
equal(SoundCore.quantize(8, { bitDepth: 3 }).clipped, true, '上側クリッピングを記録');
equal(SoundCore.quantize(99, { bitDepth: 4 }).code, 15, '大きな範囲外値を最大番号へクリップ');

// PDF掲載の符号化例。
equal(SoundCore.fixedBitString(2, 3), '010', 'PDF例：3bitで2→010');
equal(SoundCore.quantizeAndEncode(2, { bitDepth: 4 }).binary, '0100', 'PDF例：4bitで2→0100');
equal(SoundCore.quantizeAndEncode(6, { bitDepth: 4 }).binary, '1100', 'PDF例：4bitで6→1100');
const lessonCodes = SoundCore.deriveDigitizationAnswers(SoundCore.LESSON_SAMPLE_VALUES, {
  sampleRate: 10,
  bitDepth: 3
}).map(answer => answer.binary);
deepEqual(lessonCodes, [
  '010', '011', '101', '011', '001', '100', '111', '101',
  '011', '101', '110', '011', '000', '010', '100', '010'
], 'PDFの16標本の3bit符号列');
deepEqual(
  SoundCore.deriveDigitizationAnswers([4, 12, 12, 2], {
    sampleRate: 5,
    bitDepth: 4,
    range: { min: 0, max: 16 }
  }).map(answer => answer.binary),
  ['0100', '1100', '1100', '0010'],
  'PDF演習の4bit符号列'
);
throws(() => SoundCore.fixedBitString(8, 3), RangeError, '固定長を超える番号は拒否');

// 音声データ量と単位換算。PDFで混在する1000/1024を明示して検証する。
equal(SoundCore.audioDataSize({ sampleRate: 200, seconds: 60, bitDepth: 4, channels: 1 }).bytes, 6000, 'PDF例：6000B');
equal(SoundCore.audioDataSize({ sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1 }).bytes, 81920, 'PDF例：81920B');
close(SoundCore.convertBytes(81920, 'KB', 1024), 80, 'PDF演習：この問題では1024倍で80KB');
const cdOneSecond = SoundCore.audioDataSize({ sampleRate: 44100, seconds: 1, bitDepth: 16, channels: 2 });
equal(cdOneSecond.bytes, 176400, 'CD音質1秒は176400B');
close(SoundCore.convertBytes(cdOneSecond.bytes, 'KB', 1000), 176.4, 'PDF説明：1KB=1000Bなら176.4KB');
const cdFull = SoundCore.audioDataSize({ sampleRate: 44100, seconds: 74 * 60 + 42, bitDepth: 16, channels: 2 });
equal(cdFull.bytes, 790624800, 'PDF演習：CD 74分42秒');
close(SoundCore.convertBytes(cdFull.bytes, 'MB', 1024), 753.9985656738281, 'PDF演習：1024倍換算で約754MB');
const highResolution = SoundCore.audioDataSize({ sampleRate: 192000, seconds: 256, bitDepth: 24, channels: 2 });
equal(highResolution.bytes, 294912000, 'PDF演習：ハイレゾ256秒のバイト数');
close(SoundCore.convertBytes(highResolution.bytes, 'MB', 1024), 281.25, 'PDF演習：1024倍換算で281.25MB');
equal(SoundCore.requiredBitsForLevels(16), 4, '16段階に必要なビット数');
equal(SoundCore.requiredBitsForLevels(17), 5, '17段階に必要なビット数');

// 標本化定理とエイリアス候補。
equal(SoundCore.samplingTheoremState(4, 10).state, 'sufficient', 'fs > 2f');
equal(SoundCore.samplingTheoremState(5, 10).state, 'boundary', 'fs = 2f');
equal(SoundCore.samplingTheoremState(6, 10).state, 'insufficient', 'fs < 2f');
const alias = SoundCore.aliasCandidate({ frequency: 7, sampleRate: 10, phase: 0.3 });
close(alias.frequency, 3, '7Hzを10Hzで標本化すると3Hz候補');
for (let index = 0; index < 6; index += 1) {
  close(
    SoundCore.sineValue({ amplitude: 2, frequency: 7, phase: 0.3, offset: 4 }, index / 10),
    SoundCore.sineValue({ amplitude: alias.amplitude * 2, frequency: alias.frequency, phase: alias.phase, offset: 4 }, index / 10),
    `元波と別候補の標本${index}が一致`,
    1e-8
  );
}
equal(SoundCore.aliasCandidate({ frequency: 5, sampleRate: 10, phase: 0 }).kind, 'boundary-flat', '境界かつ零交差位相では平らな別候補');
const boundaryAlias = SoundCore.aliasCandidate({ frequency: 5, sampleRate: 10, amplitude: 2, phase: Math.PI / 2 });
equal(boundaryAlias.kind, 'boundary-phase', '境界かつ山から始まる位相にも異なる候補を作る');
equal(boundaryAlias.amplitude === 2 && boundaryAlias.phase === Math.PI / 2, false, '境界候補は元波形そのものにしない');
for (let index = 0; index < 5; index += 1) {
  close(
    SoundCore.sineValue({ amplitude: 2, frequency: 5, phase: Math.PI / 2 }, index / 10),
    SoundCore.sineValue(boundaryAlias, index / 10),
    `境界の別候補も標本${index}で一致`,
    1e-8
  );
}

// 格子値を先に決める問題波形は、標本時刻で必ず正解値を通る。
const gridValues = [2, 5, 1, 6, 3];
gridValues.forEach((value, index) => close(
  SoundCore.gridWaveValue(gridValues, index * 0.2, { interval: 0.2 }),
  value,
  `滑らかな問題波形が格子点${index}を通る`
));
close(SoundCore.lessonWaveValue(0, { frequency: 0.625 }), 2, '授業波形の先頭値');
close(SoundCore.lessonWaveValue(0.1, { frequency: 0.625 }), 3, '授業波形の2番目の値');

const randomA = SoundCore.createSeededRandom('class-a');
const randomB = SoundCore.createSeededRandom('class-a');
deepEqual([randomA(), randomA(), randomA()], [randomB(), randomB(), randomB()], '同じシードで同じ問題列');
const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
for (let index = 0; index < 20; index += 1) {
  equal(SoundCore.chooseWithoutImmediateRepeat(pool, 'b', randomA).id === 'b', false, '直前と同じ問題を避ける');
}

console.log(`sound-core: ${checks}件の検証に合格`);
