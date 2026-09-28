// dr31「数値の例」の4つの固定例を、SoundCore由来の定義として確認する。
// JOHO_TEST_URL=http://127.0.0.1:8771/ PLAYWRIGHT_MODULE=/path/to/playwright node ...
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Sound = require('../js/sound-core.js');
const Formulas = require('../js/sound-formulas.js');
const page = await readFile(new URL('../dr31.html', import.meta.url), 'utf8');

const definitions = [
  { marker: 'period-10hz', problem: { id: 'dr31-period-10hz', type: 'periodFromRate', params: { sampleRate: 10 } }, expected: Sound.samplingPeriod(10) },
  { marker: 'rate-005sec', problem: { id: 'dr31-rate-005sec', type: 'rateFromPeriod', params: { period: 0.05 } }, expected: 20 },
  { marker: 'levels-3bit', problem: { id: 'dr31-levels-3bit', type: 'levelsFromBits', params: { bitDepth: 3 } }, expected: Sound.quantizationLevels(3) },
  { marker: 'bits-16levels', problem: { id: 'dr31-bits-16levels', type: 'bitsFromLevels', params: { levels: 16 } }, expected: Sound.requiredBitsForLevels(16) }
];

for (const { marker, problem, expected } of definitions) {
  assert.match(page, new RegExp(`data-sound-reference-example="${marker}"`), `${marker}: 専用の詳細項目を置く`);
  const definition = Formulas.define(problem);
  assert.equal(definition.tasks.length, 1, `${marker}: 小問は1つ`);
  assert.equal(definition.tasks[0].expected, expected, `${marker}: SoundCore由来の答え`);
  assert.equal(typeof Formulas.grade, 'function', `${marker}: 共通採点APIを使える`);
  assert.equal(typeof Formulas.gradeRow, 'function', `${marker}: 行ごとの共通採点APIを使える`);
}

assert.match(page, /data-sound-reference-solution/, '解説は明示的に開く専用detailsを持つ');
assert.match(page, /3bitで段階値2を符号化すると？/, '既存の符号化例を維持する');
assert.match(page, /id="digitization-answer-grid"/, '既存の波形読み取り演習を維持する');
const requiredScripts = [
  './js/sound-core.js',
  './js/lesson-formula-grader.js',
  './js/sound-formulas.js',
  './js/lesson-formula-builder.js',
  './js/sound-reference-formulas.js'
];
const positions = requiredScripts.map(script => page.indexOf(script));
assert.ok(positions.every(position => position >= 0), '式ビルダーの依存スクリプトをすべて読む');
assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'Core→grader→SoundFormulas→builder→dr31統合の順に読む');

if (process.env.JOHO_TEST_URL) {
  const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
  const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? { headless: true } : { channel: 'chrome', headless: true });
  const browserPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  browserPage.on('pageerror', error => errors.push(error.message));
  try {
    await browserPage.addInitScript(() => {
      window.referenceFormulaTestEditors = [];
      let builder;
      Object.defineProperty(window, 'LessonFormulaBuilder', {
        configurable: true,
        get: () => builder,
        set(api) {
          builder = { ...api, mount(host, definition, options) {
            const editor = api.mount(host, definition, options);
            window.referenceFormulaTestEditors.push({ host, definition, editor });
            return editor;
          } };
        }
      });
    });
    await browserPage.goto(new URL('dr31.html#headline_5', process.env.JOHO_TEST_URL).href);
    await browserPage.locator('body.lesson-slide-ready').waitFor();
    assert.equal(await browserPage.locator('[data-sound-reference-example]').count(), 4, '4種類の計算例だけを式ビルダー化する');
    assert.equal(await browserPage.locator('[data-sound-reference-solution][open]').count(), 0, '初期表示で解答を開かない');
    assert.deepEqual(
      await browserPage.evaluate(() => window.referenceFormulaTestEditors.map(item => item.host.closest('[data-sound-reference-example]').dataset.soundReferenceExample).sort()),
      definitions.map(item => item.marker).sort(),
      '4種類の数値例をそれぞれ初期化する'
    );

    async function setDraft(marker, wrong = false) {
      await browserPage.evaluate(({ marker, wrong }) => {
        const entry = window.referenceFormulaTestEditors.find(item => item.host.closest('[data-sound-reference-example]').dataset.soundReferenceExample === marker);
        const task = entry.definition.tasks[0];
        const value = (number, unit = '') => ({ kind: 'value', value: String(number), unit });
        const op = operator => ({ kind: 'operator', value: operator });
        const power = exponent => ({ kind: 'power', base: [value(2)], exponent: [value(exponent)] });
        const tokens = task.rule === 'minimum-bits'
          ? [power(task.expected - 1), op('<'), value(task.levels, 'levels'), op('<='), power(task.expected)]
          : task.expectedTokens;
        const answer = wrong ? task.expected + 1 : task.expected;
        entry.editor.setDraft({
          rows: [{ id: `test-${marker}`, taskId: task.id, tokens, result: '', resultUnit: '', answerOpen: true }],
          targets: { [task.id]: `test-${marker}` },
          answers: { [task.id]: String(answer) }
        });
      }, { marker, wrong });
    }

    for (const { marker } of definitions) {
      const example = browserPage.locator(`[data-sound-reference-example="${marker}"]`);
      await example.locator('> summary').click();
      await example.locator('[data-formula-builder]').waitFor();
      assert.equal(await example.locator('[data-sound-reference-solution][open]').count(), 0, `${marker}: 問題を開いても解説は別操作のまま`);
      await setDraft(marker);
      await example.locator('[data-formula-judge]').click();
      await example.locator('.formula-feedback').waitFor();
      const success = marker === 'bits-16levels'
        ? /1つ前では足りず、このビット数なら足りることと、結論が合っています。/
        : /元の数量・演算・単位と、答えが合っています。/;
      assert.match(await example.locator('.formula-feedback').innerText(), success, `${marker}: 正しい立式と答えを判定`);
    }
    const first = browserPage.locator('[data-sound-reference-example="period-10hz"]');
    await setDraft('period-10hz', true);
    await first.locator('[data-formula-judge]').click();
    assert.match(await first.locator('.formula-feedback').innerText(), /最終回答を見直してください。/, '誤答を案内する');
    assert.equal(await first.locator('[data-sound-reference-solution][open]').count(), 0, '誤答時も解答を自動表示しない');
    await setDraft('period-10hz');
    await first.locator('[data-formula-judge]').click();
    assert.match(await first.locator('.formula-feedback').innerText(), /答えが合っています。/, '再入力後に再判定できる');
    await first.locator('[data-sound-reference-solution] > summary').click();
    await first.locator('[data-sound-reference-solution]').getByText('答え：0.1秒').waitFor();
    await browserPage.locator('#headline_6').evaluate(node => { location.hash = '#headline_6'; });
    await browserPage.locator('#digitization-answer-grid').waitFor();
    await browserPage.setViewportSize({ width: 390, height: 844 });
    // WebKitはスライド切替・式ビルダーの高さ通知後に幅の再計算を1フレーム遅らせる。
    await browserPage.waitForTimeout(100);
    assert.ok(await browserPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px幅でページ全体を横にはみ出さない');
    assert.deepEqual(errors, [], `ブラウザ例外なし: ${errors.join('\n')}`);
  } finally {
    await browser.close();
  }
}

console.log(`sound reference formulas: ${definitions.length} examples verified`);
