/* Session-only local auto-save.  This module never sends a document or persists handles. */
(function (root, factory) {
  const AutoSave = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = AutoSave;
  root.IlapoLocalAutosave = AutoSave;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function sameEntry(a, b) {
    if (!a || !b) return Promise.resolve(false);
    const checker = typeof a.isSameEntry === 'function' ? a : (typeof b.isSameEntry === 'function' ? b : null);
    if (!checker) return Promise.resolve(a === b);
    return Promise.resolve(checker.isSameEntry(checker === a ? b : a)).then(Boolean);
  }
  function fingerprint(handle) {
    if (!handle || typeof handle.getFile !== 'function') return Promise.reject(new TypeError('自動保存先がファイルではありません。'));
    return Promise.resolve(handle.getFile()).then(function (file) {
      if (!file) throw new Error('自動保存先の状態を確認できません。');
      return { lastModified: Number(file.lastModified), size: Number(file.size) };
    });
  }
  function equalFingerprint(a, b) { return !!a && !!b && a.lastModified === b.lastModified && a.size === b.size; }

  class IlapoLocalAutosave {
    constructor(options) {
      options = options || {};
      if (typeof options.encode !== 'function') throw new TypeError('IlapoLocalAutosave requires encode.');
      this._encode = options.encode;
      this._onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
      this._handle = null;
      this._knownExplicit = [];
      this._fingerprint = null;
      this._generation = 0;
      this._active = false;
      this._queued = 0;
      this._tail = Promise.resolve();
    }
    get active() { return this._active; }
    get pending() { return this._queued > 0; }
    _status(state, message) { try { this._onStatus({ state: state, message: message }); } catch (_) {} }
    async _isKnownExplicit(handle) {
      for (const explicit of this._knownExplicit) if (await sameEntry(handle, explicit)) return true;
      return false;
    }
    async protect(handle) {
      if (!handle) throw new TypeError('保存先がありません。');
      if (this._handle && await sameEntry(handle, this._handle)) throw new Error('自動保存先は明示保存先として使用できません。');
      return true;
    }
    async rememberExplicit(handle) {
      if (!handle) throw new TypeError('保存先がありません。');
      await this.protect(handle);
      if (!await this._isKnownExplicit(handle)) this._knownExplicit.push(handle);
      return true;
    }
    async start(doc, suppliedHandle) {
      let handle = suppliedHandle;
      if (!handle) {
        if (typeof root.showSaveFilePicker !== 'function') throw new Error('このブラウザはローカル自動保存に対応していません。');
        // This call is deliberately before the first await: callers must invoke start from a user gesture.
        handle = await root.showSaveFilePicker({ suggestedName: 'イラポ.autosave.ilapo.zip', types: [{ description: 'イラポ自動保存', accept: { 'application/zip': ['.zip'] } }] });
      }
      if (!handle || typeof handle.createWritable !== 'function') throw new TypeError('自動保存先がファイルではありません。');
      if (await this._isKnownExplicit(handle)) throw new Error('明示保存先と同じファイルは自動保存先にできません。');
      const before = await fingerprint(handle);
      this.stop(false);
      this._handle = handle;
      this._fingerprint = before;
      this._active = true;
      this._generation += 1;
      await this.schedule(doc);
      return handle;
    }
    stop(notify) {
      const wasActive = this._active;
      this._generation += 1;
      this._active = false;
      this._handle = null;
      this._fingerprint = null;
      if (notify !== false && wasActive) this._status('stopped', 'ローカル自動保存を停止しました。');
    }
    schedule(doc) {
      let snapshot;
      try { snapshot = copy(doc); } catch (error) { this._fail(this._generation, error); return Promise.resolve(false); }
      if (!this._active || !this._handle) return Promise.resolve(false);
      const generation = this._generation;
      const handle = this._handle;
      this._queued += 1;
      const job = () => this._write(generation, handle, snapshot).catch(error => { this._fail(generation, error); return false; }).finally(() => { this._queued -= 1; });
      const operation = this._tail.then(job, job);
      // Keep the internal queue fulfilled so an ignored caller never creates an unhandled rejection.
      this._tail = operation.then(() => undefined, () => undefined);
      return operation;
    }
    _current(generation, handle) { return this._active && this._generation === generation && this._handle === handle; }
    _fail(generation, error) {
      if (generation !== this._generation) return;
      const message = error && error.message ? error.message : 'ローカル自動保存に失敗しました。';
      this.stop(false);
      this._status('error', message);
    }
    async _write(generation, handle, snapshot) {
      if (!this._current(generation, handle)) return false;
      this._status('saving', 'ローカルへ自動保存中…');
      const observed = await fingerprint(handle);
      if (!this._current(generation, handle)) return false;
      if (!equalFingerprint(observed, this._fingerprint)) throw new Error('自動保存先が外部で変更されたため、自動保存を停止しました。');
      const bytes = await this._encode(snapshot);
      if (!this._current(generation, handle)) return false;
      const writable = await handle.createWritable();
      if (!this._current(generation, handle)) { if (writable && typeof writable.abort === 'function') await writable.abort(); return false; }
      try {
        await writable.write(bytes);
        if (!this._current(generation, handle)) { if (typeof writable.abort === 'function') await writable.abort(); return false; }
        await writable.close();
      } catch (error) {
        if (writable && typeof writable.abort === 'function') try { await writable.abort(); } catch (_) {}
        throw error;
      }
      const after = await fingerprint(handle);
      if (!this._current(generation, handle)) return false;
      this._fingerprint = after;
      this._status('saved', 'ローカルへ自動保存しました。');
      return true;
    }
  }
  return IlapoLocalAutosave;
}));
