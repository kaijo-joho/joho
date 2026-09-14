import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8766/';
const selected = (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',');
const artifacts = process.env.JOHO_TEST_SCREENSHOTS;
async function load(page, path) {
  await page.goto(new URL(path, base).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function slide(page, number) {
  await page.evaluate(n => { location.hash = `#headline_${n}`; }, number);
  await expect(page.locator(`#headline_${number}`)).toBeVisible();
}
async function fits(page, label, desktop = false) {
  const box = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.lesson-slide')].find(s => !s.hidden);
    return { pageWidth: document.documentElement.scrollWidth, width: innerWidth, slideWidth: s.scrollWidth, visibleWidth: s.clientWidth, height: s.clientHeight, scroll: s.scrollHeight };
  });
  assert.ok(box.pageWidth <= box.width + 1, `${label}: ページ横はみ出し ${JSON.stringify(box)}`);
  assert.ok(box.slideWidth <= box.visibleWidth + 1, `${label}: スライド横はみ出し ${JSON.stringify(box)}`);
  if (desktop) assert.ok(box.scroll <= box.height + 2, `${label}: 標準サイズの本文は縦スクロールなし ${JSON.stringify(box)}`);
}
async function dialog(page, id) {
  const trigger = page.locator(`[data-lesson-supplement-open="${id}"]`);
  const panel = page.locator(`#${id}`);
  await trigger.click(); await expect(panel).toBeVisible();
  await expect(panel.locator('[data-lesson-supplement-close]')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Escape'); await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
}
for (const name of selected) {
  const browser = await (name === 'chrome' ? chromium.launch({ channel: process.env.JOHO_CHROME_CHANNEL || 'chrome' }) : webkit.launch());
  try {
    for (const width of [1440, 720, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, colorScheme: 'light', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', error => failures.push(error.message));
      page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
      for (const id of ['cp11', 'cp12']) {
        await load(page, `${id}.html`);
        await expect(page.locator('.lesson-slide')).toHaveCount(7);
        await expect(page.locator('#page_header')).toContainText(id === 'cp11' ? '1-1. コンピュータの構成と動作' : '1-2. ソフトウェアとファイル管理');
        for (let i = 1; i <= 6; i++) {
          await slide(page, i); await fits(page, `${name} ${id} ${width} #${i}`, width === 1440);
          if (artifacts && [1, 3].includes(i) && [1440, 390].includes(width)) await page.screenshot({ path: `${artifacts}/${name}-${id}-${width}-${i}.png` });
        }
      }
      await load(page, 'cp11.html#device-input');
      await expect(page.locator('#device-input')).toBeVisible();
      await page.locator('[data-lesson-view="input"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#device-control')).toBeVisible();
      assert.equal(new URL(page.url()).hash, '#device-control');
      await slide(page, 2);
      const memory = page.locator('[data-cp-demo="memory"]');
      for (let i = 0; i < 2; i++) await memory.getByRole('button', { name: '次へ', exact: true }).click();
      await expect(memory.locator('.cp-memory-value').first()).toHaveText('「こんにちは！」');
      await expect(memory.locator('.cp-memory-value').last()).toHaveText('「こんにちは」');
      for (let i = 0; i < 2; i++) await memory.getByRole('button', { name: '次へ', exact: true }).click();
      await expect(memory.locator('.cp-memory-value').first()).toHaveText('文書なし');
      await expect(memory.locator('.cp-memory-value').last()).toHaveText('「こんにちは！」');
      await memory.getByRole('button', { name: '戻る', exact: true }).press('Enter');
      await expect(memory).toHaveAttribute('data-step', '3');
      await slide(page, 3);
      const cpu = page.locator('[data-cp-demo="cpu"]:not([data-cp-detail])');
      for (let i = 0; i < 9; i++) await cpu.getByRole('button', { name: '次へ', exact: true }).click();
      await expect(cpu.locator('[data-address="12"] td')).toHaveText('8');
      await expect(cpu.locator('.cp-register-value')).toHaveText('8');
      await dialog(page, 'cp-cpu-detail');
      await slide(page, 1); await slide(page, 3);
      await expect(cpu).toHaveAttribute('data-step', '9');
      await slide(page, 4); await dialog(page, 'cp-performance-detail');
      const clock = page.locator('[data-cp-demo="clock"]');
      for (let i = 0; i < 3; i++) await clock.getByRole('button', { name: '次へ', exact: true }).click();
      await expect(clock.locator('.cp-clock-formula')).toContainText('4億回／秒');
      await slide(page, 5);
      await expect(page.locator('.cp-terms details[open]')).toHaveCount(0);
      await page.locator('.cp-terms summary').first().press('Enter');
      await expect(page.locator('.cp-terms details').first()).toHaveAttribute('open', '');
      await slide(page, 6);
      const quiz = page.locator('#quiz-devices');
      await quiz.getByRole('button', { name: '答え合わせ' }).click();
      await expect(quiz.locator('.cp-feedback')).toHaveAttribute('data-result', 'empty');
      await quiz.getByLabel('入力装置', { exact: true }).check();
      await quiz.getByRole('button', { name: '答え合わせ' }).click();
      await expect(quiz.locator('.cp-feedback')).toHaveAttribute('data-result', 'correct');
      await page.locator('[data-lesson-view="execution"]').click();
      const order = page.locator('#quiz-execution select');
      for (const [i, value] of ['1', '2', '0'].entries()) await order.nth(i).selectOption(value);
      await page.locator('#quiz-execution').getByRole('button', { name: '答え合わせ' }).click();
      await expect(page.locator('#quiz-execution .cp-feedback')).toHaveAttribute('data-result', 'correct');
      await page.locator('[data-lesson-view="clock"]').click();
      const number = page.locator('#quiz-clock');
      await number.getByLabel('1秒間の命令の実行回数').fill('４');
      await number.getByLabel('単位').selectOption('100000000');
      await number.getByLabel('1秒間の命令の実行回数').press('Enter');
      await expect(number.locator('.cp-feedback')).toHaveAttribute('data-result', 'correct');
      await number.getByRole('button', { name: '次の問題' }).click();
      await expect(number.locator('.cp-quiz-heading')).toBeFocused();
      await expect(number.locator('.cp-feedback')).toBeEmpty();
      await load(page, 'cp12.html#headline_3');
      const files = page.locator('[data-cp-files]');
      const activate = async locator => width === 390 ? locator.tap() : locator.click();
      await activate(files.getByRole('button', { name: '情報 フォルダを開く' }));
      await activate(files.getByRole('button', { name: 'レポート フォルダを開く' }));
      await activate(files.getByRole('button', { name: '原稿.docx 文書' }));
      await expect(files.locator('.cp-file-selection')).toContainText('授業 ／ 情報 ／ レポート ／ 原稿.docx');
      await files.getByRole('button', { name: '授業', exact: true }).click();
      await files.getByRole('button', { name: '英語 フォルダを開く' }).press('Enter');
      await files.getByRole('button', { name: 'レポート フォルダを開く' }).press('Enter');
      await files.getByRole('button', { name: '原稿.docx 文書' }).press('Enter');
      await expect(files.locator('.cp-file-selection')).toContainText('授業 ／ 英語 ／ レポート ／ 原稿.docx');
      await slide(page, 2);
      for (const role of ['memory', 'io', 'file', 'user', 'task']) {
        await page.locator(`#cp-os-roles [data-lesson-view="${role}"]`).click();
        await expect(page.locator(`#os-${role}`)).toBeVisible();
      }
      await dialog(page, 'cp-os-detail');
      await slide(page, 4); await dialog(page, 'cp-extension-detail');
      for (const kind of ['image', 'media', 'other', 'document']) {
        await page.locator(`#cp-file-kinds [data-lesson-view="${kind}"]`).click();
        await expect(page.locator(`#kind-${kind}`)).toBeVisible();
        await fits(page, `${name} ${width} ${kind}`);
      }
      await slide(page, 6);
      for (const [bank, label] of [['software', '基本ソフトウェア（OS）'], ['os', 'タスク管理'], ['files', 'png']]) {
        await page.locator(`#cp12-practice [data-lesson-view="${bank}"]`).click();
        await page.locator(`#quiz-${bank}`).getByLabel(label, { exact: true }).check();
        await page.locator(`#quiz-${bank}`).getByRole('button', { name: '答え合わせ' }).click();
        await expect(page.locator(`#quiz-${bank} .cp-feedback`)).toHaveAttribute('data-result', 'correct');
      }
      assert.deepEqual(failures, [], `${name} ${width}: JSエラー・404なし`);
      await context.close();
      console.log(`${name} ${width}px: 12枚・教材操作・問題・タップ・キーボード・dialog OK`);
    }
    const settingsContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const settingsPage = await settingsContext.newPage();
    for (const width of [1440, 390]) {
      await settingsPage.setViewportSize({ width, height: 900 });
      for (const id of ['cp11', 'cp12']) {
        await load(settingsPage, `${id}.html`);
        for (const theme of ['system', 'light', 'dark']) {
          for (const size of ['standard', 'large', 'xlarge']) {
            await settingsPage.evaluate(([theme, size]) => {
              window.siteTheme.setPreference(theme, { persist: false });
              window.siteTextSize.setPreference(size, { persist: false });
            }, [theme, size]);
            for (let i = 1; i <= 6; i++) {
              await slide(settingsPage, i);
              await fits(settingsPage, `${name} ${id} ${width} ${theme} ${size} #${i}`);
            }
          }
        }
        await slide(settingsPage, id === 'cp11' ? 3 : 2);
        await dialog(settingsPage, id === 'cp11' ? 'cp-cpu-detail' : 'cp-os-detail');
        if (artifacts) await settingsPage.screenshot({ path: `${artifacts}/${name}-${id}-${width}-dark-xlarge.png` });
      }
    }
    await settingsPage.setViewportSize({ width: 1440, height: 900 });
    await load(settingsPage, 'cp11.html#headline_3');
    const themeMenu = settingsPage.locator('.site-theme-menu > button');
    await themeMenu.click();
    await settingsPage.getByRole('menuitemradio', { name: 'ライトモード', exact: true }).click();
    await expect(settingsPage.locator('html')).toHaveAttribute('data-theme', 'light');
    await settingsPage.locator('[data-lesson-supplement-open="cp-cpu-detail"]').click();
    await expect(themeMenu).toHaveAttribute('aria-expanded', 'false');
    await settingsPage.keyboard.press('Escape');
    const fullscreen = settingsPage.getByRole('button', { name: '全画面表示メニューを開く', exact: true });
    await fullscreen.click();
    await settingsPage.getByRole('button', { name: 'スライドを全画面表示', exact: true }).click();
    await expect(settingsPage.locator('body')).toHaveClass(/is-lesson-fullscreen/);
    await fits(settingsPage, `${name}: 全画面表示`);
    await settingsPage.getByRole('button', { name: '全画面表示を終了', exact: true }).click();
    await expect(settingsPage.locator('body')).not.toHaveClass(/is-lesson-fullscreen/);
    await settingsContext.close();
    console.log(`${name}: 全テーマ・3文字サイズ・全画面・補足dialogの排他制御 OK`);
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    for (const id of ['cp11', 'cp12']) {
      await page.goto(new URL(`${id}.html`, base).href);
      await expect(page.locator('#headline_1')).toBeVisible();
      await expect(page.locator('#headline_6')).toBeVisible();
      await expect(page.locator('[data-lesson-slide]')).toHaveCount(6);
      if (id === 'cp11') await expect(page.locator('[data-cp-demo="cpu"]').first()).toContainText('3');
      else await expect(page.locator('[data-cp-files]')).toContainText('原稿.docx');
    }
    await context.close();
    console.log(`${name}: JavaScript無効時の本文順・説明 OK`);
  } finally { await browser.close(); }
}
