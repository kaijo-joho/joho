// 本人・GSS・Google RPCは合成。実エディタ/Pyodideと実GAS関数を二重iframeで結合する。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createEditorServer } from './serve-pythoneditor.mjs';
import { setup } from './tools-store-gas/tests/store-fixture.mjs';
import { createCloudFixture, T0 } from '../tools/pythoneditor/tests/cloud-fixture.mjs';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const engine = process.env.PYTHONEDITOR_ENGINE || 'Chrome';
const evidence = process.env.PYTHONEDITOR_CONFIRMATION_SYNC_EVIDENCE || '/private/tmp/pythoneditor-confirmation-sync-browser';
await mkdir(evidence, { recursive: true });
const server = await createEditorServer({ isolate: false }), origin = new URL(server.url).origin;
const account = 'student@example.invalid', store = setup({ confirmation: true, account, config: { allowedOrigins: [origin], allowedDomains: ['example.invalid'] } });
const formal = createCloudFixture(), C = formal.ctx.PythonEditorConfirmation, G = formal.ctx.PythonEditorConfirmationGraderV1;
const originalCode = 'value = int(input("値: "))\nprint(value * 2)\n', ref = { questionId: 'source-confirm', version: 'v1' };
const source = { schema: 1, question: { ...structuredClone(formal.snapBody.question), ...ref, order: 2, title: '問2 (1) 値を2倍にする', prompt: '合成の動作確認用問題です。', templateCode: originalCode },
  engineVersion: formal.ctx.PythonEditorGraderV1.engineVersion, gradingVersion: '', ranges: [], rules: {}, graded: false };
formal.freeze(source);
const cases = { cases: [{ id: 'six', label: '6を入力する', inputs: [{ index: 0, kind: 'integer', op: 'eq', value: 6 }] },
  { id: 'seven', label: '7を入力する', inputs: [{ index: 0, kind: 'integer', op: 'eq', value: 7 }] }],
  private: { expectedOutputs: { six: { mode: 'lastLine', text: '12' }, seven: { mode: 'lastLine', text: '14' } } } };
const choices = { format: 'choice', question: 'このコードの動作を選んでください。', choices: [{ id: 'double', label: '2倍する' }, { id: 'add', label: '足す' }, { id: 'subtract', label: '引く' }], private: { expectedAnswer: 'double' } };
function confirm(id, order, title, type, config, grading) {
  const body = { schema: 1, question: { questionId: id, version: 'v2', setId: 'exercise', order, title, prompt: '独自作成の合成検証用です。', templateCode: '', setupCode: '', kind: 'confirmation',
    codeRefs: [ref], checkType: type, checkConfig: JSON.parse(JSON.stringify(C.publicCheck(type, config))) },
    engineVersion: grading ? G.engineVersion : formal.ctx.PythonEditorGraderV1.engineVersion, gradingVersion: '', ranges: [], rules: {}, graded: !!grading,
    confirmation: { codeRefs: [ref], checkType: type, checkConfig: JSON.parse(JSON.stringify(C.normalizeCheck(type, config))) } };
  if (grading) body.confirmationGrading = JSON.parse(JSON.stringify(G.normalize(type, config, grading)));
  formal.freeze(body); return body.question;
}
const inputQ = confirm('input-check', 3, '問2 (2) 入力条件を確認する', 'inputCases', cases,
  { schema: 1, version: 'synthetic-input', checks: [{ id: 'six', points: 1, require: 'inputAndOutput' }, { id: 'seven', points: 1, require: 'inputAndOutput' }] });
const answerQ = confirm('answer-check', 4, '問2 (3) 動作を答える', 'answer', choices,
  { schema: 1, version: 'synthetic-answer', checks: [{ id: 'answer', points: 1, require: 'correct' }] });
