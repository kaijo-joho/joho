import { APP, FORMAT, questionKey, validateDraft } from './core.mjs';
const PREFIX = 'joho.pythoneditor.v1.';
export class DraftStore {
  constructor(storage = globalThis.localStorage) { this.storage = storage; this.revisions = new Map(); this.blocked = new Set(); }
  key(entry, kind = 'auto') { return `${PREFIX}${kind}.${questionKey(entry)}`; }
  read(entry, kind = 'auto') {
    const key = this.key(entry, kind), raw = this.storage.getItem(key);
    if (!raw) { if (kind === 'auto') this.revisions.set(key, null); return null; }
    const record = JSON.parse(raw);
    const value = validateDraft({ app: APP, version: FORMAT, entries: [record.entry] }).entries[0];
    if (questionKey(value) !== questionKey(entry) || typeof record.revision !== 'string') throw new Error('ブラウザ保存の形式を確認してください。元データは保持しています。');
    if (kind === 'auto') this.revisions.set(key, record.revision);
    return value;
  }
  write(entry, kind = 'auto') {
    validateDraft({ app: APP, version: FORMAT, entries: [entry] });
    const key = this.key(entry, kind), raw = this.storage.getItem(key);
    if (kind === 'auto') {
      if(this.blocked.has(key)) throw new Error('別タブとの競合が未解決です。現在のコードをファイルに保存するか、ブラウザの保存内容を選び直してください。');
      const current = raw ? JSON.parse(raw).revision : null;
      if (this.revisions.has(key) && current !== this.revisions.get(key)) {
        this.blocked.add(key);this.archive(entry, '別タブとの競合');
        throw new Error('別タブの保存と競合しました。現在のコードを控えに残しました。ファイルに保存してから、ブラウザの保存内容を選び直してください。');
      }
    }
    const revision = crypto.randomUUID();
    this.storage.setItem(key, JSON.stringify({ revision, entry }));
    if (kind === 'auto') this.revisions.set(key, revision);
  }
  archive(entry, reason) {
    // 復元前の内容は別キーへ残す。容量不足なら置換を行わない。
    const key = `${PREFIX}archive.${questionKey(entry)}.${crypto.randomUUID()}`;
    this.storage.setItem(key, JSON.stringify({ entry, reason, at: new Date().toISOString() }));
  }
  resolveConflict(entry) { const saved=this.read(entry);this.blocked.delete(this.key(entry));return saved; }
  prepareImport(entry,reason) {
    const key=this.key(entry),raw=this.storage.getItem(key);
    // 控えの保存に失敗した後も、次の自動保存で別タブの内容を消さない。
    this.blocked.add(key);this.archive(entry,reason);
    const latest=this.read(entry);
    if(latest&&(latest.code!==entry.code||latest.stdin!==entry.stdin))this.archive(latest,'別タブからの保存内容');
    if(this.storage.getItem(key)!==raw)throw new Error('控えの保存中に別タブが更新しました。両方の内容を確認して取り込み直してください。');
    this.resolveConflict(entry);
  }
  candidates(entry) {
    const items = [];
    for (const kind of ['auto', 'manual']) {
      const value = this.read(entry, kind);
      if (value) items.push({ kind, entry: value, label: kind === 'auto' ? '自動保存' : '明示保存' });
    }
    const prefix = `${PREFIX}archive.${questionKey(entry)}.`;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) {
        try {
          const r = JSON.parse(this.storage.getItem(key));
          const value = validateDraft({ app: APP, version: FORMAT, entries: [r.entry] }).entries[0];
          items.push({ kind: 'archive', entry: value, label: `取込み前の控え（${r.reason}）` });
        } catch { /* 壊れた控えを削除しない。 */ }
      }
    }
    return items.sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt));
  }
  last(value) {
    if (value) this.storage.setItem(PREFIX + 'last', JSON.stringify(value));
    else return JSON.parse(this.storage.getItem(PREFIX + 'last') || 'null');
  }
}
export function exportDraft(entries) {
  return { app: APP, version: FORMAT, savedAt: new Date().toISOString(), entries: [...entries] };
}
