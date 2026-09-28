import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Formula = require('../js/lesson-formula-core.js');
const Sound = require('../js/sound-core.js');
const Formulas = require('../js/sound-formulas.js');

const value = (n, unit = '') => ({ kind: 'value', value: String(n), unit });
const op = operator => ({ kind: 'operator', value: operator });
const power = (base, exponent) => ({ kind: 'power', base, exponent });
const clone = value => JSON.parse(JSON.stringify(value));
const sourceToken = source => value(source.value, source.unit);
const source = (definition, id) => {
  const item = definition.sources.find(candidate => candidate.id === id);
  assert.ok(item, `${definition.id}: ${id} を式の数量として定義する`);
  return sourceToken(item);
};
const taskFor = (definition, id = 'answer') => {
  const task = definition.tasks.find(candidate => candidate.id === id);
  assert.ok(task, `${definition.id}: ${id} の設問を定義する`);
  return task;
};

const problemSpecs = [
  { id: 'period-10hz', type: 'periodFromRate', params: { sampleRate: 10 } },
  { id: 'rate-002sec', type: 'rateFromPeriod', params: { period: 0.02 } },
  { id: 'levels-4bit', type: 'levelsFromBits', params: { bitDepth: 4 } },
  { id: 'bits-32levels', type: 'bitsFromLevels', params: { levels: 32 } },
  { id: 'bits-17levels', type: 'bitsFromLevels', params: { levels: 17 } },
  { id: 'pdf-6000b', type: 'dataSize', params: { sampleRate: 200, seconds: 60, bitDepth: 4, channels: 1, answerUnit: 'B' } },
  { id: 'pdf-81920b', type: 'dataSize', params: { sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1, answerUnit: 'B' } },
  { id: 'pdf-80kb-binary', type: 'dataSize', params: { sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1, answerUnit: 'KB', base: 1024 } },
  { id: 'cd-one-second-decimal', type: 'dataSize', params: { sampleRate: 44100, seconds: 1, bitDepth: 16, channels: 2, answerUnit: 'KB', base: 1000 } },
  { id: 'cd-full-binary', type: 'dataSize', params: { sampleRate: 44100, seconds: 74 * 60 + 42, durationParts: { minutes: 74, seconds: 42 }, bitDepth: 16, channels: 2, answerUnit: 'MB', base: 1024 } },
  { id: 'high-resolution-binary', type: 'dataSize', params: { sampleRate: 192000, sampleRateUnit: 'kHz', seconds: 4 * 60 + 16, durationParts: { minutes: 4, seconds: 16 }, bitDepth: 24, channels: 2, answerUnit: 'MB', base: 1024 } }
];

function minBitsEvidence(definition) {
  const task = taskFor(definition);
  const levels = source(definition, 'levels');
  return [power([value(2)], [value(task.expected - 1)]), op('<'), levels, op('<='), power([value(2)], [value(task.expected)])];
}

function correctDraft(definition) {
  const rows = definition.tasks.map((task, index) => ({
    id: `row-${index + 1}`,
    tokens: task.rule === 'minimum-bits' ? minBitsEvidence(definition) : clone(task.expectedTokens),
    result: String(task.rule === 'minimum-bits' ? 1 : task.expected),
    resultUnit: task.rule === 'minimum-bits' ? '' : task.answerUnit
  }));
  return {
    rows,
    targets: Object.fromEntries(definition.tasks.map((task, index) => [task.id, rows[index].id])),
    answers: Object.fromEntries(definition.tasks.map(task => [task.id, String(task.expected)]))
  };
}

function judged(definition, draft, message) {
  const result = Formulas.grade(definition, draft);
  assert.equal(result.status, 'judged', `${definition.id}: ${message} は判定可能`);
  return result;
}

// sound-quiz.jsで定義する計算11問型は、SoundCoreと同じ答え・単位・立式で通る。
assert.equal(problemSpecs.length, 11, 'sound-quiz.jsの計算問題は11問型を保つ');
for (const spec of problemSpecs) {
  const definition = Formulas.define({ ...spec, tolerance: 1e-7 });
  const result = judged(definition, correctDraft(definition), '正しい立式');
  assert.equal(result.formulaCorrect, true, `${spec.id}: 立式`);
  assert.equal(result.answerCorrect, true, `${spec.id}: 最終回答`);
  for (const task of definition.tasks) {
    const expectedFromCore = spec.type === 'periodFromRate' ? Sound.samplingPeriod(spec.params.sampleRate)
      : spec.type === 'rateFromPeriod' ? 1 / spec.params.period
        : spec.type === 'levelsFromBits' ? Sound.quantizationLevels(spec.params.bitDepth)
          : spec.type === 'bitsFromLevels' ? Sound.requiredBitsForLevels(spec.params.levels)
            : (() => {
              const bytes = Sound.audioDataSize(spec.params).bytes;
              return spec.params.answerUnit === 'B' ? bytes : Sound.convertBytes(bytes, spec.params.answerUnit, spec.params.base);
            })();
    assert.equal(task.expected, expectedFromCore, `${spec.id}: SoundCore由来の正解値`);
  }
}

