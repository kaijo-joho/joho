import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Image = (require('../js/image-core.js'), globalThis.ImageCore);
const Video = (require('../js/video-core.js'), globalThis.VideoCore);
const Media = require('../js/media-formulas.js');

const value = (n, unit = '') => ({ kind: 'value', value: String(n), unit });
const op = operator => ({ kind: 'operator', value: operator });
const power = (base, exponent) => ({ kind: 'power', base, exponent });
const clone = input => JSON.parse(JSON.stringify(input));
const taskFor = (definition, id) => {
  const task = definition.tasks.find(candidate => candidate.id === id);
  assert.ok(task, `${definition.id}: ${id} を定義する`);
  return task;
};
const source = (definition, id) => {
  const item = definition.sources.find(candidate => candidate.id === id);
  assert.ok(item, `${definition.id}: ${id} を数量として定義する`);
  return value(item.value, item.unit);
};
const correctDraft = definition => {
  const rows = definition.tasks.map((task, index) => ({
    id: `row-${index + 1}`,
    tokens: task.rule === 'minimum-bits'
      ? [power([value(2)], [value(task.expected - 1)]), op('<'), source(definition, 'colors'), op('<='), power([value(2)], [value(task.expected)])]
      : clone(task.expectedTokens),
    result: task.answerIsResult === false ? '' : String(task.expected),
    resultUnit: task.answerIsResult === false ? '' : task.answerUnit
  }));
  return {
    rows,
    targets: Object.fromEntries(definition.tasks.map((task, index) => [task.id, rows[index].id])),
    answers: Object.fromEntries(definition.tasks.map(task => [task.id, String(task.expected)]))
  };
};
const judged = (definition, draft, note, options) => {
  const result = Media.grade(definition, draft, options);
  assert.equal(result.status, 'judged', `${definition.id}: ${note} は判定できる`);
  return result;
};

const fullColor = Media.defineImage('full-color');
const colorCount = Media.defineImage('color-count');
const duration = Media.defineVideo('duration');
const size = Media.defineVideo('size');

assert.deepEqual(fullColor.tasks.map(task => task.id), ['levels', 'size']);
assert.deepEqual(colorCount.tasks.map(task => task.id), ['bits', 'size']);
assert.deepEqual(duration.tasks.map(task => task.id), ['duration']);
assert.deepEqual(size.tasks.map(task => task.id), ['frame', 'total']);
assert.deepEqual(fullColor.constants.map(item => item.value), ['2', '3', '8', '1024'], 'フルカラーの指数と換算の補助定数を用意する');
assert.deepEqual(colorCount.constants.map(item => item.value), ['2', '15', '8', '1000'], '色数画像の指数と換算の補助定数を用意する');
assert.equal(taskFor(fullColor, 'levels').expected, Image.levels(8), 'RGB各色は24÷3=8bitから導く');
assert.equal(taskFor(fullColor, 'size').expected, Image.imageSize(4096, 3072, 24, 1024).megabytes, '4096×3072の画像サイズはImageCore由来');
assert.equal(taskFor(colorCount, 'size').expected, Image.imageSize(1000, 800, 15, 1000).megabytes, '32768色の画像サイズはImageCore由来');
assert.equal(taskFor(duration, 'duration').expected, Video.playbackSeconds(1.5 * 1024 * 1024 ** 2, 1024 ** 2, 24), '再生時間はVideoCore由来');
assert.equal(taskFor(size, 'frame').expected, 1.44, '動画の1フレームは1.44MB');
assert.equal(taskFor(size, 'total').expected, Video.videoSize(Image.imageSize(800, 600, 24).bytes, 30, 60).megabytes, '動画全体はVideoCore由来');

for (const definition of [fullColor, colorCount, duration, size]) {
  const result = judged(definition, correctDraft(definition), '正しい立式');
  assert.equal(result.formulaCorrect, true, `${definition.id}: 正しい立式を受け入れる`);
  assert.equal(result.answerCorrect, true, `${definition.id}: 正しい最終回答を受け入れる`);
}

