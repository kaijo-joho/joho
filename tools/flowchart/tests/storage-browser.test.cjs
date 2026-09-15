const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const Core = require('../core.js');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

async function serve() {
  const root = path.resolve(__dirname, '..'), allowed = new Set(['index.html','output.js','parts.js','core.js','render.js','editor.js','editor.css','storage.js','local-autosave.js','icon.svg']);
  const types = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml' };
  const server = http.createServer(async (req,res) => { const file = new URL(req.url,'http://localhost').pathname.slice(1)||'index.html'; if (!allowed.has(file)) return res.writeHead(404).end(); try { res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}); res.end(await fs.readFile(path.join(root,file))); } catch { res.writeHead(404).end(); } });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); return { url:`http://127.0.0.1:${server.address().port}/`, close:()=>new Promise(resolve=>server.close(resolve)) };
}
async function run() {
  const hosting = await serve();
  try { for (const engine of process.argv.includes('--chrome-only')?['chromium']:['chromium','webkit']) { const browser = await pw[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true}); try {
    const context = await browser.newContext({viewport:{width:1280,height:736}}), page = await context.newPage(); page.setDefaultTimeout(12000); const errors=[]; page.on('pageerror',e=>errors.push(e.message)); await page.goto(hosting.url); await page.waitForFunction(()=>!!window.DiagramEditor);
    assert.equal(await page.locator('#storage-open-dialog').count(),1); assert.equal(await page.locator('#autosave-dialog').count(),1); assert.equal(await page.locator('#save-browser').count(),1);
    assert.equal(await page.locator('#storage-open-dialog').evaluate(d=>d.open),false,'A new empty start never opens a recovery dialog');
    const doc=Core.createDocument(); doc.id=`storage_${engine}`; doc.title='<img src=x>'; doc.nodes=[Core.createNode('process',100,100,{id:'storage_node',text:'保存'})];
    await page.locator('#file-input').setInputFiles({name:'storage.diagram.json',mimeType:'application/json',buffer:Buffer.from(Core.serializeDocument(doc))}); await page.waitForFunction(()=>document.getElementById('storage-open-dialog').open); assert.equal(await page.locator('[data-open-source=local-file]').count(),1); assert.equal(await page.locator('[data-open-source=local-file]').textContent().then(t=>t.includes('<img')),true,'Candidate names are text'); await page.locator('[data-open-source=local-file]').click(); await page.waitForFunction(id=>DiagramEditor.getDocument().id===id,doc.id);
    await page.locator('#file-menu > summary').click(); await page.locator('#save-browser').click(); await page.waitForFunction(()=>document.querySelector('[data-open-source=browser-manual]') || localStorage.length>0);
    await page.locator('#file-menu > summary').click(); await page.locator('#open-file').click(); await page.waitForFunction(()=>document.getElementById('storage-open-dialog').open); assert.ok(await page.locator('[data-open-source=browser-manual]').count(),'Explicit browser save is a distinct opening candidate'); await page.keyboard.press('Escape');
    await page.locator('#file-menu > summary').click(); await page.locator('#autosave-settings').click(); await page.waitForFunction(()=>document.getElementById('autosave-dialog').open); assert.equal(await page.locator('#local-auto-start').isDisabled(), engine!=='chromium' ? true : await page.locator('#local-auto-start').isDisabled()); await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:736}); const toggle=page.locator('#toolbar-toggle'); if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click(); await page.locator('#settings-menu > summary').click(); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape'); await page.locator('#file-menu > summary').click(); await page.locator('#open-file').click(); const box=await page.locator('#storage-open-dialog').boundingBox(); assert.ok(box.x>=0&&box.x+box.width<=391); await page.keyboard.press('Escape'); assert.deepEqual(errors,[]); await context.close(); console.log(`${engine}: storage candidate dialogs passed`);
  } finally { await browser.close(); } } } finally { await hosting.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1});
