// 文書ごとの回路・履歴・保存先。旧保存領域を移行元として読み、上書きしない。
(function (root, factory) {
  const Storage = typeof module === 'object' && module.exports ? require('../../js/logic-storage.js') : root.LogicStorage;
  const api = factory(root, Storage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogicDocuments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Storage) {
  'use strict';
  const KEY = 'joho.logic-workspace.v1', MAX_TABS = 20, MAX_BYTES = 4 * 1024 * 1024;
  const copy = value => JSON.parse(JSON.stringify(value));
  const fingerprint = snapshot => JSON.stringify(Storage.normalizeSnapshot(snapshot));
  function normalizeDocument(value) {
    if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) throw new Error('文書IDが不正です。');
    if (typeof value.name !== 'string' || value.name.length > 60) throw new Error('文書名が不正です。');
    const snapshot = Storage.normalizeSnapshot(value.snapshot);
    const saved = value.savedFingerprint == null ? null : fingerprint(JSON.parse(value.savedFingerprint));
    const browserId = typeof value.browserId === 'string' && value.browserId.length <= 120 ? value.browserId : null;
    const view = value.view && typeof value.view === 'object' && !Array.isArray(value.view) ? copy(value.view) : {};
    return { id: value.id, name: value.name, snapshot, savedFingerprint: saved, browserId, view,
      savedName: typeof value.savedName === 'string' ? value.savedName.slice(0, 60) : value.name,
      updatedAt: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : new Date().toISOString(),
      lastDestination: ['browser', 'file'].includes(value.lastDestination) ? value.lastDestination : null,
      pristineFingerprint: value.pristineFingerprint === fingerprint(snapshot) ? value.pristineFingerprint : null };
  }
  class ResumeStore {
    constructor(storage) { this.storage = storage; this.raw = null; this.blocked = false; }
    load() {
      try {
        this.raw = this.storage.getItem(KEY);
        if (this.raw === null) return null;
        if (this.raw.length > MAX_BYTES) throw new Error();
        const value = JSON.parse(this.raw);
        if (value.version !== 1 || !Array.isArray(value.documents) || !value.documents.length || value.documents.length > MAX_TABS) throw new Error();
        const documents = value.documents.map(normalizeDocument);
        if (new Set(documents.map(doc => doc.id)).size !== documents.length || !documents.some(doc => doc.id === value.activeId)) throw new Error();
        return { documents, activeId: value.activeId };
      } catch (_) { this.blocked = true; throw new Error('前回の文書を読み取れませんでした。元の記録を保持しています。ファイルへの保存と読み込みを利用できます。'); }
    }
    assertUnchanged() {
      if (this.blocked || this.storage.getItem(KEY) !== this.raw) {
        this.blocked = true;
        throw new Error('別のブラウザタブで文書の自動保存が更新されました。上書きを止めました。必要な回路をファイルに保存してください。');
      }
    }
    save(value) {
      this.assertUnchanged();
      const normalized = { version: 1, activeId: value.activeId, documents: value.documents.map(normalizeDocument) };
      const raw = JSON.stringify(normalized);
      if (raw.length > MAX_BYTES) throw new Error('自動保存の容量が大きすぎます。ファイルに保存してから不要な文書タブを閉じてください。');
      this.storage.setItem(KEY, raw); this.raw = raw;
    }
  }
  function uid() { return 'doc-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); }
  function element(tag, text, className) {
    const node = document.createElement(tag); if (text != null) node.textContent = text;
    if (className) node.className = className; return node;
  }
  class Workspace {
    constructor(options) {
      Object.assign(this, options); this.docs = []; this.activeId = null; this.switching = true; this.timer = null;
      this.store = null; this.legacyDrafts = []; this.flushing = Promise.resolve();
      this.captureView = options.captureView || (() => ({})); this.applyView = options.applyView || (() => {});
      try {
        this.store = new ResumeStore(root.localStorage);
        const resume = this.store.load();
        if (resume) { this.docs = resume.documents; this.activeId = resume.activeId; }
      } catch (error) { this.report(error); }
      try {
        const old = new root.LogicDraft.Store(root.localStorage);
        old.load(); this.legacyDrafts = old.list();
      } catch (error) { this.report(error); }
      if (!this.docs.length) {
        const legacy = this.legacyDrafts[0];
        let latest = null;
        if (!legacy) {
          try { latest = new Storage.Store(root.localStorage).list().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]; } catch (_) { /* 新規文書を使う。 */ }
        }
        this.docs = [this.makeDocument(legacy?.snapshot || latest?.snapshot || this.initialSnapshot,
          legacy?.file.name || latest?.name || '', legacy?.file.savedSnapshot || latest?.snapshot || null,
          legacy?.file.id || latest?.id || null)];
        this.activeId = this.docs[0].id;
        if (!legacy && !latest) this.docs[0].pristineFingerprint = fingerprint(this.initialSnapshot);
      }
      this.docs.forEach(doc => {
        doc.history = [copy(doc.snapshot)]; doc.historyIndex = 0; doc.autoEnabled = false; doc.writeChain = Promise.resolve();
        if (doc.browserId) {
          try {
            const record = new Storage.Store(root.localStorage).get(doc.browserId);
            if (record && fingerprint(record.snapshot) === doc.savedFingerprint) doc.browserRevision = JSON.stringify(record);
          } catch (_) { /* 保存時に競合を再確認する。 */ }
        }
      });
      this.apply(this.current); this.switching = false; this.renderTabs();
      this.status?.(this.error ? 'error' : 'ready', this.error || '前回の文書を再開しました。自動保存と名前付き保存は別に保持します。');
      root.addEventListener('storage', event => {
        if (event.key !== KEY && event.key !== null) return;
        try { this.store?.assertUnchanged(); } catch (error) { clearTimeout(this.timer); this.report(error); }
      });
      root.addEventListener('beforeunload', event => {
        if (this.docs.some(doc => this.dirty(doc) || doc.explicitBusy || doc.autoPending)) { event.preventDefault(); event.returnValue = ''; }
      });
    }
    get current() { return this.docs.find(doc => doc.id === this.activeId); }
    makeDocument(snapshot, name = '', saved = null, browserId = null) {
      return { id: uid(), name, snapshot: Storage.normalizeSnapshot(snapshot), savedFingerprint: saved ? fingerprint(saved) : null,
        savedName: saved ? name : '', updatedAt: new Date().toISOString(),
        browserId, view: {}, lastDestination: browserId ? 'browser' : null, pristineFingerprint: null,
        history: [copy(snapshot)], historyIndex: 0, autoEnabled: false, writeChain: Promise.resolve() };
    }
    capture(doc = this.current) {
      if (!doc || this.switching) return;
      const before = JSON.stringify(normalizeDocument(doc));
      doc.snapshot = Storage.normalizeSnapshot(this.editor.snapshot()); doc.name = this.files.currentName;
      doc.browserId = this.files.currentId; doc.savedFingerprint = this.files.savedFingerprint;
      doc.history = copy(this.editor.history); doc.historyIndex = this.editor.historyIndex;
      doc.view = this.captureView();
      if (before !== JSON.stringify(normalizeDocument(doc))) doc.updatedAt = new Date().toISOString();
    }
    apply(doc) {
      this.editor.restore(doc.snapshot);
      this.editor.history = copy(doc.history); this.editor.historyIndex = doc.historyIndex;
      this.files.currentId = doc.browserId; this.files.currentName = doc.name; this.files.savedFingerprint = doc.savedFingerprint;
      this.applyView(doc.view); this.editor.render({ notify: false }); this.files.refresh();
    }
    dirty(doc = this.current) {
      if (doc.savedFingerprint && doc.name !== doc.savedName) return true;
      const baseline = doc.savedFingerprint || doc.pristineFingerprint;
      if (fingerprint(doc.snapshot) !== baseline) return true;
      if (doc.browserId) {
        try { const record = new Storage.Store(root.localStorage).get(doc.browserId); return !record || fingerprint(record.snapshot) !== baseline; }
        catch (_) { return true; }
      }
      return false;
    }
    report(error) { this.error = error.message || String(error); this.status?.('error', this.error); }
    changed() {
      if (this.switching || !this.current) return;
      this.capture();
      const value = JSON.stringify({ activeId: this.activeId, documents: this.docs.map(normalizeDocument) });
      if (value === this.lastValue) return;
      this.lastValue = value;
      this.renderTabs(); clearTimeout(this.timer);
      if (!this.store?.blocked) { this.status?.('waiting', '各文書の下書きを保存しています。'); this.timer = setTimeout(() => this.flush(), 250); }
      this.scheduleAuto(this.current);
    }
    async flush(strict = false) {
      clearTimeout(this.timer);
      const save = async () => {
        try {
          if (!this.store || this.store.blocked) { if (strict) throw new Error(this.error || 'ブラウザの自動保存を利用できません。'); return; }
          this.store.save({ activeId: this.activeId, documents: this.docs });
          this.status?.('saved', '開いている各文書の下書きを保存しました。最後の明示保存とは別です。');
        } catch (error) { this.report(error); if (strict) throw error; }
      };
      const run = () => root.navigator?.locks ? root.navigator.locks.request(KEY, save) : save();
      const pending = this.flushing.then(run, run); this.flushing = pending.catch(() => {}); return pending;
    }
    flushImmediate() {
      clearTimeout(this.timer);
      if (!this.store || this.store.blocked) return;
      try {
        this.store.save({ activeId: this.activeId, documents: this.docs });
        this.status?.('saved', '各文書の下書きを保存しました。');
      } catch (error) { this.report(error); }
    }
    switchTo(id, focus = true) {
      if (id === this.activeId || !this.docs.some(doc => doc.id === id) || this.busy?.()) return;
      this.capture(); this.switching = true; this.activeId = id;
      try { this.apply(this.current); } finally { this.switching = false; }
      this.changed();
      if (focus) this.tabs.querySelector('[data-document-id="' + id + '"]')?.focus();
    }
    openAction(action) {
      if (this.busy?.()) throw new Error('操作を終了してから文書を開いてください。');
      if (this.docs.length >= MAX_TABS) throw new Error('開ける文書は20件までです。保存してから不要なタブを閉じてください。');
      this.capture(); const previous = this.activeId;
      const doc = this.makeDocument(this.initialSnapshot); this.docs.push(doc); this.activeId = doc.id; this.switching = true;
      try {
        this.apply(doc); action(); this.editor.resetHistory();
        this.switching = false; this.capture(doc);
        if (doc.savedFingerprint) doc.savedName = doc.name;
        if (doc.browserId) {
          const record = new Storage.Store(root.localStorage).get(doc.browserId);
          if (record && fingerprint(record.snapshot) === doc.savedFingerprint) doc.browserRevision = JSON.stringify(record);
        }
      } catch (error) {
        this.docs = this.docs.filter(item => item !== doc); this.activeId = previous; this.apply(this.current); throw error;
      } finally { this.switching = false; }
      this.changed(); return doc;
    }
    openData(snapshot, name, { saved = null, browserId = null } = {}) {
      const normalized = Storage.normalizeSnapshot(snapshot);
      return this.openAction(() => {
        this.editor.loadSnapshot(normalized); this.files.currentName = name;
        this.files.currentId = browserId; this.files.savedFingerprint = saved ? fingerprint(saved) : null;
      });
    }
    newDocument() {
      return this.openAction(() => {
        this.editor.clear(); this.files.currentName = ''; this.files.currentId = null; this.files.savedFingerprint = null;
        this.current.pristineFingerprint = fingerprint(this.editor.snapshot());
      });
    }
    drafts() {
      this.capture();
      return [...this.docs.map(doc => ({ id: doc.id, snapshot: copy(doc.snapshot), archived: false, updatedAt: doc.updatedAt,
        file: { id: doc.browserId, name: doc.name, savedSnapshot: doc.savedFingerprint ? JSON.parse(doc.savedFingerprint) : null } })),
      ...this.legacyDrafts.map(item => copy(item))];
    }
    renderTabs() {
      this.tabs.replaceChildren(); this.list.replaceChildren();
      this.docs.forEach((doc, index) => {
        const label = doc.name || '新しい回路';
        const dirty = this.dirty(doc);
        const entry = element('div', null, 'document-tab');
        const tab = element('button', label + (dirty ? ' *' : '')); tab.type = 'button'; tab.dataset.documentId = doc.id;
        tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(doc.id === this.activeId));
        tab.setAttribute('aria-controls', 'stage'); tab.setAttribute('aria-label', label + (dirty ? '、未保存の変更あり' : ''));
        tab.tabIndex = doc.id === this.activeId ? 0 : -1;
        tab.addEventListener('click', () => this.switchTo(doc.id));
        tab.addEventListener('keydown', event => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.docs.length - 1 :
            event.key === 'ArrowRight' ? (index + 1) % this.docs.length : event.key === 'ArrowLeft' ? (index - 1 + this.docs.length) % this.docs.length : null;
          if (next !== null) { event.preventDefault(); this.switchTo(this.docs[next].id, true); }
        });
        const close = element('button', '×', 'document-tab__close'); close.type = 'button'; close.setAttribute('aria-label', label + 'のタブを閉じる');
        close.addEventListener('click', () => this.requestClose(doc));
        entry.append(tab, close); this.tabs.appendChild(entry);
        const option = element('option', label + (dirty ? ' *' : '')); option.value = doc.id; option.selected = doc.id === this.activeId; this.list.appendChild(option);
      });
      this.list.onchange = () => this.switchTo(this.list.value);
      const selected = this.tabs.querySelector('[aria-selected="true"]');
      if (selected) this.tabs.scrollLeft += selected.getBoundingClientRect().left < this.tabs.getBoundingClientRect().left ? -selected.offsetWidth :
        selected.getBoundingClientRect().right > this.tabs.getBoundingClientRect().right ? selected.offsetWidth : 0;
      this.onTabs?.(this.current);
    }
    askName(title, doc, accept) {
      this.files.show(title, this.opener);
      const form = element('form'); const label = element('label', '回路の名前', 'stack');
      const input = element('input'); input.type = 'text'; input.required = true; input.maxLength = 60; input.value = doc.name || 'マイ回路'; label.appendChild(input);
      const submit = element('button', '保存'); submit.type = 'submit';
      const cancel = element('button', 'キャンセル'); cancel.type = 'button'; cancel.onclick = () => this.files.close();
      form.append(label, submit, cancel); this.files.body.appendChild(form);
      form.onsubmit = async event => {
        event.preventDefault(); if (!form.reportValidity() || submit.disabled) return;
        submit.disabled = true;
        try { const name = input.value.trim(); if (!name) throw new Error('回路の名前を入力してください。'); if (await accept(name) !== false) this.files.close(); }
        catch (error) { this.files.showError(error); } finally { submit.disabled = false; }
      };
      input.focus(); input.select();
    }
    rename() {
      const doc = this.current;
      this.askName('名前を変更', doc, name => {
        doc.name = name; doc.pristineFingerprint = null;
        if (doc.id === this.activeId) this.files.currentName = name;
        this.changed();
      });
    }
    markSaved(doc, name, snapshot, destination, browserId = null, expectedName = doc.name) {
      if (doc.name === expectedName) doc.name = name;
      doc.savedName = name; doc.savedFingerprint = fingerprint(snapshot); doc.browserId = browserId;
      doc.lastDestination = destination; doc.pristineFingerprint = null;
      if (doc.id === this.activeId) {
        this.files.currentName = doc.name; this.files.currentId = browserId; this.files.savedFingerprint = doc.savedFingerprint;
        this.files.refresh();
      }
      this.changed(); this.renderTabs();
      this.scheduleAuto(doc);
    }
    async saveBrowser(doc = this.current, afterSave = null) {
      if (doc.explicitBusy) return false;
      if (doc.id === this.activeId) this.capture();
      const save = name => {
        const snapshot = copy(doc.snapshot), store = new Storage.Store(root.localStorage);
        if (doc.browserId) {
          const record = store.get(doc.browserId);
          if (!record || (doc.browserRevision && JSON.stringify(record) !== doc.browserRevision)
            || (!doc.browserRevision && fingerprint(record.snapshot) !== doc.savedFingerprint)) {
            throw new Error('保存した回路が別のタブで更新・削除されました。上書きせず、ファイルに保存してください。');
          }
        }
        const record = store.save({ id: doc.browserId || undefined, name, snapshot });
        doc.browserRevision = JSON.stringify(record); this.markSaved(doc, name, snapshot, 'browser', record.id);
        afterSave?.(doc); return true;
      };
      if (doc.browserId && doc.name) {
        try { return save(doc.name); } catch (error) { this.showError(error); return false; }
      }
      this.askName('ブラウザに保存', doc, save);
      return false;
    }
    showError(error) {
      this.report(error);
      if (!this.files.dialog.open) this.files.show('操作を完了できませんでした', this.opener);
      this.files.showError(error);
    }
    async assertDistinct(handle, doc, automatic) {
      if (!handle?.isSameEntry) return;
      for (const other of this.docs) {
        for (const existing of [other.fileHandle, other.autoHandle]) {
          if (!existing || (other === doc && !automatic && existing === doc.fileHandle)) continue;
          if (await handle.isSameEntry(existing)) throw new Error('自動保存と明示保存、別の文書には、それぞれ異なる保存先を選んでください。');
        }
      }
    }
    async writeFile(handle, raw) {
      const writable = await handle.createWritable();
      try { await writable.write(raw); await writable.close(); }
      catch (error) { try { await writable.abort?.(); } catch (_) { /* 元のエラーを表示する。 */ } throw error; }
      const actual = await (await handle.getFile()).text();
      if (actual !== raw) throw new Error('保存先の読み戻しが一致しません。編集内容を保持しています。別のファイルへ保存してください。');
    }
    async saveFile(doc = this.current, { choose = true, afterSave = null } = {}) {
      if (doc.explicitBusy) return false;
      if (doc.id === this.activeId) this.capture();
      const snapshot = copy(doc.snapshot), sourceName = doc.name, name = sourceName || 'マイ回路', raw = Storage.serializeFile({ name, snapshot });
      doc.explicitBusy = true;
      try {
        if (typeof root.showSaveFilePicker !== 'function') {
          this.files.downloadSnapshot(name, snapshot);
          this.files.show('ファイルの保存を確認', this.opener);
          this.files.body.appendChild(element('p', 'ダウンロードした .logic.json を確認してください。確認するまで未保存の印を残します。'));
          const confirm = element('button', '保存を確認した'); confirm.type = 'button';
          confirm.onclick = () => { this.markSaved(doc, name, snapshot, 'file', null, sourceName); this.files.close(); afterSave?.(doc); };
          this.files.body.appendChild(confirm); confirm.focus(); return false;
        }
        const handle = !choose && doc.fileHandle ? doc.fileHandle : await root.showSaveFilePicker({
          suggestedName: name.replace(/[\\/:*?"<>|]/g, '_') + '.logic.json',
          types: [{ description: '論理回路', accept: { 'application/json': ['.json'] } }]
        });
        await this.assertDistinct(handle, doc, false);
        await this.writeFile(handle, raw); doc.fileHandle = handle;
        this.markSaved(doc, name, snapshot, 'file', null, sourceName); afterSave?.(doc); return true;
      } catch (error) {
        if (error.name !== 'AbortError') this.showError(new Error('ファイルへ保存できませんでした。編集内容は保持しています。' + error.message));
        return false;
      }
      finally { doc.explicitBusy = false; }
    }
    save(doc = this.current, afterSave = null) {
      if (!doc.lastDestination) {
        this.files.show('保存先を選択', this.opener);
        for (const [label, destination] of [['ブラウザに保存', 'browser'], ['ファイルに保存…', 'file']]) {
          const button = element('button', label); button.type = 'button';
          button.onclick = () => { this.files.close(); if (destination === 'browser') this.saveBrowser(doc, afterSave); else this.saveFile(doc, { afterSave }); };
          this.files.body.appendChild(button);
        }
        this.files.body.querySelector('button')?.focus(); return false;
      }
      return doc.lastDestination === 'file' ? this.saveFile(doc, { choose: false, afterSave }) : this.saveBrowser(doc, afterSave);
    }
    async toggleAuto() {
      const doc = this.current;
      if (doc.autoEnabled) { doc.autoEnabled = false; doc.autoGeneration = (doc.autoGeneration || 0) + 1; this.renderTabs(); return; }
      if (typeof root.showSaveFilePicker !== 'function') {
        this.showError(new Error('このブラウザではファイルへの自動保存を利用できません。ブラウザ内の自動保存と「ファイルに保存…」を利用してください。')); return;
      }
      try {
        const handle = await root.showSaveFilePicker({ suggestedName: (doc.name || 'マイ回路') + '.autosave.logic.json',
          types: [{ description: '論理回路の自動保存', accept: { 'application/json': ['.json'] } }] });
        await this.assertDistinct(handle, doc, true); doc.autoHandle = handle; doc.autoEnabled = true; doc.autoQueued = null;
        doc.autoGeneration = (doc.autoGeneration || 0) + 1; this.scheduleAuto(doc); this.renderTabs();
      } catch (error) { if (error.name !== 'AbortError') this.showError(error); }
    }
    scheduleAuto(doc) {
      if (!doc.autoEnabled) return;
      const raw = Storage.serializeFile({ name: doc.name || 'マイ回路', snapshot: doc.snapshot });
      if (raw === doc.autoQueued) return;
      doc.autoQueued = raw; const generation = doc.autoGeneration;
      doc.autoPendingCount = (doc.autoPendingCount || 0) + 1; doc.autoPending = true;
      doc.writeChain = doc.writeChain.catch(() => {}).then(async () => {
        try {
          if (!doc.autoEnabled || generation !== doc.autoGeneration || raw !== doc.autoQueued) return;
          await this.writeFile(doc.autoHandle, raw); doc.autoSaved = raw;
        }
        catch (error) { doc.autoEnabled = false; this.report(new Error('ファイルへの自動保存に失敗しました。編集内容を保持しています。' + error.message)); }
        finally { doc.autoPendingCount -= 1; doc.autoPending = doc.autoPendingCount > 0; this.renderTabs(); }
      });
    }
    openFile() {
      const input = element('input'); input.type = 'file'; input.accept = '.logic.json,application/json'; input.hidden = true;
      document.body.appendChild(input);
      input.onchange = async () => {
        try {
          const file = input.files?.[0]; if (!file) return;
          if (file.size > Storage.MAX_DOCUMENT_LENGTH) throw new Error('回路ファイルが大きすぎます。');
          const imported = Storage.parseFile(await file.text());
          if (!input.isConnected || input.files?.[0] !== file) return;
          const opened = this.openData(imported.snapshot, imported.name, { saved: imported.snapshot });
          opened.lastDestination = 'file'; this.files.close(false);
        } catch (error) { this.showError(error); } finally { input.remove(); }
      };
      input.oncancel = () => input.remove(); input.click();
    }
    requestClose(doc) {
      if (doc.explicitBusy) { this.showError(new Error('保存が完了するまで、この文書タブを保持します。')); return; }
      if (doc.id === this.activeId) this.capture();
      const close = () => {
        doc.autoEnabled = false; doc.autoGeneration = (doc.autoGeneration || 0) + 1;
        const index = this.docs.indexOf(doc); if (index < 0) return; this.docs.splice(index, 1);
        if (!this.docs.length) { const fresh = this.makeDocument(this.initialSnapshot); fresh.pristineFingerprint = fingerprint(fresh.snapshot); this.docs.push(fresh); }
        if (this.activeId === doc.id) {
          this.switching = true; this.activeId = this.docs[Math.min(index, this.docs.length - 1)].id;
          try { this.apply(this.current); } finally { this.switching = false; }
        }
        this.files.close(); this.changed();
      };
      if (!this.dirty(doc)) { close(); return; }
      this.files.show('変更を保存して閉じますか？', this.opener);
      this.files.body.appendChild(element('p', (doc.name || '新しい回路') + 'には未保存の変更があります。'));
      const savedClose = () => {
        if (!this.dirty(doc)) close();
        else this.showError(new Error('保存中に編集された内容があるため、タブを保持しています。'));
      };
      for (const [label, action] of [['保存して閉じる', () => this.save(doc, savedClose)], ['保存せずに閉じる', close], ['キャンセル', () => this.files.close()]]) {
        const button = element('button', label); button.type = 'button'; button.onclick = action; this.files.body.appendChild(button);
      }
      this.files.body.lastChild.focus();
    }
  }
  return Object.freeze({ KEY, MAX_TABS, ResumeStore, Workspace, fingerprint });
});
