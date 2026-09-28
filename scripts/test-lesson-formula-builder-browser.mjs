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
    set: value => { core = { ...value, evaluate(...args) { calls += 1; return value.evaluate(...args); } }; }
  });
  window.__formulaBuilderCoreCalls = () => calls;
  let builder;
  Object.defineProperty(window, 'LessonFormulaBuilder', {
    configurable: true,
    get: () => builder,
    set: api => {
      builder = { ...api, mount(host, definition, options) {
        const editor = api.mount(host, definition, options);
        host.__formulaBuilderTestEditor = editor;
        return editor;
      } };
    }
  });
});
await page.route('**/*', route => new URL(route.request().url()).origin === baseURL.origin ? route.continue() : route.abort());
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(new URL('dr32.html#headline_2', baseURL).href, { waitUntil: 'networkidle' });
  const example = page.locator('[data-sound-worked-example] [data-formula-builder]');
  await example.waitFor();
  const sample = example.locator('[data-formula-task="sample"]');
  const second = example.locator('[data-formula-task="second"]');

  // 演算子は常設する。= は「選択行の答えを入力する」トリガーであり、式のtokenではない。
  const operatorValues = await example.locator('[data-formula-operator]').evaluateAll(nodes => nodes
    .filter(node => node.checkVisibility()).map(node => node.dataset.formulaOperator));
  assert.deepEqual(operatorValues, ['+', '-', '×', '÷', '='], '5つの基本演算子を常設する');
  assert.equal(await example.locator('[data-formula-operator="relation="]').count(), 1, '関係式用の=は基本操作と別のdata値で持つ');
  for (const task of [sample, second]) {
    assert.equal(await task.locator('[data-formula-row]').count(), 1, '各小問は独立した1行で始まる');
    assert.equal(await task.locator('[data-formula-answer], [data-formula-result], [data-formula-judge]').count(), 0, '初期状態では答え欄も途中式判定も出さない');
  }

  let sampleRow = sample.locator('[data-formula-row]').first();
  const firstSlot = sampleRow.locator('[data-formula-slot]').first();
  await firstSlot.click();
  await assert.doesNotReject(() => firstSlot.press('ArrowRight'));
  assert.equal(await page.evaluate(() => location.hash), '#headline_2', '式欄の矢印操作でスライドを移動しない');
  await sampleRow.locator('[data-formula-slot]').first().click();
  await example.locator('[data-formula-quantity]').first().click();
  assert.equal(await sampleRow.locator('[data-formula-slot].is-active').count(), 0, '挿入後にキャレットを残さない');
  await example.locator('[data-formula-operator="="]').click();
  assert.equal(await sampleRow.locator('[data-formula-token]').evaluateAll(tokens => tokens.some(token => token.textContent.trim() === '=')), false, '= 操作で式へ等号tokenを追加しない');
  let answer = sampleRow.locator('[data-formula-answer="sample"]');
  const sampleRowId = await sampleRow.getAttribute('data-formula-row');
  assert.equal(await answer.count(), 1, '= で選択行の答え欄を開く');
  assert.equal(await sampleRow.locator('[data-formula-judge]').count(), 1, '答え欄の横に行内判定を置く');
  assert.equal(await sampleRow.locator('.formula-answer-item small.formula-unit').count(), 1, '答え欄の数値と単位を分離して表示する');
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-formula-answer="sample"]')), true, '= で開いた答え欄へフォーカスする');
  await answer.pressSequentially('12.34');
  assert.equal(await answer.inputValue(), '12.34', '答えをキーボードで連続入力できる');
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-formula-answer="sample"]')), true, '連続入力中に答え欄のフォーカスを失わない');
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), 0, '答え欄を開くだけでは計算しない');

  // 既存のカード操作・削除・途中式・参照・ネスト操作も維持する。
  const manual = example.getByRole('textbox', { name: '自由入力の数値', exact: true });
  assert.equal(await manual.inputValue(), '', '自由入力は空欄で始まる');
  assert.equal(await example.locator('[data-formula-manual-unit]').isVisible(), false, '自由入力の単位はフォーカス前に展開しない');
  await manual.focus();
  assert.equal(await example.locator('[data-formula-manual-unit]').isVisible(), true, '自由入力のフォーカスで単位と挿入操作を展開する');
  await manual.fill('12.5');
  const manualInsert = example.getByRole('button', { name: '自由入力の数値を式へ挿入' });
  assert.equal(await manualInsert.isDisabled(), false, '自由入力後に数値を挿入できる');
  await manualInsert.click();
  await page.setViewportSize({ width: 1280, height: 1800 });
  const beforeDrag = await sampleRow.locator('[data-formula-token]').count();
  await example.getByText('補助定数・換算値を開く', { exact: true }).click();
  await example.locator('[data-formula-constant]').first().dragTo(sampleRow.locator('[data-formula-slot]').first());
  assert.equal(await example.locator('.formula-constants').evaluate(node => node.open), true, '定数パレットの開閉状態を挿入後も保つ');
  assert.equal(await sampleRow.locator('[data-formula-token]').count(), beforeDrag + 1, 'パレットカードをドラッグ挿入できる');
  const removable = sampleRow.locator('[data-formula-token]').first();
  await removable.click();
  const removeControl = removable.locator('.formula-token-remove');
  assert.equal(await removeControl.count(), 1, '選択した部品だけに削除用の小さい×を表示する');
  assert.ok((await removeControl.boundingBox()).height >= 43.5, '削除用×は44pxの操作領域を持つ');
  const selectedCount = await sampleRow.locator('[data-formula-token]').count();
  await answer.fill('123');
  await answer.press('Home');
  await answer.press('Delete');
  assert.equal(await sampleRow.locator('[data-formula-token]').count(), selectedCount, '回答入力中のDeleteで選択部品を消さない');
  await removeControl.click();
  assert.equal(await sampleRow.locator('[data-formula-token]').count(), beforeDrag, '選択部品を×で削除できる');
  await answer.fill('4');

  await sample.locator('[data-formula-add-row]').click();
  const sampleRows = sample.locator('[data-formula-row]');
  sampleRow = sample.locator(`[data-formula-row="${sampleRowId}"]`);
  answer = sampleRow.locator('[data-formula-answer="sample"]');
  assert.equal(await sampleRows.count(), 2, '途中式を追加すると小問内だけに中間行を増やす');
  const firstRow = sampleRows.first();
  const intermediateRowId = await firstRow.getAttribute('data-formula-row');
  const finalSampleRow = sampleRows.last();
  assert.equal(await firstRow.locator('[data-formula-result]').count(), 0, '追加直後の途中式は結果欄を出さない');
  await firstRow.locator('[data-formula-slot]').first().click();
  await example.locator('[data-formula-quantity]').first().click();
  await example.locator('[data-formula-operator="="]').click();
  await firstRow.locator('[data-formula-result]').fill('4');
  await firstRow.locator('[data-formula-result-unit]').selectOption('B');
  assert.equal(await firstRow.locator('[data-formula-result-unit] option[value=""]').count(), 1, '単位なしの選択肢を重複させない');
  const secondRowBeforeDraft = second.locator('[data-formula-row]').last();
  await secondRowBeforeDraft.getByRole('button', { name: '選んだ前の式の手入力結果を参照として挿入' }).click();
  assert.match(await secondRowBeforeDraft.locator('[data-formula-reference]').textContent(), /4.*B/, '小問(1)の手入力回答を小問(2)へ参照できる');
  await secondRowBeforeDraft.locator('[data-formula-slot]').last().click();
  await example.locator('[data-formula-operator="="]').click();
  const secondAnswer = secondRowBeforeDraft.locator('[data-formula-answer="second"]');
  await secondAnswer.fill('99');
  await answer.fill('5');
  assert.ok((await secondRowBeforeDraft.locator('[data-formula-reference]').allTextContents()).every(text => text.includes('5')), '前の結果を変更すると参照カードも更新する');
  assert.equal(await secondAnswer.inputValue(), '99', '後の手入力回答は自動更新しない');
  assert.equal(await firstRow.locator('.formula-row-remove').isDisabled(), false, '未参照の中間行は削除できる');
  await finalSampleRow.locator('.formula-reference-card').click();
  assert.equal(await firstRow.locator('.formula-row-remove').isDisabled(), true, '参照中の中間行を削除できない');
  await finalSampleRow.locator('[data-formula-reference]').click();
  await finalSampleRow.locator('.formula-token-remove').click();
  assert.equal(await firstRow.locator('.formula-row-remove').isDisabled(), false, '参照を外すと中間行を削除できる');

  const firstToken = firstRow.locator('[data-formula-token]').first();
  await firstToken.press('Enter');
  assert.match(await firstRow.locator('[data-formula-token]').first().getAttribute('class'), /is-selected/, 'キーボードで部品を選択できる');
  await example.locator('[data-formula-action="move"]').click();
  const moveTarget = secondRowBeforeDraft.locator('[data-formula-slot]').last();
  assert.ok(await example.locator('[data-formula-slot].is-move-target').count() > 0, '選択移動で挿入先を示す');
  await moveTarget.press('Escape');
  assert.match(await firstRow.locator('[data-formula-token]').first().getAttribute('class'), /is-selected/, 'Escapeで選択状態へ戻す');
  await example.locator('[data-formula-action="move"]').click();
  const countBeforeMove = await firstRow.locator('[data-formula-token]').count();
  await moveTarget.click();
  assert.equal(await firstRow.locator('[data-formula-token]').count(), countBeforeMove - 1, '選択部品を移動先スロットへ移動できる');

  await secondRowBeforeDraft.locator('[data-formula-slot]').first().click();
  const moreOperators = example.locator('.formula-more-operators');
  if (!await moreOperators.evaluate(node => node.open)) await moreOperators.locator('summary').click();
  await example.getByRole('button', { name: '括弧グループを式へ挿入' }).click();
  const group = secondRowBeforeDraft.locator('.formula-group').last();
  await group.locator('[data-formula-slot]').first().click();
  await secondRowBeforeDraft.getByRole('button', { name: '選んだ前の式の手入力結果を参照として挿入' }).click();
  const firstBefore = await firstRow.locator('[data-formula-token]').count();
  await group.dragTo(firstRow.locator('[data-formula-slot]').first());
  assert.equal(await firstRow.locator('[data-formula-token]').count(), firstBefore, 'ネストした参照を前の行へ移動できない');

  await sample.locator('[data-formula-add-row]').click();
  const nestedRows = sample.locator('[data-formula-row]');
  const nested = nestedRows.nth((await nestedRows.count()) - 2);
  await nested.locator('[data-formula-slot]').first().click();
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
  await exponent.press('Delete');
  assert.equal(await nested.locator('.formula-power-exponent [data-formula-token]').count(), 0, '指数内の値だけを削除');
  assert.equal(await nested.locator('.formula-power').count(), 1, '外側の指数は残す');

  await answer.fill('4');
  const rowId = await sampleRow.getAttribute('data-formula-row');
  sampleRow = sample.locator(`[data-formula-row="${rowId}"]`);
  assert.equal(await sampleRow.locator(`[data-formula-judge="${rowId}"]`).count(), 1, '行内判定は行IDを対象にする');
  await sampleRow.locator('[data-formula-judge]').click();
  assert.ok(await sampleRow.locator('.formula-feedback').count(), '途中式の判定結果を行内に表示する');
  await answer.fill('4.1');
  assert.equal(await sampleRow.locator('.formula-feedback').count(), 0, '値を編集すると判定結果を消す');

  // setDraftは旧保存データの非空のresult/answerを復元表示するが、空の初期draftを補完しない。
  await page.evaluate(({ rowId, intermediateRowId }) => {
    const host = document.querySelector('[data-sound-worked-example] [data-formula-builder]');
    const editor = host.__formulaBuilderTestEditor;
    if (!editor) return;
    const draft = editor.getDraft();
    const row = draft.rows.find(item => item.id === intermediateRowId);
    row.result = '4';
    row.resultUnit = 'B';
    draft.answers.sample = '4';
    editor.setDraft(draft);
  }, { rowId, intermediateRowId });
  assert.equal(await sampleRow.locator('[data-formula-answer="sample"]').count(), 1, '旧draftの非空答えは復元表示する');
  assert.equal(await firstRow.locator('[data-formula-result]').count(), 1, '旧draftの非空途中結果は復元表示する');

  // 前の式の答えそのものをドラッグして参照にする。input上で開始してもカードのdragが有効である。
  const secondRow = second.locator('[data-formula-row]').first();
  await secondRow.locator('[data-formula-slot]').first().click();
  const source = sampleRow.locator(`[data-formula-result-source="${rowId}"]`);
  assert.equal(await source.count(), 1, '答えの参照元を行IDで公開する');
  const referencesBeforeAnswerDrag = await secondRow.locator('[data-formula-reference]').count();
  await source.locator('input').dragTo(secondRow.locator('[data-formula-slot]').first());
  assert.equal(await secondRow.locator('[data-formula-reference]').count(), referencesBeforeAnswerDrag + 1, '答え欄をnative dragで後の式へ参照できる');
  assert.equal(await secondRow.locator('[data-formula-slot].is-active').count(), 0, '参照挿入後にもキャレットを残さない');
  await secondRow.locator('[data-formula-slot]').first().click();
  assert.equal(await secondRow.locator('[data-formula-slot].is-active').count(), 1, '明示的にslotを選んだ時だけキャレットを示す');
  await page.locator('#headline_2').click();
  assert.equal(await secondRow.locator('[data-formula-slot].is-active').count(), 0, '欄外クリックでキャレットを消す');

  const callsBeforeManual = await page.evaluate(() => window.__formulaBuilderCoreCalls());
  await manual.fill('12.5');
  await manualInsert.click();
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), callsBeforeManual, '編集操作中にCore計算を呼ばない');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.siteTheme.setPreference('dark', { persist: false });
    window.siteTextSize.setPreference('xlarge', { persist: false });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '390px幅でページ全体が横にはみ出さない');
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('lesson-formula-builder-browser: ok');
} finally {
  await browser.close();
}