confirm('ungraded-check', 5, '問2 (4) 学習用の確認', 'inputCases', cases, null);
formal.config.assignments.push({ ...formal.config.assignments[0], version: 'v2', assignmentId: 'exercise2' });
formal.ctx.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [T0])); } };
formal.ctx.PythonEditorService.environment = () => formal.env(account);
const catalog = formal.dispatch('session', {}, T0, formal.env(account)).catalog;
const connection = { account, actorKey: store.T.actorKey(account), binding: store.binding, spreadsheetId: 'synthetic_spreadsheet_identifier_0001',
  storeURL: 'https://script.google.com/macros/s/CONFIRMATION_STORE_TEST_ONLY/exec', schemaVersion: 1 };
const templates = { dist: await readFile(new URL('./tools-store-gas/dist/25_toolsStoreConnection.html', import.meta.url), 'utf8'),
  store: await readFile(new URL('./tools-store-gas/store/20_tools_store_bridge.html', import.meta.url), 'utf8'),
  formal: await readFile(new URL('./pythoneditor-gas/21_python_editor_bridge.html', import.meta.url), 'utf8') };
const cloudUI = await readFile(new URL('../tools/pythoneditor/cloud-ui.mjs', import.meta.url), 'utf8');
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const report = { at: new Date().toISOString(), engine, environment: 'synthetic identity/GSS; real browser, Pyodide, GAS store/grader code and nested iframe bridges', checks: [] };
const errors = [], calls = [], contexts = [];
const check = name => { report.checks.push(name); console.log('PASS', name); };
async function context(name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); contexts.push(ctx);
  const fault = { offline: false, lookupUnavailable: false, loseAction: null, holdAction: null, release: null, arrived: null };
  await ctx.exposeBinding('__confirmationRPC', async (_source, mode, action, input, binding, requestOrigin) => {
    calls.push({ context: name, mode, action, input: structuredClone(input) });
    if (mode === 'dist') return { ok: true, value: { ...connection, binding: store.issue() } };
    if (mode === 'store' && fault.offline) return { ok: false, error: { code: 'transport_failed', message: '合成の通信断' } };
    if (mode === 'formal' && action === 'getSubmission' && fault.lookupUnavailable)
      return { ok: false, error: { code: 'transport_failed', message: '合成の結果照会通信断' } };
    let result;
    if (mode === 'formal') result = formal.ctx.pythonEditorRpc(action, input, binding);
    else { try { result = { ok: true, value: structuredClone(store.call(action, input, binding, requestOrigin)) }; }
      catch (e) { result = { ok: false, error: { code: e.toolsStoreCode || 'service_unavailable', message: e.message } }; } }
    if (action === fault.holdAction) { fault.holdAction = null; fault.arrived?.(); await new Promise(resolve => { fault.release = resolve; }); }
    if (action === fault.loseAction) {
      fault.loseAction = null;
      if (mode === 'formal') await new Promise(resolve => setTimeout(resolve, 3000));
      else return { ok: false, error: { code: 'transport_failed', message: '合成の応答消失' } };
    }
    return result;
  });
  await ctx.route('**/__pythoneditor/catalog', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) }));
  await ctx.route(/\/tools-store-config\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: "export const toolsStoreConfig={enabled:true,distURL:'https://script.google.com/macros/s/CONFIRMATION_DIST_TEST_ONLY/exec',autosave:{idleMs:100,minIntervalMs:180,maxWaitMs:500,jitterMs:0}};" }));
  await ctx.route(/\/cloud-config\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: "export const cloudConfig={enabled:true,bridgeURL:'https://script.google.com/macros/s/CONFIRMATION_FORMAL_TEST_ONLY/exec'};" }));
  await ctx.route(/\/cloud-ui\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: cloudUI.replace('new GoogleBridge(cloudConfig)', 'new GoogleBridge(cloudConfig,{timeout:1500})') }));
  await ctx.route('https://script.google.com/**', route => {
    const url = new URL(route.request().url()), mode = url.pathname.includes('DIST_') ? 'dist' : url.pathname.includes('FORMAL_') ? 'formal' : 'store';
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe src="https://n-confirmation-sync-test-0lu-script.googleusercontent.com/${mode}?${url.searchParams}"></iframe>` });
  });
  await ctx.route('https://n-confirmation-sync-test-0lu-script.googleusercontent.com/**', route => {
    const url = new URL(route.request().url()), mode = url.pathname.slice(1), boot = { protocol: 'tools-store-rpc-v1', origin: url.searchParams.get('origin'), channel: url.searchParams.get('channel') };
    const shim = `<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{getToolsStoreConnectionV1(input){window.__confirmationRPC('dist','session',input).then(success,failure);},toolsStoreRpc(action,input,binding,origin){window.__confirmationRPC('store',action,input,binding,origin).then(success,failure);},pythonEditorRpc(action,input,key){window.__confirmationRPC('formal',action,input,key).then(success,failure);}};}};}}}};</script>`;
    return route.fulfill({ contentType: 'text/html', body: templates[mode].replace(/<\?!= (?:toolsStoreBootJson|bootJson) \?>/, JSON.stringify(boot)).replace('<script>', shim + '<script>') });
  });
  ctx.on('page', page => page.on('pageerror', e => errors.push({ context: name, message: e.message })));
  return { ctx, fault };
}
const journal = page => page.evaluate(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')) || { schema: 1, trials: [], responses: {} });
const code = page => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
const edit = (page, value) => page.evaluate(value => document.querySelector('.CodeMirror').CodeMirror.setValue(value), value);
const select = (page, id) => page.locator(`#question-list button[data-question="${id}"]`).click();
const saved = page => page.waitForFunction(() => document.querySelector('#cloud-inline-status').textContent === 'クラウドに保存済み');
async function connect(page) {
  await page.locator('#cloud-connect').click();
  await page.waitForFunction(account => document.querySelector('#cloud-account').textContent.includes(account) && !document.querySelector('#cloud-connect').disabled, account);
}
async function menu(page, id) { await page.locator('#file-menu > summary').click(); await page.locator('#' + id).click(); }
async function answer(page, value) {
  await select(page, answerQ.questionId);
  await page.locator('#confirmation-answer').selectOption(value);
  await page.keyboard.press('Escape');
  await page.locator('#confirmation-answer-save').click();
  await page.waitForFunction(({ key, value }) => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2'))?.responses[key]?.answer === value, { key: 'v2/answer-check', value });
}
async function prepared(page, value) {
  await page.locator('#settings-menu > summary').click(); await page.locator('#input-settings').click();
  await page.locator('#stdin').fill(value); await page.locator('#stdin-dialog [data-close]').click();
}
async function run(page) {
  const before = (await journal(page)).trials.length; await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 125000 });
  await page.waitForFunction(before => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2'))?.trials.length > before, before);
}
async function formalSubmit(page) {
  await page.locator('#formal-submit').click(); await page.waitForSelector('#submit-dialog[open]');
  await page.locator('#submit-confirm').click(); await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled);
}
async function remoteJournal() {
  const manifest = store.call('getConfirmationJournal', { tool: 'python' }, store.issue());
  if (manifest.revision === null) return manifest.journal;
  try {
    let text = ''; for (let index = 0; index < manifest.chunkCount; index++) text += store.call('getConfirmationJournalChunk', { tool: 'python', revision: manifest.revision, readId: manifest.readId, index }, store.issue()).text;
    return JSON.parse(text);
  } finally { store.call('releaseConfirmationRead', { tool: 'python', revision: manifest.revision, readId: manifest.readId }, store.issue()); }
}
let primaryPage, loanPage;
try {
  const home = await context('home'), page = primaryPage = await home.ctx.newPage();
  await page.goto(server.url + '?set=exercise&question=source-confirm&version=v1'); await page.waitForSelector('#question-list button'); await connect(page);
  await edit(page, originalCode + '# home\n'); await prepared(page, '6\n'); await run(page); await prepared(page, '7\n'); await run(page);
  await select(page, inputQ.questionId); assert.match(await page.locator('#confirmation-progress').textContent(), /2\/2/);
  await answer(page, 'double'); await saved(page);
  const remote = await remoteJournal(); assert.equal(remote.trials.length, 2); assert.equal(remote.responses['v2/answer-check'].answer, 'double');
  assert.deepEqual(remote.trials.map(t => t.inputs[0].value), ['6', '7']); assert.deepEqual(remote.trials.map(t => t.stdout), ['12\n', '14\n']);
  check('real Pyodide trials and answer automatically persist through the student GAS and nested bridges');

  const loan = await context('loan'), lp = loanPage = await loan.ctx.newPage();
  await lp.goto(server.url + '?set=exercise&question=source-confirm&version=v1'); await lp.waitForSelector('#question-list button'); await connect(lp);
  await lp.waitForSelector('#cloud-conflict[open]'); await lp.locator('#conflict-cloud').click();
  assert.equal(await code(lp), originalCode + '# home\n'); await select(lp, inputQ.questionId); assert.match(await lp.locator('#confirmation-progress').textContent(), /2\/2/);
  await select(lp, answerQ.questionId); assert.equal(await lp.locator('#confirmation-answer').inputValue(), 'double');
  assert.equal((await journal(lp)).trials.length, 2); check('fresh loan context restores exact source/version, trials and answer without copying the home browser');

  await answer(lp, 'add'); await saved(lp); assert.equal((await remoteJournal()).responses['v2/answer-check'].answer, 'add');
  home.fault.offline = true; await answer(page, 'subtract'); await page.waitForFunction(() => document.querySelector('#cloud-inline-status').textContent.includes('自動再試行'));
  home.fault.offline = false; await menu(page, 'open-cloud'); await page.waitForSelector('#confirmation-cloud-conflict[open]');
  assert.match(await page.locator('#confirmation-cloud-local-preview').textContent(), /subtract/); assert.match(await page.locator('#confirmation-cloud-remote-preview').textContent(), /add/);
  await page.locator('#confirmation-cloud-remote').click(); await saved(page);
  const backups = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('joho.pythoneditor.confirmations.backup.v1.')).map(([, raw]) => JSON.parse(raw)));
  assert.ok(backups.some(value => JSON.stringify(value).includes('subtract'))); assert.ok(backups.some(value => JSON.stringify(value).includes('add')));
  assert.equal((await journal(page)).responses['v2/answer-check'].answer, 'add');
  check('file-menu restoration on a confirmation detects home/loan conflict and protects both answers before selection');
  await loan.ctx.close();

  home.fault.offline = true; await answer(page, 'double'); await page.waitForFunction(() => document.querySelector('#cloud-inline-status').textContent.includes('自動再試行'));
  assert.equal((await remoteJournal()).responses['v2/answer-check'].answer, 'add'); home.fault.offline = false;
  await page.evaluate(() => dispatchEvent(new Event('online'))); await saved(page); assert.equal((await remoteJournal()).responses['v2/answer-check'].answer, 'double');
  check('offline answer changes remain local and recover to the GSS after an online event');

  home.fault.loseAction = 'saveConfirmationJournal'; await answer(page, 'add');
  await page.waitForFunction(() => document.querySelector('#cloud-inline-status').textContent.includes('自動再試行'));
  const lost = calls.filter(c => c.context === 'home' && c.action === 'saveConfirmationJournal').at(-1).input;
  await page.evaluate(() => dispatchEvent(new Event('online'))); await saved(page);
  assert.equal((await remoteJournal()).responses['v2/answer-check'].answer, 'add');
  assert.equal(calls.filter(c => c.context === 'home' && c.action === 'saveConfirmationJournal' && c.input.requestId === lost.requestId).length, 1);
  assert.ok(calls.some(c => c.context === 'home' && c.action === 'lookupConfirmationSave' && c.input.requestId === lost.requestId));
  check('lost save acknowledgment recovers the immutable upload request by lookup without duplicate commit');

  await answer(page, 'double'); await saved(page); await select(page, inputQ.questionId); await formalSubmit(page);
  assert.match(await page.locator('#formal-score').textContent(), /100 点/); assert.equal(await page.locator('[data-question="input-check"] .question-item-rating').textContent(), '★★');
  assert.match(await page.locator('#set-current-rating').textContent(), /★2\/4/);
  const submitted = calls.filter(c => c.mode === 'formal' && c.action === 'submit').at(-1).input;
  assert.equal(submitted.kind, 'confirmation-v1'); assert.equal(submitted.sources[0].version, 'v1'); assert.equal(submitted.journal.trials.length, 2);
  assert.equal(submitted.score, undefined); assert.equal(submitted.passed, undefined);
  check('confirmation submit sends a reviewed record snapshot; server private checks update official score, stars and set total');

  await select(page, answerQ.questionId); home.fault.loseAction = 'submit'; await formalSubmit(page);
  assert.match(await page.locator('#notice').textContent(), /応答/);
  const pending = structuredClone(calls.filter(c => c.mode === 'formal' && c.action === 'submit').at(-1).input);
  home.fault.lookupUnavailable = true;
  await select(page, ref.questionId); await edit(page, originalCode + '# newer during pending\n'); await answer(page, 'subtract');
  await page.locator('#formal-submit').click(); await page.waitForSelector('#submit-dialog[open]');
  assert.match(await page.locator('#submit-description').textContent(), /同じ番号/); assert.ok(!(await page.locator('#submit-preview').textContent()).includes('newer during pending'));
  home.fault.lookupUnavailable = false;
  await page.locator('#submit-confirm').click(); await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled);
  const retried = calls.filter(c => c.mode === 'formal' && c.action === 'submit').at(-1).input; assert.deepEqual(retried, pending);
  assert.equal((await journal(page)).responses['v2/answer-check'].answer, 'subtract'); assert.match(await code(page), /newer during pending/);
  await page.waitForFunction(() => document.querySelector('#formal-edited').textContent.includes('変更されています'));
  assert.match(await page.locator('#set-current-rating').textContent(), /★3\/4/);
  check('a lost formal reply retries the original request/answer/code while newer edits remain intact and show a changed-after-submission notice');

  await answer(page, 'double'); await formalSubmit(page); assert.match(await page.locator('#formal-edited').textContent(), /一致しています/);
  await select(page, ref.questionId); await prepared(page, '6\n'); await run(page); await select(page, answerQ.questionId);
  await page.waitForFunction(() => document.querySelector('#formal-edited').textContent.includes('変更されています'));
  check('an additional real trial changes confirmation evidence independently of the previously awarded official stars');

  await select(page, 'ungraded-check'); assert.equal(await page.locator('#formal-submit').isDisabled(), true);
  assert.equal(await page.locator('[data-question="ungraded-check"] .question-item-rating').isVisible(), false); assert.match(await page.locator('#formal-note').textContent(), /未設定/);
  check('a confirmation without explicit grading configuration remains learning-only and contributes no official stars');

  await select(page, 'q1'); await edit(page, '# start\nx = 2\nprint("value:", x)\n# end'); await prepared(page, ''); await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 125000 });
  assert.equal(await page.locator('#output').textContent(), 'value: 2\n'); await formalSubmit(page);
  assert.match(await page.locator('#formal-score').textContent(), /100 点/); assert.match(await page.locator('#set-current-rating').textContent(), /★4\/4/);
  const legacy = calls.filter(c => c.mode === 'formal' && c.action === 'submit').at(-1).input; assert.equal(legacy.kind, undefined); assert.equal(legacy.journal, undefined); assert.match(legacy.run.codeHash, /^[a-f0-9]{64}$/);
  check('the normal full-code submission and legacy text grader retain their original run/codeHash contract');

  const second = await home.ctx.newPage(); await second.goto(server.url + '?set=exercise&question=answer-check&version=v2'); await second.waitForSelector('#question-list button');
  await select(page, answerQ.questionId); await page.locator('#confirmation-answer').selectOption('add');
  assert.equal(await page.locator('#confirmation-answer-unsaved').isVisible(), true);
  const formBeforeRefresh = await page.locator('#confirmation-answer').elementHandle();
  const before = (await journal(page)).trials.length;
  const record = (tab, label) => tab.evaluate(async ({ label, ref, code }) => {
    const { ConfirmationStore } = await import('/tools/pythoneditor/confirmation-store.mjs?v=20261017-confirmation-sync1');
    const store = new ConfirmationStore(); await store.record({ source: ref, code, inputs: [], stdout: label, stderr: '', outcome: 'success', truncated: false });
  }, { label, ref, code: originalCode + '# newer during pending\n' });
  await Promise.all([record(page, 'tab A'), record(second, 'tab B')]);
  await page.waitForFunction(before => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).trials.length >= before + 2, before);
  const retained = await journal(page); assert.ok(retained.trials.some(t => t.stdout === 'tab A')); assert.ok(retained.trials.some(t => t.stdout === 'tab B'));
  await page.waitForFunction(node => !node.isConnected, formBeforeRefresh);
  assert.equal(await page.locator('#confirmation-answer').inputValue(), 'add'); assert.equal(retained.responses['v2/answer-check'].answer, 'double');
  await page.locator('#formal-submit').click(); await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('回答を記録'));
  assert.equal(await page.locator('#submit-dialog').isVisible(), false);
  await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled); await page.keyboard.press('Escape');
  await page.locator('#confirmation-answer-save').click(); await page.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).responses['v2/answer-check'].answer === 'add');
  await answer(page, 'double'); await saved(page); await second.close();
  check('two actual tabs use Web Locks to retain both concurrent trial writes');
  check('an unrecorded choice survives actual journal-triggered rerender and must be explicitly recorded before submission');

  const late = await context('late-read'), delayed = await late.ctx.newPage(); await delayed.goto(server.url + '?set=exercise&question=answer-check&version=v2'); await delayed.waitForSelector('#question-list button');
  const arrived = new Promise(resolve => { late.fault.arrived = resolve; }); late.fault.holdAction = 'getConfirmationJournal';
  await delayed.locator('#cloud-connect').click(); await arrived;
  await delayed.evaluate(async () => { const { ConfirmationStore } = await import('/tools/pythoneditor/confirmation-store.mjs?v=20261017-confirmation-sync1'); await new ConfirmationStore().setResponse('v2/answer-check', { answer: 'subtract' }); });
  late.fault.release(); await delayed.waitForSelector('#confirmation-cloud-conflict[open]');
  assert.equal((await journal(delayed)).responses['v2/answer-check'].answer, 'subtract'); assert.match(await delayed.locator('#confirmation-cloud-local-preview').textContent(), /subtract/);
  check('a delayed initial cloud read cannot replace an answer edited while the connection is pending');
  await late.ctx.close();

  await select(page, answerQ.questionId); await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#settings-menu > summary').click(); await page.selectOption('#theme', 'dark'); await page.selectOption('#text-size', 'largest'); await page.locator('#settings-menu > summary').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  report.mobileLayout = await page.evaluate(() => ({ navBottom: document.querySelector('#question-nav').getBoundingClientRect().bottom,
    workspaceTop: document.querySelector('#workspace').getBoundingClientRect().top }));
  await page.screenshot({ path: evidence + '/' + engine + '-mobile.png', fullPage: true });
  assert.ok(report.mobileLayout.navBottom <= report.mobileLayout.workspaceTop + 1, 'mobile question list must not overlap the problem title');
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: evidence + '/' + engine + '-desktop.png', fullPage: true });
  check('390px dark theme and largest text retain the confirmation and cloud controls');
  assert.deepEqual(errors, []); check('nested bridges and all tested state transitions produce no unhandled browser errors'); report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.stack; report.browserErrors = errors;
  report.ui = await primaryPage?.evaluate(() => ({ question: document.querySelector('#question-id')?.textContent, notice: document.querySelector('#notice')?.textContent,
    cloud: document.querySelector('#cloud-inline-status')?.textContent, formal: document.querySelector('#formal-status')?.textContent, edited: document.querySelector('#formal-edited')?.textContent })).catch(() => null);
  await primaryPage?.screenshot({ path: evidence + '/' + engine + '-failure.png', fullPage: true }).catch(() => {}); throw error;
} finally {
  report.calls = calls.map(c => ({ context: c.context, mode: c.mode, action: c.action, requestId: c.input?.requestId, questionId: c.input?.questionId }));
  await writeFile(evidence + '/' + engine + '-report.json', JSON.stringify(report, null, 2));
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close(); await new Promise(resolve => server.server.close(resolve));
}
