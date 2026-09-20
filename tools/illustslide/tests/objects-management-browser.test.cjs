/* 図形一覧のグループ管理、並べ替え取消、狭幅表示を実Chromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try {
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg':'image/svg+xml' })[path.extname(file)] || 'text/plain');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ids = page => page.evaluate(() => IlapoEditor.getDocument().pages[0].objects.map(object => object.id));
const selected = page => page.evaluate(() => IlapoEditor.getSelection());
function fixture() {
  const document = C.createDocument();
  document.id = 'objects-management';
  document.pages[0].board = { width: 640, height: 400, unit: 'px', infinite: false };
  const make = (id, group = null) => {
    const object = C.makeShape('rect', 40, 40, 80, 50, { fill: '#2563EB' });
    object.id = id; object.name = id; object.group = group;
    return object;
  };
  // g1 は意図的に非連続。並べ替え時に他要素を勝手に並べ直さないことを確認する。
  document.pages[0].objects = [make('g1-a', 'g1'), make('solo-a'), make('g2-a', 'g2'), make('g1-b', 'g1'), make('solo-b'), make('g2-b', 'g2')];
  return document;
}
async function load(page) {
  const document = fixture();
  await page.locator('#file-input').setInputFiles({ name: 'objects.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await page.waitForFunction(() => IlapoEditor.getDocument().id === 'objects-management');
  await page.locator('#objects-toggle').click();
  await settle(page);
}
async function expand(page, group) {
  const toggle = page.locator(`[data-object-group-toggle="${group}"]`);
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await settle(page);
}
async function drag(page, source, target, before = true) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  assert(from && to, 'drag endpoints exist');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * (before ? .25 : .7), { steps: 5 });
  assert.equal(await page.locator(before ? '.drop-before' : '.drop-after').count(), 1, 'drop insertion is previewed');
  await page.mouse.up();
  await settle(page);
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  try {
    await page.goto(supplied || `http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(() => !!window.IlapoEditor);
    await load(page);
    await expand(page, 'g1');

    // 子は同じグループの前後だけへ置け、非連続の他要素スロットを保持する。
    const childBefore = await ids(page);
    await drag(page, page.locator('[data-object-row="g1-a"] [data-object-drag]'), page.locator('[data-object-row="g1-b"]'), true);
    const childAfter = await ids(page);
    assert.deepEqual(childAfter.filter(id => !id.startsWith('g1')), childBefore.filter(id => !id.startsWith('g1')), 'child drag preserves every other object slot');
    assert.deepEqual(childAfter, ['g1-b','solo-a','g2-a','g1-a','solo-b','g2-b'], '上へdropすると前面へ移り、他の図形の配列位置を保つ');
    await drag(page, page.locator('[data-object-row="g1-a"] [data-object-drag]'), page.locator('[data-object-row="g1-b"]'), false);
    assert.deepEqual(await ids(page),childBefore,'下へのdropで元の背面へ戻せる');
    await page.locator('[data-object-group-toggle="g1"]').click();

    // group drag changes only the selected group position. Preview, Escape, cancel, blur never mutate the document.
    const beforeCancel = await ids(page);
    const handle = page.locator('[data-object-unit="g2"] > .object-group-head [data-object-drag]');
    const target = page.locator('.object-unit[data-object-unit="g1"]');
    const start = await handle.boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move((await target.boundingBox()).x + 8, (await target.boundingBox()).y + 3);
    assert.deepEqual(await ids(page), beforeCancel, 'drag preview leaves document unchanged');
    await page.keyboard.press('Escape'); await settle(page);
    await page.mouse.up();
    assert.deepEqual(await ids(page), beforeCancel); assert(await page.locator('#inspector-panel').isVisible(), 'Escape keeps the panel open');
    for (const event of ['pointercancel', 'blur']) {
      const start=await handle.boundingBox();
      await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
      if (event === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else await handle.dispatchEvent('pointercancel', { pointerId: 1 });
      await page.mouse.up();
      assert.equal(await page.locator('.dragging').count(),0);
      assert.deepEqual(await ids(page), beforeCancel, `${event} cancels without a commit`);
    }
    await drag(page, handle, target, true);
    const afterGroup = await ids(page);
    assert.notDeepEqual(afterGroup, beforeCancel, 'group drop commits once');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await ids(page), beforeCancel, 'group drop is one Undo');
    assert.deepEqual(afterGroup.filter(id=>!id.startsWith('g2')),beforeCancel.filter(id=>!id.startsWith('g2')),'グループを動かしても対象以外の相対順は同じ');

    // Header controls act on every group child, and rename remains undoable.
    await page.locator('[data-object-group-pick="g1"]').click();
    assert.deepEqual(new Set(await selected(page)), new Set(['g1-a', 'g1-b']));
    await page.locator('[data-object-command="group-lock"][data-object-id="g1"]').click(); await settle(page);
    assert((await page.evaluate(() => IlapoEditor.getDocument().pages[0].objects.filter(o => o.group === 'g1').every(o => o.locked))));
    await page.locator('[data-object-command="group-lock"][data-object-id="g1"]').click(); await settle(page);
    assert((await page.evaluate(() => IlapoEditor.getDocument().pages[0].objects.filter(o => o.group === 'g1').every(o => !o.locked))));
    await expand(page,'g1');
    await page.locator('[data-object-command="rename"][data-object-id="g1-a"]').click();
    await page.locator('#object-name').fill('変更した名前'); await page.locator('#dialog-submit').click(); await settle(page);
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.equal((await page.evaluate(() => IlapoEditor.getDocument().pages[0].objects.find(o => o.id === 'g1-a').name)), 'g1-a');

    // 折り畳みヘッダーを含む可視順でキーボード移動し、左右で開閉する。
    await page.locator('[data-object-group-toggle="g1"]').click();
    const groupToggle = page.locator('[data-object-group-toggle="g1"]');
    await groupToggle.focus(); await page.keyboard.press('ArrowRight'); await settle(page);
    assert.equal(await groupToggle.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('ArrowLeft'); await settle(page);
    assert.equal(await groupToggle.getAttribute('aria-expanded'), 'false');

    // The desktop panel can be narrowed to 220px without losing the name or controls.
    await page.locator('#inspector-resize').focus();await page.keyboard.press('Home');await settle(page);
    assert.equal(Math.round((await page.locator('#inspector-panel').boundingBox()).width),220);
    await expand(page,'g1');
    assert(await page.locator('.object-row,.object-group-head').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),'220px panel has no row overflow');
    await page.screenshot({path:'/private/tmp/illustslide-objects-220px.png'});
    await page.setViewportSize({ width: 390, height: 844 }); await expand(page, 'g1');
    const narrow = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      panel: document.getElementById('inspector-panel').getBoundingClientRect().width,
      widest: Math.max(...[...document.querySelectorAll('.object-group-head,.object-row')].map(node => node.scrollWidth - node.clientWidth))
    }));
    assert.equal(narrow.overflow, false); assert(narrow.panel >= 220); assert(narrow.widest <= 1, 'group rows fit their panel');
    assert(await page.locator('[data-object-drag]').evaluateAll(nodes => nodes.filter(node=>node.getClientRects().length).every(node => node.getBoundingClientRect().height >= 44)), 'drag handles are touch sized');
    await page.screenshot({ path: '/private/tmp/illustslide-objects-management-390px.png' });
    // Native touch events use the same drag/drop behavior.
    await page.locator('[data-object-group-toggle="g1"]').click();await settle(page);
    const touchSource=page.locator('[data-object-row="solo-b"] [data-object-drag]');
    const touchTarget=page.locator('.object-unit[data-object-unit="g2"]');
    await touchTarget.scrollIntoViewIfNeeded();
    const sourceRect=await touchSource.boundingBox(),targetRect=await touchTarget.boundingBox();
    const cdp=await context.newCDPSession(page),touchBefore=await ids(page);
    const startPoint={x:sourceRect.x+sourceRect.width/2,y:sourceRect.y+sourceRect.height/2};
    // Stay outside the auto-scroll edge; edge holding is checked separately below.
    const endPoint={x:targetRect.x+targetRect.width/2,y:targetRect.y+targetRect.height*.25};
    const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:7,radiusX:5,radiusY:5,force:1}]:[]});
    await touch('touchStart',startPoint);
    for(let i=1;i<=6;i++) await touch('touchMove',{x:startPoint.x+(endPoint.x-startPoint.x)*i/6,y:startPoint.y+(endPoint.y-startPoint.y)*i/6});
    assert.equal(await page.locator('.drop-before').count(),1,'touch previews the insertion point');
    await touch('touchEnd');await settle(page);
    assert.equal((await ids(page)).at(-1),'solo-b','touch drop moves the object to the front');
    await page.keyboard.press('Meta+z');await settle(page);
    assert.deepEqual(await ids(page),touchBefore,'touch drop is one Undo');
    await cdp.detach();
    // Holding a drag near the panel edge scrolls the list without committing anything.
    await touchSource.scrollIntoViewIfNeeded();
    const scrollStart=await page.locator('#inspector-body').evaluate(el=>el.scrollTop);
    const scrollHandle=await touchSource.boundingBox(),scrollPanel=await page.locator('#inspector-body').boundingBox();
    await page.mouse.move(scrollHandle.x+scrollHandle.width/2,scrollHandle.y+scrollHandle.height/2);await page.mouse.down();
    await page.mouse.move(scrollPanel.x+10,scrollPanel.y+scrollPanel.height-7);
    await page.waitForFunction(initial=>document.getElementById('inspector-body').scrollTop>initial+15,scrollStart);
    await page.keyboard.press('Escape');await page.mouse.up();await settle(page);
    assert.deepEqual(await ids(page),touchBefore,'auto-scroll and Escape leave stacking unchanged');
    const roundTrip=await page.evaluate(async()=>{const d=IlapoEditor.getDocument();return JSON.stringify(await IlapoSVG.decodeProject(IlapoSVG.encodeProject(d)))===JSON.stringify(d);});
    assert(roundTrip,'names, locks, group IDs and stacking order survive the editable ZIP');
    assert.deepEqual(errors, []);
    console.log('objects-management-browser.test.cjs: passed');
  } finally {
    await context.close(); await browser.close();
    if (!supplied) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
