/* Chrome fullscreen verification: only the presentation surface enters the top layer. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Chrome fullscreen presents the artboard surface alone and preserves presentation controls after exit', async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent('<button id="opener">発表</button><style>' + source('presentation.css') + '</style>');
  for (const file of ['core.js', 'svg.js', 'presentation.js']) await page.addScriptTag({ content: source(file) });
  await page.evaluate(() => {
    const doc = IlapoCore.createDocument();
    doc.name = '全画面の作品';
    doc.pages[0].board = IlapoCore.boardPreset('16:9');
    doc.pages[0].objects = [
      IlapoCore.makeShape('rect', 120, 180, 1040, 360, { fill: '#0B5FFF', stroke: 'none' }),
      IlapoCore.makeText(170, 370, 'アートボードだけを表示', { fill: '#FFFFFF', fontSize: 54, stroke: 'none' })
    ];
    const second = IlapoCore.createPage('次のページ', IlapoCore.boardPreset('16:9'));
    second.objects = [IlapoCore.makeShape('rect', 120, 180, 1040, 360, { fill: '#0F766E', stroke: 'none' })];
    doc.pages.push(second);
    window.viewer = IlapoPresentation.open(doc, { opener: document.getElementById('opener') });
  });
  await page.locator('.ilapo-present-fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement === document.querySelector('.ilapo-present-viewport'));
  const fullscreen = await page.evaluate(() => {
    const surface = document.querySelector('.ilapo-present-viewport');
    const paper = document.querySelector('.ilapo-present-paper');
    const surfaceBox = surface.getBoundingClientRect();
    const paperBox = paper.getBoundingClientRect();
    return {
      fullscreenTag: document.fullscreenElement?.className,
      headerInTopLayer: document.querySelector('.ilapo-present-header').matches(':fullscreen'),
      controlsInTopLayer: document.querySelector('.ilapo-present-controls').matches(':fullscreen'),
      surface: { width: surfaceBox.width, height: surfaceBox.height },
      paper: { width: paperBox.width, height: paperBox.height },
      ratio: paperBox.width / paperBox.height,
      topInSurface: document.elementFromPoint(5, 5)?.closest('.ilapo-present-viewport') === surface,
      bottomInSurface: document.elementFromPoint(5, innerHeight - 5)?.closest('.ilapo-present-viewport') === surface,
      focusedPaper: document.activeElement === paper
    };
  });
  assert.equal(fullscreen.fullscreenTag, 'ilapo-present-viewport');
  assert.equal(fullscreen.headerInTopLayer, false);
  assert.equal(fullscreen.controlsInTopLayer, false);
  assert.equal(fullscreen.topInSurface, true, 'top edge has no editor or presentation controls above the fullscreen surface');
  assert.equal(fullscreen.bottomInSurface, true, 'bottom edge has no editor or presentation controls above the fullscreen surface');
  assert.equal(fullscreen.focusedPaper, true, 'fullscreen start moves focus from the hidden trigger to the artboard');
  assert(fullscreen.surface.width >= 1279 && fullscreen.surface.height >= 719, 'fullscreen surface fills Chrome viewport');
  assert(Math.abs(fullscreen.ratio - (16 / 9)) < .01, 'artboard retains its aspect ratio');
  assert(fullscreen.paper.width > 1200 && fullscreen.paper.height > 670, 'artboard uses the available fullscreen space');
  await page.screenshot({ path: '/private/tmp/illustslide-artboard-fullscreen.png' });
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 2, 'ArrowRight advances while fullscreen');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 1, 'ArrowLeft returns while fullscreen');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 2, 'Space advances while fullscreen');
  await page.keyboard.press('PageDown');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 2, 'PageDown does not wrap past the final page while fullscreen');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.ilapo-present-paper')), true, 'Tab remains on the visible fullscreen artboard');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#ilapo-presentation', { state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
});
