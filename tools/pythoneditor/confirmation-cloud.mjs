import { JOURNAL_LIMITS, mergeJournals, validateJournal } from './confirmation-store.mjs?v=20261017-confirmation-sync1';
import { CloudError, codeHash } from './cloud.mjs?v=20261017-confirmation-sync1';

const clone = value => structuredClone(value);
const empty = () => ({ schema: 1, trials: [], responses: {} });
const fail = (code, message) => new CloudError(code, message);
const hex32 = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const auth = new Set(['login_required', 'auth_required', 'not_allowed', 'actor_mismatch', 'account_mismatch', 'account_denied', 'binding_invalid', 'binding_expired', 'binding_stale', 'permission_denied', 'store_retired', 'store_inactive', 'owner_mismatch', 'execution_mode_mismatch']);
const retry = new Set(['timeout', 'transport', 'transport_failed', 'service_unavailable', 'storage_write_uncertain', 'busy', 'lock_busy', 'offline', 'upgrading', 'confirmation_read_busy', 'confirmation_read_expired', 'confirmation_revision_unavailable', 'confirmation_banks_busy']);

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const bytes = value => new TextEncoder().encode(value).byteLength;
const equal = (a, b) => canonical(a) === canonical(b);

// 保存形式・実行履歴の順序・正式提出のhashは変えず、同期済み判定だけ不変IDの集合で比較する。
export function sameConfirmationJournal(a, b) {
  if (a.schema !== b.schema || !equal(a.responses, b.responses) || a.trials.length !== b.trials.length) return false;
  const trials = new Map(b.trials.map(trial => [trial.id, canonical(trial)]));
  return a.trials.every(trial => trials.get(trial.id) === canonical(trial));
}

export function splitJournal(text, size = 32000) {
  if (typeof text !== 'string' || !Number.isSafeInteger(size) || size < 2 || size > 32000) throw fail('confirmation_chunk', '確認記録の分割方法を確認できません。');
  const chunks = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(text.length, offset + size);
    if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--;
    chunks.push(text.slice(offset, end)); offset = end;
  }
  return chunks;
}

async function checked(raw) {
  const journal = validateJournal(raw);
  for (const trial of journal.trials) if (trial.codeHash !== await codeHash(trial.code)) throw fail('confirmation_hash', '試行記録のコードと確認値が一致しません。元の内容は保持しています。');
  return journal;
}
async function responseHashes(journal) {
  return Object.fromEntries(await Promise.all(Object.entries(journal.responses).map(async ([key, value]) => [key, await codeHash(canonical(value))])));
}

// 試行は不変の和集合。回答だけは、最後に確認したクラウド内容からの変更を比較する。
export async function mergeConfirmationJournals(localRaw, remoteRaw, baseHashes = {}, choices = {}) {
  const local = validateJournal(localRaw), remote = validateJournal(remoteRaw);
  const merged = mergeJournals({ ...local, responses: {} }, { ...remote, responses: {} });
  const conflicts = [], localHashes = await responseHashes(local), remoteHashes = await responseHashes(remote);
  for (const key of new Set([...Object.keys(local.responses), ...Object.keys(remote.responses)])) {
    const l = local.responses[key], r = remote.responses[key];
    if (l === undefined) merged.responses[key] = r;
    else if (r === undefined || equal(l, r)) merged.responses[key] = l;
    else if (localHashes[key] === baseHashes[key]) merged.responses[key] = r;
    else if (remoteHashes[key] === baseHashes[key]) merged.responses[key] = l;
    else {
      conflicts.push(key);
      if (choices[key] === 'local') merged.responses[key] = l;
      else if (choices[key] === 'cloud') merged.responses[key] = r;
      else merged.responses[key] = l;
    }
  }
  return { journal: validateJournal(merged), keys: conflicts };
}

// Nodeの合成試験でも同じ保存先を共有するclientを直列化する。ブラウザは実際のWeb Locksを使う。
const testQueues = new Map();
function nodeLocks() {
  return { request: async (name, task) => {
    const previous = testQueues.get(name) || Promise.resolve(); let release;
    const next = new Promise(resolve => { release = resolve; }); testQueues.set(name, next);
    await previous.catch(() => {});
    try { return await task(); } finally { release(); if (testQueues.get(name) === next) testQueues.delete(name); }
  } };
}

