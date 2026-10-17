import { questionKey, validId, LIMITS } from './core.mjs';
import { CloudError, codeHash, googleOrigin } from './cloud.mjs';

const PROTOCOL = 'tools-store-rpc-v1';
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const fail = (code, message) => new CloudError(code, message);
const same = (a, b) => !!a && !!b && a.code === b.code && a.stdin === b.stdin;
export const authErrors = new Set(['login_required', 'auth_required', 'not_allowed', 'actor_mismatch', 'account_mismatch', 'account_denied', 'binding_invalid', 'binding_expired', 'binding_stale', 'permission_denied', 'store_retired', 'store_inactive', 'owner_mismatch', 'execution_mode_mismatch']);
export const retryErrors = new Set(['timeout', 'transport', 'transport_failed', 'service_unavailable', 'storage_write_uncertain', 'busy', 'lock_busy', 'offline', 'upgrading']);

export function gasURL(value, origin, channel, mode) {
  let url;
  try { url = new URL(value); } catch { throw fail('config', '学校アカウントの接続先を確認してください。'); }
  if (url.origin !== 'https://script.google.com' || url.username || url.password || url.search || url.hash ||
      !/^\/(?:a\/macros\/[A-Za-z0-9.-]+\/s|macros\/s)\/[-A-Za-z0-9_]+\/exec$/.test(url.pathname))
    throw fail('config', '学校アカウントの接続先を確認してください。');
  url.search = new URLSearchParams({ [mode === 'dist' ? 'type' : 'kind']: mode === 'dist' ? 'toolsStore' : 'toolsstore', origin, channel }).toString();
  return url.href;
}
function withinFrame(source, frame) {
  try { for (let depth = 0; source && depth < 5; depth++) { if (source === frame) return true; const parent = source.parent; if (parent === source) return false; source = parent; } } catch {}
  return false;
}
// ログイン画面を表示できる接続と、日常の保存用接続で同じ検証を使う。
export class ToolsBridge {
  constructor(url, { mode = 'store', binding = null, timeout = 60000, win = window, doc = document } = {}) {
    Object.assign(this, { url, mode, binding, timeout, win, doc }); this.requests = new Map(); this.generation = 0;
  }
  async connect(container) {
    this.dispose(); const generation = ++this.generation;
    this.channel = uuid() + uuid();
    const frame = this.frame = this.doc.createElement('iframe'); frame.title = '学校アカウント接続';
    frame.src = gasURL(this.url, this.win.location.origin, this.channel, this.mode); frame.referrerPolicy = 'no-referrer';
    frame.hidden = !container;
    const ready = new Promise((resolve, reject) => {
      this.ready = { resolve, reject };
      this.timer = setTimeout(() => reject(fail('timeout', '接続を確認できません。別タブで学校アカウントにログインし、再接続してください。コードは保持しています。')), this.timeout);
    });
    this.listener = event => {
      const d = event.data;
      if (generation !== this.generation || d?.protocol !== PROTOCOL || d.channel !== this.channel || !googleOrigin(event.origin)) return;
      if (d.type === 'ready' && !this.peer) {
        if (!withinFrame(event.source, frame.contentWindow)) return;
        this.peer = event.source; this.origin = event.origin; clearTimeout(this.timer); this.ready.resolve(); return;
      }
      if (event.source !== this.peer || event.origin !== this.origin || d.type !== 'response') return;
      const pending = this.requests.get(d.id); if (!pending) return;
      clearTimeout(pending.timer); this.requests.delete(d.id);
      if (d.result?.ok === true) pending.resolve(d.result.value);
      else pending.reject(fail(d.result?.error?.code || 'transport', d.result?.error?.message || '通信を確認できません。コードは保持しています。'));
    };
    this.win.addEventListener('message', this.listener); (container || this.doc.body).append(frame);
    try { await ready; return await this.call('session', this.mode === 'dist' ? { tool: 'python' } : {}); }
    catch (e) { this.dispose(); throw e; }
  }
  call(action, input) {
    if (!this.peer) return Promise.reject(fail('disconnected', '学校アカウントへ接続してください。'));
    if (this.requests.size >= 4) return Promise.reject(fail('busy', '通信処理が混み合っています。'));
    const id = uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(id); reject(fail('timeout', '保存の応答を確認できません。同じ送信番号で再試行します。')); }, this.timeout);
      this.requests.set(id, { resolve, reject, timer });
      this.peer.postMessage({ protocol: PROTOCOL, channel: this.channel, type: 'request', id, action, input, binding: this.binding }, this.origin);
    });
  }
  dispose() {
    this.generation++; clearTimeout(this.timer); if (this.listener) this.win.removeEventListener('message', this.listener);
    const e = fail('disconnected', '接続を終了しました。コードは保持しています。'); this.ready?.reject(e);
    for (const p of this.requests.values()) { clearTimeout(p.timer); p.reject(e); }
    this.requests.clear(); this.frame?.remove(); this.frame = this.peer = this.origin = this.ready = null;
  }
}
export function validateConnection(value) {
  if (!value || value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.actorKey) || typeof value.account !== 'string' || value.account.length > 254 ||
      !/^[A-Za-z0-9_-]{15,160}$/.test(value.spreadsheetId) || typeof value.binding !== 'string' || value.binding.length > 16000)
    throw fail('session', '保存先の接続情報を確認できません。');
  gasURL(value.storeURL, 'https://example.invalid', 'a'.repeat(64), 'store');
  return { account: value.account, actorKey: value.actorKey, spreadsheetId: value.spreadsheetId, binding: value.binding, storeURL: value.storeURL, schemaVersion: 1 };
}
function checkEntry(entry) {
  if (!validId(entry?.questionId) || !validId(entry.version) || typeof entry.code !== 'string' || entry.code.length > LIMITS.code ||
      typeof entry.stdin !== 'string' || entry.stdin.length > LIMITS.code) throw fail('draft', '保存するコードの形式・長さを確認してください。');
}
// ブラウザの保存不能時も不変要求をメモリに保持し、クラウドへの保存は試みる。
export class ToolsStoreClient {
  constructor(rpc, session, storage, { warn = () => {} } = {}) {
    this.rpc = rpc; this.session = session; this.storage = storage; this.warn = warn; this.memory = new Map(); this.bases = new Map();
    this.baseEpochs = new Map(); this.trustedBases=new Set(); if(!storage)this.warn();
    this.prefix = `joho.pythoneditor.tools-store.v1.${session.actorKey}.`; this.clientId = this.read('client') || uuid(); this.write('client', this.clientId);
  }
  read(key) { if (this.memory.has(key)) return this.memory.get(key); try { const raw = this.storage?.getItem(this.prefix + key); return raw ? JSON.parse(raw) : null; } catch { this.warn(); return null; } }
  write(key, value) {
    this.memory.set(key, structuredClone(value));
    try { this.storage?.setItem(this.prefix + key, JSON.stringify(value)); } catch { this.warn(); }
  }
  remove(key) { this.memory.set(key, null); try { this.storage?.removeItem(this.prefix + key); } catch { this.warn(); } }
  call(action, input) { return this.rpc(action, { tool: 'python', ...input }); }
  base(q) { const key = questionKey(q); if (!this.bases.has(key)) this.bases.set(key, this.read('base.' + key)); return this.bases.get(key); }
  adopt(q, draft) {
    const key = questionKey(q), base = draft ? { revision: draft.revision, codeHash: draft.codeHash, seq: draft.seq, folder:draft.folder||'' } : { revision: null };
    this.bases.set(key, base); this.write('base.' + key, base);
    this.baseEpochs.set(key,(this.baseEpochs.get(key)||0)+1);
    this.trustedBases.add(key);
  }
  async inspect(entry) {
    const key=questionKey(entry),epoch=this.baseEpochs.get(key)||0;
    const result = await this.call('getDraft', { questionId: entry.questionId, version: entry.version });
    if((this.baseEpochs.get(key)||0)!==epoch)return {state:'superseded'};
    const remote = result.draft, base = this.base(entry);
    if (remote && !same(remote, entry) && (!this.trustedBases.has(key) || !base || base.revision !== remote.revision)) return { state: 'conflict', draft: remote };
    if (!remote && base?.revision) throw fail('draft_missing', '以前のクラウド保存が見つかりません。現在のコードを保持して教員へ確認してください。');
    this.adopt(entry, remote); return { state: 'ready', draft: remote };
  }
  pending(q) {
    const record = this.read('pending.' + questionKey(q)); if (!record) return null;
    if (!/^[a-f0-9]{32}$/.test(record.input?.requestId) || questionKey(record.input) !== questionKey(q)) throw fail('journal', '送信控えを確認できません。元データは保持しています。');
    checkEntry(record.input); return record;
  }
  async save(entry, { preserveRevision } = {}) {
    checkEntry(entry); const key=questionKey(entry),initial=!this.trustedBases.has(key);let record = this.pending(entry),result;
    if(record){const proof=await this.call('lookupSave',{requestId:record.input.requestId});if(proof.state==='saved')result=proof;else if(proof.state!=='missing')throw fail('ack','送信の結果を照会できません。控えを保持しています。');}
    if (!record) {
      if(!this.bases.has(questionKey(entry))){const inspection = await this.inspect(entry); if (inspection.state === 'conflict') return inspection;}
      const input = { tool: 'python', questionId: entry.questionId, version: entry.version, setId: entry.setId || 'practice', title: entry.title || entry.questionId,
        folder: entry.folder ?? this.base(entry)?.folder ?? '', requestId: uuid(), expectedRevision: this.base(entry)?.revision || null, code: entry.code, stdin: entry.stdin, clientId: this.clientId,
        ...(preserveRevision ? { preserveRevision } : {}) };
      record = { input }; this.write('pending.' + questionKey(entry), record);
    }
    result ||= await this.call('saveDraft', record.input);
    if (result.state === 'saved') {
      if (!result.draft || result.draft.questionId !== record.input.questionId || result.draft.version !== record.input.version ||
          result.draft.codeHash !== await codeHash(record.input.code) || result.draft.stdinHash !== await codeHash(record.input.stdin) || !/^[a-f0-9]{32}$/.test(result.draft.revision))
        throw fail('ack', '保存した内容の確認が一致しません。同じ送信番号を保持しています。');
      this.adopt(entry, result.draft); this.remove('pending.' + questionKey(entry));
      if(initial&&!same(entry,record.input)){
        this.write('recovery.'+record.input.requestId,record);
        const latest=await this.call('getDraft',{questionId:entry.questionId,version:entry.version});
        if(!latest.draft)throw fail('draft_missing','照会したクラウド保存が見つかりません。送信内容は控えに残しています。');
        this.trustedBases.delete(key);this.bases.delete(key);return {state:'conflict',draft:latest.draft,sent:record.input};
      }
    } else if (result.state === 'conflict') {if(!result.draft)throw fail('draft_missing','以前のクラウド保存が見つかりません。コードと送信番号を保持して教員へ確認してください。');this.write('recovery.'+record.input.requestId,record);this.remove('pending.' + questionKey(entry));}
    else throw fail('ack', '保存結果を確認できません。送信番号を保持しています。');
    return { ...result, sent: structuredClone(record.input) };
  }
}
// 学生ごとに一度に1送信。遅れたackは送信時のsnapshotだけを確定する。
export class DraftAutosave {
  constructor(client, { idleMs = 600000, minIntervalMs = 20000, maxWaitMs = 600000, jitterMs = 0, now = Date.now,
    random = Math.random, setTimer = (fn,ms)=>setTimeout(fn,ms), clearTimer = id=>clearTimeout(id), changed = () => {}, conflict = () => {}, failed = () => {} } = {}) {
    Object.assign(this, { client, idleMs, minIntervalMs, maxWaitMs, jitterMs, now, random, setTimer, clearTimer, changed, conflict, failed });
    this.slots = new Map(); this.lastWrite = -Infinity; this.generation = 0; this.active = false; this.connected = true; this.flushQueue = Promise.resolve();
  }
  state(q) { return this.slots.get(questionKey(q)); }
  edit(q, entry, { force = false } = {}) {
    if (q.kind === 'observation') return;
    const key = questionKey(q), old = this.slots.get(key), time = this.now();
    if (old && same(old.entry, entry) && !force) return;
    const slot = old || { q, firstDirty: time, jitter: Math.floor(this.random() * this.jitterMs), failures: 0 };
    slot.entry = structuredClone({ ...entry, setId: q.setId, title: q.title }); slot.dirty = true; slot.lastEdit = time;
    if (!old?.dirty) { slot.firstDirty = time; slot.jitter = Math.floor(this.random() * this.jitterMs); }
    if (slot.status === 'saving' && slot.nextDirtyAt === undefined) slot.nextDirtyAt = time;
    if (slot.ack && same(slot.entry, slot.ack) && !['saving', 'retry', 'auth', 'error', 'conflict'].includes(slot.status)) slot.dirty = false;
    if (!slot.paused && !['saving', 'retry'].includes(slot.status)) slot.status = slot.dirty ? 'waiting' : 'saved'; this.slots.set(key, slot); this.changed(); this.schedule();
  }
  async inspect(q, entry) {
    if (q.kind === 'observation') return;
    const generation = this.generation, snapshot = structuredClone(entry), result = await this.client.inspect(snapshot);
    if (generation !== this.generation || result.state==='superseded') return;
    let slot = this.state(q);
    if (!slot) { slot = { q, entry: { ...snapshot, setId: q.setId, title: q.title }, firstDirty: this.now(), lastEdit: this.now(), failures: 0, jitter: 0 }; this.slots.set(questionKey(q), slot); }
    if (result.state === 'conflict') {
      slot.dirty = true; slot.paused = true; slot.status = 'conflict'; slot.remote = result.draft; this.changed(); this.conflict(q, result.draft); return;
    }
    slot.status = result.draft && same(snapshot, result.draft) && same(snapshot, slot.entry) ? 'saved' : slot.dirty ? 'waiting' : 'new';
    if (slot.status === 'saved') { slot.ack = structuredClone(snapshot); slot.dirty = false; slot.paused = false; slot.failures = 0; slot.retryAt = 0; slot.error = null; }
    this.changed(); this.schedule();
  }
  due(slot) { return Math.max(this.lastWrite + this.minIntervalMs, slot.retryAt || 0, slot.status === 'retry' ? 0 : Math.min(slot.lastEdit + this.idleMs, slot.firstDirty + this.maxWaitMs) + slot.jitter); }
  schedule() {
    this.clearTimer(this.timer); if (!this.connected || this.active) return;
    const waiting = [...this.slots.values()].filter(s => s.dirty && !s.paused);
    if (waiting.length) this.timer = this.setTimer(() => this.pump(), Math.max(0, Math.min(...waiting.map(s => this.due(s))) - this.now()));
  }
  async pump(force = false) {
    this.clearTimer(this.timer); if (this.active) return this.inflight;
    if (!this.connected) return;
    const slot = [...this.slots.values()].filter(s => s.dirty && !s.paused).sort((a, b) => this.due(a) - this.due(b))[0];
    if (!slot) return;
    if (!force && this.due(slot) > this.now()) { this.schedule(); return; }
    const operation = this.send(slot); this.inflight = operation;
    try { return await operation; } finally { if (this.inflight === operation) this.inflight = null; }
  }
  async send(slot) {
    this.active = true; slot.status = 'saving'; slot.nextDirtyAt = undefined; this.changed(); const generation = this.generation, sent = structuredClone(slot.entry);
    this.lastWrite = this.now();
    try {
      const result = await this.client.save(sent, { preserveRevision: slot.preserveRevision }); if (generation !== this.generation) return { state: 'superseded' };
      if (result.state === 'conflict') { if(!result.draft)throw fail('draft_missing','クラウドの下書きを確認できません。現在のコードは保持しています。');slot.status = 'conflict'; slot.paused = true; slot.remote = result.draft; this.conflict(slot.q, result.draft); }
      else { slot.ack = result.sent; slot.dirty = !same(slot.entry, result.sent); slot.status = slot.dirty ? 'waiting' : 'saved'; slot.failures = 0; slot.retryAt = 0; slot.preserveRevision = null; slot.error = null;
        if (slot.dirty && same(sent, result.sent) && slot.nextDirtyAt !== undefined) slot.firstDirty = slot.nextDirtyAt;
      }
      return { state: slot.status };
    } catch (e) {
      if (generation !== this.generation) return { state: 'superseded' };
      slot.failures++; slot.status = authErrors.has(e.code) ? 'auth' : retryErrors.has(e.code) || !e.code ? 'retry' : 'error';
      slot.paused = ['auth', 'error'].includes(slot.status); slot.retryAt = this.now() + Math.min(60000, 2000 * 2 ** Math.min(slot.failures - 1, 5)) + Math.floor(this.random() * this.jitterMs);
      if (slot.status === 'auth') this.connected = false;
      slot.error = e;
      this.failed(e); // 全文・requestId・最新編集は保持したまま。
      return { state: slot.status, error: e };
    } finally { this.active = false; this.changed(); this.schedule(); }
  }
  // 節目の保存は保険timerを待たず、通信中のackとその間の編集も含めて直列に確認する。
  flush() {
    if (this.flushing) return this.flushing;
    const task = async () => {
      const generation = this.generation;
      if (this.inflight) { const active = await this.inflight; if (active && !['saved', 'waiting'].includes(active.state)) return this.summary(); }
      while (generation === this.generation && this.connected) {
        const waiting = [...this.slots.values()].some(slot => slot.dirty && !slot.paused);
        if (!waiting) break;
        const result = await this.pump(true);
        if (!result || result.state !== 'saved' && result.state !== 'waiting') break;
      }
      return this.summary();
    };
    const result = this.flushQueue.then(task); this.flushing = result; this.flushQueue = result.catch(() => {});
    const clear = () => { if (this.flushing === result) this.flushing = null; }; result.then(clear, clear); return result;
  }
  summary() { return { saved: !this.unsaved() && ![...this.slots.values()].some(slot => ['conflict', 'auth', 'retry', 'error'].includes(slot.status)), connected: this.connected,
    statuses: [...this.slots.values()].map(slot => ({ questionId: slot.q.questionId, version: slot.q.version, status: slot.status, dirty: slot.dirty })) }; }
  resolve(q, remote, entry) {
    this.client.adopt(q, remote); const slot = this.state(q); if (slot) { slot.paused = false; slot.remote = null; slot.preserveRevision = remote.revision; slot.ack = structuredClone(remote); }
    this.edit(q, entry, { force: true });
    const current = this.state(q); if (same(entry, remote)) { current.dirty = false; current.status = 'saved'; current.ack = structuredClone(entry); }
    this.changed(); this.schedule();
  }
  reconnect(client) {
    if (client.session.actorKey !== this.client.session.actorKey) throw fail('actor_mismatch', '別の学校アカウントです。前の送信は保持しています。');
    if(client.memory&&this.client.memory){client.memory=new Map([...client.memory,...this.client.memory]);client.clientId=this.client.clientId;client.bases=new Map(this.client.bases);client.trustedBases=new Set(this.client.trustedBases);client.baseEpochs=new Map(this.client.baseEpochs);}
    this.generation++; this.client = client; this.connected = true;
    for (const slot of this.slots.values()) if (['auth','retry','error'].includes(slot.status)) { slot.paused = false; slot.retryAt = 0; slot.status = 'waiting'; }
    this.schedule(); this.changed();
  }
  dispose() { this.generation++; this.connected = false; this.clearTimer(this.timer); }
  unsaved() { return [...this.slots.values()].some(s => s.dirty); }
}
