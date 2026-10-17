// Real preview/package, local-policy, school-trial, store and repository code;
// only Google identity/Sheets/properties/locks are synthetic. No network.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { teacherPreviewFixture } from '../../pythoneditor-preview-gas/tests/fixture.mjs';
import { FakeSheet } from '../../tools-store-gas/tests/store-fixture.mjs';
import { compileAssessment, evaluateAssessment, assessmentCodeHash } from '../../../tools/pythoneditor/local-assessment.mjs';

export const OWNER = 'codex-fixture-owner@gfe.kaijo.ed.jp';
export const SECOND = 'codex-fixture-teacher@gfe.kaijo.ed.jp';
export const DEMO = 'codex-fixture-demo@gfe.kaijo.ed.jp';
export const FOURTH = 'codex-fixture-fourth@gfe.kaijo.ed.jp';
export const id = value => value.toString(16).padStart(32, '0');
export const plain = value => JSON.parse(JSON.stringify(value));

export function trialApiFixture(options = {}) {
  const preview = teacherPreviewFixture(), { context, T, identity, properties } = preview;
  const setId = options.setId || 'demo';
  preview.config.teacherAccounts = [OWNER, SECOND];
  preview.config.demoAccounts = [DEMO];
  preview.config.editorOrigin = options.origin || preview.config.editorOrigin;
  identity.active = identity.effective = OWNER;
  preview.config.enabled = false;
  properties.setProperty(context.ToolsTeacherPreview.keys.config, T.canonical(preview.config));
  function record(version = 'v1', { graded = true, questionId = 'q1', keyword = 'private_secret_variable=7' } = {}) {
    const entry = preview.snapshot({ setId, version, questionId, prompt: '公開する合成問題', rule: keyword });
    Object.assign(entry.body, { graded, gradingVersion: 'grade-' + version, ranges: [{ regionId: 'whole', scoringId: questionId, startMarker: null, endMarker: null }],
      rules: { [questionId]: { schemaVersion: 2, minLines: 1, title: 'PRIVATE_RUBRIC_TITLE', answerCode: 'PRIVATE_MODEL_CODE',
        rules: [{ ruleId: 'private-code', target: 'code', ruleType: 'match', stepNo: 1, stepMode: 'single', keyword, points: 2, enabled: true },
          { ruleId: 'private-output', target: 'output', ruleType: 'match', stepNo: 1, stepMode: 'single', keyword: 'PRIVATE_EXPECTED_OUTPUT', points: 1, enabled: true }] } },
      teacherNote: 'PRIVATE_TEACHER_NOTE' });
    entry.payloadHash = T.hash(T.canonical(entry.body));
    return entry;
  }
  preview.state.groups = [{ setId, version: 'v1', title: '限定試用・合成セット', records: [record(), record('v1', { graded: false, questionId: 'ungraded' })] },
    { setId, version: 'v0', title: '旧版・合成セット', records: [record('v0')] }];
  const confirmation = preview.snapshot({ setId, questionId: 'check1', prompt: '7を入力して試し、記録を選んでください。' });
  const refs = [{ questionId: 'q1', version: 'v1' }], check = { cases: [{ id: 'seven', label: '7を入力する',
    inputs: [{ index: 0, kind: 'integer', op: 'eq', value: 7 }] }], private: { expectedOutputs: { seven: { mode: 'lastLine', text: 'PRIVATE_CONFIRM_EXPECTED' } } } };
  Object.assign(confirmation.body.question, { kind: 'confirmation', order: 3, title: '合成の確認問題', templateCode: '', codeRefs: refs,
    checkType: 'inputCases', checkConfig: plain(context.PythonEditorConfirmation.publicCheck('inputCases', check)) });
  Object.assign(confirmation.body, { ranges: [], rules: {}, graded: false,
    confirmation: { codeRefs: refs, checkType: 'inputCases', checkConfig: plain(context.PythonEditorConfirmation.normalizeCheck('inputCases', check)) } });
  confirmation.payloadHash = T.hash(T.canonical(confirmation.body));
  preview.state.groups[0].records.push(confirmation);
  preview.enable();

  const state = { opens: [], flushes: 0, evaluationCalls: 0, oldGraderCalls: 0, uuid: 3000, userLocks: new Map(), scriptLock: { held: false, acquisitions: 0, releases: 0 } };
  const books = new Map(), stores = new Map();
  context.SpreadsheetApp = { ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' }, flush() { state.flushes++; }, openById(id) { return open(id); } };
  for (const name of ['../../tools-store-gas/common/06_tools_confirmation_contract.js', '../../tools-store-gas/store/01_tools_store_config.js',
    '../../tools-store-gas/store/40_tools_store_repository.js', '../../tools-store-gas/store/41_confirmation_repository.js', '../../tools-store-gas/store/10_tools_store_api.js',
    '../08_local_assessment.js', '../50_trial_repository.js', '../70_trial_api.js']) vm.runInContext(readFileSync(new URL(name, import.meta.url), 'utf8'), context);

  const C = T.constants, R = context.ToolsSchoolTrialRepository.constants;
  const config = { schema: 1, enabled: true, scopeId: id(90), editorOrigin: preview.config.editorOrigin,
    ownerAccount: OWNER, centralId: options.centralDisabled ? null : 'synthetic_trial_central_identifier_0001', participants: [OWNER, SECOND, DEMO].map((account, n) => ({ account,
      role: n < 2 ? 'teacherTrial' : 'demo', spreadsheetId: 'synthetic_trial_personal_identifier_000' + (n + 1), ownerAccount: OWNER, generation: id(100 + n) })) };
  function makeSheet(name, rows, headers, hidden = true) {
    const sheet = new FakeSheet(name, rows, headers.length, hidden);
    sheet.getRange(1, 1, 1, headers.length).setValues([[...headers]]);
    const protection = sheet.protectRange(1, 1, 1, headers.length);
    protection.canEdit = () => [OWNER, SECOND].includes(identity.active);
    protection.getTargetAudiences = () => [];
    sheet.writes = [];
    return sheet;
  }
  for (const entry of config.participants) {
    const guide = new FakeSheet(C.GUIDE, 100, 2, false);
    guide.getRange(1, 1, 6, 2).setValues([['schemaVersion', 1], ['actorKey', T.actorKey(entry.account)], ['generation', entry.generation], ['state', 'active'], ['kind', C.KIND], ['teacherOwner', OWNER]]);
    const guideProtection = guide.protectRange(1, 1, 6, 2);
    guideProtection.canEdit = () => [OWNER, SECOND].includes(identity.active);
    guideProtection.getTargetAudiences = () => [];
    guide.writes = [];
    const sheets = new Map([[C.GUIDE, guide], [C.SHEET, makeSheet(C.SHEET, C.DRAFT_ROWS, C.HEADERS)], [C.HISTORY, makeSheet(C.HISTORY, C.HISTORY_ROWS, C.HEADERS)],
      [C.CONFIRMATION.SHEET, makeSheet(C.CONFIRMATION.SHEET, C.CONFIRMATION.ROWS, C.CONFIRMATION.HEADERS)],
      [C.CONFIRMATION.RECEIPTS, makeSheet(C.CONFIRMATION.RECEIPTS, C.CONFIRMATION.RECEIPT_ROWS, C.CONFIRMATION.RECEIPT_HEADERS)], [R.SHEET, makeSheet(R.SHEET, R.ROWS, R.HEADERS)]]);
    const book = { owner: OWNER, editors: entry.account === OWNER ? [] : [entry.account], viewers: [], sheets,
      getOwner() { return { getEmail: () => this.owner }; }, getEditors() { return [...new Set([this.owner, ...this.editors])].map(account => ({ getEmail: () => account })); },
      getViewers() { return [...new Set([this.owner, ...this.editors, ...this.viewers])].map(account => ({ getEmail: () => account })); }, getSheetByName(name) { return this.sheets.get(name) || null; } };
    books.set(entry.spreadsheetId, book);
    stores.set(entry.account, { entry, book, sheets, guide, data: sheets.get(C.SHEET), history: sheets.get(C.HISTORY), confirmation: sheets.get(C.CONFIRMATION.SHEET),
      confirmationReceipts: sheets.get(C.CONFIRMATION.RECEIPTS), ledger: sheets.get(R.SHEET) });
  }
  const central = options.centralDisabled ? null : { owner: OWNER, editors: [], viewers: [], sheet: makeSheet(R.CENTRAL, R.CENTRAL_ROWS, R.HEADERS),
    getOwner() { return { getEmail: () => this.owner }; }, getEditors() { return [...new Set([this.owner, ...this.editors])].map(account => ({ getEmail: () => account })); },
    getViewers() { return [...new Set([this.owner, ...this.editors, ...this.viewers])].map(account => ({ getEmail: () => account })); }, getSheetByName(name) { return name === R.CENTRAL ? this.sheet : null; } };
  if (central) books.set(config.centralId, central);
  function open(id) { state.opens.push(id); const book = books.get(id); if (!book) throw new Error('synthetic private unknown GSS'); return book; }
  function lockState(key) { if (!state.userLocks.has(key)) state.userLocks.set(key, { held: false, acquisitions: 0, releases: 0 }); return state.userLocks.get(key); }
  function makeLock(value) { return { tryLock() { if (value.held || value.denied) return false; value.held = true; value.acquisitions++; return true; },
    releaseLock() { value.held = false; value.releases++; } }; }
  const userLock = () => makeLock(lockState(identity.active));
  const scriptLock = () => makeLock(state.scriptLock);
  context.PropertiesService = { getScriptProperties: () => properties };
  context.Session = { getActiveUser: () => ({ getEmail: () => identity.active }), getEffectiveUser: () => ({ getEmail: () => identity.effective }) };
  context.LockService = { getUserLock: userLock, getScriptLock: scriptLock };
  context.toolsTeacherPreviewEnvironment_ = () => preview.env;
  properties.setProperty(context.ToolsSchoolTrial.keys.config, T.canonical(config));
  properties.setProperty(context.ToolsSchoolTrial.keys.binding, 'synthetic-school-trial-binding-key-only');
  properties.setProperty(context.ToolsSchoolTrial.keys.signing, 'synthetic-school-trial-signing-key-only');
  properties.setProperty('PYTHON_EDITOR_SCHOOL_TRIAL_URL_V1', 'https://script.google.com/macros/s/synthetic_school_trial_only/exec');
  const env = { ...context.schoolTrialEnvironment_(), now: preview.now, open, userLock, scriptLock,
    storeDependencies() { return { now: preview.now, uuid: () => id(state.uuid++), lock: userLock, flush() { state.flushes++; } }; } };
  context.schoolTrialEnvironment_ = () => env;
  const local = context.PythonEditorLocalAssessment;
  context.PythonEditorLocalAssessment = Object.freeze({ ...local, evaluate() { state.evaluationCalls++; throw new Error('server evaluator must not run'); } });
  context.PythonEditorGraderV1 = Object.freeze({ grade() { state.oldGraderCalls++; throw new Error('old grader must not run'); } });
  context.gradeNotebook = () => { state.oldGraderCalls++; throw new Error('legacy route must not run'); };
  const select = account => { identity.active = account; identity.effective = account; };
  select(options.account || OWNER);
  function call(action, input = {}, expectedActorKey = action === 'session' ? null : T.actorKey(identity.active), origin = config.editorOrigin) {
    return context.ToolsSchoolTrial.create(env).call(action, input, expectedActorKey, origin);
  }
  function rpc(action, input = {}, expectedActorKey = action === 'session' ? null : T.actorKey(identity.active), origin = config.editorOrigin) {
    return context.schoolPythonTrialRpc(action, input, expectedActorKey, origin);
  }
  function session(account) { if (account) select(account); return call('session'); }
  function submission(options = {}) {
    const { code = 'private_secret_variable=7\nprint("PRIVATE_EXPECTED_OUTPUT")', stdout = 'PRIVATE_EXPECTED_OUTPUT\n', questionId = 'q1', version = 'v1', requestId = id(state.uuid++), ...extra } = options;
    const body = preview.state.groups.flatMap(group => group.records).find(record => record.questionId === questionId && record.version === version)?.body;
    if (!body) throw new Error('unknown synthetic question');
    const policy = compileAssessment(plain(body));
    const run = { codeHash: assessmentCodeHash(code), outcome: 'success', truncated: false, outputText: stdout, stdout, inputEcho: '', stderr: '', errorText: '' };
    const input = { scopeId: config.scopeId, requestId, questionId, version, policyHash: policy.policyHash, code, stdin: '', run, ...extra };
    input.assessment = evaluateAssessment(policy, input);
    return input;
  }
  function writeConfig(next = config) { properties.setProperty(context.ToolsSchoolTrial.keys.config, T.canonical(next)); }
  function collect() { return context.ToolsSchoolTrial.create(env).collect(); }
  properties.writes = []; properties.deletes = []; state.opens = [];
  return { context, T, preview, properties, identity, config, books, stores, central, state, env, call, rpc, session, submission, select,
    collect, writeConfig, lockState, now: preview.now, advance: preview.advance, record };
}
