const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(error ? 'not found' : data); });
});
let browser, page;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 850 }, hasTouch: true });
  await page.setContent('<style>.top{display:flex;width:280px}</style><div class="top"><div id="document-tabs"></div></div><button id="outside">外側</button>');
  await page.addStyleTag({ url: 'http://127.0.0.1:' + server.address().port + '/tools/graph/document-tabs.css' });
  await page.addScriptTag({ url: 'http://127.0.0.1:' + server.address().port + '/tools/graph/document-tabs-ui.js' });
  await page.evaluate(() => {
    window.events = []; window.tabList = [{ id: 'a', name: '最初のグラフは長い名前です', dirty: true }, { id: 'b', name: '比較用グラフも長い名前です', busy: true }, { id: 'c', name: '最後のグラフも長い名前です' }];
    window.tabs = GraphDocumentTabs.create(document.querySelector('#document-tabs'), {
      onSelect: id => { events.push(['select', id]); tabs.render(tabList, id); }, onClose: id => events.push(['close', id]), onMenuOpen: () => events.push(['menu'])
    });
    tabs.render(tabList, 'a');
  });
  const tabs = page.locator('[role="tab"]');
  assert.equal(await tabs.count(), 3); assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
  await tabs.first().focus(); await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(() => events.at(-1)), ['select', 'b']);
  await page.keyboard.press('End'); assert.deepEqual(await page.evaluate(() => events.at(-1)), ['select', 'c']);
  await tabs.first().press('Delete'); assert.equal((await page.evaluate(() => events.filter(event => event[0] === 'close'))).length, 0);
  await page.locator('[data-document-tab-close="a"]').click(); assert.deepEqual(await page.evaluate(() => events.at(-1)), ['close', 'a']);
  await page.locator('.graph-document-tabs__menu > summary').click(); assert.equal(await page.locator('.graph-document-tabs__menu').evaluate(menu => menu.open), true);
  await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement.dataset.documentTabId), 'a');
  await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement.dataset.documentTabId), 'b');
  await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement.dataset.documentTabId), 'c');
  await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => document.activeElement.dataset.documentTabId), 'a');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.graph-document-tabs__menu').evaluate(menu => menu.open), false);
  await page.locator('.graph-document-tabs__menu > summary').click(); await page.locator('#outside').click(); assert.equal(await page.locator('.graph-document-tabs__menu').evaluate(menu => menu.open), false, '外側クリックで一覧を閉じる');
  await page.locator('.graph-document-tabs__menu > summary').click(); await page.locator('#outside').focus(); assert.equal(await page.locator('.graph-document-tabs__menu').evaluate(menu => menu.open), false, '外側へフォーカスを移すと一覧を閉じる');
  await page.evaluate(() => tabs.render(tabList.map(tab => ({ ...tab, busy: false })), 'c'));
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').getAttribute('data-document-tab-id'), 'c');
  await page.locator('.graph-document-tabs__menu > summary').click();
  await page.getByRole('menuitemradio', { name: /最初のグラフ/ }).click();
  const visible = await page.evaluate(() => { const strip = document.querySelector('[role="tablist"]'), tab = document.querySelector('[role="tab"][aria-selected="true"]'), a = strip.getBoundingClientRect(), b = tab.getBoundingClientRect(); return { id: tab.dataset.documentTabId, starts: b.left <= a.left + 1, visible: b.right > a.left && b.left < a.right, scroll: strip.scrollLeft }; });
  assert.equal(visible.id, 'a'); assert(visible.visible && visible.starts, '一覧から先頭タブへ戻すと名前の先頭を表示する');
  await page.locator('.top').evaluate(el => { el.style.width = '160px'; }); await page.waitForTimeout(50);
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').getAttribute('data-document-tab-id'), 'a');
  console.log('document-tabs-ui-browser.test.cjs: ok');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
