import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../js/output-formulas.js');
const d = F.definePrint();
const clone = x => structuredClone(x);
const v = (value, unit = '') => ({ kind: 'value', value: String(value), unit });
const op = value => ({ kind: 'operator', value });
const ref = rowId => ({ kind: 'reference', rowId });
const task = id => d.tasks.find(t => t.id === id);
function draft() {
  return {
    rows: d.tasks.map((t, i) => ({ id: `r${i}`, taskId: t.id, tokens: clone(t.expectedTokens), result: '', resultUnit: '', answerOpen: true })),
    targets: { width: 'r0', height: 'r1' }, answers: { width: '1600', height: '1200' }
  };
}
const judge = x => F.grade(d, x, { taskId: 'width' });
assert.deepEqual(d.tasks.map(t => t.expected), [1600, 1200], '原稿と計算コアの正解を保持');
assert.deepEqual(F.grade(d, draft()).tasks.map(t => [t.formulaCorrect, t.answerCorrect]), [[true, true], [true, true]]);
assert.ok(!d.quantities.concat(d.constants).some(q => ['1600', '1200', '4', '3'].includes(q.value)), '計算結果を選択肢に置かない');
const fullWidth = draft(); fullWidth.answers.width = '１,６００';
assert.equal(judge(fullWidth).answerCorrect, true, '全角・桁区切り回答を許可');
const alone = draft(); alone.rows[1].tokens = []; alone.answers.height = '';
assert.equal(judge(alone).status, 'judged', '横を縦と独立に判定');
const empty = draft(); empty.rows[0].tokens = [];
assert.equal(judge(empty).status, 'invalid', '未完成の式は判定を保留');
const answerOnly = draft(); answerOnly.rows[0].tokens = [v(1600, 'pixel')];
assert.equal(judge(answerOnly).formulaCorrect, false, '答えだけは立式正解にしない');
assert.equal(judge(answerOnly).answerCorrect, true, '式と答えは別々に判定');
const swapped = draft(); swapped.rows[0].tokens = clone(task('height').expectedTokens);
assert.equal(judge(swapped).formulaCorrect, false, '縦の長さを横へ使わない');
const wrongDirection = draft(); wrongDirection.rows[0].tokens[1] = op('×');
assert.equal(judge(wrongDirection).formulaCorrect, false, 'mm→インチの逆向き換算を通さない');
const missingUnits = draft(); missingUnits.rows[0].tokens[0].unit = '';
assert.equal(judge(missingUnits).formulaCorrect, false, '長さの単位と数量の出自を確認');
const typo = draft(); typo.rows[0].tokens[2].value = '2.54';
assert.equal(judge(typo).formulaCorrect, false, '換算値の桁誤りを通さない');
const wrongAnswer = draft(); wrongAnswer.answers.width = '1500';
assert.equal(judge(wrongAnswer).formulaCorrect, true);
assert.equal(judge(wrongAnswer).answerCorrect, false, '正しい式の計算ミスを区別');
const legacy = draft(); legacy.rows[0].tokens = clone(task('width').legacyExpectedTokens);
legacy.rows[0].tokens[4].unit = 'pixel/inch';
assert.equal(judge(legacy).formulaCorrect, true, 'mm/インチ・画素/インチの明示単位も許可');
const reordered = draft(); const tokens = task('width').expectedTokens;
reordered.rows[0].tokens = [clone(tokens[4]), op('×'), clone(tokens[0]), op('÷'), clone(tokens[2])];
assert.equal(judge(reordered).formulaCorrect, true, '同値な乗除の並べ替えを許可');
const fraction = draft(); fraction.rows[0].tokens = [{ kind: 'fraction', numerator: [clone(tokens[0])], denominator: [clone(tokens[2])] }, op('×'), clone(tokens[4])];
assert.equal(judge(fraction).formulaCorrect, true, '同値な分数を許可');
const steps = draft();
steps.rows.splice(0, 1,
  { id: 'inches', taskId: 'width', tokens: clone(tokens.slice(0, 3)), result: '4', resultUnit: 'inch', answerOpen: true },
  { id: 'pixels', taskId: 'width', tokens: [ref('inches'), op('×'), clone(tokens[4])], result: '', resultUnit: '', answerOpen: true });
