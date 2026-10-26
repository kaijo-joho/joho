import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const {chromium, webkit} = createRequire(import.meta.url)('playwright');
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const engine = process.env.HTML_LAYOUT_ENGINE || 'chromium';
const evidence = process.env.HTML_LAYOUT_EVIDENCE || '/private/tmp/html-editor-layout-20261026/' + engine;
await mkdir(evidence, {recursive:true});
// 共通担当の未公開候補を接続検査する場合だけ、読取専用で固定した資産を重ねる。
const displayRoot = process.env.HTML_LAYOUT_DISPLAY_ROOT;
const sharedPaths = ['js/main.js','js/head.js','js/script.js','js/highlight.js','js/code_examples.js','js/display_settings.js','js/display_settings_ui.js',
  'css/css.css','css/preferences.css','css/header.css','css/code-examples.css','css/display-settings.css'];
const pinned = new Map();
if (displayRoot) for (const path of sharedPaths) if (existsSync(resolve(displayRoot,path))) pinned.set(path,await readFile(resolve(displayRoot,path)));
const sourceProof = [...pinned].map(([path,bytes]) => ({path,sha256:createHash('sha256').update(bytes).digest('hex')}));
const types = {'.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2'};
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) throw Error('outside fixture root');
    const relative = pathname.replace(/^\//,'');
    let bytes = pinned.get(relative) || await readFile(file);
    if (displayRoot && extname(file) === '.html') {
      bytes = Buffer.from(bytes.toString().replace(/<(?:script|link)\b[^>]+>/g, tag => {
        const source = /(?:src|href)="([^"?]+)(?:\?[^"]*)?"/.exec(tag)?.[1];
        if (!source) return tag;
        const asset = new URL(source, 'http://localhost' + pathname).pathname.replace(/^\//,'');
        if (!pinned.has(asset)) return tag;
        const integrity = 'sha384-' + createHash('sha384').update(pinned.get(asset)).digest('base64');
        return /integrity="[^"]*"/.test(tag) ? tag.replace(/integrity="[^"]*"/, `integrity="${integrity}"`) : tag.replace(/>$/, ` integrity="${integrity}" crossorigin="anonymous">`);
      }));
    }
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
const report = {engine, candidateSharedOverlay:Boolean(displayRoot), sourceProof, checks:[], layouts:[], errors:[], requests:[]};
page.on('pageerror', error => report.errors.push(error.message));
await context.route('https://script.google.com/**', route => { report.requests.push(route.request().url()); return route.abort(); });
const check = name => { report.checks.push(name); console.log('PASS', name); };
const source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>列配置の検証</title></head><body><h1>検証用</h1><p>表示操作で変更しない本文。</p></body></html>';
const key = 'joho.htmleditor.layout.v1';
const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const readyLesson = () => page.waitForFunction(() => {
  const frame = document.getElementById('lessonIframe');
  return frame.contentDocument?.readyState === 'complete' && frame.contentWindow.siteDisplaySettings?.version === 1 &&
    frame.contentDocument.querySelector('.code-example-tools');
});
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
const setDisplay = async (theme,size) => {
  await page.locator('#displayMenuWrap').evaluate(node => node.open = true);
  const panel = page.locator('#editorDisplaySettings');
  await panel.locator(`.site-display-settings__choice[data-value="${theme === 'auto' ? 'system' : theme}"]`).click();
  await panel.locator(`.site-display-settings__tick[data-scale="${{standard:100,large:110,largest:120}[size]}"]`).click();
  await page.locator('#displayMenuWrap').evaluate(node => node.open = false);
};
try {
  await page.goto(url);
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => !document.getElementById('editorDisplaySettings').hidden);
  await page.frameLocator('#lessonIframe').locator('html.html-practice-embedded').waitFor();
  await readyLesson();
  await upload();
  await page.waitForFunction(() => document.getElementById('previewIframe').contentDocument?.body?.textContent.includes('変更しない本文'));
  const before = await content();
  await page.evaluate(() => {
    window.layoutProof = {lesson:document.getElementById('lessonIframe').contentDocument, preview:document.getElementById('previewIframe').contentDocument};
    localStorage.setItem('layout-unrelated', 'keep');
    document.getElementById('lessonIframe').contentDocument.documentElement.style.scrollBehavior='auto';
    document.getElementById('lessonIframe').contentWindow.scrollTo(0,700);
  });
  const readingY = await page.locator('#lessonIframe').evaluate(frame => frame.contentWindow.scrollY);
  report.reading = [{stage:'before',y:readingY}];
  await clickBar('#splitLeft');
  assert.equal(await page.locator('#leftPane').isVisible(), false);
  assert.equal(await page.locator('#splitLeft').isVisible(), true);
  assert.equal((await state()).leftCollapsed, true);
  report.reading.push({stage:'collapsed',y:await page.locator('#lessonIframe').evaluate(frame => frame.contentWindow.scrollY)});
  await clickBar('#splitLeft');
  assert.equal(await page.locator('#leftPane').isVisible(), true);
  await page.waitForFunction(y => document.getElementById('lessonIframe').contentWindow.scrollY === y,readingY);
  report.reading.push({stage:'restored',y:await page.locator('#lessonIframe').evaluate(frame => frame.contentWindow.scrollY)});
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
  const unchanged = await state(), bar = await page.locator('#splitLeft').boundingBox();
  const x = bar.x + bar.width/2, y = bar.y + 160;
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x,y+120,{steps:8}); await page.mouse.up();
  assert.deepEqual(await state(),unchanged,'vertical dragging never becomes a click');
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+65,y,{steps:8});
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await state(),unchanged,'Escape never persists the transient width');
  assert.match(await page.locator('#splitLeft').getAttribute('aria-valuetext'),/\d+ピクセル/);
  check('vertical drag, Escape cancellation and spoken width match the audited corrections');
  const saved = await state();
  await page.reload(); await page.waitForSelector('#app:not([hidden])');
  await readyLesson();
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
  await page.locator('#displayMenuWrap').evaluate(node => node.open = true);
  const display = page.locator('#editorDisplaySettings'), frame = page.frameLocator('#lessonIframe');
  await display.locator('[data-scale="110"]').click();
  const slider=display.getByRole('slider'); await slider.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),111);
  assert.equal(await page.locator('#lessonIframe').evaluate(frame => frame.contentWindow.siteDisplaySettings.state.textScale),111);
  await display.locator('[data-value="relaxed"]').click();
  await display.getByRole('checkbox').uncheck();
  await page.locator('#displayMenuWrap').evaluate(node => node.open = false);
  await frame.locator('.site-display-settings__trigger').click();
  await frame.locator('.site-display-settings__scale').evaluate(node => { node.value='117'; node.dispatchEvent(new Event('input',{bubbles:true})); });
  assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),117);
  assert.equal(await page.evaluate(() => siteDisplaySettings.state.lineSpacing),'relaxed');
  await frame.locator('.site-display-settings__trigger').click();
  const pre=frame.locator('pre[data-code-example-enhanced]').first(), tools=frame.locator('.code-example-tools').first();
  const example=await pre.textContent();
  await tools.locator('[data-action="increase"]').click();
  assert.equal(await pre.getAttribute('data-code-example-scale'),'1.05');
  await tools.locator('[data-action="enlarge"]').scrollIntoViewIfNeeded();
  await page.locator('#lessonIframe').evaluate(frame => frame.contentDocument.documentElement.style.scrollBehavior='auto');
  const reading=await page.locator('#lessonIframe').evaluate(frame => frame.contentWindow.scrollY);
  const columnWidth=(await page.locator('#leftPane').boundingBox()).width;
  await tools.locator('[data-action="enlarge"]').click();
  await page.waitForFunction(() => document.body.classList.contains('lesson-example-expanded'));
  assert((await page.locator('#leftPane').boundingBox()).width > 1400);
  assert.equal(await page.locator('#workspace').evaluate(node => node.inert),true);
  await page.screenshot({path:evidence+'/example-expanded.png'});
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('lesson-example-expanded'));
  assert(Math.abs((await page.locator('#leftPane').boundingBox()).width - columnWidth) < 2);
  await page.waitForFunction(y => Math.abs(document.getElementById('lessonIframe').contentWindow.scrollY-y) < 3,reading);
  assert.equal(await pre.textContent(),example); assert.equal(await pre.getAttribute('data-code-example-scale'),'1.05');
  const layoutBeforeReset=await state();
  await page.locator('#displayMenuWrap').evaluate(node => node.open = true);
  await display.getByRole('button',{name:'表示設定を初期値に戻す',exact:true}).click();
  await page.locator('#displayMenuWrap').evaluate(node => node.open = false);
  assert.deepEqual(await state(),layoutBeforeReset);
  assert.equal(await pre.getAttribute('data-code-example-scale'),'1');
  assert.equal(await pre.getAttribute('data-code-example-wrap'),'true');
  assert.equal((await content()).source,source);
  check('shared controls synchronize exact scales both ways; expansion uses the editor viewport and reset affects display only');
  for (const width of [1440,1100,390]) for (const theme of ['auto','light','dark']) for (const size of ['standard','large','largest']) {
    await page.setViewportSize({width,height:950});
    await setDisplay(theme,size);
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
  await page.locator('#displayMenuWrap').evaluate(node => node.open = true);
  await display.getByRole('slider').evaluate(node => {node.value='150';node.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),150);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),false);
  assert(await display.getByRole('button',{name:'表示設定を初期値に戻す',exact:true}).isVisible());
  await page.locator('#displayMenuWrap').evaluate(node => node.open = false);
  check('maximum 150% display scale remains usable at 390px');
  await page.setViewportSize({width:1440,height:950});
  await setDisplay('light','standard');
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
