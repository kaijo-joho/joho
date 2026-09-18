/* 選択メニューの階層、反転、マウス・キー・タッチ操作をChromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const C = require('../core.js');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
let fixtureId = 0;
function fixture(locked = false) {
  const doc = C.createDocument(); doc.id = `selection-menus-${++fixtureId}`;
  doc.pages[0].board = {width:640,height:400,unit:'px',infinite:false};
  doc.pages[0].objects = [['a',80,90,70,40],['b',260,130,50,80],['c',430,70,90,30]].map(([id,x,y,w,h],i) => {
    const object = C.makeShape('rect',x,y,w,h,{fill:'#93C5FD'});
    object.id = object.name = id; object.locked = locked && i === 0; return object;
  });
  return C.validateDocument(doc);
}
async function load(page, doc = fixture()) {
  await page.locator('#file-input').setInputFiles({name:'selection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id || document.getElementById('dialog').open, doc.id);
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, doc.id); await settle(page); return doc;
}
async function select(page, ids = ['a','b','c']) {
  await page.locator('#canvas').focus(); await page.keyboard.press('Escape');
  for (const [i,id] of ids.entries()) {
    const box = await page.locator(`#artwork [data-object="${id}"]`).boundingBox(); assert(box);
    if (i) await page.keyboard.down('Shift');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (i) await page.keyboard.up('Shift'); await settle(page);
  }
}
const read = page => page.evaluate(() => IlapoEditor.getDocument());
const details = page => page.locator('.command-submenu[data-menu-kind="arrange-details"]');
const bounds = page => page.evaluate(() => IlapoEditor.getDocument().pages[0].objects.map(o => ({id:o.id,...IlapoGeometry.bounds(o)})));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.argv.find(arg => /^https?:/.test(arg)) || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:800}}), page = await context.newPage();
  const errors = []; page.on('pageerror',error => errors.push(error.message)); page.setDefaultTimeout(10000);
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(),'illustslide-selection-menus-'));
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor); await load(page); await select(page);
    assert.equal(await page.locator('[data-menu="edit"]').count(),0,'鉛筆の重複入口を廃止');
    for (const selector of ['#selection-arrange','#selection-more','#path-menu-button','#selection-transform','#selection-combine','#selection-group','.top [data-menu="file"]']) {
      assert.equal(await page.locator(selector + ' > .menu-caret[aria-hidden="true"]').count(),1,'メニュー入口には三角の目印');
    }
    await page.locator('#selection-more').click(); const menu = page.locator('#command-menu');
    for (const action of ['copy','paste','duplicate','delete','style-copy','style-paste','outline']) {
      assert.equal(await menu.locator(`[data-action="${action}"]`).count(),1,`${action}を重複せず保持`);
    }
    await page.keyboard.press('Escape'); await page.locator('#selection-arrange').click();
    const basic = menu.locator(':scope > .menu-content .arrange-menu');
    assert.deepEqual(await basic.locator('[data-action^="align-"]').evaluateAll(nodes => nodes.map(n => n.dataset.action).sort()),
      ['align-bottom','align-center','align-distribute-x','align-distribute-y','align-left','align-middle','align-right','align-top']);
    assert.equal(await basic.locator('[data-arrange-reference],#arrange-key,[data-action="align-width"]').count(),0,'詳細は基本メニューに並べない');
    const opener = page.locator('#arrange-details-button');
    await opener.hover(); await details(page).waitFor({state:'visible'});
    await details(page).locator('[data-arrange-reference="object"]').hover(); await page.waitForTimeout(300);
    assert(await menu.isVisible() && await details(page).isVisible(),'ホバーで親から子へ移っても閉じない');
    await details(page).locator('[data-arrange-reference="object"]').click(); await page.locator('#arrange-key').selectOption('b');
    assert(await basic.locator('[data-action="align-left"]').isVisible(),'基準を変えても基本を保持');
    assert.equal(await page.locator('#arrange-reference text').textContent(),'基準');
    await page.screenshot({path:path.join(artifacts,'desktop.png')});
    await page.keyboard.press('Escape'); assert(await details(page).isHidden()); assert(await menu.isVisible());
    assert.equal(await page.evaluate(() => document.activeElement.id),'arrange-details-button');
    await page.keyboard.press('ArrowRight'); await details(page).waitFor({state:'visible'});
    await page.keyboard.press('ArrowLeft'); assert(await details(page).isHidden());
    await page.keyboard.press('ArrowRight'); await details(page).locator('[data-menu-back]').click(); assert(await menu.isVisible());
    await page.keyboard.press('Escape'); assert(await menu.isHidden());

    // … → 整列 → 詳細の3段階と、外側クリックによる全閉鎖。
    await page.locator('#selection-more').click(); await menu.locator('[data-action="selection-arrange"]').click();
    await opener.click(); assert.equal(await page.locator('.command-submenu:popover-open').count(),2);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.command-submenu:popover-open').count(),1);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.command-submenu:popover-open').count(),0); assert(await menu.isVisible());
    await page.keyboard.press('Escape'); await page.locator('#selection-more').click();
    await menu.locator('[data-action="selection-order"]').hover(); await page.locator('.command-submenu[data-menu-kind="order"]').waitFor({state:'visible'});
    await page.locator('#document-title').click(); await settle(page); assert(await menu.isHidden()); assert.equal(await page.locator('.command-submenu').count(),0);

    // 中心を保った各方向の反転と、1操作単位のUndo。
    for (const axis of ['h','v']) {
      await select(page); const before = await read(page), boxes = await bounds(page);
      await page.locator('#selection-transform').click(); await page.locator('#command-menu [data-action="flip-' + axis + '"]').click(); await settle(page); const after = await bounds(page);
      for (let i=0;i<boxes.length;i++) {
        const old=boxes[i], next=after[i];
        assert(Math.abs(next.x - (axis==='h' ? 600-old.x-old.width : old.x))<1e-6);
        assert(Math.abs(next.y - (axis==='v' ? 280-old.y-old.height : old.y))<1e-6);
        assert.equal(next.width,old.width); assert.equal(next.height,old.height);
      }
      assert.notDeepEqual(await read(page),before);
      await page.locator('[data-action="undo"]').click(); await settle(page); assert.deepEqual(await read(page),before);
    }
    await load(page,fixture(true)); await select(page,['a','b']);
    assert(await page.locator('#selection-transform').isDisabled());
    await load(page); await select(page); await page.setViewportSize({width:390,height:736});
    await page.locator('#selection-arrange').click(); await opener.hover(); assert(await details(page).isHidden(),'重ね表示はホバーで押す位置を覆わない');
    await opener.click(); await details(page).waitFor({state:'visible'});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    await page.screenshot({path:path.join(artifacts,'narrow.png')});
    await details(page).locator('[data-menu-back]').click(); assert(await basic.isVisible());

    const touchContext=await browser.newContext({viewport:{width:390,height:736},hasTouch:true,isMobile:true});
    try {
      const touch=await touchContext.newPage(); touch.on('pageerror',error=>errors.push(error.message)); await touch.goto(url); await touch.waitForFunction(()=>!!window.IlapoEditor); await load(touch);
      for (const [i,id] of ['a','b','c'].entries()) { if(i) await touch.keyboard.down('Shift'); await touch.locator(`#artwork [data-object="${id}"]`).tap(); if(i) await touch.keyboard.up('Shift'); }
      await touch.locator('#selection-arrange').tap(); await touch.locator('#arrange-details-button').tap(); await details(touch).waitFor({state:'visible'});
      await details(touch).locator('[data-arrange-reference="selection"]').tap(); await details(touch).locator('[data-menu-back]').tap();
      await touch.locator('#command-menu [data-action="align-top"]').tap(); await settle(touch);
      const result=await bounds(touch); assert(result.every(b=>b.y===70),'タッチで基準選択後に整列できる');
    } finally { await touchContext.close(); }
    assert.deepEqual(errors,[]); console.log('Selection menu tests passed. Artifacts: '+artifacts);
  } finally { await context.close(); await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
