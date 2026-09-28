// dr32の実コントローラーを通す統合検証。エディター操作そのものは
// test-lesson-formula-builder-browser.mjsでも検証する。
// JOHO_TEST_URL=http://127.0.0.1:8771/ PLAYWRIGHT_MODULE=/path/to/playwright node ...
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { expect } = require(`${process.env.PLAYWRIGHT_MODULE || 'playwright'}/test`);
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8771/';
const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());

// 公開mount/getDraft/setDraft APIを観測するだけ。採点ボタン・スコア・解説は
// 本番のsound-quiz.jsを実際に動かし、productionにテスト専用APIを追加しない。
await page.addInitScript(() => {
  window.formulaTestEditors = [];
  window.formulaTestEvaluations = 0;
  let builder;
  Object.defineProperty(window, 'LessonFormulaBuilder', {
    configurable: true,
    get: () => builder,
    set(api) {
      builder = { ...api, mount(host, definition, options) {
        const editor = api.mount(host, definition, options);
        const entry = { host, definition, editor };
        const reset = editor.reset;
        editor.reset = next => { entry.definition = next; return reset(next); };
        window.formulaTestEditors.push(entry);
        return editor;
      } };
    }
  });
  let core;
  Object.defineProperty(window, 'LessonFormulaCore', {
    configurable: true,
    get: () => core,
    set(api) {
      core = { ...api, evaluate(...args) { window.formulaTestEvaluations += 1; return api.evaluate(...args); } };
    }
  });
});

const exampleSelector = '[data-sound-worked-example]';
const selectorFor = pattern => `[data-sound-calculation="${pattern}"]`;
async function showSlide(index) {
  await page.evaluate(n => { location.hash = `#headline_${n}`; }, index);
  await expect(page.locator(`#headline_${index}`).locator('..')).toBeVisible();
}
async function editorDraft(selector) {
  return page.evaluate(selector => window.formulaTestEditors.find(entry => entry.host.closest(selector)).editor.getDraft(), selector);
}
async function fillCorrect(selector, wrongAnswer = false) {
  return page.evaluate(({ selector, wrongAnswer }) => {
    const entry = window.formulaTestEditors.find(item => item.host.closest(selector));
    const v = (value, unit = '') => ({ kind: 'value', value: String(value), unit });
    const op = value => ({ kind: 'operator', value });
    const pow = value => ({ kind: 'power', base: [v(2)], exponent: [v(value)] });
    const definition = entry.definition;
    const rows = definition.tasks.map((task, index) => ({
      id: `row-${index + 1}`, taskId: task.id, result: '', resultUnit: '', answerOpen: true,
      tokens: task.rule === 'minimum-bits'
        ? [pow(task.expected - 1), op('<'), v(task.levels, 'levels'), op('<='), pow(task.expected)]
        : task.expectedTokens
    }));
    entry.editor.setDraft({ rows,
      targets: Object.fromEntries(definition.tasks.map((task, index) => [task.id, rows[index].id])),
      answers: Object.fromEntries(definition.tasks.map(task => [task.id, String(wrongAnswer ? -10 : task.expected)]))
    });
    return definition.id;
  }, { selector, wrongAnswer });
}
async function nextProblem(selector) {
  const host = page.locator(selector);
  const next = host.locator('[data-calculation-next]');
  let stepCount = 0;
  while (await next.textContent() === '次へ') {
    await next.click();
    stepCount += 1;
    assert.ok(stepCount < 20, '解説は有限の手順で完了する');
  }
  assert.ok(stepCount > 0, '既存の次へ解説を確認できる');
  await expect(host.locator('.dr-solution__point')).toBeVisible();
  await next.click();
  const draft = await editorDraft(selector);
  assert.ok(draft.rows.every(row => !row.tokens.length && !row.result), '次の問題で式と途中結果を初期化');
  assert.ok(Object.values(draft.answers).every(value => !value), '次の問題で答えを初期化');
}
async function judgeFor(host, taskId) {
  const task = taskId ? host.locator(`[data-formula-task="${taskId}"]`) : host;
  const judge = task.locator('[data-formula-judge]').last();
  await expect(judge).toBeVisible();
  return judge;
}

