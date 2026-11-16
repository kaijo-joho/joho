// Local browser checks. GAS navigation is fulfilled locally; no login or submission is performed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8898/';
const output = process.env.JOHO_TEST_OUTPUT_DIR || '/private/tmp/joho-tasks-redirect-20261116';
const published = JSON.parse(fs.readFileSync(new URL('../data/links.json', import.meta.url), 'utf8'));
const target = published.collections.urls.taskstatus.url;
const catalogURL = new URL('data/links.json', base).href;
await mkdir(output, { recursive: true });

for (const engine of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = engine === 'chrome' ? await chromium.launch({ channel: 'chrome' }) : await webkit.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
    const gasRequests = [];
    await context.route('https://script.google.com/**', async route => {
      gasRequests.push({ url: route.request().url(), headers: await route.request().allHeaders() });
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ja"><title>Test destination</title><body>Local navigation stub</body></html>' });
    });
    const page = await context.newPage();
    const errors = [], missing = [], catalogRequests = [], navigations = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() === 404) missing.push(response.url()); });
    page.on('request', request => {
      if (request.url() === catalogURL) catalogRequests.push(request.url());
      if (request.isNavigationRequest()) navigations.push(request.url());
    });

    for (const path of ['tasks', 'tasks/', 'tasks.html', 'tasks/index.html']) {
      const before = gasRequests.length;
      await page.goto(new URL(path + '?teacher=true&next=https%3A%2F%2Fevil.test%2F#private', base).href);
      await page.waitForURL(url => url.href === target);
      assert.equal(gasRequests.length, before + 1, path + ' makes one direct GAS navigation');
      assert.equal(gasRequests.at(-1).headers.referer, undefined, 'entry query is not leaked through the referrer');
    }
    assert.equal(catalogRequests.length, 4, 'every entry resolves the same root catalog once');
    assert.ok(!navigations.some(url => /\/link\.html/.test(url)), 'there is no extra relay through link.html');

    await page.goto(new URL('tasks?redirect=0', base).href);
    await expect(page.locator('#tasks-link')).toBeVisible();
    await expect(page.locator('#tasks-link')).toHaveAttribute('href', target);
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['system', 'light', 'dark']) {
        for (const textScale of [100, 110, 120]) {
          await page.evaluate(state => siteDisplaySettings.setPreferences(state, { persist: false }), { theme, textScale });
          assert.ok(await page.locator('main').evaluate(node => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 15 && rect.right <= innerWidth - 15 && rect.top >= 0 && rect.bottom <= innerHeight &&
              document.documentElement.scrollWidth <= innerWidth;
          }), 'entry fits ' + width + '/' + theme + '/' + textScale);
          if (width === 390 && textScale === 120 && theme !== 'system') {
            await page.screenshot({ path: `${output}/${engine}-390-${theme}.png` });
          }
        }
      }
    }
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), storage, 'entry does not write preferences or student data');
    await page.locator('#tasks-link').focus();
    assert.ok(await page.locator('#tasks-link').evaluate(node => parseFloat(getComputedStyle(node).outlineWidth) >= 3));
    await page.locator('#tasks-link').press('Enter');
    await page.waitForURL(url => url.href === target);

    let fail = true;
    await page.route(catalogURL, route => fail
      ? route.fulfill({ status: 503, body: 'temporarily unavailable' })
      : route.fulfill({ contentType: 'application/json', body: JSON.stringify(published) }));
    await page.goto(new URL('tasks', base).href);
    await expect(page.locator('#tasks-retry')).toBeVisible();
    await expect(page.locator('#tasks-link')).not.toHaveAttribute('href', /.+/);
    assert.match(new URL(page.url()).pathname, /\/tasks\/?$/);
    fail = false;
    await page.locator('#tasks-retry').press('Enter');
    await page.waitForURL(url => url.href === target);

    const malicious = structuredClone(published);
    malicious.collections.urls.taskstatus = { title: '<img src=x onerror=alert(1)>', url: 'https://evil.test/' };
    await page.unroute(catalogURL);
    await page.route(catalogURL, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(malicious) }));
    await page.goto(new URL('tasks.html', base).href);
    await expect(page.locator('#tasks-retry')).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
    await expect(page.locator('#tasks-link')).not.toHaveAttribute('href', /.+/);
    assert.ok(page.url().startsWith(base), 'unsafe destination does not navigate');
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, [], 'all local assets exist for file and directory entries');
    await context.close();

    const noScriptContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const noScript = await noScriptContext.newPage();
    await noScript.goto(new URL('tasks/', base).href);
    // Playwrightのテキスト照合はNOSCRIPTを対象外にするため、実際のinnerTextを読む。
    assert.match(await noScript.locator('noscript').innerText(), /JavaScriptを有効に/);
    await expect(noScript.locator('#tasks-status')).not.toBeVisible();
    assert.ok(noScript.url().startsWith(base));
    await noScriptContext.close();
    console.log(engine + ': /tasks, /tasks/, /tasks.html, direct navigation, no query/referrer forwarding, recovery, themes, text sizes, 390px and no-script message OK');
  } finally { await browser.close(); }
}
