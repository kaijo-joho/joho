import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createEditorServer} from './serve-pythoneditor.mjs';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const engine=process.env.PYTHONEDITOR_ENGINE||'Chrome';
const evidence=process.env.PYTHONEDITOR_NAV_EVIDENCE||'/private/tmp/pythoneditor-navigation';
await mkdir(evidence,{recursive:true});
const site=await createEditorServer({isolate:false});
const browser=engine==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const report={engine,environment:'local browser; demo ratings are fixed display examples',checks:[],layouts:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
const check=name=>{report.checks.push(name);console.log('PASS',name);};
try{
  await page.goto(site.url+'?set=demo-subquestions&question=demo-temperature-01&version=demo-subquestions-v1');await page.waitForSelector('#question-list button');
  assert.deepEqual(await page.locator('#question-list .question-group>h3').allTextContents(),['問1 気温の判定','問2 2次元リストの表','問3 必要な箱の数']);
  assert.equal(await page.locator('.question-number,#set-select').count(),0);
  assert.deepEqual(await page.locator('.question-item-title').allTextContents(),['(1) 気温を2つの場合に分ける','(2) 気温を3つの場合に分ける','表の作成と表示','(1) 必要な箱の数','(2) 入力を変えて確認']);
  assert.equal(await page.locator('.question-item-rating').first().textContent(),'★★★★☆☆☆');
  assert.match(await page.locator('#set-current-rating').textContent(),/★18\/32/);assert.match(await page.locator('#rating-note').textContent(),/表示例/);
  check('major headings, subquestion buttons without sequence numbers, 4/7 stars and 18/32 set total');
  await page.locator('#set-trigger').press('ArrowDown');assert.equal(await page.locator('#set-menu').isVisible(),true);assert.equal(await page.locator('#set-menu [aria-selected=true]').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Home');await page.keyboard.press('Enter');assert.equal(await page.locator('#set-trigger').getAttribute('data-set'),'demo');
  assert.equal(await page.locator('#set-trigger').evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('#set-menu').isVisible(),false);
  await page.locator('#set-trigger').press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.locator('#set-trigger').getAttribute('data-set'),'demo-subquestions');
  await page.locator('#set-trigger').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#set-menu').isVisible(),false);assert.equal(await page.locator('#set-trigger').evaluate(el=>el===document.activeElement),true);
  check('set picker supports arrows/Home/Enter/Escape and restores focus');
  const original=await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue());
  await page.locator('.CodeMirror textarea').press('Control+Home');await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.replaceRange('# 下書き\n',{line:0,ch:0}));
  await page.locator('#question-list button').nth(1).click();await page.locator('#question-list button').nth(0).click();
  assert.equal(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue()),'# 下書き\n'+original);assert.match(await page.locator('#set-current-rating').textContent(),/18\/32/);
  await page.reload();await page.waitForSelector('#question-list button');assert.equal(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue()),'# 下書き\n'+original);
  check('grouping, rating display and reload preserve the same question/version draft');
  for(const width of [1440,720,390])for(const theme of ['auto','light','dark'])for(const size of ['standard','large','largest']){
    await page.setViewportSize({width,height:1000});await page.evaluate(({theme,size})=>{for(const[id,value]of[['theme',theme],['text-size',size]]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}},{theme,size});
    await page.locator('#set-trigger').click();
    const row=await page.evaluate(()=>{const b=document.querySelector('#set-menu').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:innerWidth,height:innerHeight};});
    assert.equal(row.overflow,false,JSON.stringify(row));assert.ok(row.left>=0&&row.right<=width+1&&row.top>=0&&row.bottom<=1001,JSON.stringify(row));
    assert.match(await page.locator('#set-menu [data-set="demo-subquestions"] .set-rating').textContent(),/18\/32/);
    await page.keyboard.press('Escape');report.layouts.push({width,theme,size,...row});
  }
  check('27 viewport/theme/text-size conditions keep ratings and popup inside the viewport');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{for(const[id,value]of[['theme','dark'],['text-size','standard']]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}scrollTo(0,0);});
  await page.locator('#question-list button').nth(2).click();await page.screenshot({path:evidence+'/grouped.png',fullPage:true});
  await page.locator('#set-trigger').click();await page.screenshot({path:evidence+'/set-picker.png',fullPage:true});
  await page.locator('#question-title').click();assert.equal(await page.locator('#set-menu').isVisible(),false);
  check('outside click closes the set picker');
  assert.equal(await page.locator('#cloud-connect').isDisabled(),true);assert.equal(await page.locator('#formal-submit').isDisabled(),true);assert.deepEqual(report.errors,[]);
  check('fixed demo examples never enable official submission or create school results');
}catch(error){report.failure=error.stack;await page.screenshot({path:evidence+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await writeFile(evidence+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>site.server.close(r));}
