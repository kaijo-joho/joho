import test from 'node:test';
import assert from 'node:assert/strict';
import { trialApiFixture, OWNER, SECOND, DEMO, FOURTH, id, plain } from './trial-api-fixture.mjs';

const codeOf = error => error.toolsTrialCode || error.toolsStoreCode || error.pythonEditorCode;
const fails = (fn, expected) => assert.throws(fn, error => codeOf(error) === expected, expected);
const writes = f => [...f.stores.values()].reduce((sum, store) => sum + [...store.sheets.values()].reduce((n, sheet) => n + sheet.writes.length, 0), 0) + (f.central?.sheet.writes.length || 0);
const stored = (f, account = f.identity.active) => f.stores.get(account).ledger.getLastRow() - 1;
const storeCall = (f, connection, action, input = {}) => f.call('store', { binding: connection.binding, action, input });
const query = { tool: 'python', questionId: 'q1', version: 'v1' };
function saveInput(overrides = {}) { return { ...query, setId: 'demo', title: '合成問題', folder: '', requestId: id(800), clientId: id(900),
  expectedRevision: null, code: 'print("保存")', stdin: '', ...overrides }; }
function metadata(f, account = f.identity.active, row = 2) { return JSON.parse(f.stores.get(account).ledger.cells.get(`${row},3`).slice(2)); }
function mutateMeta(f, mutate, account = f.identity.active, row = 2) {
  const value = metadata(f, account, row); mutate(value);
  f.stores.get(account).ledger.cells.set(`${row},3`, 'j:' + f.T.canonical(value));
}
function recordAt(f, account = f.identity.active, row = 2) {
  const sheet = f.stores.get(account).ledger;
  return JSON.parse(sheet.getRange(row, 4, 1, 70).getValues()[0].map(value => value.slice(2)).join(''));
}

test('指定3名のみ実preview/packageから配布し、本人専用GSSのbindingを返す', () => {
  const f = trialApiFixture();
  for (const account of [OWNER, SECOND, DEMO]) {
    const session = f.session(account), entry = f.stores.get(account).entry;
    assert.equal(session.account, account); assert.equal(session.actorKey, f.T.actorKey(account));
    assert.equal(session.viewerRole, account === DEMO ? 'demo' : 'teacherTrial');
    assert.equal(session.trial, true); assert.equal(session.scope, 'pythoneditor-school-trial-v1');
    assert.equal(session.store.connection.spreadsheetId, entry.spreadsheetId);
    assert.equal(session.assessments.length, 2);
    assert(session.catalog.sets[0].questions.some(q => q.questionId === 'check1' && q.kind === 'confirmation'));
    assert(!session.assessments.some(q => ['ungraded', 'check1'].includes(q.questionId)));
    assert(session.ratings.every(rating => rating.earned === null && rating.assessmentSource === 'local-report' && rating.trial));
    for (const other of [OWNER, SECOND, DEMO].filter(other => other !== account)) assert(!JSON.stringify(session).includes(f.stores.get(other).entry.spreadsheetId));
  }
  assert.equal(writes(f), 0); assert.equal(f.properties.writes.length, 0);
});

