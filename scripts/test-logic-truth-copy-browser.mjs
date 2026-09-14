// 真理値表のTSVコピー。外部アプリや利用者の保存データにはアクセスしない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'logic-truth-copy-'));
const errors = [];
const andTable = 'A\tB\tF\n0\t0\t0\n0\t1\t0\n1\t0\t0\n1\t1\t1';
const state = page => page.evaluate(() => ({
  snapshot: logicWorkbenchEditor.snapshot(), history: logicWorkbenchEditor.history,
  historyIndex: logicWorkbenchEditor.historyIndex, selected: logicWorkbenchEditor.selected,
  saveStatus: document.querySelector('#save-status').textContent
}));
const lastCopy = page => page.evaluate(() => window.copyAttempts.at(-1));
console.log(`Browser artifacts: ${artifacts}`);

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(response.url()); });
    await page.addInitScript(() => {
      window.copyAttempts = [];
      window.copyMode = 'success';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: text => {
          window.copyAttempts.push(text);
          if (window.copyMode === 'reject') return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
          if (window.copyMode === 'pending') return new Promise((resolve, reject) => { window.finishCopy = resolve; window.rejectCopy = reject; });
          return Promise.resolve();
        }
      } });
    });
    await page.goto(new URL('tools/logic/', base).href);
    await page.locator('body.logic-tool-ready').waitFor();
    const copy = page.getByRole('button', { name: '真理値表をコピー', exact: true });
    const fallback = page.locator('#truth-copy-dialog');
    const text = page.locator('#truth-copy-text');
    await expect(copy).toBeEnabled();
    const before = await state(page);
    await copy.press('Enter');
    await expect(page.locator('#operation-hint')).toContainText('真理値表をコピーしました');
    await expect(copy).toBeFocused();
    assert.equal(await lastCopy(page), andTable);
    assert.deepEqual(await state(page), before, 'copy preserves the circuit, input values, selection, history and save state');
    await copy.press('Tab');
    await expect(page.locator('[data-pane="truth"] [data-close-side]')).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(copy).toBeFocused();

    await page.locator('#logic-workbench-table tbody tr').last().press('Enter');
    await page.getByRole('button', { name: '0/1の表示を切り替える', exact: true }).click();
    const selectedRowState = await state(page);
    await copy.click();
    assert.equal(await lastCopy(page), andTable, 'all rows are copied even with a different active row and hidden signals');
    assert.deepEqual(await state(page), selectedRowState);

    // 4入力・2出力。出力IDで値を対応付け、画面と同じ添字・列順を保つ。
    await page.evaluate(() => {
      const names = ['A', 'B', 'C', 'D'];
      logicWorkbenchEditor.restore({ inputNames: names, inputValues: { A: 1, B: 0, C: 0, D: 1 }, graph: {
        nodes: [
          ...names.map((name, i) => ({ id: `input-${name}`, type: 'input', name, x: 72, y: 70 + i * 115 })),
          { id: 'and', type: 'AND', x: 400, y: 120 }, { id: 'or', type: 'OR', x: 400, y: 360 },
          { id: 'out-second-id', type: 'output', x: 828, y: 120 }, { id: 'out-first-id', type: 'output', x: 828, y: 360 }
        ],
        wires: [
          { id: 'a', from: 'input-A', to: 'and', port: 0 }, { id: 'b', from: 'input-B', to: 'and', port: 1 },
          { id: 'c', from: 'input-C', to: 'or', port: 0 }, { id: 'd', from: 'input-D', to: 'or', port: 1 },
          { id: 'f1', from: 'and', to: 'out-second-id', port: 0 }, { id: 'f2', from: 'or', to: 'out-first-id', port: 0 }
        ]
      } });
      logicWorkbenchEditor.resetHistory();
    });
    const expected = [
      'A\tB\tC\tD\tF₁\tF₂',
      ...Array.from({ length: 16 }, (_, i) => {
        const bits = [i >> 3 & 1, i >> 2 & 1, i >> 1 & 1, i & 1];
        return [...bits, bits[0] & bits[1], bits[2] | bits[3]].join('\t');
      })
    ].join('\n');
    const multipleState = await state(page);
    await copy.click();
    assert.equal(await lastCopy(page), expected);
    const visibleTable = await page.locator('#logic-workbench-table tr').evaluateAll(rows => rows.map(row => [...row.children].map(cell => cell.textContent).join('\t')).join('\n'));
    assert.equal(visibleTable, expected, 'copy exactly matches displayed headings, rows and columns');
    assert.deepEqual(await state(page), multipleState);

    await page.getByRole('button', { name: '出力を追加', exact: true }).click();
    await expect(copy).toBeDisabled();
    await expect(page.locator('#logic-workbench-table table')).toHaveCount(0);
    await expect(copy).toHaveAttribute('title', /回路が完成すると/);
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    await expect(copy).toBeEnabled();

    // 権限待ちの多重実行を防ぎ、成功前に「コピーしました」と表示しない。
    await page.evaluate(() => { window.copyMode = 'pending'; logicWorkbenchEditor.notice = ''; logicWorkbenchEditor.render({ notify: false }); });
    await copy.click(); await expect(copy).toBeDisabled();
    await expect(page.locator('#operation-hint')).not.toContainText('コピーしました');
    await page.evaluate(() => { logicWorkbenchEditor.render({ notify: false }); });
    await expect(copy).toBeDisabled();
    await page.evaluate(() => window.finishCopy());
    await expect(copy).toBeEnabled();
    await expect(page.locator('#operation-hint')).toContainText('真理値表をコピーしました');

    // 拒否時はテキスト選択による代替。Delete/Cmd+Z等をエディタへ流さない。
    await page.evaluate(() => { window.copyMode = 'reject'; });
    const beforeFallback = await state(page);
    await copy.click(); await expect(fallback).toBeVisible();
    await expect(text).toHaveValue(expected); await expect(text).toBeFocused();
    assert.deepEqual(await text.evaluate(node => [node.selectionStart, node.selectionEnd]), [0, expected.length]);
    await expect(page.locator('#operation-hint')).not.toContainText('コピーしました');
    await text.press('Delete'); await text.press('ControlOrMeta+z');
    await expect(text).toHaveValue(expected); assert.deepEqual(await state(page), beforeFallback);
    await page.locator('#truth-copy-select').press('Enter'); await expect(text).toBeFocused();
    await page.keyboard.press('Escape'); await expect(copy).toBeFocused();
    await copy.click(); await fallback.getByRole('button', { name: '真理値表のコピーを閉じる' }).click();
    await expect(copy).toBeFocused();

    // API自体のない環境も手動コピーへ。390px・ダーク・最大文字サイズで操作可能。
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.dataset.resolvedTheme = 'dark';
      document.documentElement.dataset.textSize = 'largest';
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const copyBox = await copy.boundingBox(); assert.ok(copyBox.width >= 44 && copyBox.height >= 44);
    await copy.click(); await expect(fallback).toBeVisible(); await expect(text).toHaveValue(expected);
    const box = await fallback.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: join(artifacts, `${name}-manual-copy-mobile.png`) });
    await page.mouse.click(2, 60); await expect(fallback).toBeHidden(); await expect(copy).toBeFocused();
    console.log(`${name}: TSV, all inputs/outputs, unchanged editing state, keyboard, denied/unavailable clipboard and mobile passed`);

    if (name === 'chrome') {
      // 専用ブラウザコンテキストで実際のコピーも検証。書き込んだ直後のテスト用TSVだけを読み戻す。
      const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], hasTouch: true, viewport: { width: 390, height: 844 } });
      const real = await context.newPage();
      await real.goto(new URL('tools/logic/', base).href);
      await real.locator('body.logic-tool-ready').waitFor();
      await real.locator('[data-pane-button="truth"]').tap();
      await real.locator('#truth-copy').tap();
      await expect(real.locator('#operation-hint')).toContainText('真理値表をコピーしました');
      assert.equal(await real.evaluate(() => navigator.clipboard.readText()), andTable);
      await context.close();
      console.log('chrome: actual clipboard write/read-back and touch passed');
    }
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-truth-copy-browser: passed');
