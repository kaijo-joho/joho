import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createEditorServer} from './serve-pythoneditor.mjs';
import {demoCatalog} from '../tools/pythoneditor/demo.mjs';
import {validateCatalog,questionKey} from '../tools/pythoneditor/core.mjs';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const evidence=process.env.PYTHONEDITOR_SUBQUESTION_EVIDENCE||'/private/tmp/pythoneditor-subquestions';
await mkdir(evidence,{recursive:true});
const report={at:new Date().toISOString(),engine:process.env.PYTHONEDITOR_ENGINE||'Chrome',environment:'local browser, not school devices',checks:[]};
const check=name=>{report.checks.push(name);console.log('PASS',name);};
const server=await createEditorServer({isolate:false});
const browser=process.env.PYTHONEDITOR_ENGINE==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const code=()=>page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue());
const edit=value=>page.evaluate(value=>document.querySelector('.CodeMirror').CodeMirror.setValue(value),value);
const select=id=>page.locator(`#question-list button[data-question="${id}"]`).click();
async function input(value){await page.locator('#settings-menu > summary').click();await page.locator('#input-settings').click();await page.locator('#stdin').fill(value);await page.locator('#stdin-dialog [data-close]').click();}
async function run(){await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#run').dataset.state==='run',null,{timeout:125000});assert.equal(await page.locator('#error').isVisible(),false);return page.locator('#output').textContent();}
try{
  // Existing IDs, versions, templates and prompts must stay byte-for-byte equivalent as data.
  const oldSource=execFileSync('git',['show','f52fbaf4972f0816b2fbfc59f8f83f3c9d799271:tools/pythoneditor/demo.mjs'],{encoding:'utf8'});
  const oldCatalog=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
  const current=validateCatalog(demoCatalog),prior=oldCatalog.demoCatalog;
  for(const oldSet of prior.sets){
    const next=current.sets.find(s=>s.setId===oldSet.setId);assert.equal(next.questions.length,oldSet.questions.length);
    for(const oldQuestion of oldSet.questions){
      const nextQuestion=next.questions.find(q=>questionKey(q)===questionKey(oldQuestion));
      for(const [key,value] of Object.entries(oldQuestion))assert.deepEqual(nextQuestion[key],value);
    }
  }
  const all=current.sets.flatMap(s=>s.questions);assert.equal(new Set(all.map(questionKey)).size,all.length);check('new set validates and every previous demo ID/version/prompt/template remains unchanged');
  await page.goto(server.url+'?set=demo-subquestions&question=demo-temperature-01&version=demo-subquestions-v1');await page.waitForSelector('#question-list button');
  assert.equal(await page.locator('#set-select').inputValue(),'demo-subquestions');assert.equal(await page.locator('#question-list button').count(),5);
  assert.equal(await page.locator('#progress').textContent(),'実行済み 0 / 4 問');
  assert.deepEqual(await page.locator('#question-list .question-item-title').allTextContents(),['問1 (1) 気温を2つの場合に分ける','問1 (2) 気温を3つの場合に分ける','問2 (1) 表の作成と表示','問3 (1) 必要な箱の数','問3 (2) 入力を変えて確認']);
  assert.match(await page.locator('#prompt').textContent(),/問1 気温の判定/);assert.match(await page.locator('#prompt').textContent(),/\(1\) 2つ/);check('direct URL opens 3 parent questions / 5 entries, with parent and subquestion labels');
  await input('24\n');assert.equal(await run(),'気温（℃）: 24\n低い\n');
  const first=(await code()).replace('print("低い")','print("低い（編集済み）")');await edit(first);
  await select('demo-temperature-02');await input('15\n');assert.equal(await run(),'気温（℃）: 15\n中くらい\n');
  const second=await code();await select('demo-temperature-01');assert.equal(await code(),first);
  await page.reload();await page.waitForSelector('#question-list button');assert.equal(await code(),first);assert.equal(await page.locator('#stdin').inputValue(),'24\n');
  assert.equal(await run(),'気温（℃）: 24\n低い（編集済み）\n');await select('demo-temperature-02');assert.equal(await code(),second);assert.equal(await page.locator('#stdin').inputValue(),'15\n');
  check('same-parent subquestions independently retain code/input/output through switching and reload');
  await select('demo-table-01');assert.equal((await code()).match(/続きのプログラムを書きなさい/g).length,2);assert.equal(await page.locator('.CodeMirror').count(),1);
  assert.equal(await run(),'1 2 3 4\n5 6 7 8\n9 10 11 12\n');
  await edit((await code()).replace('col + 1','col + 21'));assert.equal(await run(),'21 22 23 24\n25 26 27 28\n29 30 31 32\n');
  check('two marked regions share one input cell and execute as one complete subquestion');
  await page.screenshot({path:evidence+'/multiple-regions.png',fullPage:true});
  await select('demo-boxes-01');await input('5\n');assert.equal(await run(),'品物の個数: 5\n必要な箱: 2\n');
  await edit((await code()).replace('items -= 4','items -= 3'));await run();
  const parent=await code(),progress=await page.locator('#progress').textContent();
  await select('demo-boxes-02');assert.equal(await code(),parent);assert.equal(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getOption('readOnly')),true);
  assert.equal(await page.locator('#work-status').textContent(),'確認問題');assert.equal(await page.locator('#observation-note').isVisible(),true);
  await input('7\n');assert.equal(await run(),'品物の個数: 7\n必要な箱: 3\n');assert.equal(await page.locator('#progress').textContent(),progress);
  assert.equal(progress,'実行済み 4 / 4 問');check('observation uses the latest earlier subquestion code, is read-only, and does not increase the practice count');
  await select('demo-boxes-01');assert.equal(await page.locator('#stdin').inputValue(),'5\n');await edit(parent.replace('items -= 3','items -= 2'));
  await select('demo-boxes-02');assert.match(await code(),/items -= 2/);assert.equal(await page.locator('#stdin').inputValue(),'7\n');assert.match(await page.locator('#output-status').textContent(),/変更前/);
  assert.equal(await run(),'品物の個数: 7\n必要な箱: 4\n');check('reference refresh does not overwrite source input or treat the previous result as current');
  await page.reload();await page.waitForSelector('#question-list button');assert.match(await code(),/items -= 2/);assert.equal(await page.locator('#work-status').textContent(),'確認問題');check('observation URL and referenced saved code restore after reload');
  await select('demo-table-01');const layouts=[];
  for(const width of [1440,720,390])for(const theme of ['auto','light','dark'])for(const size of ['standard','large','largest']){
    await page.setViewportSize({width,height:1000});await page.evaluate(({theme,size})=>{for(const [id,value] of [['theme',theme],['text-size',size]]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}},{theme,size});
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:Array.from(document.querySelectorAll('#question-list button')).every(el=>el.getBoundingClientRect().right<=innerWidth+1)}));
    assert.equal(layout.overflow,false,JSON.stringify({width,theme,size,layout}));assert.equal(layout.buttons,true);layouts.push({width,theme,size,...layout});
  }
  report.layouts=layouts;await page.screenshot({path:evidence+'/mobile.png',fullPage:true});check('parent/subquestion labels and prompt fit 27 viewport/theme/font combinations');
  assert.equal(await page.locator('#cloud-connect').isDisabled(),true);assert.equal(await page.locator('#formal-submit').isDisabled(),true);assert.deepEqual(errors,[]);check('school connection stays disabled and no unhandled browser error occurs');
  report.result='passed';
}catch(error){report.result='failed';report.failure=error.stack;await page.screenshot({path:evidence+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await writeFile(evidence+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.server.close(resolve));}
