// Requires Playwright and a local HTTP server; see docs/page-specific-editing-notes.md.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-editor-check-'));
console.log(`Browser artifacts: ${artifacts}`);
const errors = [];

async function ready(page, path = 'lc02.html') {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(baseURL)) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(new URL(path, baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await page.waitForFunction(() => window.logicWorkbenchEditor || window.logicQuizBuildEditor);
  await page.evaluate(() => document.fonts.ready);
}

const state = page => page.evaluate(() => window.logicWorkbenchEditor.snapshot());
const reset = page => page.evaluate(() => window.logicWorkbenchEditor.loadExpression('A-B'));
const undo = page => page.getByRole('button', { name: '元に戻す', exact: true }).click();
const port = (page, node, kind, index = 0) => page.locator(`.logic-editor-port[data-node-id="${node}"][data-kind="${kind}"]${kind === 'input' ? `[data-port="${index}"]` : ''}`);

async function center(locator) {
  const rect = await locator.boundingBox();
  assert.ok(rect);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function canvasPoint(page, x, y) {
  return page.locator('.logic-editor__canvas').evaluate((svg, point) => {
    const result = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM());
    return { x: result.x, y: result.y };
  }, { x, y });
}

async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function editChecks(page, name) {
  const initial = await state(page);
  const palette = page.getByRole('button', { name: 'ORゲートを追加', exact: true });
  const drop = await canvasPoint(page, 410, 350);
  await mouseDrag(page, await center(palette), drop);
  const added = await state(page);
  assert.equal(added.graph.nodes.length, initial.graph.nodes.length + 1, 'one gate per palette drop');
  const gate = added.graph.nodes.at(-1);
  assert.equal(gate.type, 'OR');
  assert.ok(Math.abs(gate.x - 410) < 1 && Math.abs(gate.y - 350) < 1, 'drop uses canvas coordinates');
  await undo(page);
  assert.deepEqual(await state(page), initial);
  await palette.click();
  assert.equal((await state(page)).graph.nodes.length, initial.graph.nodes.length + 1, 'click still adds once');
  await undo(page);
  await palette.press('Enter');
  assert.equal((await state(page)).graph.nodes.length, initial.graph.nodes.length + 1, 'keyboard still adds once');
  await undo(page);
  await mouseDrag(page, await center(palette), { x: 5, y: 100 });
  assert.deepEqual(await state(page), initial, 'outside cancels');
  const start = await center(palette);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 8 });
  await expect(page.locator('.logic-editor-palette-preview')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual(await state(page), initial, 'Escape cancels');
  await expect(page.locator('.logic-editor-palette-preview')).toHaveCount(0);

  await page.getByRole('button', { name: '入力Cを追加', exact: true }).click();
  const c = page.locator('.logic-editor-node[data-node-id="input-C"]');
  await c.press('Enter');
  const beforeDelete = await state(page);
  assert.equal(beforeDelete.inputValues.C, 1);
  await page.getByRole('button', { name: '入力Cを削除', exact: true }).press('Enter');
  assert.equal((await state(page)).inputNames.includes('C'), false);
  await undo(page);
  assert.deepEqual(await state(page), beforeDelete);
  await c.press('Delete');
  assert.equal((await state(page)).inputNames.includes('C'), false);
  await page.getByRole('button', { name: '入力Cを追加', exact: true }).click();
  assert.equal((await state(page)).inputValues.C, 0);

  await reset(page);
  const original = await state(page);
  const and = original.graph.nodes.find(node => node.type === 'AND');
  const aWire = original.graph.wires.find(wire => wire.from === 'input-A');
  await mouseDrag(page, await center(port(page, and.id, 'input', 0)), await center(port(page, and.id, 'input', 1)));
  const replaced = await state(page);
  assert.equal(replaced.graph.wires.length, 2);
  assert.deepEqual(replaced.graph.wires.find(wire => wire.id === aWire.id), { ...aWire, port: 1 });
  await undo(page);
  assert.deepEqual(await state(page), original, 'Undo restores displaced connection too');

  await mouseDrag(page, await center(port(page, 'input-B', 'output')), await center(port(page, and.id, 'input', 0)));
  assert.equal((await state(page)).graph.wires.filter(wire => wire.to === and.id && wire.from === 'input-B').length, 2, 'new connection replaces occupied input too');
  await undo(page);
  // The output-to-input rewire below would create a cycle, so neither old wire may disappear.
  await mouseDrag(page, await center(port(page, 'output-F', 'input')), await center(port(page, and.id, 'input', 1)));
  assert.deepEqual(await state(page), original, 'cycle rejection is atomic');
  await page.locator(`.logic-editor-wire-hit[data-wire-id="${aWire.id}"]`).press('Enter');
  await mouseDrag(page, await center(port(page, 'input-A', 'output')), await center(port(page, 'input-B', 'output')));
  assert.equal((await state(page)).graph.wires.find(wire => wire.id === aWire.id).from, 'input-B', 'left endpoint rewires');
  await undo(page);
  assert.deepEqual(await state(page), original);

  // Native summary has no consistently exposed button role in all engines.
  const summary = page.locator('.logic-editor__help > summary');
  await summary.press('Enter');
  await expect(page.locator('.logic-editor__help-content')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(summary).toBeFocused();
  await expect(page.locator('.logic-editor__help-content')).toBeHidden();
  await page.locator('.logic-example-picker > summary').click();
  await expect(page.locator('.logic-example-picker')).toHaveAttribute('open', '');
  await page.locator('#headline_2').click();
  await expect(page.locator('.logic-example-picker')).not.toHaveAttribute('open', '');
  console.log(`${name}: palette drag/click/keyboard, input deletion, both wire ends, occupied ports, Undo and help`);
}

async function exportChecks(page, name, { resetCircuit = true, showSignals = true } = {}) {
  if (resetCircuit) {
    await reset(page);
    await page.evaluate(() => window.logicWorkbenchEditor.setInputValues({ A: 1, B: 1 }));
  }
  const beforePreference = await state(page);
  await page.getByRole('checkbox', { name: '保存図に0/1を表示', exact: true }).setChecked(showSignals);
  assert.deepEqual(await state(page), beforePreference, 'export preference does not change circuit or input values');
  const svgDownload = page.waitForEvent('download');
  await page.locator('[data-format="svg"]').click();
  const svgFile = await svgDownload;
  assert.equal(svgFile.suggestedFilename(), 'logic-circuit.svg');
  const svgPath = join(artifacts, `${name}.svg`);
  await svgFile.saveAs(svgPath);
  const source = await readFile(svgPath, 'utf8');
  assert.ok(source.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg'), 'real newline before SVG root');
  assert.equal((source.match(/xmlns=/g) || []).length, 1, 'single XML namespace');
  assert.ok(!source.includes('var(') && !source.includes('<style'), 'self-contained presentation attributes');
  const parsed = await page.evaluate(source => {
    const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
    return {
      error: xml.querySelector('parsererror')?.textContent,
      width: Number(xml.documentElement.getAttribute('width')),
      height: Number(xml.documentElement.getAttribute('height')),
      gateFill: xml.querySelector('.logic-gate__body')?.getAttribute('fill'),
      liveWire: xml.querySelector('.logic-wire.is-one')?.getAttribute('stroke'),
      badges: xml.querySelectorAll('.logic-value').length,
      bits: [...xml.querySelectorAll('text')].filter(text => /^[01]$/.test(text.textContent)).length,
      boxes: xml.querySelectorAll('.logic-output-box, .logic-editor-node__box').length,
      terminalKinds: [...xml.querySelectorAll('.logic-terminal')].map(dot => dot.getAttribute('data-terminal-kind')),
      outputLabels: [...xml.querySelectorAll('[data-terminal-label="output"]')].map(label => label.textContent),
      junctions: xml.querySelectorAll('.logic-junction').length,
      notBubbles: xml.querySelectorAll('.logic-gate__not-bubble').length,
      junctionsAfterWires: [...xml.querySelectorAll('.logic-junction')].every(dot =>
        [...xml.querySelectorAll('.logic-wire')].every(wire => Boolean(wire.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING))),
      gates: [...xml.querySelectorAll('.logic-gate')].map(gate => ({ id: gate.getAttribute('data-node-id'), transform: gate.getAttribute('transform') }))
    };
  }, source);
  assert.equal(parsed.error, undefined);
  assert.ok(parsed.width > 0 && parsed.height > 0);
  assert.equal(parsed.gateFill, '#f8fafc');
  assert.equal(parsed.liveWire, showSignals ? '#d9483b' : undefined);
  assert.equal(parsed.boxes, 0, 'export outputs have no frames');
  assert.ok(parsed.terminalKinds.every(kind => kind === 'input' || kind === 'output'), 'no gate port dots');
  assert.deepEqual(parsed.outputLabels, beforePreference.graph.nodes.filter(node => node.type === 'output').map(node => node.name));
  assert.equal(parsed.terminalKinds.filter(kind => kind === 'output').length, parsed.outputLabels.length);
  assert.equal(parsed.bits > 0, showSignals);
  assert.equal(parsed.badges > 0, showSignals);
  assert.equal(parsed.notBubbles, beforePreference.graph.nodes.filter(node => node.type === 'NOT').length, 'NOT negation bubbles remain');
  assert.equal(parsed.junctionsAfterWires, true, 'branch dots are not overwritten by the wires');
  for (const gate of parsed.gates) {
    const sourceNode = beforePreference.graph.nodes.find(node => node.id === gate.id);
    assert.equal(gate.transform, `translate(${sourceNode.x} ${sourceNode.y})`, 'export preserves placement/shared gate identity');
  }
  const pngDownload = page.waitForEvent('download');
  await page.locator('[data-format="png"]').click();
  const pngFile = await pngDownload;
  assert.equal(pngFile.suggestedFilename(), 'logic-circuit.png');
  await pngFile.saveAs(join(artifacts, `${name}.png`));
  const png = await readFile(join(artifacts, `${name}.png`));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), parsed.width * 2);
  assert.equal(png.readUInt32BE(20), parsed.height * 2);
  // Decode the actual files, not just their MIME types. Check visible ink and white background.
  for (const [format, data] of [['svg+xml', Buffer.from(source)], ['png', png]]) {
    const pixels = await page.evaluate(async url => {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const values = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < values.length; i += 4) {
        if (values[i + 3] > 200 && Math.min(values[i], values[i + 1], values[i + 2]) < 150) ink++;
      }
      return { ink, background: [...context.getImageData(20, 20, 1, 1).data] };
    }, `data:image/${format};base64,${data.toString('base64')}`);
    assert.ok(pixels.ink > 1000, 'diagram is visibly rendered');
    assert.deepEqual(pixels.background, [255, 255, 255, 255]);
  }
  await expect(page.locator('[data-format="png"]')).toBeEnabled();
  const variants = await page.evaluate(() => {
    return ['A_B', 'nA', '(A^B)-C'].map(expression => {
      const host = document.createElement('div');
      const diagram = LogicRenderer.renderCircuit(host, LogicCore.parse(expression), { inputs: { A: 1, B: 0, C: 1 } });
      const before = diagram.svg.outerHTML;
      const xml = new DOMParser().parseFromString(LogicRenderer.serializeSvg(diagram.svg, 'A & B <回路図>'), 'image/svg+xml');
      return {
        error: xml.querySelector('parsererror')?.textContent,
        title: xml.querySelector('title')?.textContent,
        preserved: before === diagram.svg.outerHTML,
        filled: [...xml.querySelectorAll('.logic-gate__body')].every(gate => gate.getAttribute('fill') === '#f8fafc')
      };
    });
  });
  assert.ok(variants.every(result => !result.error && result.title === 'A & B <回路図>' && result.preserved && result.filled), 'all basic gate shapes export without changing their live SVG');
  const failed = await page.evaluate(async () => {
    const original = HTMLCanvasElement.prototype.toBlob;
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    const created = new Set();
    const released = new Set();
    HTMLCanvasElement.prototype.toBlob = callback => callback(null);
    URL.createObjectURL = blob => { const url = create.call(URL, blob); created.add(url); return url; };
    URL.revokeObjectURL = url => { released.add(url); revoke.call(URL, url); };
    try {
      await logicWorkbenchEditor.savePng();
      return { notice: logicWorkbenchEditor.notice, busy: logicWorkbenchEditor.savingPng, released: [...created].filter(url => released.has(url)).length };
    } finally {
      HTMLCanvasElement.prototype.toBlob = original;
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });
  assert.match(failed.notice, /PNGを保存できません/);
  assert.equal(failed.busy, false);
  assert.equal(failed.released, 1, 'conversion failure releases the temporary SVG URL');
  await expect(page.locator('[data-format="png"]')).toBeEnabled();
  console.log(`${name}: actual SVG XML/standalone rendering and PNG pixels/dimensions verified`);
}

