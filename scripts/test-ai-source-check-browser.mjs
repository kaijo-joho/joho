import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || '/Users/takashi/Documents/GAS/webedu/node_modules/playwright';
const { chromium, webkit } = require(modulePath);
const { expect } = require(`${modulePath}/test`);
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8793/';
const output = process.env.JOHO_TEST_OUTPUT || '/tmp/new-series-source-check';
await mkdir(output, { recursive: true });
const results = [];
async function show(page, id, step = 2) {
  await page.evaluate(({ id, step }) => {
    location.hash = id;
    const root = document.getElementById(id).closest('section').querySelector('[data-lesson-progress]');
    if (root) window.JohoLessonProgress.set(root, step);
  }, { id, step });
  await expect(page.locator(`#${id}`)).toBeVisible();
}
async function fit(page, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bounds = await page.evaluate(() => {
    const slide = [...document.querySelectorAll('.lesson-slide')].find(node => !node.hidden);
    return { page: document.documentElement.scrollWidth, viewport: innerWidth, slide: slide.scrollWidth, available: slide.clientWidth };
  });
  assert.ok(bounds.page <= bounds.viewport + 2 && bounds.slide <= bounds.available + 2, `${label}: ${JSON.stringify(bounds)}`);
}
for (const engine of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('https://**/*', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}is63.html#headline_4`);
    await page.locator('body.lesson-slide-ready').waitFor();
    await show(page, 'headline_4');
    const task = page.locator('[data-ai-source-check]');
    const answer = task.locator('details');
    await expect(task).toHaveClass(/ai-source-ready/);
    await expect(answer).not.toHaveAttribute('open', '');
    await task.locator('[data-ai-check]').press('Enter');
    await expect(task.locator('select').first()).toBeFocused();
    await expect(task.locator('[data-ai-feedback]')).toContainText('まだ選んでいない');
    for (const row of await task.locator('fieldset').all()) {
      await row.locator('[data-ai-verdict]').selectOption('supported');
      await row.locator('[data-ai-evidence]').selectOption('audience');
    }
    await task.locator('[data-ai-check]').click();
    await expect(task.locator('[data-ai-feedback]')).toContainText('4文中1文');
    await expect(answer).not.toHaveAttribute('open', '');
    const correct = [['A', 'different', 'time'], ['B', 'different', 'place'], ['C', 'supported', 'audience'], ['D', 'unknown', 'none']];
    for (const [letter, verdict, source] of correct) {
      await page.locator(`#is63-verdict-${letter}`).selectOption(verdict);
      await page.locator(`#is63-evidence-${letter}`).selectOption(source);
    }
    await expect(task.locator('[data-ai-row-feedback]').first()).toBeEmpty();
    await task.locator('[data-ai-check]').press('Space');
    await expect(task.locator('[data-ai-feedback]')).toContainText('4文とも');
    await page.locator('#is63-verdict-D').selectOption('different');
    await task.locator('[data-ai-check]').click();
    await expect(task.locator('[data-ai-feedback]')).toContainText('4文中3文');
    await expect(task.locator('fieldset').last().locator('[data-ai-row-feedback]')).toContainText('「書かれていない」と「食い違う」');
    await page.locator('#is63-verdict-D').selectOption('unknown');
    await task.locator('[data-ai-check]').click();
    const revision = '11月15日15:30から視聴覚室。在校生が参加できます。\n記念品は行事係へ確認します。<script>window.unexpectedDraft = true</script>';
    await task.locator('[data-ai-revision]').fill(revision);
    assert.equal(await page.evaluate(() => window.unexpectedDraft), undefined, 'written draft remains text');
    await task.locator('[data-ai-reset]').click();
    assert.deepEqual(await task.locator('select').evaluateAll(nodes => nodes.map(node => node.value)), Array(8).fill(''));
    await expect(task.locator('[data-ai-revision]')).toHaveValue(revision);
    await task.locator('summary').press('Enter');
    await expect(answer).toHaveAttribute('open', '');
    await task.locator('summary').press('Enter');
    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark', 'system']) for (const size of ['standard', 'large', 'xlarge']) {
        await page.evaluate(({ theme, size }) => { window.siteTheme.setPreference(theme); window.siteTextSize.setPreference(size); }, { theme, size });
        await fit(page, `${engine} ${width} ${theme} ${size}`);
        assert.ok(await task.locator('select').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 43.5)), '44px fields');
      }
    }
    await page.evaluate(() => { window.siteTheme.setPreference('light'); window.siteTextSize.setPreference('standard'); });
    await task.screenshot({ path: `${output}/${engine}-is63-source-check-390.png` });
    await show(page, 'headline_4', 0);
    await page.emulateMedia({ media: 'print' });
    await expect(task).toBeVisible();
    await expect(answer).toHaveAttribute('open', '');
    await expect(task.locator('[data-ai-revision-print]')).toHaveText(revision);
    await expect(task.locator('[data-ai-revision]')).toBeHidden();
    await expect(task.locator('.ai-source-controls')).toBeHidden();
    if (engine === 'chrome') await page.pdf({ path: `${output}/is63-source-check.pdf`, format: 'A4', printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('#is63-generation-progress')).toHaveAttribute('data-progress-step', '0');
    await show(page, 'headline_4');
    await expect(answer).not.toHaveAttribute('open', '');
    await expect(task.locator('[data-ai-revision]')).toHaveValue(revision);
    await page.goto(`${base}is52.html#headline_3`);
    await page.locator('body.lesson-slide-ready').waitFor();
    await show(page, 'headline_3');
    const own = page.locator('[data-ps-own-ideas]');
    await expect(own).toBeVisible();
    await own.locator('textarea').fill('自分の案3つを分け、名前と関係を記録する。');
    await show(page, 'headline_4');
    await show(page, 'headline_3');
    await expect(own.locator('textarea')).toHaveValue('自分の案3つを分け、名前と関係を記録する。');
    await fit(page, `${engine} is52 390`);
    await own.screenshot({ path: `${output}/${engine}-is52-own-ideas-390.png` });
    await page.emulateMedia({ media: 'print' });
    await expect(own).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await expect(own.locator('textarea')).toHaveValue('自分の案3つを分け、名前と関係を記録する。');
    assert.deepEqual(errors, [], 'no page errors or local asset failures');
    await context.close();
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 1000 } });
    await noJs.route('https://**/*', route => route.abort());
    const fallback = await noJs.newPage();
    await fallback.goto(`${base}is63.html`);
    const source = fallback.locator('[data-ai-source-check]');
    await expect(source).toBeVisible();
    await expect(source.locator('details')).toHaveAttribute('open', '');
    await expect(source.locator('.ai-source-controls')).toBeHidden();
    assert.equal(await source.locator('fieldset').count(), 4, 'all source-comparison statements readable without JS');
    await noJs.close();
    const touch = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 1000 } });
    await touch.route('https://**/*', route => route.abort());
    const tapPage = await touch.newPage();
    await tapPage.goto(`${base}is63.html#headline_4`);
    await tapPage.locator('body.lesson-slide-ready').waitFor();
    const progress = tapPage.locator('#is63-generation-progress');
    await progress.locator('[data-progress-next]').tap();
    await progress.locator('[data-progress-next]').tap();
    await tapPage.locator('[data-ai-check]').tap();
    await expect(tapPage.locator('#is63-verdict-A')).toBeFocused();
    await touch.close();
    results.push({ engine, layoutConditions: 27, task: 'judgment, evidence, retry, reset, text safety, print restoration, no-JS, touch', errors: 0 });
    console.log(`${engine}: source-check and own-ideas activity passed`);
  } finally { await browser.close(); }
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
