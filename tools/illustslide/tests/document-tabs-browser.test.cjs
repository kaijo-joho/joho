/* Run: node tools/illustslide/tests/document-tabs-browser.test.cjs [http://127.0.0.1:port/illustslide/] */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function serve() {
  const server = http.createServer(async (request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/illustslide/`, close: () => new Promise(resolve => server.close(resolve)) };
}

async function fileAction(page, action) {
  await page.locator('#file-button').click();
  await page.locator(`#command-menu [data-action="${action}"]`).click();
}

async function newDocument(page) {
  const before = (await documents(page)).length;
  await fileAction(page, 'new');
  await page.waitForFunction(count => IlapoEditor.getDocuments().length === count + 1, before);
  return (await page.evaluate(() => IlapoEditor.getDocuments())).at(-1);
}

async function rename(page, name) {
  await fileAction(page, 'rename');
  await page.locator('#name-input').fill(name);
  await page.locator('#dialog-submit').click();
  await page.waitForFunction(() => !document.getElementById('dialog').open);
}

async function addShape(page, kind, position) {
  await page.locator(`[data-tool="${kind}"]`).click();
  await page.locator('#canvas').click({ position });
  await page.waitForFunction(() => IlapoEditor.getDocument().pages[0].objects.length > 0);
  await sleep(20);
}

async function selectSession(page, id) {
  await page.locator('[data-document-tab]').evaluateAll((tabs, target) => {
    const tab = tabs.find(node => node.dataset.documentTab === target);
    if (!tab) throw new Error(`tab not found: ${target}`);
    tab.click();
  }, id);
  await page.waitForFunction(target => IlapoEditor.getState().sessionId === target, id);
}

async function documents(page) { return page.evaluate(() => IlapoEditor.getDocuments()); }
async function currentDocument(page) { return page.evaluate(() => IlapoEditor.getDocument()); }

async function saveBrowserFromDialog(page) {
  await page.locator('#document-save-browser').click();
  await page.waitForFunction(() => !document.getElementById('dialog').open);
}

async function run() {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  const hosting = supplied ? { url: supplied, close: async () => {} } : await serve();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(hosting.url);
    await page.waitForFunction(() => !!window.IlapoEditor && !!window.IlapoDocumentTabs);
    // A clean context starts with one session and no recovery modal.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.IlapoEditor);
    if (await page.locator('#dialog').isVisible()) await page.locator('#dialog-cancel').click();

    const first = (await documents(page))[0];
    await rename(page, '作品A');
    await addShape(page, 'rect', { x: 250, y: 180 });
    await page.locator('[data-action="zoom-in"]').click();
    const firstCamera = await page.evaluate(() => IlapoEditor.getCamera());
    const firstDocument = await currentDocument(page);

    await newDocument(page); await rename(page, '作品B'); await addShape(page, 'ellipse', { x: 300, y: 220 });
    const second = (await documents(page)).find(d => d.active);
    await newDocument(page); await rename(page, '作品C'); await addShape(page, 'rect', { x: 340, y: 250 });
    const third = (await documents(page)).find(d => d.active);
    let all = await documents(page);
    assert.equal(all.length, 3, '3作品を同時に開ける');
    assert.equal(new Set(all.map(d => d.id)).size, 3, 'タブIDは作品セッションごとに異なる');
    assert.deepEqual(all.map(d => d.name), ['作品A', '作品B', '作品C']);

    // Contents, history and view state belong to each tab.
    await selectSession(page, first.id);
    assert.equal((await currentDocument(page)).pages[0].objects.length, 1, '作品Aの内容を保持');
    await page.locator('[data-action="undo"]').click();
    assert.equal((await currentDocument(page)).pages[0].objects.length, 0, '作品AだけUndoできる');
    await page.locator('[data-action="redo"]').click();
    assert.equal((await currentDocument(page)).pages[0].objects.length, 1, '作品AだけRedoできる');
    await page.locator('[data-document-tab]').filter({ hasText: '作品A' }).focus();
    await page.keyboard.press('Meta+z');
    assert.equal((await currentDocument(page)).pages[0].objects.length, 0, '選択中タブにフォーカスしたMeta+Zでその作品だけUndo');
    await page.keyboard.press('Meta+Shift+z');
    assert.equal((await currentDocument(page)).pages[0].objects.length, 1, '選択中タブのMeta+Shift+ZでRedo');
    await selectSession(page, second.id);
    assert.equal((await currentDocument(page)).pages[0].objects.length, 1, '作品Bの内容を保持');
    const secondCameraBefore = await page.evaluate(() => IlapoEditor.getCamera());
    assert.notDeepEqual(secondCameraBefore, firstCamera, 'ズーム状態は作品ごとに分離');
    await page.locator('[data-action="undo"]').click();
    assert.equal((await currentDocument(page)).pages[0].objects.length, 0, '作品BのUndoが作品Aへ波及しない');
    await selectSession(page, first.id);
    assert.equal((await currentDocument(page)).pages[0].objects.length, 1, '作品Aの内容は作品BのUndoで変わらない');

    // Re-opening the same document id creates an independent session/storage slot.
    const sameDocument = JSON.stringify(firstDocument);
    await fileAction(page, 'open-file');
    await page.locator('#file-input').setInputFiles({ name: 'same-id.json', mimeType: 'application/json', buffer: Buffer.from(sameDocument) });
    await sleep(250);
    await page.waitForFunction(count => IlapoEditor.getDocuments().length === count + 1, all.length);
    const reopened = (await documents(page)).find(d => d.active);
    all = await documents(page);
    assert.equal((await currentDocument(page)).id, firstDocument.id, '同じ作品IDを再度開く');
    assert.notEqual(reopened.id, first.id, '同一作品IDでもセッションIDは独立する');
    assert.notEqual(reopened.storageId, first.storageId, '同一作品IDでも保存スロットは独立する');

    // Autosave and explicit browser save use separate entries for the same tab.
    await addShape(page, 'rect', { x: 420, y: 280 });
    await sleep(700);
    const storageBefore = await page.evaluate(() => Object.keys(localStorage).filter(key => /:document:/.test(key)));
    assert(storageBefore.some(key => key.endsWith(':auto')), '自動保存を作成');
    await page.keyboard.press('Control+s');
    await page.locator('#document-save-browser').waitFor({ state: 'visible' });
    await saveBrowserFromDialog(page);
    const storageAfter = await page.evaluate(() => Object.keys(localStorage).filter(key => /:document:/.test(key)));
    assert(storageAfter.some(key => key.endsWith(':auto')) && storageAfter.some(key => key.endsWith(':saved')), '自動保存と明示保存を別に保持');
    assert.equal((await documents(page)).find(d => d.active).destination, 'browser', '明示保存先をタブ状態へ反映');

    // Recovery opens another tab and keeps the original sessions.
    const countBeforeRecovery = (await documents(page)).length;
    await fileAction(page, 'recovery');
    await page.locator('[data-recovery]').first().click();
    await page.waitForFunction(count => IlapoEditor.getDocuments().length === count + 1, countBeforeRecovery);
    assert.equal((await documents(page)).length, countBeforeRecovery + 1, '復旧内容を別タブで開く');
    assert((await documents(page)).some(d => d.id === first.id), '復旧しても元タブを保持');

    // Dirty close: cancel, discard, and the initial save chooser.
    const dirtyTab = (await documents(page)).find(d => d.active);
    await addShape(page, 'ellipse', { x: 480, y: 300 });
    await page.locator(`[data-document-close]`).evaluateAll((buttons, target) => buttons.find(b => b.dataset.documentClose === target).click(), dirtyTab.id);
    await page.locator('#document-close-save').waitFor({ state: 'visible' });
    await page.locator('#dialog-cancel').click();
    assert((await documents(page)).some(d => d.id === dirtyTab.id), '閉じるキャンセルでタブを保持');
    await page.locator(`[data-document-close]`).evaluateAll((buttons, target) => buttons.find(b => b.dataset.documentClose === target).click(), dirtyTab.id);
    await page.locator('#document-close-discard').click();
    await page.waitForFunction(target => !IlapoEditor.getDocuments().some(d => d.id === target), dirtyTab.id);

    const initialSaveTab = (await documents(page)).find(d => d.dirty && d.destination === null);
    assert(initialSaveTab, '初回保存選択用の未保存タブを確保');
    await selectSession(page, initialSaveTab.id);
    await page.locator(`[data-document-close]`).evaluateAll((buttons, target) => buttons.find(b => b.dataset.documentClose === target).click(), initialSaveTab.id);
    await page.locator('#document-close-save').click();
    await page.locator('#document-save-browser').waitFor({ state: 'visible' });
    await saveBrowserFromDialog(page);
    await page.waitForFunction(target => !IlapoEditor.getDocuments().some(d => d.id === target), initialSaveTab.id);

    // Invalid input must not replace the active tab, its contents, or its history.
    const invalidBefore = await documents(page);
    const invalidSession = invalidBefore.find(d => d.active);
    await addShape(page, 'rect', { x: 520, y: 320 });
    const invalidState = { sessionId: (await page.evaluate(() => IlapoEditor.getState())).sessionId, document: await currentDocument(page) };
    await fileAction(page, 'open-file');
    await page.locator('#file-input').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{ definitely not JSON') });
    await page.waitForFunction(() => !document.getElementById('toast').hidden && document.getElementById('toast').textContent.length > 0);
    assert.equal((await documents(page)).length, invalidBefore.length, '不正JSONでタブ数を変更しない');
    assert.equal((await page.evaluate(() => IlapoEditor.getState())).sessionId, invalidState.sessionId, '不正JSONでactive tabを変更しない');
    assert.deepEqual(await currentDocument(page), invalidState.document, '不正JSONで内容を変更しない');
    await page.locator('#canvas').focus();
    await page.keyboard.press('Meta+z');
    assert.equal((await currentDocument(page)).pages[0].objects.length, invalidState.document.pages[0].objects.length - 1, '不正JSON後も元のUndo履歴を保持');
    await page.keyboard.press('Meta+Shift+z');
    assert.equal((await currentDocument(page)).pages[0].objects.length, invalidState.document.pages[0].objects.length, '不正JSON後も元のRedo履歴を保持');

    // Wide and coarse narrow layouts retain a single toolbar row and a visible selected tab.
    const wide = await page.evaluate(() => {
      const top = document.querySelector('.top').getBoundingClientRect();
      const workspace = document.querySelector('#document-workspace').getBoundingClientRect();
      const selected = document.querySelector('.document-tab-item.is-active').getBoundingClientRect();
      const tabs = document.querySelector('#document-tabs').getBoundingClientRect();
      return { topHeight: top.height, workspaceHeight: workspace.height, selectedVisible: selected.left >= tabs.left - 1 && selected.right <= tabs.right + 1 };
    });
    assert(wide.topHeight <= 80 && wide.workspaceHeight > 0 && wide.selectedVisible, '1280pxで上部1行と選択タブを維持');
    const wideLabelBox = await page.locator('.document-tab-item.is-active .document-tab-label').boundingBox();
    const wideCloseBox = await page.locator('.document-tab-item.is-active [data-document-close]').boundingBox();
    assert(wideLabelBox && wideLabelBox.width > 0 && wideCloseBox && wideCloseBox.width > 0, '1280pxで選択タブ名と閉じるボタンが見える');
    await page.screenshot({ path: '/private/tmp/illustslide-document-tabs-1280.png' });
    await page.locator('#document-list-button').click();
    assert(await page.locator('#command-menu [data-document-pick]').count() > 0, '作品一覧メニューを開ける');
    await page.keyboard.press('Escape');
    const desktopTabs = page.locator('[data-document-tab]');
    await desktopTabs.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-document-tab][aria-selected="true"]').evaluate(node => node === document.activeElement), true, '左右キーでタブフォーカスと選択を同期');

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true });
    const touch = await touchContext.newPage();
    touch.setDefaultTimeout(12000);
    await touch.goto(hosting.url);
    await touch.waitForFunction(() => !!window.IlapoEditor);
    if (await touch.locator('#dialog').isVisible()) await touch.locator('#dialog-cancel').click();
    for (let i=0;i<5;i++){await newDocument(touch);await rename(touch,'長い作品名のタブ '+i);}
    await touch.locator('#settings-button').tap();
    await touch.locator('[data-theme-choice="dark"]').tap();await touch.locator('[data-ui-size="xlarge"]').tap();await touch.keyboard.press('Escape');
    await touch.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert(await touch.locator('#document-tabs').evaluate(el=>el.scrollWidth>el.clientWidth),'狭幅でタブ領域を横スクロールできる');
    const narrow = await touch.evaluate(() => {
      const top = document.querySelector('.top').getBoundingClientRect();
      const workspace = document.querySelector('#document-workspace').getBoundingClientRect();
      const selected = document.querySelector('.document-tab-item.is-active').getBoundingClientRect();
      const tabs = document.querySelector('#document-tabs').getBoundingClientRect();
      return { topHeight: top.height, workspaceHeight: workspace.height, selectedVisible: selected.left >= tabs.left - 1 && selected.right <= tabs.right + 1, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert(narrow.topHeight <= 80 && narrow.workspaceHeight > 0 && narrow.selectedVisible && !narrow.overflow, '390px coarseで上部1行・選択タブ・横はみ出しなし');
    const narrowLabelBox = await touch.locator('.document-tab-item.is-active .document-tab-label').boundingBox();
    const narrowCloseBox = await touch.locator('.document-tab-item.is-active [data-document-close]').boundingBox();
    assert(narrowLabelBox && narrowLabelBox.width > 0 && narrowCloseBox && narrowCloseBox.width > 0, '390pxで選択タブ名と閉じるボタンが見える');
    await touch.screenshot({ path: '/private/tmp/illustslide-document-tabs-390-coarse.png' });
    await touch.locator('#document-list-button').tap();
    assert.equal(await touch.locator('#command-menu [data-document-pick]').count(),6,'390pxでも全作品を一覧から選べる');
    await touch.locator('#command-menu [data-document-pick]').first().tap();
    await touch.waitForFunction(()=>IlapoEditor.getDocuments()[0].active);
    assert(await touch.locator('#document-tabs').evaluate(el=>{const r=el.getBoundingClientRect(),active=el.querySelector('.is-active').getBoundingClientRect();return active.left>=r.left-1&&active.right<=r.right+1;}),'一覧から選んだ先頭タブが見える位置まで移動する');
    const tabCount = await touch.locator('[data-document-tab]').count();
    if (tabCount > 1) {
      await touch.locator('[data-document-tab]').first().focus();
      await touch.keyboard.press('ArrowRight');
      assert.equal(await touch.locator('[data-document-tab]').filter({ has: touch.locator('.document-tab-label') }).count() >= 1, true, '狭幅でもキーボードタブ移動を利用できる');
    }
    await touchContext.close();

    // Closing the last remaining tab creates a clean new tab and keeps browser storage.
    const savedKeysBeforeLastClose = await page.evaluate(() => Object.keys(localStorage).filter(key => /:document:/.test(key)).sort());
    async function closeWithDiscard(id) {
      await page.locator('[data-document-close]').evaluateAll((buttons, target) => buttons.find(b => b.dataset.documentClose === target).click(), id);
      if (await page.locator('#document-close-discard').isVisible()) await page.locator('#document-close-discard').click();
      await page.waitForFunction(target => !IlapoEditor.getDocuments().some(d => d.id === target), id);
    }
    while ((await documents(page)).length > 1) {
      const target = (await documents(page)).find(d => d.active);
      await closeWithDiscard(target.id);
    }
    const last = (await documents(page))[0];
    await closeWithDiscard(last.id);
    const afterLastClose = await documents(page);
    assert.equal(afterLastClose.length, 1, '最後のタブを閉じても空の新規タブを1つ残す');
    assert.notEqual(afterLastClose[0].id, last.id, '最後のタブ閉鎖時に新しいセッションを作る');
    assert.equal((await currentDocument(page)).pages[0].objects.length, 0, '最後のタブ閉鎖後は空の作品');
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(key => /:document:/.test(key)).sort()), savedKeysBeforeLastClose, '最後のタブ閉鎖で既存保存を削除しない');

    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('Ilapo document tab browser tests passed');
  } finally {
    await context.close(); await browser.close(); await hosting.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
