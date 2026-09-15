/* Chrome-only regression coverage for scrollable, keyboard-safe workspace dialogs. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const Core = require('../core.js');
const Parts = require('../parts.js');
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const PARTS_AUTO = 'kaijo.flowchart.parts.auto.v1';

async function serve() {
  const root = path.resolve(__dirname, '..');
  const allowed = new Set(['index.html', 'core.js', 'output.js', 'render.js', 'parts.js','layout.js', 'editor.js', 'editor.css', 'storage.js', 'local-autosave.js', 'icon.svg']);
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
  const server = http.createServer(async (request, response) => {
    const file = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!allowed.has(file)) return response.writeHead(404).end();
    try { response.writeHead(200, { 'Content-Type':`${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }); response.end(await fs.readFile(path.join(root, file))); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url:`http://127.0.0.1:${server.address().port}/`, close:() => new Promise(resolve => server.close(resolve)) };
}

function fixture() {
  const doc = Core.createDocument('flowchart');
  doc.title = '操作性の確認';
  doc.lesson = { studentMode:false, instructions:'問題文の確認。'.repeat(400) };
  const a = Core.createNode('process', 80, 90, { id:'usability_a', text:'入力', style:{fill:'#ffdd66'} });
  const b = Core.createNode('decision', 440, 320, { id:'usability_b', text:'判定' });
  const edge = Core.createEdge({nodeId:a.id,side:'right',offset:.5},{nodeId:b.id,side:'left',offset:.5},{id:'usability_edge',label:{text:'次へ'},waypoints:[{x:260,y:122},{x:260,y:370}]});
  doc.nodes = [a,b]; doc.edges = [edge]; return doc;
}

async function load(page, doc) {
  await page.locator('#file-input').setInputFiles({ name:'usability.diagram.json', mimeType:'application/json', buffer:Buffer.from(Core.serializeDocument(doc)) });
  await page.waitForFunction(() => document.getElementById('storage-open-dialog').open);
  await page.locator('[data-open-source="local-file"]').click();
  if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-continue').click();
  await page.waitForFunction(expected => JSON.stringify(DiagramEditor.getDocument()) === expected, JSON.stringify(Core.parseDocument(doc)));
}

async function openCompactToolbar(page) {
  const toolbar = page.locator('.toolbar');
  if (await toolbar.getAttribute('data-compact') === 'true' && await page.locator('#toolbar-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#toolbar-toggle').click();
}
async function menu(page, id) { await openCompactToolbar(page); if (!await page.locator('#' + id).evaluate(element => element.open)) await page.locator('#' + id + ' > summary').click(); }
async function darkLargest(page) { await menu(page, 'settings-menu'); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape'); }
async function visibleInViewport(locator, label) {
  const box = await locator.boundingBox();
  const viewport = await locator.evaluate(() => ({ width:innerWidth, height:innerHeight }));
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${label} must be initially visible in the viewport`);
}
async function activeId(page) { return page.evaluate(() => document.activeElement?.id || ''); }
async function tabsKeepChromeVisible(page, dialog, title, footerAction) {
  const body = dialog.locator('.dialog-body');
  assert.equal(await body.count(), 1, 'The dialog must have one dedicated scroll body');
  const scroll = await body.evaluate(element => ({ scrollHeight:element.scrollHeight, clientHeight:element.clientHeight, overflow:getComputedStyle(element).overflowY }));
  assert.ok(['auto','scroll'].includes(scroll.overflow), 'The body must expose vertical scrolling');
  if (scroll.scrollHeight > scroll.clientHeight) {
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.ok(await body.evaluate(element => element.scrollTop > 0), 'Long dialog content can scroll independently');
  }
  await visibleInViewport(title, 'Dialog title after body scroll'); await visibleInViewport(footerAction, 'Dialog action after body scroll');
  const focusable = body.locator('input:not([disabled]),select:not([disabled]),button:not([disabled])').first();
  await focusable.focus();
  for (let index = 0; index < 5; index += 1) { await page.keyboard.press('Tab'); await visibleInViewport(title, 'Dialog title after Tab'); await visibleInViewport(footerAction, 'Dialog action after Tab'); }
  for (let index = 0; index < 5; index += 1) { await page.keyboard.press('Shift+Tab'); await visibleInViewport(title, 'Dialog title after Shift+Tab'); await visibleInViewport(footerAction, 'Dialog action after Shift+Tab'); }
}

async function partsDialog(page) {
  await page.locator('#my-parts').click(); await page.waitForFunction(() => document.getElementById('parts-dialog').open);
  if (await page.locator('#parts-candidates').isVisible()) {
    await page.locator('[data-parts-source="auto"]').click();
    await page.waitForFunction(() => !document.getElementById('parts-candidates').offsetParent);
  }
  const dialog = page.locator('#parts-dialog'), title = dialog.locator('h2').first(), close = dialog.locator('.dialog-layout > .dialog-actions [data-close-dialog]');
  await visibleInViewport(title, 'Parts title'); await visibleInViewport(close, 'Parts close action');
  await page.screenshot({path:path.join(os.tmpdir(), `joho-flowchart-parts-polish-${page.viewportSize().width}.png`)});
  await tabsKeepChromeVisible(page, dialog, title, close);
  assert.equal(await page.locator('#export-part').textContent(), 'このセットをファイルに保存');
  const pending = page.waitForEvent('download'); await page.locator('#export-part').click(); const download = await pending;
  assert.match(download.suggestedFilename(), /\.flowparts\.json$/);
  const stream = await download.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Parts.parseLibrary(Buffer.concat(chunks).toString()).items.length, 1);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('parts-dialog').open && document.activeElement?.id === 'my-parts'); assert.equal(await activeId(page), 'my-parts');
}

async function printDialog(page) {
  await menu(page, 'file-menu'); await page.locator('#print-button').click(); await page.waitForFunction(() => document.getElementById('print-dialog').open);
  const dialog = page.locator('#print-dialog'), title = dialog.locator('h2').first(), submit = dialog.locator('.dialog-layout > .dialog-actions #print-submit');
  await visibleInViewport(title, 'Print title'); await visibleInViewport(submit, 'Print action');
  const labels = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
    const dialog = document.getElementById('print-dialog');
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby'));
    const drawings = [...document.querySelectorAll('#print-sheet svg,#print-preview svg')];
    return { duplicates:ids.filter((id,index) => ids.indexOf(id)!==index), dialog:heading?.textContent,
      drawingNames:drawings.map(svg => { const title=document.getElementById(svg.getAttribute('aria-labelledby').split(' ')[0]); return svg.contains(title)?title.textContent:null; }) };
  });
  assert.deepEqual(labels.duplicates,[]); assert.equal(labels.dialog,'印刷プレビュー');
  assert.ok(labels.drawingNames.length>=2); assert.ok(labels.drawingNames.every(name=>name==='操作性の確認'));
  await page.screenshot({path:path.join(os.tmpdir(), `joho-flowchart-print-polish-${page.viewportSize().width}.png`)});
  await tabsKeepChromeVisible(page, dialog, title, submit);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('print-dialog').open && document.querySelector('#file-menu > summary') === document.activeElement);
  const focus = await page.evaluate(() => ({ id:document.activeElement?.id || '', tag:document.activeElement?.tagName || '', compact:document.querySelector('.toolbar')?.dataset.compact || '' }));
  assert.equal(await page.locator('#file-menu > summary').evaluate(element => element === document.activeElement), true, `Escape returns focus to the print dialog invoker (${JSON.stringify(focus)})`);
}

async function checkViewport(browser, url, viewport, hasTouch) {
  const doc = fixture();
  const part = Parts.capture(doc, [doc.nodes[0].id], '操作用セット');
  const library = Parts.add(Parts.emptyLibrary(), part);
  const context = await browser.newContext({ viewport, hasTouch, acceptDownloads:true });
  try {
    await context.addInitScript(value => localStorage.setItem('kaijo.flowchart.parts.auto.v1', value), JSON.stringify({savedAt:'2026-09-15T00:00:00.000Z',library}));
    const page = await context.newPage(); page.setDefaultTimeout(12000); const errors=[]; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    if (hasTouch && await page.locator('#toolbar-toggle').isVisible() && await page.locator('#toolbar-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#toolbar-toggle').tap();
    await darkLargest(page); await load(page, doc);
    await partsDialog(page); await printDialog(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

(async () => {
  const hosting = await serve();
  try {
    const browser = await pw.chromium.launch({channel:'chrome',headless:true});
    try {
      for (const [width, hasTouch] of [[1280,false],[736,false],[390,true]]) await checkViewport(browser, hosting.url, {width,height:844}, hasTouch);
      console.log('chromium: workspace dialog title, footer, scroll, keyboard and part export passed at 1280/736/390');
    } finally { await browser.close(); }
  } finally { await hosting.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
