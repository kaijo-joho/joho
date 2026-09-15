/* Saving failures and choosing older snapshots must never discard working data. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const Core = require('../core.js');
const Storage = require('../storage.js');
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

async function serve() {
  const root = path.resolve(__dirname, '..');
  const allowed = new Set(['index.html','output.js','parts.js','layout.js','core.js','render.js','storage.js','local-autosave.js','editor.js','editor.css','icon.svg']);
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!allowed.has(name)) return res.writeHead(404).end();
    try { res.writeHead(200, { 'Content-Type': types[path.extname(name)] + '; charset=utf-8' }); res.end(await fs.readFile(path.join(root, name))); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port + '/', close: () => new Promise(resolve => server.close(resolve)) };
}
function fixture(title) {
  const doc = Core.createDocument(); doc.id = 'storage_integrity'; doc.title = title;
  doc.nodes = [Core.createNode('process', 80, 100, { id:'process', text:title })];
  return doc;
}
function seedSnapshots(manual, auto) {
  const records = {}, storage = { setItem: (key, value) => { records[key] = value; } };
  Storage.writeBrowser(storage, 'manual', manual, { savedAt:'2026-09-14T10:00:00Z' });
  Storage.writeBrowser(storage, 'auto', auto, { saved:Core.serializeDocument(manual), savedAt:'2026-09-14T11:00:00Z' });
  return records;
}
async function contextFor(browser, records, extra) {
  const context = await browser.newContext({ viewport:{width:1280,height:860}, acceptDownloads:true });
  await context.addInitScript(values => {
    if (!sessionStorage.getItem('integrity-seeded')) {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      sessionStorage.setItem('integrity-seeded', 'yes');
    }
  }, records);
  if (extra) await context.addInitScript(extra);
  return context;
}
async function fileAction(page, id) {
  if (!await page.locator('#file-menu').evaluate(el => el.open)) await page.locator('#file-menu > summary').click();
  await page.locator('#' + id).click();
}
const readDocument = page => page.evaluate(() => DiagramEditor.getDocument());
const recordsFrom = page => page.evaluate(() => ({ auto:localStorage.getItem('kaijo.diagram.recovery.v1'), manual:localStorage.getItem('kaijo.diagram.saved.v1') }));
async function rename(page, title) {
  if (!await page.locator('#file-menu').evaluate(el => el.open)) await page.locator('#file-menu > summary').click();
  await page.locator('#document-title').fill(title); await page.locator('#document-title').press('Tab');
  await page.waitForFunction(value => JSON.parse(localStorage.getItem('kaijo.diagram.recovery.v1')).document.title === value, title);
  await page.keyboard.press('Escape');
}

async function checkSnapshots(browser, url) {
  const manual = fixture('明示保存'), auto = fixture('編集途中'), records = seedSnapshots(manual, auto);
  const context = await contextFor(browser, records);
  try {
    const page = await context.newPage(); page.on('dialog', d => d.accept());
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    assert.notEqual((await readDocument(page)).id, auto.id, 'Startup does not silently choose autosave');
    assert.equal(await page.locator('[data-open-source="browser-auto"]').count(), 1);
    assert.equal(await page.locator('[data-open-source="browser-manual"]').count(), 1);
    await page.keyboard.press('Escape'); await page.reload();
    assert.deepEqual(await recordsFrom(page), {auto:records[Storage.AUTO_KEY],manual:records[Storage.MANUAL_KEY]}, 'Cancel and reload preserve both snapshots byte-for-byte');
    await page.locator('[data-open-source="browser-manual"]').click();
    assert.deepEqual(await readDocument(page), manual);
    await page.evaluate(() => DiagramEditor.fit());
    await page.reload();
    assert.deepEqual(await recordsFrom(page), {auto:records[Storage.AUTO_KEY],manual:records[Storage.MANUAL_KEY]}, 'Viewing and leaving the older manual snapshot does not overwrite autosave');
    await page.locator('[data-open-source="browser-auto"]').click();
    assert.deepEqual(await readDocument(page), auto);
    await fileAction(page, 'save-browser');
    const firstManual = (await recordsFrom(page)).manual;
    assert.equal(JSON.parse(firstManual).document.title, '編集途中');
    await rename(page, '次の編集');
    assert.equal((await recordsFrom(page)).manual, firstManual, 'Edits update only automatic storage');
    const current = await readDocument(page), beforeFailure = await recordsFrom(page);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'kaijo.diagram.saved.v1') throw new DOMException('容量不足', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await fileAction(page, 'open-file');
    await page.locator('[data-open-source="browser-manual"]').click();
    await page.locator('#save-continue').click();
    assert.deepEqual(await readDocument(page), current, 'Save-and-open aborts when saving fails');
    assert.equal((await recordsFrom(page)).manual, beforeFailure.manual);
    assert.equal(await page.locator('#storage-open-dialog').evaluate(el => el.open), true);
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download'); await fileAction(page, 'save-file');
    const file = await download;
    const stream = await file.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk);
    const parsed = Storage.parseFile(Buffer.concat(chunks).toString());
    assert.deepEqual(parsed.document, current, 'File saving remains available after browser storage failure');
    assert.equal(parsed.method, 'manual');
  } finally { await context.close(); }
}

async function checkLocalWiring(browser, url) {
  const manual = fixture('ローカル連携'), records = seedSnapshots(manual, manual);
  const context = await contextFor(browser, records, () => {
    // The picker and handles are simulated; native picker UI is not covered here.
    window.testLocal = { text:'', writes:0, fail:false, pick:'ok', permission:'granted' };
    window.showSaveFilePicker = async () => {
      if (testLocal.pick === 'cancel') throw new DOMException('cancel', 'AbortError');
      return {
        name:'自動保存.diagram.json',
        queryPermission:async () => testLocal.permission,
        requestPermission:async () => testLocal.permission,
        getFile:async () => new File([testLocal.text], '自動保存.diagram.json'),
        createWritable:async () => {
          let pending = null, aborted = false;
          return { write:async text => { if (testLocal.fail) throw new DOMException('保存できません', 'NotAllowedError'); pending = text; },
            close:async () => { if (!aborted) { testLocal.text = pending; testLocal.writes++; } }, abort:async () => { aborted = true; } };
        }
      };
    };
  });
  try {
    const page = await context.newPage(); page.on('dialog', d => d.accept()); await page.goto(url);
    await page.locator('[data-open-source="browser-auto"]').click();
    await fileAction(page, 'autosave-settings');
    await page.evaluate(() => { testLocal.pick = 'cancel'; }); await page.locator('#local-auto-start').click();
    assert.equal(await page.evaluate(() => testLocal.writes), 0);
    await page.evaluate(() => { testLocal.pick = 'ok'; }); await page.locator('#local-auto-start').click();
    await page.waitForFunction(() => testLocal.writes === 1);
    assert.equal(JSON.parse(await page.evaluate(() => testLocal.text)).saveInfo.method, 'auto');
    await page.keyboard.press('Escape'); await rename(page, 'ファイルにも更新');
    await page.waitForFunction(() => JSON.parse(testLocal.text).title === 'ファイルにも更新');
    assert.equal((await recordsFrom(page)).manual, records[Storage.MANUAL_KEY], 'Automatic file saving never changes the explicit snapshot');
    const lastFile = await page.evaluate(() => testLocal.text);
    await page.evaluate(() => { testLocal.fail = true; }); await rename(page, 'ファイル保存失敗');
    await page.waitForFunction(() => document.getElementById('save-status').dataset.error === 'true');
    assert.equal(await page.evaluate(() => testLocal.text), lastFile);
    assert.equal(JSON.parse((await recordsFrom(page)).auto).document.title, 'ファイル保存失敗', 'Browser recovery continues after a local write failure');
    await fileAction(page, 'autosave-settings');
    await page.evaluate(value => { testLocal.fail = false; testLocal.text = value; }, Storage.serializeFile(manual));
    const beforeManualFile = await page.evaluate(() => testLocal.text);
    await page.locator('#local-auto-start').click();
    await page.waitForFunction(() => document.getElementById('local-auto-status').dataset.error === 'true');
    assert.equal(await page.evaluate(() => testLocal.text), beforeManualFile, 'A manually saved file is never overwritten as an automatic target');
  } finally { await context.close(); }
}

async function checkLatestBaseline(browser, url) {
  const previous = fixture('以前のブラウザ保存'), latest = fixture('直近のファイル保存');
  const records = seedSnapshots(previous, latest), memory = { setItem:(key, value) => { records[key] = value; } };
  Storage.writeBrowser(memory, 'auto', latest, { saved:Core.serializeDocument(latest), savedAt:'2026-09-15T10:00:00Z' });
  const context = await contextFor(browser, records);
  try {
    const page = await context.newPage(); await page.goto(url);
    await page.locator('[data-open-source="browser-auto"]').click();
    assert.deepEqual(await readDocument(page), latest);
    assert.doesNotMatch(await page.locator('#save-status').textContent(), /未保存の変更/, 'An older browser snapshot cannot replace a more recent explicit file baseline');
  } finally { await context.close(); }
}

(async () => {
  const hosting = await serve();
  try {
    for (const engine of process.argv.includes('--chrome-only')?['chromium']:['chromium','webkit']) {
      const browser = await pw[engine].launch(engine === 'chromium' ? {channel:'chrome',headless:true} : {headless:true});
      try { await checkSnapshots(browser, hosting.url); await checkLocalWiring(browser, hosting.url); await checkLatestBaseline(browser, hosting.url); console.log(engine + ': snapshot preservation, failed save-and-open, file fallback and simulated local autosave passed'); }
      finally { await browser.close(); }
    }
  } finally { await hosting.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
