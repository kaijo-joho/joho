/* Optional File System Access API based automatic saving. */
(function (root, factory) {
  const storage = typeof module === 'object' && module.exports ? require('./storage.js') : root.DiagramStorage;
  const api = factory(storage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DiagramLocalAutosave = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';
  if (!S) throw new Error('DiagramStorage を読み込めません。');
  const clone = value => JSON.parse(JSON.stringify(value));
  const isView = value => value === undefined || value === null || value && typeof value === 'object'
    && [value.x, value.y, value.scale].every(Number.isFinite) && value.x >= -100000 && value.x <= 100000
    && value.y >= -100000 && value.y <= 100000 && value.scale >= .02 && value.scale <= 4;
  const message = error => error instanceof Error ? error.message : String(error || '保存できませんでした。');

  function create({ onState } = {}) {
    let generation = 0, active = false, handle = null, documentId = null, pending = null, worker = Promise.resolve(), running = false;
    let writer = null, lastText = null, snapshot = null, aborting = Promise.resolve();
    let state = { status: 'idle', name: '', message: '' };
    const publish = (status, text = '') => {
      state = { status, name: handle?.name || state.name || '', message: text };
      try { if (typeof onState === 'function') onState(clone(state)); } catch { /* UI listeners cannot interrupt saving. */ }
    };
    const normalize = (input, options = {}) => {
      if (!isView(options.view)) throw new Error('表示位置が不正です。');
      const parsed = S.parseFile(S.serializeFile(input, { method: 'auto' }));
      let saved = parsed.saved;
      if (options.saved === '') saved = '';
      else if (options.saved !== undefined) {
        if (typeof options.saved !== 'string') throw new Error('保存済みの文書が不正です。');
        const previous = S.parseFile(options.saved);
        if (previous.document.id !== parsed.document.id) throw new Error('別の図は同じ自動保存先へ保存できません。');
        saved = previous.saved;
      }
      return { document: parsed.document, view: options.view ? clone(options.view) : null, saved };
    };
    const aborted = new WeakSet();
    const abort = async value => {
      if (!value || typeof value.abort !== 'function' || aborted.has(value)) return;
      aborted.add(value);
      try { await value.abort(); } catch { /* A failed abort is reported by the pending write when relevant. */ }
    };
    const permit = async target => {
      if (typeof target.queryPermission === 'function') {
        const result = await target.queryPermission({ mode: 'readwrite' });
        if (result === 'denied') return false;
        if (result === 'granted') return true;
      }
      if (typeof target.requestPermission === 'function') return (await target.requestPermission({ mode: 'readwrite' })) === 'granted';
      return true;
    };
    const allowedFile = async (target, id) => {
      const file = await target.getFile();
      if (Number.isFinite(file.size) && file.size > 2 * 1024 * 1024) throw new Error('既存のファイルは2MB以内にしてください。');
      const text = await file.text();
      if (text === '') return text;
      let raw;
      try { raw = JSON.parse(text); } catch { throw new Error('既存のファイルが自動保存用の図ではありません。'); }
      if (!raw?.saveInfo || raw.saveInfo.method !== 'auto') throw new Error('既存のファイルが自動保存用の図ではありません。');
      const parsed = S.parseFile(text);
      if (parsed.legacy || parsed.method !== 'auto') throw new Error('既存のファイルが自動保存用の図ではありません。');
      if (parsed.document.id !== id) throw new Error('別の図のファイルには自動保存できません。');
      return text;
    };
    const writeOne = async (record, token) => {
      let writable = null, closed = false;
      try {
        if (!active || token !== generation) return false;
        if (typeof handle.queryPermission === 'function' && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('保存先への書き込みが許可されませんでした。');
        if (!active || token !== generation) return false;
        const file = await handle.getFile(), before = await file.text();
        if (!active || token !== generation) return false;
        if (before !== lastText) throw new Error('保存先のファイルが外部で変更されたため、自動保存を停止しました。');
        const text = S.serializeFile(record.document, { method: 'auto' });
        writable = await handle.createWritable(); writer = writable;
        if (!active || token !== generation) { await abort(writable); return false; }
        await writable.write(text);
        if (!active || token !== generation) { await abort(writable); return false; }
        await writable.close(); closed = true; writer = null;
        if (!active || token !== generation) return false;
        lastText = text;
        const parsed = S.parseFile(text);
        snapshot = { ...parsed, view: record.view, saved: record.saved, name: handle.name || '' };
        publish('saved', 'ローカルファイルへ自動保存しました。');
        return true;
      } catch (cause) {
        if (writer === writable) writer = null;
        if (!closed) await abort(writable);
        if (!active || token !== generation) return false;
        active = false; pending = null;
        publish('failed', message(cause));
        return false;
      }
    };
    const drain = async token => {
      let wrote = false;
      while (active && token === generation && pending) {
        const record = pending; pending = null;
        if (!await writeOne(record, token)) break;
        wrote = true;
      }
      return wrote;
    };
    const schedule = token => {
      if (running) return worker;
      running = true;
      worker = drain(token).catch(cause => { if (active && token === generation) { active = false; publish('failed', message(cause)); } return false; }).finally(() => {
        running = false;
        if (active && token === generation && pending) schedule(token);
      });
      return worker;
    };

    async function start(target, input, options = {}) {
      stop(); const token = generation, older = worker, previousAbort = aborting; await older.catch(() => false); await previousAbort;
      let record;
      try {
        if (token !== generation) return false;
        if (!target || typeof target.getFile !== 'function' || typeof target.createWritable !== 'function') throw new Error('保存先のファイルを利用できません。');
        record = normalize(input, options);
        if (!await permit(target)) throw new Error('保存先への書き込みが許可されませんでした。');
        if (token !== generation) return false;
        const initialText = await allowedFile(target, record.document.id);
        if (token !== generation) return false;
        handle = target; documentId = record.document.id; lastText = initialText;
        active = true; pending = record; publish('saving', 'ローカルファイルへ保存中です。');
        await schedule(token);
        return token === generation && state.status === 'saved';
      } catch (cause) {
        if (token === generation) { active = false; pending = null; publish('failed', message(cause)); }
        return false;
      }
    }
    function enqueue(input, options = {}) {
      if (!active) return;
      let record;
      try { record = normalize(input, options); } catch (cause) {
        generation++; active = false; pending = null; aborting = abort(writer); writer = null; publish('failed', message(cause)); return;
      }
      if (record.document.id !== documentId) {
        generation++; active = false; pending = null; aborting = abort(writer); writer = null; publish('failed', '別の図は同じ自動保存先へ保存できません。'); return;
      }
      pending = record;
      if (state.status !== 'saving') publish('saving', 'ローカルファイルへ保存中です。');
      if (!running) schedule(generation);
    }
    function stop() {
      generation++; active = false; pending = null;
      const open = writer; writer = null; aborting = abort(open);
      publish('stopped', 'ローカルファイルへの自動保存を停止しました。');
    }
    async function flush() { while (running) await worker.catch(() => false); }
    return Object.freeze({ start, enqueue, stop, flush, getSnapshot: () => snapshot ? clone(snapshot) : null, getState: () => clone(state) });
  }
  return Object.freeze({ create });
});
