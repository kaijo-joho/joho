/* Chrome contract tests for the graph list reorder controller. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const source = fs.readFileSync(path.resolve(__dirname, '../list-reorder.js'), 'utf8');
let browser;
(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 620, height: 420 }, hasTouch: true });
  await page.setContent(`<!doctype html><style>
    #objects { height: 220px; overflow: auto; border: 1px solid; }
    .row { height: 42px; padding: 4px; border-bottom: 1px solid #ddd; }
    .object-item, .parameter-name { height: 34px; }
    [data-reorder-handle] { touch-action: none; }
    .reorder-before { border-top: 4px solid red; }
    .reorder-after { border-bottom: 4px solid red; }
  </style><button id="undo">Undo</button><main id="objects"><div class="object-list" data-list="series"></div><div class="object-list" data-list="annotation"></div><div class="object-list" data-list="parameter"></div><div class="object-list" data-list="chart"></div></main><script>${source}</script><script>
  const root = document.querySelector('#objects');
  const log = [];
  function render() {
    root.querySelectorAll('[data-list]').forEach(list => list.replaceChildren());
    [['series','a'],['series','b'],['annotation','x'],['series','c'],['series','d'],['parameter','p'],['parameter','q'],['parameter','r'],['parameter','s'],['parameter','t'],['parameter','u'],['parameter','v'],['parameter','w']].forEach(([type,id]) => {
      const row = document.createElement('div'); row.className='row'; row.dataset.reorderType=type; row.dataset.reorderId=id;
      if (type === 'parameter') row.innerHTML='<button class="parameter-name">'+id+'</button><span data-reorder-handle aria-label="並べ替え">☷</span>';
      else row.innerHTML='<button class="object-item">'+id+'</button>';
      root.querySelector('[data-list="'+type+'"]').append(row);
    });
  }
  render(); window.undoClicks = 0; document.querySelector('#undo').onclick = () => window.undoClicks++;
  window.controller = GraphListReorder.bind(root,{onStart:()=>log.push(['start']),onMove:(...args)=>{ log.push(['move',...args]); render(); }});
  window.getLog=()=>log.slice(); window.clearLog=()=>log.splice(0); window.render=render;
  </script>`);
  const rows = () => page.locator('#objects > .row');
  const point = async locator => locator.boundingBox();
  const center = async locator => { const b = await point(locator); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const row = id => page.locator(`[data-reorder-id="${id}"]`);
  const drag = async (from, to, yOffset = 0) => {
    const a = await center(row(from).locator('.object-item, .parameter-name').first());
    const b = await center(row(to));
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y + yOffset, { steps: 8 }); await page.mouse.up();
  };

  await drag('a', 'b', 14);
  assert.deepEqual(await page.evaluate(() => getLog()), [['start'], ['move', 'series', 'a', 1]], 'mouse drag moves within the same type group');
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(() => window.undoClicks), 1, 'the unrelated Undo click after redraw is not swallowed');
  assert.equal(await page.locator('.reorder-before, .reorder-after').count(), 0, 'markers are cleaned after drop');
  await page.evaluate(() => window.clearLog());
  await drag('b', 'a', -14); // b is now the second series, and returns to the first slot.
  assert.deepEqual(await page.evaluate(() => getLog()), [['start'], ['move', 'series', 'b', 0]]);

  await page.evaluate(() => window.clearLog());
  const a = await center(row('a').locator('.object-item'));
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 2, a.y + 2); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => getLog()), [], 'sub-threshold pointer movement and Escape do not reorder');

  await page.evaluate(() => window.clearLog());
  await drag('a', 'x');
  assert.deepEqual(await page.evaluate(() => getLog()), [['start']], 'cross-type drop is ignored');

  await page.evaluate(() => window.clearLog());
  await page.evaluate(() => {
    document.querySelector('#objects').scrollTop = 170;
    const p = document.querySelector('[data-reorder-id="p"] .parameter-name');
    const a = p.getBoundingClientRect(), b = document.querySelector('[data-reorder-id="q"]').getBoundingClientRect();
    p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: 20, clientY: a.top + a.height / 2, buttons: 1 }));
    p.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: 20, clientY: b.top + b.height / 2, buttons: 1 }));
    p.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: 20, clientY: b.top + b.height / 2 }));
  });
  assert.deepEqual(await page.evaluate(() => getLog()), [], 'touch starts only from the handle');

  await page.evaluate(() => window.clearLog());
  await page.evaluate(() => {
    document.querySelector('#objects').scrollTop = 170;
    const p = document.querySelector('[data-reorder-id="p"] [data-reorder-handle]');
    const a = p.getBoundingClientRect(), b = document.querySelector('[data-reorder-id="q"]').getBoundingClientRect();
    p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 10, pointerType: 'touch', clientX: 20, clientY: a.top + a.height / 2, buttons: 1 }));
    p.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 10, pointerType: 'touch', clientX: 20, clientY: b.top + b.height / 2, buttons: 1 }));
    p.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 10, pointerType: 'touch', clientX: 20, clientY: b.top + b.height / 2 }));
  });
  assert.deepEqual(await page.evaluate(() => getLog()), [['start'], ['move', 'parameter', 'p', 1]], 'touch handle reorders');

  await page.evaluate(() => window.clearLog());
  await row('q').locator('.parameter-name').focus(); await page.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await page.evaluate(() => getLog()), [['start'], ['move', 'parameter', 'q', 2]], 'Alt+ArrowDown uses the same move callback');
  await page.evaluate(() => window.clearLog()); await row('r').locator('.parameter-name').focus(); await page.keyboard.press('Alt+Home');
  assert.deepEqual(await page.evaluate(() => getLog()), [['start'], ['move', 'parameter', 'r', 0]]);
  await page.evaluate(() => window.clearLog()); await row('p').locator('.parameter-name').focus(); await page.keyboard.press('Alt+End');
  assert.deepEqual(await page.evaluate(() => getLog()), [['start'], ['move', 'parameter', 'p', 7]]);

  await page.evaluate(() => { const root = document.querySelector('#objects'); root.scrollTop = 0; });
  const beforeScroll = await page.locator('#objects').evaluate(el => el.scrollTop);
  const first = await center(row('a').locator('.object-item')); await page.mouse.move(first.x, first.y); await page.mouse.down(); await page.mouse.move(first.x, 410, { steps: 20 }); await page.waitForTimeout(80); await page.mouse.up();
  assert((await page.locator('#objects').evaluate(el => el.scrollTop)) > beforeScroll, 'drag near the edge autoscrolls the list');
  assert.equal(await page.evaluate(() => controller.active), false);
  await browser.close();
  console.log('graph list-reorder-browser.test.cjs: ok');
})().catch(async error => { console.error(error); process.exitCode = 1; if (browser) await browser.close(); });
