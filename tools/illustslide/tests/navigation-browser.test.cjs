/* ホバーメニューと、開いたまま編集できるページ一覧のChrome回帰。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const C=require('../core.js');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,name.endsWith('/')?name+'index.html':name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const read=page=>page.evaluate(()=>IlapoEditor.getDocument());
const state=page=>page.evaluate(()=>IlapoEditor.getState());
async function inspectorSubmit(page){const submit=page.locator('#inspector-submit');if(await submit.isVisible())await submit.click();await settle(page);}
function fixture(){
  const doc=C.createDocument();doc.id='navigation';doc.name='ページ一覧の確認';
  doc.pages=[0,1,2].map(i=>{
    const page=C.createPage('ページ '+(i+1),{width:640,height:480,unit:'px',infinite:false});page.id='page-'+i;
    const shape=C.makeShape('rect',130,160,150,100,{fill:['#2563EB','#22C55E','#F59E0B'][i]});shape.id='shape-'+i;
    page.objects=[shape];return page;
  });
  const second=C.makeShape('ellipse',350,250,100,80,{fill:'#EC4899'});second.id='other';doc.pages[0].objects.push(second);
  return doc;
}
async function load(page,doc=fixture()){
  await page.locator('#file-input').setInputFiles({name:'navigation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(()=>IlapoEditor.getDocument().id==='navigation');await settle(page);return doc;
}
const open=page=>page.locator('#pages-toggle').click();
async function pick(page,index){await page.locator(`[data-page-pick="${index}"]`).click();await settle(page);}
async function selectShape(page){await page.locator('#canvas').focus();await page.keyboard.press('v');await page.locator('#artwork [data-object="shape-0"]').click();await settle(page);}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/illustslide/`,browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];
  const artifacts=await fs.mkdtemp('/private/tmp/illustslide-navigation-');
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  try{
    await page.goto(url);await page.waitForFunction(()=>!!window.IlapoEditor);let original=await load(page);
    await selectShape(page);
    const more=page.locator('#selection-more'),menu=page.locator('#command-menu');
    const openOrder=async()=>{await more.hover();if(await menu.locator('[data-action=selection-order]').isVisible())await menu.locator('[data-action=selection-order]').click();};
    await page.locator('#canvas').focus();await more.hover();
    assert(await menu.evaluate(el=>el.matches(':popover-open')),'hover opens the selection menu');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'canvas','hover does not steal focus');
    assert(await menu.locator('[data-action=selection-order]').isVisible(),'ordering is in the other-actions menu');
    await menu.locator('[data-action=selection-order]').click();
    assert(await menu.locator('[data-action=order-front]').isVisible());
    const item=await menu.locator('[data-action=order-front]').boundingBox();
    await page.mouse.move(item.x+30,item.y+item.height/2,{steps:5});await page.waitForTimeout(300);
    assert(await menu.evaluate(el=>el.matches(':popover-open')),'the pointer can cross into the submenu');
    await page.keyboard.press('Escape');assert.equal(await menu.evaluate(el=>el.matches(':popover-open')),false);
    await openOrder();assert(await menu.evaluate(el=>el.matches(':popover-open')),'hover works again after Escape from inside the menu');
    await menu.locator('[data-action=order-front]').click();await settle(page);
    assert.equal((await read(page)).pages[0].objects.at(-1).id,'shape-0');
    await page.locator('#canvas').focus();await page.keyboard.press('Meta+z');await settle(page);assert.deepEqual(await read(page),original);
    await selectShape(page);await more.hover();await page.mouse.move(20,790);await page.waitForTimeout(320);
    assert.equal(await menu.evaluate(el=>el.matches(':popover-open')),false,'a hover-only menu closes after leaving');
    await more.hover();await page.keyboard.press('Escape');assert.equal(await menu.evaluate(el=>el.matches(':popover-open')),false);
    assert.equal((await page.evaluate(()=>IlapoEditor.getSelection())).length,1,'Escape closes only the submenu');
    await page.mouse.move(20,790);await more.focus();await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'transform');
    await menu.locator('[data-action=selection-order]').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'order-front');
    await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'order-back');
    await page.keyboard.press('Escape');assert.equal(await more.evaluate(el=>document.activeElement===el),true);
    await more.click();await menu.locator('[data-action=selection-order]').click();assert(await menu.locator('[data-action=order-front]').isVisible(),'click remains available');await page.keyboard.press('Escape');

    // 入力中でもホバーはフォーカスを奪わず、Escapeはメニューだけを閉じる。
    await page.locator('#style-button').click();await page.locator('#color-hex').focus();await more.hover();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'color-hex');
    await page.keyboard.press('Escape');assert(await page.locator('#inspector-panel').isVisible());
    await page.locator('#inspector-close').click();await settle(page);

    await open(page);await settle(page);
    assert.equal(await page.locator('#dialog').evaluate(el=>el.open),false);
    assert.equal(await page.locator('.page-card').count(),3);
    assert.equal(await page.locator('[data-page-pick="0"]').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('#pages-toggle').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#inspector-toggle').getAttribute('aria-expanded'),'false');
    await pick(page,1);assert.equal((await state(page)).pageId,'page-1');assert(await page.locator('#artwork [data-object="shape-1"]').isVisible());
    assert(await page.locator('#inspector-panel').isVisible());assert.deepEqual(await read(page),original,'navigation alone does not edit the project');
    assert(await page.locator('.top [data-action=undo]').isDisabled());
    await page.locator('[data-page-pick="1"]').focus();await page.keyboard.press('ArrowDown');await settle(page);assert.equal((await state(page)).pageId,'page-2');
    await page.keyboard.press('Home');await settle(page);assert.equal((await state(page)).pageId,'page-0');

    await page.locator('#pages-add').click();await settle(page);
    let document=await read(page);assert.equal(document.pages.length,4);assert.equal((await state(page)).pageId,document.pages[3].id);
    await page.locator('.top [data-action=undo]').click();await settle(page);assert.deepEqual(await read(page),original);
    await pick(page,1);await page.locator('#pages-duplicate').click();await settle(page);
    document=await read(page);
    const duplicateId=(await state(page)).pageId,duplicate=document.pages.find(p=>p.id===duplicateId);
    assert.equal(document.pages.length,4);assert.notEqual(duplicate.objects[0].id,'shape-1');assert.equal(duplicate.objects[0].style.fill,'#22C55E');
    await page.locator('#pages-rename').click();await page.locator('#page-name').fill('説明の続き');await page.locator('#dialog-submit').click();await settle(page);
    assert.equal((await read(page)).pages.find(p=>p.id===duplicateId).name,'説明の続き');assert(await page.locator('#inspector-panel').isVisible());
    const beforeMove=await read(page),index=beforeMove.pages.findIndex(p=>p.id===duplicateId);
    await page.locator(`[data-page-move="${index},-1"]`).click();await settle(page);
    assert.equal((await read(page)).pages[index-1].id,duplicateId);assert.equal((await state(page)).pageId,duplicateId);
    await page.locator('.top [data-action=undo]').click();await settle(page);assert.deepEqual(await read(page),beforeMove);
    await page.locator('#pages-delete').click();await page.locator('#dialog-cancel').click();assert.deepEqual(await read(page),beforeMove);
    await page.locator('#pages-delete').click();await page.locator('#dialog-submit').click();await settle(page);
    assert.equal((await read(page)).pages.length,3);assert.notEqual((await state(page)).pageId,duplicateId);
    await page.locator('.top [data-action=undo]').click();await settle(page);assert.deepEqual(await read(page),beforeMove);
    await pick(page,0);await selectShape(page);
    const thumb=await page.locator('[data-page-pick="0"] img').getAttribute('src');
    await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');await settle(page);
    assert.notEqual(await page.locator('[data-page-pick="0"] img').getAttribute('src'),thumb,'the thumbnail follows canvas edits');
    assert(await page.locator('#inspector-panel').isVisible());
    await page.locator('#help-button').click();assert(await page.locator('#operation-help').isVisible());await page.keyboard.press('Escape');
    await page.screenshot({path:path.join(artifacts,'pages-desktop.png')});

    for(const width of [1280,736,390,320]){
      await page.setViewportSize({width,height:736});
      await page.locator('[data-inspector-section=view]').click();await page.locator('#view-theme').selectOption('dark');await page.locator('#view-size').selectOption('xlarge');await inspectorSubmit(page);
      await page.locator('#pages-toggle').click();await settle(page);
      assert.equal(await page.locator('.page-card').count(),4);
      const layout=await page.evaluate(()=>{const p=document.getElementById('inspector-panel').getBoundingClientRect(),c=document.getElementById('canvas').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,pr:p.right,pt:p.top,cb:c.bottom,ch:c.height};});
      assert(!layout.overflow&&layout.pr<=width+1&&layout.ch>=200,JSON.stringify({width,layout}));if(width<=850)assert(layout.pt>=layout.cb-1);
      await page.locator('[data-page-pick="0"]').click();await settle(page);
      await page.screenshot({path:path.join(artifacts,`pages-${width}.png`)});
    }
    await page.locator('.side-tab [data-action=export-toggle]').click();assert(await page.locator('#export-panel').isVisible());
    assert.equal(await page.locator('#pages-toggle').getAttribute('aria-expanded'),'false');
    await open(page);assert.equal(await page.locator('#export-panel').isVisible(),false);
    await page.locator('#inspector-close').click();assert.equal(await page.locator('#pages-toggle').getAttribute('aria-expanded'),'false');

    const touchContext=await browser.newContext({viewport:{width:390,height:736},hasTouch:true,isMobile:true});
    try{
      const touch=await touchContext.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(url);await touch.waitForFunction(()=>!!window.IlapoEditor);await load(touch);
      await touch.locator('#artwork [data-object="shape-0"]').tap();await touch.locator('#selection-more').tap();await touch.locator('#command-menu [data-action=selection-order]').tap();
      await touch.locator('#command-menu [data-action=order-front]').tap();await settle(touch);assert.equal((await read(touch)).pages[0].objects.at(-1).id,'shape-0');
      await touch.locator('#pages-toggle').tap();await touch.locator('[data-page-pick="1"]').tap();await settle(touch);assert.equal((await state(touch)).pageId,'page-1');
      assert(await touch.locator('#inspector-panel').isVisible());
    }finally{await touchContext.close();}
    assert.deepEqual(errors,[]);console.log('illustSlide navigation browser tests passed. Artifacts: '+artifacts);
  }finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
