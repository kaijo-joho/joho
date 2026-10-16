// 接続先とAI回答だけを合成する。学校アカウント・本番GAS・AIへは送信しない。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createEditorServer } from './serve-pythoneditor.mjs';
const require = createRequire(import.meta.url), { chromium, webkit } = require('playwright');
const evidence = process.env.PYTHONEDITOR_ADVICE_EVIDENCE || '/private/tmp/pythoneditor-advice-verification';
await mkdir(evidence, { recursive: true });
const server = await createEditorServer({ isolate: false });
const engine = process.env.PYTHONEDITOR_ENGINE || 'Chrome';
const browser = engine === 'webkit' ? await webkit.launch({ headless: true })
  : await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const report = { at: new Date().toISOString(), engine, environment: 'local real browser/Pyodide; synthetic identity, GAS bridge and AI replies', checks: [] };
const check = name => { report.checks.push(name); console.log('PASS', name); };
const bridge = await readFile(new URL('./pythoneditor-advice-gas/71_python_editor_advice_bridge.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('../tools/pythoneditor/advice-ui.mjs', import.meta.url), 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
let actor = 'a'.repeat(64), loginExpired = false, lose = false, hold = false, release, unavailable = false;
let requests = [], aiCalls = 0; const records = new Map(), errors = [];
async function context(enabled) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.exposeBinding('__adviceFixture', async (_source, action, input, key) => {
    requests.push({ action, input: structuredClone(input), key });
    const fail = (code, message) => ({ ok: false, error: { code, message } });
    if (loginExpired) return fail('forbidden', '許可された学校アカウントで接続してください。');
    if (action === 'session') return { ok: true, value: { actorKey: actor, maxInputLength: 8000 } };
    if (key !== actor) return fail('actor_changed', '学校アカウントを再接続してください。');
    let value;
    if (action === 'consult') {
      assert.equal(input.codeHash, digest(JSON.stringify([input.code, input.setupCode])));
      assert.equal(input.snapshotHash, digest(JSON.stringify([input.setId, input.questionId, input.version, input.runId, input.code, input.setupCode, input.errorText])));
      const recordKey = key + input.requestId;
      if (!records.has(recordKey)) {
        aiCalls++;
        records.set(recordKey, { state: 'complete', requestId: input.requestId, setId: input.setId, questionId: input.questionId,
          version: input.version, runId: input.runId, codeHash: input.codeHash, snapshotHash: input.snapshotHash,
          completedAt: '2026-10-17T00:00:00Z', shared: true,
          result: { errorKey: 'ValueError', errorType: 'ValueError', cause: '整数に変換できない文字列です。',
            advice: 'int()の直前で値を確認しましょう。\nprint(repr(value), type(value)) で文字列と型を調べられます。\n<script>window.adviceInjected = true</script>', fixedCode: 'never replace code' } });
      }
      value = records.get(recordKey);
      if (hold) { hold = false; await new Promise(resolve => { release = resolve; }); }
      if (lose) { lose = false; await new Promise(resolve => setTimeout(resolve, 3500)); }
    }
    if (action === 'getConsultation') {
      if (unavailable) return fail('result_unavailable', '回答の一時保存を取得できません。過去の相談を確認してください。');
      value = records.get(key + input.requestId);
      if (!value) return fail('unknown_request', 'この識別番号の相談受付は確認できません。');
    }
    if (action === 'errorTypes') value = { errorTypes: [{ errorKey: 'ValueError', count: 1 }] };
    if (action === 'searchHistory') value = { records: [{ timestamp: '2026-10-17', code: '<script>window.historyInjected = true</script>',
      errorText: 'ValueError: example', questionText: '型を知りたい', errorKey: 'ValueError', errorType: 'ValueError', cause: '合成の相談例です。', advice: 'print(type(value)) で確かめてみましょう。', userEmail: 'must not display' }] };
    return { ok: true, value };
  });
  if (enabled) {
    await context.route(/\/advice-config\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: "export const adviceConfig={enabled:true,bridgeURL:'https://script.google.com/macros/s/ADVICE_TEST_ONLY/exec'};" }));
    await context.route(/\/advice-ui\.mjs(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: ui.replace('new AdviceBridge(config)', 'new AdviceBridge(config,{timeout:1500})') }));
  }
  await context.route('https://script.google.com/**', route => {
    const url = new URL(route.request().url());
    assert.equal(url.searchParams.get('kind'), 'pythoneditor-advice');
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe src="https://n-pythoneditor-advice-test-0lu-script.googleusercontent.com/fixture?${url.searchParams}"></iframe>` });
  });
  await context.route('https://n-pythoneditor-advice-test-0lu-script.googleusercontent.com/**', route => {
    const url = new URL(route.request().url()), boot = { origin: url.searchParams.get('origin'), channel: url.searchParams.get('channel') };
    const shim = `<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{pythonEditorAdviceRpc(action,input,key){window.__adviceFixture(action,input,key).then(success,failure);}}}}}}}};</script>`;
    return route.fulfill({ contentType: 'text/html', body: bridge.replace('<?!= bootJson ?>', JSON.stringify(boot)).replace('<script>', shim + '<script>') });
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return context;
}
const edit = (page, code) => page.evaluate(code => document.querySelector('.CodeMirror').CodeMirror.setValue(code), code);
const code = page => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
const open = async page => { await page.locator('#open-advice').click(); await page.waitForSelector('#advice-panel:not([hidden])'); };
const connect = async page => { await page.locator('#advice-connect').click(); await page.waitForFunction(() => document.querySelector('#advice-connection').textContent === '学校アカウント接続済み'); };
const send = async page => { await page.locator('#advice-share').check(); await page.locator('#advice-send').click(); };
const waitReply = page => page.waitForFunction(() => document.querySelector('#advice-response-body').textContent.includes('int()の直前'));
let page;
try {
  const off = await context(false), disabled = await off.newPage();
  await disabled.goto(server.url); await disabled.waitForSelector('#question-list button'); await edit(disabled, 'n = int("abc")'); await open(disabled);
  assert.equal(await disabled.locator('#advice-code').inputValue(), 'n = int("abc")');
  await disabled.locator('#advice-share').check(); assert.equal(await disabled.locator('#advice-send').isDisabled(), true);
  assert.equal(await disabled.locator('#advice-connect').isDisabled(), true); assert.equal(requests.length, 0);
  assert.equal(await disabled.locator('iframe').count(), 0);
  await disabled.locator('#advice-question').press('Escape'); assert.equal(await disabled.locator('#advice-panel').isVisible(), false);
  assert.equal(await disabled.locator('#open-advice').evaluate(el => el === document.activeElement), true);
  await off.close(); check('disabled production config permits preview and closes with focus return; no iframe or AI network');

  const noStorage = await context(true);
  await noStorage.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }));
  const blocked = await noStorage.newPage(); await blocked.goto(server.url); await blocked.waitForSelector('#question-list button');
  await edit(blocked, 'print("file fallback")'); await blocked.locator('#file-menu > summary').click();
  const download = blocked.waitForEvent('download'); await blocked.locator('#save-file').click();
  assert.equal((await download).suggestedFilename(), 'python-draft.json');
  await blocked.locator('#question-list button').nth(1).click(); await open(blocked);
  assert.match(await blocked.locator('#advice-connection').textContent(), /送信控えを保存できない/);
  assert.equal(await blocked.locator('#advice-connect').isDisabled(), true);
  await noStorage.close(); check('localStorage getter refusal disables consultation sending while editor navigation and file save remain usable');

  const main = await context(true); page = await main.newPage(); await page.goto(server.url); await page.waitForSelector('#question-list button');
  await edit(page, 'n = int("abc")'); await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'run', null, { timeout: 120000 });
  assert.match(await page.locator('#error').textContent(), /ValueError/);
  await page.locator('#find-errors').click(); await page.locator('.error-hint-marker').first().click();
  await page.locator('#error-hint-advice').click(); await page.waitForSelector('#advice-panel:not([hidden])');
  assert.match(await page.locator('#advice-error').inputValue(), /ValueError/); assert.doesNotMatch(await page.locator('#advice-error').inputValue(), /_pyodide/);
  await connect(page); assert.equal(await page.locator('#advice-send').isDisabled(), true);
  await page.locator('#advice-question').fill('型をどこで確認すればよいですか？');
  await page.locator('#advice-question').press('Meta+Enter'); assert.equal(aiCalls, 0); assert.equal(await page.locator('#run').getAttribute('data-state'), 'run');
  check('real Python error and local line hint open the consultation copy; question shortcut neither runs nor sends');

  hold = true; await send(page); await page.waitForFunction(() => document.querySelector('#advice-response').hidden === false);
  const original = requests.find(r => r.action === 'consult').input;
  assert.equal(original.questionText, '型をどこで確認すればよいですか？'); assert.match(original.errorText, /ValueError/);
  await edit(page, 'print("edited while waiting")');
  await page.locator('#question-list button').nth(1).click(); await edit(page, 'print("different question")');
  await page.waitForFunction(() => document.querySelector('#advice-context-note').textContent.includes('別の問題'));
  assert.ok(release); release(); await waitReply(page);
  assert.equal(await code(page), 'print("different question")');
  assert.equal(await page.evaluate(() => window.adviceInjected), undefined);
  assert.equal(await page.locator('#advice-response-body script').count(), 0); check('delayed answer remains attached to original version/run and never replaces code or executes response HTML');
  await page.locator('#question-list button').first().click();
  assert.match(await page.locator('#advice-context-note').textContent(), /変更前/);
  assert.equal(await code(page), 'print("edited while waiting")'); check('returning to edited source displays an explicit old-code notice');

  await page.locator('#advice-new').click(); assert.equal(await page.locator('#advice-share').isChecked(), false);
  await page.locator('#advice-question').fill('出力の確認'); lose = true; await send(page);
  await page.waitForFunction(() => document.querySelector('#advice-status').textContent.includes('応答を確認できません'));
  const last = requests.filter(r => r.action === 'consult').at(-1).input, before = aiCalls;
  await page.locator('#advice-query').click(); await waitReply(page);
  assert.equal(aiCalls, before); assert.equal(requests.at(-1).input.requestId, last.requestId);
  assert.equal(requests.filter(r => r.action === 'consult' && r.input.requestId === last.requestId).length, 1);
  check('lost response is queried by identical request ID without a second AI call');

  await page.reload(); await page.waitForSelector('#question-list button'); await open(page); await connect(page);
  await page.selectOption('#advice-recent', last.requestId); await waitReply(page); assert.equal(aiCalls, before);
  check('same-account reconnect restores completed consultation copies without automatic sending');
  await page.locator('#advice-tab-history').click(); await page.locator('#advice-refresh-history').click();
  await page.waitForFunction(() => document.querySelector('#advice-history-results').textContent.includes('合成の相談例'));
  assert.match(await page.locator('#advice-history-results').textContent(), /型を知りたい/);
  assert.equal(await page.locator('#advice-history-results script').count(), 0);
  assert.equal(await page.evaluate(() => window.historyInjected), undefined); assert.doesNotMatch(await page.locator('#advice-history-results').textContent(), /must not display/);
  check('shared question/code/error/hints render as text and omit identity and internal fields');

  await page.locator('#advice-tab-compose').click(); await page.locator('#advice-new').click(); lose = true; await send(page);
  await page.waitForFunction(() => document.querySelector('#advice-status').textContent.includes('応答を確認できません'));
  unavailable = true; const callsBeforeExpiry = aiCalls; await page.locator('#advice-query').click();
  await page.waitForFunction(() => document.querySelector('#advice-response-body').textContent.includes('回答は取得できません'));
  assert.equal(aiCalls, callsBeforeExpiry); assert.equal(await page.locator('#advice-query').isVisible(), false); unavailable = false;
  check('missing result cache offers shared history and never repeats AI work');

  await page.locator('#advice-new').click(); lose = true; await send(page);
  await page.waitForFunction(() => document.querySelector('#advice-status').textContent.includes('応答を確認できません'));
  const pending = requests.filter(r => r.action === 'consult').at(-1).input; loginExpired = true;
  await page.locator('#advice-query').click(); await page.waitForFunction(() => document.querySelector('#advice-connection').textContent.includes('未接続'));
  const kept = await code(page); loginExpired = false; actor = 'b'.repeat(64); await connect(page);
  assert.equal(await page.locator('#advice-recent option').count(), 1); assert.equal(await code(page), kept);
  assert.equal(requests.filter(r => r.action === 'consult' && r.input.requestId === pending.requestId).length, 1);
  check('authentication expiry clears old account display; another account cannot restore or resend its requests');

  actor = 'a'.repeat(64); await connect(page); await page.selectOption('#advice-recent', pending.requestId);
  await page.locator('#advice-query').click(); await waitReply(page);
  await page.screenshot({ path: evidence + '/advice-desktop.png', fullPage: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.resolvedTheme = theme; }, theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.style.setProperty('--ui-k', '1.4'); document.documentElement.style.setProperty('--ui-size', '20px'); });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const bounds = await page.locator('#advice-panel').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await page.screenshot({ path: evidence + `/advice-mobile-${theme}.png`, fullPage: true });
  }
  check('390px light/dark and large text keep consultation controls inside viewport');
  assert.deepEqual(errors, []); check('no unhandled browser errors'); await main.close();
} catch (error) {
  report.failure = String(error); report.browserErrors = errors;
  report.ui = await page?.evaluate(() => ({ status: document.querySelector('#advice-status')?.textContent, connected: document.querySelector('#advice-connection')?.textContent, notice: document.querySelector('#notice')?.textContent })).catch(() => null);
  throw error;
} finally {
  report.aiCalls = aiCalls; report.actions = requests.map(r => r.action);
  await writeFile(evidence + '/report.json', JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => server.server.close(resolve));
}
