// Usage: PLAYWRIGHT_MODULE=/path/to/playwright JOHO_BROWSER=webkit node scripts/test-compression-pages-browser.mjs http://127.0.0.1:8824/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { expect } = require(`${process.env.PLAYWRIGHT_MODULE || 'playwright'}/test`);
const base = new URL(process.argv[2] || 'http://127.0.0.1:8824/');
const engine = process.env.JOHO_BROWSER === 'webkit' ? 'webkit' : 'chrome';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const blockedExternal = new Set();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() !== 'error') return;
  // Fonts/analytics are deliberately offline. Only their exact aborted-resource message is ignored.
  if (blockedExternal.has(message.location().url) && message.text() === 'Failed to load resource: net::ERR_FAILED') return;
  errors.push({ message: message.text(), url: message.location().url });
});
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin === base.origin) return route.continue();
  blockedExternal.add(route.request().url());
  return route.abort();
});
// Test-only handles exercise the same shared formula entry API used by sound/image/output lessons.
await page.addInitScript(() => {
  let api;
  Object.defineProperty(window, 'LessonFormulaBuilder', { configurable: true, get: () => api, set: value => {
    api = { ...value, mount(host, definition, options) {
      const editor = value.mount(host, definition, options);
      host.__compressionTest = { editor, definition };
      return editor;
    } };
  } });
});
const goSlide = n => page.getByRole('button', { name: new RegExp(`^${n} / 7：`) }).click();
const load = async id => { await page.goto(new URL(`${id}.html`, base).href); await expect(page.locator('nav[aria-label="スライド間の移動"]')).toBeVisible(); };
const field = (root, key) => root.locator(`[data-cp-huffman-field="${key}"]`);
const clone = x => JSON.parse(JSON.stringify(x));
try {
  await load('dr51');
  await goSlide(1);
  assert.equal(await page.locator('[data-cp-image-model]').count(), 0, '未習の圧縮方式を導入に置かない');
  assert.equal(await page.locator('.cp-concept-arrows path[stroke-dasharray]').count(), 1, '非可逆の戻り矢印は点線');
  await goSlide(2);
  await expect(page.locator('[data-cp-size-result]')).toContainText('削減率：37.5%');
  await expect(page.locator('.cp-fraction > span').first()).toHaveText('圧縮後のサイズ');
  await expect(page.locator('[data-cp-size-chart] .cp-size-label').first()).toContainText('圧縮後');
  await expect(page.locator('[data-cp-size-chart] .cp-size-label').last()).toContainText('圧縮前');
  await page.getByRole('spinbutton', { name: '圧縮前のサイズ', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: '圧縮後のサイズ', exact: true }).fill('12');
  await expect(page.locator('[data-cp-size-result]')).toContainText('増加率：20%');
  await page.getByRole('spinbutton', { name: '圧縮前のサイズ', exact: true }).fill('0');
  await expect(page.locator('[data-cp-size-result]')).toContainText('0より大きい数');
  assert.equal(await page.locator('[data-cp-size-chart]').getAttribute('aria-label'), null);
  await goSlide(3);
  await page.getByRole('radio', { name: 'どちらも同じ', exact: true }).check();
  await page.getByRole('button', { name: '圧縮して比較', exact: true }).click();
  await expect(page.locator('[data-cp-string-compare-results]')).toContainText('200%');
  await expect(page.locator('[data-cp-string-compare-status]')).toContainText('予想と結果');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '次のまとまり', exact: true }).click();
  await expect(page.locator('[data-cp-rle-rate]')).toContainText('62.5%');
  await goSlide(4);
  await page.getByRole('radio', { name: 'まとまった配置', exact: true }).check();
  await page.getByRole('button', { name: '圧縮して比較', exact: true }).click();
  await expect(page.locator('[data-cp-image-compare-status]')).toContainText('黒13画素・白12画素');
  await expect(page.locator('[data-cp-image-compare-results]')).toContainText('24%');
  await goSlide(6);
  await expect(page.locator('[data-cp-string-rate-formula][data-formula-builder]')).toBeVisible();
  // Existing RLE fields still have an independent submit/reset cycle.
  await page.locator('[data-cp-answer="compress"]').fill('E4C2A1B1A1B1');
  await page.locator('[data-cp-answer="restore"]').fill('AAAAAAAAEFDDDD');
  await page.locator('[data-cp-string-quiz] > .cp-controls button[type=submit]').click();
  await expect(page.locator('[data-cp-quiz-feedback]').first()).toContainText('全2項目正解');

  await goSlide(3);
  const rle = page.locator('[data-cp-string-rle]');
  await rle.getByRole('button', { name: '編集', exact: true }).click();
  await expect(rle.locator('[data-cp-rle-original]')).toBeHidden();
  const edit = rle.locator('[data-cp-rle-edit]');
  await edit.fill('ABC1');
  await expect(rle.locator('[data-cp-rle-apply]')).toBeDisabled();
  await edit.press('Escape');
  await expect(rle.locator('[data-cp-rle-original]')).toHaveText('AAAAAABBBBCCDAAA');
  await expect(rle.locator('[data-cp-rle-edit-toggle]')).toBeFocused();
  await rle.getByRole('button', { name: '編集', exact: true }).click();
  await edit.fill('ＡＡＡＢＢ'); await edit.press('Enter');
  await expect(rle.locator('[data-cp-rle-original]')).toHaveText('AAABB');
  for (let i = 0; i < 2; i++) await rle.getByRole('button', { name: '次のまとまり', exact: true }).click();
  await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText('A3B2');

  await load('dr52'); await goSlide(1);
  const frequency = page.locator('[data-cp-frequency-assignment]');
  assert.equal(await page.locator('[data-cp-frequency-form]').count(), 0);
  const tableHeight = await frequency.locator('table').evaluate(e => e.getBoundingClientRect().height);
  await frequency.getByRole('button', { name: '次の割り当て', exact: true }).click();
  await expect(frequency.locator('[data-cp-frequency-code="B"]')).toHaveText('0');
  await expect(frequency.locator('[data-cp-frequency-code="A"]')).toHaveText('');
  await frequency.getByRole('button', { name: '頻度の高い順に符号を表示', exact: true }).click();
  await expect(frequency.locator('[data-cp-frequency-code="E"]')).toHaveText('1111');
  assert.equal(await frequency.locator('table').evaluate(e => e.getBoundingClientRect().height), tableHeight, '符号の表示で表が伸びない');
  await frequency.getByRole('button', { name: '最初から', exact: true }).click();
  await frequency.getByRole('button', { name: '頻度の高い順に符号を表示', exact: true }).click();
  await expect(frequency.locator('[data-cp-frequency-code="B"]')).toHaveText('0');
  await frequency.getByRole('button', { name: 'アニメーションを一時停止', exact: true }).click();
  const paused = await frequency.locator('[data-cp-frequency-code]').allTextContents();
  await page.waitForTimeout(1100);
  assert.deepEqual(await frequency.locator('[data-cp-frequency-code]').allTextContents(), paused, '一時停止で割り当てを進めない');
  await frequency.getByRole('button', { name: '頻度の高い順に符号を表示', exact: true }).click();
  await goSlide(2); await page.waitForTimeout(1100); await goSlide(1);
  assert.deepEqual(await frequency.locator('[data-cp-frequency-code]').allTextContents(), paused, '別スライドへ移ったら停止する');
  await frequency.getByRole('button', { name: '最初から', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frequency.getByRole('button', { name: '頻度の高い順に符号を表示', exact: true }).click();
  await expect(frequency.locator('[data-cp-frequency-code="E"]')).toHaveText('1111');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await goSlide(2);
  const build = page.locator('[data-cp-huffman-build]');
  const fixed = await build.locator('[data-cp-tree]').evaluate(e => ({ height: e.getBoundingClientRect().height, points: Array.from(e.querySelectorAll('[data-cp-node]'), n => [n.dataset.cpNode, n.querySelector('circle').getAttribute('cx'), n.querySelector('circle').getAttribute('cy')]) }));
  for (let i = 0; i < 4; i++) {
    await build.getByRole('button', { name: '次の結合', exact: true }).click();
    const current = await build.locator('[data-cp-tree]').evaluate(e => ({ height: e.getBoundingClientRect().height, points: Array.from(e.querySelectorAll('[data-cp-node]'), n => [n.dataset.cpNode, n.querySelector('circle').getAttribute('cx'), n.querySelector('circle').getAttribute('cy')]) }));
    assert.equal(current.height, fixed.height, '木を組み上げても下のコンテンツが動かない');
    for (const point of fixed.points) assert.deepEqual(current.points.find(p => p[0] === point[0]), point, '元からある丸の座標を維持');
  }
  await expect(build.locator('[data-cp-codes]')).not.toContainText('？');

  await goSlide(3);
  const encoder = page.locator('[data-cp-codec="encode"]');
  await encoder.locator('[data-cp-tree]').evaluate(element => {
    window.__cpTrace = [];
    window.__cpTraceObserver = new MutationObserver(() => { const node = element.querySelector('[data-cp-node].is-current'); if (node) window.__cpTrace.push(node.dataset.cpNode); });
    window.__cpTraceObserver.observe(element, { childList: true });
  });
  await encoder.getByRole('button', { name: '次の文字', exact: true }).click();
  await expect(encoder.getByRole('button', { name: '次の文字', exact: true })).toBeDisabled();
  await expect(encoder.locator('[data-cp-codec-status]')).toContainText('符号1110');
  assert.deepEqual(await page.evaluate(() => { window.__cpTraceObserver.disconnect(); return window.__cpTrace.filter((p, i, a) => i === 0 || p !== a[i - 1]); }), ['root', '1', '11', '111', '1110'], '符号化では根から枝を1本ずつたどる');
  await expect(encoder.locator('[data-cp-codec-output]')).toHaveText('1110');
  await encoder.getByRole('button', { name: '次の文字', exact: true }).click();
  await goSlide(2); await page.waitForTimeout(1200); await goSlide(3);
  await expect(encoder.locator('[data-cp-codec-output]')).toHaveText('1110');
  await expect(encoder.getByRole('button', { name: '次の文字', exact: true })).toBeEnabled();
  await encoder.getByRole('button', { name: '最初から', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await encoder.getByRole('button', { name: '次の文字', exact: true }).click();
  await expect(encoder.locator('[data-cp-codec-output]')).toHaveText('1110');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('tab', { name: '復元', exact: true }).click();
  const decoder = page.locator('[data-cp-codec="decode"]');
  for (let i = 0; i < 10; i++) await decoder.getByRole('button', { name: '次のbit', exact: true }).click();
  await expect(decoder.locator('[data-cp-codec-output]')).toHaveText('DAE');

  await goSlide(4);
  const practice = page.locator('[data-cp-huffman-practice]');
  assert.equal(await practice.getByRole('combobox').count(), 0);
  await practice.getByRole('button', { name: 'A：9回', exact: true }).click();
  await practice.getByRole('button', { name: 'B：7回', exact: true }).click();
  await practice.getByRole('button', { name: '選んだ2つを結合', exact: true }).click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('小さい2つ');
  await practice.getByRole('button', { name: '最初から', exact: true }).click();
  const practiceHeight = await practice.locator('[data-cp-tree]').evaluate(e => e.getBoundingClientRect().height);
  for (const names of [['D：2回', 'E：1回'], ['D・E（結合済み）：3回', 'C：3回'], ['B：7回', 'C・D・E（結合済み）：6回'], ['A：9回', 'B・C・D・E（結合済み）：13回']]) {
    await practice.getByRole('button', { name: names[0], exact: true }).press('Enter');
    await practice.getByRole('button', { name: names[1], exact: true }).press('Space');
    await practice.getByRole('button', { name: '選んだ2つを結合', exact: true }).click();
    assert.equal(await practice.locator('[data-cp-tree]').evaluate(e => e.getBoundingClientRect().height), practiceHeight);
  }
  await expect(practice.locator('[data-cp-build-status]')).toContainText('木が完成');
  await expect(practice.locator('[data-cp-codes]')).not.toContainText('？');
  await practice.getByRole('button', { name: '1つ戻る', exact: true }).click();
  await expect(practice.locator('[data-cp-codes]')).toContainText('？');
  for (const preset of [1, 2]) {
    await practice.getByRole('button', { name: `例${preset + 1}`, exact: true }).click();
    await expect(practice.locator(`[data-cp-practice-preset="${preset}"]`)).toHaveAttribute('aria-pressed', 'true');
    for (let join = 0; join < 4; join++) {
      const smallest = await practice.locator('[data-cp-practice-node]').evaluateAll(nodes => nodes.map(n => ({ label: n.getAttribute('aria-label'), count: Number(n.querySelector('circle + text').textContent) })).sort((a, b) => a.count - b.count).slice(0, 2));
      for (const node of smallest) await practice.getByRole('button', { name: node.label, exact: true }).click();
      await practice.getByRole('button', { name: '選んだ2つを結合', exact: true }).click();
    }
    await expect(practice.locator('[data-cp-build-status]')).toContainText('木が完成');
  }

  for (const index of [0, 1]) {
    await goSlide(index + 6);
    const quiz = page.locator(`[data-cp-staged-huffman-quiz="${index}"]`);
    const fixture = await page.evaluate(index => window.CompressionCore.HUFFMAN_QUESTIONS[index], index);
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-formula]')).toBeHidden();
    await quiz.getByRole('tab', { name: '1. 頻度', exact: true }).click();
    for (const [symbol, count] of Object.entries(fixture.frequencies)) await field(quiz, `frequency:${symbol}`).fill(String(count));
    await field(quiz, 'frequencyTotal').fill(String(fixture.text.length));
    await quiz.getByRole('button', { name: '段階1を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
    assert.equal(await field(quiz, 'code:A').getAttribute('aria-invalid'), null, '別段階の未入力は採点しない');
    await quiz.getByRole('tab', { name: '2. 符号と符号長', exact: true }).click();
    for (const [symbol, code] of Object.entries(fixture.codes)) { await field(quiz, `code:${symbol}`).fill(code); await field(quiz, `length:${symbol}`).fill(String(code.length)); }
    await quiz.getByRole('button', { name: '段階2を判定', exact: true }).click();
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    const host = quiz.locator('[data-cp-huffman-formula]');
    await expect(host).toHaveAttribute('data-formula-builder', 'true');
    await expect(host).toBeVisible();
    let total = 0;
    for (const [symbol, count] of Object.entries(fixture.frequencies)) { const bits = count * fixture.codes[symbol].length; total += bits; await field(quiz, `bits:${symbol}`).fill(String(bits)); }
    await field(quiz, 'bitsTotal').fill(String(total));
    const seed = await host.evaluate(element => {
      const definition = element.__compressionTest.definition;
      return { rows: definition.tasks.map(task => ({ id: task.id, taskId: task.id, tokens: task.expectedTokens, result: String(task.expected), resultUnit: task.answerUnit, answerOpen: true })), targets: Object.fromEntries(definition.tasks.map(task => [task.id, task.id])), answers: Object.fromEntries(definition.tasks.map(task => [task.id, String(task.expected)])) };
    });
    const wrong = clone(seed);
    wrong.rows.unshift({ ...clone(seed.rows[0]), id: 'wrong-working', result: '999' });
    wrong.rows[1].tokens = [{ kind: 'reference', rowId: 'wrong-working' }];
    await host.evaluate((element, draft) => element.__compressionTest.editor.setDraft(draft), wrong);
    await quiz.getByRole('button', { name: '段階3を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('段階3は正解');
    await host.evaluate((element, draft) => element.__compressionTest.editor.setDraft(draft), seed);
    await quiz.getByRole('button', { name: '段階3を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('段階3は正解');
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.textSize = 'xlarge'; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), '記入済みのハフマン式ビルダーは390px・特大文字でも横はみ出ししない');
    const hash = new URL(page.url()).hash;
    await host.locator('[data-formula-slot]').first().press('ArrowRight');
    assert.equal(new URL(page.url()).hash, hash, '式の矢印操作でスライドを移動しない');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.textSize = 'standard'; });
    await quiz.getByRole('tab', { name: '4. 符号化と復元', exact: true }).click();
    const codec = await page.evaluate(fixture => ({ encoded: window.CompressionCore.encodeHuffman(fixture.encodeText, fixture.codes), decoded: window.CompressionCore.decodeHuffman(fixture.decodeBits, fixture.codes) }), fixture);
    await field(quiz, 'encoded').fill(codec.encoded); await field(quiz, 'decoded').fill(codec.decoded);
    await quiz.getByRole('button', { name: '段階4を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('全2項目正解');
    await quiz.getByRole('tab', { name: '1. 頻度', exact: true }).click();
    await field(quiz, 'frequency:A').fill('0');
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    await expect(host).toBeHidden();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('正解');
    await quiz.getByRole('tab', { name: '4. 符号化と復元', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('正解');
    await quiz.getByRole('button', { name: '入力を消す', exact: true }).click();
    await expect(quiz.getByRole('tab', { name: '1. 頻度', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(field(quiz, 'frequency:A')).toHaveValue('');
  }
  // Responsive states use the same slide navigation and theme/font settings.
  for (const id of ['dr51', 'dr52']) {
    await load(id);
    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark', 'system']) for (const font of ['standard', 'large', 'xlarge']) {
        await page.evaluate(({ theme, font }) => { if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; document.documentElement.dataset.textSize = font; }, { theme, font });
        for (let n = 1; n <= 7; n++) {
          await page.goto(new URL(`${id}.html#headline_${n}`, base).href);
          await expect(page.locator(`#headline_${n}`)).toBeVisible();
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(sizes.scroll <= sizes.width + 1, `${id} ${width}px ${theme}/${font} slide${n} 横はみ出し ${JSON.stringify(sizes)}`);
        }
      }
    }
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noScript.newPage();
  for (const id of ['dr51', 'dr52']) { await fallback.goto(new URL(`${id}.html`, base).href); assert.equal(await fallback.locator('[data-lesson-slide]').count(), 7); await expect(fallback.locator('[data-lesson-slide]').last()).toBeVisible(); assert.equal(await fallback.locator('body.lesson-slide-ready').count(), 0); }
  await noScript.close();
  assert.deepEqual(errors, [], 'ページ例外・コンソールエラーなし');
  console.log(`compression-pages-browser (${engine}): 模式図、分数と棒、直接編集、頻度順アニメーション、固定座標木、根からの経路再生、図中の丸選択と3例、演習2問全段階、誤計算・再入力・リセット、3幅×3テーマ×3文字サイズ×7枚×2ページ、JavaScript無効を検証`);
} finally { await browser.close(); }
