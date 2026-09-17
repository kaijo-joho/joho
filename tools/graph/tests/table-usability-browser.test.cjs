/* Toolbar grouping, icon affordances, and inline table-editor workflows. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(error?'not found':data);});});
let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:900,height:760}}),base=process.env.GRAPH_TEST_URL||`http://127.0.0.1:${server.address().port}/tools/graph/index.html`;await page.goto(base);await page.addStyleTag({url:new URL('table-editor.css',base).href});await page.waitForFunction(()=>window.GraphTableEditor&&window.GraphTables&&window.GraphIcons);
  await page.evaluate(()=>{const series=GraphCore.createSeries('data2d');series.rows=[[1,2],[3,4]];const host=document.createElement('div');document.body.append(host);window.__usabilityTable=GraphTableEditor.mount(host,series);});
  const editor=page.locator('.graph-table-editor');
  assert.deepEqual(await editor.locator('.graph-table-editor__tool-group>h3').allTextContents(),['行','列','計算']);
  assert.equal(await editor.locator('.graph-table-editor__tools').evaluate(el=>getComputedStyle(el).display),'grid');
  for(const name of ['行を追加','列を追加','計算列を追加']){const control=editor.getByRole('button',{name,exact:true});assert.equal(await control.locator('svg[aria-hidden="true"]').count(),1,`${name} has a meaningful icon`);}
  assert.equal(await editor.locator('.graph-table-editor__mapping-details').getAttribute('open'),null,'axis mapping starts compact');
  await editor.locator('.graph-table-editor__mapping-details > summary').click();assert.notEqual(await editor.locator('.graph-table-editor__mapping-details').getAttribute('open'),null,'axis mapping opens on demand');
  await editor.getByLabel('横軸の列',{exact:true}).selectOption('1');
  await editor.getByRole('button',{name:'計算列を追加',exact:true}).click();await editor.getByLabel('計算列の名前',{exact:true}).fill('下書き');await editor.getByLabel('計算式',{exact:true}).fill('[@x] * 2');
  assert.equal(await editor.locator('.graph-table-editor__calculation-panel').count(),1,'calculation editor stays inline');
  await editor.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await editor.locator('.graph-table-editor__calculation-panel').count(),0);
  assert.equal(await editor.getByRole('button',{name:'最後の列を削除',exact:true}).isVisible(),true,'existing destructive action remains directly reachable');
  await browser.close();browser=null;await new Promise(resolve=>server.close(resolve));console.log('table-usability-browser.test.cjs: ok');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(()=>resolve()));});
