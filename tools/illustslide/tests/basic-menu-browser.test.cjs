/* 通常選択の基本メニューから、実際に編集してUndoできることをChromeで確認する。 */
'use strict';
const { setAppearance } = require('./ui-helpers.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const C = require('../core.js');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
let fixtureNumber = 0;
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function serve() {
  const server = http.createServer(async (request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {url:`http://127.0.0.1:${server.address().port}/illustslide/`, close:() => new Promise(resolve => server.close(resolve))};
}
function shape(id, x, y, width, height, options = {}) {
  const object = C.makeShape(options.kind || 'rect', x, y, width, height, {fill:options.fill || '#93C5FD'});
  object.id = object.name = id;
  return object;
}
function fixture(objects) {
  const document = C.createDocument();
  document.id = `basic-menu-${++fixtureNumber}`;
  document.pages[0].board = {width:640,height:400,unit:'px',infinite:false};
  document.pages[0].objects = objects;
  return C.validateDocument(document);
}
async function load(page, document) {
  await page.locator('#file-input').setInputFiles({name:'basic-menu.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(document))});
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id || document.getElementById('dialog').open, document.id);
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
  await settle(page);
}
async function select(page, ids) {
  await page.locator('#canvas').focus();
  await page.keyboard.press('Escape');
  for (const [index, id] of ids.entries()) {
    const target = page.locator(`#artwork [data-object="${id}"]`);
    await target.waitFor({state:'visible'});
    const box = await target.boundingBox();
    assert(box, `図形 ${id} を描画する`);
    if (index) await page.keyboard.down('Shift');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (index) await page.keyboard.up('Shift');
    await settle(page);
  }
}
const read = page => page.evaluate(() => IlapoEditor.getDocument());
const object = (document, id) => document.pages[0].objects.find(value => value.id === id);
async function openMenu(page, button, submenu) {
  await page.locator(button).click();
  await page.locator(`[data-menu-kind="${submenu}"]`).waitFor({state:'visible'});
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  const hosting = supplied ? {url:supplied, close:async()=>{}} : await serve();
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:800}});
  const page = await context.newPage();
  const errors = [];
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'illustslide-basic-menu-'));
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  try {
    await page.goto(hosting.url);
    await page.waitForFunction(() => !!window.IlapoEditor);

    // 単体の通常選択では、使う入口が一列に現れ、旧ショートカットは現れない。
    const single = fixture([shape('one',100,100,80,50)]);
    await load(page, single); await select(page, ['one']);
    const visibleOrder = await page.locator('#selection-bar > button').evaluateAll(nodes => nodes.filter(node => !node.hidden && getComputedStyle(node).display !== 'none').map(node => node.id));
    const expected = ['whole-mode','direct-mode','style-button','text-options','path-menu-button','selection-transform','selection-combine','selection-arrange','selection-group','selection-more'];
    assert.deepEqual(visibleOrder.filter(id => expected.includes(id)), expected.filter(id => visibleOrder.includes(id)), '通常選択の基本入口は学習順に並ぶ');
    for (const id of ['quick-union','quick-subtract','quick-intersect','quick-add-anchor']) assert.equal(await page.locator('#' + id).isVisible(), false, `${id} は通常選択に出さない`);
    assert.equal(await page.locator('#text-options').isVisible(), true, '閉じた図形を1つ選ぶと図形内文字の入口を出す');
    await page.screenshot({path:path.join(artifacts, 'single-basic-bar-1280.png')});

    // 変形メニューから左右反転を実行し、モデルとUndoの両方を確認する。
    const beforeFlip = await read(page);
    await openMenu(page, '#selection-transform', 'selection-transform');
    await page.locator('[data-menu-kind="selection-transform"] [data-action="flip-h"]').click(); await settle(page);
    const flipped = await read(page);
    assert.notDeepEqual(object(flipped, 'one').matrix, object(beforeFlip, 'one').matrix, '変形メニューの反転が図形を変える');
    await page.locator('[data-action="undo"]').click(); await settle(page);
    assert.deepEqual(await read(page), beforeFlip, '反転は1回のUndoで戻る');

    await select(page, ['one']);
    const beforeRotate = await read(page);
    await openMenu(page, '#selection-transform', 'selection-transform');
    await page.locator('[data-menu-kind="selection-transform"] [data-action="rotate-right"]').click(); await settle(page);
    assert.notDeepEqual(object(await read(page), 'one').matrix, object(beforeRotate, 'one').matrix, '変形メニューの90度回転が図形を変える');
    await page.locator('[data-action="undo"]').click(); await settle(page);
    assert.deepEqual(await read(page), beforeRotate, '90度回転は1回のUndoで戻る');

    await select(page, ['one']);
    await openMenu(page, '#selection-group', 'selection-group');
    await page.locator('[data-menu-kind="selection-group"] [data-action="lock"]').click(); await settle(page);
    assert.equal(object(await read(page), 'one').locked, true, '単体を固定できる');
    await openMenu(page, '#selection-group', 'selection-group');
    await page.locator('[data-menu-kind="selection-group"] [data-action="lock"]').click(); await settle(page);
    assert.equal(object(await read(page), 'one').locked, false, '固定した単体を同じ入口で解除できる');

    // 2つのパスでは合成とグループを、表示された入口から実行する。
    const pair = fixture([shape('a',100,100,100,70), shape('b',170,140,100,70)]);
    await load(page, pair); await select(page, ['a','b']);
    assert(await page.locator('#selection-combine').isVisible(), '複数パスで合成入口を表示する');
    assert(await page.locator('#selection-arrange').isVisible(), '複数選択で整列入口を表示する');
    await openMenu(page, '#selection-combine', 'selection-combine');
    await page.screenshot({path:path.join(artifacts, 'multiple-combine-menu-1280.png')});
    const beforeUnion = await read(page);
    await page.locator('[data-menu-kind="selection-combine"] [data-action="path-union"]').click(); await settle(page);
    const unioned = await read(page);
    assert.equal(unioned.pages[0].objects.length, 1, '合成メニューの合体で2図形を1つにする');
    await page.locator('[data-action="undo"]').click(); await settle(page);
    assert.deepEqual(await read(page), beforeUnion, '合体は1回のUndoで戻る');

    await select(page, ['a','b']);
    await openMenu(page, '#selection-group', 'selection-group');
    const beforeGroup = await read(page);
    await page.locator('[data-menu-kind="selection-group"] [data-action="group"]').click(); await settle(page);
    const grouped = await read(page);
    assert(object(grouped,'a').group && object(grouped,'a').group === object(grouped,'b').group, 'グループメニューが選択を同じグループにする');
    await page.locator('[data-action="undo"]').click(); await settle(page);
    assert.deepEqual(await read(page), beforeGroup, 'グループ化は1回のUndoで戻る');

    // 点編集では従来のアンカー編集用ショートカットを使える。
    await load(page, single); await select(page, ['one']);
    await page.locator('#direct-mode').click(); await settle(page);
    assert(await page.locator('#quick-add-anchor').isVisible(), '点編集ではアンカー追加の既存入口を保つ');
    assert(await page.locator('#path-menu-button').isVisible(), '点編集でもパスメニューを使える');

    // 右端タブは表示名とアイコン構造を保ち、開閉状態を表す。
    const tabs = page.locator('.side-tab > button');
    assert.equal(await tabs.count(), 7, '右端タブは7項目');
    assert.equal(await page.locator('#objects-toggle span').textContent(), 'レイヤー', '図形タブの表示名をレイヤーにする');
    for (let index = 0; index < await tabs.count(); index++) {
      const tab = tabs.nth(index);
      assert.equal(await tab.locator(':scope > svg').count(), 1, '各タブの先頭にアイコンを置く');
      assert.equal(await tab.locator(':scope > span').count(), 1, '各タブに表示名を置く');
    }
    const objectsTab = page.locator('#objects-toggle');
    const iconBefore = await objectsTab.locator(':scope > svg').evaluate(node => node.outerHTML);
    await objectsTab.click(); await settle(page);
    assert.equal(await objectsTab.getAttribute('aria-expanded'), 'true', 'タブを開くとaria-expandedを同期する');
    assert.equal(await objectsTab.locator(':scope > svg').evaluate(node => node.outerHTML), iconBefore, '開閉でタブのアイコンを差し替えない');
    await page.screenshot({path:path.join(artifacts, 'layers-panel-1280.png')});
    await page.locator('#inspector-close').click(); await settle(page);
    assert.equal(await objectsTab.getAttribute('aria-expanded'), 'false', 'パネルを閉じるとaria-expandedを戻す');

    // 表示設定に応じて右端タブの幅とテーマを変え、狭い画面で横へあふれないことを確認する。
    const applyView = async (size, theme) => { await setAppearance(page, {size, theme}); await settle(page); };
    assert.equal(Math.round((await page.locator('.side-tab').boundingBox()).width), 26, '標準文字では右端タブを26pxにする');
    await applyView('large', 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'ダークテーマを適用する');
    assert.equal(Math.round((await page.locator('.side-tab').boundingBox()).width), 28, '文字を大きくすると右端タブも28pxにする');
    await applyView('xlarge', 'light');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'ライトテーマへ戻せる');
    assert.equal(Math.round((await page.locator('.side-tab').boundingBox()).width), 30, '文字を特大にすると右端タブも30pxにする');
    await applyView('xlarge', 'dark');
    if (await page.locator('#inspector-close').isVisible()) await page.locator('#inspector-close').click();
    await page.setViewportSize({width:390,height:736}); await settle(page);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '390px幅でもページ全体を横スクロールさせない');
    await page.screenshot({path:path.join(artifacts, 'narrow-dark-390.png')});

    const touchContext = await browser.newContext({viewport:{width:390,height:736}, hasTouch:true, isMobile:true});
    try {
      const touch = await touchContext.newPage();
      touch.on('pageerror', error => errors.push(error.message));
      touch.setDefaultTimeout(12000);
      await touch.goto(hosting.url); await touch.waitForFunction(() => !!window.IlapoEditor);
      await load(touch, fixture([shape('touch',100,100,80,50)]));
      assert.equal(Math.round((await touch.locator('.side-tab').boundingBox()).width), 44, 'タッチ操作では右端タブを44pxにする');
      await touch.locator('#objects-toggle').tap(); await settle(touch);
      assert.equal(await touch.locator('#objects-toggle').getAttribute('aria-expanded'), 'true', 'タップでも右端タブを開ける');
      await touch.locator('#inspector-close').tap(); await settle(touch);
      assert.equal(await touch.locator('#objects-toggle').getAttribute('aria-expanded'), 'false', 'タップでも右端タブを閉じられる');
    } finally { await touchContext.close(); }

    assert.deepEqual(errors, []);
    console.log('Basic selection menu browser tests passed. Artifacts: ' + artifacts);
  } finally {
    await context.close(); await browser.close(); await hosting.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
