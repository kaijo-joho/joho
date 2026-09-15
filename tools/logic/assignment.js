/* 論理回路だけの課題アダプター。エンジン・通常ファイル形式・CP演習は変更しない。 */
(() => {
  'use strict';
  const P = window.JohoAssignmentLite, $ = id => document.getElementById(id);
  function element(tag, value, className) { const node = document.createElement(tag); if (value) node.textContent = value; if (className) node.className = className; return node; }
  function mount({ editor, files, suspendNormal, resumeNormal, busy }) {
    const config = window.JohoLogicAssignmentConfig;
    let active = false, entering = false, internal = false, client = null, bridge = null, previous = null, opener = null, lastError = '', menuPhase = '';
    const dialog = element('dialog'); dialog.id = 'assignment-dialog'; dialog.setAttribute('aria-labelledby', 'assignment-title');
    const heading = element('h2'); heading.id = 'assignment-title';
    const closeButton = element('button', '×'); closeButton.type = 'button'; closeButton.setAttribute('aria-label', '課題の画面を閉じる');
    const header = element('header'); header.append(heading, closeButton); const body = element('div', '', 'dialog-body'); dialog.append(header, body); document.body.append(dialog);
    const status = element('button', '課題'); status.type = 'button'; status.id = 'assignment-status'; status.hidden = true; status.setAttribute('aria-haspopup', 'dialog'); status.setAttribute('aria-controls', dialog.id);
    $('draft-status').after(status);
    const originals = {};
    ['openSave', 'openLoad', 'requestClear', 'requestReplace', 'downloadSnapshot', 'refresh', 'store'].forEach(name => { originals[name] = files[name].bind(files); });
    const methods = {};
    ['commit', 'undo', 'redo', 'setInputValues', 'loadSnapshot', 'loadExpression'].forEach(name => { methods[name] = editor[name].bind(editor); });
    function close() { if (entering) return; dialog.close(); opener?.focus({ preventScroll: true }); }
    closeButton.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) close();
    });
    function show(title, control = document.activeElement) {
      heading.textContent = title; body.replaceChildren();
      if (!dialog.open) {
        opener = control;
        document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: 'logic-assignment' } }));
        dialog.showModal();
      }
      return body;
    }
    const paragraph = value => body.appendChild(element('p', value));
    function button(value, action) {
      const node = element('button', value); node.type = 'button'; node.addEventListener('click', () => {
        Promise.resolve().then(action).catch(error => { lastError = error.message; if (active) menu(); else paragraph(lastError); });
      }); body.append(node); return node;
    }
    function notice(value) { editor.notice = value; editor.render({ notify: false }); }
    function refresh() {
      if (!active) return;
      $('save-status').hidden = true; $('draft-status').hidden = true; status.hidden = false;
      const state = entering || !client?.work ? '課題の開始を確認中' : client?.submitted ? '正式提出済み' : client?.frozen ? '提出フォームで確認中' : client?.pending ? '途中保存の再試行待ち'
        : client?.localError ? 'ブラウザ保存に注意' : client?.saving ? '暗号保存中' : '課題 · ブラウザ保存済み';
      status.textContent = state; status.title = '課題の保存・提出フォームへの途中保存・提出';
      editor.fileSaveButton.title = '課題を暗号化して保存・提出フォームへ送信';
      editor.fileSaveButton.setAttribute('aria-label', '課題を保存');
      [editor.fileSaveButton, editor.loadButton].forEach(node => node.setAttribute('aria-controls', dialog.id));
      const locked = Boolean(entering || client?.locked);
      editor.updateToolbar();
      $('logic-editor').inert = locked; $('component-tools').inert = locked; $('selection-tools').inert = locked;
      $('logic-workbench-table').inert = locked;
      [editor.clearButton, editor.alignButton, $('selection-mode')].forEach(node => { node.disabled = locked; });
      if (locked) [editor.undoButton, editor.redoButton].forEach(node => { node.disabled = true; });
      if (dialog.open && heading.textContent === '課題の保存・提出') {
        if (menuPhase !== phase()) menu(); else updateStates();
      }
    }
    function phase() { return [Boolean(client?.frozen), Boolean(client?.pending), Boolean(client?.submitted), Boolean(client?.disconnected)].join(':'); }
    function updateStates() {
      const node = $('assignment-states'); if (!node || !client?.work) return;
      const saved = client.receipt;
      node.textContent = `このブラウザ：${client.localError ? '保存に失敗' : client.saving ? '暗号保存中' : client.localSavedAt ? new Date(client.localSavedAt).toLocaleString('ja-JP') : '未保存'}\n` +
        `提出フォームの途中保存：${saved ? new Date(saved.savedAt).toLocaleString('ja-JP') + '（第' + saved.revision + '版）' : 'まだ送信していません'}\n` +
        `正式提出：${client.submitted ? '提出完了' : '未完了（提出フォームで確認・確定してください）'}\n履歴：${client.work.entries.length}件`;
      for (const control of body.querySelectorAll('[data-remote-action]')) control.disabled = Boolean(client.busy || client.preparing || client.disconnected);
    }
    async function download() {
      const envelope = await client.backup();
      const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' }), url = URL.createObjectURL(blob);
      const a = element('a'); a.href = url; a.download = 'circuit.assignment-lite.local.json'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notice('課題を暗号化ファイルに書き出しました。ダウンロードを確認してください。正式提出ではありません。');
    }
    function menu() {
      if (!active || !client?.work) return;
      menuPhase = phase();
      show('課題の保存・提出');
      const states = element('p', '', 'assignment-states'); states.id = 'assignment-states'; body.append(states);
      if (lastError || client.localError) paragraph(lastError || client.localError);
      if (client.disconnected) paragraph('提出フォームとの接続が閉じています。課題を保存してから、提出フォームから開き直してください。');
      paragraph('このブラウザの保護保存と提出フォームへの送信は別です。ブラウザの鍵を失うと、端末内だけの変更は復旧できません。');
      button('ブラウザに暗号保存', async () => { await client.persist(); lastError = ''; menu(); });
      button('保護ファイルを保存', download);
      button(client.pending ? '同じ内容を提出フォームへ再送' : '提出フォームへ途中保存', async () => {
        await client.checkpoint(); lastError = ''; menu();
      }).dataset.remoteAction = '';
      button(client.frozen ? '提出データを再送' : '提出へ進む', async () => {
        await client.prepareSubmit(); lastError = ''; menu();
      }).dataset.remoteAction = '';
      if (client.frozen) {
        paragraph('提出フォームで残りの項目を確認して提出してください。確認中は回路を固定しています。');
        button('提出待ちを解除して編集する', () => { client.cancelPrepare(); lastError = ''; editor.render({ notify: false }); menu(); });
      }
      button('課題を保存して通常編集へ戻る', exit);
      const detail = element('details'); detail.append(element('summary', '履歴の目的と保存の注意'), element('p',
        '確定した編集・Undo/Redo・持込みを記録します。履歴は不正検知の参考情報で、本人制作や同じMacを証明するものではありません。画面表示・選択・ドラッグ途中・キー入力は記録しません。上限（1000件／6MiB／構造上限）では履歴を削らず、直前までの作品を保って相談を案内します。'));
      body.append(detail); updateStates();
    }
    async function exit() {
      P.assert(!busy() && !client.busy && !client.preparing, '操作の完了を待ってください。');
      await client.persist(); client.cancelPrepare();
      // 保存を失敗したらここへ来ない。元の通常作品とUndoだけを戻す。
      internal = true;
      try {
        editor.restore(previous.snapshot); editor.history = previous.history; editor.historyIndex = previous.historyIndex;
        Object.assign(files, previous.file);
      } finally { internal = false; }
      active = false; bridge?.close(); bridge = null; client.vault.forgetMaterial();
      $('app').classList.remove('assignment-mode'); status.hidden = true; $('save-status').hidden = false; $('draft-status').hidden = false;
      ['logic-editor', 'component-tools', 'selection-tools', 'logic-workbench-table'].forEach(id => { $(id).inert = false; });
      [editor.clearButton, editor.alignButton, $('selection-mode')].forEach(node => { node.disabled = false; });
      resumeNormal(); editor.fileSaveButton.setAttribute('aria-label', '回路を保存'); editor.render({ notify: false }); originals.refresh(); close();
      [editor.fileSaveButton, editor.loadButton].forEach(node => node.setAttribute('aria-controls', 'logic-file-dialog'));
      previous = null; client = null;
    }
    function load() {
      show('課題を読み込む'); paragraph('同じ課題・同じブラウザの保護ファイルを読み込めます。現在の履歴は消さず、読み込み操作を追記します。');
      const label = element('label', '保護ファイルを選択', 'stack'), input = element('input'); input.type = 'file'; input.accept = '.json,application/json'; label.append(input); body.append(label);
      input.addEventListener('change', async () => {
        try {
          P.assert(input.files.length === 1 && input.files[0].size <= P.LIMITS.bytes * 2, 'ファイルが大きすぎます。');
          const selectedFile = input.files[0], expectedClient = client, raw = await selectedFile.text();
          if (!active || client !== expectedClient || !dialog.open || !body.contains(input) || input.files[0] !== selectedFile) return;
          await client.importBackup(JSON.parse(raw));
          internal = true; try { editor.restore(client.document); editor.resetHistory(); } finally { internal = false; }
          lastError = ''; close(); notice('同じ課題の保護ファイルを読み込みました。');
        } catch (error) { paragraph(error.message); }
      });
      if (client.session.allowImport) button('通常の保存・ファイル・テンプレートから持ち込む', () => {
        close(); originals.openLoad();
        files.body.querySelectorAll('button[aria-label$="を削除"]').forEach(node => { node.hidden = true; });
      });
      else paragraph('この課題では通常の保存・テンプレートの持込みは許可されていません。');
    }
    function clear() {
      show('課題の回路を全消去しますか？'); paragraph('先に暗号保存します。部品・配線を消しても、課題の履歴は残ります。');
      button('保存して全消去', async () => { P.assert(!client.locked); await client.persist(); editor.clear(); close(); }); button('キャンセル', close);
    }
    files.openSave = (...args) => active ? menu() : originals.openSave(...args);
    files.openLoad = (...args) => active ? load() : originals.openLoad(...args);
    files.requestClear = (...args) => active ? clear() : originals.requestClear(...args);
    files.downloadSnapshot = (...args) => active ? download() : originals.downloadSnapshot(...args);
    files.store = (...args) => {
      if (!active) return originals.store(...args);
      P.assert(client?.session.allowImport, 'この課題では持込みは許可されていません。');
      const normal = originals.store(...args), blocked = () => { throw new Error('課題中は通常の保存を書き換えられません。'); };
      return Object.freeze({ list: () => normal.list(), get: id => normal.get(id), save: blocked, remove: blocked, write: blocked });
    };
    files.refresh = (...args) => active ? refresh() : originals.refresh(...args);
    files.requestReplace = (action, label, control, options) => {
      if (!active) return originals.requestReplace(action, label, control, options);
      files.close();
      if (!client.session.allowImport) { notice('この課題では持込みは許可されていません。'); return; }
      show('課題へ持ち込みますか？', control); paragraph(`${label}を読み込み、持込みとして履歴へ記録します。`);
      button('持ち込む', () => {
        P.assert(!client.locked); const before = editor.snapshot(), history = editor.history.slice(), index = editor.historyIndex;
        internal = true;
        try {
          action(); const document = window.LogicStorage.normalizeSnapshot(editor.snapshot());
          client.record('import', document, '通常保存・ファイル・テンプレートから持込み'); editor.restore(document);
        } catch (error) { editor.restore(before); editor.history = history; editor.historyIndex = index; throw error; }
        finally { internal = false; Object.assign(files, previous.file); }
        close(); editor.render({ notify: false });
      }); button('キャンセル', close);
    };
    // 確定操作の入口だけを包む。移動途中の描画や選択では履歴を増やさない。
    for (const name of Object.keys(methods)) {
      editor[name] = (...args) => {
        if (!active || internal || !client?.work) return methods[name](...args);
        const history = editor.history.slice(), index = editor.historyIndex;
        internal = true;
        try {
          P.assert(!client.locked, '保存・提出の確認中は編集できません。');
          P.assert(!['loadSnapshot', 'loadExpression'].includes(name), '課題の読み込み画面から操作してください。');
          // commit前のgraphは既に変更済みなので、エラー時は最後の確定記録へ戻す。
          if (name === 'commit') client.record('edit', window.LogicStorage.normalizeSnapshot(editor.snapshot()), String(args[0] || '回路を編集'));
          const result = methods[name](...args);
          if (name !== 'commit') client.record(name === 'undo' || name === 'redo' ? name : 'edit', window.LogicStorage.normalizeSnapshot(editor.snapshot()), name === 'setInputValues' ? '真理値表から入力値を変更' : name);
          return result;
        } catch (error) {
          editor.restore(client.document); editor.history = history; editor.historyIndex = index;
          notice(error.message); lastError = error.message; return false;
        } finally { internal = false; refresh(); }
      };
    }
    status.addEventListener('click', menu);
    window.addEventListener('beforeunload', event => {
      if (active && (client?.saving || client?.localError || client?.pending || client?.frozen)) { event.preventDefault(); event.returnValue = ''; }
    });
    async function offer({ peer, origin, nonce, route }) {
      P.assert(config?.enabled === true && config.trustedOrigins?.includes(origin) && config.retentionNotice?.trim(), '課題連携はまだ有効になっていません。通常の回路編集を利用できます。');
      P.assert(!active && !entering && peer === window.opener && peer, '提出フォームから開いた画面で開始してください。'); P.route(route);
      bridge?.close();
      bridge = window.JohoAssignmentLiteBridge.create({ peer, origin, nonce, trustedOrigins: config.trustedOrigins,
        onRequest: (operation, payload) => { P.assert(active && client?.work); return client.handle(operation, payload); } });
      // 確認するだけでは鍵を作らず、学校アカウントでの認証はfm2へ委ねる。
      show('課題モードで開始しますか？');
      paragraph('課題の作品・確定した編集履歴・課題ID・ランダムなブラウザ鍵IDを、途中保存と提出時に提出フォームへ送ります。開始時には鍵の登録・課題の照合を行います。');
      paragraph('履歴は不正検知の参考情報です。Macの識別番号やキー入力は収集せず、本人が制作した証明にはなりません。通常の作品は退避してから切り替えます。');
      paragraph('鍵を失った場合に教員が復旧できるのは、最後に提出フォームへ保存できた作品までです。端末内だけの未送信変更は復旧できません。');
      paragraph(`送信先：${origin}\n保管・相談先：${config.retentionNotice}`);
      const startButton = button('確認して開始', async () => {
        if (entering) return; P.assert(!busy()); entering = true; startButton.disabled = true; closeButton.disabled = true;
        try {
          files.close(); suspendNormal();
          previous = { snapshot: editor.snapshot(), history: editor.history.slice(), historyIndex: editor.historyIndex,
            file: { currentId: files.currentId, currentName: files.currentName, savedFingerprint: files.savedFingerprint } };
          active = true; $('app').classList.add('assignment-mode');
          client ||= new window.JohoAssignmentLiteClient.Client({ request: (operation, payload) => bridge.request(operation, payload), onState: refresh });
          const blank = { graph: { nodes: [{ id: 'input-A', type: 'input', name: 'A', x: 72, y: 211 }, { id: 'input-B', type: 'input', name: 'B', x: 72, y: 309 }, { id: 'output-F', type: 'output', name: 'F', x: 828, y: 260 }], wires: [] }, inputNames: ['A', 'B'], inputValues: { A: 0, B: 0 } };
          const document = await client.start(route, blank);
          internal = true; try { editor.restore(document); editor.resetHistory(); } finally { internal = false; }
          entering = false; lastError = ''; menu(); notice('課題モードです。作品は暗号保存し、提出フォームへの途中保存・正式提出は別に操作します。');
        } catch (error) {
          active = false; entering = false; $('app').classList.remove('assignment-mode');
          ['logic-editor', 'component-tools', 'selection-tools', 'logic-workbench-table'].forEach(id => { $(id).inert = false; });
          [editor.clearButton, editor.alignButton, $('selection-mode')].forEach(node => { node.disabled = false; });
          status.hidden = true; $('save-status').hidden = false; $('draft-status').hidden = false;
          resumeNormal(); editor.fileSaveButton.setAttribute('aria-label', '回路を保存'); editor.render({ notify: false }); paragraph(error.message); startButton.disabled = false;
          [editor.fileSaveButton, editor.loadButton].forEach(node => node.setAttribute('aria-controls', 'logic-file-dialog'));
        } finally { entering = false; closeButton.disabled = false; refresh(); }
      });
      button('キャンセル', () => { bridge.close(); bridge = null; close(); });
      startButton.focus();
    }
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.get('assignment') === 'editor-lite-v1') {
      offer({ peer: window.opener, origin: params.get('origin'), nonce: params.get('nonce'), route: { bookId: params.get('bookId'), pid: params.get('pid'), itemId: params.get('itemId') } }).catch(error => notice(error.message));
    }
    return Object.freeze({ get active() { return active; }, offer });
  }
  window.JohoLogicAssignment = Object.freeze({ mount });
})();