export class ConfirmationCloudClient {
  constructor(rpc, session, storage, options = {}) {
    if (typeof rpc !== 'function' || !hex64(session?.actorKey) || !session.confirmationJournal?.enabled || session.confirmationJournal.schema !== 1 ||
        session.confirmationJournal.maxBytes !== JOURNAL_LIMITS.bytes || session.confirmationJournal.chunkSize !== 32000 ||
        typeof session.spreadsheetId !== 'string' || !/^[A-Za-z0-9_-]{15,160}$/.test(session.spreadsheetId))
      throw fail('confirmation_upgrade_required', 'この保存先は確認問題の保存にまだ対応していません。ブラウザまたはファイルの記録を保持してください。');
    Object.assign(this, { rpc, session, storage, warn: options.warn || (() => {}) });
    this.locks = Object.hasOwn(options, 'locks') ? options.locks : typeof window === 'undefined' ? nodeLocks() : globalThis.navigator?.locks;
    this.uuid = options.uuid || (() => globalThis.crypto.randomUUID().replaceAll('-', ''));
    this.prefix = `joho.pythoneditor.confirmation-cloud.v1.${session.actorKey}.${session.spreadsheetId}.`;
    this.memory = new Map(); this.warned = false;
  }
  warning() {
    if (!this.warned) { this.warned = true; this.warn(fail('confirmation_journal_memory', '再送用の控えをブラウザに保存できません。接続中はこの画面内で再送できますが、画面を閉じる前にファイルへ保存してください。')); }
  }
  readLocal(name) {
    if (this.memory.has(name)) return clone(this.memory.get(name));
    let text;
    try { text = this.storage?.getItem(this.prefix + name); }
    catch { this.warning(); return null; }
    if (text == null) return null;
    try { return JSON.parse(text); } catch { throw fail('confirmation_journal_invalid', 'クラウド確認記録の送信控えを読み取れません。元の内容を保持して教員へ相談してください。'); }
  }
  writeLocal(name, value) {
    this.memory.set(name, clone(value));
    try {
      if (!this.storage) throw new Error();
      const text = JSON.stringify(value); this.storage.setItem(this.prefix + name, text);
      if (this.storage.getItem(this.prefix + name) !== text) throw new Error();
      this.memory.delete(name);
    } catch { this.warning(); }
  }
  removeLocal(name) {
    this.memory.set(name, null);
    try { this.storage?.removeItem(this.prefix + name); if (!this.storage || this.storage.getItem(this.prefix + name) !== null) throw new Error(); this.memory.delete(name); }
    catch { this.warning(); }
  }
  call(action, input = {}) { return this.rpc(action, { tool: 'python', ...input }); }
  async locked(task) {
    if (!this.locks?.request) throw fail('storage_lock', 'タブ間の排他保存を使用できません。確認記録は保持しています。対応するブラウザで再接続してください。');
    return this.locks.request(this.prefix + 'upload', task);
  }
  base() {
    const value = this.readLocal('base');
    if (!value) return { revision: null, responseHashes: {} };
    if (!(value.revision === null || hex32(value.revision)) || !value.responseHashes || typeof value.responseHashes !== 'object' || Array.isArray(value.responseHashes) ||
        Object.keys(value.responseHashes).length > JOURNAL_LIMITS.responses || Object.values(value.responseHashes).some(hash => !hex64(hash)))
      throw fail('confirmation_journal_invalid', '確認記録の同期履歴を確認できません。元の回答は保持しています。');
    return clone(value);
  }
  async rememberBase(remote) {
    if (!(remote.revision === null || hex32(remote.revision))) throw fail('confirmation_ack', '確認記録の保存版を確認できません。');
    this.writeLocal('base', { revision: remote.revision, responseHashes: await responseHashes(remote.journal) });
  }
  pending() {
    const value = this.readLocal('pending');
    if (!value) return null;
    if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['schema', 'actorKey', 'spreadsheetId', 'text', 'input'].includes(key)) ||
        !value.input || typeof value.input !== 'object' || Array.isArray(value.input) || Object.keys(value.input).some(key => !['requestId', 'expectedRevision', 'journalHash', 'byteLength', 'chunkCount'].includes(key)) ||
        value.schema !== 1 || value.actorKey !== this.session.actorKey || value.spreadsheetId !== this.session.spreadsheetId || !hex32(value.input?.requestId) ||
        !(value.input.expectedRevision === null || hex32(value.input.expectedRevision)) || !hex64(value.input.journalHash) || typeof value.text !== 'string' ||
        !Number.isSafeInteger(value.input.byteLength) || value.input.byteLength < 1 || value.input.byteLength > JOURNAL_LIMITS.bytes ||
        !Number.isSafeInteger(value.input.chunkCount) || value.input.chunkCount < 1 || value.input.chunkCount > 132)
      throw fail('confirmation_journal_invalid', '確認記録の送信控えを確認できません。元の内容は保持しています。');
    return value;
  }
  async manifest(raw) {
    let release = null;
    if (hex32(raw?.revision) && hex32(raw?.readId)) release = { revision: raw.revision, readId: raw.readId };
    try {
      if (!raw || !(raw.revision === null || hex32(raw.revision)) || !hex64(raw.journalHash) || !Number.isSafeInteger(raw.byteLength) ||
          raw.byteLength < 1 || raw.byteLength > JOURNAL_LIMITS.bytes || raw.chunkSize !== 32000)
        throw fail('confirmation_manifest', 'クラウド確認記録の版・容量を確認できません。');
      let text;
      if (raw.revision === null) {
        if (raw.chunkCount !== 0 || !raw.journal) throw fail('confirmation_manifest', '空のクラウド確認記録を確認できません。');
        text = canonical(await checked(raw.journal));
        if (!equal(raw.journal, empty())) throw fail('confirmation_manifest', '未保存のクラウド確認記録を確認できません。');
      } else {
        if (!release || !Number.isSafeInteger(raw.chunkCount) || raw.chunkCount < 1 || raw.chunkCount > 132)
          throw fail('confirmation_manifest', 'クラウド確認記録の読取情報を確認できません。');
        const chunks = [];
        for (let index = 0; index < raw.chunkCount; index++) {
          const part = await this.call('getConfirmationJournalChunk', { ...release, index });
          if (!part || part.revision !== raw.revision || part.index !== index || typeof part.text !== 'string' || part.text.length < 1 || part.text.length > 32000 ||
              !hex64(part.chunkHash) || await codeHash(part.text) !== part.chunkHash)
            throw fail('confirmation_hash', 'クラウド確認記録の分割内容が一致しません。異なる版を混ぜず、取得を中止しました。');
          chunks.push(part.text);
        }
        text = chunks.join('');
      }
      if (bytes(text) !== raw.byteLength || await codeHash(text) !== raw.journalHash) throw fail('confirmation_hash', 'クラウド確認記録の全体を確認できません。元の記録は保持しています。');
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw fail('confirmation_manifest', 'クラウド確認記録の形式を確認できません。'); }
      const journal = await checked(parsed);
      if (canonical(journal) !== text) throw fail('confirmation_manifest', 'クラウド確認記録の正規形式が一致しません。');
      return { journal, revision: raw.revision, journalHash: raw.journalHash };
    } finally {
      if (release) { try { await this.call('releaseConfirmationRead', release); } catch { /* 本文の成否を変えず、サーバーの期限でも解放する。 */ } }
    }
  }
  async read() { return this.manifest(await this.call('getConfirmationJournal')); }
  async result(raw, record) {
    const sent = await checked(JSON.parse(record.text));
    if (raw?.state === 'saved') {
      if (raw.requestId !== record.input.requestId || !hex32(raw.revision) || raw.journalHash !== record.input.journalHash)
        throw fail('confirmation_ack', '保存した確認記録と応答が一致しません。同じ送信番号を保持しています。');
      this.removeLocal('pending');
      return { state: 'saved', revision: raw.revision, journalHash: raw.journalHash, sent, requestId: record.input.requestId };
    }
    if (raw?.state === 'conflict') return { state: 'conflict', ...await this.manifest(raw), sent, requestId: record.input.requestId };
    throw fail('confirmation_ack', '確認記録の保存結果を確認できません。同じ送信番号を保持しています。');
  }
  async send(record) {
    const journal = await checked(JSON.parse(record.text)), text = canonical(journal), chunks = splitJournal(text);
    if (text !== record.text || await codeHash(text) !== record.input.journalHash || bytes(text) !== record.input.byteLength || chunks.length !== record.input.chunkCount)
      throw fail('confirmation_journal_invalid', '確認記録の送信控えと内容が一致しません。元の内容を保持しています。');
    try {
      const proof = await this.call('lookupConfirmationSave', { requestId: record.input.requestId });
      if (['saved', 'conflict'].includes(proof?.state)) return await this.result(proof, record);
      if (!['missing', 'pending'].includes(proof?.state) || proof.requestId !== undefined && proof.requestId !== record.input.requestId)
        throw fail('confirmation_ack', '以前の確認記録の送信結果を確認できません。同じ送信番号を保持しています。');
      const begun = await this.call('beginConfirmationSave', record.input);
      if (['saved', 'conflict'].includes(begun?.state)) return await this.result(begun, record);
      if (begun?.state !== 'uploading' || begun.requestId !== record.input.requestId || !Array.isArray(begun.received) ||
          new Set(begun.received).size !== begun.received.length || begun.received.some(index => !Number.isSafeInteger(index) || index < 0 || index >= chunks.length))
        throw fail('confirmation_ack', '確認記録の送信準備を確認できません。同じ送信番号を保持しています。');
      const received = new Set(begun.received);
      for (let index = 0; index < chunks.length; index++) {
        if (received.has(index)) continue;
        const ack = await this.call('putConfirmationChunk', { requestId: record.input.requestId, index, text: chunks[index] });
        if (ack?.state !== 'uploading' || ack.requestId !== record.input.requestId || ack.index !== index || ack.chunkHash !== await codeHash(chunks[index]))
          throw fail('confirmation_ack', '分割した確認記録の保存応答が一致しません。同じ送信番号を保持しています。');
      }
      return await this.result(await this.call('saveConfirmationJournal', { requestId: record.input.requestId, expectedRevision: record.input.expectedRevision }), record);
    } catch (error) {
      if (error.code !== 'confirmation_revision_unavailable') throw error;
      // 競合の受付控えは残るが、その時の本文bankだけが再利用される場合がある。
      // 同じ認証済み経路で最新を読むだけに留め、旧pendingはmerge/明示選択まで消さない。
      const latest = await this.read();
      if (latest.revision === null) throw fail('confirmation_revision_unavailable', '以前のクラウド確認記録を確認できません。送信控えを保持して教員へ相談してください。');
      return { state: 'conflict', ...latest, sent: journal, requestId: record.input.requestId, previousRevisionUnavailable: true };
    }
  }
  async save(raw, { expectedRevision } = {}) {
    const journal = await checked(raw);
    if (!(expectedRevision === null || hex32(expectedRevision))) throw fail('confirmation_revision', '確認記録の同期元を確認してから保存してください。');
    return this.locked(async () => {
      let record = this.pending();
      if (!record) {
        const text = canonical(journal), chunks = splitJournal(text);
        record = { schema: 1, actorKey: this.session.actorKey, spreadsheetId: this.session.spreadsheetId, text,
          input: { requestId: this.uuid(), expectedRevision, journalHash: await codeHash(text), byteLength: bytes(text), chunkCount: chunks.length } };
        if (!hex32(record.input.requestId)) throw fail('confirmation_journal_invalid', '確認記録の送信番号を作成できません。');
        this.writeLocal('pending', record);
      }
      return this.send(record);
    });
  }
  async recover() { return this.locked(async () => { const record = this.pending(); return record ? this.send(record) : null; }); }
  async releasePending(requestId) {
    return this.locked(async () => {
      const record = this.pending();
      if (record && record.input.requestId !== requestId) throw fail('confirmation_journal_changed', '確認記録の送信控えが変更されました。元の内容は保持しています。');
      if (record) this.removeLocal('pending');
    });
  }
}

