// Chrome/WebKit UI checks for lc02 truth panel, alignment and smart snapping.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const errors = [];
const artifacts = await mkdtemp(join(tmpdir(), 'logic-alignment-check-'));
console.log(`Browser artifacts: ${artifacts}`);

async function ready(browser, viewport, options = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, ...options });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(baseURL)) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(new URL('lc02.html', baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await page.locator('#logic-editor .logic-editor__actions--files').waitFor();
  await page.waitForFunction(() => window.logicWorkbenchEditor?.options?.enableAlignment === true);
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

const state = page => page.evaluate(() => window.logicWorkbenchEditor.snapshot());
const center = async locator => {
  const box = await locator.boundingBox();
  assert.ok(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const canvasPoint = (page, x, y) => page.locator('.logic-editor__canvas').evaluate((svg, point) => {
  const result = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM());
  return { x: result.x, y: result.y };
}, { x, y });
async function drag(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function toolbarAndAlignment(page, name, viewportWidth) {
  // 共通ヘッダーとスライドバーのResizeObserverによる再計測を待つ。
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth + 1);
  const toolbar = page.locator('.logic-editor__toolbar');
  const palette = page.locator('.logic-editor__palette');
  const layout = await page.evaluate(() => {
    const palette = document.querySelector('.logic-editor__palette').getBoundingClientRect();
    const actions = document.querySelector('.logic-editor__actions').getBoundingClientRect();
    const toolbar = document.querySelector('.logic-editor__toolbar').getBoundingClientRect();
    const shell = document.querySelector('.logic-editor__toolbar');
    return { palette, actions, toolbar, scrollWidth: document.documentElement.scrollWidth,
      actionsFirst: shell.firstElementChild.classList.contains('logic-editor__actions') };
  });
  assert.ok(layout.actions.bottom <= layout.palette.top + 1, `${name} ${viewportWidth}: actions are above palette`);
  assert.ok(layout.scrollWidth <= viewportWidth + 1, `${name} ${viewportWidth}: no horizontal overflow`);
  assert.ok(layout.actionsFirst, 'DOM and Tab order match the visible row order');
  assert.ok(await toolbar.getByRole('button', { name: '回路全体を自動整列', exact: true }).count() === 1);
  assert.ok(await palette.getByRole('button', { name: 'ANDゲートを追加', exact: true }).count() === 1);
  await page.screenshot({ path: join(artifacts, `${name}-${viewportWidth}.png`) });
}

async function alignmentChecks(page, name) {
  await page.evaluate(() => {
    window.logicWorkbenchEditor.loadExpression('(A-B)_C');
    window.logicWorkbenchEditor.setInputValues({ A: 1, B: 0, C: 1 });
  });
  const before = await state(page);
  const beforeTruth = await page.evaluate(() => window.logicWorkbenchEditor.getAnalysis().truthCode);
  const align = page.getByRole('button', { name: '回路全体を自動整列', exact: true });
  await align.click();
  const arranged = await state(page);
  assert.deepEqual(arranged.graph.wires, before.graph.wires, `${name}: alignment preserves wires`);
  assert.deepEqual(arranged.inputValues, before.inputValues, `${name}: alignment preserves input values`);
  assert.deepEqual(arranged.graph.nodes.map(node => ({ id: node.id, type: node.type, name: node.name })), before.graph.nodes.map(node => ({ id: node.id, type: node.type, name: node.name })));
  assert.equal(await page.evaluate(() => window.logicWorkbenchEditor.getAnalysis().truthCode), beforeTruth, `${name}: truth table preserved`);
  const directGateWires = await page.evaluate(() => {
    const editor = window.logicWorkbenchEditor;
    return editor.graph.wires.filter(wire => editor.findNode(wire.from).type !== 'input')
      .map(wire => editor.currentWireRoutes.get(wire.id).segments.map(segment => segment.axis));
  });
  assert.deepEqual(directGateWires, [['h'], ['h']], `${name}: AND→OR input and OR→F use straight wires, not doglegs`);
  const arrangedAgain = await state(page);
  await align.click();
  assert.deepEqual(await state(page), arrangedAgain, `${name}: alignment is idempotent`);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.deepEqual(await state(page), before, `${name}: one Undo restores pre-alignment snapshot`);

  // Two gates can snap to one another on y while remaining far enough apart on x.
  await page.evaluate(() => window.logicWorkbenchEditor.loadExpression('A-B'));
  await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
  await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
  const afterAdd = await state(page);
  const gates = afterAdd.graph.nodes.filter(node => node.type === 'OR');
  const sourcePoint = await canvasPoint(page, gates[1].x, gates[1].y);
  const target = await canvasPoint(page, 550, gates[0].y + 4);
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.waitForTimeout(50);
  assert.ok(await page.locator('.logic-editor-alignment-guide[data-axis="y"]').count() > 0, `${name}: y alignment guide appears`);
  await page.screenshot({ path: join(artifacts, `${name}-guide.png`) });
  await page.mouse.up();
  const snapped = await state(page);
  const moved = snapped.graph.nodes.find(node => node.id === gates[1].id);
  const reference = snapped.graph.nodes.find(node => node.id === gates[0].id);
  assert.equal(moved.y, reference.y, `${name}: y center snaps`);
  assert.equal(await page.locator('.logic-editor-alignment-guide').count(), 0, `${name}: guide clears on pointerup`);

  // Escape and pointercancel restore the original position.
  const escapeBefore = await state(page);
  const escapeStart = await canvasPoint(page, moved.x, moved.y);
  const escapeEnd = await canvasPoint(page, moved.x + 70, moved.y + 35);
  await page.mouse.move(escapeStart.x, escapeStart.y); await page.mouse.down();
  await page.mouse.move(escapeEnd.x, escapeEnd.y, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await state(page), escapeBefore, `${name}: Escape restores moved node`);
  const cancelStart = await canvasPoint(page, moved.x, moved.y);
  await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down();
  await page.mouse.move(escapeEnd.x, escapeEnd.y, { steps: 5 });
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.logicWorkbenchEditor.drag.pointerId })));
  await page.mouse.up();
  assert.deepEqual(await state(page), escapeBefore, `${name}: pointercancel restores moved node`);

  // Alt bypasses snapping; a one-pixel input click still toggles only the input value.
  const altStart = await canvasPoint(page, moved.x, moved.y);
  const altTarget = await canvasPoint(page, 550, reference.y + 10);
  await page.keyboard.down('Alt'); await page.mouse.move(altStart.x, altStart.y); await page.mouse.down();
  await page.mouse.move(altTarget.x, altTarget.y, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Alt');
  const altMoved = (await state(page)).graph.nodes.find(node => node.id === moved.id);
  assert.notEqual(altMoved.y, reference.y, `${name}: Alt bypasses y snap`);
  await page.evaluate(() => window.logicWorkbenchEditor.loadExpression('A-B'));
  const inputBefore = await state(page);
  const inputNode = inputBefore.graph.nodes.find(node => node.id === 'input-A');
  const inputPoint = await canvasPoint(page, inputNode.x, inputNode.y);
  await page.mouse.move(inputPoint.x, inputPoint.y); await page.mouse.down();
  await page.mouse.move(inputPoint.x + 1, inputPoint.y + 1); await page.mouse.up();
  const inputAfter = await state(page);
  assert.deepEqual(inputAfter.graph, inputBefore.graph, `${name}: input click does not move node`);
  assert.equal(inputAfter.inputValues.A, inputBefore.inputValues.A ? 0 : 1, `${name}: input click toggles value only`);
}

