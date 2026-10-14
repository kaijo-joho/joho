import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Compression = require('../js/compression-core.js');
const Formula = require('../js/lesson-formula-core.js');
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

const expectedAnswers = [[40, 85], [120, 75]];
for (const [index, fixture] of Compression.HUFFMAN_QUESTIONS.entries()) {
  const mirroredCodes = Object.fromEntries(Object.entries(fixture.codes).map(([symbol, code]) => [symbol, [...code].map(bit => bit === '0' ? '1' : '0').join('')]));
  const mirrored = Formulas.defineHuffman(index, { codes: mirroredCodes });
  equal(mirrored.tasks.map(item => item.expected), expectedAnswers[index], '左右を入れ替えた自作木でも原稿と同じbit数と率');
  equal(Compression.decodeHuffman(Compression.encodeHuffman(fixture.encodeText, mirroredCodes), mirroredCodes), fixture.encodeText, '自作木の符号で符号化と復元が対応する');
}
const changedLengths = { A: '0', B: '10', C: '110', D: '111' };
const changedDefinition = Formulas.defineHuffman(0, { codes: changedLengths });
equal(changedDefinition.tasks.map(item => item.expected), [40, 95], '指定された木の符号長から率を計算する');
equal(changedDefinition.sources.find(item => item.id === 'compressedBits').value, '38', '自作木の合計bit数を参照する');
rejects(() => Formulas.defineHuffman(0, { codes: { A: '0', B: '00', C: '10', D: '11' } }), '接頭符号でない表は式の定義に使用しない');
rejects(() => Formulas.defineHuffman(0, { codes: { A: '0', B: '10', C: '11' } }), '文字種が不足した表は式の定義に使用しない');
for (const [index, fixture] of Compression.HUFFMAN_QUESTIONS.entries()) {
  const definition = Formulas.defineHuffman(index);
  equal(definition.tasks.map(item => item.expected), expectedAnswers[index], `Huffman ${index + 1} 原稿のbit数と率`);
  equal(definition.tasks.map(item => item.id), ['originalBits', 'rate'], '表の合計を重複して計算させない');
  equal(definition.quantities.map(item => Number(item.value)), index === 0 ? [2, 20, 34, 100] : [3, 40, 90, 100], '必要な数値だけを主パレットに用意');
  ok(definition.quantities.every(item => item.hideUnit === true), '数値候補は単位を省略する');
  equal(definition.sources.map(item => item.id), ['fixedBits', 'characters', 'compressedBits'], '頻度と符号長の同値カードを重複させず、100は定数として扱う');
  equal(definition.sources.find(item => item.id === 'compressedBits').unit, 'bit', '表の合計bit数の単位は採点用に保持する');
  equal(definition.constants.length, 0, '100を補助定数のメニューへ隠さない');

  const rows = definition.tasks.map((item, rowIndex) => ({
    id: `formula-${index}-${rowIndex}`, taskId: item.id, tokens: clone(item.expectedTokens),
    result: String(item.expected), resultUnit: item.answerUnit
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
  equal(Formula.evaluate(task(definition, 'rate').expectedTokens, { units: definition.units }).value, expectedAnswers[index][1], '共通式エンジンで表の合計から百分率を計算');

  // Use the table's total directly and reference the preceding original-bit formula.
  const referenced = clone(draft);
  referenced.rows[1].tokens = [source(definition, 'compressedBits'), op('÷'),
    { kind: 'reference', rowId: referenced.rows[0].id }, op('×'), value(100)];
  judged = Formulas.grade(definition, referenced, { taskId: 'rate' });
  equal(judged.status, 'judged', '表の合計と先行式の参照を判定');
  equal(judged.tasks[0].formulaCorrect, true, '表の合計を圧縮後のデータ量として採点');
  equal(judged.tasks[0].answerCorrect, true, '参照した圧縮率');

  const equivalentRate = clone(draft);
  equivalentRate.rows[1].tokens = [value(100), op('×'), source(definition, 'compressedBits'), op('÷'),
    { kind: 'group', body: clone(task(definition, 'originalBits').expectedTokens) }];
  equal(Formulas.grade(definition, equivalentRate, { taskId: 'rate' }).tasks[0].formulaCorrect, true, '100を先に掛ける同値式');

  judged = Formulas.grade(definition, {
    rows: [{ ...clone(rows[1]), id: `standalone-rate-${index}` }],
    targets: { rate: `standalone-rate-${index}` }, answers: { rate: String(expectedAnswers[index][1]) }
  }, { taskId: 'rate' });
  equal(judged.status, 'judged', '率だけの独立判定');
  equal(judged.tasks[0].formulaCorrect, true, '率だけでも立式を確認');

  const inverse = clone(draft);
  inverse.rows[1].tokens = [{ kind: 'reference', rowId: inverse.rows[0].id }, op('÷'), source(definition, 'compressedBits'), op('×'), value(100)];
  equal(Formulas.grade(definition, inverse, { taskId: 'rate' }).tasks[0].formulaCorrect, false, '逆比を拒否');
  const missing100 = clone(referenced);
  missing100.rows[1].tokens.splice(-2);
  equal(Formulas.grade(definition, missing100, { taskId: 'rate' }).tasks[0].formulaCorrect, false, '正しい答えを入力しても×100がなければ拒否');
  missing100.answers.rate = String(expectedAnswers[index][1] / 100);
  equal(Formulas.grade(definition, missing100, { taskId: 'rate' }).tasks[0].answerCorrect, false, '0.85%や0.75%を百分率の正解にしない');

  const bareOriginal = clone(draft);
  bareOriginal.rows[1].tokens = [source(definition, 'compressedBits'), op('÷'), value(expectedAnswers[index][0], 'bit'), op('×'), value(100)];
  equal(Formulas.grade(definition, bareOriginal, { taskId: 'rate' }).tasks[0].formulaCorrect, false, '圧縮前の計算済み値は元の式またはその参照が必要');
  const staleTotal = clone(referenced);
  staleTotal.rows[1].tokens[0].value = String(Number(staleTotal.rows[1].tokens[0].value) + 1);
  equal(Formulas.grade(definition, staleTotal, { taskId: 'rate' }).tasks[0].formulaCorrect, false, '表の誤った合計を正しい数量として採点しない');

  const answerOnly = { rows: [{ id: 'answer-only', taskId: 'rate', tokens: [], result: '', resultUnit: '' }], targets: { rate: 'answer-only' }, answers: { rate: String(expectedAnswers[index][1]) } };
  equal(Formulas.grade(definition, answerOnly, { taskId: 'rate' }).status, 'invalid', '答えだけでは立式判定しない');
  const wrongUnit = clone(draft);
  wrongUnit.rows[0].resultUnit = '';
  judged = Formulas.grade(definition, wrongUnit);
  equal(judged.tasks.find(item => item.id === 'originalBits').formulaCorrect, true, '式と答えの判定は分ける');
  ok(judged.rows.some(row => row.id === wrongUnit.rows[0].id && row.calculationCorrect === false), '単位なしの途中結果を誤答にする');

  const arithmeticMistake = clone(referenced);
  arithmeticMistake.rows[0].result = String(expectedAnswers[index][0] + 1);
  judged = Formulas.grade(definition, arithmeticMistake);
  equal(judged.tasks.find(item => item.id === 'originalBits').formulaCorrect, true, '正しい元式は計算ミスでも正しい');
  ok(judged.rows.some(row => row.calculationCorrect === false), '計算ミスを個別検出');
  arithmeticMistake.rows[0].result = String(expectedAnswers[index][0]);
  equal(Formulas.grade(definition, arithmeticMistake).answerCorrect, true, '修正後に再判定');
  const badAnswer = clone(draft);
  badAnswer.answers.rate = String(expectedAnswers[index][1] + 1);
  judged = Formulas.grade(definition, badAnswer, { taskId: 'rate' });
  equal(judged.tasks[0].formulaCorrect, true, '答え誤りでも式を独立判定');
  equal(judged.tasks[0].answerCorrect, false, '誤った圧縮率');
}

rejects(() => Formulas.defineHuffman(-1), '負のindex');
rejects(() => Formulas.defineHuffman(2), '範囲外index');
rejects(() => Formulas.defineHuffman(0.5), '整数以外index');
assert.equal(typeof Formulas.grade, 'function', 'grade APIを公開');
assert.equal(typeof Formulas.gradeRow, 'function', 'gradeRow APIを公開');
checks += 2;
console.log(`compression-formulas: ${checks}件の検証に合格（RLE、原稿Huffman 2問、由来、単位、先行参照、式/答え分離、再判定）`);