async function multiOutputChecks(page, name) {
  await reset(page);
  const single = await state(page);
  const and = single.graph.nodes.find(node => node.type === 'AND');
  await page.getByRole('button', { name: '出力を追加', exact: true }).click();
  const double = await state(page);
  const outputs = double.graph.nodes.filter(node => node.type === 'output');
  assert.deepEqual(outputs.map(node => node.name), ['F₁', 'F₂']);
  assert.deepEqual(outputs[0], { ...single.graph.nodes.find(node => node.type === 'output'), name: 'F₁' });
  await expect(page.locator('[data-format="svg"]')).toBeDisabled();
  await expect(page.locator('[data-format="png"]')).toBeDisabled();
  await mouseDrag(page, await center(port(page, and.id, 'output')), await center(port(page, outputs[1].id, 'input')));
  assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().valid), true);
  await expect(page.locator('[data-format="svg"]')).toBeEnabled();
  assert.deepEqual(await page.locator('#logic-workbench-table thead th').allTextContents(), ['A', 'B', 'F₁', 'F₂']);
  assert.deepEqual(await page.locator('#logic-workbench-table tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent))), [
    ['0', '0', '0', '0'], ['0', '1', '0', '0'], ['1', '0', '0', '0'], ['1', '1', '1', '1']
  ]);
  await page.locator('#logic-workbench-table tbody tr').last().press('Enter');
  await expect(page.locator('#logic-workbench-table tbody tr').last()).toHaveClass(/is-active/);
  assert.deepEqual(await page.locator('.logic-editor-node--output .logic-editor-node__bit').allTextContents(), ['1', '1']);
  const shared = await state(page);
  const exported = await page.evaluate(() => {
    const { svg } = logicWorkbenchEditor.createExportDiagram();
    return { gates: svg.querySelectorAll('.logic-gate').length, junctions: svg.querySelectorAll('.logic-junction').length };
  });
  assert.equal(exported.gates, 1, 'one shared gate, not copied for each output');
  assert.equal(exported.junctions, 1, 'only the actual shared-output branch has a dot, not its bends');
  await page.locator(`.logic-editor-node[data-node-id="${outputs[1].id}"]`).press('Enter');
  await page.getByRole('button', { name: '出力F₂を削除', exact: true }).press('Enter');
  assert.deepEqual((await state(page)).graph.nodes.filter(node => node.type === 'output').map(node => node.name), ['F']);
  await undo(page);
  assert.deepEqual(await state(page), shared, 'Undo restores output names, positions and branches');

  const orPalette = page.getByRole('button', { name: 'ORゲートを追加', exact: true });
  await mouseDrag(page, await center(orPalette), await canvasPoint(page, 480, 350));
  const or = (await state(page)).graph.nodes.at(-1);
  await mouseDrag(page, await center(port(page, 'input-A', 'output')), await center(port(page, or.id, 'input', 0)));
  await mouseDrag(page, await center(port(page, 'input-B', 'output')), await center(port(page, or.id, 'input', 1)));
  await mouseDrag(page, await center(port(page, or.id, 'output')), await center(port(page, outputs[1].id, 'input')));
  assert.deepEqual(await page.locator('#logic-workbench-table tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent))), [
    ['0', '0', '0', '0'], ['0', '1', '0', '1'], ['1', '0', '0', '1'], ['1', '1', '1', '1']
  ]);
  await page.locator('#logic-workbench-table tbody tr').nth(2).press('Enter');
  assert.deepEqual(await page.locator('.logic-editor-node--output .logic-editor-node__bit').allTextContents(), ['0', '1']);
  await page.screenshot({ path: join(artifacts, `${name}-multiple-editor.png`) });
  const exportPreference = page.getByRole('checkbox', { name: '保存図に0/1を表示', exact: true });
  await exportPreference.press('Space');
  await expect(exportPreference).not.toBeChecked();
  await exportPreference.press('Space');
  await expect(exportPreference).toBeChecked();
  await exportChecks(page, `${name}-multiple-visible`, { resetCircuit: false, showSignals: true });
  await exportChecks(page, `${name}-multiple-hidden`, { resetCircuit: false, showSignals: false });
  assert.deepEqual(await page.locator('.logic-editor-node--output .logic-editor-node__bit').allTextContents(), ['0', '1'], 'hidden export does not hide editor values');
  await reset(page);
  await page.getByRole('checkbox', { name: '保存図に0/1を表示', exact: true }).check();
  console.log(`${name}: multiple outputs, shared branch, renaming/deletion/Undo, truth table and both export value modes`);
}

