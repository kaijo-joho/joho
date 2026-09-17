/* 図形一覧を右パネルで選び、編集後も同期できることをChromeで確認する。 */
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
function fixture() {
  const doc = C.createDocument(); doc.id = 'objects-panel'; doc.name = '図形一覧の確認';
  const objects = [
    C.makeShape('rect', 60, 80, 120, 80, { fill: '#2563EB' }),
    C.makeShape('ellipse', 250, 120, 100, 80, { fill: '#22C55E' }),
    C.makeShape('triangle', 410, 150, 100, 90, { fill: '#F59E0B' })
  ];
  [objects[0].id, objects[1].id, objects[2].id] = ['back', 'grouped', 'front'];
  objects[0].name = '背面の長方形';
  objects[1].name = '固定した楕円'; objects[1].locked = true; objects[1].group = 'group-1';
  objects[2].name = '前面の三角形'; objects[2].group = 'group-1';
  doc.pages[0].board = { width: 640, height: 400, unit: 'px', infinite: false };
  doc.pages[0].objects = objects;
  return doc;
}
async function load(page, document) {
  await page.locator('#file-input').setInputFiles({ name: 'objects.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
  await settle(page);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(() => !!window.IlapoEditor);
    const original = fixture(); await load(page, original);
    await page.locator('#canvas').focus(); await page.keyboard.press('v');
    await page.locator('#objects-toggle').click(); await settle(page);
    assert(await page.locator('#inspector-panel').isVisible());
    assert.equal(await page.locator('#objects-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('[data-object-group-toggle]').count(), 1, 'group is shown as one collapsed unit');
    await page.locator('[data-object-group-toggle]').click(); await settle(page);
    assert.deepEqual(await page.locator('[data-object-pick]').evaluateAll(nodes => nodes.map(node => node.dataset.objectPick)), ['front', 'grouped', 'back']);
    assert.match(await page.locator('[data-pick-object="grouped"]').getAttribute('aria-label'), /固定/);
    assert.deepEqual(await read(page), original, 'opening the list does not modify the document');
    assert(await page.locator('.top [data-action=undo]').isDisabled());
    await page.screenshot({ path: '/private/tmp/illustslide-objects-desktop.png' });

    await page.locator('[data-pick-object="back"]').click(); await settle(page);
    assert.deepEqual(await page.evaluate(() => IlapoEditor.getSelection()), ['back']);
    assert.equal(await page.locator('[data-pick-object="back"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-pick-object="front"]').click({ modifiers: ['Shift'] }); await settle(page);
    assert.deepEqual(new Set(await page.evaluate(() => IlapoEditor.getSelection())), new Set(['back', 'front', 'grouped']));
    await page.locator('[data-object-command="rename"][data-object-id="front"]').click();
    await page.locator('#object-name').fill('前面の名前を変更'); await page.locator('#dialog-submit').click(); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(object => object.id === 'front').name, '前面の名前を変更');
    await page.locator('[data-object-command="lock"][data-object-id="front"]').click(); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(object => object.id === 'front').locked, true, 'lock button commits one object update');
    await page.locator('[data-object-command="child-after"][data-object-id="front"]').click(); await settle(page);
    assert.deepEqual((await read(page)).pages[0].objects.filter(object => object.group === 'group-1').map(object => object.id), ['front', 'grouped'], 'child order stays inside its group');

    assert.equal(await page.evaluate(()=>document.activeElement.dataset.objectPick),'front','disabled move button returns focus to its row');
    await page.locator('[data-pick-object="front"]').focus(); await page.keyboard.press('ArrowDown'); await settle(page);
    assert.deepEqual(await page.evaluate(() => IlapoEditor.getSelection()), ['back']);
    await page.keyboard.press('Home'); await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.layerPick), 'default');
    await page.keyboard.press('ArrowDown');await settle(page);assert.equal(await page.evaluate(() => document.activeElement.dataset.objectGroupPick), 'group-1');
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await page.locator('#inspector-panel').isVisible(), false);
    assert.equal(await page.locator('#objects-toggle').evaluate(element => document.activeElement === element), true);

    await page.locator('#objects-toggle').click(); await page.locator('[data-object-group-toggle]').click(); await settle(page);
    const dragHandle = page.locator('[data-object-row="back"] [data-object-drag]');
    const groupHead = page.locator('.object-group-head'); await dragHandle.scrollIntoViewIfNeeded();await groupHead.scrollIntoViewIfNeeded();const from = await dragHandle.boundingBox(), to = await groupHead.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down(); assert.equal(await page.locator('.dragging').count(), 1, 'drag starts from its handle');
    await page.mouse.move(to.x + to.width / 2, to.y + 3, { steps: 5 }); assert.equal(await page.locator('.drop-before').count(), 1, 'drag previews the front insertion point'); await page.mouse.up(); await settle(page);
    assert.deepEqual((await read(page)).pages[0].objects.map(object => object.id), ['front', 'grouped', 'back'], 'dragging a unit in front commits one history change on drop');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual((await read(page)).pages[0].objects.map(object => object.id), ['back', 'front', 'grouped'], 'the reorder drag is one Undo');
    await page.locator('[data-pick-object="back"]').click(); await settle(page);
    const beforeMove = await read(page);
    await page.locator('#inspector-canvas').click(); await page.keyboard.press('ArrowRight'); await settle(page);
    assert.notDeepEqual(await read(page), beforeMove, 'canvas editing remains available while the list is open');
    assert.equal(await page.locator('[data-object-pick]').count(), 3, 'the list refreshes after an edit');

    await page.setViewportSize({ width: 390, height: 736 }); await settle(page);
    const layout = await page.evaluate(() => {
      const panel = document.getElementById('inspector-panel').getBoundingClientRect();
      const canvas = document.getElementById('canvas').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, panelTop: panel.top, canvasBottom: canvas.bottom };
    });
    assert.equal(layout.overflow, false);
    assert(layout.panelTop >= layout.canvasBottom - 1, 'narrow screens place the list below the canvas');
    await page.screenshot({ path: '/private/tmp/illustslide-objects-390px.png' });
    assert.deepEqual(errors, []);
    console.log('illustSlide objects browser tests passed');
  } finally {
    await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