const data = Formulas.define(problemSpecs.find(spec => spec.id === 'pdf-6000b'));
for (const answerUnit of ['KiB', 'MiB']) {
  const binary = Formulas.define({ id: `explicit-${answerUnit}`, type: 'dataSize', answerUnit,
    params: { sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1, base: 1024 } });
  assert.equal(judged(binary, correctDraft(binary), `${answerUnit}の明示単位`).formulaCorrect, true);
  assert.equal(taskFor(binary).expected, Sound.convertBytes(81920, answerUnit, 1024));
}
const dataTask = taskFor(data);
const rate = source(data, 'rate');
const duration = source(data, 'duration');
const bits = source(data, 'bits');
const channels = source(data, 'channels');

const reordered = correctDraft(data);
reordered.rows[0].tokens = [bits, op('×'), channels, op('×'), duration, op('×'), rate, op('÷'), value(8, 'bit/B')];
assert.equal(judged(data, reordered, '積の順序を変えた式').formulaCorrect, true, '積の順序が違っても同値な立式を受け入れる');

const period = Formulas.define(problemSpecs.find(spec => spec.id === 'period-10hz'));
const fractionAndGroup = correctDraft(period);
fractionAndGroup.rows[0].tokens = [{ kind: 'group', body: [{ kind: 'fraction', numerator: [value(1)], denominator: [source(period, 'rate')] }] }];
assert.equal(judged(period, fractionAndGroup, '括弧付き分数').formulaCorrect, true, '分数トークンと括弧の立式を受け入れる');

const inverseWrong = Formulas.define(problemSpecs.find(spec => spec.id === 'rate-002sec'));
const inverseDraft = correctDraft(inverseWrong);
inverseDraft.rows[0].tokens = [source(inverseWrong, 'period'), op('÷'), value(1)];
const inverseResult = judged(inverseWrong, inverseDraft, '逆換算の誤り');
assert.equal(inverseResult.formulaCorrect, false, '周期を逆数にしない式は不正解');
assert.equal(inverseResult.answerCorrect, true, '立式と最終回答の判定を分離する');

const answerOnly = correctDraft(data);
answerOnly.rows[0].tokens = [value(dataTask.expected, 'B')];
const answerOnlyResult = judged(data, answerOnly, '答えだけの定数');
assert.equal(answerOnlyResult.formulaCorrect, false, '答えの数値だけでは立式正解にしない');
assert.equal(answerOnlyResult.answerCorrect, true, '数値だけが正しいことは別に表示する');

const wrongDirection = correctDraft(data);
wrongDirection.rows[0].tokens = [rate, op('×'), duration, op('×'), bits, op('×'), channels, op('×'), value(8, 'bit/B')];
const wrongDirectionResult = judged(data, wrongDirection, 'bit/Bを掛ける誤り');
assert.equal(wrongDirectionResult.formulaCorrect, false, 'bit/Bを掛ける単位方向の誤りを通さない');

const reciprocalConversion = correctDraft(data);
reciprocalConversion.rows[0].tokens = [rate, op('×'), duration, op('×'), bits, op('×'), channels, op('×'), value(0.125, 'B/bit')];
assert.equal(judged(data, reciprocalConversion, '0.125 B/bitによる逆数換算').formulaCorrect, true, '0.125 B/bitを掛ける等価な換算を受け入れる');
const fractionReciprocal = correctDraft(data);
fractionReciprocal.rows[0].tokens = [
  rate, op('×'), duration, op('×'), bits, op('×'), channels, op('×'),
  { kind: 'fraction', numerator: [value(1)], denominator: [value(8)] }, op('×'), value(1, 'B/bit')
];
assert.equal(judged(data, fractionReciprocal, '分数とB/bitによる逆数換算').formulaCorrect, true, '1/8 × 1 B/bitの等価な換算を受け入れる');

