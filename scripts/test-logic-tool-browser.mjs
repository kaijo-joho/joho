// 独立ツールの配置・互換保存・右パネル・選択時UI・表示設定を実ブラウザで検証。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setToolPreferences, toolLayoutChecks } from './logic-tool-browser-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-tool-'));
const errors = [];
console.log(`Browser artifacts: ${artifacts}`);

async function helpAboutChecks(page, name) {
  const help = page.getByRole('button', { name: '回路エディタの操作方法', exact: true });
  const dialog = page.locator('#lc02-operation-dialog');
  const before = await page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history.length }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark', 'auto']) for (const size of ['standard', 'large', 'largest']) {
      await setToolPreferences(page, theme, size);
      await help.press('Enter');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('combobox', { name: 'ヘルプの項目' }).selectOption('about');
      await expect(dialog.locator('.help-about dt')).toHaveText(['推奨環境', 'ご利用にあたって']);
      await expect(dialog.locator('.help-about')).toContainText('macOS ＋ Google Chrome（最新版）');
      await expect(dialog.locator('.help-about')).toContainText('ローカルファイル');
      await expect(dialog.locator('.help-about')).toContainText('外部には送信されません');
      await expect(dialog.locator('.help-about')).toContainText('信号の遅延');
      await expect(dialog.locator('.help-about')).toContainText('改変・再配布はご遠慮ください');
      const credit = dialog.locator('.help-credit');
      await expect(credit).toHaveAttribute('aria-label', 'バージョン情報と著作権');
      await expect(credit).toContainText('論理回路エディタ　バージョン 0.4 BETA（試作版。2026年9月）');
      await expect(credit).toContainText('海城中学高等学校 情報科');
      await expect(credit).toContainText('Copyright © 2026 Kaijo Junior and Senior High School. All Rights Reserved.');
      await credit.scrollIntoViewIfNeeded();
      const layout = await dialog.evaluate(node => ({
        left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
        client: node.clientWidth, scroll: node.scrollWidth,
        creditBottom: node.querySelector('.help-credit').getBoundingClientRect().bottom,
        bottom: node.getBoundingClientRect().bottom
      }));
      assert.ok(layout.left >= 0 && layout.right <= width && layout.scroll <= layout.client + 1,
        `${name} help ${width} ${theme} ${size}: no horizontal overflow`);
      assert.ok(layout.creditBottom <= layout.bottom, 'last copyright line can be reached');
      if (theme === 'dark' && size === 'largest') await page.screenshot({ path: join(artifacts, `${name}-help-${width}.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(help).toBeFocused();
    }
  }
  assert.deepEqual(await page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history.length })), before,
    'reading help does not modify the circuit or history');
  await setToolPreferences(page, 'light', 'standard');
  await page.setViewportSize({ width: 1440, height: 900 });
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(response.url()); });
    await page.goto(new URL('lc02.html', base).href);
    await page.locator('body.logic-tool-ready').waitFor();
    assert.match(page.url(), /\/tools\/logic\/$/, 'old URL redirects to standalone editor');
    await expect(page.locator('.lesson-slide-deck')).toHaveCount(0);
    await expect(page.locator('#selection-tools')).toBeHidden();
    assert.equal(await page.locator('#basic-toolbar button').count(), 8);
    const toolbarOrder = await page.locator('#basic-toolbar').evaluate(node => [...node.children].map(child => child.getAttribute('aria-label') || child.getAttribute('role')));
    assert.deepEqual(toolbarOrder.slice(-4), ['separator', '回路全体を自動整列', 'separator', '0/1の表示を切り替える']);
    assert.deepEqual(await page.locator('#logic-workbench-table th').allTextContents(), ['A', 'B', 'F']);
    await page.locator('#logic-workbench-table tbody tr').last().press('Enter');
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.inputValues), { A: 1, B: 1 });

    // 同じ保存キーに置いた旧形式の回路を、旧URL→新URLの再読み込み後に復元。
    const legacy = await page.evaluate(() => {
      const snapshot = logicWorkbenchEditor.snapshot();
      new LogicStorage.Store(localStorage).save({ name: '移行前に保存した回路', snapshot });
      return snapshot;
    });
    await page.goto(new URL('lc02.html', base).href);
    await page.locator('body.logic-tool-ready').waitFor();
    if (!await page.locator('#logic-file-dialog').isVisible()) await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
    const dialog = page.locator('#logic-file-dialog');
    await dialog.getByRole('button', { name: '保存した回路「移行前に保存した回路」を読み込む', exact: true }).click();
    if (await dialog.getByRole('button', { name: '保存せず続ける', exact: true }).isVisible()) await dialog.getByRole('button', { name: '保存せず続ける', exact: true }).click();
    await expect(dialog).toBeHidden();
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), legacy);

    // 選択したオブジェクトにだけ編集アクション。上部や左パレットからもUndoが効く。
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).press('Enter');
    await expect(page.locator('#selection-tools')).toBeVisible();
    await expect(page.locator('#selection-tools .logic-editor__swap-button')).toBeVisible();
    await page.locator('#selection-tools .logic-editor__swap-button').click();
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.graph.nodes.at(-1).type), 'AND');
    await page.keyboard.press('ControlOrMeta+z');
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.graph.nodes.at(-1).type), 'OR');
    await page.getByRole('button', { name: 'NOTゲートを追加', exact: true }).click();
    await expect(page.locator('#selection-tools .logic-editor__swap-button')).toBeHidden();
    await page.locator('#selection-tools .logic-editor__delete-button').click();
    await expect(page.locator('#selection-tools')).toBeHidden();

    // 右パネルでも既存の保存確認を経てテンプレートを読み込む。
    await page.locator('[data-pane-button="templates"]').click();
    await page.locator('#template-list').getByRole('button', { name: 'テンプレート「AND」を読み込む', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '変更を保存しますか？', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(page.locator('#template-list').getByRole('button', { name: 'テンプレート「AND」を読み込む', exact: true })).toBeFocused();
    await page.locator('#template-list').getByRole('button', { name: 'テンプレート「AND」を読み込む', exact: true }).click();
    await dialog.getByRole('button', { name: '保存せず続ける', exact: true }).click();
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().valid), true);
    await page.locator('[data-pane-button="export"]').click();
    await expect(page.locator('#export-preview img')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('#export-preview img').naturalWidth > 0);
    const beforeDisplay = await page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history.length }));
    await page.getByRole('button', { name: '0/1の表示を切り替える', exact: true }).click();
    await expect(page.locator('#export-note')).toContainText('非表示');
    await expect(page.locator('#export-panel input[type="checkbox"]')).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history.length })), beforeDisplay);

    const help = page.getByRole('button', { name: '回路エディタの操作方法', exact: true });
    await help.press('Enter');
    await expect(page.locator('#lc02-operation-dialog')).toBeVisible();
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Escape'); await expect(help).toBeFocused();
    await page.locator('#settings-button').click();
    await page.locator('#theme').selectOption('dark');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-button')).toBeFocused();
    await helpAboutChecks(page, name);
    await toolLayoutChecks(page, name, artifacts);

    // 等倍・全体表示・画面パンは回路の保存内容を変えない。
    const beforeZoom = await page.evaluate(() => logicWorkbenchEditor.snapshot());
    await page.locator('[data-pane-button="export"]').click();
    await page.locator('#zoom').selectOption('2');
    const canvas = page.locator('.logic-editor__canvas-wrap');
    await canvas.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const startScroll = await canvas.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30);
    await canvas.focus(); await page.keyboard.down('Space');
    // 下端から回路内側へ引く。端の外へ引いても動かないのは正常。
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height + 30, { steps: 8 }); await page.mouse.up();
    await page.keyboard.up('Space');
    assert.notDeepEqual(await canvas.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop })), startScroll);
    await page.locator('#zoom-fit').click();
    assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), beforeZoom);
    const fit = await page.evaluate(() => ({ svg: logicWorkbenchEditor.svg.getBoundingClientRect().toJSON(), wrap: logicWorkbenchEditor.canvasWrap.getBoundingClientRect().toJSON() }));
    assert.ok(fit.svg.width <= fit.wrap.width + 1 && fit.svg.height <= fit.wrap.height + 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-pane-button="truth"]').click();
    await expect(page.locator('#logic-workbench-table-panel')).toBeVisible();
    await page.locator('[data-pane-button="truth"]').press('Escape');
    await expect(page.locator('#logic-workbench-table-panel')).toBeHidden();
    await page.locator('[data-pane-button="templates"]').click();
    await page.mouse.click(12, 64); // 右パネル外で閉じる。
    await expect(page.locator('#templates-panel')).toBeHidden();
    await page.screenshot({ path: join(artifacts, `${name}-mobile.png`) });
    console.log(`${name}: standalone layout, legacy saves, context actions, panels, preferences, zoom and keyboard passed`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-tool-browser: passed');
