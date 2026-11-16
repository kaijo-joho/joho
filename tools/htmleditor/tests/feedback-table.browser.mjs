// 実エンジンと候補GAS clientを合成の2 originでつなぐ。実GAS/RPC/利用者データは使わない。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const engine=process.env.HTML_FEEDBACK_ENGINE || 'chromium';
const evidence=process.env.HTML_FEEDBACK_EVIDENCE || '/private/tmp/html-feedback-table-20261116-evidence/browser-'+engine;
const gas=process.env.HTML_FEEDBACK_GAS || '/private/tmp/html-feedback-table-20261116-evidence/candidate';
await mkdir(evidence,{recursive:true});
const form=await readFile(join(gas,'21_html_assignment_upload.html'),'utf8');
const catalog=JSON.parse(await readFile(join(root,'tools/htmleditor/grading/catalog.json'),'utf8'));
const origin='https://joho.kaijo.ed.jp';
const harness=`<!doctype html><html lang="ja" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/tools/htmleditor/editor.css"><link rel="stylesheet" href="/tools/htmleditor/feedback.css"><body>
<dialog id="actionDialog"><h2>実習ファイルの提出</h2><div id="actionBody"></div><button id="close">閉じる</button></dialog>
${['feedback','grading-assets','local-grading','download','submission'].map(n=>'<script src="/tools/htmleditor/'+n+'.js"></script>').join('')}
<script>window.syntheticErrors=[];const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('error',event=>syntheticErrors.push(event.message));}};const local=HtmlEditorLocalGrading;window.HtmlEditorLocalGrading={...local,create(options){const grader=local.create(options);return{async grade(input){try{return await grader.grade(input);}catch(error){syntheticErrors.push(error.message);throw error;}}};}};window.openCase=function(data){document.documentElement.dataset.theme=data.dark?'dark':'light';window.testPanel=HtmlEditorSubmission.create({container:document.getElementById('actionBody'),dialog:document.getElementById('actionDialog'),url:'https://script.google.com/macros/s/SYNTHETIC/exec?kind=html&flow=normal&kadai='+data.target,targetId:data.target,proof:data.proof,savedFile:data.manual?null:{fileName:data.target+'.html',text:data.source},isCurrent:()=>true,requestClose:()=>document.getElementById('actionDialog').close()});document.getElementById('close').onclick=()=>{testPanel.dispose();document.getElementById('actionDialog').close();};document.getElementById('actionDialog').showModal();};</script></body></html>`;
function embeddedForm(url) {
  const target=url.searchParams.get('kadai'),bridge=url.searchParams.get('bridge');
  assert(/^html\d{2}-\d{2}$/.test(target)&&/^[a-f0-9]{48}$/.test(bridge));
  const boot=JSON.stringify({targetId:target,embedBridge:bridge});
  const script=`<script>window.__HTML_ASSIGNMENT_BOOT__=${boot};window.syntheticCalls=[];var received={submissionId:'7'.padStart(32,'0'),targetId:'${target}',fileName:'${target}.html',title:'合成課題',receivedAt:'2026-11-16T03:00:00Z',gradingState:'queued',rules:[]};function runner(ok,fail){var r={withSuccessHandler:f=>runner(f,fail),withFailureHandler:f=>runner(ok,f)};r.getHtmlAssignmentInfo=function(arg){syntheticCalls.push('info');setTimeout(()=>ok({targetId:'${target}',fileName:'${target}.html',title:'合成課題',requestId:'1'.padStart(32,'0')}),10);};for(var method of ['submitHtmlAssignmentSavedFile','submitHtmlAssignment']){r[method]=function(arg){syntheticCalls.push('submit');setTimeout(()=>ok(received),10);};}r.processHtmlAssignmentSubmission=function(){syntheticCalls.push('process');setTimeout(()=>ok({...received,gradingState:'graded',rules:[{label:'合成採点項目',mark:'★'}]}),20);};r.getHtmlAssignmentReceipt=function(){syntheticCalls.push('receipt');setTimeout(()=>ok(received),10);};return r;}window.google={script:{run:runner(()=>{},()=>{})}};</script>`;
  return form.replace('<script>',script+'<script>');
}
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
const report={engine,cases:[],errors:[],externalRequests:[]};
try {
  for(const item of [
    {name:'graded15',target:'html15-01',suffix:'1-5_1',rows:7},
    {name:'pending15',target:'html15-01',suffix:'1-5_1',pending:true,rows:7,narrow:true},
    {name:'pending15-02',target:'html15-02',suffix:'1-5_2',pending:true,rows:4},
    {name:'pending16',target:'html16-01',suffix:'1-6',pending:true,rows:35},
    {name:'pending17',target:'html17-01',suffix:'1-7',pending:true,rows:4,narrow:true},
    {name:'manual',target:'html15-01',suffix:'1-5_1',manual:true,rows:1,narrow:true},
    {name:'asset-failure',target:'html15-02',suffix:'1-5_2',assetFailure:true,rows:1},
    {name:'receipt11',target:'html11-01',rows:1,narrow:true}
  ]) {
    const context=await browser.newContext({viewport:{width:item.narrow?390:1200,height:900},reducedMotion:item.narrow?'reduce':'no-preference'});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(item.name+': '+e.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin==='https://script.google.com')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><style>body{margin:0}iframe{display:block;width:100%;height:800px;border:0}</style><iframe src="https://synthetic-script.googleusercontent.com/form'+url.search+'"></iframe>'});
      if(url.origin==='https://synthetic-script.googleusercontent.com')return route.fulfill({status:200,contentType:'text/html',body:embeddedForm(url)});
      if(url.origin!==origin){report.externalRequests.push(url.origin);return route.abort();}
      if(url.pathname==='/tools/htmleditor/__feedback-test')return route.fulfill({status:200,contentType:'text/html',body:harness});
      if(item.assetFailure&&url.pathname.endsWith('/grading/normal-engine.js'))return route.fulfill({status:503,body:'synthetic asset failure'});
      const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/'))return route.abort();
      try{return route.fulfill({status:200,contentType:({'.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'text/plain',body:await readFile(path)});}catch{return route.fulfill({status:404,body:''});}
    });
    try {
      await page.goto(origin+'/tools/htmleditor/__feedback-test');
      let source=item.suffix?await readFile(join(root,'html/answer'+item.suffix+'.html'),'utf8'):'<!doctype html><html><head><title>準備</title></head><body>準備</body></html>';
      if(item.pending)source=source.replace('</head>','<style>body{color:navy}</style></head>');
      const binding=catalog.bindings.find(b=>b.targetId===item.target&&b.templateVersion==='2026-10-local-1');assert(binding);
      await page.evaluate(data=>openCase(data),{source,target:item.target,manual:item.manual,dark:item.narrow,proof:{assignmentId:item.target,templateVersion:binding.templateVersion,templateSha256:binding.templateSha256}});
      const local=page.locator('.submission-local-results');
      await local.locator('tbody tr').first().waitFor({timeout:20000});
      const actualRows=await local.locator('tbody tr').count();
      const unavailable=engine==='webkit' && await page.evaluate(()=>syntheticErrors.includes('grading_failed'));
      assert.equal(actualRows,unavailable?1:item.rows);
      assert.equal(await local.locator('ul').count(),0);
      if(unavailable||item.pending||item.manual||item.assetFailure||item.target==='html11-01') {
        assert.equal(await local.locator('.correct').count(),0);
        assert(!/[★☆]/.test(await local.innerText()));assert((await local.innerText()).includes('確認待ち'));
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert(await local.locator('td').evaluateAll(cells=>cells.every(cell=>Array.from(cell.querySelectorAll('button')).every(button=>button.getBoundingClientRect().right<=cell.getBoundingClientRect().right+1))));
      if(item.pending&&!unavailable){
        const button=local.locator('button.pending').first(),table=local.locator('table').first();
        const before=await table.boundingBox();await button.focus();await page.getByRole('tooltip').waitFor();
        assert.equal((await table.boundingBox()).y,before.y);await page.keyboard.press('Escape');assert(await page.locator('#actionDialog').evaluate(n=>n.open));
      }
      await page.screenshot({path:join(evidence,item.name+'-before.png')});
      const frame=page.frameLocator('iframe.download-frame').frameLocator('iframe');await frame.locator('#submit:not([disabled])').waitFor({timeout:5000});
      if(item.manual)await frame.locator('#htmlFile').setInputFiles({name:item.target+'.html',mimeType:'text/html',buffer:Buffer.from(source)});
      await frame.locator('#submit').click();
      await frame.getByRole('heading',{name:'提出を受け付けました',exact:true}).waitFor();
      await page.waitForFunction(()=>document.querySelector('.submission-local-results').hidden);
      assert(await frame.locator('#rules').isHidden());assert.equal(await frame.locator('#rules li').count(),0);
      assert(await frame.locator('#gradingProgress').isHidden());assert((await frame.locator('#state').innerText()).includes('提出は完了'));
      assert.equal(await frame.locator('#intake').isVisible(),false);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:join(evidence,item.name+'-after.png')});
      report.cases.push({name:item.name,rows:actualRows,before:unavailable?'pending table (grading unavailable in this WebKit runtime)':'table',after:'receipt only'});
    }catch(error){console.error(JSON.stringify(await page.evaluate(()=>({localErrors:window.syntheticErrors,text:document.getElementById('actionBody').innerText}))));for(const frame of page.frames().slice(1))console.error(JSON.stringify(await frame.evaluate(()=>({boot:window.__HTML_ASSIGNMENT_BOOT__,calls:window.syntheticCalls,text:document.body.innerText})).catch(e=>({error:e.message}))));await page.screenshot({path:join(evidence,item.name+'-failed.png')});throw error;}finally{await context.close();}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
}finally{await browser.close();await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