async function layoutChecks(page, name) {
  await page.mouse.move(0, 0);
  for (const width of [1800, 720, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark', 'system']) {
      for (const size of ['standard', 'large', 'xlarge']) {
        await page.evaluate(({ theme, size }) => {
          window.siteTheme.setPreference(theme);
          window.siteTextSize.setPreference(size);
        }, { theme, size });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => {
          const toolbar = document.querySelector('.logic-editor__toolbar').getBoundingClientRect();
          const controls = [...document.querySelectorAll('.logic-editor__toolbar button, .logic-editor__export-option, .logic-editor__help-button')];
          return {
            width: document.documentElement.scrollWidth,
            controlsFit: controls.every(button => {
              const box = button.getBoundingClientRect();
              return box.left >= toolbar.left - 1 && box.right <= toolbar.right + 1 && button.scrollWidth <= button.clientWidth + 1;
            }),
            canvasHeight: document.querySelector('.logic-editor__canvas-wrap').clientHeight
          };
        });
        assert.ok(layout.width <= width + 1 && layout.controlsFit && layout.canvasHeight > 100, `${name} ${width} ${theme} ${size}: ${JSON.stringify(layout)}`);
      }
    }
    await page.screenshot({ path: join(artifacts, `${name}-${width}.png`) });
  }
  await page.evaluate(() => { siteTheme.setPreference('light'); siteTextSize.setPreference('standard'); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.lesson-slide-deck__fullscreen').click();
  await page.getByRole('button', { name: 'スライドを全画面表示', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/is-lesson-fullscreen/);
  await expect(page.locator('.logic-editor__canvas')).toBeVisible();
  await page.getByRole('button', { name: '全画面表示を終了', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/is-lesson-fullscreen/);
  console.log(`${name}: desktop/half/mobile widths, themes/text sizes and actual fullscreen`);
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await ready(page);
    await editChecks(page, name);
    await exportChecks(page, name);
    await multiOutputChecks(page, name);
    await page.evaluate(() => {
      logicWorkbenchEditor.loadExpression('n(A_B)');
      logicWorkbenchEditor.setInputValues({ A: 0, B: 0 });
    });
    await exportChecks(page, `${name}-not`, { resetCircuit: false });
    await layoutChecks(page, name);
    if (name === 'chrome') {
      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await ready(mobile);
      const initial = await state(mobile);
      const start = await center(mobile.locator('.logic-editor__gate-button[data-gate="OR"]'));
      const wrap = await mobile.locator('.logic-editor__canvas-wrap').boundingBox();
      const finish = { x: wrap.x + wrap.width * .6, y: wrap.y + 120 };
      const expected = await mobile.evaluate(({ x, y }) => {
        const point = window.logicWorkbenchEditor.toSvgPoint(x, y);
        return { x: point.x, y: point.y };
      }, finish);
      const session = await mobile.context().newCDPSession(mobile);
      const touch = (type, point) => session.send('Input.dispatchTouchEvent', {
        type, touchPoints: point ? [{ ...point, id: 1 }] : []
      });
      await touch('touchStart', start);
      for (let i = 1; i <= 8; i++) {
        await touch('touchMove', { x: start.x + (finish.x - start.x) * i / 8, y: start.y + (finish.y - start.y) * i / 8 });
      }
      await touch('touchEnd');
      const added = await state(mobile);
      assert.equal(added.graph.nodes.length, initial.graph.nodes.length + 1, 'touch palette drag adds once');
      assert.ok(Math.abs(added.graph.nodes.at(-1).x - expected.x) < 1, JSON.stringify({ added: added.graph.nodes.at(-1), expected }));
      await undo(mobile);
      await mobile.locator('.logic-editor__gate-button[data-gate="OR"]').tap();
      assert.equal((await state(mobile)).graph.nodes.length, initial.graph.nodes.length + 1, 'touch tap adds once');
      await mobile.close();
      console.log('chrome: real touch sequence for palette drag and tap at 390px');
    }
    const quizPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await ready(quizPage, 'lc03.html#panel-build');
    assert.equal(await quizPage.evaluate(() => {
      const editor = window.logicQuizBuildEditor;
      return editor.canDeleteNode(editor.graph.nodes.find(node => node.type === 'input'));
    }), false, 'quiz inputs remain fixed');
    await expect(quizPage.locator('.logic-editor__save-button')).toHaveCount(0);
    await expect(quizPage.getByRole('button', { name: '出力を追加', exact: true })).toHaveCount(0);
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, []);
console.log(`logic-editor-browser: passed; artifacts: ${artifacts}`);
