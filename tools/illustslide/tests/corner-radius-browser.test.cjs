/* Canvas corner-radius handles: preview, commit, cancellation and exclusions. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, ''), file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' })[path.extname(file)] || 'text/plain'); res.end(await fs.readFile(file)); } catch { res.writeHead(404).end(); }
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const shape = (d, id = 'corner') => ({ ...C.makeShape('rect', 0, 0, 1, 1), id, name:id, d, style:{ ...C.makeShape('rect', 0, 0, 1, 1).style, fill:'#93c5fd', stroke:'#172b4d', strokeWidth:2 } });
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel:'chrome', headless:true }), page = await browser.newPage({ viewport:{width:1200,height:760} }), errors=[];
  page.on('pageerror', error => errors.push(error.message));
  const screen = point => page.evaluate(p => { const c=IlapoEditor.getCamera(), r=document.getElementById('canvas').getBoundingClientRect(); return {x:r.left+(p.x-c.x)/c.width*r.width,y:r.top+(p.y-c.y)/c.height*r.height}; }, point);
  const documentOf = () => page.evaluate(() => IlapoEditor.getDocument());
  async function load(objects, board={width:600,height:420,unit:'px',infinite:false}) {
    const doc=C.createDocument(); doc.pages[0].board=board; doc.pages[0].objects=objects;
    await page.locator('#file-input').setInputFiles({name:'corner.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
    await sleep(60); if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
    await page.waitForFunction(id => IlapoEditor.getDocument().id===id, doc.id); await page.locator('#canvas').focus();
  }
  async function selectCorner(anchor) {
    const q=await screen(anchor); await page.mouse.click(q.x,q.y); await sleep(50);
    assert.equal(await page.locator('[data-corner-radius]').count(), 1, '選択した有効な角だけに角丸ハンドルを表示する');
  }
  async function chooseAnchor(index) {
    await page.locator('#path-menu-button').click(); await page.locator('#command-menu [data-action="anchor-list"]').click();
    const picks=page.locator('[data-anchor-pick]'); for(let i=0;i<await picks.count();i++) await picks.nth(i).setChecked(i===index); await page.locator('#dialog-submit').click();
    await page.waitForFunction(() => !document.getElementById('dialog').open); await sleep(40);
  }
  async function startHandle() {
    return page.evaluate(() => {
      const handle=document.querySelector('[data-corner-radius]'), ref=JSON.parse(handle.dataset.cornerRadius), o=IlapoEditor.getDocument().pages[0].objects.find(v=>v.id===ref[0]), info=IlapoPathEdit.cornerInfo(o,{id:ref[0],path:ref[1],index:ref[2]});
      const circle=handle.querySelector('circle:last-child'), start={x:circle.cx.baseVal.value,y:circle.cy.baseVal.value}, distance=Math.min(40,info.maxRadius / info.sinHalf / 2);
      return {start,end:{x:start.x+info.direction.x*distance,y:start.y+info.direction.y*distance}};
    });
  }
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/illustslide/`); await page.waitForFunction(() => !!window.IlapoEditor);
    const rect=shape('M100 100L260 100L260 250L100 250Z'); await load([rect]);
    // First click selects the path/direct mode; second selects its upper-right corner.
    const inside=await screen({x:180,y:180}); await page.mouse.click(inside.x,inside.y); await page.keyboard.press('a'); await sleep(50); await selectCorner({x:260,y:100});
    const before=await documentOf(), drag=await startHandle(), a=await screen(drag.start), b=await screen(drag.end);
    await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:5}); await sleep(30);
    assert.equal(await page.locator('[data-corner-popup]').count(),1,'ドラッグ中は半径を1行で表示する');
    assert.deepEqual(await documentOf(),before,'プレビューは保存済み文書を変更しない'); await page.mouse.up(); await sleep(60);
    const rounded=await documentOf(); assert.notEqual(rounded.pages[0].objects[0].d,before.pages[0].objects[0].d,'ドラッグ終了で通常のベジェパスへ確定する');
    await page.screenshot({path:'/private/tmp/illustslide-corner-radius.png'});
    await page.keyboard.press('Meta+z'); await sleep(50); assert.deepEqual(await documentOf(),before,'角丸ドラッグは1回のUndoで戻る');

    await selectCorner({x:260,y:100}); const escBefore=await documentOf(), escDrag=await startHandle(), ea=await screen(escDrag.start), eb=await screen(escDrag.end);
    await page.mouse.move(ea.x,ea.y); await page.mouse.down(); await page.mouse.move(eb.x,eb.y); await page.keyboard.press('Escape'); await page.mouse.up(); await sleep(50);
    assert.deepEqual(await documentOf(),escBefore,'Escapeは角丸プレビューを取消する');

    await selectCorner({x:260,y:100}); const cancelBefore=await documentOf(), cancelDrag=await startHandle(), ca=await screen(cancelDrag.start), cb=await screen(cancelDrag.end);
    await page.mouse.move(ca.x,ca.y); await page.mouse.down(); await page.mouse.move(cb.x,cb.y); await page.evaluate(() => document.getElementById('canvas').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}))); await page.mouse.up(); await sleep(50);
    assert.deepEqual(await documentOf(),cancelBefore,'pointercancelは角丸プレビューを取消する');

    await load([shape('M2 2L16 2L16 16L2 16Z','tiny')],{width:18,height:18,unit:'px',infinite:false});
    const tinyInside=await screen({x:9,y:9}); await page.mouse.click(tinyInside.x,tinyInside.y); await page.keyboard.press('a'); await sleep(50); await selectCorner({x:16,y:2});
    const tinyBefore=await documentOf(), tinyDrag=await startHandle(), ta=await screen(tinyDrag.start), tb=await screen(tinyDrag.end);
    await page.mouse.move(ta.x,ta.y); await page.mouse.down(); await page.mouse.move(tb.x,tb.y,{steps:4}); await page.mouse.up(); await sleep(50);
    assert.notEqual((await documentOf()).pages[0].objects[0].d,tinyBefore.pages[0].objects[0].d,'18px用紙でも角丸を確定できる');
    await page.keyboard.press('Meta+z'); await sleep(50); assert.deepEqual(await documentOf(),tinyBefore);

    await load([shape('M30 30L170 30L170 140','open')]); const openInside=await screen({x:100,y:30}); await page.mouse.click(openInside.x,openInside.y); await page.keyboard.press('a'); await sleep(50); await chooseAnchor(0); assert.equal(await page.locator('[data-corner-radius]').count(),0,'開パス端点にはハンドルを表示しない');
    await load([shape('M30 30C80 30 120 80 170 30L170 140','curve')]); const curveInside=await screen({x:100,y:45}); await page.mouse.click(curveInside.x,curveInside.y); await page.keyboard.press('a'); await sleep(50); await chooseAnchor(1); assert.equal(await page.locator('[data-corner-radius]').count(),0,'曲線に接続する点にはハンドルを表示しない');
    assert.deepEqual(errors,[]); console.log('corner-radius-browser.test.cjs: passed');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
