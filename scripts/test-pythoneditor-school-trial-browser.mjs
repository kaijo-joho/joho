// Googleの本人・GSS・ネットワークだけを合成。実UI・保存scheduler・70/50・保存GAS・ブリッジを結合する。
// Pyodide実行と実アカウントへの接続は含めず、外部リクエストはすべてこのfixture内で遮断する。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { trialApiFixture, OWNER, SECOND, DEMO, FOURTH, plain } from './pythoneditor-trial-gas/tests/trial-api-fixture.mjs';

const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const engine = process.env.PYTHONEDITOR_ENGINE || 'Chrome';
const evidence = process.env.PYTHONEDITOR_TRIAL_EVIDENCE || '/private/tmp/pythoneditor-school-trial-browser';
await mkdir(evidence, { recursive: true });
const origin = 'https://python-trial.example.test', fixture = trialApiFixture({ origin, setId: 'trial-fixture' });
const trialTemplate = await readFile(new URL('./pythoneditor-trial-gas/23_school_trial_bridge.html', import.meta.url), 'utf8');
const previewOriginal = await readFile(new URL('./pythoneditor-gas/21_python_editor_bridge.html', import.meta.url), 'utf8');
const previewTemplate = previewOriginal.replace(/const actions = new Set\(\[[^;]+\]\);/, "const actions = new Set(['session']);")
  .replace('.pythonEditorRpc(data.action,data.input || {},data.actorKey)', '.teacherPythonPreviewRpc(data.action,data.input || {},data.actorKey,boot.origin)');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const report = { at: new Date().toISOString(), engine, environment: 'synthetic identity/GSS; real trial/store GAS, browser UI, local evaluator and nested bridges; no Pyodide or live network', checks: [] };
