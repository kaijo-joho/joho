(function () {
  'use strict';

  function initialize() {
    const host = document.getElementById('logic-editor');
    if (!host || !window.LogicEditor) return;

    const currentOutput = document.getElementById('logic-current-output');
    const filenameOutput = document.getElementById('logic-svg-filename');
    const tableTarget = document.getElementById('logic-workbench-table');
    const saveButton = document.getElementById('logic-save-svg');
    const saveStatus = document.getElementById('logic-save-status');
    let editor;

    function update(state) {
      const { analysis, inputValues } = state;
      if (!analysis.valid) {
        currentOutput.textContent = 'F = －';
        filenameOutput.textContent = '回路完成後に決まります';
        saveButton.disabled = true;
        window.LogicRenderer.renderMessage(tableTarget, '回路が完成すると真理値表を表示します。');
        return;
      }

      const output = window.LogicCore.evaluate(analysis.ast, inputValues);
      currentOutput.textContent = `F = ${output}`;
      filenameOutput.textContent = window.LogicCore.createSvgFilename();
      saveButton.disabled = false;
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
      onChange: update
    });
    update(editor.getState());

    document.querySelectorAll('[data-load-logic-example]').forEach(button => {
      button.addEventListener('click', () => {
        try {
          editor.loadExpression(button.dataset.loadLogicExample);
          saveStatus.textContent = `「${button.textContent.trim()}」を読み込みました。`;
        } catch (error) {
          saveStatus.textContent = error.message;
        }
      });
    });

    saveButton.addEventListener('click', () => {
      try {
        const filename = editor.exportSvg();
        saveStatus.textContent = `${filename} を保存しました。`;
      } catch (error) {
        saveStatus.textContent = `保存できません：${error.message}`;
      }
    });

    window.logicWorkbenchEditor = editor;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
