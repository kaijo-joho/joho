// Requires Playwright and a local server (JOHO_TEST_URL).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8886/';
const outputDirectory = process.env.JOHO_TEST_OUTPUT_DIR || path.join(tmpdir(), 'joho-site-index');
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
    const ready = async () => {
      await page.locator('.lesson-dock__btn--search').waitFor();
      await page.locator('#html_index .course-index__card').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
    };
    await page.goto(new URL('index.html', baseURL).href);
    await ready();
    const cards = page.locator('[data-site-index] .course-index__card');
    const icons = cards.locator('svg');
    const expectedLinks = await page.evaluate(() => Array.from(
      document.querySelectorAll('[data-site-index-group]')
    ).flatMap(group => group.dataset.pageIds.split(',').flatMap(id => {
      const entry = window.pages[id];
      return entry?.release === true && entry.fileName ? [entry.fileName] : [];
    })));
    assert.deepEqual(await cards.evaluateAll(elements => elements.map(element => element.getAttribute('href'))), expectedLinks);
    await expect(page.locator('#page_header')).toHaveCount(0);
    await expect(page.locator('#site-header')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('情報科 教材サイト');
    await expect(page.locator('[data-site-index] h2')).toHaveText(['実習', '座学']);
    await expect(page.locator('#headline_3')).toHaveText('本サイトについて');
    await expect(icons).toHaveCount(expectedLinks.length);
    assert.ok(await icons.evaluateAll(elements => elements.every(svg =>
      svg.getAttribute('aria-hidden') === 'true' && svg.getAttribute('focusable') === 'false'
    )), 'decorative icons do not duplicate the link names');
    await expect.poll(() => icons.locator('use').evaluateAll(elements =>
      elements.every(element => element.getBBox().width > 1)
    )).toBe(true);

    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark', 'system']) {
        for (const size of ['standard', 'large', 'xlarge']) {
          await page.evaluate(({ theme, size }) => {
            window.siteTheme.setPreference(theme);
            window.siteTextSize.setPreference(size);
            window.scrollTo({ top: 0, behavior: 'instant' });
          }, { theme, size });
          const result = await cards.evaluateAll(elements => ({
            viewport: innerWidth,
            pageWidth: document.documentElement.scrollWidth,
            cards: elements.map(element => {
              const box = element.getBoundingClientRect();
              return { left: box.left, right: box.right, height: box.height,
                overflow: element.scrollWidth > element.clientWidth,
                contentFits: [...element.querySelectorAll('svg, h3, p')].every(child => {
                  const rect = child.getBoundingClientRect();
                  return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom;
                }) };
            })
          }));
          assert.equal(result.viewport, width);
          assert.ok(result.pageWidth <= width, 'no page overflow');
          result.cards.forEach(card => {
            assert.ok(card.left >= 0 && card.right <= width && card.height >= 44);
            assert.equal(card.overflow, false, 'card content does not overflow');
            assert.ok(card.contentFits, 'icon and text stay inside the card');
          });
        }
      }
      await page.evaluate(() => {
        window.siteTheme.setPreference('light'); window.siteTextSize.setPreference('standard');
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.screenshot({ path: path.join(outputDirectory, `${name}-${width}-light.png`) });
    }

    // Verify unpublished courses without changing the repository's publication settings.
    await page.evaluate(() => {
      const fakePages = { ...window.pages, py00: { ...window.pages.py00, release: false } };
      window.renderSiteIndex(fakePages);
    });
    await expect(cards.filter({ has: page.locator('use[href$="#python"]') })).toHaveCount(0);
    await page.evaluate(() => window.renderSiteIndex(window.pages));
    assert.deepEqual(await cards.evaluateAll(elements => elements.map(element => element.getAttribute('href'))), expectedLinks);

    // Every sprite, including currently unpublished courses and the fallback, can render.
    await page.evaluate(() => {
      const svgNamespace = 'http://www.w3.org/2000/svg';
      const fixture = document.createElement('div'); fixture.id = 'icon-test-fixture';
      for (const id of ['python', 'spreadsheet', 'illustrator', 'html', 'digital', 'network', 'computer', 'book']) {
        const svg = document.createElementNS(svgNamespace, 'svg');
        svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('width', '48'); svg.setAttribute('height', '48');
        svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
        const use = document.createElementNS(svgNamespace, 'use');
        use.setAttribute('href', `./img/course-icons.svg#${id}`); svg.append(use); fixture.append(svg);
      }
      document.body.append(fixture);
    });
    await expect.poll(() => page.locator('#icon-test-fixture use').evaluateAll(elements =>
      elements.length === 8 && elements.every(element => element.getBBox().width > 1)
    )).toBe(true);
    await page.locator('#icon-test-fixture').evaluate(element => element.remove());

    await cards.first().focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await expect(cards.first()).toBeFocused();
    assert.ok(await cards.first().evaluate(element => element.matches(':focus-visible')));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new URL(expectedLinks[0], baseURL).href);
    await ready();
    await expect(page.locator('#page_header h1')).toBeVisible();
    await expect(page.locator('#html_index .course-index__icon')).toHaveCount(0);
    await page.goBack(); await ready();
    await cards.first().tap();
    await expect(page).toHaveURL(new URL(expectedLinks[0], baseURL).href);
    await page.goBack(); await ready();
    const search = page.locator('.lesson-dock__btn--search');
    await search.click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(search).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await cards.first().evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { window.siteTheme.setPreference('dark'); window.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.screenshot({ path: path.join(outputDirectory, `${name}-1440-dark.png`) });
    assert.deepEqual(errors, [], 'no runtime errors or missing assets');
    console.log(`${name}: cards, all SVG symbols, publication filter, responsive themes/text sizes, keyboard/touch and header regression OK`);
  } finally {
    await browser.close();
  }
}
console.log(`Screenshots: ${outputDirectory}`);
