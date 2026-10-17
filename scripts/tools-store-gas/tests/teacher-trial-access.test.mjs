import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './store-fixture.mjs';

const teacher = 'teacher@example.test';
const otherTeacher = 'other-teacher@example.test';
const demo = 'demo@example.test';
const spreadsheetId = 'synthetic_spreadsheet_identifier_0001';
const request = n => n.toString(16).padStart(32, '0');
const plain = value => JSON.parse(JSON.stringify(value));
const query = { tool: 'python', questionId: 'trial-q1', version: 'v1' };
const code = (fn, expected) => assert.throws(fn, error => error.toolsStoreCode === expected, expected);

// Server-owned registry capability, deliberately kept out of config and RPC input.
function registryAccess(account, owner, role = 'teacherTrial', id = spreadsheetId) {
  return value => role === 'teacherTrial' && value.account === account && value.owner === owner && value.spreadsheetId === id;
}

function fixture(options = {}) {
  const account = options.account || teacher, owner = options.owner || teacher;
  const f = setup({ account, confirmation: true, config: { teacherOwners: [teacher, otherTeacher], ...options.config } });
  f.book.getOwner = () => ({ getEmail: () => owner });
  f.book.getEditors = () => (options.editors || []).map(email => ({ getEmail: () => email }));
  f.guide.cells.set('6,2', owner.trim().toLowerCase());
  for (const sheet of Object.values(f.sheets)) {
    for (const protection of sheet.protections) protection.canEdit = () => options.headerEditable !== false;
    sheet.writes = [];
  }
  const dep = { ...f.dependencies };
  delete dep.owner;
  delete dep.canEdit;
  if (Object.hasOwn(options, 'access')) dep.teacherTrialAccess = options.access;
  const service = f.context.ToolsStoreService.create(f.config, dep);
  const call = (action, input = {}, token = f.binding, origin = f.config.allowedOrigins[0]) => service.call(action, input, token, origin);
  const save = overrides => call('saveDraft', { ...query, setId: 'trial', title: '試用問題', folder: '',
    requestId: request(100), clientId: request(200), expectedRevision: null, code: 'print("teacher")', stdin: '', ...overrides });
  return { ...f, dep, call, save };
}

function noWrites(f) {
  assert.equal(Object.values(f.sheets).reduce((sum, sheet) => sum + sheet.writes.length, 0), 0);
  assert.equal(f.locks.held, false);
  assert.equal(f.locks.acquisitions, f.locks.releases);
}

function uploadJournal(f, value) {
  const body = f.T.canonical(value), requestId = request(300);
  f.call('beginConfirmationSave', { tool: 'python', requestId, expectedRevision: null,
    journalHash: f.T.hash(body), byteLength: Buffer.byteLength(body), chunkCount: 1 });
  f.call('putConfirmationChunk', { tool: 'python', requestId, index: 0, text: body });
  const saved = f.call('saveConfirmationJournal', { tool: 'python', requestId, expectedRevision: null });
  assert.equal(f.call('lookupConfirmationSave', { tool: 'python', requestId }).revision, saved.revision);
  const manifest = f.call('getConfirmationJournal', { tool: 'python' });
  const chunk = f.call('getConfirmationJournalChunk', { tool: 'python', revision: manifest.revision, readId: manifest.readId, index: 0 });
  assert.equal(chunk.chunkHash, f.T.hash(chunk.text));
  assert.deepEqual(JSON.parse(chunk.text), value);
  f.call('releaseConfirmationRead', { tool: 'python', revision: manifest.revision, readId: manifest.readId });
}

test('通常既定では教員の自己所有GSSを拒否し、configフラグでは例外化できない', () => {
  for (const config of [{}, { teacherTrialAccess: true }, { teacherTrial: true }]) {
    const f = fixture({ config });
    code(() => f.call('session'), 'owner_mismatch');
    code(() => f.save(), 'owner_mismatch');
    noWrites(f);
  }
});

