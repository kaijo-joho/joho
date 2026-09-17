/* Verify direct-path additions, handle snapping, and stable coordinate applies. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = objects => {
  const document = C.createDocument();
  document.name = 'パス操作';
  document.pages[0].board = { width: 600, height: 420, unit: 'px', infinite: false };
  document.pages[0].objects = objects;
  return document;
};
const shape = (d, id = 'shape') => ({ ...C.makeShape('rect', 0, 0, 1, 1), id, name: id, d, style: { ...C.makeShape('rect', 0, 0, 1, 1).style, fill: '#93C5FD', stroke: '#172B4D', strokeWidth: 2 } });

async function run() {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const documentOf = () => page.evaluate(() => IlapoEditor.getDocument());
  const info = id => page.evaluate(id => IlapoPathEdit.inspect(IlapoEditor.getDocument().pages[0].objects.find(object => object.id === id)), id);
  const screen = point => page.evaluate(point => {
    const camera = IlapoEditor.getCamera(), rect = document.getElementById('canvas').getBoundingClientRect();
    return { x: rect.left + (point.x - camera.x) / camera.width * rect.width, y: rect.top + (point.y - camera.y) / camera.height * rect.height };
  }, point);
  const clickPoint = async (point, shift = false) => { const screenPoint = await screen(point); if (shift) await page.keyboard.down('Shift'); await page.mouse.click(screenPoint.x, screenPoint.y); if (shift) await page.keyboard.up('Shift'); await sleep(35); };
  const selectObject = async id => {
    await page.locator('#objects-toggle').click();
    await page.locator(`[data-pick-object="${id}"]`).click();
    await page.locator('#inspector-close').click();
    await page.locator('#canvas').focus();
    await page.keyboard.press('a');
    await sleep(35);
  };
  const openPathMenu = async action => {
    await page.locator('#path-menu-button').click();
    await page.locator(`#command-menu [data-action="${action}"]`).click();
    await sleep(35);
  };
  const load = async objects => {
    const document = fixture(objects);
    await page.locator('#file-input').setInputFiles({ name: 'path-workflow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
    await sleep(50);
    if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
    await page.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
    await selectObject(objects[0].id);
  };

  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.IlapoEditor);

    // The selection context bar exposes the three path operations only when
    // every selected object is a path, and each operation remains one undo.
    const left = shape('M80 100L180 100L180 200L80 200Z', 'left');
    const right = shape('M150 100L250 100L250 200L150 200Z', 'right');
    await load([left, right]);
    await clickPoint({ x: 200, y: 150 }, true);
    for (const action of ['union', 'subtract', 'intersect']) assert.equal(await page.locator(`#quick-${action}`).isVisible(), true, `${action} quick action is visible`);
    await page.screenshot({path:path.join(os.tmpdir(),'illustslide-quick-boolean-desktop.png')});
    const beforeBoolean = await documentOf();
    await page.locator('#quick-union').click(); await sleep(50);
    assert.equal((await documentOf()).pages[0].objects.length, 1);
    await page.keyboard.press('Meta+z'); await sleep(50);
    assert.deepEqual((await documentOf()).pages[0].objects.map(object => object.id), beforeBoolean.pages[0].objects.map(object => object.id));
    await selectObject('left');
    await page.setViewportSize({ width: 390, height: 736 }); await sleep(50);
    await page.screenshot({path:path.join(os.tmpdir(),'illustslide-quick-single-390.png')});
    const selectionBar = await page.locator('#selection-bar').boundingBox();
    assert(selectionBar.width <= 390, 'selection bar fits the narrow viewport');
    await page.setViewportSize({ width: 1280, height: 800 }); await sleep(50);

    // With no interval selected, the command starts a one-click insertion mode.
    await load([shape('M100 150L350 150')]);
    assert.equal(await page.locator('#quick-add-anchor').isVisible(), true);
    await page.locator('#quick-add-anchor').click(); await sleep(35);
    assert.equal(await page.locator('#quick-add-anchor').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#hint').textContent(), /追加するパスの輪郭/);
    const beforeAdd = await documentOf();
    await page.keyboard.press('Escape'); await sleep(35);
    assert.equal(await page.locator('#quick-add-anchor').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await documentOf(), beforeAdd, 'Escape cancels insertion without changing the path');
    assert.deepEqual(await page.evaluate(() => IlapoEditor.getSelection()), ['shape'], 'Escape retains the selected path');
    await page.locator('#quick-add-anchor').click(); await sleep(35);
    await clickPoint({ x: 450, y: 250 });
    assert.equal((await info('shape'))[0].segments.length, 2, 'empty space is not an insertion point');
    await clickPoint({ x: 220, y: 150 });
    assert.equal((await info('shape'))[0].segments.length, 3);
    assert.equal(await page.evaluate(() => IlapoEditor.getSelection().includes('shape')), true);
    assert.equal(await page.locator('#quick-add-anchor').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#quick-anchor-corner').isVisible(), true);
    assert.equal(await page.locator('#quick-anchor-smooth').isVisible(), true);
    await page.screenshot({path:path.join(os.tmpdir(),'illustslide-quick-anchor-desktop.png')});

    // A cubic handle uses the same grid as an anchor.  Option leaves it free
    // and preserves the opposite handle independently.
    await openPathMenu('anchor-smooth');
    const before = (await info('shape'))[0].segments[1];
    const start = await screen({ x: before.point.x + before.handleOut.x, y: before.point.y + before.handleOut.y });
    const target = await screen({ x: 287.4, y: 118.6 });
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 4 }); await page.mouse.up(); await sleep(45);
    let middle = (await info('shape'))[0].segments[1];
    assert.equal(middle.point.x + middle.handleOut.x, 287);
    assert.equal(middle.point.y + middle.handleOut.y, 119);
    const opposite = { ...middle.handleIn };
    const freeTarget = await screen({ x: 277.6, y: 108.6 });
    const currentHandle = await screen({ x: middle.point.x + middle.handleOut.x, y: middle.point.y + middle.handleOut.y });
    await page.keyboard.down('Alt'); await page.mouse.move(currentHandle.x, currentHandle.y); await page.mouse.down(); await page.mouse.move(freeTarget.x, freeTarget.y, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Alt'); await sleep(45);
    middle = (await info('shape'))[0].segments[1];
    const freePoint = { x: middle.point.x + middle.handleOut.x, y: middle.point.y + middle.handleOut.y };
    assert(Math.abs(freePoint.x - 277.6) < .2);
    assert(Math.abs(freePoint.y - 108.6) < .2);
    assert(Math.abs(freePoint.x - Math.round(freePoint.x)) > .05 || Math.abs(freePoint.y - Math.round(freePoint.y)) > .05, 'Option releases pixel absorption');
    assert.deepEqual(middle.handleIn, opposite);

    // Applying the same absolute coordinate twice is idempotent.
    await openPathMenu('anchor-position');
    await page.locator('#anchor-x').fill('230.25'); await page.locator('#anchor-y').fill('160.75'); await sleep(60);
    await page.locator('#anchor-x').fill('230.25'); await page.locator('#anchor-y').fill('160.75'); await sleep(60);
    middle = (await info('shape'))[0].segments[1];
    assert(Math.abs(middle.point.x - 230.25) < .01);
    assert(Math.abs(middle.point.y - 160.75) < .01);
    console.log('Ilapo path workflow regression passed');
  } finally {
    await context.close(); await browser.close();
    if (!supplied) await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
