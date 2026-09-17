/* アイコン・部品を右パネルで配置・登録・管理するChrome回帰。 */
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
  const doc = C.createDocument(); doc.id = 'assets-panel'; doc.name = '部品パネルの確認';
  doc.pages[0].board = { width: 640, height: 400, unit: 'px', infinite: false };
  const source = C.makeShape('rect', 100, 110, 150, 90, { fill: '#2563EB' }); source.id = 'source'; source.name = '送信元';
  const target = C.makeShape('ellipse', 360, 170, 120, 90, { fill: '#22C55E' }); target.id = 'target'; target.name = '送信先';
  doc.pages[0].objects = [source, target];
  return doc;
}
async function load(page, document) {
  await page.locator('#file-input').setInputFiles({ name: 'assets-panel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
  await settle(page);
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    await page.evaluate(() => localStorage.removeItem('kaijo-ilapo:components'));
    const original = fixture(); await load(page, original);

    await page.locator('#assets-toggle').click(); await settle(page);
    assert(await page.locator('#inspector-panel').isVisible());
    assert.equal(await page.locator('#assets-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('[data-insert-icon]').count(), 10, 'all built-in icons are available');
    assert(await page.locator('#components-register').isDisabled(), 'nothing selected cannot be registered');
    await page.locator('#pages-toggle').click(); await settle(page);
    assert.equal(await page.locator('#assets-toggle').getAttribute('aria-expanded'), 'false', 'right panels are exclusive');
    await page.locator('#assets-toggle').click(); await settle(page);

    const beforeIcon = await read(page);
    await page.locator('[data-insert-icon="pc"]').click(); await settle(page);
    assert.equal((await read(page)).pages[0].objects.length, beforeIcon.pages[0].objects.length + 1, 'icon insertion changes the document');
    await page.locator('#inspector-canvas').click(); await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(page), beforeIcon, 'one Undo removes icon insertion');

    await page.locator('#canvas').focus(); await page.keyboard.press('v');
    await page.locator('#artwork [data-object="source"]').click(); await settle(page);
    assert.match(await page.locator('#component-registration-target').textContent(), /1/);
    assert(await page.locator('#component-registration-preview img').isVisible());
    assert.equal(await page.locator('#components-register').isDisabled(), false);
    const beforeRegister = await read(page);
    await page.locator('#component-name').fill('送信元カード');
    await page.locator('#components-register').click(); await settle(page);
    assert.deepEqual(await read(page), beforeRegister, 'registration does not change the document or history');
    assert.equal(await page.locator('#component-name').inputValue(), '');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'component-name', 'registration returns focus to the name field');
    assert.equal(await page.locator('[data-insert-component]').count(), 1);
    const libraryAfterRegister = await page.evaluate(() => localStorage.getItem('kaijo-ilapo:components'));
    assert.match(libraryAfterRegister, /送信元カード/);
    const componentId = await page.locator('[data-insert-component]').first().getAttribute('data-insert-component');
    await page.screenshot({ path: '/private/tmp/illustslide-assets-desktop.png' });

    await page.locator('[data-insert-component]').click(); await settle(page);
    const afterInsert = await read(page);
    assert.equal(afterInsert.pages[0].objects.length, beforeRegister.pages[0].objects.length + 1, 'registered component can be inserted while open');
    await page.locator('#inspector-canvas').click(); await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(page), beforeRegister, 'component insertion is one Undo');

    await page.locator('#canvas').focus(); await page.keyboard.press('v'); await page.locator('#artwork [data-object="source"]').click(); await settle(page);
    await page.locator('#component-name').fill('移動中も保持する名前');
    await page.locator('#inspector-canvas').click(); await page.keyboard.press('ArrowRight'); await settle(page);
    assert.equal(await page.locator('#component-name').inputValue(), '移動中も保持する名前', 'moving the same selection keeps the name');
    await page.locator('#canvas').focus(); await page.locator('#artwork [data-object="target"]').click(); await settle(page);
    assert.equal(await page.locator('#component-name').inputValue(), '', 'a new selection resets the component name');
    await page.locator('#component-name').fill('Enterで登録');
    const beforeEnter = await read(page);
    await page.keyboard.press('Enter'); await settle(page);
    assert.deepEqual(await read(page), beforeEnter, 'Enter in the name field does not edit the canvas');
    assert.equal(await page.locator('[data-insert-component]').count(), 2, 'Enter registers the component');
    await page.locator('#component-name').fill('Deleteを入力');
    await page.keyboard.press('Delete');
    assert.deepEqual(await read(page), beforeEnter, 'editing the name cannot delete canvas objects');

    const beforeRemoval = await read(page);
    await page.locator(`[data-remove-component="${componentId}"]`).click();
    assert(await page.locator('#dialog').evaluate(element => element.open));
    await page.locator('#dialog-cancel').click(); await settle(page);
    assert.equal(await page.locator('[data-insert-component]').count(), 2, 'cancel keeps the component');
    await page.locator(`[data-remove-component="${componentId}"]`).click(); await page.locator('#dialog-submit').click(); await settle(page);
    assert.equal(await page.locator('[data-insert-component]').count(), 1, 'confirmed removal updates the library');
    assert.deepEqual(await read(page), beforeRemoval, 'removing a library entry preserves placed objects');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.insertComponent), await page.locator('[data-insert-component]').first().getAttribute('data-insert-component'), 'removal focuses the remaining component');

    const downloadPromise = page.waitForEvent('download'); await page.locator('#components-export').click();
    const download = await downloadPromise, exported = await fs.readFile(await download.path(), 'utf8');
    assert.match(exported, /kaijo-ilapo-components/);
    await page.locator('#components-input').setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await page.waitForFunction(() => document.querySelectorAll('[data-insert-component]').length === 2); await settle(page);
    assert(await page.locator('#inspector-panel').isVisible(), 'import refreshes the already-open panel');
    const beforeInvalid = await page.locator('[data-insert-component]').count();
    await page.locator('#components-input').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-insert-component]').count(), beforeInvalid, 'invalid import keeps the library');
    await page.locator('#inspector-close').click(); await settle(page);
    await page.locator('#components-input').setInputFiles({ name: 'background-import.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('kaijo-ilapo:components')).components.length === 3);
    assert.equal(await page.locator('#inspector-panel').isVisible(), false, 'an import finishing after close does not reopen the panel');

    await page.locator('#board-toggle').click(); await page.locator('#view-toggle').click();
    await page.locator('#view-theme').selectOption('dark'); await page.locator('#view-size').selectOption('xlarge'); await settle(page);
    await page.setViewportSize({ width: 390, height: 736 }); await page.locator('#assets-toggle').click(); await settle(page);
    assert.equal(await page.locator('#component-name').inputValue(), '', 'reopening the panel resets the unfinished name');
    const layout = await page.evaluate(() => {
      const panel = document.getElementById('inspector-panel').getBoundingClientRect();
      const canvas = document.getElementById('canvas').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, panelTop: panel.top, canvasBottom: canvas.bottom };
    });
    assert.equal(layout.overflow, false);
    assert(layout.panelTop >= layout.canvasBottom - 1, '390px places the assets panel below the canvas');
    await page.screenshot({ path: '/private/tmp/illustslide-assets-390.png' });

    // 登録に失敗しても、入力・作品・既存部品を壊さない。
    const edgeContext = await browser.newContext({ viewport: { width: 1000, height: 720 } });
    try {
      const edge = await edgeContext.newPage(), edgeErrors = [];
      edge.on('pageerror', error => edgeErrors.push(error.message)); edge.setDefaultTimeout(10000);
      await edge.goto(url); await edge.waitForFunction(() => !!window.IlapoEditor);
      await edge.evaluate(() => localStorage.removeItem('kaijo-ilapo:components'));
      await load(edge, fixture()); await edge.locator('#assets-toggle').click();
      await edge.locator('#canvas').focus(); await edge.keyboard.press('v'); await edge.locator('#artwork [data-object="source"]').click(); await settle(edge);
      await edge.locator('#component-name').fill('保存済みの部品');
      await edge.locator('#components-register').click(); await settle(edge);
      const libraryBeforeQuota = await edge.evaluate(() => localStorage.getItem('kaijo-ilapo:components'));
      const beforeQuota = await read(edge);
      await edge.locator('#component-name').fill('失敗後も残す名前');
      await edge.evaluate(() => {
        window.__componentSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'kaijo-ilapo:components') throw new DOMException('quota', 'QuotaExceededError');
          return window.__componentSetItem.call(this, key, value);
        };
      });
      await edge.locator('#components-register').click(); await settle(edge);
      assert.equal(await edge.locator('#component-name').inputValue(), '失敗後も残す名前');
      assert.deepEqual(await read(edge), beforeQuota, 'quota failure preserves the document');
      assert.equal(await edge.locator('[data-insert-component]').count(), 1, 'quota failure preserves the old library');
      assert.equal(await edge.evaluate(() => localStorage.getItem('kaijo-ilapo:components')), libraryBeforeQuota, 'stored components remain byte-identical');
      assert(await edge.locator('#components-error').isVisible(), 'quota failure is shown in the panel');
      await edge.evaluate(() => { Storage.prototype.setItem = window.__componentSetItem; delete window.__componentSetItem; });
      await edge.locator('#components-register').click(); await settle(edge);
      assert.equal(await edge.locator('[data-insert-component]').count(), 2, 'registration succeeds once storage recovers');

      const png = await edge.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
        canvas.getContext('2d').fillRect(0, 0, 2, 2);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await edge.locator('#image-input').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await edge.waitForFunction(() => IlapoEditor.getDocument().pages[0].objects.some(object => object.type === 'image' && object.reference)); await settle(edge);
      assert(await edge.locator('#components-register').isDisabled(), 'a selection containing a reference image cannot be registered');
      assert.match(await edge.locator('#component-registration-target').textContent(), /下絵/);

      await edge.evaluate(() => localStorage.setItem('kaijo-ilapo:components', '{broken'));
      await edge.locator('#inspector-close').click(); await edge.locator('#assets-toggle').click(); await settle(edge);
      assert(await edge.locator('#components-error').isVisible(), 'corrupt library is explained');
      assert.equal(await edge.locator('[data-insert-icon]').count(), 10, 'built-in icons remain available with a corrupt library');
      const beforeIconWithCorruptLibrary = await read(edge);
      await edge.locator('[data-insert-icon="person"]').click(); await settle(edge);
      assert.equal((await read(edge)).pages[0].objects.length, beforeIconWithCorruptLibrary.pages[0].objects.length + 1, 'icons can still be inserted with a corrupt library');
      assert.deepEqual(edgeErrors, []);
    } finally { await edgeContext.close(); }
    assert.deepEqual(errors, []);
    console.log('illustSlide assets panel browser tests passed');
  } finally {
    await context.close(); await browser.close(); if (!supplied) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
