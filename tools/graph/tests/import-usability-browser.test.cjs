/* Chrome checks for the grouped CSV import controls and icon affordances. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, {'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'}); res.end(error ? 'not found' : data); });
});

let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1000, height: 800}});
  await page.goto(process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`);
  await page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  if (!await page.locator('#series-add-toggle').isVisible()) await page.locator('#list-toggle').click();
  if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click();
  await page.locator('#import-csv').click();
  const dialog = page.locator('#editor-dialog'); await dialog.waitFor({state: 'visible'});
  for (const [name, icon] of [['用意済み', 'table'], ['URL', 'link'], ['ファイル', 'file']]) {
    const tab = page.getByRole('button', {name, exact: true});
    assert.equal(await tab.locator('svg[aria-hidden="true"]').count(), 1, `${name} has an icon`);
    assert.equal(await tab.getAttribute('aria-controls'), `data-import-${name === '用意済み' ? 'catalog' : name === 'URL' ? 'url' : 'file'}`);
    assert.ok(icon);
  }
  await page.getByRole('button', {name: 'ファイル', exact: true}).click();
  await page.setInputFiles('[data-import-file]', {name: 'sample.csv', mimeType: 'text/csv', buffer: Buffer.from('x,y,地域\n1,2,東京\n2,3,大阪\n')});
  await page.locator('[data-import-summary]').waitFor();
  assert.equal(await page.locator('details.data-import-settings summary').innerText(), '読み取り設定');
  assert.equal(await page.locator('details.data-import-column-settings summary').innerText(), '列・欠測の設定');
  assert.equal(await page.getByLabel('見出し行（0ならなし）', {exact: true}).isVisible(), false);
  await page.locator('details.data-import-settings summary').click();
  assert.equal(await page.getByLabel('見出し行（0ならなし）', {exact: true}).isVisible(), true);
  assert.equal(await page.getByLabel('地域などで絞り込む列', {exact: true}).isVisible(), false);
  await page.locator('details.data-import-column-settings summary').click();
  assert.equal(await page.getByLabel('地域などで絞り込む列', {exact: true}).isVisible(), true);
  assert.equal(await page.locator('details.data-import-settings summary svg[aria-hidden="true"]').count(), 1);
  assert.equal(await page.locator('details.data-import-column-settings summary svg[aria-hidden="true"]').count(), 1);
  await browser.close(); browser = null; await new Promise(resolve => server.close(resolve));
  console.log('import-usability-browser.test.cjs: ok');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
