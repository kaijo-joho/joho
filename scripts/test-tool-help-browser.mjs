// 共通ヘルプ＋論理回路での統合。ドラッグは実マウス、タップは実タッチ入力を使う。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setToolPreferences } from './logic-tool-browser-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const url = new URL('tools/logic/', base).href;
const artifacts = await mkdtemp(join(tmpdir(), 'tool-help-'));
console.log('Help artifacts: ' + artifacts);
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const rect = locator => locator.evaluate(node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; });
const state = page => page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history,
  saves: localStorage.getItem('joho.logic-circuits.v1'), draft: localStorage.getItem('joho.logic-draft.v1') }));
const helpButton = page => page.getByRole('button', { name: '回路エディタの操作方法', exact: true });
async function drag(page, handle, dx, dy, cancel = false) {
  const box = await rect(handle), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up(); await settle(page);
}
async function ready(page) {
  await page.locator('body.logic-tool-ready').waitFor();
  if (await page.locator('#logic-file-dialog').isVisible()) await page.keyboard.press('Escape');
  await settle(page);
}

async function standalone(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = new URL('tools/shared/help-test-fixture', base).href;
  await context.route(fixture, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ja">
    <meta charset="utf-8"><title>共通ヘルプ単独テスト</title>
    <link rel="stylesheet" href="help-panel.css"><script defer src="help-panel.js"></script>
    <style>body { font: 16px sans-serif; --panel: #fff; --text: #222; --line: #ccc; --accent: #246; }</style>
    <button id="opener">ヘルプ</button><button id="editor">編集</button>
    <aside id="help" hidden><section data-help-topic="first"><h3>初めの操作</h3><p>短い手順です。</p>
      <details><summary>補足</summary><button id="inside">補足内の操作</button></details></section>
      <section data-help-topic="second"><h3>次の操作</h3>${'<p>詳しい操作の説明です。</p>'.repeat(40)}</section></aside>
    <button id="after" tabindex="0">ヘルプの次の操作</button><dialog id="confirm"><button autofocus>確認</button></dialog>
    <script>addEventListener('DOMContentLoaded', () => {
      window.config = {root: document.querySelector('#help'), opener: document.querySelector('#opener'),
        storageKey: 'test.other-app.help.v1', returnToEditor: () => document.querySelector('#editor').focus()};
      window.help = JohoToolHelp.create(config);
      document.querySelector('#editor').onclick = () => document.body.dataset.edits = Number(document.body.dataset.edits || 0) + 1;
    });</script></html>` }));
  await page.goto(fixture);
  assert.equal(await page.evaluate(() => typeof LogicEditor), 'undefined', '回路エンジンなしで共通部品が動く');
  assert.equal(await page.evaluate(() => JohoToolHelp.create(config) === help), true, '重複初期化をしない');
  await page.locator('#opener').click();
  await page.locator('#editor').click();
  await expect(page.locator('body')).toHaveAttribute('data-edits', '1');
  await expect(page.locator('#help')).toBeVisible();
  await page.locator('#help summary').click(); await page.locator('#inside').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help details')).not.toHaveAttribute('open');
  await expect(page.locator('#help summary')).toBeFocused();
  await expect(page.locator('#help')).toBeVisible();
  await page.locator('[data-help-resize="se"]').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('#after')).toBeFocused();
  await page.evaluate(() => document.querySelector('#confirm').showModal());
  await page.evaluate(() => help.open('second'));
  await expect(page.locator('.tool-help__topics')).toHaveValue('first', '確認中はヘルプを割り込ませない');
  await page.keyboard.press('Escape');
  await page.evaluate(() => help.open('second'));
  await expect(page.locator('.tool-help__topics')).toHaveValue('second');
  assert.equal(await page.evaluate(() => localStorage.getItem('joho.logic.help.v1')), null, '他アプリの設定を上書きしない');
  await page.evaluate(() => help.destroy());
  assert.equal(await page.locator('#help > [data-help-topic]').count(), 2);
  await page.evaluate(() => { window.help = JohoToolHelp.create(config); help.open(); });
  await expect(page.locator('.tool-help__topics')).toHaveValue('second');
  await page.evaluate(() => { help.destroy(); localStorage.setItem('test.other-app.help.v1', '{broken'); });
  await page.reload(); await page.locator('#opener').click();
  await expect(page.locator('.tool-help__topics')).toHaveValue('first');
  await context.addInitScript(() => { Storage.prototype.getItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
  await page.reload(); await page.locator('#opener').click();
  await expect(page.locator('#help')).toBeVisible();
  assert.deepEqual(errors, []);
  await context.close();
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  const errors = [];
  try {
    await standalone(browser);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await ready(page);
    const help = page.locator('#lc02-operation-dialog'), content = help.locator('.tool-help__content');
    const move = help.locator('.tool-help__move'), corner = help.locator('[data-help-resize="se"]');
    const topic = help.getByRole('combobox', { name: 'ヘルプの項目' });
    const before = await state(page);
    assert.equal(await page.evaluate(() => localStorage.getItem('joho.logic.help.v1')), null, '読み込むだけではヘルプ設定を書き込まない');
    await helpButton(page).click(); await expect(help).toBeVisible(); await settle(page);
    await expect(help).toHaveAttribute('aria-modal', 'false');
    await expect(help).toHaveAccessibleName('論理回路の使い方');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await expect(topic).toBeFocused();
    assert.deepEqual(await state(page), before, 'ヘルプを読むだけでは回路・履歴・保存を変えない');
    const initial = await rect(help);
    await drag(page, move, -90, -60);
    const moved = await rect(help);
    assert.ok(Math.abs(moved.x - initial.x + 90) < 2 && Math.abs(moved.y - initial.y + 60) < 2);
    await drag(page, move, 60, 30, true);
    assert.deepEqual(await rect(help), moved, 'Escapeで小窓の移動を取り消す');
    await move.focus(); await page.keyboard.press('ArrowLeft');
    assert.equal((await rect(help)).x, moved.x - 16, 'キーボードで移動');
    const oldSize = await rect(help);
    await drag(page, corner, 50, -40);
    const resized = await rect(help);
    assert.ok(resized.width > oldSize.width + 45 && resized.height < oldSize.height - 35);
    await corner.focus(); await page.keyboard.press('Shift+ArrowLeft');
    assert.equal((await rect(help)).width, resized.width - 64);
    const keptGeometry = await rect(help);
    await topic.selectOption('about'); await settle(page);
    await content.evaluate(node => { node.scrollTop = 280; });
    await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    const keptScroll = await content.evaluate(node => node.scrollTop);
    await help.getByRole('button', { name: 'ヘルプを最小化', exact: true }).click();
    await settle(page);
    assert.ok((await rect(help)).height <= 72);
    await helpButton(page).click(); await settle(page);
    assert.deepEqual(await rect(help), keptGeometry);
    assert.equal(await content.evaluate(node => node.scrollTop), keptScroll);
    await help.getByRole('button', { name: '詳しい操作方法を閉じる', exact: true }).click();
    await expect(helpButton(page)).toBeFocused();
    await page.reload(); await ready(page);
    await expect(help).toBeHidden();
    await helpButton(page).click(); await settle(page);
    await expect(topic).toHaveValue('about');
    assert.deepEqual(await rect(help), keptGeometry, '再読込後もサイズ・位置を保持');
    assert.equal(await content.evaluate(node => node.scrollTop), keptScroll, '再読込後も読んでいた位置を保持');
    assert.deepEqual(await state(page), before);

    // 小窓の外は通常操作。ヘルプ項目は操作対象に追従して勝手に切り替わらない。
    await help.getByRole('button', { name: 'ヘルプの位置とサイズを戻す' }).click();
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
    assert.equal((await state(page)).snapshot.graph.nodes.length, before.snapshot.graph.nodes.length + 1);
    await expect(help).toBeVisible(); await expect(topic).toHaveValue('about');
    const afterAdd = await page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history }));
    await content.focus(); await page.keyboard.press('Delete'); await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('ControlOrMeta+s');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history })), afterAdd,
      'ヘルプ内でDelete・Undo・保存ショートカットを発動しない');
    await help.getByRole('button', { name: 'ヘルプを開いたまま編集へ戻る' }).click();
    await expect(page.locator('.logic-editor__canvas-wrap')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    assert.equal((await state(page)).snapshot.graph.nodes.length, before.snapshot.graph.nodes.length);
    await page.keyboard.press('Escape'); await expect(help).toBeVisible();
    // 配線は未接続ORへ、ヘルプより上の位置に置いてから実マウスで接続する。
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
    const newId = await page.evaluate(() => logicWorkbenchEditor.graph.nodes.at(-1).id);
    const gate = page.locator(`.logic-editor-node[data-node-id="${newId}"]`);
    const gateBox = await rect(gate);
    await drag(page, gate, 0, 160 - gateBox.y);
    const from = page.locator('.logic-editor-port[data-node-id="input-A"][data-kind="output"]');
    const to = page.locator(`.logic-editor-port[data-node-id="${newId}"][data-kind="input"][data-port="0"]`);
    await from.dragTo(to);
    assert.equal(await page.evaluate(id => logicWorkbenchEditor.graph.wires.some(wire => wire.from === 'input-A' && wire.to === id), newId), true);
    await expect(help).toBeVisible();
    // 保存確認は引き続きモーダル。ヘルプの状態は閉じずに背面で保持。
    await page.locator('.logic-editor__canvas-wrap').focus(); await page.keyboard.press('ControlOrMeta+s');
    await expect(page.locator('#logic-file-dialog')).toBeVisible();
    assert.equal(await page.evaluate(() => document.querySelector('#logic-file-dialog').matches(':modal')), true);
    await page.keyboard.press('Escape'); await expect(help).toBeVisible();
    await topic.selectOption('export');
    await page.locator('[data-pane-button="export"]').click();
    await expect(page.locator('#export-panel')).toBeVisible(); await expect(help).toBeVisible();
    await expect(topic).toHaveValue('export');

    for (const width of [1440, 760, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['light', 'dark', 'auto']) for (const size of ['standard', 'large', 'largest']) {
        await setToolPreferences(page, theme, size); await settle(page);
        const layout = await help.evaluate(node => ({ box: node.getBoundingClientRect().toJSON(),
          content: node.querySelector('.tool-help__content').getBoundingClientRect().toJSON(),
          overflow: node.scrollWidth - node.clientWidth, bg: getComputedStyle(node).backgroundColor,
          controls: [...node.querySelectorAll('.tool-help__header button, .tool-help__footer button, select')].map(control => control.getBoundingClientRect().height) }));
        assert.ok(layout.box.x >= 0 && layout.box.right <= width && layout.box.y >= 57 && layout.box.bottom <= 844, `${name} ${width} ${theme} ${size}: 画面内`);
        assert.ok(layout.overflow <= 1 && layout.content.height >= 60, '本文と操作部が収まる');
        assert.ok(layout.controls.every(height => height >= 44), `${name} ${width} ${theme} ${size}: 操作部44px以上 ${layout.controls}`);
        if (theme === 'dark') assert.equal(layout.bg, 'rgb(37, 46, 59)');
        if (theme === 'light') assert.equal(layout.bg, 'rgb(255, 255, 255)');
      }
      await page.screenshot({ path: join(artifacts, `${name}-${width}.png`) });
    }
    await setToolPreferences(page, 'light', 'standard'); await settle(page);
    await expect(help).toHaveAttribute('data-compact', 'true');
    const short = await rect(help);
    await drag(page, move, 0, -65);
    assert.ok((await rect(help)).height > short.height + 50, '狭い画面では見出しのドラッグで高さを変更');
    await page.locator('[data-pane-button="truth"]').tap();
    await expect(page.locator('#logic-workbench-table-panel')).toBeVisible();
    await content.tap({ position: { x: 10, y: 10 } });
    await expect(page.locator('#logic-workbench-table-panel')).toBeVisible();
    await help.getByRole('button', { name: 'ヘルプを最小化', exact: true }).tap();
    await helpButton(page).tap(); await expect(help).toBeVisible();
    // 保存領域への書込み拒否も編集へ波及しない。
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
    await topic.selectOption('wires');
    await help.getByRole('button', { name: 'ヘルプの位置とサイズを戻す' }).click();
    await help.getByRole('button', { name: '詳しい操作方法を閉じる' }).click();
    await helpButton(page).click(); await expect(help).toBeVisible();
    await context.close();

    // 共通部品が取得できない時にも、回路本体は初期化・編集できる。
    const unavailable = await browser.newContext();
    await unavailable.route('**/shared/help-panel.js', route => route.abort());
    const fallback = await unavailable.newPage(); fallback.on('pageerror', error => errors.push(error.message));
    await fallback.goto(url); await ready(fallback);
    await expect(helpButton(fallback)).toBeDisabled();
    await fallback.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
    assert.equal(await fallback.evaluate(() => logicWorkbenchEditor.graph.nodes.at(-1).type), 'OR');
    await unavailable.close();
    assert.deepEqual(errors, []);
    console.log(`${name}: 非モーダル編集・配線・保存確認・移動／サイズ・取消・復元・27表示条件・タップ・障害時の保持 OK`);
  } finally { await browser.close(); }
}
