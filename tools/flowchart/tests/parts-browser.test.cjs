/* Browser coverage for saved, reusable flowchart parts. */
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
const PARTS_SAVED = 'kaijo.flowchart.parts.saved.v1';
const clone = value => JSON.parse(JSON.stringify(value));

async function serve() {
  const root = path.resolve(__dirname, '..');
  const allowed = new Set(['index.html', 'core.js', 'output.js', 'render.js', 'parts.js','layout.js', 'editor.js', 'editor.css', 'storage.js', 'local-autosave.js', 'icon.svg']);
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
  const server = http.createServer(async (request, response) => {
    const file = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!allowed.has(file)) return response.writeHead(404).end();
    try { response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }); response.end(await fs.readFile(path.join(root, file))); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}

function fixture() {
  const doc = Core.createDocument('flowchart');
  doc.id = 'parts_browser_fixture'; doc.title = '部品セットの元図';
  const a = Core.createNode('process', 80, 120, { id:'part_a', text:'入力', locked:true, style:{fill:'#ffdd66',stroke:'#7c2d12',bold:true} });
  const b = Core.createNode('decision', 350, 280, { id:'part_b', text:'判定', style:{stroke:'#1d4ed8',fontSize:20} });
  const e = Core.createEdge({nodeId:a.id,side:'right',offset:.5},{nodeId:b.id,side:'left',offset:.25},{ id:'part_edge', kind:'orthogonal', locked:true, label:{text:'次へ',t:.3,dx:18,dy:-21}, waypoints:[{x:245,y:152},{x:245,y:330},{x:330,y:330}], style:{stroke:'#d946ef',dashed:true} });
  doc.nodes = [a, b]; doc.edges = [e]; doc.groups = [{id:'part_group',memberIds:[a.id,b.id,e.id]}];
  return doc;
}