test('中央未設定は3個人GSSだけで保存/署名提出/照会/★を完了でき、回収はopen/lock前に拒否する', () => {
  const f = trialApiFixture({ centralDisabled: true });
  assert.equal(f.config.centralId, null); assert.equal(f.central, null); assert.equal(f.books.size, 3);
  const receipts = new Map();
  for (const [index, account] of [OWNER, SECOND, DEMO].entries()) {
    const session = f.session(account), connection = session.store.connection;
    assert.equal(session.viewerRole, account === DEMO ? 'demo' : 'teacherTrial');
    assert.equal(storeCall(f, connection, 'saveDraft', saveInput({ requestId: id(810 + index) })).state, 'saved');
    assert.equal(storeCall(f, connection, 'getDraft', query).draft.code, 'print("保存")');
    const input = f.submission({ requestId: id(1010) }), submitted = f.call('submit', input);
    receipts.set(account, submitted.receipt);
    assert.equal(submitted.receipt.state, 'submitted'); assert.equal(submitted.receipt.assessmentSource, 'local-report');
    assert.equal(submitted.receipt.score, 1); assert.equal(submitted.rating.earned, 1); assert.equal(submitted.rating.total, 1);
    assert.deepEqual(plain(f.call('lookup', { scopeId: f.config.scopeId, requestId: input.requestId }).receipt), plain(submitted.receipt));
    assert.equal(f.call('questionStatus', { scopeId: f.config.scopeId, questionId: 'q1', version: 'v1' }).rating.earned, 1);
    assert.deepEqual(plain(f.call('submit', input).receipt), plain(receipts.get(account)));
    assert.equal(stored(f, account), 1);
  }
  f.select(OWNER);
  const opened = f.state.opens.length, written = writes(f);
  let lockRequests = 0;
  f.env.scriptLock = () => { lockRequests++; throw new Error('unconfigured collection requested lock'); };
  fails(() => f.collect(), 'collection_not_configured');
  assert.equal(f.state.opens.length, opened); assert.equal(writes(f), written); assert.equal(lockRequests, 0);
  assert.equal(f.state.scriptLock.acquisitions, 0); assert.equal(f.state.scriptLock.releases, 0);
  f.select(DEMO); fails(() => f.collect(), 'account_denied');
  assert.equal(f.state.opens.length, opened); assert.equal(lockRequests, 0);
  assert.equal(f.books.size, 3); assert.equal(f.state.evaluationCalls, 0); assert.equal(f.state.oldGraderCalls, 0);
});

test('中央IDは明示nullか有効なIDだけを許可し、未設定案内を公開wrapperで一般化する', () => {
  for (const centralId of ['', undefined, 0, false, 'invalid']) {
    const f = trialApiFixture({ centralDisabled: true }); f.config.centralId = centralId; f.writeConfig();
    fails(() => f.call('session'), 'trial_configuration'); assert.equal(f.state.opens.length, 0);
  }
  const f = trialApiFixture({ centralDisabled: true }), realService = f.context.ToolsSchoolTrial.create(f.env);
  // Exercise the shared public error formatter with the actual collector failure.
  f.env.open = () => realService.collect();
  const result = f.rpc('session');
  assert.equal(result.ok, false); assert.equal(result.error.code, 'collection_not_configured');
  assert.equal(result.error.message, '中央の回収先は未設定です。個人の保存・試用提出は利用できます。');
  assert.equal(f.state.scriptLock.acquisitions, 0);
});

test('中央未設定時の署名/履歴は、後から用意した合成中央GSSへ再提出せず回収できる', () => {
  const f = trialApiFixture({ centralDisabled: true, account: DEMO }), input = f.submission(), receipt = plain(f.call('submit', input).receipt);
  const prepared = trialApiFixture();
  f.config.centralId = prepared.config.centralId;
  f.books.set(f.config.centralId, prepared.central); f.writeConfig(); f.select(OWNER);
  assert.equal(f.collect().copied, 1); assert.equal(f.collect().copied, 0);
  const collected = JSON.parse(prepared.central.sheet.getRange(2, 4, 1, 70).getValues()[0].map(value => value.slice(2)).join(''));
  assert.deepEqual(collected, { input, receipt });
  f.select(DEMO);
  assert.deepEqual(plain(f.call('lookup', { scopeId: f.config.scopeId, requestId: input.requestId }).receipt), receipt);
  assert.equal(stored(f, DEMO), 1);
});

test('第四者・Active/Effective不一致・origin/actor違いをGSSアクセス前に拒否する', () => {
  const f = trialApiFixture();
  f.select(FOURTH); fails(() => f.call('session'), 'account_denied');
  f.select(DEMO); f.identity.effective = OWNER; fails(() => f.call('session'), 'account_denied');
  f.select(DEMO); fails(() => f.call('session', {}, null, 'https://other.example'), 'origin_denied');
  fails(() => f.call('session', {}, f.T.actorKey(OWNER)), 'account_mismatch');
  const input = f.submission();
  fails(() => f.context.ToolsSchoolTrial.create(f.env).call('submit', input, undefined, f.config.editorOrigin), 'account_mismatch');
  assert.equal(f.state.opens.length, 0); assert.equal(writes(f), 0);
});

