// Run after official release=false registration. No external resources or input transmission.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.argv[2] || 'http://127.0.0.1:8870/');
const root = new URL('../', import.meta.url);
const ids = ['is51','is52','is53','is61','is62','is63','is64','id11','id12','id13','id14','id15'];
const expectedSlides = Object.fromEntries(ids.map(id => [id, id.startsWith('is') || id === 'id12' ? 7 : 6]));
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('js/pages.js', root), 'utf8'), context);
for (const id of ids) {
  const item = context.window.pages[id];
  assert(item, `${id}: official entry required`);
  assert.equal(item.release, false, `${id}: release remains false`);
  assert.equal(item.show, false, `${id}: show remains false`);
  assert.equal(item.back, 'index', `${id}: required back reference is the site home`);
  assert.equal(item.next, false, `${id}: no next lesson link`);
  assert.equal(item.fileName, `${id}.html`);
}
const search = JSON.parse(await readFile(new URL('data/search-index.json', root), 'utf8'));
assert(!search.documents.some(item => ids.includes(item.id)), 'drafts excluded from existing public search index');
for (const file of await readdir(root)) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(new URL(file, root), 'utf8');
  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  assert(!links.some(link => ids.some(id => new RegExp(`(?:^|/)${id}\\.html(?:[?#]|$)`).test(link))), `${file}: no hardcoded links to preview lessons`);
}
const variants = [
  { width: 1440, theme: 'light', size: 'standard', scheme: 'light' },
  { width: 390, theme: 'light', size: 'standard', scheme: 'light' },
  { width: 390, theme: 'dark', size: 'xlarge', scheme: 'dark' },
  { width: 390, theme: 'system', size: 'large', scheme: 'dark' },
];
for (const engine of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    for (const id of ids) {
      await page.goto(new URL(`${id}.html`, base).href);
      await page.locator('nav[aria-label="スライド間の移動"]').waitFor();
      assert(await page.locator('#page_header h1').textContent(), `${id}: generated title cover`);
      const slideIds = await page.locator('section[data-lesson-slide]').evaluateAll(nodes => nodes.filter(node => node.id !== 'page_header').map(node => node.id));
      assert.equal(slideIds.length, expectedSlides[id], `${id}: complete lesson, review, exercise`);
      for (const variant of variants) {
        await page.setViewportSize({ width: variant.width, height: 950 });
        await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: 'reduce' });
        await page.evaluate(({ theme, size }) => { window.siteTheme.setPreference(theme, { persist: false }); window.siteTextSize.setPreference(size, { persist: false }); }, variant);
        for (const slideId of slideIds) {
          await page.evaluate(value => { location.hash = value; }, slideId);
          const slide = page.locator(`#${slideId}`);
          await slide.waitFor({ state: 'visible' });
          await page.waitForFunction(() => {
            const header = document.querySelector('#site-header').getBoundingClientRect();
            const nav = document.querySelector('nav[aria-label="スライド間の移動"]').getBoundingClientRect();
            const current = document.querySelector('section[data-lesson-slide].is-current').getBoundingClientRect();
            return nav.top >= header.bottom - 2 && current.top >= nav.bottom - 2;
          });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${id}/${slideId}/${variant.width}/${variant.theme}/${variant.size}: page overflow`);
          const progress = slide.locator('[data-lesson-progress]');
          for (let i = 0; i < await progress.count(); i++) {
            const model = progress.nth(i);
            const next = model.locator('[data-progress-next]').first();
            if (!await next.isVisible()) continue;
            await model.locator('[data-progress-reset]').first().click();
            await next.focus(); await page.keyboard.press('Enter');
            assert.equal(await model.getAttribute('data-progress-step'), '1');
            await next.focus(); await page.keyboard.press('Space');
            const state = await model.evaluate(element => window.JohoLessonProgress.get(element));
            assert.equal(state.step, Math.min(2, state.total - 1));
            assert.equal(await slide.isVisible(), true, `${id}: internal Next preserves current slide`);
          }
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${id}/${slideId}: completed diagram overflow`);
        }
      }
      const last = page.locator(`#${slideIds.at(-1)}`);
      assert(await last.isVisible());
      const lastNext = page.locator('.lesson-slide-deck__button--next');
      assert(await lastNext.isDisabled(), `${id}: last slide has no next lesson URL`);
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      assert.equal(await page.locator('section[data-lesson-slide]:visible').count(), slideIds.length + 1, `${id}: all slides print`);
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await page.emulateMedia({ media: 'screen' });
      assert.equal(await page.locator('section[data-lesson-slide]:visible').count(), 1, `${id}: current slide restored`);
      console.log(`${engine}: ${id}, ${slideIds.length} body slides, responsive/theme/font/Next/print passed`);
    }
    await page.goto(new URL('index.html', base).href);
    await page.waitForFunction(() => Boolean(window.pages && document.querySelector('#site-header')));
    const listed = await page.locator('a[href]').evaluateAll((nodes, ids) => nodes.filter(node => ids.some(id => new RegExp(`(?:^|/)${id}\\.html(?:[?#]|$)`).test(node.getAttribute('href')))).map(node => node.getAttribute('href')), ids);
    assert.deepEqual(listed, [], 'public material list excludes drafts');
    assert.deepEqual(errors, [], 'no page JavaScript errors');
    const noJS = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 950 } });
    await noJS.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    for (const id of ids) {
      await noJS.goto(new URL(`${id}.html`, base).href);
      assert.equal(await noJS.locator('section[data-lesson-slide]:not(:visible)').count(), 0, `${id}: no-JS lesson order is readable`);
      assert(await noJS.locator('section[data-lesson-slide]').last().textContent(), `${id}: no-JS exercise retains content`);
    }
    await noJS.close(); await page.close();
    console.log(`${engine}: official draft controls, public list, no-JS passed`);
  } finally { await browser.close(); }
}
