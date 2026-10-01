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
  const frequency = page.locator('[data-cp-frequency-stepper]');
  const frequencyNext = frequency.locator('[data-cp-frequency-next]');
  assert.equal(await frequency.locator('[data-cp-frequency-play]').count(), 0, '導入は手動で進める');
  await expect(frequency.locator('[data-cp-frequency-fixed-code="A"]')).toBeEmpty();
  await expect(frequency.locator('[data-cp-frequency-count="A"]')).toBeEmpty();
  await expect(frequency.locator('[data-cp-frequency-fixed-stream-panel]')).toBeHidden();
  const tableHeight = await frequency.locator('table').evaluate(e => e.getBoundingClientRect().height);
  const nextPosition = () => frequency.evaluate(root => root.querySelector('[data-cp-frequency-next]').getBoundingClientRect().top - root.getBoundingClientRect().top);
  const nextTop = await nextPosition();
  await frequencyNext.press('Enter');
  await expect(frequency.locator('[data-cp-frequency-fixed-code="A"]')).toHaveText('001');
  await expect(frequency.locator('[data-cp-frequency-status]')).toContainText('3bitなら8通り');
  await frequencyNext.click();
  assert.equal((await frequency.locator('[data-cp-frequency-fixed-bits]').textContent()).replace(/\s/g, '').length, 54);
  const frequencies = { A: 5, B: 7, C: 3, D: 2, E: 1 };
  const symbols = Object.keys(frequencies);
  for (const [index, symbol] of symbols.entries()) {
    await frequencyNext.click();
    await expect(frequency.locator(`[data-cp-frequency-count="${symbol}"]`)).toHaveText(String(frequencies[symbol]));
    if (index < 4) await expect(frequency.locator(`[data-cp-frequency-count="${symbols[index + 1]}"]`)).toBeEmpty();
  }
  const frequencyCodes = { B: '0', A: '10', C: '110', D: '1110', E: '1111' };
  for (const [symbol, code] of Object.entries(frequencyCodes)) {
    await frequencyNext.click();
    await expect(frequency.locator(`[data-cp-frequency-code="${symbol}"]`)).toHaveText(code);
  }
  await expect(frequency.locator('[data-cp-frequency-variable-stream-panel]')).toBeHidden();
  await frequencyNext.click();
  assert.equal((await frequency.locator('[data-cp-frequency-variable-bits]').textContent()).replace(/\s/g, '').length, 38);
  await frequencyNext.click();
  await expect(frequency.locator('[data-cp-frequency-ratio]')).toBeVisible();
  await expect(frequency.locator('[data-cp-frequency-answer]')).toBeHidden();
  await expect(frequency.locator('.cp-frequency-fraction span').first()).toHaveText('38');
  await expect(frequency.locator('.cp-frequency-fraction span').last()).toHaveText('54');
  await frequencyNext.click();
  await expect(frequency.locator('[data-cp-frequency-answer]')).toContainText('70%');
  await expect(frequencyNext).toBeDisabled();
  assert.equal(await frequency.locator('table').evaluate(e => e.getBoundingClientRect().height), tableHeight, '値を埋めても表の高さを維持');
  assert(Math.abs(await nextPosition() - nextTop) < 1, '結果を表示しても次へボタンを動かさない');
  await frequency.locator('[data-cp-frequency-restart]').click();
  await frequencyNext.click();
  await page.waitForTimeout(800);
  await expect(frequency).toHaveAttribute('data-cp-frequency-step', '1');
  await goSlide(2); await goSlide(1);
  await expect(frequency).toHaveAttribute('data-cp-frequency-step', '1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frequencyNext.click();
  await expect(frequency).toHaveAttribute('data-cp-frequency-step', '2');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await goSlide(2);
  const build = page.locator('[data-cp-huffman-build]');
  const buildNext = build.locator('[data-cp-build-next]');
  const treeDimensions = () => build.locator('[data-cp-tree]').evaluate(e => ({ height: e.getBoundingClientRect().height, points: Array.from(e.querySelectorAll('[data-cp-node]'), n => [n.dataset.cpNode, n.querySelector('circle').getAttribute('cx'), n.querySelector('circle').getAttribute('cy')]) }));
  const emptyTree = await treeDimensions();
  assert.equal(emptyTree.points.length, 0, '最初は木の場所だけ確保');
  await buildNext.click();
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
  }
  for (let i = 0; i < 4; i++) {
    await buildNext.click();
    assert.equal(await build.locator('.cp-edge-label').count(), 2 * (i + 1), '根から各親の0/1を順に示す');
    assert.equal(await build.locator('.cp-tracing-edge').evaluateAll(edges => edges.length === 2 && edges.every(e => Number(e.getAttribute('y1')) < Number(e.getAttribute('y2')) && getComputedStyle(e).animationName === 'cp-connect')), true, '符号の割当は根から下へワイプする');
  }
  for (const symbol of symbols) {
    await buildNext.click();
    await expect(build.locator(`[data-cp-build-row="${symbol}"] [data-cp-build-code]`)).toHaveText(frequencyCodes[symbol]);
    assert(await build.locator('line.is-current').count() > 0, '文字の経路を強調');
  }
  await expect(buildNext).toBeDisabled();
  await expect(build.locator('[data-cp-build-status]')).toContainText('E');
  await build.locator('[data-cp-build-prev]').click();
  await expect(build.locator('[data-cp-build-row="E"] [data-cp-build-code]')).toBeEmpty();
  await build.locator('[data-cp-build-reset]').click();
  await expect(build).toHaveAttribute('data-cp-build-step', '0');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let i = 0; i < 14; i++) await buildNext.click();
  assert.equal(await build.locator('.cp-new-edge').evaluateAll(edges => edges.every(e => getComputedStyle(e).animationName === 'none')), true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await goSlide(3);
  const encoder = page.locator('[data-cp-codec="encode"]');
  const decoder = page.locator('[data-cp-codec="decode"]');
  assert.equal(await page.locator('[data-cp-codec] [data-cp-tree]').count(), 0, '符号化/復元スライドは木を置かない');
  assert.equal(await encoder.locator('table [data-cp-codec-row]').count(), 5, '符号を表で提示');
  await encoder.locator('[data-cp-codec-next]').press('Enter');
  await expect(encoder.locator('[data-cp-codec-output]')).toHaveText('1110');
  await page.waitForTimeout(500);
  await expect(encoder.locator('[data-cp-codec-output]')).toHaveText('1110');
  for (let i = 1; i < 18; i++) await encoder.locator('[data-cp-codec-next]').click();
  const fullBits = '11101011110110010110000110111010101000';
  assert.equal((await encoder.locator('[data-cp-codec-output]').textContent()).replace(/\s/g, ''), fullBits);
  await expect(encoder.locator('[data-cp-codec-next]')).toBeDisabled();
  await encoder.locator('[data-cp-codec-input]').fill('F');
  await expect(encoder.locator('[data-cp-codec-input]')).toHaveAttribute('aria-invalid', 'true');
  await expect(encoder.locator('[data-cp-codec-next]')).toBeDisabled();
  await encoder.locator('[data-cp-codec-input]').fill('DAE');
  await encoder.locator('[data-cp-codec-next]').click();
  await expect(encoder.locator('[data-cp-codec-output]')).toHaveText('1110');
  await page.getByRole('tab', { name: '復元', exact: true }).click();
  await expect(decoder.locator('[data-cp-codec-input]')).toHaveValue(fullBits);
  for (let i = 0; i < 3; i++) await decoder.locator('[data-cp-codec-next]').click();
  await expect(decoder.locator('[data-cp-codec-pending]')).toContainText('111');
  await decoder.locator('[data-cp-codec-next]').click();
  await expect(decoder.locator('[data-cp-codec-output]')).toHaveText('D');
  for (let i = 4; i < 38; i++) await decoder.locator('[data-cp-codec-next]').click();
  await expect(decoder.locator('[data-cp-codec-output]')).toHaveText('DAEBCBACBBBCDAAABB');
  await decoder.locator('[data-cp-codec-input]').fill('111');
  for (let i = 0; i < 3; i++) await decoder.locator('[data-cp-codec-next]').click();
  await expect(decoder.locator('[data-cp-codec-status]')).toContainText('途中');
  await decoder.locator('[data-cp-codec-input]').fill('12');
  await expect(decoder.locator('[data-cp-codec-input]')).toHaveAttribute('aria-invalid', 'true');

  const connect = async (host, pair, keyboard = false) => {
    for (const [index, id] of pair.entries()) {
      const node = host.locator(`[data-cp-practice-node="${id}"]`);
      if (keyboard) await node.press(index === 0 ? 'Enter' : 'Space'); else await node.click();
    }
    await host.locator('[data-cp-practice-join]').click();
  };
  const completeSmallest = async host => {
    while (await host.locator('[data-cp-practice-node]').count() > 1) {
      const pair = await host.locator('[data-cp-practice-node]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.cpPracticeNode, count: Number(n.querySelector('circle + text').textContent) })).sort((a, b) => a.count - b.count).slice(0, 2).map(n => n.id));
      await connect(host, pair);
    }
  };
  await goSlide(4);
  const practice = page.locator('[data-cp-huffman-practice]');
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
  const practiceHeight = await practice.locator('[data-cp-tree]').evaluate(e => e.getBoundingClientRect().height);
  for (const pair of [['D', 'E'], ['node:DE', 'C'], ['B', 'node:CDE'], ['A', 'node:BCDE']]) {
    await connect(practice, pair, true);
    assert.equal(await practice.locator('[data-cp-tree]').evaluate(e => e.getBoundingClientRect().height), practiceHeight);
  }
  await practice.locator('[data-cp-practice-judge]').click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('正解');
  await practice.locator('[data-cp-practice-undo]').click();
  await expect(practice.locator('[data-cp-practice-judge]')).toBeDisabled();
  await expect(practice.locator('[data-cp-build-status]')).not.toContainText('正解');
  await connect(practice, ['node:BCDE', 'A']);
  await practice.locator('[data-cp-practice-judge]').click();
  await expect(practice.locator('[data-cp-build-status]')).toContainText('正解');
  for (const preset of [1, 2]) {
    await practice.locator(`[data-cp-practice-preset="${preset}"]`).click();
    await expect(practice.locator(`[data-cp-practice-preset="${preset}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(practice.locator('[data-cp-build-status]')).not.toContainText('正解');
    await completeSmallest(practice);
    await practice.locator('[data-cp-practice-judge]').click();
    await expect(practice.locator('[data-cp-build-status]')).toContainText('正解');
  }

  for (const index of [0, 1]) {
    await goSlide(index + 6);
    const quiz = page.locator(`[data-cp-staged-huffman-quiz="${index}"]`);
    const fixture = await page.evaluate(index => window.CompressionCore.HUFFMAN_QUESTIONS[index], index);
    const treePractice = quiz.locator('[data-cp-quiz-practice]');
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-formula]')).toBeHidden();
    await quiz.getByRole('tab', { name: '1. 頻度', exact: true }).click();
    const tableSource = quiz.locator('.cp-quiz-source strong');
    await expect(tableSource).toHaveText(await quiz.locator('[data-cp-quiz-source]').textContent());
    for (const [symbol, count] of Object.entries(fixture.frequencies)) await field(quiz, `frequency:${symbol}`).fill(String(count));
    await field(quiz, 'frequencyTotal').fill(String(fixture.text.length));
    await quiz.getByRole('button', { name: '段階1を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
    const columns = await quiz.locator('.cp-quiz-workspace').evaluate(e => {
      const tree = e.querySelector('.cp-quiz-practice').getBoundingClientRect();
      const table = e.querySelector('.cp-quiz-table-area').getBoundingClientRect();
      return { treeRight: tree.right, tableLeft: table.left, topDiff: Math.abs(tree.top - table.top) };
    });
    assert(columns.treeRight <= columns.tableLeft && columns.topDiff < 1, '十分な幅では木と元文字列付き表を並べる');
    await quiz.getByRole('tab', { name: '2. 木・符号と符号長', exact: true }).click();
    await quiz.getByRole('button', { name: '段階2を判定', exact: true }).click();
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
    await quiz.getByRole('button', { name: '段階2を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
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
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), '記入済み式は390px・特大文字でも横はみ出ししない');
    const hash = new URL(page.url()).hash;
    await host.locator('[data-formula-slot]').first().press('ArrowRight');
    assert.equal(new URL(page.url()).hash, hash, '式の矢印操作でスライドを移動しない');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.textSize = 'standard'; });
    await quiz.getByRole('tab', { name: '4. 符号化と復元', exact: true }).click();
    await expect(quiz.locator('[data-cp-quiz-decode-bits]')).toHaveText(fixture.decodeBits);
    const codec = await page.evaluate(fixture => ({ encoded: window.CompressionCore.encodeHuffman(fixture.encodeText, fixture.codes), decoded: window.CompressionCore.decodeHuffman(fixture.decodeBits, fixture.codes) }), fixture);
    await field(quiz, 'encoded').fill(codec.encoded); await field(quiz, 'decoded').fill(codec.decoded);
    await quiz.getByRole('button', { name: '段階4を判定', exact: true }).click();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('全2項目正解');
    await quiz.getByRole('tab', { name: '2. 木・符号と符号長', exact: true }).click();
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
      await quiz.getByRole('button', { name: '段階2を判定', exact: true }).click();
      await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('正解');
      await treePractice.locator('[data-cp-practice-judge]').click();
      await expect(field(quiz, 'code:A')).toHaveValue(mirrored.A);
      await quiz.getByRole('tab', { name: '4. 符号化と復元', exact: true }).click();
      await expect(quiz.locator('[data-cp-quiz-decode-bits]')).toHaveText('01001011');
      const encoded = await page.evaluate(({ text, codes }) => window.CompressionCore.encodeHuffman(text, codes), { text: fixture.encodeText, codes: mirrored });
      await field(quiz, 'encoded').fill(encoded); await field(quiz, 'decoded').fill('ACAB');
      await quiz.getByRole('button', { name: '段階4を判定', exact: true }).click();
      await expect(quiz.locator('[data-cp-huffman-feedback]')).toContainText('全2項目正解');
    }
    await quiz.getByRole('tab', { name: '1. 頻度', exact: true }).click();
    await field(quiz, 'frequency:A').fill('0');
    await quiz.getByRole('tab', { name: '3. bit数と圧縮率', exact: true }).click();
    await expect(host).toBeHidden();
    await expect(quiz.locator('[data-cp-huffman-feedback]')).not.toContainText('正解');
    await quiz.getByRole('button', { name: '入力を消す', exact: true }).click();
    await expect(quiz.getByRole('tab', { name: '1. 頻度', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(field(quiz, 'frequency:A')).toHaveValue('');
  }
  // Verify completed widgets as well as the initial-state matrix below.
  await load('dr52');
  await goSlide(1);
  for (let i = 0; i < 15; i++) await page.locator('[data-cp-frequency-next]').click();
  await goSlide(2);
  for (let i = 0; i < 14; i++) await page.locator('[data-cp-build-next]').click();
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
    await touchTree.locator('[data-cp-practice-join]').tap();
  }
  await touchTree.locator('[data-cp-practice-judge]').tap();
  await expect(touchTree.locator('[data-cp-build-status]')).toContainText('2回目');
  await touchTree.locator('[data-cp-practice-preset="2"]').tap();
  await expect(touchTree.locator('[data-cp-practice-preset="2"]')).toHaveAttribute('aria-pressed', 'true');
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
      await expect(fallback.locator('[data-cp-frequency-fallback]')).toBeVisible();
      await expect(fallback.locator('[data-cp-frequency-fallback]')).toContainText('54bit');
      await expect(fallback.locator('[data-cp-frequency-fallback]')).toContainText('38bit');
      await expect(fallback.locator('[data-cp-huffman-practice] noscript p')).toContainText('例3');
      assert.equal(await fallback.locator('[data-cp-codec] [data-cp-tree]').count(), 0);
    }
  }
  await noScript.close();
  assert.deepEqual(errors, [], 'ページ例外・コンソールエラーなし');
  console.log(`compression-pages-browser (${engine}): dr51保持、固定長54bit→可変長38bitと約70%の手動開示、上下ワイプ・木の固定座標、符号表による符号化/復元、誤結合の最終判定・3例・枝反転の別解・後続再判定・式と途中計算、完成状態と初期状態の3幅×3テーマ×3文字サイズ、タッチ・キーボード・JavaScript無効を検証`);
} finally { await browser.close(); }
