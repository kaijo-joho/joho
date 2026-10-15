// dr01 の計算問題を共通式ビルダーへ渡す教材定義。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./digital-basics-core.js'), require('./lesson-formula-grader.js'));
  } else {
    root.DigitalBasicsFormulas = factory(root.DigitalBasicsCore, root.LessonFormulaGrader);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DigitalBasics, Grader) {
  'use strict';

  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = operator => ({ kind: 'operator', value: operator });
  const power = (base, exponent) => ({ kind: 'power', base, exponent });
  const group = body => ({ kind: 'group', body });
  const unit = (label, dimensions) => ({ label, dimensions });
  const UNITS = Object.freeze({
    '': unit('単位なし', {}),
    bitCount: unit('bit数', {}), levels: unit('通り', {}),
    B: unit('B', { B: 1 }), KB: unit('KB', { KB: 1 }), MB: unit('MB', { MB: 1 }), GB: unit('GB', { GB: 1 }),
    // bit数は通り数と同じく個数として扱う。Bだけをデータ量の次元にし、
    // 8 bit/B の換算因子を指数の中でも使えるようにする。
    bit: unit('bit', {}),
    'B/bit': unit('B/bit', { B: 1 }),
    'bit/B': unit('bit/B', { B: -1 }),
    'B/KB': unit('B/KB', { B: 1, KB: -1 }),
    'KB/MB': unit('KB/MB', { KB: 1, MB: -1 }),
    'MB/GB': unit('MB/GB', { MB: 1, GB: -1 })
  });

  const QUESTION_IDS = Object.freeze(['count8', 'need120', 'count2bytes', 'need500', 'ratio', 'gb4', 'pixels', 'square', 'power', 'decimal']);

  function define(questionId) {
    if (!DigitalBasics || !Grader) throw new Error('dr01 の式判定基盤を読み込めません。');
    const definitions = {
      count8(definition) {
        const bits = source(definition, 'bits', 'ビット数', 8, 'bitCount');
        task(definition, 'answer', '通り数', 'levels', DigitalBasics.expectedAnswer('count8'), [power([value(2)], [bits])]);
        definition.constants.push({ id: 'two', label: '2進数の基数', value: '2', unit: '' });
      },
      need120(definition) { minBits(definition, 120); },
      count2bytes(definition) {
        const bytes = source(definition, 'bytes', 'データ量', 2, 'B');
        const bits = [bytes, op('×'), value(8, 'bit/B')];
        task(definition, 'answer', '通り数', 'levels', DigitalBasics.expectedAnswer('count2bytes'), [power([value(2)], bits)]);
        definition.constants.push(
          { id: 'two', label: '2進数の基数', value: '2', unit: '' },
          { id: 'bit-byte', label: '換算に使う数', value: '8', unit: '' }
        );
        definition.unitlessConversionChoices = { '8': ['', 'bit/B'] };
      },
      need500(definition) { minBits(definition, 500); },
      ratio(definition) {
        const larger = source(definition, 'larger', '2KBのデータ量', 2, 'KB');
        const smaller = source(definition, 'smaller', '1KBのデータ量', 1, 'KB');
        const exponent = [group([larger, op('-'), smaller]), op('×'), value(1024, 'B/KB'), op('×'), value(8, 'bit/B')];
        task(definition, 'answer', '指数 n', '', DigitalBasics.expectedAnswer('ratio'), exponent, { answerUnitLabel: '（指数 n）' });
        definition.constants.push(
          { id: 'byte-kilo', label: '換算に使う数', value: '1024', unit: '' },
          { id: 'bit-byte', label: '換算に使う数', value: '8', unit: '' }
        );
        definition.unitlessConversionChoices = { '1024': ['', 'B/KB'], '8': ['', 'bit/B'] };
      },
      gb4(definition) { conversion(definition, 'gb4', 4, 'GB', 1024, 'MB', 'byte'); },
      pixels(definition) {
        // 問題文の「4096×3072bit」は、bitが積全体に付く量として表現する。
        const width = source(definition, 'width', '横方向の数', 4096, '');
        const bitCount = source(definition, 'bitCount', 'bitで表した値', 3072, 'bit');
        const tokens = [width, op('×'), bitCount, op('÷'), value(8, 'bit/B'), op('÷'), value(1024, 'B/KB'), op('÷'), value(1024, 'KB/MB')];
        task(definition, 'answer', 'データ量', 'MB', DigitalBasics.expectedAnswer('pixels'), tokens);
        addConversionConstants(definition, [8, 1024]);
      },
      square(definition) {
        const count = source(definition, 'count', 'Bの数値', 2048, 'B');
        const factor = source(definition, 'factor', 'もう一方の数値', 2048, '');
        const tokens = [count, op('×'), factor, op('÷'), value(1024, 'B/KB'), op('÷'), value(1024, 'KB/MB')];
        task(definition, 'answer', 'データ量', 'MB', DigitalBasics.expectedAnswer('square'), tokens);
        addConversionConstants(definition, [1024]);
      },
      power(definition) {
        const exponent = source(definition, 'unitExponent', '1024＝2の累乗で表した指数', 10, '');
        const tokens = [exponent, op('+'), exponent];
        // 問題文の「1024＝2^10」から、1MB分の指数を加法で求める。
        task(definition, 'answer', '指数 n', '', DigitalBasics.expectedAnswer('power'), tokens, { answerUnitLabel: '（指数 n）' });
        definition.constants.push(
          { id: 'two', label: '2進数の基数', value: '2', unit: '' }
        );
      },
      decimal(definition) { conversion(definition, 'decimal', 4, 'GB', 1000, 'MB', 'decimal'); }
    };
    const setup = definitions[String(questionId)];
    if (!setup) throw new RangeError(`dr01 の問題IDではありません: ${questionId}`);
    const definition = { id: String(questionId), units: UNITS, quantities: [], constants: [], sources: [], tasks: [] };
    setup(definition);
    return definition;
  }

  function source(definition, id, label, number, unitId) {
    const item = { id, label, value: String(number), unit: unitId };
    definition.sources.push({ ...item, symbol: id });
    definition.quantities.push(item);
    return value(number, unitId, id);
  }

  function task(definition, id, label, answerUnit, expected, expectedTokens, extras = {}) {
    definition.tasks.push({ id, label, answerUnit, answerUnitLabel: UNITS[answerUnit]?.label || answerUnit, expected,
      tolerance: 1e-8, expectedTokens, ...extras });
  }

  function minBits(definition, levels) {
    const bound = source(definition, 'levels', '表したい通り数', levels, 'levels');
    const expected = DigitalBasics.expectedAnswer(levels === 120 ? 'need120' : 'need500');
    task(definition, 'answer', '必要な最小ビット数', 'bitCount', expected, [], {
      rule: 'minimum-bits', levels, boundUnit: 'levels', boundSymbol: 'levels', boundLabel: '問題の通り数',
      boundQuantity: bound, answerIsResult: false, scaffold: { type: 'power-bounds', base: 2 }
    });
    definition.hint = '左は1つ前のビット数では足りず、右は必要なビット数なら足りることを比較式で示します。';
  }

  function conversion(definition, answerId, amount, from, factor, to, kind) {
    const input = source(definition, 'amount', '換算するデータ量', amount, from);
    const ratioUnit = `${to}/${from}`;
    const tokens = [input, op('×'), value(factor, ratioUnit)];
    const expected = DigitalBasics.expectedAnswer(answerId);
    task(definition, 'answer', '換算後のデータ量', to, expected, tokens);
    definition.constants.push({ id: `${kind}-factor`, label: '換算に使う数', value: String(factor), unit: '' });
    definition.unitlessConversionChoices = { [String(factor)]: ['', ratioUnit] };
  }

  function addConversionConstants(definition, numbers) {
    numbers.forEach(number => definition.constants.push({ id: `conversion-${number}`, label: '換算に使う数', value: String(number), unit: '' }));
    definition.unitlessConversionChoices = { '8': ['', 'B/bit', 'bit/B'], '1024': ['', 'B/KB', 'KB/MB'] };
  }

  return Object.freeze({ QUESTION_IDS, define, grade: Grader.grade, gradeRow: Grader.gradeRow });
});
