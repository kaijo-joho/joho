// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-lesson-formula-builder-browser.mjs http://127.0.0.1:8771/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { expect } = require(`${process.env.PLAYWRIGHT_MODULE || 'playwright'}/test`);
const baseURL = new URL(process.argv[2] || 'http://127.0.0.1:8771/');
const engineName = process.env.JOHO_BROWSER === 'webkit' ? 'webkit' : 'chrome';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch(engineName === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
const errors = [];
const exampleSelector = '[data-sound-worked-example] [data-formula-builder]';
const v = (value, unit = '') => ({ kind: 'value', value: String(value), unit });
const op = value => ({ kind: 'operator', value });
const ref = rowId => ({ kind: 'reference', rowId });
const sampleTokens = [v(16, 'bit/sample'), op('×'), v(2, 'channel'), op('÷'), v(8)];

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

async function draft() {
  return page.locator(exampleSelector).evaluate(host => host.__formulaBuilderTestEditor.getDraft());
}
async function setDraft(value) {
  await page.locator(exampleSelector).evaluate((host, value) => host.__formulaBuilderTestEditor.setDraft(value), value);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function seed({ first = [], second = [], answer = '', secondAnswer = '', open = true } = {}) {
  await setDraft({
    rows: [
      { id: 'sample-start', taskId: 'sample', tokens: first, result: '', resultUnit: '', answerOpen: open },
      { id: 'second-start', taskId: 'second', tokens: second, result: '', resultUnit: '', answerOpen: open }
    ],
    targets: { sample: 'sample-start', second: 'second-start' },
    answers: { sample: answer, second: secondAnswer }
  });
}
async function openPopup(name) {
  const host = page.locator(exampleSelector);
  const trigger = host.locator(`[data-formula-popup-trigger="${name}"]`);
  const popup = host.locator(`[data-formula-popup="${name}"]`);
  if (!await popup.isVisible()) await trigger.click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(popup).toBeVisible();
  return { trigger, popup };
}
async function startDrag(source) {
  await source.hover();
  const bounds = await source.boundingBox();
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 12, bounds.y + bounds.height / 2 + 8, { steps: 4 });
  await expect(page.locator(exampleSelector)).toHaveClass(/is-dragging/);
}
async function dragToExponent(source, target) {
  await expect(target).toBeHidden();
  await startDrag(source);
  await expect(target).toBeVisible();
  await target.hover();
  await target.hover();
  await page.mouse.up();
  await expect(page.locator(exampleSelector)).not.toHaveClass(/is-dragging/);
  for (const exponentTarget of await page.locator(exampleSelector).locator('[data-formula-exponent]').all()) {
    await expect(exponentTarget, 'drop後は右上の指数入力先を残さない').toBeHidden();
  }
}
async function sameEquationLine(row) {
  const layout = await row.evaluate(node => {
    const line = node.querySelector('.formula-expression-line');
    const nodes = [line && line.querySelector(':scope > .formula-token-list'), node.querySelector('.formula-answer-equals'), node.querySelector('[data-formula-answer], [data-formula-result]'), node.querySelector('[data-formula-judge]')];
    return nodes.map(element => element && ({ inside: line.contains(element), x: element.getBoundingClientRect().x, right: element.getBoundingClientRect().right, y: element.getBoundingClientRect().y, bottom: element.getBoundingClientRect().bottom }));
  });
  assert.ok(layout.every(rect => rect && rect.inside), '式・＝・手入力答え・判定を同じ横列に置く');
  for (let i = 1; i < layout.length; i += 1) {
    assert.ok(layout[i].x >= layout[i - 1].right - 1, '答え欄と判定は式の直後から順に並ぶ');
    assert.ok(Math.max(layout[0].y, layout[i].y) < Math.min(layout[0].bottom, layout[i].bottom), '答え欄と判定を式の下へ折り返さない');
  }
}

try {
  await page.goto(new URL('dr32.html#headline_2', baseURL).href, { waitUntil: 'networkidle' });
  const example = page.locator(exampleSelector);
  await example.waitFor();
  const sample = example.locator('[data-formula-task="sample"]');
  const second = example.locator('[data-formula-task="second"]');
  const sampleRows = sample.locator('[data-formula-row]');
  const secondRow = second.locator('[data-formula-row]').first();
  const manual = example.getByRole('textbox', { name: '自由入力の数値', exact: true });
  const manualInsert = example.getByRole('button', { name: '自由入力の数値を式へ挿入' });

  const operatorValues = await example.locator('[data-formula-operator]').evaluateAll(nodes => nodes
    .filter(node => node.checkVisibility()).map(node => node.dataset.formulaOperator));
  assert.deepEqual(operatorValues, ['+', '-', '×', '÷', '='], '5つの基本演算子を常設する');
  assert.equal(await example.locator('[data-formula-operator="relation="]').count(), 1, '関係式用の=は基本操作と分離する');
  assert.equal(await example.locator('details.formula-constants, details.formula-more-operators, details.formula-help').count(), 0, '定数・その他記号・ヘルプにdetailsを使わない');
  for (const name of ['constants', 'operators', 'help']) {
    const trigger = example.locator(`[data-formula-popup-trigger="${name}"]`);
    const popup = example.locator(`[data-formula-popup="${name}"]`);
    await expect(trigger).toBeVisible();
    await expect(popup).toBeHidden();
    await trigger.press('Enter');
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  const constantsTrigger = example.locator('[data-formula-popup-trigger="constants"]');
  const constantsPanel = example.locator('[data-formula-popup="constants"]');
  await constantsTrigger.hover();
  await expect(constantsPanel).toBeVisible();
  await constantsPanel.hover();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(240);
  await expect(constantsPanel).toBeHidden();
  for (const task of [sample, second]) {
    assert.equal(await task.locator('[data-formula-row]').count(), 1, '各小問は独立した1行で始まる');
    assert.equal(await task.locator('[data-formula-answer], [data-formula-result], [data-formula-judge]').count(), 0, '初期状態では答え欄も判定も出さない');
  }
  const firstRow = sampleRows.first();
  await firstRow.locator('[data-formula-slot]').first().click();
  await firstRow.locator('[data-formula-slot]').first().press('ArrowRight');
  assert.equal(await page.evaluate(() => location.hash), '#headline_2', '式欄の矢印操作でスライドを移動しない');
  await firstRow.locator('[data-formula-slot]').first().click();
  await example.locator('[data-formula-quantity]').first().click();
  assert.equal(await firstRow.locator('[data-formula-slot].is-active').count(), 0, '挿入後にキャレットを残さない');
  const compactDesktop = await firstRow.locator('.formula-expression').evaluate(expression => {
    const line = expression.querySelector('.formula-expression-line');
    const list = expression.querySelector('.formula-token-list');
    const slot = expression.querySelector('[data-formula-slot]:not(.is-empty)');
    const style = getComputedStyle(expression);
    return {
      lineGap: parseFloat(getComputedStyle(line).gap),
      listGap: parseFloat(getComputedStyle(list).gap),
      slotWidth: slot.getBoundingClientRect().width,
      slotHeight: slot.getBoundingClientRect().height,
      paddingTop: parseFloat(style.paddingTop),
      paddingBottom: parseFloat(style.paddingBottom)
    };
  });
  assert.equal(compactDesktop.lineGap, 0, '式と答え欄の間に余分なgapを置かない');
  assert.equal(compactDesktop.listGap, 0, '数値・演算子間に余分なgapを置かない');
  assert.ok(compactDesktop.slotWidth <= 21 && compactDesktop.slotHeight >= 43.5, '精密ポインタでは小さいslotでもクリック・キーボード用の高さを保つ');
  assert.ok(compactDesktop.paddingTop <= 20 && compactDesktop.paddingBottom <= 12, '式枠内の上下余白を詰める');
  await example.locator('[data-formula-operator="="]').click();
  assert.equal((await draft()).rows[0].tokens.some(token => token.kind === 'operator' && token.value === '='), false, '= 操作を式へ等号tokenとして追加しない');
  const answer = firstRow.locator('[data-formula-answer="sample"]');
  await expect(answer).toBeFocused();
  await sameEquationLine(firstRow);
  assert.equal(await firstRow.locator('.formula-answer-item small.formula-unit').count(), 1, '答え欄の数値と単位を分離する');
  await answer.pressSequentially('12.34');
  await expect(answer).toHaveValue('12.34');
  await expect(answer).toBeFocused();
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), 0, '答え欄の表示や入力だけでは計算しない');

  // 換算用の補助定数は数だけを選ぶ。通常の数量の単位は維持する。
  assert.equal(await manual.inputValue(), '', '自由入力は空欄で始まる');
  await expect(example.locator('[data-formula-manual-unit]')).toBeHidden();
  await manual.focus();
  await expect(example.locator('[data-formula-manual-unit]')).toBeVisible();
  const manualInline = await example.evaluate(host => {
    const unit = host.querySelector('[data-formula-manual-unit]');
    const insert = host.querySelector('[aria-label="自由入力の数値を式へ挿入"]');
    const a = unit.getBoundingClientRect(); const b = insert.getBoundingClientRect();
    return a.left < b.left && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
  });
  assert.equal(manualInline, true, '自由入力の単位と挿入ボタンを横並びにする');
  const manualUnits = await example.locator('[data-formula-manual-unit] option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent })));
  assert.equal(manualUnits.filter(item => item.value === '').length, 1, '単位なしは1つだけ表示する');
  assert.ok(manualUnits.some(item => item.value === 'bit/sample') && manualUnits.some(item => item.value === 'Hz'), '通常数量の単位を自由入力で選べる');
  assert.equal(manualUnits.some(item => /→|掛ける値|割る値|bit\/B|B\/KB|s\/min/.test(item.label + item.value)), false, '自由入力から換算方向の選択肢を外す');
  await openPopup('constants');
  const constantCards = await example.locator('[data-formula-constant]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.formulaConstant, amount: node.querySelector('.formula-card-value').textContent.trim(), conversion: !!node.querySelector('.formula-conversion-label') })));
  assert.ok(await example.locator('[data-formula-quantity] .formula-drag-dots, [data-formula-constant] .formula-drag-dots').count() > 0, '数量・定数カードに小型のdragハンドルを置く');
  assert.ok(await example.locator('.formula-drag-dots').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width <= 24 && node.getBoundingClientRect().height <= 24)), 'dragハンドルをカード本文より小さく保つ');
  assert.equal(new Set(constantCards.map(card => card.amount)).size, constantCards.length, '同じ数値・単位の補助カードを重複させない');
  for (const value of ['8', '0.125', '60', '1000', '1024']) assert.ok(constantCards.some(card => card.amount.replace(/,/g, '') === value), `${value}の換算定数を単位なしで示す`);
  assert.equal(constantCards.some(card => card.conversion || /→/.test(card.amount)), false, '補助定数に換算方向の表示を付けない');
  await manual.fill('12.5');
  await manualInsert.click();
  assert.equal((await draft()).rows[0].tokens.at(-1).value, '12.5', '自由入力で数値を挿入できる');

  // 別の行や答え欄を選ぶと、以前の行の挿入位置を引きずらない。
  await seed({ first: [v(1)], second: [v(2)], answer: '1', secondAnswer: '2' });
  await firstRow.locator('[data-formula-slot]').first().click();
  await secondRow.locator('[data-formula-answer="second"]').click();
  await example.locator('[data-formula-operator="×"]').click();
  assert.deepEqual((await draft()).rows.map(row => row.tokens.map(token => token.value)), [['1'], ['2', '×']], '別小問の答えクリック後はその行末に挿入する');
  await firstRow.locator('[data-formula-slot]').first().click();
  await secondRow.locator('.formula-row-label').click();
  await example.locator('[data-formula-operator="+"]').click();
  assert.deepEqual((await draft()).rows.map(row => row.tokens.map(token => token.value)), [['1'], ['2', '×', '+']], '別行の見出しクリックでも古い挿入先を捨てる');
  await firstRow.locator('[data-formula-slot]').first().click();
  await answer.click();
  await example.locator('[data-formula-operator="÷"]').click();
  assert.deepEqual((await draft()).rows[0].tokens.map(token => token.value), ['1', '÷'], '同じ行の答えクリックでも先頭の古いslotを末尾へ更新する');

  // 下へ追加した行が最終式になる。前の行のIDと手入力答えは途中結果として残す。
  await seed({ first: sampleTokens, second: [ref('sample-start')], answer: '4', secondAnswer: '99' });
  const original = await draft();
  await sample.locator('[data-formula-add-row]').click();
  let rows = (await draft()).rows;
  let finalRowId = (await draft()).targets.sample;
  let finalRow = sample.locator(`[data-formula-row="${finalRowId}"]`);
  assert.deepEqual(rows.map(row => row.id), ['sample-start', finalRowId, 'second-start'], '追加行は同小問の末尾で、次の小問より前に置く');
  assert.deepEqual(rows[0].tokens, original.rows[0].tokens, '前の式をそのまま保持する');
  assert.equal(rows[0].result, '4', '前の最終回答を途中結果へ移す');
  assert.equal(rows[0].resultUnit, 'B', '前の回答単位を途中結果へ移す');
  assert.equal((await draft()).answers.sample, '', '新しい最終回答を自動補完しない');
  await expect(firstRow.locator('[data-formula-result]')).toHaveValue('4');
  await expect(firstRow.locator('[data-formula-result-unit]')).toHaveValue('B');
  assert.equal(await firstRow.locator('[data-formula-answer]').count(), 0, '前の最終行を途中式入力へ切り替える');
  assert.equal(await finalRow.locator('[data-formula-answer], [data-formula-result]').count(), 0, '新行の答えは=まで閉じる');
  await expect(firstRow.locator('.formula-row-remove')).toBeDisabled();
  await expect(finalRow.locator('.formula-row-remove')).toBeEnabled();
  await expect(secondRow.locator('[data-formula-reference]')).toHaveText(/4.*B/);
  assert.equal((await secondRow.locator('[data-formula-reference]').textContent()).includes('↳'), false, '参照カードに矢印を表示しない');
  await firstRow.locator('[data-formula-result]').fill('5');
  await expect(secondRow.locator('[data-formula-reference]')).toHaveText(/5.*B/);
  await expect(secondRow.locator('[data-formula-answer]')).toHaveValue('99');
  await finalRow.locator('.formula-row-remove').click();
  assert.equal((await draft()).targets.sample, 'sample-start', '追加行の削除で直前の行が最終回答へ戻る');
  await expect(answer).toHaveValue('5');
  assert.equal(await firstRow.locator('[data-formula-result]').count(), 0, '復帰後に途中結果欄を重複させない');
  assert.equal(await sampleRows.count(), 1, '追加を取り消して元の1行に戻せる');
  await expect(secondRow.locator('[data-formula-reference]')).toHaveText(/5.*B/);

  // 最終行も、後の小問が参照している間は削除できない。
  await sample.locator('[data-formula-add-row]').click();
  finalRowId = (await draft()).targets.sample;
  finalRow = sample.locator(`[data-formula-row="${finalRowId}"]`);
  await finalRow.locator('[data-formula-slot]').first().click();
  await example.locator('[data-formula-operator="="]').click();
  await finalRow.locator('[data-formula-answer]').fill('7');
  await finalRow.locator(`[data-formula-result-grip="${finalRowId}"]`).click();
  await secondRow.locator('[data-formula-slot]').last().click();
  await expect(finalRow.locator('.formula-row-remove')).toBeDisabled();
  const currentReference = secondRow.locator(`[data-formula-reference="${finalRowId}"]`);
  await currentReference.click();
  await currentReference.locator('.formula-token-remove').click();
  await expect(finalRow.locator('.formula-row-remove')).toBeEnabled();

  // 選択した部品だけを消す。回答中のDeleteは部品削除にしない。
  await seed({ first: [v(1), op('+'), v(2)], answer: '123' });
  const removable = firstRow.locator('[data-formula-token]').first();
  await removable.click();
  const removeControl = removable.locator('.formula-token-remove');
  assert.ok((await removeControl.boundingBox()).height >= 43.5, '部品の×は44pxの操作領域を持つ');
  await answer.press('Home');
  await answer.press('Delete');
  assert.equal(await firstRow.locator('[data-formula-token]').count(), 3, '回答入力中のDeleteで部品を消さない');
  await removable.click();
  await removeControl.click();
  assert.equal(await firstRow.locator('[data-formula-token]').count(), 2, '選択部品を×で削除できる');
  const firstToken = firstRow.locator('[data-formula-token]').first();
  await firstToken.press('Enter');
  await expect(firstToken).toHaveClass(/is-selected/);
  await example.locator('[data-formula-action="move"]').click();
  const moveTarget = secondRow.locator('[data-formula-slot]').last();
  assert.ok(await example.locator('[data-formula-slot].is-move-target').count() > 0, 'キーボード移動で挿入先を示す');
  await moveTarget.press('Escape');
  await expect(firstToken).toHaveClass(/is-selected/);
  await example.locator('[data-formula-action="move"]').click();
  await moveTarget.click();
  assert.equal(await firstRow.locator('[data-formula-token]').count(), 1, '選択移動で元の行から1個取り除く');
  assert.equal(await secondRow.locator('[data-formula-token]').count(), 1, '選択移動で別行へ1個だけ追加する');

  // 実際のドラッグ中だけ挿入候補を強調し、hover先を案内する。
  await seed({ first: [v(16, 'bit/sample')], open: false });
  await openPopup('constants');
  const dragCard = example.locator('[data-formula-constant="two"]');
  assert.equal(await example.locator('.is-drop-target, .is-drop-preferred, .is-dragover').count(), 0, '通常表示にdrag用の案内を残さない');
  const targetToken = firstRow.locator('[data-formula-token]').first();
  const targetBox = await targetToken.boundingBox();
  if (engineName === 'webkit') {
    // WebKitはマウス座標だけの擬似dragでdropを発火しないため、実際の
    // native drag APIで同じ右半分へのdropを行う。
    await dragCard.dragTo(targetToken, { targetPosition: { x: targetBox.width - 4, y: targetBox.height / 2 } });
  } else {
    await dragCard.hover();
    const sourceBox = await dragCard.boundingBox();
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 8, sourceBox.y + sourceBox.height / 2 + 8, { steps: 4 });
    await targetToken.hover({ position: { x: targetBox.width - 4, y: targetBox.height / 2 } });
    await targetToken.hover({ position: { x: targetBox.width - 3, y: targetBox.height / 2 } });
    await expect(example).toHaveClass(/is-dragging/);
    assert.ok(await example.locator('[data-formula-slot].is-drop-target').count() > 0, 'ドラッグ中に挿入できるslotを目立たせる');
    assert.ok(await example.locator('[data-formula-slot].is-drop-preferred').count() > 0, 'ドラッグ中は自然な挿入候補を濃く示す');
    await page.mouse.up();
  }
  assert.deepEqual((await draft()).rows[0].tokens.map(token => token.value), ['16', '2'], 'token右半分にdropすると直後へ1個だけ挿入');
  await expect(example).not.toHaveClass(/is-dragging/);
  assert.equal(await example.locator('.is-drop-target, .is-drop-preferred, .is-dragover').count(), 0, 'drop完了後はdrag用の案内を消す');
  await openPopup('constants');
  await dragCard.dragTo(firstRow.locator('[data-formula-token]').first(), { targetPosition: { x: 4, y: 20 } });
  assert.deepEqual((await draft()).rows[0].tokens.map(token => token.value), ['2', '16', '2'], 'token左半分にdropすると直前へ1個だけ挿入');
  const expression = firstRow.locator('.formula-expression');
  const expressionBox = await expression.boundingBox();
  await openPopup('constants');
  await dragCard.dragTo(expression, { targetPosition: { x: expressionBox.width - 6, y: expressionBox.height / 2 } });
  assert.deepEqual((await draft()).rows[0].tokens.map(token => token.value), ['2', '16', '2', '2'], '式の右余白へのdropは最寄りの末尾slotに入る');
  await firstRow.locator('[data-formula-token]').first().dragTo(firstRow.locator('[data-formula-slot]').last());
  assert.deepEqual((await draft()).rows[0].tokens.map(token => token.value), ['16', '2', '2', '2'], '既存部品のdrag移動は1個だけ移し、複製しない');

  // 入れ子のslotを外側より優先し、dropの伝播で重複挿入しない。
  await seed({ open: false });
  await firstRow.locator('[data-formula-slot]').first().click();
  await openPopup('operators');
  await example.getByRole('button', { name: '分数を式へ挿入', exact: true }).press('Enter');
  await firstRow.locator('.formula-fraction > .formula-token-list').first().locator('[data-formula-slot]').first().click();
  await openPopup('operators');
  await example.getByRole('button', { name: '指数を式へ挿入', exact: true }).press('Enter');
  await firstRow.locator('.formula-power > .formula-token-list [data-formula-slot]').first().click();
  await openPopup('constants');
  await dragCard.press('Enter');
  const nestedExponent = firstRow.locator('.formula-power-exponent [data-formula-slot]').first();
  await openPopup('constants');
  await dragCard.dragTo(nestedExponent);
  const nested = (await draft()).rows[0].tokens;
  assert.equal(nested.length, 1, '入れ子へのdropで外側には部品を増やさない');
  assert.equal(nested[0].numerator.length, 1, '入れ子へのdropで分子の兄弟を増やさない');
  assert.deepEqual(nested[0].numerator[0].exponent.map(token => token.value), ['2'], '指定した指数slotに1個だけ追加する');
  await firstRow.locator('.formula-power-exponent [data-formula-token]').first().press('Enter');
  await firstRow.locator('.formula-power-exponent [data-formula-token]').first().press('Delete');
  assert.equal(await firstRow.locator('.formula-power-exponent [data-formula-token]').count(), 0, '指数内の値だけをキーボードで削除する');
  assert.equal(await firstRow.locator('.formula-power').count(), 1, '外側の指数は残す');

  // 右上ターゲットは通常表示・演算子ドラッグ中は隠し、数値ドラッグ時だけ出す。
  await seed({ first: [v(16, 'bit/sample')], open: false });
  const exponentTarget = firstRow.locator('[data-formula-exponent]').first();
  await expect(exponentTarget).toBeHidden();
  const initialTokenBounds = await firstRow.locator('.formula-value').boundingBox();
  await startDrag(example.locator('[data-formula-operator="×"]'));
  await expect(exponentTarget).toBeHidden();
  await page.locator('#headline_2').hover();
  await page.mouse.up();
  await expect(exponentTarget).toBeHidden();
  await openPopup('constants');
  await startDrag(dragCard);
  await expect(exponentTarget).toBeVisible();
  assert.deepEqual(await firstRow.locator('.formula-value').boundingBox(), initialTokenBounds, '入力先の表示で式の配置を動かさない');
  await page.locator('#headline_2').hover();
  await page.mouse.up();
  await expect(exponentTarget).toBeHidden();
  assert.equal((await draft()).rows[0].tokens[0].kind, 'value', 'ドラッグ取消では元の値を保つ');
  await openPopup('constants');
  await dragToExponent(dragCard, exponentTarget);
  assert.equal((await draft()).rows[0].tokens[0].kind, 'power', '値の右上ターゲットへ直接dropして指数形式へ包む');
  assert.equal((await draft()).rows[0].tokens[0].base[0].value, '16', '元の値を底として保つ');
  assert.deepEqual((await draft()).rows[0].tokens[0].exponent.map(token => token.value), ['2'], '右上ターゲットへのdrop値を指数へ入れる');

  // 前後に既存部品がある値と、入れ子の値でも右上targetだけを指数化する。
  await seed({ first: [v(1), v(16, 'bit/sample'), v(2)], open: false });
  await openPopup('constants');
  await dragToExponent(dragCard, firstRow.locator('[data-formula-exponent]').nth(1));
  const surrounded = (await draft()).rows[0].tokens;
  assert.deepEqual(surrounded.map(token => token.kind), ['value', 'power', 'value'], '前後の既存tokenを保って中央の値だけを指数化する');
  assert.deepEqual(surrounded[1].exponent.map(token => token.value), ['2'], '中央の右上targetへdropした値を指数にする');
  await seed({ first: [{ kind: 'fraction', numerator: [v(16)], denominator: [v(2)] }], open: false });
  await openPopup('constants');
  await dragToExponent(dragCard, firstRow.locator('.formula-fraction [data-formula-exponent]').first());
  const nestedPower = (await draft()).rows[0].tokens[0].numerator[0];
  assert.equal(nestedPower.kind, 'power', '分数内の値も外側を壊さず指数化する');
  assert.deepEqual(nestedPower.exponent.map(token => token.value), ['2'], '分数内の右上targetへdropした値を指数にする');

  // 答えinputと小さいgripの両方から前式参照をdragできる。
  await seed({ first: sampleTokens, answer: '4', secondAnswer: '99' });
  const resultSource = firstRow.locator('[data-formula-result-source="sample-start"]');
  const grip = resultSource.locator('[data-formula-result-grip="sample-start"]');
  await expect(grip).toBeVisible();
  await expect(grip).toHaveAttribute('draggable', 'true');
  assert.ok((await grip.boundingBox()).height >= 43.5, '小さいgripも44pxの操作領域を持つ');
  assert.equal(await resultSource.evaluate(source => {
    const box = source.querySelector('.formula-result-input');
    const input = box?.querySelector('input'); const grip = box?.querySelector('[data-formula-result-grip]');
    return !!box && box.contains(input) && box.contains(grip) && input.getBoundingClientRect().right >= grip.getBoundingClientRect().left;
  }), true, 'gripを答えinputと同じ入力枠内に置く');
  await grip.click();
  await secondRow.locator('[data-formula-slot]').first().click();
  assert.equal((await draft()).rows[1].tokens.filter(token => token.kind === 'reference').length, 1, 'gripのクリック選択後にslotクリックで参照を挿入する');
  await grip.press('Enter');
  await page.keyboard.press('Escape');
  await secondRow.locator('[data-formula-slot]').last().click();
  assert.equal((await draft()).rows[1].tokens.filter(token => token.kind === 'reference').length, 1, 'Escapeでgripの参照選択を取り消す');
  await resultSource.locator('input').dragTo(secondRow.locator('[data-formula-slot]').first());
  assert.equal((await draft()).rows[1].tokens.filter(token => token.kind === 'reference').length, 2, '答えinputから1個の参照を挿入する');
  await answer.fill('４');
  await expect(grip).toHaveAttribute('draggable', 'true');
  await answer.fill('4');
  await grip.dragTo(secondRow.locator('[data-formula-slot]').last());
  assert.equal((await draft()).rows[1].tokens.filter(token => token.kind === 'reference').length, 3, 'gripからも1個の参照を挿入する');
  assert.ok((await secondRow.locator('[data-formula-reference]').allTextContents()).every(text => /4.*B/.test(text) && !text.includes('↳')), '参照は数値・単位だけを表示する');
  await answer.fill('5');
  assert.ok((await secondRow.locator('[data-formula-reference]').allTextContents()).every(text => /5.*B/.test(text)), '参照カードを手入力値へ追従させる');
  await expect(secondRow.locator('[data-formula-answer]')).toHaveValue('99');
  await secondRow.locator('[data-formula-slot]').first().click();
  await expect(secondRow.locator('[data-formula-slot].is-active')).toHaveCount(1);
  await page.locator('#headline_2').click();
  await expect(secondRow.locator('[data-formula-slot].is-active')).toHaveCount(0);
  await seed({ first: [v(1)], second: [{ kind: 'group', body: [ref('sample-start')] }], answer: '1' });
  await secondRow.locator('.formula-group').dragTo(firstRow.locator('[data-formula-slot]').first());
  assert.equal((await draft()).rows[0].tokens.length, 1, 'ネストした参照を参照元より前の行へ移動できない');
  assert.equal((await draft()).rows[1].tokens.length, 1, '不正な移動で元の部品を失わない');

  // 途中結果の判定は明示操作だけで行い、編集後は判定を消す。
  await seed({ first: sampleTokens, answer: '4' });
  await sample.locator('[data-formula-add-row]').click();
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), 0, 'ここまでの追加・削除・移動・参照・答え入力は自動計算しない');
  await firstRow.locator('[data-formula-judge]').click();
  assert.ok(await firstRow.locator('.formula-feedback').count(), '途中式の判定結果を行内に表示する');
  await firstRow.locator('[data-formula-result]').fill('4.1');
  assert.equal(await firstRow.locator('.formula-feedback').count(), 0, '途中結果を編集すると判定結果を消す');
  const beforeRestore = await draft();
  beforeRestore.rows.forEach(row => { delete row.answerOpen; });
  beforeRestore.answers.sample = '6';
  await setDraft(beforeRestore);
  await expect(firstRow.locator('[data-formula-result]')).toHaveValue('4.1');
  await expect(sampleRows.last().locator('[data-formula-answer]')).toHaveValue('6');
  const callsBeforeManual = await page.evaluate(() => window.__formulaBuilderCoreCalls());
  await manual.fill('12.5');
  await manualInsert.click();
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), callsBeforeManual, '判定後も編集だけで再計算しない');

  // 数量を先に並べ、間に演算子を入れる実際の組み立て順で採点する。
  await seed({ open: false });
  const inlineConstantCount = await example.locator('[data-formula-constant]').evaluateAll(nodes => nodes.filter(node => node.checkVisibility()).length);
  const allConstantCount = await example.locator('[data-formula-constant]').count();
  if (allConstantCount <= 8) assert.equal(inlineConstantCount, allConstantCount, '少数の補助定数はポップアップを開かず常時表示する');
  else await expect(example.locator('[data-formula-popup-trigger="constants"]')).toBeVisible();
  await example.locator('[data-formula-quantity="bits"]').click();
  await example.locator('[data-formula-quantity="channels"]').click();
  await openPopup('constants');
  await example.locator('[data-formula-constant="bit-byte"]').click();
  assert.deepEqual((await draft()).rows[0].tokens.map(token => [token.value, token.unit]), [['16', 'bit/sample'], ['2', 'channel'], ['8', '']], '先に数値16・2・8を数量の単位を保って並べる');
  const rootSlots = firstRow.locator('.formula-expression-line > .formula-token-list > [data-formula-slot]');
  await rootSlots.nth(1).click();
  await example.locator('[data-formula-operator="×"]').click();
  await rootSlots.nth(3).click();
  await example.locator('[data-formula-operator="÷"]').click();
  assert.deepEqual((await draft()).rows[0].tokens.map(token => token.value), ['16', '×', '2', '÷', '8'], '指定した数値間に演算子を挿入する');
  await example.locator('[data-formula-operator="="]').click();
  await answer.fill('4');
  assert.equal(await page.evaluate(() => window.__formulaBuilderCoreCalls()), callsBeforeManual, '組み立てと答え入力だけでは計算しない');
  await firstRow.locator('[data-formula-judge]').click();
  const manualFormulaFeedback = (await sample.locator('.formula-feedback').allTextContents()).join(' ');
  assert.match(manualFormulaFeedback, /立式：○.*答え：○/, '数値を先に置いて演算子を後から挿入しても正解する');
  assert.doesNotMatch(manualFormulaFeedback, /演算子が必要/, '挿入済み演算子を未入力と誤認しない');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.siteTheme.setPreference('dark', { persist: false });
    window.siteTextSize.setPreference('xlarge', { persist: false });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await sameEquationLine(firstRow);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '390px幅でも横列の式はページ全体を広げない');

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await touch.route('**/*', route => new URL(route.request().url()).origin === baseURL.origin ? route.continue() : route.abort());
  await touch.goto(new URL('dr32.html#headline_2', baseURL).href, { waitUntil: 'networkidle' });
  const touchBuilder = touch.locator(exampleSelector);
  const touchSample = touchBuilder.locator('[data-formula-task="sample"] [data-formula-row]').first();
  const touchSecond = touchBuilder.locator('[data-formula-task="second"] [data-formula-row]').first();
  await touch.evaluate(() => {
    window.siteTheme.setPreference('dark', { persist: false });
    window.siteTextSize.setPreference('xlarge', { persist: false });
  });
  await touchSample.locator('[data-formula-slot]').first().tap();
  await touchBuilder.locator('[data-formula-quantity]').first().tap();
  const coarseSlot = touchSample.locator('[data-formula-slot]:not(.is-empty)').first();
  assert.ok((await coarseSlot.boundingBox()).width >= 43.5 && (await coarseSlot.boundingBox()).height >= 43.5, 'coarse pointerでは挿入slotを44px以上に保つ');
  assert.equal(await touchSample.locator('.formula-token-list').first().evaluate(list => parseFloat(getComputedStyle(list).gap)), 0, '390px幅でも数値・演算子間の余白を増やさない');
  await touchBuilder.locator('[data-formula-operator="="]').tap();
  const touchAnswer = touchSample.locator('[data-formula-answer="sample"]');
  await touchAnswer.fill('4');
  await touchSample.locator('[data-formula-result-grip]').tap();
  await touchSecond.locator('[data-formula-slot]').first().tap();
  await expect(touchSecond.locator('[data-formula-reference]')).toHaveCount(1);
  const touchOperators = touchBuilder.locator('[data-formula-popup-trigger="operators"]');
  await touchOperators.tap();
  await expect(touchBuilder.locator('[data-formula-popup="operators"]')).toBeVisible();
  await touchBuilder.locator('[data-formula-operator="relation="]').tap();
  await expect(touchBuilder.locator('[data-formula-popup="operators"]')).toBeHidden();
  await touchBuilder.getByRole('textbox', { name: '自由入力の数値', exact: true }).tap();
  const touchManualInline = await touchBuilder.evaluate(host => {
    const unit = host.querySelector('[data-formula-manual-unit]');
    const insert = host.querySelector('[aria-label="自由入力の数値を式へ挿入"]');
    const a = unit.getBoundingClientRect(); const b = insert.getBoundingClientRect();
    return Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
  });
  assert.equal(touchManualInline, true, '390px・特大文字でも自由入力の単位と挿入を横並びにする');
  const touchInlineConstants = await touchBuilder.locator('[data-formula-constant]').evaluateAll(nodes => nodes.filter(node => node.checkVisibility()).length);
  const touchAllConstants = await touchBuilder.locator('[data-formula-constant]').count();
  if (touchAllConstants <= 8) assert.equal(touchInlineConstants, touchAllConstants, '少数の補助定数はタップ画面でも常時表示する');
  else await expect(touchBuilder.locator('[data-formula-popup-trigger="constants"]')).toBeVisible();
  await touch.goto(new URL('dr32.html#headline_3', baseURL).href, { waitUntil: 'networkidle' });
  const samplingBuilder = touch.locator('[data-sound-calculation="sampling"] [data-formula-builder]');
  await samplingBuilder.waitFor();
  const samplingConstants = await samplingBuilder.locator('[data-formula-constant]').evaluateAll(nodes => nodes.filter(node => node.checkVisibility()).length);
  assert.equal(samplingConstants, await samplingBuilder.locator('[data-formula-constant]').count(), '少数のsampling補助定数は全て常時表示する');
  assert.equal(await samplingBuilder.locator('[data-formula-popup-trigger="constants"]').count(), 0, '少数のsampling補助定数にポップアップ入口を置かない');
  await touch.close();
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`lesson-formula-builder-browser (${engineName}): 行内答え、末尾追加/削除復帰、挿入先切替、drag位置/案内/参照、補助定数、キーボード、入力保持 OK`);
} finally {
  await browser.close();
}
