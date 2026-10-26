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
const evidence = process.env.HTML_LAYOUT_EVIDENCE || '/private/tmp/html-editor-layout-20261026/' + engine;
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
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/tools/htmleditor/index.html?lesson=html14`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch(existsSync(chrome) ? {executablePath:chrome} : {});
const context = await browser.newContext({viewport:{width:1440, height:950}});
const page = await context.newPage();
const report = {engine, checks:[], layouts:[], errors:[], requests:[]};
page.on('pageerror', error => report.errors.push(error.message));
await context.route('https://script.google.com/**', route => { report.requests.push(route.request().url()); return route.abort(); });
const check = name => { report.checks.push(name); console.log('PASS', name); };
const source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>列配置の検証</title></head><body><h1>検証用</h1><p>表示操作で変更しない本文。</p></body></html>';
const key = 'joho.htmleditor.layout.v1';
const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const upload = async () => {
  await page.locator('#fileInput').setInputFiles({name:'sample.html', mimeType:'text/html', buffer:Buffer.from(source)});
  await page.waitForFunction(() => document.body.classList.contains('has-document'));
};
const clickBar = async id => {
  const box = await page.locator(id).boundingBox(); assert(box);
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(140, box.height / 2));
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
  await page.goto(url);
  await page.waitForSelector('#app:not([hidden])');
  await page.frameLocator('#lessonIframe').locator('html.html-practice-embedded').waitFor();
  await upload();
  await page.waitForFunction(() => document.getElementById('previewIframe').contentDocument.body.textContent.includes('変更しない本文'));
  const before = await content();
  await page.evaluate(() => {
    window.layoutProof = {lesson:document.getElementById('lessonIframe').contentDocument, preview:document.getElementById('previewIframe').contentDocument};
    localStorage.setItem('layout-unrelated', 'keep');
    document.getElementById('lessonIframe').contentWindow.scrollTo(0,700);
  });
  const readingY = await page.locator('#lessonIframe').evaluate(frame => frame.contentWindow.scrollY);
  await clickBar('#splitLeft');
  assert.equal(await page.locator('#leftPane').isVisible(), false);
  assert.equal(await page.locator('#splitLeft').isVisible(), true);
  assert.equal((await state()).leftCollapsed, true);
  await clickBar('#splitLeft');
  assert.equal(await page.locator('#leftPane').isVisible(), true);
  assert.equal(await page.locator('#lessonIframe').evaluate(frame => frame.contentWindow.scrollY), readingY);
  check('left boundary clicks collapse/restore without losing reading position');
  await clickBar('#splitRight');
  assert.equal(await page.locator('#rightPane').isVisible(), false);
  assert.equal(await page.locator('#splitRight').isVisible(), true);
  await clickBar('#splitLeft');
  assert.equal(await page.locator('#leftPane').isVisible(), false);
  assert((await page.locator('#centerPane').boundingBox()).width > 1400);
  await clickBar('#splitRight'); await clickBar('#splitLeft');
  assert.deepEqual(await content(), before);
  assert(await page.evaluate(() => layoutProof.lesson === document.getElementById('lessonIframe').contentDocument && layoutProof.preview === document.getElementById('previewIframe').contentDocument));
  check('both sides can close; document, undo history, preview and iframe identities remain unchanged');
  const startLeft = (await page.locator('#leftPane').boundingBox()).width;
  await dragBar('#splitLeft', 68);
  assert.equal((await state()).leftCollapsed, false);
  assert((await page.locator('#leftPane').boundingBox()).width > startLeft + 60);
  const leftWidth = (await page.locator('#leftPane').boundingBox()).width;
  await dragBar('#splitLeft', -(leftWidth - 36));
  assert.equal(await page.locator('#leftPane').isVisible(), false);
  const savedRatio = (await state()).leftRatio;
  await clickBar('#splitLeft');
  assert(Math.abs((await state()).leftRatio - savedRatio) < .001);
  await dragBar('#splitRight', (await page.locator('#rightPane').boundingBox()).width - 36);
  assert.equal(await page.locator('#rightPane').isVisible(), false);
  await dragBar('#splitRight', -290);
  assert.equal(await page.locator('#rightPane').isVisible(), true);
  check('drag resizes without click-toggle; edge drag folds and outward drag restores');
  await page.locator('#splitLeft').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#leftPane').isVisible(), false);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#leftPane').isVisible(), true);
  await page.locator('#splitRight').focus(); await page.keyboard.press('Home');
  assert.equal(await page.locator('#rightPane').isVisible(), false);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#rightPane').isVisible(), true);
  check('keyboard Enter/Space/Home/arrows operate both boundaries');
  const saved = await state();
  await page.reload(); await page.waitForSelector('#app:not([hidden])');
  assert.equal(await page.locator('#currentFileLabel').textContent(), '');
  assert.deepEqual(await state(), saved);
  await upload();
  assert(Math.abs((await page.locator('#leftPane').boundingBox()).width / 1440 - saved.leftRatio) < .02);
  check('reload restores only layout, never automatically opens the local file');
  await page.locator('#viewMenu summary').click(); await page.locator('#resetLayoutBtn').click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('layout-unrelated')), 'keep');
  assert.equal((await content()).source, source);
  check('reset clears only layout and retains unrelated storage and the open document');
  for (const width of [1440,1100,390]) for (const theme of ['auto','light','dark']) for (const size of ['standard','large','largest']) {
    await page.setViewportSize({width,height:950});
    await page.locator('#displayMenuWrap').evaluate(node => node.open = true);
    await page.locator('#themeSelect').selectOption(theme); await page.locator('#sizeSelect').selectOption(size);
    await page.locator('#displayMenuWrap').evaluate(node => node.open = false);
    if (width < 1051) for (const panel of ['left','right','center']) {
      await page.locator(`#paneNav [data-pane="${panel}"]`).click();
      assert.equal(await page.locator(`#${panel}Pane`).isVisible(), true);
    }
    const row = await page.evaluate(() => ({overflow:document.documentElement.scrollWidth > innerWidth + 1,
      editorWidth:document.getElementById('centerPane').getBoundingClientRect().width,
      splitterVisible:getComputedStyle(document.getElementById('splitLeft')).display !== 'none'}));
    assert.equal(row.overflow,false,JSON.stringify({width,theme,size,...row}));
    assert(row.editorWidth >= 275);
    assert.equal(row.splitterVisible,width > 1050);
    report.layouts.push({width,theme,size,...row});
  }
  check('27 viewport/theme/text-size states retain usable editing and mobile panel navigation');
  await page.setViewportSize({width:1440,height:950});
  await page.locator('#displayMenuWrap').evaluate(node => node.open = true);
  await page.locator('#themeSelect').selectOption('light'); await page.locator('#sizeSelect').selectOption('standard');
  await page.locator('#displayMenuWrap').evaluate(node => node.open = false);
  await page.screenshot({path:evidence + '/three-columns.png'});
  await clickBar('#splitRight'); await page.screenshot({path:evidence + '/lesson-and-edit.png'});
  assert.deepEqual(report.errors,[]); assert.deepEqual(report.requests,[]);
  check('no script errors, GAS requests or file writes are caused by display operations');
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({path:evidence + '/failure.png'}).catch(() => {});
  throw error;
} finally {
  await writeFile(evidence + '/report.json', JSON.stringify(report,null,2));
  await browser.close(); await new Promise(done => server.close(done));
}
