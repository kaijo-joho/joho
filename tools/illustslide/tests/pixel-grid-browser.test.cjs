/* 1px方眼、ピクセル吸着、用紙プリセットのChrome回帰。 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const C = require('../core.js');
const { revealObject } = require('./ui-helpers.cjs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const nearInteger = (value, message) => assert(Math.abs(value - Math.round(value)) < 0.001, `${message}: ${value}`);
const read = page => page.evaluate(() => IlapoEditor.getDocument());

function pathShape(id, d) {
  const object = C.makeShape('rect', 0, 0, 1, 1, { fill: 'none', stroke: '#172B4D', strokeWidth: 1 });
  object.id = id; object.name = id; object.d = d;
  return object;
}

function fixture() {
  const document = C.createDocument();
  document.id = 'pixel-grid-browser';
  document.name = 'ピクセル方眼';
  document.pages[0].board = { width: 18, height: 18, unit: 'px', infinite: false };
  const moving = C.makeShape('rect', 2.25, 2.4, 4.5, 3.5, { fill: '#93C5FD', stroke: '#172B4D', strokeWidth: 1 });
  moving.id = 'moving';
  const arrow = C.makeShape('rect', 11, 2, 3, 2, { fill: '#F59E0B', stroke: '#172B4D', strokeWidth: 1 });
  arrow.id = 'arrow';
  const source = pathShape('source', 'M1.25 10.25L3.25 10.25');
  const nonIntegerTarget = pathShape('non-integer-target', 'M9.4 9.4L11.4 9.4');
  const curve = pathShape('curve', 'M2.2 14.2C4.3 12.7 5.8 16.4 8.2 14.6');
  document.pages[0].objects = [moving, arrow, source, nonIntegerTarget, curve];
  return document;
}

async function run() {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  const project = point => page.evaluate(point => {
    const canvas = document.getElementById('canvas').getBoundingClientRect();
    const camera = IlapoEditor.getCamera();
    return { x: canvas.left + (point.x - camera.x) / camera.width * canvas.width, y: canvas.top + (point.y - camera.y) / camera.height * canvas.height };
  }, point);
  const boundsOf = (document, id) => page.evaluate(({ document, id }) => IlapoGeometry.bounds(document.pages[0].objects.find(object => object.id === id)), { document, id });
  const openSection = async section => {
    if (['board','view','animation'].includes(section)) {
      const button = page.locator('#' + section + '-toggle');
      if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
    } else {
      if (!await page.locator('#inspector-panel').isVisible() || !await page.locator('#inspector-tabs').isVisible()) await page.locator('#style-button').click();
      await page.locator(`#inspector-tabs [data-inspector-section="${section}"]`).click();
    }
    await settle(page);
  };
  const submitInspector = async () => {
    const submit = page.locator('#inspector-submit');
    if (await submit.isVisible()) await submit.click();
    await settle(page);
  };
  const load = async document => {
    await page.locator('#file-input').setInputFiles({ name: 'pixel-grid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
    if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
    await page.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
    await settle(page);
  };
  const dragWorld = async (from, to, target = page, modifier = null) => {
    const point = async value => target.evaluate(value => {
      const canvas = document.getElementById('canvas').getBoundingClientRect();
      const camera = IlapoEditor.getCamera();
      return { x: canvas.left + (value.x - camera.x) / camera.width * canvas.width, y: canvas.top + (value.y - camera.y) / camera.height * canvas.height };
    }, value);
    const a = await point(from), b = await point(to);
    if (modifier) await target.keyboard.down(modifier);
    await target.mouse.move(a.x, a.y); await target.mouse.down(); await target.mouse.move(b.x, b.y, { steps: 8 }); await target.mouse.up();
    if (modifier) await target.keyboard.up(modifier);
    await settle(target);
  };
  const selectObject = async id => {
    await page.locator('#canvas').focus(); await page.keyboard.press('v');
    const objectsTab = page.locator('#inspector-tabs [data-inspector-section="objects"]');
    if (!await objectsTab.getAttribute('aria-pressed').then(value => value === 'true').catch(() => false)) await page.locator('#objects-toggle').click();
    await (await revealObject(page, id)).click();
    if (await page.locator('#inspector-close').isVisible()) await page.locator('#inspector-close').click();
    await settle(page);
  };
  const selectPath = async id => {
    await selectObject(id); await page.keyboard.press('a'); await settle(page);
  };
  const nodeLocator = async (id, index) => {
    const nth = await page.locator('[data-node]').evaluateAll((elements, wanted) => elements.findIndex(element => {
      const value = JSON.parse(element.dataset.node); return value[0] === wanted.id && value[2] === wanted.index;
    }), { id, index });
    assert(nth >= 0, `${id} anchor ${index} exists`);
    return page.locator('[data-node]').nth(nth);
  };
  const dragNode = async (id, index, to, modifier = null) => {
    const node = await nodeLocator(id, index), box = await node.boundingBox();
    assert(box, `${id} anchor ${index} is visible`);
    const a = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, b = await project(to);
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    if (modifier) await page.keyboard.up(modifier);
    await settle(page);
  };

  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    await load(fixture());

    // 新規設定は1px方眼とピクセル吸着が有効、任意間隔グリッド吸着は無効。
    await openSection('view');
    assert(await page.locator('#view-pixel-grid').isChecked(), 'pixel grid defaults on');
    assert(await page.locator('#view-pixel').isChecked(), 'pixel snapping defaults on');
    assert.equal(await page.locator('#view-snap').isChecked(), false, 'arbitrary grid snapping defaults off');
    const defaultSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('kaijo-ilapo:settings')));
    assert.equal(defaultSettings.pixelGrid, true); assert.equal(defaultSettings.snapPixel, true); assert.equal(defaultSettings.snap, false);
    await submitInspector();

    // 18px用紙は十分に拡大表示され、方眼はartworkの上に描画される。
    const pixelGrid = page.locator('#pixel-grid'), artwork = page.locator('#artwork');
    assert.equal(await pixelGrid.count(), 1, 'pixel grid layer exists');
    assert.equal(await page.locator('#pixel-pattern').count(), 1, '1px pattern exists');
    const gridState = await page.evaluate(() => {
      const grid = document.getElementById('pixel-grid');
      return { display: getComputedStyle(grid).display, fill: grid.getAttribute('fill'), pointerEvents: getComputedStyle(grid).pointerEvents, zoom: document.getElementById('canvas').clientWidth / IlapoEditor.getCamera().width, zOrder: !!(document.getElementById('artwork').compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    assert(gridState.zoom >= 8, `18px paper is zoomed in (${gridState.zoom})`);
    assert.notEqual(gridState.display, 'none', 'pixel grid is visible at zoom >= 8');
    assert.match(gridState.fill || '', /pixel-pattern/); assert.equal(gridState.pointerEvents, 'none'); assert(gridState.zOrder, 'pixel grid is above artwork');
    assert.equal(await page.locator('#pixel-pattern').getAttribute('width'), '1');
    assert.equal(await page.locator('#pixel-pattern').getAttribute('height'), '1');
    await page.screenshot({ path: path.join(os.tmpdir(), 'illustslide-pixel-grid-18-desktop.png') });

    // ズーム閾値の境界で方眼だけが切り替わる。
    for (let i = 0; i < 20 && await page.evaluate(() => document.getElementById('canvas').clientWidth / IlapoEditor.getCamera().width >= 8); i++) {
      await page.locator('[data-action="zoom-out"]').click(); await settle(page);
    }
    assert(await page.evaluate(() => document.getElementById('canvas').clientWidth / IlapoEditor.getCamera().width < 8), 'zoom can cross the pixel-grid threshold');
    assert.equal(await pixelGrid.evaluate(element => getComputedStyle(element).display), 'none', 'pixel grid is hidden below zoom 8');
    for (let i = 0; i < 20 && await page.evaluate(() => document.getElementById('canvas').clientWidth / IlapoEditor.getCamera().width < 8); i++) {
      await page.locator('[data-action="zoom-in"]').click(); await settle(page);
    }
    assert(await page.evaluate(() => document.getElementById('canvas').clientWidth / IlapoEditor.getCamera().width >= 8));
    assert.notEqual(await pixelGrid.evaluate(element => getComputedStyle(element).display), 'none');

    // 用紙プリセット18/36/72は1pxグリッドとピクセル吸着を選び、任意間隔吸着を解除する。
    for (const preset of ['18', '36', '72']) {
      await openSection('board'); await page.locator('#board-preset').selectOption(preset); await submitInspector();
      const current = await read(page), settings = await page.evaluate(() => JSON.parse(localStorage.getItem('kaijo-ilapo:settings')));
      assert.equal(current.pages[0].board.width, Number(preset)); assert.equal(current.pages[0].board.height, Number(preset));
      assert.equal(settings.gridStep, 1, `${preset}px preset sets 1px grid`); assert.equal(settings.pixelGrid, true); assert.equal(settings.snapPixel, true); assert.equal(settings.snap, false);
    }
    // 18pxに戻して、以降の座標を読みやすくする。
    await openSection('board'); await page.locator('#board-preset').selectOption('18'); await submitInspector();

    // 長方形の配置、全体移動、右下リサイズはすべて1px座標へ吸着する。
    await page.locator('#canvas').focus(); await page.keyboard.press('r');
    const beforeDraw = await read(page); await dragWorld({ x: 1.2, y: 1.3 }, { x: 8.7, y: 7.6 });
    const afterDraw = await read(page), drawn = afterDraw.pages[0].objects.find(object => !beforeDraw.pages[0].objects.some(previous => previous.id === object.id));
    assert(drawn, 'dragging a rectangle creates an object');
    let drawnBounds = await boundsOf(afterDraw, drawn.id);
    for (const key of ['x', 'y', 'width', 'height']) nearInteger(drawnBounds[key], `drawn ${key} is integer`);
    // 後続の移動テストで図形が重ならないよう、配置確認用の図形を片付ける。
    await selectObject(drawn.id); await page.keyboard.press('Backspace'); await settle(page);

    await selectObject('moving');
    const beforeMove = await read(page); await dragWorld({ x: 4.1, y: 4.0 }, { x: 8.43, y: 7.27 });
    const moved = await read(page), movedBounds = await boundsOf(moved, 'moving');
    nearInteger(movedBounds.x, 'whole move left is integer'); nearInteger(movedBounds.y, 'whole move top is integer');
    await page.keyboard.press('Meta+z'); await settle(page); assert.deepEqual(await read(page), beforeMove, 'move is one undo');

    await selectObject('moving');
    const resize = page.locator('[data-handle="se"]'), resizeBox = await resize.boundingBox(); assert(resizeBox, 'resize handle exists');
    const beforeResize = await read(page); const target = await project({ x: 11.72, y: 10.38 });
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 8 }); await page.mouse.up(); await settle(page);
    const resized = await read(page), resizedBounds = await boundsOf(resized, 'moving');
    nearInteger(resizedBounds.x + resizedBounds.width, 'resized right edge is integer');
    nearInteger(resizedBounds.y + resizedBounds.height, 'resized bottom edge is integer');
    await page.keyboard.press('Meta+z'); await settle(page); assert.deepEqual(await read(page), beforeResize, 'resize is one undo');

    // pixel+gridのときは指定間隔グリッドを優先する。
    await openSection('view'); await page.locator('#view-snap').check(); await page.locator('#view-step').fill('3'); await submitInspector();
    await page.locator('#canvas').focus(); await page.keyboard.press('r'); await dragWorld({ x: 1.2, y: 1.1 }, { x: 8.8, y: 7.4 });
    const gridPlaced = (await read(page)).pages[0].objects.at(-1), gridBounds = await boundsOf(await read(page), gridPlaced.id);
    for (const value of [gridBounds.x, gridBounds.y, gridBounds.width, gridBounds.height]) assert(Math.abs(value / 3 - Math.round(value / 3)) < 0.001, `grid priority keeps ${value} on 3px interval`);
    await openSection('view'); await page.locator('#view-snap').uncheck(); await submitInspector();

    // Optionで一時解除し、Escapeではプレビューを確定しない。
    await selectObject('moving'); const beforeOption = await read(page); await dragWorld({ x: 4.1, y: 4.0 }, { x: 8.43, y: 7.27 }, page, 'Alt');
    const optionMoved = await read(page), optionBounds = await boundsOf(optionMoved, 'moving');
    assert(Math.abs(optionBounds.x - Math.round(optionBounds.x)) > 0.01 || Math.abs(optionBounds.y - Math.round(optionBounds.y)) > 0.01, 'Option temporarily disables pixel snapping');
    await page.keyboard.press('Meta+z'); await settle(page); assert.deepEqual(await read(page), beforeOption);
    await selectObject('moving'); const beforeEscape = await read(page);
    const a = await project({ x: 4.1, y: 4.0 }), b = await project({ x: 8.43, y: 7.27 });
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.keyboard.press('Escape'); await page.mouse.up(); await settle(page);
    assert.deepEqual(await read(page), beforeEscape, 'Escape cancels a pixel-snap preview');

    // 既存の非整数アンカーへ優先吸着せず、ピクセルを優先する。
    await selectPath('source'); await dragNode('source', 1, { x: 9.4, y: 9.4 });
    const sourceAfter = await page.evaluate(() => IlapoPathEdit.inspect(IlapoEditor.getDocument().pages[0].objects.find(object => object.id === 'source'))[0].segments[1].point);
    nearInteger(sourceAfter.x, 'anchor x ignores non-integer target'); nearInteger(sourceAfter.y, 'anchor y ignores non-integer target');

    // 曲線ハンドルも通常はピクセルへ吸着し、Optionのときだけ小数を保つ。
    await selectPath('curve');
    await (await nodeLocator('curve', 0)).click(); await settle(page);
    const bezier = page.locator('[data-bezier]').first(), bezierBox = await bezier.boundingBox(); assert(bezierBox, 'curve handle exists');
    const handleTarget = await project({ x: 5.37, y: 11.83 });
    const handleRef = await bezier.getAttribute('data-bezier');
    await page.mouse.move(bezierBox.x + bezierBox.width / 2, bezierBox.y + bezierBox.height / 2); await page.mouse.down(); await page.mouse.move(handleTarget.x, handleTarget.y, { steps: 8 }); await page.mouse.up(); await settle(page);
    const handles = await page.evaluate(() => IlapoPathEdit.inspect(IlapoEditor.getDocument().pages[0].objects.find(object => object.id === 'curve'))[0].segments);
    const [, , handleIndex, handleSide] = JSON.parse(handleRef);
    const anchor = handles[handleIndex].point, vector = handles[handleIndex][handleSide === 'in' ? 'handleIn' : 'handleOut'];
    nearInteger(anchor.x + vector.x, 'curve handle x snaps without Option');
    nearInteger(anchor.y + vector.y, 'curve handle y snaps without Option');
    const freeBezier = page.locator('[data-bezier]').first(), freeBox = await freeBezier.boundingBox(); assert(freeBox, 'curve handle remains available');
    const freeTarget = await project({ x: 6.43, y: 12.71 });
    await page.keyboard.down('Alt'); await page.mouse.move(freeBox.x + freeBox.width / 2, freeBox.y + freeBox.height / 2); await page.mouse.down(); await page.mouse.move(freeTarget.x, freeTarget.y, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Alt'); await settle(page);
    const freeAfter = await page.evaluate(() => IlapoPathEdit.inspect(IlapoEditor.getDocument().pages[0].objects.find(object => object.id === 'curve'))[0].segments);
    const freePoint = freeAfter[handleIndex].point, freeHandle = freeAfter[handleIndex][handleSide === 'in' ? 'handleIn' : 'handleOut'];
    assert(Math.abs(freePoint.x + freeHandle.x - 6.43) < 0.03, 'Option keeps the curve handle x fractional');
    assert(Math.abs(freePoint.y + freeHandle.y - 12.71) < 0.03, 'Option keeps the curve handle y fractional');

    // 矢印キーは通常1px、Shiftで10px。横移動では縦位置を変えない。
    await selectObject('arrow'); await page.locator('#canvas').focus();
    const arrowBefore = await read(page), arrowBeforeBounds = await boundsOf(arrowBefore, 'arrow');
    await page.keyboard.press('ArrowRight'); await settle(page);
    const arrowOne = await read(page), arrowOneBounds = await boundsOf(arrowOne, 'arrow');
    assert(Math.abs(arrowOneBounds.x - arrowBeforeBounds.x - 1) < 0.001, 'ArrowRight moves one pixel');
    assert.equal(arrowOneBounds.y, arrowBeforeBounds.y, 'horizontal nudge keeps y');
    await page.keyboard.press('Shift+ArrowRight'); await settle(page);
    const arrowTen = await read(page), arrowTenBounds = await boundsOf(arrowTen, 'arrow');
    assert(Math.abs(arrowTenBounds.x - arrowOneBounds.x - 10) < 0.001, 'Shift+ArrowRight moves ten pixels');
    assert.equal(arrowTenBounds.y, arrowOneBounds.y, 'shift horizontal nudge keeps y');

    const exported = await page.evaluate(() => IlapoSVG.exportPage(IlapoEditor.getDocument().pages[0]));
    assert(!exported.includes('pixel-grid')); assert(!exported.includes('pixel-pattern'));

    // 明示的なfalseは保存後の再読み込みでも尊重する。
    await openSection('view'); await page.locator('#view-pixel-grid').uncheck(); await page.locator('#view-pixel').uncheck(); await submitInspector();
    const savedFalse = await page.evaluate(() => JSON.parse(localStorage.getItem('kaijo-ilapo:settings')));
    assert.equal(savedFalse.pixelGrid, false); assert.equal(savedFalse.snapPixel, false);
    await page.reload(); await page.waitForFunction(() => !!window.IlapoEditor); await settle(page);
    if (await page.locator('#dialog[open]').count()) await page.locator('#dialog-cancel').click();
    await openSection('view');
    assert.equal(await page.locator('#view-pixel-grid').isChecked(), false); assert.equal(await page.locator('#view-pixel').isChecked(), false);

    // 390px幅・ダークテーマ・タッチでも設定とキャンバスを操作できる。
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const touch = await touchContext.newPage(); touch.setDefaultTimeout(10000);
    await touch.addInitScript(() => localStorage.removeItem('kaijo-ilapo:settings'));
    await touch.goto(url); await touch.waitForFunction(() => !!window.IlapoEditor);
    const mobileDocument = fixture();
    await touch.locator('#file-input').setInputFiles({ name: 'mobile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mobileDocument)) });
    if (await touch.locator('#replace-discard').isVisible()) await touch.locator('#replace-discard').click();
    await touch.waitForFunction(id => IlapoEditor.getDocument().id === id, mobileDocument.id); await settle(touch);
    await touch.locator('#board-toggle').tap(); await touch.locator('#view-toggle').tap();
    await touch.locator('#view-theme').selectOption('dark'); await touch.locator('#view-size').selectOption('xlarge');
    const touchSubmit = touch.locator('#inspector-submit'); if (await touchSubmit.isVisible()) await touchSubmit.tap(); await settle(touch);
    assert.equal(await touch.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await touch.locator('#canvas').isVisible());
    await touch.screenshot({ path: path.join(os.tmpdir(), 'illustslide-pixel-grid-390-dark.png') });
    await touch.locator('#objects-toggle').tap();
    await (await revealObject(touch, 'moving')).tap();
    if (await touch.locator('#inspector-close').isVisible()) await touch.locator('#inspector-close').tap();
    await touch.locator('#canvas').focus(); await touch.keyboard.press('v'); await settle(touch);
    const mobilePoint = world => touch.evaluate(point => {
      const canvas = document.getElementById('canvas').getBoundingClientRect(), camera = IlapoEditor.getCamera();
      return { x: canvas.left + (point.x - camera.x) / camera.width * canvas.width, y: canvas.top + (point.y - camera.y) / camera.height * canvas.height };
    }, world);
    const touchStart = await mobilePoint({ x: 4.1, y: 4.0 }), touchEnd = await mobilePoint({ x: 8.43, y: 7.27 });
    const mobileBefore = await touch.evaluate(() => ({ document: IlapoEditor.getDocument(), bounds: IlapoGeometry.bounds(IlapoEditor.getDocument().pages[0].objects.find(object => object.id === 'moving')) }));
    const cdp = await touchContext.newCDPSession(touch);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchStart.x, y: touchStart.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchStart.x + (touchEnd.x - touchStart.x) * .45, y: touchStart.y + (touchEnd.y - touchStart.y) * .45 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchEnd.x, y: touchEnd.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(touch);
    const mobileAfter = await touch.evaluate(() => ({ document: IlapoEditor.getDocument(), bounds: IlapoGeometry.bounds(IlapoEditor.getDocument().pages[0].objects.find(object => object.id === 'moving')) }));
    assert.notEqual(mobileAfter.bounds.x, mobileBefore.bounds.x, 'touch drag moves the figure');
    nearInteger(mobileAfter.bounds.x, 'touch move left is integer'); nearInteger(mobileAfter.bounds.y, 'touch move top is integer');
    await touchContext.close();

    assert.deepEqual(errors, []);
    console.log('illustSlide pixel grid browser tests passed');
  } finally {
    await context.close(); await browser.close();
    if (!supplied) await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
