/* illustSlide: 右パネルの横並べ・狭い画面切替・保存復元の回帰。 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const C = require('../core.js');
const { setAppearance } = require('./ui-helpers.cjs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

let serial = 0;
function fixture() {
  const doc = C.createDocument();
  doc.id = `panel-dock-${++serial}`;
  doc.name = `パネル横並べ ${serial}`;
  const page = doc.pages[0];
  page.name = 'ページ1';
  page.board = { width: 640, height: 480, unit: 'px', infinite: false };
  const a = C.makeShape('rect', 90, 100, 150, 90, { fill: '#2563EB', stroke: '#172B4D' });
  a.id = 'dock-a'; a.name = '図形A';
  const b = C.makeShape('ellipse', 350, 220, 120, 100, { fill: '#22C55E', stroke: '#172B4D' });
  b.id = 'dock-b'; b.name = '図形B';
  page.objects = [a, b];
  page.animations = [
    { id: 'dock-motion-a', targets: ['dock-a'], effect: 'fade', mode: 'in', trigger: 'click', duration: 600, delay: 0 },
    { id: 'dock-motion-b', targets: ['dock-b'], effect: 'move', trigger: 'click', duration: 500, delay: 0, dx: 24, dy: 0 }
  ];
  const second = C.createPage('ページ2', page.board);
  second.objects = [C.makeShape('rect', 160, 140, 100, 80, { fill: '#F59E0B', stroke: '#172B4D' })];
  doc.pages.push(second);
  return doc;
}

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const read = page => page.evaluate(() => IlapoEditor.getDocument());
const panel = (page, id) => page.locator(`#${id}`);

async function load(page, doc = fixture()) {
  await page.locator('#file-input').setInputFiles({ name: 'panel-dock.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await page.waitForFunction(name => IlapoEditor.getDocument().name === name || document.getElementById('dialog').open, doc.name);
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(name => IlapoEditor.getDocument().name === name, doc.name);
  await settle(page);
  return doc;
}

async function select(page, id) {
  await page.locator('#canvas').focus();
  await page.keyboard.press('v');
  await page.locator(`#artwork [data-object="${id}"]`).click();
  await settle(page);
}

async function openStyle(page) {
  if (!await panel(page, 'inspector-panel').isVisible() || await page.locator('#inspector-panel #color-hex').count() === 0) await page.locator('#style-button').click();
  await page.locator('#inspector-panel').waitFor();
  await settle(page);
}

async function openSection(page, id) {
  await page.locator(`#${id}`).click();
  if (await panel(page, 'inspector-panel').isHidden()) await page.locator(`#${id}`).click();
  await page.locator('#inspector-panel').waitFor();
  await settle(page);
}

async function dockState(page) {
  return page.evaluate(() => {
    const rect = id => { const node = document.getElementById(id); if (!node) return null; const r = node.getBoundingClientRect(); return { x:r.x, right:r.right, y:r.y, bottom:r.bottom, width:r.width, height:r.height, hidden:node.hidden }; };
    return {
      primary: rect('inspector-panel'), pinned: rect('pinned-inspector-panel'), dock: rect('panel-dock'),
      slots: [...document.querySelectorAll('#panel-dock-switcher [data-dock-slot]')].map(node => ({ slot:node.dataset.dockSlot, pressed:node.getAttribute('aria-pressed'), hidden:node.hidden })),
      overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1,
      canvas: rect('canvas')
    };
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await context.newPage();
  const errors = [], failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(() => !!window.IlapoEditor);
    const original = await load(page);
    await select(page, 'dock-a');
    await openSection(page, 'objects-toggle');
    assert(await page.locator('#inspector-pin').isVisible(), '現在の右パネルに横並べて残すボタンを表示する');
    const beforePin = JSON.stringify(await read(page));
    await page.locator('#inspector-pin').click();
    await settle(page);
    assert(await panel(page, 'pinned-inspector-panel').isVisible(), '現在のセクションをpinnedへ移す');
    assert.equal(JSON.stringify(await read(page)), beforePin, 'pin状態は作品データを変更しない');

    // 2つ目のセクションはprimary側に開き、広い画面では横に並ぶ。
    await openSection(page, 'animation-toggle');
    let state = await dockState(page);
    assert(state.primary && state.pinned && state.dock, `panel-dock is present: ${JSON.stringify(state)}`);
    assert(state.primary.x >= state.pinned.right - 1 || state.pinned.x >= state.primary.right - 1, `wide viewport keeps both panels side by side: ${JSON.stringify(state)}`);
    assert.equal(state.overflow, false, '広い画面でも横overflowを出さない');
    assert(state.canvas && state.canvas.width > 180 && state.canvas.height > 120, '2パネル時もキャンバスを残す');

    // pinnedのレイヤー選択・可視切替は隣の動き一覧へ反映し、Undoで戻せる。
    await page.locator('#pinned-inspector-panel [data-object-pick="dock-a"]').click(); await settle(page);
    assert.equal(await page.locator('#pinned-inspector-panel [data-object-pick="dock-a"]').getAttribute('aria-pressed'), 'true');
    const motionRow = page.locator('#inspector-panel .animation-row').filter({ hasText: '図形A' });
    assert.equal(await motionRow.count(), 1, '隣の動きパネルに選択対象の動きを反映する');
    assert((await motionRow.getAttribute('class')).includes('selected'), '動き一覧で選択対象を表示する');
    await page.locator('#pinned-inspector-panel [data-object-command="visible"][data-object-id="dock-a"]').click(); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'dock-a').visible, false, 'pinnedレイヤーから可視状態を変更する');
    assert((await motionRow.getAttribute('class')).includes('animation-row-unavailable'), '非表示にした対象の動きを再生対象外として表示する');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.notEqual((await read(page)).pages[0].objects.find(o => o.id === 'dock-a').visible, false, 'pinnedレイヤーの可視切替をUndoできる');
    assert(!(await motionRow.getAttribute('class')).includes('animation-row-unavailable'), 'Undo後に動きの再生対象へ戻す');
    await page.locator('#pinned-inspector-panel [data-object-pick="dock-a"]').click(); await settle(page);
    assert((await motionRow.getAttribute('class')).includes('selected'), '再選択後に動き一覧の対象を戻す');

    // 独立した入力・選択・Undo。pinned の書式入力は図形A、primary側の変更は図形Bへ適用する。
    await select(page, 'dock-b');
    await openStyle(page);
    assert(await panel(page, 'pinned-inspector-panel').isVisible(), 'primaryを切り替えてもpinnedを維持する');
    const primaryInput = page.locator('#inspector-panel #color-hex');
    assert.equal(await primaryInput.count(), 1, 'primary側の入力欄を表示する');
    await primaryInput.fill('#EC4899'); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'dock-b').style.fill, '#EC4899', 'primary側入力は現在の選択へ反映する');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'dock-b').style.fill, '#22C55E', 'primary側のUndoが動作する');
    const afterEdits = JSON.stringify(await read(page));
    await page.locator('#pinned-inspector-unpin').click(); await settle(page);
    assert(await panel(page, 'pinned-inspector-panel').isHidden(), 'pinned側の解除で横並べを解除する');
    assert.deepEqual(await read(page), JSON.parse(afterEdits), '解除でも作品データを変更しない');

    // 作品／ページ切替で古いpinned内容を別の対象へ誤適用しない。
    await openSection(page, 'objects-toggle');
    await page.locator('#inspector-pin').click(); await settle(page);
    const beforePageChange = JSON.stringify(await read(page));
    await page.locator('#page-status').click(); await settle(page);
    const pageButton = page.locator('#inspector-panel [data-page-pick]').filter({ hasText: 'ページ2' }).first();
    await pageButton.click(); await settle(page);
    assert.equal(JSON.stringify(await read(page)), beforePageChange, 'ページ切替だけでは作品を変更しない');
    await page.locator('#document-list-button').click(); await settle(page);
    await page.keyboard.press('Escape'); await settle(page);

    // 狭い幅ではswitcherで片方ずつ表示し、広い幅へ戻すと横並びを復元する。
    for (const width of [1119, 390, 320]) {
      await page.setViewportSize({ width, height: 760 });
      await setAppearance(page, { theme: width === 390 ? 'dark' : 'light', size: width === 320 ? 'xlarge' : 'standard' });
      await settle(page);
      state = await dockState(page);
      assert.equal(state.overflow, false, `${width}pxで横overflowを出さない`);
      assert(state.canvas && state.canvas.width > 120, `${width}pxでもキャンバスを残す`);
      assert.equal(state.slots.length >= 2, true, `${width}pxでpanel-dock-switcherを提供する`);
      const visibleSlots = state.slots.filter(slot => !slot.hidden);
      assert(visibleSlots.length >= 2, `${width}pxでprimary/pinnedの切替ボタンを表示する`);
      const pinnedSwitch = page.locator('#panel-dock-switcher [data-dock-slot="pinned"]');
      const primarySwitch = page.locator('#panel-dock-switcher [data-dock-slot="primary"]');
      await pinnedSwitch.click(); await settle(page);
      assert(await panel(page, 'pinned-inspector-panel').isVisible(), `${width}pxでpinnedを選択できる`);
      assert(await panel(page, 'inspector-panel').isHidden(), `${width}pxでprimaryを隠す`);
      await primarySwitch.click(); await settle(page);
      assert(await panel(page, 'inspector-panel').isVisible(), `${width}pxでprimaryへ戻れる`);
      await page.screenshot({ path: `/private/tmp/illustslide-panel-dock-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 860 }); await settle(page);
    state = await dockState(page);
    assert(state.primary && state.pinned, '幅を戻すと2パネルを再表示する');
    await page.screenshot({ path: '/private/tmp/illustslide-panel-dock-wide.png' });

    // 各closeとEscapeは対象パネルだけを閉じる。
    await page.locator('#pinned-inspector-close').click(); await settle(page);
    assert(await panel(page, 'inspector-panel').isVisible(), 'pinnedのcloseはprimaryを閉じない');
    await page.keyboard.press('Escape'); await settle(page);
    assert(await panel(page, 'inspector-panel').isHidden(), 'Escapeは対象primaryだけを閉じる');

    // 逆配置: animationをpinned、layersをmainにして、pinned側の即時編集とUndoを確認する。
    await page.locator('#page-status').click(); await settle(page);
    await page.locator('#inspector-panel [data-page-pick]').filter({ hasText: 'ページ1' }).first().click(); await settle(page);
    await openSection(page, 'animation-toggle');
    await page.locator('#inspector-pin').click(); await settle(page);
    await openSection(page, 'objects-toggle');
    const pinnedAnimation = page.locator('#pinned-inspector-panel [data-animation-edit="0"]');
    await pinnedAnimation.click(); await settle(page);
    const pinnedDuration = page.locator('#pinned-inspector-panel #animation-duration');
    assert.equal(await pinnedDuration.count(), 1, 'pinned animationフォームを表示する');
    await pinnedDuration.fill('0.9'); await settle(page);
    assert.equal((await read(page)).pages[0].animations[0].duration, 900, 'pinned animation入力を即時反映する');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.equal((await read(page)).pages[0].animations[0].duration, 600, 'pinned animation入力をUndoできる');
    await page.locator('#pinned-inspector-panel [data-animation-close-edit="0"]').click(); await settle(page);

    // 幅を個別に保存し、狭い画面を経由しても幅設定を保持する。
    await page.setViewportSize({ width: 1440, height: 860 }); await settle(page);
    await page.locator('#inspector-resize').focus(); await page.keyboard.press('ArrowLeft'); await settle(page);
    await page.locator('#pinned-inspector-resize').focus(); await page.keyboard.press('ArrowLeft'); await settle(page);
    const widthsBeforeNarrow = await page.evaluate(() => ({ primary: document.getElementById('inspector-resize').getAttribute('aria-valuenow'), pinned: document.getElementById('pinned-inspector-resize').getAttribute('aria-valuenow') }));
    await page.setViewportSize({ width: 390, height: 760 }); await settle(page);
    await page.setViewportSize({ width: 1440, height: 860 }); await settle(page);
    const widthsAfterNarrow = await page.evaluate(() => ({ primary: document.getElementById('inspector-resize').getAttribute('aria-valuenow'), pinned: document.getElementById('pinned-inspector-resize').getAttribute('aria-valuenow') }));
    assert.deepEqual(widthsAfterNarrow, widthsBeforeNarrow, '狭い画面を経由してもprimary/pinnedの幅設定を保持する');
    await page.screenshot({ path: '/private/tmp/illustslide-panel-dock-layers-animation-wide.png' });

    // 作品タブを切り替えても、同じパネルIDの内容を前作品から持ち越さない。
    const originalTab = page.locator('[data-document-tab]').filter({ hasText: 'パネル横並べ' }).first();
    await page.locator('#file-button').click();
    const documentCount = await page.locator('[data-document-tab]').count();
    await page.locator('#command-menu [data-action="new"]').click();
    await page.waitForFunction(count => IlapoEditor.getDocuments().length === count + 1, documentCount);
    assert.equal(await page.locator('#pinned-inspector-panel [data-animation-edit="0"]').count(), 0, '別作品ではpinned動き一覧を前作品から持ち越さない');
    await originalTab.click(); await settle(page);
    assert.equal(await page.locator('#pinned-inspector-panel [data-animation-edit="0"]').count(), 1, '元作品へ戻すとpinned動き一覧を復元する');

    // dock設定が保存され、リロード後も復元される。作品データは比較用に保持する。
    const savedDocument = await read(page);
    const dockStorage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => /dock|inspector/i.test(key)).map(key => [key, localStorage.getItem(key)])));
    assert(Object.keys(dockStorage).length > 0, '横並べ設定をlocalStorageへ保存する');
    await page.waitForTimeout(700);
    await page.reload(); await page.waitForFunction(() => !!window.IlapoEditor);
    const recovery = page.locator('#dialog .recovery').filter({ hasText: savedDocument.name }).first();
    if (await recovery.isVisible()) await recovery.click();
    await page.waitForFunction(name => IlapoEditor.getDocument().name === name, savedDocument.name);
    await settle(page);
    const restored = await read(page);
    assert.deepEqual(restored, savedDocument, 'リロードで作品データを変えない');
    const restoredState = await dockState(page);
    assert.equal(restoredState.overflow, false, 'リロード後も横overflowを出さない');
    assert(restoredState.canvas && restoredState.canvas.width > 120, 'リロード後もキャンバスを残す');
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log('illustSlide panel dock browser tests passed.');
  } finally {
    await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