const levelFour = Formulas.define(problemSpecs.find(spec => spec.id === 'levels-4bit'));
const bitCountAsConstant = correctDraft(levelFour);
bitCountAsConstant.rows[0].tokens = [power([value(2)], [value(4)])];
assert.equal(judged(levelFour, bitCountAsConstant, 'bitCountを数値定数へ置換').formulaCorrect, false, '量子化ビット数4を単なる定数4でごまかさない');
const cdOneSecond = Formulas.define(problemSpecs.find(spec => spec.id === 'cd-one-second-decimal'));
const channelAsConstant = correctDraft(cdOneSecond);
channelAsConstant.rows[0].tokens = clone(taskFor(cdOneSecond).expectedTokens).map(token => token.kind === 'value' && token.value === '2' && token.unit === 'channel' ? value(2) : token);
assert.equal(judged(cdOneSecond, channelAsConstant, 'channelを数値定数へ置換').formulaCorrect, false, 'チャンネル数2を単なる基数2と取り違えない');

const binaryBase = Formulas.define(problemSpecs.find(spec => spec.id === 'pdf-80kb-binary'));
const decimalInsteadOfBinary = correctDraft(binaryBase);
function replaceUnitValue(tokens, unit, from, to) {
  return tokens.map(token => {
    if (token.kind === 'value' && token.unit === unit && Number(token.value) === from) return value(to, unit);
    if (token.kind === 'group') return { ...token, body: replaceUnitValue(token.body, unit, from, to) };
    if (token.kind === 'fraction') return { ...token, numerator: replaceUnitValue(token.numerator, unit, from, to), denominator: replaceUnitValue(token.denominator, unit, from, to) };
    if (token.kind === 'power') return { ...token, base: replaceUnitValue(token.base, unit, from, to), exponent: replaceUnitValue(token.exponent, unit, from, to) };
    return token;
  });
}
decimalInsteadOfBinary.rows[0].tokens = replaceUnitValue(decimalInsteadOfBinary.rows[0].tokens, 'B/KB', 1024, 1000);
assert.equal(judged(binaryBase, decimalInsteadOfBinary, '1024を1000とする換算').formulaCorrect, false, '1024基数の問題に1000換算を使わない');

const longBinary = Formulas.define(problemSpecs.find(spec => spec.id === 'cd-full-binary'));
const skippedMinutes = correctDraft(longBinary);
skippedMinutes.rows[0].tokens = [
  source(longBinary, 'rate'), op('×'), source(longBinary, 'minutes'), op('×'), source(longBinary, 'bits'), op('×'), source(longBinary, 'channels'),
  op('÷'), value(8, 'bit/B'), op('÷'), value(1024, 'B/KiB'), op('÷'), value(1024, 'KiB/MiB')
];
const skippedMinutesResult = judged(longBinary, skippedMinutes, '分を秒へ換算しない完成値');
assert.equal(skippedMinutesResult.formulaCorrect, false, '分を秒へ換算せず完成値だけを合わせても通さない');

const previousWrong = correctDraft(data);
previousWrong.rows = [
  { id: 'row-1', tokens: clone(dataTask.expectedTokens), result: '1', resultUnit: 'B' },
  { id: 'row-2', tokens: [{ kind: 'reference', rowId: 'row-1' }], result: '', resultUnit: '' }
];
previousWrong.targets = { answer: 'row-2' };
previousWrong.answers = { answer: '1' };
const previousWrongResult = judged(data, previousWrong, '途中の手入力誤答を参照');
assert.equal(previousWrongResult.formulaCorrect, true, '前式の構造を引き継ぐ後式は立式として正しい');
assert.equal(previousWrongResult.answerCorrect, false, '前式の手入力誤答を後式で自動修正しない');
assert.equal(previousWrongResult.rows.find(row => row.id === 'row-1').calculationCorrect, false, '前式の手入力誤答を行ごとに示す');

const forwardReference = correctDraft(data);
forwardReference.rows = [
  { id: 'row-1', tokens: [{ kind: 'reference', rowId: 'row-2' }], result: '', resultUnit: '' },
  { id: 'row-2', tokens: clone(dataTask.expectedTokens), result: String(dataTask.expected), resultUnit: 'B' }
];
forwardReference.targets = { answer: 'row-1' };
assert.equal(Formulas.grade(data, forwardReference).status, 'invalid', '前の行ではない参照は判定しない');

const emptyFormula = correctDraft(data);
emptyFormula.rows[0].tokens = [];
assert.equal(Formulas.grade(data, emptyFormula).status, 'invalid', '空の式は判定しない');
const missingTarget = correctDraft(data);
missingTarget.targets = {};
assert.equal(Formulas.grade(data, missingTarget).status, 'invalid', '式選択がない場合は判定しない');
const unknownUnit = correctDraft(data);
unknownUnit.rows[0].tokens = [value(1, 'not-a-unit')];
assert.equal(Formulas.grade(data, unknownUnit).status, 'invalid', '未定義の単位は判定しない');

