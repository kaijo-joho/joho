import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, readdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepareAdviceGas, transformAdviceSources } from '../prepare-pythoneditor-advice-gas.mjs';

const source = await readFile(new URL('./70_python_editor_advice.gs', import.meta.url), 'utf8');
const bridge = await readFile(new URL('./71_python_editor_advice_bridge.html', import.meta.url), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const origin = 'https://editor.example.invalid';
const emails = ['teacher@school.example.invalid', 'student@school.example.invalid'];
let checks = 0;
function check(label, fn) { fn(); checks++; console.log('ok: ' + label); }

function environment(extra = {}) {
  const scriptProps = new Map(), userProps = new Map(), cache = new Map();
  let lockHeld = false, active = emails[0], now = Date.now(), apiCalls = 0, duringCall;
  const logs = [];
  const props = map => ({
    getProperty: key => map.get(key) ?? null,
    getProperties: () => Object.fromEntries(map),
    setProperty: (key, value) => {
      assert(Buffer.byteLength(value) <= 9000, 'GASの1値上限を超えない');
      map.set(key, value);
      assert([...map].reduce((sum, [k, v]) => sum + Buffer.byteLength(k + v), 0) <= 500 * 1024, '全体上限を超えない');
    }
  });
  const configuration = { schema: 1, enabled: true, editorOrigins: [origin], schoolDomain: 'school.example.invalid', allowedUsers: emails };
  scriptProps.set('PYTHON_EDITOR_ADVICE_CONFIG', JSON.stringify(configuration));
  scriptProps.set('PYTHON_EDITOR_ADVICE_ACTOR_SALT', 'private-test-salt-'.repeat(4));
  const sandbox = {
    console, MAX_INPUT_LENGTH: 8000,
    Date: class extends Date { static now() { return now; } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      newBlob: value => ({ getBytes: () => [...Buffer.from(value)] }),
      computeDigest: (algorithm, value) => [...createHash(algorithm).update(value).digest()].map(b => b > 127 ? b - 256 : b),
      computeHmacSha256Signature: (value, salt) => [...createHmac('sha256', salt).update(value).digest()].map(b => b > 127 ? b - 256 : b),
      base64EncodeWebSafe: value => Buffer.from(value.map(b => (b + 256) % 256)).toString('base64url')
    },
    PropertiesService: { getScriptProperties: () => props(scriptProps), getUserProperties: () => props(userProps) },
    Session: { getActiveUser: () => ({ getEmail: () => active }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => { assert.equal(lockHeld, false, 'ロックを二重取得しない'); lockHeld = true; return true; },
      releaseLock: () => { assert.equal(lockHeld, true); lockHeld = false; }
    }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    normalizeAdviceData_: data => ({ errorKey: 'ValueError', errorType: 'Runtime', cause: '値を確認します。', advice: '入力を確認します。', ...data }),
    getErrorTypeSummary: () => ({ errorTypes: [{ errorKey: 'ValueError', count: 2, email: 'private' }] }),
    searchLogsByErrorKey: () => ({ records: [{ timestamp: '2026-10-17', code: 'print(1)', errorMessage: 'ValueError', errorKey: 'ValueError',
      errorType: 'Runtime', cause: '原因', advice: '確認', questionText: '相談文'.repeat(1500), fixedCode: 'answer', userId: 'private', apiError: 'private', rawJson: 'private' }] }),
    getPythonEditorAdviceData_: (...args) => {
      assert.equal(lockHeld, false, 'AI中にScriptLockを保持しない'); apiCalls++; logs.push(args);
      if (duringCall) duringCall(args);
      return { errorKey: 'ValueError', errorType: 'Runtime', cause: 'あ'.repeat(1800), advice: 'い'.repeat(1800), fixedCode: 'secret-answer', rawJson: 'private' };
    },
    ...extra
  };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const rpc = (action, input = {}, actorKey, from = origin) => JSON.parse(JSON.stringify(sandbox.pythonEditorAdviceRpc(action, input, actorKey, from)));
  const session = () => rpc('session').value;
  return { sandbox, rpc, session, scriptProps, userProps, cache, logs, configuration,
    apiCalls: () => apiCalls, active: value => { active = value; }, clock: value => { now = value; },
    duringCall: value => { duringCall = value; }, now: () => now };
}
function consultation(id = 1, changes = {}) {
  const value = { requestId: id.toString(16).padStart(32, '0'), setId: 'py21a', questionId: 'py21a_1-01', version: 'v1', runId: 'run-1',
    code: 'n = int(input("整数: "))', setupCode: '', errorText: 'ValueError: invalid literal', questionText: 'どの入力を確認すればよいですか。', ...changes };
  value.codeHash = sha(JSON.stringify([value.code, value.setupCode]));
  value.snapshotHash = sha(JSON.stringify([value.setId, value.questionId, value.version, value.runId, value.code, value.setupCode, value.errorText]));
  return value;
}

check('明示有効化・学校Session・allowlist・origin・actorを毎RPCで照合する', () => {
  const e = environment(), actor = e.session().actorKey;
  assert.match(actor, /^[a-f0-9]{64}$/); assert.equal(e.session().maxInputLength, 8000);
  assert.equal(e.rpc('errorTypes', {}, actor).ok, true);
  for (const action of ['consult', 'getConsultation', 'errorTypes', 'searchHistory'])
    assert.equal(e.rpc(action, {}, 'a'.repeat(64)).error.code, 'actor_changed', action);
  assert.equal(e.rpc('session', {}, undefined, 'https://untrusted.invalid').error.code, 'forbidden_origin');
  e.active(''); assert.equal(e.rpc('session').error.code, 'forbidden');
  e.active('outsider@school.example.invalid'); assert.equal(e.rpc('session').error.code, 'forbidden');
  e.active(emails[0]); e.configuration.enabled = false;
  e.scriptProps.set('PYTHON_EDITOR_ADVICE_CONFIG', JSON.stringify(e.configuration));
  assert.equal(e.rpc('errorTypes', {}, actor).error.code, 'disabled'); assert.equal(e.apiCalls(), 0);
});

check('相談はテキストJSONで返し、HTML・解答コード・内部ログを返さない', () => {
  const e = environment(), actor = e.session().actorKey, request = consultation();
  const response = e.rpc('consult', request, actor);
  assert.equal(response.ok, true); assert.equal(response.value.state, 'complete'); assert.equal(response.value.shared, true);
  assert.deepEqual(Object.keys(response.value.result).sort(), ['advice', 'cause', 'errorKey', 'errorType']);
  assert.equal(response.value.result.cause, 'あ'.repeat(1800)); assert.equal(response.value.result.advice, 'い'.repeat(1800));
  assert.equal(response.value.snapshotHash, request.snapshotHash); assert.equal(response.value.codeHash, request.codeHash);
  assert.equal(e.logs[0][2], request.questionText);
  assert.equal(e.rpc('getConsultation', { requestId: request.requestId }, actor).value.state, 'complete');
  assert.equal(e.rpc('consult', request, actor).value.state, 'complete'); assert.equal(e.apiCalls(), 1);
  assert.equal(e.rpc('consult', consultation(1, { questionText: '別の質問' }), actor).error.code, 'request_conflict');
  const history = e.rpc('searchHistory', { errorKey: 'ValueError', limit: 10 }, actor);
  assert.deepEqual(Object.keys(history.value.records[0]).sort(), ['advice', 'cause', 'code', 'errorKey', 'errorText', 'errorType', 'questionText', 'timestamp']);
  assert.equal(history.value.records[0].questionText.length, 3000);
  assert.equal(e.sandbox.pythonEditorAdviceQuestionText_('{"questionText":"相談","apiError":"secret"}'), '相談');
  assert.equal(e.sandbox.pythonEditorAdviceQuestionText_('malformed private raw'), '');
  assert.equal(e.sandbox.pythonEditorAdviceQuestionText_('{"questionText":{"private":true}}'), '');
  assert.deepEqual(e.rpc('errorTypes', {}, actor).value, { errorTypes: [{ errorKey: 'ValueError', count: 2 }] });
  e.sandbox.getPythonEditorAdviceData_ = () => ({ errorKey: 'LogicError', errorType: 'Logic', cause: 'あ'.repeat(15000), advice: 'い'.repeat(15000) });
  const long = e.rpc('consult', consultation(2), actor).value.result;
  assert(Buffer.byteLength(long.cause) <= 12000); assert(Buffer.byteLength(long.advice) <= 24000);
  assert(long.cause.endsWith('…（長い回答のため一部を省略しました）')); assert(long.advice.endsWith('…（長い回答のため一部を省略しました）'));
});

check('入力のhash・上限・本文形式を検査し、別actorへ結果を漏らさない', () => {
  const e = environment(), first = e.session().actorKey;
  const wrong = consultation(); wrong.code += '\nprint(1)';
  assert.equal(e.rpc('consult', wrong, first).error.code, 'snapshot_mismatch');
  assert.equal(e.rpc('consult', consultation(1, { code: 'x'.repeat(7990), questionText: 'x'.repeat(50) }), first).error.code, 'too_long');
  assert.equal(e.rpc('consult', { ...consultation(), secret: 'bad' }, first).error.code, 'invalid_request');
  assert.equal(e.rpc('searchHistory', { limit: 100 }, first).error.code, 'invalid_request');
  assert.equal(e.rpc('consult', consultation(), first).ok, true);
  e.active(emails[1]); const second = e.session().actorKey;
  assert.notEqual(first, second);
  assert.equal(e.rpc('getConsultation', { requestId: consultation().requestId }, second).error.code, 'unknown_request');
  assert.equal(e.rpc('consult', consultation(), second).ok, true); assert.equal(e.apiCalls(), 2);
});

check('応答消失・キャッシュ消失・未完了の期限切れで同じ相談を再AIしない', () => {
  const e = environment(), actor = e.session().actorKey, request = consultation();
  e.duringCall(() => {
    assert.equal(e.rpc('getConsultation', { requestId: request.requestId }, actor).value.state, 'pending');
    assert.equal(e.rpc('consult', request, actor).value.state, 'pending');
  });
  assert.equal(e.rpc('consult', request, actor).ok, true); assert.equal(e.apiCalls(), 1);
  e.cache.clear();
  assert.equal(e.rpc('getConsultation', { requestId: request.requestId }, actor).error.code, 'result_unavailable');
  assert.equal(e.rpc('consult', request, actor).error.code, 'result_unavailable'); assert.equal(e.apiCalls(), 1);
  const abandoned = environment(), aa = abandoned.session().actorKey;
  abandoned.sandbox.getPythonEditorAdviceData_ = () => { throw new Error('private exception'); };
  const failure = abandoned.rpc('consult', request, aa);
  assert.equal(failure.error.code, 'unavailable'); assert(!JSON.stringify(failure).includes('private exception'));
  abandoned.clock(abandoned.now() + 21 * 60 * 1000);
  assert.equal(abandoned.rpc('getConsultation', { requestId: request.requestId }, aa).error.code, 'expired');
  assert.equal(abandoned.rpc('consult', request, aa).error.code, 'expired');
});

check('40件同時受付・1500件の完了でも共有UserProperties枠に収める', () => {
  const e = environment(), actor = e.session().actorKey;
  let index = 1, pendingBytes = 0;
  e.duringCall(() => {
    if (index < 40) {
      index++; assert.equal(e.rpc('consult', consultation(index), actor).ok, true);
    } else {
      pendingBytes = [...e.userProps].reduce((sum, [k, v]) => sum + Buffer.byteLength(k + v), 0);
      assert.equal([...e.userProps.values()].filter(v => JSON.parse(v).state === 'pending').length, 40);
    }
  });
  assert.equal(e.rpc('consult', consultation(1), actor).ok, true);
  e.duringCall(null);
  for (let i = 41; i <= 1500; i++) assert.equal(e.rpc('consult', consultation(i), actor).ok, true, 'request ' + i);
  const completedBytes = [...e.userProps].reduce((sum, [k, v]) => sum + Buffer.byteLength(k + v), 0);
  assert.equal(e.apiCalls(), 1500); assert(pendingBytes < 80000); assert(completedBytes < 400000);
  assert([...e.userProps.values()].every(v => !v.includes('あ')));
  console.log(JSON.stringify({ syntheticPending40Bytes: pendingBytes, syntheticCompleted1500Bytes: completedBytes }));
  e.userProps.set('another-feature', 'x'.repeat(440000));
  assert.equal(e.rpc('consult', consultation(1501), actor).error.code, 'receipt_capacity'); assert.equal(e.apiCalls(), 1500);
});

check('iframeはsource・origin・channel・id・actor・actionを検査する', () => {
  const peer = {}, events = {}, sent = [], calls = [], boot = { origin, channel: 'a'.repeat(64) };
  peer.postMessage = (value, targetOrigin) => sent.push([value, targetOrigin]);
  const runner = { withSuccessHandler(fn) { this.success = fn; return this; }, withFailureHandler(fn) { this.failure = fn; return this; },
    pythonEditorAdviceRpc(...args) { calls.push(args); } };
  const sandbox = { window: { top: peer }, document: { getElementById: () => ({ textContent: '' }) },
    addEventListener: (name, fn) => { events[name] = fn; }, google: { script: { run: runner } } };
  vm.runInNewContext(bridge.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= bootJson ?>', JSON.stringify(boot)), sandbox);
  assert.equal(sent[0][0].type, 'ready'); assert.equal(sent[0][1], origin);
  const request = { source: peer, origin, data: { protocol: 'python-editor-advice-v1', channel: boot.channel, type: 'request', id: '1'.repeat(32), action: 'session', input: {} } };
  for (const mutation of [ { source: {} }, { origin: 'https://bad.invalid' }, { data: { ...request.data, channel: 'b'.repeat(64) } },
    { data: { ...request.data, id: 'bad' } }, { data: { ...request.data, action: 'consult' } }, { data: { ...request.data, action: 'eval' } } ]) events.message({ ...request, ...mutation });
  assert.equal(calls.length, 0); events.message(request); assert.equal(calls.length, 1);
  assert.equal(calls[0][3], origin); events.message(request); assert.equal(calls.length, 1);
  runner.success({ ok: true, value: { actorKey: 'f'.repeat(64) } });
  assert.equal(sent[1][0].id, request.data.id); assert.equal(sent[1][0].type, 'response');
});

// 変換処理は原本依存の変更に対してfail-closedとする。
check('20個の既存分岐のデータ化と互換HTML wrapperを限定変換する', () => {
  const original = new Map([
    ['00_code.gs', 'function doGet(e) { return "legacy"; }'],
    ['10_main.gs', `function getGeminiAdvice(studentCode, errorMessage) {
  const code = String(studentCode || ""), errMsg = String(errorMessage || ""), userEmail = 'test';
  const inputHash = makeInputHash_(code, errMsg);
  if ((code + errMsg).length > MAX_INPUT_LENGTH) {}
  var prompt; prompt = buildGeminiPrompt_(code, errMsg);
  ${Array.from({ length: 20 }, (_, i) => `if (code === '${i}') { var data = { advice: '${i}' }; logToSheet_(userEmail, code, errMsg, data, 'test', {}); return buildAdviceHtml(data); }`).join('\n')}
}`],
    ['40_logging.gs', 'function logToSheet_(userEmail, code, errorMessage, data, status, meta = {}) { const inputHash = makeInputHash_(code, errorMessage); const rawJson = JSON.stringify({\n      errorKey, advice: data.advice }); }'],
    ['50_history.gs', 'function searchLogsByErrorKey() { return {\n        errorMessage: record.errorMessage,\n}; }']
  ]);
  const transformed = transformAdviceSources(original);
  for (const [name, value] of transformed) new vm.Script(value, { filename: name });
  const sandbox = { MAX_INPUT_LENGTH: 8000, makePythonEditorAdviceInputHash_: () => 'hash', buildPythonEditorAdvicePrompt_: () => 'prompt',
    getUserEmail_: () => 'test', logToSheet_: () => {}, buildAdviceHtml: data => 'HTML:' + data.advice };
  vm.createContext(sandbox); vm.runInContext(transformed.get('10_main.gs'), sandbox);
  for (let i = 0; i < 20; i++) assert.equal(sandbox.getGeminiAdvice(String(i), ''), 'HTML:' + i);
  assert.equal(sandbox.getPythonEditorAdviceData_('1', '', 'question').advice, '1');
  assert.throws(() => transformAdviceSources(new Map([...original].map(([k, v]) => [k, v.replace('function doGet(e) {', 'function doGet(event) {')]))), /原本構造/);
});

const baselineIndex = process.argv.indexOf('--baseline');
if (baselineIndex >= 0) {
  const baseline = resolve(process.argv[baselineIndex + 1]);
  const temp = await mkdtemp('/private/tmp/pythoneditor-advice-backend-test-'), out = join(temp, 'candidate');
  const names = await readdir(baseline), before = new Map();
  for (const name of ['00_code.gs', '10_main.gs', '40_logging.gs', '50_history.gs', 'appsscript.json', '.clasp.json']) before.set(name, sha(await readFile(join(baseline, name))));
  const result = await prepareAdviceGas({ baseline, out, settings: { ownerAccount: emails[0], schoolDomain: 'school.example.invalid', editorOrigins: [origin], allowedUsers: emails } });
  check('実原本は保持し、私有コピーにだけ追加してmanifestを保持する', () => { assert.equal(result.remoteChanged, false); assert.equal(result.enabled, false); });
  const symlinkBaseline = await mkdtemp(join(temp, 'symlink-baseline-'));
  await symlink(join(baseline, '10_main.gs'), join(symlinkBaseline, 'unexpected-link.gs'));
  await assert.rejects(prepareAdviceGas({ baseline: symlinkBaseline, out: join(temp, 'symlink-refused'),
    settings: { ownerAccount: emails[0], schoolDomain: 'school.example.invalid', editorOrigins: [origin], allowedUsers: emails } }), /シンボリックリンク/);
  checks++; console.log('ok: symlinkを含む原本のコピーを拒否し、書込先が原本へ到達しない');
  for (const [name, hash] of before) assert.equal(sha(await readFile(join(baseline, name))), hash, name + '原本不変');
  assert.equal(sha(await readFile(join(out, 'appsscript.json'))), before.get('appsscript.json'));
  const realSources = [];
  for (const name of (await readdir(out)).filter(n => n.endsWith('.gs'))) realSources.push(await readFile(join(out, name), 'utf8'));
  new vm.Script(realSources.join('\n;\n'));
  const realMain = await readFile(join(out, '10_main.gs'), 'utf8');
  check('実原本でも2引数HTML wrapperと質問別hash/prompt/logを使う', () => {
    assert.match(realMain, /return buildAdviceHtml\(getPythonEditorAdviceData_/);
    assert.equal([...realMain.matchAll(/logAdvice_\(userEmail,/g)].length, 20);
    const e = environment();
    e.sandbox.makeInputHash_ = (code, error) => 'legacy:' + code + ':' + error;
    assert.equal(e.sandbox.makePythonEditorAdviceInputHash_('x', '', ''), 'legacy:x:');
    assert.notEqual(e.sandbox.makePythonEditorAdviceInputHash_('x', '', '質問1'), e.sandbox.makePythonEditorAdviceInputHash_('x', '', '質問2'));
    e.sandbox.buildGeminiPrompt_ = () => 'prompt\n【授業方針】\nJSON only';
    assert.match(e.sandbox.buildPythonEditorAdvicePrompt_('x', '', '質問1'), /質問1/);
    assert.equal(e.sandbox.buildPythonEditorAdvicePrompt_('x', '', ''), 'prompt\n【授業方針】\nJSON only');
    assert(e.sandbox.buildPythonEditorAdvicePrompt_('x', '', '$& $` $\'').includes(JSON.stringify('$& $` $\'')), '相談文の置換記号を展開しない');
  });
  check('実データcoreでも質問をprompt/hash/cache/logへ通し既存HTMLを返す', () => {
    const e = environment({ Common: {} });
    vm.runInContext(realSources.join('\n;\n'), e.sandbox);
    let calls = 0; const logs = [], prompts = [], quotaActors = [], safetyActors = [];
    Object.assign(e.sandbox, {
      logToSheet_: (...args) => logs.push(args),
      checkPythonErrorMessageInput_: () => ({ ok: true }), detectLocalPythonIssue_: () => ({ detected: false }),
      checkCoursePythonCodeInput_: () => ({ ok: true }), checkPythonLikeInput_: () => ({ ok: true }),
      isErrorMessageInCodeField_: () => false, getOpenAIModel_: () => 'synthetic-model',
      getOpenAIApiKey_: () => 'synthetic-only', findReusableLogByInputHash_: () => null, findRecentApiCooldownRecord_: () => null,
      checkAndConsumeGlobalMinuteQuota_: () => ({ allowed: true, quotaKey: 'synthetic' }),
      consumeUserDailyQuota_: userEmail => { quotaActors.push(userEmail); return { allowed: true, userCount: 1 }; },
      makeOpenAISafetyIdentifier_: userEmail => { safetyActors.push(userEmail); return 'synthetic'; },
      buildGeminiPrompt_: () => 'prompt\n【授業方針】\nJSON only',
      applyGeminiPostValidation_: (_code, _error, data) => data,
      withInputErrorClassification_: data => data,
      callOpenAIForPythonErrorRoom_: options => {
        calls++; prompts.push(options.prompt);
        return { ok: true, httpStatus: 200, outputText: JSON.stringify({ errorKey: 'LogicError', errorType: 'Logic', cause: '条件を確認', advice: '境界を試す', fixedCode: '' }) };
      },
      buildAdviceHtml: data => 'HTML:' + data.cause
    });
    const first = e.sandbox.getPythonEditorAdviceData_('print(1)', '', '期待は2');
    const second = e.sandbox.getPythonEditorAdviceData_('print(1)', '', '期待は3');
    const repeated = e.sandbox.getPythonEditorAdviceData_('print(1)', '', '期待は2');
    assert.equal(calls, 2); assert.equal(first.errorKey, 'LogicError'); assert.equal(second.errorKey, first.errorKey);
    assert.equal(repeated.errorKey, first.errorKey); assert(prompts[0].includes('期待は2')); assert(prompts[1].includes('期待は3'));
    assert.equal(logs[0][5].questionText, '期待は2'); assert.equal(logs[1][5].questionText, '期待は3');
    assert.notEqual(logs[0][5].inputHash, logs[1][5].inputHash); assert.equal(logs[0][5].inputHash, logs[2][5].inputHash);
    assert.equal(e.sandbox.getGeminiAdvice('print(1)', ''), 'HTML:条件を確認');
    assert.equal(logs[3][5].questionText, '');
    assert.equal(logs[3][5].inputHash, e.sandbox.makeInputHash_('print(1)', ''));
    assert.equal(logs[0][0], emails[0]); assert(quotaActors.every(user => user === emails[0])); assert(safetyActors.every(user => user === emails[0]));
    let refunded = 0;
    e.sandbox.consumeUserDailyQuota_ = () => ({ allowed: false, userCount: 6, message: '上限' });
    e.sandbox.refundGlobalMinuteQuota_ = () => { refunded++; };
    assert.equal(e.sandbox.getPythonEditorAdviceData_('print(2)', '', '上限時の相談').errorType, '利用回数の上限');
    assert.equal(calls, 3); assert.equal(refunded, 1);
    assert.equal(logs.at(-1)[4], 'Limit Exceeded'); assert.equal(logs.at(-1)[5].questionText, '上限時の相談');
    e.sandbox.consumeUserDailyQuota_ = userEmail => { quotaActors.push(userEmail); return { allowed: true, userCount: 1 }; };
    e.active(emails[1]); const student = e.session().actorKey;
    const studentResult = e.rpc('consult', consultation(99, { code: 'print(3)', errorText: '', questionText: '本人一致の確認' }), student);
    assert.equal(studentResult.ok, true); assert.equal(studentResult.value.state, 'complete');
    assert.equal(logs.at(-1)[0], emails[1]); assert.equal(quotaActors.at(-1), emails[1]); assert.equal(safetyActors.at(-1), emails[1]);
  });
  if (names.includes('pyerr_local_tests.cjs')) {
    // 原本の試験ファイルは保持。API本体の静的参照だけを抽出先へ向ける。
    let tests = await readFile(join(out, 'pyerr_local_tests.cjs'), 'utf8');
    tests = tests.replaceAll('sandbox.getGeminiAdvice.toString()', 'sandbox.getPythonEditorAdviceData_.toString()')
      .replace('const code = fileOrder.map', 'const code = [...fileOrder, "70_python_editor_advice.gs"].map');
    const executed = spawnSync(process.execPath, ['-e', tests], { cwd: out, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (executed.status !== 0) throw new Error(executed.stdout + '\n' + executed.stderr);
    console.log('baseline regression assertions: ' + (executed.stdout.match(/^ok:/gm) || []).length);
    checks++;
  }
  console.log(JSON.stringify({ privateCandidate: out, originalChanged: false, aiCalled: false }));
}
console.log(JSON.stringify({ checks, liveGAS: false, realAI: false, permissionsChanged: false }));
