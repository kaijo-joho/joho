import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Grader = require('../js/lesson-formula-grader.js');
const Sound = require('../js/sound-formulas.js');
const Media = require('../js/media-formulas.js');

const value = (number, unit = '') => ({ kind: 'value', value: String(number), unit });
const op = operator => ({ kind: 'operator', value: operator });
const power = exponent => ({ kind: 'power', base: [value(2)], exponent: [value(exponent)] });

function minimumDefinition(levels) {
  const expected = { 16: 4, 17: 5, 32: 5 }[levels];
  return {
    id: `minimum-${levels}`,
    units: { '': { label: '単位なし', dimensions: {} }, levels: { label: '段階', dimensions: {} } },
    quantities: [{ id: 'levels', label: '区別する段階数', value: String(levels), unit: 'levels' }],
    constants: [{ id: 'two', label: '2進数の基数', value: '2', unit: '' }],
    sources: [{ id: 'levels', value: String(levels), unit: 'levels', symbol: 'levels' }],
    tasks: [{
      id: 'bits', label: '必要な最小のビット数', answerUnit: '', answerUnitLabel: '単位なし', expected,
      expectedTokens: [], rule: 'minimum-bits', levels, boundUnit: 'levels', boundSymbol: 'levels', answerIsResult: false,
      scaffold: { type: 'power-bounds', base: 2 }
    }]
  };
}

function scaffoldDraft(definition, values = {}) {
  const task = definition.tasks[0];
  const expected = task.expected;
  const lower = values.lower ?? expected - 1;
  const bound = values.bound ?? task.levels;
  const upper = values.upper ?? expected;
  const answer = values.answer ?? expected;
  return {
    rows: [{ id: 'row-1', taskId: task.id, tokens: [power(lower), op('<'), value(bound, task.boundUnit), op('<='), power(upper)], result: '', resultUnit: '' }],
    targets: { [task.id]: 'row-1' },
    answers: { [task.id]: String(answer) }
  };
}

function taskResult(result) {
  assert.equal(result.tasks.length, 1, '最小bit問題は小問を1つ返す');
  return result.tasks[0];
}

// 16（ちょうど2の累乗）と、その前後で同じ固定穴埋め規則を使う。
for (const levels of [16, 17, 32]) {
  const definition = minimumDefinition(levels);
  const task = taskResult(Grader.grade(definition, scaffoldDraft(definition)));
  assert.equal(task.formulaCorrect, true, `${levels}段階: 左右のべき乗と中央の段階数が正しい`);
  assert.equal(task.answerCorrect, true, `${levels}段階: 最小bitの結論が正しい`);
  assert.deepEqual(task.fields, { lower: true, bound: true, upper: true }, `${levels}段階: 3つの穴を個別に正答とする`);
}

const seventeen = minimumDefinition(17);
for (const [field, values] of [
  ['lower', { lower: 3 }],
  ['bound', { bound: 16 }],
  ['upper', { upper: 6 }]
]) {
  const task = taskResult(Grader.grade(seventeen, scaffoldDraft(seventeen, values)));
  assert.equal(task.formulaCorrect, false, `${field}: 穴の誤りは立式不正解`);
  assert.equal(task.answerCorrect, true, `${field}: 他の正しい最終回答とは別に判定する`);
  assert.equal(task.fields[field], false, `${field}: 該当する穴だけを不正として返す`);
}
const wrongAnswer = taskResult(Grader.grade(seventeen, scaffoldDraft(seventeen, { answer: 4 })));
assert.equal(wrongAnswer.formulaCorrect, true, '比較式が正しければ立式は正解');
assert.equal(wrongAnswer.answerCorrect, false, '最終bitの誤りは別に判定する');

for (const [label, values] of [
  ['左の指数が未入力', { lower: '' }],
  ['中央が不正な文字列', { bound: '十七' }],
  ['右の指数が非整数', { upper: '5.5' }]
]) {
  const result = Grader.grade(seventeen, scaffoldDraft(seventeen, values));
  assert.equal(result.status, 'invalid', `${label}: 採点保留にする`);
  assert.match(result.message, /まだ判定していません/, `${label}: 判定保留であることを返す`);
}

// 教材ごとの公開APIは同じ共通graderへ委譲し、既存の最小bit問題も通る。
assert.equal(Sound.grade, Grader.grade, 'SoundFormulas.gradeは共通graderを使う');
assert.equal(Sound.gradeRow, Grader.gradeRow, 'SoundFormulas.gradeRowは共通graderを使う');
assert.equal(Media.grade, Grader.grade, 'MediaFormulas.gradeは共通graderを使う');
assert.equal(Media.gradeRow, Grader.gradeRow, 'MediaFormulas.gradeRowは共通graderを使う');

const sound = Sound.define({ id: 'sound-17', type: 'bitsFromLevels', params: { levels: 17 } });
const soundTask = sound.tasks[0];
const soundDraft = {
  rows: [{ id: 'sound-row', taskId: soundTask.id, tokens: [power(4), op('<'), value(17, 'levels'), op('<='), power(5)], result: '', resultUnit: '' }],
  targets: { answer: 'sound-row' }, answers: { answer: '5' }
};
assert.equal(Sound.grade(sound, soundDraft).formulaCorrect, true, 'SoundFormulas経由の17段階も共通判定で通る');

const colors = Media.defineImage('color-count');
const colorTask = colors.tasks.find(task => task.id === 'bits');
const colorDraft = {
  rows: [{ id: 'color-row', taskId: colorTask.id, tokens: [power(14), op('<'), value(32768, 'colors'), op('<='), power(15)], result: '', resultUnit: '' }],
  targets: { bits: 'color-row' }, answers: { bits: '15' }
};
const colorResult = Media.grade(colors, colorDraft, { taskId: 'bits' });
assert.equal(colorResult.status, 'judged', 'MediaFormulas経由の色数問題を小問単位で判定する');
assert.equal(colorResult.formulaCorrect, true, '32768色の左右比較を共通判定で通す');
assert.equal(colorResult.answerCorrect, true, '32768色の最小15bitを共通判定で通す');

console.log('lesson-formula-grader: ok');