async function snapThresholdChecks(page, name) {
  await page.evaluate(() => {
    const editor = window.logicWorkbenchEditor;
    editor.graph = { nodes: [
      { id: 'input-A', type: 'input', name: 'A', x: 72, y: 90 },
      { id: 'snap-anchor', type: 'OR', x: 300, y: 140 },
      { id: 'snap-moving', type: 'AND', x: 470, y: 350 },
      { id: 'output-F', type: 'output', name: 'F', x: 828, y: 260 }
    ], wires: [] };
    editor.inputNames = ['A']; editor.inputValues = { A: 0 };
    editor.resetHistory(); editor.render();
  });
  const before = await state(page);
  const scale = await page.locator('.logic-editor__canvas').evaluate(svg => svg.getScreenCTM().a);
  const start = await canvasPoint(page, 470, 350);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (const [distance, snapped] of [[5, true], [11, true], [17, false]]) {
    const point = await canvasPoint(page, 300 + distance / scale, 350);
    await page.mouse.move(point.x, point.y, { steps: 4 });
    const node = (await state(page)).graph.nodes.find(node => node.id === 'snap-moving');
    if (snapped) assert.equal(node.x, 300, `${name}: acquire/hold x center at ${distance}px`);
    else assert.ok(node.x > 310, `${name}: release x center beyond 14px`);
    assert.equal(await page.locator('.logic-editor-alignment-guide[data-axis="x"]').count(), snapped ? 1 : 0);
  }
  await page.mouse.up();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.deepEqual(await state(page), before, 'snapped drag has one Undo entry');
  const palette = page.getByRole('button', { name: 'NOTゲートを追加', exact: true });
  await drag(page, await center(palette), await canvasPoint(page, 303, 430));
  assert.equal((await state(page)).graph.nodes.at(-1).x, 300, 'palette drop also snaps to a column');
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.deepEqual(await state(page), before, 'palette alignment is undoable');
  await page.evaluate(() => window.logicWorkbenchEditor.loadExpression('A-B'));
}

