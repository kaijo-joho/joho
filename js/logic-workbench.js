(function () {
  'use strict';

  function initialize() {
    const host = document.getElementById('logic-editor');
    if (!host || !window.LogicEditor) return;

    const tableTarget = document.getElementById('logic-workbench-table');
    const tablePanel = tableTarget?.closest('.logic-workspace-table');
    const workspace = host.closest('.logic-workspace-grid');
    const boundary = document.createElement('button');
    boundary.type = 'button';
    boundary.className = 'logic-workbench-boundary';
    boundary.textContent = '▶';
    boundary.setAttribute('aria-label', '真理値表を折りたたむ');
    boundary.setAttribute('aria-expanded', 'true');
    boundary.setAttribute('aria-controls', tablePanel?.id || 'logic-workbench-table-panel');
    workspace?.insertBefore(boundary, tablePanel);
    let tableVisible = true;
    let editor;
    let files;
    // 共通基盤のdialogと開閉・フォーカス処理を使い、別スライドからも開ける位置へ置く。
    const helpDialog = document.getElementById('lc02-operation-dialog');
    if (helpDialog) document.body.appendChild(helpDialog);

    function setTableVisible(visible) {
      if (!tablePanel || !workspace) return;
      if (editor.drag || editor.paletteDrag || editor.connectionDrag || editor.pan || editor.bendDrag) return;
      if (!tablePanel.id) tablePanel.id = 'logic-workbench-table-panel';
      tableVisible = visible;
      tablePanel.hidden = !visible;
      workspace.classList.toggle('is-table-collapsed', !visible);
      const label = visible ? '真理値表を折りたたむ' : '真理値表を表示';
      boundary.setAttribute('aria-expanded', String(visible));
      boundary.setAttribute('aria-controls', tablePanel.id);
      boundary.setAttribute('aria-label', label);
      boundary.title = label;
      boundary.textContent = visible ? '▶' : '◀';
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }
    boundary.addEventListener('click', () => {
      setTableVisible(!tableVisible);
      boundary.focus({ preventScroll: true });
    });

    function update(state) {
      files?.refresh();
      const { analysis, inputValues } = state;
      if (!analysis.valid) {
        window.LogicRenderer.renderMessage(tableTarget, '回路が完成すると真理値表を表示します。');
        return;
      }

      window.LogicWidgets.renderTruthTable(tableTarget, {
        inputNames: analysis.inputs,
        outputs: analysis.outputs,
        rows: analysis.truthTable,
        activeInputs: inputValues,
        caption: '真理値表（行を選ぶと回路の入力が変わります）',
        onRowSelect: inputs => editor.setInputValues(inputs)
      });
    }

    editor = new window.LogicEditor(host, {
      inputNames: ['A', 'B'],
      availableInputNames: ['A', 'B', 'C', 'D'],
      allowInputDeletion: true,
      allowMultipleOutputs: true,
      enableAlignment: true,
      allowSignalToggle: true,
      enableWireEditing: true,
      initialExpression: 'A-B',
      onSave: () => files.openSave(),
      onLoad: () => files.openLoad(),
      onExport: () => files.openExport(),
      onClearRequest: () => files.requestClear(),
      helpDialogId: 'lc02-operation-dialog',
      onChange: update
    });
    update(editor.getState());
    setTableVisible(true);

    files = new window.LogicWorkbenchFiles(editor);
    document.addEventListener('joho:lesson-slide-change', () => {
      if (helpDialog?.open) helpDialog.close();
    });
    window.logicWorkbenchEditor = editor;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
