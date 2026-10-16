import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditorServer } from './serve-pythoneditor.mjs';
import { confirmationDemo } from '../tools/pythoneditor/demo-confirmations.mjs';
import { validateCatalog } from '../tools/pythoneditor/core.mjs';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const engine = process.env.PYTHONEDITOR_ENGINE || 'Chrome';
const evidence = process.env.PYTHONEDITOR_CONFIRMATION_EVIDENCE || '/private/tmp/pythoneditor-confirmations-browser';
await mkdir(evidence, { recursive: true });
const report = { at: new Date().toISOString(), engine, environment: 'local browser and independent public demo; no school account or formal grading', checks: [], errors: [] };
const check = name => { report.checks.push(name); console.log('PASS', name); };
const server = await createEditorServer({ isolate: false });
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
const url = server.url + '?set=demo-confirmations&question=demo-confirm-input-check&version=demo-confirmations-v1';
const select = id => page.locator(`#question-list button[data-question="${id}"]`).click();
const edit = value => page.evaluate(value => document.querySelector('.CodeMirror').CodeMirror.setValue(value), value);
const code = () => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
const journal = () => page.evaluate(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')));
const progress = () => page.locator('#confirmation-progress').textContent();
async function prepared(value) {
  await page.locator('#settings-menu > summary').click(); await page.locator('#input-settings').click();
  await page.locator('#stdin').fill(value); await page.locator('#stdin-dialog [data-close]').click();
}
async function run({ error = false } = {}) {
  const before = (await journal())?.trials.length || 0;
  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 125000 });
  await page.waitForFunction(before => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2'))?.trials.length > before, before);
  assert.equal(await page.locator('#error').isVisible(), error);
  return page.locator('#output').textContent();
}
try {
  const catalog = validateCatalog({ schema: 'python-editor-catalog-v2', sets: [confirmationDemo] });
  assert.equal(catalog.sets[0].questions.filter(q => q.kind === 'confirmation').length, 5);
  await page.goto(url); await page.waitForSelector('#question-list button');
  assert.equal(await page.locator('#question-list button').count(), 10);
  assert.equal(await page.locator('#progress').textContent(), '実行済み 0 / 5 問');
  assert.equal(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getOption('readOnly')), true);
  assert.match(await progress(), /0\/3/);
  assert.equal(await page.locator('[data-question="demo-confirm-input-check"] .question-item-rating').isVisible(), false);
  assert.equal(await page.locator('#formal-submit').isDisabled(), true);
  check('v2 catalog, explicit source/version, read-only confirmation, practice count and formal-rating separation');
  if (engine !== 'webkit') {
    await prepared(''); await page.locator('#run').click(); await page.waitForSelector('#interactive-input:not([hidden])', { timeout: 125000 });
    await page.locator('#input-line').fill('5'); await page.locator('#interactive-input button[type=submit]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2'))?.trials.length === 1);
  } else { await prepared('5\n'); await run(); }
  await prepared('6\n'); await run(); await prepared('9\n'); await run();
  assert.match(await progress(), /3\/3/); assert.equal(await page.locator('#confirmation-progress').getAttribute('data-state'), 'complete');
  let data = await journal();
  assert.deepEqual(data.trials.slice(0, 3).map(t => t.inputs), ['5', '6', '9'].map(value => [{ prompt: '品物の個数: ', value }]));
  assert.ok(data.trials.every(t => t.source.questionId === 'demo-confirm-input-code' && t.source.version === 'demo-confirmations-v1' && t.codeHash.length === 64));
  assert.equal(data.trials[0].stdout, '1箱\n');
  check('manual/prepared input is recorded structurally without parsing output echoes; three input conditions remain observations');
  await page.locator('#confirmation-panel button').filter({ hasText: '参照元のコードを編集' }).click();
  const original = await code(); await edit(original + '# 編集後\n');
  await select('demo-confirm-input-check'); assert.match(await progress(), /0\/3/);
  assert.match(await page.locator('.confirmation-history').textContent(), /コード変更前/);
  assert.equal((await journal()).trials.length, 3);
  await prepared('bad\n'); await run({ error: true }); assert.match(await progress(), /0\/3/);
  data = await journal(); assert.equal(data.trials.at(-1).outcome, 'error'); assert.equal(data.trials.at(-1).inputs[0].value, 'bad');
  await select('demo-confirm-input-code'); await edit('while True:\n    pass\n'); await select('demo-confirm-input-check');
  await page.locator('#run').click(); await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'stop');
  await page.locator('#run').click(); await page.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).trials.length === 5);
  assert.equal((await journal()).trials.at(-1).outcome, 'stopped'); assert.match(await progress(), /0\/3/);
  await select('demo-confirm-input-code'); await edit(original); await select('demo-confirm-input-check'); assert.match(await progress(), /3\/3/);
  check('source edits invalidate current-code progress while prior/error/stopped trials remain recoverable');
  await select('demo-confirm-random-check');
  for (let count = 0; count < 40 && !/確認[34]\/3/.test(await progress()); count++) await run();
  assert.match(await progress(), /確認[34]\/3/); assert.equal(await page.locator('#confirmation-progress').getAttribute('data-state'), 'complete');
  assert.equal((await journal()).trials.filter(t => t.source.questionId === 'demo-confirm-random-code').every(t => ['北', '東', '南', '西'].includes(t.stdout.trim())), true);
  check('random results count only declared distinct outcomes across repeated runs');
  await select('demo-confirm-game-check');
  await prepared('1\n2\n3\n4\n5\n6\n7\n42\n'); await run();
  assert.match(await progress(), /8回で正解.*未達/);
  await prepared('50\n25\n38\n44\n41\n42\n'); await run(); assert.match(await progress(), /6回で正解.*達成/);
  data = await journal(); assert.equal(data.trials.at(-1).inputs.length, 6); assert.ok(data.trials.at(-1).inputs.every(i => i.prompt === '予想: '));
  check('game attempts include the winning guess, distinguish success over target and success within theoretical limit');
  await select('demo-confirm-compare-check'); await prepared('10\n'); await run();
  await page.locator('#confirmation-source').selectOption('demo-confirmations-v1/demo-confirm-compare-b');
  assert.match(await code(), /n \* \(n \+ 1\)/); await run();
  data = await journal(); const compare = data.trials.filter(t => t.source.questionId.startsWith('demo-confirm-compare-'));
  assert.equal(compare.length, 2);
  await page.locator('[data-condition="loop"]').selectOption(compare[0].id);
  await page.locator('[data-condition="formula"]').selectOption(compare[0].id); assert.match(await progress(), /1\/2/);
  await page.locator('[data-condition="formula"]').selectOption(compare[1].id); assert.match(await progress(), /2\/2/);
  assert.equal(await page.locator('#formal-submit').isDisabled(), true);
  check('multiple versioned sources run without editing, comparison requires distinct chosen trials and creates no score');
  await select('demo-confirm-answer-check'); await page.locator('#confirmation-answer').selectOption('input');
  await page.locator('#confirmation-answer-save').focus(); await page.locator('#confirmation-answer-save').press('Enter');
  assert.equal(await page.locator('#confirmation-answer-save').evaluate(el => el === document.activeElement), true); assert.match(await progress(), /回答を記録済み（正誤未判定）/);
  const beforeReload = await journal(); await page.reload(); await page.waitForSelector('#confirmation-answer');
  assert.equal(await page.locator('#confirmation-answer').inputValue(), 'input'); assert.deepEqual(await journal(), beforeReload);
  check('answer is recorded without a public correctness claim and all history/responses survive reload');
  await page.locator('#file-menu > summary').click(); const downloadEvent = page.waitForEvent('download'); await page.locator('#save-file').click();
  const download = await downloadEvent, downloaded = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(downloaded.confirmationJournal, beforeReload);
  const restoredContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), restoredPage = await restoredContext.newPage();
  await restoredPage.goto(url); await restoredPage.waitForSelector('#question-list button');
  await restoredPage.locator('#file-input').setInputFiles({ name: 'python-draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(downloaded)) });
  await restoredPage.waitForSelector('#import-dialog[open]'); await restoredPage.locator('#confirm-import').click();
  await restoredPage.waitForFunction(() => !document.querySelector('#import-dialog').open);
  assert.deepEqual(await restoredPage.evaluate(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2'))), beforeReload);
  await restoredContext.close(); check('portable JSON includes journal and a fresh browser restores it after explicit review');
  const isolated = await createEditorServer();
  const compatContext = await browser.newContext(), compatPage = await compatContext.newPage();
  const compatCatalog = { schema: 'python-editor-catalog-v2', sets: [{ setId: 'compat', title: '互換性確認', questions: [
    { questionId: 'compat-code', version: 'v1', title: '参照元', prompt: '準備コードを使います。', templateCode: 'print(prefix)', setupCode: 'prefix = "source"' },
    { questionId: 'compat-observation', version: 'v1', title: '旧確認', prompt: '独自の準備コードを使います。', kind: 'observation', useExistingQuestionCode: 'compat-code', templateCode: '', setupCode: 'prefix = "observation"' },
    { questionId: 'compat-confirmation', version: 'v1', title: '新確認', prompt: '参照元の準備コードを使います。', kind: 'confirmation', codeRefs: [{ questionId: 'compat-code', version: 'v1' }], checkType: 'resultCoverage', checkConfig: { results: ['source', 'other'], requiredDistinct: 1, output: 'lastLine' }, templateCode: '', setupCode: '' },
    { questionId: 'compat-input-code', version: 'v1', title: '入力元', prompt: '整数を入力します。', templateCode: 'value = int(input("値: "))\nprint(value)', setupCode: '' },
    { questionId: 'compat-input-confirmation', version: 'v1', title: '入力確認', prompt: '8を入力します。', kind: 'confirmation', codeRefs: [{ questionId: 'compat-input-code', version: 'v1' }], checkType: 'inputCases', checkConfig: { cases: [{ id: 'eight', label: '8を入力', inputs: [{ index: 0, kind: 'integer', op: 'eq', value: 8 }] }] }, templateCode: '', setupCode: '' }
  ] }] };
  await compatContext.route('**/__pythoneditor/catalog', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compatCatalog) }));
  try {
    await compatPage.goto(isolated.url + '?set=compat&question=compat-observation&version=v1');
    await compatPage.waitForSelector('#question-list button'); await compatPage.locator('#run').click();
    await compatPage.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 125000 });
    assert.equal(await compatPage.locator('#output').textContent(), 'observation\n');
    assert.equal(await compatPage.evaluate(() => localStorage.getItem('joho.pythoneditor.confirmations.v2')), null);
    await compatPage.locator('[data-question="compat-confirmation"]').click(); await compatPage.locator('#run').click();
    await compatPage.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2'))?.trials.length === 1);
    assert.equal(await compatPage.locator('#output').textContent(), 'source\n');
    assert.match(await compatPage.locator('#confirmation-progress').textContent(), /確認1\/1/);
    check('legacy observation keeps its own setup code; new confirmation uses the explicit source setup without mixing the two');
    await compatPage.locator('[data-question="compat-input-confirmation"]').click(); await compatPage.locator('#run').click();
    await compatPage.waitForSelector('#interactive-input:not([hidden])', { timeout: 125000 });
    await compatPage.locator('#input-line').fill('8'); await compatPage.locator('#interactive-input button[type=submit]').click();
    await compatPage.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).trials.length === 2);
    const isolatedTrial = await compatPage.evaluate(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).trials.at(-1));
    assert.deepEqual(isolatedTrial.inputs, [{ prompt: '値: ', value: '8' }]); assert.equal(isolatedTrial.stdout, '8\n');
    assert.match(await compatPage.locator('#confirmation-progress').textContent(), /1\/1/);
    check('isolated interactive input also records the exact prompt/value and program output on JSPI or SharedArrayBuffer');
  } finally { await compatContext.close(); await new Promise(resolve => isolated.server.close(resolve)); }
  await select('demo-confirm-compare-check');
  const layouts = [];
  for (const width of [1440, 720, 390]) for (const theme of ['auto', 'light', 'dark']) for (const size of ['standard', 'large', 'largest']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(({ theme, size }) => { for (const [id, value] of [['theme', theme], ['text-size', size]]) { const select = document.getElementById(id); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); } }, { theme, size });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, JSON.stringify({ width, theme, size })); layouts.push({ width, theme, size, overflow });
  }
  report.layouts = layouts; await page.screenshot({ path: evidence + '/mobile-comparison.png', fullPage: true });
  assert.deepEqual(report.errors, []); check('confirmation controls fit 27 viewport/theme/font combinations with no browser exception');
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = error.stack; await page.screenshot({ path: evidence + '/failure.png', fullPage: true }).catch(() => {}); throw error; }
finally { await writeFile(evidence + '/report.json', JSON.stringify(report, null, 2)); await browser.close(); await new Promise(resolve => server.server.close(resolve)); }
