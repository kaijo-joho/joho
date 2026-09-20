'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path'), os=require('node:os'), http=require('node:http');
const C=require('../core.js'), zip=require('../vendor/fflate-0.8.2.umd.js');
const {setAppearance}=require('./ui-helpers.cjs');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..'), artifacts='/private/tmp/illustslide-export-assets-qa';
const server=http.createServer(async(req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''), file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const read=page=>page.evaluate(()=>IlapoEditor.getDocument());
async function load(page,doc,name='assets.json'){
  await page.locator('#file-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,doc.id);await settle(page);
}
async function openExport(page){if(await page.locator('#export-panel').isHidden())await page.locator('.side-tab [data-action="export-toggle"]').click();await settle(page);}
async function pick(page,id){await page.locator('#canvas').focus();await page.keyboard.press('v');await page.locator(`#artwork [data-object="${id}"]`).click();await settle(page);}
async function download(page,format){const pending=page.waitForEvent('download');await page.locator(`[data-action="export-${format}"]`).click();const value=await pending;return {name:value.suggestedFilename(),bytes:await fs.readFile(await value.path())};}
function fixture(){
  const doc=C.createDocument();doc.id='export-fixture';doc.name='アセットの確認';
  const p=doc.pages[0];p.id='page-first';p.name='最初';p.board={width:200,height:140,unit:'px',infinite:false};
  const a=C.makeShape('rect',12,18,60,40,{fill:'#FF0000',stroke:'none',strokeWidth:0});a.id='red';a.name='赤い長方形';
  const b=C.makeShape('ellipse',120,70,40,40,{fill:'#0000FF',stroke:'none',strokeWidth:0});b.id='blue';b.name='青い円';p.objects=[a,b];
  const second=C.createPage('別ページ',p.board);second.id='page-second';const c=C.makeShape('triangle',20,20,50,50,{fill:'#22C55E',stroke:'none',strokeWidth:0});c.id='green';c.name='緑の三角';second.objects=[c];doc.pages.push(second);return doc;
}
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.ILLUSTSLIDE_URL||`http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:860}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('kaijo-ilapo:inspector','360'));
    await page.goto(url);await page.waitForFunction(()=>window.IlapoEditor);await load(page,fixture());
    await pick(page,'red');await page.locator('#style-button').click();const width=(await page.locator('#inspector-panel').boundingBox()).width;
    await openExport(page);assert.equal((await page.locator('#export-panel').boundingBox()).width,width,'export shares the normal inspector width');
    await page.locator('#export-asset-add').click();await page.waitForFunction(()=>IlapoEditor.getDocument().exportAssets?.length===1);
    assert.equal(await page.locator('#export-range').inputValue(),'assets');
    const firstId=(await read(page)).exportAssets[0].id;const first=page.locator(`[data-export-asset="${firstId}"]`);
    const name=first.locator('.export-asset-name');await name.focus();
    await name.evaluate(input=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='ロゴ';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
    await settle(page);assert.equal((await read(page)).exportAssets[0].name,'赤い長方形','IME preedit is not committed');
    await name.evaluate(input=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'ロゴ'})));
    await page.waitForFunction(()=>IlapoEditor.getDocument().exportAssets[0].name==='ロゴ');
    assert(await name.evaluate(input=>document.activeElement===input),'live name update keeps focus');
    await name.press('Meta+z');assert.equal((await read(page)).exportAssets[0].name,'赤い長方形','one undo restores the rename');
    await name.focus();
    await name.evaluate(input=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='変換中の名前';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
    await first.locator('input[type=checkbox]').focus();await settle(page);
    assert.equal(await name.inputValue(),'変換中の名前','blur before compositionend does not discard preedit');
    await name.evaluate(input=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'変換中の名前'})));
    await page.waitForFunction(()=>IlapoEditor.getDocument().exportAssets[0].name==='変換中の名前');
    await name.fill('ロゴ/共通');await name.press('Enter');
    await pick(page,'blue');await page.locator('#export-asset-add').click();await settle(page);
    const secondId=(await read(page)).exportAssets[1].id;const second=page.locator(`[data-export-asset="${secondId}"]`);
    await second.locator('.export-asset-name').fill('ロゴ/共通');await second.locator('.export-asset-name').press('Enter');
    await page.locator('#export-padding').fill('0');
    const batch=await download(page,'svg');assert(batch.name.endsWith('.zip'));
    const files=zip.unzipSync(batch.bytes);assert.deepEqual(Object.keys(files).sort(),['ロゴ_共通.svg','ロゴ_共通_2.svg']);
    assert.match(zip.strFromU8(files['ロゴ_共通.svg']),/#FF0000/);assert.doesNotMatch(zip.strFromU8(files['ロゴ_共通.svg']),/#0000FF/);
    assert.match(zip.strFromU8(files['ロゴ_共通_2.svg']),/#0000FF/);assert.doesNotMatch(zip.strFromU8(files['ロゴ_共通_2.svg']),/#FF0000/);
    assert(!files['manifest.json'],'asset ZIP contains portable images only');
    const pngBatch=zip.unzipSync((await download(page,'png')).bytes);
    assert.deepEqual(Object.keys(pngBatch).sort(),['ロゴ_共通.png','ロゴ_共通_2.png']);
    assert.equal(Buffer.from(pngBatch['ロゴ_共通.png']).readUInt32BE(16),60);
    assert.equal(Buffer.from(pngBatch['ロゴ_共通_2.png']).readUInt32BE(16),40);
    await second.locator('input[type=checkbox]').uncheck();
    await page.locator('#export-padding').fill('3');await page.locator('#export-scale').fill('2');
    const png=await download(page,'png');assert.equal(png.name,'ロゴ_共通.png');assert.equal(png.bytes.readUInt32BE(16),132);assert.equal(png.bytes.readUInt32BE(20),92);
    // Source changes affect later exports; registration itself never edits source objects.
    await first.locator('.export-asset-thumb').click();await page.locator('#style-button').click();
    await page.locator('#color-hex').fill('#22C55E');await page.locator('#color-hex').press('Tab');
    await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].objects[0].style.fill==='#22C55E');
    await openExport(page);const edited=await download(page,'svg');assert.match(edited.bytes.toString(),/#22C55E/);assert.doesNotMatch(edited.bytes.toString(),/#FF0000/);
    await first.locator('.export-asset-thumb').click();await page.locator('#canvas').focus();await page.keyboard.press('Delete');await settle(page);
    assert.equal((await read(page)).exportAssets.length,2);assert.match(await first.locator('.export-asset-status').innerText(),/元の図形/);
    assert(await page.locator('[data-action="export-svg"]').isDisabled(),'missing checked source never falls back to a whole-page export');
    await page.locator('.toolbar-history[data-action="undo"]').click();await settle(page);assert(!(await page.locator('[data-action="export-svg"]').isDisabled()));
    await second.locator('.export-asset-remove').click();assert.equal((await read(page)).exportAssets.length,1);assert.equal((await read(page)).pages[0].objects.length,2,'removal only unregisters');
    await page.locator('.toolbar-history[data-action="undo"]').click();await settle(page);assert.equal((await read(page)).exportAssets.length,2);
    // Page changes and thumbnail navigation preserve cross-page registration.
    await page.locator('#pages-toggle').click();await page.locator('[data-page-id="page-second"]').click();await pick(page,'green');await openExport(page);await page.locator('#export-asset-add').click();await settle(page);
    assert.equal((await read(page)).exportAssets[2].pageId,'page-second');
    await first.locator('.export-asset-thumb').click();await page.waitForFunction(()=>IlapoEditor.getState().pageId==='page-first');
    assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),['red']);
    await page.locator('#export-range').selectOption('page');const whole=await download(page,'svg');assert.match(whole.bytes.toString(),/width="200" height="140"/);assert.match(whole.bytes.toString(),/#0000FF/);
    await page.locator('#export-range').selectOption('selection');const selection=await download(page,'svg');assert.doesNotMatch(selection.bytes.toString(),/#0000FF/);
    assert.equal(await page.locator('#print-range option').count(),2);assert(await page.locator('[data-action="export-playback"]').isVisible(),'full-page print and playback exports remain');
    const project=await read(page);
    const beforeImport=await page.evaluate(()=>IlapoEditor.getState().sessionId);
    const zipBytes=await page.evaluate(()=>Array.from(IlapoSVG.encodeProject(IlapoEditor.getDocument())));
    await page.locator('#file-input').setInputFiles({name:'roundtrip.illustslide.zip',mimeType:'application/zip',buffer:Buffer.from(zipBytes)});
    await page.waitForFunction(id=>IlapoEditor.getState().sessionId!==id,beforeImport);await settle(page);
    assert.deepEqual((await read(page)).exportAssets,project.exportAssets,'editable ZIP preserves registrations');
    assert.equal((await read(page)).version,10);
    await openExport(page);assert.equal(await page.locator('.export-asset-row').count(),3);
    await page.locator('#file-button').click();await page.locator('#command-menu [data-action="save-browser"]').click();
    await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.endsWith(':saved')&&JSON.parse(localStorage[key]).document?.exportAssets?.length===3));
    await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.endsWith(':auto')&&JSON.parse(localStorage[key]).document?.exportAssets?.length===3));
    const session=await page.evaluate(()=>IlapoEditor.getState().sessionId);
    const other=fixture();other.id='other-export-fixture';other.name='別の作品';await load(page,other);await openExport(page);assert.equal(await page.locator('.export-asset-row').count(),0);
    const otherSession=await page.evaluate(()=>IlapoEditor.getState().sessionId);
    await page.locator(`[data-document-tab="${session}"]`).click();await openExport(page);assert.equal(await page.locator('.export-asset-row').count(),3,'asset lists belong to each document session');
    await page.locator('#export-range').selectOption('page');
    await page.evaluate(()=>{const original=IlapoExport.png;IlapoExport.png=async(...args)=>{IlapoExport.png=original;await new Promise(resolve=>window.__releaseExport=resolve);return original(...args);};});
    const frozenDownload=page.waitForEvent('download');await page.locator('[data-action="export-png"]').click();
    await page.waitForFunction(()=>typeof window.__releaseExport==='function');
    await page.locator(`[data-document-tab="${otherSession}"]`).click();await openExport(page);
    await page.evaluate(()=>window.__releaseExport());const frozenResult=await frozenDownload;
    assert.equal(frozenResult.suggestedFilename(),'アセットの確認_最初.png','async export keeps its source document after a tab switch');
    assert.equal(await page.locator('.export-asset-row').count(),0,'async completion does not transfer assets into another document');
    await page.locator(`[data-document-tab="${session}"]`).click();await openExport(page);
    // Two panels and narrow layouts retain the established dock behavior.
    await page.locator('#pages-toggle').click();await page.locator('#inspector-pin').click();await openExport(page);
    assert(await page.locator('#pinned-inspector-panel').isVisible());
    for(const viewportWidth of [1280,1000,736,390,320]){
      await page.setViewportSize({width:viewportWidth,height:860});await openExport(page);await settle(page);
      const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,content:document.querySelector('#export-panel').scrollWidth,panel:document.querySelector('#export-panel').clientWidth}));
      assert(metrics.scroll<=metrics.width+1,JSON.stringify({viewportWidth,...metrics}));assert(metrics.content<=metrics.panel+1,'no horizontal overflow inside export panel at '+viewportWidth);
    }
    await page.setViewportSize({width:1280,height:860});await setAppearance(page,{theme:'dark',size:'xlarge'});await openExport(page);await settle(page);
    await page.screenshot({path:path.join(artifacts,'assets-dark.png')});
    assert.deepEqual(errors,[]);
    console.log('export-assets browser checks passed: live references, names/IME/undo, SVG/PNG ZIP, PNG size, deletion, page/session changes, browser saves, project ZIP, full exports, panel widths and responsive layout');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
