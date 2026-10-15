// 2進数・16進数の位取りを共通の式編集・採点へ渡す。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./digital-radix-core.js'), require('./lesson-formula-grader.js'));
  else root.DigitalRadixFormulas = factory(root.DigitalRadixCore, root.LessonFormulaGrader);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Radix, Grader) {
  'use strict';
  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = value => ({ kind: 'operator', value });
  const power = (base, exponent) => ({ kind: 'power', base: [value(base)], exponent: [value(exponent)] });
  const SPECS = Object.freeze({
    'rx-binary-6': { source: '10101', base: 2 },
    'rx-binary-7': { source: '11010', base: 2 },
    'rx-binary-8': { source: '111001', base: 2 },
    'rx-binary-9': { source: '1001100', base: 2 },
    'rx-binary-10': { source: '1010110', base: 2 },
    'rx-hex-4': { source: 'CC', base: 16 },
    'rx-hex-5': { source: 'A4', base: 16 },
    'rx-hex-6': { source: '4F', base: 16 },
    'rx-hex-7': { source: '6D', base: 16 },
    'rx-hex-8': { source: '99', base: 16 }
  });
  const UNITS = Object.freeze({ '': { label: '単位なし', dimensions: {} }, digit: { label: '桁の数字', dimensions: {} } });
  function define(id) {
    const spec = SPECS[id];
    if (!spec) throw new RangeError('位取り計算の問題ID');
    const digits = [...spec.source].map(digit => Number.parseInt(digit, spec.base));
    const sources = [...new Set(digits)].filter(digit => digit !== 0).map(digit => ({ id: `digit-${digit}`, label: `与えられた桁の数字${digit}`, value: String(digit), unit: 'digit', symbol: `digit-${digit}` }));
    const expression = [];
    digits.forEach((digit, index) => {
      if (!digit) return;
      if (expression.length) expression.push(op('+'));
      expression.push(value(digit, 'digit', `digit-${digit}`), op('×'), power(spec.base, digits.length - index - 1));
    });
    return {
      id, units: UNITS, sources,
      quantities: sources.map(({ symbol, ...quantity }) => quantity),
      constants: [...new Set([0, 1, spec.base, ...digits.map((_, index) => index)])].map(n => ({ id: `constant-${n}`, label: '位取り計算に使う数', value: String(n), unit: '' })),
      tasks: [{ id: 'answer', label: '10進数での値', answerUnit: '', answerUnitLabel: '（10進数）', expected: Radix.parseNumeral(spec.source, spec.base), tolerance: 1e-8, expectedTokens: expression }]
    };
  }
  return Object.freeze({ QUESTION_IDS: Object.freeze(Object.keys(SPECS)), define, grade: Grader.grade, gradeRow: Grader.gradeRow });
});
