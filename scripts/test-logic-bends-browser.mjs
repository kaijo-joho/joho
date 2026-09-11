// Selected-wire bend handles, persistence and cancellation in Chrome/WebKit.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-bends-check-'));
const errors = [];
console.log(`Browser artifacts: ${artifacts}`);
const state = page => page.evaluate(() => logicWorkbenchEditor.snapshot());
const handles = page => page.locator('.logic-editor-bend');
const handle = (page, index) => page.locator(`.logic-editor-bend[data-segment="${index}"]`);
const menu = page => page.locator('#logic-file-dialog');

async function fixture(page, shaped = false, branched = false) {
  await page.evaluate(({ shaped, branched }) => {
    const snapshot = {
      graph: { nodes: [
        { id: 'input-A', type: 'input', name: 'A', x: 80, y: 120 },
        { id: 'input-B', type: 'input', name: 'B', x: 80, y: 400 },
        { id: 'gate', type: 'NOT', x: 300, y: 120 },
        { id: 'output-F', type: 'output', name: 'F', x: 760, y: shaped ? 120 : 280 }
      ], wires: [
        { id: 'in', from: 'input-A', to: 'gate', port: 0 },
        { id: 'out', from: 'gate', to: 'output-F', port: 0 }
      ] }, inputNames: ['A', 'B'], inputValues: { A: 0, B: 1 }
    };
    if (shaped) snapshot.graph.wires[1].bends = [
      { x: 420, y: 120 }, { x: 420, y: 240 }, { x: 600, y: 240 }, { x: 600, y: 120 }
    ];
    if (branched) {
      snapshot.graph.nodes.push({ id: 'output-F2', type: 'output', name: 'F₂', x: 760, y: 360 });
      snapshot.graph.wires.push({ id: 'branch', from: 'gate', to: 'output-F2', port: 0,
        bends: [{ x: 420, y: 120 }, { x: 420, y: 360 }] });
    }
    logicWorkbenchEditor.loadSnapshot(snapshot);
    logicWorkbenchEditor.resetHistory();
  }, { shaped, branched });
  await page.locator('.logic-editor-wire-hit[data-wire-id="out"]').press('Enter');
}

async function dragHandle(page, index, dx, dy, ending = 'up') {
  const knob = handle(page, index).locator('.logic-editor-bend__knob');
  await knob.scrollIntoViewIfNeeded();
  const box = await knob.boundingBox();
  const scale = await page.locator('.logic-editor__canvas').evaluate(svg => svg.getScreenCTM().a);
  const target = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).slice(0, 3).map(node => node.outerHTML.slice(0, 250)), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx * scale, box.y + box.height / 2 + dy * scale, { steps: 8 });
  if (!await page.evaluate(() => Boolean(logicWorkbenchEditor.bendDrag))) {
    await page.screenshot({ path: join(artifacts, 'failed-handle.png') });
    console.log({ index, box, target, gesture: await page.evaluate(() => ({ drag: logicWorkbenchEditor.drag, pan: !!logicWorkbenchEditor.pan, selected: logicWorkbenchEditor.selected })) });
    assert.fail('real hit target starts a bend drag');
  }
  if (ending === 'escape') await page.keyboard.press('Escape');
  if (ending === 'cancel') await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: logicWorkbenchEditor.bendDrag.pointerId })));
  await page.mouse.up();
  await expect(handles(page).first()).toBeVisible();
}

