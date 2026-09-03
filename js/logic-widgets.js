// 真理値表と固定回路の学習ウィジェット。
(function (root) {
  'use strict';

  const Core = root.LogicCore;
  const Renderer = root.LogicRenderer;
  const TRUTH_BLANK_SYMBOL = '−';
  const TRUTH_LONG_PRESS_MS = 480;
  let truthTableHintSerial = 0;
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

  function createTruthAnswerControl(options = {}) {
    let value = options.value === 0 || options.value === 1 ? options.value : null;
    const readOnly = Boolean(options.readOnly);
    const wrapper = element('span', 'logic-answer-control');
    const button = element('button', `logic-table-answer${options.className ? ` ${options.className}` : ''}`);
    const quickChoices = element('span', 'logic-answer-control__quick');
    const quickCurrent = element('span', 'logic-answer-control__current', TRUTH_BLANK_SYMBOL);
    const menu = element('span', 'logic-answer-control__menu');
    let holdTimer = 0;
    let holdStart = null;
    let suppressNextClick = false;
    let outsideListenerAttached = false;

    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.disabled = Boolean(options.disabled);
    if (readOnly) button.setAttribute('aria-disabled', 'true');
    Object.entries(options.attributes || {}).forEach(([name, attributeValue]) => {
      if (attributeValue != null) button.setAttribute(name, String(attributeValue));
    });

    quickCurrent.setAttribute('aria-hidden', 'true');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '答えを0、未入力、1から選ぶ');
    menu.hidden = true;

    function answerText(answer) {
      return answer == null ? TRUTH_BLANK_SYMBOL : String(answer);
    }

    function baseLabel(answer) {
      if (typeof options.ariaLabel === 'function') return options.ariaLabel(answer);
      return `答え。現在${answer == null ? '未入力' : answer}`;
    }

    function update() {
      const isEmpty = value == null;
      wrapper.classList.toggle('is-empty', isEmpty);
      wrapper.classList.toggle('is-readonly', readOnly || button.disabled);
      wrapper.dataset.value = isEmpty ? 'empty' : String(value);
      button.textContent = answerText(value);
      const interactionHint = isEmpty
        ? '0または1を選択。長押しで0、未入力、1から選択'
        : `クリックで${value === 0 ? 1 : 0}に切り替え。長押しで0、未入力、1から選択`;
      button.setAttribute('aria-label', readOnly || button.disabled
        ? baseLabel(value)
        : `${baseLabel(value)}。${interactionHint}`);
    }

    function detachOutsideListener() {
      if (!outsideListenerAttached) return;
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      outsideListenerAttached = false;
    }

    function closeChoices(restoreFocus = false) {
      wrapper.classList.remove('is-quick-open', 'is-menu-open');
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      suppressNextClick = false;
      detachOutsideListener();
      if (restoreFocus && button.isConnected && !button.disabled) button.focus({ preventScroll: true });
    }

    function handleOutsidePointer(event) {
      if (!wrapper.contains(event.target)) closeChoices();
    }

    function attachOutsideListener() {
      if (outsideListenerAttached) return;
      window.setTimeout(() => {
        if (!wrapper.isConnected || (!wrapper.classList.contains('is-quick-open') && !wrapper.classList.contains('is-menu-open'))) return;
        document.addEventListener('pointerdown', handleOutsidePointer, true);
        outsideListenerAttached = true;
      }, 0);
    }

    function openQuickChoices() {
      if (readOnly || button.disabled) return;
      wrapper.classList.remove('is-menu-open');
      wrapper.classList.add('is-quick-open');
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'true');
      attachOutsideListener();
    }

    function openMenu() {
      if (readOnly || button.disabled) return;
      wrapper.classList.remove('is-quick-open');
      wrapper.classList.add('is-menu-open');
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      attachOutsideListener();
      window.setTimeout(() => {
        const selected = menu.querySelector(`[data-answer-value="${value == null ? 'empty' : value}"]`);
        selected?.focus({ preventScroll: true });
      }, 0);
    }

    function commit(nextValue) {
      if (readOnly || button.disabled) return;
      value = nextValue === 0 || nextValue === 1 ? nextValue : null;
      closeChoices(true);
      update();
      if (typeof options.onChange === 'function') options.onChange(value);
    }

    function makeChoice(answer, className, label, parent, role) {
      const choice = element('button', className, answerText(answer));
      choice.type = 'button';
      choice.tabIndex = parent === quickChoices ? -1 : 0;
      choice.dataset.answerValue = answer == null ? 'empty' : String(answer);
      choice.setAttribute('aria-label', label);
      if (role) choice.setAttribute('role', role);
      choice.addEventListener('pointerdown', event => event.stopPropagation());
      choice.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        commit(answer);
      });
      parent.appendChild(choice);
      return choice;
    }

    makeChoice(0, 'logic-answer-control__choice', '0を入力', quickChoices);
    quickChoices.appendChild(quickCurrent);
    makeChoice(1, 'logic-answer-control__choice', '1を入力', quickChoices);
    makeChoice(0, 'logic-answer-control__choice', '0を入力', menu, 'menuitem');
    makeChoice(null, 'logic-answer-control__choice', '未入力に戻す', menu, 'menuitem');
    makeChoice(1, 'logic-answer-control__choice', '1を入力', menu, 'menuitem');
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeChoices(true);
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const choices = Array.from(menu.querySelectorAll('[role="menuitem"]'));
      const currentIndex = Math.max(0, choices.indexOf(document.activeElement));
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? choices.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + choices.length) % choices.length;
      choices[nextIndex]?.focus({ preventScroll: true });
    });

    function clearHoldTimer() {
      if (holdTimer) window.clearTimeout(holdTimer);
      holdTimer = 0;
      holdStart = null;
    }

    button.addEventListener('pointerdown', event => {
      if (readOnly || button.disabled || event.button !== 0) return;
      clearHoldTimer();
      holdStart = { x: event.clientX, y: event.clientY };
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        holdStart = null;
        suppressNextClick = true;
        openMenu();
      }, TRUTH_LONG_PRESS_MS);
    });
    button.addEventListener('pointermove', event => {
      if (!holdTimer || !holdStart) return;
      if (Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > 10) clearHoldTimer();
    });
    button.addEventListener('pointerup', clearHoldTimer);
    button.addEventListener('pointercancel', clearHoldTimer);
    button.addEventListener('lostpointercapture', clearHoldTimer);
    button.addEventListener('contextmenu', event => {
      if (readOnly || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      clearHoldTimer();
      suppressNextClick = true;
      openMenu();
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      clearHoldTimer();
      if (readOnly || button.disabled) return;
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (value == null) openQuickChoices();
      else commit(value === 0 ? 1 : 0);
    });
    button.addEventListener('keydown', event => {
      if (readOnly || button.disabled) return;
      if (event.key === '0' || event.key === '1') {
        event.preventDefault();
        event.stopPropagation();
        commit(Number(event.key));
      } else if (event.key === '-' || event.key === '−' || event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        commit(null);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeChoices(true);
      }
    });
    wrapper.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!wrapper.contains(document.activeElement)) closeChoices();
      }, 0);
    });

    wrapper.append(button, quickChoices, menu);
    update();
    return Object.freeze({ element: wrapper, button, getValue: () => value, setValue: commit });
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
    const outputHeader = element('th', 'logic-truth-table__divider', 'F');
    const hoverHint = String(config.hoverHint || '').trim();
    if (hoverHint) {
      outputHeader.classList.add('logic-truth-table__output-header');
      outputHeader.tabIndex = 0;
      outputHeader.setAttribute('aria-label', `F列。${hoverHint}`);
      const hintIcon = element('span', 'logic-truth-table__hint-icon', 'ⓘ');
      hintIcon.setAttribute('aria-hidden', 'true');
      outputHeader.appendChild(hintIcon);
    }
    header.appendChild(outputHeader);
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
        outputCell.classList.add('logic-answer-cell');
        const labelFor = current => `${rowKey}のときのF。現在${current == null ? '未入力' : current}`;
        let judgedLabel = '';
        if (config.judged) {
          const correct = answer === row.output;
          outputCell.classList.add(answer == null ? 'is-unanswered' : correct ? 'is-correct' : 'is-wrong');
          judgedLabel = answer == null ? '未回答' : correct ? '正解' : `不正解、正しくは${row.output}`;
        }
        const control = createTruthAnswerControl({
          value: answer,
          readOnly: config.judged,
          ariaLabel: current => `${labelFor(current)}${judgedLabel ? `。${judgedLabel}` : ''}`,
          onChange: next => {
            if (typeof config.onAnswerChange === 'function') config.onAnswerChange(rowIndex, next);
          }
        });
        outputCell.appendChild(control.element);
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
    if (hoverHint) {
      truthTableHintSerial += 1;
      const shell = element('div', 'logic-table-shell');
      const hint = element('div', 'logic-table-hover-hint', hoverHint);
      hint.id = `logic-table-hint-${truthTableHintSerial}`;
      hint.hidden = true;
      hint.setAttribute('role', 'tooltip');
      hint.setAttribute('aria-hidden', 'true');
      outputHeader.setAttribute('aria-describedby', hint.id);
      const showHint = () => {
        hint.hidden = false;
        hint.setAttribute('aria-hidden', 'false');
        const shellBox = shell.getBoundingClientRect();
        const headerBox = outputHeader.getBoundingClientRect();
        hint.style.top = `${headerBox.bottom - shellBox.top + 6}px`;
        hint.style.right = 'auto';
        hint.style.left = '8px';
        const hintWidth = hint.getBoundingClientRect().width;
        const desiredLeft = headerBox.right - shellBox.left - hintWidth;
        const maxLeft = Math.max(8, shellBox.width - hintWidth - 8);
        hint.style.left = `${Math.max(8, Math.min(maxLeft, desiredLeft))}px`;
      };
      const hideHint = () => {
        hint.hidden = true;
        hint.setAttribute('aria-hidden', 'true');
      };
      outputHeader.addEventListener('pointerenter', showHint);
      outputHeader.addEventListener('pointerleave', hideHint);
      outputHeader.addEventListener('focus', showHint);
      outputHeader.addEventListener('blur', hideHint);
      shell.append(scroller, hint);
      target.replaceChildren(shell);
    } else {
      target.replaceChildren(scroller);
    }
    return table;
  }

  class CircuitExplorer {
    constructor(container, options = {}) {
      if (!(container instanceof Element)) throw new TypeError('CircuitExplorerの表示先が必要です。');
      this.container = container;
      this.expression = options.expression || container.dataset.expression || '';
      this.analysis = Core.parseAndAnalyze(this.expression);
      this.title = options.title || container.dataset.title || Core.toDisplayExpr(this.analysis.ast);
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
    createTruthAnswerControl,
    createInputControls,
    renderTruthTable,
    CircuitExplorer,
    initializeExplorers
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
