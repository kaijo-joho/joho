/* Run: node tools/illustslide/tests/arrange-browser.test.cjs [http://127.0.0.1:port/illustslide/] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const C = require('../core.js');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const root = path.resolve(__dirname, '../..');
let fixtureCounter = 0;
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function serve() {
  const server = http.createServer(async (request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'); response.end(await fs.readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {url:`http://127.0.0.1:${server.address().port}/illustslide/`, close:()=>new Promise(resolve=>server.close(resolve))};
}
function shape(id, x, y, w, h, options = {}) {
  const o = C.makeShape(options.kind || 'rect', x, y, w, h, {...C.DEFAULT_STYLE, fill: options.fill || '#93C5FD'});
  o.id = id; o.name = options.name || id; o.group = options.group || null; o.locked = !!options.locked; return o;
}
function fixture(objects, board = {width:640,height:400,unit:'px',infinite:false}, layers) {
  const doc = C.createDocument(); doc.id = `arrange-browser-${++fixtureCounter}`; doc.name = '整列テスト'; doc.pages[0].board = board; doc.pages[0].objects = objects;
  if (layers) doc.pages[0].layers = layers;
  return C.validateDocument(doc);
}
async function load(page, doc, name = 'arrange.json') {
  await page.locator('#file-input').setInputFiles({name, mimeType:'application/json', buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id || document.getElementById('dialog').open, doc.id);
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, doc.id); await settle(page);
}
const documentOf = page => page.evaluate(() => IlapoEditor.getDocument());
async function selectIds(page, ids) {
  for (const [index, id] of ids.entries()) { const box = await page.locator(`[data-object="${id}"]`).boundingBox(); assert(box, `図形 ${id} が描画される`); if (index) await page.keyboard.down('Shift'); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); if (index) await page.keyboard.up('Shift'); await settle(page); }
}
async function openDetails(page) { await page.locator('#arrange-details-button').click(); await page.locator('.command-submenu[data-menu-kind="arrange-details"]').waitFor({state:'visible'}); }
async function openArrange(page) {
  await settle(page); // 画面サイズ変更によるメニュー閉鎖を待ってから操作する。
  for(let depth=0;depth<3&&await page.locator('#command-menu').isVisible();depth++){await page.keyboard.press('Escape');await settle(page);}
  assert(await page.locator('#command-menu').isHidden());
  await page.locator('#selection-arrange').click(); await page.locator('#command-menu').waitFor({state:'visible'}); await openDetails(page);
}
async function clickArrange(page, action) {
  if(!['width','height','size'].includes(action)) await page.locator('.command-submenu[data-menu-kind="arrange-details"] [data-menu-back]').click();
  await page.locator(`#command-menu [data-action="align-${action}"]`).click(); await settle(page);
}
async function bounds(page, id) { return page.evaluate(id => { const o=IlapoEditor.getDocument().pages[0].objects.find(v=>v.id===id); const b=IlapoGeometry.bounds(o); return {x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height,width:b.width,height:b.height}; }, id); }

async function run() {
  const supplied = process.argv.find(v => /^https?:/.test(v)); const hosting = supplied ? {url:supplied,close:async()=>{}} : await serve();
  const browser = await playwright.chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:736}}); const page = await context.newPage(); page.setDefaultTimeout(12000);
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  const artifacts=await fs.mkdtemp(path.join(os.tmpdir(),'illustslide-arrange-browser-'));
  try {
    await page.goto(hosting.url); await page.waitForFunction(()=>!!window.IlapoEditor);
    const a=shape('a',60,80,80,40), b=shape('b',240,150,50,70), c=shape('c',420,40,100,30);
    const original=fixture([a,b,c]); await load(page,original);
    await selectIds(page,['a','b','c']); assert.equal(await page.locator('#selection-arrange').isVisible(),true,'3図形で整列ボタンが表示される');
    await openArrange(page); await page.screenshot({path:path.join(artifacts,'arrange-menu-1280.png')}); await page.locator('[data-arrange-reference="object"]').click(); await page.locator('#arrange-key').selectOption('b');
    const before=await documentOf(page), beforeB=await bounds(page,'b'); await clickArrange(page,'left');
    assert.deepEqual(before,original,'基準の切り替えと基準図形の選択だけでは文書を変更しない');
    const afterB=await bounds(page,'b'); assert.deepEqual(afterB,beforeB,'基準図形は移動しない');
    assert.equal((await bounds(page,'a')).x,beforeB.x); assert.equal((await bounds(page,'c')).x,beforeB.x);
    await page.locator('[data-action="undo"]').click(); await settle(page); assert.deepEqual(await documentOf(page),before,'整列は1回のUndoで復元');
    await selectIds(page,['a','b','c']); await openArrange(page);
    assert.equal(await page.locator('#arrange-key').inputValue(),'a','選択を解除して選び直すと基準図形は先頭に戻る');
    await page.locator('#arrange-key').selectOption('b'); assert.equal(await page.locator('#arrange-reference text').textContent(),'基準');
    await page.screenshot({path:path.join(artifacts,'arrange-object-reference.png')});
    await clickArrange(page,'width');
    for(const [id,center] of [['a',100],['b',265],['c',470]]) { const box=await bounds(page,id); assert.equal(box.width,50,'指定した基準図形の幅に合わせる'); assert.equal(box.x+box.width/2,center,'大きさ合わせは中心を保つ'); }
    await page.locator('[data-action="undo"]').click(); await settle(page); assert.deepEqual(await documentOf(page),original);

    await load(page,fixture([shape('a',60,80,80,40),shape('b',240,150,50,70),shape('c',420,40,100,30)])); await selectIds(page,['a','b','c']); await openArrange(page);
    await page.locator('[data-arrange-reference="selection"]').click(); await clickArrange(page,'center');
    const sel=[await bounds(page,'a'),await bounds(page,'b'),await bounds(page,'c')]; for (const b of sel) assert(Math.abs((b.x+b.right)/2-290)<1e-6,'選択範囲中央（元の範囲中心290）へ整列');
    await page.locator('[data-action="undo"]').click(); await settle(page); await selectIds(page,['a','b','c']); await openArrange(page); await page.locator('[data-arrange-reference="board"]').click(); await clickArrange(page,'center'); for (const id of ['a','b','c']) { const b=await bounds(page,id); assert(Math.abs((b.x+b.right)/2-320)<1e-6,'用紙中央320へ整列'); } await page.locator('[data-action="undo"]').click();
    await load(page,fixture([shape('only',100,100,40,20)])); await page.locator('[data-object="only"]').click(); await page.locator('#selection-more').click(); await page.locator('[data-action="selection-arrange"]').click(); await openDetails(page); assert.equal(await page.locator('[data-arrange-reference="board"]').getAttribute('aria-pressed'),'true','単一選択は用紙基準'); await clickArrange(page,'center'); const one=await bounds(page,'only'); assert.equal(Math.round((one.x+one.right)/2),320,'単一図形を用紙中央へ配置');

    const g1=shape('g1',80,80,40,30,{group:'g'}),g2=shape('g2',140,100,30,20,{group:'g'}),x=shape('x',260,180,20,50),y=shape('y',420,60,30,30); await load(page,fixture([g1,g2,x,y])); await selectIds(page,['g1','x','y']); await openArrange(page); await page.locator('[data-arrange-reference="object"]').click(); await page.locator('#arrange-key').selectOption('x'); const beforeG=await documentOf(page); const g1Before=beforeG.pages[0].objects.find(o=>o.id==='g1').matrix[4],g2Before=beforeG.pages[0].objects.find(o=>o.id==='g2').matrix[4]; await clickArrange(page,'right'); const grouped=await documentOf(page), g1After=grouped.pages[0].objects.find(o=>o.id==='g1').matrix[4],g2After=grouped.pages[0].objects.find(o=>o.id==='g2').matrix[4]; assert.equal(g1After-g1Before,110); assert.equal(g1After-g1Before,g2After-g2Before,'グループ内部は同じ移動量');

    const locked=shape('locked',100,100,30,30,{locked:true}), free=shape('free',220,120,30,30); await load(page,fixture([locked,free])); await selectIds(page,['locked','free']); await page.locator('#selection-more').click(); assert.equal(await page.locator('[data-action="selection-arrange"]').isDisabled(),true,'固定図形を含む整列は無効'); await page.keyboard.press('Escape'); assert.equal(await page.locator('#command-menu').isVisible(),false,'Escapeでメニューを閉じる');
    const layer=fixture([shape('hidden',80,80,30,30),shape('visible',240,80,30,30)],undefined,[{id:'hidden-layer',name:'非表示',visible:false,locked:false,objectIds:['hidden']},{id:'visible-layer',name:'表示',visible:true,locked:false,objectIds:['visible']}]); await load(page,layer); await page.locator('#canvas').focus(); await page.keyboard.press('Meta+a'); await settle(page); assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),['visible'],'非表示レイヤーは全選択から除外される');

    const lockedLayer=fixture([shape('locked-layer-shape',80,80,30,30),shape('free-layer-shape',240,80,30,30)],undefined,[{id:'locked-layer',name:'固定',visible:true,locked:true,objectIds:['locked-layer-shape']},{id:'free-layer',name:'自由',visible:true,locked:false,objectIds:['free-layer-shape']}]);
    await load(page,lockedLayer); await page.locator('#canvas').focus(); await page.keyboard.press('Meta+a'); await settle(page); assert(await page.locator('#selection-arrange').isDisabled(),'固定レイヤーも整列できない'); assert.deepEqual(await documentOf(page),lockedLayer);
    await load(page,fixture([shape('negative',-100,-50,40,20),shape('positive',100,80,60,30)],{width:640,height:400,unit:'px',infinite:true})); await page.locator('#canvas').focus(); await page.keyboard.press('Meta+a'); await openArrange(page); assert(await page.locator('[data-arrange-reference=board]').isDisabled(),'自由キャンバスに用紙の基準を作らない'); await page.locator('[data-arrange-reference=selection]').click(); await clickArrange(page,'left'); assert.equal((await bounds(page,'positive')).x,-100,'負座標の範囲にも整列できる');

    await load(page,fixture([shape('a',60,80,80,40),shape('b',240,150,50,70),shape('c',420,40,100,30)])); await selectIds(page,['a','b','c']); await openArrange(page); await page.locator('[data-arrange-reference=selection]').click(); await clickArrange(page,'distribute-x');
    assert.equal((await bounds(page,'a')).x,60); assert.equal((await bounds(page,'b')).x,255); assert.equal((await bounds(page,'c')).right,520,'等間隔は選択範囲の両端を保持する');
    for (const width of [320,390,736,1280]) { await page.setViewportSize({width,height:736}); await openArrange(page); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}pxで横はみ出しなし`); const menu=await page.locator('#command-menu').boundingBox(); assert(menu && menu.x>=0 && menu.x+menu.width<=width+1,`${width}pxで整列メニューが画面内`); await page.keyboard.press('Escape'); }
    await page.setViewportSize({width:390,height:736}); await openArrange(page);
    await page.screenshot({path:path.join(artifacts,'arrange-mobile.png')});
    assert.equal(errors.length,0,errors.join('\n')); console.log('arrange-browser.test.cjs: passed');
  } finally { await context.close(); await browser.close(); await hosting.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
