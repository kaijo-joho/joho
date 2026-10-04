import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = await readFile(new URL('../js/lesson-progress.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/lesson-progress.css', import.meta.url), 'utf8');
const fixture = `<main><div id="model" data-lesson-progress>
  <p id="prediction" data-lesson-stage="0">まず予想する</p>
  <figure id="operation" data-lesson-stage-from="1"><svg><g id="diagram" data-lesson-stage-from="2"><text>理由を説明する</text></g></svg></figure>
  <p id="explanation" data-lesson-stage-from="2">操作結果を自分で説明する</p>
  <div data-progress-controls><button data-progress-prev>前の段階</button><button data-progress-next>Next</button><button data-progress-reset>はじめから</button><span data-progress-status></span></div>
  <div id="nested" data-lesson-progress data-progress-count="5"><p data-lesson-stage="4">別の図</p><button data-progress-next>別のNext</button></div>
</div></main>`;
for (const name of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = await (name === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
  try {
    const page = await browser.newPage();
    await page.setContent(fixture);
    await page.addStyleTag({ content: css });
    // Fallback retains all explanatory content before script initialization.
    assert.equal(await page.locator('#explanation').isVisible(), true);
    await page.addScriptTag({ content: source });
    const state = () => page.evaluate(() => window.JohoLessonProgress.get('#model'));
    assert.deepEqual(await state(), { step: 0, total: 3, id: 'model' });
    assert.equal(await page.locator('#prediction').isVisible(), true);
    assert.equal(await page.locator('#operation').isVisible(), false);
    const next = page.locator('#model > [data-progress-controls] [data-progress-next]');
    await next.focus(); await page.keyboard.press('Enter');
    assert.equal((await state()).step, 1);
    assert.equal(await page.locator('#operation').isVisible(), true);
    assert.equal(await page.locator('#diagram').isVisible(), false);
    await page.keyboard.press('Space');
    assert.equal((await state()).step, 2);
    assert.equal(await next.isDisabled(), true);
    assert.equal(await page.locator('#diagram').isVisible(), true);
    await page.locator('#nested [data-progress-next]').click();
    assert.equal((await state()).step, 2);
    await page.locator('#model > [data-progress-controls] [data-progress-reset]').click();
    assert.equal((await state()).step, 0);
    await page.evaluate(() => { window.received = null; document.querySelector('#model').addEventListener('joho:lesson-progress', e => { window.received = e.detail; }); window.JohoLessonProgress.set('#model', 99); });
    assert.deepEqual(await page.evaluate(() => window.received), { step: 2, total: 3, id: 'model' });
    await page.evaluate(() => window.JohoLessonProgress.set('#model', 1));
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    assert.equal(await page.locator('#prediction').isVisible(), true);
    assert.equal(await page.locator('#explanation').isVisible(), true);
    assert.equal(await page.locator('#diagram').isVisible(), true);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'screen' });
    assert.equal((await state()).step, 1);
    assert.equal(await page.locator('#explanation').isVisible(), false);
    await page.close();
    console.log(`${name}: progression, nesting, bounds, Enter/Space, reset, print/restore passed`);
  } finally { await browser.close(); }
}
