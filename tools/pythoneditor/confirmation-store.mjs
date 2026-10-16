import { normalizeTrial, refKey } from './confirmation.mjs?v=20261016-confirmation1';

// 学習用の試行記録。正式得点・提出状態・認証情報は保存しない。
export const CONFIRMATION_STORAGE_KEY = 'joho.pythoneditor.confirmations.v1';
export const JOURNAL_LIMITS = Object.freeze({ trials: 1000, responses: 2000, bytes: 4 * 1024 * 1024 });
const idPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
const trialIdPattern = /^[A-Za-z0-9_.-]{1,120}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ schema: 1, trials: [], responses: {} });
const fail = (code, message) => Object.assign(new Error(message), { code });
async function codeHash(code) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !keys.includes(key)))
    throw fail('journal_invalid', `${label}の形式を確認してください。元の記録は保持しています。`);
}
function key(value) {
  if (typeof value !== 'string' || value.split('/').length !== 2 || !value.split('/').every(part => idPattern.test(part)))
    throw fail('journal_invalid', '確認問題のID・版を確認してください。');
  return value;
}
function response(value) {
  object(value, ['answer', 'selections'], '確認問題の回答');
  const result = {};
  if (Object.hasOwn(value, 'answer')) {
    if (!(typeof value.answer === 'string' && value.answer.length <= 20000 || typeof value.answer === 'number' && Number.isFinite(value.answer)))
      throw fail('journal_invalid', '確認問題の回答が長すぎるか、形式が対応していません。');
    result.answer = value.answer;
  }
  if (Object.hasOwn(value, 'selections')) {
    object(value.selections, Object.keys(value.selections || {}), '比較する試行');
    const entries = Object.entries(value.selections);
    if (entries.length > 100 || entries.some(([condition, trialId]) => !idPattern.test(condition) || typeof trialId !== 'string' || !trialIdPattern.test(trialId)))
      throw fail('journal_invalid', '比較する条件・試行のIDを確認してください。');
    result.selections = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
  }
  return result;
}
function withinLimits(journal) {
  if (journal.trials.length > JOURNAL_LIMITS.trials || Object.keys(journal.responses).length > JOURNAL_LIMITS.responses ||
      new TextEncoder().encode(JSON.stringify(journal)).byteLength > JOURNAL_LIMITS.bytes)
    throw fail('journal_limit', '試行記録の保存上限に達しました。以前の記録は削除していません。ファイルへ保存してから教員へ相談してください。');
  return journal;
}

// ローカルファイルの取込みにも使う、公開形式の厳格な検査。
export function validateJournal(raw) {
  object(raw, ['schema', 'trials', 'responses'], '試行記録');
  if (raw.schema !== 1 || !Array.isArray(raw.trials)) throw fail('journal_invalid', 'この試行記録の形式は対応していません。');
  object(raw.responses, Object.keys(raw.responses || {}), '確認問題の回答一覧');
  withinLimits(raw);
  const ids = new Set();
  const trials = raw.trials.map(value => {
    const trial = normalizeTrial(value);
    if (!trialIdPattern.test(trial.id) || ids.has(trial.id)) throw fail('journal_invalid', '試行のIDが不正、または重複しています。');
    ids.add(trial.id);
    return trial;
  });
  const responses = Object.fromEntries(Object.entries(raw.responses).map(([questionKey, value]) => [key(questionKey), response(value)]));
  for (const value of Object.values(responses)) {
    if (Object.values(value.selections || {}).some(id => !ids.has(id)))
      throw fail('journal_invalid', '比較に指定した試行が記録内にありません。元の記録は保持しています。');
  }
  return withinLimits({ schema: 1, trials, responses });
}

function mergeJournals(current, incoming) {
  const trials = new Map(current.trials.map(trial => [trial.id, trial]));
  for (const trial of incoming.trials) {
    if (trials.has(trial.id) && JSON.stringify(trials.get(trial.id)) !== JSON.stringify(trial))
      throw fail('journal_conflict', '同じ試行IDに異なる内容があります。両方の記録を保持し、取り込みを中止しました。');
    if (!trials.has(trial.id)) trials.set(trial.id, trial);
  }
  const responses = { ...current.responses };
  for (const [questionKey, value] of Object.entries(incoming.responses)) {
    if (Object.hasOwn(responses, questionKey) && JSON.stringify(responses[questionKey]) !== JSON.stringify(value))
      throw fail('journal_conflict', '同じ確認問題に異なる回答があります。両方の記録を保持し、取り込みを中止しました。');
    responses[questionKey] = value;
  }
  return withinLimits({ schema: 1, trials: [...trials.values()], responses });
}