for (const id of ['bits-32levels', 'bits-17levels']) {
  const definition = Formulas.define(problemSpecs.find(spec => spec.id === id));
  const result = judged(definition, correctDraft(definition), '最小bitの上下比較');
  assert.equal(result.formulaCorrect, true, `${id}: 最小bitを比較式で確認する`);
}

// 17段階と無関係な「2^4 = 16」「2^5 = 32」だけでは、最小bitの根拠にならない。
const bits17 = Formulas.define(problemSpecs.find(spec => spec.id === 'bits-17levels'));
const disconnectedEvidence = correctDraft(bits17);
disconnectedEvidence.rows = [
  { id: 'row-1', tokens: [power([value(2)], [value(4)]), op('='), value(16)], result: '', resultUnit: '' },
  { id: 'row-2', tokens: [power([value(2)], [value(5)]), op('='), value(32)], result: '', resultUnit: '' }
];
disconnectedEvidence.targets = { answer: 'row-2' };
const disconnectedResult = judged(bits17, disconnectedEvidence, '段階数と結び付かない最小bitの根拠');
assert.equal(disconnectedResult.formulaCorrect, false, '17段階を比較していない前後のべき乗だけは最小bitの根拠にしない');

const referencedBounds = clone(disconnectedEvidence);
referencedBounds.rows[0].result = '16';
referencedBounds.rows[1].result = '32';
referencedBounds.rows.push({ id: 'row-3', tokens: [{ kind: 'reference', rowId: 'row-1' }, op('<'), value(17, 'levels'), op('<='), { kind: 'reference', rowId: 'row-2' }], result: '', resultUnit: '' });
referencedBounds.targets.answer = 'row-3';
assert.equal(judged(bits17, referencedBounds, 'べき乗の途中式を参照して比較').formulaCorrect, true, '最小bitも以前の式を参照して根拠を組み立てられる');
const missingLowerPower = correctDraft(bits17);
missingLowerPower.rows[0].tokens[0] = value(16);
assert.equal(judged(bits17, missingLowerPower, '下限を計算済みの定数だけで記入').formulaCorrect, false, '上限だけでなく下限も元のべき乗を残す');

const workedSpec = {
  id: 'channel-data-cd-one-second', type: 'workedExample',
  params: { sampleRate: 44100, seconds: 1, bitDepth: 16, channels: 2, answerUnit: 'KB', base: 1000 }
};
const worked = Formulas.define(workedSpec);
const workedResult = judged(worked, correctDraft(worked), 'dr32例題の2小問');
assert.equal(worked.tasks.length, 2, 'dr32例題は1回分と1秒分の2小問');
assert.equal(taskFor(worked, 'sample').expected, Sound.audioDataSize({ sampleRate: 1, seconds: 1, bitDepth: 16, channels: 2 }).bytes, 'dr32例題の1回分はSoundCoreの値');
assert.equal(taskFor(worked, 'second').expected, Sound.convertBytes(Sound.audioDataSize(workedSpec.params).bytes, 'KB', 1000), 'dr32例題の1秒分はSoundCoreの値');
assert.equal(workedResult.formulaCorrect, true, 'dr32例題2小問の立式');
assert.equal(workedResult.answerCorrect, true, 'dr32例題2小問の答え');
const workedWrongFirst = correctDraft(worked);
workedWrongFirst.rows = [
  { id: 'row-1', tokens: clone(taskFor(worked, 'sample').expectedTokens), result: '1', resultUnit: 'B' },
  { id: 'row-2', tokens: [{ kind: 'reference', rowId: 'row-1' }, op('×'), source(worked, 'rate'), op('÷'), value(1000, 'B/KB')], result: '', resultUnit: '' }
];
workedWrongFirst.targets = { sample: 'row-1', second: 'row-2' };
workedWrongFirst.answers = { sample: String(taskFor(worked, 'sample').expected), second: '0.001' };
const workedWrongFirstResult = judged(worked, workedWrongFirst, 'dr32例題の(1)誤答を(2)で参照');
assert.equal(workedWrongFirstResult.formulaCorrect, true, 'dr32例題(1)の元式が正しければ(2)の立式も正しい');
assert.equal(workedWrongFirstResult.answerCorrect, false, 'dr32例題(1)の手入力誤答を(2)で自動修正しない');
assert.equal(workedWrongFirstResult.rows.find(row => row.id === 'row-1').calculationCorrect, false, 'dr32例題(1)の手入力誤答を残す');

console.log('sound-formulas: ok');
