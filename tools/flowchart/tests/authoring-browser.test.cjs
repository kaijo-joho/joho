/* Text layout, parts organization and reviewed automatic layout, in Chrome. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const C=require('../core.js'),B=require('../parts.js');
let pw;try{pw=require('playwright');}catch{pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const AUTO='kaijo.flowchart.parts.auto.v1',SAVED='kaijo.flowchart.parts.saved.v1';
async function serve(){
  const allowed=new Set(['index.html','core.js','render.js','layout.js','transitions.js','parts.js','output.js','storage.js','local-autosave.js','editor.js','editor.css','icon.svg']);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
  const server=http.createServer(async(req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!allowed.has(file))return res.writeHead(404).end();try{res.writeHead(200,{'Content-Type':`${types[path.extname(file)]}; charset=utf-8`});res.end(await fs.readFile(path.join(__dirname,'..',file)));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return{url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(resolve=>server.close(resolve))};
}
function fixture(){const d=C.createDocument();d.id='authoring_fixture';d.title='文字と配置';d.nodes=[C.createNode('process',100,140,{id:'a',w:180,h:120,text:'入力する\n値を確認'}),C.createNode('process',420,290,{id:'b',w:160,h:100,text:'処理する'}),C.createNode('process',160,480,{id:'c',w:140,h:80,text:'出力する'})];d.edges=[C.createEdge({nodeId:'a',side:'left'},{nodeId:'b',side:'right'},{id:'ab',waypoints:[{x:70,y:320}],label:{text:'次へ',dx:12,dy:-20}}),C.createEdge({nodeId:'b'},{nodeId:'c'},{id:'bc'})];return d;}
const getDoc=page=>page.evaluate(()=>DiagramEditor.getDocument());
const select=(page,ids)=>page.evaluate(ids=>DiagramEditor.select(ids),ids);
async function menu(page,id){const target=page.locator('#'+id);if(await page.locator('.toolbar').getAttribute('data-compact')==='true'){const needed=await target.evaluate(el=>!!el.closest('#toolbar-options')),expanded=await page.locator('#toolbar-toggle').getAttribute('aria-expanded')==='true';if(needed!==expanded)await page.locator('#toolbar-toggle').click();}if(!await target.evaluate(el=>el.open))await target.locator(':scope > summary').click();}
async function load(page,doc){await page.locator('#file-input').setInputFiles({name:'authoring.diagram.json',mimeType:'application/json',buffer:Buffer.from(C.serializeDocument(doc))});await page.waitForFunction(()=>document.getElementById('storage-open-dialog').open);await page.locator('[data-open-source="local-file"]').click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#confirm-continue').click();await page.waitForFunction(expected=>JSON.stringify(DiagramEditor.getDocument())===expected,JSON.stringify(C.parseDocument(doc)));}
async function number(page,id,value){await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');}
async function bytes(download){const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);return Buffer.concat(chunks).toString('utf8');}
async function download(page,id){const promise=page.waitForEvent('download');await page.locator('#'+id).click();return bytes(await promise);}
async function textLayout(page){
  await load(page,fixture());await select(page,['a']);await menu(page,'more-format');
  for(const value of ['left','right','center']){await page.locator('#text-align').selectOption(value);assert.equal(await page.locator('#scene [data-node="a"] text').getAttribute('text-anchor'),{left:'start',right:'end',center:'middle'}[value]);}
  const ys=[];for(const value of ['top','middle','bottom']){await page.locator('#text-vertical').selectOption(value);ys.push(Number(await page.locator('#scene [data-node="a"] text').getAttribute('y')));}assert.ok(ys[0]<ys[1]&&ys[1]<ys[2]);
  await page.locator('#text-align').selectOption('left');await number(page,'text-padding-x',26);await number(page,'text-padding-y',24);
  const styled=await getDoc(page);assert.equal(styled.nodes[0].style.textPaddingX,26);assert.equal(styled.nodes[0].style.textPaddingY,24);
  assert.equal(Number(await page.locator('#scene [data-node="a"] text').getAttribute('x')),126);
  await number(page,'text-padding-x',161);assert.deepEqual(await getDoc(page),styled,'Invalid padding does not edit the document');await number(page,'text-padding-x',26);
  await menu(page,'edit-menu');await page.locator('#copy-style-button').click();await select(page,['b']);await menu(page,'edit-menu');await page.locator('#paste-style-button').click();
  assert.deepEqual((await getDoc(page)).nodes[1].style,styled.nodes[0].style);await page.locator('#undo').click();assert.deepEqual(await getDoc(page),styled,'Paste layout is one undo');await page.locator('#redo').click();
  await select(page,['b']);await menu(page,'more-format');await page.locator('#reset-text-layout').click();assert.equal((await getDoc(page)).nodes[1].style.textAlign,undefined);
  await select(page,['a','b']);await menu(page,'more-format');assert.equal(await page.locator('#text-align').inputValue(),'');assert.equal(await page.locator('#text-padding-x').inputValue(),'');
  const final=await getDoc(page);await menu(page,'file-menu');const saved=await download(page,'save-file');assert.deepEqual(C.parseDocument(saved),final);
  const svg=await page.evaluate(()=>DiagramRender.svgDocument(DiagramEditor.getDocument()));assert.match(svg,/text-anchor="start"/);
  await menu(page,'file-menu');await page.locator('#print-button').click();assert.ok(await page.locator('#print-preview text[text-anchor="start"]').count());await page.keyboard.press('Escape');
  await load(page,C.parseDocument(saved));assert.deepEqual(await getDoc(page),final);
  const shaped=fixture();shaped.nodes[0]=C.createNode('decision',100,140,{id:'a',text:'入力した数が正か',w:180,h:90});await load(page,shaped);await select(page,['a']);await menu(page,'more-format');await page.locator('#text-align').selectOption('left');await page.locator('#text-vertical').selectOption('top');
  assert.equal(await page.evaluate(()=>{const n=DiagramEditor.getDocument().nodes[0],t=DiagramRender.nodeTextLayout(n);return n.x===100&&n.y===140&&t.bounds.h<=t.box.h&&t.bounds.w<=t.box.w;}),true,'Changing alignment fits a diamond without moving its origin');
  const fixed=fixture();fixed.nodes[0].locked=true;await load(page,fixed);await select(page,['a']);await menu(page,'more-format');assert.equal(await page.locator('#text-align').isDisabled(),true);assert.equal(await page.locator('#text-padding-x').isDisabled(),true);
}
async function openLayout(page){await menu(page,'align-menu');await page.locator('#auto-layout-button').click();await page.waitForFunction(()=>document.getElementById('layout-dialog').open);}
async function automaticLayout(page){
  const original=fixture();await load(page,original);await select(page,['c','a','b']);const before=await getDoc(page),undo=await page.locator('#undo').isDisabled();await openLayout(page);
  assert.ok(await page.locator('#layout-preview svg').count());assert.deepEqual(await getDoc(page),before);assert.equal(await page.locator('#undo').isDisabled(),undo);
  await page.locator('#layout-direction').selectOption('horizontal');await page.locator('#layout-gap').fill('80');await page.locator('#layout-route').uncheck();
  assert.equal(await page.locator('#layout-apply').isDisabled(),false);assert.deepEqual(await getDoc(page),before);await page.keyboard.press('Escape');assert.deepEqual(await getDoc(page),before);await page.waitForFunction(()=>document.querySelector('#align-menu > summary')===document.activeElement);
  await openLayout(page);await page.locator('#layout-apply').click();const horizontal=await getDoc(page);assert.deepEqual(horizontal.nodes.map(n=>n.x),[100,360,600]);assert.deepEqual(horizontal.edges,before.edges,'Route off keeps manual paths');
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),before);await page.locator('#redo').click();assert.deepEqual(await getDoc(page),horizontal);await page.locator('#undo').click();
  await openLayout(page);await page.locator('#layout-direction').selectOption('vertical');await page.locator('#layout-gap').fill('50');await page.locator('#layout-route').check();await page.locator('#layout-gap').fill('401');assert.equal(await page.locator('#layout-apply').isDisabled(),true);assert.deepEqual(await getDoc(page),before);await page.locator('#layout-gap').fill('50');await page.locator('#layout-apply').click();
  const vertical=await getDoc(page);assert.deepEqual(vertical.nodes.map(n=>n.y),[140,310,460]);assert.equal(vertical.edges[0].from.side,'bottom');assert.equal(vertical.edges[0].to.side,'top');assert.deepEqual(vertical.edges[0].waypoints,[]);assert.deepEqual(vertical.edges[0].label,before.edges[0].label);
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),before);
  const branch=fixture();branch.edges.push(C.createEdge({nodeId:'a'},{nodeId:'c'},{id:'branch'}));await load(page,branch);await select(page,['a','b','c']);await openLayout(page);assert.equal(await page.locator('#layout-apply').isDisabled(),true);assert.match(await page.locator('#layout-message').textContent(),/分岐/);assert.deepEqual(await getDoc(page),branch);await page.keyboard.press('Escape');
}
async function organizeParts(page){
  await load(page,fixture());let library=B.emptyLibrary();for(const [id,name,category] of [['p10','処理10','繰り返し'],['input','入力',''],['p2','処理2','繰り返し']])library=B.add(library,{...B.capture(fixture(),['a'],name,category),id});
  const raw=JSON.stringify({savedAt:'2026-09-15T00:00:00.000Z',library});await page.evaluate(({raw,AUTO,SAVED})=>{localStorage.setItem(AUTO,raw);localStorage.setItem(SAVED,raw);},{raw,AUTO,SAVED});
  const before=await getDoc(page),undo=await page.locator('#undo').isDisabled();await page.locator('#my-parts').click();await page.locator('[data-parts-source="auto"]').click();
  const ids=()=>page.locator('[data-part-id]').evaluateAll(els=>els.map(el=>el.dataset.partId));assert.deepEqual(await ids(),['p10','input','p2']);
  await page.locator('#part-name').fill('編集中の名前');await page.locator('#part-category').fill('編集中のカテゴリ');await page.locator('[data-part-id="input"]').click();await page.locator('[data-part-id="p10"]').click();assert.equal(await page.locator('#part-name').inputValue(),'編集中の名前');assert.equal(await page.locator('#part-category').inputValue(),'編集中のカテゴリ');
  await page.locator('#parts-search').fill('入力');await page.locator('#parts-search').fill('');await page.locator('[data-part-id="p10"]').click();assert.equal(await page.locator('#part-name').inputValue(),'編集中の名前');await page.locator('#part-name').fill('処理10');await page.locator('#part-category').fill('繰り返し');assert.equal(await page.locator('#part-draft-note').isVisible(),false);
  await page.locator('#parts-search').fill('処理２');assert.deepEqual(await ids(),['p2']);assert.equal(await page.locator('#part-up').isDisabled(),true);assert.equal(await page.locator('#part-name').inputValue(),'処理2');
  await page.locator('#parts-search').fill('見つからない');assert.equal(await page.locator('#parts-no-results').isVisible(),true);assert.equal(await page.locator('#parts-save-file').isDisabled(),false);await page.locator('#parts-clear-filter').click();
  await page.locator('#parts-category-filter').selectOption('none');assert.deepEqual(await ids(),['input']);await page.locator('#parts-category-filter').selectOption('cat:繰り返し');assert.deepEqual(await ids(),['p10','p2']);await page.locator('#parts-category-filter').selectOption('all');
  await page.locator('#parts-sort').selectOption('name');assert.deepEqual((await ids()).filter(id=>id.startsWith('p')),['p2','p10']);await page.locator('#parts-sort').selectOption('manual');assert.deepEqual(await ids(),['p10','input','p2']);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),AUTO),raw,'Viewing does not autosave');
  await page.locator('[data-part-id="p2"]').click();await page.locator('#part-up').click();assert.deepEqual(await ids(),['p10','p2','input']);assert.equal(await page.evaluate(key=>localStorage.getItem(key),SAVED),raw,'Manual snapshot is independent');
  await page.locator('#part-name').fill('処理02');await page.locator('#part-category').fill('条件判定');await page.locator('#rename-part').click();const auto=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).library,AUTO);assert.equal(auto.items[1].name,'処理02');assert.equal(auto.items[1].category,'条件判定');
  await page.locator('#parts-sort').selectOption('updated');assert.equal((await ids())[0],'p2');
  const file=await download(page,'parts-save-file');assert.deepEqual(B.parseLibrary(file),auto);await page.locator('#parts-save-browser').click();assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).library,SAVED),auto);
  assert.deepEqual(await getDoc(page),before);assert.equal(await page.locator('#undo').isDisabled(),undo);await page.keyboard.press('Escape');
  await select(page,['a']);await menu(page,'edit-menu');await page.locator('#register-part').click();await page.locator('#register-part-name').fill('新しいセット');await page.locator('#register-part-category').fill('入力');await page.locator('#register-part-form button[type=submit]').click();assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).library.items.at(-1).category,AUTO),'入力');assert.deepEqual(await getDoc(page),before);
}
async function responsive(browser,url,width){
  const context=await browser.newContext({viewport:{width,height:820},hasTouch:width===390});const page=await context.newPage();
  try{await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);await load(page,fixture());await menu(page,'settings-menu');await page.locator('#theme').selectOption('dark');await page.locator('#text-size').selectOption('largest');await page.keyboard.press('Escape');await select(page,['a','b','c']);await openLayout(page);
    for(const id of ['layout-title','layout-apply']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=820,`${id} visible at ${width}`);}
    await page.locator('#layout-direction').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#layout-gap').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#layout-direction').evaluate(el=>el===document.activeElement),true);
    if(width===390)await page.locator('#layout-apply').tap();else await page.locator('#layout-apply').press('Enter');assert.deepEqual((await getDoc(page)).nodes.map(n=>n.y),[140,320,480]);
    await page.locator('#my-parts').click();await page.keyboard.press('Escape');await select(page,['a']);await menu(page,'edit-menu');await page.locator('#register-part').click();await page.locator('#register-part-name').fill('表示確認');await page.locator('#register-part-category').fill('確認');await page.locator('#register-part-form button[type=submit]').click();await page.locator('#my-parts').click();assert.equal(await page.locator('#parts-filters').isVisible(),true);await page.locator('#parts-search').fill('確認');assert.equal(await page.locator('[data-part-id]').count(),1);
    await page.locator('#part-category').fill('変更');await page.locator('#rename-part').click();const box=await page.locator('#parts-dialog .dialog-actions').boundingBox();assert.ok(box.y+box.height<=820);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Escape');
    await select(page,['a']);await menu(page,'more-format');await page.locator('#text-align').selectOption('right');await page.locator('#text-vertical').selectOption('top');await number(page,'text-padding-x',30);assert.equal((await getDoc(page)).nodes[0].style.textAlign,'right');await page.keyboard.press('Escape');
  }finally{await context.close();}
}
(async()=>{const local=process.env.FLOWCHART_TEST_URL?null:await serve(),url=process.env.FLOWCHART_TEST_URL||local.url,browser=await pw.chromium.launch({channel:'chrome',headless:true});const errors=[];
  try{const page=await browser.newPage({viewport:{width:1280,height:820}});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);await textLayout(page);console.log('text layout PASS');await automaticLayout(page);console.log('automatic layout PASS');await organizeParts(page);console.log('parts organization PASS');await page.close();for(const width of [1280,736,390])await responsive(browser,url,width);assert.deepEqual(errors,[]);console.log('Chrome authoring PASS (1280 / 736 / 390, keyboard / touch / dark / largest)');}
  finally{await browser.close();if(local)await local.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
