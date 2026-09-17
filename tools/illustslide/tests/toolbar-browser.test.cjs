/* 操作の集約、追加パレット、発表、狭い画面の入口をChromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const C = require('../core.js');
const {openView, startPresentation} = require('./ui-helpers.cjs');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const read = page => page.evaluate(() => IlapoEditor.getDocument());
async function inspectorSubmit(page) {
  const submit = page.locator('#inspector-submit');
  if (await submit.isVisible()) await submit.click();
  await settle(page);
}
function fixture() {
  const doc = C.createDocument(); doc.id = 'toolbar-fixture';
  doc.pages[0].objects = [C.makeShape('rect', 40, 40, 80, 60)];
  doc.pages.push(C.createPage('2ページ目', doc.pages[0].board));
  return doc;
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1280, height:844}}), errors = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    const doc = fixture();
    await page.locator('#file-input').setInputFiles({name:'toolbar.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(doc))});
    await page.waitForFunction(() => IlapoEditor.getDocument().id === 'toolbar-fixture');
    assert.equal(await page.locator('.top [data-menu="insert"],.top [data-menu="view"]').count(), 0);
    assert.equal(await page.locator('[data-action="import-image"]').count(), 1, '画像追加は左の1か所へ集約');
    await page.locator('.top [data-menu="more"]').click();
    assert.deepEqual(await page.locator('#command-menu [data-action]').evaluateAll(nodes => nodes.map(node => node.dataset.action)), ['select-all','paste']);
    await page.locator('#command-menu [data-action="select-all"]').click();
    assert.equal((await page.evaluate(() => IlapoEditor.getSelection())).length, 1);
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+c');
    await page.locator('.top [data-menu="more"]').click(); await page.locator('#command-menu [data-action="paste"]').click();
    await settle(page); assert.equal((await read(page)).pages[0].objects.length, 2);
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await read(page), doc, '貼り付けは1回のUndoで戻る');

    // 画像は新しい左パレットの入口から実際に読み込める。
    const png = await page.evaluate(() => { const c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillRect(0,0,4,4);return c.toDataURL().split(',')[1]; });
    const choosing = page.waitForEvent('filechooser'); await page.locator('#add-palette [data-action="import-image"]').click();
    await (await choosing).setFiles({name:'sample.png', mimeType:'image/png', buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(() => IlapoEditor.getDocument().pages[0].objects.some(o => o.type==='image'));
    await page.locator('#canvas').focus(); await page.keyboard.press('Meta+z'); await settle(page);

    await page.locator('#pages-toggle').click(); await page.locator('[data-page-pick="1"]').click(); await page.locator('#inspector-close').click();
    await startPresentation(page, true); await page.locator('#ilapo-presentation').waitFor();
    assert((await page.locator('.ilapo-present-status').textContent()).startsWith('2 / 2'));
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'present-button');
    await startPresentation(page); await page.locator('#ilapo-presentation').waitFor();
    assert((await page.locator('.ilapo-present-status').textContent()).startsWith('1 / 2'));
    await page.keyboard.press('Escape');

    for (const [theme, size] of [['light','standard'], ['dark','xlarge'], ['auto','large']]) {
      await openView(page); await page.locator('#view-theme').selectOption(theme); await page.locator('#view-size').selectOption(size);
      await inspectorSubmit(page); await page.locator('#inspector-close').click();
      for (const width of [320,390,560,561,736,850,851,1024,1280]) {
        await page.setViewportSize({width, height:844}); await settle(page);
        const layout = await page.evaluate(() => {
          const top=document.querySelector('.top'), r=top.getBoundingClientRect();
          const buttons=[...top.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>b.getBoundingClientRect());
          return {fits:top.scrollWidth<=top.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth+1, oneRow:buttons.every(b=>b.top>=r.top && b.bottom<=r.bottom+1)};
        });
        assert(layout.fits && layout.oneRow, `${theme}/${size}/${width}px: 上部は1行で画面内に収まる`);
        assert.equal(await page.locator('#palette-toggle').isVisible(), width<=560);
        await page.locator('.top [data-menu="more"]').click();
        const tools=await page.locator('#command-menu [data-tool]').evaluateAll(nodes=>nodes.map(n=>n.dataset.tool));
        assert.deepEqual(tools, width<=850 ? ['select','pan'] : []);
        assert.equal(await page.locator('#command-menu [data-action="view-dialog"],#command-menu [data-action="import-image"],#command-menu [data-action="export-playback"]').count(),0);
        await page.keyboard.press('Escape');
      }
    }
    await page.screenshot({path:'/private/tmp/illustslide-toolbar-desktop.png'});
    await page.setViewportSize({width:390, height:844}); await settle(page);
    const before=await read(page);
    await page.locator('#palette-toggle').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#shape-tools [data-tool="rect"]').isVisible());
    assert(await page.evaluate(()=>{const p=document.querySelector('#add-palette'),r=p.getBoundingClientRect(),top=document.querySelector('.top').getBoundingClientRect();return r.width>=180&&p.scrollWidth<=p.clientWidth+1&&Math.abs(r.top-top.bottom)<1;}),'追加パレットは読める幅で上部の直下に開く');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>document.activeElement.id),'palette-toggle');
    await page.locator('#palette-toggle').click(); await page.locator('#canvas').click({position:{x:280,y:300}});
    assert.equal(await page.locator('#palette-toggle').getAttribute('aria-expanded'),'false');
    assert.deepEqual(await read(page),before,'パレット外のクリックは作図せず閉じる');
    await page.locator('#palette-toggle').click(); await page.locator('#toast').waitFor({state:'hidden'}); await page.screenshot({path:'/private/tmp/illustslide-toolbar-mobile.png'});
    await page.locator('#shape-tools [data-tool="rect"]').click();
    assert.equal(await page.locator('#palette-toggle').getAttribute('aria-expanded'),'false');
    await page.locator('#canvas').click({position:{x:160,y:300}}); await settle(page);
    assert.equal((await read(page)).pages[1].objects.length,1);
    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    touch.on('pageerror',error=>errors.push(error.message));
    await touch.goto(url); await touch.waitForFunction(()=>!!window.IlapoEditor);
    await touch.locator('#palette-toggle').tap(); await touch.locator('#shape-tools [data-tool="rect"]').tap();
    await touch.locator('#canvas').tap({position:{x:160,y:300}}); await settle(touch);
    assert.equal((await read(touch)).pages[0].objects.length,1,'タップで追加ツールを選び作図できる');
    await touch.close(); assert.deepEqual(errors,[]);
    console.log('illustSlide toolbar browser tests passed');
  } finally { await browser.close(); if(!supplied) server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
