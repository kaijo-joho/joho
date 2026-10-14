import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createEditorServer } from './serve-pythoneditor.mjs';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('playwright');
const evidence=process.env.PYTHONEDITOR_EVIDENCE || '/private/tmp/pythoneditor-verification';
await mkdir(evidence,{recursive:true});
const report={at:new Date().toISOString(),environment:'local automated browser; not school devices',checks:[],curriculum:[]};
const check=(name)=>{report.checks.push(name);console.log('PASS',name);};
const demo=await createEditorServer(),nonisolated=await createEditorServer({isolate:false});
let privateServer;
if(process.env.PYTHONEDITOR_MASTER)privateServer=await createEditorServer({master:process.env.PYTHONEDITOR_MASTER});
const browser=process.env.PYTHONEDITOR_ENGINE==='webkit' ? await webkit.launch({headless:true}) : await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
report.engine=process.env.PYTHONEDITOR_ENGINE || 'Chrome';
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function edit(code){await page.evaluate(code=>document.querySelector('.CodeMirror').CodeMirror.setValue(code),code);}
async function uiRun(){await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#stop').disabled,null,{timeout:125000});}
async function apiRun(target,request,timeout=120000){
  return target.evaluate(async({request,timeout})=>{
    const {PythonRunner}=await import('/tools/pythoneditor/runner.mjs');
    return new Promise(resolve=>{
      let text='',stderr='',figures=0,fileNames=[],hasInput=false;
      const callback=event=>{
        if(event.type==='text'){if(event.stream==='stderr')stderr+=event.text;else text+=event.text;}
        if(event.type==='figure')figures++;
        if(event.type==='file')fileNames.push(event.name);
        if(event.type==='input'){hasInput=true;globalThis.testRunner.input('',true);}
        if(['done','error','stopped'].includes(event.type))resolve({type:event.type,text,stderr,figures,fileNames,hasInput,error:event.error||'',status:event.text||''});
      };
      globalThis.testRunner ||= new PythonRunner(callback);
      globalThis.testRunner.onEvent=callback;globalThis.testRunner.runMs=timeout;
      globalThis.testRunner.run(request);
    });
  },{request,timeout});
}
try{
  await page.goto(demo.url);await page.waitForSelector('#question-list button');
  assert.equal(await page.locator('#question-list button').count(),3);check('standalone vertical cells and demo startup');
  await edit('print("こんにちは")\nprint("a","b",sep="-",end="!")');await uiRun();
  assert.equal(await page.locator('#output').textContent(),'こんにちは\na-b!');check('actual Pyodide Japanese stdout and print sep/end');
  await page.locator('#question-list button').nth(1).click();await edit('name = input("名前: ")\nn = int(input("整数: "))\nprint(name,n+1)');
  await page.locator('#stdin-section summary').click();await page.locator('#stdin').fill('海城\n7\n');await uiRun();
  assert.match(await page.locator('#output').textContent(),/海城 8/);check('multiple queued inputs and Japanese input');
  await page.locator('#stdin').fill('');await page.locator('#run').click();
  await page.waitForSelector('#interactive-input:not([hidden])');await page.locator('#input-line').fill('対話');await page.locator('#interactive-input button[type=submit]').click();
  await page.waitForSelector('#interactive-input:not([hidden])');await page.locator('#input-line').fill('9');await page.locator('#interactive-input button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#stop').disabled);assert.match(await page.locator('#output').textContent(),/対話 10/);check('interactive input in isolated worker');
  await page.locator('#run').click();await page.waitForSelector('#interactive-input:not([hidden])');await page.locator('#input-eof').click();await page.waitForFunction(()=>document.querySelector('#stop').disabled);
  assert.match(await page.locator('#error').textContent(),/EOFError/);check('interactive EOF and readable error guidance');
  await edit('raise ValueError("入力値を確認")');await uiRun();assert.match(await page.locator('#error').textContent(),/ValueError: 入力値を確認/);check('Python exception type, message and line');
  await edit('while True:\n    pass');await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#run-status').textContent==='実行中');
  const stopAt=Date.now();await page.locator('#stop').click();assert.ok(Date.now()-stopAt<1500);assert.match(await page.locator('#output-status').textContent(),/停止/);
  await edit('print("再実行")');await uiRun();assert.equal(await page.locator('#output').textContent(),'再実行\n');check('infinite-loop stop and real rerun after worker restart');
  await page.locator('#question-list button').nth(0).click();assert.match(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue()),/こんにちは/);
  await page.reload();await page.waitForSelector('#question-list button');assert.match(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue()),/こんにちは/);check('question switching and reload retain drafts and last selection');
  await page.locator('#file-menu summary').click();await page.locator('#save-browser').click();
  await edit('print("変更後")');await page.locator('#file-menu summary').click();await page.locator('#restore-browser').click();
  await page.locator('#restore-options button').filter({hasText:'明示保存'}).click();await page.locator('#confirm-import').click();
  assert.match(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue()),/こんにちは/);
  await page.locator('#file-menu summary').click();await page.locator('#restore-browser').click();assert.ok(await page.locator('#restore-options button').filter({hasText:'控え'}).count());await page.locator('#restore-dialog [data-close]').click();check('explicit browser save and protected pre-restore copy');
  await page.locator('#file-menu summary').click();const downloaded=page.waitForEvent('download');await page.locator('#save-file').click();const file=await downloaded;
  await file.saveAs(`${evidence}/demo-draft.json`);
  await edit('print("ファイル取込前")');await page.locator('#file-input').setInputFiles(`${evidence}/demo-draft.json`);await page.locator('#confirm-import').click();assert.match(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue()),/こんにちは/);check('local-file download and conflict-safe import');
  await page.locator('#question-list button').nth(2).click();await uiRun();assert.equal(await page.locator('#figures img').count(),1);assert.equal(await page.locator('#error').textContent(),'');assert.doesNotMatch(await page.locator('#stderr').textContent(),/Glyph.*missing/);check('NumPy/matplotlib and Japanese font without glyph warnings');
  assert.match(await page.locator('.formal-state').textContent(),/接続前/);check('execution state remains separate from formal score/submission');
  await page.locator('#help-button').click();assert.equal(await page.locator('#operation-help').isVisible(),true);await edit('plt.plot([1,2],[3,5])\nplt.show()');assert.equal(await page.locator('#operation-help').isVisible(),true);await page.locator('[data-help-close]').click();check('shared non-modal help while editing');
  for(const width of [1440,720,390])for(const theme of ['light','dark','auto'])for(const size of ['standard','large','largest']){
    await page.setViewportSize({width,height:900});await page.locator('#settings-menu summary').click();await page.locator('#theme').selectOption(theme);await page.locator('#text-size').selectOption(size);await page.locator('#settings-menu summary').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}/${theme}/${size} overflow`);
  }
  check('390/720/1440px, all 3 themes and all 3 text sizes');
  await page.setViewportSize({width:1440,height:1000});await page.locator('#settings-menu summary').click();await page.locator('#theme').selectOption('light');await page.locator('#text-size').selectOption('standard');await page.locator('#settings-menu summary').click();
  await edit('plt.plot([1,2,3],[2,4,3],marker="o")\nplt.title("日ごとの変化")\nplt.show()');await uiRun();await page.evaluate(()=>new Promise(r=>{scrollTo(0,0);requestAnimationFrame(()=>requestAnimationFrame(r));}));await page.screenshot({path:`${evidence}/editor-desktop.png`});
  await page.setViewportSize({width:390,height:900});await page.evaluate(()=>new Promise(r=>{scrollTo(0,0);requestAnimationFrame(()=>requestAnimationFrame(r));}));await page.screenshot({path:`${evidence}/editor-mobile.png`});
  await context.setOffline(true);await edit('print(3+4)');await uiRun();assert.equal(await page.locator('#output').textContent(),'7\n');await context.setOffline(false);check('network loss after warm runtime keeps editor and local execution');
  const noSab=await context.newPage();await noSab.goto(nonisolated.url);await noSab.waitForSelector('#question-list button');
  const eof=await apiRun(noSab,{code:'print(input())',stdin:[]});assert.match(eof.error,/EOFError/);assert.equal(eof.hasInput,false);check('no SharedArrayBuffer fallback uses queued input and EOF');await noSab.close();
  const flood=await apiRun(page,{code:'for i in range(30000):\n    print("0123456789")',stdin:[]},10000);assert.equal(flood.type,'error');assert.match(flood.error,/上限/);assert.ok(flood.text.length<=100000);check('large output capped without UI freeze');
  const syntax=await apiRun(page,{code:'if True\n    print(1)',stdin:[]});assert.match(syntax.error,/SyntaxError/);
  const fresh=await apiRun(page,{code:'print("isolated-variable" in globals())',stdin:[]});assert.equal(fresh.text,'False\n');check('syntax errors and fresh globals between runs');
  const saveGraph=await apiRun(page,{code:'import matplotlib.pyplot as plt\nplt.plot([1,2])\nplt.savefig("graph.png")\nfrom google.colab import files\nfiles.download("graph.png")\nplt.show()',stdin:[]});assert.equal(saveGraph.figures,1);assert.deepEqual(saveGraph.fileNames,['graph.png']);check('Colab PNG download adapter and figure output');
  const oldFile=await apiRun(page,{code:'from google.colab import files\nfiles.download("graph.png")',stdin:[]});assert.match(oldFile.error,/FileNotFoundError/);check('previous run file is not reused as current output');
  const tooMany=await apiRun(page,{code:'import matplotlib.pyplot as plt\nfor i in range(13):\n    plt.figure()\n    plt.plot([1,2])\n    plt.show()',stdin:[]});assert.equal(tooMany.type,'error');assert.equal(tooMany.figures,12);check('multiple figures and configured output limit');
  const injected=await page.evaluate(async()=>{const {renderPrompt}=await import('/tools/pythoneditor/prompt.mjs');const div=document.createElement('div');renderPrompt(div,'<img src="https://example.invalid/secret" onerror="alert(1)"><script>alert(1)</script><details><summary>ヒント</summary>本文</details> $x^2$');return {scripts:div.querySelectorAll('script,img,iframe').length,details:div.querySelectorAll('details').length,math:div.querySelectorAll('.katex').length};});assert.deepEqual(injected,{scripts:0,details:1,math:1});check('sanitized prompt retains hints/math and removes scripts/external images');
  // 本番認証ではない。失効・拒否時に別取得経路へ行かないことだけ合成確認。
  const denied=await context.newPage();let catalogs=0;
  await denied.route('**/__pythoneditor/catalog',route=>{catalogs++;return route.fulfill({status:403,body:'Forbidden'});});
  await denied.goto(demo.url);await denied.waitForFunction(()=>document.querySelector('#notice').textContent.includes('権限'));assert.equal(await denied.locator('#question-list button').count(),0);assert.equal(catalogs,1);await denied.close();check('synthetic permission denial has no fallback request');
  const fallback=await context.newPage();await fallback.route('**/shared/*.js',route=>route.abort());await fallback.route('**/htmleditor/vendor/*.js',route=>route.abort());
  await fallback.goto(demo.url);await fallback.waitForSelector('#question-list button');await fallback.locator('#code').fill('print("fallback")');await fallback.locator('#run').click();await fallback.waitForFunction(()=>document.querySelector('#stop').disabled,null,{timeout:120000});assert.equal(await fallback.locator('#output').textContent(),'fallback\n');await fallback.close();check('shared-help/CodeMirror download failure retains textarea editor');
  if(privateServer){
    const qp=await context.newPage();await qp.goto(privateServer.url);await qp.waitForSelector('#question-list button');assert.equal(await qp.locator('#set-select option').count(),22);
    let visited=0;
    for(const setId of privateServer.catalog.sets.map(s=>s.setId)){
      await qp.locator('#set-select').selectOption(setId);
      for(let i=0;i<await qp.locator('#question-list button').count();i++){await qp.locator('#question-list button').nth(i).click();assert.ok(await qp.locator('#prompt').textContent());visited++;}
    }
    assert.equal(visited,125);check('all 22 master sets / 125 question displays and drafts');
    const responses=await Promise.all(Array.from({length:40},()=>fetch(new URL('/__pythoneditor/catalog',privateServer.url)).then(r=>r.json())));
    assert.ok(responses.every(r=>r.sets.length===22));check('40 simultaneous loopback catalog requests (not 40 school devices/GAS)');
    if(process.env.PYTHONEDITOR_CASES){
      const cases=JSON.parse(await readFile(process.env.PYTHONEDITOR_CASES,'utf8'));
      for(const [i,c] of cases.entries()){
        const start=Date.now(),result=await apiRun(qp,c,i===0||c.expectFigure?120000:15000);
        const expectedError=c.expectedError && result.type==='error' && result.error.includes(c.expectedError);
        const recorded={id:c.id,setId:c.setId,type:result.type,ms:Date.now()-start,figures:result.figures,error:expectedError?'':result.error.slice(-1600),expectedError:expectedError?c.expectedError:'',unplannedInput:result.hasInput,referenceMatch:c.expected?result.text===c.expected:null};
        if(c.expected && result.text!==c.expected)recorded.referenceDifference={expected:c.expected.slice(-500),actual:result.text.slice(-500)};
        if(c.expectFigure && !result.figures)recorded.error+=' Missing figure';
        report.curriculum.push(recorded);
        if((i+1)%10===0||result.type!=='done')console.log('CURRICULUM',i+1,'/',cases.length,c.id,result.type,recorded.error.slice(-200));
      }
      const failures=report.curriculum.filter(r=>(r.type!=='done'&&!r.expectedError)||r.unplannedInput||r.error);
      console.log('Curriculum',report.curriculum.length,'failures',failures.length);
      await writeFile(`${evidence}/browser-report.json`,JSON.stringify(report,null,2));
      assert.equal(failures.length,0,JSON.stringify(failures));check('all source reference programs actually executed in browser Pyodide');
    }
    await qp.close();
  }
  assert.deepEqual(errors,[]);check('no unhandled page errors');
}catch(error){
  report.failure=String(error);
  report.failedUI=await page.evaluate(()=>({notice:document.querySelector('#notice')?.textContent,status:document.querySelector('#run-status')?.textContent,output:document.querySelector('#output')?.textContent,error:document.querySelector('#error')?.textContent,inputHidden:document.querySelector('#interactive-input')?.hidden})).catch(()=>null);
  throw error;
}finally{
  await writeFile(`${evidence}/browser-report.json`,JSON.stringify(report,null,2));
  await browser.close();await new Promise(r=>demo.server.close(r));await new Promise(r=>nonisolated.server.close(r));if(privateServer)await new Promise(r=>privateServer.server.close(r));
}
