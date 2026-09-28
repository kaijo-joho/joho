// 最小ビット数の4穴を実際のdr31で操作。＝なし、入力時の非計算、表示と操作を検証。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { expect } = require(`${process.env.PLAYWRIGHT_MODULE || 'playwright'}/test`);
const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8771/';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
await page.addInitScript(() => {
  window.scaffoldEvaluations = 0;
  let core;
  Object.defineProperty(window, 'LessonFormulaCore', { configurable: true, get: () => core, set(api) {
    core = { ...api, evaluate(...args) { window.scaffoldEvaluations++; return api.evaluate(...args); } };
  } });
});
try {
  await page.goto(new URL('dr31.html#headline_5', baseURL).href);
  const example = page.locator('[data-sound-reference-example="bits-16levels"]');
  await example.locator('> summary').click();
  const host = example.locator('[data-formula-builder]');
  const lower = host.locator('[data-formula-blank="lower"]');
  const bound = host.locator('[data-formula-blank="bound"]');
  const upper = host.locator('[data-formula-blank="upper"]');
  const answer = host.locator('[data-formula-answer]');
  await expect(host.locator('[data-formula-blank]')).toHaveCount(3);
  await expect(host.locator('[data-formula-operator="="]')).toHaveCount(0);
  await expect(host.locator('.formula-answer-equals')).toHaveText('∴したがって');
  assert.doesNotMatch(await host.innerText(), /\blog\b|対数/, '対数を使う説明や入力操作を要求しない');
  for (const field of [lower, bound, upper, answer]) await expect(field).toHaveValue('');
  await expect(host.locator('[data-formula-judge]')).toBeDisabled();

  // 中央の値はネイティブのドラッグ、指数と結論は直接入力できる。
  await host.locator('[data-formula-quantity="levels"]').dragTo(bound);
  await expect(bound).toHaveValue('16');
  await lower.fill('2'); await upper.fill('4'); await answer.fill('4');
  assert.equal(await page.evaluate(() => window.scaffoldEvaluations), 0, '入力・ドラッグだけでは内部計算しない');
  await host.locator('[data-formula-judge]').click();
  await expect(host.locator('.formula-feedback')).toContainText('立式：×　答え：○');
  await expect(lower).toHaveAttribute('aria-invalid', 'true');
  await lower.fill('3');
  await host.locator('[data-formula-judge]').click();
  await expect(host.locator('.formula-feedback')).toContainText('立式：○　答え：○');

  // 未記入を誤答として確定せず、記入箇所を案内する。
  await upper.fill(''); await host.locator('[data-formula-judge]').click();
  await expect(host.locator('.formula-feedback-summary')).toContainText('まだ判定していません');
  await expect(host.locator('.formula-feedback-summary')).toContainText('右の指数');
  await upper.fill('4'); await answer.fill('5'); await host.locator('[data-formula-judge]').click();
  await expect(host.locator('.formula-feedback')).toContainText('立式：○　答え：×');
  await answer.fill('4');
  await lower.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(new URL(page.url()).hash, '#headline_5', '入力欄の矢印はスライドを切り替えない');
  await page.keyboard.press('Tab');
  await expect(bound).toBeFocused();

  await page.evaluate(() => { location.hash = '#headline_4'; });
  await page.evaluate(() => { location.hash = '#headline_5'; });
  await expect(lower).toHaveValue('3'); await expect(answer).toHaveValue('4');
  if (engine === 'chrome') {
    await host.evaluate(node => node.requestFullscreen());
    await expect(lower).toHaveValue('3');
    await page.evaluate(() => document.exitFullscreen());
    await expect(answer).toHaveValue('4');
  }

  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ['light', 'dark', 'system']) {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      for (const size of ['standard', 'large', 'xlarge']) {
        await page.evaluate(({ theme, size }) => {
          window.siteTheme.setPreference(theme, { persist: false });
          window.siteTextSize.setPreference(size, { persist: false });
        }, { theme, size });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await host.evaluate(node => ({
          pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          hostOverflow: node.scrollWidth > node.clientWidth + 1,
          heights: [...node.querySelectorAll('input,button')].filter(item => item.checkVisibility({ visibilityProperty: true })).map(item => item.getBoundingClientRect().height)
        }));
        assert.equal(layout.pageOverflow, false, `${width}/${theme}/${size}: ページの横はみ出しなし`);
        assert.equal(layout.hostOverflow, false, `${width}/${theme}/${size}: 穴埋め枠の横はみ出しなし`);
        assert.ok(layout.heights.every(height => height >= 43.5), `${width}/${theme}/${size}: 44pxの操作領域`);
      }
    }
  }
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await touch.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await touch.goto(new URL('dr31.html#headline_5', baseURL).href);
  const touchExample = touch.locator('[data-sound-reference-example="bits-16levels"]');
  await touchExample.locator('> summary').tap();
  await touchExample.locator('[data-formula-blank="bound"]').tap();
  await touchExample.locator('[data-formula-quantity="levels"]').tap();
  await expect(touchExample.locator('[data-formula-blank="bound"]')).toHaveValue('16');
  await touch.close();
  assert.deepEqual(errors, [], 'ブラウザ例外なし');
  console.log(`formula scaffold (${engine}): 4穴・採点分離・drag/tap/keyboard・27表示条件 OK`);
} finally { await browser.close(); }