export class ConfirmationSync {
  constructor(store, client, options = {}) {
    Object.assign(this, { store, client, changed: options.changed || (() => {}), conflict: options.conflict || (() => {}), failed: options.failed || (() => {}),
      backup: options.backup, idleMs: options.idleMs ?? 600000, minIntervalMs: options.minIntervalMs ?? 20000, maxWaitMs: options.maxWaitMs ?? 600000,
      jitterMs: options.jitterMs ?? 0, now: options.now || Date.now, random: options.random || Math.random,
      setTimer: options.setTimer || ((fn, ms) => setTimeout(fn, ms)), clearTimer: options.clearTimer || (id => clearTimeout(id)) });
    this.status = 'disconnected'; this.connected = false; this.ready = false; this.dirty = false; this.generation = 0; this.lastWrite = -Infinity; this.queue = Promise.resolve(); this.failures = 0;
    this.firstDirty = this.lastEdit = this.now(); this.jitter = Math.floor(this.random() * this.jitterMs);
  }
  state() { return { status: this.status, dirty: this.dirty, connected: this.connected, conflict: this.conflictState ? clone(this.conflictState) : null, lastError: this.lastError || null }; }
  enqueue(task) { const result = this.queue.then(task); this.queue = result.catch(() => {}); return result; }
  notify() { this.changed(this.state()); }
  async local() { await this.store.idle?.(); await this.store.refresh?.(); return this.store.snapshot(); }
  async adopt(remote, generation, { requestId } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (generation !== this.generation) return;
      const local = await this.local(), merged = await mergeConfirmationJournals(local, remote.journal, this.client.base().responseHashes);
      if (generation !== this.generation) return;
      if (merged.keys.length) {
        this.conflictState = { local, remote: remote.journal, keys: merged.keys, revision: remote.revision, journalHash: remote.journalHash, requestId };
        this.status = 'conflict'; this.dirty = true; this.notify(); this.conflict(clone(this.conflictState)); return;
      }
      // ローカル内容がそのままなら書き直さない。容量不足時も、RAMに残った記録をクラウドへ退避できる。
      try { if (!equal(merged.journal, local)) await this.store.adoptRemote(merged.journal, { expectedLocal: local, isCurrent: () => generation === this.generation }); }
      catch (error) { if (error.code === 'journal_changed' && attempt < 2) continue; throw error; }
      if (generation !== this.generation) return;
      await this.client.rememberBase(remote);
      if (requestId) await this.client.releasePending(requestId);
      this.revision = remote.revision; this.conflictState = null; this.lastError = null; this.failures = 0;
      this.dirty = !sameConfirmationJournal(await this.local(), remote.journal); this.status = this.dirty ? 'waiting' : 'saved'; this.notify(); this.schedule(); return;
    }
  }
  handle(error) {
    this.lastError = error; this.failures++;
    this.status = auth.has(error.code) ? 'auth' : retry.has(error.code) || !error.code ? 'retry' : 'error';
    if (this.status === 'auth') this.connected = false;
    this.retryAt = this.now() + Math.min(60000, 2000 * 2 ** Math.min(this.failures - 1, 5)) + Math.floor(this.random() * this.jitterMs);
    this.notify(); this.failed(error); this.schedule();
  }
  async connect() {
    return this.enqueue(async () => {
      const generation = this.generation; this.status = 'loading'; this.connected = true; this.ready = false; this.notify();
      try {
        const recovery = await this.client.recover(); if (generation !== this.generation) return;
        if (recovery?.state === 'saved') await this.client.rememberBase({ journal: recovery.sent, revision: recovery.revision });
        const remote = recovery?.state === 'conflict' ? recovery : await this.client.read();
        if (generation !== this.generation) return;
        await this.adopt(remote, generation, { requestId: recovery?.state === 'conflict' ? recovery.requestId : undefined });
        if (generation !== this.generation) return;
        this.ready = true; this.schedule();
      } catch (error) { if (generation === this.generation) this.handle(error); throw error; }
      return this.state();
    });
  }
  edit() {
    const time = this.now();
    if (!this.dirty) { this.firstDirty = time; this.jitter = Math.floor(this.random() * this.jitterMs); }
    if (this.active && this.firstAfterSend === undefined) this.firstAfterSend = time;
    this.dirty = true; this.lastEdit = time;
    if (!['conflict', 'auth', 'error', 'retry', 'loading', 'saving'].includes(this.status)) this.status = this.connected ? 'waiting' : 'disconnected';
    this.notify(); this.schedule();
  }
  due() { return Math.max(this.lastWrite + this.minIntervalMs, this.retryAt || 0, this.status === 'retry' ? 0 : Math.min((this.lastEdit ?? this.now()) + this.idleMs, (this.firstDirty ?? this.now()) + this.maxWaitMs) + (this.jitter || 0)); }
  schedule() {
    this.clearTimer(this.timer);
    if (this.connected && !this.ready && this.status === 'retry' && !this.active) {
      this.timer = this.setTimer(() => this.connect().catch(() => {}), Math.max(0, this.retryAt - this.now())); return;
    }
    if (!this.connected || !this.ready || !this.dirty || this.active || ['conflict', 'auth', 'error', 'loading'].includes(this.status)) return;
    this.timer = this.setTimer(() => this.flush({ force: false }).catch(() => {}), Math.max(0, this.due() - this.now()));
  }
  flush({ force = true } = {}) {
    if (force && this.forcedFlush) return this.forcedFlush;
    const failuresAtRequest = this.failures;
    const promise = this.enqueue(async () => {
      this.clearTimer(this.timer);
      if (!this.connected || !this.ready || !this.dirty || ['conflict', 'auth', 'error', 'loading'].includes(this.status)) return this.state();
      if (force && this.failures > failuresAtRequest && this.status === 'retry') return this.state();
      if (!force && this.due() > this.now()) { this.schedule(); return this.state(); }
      const generation = this.generation; this.active = true;
      try {
        do {
          this.status = 'saving'; this.lastWrite = this.now(); this.notify();
          const sent = await this.local(); this.firstAfterSend = undefined;
          const result = await this.client.save(sent, { expectedRevision: this.revision });
          if (generation !== this.generation) return;
          if (result.state === 'conflict') await this.adopt(result, generation, { requestId: result.requestId });
          else {
            await this.client.rememberBase({ journal: result.sent, revision: result.revision }); this.revision = result.revision;
            this.dirty = !sameConfirmationJournal(await this.local(), result.sent);
            if (this.dirty && sameConfirmationJournal(sent, result.sent) && this.firstAfterSend !== undefined) this.firstDirty = this.firstAfterSend;
            this.status = this.dirty ? 'waiting' : 'saved'; this.failures = 0; this.retryAt = 0; this.lastError = null; this.notify();
          }
        } while (force && generation === this.generation && this.connected && this.dirty && this.status === 'waiting');
      } catch (error) { if (generation === this.generation) this.handle(error); throw error; }
      finally { this.active = false; this.schedule(); }
      return this.state();
    });
    if (force) { this.forcedFlush = promise; const clear = () => { if (this.forcedFlush === promise) this.forcedFlush = null; }; promise.then(clear, clear); }
    return promise;
  }
  async resolve(choice, { backup = this.backup } = {}) {
    if (!['local', 'cloud'].includes(choice)) throw fail('confirmation_conflict', '残す回答を選んでください。');
    return this.enqueue(async () => {
      if (!this.conflictState) return this.state();
      const generation = this.generation, remote = clone(this.conflictState), local = await this.local();
      const check = await mergeConfirmationJournals(local, remote.remote, this.client.base().responseHashes);
      const preserved = { local, remote: remote.remote, keys: check.keys, revision: remote.revision };
      if (!backup || await backup(clone(preserved)) !== true) throw fail('confirmation_backup', '両方の確認記録を保護してから、残す回答を選んでください。回答は変更していません。');
      if (generation !== this.generation) return;
      const merged = await mergeConfirmationJournals(local, remote.remote, this.client.base().responseHashes, Object.fromEntries(check.keys.map(key => [key, choice])));
      await this.store.adoptRemote(merged.journal, { expectedLocal: local, isCurrent: () => generation === this.generation });
      if (generation !== this.generation) return;
      await this.client.rememberBase({ journal: remote.remote, revision: remote.revision });
      if (remote.requestId) await this.client.releasePending(remote.requestId);
      this.revision = remote.revision; this.conflictState = null; this.dirty = !sameConfirmationJournal(await this.local(), remote.remote); this.lastError = null;
      this.status = this.dirty ? 'waiting' : 'saved'; this.firstDirty = this.lastEdit = this.now(); this.notify(); this.schedule(); return this.state();
    });
  }
  reconnect(client) {
    if (client.session.actorKey !== this.client.session.actorKey || client.session.spreadsheetId !== this.client.session.spreadsheetId)
      throw fail('actor_mismatch', '接続先の学校アカウント・保存先が異なります。以前の送信控えは保持しています。');
    client.memory = new Map([...client.memory, ...this.client.memory]); this.generation++; this.client = client; this.connected = false; this.ready = false; this.status = 'disconnected';
    this.conflictState = null; this.clearTimer(this.timer); return this.connect();
  }
  dispose() { this.generation++; this.connected = false; this.ready = false; this.status = 'disconnected'; this.clearTimer(this.timer); this.notify(); }
  unsaved() { return this.dirty; }
}
