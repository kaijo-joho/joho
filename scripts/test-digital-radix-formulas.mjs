import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const Formulas = require('../js/digital-radix-formulas.js');
const value = (n, unit = '') => ({ kind: 'value', value: String(n), unit });
const op = value => ({ kind: 'operator', value });
const clone = object => JSON.parse(JSON.stringify(object));
const expected = [21, 26, 57, 76, 86, 204, 164, 79, 109, 153];
const page = await readFile(new URL('../dr02.html', import.meta.url), 'utf8');
function draft(definition, tokens = definition.tasks[0].expectedTokens) {
  return { rows: [{ id: 'row', taskId: 'answer', tokens: clone(tokens), result: '', resultUnit: '', answerOpen: true }], targets: { answer: 'row' }, answers: { answer: String(definition.tasks[0].expected) } };
}
for (const [i, id] of Formulas.QUESTION_IDS.entries()) {
  const definition = Formulas.define(id), correct = draft(definition);
  assert.equal(definition.tasks[0].expected, expected[i], id);
  assert.ok(page.includes(`data-db-question="${id}" data-db-formula-question="radix"`), `${id}: 対応するHTMLに接続`);
  const result = Formulas.grade(definition, correct);
  assert.equal(result.status, 'judged', id);
  assert.equal(result.formulaCorrect, true, id);
  assert.equal(result.answerCorrect, true, id);
  const answerOnly = Formulas.grade(definition, draft(definition, [value(expected[i])]));
  assert.equal(answerOnly.formulaCorrect, false, `${id}: 数値の答えだけでは立式正解にしない`);
  assert.equal(answerOnly.answerCorrect, true, `${id}: 答えとは別に判定`);
  const wrong = draft(definition); wrong.rows[0].tokens.push(op('+'), value(1));
  assert.equal(Formulas.grade(definition, wrong).formulaCorrect, false, `${id}: 桁の重みの誤り`);
  // カードのsymbolはUIには保持されない。値と単位だけで同じ式を組める。
  const realCards = JSON.parse(JSON.stringify(correct), (key, v) => key === 'symbol' ? undefined : v);
  assert.equal(Formulas.grade(definition, realCards).formulaCorrect, true, `${id}: 実際のカード`);
}
const binary = Formulas.define('rx-binary-6');
const explicitZeros = draft(binary, [value(1, 'digit'), op('×'), value(16), op('+'), value(0), op('×'), value(8), op('+'), value(1, 'digit'), op('×'), value(4), op('+'), value(0), op('×'), value(2), op('+'), value(1, 'digit')]);
assert.equal(Formulas.grade(binary, explicitZeros).formulaCorrect, true, '0の項は省略しても含めても同じ');
const reordered = draft(binary, [value(1, 'digit'), op('+'), value(4), op('×'), value(1, 'digit'), op('+'), value(16), op('×'), value(1, 'digit')]);
assert.equal(Formulas.grade(binary, reordered).formulaCorrect, true, '和と積の順序、計算済みの位の重み');
const fullWidth = draft(binary); fullWidth.answers.answer = '２１';
assert.equal(Formulas.grade(binary, fullWidth).answerCorrect, true, '全角の最終回答');
const hexadecimal = Formulas.define('rx-hex-4'), wrongBase = draft(hexadecimal);
wrongBase.rows[0].tokens[2].base[0].value = '10';
assert.equal(Formulas.grade(hexadecimal, wrongBase).formulaCorrect, false, '16進数を10の位取りにしない');
assert.throws(() => Formulas.define('rx-binary-1'), /問題ID/, '2進表記の入力問題は専用UIを保つ');
console.log('digital-radix-formulas: 10問の位取り、同値式、桁の省略、出自と最終回答を検証');
