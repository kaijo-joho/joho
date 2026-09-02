// 真理値表と固定回路の学習ウィジェット。
(function (root) {
  'use strict';

  const Core = root.LogicCore;
  const Renderer = root.LogicRenderer;
  if (!Core || !Renderer) throw new Error('logic-widgets.jsの依存ファイルが読み込まれていません。');

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function inputsKey(inputNames, inputs) {
    return inputNames.map(name => String(Number(inputs?.[name]) || 0)).join('');
  }

  function createInputControls(target, inputNames, values, onChange, options = {}) {
    const fieldset = element('fieldset', 'logic-input-controls');
    const legend = element('legend', 'logic-input-controls__legend', options.legend || '入力を切り替える');
    fieldset.appendChild(legend);
    inputNames.forEach(name => {
      const wrapper = element('div', 'logic-input-control');
      const label = element('span', 'logic-input-control__name', name);
      const button = element('button', 'logic-bit-button', String(Number(values[name]) || 0));
      button.type = 'button';
      button.dataset.input = name;
      button.setAttribute('aria-label', `入力${name}。現在${button.textContent}。クリックして切り替え`);
      button.setAttribute('aria-pressed', button.textContent === '1' ? 'true' : 'false');
      button.addEventListener('click', () => {
        values[name] = values[name] ? 0 : 1;
        button.textContent = String(values[name]);
        button.setAttribute('aria-label', `入力${name}。現在${values[name]}。クリックして切り替え`);
        button.setAttribute('aria-pressed', values[name] ? 'true' : 'false');
        if (typeof onChange === 'function') onChange({ ...values });
      });
      wrapper.append(label, button);
      fieldset.appendChild(wrapper);
    });
    target.replaceChildren(fieldset);
    return fieldset;
  }

  function renderTruthTable(target, config) {
    const inputNames = config.inputNames || [];
    const rows = config.rows || [];
    const activeKey = config.activeInputs ? inputsKey(inputNames, config.activeInputs) : '';
    const table = element('table', 'logic-truth-table');
    const caption = element('caption', '', config.caption || '真理値表');
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    inputNames.forEach(name => header.appendChild(element('th', '', name)));
    header.appendChild(element('th', 'logic-truth-table__divider', 'F'));
    thead.appendChild(header);
    const tbody = document.createElement('tbody');

    rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      const rowKey = inputsKey(inputNames, row.inputs);
      tr.dataset.row = String(rowIndex);
      if (rowKey === activeKey) {
        tr.classList.add('is-active');
        tr.setAttribute('aria-current', 'true');
      }
      inputNames.forEach(name => tr.appendChild(element('td', '', String(row.inputs[name]))));
      const outputCell = element('td', 'logic-truth-table__divider');
      if (config.editableValues) {
        const answer = config.editableValues[rowIndex];
        const button = element('button', 'logic-table-answer', answer == null ? '－' : String(answer));
        button.type = 'button';
        button.setAttribute('aria-label', `${rowKey}のときのF。現在${answer == null ? '未回答' : answer}`);
        if (config.judged) {
          button.setAttribute('aria-disabled', 'true');
          const correct = answer === row.output;
          outputCell.classList.add(answer == null ? 'is-unanswered' : correct ? 'is-correct' : 'is-wrong');
          const mark = answer == null ? '未回答' : correct ? '正解' : `不正解、正しくは${row.output}`;
          button.setAttribute('aria-label', `${button.getAttribute('aria-label')}。${mark}`);
        }
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (config.judged) return;
          const next = answer == null ? 0 : answer === 0 ? 1 : null;
          if (typeof config.onAnswerChange === 'function') config.onAnswerChange(rowIndex, next);
        });
        outputCell.appendChild(button);
      } else {
        outputCell.textContent = String(row.output);
      }
      tr.appendChild(outputCell);
      if (typeof config.onRowSelect === 'function' && (!config.selectAfterJudgement || config.judged)) {
        tr.classList.add('is-selectable');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', `${rowKey}の行を回路に設定`);
        const select = () => config.onRowSelect({ ...row.inputs }, rowIndex);
        tr.addEventListener('click', select);
        tr.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          select();
        });
      }
      tbody.appendChild(tr);
    });
    table.append(caption, thead, tbody);
    const scroller = element('div', 'logic-table-scroll');
    scroller.appendChild(table);
    target.replaceChildren(scroller);
    return table;
  }

  class CircuitExplorer {
    constructor(container, options = {}) {
      if (!(container instanceof Element)) throw new TypeError('CircuitExplorerの表示先が必要です。');
      this.container = container;
      this.expression = options.expression || container.dataset.expression || '';
      this.title = options.title || container.dataset.title || this.expression;
      this.analysis = Core.parseAndAnalyze(this.expression);
      this.inputs = Object.fromEntries(this.analysis.inputs.map(name => [name, 0]));
      this.build();
      this.render();
    }

    build() {
      this.container.classList.add('logic-explorer');
      const heading = element('h4', 'logic-explorer__title', this.title);
      const grid = element('div', 'logic-explorer__grid');
      this.controls = element('div', 'logic-explorer__controls');
      this.diagram = element('div', 'logic-circuit logic-explorer__diagram');
      this.diagram.setAttribute('aria-live', 'polite');
      const side = element('div', 'logic-explorer__side');
      this.output = element('output', 'logic-output-readout');
      this.output.setAttribute('aria-live', 'polite');
      this.table = element('div', 'logic-explorer__table');
      side.append(this.output, this.table);
      grid.append(this.controls, this.diagram, side);
      this.container.replaceChildren(heading, grid);

      createInputControls(this.controls, this.analysis.inputs, this.inputs, values => {
        this.inputs = values;
        this.render();
      });
    }

    setInputs(inputs) {
      this.analysis.inputs.forEach(name => {
        this.inputs[name] = Number(inputs[name]) || 0;
      });
      createInputControls(this.controls, this.analysis.inputs, this.inputs, values => {
        this.inputs = values;
        this.render();
      });
      this.render();
    }

    render() {
      const result = Renderer.renderCircuit(this.diagram, this.analysis.ast, {
        inputs: this.inputs,
        title: `${this.title}の回路図`
      });
      this.output.textContent = `F = ${result.output}`;
      renderTruthTable(this.table, {
        inputNames: this.analysis.inputs,
        rows: this.analysis.truthTable,
        activeInputs: this.inputs,
        caption: `${this.title}の真理値表（行を選ぶと入力が変わります）`,
        onRowSelect: inputs => this.setInputs(inputs)
      });
    }
  }

  function initializeExplorers(scope = document) {
    const instances = [];
    scope.querySelectorAll('[data-logic-explorer]').forEach(container => {
      try {
        instances.push(new CircuitExplorer(container));
      } catch (error) {
        Renderer.renderMessage(container, `回路を表示できません：${error.message}`);
        console.error('[logic-widgets] explorer initialization failed:', error);
      }
    });
    return instances;
  }

  root.LogicWidgets = Object.freeze({
    element,
    inputsKey,
    createInputControls,
    renderTruthTable,
    CircuitExplorer,
    initializeExplorers
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
