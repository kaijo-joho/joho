// 配線選択→NOT挿入→履歴・保存・書き出し。共通エンジンと独立ツールの接続を検証。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { revealToolButton } from './logic-tool-browser-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-insert-not-'));
const errors = [];
console.log(`Browser artifacts: ${artifacts}`);
const snapshot = page => page.evaluate(() => logicWorkbenchEditor.snapshot());
const selectedWire = (page, id) => page.locator(`.logic-editor-wire-hit[data-wire-id="${id}"]`);

async function wirePoint(page, id) {
  return page.evaluate(id => {
    const route = logicWorkbenchEditor.currentWireRoutes.get(id);
    const segment = [...route.segments].sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
    const point = new DOMPoint((segment.from.x + segment.to.x) / 2, (segment.from.y + segment.to.y) / 2)
      .matrixTransform(logicWorkbenchEditor.svg.getScreenCTM());
    return { x: point.x, y: point.y };
  }, id);
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(response.url()); });
    await page.goto(new URL('tools/logic/', base).href);
    await page.locator('body.logic-tool-ready').waitFor();
    const insert = page.getByRole('button', { name: 'NOTを挿入', exact: true });
    await expect(insert).toBeHidden();
    const original = await snapshot(page);
    const wire = original.graph.wires.find(wire => wire.to === 'output-F');
    const point = await wirePoint(page, wire.id);
    await page.mouse.click(point.x, point.y);
    await expect(insert).toBeVisible();
    await insert.click();
    const changed = await snapshot(page);
    assert.equal(changed.graph.nodes.length, original.graph.nodes.length + 1);
    assert.equal(changed.graph.wires.length, original.graph.wires.length + 1);
    assert.equal(changed.graph.nodes.at(-1).type, 'NOT');
    assert.deepEqual(changed.graph.nodes.slice(0, -1), original.graph.nodes);
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().truthCode), '1110');
    await expect(insert).toBeHidden();
    await expect(page.locator('.logic-editor__canvas-wrap')).toBeFocused();
    await expect(page.locator('#selection-name')).toHaveText('NOT');
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    assert.deepEqual(await snapshot(page), original);
    await page.getByRole('button', { name: 'やり直す', exact: true }).click();
    assert.deepEqual(await snapshot(page), changed);
    await page.screenshot({ path: join(artifacts, `${name}-inserted.png`) });

    // 挿入結果を既存の保存UIで保存・再読込し、JSON形式でも同じ接続へ復元。
    await page.getByRole('button', { name: '回路を保存', exact: true }).click();
    const dialog = page.locator('#logic-file-dialog');
    await dialog.getByLabel('回路の名前').fill('NOT挿入の確認');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload(); await page.locator('body.logic-tool-ready').waitFor();
    await page.locator('[data-draft-id="draft-current"]').click();
    assert.deepEqual(await snapshot(page), changed, '保存後の下書きを選んで復元する');
    await expect(page.locator('#save-status')).toContainText('保存済み');
    await page.evaluate(() => logicWorkbenchEditor.setInputValues({ A: 1, B: 1 }));
    await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
    await dialog.getByRole('button', { name: '保存した回路「NOT挿入の確認」を読み込む', exact: true }).click();
    await dialog.getByRole('button', { name: '保存せず続ける', exact: true }).click();
    await expect(dialog).toBeHidden();
    assert.deepEqual(await snapshot(page), changed);
    const restored = await page.evaluate(() => LogicStorage.parseFile(LogicStorage.serializeFile({ name: 'NOT', snapshot: logicWorkbenchEditor.snapshot() })).snapshot);
    assert.deepEqual(restored, changed);
    const svgCheck = await page.evaluate(() => {
      const diagram = logicWorkbenchEditor.createExportDiagram();
      const xml = new DOMParser().parseFromString(LogicRenderer.serializeSvg(diagram.svg, diagram.title), 'image/svg+xml');
      return { errors: xml.querySelectorAll('parsererror').length, not: xml.querySelectorAll('[data-gate="NOT"]').length };
    });
    assert.deepEqual(svgCheck, { errors: 0, not: 1 });
    await page.locator('[data-pane-button="export"]').click();
    await page.locator('#export-form input[value="png"]').check();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export-submit').click();
    const download = await downloadEvent;
    const pngPath = join(artifacts, `${name}-inserted.png-export.png`);
    await download.saveAs(pngPath);
    assert.deepEqual([...(await readFile(pngPath)).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    await page.locator('[data-pane-button="export"]').click();

    // 分岐した2出力の片方だけを反転。Enterでも操作し、端子・他の配線を保持する。
    await page.evaluate(() => {
      logicWorkbenchEditor.restore({ inputNames: ['A'], inputValues: { A: 0 }, graph: {
        nodes: [{ id: 'a', type: 'input', name: 'A', x: 72, y: 260 },
          { id: 'f1', type: 'output', name: 'F₁', x: 828, y: 150 }, { id: 'f2', type: 'output', name: 'F₂', x: 828, y: 360 }],
        wires: [{ id: 'branch1', from: 'a', to: 'f1', port: 0 }, { id: 'branch2', from: 'a', to: 'f2', port: 0 }]
      } });
      logicWorkbenchEditor.resetHistory();
    });
    await selectedWire(page, 'branch1').press('Enter');
    await insert.press('Enter');
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().outputs.map(output => output.truthCode)), ['10', '01']);
    assert.deepEqual((await snapshot(page)).graph.wires.find(wire => wire.id === 'branch2'), { id: 'branch2', from: 'a', to: 'f2', port: 0 });
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#zoom-fit').click();
    for (const theme of ['light', 'dark', 'auto']) {
      for (const textSize of ['standard', 'large', 'largest']) {
        await page.locator('#settings-button').click();
        await page.locator('#theme').selectOption(theme);
        await page.locator('#text-size').selectOption(textSize);
        await page.keyboard.press('Escape');
        await selectedWire(page, 'branch1').press('Enter');
        const box = await insert.boundingBox();
        const stage = await page.locator('#stage').boundingBox();
        assert.ok(box.height >= 44 && box.x >= stage.x && box.x + box.width <= stage.x + stage.width + 1, '390pxで選択時の操作が収まる');
        await insert.press('Enter');
        assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().outputs[0].truthCode), '10');
        await (await revealToolButton(page, page.getByRole('button', { name: '元に戻す', exact: true }))).click();
      }
    }
    if (name === 'chrome') {
      // Chromeのタッチ入力で配線と挿入ボタンを操作。
      const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
      const touch = await touchContext.newPage();
      await touch.goto(new URL('tools/logic/', base).href); await touch.locator('body.logic-tool-ready').waitFor();
      await touch.locator('#zoom-fit').tap();
      const wireId = await touch.evaluate(() => logicWorkbenchEditor.graph.wires.find(wire => wire.from === 'input-A').id);
      const p = await wirePoint(touch, wireId);
      await touch.touchscreen.tap(p.x, p.y);
      await touch.locator('#insert-not').tap();
      assert.equal(await touch.evaluate(() => logicWorkbenchEditor.getAnalysis().truthCode), '0100');
      await touchContext.close();
    }
    console.log(`${name}: wire insertion, branch isolation, Undo/Redo, saves, SVG/PNG, focus, themes and mobile passed`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-insert-not-browser: passed');
