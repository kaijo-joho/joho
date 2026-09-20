/* Animation ordering: pointer/touch drag, Alt arrows, cancellation, and inline deletion. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const C=require('../core.js');let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..'),server=http.createServer(async(req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
function fixture(){const d=C.createDocument(),p=d.pages[0];p.board={width:640,height:400,unit:'px',infinite:false};p.objects=[0,1,2,3].map(i=>{const o=C.makeShape('rect',30+i*140,80,100,80);o.id='box'+i;o.name='図形'+(i+1);return o;});p.animations=p.objects.map((o,i)=>({id:'a'+i,targets:[o.id],effect:'fade',mode:'in',trigger:'click',duration:400+i*10,delay:0}));return C.validateDocument(d);}
(async()=>{const supplied=process.argv.find(v=>/^https?:/.test(v));if(!supplied)await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:900,height:700}}),page=await context.newPage();page.setDefaultTimeout(10000);const read=()=>page.evaluate(()=>IlapoEditor.getDocument().pages[0].animations.map(a=>a.id));async function open(){await page.locator('#objects-toggle').click();await page.locator('[data-pick-object="box0"]').click();await page.locator('#inspector-close').click();const quick=page.locator('#selection-bar [data-action="animations"]');if(await quick.isVisible())await quick.click();else{await page.locator('#selection-more').click();await page.locator('#command-menu [data-action="animations"]').click();}await page.locator('.animation-list').waitFor();}
 try{await page.goto(supplied||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>window.IlapoEditor);const d=fixture();await page.locator('#file-input').setInputFiles({name:'order.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].animations?.length===4);await open();
  assert.equal(await page.locator('[data-animation-move]').count(),0,'上下ボタンを置かない');assert.equal(await page.locator('[data-animation-delete]').count(),0,'削除は︙を開くまで置かない');
  const unchanged = await read();
  const first = await page.locator('[data-animation-index="0"] .animation-order-handle').boundingBox();
  await page.mouse.move(first.x+first.width/2, first.y+first.height/2);
  await page.mouse.down(); await page.mouse.move(first.x+first.width/2, first.y+first.height/2+7); await page.mouse.up();
  assert.deepEqual(await read(),unchanged,'同じ行内の小さなドラッグでは順序を変えない');
  await page.mouse.move(first.x+first.width/2, first.y+first.height/2);
  await page.mouse.down(); await page.mouse.move(200,first.y+160); await page.mouse.up();
  assert.deepEqual(await read(),unchanged,'パネル外へドロップした場合は取り消す');
  const handle=page.locator('[data-animation-index="2"] .animation-order-handle');await handle.focus();await page.keyboard.press('Alt+ArrowUp');assert.deepEqual(await read(),['a0','a2','a1','a3'],'Alt+↑で一つ前へ移動');assert.equal(await page.locator('[data-animation-index="1"] .animation-order-handle').getAttribute('aria-label'),'動き2の順序をドラッグして変更');
  await page.locator('[data-animation-index="1"] .animation-order-handle').dragTo(page.locator('[data-animation-index="3"] .animation-order-handle'));assert.deepEqual(await read(),['a0','a1','a3','a2'],'pointer dragは1回で確定する');await page.waitForFunction(()=>document.activeElement.classList.contains('animation-order-handle'));await page.keyboard.press('Meta+z');await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].animations.map(a=>a.id).join(',')==='a0,a2,a1,a3');await page.keyboard.press('Meta+Shift+z');await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].animations.map(a=>a.id).join(',')==='a0,a1,a3,a2');
  await page.waitForTimeout(300);const touchFromLocator=page.locator('[data-animation-index="3"] .animation-order-handle'),touchToLocator=page.locator('[data-animation-index="2"] .animation-order-handle');await touchFromLocator.waitFor({state:'visible'});await touchToLocator.waitFor({state:'visible'});const cdp=await context.newCDPSession(page),touchFrom=await touchFromLocator.boundingBox(),touchTo=await touchToLocator.boundingBox(),point=(box)=>({x:box.x+box.width/2,y:box.y+box.height/2,id:1});assert.ok(touchFrom&&touchTo,'touch並べ替え対象のハンドルが表示される');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(touchFrom)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(touchTo)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].animations.map(a=>a.id).join(',')==='a0,a1,a2,a3');
  const touchCancelBefore = await read();
  const cancelFrom = await page.locator('[data-animation-index="2"] .animation-order-handle').boundingBox();
  const cancelTo = await page.locator('[data-animation-index="0"] .animation-order-handle').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(cancelFrom)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(cancelTo)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.deepEqual(await read(),touchCancelBefore,'タッチ操作の中断では確定しない');
  const before=await read(),source=page.locator('[data-animation-index="3"] .animation-order-handle');const box=await source.boundingBox();await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();await page.mouse.move(box.x+8,box.y-90);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await read(),before,'Escapeはドラッグ中の順序変更を取り消す');
  await page.locator('[data-animation-more="1"]').click();assert.equal(await page.locator('[data-animation-index="1"] .animation-row-editor').count(),1,'︙で同じ一覧内に編集を展開する');assert.equal(await page.locator('[data-animation-index="1"] [data-animation-choice]').count(),12,'効果12種を維持する');assert.equal(await page.locator('[data-animation-index="1"] [data-animation-trigger]').count(),3,'開始は3つのアイコンボタン');await page.locator('[data-animation-delete="1"]').click();assert.deepEqual(await read(),['a0','a2','a3'],'︙内の削除は即時反映');await page.locator('#canvas').focus();await page.keyboard.press('Meta+z');await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].animations.length===4);assert.deepEqual(await read(),['a0','a1','a2','a3'],'削除はUndoで戻せる');
  await page.locator('[data-animation-more="0"]').click();
  await page.locator('#animation-duration').fill('0.8');
  await page.locator('#animation-delay').fill('0.2');
  await page.locator('[data-animation-trigger="with"]').click();
  await page.waitForFunction(()=>document.getElementById('animation-summary').textContent.includes('クリック 3回'));
  await page.locator('[data-animation-trigger="click"]').click();
  await page.waitForFunction(()=>document.getElementById('animation-summary').textContent.includes('クリック 4回'));
  await page.locator('[data-animation-more="1"]').click();
  await page.locator('[data-animation-trigger="after"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-animation-edit="1"]').getAttribute('aria-label').includes('1秒〜'));
  await page.locator('[data-animation-more="0"]').click();
  await page.locator('#animation-duration').fill('1.2');
  await page.waitForFunction(()=>document.querySelector('[data-animation-edit="1"]').getAttribute('aria-label').includes('1.4秒〜'));
  assert.match(await page.locator('#animation-summary').textContent(),/クリック 3回/,'開始条件の変更でクリック数も更新する');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.animation-row-editor').count(),0,'Escで行内編集だけを閉じる');
  assert.equal(await page.locator('#inspector-panel').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inspector-panel').isVisible(),false,'次のEscでパネルを閉じる');
  await page.locator('#animation-toggle').click();
  await page.locator('[data-animation-more="0"]').click();
  await page.locator('#objects-toggle').click();
  await page.locator('#inspector-title').focus(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inspector-panel').isVisible(),false,'別パネルへ移った後に古い動きのEsc処理を呼び戻さない');
  console.log('animation-order-browser.test.cjs: passed');
 }finally{await context.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
