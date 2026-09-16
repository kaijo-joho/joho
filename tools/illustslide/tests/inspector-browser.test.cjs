/* プレビュー、適用・取消、対象切替、非モーダル操作、狭い画面の回帰。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain'); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
let serial = 0;
function fixture() {
  const doc = C.createDocument(); doc.id = 'inspector-' + (++serial); doc.name = 'パネル確認 ' + serial;
  const page = doc.pages[0]; page.board = { width: 640, height: 480, unit: 'px', infinite: false };
  const a = C.makeShape('rect', 90, 120, 160, 100, { fill: '#2563EB', stroke: '#172B4D' }); a.id = 'a'; a.name = '図形A';
  const b = C.makeShape('ellipse', 350, 220, 120, 100, { fill: '#22C55E', stroke: '#172B4D' }); b.id = 'b'; b.name = '図形B';
  page.objects = [a, b]; doc.pages.push(C.createPage('ページ2', page.board));
  return doc;
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const read = page => page.evaluate(() => IlapoEditor.getDocument());
const shape = (page, id) => page.locator(`#artwork [data-object="${id}"]`);
async function load(page, doc = fixture()) {
  await page.locator('#file-input').setInputFiles({ name: 'inspector.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await page.waitForFunction(name => IlapoEditor.getDocument().name === name || document.getElementById('dialog').open, doc.name);
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(name => IlapoEditor.getDocument().name === name, doc.name); await settle(page);
  return doc;
}
async function select(page, id) { await page.locator('#canvas').focus(); await page.keyboard.press('v'); await shape(page, id).click(); await settle(page); }
async function style(page) { await page.locator('#style-button').click(); await page.locator('#color-hex').waitFor(); await settle(page); }
async function apply(page) { await page.locator('#inspector-submit').click(); await settle(page); }
async function color(page, value) { await page.locator(`[data-color="${value}"]`).click(); await settle(page); }
async function painted(page, id) { return shape(page, id).locator('path').first().getAttribute('fill'); }
async function close(page) { if (await page.locator('#inspector-panel').isVisible()) await page.locator('#inspector-close').click(); await settle(page); }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 } });
  const page = await context.newPage(), errors = [], failed = [];
  const artifacts = await fs.mkdtemp('/private/tmp/illustslide-inspector-');
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(() => !!window.IlapoEditor);
    let before = await load(page); await select(page, 'a');
    await page.locator('#style-button').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert(await page.locator('#tooltip').isVisible(), 'keyboard focus names the icon');
    assert.equal(await page.locator('#tooltip').textContent(), '書式・色');
    await page.keyboard.press('Enter'); await settle(page);
    assert.equal(await page.locator('#dialog').evaluate(el => el.open), false);
    assert.equal(await page.locator('#canvas').evaluate(el => el.closest('[inert]')), null);
    assert.equal(Math.round((await page.locator('#inspector-panel').boundingBox()).width), 320, 'default panel width');
    await color(page, '#EF4444'); await color(page, '#F59E0B');
    assert.equal(await painted(page, 'a'), '#F59E0B', 'canvas shows the uncommitted color');
    assert.deepEqual(await read(page), before, 'preview does not modify the document');
    await page.waitForTimeout(520);
    assert.equal(await page.evaluate(() => localStorage.getItem('kaijo-ilapo:auto')), null, 'preview is not autosaved');
    assert.equal(await page.locator('.top [data-action=undo]').isDisabled(), true);
    await page.screenshot({ path: path.join(artifacts, 'style-desktop.png') });
    await page.locator('#inspector-close').click(); await settle(page);
    assert.equal(await painted(page, 'a'), '#2563EB');
    assert.equal(await page.locator('#style-button').evaluate(el => document.activeElement === el), true);

    await style(page); await color(page, '#EF4444'); await color(page, '#F59E0B'); await apply(page);
    assert.equal((await read(page)).pages[0].objects[0].style.fill, '#F59E0B');
    assert(await page.locator('#inspector-panel').isVisible(), 'apply leaves the panel open');
    await page.locator('#inspector-canvas').click();
    assert(await page.locator('#inspector-panel').isVisible(), 'return to canvas keeps the panel open');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(page), before, 'one Undo removes all edits in the draft');
    assert.equal(await page.locator('.top [data-action=undo]').isDisabled(), true);
    assert.equal(await page.locator('#color-hex').count(), 0, 'deselection removes the old form');

    await select(page, 'a'); await style(page); await color(page, '#EC4899');
    await shape(page, 'b').click(); await settle(page);
    assert.match(await page.locator('.inspector-target').textContent(), /図形B/);
    assert.equal(await page.locator('#color-hex').inputValue(), '#22C55E');
    await apply(page); assert.deepEqual(await read(page), before, 'old color draft cannot affect a new selection');

    await select(page, 'a'); await page.locator('#selection-bar [data-action=transform]').click(); await settle(page);
    await page.locator('#transform-width').fill('240'); await settle(page);
    assert.deepEqual(await read(page), before);
    const previewWidth = await shape(page, 'a').boundingBox();
    await page.locator('#transform-width').fill('0'); await settle(page);
    assert(await page.locator('#inspector-error').isVisible(), 'invalid geometry is explained');
    const originalWidth = await shape(page, 'a').boundingBox();
    assert(previewWidth.width > originalWidth.width * 1.4, 'invalid input clears the previous preview');
    await apply(page); assert.deepEqual(await read(page), before);
    await page.locator('#transform-width').fill('240'); await settle(page);
    assert.equal(await page.locator('#inspector-error').isVisible(), false);
    await page.locator('#inspector-reset').click(); await settle(page);
    assert.equal(await page.locator('#transform-width').inputValue(), '160');
    assert.deepEqual(await read(page), before);
    await page.locator('#transform-width').fill('240'); await apply(page);
    assert.equal((await read(page)).pages[0].objects[0].matrix[0], 1.5);
    await page.locator('#inspector-canvas').click(); await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(page), before);

    await select(page, 'a'); await style(page); await color(page, '#EC4899');
    before = await load(page);
    assert.equal(await page.locator('#color-hex').count(), 0, 'opening another document discards the old draft');
    assert.deepEqual(await read(page), before);
    await select(page, 'b'); await style(page);
    await page.locator('#color-hex').focus(); await page.keyboard.press('Delete'); await page.keyboard.press('v');
    assert.deepEqual(await read(page), before, 'editing controls does not delete or change canvas objects');
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await page.locator('#inspector-panel').isVisible(), false);
    await style(page); await page.locator('#help-button').click();
    assert(await page.locator('#operation-help').isVisible()); assert(await page.locator('#inspector-panel').isVisible());
    await page.keyboard.press('Escape');
    assert(await page.locator('#inspector-panel').isVisible(), 'help and settings close independently');

    await page.locator('.side-tab [data-action=export-toggle]').click(); await settle(page);
    assert(await page.locator('#export-panel').isVisible()); assert.equal(await page.locator('#inspector-panel').isVisible(), false);
    await page.locator('#inspector-toggle').click(); await settle(page);
    assert.equal(await page.locator('#export-panel').isVisible(), false);

    // Shared themes and text sizes, with an unobscured canvas and reachable actions.
    for (const width of [1280, 736, 390, 320]) {
      for (const [theme, size] of [['light', 'standard'], ['dark', 'large'], ['auto', 'xlarge']]) {
        await page.setViewportSize({ width, height: 736 });
        await page.locator('[data-inspector-section=view]').click();
        await page.locator('#view-theme').selectOption(theme); await page.locator('#view-size').selectOption(size); await apply(page);
        await page.locator('[data-inspector-section=style]').click(); await settle(page);
        const dimensions = await page.evaluate(() => {
          const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
          return { canvas:rect('canvas'), panel:rect('inspector-panel'), submit:rect('inspector-submit'), bar:rect('selection-bar'), overflow:document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, icons:[...document.querySelectorAll('#selection-bar button')].filter(b => b.getBoundingClientRect().width).map(b => ({ label:b.getAttribute('aria-label'), svg:!!b.querySelector('svg'), right:b.getBoundingClientRect().right })) };
        });
        assert.equal(dimensions.overflow, false, JSON.stringify({ width, theme, size, dimensions }));
        assert(dimensions.panel.right <= width + 1 && dimensions.submit.bottom <= dimensions.panel.bottom + 1);
        assert(dimensions.canvas.height >= 200 && dimensions.canvas.width >= 220);
        assert(dimensions.bar.width <= dimensions.canvas.width && dimensions.icons.every(b => b.label && b.svg && b.right <= dimensions.canvas.right));
        if (width <= 850) assert(dimensions.panel.y >= dimensions.canvas.bottom - 1, 'mobile panel reserves its own space');
      }
      await page.screenshot({ path: path.join(artifacts, `style-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 320 }); await settle(page);
    assert(await page.evaluate(() => document.getElementById('inspector-submit').getBoundingClientRect().bottom <= innerHeight && document.getElementById('canvas').getBoundingClientRect().height >= 70), 'short viewport keeps canvas and Apply reachable');
    const shortBefore = await read(page);
    for (const [channel, value] of [['R', '18'], ['G', '52'], ['B', '86']]) await page.locator('#color-' + channel).fill(value);
    await page.locator('#color-B').evaluate(el => el.scrollIntoView({ block:'center' })); await settle(page);
    assert.equal(await page.locator('#color-hex').inputValue(), '#123456');
    const shortField = await page.locator('#color-B').boundingBox(), shortFooter = await page.locator('#inspector-panel footer').boundingBox(), shortPanel = await page.locator('#inspector-panel').boundingBox();
    assert(shortField.y >= shortPanel.y && shortField.y + shortField.height <= shortFooter.y + 1, 'short viewport exposes the input above the fixed footer');
    assert.deepEqual(await read(page), shortBefore, 'short viewport also preserves the draft');
    await page.screenshot({ path: path.join(artifacts, 'short-viewport.png') });
    await apply(page); assert.equal((await read(page)).pages[0].objects[1].style.fill, '#123456');

    await page.setViewportSize({ width:1280, height:736 }); await settle(page);
    const resize = page.locator('#inspector-resize'); await resize.focus();
    const oldWidth = (await page.locator('#inspector-panel').boundingBox()).width;
    await page.keyboard.press('ArrowLeft'); await settle(page);
    assert((await page.locator('#inspector-panel').boundingBox()).width > oldWidth);
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal((await page.locator('#inspector-panel').boundingBox()).width, oldWidth);
    assert(await page.locator('#inspector-panel').isVisible(), 'Escape first cancels resize');
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await page.locator('#inspector-panel').isVisible(), false);
    await page.setViewportSize({width:1024,height:736}); await page.setViewportSize({width:1280,height:736});
    await page.locator('#inspector-toggle').click(); await settle(page);
    assert.equal((await page.locator('#inspector-panel').boundingBox()).width, oldWidth, 'resizing the window while closed preserves the panel width');
    await close(page);

    const touchContext = await browser.newContext({ viewport:{width:390,height:736}, hasTouch:true, isMobile:true });
    try {
      const touch = await touchContext.newPage(); touch.on('pageerror', error => errors.push(error.message));
      await touch.goto(`http://127.0.0.1:${server.address().port}/illustslide/`); await touch.waitForFunction(() => !!window.IlapoEditor);
      const touchBefore = await load(touch); await shape(touch, 'a').tap(); await touch.locator('#style-button').tap();
      await touch.locator('[data-color="#EC4899"]').scrollIntoViewIfNeeded(); await touch.locator('[data-color="#EC4899"]').tap(); await settle(touch);
      assert.deepEqual(await read(touch), touchBefore, 'touch palette previews without saving');
      await touch.locator('#inspector-submit').tap(); await settle(touch);
      assert.equal((await read(touch)).pages[0].objects[0].style.fill, '#EC4899');
      assert(await touch.locator('#inspector-panel').isVisible());
      await touch.locator('#inspector-close').tap(); assert.equal(await touch.locator('#inspector-panel').isVisible(), false);
    } finally { await touchContext.close(); }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log('illustSlide inspector browser tests passed. Artifacts: ' + artifacts);
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
