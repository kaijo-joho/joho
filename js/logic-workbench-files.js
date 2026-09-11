// 自由編集の回路保存・読み込み・画像出力。回路の計算や描画は既存モジュールへ任せる。
(function (root) {
  'use strict';

  const TEMPLATES = Object.freeze([
    { name: 'AND', expression: 'A-B' },
    { name: 'ANDの出力をORへつなぐ例', expression: '(A-B)_C' },
    { name: 'NOR相当', expression: 'n(A_B)' },
    { name: 'XOR相当を含む例', expression: '(A^B)-C' }
  ]);
  const STORAGE_NOTE = 'このブラウザに保存します。別の端末・ブラウザとは同期されません。ブラウザの閲覧データを削除すると保存した回路も消えます。';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(text, action, className = 'logic-secondary-button') {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  class LogicWorkbenchFiles {
    constructor(editor) {
      this.editor = editor;
      this.currentId = null;
      this.currentName = '';
      this.savedFingerprint = null;
      this.exportFormat = 'svg';
      this.dialog = element('dialog', 'lesson-supplement-dialog logic-file-dialog');
      this.dialog.id = 'logic-file-dialog';
      this.dialog.setAttribute('aria-labelledby', 'logic-file-title');
      this.title = element('h3', '', '回路を保存');
      this.title.id = 'logic-file-title';
      const header = element('div', 'lesson-supplement-dialog__header');
      const close = button('×', () => this.close(), 'lesson-supplement-dialog__close');
      close.setAttribute('aria-label', '回路のメニューを閉じる');
      header.append(this.title, close);
      this.body = element('div', 'lesson-supplement-dialog__body logic-file-dialog__body');
      this.dialog.append(header, this.body);
      document.body.appendChild(this.dialog);
      this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
      this.dialog.addEventListener('click', event => {
        if (event.target !== this.dialog) return;
        const rect = this.dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
      });
      this.onOverlay = event => {
        if (event.detail?.source !== 'logic-files') this.close(false);
      };
      this.onSlideChange = () => this.close(false);
      document.addEventListener('joho:overlay-open', this.onOverlay);
      document.addEventListener('joho:lesson-slide-change', this.onSlideChange);
      [editor.fileSaveButton, editor.loadButton, editor.exportButton].filter(Boolean).forEach(control => {
        control.setAttribute('aria-haspopup', 'dialog');
        control.setAttribute('aria-controls', this.dialog.id);
        control.setAttribute('aria-expanded', 'false');
      });
      this.refresh();
    }

    store() {
      if (!root.LogicStorage) throw new Error('回路の保存機能を読み込めませんでした。ページを再読み込みしてください。');
      try { return new root.LogicStorage.Store(root.localStorage); }
      catch (_) { throw new Error('このブラウザでは保存領域を利用できません。ブラウザの設定を確認してください。'); }
    }

    fingerprint(snapshot = this.editor.snapshot()) {
      return JSON.stringify(root.LogicStorage.normalizeSnapshot(snapshot));
    }

    isDirty() {
      try {
        const fingerprint = this.fingerprint();
        if (fingerprint !== this.savedFingerprint) return true;
        // 別タブによる削除・更新や保存領域の破損後も「保存済み」と誤認しない。
        if (this.currentId) {
          const record = this.store().get(this.currentId);
          return !record || this.fingerprint(record.snapshot) !== fingerprint;
        }
        return false;
      }
      catch (_) { return true; }
    }

    refresh() {
      const dirty = this.isDirty();
      const save = this.editor.fileSaveButton;
      if (!save) return;
      save.classList.toggle('logic-editor__save-dirty', dirty);
      save.title = `回路を保存${this.currentName ? `：${this.currentName}` : ''}${dirty ? '（未保存の変更あり）' : '（保存済み）'}`;
    }

    show(title, opener) {
      this.opener?.setAttribute('aria-expanded', 'false');
      this.opener = opener;
      this.opener?.setAttribute('aria-expanded', 'true');
      this.title.textContent = title;
      this.body.replaceChildren();
      this.error = element('p', 'logic-file-error');
      this.error.setAttribute('role', 'alert');
      this.error.hidden = true;
      this.body.appendChild(this.error);
      this.editor.help.open = false;
      if (!this.dialog.open) {
        document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: 'logic-files' } }));
        this.dialog.showModal();
      }
    }

    showError(error) {
      this.error.textContent = error.message || String(error);
      this.error.hidden = false;
    }

    close(restoreFocus = true) {
      if (!this.dialog.open) return;
      const opener = this.opener;
      this.opener = null;
      opener?.setAttribute('aria-expanded', 'false');
      this.dialog.close();
      if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    }

    announce(message) {
      this.editor.notice = message;
      this.editor.render({ notify: false });
      this.refresh();
    }

    requestReplace(action, label, opener) {
      if (!this.isDirty()) { this.close(); action(); return; }
      this.show('変更を保存しますか？', opener);
      this.body.appendChild(element('p', '', `${label}の前に、現在の回路の未保存の変更を保存できます。`));
      const actions = element('div', 'logic-file-actions');
      const cancel = button('キャンセル', () => this.close());
      actions.append(
        button('保存して続ける', () => this.openSave({ afterSave: action, opener })),
        button('保存せず続ける', () => { this.close(); action(); }, 'logic-secondary-button logic-editor__action-button--danger'),
        cancel
      );
      this.body.appendChild(actions);
      cancel.focus({ preventScroll: true });
    }

    requestClear() {
      this.requestReplace(() => {
        this.editor.clear();
        this.currentId = null;
        this.currentName = '';
        this.savedFingerprint = this.fingerprint();
        this.refresh();
      }, '全消去', this.editor.clearButton);
    }

    openSave({ afterSave = null, opener = this.editor.fileSaveButton } = {}) {
      this.show('回路を保存', opener);
      let existing = null;
      try { existing = this.currentId ? this.store().get(this.currentId) : null; }
      catch (error) { this.showError(error); }
      const form = element('form', 'logic-file-form');
      const label = element('label', 'logic-file-field', '回路の名前');
      const name = element('input');
      name.type = 'text';
      name.required = true;
      name.maxLength = 60;
      name.value = this.currentName || 'マイ回路';
      name.autocomplete = 'off';
      label.appendChild(name);
      const save = (asCopy = false) => {
        if (!form.reportValidity()) return;
        try {
          const record = this.store().save({
            id: !asCopy && existing ? existing.id : undefined,
            name: name.value, snapshot: this.editor.snapshot()
          });
          this.currentId = record.id;
          this.currentName = record.name;
          this.savedFingerprint = this.fingerprint(record.snapshot);
          this.close();
          this.announce(`「${record.name}」をこのブラウザに保存しました。`);
          if (afterSave) afterSave();
        } catch (error) { this.showError(error); }
      };
      form.addEventListener('submit', event => { event.preventDefault(); save(); });
      const actions = element('div', 'logic-file-actions');
      const submit = element('button', 'logic-secondary-button', existing ? '上書き保存' : '保存');
      submit.type = 'submit';
      actions.appendChild(submit);
      if (existing) actions.appendChild(button('別の回路として保存', () => save(true)));
      actions.appendChild(button('キャンセル', () => this.close()));
      form.append(label, element('p', 'logic-file-note', '作りかけの回路も保存できます。最大30件。'), actions);
      this.body.append(form, element('p', 'logic-file-note', STORAGE_NOTE));
      name.focus({ preventScroll: true });
      name.select();
    }

    openLoad() {
      this.show('回路を読み込む', this.editor.loadButton);
      this.body.appendChild(element('h4', '', '保存した回路'));
      try {
        const records = this.store().list();
        const list = element('ul', 'logic-file-list');
        records.forEach(record => {
          const row = element('li', 'logic-file-row');
          const load = button('', () => {
            try {
              const current = this.store().get(record.id);
              if (!current) throw new Error('この回路は別のタブで削除されました。読み込み一覧を開き直してください。');
              this.requestReplace(() => {
                this.editor.loadSnapshot(current.snapshot);
                this.currentId = current.id;
                this.currentName = current.name;
                this.savedFingerprint = this.fingerprint(current.snapshot);
                this.refresh();
              }, `「${current.name}」の読み込み`, this.editor.loadButton);
            } catch (error) { this.showError(error); }
          }, 'logic-secondary-button logic-file-load');
          load.append(element('span', '', record.name), element('small', 'logic-file-meta', new Date(record.updatedAt).toLocaleString('ja-JP')));
          load.setAttribute('aria-label', `保存した回路「${record.name}」を読み込む`);
          const remove = button('×', () => this.confirmRemove(record), 'logic-secondary-button logic-editor__icon-button');
          remove.setAttribute('aria-label', `保存した回路「${record.name}」を削除`);
          row.append(load, remove);
          list.appendChild(row);
        });
        this.body.appendChild(records.length ? list : element('p', 'logic-file-note', '保存した回路はまだありません。'));
      } catch (error) { this.showError(error); }
      this.body.appendChild(element('h4', '', 'テンプレート'));
      const templates = element('ul', 'logic-file-list');
      TEMPLATES.forEach(template => {
        const row = element('li', 'logic-file-row');
        const load = button(template.name, () => {
          this.requestReplace(() => {
            this.editor.loadExpression(template.expression, { resetHistory: false });
            this.editor.commit('テンプレートを読み込みました。Undoで読み込み前に戻せます。');
            this.currentId = null;
            this.currentName = '';
            this.savedFingerprint = null;
            this.refresh();
          }, `「${template.name}」の読み込み`, this.editor.loadButton);
        }, 'logic-secondary-button logic-file-load');
        load.setAttribute('aria-label', `テンプレート「${template.name}」を読み込む`);
        row.appendChild(load);
        templates.appendChild(row);
      });
      this.body.append(templates, element('p', 'logic-file-note', STORAGE_NOTE));
      this.body.querySelector('button')?.focus({ preventScroll: true });
    }

    confirmRemove(record) {
      this.show('保存した回路を削除', this.editor.loadButton);
      this.body.appendChild(element('p', '', `「${record.name}」をこのブラウザの保存一覧から削除します。保存データの削除は元に戻せません。編集中の回路は残ります。`));
      const actions = element('div', 'logic-file-actions');
      const cancel = button('キャンセル', () => this.openLoad());
      actions.append(button('削除する', () => {
        try {
          this.store().remove(record.id);
          if (this.currentId === record.id) {
            this.currentId = null;
            this.currentName = '';
            this.savedFingerprint = null;
          }
          this.refresh();
          this.openLoad();
        } catch (error) { this.showError(error); }
      }, 'logic-secondary-button logic-editor__action-button--danger'), cancel);
      this.body.appendChild(actions);
      cancel.focus({ preventScroll: true });
    }

    openExport() {
      if (!this.editor.getAnalysis().valid) return;
      this.show('回路図を出力', this.editor.exportButton);
      const form = element('form', 'logic-file-form');
      const formats = element('fieldset', 'logic-file-formats');
      formats.appendChild(element('legend', '', 'ファイル形式'));
      ['svg', 'png'].forEach(format => {
        const label = element('label');
        const input = element('input');
        input.type = 'radio';
        input.name = 'logic-export-format';
        input.value = format;
        input.checked = format === this.exportFormat;
        label.append(input, document.createTextNode(format === 'svg' ? 'SVG（拡大・編集用）' : 'PNG（画像用）'));
        formats.appendChild(label);
      });
      const signalsLabel = element('label', 'logic-file-signals');
      const signals = element('input');
      signals.type = 'checkbox';
      signals.checked = this.editor.exportShowSignals;
      signalsLabel.append(signals, document.createTextNode('0/1を表示する'));
      const actions = element('div', 'logic-file-actions');
      const submit = element('button', 'logic-secondary-button', '書き出す');
      submit.type = 'submit';
      const filename = () => root.LogicCore.createSvgFilename().replace(/\.svg$/i, `.${form.querySelector('input[type="radio"]:checked').value}`);
      form.addEventListener('change', () => { submit.title = filename(); });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submit.disabled) return;
        this.editor.exportShowSignals = signals.checked;
        this.exportFormat = form.querySelector('input[type="radio"]:checked').value;
        submit.disabled = true;
        const success = this.exportFormat === 'png' ? await this.editor.savePng() : this.editor.saveSvg();
        if (!this.body.contains(form)) return;
        submit.disabled = false;
        if (success) this.close();
        else this.showError(new Error(this.editor.notice));
      });
      actions.append(submit, button('キャンセル', () => this.close()));
      form.append(formats, signalsLabel, element('p', 'logic-file-note', '0/1を非表示にすると配線の色も統一します。エディタや真理値表の入力値は変わりません。'), actions);
      this.body.appendChild(form);
      submit.title = filename();
      formats.querySelector('input:checked').focus({ preventScroll: true });
    }

    destroy() {
      this.close(false);
      this.dialog.remove();
      document.removeEventListener('joho:overlay-open', this.onOverlay);
      document.removeEventListener('joho:lesson-slide-change', this.onSlideChange);
    }
  }

  root.LogicWorkbenchFiles = LogicWorkbenchFiles;
})(typeof globalThis !== 'undefined' ? globalThis : window);