test('configの人数/role/重複/未登録保存先をfail closedにし、client role/GSSIDで増権できない', () => {
  for (const mutate of [
    config => config.participants.push({ ...config.participants[2], account: FOURTH }),
    config => { config.participants[2].role = 'teacherTrial'; },
    config => { config.participants[1].account = OWNER; },
    config => { config.participants[1].spreadsheetId = config.participants[0].spreadsheetId; },
    config => { config.participants[2].account = FOURTH; },
    config => { config.participants[2].ownerAccount = DEMO; }
  ]) {
    const f = trialApiFixture(); mutate(f.config); f.writeConfig();
    fails(() => f.call('session'), 'trial_configuration'); assert.equal(f.state.opens.length, 0);
  }
  const f = trialApiFixture({ account: DEMO });
  for (const input of [{ role: 'teacherTrial' }, { spreadsheetId: f.config.centralId }, { account: OWNER }]) fails(() => f.call('session', input), 'invalid_request');
  fails(() => f.call('submit', { ...f.submission(), receivedAt: new Date(f.now()).toISOString() }), 'invalid_request');
  assert.equal(writes(f), 0);
});

test('学校bindingを別account/別保存先/別世代へ流用できず、通常store用鍵とも混ざらない', () => {
  const f = trialApiFixture(), owner = f.session(OWNER).store.connection, own = f.session(DEMO).store.connection;
  const start = f.state.opens.length;
  fails(() => storeCall(f, owner, 'session'), 'account_mismatch');
  assert.equal(f.state.opens.length, start);
  const standard = f.T.issueBinding({ account: DEMO, spreadsheetId: own.spreadsheetId, generation: f.stores.get(DEMO).entry.generation,
    tool: 'python', origin: f.config.editorOrigin }, { bindingKey: 'ordinary-store-synthetic-key-only-32chars', allowedOrigins: [f.config.editorOrigin] }, f.now());
  fails(() => storeCall(f, { binding: standard }, 'session'), 'binding_invalid');
  f.stores.get(DEMO).entry.generation = id(500); f.writeConfig();
  fails(() => storeCall(f, own, 'session'), 'account_mismatch');
  assert.equal(writes(f), 0);
});

test('実store serviceで3名のコード・確認journalを各自GSSに保存し、相互の本文を返さない', () => {
  const f = trialApiFixture();
  for (const [n, account] of [OWNER, SECOND, DEMO].entries()) {
    const connection = f.session(account).store.connection;
    assert.equal(storeCall(f, connection, 'session').account, account);
    assert.equal(storeCall(f, connection, 'saveDraft', saveInput({ code: 'print("' + account + '")', requestId: id(800 + n) })).state, 'saved');
    assert.equal(storeCall(f, connection, 'getDraft', query).draft.code, 'print("' + account + '")');
    const body = f.T.canonical({ schema: 1, trials: [], responses: {} }), requestId = id(850 + n);
    storeCall(f, connection, 'beginConfirmationSave', { tool: 'python', requestId, expectedRevision: null, journalHash: f.T.hash(body), byteLength: Buffer.byteLength(body), chunkCount: 1 });
    storeCall(f, connection, 'putConfirmationChunk', { tool: 'python', requestId, index: 0, text: body });
    assert.equal(storeCall(f, connection, 'saveConfirmationJournal', { tool: 'python', requestId, expectedRevision: null }).state, 'saved');
    const manifest = storeCall(f, connection, 'getConfirmationJournal', { tool: 'python' });
    const chunk = storeCall(f, connection, 'getConfirmationJournalChunk', { tool: 'python', revision: manifest.revision, readId: manifest.readId, index: 0 });
    assert.equal(chunk.text, body);
    assert.equal(stored(f, account), 0);
  }
  assert.equal(f.central.sheet.writes.length, 0);
  for (const lock of f.state.userLocks.values()) { assert.equal(lock.held, false); assert.equal(lock.acquisitions, lock.releases); }
});

