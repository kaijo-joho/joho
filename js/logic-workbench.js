(function () {
  'use strict';

  function initialize() {
    const host = document.getElementById('logic-editor');
    if (!host || !window.LogicEditor) return;

    const tableTarget = document.getElementById('logic-workbench-table');
    let editor;

    function update(state) {
      const { analysis, inputValues } = state;
      if (!analysis.valid) {
        window.LogicRenderer.renderMessage(tableTarget, '回路が完成すると真理値表を表示します。');
        return;
      }

      window.LogicWidgets.renderTruthTable(tableTarget, {
        inputNames: analysis.inputs,
        rows: analysis.truthTable,
        activeInputs: inputValues,
        caption: '真理値表（行を選ぶと回路の入力が変わります）',
        onRowSelect: inputs => editor.setInputValues(inputs)
      });
    }

    editor = new window.LogicEditor(host, {
      inputNames: ['A', 'B', 'C', 'D'],
      initialExpression: 'A-B',
      enableSvgSave: true,
      onChange: update
    });
    update(editor.getState());

    document.querySelectorAll('[data-load-logic-example]').forEach(button => {
      button.addEventListener('click', () => {
        editor.loadExpression(button.dataset.loadLogicExample);
      });
    });

    window.logicWorkbenchEditor = editor;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
