import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8766/';
const selected = (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',');

async function slide(page, id) {
  await page.evaluate(value => { location.hash = value; }, id);
  await expect(page.locator(`#${id}`)).toBeVisible();
}

async function ink(page, values) {
  await page.locator('[data-output-ink-size]').evaluateAll((controls, v) => {
    controls.forEach((control, i) => {
      control.value = String(v[i]);
      control.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, values);
}

// Inspect pixels from an actual browser screenshot, not the SVG's fill attributes.
async function pixels(page, figure, positions) {
  const png = await figure.screenshot({ animations: 'disabled' });
  return page.evaluate(async ({ url, positions }) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return positions.map(([x, y]) => [...context.getImageData(
      Math.round(1 + x * (image.width - 2)), Math.round(1 + y * (image.height - 2)), 1, 1
    ).data].slice(0, 3));
  }, { url: `data:image/png;base64,${png.toString('base64')}`, positions });
}

for (const name of selected) {
  const browser = await (name === 'chrome' ? chromium.launch({ channel: process.env.JOHO_CHROME_CHANNEL || 'chrome' }) : webkit.launch());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' });
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(new URL('dr43.html#headline_4', base).href);
    await page.locator('body.lesson-slide-ready').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const figures = page.locator('.op-halftone-paper');
    const sample = [.02, .25, .5, .75, .98].flatMap(x => [.02, .5, .98].map(y => [x, y]));
    for (const theme of ['light', 'dark', 'auto']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (let bits = 0; bits < 8; bits++) {
        const values = [0, 1, 2].map(bit => bits & (1 << bit) ? 100 : 0);
        await ink(page, values);
        const expected = values.map(value => value === 100 ? 0 : 255);
        for (const [figureIndex, figure] of (await figures.all()).entries()) {
          const actual = await pixels(page, figure, sample);
          assert.deepEqual(actual, sample.map(() => expected), `${name} ${theme} CMY=${values} figure ${figureIndex}: white, CMY, RGB and black`);
        }
      }
    }

    // Intermediate dot sizes must still display the correct overlap colours.
    const centres = [[[32, 32]], [[0, 0], [64, 0], [0, 64], [64, 64]], [[32, 0], [32, 64]]];
    for (const values of [[60, 30, 10], [30, 60, 80], [75, 25, 50]]) {
      await ink(page, values);
      const points = [], expected = [];
      for (let y = 4; y < 64; y += 8) for (let x = 4; x < 64; x += 8) {
        const distance = centres.map((channel, i) => Math.min(...channel.map(([cx, cy]) => Math.hypot(x - cx, y - cy))) - 46 * values[i] / 100);
        if (distance.some(value => Math.abs(value) < 3)) continue; // Avoid antialiased edges.
        points.push([(128 + x) / 384, (64 + y) / 256]);
        expected.push(distance.map(value => value < 0 ? 0 : 255));
      }
      assert.deepEqual(await pixels(page, figures.nth(1), points), expected, `${name}: intermediate CMY ${values}`);
    }
    await page.locator('[data-output-ink-reset]').click();
    assert.deepEqual(await page.locator('[data-output-ink-size]').evaluateAll(controls => controls.map(c => Number(c.value))), [60, 30, 10]);
    await page.locator('#op-ink-c').press('End');
    await expect(page.locator('#op-ink-c')).toHaveValue('100');
    await page.locator('#op-ink-c').press('Home');
    await expect(page.locator('#op-ink-c')).toHaveValue('0');
    assert.equal(new URL(page.url()).hash, '#headline_4', 'Slider keys do not navigate slides');

    // Both separated slides open the same supplement and return focus to the right trigger.
    for (const id of ['headline_4', 'headline_dpi']) {
      await slide(page, id);
      const trigger = page.locator('[data-lesson-slide]:not([hidden]) [data-lesson-supplement-open="op-pixel-dot-detail"]');
      await trigger.click();
      await expect(page.locator('#op-pixel-dot-detail')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#op-pixel-dot-detail')).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    await page.locator('#op-dpi-demo').press('End');
    await expect(page.locator('[data-output-dot-count]')).toHaveText('20×20＝400ドット');
    await slide(page, 'headline_4');
    await expect(page.locator('#op-ink-c')).toHaveValue('0');

    const ids = ['headline_4', 'headline_dpi', 'headline_5', 'headline_6', 'headline_7', 'headline_8'];
    await expect(page.locator('section[data-lesson-slide]')).toHaveCount(10); // Generated title plus nine content slides.
    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark', 'auto']) for (const text of ['normal', 'large', 'xlarge']) {
        await page.evaluate(({ theme, text }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.textSize = text;
        }, { theme, text });
        for (const id of ids) {
          await slide(page, id);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const box = await page.evaluate(() => {
            const slide = document.querySelector('section[data-lesson-slide]:not([hidden])');
            return [document.documentElement.scrollWidth, innerWidth, slide.scrollWidth, slide.clientWidth];
          });
          assert.ok(box[0] <= box[1] + 1 && box[2] <= box[3] + 1, `${name} ${width} ${theme} ${text} ${id}: no horizontal overflow ${box}`);
        }
      }
    }
    assert.deepEqual(failures, [], `${name}: no page errors or missing local files`);
    const plain = await browser.newPage({ javaScriptEnabled: false });
    await plain.goto(new URL('dr43.html', base).href);
    await expect(plain.locator('section[data-lesson-slide]')).toHaveCount(9);
    await expect(plain.locator('#headline_dpi')).toBeVisible();
    await expect(plain.locator('[data-output-ink] .op-enhancement')).toBeHidden();
    console.log(`${name}: actual CMY endpoint/intermediate pixels, sliders, split slides, stable links, responsive layout and no-JS fallback passed`);
  } finally {
    await browser.close();
  }
}
