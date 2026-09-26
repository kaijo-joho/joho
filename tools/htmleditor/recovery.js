/* HTMLエディタのブラウザ内復元候補。認証・外部送信・鍵管理は行わない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlEditorRecovery = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PREFIX = 'joho.htmleditor.recovery.v1.';
  const LEGACY_KEY = 'joho.htmleditor.draft.v1';
  const MAX_TEXT_BYTES = 2 * 1024 * 1024;
  // 本文はファイル読込と同じ上限。JSONの制御文字エスケープは最大6倍になる。
  // メタデータには旧レコード全体と同じ上限を残し、既存の控えの形式を変えない。
  const MAX_METADATA_BYTES = 2 * 1024 * 1024;
  const MAX_RECORD_BYTES = 6 * MAX_TEXT_BYTES + MAX_METADATA_BYTES;
  const LESSON_RE = /^html(?:1[1-8]|2[1-5])$/;
  const MODES = new Set(['lesson', 'free']);
  const KINDS = new Set(['auto', 'manual']);
  const DESTINATIONS = new Set(['browser', 'file']);

  function byteLength(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(value, 'utf8');
    return unescape(encodeURIComponent(value)).length;
  }

  function validTimestamp(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  }

  function validFileName(value) {
    if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/.test(value) || value.includes('\\') ||
        value.startsWith('/') || /^[A-Za-z]:/.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
        !/\.(?:html?|css)$/i.test(value)) return false;
    const parts = value.split('/');
    return parts.every(part => part && part !== '.' && part !== '..');
  }

  function validDocId(value) {
    return typeof value === 'string' && /^(?:[A-Za-z0-9_-]{1,160})$/.test(value) && value !== 'legacy-v1';
  }

  function ownKeys(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value).sort() : null;
  }

  function validatePayload(value, allowLegacy = false) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('復元データがオブジェクトではありません');
    const required = ['schemaVersion', 'savedAt', 'docId', 'fileName', 'lessonId', 'mode', 'kind', 'destination', 'content'];
    const keys = ownKeys(value);
    const expectedKeys = [...required].sort();
    if (!keys || keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) throw new Error('復元データの項目が不足または過剰です');
    if (value.schemaVersion !== 1 || !validTimestamp(value.savedAt) ||
        (!allowLegacy && !validDocId(value.docId)) || (allowLegacy && value.docId !== 'legacy-v1') ||
        !validFileName(value.fileName) || typeof value.lessonId !== 'string' || !LESSON_RE.test(value.lessonId) ||
        !MODES.has(value.mode) || !KINDS.has(value.kind) || !DESTINATIONS.has(value.destination) ||
        typeof value.content !== 'string' || byteLength(value.content) > MAX_TEXT_BYTES ||
        byteLength(JSON.stringify({ ...value, content: '' })) > MAX_METADATA_BYTES) {
      throw new Error('復元データの値が不正です');
    }
    return value;
  }

  function legacyPayload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.content !== 'string' ||
        !raw.meta || typeof raw.meta !== 'object' || Array.isArray(raw.meta) ||
        !validTimestamp(raw.updatedAt) || !validFileName(raw.meta.fileName) ||
        typeof raw.meta.lessonId !== 'string' || !LESSON_RE.test(raw.meta.lessonId) ||
        byteLength(raw.content) > MAX_TEXT_BYTES) throw new Error('旧下書きの値が不正です');
    return validatePayload({
      schemaVersion: 1, savedAt: raw.updatedAt, docId: 'legacy-v1', fileName: raw.meta.fileName,
      lessonId: raw.meta.lessonId, mode: 'lesson', kind: 'auto', destination: 'browser', content: raw.content
    }, true);
  }

  function create(storage, options = {}) {
    if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function' ||
        typeof storage.key !== 'function' || typeof storage.length !== 'number') throw new TypeError('保存先が不正です');
    const now = typeof options.now === 'function' ? options.now : () => Date.now();

    function save(snapshot) {
      const keys = ownKeys(snapshot);
      const expected = ['content', 'destination', 'docId', 'fileName', 'kind', 'lessonId', 'mode'];
      if (!keys || keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error('保存データの項目が不正です');
      if (!validDocId(snapshot.docId)) throw new Error('docIdが不正です');
      const savedAt = now();
      if (!validTimestamp(savedAt)) throw new Error('保存日時が不正です');
      if (typeof snapshot.content !== 'string' || byteLength(snapshot.content) > MAX_TEXT_BYTES) throw new Error('保存データが大きすぎます');
      const payload = { ...snapshot, schemaVersion: 1, savedAt };
      validatePayload(payload);
      const serialized = JSON.stringify(payload);
      if (byteLength(serialized) > MAX_RECORD_BYTES) throw new Error('保存データが大きすぎます');
      const key = PREFIX + payload.docId + '.' + payload.kind;
      storage.setItem(key, serialized);
      return payload;
    }

    function list() {
      const items = [];
      const errors = [];
      for (let index = 0; index < storage.length; index += 1) {
        let key;
        try { key = storage.key(index); } catch (error) { errors.push('キーの読み込みに失敗しました'); continue; }
        if (key !== LEGACY_KEY && !(typeof key === 'string' && key.startsWith(PREFIX))) continue;
        try {
          const rawText = storage.getItem(key);
          if (rawText === null) throw new Error('保存内容がありません');
          // 破損・過大なレコードはJSON解析前に拒否し、元の控えは削除しない。
          if (typeof rawText !== 'string' || rawText.length > MAX_RECORD_BYTES ||
              byteLength(rawText) > MAX_RECORD_BYTES) throw new Error('復元データが大きすぎます');
          const raw = JSON.parse(rawText);
          let payload;
          if (key === LEGACY_KEY) payload = legacyPayload(raw);
          else {
            payload = validatePayload(raw);
            const suffix = key.slice(PREFIX.length);
            if (key !== PREFIX + payload.docId + '.' + payload.kind || !suffix) throw new Error('保存キーと内容が一致しません');
          }
          items.push(payload);
        } catch (error) { errors.push(String(error && error.message || '復元データを読み込めません')); }
      }
      items.sort((a, b) => b.savedAt - a.savedAt);
      return { items, errors };
    }

    return Object.freeze({ save, list });
  }

  return Object.freeze({ create });
}));
