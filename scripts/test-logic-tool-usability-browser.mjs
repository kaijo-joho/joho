// 自動復元・即時ツールチップ・ショートカット・パネル幅。専用の一時ブラウザだけを使用。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { revealToolButton } from './logic-tool-browser-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const url = new URL('tools/logic/', base).href;
const artifacts = await mkdtemp(join(tmpdir(), 'logic-usability-'));
const errors = [];
const ready = page => page.locator('body.logic-tool-ready').waitFor();
const saved = page => expect(page.locator('#draft-status')).toHaveAttribute('data-state', 'saved');
const state = page => page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history, index: logicWorkbenchEditor.historyIndex }));
const draftRaw = page => page.evaluate(() => localStorage.getItem('joho.logic-draft.v1'));
const namedRaw = page => page.evaluate(() => localStorage.getItem('joho.logic-circuits.v1'));
const width = page => page.locator('#side-resizer').getAttribute('aria-valuenow').then(Number);
// 起動時は自動適用せず候補を選ぶ。既存の操作回帰は前回下書きを選んだ後に続ける。
const chooseCurrentDraft = async page => {
  const dialog = page.locator('#logic-file-dialog');
  if (!await dialog.isVisible()) return;
  await dialog.locator('[data-draft-id="draft-current"]').click();
  await expect(dialog).toBeHidden();
};
const connectErrors = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(response.url()); });
};
console.log(`Browser artifacts: ${artifacts}`);

