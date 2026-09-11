import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-workbench-ui-'));
const errors = [];
console.log(`Browser artifacts: ${artifacts}`);

async function open(engine) {
  const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(baseURL)) errors.push(response.url());
  });
  await page.goto(new URL('lc02.html', baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await page.locator('.logic-workbench-boundary').waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { browser, context, page };
}

async function checks(page, name) {
  const boundary = page.locator('.logic-workbench-boundary');
  const panel = page.locator('#logic-workbench-table-panel');
  const before = await page.evaluate(() => window.logicWorkbenchEditor.snapshot());
  assert.equal(await page.locator('[data-lesson-supplement-open="lc02-operation-dialog"]').count(), 2, 'intro and toolbar share the common modal');
  const layout = await page.evaluate(() => Object.fromEntries(['#logic-editor', '.logic-workbench-boundary', '#logic-workbench-table-panel'].map(selector => [selector, document.querySelector(selector).getBoundingClientRect().toJSON()])));
  const editorBox = layout['#logic-editor']; const boundaryBox = layout['.logic-workbench-boundary']; const tableBox = layout['#logic-workbench-table-panel'];
  assert.ok(editorBox.right <= boundaryBox.left && boundaryBox.right <= tableBox.left, 'button lies between editor and table');
  assert.ok(Math.abs(editorBox.y - tableBox.y) < 1 && Math.abs(editorBox.bottom - tableBox.bottom) < 1, 'editor and table occupy the same grid row');
  assert.ok(boundaryBox.width >= 44 && boundaryBox.height >= 44, 'boundary has a usable target');
  await page.screenshot({ path: join(artifacts, `${name}-expanded.png`) });
  await boundary.click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await boundary.getAttribute('aria-expanded'), 'false');
  assert.equal(await boundary.getAttribute('aria-label'), '真理値表を表示');
  const collapsed = await page.evaluate(() => window.logicWorkbenchEditor.snapshot());
  assert.deepEqual(collapsed, before, `${name}: collapse preserves circuit state`);
  assert.ok((await page.locator('#logic-editor').boundingBox()).width > editorBox.width + 150, 'collapse gives the table space back to the editor');
  await expect(boundary).toBeFocused();
  await page.screenshot({ path: join(artifacts, `${name}-collapsed.png`) });
  await boundary.click();
  await panel.waitFor({ state: 'visible' });
  assert.equal(await boundary.getAttribute('aria-expanded'), 'true');
  await boundary.focus(); await page.keyboard.press('Enter');
  await panel.waitFor({ state: 'hidden' });
  await boundary.focus(); await page.keyboard.press('Enter');
  assert.equal(await boundary.getAttribute('aria-expanded'), 'true');

  const helpButton = page.getByRole('button', { name: '回路エディタの操作方法', exact: true });
  await helpButton.click();
  const help = page.locator('#lc02-operation-dialog');
  await help.waitFor({ state: 'visible' });
  assert.equal(await help.getByRole('heading', { name: '回路エディタの詳しい操作', exact: true }).count(), 1);
  await help.press('Escape');
  await help.waitFor({ state: 'hidden' });
  await expect(helpButton).toHaveAttribute('aria-expanded', 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '回路エディタの操作方法');
  await helpButton.click();
  await page.mouse.click(2, 2);
  await help.waitFor({ state: 'hidden' });
  await helpButton.click();
  const helpBox = await help.boundingBox();
  assert.ok(helpBox && helpBox.height <= 0.82 * 900 + 2);
  assert.equal(await help.locator('h4').count(), 4);
  assert.match(await help.textContent(), /曲がる位置/);
  assert.match(await help.textContent(), /ローカルファイル/);
  await page.screenshot({ path: join(artifacts, `${name}-help.png`) });
  await help.getByRole('button', { name: '詳しい操作方法を閉じる', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await boundary.boundingBox());
  await boundary.click(); await panel.waitFor({ state: 'hidden' });
  await boundary.click(); await panel.waitFor({ state: 'visible' });
  const mobileButton = await boundary.boundingBox(); const mobileTable = await panel.boundingBox();
  assert.ok(mobileTable.y >= mobileButton.y + mobileButton.height, 'mobile boundary separates vertically stacked editor and table');
  for (const theme of ['light', 'dark', 'system']) {
    for (const size of ['standard', 'large', 'xlarge']) {
      await page.evaluate(({ theme, size }) => { siteTheme.setPreference(theme); siteTextSize.setPreference(size); }, { theme, size });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await helpButton.click();
      assert.ok(await help.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
      if (theme === 'dark' && size === 'xlarge') await page.screenshot({ path: join(artifacts, `${name}-mobile-help.png`) });
      await help.press('Tab'); await help.press('Shift+Tab'); await help.press('Escape');
      await expect(helpButton).toBeFocused();
      await expect(helpButton).toHaveAttribute('aria-expanded', 'false');
    }
  }
}

for (const engine of [chromium, webkit]) {
  const { browser, context, page } = await open(engine);
  try {
    await checks(page, engine === chromium ? 'chrome' : 'webkit');
    console.log(`${engine === chromium ? 'chrome' : 'webkit'}: workbench boundary/help passed`);
  } finally { await context.close(); await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-workbench-ui-browser: passed');