test('教員の自己所有/実editorは許可し、demoの保護編集・所有者/編集者/guide/保護不整合は拒否する', () => {
  const f = trialApiFixture();
  assert.deepEqual(f.stores.get(OWNER).book.getEditors().map(user => user.getEmail()), [OWNER]);
  const owner = f.session(OWNER).store.connection; assert.equal(storeCall(f, owner, 'session').account, OWNER);
  const book = f.stores.get(OWNER).book, editors = book.getEditors; book.getEditors = () => [];
  assert.equal(storeCall(f, owner, 'session').account, OWNER); book.getEditors = editors;
  const second = f.session(SECOND).store.connection; assert.equal(storeCall(f, second, 'session').account, SECOND);
  const demo = f.session(DEMO).store.connection;
  f.stores.get(DEMO).data.protections[0].canEdit = () => true;
  fails(() => storeCall(f, demo, 'saveDraft', saveInput()), 'protection_mismatch');
  for (const mutate of [
    store => { store.book.owner = FOURTH; },
    store => { store.book.editors = []; },
    store => { store.guide.cells.set('2,2', 'e'.repeat(64)); },
    store => { store.guide.protections = []; },
    store => { store.ledger.protections = []; }
  ]) {
    const g = trialApiFixture({ account: DEMO }); mutate(g.stores.get(DEMO));
    assert.throws(() => g.call('submit', g.submission())); assert.equal(writes(g), 0);
  }
});

test('試用提出本文に編集不可のRANGE/SHEET保護があれば接続時に拒否し、警告のみ/編集可は許可する', () => {
  for (const account of [OWNER, SECOND, DEMO]) for (const kind of ['range', 'sheet']) {
    const f = trialApiFixture({ account }), ledger = f.stores.get(account).ledger;
    if (kind === 'range') ledger.protectRange(1, 1, 100, 73);
    else ledger.sheetProtections = [{ isWarningOnly: () => false, canEdit: () => false }];
    fails(() => f.session(), 'body_not_editable');
    fails(() => f.call('submit', f.submission()), 'body_not_editable');
    assert.equal(writes(f), 0);
  }
  for (const mode of ['warning', 'editable']) for (const kind of ['range', 'sheet']) {
    const f = trialApiFixture({ account: DEMO }), ledger = f.stores.get(DEMO).ledger;
    if (kind === 'range') ledger.protectRange(2, 1, 100, 73, { warning: mode === 'warning', editable: mode === 'editable' });
    else ledger.sheetProtections = [{ isWarningOnly: () => mode === 'warning', canEdit: () => mode === 'editable' }];
    assert.equal(f.session().account, DEMO);
    assert.equal(f.call('submit', f.submission()).receipt.state, 'submitted');
  }
});

test('guide/提出headerのtarget audience共有や確認不能を接続前に拒否する', () => {
  for (const name of ['guide', 'ledger']) for (const defect of ['audience', 'missing']) {
    const f = trialApiFixture({ account: DEMO }), protection = f.stores.get(DEMO)[name].protections[0];
    if (defect === 'audience') protection.getTargetAudiences = () => [{ getAudienceId: () => 'synthetic_school_group' }];
    else delete protection.getTargetAudiences;
    fails(() => f.session(), 'protection_mismatch'); assert.equal(writes(f), 0);
  }
});

test('公開session/受付にprivate rubric・模範解答・非公開期待値を含めず、source/propertyを変更しない', () => {
  const f = trialApiFixture({ account: DEMO }), before = f.T.canonical(f.properties.getProperties());
  const session = f.session(), receipt = f.call('submit', f.submission()).receipt;
  const output = JSON.stringify([session, receipt]);
  for (const secret of ['private_secret_variable', 'PRIVATE_EXPECTED_OUTPUT', 'PRIVATE_RUBRIC_TITLE', 'PRIVATE_MODEL_CODE', 'PRIVATE_TEACHER_NOTE', 'PRIVATE_CONFIRM_EXPECTED']) assert(!output.includes(secret), secret);
  assert.equal(f.T.canonical(f.properties.getProperties()), before);
  assert.equal(f.properties.writes.length, 0); assert.equal(f.properties.deletes.length, 0);
  assert.equal(f.state.evaluationCalls, 0); assert.equal(f.state.oldGraderCalls, 0);
});

