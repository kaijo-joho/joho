// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-lesson-formula-builder-browser.mjs http://127.0.0.1:8771/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = new URL(process.argv[2] || 'http://127.0.0.1:8771/');
const engine = process.env.JOHO_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

await page.addInitScript(() => {
  let calls = 0;
  let core;
  Object.defineProperty(window, 'LessonFormulaCore', {
    configurable: true,
    get: () => core,
    set: value => {
      core = Object.assign({}, value, {
        evaluate(...args) { calls += 1; return value.evaluate(...args); }
      });
    }
  });
  window.__formulaBuilderCoreCalls = () => calls;
});
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== baseURL.origin) return route.abort();
  return route.continue();
});
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => {
  const url = new URL(request.url());
  if (url.origin === baseURL.origin) errors.push(`failed: ${url.pathname}`);
});

try {
  await page.goto(new URL('dr32.html#headline_2', baseURL).href, { waitUntil: 'networkidle' });
  await page.locator('[data-sound-worked-example] [data-formula-builder]').waitFor();
  const example = page.locator('[data-sound-worked-example] [data-formula-builder]');
  assert.equal(await page.evaluate(() => typeof window.__formulaBuilderCoreCalls === 'function'), true);

  const sampleTask = example.locator('[data-formula-task="sample"]');
  const secondTask = example.locator('[data-formula-task="second"]');
  assert.equal(await sampleTask.locator('[data-formula-row]').count(), 1, '小問(1)は最終式だけで始まる');
  assert.equal(await secondTask.locator('[data-formula-row]').count(), 1, '小問(2)は小問(1)と独立した最終式だけで始まる');
  assert.equal(await example.locator('[data-formula-action="undo"], [data-formula-action="redo"]').count(), 0, 'undo/redoは表示しない');
  assert.equal(await example.locator('[data-formula-operator]').evaluateAll(nodes => nodes.filter(node => node.checkVisibility()).length), 4, '基本演算子だけを初期表示する');
  const moreOperators = example.locator('.formula-more-operators');
  assert.equal(await moreOperators.evaluate(node => node.open), false, '追加の演算子は初期状態で折りたたむ');
  assert.equal(await example.locator('[data-formula-slot]').evaluateAll(nodes => nodes.every(node => !node.textContent.includes('＋'))), true, '挿入slotに＋を表示しない');

  const firstSlot = sampleTask.locator('[data-formula-slot]').first();
  await firstSlot.click();
  await assert.doesNotReject(() => firstSlot.press('ArrowRight'));
  assert.equal(await page.evaluate(() => location.hash), '#headline_2', '式欄の矢印操作でスライドを移動しない');
  await firstSlot.click();
  const firstQuantity = example.locator('[data-formula-quantity]').first();
  assert.match((await firstQuantity.textContent()).trim(), /^\d[\d,]*(?:\.\d+)?\s+\S+/, '量カードは数値と単位だけを表示する');
  assert.equal(await firstQuantity.locator('.formula-card-label').count(), 0, '量カードに名称表示を持たない');
  await example.locator('[data-formula-quantity]').first().click();
  assert.match(await sampleTask.locator('[data-formula-token]').first().textContent(), /44,100|16/, '式内は数値を読みやすく表示する');
  assert.doesNotMatch(await sampleTask.locator('[data-formula-token]').first().textContent(), /標本化周波数/, '式内へ長い数量名を常時表示しない');
  await expectFocusedSlot(page);

  const manual = example.getByRole('textbox', { name: '自由入力の数値', exact: true });
  assert.equal(await manual.inputValue(), '', '自由入力は空欄で始まる');
  assert.equal(await manual.getAttribute('placeholder'), '数値を入力', '自由入力は初期状態でplaceholderだけを示す');
  assert.equal(await example.locator('[data-formula-manual-unit]').isVisible(), false, '自由入力の単位はフォーカス前に展開しない');
  await manual.focus();
  assert.equal(await example.locator('[data-formula-manual-unit]').isVisible(), true, '自由入力のフォーカスで単位と挿入操作を展開する');
  await manual.fill('12.5');
  const manualInsert = example.getByRole('button', { name: '自由入力の数値を式へ挿入' });
  assert.equal(await manualInsert.isDisabled(), false, '自由入力後に数値を挿入できる');
  await manualInsert.click();
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), 0, '編集時にCore計算を呼ばない');

  const beforeDrag = await sampleTask.locator('[data-formula-token]').count();
  // ネイティブdragの試験は両端を同時に見せて行う。狭い画面は後段で
  // 挿入位置→クリック/タップ、および選択→移動の代替操作を確認する。
  await page.setViewportSize({ width: 1280, height: 1800 });
  await example.getByText('補助定数・換算値を開く', { exact: true }).click();
  await example.locator('[data-formula-constant]').first().dragTo(sampleTask.locator('[data-formula-slot]').first());
  assert.equal(await example.locator('.formula-constants').evaluate(node => node.open), true, '定数パレットの開閉状態を挿入後も保つ');
  assert.equal(await sampleTask.locator('[data-formula-token]').count(), beforeDrag + 1, 'パレットカードをドラッグ挿入できる');
  const removable = sampleTask.locator('[data-formula-token]').first();
  await removable.click();
  const removeControl = removable.locator('.formula-token-remove');
  assert.equal(await removeControl.count(), 1, '選択した部品だけに削除用の小さい×を表示する');
  assert.ok((await removeControl.boundingBox()).height >= 43.5, '削除用×は44pxの操作領域を持つ');
  const selectedCount = await sampleTask.locator('[data-formula-token]').count();
  await sampleTask.locator('[data-formula-answer]').fill('123');
  await sampleTask.locator('[data-formula-answer]').press('Home');
  await sampleTask.locator('[data-formula-answer]').press('Delete');
  assert.equal(await sampleTask.locator('[data-formula-token]').count(), selectedCount, '回答入力中のDeleteで選択部品を消さない');
  await removeControl.click();
  assert.equal(await sampleTask.locator('[data-formula-token]').count(), beforeDrag, '選択部品を×で削除できる');

  await sampleTask.locator('[data-formula-add-row]').click();
  const sampleRows = sampleTask.locator('[data-formula-row]');
  assert.equal(await sampleRows.count(), 2, '途中式を追加すると小問内だけに中間行を増やす');
  const firstRow = sampleRows.first();
  const finalSampleRow = sampleRows.last();
  assert.equal(await finalSampleRow.locator('[data-formula-result]').count(), 0, '最終行に式の結果入力を出さない');
  assert.equal(await finalSampleRow.locator('[data-formula-answer="sample"]').count(), 1, '最終行に小問(1)の回答欄を一つ置く');
  await firstRow.locator('[data-formula-slot]').first().click();
  await example.locator('[data-formula-quantity]').first().click();
  await firstRow.locator('[data-formula-result]').fill('4');
  await firstRow.locator('[data-formula-result-unit]').selectOption('B');
  assert.equal(await firstRow.locator('[data-formula-result-unit] option[value=""]').count(), 1, '単位なしの選択肢を重複させない');
  await finalSampleRow.locator('[data-formula-answer="sample"]').fill('4');
  const secondRow = secondTask.locator('[data-formula-row]').last();
  await secondRow.getByRole('button', { name: '選んだ前の式の手入力結果を参照として挿入' }).click();
  assert.match(await secondRow.locator('[data-formula-reference]').textContent(), /4.*B/, '小問(1)の手入力回答を小問(2)へ参照できる');
  assert.equal(await firstRow.locator('.formula-row-remove').isDisabled(), false, '未参照の中間行は削除できる');
  assert.equal(await secondRow.locator('[data-formula-reference-source] option').count(), 2, '中間行と前小問の最終行を参照候補にする');
  await finalSampleRow.locator('.formula-reference-card').click();
  assert.equal(await firstRow.locator('.formula-row-remove').isDisabled(), true, '参照中の中間行を削除できない');
  await finalSampleRow.locator('[data-formula-reference]').click();
  await finalSampleRow.locator('.formula-token-remove').click();
  assert.equal(await firstRow.locator('.formula-row-remove').isDisabled(), false, '参照を外すと中間行を削除できる');

  const firstToken = firstRow.locator('[data-formula-token]').first();
  await firstToken.click();
  await example.getByRole('button', { name: '選択を移動' }).click();
  const moveTarget = secondRow.locator('[data-formula-slot]').last();
  assert.match(await moveTarget.getAttribute('class'), /is-move-target/);
  await moveTarget.press('Escape');
  assert.match(await firstRow.locator('[data-formula-token]').first().getAttribute('class'), /is-selected/);
  await example.getByRole('button', { name: '選択を移動' }).click();
  const countBeforeMove = await firstRow.locator('[data-formula-token]').count();
  await moveTarget.click();
  assert.equal(await firstRow.locator('[data-formula-token]').count(), countBeforeMove - 1, '選択部品を移動先スロットへ移動できる');

  // Nested reference cannot be dragged to a preceding row.
  await secondRow.locator('[data-formula-slot]').first().click();
  if (!await moreOperators.evaluate(node => node.open)) await moreOperators.locator('summary').click();
  await example.getByRole('button', { name: '括弧グループを式へ挿入' }).click();
  const group = secondRow.locator('.formula-group').last();
  await group.locator('[data-formula-slot]').first().click();
  await secondRow.getByRole('button', { name: '選んだ前の式の手入力結果を参照として挿入' }).click();
  const firstBefore = await firstRow.locator('[data-formula-token]').count();
  await group.dragTo(firstRow.locator('[data-formula-slot]').first());
  assert.equal(await firstRow.locator('[data-formula-token]').count(), firstBefore, 'ネストした参照を前の行へ移動できない');

  await secondRow.locator('[data-formula-answer="second"]').fill('99');
  await finalSampleRow.locator('[data-formula-answer="sample"]').fill('5');
  assert.ok((await secondRow.locator('[data-formula-reference]').allTextContents()).every(text => text.includes('5')), '前の結果を変更すると参照カードも更新');
  assert.equal(await secondRow.locator('[data-formula-answer="second"]').inputValue(), '99', '後の手入力回答は自動更新しない');

  // 分数の中に指数を作り、ネストした値だけをキーボードで編集する。
  await sampleTask.locator('[data-formula-add-row]').click();
  const nestedRows = sampleTask.locator('[data-formula-row]');
  const nested = nestedRows.nth((await nestedRows.count()) - 2);
  await nested.locator('[data-formula-slot]').first().click();
  if (!await moreOperators.evaluate(node => node.open)) await moreOperators.locator('summary').click();
  await example.getByRole('button', { name: '分数を式へ挿入', exact: true }).press('Enter');
  await nested.locator('.formula-fraction > .formula-token-list').first().locator('[data-formula-slot]').first().click();
  await example.getByRole('button', { name: '指数を式へ挿入', exact: true }).press('Enter');
  await nested.locator('.formula-power > .formula-token-list [data-formula-slot]').first().click();
  await example.locator('[data-formula-constant="two"]').press('Enter');
  await nested.locator('.formula-power-exponent [data-formula-slot]').first().click();
  await manual.fill('3');
  await manualInsert.press('Enter');
  const exponent = nested.locator('.formula-power-exponent [data-formula-token]').first();
  await exponent.press('Enter');
  assert.match(await exponent.getAttribute('class'), /is-selected/, '指数内の値だけが選択される');
  await exponent.press('Delete');
  assert.equal(await nested.locator('.formula-power-exponent [data-formula-token]').count(), 0, '指数内の値だけを削除');
  assert.equal(await nested.locator('.formula-power').count(), 1, '外側の指数は残す');
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), 0, '分数・指数・参照・削除でも自動計算しない');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.siteTheme.setPreference('dark', { persist: false });
    window.siteTextSize.setPreference('xlarge', { persist: false });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '390px幅でページ全体が横にはみ出さない');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('lesson-formula-builder-browser: ok');
} finally {
  await browser.close();
}

async function expectFocusedSlot(page) {
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-formula-slot]')), true, '挿入後もスロットへフォーカスが戻る');
}
