// Chrome/WebKit regression checks for the consolidated computer-science lecture pages.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const browsers = new Map([['chrome', chromium], ['webkit', webkit]]);
const selected = (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',').map(value => value.trim()).filter(Boolean);

async function load(page, path) {
  await page.goto(new URL(path, baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function fits(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, `${label}: 横はみ出しなし`);
}

async function cp31Checks(page, width) {
  await load(page, 'cp31.html');
  await expect(page.locator('[data-logic-venn]')).toHaveCount(6);
  await expect(page.locator('[data-logic-explorer]')).toHaveCount(7);
  await expect(page.locator('[data-logic-explorer] .logic-circuit')).toHaveCount(7);
  await page.evaluate(() => { location.hash = '#headline_2'; });
  await expect(page.locator('[data-logic-explorer]').first()).toBeVisible();
  const input = page.locator('[data-logic-explorer]').first().locator('.logic-bit-button').first();
  const before = await input.textContent();
  await input.click();
  assert.notEqual(await input.textContent(), before, 'explorerの入力切替が反映される');

  await page.evaluate(() => { location.hash = '#headline_5'; });
  await expect(page.locator('[data-lesson-slide-title="語句まとめ・ポイントまとめ"]')).toBeVisible();
  const terms = page.locator('.logic-review-term details');
  assert.equal(await terms.evaluateAll(items => items.filter(item => item.open).length), 0, '語句detailsは初期閉鎖');
  await terms.first().locator('summary').press('Enter');
  await expect(terms.first()).toHaveAttribute('open', '');

  await page.goto(new URL('cp31.html#panel-build', baseURL).href);
  await page.locator('body.lesson-slide-ready').waitFor();
  await expect(page.locator('#panel-build')).toBeVisible();
  await expect(page.locator('#build-editor .logic-editor__canvas')).toBeVisible();
  const buildBounds = await page.locator('#build-editor .logic-editor__canvas-wrap').boundingBox();
  assert.ok(buildBounds, 'buildエディタcanvasが表示される');
  const nodeBounds = await page.locator('#build-editor .logic-editor-node').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  }));
  assert.ok(nodeBounds.length >= 3, 'buildエディタに初期ノードがある');
  assert.ok(nodeBounds.every(rect => rect.top >= buildBounds.y - 1 && rect.bottom <= buildBounds.y + buildBounds.height + 1), `buildエディタの初期ノードがcanvas内に収まる: ${JSON.stringify({ buildBounds, nodeBounds })}`);
  await expect(page.locator('#logic-quiz-tabs [role="tab"]')).toHaveCount(3);
  await page.locator('#build-editor button[data-gate="AND"]').click();
  const gateId = await page.evaluate(() => window.logicQuizBuildEditor.graph.nodes.find(node => node.type === 'AND').id);
  const port = (id, kind, index = 0) => page.locator(`#build-editor .logic-editor-port[data-node-id="${id}"][data-kind="${kind}"]${kind === 'input' ? `[data-port="${index}"]` : ''}`);
  await port('input-A', 'output').click();
  await port(gateId, 'input', 0).click();
  await port('input-B', 'output').click();
  await port(gateId, 'input', 1).click();
  await port(gateId, 'output').click();
  await port('output-F', 'input').click();
  assert.equal(await page.evaluate(() => window.logicQuizBuildEditor.graph.wires.length), 3, '統合後のエディタで実際に配線できる');
  await page.locator('#build-editor').getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.equal(await page.evaluate(() => window.logicQuizBuildEditor.graph.wires.length), 2, '配線をUndoできる');

  for (const [hash, panel] of [['#panel-single', '#panel-single'], ['#panel-table', '#panel-table'], ['#panel-build', '#panel-build']]) {
    await page.goto(new URL(`cp31.html${hash}`, baseURL).href);
    await page.locator('body.lesson-slide-ready').waitFor();
    await expect(page.locator(panel)).toBeVisible();
    assert.equal(new URL(page.url()).hash, hash, `${hash}直リンクのハッシュ`);
  }
  await page.locator('#tab-single').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panel-table')).toBeVisible();
  assert.equal(new URL(page.url()).hash, '#panel-table', '矢印キー切替がハッシュへ反映される');

  await page.locator('#tab-single').click();
  const singleScore = page.locator('#panel-single [data-logic-score]');
  await page.locator('#panel-single [data-single-answer]').first().click();
  await expect(singleScore).toContainText('解答 1問');
  const score = await singleScore.textContent();
  await page.evaluate(() => { location.hash = '#headline_1'; });
  await expect(page.locator('#headline_1')).toBeVisible();
  await page.evaluate(() => { location.hash = '#headline_6'; });
  await expect(page.locator('#panel-single')).toBeVisible();
  await expect(singleScore).toHaveText(score);

  await page.locator('#tab-table').click();
  const tableAnswer = page.locator('#panel-table tr[data-row] .logic-table-answer').first();
  assert.ok(await page.locator('#panel-table tr[data-row] .logic-table-answer').count() > 0, 'tableタブに穴埋めボタン');
  await tableAnswer.focus();
  await tableAnswer.press('1');
  const tableValue = await tableAnswer.textContent();
  await page.evaluate(() => { location.hash = '#headline_5'; });
  await expect(page.locator('#headline_5')).toBeVisible();
  await page.evaluate(() => { location.hash = '#panel-table'; });
  await expect(page.locator('#panel-table')).toBeVisible();
  await expect(page.locator('#panel-table tr[data-row] .logic-table-answer').first()).toHaveText(tableValue);
  await page.locator('#tab-build').click();
  await expect(page.locator('#build-editor .logic-editor__canvas')).toBeVisible();

  const helper = page.locator('[data-lesson-supplement-open="cp31-quiz-guide-dialog"]');
  await helper.click();
  const dialog = page.locator('#cp31-quiz-guide-dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(helper).toBeFocused();
  await fits(page, `cp31 ${width}px`);
}

async function cp32Checks(page, width) {
  await load(page, 'cp32.html#headline_2');
  await expect(page.locator('#logic-circuit-selector .logic-circuit-selector__button')).toHaveCount(4);
  for (const button of await page.locator('#logic-circuit-selector .logic-circuit-selector__button').all()) {
    await button.click();
    await expect(page.locator('#logic-application-challenge .logic-circuit')).toBeVisible();
    await expect(page.locator('#logic-application-challenge table')).toBeVisible();
  }
  await fits(page, `cp32 ${width}px`);
}

async function run(name, engine) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(baseURL)) errors.push(`${response.status()} ${response.url()}`);
  });
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await cp31Checks(page, width);
      await cp32Checks(page, width);
    }
    await page.goto(new URL('cp00.html', baseURL).href);
    await expect(page.locator('#html_index')).toBeVisible();
    await fits(page, 'cp00');
    assert.deepEqual(errors, []);
    console.log(`${name}: cp00/cp31/cp32 consolidated lecture checks passed`);
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const name of selected) {
  assert.ok(browsers.has(name), `unsupported browser: ${name}`);
  await run(name, browsers.get(name));
}