const getDoc = page => page.evaluate(() => DiagramEditor.getDocument());
const partRecords = page => page.evaluate(() => ({ auto: localStorage.getItem('kaijo.flowchart.parts.auto.v1'), manual: localStorage.getItem('kaijo.flowchart.parts.saved.v1') }));
async function menu(page, id) { if (!await page.locator('#' + id).evaluate(el => el.open)) await page.locator('#' + id + ' > summary').click(); }
async function load(page, doc) {
  await page.locator('#file-input').setInputFiles({ name:'parts.diagram.json', mimeType:'application/json', buffer:Buffer.from(Core.serializeDocument(doc)) });
  await page.waitForFunction(() => document.getElementById('storage-open-dialog').open);
  await page.locator('[data-open-source="local-file"]').click();
  if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-continue').click();
  await page.waitForFunction(expected => JSON.stringify(DiagramEditor.getDocument()) === expected, JSON.stringify(Core.parseDocument(doc)));
}
async function select(page, ids) { await page.evaluate(ids => DiagramEditor.select(ids), ids); }
async function register(page, name) {
  await menu(page, 'edit-menu'); await page.locator('#register-part').click();
  await page.waitForFunction(() => document.getElementById('register-part-dialog').open);
  await page.locator('#register-part-name').fill(name);
  await page.locator('#register-part-form button[type=submit]').click();
  await page.waitForFunction(() => !document.getElementById('register-part-dialog').open);
}
function libraryFrom(raw) { return Parts.parseLibrary(JSON.parse(raw).library); }
async function bytes(download) {
  const stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function darkLargest(page) {
  await menu(page, 'settings-menu');
  await page.locator('#theme').selectOption('dark');
  await page.locator('#text-size').selectOption('largest');
  await page.locator('#settings-menu > summary').press('Escape');
}

async function registrationFromManualCandidate(browser, url) {
  const doc = fixture();
  const auto = Parts.add(Parts.emptyLibrary(), Parts.capture(doc, [doc.nodes[0].id], '自動側'));
  const manual = Parts.add(Parts.emptyLibrary(), Parts.capture(doc, [doc.nodes[1].id], '明示側'));
  const autoRaw = JSON.stringify({ savedAt:'2026-09-15T00:00:00.000Z', library:auto });
  const manualRaw = JSON.stringify({ savedAt:'2026-09-15T00:01:00.000Z', library:manual });
  const context = await browser.newContext({ viewport:{width:1280,height:820} });
  try {
    await context.addInitScript(values => { localStorage.setItem(values.autoKey, values.auto); localStorage.setItem(values.manualKey, values.manual); }, { autoKey:PARTS_AUTO, manualKey:PARTS_SAVED, auto:autoRaw, manual:manualRaw });
    const page = await context.newPage(); page.setDefaultTimeout(12000); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    await load(page, doc); const before = await getDoc(page); await select(page, [doc.nodes[0].id]); await menu(page, 'edit-menu'); await page.locator('#register-part').click();
    await page.waitForFunction(() => document.getElementById('parts-dialog').open);
    assert.equal(await page.locator('[data-parts-source="auto"]').count(), 1); assert.equal(await page.locator('[data-parts-source="manual"]').count(), 1);
    await page.locator('[data-parts-source="manual"]').click(); await page.waitForFunction(() => document.getElementById('register-part-dialog').open);
    assert.equal(await page.locator('#parts-dialog').isVisible(), false);
    await page.locator('#register-part-name').fill('明示側へ追加'); await page.locator('#register-part-form button[type=submit]').click();
    await page.waitForFunction(() => !!localStorage.getItem('kaijo.flowchart.parts.auto.v1'));
    assert.equal(await page.evaluate(key => localStorage.getItem(key), PARTS_SAVED), manualRaw, 'Choosing a manual baseline never changes its saved bytes');
    const chosen = libraryFrom(await page.evaluate(key => localStorage.getItem(key), PARTS_AUTO));
    assert.equal(chosen.items.length, 2); assert.ok(chosen.items.some(item => item.name === '明示側')); assert.ok(chosen.items.some(item => item.name === '明示側へ追加'));
    assert.deepEqual(await getDoc(page), before);
  } finally { await context.close(); }
}

async function desktop(browser, url, engine, artifacts) {
  const context = await browser.newContext({ viewport:{width:1280,height:820}, acceptDownloads:true });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = [], missing = []; page.on('pageerror', error => errors.push(error.message)); page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor && !!window.DiagramParts);
    const doc = fixture(); await load(page, doc); const sourceBefore = await getDoc(page);
    const normalBefore = await page.evaluate(() => ({ auto:localStorage.getItem('kaijo.diagram.recovery.v1'), manual:localStorage.getItem('kaijo.diagram.saved.v1') }));
    await select(page, [doc.nodes[0].id]);
    await register(page, '基本セット');
    await page.waitForFunction(() => !!localStorage.getItem('kaijo.flowchart.parts.auto.v1'));
    assert.deepEqual(await getDoc(page), sourceBefore, 'Registration never changes the diagram or its history baseline');
    assert.deepEqual(await page.evaluate(() => ({ auto:localStorage.getItem('kaijo.diagram.recovery.v1'), manual:localStorage.getItem('kaijo.diagram.saved.v1') })), normalBefore, 'Part registration never rewrites normal document storage');
    let records = await partRecords(page), library = libraryFrom(records.auto);
    assert.equal(library.items.length, 1); const originalPart = clone(library.items[0]);
    assert.equal(originalPart.name, '基本セット'); assert.equal(originalPart.selection.groups.length, 1);
    assert.deepEqual(originalPart.selection.edges[0].waypoints, doc.edges[0].waypoints);
    assert.deepEqual(originalPart.selection.edges[0].label, doc.edges[0].label);
    assert.deepEqual(originalPart.selection.edges[0].style, doc.edges[0].style);

    await darkLargest(page); await page.locator('#my-parts').click(); await page.waitForFunction(() => document.getElementById('parts-dialog').open);
    await page.screenshot({ path:path.join(artifacts, `${engine}-wide-dark-largest.png`) });
    assert.equal(await page.locator('[data-part-id]').count(), 1);
    await page.locator('[data-part-id]').click(); assert.equal(await page.locator('#part-preview svg').count(), 1);
    await page.locator('#part-name').fill('改名したセット'); await page.locator('#part-name-form').press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-part-id] strong')?.textContent === '改名したセット');
    records = await partRecords(page); library = libraryFrom(records.auto); assert.equal(library.items[0].name, '改名したセット');
    await page.locator('#delete-part').click(); assert.equal(await page.locator('#delete-part-confirm').isVisible(), true); await page.locator('#cancel-delete-part').click();
    assert.equal(await page.locator('[data-part-id]').count(), 1, 'Delete cancellation retains the set');

    let pending = page.waitForEvent('download'); await page.locator('#export-part').click(); const oneDownload = await pending;
    assert.match(oneDownload.suggestedFilename(), /\.flowparts\.json$/); assert.equal(Parts.parseLibrary(await bytes(oneDownload)).items.length, 1);
    pending = page.waitForEvent('download'); await page.locator('#parts-save-file').click(); const allDownload = await pending;
    assert.match(allDownload.suggestedFilename(), /\.flowparts\.json$/); assert.equal(Parts.parseLibrary(await bytes(allDownload)).items.length, 1);
    await page.locator('#parts-save-browser').click(); await page.waitForFunction(() => !!localStorage.getItem('kaijo.flowchart.parts.saved.v1'));
    records = await partRecords(page); assert.equal(libraryFrom(records.manual).items[0].name, '改名したセット');

    const beforePlaceLibrary = clone(libraryFrom(records.auto));
    const undoBeforePlace = await page.locator('#undo').isDisabled(), redoBeforePlace = await page.locator('#redo').isDisabled();
    await page.locator('#place-part').click(); assert.equal(await page.locator('#parts-dialog').isVisible(), false);
    await page.locator('#canvas').press('Escape'); assert.deepEqual(await getDoc(page), sourceBefore, 'Escape cancels part placement without editing');
    assert.equal(await page.locator('#undo').isDisabled(), undoBeforePlace); assert.equal(await page.locator('#redo').isDisabled(), redoBeforePlace);
    await page.locator('#my-parts').click(); await page.waitForFunction(() => document.getElementById('parts-dialog').open); await page.locator('#place-part').click();
    const canvasBox = await page.locator('#canvas').boundingBox(); await page.mouse.click(canvasBox.x + canvasBox.width * .55, canvasBox.y + canvasBox.height * .5);
    await page.waitForFunction(count => DiagramEditor.getDocument().nodes.length === count, sourceBefore.nodes.length + 2);
    const mousePlaced = await getDoc(page); await page.locator('#undo').click(); assert.deepEqual(await getDoc(page), sourceBefore); await page.locator('#redo').click(); assert.deepEqual(await getDoc(page), mousePlaced); await page.locator('#undo').click();
    await page.locator('#my-parts').click(); await page.waitForFunction(() => document.getElementById('parts-dialog').open); await page.locator('#place-part').click();
    await page.locator('#canvas').press('Enter'); await page.waitForFunction(count => DiagramEditor.getDocument().nodes.length === count, sourceBefore.nodes.length + 2);
    const placed = await getDoc(page), pastedNodes = placed.nodes.filter(node => !sourceBefore.nodes.some(source => source.id === node.id)), pastedEdges = placed.edges.filter(edge => !sourceBefore.edges.some(source => source.id === edge.id));
    assert.equal(pastedNodes.length, 2); assert.equal(pastedEdges.length, 1);
    assert.ok(pastedNodes.every(node => !node.locked) && !pastedEdges[0].locked, 'Placed parts are editable copies');
    assert.ok(pastedNodes.every(node => !sourceBefore.nodes.some(source => source.id === node.id)) && !sourceBefore.edges.some(edge => edge.id === pastedEdges[0].id));
    assert.deepEqual({ x:pastedNodes[1].x-pastedNodes[0].x, y:pastedNodes[1].y-pastedNodes[0].y }, { x:originalPart.selection.nodes[1].x-originalPart.selection.nodes[0].x, y:originalPart.selection.nodes[1].y-originalPart.selection.nodes[0].y });
    assert.deepEqual(pastedEdges[0].waypoints.map((point, index) => ({ x:point.x-pastedNodes[0].x, y:point.y-pastedNodes[0].y })), originalPart.selection.edges[0].waypoints.map(point => ({ x:point.x-originalPart.selection.nodes[0].x, y:point.y-originalPart.selection.nodes[0].y })));
    assert.deepEqual(libraryFrom((await partRecords(page)).auto), beforePlaceLibrary, 'Placement never alters the saved library');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(page), sourceBefore, 'One Undo reverses a complete part placement');
    await page.locator('#redo').click(); assert.deepEqual(await getDoc(page), placed, 'One Redo restores the complete part placement');

    await page.locator('#my-parts').click(); await page.waitForFunction(() => document.getElementById('parts-dialog').open);
    const sourceLibrary = libraryFrom((await partRecords(page)).auto), beforeImport = clone(sourceLibrary), autoBeforeBadImport = (await partRecords(page)).auto;
    await page.locator('#parts-file-input').setInputFiles({ name:'invalid.flowparts.json', mimeType:'application/json', buffer:Buffer.from('{broken') });
    await page.waitForFunction(() => !document.getElementById('parts-error').hidden);
    assert.deepEqual(libraryFrom((await partRecords(page)).auto), beforeImport); assert.deepEqual(await getDoc(page), placed);
    await page.locator('#parts-file-input').setInputFiles({ name:'copy.flowparts.json', mimeType:'application/json', buffer:Buffer.from(Parts.serializeLibrary(sourceLibrary)) });
    await page.waitForFunction(() => document.querySelectorAll('[data-part-id]').length === 2);
    library = libraryFrom((await partRecords(page)).auto); assert.equal(library.items.length, 2); assert.ok(library.items.some(item => item.name === '改名したセット (2)'));
    assert.notEqual((await partRecords(page)).auto, autoBeforeBadImport, 'A valid import writes only the parts automatic key');
    await page.locator('[data-part-id]').first().click(); await page.locator('#delete-part').click(); await page.locator('#confirm-delete-part').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-part-id]').length === 1);
    assert.equal(libraryFrom((await partRecords(page)).auto).items.length, 1);

    const stable = await partRecords(page); await page.locator('#parts-open-saved').click();
    await page.waitForFunction(() => document.querySelector('[data-parts-source="auto"]'));
    assert.equal(await page.locator('[data-parts-source="manual"]').count(), 1);
    await page.keyboard.press('Escape'); assert.deepEqual(await partRecords(page), stable, 'Viewing candidates then cancelling does not write either library snapshot');
    await page.locator('#my-parts').click(); await page.waitForFunction(() => document.getElementById('parts-dialog').open);
    await page.locator('#parts-open-saved').click(); await page.locator('[data-parts-source="manual"]').click();
    assert.equal(await page.locator('[data-part-id]').count(), 1, 'Manual snapshot can be restored from candidates');
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  } finally { await context.close(); }
}

