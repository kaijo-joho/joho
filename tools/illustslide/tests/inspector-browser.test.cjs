/* 即時反映、Undo、対象切替、非モーダル操作、狭い画面の回帰。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const C = require('../core.js');
const { setAppearance } = require('./ui-helpers.cjs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain'); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
let serial = 0;
function fixture() {
  const doc = C.createDocument(); doc.id = 'inspector-' + (++serial); doc.name = 'パネル確認 ' + serial;
  const page = doc.pages[0]; page.board = { width: 640, height: 480, unit: 'px', infinite: false };
  const a = C.makeShape('rect', 90, 120, 160, 100, { fill: '#2563EB', stroke: '#172B4D' }); a.id = 'a'; a.name = '図形A';
  const b = C.makeShape('ellipse', 350, 220, 120, 100, { fill: '#22C55E', stroke: '#172B4D' }); b.id = 'b'; b.name = '図形B';
  page.objects = [a, b]; doc.pages.push(C.createPage('ページ2', page.board));
  return doc;
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const read = page => page.evaluate(() => IlapoEditor.getDocument());
const shape = (page, id) => page.locator(`#artwork [data-object="${id}"]`);
async function load(page, doc = fixture()) {
  await page.locator('#file-input').setInputFiles({ name: 'inspector.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await page.waitForFunction(name => IlapoEditor.getDocument().name === name || document.getElementById('dialog').open, doc.name);
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(name => IlapoEditor.getDocument().name === name, doc.name); await settle(page);
  return doc;
}
async function select(page, id) { await page.locator('#canvas').focus(); await page.keyboard.press('v'); await shape(page, id).click(); await settle(page); }
async function style(page) { await page.locator('#style-button').click(); await page.locator('#color-hex').waitFor(); await settle(page); }
async function color(page, value) { await page.locator(`[data-color="${value}"]`).click(); await settle(page); }
async function painted(page, id) { return shape(page, id).locator('path').first().getAttribute('fill'); }
async function close(page) { if (await page.locator('#inspector-panel').isVisible()) await page.locator('#inspector-close').click(); await settle(page); }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 } });
  const page = await context.newPage(), errors = [], failed = [];
  const artifacts = await fs.mkdtemp('/private/tmp/illustslide-inspector-');
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(() => !!window.IlapoEditor);
    let before = await load(page); await select(page, 'a');
    await page.locator('#style-button').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert(await page.locator('#tooltip').isVisible(), 'keyboard focus names the icon');
    assert.equal(await page.locator('#tooltip').textContent(), '書式・色');
    await page.keyboard.press('Enter'); await settle(page);
    assert.equal(await page.locator('#dialog').evaluate(el => el.open), false);
    assert.equal(await page.locator('#canvas').evaluate(el => el.closest('[inert]')), null);
    assert.equal(Math.round((await page.locator('#inspector-panel').boundingBox()).width), 320, 'default panel width');
    assert(await page.locator('#inspector-live-note').isVisible(), '即時反映の案内を表示する');
    assert(await page.locator('#inspector-submit').isHidden() && await page.locator('#inspector-reset').isHidden(), '自動反映フォームには適用・変更を戻すを表示しない');
    await color(page, '#EF4444'); await color(page, '#F59E0B');
    assert.equal(await painted(page, 'a'), '#F59E0B', '色はすぐキャンバスへ反映する');
    assert.equal((await read(page)).pages[0].objects[0].style.fill, '#F59E0B', '色はすぐ文書へ保存する');
    await page.waitForTimeout(520);
    assert(await page.evaluate(() => localStorage.getItem('kaijo-ilapo:auto')), '即時変更は自動保存の対象になる');
    assert.equal(await page.locator('.top [data-action=undo]').isDisabled(), false);
    await page.screenshot({ path: path.join(artifacts, 'style-desktop.png') });
    await page.locator('#inspector-close').click(); await settle(page);
    assert.equal(await painted(page, 'a'), '#F59E0B', 'Closeは即時変更を取り消さない');
    assert.equal(await page.locator('#style-button').evaluate(el => document.activeElement === el), true);

    await style(page);
    await page.locator('#color-hex').focus(); await page.locator('#color-hex').fill('#123456');
    const focusBefore = await page.evaluate(() => ({ active:document.activeElement.id, start:document.activeElement.selectionStart, end:document.activeElement.selectionEnd }));
    await settle(page);
    const focusAfter = await page.evaluate(() => ({ active:document.activeElement.id, start:document.activeElement.selectionStart, end:document.activeElement.selectionEnd }));
    assert.deepEqual(focusAfter, focusBefore, '即時反映でフォームを再生成せず入力フォーカスと選択範囲を保つ');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.equal((await read(page)).pages[0].objects[0].style.fill, '#F59E0B', 'パネル内の⌘Zは直前の連続入力を1回で戻す');
    await page.keyboard.press('Shift+Meta+z'); await settle(page);
    assert.equal((await read(page)).pages[0].objects[0].style.fill, '#123456', 'パネル内の⇧⌘Zでやり直せる');

    await page.locator('#color-hex').fill('#EC4899'); await shape(page, 'b').click(); await settle(page);
    assert.match(await page.locator('.inspector-target').textContent(), /図形B/);
    assert.equal(await page.locator('#color-hex').inputValue(), '#22C55E');
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'a').style.fill, '#EC4899', '対象切替前の入力は元の対象へだけ反映する');
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'b').style.fill, '#22C55E', '古い入力が切替先へ漏れない');

    await select(page, 'a'); await page.locator('#selection-transform').click(); await page.locator('#command-menu [data-action=transform]').click(); await settle(page);
    await page.locator('#transform-width').fill('240'); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'a').matrix[0], 1.5, '変形も入力と同時に保存する');
    const changedWidth = await shape(page, 'a').boundingBox();
    await page.locator('#transform-width').fill('0'); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'a').matrix[0], 1.5, '未完・不正な数値は最後の有効値を保持する');
    await page.locator('#transform-width').fill('240'); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'a').matrix[0], 1.5, '同じ絶対変形値を再入力しても変形を二重適用しない');
    assert((await shape(page, 'a').boundingBox()).width >= changedWidth.width - 1, '入力後も変形結果を表示する');
    await page.locator('#transform-width').focus(); await page.keyboard.press('Meta+z'); await settle(page);
    assert.equal((await read(page)).pages[0].objects.find(o => o.id === 'a').matrix[0], 1, '変形は1回のUndoで開始時の大きさへ戻る');

    await select(page, 'a'); await style(page); await color(page, '#EC4899');
    before = await load(page);
    assert.equal(await page.locator('#color-hex').count(), 0, '別の作品を開くと古いフォームを閉じる');
    assert.deepEqual(await read(page), before);
    await select(page, 'b'); await style(page);
    await page.locator('#color-hex').focus(); await page.keyboard.press('Delete'); await page.keyboard.press('v');
    assert.deepEqual(await read(page), before, 'editing controls does not delete or change canvas objects');
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await page.locator('#inspector-panel').isVisible(), false);
    await style(page); await page.locator('#help-button').click();
    assert(await page.locator('#operation-help').isVisible()); assert(await page.locator('#inspector-panel').isVisible());
    await page.keyboard.press('Escape');
    assert(await page.locator('#inspector-panel').isVisible(), 'help and settings close independently');

    await page.locator('.side-tab [data-action=export-toggle]').click(); await settle(page);
    assert(await page.locator('#export-panel').isVisible()); assert.equal(await page.locator('#inspector-panel').isVisible(), false);
    await page.locator('#board-toggle').click(); await settle(page);
    assert.equal(await page.locator('#export-panel').isVisible(), false);

    // Shared themes and text sizes, with an unobscured canvas and reachable actions.
    for (const width of [1280, 736, 390, 320]) {
      for (const [theme, size] of [['light', 'standard'], ['dark', 'large'], ['auto', 'xlarge']]) {
        await page.setViewportSize({ width, height: 736 });
        await page.locator('#view-toggle').click();
        await setAppearance(page,{theme,size}); await settle(page);
        await page.locator('#style-button').click(); await settle(page);
        const dimensions = await page.evaluate(() => {
          const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
          return { canvas:rect('canvas'), panel:rect('inspector-panel'), note:rect('inspector-live-note'), bar:rect('selection-bar'), overflow:document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, icons:[...document.querySelectorAll('#selection-bar button')].filter(b => b.getBoundingClientRect().width).map(b => ({ label:b.getAttribute('aria-label'), svg:!!b.querySelector('svg'), right:b.getBoundingClientRect().right })) };
        });
        assert.equal(dimensions.overflow, false, JSON.stringify({ width, theme, size, dimensions }));
        assert(dimensions.panel.right <= width + 1 && dimensions.note.bottom <= dimensions.panel.bottom + 1);
        assert(dimensions.canvas.height >= 200 && dimensions.canvas.width >= 220);
        assert(dimensions.bar.width <= dimensions.canvas.width && dimensions.icons.every(b => b.label && b.svg && b.right <= dimensions.canvas.right + 1), JSON.stringify({ width, theme, size, dimensions }));
        if (width <= 850) assert(dimensions.panel.y >= dimensions.canvas.bottom - 1, 'mobile panel reserves its own space');
      }
      await page.screenshot({ path: path.join(artifacts, `style-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 320 }); await settle(page);
    assert(await page.evaluate(() => document.getElementById('inspector-live-note').getBoundingClientRect().bottom <= innerHeight && document.getElementById('canvas').getBoundingClientRect().height >= 70), 'short viewport keeps canvas and即時反映の案内を表示する');
    const shortBefore = await read(page);
    await page.locator('#color-hex').fill('#123456');
    await page.locator('#color-hex').evaluate(el => el.scrollIntoView({ block:'center' })); await settle(page);
    assert.equal(await page.locator('#color-hex').inputValue(), '#123456');
    assert.equal(await page.locator('#color-R').count(), 0, '書式パネルはRGBの数値入力を重複して表示しない');
    const shortField = await page.locator('#color-hex').boundingBox(), shortFooter = await page.locator('#inspector-panel footer').boundingBox(), shortPanel = await page.locator('#inspector-panel').boundingBox();
    assert(shortField.y >= shortPanel.y && shortField.y + shortField.height <= shortFooter.y + 1, 'short viewport exposes the input above the fixed footer');
    assert.notDeepEqual(await read(page), shortBefore, 'short viewportでも入力をすぐ保存する');
    await page.screenshot({ path: path.join(artifacts, 'short-viewport.png') });
    assert.equal((await read(page)).pages[0].objects[1].style.fill, '#123456');

    await page.setViewportSize({ width:1280, height:736 }); await settle(page);
    const resize = page.locator('#inspector-resize'); await resize.focus();
    const oldWidth = (await page.locator('#inspector-panel').boundingBox()).width;
    await page.keyboard.press('ArrowLeft'); await settle(page);
    assert((await page.locator('#inspector-panel').boundingBox()).width > oldWidth);
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal((await page.locator('#inspector-panel').boundingBox()).width, oldWidth);
    assert(await page.locator('#inspector-panel').isVisible(), 'Escape first cancels resize');
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await page.locator('#inspector-panel').isVisible(), false);
    await page.setViewportSize({width:1024,height:736}); await page.setViewportSize({width:1280,height:736});
    await page.locator('#board-toggle').click(); await settle(page);
    assert.equal((await page.locator('#inspector-panel').boundingBox()).width, oldWidth, 'resizing the window while closed preserves the panel width');
    await close(page);

    const touchContext = await browser.newContext({ viewport:{width:390,height:736}, hasTouch:true, isMobile:true });
    try {
      const touch = await touchContext.newPage(); touch.on('pageerror', error => errors.push(error.message));
      await touch.goto(`http://127.0.0.1:${server.address().port}/illustslide/`); await touch.waitForFunction(() => !!window.IlapoEditor);
      const touchBefore = await load(touch); await shape(touch, 'a').tap(); await touch.locator('#style-button').tap();
      await touch.locator('[data-color="#EC4899"]').scrollIntoViewIfNeeded(); await touch.locator('[data-color="#EC4899"]').tap(); await settle(touch);
      assert.notDeepEqual(await read(touch), touchBefore, 'touch paletteもすぐ保存する');
      assert.equal((await read(touch)).pages[0].objects[0].style.fill, '#EC4899');
      assert(await touch.locator('#inspector-panel').isVisible());
      await touch.locator('#inspector-close').tap(); assert.equal(await touch.locator('#inspector-panel').isVisible(), false);
    } finally { await touchContext.close(); }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log('illustSlide inspector browser tests passed. Artifacts: ' + artifacts);
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
