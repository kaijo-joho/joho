/* Exercise direct selection through the same file input and controls used by students. */
'use strict';
const {openView,revealObject,startPresentation}=require('./ui-helpers.cjs');
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
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, ''), file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain'); res.end(await fs.readFile(file)); } catch { res.writeHead(404).end(); }
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const near = (a, b, tolerance = .001) => assert(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const fixture = objects => { const doc = C.createDocument(); doc.name = 'パス実習'; doc.pages[0].board = { width: 600, height: 420, unit: 'px', infinite: false }; doc.pages[0].objects = objects; return doc; };
const shape = (d, id = 'shape') => ({ ...C.makeShape('rect', 0, 0, 1, 1), id, name: id, d, style: { ...C.makeShape('rect', 0, 0, 1, 1).style, fill: '#93C5FD', stroke: '#172B4D', strokeWidth: 2 } });

async function run() {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const documentOf = () => page.evaluate(() => IlapoEditor.getDocument());
  const info = id => page.evaluate(id => IlapoPathEdit.inspect(IlapoEditor.getDocument().pages[0].objects.find(o => o.id === id)), id);
  const screen = point => page.evaluate(p => { const c = IlapoEditor.getCamera(), r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left + (p.x - c.x) / c.width * r.width, y: r.top + (p.y - c.y) / c.height * r.height }; }, point);
  const clickPoint = async (p, shift = false) => { const q = await screen(p); if (shift) await page.keyboard.down('Shift'); await page.mouse.click(q.x, q.y); if (shift) await page.keyboard.up('Shift'); await sleep(35); };
  const submit = async () => { await page.locator('#dialog-submit').click(); await page.waitForFunction(() => !document.getElementById('dialog').open); };
  const inspectorSubmit = async () => {
    const submitButton = page.locator('#inspector-submit');
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await page.waitForFunction(() => { const panel = document.getElementById('inspector-panel'); return panel && !panel.hidden && !document.getElementById('dialog').open; });
    } else await page.evaluate(() => new Promise(resolve => queueMicrotask(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  };
  const inspectorClose = async () => { await page.locator('#inspector-close').click(); await page.waitForFunction(() => document.getElementById('inspector-panel').hidden); await sleep(50); };
  const menu = async action => {
    const pathButton = page.locator('#path-menu-button');
    if (await pathButton.isVisible()) await pathButton.click();
    else { await page.locator('#selection-more').click(); await page.locator('#command-menu [data-action="selection-path"]').click(); }
    await page.locator(`#command-menu [data-action="${action}"]`).click(); await sleep(40);
  };
  const pick = async id => { await page.locator('#objects-toggle').click(); await (await revealObject(page,id)).click(); await page.locator("#inspector-close").click(); await sleep(35); };
  async function load(objects) {
    const document = fixture(objects);
    await page.locator('#file-input').setInputFiles({ name: 'practice.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
    await sleep(50); if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
    await page.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
    await page.locator('#canvas').focus(); await page.keyboard.press('a'); await sleep(40);
  }
  async function choose(indices) {
    await menu('anchor-list');
    const inputs = page.locator('[data-anchor-pick]');
    for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).setChecked(indices.includes(i));
    await submit(); await sleep(30);
  }
  async function moveNode(id, index, to, options = {}) {
    const from = (await info(id))[0].segments[index].point, a = await screen(from), b = await screen(to);
    if (options.alt) await page.keyboard.down('Alt');
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 });
    if (options.preview) await options.preview();
    await page.mouse.up(); if (options.alt) await page.keyboard.up('Alt'); await sleep(50);
  }
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    assert.equal(await page.evaluate(() => IlapoEditor.getState().tool), 'direct', 'direct selection is the default');
    const rect = shape('M100 100L250 100L250 240L100 240Z');
    rect.matrix = [1.1, .1, .15, .9, 5, 10];
    await load([rect]); await pick('shape');
    const before = await documentOf(), first = (await info('shape'))[0].segments[1].point;
    await moveNode('shape', 1, { x: first.x + 24, y: first.y - 17 }, { alt: true, preview: async () => assert.deepEqual(await documentOf(), before, 'drag preview does not mutate saved document') });
    const moved = await documentOf(); assert.deepEqual(moved.pages[0].objects[0].matrix, rect.matrix);
    let after = (await info('shape'))[0].segments[1].point; near(after.x, first.x + 24); near(after.y, first.y - 17);
    await page.keyboard.press('Meta+z'); await sleep(40); assert.deepEqual(await documentOf(), before, 'one undo restores entire drag');
    await page.keyboard.press('Meta+Shift+z'); await sleep(40); assert.deepEqual(await documentOf(), moved);
    await pick('shape'); await choose([0, 1]);
    const pointsBefore = (await info('shape'))[0].segments;
    await page.locator('#canvas').focus(); await page.keyboard.press('ArrowDown'); await sleep(40);
    const pointsAfter = (await info('shape'))[0].segments;
    near(pointsAfter[0].point.y, pointsBefore[0].point.y + 1); near(pointsAfter[1].point.y, pointsBefore[1].point.y + 1); near(pointsAfter[2].point.y, pointsBefore[2].point.y);
    // A canceled multi-point drag preserves both geometry and selected anchors.
    const cancelledBefore = await documentOf(), q = await screen(pointsAfter[0].point);
    await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 30, q.y + 20); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await documentOf(), cancelledBefore); assert.equal((await page.evaluate(() => IlapoEditor.getAnchors())).length, 2);

    await load([shape('M100 150L350 150')]); await pick('shape');
    await clickPoint({ x: 220, y: 150 }); await menu('anchor-add');
    let points = (await info('shape'))[0].segments; assert.equal(points.length, 3); near(points[1].point.x, 220);
    await menu('anchor-smooth'); points = (await info('shape'))[0].segments;
    assert(Math.hypot(points[1].handleOut.x, points[1].handleOut.y) > 0);
    const oldIn = points[1].handleIn, handle = points[1].handleOut, origin = points[1].point;
    const fromHandle = await screen({ x: origin.x + handle.x, y: origin.y + handle.y }), toHandle = await screen({ x: origin.x + 35, y: origin.y - 30 });
    await page.keyboard.down('Alt'); await page.mouse.move(fromHandle.x, fromHandle.y); await page.mouse.down(); await page.mouse.move(toHandle.x, toHandle.y, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Alt'); await sleep(40);
    points = (await info('shape'))[0].segments; near(points[1].handleIn.x, oldIn.x); near(points[1].handleIn.y, oldIn.y); near(points[1].handleOut.y, -30);
    await menu('anchor-position'); assert(await page.locator('#inspector-panel').isVisible(), 'anchor coordinates use the non-modal inspector'); assert(await page.locator('#canvas').isVisible(), 'canvas remains visible while anchor coordinates are open'); await page.locator('#anchor-x').fill('230.25'); await page.locator('#anchor-y').fill('160.75'); await inspectorSubmit(); await inspectorClose();
    points = (await info('shape'))[0].segments; near(points[1].point.x, 230.25); near(points[1].point.y, 160.75);

    // Water drop: a kite, only the three lower corners rounded.
    await load([shape('M250 80L360 250L250 330L140 250Z', 'drop')]); await pick('drop'); await choose([1, 2, 3]);
    await menu('anchor-round'); await page.locator('#corner-radius').fill('35'); await submit();
    points = (await info('drop'))[0].segments; assert.equal(points.length, 7); assert(points.some(p => Math.abs(p.point.x - 250) < .001 && Math.abs(p.point.y - 80) < .001));
    assert(points.some(p => Math.hypot(p.handleOut.x, p.handleOut.y) > 0));

    // Two circles can be united, cut open, joined, and edited again after ZIP recovery.
    const c1 = C.makeShape('ellipse', 120, 120, 150, 150), c2 = C.makeShape('ellipse', 220, 120, 150, 150); c1.id = 'c1'; c2.id = 'c2';
    await load([c1, c2]); await page.keyboard.press('v'); await clickPoint({ x: 165, y: 195 }); await clickPoint({ x: 325, y: 195 }, true); await menu('path-union');
    let doc = await documentOf(); assert.equal(doc.pages[0].objects.length, 1); assert.equal(doc.pages[0].objects[0].id, 'c1'); assert.match(doc.pages[0].objects[0].d, /[Cc]/);
    points = (await info('c1'))[0].segments;
    const lower = points.map((s, index) => ({ index, y: s.point.y })).filter(s => s.y > 245).map(s => s.index);
    assert(lower.length > 0); await choose(lower); await page.locator('#canvas').focus(); await page.keyboard.press('Backspace'); await sleep(40);
    let paths = await info('c1'); assert.equal(paths.length, 1); assert.equal(paths[0].closed, false);
    await choose([0, paths[0].segments.length - 1]); await menu('path-join'); await page.locator('#join-mode').selectOption('line'); await submit();
    assert.equal((await info('c1'))[0].closed, true);
    await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }));
    await page.locator('[data-menu="save"]').click(); const zipEvent = page.waitForEvent('download'); await page.locator('#command-menu [data-action="save-local"]').click();
    const zip = await zipEvent, zipPath = '/private/tmp/illustslide-path-roundtrip.zip'; await zip.saveAs(zipPath); const beforeZip = await documentOf();
    await page.locator('#file-input').setInputFiles(zipPath); await sleep(100); assert.deepEqual(await documentOf(), beforeZip, 'curves and IDs survive actual local ZIP round trip');
    await pick('c1'); await choose([0]); await page.locator('#canvas').focus(); await page.keyboard.press('ArrowRight'); await sleep(40);
    assert.notEqual((await documentOf()).pages[0].objects[0].d, beforeZip.pages[0].objects[0].d);

    // Snap to another path at an arbitrary non-grid position; the paths stay separate.
    // Disable the pixel/grid lattice explicitly to test free path-to-path placement.
    await openView(page); await page.locator('#view-pixel').uncheck(); await page.locator('#view-snap').uncheck(); await inspectorSubmit(); await inspectorClose();
    const source = shape('M100 120L180 120', 'source'), target = shape('M300 100L300 320', 'target'); target.style.fill = 'none';
    await load([source, target]); await pick('source');
    await moveNode('source', 1, { x: 301.5, y: 213.25 }, { preview: async () => assert.equal(await page.locator('#snap-target').count(), 1) });
    points = (await info('source'))[0].segments; near(points[1].point.x, 300); near(points[1].point.y, 213.25); assert.equal((await documentOf()).pages[0].objects.length, 2);
    await moveNode('source', 1, { x: 301.5, y: 218.25 }, { alt: true }); points = (await info('source'))[0].segments; near(points[1].point.x, 301.5);

    await openView(page);
    assert(await page.locator('#inspector-panel').isVisible(), 'view settings use the non-modal inspector'); await page.locator('#view-anchor').uncheck(); await page.locator('#view-path').uncheck(); await page.locator('#view-snap').check(); await page.locator('#view-step').fill('20'); await inspectorSubmit(); await inspectorClose();
    await moveNode('source', 1, { x: 305.3, y: 227.8 }); points = (await info('source'))[0].segments; near(points[1].point.x, 300); near(points[1].point.y, 220);
    await openView(page);
    await page.locator('#view-snap').uncheck(); await page.locator('#view-pixel').check(); await inspectorSubmit(); await inspectorClose();
    await moveNode('source', 1, { x: 307.3, y: 225.8 }); points = (await info('source'))[0].segments; near(points[1].point.x, 307); near(points[1].point.y, 226);

    // Escape closes only the popover, retaining selection; dialog focus returns to its visible opener.
    const selectedBeforeMenu = await page.evaluate(() => IlapoEditor.getSelection());
    await page.locator('#path-menu-button').click(); await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => IlapoEditor.getSelection()), selectedBeforeMenu);
    await menu('anchor-list'); await page.keyboard.press('Escape'); await sleep(30);
    assert.equal(await page.locator('#path-menu-button').evaluate(el => el === document.activeElement), true);

    // Export controls exercise the page-wide null selection branch and PDF iframe route.
    await page.locator('.side-tab [data-action="export-toggle"]').click(); const pngEvent = page.waitForEvent('download'); await page.locator('[data-action="export-png"]').click();
    const png = await pngEvent; assert.match(png.suggestedFilename(), /\.png$/);
    await page.locator('.side-tab [data-action="export-toggle"]').click();
    await page.screenshot({ path: '/private/tmp/illustslide-path-desktop.png' });
    await page.setViewportSize({ width: 390, height: 736 }); await openView(page); assert(await page.locator('#inspector-panel').isVisible()); assert(await page.locator('#canvas').isVisible()); await page.locator('#view-theme').selectOption('dark'); await page.locator('#view-size').selectOption('xlarge'); await inspectorSubmit();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert(await page.evaluate(() => document.getElementById('inspector-panel').scrollWidth <= innerWidth)); await inspectorClose();
    await menu('anchor-list'); await page.screenshot({ path: '/private/tmp/illustslide-path-mobile.png' });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#dialog').evaluate(el => el.open), false);
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true });
    const touch = await touchContext.newPage();
    try {
      await touch.goto(url); await touch.waitForFunction(() => !!window.IlapoEditor);
      const doc = fixture([shape('M150 100L350 100L350 300L150 300Z', 'touch-shape')]);
      await touch.locator('#file-input').setInputFiles({ name: 'touch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
      await touch.waitForFunction(id => IlapoEditor.getDocument().id === id, doc.id);
      await touch.locator('#objects-toggle').tap(); await touch.locator('[data-pick-object="touch-shape"]').tap(); await touch.locator('#inspector-close').tap();
      const rect = await touch.locator('[data-node]').first().boundingBox(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const cdp = await touchContext.newCDPSession(touch);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 24, y: y + 32 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.waitForFunction(old => IlapoEditor.getDocument().pages[0].objects[0].d !== old, doc.pages[0].objects[0].d);
      assert.equal((await touch.evaluate(() => IlapoEditor.getAnchors())).length, 1);
      assert(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await touchContext.close(); }
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('Ilapo path UI regression passed');
  } finally { await context.close(); await browser.close(); if (!supplied) await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
