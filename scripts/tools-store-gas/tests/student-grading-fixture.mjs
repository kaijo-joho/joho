import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fakeUtilities } from './common-fixture.mjs';
import { FakeSheet, FakeRange } from './store-fixture.mjs';
export const T0 = '2026-10-15T00:00:00.000Z', DUE = '2026-10-15T01:00:00.000Z';
export const json = value => JSON.parse(JSON.stringify(value));
class GradingSheet extends FakeSheet {
  getLastColumn() { return Math.max(0, ...[...this.cells.entries()].filter(([, v]) => v !== '').map(([key]) => Number(key.split(',')[1]))); }
  insertRowsAfter(after, count) { if (after !== this.rows) throw Error('wrong insertion'); this.rows += count; }
}
function load() {
  const context = vm.createContext({ Utilities: fakeUtilities(), console, SpreadsheetApp: { ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' } } });
  const files = [
    new URL('../common/05_tools_store_contract.js', import.meta.url),
    ...['06_python_editor_contract.js', '07_python_editor_config.js', '13_python_editor_grader.js', '45_python_editor_store.js', '46_python_editor_master.js', '22_python_editor_api.js'].map(name => new URL('../../pythoneditor-gas/' + name, import.meta.url)),
    ...['31_grading_sync.js', '32_student_grading.js', '33_grading_collection.js'].map(name => new URL('../store/' + name, import.meta.url))
  ];
  for (const file of files) vm.runInContext(readFileSync(file, 'utf8'), context);
  return context;
}
export function fixture({ students = 1 } = {}) {
  const ctx = load(), P = ctx.PythonEditor, T = ctx.ToolsStoreContract;
  const teacher = 'teacher@example.test', centralId = 'synthetic_central_grading_book_0001';
  const headers = ctx.PythonEditorStore.headers;
  let clock = Date.parse(T0), next = 1, gradeCalls = 0, rechecks = 0;
  const propertiesData = new Map(), properties = { getProperty: key => propertiesData.get(key) || null, setProperty: (key, value) => { propertiesData.set(key, String(value)); }, deleteProperty: key => propertiesData.delete(key) };
  function makeBook(id, account, central = false) {
    const names = central ? Object.values(ctx.PythonEditorStore.names) : Object.values(ctx.ToolsStudentGrading.names);
    const sheets = {};
    for (const name of names) {
      const s = sheets[name] = new GradingSheet(name, central ? 10000 : 2049, 34, !central);
      s.getRange(1, 1, 1, 34).setValues([[...headers]]); s.protectRange(1, 1, 1, 34); s.writes = [];
    }
    if (!central) {
      const guide = sheets['使い方'] = new GradingSheet('使い方', 100, 2, false);
      guide.getRange(1, 1, 6, 2).setValues([['schemaVersion', 1], ['actorKey', T.actorKey(account)], ['generation', 'a'.repeat(32)], ['state', 'active'], ['kind', 'tools-store-v1'], ['teacherOwner', teacher]]);
      guide.protectRange(1, 1, 6, 2);
    }
    return { id, owner: teacher, editors: central ? [teacher] : [account], viewers: [], sheets, getId: () => id, getSheets: () => Object.values(sheets), getSheetByName: name => sheets[name] || null,
      getOwner() { return { getEmail: () => this.owner }; }, getEditors() { return this.editors.map(account => ({ getEmail: () => account })); }, getViewers() { return this.viewers.map(account => ({ getEmail: () => account })); } };
  }
  const books = new Map(), accounts = [], actors = {}, registry = [];
  const centralBook = makeBook(centralId, teacher, true); books.set(centralId, centralBook);
  for (let i = 0; i < students; i++) {
    const account = `student${String(i + 1).padStart(2, '0')}@example.test`, id = `synthetic_student_grading_book_${String(i + 1).padStart(4, '0')}`;
    accounts.push(account); actors[T.actorKey(account)] = { grade: 4, teacher: false }; registry.push({ account, spreadsheetId: id }); books.set(id, makeBook(id, account));
  }
  const assignments = [{ assignmentId: 'exercise1', setId: 'exercise', version: 'v1', year: 2026, grades: [4], enabled: true, official: true,
    startsAt: T0, dueAt: DUE, closesAt: '2026-10-17T01:00:00.000Z' }];
  const rawRules = [
    ['questionId', 'questionTitle', 'minLines', 'ruleId', 'target', 'ruleType', 'stepNo', 'stepMode', 'keyword', 'points', 'enabled', 'python', 'output', 'url', 'note'],
    ['q1', 'test', 2, 'code', 'code', 'match', 1, 'single', 'print', 1, true, '', '', '', ''],
    ['q1', 'test', 2, 'out', 'output', 'match', 1, 'single', 'value: 2', 1, true, '', '', '', '']
  ];
  const snapshotBody = { schema: 1, question: { questionId: 'q1', version: 'v1', setId: 'exercise', order: 1, title: '合成テスト', prompt: '合成テスト', templateCode: '# start\n\n# end', setupCode: '', kind: 'code' },
    gradingVersion: 'rubric-v1', engineVersion: ctx.PythonEditorGraderV1.engineVersion, graded: true,
    ranges: [{ regionId: 'r1', scoringId: 'q1', startMarker: '# start', endMarker: '# end' }], rules: ctx.PythonEditorGraderV1.parseRules(rawRules) };
  const snapshots = new Map();
  const central = ctx.PythonEditorStore.create({ storageSpreadsheetId: centralId }, { book: centralBook, hash: P.hashText, flush() {}, lock: () => ({ tryLock: () => true, releaseLock() {} }) });
  function freeze(body = snapshotBody, { toCentral = true } = {}) {
    const q = body.question;
    const record = { recordKey: P.key(q), groupKey: q.version + '/' + q.setId, actorKey: '', questionId: q.questionId, version: q.version, requestId: '', seq: 0, at: T0, payloadHash: P.hashText(P.canonical(body)), body: json(body) };
    snapshots.set(P.key(q), record); if (toCentral) central.putSnapshots([record], () => {}); return record;
  }
  freeze();
  const meta = { schema: 1, generation: 'd'.repeat(32), issuedAt: clock, expiresAt: clock + 86400000, payloadHash: 'e'.repeat(64) };
  const adopted = { meta, assignments, actors, registry, findSnapshot: q => snapshots.get(P.key(q)) || null,
    snapshots: (setId, version) => [...snapshots.values()].filter(r => r.body.question.setId === setId && r.version === version) };
  const packageService = { open: ({ expectedGeneration } = {}) => { if (expectedGeneration && expectedGeneration !== meta.generation) T.fail('packages_stale'); if (meta.expiresAt <= clock) T.fail('packages_expired'); return adopted; } };
  const config = { enabled: true, teacherOwners: [teacher], studentGrading: { enabled: true, collectorEnabled: true, signingKey: '1'.repeat(64), keyId: 'synthetic-v1',
    centralSpreadsheetId: centralId, teacherAccounts: [teacher], maxStudentsPerRun: 5, maxReceiptsPerStudent: 20 } };
  const deps = { properties, packages: packageService, now: () => clock, flush() {},
    grade: (body, input) => { gradeCalls++; return ctx.PythonEditorGraderV1.grade(body, input); } };
  const student = ctx.ToolsStudentGrading.create(config, deps);
  function bookFor(account = accounts[0]) { return books.get(registry.find(r => r.account === account).spreadsheetId); }
  function context(account = accounts[0], receivedAt = new Date(clock).toISOString()) {
    const book = bookFor(account), actorKey = T.actorKey(account);
    return { account, actorKey, book, receivedAt, binding: { account, actorKey, spreadsheetId: book.id, generation: 'a'.repeat(32) },
      recheck() { rechecks++; if (book.sheets['使い方'].getRange(4, 2).getValues()[0][0] !== 'active') T.fail('store_inactive'); } };
  }
  function call(action, input = {}, account = accounts[0], receivedAt) { return student.call(action, json(input), context(account, receivedAt)); }
  function submission(code = '# start\nx = 2\nprint("value:", x)\n# end', output = 'value: 2\n', requestId = (next++).toString(16).padStart(32, '0')) {
    return { tool: 'python', questionId: 'q1', version: 'v1', assignmentId: 'exercise1', requestId, code, stdin: '', run: { codeHash: P.hashText(code), outcome: 'success', truncated: false,
      outputText: output, stdout: output, inputEcho: '', stderr: '', errorText: '' } };
  }
  const triggers = [], collectorIdentity = { active: teacher, effective: teacher }, lockState = { held: false, acquisitions: 0 };
  const collectorDeps = { ...deps, central, identity: () => collectorIdentity,
    openBook: id => { if (!books.has(id)) throw Error('unavailable synthetic book'); return books.get(id); },
    triggers: () => triggers, createTrigger: (handler, minutes) => { const trigger = { getUniqueId: () => 'synthetic-collector-trigger-uid', getHandlerFunction: () => handler }; triggers.push(trigger); return trigger; }, deleteTrigger: trigger => triggers.splice(triggers.indexOf(trigger), 1),
    lock: () => ({ tryLock() { if (lockState.held) return false; lockState.held = true; lockState.acquisitions++; return true; }, releaseLock() { lockState.held = false; } }) };
  const collector = ctx.ToolsGradingCollection.create(config, collectorDeps);
  function stores(account = accounts[0]) { return ctx.ToolsStudentGrading.helpers.stores(config.studentGrading, deps, bookFor(account), T.actorKey(account)); }
  return { ctx, P, T, config, deps, collectorDeps, student, collector, accounts, actors, registry, adopted, packageService, meta, properties, propertiesData,
    snapshots, snapshotBody, freeze, assignments, central, centralBook, books, bookFor, call, context, submission, stores, collectorIdentity, lockState, triggers,
    setNow(value) { clock = typeof value === 'string' ? Date.parse(value) : value; }, gradeCalls: () => gradeCalls, rechecks: () => rechecks,
    rows(name, account = accounts[0]) { return bookFor(account).sheets[name].getLastRow() - 1; }, centralRows(name) { return centralBook.sheets[name].getLastRow() - 1; } };
}
