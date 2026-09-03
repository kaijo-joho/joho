// 音のデジタル表現で使う計算を担うDOM非依存モジュール。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SoundCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPSILON = 1e-10;
  const DEFAULT_VOLTAGE_RANGE = Object.freeze({ min: 0, max: 8 });
  const LESSON_SAMPLE_VALUES = Object.freeze([2, 3, 5, 3, 1, 4, 7, 5, 3, 5, 6, 3, 0, 2, 4, 2]);

  function finiteNumber(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${name}は有限の数値で指定してください。`);
    return number;
  }

  function positiveNumber(value, name) {
    const number = finiteNumber(value, name);
    if (number <= 0) throw new RangeError(`${name}は0より大きい値で指定してください。`);
    return number;
  }

  function nonNegativeNumber(value, name) {
    const number = finiteNumber(value, name);
    if (number < 0) throw new RangeError(`${name}は0以上で指定してください。`);
    return number;
  }

  function positiveInteger(value, name) {
    const number = finiteNumber(value, name);
    if (!Number.isInteger(number) || number <= 0) {
      throw new RangeError(`${name}は正の整数で指定してください。`);
    }
    return number;
  }

  function normalizeRange(range = DEFAULT_VOLTAGE_RANGE) {
    const min = finiteNumber(range.min, '範囲の最小値');
    const max = finiteNumber(range.max, '範囲の最大値');
    if (max <= min) throw new RangeError('範囲の最大値は最小値より大きくしてください。');
    return { min, max };
  }

  function degreesToRadians(degrees) {
    return finiteNumber(degrees, '角度') * Math.PI / 180;
  }

  function sineValue(component, time) {
    const amplitude = finiteNumber(component?.amplitude ?? 1, '振幅');
    const frequency = nonNegativeNumber(component?.frequency ?? 1, '周波数');
    const phase = finiteNumber(component?.phase ?? 0, '位相');
    const offset = finiteNumber(component?.offset ?? 0, '中心値');
    const t = finiteNumber(time, '時刻');
    return offset + amplitude * Math.sin(2 * Math.PI * frequency * t + phase);
  }

  function sumSineWaves(components, time, offset = 0) {
    if (!Array.isArray(components) || components.length === 0) {
      throw new TypeError('1つ以上の正弦波成分を配列で指定してください。');
    }
    const base = finiteNumber(offset, '合成波の中心値');
    return components.reduce((sum, component) => {
      const normalized = { ...component, offset: 0 };
      return sum + sineValue(normalized, time);
    }, base);
  }

  function waveformPoints(valueAt, options = {}) {
    if (typeof valueAt !== 'function') throw new TypeError('波形値を返す関数を指定してください。');
    const start = finiteNumber(options.start ?? 0, '開始時刻');
    const end = finiteNumber(options.end ?? 1, '終了時刻');
    const count = positiveInteger(options.count ?? 401, '点の数');
    if (end <= start) throw new RangeError('終了時刻は開始時刻より後にしてください。');
    if (count < 2) throw new RangeError('波形の点は2個以上必要です。');
    const interval = (end - start) / (count - 1);
    return Array.from({ length: count }, (_, index) => {
      const time = index === count - 1 ? end : start + interval * index;
      return { time, value: finiteNumber(valueAt(time), '波形値') };
    });
  }

  function samplingPeriod(sampleRate) {
    return 1 / positiveNumber(sampleRate, '標本化周波数');
  }

  function sampleCount(start, end, sampleRate, includeEnd = true) {
    const from = finiteNumber(start, '開始時刻');
    const to = finiteNumber(end, '終了時刻');
    const rate = positiveNumber(sampleRate, '標本化周波数');
    if (to < from) throw new RangeError('終了時刻は開始時刻以降にしてください。');
    const intervals = Math.floor((to - from) * rate + EPSILON);
    return includeEnd ? intervals + 1 : intervals;
  }

  function sampleSignal(valueAt, options = {}) {
    if (typeof valueAt !== 'function') throw new TypeError('波形値を返す関数を指定してください。');
    const start = finiteNumber(options.start ?? 0, '開始時刻');
    const end = finiteNumber(options.end ?? 1, '終了時刻');
    const rate = positiveNumber(options.sampleRate, '標本化周波数');
    const includeEnd = options.includeEnd !== false;
    const count = sampleCount(start, end, rate, includeEnd);
    const period = 1 / rate;
    return Array.from({ length: count }, (_, index) => {
      const time = start + index * period;
      return {
        index,
        time,
        value: finiteNumber(valueAt(time), '標本値')
      };
    });
  }

  function quantizationLevels(bitDepth) {
    const bits = positiveInteger(bitDepth, '量子化ビット数');
    if (bits > 30) throw new RangeError('量子化ビット数は30bit以下で指定してください。');
    return 2 ** bits;
  }

  function quantizationWidth(bitDepth, range = DEFAULT_VOLTAGE_RANGE) {
    const normalized = normalizeRange(range);
    return (normalized.max - normalized.min) / quantizationLevels(bitDepth);
  }

  /*
   * 教材内の量子化規則：表現値は min + code × 幅 とする。
   * 最も近い表現値へ丸め、ちょうど中間なら上側（正方向）を選ぶ。
   * [min, max) の外側は、最小または最大の符号へクリッピングする。
   */
  function quantize(value, options = {}) {
    const input = finiteNumber(value, '量子化する値');
    const bitDepth = positiveInteger(options.bitDepth, '量子化ビット数');
    const range = normalizeRange(options.range);
    const levels = quantizationLevels(bitDepth);
    const width = (range.max - range.min) / levels;
    const unclippedCode = Math.floor((input - range.min) / width + 0.5 + EPSILON);
    const code = Math.min(levels - 1, Math.max(0, unclippedCode));
    const quantizedValue = range.min + code * width;
    return Object.freeze({
      input,
      bitDepth,
      range: Object.freeze(range),
      levels,
      width,
      code,
      quantizedValue,
      error: input - quantizedValue,
      clipped: input < range.min || input >= range.max,
      saturated: code !== unclippedCode
    });
  }

  function fixedBitString(value, bitDepth) {
    const bits = positiveInteger(bitDepth, 'ビット数');
    const number = finiteNumber(value, '符号化する値');
    const limit = quantizationLevels(bits);
    if (!Number.isInteger(number) || number < 0 || number >= limit) {
      throw new RangeError(`${bits}bitでは0〜${limit - 1}の整数を符号化できます。`);
    }
    return number.toString(2).padStart(bits, '0');
  }

  function quantizeAndEncode(value, options = {}) {
    const result = quantize(value, options);
    return Object.freeze({ ...result, binary: fixedBitString(result.code, result.bitDepth) });
  }

  function quantizeSamples(samples, options = {}) {
    if (!Array.isArray(samples)) throw new TypeError('標本の配列を指定してください。');
    return samples.map((sample, index) => ({
      ...sample,
      index: sample.index ?? index,
      ...quantizeAndEncode(sample.value, options)
    }));
  }

  function audioDataSize(options = {}) {
    const sampleRate = positiveNumber(options.sampleRate, '標本化周波数');
    const seconds = nonNegativeNumber(options.seconds, '時間');
    const bitDepth = positiveInteger(options.bitDepth, '量子化ビット数');
    const channels = positiveInteger(options.channels ?? 1, 'チャンネル数');
    const sampleFrames = sampleRate * seconds;
    const channelSamples = sampleFrames * channels;
    const bits = channelSamples * bitDepth;
    return Object.freeze({ sampleFrames, channelSamples, bits, bytes: bits / 8 });
  }

  const UNIT_POWERS = Object.freeze({ B: 0, KB: 1, MB: 2, GB: 3, KiB: 1, MiB: 2, GiB: 3 });

  function convertBytes(bytes, unit = 'B', base) {
    const value = nonNegativeNumber(bytes, 'バイト数');
    if (!Object.hasOwn(UNIT_POWERS, unit)) throw new RangeError(`未対応の単位「${unit}」です。`);
    const inferredBase = unit.includes('i') ? 1024 : 1000;
    const radix = base == null ? inferredBase : positiveInteger(base, '換算の基数');
    if (radix !== 1000 && radix !== 1024) throw new RangeError('換算の基数は1000または1024です。');
    return value / radix ** UNIT_POWERS[unit];
  }

  function requiredBitsForLevels(levels) {
    const count = positiveInteger(levels, '量子化段階数');
    return Math.ceil(Math.log2(count));
  }

  function samplingTheoremState(signalFrequency, sampleRate) {
    const frequency = positiveNumber(signalFrequency, '信号の最高周波数');
    const rate = positiveNumber(sampleRate, '標本化周波数');
    const boundary = 2 * frequency;
    const tolerance = EPSILON * Math.max(1, boundary, rate);
    const difference = rate - boundary;
    const state = Math.abs(difference) <= tolerance
      ? 'boundary'
      : difference > 0
        ? 'sufficient'
        : 'insufficient';
    return Object.freeze({
      state,
      signalFrequency: frequency,
      sampleRate: rate,
      halfSampleRate: rate / 2,
      requiredExclusiveRate: boundary,
      ratio: rate / frequency
    });
  }

  function normalizePhase(phase) {
    const full = 2 * Math.PI;
    const normalized = finiteNumber(phase, '位相') % full;
    return normalized < 0 ? normalized + full : normalized;
  }

  function aliasCandidate(options = {}) {
    const frequency = positiveNumber(options.frequency, '元の波の周波数');
    const sampleRate = positiveNumber(options.sampleRate, '標本化周波数');
    const amplitude = finiteNumber(options.amplitude ?? 1, '振幅');
    const offset = finiteNumber(options.offset ?? 0, '中心値');
    const phase = normalizePhase(options.phase ?? 0);
    const theorem = samplingTheoremState(frequency, sampleRate);

    if (theorem.state === 'sufficient') return null;

    if (theorem.state === 'boundary') {
      const zeroCrossing = Math.abs(Math.sin(phase)) <= 1e-8;
      if (zeroCrossing) {
        return Object.freeze({ frequency: 0, amplitude: 0, phase: 0, offset, kind: 'boundary-flat' });
      }
      // 標本化周波数が元の周波数の2倍ちょうどの場合、標本値は A sin(phase) だけで決まる。
      // 通常はπ−phase、90°付近では振幅と位相の別組合せを選び、必ず異なる候補を返す。
      const quarterCycle = Math.abs(Math.cos(phase)) <= 1e-8;
      const candidateAmplitude = quarterCycle ? amplitude * 1.25 : amplitude;
      const candidatePhase = quarterCycle
        ? Math.asin(Math.max(-1, Math.min(1, amplitude * Math.sin(phase) / candidateAmplitude)))
        : Math.PI - phase;
      return Object.freeze({
        frequency,
        amplitude: candidateAmplitude,
        phase: normalizePhase(candidatePhase),
        offset,
        kind: 'boundary-phase'
      });
    }

    const remainder = ((frequency % sampleRate) + sampleRate) % sampleRate;
    const folded = Math.min(remainder, sampleRate - remainder);
    const reflected = remainder > sampleRate / 2;
    return Object.freeze({
      frequency: folded,
      amplitude,
      phase: reflected ? normalizePhase(Math.PI - phase) : phase,
      offset,
      kind: folded < frequency ? 'lower-frequency-alias' : 'equivalent-alias'
    });
  }

  function interpolateGrid(values, position, options = {}) {
    if (!Array.isArray(values) || values.length < 2) {
      throw new TypeError('補間には2点以上の値が必要です。');
    }
    values.forEach(value => finiteNumber(value, '格子上の値'));
    const periodic = options.periodic === true;
    const length = values.length;
    let p = finiteNumber(position, '補間位置');
    if (periodic) p = ((p % length) + length) % length;
    else p = Math.min(length - 1, Math.max(0, p));
    const index = Math.floor(p);
    const fraction = p - index;
    const at = rawIndex => {
      if (periodic) return values[((rawIndex % length) + length) % length];
      return values[Math.min(length - 1, Math.max(0, rawIndex))];
    };
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);
    const f2 = fraction * fraction;
    const f3 = f2 * fraction;
    return 0.5 * (
      2 * p1
      + (-p0 + p2) * fraction
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * f3
    );
  }

  function lessonWaveValue(time, options = {}) {
    const t = finiteNumber(time, '時刻');
    const frequency = positiveNumber(options.frequency ?? 0.625, '波の周波数');
    const amplitudeScale = nonNegativeNumber(options.amplitudeScale ?? 1, '振幅倍率');
    const phase = finiteNumber(options.phase ?? 0, '位相');
    const center = finiteNumber(options.center ?? 4, '中心値');
    const cyclePosition = (t * frequency + phase / (2 * Math.PI)) * LESSON_SAMPLE_VALUES.length;
    const raw = interpolateGrid(LESSON_SAMPLE_VALUES, cyclePosition, { periodic: true });
    // Catmull-Rom補間のわずかなオーバーシュートを、この教材の格子値0〜7の範囲に収める。
    const bounded = Math.min(7, Math.max(0, raw));
    return center + (bounded - center) * amplitudeScale;
  }

  function gridWaveValue(values, time, options = {}) {
    const t = finiteNumber(time, '時刻');
    const start = finiteNumber(options.start ?? 0, '開始時刻');
    const interval = positiveNumber(options.interval ?? 1, '格子間隔');
    return interpolateGrid(values, (t - start) / interval, { periodic: options.periodic === true });
  }

  function deriveDigitizationAnswers(values, options = {}) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError('1個以上の標本値が必要です。');
    const sampleRate = positiveNumber(options.sampleRate, '標本化周波数');
    const start = finiteNumber(options.start ?? 0, '開始時刻');
    return values.map((value, index) => {
      const encoded = quantizeAndEncode(value, options);
      return Object.freeze({
        index,
        time: start + index / sampleRate,
        sampleValue: finiteNumber(value, '標本値'),
        quantizedValue: encoded.quantizedValue,
        code: encoded.code,
        binary: encoded.binary
      });
    });
  }

  function hashSeed(seed) {
    const text = String(seed ?? 'sound-core');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRandom(seed) {
    let state = hashSeed(seed);
    const random = function () {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    random.integer = (min, max) => {
      const lower = Math.ceil(finiteNumber(min, '乱数の最小値'));
      const upper = Math.floor(finiteNumber(max, '乱数の最大値'));
      if (upper < lower) throw new RangeError('乱数の最大値は最小値以上にしてください。');
      return lower + Math.floor(random() * (upper - lower + 1));
    };
    return random;
  }

  function chooseWithoutImmediateRepeat(items, previousId, random = Math.random) {
    if (!Array.isArray(items) || items.length === 0) throw new TypeError('問題候補が必要です。');
    if (typeof random !== 'function') throw new TypeError('乱数関数を指定してください。');
    const candidates = items.length > 1
      ? items.filter(item => item.id !== previousId)
      : items;
    return candidates[Math.floor(random() * candidates.length)] || candidates[0];
  }

  return Object.freeze({
    EPSILON,
    DEFAULT_VOLTAGE_RANGE,
    LESSON_SAMPLE_VALUES,
    degreesToRadians,
    sineValue,
    sumSineWaves,
    waveformPoints,
    samplingPeriod,
    sampleCount,
    sampleSignal,
    quantizationLevels,
    quantizationWidth,
    quantize,
    fixedBitString,
    quantizeAndEncode,
    quantizeSamples,
    audioDataSize,
    convertBytes,
    requiredBitsForLevels,
    samplingTheoremState,
    aliasCandidate,
    interpolateGrid,
    lessonWaveValue,
    gridWaveValue,
    deriveDigitizationAnswers,
    createSeededRandom,
    chooseWithoutImmediateRepeat
  });
});
