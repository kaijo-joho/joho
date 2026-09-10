// Browser regression checks. Requires Playwright and a local server (JOHO_TEST_URL).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8884/';
const searchIndex = JSON.parse(await readFile(new URL('../data/search-index.json', import.meta.url), 'utf8'));
const courseOrder = ['dr', 'lc', 'nw', 'html', 'il', 'ss', 'py'];
const indexedCourses = new Set(searchIndex.documents.map(document => document.course));
const expectedCourseFilters = ['', ...courseOrder.filter(course => indexedCourses.has(course))];

async function ready(page, path) {
  await page.goto(new URL(path, baseURL).href);
  await page.locator('.lesson-dock__btn--search').waitFor();
  if (/^(dr|lc|nw)\d+\.html/.test(path) && !/^[a-z]+00\.html/.test(path)) {
    await page.locator('body.lesson-slide-ready').waitFor();
  }
}

async function fits(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  assert.ok(rect, `${selector} is visible`);
  const width = await page.evaluate(() => innerWidth);
  assert.ok(rect.x >= 7 && rect.x + rect.width <= width - 7, `${selector} fits ${width}px`);
  assert.ok(rect.y >= 0 && rect.y + rect.height <= await page.evaluate(() => innerHeight) + 1);
}

async function headerIsSingleRow(page) {
  return page.evaluate(() => {
    const brand = document.querySelector('.headerbar__brand')?.getBoundingClientRect();
    const actions = document.querySelector('.headerbar__actions')?.getBoundingClientRect();
    if (!brand || !actions) return false;
    return brand.top < actions.bottom && actions.top < brand.bottom;
  });
}