const fullAnswerOnly = correctDraft(fullColor);
fullAnswerOnly.rows[1].tokens = [value(taskFor(fullColor, 'size').expected, 'MB')];
const fullAnswerOnlyResult = judged(fullColor, fullAnswerOnly, '画像サイズの答えだけ');
assert.equal(fullAnswerOnlyResult.tasks.find(task => task.id === 'size').formulaCorrect, false, '画像サイズの答えだけは立式として通さない');

const colorAnswerOnly = correctDraft(colorCount);
colorAnswerOnly.rows[1].tokens = [value(taskFor(colorCount, 'size').expected, 'MB')];
assert.equal(judged(colorCount, colorAnswerOnly, '色数画像の答えだけ').tasks.find(task => task.id === 'size').formulaCorrect, false, '色数画像の答えだけは通さない');

const wrongBinaryBase = correctDraft(fullColor);
wrongBinaryBase.rows[1].tokens = clone(taskFor(fullColor, 'size').expectedTokens).map(token => token.kind === 'value' && token.value === '1024' ? value(1000) : token);
assert.equal(judged(fullColor, wrongBinaryBase, '1024を1000にする').tasks.find(task => task.id === 'size').formulaCorrect, false, '1024進の画像を1000進で換算しない');

const wrongDecimalBase = correctDraft(colorCount);
wrongDecimalBase.rows[1].tokens = clone(taskFor(colorCount, 'size').expectedTokens).map(token => token.kind === 'value' && token.value === '1000' ? value(1024) : token);
assert.equal(judged(colorCount, wrongDecimalBase, '1000を1024にする').tasks.find(task => task.id === 'size').formulaCorrect, false, '1000進の画像を1024進で換算しない');

// color-countは比較式そのものを真偽値として参照せず、根拠が正しい場合にだけ
// 「1画素あたりのbit数」という結論量を次の小問へ渡す。
assert.deepEqual(taskFor(colorCount, 'bits').conclusionQuantity, { unit: 'bit/pixel', symbol: 'bits-per-pixel' }, '色数の結論を参照する量を明示する');
const colorReference = correctDraft(colorCount);
colorReference.rows[0].result = '15';
colorReference.rows[0].resultUnit = 'bit/pixel';
colorReference.rows[1].tokens = [
  { kind: 'reference', rowId: 'row-1' }, op('×'), source(colorCount, 'width'), op('×'), source(colorCount, 'height'),
  op('÷'), value(8), op('÷'), value(1000), op('÷'), value(1000)
];
const colorReferenceResult = judged(colorCount, colorReference, '正しい比較から15bitを参照');
assert.equal(colorReferenceResult.tasks.find(task => task.id === 'size').formulaCorrect, true, '15bitを参照した1.5MBの立式を受け入れる');
assert.equal(colorReferenceResult.tasks.find(task => task.id === 'size').answerCorrect, true, '15bitを参照した1.5MBの答えを受け入れる');
assert.equal(colorReferenceResult.rows.find(row => row.id === 'row-1').calculationCorrect, true, '比較式の結論15bitを確認する');

const wrongColorConclusion = clone(colorReference);
wrongColorConclusion.rows[0].result = '14';
wrongColorConclusion.rows[1].result = '1.4';
wrongColorConclusion.rows[1].resultUnit = 'MB';
wrongColorConclusion.answers.size = '1.4';
const wrongColorConclusionResult = judged(colorCount, wrongColorConclusion, '14bitの誤答を参照');
assert.equal(wrongColorConclusionResult.tasks.find(task => task.id === 'size').formulaCorrect, true, '14bitでも由来量としての立式構造は保持する');
assert.equal(wrongColorConclusionResult.tasks.find(task => task.id === 'size').answerCorrect, false, '14bitからの1.4MBを正解1.5MBへ補正しない');
assert.equal(wrongColorConclusionResult.rows.find(row => row.id === 'row-1').calculationCorrect, false, '14bitという途中結論の誤りを示す');

