/* URL migration, browser-save continuity, file:// recovery and ZIP filename compatibility. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(file);
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
function fixture(name, kind) {
  const document = C.createDocument();
  document.name = name;
  document.pages[0].objects.push(C.makeShape(kind, 10, 20, 50, 60));
  return document;
}
const automatic = fixture('以前の自動保存', 'rect'), explicit = fixture('以前の明示保存', 'ellipse');
const slots = {
  'kaijo-ilapo:auto': JSON.stringify({ kind: 'auto', at: '2026-09-16T09:01:00.000Z', document: automatic }),
  'kaijo-ilapo:saved': JSON.stringify({ kind: 'saved', at: '2026-09-16T09:00:00.000Z', document: explicit })
};
async function openCommand(page, menu, action) {
  await page.locator(`[data-menu="${menu}"]`).click();
  await page.locator(`#command-menu [data-action="${action}"]`).click();
}
async function loadFile(page, file, expected) {
  await page.locator('#file-input').setInputFiles(file);
  await page.waitForFunction(name => IlapoEditor.getDocument().name === name, expected.name);
  assert.deepEqual(await page.evaluate(() => IlapoEditor.getDocument()), expected);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const artifacts = await fs.mkdtemp('/private/tmp/illustslide-migration-');
  const errors = [], failed = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 736 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
    await page.goto(origin + '/tools/index.html');
    assert.equal(await page.locator('a[href="illustslide/index.html"]').count(), 1);
    await page.evaluate(values => {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      localStorage.setItem('kaijo-ilapo:settings', JSON.stringify({ theme: 'dark', size: 'large' }));
    }, slots);
    for (const entry of ['ilapo/', 'ilapo/index.html']) {
      await page.goto(origin + '/tools/' + entry + '?source=bookmark#page-2');
      await page.waitForURL(origin + '/tools/illustslide/index.html?source=bookmark#page-2');
      await page.waitForFunction(() => !!window.IlapoEditor);
      await page.locator('.recovery').first().waitFor();
      await page.locator('#dialog-cancel').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.deepEqual(await page.evaluate(() => Object.fromEntries(['kaijo-ilapo:auto', 'kaijo-ilapo:saved'].map(key => [key, localStorage.getItem(key)]))), slots);
    }
    for (const expected of [automatic, explicit]) {
      await openCommand(page, 'file', 'recovery');
      assert.equal(await page.locator('.recovery').count(), 2);
      await page.locator('.recovery').filter({ hasText: expected.name }).click();
      assert.deepEqual(await page.evaluate(() => IlapoEditor.getDocument()), expected);
    }
    // Both native picker paths use the new name; their write handles stay distinct.
    await page.evaluate(() => {
      window.__saveNames = [];
      window.showSaveFilePicker = async options => {
        window.__saveNames.push(options.suggestedName);
        let modified = 1, size = 0;
        return {
          async isSameEntry(other) { return other === this; },
          async getFile() { return { size, lastModified: modified }; },
          async createWritable() { return { async write(bytes) { size = bytes.length; }, async close() { modified += 1; }, async abort() {} }; }
        };
      };
    });
    await openCommand(page, 'file', 'save-local');
    await page.waitForFunction(() => document.getElementById('save-status').textContent === 'ローカルに明示保存済み');
    await openCommand(page, 'file', 'auto-start');
    await page.waitForFunction(() => window.__saveNames.length === 2);
    assert.deepEqual(await page.evaluate(() => window.__saveNames), ['以前の明示保存.illustslide.zip', '以前の明示保存.autosave.illustslide.zip']);
    await openCommand(page, 'file', 'auto-stop');
    for (const filename of ['legacy.ilapo.zip', 'current.illustslide.zip']) {
      const expected = fixture(filename, 'rect');
      const bytes = await page.evaluate(async document => Array.from(await IlapoSVG.encodeProject(document)), expected);
      await loadFile(page, { name: filename, mimeType: 'application/zip', buffer: Buffer.from(bytes) }, expected);
    }
    await page.screenshot({ path: path.join(artifacts, 'editor.png') });
    await context.close();

    // Direct file users can download both old slots without either being overwritten.
    const local = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, acceptDownloads: true });
    const recovery = await local.newPage();
    recovery.on('pageerror', error => errors.push(error.message));
    await recovery.addInitScript(values => {
      if (location.pathname.endsWith('/ilapo/index.html')) {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        localStorage.setItem('kaijo-ilapo:settings', JSON.stringify({ theme: 'dark' }));
      }
    }, slots);
    const oldFileURL = pathToFileURL(path.join(root, 'tools/ilapo/index.html')).href;
    await recovery.goto(oldFileURL + '?source=local#keep');
    await recovery.locator('#saved-files button').first().waitFor();
    assert.equal(recovery.url(), oldFileURL + '?source=local#keep');
    assert.equal(await recovery.locator('#saved-files button').count(), 2);
    assert.equal(await recovery.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await recovery.screenshot({ path: path.join(artifacts, 'recovery-mobile.png') });
    const exported = [];
    for (const [index, expected] of [automatic, explicit].entries()) {
      const pending = recovery.waitForEvent('download');
      await recovery.locator('#saved-files button').nth(index).tap();
      const download = await pending;
      assert.match(download.suggestedFilename(), /\.illustslide\.json$/);
      const buffer = await fs.readFile(await download.path());
      assert.deepEqual(JSON.parse(buffer), expected);
      exported.push({ name: download.suggestedFilename(), mimeType: 'application/json', buffer });
    }
    assert.deepEqual(await recovery.evaluate(() => Object.fromEntries(['kaijo-ilapo:auto', 'kaijo-ilapo:saved'].map(key => [key, localStorage.getItem(key)]))), slots);
    await recovery.evaluate(() => localStorage.setItem('kaijo-ilapo:auto', '{broken'));
    const damaged = await local.newPage();
    await damaged.goto(oldFileURL);
    await damaged.locator('#saved-files button').waitFor();
    assert.equal(await damaged.locator('#saved-files button').count(), 1);
    assert.match(await damaged.locator('#message').textContent(), /読み取れない/);
    await damaged.close();
    await recovery.locator('#destination').focus();
    await recovery.keyboard.press('Enter');
    await recovery.waitForFunction(() => !!window.IlapoEditor);
    await recovery.evaluate(() => new Promise(requestAnimationFrame));
    if (await recovery.locator('#dialog[open]').count()) await recovery.locator('#dialog-cancel').click();
    assert(recovery.url().endsWith('/illustslide/index.html?source=local#keep'));
    await loadFile(recovery, exported[0], automatic);
    await loadFile(recovery, exported[1], explicit);
    await local.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log('illustSlide migration browser tests passed. Artifacts: ' + artifacts);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
