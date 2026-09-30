import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Compression = require('../js/compression-core.js');
const Formula = require('../js/lesson-formula-core.js');
const Grader = require('../js/lesson-formula-grader.js');
const Formulas = require('../js/compression-formulas.js');
const value = (n, unit = '') => ({ kind: 'value', value: String(n), unit });
const op = operator => ({ kind: 'operator', value: operator });
const clone = data => JSON.parse(JSON.stringify(data));
let checks = 0;
function ok(condition, message) { assert.ok(condition, message); checks += 1; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; }
function rejects(callback, message) { assert.throws(callback, RangeError, message); checks += 1; }
const task = (definition, id) => definition.tasks.find(item => item.id === id);
const source = (definition, id) => {
  const item = definition.sources.find(candidate => candidate.id === id);
  assert.ok(item, `${definition.id}: ${id} のsource`);
  return value(item.value, item.unit);
};

const rle = Formulas.defineRleRate();
equal(rle.tasks.map(item => [item.id, item.expected, item.answerUnit]), [['rate', 120, '%']], 'RLEの圧縮率は120%');
equal(rle.quantities.map(item => Number(item.value)), [10, 12], 'RLEは10文字から12文字');
equal(rle.units['%'].dimensions, {}, 'percentは無次元');
equal(rle.constants.find(item => item.id === 'percent').value, '100', '百分率へ直す定数100');
const rleRow = { id: 'rle-row', taskId: 'rate', tokens: clone(task(rle, 'rate').expectedTokens), result: '', resultUnit: '' };
let judged = Formulas.grade(rle, { rows: [rleRow], targets: { rate: rleRow.id }, answers: { rate: '120' } });
equal(judged.status, 'judged', 'RLE式を判定');
equal(judged.tasks[0].formulaCorrect, true, 'RLE式の構造');
equal(judged.tasks[0].answerCorrect, true, 'RLE圧縮率');

