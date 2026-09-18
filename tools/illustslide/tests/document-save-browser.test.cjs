'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const Core = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try { response.end(await fs.readFile(file)); } catch { response.writeHead(404).end(); }
});
function fixture(id, name) { const value = Core.createDocument(); value.id = id; value.name = name; return value; }
async function openFileMenu(page) { await page.locator('#file-button').click(); await page.locator('#command-menu[data-menu-kind="file"]').waitFor(); }
async function rename(page, name) {
  await openFileMenu(page); await page.locator('#command-menu [data-action="rename"]').click();
  await page.locator('#name-input').fill(name); await page.locator('#dialog-form').press('Enter');
  await page.waitForFunction(value => IlapoEditor.getDocument().name === value, name);
}
async function chooseLocalInDialog(page) { await page.locator('#document-save-local').click(); }
async function selectDocument(page, id) { await page.locator(`[data-document-tab="${id}"]`).click(); await page.waitForFunction(value => IlapoEditor.getState().sessionId === value, id); }
async function load(page, value) {
  await page.locator('#file-input').setInputFiles({ name: value.id + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, value.id);
  return page.evaluate(() => IlapoEditor.getState().sessionId);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 844 } }); page.setDefaultTimeout(10000);
    await page.addInitScript(() => {
      const harness = window.__documentSaveHarness = { picks: [], calls: [], handles: Object.create(null) };
      function makeHandle(id) {
        let revision = 1, release = null;
        const handle = harness.handles[id] = {
          id, block: false, fail: false, writes: [],
          getFile: async () => ({ lastModified: revision, size: handle.writes.length }),
          isSameEntry: async other => other === harness.handles[id],
          createWritable: async () => ({
            write: async bytes => { harness.calls.push({ id, bytes: Array.from(bytes) }); if (harness.handles[id].block) await new Promise(resolve => { release = resolve; }); if (harness.handles[id].fail) throw new Error('write failed'); harness.handles[id].writes.push(bytes); },
            close: async () => { revision += 1; }, abort: async () => {}
          }),
          release: () => { if (release) { const current = release; release = null; current(); } }
        };
        return handle;
      }
      ['A', 'B', 'C', 'AUTO_A', 'AUTO_B'].forEach(makeHandle);
      window.showSaveFilePicker = async options => {
        harness.calls.push({ picker: true, suggestedName: options.suggestedName });
        const pick = harness.picks.shift();
        if (pick === 'cancel') throw new DOMException('cancelled', 'AbortError');
        return harness.handles[pick];
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(() => !!window.IlapoEditor);
    const a = await load(page, fixture('doc-A', '作品A'));
    const b = await load(page, fixture('doc-B', '作品B'));
    assert.equal(await page.evaluate(() => { const listed = IlapoEditor.getDocuments(); listed[0].name = '外部変更'; listed.pop(); return IlapoEditor.getDocuments().some(item => item.name === '外部変更'); }), false, '公開一覧は内部状態を書き換えられない');
    assert.equal((await page.evaluate(() => IlapoEditor.getDocuments())).filter(item => ['作品A', '作品B'].includes(item.name)).length, 2);

    await selectDocument(page, a); await rename(page, '作品A・保存対象');
    await page.evaluate(() => { __documentSaveHarness.handles.A.block = true; __documentSaveHarness.picks.push('A'); });
    await openFileMenu(page); await page.locator('#command-menu [data-action="save-local"]').click();
    await page.waitForFunction(() => IlapoEditor.getDocuments().some(item => item.name === '作品A・保存対象' && item.saving));
    await selectDocument(page, b); await rename(page, '作品B・編集中');
    await page.evaluate(() => __documentSaveHarness.handles.A.release());
    await page.waitForFunction(() => IlapoEditor.getDocuments().some(item => item.name === '作品A・保存対象' && item.destination === 'local' && !item.saving));
    const afterA = await page.evaluate(() => IlapoEditor.getDocuments());
    assert.equal(afterA.find(item => item.name === '作品A・保存対象').dirty, false, '遅延保存の完了はAだけを保存済みにする');
    assert.equal(afterA.find(item => item.name === '作品B・編集中').dirty, true, 'Aの保存中に編集したBはdirtyのまま残る');

    await selectDocument(page, a); await rename(page, '作品A・再保存'); await page.evaluate(() => { __documentSaveHarness.handles.A.block = false; });
    const pickerBeforeReuse = await page.evaluate(() => __documentSaveHarness.calls.filter(call => call.picker).length);
    await page.keyboard.press('Meta+s');
    await page.waitForFunction(() => IlapoEditor.getDocuments().some(item => item.name === '作品A・再保存' && !item.dirty && item.destination === 'local'));
    assert.equal(await page.evaluate(() => __documentSaveHarness.calls.filter(call => call.picker).length), pickerBeforeReuse, 'Aの次のCmd+Sは既存handleを再利用する');

    await selectDocument(page, b); await page.evaluate(() => __documentSaveHarness.picks.push('B'));
    await page.keyboard.press('Meta+s'); await page.locator('#document-save-browser').waitFor(); await chooseLocalInDialog(page);
    await page.waitForFunction(() => IlapoEditor.getDocuments().some(item => item.name === '作品B・編集中' && item.destination === 'local' && !item.dirty));
    assert.equal(await page.evaluate(() => __documentSaveHarness.calls.filter(call => call.picker).length), pickerBeforeReuse + 1, 'Bの初回Cmd+Sだけはchooserを開く');

    await rename(page, '作品B・取消確認'); await page.evaluate(() => __documentSaveHarness.picks.push('cancel'));
    await openFileMenu(page); await page.locator('#command-menu [data-action="save-local"]').click();
    await page.waitForFunction(() => IlapoEditor.getDocuments().some(item => item.name === '作品B・取消確認' && item.dirty));
    assert.equal((await page.evaluate(() => IlapoEditor.getDocuments())).find(item => item.name === '作品B・取消確認').destination, 'local', 'picker取消でも保存先は維持する');

    await page.evaluate(() => { __documentSaveHarness.handles.B.fail = true; });
    await page.locator(`[data-document-close="${b}"]`).click(); await page.locator('#document-close-save').click();
    await page.waitForFunction(() => document.getElementById('dialog').open && !document.getElementById('dialog-error').hidden);
    assert((await page.evaluate(() => IlapoEditor.getDocuments())).some(item => item.id === b), 'dirty closeの書込失敗ではタブを残す');
    await page.locator('#dialog-cancel').click();

    const c = await load(page, fixture('doc-C', '作品C')); await rename(page, '作品C・取消');
    await page.evaluate(() => __documentSaveHarness.picks.push('cancel'));
    await page.locator(`[data-document-close="${c}"]`).click(); await page.locator('#document-close-save').click(); await page.locator('#document-save-local').click();
    await page.waitForFunction(() => document.getElementById('dialog').open && !document.getElementById('dialog-error').hidden);
    assert((await page.evaluate(() => IlapoEditor.getDocuments())).some(item => item.id === c), 'dirty closeのpicker取消でもタブを残す');
    await page.locator('#dialog-cancel').click();

    await selectDocument(page, a); await rename(page, '作品A・閉じる前');
    await page.evaluate(() => { __documentSaveHarness.handles.A.block = true; });
    await page.locator(`[data-document-close="${a}"]`).click(); await page.locator('#document-close-save').click();
    await page.waitForFunction(id => IlapoEditor.getDocuments().some(item => item.id === id && item.saving), a);
    await page.locator('#dialog-cancel').click(); await page.evaluate(() => __documentSaveHarness.handles.A.release());
    await page.waitForFunction(id => IlapoEditor.getDocuments().some(item => item.id === id && !item.saving), a);
    assert((await page.evaluate(() => IlapoEditor.getDocuments())).some(item => item.id === a), 'ダイアログを閉じても遅延書込完了後にタブを閉じない');

    await selectDocument(page, b); await page.evaluate(() => __documentSaveHarness.picks.push('AUTO_A'));
    await openFileMenu(page); await page.locator('#command-menu [data-action="auto-start"]').click();
    await page.waitForFunction(() => __documentSaveHarness.calls.some(call => call.id === 'AUTO_A'));
    await selectDocument(page, c); await page.evaluate(() => __documentSaveHarness.picks.push('AUTO_B'));
    await openFileMenu(page); await page.locator('#command-menu [data-action="auto-start"]').click();
    await page.waitForFunction(() => __documentSaveHarness.calls.some(call => call.id === 'AUTO_B'));
    assert.equal(await page.evaluate(() => __documentSaveHarness.calls.filter(call => call.id === 'AUTO_A' || call.id === 'AUTO_B').length >= 2), true, 'auto保存先もsessionごとに分離する');
    console.log('document save browser tests passed');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
