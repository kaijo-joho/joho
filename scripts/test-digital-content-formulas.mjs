import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Formula = require('../js/lesson-formula-core.js');
const Text = require('../js/digital-text-core.js');
const Color = require('../js/digital-color-core.js');
const Formulas = require('../js/digital-content-formulas.js');

const expectedCounts = new Map([
  ['dtx-question-5', 1], ['dtx-question-7', 1], ['dcl-question-4', 3],
  ['dcl-question-5', 3], ['dcl-question-7', 3]
]);
assert.deepEqual(Formulas.QUESTION_IDS, [...expectedCounts.keys()]);
let judgment;

const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
const op = operator => ({ kind: 'operator', value: operator });
const power = (base, exponent) => ({ kind: 'power', base, exponent });
const group = body => ({ kind: 'group', body });

function correctTokens(task, targets = {}) {
  if (task.rule === 'minimum-bits') {
    const n = task.expected;
    return [power([value(2)], [value(n - 1)]), op('<'), value(task.levels, task.boundUnit, task.boundSymbol), op('<='), power([value(2)], [value(n)])];
  }
  function remap(tokens) {
    return tokens.map(token => {
      if (token.kind === 'reference' && String(token.rowId).startsWith('$task:')) {
        const taskId = String(token.rowId).slice('$task:'.length);
        return { ...token, rowId: targets[taskId] };
      }
      if (token.kind === 'group') return { ...token, body: remap(token.body) };
      if (token.kind === 'power') return { ...token, base: remap(token.base), exponent: remap(token.exponent) };
      if (token.kind === 'fraction') return { ...token, numerator: remap(token.numerator), denominator: remap(token.denominator) };
      return token;
    });
  }
  return remap(structuredClone(task.expectedTokens));
}

function correctDraft(definition) {
  const targets = Object.fromEntries(definition.tasks.map(task => [task.id, `row-${task.id}`]));
  const rows = definition.tasks.map(task => ({
    id: targets[task.id], taskId: task.id, tokens: correctTokens(task, targets),
    result: String(task.expected), resultUnit: task.answerUnit
  }));
  return {
    rows,
    targets: Object.fromEntries(definition.tasks.map(task => [task.id, `row-${task.id}`])),
    answers: Object.fromEntries(definition.tasks.map(task => [task.id, String(task.expected)]))
  };
}

function checked(definition, draft, taskId, label) {
  const result = Formulas.grade(definition, draft, { taskId });
  assert.equal(result.status, 'judged', `${label}: 判定できる (${result.message})`);
  const judgment = result.tasks.find(task => task.id === taskId);
  assert.ok(judgment, `${label}: 小問の判定がある`);
  return judgment;
}

function flatten(tokens, result = []) {
  for (const token of tokens || []) {
    if (token.kind === 'value') result.push(token);
    else if (token.kind === 'group') flatten(token.body, result);
    else if (token.kind === 'power') { flatten(token.base, result); flatten(token.exponent, result); }
    else if (token.kind === 'fraction') { flatten(token.numerator, result); flatten(token.denominator, result); }
  }
  return result;
}

function assertPaletteValuesAreAvailable(definition, task) {
  const palette = task.palette || { quantities: definition.quantities.map(item => item.id), constants: definition.constants.map(item => item.id) };
  const quantities = new Map(definition.quantities.filter(item => palette.quantities.includes(item.id)).map(item => [`${item.value}|${item.unit}`, item]));
  const constants = new Set(definition.constants.filter(item => palette.constants.includes(item.id)).map(item => `${item.value}|${item.unit}`));
  for (const token of flatten(correctTokens(task, Object.fromEntries(definition.tasks.map(item => [item.id, `row-${item.id}`]))))) {
    if (token.symbol) assert.ok(quantities.has(`${token.value}|${token.unit || ''}`), `${task.id}: source ${token.symbol} は数量カード`);
    else assert.ok(constants.has(`${token.value}|${token.unit || ''}`) || quantities.has(`${token.value}|${token.unit || ''}`)
      || task.rule === 'minimum-bits', `${task.id}: ${token.value} ${token.unit || '(単位なし)'} は表示可能なカードまたは比較式の入力欄`);
  }
  for (const id of palette.constants) {
    const item = definition.constants.find(entry => entry.id === id);
    assert.ok(item, `${task.id}: constant ${id} が宣言済み`);
    assert.equal(item.unit, '', `${task.id}: 換算・基数定数は単位なし`);
  }
}

