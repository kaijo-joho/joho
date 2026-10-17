// 本人・GSS・Google RPCだけを合成し、実エディタ/Pyodide/GASと二重iframeで保存契機を検証する。
// 10分経過そのものはunitで検証する。このscriptは本来の600000ms設定を短縮しない。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createEditorServer } from './serve-pythoneditor.mjs';
import { setup } from './tools-store-gas/tests/store-fixture.mjs';
import { createCloudFixture, T0 } from '../tools/pythoneditor/tests/cloud-fixture.mjs';
import { validateDraft } from '../tools/pythoneditor/core.mjs';

const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const engine = process.env.PYTHONEDITOR_ENGINE || 'Chrome';
const evidence = process.env.PYTHONEDITOR_SAVE_EVENTS_EVIDENCE || '/private/tmp/pythoneditor-save-events-browser';
await mkdir(evidence, { recursive: true });
const server = await createEditorServer({ isolate: false }), origin = new URL(server.url).origin;
const account = 'student@example.invalid';
const store = setup({ confirmation: true, account, config: { allowedOrigins: [origin], allowedDomains: ['example.invalid'] } });
const formal = createCloudFixture(), C = formal.ctx.PythonEditorConfirmation;
const normalCode = '# start\nx = 2\nprint("value:", x)\n# end\n';
const sourceRef = { questionId: 'q1', version: 'v1' };
function extraCode(questionId, setId, order, title) {
  formal.freeze({ ...structuredClone(formal.snapBody), question: { ...structuredClone(formal.snapBody.question),
    questionId, version: 'v1', setId, order, title, prompt: '独自作成の合成検証用です。', templateCode: 'print("template")\n' },
    graded: false, ranges: [], rules: {} });
}
extraCode('q2', 'exercise', 2, '問2 別のプログラム');
extraCode('q3', 'extra', 1, '問1 別の問題セット');
const answerConfig = { format: 'choice', question: 'この動作を選んでください。', choices: [
  { id: 'double', label: '2倍する' }, { id: 'other', label: 'その他' }
] };
formal.freeze({ schema: 1, question: { questionId: 'check', version: 'v1', setId: 'exercise', order: 3,
  title: '問3 動作の確認', prompt: '独自作成の合成検証用です。', templateCode: '', setupCode: '', kind: 'confirmation',
  codeRefs: [sourceRef], checkType: 'answer', checkConfig: JSON.parse(JSON.stringify(C.publicCheck('answer', answerConfig))) },
  engineVersion: formal.ctx.PythonEditorGraderV1.engineVersion, gradingVersion: '', ranges: [], rules: {}, graded: false,
  confirmation: { codeRefs: [sourceRef], checkType: 'answer', checkConfig: JSON.parse(JSON.stringify(C.normalizeCheck('answer', answerConfig))) } });
formal.config.assignments.push({ ...formal.config.assignments[0], setId: 'extra', assignmentId: 'extra1' });
formal.ctx.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [T0])); } };
formal.ctx.PythonEditorService.environment = () => formal.env(account);
const catalog = formal.dispatch('session', {}, T0, formal.env(account)).catalog;
const connection = { account, actorKey: store.T.actorKey(account), binding: store.binding,
  spreadsheetId: 'synthetic_spreadsheet_identifier_0001', storeURL: 'https://script.google.com/macros/s/SAVE_EVENTS_STORE_SYNTHETIC/exec', schemaVersion: 1 };
const templates = { dist: await readFile(new URL('./tools-store-gas/dist/25_toolsStoreConnection.html', import.meta.url), 'utf8'),
  store: await readFile(new URL('./tools-store-gas/store/20_tools_store_bridge.html', import.meta.url), 'utf8'),
  formal: await readFile(new URL('./pythoneditor-gas/21_python_editor_bridge.html', import.meta.url), 'utf8') };
