import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const shared=process.env.HTML_ICONS_SHARED_ROOT || join(root,'tools/shared');
const engine=process.env.HTML_ICONS_ENGINE || 'chromium';
const evidence=process.env.HTML_ICONS_EVIDENCE || '/private/tmp/html-standard-icons-20261113/'+engine;
await mkdir(evidence,{recursive:true});
const assets=new Map(await Promise.all(['ui-icons.js','ui-icons.svg'].map(async name=>[name,await readFile(join(shared,name))])));
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error();
    const override=path.startsWith('/tools/shared/') && assets.get(path.slice('/tools/shared/'.length));
    res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream'}).end(override || await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin='http://127.0.0.1:'+server.address().port;
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=engine==='webkit'?await webkit.launch():await chromium.launch(existsSync(chrome)?{executablePath:chrome}:{});
const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
const report={engine,checks:[],states:[],errors:[],blockedRequests:[],gasRequests:[],sharedSha256:Object.fromEntries([...assets].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')]))};
let blockHelper=false;
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(blockHelper && url.pathname==='/tools/shared/ui-icons.js')return route.abort();
  if(url.origin===origin || ['data:','blob:','about:'].includes(url.protocol))return route.continue();
  report.blockedRequests.push(url.origin);
  if(/script\.google(?:usercontent)?\.com$/.test(url.hostname))report.gasRequests.push(url.origin);
  return route.abort();
});
context.on('page',page=>page.on('pageerror',error=>report.errors.push(error.message)));
if(engine==='chromium')await context.addInitScript(()=>{
  window.showDirectoryPicker=async()=>{
    const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('HTML実習',{create:true});
  };
});
const page=await context.newPage();
const idle=p=>p.waitForFunction(()=>!document.getElementById('app').hasAttribute('aria-busy'));
const themePaint=()=>page.waitForFunction(()=>{
  const hex=getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  if(!/^#[0-9a-f]{6}$/i.test(hex))return false;
  const expected='rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
  return getComputedStyle(document.querySelector('#displayMenuWrap > summary svg')).stroke===expected;
});
const code=p=>p.evaluate(()=>{const cm=document.querySelector('.CodeMirror').CodeMirror;return{source:cm.getValue(),history:cm.historySize(),dirty:!document.getElementById('dirtyMark').hidden};});
const source='<!doctype html>\n<html lang="ja">\n<head><meta charset="utf-8"><title>アイコンの確認</title></head>\n<body><h1>保存の確認</h1><p>実習用の合成データです。</p></body>\n</html>';
const expected={taskDownloadBtn:'export',openFilesBtn:'open',settingsFolderBtn:'open',folderSaveBtn:'save',downloadBtn:'export',openOtherFileBtn:'open',saveBtn:'save',runBtn:'refresh',helpBtn:'help'};
try{
  await page.goto(origin+'/tools/htmleditor/index.html?lesson=html12');
  await page.locator('#app:not([hidden])').waitFor();await idle(page);
  assert.equal(await page.locator('#saveBtn').isDisabled(),true);
  assert.equal(await page.locator('#runBtn').isDisabled(),true);
  for(const [id,icon] of Object.entries(expected)){
    const svg=page.locator('#'+id+' svg');
    assert.equal(await svg.getAttribute('data-joho-icon'),icon);
    assert.equal(await svg.getAttribute('aria-hidden'),'true');
    assert.equal(await svg.getAttribute('viewBox'),'0 0 24 24');
  }
  for(const [id,icon] of [['viewMenu','view'],['displayMenuWrap','settings']])assert.equal(await page.locator('#'+id+' > summary svg').getAttribute('data-joho-icon'),icon);
  await page.waitForFunction(()=>document.querySelector('#displayMenuWrap > summary svg').getBBox().width>0);
  assert.equal(await page.locator('#submitBtn svg use').count(),0);
  assert.equal(await page.locator('#reconnectFolderBtn svg use').count(),0);
  assert.equal(await page.locator('#restoreBtn svg use').count(),0);
  assert.equal(await page.locator('#editorModeControl').count(),0);
  report.checks.push('Standard IDs render through the shared sprite; disabled state and specialist submit/reconnect/recovery icons remain; no final-project feature');

  const chooser=page.waitForEvent('filechooser');await page.locator('#openFilesBtn').click();
  await(await chooser).setFiles({name:'html12-01.html',mimeType:'text/html',buffer:Buffer.from(source)});await idle(page);
  await page.waitForFunction(value=>document.querySelector('.CodeMirror').CodeMirror.getValue()===value,source);
  assert.equal(await page.locator('#currentFileLabel').textContent(),'html12-01.html');
  report.checks.push('Open still launches the OS file chooser and loads the selected source');

  const beforeThemes=await code(page);
  await page.locator('#displayMenuWrap > summary').click();
  for(const [theme,label] of [['light','light'],['dark','dark'],['system','auto-dark']]){
    if(theme==='system')await page.emulateMedia({colorScheme:'dark'});
    const button=page.locator('#editorDisplaySettings button[data-value="'+theme+'"]');
    await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');
    await themePaint();
    const icon=await button.locator('svg').getAttribute('data-joho-icon');assert.equal(icon,'theme-'+(theme==='system'?'auto':theme));
    const state=await page.evaluate(()=>{
      const svg=document.querySelector('#displayMenuWrap > summary svg'),style=getComputedStyle(svg),box=svg.getBoundingClientRect();
      return{theme:document.documentElement.dataset.resolvedTheme,width:box.width,height:box.height,stroke:style.strokeWidth,fill:style.fill,color:style.stroke};
    });
    assert.equal(state.width,22);assert.equal(state.height,22);assert.equal(state.stroke,'1.7px');assert.equal(state.fill,'none');
    assert.equal(state.theme,theme==='system'?'dark':theme);
    report.states.push({label,...state});
    await page.screenshot({path:join(evidence,label+'-1440.png')});
  }
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.resolvedTheme==='light');
  await themePaint();
  assert.deepEqual(await code(page),beforeThemes);
  report.checks.push('Light/dark/automatic themes, selected theme states and 22px/currentColor/1.7px line styling preserve source and Undo');

  await page.locator('#displayMenuWrap > summary').click();
  await page.locator('#helpBtn').click();await page.locator('#helpWindow:not([hidden])').waitFor();
  assert.equal(await page.locator('#helpWindow [data-help-close]').getAttribute('aria-label'),'詳しい操作方法を閉じる');
  await page.locator('#helpWindow [data-help-close]').click();assert.equal(await page.locator('#helpWindow').isHidden(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'helpBtn');
  await page.locator('#practiceStepsBtn').click();await page.locator('#actionDialog[open]').waitFor();
  assert.equal(await page.locator('#actionButtons [data-choice="close"] svg').getAttribute('data-joho-icon'),'close');
  await page.locator('#actionButtons [data-choice="close"]').click();await idle(page);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'practiceStepsBtn');
  await page.locator('#runBtn').hover();
  await page.waitForFunction(()=>[...document.querySelectorAll('.joho-tip')].some(node=>Number(getComputedStyle(node).opacity)>.9 && node.textContent.includes('Macのファイルには保存しません')));
  report.checks.push('Help and modal closing keep labels, click handlers and focus return; dynamic close uses the shared icon');

  if(engine==='chromium'){
    await page.evaluate(async value=>{
      const directory=await window.showDirectoryPicker(),handle=await directory.getFileHandle('html12-01.html',{create:true}),writer=await handle.createWritable();
      await writer.write(value);await writer.close();
    },source);
    await page.locator('#connectFolderBtn').click();
    await page.getByRole('button',{name:'html12-01.html',exact:true}).click();await idle(page);
    await page.evaluate(()=>{const cm=document.querySelector('.CodeMirror').CodeMirror;cm.replaceRange('<!--保存テスト-->',cm.posFromIndex(cm.getValue().length));});
    await page.locator('#saveBtn').click();await idle(page);
    assert.match(await page.locator('#toast').textContent(),/Macのファイルに保存しました/);
    const saved=await page.evaluate(async()=>{const directory=await window.showDirectoryPicker();return(await(await directory.getFileHandle('html12-01.html')).getFile()).text();});
    assert.equal(saved,(await code(page)).source);
    await page.evaluate(()=>{const cm=document.querySelector('.CodeMirror').CodeMirror;cm.replaceRange('<!--プレビューのみ-->',cm.posFromIndex(cm.getValue().length));});
    const pending=await code(page);await page.locator('#runBtn').click();await idle(page);
    const unchanged=await page.evaluate(async()=>{const directory=await window.showDirectoryPicker();return(await(await directory.getFileHandle('html12-01.html')).getFile()).text();});
    assert.equal(unchanged,saved);assert.deepEqual(await code(page),pending);
    await page.locator('.CodeMirror textarea').press('Meta+s');await idle(page);
    const shortcutSaved=await page.evaluate(async()=>{const directory=await window.showDirectoryPicker();return(await(await directory.getFileHandle('html12-01.html')).getFile()).text();});
    assert.equal(shortcutSaved,pending.source);
    report.checks.push('Native OPFS fixture: Save and Command-S overwrite the file; Refresh keeps disk content and editing history');
  }
  const downloadSource=(await code(page)).source;
  await page.locator('#displayMenuWrap > summary').click();
  await page.locator('#displayMenuWrap details').filter({has:page.locator('#downloadBtn')}).locator('summary').click();
  const downloaded=page.waitForEvent('download');await page.locator('#downloadBtn').click();
  const file=await downloaded;assert.equal(await readFile(await file.path(),'utf8'),downloadSource);await idle(page);
  report.checks.push('Export icon still downloads an exact copy of the current source');

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>siteDisplaySettings.setPreferences({textScale:150}));
  if(!await page.locator('#displayMenuWrap').evaluate(node=>node.open))await page.locator('#displayMenuWrap > summary').click();
  for(const theme of ['light','dark','system']){
    await page.locator('#editorDisplaySettings button[data-value="'+theme+'"]').click();
    await themePaint();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:join(evidence,theme+'-390.png')});
  }
  await page.locator('#displayMenuWrap > summary').click();
  await page.keyboard.press('Tab');await page.locator('#helpBtn').focus();
  assert.equal(await page.locator('#helpBtn').evaluate(node=>node.matches(':focus-visible')),true);
  assert.notEqual(await page.locator('#helpBtn').evaluate(node=>getComputedStyle(node).outlineStyle),'none');
  await page.screenshot({path:join(evidence,'focus-390.png')});
  report.checks.push('390px at 150% text has no page overflow; keyboard focus stays visible');

  blockHelper=true;const fallback=await context.newPage();
  await fallback.goto(origin+'/tools/htmleditor/index.html?lesson=html12');await fallback.locator('#app:not([hidden])').waitFor();await idle(fallback);
  await fallback.locator('#displayMenuWrap > summary').click();
  await fallback.locator('#editorDisplaySettings button[data-value="dark"]').click();
  assert.equal(await fallback.locator('#editorDisplaySettings button[data-value="dark"]').getAttribute('aria-pressed'),'true');
  report.checks.push('Unavailable optional icon helper preserves editor startup and theme controls');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.gasRequests,[]);
}catch(error){report.failure=error.message;await page.screenshot({path:join(evidence,'failure.png')});throw error;}
finally{
  await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));
  await context.close();await browser.close();await new Promise(done=>server.close(done));
}
console.log(JSON.stringify(report));
