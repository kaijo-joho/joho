/* 実際の編集画面で、標準図柄の意味・色・線・操作名を確認する。 */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const C = require('../core.js');
const {setAppearance, startPresentation} = require('./ui-helpers.cjs');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function icon(page, selector, id) {
  const graphic = page.locator(selector).first().locator('svg[data-joho-icon]').first();
  assert.equal(await graphic.getAttribute('data-joho-icon'), id, selector);
  assert.equal(await graphic.getAttribute('aria-hidden'), 'true');
  const data = await graphic.evaluate(el => ({href:el.querySelector('use')?.getAttribute('href'),box:el.getAttribute('viewBox'),fill:getComputedStyle(el).fill,stroke:getComputedStyle(el).stroke,width:getComputedStyle(el).strokeWidth,color:getComputedStyle(el.parentElement).color}));
  assert.match(data.href, new RegExp('/shared/ui-icons\\.svg\\?v=20261113#' + id + '$'));
  assert.equal(data.box, '0 0 24 24'); assert.equal(data.fill, 'none'); assert.equal(data.width, '1.7px'); assert.equal(data.stroke, data.color);
}
async function menu(page, selector) {
  if (await page.locator(selector).getAttribute('aria-expanded') !== 'true') await page.locator(selector).click();
}
(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const output = process.env.ILLUSTSLIDE_ICON_EVIDENCE || path.join(os.tmpdir(),'illustslide-standard-icons'); await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:844}}), page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url())); page.setDefaultTimeout(10000);
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    const empty = await page.evaluate(() => IlapoEditor.getDocument());
    for (const [selector,id] of [['#file-button','file'],['#settings-button','settings'],['#help-button','help'],['#present-button','play'],['.top [data-action="undo"]','undo'],['.top [data-action="redo"]','redo'],['[data-action="zoom-in"]','zoom-in'],['[data-action="zoom-out"]','zoom-out'],['[data-action="fit"]','fit'],['#inspector-close','close'],['#document-tabs [data-document-close]','close']]) await icon(page,selector,id);
    await icon(page,'#operation-help [data-help-close]','close');
    assert.equal(await page.locator('.top [data-action="undo"]').isDisabled(),true);
    assert.equal(await page.locator('.top [data-action="redo"]').isDisabled(),true);
    for (const [theme,size,width] of [['light','standard',1280],['dark','standard',1280],['auto','large',736],['dark','xlarge',390],['light','standard',320]]) {
      await page.setViewportSize({width,height:844}); await setAppearance(page,{theme,size});
      await menu(page,'#settings-button');
      for (const name of ['auto','light','dark']) await icon(page,`[data-theme-choice="${name}"]`,'theme-'+name);
      assert.equal(await page.locator(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed'),'true');
      await page.locator('#settings-button').focus(); await page.keyboard.press('Tab');
      assert(await page.evaluate(() => document.activeElement.matches(':focus-visible')));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (theme==='auto') { await page.emulateMedia({colorScheme:'dark'}); await page.waitForFunction(() => document.documentElement.dataset.theme==='dark'); }
      await page.screenshot({path:path.join(output,`${theme}-${size}-${width}.png`)});
      await page.keyboard.press('Escape');
      assert.deepEqual(await page.evaluate(() => IlapoEditor.getDocument()),empty,'Appearance never edits the document');
    }
    await page.setViewportSize({width:1280,height:844}); await setAppearance(page,{theme:'dark',size:'standard'});
    assert.equal(await page.locator('#settings-button svg').evaluate(el=>el.getBoundingClientRect().width),22);
    await menu(page,'#file-button');
    for(const [action,id] of [['new','new'],['rename','rename'],['save','save'],['save-browser','save'],['save-local','save'],['recovery','open'],['open-file','open'],['auto-start','refresh']]) await icon(page,`#command-menu [data-action="${action}"]`,id);
    await page.screenshot({path:path.join(output,'file-menu.png')}); await page.keyboard.press('Escape');
    const doc=C.createDocument(), shape=C.makeShape('rect',80,80,180,100); shape.id='icon-object'; doc.id='icon-regression'; doc.pages[0].objects=[shape];
    doc.pages[0].animations=[{id:'icon-motion',targets:[shape.id],effect:'fade',mode:'in',trigger:'click',duration:50,delay:0}];
    await page.locator('#file-input').setInputFiles({name:'icons.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
    await page.waitForFunction(()=>IlapoEditor.getDocument().id==='icon-regression');
    await page.locator('#objects-toggle').click(); await page.locator('[data-pick-object="icon-object"]').click();
    await icon(page,'.object-layer-more','more'); await icon(page,'[data-object-command="lock"]','lock');
    await page.locator('[data-object-command="lock"]').click(); await settle(page); await icon(page,'[data-object-command="lock"]','unlock');
    await page.locator('[data-object-command="lock"]').click(); await settle(page);
    await page.locator('[data-pick-object="icon-object"]').click();
    await page.locator('#inspector-close').click(); await menu(page,'#selection-transform');
    await icon(page,'#command-menu [data-action="flip-h"]','flip-horizontal'); await icon(page,'#command-menu [data-action="flip-v"]','flip-vertical');
    await page.keyboard.press('Escape'); await page.locator('#animation-toggle').click();
    await icon(page,'#animation-preview','play'); await icon(page,'.animation-more','more');
    await page.locator('.animation-more').click();
    await icon(page,'[data-animation-close-edit]','close'); await icon(page,'[data-animation-delete]','delete');
    await page.locator('[data-animation-close-edit]').click(); await settle(page);
    assert.equal(await page.locator('.animation-more').evaluate(el=>el===document.activeElement),true);
    await page.locator('#animation-preview').click(); await settle(page);
    for(const [name,id] of [['reset','restart'],['next','play'],['stop','stop']]) await icon(page,'#inline-playback-'+name,id);
    await page.locator('#inline-playback-stop').click();
    await page.locator('#inspector-close').click(); await startPresentation(page);
    await icon(page,'.ilapo-present-close','stop'); await icon(page,'.ilapo-present-reset','restart'); await icon(page,'.ilapo-present-fullscreen','fullscreen-enter');
    await page.locator('.ilapo-present-fullscreen').click(); await page.waitForFunction(()=>!!document.fullscreenElement);
    await icon(page,'.ilapo-present-fullscreen','fullscreen-exit'); await page.evaluate(()=>document.exitFullscreen());
    await page.waitForFunction(()=>!document.getElementById('ilapo-presentation'));
    const exported=await page.evaluate(()=>IlapoSVG.exportPage(IlapoEditor.getDocument().pages[0]));
    assert(!exported.includes('ui-icons')&&!exported.includes('data-joho-icon'),'Operation drawings must never enter artwork output');
    assert(!requests.some(url=>url.includes('/docs/')),'No private specification assets at runtime'); assert.deepEqual(errors,[]);
    const fallback=await context.newPage(); await fallback.route('**/shared/ui-icons.js*',route=>route.abort());
    await fallback.goto(url); await fallback.waitForFunction(()=>!!window.IlapoEditor);
    assert.equal(await fallback.evaluate(()=>typeof JohoIcons),'undefined'); await icon(fallback,'#settings-button','settings');
    await menu(fallback,'#file-button'); await fallback.locator('[data-action="rename"]').click();
    await fallback.locator('#name-input').fill('共通JSが読めない場合'); await fallback.locator('#dialog-submit').click();
    assert.equal(await fallback.evaluate(()=>IlapoEditor.getDocument().name),'共通JSが読めない場合','The same-sprite fallback keeps editing usable');
    await context.close(); console.log('standard-icons-browser.test.cjs: passed (5 display states, operation mapping, playback, offline export boundary, shared JS failure)');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
