import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8777/';
const engine = process.env.JOHO_TEST_BROWSER || 'chrome';
const mode = process.env.DR01_TEST_MODE || 'full';
const artifacts = process.env.JOHO_TEST_ARTIFACTS || '/private/tmp/dr01-improvements-qa';
await mkdir(artifacts, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, hasTouch: true, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [], missing = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push(response.url()); });
await page.addInitScript(() => {
  window.basicsFormulaEditors = [];
  let builder;
  Object.defineProperty(window, 'LessonFormulaBuilder', {
    configurable: true, get: () => builder,
    set(api) {
      builder = { ...api, mount(host, definition, options) {
        const editor = api.mount(host, definition, options);
        window.basicsFormulaEditors.push({ host, definition, editor });
        return editor;
      } };
    }
  });
});
const go = async n => {
  await page.evaluate(n => { location.hash = n ? `headline_${n}` : 'title'; }, n);
  await page.locator(n ? `#headline_${n}` : '.lesson-slide--cover').waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
};
const fits = async label => {
  const size = await page.evaluate(() => ({
    width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth,
    slides: [...document.querySelectorAll('.lesson-slide.is-current')].map(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
  }));
  assert.ok(size.body <= size.width + 1 && size.document <= size.width + 1 && size.slides.every(el => el.scroll <= el.width + 1), `${engine}: ${label}: ${JSON.stringify(size)}`);
};
const correctDraft = async id => page.evaluate(id => {
  const entry = window.basicsFormulaEditors.find(item => item.host.closest(`[data-db-question="${id}"]`));
  const value = (n, unit = '') => ({ kind: 'value', value: String(n), unit });
  const op = value => ({ kind: 'operator', value });
  const power = n => ({ kind: 'power', base: [value(2)], exponent: [value(n)] });
  const rows = entry.definition.tasks.map((task, i) => ({
    id: `row-${i}`, taskId: task.id, answerOpen: true, result: '', resultUnit: '',
    tokens: task.scaffold ? [power(task.expected - 1), op('<'), value(task.levels, task.boundUnit), op('<='), power(task.expected)] : task.expectedTokens
  }));
  entry.editor.setDraft({ rows, targets: Object.fromEntries(entry.definition.tasks.map((task, i) => [task.id, rows[i].id])), answers: Object.fromEntries(entry.definition.tasks.map(task => [task.id, String(task.expected)])) });
}, id);

try {
  assert.equal((await page.goto(new URL('dr01.html', base).href, { waitUntil: 'networkidle' })).status(), 200);
  await page.locator('body.lesson-slide-ready').waitFor();
  assert.equal(await page.locator('.lesson-slide').count(), 11, '表紙と本文10枚');
  assert.equal(await page.locator('[data-db-formula-builder][data-formula-builder]').count(), 10, '既存10問で共通式ビルダーを使う');
  assert.equal(await page.locator('[data-db-question-layout="stacked"] select[data-db-question-select]').count(), 0);
  if (mode === 'public') {
    const files = ['dr01.html', 'css/digital-basics.css', 'js/digital-basics-lessons.js', 'js/digital-basics-formulas.js'];
    const hash = data => createHash('sha256').update(data).digest('hex');
    for (const file of files) {
      const response = await page.request.get(new URL(file, base).href);
      assert.equal(response.status(), 200);
      assert.equal(hash(await response.body()), hash(await readFile(new URL(`../${file}`, import.meta.url))), file);
    }
  }
  if (mode === 'probe') {
    for (const width of [1440, 720, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const n of [1, 2, 3, 4, 6, 9, 10]) {
        await go(n); await fits(`${width}/${n}`);
        await page.screenshot({ path: `${artifacts}/${engine}-${width}-${n}.png` });
      }
    }
  } else {
    await go(1);
    const labels = await page.locator('.db-continuous-svg text').evaluateAll(nodes => nodes.map(el => ({ text: el.textContent, x: el.getAttribute('x'), anchor: el.getAttribute('text-anchor') })));
    assert.deepEqual(labels.slice(0, 2), [{ text: '5 cm', x: '35', anchor: 'middle' }, { text: '6 cm', x: '405', anchor: 'middle' }]);
    assert.equal(labels[2].text, '5.36382958… cm');
    await go(2);
    assert.equal(await page.locator('.db-instrument-svg').count(), 2);
    const experiment = page.locator('.db-length-details');
    assert.equal(await experiment.getAttribute('open'), null);
    await experiment.locator('summary').press('Enter');
    const length = page.locator('[data-db-length-input]');
    await length.evaluate(el => { el.value = '5.35'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.locator('[data-db-length-step]').selectOption('0.1');
    assert.match(await page.locator('[data-db-length-result]').innerText(), /5.4 cm/);
    await page.locator('[data-db-length-reset]').click(); await experiment.locator('summary').click();
    await go(3); assert.equal(await page.locator('.db-wave-svg').count(), 2);
    await go(4);
    const slider = page.locator('[data-db-bit-count]');
    assert.equal(await slider.getAttribute('type'), 'range');
    for (let bits = 1; bits <= 8; bits++) {
      await slider.evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, bits);
      assert.equal(await page.locator('[data-db-bit-count-output]').innerText(), `${bits}bit`);
      assert.equal(await page.locator('[data-db-bit-row] button').count(), bits);
      assert.equal(await page.locator('[data-db-patterns] button').count(), 2 ** bits);
    }
    await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
    assert.equal(await slider.inputValue(), '2'); assert.equal(new URL(page.url()).hash, '#headline_4');
    await page.keyboard.press('Tab'); assert.equal(await page.locator('[data-db-bits-reset]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await slider.evaluate(el => el === document.activeElement), true);
    await page.locator('[data-db-bit-row] button').first().click();
    assert.equal(await page.locator('[data-db-patterns] [aria-pressed="true"]').innerText(), '10');
    await page.locator('[data-db-bits-reset]').click();
    assert.equal(await page.locator('[data-db-patterns] [aria-pressed="true"]').innerText(), '00');
    await slider.scrollIntoViewIfNeeded(); const drag = await slider.boundingBox();
    await page.mouse.move(drag.x + 8, drag.y + drag.height / 2); await page.mouse.down(); await page.mouse.move(drag.x + drag.width - 8, drag.y + drag.height / 2, { steps: 8 }); await page.mouse.up();
    assert.equal(await slider.inputValue(), '8');
    await go(6);
    const opener = page.locator('[data-lesson-supplement-open="db-unit-dialog"]');
    await opener.click(); const dialog = page.locator('#db-unit-dialog');
    assert.match(await dialog.innerText(), /1KB＝1024B/); assert.match(await dialog.innerText(), /1KiB＝1024B/); assert.match(await dialog.innerText(), /1MiB＝1024KiB/);
    await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), false); assert.equal(await opener.evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('[data-db-base]').inputValue(), '1024');
    await page.locator('[data-db-base]').selectOption('1000'); assert.equal(await page.locator('[data-db-convert-result]').innerText(), '4GB ＝ 4,000MB');
    await page.locator('[data-db-convert-reset]').click(); assert.equal(await page.locator('[data-db-convert-result]').innerText(), '4GB ＝ 4,096MB');
    for (const [slide, ids] of [[9, ['count8', 'need120', 'count2bytes', 'need500', 'ratio']], [10, ['gb4', 'pixels', 'square', 'power', 'decimal']]]) {
      await go(slide);
      assert.equal(await page.locator('.lesson-slide.is-current [data-db-question]:visible').count(), 5, `${slide}枚目の5問を縦に表示`);
      for (const id of ids) {
        const question = page.locator(`[data-db-question="${id}"]`), details = question.locator('details');
        await correctDraft(id); await question.locator('[data-formula-judge]').last().click();
        const feedback = await question.locator('.formula-feedback').allTextContents();
        assert.ok(feedback.some(text => text.includes('立式') && text.includes('○') && text.includes('答え')), `${id}: ${feedback.join(' / ')}`);
        assert.equal(await details.getAttribute('open'), null, '判定で解答を開かない');
        await details.locator('summary').click(); assert.equal(await details.locator('li[hidden]').count(), 0, '解答を見るで全手順を表示');
        await details.locator('summary').click(); await question.locator('[type="reset"]').click();
        const blank = await page.evaluate(id => window.basicsFormulaEditors.find(item => item.host.closest(`[data-db-question="${id}"]`)).editor.getDraft(), id);
        assert.ok(Object.values(blank.answers).every(answer => !answer), `${id}: リセット後の答え`);
        if (id !== 'need120' && id !== 'need500') assert.ok(blank.rows.every(row => !row.tokens.length && !row.answerOpen), `${id}: 白紙に戻す`);
      }
    }
    await go(10);
    const manual = page.locator('[data-db-question="gb4"]');
    await manual.locator('[data-formula-quantity="amount"]').press('Enter');
    await manual.locator('[data-formula-operator="×"]').click();
    await manual.locator('[data-formula-constant="byte-factor"]').tap();
    await manual.locator('[data-formula-operator="="]').click();
    await manual.locator('[data-formula-answer]').fill('４０９６');
    await manual.locator('[data-formula-judge]').click();
    assert.match((await manual.locator('.formula-feedback').allTextContents()).join(' / '), /立式.*○.*答え.*○/);
    // The reused multiple-choice controller still handles slide 8 and dr02.
    await go(8);
    for (const [i, answer] of ['discrete', 'fine', 'two'].entries()) {
      await page.locator('[data-db-question-select]').selectOption(String(i));
      const question = page.locator('.lesson-slide.is-current [data-db-question]:visible');
      await question.locator(`input[value="${answer}"]`).check(); await question.locator('[type="submit"]').click();
      assert.equal(await question.locator('[data-db-feedback]').getAttribute('data-correct'), 'true');
    }
    if (mode !== 'public') {
      if (mode === 'full') for (const width of [1440, 720, 390]) for (const theme of ['light', 'dark', 'system']) for (const size of ['standard', 'large', 'xlarge']) {
        await page.setViewportSize({ width, height: 960 });
        await page.evaluate(({ theme, size }) => { siteTheme.setPreference(theme, { persist: false }); siteTextSize.setPreference(size, { persist: false }); }, { theme, size });
        for (const slide of [1, 2, 3, 4, 6, 9, 10]) { await go(slide); await fits(`${width}/${theme}/${size}/${slide}`); }
        await go(6); await opener.click();
        const d = await dialog.evaluate(el => ({ width: innerWidth, right: el.getBoundingClientRect().right, panel: [...el.querySelectorAll('.dr-supplement-dialog__panel')].map(n => [n.clientWidth, n.scrollWidth]) }));
        assert.ok(d.right <= d.width + 1 && d.panel.every(([width, scroll]) => scroll <= width + 1), JSON.stringify(d));
        await page.keyboard.press('Escape');
      }
      await page.setViewportSize({ width: 390, height: 960 }); await go(4); await slider.scrollIntoViewIfNeeded();
      const bounds = await slider.boundingBox(); await slider.tap({ position: { x: bounds.width * .5, y: bounds.height / 2 } }); assert.ok(Number(await slider.inputValue()) >= 3);
      await page.setViewportSize({ width: 1440, height: 960 }); await page.evaluate(() => { siteTheme.setPreference('light'); siteTextSize.setPreference('standard'); });
      await go(9); await page.locator('.lesson-slide-deck__fullscreen').click(); await page.getByRole('button', { name: 'スライドを全画面表示', exact: true }).click();
      assert.equal(await page.locator('body.is-lesson-fullscreen').count(), 1); await page.getByRole('button', { name: '全画面表示を終了', exact: true }).click();
      await page.emulateMedia({ media: 'print' }); assert.equal(await page.locator('[data-db-question]:visible').count(), 13); await page.emulateMedia({ media: 'screen' });
      const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } }), plain = await noJS.newPage();
      await plain.goto(new URL('dr01.html', base).href); assert.equal(await plain.locator('[data-db-question]:visible').count(), 13); assert.equal(await plain.locator('section[data-lesson-slide]:visible').count(), 10); await noJS.close();
      await page.goto(new URL('dr02.html#headline_11', base).href); await page.locator('body.lesson-slide-ready').waitFor();
      assert.equal(await page.locator('[data-db-question]').count(), 22);
      for (const group of await page.locator('[data-db-question-group]').all()) {
        const heading = await group.evaluate(el => el.closest('section').querySelector('h2').id);
        await page.evaluate(id => { location.hash = id; }, heading); await group.waitFor({ state: 'visible' });
        for (let i = 0; i < await group.locator('[data-db-question]').count(); i++) {
          await group.locator('[data-db-question-select]').selectOption(String(i)); const form = group.locator('[data-db-question]').nth(i);
          await form.evaluate(el => { el.querySelector('[data-db-answer]').value = parseInt(el.dataset.dbSource, Number(el.dataset.dbSourceBase)).toString(Number(el.dataset.dbAnswerBase)); });
          await form.locator('[type="submit"]').click(); assert.equal(await form.locator('[data-db-feedback]').getAttribute('data-correct'), 'true');
        }
      }
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  console.log(`digital-basics-pages: ${engine} ${mode} OK（本文10枚、式10問、確認3問）`);
} finally { await browser.close(); }
