/* Run: node tools/illustslide/tests/browser.test.cjs [http://127.0.0.1:port/illustslide/] */
'use strict';
const {openView,revealObject,startPresentation}=require('./ui-helpers.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

async function serve() {
  const root = path.resolve(__dirname, '../..');
  const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.md': 'text/plain' };
  const server = http.createServer(async (req, res) => {
    const requestPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let relative = requestPath.replace(/^\/+/, '') || 'illustslide/index.html';
    if (relative.endsWith('/')) relative += 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }); res.end(data); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/illustslide/`, close: () => new Promise(resolve => server.close(resolve)) };
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function menu(page, selector, label) {
  await page.locator(selector).click();
  await page.locator('#command-menu').getByRole('button', { name: label, exact: true }).click();
}
async function dialogSubmit(page) { await page.locator('#dialog-submit').click(); await page.waitForFunction(() => !document.getElementById('dialog').open); }
async function inspectorSubmit(page) {
  const submit = page.locator('#inspector-submit');
  if (await submit.isVisible()) {
    await submit.click();
    await page.waitForFunction(() => { const panel = document.getElementById('inspector-panel'); return panel && !panel.hidden && !document.getElementById('dialog').open; });
  } else {
    await page.evaluate(() => new Promise(resolve => queueMicrotask(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  }
}
async function inspectorClose(page) { await page.locator('#inspector-close').click(); await page.waitForFunction(() => document.getElementById('inspector-panel').hidden); }
async function documentOf(page) { return page.evaluate(() => window.IlapoEditor.getDocument()); }
async function addShape(page, kind, x, y, drag) {
  await page.locator(`[data-tool="${kind}"]`).click();
  const canvas = page.locator('#canvas');
  if (drag) await canvas.dragTo(canvas, { sourcePosition: { x, y }, targetPosition: { x: x + drag[0], y: y + drag[1] } });
  else await canvas.click({ position: { x, y } });
  await page.waitForFunction(() => window.IlapoEditor.getDocument().pages[0].objects.length > 0);
  await page.keyboard.press('v'); // V は統合選択内で全体操作を明示する。
  await page.waitForFunction(() => {
    const id = IlapoEditor.getSelection()[0];
    return IlapoEditor.getState().tool === 'select' && [...document.querySelectorAll('[data-object]')].some(el => el.dataset.object === id) && document.querySelector('[data-handle="se"]');
  });
}
async function selectObject(page, id, additive) {
  await page.locator(`[data-object="${id}"]`).click({ modifiers: additive ? ['Shift'] : [] });
  await page.waitForFunction(expected => window.IlapoEditor.getSelection().includes(expected), id);
}
async function selectTwo(page, ids) { await selectObject(page, ids[0]); await selectObject(page, ids[1], true); }
async function setTextSelection(page, start, end) {
  await page.locator('#text-input').evaluate((el, pair) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node, at = 0, a, b, ao, bo;
    while ((node = walker.nextNode())) { const next = at + node.data.length; if (!a && pair[0] >= at && pair[0] <= next) { a = node; ao = pair[0] - at; } if (!b && pair[1] >= at && pair[1] <= next) { b = node; bo = pair[1] - at; } at = next; }
    const range = document.createRange(), selection = getSelection(); range.setStart(a || el, a ? ao : 0); range.setEnd(b || el, b ? bo : 0); selection.removeAllRanges(); selection.addRange(range);
  }, [start, end]);
}

async function run() {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  const hosting = supplied ? { url: supplied, close: async () => {} } : await serve();
  const artifacts = '/private/tmp/illustslide-browser'; await fs.mkdir(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], failed = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  try {
    await page.goto(hosting.url); await page.waitForFunction(() => !!window.IlapoEditor && !!window.IlapoSVG);
    assert.equal((await documentOf(page)).pages[0].board.width, 1280, 'fixture starts in 16:9');

    await addShape(page, 'rect', 250, 170, [100, 70]);
    let doc = await documentOf(page), rect = doc.pages[0].objects[0], rectId = rect.id;
    const beforeMove = structuredClone(rect);
    const target = page.locator(`[data-object="${rectId}"]`);
    await target.waitFor({ state: 'visible' }); const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 5 }); await page.mouse.up();
    doc = await documentOf(page); assert.notDeepEqual(doc.pages[0].objects[0].matrix, beforeMove.matrix, 'pointer move changes the object matrix'); const moved = structuredClone(doc);
    const resize = page.locator('[data-handle="se"]'); const resizeBox = await resize.boundingBox();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2); await page.mouse.down(); await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 35, resizeBox.y + resizeBox.height / 2 + 20, { steps: 4 }); await page.mouse.up();
    const resized = await documentOf(page); assert.notDeepEqual(resized.pages[0].objects[0].matrix, doc.pages[0].objects[0].matrix, 'selection handle resizes');
    await page.locator('[data-action="undo"]').click(); doc = await documentOf(page); assert.deepEqual(doc.pages[0].objects[0].matrix, moved.pages[0].objects[0].matrix, 'undo restores the pre-resize matrix');
    await page.locator('[data-action="redo"]').click(); doc = await documentOf(page); assert.deepEqual(doc.pages[0].objects[0].matrix, resized.pages[0].objects[0].matrix, 'redo restores resize');

    await page.locator('[data-tool="text"]').click(); await page.locator('#canvas').click({ position: { x: 520, y: 240 } });
    await page.locator('#text-input').fill('日本語\nH2O');
    await setTextSelection(page, 4, 5); await page.locator('[data-script="sub"]').click();
    await setTextSelection(page, 5, 6); await page.locator('[data-script="super"]').click(); await inspectorSubmit(page); await inspectorClose(page);
    doc = await documentOf(page); const text = doc.pages[0].objects.find(object => object.type === 'text'); assert.match(text.runs.map(run => run.text).join(''), /日本語\nH2O/); assert(text.runs.some(run => run.script === 'sub') && text.runs.some(run => run.script === 'super'));
    await selectObject(page, text.id); await page.locator('[data-menu="edit"]').click(); await page.locator('#command-menu').getByRole('button', { name: '文字を編集…', exact: true }).click(); assert.equal(await page.locator('#text-input').textContent(), '日本語\nH2O'); await inspectorSubmit(page); await inspectorClose(page);

    await selectObject(page, rectId); await page.locator('[data-action="style"]').click();
    assert(await page.locator('#inspector-panel').isVisible(), 'style settings use the non-modal inspector'); assert(await page.locator('#canvas').isVisible(), 'canvas remains visible while style settings are open');
    await page.locator('#color-hex').fill('#112233');
    await inspectorSubmit(page); doc = await documentOf(page); assert.equal(doc.pages[0].objects.find(object => object.id === rectId).style.fill, '#112233', '16進数の色入力は選択中の色へ反映する'); await inspectorClose(page);
    await page.locator('[data-menu="edit"]').click(); await page.locator('#command-menu').getByRole('button', { name: '書式をコピー', exact: true }).click();
    await addShape(page, 'ellipse', 700, 330, [80, 55]); doc = await documentOf(page); const ellipse = doc.pages[0].objects.at(-1);
    await selectObject(page, ellipse.id); await page.locator('[data-menu="edit"]').click(); await page.locator('#command-menu').getByRole('button', { name: '書式を適用', exact: true }).click();
    assert.equal((await documentOf(page)).pages[0].objects.find(object => object.id === ellipse.id).style.fill, '#112233', 'style copy applies full selected style');

    await selectTwo(page, [rectId, ellipse.id]); await page.locator('[data-menu="edit"]').click(); await page.locator('#command-menu').getByRole('button', { name: 'グループ化', exact: true }).click();
    doc = await documentOf(page); assert.equal(new Set(doc.pages[0].objects.filter(object => [rectId, ellipse.id].includes(object.id)).map(object => object.group)).size, 1, 'two selected shapes form a flat group');
    await page.locator('[data-menu="edit"]').click(); await page.locator('#command-menu').getByRole('button', { name: 'グループ解除', exact: true }).click();
    await page.locator('#selection-arrange').click(); await page.locator('#command-menu').getByRole('button', { name: '幅をそろえる', exact: true }).click();

    await page.locator('[data-action="pages"]').first().click(); await page.locator('[data-page-command="add"]').click(); assert.equal((await documentOf(page)).pages.length, 2);
    await page.locator('[data-action="pages"]').first().click(); await page.locator('[data-page-command="duplicate"]').click(); assert.equal((await documentOf(page)).pages.length, 3);
    await page.locator('[data-page-move="2,-1"]').click(); assert.equal((await documentOf(page)).pages.length, 3, 'pages can be reordered');
    await inspectorClose(page);

    await page.locator('#board-toggle').click(); await page.locator('#board-preset').selectOption('18'); await inspectorSubmit(page); doc = await documentOf(page); let currentId = await page.evaluate(() => IlapoEditor.getState().pageId); let current = doc.pages.find(p => p.id === currentId); assert.equal(current.board.width, 18); await inspectorClose(page);
    await page.locator('#board-toggle').click(); await page.locator('#board-preset').selectOption('a4'); await inspectorSubmit(page); doc = await documentOf(page); currentId = await page.evaluate(() => IlapoEditor.getState().pageId); current = doc.pages.find(p => p.id === currentId); assert(Math.abs(current.board.width - 210 * 96 / 25.4) < 1e-6, 'A4 preset uses CSS-pixel width'); await inspectorClose(page);
    await page.locator('[data-action="pages"]').first().click(); await page.locator('[data-page-pick="0"]').click();

    await menu(page, '[data-menu="save"]', 'ブラウザに保存');
    await sleep(520); const slots = await page.evaluate(() => [localStorage.getItem('kaijo-ilapo:auto'), localStorage.getItem('kaijo-ilapo:saved')]); assert(slots[0] && slots[1], 'browser auto and explicit saves are independent');

    await page.locator('.side-tab [data-action="export-toggle"]').click(); const svgDownloadPromise = page.waitForEvent('download'); await page.locator('[data-action="export-svg"]').click(); const svgDownload = await svgDownloadPromise;
    const svgPath = path.join(artifacts, 'illustslide-export.svg'); await svgDownload.saveAs(svgPath); const svg = await fs.readFile(svgPath, 'utf8'); assert.match(svg, /<svg[\s>]/); assert.match(svg, /<path|<text/);
    const beforeImport = (await documentOf(page)).pages.length; await page.locator('#file-input').setInputFiles({ name: 'roundtrip.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) }); await page.waitForFunction(count => IlapoEditor.getDocument().pages.length === count + 1, beforeImport);

    await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
    await page.locator('[data-menu="save"]').click(); const zipDownloadPromise = page.waitForEvent('download'); await page.locator('#command-menu').getByRole('button', { name: 'ローカルファイルに保存…', exact: true }).click(); const zipDownload = await zipDownloadPromise;
    assert.match(zipDownload.suggestedFilename(), /\.illustslide\.zip$/, 'project download uses the official filename');
    const zipPath = path.join(artifacts, 'illustslide-roundtrip.illustslide.zip'); await zipDownload.saveAs(zipPath); const zip = await fs.readFile(zipPath); assert(zip.length > 100, 'ZIP export has contents');
    await page.locator('#file-input').setInputFiles({ name: 'roundtrip.ilapo.zip', mimeType: 'application/zip', buffer: zip });
    if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
    await page.waitForFunction(() => IlapoEditor.getDocument().pages.length >= 3);

    for (const width of [1280, 736, 390]) { await page.setViewportSize({ width, height: 736 }); await openView(page); await page.locator('#view-theme').selectOption('dark'); await page.locator('#view-size').selectOption('xlarge'); await inspectorSubmit(page); assert(await page.locator('#inspector-panel').isVisible(), `${width}px keeps the view inspector available`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${width}px has no document horizontal overflow`); await inspectorClose(page); }
    await page.screenshot({ path: path.join(artifacts, 'illustslide-dark-mobile.png'), fullPage: true });
    await page.locator('#help-button').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.getElementById('operation-help').hidden); await page.keyboard.press('Escape'); assert.equal(await page.locator('#help-button').evaluate(el => document.activeElement === el), true, 'Escape returns focus to help opener');
    await page.setViewportSize({ width: 390, height: 736 }); await page.locator('#canvas').focus(); await page.keyboard.press('Tab');
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true }); const touch = await touchContext.newPage();
    await touch.goto(hosting.url); await touch.waitForFunction(() => !!window.IlapoEditor); await touch.locator('#palette-toggle').tap(); await touch.locator('#shape-tools [data-tool="rect"]').tap(); await touch.locator('#canvas').tap({ position: { x: 185, y: 250 } });
    await touch.waitForFunction(() => IlapoEditor.getDocument().pages[0].objects.length === 1); assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'touch viewport has no horizontal overflow'); await touchContext.close();
    assert.equal(errors.length, 0, errors.join('\n')); assert.equal(failed.length, 0, failed.join('\n'));
    console.log('Ilapo browser UI regression tests passed');
  } finally {
    await context.close(); await browser.close(); await hosting.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
