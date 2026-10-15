import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Basics = require('../js/digital-basics-core.js');
const Formulas = require('../js/digital-basics-formulas.js');
const value = (n, unit = '') => ({ kind: 'value', value: String(n), unit });
const op = operator => ({ kind: 'operator', value: operator });
const power = (base, exponent) => ({ kind: 'power', base, exponent });
const clone = object => JSON.parse(JSON.stringify(object));

const page = readFileSync(new URL('../dr01.html', import.meta.url), 'utf8');
const exerciseSections = [...page.matchAll(/<section\b[^>]*data-lesson-slide-title="(?:通り数・ビット数の問題|単位換算の問題)"[\s\S]*?<\/section>/g)].map(match => match[0]).join('\n');
const pageQuestionIds = [...exerciseSections.matchAll(/data-db-question="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(pageQuestionIds, [...Formulas.QUESTION_IDS], '9・10枚目の全問題IDを原本順で扱う');
assert.ok(!pageQuestionIds.includes('bits8') && !pageQuestionIds.includes('bytes2'), 'IDはdr01原本のcount8/count2bytesを使う');

function minBitsEvidence(definition) {
  const task = definition.tasks[0];
  const bound = definition.sources.find(source => source.id === 'levels');
  return [power([value(2)], [value(task.expected - 1)]), op('<'), value(bound.value, bound.unit), op('<='), power([value(2)], [value(task.expected)])];
}

function cardTokens(definition, tokens) {
  return tokens.map(token => {
    if (token.kind === 'value') {
      if (token.symbol) {
        assert.ok(definition.quantities.some(item => item.id === token.symbol && item.value === token.value && item.unit === token.unit), `${definition.id}: 数量カード ${token.symbol} を使う`);
        return clone(token);
      }
      if (token.unit) {
        assert.ok(definition.constants.some(item => item.value === token.value && item.unit === ''), `${definition.id}: 換算値 ${token.value} の単位なしカードがある`);
        return { ...token, unit: '' };
      }
      assert.ok(definition.constants.some(item => item.value === token.value && item.unit === ''), `${definition.id}: 定数 ${token.value} の単位なしカードがある`);
      return clone(token);
    }
    if (token.kind === 'operator') return clone(token);
    if (token.kind === 'group') return { ...clone(token), body: cardTokens(definition, token.body) };
    if (token.kind === 'fraction') return { ...clone(token), numerator: cardTokens(definition, token.numerator), denominator: cardTokens(definition, token.denominator) };
    if (token.kind === 'power') return { ...clone(token), base: cardTokens(definition, token.base), exponent: cardTokens(definition, token.exponent) };
    return clone(token);
  });
}

function correctDraft(definition, answer = definition.tasks[0].expected) {
  const task = definition.tasks[0];
  const rowId = `row-${definition.id}`;
  const rowTokens = task.rule === 'minimum-bits' ? minBitsEvidence(definition) : cardTokens(definition, task.expectedTokens);
  return {
    rows: [{ id: rowId, taskId: task.id, tokens: rowTokens,
      result: String(task.rule === 'minimum-bits' ? 1 : task.expected), resultUnit: task.rule === 'minimum-bits' ? '' : task.answerUnit }],
    targets: { [task.id]: rowId }, answers: { [task.id]: String(answer) }
  };
}

function grade(definition, draft) {
  const judgment = Formulas.grade(definition, draft);
  assert.equal(judgment.status, 'judged', `${definition.id}: 判定できる`);
  assert.equal(judgment.tasks.length, 1, `${definition.id}: 小問を判定する`);
  return judgment.tasks[0];
}

const expected = Object.fromEntries(Formulas.QUESTION_IDS.map(id => [id, Basics.expectedAnswer(id)]));
assert.deepEqual(expected, {
  count8: 256, need120: 7, count2bytes: 65536, need500: 9, ratio: 8192,
  gb4: 4096, pixels: 1.5, square: 4, power: 20, decimal: 4000
}, '正解はDigitalBasicsCoreの既存正解と授業条件を保つ');

for (const id of Formulas.QUESTION_IDS) {
  const definition = Formulas.define(id);
  assert.equal(definition.tasks[0].expected, Basics.expectedAnswer(id), `${id}: 正解値をDigitalBasicsCoreから導出`);
  const result = grade(definition, correctDraft(definition));
  assert.equal(result.formulaCorrect, true, `${id}: 正しい式`);
  assert.equal(result.answerCorrect, true, `${id}: 正しい答え`);
}

assert.throws(() => Formulas.define('bits8'), /問題ID/, '古い案の別名を追加せず、原本IDを要求する');
assert.throws(() => Formulas.define('bytes2'), /問題ID/, '古い案の別名を追加せず、原本IDを要求する');

// 式と答えを別に採点し、答えだけの入力で立式を正解にしない。
for (const id of ['count8', 'gb4', 'pixels', 'square', 'decimal']) {
  const definition = Formulas.define(id);
  const draft = correctDraft(definition);
  draft.rows[0].tokens = [value(definition.tasks[0].expected, definition.tasks[0].answerUnit)];
  const result = grade(definition, draft);
  assert.equal(result.formulaCorrect, false, `${id}: 答えの定数だけでは式正解にしない`);
  assert.equal(result.answerCorrect, true, `${id}: 正しい数値回答は式と分離`);
}

// 基数・方向の取り違えを、答えの正誤と分けて検出する。
const decimal = Formulas.define('decimal');
const wrongDecimal = correctDraft(decimal);
wrongDecimal.rows[0].tokens[2] = value(1024, 'MB/GB');
let judged = grade(decimal, wrongDecimal);
assert.equal(judged.formulaCorrect, false, '1000倍換算の問題で1024を使わない');
assert.equal(judged.answerCorrect, true, '換算式を誤っても正しい答え欄の判定は分離');

const pixels = Formulas.define('pixels');
const wrongBitDirection = correctDraft(pixels);
wrongBitDirection.rows[0].tokens = [
  ...wrongBitDirection.rows[0].tokens.slice(0, 3), op('×'), value(8, 'B/bit'),
  ...wrongBitDirection.rows[0].tokens.slice(5)
];
judged = grade(pixels, wrongBitDirection);
assert.equal(judged.formulaCorrect, false, 'bitからBへ8を掛ける誤方向を不正解にする');
assert.equal(judged.answerCorrect, true, 'bit/Bの誤りと最終値は別に採点');

// 比較式は左・中央・右の根拠を個別に検査し、答えだけや広すぎる境界を通さない。
for (const [id, badTokens] of [
  ['need120', [power([value(2)], [value(5)]), op('<'), value(120, 'levels'), op('<='), power([value(2)], [value(8)])]],
  ['need500', [power([value(2)], [value(7)]), op('<'), value(500, 'levels'), op('<='), power([value(2)], [value(10)])]]
]) {
  const definition = Formulas.define(id);
  const draft = correctDraft(definition);
  draft.rows[0].tokens = badTokens;
  judged = grade(definition, draft);
  assert.equal(judged.formulaCorrect, false, `${id}: 真でも範囲が広すぎる比較を受け入れない`);
  assert.equal(judged.answerCorrect, true, `${id}: 指数の答えと比較式は別採点`);
}
for (const id of ['need120', 'need500']) {
  const definition = Formulas.define(id);
  const draft = correctDraft(definition);
  draft.rows[0].tokens = [value(definition.tasks[0].expected)];
  assert.equal(grade(definition, draft).formulaCorrect, false, `${id}: 必要bit数の答えだけでは根拠正解にしない`);
}

// 積の順序と分数表現は同値なら通し、換算方向と由来は維持する。
const gb = Formulas.define('gb4');
const reorderedGb = correctDraft(gb);
reorderedGb.rows[0].tokens = [value(1024, 'MB/GB'), op('×'), value(4, 'GB')];
assert.equal(grade(gb, reorderedGb).formulaCorrect, true, '積の順序を入れ替えた同値式を受け入れる');

const binaryPixels = Formulas.define('pixels');
const fractionPixels = correctDraft(binaryPixels);
fractionPixels.rows[0].tokens = [
  ...fractionPixels.rows[0].tokens.slice(0, 3),
  op('×'), { kind: 'fraction', numerator: [value(1)], denominator: [value(8)] }, op('×'), value(1, 'B/bit'),
  op('÷'), value(1024, 'B/KB'), op('÷'), value(1024, 'KB/MB')
];
assert.equal(grade(binaryPixels, fractionPixels).formulaCorrect, true, '掛ける1/8への置換など同値な分数式を受け入れる');

// 全角数字は共通coreのNFKC正規化で同じ数値として採点する。
const fullWidth = Formulas.define('count8');
assert.equal(grade(fullWidth, correctDraft(fullWidth, '２５６')).answerCorrect, true, '全角入力を既存の数値正規化規則で扱う');

const powerDefinition = Formulas.define('power');
const doubledExponent = correctDraft(powerDefinition);
doubledExponent.rows[0].tokens = [value(2), op('×'), { kind: 'value', value: '10', unit: '', symbol: 'unitExponent' }];
// source(10) が一つの数量カードなので、2×10 は指数式の等価な形。
assert.equal(grade(powerDefinition, doubledExponent).formulaCorrect, true, '指数10を2倍する同値式も数量の出自を保持して受け入れる');
const powerAnswerOnly = correctDraft(powerDefinition);
powerAnswerOnly.rows[0].tokens = [value(20)];
assert.equal(grade(powerDefinition, powerAnswerOnly).formulaCorrect, false, '指数20だけでは式正解にしない');
const powerIntermediate = Formulas.gradeRow(powerDefinition, correctDraft(powerDefinition), 'row-power');
assert.equal(powerIntermediate.status, 'checked', '途中式の単独判定APIを提供する');
assert.equal(powerIntermediate.rows[0].calculationCorrect, true, '途中式の手入力結果を共通graderで確認する');

// 大きな 2^8192 は計算させず、指数の導出式を正解にする。
const ratio = Formulas.define('ratio');
assert.equal(ratio.tasks[0].expected, 8192, '比の解答は巨大な累乗値ではなく指数');
const ratioWrongOrder = correctDraft(ratio);
ratioWrongOrder.rows[0].tokens = [ratio.tasks[0].expectedTokens[0], op('×'), value(8, 'bit/B'), op('×'), value(1024, 'B/KB')];
assert.equal(grade(ratio, ratioWrongOrder).formulaCorrect, true, '比の指数式で換算因子の積順を許容');

console.log(`DigitalBasicsFormulas: ${Formulas.QUESTION_IDS.length}問の定義・採点を確認しました。`);
