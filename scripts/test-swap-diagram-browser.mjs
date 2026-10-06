// Requires Playwright and a local server: JOHO_TEST_URL=http://127.0.0.1:8885/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8885/';
const outputDirectory = process.env.JOHO_TEST_OUTPUT_DIR || path.join(tmpdir(), 'joho-py43-swap');
await mkdir(outputDirectory, { recursive: true });

for (const name of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = name === 'chrome' ? await chromium.launch({ channel: 'chrome' }) : await webkit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(baseURL) && response.status() === 404) errors.push(response.url());
    });
    await page.goto(new URL('py43.html', baseURL).href);
    await page.locator('.lesson-dock__btn--search').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const figure = page.locator('.concept-figure--swap');
    const svg = figure.locator('svg');
    await expect(figure).toHaveAttribute('tabindex', '0');
    await expect(svg.locator('title')).toHaveText('一時変数を使った2値交換の手順');
    await expect(svg.locator('desc')).not.toBeEmpty();
    await expect(svg.locator('[data-swap-variable] text:first-of-type')).toHaveText([
      '5', '7', '—', '5', '7', '5', '7', '7', '5', '7', '5', '5'
    ]);
    assert.equal(await svg.locator('.concept-diagram__transfer').count(), 3);

    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark', 'system']) {
        for (const size of ['standard', 'large', 'xlarge']) {
          await page.evaluate(({ theme, size }) => {
            window.siteTheme.setPreference(theme);
            window.siteTextSize.setPreference(size);
          }, { theme, size });
          const geometry = await svg.evaluate(element => {
            const rect = node => {
              const { x, y, width, height } = node.getBoundingClientRect();
              return { x, y, width, height };
            };
            return Array.from(element.querySelectorAll('[data-swap-phase]'), phase => ({
              card: rect(phase.querySelector(':scope > rect')),
              variables: Array.from(phase.querySelectorAll('[data-swap-variable]'), variable => rect(variable.querySelector('rect'))),
              text: Array.from(phase.querySelectorAll('text'), rect)
            }));
          });
          assert.equal(geometry.length, 4);
          const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y &&
            inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
          geometry.forEach(({ card, variables: [a, b, tmp], text }, index) => {
            assert.ok(Math.abs(card.y - geometry[0].card.y) < 1, 'four cards stay in one row');
            if (index) assert.ok(card.x > geometry[index - 1].card.x + geometry[index - 1].card.width, 'cards have a gap');
            assert.ok(Math.abs(a.y - b.y) < 1 && a.x + a.width < b.x, 'a and b sit side by side');
            assert.ok(tmp.y > a.y + a.height, 'tmp sits below a and b');
            assert.ok(Math.abs(tmp.x + tmp.width / 2 - card.x - card.width / 2) < 1, 'tmp is centered');
            for (const box of [a, b, tmp, ...text]) assert.ok(contains(card, box), 'boxes and labels fit their card');
          });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page has no horizontal overflow');
        }
      }
      await page.evaluate(() => { window.siteTheme.setPreference('light'); window.siteTextSize.setPreference('standard'); });
      await figure.evaluate(element => { element.scrollLeft = 0; element.scrollIntoView({ block: 'center' }); });
      await figure.screenshot({ path: path.join(outputDirectory, `${name}-${width}-light.png`) });
      if (width < 820) {
        assert.ok(await figure.evaluate(element => element.scrollWidth > element.clientWidth), 'narrow views scroll inside the figure');
        await figure.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(figure).toBeFocused();
        // WebKit needs time between keydown and keyup for native scroll handling.
        await page.keyboard.press('ArrowRight', { delay: 100 });
        await expect.poll(() => figure.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        assert.ok(await figure.evaluate(element => element.matches(':focus-visible')), 'keyboard focus is visible');
        await figure.evaluate(element => { element.scrollLeft = 0; });
        await figure.hover();
        await page.mouse.wheel(150, 0);
        await expect.poll(() => figure.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        await figure.evaluate(element => { element.scrollLeft = element.scrollWidth; });
        const lastCard = await svg.locator('[data-swap-phase]').last().boundingBox();
        const frame = await figure.boundingBox();
        assert.ok(lastCard.x + lastCard.width <= frame.x + frame.width + 1, 'last card is reachable');
        assert.equal(await page.evaluate(() => scrollX), 0);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.siteTheme.setPreference('dark'));
    await figure.evaluate(element => { element.scrollLeft = 0; });
    await figure.screenshot({ path: path.join(outputDirectory, `${name}-1440-dark.png`) });
    assert.deepEqual(errors, [], 'no runtime errors or missing site assets');
    console.log(`${name}: 4-card row, variable layout, values, 3 widths/themes/text sizes, keyboard scroll and no page overflow OK`);
  } finally {
    await browser.close();
  }
}
console.log(`Screenshots: ${outputDirectory}`);