test('提出はlocal reportの整合だけ検査し、サーバーevaluator/旧gradeを呼ばない', () => {
  const f = trialApiFixture({ account: DEMO }), input = f.submission({ code: 'pass', stdout: '' });
  // Participation measurement accepts an internally consistent local report;
  // its HMAC is receipt integrity, never a claim that Python was executed here.
  for (const check of input.assessment.checks) { check.passed = true; check.eligible = true; }
  input.assessment.earned = input.assessment.total = input.assessment.checks.reduce((sum, check) => sum + check.points, 0);
  input.assessment.starEarned = input.assessment.starTotal; input.assessment.score = 1;
  const result = f.call('submit', input);
  assert.equal(result.receipt.score, 1); assert.equal(result.receipt.trial, true);
  assert.equal(result.receipt.assessmentSource, 'local-report');
  assert.equal(f.state.evaluationCalls, 0); assert.equal(f.state.oldGraderCalls, 0);
});

test('得点/分母/★/checkの不整合と未知metadataを保存前に拒否する', () => {
  const f = trialApiFixture({ account: DEMO });
  const mutations = [
    input => { input.assessment.score = 0.5; },
    input => { input.assessment.earned++; },
    input => { input.assessment.total++; },
    input => { input.assessment.starEarned = 0; },
    input => { input.assessment.starTotal++; },
    input => { input.assessment.checks[1].points++; },
    input => { input.assessment.checks[1].id = input.assessment.checks[0].id; },
    input => { input.assessment.checks[0].eligible = false; },
    input => { input.assessment.checks[0].passed = 'true'; },
    input => { input.assessment.codeHash = 'd'.repeat(64); },
    input => { input.assessment.evidenceHash = 'd'.repeat(64); },
    input => { input.assessment.policyHash = 'd'.repeat(64); },
    input => { input.assessment.rubricVersion = 'other'; },
    input => { input.assessment.score = NaN; },
    input => { input.assessment.diagnostics = ['x'.repeat(1001)]; }
  ];
  for (const mutate of mutations) { const input = f.submission(); mutate(input); fails(() => f.call('submit', input), 'assessment_mismatch'); }
  const extra = f.submission(); extra.assessment.checks[0].serverVerified = true;
  fails(() => f.call('submit', extra), 'invalid_request');
  const extraReport = f.submission(); extraReport.assessment.receivedAt = new Date(f.now()).toISOString();
  fails(() => f.call('submit', extraReport), 'invalid_request');
  assert.equal(stored(f), 0); assert.equal(writes(f), 0);
  assert.equal(f.lockState(DEMO).held, false);
});

test('未配点・確認問題・別scope・未知問題へ正式な試用評価を作らない', () => {
  const f = trialApiFixture({ account: DEMO });
  for (const questionId of ['ungraded', 'check1']) {
    const input = { ...f.submission(), questionId };
    fails(() => f.call('submit', input), 'assessment_unavailable');
  }
  fails(() => f.call('submit', { ...f.submission(), questionId: 'unknown' }), 'question_denied');
  fails(() => f.call('submit', { ...f.submission(), scopeId: id(99) }), 'scope_mismatch');
  fails(() => f.call('submit', { ...f.submission(), policyHash: 'f'.repeat(64) }), 'policy_changed');
  assert.equal(stored(f), 0);
});

test('受付時刻は処理/lock待ち前のserver到着時刻を署名し、提出とDrive下書きを分離する', () => {
  const f = trialApiFixture({ account: DEMO }), input = f.submission(), arrived = new Date(f.now()).toISOString(), oldLock = f.env.userLock;
  f.env.userLock = () => { const lock = oldLock(); return { ...lock, tryLock(time) { f.advance(60000); return lock.tryLock(time); } }; };
  const result = f.call('submit', input), receipt = result.receipt;
  assert.equal(receipt.receivedAt, arrived); assert.equal(receipt.dueAt, null);
  assert.equal(receipt.payloadHash, f.T.hash(f.T.canonical(input)));
  assert.equal(receipt.storeKey, f.T.hash(f.stores.get(DEMO).entry.spreadsheetId + ':' + f.stores.get(DEMO).entry.generation));
  assert.equal(receipt.checks.reduce((sum, check) => sum + check.earned, 0), receipt.earned);
  assert.equal(f.stores.get(DEMO).data.writes.length, 0); assert.equal(f.stores.get(DEMO).confirmation.writes.length, 0);
  assert.equal(f.central.sheet.writes.length, 0); assert.equal(stored(f), 1);
});