async function truthPanelChecks(page, name, viewportWidth) {
  await page.evaluate(() => window.logicWorkbenchEditor.loadExpression('A-B'));
  const panel = page.locator('#logic-workbench-table-panel');
  await expect(panel).toBeVisible();
  const widthBefore = (await page.locator('#logic-editor').boundingBox()).width;
  const before = await state(page);
  const hide = page.getByRole('button', { name: '真理値表を折りたたむ', exact: true });
  await expect(hide).toHaveAttribute('aria-controls', 'logic-workbench-table-panel');
  await hide.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  const show = page.getByRole('button', { name: '真理値表を表示', exact: true });
  await expect(show).toBeFocused();
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  assert.deepEqual(await state(page), before, `${name}: collapsing table does not edit circuit`);
  if (viewportWidth > 620) {
    await expect.poll(async () => (await page.locator('#logic-editor').boundingBox()).width).toBeGreaterThan(widthBefore + 100);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth + 1);
  await page.screenshot({ path: join(artifacts, `${name}-${viewportWidth}-table-collapsed.png`) });
  for (const theme of ['light', 'dark', 'system']) {
    for (const size of ['standard', 'large', 'xlarge']) {
      await page.evaluate(({ theme, size }) => {
        siteTheme.setPreference(theme); siteTextSize.setPreference(size);
      }, { theme, size });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth + 1);
      const buttonBox = await show.boundingBox();
      assert.ok(buttonBox.width >= 44 && buttonBox.height >= 44, 'table toggle has a full-size target at all text sizes');
      await expect(panel).toBeHidden();
    }
  }
  await page.evaluate(() => { siteTheme.setPreference('light'); siteTextSize.setPreference('standard'); });
  if (viewportWidth > 620) {
    await page.locator('.lesson-slide-deck__fullscreen').click();
    await page.getByRole('button', { name: 'スライドを全画面表示', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/is-lesson-fullscreen/);
    await expect(panel).toBeHidden();
    await show.click();
    await expect(panel).toBeVisible();
    await hide.click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: '全画面表示を終了', exact: true }).click();
  }
  await page.evaluate(() => window.logicWorkbenchEditor.setInputValues({ A: 1, B: 1 }));
  await show.press('Space');
  await expect(panel).toBeVisible();
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  assert.deepEqual(await panel.locator('tr[aria-current="true"] td').allTextContents(), ['1', '1', '1'], `${name}: reopened table highlights latest inputs`);
  await panel.locator('tbody tr').first().press('Enter');
  assert.deepEqual((await state(page)).inputValues, { A: 0, B: 0 }, 'truth row keyboard interaction still updates inputs');
  await page.getByRole('button', { name: '回路全体を自動整列', exact: true }).focus();
}