try {
  await page.goto(new URL('dr32.html#headline_2', baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  assert.equal(await page.locator('[data-formula-builder]').count(), 4, '例題と3種の計算問題だけに導入');
  assert.equal(await page.evaluate(() => window.formulaTestEvaluations), 0, '初期表示では式を計算しない');
  const exampleBuilder = page.locator(`${exampleSelector} [data-formula-builder]`);
  for (const taskId of ['sample', 'second']) {
    const task = exampleBuilder.locator(`[data-formula-task="${taskId}"]`);
    const finalRow = task.locator('[data-formula-row]').last();
    assert.equal(await task.locator('[data-formula-row]').count(), 1, `${taskId}: 小問ごとに独立した最終式で始まる`);
    assert.equal(await finalRow.locator('[data-formula-result], [data-formula-answer], [data-formula-judge]').count(), 0, `${taskId}: 初期状態で結果・答え・判定を置かない`);
  }
  for (const selector of [exampleSelector, ...['sampling', 'quantization', 'data-size'].map(selectorFor)]) {
    const draft = await editorDraft(selector);
    assert.ok(draft.rows.every(row => !row.tokens.length && !row.result), '式と結果は初期空欄');
    assert.ok(Object.values(draft.answers).every(value => !value), '最終回答を補完しない');
    assert.ok(draft.rows.every(row => !row.answerOpen), '初期状態で答え欄を開かない');
  }

  // 例題の小問(1)から(2)へ共有する途中結果。
  await page.evaluate(selector => {
    const { editor } = window.formulaTestEditors.find(entry => entry.host.closest(selector));
    const v = (value, unit = '') => ({ kind: 'value', value: String(value), unit });
    const op = value => ({ kind: 'operator', value });
    editor.setDraft({ rows: [
      { id: 'sample', taskId: 'sample', tokens: [v(16, 'bit/sample'), op('×'), v(2, 'channel'), op('÷'), v(8, 'bit/B')], result: '', resultUnit: '', answerOpen: true },
      { id: 'second', taskId: 'second', tokens: [{ kind: 'reference', rowId: 'sample' }, op('×'), v(44100, 'Hz'), op('÷'), v(1000, 'B/KB')], result: '', resultUnit: '', answerOpen: true }
    ], targets: { sample: 'sample', second: 'second' }, answers: { sample: '4', second: '176.4' } });
  }, exampleSelector);
  assert.equal(await page.evaluate(() => window.formulaTestEvaluations), 0, '入力・参照の追加で自動計算しない');
  const savedExample = await editorDraft(exampleSelector);
  assert.equal(savedExample.rows[0].result, '4', '参照元の最終式には小問の手入力回答を渡す');
  assert.equal(savedExample.rows[0].resultUnit, 'B', '参照元の単位は小問の回答単位を使う');
  assert.equal(savedExample.rows[1].result, '', '参照されていない最終式へ結果を重複保存しない');
  assert.deepEqual(await page.evaluate(selector => {
    const editor = window.formulaTestEditors.find(entry => entry.host.closest(selector)).editor;
    const draft = editor.getDraft();
    editor.setDraft(draft);
    return editor.getDraft();
  }, exampleSelector), savedExample, 'taskIdを含むdraftはgetDraft/setDraftで互換に復元できる');
  assert.deepEqual(await page.evaluate(selector => {
    const editor = window.formulaTestEditors.find(entry => entry.host.closest(selector)).editor;
    const draft = editor.getDraft();
    draft.rows.forEach(row => { delete row.taskId; });
    editor.setDraft(draft);
    return editor.getDraft();
  }, exampleSelector), savedExample, '旧形式のdraftも小問ごとの式へ復元できる');
  await showSlide(3);
  await showSlide(2);
  assert.deepEqual(await editorDraft(exampleSelector), savedExample, 'スライド移動で入力を保持');
  if (engine === 'chrome') {
    await page.getByRole('button', { name: '全画面表示メニューを開く', exact: true }).click();
    await page.getByRole('button', { name: 'スライドを全画面表示', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/is-lesson-fullscreen/);
    assert.deepEqual(await editorDraft(exampleSelector), savedExample, '全画面で入力を保持');
    await page.getByRole('button', { name: '全画面表示を終了', exact: true }).click();
    await expect(page.locator('body')).not.toHaveClass(/is-lesson-fullscreen/);
  }
  assert.equal(await page.locator('[data-worked-example-judge], [data-calculation-judge]').count(), 0, '外側の一括判定ボタンを置かない');
  await (await judgeFor(exampleBuilder, 'sample')).click();
  const sampleFeedback = await exampleBuilder.locator('[data-formula-task="sample"] .formula-feedback').allTextContents();
  assert.ok(sampleFeedback.some(text => text.includes('立式') && text.includes('○')), '例題の小問(1)だけを判定する');
  assert.equal(await exampleBuilder.locator('[data-formula-task="second"] .dr-solution__steps li').count(), 0, '未判定の小問(2)の正解を表示しない');
  await (await judgeFor(exampleBuilder, 'second')).click();
  const exampleFeedback = await page.locator(`${exampleSelector} .formula-feedback`).allTextContents();
  assert.ok(exampleFeedback.some(text => text.includes('答え') && text.includes('○')), '例題も行内で答えを判定する');
  assert.ok((await exampleBuilder.locator('[data-formula-task="sample"] .formula-feedback').allTextContents()).some(text => text.includes('立式') && text.includes('○')), '小問(2)の判定後も小問(1)の判定結果を残す');
  assert.ok(await page.locator('[data-sound-formula-score]').evaluateAll(nodes => nodes.every(node => node.textContent.includes('解答 0問'))), '例題はスコア外');
  await page.locator(`${exampleSelector} [data-worked-example-next]`).click();
  await expect(page.locator(`${exampleSelector} .dr-solution__steps li`)).toHaveCount(1);
  assert.deepEqual(await editorDraft(exampleSelector), savedExample, '例題解説は入力を消さない');

  await showSlide(3);
  const sampling = page.locator(selectorFor('sampling'));
  await sampling.locator('[data-formula-operator="="]').click();
  const emptyJudge = await judgeFor(sampling);
  await expect(emptyJudge).toBeDisabled();
  await sampling.locator('[data-formula-answer]').fill('1');
  await expect(emptyJudge).toBeEnabled();
  await emptyJudge.click();
  await expect(sampling.locator('[data-sound-formula-score]')).toContainText('解答 0問');
  await expect(sampling.locator('[data-formula-judge]')).toBeEnabled();
  await expect(sampling.locator('.formula-feedback-summary')).toContainText('まだ判定していません');
  await fillCorrect(selectorFor('sampling'), true);
  await (await judgeFor(sampling)).click();
  await expect(sampling.locator('[data-sound-formula-score]')).toHaveText('解答 1問 ／ 立式正解 1問 ／ 答え正解 0問');
  // disable属性を回避してイベントを再送してもコントローラー側が二重計上しない。
  await sampling.locator('[data-formula-judge]').dispatchEvent('click');
  await expect(sampling.locator('[data-sound-formula-score]')).toHaveText('解答 1問 ／ 立式正解 1問 ／ 答え正解 0問');
  await nextProblem(selectorFor('sampling'));

  let attempts = 1;
  const allSeen = [];
  for (const [pattern, slide, size] of [['sampling', 3, 2], ['quantization', 4, 3], ['data-size', 5, 6]]) {
    await showSlide(slide);
    const selector = selectorFor(pattern);
    const seen = new Set();
    for (let i = 0; seen.size < size && i < 60; i += 1) {
      const id = await fillCorrect(selector);
      seen.add(id);
      await (await judgeFor(page.locator(selector))).click();
      attempts += 1;
      await expect(page.locator(`${selector} [data-sound-formula-score]`)).toHaveText(`解答 ${attempts}問 ／ 立式正解 ${attempts}問 ／ 答え正解 ${attempts - 1}問`);
      await nextProblem(selector);
    }
    assert.equal(seen.size, size, `${pattern}: 全問題型を実UI経由で採点`);
    allSeen.push(...seen);
  }
  assert.equal(allSeen.length, 11, '既存11問型の採点・解説を通す');

  // 長い式は式欄内だけでスクロールし、ページ全体は各幅へ収める。
  await showSlide(2);
  const colours = {};
  const fonts = {};
  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ['light', 'dark', 'system']) {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      for (const size of ['standard', 'large', 'xlarge']) {
        await page.evaluate(({ theme, size }) => {
          window.siteTheme.setPreference(theme, { persist: false });
          window.siteTextSize.setPreference(size, { persist: false });
        }, { theme, size });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => {
          const host = document.querySelector('[data-sound-worked-example] [data-formula-builder]');
          const field = host.querySelector('.formula-expression');
          const style = getComputedStyle(host);
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            right: host.getBoundingClientRect().right, left: host.getBoundingClientRect().left,
            escaped: host.scrollWidth > host.clientWidth + 1 || host.closest('[data-lesson-slide]').scrollWidth > host.closest('[data-lesson-slide]').clientWidth + 1,
            colour: style.color, font: parseFloat(style.fontSize),
            localScroll: getComputedStyle(field).overflowX,
            targets: [...host.querySelectorAll('button,input,select,summary')].filter(node => node.checkVisibility()).every(node => node.getBoundingClientRect().height >= 43.5)
          };
        });
        assert.equal(layout.overflow, false, `${width}/${theme}/${size}: ページ全体の横はみ出しなし`);
        assert.ok(layout.right <= width + 1, `${width}/${theme}/${size}: 式エディターが用紙内に収まる`);
        assert.ok(layout.left >= 0 && !layout.escaped, `${width}/${theme}/${size}: 長い式が外枠を押し広げない`);
        assert.equal(layout.localScroll, 'auto', '長い式だけが横スクロールする');
        assert.equal(layout.targets, true, `${width}/${theme}/${size}: 操作部品は高さ44px`);
        colours[theme] = layout.colour;
        fonts[size] = layout.font;
      }
    }
    assert.ok(fonts.standard < fonts.large && fonts.large < fonts.xlarge, `${width}: 3段階の文字サイズを反映`);
    if (process.env.JOHO_TEST_ARTIFACT_DIR) {
      await page.locator(`${exampleSelector} .formula-expression`).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.JOHO_TEST_ARTIFACT_DIR}/formula-${engine}-${width}.png` });
    }
  }
  assert.notEqual(colours.light, colours.dark, 'ライト・ダークテーマが式にも反映');
  assert.equal(colours.system, colours.dark, '自動テーマでOSのダーク設定を反映');

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await touch.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await touch.goto(new URL('dr32.html#headline_3', baseURL).href);
  const touchBuilder = touch.locator('[data-sound-calculation="sampling"] [data-formula-builder]');
  await touchBuilder.locator('[data-formula-slot]').first().tap();
  await touchBuilder.locator('[data-formula-quantity]').first().tap();
  await expect(touchBuilder.locator('[data-formula-token]')).toHaveCount(1);
  assert.equal(await touch.evaluate(() => location.hash), '#headline_3', 'タップで挿入でき、スライド移動と競合しない');
  await touch.close();

  await page.goto(new URL('dr31.html#headline_6', baseURL).href);
  await page.locator('#digitization-judge').waitFor();
  await page.locator('#digitization-judge').click();
  await expect(page.locator('#digitization-feedback')).toContainText('正解');
  assert.equal(await page.locator('[data-formula-builder]').count(), 0, 'dr31の既存問題UIへ拡張しない');
  assert.deepEqual(errors, [], 'ブラウザ例外なし');
  console.log(`sound-formula-integration (${engine}): 11問型、例題2小問、分離スコア、入力保持、解説、採点保留、二重加算防止、27表示条件、タップ、dr31回帰 OK`);
} finally {
  await browser.close();
}
