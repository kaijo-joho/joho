import { validId } from './core.mjs';
import { GoogleBridge, codeHash } from './cloud.mjs?v=20261017-advice1';
export const ADVICE_PROTOCOL = 'python-editor-advice-v1';
export const ADVICE_LIMITS = Object.freeze({ input: 40000, question: 3000, field: 32000, records: 12 });
const HEX = /^[a-f0-9]{64}$/, REQUEST = /^[a-f0-9]{32}$/;
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const fail = message => { throw new Error(message); };
const text = (v, max, label) => typeof v === 'string' && v.length <= max ? v : fail(label + 'の形式を確認してください。');
export function sourceSnapshot(raw) {
  if (!raw || !validId(raw.setId) || !validId(raw.questionId) || !validId(raw.version)) fail('相談する問題を選択してください。');
  const out = { setId: raw.setId, questionId: raw.questionId, version: raw.version,
    runId: text(raw.runId, 120, '実行番号'), code: text(raw.code, ADVICE_LIMITS.input, 'コード'),
    setupCode: text(raw.setupCode || '', ADVICE_LIMITS.input, '準備コード'),
    errorText: text(raw.errorText || '', ADVICE_LIMITS.input, 'エラー') };
  if (!/^[A-Za-z0-9_.:-]+$/.test(out.runId)) fail('実行番号を確認してください。');
  return out;
}
export async function prepareConsultation(raw, questionText = '') {
  const source = sourceSnapshot(raw);
  const question = text(questionText, ADVICE_LIMITS.question, '相談文');
  if (!source.code.trim() && !source.setupCode.trim()) fail('相談するコードを入力してください。');
  if (source.code.length + source.setupCode.length + source.errorText.length + question.length > ADVICE_LIMITS.input)
    fail('相談内容が長すぎます。相談用のコピーを必要な範囲に絞ってください。');
  return Object.freeze({ requestId: uuid(), ...source, questionText: question,
    codeHash: await codeHash(JSON.stringify([source.code, source.setupCode])),
    snapshotHash: await codeHash(JSON.stringify([source.setId, source.questionId, source.version,
      source.runId, source.code, source.setupCode, source.errorText])) });
}
export function validatePayload(raw) {
  const source = sourceSnapshot(raw);
  if (!REQUEST.test(raw.requestId) || !HEX.test(raw.codeHash) || !HEX.test(raw.snapshotHash))
    fail('相談の送信番号を確認できません。');
  const questionText = text(raw.questionText, ADVICE_LIMITS.question, '相談文');
  if (source.code.length + source.setupCode.length + source.errorText.length + questionText.length > ADVICE_LIMITS.input)
    fail('保存された相談内容が長すぎます。');
  return { requestId: raw.requestId, ...source, questionText, codeHash: raw.codeHash, snapshotHash: raw.snapshotHash };
}
export function adviceText(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('相談の回答形式を確認できません。');
  return { errorKey: text(raw.errorKey || '', 120, 'エラー名'), errorType: text(raw.errorType || '', 120, 'エラー分類'),
    cause: text(raw.cause || '', ADVICE_LIMITS.field, '原因'), advice: text(raw.advice || '', ADVICE_LIMITS.field, 'ヒント') };
}
export function consultationResult(raw, expected) {
  if (!raw || !['pending', 'complete'].includes(raw.state) || raw.requestId !== expected.requestId)
    fail('相談の応答を照合できません。送信内容は保持しています。');
  const fields = ['setId', 'questionId', 'version', 'runId', 'codeHash', 'snapshotHash'];
  for (const key of fields) if ((raw.state === 'complete' || raw[key] !== undefined) && raw[key] !== expected[key])
    fail('別の相談への回答です。元の送信内容は保持しています。');
  if (raw.state === 'pending') return { state: 'pending', requestId: raw.requestId };
  if (raw.shared !== true || typeof raw.completedAt !== 'string' || !Number.isFinite(Date.parse(raw.completedAt)))
    fail('相談の回答情報を確認できません。');
  return { state: 'complete', requestId: raw.requestId, ...Object.fromEntries(fields.map(k => [k, raw[k]])),
    result: adviceText(raw.result), completedAt: raw.completedAt, shared: true };
}
export function contextNotice(payload, current) {
  if (!current || ['setId', 'questionId', 'version'].some(k => payload[k] !== current[k]))
    return '別の問題・版への相談です。';
  if (payload.code !== current.code || payload.setupCode !== current.setupCode)
    return '変更前のコードへの回答です。';
  if (payload.runId !== current.runId || payload.errorText !== current.errorText)
    return '現在とは別の実行への相談です。';
  return '';
}
export function historyRecords(raw) {
  if (!raw || !Array.isArray(raw.records) || raw.records.length > 10) fail('過去の相談の形式を確認できません。');
  return raw.records.map(r => ({ timestamp: text(r.timestamp || '', 100, '日時'),
    code: text(r.code || '', ADVICE_LIMITS.input, 'コード'), errorText: text(r.errorText || '', ADVICE_LIMITS.input, 'エラー'),
    ...adviceText(r), ...(typeof r.questionText === 'string' ? { questionText: text(r.questionText, ADVICE_LIMITS.question, '相談文') } : {}) }));
}
export class AdviceBridge extends GoogleBridge {
  constructor(config, options = {}) {
    super(config, { ...options, protocol: ADVICE_PROTOCOL, kind: 'pythoneditor-advice', title: 'エラー相談室接続',
      messages: { disabled: 'エラー相談室との接続は準備中です。送信は無効です。',
        connect: '相談室へ接続できません。学校アカウントを確認して再接続してください。コードは保持しています。',
        timeout: '相談の応答を確認できません。同じ相談の結果を照会してください。新たな問い合わせは送っていません。' } });
  }
}
export class AdviceJournal {
  constructor(storage, actorKey) {
    if (!HEX.test(actorKey)) fail('相談する本人を確認できません。');
    if (!storage) fail('相談の送信控えをブラウザへ保存できません。送信は開始していません。');
    this.storage = storage; this.prefix = 'joho.pythoneditor.advice.v1.' + actorKey + '.'; this.actorKey = actorKey;
  }
  body(key) {
    const raw = this.storage.getItem(key); if (raw === null) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1 || data.actorKey !== this.actorKey || !['pending', 'unknown'].includes(data.state))
      fail('相談の控えを確認できません。元の保存内容は保持しています。');
    const payload = validatePayload(data.payload);
    if (key !== this.prefix + payload.requestId || !Number.isFinite(Date.parse(data.createdAt))) fail('相談の送信番号を確認できません。');
    return { payload, state: data.state, createdAt: data.createdAt, title: text(data.title, 300, '実習名') };
  }
  read() {
    const keys = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix) && REQUEST.test(key.slice(this.prefix.length))) keys.push(key);
    }
    return keys.map(key => {
      const record = this.body(key); if (!record) return null;
      const response = this.storage.getItem(key + '.complete');
      if (response !== null) {
        record.response = consultationResult(JSON.parse(response), record.payload);
        if (record.response.state !== 'complete') fail('保存された回答を確認できません。');
        record.state = 'complete';
      } else if (this.storage.getItem(key + '.unavailable') === '1') record.state = 'unavailable';
      return record;
    }).filter(Boolean).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.payload.requestId.localeCompare(b.payload.requestId));
  }
  write(records) {
    // 本文と完了回答を送信番号別のキーへ追記する。別タブの受付や完了を上書きしない。
    const merged = new Map(this.read().map(r => [r.payload.requestId, r])); let newPending = false;
    for (const record of records) {
      validatePayload(record.payload);
      if (!['pending', 'unknown', 'complete', 'unavailable'].includes(record.state)) fail('相談の控えの状態を確認できません。');
      const prior = merged.get(record.payload.requestId);
      if (prior && JSON.stringify(prior.payload) !== JSON.stringify(record.payload)) fail('相談の送信控えが変更されています。元の内容は保持しています。');
      record.createdAt = prior?.createdAt || record.createdAt || new Date().toISOString();
      if (!Number.isFinite(Date.parse(record.createdAt))) fail('相談の保存日時を確認できません。');
      if (!prior && ['pending', 'unknown'].includes(record.state)) newPending = true;
      if (!prior || prior.state !== 'complete') merged.set(record.payload.requestId, record);
    }
    const keep = [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), remove = [];
    if (newPending && keep.filter(r => !['complete', 'unavailable'].includes(r.state)).length > ADVICE_LIMITS.records)
      fail('結果未確認の相談が多いため、先に結果を照会してください。');
    while (keep.filter(r => ['complete', 'unavailable'].includes(r.state)).length > ADVICE_LIMITS.records) {
      const index = keep.findIndex(r => ['complete', 'unavailable'].includes(r.state));
      remove.push(...keep.splice(index, 1));
    }
    try {
      for (const record of [...keep, ...remove]) {
        const key = this.prefix + record.payload.requestId, prior = this.body(key);
        if (prior && JSON.stringify(prior.payload) !== JSON.stringify(record.payload)) throw new Error('conflict');
        if (!prior) this.put(key, JSON.stringify({ version: 1, actorKey: this.actorKey, payload: record.payload,
          title: record.title || record.payload.questionId, createdAt: record.createdAt, state: 'pending' }));
        if (record.state === 'complete') {
          const response = consultationResult(record.response, record.payload);
          if (response.state !== 'complete') throw new Error('incomplete');
          this.put(key + '.complete', JSON.stringify(response));
        } else if (record.state === 'unavailable') this.put(key + '.unavailable', '1');
      }
      for (const record of remove) {
        const key = this.prefix + record.payload.requestId;
        // 完了を確認した控えだけを整理する。同時送信の未確認キーは触らない。
        if (this.storage.getItem(key + '.complete') !== null || this.storage.getItem(key + '.unavailable') === '1') {
          this.storage.removeItem(key); this.storage.removeItem(key + '.complete'); this.storage.removeItem(key + '.unavailable');
        }
      }
    } catch { fail('相談の送信控えを保存できません。コードは保持しています。送信前なら、問い合わせは開始していません。'); }
    return keep;
  }
  put(key, raw) {
    this.storage.setItem(key, raw);
    if (this.storage.getItem(key) !== raw) throw new Error('readback');
  }
}