const realConfig = await readFile(new URL('../tools/pythoneditor/tools-store-config.mjs', import.meta.url), 'utf8');
// URLと接続フラグだけ合成経路に差し替える。autosaveの定数は現物をそのまま使う。
const testConfig = realConfig.replace('enabled: false', 'enabled: true').replace("distURL: ''", "distURL: 'https://script.google.com/macros/s/SAVE_EVENTS_DIST_SYNTHETIC/exec'");
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const calls = [], errors = [], downloads = [], extraContexts = [];
const fault = { offline: false, journalOffline: false, holdSave: false, release: null, arrived: null };
const report = { at: new Date().toISOString(), engine,
  environment: 'synthetic identity/GSS; real editor, Pyodide, GAS code and nested iframe bridges; unmodified 600000ms autosave intervals', checks: [] };
const check = name => { report.checks.push(name); console.log('PASS', name); };
await context.exposeBinding('__saveEventsRPC', async (_source, mode, action, input, binding, requestOrigin) => {
  calls.push({ mode, action, at: Date.now(), input: structuredClone(input) });
  if (mode === 'dist') return { ok: true, value: { ...connection, binding: store.issue() } };
  if (mode === 'store' && fault.offline) return { ok: false, error: { code: 'transport_failed', message: '合成の通信断' } };
  if (mode === 'store' && action.includes('Confirmation') && fault.journalOffline)
    return { ok: false, error: { code: 'transport_failed', message: '合成の確認記録だけの通信断' } };
  let result;
  if (mode === 'formal') result = formal.ctx.pythonEditorRpc(action, input, binding);
  else {
    try { result = { ok: true, value: structuredClone(store.call(action, input, binding, requestOrigin)) }; }
    catch (e) { result = { ok: false, error: { code: e.toolsStoreCode || 'service_unavailable', message: e.message } }; }
  }
  if (mode === 'store' && action === 'saveDraft' && fault.holdSave) {
    fault.holdSave = false; fault.arrived?.(); await new Promise(resolve => { fault.release = resolve; });
  }
  return result;
});
await context.route('**/__pythoneditor/catalog', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) }));
await context.route(/\/tools-store-config\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: testConfig }));
await context.route(/\/cloud-config\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript',
  body: "export const cloudConfig={enabled:true,bridgeURL:'https://script.google.com/macros/s/SAVE_EVENTS_FORMAL_SYNTHETIC/exec'};" }));
