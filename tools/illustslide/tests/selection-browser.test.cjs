/* 選択状態の切り替えと、頂点・輪郭・内側の判定をChromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const C = require('../core.js');
const K = require('../connectors.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const pathObject = (id, d, options = {}) => {
  const base = C.makeShape('rect', 0, 0, 1, 1);
  return { ...base, id, name: id, d, group: options.group || null, locked: !!options.locked,
    style: { ...base.style, fill: options.fill || '#B9DDF5', stroke: '#17324D', strokeWidth: options.strokeWidth ?? 2 } };
};
function fixture(objects, board = { width: 640, height: 400, unit: 'px', infinite: false }) {
  const document = C.createDocument(); document.id = C.uid('selection-workflow'); document.name = '選択操作';
  document.pages[0].board = board; document.pages[0].objects = objects; return C.validateDocument(document);
}
function selectionFixture() {
  return fixture([
    pathObject('path', 'M100 100L220 100L220 220L100 220Z'),
    pathObject('group-a', 'M300 100L360 100L360 160L300 160Z', { group: 'group-1', fill: '#FBCFE8' }),
    pathObject('group-b', 'M380 100L440 100L440 160L380 160Z', { group: 'group-1', fill: '#FDE68A' }),
    pathObject('locked', 'M490 100L550 100L550 160L490 160Z', { locked: true, fill: '#CBD5E1' })
  ]);
}
function textFixture() {
  const text = C.makeText(100, 300, '既存の文字', { ...C.DEFAULT_STYLE, fill: '#7C3AED', fontSize: 22 });
  text.id = 'existing-text'; text.name = '既存テキスト';
  return fixture([pathObject('labelled-path', 'M100 100L260 100L260 220L100 220Z'), text]);
}

async function load(page, document, name = 'selection.json') {
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, document.id);
  await settle(page);
}
async function state(page) { return page.evaluate(() => IlapoEditor.getState()); }
async function selected(page) { return page.evaluate(() => IlapoEditor.getSelection()); }
async function anchors(page) { return page.evaluate(() => IlapoEditor.getAnchors()); }
async function documentOf(page) { return page.evaluate(() => IlapoEditor.getDocument()); }
async function inspect(page, id) {
  return page.evaluate(id => IlapoPathEdit.inspect(IlapoEditor.getDocument().pages[0].objects.find(object => object.id === id)), id);
}
async function screen(page, point) {
  return page.evaluate(point => {
    const camera = IlapoEditor.getCamera(), rect = document.getElementById('canvas').getBoundingClientRect();
    return { x: rect.left + (point.x - camera.x) / camera.width * rect.width, y: rect.top + (point.y - camera.y) / camera.height * rect.height };
  }, point);
}
async function clickWorld(page, point, options = {}) {
  const p = await screen(page, point);
  await page.mouse.click(p.x, p.y, options); await settle(page);
}
async function dragWorld(page, from, to, options = {}) {
  const a = await screen(page, from), b = await screen(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: options.steps || 6 });
  if (options.cancel) await page.keyboard.press('Escape');
  await page.mouse.up(); await settle(page);
}
async function selectMode(page) {
  await page.locator('#canvas').focus(); await page.keyboard.press('v'); await settle(page);
}
async function directMode(page) {
  await page.locator('#canvas').focus(); await page.keyboard.press('a'); await settle(page);
}

async function touchDrag(page, from, to) {
  const a = await screen(page, from), b = await screen(page, to), cdp = await page.context().newCDPSession(page);
  const point = p => ({ x: p.x, y: p.y, id: 7, radiusX: 8, radiusY: 8, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(a)] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point({ x: a.x + (b.x - a.x) * i / 6, y: a.y + (b.y - a.y) * i / 6 })] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await settle(page);
}

async function run() {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, hasTouch: true });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor);
    assert.equal(await page.locator('.top [data-tool="select"]').count(), 1, 'whole selection is the only top selection tool');
    assert.equal(await page.locator('.top [data-tool="direct"]').count(), 0, 'direct selection is not a top-level button');

    const original = selectionFixture(); await load(page, original);
    assert.equal((await state(page)).tool, 'select', 'new document starts in whole selection');
    assert.deepEqual(await documentOf(page), original, 'loading does not modify the document');

    // 未選択の頂点・辺では、最初の押下から点の編集としてドラッグできる。
    await dragWorld(page, { x: 100, y: 100 }, { x: 120, y: 120 });
    assert.equal((await state(page)).tool, 'direct');
    assert.equal((await anchors(page)).length, 1, 'vertex hit selects one anchor');
    let points = await inspect(page, 'path');
    assert(Math.abs(points[0].segments[0].point.x - 120) < 1);
    await clickWorld(page, { x: 40, y: 340 });
    assert.deepEqual(await selected(page), []); assert.equal((await state(page)).tool, 'select');

    await load(page, selectionFixture());
    await dragWorld(page, { x: 160, y: 100 }, { x: 176, y: 116 });
    assert.equal((await state(page)).tool, 'direct');
    assert.equal((await anchors(page)).length, 2, 'edge hit selects both edge endpoints');
    points = await inspect(page, 'path');
    assert(Math.abs(points[0].segments[0].point.x - 116) < 1 && Math.abs(points[0].segments[0].point.y - 116) < 1);
    assert(Math.abs(points[0].segments[1].point.x - 236) < 1 && Math.abs(points[0].segments[1].point.y - 116) < 1);

    // 細線は線から少し外れても拾える。未選択の状態から区間の両端を動かす。
    await load(page, fixture([pathObject('thin', 'M100 280L420 280', { fill: 'none', strokeWidth: .1 })]));
    await dragWorld(page, { x: 240, y: 277 }, { x: 260, y: 297 });
    assert.equal((await state(page)).tool, 'direct');
    assert.equal((await anchors(page)).length, 2);
    const thin = (await inspect(page, 'thin'))[0].segments;
    assert(Math.abs(thin[0].point.x - 120) < 1 && Math.abs(thin[0].point.y - 300) < 1);
    assert(Math.abs(thin[1].point.x - 440) < 1 && Math.abs(thin[1].point.y - 300) < 1);

    // 内側で全体を選び、ポップアップには切り替え先のモードだけを表示する。
    await load(page, selectionFixture());
    await clickWorld(page, { x: 160, y: 160 });
    assert.equal((await state(page)).tool, 'select'); assert.deepEqual(await anchors(page), []);
    assert.deepEqual(await selected(page), ['path']);
    assert.equal(await page.locator('#direct-mode').isVisible(), true);
    assert.equal(await page.locator('#whole-mode').isVisible(), false);
    await page.screenshot({ path: path.join(os.tmpdir(), 'illustslide-selection-whole.png') });
    await page.locator('#direct-mode').click(); await settle(page);
    assert.equal((await state(page)).tool, 'direct');
    assert.equal(await page.locator('#whole-mode').isVisible(), true);
    assert.equal(await page.locator('#direct-mode').isVisible(), false);

    // 内側のドラッグは選択点を保って全体を動かし、1回のUndoで元に戻る。
    await clickWorld(page, { x: 100, y: 100 });
    const refsBeforeMove = await anchors(page), beforeMove = await inspect(page, 'path');
    await dragWorld(page, { x: 160, y: 160 }, { x: 185, y: 175 });
    const afterMove = await inspect(page, 'path');
    assert.deepEqual(await anchors(page), refsBeforeMove, 'internal direct move keeps anchor refs');
    const moveDelta = { x: afterMove[0].segments[0].point.x - beforeMove[0].segments[0].point.x, y: afterMove[0].segments[0].point.y - beforeMove[0].segments[0].point.y };
    assert(Math.abs(moveDelta.x) > 5 && Math.abs(moveDelta.y) > 5, 'internal direct move changes the whole path');
    assert(Math.abs((afterMove[0].segments[1].point.x - beforeMove[0].segments[1].point.x) - moveDelta.x) < 1);
    assert(Math.abs((afterMove[0].segments[1].point.y - beforeMove[0].segments[1].point.y) - moveDelta.y) < 1);
    await page.screenshot({ path: path.join(os.tmpdir(), 'illustslide-selection-direct.png') });
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await inspect(page, 'path'), beforeMove, 'direct whole move is one Undo');

    // 全体選択の枠は図形全体を変形する。確定前のEscapeでは文書を変えない。
    await selectMode(page); await clickWorld(page, { x: 160, y: 160 });
    const beforeResize = await documentOf(page), handle = await page.locator('[data-handle="se"]').boundingBox();
    assert(handle, 'whole selection exposes the southeast resize handle');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + 28, handle.y + 22, { steps: 5 }); await page.mouse.up(); await settle(page);
    const resized = await documentOf(page);
    assert.notDeepEqual(resized, beforeResize, 'whole selection resize commits geometry');
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await documentOf(page), beforeResize, 'whole selection resize is one Undo');
    await selectMode(page); await clickWorld(page, { x: 160, y: 160 });
    const cancelHandle = await page.locator('[data-handle="se"]').boundingBox();
    await page.mouse.move(cancelHandle.x + cancelHandle.width / 2, cancelHandle.y + cancelHandle.height / 2); await page.mouse.down();
    await page.mouse.move(cancelHandle.x + 28, cancelHandle.y + 22, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up(); await settle(page);
    assert.deepEqual(await documentOf(page), beforeResize, 'Escape cancels an in-progress resize');
    // 中央の丸から離れた枠の辺も、点編集へ切り替えず全体の幅を変える。
    await dragWorld(page, { x: 220, y: 130 }, { x: 248, y: 130 });
    const sideResized = (await inspect(page, 'path'))[0].segments;
    assert.equal((await state(page)).tool, 'select');
    assert.deepEqual(await anchors(page), []);
    assert(Math.abs(sideResized[0].point.x - 100) < 1 && sideResized[1].point.x > 240);
    assert(Math.abs(sideResized[1].point.y - 100) < 1 && Math.abs(sideResized[2].point.y - 220) < 1);
    await page.keyboard.press('Meta+z'); await settle(page);
    assert.deepEqual(await documentOf(page), beforeResize);
    await clickWorld(page, { x: 40, y: 340 }); assert.equal((await state(page)).tool, 'select');
    await directMode(page); await page.keyboard.press('Escape'); await settle(page);
    assert.deepEqual(await selected(page), []); assert.equal((await state(page)).tool, 'select');
    await page.keyboard.press('a'); assert.equal((await state(page)).tool, 'direct');
    await page.keyboard.press('v'); assert.equal((await state(page)).tool, 'select');

    // 内側のダブルクリックは文字編集、点編集中の輪郭はアンカー追加に使う。
    const textDocument = textFixture(); await load(page, textDocument); await selectMode(page);
    await page.mouse.dblclick((await screen(page, { x: 180, y: 160 })).x, (await screen(page, { x: 180, y: 160 })).y); await settle(page);
    assert.equal(await page.locator('#text-content, #text-input').count(), 1, 'interior double-click opens text editing');
    if (await page.locator('#inspector-close').isVisible()) { await page.locator('#inspector-close').click(); await settle(page); }
    await directMode(page); await clickWorld(page, { x: 180, y: 160 });
    const beforeAdd = (await inspect(page, 'labelled-path'))[0].segments.length;
    const contour = await screen(page, { x: 180, y: 100 }); await page.mouse.dblclick(contour.x, contour.y); await settle(page);
    assert.equal((await inspect(page, 'labelled-path'))[0].segments.length, beforeAdd + 1, 'direct contour double-click adds one point');

    // 接続矢印の線は経路編集へ入り、ダブルクリックで経路点を追加する。
    await load(page, fixture([K.make({ x: 100, y: 280 }, { x: 420, y: 280 }, { id: 'connection' })]));
    await clickWorld(page, { x: 210, y: 280 });
    assert.equal((await state(page)).tool, 'direct');
    assert.equal(await page.locator('[data-connection-handle="from"]').isVisible(), true);
    const connectionPoint = await screen(page, { x: 260, y: 280 });
    // dblclickのMouseEventは整数の画面座標なので、最寄りの画面ピクセルを押す。
    await page.mouse.dblclick(Math.round(connectionPoint.x), Math.round(connectionPoint.y)); await settle(page);
    const connectionDocument = await documentOf(page), waypoints = connectionDocument.pages[0].objects[0].waypoints;
    assert.equal(waypoints.length, 1, 'connector double-click adds exactly one waypoint');
    assert(Math.abs(waypoints[0].x - 260) < 1 && Math.abs(waypoints[0].y - 280) < 1, `waypoint follows the double-click: ${JSON.stringify(waypoints[0])}`);
    const blank = await screen(page, { x: 540, y: 340 });
    await page.mouse.dblclick(blank.x, blank.y); await settle(page);
    assert.deepEqual(await documentOf(page), connectionDocument, 'blank double-click does not edit a connector');

    // グループ全体の移動と、内部の1図形の点編集を区別する。固定図形は選択だけ許す。
    const groupDocument = selectionFixture(); await load(page, groupDocument); await selectMode(page);
    await clickWorld(page, { x: 330, y: 130 }); assert.deepEqual(new Set(await selected(page)), new Set(['group-a', 'group-b']));
    const groupBefore = await documentOf(page); await dragWorld(page, { x: 330, y: 130 }, { x: 350, y: 145 });
    const groupAfter = await documentOf(page);
    for (const id of ['group-a', 'group-b']) assert.notDeepEqual(groupAfter.pages[0].objects.find(object => object.id === id), groupBefore.pages[0].objects.find(object => object.id === id));
    await page.keyboard.press('Meta+z'); await settle(page);
    await directMode(page); await dragWorld(page, { x: 300, y: 100 }, { x: 315, y: 112 });
    assert.equal((await anchors(page)).length, 1);
    const directGroup = await documentOf(page);
    assert.notDeepEqual(directGroup.pages[0].objects.find(object => object.id === 'group-a'), groupBefore.pages[0].objects.find(object => object.id === 'group-a'));
    assert.deepEqual(directGroup.pages[0].objects.find(object => object.id === 'group-b'), groupBefore.pages[0].objects.find(object => object.id === 'group-b'));
    const groupRefs = await anchors(page), groupPoints = await Promise.all(['group-a', 'group-b'].map(id => inspect(page, id)));
    await dragWorld(page, { x: 330, y: 130 }, { x: 355, y: 150 });
    assert.deepEqual(await anchors(page), groupRefs, 'group interior move preserves the selected anchor');
    const groupMoves = await Promise.all(['group-a', 'group-b'].map(id => inspect(page, id)));
    const groupDeltas = groupMoves.map((paths, i) => ({ x: paths[0].segments[0].point.x - groupPoints[i][0].segments[0].point.x, y: paths[0].segments[0].point.y - groupPoints[i][0].segments[0].point.y }));
    assert(Math.abs(groupDeltas[0].x) > 5 && Math.abs(groupDeltas[0].y) > 5);
    assert(Math.abs(groupDeltas[0].x - groupDeltas[1].x) < 1 && Math.abs(groupDeltas[0].y - groupDeltas[1].y) < 1, 'direct interior move translates both group members equally');
    await selectMode(page);
    await clickWorld(page, { x: 40, y: 340 });
    await clickWorld(page, { x: 520, y: 130 });
    assert.deepEqual(await selected(page), ['locked'], 'locked path remains selectable');
    const lockedBefore = await documentOf(page);
    await dragWorld(page, { x: 520, y: 130 }, { x: 545, y: 145 });
    assert.deepEqual(await documentOf(page), lockedBefore, 'locked path refuses movement and editing');

    // 18px用紙の頂点編集を、390px幅の画面でタッチ操作する。
    const narrow = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const touchPage = await narrow.newPage(); touchPage.on('pageerror', error => errors.push(error.message)); touchPage.setDefaultTimeout(12000); await touchPage.goto(url); await touchPage.waitForFunction(() => !!window.IlapoEditor);
    const small = fixture([pathObject('small', 'M2 2L16 2L16 16L2 16Z', { fill: '#B9DDF5', strokeWidth: .1 })], { width: 18, height: 18, unit: 'px', infinite: false });
    await load(touchPage, small, 'small-touch.json');
    await touchDrag(touchPage, { x: 2, y: 2 }, { x: 5, y: 6 });
    assert.equal((await state(touchPage)).tool, 'direct'); assert.equal((await anchors(touchPage)).length, 1);
    const smallPoint = (await inspect(touchPage, 'small'))[0].segments[0].point;
    assert(Math.abs(smallPoint.x - 5) < .8 && Math.abs(smallPoint.y - 6) < .8, '18px touch vertex drag keeps its intended position');
    assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '390px touch layout has no horizontal overflow');
    await touchPage.screenshot({ path: path.join(os.tmpdir(), 'illustslide-selection-touch-390.png') });
    await narrow.close();

    assert.deepEqual(errors, [], errors.join('\n'));
    console.log('selection-browser.test.cjs: passed');
  } finally {
    await context.close(); await browser.close();
    if (!supplied) await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