for (const [questionId, count] of expectedCounts) {
  const definition = Formulas.define(questionId);
  assert.equal(definition.tasks.length, count, `${questionId}: 既存の回答数を維持`);
  assert.ok(definition.tasks.every(task => task.id && task.label), `${questionId}: 各回答に識別子と意味のあるラベルがある`);
  const draft = correctDraft(definition);
  assert.equal(Formulas.gradeRow(definition, draft, draft.rows[0].id).status, 'checked', `${questionId}: 途中式は単独判定APIを使う`);
  for (const task of definition.tasks) {
    const result = checked(definition, draft, task.id, `${questionId}/${task.id}`);
    assert.equal(result.formulaCorrect, true, `${questionId}/${task.id}: 正しい式`);
    assert.equal(result.answerCorrect, true, `${questionId}/${task.id}: 正しい答え`);
    assertPaletteValuesAreAvailable(definition, task);
  }
}

for (const [filename, questionIds] of [
  ['dr21.html', ['dtx-question-5', 'dtx-question-7']],
  ['dr22.html', ['dcl-question-4', 'dcl-question-5', 'dcl-question-7']]
]) {
  const html = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
  const prefix = filename === 'dr21.html' ? 'dtx' : 'dcl';
  assert.deepEqual([...html.matchAll(new RegExp(`data-db-question="(${prefix}-question-\\d+)"`, 'g'))].map(match => match[1]),
    Array.from({ length: 8 }, (_, index) => `${prefix}-question-${index + 1}`), `${filename}: 問題数・順番を維持`);
  for (const questionId of questionIds) {
    const form = html.match(new RegExp(`<form\\b(?=[^>]*\\bdata-db-question="${questionId}")[^>]*>[\\s\\S]*?</form>`))?.[0];
    assert.ok(form, `${filename}/${questionId}: フォームを維持`);
    assert.match(form, /data-db-formula-question="content"/, `${questionId}: content adapterへ接続`);
    assert.match(form, /data-db-formula-builder/, `${questionId}: 共通Builderのhostがある`);
    assert.match(form, /data-db-feedback/, `${questionId}: 共通feedbackを維持`);
    assert.match(form, /<button type="reset"/, `${questionId}: resetを維持`);
    assert.doesNotMatch(form, /<button type="submit"|data-db-answer-part=/, `${questionId}: 古い回答欄・送信採点を除去`);
    assert.doesNotMatch(form, /data-db-step-next|data-db-step-reset/, `${questionId}: 古い段階解説ボタンを除去`);
    assert.match(form, /<summary>解答を見る<\/summary>/, `${questionId}: 全手順を一括表示するdetails`);
  }
}

const ascii = Formulas.define('dtx-question-5');
assert.equal(ascii.tasks[0].expected, Text.asciiEntry(127).code + 1, 'ASCIIの128通りは文字コアの範囲から導く');
const asciiWrong = correctDraft(ascii);
asciiWrong.rows[0].tokens = [power([value(2)], [value(8)])];
judgment = checked(ascii, asciiWrong, 'answer', 'ASCIIのbit数を取り違える');
assert.equal(judgment.formulaCorrect, false, '誤った指数を正しい最終回答で隠せない');
assert.equal(judgment.answerCorrect, true, '式と最終数値の採点は分かれる');
const answerOnly = correctDraft(ascii);
answerOnly.rows[0].tokens = [value(128)];
judgment = checked(ascii, answerOnly, 'answer', '答えだけを置く');
assert.equal(judgment.formulaCorrect, false, '答えだけでは立式にならない');