async function corruptAndFailure(browser, url) {
  const doc = fixture();
  const corrupt = await browser.newContext({ viewport:{width:1280,height:820} });
  try {
    await corrupt.addInitScript(values => { localStorage.setItem(values.auto, '{broken'); localStorage.setItem(values.manual, values.manualRaw); }, { auto:PARTS_AUTO, manual:PARTS_SAVED, manualRaw:JSON.stringify({savedAt:'not-a-date',library:{}}) });
    const page = await corrupt.newPage(); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor); const before = await getDoc(page), raw = await partRecords(page);
    await page.locator('#my-parts').click(); await page.waitForFunction(() => document.getElementById('parts-dialog').open);
    assert.equal(await page.locator('[data-parts-source="empty"]').count(), 1); assert.equal(await page.locator('#parts-error').isVisible(), true);
    await page.keyboard.press('Escape'); assert.deepEqual(await getDoc(page), before); assert.deepEqual(await partRecords(page), raw, 'Corrupt snapshots are reported and left untouched');
  } finally { await corrupt.close(); }

  const failing = await browser.newContext({ viewport:{width:1280,height:820} });
  try {
    await failing.addInitScript(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('容量不足', 'QuotaExceededError'); return original.call(this, name, value); }; }, PARTS_AUTO);
    const page = await failing.newPage(); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor); await load(page, doc); const before = await getDoc(page);
    await select(page, [doc.nodes[0].id]); await register(page, '保存失敗');
    assert.equal(await page.locator('[data-part-id]').count(), 1, 'The in-memory library remains usable after automatic storage failure');
    assert.equal(await page.locator('#notice').isVisible(), true); assert.match(await page.locator('#notice').textContent(), /保存に失敗/); assert.equal(await page.evaluate(key => localStorage.getItem(key), PARTS_AUTO), null);
    assert.deepEqual(await getDoc(page), before);
  } finally { await failing.close(); }
}