await context.route('https://script.google.com/**', route => {
  const url = new URL(route.request().url()), mode = url.pathname.includes('DIST_') ? 'dist' : url.pathname.includes('FORMAL_') ? 'formal' : 'store';
  return route.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe src="https://n-save-events-fixture-0lu-script.googleusercontent.com/${mode}?${url.searchParams}"></iframe>` });
});
await context.route('https://n-save-events-fixture-0lu-script.googleusercontent.com/**', route => {
  const url = new URL(route.request().url()), mode = url.pathname.slice(1);
  const boot = { protocol: 'tools-store-rpc-v1', origin: url.searchParams.get('origin'), channel: url.searchParams.get('channel') };
  const shim = `<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{getToolsStoreConnectionV1(input){window.__saveEventsRPC('dist','session',input).then(success,failure);},toolsStoreRpc(action,input,binding,origin){window.__saveEventsRPC('store',action,input,binding,origin).then(success,failure);},pythonEditorRpc(action,input,key){window.__saveEventsRPC('formal',action,input,key).then(success,failure);}};}};}}}};</script>`;
  return route.fulfill({ contentType: 'text/html', body: templates[mode].replace(/<\?!= (?:toolsStoreBootJson|bootJson) \?>/, JSON.stringify(boot)).replace('<script>', shim + '<script>') });
});
context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
const page = await context.newPage();
page.on('download', download => downloads.push(download));
let activePage = page;
const edit = (value, p = page) => p.evaluate(value => document.querySelector('.CodeMirror').CodeMirror.setValue(value), value);
const code = () => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
const journal = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')) || { schema: 1, trials: [], responses: {} });
const writes = () => calls.filter(c => c.mode === 'store' && ['saveDraft', 'beginConfirmationSave', 'putConfirmationChunk', 'saveConfirmationJournal'].includes(c.action));
const saveCalls = qid => calls.filter(c => c.mode === 'store' && c.action === 'saveDraft' && (!qid || c.input.questionId === qid));
const remote = qid => store.call('getDraft', { tool: 'python', questionId: qid, version: 'v1' }, store.issue()).draft;
async function remoteJournal() {
  const manifest = store.call('getConfirmationJournal', { tool: 'python' }, store.issue());
  if (manifest.revision === null) return manifest.journal;
  try {
    let text = '';
    for (let index = 0; index < manifest.chunkCount; index++) text += store.call('getConfirmationJournalChunk', { tool: 'python', revision: manifest.revision, readId: manifest.readId, index }, store.issue()).text;
    return JSON.parse(text);
  } finally { store.call('releaseConfirmationRead', { tool: 'python', revision: manifest.revision, readId: manifest.readId }, store.issue()); }
}
async function menu(id, p = page) { await p.keyboard.press('Escape'); await p.locator('#file-menu > summary').click(); await p.locator('#' + id).click(); }
async function select(qid) {
  await page.keyboard.press('Escape'); await page.locator(`#question-list button[data-question="${qid}"]`).click();
  await page.waitForFunction(qid => document.querySelector('#question-id').textContent === qid, qid);
}
async function selectSet(setId) {
  await page.keyboard.press('Escape'); await page.locator('#set-trigger').click(); await page.locator(`#set-menu button[data-set="${setId}"]`).click();
}
async function saved() { await page.waitForFunction(() => document.querySelector('#cloud-inline-status').textContent === 'クラウドに保存済み'); }
async function run() {
  const count = (await journal()).trials.length; await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 125000 });
  await page.waitForFunction(count => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2'))?.trials.length > count, count);
}
async function downloaded(action, p = page) {
  const next = p.waitForEvent('download'); await action(); const result = await next;
  const path = await result.path(); assert.ok(path); const raw = JSON.parse(await readFile(path, 'utf8'));
  validateDraft(raw); return raw;
}
async function waitFor(predicate, message, timeout = 6000) {
  const started = Date.now();
  while (!await predicate()) { if (Date.now() - started > timeout) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 30)); }
}
async function localOnlyPage({ seed = null, quota = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); extraContexts.push(ctx);
  await ctx.addInitScript(({ origin, seed, quota }) => {
    if (location.origin !== origin) return;
    if (seed) localStorage.setItem('joho.pythoneditor.confirmations.v2', JSON.stringify(seed));
    if (quota) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'joho.pythoneditor.confirmations.v2') throw new DOMException('Synthetic journal quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }
  }, { origin, seed, quota });
  await ctx.route('**/__pythoneditor/catalog', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) }));
  await ctx.route(/\/tools-store-config\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: realConfig }));
  await ctx.route(/\/cloud-config\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const cloudConfig={enabled:false,bridgeURL:""};' }));
  await ctx.route('https://script.google.com/**', route => { errors.push('local-only fixture attempted a Google RPC'); return route.fulfill({ status: 503, body: 'Synthetic blocked external call' }); });
  ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  const p = await ctx.newPage(); p.on('download', download => downloads.push(download));
  await p.goto(server.url + '?set=exercise&question=q1&version=v1'); await p.waitForSelector('#question-list button');
  return { ctx, page: p };
}
try {
  await page.goto(server.url + '?set=exercise&question=q1&version=v1'); await page.waitForSelector('#question-list button');
  report.autosave = await page.evaluate(async () => (await import('/tools/pythoneditor/tools-store-config.mjs')).toolsStoreConfig.autosave);
  assert.equal(report.autosave.idleMs, 600000); assert.equal(report.autosave.maxWaitMs, 600000);
  await page.locator('#cloud-connect').click();
  await page.waitForFunction(account => document.querySelector('#cloud-account').textContent.includes(account) && !document.querySelector('#cloud-connect').disabled, account);
  await page.keyboard.press('Escape');
  const beforeEdits = writes().length;
  for (const suffix of ['# one', '# two', '# three']) { await edit(normalCode + suffix + '\n'); await page.waitForTimeout(100); }
  const oldQ1 = normalCode + '# three\n';
  await page.waitForTimeout(8000);
  assert.equal(writes().length, beforeEdits); assert.equal(remote('q1'), null);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('joho.pythoneditor.v1.auto.v1/q1'))?.entry.code), oldQ1);
  check('the real 10-minute configuration keeps rapid edits in the browser without per-edit GSS writes');

  const arrived = new Promise(resolve => { fault.arrived = resolve; }); fault.holdSave = true;
  await select('q2'); await arrived;
  assert.equal(await page.locator('#question-id').textContent(), 'q2'); assert.equal(await code(), 'print("template")\n');
  assert.equal(saveCalls('q1').at(-1).input.code, oldQ1);
  const q2Code = 'print("second question")\n'; await edit(q2Code); fault.release();
  await waitFor(() => remote('q1')?.code === oldQ1, 'old question did not save after switching');
  assert.equal(remote('q2'), null);
  check('question navigation remains responsive while its exact previous-question snapshot is saved');

  await menu('save-cloud'); await saved();
  assert.equal(remote('q2').code, q2Code); assert.equal(remote('q1').code, oldQ1);
  await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled);
  // A second edit starts after the navigation flush is fully settled. Its save
  // therefore proves the manual priority rather than merely joining that flush.
  const manualCode = q2Code + '# explicit manual save\n', beforeManual = saveCalls('q2').length;
  await edit(manualCode); assert.equal(remote('q2').code, q2Code);
  const manualStart = Date.now(); await menu('save-cloud'); await saved();
  assert.equal(remote('q2').code, manualCode); assert.equal(saveCalls('q2').length, beforeManual + 1);
  report.prioritySaveMs = Date.now() - manualStart; assert.ok(report.prioritySaveMs < 6000);
  const unchangedWrites = writes().length, dataWrites = store.data.writes.length, historyWrites = store.history.writes.length;
  await menu('save-cloud'); await saved(); await menu('save-cloud'); await saved();
  assert.equal(writes().length, unchangedWrites); assert.equal(store.data.writes.length, dataWrites); assert.equal(store.history.writes.length, historyWrites);
  check('manual saving bypasses the 20-second interval and unchanged repeat clicks create no extra cloud writes');

  const q2Changed = 'print("saved on set change")\n'; await edit(q2Changed); await selectSet('extra');
  await page.waitForFunction(() => document.querySelector('#question-id').textContent === 'q3');
  await waitFor(() => remote('q2')?.code === q2Changed, 'set change did not save the prior question');
  assert.equal(remote('q3'), null);
  const q3Code = 'print("other set continuation")\n'; await edit(q3Code); await selectSet('exercise');
  await waitFor(() => remote('q3')?.code === q3Code, 'leaving the other set did not save its code');
  check('set selection flushes the old set and does not save the untouched destination template');

  await select('q1'); await edit(normalCode); await run();
  const beforeConfirmSwitch = (await journal()).trials[0]; await select('check');
  await waitFor(async () => (await remoteJournal()).trials.some(t => t.id === beforeConfirmSwitch.id), 'question change did not save its new trial');
  await saved();
  await page.locator('#confirmation-answer').selectOption('double'); await page.locator('#confirmation-answer-save').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).responses['v1/check']?.answer === 'double');
  const beforeAnswerFlush = writes().length; await page.waitForTimeout(500); assert.equal(writes().length, beforeAnswerFlush);
  await menu('save-cloud'); await saved(); assert.equal((await remoteJournal()).responses['v1/check'].answer, 'double');
  check('question switching flushes recorded Pyodide trials and a manual save flushes the recorded confirmation answer');

  await select('q1'); const submitCode = normalCode + '# submit boundary\n'; await edit(submitCode);
  const submitStart = calls.length; await page.locator('#formal-submit').click(); await page.waitForSelector('#submit-dialog[open]');
  assert.equal(await page.locator('#submit-preview').textContent(), submitCode);
  const submitSaveArrived = new Promise(resolve => { fault.arrived = resolve; }); fault.holdSave = true;
  await page.locator('#submit-confirm').click(); await submitSaveArrived;
  await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled, null, { timeout: 6000 });
  assert.match(await page.locator('#formal-status').textContent(), /提出済み/);
  const submittedCalls = calls.slice(submitStart);
  assert.ok(submittedCalls.some(c => c.action === 'saveDraft' && c.input.code === submitCode));
  assert.equal(submittedCalls.find(c => c.mode === 'formal' && c.action === 'submit').input.code, submitCode);
  fault.release(); await saved(); assert.equal(remote('q1').code, submitCode);
  check('official submission immediately prioritizes the latest draft while a delayed draft acknowledgment does not delay formal receipt');

  await select('check'); await page.locator('#confirmation-answer').selectOption('other');
  const downloadCount = downloads.length; await menu('finish-work'); await page.waitForSelector('#finish-dialog[open]');
  await page.locator('#finish-save').click();
  await page.waitForFunction(() => document.querySelector('#finish-status').textContent.includes('回答を記録'));
  assert.equal(await page.locator('#finish-status').evaluate(el => el.classList.contains('danger')), true);
  assert.equal(downloads.length, downloadCount); assert.equal((await journal()).responses['v1/check'].answer, 'double');
  assert.equal(await page.locator('#finish-dialog').isVisible(), true);
  await page.keyboard.press('Escape'); await page.locator('#confirmation-answer-save').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).responses['v1/check'].answer === 'other');
  check('finishing with an unrecorded answer is blocked without downloading or replacing the recorded answer');

  await select('q1'); const finishCode = 'print("before finish")\nwhile True:\n    pass\n'; await edit(finishCode);
  await page.locator('#run').click(); await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'stop');
  await page.waitForTimeout(100); await menu('finish-work'); await page.waitForSelector('#finish-dialog[open]');
  const completed = await downloaded(() => page.locator('#finish-save').click());
  await page.waitForFunction(() => !document.querySelector('#finish-save').disabled);
  report.finishSuccess = await page.locator('#finish-status').textContent();
  assert.equal(await page.locator('#finish-status').evaluate(el => el.classList.contains('danger')), false);
  assert.equal(completed.entries.find(e => e.questionId === 'q1').code, finishCode);
  assert.equal(completed.confirmationJournal.responses['v1/check'].answer, 'other');
  assert.equal(completed.confirmationJournal.trials.at(-1).outcome, 'stopped');
  assert.equal(completed.confirmationJournal.trials.at(-1).code, finishCode);
  assert.equal(await page.locator('#run').getAttribute('data-state'), 'run');
  assert.equal(remote('q1').code, finishCode); assert.deepEqual(await remoteJournal(), completed.confirmationJournal);
  assert.match(report.finishSuccess, /(?:終了|閉じ)/); assert.equal(page.isClosed(), false);
  await writeFile(evidence + '/' + engine + '-completed.json', JSON.stringify(completed, null, 2));
  check('save-and-finish stops an active program, includes its final journal in JSON and confirms both cloud stores without closing the tab');

  await page.keyboard.press('Escape'); const shortcutFile = await downloaded(() => page.keyboard.press('Meta+s'));
  assert.equal(shortcutFile.entries.find(e => e.questionId === 'q1').code, finishCode);
  assert.deepEqual(shortcutFile.confirmationJournal, completed.confirmationJournal);
  check('Command-S downloads a reusable JSON file containing code and recorded trials');

  await page.keyboard.press('Escape'); const offlineCode = 'print("local file survives cloud failure")\n'; await edit(offlineCode); fault.offline = true;
  await menu('finish-work'); await page.waitForSelector('#finish-dialog[open]');
  const failedCloudFile = await downloaded(() => page.locator('#finish-save').click());
  await page.waitForFunction(() => !document.querySelector('#finish-save').disabled);
  report.finishFailure = await page.locator('#finish-status').textContent();
  assert.equal(await page.locator('#finish-status').evaluate(el => el.classList.contains('danger')), true);
  assert.equal(failedCloudFile.entries.find(e => e.questionId === 'q1').code, offlineCode); assert.equal(remote('q1').code, finishCode);
  assert.match(report.finishFailure, /(?:通信|失敗|未保存|確認でき|できません)/); assert.notEqual(report.finishFailure, report.finishSuccess);
  assert.equal(await page.locator('#finish-dialog').isVisible(), true);
  await writeFile(evidence + '/' + engine + '-cloud-failed-local-file.json', JSON.stringify(failedCloudFile, null, 2));
  check('a failed cloud finish retains the downloaded local JSON and does not report the successful cloud-finish state');

  fault.offline = false; await downloaded(() => page.locator('#finish-save').click());
  await page.waitForFunction(() => !document.querySelector('#finish-save').disabled); assert.equal(remote('q1').code, offlineCode);
  await page.keyboard.press('Escape'); await edit(normalCode + '# finish answer race\n');
  const answerRaceArrival = new Promise(resolve => { fault.arrived = resolve; }); fault.holdSave = true;
  await menu('finish-work'); await page.waitForSelector('#finish-dialog[open]');
  const answerRaceFile = await downloaded(() => page.locator('#finish-save').click()); await answerRaceArrival;
  await page.keyboard.press('Escape'); await select('check'); await page.locator('#confirmation-answer').selectOption('double');
  fault.release();
  await page.waitForFunction(() => !document.querySelector('#finish-save').disabled && document.querySelector('#finish-status').classList.contains('danger'));
  report.finishAnswerRace = await page.locator('#finish-status').textContent();
  assert.match(report.finishAnswerRace, /作業が再開|もう一度/); assert.match(report.finishAnswerRace, /ダウンロード.*開始済み/);
  assert.doesNotMatch(report.finishAnswerRace, /このタブを閉じてください/);
  assert.equal(answerRaceFile.confirmationJournal.responses['v1/check'].answer, 'other');
  assert.equal(await page.locator('#confirmation-answer').inputValue(), 'double');
  await page.locator('#confirmation-answer-save').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).responses['v1/check'].answer === 'double');
  await menu('save-cloud'); await saved();
  check('an unrecorded answer entered after dismissing an in-flight finish invalidates the older finish snapshot');

  await select('q1'); const raceRunCode = 'while True:\n    pass\n'; await edit(raceRunCode);
  const runRaceArrival = new Promise(resolve => { fault.arrived = resolve; }); fault.holdSave = true;
  await menu('finish-work'); await page.waitForSelector('#finish-dialog[open]');
  const runRaceFile = await downloaded(() => page.locator('#finish-save').click()); await runRaceArrival;
  await page.keyboard.press('Escape'); await page.locator('#run').click(); await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'stop');
  fault.release();
  await page.waitForFunction(() => !document.querySelector('#finish-save').disabled && document.querySelector('#finish-status').classList.contains('danger'));
  report.finishRunRace = await page.locator('#finish-status').textContent();
  assert.match(report.finishRunRace, /作業が再開|もう一度/); assert.match(report.finishRunRace, /ダウンロード.*開始済み/);
  assert.doesNotMatch(report.finishRunRace, /このタブを閉じてください/);
  assert.equal(await page.locator('#run').getAttribute('data-state'), 'stop');
  assert.equal(runRaceFile.confirmationJournal.trials.some(t => t.code === raceRunCode), false);
  const trialCountBeforeStop = (await journal()).trials.length; await page.locator('#run').click();
  await page.waitForFunction(count => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).trials.length > count, trialCountBeforeStop);
  await page.keyboard.press('Escape'); await menu('save-cloud'); await saved();
  check('a new active run begun after dismissing an in-flight finish requires a new file even when the code is unchanged');

  await select('check'); await page.locator('#confirmation-answer').selectOption('other'); await page.locator('#confirmation-answer-save').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('joho.pythoneditor.confirmations.v2')).responses['v1/check'].answer === 'other');
  fault.journalOffline = true; const journalFailureCalls = calls.length;
  await menu('finish-work'); await page.waitForSelector('#finish-dialog[open]');
  const journalFailureFile = await downloaded(() => page.locator('#finish-save').click());
  await page.waitForFunction(() => !document.querySelector('#finish-save').disabled);
  report.finishJournalFailure = await page.locator('#finish-status').textContent();
  assert.equal(await page.locator('#finish-status').evaluate(el => el.classList.contains('danger')), true);
  assert.match(report.finishJournalFailure, /^ファイルのダウンロードは開始済みです。/); assert.match(report.finishJournalFailure, /確認記録だけの通信断/);
  assert.equal(journalFailureFile.confirmationJournal.responses['v1/check'].answer, 'other');
  assert.equal((await remoteJournal()).responses['v1/check'].answer, 'double');
  assert.equal(calls.slice(journalFailureCalls).some(c => c.action === 'saveDraft'), false);
  fault.journalOffline = false; await downloaded(() => page.locator('#finish-save').click());
  await page.waitForFunction(() => !document.querySelector('#finish-save').disabled); assert.equal((await remoteJournal()).responses['v1/check'].answer, 'other');
  check('a confirmation-journal-only exception preserves the explicit download-started message and the complete local file');

  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#settings-menu > summary').click(); await page.selectOption('#theme', 'dark'); await page.selectOption('#text-size', 'largest'); await page.keyboard.press('Escape');
  await page.locator('#file-menu > summary').focus(); await page.keyboard.press('Enter'); await page.locator('#finish-work').focus(); await page.keyboard.press('Enter');
  await page.waitForSelector('#finish-dialog[open]');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  const buttonBox = await page.locator('#finish-save').boundingBox(); assert.ok(buttonBox && buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= 391 && buttonBox.height >= 44);
  await page.screenshot({ path: evidence + '/' + engine + '-finish-mobile.png', fullPage: true });
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#finish-dialog').isVisible(), false);
  assert.ok(await page.evaluate(() => { const el = document.activeElement, box = el?.getBoundingClientRect(); return el && el !== document.body && box.width > 0 && box.height > 0; }));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: evidence + '/' + engine + '-desktop.png', fullPage: true });
  check('390px dark/largest controls fit, keyboard opens the finish dialog and Escape returns focus to a visible control');

  const seedTrial = completed.confirmationJournal.trials[0];
  const fullJournal = { schema: 1, responses: {}, trials: Array.from({ length: 1000 }, (_, index) => ({ ...structuredClone(seedTrial),
    id: 'limit-trial-' + index, at: new Date(Date.parse(seedTrial.at) + index).toISOString() })) };
  validateDraft({ app: 'kaijo-python-editor', version: 1, entries: [], confirmationJournal: fullJournal });
  const limited = await localOnlyPage({ seed: fullJournal }), limitedPage = activePage = limited.page;
  const rejectedCode = 'print("trial beyond the limit")\n'; await edit(rejectedCode, limitedPage);
  await limitedPage.locator('#run').click();
  await limitedPage.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 125000 });
  await limitedPage.waitForFunction(() => document.querySelector('#notice').textContent.includes('試行記録を保存できません'));
  assert.equal((await journal(limitedPage)).trials.length, 1000);
  await menu('finish-work', limitedPage); await limitedPage.waitForSelector('#finish-dialog[open]');
  const limitedFile = await downloaded(() => limitedPage.locator('#finish-save').click(), limitedPage);
  await limitedPage.waitForFunction(() => !document.querySelector('#finish-save').disabled);
  report.finishRecordLimit = await limitedPage.locator('#finish-status').textContent();
  assert.equal(await limitedPage.locator('#finish-status').evaluate(el => el.classList.contains('danger')), true);
  assert.match(report.finishRecordLimit, /試行記録を追加できていません/); assert.match(report.finishRecordLimit, /画面を閉じず/);
  assert.match(report.finishRecordLimit, /^ファイルのダウンロードは開始済みです。/);
  assert.doesNotMatch(report.finishRecordLimit, /このタブを閉じてください/);
  assert.equal(limitedFile.confirmationJournal.trials.length, 1000); assert.equal(limitedFile.entries.find(e => e.questionId === 'q1').code, rejectedCode);
  await writeFile(evidence + '/' + engine + '-journal-limit-backup.json', JSON.stringify(limitedFile, null, 2));
  check('a real 1000-trial journal rejects the next record and allows a backup without claiming all trials were saved or finishing safely');
  await limited.ctx.close();

  const ram = await localOnlyPage({ quota: true }), ramPage = activePage = ram.page;
  const ramCode = 'print("complete RAM-only trial")\n'; await edit(ramCode, ramPage); await ramPage.locator('#run').click();
  await ramPage.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 125000 });
  await ramPage.waitForFunction(() => /Synthetic journal quota|ブラウザ/.test(document.querySelector('#notice').textContent));
  assert.equal((await journal(ramPage)).trials.length, 0);
  await menu('finish-work', ramPage); await ramPage.waitForSelector('#finish-dialog[open]');
  const ramFile = await downloaded(() => ramPage.locator('#finish-save').click(), ramPage);
  await ramPage.waitForFunction(() => !document.querySelector('#finish-save').disabled);
  report.finishRAM = await ramPage.locator('#finish-status').textContent();
  assert.equal(await ramPage.locator('#finish-status').evaluate(el => el.classList.contains('danger')), false);
  assert.match(report.finishRAM, /クラウドは未接続/); assert.doesNotMatch(report.finishRAM, /試行記録を追加できていません/);
  assert.equal(ramFile.confirmationJournal.trials.length, 1); assert.equal(ramFile.confirmationJournal.trials[0].code, ramCode);
  assert.equal(ramFile.confirmationJournal.trials[0].stdout, 'complete RAM-only trial\n');
  await writeFile(evidence + '/' + engine + '-ram-complete.json', JSON.stringify(ramFile, null, 2));
  check('browser journal quota failure does not misclassify a complete RAM-held trial that is present in the downloaded JSON');
  await ram.ctx.close(); activePage = page;
  assert.deepEqual(errors, []); check('all synthetic nested bridges and save-event transitions produce no unhandled browser errors');
  report.passed = true;
} catch (e) {
  report.passed = false; report.error = e.stack;
  report.ui = await activePage.evaluate(() => ({ question: document.querySelector('#question-id')?.textContent, notice: document.querySelector('#notice')?.textContent,
    cloud: document.querySelector('#cloud-inline-status')?.textContent, finish: document.querySelector('#finish-status')?.textContent,
    active: document.activeElement?.id })).catch(() => null);
  await activePage.screenshot({ path: evidence + '/' + engine + '-failure.png', fullPage: true }).catch(() => {}); throw e;
} finally {
  report.browserErrors = errors; report.downloads = downloads.map(d => d.suggestedFilename());
  report.calls = calls.map(c => ({ mode: c.mode, action: c.action, at: c.at, questionId: c.input?.questionId, requestId: c.input?.requestId }));
  await writeFile(evidence + '/' + engine + '-report.json', JSON.stringify(report, null, 2));
  fault.release?.(); for (const ctx of extraContexts) await ctx.close().catch(() => {});
  await browser.close(); await new Promise(resolve => server.server.close(resolve));
}