async function checks(page, name) {
  await fixture(page);
  const before = await state(page);
  assert.equal(await handles(page).count(), 1, 'automatic dogleg offers one movable segment');
  await dragHandle(page, 1, 36, 0);
  const moved = await state(page);
  assert.equal(moved.graph.wires[1].bends.length, 2);
  assert.deepEqual(moved.graph.nodes, before.graph.nodes);
  assert.deepEqual(moved.inputValues, before.inputValues);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.deepEqual(await state(page), before, 'one Undo restores automatic route');
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  assert.deepEqual(await state(page), moved);
  await page.locator('.logic-editor-wire-hit[data-wire-id="out"]').press('Enter');
  await page.getByRole('button', { name: '真理値表を折りたたむ', exact: true }).click();
  await expect.poll(async () => Math.round((await handle(page, 1).locator('.logic-editor-bend__hit').boundingBox())?.width || 0)).toBe(44);
  await page.getByRole('button', { name: '真理値表を表示', exact: true }).click();
  await expect.poll(async () => Math.round((await handle(page, 1).locator('.logic-editor-bend__hit').boundingBox())?.width || 0)).toBe(44);
  assert.deepEqual(await state(page), moved, 'resize keeps geometry and history unchanged');
  await handle(page, 1).press('ArrowRight');
  assert.ok(Math.abs((await state(page)).graph.wires[1].bends[0].x - moved.graph.wires[1].bends[0].x - 2) < .001, 'arrow moves by two SVG units, allowing route coordinate rounding');
  await expect(handle(page, 1)).toBeFocused();
  await handle(page, 1).press('Delete');
  assert.equal((await state(page)).graph.wires[1].bends, undefined, 'Delete on a handle resets routing without deleting wire');
  await fixture(page, true);
  assert.equal(await handles(page).count(), 3);
  assert.equal(await page.locator('.logic-editor-junction').count(), 0, 'ordinary bends have no junction dots');
  const shaped = await state(page);
  await dragHandle(page, 2, 0, -30);
  assert.ok(Math.abs((await state(page)).graph.wires[1].bends[1].y - 210) < 2, 'horizontal leg moves vertically');
  const positioned = await state(page);
  await dragHandle(page, 1, 24, 0, 'escape');
  assert.deepEqual(await state(page), positioned, 'Escape restores last committed bends');
  await dragHandle(page, 1, 24, 0, 'cancel');
  assert.deepEqual(await state(page), positioned, 'pointercancel restores last committed bends');
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.deepEqual(await state(page), shaped, 'cancelled gestures add no history');

  await fixture(page, true, true);
  const junctions = await page.locator('.logic-editor-junction').evaluateAll(nodes => nodes.map(node => [Number(node.getAttribute('cx')), Number(node.getAttribute('cy'))]));
  assert.deepEqual(junctions, [[420, 240]], 'only the T junction is dotted');
  const branchBefore = (await state(page)).graph.wires.find(wire => wire.id === 'branch');
  await dragHandle(page, 1, 36, 0);
  assert.deepEqual((await state(page)).graph.wires.find(wire => wire.id === 'branch'), branchBefore, 'other branches retain their bends and endpoints');
  const saved = await state(page);
  await page.screenshot({ path: join(artifacts, `${name}-bends.png`) });

  await page.getByRole('button', { name: '回路を保存', exact: true }).click();
  await menu(page).getByLabel('回路の名前').fill('曲がりを調整した回路');
  const downloadPromise = page.waitForEvent('download');
  await menu(page).getByRole('button', { name: 'ファイルに保存', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const raw = await readFile(path, 'utf8');
  assert.deepEqual(JSON.parse(raw).snapshot, saved, 'real JSON download preserves all bends');
  await fixture(page);
  await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
  await menu(page).locator('input[type="file"]').setInputFiles({ name: 'roundtrip.logic.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await menu(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
  await expect(menu(page)).toBeHidden();
  assert.deepEqual(await state(page), saved, 'local JSON roundtrip restores edited routes');

  await page.getByRole('button', { name: '0/1の表示を切り替える', exact: true }).click();
  const exportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '回路図を出力', exact: true }).click();
  await menu(page).getByRole('button', { name: '書き出す', exact: true }).click();
  const svg = await readFile(await (await exportPromise).path(), 'utf8');
  assert.ok(!svg.includes('logic-editor-bend'), 'editing handles are excluded from exported diagram');
  const rendered = await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return { error: !!doc.querySelector('parsererror'), paths: [...doc.querySelectorAll('path')].map(node => node.getAttribute('d')) };
  }, svg);
  assert.equal(rendered.error, false);
  const actualPaths = await page.locator('.logic-editor-wire').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  actualPaths.forEach(path => assert.ok(rendered.paths.includes(path), 'SVG preserves the edited wire geometry'));
  assert.deepEqual(await state(page), saved, 'export and display settings leave saved circuit unchanged');
  await page.getByRole('button', { name: '回路全体を自動整列', exact: true }).click();
  assert.ok((await state(page)).graph.wires.every(wire => !wire.bends));
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.deepEqual(await state(page), saved, 'Undo alignment restores manual geometry');
}

async function touchChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(new URL('lc02.html', baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await fixture(page);
  const knob = handle(page, 1).locator('.logic-editor-bend__knob');
  await knob.scrollIntoViewIfNeeded();
  const box = await knob.boundingBox();
  const hit = await handle(page, 1).locator('.logic-editor-bend__hit').boundingBox();
  assert.ok(hit.width >= 43.9 && hit.height >= 43.9, 'touch target stays 44 CSS pixels on mobile');
  const cdp = await context.newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 24, y: point.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await state(page)).graph.wires[1].bends, 'real touch moves a bend on a 390px screen');
  await page.screenshot({ path: join(artifacts, 'chrome-mobile-bends.png') });
  await context.close();
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(baseURL)) errors.push(response.url()); });
    await page.goto(new URL('lc02.html', baseURL).href);
    await page.locator('body.lesson-slide-ready').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await checks(page, name);
    if (name === 'chrome') await touchChecks(browser);
    console.log(`${name}: bend drag/keyboard/Undo/cancel, branching, JSON roundtrip and exported geometry passed`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-bends-browser: passed');
