// dr43の印刷問題と共通式編集・採点・解説の接続を実ブラウザで検証する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = require(modulePath);
const { expect } = require(`${modulePath}/test`);
const base = new URL(process.env.JOHO_TEST_URL || 'http://127.0.0.1:8773/');
const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (new URL(r.url()).origin === base.origin && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await page.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
await page.addInitScript(() => {
  let api;
  Object.defineProperty(window, 'LessonFormulaBuilder', {
    get: () => api,
    set(value) { api = { ...value, mount(host, definition, options) {
      const editor = value.mount(host, definition, options);
      host.testEditor = editor; host.testDefinition = definition;
      return editor;
    } }; }
  });
});
const builder = page.locator('[data-output-quiz] [data-output-formula-builder]');
const host = page.locator('[data-output-quiz]');
const width = host.locator('[data-formula-task="width"]');
const height = host.locator('[data-formula-task="height"]');
async function draft() { return builder.evaluate(n => n.testEditor.getDraft()); }
async function seed(tokens, answer = '1600') {
  await builder.evaluate((n, { tokens, answer }) => {
    const draft = n.testEditor.getDraft();
    draft.rows[0].tokens = tokens || n.testDefinition.tasks[0].expectedTokens;
    draft.rows[0].answerOpen = true; draft.answers.width = answer;
    n.testEditor.setDraft(draft);
  }, { tokens, answer });
}
async function slide(id) {
  await page.evaluate(id => { location.hash = id; }, id);
  await expect(page.locator(`#${id}`).locator('..')).toBeVisible();
}
try {
  await page.goto(new URL('dr43.html#headline_8', base).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await expect(width).toBeVisible(); await expect(height).toBeVisible();
  assert.ok((await draft()).rows.every(r => !r.tokens.length && !r.answerOpen));
  await expect(host.locator('[data-output-answer-fallback]')).toBeHidden();
  await expect(host.locator('[data-formula-answer]')).toHaveCount(0);
  await expect(host.locator('[data-output-solution-next]')).toHaveCount(0);
  // キーボードで換算式を組み、途中結果を追加行へ参照する。
  await width.locator('[data-formula-slot]').first().click();
  for (const selector of ['[data-formula-quantity="width"]', '[data-formula-operator="÷"]', '[data-formula-constant="mm-inch"]', '[data-formula-operator="="]']) {
    await host.locator(selector).focus(); await page.keyboard.press('Enter');
  }
  await width.locator('[data-formula-answer]').fill('4');
  await width.locator('[data-formula-add-row]').click();
  const rows = width.locator('[data-formula-row]');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).locator('[data-formula-result-unit]').selectOption('inch');
  await rows.nth(0).locator('[data-formula-result-grip]').click();
  await rows.nth(1).locator('[data-formula-slot]').first().click();
  await host.locator('[data-formula-operator="×"]').click();
  await host.locator('[data-formula-quantity="dpi"]').click();
  await host.locator('[data-formula-operator="="]').click();
  await rows.nth(1).locator('[data-formula-answer]').fill('1500');
  await rows.nth(1).locator('[data-formula-judge]').click();
  await expect(width.locator('.formula-feedback').last()).toContainText('立式：○　答え：×');
  await rows.nth(1).locator('[data-formula-answer]').fill('1600');
  await rows.nth(1).locator('[data-formula-judge]').click();
  await expect(width.locator('.formula-feedback').last()).toContainText('立式：○　答え：○');
  assert.ok((await draft()).rows.filter(r => r.taskId === 'height').every(r => !r.tokens.length), '未入力の縦を強制しない');
  await expect(host.locator('details')).not.toHaveAttribute('open', '');
  const saved = await draft();
  await host.locator('summary').click();
  assert.ok(await host.locator('[data-output-solution] ol > li').evaluateAll(nodes => nodes.every(n => !n.hidden && n.checkVisibility())));
  assert.deepEqual(await draft(), saved, '解説を開いても入力を保持');
  await host.locator('summary').click();
  await slide('headline_7'); await slide('headline_8');
  assert.deepEqual(await draft(), saved, 'スライド往復で入力を保持');
  await host.locator('[type="reset"]').click();
  assert.ok((await draft()).rows.every(r => !r.tokens.length && !r.answerOpen), '入力を消すで初期化');
  // 結果だけの入力を立式として通さず、判定後も編集可能。
  await seed([{ kind: 'value', value: '1600', unit: 'pixel' }]);
  await width.locator('[data-formula-judge]').click();
  await expect(width.locator('.formula-feedback').last()).toContainText('立式：×　答え：○');
  await seed(); await width.locator('[data-formula-judge]').click();
  await expect(width.locator('.formula-feedback').last()).toContainText('立式：○　答え：○');
  await expect(width.locator('[data-formula-answer]')).toBeEditable();
  // 縦の数量カードをドラッグできることを接続確認。
  await host.locator('[type="reset"]').click();
  await host.locator('[data-formula-quantity="height"]').dragTo(height.locator('[data-formula-slot]').first());
  assert.equal((await draft()).rows.find(r => r.taskId === 'height').tokens[0].value, '76.2');
  // 8枚目の従来の計算問題は保持する。
  await slide('headline_7');
  const dots = page.locator('[data-output-dot-quiz]');
  for (const [name, answer] of Object.entries({ row: '300', total: '90000', doubleTotal: '360000', ratio: '4' })) await dots.locator(`[name="${name}"]`).fill(answer);
  await dots.locator('[type="submit"]').click();
  await expect(dots.locator('[data-output-feedback]')).toContainText('正解です');
  await slide('headline_8'); await seed();
  for (const size of [1440, 720, 390]) {
    await page.setViewportSize({ width: size, height: 1000 });
    for (const theme of ['light', 'dark', 'auto']) for (const text of ['normal', 'large', 'xlarge']) {
      await page.evaluate(({ theme, text }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.textSize = text; }, { theme, text });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const box = await page.evaluate(() => {
        const s = document.querySelector('#headline_8').closest('section');
        return [document.documentElement.scrollWidth, innerWidth, s.scrollWidth, s.clientWidth];
      });
      assert.ok(box[0] <= box[1] + 1 && box[2] <= box[3] + 1, `${size}/${theme}/${text}: 横はみ出し ${box}`);
    }
  }
  const plain = await browser.newPage({ javaScriptEnabled: false });
  await plain.goto(new URL('dr43.html#headline_8', base).href);
  await expect(plain.locator('section[data-lesson-slide]')).toHaveCount(11);
  await expect(plain.locator('[data-output-answer-fallback]')).toBeVisible();
  await plain.locator('[data-output-quiz] summary').press('Enter');
  await expect(plain.locator('[data-output-quiz] [data-output-solution]')).toContainText('1600×1200画素');
  await plain.close();
  const touch = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, reducedMotion: 'reduce' });
  await touch.goto(new URL('dr43.html#headline_8', base).href);
  await touch.locator('[data-output-quiz] [data-output-formula-builder] .formula-task').first().locator('[data-formula-slot]').first().tap();
  await touch.locator('[data-output-quiz] [data-formula-quantity="width"]').tap();
  await touch.locator('[data-output-quiz] [data-formula-operator="="]').tap();
  await expect(touch.locator('[data-output-quiz] [data-formula-task="width"] [data-formula-answer]')).toBeVisible();
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(`${engine}: 印刷の途中式・参照・再判定・従来問題・27表示条件・タッチ・JS無効の検証に合格`);
} finally { await browser.close(); }