const expectedAnswers = [[40, 34, 85], [120, 90, 75]];
for (const [index, fixture] of Compression.HUFFMAN_QUESTIONS.entries()) {
  const definition = Formulas.defineHuffman(index);
  equal(definition.tasks.map(item => item.expected), expectedAnswers[index], `Huffman ${index + 1} 原稿のbit数と率`);
  equal(definition.quantities.filter(item => item.id.startsWith('frequency-')).length, Object.keys(fixture.frequencies).length, '各頻度を数量として用意');
  equal(definition.quantities.filter(item => item.id.startsWith('codeLength-')).length, Object.keys(fixture.codes).length, '指定符号の各符号長を数量として用意');
  equal(definition.tasks.map(item => item.id), ['originalBits', 'compressedBits', 'rate'], '原稿fixedBitsと指定符号木を使う3段階');
  const sixes = definition.sources.filter(item => item.unit === 'occurrence' && item.value === '6');
  if (sixes.length > 1) equal(new Set(sixes.map(item => item.symbol)).size, 1, '同じ6回のsourceは同じ記号へまとめる');
  const lengths = definition.sources.filter(item => item.unit === 'bit/occurrence');
  for (const item of lengths) {
    const sameValue = lengths.filter(other => other.value === item.value);
    if (sameValue.length > 1) equal(new Set(sameValue.map(other => other.symbol)).size, 1, `同じ符号長${item.value}bitのsource記号`);
  }

  const rows = definition.tasks.map((item, rowIndex) => ({
    id: `formula-${index}-${rowIndex}`,
    taskId: item.id,
    tokens: clone(item.expectedTokens),
    result: String(item.expected),
    resultUnit: item.answerUnit
  }));
  const draft = {
    rows,
    targets: Object.fromEntries(definition.tasks.map((item, rowIndex) => [item.id, rows[rowIndex].id])),
    answers: Object.fromEntries(definition.tasks.map(item => [item.id, String(item.expected)]))
  };
  judged = Formulas.grade(definition, draft);
  equal(judged.status, 'judged', `Huffman ${index + 1} 判定状態`);
  equal(judged.formulaCorrect, true, `Huffman ${index + 1} 全立式`);
  equal(judged.answerCorrect, true, `Huffman ${index + 1} 全解答`);
  const expectedRate = Formula.evaluate(task(definition, 'rate').expectedTokens, { units: definition.units });
  equal(expectedRate.value, expectedAnswers[index][2], `Huffman ${index + 1} shared formula coreのrate計算`);

  // Rate may be built by referencing both correct preceding rows. The shared grader expands
  // their declared expressions and compares them with the full source formula.
  const referenced = clone(draft);
  referenced.rows[2].tokens = [
    { kind: 'reference', rowId: referenced.rows[1].id }, op('÷'),
    { kind: 'reference', rowId: referenced.rows[0].id }, op('×'), value(100)
  ];
  judged = Formulas.grade(definition, referenced, { taskId: 'rate' });
  equal(judged.status, 'judged', `Huffman ${index + 1} 先行式参照の判定`);
  equal(judged.tasks[0].formulaCorrect, true, `Huffman ${index + 1} 先行式参照は同じ式として採点`);
  equal(judged.tasks[0].answerCorrect, true, `Huffman ${index + 1} 参照した圧縮率`);

  const equivalent = clone(draft);
  const terms = [];
  let currentTerm = [];
  equivalent.rows[1].tokens.forEach(token => {
    if (token.kind === 'operator' && token.value === '+') {
      terms.push(currentTerm);
      currentTerm = [];
    } else currentTerm.push(token);
  });
  terms.push(currentTerm);
  equivalent.rows[1].tokens = terms.reverse().flatMap((term, termIndex) => {
    const swapped = [term[2], term[1], term[0]];
    return termIndex ? [op('+'), ...swapped] : swapped;
  });
  judged = Formulas.grade(definition, equivalent, { taskId: 'compressedBits' });
  equal(judged.tasks[0].formulaCorrect, true, `Huffman ${index + 1} 加算項と乗算因子の同値順`);

  const equivalentRate = clone(draft);
  equivalentRate.rows[2].tokens = [value(100), op('×'),
    { kind: 'group', body: clone(task(definition, 'compressedBits').expectedTokens) }, op('÷'),
    { kind: 'group', body: clone(task(definition, 'originalBits').expectedTokens) }];
  judged = Formulas.grade(definition, equivalentRate, { taskId: 'rate' });
  equal(judged.tasks[0].formulaCorrect, true, `Huffman ${index + 1} 100を先に掛ける同値式`);

  // The rate can also stand on its own using the complete quantities formula.
  judged = Formulas.grade(definition, {
    rows: [{ ...clone(rows[2]), id: `standalone-rate-${index}`, tokens: clone(task(definition, 'rate').expectedTokens) }],
    targets: { rate: `standalone-rate-${index}` },
    answers: { rate: String(expectedAnswers[index][2]) }
  }, { taskId: 'rate' });
  equal(judged.status, 'judged', `Huffman ${index + 1} 率だけの独立判定`);
  equal(judged.tasks[0].formulaCorrect, true, `Huffman ${index + 1} 率だけでも立式を確認`);

  const inverse = clone(draft);
  inverse.rows[2].tokens = [
    { kind: 'reference', rowId: inverse.rows[0].id }, op('÷'),
    { kind: 'reference', rowId: inverse.rows[1].id }, op('×'), value(100)
  ];
  judged = Formulas.grade(definition, inverse, { taskId: 'rate' });
  equal(judged.tasks[0].formulaCorrect, false, `Huffman ${index + 1} 逆比を拒否`);

  const answerOnly = { rows: [{ id: `answer-only-${index}`, taskId: 'rate', tokens: [], result: '', resultUnit: '' }], targets: { rate: `answer-only-${index}` }, answers: { rate: String(expectedAnswers[index][2]) } };
  judged = Formulas.grade(definition, answerOnly, { taskId: 'rate' });
  equal(judged.status, 'invalid', `Huffman ${index + 1} 答えだけでは立式判定しない`);

  const wrongUnit = clone(draft);
  wrongUnit.rows[0].resultUnit = '';
  judged = Formulas.grade(definition, wrongUnit);
  equal(judged.tasks.find(item => item.id === 'originalBits').formulaCorrect, true, `Huffman ${index + 1} 式と答えの判定は分ける`);
  ok(judged.rows.some(row => row.id === wrongUnit.rows[0].id && row.calculationCorrect === false), `Huffman ${index + 1} 単位なしの途中結果を誤答にする`);

  const arithmeticMistake = clone(draft);
  arithmeticMistake.rows[0].result = String(expectedAnswers[index][0] + 1);
  judged = Formulas.grade(definition, arithmeticMistake);
  equal(judged.tasks.find(item => item.id === 'originalBits').formulaCorrect, true, `Huffman ${index + 1} 正しい元式は計算ミスでも正しい`);
  ok(judged.rows.some(row => row.calculationCorrect === false), `Huffman ${index + 1} 計算ミスを個別検出`);
  arithmeticMistake.rows[0].result = String(expectedAnswers[index][0]);
  judged = Formulas.grade(definition, arithmeticMistake);
  equal(judged.answerCorrect, true, `Huffman ${index + 1} 修正後に再判定`);

  const badAnswer = clone(draft);
  badAnswer.answers.rate = String(expectedAnswers[index][2] + 1);
  judged = Formulas.grade(definition, badAnswer, { taskId: 'rate' });
  equal(judged.tasks[0].formulaCorrect, true, `Huffman ${index + 1} 答え誤りでも式を独立判定`);
  equal(judged.tasks[0].answerCorrect, false, `Huffman ${index + 1} 誤った圧縮率`);
}

rejects(() => Formulas.defineHuffman(-1), '負のindex');
rejects(() => Formulas.defineHuffman(2), '範囲外index');
rejects(() => Formulas.defineHuffman(0.5), '整数以外index');
assert.equal(typeof Formulas.grade, 'function', 'grade APIを公開');
assert.equal(typeof Formulas.gradeRow, 'function', 'gradeRow APIを公開');
checks += 2;
console.log(`compression-formulas: ${checks}件の検証に合格（RLE、原稿Huffman 2問、由来、単位、先行参照、式/答え分離、再判定）`);
