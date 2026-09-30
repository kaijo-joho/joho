// 印刷計算の問題定義。式編集・採点は教材共通の部品へ委ねる。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./output-core.js'), require('./lesson-formula-grader.js'));
  } else root.OutputFormulas = factory(root.OutputCore, root.LessonFormulaGrader);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Output, Grader) {
  'use strict';
  if (!Output || !Grader) throw new Error('印刷の計算に必要な共通処理を読み込めませんでした。');

  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = n => ({ kind: 'operator', value: n });
  const UNITS = Object.freeze({
    '': { label: '単位なし', dimensions: {} },
    mm: { label: 'mm', dimensions: { mm: 1 } },
    inch: { label: 'インチ', dimensions: { inch: 1 } },
    pixel: { label: '画素', dimensions: { pixel: 1 } },
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

  return Object.freeze({ definePrint, grade: Grader.grade, gradeRow: Grader.gradeRow });
});