test('server callbackのstrict trueだけが自己所有者のeditor省略と編集可能な実保護を許可する', () => {
  const received = [];
  const f = fixture({ access(value) { received.push(plain(value)); return registryAccess(teacher, teacher)(value); } });
  // Spreadsheet.getEditors() does not include the owner. The capability is not a fake editor list.
  assert.deepEqual(f.book.getEditors(), []);
  assert.equal(f.call('session').account, teacher);
  const saved = f.save();
  assert.equal(saved.state, 'saved');
  assert.equal(f.call('getDraft', query).draft.code, 'print("teacher")');
  assert.equal(f.call('lookupSave', { tool: 'python', requestId: request(100) }).draft.revision, saved.draft.revision);
  assert.equal(f.call('listDrafts', { tool: 'python' }).drafts.length, 1);
  const source = 'print("teacher")';
  uploadJournal(f, { schema: 1, trials: [{ schema: 1, id: 'trial-1', source: { questionId: query.questionId, version: query.version },
    code: source, codeHash: f.T.hash(source), inputs: [], stdout: 'teacher\n', stderr: '', outcome: 'success', truncated: false,
    at: '2026-10-17T12:00:00.000Z' }], responses: {} });
  assert(received.length >= 12);
  assert(received.every(value => JSON.stringify(value) === JSON.stringify({ account: teacher, owner: teacher, spreadsheetId })));
  assert.equal(f.locks.held, false);
  assert.equal(f.locks.acquisitions, f.locks.releases);
});

test('別教員所有の試用は実editorを必要とし、owner許可外をcallbackで迂回できない', () => {
  const access = registryAccess(otherTeacher, teacher);
  const accepted = fixture({ account: otherTeacher, owner: teacher, editors: [otherTeacher], access });
  assert.equal(accepted.call('session').account, otherTeacher);
  assert.equal(accepted.save().state, 'saved');
  const denied = fixture({ account: otherTeacher, owner: teacher, access });
  code(() => denied.call('session'), 'permission_denied');
  code(() => denied.save(), 'permission_denied');
  noWrites(denied);
  let calls = 0;
  const wrongOwner = fixture({ owner: 'unregistered@example.test', editors: [teacher], access() { calls++; return true; } });
  code(() => wrongOwner.call('session'), 'owner_mismatch');
  assert.equal(calls, 0);
  noWrites(wrongOwner);
});

test('callback未設定・非関数・truthy・非同期結果は教員試用を有効にしない', () => {
  for (const result of [false, undefined, 1, 'true', {}, Promise.resolve(true)]) {
    const f = fixture({ access: () => result });
    code(() => f.call('session'), 'owner_mismatch');
    noWrites(f);
  }
  const nonFunction = fixture({ access: true });
  code(() => nonFunction.call('session'), 'owner_mismatch');
  noWrites(nonFunction);
});

test('デモは通常の生徒ガードを通り、teacherTrial以外のregistry roleでは自己所有/編集可能保護を拒否する', () => {
  const valid = fixture({ account: demo, owner: teacher, editors: [demo], headerEditable: false });
  assert.equal(valid.call('session').account, demo);
  assert.equal(valid.save().state, 'saved');
  const editableHeader = fixture({ account: demo, owner: teacher, editors: [demo] });
  code(() => editableHeader.call('session'), 'protection_mismatch');
  noWrites(editableHeader);
  const wrongRole = fixture({ account: demo, owner: teacher, editors: [demo], access: registryAccess(demo, teacher, 'demo') });
  code(() => wrongRole.call('session'), 'protection_mismatch');
  noWrites(wrongRole);
  const own = fixture({ account: demo, owner: demo, config: { teacherOwners: [teacher, demo] }, access: registryAccess(demo, demo, 'demo') });
  code(() => own.call('session'), 'owner_mismatch');
  noWrites(own);
});

