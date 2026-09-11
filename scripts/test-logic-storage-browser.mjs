// Chrome/WebKit UI test for the lc02 browser circuit file workflow.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const errors = [];
const artifacts = await mkdtemp(join(tmpdir(), 'logic-files-check-'));
console.log(`Browser artifacts: ${artifacts}`);

async function openPage(browser, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(baseURL)) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(new URL('lc02.html', baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await page.locator('#logic-editor .logic-editor__actions--files').waitFor();
  await page.waitForFunction(() => window.logicWorkbenchEditor && window.LogicWorkbenchFiles);
  return { context, page };
}

const snapshot = page => page.evaluate(() => window.logicWorkbenchEditor.snapshot());
const clickSave = page => page.getByRole('button', { name: '回路を保存', exact: true }).click();
const clickLoad = page => page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
const fileDialog = page => page.locator('#logic-file-dialog');

async function saveNew(page, name) {
  await clickSave(page);
  const dialog = fileDialog(page);
  await expectText(dialog, '回路を保存');
  const input = dialog.getByLabel('回路の名前');
  await input.fill(name);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await assertDialogClosed(dialog);
}

async function expectText(locator, text) {
  assert.equal(await locator.getByRole('heading', { name: text, exact: true }).count(), 1, `dialog heading: ${text}`);
}

async function assertDialogClosed(dialog) {
  await dialog.waitFor({ state: 'hidden' });
}

async function dirtyByGate(page) {
  await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
}

async function fileWorkflow(page, name) {
  const initial = await snapshot(page);
  assert.equal(await page.getByRole('button', { name: '回路を保存', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '回路を読み込む', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '回路図を出力', exact: true }).count(), 1);

  await dirtyByGate(page);
  await page.getByRole('button', { name: '出力を追加', exact: true }).click();
  const unfinished = await snapshot(page);
  await saveNew(page, `${name}-unfinished`);
  const rawAfterFirstSave = await page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1'));
  assert.ok(rawAfterFirstSave && rawAfterFirstSave.includes(`${name}-unfinished`));

  await dirtyByGate(page);
  await clickSave(page);
  await fileDialog(page).getByLabel('回路の名前').fill(`${name}-second`);
  await fileDialog(page).getByRole('button', { name: '別の回路として保存', exact: true }).click();
  await assertDialogClosed(fileDialog(page));
  const rawWithTwo = await page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1'));
  assert.ok(rawWithTwo?.includes(`${name}-unfinished`) && rawWithTwo.includes(`${name}-second`), 'two named circuits are retained');

  await page.evaluate(raw => localStorage.setItem('joho.logic-circuits.v1', '{broken'), rawWithTwo);
  await clickLoad(page);
  await fileDialog(page).getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1')), '{broken', 'corrupt storage is not rewritten');
  await fileDialog(page).getByRole('button', { name: 'テンプレート「AND」を読み込む', exact: true }).click();
  if (await fileDialog(page).getByRole('heading', { name: '変更を保存しますか？', exact: true }).count()) {
    await fileDialog(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
  }
  await assertDialogClosed(fileDialog(page));
  await page.evaluate(raw => localStorage.setItem('joho.logic-circuits.v1', raw), rawWithTwo);

  await page.reload();
  await page.locator('#logic-editor .logic-editor__actions--files').waitFor();
  await clickLoad(page);
  const dialog = fileDialog(page);
  await expectText(dialog, '回路を読み込む');
  await dialog.getByRole('button', { name: `保存した回路「${name}-unfinished」を読み込む`, exact: true }).click();
  if (await dialog.getByRole('heading', { name: '変更を保存しますか？', exact: true }).count()) {
    await dialog.getByRole('button', { name: '保存せず続ける', exact: true }).click();
  }
  await assertDialogClosed(dialog);
  assert.deepEqual(await snapshot(page), unfinished, 'unfinished snapshot survives reload and load');

  await dirtyByGate(page);
  await clickSave(page);
  await fileDialog(page).getByLabel('回路の名前').fill(`${name}-unfinished`);
  await fileDialog(page).getByRole('button', { name: '上書き保存', exact: true }).click();
  await assertDialogClosed(fileDialog(page));
  await dirtyByGate(page);
  await clickSave(page);
  const duplicateDialog = fileDialog(page);
  await duplicateDialog.getByLabel('回路の名前').fill(`${name}-unfinished`);
  await duplicateDialog.getByRole('button', { name: '別の回路として保存', exact: true }).click();
  await duplicateDialog.getByRole('alert').waitFor();
  assert.match(await duplicateDialog.getByRole('alert').textContent(), /同じ名前|重複|既に/);
  await duplicateDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();

  // Failed persistence must leave both the dialog and circuit untouched.
  const beforeFailure = await snapshot(page);
  await clickSave(page);
  await fileDialog(page).getByLabel('回路の名前').fill(`${name}-quota-failure`);
  await page.evaluate(() => {
    window.__logicOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
  });
  await fileDialog(page).getByRole('button', { name: '上書き保存', exact: true }).click();
  await fileDialog(page).getByRole('alert').waitFor();
  assert.deepEqual(await snapshot(page), beforeFailure, 'storage failure keeps circuit');
  await page.evaluate(() => { Storage.prototype.setItem = window.__logicOriginalSetItem; });
  await fileDialog(page).getByRole('button', { name: 'キャンセル', exact: true }).click();

  // Escape and outside click close without mutation.
  const beforeClose = await snapshot(page);
  await clickLoad(page);
  await fileDialog(page).press('Escape');
  await assertDialogClosed(fileDialog(page));
  assert.deepEqual(await snapshot(page), beforeClose);
  await clickLoad(page);
  await page.mouse.click(2, 2);
  await assertDialogClosed(fileDialog(page));
  assert.deepEqual(await snapshot(page), beforeClose);
  return { initial, unfinished };
}

async function dirtyConfirmChecks(page, savedName) {
  await dirtyByGate(page);
  await page.evaluate(() => window.logicWorkbenchEditor.setInputValues({ A: 1 }));
  const beforeCancel = await snapshot(page);
  await page.getByRole('button', { name: '全消去', exact: true }).click();
  const dialog = fileDialog(page);
  await expectText(dialog, '変更を保存しますか？');
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.deepEqual(await snapshot(page), beforeCancel);

  // Saving before clear is atomic when persistence fails.
  await page.getByRole('button', { name: '全消去', exact: true }).click();
  await fileDialog(page).getByRole('button', { name: '保存して続ける', exact: true }).click();
  await fileDialog(page).getByLabel('回路の名前').fill(`${savedName}-clear-failure`);
  const beforeClearFailure = await snapshot(page);
  await page.evaluate(() => {
    window.__logicOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
  });
  await fileDialog(page).locator('form button[type="submit"]').click();
  await fileDialog(page).getByRole('alert').waitFor();
  assert.deepEqual(await snapshot(page), beforeClearFailure, 'failed pre-clear save keeps circuit');
  await page.evaluate(() => { Storage.prototype.setItem = window.__logicOriginalSetItem; });
  await fileDialog(page).getByRole('button', { name: 'キャンセル', exact: true }).click();

  await page.getByRole('button', { name: '全消去', exact: true }).click();
  await fileDialog(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
  assert.equal((await snapshot(page)).graph.nodes.filter(node => node.type === 'output').length, 1);
  assert.equal((await snapshot(page)).graph.nodes.some(node => node.type === 'OR'), false);

  // Loading a template while dirty also asks, and discarded loading remains undoable.
  await dirtyByGate(page);
  await clickLoad(page);
  await fileDialog(page).getByRole('button', { name: 'テンプレート「AND」を読み込む', exact: true }).click();
  await fileDialog(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
  assert.equal((await snapshot(page)).graph.nodes.some(node => node.type === 'AND'), true);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.equal((await snapshot(page)).graph.nodes.some(node => node.type === 'OR'), true, 'load is undoable');

  await clickLoad(page);
  const rawBeforeDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('joho.logic-circuits.v1')));
  await fileDialog(page).getByRole('button', { name: `保存した回路「${savedName}」を削除`, exact: true }).click();
  await fileDialog(page).getByRole('button', { name: 'キャンセル', exact: true }).click();
  await fileDialog(page).getByRole('button', { name: `保存した回路「${savedName}」を削除`, exact: true }).click();
  await fileDialog(page).getByRole('button', { name: '削除する', exact: true }).click();
  const rawAfterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('joho.logic-circuits.v1')));
  assert.equal(rawAfterDelete.records.some(record => record.name === savedName), false, 'deleted record is absent');
  assert.equal(rawAfterDelete.records.length, rawBeforeDelete.records.length - 1, 'only the selected record is deleted');
  await fileDialog(page).press('Escape');

  // A successful save happens before clearing, and Undo restores even table-set inputs.
  await page.evaluate(() => logicWorkbenchEditor.setInputValues({ A: 1, B: 1 }));
  const rescued = await snapshot(page);
  await page.getByRole('button', { name: '全消去', exact: true }).click();
  await fileDialog(page).getByRole('button', { name: '保存して続ける', exact: true }).click();
  await fileDialog(page).getByLabel('回路の名前').fill('消去前のバックアップ');
  await fileDialog(page).getByRole('button', { name: '保存', exact: true }).click();
  await assertDialogClosed(fileDialog(page));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('joho.logic-circuits.v1')).records.find(record => record.name === '消去前のバックアップ').snapshot);
  assert.deepEqual(stored, rescued);
  assert.equal((await snapshot(page)).graph.wires.length, 0);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.deepEqual(await snapshot(page), rescued);
}

