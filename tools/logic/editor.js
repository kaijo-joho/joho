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
    clear: '<path d="M8 3h8M4 6h16M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'
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
  let files, editor, activePane = null, previewUrl = null;
  let zoomMode = 'fit', zoom = 1, pendingFit = false;
  let copyingTable = false;
  const busy = () => Boolean(editor && (editor.drag || editor.paletteDrag || editor.connectionDrag || editor.bendDrag || editor.pan));

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
    allowSignalToggle: true, enableWireEditing: true, allowMousePan: true,
    initialExpression: 'A-B', helpDialogId: 'lc02-operation-dialog', keyboardRoot: app,
    onSave: () => files.openSave(), onLoad: () => files.openLoad(), onClearRequest: () => files.requestClear(),
    onExport: () => setPane('export'), onChange: updateTable
  });
  // 同じ部品を移設し、ドラッグ・タッチ・キー操作のハンドラーを保つ。
  $('component-tools').appendChild(editor.editor.querySelector('.logic-editor__palette'));
  $('basic-toolbar').append(editor.fileSaveButton, editor.loadButton, editor.clearButton, editor.undoButton, editor.redoButton);
  editor.clearButton.replaceChildren(icon('clear'));
  editor.clearButton.classList.add('icon-button');
  editor.clearButton.setAttribute('aria-label', '全消去');
  editor.clearButton.title = '全消去（未保存の変更は保存を確認します）';
  $('display-toolbar').prepend(editor.signalButton);
  $('display-toolbar').appendChild(editor.helpButton);
  $('layout-tools').appendChild(editor.alignButton);
  editor.alignButton.appendChild(document.createTextNode('整列'));
  $('selection-tools').append(editor.swapButton, editor.deleteButton);
  $('operation-hint').appendChild(editor.status);
  // 互換APIは残し、画面上の画像出力入口は右端に集約する。
  editor.exportButton.hidden = true;
  files = new window.LogicWorkbenchFiles(editor, {
    onStatusChange: ({ name, dirty }) => { $('save-status').textContent = `${name || '新しい回路'} · ${dirty ? '未保存' : '保存済み'}`; }
  });
  $('template-list').appendChild(files.createTemplateList());
  $('open-saved').addEventListener('click', () => files.openLoad());
  window.logicWorkbenchEditor = editor;

  function setPane(name, restoreFocus = false) {
    if (busy()) return;
    const previous = tabs.find(tab => tab.dataset.paneButton === activePane);
    activePane = name;
    side.classList.toggle('open', Boolean(name));
    panes.forEach(pane => { pane.hidden = pane.dataset.pane !== name; });
    tabs.forEach(tab => tab.setAttribute('aria-expanded', String(tab.dataset.paneButton === name)));
    const truthTab = tabs.find(tab => tab.dataset.paneButton === 'truth');
    truthTab.setAttribute('aria-label', name === 'truth' ? '真理値表を折りたたむ' : '真理値表を表示');
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
      && !event.target.closest('dialog') && !document.querySelector('dialog[open]')) setPane(null);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activePane && side.contains(document.activeElement) && !document.querySelector('dialog[open]')) {
      event.preventDefault(); setPane(null, true);
    }
  });

  function refreshExport(analysis) {
    $('export-submit').disabled = !analysis.valid || editor.savingPng;
    $('export-note').textContent = analysis.valid
      ? `0/1は上部の設定に従います（現在${editor.showSignals ? '表示' : '非表示'}）。`
      : `回路が完成すると書き出せます。${analysis.errors[0] || ''}`;
    $('export-submit').title = window.LogicCore.createSvgFilename().replace(/\.svg$/i, `.${$('export-form').elements.format.value}`);
    if (activePane !== 'export' || busy()) return;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('export-preview').replaceChildren();
    if (!analysis.valid) return;
    const { svg, title } = editor.createExportDiagram();
    previewUrl = URL.createObjectURL(new Blob([window.LogicRenderer.serializeSvg(svg, title)], { type: 'image/svg+xml' }));
    const image = document.createElement('img');
    image.src = previewUrl; image.alt = '現在の回路の画像出力プレビュー';
    image.style.width = '100%'; image.style.display = 'block';
    $('export-preview').appendChild(image);
  }
  function refresh(instance = editor, analysis = editor.getAnalysis()) {
    files?.refresh();
    const node = instance.selected?.kind === 'node' ? instance.findNode(instance.selected.id) : null;
    const selection = $('selection-tools');
    const hadFocus = selection.contains(document.activeElement);
    selection.hidden = !instance.selected;
    instance.swapButton.hidden = !node || !['AND', 'OR'].includes(node.type);
    instance.deleteButton.hidden = instance.deleteButton.disabled;
    $('selection-name').textContent = node ? node.name || node.type : '配線';
    if (hadFocus && (selection.hidden || document.activeElement.hidden)) instance.canvasWrap.focus({ preventScroll: true });
    $('circuit-status').textContent = analysis.valid ? '接続完了' : '編集中';
    $('circuit-status').title = `${instance.graph.nodes.length}部品・${instance.graph.wires.length}配線${analysis.valid ? '' : `：${analysis.errors[0]}`}`;
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
  $('export-form').addEventListener('change', () => refreshExport(editor.getAnalysis()));
  $('export-form').addEventListener('submit', async event => {
    event.preventDefault();
    if ($('export-submit').disabled) return;
    $('export-error').hidden = true; $('export-submit').disabled = true;
    const success = $('export-form').elements.format.value === 'png' ? await editor.savePng() : editor.saveSvg();
    if (!success) { $('export-error').textContent = editor.notice; $('export-error').hidden = false; }
    refresh();
  });

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
  function closeDialog(dialog, restore = true) {
    if (!dialog.open) return;
    dialog.close();
    const opener = dialogOpeners.get(dialog); opener?.setAttribute('aria-expanded', 'false');
    if (restore && opener?.isConnected) opener.focus({ preventScroll: true });
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
  editor.helpButton.setAttribute('aria-haspopup', 'dialog'); editor.helpButton.setAttribute('aria-controls', 'lc02-operation-dialog');
  editor.helpButton.addEventListener('click', () => openDialog($('lc02-operation-dialog'), editor.helpButton));
  $('settings-button').addEventListener('click', () => openDialog($('settings-dialog'), $('settings-button')));

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

  const preferencesKey = 'joho.logic.ui.v1';
  const colorQuery = matchMedia('(prefers-color-scheme: dark)');
  function applyPreferences() {
    document.documentElement.dataset.theme = $('theme').value;
    document.documentElement.dataset.resolvedTheme = $('theme').value === 'auto' ? (colorQuery.matches ? 'dark' : 'light') : $('theme').value;
    document.documentElement.dataset.textSize = $('text-size').value;
    try { localStorage.setItem(preferencesKey, JSON.stringify({ theme: $('theme').value, textSize: $('text-size').value })); } catch (_) { /* 回路のファイル保存は利用可能。 */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    if (['auto', 'light', 'dark'].includes(saved?.theme)) $('theme').value = saved.theme;
    if (['standard', 'large', 'largest'].includes(saved?.textSize)) $('text-size').value = saved.textSize;
  } catch (_) { /* 保存不可・破損時は既定表示で開く。 */ }
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
    }
  });
  // Safariでも動的なダイアログのボタンを通常のTab順へ含める。
  new MutationObserver(() => document.querySelectorAll('dialog button:not([tabindex])').forEach(button => { button.tabIndex = 0; }))
    .observe(document.body, { childList: true, subtree: true });
  editor.notice = '左の部品をドラッグして配置。端子（●）を順に選ぶか、端子間をドラッグしてつなぎます。';
  updateTable(editor.getState());
  setPane(matchMedia('(min-width: 1101px)').matches ? 'truth' : null);
  applyZoom(matchMedia('(max-width: 850px)').matches ? .85 : 'fit');
  editor.canvasWrap.scrollLeft = 0;
  editor.canvasWrap.scrollTop = 0;
  document.body.classList.add('logic-tool-ready');
})();