async function scrollPage(page, top) {
  await page.evaluate(value => window.scrollTo({top:value,behavior:'instant'}), top);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function headerPosition(page, shown) {
  await expect.poll(() => page.locator('#site-header').evaluate(header => {
    const rect = header.getBoundingClientRect();
    return {top:rect.top,bottom:rect.bottom};
  }).then(rect => shown ? Math.abs(rect.top) < 1 : rect.bottom <= 0), {
    message: shown ? 'header is at the viewport top' : 'header is entirely above the viewport'
  }).toBe(true);
}

async function scrollHeader(page) {
  await ready(page, 'py22.html');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(10, 400);
  await scrollPage(page, 0);
  const contentTop = () => page.locator('#page_header').evaluate(element => element.getBoundingClientRect().top + scrollY);
  const initialContentTop = await contentTop();
  await scrollPage(page, 180);
  await headerPosition(page, true);
  await scrollPage(page, 1500);
  await headerPosition(page, false);
  await scrollPage(page, 1490);
  await headerPosition(page, false);
  await scrollPage(page, 1476);
  await headerPosition(page, true);
  await page.waitForTimeout(300);
  await headerPosition(page, true);
  await scrollPage(page, 1516);
  await headerPosition(page, true);
  await scrollPage(page, 1572);
  await headerPosition(page, false);
  assert.ok(Math.abs(await contentTop() - initialContentTop) < 1, 'hiding and revealing do not move the document content');

  await scrollPage(page, 1548);
  await headerPosition(page, true);
  const materials = page.locator('.lesson-dock__btn--menu');
  await materials.press('Enter');
  await expect(page.locator('#lesson-dock-panel-menu')).toBeVisible();
  await scrollPage(page, 1800);
  await headerPosition(page, true);
  await page.keyboard.press('Escape');
  await expect(materials).toBeFocused();
  await scrollPage(page, 2000);
  await headerPosition(page, true);

  await page.locator('#headerbar__course').press('Enter');
  const nav = page.locator('#auto-nav');
  await nav.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
  const beforeInnerScroll = await page.evaluate(() => scrollY);
  await nav.evaluate(element => { element.scrollTop = 200; });
  await expect.poll(() => nav.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  assert.equal(await page.evaluate(() => scrollY), beforeInnerScroll, 'menu scroll stays inside the menu');
  await headerPosition(page, true);
  await page.keyboard.press('Escape');

  const search = page.locator('.lesson-dock__btn--search');
  await search.press('Enter');
  await expect(page.locator('#site-search-dialog')).toBeVisible();
  await page.locator('#site-search-view-faq').evaluate(element => { element.scrollTop = 200; });
  await page.mouse.move(10, 400);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(150);
  await headerPosition(page, true);
  assert.equal(await page.evaluate(() => scrollY), beforeInnerScroll, 'FAQ scrolling does not move the page');
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
  await headerPosition(page, true);

  // A mouse-picked preference must not pin the header after its menu closes.
  await page.locator('.site-theme-menu__trigger').click();
  await page.getByRole('menuitemradio', {name:'ライトモード',exact:true}).click();
  await page.mouse.move(10, 400);
  await scrollPage(page, 2100);
  await headerPosition(page, false);
  await page.keyboard.press('Enter');
  await headerPosition(page, true);
  await expect(page.locator('.site-theme-menu__options')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement.blur());
  await scrollPage(page, 2200);
  await headerPosition(page, false);
  await scrollPage(page, 2176);
  await headerPosition(page, true);

  // A backward Tab from the first content link must reveal the hidden header.
  await page.locator('#page_header a[href]').first().evaluate(link => link.focus({preventScroll:true}));
  await scrollPage(page, 2300);
  await headerPosition(page, false);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#site-header').contains(document.activeElement)), true);
  await headerPosition(page, true);
  await page.evaluate(() => document.activeElement.blur());
  await scrollPage(page, 2600);
  await headerPosition(page, false);
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await scrollPage(page, bottom);
  await scrollPage(page, bottom - 24);
  await headerPosition(page, true);
  await scrollPage(page, 0);
  await headerPosition(page, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

async function footerFits(page) {
  await expect(page.locator('#site-footer')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const footer = document.querySelector('#site-footer').getBoundingClientRect();
    const deck = document.querySelector('.lesson-slide-deck').getBoundingClientRect();
    return footer.top >= deck.bottom && footer.left >= 7 && footer.right <= innerWidth - 7
      && footer.bottom <= innerHeight + 1 && footer.bottom >= innerHeight - 2;
  }), {message: 'footer fits below the slide without overlap or clipping'}).toBe(true);
}

async function fullScreen(page) {
  const trigger = page.locator('.lesson-slide-deck__fullscreen');
  const hash = new URL(page.url()).hash;
  await footerFits(page);
  await trigger.click();
  await expect(page.locator('.lesson-slide-deck__fullscreen-menu')).toBeVisible();
  assert.equal(await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)), false, 'icon only opens the menu');
  await page.getByRole('button', {name:'スライドを全画面表示',exact:true}).click();
  await expect(page.locator('body')).toHaveClass(/is-lesson-fullscreen/);
  await expect(page.locator('#site-header')).toBeHidden();
  await expect(page.locator('#site-footer')).toBeHidden();
  await expect(page.locator('#lesson-dock')).toBeHidden();
  await expect(page.locator('#auto-nav')).toBeHidden();
  await expect(page.locator('.lesson-slide-deck__navigation .lesson-slide-deck__fullscreen')).toBeVisible();
  assert.equal(new URL(page.url()).hash, hash);
  await fits(page, '.lesson-slide-deck__navigation');
  await expect.poll(() => page.locator('.lesson-slide-deck').evaluate(deck =>
    Math.abs(innerHeight - deck.getBoundingClientRect().bottom - 8) < 2
  ), {message: 'fullscreen gives the footer space back to the slide'}).toBe(true);
  await page.getByRole('button', {name:'全画面表示を終了',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/is-lesson-fullscreen/);
  await expect(trigger).toBeFocused();
  await expect(page.locator('#site-header')).toBeVisible();
  await expect(page.locator('.lesson-slide-deck__fullscreen-menu')).toBeHidden();
  assert.equal(new URL(page.url()).hash, hash);
  await footerFits(page);
}

const browserTypes = new Map([['chrome', chromium], ['webkit', webkit]]);
const selectedBrowsers = (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean);

for (const name of selectedBrowsers) {
  const type = browserTypes.get(name);
  assert.ok(type, `unsupported browser: ${name}`);
  const browser = await type.launch(name === 'chrome' ? {channel:'chrome',headless:true} : {headless:true});
  const errors = [];
  try {
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    const page = await context.newPage();
    let searchIndexRequests = 0;
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname.endsWith('/data/search-index.json')) searchIndexRequests += 1;
    });
    page.on('response', response => {
      if (response.url().startsWith(baseURL) && response.status() === 404) errors.push(`404 ${response.url()}`);
    });
    await page.route('**/data/search-index.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...searchIndex,
        documents: [
          ...searchIndex.documents,
          {
            id: '__unreleased-lc-test',
            url: 'lc01.html',
            title: '未公開論理回路検証語',
            course: 'lc',
            courseLabel: '論理回路',
            category: '',
            detail: '',
            sections: [{ heading: '', anchor: '', text: '未公開論理回路検証語', code: '' }]
          },
          {
            id: '__unreleased-nw-test',
            url: 'nw11.html',
            title: '未公開ネットワーク検証語',
            course: 'nw',
            courseLabel: 'ネットワーク',
            category: '',
            detail: '',
            sections: [{ heading: '', anchor: '', text: '未公開ネットワーク検証語', code: '' }]
          }
        ]
      })
    }));

    await scrollHeader(page);
    console.log(`${name}: deep-page reveal, asymmetric scroll thresholds, stable layout, menu guards, and keyboard focus pass`);
    await ready(page, 'py21.html');
    await expect(page.locator('#nav-handle, #nav-drawer')).toHaveCount(0);
    const course = page.locator('#headerbar__course');
    await course.hover();
    await expect(page.locator('#auto-nav')).toBeVisible();
    await course.click();
    await expect(page.locator('#auto-nav')).toBeVisible();
    await page.locator('#auto-nav a').first().focus();
    await page.mouse.move(700, 400);
    await page.waitForTimeout(400);
    await expect(page.locator('#auto-nav')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(course).toBeFocused();
    await expect(page.locator('#auto-nav')).toBeHidden();
    await course.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.locator('#auto-nav a').first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(course).toBeFocused();
    await page.keyboard.press('Escape');

    const materials = page.locator('.lesson-dock__btn--menu');
    await materials.press('Enter');
    await expect(page.locator('#lesson-dock-panel-menu')).toBeVisible();
    await expect(page.locator('#lesson-dock-panel-menu .ld-sec--faq')).toHaveCount(0);
    await fits(page, '#lesson-dock-panel-menu');
    await page.locator('#lesson-dock-panel-menu a').first().focus();
    await page.mouse.move(700,400);
    await page.waitForTimeout(400);
    await expect(page.locator('#lesson-dock-panel-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(materials).toBeFocused();
    await materials.click();
    await page.locator('.site-theme-menu__trigger').hover();
    await expect(page.locator('.site-theme-menu__options')).toBeVisible();
    await expect(page.locator('#lesson-dock-panel-menu')).toBeHidden();
    const search = page.locator('.lesson-dock__btn--search');
    const searchDialog = page.locator('#site-search-dialog');
    await search.hover();
    await page.waitForTimeout(250);
    await expect(searchDialog).toBeHidden();
    await search.click();
    await expect(searchDialog).toBeVisible();
    await expect(page.locator('.site-theme-menu__options')).toBeHidden();
    await fits(page, '#site-search-dialog .site-search__panel');
    await expect(searchDialog.locator('#site-search-tab-faq')).toHaveAttribute('aria-selected', 'true');
    assert.equal(searchIndexRequests, 0, 'FAQ-first open does not fetch the site-search index');
    const faqInput = searchDialog.locator('.ld-faq-search__input');
    await expect(faqInput).toBeFocused();
    await page.mouse.move(700, 400);
    await page.waitForTimeout(400);
    await expect(searchDialog).toBeVisible();
    await faqInput.fill('  インデント & "+"  ');
    const faqOpened = page.waitForEvent('popup');
    await faqInput.press('Enter');
    const faqPage = await faqOpened;
    await faqPage.waitForURL('**/faq.html?*');
    const faqURL = new URL(faqPage.url());
    assert.equal(faqURL.searchParams.get('q'), 'インデント & "+"');
    assert.equal(faqURL.searchParams.get('course'), 'py');
    assert.equal(new URL(page.url()).pathname, '/py21.html');
    await faqPage.close();
    await faqInput.fill('   ');
    await faqInput.press('Enter');
    await expect(faqInput).toBeFocused();
    await expect(faqInput).toHaveValue('');
    assert.equal(context.pages().length, 1, 'empty FAQ query does not open a page');
    const relatedQuestions = searchDialog.locator('.ld-faq');
    const faqCount = await page.evaluate(() => window.lessonDockData.faq.length);
    assert.ok(faqCount > 0, 'practice page has related questions');
    await expect(relatedQuestions).toHaveCount(faqCount);
    await relatedQuestions.first().locator('summary').press('Enter');
    await expect(relatedQuestions.first()).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(searchDialog).toBeHidden();
    await expect(search).toBeFocused();
    await search.press('Enter');
    await expect(searchDialog).toBeVisible();
    await expect(searchDialog.locator('#site-search-tab-faq')).toHaveAttribute('aria-selected', 'true');
    await expect(searchDialog.locator('.ld-faq-search__input')).toBeFocused();
    await searchDialog.locator('#site-search-tab-site').press('Enter');
    await expect(searchDialog.locator('#site-search-tab-site')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Tab');
    await expect(searchDialog.locator('#site-search-input')).toBeFocused();
    await expect(searchDialog.locator('.site-search__status')).toHaveText('検索語を入力してください。');
    assert.equal(searchIndexRequests, 1, 'site-search index loads after selecting site search');
    assert.deepEqual(
      await searchDialog.locator('.site-search__filter').evaluateAll(buttons =>
        buttons.map(button => button.dataset.course)
      ),
      expectedCourseFilters,
      'course filters only show courses with released indexed pages'
    );
    await searchDialog.locator('#site-search-input').fill('未公開論理回路検証語');
    await expect(searchDialog.locator('.site-search__status')).toContainText('一致する教材はありません');
    await searchDialog.locator('#site-search-input').fill('');
    await expect(searchDialog.locator('.site-search__status')).toHaveText('検索語を入力してください。');
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
    await search.click();
    await expect(searchDialog).toBeVisible();
    await page.mouse.click(12, 12);
    await expect(searchDialog).toBeHidden();
    await expect(search).toBeFocused();

    // Disclosure contents follow current metadata; unpublished pages never appear.
    assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('#auto-nav a')).every(link => {
      const id = new URL(link.href).pathname.split('/').pop().replace(/\.html$/, '');
      return window.pages[id]?.release === true && window.pages[id].mainTitle === window.pages.py21.mainTitle;
    })), true);
    await page.evaluate(() => {
      window.pages.py21.worksheetApp = [{id:'visible',release:true,title:'公開ワークシート',url:'https://example.test/worksheet?id=visible'}, {id:'hidden',release:false,title:'未公開ワークシート',url:'https://example.test/worksheet?id=hidden'}];
      window.pages.py21.next = [{id:'py22',release:true,url:'py22.html'}, {id:'py23',release:false,url:'py23.html'}];
      window.initLessonDockFromPages();
      window.initNav();
    });
    await page.locator('.lesson-dock__btn--menu').click();
    await expect(page.locator('#lesson-dock-panel-menu a[href*="id=visible"]')).toHaveCount(1);
    await expect(page.locator('#lesson-dock-panel-menu a[href*="id=hidden"]')).toHaveCount(0);
    await expect(page.locator('#lesson-dock-panel-menu a[href="py23.html"]')).toHaveCount(0);
    await expect(page.locator('.lesson-dock__btn--menu')).toHaveCount(1);
    await expect(search).toHaveCount(1);
    await search.click();
    await expect(searchDialog.locator('.ld-sec--faq')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#headerbar__course')).toHaveCount(1);

    for (const path of ['dr41.html#headline_1','dr31.html#headline_2','dr32.html#headline_1','lc01.html','lc02.html','lc03.html','lc04.html','nw11.html','nw12.html','nw13.html']) {
      await ready(page, path);
      for (const width of [1440,390]) {
        await page.setViewportSize({width,height:900});
        await fullScreen(page);
      }
    }
    console.log(`${name}: all lecture decks enter via menu, exit directly, and retain slide position`);

    for (const path of ['dr31.html#headline_2', 'py21.html']) {
      await ready(page, path);
      for (const width of [1800,915,720,390]) {
        await page.setViewportSize({width,height:900});
        assert.equal(
          await headerIsSingleRow(page),
          width > 640,
          `${path} header layout at ${width}px`
        );
        for (const theme of ['light','dark','system']) {
          for (const size of ['standard','large','xlarge']) {
            await page.evaluate(({theme,size}) => { window.siteTheme.setPreference(theme); window.siteTextSize.setPreference(size); }, {theme,size});
            if (path.startsWith('dr')) await footerFits(page);
            await page.locator('#headerbar__course').click();
            await expect(page.locator('#auto-nav')).toBeVisible();
            await fits(page, '#auto-nav');
            await page.keyboard.press('Escape');
            await page.locator('.lesson-dock__btn--search').click();
            await expect(searchDialog).toBeVisible();
            await searchDialog.locator('.site-search__panel').evaluate(panel => {
              panel.getAnimations().forEach(animation => animation.finish());
            });
            await fits(page, '#site-search-dialog .site-search__panel');
            await expect(searchDialog.locator('#site-search-tab-faq')).toHaveAttribute('aria-selected', 'true');
            assert.equal(await searchDialog.locator('.site-search__panel').evaluate(el => el.scrollWidth > el.clientWidth), false, 'search and FAQ fit inside the dialog');
            for (const control of await searchDialog.locator('.site-search__tab, .ld-faq-search__input, .ld-faq-search__button, .ld-faq-search__all').all()) {
              const box = await control.boundingBox();
              assert.ok(box.height >= 44, `${await control.getAttribute('class')} has a 44px touch target (${box.height}px)`);
            }
            await page.keyboard.press('Escape');
            await page.locator('.lesson-dock__btn--menu').click();
            await expect(page.locator('#lesson-dock-panel-menu')).toBeVisible();
            await fits(page, '#lesson-dock-panel-menu');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path} has no page overflow`);
            await page.keyboard.press('Escape');
          }
        }
      }
    }
    console.log(`${name}: desktop, half width, 390px, all themes and text sizes fit`);

    const touch = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    const touchPage = await touch.newPage();
    await scrollHeader(touchPage);
    assert.equal(await touchPage.locator('#site-header').evaluate(header => getComputedStyle(header).transitionDuration), '0s');
    await ready(touchPage, 'dr31.html');
    await touchPage.locator('#headerbar__course').tap();
    await expect(touchPage.locator('#auto-nav')).toBeVisible();
    await touchPage.locator('#headerbar__course').tap();
    await expect(touchPage.locator('#auto-nav')).toBeHidden();
    await touchPage.locator('.lesson-dock__btn--menu').tap();
    await expect(touchPage.locator('#lesson-dock-panel-menu')).toBeVisible();
    assert.equal(await touchPage.locator('#lesson-dock-panel-menu').evaluate(el => getComputedStyle(el).animationName), 'none');
    await touchPage.locator('.lesson-dock__btn--search').tap();
    await expect(touchPage.locator('#lesson-dock-panel-menu')).toBeHidden();
    await expect(touchPage.locator('dialog[open]')).toBeVisible();
    await expect(touchPage.locator('#site-search-tab-faq')).toHaveAttribute('aria-selected', 'true');
    await touchPage.keyboard.press('Escape');
    await expect(touchPage.locator('.lesson-dock__btn--search')).toBeFocused();
    await touchPage.locator('.lesson-slide-deck__fullscreen').tap();
    await expect(touchPage.locator('.lesson-slide-deck__fullscreen-menu')).toBeVisible();
    await touch.close();

    const rejected = await context.newPage();
    await rejected.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('test denial'));
    });
    await ready(rejected, 'dr31.html');
    await rejected.locator('.lesson-slide-deck__fullscreen').click();
    await rejected.getByRole('button',{name:'スライドを全画面表示',exact:true}).click();
    await expect(rejected.locator('.lesson-slide-deck__fullscreen-error')).toBeVisible();
    await expect(rejected.locator('body')).not.toHaveClass(/is-lesson-fullscreen/);
    await expect(rejected.locator('.lesson-slide-deck__fullscreen')).toBeFocused();
    await rejected.close();

    await ready(page, 'index.html');
    await expect(page.locator('#auto-nav, #nav-handle')).toHaveCount(0);
    await search.click();
    await expect(searchDialog).toBeVisible();
    await expect(searchDialog.locator('#site-search-tab-faq')).toHaveAttribute('aria-selected', 'true');
    await expect(searchDialog.locator('.ld-faq')).toHaveCount(0);
    await expect(searchDialog.locator('.ld-faq-empty')).toBeVisible();
    const indexFaqURL = new URL(await searchDialog.locator('.ld-faq-search__all').getAttribute('href'));
    assert.equal(indexFaqURL.pathname, '/faq.html');
    assert.equal(indexFaqURL.search, '');
    await page.keyboard.press('Escape');
    // FAQ remains reachable without a supported course or the optional site-search UI.
    await page.evaluate(() => {
      delete document.documentElement.dataset.siteSearchReady;
      window.openSiteSearch = undefined;
      window.initLessonDockFromPages();
    });
    const searchPanel = page.locator('#lesson-dock-panel-search');
    await search.click();
    await expect(searchPanel).toBeVisible();
    await expect(searchPanel.getByRole('searchbox')).toBeVisible();
    const allFaqURL = new URL(await searchPanel.locator('.ld-faq-search__all').getAttribute('href'));
    assert.equal(allFaqURL.pathname, '/faq.html');
    assert.equal(allFaqURL.search, '');
    console.log(`${name}: FAQ-first dialog, related questions, query routing, and site-search failure fallback work`);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${name}: keyboard, touch, overlay exclusion, release filtering, failure handling, and no local 404 passed`);
  } finally { await browser.close(); }
}
