/* 上部ツールバー、追加パレット、発表、狭い画面の入口をChromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const C = require('../core.js');
const {startPresentation} = require('./ui-helpers.cjs');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const read = page => page.evaluate(() => IlapoEditor.getDocument());
async function openMenu(page, id) {
  const button = page.locator(id);
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await page.locator('#command-menu').waitFor();
}
async function openSettings(page) { await openMenu(page, '#settings-button'); }
async function chooseAppearance(page, theme, size) {
  await openSettings(page);
  await page.locator(`[data-theme-choice="${theme}"]`).click();
  await page.locator(`[data-ui-size="${size}"]`).click();
  assert.equal(await page.locator('#settings-button').getAttribute('aria-expanded'), 'true', '設定の選択後もメニューを維持する');
  const resolved = theme === 'auto' ? await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  assert.equal(await page.locator('html').getAttribute('data-theme'), resolved, 'テーマを直ちに反映する');
  assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--ui-size').trim()), ({standard:'14px',large:'16px',xlarge:'18px'})[size], '文字サイズを直ちに反映する');
  assert.equal(await page.locator(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator(`[data-ui-size="${size}"]`).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(() => { const stored = JSON.parse(localStorage.getItem('kaijo-ilapo:settings')); return [stored.theme, stored.size]; }), [theme, size], '表示設定を永続化する');
  if (theme === 'auto') {
    for (const colorScheme of ['dark', 'light']) {
      await page.emulateMedia({colorScheme});
      await page.waitForFunction(value => document.documentElement.dataset.theme === value, colorScheme);
      assert.equal(await page.locator('[data-theme-choice="auto"]').getAttribute('aria-pressed'), 'true', 'OS変更後も自動選択を保つ');
    }
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#settings-button').getAttribute('aria-expanded'), 'false', 'Escape で設定を閉じる');
}
function fixture() {
  const doc = C.createDocument(); doc.id = 'toolbar-fixture';
  doc.pages[0].objects = [C.makeShape('rect', 40, 40, 80, 60)];
  doc.pages.push(C.createPage('2ページ目', doc.pages[0].board));
  return doc;
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1280, height:844}}), errors = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    const doc = fixture();
    await page.locator('#file-input').setInputFiles({name:'toolbar.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(doc))});
    await page.waitForFunction(() => IlapoEditor.getDocument().id === 'toolbar-fixture');
    assert.equal(await page.locator('a.brand-link[href="../index.html"]').count(), 1, 'ロゴは tools 一覧へのリンク');
    assert.match(await page.locator('.top .brand').innerText(), /illustSlide/, '上部にアプリ名を表示する');
    assert.equal(await page.locator('.top [data-menu="save"],.top [data-menu="open"],.top [data-menu="more"],.top [data-menu="insert"],.top [data-menu="view"]').count(), 0, '旧来の上部メニューを置かない');
    assert.deepEqual(await page.locator('.top .brand,.top #file-button,.top [data-action="undo"],.top [data-action="redo"],.top #selection-method-button,.top #present-button,.top #document-title,.top #settings-button,.top #help-button').evaluateAll(nodes => nodes.map(node => node.id || node.className)), [
      'brand', 'file-button', 'toolbar-history', 'toolbar-history', 'selection-method-button', 'present-button', 'document-title', 'settings-button', 'help-button'
    ], '上部ツールバーは決められた順序で1行に置く');
    assert.equal(await page.locator('#file-button[data-menu="file"]').count(), 1);
    assert.equal(await page.locator('#selection-method-button[data-menu="select"]').count(), 1);
    assert.equal(await page.locator('#present-button[data-menu="present"]').count(), 1);
    assert.equal(await page.locator('#settings-button[data-menu="settings"]').count(), 1);
    assert.equal(await page.locator('#add-palette [data-action="paste"]').count(), 1, '貼り付けは左パレットへ集約');
    assert.equal(await page.locator('[data-action="import-image"]').count(), 1, '画像追加は左の1か所へ集約');
    assert.equal(await page.locator('#add-palette [data-action="import-svg"]').count(), 1, 'SVG追加は左パレットへ集約');

    await openMenu(page, '#file-button');
    const fileActions = await page.locator('#command-menu [data-action]').evaluateAll(nodes => nodes.map(node => node.dataset.action));
    assert.deepEqual(fileActions.filter(action => action !== 'auto-start' && action !== 'auto-stop').sort(), ['new','open-file','recovery','rename','save-browser','save-local'], 'ファイル操作は1つのメニューへ集約');
    assert(fileActions.some(action => ['auto-start', 'auto-stop'].includes(action)), 'ローカル自動保存の開始・停止をファイルメニューに置く');
    await page.keyboard.press('Escape');
    const beforeFileHover = await read(page);
    await page.locator('#canvas').focus(); await page.locator('#canvas').hover(); await page.locator('#file-button').hover();
    await page.locator('#command-menu').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'canvas', 'ホバーでファイルメニューを開いてもフォーカスを移さない');
    assert.deepEqual(await read(page), beforeFileHover, 'ホバーでファイル操作を実行しない');
    await page.keyboard.press('Escape');
    await page.locator('#file-button').focus(); await page.keyboard.press('ArrowDown');
    const focusedAction = await page.evaluate(() => document.activeElement.dataset.action);
    await page.locator('#settings-button').hover();
    assert.equal(await page.locator('#command-menu').getAttribute('data-menu-kind'), 'file', 'フォーカスがあるメニューを別のホバーで閉じない');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), focusedAction);
    await page.keyboard.press('Escape');
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+s');
    await page.waitForFunction(() => localStorage.getItem('kaijo-ilapo:saved'));
    assert.equal((await read(page)).id, 'toolbar-fixture', 'ブラウザ保存は作品を保つ');

    await openMenu(page, '#selection-method-button');
    assert.deepEqual(await page.locator('#command-menu [data-tool]').evaluateAll(nodes => nodes.map(node => node.dataset.tool)), ['select','pan']);
    assert.equal(await page.locator('#command-menu [data-action="select-all"]').count(), 1);
    await page.locator('#command-menu [data-action="select-all"]').click();
    assert.equal((await page.evaluate(() => IlapoEditor.getSelection())).length, 1);
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+c');
    await page.locator('#add-palette [data-action="paste"]').click();
    await settle(page); assert.equal((await read(page)).pages[0].objects.length, 2);
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(page), doc, '貼り付けは1回のUndoで戻る');

    // 画像は新しい左パレットの入口から実際に読み込める。
    const png = await page.evaluate(() => { const c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillRect(0,0,4,4);return c.toDataURL().split(',')[1]; });
    const choosing = page.waitForEvent('filechooser'); await page.locator('#add-palette [data-action="import-image"]').click();
    await (await choosing).setFiles({name:'sample.png', mimeType:'image/png', buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(() => IlapoEditor.getDocument().pages[0].objects.some(o => o.type==='image'));
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+z'); await settle(page);

    await page.locator('#pages-toggle').click(); await page.locator('[data-page-pick="1"]').click(); await page.locator('#inspector-close').click();
    await startPresentation(page, true); await page.locator('#ilapo-presentation').waitFor();
    assert((await page.locator('.ilapo-present-status').textContent()).startsWith('2 / 2'));
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'present-button');
    await startPresentation(page); await page.locator('#ilapo-presentation').waitFor();
    assert((await page.locator('.ilapo-present-status').textContent()).startsWith('1 / 2'));
    await page.keyboard.press('Escape');

    const savedBeforeAppearance = await page.evaluate(() => localStorage.getItem('kaijo-ilapo:saved'));
    const historyBeforeAppearance = await read(page);
    for (const [theme, size] of [['light','standard'], ['dark','xlarge'], ['auto','large']]) {
      await chooseAppearance(page, theme, size);
      assert.equal(await page.evaluate(() => localStorage.getItem('kaijo-ilapo:saved')), savedBeforeAppearance, '表示設定で保存済み作品を変更しない');
      assert.deepEqual(await read(page), historyBeforeAppearance, '表示設定で作品を変更しない');
      if (theme === 'light') {
        await page.locator('#canvas').focus(); await page.keyboard.press('Meta+Shift+z'); await settle(page);
        assert.notDeepEqual(await read(page), historyBeforeAppearance, '表示設定後も既存のRedoを使える');
        await page.keyboard.press('Meta+z'); await settle(page);
        assert.deepEqual(await read(page), historyBeforeAppearance, '表示設定後もUndoで元の作品へ戻る');
      }
      for (const width of [320,390,560,561,736,850,851,1024,1280]) {
        await page.setViewportSize({width, height:844}); await settle(page);
        const layout = await page.evaluate(() => {
          const top=document.querySelector('.top'), r=top.getBoundingClientRect();
          const buttons=[...top.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>b.getBoundingClientRect());
          const undoRedo=[...top.querySelectorAll('[data-action="undo"],[data-action="redo"]')];
          return {fits:top.scrollWidth<=top.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth+1, oneRow:buttons.every(b=>b.top>=r.top && b.bottom<=r.bottom+1), height:r.height, undoRedoVisible:undoRedo.some(b=>b.getClientRects().length)};
        });
        assert(layout.fits && layout.oneRow, `${theme}/${size}/${width}px: 上部は1行で画面内に収まる`);
        if (width === 1280) assert(Math.abs(layout.height - ({standard:41,large:47,xlarge:53}[size])) <= 1, `${size}の上部ツールバー高を保つ`);
        if (size === 'standard') {
          const button = await page.locator('#file-button').boundingBox();
          assert.equal(button.width,32); assert.equal(button.height,30);
        }
        if (width <= 700) assert.equal(layout.undoRedoVisible, false, '700px以下ではUndo/Redoを上部から隠す');
        assert.equal(await page.locator('#palette-toggle').isVisible(), width<=560);
        await openMenu(page, '#file-button');
        const actions=await page.locator('#command-menu [data-action]').evaluateAll(nodes=>nodes.map(n=>n.dataset.action));
        if (width <= 700) assert(actions.includes('undo') && actions.includes('redo'), '狭幅ではファイルメニューからUndo/Redoできる');
        assert(await page.locator('#command-menu').evaluate(el => { const r=el.getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1; }), '展開したメニューが画面内に収まる');
        assert.equal(await page.locator('#command-menu [data-action="paste"],#command-menu [data-action="import-image"],#command-menu [data-action="import-svg"],#command-menu [data-action="export-playback"]').count(),0);
        await page.keyboard.press('Escape');
      }
    }
    await page.screenshot({path:'/private/tmp/illustslide-toolbar-desktop.png'});
    await page.setViewportSize({width:390, height:844}); await settle(page);
    const before=await read(page);
    await page.locator('#palette-toggle').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#shape-tools [data-tool="rect"]').isVisible());
    assert(await page.evaluate(()=>{const p=document.querySelector('#add-palette'),r=p.getBoundingClientRect(),top=document.querySelector('.top').getBoundingClientRect();return r.width>=180&&p.scrollWidth<=p.clientWidth+1&&Math.abs(r.top-top.bottom)<1;}),'追加パレットは読める幅で上部の直下に開く');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>document.activeElement.id),'palette-toggle');
    await page.locator('#palette-toggle').click(); await page.locator('#canvas').click({position:{x:280,y:300}});
    assert.equal(await page.locator('#palette-toggle').getAttribute('aria-expanded'),'false');
    assert.deepEqual(await read(page),before,'パレット外のクリックは作図せず閉じる');
    await page.locator('#palette-toggle').click(); await page.locator('#toast').waitFor({state:'hidden'}); await page.screenshot({path:'/private/tmp/illustslide-toolbar-mobile.png'});
    await page.locator('#shape-tools [data-tool="rect"]').click();
    assert.equal(await page.locator('#palette-toggle').getAttribute('aria-expanded'),'false');
    await page.locator('#canvas').click({position:{x:160,y:300}}); await settle(page);
    assert.equal((await read(page)).pages[1].objects.length,1);
    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    touch.on('pageerror',error=>errors.push(error.message));
    await touch.goto(url); await touch.waitForFunction(()=>!!window.IlapoEditor);
    await touch.setViewportSize({width:850,height:844}); await settle(touch);
    assert.equal(await touch.locator('.top [data-action="undo"],.top [data-action="redo"]').count(), 2);
    assert.equal(await touch.locator('.top [data-action="undo"]').isVisible(), false, 'coarse pointerの850pxではUndo/Redoを折り畳む');
    await touch.locator('#file-button').tap();
    assert((await touch.locator('#command-menu [data-action]').evaluateAll(nodes => nodes.map(node => node.dataset.action))).includes('undo'), 'coarse pointerでもファイルメニューからUndoできる');
    await touch.locator('#file-button').tap();
    await touch.setViewportSize({width:390,height:844}); await settle(touch);
    assert(await touch.locator('.top').evaluate(el => [...el.querySelectorAll('button,a')].filter(b=>b.getClientRects().length).every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})), 'タッチの操作範囲を44px以上にする');
    await touch.locator('#settings-button').tap(); await touch.locator('[data-theme-choice="dark"]').tap(); await touch.locator('[data-ui-size="xlarge"]').tap();
    assert(await touch.locator('#command-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
    await touch.screenshot({path:'/private/tmp/illustslide-toolbar-settings-touch.png'});
    await touch.keyboard.press('Escape');
    await touch.locator('#palette-toggle').tap(); await touch.locator('#shape-tools [data-tool="rect"]').tap();
    await touch.locator('#canvas').tap({position:{x:160,y:300}}); await settle(touch);
    assert.equal((await read(touch)).pages[0].objects.length,1,'タップで追加ツールを選び作図できる');
    await touch.close(); assert.deepEqual(errors,[]);
    console.log('illustSlide toolbar browser tests passed');
  } finally { await browser.close(); if(!supplied) server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