test('同じ不変要求は元受付を返し、変更再送を拒否、旧要求照会と問ごとの最高評価を保持する', () => {
  const f = trialApiFixture({ account: DEMO }), old = f.submission({ code: 'pass', stdout: '' }), first = f.call('submit', old), count = writes(f);
  f.advance(3600000);
  const duplicate = f.call('submit', old);
  assert.deepEqual(plain(duplicate.receipt), plain(first.receipt)); assert.equal(writes(f), count);
  const changed = f.submission({ requestId: old.requestId });
  fails(() => f.call('submit', changed), 'request_reused');
  const newer = f.submission(), best = f.call('submit', newer);
  const lookup = f.call('lookup', { scopeId: f.config.scopeId, requestId: old.requestId });
  assert.equal(lookup.receipt.requestId, old.requestId); assert.equal(lookup.receipt.receivedAt, first.receipt.receivedAt);
  assert.equal(lookup.history.length, 2); assert.equal(lookup.bestScore, best.receipt.score);
  assert.deepEqual(plain(lookup.rating), plain(best.rating));
  assert.equal(f.call('lookup', { scopeId: f.config.scopeId, requestId: id(9999) }).receipt, null);
  const status = f.call('questionStatus', { scopeId: f.config.scopeId, questionId: 'q1', version: 'v1' });
  assert.equal(status.receipt.requestId, newer.requestId); assert.equal(stored(f), 2);
});

test('部分write/commit前の応答消失は未提出とし、同ID再送で元時刻のまま完了する', () => {
  for (const phase of ['payload', 'commit']) {
    const f = trialApiFixture({ account: DEMO }), input = f.submission(), at = new Date(f.now()).toISOString(), ledger = f.stores.get(DEMO).ledger;
    ledger.writeFailure = range => phase === 'payload' && range.column === 1 ? { after: 3 } : phase === 'commit' && range.column === 2 ? { after: 0 } : null;
    const failed = f.rpc('submit', input);
    assert.equal(failed.ok, false); assert.equal(failed.error.code, 'storage_write_uncertain');
    assert.equal(ledger.cells.get('2,2'), 'j:pending');
    fails(() => f.call('lookup', { scopeId: f.config.scopeId, requestId: input.requestId }), 'storage_incomplete');
    ledger.writeFailure = null; f.advance(3600000);
    const recovered = f.call('submit', input);
    assert.equal(recovered.receipt.receivedAt, at); assert.equal(stored(f), 1);
    assert.equal(f.lockState(DEMO).held, false);
  }
});

test('commit済みだが読戻し/応答が消失した要求は照会で確定し、重複保存しない', () => {
  const f = trialApiFixture({ account: DEMO }), input = f.submission(), ledger = f.stores.get(DEMO).ledger, at = new Date(f.now()).toISOString();
  ledger.readFailure = range => range.row === 2 && range.columns === 73 && ledger.cells.get('2,2') === 'j:committed';
  assert.equal(f.rpc('submit', input).ok, false); assert.equal(ledger.cells.get('2,2'), 'j:committed');
  ledger.readFailure = null; f.advance(100000);
  const result = f.call('lookup', { scopeId: f.config.scopeId, requestId: input.requestId }), count = writes(f);
  assert.equal(result.receipt.receivedAt, at);
  assert.deepEqual(plain(f.call('submit', input).receipt), plain(result.receipt)); assert.equal(writes(f), count);
});

