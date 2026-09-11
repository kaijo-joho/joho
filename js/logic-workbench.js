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
      initialExpression: 'A-B',
      enableSvgSave: true,
      enablePngSave: true,
      onChange: update
    });
    update(editor.getState());

    const examplePicker = document.querySelector('.logic-example-picker');
    const closeExamples = (restoreFocus = false) => {
      if (!examplePicker?.open) return;
      examplePicker.open = false;
      if (restoreFocus) examplePicker.querySelector('summary').focus();
    };
    document.addEventListener('pointerdown', event => {
      if (!examplePicker?.contains(event.target)) closeExamples();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeExamples(examplePicker?.contains(document.activeElement));
    });
    document.addEventListener('joho:overlay-open', () => closeExamples());
    document.addEventListener('joho:lesson-slide-change', () => closeExamples());
    document.querySelectorAll('[data-load-logic-example]').forEach(button => {
      button.addEventListener('click', () => {
        editor.loadExpression(button.dataset.loadLogicExample);
        closeExamples(true);
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
