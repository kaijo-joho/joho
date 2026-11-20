const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const Core = require('../core.js');
const serve = require('./serve.cjs');
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const command = process.platform === 'darwin' ? 'Meta' : 'Control';
const docOf = page => page.evaluate(() => DiagramEditor.getDocument());
const snapshots = page => page.evaluate(() => [localStorage.getItem('kaijo.diagram.recovery.v1'),localStorage.getItem('kaijo.diagram.saved.v1')]);
async function action(page,id) {
  if (!await page.locator('#file-menu').evaluate(el => el.open)) await page.locator('#file-menu>summary').click();
  await page.locator('[data-file-action="' + id + '"]').click();
}
function fixture(title='保存した図') {
  const doc = Core.createDocument(); doc.title = title;
  doc.nodes = [Core.createNode('process',100,120,{id:'common_a',text:'入力'}),Core.createNode('process',350,120,{id:'common_b',text:'処理'})];
  doc.edges = [Core.createEdge({nodeId:'common_a'},{nodeId:'common_b'},{id:'common_edge'})]; return doc;
}
async function load(page,doc) {
  await page.locator('#file-input').setInputFiles({name:'common.diagram.json',mimeType:'application/json',buffer:Buffer.from(Core.serializeDocument(doc))});
  await page.locator('[data-open-source=local-file]').click();
  if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-continue').click();
  await page.waitForFunction(id => DiagramEditor.getDocument().id === id, doc.id);
}
async function main() {
  const hosting=await serve(), browser=await pw.chromium.launch({channel:'chrome',headless:true});
  const artifacts=path.join(os.tmpdir(),'joho-flowchart-common-ui'); await fs.mkdir(artifacts,{recursive:true});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    const page=await context.newPage(), errors=[], requests=[];
    page.setDefaultTimeout(12000); page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url());});
    page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
    await page.goto(hosting.url); await page.waitForFunction(()=>!!window.DiagramEditor);
    assert.equal(await page.locator('#file-menu').evaluate(el=>el.classList.contains('joho-file-menu')),true);
    assert.equal(await page.locator('.top').evaluate(el=>el.getBoundingClientRect().height),41);
    assert.equal(await page.locator('.brand a').getAttribute('href'),'../');
    await page.locator('#file-menu>summary').focus(); await page.keyboard.press('End');
    const focusedAction=()=>page.evaluate(()=>document.activeElement.id);
    assert.equal(await focusedAction(),'print-button');
    await page.keyboard.press('ArrowUp'); assert.equal(await focusedAction(),'autosave-settings');
    await page.keyboard.press('ArrowDown'); assert.equal(await focusedAction(),'print-button');
    await page.keyboard.press('ArrowDown'); assert.equal(await focusedAction(),'new-file');
    await page.keyboard.press('ArrowUp'); assert.equal(await focusedAction(),'print-button');
    await page.keyboard.press('Home'); assert.equal(await focusedAction(),'new-file');
    await page.keyboard.press('Escape');
    const first=fixture(); await load(page,first); await action(page,'browserSave');
    const saved=await snapshots(page);
    await action(page,'rename'); await page.locator('#document-title').fill('変更した図');
    assert.equal(await page.getByRole('dialog',{name:'名前を変更',exact:true}).isVisible(),true);
    await page.locator('#rename-form button[type=submit]').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kaijo.diagram.recovery.v1'))?.document.title==='変更した図');
    const renamed=await docOf(page);
    assert.equal(renamed.id,first.id); assert.deepEqual(renamed.nodes,first.nodes); assert.equal(renamed.title,'変更した図');
    assert.equal((await snapshots(page))[1],saved[1],'Renaming does not overwrite explicit browser save');
    await action(page,'rename'); await page.locator('#document-title').fill('   '); await page.locator('#rename-form button[type=submit]').click();
    assert.equal(await page.locator('#rename-dialog').evaluate(el=>el.open),true);
    await page.locator('#rename-dialog').getByRole('button',{name:'キャンセル',exact:true}).click();
    assert.deepEqual(await docOf(page),renamed,'Blank names and cancellation preserve the diagram');
    assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#file-menu>summary')),true);
    await action(page,'rename'); await page.locator('#document-title').fill('確定前の名前');
    await page.locator('#rename-form button[type=submit]').focus();
    await page.evaluate(()=>DiagramEditor.select([]));
    assert.equal(await page.locator('#document-title').inputValue(),'確定前の名前','Rendering while the confirm button is focused preserves the rename draft');
    await page.keyboard.press('Escape'); await page.locator('#rename-dialog').waitFor({state:'hidden'});
    assert.deepEqual(await docOf(page),renamed);
    assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#file-menu>summary')),true);
    await page.keyboard.press(command+'+s');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kaijo.diagram.saved.v1'))?.document.title==='変更した図');
    assert.notEqual((await snapshots(page))[1],saved[1],'The save shortcut works after rename returns focus to a closed file menu');
    await page.evaluate(()=>DiagramEditor.select(['common_a']));
    const beforeMenu=await snapshots(page);
    if (!await page.locator('#file-menu').evaluate(el=>el.open)) await page.locator('#file-menu>summary').click();
    await page.locator('[data-file-action=new]').focus();
    for (const key of ['Backspace','Delete','t']) await page.keyboard.press(key);
    assert.deepEqual(await docOf(page),renamed,'Keys within a file menu do not edit the selected diagram');
    assert.deepEqual(await snapshots(page),beforeMenu);
    await page.locator('#file-menu>summary').press('Escape');
    const beforeOpen=await snapshots(page);
    const chooserPromise=page.waitForEvent('filechooser'); await page.keyboard.press(command+'+o');
    const chooser=await chooserPromise; await chooser.setFiles({name:'別の図.diagram.json',mimeType:'application/json',buffer:Buffer.from(Core.serializeDocument(fixture('別の図')))});
    await page.locator('#storage-open-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-open-source=local-file]').count(),1);
    assert.match(await page.locator('[data-open-source=local-file]').textContent(),/別の図/);
    await page.keyboard.press('Escape');
    await page.locator('#storage-open-dialog').waitFor({state:'hidden'});
    assert.deepEqual(await docOf(page),renamed); assert.deepEqual(await snapshots(page),beforeOpen,'Cancelled file opening leaves both snapshots intact');
    await action(page,'browserOpen');
    assert.equal(await page.locator('[data-open-source^=local-]').count(),0);
    assert.equal(await page.locator('[data-open-source=browser-manual]').count(),1);
    await page.keyboard.press('Escape');
    await page.locator('#storage-open-dialog').waitFor({state:'hidden'});
    const downloadPromise=page.waitForEvent('download'); await action(page,'fileSave');
    const download=await downloadPromise, raw=await fs.readFile(await download.path(),'utf8');
    assert.deepEqual(Core.parseDocument(raw),renamed,'File menu downloads a complete editable diagram');
    const beforeHelp=await snapshots(page), documentBeforeHelp=await docOf(page);
    await page.locator('#help-button').click();
    const help=page.locator('#operation-help');
    assert.equal(await help.getAttribute('aria-modal'),'false');
    await help.locator('.tool-help__topics').selectOption('op-connect');
    await help.locator('.tool-help__move').focus();
    for (const key of ['Delete',command+'+z',command+'+s','t']) await page.keyboard.press(key);
    assert.deepEqual(await docOf(page),documentBeforeHelp); assert.deepEqual(await snapshots(page),beforeHelp,'Help keys do not edit, undo, or save the diagram');
    await help.getByRole('button',{name:'ヘルプを開いたまま編集へ戻る',exact:true}).click();
    assert.equal(await help.isVisible(),true);
    await page.evaluate(()=>DiagramEditor.select(['common_a']));
    await page.locator('#canvas').focus(); await page.keyboard.press('Delete');
    assert.equal((await docOf(page)).nodes.length,1); assert.equal(await help.isVisible(),true);
    await page.keyboard.press(command+'+z'); assert.deepEqual(await docOf(page),documentBeforeHelp);
    await page.keyboard.press('Escape'); assert.equal(await help.isVisible(),true,'Editor Escape leaves help open');
    await help.locator('[data-help-close]').click();
    assert.equal(await page.evaluate(()=>document.activeElement===document.getElementById('help-button')),true);
    await page.locator('#canvas').focus(); await page.keyboard.press('?'); assert.equal(await help.isVisible(),true);
    await help.locator('[data-help-close]').click();
    const displayDoc=await docOf(page);
    for (const width of [1280,736,390]) {
      await page.setViewportSize({width,height:800});
      for (const theme of ['light','dark','auto']) for (const size of ['standard','large','largest']) {
        await page.locator('#settings-menu>summary').click();
        await page.locator('[data-theme-choice="'+theme+'"]').click(); await page.locator('#text-size').selectOption(size);
        await page.locator('#settings-menu>summary').press('Escape');
        const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,help:document.getElementById('help-button').getBoundingClientRect().right<=innerWidth,settings:document.getElementById('settings-menu').getBoundingClientRect().right<=innerWidth}));
        assert.deepEqual(layout,{overflow:false,help:true,settings:true},width+'/'+theme+'/'+size);
        assert.deepEqual(await docOf(page),displayDoc);
      }
      await page.locator('#help-button').click();
      const box=await help.boundingBox(); assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=801);
      await help.locator('[data-help-close]').click();
    }
    await page.locator('#palette-toggle').click(); assert.equal(await page.locator('#parts-palette').isVisible(),false);
    await page.locator('#help-button').click(); await page.screenshot({path:path.join(artifacts,'mobile-help.png'),fullPage:true});
    await help.locator('[data-help-close]').click(); await page.locator('#palette-toggle').click();
    assert.equal(await page.locator('#parts-palette').isVisible(),true);
    assert.deepEqual(await docOf(page),displayDoc); assert.deepEqual(errors,[]);
    assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===new URL(hosting.url).origin),'No account connection or document upload');
    await context.close();
    const touch=await browser.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true});
    const t=await touch.newPage(); await t.goto(hosting.url); await t.waitForFunction(()=>!!window.DiagramEditor);
    await t.locator('#palette-toggle').tap(); await t.locator('#help-button').tap();
    assert.equal(await t.locator('#operation-help').isVisible(),true);
    for (const id of ['help-button','palette-toggle']) {
      const box=await t.locator('#'+id).boundingBox(); assert.ok(box.width>=44&&box.height>=44,id+' remains a 44px touch target');
    }
    await touch.close();
    for (const missing of ['ui-adapter.js','file-menu.js','help-panel.js','ui-icons.js']) {
      const c=await browser.newContext(); await c.route('**/'+missing+'*',route=>route.abort());
      const p=await c.newPage(); await p.goto(hosting.url); await p.waitForFunction(()=>!!window.DiagramEditor);
      assert.equal(await p.locator('#palette-toggle').isVisible(),missing!=='ui-adapter.js','The palette button appears only after its handler is ready');
      await load(p,fixture('読み込み失敗時の図'));
      if (!await p.locator('#file-menu').evaluate(el=>el.open)) await p.locator('#file-menu>summary').click();
      await p.locator('#save-browser').click(); assert.ok((await snapshots(p))[1],missing+' retains saving');
      await p.locator('#help-button').click();
      assert.equal(await p.locator('#operation-help:visible,#help-dialog:visible').count(),1,missing+' retains help');
      await c.close();
    }
    const partial=await browser.newContext();
    await partial.route('**/ui-icons.js*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+`\n{const original=window.JohoIcons;window.JohoIcons={...original,create(id,...args){if(id==='theme-auto')throw new Error('simulated theme initialization failure');return original.create(id,...args)}}}`});
    });
    const p=await partial.newPage(), partialErrors=[]; p.on('pageerror',e=>partialErrors.push(e.message));
    await p.goto(hosting.url); await p.waitForFunction(()=>!!window.DiagramEditor);
    await load(p,fixture('補助UI初期化の失敗'));
    await p.evaluate(()=>DiagramEditor.select(['common_a']));
    const beforePartial=await docOf(p), partialSnapshots=await snapshots(p);
    await p.locator('#help-button').click(); await p.locator('#operation-help .tool-help__move').focus();
    await p.keyboard.press('Delete');
    assert.deepEqual(await docOf(p),beforePartial,'A theme initialization failure does not remove help keyboard isolation');
    assert.deepEqual(await snapshots(p),partialSnapshots); assert.deepEqual(partialErrors,[]);
    await p.locator('#operation-help [data-help-close]').click();
    await p.locator('#settings-menu>summary').click(); assert.equal(await p.locator('#theme').isVisible(),true,'The theme select remains available as fallback');
    await partial.close();
    console.log(JSON.stringify({ok:true,coverage:['file menu and keyboard isolation','rename/cancel/rerender','file shortcut/cancel','snapshot preservation','file roundtrip','nonmodal help and keyboard isolation','27 display conditions','touch','optional resource and partial initialization failures','no external requests'],artifacts},null,2));
  } finally {await browser.close();await hosting.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
