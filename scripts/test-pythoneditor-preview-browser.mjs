// 合成の教員本人確認・Properties。実学校アカウント/GAS/GSSへ接続しない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createEditorServer } from './serve-pythoneditor.mjs';
import { teacherPreviewFixture, TEACHER, DEMO } from './pythoneditor-preview-gas/tests/fixture.mjs';
const require = createRequire(import.meta.url), { chromium, webkit } = require('playwright');
const evidence = process.env.PYTHONEDITOR_PREVIEW_EVIDENCE || '/private/tmp/pythoneditor-preview-browser';
const origin = 'https://pythoneditor-preview.example.test';
await mkdir(evidence, { recursive: true });
const release = await mkdtemp('/private/tmp/pythoneditor-preview-browser-package-');
const settings = join(release, 'settings.json'), out = join(release, 'gas');
await writeFile(settings, JSON.stringify({ editorOrigin: origin, sourceFileListId: 'synthetic_filelist_identifier_0001', teacherAccount: TEACHER, demoAccount: DEMO, gradingSheet: '採点設定py' }));
execFileSync(process.execPath, [new URL('./prepare-pythoneditor-preview-gas.mjs', import.meta.url).pathname, '--settings', settings, '--out', out], { stdio: 'pipe' });
const bridge = await readFile(join(out, '21_python_editor_bridge.html'), 'utf8');
const panel = await readFile(new URL('../tools/pythoneditor/teacher-preview.mjs', import.meta.url), 'utf8');
assert.equal(panel.split('new GoogleBridge(config)').length, 2);
const f = teacherPreviewFixture(); f.config.editorOrigin = origin;
f.properties.setProperty(f.context.ToolsTeacherPreview.keys.config, f.T.canonical(f.config));
f.state.groups[0].records.push(f.snapshot({ questionId: 'q2', prompt: '二つ目の問題文', code: 'print("preview")' }));
f.enable(); f.context.toolsTeacherPreviewEnvironment_ = () => f.env;
let hold = false, releaseReply, replyStarted, replyArrived, lose = false, invalidSession = false;
const actions = [], errors = [], checks = [];
const server = await createEditorServer({ isolate: false });
const engine = process.env.PYTHONEDITOR_ENGINE || 'Chrome';
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
const check = name => { checks.push(name); console.log('PASS', name); };
try {
  await context.exposeBinding('__teacherPreviewFixture', async (_source, action, input, actorKey, requestOrigin) => {
    actions.push(action);
    if (hold) { hold = false; await new Promise(r => { releaseReply = r; replyStarted(); }); }
    const result = f.context.teacherPythonPreviewRpc(action, input, actorKey, requestOrigin);
    if (invalidSession && result.ok) result.value.preview.readOnly = false;
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RULE_SENTINEL|"answerCode"|"rules"|"registry"/);
    if (lose) { lose = false; await new Promise(r => setTimeout(r, 1800)); }
    replyArrived?.(); return result;
  });
  await context.route(origin + '/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/teacher-preview-config.mjs')) return route.fulfill({ contentType: 'text/javascript', body: "export const teacherPreviewConfig={enabled:true,bridgeURL:'https://script.google.com/macros/s/TEACHER_PREVIEW_TEST_ONLY/exec'};" });
    if (url.pathname.endsWith('/teacher-preview.mjs')) return route.fulfill({ contentType: 'text/javascript', body: panel.replace('new GoogleBridge(config)', 'new GoogleBridge(config,{timeout:1000})') });
    const response = await fetch(new URL(url.pathname + url.search, server.url));
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await context.route('https://script.google.com/**', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe src="https://n-teacher-preview-fixture-script.googleusercontent.com/bridge?${url.searchParams}"></iframe>` });
  });
  await context.route('https://n-teacher-preview-fixture-script.googleusercontent.com/**', route => {
    const url = new URL(route.request().url()), boot = { origin: url.searchParams.get('origin'), channel: url.searchParams.get('channel') };
    const shim = '<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{teacherPythonPreviewRpc(action,input,key,origin){window.__teacherPreviewFixture(action,input,key,origin).then(success,failure);}}}}}}}};</script>';
    return route.fulfill({ contentType: 'text/html', body: bridge.replace('<?!= bootJson ?>', JSON.stringify(boot)).replace('<script>', shim + '<script>') });
  });
  const page = await context.newPage();
  await page.goto(origin + '/tools/pythoneditor/?mode=teacher-preview&set=demo&question=q2&version=v1');
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('配布検証'));
  assert.equal(await page.locator('#question-list button').count(), 0); assert.equal(await page.locator('#run').isDisabled(), true);
  check('認証前にデモや学校問題を表示しない');
  const connect = async () => { await page.locator('#cloud-connect').click(); await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled); };
  await connect();
  assert.equal(await page.locator('#question-list button').count(), 2);
  assert.equal(await page.locator('#question-id').textContent(), 'q2');
  assert.match(await page.locator('#prompt').textContent(), /二つ目/);
  assert.match(page.url(), /mode=teacher-preview/); assert.equal(await page.locator('#set-trigger').isDisabled(), false);
  check('教員接続で圧縮データを取得し、URL指定の問題・雛形を開く');
  for (const id of ['save-cloud', 'open-cloud', 'formal-submit', 'formal-query', 'formal-resume']) assert.equal(await page.locator('#' + id).isDisabled(), true);
  assert.deepEqual(actions, ['session']); check('保存・正式採点・提出を有効にしない');
  const edit = code => page.evaluate(value => document.querySelector('.CodeMirror').CodeMirror.setValue(value), code);
  const code = () => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
  await edit('print("編集した下書き")');
  await page.locator('#question-list [data-question="q1"]').click();
  await page.locator('#question-list [data-question="q2"]').click();
  assert.equal(await code(), 'print("編集した下書き")'); assert.match(page.url(), /mode=teacher-preview/);
  check('問題切替でも下書きと教員検証モードを保持する');
  hold = true; const started = new Promise(r => { replyStarted = r; });
  await page.locator('#cloud-connect').click(); await started;
  await edit('print("応答待ちの編集")'); releaseReply();
  await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled);
  assert.equal(await code(), 'print("応答待ちの編集")'); check('遅れた再接続応答で編集中のコードを上書きしない');
  // 初回Pyodideロードはネットワーク環境に依存する。学校実機の証明には数えない。
  if (engine !== 'webkit') {
    await edit('print("preview execution")'); await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#output').textContent.includes('preview execution'), null, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'run');
    await edit('while True:\n    pass'); await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'stop');
    hold = true; const runningReply = new Promise(r => { replyStarted = r; });
    await page.locator('#cloud-connect').click(); await runningReply; releaseReply();
    await page.waitForFunction(() => !document.querySelector('#cloud-connect').disabled);
    assert.equal(await page.locator('#run').getAttribute('data-state'), 'stop');
    assert.equal(await code(), 'while True:\n    pass');
    await page.locator('#run').click(); await page.waitForFunction(() => document.querySelector('#run').dataset.state === 'run');
    check('配布応答の到着中も実行を保持し、無限ループを停止できる');
  }
  f.identity.active = 'student+fixture@gfe.kaijo.ed.jp'; f.identity.effective = f.identity.active;
  const before = await code(); await connect();
  assert.match(await page.locator('#notice').textContent(), /学校アカウント/); assert.equal(await code(), before);
  f.identity.active = TEACHER; f.identity.effective = TEACHER; await connect();
  check('本人確認の失敗を拒否し、編集内容を保護して再接続できる');
  f.identity.active = DEMO; f.identity.effective = DEMO; await connect();
  assert.match(await page.locator('#cloud-account').textContent(), /デモ/);
  assert.equal(await page.locator('#formal-submit').isDisabled(), true);
  assert.equal(await page.locator('#save-cloud').isDisabled(), true);
  assert.equal(await code(), before);
  f.identity.active = TEACHER; f.identity.effective = TEACHER; await connect();
  check('明示したデモ用アカウントも閲覧でき、教員管理・保存・採点へ昇格しない');
  invalidSession = true; await connect();
  assert.match(await page.locator('#notice').textContent(), /確認できない応答/); assert.equal(await code(), before);
  invalidSession = false; await connect(); check('配布専用ではない応答を受け入れない');
  lose = true; await connect();
  assert.match(await page.locator('#notice').textContent(), /応答/); assert.equal(await code(), before);
  await page.waitForTimeout(1100); assert.equal(await code(), before); await connect();
  check('応答消失・タイムアウト後の遅延応答を反映せず、再取得できる');
  const reads = f.state.reads; f.advance(7200001); await connect();
  assert.match(await page.locator('#notice').textContent(), /有効期限/); assert.equal(await code(), before); assert.equal(f.state.reads, reads);
  check('配信期限切れで停止し、別の取得経路へ切り替えない');
  assert.ok(actions.every(action => action === 'session')); assert.deepEqual(errors, []);
  await page.screenshot({ path: join(evidence, 'teacher-preview.png'), fullPage: true });
  const report = { at: new Date().toISOString(), engine, environment: 'real editor/browser; synthetic teacher identity/Google bridge/Properties/source GSS', checks,
    schoolAccountVerified: false, deployedGasVerified: false, realStudentConcurrencyVerified: false };
  await writeFile(join(evidence, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, evidence }));
} finally {
  await context.close(); await browser.close(); await new Promise(r => server.server.close(r));
  await rm(release, { recursive: true, force: true });
}
