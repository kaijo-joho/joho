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
  await expect(page.locator('.cp-fraction > span').first()).toHaveText('圧縮後のサイズ');
  await expect(page.locator('.cp-fraction > span').nth(1)).toHaveText('圧縮前のサイズ');
  await expect(page.locator('.cp-comparison--rate')).toContainText('10 ÷ 16 × 100 ＝ 62.5%');
  assert.equal(await page.locator('[data-cp-size-model]').count(), 0, '圧縮率の定義と例を残し、操作用サイズモデルを置かない');
  await goSlide(3);
  const rle = page.locator('[data-cp-string-rle]');
  const rleNext = rle.locator('[data-cp-rle-next]');
  const rleArrow = rle.locator('[data-cp-rle-arrow]');
  await expect(rle.locator('[data-cp-rle-original]')).toHaveText('AAAAAABBBBCCDAAA');
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await expect(rle.locator('[data-cp-rle-before-count]')).toHaveText('（16文字）');
  await expect(rle.locator('[data-cp-rle-after-count]')).toBeEmpty();
  await expect(rle.locator('[data-cp-rle-rate]')).toBeHidden();
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toBeHidden();
  await expect(rleNext).toHaveText('次へ');
  await expect(rle.locator('[data-cp-rle-step]')).not.toContainText(/\b\d+\s*\/\s*\d+\b/);
  const stringPresentation = await page.locator('.cp-rle-demo').evaluate(el => {
    const original = el.querySelector('[data-cp-rle-original]');
    const compressed = el.querySelector('[data-cp-rle-compressed]');
    return {
      before: original.getBoundingClientRect().top,
      after: compressed.getBoundingClientRect().top,
      stringFont: parseFloat(getComputedStyle(original).fontSize),
      labelFont: parseFloat(getComputedStyle(el.querySelector('h3')).fontSize)
    };
  });
  assert(stringPresentation.after > stringPresentation.before, '圧縮後を元の文字列の下へ置く');
  assert(stringPresentation.stringFont > stringPresentation.labelFont, '対象の文字を大きく表示する');
  const firstRuns = ['A6', 'A6B4', 'A6B4C2', 'A6B4C2D1', 'A6B4C2D1A3'];
  for (const [index, expected] of firstRuns.entries()) {
    const beforeWipe = await rle.locator('[data-cp-rle-compressed]').textContent();
    await rleNext.click();
    if (index === 0) {
      await expect(rleArrow).toHaveClass(/is-wiping/);
      await expect(rleNext).toBeDisabled();
      await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText(beforeWipe);
      await rleNext.evaluate(button => {
        for (let i = 0; i < 3; i++) button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText(beforeWipe);
    }
    await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText(expected);
    await expect(rle.locator('[data-cp-rle-step]')).not.toContainText(/\b\d+\s*\/\s*\d+\b/);
    if (index < firstRuns.length - 1) await expect(rle.locator('[data-cp-rle-rate]')).toBeHidden();
  }
  await expect(rle.locator('[data-cp-rle-after-count]')).toHaveText('（10文字）');
  await expect(rle.locator('[data-cp-rle-rate]')).toBeVisible();
  await expect(rle.locator('[data-cp-rle-numerator]')).toHaveText('10文字');
  await expect(rle.locator('[data-cp-rle-denominator]')).toHaveText('16文字');
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toBeHidden();
  await rleNext.click();
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toBeVisible();
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toHaveText('＝ 62.5%');
  await expect(rleNext).toBeDisabled();
  await rle.locator('[data-cp-rle-reset]').click();
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await expect(rle.locator('[data-cp-rle-rate]')).toBeHidden();
  await page.getByRole('radio', { name: 'どちらも同じ', exact: true }).check();
  await page.getByRole('button', { name: '圧縮して比較', exact: true }).click();
  await expect(page.locator('[data-cp-string-compare-results]')).toContainText('200%');
  await expect(page.locator('[data-cp-string-compare-status]')).toContainText('予想と結果');
  await goSlide(4);
  const imageRle = page.locator('[data-cp-image-rle]');
  const imageNext = imageRle.locator('[data-cp-image-next]');
  await expect(imageRle.locator('[data-cp-image-step]')).not.toContainText(/\b\d+\s*\/\s*\d+\b/);
  const imageLayout = await imageRle.evaluate(root => {
    const heading = Array.from(root.querySelectorAll('h3')).find(node => node.textContent.trim() === '読み取りのまとまり');
    const controls = root.querySelector('[data-cp-image-next]').closest('.cp-controls');
    const button = root.querySelector('[data-cp-image-next]');
    const runs = root.querySelector('[data-cp-image-runs]');
    const status = root.querySelector('[data-cp-image-step]');
    const encoded = root.querySelector('[data-cp-image-encoded]');
    const rate = root.querySelector('[data-cp-image-rate-summary]');
    const after = (left, right) => Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
    const bounds = button.getBoundingClientRect();
    let ancestor = button.parentElement;
    let paneScrollTop = 0;
    while (ancestor && ancestor !== document.documentElement) { paneScrollTop += ancestor.scrollTop; ancestor = ancestor.parentElement; }
    return {
      buttonTop: bounds.top - new DOMMatrix(getComputedStyle(button).transform).m42 + window.scrollY + paneScrollTop,
      order: Boolean(heading && controls.parentElement === heading.parentElement && heading.nextElementSibling === controls && after(controls, runs) && after(runs, status) && after(status, encoded) && after(encoded, rate))
    };
  });
  assert(imageLayout.order, '画像の読み取りボタンを右列見出し直後に置き、読み取り結果を下へ並べる');
  const imageRuns = ['黒6', '黒6白4', '黒6白4黒4', '黒6白4黒4白1', '黒6白4黒4白1黒1', '黒6白4黒4白1黒1白4', '黒6白4黒4白1黒1白4黒1', '黒6白4黒4白1黒1白4黒1白4'];
  for (const [index, expected] of imageRuns.entries()) {
    await imageNext.click();
    await expect(imageRle.locator('[data-cp-image-runs] li')).toHaveCount(index + 1);
    await expect(imageRle.locator('[data-cp-image-encoded]')).toContainText(expected);
    await expect(imageRle.locator('[data-cp-image-step]')).not.toContainText(/\b\d+\s*\/\s*\d+\b/);
    const documentTop = await imageNext.evaluate(button => {
      let ancestor = button.parentElement;
      let paneScrollTop = 0;
      while (ancestor && ancestor !== document.documentElement) { paneScrollTop += ancestor.scrollTop; ancestor = ancestor.parentElement; }
      // Ignore the shared 1px hover lift; compare the button's layout position.
      return button.getBoundingClientRect().top - new DOMMatrix(getComputedStyle(button).transform).m42 + window.scrollY + paneScrollTop;
    });
    assert.ok(Math.abs(documentTop - imageLayout.buttonTop) < 1, `画像の読み取りボタンは段階${index + 1}でも同じ文書位置`);
  }
  await expect(imageNext).toBeDisabled();
  await expect(imageRle.locator('[data-cp-image-rate-summary]')).toContainText('64%');
  await imageRle.locator('[data-cp-image-reset]').click();
  await expect(imageRle.locator('[data-cp-image-runs] li')).toHaveCount(0);
  await expect(imageRle.locator('[data-cp-image-encoded]')).toContainText('まだ読み取っていません');
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
  // A pending wipe is canceled by Escape, opening the editor, reset, reduced motion, or hiding the slide.
  await rleNext.click();
  await expect(rleArrow).toHaveClass(/is-wiping/);
  await page.keyboard.press('Escape');
  await expect(rleArrow).not.toHaveClass(/is-wiping/);
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await rleNext.click();
  await expect(rleArrow).toHaveClass(/is-wiping/);
  await rle.locator('[data-cp-rle-reset]').click();
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await rleNext.click();
  await expect(rleArrow).toHaveClass(/is-wiping/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(rleArrow).not.toHaveClass(/is-wiping/);
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await rleNext.click();
  await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText('A6');
  await expect(rleArrow).not.toHaveClass(/is-wiping/);
  await rle.locator('[data-cp-rle-reset]').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await rleNext.click();
  await expect(rleArrow).toHaveClass(/is-wiping/);
  await goSlide(4);
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await goSlide(3);
  await rleNext.click();
  await expect(rleArrow).toHaveClass(/is-wiping/);
  await rle.getByRole('button', { name: '編集', exact: true }).click();
  await expect(rleNext).toBeDisabled();
  await expect(rleArrow).not.toHaveClass(/is-wiping/);
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await expect(rle.locator('[data-cp-rle-original]')).toBeHidden();
  const edit = rle.locator('[data-cp-rle-edit]');
  await edit.fill('ABC1');
  await expect(rleNext).toBeDisabled();
  await expect(rle.locator('[data-cp-rle-apply]')).toBeDisabled();
  await edit.press('Escape');
  await expect(rle.locator('[data-cp-rle-original]')).toHaveText('AAAAAABBBBCCDAAA');
  await expect(rle.locator('[data-cp-rle-edit-toggle]')).toBeFocused();
  await rle.getByRole('button', { name: '編集', exact: true }).click();
  await edit.fill('ＡＡＡＢＢ'); await edit.press('Enter');
  await expect(rle.locator('[data-cp-rle-original]')).toHaveText('AAABB');
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await expect(rle.locator('[data-cp-rle-after-count]')).toBeEmpty();
  await rleNext.click(); await expect(rleArrow).toHaveClass(/is-wiping/); await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText('A3');
  await rleNext.click(); await expect(rleArrow).toHaveClass(/is-wiping/); await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText('A3B2');
  await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText('A3B2');
  await expect(rle.locator('[data-cp-rle-before-count]')).toHaveText('（5文字）');
  await expect(rle.locator('[data-cp-rle-after-count]')).toHaveText('（4文字）');
  await expect(rle.locator('[data-cp-rle-numerator]')).toHaveText('4文字');
  await expect(rle.locator('[data-cp-rle-denominator]')).toHaveText('5文字');
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toBeHidden();
  await rleNext.click();
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toHaveText('＝ 80%');
  await expect(rleNext).toBeDisabled();
  // A long run can wrap while direct editing keeps the full string visible.
  await rle.getByRole('button', { name: '編集', exact: true }).click();
  await edit.fill('A'.repeat(40)); await edit.press('Enter');
  await expect(rle.locator('[data-cp-rle-compressed]')).toBeEmpty();
  await rleNext.click(); await expect(rleArrow).toHaveClass(/is-wiping/);
  await expect(rle.locator('[data-cp-rle-compressed]')).toHaveText('A40');
  await expect(rle.locator('[data-cp-rle-before-count]')).toHaveText('（40文字）');
  await expect(rle.locator('[data-cp-rle-after-count]')).toHaveText('（3文字）');
  await expect(rle.locator('[data-cp-rle-rate]')).toBeVisible();
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toBeHidden();
  await expect(rle.locator('[data-cp-rle-numerator]')).toHaveText('3文字');
  await expect(rle.locator('[data-cp-rle-denominator]')).toHaveText('40文字');
  await rleNext.click();
  await expect(rle.locator('[data-cp-rle-rate-answer]')).toHaveText('＝ 7.5%');
  const stringPractice = page.locator('[data-cp-rle-practice="string"]');
  const stringPracticeAnswer = stringPractice.locator('[data-cp-practice-answer]');
  await stringPractice.getByRole('button', { name: '判定', exact: true }).click();
  await expect(stringPractice.locator('[data-cp-practice-solution]')).toBeHidden();
  await expect(stringPractice.locator('[data-cp-practice-feedback]')).toContainText('入力してください');
  await stringPracticeAnswer.fill('A4B3C2DA2'); await stringPracticeAnswer.press('Enter');
  await expect(stringPractice.locator('[data-cp-practice-solution]')).toContainText('A4B3C2D1A2');
  await expect(stringPracticeAnswer).toHaveAttribute('aria-invalid', 'true');
  await stringPracticeAnswer.fill('Ａ４ Ｂ３ Ｃ２ Ｄ１ Ａ２');
  await expect(stringPractice.locator('[data-cp-practice-solution]')).toBeHidden();
  await stringPracticeAnswer.press('Enter');
  await expect(stringPractice.locator('[data-cp-practice-feedback]')).toHaveText('正解です。');
  await goSlide(4);
  const imagePractice = page.locator('[data-cp-rle-practice="image"]');
  const imagePracticeAnswer = imagePractice.locator('[data-cp-practice-answer]');
  await imagePractice.getByRole('button', { name: '判定', exact: true }).click();
  await expect(imagePractice.locator('[data-cp-practice-solution]')).toBeHidden();
  await imagePracticeAnswer.fill('黒5白4黒白2'); await imagePracticeAnswer.press('Enter');
  await expect(imagePracticeAnswer).toHaveAttribute('aria-invalid', 'true');
  await expect(imagePractice.locator('[data-cp-practice-solution]')).toContainText('黒5白4黒1白2');
  await imagePracticeAnswer.fill('黒５ 白４ 黒１ 白２'); await imagePracticeAnswer.press('Enter');
  await expect(imagePractice.locator('[data-cp-practice-feedback]')).toHaveText('正解です。');
  await goSlide(3);
  await expect(stringPractice.locator('[data-cp-practice-feedback]')).toHaveText('正解です。');
  await stringPractice.getByRole('button', { name: '入力を消す', exact: true }).click();
  await expect(stringPracticeAnswer).toHaveValue('');
  await expect(stringPractice.locator('[data-cp-practice-solution]')).toBeHidden();
  await goSlide(4);
  await imagePractice.getByRole('button', { name: '入力を消す', exact: true }).click();
  await expect(imagePracticeAnswer).toHaveValue('');
  await expect(imagePractice.locator('[data-cp-practice-solution]')).toBeHidden();

  await goSlide(7);
  const imageQuiz = page.locator('[data-cp-image-quiz]');
  await expect(imageQuiz).toContainText('黒黒 → 黒黒、白白 → 白白、黒黒黒 → 黒3');
  const q1 = imageQuiz.locator('[data-cp-image-question="figure2"]');
  const q2 = imageQuiz.locator('[data-cp-image-question="figure3"]');
  const q3 = imageQuiz.locator('[data-cp-image-question="figure4"]');
  assert.equal(await imageQuiz.getByRole('button', { name: '判定', exact: true }).count(), 3);
  for (const [question, key] of [[q1, 'figure2'], [q2, 'figure3'], [q3, 'figure4']]) {
    await question.getByRole('button', { name: '判定', exact: true }).click();
    await expect(question.locator(`[data-cp-image-solution="${key}"]`)).toBeHidden();
  }
  await q1.locator('[data-cp-image-answer]').fill('黒6白3黒3白1黒3');
  await q1.locator('[data-cp-image-answer]').press('Enter');
  await expect(q1.locator('[data-cp-image-feedback]')).toContainText('誤答');
  await expect(q1.locator('[data-cp-image-solution]')).toContainText('黒6白3黒3白黒3');
  await expect(q2.locator('[data-cp-image-solution]')).toBeHidden();
  await q1.locator('[data-cp-image-answer]').fill('黒６ 白３ 黒３ 白 黒３');
  await expect(q1.locator('[data-cp-image-solution]')).toBeHidden();
  await q1.locator('[data-cp-image-answer]').press('Enter');
  await expect(q1.locator('[data-cp-image-feedback]')).toContainText('正解');
  await q2.locator('input[value="2"]').check();
  await q2.locator('input[value="2"]').press('Enter');
  await expect(q2.locator('[data-cp-image-feedback]')).toContainText('誤答');
  await expect(q2.locator('[data-cp-image-solution]')).toContainText('図3②と図3④');
  await q2.locator('input[value="4"]').check();
  await expect(q2.locator('[data-cp-image-solution]')).toBeHidden();
  await q2.getByRole('button', { name: '判定', exact: true }).click();
  await expect(q2.locator('[data-cp-image-feedback]')).toContainText('正解');
  await q3.locator('input[value="3"]').check();
  await q3.getByRole('button', { name: '判定', exact: true }).click();
  await expect(q3.locator('[data-cp-image-solution]')).toBeHidden();
  await q3.locator('[data-cp-image-rate]').fill('50');
  await q3.locator('[data-cp-image-rate]').press('Enter');
  await expect(q3.locator('[data-cp-image-feedback]')).toContainText('誤答');
  await expect(q3.locator('[data-cp-problem-figure="4"]')).toHaveAttribute('aria-invalid', 'false');
  await expect(q3.locator('[data-cp-image-rate]')).toHaveAttribute('aria-invalid', 'true');
  await expect(q3.locator('[data-cp-image-solution]')).toContainText('60%');
  await expect(q3.locator('[data-cp-image-solution]')).toContainText('白白');
  await q3.locator('[data-cp-image-rate]').fill('６０');
  await expect(q3.locator('[data-cp-image-solution]')).toBeHidden();
  await q3.locator('[data-cp-image-rate]').press('Enter');
  await expect(q3.locator('[data-cp-image-feedback]')).toContainText('正解');
  await q2.getByRole('button', { name: 'この小問をリセット', exact: true }).click();
  await expect(q2.locator('input:checked')).toHaveCount(0);
  await expect(q2.locator('[data-cp-image-solution]')).toBeHidden();
  await expect(q1.locator('[data-cp-image-solution]')).toBeVisible();
  await expect(q3.locator('[data-cp-image-solution]')).toBeVisible();
  await q2.locator('input[value="2"]').check();
  await q2.locator('input[value="4"]').check();
  await q2.getByRole('button', { name: '判定', exact: true }).click();
  await goSlide(3);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.evaluate(() => { document.documentElement.dataset.textSize = 'xlarge'; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), '40文字の連続も390px・特大文字で折り返す');
  await page.setViewportSize({ width: 1440, height: 1000 });

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
        for (let n = 1; n <= 7; n++) {
          await page.goto(new URL(`${id}.html#headline_${n}`, base).href);
          await expect(page.getByRole('navigation', { name: 'スライド間の移動' })).toBeVisible();
          await expect(page.locator(`#headline_${n}`)).toBeVisible();
          await page.evaluate(({ theme, font }) => { if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; document.documentElement.dataset.textSize = font; }, { theme, font });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(sizes.scroll <= sizes.width + 1, `${id} ${width}px ${theme}/${font} slide${n} 横はみ出し ${JSON.stringify(sizes)}`);
        }
      }
    }
  }
  const touch = await browser.newContext({ viewport: { width: 390, height: 1000 }, hasTouch: true });
  const touchPage = await touch.newPage();
  await touchPage.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  await touchPage.goto(new URL('dr51.html#headline_3', base).href);
  await expect(touchPage.getByRole('navigation', { name: 'スライド間の移動' })).toBeVisible();
  const touchString = touchPage.locator('[data-cp-rle-practice="string"]');
  await touchString.locator('[data-cp-practice-answer]').fill('A4B3C2D1A2');
  await touchString.getByRole('button', { name: '判定', exact: true }).tap();
  await expect(touchString.locator('[data-cp-practice-feedback]')).toContainText('正解');
  await touchString.getByRole('button', { name: '入力を消す', exact: true }).tap();
  await expect(touchString.locator('[data-cp-practice-answer]')).toHaveValue('');
  await touchPage.goto(new URL('dr51.html#headline_4', base).href);
  await expect(touchPage.getByRole('navigation', { name: 'スライド間の移動' })).toBeVisible();
  const touchImage = touchPage.locator('[data-cp-rle-practice="image"]');
  await touchImage.locator('[data-cp-practice-answer]').fill('黒5白4黒1白2');
  await touchImage.getByRole('button', { name: '判定', exact: true }).tap();
  await expect(touchImage.locator('[data-cp-practice-feedback]')).toContainText('正解');
  await touchPage.goto(new URL('dr51.html#headline_7', base).href);
  await expect(touchPage.getByRole('navigation', { name: 'スライド間の移動' })).toBeVisible();
  const touchQ1 = touchPage.locator('[data-cp-image-question="figure2"]');
  const touchQ2 = touchPage.locator('[data-cp-image-question="figure3"]');
  await touchQ1.locator('[data-cp-image-answer]').fill('黒6白3黒3白黒3');
  await touchQ1.getByRole('button', { name: '判定', exact: true }).tap();
  await touchQ2.locator('input[value="2"]').tap();
  await touchQ2.locator('input[value="4"]').tap();
  await touchQ2.getByRole('button', { name: '判定', exact: true }).tap();
  await expect(touchQ2.locator('[data-cp-image-feedback]')).toContainText('正解');
  await expect(touchQ1.locator('[data-cp-image-solution]')).toBeVisible();
  await touch.close();
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noScript.newPage();
  for (const id of ['dr51', 'dr52']) {
    await fallback.goto(new URL(`${id}.html`, base).href);
    assert.equal(await fallback.locator('[data-lesson-slide]').count(), 7);
    await expect(fallback.locator('[data-lesson-slide]').last()).toBeVisible();
    assert.equal(await fallback.locator('body.lesson-slide-ready').count(), 0);
    if (id === 'dr51') {
      await expect(fallback.locator('[data-cp-rle-practice="string"] noscript p')).toBeVisible();
      await expect(fallback.locator('[data-cp-rle-practice="string"] noscript p')).toContainText('解答：A4B3C2D1A2');
      await expect(fallback.locator('[data-cp-rle-practice="image"] noscript p')).toContainText('解答：黒5白4黒1白2');
      await expect(fallback.locator('[data-cp-image-quiz] noscript p').nth(1)).toContainText('②と④');
    }
  }
  await noScript.close();
  assert.deepEqual(errors, [], 'ページ例外・コンソールエラーなし');
  console.log(`compression-pages-browser (${engine}): RLEワイプ後の段階表示・圧縮率の分数と答えの開示・連打防止と取消し・画像の読み取りボタン位置・40文字編集、追加練習2問、画像3小問の独立判定・解答・再入力・リセット・タッチ、既存の圧縮/Huffman操作と演習、3幅×3テーマ×3文字サイズ×7枚×2ページ、JavaScript無効を検証`);
} finally { await browser.close(); }
