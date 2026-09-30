// Usage: PLAYWRIGHT_MODULE=/path/to/playwright JOHO_BROWSER=webkit node scripts/test-compression-pages-browser.mjs http://127.0.0.1:8824/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { expect } = require(`${process.env.PLAYWRIGHT_MODULE || 'playwright'}/test`);
const base = new URL(process.argv[2] || 'http://127.0.0.1:8824/');
const engine = process.env.JOHO_BROWSER === 'webkit' ? 'webkit' : 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const blockedExternal = new Set();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() !== 'error') return;
  // Fonts/analytics are deliberately offline. Only their exact aborted-resource message is ignored.
  if (blockedExternal.has(message.location().url) && message.text() === 'Failed to load resource: net::ERR_FAILED') return;
  errors.push({ message: message.text(), url: message.location().url });
});
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin === base.origin) return route.continue();
  blockedExternal.add(route.request().url());
  return route.abort();
});
// Test-only handles exercise the same shared formula entry API used by sound/image/output lessons.
await page.addInitScript(() => {
  let api;
  Object.defineProperty(window, 'LessonFormulaBuilder', { configurable: true, get: () => api, set: value => {
    api = { ...value, mount(host, definition, options) {
      const editor = value.mount(host, definition, options);
      host.__compressionTest = { editor, definition };
      return editor;
    } };
  } });
});
const goSlide = n => page.getByRole('button', { name: new RegExp(`^${n} / 7：`) }).click();
const load = async id => { await page.goto(new URL(`${id}.html`, base).href); await expect(page.locator('nav[aria-label="スライド間の移動"]')).toBeVisible(); };
const field = (root, key) => root.locator(`[data-cp-huffman-field="${key}"]`);
const clone = x => JSON.parse(JSON.stringify(x));
try {
  await load('dr51');
  await goSlide(1);
  await page.getByRole('button', { name: '圧縮して比べる', exact: true }).click();
  await expect(page.locator('[data-cp-model-status]')).toContainText('8 / 16');
  await expect(page.locator('[data-cp-model-result]')).toContainText('12 bit');
  await page.getByRole('combobox', { name: '階調数', exact: true }).selectOption('4');
  await expect(page.locator('[data-cp-model-caption]')).toContainText('未実行');
  await page.getByRole('button', { name: '圧縮して比べる', exact: true }).click();
  await expect(page.locator('[data-cp-model-status]')).toContainText('変更された画素は0個');
  await expect(page.locator('[data-cp-model-result]')).toContainText('28 bit');
  await goSlide(2);
  await expect(page.locator('[data-cp-size-result]')).toContainText('削減率：37.5%');
  await page.getByRole('spinbutton', { name: '圧縮前のサイズ', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: '圧縮後のサイズ', exact: true }).fill('12');
  await expect(page.locator('[data-cp-size-result]')).toContainText('増加率：20%');
  await page.getByRole('spinbutton', { name: '圧縮前のサイズ', exact: true }).fill('0');
  await expect(page.locator('[data-cp-size-result]')).toContainText('0より大きい数');
  assert.equal(await page.locator('[data-cp-size-chart]').getAttribute('aria-label'), null);
  await goSlide(3);
  await page.getByRole('radio', { name: 'どちらも同じ', exact: true }).check();
  await page.getByRole('button', { name: '圧縮して比較', exact: true }).click();
  await expect(page.locator('[data-cp-string-compare-results]')).toContainText('200%');
  await expect(page.locator('[data-cp-string-compare-status]')).toContainText('予想と結果');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '次のまとまり', exact: true }).click();
  await expect(page.locator('[data-cp-rle-rate]')).toContainText('62.5%');
  await goSlide(4);
  await page.getByRole('radio', { name: 'まとまった配置', exact: true }).check();
  await page.getByRole('button', { name: '圧縮して比較', exact: true }).click();
  await expect(page.locator('[data-cp-image-compare-status]')).toContainText('黒13画素・白12画素');
  await expect(page.locator('[data-cp-image-compare-results]')).toContainText('24%');
  await goSlide(6);
  await expect(page.locator('[data-cp-string-rate-formula][data-formula-builder]')).toBeVisible();
  // Existing RLE fields still have an independent submit/reset cycle.
  await page.locator('[data-cp-answer="compress"]').fill('E4C2A1B1A1B1');
  await page.locator('[data-cp-answer="restore"]').fill('AAAAAAAAEFDDDD');
  await page.locator('[data-cp-string-quiz] > .cp-controls button[type=submit]').click();
  await expect(page.locator('[data-cp-quiz-feedback]').first()).toContainText('全2項目正解');

  await load('dr52'); await goSlide(1);
  await page.getByRole('button', { name: '4文字目のB。同じ文字を強調する', exact: true }).click();
  assert.equal(await page.locator('[data-cp-frequency-text] [aria-pressed=true]').count(), 7);
  await expect(page.locator('[data-cp-frequency-result]')).toBeHidden();
  for (const [symbol, count] of Object.entries({ A: 5, B: 7, C: 3, D: 2, E: 1 })) await page.getByRole('textbox', { name: `${symbol}の頻度`, exact: true }).fill(String(count));
  await page.getByRole('button', { name: '頻度を判定', exact: true }).click();
  await expect(page.locator('[data-cp-frequency-result]')).toBeVisible();
  await page.getByRole('textbox', { name: 'Aの頻度', exact: true }).fill('4');
  await expect(page.locator('[data-cp-frequency-result]')).toBeHidden();
  await goSlide(4);
  const practice = page.locator('[data-cp-huffman-practice]');
  await practice.getByRole('button', { name: 'A：9回', exact: true }).click();
  await practice.getByRole('button', { name: 'B：7回', exact: true }).click();
  await practice.getByRole('button', { name: '選んだ2つを結合', exact: true }).click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('小さい2つ');
  await practice.getByRole('button', { name: '最初から', exact: true }).click();
  for (const names of [['D：2回', 'E：1回'], ['D・E（結合済み）：3回', 'C：3回'], ['B：7回', 'C・D・E（結合済み）：6回'], ['A：9回', 'B・C・D・E（結合済み）：13回']]) {
    for (const name of names) await practice.getByRole('button', { name, exact: true }).click();
    await practice.getByRole('button', { name: '選んだ2つを結合', exact: true }).click();
  }
  await expect(practice.locator('[data-cp-build-status]')).toContainText('木が完成');
  await expect(practice.locator('[data-cp-codes]')).not.toContainText('？');
  await practice.getByRole('button', { name: '1つ戻る', exact: true }).click();
  await expect(practice.locator('[data-cp-codes]')).toContainText('？');
  await practice.getByRole('combobox').selectOption('1');
  assert.equal(await practice.locator('[data-cp-practice-node]').count(), 5);

  for (const index of [0, 1]) {
    await goSlide(index + 6);
    const quiz = page.locator(`[data-cp-staged-huffman-quiz="${index}"]`);
    const fixture = await page.evaluate(index => window.CompressionCore.HUFFMAN_QUESTIONS[index], index);
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-formula]')).toBeHidden();
    await quiz.getByRole('tab', { name: '1. 頻度', exact: true }).click();
    for (const [symbol, count] of Object.entries(fixture.frequencies)) await field(quiz, `frequency:${symbol}`).fill(String(count));
    await field(quiz, 'frequencyTotal').fill(String(fixture.text.length));
    await quiz.getByRole('button', { name: '段階1を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
    assert.equal(await field(quiz, 'code:A').getAttribute('aria-invalid'), null, '別段階の未入力は採点しない');
    await quiz.getByRole('tab', { name: '2. 符号と符号長', exact: true }).click();
    for (const [symbol, code] of Object.entries(fixture.codes)) { await field(quiz, `code:${symbol}`).fill(code); await field(quiz, `length:${symbol}`).fill(String(code.length)); }
    await quiz.getByRole('button', { name: '段階2を判定', exact: true }).click();
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    const host = quiz.locator('[data-cp-huffman-formula]');
    await expect(host).toHaveAttribute('data-formula-builder', 'true');
    await expect(host).toBeVisible();
    let total = 0;
    for (const [symbol, count] of Object.entries(fixture.frequencies)) { const bits = count * fixture.codes[symbol].length; total += bits; await field(quiz, `bits:${symbol}`).fill(String(bits)); }
    await field(quiz, 'bitsTotal').fill(String(total));
    const seed = await host.evaluate(element => {
      const definition = element.__compressionTest.definition;
      return { rows: definition.tasks.map(task => ({ id: task.id, taskId: task.id, tokens: task.expectedTokens, result: String(task.expected), resultUnit: task.answerUnit, answerOpen: true })), targets: Object.fromEntries(definition.tasks.map(task => [task.id, task.id])), answers: Object.fromEntries(definition.tasks.map(task => [task.id, String(task.expected)])) };
    });
    const wrong = clone(seed);
    wrong.rows.unshift({ ...clone(seed.rows[0]), id: 'wrong-working', result: '999' });
    wrong.rows[1].tokens = [{ kind: 'reference', rowId: 'wrong-working' }];
    await host.evaluate((element, draft) => element.__compressionTest.editor.setDraft(draft), wrong);
    await quiz.getByRole('button', { name: '段階3を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('段階3は正解');
    await host.evaluate((element, draft) => element.__compressionTest.editor.setDraft(draft), seed);
    await quiz.getByRole('button', { name: '段階3を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('段階3は正解');
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.textSize = 'xlarge'; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), '記入済みのハフマン式ビルダーは390px・特大文字でも横はみ出ししない');
    const hash = new URL(page.url()).hash;
    await host.locator('[data-formula-slot]').first().press('ArrowRight');
    assert.equal(new URL(page.url()).hash, hash, '式の矢印操作でスライドを移動しない');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.textSize = 'standard'; });
    await quiz.getByRole('tab', { name: '4. 符号化と復元', exact: true }).click();
    const codec = await page.evaluate(fixture => ({ encoded: window.CompressionCore.encodeHuffman(fixture.encodeText, fixture.codes), decoded: window.CompressionCore.decodeHuffman(fixture.decodeBits, fixture.codes) }), fixture);
    await field(quiz, 'encoded').fill(codec.encoded); await field(quiz, 'decoded').fill(codec.decoded);
    await quiz.getByRole('button', { name: '段階4を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('全2項目正解');
    await quiz.getByRole('tab', { name: '1. 頻度', exact: true }).click();
    await field(quiz, 'frequency:A').fill('0');
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    await expect(host).toBeHidden();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('正解');
    await quiz.getByRole('tab', { name: '4. 符号化と復元', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('正解');
    await quiz.getByRole('button', { name: '入力を消す', exact: true }).click();
    await expect(quiz.getByRole('tab', { name: '1. 頻度', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(field(quiz, 'frequency:A')).toHaveValue('');
  }
  // Responsive states use the same slide navigation and theme/font settings.
  for (const id of ['dr51', 'dr52']) {
    await load(id);
    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark', 'system']) for (const font of ['standard', 'large', 'xlarge']) {
        await page.evaluate(({ theme, font }) => { if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; document.documentElement.dataset.textSize = font; }, { theme, font });
        for (let n = 1; n <= 7; n++) {
          await page.goto(new URL(`${id}.html#headline_${n}`, base).href);
          await expect(page.locator(`#headline_${n}`)).toBeVisible();
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(sizes.scroll <= sizes.width + 1, `${id} ${width}px ${theme}/${font} slide${n} 横はみ出し ${JSON.stringify(sizes)}`);
        }
      }
    }
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noScript.newPage();
  for (const id of ['dr51', 'dr52']) { await fallback.goto(new URL(`${id}.html`, base).href); assert.equal(await fallback.locator('[data-lesson-slide]').count(), 7); await expect(fallback.locator('[data-lesson-slide]').last()).toBeVisible(); assert.equal(await fallback.locator('body.lesson-slide-ready').count(), 0); }
  await noScript.close();
  assert.deepEqual(errors, [], 'ページ例外・コンソールエラーなし');
  console.log(`compression-pages-browser (${engine}): 比較模型、頻度、任意枝木、演習2問全段階、誤計算・再入力・リセット、3幅×3テーマ×3文字サイズ×7枚×2ページ、JavaScript無効を検証`);
} finally { await browser.close(); }
