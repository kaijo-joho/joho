// ディスプレイ・印刷計算の問題定義。式編集・採点は教材共通の部品へ委ねる。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./output-core.js'), require('./lesson-formula-grader.js'));
  } else root.OutputFormulas = factory(root.OutputCore, root.LessonFormulaGrader);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Output, Grader) {
  'use strict';
  if (!Output || !Grader) throw new Error('出力装置の計算に必要な共通処理を読み込めませんでした。');

  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = n => ({ kind: 'operator', value: n });
  const UNITS = Object.freeze({
    '': { label: '単位なし', dimensions: {} },
    mm: { label: 'mm', dimensions: { mm: 1 } },
    inch: { label: 'インチ', dimensions: { inch: 1 } },
    pixel: { label: '画素', dimensions: { pixel: 1 } },
    ppi: { label: 'ppi', dimensions: { pixel: 1, inch: -1 } },
    s: { label: '秒', dimensions: { s: 1 } },
    frame: { label: '枚', dimensions: { frame: 1 } },
    update: { label: '回', dimensions: { update: 1 } },
    fps: { label: 'fps', dimensions: { frame: 1, s: -1 } },
    Hz: { label: 'Hz', dimensions: { update: 1, s: -1 } },
    repeat: { label: '回/枚', dimensions: { update: 1, frame: -1 } },
    // 本問は1画素を1ドットへ対応させるモデル。dpiと画素/インチを同じ量として扱う。
    dpi: { label: 'dpi', dimensions: { pixel: 1, inch: -1 } },
    'pixel/inch': { label: '画素/インチ', dimensions: { pixel: 1, inch: -1 } },
    'mm/inch': { label: 'mm/インチ', dimensions: { mm: 1, inch: -1 }, conversion: true }
  });

  function definePrint() {
    const width = 101.6, height = 76.2, dpi = 400;
    const answer = Output.printPixels(width, height, dpi);
    const sources = [
      { id: 'width', label: '横の長さ', value: String(width), unit: 'mm', symbol: 'width' },
      { id: 'height', label: '縦の長さ', value: String(height), unit: 'mm', symbol: 'height' },
      { id: 'dpi', label: '印刷の解像度', value: String(dpi), unit: 'dpi', symbol: 'dpi' }
    ];
    const tasks = ['width', 'height'].map(id => {
      const length = sources.find(source => source.id === id);
      const tokens = conversionUnit => [
        value(length.value, length.unit, length.symbol), op('÷'), value(25.4, conversionUnit),
        op('×'), value(dpi, 'dpi', 'dpi')
      ];
      return {
        id, label: `${id === 'width' ? '横' : '縦'}の画素数`, answerUnit: 'pixel', answerUnitLabel: '画素',
        expected: answer[id], tolerance: 1e-7,
        expectedTokens: tokens(''), legacyExpectedTokens: tokens('mm/inch')
      };
    });
    return {
      id: 'output-print', units: UNITS, sources,
      quantities: sources.map(({ symbol, ...item }) => item),
      constants: [{ id: 'mm-inch', label: '換算用の数', value: '25.4', unit: '' }],
      manualUnits: ['inch', 'pixel/inch'],
      unitlessConversionChoices: { '25.4': ['mm/inch'] }, tasks
    };
  }

  function createDefinition(id) {
    const definition = { id, units: UNITS, quantities: [], constants: [], sources: [], tasks: [], unitlessConversionChoices: {} };
    function source(id, label, n, unit) {
      const item = { id, label, value: String(n), unit, symbol: id };
      definition.sources.push(item);
      definition.quantities.push({ id, label, value: String(n), unit });
      return value(n, unit, id);
    }
    function task(id, label, answerUnit, expected, expectedTokens, answerUnitLabel = UNITS[answerUnit].label) {
      definition.tasks.push({ id, label, answerUnit, answerUnitLabel, expected, expectedTokens, tolerance: 1e-7 });
    }
    return { definition, source, task };
  }

  function defineDisplay() {
    const { definition, source, task } = createDefinition('output-display');
    const ppi = source('ppi', '画素の細かさ', 96, 'ppi');
    const width = source('width', '画面の横幅', 20, 'inch');
    const pixels = source('pixels', '別の画面の横方向の画素数', 2560, 'pixel');
    task('pixels', '(1) 横方向の画素数', 'pixel', Output.screenPixels(96, 20), [ppi, op('×'), width]);
    task('ppi', '(2) 同じ横幅で2560画素となる画面のppi', 'ppi', 2560 / 20, [pixels, op('÷'), width]);
    definition.choice = {
      options: ['2', '4', '8'], expected: '4',
      hint: '同じ面積で、横方向と縦方向がそれぞれ何倍になるか考えましょう。',
      explanation: '正解です。横も縦も2倍になるため、画素数は2×2＝4倍です。'
    };
    return definition;
  }

  function defineRefresh() {
    const { definition, source, task } = createDefinition('output-refresh');
    const fps = source('fps', '動画のフレームレート', 30, 'fps');
    const hz = source('hz', '画面のリフレッシュレート', 120, 'Hz');
    const seconds = source('duration', '時間', 0.5, 's');
    const frames = [fps, op('×'), seconds];
    const updates = [hz, op('×'), seconds];
    task('frames', '(1) 0.5秒分の動画のフレーム数', 'frame', 30 * 0.5, frames);
    task('updates', '(2) 0.5秒間の画面の更新回数', 'update', 120 * 0.5, updates);
    task('repeats', '(3) 同じフレームの表示回数', 'repeat', 120 / 30,
      [{ kind: 'group', body: updates }, op('÷'), { kind: 'group', body: frames }], '回ずつ');
    definition.choice = {
      options: ['increase', 'unchanged'], expected: 'unchanged',
      hint: '動画が用意するフレーム数と、画面を更新する回数を区別しましょう。',
      explanation: '正解です。同じフレームを繰り返して表示しても、動画の新しいフレームは増えません。'
    };
    return definition;
  }

  function gradeChoice(definition, answer) {
    if (!definition.choice || !definition.choice.options.includes(answer)) return { status: 'invalid', message: '選択肢を選んでから判定しましょう。' };
    const correct = answer === definition.choice.expected;
    return { status: 'judged', correct, message: correct ? definition.choice.explanation : `もう一度考えてみましょう。${definition.choice.hint}` };
  }

  return Object.freeze({ definePrint, defineDisplay, defineRefresh, gradeChoice, grade: Grader.grade, gradeRow: Grader.gradeRow });
});