const utf8 = Formulas.define('dtx-question-7');
assert.equal(utf8.tasks[0].expected, Text.utf8('Aあ').byteLength, 'UTF-8の正解は文字コアから導く');
const utf8Wrong = correctDraft(utf8);
utf8Wrong.rows[0].tokens = [value(1, 'B'), op('+'), value(4, 'B')];
judgment = checked(utf8, utf8Wrong, 'answer', 'UTF-8の中間バイト数を取り違える');
assert.equal(judgment.formulaCorrect, false);
assert.equal(judgment.answerCorrect, true);
const utf8Equivalent = correctDraft(utf8);
utf8Equivalent.rows[0].tokens.reverse();
assert.equal(checked(utf8, utf8Equivalent, 'answer', '足し算の順序を変える').formulaCorrect, true, '加算順序の同値式を通す');
utf8Equivalent.answers.answer = '４';
assert.equal(checked(utf8, utf8Equivalent, 'answer', '全角の最終回答').answerCorrect, true, '共通Coreの全角数字正規化を使う');

const eightBit = Formulas.define('dcl-question-4');
assert.deepEqual(eightBit.tasks.map(task => task.expected), [Color.depth(8).levels, Color.depth(8).totalBits, Color.depth(8).colors]);
const wrongColorCount = correctDraft(eightBit);
for (const task of eightBit.tasks) for (const tokens of task.expectedAlternatives || []) {
  const alternate = correctDraft(eightBit);
  alternate.rows.find(row => row.taskId === task.id).tokens = structuredClone(tokens);
  assert.equal(checked(eightBit, alternate, task.id, `元の解説の別式/${task.id}`).formulaCorrect, true);
}
wrongColorCount.rows.find(row => row.taskId === 'colors').tokens = [power([value(2)], [group([value(8), op('+'), value(3)])])];
judgment = checked(eightBit, wrongColorCount, 'colors', '色数の指数式誤り');
assert.equal(judgment.formulaCorrect, false);
assert.equal(judgment.answerCorrect, true);

const colors4096 = Formulas.define('dcl-question-5');
const minimum = colors4096.tasks[0];
assert.equal(minimum.rule, 'minimum-bits', '4,096色の全体bit数はpower-bounds比較で確かめる');
assert.deepEqual(minimum.scaffold, { type: 'power-bounds', base: 2 });
assert.equal(colors4096.sources.some(source => source.id === 'totalBits'), false, '導出値12は問題の与条件として認定しない');
assert.equal(colors4096.quantities.some(quantity => quantity.id === 'totalBits'), false, '導出された12bitを数量カードに出さない');
assert.deepEqual(colors4096.tasks.slice(1).map(task => task.palette.quantities), [['channels'], ['channels']], '後続taskのパレットからも12bitカードを隠す');
assert.deepEqual(colors4096.tasks.slice(1).map(task => task.expected), [Color.depth(4).bitsPerChannel, Color.depth(4).levels]);
const referenceDraft = correctDraft(colors4096);
const skippedDerivation = correctDraft(colors4096);
skippedDerivation.rows[1].tokens = [value(12, 'bitCount'), op('÷'), value(3, 'colorChannel')];
assert.equal(checked(colors4096, skippedDerivation, 'bitsPerChannel', '前式を省いた12bit').formulaCorrect, false, '導出済みの数値だけで比較の出自を代用しない');
assert.deepEqual(referenceDraft.rows[1].tokens[0], { kind: 'reference', rowId: 'row-totalBits' }, '各成分の式は最小bit比較で入力した全体bit数を参照');
assert.deepEqual(referenceDraft.rows[2].tokens[0].exponent[0].body[0], { kind: 'reference', rowId: 'row-totalBits' }, '段階数の式も入力済みの結論を参照');
for (const task of colors4096.tasks.slice(1)) {
  judgment = checked(colors4096, referenceDraft, task.id, `比較結論の参照/${task.id}`);
  assert.equal(judgment.formulaCorrect, true, `${task.id}: 比較の由来を引き継ぐ参照式`);
  assert.equal(judgment.answerCorrect, true, `${task.id}: 比較結論12から導く答え`);
}
const boundaryWrong = correctDraft(colors4096);
boundaryWrong.rows[0].tokens = [power([value(2)], [value(12)]), op('<'), value(4096, 'colors', 'colors'), op('<='), power([value(2)], [value(12)])];
judgment = checked(colors4096, boundaryWrong, 'totalBits', '最小bit比較の境界誤り');
assert.equal(judgment.formulaCorrect, false, '2^12 < 4096 は境界として誤り');
assert.equal(judgment.answerCorrect, true, '境界式と結論の数値を分けて判定');
const divideAsMultiply = correctDraft(colors4096);
divideAsMultiply.rows.find(row => row.taskId === 'bitsPerChannel').tokens = [{ kind: 'reference', rowId: 'row-totalBits' }, op('×'), value(3, 'colorChannel', 'channels')];
judgment = checked(colors4096, divideAsMultiply, 'bitsPerChannel', '成分へ分ける演算方向の誤り');
assert.equal(judgment.formulaCorrect, false);
assert.equal(judgment.answerCorrect, true);

