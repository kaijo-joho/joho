// Browser regression checks. Requires Playwright and a local server (JOHO_TEST_URL).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8884/';

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

async function fullScreen(page) {
  const trigger = page.locator('.lesson-slide-deck__fullscreen');
  const hash = new URL(page.url()).hash;
  await trigger.click();
  await expect(page.locator('.lesson-slide-deck__fullscreen-menu')).toBeVisible();
  assert.equal(await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)), false, 'icon only opens the menu');
  await page.getByRole('button', {name:'スライドを全画面表示',exact:true}).click();
  await expect(page.locator('body')).toHaveClass(/is-lesson-fullscreen/);
  await expect(page.locator('#site-header')).toBeHidden();
  await expect(page.locator('#lesson-dock')).toBeHidden();
  await expect(page.locator('#auto-nav')).toBeHidden();
  await expect(page.locator('.lesson-slide-deck__navigation .lesson-slide-deck__fullscreen')).toBeVisible();
  assert.equal(new URL(page.url()).hash, hash);
  await fits(page, '.lesson-slide-deck__navigation');
  await page.getByRole('button', {name:'全画面表示を終了',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/is-lesson-fullscreen/);
  await expect(trigger).toBeFocused();
  await expect(page.locator('#site-header')).toBeVisible();
  await expect(page.locator('.lesson-slide-deck__fullscreen-menu')).toBeHidden();
  assert.equal(new URL(page.url()).hash, hash);
}

for (const [name, type] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await type.launch(name === 'chrome' ? {channel:'chrome',headless:true} : {headless:true});
  const errors = [];
  try {
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(baseURL) && response.status() === 404) errors.push(`404 ${response.url()}`);
    });

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
    await page.locator('.lesson-dock__btn--search').click();
    await expect(page.locator('.site-theme-menu__options')).toBeHidden();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lesson-dock__btn--search')).toBeFocused();

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
    await expect(page.locator('#headerbar__course')).toHaveCount(1);
    await page.keyboard.press('Escape');

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
      for (const width of [1800,720,390]) {
        await page.setViewportSize({width,height:900});
        for (const theme of ['light','dark','system']) {
          for (const size of ['standard','large','xlarge']) {
            await page.evaluate(({theme,size}) => { window.siteTheme.setPreference(theme); window.siteTextSize.setPreference(size); }, {theme,size});
            await page.locator('#headerbar__course').click();
            await expect(page.locator('#auto-nav')).toBeVisible();
            await fits(page, '#auto-nav');
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
    await ready(touchPage, 'dr31.html');
    await touchPage.locator('#headerbar__course').tap();
    await expect(touchPage.locator('#auto-nav')).toBeVisible();
    await touchPage.locator('#headerbar__course').tap();
    await expect(touchPage.locator('#auto-nav')).toBeHidden();
    await touchPage.locator('.lesson-dock__btn--menu').tap();
    await expect(touchPage.locator('#lesson-dock-panel-menu')).toBeVisible();
    assert.equal(await touchPage.locator('#lesson-dock-panel-menu').evaluate(el => getComputedStyle(el).animationName), 'none');
    await touchPage.locator('.lesson-slide-deck__fullscreen').tap();
    await expect(touchPage.locator('#lesson-dock-panel-menu')).toBeHidden();
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
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${name}: keyboard, touch, overlay exclusion, release filtering, failure handling, and no local 404 passed`);
  } finally { await browser.close(); }
}
