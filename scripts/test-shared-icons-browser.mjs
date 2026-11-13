import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const { PNG } = require('pngjs');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const artifacts = await mkdtemp(join(tmpdir(), 'shared-icons-'));
const sprite = await readFile(new URL('../tools/shared/ui-icons.svg', import.meta.url), 'utf8');
const symbols = [...sprite.matchAll(/<symbol id="([^"]+)" viewBox="0 0 24 24">([\s\S]*?)<\/symbol>/g)].map(([, id, children]) => [id, children]);

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  if (process.env.JOHO_TEST_BROWSERS && !process.env.JOHO_TEST_BROWSERS.split(',').includes(name)) continue;
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const fixture = new URL('tools/shared/icon-test', base).href;
    await page.route(fixture, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ja"><meta charset="utf-8">
      <link rel="stylesheet" href="ui-kit.css"><link rel="stylesheet" href="file-menu.css">
      <style>:root{--bg:#fff;--panel:#fff;--text:#123;--line:#ccc;--accent:#2563eb;--hover:#eee}body{background:var(--bg);color:var(--text);font:14px sans-serif}.gallery{display:grid;grid-template-columns:repeat(8,22px);gap:12px;width:max-content;padding:16px;background:var(--bg)}.gallery svg{display:block}button:focus-visible,summary:focus-visible{outline:2px solid var(--accent)}button:disabled{opacity:.4}button[aria-pressed=true]{background:var(--accent)}#sample{width:44px;height:44px}</style>
      <script src="ui-icons.js"></script><script src="ui-kit.js"></script><script src="file-menu.js"></script>
      <div id="actual" class="gallery"></div><div id="reference" class="gallery"></div>
      <button id="sample" aria-label="元に戻す" data-tip="元に戻す"></button><details id="file"></details>
      <script>window.actions=[];window.fileMenu=JohoFileMenu.mount(document.querySelector('#file'),{onAction:id=>actions.push(id)});window.view=JohoUI.theme();JohoUI.tooltip({keyboard:true});</script></html>` }));
    await page.goto(fixture);
    await page.evaluate(symbols => {
      actual.innerHTML = symbols.map(([id]) => JohoIcons.svg(id)).join('');
      reference.innerHTML = symbols.map(([, body]) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round">' + body + '</svg>').join('');
      sample.append(JohoIcons.create('undo'));
    }, symbols);
    await page.waitForLoadState('networkidle');
    for (const theme of ['light', 'dark', 'auto']) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.evaluate(theme => view.set({ theme }), theme);
      const actual = await page.locator('#actual').screenshot({ path: join(artifacts, name + '-' + theme + '.png') });
      const expected = await page.locator('#reference').screenshot({ path: join(artifacts, name + '-' + theme + '-reference.png') });
      const a = PNG.sync.read(actual), b = PNG.sync.read(expected);
      assert.deepEqual([a.width, a.height], [b.width, b.height]);
      let differingPixels = 0, maxDelta = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        let delta = 0;
        for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i + c] - b.data[i + c]));
        if (delta) differingPixels++;
        maxDelta = Math.max(maxDelta, delta);
      }
      // 異なる描画位置で生じる輪郭の微小な丸めだけを許容する。座標そのものは単体検証で完全一致。
      assert.ok(maxDelta <= 4 && differingPixels <= a.width * a.height * .001,
        `${name}/${theme}: 46 sprite/inline shapes (different=${differingPixels}, maxDelta=${maxDelta})`);
      const paint = await page.locator('#sample svg').evaluate(svg => {
        const s = getComputedStyle(svg); return { stroke: s.stroke, color: getComputedStyle(svg.parentElement).color, width: s.strokeWidth, fill: s.fill, cap: s.strokeLinecap, join: s.strokeLinejoin };
      });
      assert.deepEqual(paint, { stroke: paint.color, color: paint.color, width: '1.7px', fill: 'none', cap: 'round', join: 'round' });
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-resolved-theme', 'light');
    await page.locator('#sample').focus();
    await expect(page.locator('.joho-tip')).toHaveText('元に戻す');
    assert.notEqual(await page.locator('#sample').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    await page.evaluate(() => { sample.disabled = true; sample.onclick = () => actions.push('undo'); sample.click(); });
    assert.deepEqual(await page.evaluate(() => actions), []);
    await page.evaluate(() => { sample.disabled = false; sample.setAttribute('aria-pressed', 'true'); });
    await expect(page.locator('#sample')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => {
      const icon = sample.querySelector('svg'); icon.classList.add('custom'); icon.style.margin = '2px';
      JohoIcons.apply(icon, 'redo');
    });
    await expect(page.locator('#sample svg')).toHaveClass('joho-icon custom');
    await expect(page.locator('#sample svg')).toHaveAttribute('data-joho-icon', 'redo');
    assert.equal(await page.locator('#sample svg').evaluate(svg => svg.style.margin), '2px');
    await page.locator('#file summary').focus(); await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-file-action="new"]')).toBeFocused();
    await page.keyboard.press('Enter'); assert.deepEqual(await page.evaluate(() => actions), ['new']);
    await expect(page.locator('#file summary')).toBeFocused();
    await page.evaluate(() => fileMenu.update({ autosaving: true, disabled: true }));
    await expect(page.locator('[data-file-action="auto"]')).toHaveText('ファイルへの自動保存を停止');
    await expect(page.locator('[data-file-action="auto"] svg')).toHaveAttribute('data-joho-icon', 'stop');
    await expect(page.locator('[data-file-action="save"]')).toBeDisabled();
    await page.evaluate(() => fileMenu.update());
    await expect(page.locator('[data-file-action="auto"] svg')).toHaveAttribute('data-joho-icon', 'refresh');
    // 追加のJSを使わない既存利用側も、同じ図柄で動く。
    await page.route('**/ui-icons.js', route => route.abort());
    await page.reload();
    await expect(page.locator('#file summary svg')).toHaveAttribute('data-joho-icon', 'file');
    assert.equal(await page.evaluate(() => typeof JohoIcons), 'undefined');
    await page.locator('#file summary').press('Enter');
    await page.locator('[data-file-action="save"]').click();
    assert.deepEqual(await page.evaluate(() => actions), ['save']);
    await page.route('**/ui-icons.svg*', route => route.abort());
    await page.reload(); await page.locator('#file summary').press('Enter');
    await page.locator('[data-file-action="new"]').click();
    assert.deepEqual(await page.evaluate(() => actions), ['new'], 'SVGの取得失敗でも操作・名前を維持');
    assert.deepEqual(errors, []);
    await page.close();

    const index = await browser.newPage();
    await index.goto(new URL('tools/index.html', base).href);
    for (const width of [1440, 720, 390]) {
      await index.setViewportSize({ width, height: 900 });
      for (const theme of ['auto', 'light', 'dark']) {
        await index.locator('#display-settings').evaluate(node => { node.open = true; });
        await index.locator(`[data-theme-choice="${theme}"]`).click();
        await expect(index.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(index.locator(`[data-theme-choice="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(index.locator('#current-theme-icon')).toHaveAttribute('href', 'shared/ui-icons.svg?v=20261113#theme-' + theme);
        await index.waitForLoadState('networkidle');
        assert.equal(await index.locator('#current-theme-icon').evaluate(use => use.parentElement.getBoundingClientRect().width), 22);
        assert.equal(await index.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await index.locator('[data-size-choice="largest"]').click();
      await index.keyboard.press('Escape'); await expect(index.locator('#display-settings summary')).toBeFocused();
    }
    await index.screenshot({ path: join(artifacts, name + '-index-390.png') });
    await index.close();
    console.log(`${name}: 46 rendered icons x 3 themes, state/accessibility, file-menu compatibility/failure, tools index 1440/720/390px: OK`);
  } finally { await browser.close(); }
}
console.log('Artifacts: ' + artifacts);
