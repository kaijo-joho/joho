/* 位置合わせガイド、吸着、取消し、設定、出力除外のChrome回帰。 */
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
  try {
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const read = page => page.evaluate(() => IlapoEditor.getDocument());
async function inspectorSubmit(page) {
  const submit = page.locator('#inspector-submit');
  if (await submit.isVisible()) await submit.click();
  await settle(page);
}

function fixture() {
  const document = C.createDocument();
  document.id = 'alignment-guides';
  document.name = '位置合わせガイド';
  document.pages[0].board = { width: 640, height: 400, unit: 'px', infinite: false };
  const moving = C.makeShape('rect', 100, 100, 100, 80, { fill: '#2563EB' }); moving.id = 'moving';
  const reference = C.makeShape('ellipse', 300, 180, 100, 80, { fill: '#22C55E' }); reference.id = 'reference';
  const spacing = C.makeShape('rect', 500, 180, 100, 80, { fill: '#F59E0B' }); spacing.id = 'spacing';
  document.pages[0].objects = [moving, reference, spacing];
  return document;
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const projectPoint = point => page.evaluate(point => {
    const canvas = document.getElementById('canvas').getBoundingClientRect();
    const camera = IlapoEditor.getCamera();
    return { x: canvas.x + (point.x - camera.x) / camera.width * canvas.width, y: canvas.y + (point.y - camera.y) / camera.height * canvas.height };
  }, point);
  const projectPointFor = (target, point) => target.evaluate(point => {
    const canvas = document.getElementById('canvas').getBoundingClientRect();
    const camera = IlapoEditor.getCamera();
    return { x: canvas.x + (point.x - camera.x) / camera.width * canvas.width, y: canvas.y + (point.y - camera.y) / camera.height * canvas.height };
  }, point);
  async function load(target, document) {
    await target.locator('#file-input').setInputFiles({ name: 'guides.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
    await target.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
    await settle(target);
  }
  async function select(target, id) {
    await target.locator('#canvas').focus();
    await target.keyboard.press('v');
    await target.locator(`[data-object="${id}"]`).click();
    await settle(target);
  }
  async function drag(from, to, modifiers = [], during) {
    const a = await projectPoint(from), b = await projectPoint(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    if (modifiers.length) await page.keyboard.down(modifiers[0]);
    await page.mouse.move(b.x, b.y, { steps: 8 });
    if (during) await during();
    await page.mouse.up();
    if (modifiers.length) await page.keyboard.up(modifiers[0]);
    await settle(page);
  }
  async function dragTarget(target, from, to, during) {
    const a = await projectPointFor(target, from), b = await projectPointFor(target, to);
    await target.mouse.move(a.x, a.y); await target.mouse.down(); await target.mouse.move(b.x, b.y, { steps: 8 });
    if (during) await during();
    await target.mouse.up(); await settle(target);
  }
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    await page.evaluate(() => localStorage.removeItem('kaijo-ilapo:settings'));
    const original = fixture(); await load(page, original); await select(page, 'moving');

    // 右辺を参照図形の左辺へ合わせる。プレビュー中だけガイドが存在する。
    const beforeDrag = await read(page);
    await drag({ x: 150, y: 140 }, { x: 247, y: 217 }, [], async () => {
      const guides = page.locator('#alignment-guides');
      assert(await guides.count(), 'SVG guide layer exists');
      assert.equal(await guides.evaluate(element => getComputedStyle(element).pointerEvents), 'none');
      assert(await guides.locator('*').count() > 0, 'guides are drawn while dragging');
      await page.screenshot({ path: '/private/tmp/illustslide-guides-preview.png' });
      assert.deepEqual(await read(page), beforeDrag, 'preview does not mutate the document');
    });
    const snapped = await read(page);
    assert.equal(snapped.pages[0].objects.find(object => object.id === 'moving').matrix[4], 100, 'x position snaps to the reference edge');
    assert.equal(snapped.pages[0].objects.find(object => object.id === 'moving').matrix[5], 80, 'y position snaps to the reference center');
    assert.equal(await page.locator('#alignment-guides *').count(), 0, 'guides are removed after commit');
    await page.keyboard.press('Meta+z'); await settle(page); assert.deepEqual(await read(page), original, 'movement is one undo');
    await page.keyboard.press('Meta+Shift+z'); await settle(page);

    // Option/Alt temporarily disables both guide and snap, while preserving the movement.
    await select(page, 'moving');
    await drag({ x: 250, y: 220 }, { x: 296, y: 300 }, ['Alt']);
    const optionDocument = await read(page), optionMoving = optionDocument.pages[0].objects.find(object => object.id === 'moving');
    assert(Math.abs(optionMoving.matrix[4] - 146) < 0.01, 'Option disables edge snapping');
    assert(Math.abs(optionMoving.matrix[5] - 160) < 0.01, 'Option disables center snapping');
    await page.keyboard.press('Meta+z'); await settle(page);

    // Escape cancels the active preview and does not add history.
    await select(page, 'moving'); const beforeCancel = await read(page);
    await drag({ x: 250, y: 220 }, { x: 350, y: 300 }, [], async () => {
      await page.keyboard.press('Escape'); await settle(page);
      assert.deepEqual(await read(page), beforeCancel, 'Escape cancels guide preview');
    });
    assert.deepEqual(await read(page), beforeCancel); await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(page), original, 'canceled movement adds no extra undo entry');

    // View setting is persisted and disables drawing/snap for subsequent drags.
    await page.locator('#board-toggle').click(); await settle(page);
    await page.locator('#view-toggle').click();
    assert(await page.locator('#view-guides').isChecked(), 'guides default to on');
    await page.locator('#view-guides').uncheck(); await inspectorSubmit(page);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kaijo-ilapo:settings')).smartGuides), false);
    await select(page, 'moving');
    await drag({ x: 150, y: 140 }, { x: 247, y: 217 }, [], async () => assert.equal(await page.locator('#alignment-guides *').count(), 0));
    const offMoving = (await read(page)).pages[0].objects.find(object => object.id === 'moving');
    assert(Math.abs(offMoving.matrix[4] - 97) < 0.01, 'setting off disables snapping');
    await page.keyboard.press('Meta+z'); await settle(page);

    // 独立fixtureで、左右の等間隔ガイドを2本表示する。
    const spacingContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const spacingPage = await spacingContext.newPage(); await spacingPage.goto(url); await spacingPage.waitForFunction(() => !!window.IlapoEditor);
      const spacingDocument = C.createDocument(); spacingDocument.id = 'spacing-guides'; spacingDocument.pages[0].board = { width: 640, height: 400, unit: 'px', infinite: false };
      const left = C.makeShape('rect', 0, 100, 60, 40, { fill: '#2563EB' }); left.id = 'left';
      const center = C.makeShape('rect', 100, 100, 40, 40, { fill: '#22C55E' }); center.id = 'center';
      const right = C.makeShape('rect', 220, 100, 50, 40, { fill: '#F59E0B' }); right.id = 'right';
      spacingDocument.pages[0].objects = [left, center, right]; await load(spacingPage, spacingDocument); await select(spacingPage, 'center');
      const spacingBefore = await read(spacingPage);
      await dragTarget(spacingPage, { x: 120, y: 120 }, { x: 138, y: 120 }, async () => {
        assert.deepEqual(await read(spacingPage), spacingBefore, 'spacing preview does not mutate the document');
        assert(await spacingPage.locator('#alignment-guides .alignment-distance').count() >= 2, 'two equal spacing labels are drawn');
        await spacingPage.screenshot({ path: '/private/tmp/illustslide-guides-spacing.png' });
      });
      const spacingAfter = await read(spacingPage); assert(Math.abs(spacingAfter.pages[0].objects.find(object => object.id === 'center').matrix[4] - 20) < 0.01, 'center snaps to equal spacing');
    } finally { await spacingContext.close(); }

    // 独立fixtureで、右辺リサイズを用紙側の位置へ吸着する。
    const resizeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const resizePage = await resizeContext.newPage(); await resizePage.goto(url); await resizePage.waitForFunction(() => !!window.IlapoEditor);
      const resizeDocument = C.createDocument(); resizeDocument.id = 'resize-guides'; resizeDocument.pages[0].board = { width: 640, height: 400, unit: 'px', infinite: false };
      const resizable = C.makeShape('rect', 100, 100, 50, 40, { fill: '#2563EB' }); resizable.id = 'resizable';
      const resizeTarget = C.makeShape('rect', 300, 260, 80, 50, { fill: '#22C55E' }); resizeTarget.id = 'resize-target';
      resizeDocument.pages[0].objects = [resizable, resizeTarget]; await load(resizePage, resizeDocument); await select(resizePage, 'resizable');
      const resizeBefore = await read(resizePage);
      await dragTarget(resizePage, { x: 150, y: 120 }, { x: 298, y: 120 }, async () => assert.deepEqual(await read(resizePage), resizeBefore, 'resize preview does not mutate the document'));
      const resizeAfter = await read(resizePage); const resized = resizeAfter.pages[0].objects.find(object => object.id === 'resizable');
      const resizeBounds = await resizePage.evaluate(object => IlapoGeometry.bounds(object), resized);
      assert(Math.abs(resizeBounds.x - 100) < 0.01 && Math.abs(resizeBounds.width - 200) < 0.01, 'right resize snaps to the target edge');
      await resizePage.keyboard.press('Meta+z'); await settle(resizePage); assert.deepEqual(await read(resizePage), resizeBefore, 'resize is one undo');
    } finally { await resizeContext.close(); }

    // Alignment guides never become part of serialized or exported SVG artwork.
    const exported = await page.evaluate(() => IlapoSVG.exportPage(IlapoEditor.getDocument().pages[0]));
    assert(!exported.includes('alignment-guides')); assert(!exported.includes('guide'));

    // Touch drag remains usable on a narrow viewport.
    await page.setViewportSize({ width: 390, height: 844 }); await settle(page);
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const touch = await touchContext.newPage(); touch.setDefaultTimeout(10000); await touch.goto(url); await touch.waitForFunction(() => !!window.IlapoEditor);
    await load(touch, fixture()); await select(touch, 'moving');
    const beforeTouch = await read(touch);
    const point = await touch.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(), c = IlapoEditor.getCamera(); return { x: r.x + (150 - c.x) / c.width * r.width, y: r.y + (140 - c.y) / c.height * r.height }; });
    const cdp = await touchContext.newCDPSession(touch);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 20, y: point.y + 12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(touch);
    const afterTouch = await read(touch);
    assert.notEqual(afterTouch.pages[0].objects.find(object => object.id === 'moving').matrix[4], beforeTouch.pages[0].objects.find(object => object.id === 'moving').matrix[4], 'touch drag changes the document');
    await touchContext.close();
    await page.screenshot({ path: '/private/tmp/illustslide-guides-desktop.png' });
    assert.deepEqual(errors, []);
    console.log('illustSlide alignment guides browser tests passed');
  } finally { await context.close(); await browser.close(); if (!supplied) server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
