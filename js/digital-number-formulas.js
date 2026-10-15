// dr11〜dr13の計算問題を、教材共通の式ビルダーへ渡す定義。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./digital-integer-core.js'), require('./digital-real-core.js'), require('./digital-errors-core.js'), require('./lesson-formula-grader.js'));
  } else {
    root.DigitalNumberFormulas = factory(root.DigitalIntegerCore, root.DigitalRealCore, root.DigitalErrorsCore, root.LessonFormulaGrader);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Integer, Real, Errors, Grader) {
  'use strict';

  const QUESTION_IDS = Object.freeze(['di-check-1', 'di-check-2', 'di-check-3', 'df-question-1', 'df-question-3', 'de-question-1', 'de-question-2']);
  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = operator => ({ kind: 'operator', value: operator });
  const power = (base, exponent) => ({ kind: 'power', base, exponent });
  const fraction = (numerator, denominator) => ({ kind: 'fraction', numerator, denominator });
  const group = body => ({ kind: 'group', body });
  const unit = label => ({ label, dimensions: {} });
  const UNITS = Object.freeze({
    '': unit('単位なし'), bitCount: unit('bit'),
    bit0: unit('左から1桁目'), bit1: unit('左から2桁目'), bit2: unit('左から3桁目'), bit3: unit('左から4桁目'),
    bit4: unit('左から5桁目'), bit5: unit('左から6桁目'), bit6: unit('左から7桁目'), bit7: unit('左から8桁目'),
    integerBits: unit('整数部のbit数'), fractionBits: unit('小数部のbit数'),
    decimalSource: unit('問題の10進数')
  });

  function define(questionId) {
    const id = String(questionId);
    const hasCore = id.startsWith('di-') ? Boolean(Integer)
      : id.startsWith('df-') ? Boolean(Real)
        : id.startsWith('de-') ? Boolean(Errors) : false;
    if (!hasCore || !Grader) throw new Error('このページの数値式判定基盤を読み込めません。');
    const definition = { id, units: UNITS, quantities: [], sources: [], constants: [], tasks: [] };
    const setup = {
      'di-check-1': () => signedBits(definition, id, '1010', 4),
      'di-check-2': () => signedBits(definition, id, '11011011', 8),
      'di-check-3': () => signedRange(definition, id, 8),
      'df-question-1': () => fixedBits(definition, id, '01010101', 4, 8),
      'df-question-3': () => fixedRange(definition, id, 4, 8),
      'de-question-1': () => rounding(definition, id),
      'de-question-2': () => finiteSum(definition, id)
    }[id];
    if (!setup) throw new RangeError(`数値の式問題IDではありません: ${id}`);
    setup();
    return definition;
  }

  function source(definition, id, label, n, unitId = '', useSymbol = true) {
    const item = { id, label, value: String(n), unit: unitId };
    definition.sources.push({ ...item, ...(useSymbol ? { symbol: id } : {}) });
    definition.quantities.push(item);
    return value(n, unitId, id);
  }

  function constant(definition, id, label, n) {
    const text = String(n);
    if (!definition.constants.some(item => item.value === text && item.unit === '')) {
      definition.constants.push({ id, label, value: text, unit: '' });
    }
    return value(text);
  }

  function task(definition, id, label, expected, expectedTokens) {
    definition.tasks.push({ id, label, answerUnit: '', answerUnitLabel: '（10進数）', expected, tolerance: 1e-10, expectedTokens });
  }

  function bitUnit(position) { return `bit${position}`; }
  function weightedBitExpression(definition, bits, fractionalBits = 0, signed = false) {
    const tokens = [];
    Array.from(bits).forEach((char, position) => {
      const digit = Number(char);
      const unitId = bitUnit(position);
      source(definition, `digit-${position}`, `${position + 1}桁目の値`, digit, unitId, digit === 1);
      const exponent = bits.length - 1 - position - fractionalBits;
      const weight = (signed && position === 0 ? -1 : 1) * 2 ** exponent;
      constant(definition, `weight-${position}`, `${position + 1}桁目の重み`, weight);
      if (digit !== 1) return;
      if (tokens.length) tokens.push(op('+'));
      tokens.push(value(1, unitId, `digit-${position}`), op('×'), value(weight));
    });
    return tokens;
  }

  function signedBits(definition, id, bits, width) {
    const expected = Integer.decode(bits, width);
    const tokens = weightedBitExpression(definition, bits, 0, true);
    constant(definition, 'base-two', '2進数の基数', 2);
    task(definition, 'answer', '符号付き10進整数', expected, tokens);
  }

  function signedRange(definition, id, width) {
    const widthSource = source(definition, 'width', 'ビット数', width, 'bitCount');
    const minusOne = constant(definition, 'minus-one', '符号付き範囲に使う数', 1);
    const two = constant(definition, 'two', '2進数の基数', 2);
    const exponent = [widthSource, op('-'), minusOne];
    const minimum = [op('-'), power([two], exponent)];
    const maximum = [power([two], exponent), op('-'), minusOne];
    const limits = Integer.range(width);
    task(definition, 'minimum', '最小値', limits.min, minimum);
    task(definition, 'maximum', '最大値', limits.max, maximum);
  }

  function fixedBits(definition, id, bits, fractionalBits, width) {
    const expected = Real.decodeFixed(bits, fractionalBits, width);
    const tokens = weightedBitExpression(definition, bits, fractionalBits, false);
    constant(definition, 'two', '2進数の基数', 2);
    task(definition, 'answer', '固定小数点数の値', expected, tokens);
  }

  function fixedRange(definition, id, fractionalBits, width) {
    const range = Real.fixedRange(fractionalBits, width);
    const integerCount = source(definition, 'integerBits', '整数部のbit数', range.integerBits, 'integerBits');
    const fractionCount = source(definition, 'fractionBits', '小数部のbit数', range.fractionBits, 'fractionBits');
    const two = constant(definition, 'two', '2進数の基数', 2);
    const one = constant(definition, 'one', '最大値の端数に使う数', 1);
    const maxExponent = [integerCount];
    const smallExponent = [op('-'), fractionCount];
    task(definition, 'maximum', '最大値', range.max,
      [power([two], maxExponent), op('-'), power([two], smallExponent)]);
    definition.tasks.at(-1).expectedAlternatives = [
      [power([two], maxExponent), op('-'), fraction([one], [power([two], [fractionCount])])],
      [power([two], maxExponent), op('-'), power([one, op('÷'), two], [fractionCount])]
    ];
    task(definition, 'step', '刻み', range.step, [power([two], smallExponent)]);
    definition.tasks.at(-1).expectedAlternatives = [
      [fraction([one], [power([two], [fractionCount])])],
      [power([one, op('÷'), two], [fractionCount])]
    ];
  }

  function rounding(definition, id) {
    const rounded = Errors.roundBinaryFraction('0.3', 8, 'truncate');
    const original = source(definition, 'original', 'もとの10進数', rounded.original, 'decimalSource');
    const bits = rounded.bits;
    const storedExpression = weightedBitExpression(definition, bits, 8, false);
    definition.constants.push({ id: 'two', label: '2進数の基数', value: '2', unit: '' });
    task(definition, 'stored', '保存した値', Number(rounded.stored), storedExpression);
    task(definition, 'difference', '差の絶対値', Number(rounded.error), [original, op('-'), group(storedExpression)]);
  }

  function finiteSum(definition, id) {
    const sum = Errors.geometricPartial(4);
    const one = source(definition, 'one', '各項の分子', 1);
    [2, 4, 8, 16].forEach(denominator => constant(definition, `denominator-${denominator}`, '各項の分母', denominator));
    const sumTokens = [
      fraction([one], [value(2)]), op('+'),
      fraction([one], [value(4)]), op('+'),
      fraction([one], [value(8)]), op('+'),
      fraction([one], [value(16)])
    ];
    task(definition, 'sum', '最初の4項の和', Number(sum.sum), sumTokens);
    task(definition, 'remainder', '1までの残り', Number(sum.remainder), [one, op('-'), group(sumTokens)]);
  }

  return Object.freeze({ QUESTION_IDS, define, grade: Grader.grade, gradeRow: Grader.gradeRow });
});