const browserEngines = [['chrome', chromium], ['webkit', webkit]];
for (const [name, engine] of browserEngines.filter(([candidate]) => !process.env.LOGIC_TEST_ENGINE || candidate === process.env.LOGIC_TEST_ENGINE)) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); connectErrors(page);
    await page.goto(url); await ready(page);
    assert.equal(await draftRaw(page), null, '初期表示だけでは回路を保存しない');
    const save = page.getByRole('button', { name: '回路を保存', exact: true });
    const load = page.getByRole('button', { name: '回路を読み込む', exact: true });
    const dialog = page.locator('#logic-file-dialog');
    const tip = page.locator('#logic-tooltip');

    await save.hover(); await expect(tip).toBeVisible(); await expect(tip).toContainText('⌘/Ctrl+S');
    assert.equal(await save.getAttribute('title'), null, '標準titleとの二重表示を避ける');
    await tip.hover(); await expect(tip).toBeVisible();
    await page.keyboard.press('Escape'); await expect(tip).toBeHidden();
    await save.focus(); await page.keyboard.press('Tab');
    await expect(load).toBeFocused(); await expect(tip).toContainText('⌘/Ctrl+O');
    await page.keyboard.press('Shift+Tab'); await expect(save).toBeFocused();
    await page.keyboard.press('ControlOrMeta+s'); await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[type="text"]')).toBeFocused();
    // 入力欄ではアプリ用ショートカットを奪わない。合成イベントなのでOSの開く操作は起動しない。
    assert.equal(await dialog.locator('input[type="text"]').evaluate(node => {
      const event = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true });
      node.dispatchEvent(event); return event.defaultPrevented;
    }), false);
    await dialog.locator('input[type="text"]').fill('自動復元の検証');
    await dialog.getByRole('button', { name: '保存', exact: true }).click(); await saved(page);
    const originalNamed = await namedRaw(page);
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
    await page.getByRole('button', { name: '出力を追加', exact: true }).click();
    await page.evaluate(() => logicWorkbenchEditor.setInputValues({ A: 1, B: 0 }));
    await saved(page);
    const draftState = await state(page);
    assert.equal(await namedRaw(page), originalNamed, '下書きは名前付き保存を更新しない');
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().valid), false, '作りかけも対象');

    const resizer = page.locator('#side-resizer');
    await resizer.focus(); const originalWidth = await width(page);
    await resizer.press('ArrowLeft'); assert.equal(await width(page), originalWidth + 16);
    await resizer.press('Shift+ArrowRight'); assert.equal(await width(page), originalWidth - 48);
    await resizer.press('Home'); assert.equal(await width(page), 220);
    await resizer.press('End'); assert.equal(await width(page), 560);
    await resizer.press('Enter'); assert.equal(await width(page), 300);
    let edge = await resizer.boundingBox();
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down(); await page.mouse.move(edge.x + edge.width / 2 - 80, edge.y + edge.height / 2, { steps: 5 }); await page.mouse.up();
    assert.equal(await width(page), 380);
    edge = await resizer.boundingBox();
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down(); await page.mouse.move(edge.x - 60, edge.y + edge.height / 2, { steps: 5 });
    await page.keyboard.press('Escape'); await page.mouse.up(); assert.equal(await width(page), 380, '幅のドラッグもEscapeで取り消す');
    assert.deepEqual(await state(page), draftState, 'パネル操作で回路・Undoを変更しない');
    await page.locator('[data-pane-button="export"]').click();
    await page.locator('#settings-button').click(); await page.locator('#theme').selectOption('dark');
    await page.keyboard.press('Escape'); await page.reload(); await ready(page); await chooseCurrentDraft(page);
    assert.deepEqual((await state(page)).snapshot, draftState.snapshot);
    assert.equal((await state(page)).history.length, 1, '再開時は復元状態から新しいUndo履歴を始める');
    // 選択後は同じ内容を下書きへ確認保存するため、表示は「下書き保存済み」になる。
    await saved(page);
    await expect(page.locator('#save-status')).toContainText('自動復元の検証 · 未保存');
    await expect(page.locator('#export-panel')).toBeVisible(); assert.equal(await width(page), 380);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    assert.equal(await namedRaw(page), originalNamed);
    await page.locator('[data-pane-button="export"]').click();
    await page.reload(); await ready(page); await chooseCurrentDraft(page); await expect(page.locator('.side-main')).toBeHidden();

    // ドラッグ途中は保存しない。取り消しも保存済みの下書きに影響しない。
    const beforeDrag = await draftRaw(page), beforeSnapshot = (await state(page)).snapshot;
    const point = await page.evaluate(() => {
      const e = logicWorkbenchEditor, node = e.graph.nodes.find(n => n.type === 'OR');
      return new DOMPoint(node.x, node.y).matrixTransform(e.svg.getScreenCTM()).toJSON();
    });
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x + 55, point.y + 30, { steps: 6 });
    await page.waitForTimeout(350); assert.equal(await draftRaw(page), beforeDrag);
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual((await state(page)).snapshot, beforeSnapshot);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x + 55, point.y + 30, { steps: 6 }); await page.mouse.up();
    const movedSnapshot = (await state(page)).snapshot;
    assert.notDeepEqual(movedSnapshot, beforeSnapshot);
    // デバウンス待ち中でもpagehideで最後の確定済み状態を保存する。
    await page.reload(); await ready(page); await chooseCurrentDraft(page); assert.deepEqual((await state(page)).snapshot, movedSnapshot);

    await page.keyboard.press('?'); await expect(page.locator('#lc02-operation-dialog')).toBeVisible();
    await page.locator('[aria-label="詳しい操作方法を閉じる"]').hover();
    await expect(page.locator('#logic-tooltip')).toBeVisible();
    await expect(page.locator('#logic-tooltip')).toContainText('詳しい操作方法を閉じる');
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '回路エディタの操作方法', exact: true })).toBeFocused();
    await page.keyboard.press('ControlOrMeta+o'); await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape'); await expect(load).toBeFocused();

    // 全消去後の復元は空の回路。消去前の下書きを復活させない。
    await page.getByRole('button', { name: '全消去', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '変更を保存しますか？', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '保存せず続ける', exact: true }).click();
    await saved(page); await page.reload(); await ready(page); await chooseCurrentDraft(page);
    assert.equal((await state(page)).snapshot.graph.wires.length, 0);
    assert.equal(await namedRaw(page), originalNamed);
    console.log(`${name}: shortcuts, tooltips, panel persistence, draft recovery, gestures and named-save isolation passed`);

    // 同じブラウザの別タブは自動で同期・上書きしない。
    const other = await context.newPage(); connectErrors(other); await other.goto(url); await ready(other); await chooseCurrentDraft(other);
    await other.getByRole('button', { name: 'NOTゲートを追加', exact: true }).click(); await saved(other);
    const otherRaw = await draftRaw(other);
    await expect(page.locator('#draft-status')).toHaveAttribute('data-state', 'error');
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
    await expect(page.locator('#draft-status')).toHaveAttribute('data-state', 'error');
    assert.equal(await draftRaw(page), otherRaw);
    await page.locator('#draft-status').click(); await expect(page.locator('#draft-detail')).toContainText('別のタブ');
    await page.keyboard.press('Escape'); await expect(page.locator('#draft-status')).toBeFocused();
    await context.close();

    for (const mode of ['corrupt', 'quota', 'denied']) {
      const failedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const failed = await failedContext.newPage(); connectErrors(failed);
      await failed.addInitScript(mode => {
        if (mode === 'corrupt') localStorage.setItem('joho.logic-draft.v1', '{broken');
        if (mode === 'denied') Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
        if (mode === 'quota') {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === 'joho.logic-draft.v1') throw new DOMException('Full', 'QuotaExceededError');
            return original.call(this, key, value);
          };
        }
      }, mode);
      await failed.goto(url); await ready(failed);
      await failed.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
      await expect(failed.locator('#draft-status')).toHaveAttribute('data-state', 'error');
      if (mode === 'corrupt') assert.equal(await draftRaw(failed), '{broken');
      await expect(failed.locator('#draft-status')).toBeVisible();
      await expect(failed.locator('#circuit-status')).toBeHidden();
      await failed.locator('#draft-status').click(); await expect(failed.locator('#logic-file-dialog')).toBeVisible();
      assert.match((await failed.locator('#logic-file-dialog .logic-file-error:not([hidden])').allTextContents()).join(' '), /復元できません|保存できません|利用できません/);
      await expect(failed.locator('#draft-detail')).toContainText(/復元できません|保存できません|利用できません/);
      await failed.keyboard.press('Escape');
      // 自動復元が使えなくても、ローカルファイル保存はできる。
      await (await revealToolButton(failed, failed.getByRole('button', { name: '回路を保存', exact: true }))).click();
      const download = failed.waitForEvent('download');
      await failed.locator('#logic-file-dialog').getByRole('button', { name: 'ファイルに保存', exact: true }).click();
      assert.match((await download).suggestedFilename(), /\.logic\.json$/);
      await failedContext.close();
    }

    const mobile = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const touch = await mobile.newPage(); connectErrors(touch); await touch.goto(url); await ready(touch);
    await touch.locator('[data-pane-button="truth"]').tap();
    const beforeMobile = await state(touch);
    if (name === 'chrome') {
      const cdp = await mobile.newCDPSession(touch), bounds = await touch.locator('#side-resizer').boundingBox();
      const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let dx = 5; dx <= 40; dx += 5) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - dx, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await width(touch), 322);
    } else { await touch.locator('#side-resizer').focus(); await touch.locator('#side-resizer').press('End'); }
    assert.deepEqual(await state(touch), beforeMobile);
    for (const theme of ['light', 'dark', 'auto']) for (const size of ['standard', 'large', 'largest']) {
      await touch.locator('#settings-button').tap();
      await touch.locator('#theme').selectOption(theme); await touch.locator('#text-size').selectOption(size);
      await touch.locator('[aria-label="表示設定を閉じる"]').tap();
      await touch.locator('[data-pane-button="truth"]').tap();
      const layout = await touch.evaluate(() => ({ width: document.documentElement.scrollWidth,
        pane: document.querySelector('#side-main').getBoundingClientRect().toJSON(),
        zoom: document.querySelector('.zoom').getBoundingClientRect().toJSON(),
        status: document.querySelector('#circuit-status').getBoundingClientRect().toJSON() }));
      assert.equal(layout.width, 390); assert.ok(layout.pane.x >= 20 && layout.pane.right <= 347);
      assert.ok(layout.status.width >= 44 && layout.status.height >= 44);
      assert.ok(layout.zoom.right <= 346 && layout.zoom.left >= layout.status.right - 1, '下部ボタンが重ならない');
    }
    await touch.screenshot({ path: join(artifacts, `${name}-mobile.png`) });
    await touch.setViewportSize({ width: 1440, height: 900 });
    await touch.screenshot({ path: join(artifacts, `${name}-desktop.png`) });
    await mobile.close();
    console.log(`${name}: conflicting tabs, corrupt/unavailable storage, file fallback, mobile themes and panel bounds passed`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-tool-usability-browser: passed');
