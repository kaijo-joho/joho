// Local HTTP server + Playwright. JOHO_TEST_URL and JOHO_TEST_BROWSERS are optional.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const engines = { chrome: chromium, webkit };
const ids = ['parity-generator', 'parity-checker', 'multiplexer', 'decoder', 'two-bit-adder'];
const rowCounts = [8, 16, 8, 4, 16];

async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'ページ全体は横にはみ出さない');
}

async function ready(page, id) {
  await page.goto('about:blank');
  await page.goto(new URL(`cp22.html#extension-${id}`, baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await expect(page.locator('[data-extension-ready="true"]')).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
}

async function circuitChecks(page, id, index, width) {
  await ready(page, id);
  const panel = page.locator(`#extension-${id}`);
  const tabs = page.locator('#logic-extension-views [role="tab"]');
  await expect(tabs).toHaveCount(5);
  await expect(panel).toBeVisible();
  await expect(page.locator(`#logic-extension-views [role="tabpanel"]:visible`)).toHaveCount(1);
  await expect(panel.locator('tr[data-row]')).toHaveCount(rowCounts[index]);
  await expect(panel.locator('svg[role="img"]')).toHaveCount(1);
  const gates = await panel.locator('[data-gate]').evaluateAll(nodes => nodes.map(node => node.dataset.gate));
  assert.ok(gates.length && gates.every(type => ['AND', 'OR', 'NOT'].includes(type)), '基本ゲートのみ');
  assert.equal(await panel.locator('.logic-output-box').count(), 0, '出力は枠なしの点');
  const terminalCount = await page.evaluate(circuitId => {
    const circuit = LogicExtensions.CIRCUITS.find(item => item.id === circuitId);
    return circuit.inputs.length + circuit.outputs.length;
  }, id);
  await expect(panel.locator('.logic-terminal')).toHaveCount(terminalCount);

  if (width === 1440) {
    const bottom = await panel.evaluate(el => el.getBoundingClientRect().bottom);
    assert.ok(bottom <= 880, `${id}: 標準サイズでは図・説明が画面内 (${bottom})`);
  }
  await fits(page);
  const originalSvg = await panel.locator('svg[role="img"]').elementHandle();
  const firstInput = panel.locator('.logic-bit-button').first();
  await firstInput.press('Enter');
  await expect(firstInput).toHaveText('1');
  await expect(firstInput).toBeFocused();
  assert.equal(await originalSvg.evaluate(svg => svg.isConnected), true, '値の変更でSVG自体を作り直さない');
  await expect(panel.locator('tr.is-active')).toHaveAttribute('data-row', String(rowCounts[index] / 2));
  assert.ok(await panel.locator('.logic-wire.is-one').count() > 0, '信号の1が配線へ反映される');

  const lastRow = panel.locator('tr[data-row]').last();
  await lastRow.press('Enter');
  await expect(lastRow).toHaveAttribute('aria-current', 'true');
  await expect(lastRow).toBeFocused();
  assert.ok((await panel.locator('.logic-bit-button').allTextContents()).every(value => value === '1'));
  await page.keyboard.press('ArrowLeft');
  await expect(panel).toBeVisible();
  assert.equal(new URL(page.url()).hash, `#extension-${id}`, '表の矢印キーがスライド移動を起こさない');

  const help = panel.locator('[data-lesson-supplement-open]');
  const dialog = page.locator(`#extension-${id}-help`);
  await help.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-lesson-supplement-close]')).toBeFocused();
  await page.keyboard.press('Tab');
  // ネイティブdialogではブラウザの操作部へTabが移るとactiveElementがbodyになる。
  assert.equal(await dialog.evaluate(el => document.activeElement === document.body || el.contains(document.activeElement)), true, 'ダイアログ外のページ部品へフォーカスを移さない');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(help).toBeFocused();
  await help.click();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(help).toBeFocused();

  const tab = tabs.nth(index);
  await tab.focus();
  await page.keyboard.press(index === 4 ? 'Home' : 'End');
  const otherId = index === 4 ? ids[0] : ids[4];
  await expect(page.locator(`#extension-${otherId}`)).toBeVisible();
  await tab.click();
  await expect(lastRow).toHaveAttribute('aria-current', 'true');
  await page.evaluate(() => { location.hash = '#headline_2'; });
  await expect(page.locator('#logic-circuit-selector .logic-circuit-selector__button')).toHaveCount(4);
  await page.evaluate(circuitId => { location.hash = `#extension-${circuitId}`; }, id);
  await expect(panel).toBeVisible();
  await expect(lastRow).toHaveAttribute('aria-current', 'true');
  await fits(page);
}

for (const name of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  assert.ok(engines[name], `supported browser: ${name}`);
  const browser = await engines[name].launch(name === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(baseURL)) errors.push(`${response.status()} ${response.url()}`);
  });
  try {
    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [index, id] of ids.entries()) await circuitChecks(page, id, index, width);
      console.log(`${name}: ${width}px 5回路・入力・表・タブ・ダイアログOK`);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await ready(page, 'two-bit-adder');
      for (const theme of ['light', 'dark', 'system']) {
        for (const size of ['standard', 'large', 'xlarge']) {
          await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
          await page.evaluate(({ theme, size }) => {
            siteTheme.setPreference(theme, { persist: false });
            siteTextSize.setPreference(size, { persist: false });
          }, { theme, size });
          await fits(page);
          const input = page.locator('#extension-two-bit-adder .logic-bit-button').first();
          const before = await input.textContent();
          await input.tap();
          assert.notEqual(await input.textContent(), before, 'タッチで入力切替');
          const bounds = await input.boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44, 'タップ範囲44px');
          const helper = page.locator('#extension-two-bit-adder [data-lesson-supplement-open]');
          await helper.tap();
          const dialog = page.locator('#extension-two-bit-adder-help');
          await expect(dialog).toBeVisible();
          const rect = await dialog.boundingBox();
          assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1, '説明は画面幅内');
          await page.keyboard.press('Escape');
        }
      }
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
    const staticPage = await noJS.newPage();
    await staticPage.goto(new URL('cp22.html', baseURL).href);
    await expect(staticPage.locator('.logic-extension-summary')).toHaveCount(5);
    assert.ok((await staticPage.locator('.logic-extension-summary').allTextContents()).every(text => text.length > 30), 'JS無効時も各回路の説明を読める');
    await noJS.close();
    assert.deepEqual(errors, []);
    console.log(`${name}: 全テーマ・3文字サイズ・タッチ・JS無効時・404なし OK`);
  } finally {
    await context.close();
    await browser.close();
  }
}
