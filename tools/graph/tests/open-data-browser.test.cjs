/* Chrome UI regression tests for the public CSV import flow. */
const assert = require('assert');
const Toolbar = require('./toolbar-helpers.cjs');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const mime = file => file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = http.createServer((req, res) => {
  const name = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\.\.([/\\]|$)/, '').replace(/^[/\\]+/, '');
  const file = path.join(root, name || 'tools/graph/index.html');
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type':mime(file) }); res.end(error ? 'not found' : data); });
});
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  browser = await chromium.launch({ channel:'chrome', headless:true });
  const context = await browser.newContext({ viewport:{width:1200,height:820}, hasTouch:true });
  context.setDefaultTimeout(7000);
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {value:undefined, configurable:true});
    window.__csvFetches = [];
    const original = window.fetch;
    window.fetch = function (input, init) { window.__csvFetches.push({url:String(input), init:{credentials:init?.credentials, mode:init?.mode, referrerPolicy:init?.referrerPolicy}}); return original.apply(this, arguments); };
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = '日付,降水量(mm),気温(℃)\n2026-01-01,0,5\n2026-01-02,2,6\n';
  await page.route('https://open-data.example/**', async route => {
    const pathName = new URL(route.request().url()).pathname;
    if (pathName.endsWith('/network.csv')) return route.abort('failed');
    if (pathName.endsWith('/slow.csv')) { await new Promise(resolve => setTimeout(resolve, 150)); return route.fulfill({status:200, headers:{'content-type':'text/csv','access-control-allow-origin':'*'}, body:fixture}); }
    if (pathName.endsWith('/html.csv')) return route.fulfill({status:200, headers:{'content-type':'text/html','access-control-allow-origin':'*'}, body:'<html>not csv</html>'});
    return route.fulfill({status:200, headers:{'content-type':'text/csv; charset=utf-8','access-control-allow-origin':'*'}, body:fixture});
  });
  await page.goto(url); await page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  const initial = await page.evaluate(() => GraphEditor.getDocument());
  const initialSeries = initial.series.length;
  async function openImport() {
    if (!await page.locator('#series-add-toggle').isVisible()) await page.locator('#list-toggle').click();
    if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click();
    await page.locator('#import-csv').click(); await page.locator('#editor-dialog[open]').waitFor();
  }
  async function submit() { await page.locator('#dialog-submit').click(); await page.waitForFunction(() => !document.querySelector('#editor-dialog').open && !GraphEditor.getState().drawing); }

  await openImport();
  assert.equal(await page.getByRole('button', {name:'用意済み', exact:true}).getAttribute('aria-pressed'), 'true');
  await page.locator('[data-catalog-id="jma-tokyo-normal-1991-2020"]').click();
  await page.locator('[data-import-summary]').waitFor();
  assert.match(await page.locator('[data-import-summary]').textContent(), /12行.*5列/);
  await page.screenshot({path:'/private/tmp/graph-open-data-desktop.png', fullPage:true});
  const rawDownload = page.waitForEvent('download'); await page.getByRole('button', {name:'元のCSVを保存', exact:true}).click();
  const raw = await rawDownload; assert.match(fs.readFileSync(await raw.path(), 'utf8'), /^月,平均気温\(℃\),降水量/);
  const axisLabels = page.getByLabel('選んだ列名を軸名に使う', {exact:true});
  if (!await axisLabels.isChecked()) await axisLabels.check();
  assert.equal(await page.locator('#dialog-submit').isDisabled(), false);
  await submit();
  let doc = await page.evaluate(() => GraphEditor.getDocument());
  assert.equal(doc.version, 15); assert.equal(doc.series.length, initialSeries + 1); assert.equal(doc.series.at(-1).rows.length, 12); assert.equal(doc.series.at(-1).dataTable.columns.length, 5);
  assert.equal(doc.series.at(-1).source.kind, 'reference'); assert.match(doc.series.at(-1).source.url, /data\.jma\.go\.jp/);
  assert.equal(doc.axes.x.label, '月'); assert.equal(doc.axes.y.label, '平均気温');
  await page.locator('#undo').click(); await page.waitForFunction(count => GraphEditor.getDocument().series.length === count, initialSeries); assert.equal((await page.evaluate(() => GraphEditor.getDocument())).axes.x.label, initial.axes.x.label);
  await page.locator('#redo').click(); await page.waitForFunction(count => GraphEditor.getDocument().series.length === count, initialSeries + 1);

  await openImport(); await page.getByRole('button', {name:'URL', exact:true}).click();
  await page.getByLabel('公開CSVのURL', {exact:true}).fill('https://open-data.example/good.csv#discard');
  await page.getByRole('button', {name:'読み込む', exact:true}).click(); await page.locator('[data-import-summary]').waitFor();
  const fetchOptions = await page.evaluate(() => window.__csvFetches.at(-1).init);
  assert.deepEqual(fetchOptions, {credentials:'omit', mode:'cors', referrerPolicy:'no-referrer'});
  await submit(); doc = await page.evaluate(() => GraphEditor.getDocument());
  assert.equal(doc.series.length, initialSeries + 2); assert.equal(doc.series.at(-1).source.url, 'https://open-data.example/good.csv');

  await openImport(); await page.getByRole('button', {name:'ファイル', exact:true}).click();
  const local = '説明行,説明行,説明行\n地域,日付,値\n単位,,mm\n東京,2026-01-01,1\n東京,2026-01-02,NA\n大阪,2026-01-01,3\n';
  await page.setInputFiles('[data-import-file]', {name:'地域別.csv', mimeType:'text/csv', buffer:Buffer.from(local)});
  const importSettings = page.locator('details.data-import-settings');
  const columnSettings = page.locator('details.data-import-column-settings');
  await importSettings.locator('summary').click();
  const headerRow = page.getByLabel('見出し行（0ならなし）', {exact:true});
  await headerRow.fill('2'); await headerRow.press('Tab');
  await importSettings.evaluate(el => { el.open = true; });
  const dataStart = page.getByLabel('データ開始行', {exact:true});
  await dataStart.fill('4'); await dataStart.press('Tab');
  await columnSettings.locator('summary').click();
  await page.getByLabel('地域などで絞り込む列', {exact:true}).selectOption('0'); await page.getByLabel('残す値（完全一致）', {exact:true}).selectOption({label:'東京'});
  await page.getByLabel('横軸の列', {exact:true}).selectOption('1');
  await page.getByLabel('縦軸の列', {exact:true}).selectOption('2');
  assert.equal(await page.getByLabel('日付の扱い', {exact:true}).isVisible(), true);
  await page.getByLabel('日付の扱い', {exact:true}).selectOption('year'); await page.locator('[data-import-summary]').waitFor();
  await submit(); doc = await page.evaluate(() => GraphEditor.getDocument());
  assert.deepEqual(doc.series.at(-1).rows, [[2026,1],[2026,null]]);

  await openImport(); await page.getByRole('button', {name:'URL', exact:true}).click();
  await page.getByLabel('公開CSVのURL', {exact:true}).fill('https://open-data.example/network.csv'); await page.getByRole('button', {name:'読み込む', exact:true}).click();
  await page.getByRole('button', {name:'ダウンロードしたファイルを選ぶ', exact:true}).waitFor();
  assert.equal(await page.locator('.data-import-fallback a').getAttribute('href'), 'https://open-data.example/network.csv');
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', {name:'ダウンロードしたファイルを選ぶ', exact:true}).click();
  await (await chooser).setFiles({name:'downloaded.csv', mimeType:'text/csv', buffer:Buffer.from('x,y\n1,2\n3,4\n')});
  await page.locator('[data-import-summary]').waitFor(); await submit(); doc = await page.evaluate(() => GraphEditor.getDocument());
  assert.equal(doc.series.at(-1).source.url, 'https://open-data.example/network.csv');

  await openImport(); await page.getByRole('button', {name:'ファイル', exact:true}).click();
  const xss = 'x,y,地域\n1,2,"<img src=x onerror=window.__csvXss=1>"\n2,3,東京\n';
  await page.setInputFiles('[data-import-file]', {name:'文字列.csv', mimeType:'text/csv', buffer:Buffer.from(xss)}); await page.locator('[data-import-summary]').waitFor();
  assert.equal(await page.locator('.data-import-table img').count(), 0); assert.equal(await page.evaluate(() => window.__csvXss), undefined);
  const invalidSettings = page.locator('details.data-import-settings'); await invalidSettings.locator('summary').click();
  const invalidHeader = page.getByLabel('見出し行（0ならなし）', {exact:true}); await invalidHeader.fill('4'); await invalidHeader.press('Tab');
  await invalidSettings.evaluate(el => { el.open = true; }); await page.getByLabel('横軸の列', {exact:true}).selectOption('0');
  assert.equal(await page.locator('#dialog-submit').isDisabled(), true, '不正な見出し設定の後は古い解析結果を再利用しない'); await page.locator('#dialog-cancel').click();

  await openImport(); await page.getByRole('button', {name:'URL', exact:true}).click();
  await page.getByLabel('公開CSVのURL', {exact:true}).fill('https://open-data.example/html.csv'); await page.getByRole('button', {name:'読み込む', exact:true}).click();
  await page.getByText('CSVまたはTSVとして公開されたデータを指定してください。').waitFor();
  await page.locator('#dialog-cancel').click();

  const beforeCancel = await page.evaluate(() => GraphEditor.getDocument());
  await openImport(); await page.getByRole('button', {name:'URL', exact:true}).click();
  await page.getByLabel('公開CSVのURL', {exact:true}).fill('https://open-data.example/slow.csv'); await page.getByRole('button', {name:'読み込む', exact:true}).click();
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#editor-dialog').open); await page.waitForTimeout(220);
  assert.deepEqual(await page.evaluate(() => GraphEditor.getDocument()), beforeCancel, '中止した遅延URL取得は文書を変更しない');

  await Toolbar.clickToolbarControl(page,'mode-3d'); await page.waitForFunction(() => GraphEditor.getDocument().mode === '3d');
  await openImport(); await page.getByRole('button', {name:'ファイル', exact:true}).click();
  await page.setInputFiles('[data-import-file]', {name:'three.csv', mimeType:'text/csv', buffer:Buffer.from('x,y,z,extra\n1,2,3,4\n5,6,7,8\n')}); await page.locator('[data-import-summary]').waitFor();
  await page.getByLabel('横軸の列', {exact:true}).selectOption('1'); await page.getByLabel('縦軸の列', {exact:true}).selectOption('2'); await page.getByLabel('高さの列', {exact:true}).selectOption('0');
  await submit(); doc = await page.evaluate(() => GraphEditor.getDocument());
  const three = doc.series.at(-1); assert.equal(three.kind, 'data3d'); assert.deepEqual(three.rows, [[2,3,1],[6,7,5]]); assert.deepEqual(three.dataTable.mapping, {x:1,y:2,z:0,errorX:null,errorY:null});
  await page.locator('#file-menu summary').click(); const jsonDownload = page.waitForEvent('download'); await page.locator('#save-local').click(); const json = await jsonDownload;
  const saved = JSON.parse(fs.readFileSync(await json.path(), 'utf8')); assert.deepEqual(saved.series.at(-1).dataTable.mapping, three.dataTable.mapping); assert.equal(saved.series.find(series => series.source.url === 'https://open-data.example/good.csv').source.kind, 'reference');
  await page.setInputFiles('#file-input', await json.path()); await page.waitForFunction(() => !GraphEditor.getState().drawing); assert.deepEqual((await page.evaluate(() => GraphEditor.getDocument())).series.at(-1).dataTable.mapping, three.dataTable.mapping);
  await Toolbar.clickToolbarControl(page,'mode-2d'); await page.waitForFunction(() => GraphEditor.getDocument().mode === '2d');

  await Toolbar.openSettings(page); await page.locator('[data-theme-value="dark"]').click(); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:820}); await page.waitForTimeout(80); assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), '390pxで横スクロールしない');
  await openImport(); await page.locator('[data-catalog-id="jma-tokyo-normal-1991-2020"]').click(); await page.locator('[data-import-summary]').waitFor();
  const dialogBox = await page.locator('#editor-dialog').boundingBox();
  for (const id of ['dialog-cancel', 'dialog-submit']) { const box = await page.locator('#' + id).boundingBox(); assert(box && dialogBox && box.x >= dialogBox.x && box.y >= dialogBox.y && box.x + box.width <= dialogBox.x + dialogBox.width && box.y + box.height <= 820, id + ' が画面とダイアログ内に収まる'); }
  await page.screenshot({path:'/private/tmp/graph-open-data-mobile.png', fullPage:true});
  await page.getByLabel('横軸の列', {exact:true}).focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#editor-dialog').open);
  assert.deepEqual(errors, []);
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('graph open-data-browser.test.cjs: ok');
})().catch(async error => { if (browser) await browser.close(); server.close(); console.error(error.stack || error); process.exitCode = 1; });
