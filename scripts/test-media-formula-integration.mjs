// dr41/dr42の実ページで、画像・動画の立式UIと既存解説を接続確認する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = require(modulePath);
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8771/';
const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());

await page.addInitScript(() => {
  window.mediaFormulaEditors = [];
  let builder;
  Object.defineProperty(window, 'LessonFormulaBuilder', {
    configurable: true,
    get: () => builder,
    set(api) {
      builder = { ...api, mount(host, definition, options) {
        const editor = api.mount(host, definition, options);
        window.mediaFormulaEditors.push({ host, definition, editor });
        return editor;
      } };
    }
  });
});

function pageURL(name, hash) { return new URL(`${name}${hash ? `#${hash}` : ''}`, baseURL).href; }
async function entryFor(selector) {
  return page.evaluate(selector => {
    const entry = window.mediaFormulaEditors.find(item => item.host.closest(selector));
    if (!entry) throw new Error(`立式UIが見つかりません: ${selector}`);
    return { definition: entry.definition, draft: entry.editor.getDraft() };
  }, selector);
}
async function setCorrect(selector) {
  return page.evaluate(selector => {
    const entry = window.mediaFormulaEditors.find(item => item.host.closest(selector));
    const op = value => ({ kind: 'operator', value });
    const value = (number, unit = '') => ({ kind: 'value', value: String(number), unit });
    const power = exponent => ({ kind: 'power', base: [value(2)], exponent: [value(exponent)] });
    const rows = entry.definition.tasks.map((task, index) => ({
      id: `row-${index + 1}`,
      taskId: task.id,
      tokens: task.rule === 'minimum-bits'
        ? [power(task.expected - 1), op('<'), value(task.levels, task.boundUnit), op('<='), power(task.expected)]
        : task.expectedTokens,
      result: '', resultUnit: '', answerOpen: true
    }));
    entry.editor.setDraft({
      rows,
      targets: Object.fromEntries(entry.definition.tasks.map((task, index) => [task.id, rows[index].id])),
      answers: Object.fromEntries(entry.definition.tasks.map(task => [task.id, String(task.expected)]))
    });
    return entry.definition.tasks.map(task => task.id);
  }, selector);
}
async function verifyProblem({ pageName, slide, selector, tasks, reset = false }) {
  await page.goto(pageURL(pageName, `headline_${slide}`));
  await page.locator('body.lesson-slide-ready').waitFor();
  const host = page.locator(selector);
  await host.waitFor();
  const initial = await entryFor(selector);
  assert.deepEqual(initial.definition.tasks.map(task => task.id), tasks, `${selector}: 小問の構成`);
  assert.ok(Object.values(initial.draft.answers).every(value => !value), `${selector}: 初期状態で答えを補完しない`);
  if (!initial.definition.tasks.some(task => task.scaffold)) {
    assert.ok(initial.draft.rows.every(row => !row.tokens.length && !row.answerOpen), `${selector}: 初期状態では答え欄を開かない`);
    assert.equal(await host.locator('[data-formula-answer], [data-formula-judge]').count(), 0, `${selector}: 初期状態で答え欄と判定を置かない`);
  }
  const details = host.locator('details');
  const taskIds = await setCorrect(selector);
  for (const taskId of taskIds) {
    const task = host.locator(`[data-formula-task="${taskId}"]`);
    const judge = task.locator('[data-formula-judge]').last();
    await judge.click();
    const feedback = await task.locator('.formula-feedback').allTextContents();
    assert.ok(feedback.some(text => text.includes('立式') && text.includes('○') && text.includes('答え') && text.includes('○')), `${selector}/${taskId}: 立式と手入力答えを別々に判定 (${feedback.join(' / ')})`);
    assert.equal(await task.locator('[data-formula-answer]').last().isEditable(), true, `${selector}/${taskId}: 判定後も答えを編集できる`);
    assert.equal(await details.evaluate(node => node.open), false, `${selector}/${taskId}: 判定で解答を自動表示しない`);
  }
  assert.equal(await details.locator('summary').textContent(), '解答を見る', `${selector}: 解説の入口を統一`);
  await details.locator('summary').click();
  const steps = details.locator('ol > li');
  assert.ok(await steps.count() > 0, `${selector}: 既存の解説を保持`);
  assert.equal(await details.evaluate(node => node.open), true, `${selector}: 解答を見るで解説を開く`);
  assert.ok(await steps.evaluateAll(nodes => nodes.every(node => !node.hidden && node.checkVisibility())), `${selector}: 解説を一度に全表示`);
  assert.equal(await details.locator('[data-image-solution-next], [data-video-solution-next], [data-video-solution-reset]').count(), 0, `${selector}: 次へ・解説リセットを置かない`);
  if (reset) {
    await host.locator('[data-video-formula-reset]').click();
    const cleared = await entryFor(selector);
    assert.ok(cleared.draft.rows.every(row => !row.tokens.length && !row.answerOpen), `${selector}: 入力を消すで立式と答えを初期化`);
  }
}

async function prepareReferenceTarget(selector, sourceTaskId, targetTaskId, prefixSourceIds) {
  return page.evaluate(({ selector, sourceTaskId, targetTaskId, prefixSourceIds }) => {
    const entry = window.mediaFormulaEditors.find(item => item.host.closest(selector));
    const draft = entry.editor.getDraft();
    const target = draft.rows.find(row => row.taskId === targetTaskId);
    const source = id => {
      const item = entry.definition.sources.find(candidate => candidate.id === id) || entry.definition.constants.find(candidate => candidate.id === id);
      return { kind: 'value', value: item.value, unit: item.unit, ...(item.symbol ? { symbol: item.symbol } : {}) };
    };
    target.tokens = prefixSourceIds.flatMap((id, index) => index ? [{ kind: 'operator', value: '×' }, source(id)] : [source(id)]);
    if (prefixSourceIds.length) target.tokens.push({ kind: 'operator', value: '×' });
    target.answerOpen = true;
    draft.answers[targetTaskId] = '';
    entry.editor.setDraft(draft);
    return { sourceRowId: draft.rows.find(row => row.taskId === sourceTaskId).id, targetRowId: target.id };
  }, { selector, sourceTaskId, targetTaskId, prefixSourceIds });
}

async function finishReferenceFormula(selector, targetTaskId, suffixSourceIds) {
  await page.evaluate(({ selector, targetTaskId, suffixSourceIds }) => {
    const entry = window.mediaFormulaEditors.find(item => item.host.closest(selector));
    const draft = entry.editor.getDraft();
    const target = draft.rows.find(row => row.taskId === targetTaskId);
    const reference = target.tokens.find(token => token.kind === 'reference');
    const source = id => {
      const item = entry.definition.sources.find(candidate => candidate.id === id) || entry.definition.constants.find(candidate => candidate.id === id);
      return { kind: 'value', value: item.value, unit: item.unit, ...(item.symbol ? { symbol: item.symbol } : {}) };
    };
    target.tokens = [...target.tokens, ...suffixSourceIds.flatMap(id => [{ kind: 'operator', value: '÷' }, source(id)])];
    // 動画全体の式だけは、参照したフレーム量へ掛ける量を渡す。
    if (targetTaskId === 'total') target.tokens = [reference, ...suffixSourceIds.flatMap(id => [{ kind: 'operator', value: '×' }, source(id)])];
    entry.editor.setDraft(draft);
  }, { selector, targetTaskId, suffixSourceIds });
}

async function setIndependentFormula(selector, taskId, tokens) {
  await page.evaluate(({ selector, taskId, tokens }) => {
    const entry = window.mediaFormulaEditors.find(item => item.host.closest(selector));
    const draft = entry.editor.getDraft();
    const row = draft.rows.find(item => item.taskId === taskId);
    row.tokens = tokens;
    row.answerOpen = true;
    draft.answers[taskId] = '';
    entry.editor.setDraft(draft);
  }, { selector, taskId, tokens });
}

try {
  await verifyProblem({ pageName: 'dr41.html', slide: 7, selector: '[data-image-size-quiz="full-color"]', tasks: ['levels', 'size'] });
  await verifyProblem({ pageName: 'dr41.html', slide: 7, selector: '[data-image-size-quiz="color-count"]', tasks: ['bits', 'size'] });
  await verifyProblem({ pageName: 'dr42.html', slide: 6, selector: '[data-video-quiz="duration"]', tasks: ['duration'], reset: true });
  await verifyProblem({ pageName: 'dr42.html', slide: 7, selector: '[data-video-quiz="size"]', tasks: ['frame', 'total'], reset: true });

  // 色数→bit数の結論を、式の値として次のデータ量の式へネイティブdragする。
  await page.goto(pageURL('dr41.html', 'headline_7'));
  const colorHost = page.locator('[data-image-size-quiz="color-count"]');
  const bitsTask = colorHost.locator('[data-formula-task="bits"]');
  await bitsTask.locator('[data-formula-blank="lower"]').fill('14');
  await bitsTask.locator('[data-formula-blank="bound"]').fill('32768');
  await bitsTask.locator('[data-formula-blank="upper"]').fill('15');
  await bitsTask.locator('[data-formula-answer="bits"]').fill('15');
  const colorRows = await prepareReferenceTarget('[data-image-size-quiz="color-count"]', 'bits', 'size', ['width', 'height']);
  const colorSize = colorHost.locator('[data-formula-task="size"]');
  const colorGrip = bitsTask.locator(`[data-formula-result-grip="${colorRows.sourceRowId}"]`);
  await colorGrip.dragTo(colorSize.locator('[data-formula-slot]').last());
  assert.ok((await entryFor('[data-image-size-quiz="color-count"]')).draft.rows.find(row => row.id === colorRows.targetRowId).tokens.some(token => token.kind === 'reference' && token.rowId === colorRows.sourceRowId), 'bitsの∴結論つまみをdragしてsize式へ参照を挿入');
  await finishReferenceFormula('[data-image-size-quiz="color-count"]', 'size', ['bit-byte', 'byte-kilo', 'byte-kilo']);
  await colorSize.locator('[data-formula-answer="size"]').fill('1.5');
  await colorSize.locator('[data-formula-judge]').click();
  const colorReferenceFeedback = await colorSize.locator('.formula-feedback').allTextContents();
  const colorReferenceTokens = (await entryFor('[data-image-size-quiz="color-count"]')).draft.rows.find(row => row.taskId === 'size').tokens;
  assert.ok(colorReferenceFeedback.some(text => text.includes('立式') && text.includes('○') && text.includes('答え') && text.includes('○')), `15bitの結論参照を含むsize式を1.5MBとして判定 (${colorReferenceFeedback.join(' / ')}; ${JSON.stringify(colorReferenceTokens)})`);
  await bitsTask.locator('[data-formula-answer="bits"]').fill('14');
  assert.equal(await colorSize.locator('[data-formula-answer="size"]').inputValue(), '1.5', '結論を14へ変更してもsizeの手入力答えは自動変更しない');
  assert.ok((await colorSize.locator('[data-formula-reference]').allTextContents()).some(text => /14.*bit/.test(text)), '結論を14へ変更すると参照値だけを更新する');
  await bitsTask.locator('[data-formula-judge]').click();
  assert.equal(await bitsTask.locator('[data-formula-answer="bits"]').getAttribute('aria-invalid'), 'true', '14bitの結論は誤答として示す');
  assert.ok((await bitsTask.locator('.formula-feedback').allTextContents()).some(text => text.includes('答え')), '結論の誤答フィードバックを表示する');

  // bits小問が未入力でも、独立したsize小問は従来どおり判定できる。
  await page.goto(pageURL('dr41.html', 'headline_7'));
  const independentHost = page.locator('[data-image-size-quiz="color-count"]');
  const independentTokens = await page.evaluate(() => {
    const entry = window.mediaFormulaEditors.find(item => item.host.closest('[data-image-size-quiz="color-count"]'));
    const source = id => {
      const item = entry.definition.sources.find(candidate => candidate.id === id) || entry.definition.constants.find(candidate => candidate.id === id);
      return { kind: 'value', value: item.value, unit: item.unit, ...(item.symbol ? { symbol: item.symbol } : {}) };
    };
    const op = value => ({ kind: 'operator', value });
    return [source('width'), op('×'), source('height'), op('×'), { kind: 'value', value: '15', unit: 'bit/pixel' }, op('÷'), source('bit-byte'), op('÷'), source('byte-kilo'), op('÷'), source('byte-kilo')];
  });
  await setIndependentFormula('[data-image-size-quiz="color-count"]', 'size', independentTokens);
  const independentSize = independentHost.locator('[data-formula-task="size"]');
  await independentSize.locator('[data-formula-answer="size"]').fill('1.5');
  await independentSize.locator('[data-formula-judge]').click();
  assert.ok((await independentSize.locator('.formula-feedback').allTextContents()).some(text => text.includes('立式') && text.includes('○') && text.includes('答え') && text.includes('○')), 'bits未入力でも独立したsizeを手入力して判定できる');

  // 動画でも1フレームの答えをネイティブdragし、動画全体の式で参照できる。
  await page.goto(pageURL('dr42.html', 'headline_7'));
  await setCorrect('[data-video-quiz="size"]');
  const videoReferenceHost = page.locator('[data-video-quiz="size"]');
  const videoRows = await prepareReferenceTarget('[data-video-quiz="size"]', 'frame', 'total', []);
  const videoFrame = videoReferenceHost.locator('[data-formula-task="frame"]');
  const videoTotal = videoReferenceHost.locator('[data-formula-task="total"]');
  await videoFrame.locator(`[data-formula-result-grip="${videoRows.sourceRowId}"]`).dragTo(videoTotal.locator('[data-formula-slot]').last());
  assert.ok((await entryFor('[data-video-quiz="size"]')).draft.rows.find(row => row.id === videoRows.targetRowId).tokens.some(token => token.kind === 'reference' && token.rowId === videoRows.sourceRowId), 'frameの答えつまみをdragしてtotal式へ参照を挿入');
  await finishReferenceFormula('[data-video-quiz="size"]', 'total', ['rate', 'duration']);
  await videoTotal.locator('[data-formula-answer="total"]').fill('2592');
  await videoTotal.locator('[data-formula-judge]').click();
  assert.ok((await videoTotal.locator('.formula-feedback').allTextContents()).some(text => text.includes('立式') && text.includes('○') && text.includes('答え') && text.includes('○')), 'frame参照を含む動画全体の式を判定');

  await page.goto(pageURL('dr42.html', 'headline_7'));
  const videoHost = page.locator('[data-video-quiz="size"]');
  await setCorrect('[data-video-quiz="size"]');
  const beforeMove = await entryFor('[data-video-quiz="size"]');
  await page.evaluate(() => { location.hash = '#headline_6'; });
  await page.evaluate(() => { location.hash = '#headline_7'; });
  assert.deepEqual((await entryFor('[data-video-quiz="size"]')).draft, beforeMove.draft, 'スライド移動で立式・途中結果を保持');

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
        const layout = await videoHost.evaluate(host => ({
          pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          hostOverflow: host.scrollWidth > host.clientWidth + 1,
          buttons: [...host.querySelectorAll('button,input,select')].filter(node => node.checkVisibility()).every(node => node.getBoundingClientRect().height >= 43.5),
          expressionOverflow: getComputedStyle(host.querySelector('.formula-expression')).overflowX
        }));
        assert.equal(layout.pageOverflow, false, `${width}/${theme}/${size}: ページ全体を横にはみ出さない`);
        assert.equal(layout.hostOverflow, false, `${width}/${theme}/${size}: 問題枠を押し広げない`);
        assert.equal(layout.buttons, true, `${width}/${theme}/${size}: 操作部品は44px以上`);
        assert.equal(layout.expressionOverflow, 'auto', `${width}/${theme}/${size}: 長い式だけを横スクロール`);
      }
    }
  }

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await touch.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await touch.goto(pageURL('dr41.html', 'headline_7'));
  const builder = touch.locator('[data-image-size-quiz="full-color"] [data-image-formula-builder]');
  await builder.locator('[data-formula-slot]').first().tap();
  await builder.locator('[data-formula-quantity]').first().tap();
  assert.equal(await builder.locator('[data-formula-token]').count(), 1, 'タップで値カードを式へ挿入できる');
  assert.equal(await touch.evaluate(() => location.hash), '#headline_7', 'タップはスライド移動と競合しない');
  await touch.close();
  await page.goto(pageURL('dr42.html', 'headline_6'));
  const keyboardBuilder = page.locator('[data-video-quiz="duration"] [data-video-formula-builder]');
  await keyboardBuilder.locator('[data-formula-slot]').first().focus();
  await page.keyboard.press('Enter');
  await keyboardBuilder.locator('[data-formula-quantity]').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await keyboardBuilder.locator('[data-formula-token]').count(), 1, 'キーボードで値カードを式へ挿入できる');
  assert.equal(await page.evaluate(() => location.hash), '#headline_6', 'キーボード操作はスライド移動と競合しない');
  assert.deepEqual(errors, [], 'ブラウザ例外なし');
  console.log(`media-formula-integration (${engine}): dr41/dr42の4問題・7小問、解説、リセット、表示条件、タップ OK`);
} finally {
  await browser.close();
}
