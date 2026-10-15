import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Integer = require('../js/digital-integer-core.js');
const Real = require('../js/digital-real-core.js');
const Errors = require('../js/digital-errors-core.js');
const Formulas = require('../js/digital-number-formulas.js');
const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
const op = operator => ({ kind: 'operator', value: operator });
const clone = item => JSON.parse(JSON.stringify(item));
function stripSymbols(tokens) {
  return tokens.map(token => {
    const copy = clone(token);
    if (copy.kind === 'value') delete copy.symbol;
    if (copy.kind === 'group') copy.body = stripSymbols(copy.body);
    if (copy.kind === 'fraction') { copy.numerator = stripSymbols(copy.numerator); copy.denominator = stripSymbols(copy.denominator); }
    if (copy.kind === 'power') { copy.base = stripSymbols(copy.base); copy.exponent = stripSymbols(copy.exponent); }
    return copy;
  });
}

assert.deepEqual([...Formulas.QUESTION_IDS], [
  'di-check-1', 'di-check-2', 'di-check-3', 'df-question-1', 'df-question-3', 'de-question-1', 'de-question-2'
], '式ビルダーへ移す数値問題IDだけを列挙する');
const expectedByCore = {
  'di-check-1': [-6], 'di-check-2': [-37],
  'di-check-3': [Integer.range(8).min, Integer.range(8).max],
  'df-question-1': [Real.decodeFixed('01010101', 4, 8)],
  'df-question-3': [Real.fixedRange(4, 8).max, Real.fixedRange(4, 8).step],
  'de-question-1': [Number(Errors.roundBinaryFraction('0.3', 8, 'truncate').stored), Number(Errors.roundBinaryFraction('0.3', 8, 'truncate').error)],
  'de-question-2': [Number(Errors.geometricPartial(4).sum), Number(Errors.geometricPartial(4).remainder)]
};

function draftFor(definition, overrides = {}) {
  const rows = [];
  const targets = {};
  const answers = {};
  definition.tasks.forEach((task, index) => {
    const rowId = `row-${index}`;
    const tokens = clone(overrides[task.id]?.tokens ?? task.expectedTokens);
    const answer = overrides[task.id]?.answer ?? task.expected;
    rows.push({ id: rowId, taskId: task.id, tokens, result: String(answer), resultUnit: '' });
    targets[task.id] = rowId;
    answers[task.id] = String(answer);
  });
  return { rows, targets, answers };
}

for (const id of Formulas.QUESTION_IDS) {
  const definition = Formulas.define(id);
  assert.deepEqual(definition.tasks.map(task => task.expected), expectedByCore[id], `${id}: 正解は既存コアの計算値`);
  const sourceKeys = definition.sources.map(source => `${source.value}\u0000${source.unit}`);
  assert.equal(new Set(sourceKeys).size, sourceKeys.length, `${id}: 同値・同単位の数量カードを重複させない`);
  for (const source of definition.sources.filter(item => item.value === '0')) {
    assert.equal(source.symbol, undefined, `${id}: 0の桁はsymbolなしで式から省略できる`);
  }
  const correct = Formulas.grade(definition, draftFor(definition));
  assert.equal(correct.status, 'judged', `${id}: 判定できる`);
  assert.equal(correct.formulaCorrect, true, `${id}: 式が正しい`);
  assert.equal(correct.answerCorrect, true, `${id}: 答えが正しい`);
  const cardDraft = draftFor(definition);
  cardDraft.rows.forEach(row => { row.tokens = stripSymbols(row.tokens); });
  const cardResult = Formulas.grade(definition, cardDraft);
  assert.equal(cardResult.formulaCorrect, true, `${id}: symbolのない実カード値でもsourceを判定する`);

  const wrongAnswer = Formulas.grade(definition, draftFor(definition, { [definition.tasks[0].id]: { answer: definition.tasks[0].expected + 1 } }));
  assert.equal(wrongAnswer.tasks[0].formulaCorrect, true, `${id}: 正しい式と誤った答えを別々に判定する`);
  assert.equal(wrongAnswer.tasks[0].answerCorrect, false, `${id}: 計算誤答を自動修正しない`);

  const answerOnly = draftFor(definition);
  answerOnly.rows[0].tokens = [value(definition.tasks[0].expected)];
  const answerOnlyResult = Formulas.grade(definition, answerOnly);
  assert.equal(answerOnlyResult.tasks[0].formulaCorrect, false, `${id}: 数値だけでは立式正解にしない`);

  const rowCheck = Formulas.gradeRow(definition, draftFor(definition), 'row-0');
  assert.equal(rowCheck.status, 'checked', `${id}: 途中式の単独判定APIを保つ`);
}

