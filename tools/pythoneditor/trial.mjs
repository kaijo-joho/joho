import { LIMITS, questionKey, validId, validateCatalog } from './core.mjs';
import { CloudError, codeHash, canonicalEvidence } from './cloud.mjs?v=20261017-confirmation-sync1';
import { validateConnection } from './tools-store.mjs?v=20261017-save-events1';
import { validateAssessmentPolicy } from './local-assessment.mjs?v=20261017-local-assessment1';

export const TRIAL_SCOPE = 'pythoneditor-school-trial-v1';
export const TRIAL_PROTOCOL = 'python-editor-trial-rpc-v1';
export const TRIAL_KIND = 'schooltrial';
const clone = value => structuredClone(value);
const fail = (code, message) => new CloudError(code, message);
const hex32 = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = () => fail('trial_response', '試用の本人・問題・版・保存結果を確認できません。コードと送信控えは保持しています。');
const score = value => Number.isFinite(value) && value >= 0 && value <= 1;
const testQueues = new Map();
const nodeLocks = { request: async (key, task) => { const previous = testQueues.get(key) || Promise.resolve(); let release; const next = new Promise(done => { release = done; }); testQueues.set(key, next); await previous.catch(() => {}); try { return await task(); } finally { release(); if (testQueues.get(key) === next) testQueues.delete(key); } } };
function rating(raw, version) {
  if (!raw || !Number.isInteger(raw.total) || raw.total < 0 || raw.total > 10000 ||
      !(raw.earned === null || Number.isInteger(raw.earned) && raw.earned >= 0 && raw.earned <= raw.total) ||
      raw.version !== undefined && raw.version !== version || raw.trial !== undefined && raw.trial !== true) throw invalid();
  return { earned: raw.earned, total: raw.total, version, trial: true };
}

// 接続cache、下書きの再送、試用提出の控えを通常環境から分ける。
export class TrialStorage {
  constructor(storage, scopeId) {
    if (!hex32(scopeId)) throw invalid();
    this.storage = storage; this.prefix = `joho.pythoneditor.school-trial.v1.${scopeId}.`;
  }
  keys() {
    if (!this.storage) throw fail('trial_storage', '試用の控えを保存できません。先にファイルへ保存してください。');
    const keys = [];
    for (let index = 0; index < this.storage.length; index++) { const key = this.storage.key(index); if (key?.startsWith(this.prefix)) keys.push(key.slice(this.prefix.length)); }
    return keys;
  }
  get length() { return this.keys().length; }
  key(index) { return this.keys()[index] ?? null; }
  getItem(key) { if (!this.storage) throw fail('trial_storage', '試用の控えを読み取れません。'); return this.storage.getItem(this.prefix + key); }
  setItem(key, value) { if (!this.storage) throw fail('trial_storage', '試用の控えを保存できません。'); this.storage.setItem(this.prefix + key, value); }
  removeItem(key) { if (!this.storage) throw fail('trial_storage', '試用の控えを更新できません。'); this.storage.removeItem(this.prefix + key); }
}

export async function validateTrialSession(raw, { validatePolicy = validateAssessmentPolicy } = {}) {
  if (raw?.scope !== TRIAL_SCOPE || !hex32(raw.scopeId) || raw.trial !== true || !hex64(raw.actorKey) ||
      !['teacherTrial', 'demo'].includes(raw.viewerRole) || !/^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(raw.account || '') ||
      await codeHash(raw.account) !== raw.actorKey || !Array.isArray(raw.assessments) || !Array.isArray(raw.ratings) || typeof validatePolicy !== 'function') throw invalid();
  const catalog = validateCatalog(raw.catalog), questions = new Map(catalog.sets.flatMap(set => set.questions.map(q => [questionKey(q), q])));
  if (!questions.size || raw.assessments.length > questions.size || raw.ratings.length > questions.size) throw invalid();
  const assessments = [], policies = new Map();
  for (const item of raw.assessments) {
    const value = await validatePolicy(item), key = questionKey(value);
    if (!questions.has(key) || questions.get(key).kind !== value.kind || policies.has(key) || !hex64(value.policyHash)) throw invalid();
    policies.set(key, value); assessments.push(value);
  }
  const seen = new Set(), ratings = raw.ratings.map(item => {
    const key = questionKey(item); if (!questions.has(key) || !policies.has(key) || seen.has(key) || item.assessmentSource !== 'local-report') throw invalid();
    seen.add(key); return { questionId: item.questionId, version: item.version, rating: rating(item, item.version) };
  });
  const connection = validateConnection(raw.store?.connection);
  if (connection.actorKey !== raw.actorKey || connection.account !== raw.account) throw invalid();
  return { scope: TRIAL_SCOPE, scopeId: raw.scopeId, trial: true, account: raw.account, actorKey: raw.actorKey, viewerRole: raw.viewerRole,
    catalog, assessments, ratings, store: { connection } };
}

