import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { loadCommon } from './common-fixture.mjs';

export class FakeGradingProperties {
  constructor(initial = {}) { this.values = { ...initial }; this.writes = []; this.deletes = []; }
  getProperty(key) { if (this.onRead) this.onRead(key, this); return Object.hasOwn(this.values, key) ? this.values[key] : null; }
  getProperties() { if (this.onReadAll) this.onReadAll(this); return { ...this.values }; }
  setProperty(key, value) {
    const fault = this.onWrite?.(key, value, this);
    if (fault === 'before') throw new Error('synthetic private source details');
    this.values[key] = fault === 'corrupt' ? value.slice(0, Math.max(1, value.length - 7)) : value;
    this.writes.push([key, value]);
    if (fault === 'after') throw new Error('synthetic private source details');
    return this;
  }
  deleteProperty(key) { if (this.onDelete?.(key, this)) throw new Error('synthetic GC failure'); delete this.values[key]; this.deletes.push(key); return this; }
}

export function gradingFixture(options = {}) {
  const { context, contract: T } = loadCommon(options.globals || {});
  for (const name of ['30_grading_packages.js', '31_grading_sync.js']) vm.runInContext(readFileSync(new URL('../store/' + name, import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../../pythoneditor-gas/06_python_editor_contract.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../../pythoneditor-gas/46_python_editor_master.js', import.meta.url), 'utf8'), context);
  const properties = options.properties || new FakeGradingProperties();
  let clock = Date.UTC(2026, 9, 15, 0, 0), nextId = 1;
  const lockState = { held: false, denied: false, acquired: 0, released: 0 };
  function lock() { return { tryLock() { if (lockState.held || lockState.denied) return false; lockState.held = true; lockState.acquired++; return true; }, releaseLock() { lockState.held = false; lockState.released++; } }; }
  const dependencies = { properties, now: () => clock, uuid: () => (nextId++).toString(16).padStart(32, '0'),
    gzip: text => gzipSync(Buffer.from(text, 'utf8')).toString('base64'), gunzip: text => gunzipSync(Buffer.from(text, 'base64')).toString('utf8'),
    byteLength: text => Buffer.byteLength(text, 'utf8'), lock };
  const packages = context.ToolsGradingPackages.create(dependencies);
  function snapshot({ setId = 'demo', version = 'v1', questionId = 'q1', prompt = '問題文', rule = 'PRIVATE_RULE_SENTINEL', code = 'print(1)' } = {}) {
    const body = { schema: 1, question: { questionId, version, setId, order: 1, title: '問題', prompt, templateCode: code, setupCode: '', kind: 'code' }, gradingVersion: 'grade-v1', engineVersion: 'test-engine-v1', ranges: [], rules: { example: { keyword: rule } }, graded: false, sourceHash: 'f'.repeat(64) };
    return { recordKey: `${version}/${questionId}`, groupKey: `${version}/${setId}`, actorKey: '', questionId, version, requestId: '', seq: 0, at: new Date(clock).toISOString(), payloadHash: T.hash(T.canonical(body)), adoptedBy: 'e'.repeat(64), body };
  }
  function assignment(overrides = {}) { return { assignmentId: 'class-demo', year: 2026, grades: [1], setId: 'demo', version: 'v1', startsAt: '2026-10-01T00:00:00.000Z', dueAt: '2026-10-31T00:00:00.000Z', closesAt: '2026-11-30T00:00:00.000Z', enabled: true, official: true, ...overrides }; }
  function input(overrides = {}) { return { snapshots: [snapshot()], assignments: [assignment()], actors: { [T.actorKey('student@example.test')]: { grade: 1, teacher: false }, [T.actorKey('teacher@example.test')]: { grade: null, teacher: true } }, registry: [{ account: 'student@example.test', spreadsheetId: 'synthetic_spreadsheet_identifier_0001' }], ...overrides }; }
  return { context, T, properties, packages, dependencies, lockState, snapshot, assignment, input, now: () => clock, advance: ms => { clock += ms; } };
}

export function syncFixture(options = {}) {
  const f = gradingFixture(options), owner = 'teacher@example.test', student = 'student@example.test';
  const config = { schema: 1, enabled: true, triggerEnabled: false, ttlMinutes: 120, triggerMinutes: 60, sourceFileListId: 'synthetic_filelist_identifier_0001' };
  f.properties.setProperty('TOOLS_GRADING_SYNC_CONFIG', JSON.stringify(config)); f.properties.writes = [];
  const identity = { active: owner, effective: owner }, sourceConfig = { enabled: false, hash: 'a'.repeat(64), assignments: [f.assignment()] };
  const state = { sourceReads: 0, rosterReads: 0, registryReads: 0, snapshots: [f.snapshot()], roster: [['userId', '年', '氏名'], [student, 1, 'synthetic ignored name']], registry: [['userId', 'tools保存用GSSID'], [student, 'synthetic_spreadsheet_identifier_0001']], triggers: [], created: 0, deleted: 0 };
  const env = { properties: f.properties, now: f.now, teacherOwners: () => [owner], allowedDomains: () => ['example.test'], commonTeachers: () => null, identity: () => identity,
    sourceConfig(id) { assertId(id); state.sourceReads++; return sourceConfig; },
    sourceStore: () => ({ snapshots: (set, version) => state.snapshots.filter(r => r.body.question.setId === set && r.version === version) }),
    rosterRows(id) { assertId(id); state.rosterReads++; return state.roster; }, registryRows(id) { assertId(id); state.registryReads++; return state.registry; }, packages: () => f.packages,
    triggers: () => state.triggers,
    createTrigger(handler, minutes) { const uid = 'trigger-' + ++state.created, trigger = { getUniqueId: () => uid, getHandlerFunction: () => handler, minutes }; state.triggers.push(trigger); return trigger; },
    deleteTrigger(trigger) { state.deleted++; state.triggers = state.triggers.filter(t => t !== trigger); }, lock: f.dependencies.lock };
  function assertId(id) { if (id !== config.sourceFileListId) throw new Error('unexpected private book'); }
  function setConfig(overrides) { Object.assign(config, overrides); f.properties.setProperty('TOOLS_GRADING_SYNC_CONFIG', JSON.stringify(config)); }
  return { ...f, env, config, state, identity, sourceConfig, setConfig, sync: f.context.ToolsGradingSync.create(env) };
}