const wrongColorEvidence = clone(colorReference);
wrongColorEvidence.rows[0].tokens[0] = { kind: 'power', base: [value(2)], exponent: [value(13)] };
assert.equal(Media.grade(colorCount, wrongColorEvidence).status, 'invalid', '比較の根拠が誤っていれば結論を参照しない');
const missingColorConclusion = clone(colorReference);
missingColorConclusion.rows[0].result = '';
assert.equal(Media.grade(colorCount, missingColorConclusion).status, 'invalid', '比較の結論が未入力なら参照先を保留する');
const independentColorSize = correctDraft(colorCount);
independentColorSize.rows[0].tokens = [];
independentColorSize.answers.bits = '';
const independentColorSizeResult = Media.grade(colorCount, independentColorSize, { taskId: 'size' });
assert.equal(independentColorSizeResult.status, 'judged', 'bit小問が未完成でも独立したsize小問を判定する');
assert.equal(independentColorSizeResult.formulaCorrect, true, '独立したsize小問の立式を保つ');
assert.equal(independentColorSizeResult.answerCorrect, true, '独立したsize小問の答えを保つ');

const reorderedFrame = correctDraft(size);
reorderedFrame.rows[0].tokens = [source(size, 'bits-per-pixel'), op('×'), source(size, 'height'), op('×'), source(size, 'width'), op('÷'), value(8), op('÷'), value(1000), op('÷'), value(1000)];
assert.equal(judged(size, reorderedFrame, '積の順序を変えた動画フレーム').tasks.find(task => task.id === 'frame').formulaCorrect, true, '積の順序を変えても同値な式を受け入れる');

const fractionFrame = correctDraft(size);
fractionFrame.rows[0].tokens = [source(size, 'width'), op('×'), source(size, 'height'), op('×'), source(size, 'bits-per-pixel'), op('×'), {
  kind: 'fraction', numerator: [value(1)], denominator: [value(8)]
}, op('÷'), value(1000), op('÷'), value(1000)];
assert.equal(judged(size, fractionFrame, '分数によるbitからBへの換算').tasks.find(task => task.id === 'frame').formulaCorrect, true, '1/8を使う同値な換算を受け入れる');

const durationPlainConversion = correctDraft(duration);
durationPlainConversion.rows[0].tokens = [source(duration, 'total'), op('×'), value(1024), op('÷'), source(duration, 'frame-size'), op('÷'), source(duration, 'rate')];
assert.equal(judged(duration, durationPlainConversion, '単位なし1024によるGBからMBへの換算').formulaCorrect, true, '単位なしの1024を許可された換算として扱う');
const durationWrongDirection = correctDraft(duration);
durationWrongDirection.rows[0].tokens = [source(duration, 'total'), op('÷'), value(1024, 'MB/GB'), op('÷'), source(duration, 'frame-size'), op('÷'), source(duration, 'rate')];
assert.equal(judged(duration, durationWrongDirection, 'GBからMBの逆向き換算').formulaCorrect, false, 'GBからMBを割らない');

const referenceTotal = correctDraft(size);
referenceTotal.rows[1].tokens = [{ kind: 'reference', rowId: 'row-1' }, op('×'), source(size, 'rate'), op('×'), source(size, 'duration')];
assert.equal(judged(size, referenceTotal, '1フレームの結果を動画全体へ参照').tasks.find(task => task.id === 'total').formulaCorrect, true, '前の小問を参照した動画全体の立式を受け入れる');
const wrongReference = clone(referenceTotal);
wrongReference.rows[0].result = '1';
wrongReference.answers.total = '1800';
const wrongReferenceResult = judged(size, wrongReference, '誤った1フレーム結果を参照');
assert.equal(wrongReferenceResult.tasks.find(task => task.id === 'total').formulaCorrect, true, '参照元の構造は保持する');
assert.equal(wrongReferenceResult.answerCorrect, false, '参照元の誤答を動画全体で自動修正しない');
assert.equal(wrongReferenceResult.rows.find(row => row.id === 'row-1').calculationCorrect, false, '前の小問の手入力誤答を示す');

const missingAnswer = correctDraft(duration);
missingAnswer.answers.duration = '';
assert.equal(Media.grade(duration, missingAnswer).status, 'invalid', '最終回答が未入力なら判定を保留する');
const missingFormula = correctDraft(fullColor);
missingFormula.rows[1].tokens = [];
assert.equal(Media.grade(fullColor, missingFormula).status, 'invalid', '式が未入力なら判定を保留する');
assert.throws(() => Media.defineImage('invalid'));
assert.throws(() => Media.defineVideo('invalid'));

console.log('media-formulas: ok');
