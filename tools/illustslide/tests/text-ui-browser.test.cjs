/* illustSlide③: 文字インスペクター、図形ラベル、入出力、発表を実Chromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const C = require('../core.js');
const { startPresentation } = require('./ui-helpers.cjs');
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
const clone = value => JSON.parse(JSON.stringify(value));

function style(extra = {}) {
  return { ...C.DEFAULT_STYLE, fill: '#172B4D', stroke: 'none', strokeWidth: 0, fontSize: 24, fontFamily: 'sans-serif', bold: false, italic: false, ...extra };
}

function fixture() {
  const doc = C.createDocument();
  doc.id = 'text-ui-fixture'; doc.name = '文字UI確認'; doc.version = 4;
  const page = doc.pages[0]; page.name = '文字とラベル'; page.board = { width: 640, height: 420, unit: 'px', infinite: false };
  const labelled = C.makeShape('roundrect', 70, 100, 230, 130, { fill: '#D9EAF7', stroke: '#2563EB', strokeWidth: 3, fontSize: 18 });
  labelled.id = 'labelled-shape'; labelled.name = 'ラベル付き図形';
  labelled.label = { runs: [{ text: '図形のラベル', script: 'normal' }], style: style({ fill: '#123456', fontSize: 18, bold: true }), align: 'center', padding: 8 };
  const other = C.makeShape('rect', 380, 105, 170, 110, { fill: '#FDE68A', stroke: '#B45309', strokeWidth: 2, fontSize: 18 });
  other.id = 'other-shape'; other.name = '切替対象';
  const existing = C.makeText(100, 315, '既存の文字', style({ fill: '#7C3AED', fontSize: 22 }));
  existing.id = 'existing-text'; existing.name = '既存テキスト'; existing.layout = { width: 220, align: 'left' };
  page.objects = [labelled, other, existing];
  return C.validateDocument(doc);
}

function box(page, selector) {
  return page.locator(selector).boundingBox();
}

async function load(page, value, name = 'text-ui.json') {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  await page.locator('#file-input').setInputFiles({ name, mimeType: name.endsWith('.zip') ? 'application/zip' : 'application/json', buffer });
  if (await page.locator('#replace-discard').isVisible()) await page.locator('#replace-discard').click();
  await page.waitForFunction(id => IlapoEditor.getDocument().id === id, 'text-ui-fixture');
  await settle(page);
}

async function documentOf(page) { return page.evaluate(() => IlapoEditor.getDocument()); }
async function selectObject(page, id) {
  await page.locator('#canvas').focus(); await page.keyboard.press('v');
  if(await page.evaluate(id=>IlapoEditor.getSelection().length===1&&IlapoEditor.getSelection()[0]===id,id)){await settle(page);return;}
  await page.locator(`#artwork [data-object="${id}"]`).click(); await settle(page);
}
async function openTextSection(page) {
  await page.locator('#inspector-tabs [data-inspector-section="text"]').click();
  await page.locator('#text-input').waitFor(); await settle(page);
}
function textEditButton(page) {
  return page.locator('#text-options [data-action="text-edit"], #text-options[data-action="text-edit"]').first();
}
async function closeInspector(page) {
  if (await page.locator('#inspector-panel').isVisible()) { await page.locator('#inspector-close').click(); await settle(page); }
}
async function textMarkup(page, id) {
  return page.locator(`#artwork [data-object="${id}"] text`).evaluate(el => ({
    text: el.textContent,
    lines: [...el.querySelectorAll('tspan')].map(t => ({ x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')), text: t.textContent })),
    fontSize: el.getAttribute('font-size')
  }));
}
async function labelBox(page, id) {
  return page.locator(`#artwork [data-object="${id}"] [data-ilapo-shape-label] text`).evaluate(el => {
    const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, text: el.textContent };
  });
}
async function setSelection(page, start, end) {
  await page.locator('#text-input').evaluate((el, range) => { el.focus(); el.setSelectionRange(range[0], range[1]); }, [start, end]);
}
async function viewSettings(page) {
  if (!await page.locator('#inspector-panel').isVisible()) await page.locator('#inspector-toggle').click();
  await page.locator('#inspector-tabs [data-inspector-section="view"]').click(); await settle(page);
}

(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = supplied || `http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const artifacts = '/private/tmp/illustslide-text-qa'; await fs.mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], failed = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.IlapoEditor && !!window.IlapoSVG);
    const original = fixture(); await load(page, original);
    const before = await documentOf(page);
    assert.deepEqual(before, original, 'fixture JSON is loaded without changing the document');
    assert.equal((await page.evaluate(() => IlapoEditor.getState())).dirty, false);

    // 新規の空文字は文書へ追加せず、入力後はすぐ保存する。
    await page.locator('[data-tool="text"]').click();
    await page.locator('#canvas').click({ position: { x: 320, y: 260 } }); await settle(page);
    assert(await page.locator('#inspector-panel').isVisible(), '文字ツールは右の文字インスペクターを開く');
    await page.locator('#text-input').waitFor();
    assert.deepEqual(await documentOf(page), before, '空の新規文字は文書へ入れない');
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, '空の新規文字はUndoを増やさない');
    assert.equal((await page.evaluate(() => IlapoEditor.getState())).dirty, false);
    assert(await page.locator('#inspector-live-note').isVisible(), '文字フォームも即時反映の案内を表示する');
    assert(await page.locator('#inspector-submit').isHidden() && await page.locator('#inspector-reset').isHidden(), '文字フォームには適用・変更を戻すを表示しない');

    const sample = '日本語😀\n\nH2O・x2';
    await page.locator('#text-input').fill(sample); await setSelection(page, 8, 9); await page.locator('[data-script="sub"]').click();
    await setSelection(page, 12, 13); await page.locator('[data-script="super"]').click();
    await page.locator('#text-wrap').check(); await page.locator('#text-width').fill('120');
    await page.locator('[data-text-align="center"]').click();
    await page.locator('#text-font-size').fill('28'); await page.locator('#text-font-family').selectOption('serif');
    await page.locator('#text-bold').check(); await page.locator('#text-italic').check();
    await page.locator('#inspector-body details summary').click();
    await page.locator('#text-color-hex').fill('#0F766E'); await settle(page);
    const preview = await page.locator('#text-preview').textContent();
    assert(preview.includes('日本語😀') && preview.includes('H2O・x2'), '入力中プレビューがUnicodeと空行を保持する');
    const previewLines = await page.locator(`#artwork [data-object] text tspan`).count();
    assert(previewLines >= 2, 'width設定で折り返しをプレビューする');
    const centered = await page.locator('#artwork text').evaluateAll(els => els.map(el => [...el.querySelectorAll('tspan')].map(t => Number(t.getAttribute('x')))));
    assert(centered.some(lines => lines.length >= 2 && lines.some((x, i, a) => i && x !== a[0])), `中央揃えで行ごとのx座標が変わる: ${JSON.stringify(centered)}`);
    let doc = await documentOf(page); const created = doc.pages[0].objects.find(o => o.type === 'text' && o.id !== 'existing-text');
    assert(created, '最初の文字入力で同じIDの文字を文書へ追加する'); assert.deepEqual(created.runs.map(r => r.text).join(''), sample);
    assert(created.runs.some(r => r.script === 'sub') && created.runs.some(r => r.script === 'super'));
    assert.deepEqual(created.layout, { width: 120, align: 'center' }); assert.equal(doc.version, 4, 'v4文字機能を保存する');

    // IME中はプレビューを更新せず、Enterは改行、Deleteは図形削除にならない。
    const composingPreview = await page.locator('#text-preview').textContent();
    await page.locator('#text-input').evaluate(el => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, 'IME入力中'); el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    });
    await settle(page); assert.equal(await page.locator('#text-preview').textContent(), composingPreview, 'IME composition中はプレビューを更新しない');
    await page.locator('#text-input').dispatchEvent('compositionend'); await page.locator('#text-input').dispatchEvent('input');
    await settle(page); const imePreview = await page.locator('#text-preview').textContent(); assert(imePreview.includes('IME入力中'), `compositionendで確定した入力をプレビューする: ${imePreview}`);
    await page.locator('#text-input').press('End'); await page.locator('#text-input').press('Enter');
    assert((await page.locator('#text-input').inputValue()).includes('\n'), 'Enterは入力欄の改行に使える');
    const draftCount = (await documentOf(page)).pages[0].objects.length; await page.locator('#text-input').press('Delete');
    assert.equal((await documentOf(page)).pages[0].objects.length, draftCount, '文字入力中のDeleteは図形を削除しない');
    // 同じ欄でも、いったん別欄へ移動すると次の連続入力は別Undo単位になる。
    await page.locator('#text-font-size').focus(); await page.locator('#text-input').focus();
    const textBeforeUndo = await page.locator('#text-input').inputValue();
    await page.locator('#text-input').press('End'); await page.keyboard.insertText('AB'); await settle(page);
    await page.keyboard.press('Meta+z'); await settle(page);
    doc = await documentOf(page);
    assert.equal(doc.pages[0].objects.find(o => o.id === created.id).runs.map(run => run.text).join(''), textBeforeUndo, '同じ文字欄の連続入力は⌘Z 1回で戻る');
    await page.keyboard.press('Shift+Meta+z'); await settle(page);
    assert((await documentOf(page)).pages[0].objects.find(o => o.id === created.id).runs.map(run => run.text).join('').endsWith('AB'), '⇧⌘Zで文字入力をやり直せる');

    // 以降の既存オブジェクトの操作は、重なりを避けるため元の配置から確認する。
    await load(page, original); await closeInspector(page);

    // 既存文字・図形は選択ポップアップから同じ右パネルを開ける。doubleclickも確認する。
    await selectObject(page, 'existing-text');
    assert(await page.locator('#text-options').isVisible(), '既存文字に文字操作ポップアップを表示する');
    await textEditButton(page).click(); await openTextSection(page);
    assert.equal(await page.locator('#text-input').inputValue(), '既存の文字'); await closeInspector(page);
    await selectObject(page, 'labelled-shape');
    const shapePoint = await page.evaluate(({ x, y }) => { const c = IlapoEditor.getCamera(), r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left + (x - c.x) / c.width * r.width, y: r.top + (y - c.y) / c.height * r.height }; }, { x: 100, y: 130 });
    await page.mouse.dblclick(shapePoint.x, shapePoint.y); await settle(page);
    assert(await page.locator('#text-input').isVisible(), 'closed shapeのdoubleclickも文字パネルを開く');
    assert.equal(await page.locator('#text-padding').count(), 1, '図形ラベルにはpadding欄がある');

    // 図形ラベルを編集し、移動・非等方resize・回転・複製・Undoで追従する。
    const labelText = '中央ラベル😀 長いテキストで折り返し幅を確認するための文章です';
    await page.locator('#text-input').fill(labelText); await page.locator('#text-padding').fill('12'); await page.locator('[data-text-align="left"]').click(); await settle(page);
    doc = await documentOf(page); let shape = doc.pages[0].objects.find(o => o.id === 'labelled-shape');
    assert.equal(shape.label.align, 'left'); assert.equal(shape.label.padding, 12); assert.equal(shape.label.runs[0].text, labelText);
    await closeInspector(page); await selectObject(page, 'labelled-shape');
    let labelBefore = await labelBox(page, 'labelled-shape'); const shapeBefore = clone((await documentOf(page)).pages[0].objects.find(o => o.id === 'labelled-shape'));
    await page.locator('#canvas').focus(); await page.keyboard.press('ArrowRight'); await settle(page);
    let labelAfter = await labelBox(page, 'labelled-shape'); assert(labelAfter.x > labelBefore.x, '図形移動でラベルも移動する');
    await page.locator('[data-handle="se"]').waitFor(); const handle = await box(page, '[data-handle="se"]');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 70, handle.y + handle.height / 2, { steps: 5 }); await page.mouse.up(); await settle(page);
    doc = await documentOf(page); shape = doc.pages[0].objects.find(o => o.id === 'labelled-shape');
    assert(shape.matrix[0] !== shapeBefore.matrix[0] || shape.matrix[3] !== shapeBefore.matrix[3], '図形の非等方resizeを適用する');
    assert.equal(shape.label.style.fontSize, shapeBefore.label.style.fontSize, '非等方resizeでラベル文字サイズを維持する');
    const resizedLabel = await labelBox(page, 'labelled-shape'); assert(resizedLabel.width !== labelAfter.width, '非等方resizeでラベル幅が変わる');
    const rotate = await box(page, '[data-handle="rotate"]'); await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2); await page.mouse.down(); await page.mouse.move(rotate.x + 25, rotate.y - 18, { steps: 5 }); await page.mouse.up(); await settle(page);
    doc = await documentOf(page); assert.notDeepEqual(doc.pages[0].objects.find(o => o.id === 'labelled-shape').matrix, shape.matrix, '回転を適用してもラベルを保持する');
    await page.keyboard.press('Meta+d'); await settle(page); doc = await documentOf(page); const copies = doc.pages[0].objects.filter(o => o.type === 'path' && o.label);
    assert.equal(copies.length, 2, 'ラベル付き図形の複製を作る'); assert.equal(await page.locator('#artwork [data-ilapo-shape-label]').count(), 2, '複製にもラベルを描画する');
    await page.keyboard.press('Meta+z'); await settle(page); assert.equal((await documentOf(page)).pages[0].objects.filter(o => o.type === 'path' && o.label).length, 1, '複製はUndoで戻る');

    // 対象切替とCloseの後も、即時入力は元の対象に保存済みである。
    await selectObject(page, 'labelled-shape'); await textEditButton(page).click(); await openTextSection(page);
    await page.locator('#text-input').fill('破棄される変更');
    await selectObject(page, 'other-shape'); await settle(page); assert.equal((await documentOf(page)).pages[0].objects.find(o => o.id === 'labelled-shape').label.runs[0].text, '破棄される変更', '対象切替前の入力は元の図形へ保存する');
    await textEditButton(page).click(); await openTextSection(page); await page.locator('#text-input').fill('閉じても保持'); const unchanged = await documentOf(page); await page.locator('#inspector-close').click(); await settle(page); assert.deepEqual(await documentOf(page), unchanged, 'Closeは即時変更を取り消さない');

    await selectObject(page, 'other-shape'); await textEditButton(page).click();
    await page.locator('#text-input').fill('新しい説明'); await settle(page);
    assert.equal((await documentOf(page)).pages[0].objects.find(o=>o.id==='other-shape').label.runs[0].text,'新しい説明','文字のない図形にもラベルを追加できる');
    await page.locator('#text-remove-label').click(); await settle(page);
    assert.equal((await documentOf(page)).pages[0].objects.find(o=>o.id==='other-shape').label,undefined,'本文だけを削除できる');
    await closeInspector(page); await page.locator('[data-action="undo"]').click(); await settle(page);
    assert((await documentOf(page)).pages[0].objects.find(o=>o.id==='other-shape').label,'本文削除もUndoで戻せる');
    await page.locator('[data-action="undo"]').click(); await settle(page);

    // 最小幅の右パネルでも色・折り返し・フォントを操作できる。
    await selectObject(page, 'existing-text'); await textEditButton(page).click();
    await page.screenshot({path:'/private/tmp/illustslide-text-panel.png'});
    await page.locator('#inspector-resize').focus(); await page.keyboard.press('Home');
    await page.locator('#text-input').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'text-input');
    await page.locator('#inspector-body details summary').click();
    await page.locator('[data-text-rgb="R"]').scrollIntoViewIfNeeded();
    const smallest=await page.locator('#inspector-body').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
    assert(smallest.scroll<=smallest.client+1,'幅220pxの文字パネル内も横overflowなし');
    await page.locator('#text-input').focus(); await page.keyboard.press('Escape'); await settle(page);
    assert(await page.locator('#inspector-panel').isHidden(),'文字入力欄のEscapeでパネルを閉じられる');

    // 390px・dark・xlarge・タッチ入力で横overflowを起こさない。
    await page.setViewportSize({ width: 390, height: 736 }); await viewSettings(page); await page.locator('#view-theme').selectOption('dark'); await page.locator('#view-size').selectOption('xlarge'); await settle(page);
    await selectObject(page, 'existing-text'); await textEditButton(page).click(); await openTextSection(page);
    const narrow = await page.evaluate(() => { const panel = document.getElementById('inspector-panel').getBoundingClientRect(); return { width: innerWidth, panelRight: panel.right, scroll: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, input: document.getElementById('text-input').getBoundingClientRect() }; });
    assert(narrow.scroll <= narrow.width + 1 && narrow.bodyScroll <= narrow.width + 1 && narrow.panelRight <= narrow.width + 1, '390px dark xlarge文字パネルは横overflowなし');
    await page.screenshot({ path: '/private/tmp/illustslide-text-390.png', fullPage: true }); await closeInspector(page);
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true, acceptDownloads: true });
    const touch = await touchContext.newPage(); touch.setDefaultTimeout(12000); touch.on('pageerror', error => errors.push(error.message));
    await touch.goto(url); await touch.waitForFunction(() => !!window.IlapoEditor); await load(touch, original);
    await touch.locator('#palette-toggle').tap(); await touch.locator('[data-tool="text"]').tap(); await touch.locator('#canvas').tap({ position: { x: 170, y: 260 } }); await touch.locator('#text-input').tap(); await touch.keyboard.insertText('タッチ入力');
    assert((await touch.locator('#text-input').inputValue()).includes('タッチ入力'), 'タッチキーボード相当の文字入力ができる');
    assert(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await touchContext.close();

    // v4 ZIP往復と発表で、label・align・runsを保持する。
    await page.setViewportSize({ width: 1280, height: 820 }); await load(page, await documentOf(page));
    await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
    await page.locator('[data-menu="save"]').click(); const downloadPromise = page.waitForEvent('download'); await page.locator('#command-menu').getByRole('button', { name: 'ローカルファイルに保存…', exact: true }).click();
    const download = await downloadPromise; const zipPath = '/private/tmp/illustslide-text-roundtrip.illustslide.zip'; await download.saveAs(zipPath); const zip = await fs.readFile(zipPath); assert(zip.length > 100);
    await load(page, zip, 'text-v4.illustslide.zip'); const resumed = await documentOf(page); const resumedShape = resumed.pages[0].objects.find(o => o.id === 'labelled-shape'); const resumedText = resumed.pages[0].objects.find(o => o.id === 'existing-text');
    assert.equal(resumed.version, 4); assert.equal(resumedShape.label.align, 'left'); assert.equal(resumedShape.label.padding, 12); assert.equal(resumedShape.label.runs[0].text, '破棄される変更'); assert.equal(resumedText.layout.align, 'left'); assert.equal(resumedText.layout.width, 220);
    await page.screenshot({ path: '/private/tmp/illustslide-text-desktop.png' }); const presentationBefore = clone(resumed); await startPresentation(page, true); await page.locator('#ilapo-presentation').waitFor();
    assert(await page.locator('.ilapo-present-paper [data-ilapo-shape-label] text').count() >= 1, '発表表示でも図形ラベルを表示する');
    assert((await page.locator('.ilapo-present-paper').textContent()).includes('破棄される変更'), '発表表示でも即時編集したラベル文字を保持する');
    assert((await page.locator('.ilapo-present-paper').textContent()).includes('既存の文字'), '発表表示でもstandalone文字を表示する');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('ilapo-presentation')); assert.deepEqual(await documentOf(page), presentationBefore, '発表終了で文書を変更しない');

    assert.deepEqual(errors, [], errors.join('\n')); assert.deepEqual(failed, [], failed.join('\n'));
    console.log('illustSlide text UI browser tests passed. Artifacts: ' + artifacts);
  } finally {
    await context.close(); await browser.close(); if (!supplied) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
