(function () {
  'use strict';

  function initialize() {
    const host = document.getElementById('logic-editor');
    if (!host || !window.LogicEditor) return;

    const tableTarget = document.getElementById('logic-workbench-table');
    const tablePanel = tableTarget?.closest('.logic-workspace-table');
    const workspace = host.closest('.logic-workspace-grid');
    let tableVisible = true;
    let editor;
    let files;

    function setTableVisible(visible) {
      if (!tablePanel || !workspace || !editor.tableButton) return;
      if (editor.drag || editor.paletteDrag || editor.connectionDrag || editor.pan) return;
      if (!tablePanel.id) tablePanel.id = 'logic-workbench-table-panel';
      tableVisible = visible;
      tablePanel.hidden = !visible;
      workspace.classList.toggle('is-table-collapsed', !visible);
      const label = visible ? '真理値表を折りたたむ' : '真理値表を表示';
      editor.tableButton.setAttribute('aria-expanded', String(visible));
      editor.tableButton.setAttribute('aria-controls', tablePanel.id);
      editor.tableButton.setAttribute('aria-label', label);
      editor.tableButton.title = label;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }

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
      initialExpression: 'A-B',
      onSave: () => files.openSave(),
      onLoad: () => files.openLoad(),
      onExport: () => files.openExport(),
      onClearRequest: () => files.requestClear(),
      onToggleTable: tablePanel ? () => setTableVisible(!tableVisible) : null,
      onChange: update
    });
    update(editor.getState());
    setTableVisible(true);

    files = new window.LogicWorkbenchFiles(editor);
    window.logicWorkbenchEditor = editor;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
