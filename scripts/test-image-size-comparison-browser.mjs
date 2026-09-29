// dr41の左右比較を実際の操作で検証する。事前にリポジトリをHTTPで配信する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = require(modulePath);
const { expect } = require(`${modulePath}/test`);
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8784/';
const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const missing = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() === 404 && response.url().startsWith(baseURL)) missing.push(response.url()); });
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
const number = value => value.toLocaleString('ja-JP');
try {
  await page.goto(new URL('dr41.html#headline_4', baseURL).href);
  const lab = page.locator('[data-image-size-comparison]');
  const gray = lab.locator('[data-image-size-card="gray"]');
  const rgb = lab.locator('[data-image-size-card="rgb"]');
  const next = lab.locator('[data-image-size-next]');
  const reset = lab.locator('[data-image-size-reset]');
  await expect(gray.locator('[data-image-size-total]')).toHaveText('48bit ＝ 6B');
  await expect(rgb.locator('[data-image-size-total]')).toHaveText('384bit ＝ 48B');
  await expect(lab.locator('[data-image-size-previous]')).toBeDisabled();

  // 画素数4通り×グレースケール8通り。画面の式・容量・符号長を算術で独立照合。
  for (const width of [4, 8]) for (const height of [4, 8]) for (let bits = 1; bits <= 8; bits++) {
    await reset.click();
    await lab.locator('[data-image-size-width]').selectOption(String(width));
    await lab.locator('[data-image-size-height]').selectOption(String(height));
    await lab.locator('[data-image-size-bits]').selectOption(String(bits));
    await expect(gray.locator('[data-image-size-total]')).toHaveText(`${number(width * height * bits)}bit ＝ ${number(width * height * bits / 8)}B`);
    await expect(rgb.locator('[data-image-size-total]')).toHaveText(`${number(width * height * 24)}bit ＝ ${number(width * height * 3)}B`);
    await expect(gray.locator('.im-size-bit-digits > span')).toHaveCount(bits);
    await expect(rgb.locator('.im-size-bit-digits > span')).toHaveCount(24);
    for (let stage = 0; stage < 4; stage++) {
      await expect(lab).toHaveAttribute('data-stage', String(stage));
      for (const [card, bpp] of [[gray, bits], [rgb, 24]]) {
        await expect(card.locator('[data-pixel-index]')).toHaveCount(width * height);
        const formula = card.locator('[data-image-size-calculation] > span:last-child');
        if (stage === 0) await expect(formula).toContainText(`${bpp}bit`);
        if (stage === 1) await expect(formula).toHaveText(`${width} × ${bpp} ＝ ${width * bpp}bit`);
        if (stage === 2) await expect(formula).toHaveText(`${width} × ${height} × ${bpp} ＝ ${number(width * height * bpp)}bit`);
        if (stage === 3) await expect(formula).toHaveText(`${width} × ${height} × ${bpp} ÷ 8 ＝ ${number(width * height * bpp / 8)}B`);
      }
      if (stage < 3) await next.click();
    }
    await expect(next).toBeDisabled();
    await expect(lab.locator('[data-image-size-comparison-note]')).toContainText(bits === 7 ? '≈ 3.429倍' : `＝ ${24 / bits}倍`);
  }

  // 2倍ボタンは累積倍率ではなく4×4基準。左右で同じ位置、キー操作とフォーカスを保つ。
  await reset.click();
  for (const [preset, bytes] of [['8,4', 12], ['4,8', 12], ['8,8', 24]]) {
    await lab.locator(`[data-image-size-preset="${preset}"]`).click();
    await expect(gray.locator('[data-image-size-total]')).toContainText(`＝ ${bytes}B`);
  }
  await rgb.locator('[data-pixel-index="63"]').click();
  await expect(gray.locator('[data-pixel-index="63"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(rgb.locator('[data-image-size-position]')).toHaveText('選択：8行8列の1画素');
  await rgb.locator('[data-pixel-index="63"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(rgb.locator('[data-pixel-index="62"]')).toBeFocused();
  await expect(gray.locator('[data-pixel-index="62"]')).toHaveAttribute('aria-pressed', 'true');
  assert.equal(new URL(page.url()).hash, '#headline_4');
  await lab.locator('[data-image-size-width]').selectOption('4');
  await lab.locator('[data-image-size-height]').selectOption('4');
  await expect(gray.locator('[data-pixel-index="15"]')).toHaveAttribute('aria-pressed', 'true');
  await next.click();
  await expect(gray.locator('.is-counted')).toHaveCount(4);
  await expect(rgb.locator('.is-counted')).toHaveCount(4);
  await lab.locator('[data-image-size-previous]').click();
  await expect(lab).toHaveAttribute('data-stage', '0');
  await lab.locator('[data-image-size-bits]').selectOption('8');
  await expect(lab.locator('[data-image-size-comparison-note]')).toContainText('＝ 3倍');
  await page.evaluate(() => { location.hash = '#headline_raster_vector'; });
  await expect(page.locator('[data-image-formats]')).toBeVisible();
  await page.evaluate(() => { location.hash = '#headline_4'; });
  await expect(gray.locator('[data-image-size-total]')).toHaveText('128bit ＝ 16B');

  // 全幅・テーマ・文字サイズで左右／上下配置とページ・部品の横はみ出しを確認。
  for (const width of [1440, 1024, 720, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark', 'auto']) for (const size of ['standard', 'large', 'xlarge']) {
      await page.evaluate(({ theme, size }) => { window.siteTheme.setPreference(theme, { persist: false }); window.siteTextSize.setPreference(size, { persist: false }); }, { theme, size });
      // 共通ナビゲーションがrequestAnimationFrameで幅を再計測してから評価する。
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await lab.evaluate(host => {
        const [a, b] = [...host.querySelectorAll('[data-image-size-card]')].map(element => element.getBoundingClientRect());
        return { sideBySide: Math.abs(a.top - b.top) < 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          overflowing: [...host.querySelectorAll('.im-size-card, .im-size-pixel-info, .im-size-bits, .im-size-controls')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className) };
      });
      assert.equal(layout.sideBySide, width > 760, `${width}/${theme}/${size}の列配置`);
      assert.equal(layout.pageOverflow, false, `${width}/${theme}/${size}のページ幅`);
      assert.deepEqual(layout.overflowing, [], `${width}/${theme}/${size}の部品幅`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { window.siteTheme.setPreference('light', { persist: false }); window.siteTextSize.setPreference('standard', { persist: false }); });
  await reset.click();
  if (process.env.JOHO_SCREENSHOT) await page.screenshot({ path: process.env.JOHO_SCREENSHOT });
  await page.emulateMedia({ media: 'print' });
  await expect(gray.locator('[data-image-size-total]')).toBeVisible();
  await expect(next).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await touch.goto(new URL('dr41.html#headline_4', baseURL).href);
  await touch.locator('[data-image-size-card="gray"] [data-pixel-index="5"]').tap();
  await expect(touch.locator('[data-image-size-card="rgb"] [data-pixel-index="5"]')).toHaveAttribute('aria-pressed', 'true');
  await touch.close();
  const plain = await browser.newPage({ javaScriptEnabled: false });
  await plain.goto(new URL('dr41.html#headline_4', baseURL).href);
  await expect(plain.locator('[data-image-size-fallback]').first()).toBeVisible();
  await expect(plain.locator('[data-image-size-fallback]').last()).toContainText('16,777,216色');
  await expect(plain.locator('[data-image-size-next]')).toBeHidden();
  await plain.close();

  // 画像の読込失敗時にも、既存の静的な計算説明を保持する。
  const failedImage = await browser.newPage();
  await failedImage.route('**/balloon.svg', route => route.abort());
  await failedImage.goto(new URL('dr41.html#headline_4', baseURL).href);
  await expect(failedImage.locator('[data-image-size-fallback]').first()).toContainText('4×4×3＝48bit＝6B');
  await expect(failedImage.locator('[data-image-size-fallback]').first()).toBeVisible();
  await expect(failedImage.locator('[data-image-size-next]')).toBeHidden();
  await failedImage.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  console.log(`${engine}: 32条件×4段階の左右計算、画素同期、倍率、キー・タップ・画面幅・テーマ・文字サイズ・静的表示の検証に合格`);
} finally {
  await browser.close();
}
