/* Scope selection, downloaded files, offline playback and per-document UI state. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const C=require('../core.js'),A=require('../export-assets.js'),zip=require('../vendor/fflate-0.8.2.umd.js');
const {setAppearance}=require('./ui-helpers.cjs');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..'),artifacts='/private/tmp/illustslide-export-tabs-qa';
const server=http.createServer(async(req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const read=page=>page.evaluate(()=>IlapoEditor.getDocument());
const mode=async(page,value)=>{await page.locator(`[data-export-mode="${value}"]`).click();await settle(page);};
const checked=page=>page.locator('[data-export-page]:has(input:checked)').evaluateAll(rows=>rows.map(row=>row.dataset.exportPage));
const open=async page=>{if(await page.locator('#export-panel').isHidden())await page.locator('.side-tab [data-action="export-toggle"]').click();await settle(page);};
const details=async page=>{if(!await page.locator('#export-details').evaluate(el=>el.open))await page.locator('#export-details summary').click();};
async function load(page,doc){await page.locator('#file-input').setInputFiles({name:'export.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,doc.id);await settle(page);}
async function save(page,format){await page.locator('#export-format').selectOption(format);const pending=page.waitForEvent('download');await page.locator('#export-save').click();const file=await pending;return {name:file.suggestedFilename(),bytes:await fs.readFile(await file.path())};}
function outputDoc(bytes){return JSON.parse(bytes.toString().match(/<script type="application\/json" id="ilapo-playback-data">([\s\S]*?)<\/script>/)[1]);}
function fixture(){
  const doc=C.createDocument();doc.id='export-panel-fixture';doc.name='書き出し確認';doc.pages=[];
  for(const [index,color] of ['#EF4444','#22C55E','#2563EB'].entries()){
    const page=C.createPage(['赤のページ','緑のページ','青のページ'][index],{width:200,height:140,unit:'px',infinite:false});page.id='page-'+index;
    const object=C.makeShape('rect',20,30,40,30,{fill:color,stroke:'none',strokeWidth:0});object.id='shape-'+index;object.name='図形'+index;page.objects=[object];page.notes='非公開のノート'+index;
    if(index===2)page.skip=true;
    page.animations=[{id:'fade-'+index,effect:'fade',targets:[object.id],trigger:'click',duration:.01,delay:0,mode:'in'}];
    doc.pages.push(page);
  }
  const hidden=C.makeShape('rect',120,30,40,30,{fill:'#AABBCC'});hidden.id='private-object';hidden.name='非表示の秘密';hidden.visible=false;doc.pages[0].objects.push(hidden);
  A.add(doc,'page-0',['shape-0'],'赤い部品');A.add(doc,'page-1',['shape-1'],'緑の部品');return C.validateDocument(doc);
}
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.ILLUSTSLIDE_URL||`http://127.0.0.1:${server.address().port}/illustslide/`,browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);await page.waitForFunction(()=>window.IlapoEditor);await load(page,fixture());
    // Initialize the page checks when first opened, after navigating away from page 1.
    await page.locator('#pages-toggle').click();await page.locator('[data-page-id="page-1"]').click();await open(page);
    assert.deepEqual(await checked(page),['page-1']);assert.equal(await page.locator('[data-export-mode="pages"]').getAttribute('aria-selected'),'true');
    const original=await read(page),session=await page.evaluate(()=>IlapoEditor.getState().sessionId);
    let downloads=0;page.on('download',()=>downloads++);
    await page.locator('[data-export-page="page-0"] input').check();await page.locator('[data-export-page-pick="page-2"]').click();await settle(page);
    assert.deepEqual(await checked(page),['page-0','page-1'],'editing-page navigation does not change checks');
    assert.equal(await page.locator('[data-export-page-pick="page-2"]').getAttribute('aria-current'),'page');
    await page.locator('#export-format').selectOption('png');await details(page);await page.locator('#export-scale').fill('2');await page.locator('#export-background').selectOption('white');
    await mode(page,'assets');await page.locator('#export-padding').fill('0');await mode(page,'all');
    assert.equal(await page.locator('#export-format').inputValue(),'png');assert.equal(await page.locator('#export-scale').inputValue(),'2');assert.equal(await page.locator('#export-background').inputValue(),'white');
    assert.equal(await page.locator('#export-all-pane input').count(),0);assert.match(await page.locator('#export-all-summary').innerText(),/全3ページ/);
    await page.locator('#export-all-tab').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#export-assets-tab').getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#export-pages-tab').getAttribute('aria-selected'),'true');assert.deepEqual(await checked(page),['page-0','page-1']);
    assert.deepEqual(await read(page),original,'scope, checks and output settings never edit the document');assert.equal(downloads,0,'changing settings never starts a download');
    const svg=await save(page,'svg'),svgs=zip.unzipSync(svg.bytes);assert(svg.name.endsWith('.zip'));assert.deepEqual(Object.keys(svgs),['書き出し確認_赤のページ.svg','書き出し確認_緑のページ.svg']);
    assert.match(zip.strFromU8(svgs['書き出し確認_赤のページ.svg']),/width="200" height="140"/);assert.doesNotMatch(zip.strFromU8(svgs['書き出し確認_赤のページ.svg']),/AABBCC/);
    await page.locator('[data-export-pages="none"]').click();assert(await page.locator('#export-save').isDisabled());await page.locator('[data-export-pages="current"]').click();assert.deepEqual(await checked(page),['page-2']);
    const png=await save(page,'png');assert.equal(png.name,'書き出し確認_青のページ.png');assert.equal(png.bytes.readUInt32BE(16),400);assert.equal(png.bytes.readUInt32BE(20),280);
    const pixels=await page.evaluate(async bytes=>{const image=new Image();image.src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'image/png'}));await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const g=canvas.getContext('2d');g.drawImage(image,0,0);return Array.from(g.getImageData(0,0,1,1).data);},Array.from(png.bytes));assert.deepEqual(pixels,[255,255,255,255]);
    await page.locator('[data-export-pages="all"]').click();await page.locator('[data-export-page="page-1"] input').uncheck();
    const selectedHTML=outputDoc((await save(page,'html')).bytes);assert.deepEqual(selectedHTML.pages.map(p=>p.name),['赤のページ','青のページ'],'HTML uses checked pages in document order, including skip by default');
    await mode(page,'all');const allHTML=await save(page,'html'),all=outputDoc(allHTML.bytes);assert.equal(all.pages.length,3);assert(all.pages.every(p=>!('notes' in p)&&!('skip' in p)));assert(!('exportAssets' in all));assert(!JSON.stringify(all).includes('private-object'));
    await details(page);await page.locator('#export-exclude-skipped').check();assert.equal(outputDoc((await save(page,'html')).bytes).pages.length,2);
    await page.locator('#export-format').selectOption('svg');assert.match(await page.locator('#export-save').innerText(),/3ページ/,'the HTML skip setting does not affect static exports');
    await mode(page,'assets');await page.locator('#export-format').selectOption('html');await page.locator('#export-exclude-skipped').uncheck();const assetsHTML=await save(page,'html'),assets=outputDoc(assetsHTML.bytes);
    assert.deepEqual(assets.pages.map(p=>p.name),['赤い部品','緑の部品']);assert.equal(new Set(assets.pages.map(p=>p.id)).size,2);assert(assets.pages.every(p=>p.board.width===40&&p.board.height===30));assert(assets.pages.every(p=>p.objects.length===1&&p.animations.length===1));
    const offlineFile=path.join(artifacts,'assets.play.html');await fs.writeFile(offlineFile,assetsHTML.bytes);
    const offlineContext=await browser.newContext({offline:true}),offline=await offlineContext.newPage(),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));
    await offline.goto('file://'+offlineFile);await offline.waitForSelector('#ilapo-presentation[open]');assert.equal(await offline.locator('[data-animation-object="shape-0"]').getAttribute('opacity'),'0');
    await offline.keyboard.press('Space');await offline.waitForFunction(()=>!ilapoPlayback.getState().animation.playing);assert.equal(await offline.locator('[data-animation-object="shape-0"]').getAttribute('opacity'),'1');
    await offline.keyboard.press('ArrowRight');await offline.waitForSelector('[data-animation-object="shape-1"]');assert.deepEqual(requests,[]);await offline.screenshot({path:path.join(artifacts,'assets-offline.png')});await offlineContext.close();
    // The shared PDF button passes the same resolved, cropped targets to the print pipeline.
    await page.evaluate(()=>{IlapoExport.print=async(entries,options)=>{window.__printExport={entries,options};};});await page.locator('#export-format').selectOption('pdf');await page.locator('#export-save').click();await page.waitForFunction(()=>window.__printExport);
    const print=await page.evaluate(()=>window.__printExport);assert.deepEqual(print.entries.map(e=>e.selectionIds),[['shape-0'],['shape-1']]);assert.equal(print.options.padding,0);
    await mode(page,'pages');assert.deepEqual(await checked(page),['page-0','page-2']);
    const other=fixture();other.id='export-panel-other';other.name='別の作品';await load(page,other);await open(page);assert.equal(await page.locator('#export-format').inputValue(),'svg');assert.deepEqual(await checked(page),['page-0']);
    await page.locator(`[data-document-tab="${session}"]`).click();await open(page);assert.equal(await page.locator('#export-format').inputValue(),'pdf');assert.deepEqual(await checked(page),['page-0','page-2']);assert(await page.locator('#export-details').evaluate(el=>el.open));
    assert.deepEqual(await read(page),original,'exports and UI session state preserve source document, notes and skip');
    for(const [width,height] of [[1280,900],[736,860],[390,860],[320,860],[390,600]]){
      await page.setViewportSize({width,height});await open(page);await mode(page,'pages');await settle(page);
      const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,panel:document.querySelector('#export-panel').clientWidth,content:document.querySelector('#export-panel').scrollWidth}));assert(size.document<=size.viewport+1,JSON.stringify(size));assert(size.content<=size.panel+1,JSON.stringify(size));
      await page.locator('#export-save').scrollIntoViewIfNeeded();await page.locator('#export-save').click({trial:true});
      await page.screenshot({path:path.join(artifacts,`pages-${width}x${height}.png`)});
    }
    await page.setViewportSize({width:1280,height:900});await setAppearance(page,{theme:'dark',size:'xlarge'});await open(page);await mode(page,'pages');await page.locator('#export-format').selectOption('svg');await page.screenshot({path:path.join(artifacts,'pages-dark-large.png')});
    // Free canvases use the shared padding for HTML as well as static images.
    const free=fixture();free.id='export-panel-free';free.name='自由キャンバス確認';free.pages=free.pages.slice(0,1);free.pages[0].board.infinite=true;delete free.exportAssets;
    await load(page,free);await open(page);await details(page);await page.locator('#export-padding').fill('0');
    const freeHTML=outputDoc((await save(page,'html')).bytes);assert.equal(freeHTML.pages[0].board.infinite,false);assert.equal(freeHTML.pages[0].board.width,40);assert.equal(freeHTML.pages[0].board.height,30);
    assert.deepEqual(errors,[]);console.log('export panel checks passed: scope tabs, page checks and navigation, session isolation, SVG/PNG downloads, HTML skip/privacy/offline asset playback, PDF targets, keyboard and responsive layout');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
