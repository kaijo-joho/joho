// 音教材の立式規則。値・単位・正解は問題params/SoundCoreから導出する。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sound-core.js'), require('./lesson-formula-grader.js'));
  else root.SoundFormulas = factory(root.SoundCore, root.LessonFormulaGrader);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Sound, Grader) {
  'use strict';
  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = n => ({ kind: 'operator', value: n });
  const group = body => ({ kind: 'group', body });
  const power = (base, exponent) => ({ kind: 'power', base, exponent });
  const unit = (label, dimensions, extras = {}) => ({ label, dimensions, ...extras });
  // bit/B/KB/MB are deliberately independent bases: wrong conversion direction
  // must not disappear through automatic unit conversion. Counts are dimensionless.
  const UNITS = Object.freeze({
    '': unit('単位なし', {}), s: unit('秒', { s: 1 }), min: unit('分', { min: 1 }),
    Hz: unit('回/秒（Hz）', { s: -1 }), kHz: unit('kHz', { kHz: 1 }),
    'Hz/kHz': unit('Hz/kHz', { s: -1, kHz: -1 }, { conversion: true, conversionLabel: 'kHz→Hz', conversionOperation: '掛ける' }), 's/min': unit('秒/分', { s: 1, min: -1 }, { conversion: true, conversionLabel: '分→秒', conversionOperation: '掛ける' }),
    bit: unit('bit', { bit: 1 }), 'bit/sample': unit('bit/回', { bit: 1 }),
    bitCount: unit('bit（桁数）', {}), levels: unit('段階', {}), channel: unit('チャンネル', {}),
    B: unit('B', { B: 1 }), 'B/sample': unit('B/回', { B: 1 }),
    KB: unit('KB', { KB: 1 }), MB: unit('MB', { MB: 1 }),
    KiB: unit('KiB', { KiB: 1 }), MiB: unit('MiB', { MiB: 1 }),
    'B/s': unit('B/秒', { B: 1, s: -1 }), 'KB/s': unit('KB/秒', { KB: 1, s: -1 }),
    'bit/B': unit('bit/B', { bit: 1, B: -1 }, { conversion: true, conversionLabel: 'bit→B', conversionOperation: '割る' }), 'B/bit': unit('B/bit', { B: 1, bit: -1 }, { conversion: true, conversionLabel: 'bit→B', conversionOperation: '掛ける' }),
    'B/KB': unit('B/KB', { B: 1, KB: -1 }, { conversion: true, conversionLabel: 'B→KB', conversionOperation: '割る' }), 'KB/B': unit('KB/B', { KB: 1, B: -1 }, { conversion: true, conversionLabel: 'B→KB', conversionOperation: '掛ける' }),
    'KB/MB': unit('KB/MB', { KB: 1, MB: -1 }, { conversion: true, conversionLabel: 'KB→MB', conversionOperation: '割る' }), 'MB/KB': unit('MB/KB', { MB: 1, KB: -1 }, { conversion: true, conversionLabel: 'KB→MB', conversionOperation: '掛ける' }),
    'B/MB': unit('B/MB', { B: 1, MB: -1 }, { conversion: true, conversionLabel: 'B→MB', conversionOperation: '割る' }),
    'B/KiB': unit('B/KiB', { B: 1, KiB: -1 }, { conversion: true, conversionLabel: 'B→KiB', conversionOperation: '割る' }), 'KiB/MiB': unit('KiB/MiB', { KiB: 1, MiB: -1 }, { conversion: true, conversionLabel: 'KiB→MiB', conversionOperation: '割る' })
  });

  function define(problem) {
    const p = problem.params;
    const definition = { id: problem.id, units: UNITS, quantities: [], constants: [], sources: [], tasks: [] };
    function source(id, label, n, u, implicit = false) {
      const item = { id, label, value: String(n), unit: u };
      // Monophonic ×1 can be omitted. Other quantities retain their provenance.
      const symbol = id === 'channels' && n === 1 ? undefined : id;
      definition.sources.push({ ...item, symbol });
      if (!implicit) definition.quantities.push(item);
      return value(n, u, symbol);
    }
    function constant(id, label, n, u = '') {
      definition.constants.push({ id, label, value: String(n), unit: u });
      return value(n, u);
    }
    function task(id, label, answerUnit, expected, expectedTokens, extras = {}) {
      definition.tasks.push({ id, label, answerUnit, answerUnitLabel: UNITS[answerUnit].label, expected,
        tolerance: problem.tolerance ?? Math.max(1e-7, Math.abs(expected) * 1e-6), expectedTokens, ...extras });
    }
    constant('one', '基準の1', 1);
    constant('two', '2進数の基数など', 2);
    if (problem.type === 'periodFromRate' || problem.type === 'rateFromPeriod') {
      const period = problem.type === 'periodFromRate';
      const input = source(period ? 'rate' : 'period', period ? '標本化周波数' : '標本化周期', period ? p.sampleRate : p.period, period ? 'Hz' : 's');
      task('answer', '答え', period ? 's' : 'Hz', period ? Sound.samplingPeriod(p.sampleRate) : 1 / p.period, [value(1), op('÷'), input]);
    } else if (problem.type === 'levelsFromBits') {
      const bits = source('bits', '量子化ビット数', p.bitDepth, 'bitCount');
      task('answer', '量子化段階数', 'levels', Sound.quantizationLevels(p.bitDepth), [power([value(2)], [bits])]);
    } else if (problem.type === 'bitsFromLevels') {
      const levels = source('levels', '区別する段階数', p.levels, 'levels');
      const bits = Sound.requiredBitsForLevels(p.levels);
      task('answer', '必要な最小のビット数', 'bitCount', bits, [], {
        rule: 'minimum-bits', levels: p.levels, answerIsResult: false,
        scaffold: { type: 'power-bounds', base: 2 }, boundLabel: '問題の段階数', answerUnitLabel: 'bit'
      });
      definition.hint = '左は1つ前では足りないこと、右はこのビット数なら足りることを表します。空欄に数値を入れましょう。';
      definition.bound = levels;
    } else if (problem.type === 'dataSize' || problem.type === 'workedExample') {
      const example = problem.type === 'workedExample';
      const kilo = p.sampleRateUnit === 'kHz';
      const rate = source('rate', '標本化周波数', kilo ? p.sampleRate / 1000 : p.sampleRate, kilo ? 'kHz' : 'Hz');
      const bits = source('bits', '量子化ビット数（1回・1チャンネル分）', p.bitDepth, 'bit/sample');
      const channels = source('channels', 'チャンネル数', p.channels, 'channel', !example);
      for (const n of [1, 2, 6]) constant(`channels-${n}`, 'チャンネル数の候補', n, 'channel');
      // 換算値は、値カードでも自由入力でも同じ「単位なしの数」として
      // 扱う。採点では下の構造比較で、掛ける/割る位置と 1000/1024 を
      // 確認するため、表示用の比の単位をトークンへ持ち込まない。
      const bytes = constant('bit-byte', '換算用の数', 8);
      constant('byte-bit', '換算用の数', 0.125);
      const base = p.base ?? 1000;
      const binaryName = (problem.answerUnit || p.answerUnit || '').includes('i');
      const k = binaryName ? 'KiB' : 'KB';
      const m = binaryName ? 'MiB' : 'MB';
      for (const n of [1000, 1024]) {
        constant(`byte-kilo-${n}`, '換算用の数', n);
        constant(`kilo-mega-${n}`, '換算用の数', n);
      }
      constant('minute-second', '換算用の数', 60);
      constant('kilo-hertz', '換算用の数', 1000);
      const normalizedRate = kilo ? group([rate, op('×'), value(1000)]) : rate;
      const legacyNormalizedRate = kilo ? group([rate, op('×'), value(1000, 'Hz/kHz')]) : rate;
      const sample = [bits, op('×'), channels, op('÷'), bytes];
      const legacySample = [bits, op('×'), channels, op('÷'), value(8, 'bit/B')];
      if (example) {
        const size = Sound.audioDataSize({ sampleRate: 1, seconds: 1, bitDepth: p.bitDepth, channels: p.channels });
        task('sample', '(1) 1回の標本化で生じるデータ量', 'B', size.bytes, sample, { legacyExpectedTokens: legacySample });
        const second = Sound.audioDataSize({ ...p, seconds: 1 });
        task('second', '(2) 1秒あたりのデータ量', 'KB/s', Sound.convertBytes(second.bytes, 'KB', 1000), [...sample, op('×'), normalizedRate, op('÷'), value(1000)], {
          legacyExpectedTokens: [...legacySample, op('×'), legacyNormalizedRate, op('÷'), value(1000, 'B/KB')]
        });
      } else {
        let duration;
        let legacyDuration;
        if (p.durationParts) {
          const minute = source('minutes', '録音時間（分の部分）', p.durationParts.minutes, 'min');
          const second = source('seconds', '録音時間（秒の部分）', p.durationParts.seconds, 's');
          duration = group([minute, op('×'), value(60), op('+'), second]);
          legacyDuration = group([minute, op('×'), value(60, 's/min'), op('+'), second]);
        } else duration = legacyDuration = source('duration', '録音時間', p.seconds, 's');
        const expression = [normalizedRate, op('×'), duration, op('×'), ...sample];
        const legacyExpression = [legacyNormalizedRate, op('×'), legacyDuration, op('×'), ...legacySample];
        const targetUnit = problem.answerUnit || p.answerUnit;
        if ([k, m].includes(targetUnit)) expression.push(op('÷'), value(base));
        if (targetUnit === m) expression.push(op('÷'), value(base));
        if ([k, m].includes(targetUnit)) legacyExpression.push(op('÷'), value(base, `B/${k}`));
        if (targetUnit === m) legacyExpression.push(op('÷'), value(base, `${k}/${m}`));
        const size = Sound.audioDataSize(p);
        const expected = targetUnit === 'B' ? size.bytes : Sound.convertBytes(size.bytes, targetUnit, base);
        task('answer', '音声データ量', targetUnit, expected, expression, { legacyExpectedTokens: legacyExpression });
      }
    } else throw new TypeError('この問題には式の組み立てを設定していません。');
    return definition;
  }

  return Object.freeze({ define, grade: Grader.grade, gradeRow: Grader.gradeRow });
});