async function smartSnapChecks(page, name) {
  const setFixture = graph => page.evaluate(graph => {
    const editor = window.logicWorkbenchEditor;
    editor.graph = graph;
    editor.inputNames = graph.nodes.filter(node => node.type === 'input').map(node => node.name);
    editor.inputValues = Object.fromEntries(editor.inputNames.map(name => [name, 0]));
    editor.selected = null; editor.resetHistory(); editor.render();
  }, graph);
  const checkDrag = async (id, target, expected, kind, axis, screenshot) => {
    const before = await state(page);
    const node = before.graph.nodes.find(node => node.id === id);
    const from = await canvasPoint(page, node.x, node.y);
    const to = await canvasPoint(page, target.x, target.y);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await expect(page.locator(`.logic-editor-alignment-guide[data-kind="${kind}"][data-axis="${axis}"]`)).toHaveCount(1);
    if (screenshot) await page.screenshot({ path: join(artifacts, `${name}-${screenshot}.png`) });
    await page.mouse.up();
    const moved = (await state(page)).graph.nodes.find(node => node.id === id);
    assert.deepEqual({ x: moved.x, y: moved.y }, expected, `${name}: ${kind} ${axis} snapping`);
    assert.equal(await page.locator('.logic-editor-alignment-guide').count(), 0);
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    assert.deepEqual(await state(page), before, `${name}: ${kind} drag undoes as one edit`);
  };
  const wireFixture = { nodes: [
    { id: 'input-A', type: 'input', name: 'A', x: 120, y: 180 },
    { id: 'moving', type: 'AND', x: 450, y: 320 },
    { id: 'near-center', type: 'OR', x: 650, y: 198 },
    { id: 'output-F', type: 'output', name: 'F', x: 790, y: 260 }
  ], wires: [{ id: 'in', from: 'input-A', to: 'moving', port: 0 }, { id: 'out', from: 'moving', to: 'output-F', port: 0 }] };
  await setFixture(wireFixture);
  await checkDrag('moving', { x: 450, y: 198 }, { x: 450, y: 194 }, 'wire', 'y', 'straight-guide');
  await checkDrag('moving', { x: 450, y: 264 }, { x: 450, y: 260 }, 'wire', 'y');
  await checkDrag('input-A', { x: 120, y: 310 }, { x: 120, y: 306 }, 'wire', 'y');
  await checkDrag('output-F', { x: 790, y: 323 }, { x: 790, y: 320 }, 'wire', 'y');
  wireFixture.nodes[1].type = 'OR'; wireFixture.wires[0].port = 1;
  await setFixture(wireFixture);
  await checkDrag('moving', { x: 450, y: 170 }, { x: 450, y: 166 }, 'wire', 'y');

  const spacingFixture = { nodes: [
    { id: 'input-A', type: 'input', name: 'A', x: 110, y: 240 },
    { id: 'moving', type: 'AND', x: 410, y: 400 },
    { id: 'output-F', type: 'output', name: 'F', x: 710, y: 240 }
  ], wires: [] };
  await setFixture(spacingFixture);
  await checkDrag('moving', { x: 415, y: 244 }, { x: 410, y: 240 }, 'spacing', 'x', 'equal-spacing-guide');
  // 部品追加も同じ等間隔候補を使う。
  await page.evaluate(() => {
    const editor = window.logicWorkbenchEditor;
    editor.graph.nodes = editor.graph.nodes.filter(node => node.id !== 'moving');
    editor.resetHistory(); editor.render();
  });
  await drag(page, await center(page.getByRole('button', { name: 'NOTゲートを追加', exact: true })), await canvasPoint(page, 415, 244));
  const added = (await state(page)).graph.nodes.at(-1);
  assert.deepEqual({ x: added.x, y: added.y }, { x: 410, y: 240 }, 'palette drop uses equal spacing');
  spacingFixture.nodes[2].x = 310;
  await setFixture(spacingFixture);
  await checkDrag('moving', { x: 515, y: 244 }, { x: 510, y: 240 }, 'spacing', 'x');
  Object.assign(spacingFixture.nodes[0], { x: 300, y: 90 });
  Object.assign(spacingFixture.nodes[2], { x: 300, y: 410 });
  await setFixture(spacingFixture);
  await checkDrag('moving', { x: 304, y: 255 }, { x: 300, y: 250 }, 'spacing', 'y', 'vertical-spacing-guide');
  await page.evaluate(() => window.logicWorkbenchEditor.loadExpression('A-B'));
}

