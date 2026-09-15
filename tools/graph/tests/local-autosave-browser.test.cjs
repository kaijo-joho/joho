/* Browser-only regression for the mocked File System Access auto-save path. */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const contentType = file => file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = http.createServer((request, response) => {
  const relative = path.normalize(decodeURIComponent(request.url.split('?')[0])).replace(/^\.\.([/\\]|$)/, '').replace(/^[/\\]+/, '');
  const file = path.join(root, relative || 'tools/graph/index.html');
  if (!file.startsWith(root)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, data) => { response.writeHead(error ? 404 : 200, { 'Content-Type': contentType(file) }); response.end(error ? 'not found' : data); });
});
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 800 } });
  await context.addInitScript(() => {
    let stamp = 1000;
    const makeHandle = id => ({
      id,
      async getFile() { return { lastModified: state[id].modified, size: state[id].text.length }; },
      async createWritable() { let next = ''; return { async write(blob) { next = await blob.text(); }, async close() { state[id].text = next; state[id].modified = ++stamp; }, async abort() {} }; },
      async isSameEntry(other) { return Boolean(other && other.id === id); }
    });
    const state = { auto: { text: '', modified: stamp }, explicit: { text: '', modified: stamp } };
    const handles = { auto: makeHandle('auto'), explicit: makeHandle('explicit') };
    const queue = ['auto', 'auto'];
    window.__graphFakeFS = { state, handles, externalChange() { state.auto.text = '{"external":true}'; state.auto.modified = ++stamp; } };
    window.showSaveFilePicker = async () => handles[queue.shift() || 'explicit'];
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  await page.goto(url); await page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  const documentBefore = await page.evaluate(() => GraphEditor.getDocument());
  await page.locator('#file-menu summary').click(); await page.locator('#start-local-auto').click();
  await page.waitForFunction(() => window.__graphFakeFS.state.auto.text.length > 0 && document.querySelector('#stop-local-auto').disabled === false);
  const initial = await page.evaluate(() => JSON.parse(__graphFakeFS.state.auto.text));
  assert.equal(initial.format, 'kaijo-graph'); assert.deepStrictEqual(initial, documentBefore, 'initial auto-save writes the current graph JSON');

  await page.locator('#add-function').click();
  const expression = page.locator('#dialog-content label').filter({ hasText: '数式' }).locator('input').first(); await expression.fill('y = sin(x)');
  await page.locator('#dialog-submit').click(); await page.waitForFunction(() => !document.querySelector('#editor-dialog').open);
  await page.waitForFunction(() => window.__graphFakeFS.state.auto.text.includes('sin(x)'));
  assert((await page.evaluate(() => JSON.parse(__graphFakeFS.state.auto.text))).series.some(s => s.expression === 'y = sin(x)'));

  await page.locator('#file-menu summary').click(); await page.locator('#save-local').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('自動保存先は明示保存先として使用できません'));
  assert.equal(await page.evaluate(() => __graphFakeFS.state.auto.text.includes('sin(x)')), true, 'rejected explicit save does not overwrite the auto-save file');

  await page.evaluate(() => __graphFakeFS.externalChange());
  await page.locator('#add-function').click(); await expression.fill('y = cos(x)'); await page.locator('#dialog-submit').click();
  await page.waitForFunction(() => document.querySelector('#stop-local-auto').disabled && document.querySelector('#save-status').textContent.includes('外部で変更'));
  const afterExternal = await page.evaluate(() => GraphEditor.getDocument());
  assert(afterExternal.series.some(s => s.expression === 'y = cos(x)'), 'external change stops only local saving, not editing');
  await page.waitForTimeout(350);
  const browserAuto = await page.evaluate(() => JSON.parse(localStorage.getItem('kaijo-graph:auto')).document);
  assert.deepStrictEqual(browserAuto, afterExternal, 'browser auto-save remains available after local save stops');
  assert.equal(errors.length, 0, errors.join('\n'));
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('graph local-autosave-browser.test.cjs: ok (mocked File System Access API; OS picker not covered)');
})().catch(async error => { if (browser) await browser.close(); server.close(); console.error(error.stack || error); process.exitCode = 1; });