test('教員試用でもguide・全ヘッダーの実範囲保護を必須とし、欠落/警告のみ/部分保護を拒否する', () => {
  for (const name of ['guide', 'data', 'history', 'confirmation', 'confirmationReceipts']) {
    for (const defect of ['missing', 'warning', 'partial']) {
      const f = fixture({ access: registryAccess(teacher, teacher) }), sheet = f[name];
      const range = sheet.protections[0].getRange();
      if (defect === 'missing') sheet.protections = [];
      if (defect === 'warning') sheet.protections[0].isWarningOnly = () => true;
      if (defect === 'partial') {
        sheet.protections = [];
        sheet.protectRange(range.getRow(), range.getColumn(), range.getLastRow() - range.getRow() + 1,
          range.getLastColumn() - range.getColumn(), { editable: true });
      }
      const action = name.startsWith('confirmation') ? () => f.call('getConfirmationJournal', { tool: 'python' }) : () => f.call('session');
      code(action, 'protection_mismatch');
      noWrites(f);
    }
  }
});

test('教員試用でも本文を編集できないrange/sheet保護と構造不一致を拒否する', () => {
  for (const kind of ['range', 'sheet']) {
    const f = fixture({ access: registryAccess(teacher, teacher) });
    if (kind === 'range') f.data.protectRange(2, 1, 10, 14);
    else f.data.sheetProtections = [{ isWarningOnly: () => false, canEdit: () => false }];
    code(() => f.save(), 'body_not_editable');
    noWrites(f);
  }
  const editable = fixture({ access: registryAccess(teacher, teacher) });
  editable.data.protectRange(2, 1, 10, 14, { editable: true });
  editable.data.sheetProtections = [{ isWarningOnly: () => false, canEdit: () => true }];
  assert.equal(editable.save().state, 'saved');
  for (const mutate of [
    f => { f.data.cells.set('1,1', 'changed'); },
    f => { f.guide.cells.set('6,2', otherTeacher); },
    f => { f.data.hidden = false; },
    f => { f.guide.cells.set('3,2', 'b'.repeat(32)); },
    f => { f.guide.cells.set('4,2', 'upgrading'); }
  ]) {
    const f = fixture({ access: registryAccess(teacher, teacher) }); mutate(f);
    assert.throws(() => f.save()); noWrites(f);
  }
});

test('client role/例外フラグと別本人/originはcallback前に拒否する', () => {
  let calls = 0;
  const f = fixture({ access() { calls++; return true; } });
  for (const input of [{ role: 'teacherTrial' }, { teacherTrialAccess: true }, { spreadsheetId }]) code(() => f.call('session', input), 'invalid_request');
  code(() => f.save({ role: 'teacherTrial' }), 'invalid_request');
  code(() => f.call('session', {}, f.binding, 'https://other.example'), 'origin_denied');
  f.identity.effective = otherTeacher;
  code(() => f.call('session'), 'execution_mode_mismatch');
  f.identity.effective = teacher;
  code(() => f.call('session', {}, f.issue({ account: otherTeacher })), 'account_mismatch');
  assert.equal(calls, 0);
  noWrites(f);
});

test('capabilityはRPCごとに再照合し、失効/registry違いで接続済み権限を残さない', () => {
  let enabled = true;
  const f = fixture({ access: value => enabled && registryAccess(teacher, teacher)(value) });
  assert.equal(f.call('session').account, teacher);
  enabled = false;
  code(() => f.save(), 'owner_mismatch');
  code(() => f.call('getConfirmationJournal', { tool: 'python' }), 'owner_mismatch');
  noWrites(f);
  for (const access of [registryAccess(otherTeacher, teacher), registryAccess(teacher, otherTeacher), registryAccess(teacher, teacher, 'teacherTrial', 'differentGSS')]) {
    const mismatch = fixture({ access });
    code(() => mismatch.call('session'), 'owner_mismatch'); noWrites(mismatch);
  }
});

test('callback例外はfail closedでUserLockを解放し、保存先を変更しない', () => {
  const f = fixture({ access() { throw new Error('synthetic registry unavailable'); } });
  assert.throws(() => f.save(), /synthetic registry unavailable/);
  noWrites(f);
});
