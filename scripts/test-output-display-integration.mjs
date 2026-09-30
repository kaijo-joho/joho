// dr43のppi・fps/Hz問題を、既存の式UIと組み合わせて検証する。
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
  Object.defineProperty(window, 'LessonFormulaBuilder', { get: () => api, set(value) {
    api = { ...value, mount(host, definition, options) {
      const editor = value.mount(host, definition, options);
      host.testEditor = editor; host.testDefinition = definition; return editor;
    } };
  } });
});
const ppi = page.locator('[data-output-ppi-quiz]');
const refresh = page.locator('[data-output-refresh-quiz]');
const task = (host, id) => host.locator(`[data-formula-task="${id}"]`);
async function draft(host) { return host.locator('[data-output-formula-builder]').evaluate(n => n.testEditor.getDraft()); }
async function slide(id) {
  await page.evaluate(id => { location.hash = id; }, id);
  await expect(page.locator(`#${id}`).locator('..')).toBeVisible();
}
async function enter(host, id, cards, answer) {
  await task(host, id).locator('[data-formula-slot]').first().click();
  for (const selector of cards) await host.locator(selector).press('Enter');
  await host.locator('[data-formula-operator="="]').press('Enter');
  await task(host, id).locator('[data-formula-answer]').fill(answer);
  await task(host, id).locator('[data-formula-judge]').press('Enter');
}
async function correct(host, id) { await expect(task(host, id).locator('.formula-feedback').last()).toContainText('立式：○　答え：○'); }
try {
  await page.goto(new URL('dr43.html#headline_ppi_quiz', base).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await expect(page.locator('section[data-lesson-slide]')).toHaveCount(12);
  assert.ok((await draft(ppi)).rows.every(r => !r.tokens.length && !r.answerOpen));
  await expect(ppi.locator('input[type="radio"]:checked')).toHaveCount(0);
  await enter(ppi, 'pixels', ['[data-formula-quantity="ppi"]', '[data-formula-operator="×"]', '[data-formula-quantity="width"]'], '1920');
  await correct(ppi, 'pixels');
  await enter(ppi, 'ppi', ['[data-formula-quantity="pixels"]', '[data-formula-operator="÷"]', '[data-formula-quantity="width"]'], '128');
  await correct(ppi, 'ppi');
  await ppi.locator('[data-output-choice-judge]').click();
  await expect(ppi.locator('[data-output-choice-feedback]')).toContainText('選択肢を選んで');
  await ppi.getByRole('radio', { name: '2倍', exact: true }).check();
  await ppi.locator('[data-output-choice-judge]').click();
  await expect(ppi.locator('[data-output-choice-feedback]')).toContainText('もう一度');
  await ppi.getByRole('radio', { name: '4倍', exact: true }).check();
  await expect(ppi.locator('[data-output-choice-feedback]')).toBeEmpty();
  await ppi.locator('[data-output-choice-judge]').click();
  await expect(ppi.locator('[data-output-choice-feedback]')).toContainText('正解です');
  const ppiSaved = await draft(ppi);
  await ppi.locator('summary').click();
  assert.ok(await ppi.locator('[data-output-solution] li').evaluateAll(nodes => nodes.every(n => n.checkVisibility() && !n.hidden)));
  assert.deepEqual(await draft(ppi), ppiSaved, '解説で入力を保持');
  await slide('headline_refresh_quiz');
  assert.ok((await draft(refresh)).rows.every(r => !r.tokens.length && !r.answerOpen));
  await expect(refresh.locator('input[type="radio"]:checked')).toHaveCount(0);
  await enter(refresh, 'frames', ['[data-formula-quantity="fps"]', '[data-formula-operator="×"]', '[data-formula-quantity="duration"]'], '15');
  await correct(refresh, 'frames');
  await enter(refresh, 'updates', ['[data-formula-quantity="hz"]', '[data-formula-operator="×"]', '[data-formula-quantity="duration"]'], '60');
  await correct(refresh, 'updates');
  await task(refresh, 'updates').locator('[data-formula-result-grip]').click();
  await task(refresh, 'repeats').locator('[data-formula-slot]').first().click();
  await refresh.locator('[data-formula-operator="÷"]').click();
  await task(refresh, 'frames').locator('[data-formula-result-grip]').click();
  await task(refresh, 'repeats').locator('[data-formula-slot]').last().click();
  await refresh.locator('[data-formula-operator="="]').click();
  await task(refresh, 'repeats').locator('[data-formula-answer]').fill('4');
  await task(refresh, 'repeats').locator('[data-formula-judge]').click();
  await correct(refresh, 'repeats');
  const references = (await draft(refresh)).rows.find(r => r.taskId === 'repeats').tokens.filter(t => t.kind === 'reference');
  assert.equal(references.length, 2, '前の2小問を参照');
  await task(refresh, 'frames').locator('[data-formula-answer]').fill('20');
  await task(refresh, 'repeats').locator('[data-formula-answer]').fill('3');
  await task(refresh, 'repeats').locator('[data-formula-judge]').click();
  await expect(task(refresh, 'repeats').locator('.formula-feedback').last()).toContainText('答え：×');
  await expect(task(refresh, 'frames').locator('[data-formula-answer]')).toHaveValue('20');
  await task(refresh, 'frames').locator('[data-formula-answer]').fill('15');
  await expect(task(refresh, 'repeats').locator('[data-formula-answer]')).toHaveValue('3');
  await task(refresh, 'repeats').locator('[data-formula-answer]').fill('4');
  await task(refresh, 'repeats').locator('[data-formula-judge]').click();
  await correct(refresh, 'repeats');
  await refresh.getByRole('radio', { name: '増える', exact: true }).check();
  await refresh.locator('[data-output-choice-judge]').click();
  await expect(refresh.locator('[data-output-choice-feedback]')).toContainText('もう一度');
  await refresh.getByRole('radio', { name: '増えない', exact: true }).check();
  await refresh.locator('[data-output-choice-judge]').click();
  await expect(refresh.locator('[data-output-choice-feedback]')).toContainText('正解です');
  await refresh.locator('summary').click();
  assert.ok(await refresh.locator('[data-output-solution] li').evaluateAll(nodes => nodes.every(n => n.checkVisibility() && !n.hidden)));
  const refreshSaved = await draft(refresh);
  await slide('headline_ppi_quiz');
  assert.deepEqual(await draft(ppi), ppiSaved, '問題間を移動して入力を保持');
  await expect(ppi.getByRole('radio', { name: '4倍', exact: true })).toBeChecked();
  await slide('headline_refresh_quiz');
  assert.deepEqual(await draft(refresh), refreshSaved);
  await refresh.locator('[type="reset"]').click();
  assert.ok((await draft(refresh)).rows.every(r => !r.tokens.length && !r.answerOpen));
  await expect(refresh.locator('input[type="radio"]:checked')).toHaveCount(0);
  await expect(refresh.locator('[data-output-choice-feedback]')).toBeEmpty();
  const help = refresh.getByRole('button', { name: '式の組み立て方 ▾', exact: true });
  await help.click(); await page.keyboard.press('Escape'); await expect(help).toBeFocused();
  // 3幅・3テーマ・3文字サイズで、新しい2枚と展開した解説を確認。
  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark', 'auto']) for (const text of ['normal', 'large', 'xlarge']) {
      await page.evaluate(({ theme, text }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.textSize = text; }, { theme, text });
      for (const id of ['headline_ppi_quiz', 'headline_refresh_quiz']) {
        await slide(id);
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const box = await page.evaluate(id => { const s = document.getElementById(id).closest('section'); return [document.documentElement.scrollWidth, innerWidth, s.scrollWidth, s.clientWidth]; }, id);
        assert.ok(box[0] <= box[1] + 1 && box[2] <= box[3] + 1, `${id}/${width}/${theme}/${text}: 横はみ出し ${box}`);
      }
    }
  }
  const plain = await browser.newPage({ javaScriptEnabled: false });
  await plain.goto(new URL('dr43.html#headline_ppi_quiz', base).href);
  await expect(plain.locator('section[data-lesson-slide]')).toHaveCount(11);
  for (const selector of ['[data-output-ppi-quiz]', '[data-output-refresh-quiz]']) {
    await plain.locator(`${selector} summary`).press('Enter');
    await expect(plain.locator(`${selector} [data-output-solution]`)).toBeVisible();
  }
  await plain.close();
  const touch = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, reducedMotion: 'reduce' });
  await touch.goto(new URL('dr43.html#headline_ppi_quiz', base).href);
  const touchHost = touch.locator('[data-output-ppi-quiz]');
  await touchHost.getByRole('radio', { name: '4倍', exact: true }).tap();
  await touchHost.locator('[data-output-choice-judge]').tap();
  await expect(touchHost.locator('[data-output-choice-feedback]')).toContainText('正解です');
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(`${engine}: ppi・fps/Hzの入力、2小問参照、確認問題、再判定、54表示条件、JS無効に合格`);
} finally { await browser.close(); }