const hex = Formulas.define('dcl-question-7');
const hexDraft = correctDraft(hex);
const red = hexDraft.rows.find(row => row.taskId === 'red');
const reorderedHex = [red.tokens[4], op('+'), red.tokens[2], op('×'), red.tokens[0]];
// 等価な 10 + 16×12 の順にも、同じ情報源を要求して通す。
red.tokens = reorderedHex;
assert.equal(checked(hex, hexDraft, 'red', '#CA の桁順を入れ替える').formulaCorrect, true, '乗算と加算の同値な項順を受け入れる');
red.tokens = [value(202)];
judgment = checked(hex, hexDraft, 'red', 'RGB値だけを置く');
assert.equal(judgment.formulaCorrect, false, '答えだけの定数は通さない');
assert.equal(judgment.answerCorrect, true);
assert.equal(hex.sources.some(source => ['202', '49', '39'].includes(source.value)), false, 'RGBの最終回答を数量カードで先出ししない');

assert.throws(() => Formulas.define('dcl-question-9'), RangeError, '未定義の問題IDを拒否');

const adapterSource = readFileSync(new URL('../js/digital-content-formulas.js', import.meta.url), 'utf8');
const graderStub = { grade: () => ({}), gradeRow: () => ({}) };
const textOnlyContext = {
  DigitalTextCore: { asciiEntry: code => ({ code }) },
  LessonFormulaGrader: graderStub
};
vm.runInNewContext(adapterSource, textOnlyContext);
assert.equal(textOnlyContext.DigitalContentFormulas.define('dtx-question-5').tasks[0].expected, 128, 'dr21はTextCoreだけで起動できる');
const colorOnlyContext = {
  DigitalColorCore: { depth: bits => ({ bitsPerChannel: bits, levels: 2 ** bits, totalBits: 3 * bits, colors: 2 ** (3 * bits) }) },
  LessonFormulaGrader: graderStub
};
vm.runInNewContext(adapterSource, colorOnlyContext);
assert.equal(colorOnlyContext.DigitalContentFormulas.define('dcl-question-4').tasks[0].expected, 256, 'dr22はColorCoreだけで起動できる');
assert.throws(() => colorOnlyContext.DigitalContentFormulas.define('dtx-question-5'), /DigitalTextCore/, '未読込の問題別coreはその問題の定義時に明示する');
console.log('digital content formula tests passed');