steps.targets.width = 'pixels';
assert.equal(judge(steps).formulaCorrect, true, '元の換算式を保持した途中結果の参照を許可');
assert.equal(judge(steps).answerCorrect, true);
assert.equal(F.gradeRow(d, steps, 'inches').rows[0].calculationCorrect, true, '4インチの途中結果を判定');
const incorrectStep = clone(steps); incorrectStep.rows[0].result = '5'; incorrectStep.answers.width = '2000';
const incorrectResult = judge(incorrectStep);
assert.equal(incorrectResult.answerCorrect, false, '誤った参照元からの答えを自動補正しない');
assert.equal(incorrectResult.rows.find(r => r.id === 'inches').calculationCorrect, false);
assert.equal(incorrectStep.rows[0].result, '5', '入力した途中結果を維持');
const bareInches = clone(steps); bareInches.rows[0].tokens = [v(4, 'inch')];
assert.equal(judge(bareInches).formulaCorrect, false, '由来式のない4インチは立式正解にしない');
const wrongStepUnit = clone(steps); wrongStepUnit.rows[0].resultUnit = 'mm';
assert.equal(judge(wrongStepUnit).rows.find(r => r.id === 'inches').calculationCorrect, false, '途中結果の単位を確認');
const missingReference = clone(steps); missingReference.rows[1].tokens[0].rowId = 'missing';
assert.equal(judge(missingReference).status, 'invalid', '不正参照は判定保留');
const display = F.defineDisplay();
const refresh = F.defineRefresh();
function correctDraft(definition) {
  return {
    rows: definition.tasks.map((t, i) => ({ id: `r${i}`, taskId: t.id, tokens: clone(t.expectedTokens), result: '', resultUnit: '', answerOpen: true })),
    targets: Object.fromEntries(definition.tasks.map((t, i) => [t.id, `r${i}`])),
    answers: Object.fromEntries(definition.tasks.map(t => [t.id, String(t.expected)]))
  };
}
assert.deepEqual(display.tasks.map(t => t.expected), [1920, 128], 'ppiの画素数と逆算');
assert.deepEqual(refresh.tasks.map(t => t.expected), [15, 60, 4], 'フレーム数・更新回数・表示回数');
for (const definition of [display, refresh]) {
  assert.equal(F.grade(definition, correctDraft(definition)).formulaCorrect, true);
  assert.equal(F.grade(definition, correctDraft(definition)).answerCorrect, true);
  assert.equal(F.gradeChoice(definition).status, 'invalid', '未選択は判定保留');
  assert.equal(F.gradeChoice(definition, definition.choice.expected).correct, true);
  assert.ok(definition.choice.options.filter(x => x !== definition.choice.expected).every(x => F.gradeChoice(definition, x).correct === false));
}
const inversePpi = correctDraft(display);
inversePpi.rows[1].tokens[1] = op('×');
assert.equal(F.grade(display, inversePpi, { taskId: 'ppi' }).formulaCorrect, false, 'ppiの逆算で掛けない');
const alonePpi = correctDraft(display); alonePpi.rows[0].tokens = []; alonePpi.answers.pixels = '';
assert.equal(F.grade(display, alonePpi, { taskId: 'ppi' }).status, 'judged', '独立した逆算を判定');
const wrongFrameRate = correctDraft(refresh); wrongFrameRate.rows[0].tokens[0] = v(120, 'Hz');
assert.equal(F.grade(refresh, wrongFrameRate, { taskId: 'frames' }).formulaCorrect, false, 'Hzをフレームレートと混同しない');
const refreshAnswerOnly = correctDraft(refresh); refreshAnswerOnly.rows[2].tokens = [v(4, 'repeat')];
assert.equal(F.grade(refresh, refreshAnswerOnly, { taskId: 'repeats' }).formulaCorrect, false, '計算結果のみを立式として通さない');
const refreshReferences = correctDraft(refresh);
refreshReferences.rows[0].result = '15'; refreshReferences.rows[0].resultUnit = 'frame';
refreshReferences.rows[1].result = '60'; refreshReferences.rows[1].resultUnit = 'update';
refreshReferences.rows[2].tokens = [ref('r1'), op('÷'), ref('r0')];
assert.equal(F.grade(refresh, refreshReferences, { taskId: 'repeats' }).formulaCorrect, true, '前の2小問を参照');
assert.equal(F.grade(refresh, refreshReferences, { taskId: 'repeats' }).answerCorrect, true);
const incorrectFrames = clone(refreshReferences); incorrectFrames.answers.frames = '20'; incorrectFrames.rows[0].result = '20'; incorrectFrames.answers.repeats = '3';
const badFramesResult = F.grade(refresh, incorrectFrames, { taskId: 'repeats' });
assert.equal(badFramesResult.rows.find(r => r.id === 'r0').calculationCorrect, false, '参照元の計算ミスを検出');
assert.equal(badFramesResult.answerCorrect, false, '20枚を15枚へ自動補正しない');
assert.equal(incorrectFrames.answers.frames, '20');
const directRateRatio = correctDraft(refresh);
directRateRatio.rows[0].tokens = []; directRateRatio.rows[1].tokens = [];
directRateRatio.answers.frames = ''; directRateRatio.answers.updates = '';
directRateRatio.rows[2].tokens = [v(120, 'Hz'), op('÷'), v(30, 'fps')];
assert.equal(F.grade(refresh, directRateRatio, { taskId: 'repeats' }).formulaCorrect, true, '120Hz÷30fpsの同値な直接式も許可');
const reversedRatio = clone(refreshReferences); reversedRatio.rows[2].tokens = [ref('r0'), op('÷'), ref('r1')];
assert.equal(F.grade(refresh, reversedRatio, { taskId: 'repeats' }).formulaCorrect, false, '回数÷枚数の向きを確認');
assert.equal(F.gradeChoice(refresh, 'increase').correct, false, '新しいフレームが増えるという誤解を検出');
assert.equal(F.gradeChoice(display, '2').correct, false, 'ppi2倍を面積の画素数2倍としない');
console.log('ppi・fps/Hz・印刷の立式、単位、参照、確認問題の検証に合格しました。');