async function keyboardChecks(page) {
  await page.evaluate(() => logicWorkbenchEditor.startConnection('input-A'));
  const before = await snapshot(page);
  await clickSave(page);
  const input = fileDialog(page).getByLabel('回路の名前');
  await input.fill('キーボード操作');
  await input.press('Backspace');
  await input.press('Control+z');
  await input.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  assert.deepEqual(await snapshot(page), before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '回路を保存', exact: true })).toBeFocused();
  assert.equal(await page.evaluate(() => logicWorkbenchEditor.pendingFrom), 'input-A', 'dialog Escape does not cancel canvas connection');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => logicWorkbenchEditor.pendingFrom), null);
  await clickLoad(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: 'test-other-menu' } })));
  await assertDialogClosed(fileDialog(page));
}

async function exportAndLayoutChecks(page, name) {
  await page.evaluate(() => window.logicWorkbenchEditor.loadExpression('A-B'));
  await page.getByRole('button', { name: '回路図を出力', exact: true }).click();
  const dialog = fileDialog(page);
  await expectText(dialog, '回路図を出力');
  assert.equal(await dialog.getByText('SVG（拡大・編集用）', { exact: true }).count(), 1);
  assert.equal(await dialog.getByText('PNG（画像用）', { exact: true }).count(), 1);
  assert.equal(await dialog.getByLabel('0/1を表示する', { exact: true }).count(), 1);
  await dialog.press('Escape');
  await assertDialogClosed(dialog);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark', 'system']) {
      for (const size of ['standard', 'large', 'xlarge']) {
        await page.evaluate(({ theme, size }) => { siteTheme.setPreference(theme); siteTextSize.setPreference(size); }, { theme, size });
        for (const label of ['回路を保存', '回路を読み込む', '回路図を出力']) {
          await page.getByRole('button', { name: label, exact: true }).click();
          const box = await fileDialog(page).boundingBox();
          const overflow = await fileDialog(page).evaluate(dialog => dialog.scrollWidth > dialog.clientWidth + 1);
          assert.ok(box && box.width <= width && box.height <= 844 * .8 + 2 && !overflow, `${width}px ${theme} ${size} ${label} fits`);
          if (theme === 'light' && size === 'standard') await page.screenshot({ path: join(artifacts, `${name}-${width}-${label}.png`) });
          await fileDialog(page).press('Escape');
          await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused();
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { siteTextSize.setPreference('standard'); siteTheme.setPreference('light'); });
  await page.locator('.lesson-slide-deck__fullscreen').click();
  await page.getByRole('button', { name: 'スライドを全画面表示', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/is-lesson-fullscreen/);
  await clickSave(page);
  await expect(fileDialog(page)).toBeVisible();
  await fileDialog(page).getByRole('button', { name: '回路のメニューを閉じる', exact: true }).click();
  await expect(fileDialog(page)).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/is-lesson-fullscreen/);
  await page.getByRole('button', { name: '全画面表示を終了', exact: true }).click();
}

async function touchChecks(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto(new URL('lc02.html', baseURL).href);
  await page.waitForFunction(() => window.logicWorkbenchEditor);
  const before = await snapshot(page);
  await page.getByRole('button', { name: '回路を保存', exact: true }).tap();
  await fileDialog(page).getByLabel('回路の名前').fill('タッチで保存');
  await fileDialog(page).getByRole('button', { name: '保存', exact: true }).tap();
  await page.getByRole('button', { name: '全消去', exact: true }).tap();
  await page.getByRole('button', { name: '回路を読み込む', exact: true }).tap();
  await fileDialog(page).getByRole('button', { name: '保存した回路「タッチで保存」を読み込む', exact: true }).tap();
  await expect(fileDialog(page)).toBeHidden();
  assert.deepEqual(await snapshot(page), before);
  await page.close();
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  try {
    const { context, page } = await openPage(browser);
    const { unfinished } = await fileWorkflow(page, name);
    await dirtyConfirmChecks(page, `${name}-unfinished`);
    await keyboardChecks(page);
    await exportAndLayoutChecks(page, name);
    if (name === 'chrome') await touchChecks(browser);
    await context.close();
    console.log(`${name}: storage, dirty replacement, export dialog, escape/outside close and mobile layout passed (${unfinished.graph.nodes.length} nodes)`);
  } finally {
    await browser.close();
  }
}

assert.deepEqual(errors, []);
console.log('logic-storage-browser: passed');
