// 一時ブラウザ専用。OSの保存先選択は差し替え、ブラウザ内の実FileSystemHandleで書込・読戻しを検査する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setToolPreferences, revealToolButton } from './logic-tool-browser-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:19936/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-workspace-'));
console.log('Browser artifacts: ' + artifacts);
const errors = [];
async function ready(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.url()); });
  await page.goto(new URL('tools/logic/', base).href);
  await page.locator('body.logic-tool-ready').waitFor();
}
async function action(page, id) {
  if (!await page.locator('#file-menu').evaluate(node => node.open)) await page.locator('#file-menu > summary').press('Enter');
  await page.locator('[data-file-action="' + id + '"]').click();
}
async function truth(page) {
  if (await page.locator('[data-pane-button="truth"]').getAttribute('aria-expanded') !== 'true') await page.locator('[data-pane-button="truth"]').click();
}
const current = page => page.evaluate(() => ({ id: logicDocuments.activeId, snapshot: logicWorkbenchEditor.snapshot(),
  history: logicWorkbenchEditor.history, index: logicWorkbenchEditor.historyIndex, view: logicTruthPractice.exportState() }));
async function chooseFile(page, raw, name = 'import.logic.json') {
  const chooser = page.waitForEvent('filechooser'); await action(page, 'fileOpen');
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(raw) });
}
async function mainChecks(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage(); await ready(page);
  await expect(page.locator('.brand a')).toHaveAttribute('href', '../');
  assert.equal(await page.locator('.top').evaluate(node => node.getBoundingClientRect().height), 41);
  assert.deepEqual(await page.locator('[data-file-action]').evaluateAll(nodes => nodes.map(node => node.dataset.fileAction)),
    ['new', 'rename', 'save', 'browserSave', 'fileSave', 'browserOpen', 'fileOpen', 'auto']);
  await page.locator('#file-menu > summary').press('Enter');
  await expect(page.locator('[data-file-action="new"]')).toBeVisible();
  await page.keyboard.press('ArrowDown'); await expect(page.locator('[data-file-action="new"]')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#file-menu > summary')).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(page.locator('[data-file-action="auto"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('#file-menu > summary').hover();
  await expect(page.locator('[data-file-action="new"]')).toBeVisible();
  await page.locator('#file-menu > summary').click();
  await expect(page.locator('[data-file-action="new"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.logic-editor-wire-hit').last().press('Enter'); await page.locator('#insert-probe').click();
  await expect(page.locator('.logic-editor-node--probe')).toHaveCount(1);
  assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().columns.map(column => column.name)), ['P1', 'F']);
  assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().truthCode), '0001');
  await page.getByRole('button', { name: '中間点を追加', exact: true }).click();
  const probeId = await page.evaluate(() => logicWorkbenchEditor.graph.nodes.filter(node => node.type === 'probe').at(-1).id);
  await page.locator('.logic-editor-port[data-node-id="input-A"][data-kind="output"]').press('Enter');
  await page.locator('.logic-editor-port[data-node-id="' + probeId + '"][data-kind="input"]').press('Enter');
  await truth(page);
  assert.deepEqual(await page.locator('#logic-workbench-table thead th').allTextContents(), ['A', 'B', 'P1', 'P2', 'F']);
  assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().valid), true);
  const beforeCycle = await current(page);
  await page.locator('.logic-editor-port[data-node-id="' + probeId + '"][data-kind="output"]').press('Enter');
  await page.locator('.logic-editor-port[data-node-id="' + probeId + '"][data-kind="input"]').press('Enter');
  assert.deepEqual((await current(page)).snapshot, beforeCycle.snapshot);
  await expect(page.locator('#operation-hint')).toContainText('循環');
  await page.locator('[data-pane-button="export"]').click();
  await expect(page.locator('#export-preview img')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('#export-preview img').naturalWidth > 0);
  const diagramDownload = page.waitForEvent('download');
  await page.locator('#export-submit').click();
  const diagram = await diagramDownload;
  const svg = await readFile(await diagram.path(), 'utf8');
  assert.equal((svg.match(/data-probe-id=/g) || []).length, 2, 'SVGに中間点を保持する');
  assert.match(svg, />P1</); assert.match(svg, />P2</);
  await truth(page);
  await page.locator('#truth-practice').click();
  await expect(page.locator('[data-practice-answer]')).toHaveCount(12);
  await expect(page.locator('.logic-editor-node__bit, .logic-editor-node__gate-value, .logic-editor-value')).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedTable = text; } } }));
  await page.locator('#truth-copy').click();
  assert.equal(await page.evaluate(() => copiedTable.split('\n')[1]), '0\t0\t\t\t', '未入力の演習をコピーしても正解を出さない');
  const solution = await page.evaluate(() => {
    const a = logicWorkbenchEditor.getAnalysis();
    return a.truthTable.flatMap(row => a.columns.map(column => [row.index + ':' + column.id, String(row.outputs[column.id])]));
  });
  const beforePractice = await current(page);
  for (const [index, [id, answer]] of solution.entries()) {
    await page.locator('[data-practice-answer="' + id + '"]').selectOption(index === 0 ? String(1 - Number(answer)) : answer);
  }
  await page.locator('#practice-judge').click();
  await expect(page.locator('#practice-score')).toContainText('今回：11 / 12点');
  await expect(page.locator('#practice-score')).toContainText('初回：11 / 12点');
  await expect(page.locator('[data-result="wrong"]')).toHaveCount(1);
  await expect(page.locator('.practice-answer:visible')).toHaveCount(0);
  await page.locator('[data-practice-answer="' + solution[0][0] + '"]').selectOption(solution[0][1]);
  await page.locator('#practice-judge').click();
  await expect(page.locator('#practice-score')).toContainText('今回：12 / 12点');
  await expect(page.locator('#practice-score')).toContainText('初回：11 / 12点');
  assert.deepEqual((await current(page)).snapshot, beforePractice.snapshot, '演習で回路を変更しない');
  assert.deepEqual((await current(page)).history, beforePractice.history, '演習をUndo履歴へ混ぜない');
  await page.locator('#practice-reveal').click(); await expect(page.locator('.practice-answer:visible')).toHaveCount(12);
  await page.locator('#practice-reveal').click();
  await action(page, 'browserSave');
  await page.getByLabel('回路の名前', { exact: true }).fill('中間点の回路');
  await page.locator('#logic-file-dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('#logic-file-dialog')).toBeHidden();
  await expect(page.locator('#save-status')).toContainText('保存済み');
  const source = await current(page), named = await page.evaluate(() => localStorage.getItem(LogicStorage.STORAGE_KEY));
  await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
  const editedA = await current(page);
  await action(page, 'new'); await expect(page.locator('[role="tab"]')).toHaveCount(2);
  const secondId = (await current(page)).id;
  await page.getByRole('button', { name: 'NOTゲートを追加', exact: true }).click();
  await page.locator('#zoom').selectOption('2');
  const editedB = await current(page);
  await page.locator('#document-list').selectOption(source.id);
  assert.deepEqual((await current(page)).snapshot, editedA.snapshot);
  assert.deepEqual((await current(page)).history, editedA.history);
  await page.locator('#document-list').selectOption(secondId);
  assert.deepEqual((await current(page)).snapshot, editedB.snapshot);
  assert.match(await page.locator('#zoom option[value="current"]').textContent(), /200%/);
  await page.locator('.document-tab').filter({ has: page.locator('[data-document-id="' + secondId + '"]') }).getByRole('button', { name: '新しい回路のタブを閉じる', exact: true }).click();
  await expect(page.locator('#logic-file-dialog').getByRole('button', { name: '保存して閉じる', exact: true })).toBeVisible();
  await page.locator('#logic-file-dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal((await current(page)).id, secondId);
  await page.evaluate(() => logicDocuments.requestClose(logicDocuments.current));
  await page.locator('#logic-file-dialog').getByRole('button', { name: '保存せずに閉じる', exact: true }).click();
  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  assert.equal(await page.evaluate(() => localStorage.getItem(LogicStorage.STORAGE_KEY)), named, '文書タブを閉じても明示保存を消さない');
  await action(page, 'browserOpen');
  await page.getByRole('button', { name: '保存した回路「中間点の回路」を読み込む', exact: true }).click();
  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  assert.deepEqual((await current(page)).snapshot, source.snapshot);
  const activeBeforeReload = await current(page);
  await page.reload(); await page.locator('body.logic-tool-ready').waitFor();
  await expect(page.locator('#logic-file-dialog')).toBeHidden();
  assert.equal((await current(page)).id, activeBeforeReload.id);
  assert.deepEqual((await current(page)).snapshot, activeBeforeReload.snapshot);
  assert.equal(await page.evaluate(() => localStorage.getItem(LogicStorage.STORAGE_KEY)), named);
  const validFile = await page.evaluate(() => LogicStorage.serializeFile({ name: 'ファイルからの回路', snapshot: logicWorkbenchEditor.snapshot() }));
  await chooseFile(page, validFile); await expect(page.locator('[role="tab"]')).toHaveCount(3);
  const beforeBrokenFile = await current(page);
  await chooseFile(page, '{broken');
  await expect(page.locator('.logic-file-error')).toContainText('壊れています');
  assert.deepEqual((await current(page)).snapshot, beforeBrokenFile.snapshot);
  await expect(page.locator('[role="tab"]')).toHaveCount(3);
  await page.keyboard.press('Escape');

  // 実OPFSのFileSystemHandleを使う。保存先を選ぶOSダイアログだけを差し替える。
  const hasOPFS = await page.evaluate(async () => {
    try { window.testDirectory = await navigator.storage.getDirectory(); return true; } catch (_) { return false; }
  });
  {
    await page.evaluate(async () => {
      if (!window.testDirectory) {
        const records = new Map();
        window.testDirectory = { getFileHandle: async name => {
          if (!records.has(name)) records.set(name, { name, raw: '',
            async isSameEntry(other) { return other === this; },
            async createWritable() { const handle = this; return { write: async raw => { handle.raw = raw; }, close: async () => {} }; },
            async getFile() { return { text: async () => records.get(name).raw }; }
          });
          return records.get(name);
        } };
      }
      window.pickerName = 'explicit.logic.json';
      window.showSaveFilePicker = async () => testDirectory.getFileHandle(pickerName, { create: true });
    });
    await action(page, 'fileSave');
    await page.waitForFunction(() => logicDocuments.current.lastDestination === 'file' && !logicDocuments.current.explicitBusy);
    const savedFingerprint = await page.evaluate(() => logicDocuments.current.savedFingerprint);
    await page.evaluate(() => { window.pickerName = 'draft.autosave.logic.json'; });
    await action(page, 'auto');
    await page.waitForFunction(() => logicDocuments.current.autoEnabled && !logicDocuments.current.autoPending);
    await page.getByRole('button', { name: 'NOTゲートを追加', exact: true }).click();
    await page.waitForFunction(() => !logicDocuments.current.autoPending);
    const fileState = await page.evaluate(async () => ({
      explicit: LogicStorage.parseFile(await (await (await testDirectory.getFileHandle('explicit.logic.json')).getFile()).text()).snapshot,
      auto: LogicStorage.parseFile(await (await (await testDirectory.getFileHandle('draft.autosave.logic.json')).getFile()).text()).snapshot,
      current: logicWorkbenchEditor.snapshot(), saved: logicDocuments.current.savedFingerprint
    }));
    assert.deepEqual(fileState.auto, fileState.current); assert.notDeepEqual(fileState.explicit, fileState.auto);
    assert.equal(fileState.saved, savedFingerprint, '自動保存で最後の明示保存を上書きしない');
    await action(page, 'auto');
    await page.evaluate(() => { window.pickerName = 'explicit.logic.json'; });
    await action(page, 'auto');
    await expect(page.locator('.logic-file-error')).toContainText('異なる保存先');
    await page.keyboard.press('Escape');
    const pinSource = await current(page);
    await page.evaluate(() => { window.showSaveFilePicker = () => new Promise(resolve => { window.finishPicker = resolve; }); });
    await action(page, 'fileSave');
    await page.waitForFunction(() => !!window.finishPicker);
    await page.evaluate(() => logicDocuments.newDocument());
    const unrelated = await current(page);
    await page.evaluate(id => { logicDocuments.docs.find(doc => doc.id === id).name = '保存中に変更した名前'; }, pinSource.id);
    await page.evaluate(async () => finishPicker(await testDirectory.getFileHandle('pinned.logic.json', { create: true })));
    await page.waitForFunction(id => !logicDocuments.docs.find(doc => doc.id === id).explicitBusy, pinSource.id);
    assert.equal((await current(page)).id, unrelated.id);
    assert.deepEqual((await current(page)).snapshot, unrelated.snapshot, '保存結果を切替後の文書へ適用しない');
    assert.equal(await page.evaluate(id => logicDocuments.docs.find(doc => doc.id === id).name, pinSource.id), '保存中に変更した名前');
    const pinned = await page.evaluate(async () => LogicStorage.parseFile(await (await (await testDirectory.getFileHandle('pinned.logic.json')).getFile()).text()).snapshot);
    assert.deepEqual(pinned, pinSource.snapshot);
    console.log(name + ': ' + (hasOPFS ? 'real OPFS' : 'in-memory FileSystemHandle seam (OPFS unavailable)') +
      ', readback, separate autosave, same-entry rejection and pinned async saves passed');
  }
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  const download = page.waitForEvent('download'); await action(page, 'fileSave');
  const file = await download;
  const downloaded = JSON.parse(await readFile(await file.path(), 'utf8'));
  assert.deepEqual(downloaded.snapshot, (await current(page)).snapshot);
  await expect(page.locator('#logic-file-dialog')).toContainText('確認するまで未保存');
  await page.locator('#logic-file-dialog').getByRole('button', { name: '保存を確認した', exact: true }).click();

  await page.evaluate(() => logicDocuments.flushImmediate());
  const other = await context.newPage(); await ready(other);
  await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
  await page.evaluate(() => logicDocuments.flushImmediate());
  await expect(other.locator('#draft-status')).toHaveAttribute('data-state', 'error');
  const untouched = await page.evaluate(() => localStorage.getItem(LogicDocuments.KEY));
  await other.getByRole('button', { name: 'ANDゲートを追加', exact: true }).click();
  await other.evaluate(() => logicDocuments.flushImmediate());
  assert.equal(await page.evaluate(() => localStorage.getItem(LogicDocuments.KEY)), untouched);
  await other.close();
  await page.screenshot({ path: join(artifacts, name + '-workspace.png') });
  await context.close();
  console.log(name + ': probe insertion/connection, practice/regrading, isolated tabs, close guards, resume, imports/downloads and browser conflicts passed');
}
async function layoutChecks(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await ready(page);
  for (const width of [1440, 720, 390]) for (const theme of ['auto', 'light', 'dark']) for (const size of ['standard', 'large', 'largest']) {
    await page.setViewportSize({ width, height: 900 }); await setToolPreferences(page, theme, size);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, stage: document.getElementById('stage').getBoundingClientRect().height,
      rows: [...document.querySelectorAll('.top button, .top summary')].filter(node => node.getBoundingClientRect().width > 0).map(node => node.getBoundingClientRect().top) }));
    assert.ok(layout.width <= width + 1, JSON.stringify({ width, theme, size, layout }));
    assert.ok(layout.stage > 150);
    assert.ok(Math.max(...layout.rows) - Math.min(...layout.rows) <= 2, name + ': one toolbar row');
    await page.locator('#file-menu > summary').press('Enter');
    const menu = await page.locator('.joho-file-menu__items').boundingBox();
    assert.ok(menu && menu.x >= 0 && menu.x + menu.width <= width + 1);
    await page.keyboard.press('Escape');
    if (width === 390 && theme === 'dark' && size === 'largest') await page.screenshot({ path: join(artifacts, name + '-390-dark-largest.png') });
  }
  await page.close();
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ready(touch);
  await touch.locator('#file-menu > summary').tap();
  await touch.locator('[data-file-action="new"]').tap();
  await expect(touch.locator('[role="tab"]')).toHaveCount(2);
  await touch.getByRole('button', { name: '中間点を追加', exact: true }).tap();
  await expect(touch.locator('.logic-editor-node--probe')).toHaveCount(1);
  await touch.locator('#palette-toggle').tap();
  await expect(touch.locator('#component-tools')).toBeHidden();
  assert.ok(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await touch.close();
  const broken = await browser.newContext();
  await broken.addInitScript(() => localStorage.setItem('joho.logic-workspace.v1', '{broken'));
  const bad = await broken.newPage(); await ready(bad);
  await expect(bad.locator('#draft-status')).toHaveAttribute('data-state', 'error');
  await bad.getByRole('button', { name: 'ANDゲートを追加', exact: true }).click();
  assert.equal(await bad.evaluate(() => localStorage.getItem('joho.logic-workspace.v1')), '{broken');
  await broken.close();
  console.log(name + ': 27 layouts, themes/text sizes, keyboard menus, touch and corrupt-record preservation passed');
}
async function failureChecks(browser, name) {
  const snapshot = { graph: { nodes: [
    { id: 'input-A', type: 'input', name: 'A', x: 72, y: 140 },
    { id: 'input-B', type: 'input', name: 'B', x: 72, y: 280 },
    { id: 'and', type: 'AND', x: 450, y: 220 },
    { id: 'output-F', type: 'output', name: 'F', x: 820, y: 220 }
  ], wires: [{ id: 'a', from: 'input-A', to: 'and', port: 0 }, { id: 'b', from: 'input-B', to: 'and', port: 1 }, { id: 'f', from: 'and', to: 'output-F', port: 0 }] },
  inputNames: ['A', 'B'], inputValues: { A: 0, B: 0 } };
  const oldRecord = JSON.stringify({ version: 1, records: [{ id: 'legacy', name: '旧回路', snapshot, updatedAt: '2026-09-15T00:00:00.000Z' }] });
  const oldDraft = JSON.stringify({ version: 1, updatedAt: '2026-09-16T00:00:00.000Z',
    snapshot: { ...snapshot, inputValues: { A: 1, B: 0 } }, file: { id: 'legacy', name: '旧回路', savedSnapshot: snapshot } });
  const context = await browser.newContext();
  await context.addInitScript(({ oldRecord, oldDraft }) => {
    if (localStorage.getItem('migration-fixture-installed')) return;
    localStorage.setItem('joho.logic-circuits.v1', oldRecord); localStorage.setItem('joho.logic-draft.v1', oldDraft);
    localStorage.setItem('migration-fixture-installed', '1');
  }, { oldRecord, oldDraft });
  const page = await context.newPage(); await ready(page);
  await expect(page.locator('#logic-file-dialog')).toBeHidden();
  assert.deepEqual((await current(page)).snapshot.inputValues, { A: 1, B: 0 });
  await expect(page.locator('#save-status')).toContainText('未保存');
  await action(page, 'browserOpen'); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => localStorage.getItem('joho.logic-draft.v1')), oldDraft);
  assert.equal(await page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1')), oldRecord);
  await page.evaluate(() => {
    const store = new LogicStorage.Store(localStorage), record = store.get('legacy');
    record.snapshot.inputValues.B = 1; store.save(record);
  });
  const concurrent = await page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1'));
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.logic-file-error')).toContainText('別のタブ');
  assert.equal(await page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1')), concurrent);
  await page.keyboard.press('Escape');
  const before = await current(page);
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('cancelled', 'AbortError'); }; });
  await action(page, 'fileSave'); await page.waitForFunction(() => !logicDocuments.current.explicitBusy);
  await expect(page.locator('#logic-file-dialog')).toBeHidden();
  assert.deepEqual((await current(page)).snapshot, before.snapshot);
  await page.evaluate(() => { window.showSaveFilePicker = async () => ({ createWritable: async () => { throw new Error('quota fixture'); } }); });
  await action(page, 'fileSave');
  await expect(page.locator('.logic-file-error')).toContainText('ファイルへ保存できませんでした');
  assert.deepEqual((await current(page)).snapshot, before.snapshot);
  assert.equal(await page.evaluate(() => logicDocuments.current.lastDestination), 'browser', '書込み失敗で前回の保存先を変えない');
  await page.keyboard.press('Escape');
  await action(page, 'new'); await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key === 'joho.logic-circuits.v1') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    logicDocuments.requestClose(logicDocuments.current);
  });
  await page.locator('#logic-file-dialog').getByRole('button', { name: '保存して閉じる', exact: true }).click();
  await page.locator('#logic-file-dialog').getByRole('button', { name: 'ブラウザに保存', exact: true }).click();
  await page.getByLabel('回路の名前', { exact: true }).fill('容量不足の確認');
  await page.locator('#logic-file-dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.logic-file-error')).toContainText('保存に失敗');
  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  assert.equal(await page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1')), concurrent);
  await page.evaluate(() => restoreStorage()); await page.keyboard.press('Escape');
  const separator = page.locator('#side-resizer');
  await truth(page); await separator.focus(); await separator.press('Home');
  await expect(separator).toHaveAttribute('aria-valuenow', '220');
  await separator.press('End'); await expect(separator).toHaveAttribute('aria-valuenow', '560');
  await separator.press('Enter'); await expect(separator).toHaveAttribute('aria-valuenow', '300');
  await page.getByRole('button', { name: '中間点を追加', exact: true }).focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#logic-tooltip')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#logic-tooltip')).toBeHidden();
  await context.close();
  console.log(name + ': legacy draft/name preservation, conflicting saves, picker cancellation, write/quota failures, close retention, resizer and tooltips passed');
}
const scope = process.env.LOGIC_WORKSPACE_TEST_SCOPE || 'all';
for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  if (process.env.LOGIC_TEST_ENGINE && process.env.LOGIC_TEST_ENGINE !== name) continue;
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    if (scope !== 'layout') { await mainChecks(browser, name); await failureChecks(browser, name); }
    if (scope !== 'documents') await layoutChecks(browser, name);
  }
  finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-workspace-browser: passed');
