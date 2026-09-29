/* Run: node tools/illustslide/tests/document-resume-browser.test.cjs [https://.../tools/illustslide/] */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), http = require('node:http'), os = require('node:os'), path = require('node:path');
const C = require('../core.js');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..'), resumeKey = 'kaijo-ilapo:resume';
function fixture(name, pages=1) {
  const value = C.createDocument(); value.name = name;
  while(value.pages.length < pages) value.pages.push(C.createDocument().pages[0]);
  value.pages.forEach((page, index) => { page.name = 'ページ' + (index + 1); });
  return C.validateDocument(value);
}
function slot(value, id, kind, day) { return {name:`kaijo-ilapo:document:${id}:${kind}`,value:JSON.stringify({document:value,storageId:id,kind,at:`2026-09-${day}T00:00:00.000Z`})}; }
function resume(value, id, dirty=false, page=0) { return {name:resumeKey,value:JSON.stringify({version:1,at:'2026-09-29T00:00:00.000Z',document:value,storageId:id,pageId:value.pages[page].id,dirty,saveDestination:'browser'})}; }
async function fileAction(page, action) { await page.locator('#file-button').click(); await page.locator(`#command-menu [data-action="${action}"]`).click(); }
async function ready(page) { await page.waitForFunction(() => !!window.IlapoEditor); await page.waitForFunction(() => !!document.querySelector('#document-tabs [data-document-tab]')); }
async function reload(page) { await page.reload(); await ready(page); assert.equal(await page.locator('#dialog').isVisible(), false, '起動時はモーダルを開かない'); }
async function load(page, value) {
  await page.locator('#file-input').setInputFiles({name:'resume-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, value.id);
  return page.evaluate(() => IlapoEditor.getState().sessionId);
}
async function read(page) { return page.evaluate(() => ({document:IlapoEditor.getDocument(),state:IlapoEditor.getState(),tabs:IlapoEditor.getDocuments()})); }
async function stored(page, key) { return page.evaluate(key => localStorage.getItem(key), key); }
async function rename(page, name, immediateReload=false) {
  await fileAction(page, 'rename'); await page.locator('#name-input').fill(name);
  if(immediateReload) {
    await Promise.all([page.waitForEvent('load'), page.evaluate(() => { document.getElementById('dialog-submit').click(); location.reload(); })]);
    await ready(page);
  } else await page.locator('#dialog-submit').click();
}
(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  let server;
  if(!supplied) {
    server = http.createServer(async (request, response) => {
      const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
      const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
      if(!file.startsWith(root + path.sep)) return response.writeHead(403).end();
      try { response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'); response.end(await fs.readFile(file)); }
      catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  }
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`, origin = new URL(url).origin;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  async function check(name, seeds, test, init) {
    const context = await browser.newContext({viewport:{width:1280,height:844},storageState:{cookies:[],origins:[{origin,localStorage:seeds}]}});
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    try {
      if(init) await page.addInitScript(init);
      await page.goto(url); await ready(page);
      assert.equal(await page.locator('#dialog').isVisible(), false);
      await test(page); assert.deepEqual(errors, []); console.log('PASS ' + name);
    } finally { await context.close(); }
  }
  try {
    const explicit = fixture('明示保存した作品A', 2), automatic = C.clone(explicit); automatic.name = '編集中の作品A';
    const recent = fixture('保存日時は新しい作品B');
    const seeds = [slot(explicit,'work_A','saved','27'),slot(automatic,'work_A','auto','28'),slot(recent,'work_B','saved','29')];
    await check('last active work and page; old candidates remain selectable', [...seeds,resume(automatic,'work_A',true,1)], async page => {
      let value = await read(page);
      assert.deepEqual(value.document, automatic); assert.equal(value.tabs.length, 1); assert.equal(value.state.pageId, automatic.pages[1].id);
      assert.equal(value.state.dirty, true); assert.equal(value.tabs[0].destination, 'browser');
      await fileAction(page, 'recovery'); assert.equal(await page.locator('[data-recovery]').count(), 3);
      await page.locator('[data-recovery]').filter({hasText:'明示保存した作品A'}).click();
      await page.waitForFunction(() => IlapoEditor.getDocuments().length === 2);
      await reload(page); value = await read(page);
      assert.deepEqual(value.document, explicit); assert.equal(value.state.dirty, false); assert.equal(value.tabs.length, 1);
      for(const seed of seeds) assert.equal(await stored(page, seed.name), seed.value, '開くだけでは保存候補を書き換えない');
      await fileAction(page, 'save'); assert.equal(await page.locator('#dialog').isVisible(), false, 'ブラウザの保存先を継続');
    });
    await check('legacy startup selects the newest valid candidate once', seeds, async page => {
      assert.deepEqual((await read(page)).document, recent);
      for(const seed of seeds) assert.equal(await stored(page, seed.name), seed.value);
      await fileAction(page, 'new'); await page.waitForFunction(() => IlapoEditor.getDocuments().length === 2);
      const blank = (await read(page)).document; await reload(page);
      assert.deepEqual((await read(page)).document, blank, '未編集の新規作品を旧保存候補で置き換えない');
    });
    const legacy = {name:'kaijo-ilapo:auto',value:JSON.stringify({kind:'auto',at:'2026-09-29T00:00:00.000Z',document:automatic})};
    await check('original two-key saves migrate without being overwritten', [legacy], async page => {
      assert.deepEqual((await read(page)).document, automatic); assert.equal((await read(page)).state.dirty, true);
      await reload(page); assert.deepEqual((await read(page)).document, automatic); assert.equal(await stored(page, legacy.name), legacy.value);
    });
    await check('new files, page changes and last-selected tabs', [], async page => {
      const file = fixture('ファイルから開いた作品', 2), a = await load(page, file);
      await page.locator('#pages-toggle').click(); await page.locator('[data-page-pick="1"]').click();
      await reload(page); assert.deepEqual((await read(page)).document, file); assert.equal((await read(page)).state.pageId, file.pages[1].id);
      assert.equal((await read(page)).state.dirty, false); assert.equal((await read(page)).tabs[0].destination, null);
      const first = (await read(page)).state.sessionId;
      await load(page, recent); await rename(page, '後から編集した作品B');
      await page.locator(`[data-document-tab="${first}"]`).click(); await page.waitForFunction(id => IlapoEditor.getState().sessionId === id, first);
      await reload(page); assert.deepEqual((await read(page)).document, file);
      assert.equal((await read(page)).tabs.length, 1); assert(a);
    });
    await check('immediate reload flushes committed edits without overwriting manual save', [seeds[0],resume(explicit,'work_A')], async page => {
      await rename(page, '450msを待たず再読み込み', true);
      assert.equal((await read(page)).document.name, '450msを待たず再読み込み'); assert.equal((await read(page)).state.dirty, true);
      assert.equal(await stored(page, seeds[0].name), seeds[0].value);
      await fileAction(page, 'save'); await reload(page); assert.equal((await read(page)).state.dirty, false);
      assert.equal((await read(page)).document.name, '450msを待たず再読み込み');
    });
    await check('successive dirty edits always resume the newest content', [seeds[0],resume(automatic,'work_A',true)], async page => {
      await rename(page, '未保存の続き・1');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('kaijo-ilapo:resume')).document.name === '未保存の続き・1');
      await rename(page, '未保存の続き・2');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('kaijo-ilapo:resume')).document.name === '未保存の続き・2');
      await rename(page, '未保存の続き・3', true);
      assert.equal((await read(page)).document.name, '未保存の続き・3'); assert.equal((await read(page)).state.dirty, true);
      assert.equal(await stored(page, seeds[0].name), seeds[0].value);
    });
    await check('closing the active work resumes the remaining work; final close starts blank', [], async page => {
      const first = (await read(page)).state.sessionId;
      const a = await load(page, explicit), b = await load(page, recent);
      await page.locator(`[data-document-close="${first}"]`).click();
      await page.locator(`[data-document-close="${b}"]`).click(); await page.waitForFunction(id => IlapoEditor.getState().sessionId === id, a);
      await reload(page); assert.deepEqual((await read(page)).document, explicit);
      await rename(page, '閉じる作品'); const active = (await read(page)).state.sessionId;
      await page.locator(`[data-document-close="${active}"]`).click(); await page.locator('#document-close-discard').click();
      await page.waitForFunction(() => IlapoEditor.getDocument().name === '無題の作品');
      const blank = (await read(page)).document; await reload(page); assert.deepEqual((await read(page)).document, blank);
      await fileAction(page, 'recovery'); assert(await page.locator('[data-recovery]').filter({hasText:'閉じる作品'}).count(), '閉じても自動保存を保持');
    });
    await check('corrupt resume never erases valid saved works', [seeds[0],{name:resumeKey,value:'{broken'}], async page => {
      assert.equal((await read(page)).document.name, '無題の作品'); assert.equal(await stored(page, resumeKey), '{broken');
      await page.locator('#toast').filter({hasText:'復元できませんでした'}).waitFor();
      await fileAction(page, 'recovery'); await page.locator('[data-recovery]').click(); await reload(page);
      assert.deepEqual((await read(page)).document, explicit); assert.equal(await stored(page, seeds[0].name), seeds[0].value);
    });
    await check('quota failure preserves current editing and older saved copies', [seeds[0],resume(explicit,'work_A')], async page => {
      const before = await stored(page, resumeKey); await rename(page, '保存容量が不足しても編集を保持');
      await page.locator('#toast').filter({hasText:'次回再開用の記録を保存できませんでした'}).waitFor();
      assert.equal((await read(page)).document.name, '保存容量が不足しても編集を保持'); assert.equal((await read(page)).state.dirty, true);
      assert.equal(await stored(page, resumeKey), before); assert.equal(await stored(page, seeds[0].name), seeds[0].value);
    }, () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if(key === 'kaijo-ilapo:resume') throw new DOMException('quota', 'QuotaExceededError'); return set.call(this,key,value); }; });
    await check('storage read failure leaves the editor usable', seeds, async page => {
      assert.equal((await read(page)).document.name, '無題の作品');
      await page.locator('#toast').filter({hasText:'復元できませんでした'}).waitFor();
      await fileAction(page, 'recovery'); assert.equal(await page.locator('[data-recovery]').count(), 3);
      await page.locator('#dialog-cancel').click(); await load(page, explicit);
      assert.deepEqual((await read(page)).document, explicit);
    }, () => { const get = Storage.prototype.getItem; Storage.prototype.getItem = function(key) { if(key === 'kaijo-ilapo:resume') throw new DOMException('blocked', 'SecurityError'); return get.call(this,key); }; });
    await check('unavailable browser storage does not stop file editing', [], async page => {
      await page.locator('#toast').filter({hasText:'復元できませんでした'}).waitFor();
      await load(page, explicit); assert.deepEqual((await read(page)).document, explicit);
      await rename(page, 'ブラウザ保存なしで編集'); assert.equal((await read(page)).document.name, 'ブラウザ保存なしで編集');
    }, () => { Object.defineProperty(window,'localStorage',{get() { throw new DOMException('blocked','SecurityError'); }}); });
  } finally { await browser.close(); if(server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });
