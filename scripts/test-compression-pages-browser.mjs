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
const goSlide = async n => {
  const button = page.getByRole('button', { name: new RegExp(`^${n} / 7：`) });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await button.isVisible()) await button.click();
  else {
    const selector = page.getByRole('navigation', { name: 'スライド間の移動' }).getByRole('combobox');
    if (await selector.isVisible()) await selector.selectOption(String(n));
    else await button.click();
  }
};
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
  const frequency = page.locator('[data-cp-frequency-comparison]');
  const frequencies = { A: 5, B: 7, C: 3, D: 2, E: 1 };
  const symbols = Object.keys(frequencies);
  const frequencyCodes = { B: '0', A: '10', C: '110', D: '1110', E: '1111' };
  const fixedCodes = { A: '001', B: '010', C: '011', D: '100', E: '101' };
  const sample = 'DAEBCBACBBBCDAAABB';
  await expect(frequency).toHaveAttribute('data-cp-frequency-active', '');
  await expect(frequency.locator('[data-cp-frequency-select], [data-cp-frequency-controls]')).toHaveCount(0);
  await expect(frequency.locator('[data-cp-frequency-source]')).toHaveText(sample);
  await expect(frequency.locator('[data-cp-frequency-fixed-total]')).toHaveText('54bit');
  await expect(frequency.locator('[data-cp-frequency-variable-total]')).toHaveText('38bit');
  await expect(frequency.locator('.cp-frequency-source-panel h3')).toHaveText('元の文字列 18文字');
  await expect(frequency.locator('.cp-frequency-lane h4').first()).toHaveText('固定長符号：1文字3bit×18文字＝54bit');
  await expect(frequency.locator('.cp-frequency-lane__description').first()).toHaveText('固定長符号は、どの文字も同じbit数で表します。この例ではA〜Eの5種類の文字があるため、各文字を3bitで表します。');
  await expect(frequency.locator('.cp-frequency-lane__description').last()).toContainText('頻度とは、文字ごとの出現回数のこと');
  await expect(frequency.locator('.cp-frequency-panel')).toHaveCount(3);
  for (const symbol of symbols) {
    await expect(frequency.locator(`[data-cp-frequency-count="${symbol}"]`)).toHaveText(`${frequencies[symbol]}回`);
    await expect(frequency.locator(`[data-cp-frequency-code="${symbol}"]`)).toHaveText(frequencyCodes[symbol]);
    await expect(frequency.locator(`[data-cp-frequency-length="${symbol}"]`)).toHaveText(`${frequencyCodes[symbol].length}bit`);
    await expect(frequency.locator(`[data-cp-frequency-contribution="${symbol}"]`)).toHaveText(`${frequencies[symbol] * frequencyCodes[symbol].length}bit`);
  }
  await expect(frequency.locator('[data-cp-frequency-frequency-total]')).toHaveText('18回');
  await expect(frequency.locator('[data-cp-frequency-contribution-total]')).toHaveText('38bit');
  const bandData = await frequency.evaluate(root => {
    const collect = selector => {
      const track = root.querySelector(selector);
      const words = [...track.querySelectorAll('.cp-frequency-word')];
      return { bits: words.flatMap(word => [...word.querySelectorAll('.cp-frequency-bit')].map(bit => bit.textContent)).join(''), words: words.map(word => ({ symbol: word.dataset.cpFrequencyWord, code: [...word.querySelectorAll('.cp-frequency-bit')].map(bit => bit.textContent).join(''), flex: parseFloat(word.style.flexBasis), widths: [...word.querySelectorAll('.cp-frequency-bit')].map(bit => bit.getBoundingClientRect().width) })) };
    };
    return { source: [...root.querySelectorAll('[data-cp-frequency-source] span')].map(span => span.textContent).join(''), fixed: collect('[data-cp-frequency-fixed-bits]'), variable: collect('[data-cp-frequency-variable-bits]'), sameScroll: root.querySelector('[data-cp-frequency-fixed-bits]').closest('.cp-frequency-bands__scroll') === root.querySelector('[data-cp-frequency-variable-bits]').closest('.cp-frequency-bands__scroll') };
  });
  assert.equal(bandData.source, sample);
  assert.equal(bandData.fixed.bits.length, 54);
  assert.equal(bandData.variable.bits.length, 38);
  assert.equal(bandData.sameScroll, true, '2段の符号帯を同じスクロール枠に配置');
  assert.equal(bandData.fixed.words.length, 18);
  assert.equal(bandData.variable.words.length, 18);
  for (const [index, symbol] of Array.from(sample).entries()) {
    assert.equal(bandData.fixed.words[index].symbol, symbol);
    assert.equal(bandData.variable.words[index].symbol, symbol);
    assert.equal(bandData.fixed.words[index].code, fixedCodes[symbol]);
    assert.equal(bandData.variable.words[index].code, frequencyCodes[symbol]);
  }
  assert(Math.abs(bandData.variable.words.reduce((sum, word) => sum + word.flex, 0) / bandData.fixed.words.reduce((sum, word) => sum + word.flex, 0) - 38 / 54) < 0.001, '帯の全長比は38/54');
  const bitWidths = [...bandData.fixed.words, ...bandData.variable.words].flatMap(word => word.widths);
  assert(Math.max(...bitWidths) - Math.min(...bitWidths) < 0.1, '両段の各1bitセルは同じ幅');
  const activateAndCheck = async symbol => {
    await expect(frequency).toHaveAttribute('data-cp-frequency-active', symbol);
    await expect(frequency.locator('[data-cp-frequency-source] .is-current')).toHaveCount(frequencies[symbol]);
    assert.equal(await frequency.locator(`[data-cp-frequency-column="${symbol}"].is-current`).count(), await frequency.locator(`[data-cp-frequency-column="${symbol}"]`).count(), `${symbol}の全列を連動強調`);
    await expect(frequency.locator(`[data-cp-frequency-word="${symbol}"].is-current`)).toHaveCount(frequencies[symbol] * 2);
  };
  for (const symbol of symbols) {
    const sourceLetter = frequency.locator(`[data-cp-frequency-source] [data-cp-frequency-column="${symbol}"]`).first();
    await sourceLetter.hover(); await activateAndCheck(symbol);
    await page.mouse.move(5, 5); await expect(frequency).toHaveAttribute('data-cp-frequency-active', '');
    const word = frequency.locator(`[data-cp-frequency-word="${symbol}"]`).first();
    await word.hover(); await activateAndCheck(symbol);
    await page.mouse.move(5, 5); await expect(frequency).toHaveAttribute('data-cp-frequency-active', '');
    const cell = frequency.locator(`[data-cp-frequency-count="${symbol}"]`);
    await cell.hover(); await activateAndCheck(symbol);
    await page.mouse.move(5, 5); await expect(frequency).toHaveAttribute('data-cp-frequency-active', '');
  }
  const matrixStyle = await frequency.evaluate(root => {
    const colors = {};
    for (const symbol of ['A', 'B', 'C', 'D', 'E']) {
      const nodes = [...root.querySelectorAll(`[data-cp-frequency-column="${symbol}"]`), ...root.querySelectorAll(`[data-cp-frequency-word="${symbol}"] .cp-frequency-bit`)];
      colors[symbol] = [...new Set(nodes.map(node => getComputedStyle(node).color))];
    }
    const cell = root.querySelector('[data-cp-frequency-count="A"]');
    return { colors, shadow: getComputedStyle(cell).boxShadow, weight: getComputedStyle(cell).fontWeight };
  });
  assert(Object.values(matrixStyle.colors).every(values => values.length === 1), `同じ文字の全要素で文字色が統一 ${JSON.stringify(matrixStyle.colors)}`);
  assert.equal(new Set(Object.values(matrixStyle.colors).map(values => values[0])).size, 5, 'A〜Eはそれぞれ異なる文字色');
  assert.equal(matrixStyle.shadow, 'none', '下表の強調に影や太枠を使わない');
  const baselineWeight = matrixStyle.weight;
  await frequency.locator('[data-cp-frequency-letter="A"]').hover();
  const activeTableStyle = await frequency.locator('[data-cp-frequency-count="A"]').evaluate(el => ({ shadow: getComputedStyle(el).boxShadow, weight: getComputedStyle(el).fontWeight }));
  assert.equal(activeTableStyle.shadow, 'none', '下表の強調に影を追加しない');
  assert.equal(activeTableStyle.weight, baselineWeight, '下表の強調で太字を追加しない');
  await page.mouse.move(5, 5);
  const keyboardA = frequency.locator('[data-cp-frequency-letter="A"]');
  await keyboardA.focus(); await keyboardA.press('Enter'); await activateAndCheck('A');
  await keyboardA.press('Space'); await activateAndCheck('A');
  await page.keyboard.press('Escape'); await expect(frequency).toHaveAttribute('data-cp-frequency-active', '');
  await keyboardA.focus(); await keyboardA.press('Enter'); await frequency.locator('.cp-frequency-bands__scroll').focus();
  await expect(frequency).toHaveAttribute('data-cp-frequency-active', '');
  await keyboardA.focus(); await keyboardA.press('Enter'); await goSlide(2);
  await expect(frequency).toHaveAttribute('data-cp-frequency-active', ''); await goSlide(1);
  for (const theme of ['light', 'dark', 'system']) {
    await page.evaluate(theme => { if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, theme);
    const themed = await frequency.evaluate(root => ['A', 'B', 'C', 'D', 'E'].map(s => {
      const color = node => getComputedStyle(node).color;
      return [color(root.querySelector(`[data-cp-frequency-source] [data-cp-frequency-column="${s}"]`)), color(root.querySelector(`[data-cp-frequency-word="${s}"] .cp-frequency-word__symbol`)), color(root.querySelector(`[data-cp-frequency-word="${s}"] .cp-frequency-bit`)), color(root.querySelector(`thead [data-cp-frequency-column="${s}"]`)), color(root.querySelector(`[data-cp-frequency-count="${s}"]`))];
    }));
    assert.equal(new Set(themed.map(row => row[0])).size, 5, `5色がテーマ${theme}で区別できる`);
    for (const row of themed) assert.equal(new Set(row).size, 1, `同一文字の文字色がテーマ${theme}で統一`);
  }
  assert.match(await page.locator('html').evaluate(() => [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).join('\n')), /color-mix\([^;]*5%/i, '下表の強調色は5%');
  const mouseHeader = frequency.locator('[data-cp-frequency-letter="C"]');
  await mouseHeader.click(); await expect(frequency).toHaveAttribute('data-cp-frequency-active', 'C');
  await page.mouse.move(5, 5); await expect(frequency).toHaveAttribute('data-cp-frequency-active', '');

  await goSlide(2);
  const build = page.locator('[data-cp-huffman-build]');
  const buildNext = build.locator('[data-cp-build-next]');
  const treeDimensions = () => build.locator('[data-cp-tree]').evaluate(e => ({ height: e.getBoundingClientRect().height, points: Array.from(e.querySelectorAll('[data-cp-node]')).filter(n => n.querySelector('circle')).map(n => [n.dataset.cpNode, n.querySelector('circle').getAttribute('cx'), n.querySelector('circle').getAttribute('cy')]) }));
  const emptyTree = await treeDimensions();
  assert.equal(emptyTree.points.length, 0, '最初は木の場所だけ確保');
  await expect(build.locator('[data-cp-build-status]')).toHaveText('前ページの例で、頻度の大きい順に文字を並べます。');
  assert((await build.locator('[data-cp-build-symbol], [data-cp-build-count], [data-cp-build-code]').allTextContents()).every(text => text === ''), '最初の表は文字・頻度・符号を未表示');
  const layout = await build.evaluate(root => {
    const rect = selector => { const r = root.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
    return { status: rect('[data-cp-build-status]'), controls: rect('[data-cp-build-controls]'), tree: rect('.cp-build-diagram'), table: rect('.cp-build-code-panel'), reset: rect('.cp-build-reset') };
  });
  assert(layout.status.right <= layout.controls.x && layout.status.y < layout.tree.y, '上段は説明の右に前へ・次へ');
  assert(layout.tree.right <= layout.table.x && Math.abs(layout.tree.y - layout.table.y) < 1, '中段は木と表を左右へ並べる');
  assert(layout.reset.y >= Math.max(layout.tree.bottom, layout.table.bottom), '最初からは木と表の下');
  await buildNext.click();
  await expect(build.locator('[data-cp-build-status]')).toHaveText('各文字の上に頻度を〇で囲んで示します。');
  assert.deepEqual(await build.locator('[data-cp-tree] .cp-leaf').allTextContents(), ['B', 'A', 'C', 'D', 'E'], '最初のクリックは頻度順の文字だけ');
  await expect(build.locator('[data-cp-tree] circle')).toHaveCount(0);
  assert((await build.locator('[data-cp-build-count]').allTextContents()).every(text => text === ''), '文字だけの段階では表にも頻度を出さない');
  const letterPositions = await build.locator('[data-cp-tree] .cp-leaf').evaluateAll(items => items.map(e => [e.textContent, e.getAttribute('x'), e.getAttribute('y')]));
  await buildNext.press('Enter');
  await expect(build.locator('[data-cp-build-status]')).toHaveText('頻度の小さい２つを選び結合します。');
  assert.deepEqual(await build.locator('[data-cp-tree] circle + text').allTextContents(), ['7', '5', '3', '2', '1'], '2回目に各文字の上へ頻度を丸で表示');
  assert.deepEqual(await build.locator('[data-cp-tree] .cp-leaf').evaluateAll(items => items.map(e => [e.textContent, e.getAttribute('x'), e.getAttribute('y')])), letterPositions, '頻度を追加しても文字の位置は同じ');
  assert.deepEqual(await build.locator('[data-cp-build-count]').allTextContents(), ['5', '7', '3', '2', '1'], '表の頻度も同じ段階で表示');
  const fixed = await treeDimensions();
  assert.equal(fixed.points.length, 5);
  assert.equal(fixed.height, emptyTree.height);
  for (let i = 0; i < 4; i++) {
    await buildNext.click();
    const current = await treeDimensions();
    assert.equal(current.height, fixed.height, '木が完成しても下の表を動かさない');
    for (const point of fixed.points) assert.deepEqual(current.points.find(p => p[0] === point[0]), point, '葉の座標を維持');
    const up = await build.locator('.cp-new-edge').evaluateAll(edges => edges.every(e => Number(e.getAttribute('y1')) > Number(e.getAttribute('y2'))));
    assert.equal(up, true, '結合のワイプは子から親へ向かう');
    assert.equal(await build.locator('.cp-new-edge').evaluateAll(edges => edges.length === 2 && edges.every(e => getComputedStyle(e).animationName === 'cp-connect')), true, '結合する2辺をワイプ表示する');
    assert.equal(await build.locator('.cp-edge-label').count(), 0, '結合中は枝のbitを出さない');
    const delayedParent = build.locator('.cp-new-node');
    assert.equal(await delayedParent.evaluate(e => Number(getComputedStyle(e).opacity)), 0, 'ワイプ中は新しい親の丸を隠す');
    assert.equal(await delayedParent.evaluate(e => getComputedStyle(e).animationDelay), '0.4s', '枝のワイプのあとに親の丸を表示');
    await expect(build).toHaveAttribute('data-cp-build-animating', 'false');
    assert.equal(await build.locator('[data-cp-tree-nodes] > g').evaluateAll(nodes => nodes.every(e => Number(getComputedStyle(e).opacity) === 1)), true);
    const explanation = await build.locator('[data-cp-build-status]').textContent();
    assert(!/[根枝葉節点]/.test(explanation), '結合の説明は丸・線・文字で伝える');
    assert(explanation.includes(i === 3 ? 'ハフマン木が完成しました' : '次に、頻度の小さい２つを選び結合します。'), '結合後は次に行う操作も説明');
  }
  for (let i = 0; i < 4; i++) {
    await buildNext.click();
    assert.equal(await build.locator('.cp-edge-label').count(), 2 * (i + 1), '根から各親の0/1を順に示す');
    assert.equal(await build.locator('[data-cp-tree-edges] line').evaluateAll(edges => edges.every(e => getComputedStyle(e).animationName === 'none')), true, '0/1の割当では既存の線をアニメーションさせない');
    assert.deepEqual(await build.locator('.cp-tracing-label').allTextContents(), ['0', '1'], '0/1の文字だけを枝の近くへ追加');
  }
  await build.locator('[data-cp-tree]').evaluate(e => { window.__cpBuildBase = [...e.querySelectorAll('[data-cp-tree-edges] line, [data-cp-tree-nodes] circle')]; });
  for (const symbol of symbols) {
    await buildNext.click();
    await expect(build).toHaveAttribute('data-cp-build-animating', 'true');
    const row = build.locator(`[data-cp-build-row="${symbol}"]`);
    await expect(row.locator('[data-cp-build-code]')).toBeEmpty();
    assert.equal(await build.locator('.cp-path-wipe').count(), frequencyCodes[symbol].length, '根から文字までの全経路を赤色で順にワイプ');
    assert.equal(await build.locator('[data-cp-tree]').evaluate(e => window.__cpBuildBase.every(n => n.isConnected && e.contains(n))), true, '既存の線と丸を保持して赤色を重ねる');
    const overlays = await build.locator('.cp-path-wipe').evaluateAll(edges => edges.map(e => ({ y1: Number(e.getAttribute('y1')), y2: Number(e.getAttribute('y2')), delay: parseFloat(getComputedStyle(e).animationDelay) })));
    assert(overlays.every((edge, index) => edge.y1 < edge.y2 && Math.abs(edge.delay - index * .28) < .001), '根から下へ、1枝ずつ順に進む');
    await expect(build).toHaveAttribute('data-cp-build-animating', 'false');
    await expect(row.locator('[data-cp-build-code]')).toHaveText(frequencyCodes[symbol]);
    await expect(row).toHaveClass('is-current');
    await expect(build.locator('.cp-path-nodes')).toHaveClass('cp-path-nodes is-complete');
    assert.equal(await build.locator(`[data-cp-path-node="${frequencyCodes[symbol]}"]`).count(), 1, '対応する葉と表の行を同時に強調');
    assert.equal(await row.locator('[data-cp-build-code]').evaluate(e => getComputedStyle(e).color), await build.locator('.cp-path-edge').first().evaluate(e => getComputedStyle(e).stroke), '符号文字も経路と同じ赤色');
  }
  await expect(buildNext).toBeDisabled();
  await expect(build.locator('[data-cp-build-status]')).toContainText('E');
  await build.locator('[data-cp-build-prev]').click();
  await expect(build.locator('[data-cp-build-row="E"] [data-cp-build-code]')).toBeEmpty();
  await build.locator('[data-cp-build-reset]').click();
  await expect(build).toHaveAttribute('data-cp-build-step', '0');
  // Reset, slide changes and reduced motion settle/cancel only the current animation.
  for (let i = 0; i < 10; i++) await buildNext.click();
  await buildNext.click();
  await build.locator('[data-cp-build-reset]').click();
  await page.waitForTimeout(800);
  await expect(build).toHaveAttribute('data-cp-build-step', '0');
  await expect(build.locator('[data-cp-tree] circle')).toHaveCount(0);
  for (let i = 0; i < 10; i++) await buildNext.click();
  await buildNext.click(); await goSlide(3);
  await expect(build).toHaveAttribute('data-cp-build-animating', 'false');
  await goSlide(2);
  await expect(build.locator('[data-cp-build-row="A"] [data-cp-build-code]')).toHaveText('10');
  await buildNext.click(); await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(build.locator('[data-cp-build-row="B"] [data-cp-build-code]')).toHaveText('0');
  await expect(build).toHaveAttribute('data-cp-build-animating', 'false');
  await build.locator('[data-cp-build-reset]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let i = 0; i < 15; i++) await buildNext.click();
  assert.equal(await build.locator('.cp-new-edge').evaluateAll(edges => edges.every(e => getComputedStyle(e).animationName === 'none')), true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await goSlide(3);
  const encoder = page.locator('[data-cp-codec="encode"]');
  const decoder = page.locator('[data-cp-codec="decode"]');
  const encodedBits = async () => (await encoder.locator('[data-cp-codec-output] td').allTextContents()).join('');
  const sourceLetters = async () => (await encoder.locator('[data-cp-codec-source] td').allTextContents()).join('');
  const decodedLetters = async () => (await decoder.locator('[data-cp-codec-output] td').allTextContents()).join('');
  assert.equal(await page.locator('[data-cp-codec] [data-cp-tree]').count(), 0, '符号化/復元スライドは木を置かない');
  assert.equal(await encoder.locator('table [data-cp-codec-row]').count(), 5, '符号を表で提示');
  const editCodec = async (host, text) => {
    if (await host.locator('[data-cp-codec-editor]').isHidden()) await host.locator('[data-cp-codec-edit]').click();
    await host.locator('[data-cp-codec-input]').fill(text);
    await host.locator('[data-cp-codec-apply]').click();
  };
  await expect(encoder.locator('[data-cp-codec-input]')).toBeHidden();
  await expect(encoder.locator('.cp-codec-band')).toHaveCount(1);
  await expect(encoder.locator('[data-cp-codec-grid] tbody tr')).toHaveCount(2);
  await expect(encoder.locator('[data-cp-codec-source] td')).toHaveCount(18);
  await expect(encoder.locator('[data-cp-codec-output] td')).toHaveCount(18);
  assert.equal(await encodedBits(), '', '開始前は元の文字を1セルずつ表示し、対応する符号のセルは空欄');
  assert.equal(await sourceLetters(), 'DAEBCBACBBBCDAAABB');
  const codecLayout = await encoder.locator('[data-cp-codec-grid]').evaluate(table => {
    const rows = [...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td')]);
    return rows[0].map((cell, i) => {
      const upper = cell.getBoundingClientRect(), lower = rows[1][i].getBoundingClientRect();
      return { upperX: upper.x, lowerX: lower.x, upperWidth: upper.width, lowerWidth: lower.width, upperBottom: upper.bottom, lowerTop: lower.top, upperColor: getComputedStyle(cell).color, lowerColor: getComputedStyle(rows[1][i]).color };
    });
  });
  assert(codecLayout.every(cell => Math.abs(cell.upperX - cell.lowerX) < .1 && Math.abs(cell.upperWidth - cell.lowerWidth) < .1 && cell.upperBottom <= cell.lowerTop), '1文字と1文字分の符号を同じ列の上下のセルに配置');
  assert(codecLayout.every(cell => cell.upperColor === cell.lowerColor), '対応する文字と符号は同じ色');
  await encoder.locator('[data-cp-codec-next]').press('Enter');
  assert.equal(await encodedBits(), '1110');
  await expect(encoder.locator('[data-cp-codec-output] td.is-current')).toHaveText('1110');
  await expect(encoder.locator('[data-cp-codec-source] td.is-current')).toHaveText('D');
  await expect(encoder.locator('[data-cp-codec-row="D"]')).toHaveClass(/is-current/);
  await encoder.locator('[data-cp-codec-edit]').click();
  await encoder.locator('[data-cp-codec-input]').fill('ABC');
  await expect(encoder.locator('[data-cp-codec-next]')).toBeDisabled();
  await encoder.locator('[data-cp-codec-cancel]').click();
  assert.equal(await encodedBits(), '1110');
  assert.equal(await sourceLetters(), 'DAEBCBACBBBCDAAABB');
  await expect(encoder.locator('[data-cp-codec-edit]')).toBeFocused();
  await page.waitForTimeout(500);
  assert.equal(await encodedBits(), '1110');
  for (let i = 1; i < 18; i++) await encoder.locator('[data-cp-codec-next]').click();
  const fullBits = '11101011110110010110000110111010101000';
  assert.equal(await encodedBits(), fullBits);
  await expect(encoder.locator('[data-cp-codec-output-count]')).toHaveText('38bit');
  await expect(encoder.locator('[data-cp-codec-output] td').first()).toHaveAttribute('aria-label', '1列目の符号化：1110');
  await expect(encoder.locator('[data-cp-codec-next]')).toBeDisabled();
  await editCodec(encoder, 'F');
  await expect(encoder.locator('[data-cp-codec-input]')).toHaveAttribute('aria-invalid', 'true');
  await expect(encoder.locator('[data-cp-codec-next]')).toBeDisabled();
  await editCodec(encoder, 'DAE');
  await encoder.locator('[data-cp-codec-next]').click();
  assert.equal(await encodedBits(), '1110');
  await encoder.locator('[data-cp-codec-reset]').click();
  assert.equal(await encodedBits(), '');
  assert.equal(await sourceLetters(), 'DAE');
  await expect(encoder.locator('[data-cp-codec-grid] td.is-current')).toHaveCount(0);
  await expect(encoder.locator('[data-cp-codec-output-count]')).toHaveText('0bit');
  await page.getByRole('tab', { name: '復元', exact: true }).click();
  await expect(decoder.locator('[data-cp-codec-input]')).toHaveValue(fullBits);
  await expect(decoder.locator('.cp-codec-band')).toHaveCount(1);
  await expect(decoder.locator('[data-cp-codec-source] td')).toHaveCount(18);
  assert.equal(await decodedLetters(), '');
  assert.deepEqual((await decoder.locator('[data-cp-codec-source] td').allTextContents()).slice(0, 5), ['1110', '10', '1111', '0', '110']);
  for (let i = 0; i < 3; i++) {
    await decoder.locator('[data-cp-codec-next]').click();
    assert.equal(await decoder.locator('.cp-codec-bit.is-reading').count(), i + 1, '文字が決まるまで読んだビット全部に下線を残す');
    await expect(decoder.locator('.cp-codec-bit.is-current')).toHaveAttribute('data-cp-bit-index', String(i));
    assert.equal(await decoder.locator('.cp-codec-bit.is-current').evaluate(e => getComputedStyle(e).outlineStyle), 'solid', '今のbitを枠で囲む');
  }
  await expect(decoder.locator('[data-cp-codec-pending]')).toContainText('111');
  assert.equal(await decodedLetters(), '', '符号を最後まで読む前に復元文字を出さない');
  await decoder.locator('[data-cp-codec-next]').click();
  assert.equal(await decodedLetters(), 'D');
  assert.equal(await decoder.locator('.cp-codec-bit.is-reading').count(), 4, '文字を確定する最後のbitまで下線を残す');
  await expect(decoder.locator('.cp-codec-bit.is-current')).toHaveAttribute('data-cp-bit-index', '3');
  await expect(decoder.locator('[data-cp-codec-source] td.is-current')).toHaveText('1110');
  await expect(decoder.locator('[data-cp-codec-output] td.is-current')).toHaveText('D');
  for (let i = 4; i < 38; i++) await decoder.locator('[data-cp-codec-next]').click();
  assert.equal(await decodedLetters(), 'DAEBCBACBBBCDAAABB');
  await editCodec(decoder, '11010');
  for (let i = 0; i < 3; i++) await decoder.locator('[data-cp-codec-next]').click();
  assert.equal(await decodedLetters(), 'C');
  assert.deepEqual(await decoder.locator('.cp-codec-bit.is-reading').allTextContents(), ['1', '1', '0'], '110の0で確定しても110全体へ下線を残す');
  await expect(decoder.locator('.cp-codec-bit.is-current')).toHaveAttribute('data-cp-bit-index', '2');
  await decoder.locator('[data-cp-codec-next]').click();
  assert.deepEqual(await decoder.locator('.cp-codec-bit.is-reading').allTextContents(), ['1'], '次の文字へ進むと以前の下線を解除する');
  await expect(decoder.locator('.cp-codec-bit.is-reading')).toHaveAttribute('data-cp-bit-index', '3');
  await decoder.locator('[data-cp-codec-next]').click();
  assert.equal(await decodedLetters(), 'CA');
  assert.deepEqual(await decoder.locator('.cp-codec-bit.is-reading').allTextContents(), ['1', '0'], '続く10も最後の0まで下線を残す');
  await decoder.locator('[data-cp-codec-reset]').click();
  await expect(decoder.locator('.cp-codec-bit.is-reading')).toHaveCount(0);

  await editCodec(decoder, '111');
  for (let i = 0; i < 3; i++) await decoder.locator('[data-cp-codec-next]').click();
  await expect(decoder.locator('[data-cp-codec-status]')).toContainText('途中');
  await editCodec(decoder, '12');
  await expect(decoder.locator('[data-cp-codec-input]')).toHaveAttribute('aria-invalid', 'true');

  const connect = async (host, pair, keyboard = false) => {
    for (const [index, id] of pair.entries()) {
      const node = host.locator(`[data-cp-practice-node="${id}"]`);
      if (keyboard) await node.press(index === 0 ? 'Enter' : 'Space'); else await node.click();
    }
  };
  const completeSmallest = async host => {
    while (await host.locator('[data-cp-practice-node]').count() > 1) {
      const pair = await host.locator('[data-cp-practice-node]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.cpPracticeNode, count: Number(n.querySelector('circle + text').textContent) })).sort((a, b) => a.count - b.count).slice(0, 2).map(n => n.id));
      await connect(host, pair);
    }
  };
  await goSlide(4);
  const practice = page.locator('[data-cp-huffman-practice]');
  assert.deepEqual(await practice.locator('[data-cp-practice-preset]').allTextContents(), Array.from({length: 10}, (_,i) => `例${i+1}`), '例名は番号だけ');
  const checkCompactTree = async host => {
    const size = await host.locator('[data-cp-tree]').evaluate(tree => ({
      height: tree.getBoundingClientRect().height,
      width: tree.querySelector('svg').getBoundingClientRect().width,
      hitAreas: [...tree.querySelectorAll('[data-cp-hit-area]')].map(hit => ({ width: hit.getBoundingClientRect().width, height: hit.getBoundingClientRect().height }))
    }));
    assert(size.width <= 641 && size.height <= 550, '画面幅に合わせて木を過度に拡大しない');
    assert(size.hitAreas.every(hit => hit.width >= 44 && hit.height >= 44), '縮小後も44px以上の選択領域を保つ');
  };
  await checkCompactTree(practice);

  assert.equal(await practice.getByRole('combobox').count(), 0);
  await expect(practice.locator('[data-cp-practice-judge]')).toBeDisabled();
  await connect(practice, ['A', 'B']);
  assert.equal(await practice.locator('[data-cp-practice-node]').count(), 4, '誤ったペアも結合する');
  await expect(practice.locator('[data-cp-build-status]')).not.toContainText('選びます');
  await completeSmallest(practice);
  await expect(practice.locator('[data-cp-build-status]')).not.toContainText('正解');
  await practice.locator('[data-cp-practice-judge]').click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('1回目');
  await expect(practice.locator('[data-cp-build-status]')).toContainText('1と2');
  await practice.locator('[data-cp-practice-reset]').click();
  assert.equal(await practice.locator('[data-cp-practice-preset]').count(), 10, '文字数や頻度の異なる10例');
  assert.equal(await practice.locator('[data-cp-practice-join]').count(), 0, '結合操作の追加ボタンは不要');
  const leafCoordinates = () => practice.locator('[data-cp-tree]').evaluate(e => [...e.querySelectorAll('[data-cp-node]')].filter(n => n.querySelector('.cp-leaf')).map(n => [n.dataset.cpNode, n.querySelector('circle').getAttribute('cx'), n.querySelector('circle').getAttribute('cy')]));
  const initialLeaves = await leafCoordinates();
  await connect(practice, ['D', 'E']);
  await connect(practice, ['node:DE', 'C']);
  await practice.locator('[data-cp-practice-node="node:CDE"]').click();
  const unjoin = practice.getByRole('button', { name: /C・D・E.*それ以降の結合を戻す/ });
  await expect(unjoin).toBeVisible();
  assert((await unjoin.boundingBox()).height >= 44);
  await unjoin.press('Enter');
  assert.equal(await practice.locator('[data-cp-practice-node]').count(), 4);
  assert.deepEqual(await leafCoordinates(), initialLeaves, '選択した結合を解除しても初期ノードを移動しない');
  await practice.locator('[data-cp-practice-node="node:DE"]').click();
  await practice.getByRole('button', { name: /D・E.*それ以降の結合を戻す/ }).click();
  assert.equal(await practice.locator('[data-cp-practice-node]').count(), 5);
  const practiceHeight = await practice.locator('[data-cp-tree]').evaluate(e => e.getBoundingClientRect().height);
  for (const pair of [['D', 'E'], ['node:DE', 'C'], ['B', 'node:CDE'], ['A', 'node:BCDE']]) {
    await connect(practice, pair, true);
    assert.equal(await practice.locator('[data-cp-tree]').evaluate(e => e.getBoundingClientRect().height), practiceHeight);
    assert.deepEqual((await leafCoordinates()).sort(), initialLeaves.slice().sort(), '結合のたびに初期ノードを並べ直さない');
  }
  await practice.locator('[data-cp-practice-judge]').click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('正解');
  await practice.locator('[data-cp-practice-undo]').click();
  await expect(practice.locator('[data-cp-practice-judge]')).toBeDisabled();
  await expect(practice.locator('[data-cp-build-status]')).not.toContainText('正解');
  await connect(practice, ['node:BCDE', 'A']);
  await practice.locator('[data-cp-practice-judge]').click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('正解');
  for (const preset of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    await practice.locator(`[data-cp-practice-preset="${preset}"]`).click();
    await expect(practice.locator(`[data-cp-practice-preset="${preset}"]`)).toHaveAttribute('aria-pressed', 'true');
    await checkCompactTree(practice);
    await expect(practice.locator('[data-cp-build-status]')).not.toContainText('正解');
    await completeSmallest(practice);
    await practice.locator('[data-cp-practice-judge]').click();
    await expect(practice.locator('[data-cp-build-status]')).toContainText('正解');
  }

  // Equal-frequency leaves can be paired across the diagram without moving leaves
  // or placing several parents at the same point.
  await practice.locator('[data-cp-practice-preset="7"]').click();
  const crossedLeaves = (await leafCoordinates()).sort();
  for (const pair of [['A', 'H'], ['B', 'G'], ['C', 'F'], ['D', 'E']]) {
    await connect(practice, pair);
    assert.deepEqual((await leafCoordinates()).sort(), crossedLeaves);
  }
  const crossedParents = await practice.locator('[data-cp-practice-node]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.cpPracticeNode, x: Number(n.querySelector('circle').getAttribute('cx')) })));
  assert.equal(new Set(crossedParents.map(n => n.x)).size, 4, '4つの同じ高さの親を重ねない');
  for (const parent of crossedParents) {
    await practice.locator(`[data-cp-practice-node="${parent.id}"]`).click();
    const obstructs = await practice.locator('[data-cp-tree]').evaluate(tree => {
      const button = tree.querySelector('[data-cp-practice-unjoin]').getBoundingClientRect();
      return [...tree.querySelectorAll('[data-cp-practice-node]')].filter(n => !n.classList.contains('is-selected')).some(n => {
        const node = n.getBoundingClientRect();
        return button.left < node.right && button.right > node.left && button.top < node.bottom && button.bottom > node.top;
      });
    });
    assert.equal(obstructs, false, '解除ボタンが次に選ぶ根を隠さない');
    await practice.locator(`[data-cp-practice-node="${parent.id}"]`).click();
  }
  for (const pair of [['node:AH', 'node:BG'], ['node:CF', 'node:DE'], ['node:ABGH', 'node:CDEF']]) await connect(practice, pair);
  await practice.locator('[data-cp-practice-judge]').click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('正解');
  await expect(practice.locator('[data-cp-build-status]')).toContainText('24bit');
  await practice.locator('[data-cp-practice-node="node:ABCDEFGH"]').click();
  await practice.locator('[data-cp-practice-unjoin]').click();
  await practice.locator('[data-cp-practice-node="node:ABGH"]').click();
  await practice.locator('[data-cp-practice-unjoin]').click();
  await expect(practice.locator('[data-cp-practice-node]')).toHaveCount(4);
  assert.deepEqual((await leafCoordinates()).sort(), crossedLeaves, '前の結合を解除しても位置を保つ');

  for (const index of [0, 1]) {
    await goSlide(index + 6);
    const quiz = page.locator(`[data-cp-staged-huffman-quiz="${index}"]`);
    const fixture = await page.evaluate(index => window.CompressionCore.HUFFMAN_QUESTIONS[index], index);
    const treePractice = quiz.locator('[data-cp-quiz-practice]');
    await expect(quiz.locator('[role="tablist"]')).toHaveCount(0);
    await expect(quiz.locator('thead th:visible')).toHaveCount(5);
    for (const symbol of Object.keys(fixture.frequencies)) for (const kind of ['frequency', 'code', 'length', 'bits']) await expect(field(quiz, `${kind}:${symbol}`)).toBeVisible();
    await expect(quiz.locator('[data-cp-quiz-tree]')).toBeVisible();
    await expect(quiz.locator('[data-cp-quiz-tree] circle + text').first()).toHaveText('?');
    await quiz.getByRole('button', { name: 'bit数・圧縮率を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-formula]')).toBeHidden();
    await quiz.getByRole('button', { name: '頻度を判定', exact: true }).click();
    const tableSource = quiz.locator('.cp-quiz-source strong');
    await expect(tableSource).toHaveText(await quiz.locator('[data-cp-quiz-source]').textContent());
    for (const [symbol, count] of Object.entries(fixture.frequencies)) await field(quiz, `frequency:${symbol}`).fill(String(count));
    await field(quiz, 'frequencyTotal').fill(String(fixture.text.length));
    await quiz.getByRole('button', { name: '頻度を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
    const columns = await quiz.locator('.cp-quiz-workspace').evaluate(e => {
      const tree = e.querySelector('.cp-quiz-practice').getBoundingClientRect();
      const table = e.querySelector('.cp-quiz-table-area').getBoundingClientRect();
      return { treeRight: tree.right, tableLeft: table.left, topDiff: Math.abs(tree.top - table.top) };
    });
    assert(columns.treeRight <= columns.tableLeft && columns.topDiff < 1, '十分な幅では木と元文字列付き表を並べる');
    await quiz.getByRole('button', { name: '符号・符号長を判定', exact: true }).click();
    await quiz.getByRole('button', { name: '符号・符号長を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('木を判定');
    const canonical = index === 0 ? [['C', 'D'], ['A', 'node:CD'], ['B', 'node:ACD']] : [['D', 'E'], ['B', 'C'], ['node:BC', 'node:DE'], ['A', 'node:BCDE']];
    await treePractice.locator(`[data-cp-practice-node="${canonical[0][0]}"]`).press('Enter');
    assert.ok(await treePractice.locator('.is-selected circle').evaluate(e => parseFloat(getComputedStyle(e).strokeWidth) >= 5), '選択とキーボードフォーカスを太線で表示');
    assert.equal(await treePractice.locator('.is-selected rect').evaluate(e => Number(e.getAttribute('width'))), 68, '丸のタップ領域を確保');
    await treePractice.locator(`[data-cp-practice-node="${canonical[0][0]}"]`).press('Enter');
    for (const pair of canonical) await connect(treePractice, pair);
    await treePractice.locator('[data-cp-practice-judge]').click();
    await expect(treePractice.locator('[data-cp-build-status]')).toContainText('正解');
    for (const [symbol, code] of Object.entries(fixture.codes)) { await field(quiz, `code:${symbol}`).fill(code); await field(quiz, `length:${symbol}`).fill(String(code.length)); }
    await quiz.getByRole('button', { name: '符号・符号長を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
    await quiz.getByRole('button', { name: 'bit数・圧縮率を判定', exact: true }).click();
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
    await quiz.getByRole('button', { name: 'bit数・圧縮率を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('bit数と圧縮率は正解');
    await host.evaluate((element, draft) => element.__compressionTest.editor.setDraft(draft), seed);
    await quiz.getByRole('button', { name: 'bit数・圧縮率を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('bit数と圧縮率は正解');
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.textSize = 'xlarge'; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), '記入済み式は390px・特大文字でも横はみ出ししない');
    const hash = new URL(page.url()).hash;
    await host.locator('[data-formula-slot]').first().press('ArrowRight');
    assert.equal(new URL(page.url()).hash, hash, '式の矢印操作でスライドを移動しない');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.textSize = 'standard'; });
    await quiz.getByRole('button', { name: '符号化・復元を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-quiz-decode-bits]')).toHaveText(fixture.decodeBits);
    const codec = await page.evaluate(fixture => ({ encoded: window.CompressionCore.encodeHuffman(fixture.encodeText, fixture.codes), decoded: window.CompressionCore.decodeHuffman(fixture.decodeBits, fixture.codes) }), fixture);
    await field(quiz, 'encoded').fill(codec.encoded); await field(quiz, 'decoded').fill(codec.decoded);
    await quiz.getByRole('button', { name: '符号化・復元を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('全2項目正解');
    await quiz.getByRole('button', { name: 'すべて判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('すべて正解');
    await quiz.getByRole('button', { name: '符号・符号長を判定', exact: true }).click();
    await treePractice.locator('[data-cp-practice-undo]').click();
    await expect(field(quiz, 'code:A')).toHaveValue('');
    await expect(host).toBeHidden();
    await expect(quiz.locator('[data-cp-quiz-decode-bits]')).toContainText('木を判定');
    if (index === 0) {
      await treePractice.locator('[data-cp-practice-reset]').click();
      for (const pair of [['D', 'C'], ['node:CD', 'A'], ['node:ACD', 'B']]) await connect(treePractice, pair);
      await treePractice.locator('[data-cp-practice-judge]').click();
      const mirrored = Object.fromEntries(Object.entries(fixture.codes).map(([symbol, code]) => [symbol, [...code].map(bit => bit === '0' ? '1' : '0').join('')]));
      for (const [symbol, code] of Object.entries(mirrored)) { await field(quiz, `code:${symbol}`).fill(code); await field(quiz, `length:${symbol}`).fill(String(code.length)); }
      await quiz.getByRole('button', { name: '符号・符号長を判定', exact: true }).click();
      await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
      await treePractice.locator('[data-cp-practice-judge]').click();
      await expect(field(quiz, 'code:A')).toHaveValue(mirrored.A);
      await quiz.getByRole('button', { name: '符号化・復元を判定', exact: true }).click();
      await expect(quiz.locator('[data-cp-quiz-decode-bits]')).toHaveText('01001011');
      const encoded = await page.evaluate(({ text, codes }) => window.CompressionCore.encodeHuffman(text, codes), { text: fixture.encodeText, codes: mirrored });
      await field(quiz, 'encoded').fill(encoded); await field(quiz, 'decoded').fill('ACAB');
      await quiz.getByRole('button', { name: '符号化・復元を判定', exact: true }).click();
      await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('全2項目正解');
    }
    await quiz.getByRole('button', { name: '頻度を判定', exact: true }).click();
    await field(quiz, 'frequency:A').fill('0');
    await quiz.getByRole('button', { name: 'bit数・圧縮率を判定', exact: true }).click();
    await expect(host).toBeHidden();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('正解');
    await quiz.getByRole('button', { name: '入力を消す', exact: true }).click();
    await expect(quiz.locator('[role="tablist"]')).toHaveCount(0);
    await expect(quiz.locator('thead th:visible')).toHaveCount(5);
    await expect(quiz.locator('[data-cp-quiz-tree]')).toBeVisible();
    await expect(field(quiz, 'frequency:A')).toHaveValue('');
  }
  // Verify completed widgets as well as the initial-state matrix below.
  await load('dr52');
  await goSlide(1);
  await page.locator('[data-cp-frequency-source] [data-cp-frequency-column="E"]').first().hover();
  await goSlide(2);
  for (let i = 0; i < 15; i++) await page.locator('[data-cp-build-next]').click();
  await goSlide(3);
  for (let i = 0; i < 18; i++) await page.locator('[data-cp-codec="encode"] [data-cp-codec-next]').click();
  await goSlide(4);
  await completeSmallest(page.locator('[data-cp-huffman-practice]'));
  await page.locator('[data-cp-huffman-practice] [data-cp-practice-judge]').click();
  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark', 'system']) for (const font of ['standard', 'large', 'xlarge']) {
      await page.evaluate(({ theme, font }) => { if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; document.documentElement.dataset.textSize = font; }, { theme, font });
      for (const n of [1, 2, 3, 4]) {
        await goSlide(n);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `dr52 completed ${width}/${theme}/${font}/${n}`);
        if (n === 1) {
          const spills = await page.locator('[data-cp-frequency-results] table').evaluateAll(tables => tables.flatMap(table => [...table.querySelectorAll('th,td')].filter(cell => cell.textContent.trim()).flatMap(cell => {
            const range = document.createRange(); range.selectNodeContents(cell);
            const box = cell.getBoundingClientRect();
            return [...range.getClientRects()].filter(rect => rect.left < box.left - 1 || rect.right > box.right + 1).map(() => cell.textContent);
          })));
          assert.deepEqual(spills, [], `符号の表内で文字が重ならない ${width}/${theme}/${font}`);
          const bands = page.locator('.cp-frequency-bands__scroll');
          const bandMetrics = await bands.evaluate(scroll => {
            const canvas = scroll.querySelector('.cp-frequency-bands__canvas');
            const track = canvas.querySelector('[data-cp-frequency-fixed-bits]');
            const bit = track.querySelector('.cp-frequency-bit');
            const rect = scroll.getBoundingClientRect();
            const parentRect = scroll.parentElement.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(bit);
            const digitRect = range.getBoundingClientRect();
            const bitRect = bit.getBoundingClientRect();
            const laneWidth = selector => [...canvas.querySelectorAll(`${selector} .cp-frequency-word`)].reduce((sum, word) => sum + word.getBoundingClientRect().width, 0);
            return { client: scroll.clientWidth, scroll: scroll.scrollWidth, canvas: canvas.getBoundingClientRect().width, bit: bitRect.width, font: parseFloat(getComputedStyle(bit).fontSize), contained: rect.left >= parentRect.left - 1 && rect.right <= parentRect.right + 1, digitFits: digitRect.left >= bitRect.left - 1 && digitRect.right <= bitRect.right + 1, ratio: laneWidth('[data-cp-frequency-variable-bits]') / laneWidth('[data-cp-frequency-fixed-bits]') };
          });
          assert(bandMetrics.contained, `帯スクロール枠が親幅内 ${width}/${theme}/${font}`);
          assert(bandMetrics.bit > 0 && bandMetrics.font > 0 && bandMetrics.digitFits, `bit文字をセル内に表示 ${width}/${theme}/${font}`);
          assert(Math.abs(bandMetrics.ratio - 38 / 54) < 0.01, `可変長/固定長の表示幅比38/54 ${width}/${theme}/${font}`);
          if (width === 390) assert(bandMetrics.scroll > bandMetrics.client, '狭幅では2段の帯を横スクロール可能');
          assert(bandMetrics.bit / bandMetrics.canvas > 0.004, `1bitの横幅を確保 ${width}/${theme}/${font}`);
          const equalWidths = await bands.evaluate(scroll => {
            const all = ['[data-cp-frequency-fixed-bits]', '[data-cp-frequency-variable-bits]'].flatMap(selector => [...scroll.querySelectorAll(`${selector} .cp-frequency-bit`)].map(bit => bit.getBoundingClientRect().width));
            return Math.max(...all) - Math.min(...all);
          });
          assert(equalWidths < 0.1, `全bitセルの幅が一致 ${width}/${theme}/${font}`);
        }
        if (n === 3) {
          for (const mode of ['encode', 'decode']) {
            await page.getByRole('tab', { name: mode === 'encode' ? '符号化' : '復元', exact: true }).click();
            const metrics = await page.locator(`[data-cp-codec="${mode}"] .cp-codec-strip-scroll`).evaluate(scroll => {
              const cells = [...scroll.querySelectorAll('[data-cp-codec-grid] td')];
              const widths = cells.map(cell => cell.getBoundingClientRect().width);
              const digitFits = cells.filter(cell => cell.textContent).every(cell => {
                const range = document.createRange(); range.selectNodeContents(cell);
                const digit = range.getBoundingClientRect(), box = cell.getBoundingClientRect();
                return digit.left >= box.left - 1 && digit.right <= box.right + 1;
              });
              return { digitFits, equalWidths: Math.max(...widths) - Math.min(...widths), client: scroll.clientWidth, scroll: scroll.scrollWidth, tables: scroll.querySelectorAll('.x-scroll').length };
            });
            assert(metrics.digitFits && metrics.equalWidths < .1, `${mode}のセルの幅と文字の収まり ${width}/${theme}/${font}`);
            assert.equal(metrics.tables, 0, '共通のスクロール枠を使い二重の枠を作らない');
            if (width === 390) assert(metrics.scroll > metrics.client, '狭幅では対応表の中だけを横スクロール');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${mode}の対応表がページ幅を広げない ${width}/${theme}/${font}`);
          }
          await page.getByRole('tab', { name: '符号化', exact: true }).click();
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await touchPage.goto(new URL('dr52.html#headline_4', base).href);
  await expect(touchPage.getByRole('navigation', { name: 'スライド間の移動' })).toBeVisible();
  const touchTree = touchPage.locator('[data-cp-huffman-practice]');
  for (const pair of [['E', 'D'], ['A', 'B'], ['C', 'node:DE'], ['node:AB', 'node:CDE']]) {
    for (const id of pair) await touchTree.locator(`[data-cp-practice-node="${id}"]`).tap();
  }
  await touchTree.locator('[data-cp-practice-judge]').tap();
  await expect(touchTree.locator('[data-cp-build-status]')).toContainText('2回目');
  await touchTree.locator('[data-cp-practice-preset="2"]').tap();
  await expect(touchTree.locator('[data-cp-practice-preset="2"]')).toHaveAttribute('aria-pressed', 'true');
  await touchPage.goto(new URL('dr52.html#headline_1', base).href);
  const touchFrequency = touchPage.locator('[data-cp-frequency-comparison]');
  const touchD = touchPage.locator('[data-cp-frequency-letter="D"]');
  await touchD.tap(); await expect(touchFrequency).toHaveAttribute('data-cp-frequency-active', 'D');
  await touchD.tap(); await expect(touchFrequency).toHaveAttribute('data-cp-frequency-active', '');
  await touchD.tap(); await touchPage.locator('[data-cp-frequency-letter="A"]').tap();
  await expect(touchFrequency).toHaveAttribute('data-cp-frequency-active', 'A');
  await touchPage.locator('#headline_1').tap();
  await expect(touchFrequency).toHaveAttribute('data-cp-frequency-active', '');
  await touchPage.locator('[data-cp-frequency-letter="B"]').tap();
  await expect(touchFrequency).toHaveAttribute('data-cp-frequency-active', 'B');
  await touchPage.getByRole('button', { name: /^次のスライド「ハフマン木を作る」/ }).tap();
  await expect(touchFrequency).toHaveAttribute('data-cp-frequency-active', '');
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
    } else {
      const staticFrequency = fallback.locator('[data-cp-frequency-comparison]');
      await expect(staticFrequency.locator('[data-cp-frequency-source]')).toContainText('DAEBCBACBBBCDAAABB');
      await expect(staticFrequency.locator('[data-cp-frequency-fixed-bits] .cp-frequency-bits-fallback')).toHaveText(Array.from(sample, symbol => fixedCodes[symbol]).join(' '));
      await expect(staticFrequency.locator('[data-cp-frequency-variable-bits] .cp-frequency-bits-fallback')).toHaveText(Array.from(sample, symbol => frequencyCodes[symbol]).join(' '));
      await expect(staticFrequency.locator('[data-cp-frequency-fixed-total]')).toHaveText('54bit');
      await expect(staticFrequency.locator('[data-cp-frequency-variable-total]')).toHaveText('38bit');
      await expect(staticFrequency.locator('[data-cp-frequency-answer]')).toContainText('70%');
      for (const [symbol, count] of Object.entries({ A: 5, B: 7, C: 3, D: 2, E: 1 })) await expect(staticFrequency.locator(`[data-cp-frequency-count="${symbol}"]`)).toHaveText(`${count}回`);
      assert.equal(await staticFrequency.locator('[data-cp-frequency-letter], [data-cp-frequency-select], [data-cp-frequency-controls]').count(), 0, 'JS無効時は表見出しを静的な文字として表示');
      await expect(fallback.locator('[data-cp-huffman-practice] noscript p').first()).toContainText('例3');
      await expect(fallback.locator('[data-cp-huffman-practice] noscript p').last()).toContainText('例10');
      assert.equal(await fallback.locator('[data-cp-codec] [data-cp-tree]').count(), 0);
    }
  }
  await noScript.close();
  assert.deepEqual(errors, [], 'ページ例外・コンソールエラーなし');
  console.log(`compression-pages-browser (${engine}): dr51保持、dr52の54/38bit帯・文字色とホバー連動・表見出し操作・A〜E色分け・キーボード/タッチ解除・3幅×3テーマ×3文字サイズ・JavaScript無効時の静的表示、説明と前後ボタン→木と表→最初からの配置・文字→頻度→結合・木の固定座標、符号化/復元、結合判定と式の途中計算を検証`);
} finally { await browser.close(); }