const moduleSource = readFileSync(new URL('../js/digital-number-formulas.js', import.meta.url), 'utf8');
for (const [core, ids] of [
  [Integer, ['di-check-1', 'di-check-2', 'di-check-3']],
  [Real, ['df-question-1', 'df-question-3']],
  [Errors, ['de-question-1', 'de-question-2']]
]) {
  const context = { LessonFormulaGrader: require('../js/lesson-formula-grader.js') };
  if (core === Integer) context.DigitalIntegerCore = core;
  if (core === Real) context.DigitalRealCore = core;
  if (core === Errors) context.DigitalErrorsCore = core;
  vm.runInNewContext(moduleSource, context);
  ids.forEach(id => assert.equal(context.DigitalNumberFormulas.define(id).id, id, `${id}: ページ固有コアだけで定義できる`));
}

// Bit-position weights accept equivalent fraction/exponent forms and omitted zero terms.
const fixed = Formulas.define('df-question-1');
const fixedRange = Formulas.define('df-question-3');
for (const task of fixedRange.tasks) for (const tokens of task.expectedAlternatives || []) {
  const alternate = draftFor(fixedRange, { [task.id]: { tokens } });
  assert.equal(Formulas.grade(fixedRange, alternate, { taskId: task.id }).formulaCorrect, true, `${task.id}: 分数と負の指数の別解`);
}
const alternate = draftFor(fixed);
const tokens = alternate.rows[0].tokens;
const termStarts = [];
tokens.forEach((token, index) => { if (token.kind === 'value' && token.symbol) termStarts.push(index); });
const reordered = [];
for (const start of [...termStarts].reverse()) {
  const digit = tokens[start];
  const weight = tokens[start + 2];
  const mapped = String(weight.value) === '0.25'
    ? [digit, op('×'), { kind: 'fraction', numerator: [value(1)], denominator: [{ kind: 'power', base: [value(2)], exponent: [value(2)] }] }]
    : String(weight.value) === '0.0625'
      ? [digit, op('×'), { kind: 'power', base: [value(2)], exponent: [op('-'), value(4)] }]
        : String(weight.value) === '1'
          ? [digit, op('×'), { kind: 'power', base: [value(2)], exponent: [value(0)] }]
      : [digit, op('×'), weight];
  if (reordered.length) reordered.push(op('+'));
  reordered.push(...mapped);
}
reordered.push(op('+'), value(0), op('×'), value(8));
alternate.rows[0].tokens = reordered;
assert.equal(Formulas.grade(fixed, alternate).tasks[0].formulaCorrect, true, '積と和の並べ替え、分数表現、0項の省略を許容');

const files = ['dr11.html', 'dr12.html', 'dr13.html'];
const pages = Object.fromEntries(files.map(file => [file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')]));
const allQuestionIds = Object.values(pages).flatMap(html => [...html.matchAll(/<form\b[^>]*data-db-question="([^"]+)"/g)].map(match => match[1]));
for (const id of Formulas.QUESTION_IDS) {
  const html = pages[id.startsWith('di-') ? 'dr11.html' : id.startsWith('df-') ? 'dr12.html' : 'dr13.html'];
  assert.match(html, new RegExp(`<form\\b[^>]*data-db-formula-question="number"[^>]*data-db-question="${id}"`), `${id}: number式フォームへ結び付ける`);
  const form = html.match(new RegExp(`<form\\b[^>]*data-db-question="${id}"[\\s\\S]*?<\\/form>`))?.[0] || '';
  assert.match(form, /data-db-formula-builder/, `${id}: 共通式ビルダーを使う`);
  assert.match(form, /type="reset"/, `${id}: 入力を消す操作を残す`);
  assert.match(form, /data-db-feedback/, `${id}: 判定結果の表示先を残す`);
  assert.match(form, /<details[\s\S]*解答を見る/, `${id}: 全手順の解答detailsを残す`);
  assert.doesNotMatch(form, /data-db-step-next|data-db-step-reset/, `${id}: 段階送りを除く`);
}
assert.equal(allQuestionIds.filter(id => id.startsWith('di-complement-')).length, 8, 'dr11の補数8問を保つ');
assert.ok(pages['dr11.html'].includes('data-db-question="di-check-4"'), 'dr11の選択問題を保つ');
assert.ok(pages['dr12.html'].includes('data-db-question="df-question-2"') && pages['dr12.html'].includes('data-db-question="df-question-8"'), 'dr12の非対応問題を保つ');
assert.ok(pages['dr13.html'].includes('data-db-question="de-question-3"') && pages['dr13.html'].includes('data-db-question="de-question-8"'), 'dr13の非対応問題を保つ');

console.log(`DigitalNumberFormulas: ${Formulas.QUESTION_IDS.length}問の式・答え・同値式・ページ接続を確認しました。`);