test('旧版は旧policyで保存し、配布から外れた後も旧requestの署名/履歴を照会できる', () => {
  const f = trialApiFixture({ account: DEMO }), old = f.submission({ version: 'v0' }), original = f.call('submit', old);
  assert.equal(original.receipt.rubricVersion, 'grade-v0');
  const current = f.call('submit', f.submission()); assert.equal(current.receipt.rubricVersion, 'grade-v1');
  f.select(OWNER); f.preview.state.groups = f.preview.state.groups.filter(group => group.version !== 'v0'); f.preview.publish(); f.select(DEMO);
  const lookup = f.call('lookup', { scopeId: f.config.scopeId, requestId: old.requestId });
  assert.equal(lookup.receipt.rubricVersion, 'grade-v0'); assert.equal(lookup.history.length, 1);
  assert.deepEqual(plain(f.call('submit', old).receipt), plain(original.receipt));
  const unavailable = { ...old, requestId: id(666) }; fails(() => f.call('submit', unavailable), 'question_denied');
});

test('署名改変・別GSS/別actorへのコピーは保存済みと見なさず元データを保持する', () => {
  const f = trialApiFixture({ account: DEMO }), result = f.call('submit', f.submission()), service = f.context.ToolsSchoolTrial.create(f.env);
  assert.equal(service.verifyReceipt(result.receipt, f.config, { actorKey: f.T.actorKey(DEMO) }), true);
  for (const change of [{ score: 0 }, { storeKey: 'f'.repeat(64) }, { actorKey: f.T.actorKey(OWNER) }, { receivedAt: '2026-10-01T00:00:00.000Z' }]) {
    assert.equal(service.verifyReceipt({ ...result.receipt, ...change }, f.config, { actorKey: f.T.actorKey(DEMO) }), false);
  }
  const rows = f.stores.get(DEMO).ledger.getRange(2, 1, 1, 73).getValues();
  f.stores.get(SECOND).ledger.getRange(2, 1, 1, 73).setValues(rows); f.select(SECOND);
  fails(() => f.call('session'), 'storage_corrupt');
  f.select(DEMO); mutateMeta(f, meta => { meta.receipt.earned++; });
  const count = writes(f);
  fails(() => f.call('lookup', { scopeId: f.config.scopeId, requestId: result.receipt.requestId }), 'storage_corrupt');
  assert.equal(writes(f), count); assert.equal(stored(f, DEMO), 1);
});

test('中央回収はownerのみ、3名同IDを両立し、署名と元本文を保持して重複回収しない', () => {
  const f = trialApiFixture(), originals = new Map();
  for (const account of [OWNER, SECOND, DEMO]) { f.select(account); const input = f.submission({ requestId: id(1000) }); originals.set(account, { input, receipt: plain(f.call('submit', input).receipt) }); }
  f.select(SECOND); fails(() => f.collect(), 'account_denied'); f.select(DEMO); fails(() => f.collect(), 'account_denied');
  assert.equal(f.central.sheet.getLastRow(), 1);
  f.select(OWNER); assert.equal(f.collect().copied, 3); assert.equal(f.collect().copied, 0);
  assert.equal(f.central.sheet.getLastRow(), 4);
  const repo = f.context.ToolsSchoolTrialRepository.create(f.central, { sheetName: '試用提出', rows: 8193,
    verifyReceipt: receipt => f.context.ToolsSchoolTrial.create(f.env).verifyReceipt(receipt, f.config), flush() {} });
  for (const account of [OWNER, SECOND, DEMO]) assert.deepEqual(plain(repo.read(f.T.actorKey(account), id(1000))), originals.get(account));
  assert.equal(f.state.scriptLock.held, false); assert.equal(f.state.scriptLock.acquisitions, f.state.scriptLock.releases);
});

test('中央部分書込は次の回収で完了し、個人/中央いずれかの改変は黙って上書きしない', () => {
  const f = trialApiFixture({ account: DEMO }), input = f.submission(), original = f.call('submit', input).receipt;
  f.select(OWNER); f.central.sheet.writeFailure = range => range.column === 1 ? { after: 3 } : null;
  fails(() => f.collect(), 'storage_write_uncertain'); assert.equal(f.central.sheet.cells.get('2,2'), 'j:pending');
  f.central.sheet.writeFailure = null; assert.equal(f.collect().copied, 1);
  const meta = JSON.parse(f.central.sheet.cells.get('2,3').slice(2)); assert.equal(meta.receipt.signature, original.signature);
  meta.receipt.starEarned = 900; f.central.sheet.cells.set('2,3', 'j:' + f.T.canonical(meta));
  const before = [...f.central.sheet.cells.entries()]; fails(() => f.collect(), 'storage_corrupt'); assert.deepEqual([...f.central.sheet.cells.entries()], before);
  assert.equal(f.state.scriptLock.held, false);
});