export class ConfirmationStore {
  constructor(storage) {
    this.lastError = null;
    this.journal = empty();
    this.baseline = empty();
    try { this.storage = arguments.length ? storage : globalThis.localStorage; }
    catch { this.storage = null; this.lastError = fail('storage', 'ブラウザ保存を使用できません。試行記録はこの画面内に保持します。'); }
    try {
      const { journal } = this.readStored();
      this.journal = journal;
      this.baseline = clone(journal);
    } catch (error) { this.lastError = error; }
  }
  snapshot() { return clone(this.journal); }
  trials(refs) {
    if (!Array.isArray(refs)) throw fail('journal_invalid', '参照するコードの問題ID・版を確認してください。');
    const keys = new Set(refs.map(ref => key(refKey(ref))));
    return clone(this.journal.trials.filter(trial => keys.has(refKey(trial.source))));
  }
  response(questionKey) { return clone(this.journal.responses[key(questionKey)] ?? null); }
  readStored() {
    if (!this.storage || typeof this.storage.getItem !== 'function' || typeof this.storage.setItem !== 'function')
      throw fail('storage', 'ブラウザ保存を使用できません。試行記録はこの画面内に保持します。');
    let raw;
    try { raw = this.storage.getItem(CONFIRMATION_STORAGE_KEY); }
    catch { throw fail('storage', 'ブラウザ保存を読み取れません。試行記録はこの画面内に保持しています。'); }
    if (raw === null) return { journal: empty(), raw };
    try { return { journal: validateJournal(JSON.parse(raw)), raw }; }
    catch { throw fail('storage_invalid', 'ブラウザ内の試行記録を確認できません。元の記録を上書きせず、この画面内に保持します。'); }
  }
  // 別タブで増えた試行を取り込み、回答の変更だけは共通の読込時点から比較する。
  reconcile(candidate, stored) {
    const responses = {};
    for (const questionKey of new Set([...Object.keys(candidate.responses), ...Object.keys(stored.responses)])) {
      const local = candidate.responses[questionKey], remote = stored.responses[questionKey], base = this.baseline.responses[questionKey];
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      if (local === undefined) responses[questionKey] = remote;
      else if (remote === undefined) responses[questionKey] = local;
      else if (same(local, remote)) responses[questionKey] = local;
      else if (same(local, base)) responses[questionKey] = remote;
      else if (same(remote, base)) responses[questionKey] = local;
      else throw fail('journal_conflict', '別のタブで確認問題の回答が変更されました。両方の内容を保持し、保存を止めました。');
    }
    // 回答は上で解決済み。試行自体は同IDの内容が異なれば拒否する。
    const merged = mergeJournals({ ...candidate, responses: {} }, { ...stored, responses: {} });
    merged.responses = Object.fromEntries(Object.entries(responses).filter(([, value]) => value !== undefined));
    return withinLimits(merged);
  }
  commit(candidate, { keepOnConflict = false } = {}) {
    candidate = validateJournal(candidate);
    let stored;
    try { stored = this.readStored(); }
    catch (error) { this.journal = candidate; this.lastError = error; return this.snapshot(); }
    // 競合なら、この操作前のメモリ内容と別タブの保存をどちらも変えない。
    try { candidate = this.reconcile(candidate, stored.journal); }
    catch (error) {
      if (!keepOnConflict) throw error;
      this.journal = candidate;
      this.lastError = error;
      return this.snapshot();
    }
    this.journal = candidate;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const latest = this.readStored();
        if (latest.raw !== stored.raw) {
          candidate = this.reconcile(candidate, latest.journal);
          this.journal = candidate;
          stored = latest;
          continue;
        }
        const serialized = JSON.stringify(candidate);
        this.storage.setItem(CONFIRMATION_STORAGE_KEY, serialized);
        const readback = this.readStored();
        if (readback.raw !== serialized) {
          candidate = this.reconcile(candidate, readback.journal);
          this.journal = candidate;
          stored = readback;
          continue;
        }
        this.baseline = clone(candidate);
        this.lastError = null;
        return this.snapshot();
      } catch (error) {
        this.lastError = error.code ? error : fail('storage', 'ブラウザへ試行記録を保存できません。この画面内には保持しています。ファイルへ保存してください。');
        return this.snapshot();
      }
    }
    this.lastError = fail('storage_changed', '別のタブによる更新が続いています。記録をこの画面内に保持し、保存を止めました。');
    return this.snapshot();
  }
  async record(input) {
    try {
      object(input, ['schema', 'source', 'code', 'inputs', 'stdout', 'stderr', 'outcome', 'truncated', 'at'], '実行記録');
      // 呼出し後の問題切替・コード編集に影響されない実行開始時の写しを使う。
      const captured = clone(input);
      if (captured.schema !== undefined && captured.schema !== 1) throw fail('journal_invalid', 'この実行記録の形式は対応していません。');
      if (typeof captured.code !== 'string' || captured.code.length > 200000) throw fail('journal_invalid', '記録するコードの形式・長さを確認してください。');
      const trial = normalizeTrial({ ...captured, schema: 1, id: `trial-${globalThis.crypto.randomUUID()}`,
        codeHash: await codeHash(captured.code), at: captured.at ?? new Date().toISOString() });
      this.commit({ ...this.journal, trials: [...this.journal.trials, trial] }, { keepOnConflict: true });
      return clone(trial);
    } catch (error) { this.lastError = error; throw error; }
  }
  setResponse(questionKey, value) {
    try {
      const responses = { ...this.journal.responses, [key(questionKey)]: response(value) };
      return this.commit({ ...this.journal, responses });
    } catch (error) { this.lastError = error; throw error; }
  }
  restore(raw, { merge = true } = {}) {
    try {
      if (merge !== true) throw fail('journal_restore', '既存の試行記録を破棄する取込みには対応していません。');
      return this.commit(mergeJournals(this.journal, validateJournal(raw)));
    } catch (error) { this.lastError = error; throw error; }
  }
}
