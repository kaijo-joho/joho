import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const evidence='/private/tmp/html-folder-recovery-20261116';await mkdir(evidence,{recursive:true});
const original=await readFile(join(root,'tools/htmleditor/filesystem.js'),'utf8');
const accelerated=original+'\nwindow.HtmlFileSystem=class extends window.HtmlFileSystem { constructor(options={}) { super({directoryTimeoutMs:300,...options}); } };\n';
let acceleratedMode=false;
const types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/__seed'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>合成検証</title>');return;}
    const path=resolve(root,'.'+pathname);if(!path.startsWith(root+sep))throw Error();
    let bytes=await readFile(path);
    if(acceleratedMode && pathname==='/tools/htmleditor/filesystem.js')bytes=Buffer.from(accelerated);
    if(acceleratedMode && pathname==='/tools/htmleditor/index.html'){
      const hash=createHash('sha384').update(accelerated).digest('base64');
      bytes=Buffer.from(bytes.toString().replace(/(<script src="filesystem\.js[^>]*integrity=")sha384-[^"]+/,'$1sha384-'+hash));
    }
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report={checks:[],cases:[],errors:[],blockedRequests:[],gasRequests:[]};
const code=page=>page.evaluate(()=>{const cm=document.querySelector('.CodeMirror').CodeMirror;return{source:cm.getValue(),history:cm.historySize(),file:document.getElementById('currentFileLabel').textContent,dirty:!document.getElementById('dirtyMark').hidden};});
const idle=page=>page.waitForFunction(()=>!document.getElementById('app').hasAttribute('aria-busy'),{},{timeout:19000});
const source='<!doctype html>\n<html lang="ja">\n<head><meta charset="utf-8"><title>接続復旧の確認</title></head>\n<body><h1>合成データ</h1><p>内容を保持します。</p></body>\n</html>';
async function readMemory(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('joho.htmleditor.folder-memory.v1',1);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('handles','readonly'),get=tx.objectStore('handles').get('directory');let name=null;get.onsuccess=()=>name=get.result?.name||null;tx.oncomplete=()=>{db.close();resolve(name);};tx.onabort=()=>{db.close();reject(tx.error);};};
  request.onerror=()=>reject(request.error);
}));}
async function menu(page){if(!await page.locator('#displayMenuWrap').evaluate(node=>node.open))await page.locator('#displayMenuWrap > summary').click();}
try{
  for(const phase of ['query','entries','file','request','prompt']){
    acceleratedMode=phase!=='query';
    const context=await browser.newContext({viewport:{width:1360,height:900}});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin||['data:','blob:','about:'].includes(url.protocol))return route.continue();
      report.blockedRequests.push(url.origin);if(/script\.google(?:usercontent)?\.com$/.test(url.hostname))report.gasRequests.push(url.origin);return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    try{
      await page.goto(origin+'/__seed');
      await page.addScriptTag({url:origin+'/tools/htmleditor/recovery.js'});
      await page.evaluate(async source=>{
        const root=await navigator.storage.getDirectory();
        for(const name of ['以前のHTML実習','新しいHTML実習','別のHTML実習']){
          const folder=await root.getDirectoryHandle(name,{create:true}),handle=await folder.getFileHandle(name==='以前のHTML実習'?'held.css':'good.html',{create:true}),writer=await handle.createWritable();
          await writer.write(name==='以前のHTML実習'?'body { color: navy; }':source);await writer.close();
        }
        const previous=await root.getDirectoryHandle('以前のHTML実習');
        await new Promise((resolve,reject)=>{const request=indexedDB.open('joho.htmleditor.folder-memory.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');request.onsuccess=()=>{const db=request.result,tx=db.transaction('handles','readwrite');tx.objectStore('handles').put(previous,'directory');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
        localStorage.setItem('joho.htmleditor.test-sentinel','保持するデータ');
        HtmlEditorRecovery.create(localStorage).save({docId:'synthetic-backup',fileName:'backup.html',lessonId:'html12',mode:'lesson',kind:'auto',destination:'browser',content:'保持する控え'});
      },source);
      await page.addInitScript(phase=>{
        const query=FileSystemDirectoryHandle.prototype.queryPermission,request=FileSystemDirectoryHandle.prototype.requestPermission,entries=FileSystemDirectoryHandle.prototype.entries,getFile=FileSystemFileHandle.prototype.getFile;
        window.__permissionRequests=0;window.__pickerName='新しいHTML実習';
        FileSystemDirectoryHandle.prototype.queryPermission=function(options){
          if(this.name==='以前のHTML実習'&&phase==='query')return new Promise(resolve=>window.__releaseStale=()=>resolve('granted'));
          if(this.name==='以前のHTML実習'&&['request','prompt'].includes(phase))return Promise.resolve('prompt');
          return query.call(this,options);
        };
        FileSystemDirectoryHandle.prototype.requestPermission=function(options){
          if(this.name==='以前のHTML実習'){
            window.__permissionRequests++;
            if(phase==='request')return new Promise(resolve=>window.__releaseStale=()=>resolve('granted'));
            if(phase==='prompt')return Promise.resolve('granted');
          }
          return request.call(this,options);
        };
        FileSystemDirectoryHandle.prototype.entries=function(){
          if(this.name==='以前のHTML実習'&&phase==='entries')return{[Symbol.asyncIterator](){return this;},next:()=>new Promise(resolve=>window.__releaseStale=()=>resolve({done:true}))};
          return entries.call(this);
        };
        FileSystemFileHandle.prototype.getFile=function(){
          if(this.name==='held.css'&&phase==='file')return new Promise(resolve=>window.__releaseStale=async()=>resolve(await getFile.call(this)));
          return getFile.call(this);
        };
        window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle(window.__pickerName);};
      },phase);
      const started=Date.now();
      await page.goto(origin+'/tools/htmleditor/index.html?lesson=html12');await page.locator('#app:not([hidden])').waitFor();
      if(['request','prompt'].includes(phase)){
        await idle(page);assert.equal(await page.evaluate(()=>window.__permissionRequests),0);
        assert.equal(await page.locator('#settingsFolderBtn').isEnabled(),true);
        await page.locator('#connectFolderBtn').click();
      }
      if(phase==='prompt'){
        await page.locator('#actionDialog[open]').waitFor();
        await page.locator('#actionButtons [data-choice="cancel"]').click();await idle(page);
        assert.equal(await page.evaluate(()=>window.__permissionRequests),1);
        assert.match(await page.locator('#folderStatusText').textContent(),/以前のHTML実習/);
        report.cases.push({phase,result:'normal permission renewal remains explicit'});
        continue;
      }
      await page.waitForFunction(()=>document.getElementById('app').hasAttribute('aria-busy'));
      assert.equal(await page.locator('#settingsFolderBtn').isDisabled(),true);
      await idle(page);
      const elapsedMs=Date.now()-started;
      for(const id of ['settingsFolderBtn','disconnectBtn','connectFolderBtn'])assert.equal(await page.locator('#'+id).isEnabled(),true,id);
      assert.equal(await readMemory(page),'以前のHTML実習','時間切れだけで接続先の記憶を消さない');
      await menu(page);await page.locator('#settingsFolderBtn').click();
      await page.getByRole('button',{name:'good.html',exact:true}).click();await idle(page);
      await page.evaluate(()=>{const cm=document.querySelector('.CodeMirror').CodeMirror;cm.replaceRange('<!--編集中-->',cm.posFromIndex(cm.getValue().length));});
      const before=await code(page);
      await page.evaluate(()=>window.__releaseStale?.());await page.waitForTimeout(80);
      assert.match(await page.locator('#folderStatusText').textContent(),/新しいHTML実習/);
      assert.equal(await readMemory(page),'新しいHTML実習');assert.deepEqual(await code(page),before);
      await page.evaluate(()=>window.__pickerName='別のHTML実習');
      await menu(page);await page.locator('#settingsFolderBtn').click();await page.locator('#actionDialog[open]').waitFor();
      await page.locator('#actionButtons [data-choice="cancel"]').click();await idle(page);
      assert.match(await page.locator('#folderStatusText').textContent(),/別のHTML実習/);assert.deepEqual(await code(page),before);
      await page.screenshot({path:join(evidence,phase+'-recovered.png')});
      await menu(page);await page.locator('#disconnectBtn').click();await idle(page);
      assert.equal(await readMemory(page),null);assert.deepEqual(await code(page),before);
      assert.equal(await page.evaluate(()=>localStorage.getItem('joho.htmleditor.test-sentinel')),'保持するデータ');
      const kept=await page.evaluate(()=>HtmlEditorRecovery.create(localStorage).list().items.find(item=>item.docId==='synthetic-backup'));
      assert.equal(kept.content,'保持する控え');
      report.cases.push({phase,elapsedMs,result:'timeout releases controls, late completion ignored, change/disconnect work, source/Undo/backup retained'});
    }finally{await context.close();}
  }
  report.checks.push('Default 15s deadline in Chrome with native OPFS/IndexedDB; accelerated additional failure cases use the same constructor option');
  report.checks.push('No browser-wide cache/site-data clearing, no automatic permission request, no source or recovery-data deletion');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.gasRequests,[]);
}catch(error){report.failure=error.message;throw error;}
finally{await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(done=>server.close(done));}
console.log(JSON.stringify(report));