const calls = [], requests = [], errors = [], contexts = [], outside = [];
const check = name => { report.checks.push(name); console.log('PASS', name); };
// 乱数を含む場合の出力条件passed:nullも、object変換で落とさず送信・受信する。
const fullCode = fixture.submission().code + '\nimport random\n';
const initial = plain(fixture.session(OWNER));
const source = initial.catalog.sets.flatMap(set => set.questions).find(q => q.questionId === 'q1' && q.version === 'v1');
const confirmation = initial.catalog.sets.flatMap(set => set.questions).find(q => q.kind === 'confirmation');
assert.ok(source && confirmation, 'fixture requires a code question and an ungraded confirmation');
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const url = mode => `${origin}/tools/pythoneditor/${mode ? '?mode=' + mode + '&set=' + source.setId + '&question=' + source.questionId + '&version=' + source.version : ''}`;
const qButton = (page, q) => page.locator(`#question-list button[data-key="${q.version}/${q.questionId}"]`);
const getCode = page => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
const edit = (page, code) => page.evaluate(value => document.querySelector('.CodeMirror').CodeMirror.setValue(value), code);
const waitIdle = page => page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled);
const saved = page => page.waitForFunction(() => document.querySelector('#cloud-inline-status').textContent === 'クラウドに保存済み');
async function menu(page, id) { await page.locator('#file-menu > summary').click(); await page.locator('#' + id).click(); }
async function connect(page, account) {
  await page.locator('#cloud-connect').click();
  await page.waitForFunction(account => document.querySelector('#cloud-account').textContent.includes(account) && !document.querySelector('#cloud-connect').disabled, account);
  await page.waitForFunction(q => document.querySelector('#question-id').textContent === q.questionId && document.querySelector('#version').textContent === q.version, source);
}
function storeCall(account, action, input) {
  fixture.select(account); const connection = fixture.session().store.connection;
  return plain(fixture.call('store', { binding: connection.binding, action, input }, connection.actorKey, origin));
}
async function remoteJournal(account) {
  const manifest = storeCall(account, 'getConfirmationJournal', { tool: 'python' }); if (manifest.revision === null) return manifest.journal;
  try {
    let text = ''; for (let index = 0; index < manifest.chunkCount; index++) text += storeCall(account, 'getConfirmationJournalChunk', { tool: 'python', revision: manifest.revision, readId: manifest.readId, index }).text;
    return JSON.parse(text);
  } finally { storeCall(account, 'releaseConfirmationRead', { tool: 'python', revision: manifest.revision, readId: manifest.readId }); }
}
async function context(account, mode = 'school-trial') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); contexts.push(ctx);
  const fault = { loseSubmit: false, offline: false, denied: false };
  await ctx.exposeBinding('__schoolTrialRPC', async (_source, kind, action, input, key, requestOrigin) => {
    let raw;
    if (kind === 'trial') { raw = action; ({ action, input, expectedActorKey: key, origin: requestOrigin } = JSON.parse(raw)); }
    const envelope = value => kind === 'trial' ? JSON.stringify(value) : value;
    calls.push({ account, kind, action, input: structuredClone(input) });
    if (fault.offline) return envelope({ ok: false, error: { code: 'transport_failed', message: '合成の通信断です。送信控えは保持しています。' } });
    fixture.select(fault.denied ? FOURTH : account);
    const result = kind === 'preview' ? plain(fixture.context.teacherPythonPreviewRpc(action, input, key, requestOrigin)) : fixture.context.schoolPythonTrialJsonRpc(raw);
    if (kind === 'trial' && action === 'submit' && fault.loseSubmit) { fault.loseSubmit = false; return envelope({ ok: false, error: { code: 'transport_failed', message: '合成の応答消失です。同じ番号で照会してください。' } }); }
    return result;
  });
  await ctx.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url()); requests.push({ account, mode, url: u.href });
    if (u.origin === origin) {
      if (u.pathname === '/__pythoneditor/catalog') return route.fulfill({ status: 404, body: 'Not Found' });
      if (u.pathname.endsWith('/trial-config.mjs')) return route.fulfill({ contentType: 'text/javascript', body: "export const trialConfig={enabled:true,bridgeURL:'https://script.google.com/macros/s/synthetic_school_trial_only/exec'};" });
      if (u.pathname.endsWith('/teacher-preview-config.mjs')) return route.fulfill({ contentType: 'text/javascript', body: "export const teacherPreviewConfig={enabled:true,bridgeURL:'https://script.google.com/macros/s/synthetic_preview_only/exec'};" });
      let path = u.pathname; if (path.endsWith('/')) path += 'index.html';
      if (!['/tools/pythoneditor/', '/tools/shared/', '/tools/htmleditor/vendor/'].some(prefix => path.startsWith(prefix))) return route.fulfill({ status: 404, body: 'Not Found' });
      try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(new URL('../' + path.slice(1), import.meta.url)) }); }
      catch { return route.fulfill({ status: 404, body: 'Not Found' }); }
    }
    if (u.origin === 'https://script.google.com') {
      const kind = u.pathname.includes('synthetic_preview') ? 'preview' : 'trial';
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe src="https://n-school-trial-fixture-0lu-script.googleusercontent.com/${kind}?${u.searchParams}"></iframe>` });
    }
    if (u.origin === 'https://n-school-trial-fixture-0lu-script.googleusercontent.com') {
      const kind = u.pathname.slice(1), boot = { protocol: kind === 'trial' ? 'python-editor-trial-rpc-v1' : 'python-editor-rpc-v1', origin: u.searchParams.get('origin'), channel: u.searchParams.get('channel') };
      // object内のnullプロパティを落とす合成Google transport。JSON文字列はそのまま通る。
      const shim = `<script>const googleTransport=v=>Array.isArray(v)?v.map(googleTransport):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null).map(([k,x])=>[k,googleTransport(x)])):v;window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{schoolPythonTrialJsonRpc(raw){window.__schoolTrialRPC('trial',googleTransport(raw)).then(v=>success(googleTransport(v)),failure);},teacherPythonPreviewRpc(action,input,key,origin){window.__schoolTrialRPC('preview',action,input,key,origin).then(success,failure);}};}};}}}};</script>`;
      const template = kind === 'trial' ? trialTemplate : previewTemplate;
      return route.fulfill({ contentType: 'text/html', body: template.replace('<?!= bootJson ?>', JSON.stringify(boot)).replace('<script>', shim + '<script>') });
    }
    outside.push(u.href); return route.abort('blockedbyclient');
  });
  ctx.on('page', page => page.on('pageerror', error => errors.push({ account, mode, message: error.message })));
  return { ctx, fault };
}
let currentPage;
const expected = new Map();
try {
  for (const [account, role] of [[OWNER, '教員試用'], [SECOND, '教員試用'], [DEMO, '生徒権限試用']]) {
    const { ctx, fault } = await context(account), page = currentPage = await ctx.newPage();
    await page.goto(url('school-trial')); await page.waitForSelector('#question-list button'); await connect(page, account);
    assert.match(await page.locator('#cloud-account').textContent(), new RegExp(role));
    const code = `${fullCode}\n# ${role} 保存fixture\n`; expected.set(account, code); const before = calls.filter(c => c.account === account && c.action === 'store' && c.input.action === 'saveDraft').length;
    await edit(page, code); await page.waitForTimeout(250);
    assert.equal(calls.filter(c => c.account === account && c.action === 'store' && c.input.action === 'saveDraft').length, before, 'ordinary typing must not cause short-period cloud saves');
    await menu(page, 'save-cloud'); await saved(page);
    assert.equal(storeCall(account, 'getDraft', { tool: 'python', questionId: source.questionId, version: source.version }).draft.code, code);
    check(`${role}: authenticated actor stores code through actual school-trial/store GAS; typing alone does not send`);

    await page.evaluate(async ({ ref, code }) => {
      const { ConfirmationStore, CONFIRMATION_STORAGE_KEY } = await import('/tools/pythoneditor/confirmation-store.mjs?v=20261017-confirmation-sync1');
      const store = new ConfirmationStore(); await store.record({ source: ref, code, inputs: [{ prompt: '値: ', value: '7' }], stdout: '7\n', stderr: '', outcome: 'success', truncated: false });
      dispatchEvent(new StorageEvent('storage', { key: CONFIRMATION_STORAGE_KEY }));
    }, { ref: { questionId: source.questionId, version: source.version }, code });
    await qButton(page, confirmation).click(); await page.waitForFunction(() => document.querySelector('#confirmation-progress').textContent.includes('1/1'));
    await menu(page, 'save-cloud'); await saved(page); const journal = await remoteJournal(account);
    assert.equal(journal.trials.length, 1); assert.equal(journal.trials[0].inputs[0].value, '7'); assert.equal(await page.locator('#formal-submit').isDisabled(), true);
    assert.match(await page.locator('#formal-note').textContent(), /未設定/); check(`${role}: confirmation journal persists and ungraded confirmation stays unsubmittable`);

    await qButton(page, source).click(); await waitIdle(page);
    const priorStars = await qButton(page, source).locator('.question-item-rating').textContent(); assert.match(priorStars, /試用評価/); assert.ok(!priorStars.includes('★'));
    await page.locator('#formal-submit').click(); await page.waitForSelector('#submit-dialog[open]');
    const preview = JSON.parse(await page.locator('#submit-preview').textContent()); assert.equal(preview.code, code); assert.equal(preview.assessment.starEarned, 1); assert.equal(preview.run.outcome, 'not_run');
    assert.ok(preview.assessment.checks.some(check => check.passed === null && check.eligible === false));
    assert.match(await page.locator('#submit-description').textContent(), /本番成績へ反映しません/); assert.equal(await qButton(page, source).locator('.question-item-rating').textContent(), priorStars);
    await page.locator('#submit-confirm').click(); await waitIdle(page); await page.waitForFunction(() => document.querySelector('#formal-status').textContent === '試用提出済み');
    assert.match(await page.locator('#formal-score').textContent(), /試用評価/); assert.match(await qButton(page, source).locator('.question-item-rating').textContent(), /試用評価.*★/);
    assert.match(await page.locator('#formal-checks').textContent(), /今回は点数の対象外/);
    assert.match(await page.locator('#set-current-rating').textContent(), /試用評価.*★1\/1/); assert.match(await page.locator('#rating-note').textContent(), /試用評価/); check(`${role}: reviewed local report updates only received trial stars and history`);

    fixture.advance(1000); await edit(page, code + '# 再提出\n'); expected.set(account, code + '# 再提出\n'); fault.loseSubmit = true;
    await page.locator('#formal-submit').click(); await page.waitForSelector('#submit-dialog[open]'); await page.locator('#submit-confirm').click(); await waitIdle(page);
    await page.waitForFunction(() => document.querySelector('#formal-status').textContent.includes('完了未確認'));
    const pending = calls.filter(c => c.account === account && c.action === 'submit').at(-1).input;
    if (!await page.locator('#status-menu').evaluate(element => element.open)) await page.locator('#status-menu > summary').click();
    await page.locator('#formal-query').click(); await waitIdle(page); await page.waitForFunction(() => document.querySelector('#formal-status').textContent === '試用提出済み');
    assert.equal(calls.filter(c => c.account === account && c.action === 'submit' && c.input.requestId === pending.requestId).length, 1);
    assert.ok(calls.some(c => c.account === account && c.action === 'lookup' && c.input.requestId === pending.requestId));
    assert.equal(await page.locator('#formal-history li').count(), 2); check(`${role}: lost response recovers the same request by lookup with two immutable history records`);
    const downloadEvent = page.waitForEvent('download'); await page.keyboard.press('Meta+s'); const download = await downloadEvent;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8')); assert.ok(exported.entries.some(entry => entry.questionId === source.questionId && entry.code === expected.get(account)));
    assert.equal(exported.confirmationJournal.trials.length, 1); await saved(page); check(`${role}: Cmd-S exports an editable file and flushes code and trial records`);
    await page.screenshot({ path: `${evidence}/${engine}-${role === '教員試用' ? account === OWNER ? 'owner' : 'teacher2' : 'demo'}.png` });
    await ctx.close();
  }

  const loan = await context(DEMO), page = currentPage = await loan.ctx.newPage(); await page.goto(url('school-trial')); await page.waitForSelector('#question-list button'); await connect(page, DEMO);
  await page.waitForSelector('#cloud-conflict[open]'); await page.locator('#conflict-cloud').click(); assert.equal(await getCode(page), expected.get(DEMO));
  await qButton(page, confirmation).click(); await page.waitForFunction(() => document.querySelector('#confirmation-progress').textContent.includes('0/1'));
  assert.match(await page.locator('.confirmation-history').textContent(), /試行履歴（1回）[\s\S]*コード変更前/);
  await qButton(page, source).click(); await page.waitForFunction(() => document.querySelector('#formal-status').textContent === '試用提出済み');
  assert.equal(await page.locator('#formal-history li').count(), 2); assert.match(await qButton(page, source).locator('.question-item-rating').textContent(), /試用評価.*★/);
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes('archive.'))));
  check('fresh loan browser restores exact code/version, trial journal, accepted trial stars and submission history while preserving its old local code');
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: `${evidence}/${engine}-mobile.png` });
  check('trial labels and stored-state controls fit a 390px viewport'); await loan.ctx.close();

  const denied = await context(FOURTH), deniedPage = currentPage = await denied.ctx.newPage(); const flushes = fixture.state.flushes;
  await deniedPage.goto(url('school-trial')); await deniedPage.waitForSelector('#question-list button'); await deniedPage.locator('#cloud-connect').click();
  await deniedPage.waitForFunction(() => document.querySelector('#notice').textContent.includes('試用対象ではありません'));
  assert.equal(fixture.state.flushes, flushes); assert.equal(await deniedPage.locator('#formal-submit').isDisabled(), true); check('fourth account is rejected by actual server allowlist before any GSS write'); await denied.ctx.close();

  const normal = await context(OWNER, 'normal'), normalPage = currentPage = await normal.ctx.newPage(); await normalPage.goto(url()); await normalPage.waitForSelector('#question-list button');
  assert.equal(await normalPage.locator('#cloud-connect').isDisabled(), true); assert.equal(await normalPage.locator('#trial-mode-note').isVisible(), false);
  assert.equal(requests.filter(request => request.mode === 'normal' && /trial-ui|local-assessment/.test(request.url)).length, 0); check('normal editor retains disabled production connections and does not load trial evaluator'); await normal.ctx.close();

  const preview = await context(OWNER, 'teacher-preview'), previewPage = currentPage = await preview.ctx.newPage(); const priorCalls = calls.length;
  await previewPage.goto(url('teacher-preview')); await previewPage.waitForSelector('#cloud-connect'); await previewPage.locator('#cloud-connect').click();
  await previewPage.waitForFunction(() => document.querySelector('#cloud-account').textContent.includes('配布検証') && !document.querySelector('#cloud-connect').disabled);
  for (const id of ['save-cloud', 'open-cloud', 'formal-submit']) assert.equal(await previewPage.locator('#' + id).isDisabled(), true);
  assert.ok(calls.slice(priorCalls).every(call => call.kind === 'preview' && call.action === 'session')); assert.equal(await previewPage.locator('#trial-mode-note').isVisible(), false);
  assert.equal(requests.filter(request => request.mode === 'teacher-preview' && /trial-ui|local-assessment/.test(request.url)).length, 0);
  check('teacher-preview remains problem-distribution-only through the real preview service and bridge'); await preview.ctx.close();
  assert.equal(fixture.state.evaluationCalls, 0); assert.equal(fixture.state.oldGraderCalls, 0); assert.equal(fixture.central.sheet.getLastRow(), 1);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []); report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.stack; report.browserErrors = errors;
  report.ui = await currentPage?.evaluate(() => ({ notice: document.querySelector('#notice')?.textContent, account: document.querySelector('#cloud-account')?.textContent, status: document.querySelector('#cloud-inline-status')?.textContent, formal: document.querySelector('#formal-status')?.textContent })).catch(() => null);
  await currentPage?.screenshot({ path: `${evidence}/${engine}-failure.png` }).catch(() => {}); throw error;
} finally {
  await writeFile(`${evidence}/${engine}-report.json`, JSON.stringify({ ...report, outside, calls: calls.map(call => ({ account: call.account, kind: call.kind, action: call.action, storeAction: call.input?.action, questionId: call.input?.questionId })) }, null, 2));
  await browser.close();
}
