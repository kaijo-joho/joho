/* illustSlide④: アウトライン化の入口、未確定プレビュー、フォント、確定後のUndoを実Chromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff': 'font/woff' })[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function inspectorSubmit(page) {
  const submit = page.locator('#inspector-submit');
  if (await submit.isVisible()) await submit.click();
  await settle(page);
}
const clone = value => JSON.parse(JSON.stringify(value));

function style(extra = {}) {
  return { ...C.DEFAULT_STYLE, fill: '#172B4D', stroke: 'none', strokeWidth: 0, fontSize: 26, fontFamily: 'sans-serif', bold: false, italic: false, ...extra };
}

function fixture() {
  const doc = C.createDocument();
  doc.id = 'outline-ui-fixture'; doc.name = 'アウトラインUI確認'; doc.version = 4;
  const page = doc.pages[0];
  page.name = '線・文字・ラベル・画像';
  page.board = { width: 640, height: 420, unit: 'px', infinite: false };

  const line = C.makeShape('line', 55, 80, 210, 0, { fill: 'none', stroke: '#2563EB', strokeWidth: 8, linecap: 'round' });
  line.id = 'outline-line'; line.name = '輪郭にする線';
  const text = C.makeText(70, 180, '日本語 Aa Zz 123', style({ fill: '#B91C1C', fontSize: 30, bold: true }));
  text.id = 'outline-text'; text.name = '日本語と英字の文字'; text.layout = { width: null, align: 'left' };
  const labelled = C.makeShape('roundrect', 345, 70, 220, 130, { fill: '#DBEAFE', stroke: '#0F766E', strokeWidth: 4 });
  labelled.id = 'outline-label-shape'; labelled.name = 'ラベル付き図形';
  labelled.label = { runs: [{ text: 'Label ラベル', script: 'normal' }], style: style({ fill: '#111827', fontSize: 22, fontFamily: 'serif' }), align: 'center', padding: 8 };
  const image = {
    id: 'outline-image', type: 'image', name: '保持する画像', group: null, locked: false,
    matrix: [1, 0, 0, 1, 0, 0], style: { ...C.DEFAULT_STYLE, fill: '#FFFFFF', stroke: 'none', strokeWidth: 0, opacity: 1 },
    x: 430, y: 260, width: 48, height: 48,
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', reference: false
  };
  page.objects = [line, text, labelled, image];
  return C.validateDocument(doc);
}

function documentOf(page) { return page.evaluate(() => IlapoEditor.getDocument()); }
function stateOf(page) { return page.evaluate(() => IlapoEditor.getState()); }

async function load(page, value, name = 'outline-ui.json') {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'application/json', buffer });
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, 'outline-ui-fixture');
  await settle(page);
}

async function worldPoint(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('canvas').getBoundingClientRect();
    const camera = IlapoEditor.getCamera();
    const screenX = canvas.left + (x - camera.x) / camera.width * canvas.width;
    const screenY = canvas.top + (y - camera.y) / camera.height * canvas.height;
    return { x: screenX, y: screenY, relativeX: screenX - canvas.left, relativeY: screenY - canvas.top };
  }, { x, y });
}

async function worldClick(page, x, y, modifiers = []) {
  const point = await worldPoint(page, x, y);
  await page.mouse.click(point.x, point.y, { modifiers });
  await settle(page);
}

async function worldTap(page, x, y) {
  const point = await worldPoint(page, x, y);
  await page.locator('#canvas').tap({ position: { x: point.relativeX, y: point.relativeY } });
  await settle(page);
}

async function selectObject(page, id, x, y, modifiers = []) {
  await page.locator('#canvas').focus(); await page.keyboard.press('v');
  if (await page.evaluate(id => IlapoEditor.getSelection().length === 1 && IlapoEditor.getSelection()[0] === id, id)) return;
  await worldClick(page, x, y, modifiers);
  if (!modifiers.includes('Shift')) assert.deepEqual(await page.evaluate(() => IlapoEditor.getSelection()), [id], `図形 ${id} を選択する`);
}

async function openOutline(page, menu = 'edit') {
  await page.locator(`[data-menu="${menu}"]`).click();
  await page.locator('#command-menu [data-action="outline"]').waitFor();
  await page.locator('#command-menu [data-action="outline"]').click();
  await page.locator('#outline-lines').waitFor();
}

async function waitPreview(page) {
  await page.waitForFunction(() => {
    const message = document.getElementById('outline-message')?.textContent || '';
    return /個の変換後の見た目を表示/.test(message) && !document.getElementById('inspector-submit')?.disabled;
  });
  await settle(page);
}

async function panelMetrics(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('inspector-panel').getBoundingClientRect();
    return { width: innerWidth, panelRight: panel.right, documentScroll: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, bodyClient: document.getElementById('inspector-body').clientWidth, bodyWidth: document.getElementById('inspector-body').scrollWidth };
  });
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const artifacts = '/private/tmp/illustslide-outline'; await fs.mkdir(artifacts, { recursive: true });
  const errors = [], failed = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor && !!window.IlapoOutline);
    const original = fixture(); await load(page, original);
    assert.deepEqual(await documentOf(page), original, 'fixture JSONをそのまま読み込む');
    assert.equal((await stateOf(page)).dirty, false);

    // パスメニューから開いた未確定線プレビューは文書・履歴・dirtyを変更しない。
    await selectObject(page, 'outline-line', 155, 80);
    await openOutline(page, 'path');
    assert.equal(await page.locator('#outline-lines').isChecked(), true);
    assert.equal(await page.locator('#outline-text').isChecked(), false);
    await waitPreview(page);
    assert.deepEqual(await documentOf(page), original, '線の未確定プレビューは文書を変更しない');
    assert.equal((await stateOf(page)).dirty, false, '未確定プレビューはdirtyを変更しない');
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, '未確定プレビューは履歴に入らない');
    const previewLine = await page.locator('#artwork [data-object="outline-line"] path').getAttribute('d');
    assert(previewLine && /z/i.test(previewLine), '線プレビューは閉じた塗りパスになる');
    await page.screenshot({ path: '/private/tmp/illustslide-outline-desktop.png' });
    await page.locator('#inspector-close').click(); await settle(page);
    assert.deepEqual(await documentOf(page), original, '閉じると未確定プレビューを破棄する');

    // 選択ポップアップの編集メニューから同じUIを開き、適用1回をUndo/Redo1回で戻す。
    await selectObject(page, 'outline-line', 155, 80);
    await openOutline(page, 'edit'); await waitPreview(page); await page.locator('#inspector-submit').click(); await settle(page);
    let doc = await documentOf(page); let outlinedLine = doc.pages[0].objects.find(object => object.id === 'outline-line');
    assert.equal(await page.locator('#inspector-panel').isHidden(), true, '確定後にアウトラインパネルを閉じる');
    assert.equal(outlinedLine.type, 'path'); assert.equal(outlinedLine.style.stroke, 'none'); assert.equal(outlinedLine.style.fill, '#2563EB'); assert.notEqual(outlinedLine.d, original.pages[0].objects[0].d, '線を塗りのある輪郭パスへ変換する');
    assert.equal((await page.evaluate(() => IlapoEditor.getSelection())).length, 1, '確定後も変換結果を選択する');
    await page.locator('[data-action="undo"]').click(); await settle(page); assert.deepEqual(await documentOf(page), original, '線の適用はUndo1回で元へ戻る');
    await page.locator('[data-action="redo"]').click(); await settle(page); assert.equal((await documentOf(page)).pages[0].objects.find(object => object.id === 'outline-line').style.fill, '#2563EB', 'Redo1回で線の変換を戻す');

    // 日本語・大小英字の文字を別フォントへ変換し、文字オブジェクトを複合パスへ置き換える。
    await load(page, original);
    await selectObject(page, 'outline-text', 150, 176);
    await openOutline(page, 'edit');
    assert.equal(await page.locator('#outline-text').isChecked(), true); assert.equal(await page.locator('#outline-lines').isChecked(), false);
    assert.equal(await page.locator('#outline-font').count(), 1); assert.equal(await page.locator('#outline-font').inputValue(), 'sans');
    await waitPreview(page);
    const sansPreview = await page.locator('#artwork [data-object="outline-text"] path').getAttribute('d');
    await page.locator('#inspector-resize').focus(); await page.keyboard.press('Home'); await settle(page);
    const compact = await panelMetrics(page);
    assert.equal(compact.bodyWidth <= compact.bodyClient + 1, true, `220pxパネル内部に横overflowを起こさない: ${JSON.stringify(compact)}`);
    await page.keyboard.press('End'); await settle(page);
    await page.locator('#outline-font').selectOption('serif'); await waitPreview(page);
    const serifPreview = await page.locator('#artwork [data-object="outline-text"] path').getAttribute('d');
    assert.notEqual(serifPreview, sansPreview, '変換用フォントの変更をプレビューへ反映する');
    const beforeTextApply = await documentOf(page); await page.locator('#inspector-submit').click(); await settle(page);
    doc = await documentOf(page); assert.equal(doc.pages[0].objects.some(object => object.id === 'outline-text' && object.type === 'text'), false, '確定後に元の文字オブジェクトを除く');
    const outlinedText = doc.pages[0].objects.find(object => object.id === 'outline-text');
    assert(outlinedText && outlinedText.type === 'path' && /[zZ]/.test(outlinedText.d), '文字を閉じた複合パスへ変換する');
    await page.locator('[data-action="undo"]').click(); await settle(page); assert.deepEqual(await documentOf(page), beforeTextApply, '文字の適用もUndo1回で未確定前へ戻る');
    await page.locator('[data-action="redo"]').click(); await settle(page); assert.equal((await documentOf(page)).pages[0].objects.some(object => object.type === 'text' && object.id === 'outline-text'), false, 'Redo後も文字をパスとして保持する');

    // 図形ラベルは本体と文字を同じグループのパスへ分け、画像はそのまま残す。
    await load(page, original);
    await selectObject(page, 'outline-label-shape', 450, 120);
    await openOutline(page, 'edit'); await waitPreview(page);
    const labelPreviewObjects = await page.locator('#artwork [data-object]').count(); assert(labelPreviewObjects >= 5, 'ラベルの本体と文字を分けたプレビューを表示する');
    await page.locator('#inspector-submit').click(); await settle(page);
    doc = await documentOf(page); const labelParts = doc.pages[0].objects.filter(object => object.id === 'outline-label-shape' || object.name.startsWith('ラベル付き図形（'));
    assert(labelParts.length >= 2 && labelParts.every(object => object.type === 'path'), '図形ラベルを本体とパスへ分解する');
    assert.equal(new Set(labelParts.map(object => object.group)).size, 1, '分解した本体とラベルを同じグループにする');
    assert.equal(doc.pages[0].objects.find(object => object.id === 'outline-image').type, 'image', '画像はアウトライン化せず保持する');

    // 390px・dark・xlarge・タッチでも右パネル内のoverflowを起こさず、Escapeで閉じられる。
    await page.setViewportSize({ width: 390, height: 736 });
    await page.locator('#inspector-toggle').click(); await page.locator('#inspector-tabs [data-inspector-section="view"]').click();
    await page.locator('#view-theme').selectOption('dark'); await page.locator('#view-size').selectOption('xlarge'); await inspectorSubmit(page);
    await load(page, original); await selectObject(page, 'outline-label-shape', 450, 120); await openOutline(page, 'edit'); await waitPreview(page);
    const narrow = await panelMetrics(page); assert(narrow.documentScroll <= narrow.width + 1 && narrow.bodyScroll <= narrow.width + 1 && narrow.panelRight <= narrow.width + 1, `390px dark xlargeで横overflowしない: ${JSON.stringify(narrow)}`);
    await page.screenshot({ path: '/private/tmp/illustslide-outline-390.png', fullPage: true });
    await page.locator('#outline-font').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Escape'); await settle(page); assert(await page.locator('#inspector-panel').isHidden(), 'Escapeでアウトラインパネルを閉じる');

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true });
    const touch = await touchContext.newPage(); touch.setDefaultTimeout(15000); touch.on('pageerror', error => errors.push(error.message));
    await touch.goto(url); await touch.waitForFunction(() => !!window.IlapoEditor); await load(touch, original);
    await touch.locator('#palette-toggle').tap(); await touch.locator('#palette-close').tap();
    await worldTap(touch, 150, 176);
    assert.deepEqual(await touch.evaluate(() => IlapoEditor.getSelection()), ['outline-text'], 'タッチでも日本語文字を確実に選択する');
    await touch.locator('[data-menu="edit"]').tap(); await touch.locator('#command-menu [data-action="outline"]').tap(); await touch.locator('#outline-lines').waitFor();
    await waitPreview(touch); assert(await touch.locator('#outline-preview').isVisible(), 'タッチでもアウトラインの再試行ボタンを表示する');
    await touch.locator('#inspector-submit').tap(); await settle(touch);
    assert.equal((await documentOf(touch)).pages[0].objects.some(object => object.id === 'outline-text' && object.type === 'path'), true, 'タッチで文字のアウトライン化を適用する');
    await touch.keyboard.press('Meta+z'); await settle(touch);
    assert.equal((await documentOf(touch)).pages[0].objects.some(object => object.id === 'outline-text' && object.type === 'text'), true, 'タッチでの適用をUndo1回で戻す');
    await touchContext.close();

    // フォント取得の一時失敗は文書を保持し、再試行で同じ対象を再処理できる。
    const flakyContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const flaky = await flakyContext.newPage(); flaky.setDefaultTimeout(15000);
    let failedOnce = false;
    await flaky.route('**/fonts/NotoSansJP-Regular.woff', async route => {
      if (!failedOnce) { failedOnce = true; await route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary font failure' }); }
      else await route.continue();
    });
    await flaky.goto(url); await flaky.waitForFunction(() => !!window.IlapoEditor); await load(flaky, original);
    await selectObject(flaky, 'outline-text', 150, 176); await openOutline(flaky, 'edit');
    await flaky.waitForFunction(() => /フォントを読み込めませんでした/.test(document.getElementById('outline-message')?.textContent || '') && document.getElementById('inspector-submit')?.disabled);
    assert.deepEqual(await documentOf(flaky), original, 'フォント取得失敗時も文書を保持する');
    assert.equal((await stateOf(flaky)).dirty, false, 'フォント取得失敗時もdirtyを変更しない');
    await flaky.locator('#outline-preview').click(); await waitPreview(flaky);
    await flaky.locator('#inspector-close').click(); await flakyContext.close();

    // 保留中の非同期結果は、閉じた対象へ遡って反映しない。
    const staleContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const stale = await staleContext.newPage(); stale.setDefaultTimeout(15000);
    const releases = [];
    await stale.route('**/fonts/*.woff', async route => {
      await new Promise(resolve => releases.push(resolve));
      await route.continue();
    });
    await stale.goto(url); await stale.waitForFunction(() => !!window.IlapoEditor); await load(stale, original);
    await selectObject(stale, 'outline-text', 150, 176); await openOutline(stale, 'edit');
    await stale.locator('#outline-message').waitFor();
    await stale.locator('#inspector-close').click();
    const staleBefore = await documentOf(stale);
    assert.equal(await stale.locator('#artwork [data-object="outline-text"] text').count(), 1, '閉じた直後のartworkは元の文字を表示する');
    // 閉じたあとに開き直しても、最初の保留結果が新しいパネルへ戻らない。
    await openOutline(stale, 'edit'); await stale.locator('#outline-message').waitFor(); await stale.locator('#inspector-close').click();
    for (const release of releases.splice(0)) release();
    await stale.waitForTimeout(600); assert.deepEqual(await documentOf(stale), staleBefore, '閉じたパネルのフォント結果を文書へ反映しない');
    assert.equal(await stale.locator('#artwork [data-object="outline-text"] text').count(), 1, '再オープン後の古い結果も元の文字を置き換えない');

    // 対象切替とResetで発生した再構築のあとも、古い対象の結果を表示しない。
    await openOutline(stale, 'edit'); await stale.locator('#outline-message').waitFor();
    await selectObject(stale, 'outline-label-shape', 450, 120);
    await stale.waitForTimeout(200);
    assert.match(await stale.locator('#inspector-body').textContent(), /ラベル付き図形/, '対象切替後は新しい対象のパネルになる');
    await stale.locator('#inspector-reset').click(); await stale.waitForTimeout(200); await stale.locator('#inspector-close').click();
    for (const release of releases.splice(0)) release();
    await stale.waitForTimeout(600);
    assert.equal(await stale.locator('#artwork [data-object="outline-text"] text').count(), 1, '対象切替・Reset後に古い文字パスを表示しない');
    await staleContext.close();

    assert.deepEqual(errors, [], errors.join('\n')); assert.deepEqual(failed, [], failed.join('\n'));
    console.log('illustSlide outline UI browser tests passed. Artifacts: ' + artifacts);
  } finally {
    await context.close(); await browser.close(); if (!supplied) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