test('回収1回の上限20件を守り、次回は残りだけを受理する', () => {
  const f = trialApiFixture({ account: DEMO });
  for (let n = 0; n < 21; n++) f.call('submit', f.submission({ requestId: id(2000 + n) }));
  f.select(OWNER); assert.equal(f.collect().copied, 20); assert.equal(f.collect().copied, 1); assert.equal(f.collect().copied, 0);
  assert.equal(f.central.sheet.getLastRow(), 22);
});

test('catalog取得とprivate snapshotの間にgenerationが変われば混在sessionを返さない', () => {
  const f = trialApiFixture({ account: DEMO }), original = f.env.previewSession;
  f.env.previewSession = origin => {
    const result = original(origin);
    // Identical adopted versions are immutable; republishing still advances the package generation.
    f.select(OWNER); f.preview.publish(); f.select(DEMO);
    return result;
  };
  fails(() => f.call('session'), 'snapshot_changed'); assert.equal(writes(f), 0);
});

test('停止/設定変更/認証切れを接続後も再検証し、内部例外は公開wrapperで一般化する', () => {
  const f = trialApiFixture({ account: DEMO }), connection = f.session().store.connection;
  f.config.enabled = false; f.writeConfig(); fails(() => storeCall(f, connection, 'session'), 'trial_disabled');
  f.config.enabled = true; f.writeConfig(); f.identity.effective = OWNER;
  fails(() => storeCall(f, connection, 'session'), 'account_denied'); f.select(DEMO);
  f.advance(3600000); fails(() => storeCall(f, connection, 'session'), 'binding_expired');
  f.env.open = () => { throw new Error('PRIVATE_DATABASE_ID_AND_SECRET'); };
  const result = f.rpc('submit', f.submission());
  assert.equal(result.ok, false); assert.equal(result.error.code, 'trial_unavailable');
  assert(!JSON.stringify(result).includes('PRIVATE_DATABASE_ID')); assert.equal(writes(f), 0);
});

test('書込途中の停止/本人変更も再照合し、pendingを成功扱いせず元要求から回復する', () => {
  for (const mode of ['disabled', 'identity']) {
    const f = trialApiFixture({ account: DEMO }), input = f.submission(), at = new Date(f.now()).toISOString();
    const originalFlush = f.context.SpreadsheetApp.flush;
    f.context.SpreadsheetApp.flush = () => {
      originalFlush();
      if (mode === 'disabled') { f.config.enabled = false; f.writeConfig(); }
      else f.select(FOURTH);
    };
    const result = f.rpc('submit', input);
    assert.equal(result.ok, false); assert.equal(result.error.code, mode === 'disabled' ? 'trial_disabled' : 'account_denied');
    assert.equal(f.stores.get(DEMO).ledger.cells.get('2,2'), 'j:pending');
    assert.equal(f.lockState(DEMO).held, false);
    f.context.SpreadsheetApp.flush = originalFlush; f.config.enabled = true; f.writeConfig(); f.select(DEMO); f.advance(100000);
    assert.equal(f.call('submit', input).receipt.receivedAt, at); assert.equal(stored(f), 1);
  }
});

test('新規receiptはrepoに元inputを丸ごと保存し、公開resultにはinput/非公開snapshotを返さない', () => {
  const f = trialApiFixture({ account: DEMO }), input = f.submission(), output = f.call('submit', input);
  assert.deepEqual(recordAt(f).input, input);
  assert.deepEqual(recordAt(f).receipt, plain(output.receipt));
  assert(!Object.hasOwn(output, 'input')); assert(!Object.hasOwn(output.receipt, 'snapshot')); assert(!Object.hasOwn(output.receipt, 'rules'));
  assert.equal(output.history.length, 1);
});
