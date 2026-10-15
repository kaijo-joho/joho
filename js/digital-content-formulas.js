// dr21・dr22 の計算問題を共通式ビルダーへ渡す教材定義。
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./digital-text-core.js'),
      require('./digital-color-core.js'),
      require('./lesson-formula-grader.js')
    );
  } else {
    root.DigitalContentFormulas = factory(root.DigitalTextCore, root.DigitalColorCore, root.LessonFormulaGrader);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Text, Color, Grader) {
  'use strict';

  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = operator => ({ kind: 'operator', value: operator });
  const group = body => ({ kind: 'group', body });
  const power = (base, exponent) => ({ kind: 'power', base, exponent });
  const unit = (label, dimensions = {}) => ({ label, dimensions });
  const UNITS = Object.freeze({
    '': unit('単位なし'), bitCount: unit('bit'), levels: unit('段階'), colors: unit('色'),
    colorChannel: unit('成分'), channelValue: unit('RGB値'), B: unit('B', { B: 1 })
  });
  const QUESTION_IDS = Object.freeze([
    'dtx-question-5', 'dtx-question-7', 'dcl-question-4', 'dcl-question-5', 'dcl-question-7'
  ]);

  function define(questionId) {
    const id = String(questionId);
    if (!QUESTION_IDS.includes(id)) throw new RangeError(`文字・色の式問題IDではありません: ${id}`);
    if (!Grader) throw new Error('式判定に必要な共通graderを読み込めません。');
    if (id.startsWith('dtx-') && !Text) throw new Error('文字の計算に必要なDigitalTextCoreを読み込めません。');
    if (id.startsWith('dcl-') && !Color) throw new Error('色の計算に必要なDigitalColorCoreを読み込めません。');
    const definition = { id, units: UNITS, quantities: [], constants: [], sources: [], tasks: [] };
    if (id === 'dtx-question-5') defineAsciiCount(definition);
    else if (id === 'dtx-question-7') defineUtf8Bytes(definition);
    else if (id === 'dcl-question-4') defineEightBitColor(definition);
    else if (id === 'dcl-question-5') define4096Colors(definition);
    else defineHexRgb(definition);
    return definition;
  }

  function source(definition, id, label, number, unitId, { implicit = false } = {}) {
    const item = { id, label, value: String(number), unit: unitId };
    definition.sources.push({ ...item, symbol: id });
    if (!implicit) definition.quantities.push(item);
    return value(number, unitId, id);
  }

  function constant(definition, id, label, number) {
    definition.constants.push({ id, label, value: String(number), unit: '' });
    return value(number);
  }

  function task(definition, id, label, answerUnit, expected, expectedTokens, extras = {}) {
    definition.tasks.push({
      id, label, answerUnit, answerUnitLabel: UNITS[answerUnit].label, expected,
      tolerance: 1e-8, expectedTokens, ...extras
    });
  }

  function defineAsciiCount(definition) {
    const bits = source(definition, 'asciiBits', 'ASCIIのビット数', 7, 'bitCount');
    constant(definition, 'binaryBase', '2進数の基数', 2);
    // ASCIIコード表の上限から通り数を導く。教材の期待値をHTMLへ重複定義しない。
    const expected = Text.asciiEntry(127).code + 1;
    task(definition, 'answer', '表せる通り数', 'levels', expected, [power([value(2)], [bits])], { answerUnitLabel: '通り' });
  }

  function defineUtf8Bytes(definition) {
    const encoded = Text.utf8('Aあ');
    const asciiBytes = source(definition, 'asciiCharacterBytes', 'Aのバイト数', encoded.entries[0].byteLength, 'B');
    const japaneseBytes = source(definition, 'japaneseCharacterBytes', 'あのバイト数', encoded.entries[1].byteLength, 'B');
    task(definition, 'answer', '文字列全体のデータ量', 'B', encoded.byteLength, [asciiBytes, op('+'), japaneseBytes]);
  }

  function defineEightBitColor(definition) {
    const depth = Color.depth(8);
    const bits = source(definition, 'bitsPerChannel', '各成分のビット数', depth.bitsPerChannel, 'bitCount');
    const channels = source(definition, 'channels', 'RGBの成分数', 3, 'colorChannel');
    const base = constant(definition, 'binaryBase', '2進数の基数', 2);
    definition.taskPalettes = true;
    task(definition, 'levels', '各成分の段階数', 'levels', depth.levels, [power([base], [bits])], {
      palette: { quantities: ['bitsPerChannel'], constants: ['binaryBase'] }
    });
    task(definition, 'totalBits', '1色に使う合計ビット数', 'bitCount', depth.totalBits, [bits, op('×'), channels], {
      expectedAlternatives: [[bits, op('+'), bits, op('+'), bits]],
      palette: { quantities: ['bitsPerChannel', 'channels'], constants: [] }
    });
    task(definition, 'colors', '表せる色数', 'colors', depth.colors, [power([base], [group([bits, op('×'), channels])])], {
      expectedAlternatives: [
        [power([base], [bits]), op('×'), power([base], [bits]), op('×'), power([base], [bits])],
        [power([power([base], [bits])], [channels])]
      ],
      palette: { quantities: ['bitsPerChannel', 'channels'], constants: ['binaryBase'] }
    });
  }

  function define4096Colors(definition) {
    const depth = Color.depth(4);
    const count = source(definition, 'colors', '表す色数', depth.colors, 'colors');
    const channels = source(definition, 'channels', 'RGBの成分数', 3, 'colorChannel');
    const base = constant(definition, 'binaryBase', '2進数の基数', 2);
    definition.taskPalettes = true;
    task(definition, 'totalBits', 'RGB全体のビット数', 'bitCount', depth.totalBits, [], {
      rule: 'minimum-bits', levels: depth.colors, boundUnit: 'colors', boundSymbol: 'colors',
      boundLabel: '問題の色数', boundQuantity: count, answerIsResult: false,
      conclusionQuantity: { unit: 'bitCount', symbol: 'totalBits' },
      scaffold: { type: 'power-bounds', base: 2 },
      palette: { quantities: ['colors'], constants: [] }
    });
    // 全体のbit数は自分で入力した結論から参照する。正解を数量カードへ置かない。
    const totalBitsReference = { kind: 'reference', rowId: '$task:totalBits' };
    task(definition, 'bitsPerChannel', '各成分のビット数', 'bitCount', depth.bitsPerChannel,
      [totalBitsReference, op('÷'), channels], { palette: { quantities: ['channels'], constants: [] } });
    task(definition, 'levelsPerChannel', '各成分の段階数', 'levels', depth.levels,
      [power([base], [group([{ ...totalBitsReference }, op('÷'), channels])])], {
        palette: { quantities: ['channels'], constants: ['binaryBase'] }
      });
  }

  function defineHexRgb(definition) {
    const parsed = Color.parseHex('#CA3127');
    const hexPairs = ['CA', '31', '27'];
    const taskIds = ['red', 'green', 'blue'];
    const names = ['R', 'G', 'B'];
    const channels = parsed.channels;
    const place = constant(definition, 'hexPlace', '16進数の位の重み', 16);
    definition.taskPalettes = true;
    const quantitiesByChannel = [];
    hexPairs.forEach((pair, index) => {
      const high = source(definition, `${taskIds[index]}HighDigit`, `${names[index]}の上位桁`, Number.parseInt(pair[0], 16), '');
      const low = source(definition, `${taskIds[index]}LowDigit`, `${names[index]}の下位桁`, Number.parseInt(pair[1], 16), '');
      quantitiesByChannel.push([`${taskIds[index]}HighDigit`, `${taskIds[index]}LowDigit`]);
      task(definition, taskIds[index], `${names[index]}の10進数値`, 'channelValue', channels[index],
        [high, op('×'), place, op('+'), low], {
          palette: { quantities: quantitiesByChannel[index], constants: ['hexPlace'] }
        });
    });
  }

  function resolveTaskReferences(definition, draft) {
    const tasks = definition.tasks.map(task => ({
      ...task,
      expectedTokens: remapReferences(task.expectedTokens, draft)
    }));
    return { ...definition, tasks };
  }

  function remapReferences(tokens, draft) {
    if (!Array.isArray(tokens)) return tokens;
    return tokens.map(token => {
      if (token.kind === 'reference' && String(token.rowId).startsWith('$task:')) {
        const referencedTaskId = String(token.rowId).slice('$task:'.length);
        return { ...token, rowId: draft.targets?.[referencedTaskId] || token.rowId };
      }
      if (token.kind === 'group') return { ...token, body: remapReferences(token.body, draft) };
      if (token.kind === 'power') return { ...token, base: remapReferences(token.base, draft), exponent: remapReferences(token.exponent, draft) };
      if (token.kind === 'fraction') return { ...token, numerator: remapReferences(token.numerator, draft), denominator: remapReferences(token.denominator, draft) };
      return token;
    });
  }

  function grade(definition, draft, options) {
    return Grader.grade(resolveTaskReferences(definition, draft), draft, options);
  }
  function gradeRow(definition, draft, rowId) {
    return Grader.gradeRow(resolveTaskReferences(definition, draft), draft, rowId);
  }

  return Object.freeze({ QUESTION_IDS, define, grade, gradeRow });
});
