// 独立論理回路エディタの複数選択・診断を、Chrome と WebKit で操作して検証する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-selection-browser-'));
const errors = [];
console.log(`Browser artifacts: ${artifacts}`);

async function canvasPoint(page, x, y) {
  return page.locator('.logic-editor__canvas').evaluate((svg, point) => {
    const result = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM());
    return { x: result.x, y: result.y };
  }, { x, y });
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function setFixture(page) {
  await page.evaluate(() => {
    const editor = window.logicWorkbenchEditor;
    editor.graph = {
      nodes: [
        { id: 'input-A', type: 'input', name: 'A', x: 100, y: 180 },
        { id: 'gate-test', type: 'AND', x: 360, y: 180 },
        { id: 'output-F', type: 'output', name: 'F', x: 760, y: 180 }
      ],
      wires: [
        { id: 'wire-a', from: 'input-A', to: 'gate-test', port: 0,
          bends: [{ x: 220, y: 180 }, { x: 220, y: 166 }] },
        { id: 'wire-a-2', from: 'input-A', to: 'gate-test', port: 1 },
        { id: 'wire-f', from: 'gate-test', to: 'output-F', port: 0 }
      ]
    };
    editor.inputNames = ['A'];
    editor.inputValues = { A: 0 };
    editor.setNodeSelection([]);
    editor.resetHistory();
    editor.render();
  });
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('response', response => {
      if (response.url().startsWith(base) && response.status() >= 400) errors.push(`${name}: ${response.status()} ${response.url()}`);
    });
    await page.goto(new URL('tools/logic/', base).href);
    await page.locator('body.logic-tool-ready').waitFor();
    await page.waitForFunction(() => window.logicWorkbenchEditor);
    assert.deepEqual(await page.evaluate(() => ({
      multiple: logicWorkbenchEditor.options.allowMultipleSelection,
      diagnostics: logicWorkbenchEditor.options.enableDiagnostics
    })), { multiple: true, diagnostics: true });
    await page.locator('.logic-editor__canvas-wrap').focus();
    await page.keyboard.down('Space');
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.spacePan), true, 'Space中はキャンバスのパンモードになる');
    await page.keyboard.up('Space');
    console.log(`${name}: ready`);

    await setFixture(page);
    // 範囲ドラッグとShiftクリックは選択を加え、選択クラスを表示する。
    await drag(page, await canvasPoint(page, 45, 105), await canvasPoint(page, 430, 245));
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.getSelectedNodes().map(node => node.id).sort()),
      ['gate-test', 'input-A']);
    await expect(page.locator('.logic-editor-node.is-multi-selected')).toHaveCount(2);
    await page.evaluate(() => logicWorkbenchEditor.clearSelection());
    await page.locator('.logic-editor-node[data-node-id="gate-test"]').click();
    await page.locator('.logic-editor-node[data-node-id="input-A"]').click({ modifiers: ['Shift'] });
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.getSelectedNodes().map(node => node.id).sort()),
      ['gate-test', 'input-A']);
    console.log(`${name}: range and Shift selection`);

    // まとめて移動すると内部の手動折れ点も同じ量だけ移動し、Undoで一度に戻る。
    const beforeMove = await page.evaluate(() => logicWorkbenchEditor.snapshot());
    const gateCenter = await canvasPoint(page, 360, 180);
    await drag(page, gateCenter, { x: gateCenter.x + 42, y: gateCenter.y + 34 });
    const afterMove = await page.evaluate(() => logicWorkbenchEditor.snapshot());
    const movedInput = afterMove.graph.nodes.find(node => node.id === 'input-A');
    const movedGate = afterMove.graph.nodes.find(node => node.id === 'gate-test');
    const originalInput = beforeMove.graph.nodes.find(node => node.id === 'input-A');
    const originalGate = beforeMove.graph.nodes.find(node => node.id === 'gate-test');
    const delta = { x: movedGate.x - originalGate.x, y: movedGate.y - originalGate.y };
    assert.ok(delta.x > 10 && delta.y > 10);
    assert.ok(Math.abs(movedInput.x - originalInput.x - delta.x) < .1 && Math.abs(movedInput.y - originalInput.y - delta.y) < .1,
      '複数の部品を同じ量だけ移動する');
    assert.deepEqual(afterMove.graph.wires.find(wire => wire.id === 'wire-a').bends.map(point => ({
      x: Math.round((point.x - delta.x) * 10) / 10, y: Math.round((point.y - delta.y) * 10) / 10
    })), [{ x: 220, y: 180 }, { x: 220, y: 166 }], '内部の手動配線も同じ量だけ移動する');
    await page.keyboard.press('ControlOrMeta+z');
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), beforeMove);
    console.log(`${name}: group move and undo`);

    // 選択内の部品・配線だけを複製し、1回のUndoで戻す。
    await drag(page, await canvasPoint(page, 45, 105), await canvasPoint(page, 430, 245));
    const beforeCopy = await page.evaluate(() => logicWorkbenchEditor.snapshot());
    await page.locator('#duplicate-selection').click();
    const afterCopy = await page.evaluate(() => logicWorkbenchEditor.snapshot());
    assert.equal(afterCopy.graph.nodes.length, beforeCopy.graph.nodes.length + 2);
    assert.equal(afterCopy.graph.wires.length, beforeCopy.graph.wires.length + 2);
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.getSelectedNodes().length), 2);
    await page.keyboard.press('ControlOrMeta+z');
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), beforeCopy);
    console.log(`${name}: copy and undo`);

    // Escape はドラッグ途中を復元し、履歴を増やさない。
    await drag(page, await canvasPoint(page, 45, 105), await canvasPoint(page, 430, 245));
    const beforeCancel = await page.evaluate(() => logicWorkbenchEditor.snapshot());
    const point = await canvasPoint(page, 360, 180);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x + 70, point.y + 45, { steps: 6 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), beforeCancel);

    // 不完成状態では下部の一覧と赤い ! を出し、項目を選ぶと該当の部品へフォーカスする。
    await page.evaluate(() => {
      const editor = logicWorkbenchEditor;
      editor.graph.wires = [];
      editor.setNodeSelection([]);
      editor.resetHistory();
      editor.render();
    });
    await expect(page.locator('.logic-editor-diagnostic')).toHaveCount(5);
    await page.locator('#zoom').selectOption('2');
    await page.locator('.logic-editor__canvas-wrap').evaluate(wrap => { wrap.scrollLeft = 0; wrap.scrollTop = 0; });
    await page.locator('#circuit-status').click();
    const diagnostics = page.locator('#diagnostics-dialog');
    await expect(diagnostics).toBeVisible();
    await expect(page.locator('#diagnostics-list button')).toHaveCount(5);
    const outputIssue = page.locator('#diagnostics-list button[data-diagnostic-id="port:output-F:0"]');
    await expect(outputIssue).toHaveCount(1);
    await outputIssue.click();
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.diagnosticFocusId), 'port:output-F:0');
    await expect(page.locator('.logic-editor-diagnostic.is-focused')).toHaveCount(1);
    assert.ok(await page.locator('.logic-editor__canvas-wrap').evaluate(wrap => wrap.scrollLeft > 0),
      '診断項目から画面外の端子を選ぶとキャンバスをスクロールして表示する');
    console.log(`${name}: diagnostics`);

    // タッチでは複数選択モード時だけ、連続タップで選択を追加できる。
    await setFixture(page);
    await page.locator('#selection-mode').click();
    console.log(`${name}: touch selection`);
    await expect(page.locator('#selection-mode')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.logic-editor-node[data-node-id="input-A"]').tap();
    await page.locator('.logic-editor-node[data-node-id="gate-test"]').tap();
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.getSelectedNodes().map(node => node.id).sort()),
      ['gate-test', 'input-A']);
    await page.locator('#selection-mode').click();

    // CP21 は明示的に有効化しないかぎり、従来の単一選択・パン挙動を保つ。
    await page.goto(new URL('cp21.html', base).href);
    await page.locator('body.lesson-slide-ready').waitFor();
    await page.waitForFunction(() => window.logicQuizBuildEditor);
    assert.deepEqual(await page.evaluate(() => ({
      multiple: Boolean(logicQuizBuildEditor.options.allowMultipleSelection),
      diagnostics: Boolean(logicQuizBuildEditor.options.enableDiagnostics),
      selectionMode: logicQuizBuildEditor.selectionMode
    })), { multiple: false, diagnostics: false, selectionMode: false });
    await page.screenshot({ path: join(artifacts, `${name}.png`) });
    console.log(`${name}: range/Shift/touch selection, group move/copy/cancel, diagnostics and CP21 compatibility passed`);
  } finally {
    await browser.close();
  }
}

assert.deepEqual(errors, []);
console.log('logic-selection-browser: passed');
