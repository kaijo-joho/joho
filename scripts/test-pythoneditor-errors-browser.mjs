import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createEditorServer} from './serve-pythoneditor.mjs';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const evidence=process.env.PYTHONEDITOR_ERROR_EVIDENCE||'/private/tmp/pythoneditor-error-tests';
await mkdir(evidence,{recursive:true});
const report={at:new Date().toISOString(),engine:process.env.PYTHONEDITOR_ENGINE||'Chrome',environment:'local automated browser, not school devices',checks:[],cases:[]};
const check=name=>{report.checks.push(name);console.log('PASS',name);};
const server=await createEditorServer({isolate:false});
const browser=process.env.PYTHONEDITOR_ENGINE==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
async function edit(code){await page.evaluate(code=>document.querySelector('.CodeMirror').CodeMirror.setValue(code),code);}
async function run(){await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#run').dataset.state==='run',null,{timeout:125000});}
async function apiRun(request){return page.evaluate(async request=>{
  const {PythonRunner}=await import('/tools/pythoneditor/runner.mjs');
  return new Promise(resolve=>{
    let stderr='';
    const onEvent=event=>{if(event.type==='text'&&event.stream==='stderr')stderr+=event.text;if(event.type==='input')globalThis.errorTestRunner.input('',true);if(['done','error','stopped'].includes(event.type))resolve({...event,stderr});};
    globalThis.errorTestRunner||=new PythonRunner(onEvent);
    globalThis.errorTestRunner.onEvent=onEvent;globalThis.errorTestRunner.run(request);
  });
},request);}
try{
  await page.goto(server.url);await page.waitForSelector('#question-list button');
  assert.equal(await page.locator('#find-errors').isVisible(),false);
  await edit('name = input("名前: ")\nn = int(input("整数: "))\nprint(name,n)');
  await page.locator('#run').click();await page.waitForSelector('#interactive-input:not([hidden])');
  await page.locator('#input-line').fill('海城');await page.locator('#input-line').press('Enter');
  await page.waitForSelector('#interactive-input:not([hidden])');await page.locator('#input-line').fill('aaa');await page.locator('#input-line').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#run').dataset.state==='run');
  const error=await page.locator('#error').textContent();
  report.initial={error,stderr:await page.locator('#stderr').textContent()};
  assert.match(error,/^Traceback \(most recent call last\):/);assert.match(error,/File "<コード>", line 2/);
  assert.match(error,/n = int\(input\("整数: "\)\)/);assert.match(error,/ValueError: invalid literal for int\(\) with base 10: 'aaa'/);
  assert.equal(report.initial.stderr,'');
  assert.doesNotMatch(error,/_pyodide|<exec>|<エディタ|PythonError/);assert.equal(await page.locator('#advice').count(),0);
  assert.equal(await page.locator('#error-hint-dialog').isVisible(),false);assert.equal(await page.locator('.error-hint-marker').count(),0);
  check('interactive int input uses standard Python traceback, source and exact line; no permanent hint');
  await page.screenshot({path:evidence+'/plain-error.png',fullPage:true});
  await page.locator('#find-errors').click();assert.equal(await page.locator('.error-hint-marker').count(),1);
  const marker=page.getByRole('button',{name:'2行目のエラーのヒントを表示'});
  assert.equal(await marker.evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('#error-hint-dialog').isVisible(),false);
  await page.screenshot({path:evidence+'/error-location.png',fullPage:true});
  await marker.press('Enter');assert.equal(await page.locator('#error-hint-dialog').isVisible(),true);
  assert.match(await page.locator('#error-hint-summary').textContent(),/整数として読み取れ/);
  assert.match(await page.locator('#error-hint-steps').textContent(),/文字列.*正常/);
  assert.match(await page.locator('#error-hint-example').textContent(),/print\(repr\(value\), type\(value\)\)/);
  await page.screenshot({path:evidence+'/value-hint.png',fullPage:true});
  await page.keyboard.press('Escape');assert.equal(await marker.evaluate(el=>el===document.activeElement),true);
  check('find marks only the failed line; warning opens value/type hint; keyboard and Escape restore focus');
  await edit('print("修正後")');assert.equal(await page.locator('.error-hint-marker').count(),0);assert.equal(await page.locator('#find-errors').isVisible(),false);
  assert.match(await page.locator('#output-status').textContent(),/変更前/);await run();assert.equal(await page.locator('#error').isVisible(),false);
  check('editing invalidates warnings and old result; rerun removes old errors');
  const cases=[
    {id:'nested',code:'def convert(text):\n    return int(text)\ndef main():\n    return convert("abc")\nmain()',name:'ValueError',line:2,include:[/in main/,/in convert/,/return int\(text\)/]},
    {id:'syntax',code:'n = 1\nif n > 0\n    print(n)',name:'SyntaxError',line:2,include:[/\^/,/expected/],exclude:[/^Traceback/]},
    {id:'indent',code:'if True:\nprint(1)',name:'IndentationError',line:2,include:[/expected an indented block/]},
    {id:'name',code:'print(missing_name)',name:'NameError',line:1},
    {id:'type',code:'value = "12"\nprint(value + 1)',name:'TypeError',line:2},
    {id:'zero',code:'n = 0\nprint(10 / n)',name:'ZeroDivisionError',line:2},
    {id:'index',code:'values = [1]\nprint(values[3])',name:'IndexError',line:2},
    {id:'key',code:'print({}["missing"])',name:'KeyError',line:1},
    {id:'module',code:'import school_module_that_does_not_exist',name:'ModuleNotFoundError',line:1},
    {id:'eof',code:'name = input("名前: ")',name:'EOFError',line:1},
    {id:'library',code:'import json\njson.loads("{")',name:'JSONDecodeError',line:2,include:[/json.*decoder/,/JSONDecodeError/]},
    {id:'cause',code:'try:\n    int("abc")\nexcept ValueError as e:\n    raise RuntimeError("外側") from e',name:'RuntimeError',line:4,include:[/ValueError: invalid literal/,/direct cause/,/RuntimeError: 外側/]},
    {id:'context',code:'try:\n    1 / 0\nexcept ZeroDivisionError:\n    raise ValueError("次のエラー")',name:'ValueError',line:4,include:[/ZeroDivisionError/,/During handling/,/ValueError: 次のエラー/]},
    {id:'suppressed',code:'try:\n    1 / 0\nexcept ZeroDivisionError:\n    raise ValueError("次のエラー") from None',name:'ValueError',line:4,exclude:[/ZeroDivisionError/]},
    {id:'notes',code:'error = ValueError("値")\nerror.add_note("追加の説明")\nraise error',name:'ValueError',line:3,include:[/追加の説明/]},
    {id:'group',code:'errors = []\nfor text in ["a", "b"]:\n    try:\n        int(text)\n    except ValueError as e:\n        errors.append(e)\nraise ExceptionGroup("まとめ", errors)',name:'ExceptionGroup',line:7,include:[/2 sub-exceptions/,/ValueError/]},
    {id:'setup',setupCode:'x = 1\nint("abc")',code:'print(x)',name:'ValueError',line:2,source:'setup',include:[/File "<準備コード>"/],exclude:[/File "<コード>"/]},
    {id:'dynamic-exec',code:'exec("1 / 0")',name:'ZeroDivisionError',line:1,include:[/File "<string>"/]},
    {id:'stderr',code:'import sys\nprint(\"生徒の診断\", file=sys.stderr)\nint(\"aaa\")',name:'ValueError',line:3},
    {id:'adapted',setupCode:'!pip install japanize-matplotlib',code:'value = "aaa"\nint(value)',name:'ValueError',line:2}
  ];
  for(const c of cases){
    const result=await apiRun({code:c.code,setupCode:c.setupCode||'',stdin:[]});
    assert.equal(result.type,'error',c.id);assert.equal(result.diagnostics?.name,c.name,c.id);
    const location=result.diagnostics.locations[0];assert.equal(location.line,c.line,c.id);assert.equal(location.source,c.source||'code',c.id);
    assert.doesNotMatch(result.error,/_pyodide\/_base\.py|<エディタ実行>|<エディタ内部>|<exec>/,c.id);
    assert.doesNotMatch(result.stderr,/_pyodide\/_base\.py|<エディタ実行>/,c.id);
    if(c.id==='stderr')assert.equal(result.stderr,'生徒の診断\n');
    for(const re of c.include||[])assert.match(result.error,re,c.id);
    for(const re of c.exclude||[])assert.doesNotMatch(result.error,re,c.id);
    report.cases.push({id:c.id,name:c.name,line:location.line,source:location.source,error:result.error});
  }
  check('20 real Pyodide error cases preserve Python syntax, calls, libraries, chains, notes, groups and setup line numbers');
  // A general ValueError must not receive the int conversion hint.
  const {errorHints}=await import('../tools/pythoneditor/diagnostics.mjs');
  assert.equal(errorHints({name:'ValueError',message:'math domain error'}).example,'');
  assert.match(errorHints({name:'TypeError'}).example,/type\(value\)/);check('value hints are specific to int conversion; TypeError prompts inspection');
  await edit('if True\n    print(1)');await run();await page.locator('#find-errors').click();
  assert.equal(await page.getByRole('button',{name:'1行目のエラーのヒントを表示'}).count(),1);
  await page.locator('#next').click();assert.equal(await page.locator('.error-hint-marker').count(),0);
  await page.locator('#previous').click();assert.equal(await page.locator('.error-hint-marker').count(),0);
  check('syntax line marker is correct and is cleared on question switches');
  await edit('value = "aaa"\nint(value)');await run();await page.locator('#find-errors').click();
  const layouts=[];
  for(const width of [1440,720,390])for(const theme of ['auto','light','dark'])for(const size of ['standard','large','largest']){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(({theme,size})=>{const t=document.querySelector('#theme'),s=document.querySelector('#text-size');t.value=theme;t.dispatchEvent(new Event('change',{bubbles:true}));s.value=size;s.dispatchEvent(new Event('change',{bubbles:true}));},{theme,size});
    await page.locator('.error-hint-marker').click();
    const layout=await page.evaluate(()=>{
      const d=document.querySelector('#error-hint-dialog').getBoundingClientRect(),g=document.querySelector('.CodeMirror-gutters').getBoundingClientRect(),r=document.querySelector('#run').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,dialogFits:d.left>=0&&d.right<=innerWidth+1,alignment:Math.abs(r.x+r.width/2-g.x-g.width/2)};
    });
    assert.equal(layout.overflow,false,JSON.stringify({width,theme,size,layout}));assert.equal(layout.dialogFits,true);assert.ok(layout.alignment<2,JSON.stringify(layout));
    layouts.push({width,theme,size,...layout});await page.keyboard.press('Escape');
  }
  report.layouts=layouts;check('warning and hint fit 27 viewport/theme/font combinations and retain run-gutter alignment');
  await page.setViewportSize({width:1440,height:1000});
  await edit('while True:\n    pass');await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#run-status').textContent==='実行中');await page.locator('#run').click();
  assert.equal(await page.locator('#find-errors').isVisible(),false);await edit('print(12)');await run();assert.equal(await page.locator('#output').textContent(),'12\n');
  check('stop and rerun remain available after diagnostic use');
  const setup=await context.newPage();
  await setup.route('**/__pythoneditor/catalog',route=>route.fulfill({json:{schema:'python-editor-catalog-v1',label:'検証用',sets:[{setId:'setup-test',title:'検証用',questions:[{questionId:'setup-error',version:'test-v1',title:'準備エラー',prompt:'検証用',templateCode:'print(n)',setupCode:'n = 1\nint("aaa")'}]}]}}));
  await setup.goto(server.url);await setup.waitForSelector('#question-list button');await setup.locator('#run').click();await setup.waitForFunction(()=>document.querySelector('#run').dataset.state==='run',null,{timeout:125000});
  await setup.locator('#find-errors').click();assert.equal(await setup.locator('#setup').evaluate(el=>el.open),true);
  assert.equal(await setup.locator('.error-hint-marker').count(),0);await setup.locator('#error-line-hint').click();
  assert.match(await setup.locator('#error-hint-title').textContent(),/準備コード 2行目/);await setup.keyboard.press('Escape');await setup.close();
  check('setup exceptions open preparation code and do not mark an unrelated student line');
  const fallback=await context.newPage();await fallback.route('**/htmleditor/vendor/*.js',r=>r.abort());
  await fallback.goto(server.url);await fallback.waitForSelector('#question-list button');
  await fallback.locator('#code').fill('int("aaa")');await fallback.locator('#run').click();await fallback.waitForFunction(()=>document.querySelector('#run').dataset.state==='run',null,{timeout:125000});
  await fallback.locator('#find-errors').click();assert.equal(await fallback.locator('#error-line-hint').isVisible(),true);
  await fallback.locator('#error-line-hint').click();assert.equal(await fallback.locator('#error-hint-dialog').isVisible(),true);await fallback.keyboard.press('Escape');await fallback.close();
  check('textarea fallback can locate a line and open its hint without CodeMirror');
  const offline=await context.newPage();await offline.route('https://cdn.jsdelivr.net/pyodide/**',r=>r.abort());
  await offline.goto(server.url);await offline.waitForSelector('#question-list button');await offline.locator('#run').click();await offline.waitForFunction(()=>document.querySelector('#run').dataset.state==='run',null,{timeout:125000});
  assert.equal(await offline.locator('#error').isVisible(),true);assert.equal(await offline.locator('#find-errors').isVisible(),false);await offline.close();
  check('environment download errors do not invent a student error line');
  assert.deepEqual(pageErrors,[]);check('no page errors');
  report.result='passed';
}catch(error){report.result='failed';report.failure=error.stack;await page.screenshot({path:evidence+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await writeFile(evidence+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.server.close(resolve));}
