const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const Core = require('../core.js');

let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const ALLOWED = new Set(['index.html', 'core.js', 'render.js', 'output.js', 'parts.js','layout.js','transitions.js', 'editor.js', 'editor.css', 'storage.js', 'local-autosave.js', 'icon.svg']);
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };

async function serve() {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (request, response) => {
    const file = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!ALLOWED.has(file)) return response.writeHead(404).end();
    try {
      response.writeHead(200, { 'Content-Type':`${TYPES[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
      response.end(await fs.readFile(path.join(root, file)));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url:`http://127.0.0.1:${server.address().port}/`, close:() => new Promise(resolve => server.close(resolve)) };
}

function fixture({ long = false } = {}) {
  const doc = Core.createDocument();
  doc.title = '重なり順の確認';
  const node = (id, text, options = {}) => Core.createNode('process', options.x ?? 240, options.y ?? 160, { id, text, ...options });
  const back = node('stack_back', '背面');
  const middle = node('stack_middle', '中間');
  const front = node('stack_front', '前面');
  const fixed = node('stack_fixed', '固定', { locked:true });
  const groupA = node('stack_group_a', 'グループA', { x:250, y:185 });
  const groupB = node('stack_group_b', 'グループB', { x:260, y:195 });
  const far = node('stack_far', '遠方', { x:1200, y:700 });
  const edge = Core.createEdge({ nodeId:back.id }, { nodeId:front.id }, { id:'stack_edge', label:{ text:'重なる線', dx:0, dy:0 } });
  doc.nodes = [back, middle, front, fixed, groupA, groupB, far];
  if (long) for (let index = 0; index < 14; index += 1) doc.nodes.splice(6, 0, node(`stack_long_${index}`, `候補 ${index + 1} — 長い候補名を表示してスクロールを確認します`));
  doc.edges = [edge];
  doc.groups = [{ id:'stack_group', memberIds:[groupA.id, groupB.id] }];
  return doc;
}

const getDocument = page => page.evaluate(() => DiagramEditor.getDocument());
const order = doc => doc.nodes.map(node => node.id);

async function load(page, doc) {
  await page.locator('#file-input').setInputFiles({ name:'stacking.diagram.json', mimeType:'application/json', buffer:Buffer.from(Core.serializeDocument(doc)) });
  await page.waitForFunction(() => document.getElementById('storage-open-dialog').open);
  await page.locator('[data-open-source="local-file"]').click();
  if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-continue').click();
  await page.waitForFunction(expected => JSON.stringify(DiagramEditor.getDocument()) === expected, JSON.stringify(Core.parseDocument(doc)));
}

async function select(page, ids) { await page.evaluate(values => DiagramEditor.select(values), ids); }
async function menu(page, id) {
  const toolbar = page.locator('.toolbar'), target = page.locator(`#${id}`);
  if (await toolbar.getAttribute('data-compact') === 'true') {
    const needsToolbar = await target.evaluate(element => !!element.closest('#toolbar-options'));
    const expanded = await page.locator('#toolbar-toggle').getAttribute('aria-expanded') === 'true';
    if (needsToolbar !== expanded) await page.locator('#toolbar-toggle').click();
  }
  if (!await page.locator(`#${id}`).evaluate(element => element.open)) await page.locator(`#${id} > summary`).click();
}
async function openOrder(page) { await menu(page, 'order-menu'); }
async function chooseOverlap(page) {
  await openOrder(page);
  await page.locator('#choose-overlap').click();
  await page.waitForFunction(() => document.getElementById('overlap-dialog').open);
}
async function darkLargest(page) {
  await menu(page, 'settings-menu');
  await page.locator('#theme').selectOption('dark');
  await page.locator('#text-size').selectOption('largest');
  await page.locator('#settings-menu > summary').press('Escape');
}
async function visible(locator, label) {
  const box = await locator.boundingBox();
  const viewport = await locator.evaluate(() => ({ width:innerWidth, height:innerHeight }));
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, label);
}

async function checkOrderControls(page) {
  const cases = {
    front:{ selected:'stack_back', order:'stack_middle,stack_front,stack_fixed,stack_group_a,stack_group_b,stack_far,stack_back' },
    forward:{ selected:'stack_back', order:'stack_middle,stack_back,stack_front,stack_fixed,stack_group_a,stack_group_b,stack_far' },
    backward:{ selected:'stack_front', order:'stack_back,stack_front,stack_middle,stack_fixed,stack_group_a,stack_group_b,stack_far' },
    back:{ selected:'stack_front', order:'stack_front,stack_back,stack_middle,stack_fixed,stack_group_a,stack_group_b,stack_far' }
  };
  for (const [action, expected] of Object.entries(cases)) {
    const doc = fixture();
    await load(page, doc); await select(page, [expected.selected]); await openOrder(page);
    assert.equal(await page.locator(`[data-node-order="${action}"]`).isDisabled(), false, `${action} is available`);
    await page.locator(`[data-node-order="${action}"]`).click();
    assert.equal(order(await getDocument(page)).join(','), expected.order);
    if (action === 'front') {
      assert.equal(await page.locator('[data-node-order="front"]').isDisabled(), true);
      assert.equal(await page.locator('[data-node-order="forward"]').isDisabled(), true);
    }
    await page.locator('#undo').click(); assert.deepEqual(await getDocument(page), doc, `${action} undo is atomic`);
    await page.locator('#redo').click(); assert.equal(order(await getDocument(page)).join(','), expected.order, `${action} redo restores order`);
  }

  const doc = fixture();
  await load(page, doc); await select(page, ['stack_far']); await openOrder(page);
  assert.equal(await page.locator('[data-node-order="front"]').isDisabled(), true);
  assert.equal(await page.locator('[data-node-order="forward"]').isDisabled(), true);
  const before = await getDocument(page); await page.locator('[data-node-order="front"]').click({ force:true });
  assert.deepEqual(await getDocument(page), before, 'A disabled boundary action does not create a history state');

  await select(page, ['stack_group_a']); await openOrder(page);
  assert.match(await page.locator('#selection-status').textContent(), /1グループ・2図形/);
  await page.locator('[data-node-order="front"]').click();
  assert.deepEqual(order(await getDocument(page)).slice(-2), ['stack_group_a', 'stack_group_b'], 'A group keeps member order while it moves');
}

async function checkPicker(page) {
  const doc = fixture();
  await load(page, doc); await select(page, ['stack_back']);
  const before = await getDocument(page), undo = await page.locator('#undo').isDisabled();
  await chooseOverlap(page);
  const candidates = await page.locator('[data-overlap-id]').evaluateAll(buttons => buttons.map(button => button.dataset.overlapId));
  assert.ok(candidates.indexOf('stack_front') < candidates.indexOf('stack_middle'), 'Candidates are listed from front to back');
  assert.ok(candidates.includes('stack_fixed'));
  assert.equal(candidates.includes('stack_far'), false, 'Distant nodes are not candidates');
  await page.locator('[data-overlap-id="stack_front"]').press('Enter');
  await page.waitForFunction(() => !document.getElementById('overlap-dialog').open && document.querySelector('#order-menu > summary') === document.activeElement);
  assert.deepEqual(await getDocument(page), before, 'Picking changes selection only');
  assert.equal(await page.locator('#undo').isDisabled(), undo, 'Picking does not change history');

  await chooseOverlap(page); await page.locator('#overlap-add').check(); await page.locator('[data-overlap-id="stack_middle"]').click();
  assert.match(await page.locator('#selection-status').textContent(), /2図形/);
  await chooseOverlap(page); await page.locator('[data-overlap-id="stack_fixed"]').click();
  assert.match(await page.locator('#selection-status').textContent(), /固定/);
  await openOrder(page);
  for (const action of ['front', 'forward', 'backward', 'back']) assert.equal(await page.locator(`[data-node-order="${action}"]`).isDisabled(), true, 'A fixed picked item cannot be reordered');

  await select(page, ['stack_group_a']); await chooseOverlap(page);
  assert.match(await page.locator('[data-overlap-id="stack_group_b"]').textContent(), /グループ/);
  await page.locator('[data-overlap-id="stack_group_b"]').click();
  assert.match(await page.locator('#selection-status').textContent(), /1グループ・2図形/);
}

async function checkSavedAndOutputOrder(page) {
  const doc = fixture();
  await load(page, doc); await select(page, ['stack_back']); await openOrder(page); await page.locator('[data-node-order="front"]').click();
  const changed = await getDocument(page), expected = order(changed);
  const download = page.waitForEvent('download'); await page.locator('#file-menu > summary').click(); await page.locator('#save-file').click();
  const saved = await download; const file = path.join(os.tmpdir(), 'joho-flowchart-stacking.diagram.json'); await saved.saveAs(file);
  assert.deepEqual(order(Core.parseDocument(await fs.readFile(file, 'utf8'))), expected);
  await load(page, Core.parseDocument(await fs.readFile(file, 'utf8')));
  assert.deepEqual(order(await getDocument(page)), expected, 'Downloaded JSON reload keeps the order');

  const markup = await page.evaluate(() => ({ canvas:document.getElementById('scene').innerHTML, exported:DiagramEditor.exportSVG() }));
  const canvas = expected.map(id => markup.canvas.indexOf(`data-node="${id}"`));
  assert.ok(canvas.every(index => index >= 0)); assert.deepEqual([...canvas].sort((a, b) => a - b), canvas, 'Canvas DOM paints nodes in document order');
  assert.ok(markup.canvas.indexOf('data-edge="stack_edge"') < canvas[0], 'Arrows remain below nodes');
  assert.ok(markup.exported.indexOf('stack_edge') < markup.exported.indexOf('背面'), 'Export SVG keeps the arrow layer below nodes');

  await menu(page, 'file-menu'); await page.locator('#print-button').click(); await page.waitForFunction(() => document.getElementById('print-dialog').open);
  const printed = await page.locator('#print-sheet svg').innerHTML();
  const printedNodes = expected.map(id => printed.indexOf(changed.nodes.find(node => node.id === id).text));
  assert.ok(printedNodes.every(index => index >= 0)); assert.deepEqual([...printedNodes].sort((a, b) => a - b), printedNodes, 'Print SVG keeps node order');
  await page.locator('#print-dialog [data-close-dialog]').click();
}

async function checkNarrowTouch(browser, url) {
  const context = await browser.newContext({ viewport:{ width:390, height:844 }, hasTouch:true });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(12000); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor); await darkLargest(page); await load(page, fixture({ long:true }));
    await select(page, ['stack_back']); await openOrder(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'The narrow toolbar does not create horizontal overflow');
    assert.equal(await page.locator('.toolbar').evaluate(toolbar => toolbar.getBoundingClientRect().height <= 60), true, 'The toolbar remains one line');
    for (const selector of ['#order-menu > summary', '[data-node-order="front"]', '#choose-overlap']) {
      const box = await page.locator(selector).boundingBox(); assert.ok(box.width >= 43 && box.height >= 43, `${selector} has a touch target`);
    }
    await page.locator('#choose-overlap').tap(); await page.waitForFunction(() => document.getElementById('overlap-dialog').open);
    const dialog = page.locator('#overlap-dialog'), body = dialog.locator('.dialog-body'), title = dialog.locator('#overlap-title'), close = dialog.locator('[data-close-dialog]');
    assert.equal(await body.count(), 1); await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await visible(title, 'Overlap title remains visible while the list scrolls'); await visible(close, 'Overlap close action remains visible while the list scrolls');
    await page.locator('[data-overlap-id="stack_front"]').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await visible(title, 'Overlap title remains visible during keyboard navigation'); await visible(close, 'Overlap close action remains visible during keyboard navigation');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('overlap-dialog').open && document.querySelector('#order-menu > summary') === document.activeElement);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function checkMediumViewport(browser, url) {
  const context = await browser.newContext({ viewport:{ width:736, height:844 } });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(12000); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor); await darkLargest(page); await load(page, fixture({ long:true }));
    await select(page, ['stack_back']); await openOrder(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 736), true, 'The 736px toolbar does not create horizontal overflow');
    assert.equal(await page.locator('.toolbar').evaluate(toolbar => toolbar.getBoundingClientRect().height <= 60), true, 'The 736px toolbar remains one line');
    await page.locator('#choose-overlap').click(); await page.waitForFunction(() => document.getElementById('overlap-dialog').open);
    const dialog = page.locator('#overlap-dialog'), body = dialog.locator('.dialog-body');
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await visible(dialog.locator('#overlap-title'), 'The 736px overlap title remains visible');
    await visible(dialog.locator('[data-close-dialog]'), 'The 736px overlap close action remains visible');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('overlap-dialog').open && document.querySelector('#order-menu > summary') === document.activeElement);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function run() {
  const hosting = await serve();
  try {
    const browser = await playwright.chromium.launch({ channel:'chrome', headless:true });
    try {
      const context = await browser.newContext({ viewport:{ width:1280, height:736 }, acceptDownloads:true });
      try {
        const page = await context.newPage(); page.setDefaultTimeout(12000); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(hosting.url); await page.waitForFunction(() => !!window.DiagramEditor);
        await checkOrderControls(page); await checkPicker(page); await checkSavedAndOutputOrder(page);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
      await checkMediumViewport(browser, hosting.url); await checkNarrowTouch(browser, hosting.url);
      console.log('chromium: stacking order, picker, save/export/print order, history and 1280/736/390 UI passed');
    } finally { await browser.close(); }
  } finally { await hosting.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