async function saveReloadExportChecks(page, name) {
  await page.getByRole('button', { name: '回路全体を自動整列', exact: true }).press('Enter');
  await page.getByRole('button', { name: '回路を保存', exact: true }).click();
  const dialog = page.locator('#logic-file-dialog');
  await dialog.getByLabel('回路の名前').fill(`${name}-aligned`);
  await dialog.locator('form button[type="submit"]').click();
  await dialog.waitFor({ state: 'hidden' });
  const saved = await state(page);
  await page.reload();
  await page.locator('body.lesson-slide-ready').waitFor();
  await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
  const load = page.locator('#logic-file-dialog');
  await load.getByRole('button', { name: `保存した回路「${name}-aligned」を読み込む`, exact: true }).click();
  if (await load.getByRole('heading', { name: '変更を保存しますか？', exact: true }).count()) await load.getByRole('button', { name: '保存せず続ける', exact: true }).click();
  await load.waitFor({ state: 'hidden' });
  assert.deepEqual(await state(page), saved, `${name}: save/reload/load preserves alignment snapshot`);
  await page.evaluate(() => window.logicWorkbenchEditor.alignCircuit());
  assert.equal(await page.locator('.logic-editor-alignment-guide').count(), 0, `${name}: exported circuit has no alignment guides`);
  await page.getByRole('button', { name: '回路図を出力', exact: true }).click();
  const outputDialog = page.locator('#logic-file-dialog');
  await expect(outputDialog).toBeVisible();
  await outputDialog.getByRole('radio', { name: 'SVG（拡大・編集用）', exact: true }).check();
  const downloadPromise = page.waitForEvent('download');
  await outputDialog.getByRole('button', { name: '書き出す', exact: true }).click();
  const download = await downloadPromise;
  const outputPath = join(artifacts, `${name}-aligned.svg`);
  await download.saveAs(outputPath);
  const svgText = await readFile(outputPath, 'utf8');
  const exported = await page.evaluate(text => {
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml');
    return { errors: svg.querySelectorAll('parsererror').length, guides: svg.querySelectorAll('.logic-editor-alignment-guide').length };
  }, svgText);
  assert.deepEqual(exported, { errors: 0, guides: 0 }, 'valid exported SVG has no editing guides');
}

