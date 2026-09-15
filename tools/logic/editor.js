// 独立ツールの画面構成。回路操作・解析・経路・保存形式は共通モジュールを使う。
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const icons = {
    settings: '<path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/>',
    fullscreen: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
    fit: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 10h8v4H8z"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    templates: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    export: '<path d="M12 15V3M8 7l4-4 4 4M5 12v8h14v-8"/>',
    open: '<path d="M3 7V4h7l2 3h9v13H3zM3 10h18"/>',
    clear: '<path d="M8 3h8M4 6h16M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    select: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = icons[name]; // 固定の定義のみ。入力・保存データをHTMLへ渡さない。
    return svg;
  }
  document.querySelectorAll('[data-icon]').forEach(node => node.appendChild(icon(node.dataset.icon)));
  const app = $('app'), side = $('side-panel');
  const panes = [...document.querySelectorAll('[data-pane]')];
  const tabs = [...document.querySelectorAll('[data-pane-button]')];
  let files, editor, helpPanel, activePane = null, previewUrl = null;
  let zoomMode = 'fit', zoom = 1, pendingFit = false;
  let copyingTable = false, exporting = false, preserveBeforeEdit = false;
  let resizing = false, panelResize, draftStore, draftReady = false, draftTimer, pendingDraft, draftFingerprint, normalSuspended = false;
  const busy = () => resizing || helpPanel?.interacting || Boolean(editor && (editor.drag || editor.paletteDrag || editor.connectionDrag || editor.bendDrag || editor.pan || editor.marquee));
  const preferencesKey = 'joho.logic.ui.v1';
  let preferences = {};
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved;
  } catch (_) { /* 保存不可・破損時も編集は利用可能。 */ }
  function savePreferences() {
    try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); } catch (_) { /* 回路のファイル保存は利用可能。 */ }
  }

  function draftValue() {
    return { snapshot: editor.snapshot(), file: { id: files.currentId, name: files.currentName,
      savedSnapshot: files.savedFingerprint ? JSON.parse(files.savedFingerprint) : null } };
  }
  function draftStatus(state, detail) {
    const control = $('draft-status');
    control.dataset.state = state;
    control.querySelector('.draft-status__text').textContent = { ready: '自動保存', waiting: '下書き保存待ち', saved: '下書き保存済み', restored: '下書き復元済み', error: '自動保存に注意' }[state];
    control.querySelector('.draft-status__symbol').textContent = state === 'error' ? '!' : '↺';
    control.title = detail;
    control.setAttribute('aria-label', `自動保存の下書きを選ぶ：${detail}`);
    $('draft-detail').textContent = detail;
  }
  function draftErrorMessage(error) {
    return /下書き|別のタブ/.test(error.message) ? error.message
      : '下書きを自動保存できません。保存領域の空き容量や設定を確認し、ファイルに保存してください。';
  }
  function draftError(error) {
    draftStatus('error', draftErrorMessage(error));
  }
  function flushDraft(strict = false) {
    clearTimeout(draftTimer);
    if (normalSuspended) return;
    if (!pendingDraft || !draftStore) return;
    const data = pendingDraft;
    try {
      draftStore.save(data);
      pendingDraft = null;
      draftStatus('saved', '自動復元用の下書きを保存しました。複数の回路を残すには名前を付けて保存してください。');
    } catch (error) { draftError(error); if (strict === true) throw error; }
  }
  function queueDraft() {
    if (normalSuspended || !draftReady || !draftStore || draftStore.blocked || busy()) return;
    const value = draftValue(), fingerprint = JSON.stringify(value);
    if (fingerprint === draftFingerprint) return;
    // 開始時の選択を閉じて新規編集を始めても、前回の下書きを失わない。
    if (preserveBeforeEdit) {
      try { draftStore.preserve(); preserveBeforeEdit = false; }
      catch (error) { draftError(error); return; }
    }
    draftFingerprint = fingerprint; pendingDraft = value;
    draftStatus('waiting', '確定した編集を下書きへ保存しています。ドラッグ途中の状態は保存しません。');
    clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 250);
  }
  function initializeDrafts() {
    let hasDrafts = false;
    try {
      draftStore = new window.LogicDraft.Store(localStorage);
      const current = draftStore.load();
      const drafts = draftStore.list();
      hasDrafts = drafts.length > 0;
      preserveBeforeEdit = Boolean(current);
      draftStatus('ready', hasDrafts ? '読み込み画面で、前回の下書き・保存済み回路・新規作成から選んでください。'
        : '確定した編集を下書きへ自動保存します。次に開いたときに復元する回路を選べます。');
      if (drafts.archiveError) draftError(new Error(drafts.archiveError));
    } catch (error) {
      const detail = error.message.includes('下書き') ? error.message : 'このブラウザでは自動復元を利用できません。ファイルに保存してください。';
      draftStatus('error', detail); editor.notice = detail;
    }
    draftFingerprint = JSON.stringify(draftValue()); draftReady = true;
    editor.render({ notify: false });
    return hasDrafts;
  }
  function replaceCircuit(action, { initial = false } = {}) {
    if (normalSuspended) throw new Error('課題の読み込み画面から操作してください。');
    if (busy()) throw new Error('ドラッグ中の操作を終了してから、回路を切り替えてください。');
    if (draftStore && !draftStore.blocked) {
      // 通常の編集の保存を完了してから、切り替え前の回路を退避する。
      try {
        flushDraft(true);
        draftStore.preserve();
        preserveBeforeEdit = false;
      } catch (error) {
        if (error.name !== 'SecurityError') throw new Error(draftErrorMessage(error));
        // 保存領域そのものが禁止された場合も、手動のファイル読み込みは使える。
        // 自動保存を停止し、読めないブラウザ内データには一切書き込まない。
        draftStore.blocked = true; pendingDraft = null; clearTimeout(draftTimer); draftError(error);
      }
    }
    draftReady = false;
    try { action(); if (initial) editor.resetHistory(); }
    finally { draftReady = true; }
    draftFingerprint = null;
    queueDraft();
  }
  function listDrafts() {
    if (!draftStore) throw new Error('自動保存を利用できません。名前付き保存やファイル保存をご利用ください。');
    try { flushDraft(true); return draftStore.list(); }
    catch (error) { throw new Error(draftErrorMessage(error)); }
  }
  function loadDraft(draft) {
    editor.loadSnapshot(draft.snapshot);
    files.currentId = draft.file.id; files.currentName = draft.file.name;
    files.savedFingerprint = draft.file.savedSnapshot ? JSON.stringify(draft.file.savedSnapshot) : null;
    editor.notice = '選んだ下書きを復元しました。続きから編集できます。';
    draftStatus('restored', '選んだ下書きを復元しました。残したい回路は名前付き保存・ファイル保存をご利用ください。');
    editor.render({ notify: false });
  }
  window.addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushDraft(); });
  window.addEventListener('storage', event => {
    if (!draftReady || !draftStore || draftStore.blocked || (event.key !== null && event.key !== window.LogicDraft.KEY)) return;
    try { draftStore.assertUnchanged(); }
    catch (error) { clearTimeout(draftTimer); pendingDraft = null; draftError(error); }
  });

  function updateTable(state) {
    if (!editor) return;
    if (!state.analysis.valid) {
      window.LogicRenderer.renderMessage($('logic-workbench-table'), state.analysis.errors[0] || '部品をつないで回路を完成させてください。');
      return;
    }
    window.LogicWidgets.renderTruthTable($('logic-workbench-table'), {
      inputNames: state.analysis.inputs, outputs: state.analysis.outputs,
      rows: state.analysis.truthTable, activeInputs: state.inputValues, caption: '作成した回路の真理値表',
      onRowSelect: inputs => editor.setInputValues(inputs)
    });
  }
  editor = new window.LogicEditor($('logic-editor'), {
    inputNames: ['A', 'B'], availableInputNames: ['A', 'B', 'C', 'D'],
    allowInputDeletion: true, allowMultipleOutputs: true, enableAlignment: true,
    allowSignalToggle: true, enableWireEditing: true, allowMousePan: true, allowWireInsertion: true,
    allowMultipleSelection: true, enableDiagnostics: true,
    initialExpression: 'A-B', helpDialogId: 'lc02-operation-dialog', keyboardRoot: app,
    onSave: () => files.openSave(), onLoad: () => files.openLoad(), onClearRequest: () => files.requestClear(),
    onExport: () => setPane('export'), onChange: updateTable
  });
  const initialSnapshot = editor.snapshot();
  const selectionModeButton = document.createElement('button');
  selectionModeButton.type = 'button'; selectionModeButton.id = 'selection-mode'; selectionModeButton.className = 'icon-button';
  selectionModeButton.setAttribute('aria-label', '複数選択モード'); selectionModeButton.setAttribute('aria-pressed', 'false');
  selectionModeButton.title = '複数選択モード（部品をタップして選択を追加）'; selectionModeButton.appendChild(icon('select'));
  selectionModeButton.addEventListener('click', () => editor.setSelectionMode(!editor.selectionMode));
  function separator() {
    const node = document.createElement('span'); node.className = 'toolbar-separator';
    node.setAttribute('role', 'separator'); node.setAttribute('aria-orientation', 'vertical'); return node;
  }
  // 同じ部品を移設し、ドラッグ・タッチ・キー操作のハンドラーを保つ。
  $('component-tools').appendChild(editor.editor.querySelector('.logic-editor__palette'));
  $('basic-toolbar').append(editor.fileSaveButton, editor.loadButton, editor.clearButton, selectionModeButton,
    editor.undoButton, editor.redoButton, separator(), editor.alignButton, separator(), editor.signalButton);
  editor.clearButton.replaceChildren(icon('clear'));
  editor.clearButton.classList.add('icon-button');
  editor.clearButton.setAttribute('aria-label', '全消去');
  editor.clearButton.title = '全消去（未保存の変更は保存を確認します）';
  $('display-toolbar').appendChild(editor.helpButton);
  editor.alignButton.classList.add('logic-editor__align-button');
  editor.alignButton.appendChild(document.createTextNode('整列'));
  $('selection-tools').append(editor.swapButton, editor.deleteButton);
  $('insert-not').addEventListener('click', () => editor.insertNotInWire());
  $('duplicate-selection').addEventListener('click', () => editor.duplicateSelection());
  document.querySelectorAll('[data-align]').forEach(button => button.addEventListener('click', () => {
    editor.alignSelection(button.dataset.align); $('selection-layout').open = false;
    $('selection-layout').querySelector('summary').focus({ preventScroll: true });
  }));
  $('operation-hint').appendChild(editor.status);
  // 互換APIは残し、画面上の画像出力入口は右端に集約する。
  editor.exportButton.hidden = true;
  files = new window.LogicWorkbenchFiles(editor, {
    replace: replaceCircuit,
    restoreFocus: restoreControlFocus,
    drafts: { list: listDrafts, load: loadDraft },
    createNew: () => {
      editor.loadSnapshot(initialSnapshot); files.currentId = null; files.currentName = ''; files.savedFingerprint = null;
      editor.notice = '新しい回路から始めました。'; editor.render({ notify: false });
    },
    onStatusChange: ({ name, dirty }) => {
      $('save-status').textContent = `${name || '新しい回路'} · ${dirty ? '未保存' : '保存済み'}`;
      queueDraft();
    }
  });
  $('template-list').appendChild(files.createTemplateList());
  $('open-saved').addEventListener('click', () => files.openLoad());
  window.logicWorkbenchEditor = editor;

  function setPane(name, restoreFocus = false, remember = true) {
    if (busy()) return;
    const previous = tabs.find(tab => tab.dataset.paneButton === activePane);
    activePane = name;
    side.classList.toggle('open', Boolean(name));
    panes.forEach(pane => { pane.hidden = pane.dataset.pane !== name; });
    tabs.forEach(tab => tab.setAttribute('aria-expanded', String(tab.dataset.paneButton === name)));
    const truthTab = tabs.find(tab => tab.dataset.paneButton === 'truth');
    truthTab.setAttribute('aria-label', name === 'truth' ? '真理値表を折りたたむ' : '真理値表を表示');
    if (remember) { preferences.pane = name; savePreferences(); }
    panelResize?.refresh();
    if (restoreFocus) previous?.focus({ preventScroll: true });
    refresh();
  }
  tabs.forEach(tab => tab.addEventListener('click', () => {
    setPane(activePane === tab.dataset.paneButton ? null : tab.dataset.paneButton);
    tab.focus({ preventScroll: true });
  }));
  document.querySelectorAll('[data-close-side]').forEach(button => button.addEventListener('click', () => setPane(null, true)));
  document.addEventListener('pointerdown', event => {
    if (matchMedia('(max-width: 850px)').matches && activePane && !side.contains(event.target)
      && !event.target.closest('dialog, .tool-help') && !document.querySelector('dialog[open]')) setPane(null);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activePane && side.contains(document.activeElement) && !document.querySelector('dialog[open]')) {
      event.preventDefault(); setPane(null, true);
    }
  });

  let previewFingerprint = null;
  $('export-filename').value = window.LogicCore.createSvgFilename().replace(/\.svg$/i, '');
  function exportOptions() {
    return { filename: $('export-filename').value.trim(), background: $('export-background').value,
      scale: Number($('export-scale').value) };
  }
  function exportError(error) {
    $('export-error').textContent = error.message || '画像を書き出せませんでした。';
    $('export-error').hidden = false;
  }
  function refreshExport(analysis) {
    $('export-submit').disabled = !analysis.valid || exporting;
    $('export-copy').disabled = !analysis.valid || exporting;
    $('export-note').textContent = analysis.valid
      ? `0/1は上部の設定に従います（現在${editor.showSignals ? '表示' : '非表示'}）。`
      : `回路が完成すると書き出せます。${analysis.errors[0] || ''}`;
    $('export-submit').title = `${$('export-filename').value || 'logic-circuit'}.${$('export-form').elements.format.value}`;
    if (activePane !== 'export' || busy()) return;
    const background = $('export-background').value;
    const fingerprint = JSON.stringify([editor.snapshot(), editor.showSignals, background, analysis.valid]);
    if (fingerprint === previewFingerprint) return;
    previewFingerprint = fingerprint;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('export-preview').replaceChildren();
    $('export-preview').dataset.background = background;
    $('export-preview').hidden = !analysis.valid;
    if (!analysis.valid) return;
    try {
      const { svg, title } = editor.createExportDiagram();
      previewUrl = URL.createObjectURL(new Blob([window.LogicRenderer.serializeSvg(svg, title, { background })], { type: 'image/svg+xml' }));
      const image = document.createElement('img');
      image.src = previewUrl; image.alt = `現在の回路の画像出力プレビュー（${background === 'white' ? '白' : '透明'}背景）`;
      image.style.width = '100%'; image.style.display = 'block';
      $('export-preview').appendChild(image);
    } catch (error) { exportError(error); }
  }
  function refresh(instance = editor, analysis = editor.getAnalysis()) {
    files?.refresh();
    const nodes = instance.getSelectedNodes();
    const node = nodes.length === 1 ? nodes[0] : null;
    const selection = $('selection-tools');
    const focusedAction = document.activeElement;
    const hadFocus = selection.contains(focusedAction);
    selection.hidden = !instance.selected;
    $('insert-not').hidden = instance.selected?.kind !== 'wire';
    $('duplicate-selection').hidden = nodes.length === 0;
    $('selection-layout').hidden = nodes.length < 2;
    if (nodes.length < 2) $('selection-layout').open = false;
    selectionModeButton.setAttribute('aria-pressed', String(instance.selectionMode));
    document.querySelectorAll('[data-align]').forEach(button => { button.disabled = nodes.length < (button.dataset.align.startsWith('distribute') ? 3 : 2); });
    instance.swapButton.hidden = !node || !['AND', 'OR'].includes(node.type);
    instance.deleteButton.hidden = instance.deleteButton.disabled;
    $('selection-name').textContent = nodes.length > 1 ? `${nodes.length}部品` : node ? node.name || node.type : '配線';
    if (hadFocus && (selection.hidden || focusedAction.hidden)) instance.canvasWrap.focus({ preventScroll: true });
    const issues = instance.getDiagnostics();
    const hasIssues = issues.length > 0 || !analysis.valid;
    const status = hasIssues ? `接続状況 (${issues.length || '!'})` : '接続完了';
    $('circuit-status').textContent = matchMedia('(max-width: 560px)').matches ? (hasIssues ? `! ${issues.length || ''}` : '✓') : status;
    $('circuit-status').classList.toggle('has-issues', hasIssues);
    $('circuit-status').title = `${status}：${instance.graph.nodes.length}部品・${instance.graph.wires.length}配線${analysis.valid ? '' : `。${analysis.errors[0]}`}`;
    $('circuit-status').setAttribute('aria-label', `${status}を確認`);
    instance.status.title = instance.status.textContent;
    $('truth-copy').disabled = !analysis.valid || copyingTable;
    $('truth-copy').title = analysis.valid
      ? '真理値表をコピー（スプレッドシートへ貼り付け）'
      : '回路が完成すると真理値表をコピーできます。';
    refreshExport(analysis);
    document.querySelectorAll('button:not([tabindex])').forEach(button => { button.tabIndex = 0; });
    if (pendingFit && !busy()) { pendingFit = false; applyZoom(); }
  }
  editor.options.onRender = refresh;
  $('export-form').addEventListener('input', () => refreshExport(editor.getAnalysis()));
  async function performExport(copy = false) {
    if (!editor.getAnalysis().valid || exporting || busy() || !$('export-form').reportValidity()) return;
    $('export-error').hidden = true; exporting = true;
    refreshExport(editor.getAnalysis());
    try {
      const { svg, title } = editor.createExportDiagram(), options = exportOptions();
      if (copy) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('このブラウザでは画像コピーを利用できません。PNGを書き出して貼り付けてください。');
        // PNG変換を待たずにクリップボードを呼び、Safariのユーザー操作条件を維持する。
        const blob = window.LogicRenderer.createPngBlob(svg, title, options);
        blob.catch(() => {}); // クリップボード拒否が先に返っても未処理の拒否を残さない。
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); }
        catch (_) { throw new Error('画像をコピーできませんでした。ブラウザの許可を確認するか、PNGを書き出して貼り付けてください。'); }
        editor.notice = 'PNG画像をコピーしました。スライドや文書へ貼り付けられます。';
      } else {
        const format = $('export-form').elements.format.value;
        const filename = format === 'png' ? await window.LogicRenderer.downloadPng(svg, title, options)
          : window.LogicRenderer.downloadSvg(svg, title, options);
        editor.notice = `「${filename}」の保存を開始しました。ダウンロードを確認してください。`;
      }
    } catch (error) { exportError(error); editor.notice = error.message; }
    finally { exporting = false; editor.render({ notify: false }); }
  }
  $('export-form').addEventListener('submit', event => { event.preventDefault(); performExport(); });
  $('export-copy').addEventListener('click', () => performExport(true));

  function applyZoom(value) {
    if (busy()) { pendingFit = true; return; }
    const wrap = editor.canvasWrap;
    const rect = wrap.getBoundingClientRect();
    const center = editor.toSvgPoint(rect.left + wrap.clientWidth / 2, rect.top + wrap.clientHeight / 2);
    if (value != null) zoomMode = value;
    zoom = zoomMode === 'fit' ? Math.min(wrap.clientWidth / 900, wrap.clientHeight / 520) : Number(zoomMode);
    zoom = Math.max(.15, Math.min(4, zoom));
    editor.svg.style.width = `${900 * zoom}px`; editor.svg.style.height = `${520 * zoom}px`;
    if (zoomMode === 'fit') { wrap.scrollLeft = 0; wrap.scrollTop = 0; }
    else { wrap.scrollLeft = center.x * zoom - wrap.clientWidth / 2; wrap.scrollTop = center.y * zoom - wrap.clientHeight / 2; }
    $('zoom').querySelector('option[value="current"]').textContent = `${Math.round(zoom * 100)}%${zoomMode === 'fit' ? '（全体）' : ''}`;
    $('zoom').value = 'current'; $('zoom-out').disabled = zoom <= .15; $('zoom-in').disabled = zoom >= 4;
    editor.render({ notify: false });
  }
  $('zoom').addEventListener('change', event => { if (event.target.value !== 'current') applyZoom(event.target.value); });
  $('zoom-out').addEventListener('click', () => applyZoom(Math.max(.15, zoom / 1.25)));
  $('zoom-in').addEventListener('click', () => applyZoom(Math.min(4, zoom * 1.25)));
  $('zoom-fit').addEventListener('click', () => applyZoom('fit'));
  editor.canvasWrap.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault(); applyZoom(Math.max(.15, Math.min(4, zoom * (event.deltaY > 0 ? .9 : 1.1))));
  }, { passive: false });
  new ResizeObserver(() => { if (zoomMode === 'fit') applyZoom(); }).observe(editor.canvasWrap);

  const dialogOpeners = new Map();
  function restoreControlFocus(opener) {
    const target = opener?.getClientRects().length ? opener : $('toolbar-menu').querySelector('summary');
    target?.focus({ preventScroll: true });
  }
  function closeDialog(dialog, restore = true) {
    if (!dialog.open) return;
    dialog.close();
    const opener = dialogOpeners.get(dialog); opener?.setAttribute('aria-expanded', 'false');
    if (restore && opener?.isConnected) restoreControlFocus(opener);
  }
  function openDialog(dialog, opener) {
    if (busy()) return;
    document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: 'logic-tool-dialog' } }));
    dialogOpeners.set(dialog, opener); opener.setAttribute('aria-expanded', 'true');
    dialog.showModal(); dialog.querySelector('button, select')?.focus();
  }
  document.querySelectorAll('dialog:not(#logic-file-dialog)').forEach(dialog => {
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDialog(dialog); }
    });
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeDialog(dialog);
    });
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(dialog)));
  });
  document.addEventListener('joho:overlay-open', () => document.querySelectorAll('dialog:not(#logic-file-dialog)').forEach(dialog => closeDialog(dialog, false)));
  editor.helpButton.removeAttribute('data-lesson-supplement-open');
  try {
    helpPanel = window.JohoToolHelp.create({
      root: $('lc02-operation-dialog'), opener: editor.helpButton, title: '論理回路の使い方',
      storageKey: 'joho.logic.help.v1', isBusy: busy,
      bounds: () => ({ top: document.querySelector('.top').getBoundingClientRect().bottom + 8,
        bottom: $('stage').getBoundingClientRect().bottom - 8 }),
      initialRight: () => $('stage').getBoundingClientRect().right - 12,
      returnToEditor: () => editor.canvasWrap.focus({ preventScroll: true })
    });
  } catch (_) {
    $('lc02-operation-dialog').hidden = true; editor.helpButton.disabled = true;
    editor.helpButton.title = 'ヘルプを読み込めませんでした。ページを再読み込みしてください。';
  }
  $('settings-button').addEventListener('click', () => openDialog($('settings-dialog'), $('settings-button')));
  $('draft-status').addEventListener('click', () => files.openLoad({ opener: $('draft-status') }));
  $('circuit-status').addEventListener('click', () => {
    const list = $('diagnostics-list'); list.replaceChildren();
    const issues = editor.getDiagnostics();
    issues.forEach(issue => {
      const row = document.createElement('li'); row.className = 'logic-file-row';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'logic-file-load';
      button.textContent = issue.message; button.dataset.diagnosticId = issue.id;
      button.addEventListener('click', () => {
        closeDialog($('diagnostics-dialog'), false); editor.focusDiagnostic(issue.id);
      });
      row.appendChild(button); list.appendChild(row);
    });
    if (!issues.length) {
      const row = document.createElement('li'); row.textContent = editor.getAnalysis().valid ? 'すべて接続されています。真理値表で動作を確認できます。'
        : editor.getAnalysis().errors.join(' ');
      list.appendChild(row);
    }
    openDialog($('diagnostics-dialog'), $('circuit-status'));
    list.querySelector('button')?.focus();
  });

  const toolbarMenu = $('toolbar-menu'), top = document.querySelector('.top');
  let compactToolbar = false;
  function fitToolbar() {
    const wasOpen = toolbarMenu.open;
    top.classList.remove('is-compact'); toolbarMenu.open = true;
    const occupied = [...top.children].reduce((total, child) => total + child.getBoundingClientRect().width, 0) + 36;
    const compact = occupied > top.clientWidth;
    top.classList.toggle('is-compact', compact);
    toolbarMenu.open = compact ? (compactToolbar && wasOpen) : true;
    compactToolbar = compact;
  }
  [toolbarMenu, $('selection-layout')].forEach(menu => {
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open && (menu !== toolbarMenu || compactToolbar)) {
        event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector('summary').focus();
      }
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('button') && menu === toolbarMenu && compactToolbar) {
        menu.open = false;
        if (!document.querySelector('dialog[open]')) menu.querySelector('summary').focus({ preventScroll: true });
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!menu.contains(event.target) && (menu !== toolbarMenu || compactToolbar)) menu.open = false;
    });
  });
  window.addEventListener('resize', () => { fitToolbar(); refresh(); });

  const shortcuts = [
    [editor.fileSaveButton, '⌘/Ctrl+S', 'Meta+S Control+S'], [editor.loadButton, '⌘/Ctrl+O', 'Meta+O Control+O'],
    [editor.undoButton, '⌘/Ctrl+Z', 'Meta+Z Control+Z'], [editor.redoButton, '⌘/Ctrl+Shift+Z', 'Meta+Shift+Z Control+Shift+Z'],
    [editor.deleteButton, 'Delete', 'Delete'], [editor.helpButton, '?', '?']
  ];
  shortcuts.forEach(([button, text, keys]) => { button.dataset.shortcut = text; button.setAttribute('aria-keyshortcuts', keys); });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || document.querySelector('dialog[open]')) return;
    if (helpPanel?.root.contains(event.target)) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const command = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    const action = command && !event.shiftKey ? { s: editor.fileSaveButton, o: editor.loadButton }[key]
      : !command && event.key === '?' ? editor.helpButton : null;
    if (action) {
      event.preventDefault();
      if (!busy() && !event.repeat) action.click();
    } else if (event.key === 'Escape' && !busy() && editor.selected) {
      event.preventDefault(); editor.clearSelection(); editor.notice = '選択を解除しました。';
      editor.canvasWrap.focus({ preventScroll: true }); editor.render({ notify: false });
    }
  });

  function selectTableText() {
    $('truth-copy-text').focus();
    $('truth-copy-text').select();
  }
  $('truth-copy-select').addEventListener('click', selectTableText);
  $('truth-copy').addEventListener('click', async () => {
    const analysis = editor.getAnalysis();
    if (!analysis.valid || copyingTable || busy()) return;
    // 表示中の表と同じ解析結果・列順を使う。強調行や0/1表示設定には依存しない。
    const rows = [
      [...analysis.inputs, ...analysis.outputs.map(output => output.name)],
      ...analysis.truthTable.map(row => [
        ...analysis.inputs.map(name => row.inputs[name]),
        ...analysis.outputs.map(output => row.outputs[output.id])
      ])
    ];
    const text = rows.map(row => row.join('\t')).join('\n');
    const hadFocus = document.activeElement === $('truth-copy');
    copyingTable = true;
    $('truth-copy').disabled = true;
    try {
      // Safariでもユーザー操作の直後に呼び出す。クリップボードの読み取りは行わない。
      await navigator.clipboard.writeText(text);
      editor.notice = '真理値表をコピーしました。スプレッドシートへ貼り付けられます。';
    } catch (_) {
      editor.notice = '自動コピーできませんでした。真理値表のコピー画面から手動でコピーできます。';
      // 権限確認中に別の操作へ移った場合は、そちらの画面を奪わない。
      if (activePane === 'truth' && !busy() && !document.querySelector('dialog[open]')) {
        $('truth-copy-text').value = text;
        openDialog($('truth-copy-dialog'), $('truth-copy'));
        selectTableText();
      }
    } finally {
      copyingTable = false;
      editor.render({ notify: false });
      if (hadFocus && activePane === 'truth' && document.activeElement === document.body && !$('truth-copy').disabled) {
        $('truth-copy').focus({ preventScroll: true });
      }
    }
  });

  const colorQuery = matchMedia('(prefers-color-scheme: dark)');
  function applyPreferences() {
    document.documentElement.dataset.theme = $('theme').value;
    document.documentElement.dataset.resolvedTheme = $('theme').value === 'auto' ? (colorQuery.matches ? 'dark' : 'light') : $('theme').value;
    document.documentElement.dataset.textSize = $('text-size').value;
    preferences.theme = $('theme').value; preferences.textSize = $('text-size').value; savePreferences();
    fitToolbar();
  }
  if (['auto', 'light', 'dark'].includes(preferences.theme)) $('theme').value = preferences.theme;
  if (['standard', 'large', 'largest'].includes(preferences.textSize)) $('text-size').value = preferences.textSize;
  $('theme').addEventListener('change', applyPreferences); $('text-size').addEventListener('change', applyPreferences);
  colorQuery.addEventListener('change', applyPreferences); applyPreferences();

  $('fullscreen-button').hidden = !document.fullscreenEnabled;
  $('fullscreen-button').addEventListener('click', async () => {
    if (busy()) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { editor.notice = '全画面表示を開始できませんでした。ブラウザの表示設定を確認してください。'; editor.render({ notify: false }); }
  });
  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? '全画面表示を終了' : '全画面表示';
    $('fullscreen-button').setAttribute('aria-label', label); $('fullscreen-button').title = label;
    // WebKitではEscapeがページへ届かず全画面終了に使われる。その場合もモーダルを残さない。
    if (!document.fullscreenElement) {
      files.close();
      document.querySelectorAll('dialog:not(#logic-file-dialog)').forEach(dialog => closeDialog(dialog));
      helpPanel?.close(false);
    }
  });
  // Safariでも動的なダイアログのボタンを通常のTab順へ含める。
  new MutationObserver(() => document.querySelectorAll('dialog button:not([tabindex])').forEach(button => { button.tabIndex = 0; }))
    .observe(document.body, { childList: true, subtree: true });
  editor.notice = '左の部品をドラッグして配置。端子（●）を順に選ぶか、端子間をドラッグしてつなぎます。';
  panelResize = window.LogicToolUI.resizePanel({ handle: $('side-resizer'), panel: $('side-main'), busy,
    width: Number.isFinite(preferences.panelWidth) ? preferences.panelWidth : 300,
    onCommit: width => { preferences.panelWidth = width; savePreferences(); },
    onDragging: value => { resizing = value; if (!value) refresh(); }
  });
  const chooseDraft = initializeDrafts();
  updateTable(editor.getState());
  const initialPane = [null, 'truth', 'templates', 'export'].includes(preferences.pane) ? preferences.pane
    : matchMedia('(min-width: 1101px)').matches ? 'truth' : null;
  setPane(initialPane, false, false);
  applyZoom(matchMedia('(max-width: 850px)').matches ? .85 : 'fit');
  editor.canvasWrap.scrollLeft = 0;
  editor.canvasWrap.scrollTop = 0;
  window.LogicToolUI.tooltips({ busy });
  document.body.classList.add('logic-tool-ready');
  if (chooseDraft) files.openLoad({ initial: true });
  if (window.JohoLogicAssignment && window.JohoAssignmentLite && window.JohoAssignmentLiteClient && window.JohoAssignmentLiteBridge && window.JohoAssignmentLiteStore) {
    window.logicAssignment = window.JohoLogicAssignment.mount({ editor, files, busy,
      suspendNormal: () => { flushDraft(true); clearTimeout(draftTimer); normalSuspended = true; },
      resumeNormal: () => { normalSuspended = false; draftFingerprint = JSON.stringify(draftValue()); }
    });
  }
})();