export class TrialClient {
  constructor(rpc, session, storage) {
    if (typeof rpc !== 'function' || session?.scope !== TRIAL_SCOPE || !hex32(session.scopeId) || session.trial !== true || !hex64(session.actorKey)) throw invalid();
    Object.assign(this, { rpc, session, storage }); this.prefix = `submit.${session.actorKey}.`;
    this.locks = typeof window === 'undefined' ? nodeLocks : globalThis.navigator?.locks;
    this.policies = new Map(session.assessments.map(policy => [questionKey(policy), policy])); this.generation = 0; this.submitting = new Map();
  }
  policy(q) { return q ? this.policies.get(questionKey(q)) : null; }
  call(action, input) { return this.rpc(action, input, this.session.actorKey); }
  async payload(raw) {
    const input = clone(raw), policy = this.policy(input);
    if (!policy || !validId(input.questionId) || !validId(input.version) || input.policyHash !== policy.policyHash ||
        typeof input.code !== 'string' || input.code.length > LIMITS.code || typeof input.stdin !== 'string' || input.stdin.length > LIMITS.code ||
        !input.run || typeof input.run !== 'object' || Array.isArray(input.run) || !input.assessment || typeof input.assessment !== 'object' || Array.isArray(input.assessment) ||
        Object.keys(input).some(key => !['scopeId', 'requestId', 'questionId', 'version', 'policyHash', 'code', 'stdin', 'run', 'assessment', 'evidence'].includes(key))) throw invalid();
    input.scopeId = this.session.scopeId; input.requestId ||= globalThis.crypto.randomUUID().replaceAll('-', '');
    if (!hex32(input.requestId) || canonicalEvidence(input).length > 960000) throw fail('trial_payload', '試用提出の内容が長すぎるか形式が対応していません。ファイルへ保存して確認してください。');
    return input;
  }
  readRecord(key) {
    let record;
    try { record = JSON.parse(this.storage.getItem(key)); } catch { throw fail('trial_journal', '試用提出の送信控えを読み取れません。元の控えを保持しています。'); }
    if (record?.schema !== 1 || record.scope !== TRIAL_SCOPE || record.scopeId !== this.session.scopeId || record.actorKey !== this.session.actorKey ||
        !hex32(record.input?.requestId) || record.input.scopeId !== this.session.scopeId || key !== this.prefix + record.input.requestId || !hex64(record.payloadHash)) throw invalid();
    return record;
  }
  pending(q) {
    const rows = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index); if (!key?.startsWith(this.prefix)) continue;
        const record = this.readRecord(key); if (questionKey(record.input) === questionKey(q)) rows.push(record);
      }
    } catch (error) { throw error.code ? error : fail('trial_journal', '試用提出の控えを読み取れません。ファイルへ保存してから確認してください。'); }
    if (rows.length > 1) throw fail('trial_journal', '同じ問題に複数の試用送信控えがあります。元の控えを保護して教員へ確認してください。');
    return rows[0] || null;
  }
  async record(raw) {
    const input = await this.payload(raw), key = this.prefix + input.requestId;
    const record = { schema: 1, scope: TRIAL_SCOPE, scopeId: this.session.scopeId, actorKey: this.session.actorKey, input, payloadHash: await codeHash(canonicalEvidence(input)) };
    try {
      if (this.storage.getItem(key) !== null) throw invalid();
      const text = JSON.stringify(record); this.storage.setItem(key, text);
      if (this.storage.getItem(key) !== text) throw invalid();
    } catch { throw fail('trial_journal', '再送用の控えを保存できません。試用提出は開始していません。先にファイルへ保存してください。'); }
    return record;
  }
  receipt(raw, q, record) {
    if (!raw || raw.state !== 'submitted' || raw.trial !== true || raw.assessmentSource !== 'local-report' || raw.scopeId !== this.session.scopeId || raw.actorKey !== this.session.actorKey ||
        raw.questionId !== q.questionId || raw.version !== q.version || !hex32(raw.requestId) || !hex64(raw.policyHash) || !hex64(raw.payloadHash) || !hex64(raw.signature) ||
        !score(raw.score) || !Number.isFinite(raw.earned) || !Number.isFinite(raw.total) || raw.earned < 0 || raw.earned > raw.total || raw.total > 100000 ||
        !Number.isInteger(raw.starEarned) || !Number.isInteger(raw.starTotal) || raw.starEarned < 0 || raw.starEarned > raw.starTotal || raw.starTotal > 10000 ||
        typeof raw.receivedAt !== 'string' || !Number.isFinite(Date.parse(raw.receivedAt)) || raw.dueAt !== null || !Array.isArray(raw.checks) || raw.checks.length > 10000 ||
        record && (raw.requestId !== record.input.requestId || raw.policyHash !== record.input.policyHash || raw.payloadHash !== record.payloadHash)) throw invalid();
    const checks = raw.checks.map(check => {
      if (!check || typeof check.label !== 'string' || check.label.length > 1000 || !(typeof check.passed === 'boolean' || check.passed === null && check.eligible === false) ||
          check.eligible !== undefined && typeof check.eligible !== 'boolean' || !Number.isFinite(check.points) || check.points < 0 || !Number.isFinite(check.earned) || check.earned < 0 || check.earned > check.points) throw invalid();
      return { label: check.label, passed: check.passed, points: check.points, earned: check.earned, ...(check.eligible === false ? { eligible: false } : {}) };
    });
    if (raw.codeHash !== undefined && !hex64(raw.codeHash)) throw invalid();
    return { state: 'submitted', scopeId: raw.scopeId, actorKey: raw.actorKey, questionId: raw.questionId, version: raw.version, requestId: raw.requestId,
      policyHash: raw.policyHash, payloadHash: raw.payloadHash, signature: raw.signature, score: raw.score, earned: raw.earned, total: raw.total, starEarned: raw.starEarned, starTotal: raw.starTotal, checks,
      receivedAt: raw.receivedAt, dueAt: null, trial: true, assessmentSource: 'local-report', ...(raw.codeHash ? { codeHash: raw.codeHash } : {}) };
  }
  async accept(raw, q, record) {
    const missing = record && raw?.receipt === null && raw.questionId === undefined && raw.version === undefined && raw.rating == null && raw.bestScore === null && Array.isArray(raw.history) && raw.history.length === 0;
    if (!raw || raw.scopeId !== this.session.scopeId || !missing && (raw.questionId !== q.questionId || raw.version !== q.version) || !Array.isArray(raw.history) || raw.history.length > 200 ||
        !(raw.bestScore === null || score(raw.bestScore))) throw invalid();
    if (record && await codeHash(canonicalEvidence(record.input)) !== record.payloadHash) throw fail('trial_journal', '試用提出の控えと本文が一致しません。元の内容は保持しています。');
    const result = { scopeId: raw.scopeId, questionId: q.questionId, version: q.version,
      receipt: raw.receipt ? this.receipt(raw.receipt, q, record) : null, rating: raw.rating ? rating(raw.rating, q.version) : null,
      history: raw.history.map(item => this.receipt(item, q)), bestScore: raw.bestScore };
    if (record && result.receipt) {
      if (result.receipt.codeHash && result.receipt.codeHash !== await codeHash(record.input.code)) throw invalid();
      const key = this.prefix + record.input.requestId, current = this.readRecord(key);
      if (canonicalEvidence(current) !== canonicalEvidence(record)) throw fail('trial_journal', '試用提出の控えが変更されました。控えを残して結果を確認してください。');
      this.storage.removeItem(key);
      if (this.storage.getItem(key) !== null) throw fail('trial_journal', '試用提出は受理済みですが、控えの更新を確認できません。同じ番号で結果を照会してください。');
    }
    return result;
  }
  async send(record) {
    if (await codeHash(canonicalEvidence(record.input)) !== record.payloadHash) throw fail('trial_journal', '試用提出の控えと本文が一致しません。元の内容は保持しています。');
    return this.accept(await this.call('submit', clone(record.input)), record.input, record);
  }
  locked(task) {
    if (!this.locks?.request) return Promise.reject(fail('storage_lock', '試用提出の排他保存を使用できません。コードと控えを保持して対応ブラウザで再接続してください。'));
    return this.locks.request(`joho.pythoneditor.trial.${this.session.scopeId}.${this.session.actorKey}`, task);
  }
  submit(input) {
    const key = questionKey(input); if (this.submitting.has(key)) return this.submitting.get(key);
    const promise = this.locked(async () => this.send(this.pending(input) || await this.record(input))); this.submitting.set(key, promise);
    const clear = () => { if (this.submitting.get(key) === promise) this.submitting.delete(key); }; promise.then(clear, clear); return promise;
  }
  async recover(q, { resend = false } = {}) {
    return this.locked(async () => {
      const pending = this.pending(q);
      if (!pending) return this.accept(await this.call('questionStatus', { scopeId: this.session.scopeId, questionId: q.questionId, version: q.version }), q);
      const result = await this.accept(await this.call('lookup', { scopeId: this.session.scopeId, requestId: pending.input.requestId }), q, pending);
      if (result.receipt || !resend) return { ...result, unreceived: !result.receipt };
      return this.send(pending);
    });
  }
  storeBridge(connection) {
    if (canonicalEvidence(validateConnection(connection)) !== canonicalEvidence(this.session.store.connection)) throw invalid();
    let disposed = false;
    const call = (action, input) => disposed ? Promise.reject(fail('disconnected', '試用の保存接続を終了しました。控えは保持しています。')) : this.call('store', { binding: connection.binding, action, input });
    return { connect: () => call('session', {}), call, dispose: () => { disposed = true; } };
  }
}