async function touchSnapChecks(browser) {
  const { context, page } = await ready(browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await toolbarAndAlignment(page, 'chrome-touch', 390);
  const tableBefore = await state(page);
  await page.getByRole('button', { name: '真理値表を折りたたむ', exact: true }).tap();
  await expect(page.locator('#logic-workbench-table-panel')).toBeHidden();
  await page.getByRole('button', { name: '真理値表を表示', exact: true }).tap();
  await expect(page.locator('#logic-workbench-table-panel')).toBeVisible();
  assert.deepEqual(await state(page), tableBefore, 'touch table toggle preserves circuit');
  const wrap = await page.locator('.logic-editor__canvas-wrap').boundingBox();
  const anchor = { x: wrap.x + 80, y: wrap.y + 95 };
  const from = { x: wrap.x + 240, y: wrap.y + 190 };
  const to = { x: from.x, y: anchor.y + 3 };
  const anchorY = await page.evaluate(({ anchor, from }) => {
    const editor = window.logicWorkbenchEditor;
    const a = editor.toSvgPoint(anchor.x, anchor.y);
    const b = editor.toSvgPoint(from.x, from.y);
    editor.graph = { nodes: [
      { id: 'touch-anchor', type: 'OR', x: a.x, y: a.y },
      { id: 'touch-moving', type: 'AND', x: b.x, y: b.y },
      { id: 'output-F', type: 'output', name: 'F', x: 828, y: 260 }
    ], wires: [] };
    editor.inputNames = []; editor.inputValues = {};
    editor.resetHistory(); editor.render();
    return a.y;
  }, { anchor, from });
  const before = await state(page);
  const session = await context.newCDPSession(page);
  const touch = (type, point) => session.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] });
  await touch('touchStart', from);
  for (let i = 1; i <= 8; i++) await touch('touchMove', { x: from.x, y: from.y + (to.y - from.y) * i / 8 });
  // Chromiumは連続touchMoveを描画フレームへまとめるので最終イベントの反映を待つ。
  await expect.poll(async () => (await state(page)).graph.nodes.find(node => node.id === 'touch-moving').y).toBe(anchorY);
  await expect(page.locator('.logic-editor-alignment-guide[data-axis="y"]')).toHaveCount(1);
  await page.screenshot({ path: join(artifacts, 'chrome-touch-guide.png') });
  await touch('touchEnd');
  await expect(page.locator('.logic-editor-alignment-guide')).toHaveCount(0);
  await page.getByRole('button', { name: '元に戻す', exact: true }).tap();
  assert.deepEqual(await state(page), before, 'touch drag restores with one Undo');

  // 接続端子の高さへ、実際のタッチ操作で吸着する。
  const wireTarget = await page.evaluate(() => {
    const editor = window.logicWorkbenchEditor;
    editor.graph.wires = [{ id: 'touch-wire', from: 'touch-anchor', to: 'touch-moving', port: 0 }];
    editor.resetHistory(); editor.render();
    const node = editor.findNode('touch-moving');
    return { x: node.x, y: editor.findNode('touch-anchor').y - (editor.inputPoint(node, 0).y - node.y) };
  });
  const beforeWire = await state(page);
  const wireTo = await canvasPoint(page, wireTarget.x, wireTarget.y + 3);
  await touch('touchStart', from);
  for (let i = 1; i <= 8; i++) await touch('touchMove', { x: from.x, y: from.y + (wireTo.y - from.y) * i / 8 });
  await expect.poll(async () => (await state(page)).graph.nodes.find(node => node.id === 'touch-moving').y).toBe(wireTarget.y);
  await expect(page.locator('.logic-editor-alignment-guide[data-kind="wire"]')).toHaveCount(1);
  await page.screenshot({ path: join(artifacts, 'chrome-touch-straight-guide.png') });
  await touch('touchEnd');
  await page.getByRole('button', { name: '元に戻す', exact: true }).tap();
  assert.deepEqual(await state(page), beforeWire, 'touch wire snap restores with one Undo');

  const equalFixture = await page.evaluate(wrap => {
    const editor = window.logicWorkbenchEditor;
    const a = editor.toSvgPoint(wrap.x + 60, wrap.y + 95);
    const b = editor.toSvgPoint(wrap.x + 295, wrap.y + 95);
    const moving = editor.toSvgPoint(wrap.x + 200, wrap.y + 190);
    editor.graph = { nodes: [
      { id: 'input-A', type: 'input', name: 'A', x: a.x, y: a.y },
      { id: 'touch-moving', type: 'AND', x: moving.x, y: moving.y },
      { id: 'output-F', type: 'output', name: 'F', x: b.x, y: b.y }
    ], wires: [] };
    editor.inputNames = ['A']; editor.inputValues = { A: 0 };
    editor.resetHistory(); editor.render();
    return { from: { x: moving.x, y: moving.y }, to: { x: (a.x + b.x) / 2, y: a.y } };
  }, wrap);
  const equalBefore = await state(page);
  const equalFrom = await canvasPoint(page, equalFixture.from.x, equalFixture.from.y);
  const equalTo = await canvasPoint(page, equalFixture.to.x + 3, equalFixture.to.y + 3);
  await touch('touchStart', equalFrom);
  for (let i = 1; i <= 8; i++) await touch('touchMove', { x: equalFrom.x + (equalTo.x - equalFrom.x) * i / 8, y: equalFrom.y + (equalTo.y - equalFrom.y) * i / 8 });
  await expect.poll(async () => (await state(page)).graph.nodes.find(node => node.id === 'touch-moving').x).toBe(equalFixture.to.x);
  await expect(page.locator('.logic-editor-alignment-guide[data-kind="spacing"]')).toHaveCount(1);
  await page.screenshot({ path: join(artifacts, 'chrome-touch-equal-spacing-guide.png') });
  await touch('touchEnd');
  await page.getByRole('button', { name: '元に戻す', exact: true }).tap();
  assert.deepEqual(await state(page), equalBefore, 'touch equal spacing restores with one Undo');
  await context.close();
  console.log('chrome: touch table toggle, center/wire/spacing snaps, guides and Undo at 390px passed');
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  try {
    const { context, page } = await ready(browser, { width: 1440, height: 1000 });
    await toolbarAndAlignment(page, name, 1440);
    await alignmentChecks(page, name);
    await snapThresholdChecks(page, name);
    await smartSnapChecks(page, name);
    await truthPanelChecks(page, name, 1440);
    await saveReloadExportChecks(page, name);
    await page.setViewportSize({ width: 390, height: 844 });
    await toolbarAndAlignment(page, name, 390);
    await truthPanelChecks(page, name, 390);
    await context.close();
    if (name === 'chrome') await touchSnapChecks(browser);
    const lc03 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await lc03.goto(new URL('lc03.html#panel-build', baseURL).href);
    await lc03.locator('body.lesson-slide-ready').waitFor();
    assert.equal(await lc03.getByRole('button', { name: '回路全体を自動整列', exact: true }).count(), 0, `${name}: lc03 alignment disabled`);
    assert.equal(await lc03.getByRole('button', { name: '真理値表を折りたたむ', exact: true }).count(), 0, `${name}: lc03 has no free-editor table toggle`);
    await lc03.close();
    console.log(`${name}: alignment, snapping, cancellation, save/load and 390px toolbar passed`);
  } finally {
    await browser.close();
  }
}

assert.deepEqual(errors, []);
console.log('logic-alignment-browser: passed');
