import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8777/';
const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
const publicCheck = process.argv.includes('--public');
const artifacts = process.env.JOHO_TEST_ARTIFACTS || '/private/tmp/dr-formula-qa';
await mkdir(artifacts, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, hasTouch: true, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [], missing = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && message.text().includes('初期化')) errors.push(message.text()); });
page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push(response.url()); });
await page.addInitScript(() => {
  window.digitalFormulaEditors = [];
  let builder;
  Object.defineProperty(window, 'LessonFormulaBuilder', {
    configurable: true, get: () => builder,
    set(api) {
      builder = { ...api, mount(host, definition, options) {
        const editor = api.mount(host, definition, options);
        window.digitalFormulaEditors.push({ host, definition, editor });
        return editor;
      } };
    }
  });
});
const pages = [
  ['dr02.html', 11, 22, 10], ['dr11.html', 11, 12, 3], ['dr12.html', 12, 8, 2],
  ['dr13.html', 11, 8, 2], ['dr21.html', 11, 8, 2], ['dr22.html', 11, 8, 3]
];
async function choose(id) {
  await page.evaluate(id => {
    const form = document.querySelector(`[data-db-question="${id}"]`);
    location.hash = form.closest('section[data-lesson-slide]').querySelector('h2').id;
    const group = form.closest('[data-db-question-group]'), select = group.querySelector('[data-db-question-select]');
    if (select) { select.value = String([...group.querySelectorAll('[data-db-question]')].indexOf(form)); select.dispatchEvent(new Event('change', { bubbles: true })); }
  }, id);
  await page.locator(`[data-db-question="${id}"]`).waitFor({ state: 'visible' });
}
async function seed(id, wrong = false) {
  return page.evaluate(({ id, wrong }) => {
    const entry = window.digitalFormulaEditors.find(item => item.host.closest(`[data-db-question="${id}"]`));
    const value = (n, unit = '') => ({ kind: 'value', value: String(n), unit });
    const op = value => ({ kind: 'operator', value });
    const power = n => ({ kind: 'power', base: [value(2)], exponent: [value(n)] });
    const targets = Object.fromEntries(entry.definition.tasks.map((task, i) => [task.id, `row-${i}`]));
    const remap = tokens => (tokens || []).map(token => {
      if (token.kind === 'reference' && token.rowId.startsWith('$task:')) return { ...token, rowId: targets[token.rowId.slice(6)] };
      if (token.kind === 'group') return { ...token, body: remap(token.body) };
      if (token.kind === 'power') return { ...token, base: remap(token.base), exponent: remap(token.exponent) };
      if (token.kind === 'fraction') return { ...token, numerator: remap(token.numerator), denominator: remap(token.denominator) };
      const { symbol, ...card } = token;
      return card;
    });
    const rows = entry.definition.tasks.map(task => ({
      id: targets[task.id], taskId: task.id, result: '', resultUnit: '', answerOpen: true,
      tokens: task.rule === 'minimum-bits'
        ? [power(task.expected - 1), op('<'), value(task.levels, task.boundUnit), op('<='), power(task.expected)]
        : remap(task.expectedTokens)
    }));
    if (wrong) rows[0].tokens = [value(entry.definition.tasks[0].expected)];
    entry.editor.setDraft({ rows, targets, answers: Object.fromEntries(entry.definition.tasks.map(task => [task.id, String(task.expected)])) });
    return entry.definition.tasks.map(task => task.id);
  }, { id, wrong });
}
async function fits(label) {
  await page.waitForTimeout(100); // スライド枠のResizeObserverとヘッダーの再配置を待つ。
  const size = await page.evaluate(() => ({
    width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth,
    slides: [...document.querySelectorAll('.lesson-slide.is-current')].map(el => [el.clientWidth, el.scrollWidth])
  }));
  assert.ok(size.body <= size.width + 1 && size.document <= size.width + 1 && size.slides.every(([width, scroll]) => scroll <= width + 1), `${engine}/${label}: ${JSON.stringify(size)}`);
}
let formulaCount = 0, taskCount = 0, nativeCount = 0;
try {
  if (publicCheck) {
    const files = [...pages.map(([file]) => file), 'dr01.html', 'js/digital-basics-lessons.js', 'js/lesson-formula-core.js', 'js/digital-radix-formulas.js', 'js/digital-number-formulas.js', 'js/digital-content-formulas.js'];
    const hash = data => createHash('sha256').update(data).digest('hex');
    for (const file of files) {
      const response = await page.request.get(new URL(file, base).href);
      assert.equal(response.status(), 200, file);
      assert.equal(hash(await response.body()), hash(await readFile(new URL(`../${file}`, import.meta.url))), `${file}: 公開内容一致`);
    }
  }
  for (const [file, slides, questions, builders] of pages) {
    assert.equal((await page.goto(new URL(file, base).href, { waitUntil: 'networkidle' })).status(), 200);
    await page.locator('body.lesson-slide-ready').waitFor();
    assert.equal(await page.locator('section[data-lesson-slide]:not(.lesson-slide--cover)').count(), slides, `${file}: 本文枚数`);
    assert.equal(await page.locator('[data-db-question]').count(), questions, `${file}: 問題数`);
    assert.equal(await page.locator('[data-formula-builder]').count(), builders, `${file}: 共通部品を初期化`);
    const ids = await page.locator('[data-db-formula-question]').evaluateAll(forms => forms.map(form => form.dataset.dbQuestion));
    for (const id of ids) {
      await choose(id);
      const form = page.locator(`[data-db-question="${id}"]`);
      assert.equal(await form.locator('[type="submit"], [data-db-answer], [data-db-answer-part]').count(), 0, `${id}: 古い採点欄を置かない`);
      assert.ok((await form.locator('[data-formula-answer]').evaluateAll(inputs => inputs.map(input => input.value))).every(value => value === ''), `${id}: 答えを補完しない`);
      const tasks = await seed(id);
      for (const taskId of tasks) {
        const task = form.locator(`[data-formula-task="${taskId}"]`);
        await task.locator('[data-formula-judge]').click();
        assert.match((await task.locator('.formula-feedback').allTextContents()).join(' / '), /立式.*○.*答え.*○/, `${id}/${taskId}`);
        taskCount++;
      }
      const details = form.locator('details');
      assert.equal(await details.getAttribute('open'), null, `${id}: 判定で解答を開かない`);
      await details.locator('summary').click();
      assert.equal(await details.locator('li[hidden], [data-db-step-next]').count(), 0, `${id}: 全解説を表示`);
      await details.locator('summary').click();
      if (id !== 'dcl-question-5') {
        await seed(id, true); await form.locator('[data-formula-judge]').first().click();
        assert.match((await form.locator('.formula-feedback').allTextContents()).join(' / '), /立式.*×.*答え.*○/, `${id}: 立式と数値回答は別判定`);
      }
      await form.locator('[type="reset"]').click();
      const blank = await page.evaluate(id => window.digitalFormulaEditors.find(item => item.host.closest(`[data-db-question="${id}"]`)).editor.getDraft(), id);
      assert.ok(Object.values(blank.answers).every(answer => !answer), `${id}: 答えリセット`);
      if (id !== 'dcl-question-5') assert.ok(blank.rows.every(row => !row.tokens.length && !row.answerOpen), `${id}: 式リセット`);
      formulaCount++;
    }
    if (file === 'dr21.html') {
      await choose('dtx-question-7');
      const form = page.locator('[data-db-question="dtx-question-7"]');
      await form.locator('[data-formula-quantity="asciiCharacterBytes"]').press('Enter');
      await form.locator('[data-formula-operator="+"]').click();
      await form.locator('[data-formula-quantity="japaneseCharacterBytes"]').tap();
      assert.equal(await form.locator('[data-formula-answer]').count(), 0, '入力中は答えを計算・補完しない');
      await form.locator('[data-formula-operator="="]').click();
      await form.locator('[data-formula-answer]').fill('４'); await form.locator('[data-formula-judge]').click();
      assert.match((await form.locator('.formula-feedback').allTextContents()).join(' / '), /立式.*○.*答え.*○/);
    }
    if (file === 'dr22.html') {
      await choose('dcl-question-5'); await seed('dcl-question-5');
      const form = page.locator('[data-db-question="dcl-question-5"]');
      await page.evaluate(() => {
        const entry = window.digitalFormulaEditors.find(item => item.definition.id === 'dcl-question-5');
        const draft = entry.editor.getDraft(); draft.rows[1].tokens = []; draft.rows[1].answerOpen = false; draft.answers.bitsPerChannel = '';
        entry.editor.setDraft(draft);
      });
      const total = form.locator('[data-formula-task="totalBits"]'), bits = form.locator('[data-formula-task="bitsPerChannel"]');
      await total.locator('[data-formula-result-grip]').dragTo(bits.locator('[data-formula-slot]').last());
      await bits.locator('[data-formula-operator="÷"]').click();
      await bits.locator('[data-formula-quantity="channels"]').tap();
      await bits.locator('[data-formula-operator="="]').click();
      await bits.locator('[data-formula-answer]').fill('4'); await bits.locator('[data-formula-judge]').click();
      assert.match((await bits.locator('.formula-feedback').allTextContents()).join(' / '), /立式.*○.*答え.*○/, '比較の結論をドラッグして各成分へ分ける');
      await total.locator('[data-formula-answer]').fill('13');
      assert.equal(await bits.locator('[data-formula-answer]').inputValue(), '4', '前の答えを直しても後の手入力答えは変えない');
      assert.match(await bits.locator('[data-formula-reference]').innerText(), /13/);
      await total.locator('[data-formula-answer]').fill('12');
    }
    // Keep bit strings, character codes, rounding models and choice questions working.
    const nativeIds = await page.locator('[data-db-question]:not([data-db-formula-question])').evaluateAll(forms => forms.map(form => form.dataset.dbQuestion));
    for (const id of nativeIds) {
      await choose(id); const form = page.locator(`[data-db-question="${id}"]`);
      await form.evaluate(form => {
        const parts = [...form.querySelectorAll('[data-db-answer-part]')];
        if (parts.length) parts.forEach(input => { input.value = input.dataset.dbExpected; input.dispatchEvent(new Event('input', { bubbles: true })); });
        else if (form.dataset.dbChoiceAnswer) form.querySelector(`input[value="${form.dataset.dbChoiceAnswer}"]`).checked = true;
        else if (form.dataset.dbSource) form.querySelector('[data-db-answer]').value = parseInt(form.dataset.dbSource, Number(form.dataset.dbSourceBase)).toString(Number(form.dataset.dbAnswerBase));
        else throw new Error(`未対応の通常問題: ${form.dataset.dbQuestion}`);
      });
      await form.locator('[type="submit"]').click();
      assert.equal(await form.locator('[data-db-feedback]').getAttribute('data-correct'), 'true', `${id}: 既存の採点`);
      nativeCount++;
    }
    await choose(ids.at(-1)); await seed(ids.at(-1));
    if (!publicCheck) {
      for (const width of [1440, 720, 390]) for (const theme of ['light', 'dark', 'system']) for (const size of ['standard', 'large', 'xlarge']) {
        await page.setViewportSize({ width, height: 960 });
        await page.evaluate(({ theme, size }) => { siteTheme.setPreference(theme, { persist: false }); siteTextSize.setPreference(size, { persist: false }); }, { theme, size });
        await fits(`${file}/${width}/${theme}/${size}`);
      }
      await page.screenshot({ path: `${artifacts}/${engine}-${file}-390-system-xlarge.png` });
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('[data-db-question]:visible').count(), questions, `${file}: 印刷用に全問表示`);
      await page.emulateMedia({ media: 'screen' });
      const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 960 } }), plain = await noJS.newPage();
      await plain.goto(new URL(file, base).href);
      assert.equal(await plain.locator('[data-db-question]:visible').count(), questions, `${file}: JS無効でも問題文と解答が読める`);
      assert.equal(await plain.locator('section[data-lesson-slide]:visible').count(), slides);
      await noJS.close();
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => { siteTheme.setPreference('light', { persist: false }); siteTextSize.setPreference('standard', { persist: false }); });
  }
  assert.equal(formulaCount, 22); assert.equal(taskCount, 32); assert.equal(nativeCount, 44);
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  console.log(`digital-formula-integration: ${engine} ${publicCheck ? 'public' : 'local'} OK（式22問32小問、既存44問）`);
} finally { await browser.close(); }
