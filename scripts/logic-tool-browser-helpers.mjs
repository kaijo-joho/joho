import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function setToolPreferences(page, theme, size) {
  await page.evaluate(({ theme, size }) => {
    const themeSelect = document.getElementById('theme');
    const sizeSelect = document.getElementById('text-size');
    themeSelect.value = theme === 'system' ? 'auto' : theme;
    sizeSelect.value = size === 'xlarge' ? 'largest' : size;
    themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }, { theme, size });
}

export async function toolLayoutChecks(page, name, artifacts) {
  for (const width of [1800, 720, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark', 'auto']) for (const size of ['standard', 'large', 'largest']) {
      await setToolPreferences(page, theme, size);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { width: document.documentElement.scrollWidth, top: box('.top'), stage: box('#stage'),
          palette: box('.palette'), hint: box('#operation-hint'), status: box('.statusbar'),
          bg: getComputedStyle(document.querySelector('.logic-editor__background')).fill,
          topRows: [...document.querySelectorAll('.top button')].filter(b => !b.hidden).map(b => b.getBoundingClientRect().top) };
      });
      assert.ok(layout.width <= width + 1 && layout.stage.height > 150, `${name} ${width} ${theme} ${size}: usable canvas`);
      assert.ok(Math.max(...layout.topRows) - Math.min(...layout.topRows) <= 1, 'one toolbar row');
      assert.ok(layout.palette.right <= layout.stage.left + 1 && layout.hint.top >= layout.stage.bottom - 1, 'palette left, hints below');
      assert.ok(layout.status.bottom <= 901 && layout.status.bottom >= 898, 'status at bottom');
      if (theme === 'dark') assert.equal(layout.bg, 'rgb(15, 23, 30)', 'editing canvas is dark');
      if (theme === 'light') assert.equal(layout.bg, 'rgb(237, 243, 248)', 'explicit light overrides dark OS');
    }
    if (artifacts) await page.screenshot({ path: join(artifacts, `${name}-tool-${width}.png`) });
  }
  await setToolPreferences(page, 'light', 'standard');
  await page.setViewportSize({ width: 1440, height: 900 });
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await page.locator('#fullscreen-button').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.getByRole('button', { name: '回路エディタの操作方法', exact: true }).click();
    await page.locator('#lc02-operation-dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#lc02-operation-dialog').waitFor({ state: 'hidden' });
    if (await page.evaluate(() => !!document.fullscreenElement)) await page.getByRole('button', { name: '全画面表示を終了', exact: true }).click();
    await page.waitForFunction(() => !document.fullscreenElement);
  }
}