async function mobile(browser, url, engine, artifacts) {
  const doc = fixture(), item = Parts.capture(doc, [doc.nodes[0].id], 'タップ用');
  const library = Parts.add(Parts.emptyLibrary(), item);
  const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true });
  try {
    await context.addInitScript(value => localStorage.setItem('kaijo.flowchart.parts.auto.v1', value), JSON.stringify({savedAt:'2026-09-15T00:00:00.000Z',library}));
    const page = await context.newPage(); page.setDefaultTimeout(12000); const errors=[]; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    if (await page.locator('#toolbar-toggle').isVisible() && await page.locator('#toolbar-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#toolbar-toggle').tap();
    await page.locator('#settings-menu > summary').tap(); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape');
    await page.locator('#my-parts').tap(); await page.waitForFunction(() => document.getElementById('parts-dialog').open); await page.locator('[data-parts-source="auto"]').tap();
    const dialog = await page.locator('#parts-dialog').boundingBox(); assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= 390 && dialog.y >= 0 && dialog.y + dialog.height <= 844);
    await page.screenshot({ path:path.join(artifacts, `${engine}-narrow-dark-largest.png`) });
    for (const id of ['place-part','rename-part','delete-part','export-part','parts-import','parts-save-browser','parts-save-file']) { const box = await page.locator('#' + id).boundingBox(); assert.ok(box.height >= 44, `${id} is a touch-sized target`); }
    await page.locator('#parts-list [data-part-id]').tap(); await page.locator('#parts-dialog').press('Escape'); assert.equal(await page.locator('#my-parts').evaluate(el => el === document.activeElement), true);
    await page.locator('#my-parts').tap(); await page.locator('#place-part').tap(); await page.locator('#canvas').press('Enter');
    await page.waitForFunction(() => DiagramEditor.getDocument().nodes.length === 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

(async () => {
  const hosting = await serve();
  const artifacts = path.join(os.tmpdir(), 'joho-flowchart-parts-browser'); await fs.mkdir(artifacts, { recursive:true });
  try {
    for (const engine of process.argv.includes('--chrome-only') ? ['chromium'] : ['chromium', 'webkit']) {
      const browser = await pw[engine].launch(engine === 'chromium' ? {channel:'chrome',headless:true} : {headless:true});
      try { await desktop(browser, hosting.url, engine, artifacts); await registrationFromManualCandidate(browser, hosting.url); await corruptAndFailure(browser, hosting.url); await mobile(browser, hosting.url, engine, artifacts); console.log(`${engine}: reusable parts registration, storage, placement, import and touch passed`); }
      finally { await browser.close(); }
    }
  } finally { await hosting.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
