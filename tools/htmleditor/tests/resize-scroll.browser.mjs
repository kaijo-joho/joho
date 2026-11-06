import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {chromium, webkit} = createRequire(import.meta.url)('playwright');
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const engine = process.env.HTML_LAYOUT_ENGINE || 'chromium';
const evidence = process.env.HTML_SCROLL_EVIDENCE || '/private/tmp/html-editor-resize-scroll-20261106/regression-' + engine;
await mkdir(evidence, {recursive:true});
const types = {'.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2'};
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) throw Error('outside fixture root');
    const bytes = await readFile(file);
    response.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream'});
    response.end(bytes);
  } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
});
await new Promise((done,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const url = `http://127.0.0.1:${server.address().port}/tools/htmleditor/index.html?lesson=html14`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch(existsSync(chrome) ? {executablePath:chrome} : {});
const context = await browser.newContext({viewport:{width:1440, height:950}});
const page = await context.newPage();
const report = {engine, checks:[], errors:[], requests:[]};
page.on('pageerror', error => report.errors.push(error.message));
await context.route('**/*', route => { const target=new URL(route.request().url()); return target.origin===new URL(url).origin || ['blob:','data:'].includes(target.protocol) ? route.continue() : route.abort(); });
const check = name => { report.checks.push(name); console.log('PASS', name); };
const source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>列配置の検証</title></head><body><h1>検証用</h1><p>表示操作で変更しない本文。</p></body></html>';
const readyLesson = () => page.waitForFunction(() => {
  const frame = document.getElementById('lessonIframe');
  return frame.contentDocument?.readyState === 'complete' && frame.contentWindow.siteDisplaySettings?.version === 1 &&
    frame.contentDocument.querySelector('.code-example-tools');
});
const upload = async () => {
  await page.locator('#fileInput').setInputFiles({name:'sample.html', mimeType:'text/html', buffer:Buffer.from(source)});
  await page.waitForFunction(() => document.body.classList.contains('has-document'));
};
const dragBar = async (id, delta) => {
  const box = await page.locator(id).boundingBox(); assert(box);
  const x = box.x + box.width / 2, y = box.y + Math.min(140, box.height / 2);
  await page.mouse.move(x,y); await page.mouse.down();
  await page.mouse.move(x + delta, y, {steps:12}); await page.mouse.up();
};
const content = () => page.evaluate(() => ({
  file:document.getElementById('currentFileLabel').textContent,
  source:document.querySelector('.CodeMirror').CodeMirror.getValue(),
  history:document.querySelector('.CodeMirror').CodeMirror.historySize(),
  preview:document.getElementById('previewIframe').contentDocument.body.innerHTML
}));
try {
  report.scrolls=[];
  for(const lesson of ['html17','html14','html13']) {
    await page.goto(url.replace('lesson=html14','lesson='+lesson));
    await page.waitForSelector('#app:not([hidden])');await readyLesson();await upload();
    await page.waitForFunction(()=>!document.getElementById('app').hasAttribute('aria-busy'));
    await page.waitForFunction(()=>document.getElementById('previewIframe').contentDocument?.body?.textContent.includes('変更しない本文'));
    await page.locator('#lessonIframe').evaluate(frame=>{frame.contentDocument.documentElement.style.scrollBehavior='auto';});
    const initial=await content();
    for(const [bar,delta] of [['#splitLeft',220],['#splitLeft',-160],['#splitRight',150],['#splitRight',-150],['#splitLeft',100],['#splitLeft',-100]]) {
      await page.locator('#lessonIframe').evaluate(frame=>frame.contentWindow.scrollTo(0,350));
      await page.waitForTimeout(80);await dragBar(bar,delta);await page.waitForTimeout(100);
      assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('pane-resizing')),false);
      const frame=page.locator('#lessonIframe'),before=await frame.evaluate(el=>el.contentWindow.scrollY),box=await frame.boundingBox();assert(box);
      await page.mouse.move(box.x+box.width/2,box.y+Math.min(420,box.height/2));await page.mouse.wheel(0,400);
      await page.waitForFunction(y=>document.getElementById('lessonIframe').contentWindow.scrollY>y+50,before,{timeout:3000});
      const after=await frame.evaluate(el=>el.contentWindow.scrollY);
      report.scrolls.push({lesson,bar,delta,before,after});assert.deepEqual(await content(),initial);
    }
    check(lesson+': both boundary drags retain wheel scrolling and document/Undo/preview');
  }
  // The guard must disappear on cancellation as well as pointerup.
  for(const cancel of ['Escape','blur']) {
    const box=await page.locator('#splitLeft').boundingBox(),x=box.x+box.width/2,y=box.y+140;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65,y,{steps:8});
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('pane-resizing')),true);
    assert.equal(await page.locator('#lessonIframe').evaluate(el=>getComputedStyle(el).pointerEvents),'auto');
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el,'::after').position),'fixed');
    if(cancel==='Escape')await page.keyboard.press('Escape');else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.mouse.up();assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('pane-resizing')),false);
  }
  check('Escape and blur remove the outer guard without disabling the iframe');
  await page.screenshot({path:evidence+'/after-resize-scroll.png'});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
  check('no script exceptions or GAS requests');
} catch(error) {
  report.failure=error.stack;await page.screenshot({path:evidence+'/failure.png'});throw error;
} finally {
  await writeFile(evidence+'/report.json',JSON.stringify(report,null,2));
  await context.close();await browser.close();await new Promise(done=>server.close(done));
}
