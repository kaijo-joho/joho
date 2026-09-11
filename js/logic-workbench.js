(function () {
  'use strict';

  function initialize() {
    const host = document.getElementById('logic-editor');
    if (!host || !window.LogicEditor) return;

    const tableTarget = document.getElementById('logic-workbench-table');
    let editor;
    let files;

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
      onChange: update
    });
    update(editor.getState());

    files = new window.LogicWorkbenchFiles(editor);
    window.logicWorkbenchEditor = editor;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
