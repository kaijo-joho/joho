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
const server = http.createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
function fixture() {
  const doc = C.createDocument(), p = doc.pages[0];
  doc.id = 'inline-playback'; doc.name = 'キャンバス再生';
  p.board = {width:640,height:400,unit:'px',infinite:false};
  const shape = C.makeShape('rect',100,100,120,80,{fill:'#2563EB'}); shape.id = 'animated';
  const hidden = C.makeShape('ellipse',300,100,100,80); hidden.id = 'hidden'; hidden.visible = false;
  p.objects = [shape, hidden];
  p.animations = [
    {id:'appear',targets:['animated'],effect:'fade',mode:'in',trigger:'click',duration:500,delay:0},
    {id:'move',targets:['animated'],effect:'move',trigger:'click',duration:400,delay:0,dx:40,dy:20}
  ];
  doc.pages.push(C.createPage('ページ2',p.board));
  return C.validateDocument(doc);
}
(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:900}}), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror',e=>errors.push(e.message));
  const read = () => page.evaluate(() => IlapoEditor.getDocument());
  const playback = () => page.evaluate(() => IlapoEditor.getState().playback);
  async function play() {
    await page.locator('#animation-preview').click();
    await page.locator('#inline-playback-controls').waitFor();
    await settle(page);
  }
  try {
    await page.goto(supplied || `http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(()=>window.IlapoEditor);
    const document = fixture();
    await page.locator('#file-input').setInputFiles({name:'playback.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))});
    await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,document.id);
    await page.locator('#objects-toggle').click();
    await page.locator('[data-pick-object="animated"]').click();
    await page.locator('#inspector-pin').click();
    await page.locator('#animation-toggle').click();
    await settle(page);
    const original = await read(), camera = await page.evaluate(()=>IlapoEditor.getCamera());
    const selection = await page.evaluate(()=>IlapoEditor.getSelection());
    const canvas = await page.locator('#canvas').boundingBox();
    const before = await page.locator('#artwork [data-object="animated"]').boundingBox();
    await play();
    assert.equal(await page.locator('.ilapo-present-dialog').count(),0,'発表ダイアログを開かない');
    assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
    assert.deepEqual(await page.locator('#canvas').boundingBox(),canvas);
    assert.deepEqual(await page.evaluate(()=>IlapoEditor.getCamera()),camera);
    assert.equal(await page.locator('#pinned-inspector-panel').isVisible(),true);
    assert.equal(await page.locator('#inspector-panel').isVisible(),true);
    assert.equal(await page.locator('#inline-playback-artwork [data-animation-object="hidden"]').count(),0);
    await page.waitForFunction(()=>!IlapoEditor.getState().playback.playing);
    const after = await page.locator('#inline-playback-artwork [data-animation-object="animated"]').boundingBox();
    for (const key of ['x','y','width','height']) assert(Math.abs(after[key]-before[key])<.02,`再生時の座標を維持: ${key}`);
    await page.locator('#inline-playback-next').click();
    await page.waitForFunction(()=>!IlapoEditor.getState().playback.playing);
    const moved = await page.locator('#inline-playback-artwork [data-animation-object="animated"]').boundingBox();
    assert(Math.abs(moved.x-before.x-40*canvas.width/camera.width)<.02);
    assert(Math.abs(moved.y-before.y-20*canvas.height/camera.height)<.02);
    assert.deepEqual(await read(),original,'再生は原稿を変更しない');
    await page.locator('#inline-playback-controls').screenshot({path:'/private/tmp/illustslide-inline-controls.png'});
    await page.screenshot({path:'/private/tmp/illustslide-inline-playback-wide.png'});
    await page.locator('#inline-playback-stop').click();
    assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),selection);
    assert.deepEqual(await read(),original);
    assert.equal(await page.locator('#artwork').isVisible(),true);
    await play(); await page.locator('#canvas').focus(); await page.keyboard.press('Escape');
    assert.equal((await playback()).active,false,'Escapeで再生のみ終了');
    assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),selection);
    assert.equal(await page.locator('#inspector-panel').isVisible(),true);
    await play(); await page.locator('#canvas').focus(); await page.keyboard.press('Delete');
    assert.deepEqual(await read(),original,'再生中のDeleteで元の図形を削除しない');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Home');
    assert.equal((await playback()).step,1);
    await page.locator('#inline-playback-stop').click();
    await page.locator('[data-animation-edit="0"]').click();
    await play();
    await page.locator('#animation-duration').fill('1.25');
    await settle(page);
    assert.equal((await playback()).active,false,'編集を開始すると原稿の表示へ戻る');
    assert.equal((await read()).pages[0].animations[0].duration,1250);
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(),original,'再生はUndoに入らない');
    await play();
    await page.locator('#pages-toggle').click();
    await page.locator('[data-page-pick="1"]').click();
    await settle(page);
    assert.equal((await playback()).active,false,'ページ変更で古い再生を終了');
    await page.locator('#pages-toggle').click();
    await page.locator('#file-input').setInputFiles({name:'playback-new.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
    await page.waitForFunction(()=>IlapoEditor.getState().pageId===IlapoEditor.getDocument().pages[0].id);
    await page.locator('#animation-toggle').click();
    for (const width of [390,320]) {
      await page.setViewportSize({width,height:850}); await settle(page);
      await play();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const b = await page.locator('#inline-playback-controls').boundingBox();
      assert(b.x>=0&&b.x+b.width<=width,'狭幅でも再生終了を押せる');
      await page.screenshot({path:`/private/tmp/illustslide-inline-playback-${width}.png`});
      await page.locator('#inline-playback-stop').click();
    }
    assert.deepEqual(errors,[]);
    console.log('inline-playback-browser.test.cjs: passed');
  } finally { await context.close(); await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
