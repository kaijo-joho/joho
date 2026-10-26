// Code/result adjacency and compact viewing-menu regression. Local server + Playwright required.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8894/';
const output = process.env.JOHO_TEST_OUTPUT_DIR || '/private/tmp/joho-code-menu-20261026';
await mkdir(output, { recursive: true });

for (const engine of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = engine === 'chrome' ? await chromium.launch({ channel: 'chrome' }) : await webkit.launch();
  try {
    for (const fallback of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
      if (fallback) await context.addInitScript(() => {
        Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: undefined });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(new URL('py12.html', base).href);
      await page.waitForFunction(() => window.siteCodeExamples && document.querySelector('pre[data-code-example-enhanced]'));
      await page.evaluate(() => document.fonts.ready);
      const pre = page.locator('pre.python[data-title="変数の上書き"]');
      const tools = pre.locator('xpath=preceding-sibling::*[1]');
      const trigger = tools.locator('[data-action="menu"]');
      const menu = page.locator('#' + await trigger.getAttribute('aria-controls'));
      const source = await pre.textContent();
      const openMenu = async (method = 'click') => {
        await trigger.scrollIntoViewIfNeeded();
        if (method === 'keyboard') await trigger.press('Enter');
        else if (method === 'touch') await trigger.tap();
        else await trigger.click();
        await expect(menu).toBeVisible();
      };
      const assertJoined = async () => {
        assert.ok(await pre.evaluate(node => {
          const result = node.nextElementSibling;
          if (!result?.matches('pre.result')) return false;
          const codeStyle = getComputedStyle(node), resultStyle = getComputedStyle(result);
          return Math.abs(node.getBoundingClientRect().bottom - result.getBoundingClientRect().top) < 1 &&
            codeStyle.borderBottomLeftRadius === '0px' && resultStyle.borderTopLeftRadius === '0px' &&
            node.previousElementSibling?.classList.contains('code-example-tools');
        }), 'code remains directly joined to its result');
      };
      const assertFits = async () => {
        assert.ok(await trigger.evaluate(node => {
          const button = node.getBoundingClientRect();
          const code = node.closest('.code-example-tools').nextElementSibling.getBoundingClientRect();
          const icon = node.querySelector('svg').getBoundingClientRect();
          return button.width >= 44 && button.height >= 44 && icon.width <= 28 &&
            button.left >= code.left && button.right <= code.right && button.top >= code.top && button.bottom <= code.bottom;
        }), 'small icon with a 44px hit area stays inside the code frame');
        assert.ok(await menu.evaluate(node => {
          const rect = node.getBoundingClientRect();
          return rect.left >= 7 && rect.right <= innerWidth - 7 && rect.top >= 7 && rect.bottom <= innerHeight - 7 &&
            node.scrollWidth <= node.clientWidth;
        }), 'menu fits the viewport without clipping');
      };
      const snapshotPair = async name => {
        const clip = await pre.evaluate(node => {
          const code = node.getBoundingClientRect(), result = node.nextElementSibling.getBoundingClientRect();
          const left = Math.max(0, code.left - 8), top = Math.max(0, code.top + scrollY - 8);
          return { x: left, y: top, width: Math.min(innerWidth - left, code.width + 16), height: result.bottom + scrollY - top + 8 };
        });
        await page.screenshot({ path: path.join(output, `${engine}-${name}.png`), fullPage: true, clip });
      };

      await trigger.scrollIntoViewIfNeeded();
      await assertJoined();
      await expect(menu).not.toBeVisible();
      await trigger.hover();
      await expect(menu).not.toBeVisible();
      assert.equal(await tools.evaluate(node => node.getBoundingClientRect().height), 0, 'no operation row between code and result');
      if (!fallback) await snapshotPair('desktop-code-closed');
      await openMenu();
      await assertFits();
      await expect(menu.locator('[data-action="decrease"]')).toBeFocused();
      await menu.locator('[data-action="increase"]').click();
      await expect(menu.locator('[data-action="reset"]')).toHaveText('105%');
      await menu.locator('[data-action="wrap"]').click();
      await expect(menu.locator('[data-action="wrap"]')).toHaveText('折り返し ON');
      await expect(pre).toHaveAttribute('data-code-example-wrap', 'true');
      await expect(pre).toHaveText(source);
      await menu.locator('[data-action="reset"]').focus();
      // WebKitの標準設定はTabでボタンを飛ばすため、全操作対象を巡回するOption+Tabを使う。
      await page.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab');
      await expect(menu.locator('[data-action="increase"]')).toBeFocused();
      await page.keyboard.press(engine === 'webkit' ? 'Shift+Alt+Tab' : 'Shift+Tab');
      await expect(menu.locator('[data-action="reset"]')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.press('Space');
      await expect(menu).toBeVisible();
      await trigger.click();
      await expect(menu).not.toBeVisible();
      await openMenu('touch');
      await page.locator('h3').filter({ hasText: '変数の上書き' }).first().click();
      await expect(menu).not.toBeVisible();
      await openMenu('keyboard');
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: 'menu-test-other-overlay' } })));
      await expect(menu).not.toBeVisible();

      for (const width of [1440, 720, 390, 280]) {
        await page.setViewportSize({ width, height: 844 });
        for (const theme of ['system', 'light', 'dark']) {
          for (const textScale of [100, 120, 150]) {
            await page.evaluate(state => siteDisplaySettings.setPreferences(state, { persist: false }), { theme, textScale, codeWrap: true });
            await openMenu('keyboard');
            await assertFits();
            await assertJoined();
            if (!fallback && width === 390 && textScale === 100 && theme !== 'system') {
              await page.screenshot({ path: path.join(output, `${engine}-390-menu-${theme}.png`) });
            }
            await page.keyboard.press('Escape');
          }
        }
      }
      await page.evaluate(() => siteDisplaySettings.reset({ persist: false }));
      await trigger.scrollIntoViewIfNeeded();
      if (!fallback) await snapshotPair('390-code-closed');

      // The fixed-position fallback must retain live labels and work inside the enlarged dialog.
      await openMenu();
      if (fallback) assert.equal(await menu.evaluate(node => node.parentNode === document.body), true);
      await menu.locator('[data-action="enlarge"]').click();
      const dialog = page.locator('#site-code-example-dialog');
      await expect(dialog).toBeVisible();
      await openMenu('keyboard');
      await assertFits();
      if (fallback) assert.equal(await menu.evaluate(node => node.parentNode.id), 'site-code-example-dialog');
      await menu.locator('[data-action="increase"]').click();
      await expect(menu.locator('[data-action="reset"]')).toHaveText('105%');
      await menu.locator('[data-action="enlarge"]').click();
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await assertJoined();
      await expect(pre).toHaveText(source);

      await page.evaluate(() => {
        const host = document.createElement('div'); host.id = 'code-result-fixtures';
        for (const [kind, resultTag] of [['', 'pre'], ['example', 'div'], ['error', 'pre']]) {
          const code = document.createElement('pre'); code.className = `python ${kind}`; code.textContent = 'print(1)';
          const result = document.createElement(resultTag); result.className = 'result'; result.textContent = '1';
          host.append(code, result);
        }
        document.querySelector('section article').append(host); highlightEmbeddedCodeBlocks(host);
      });
      assert.ok(await page.locator('#code-result-fixtures pre.python').evaluateAll(nodes => nodes.every(node => {
        const result = node.nextElementSibling;
        return result.matches('.result') && Math.abs(node.getBoundingClientRect().bottom - result.getBoundingClientRect().top) < 1 &&
          getComputedStyle(node).borderBottomLeftRadius === '0px' && getComputedStyle(result).borderTopLeftRadius === '0px';
      })), 'normal/example/error code and pre/div results retain their joined geometry');

      // Existing FAQ/other dialogs must remain open; nested enlargement is not offered.
      await page.evaluate(() => {
        const dialog = document.createElement('dialog'); dialog.id = 'existing-dialog-code-test';
        dialog.style.cssText = 'width:min(500px,90vw);padding:16px';
        const pre = document.createElement('pre'); pre.className = 'python example';
        pre.textContent = 'print("existing dialog")'; dialog.append(pre); document.body.append(dialog);
        highlightEmbeddedCodeBlocks(dialog); dialog.showModal();
      });
      const existing = page.locator('#existing-dialog-code-test');
      const existingTrigger = existing.locator('[data-action="menu"]');
      await existingTrigger.click();
      const existingMenu = page.locator('#' + await existingTrigger.getAttribute('aria-controls'));
      await expect(existingMenu).toBeVisible();
      await expect(existingMenu.locator('[data-action="enlarge"]')).toBeDisabled();
      await existingMenu.locator('[data-action="increase"]').click();
      await expect(existingMenu.locator('[data-action="reset"]')).toHaveText('105%');
      await page.keyboard.press('Escape');
      await expect(existing).toBeVisible();
      await expect(existingTrigger).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(existing).not.toBeVisible();
      assert.deepEqual(errors, [], 'no browser runtime errors');
      console.log(`${engine} / ${fallback ? 'fixed fallback' : 'native popover'}: adjacency, compact controls, keyboard/touch, 280–1440px, themes, enlargement and existing dialog OK`);
      await context.close();
    }
  } finally { await browser.close(); }
}
