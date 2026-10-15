// 真理値表の表示と自学用演習。回路・保存済み作品・教材側の採点は変更しない。
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogicTruthPractice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const columns = analysis => analysis.columns || analysis.outputs || [];
  const signature = analysis => analysis.valid ? JSON.stringify([analysis.inputs,
    columns(analysis).map(column => [column.id, column.name, column.truthCode])]) : '';
  const key = (row, column) => row.index + ':' + column.id;
  function grade(analysis, answers) {
    if (!analysis.valid) throw new Error('回路を完成させてから演習してください。');
    let correct = 0, answered = 0; const cells = Object.create(null);
    analysis.truthTable.forEach(row => columns(analysis).forEach(column => {
      const id = key(row, column), value = answers[id];
      const filled = value === '0' || value === '1';
      const ok = filled && Number(value) === row.outputs[column.id];
      if (filled) answered += 1; if (ok) correct += 1;
      cells[id] = filled ? (ok ? 'correct' : 'wrong') : 'empty';
    }));
    const total = analysis.truthTable.length * columns(analysis).length;
    return { correct, answered, total, empty: total - answered, percent: total ? Math.round(correct / total * 100) : 0, cells };
  }
  function fresh() {
    return { mode: 'view', signature: '', answers: {}, judged: false, revealed: false, hadAnswer: false, first: null, diagramSignals: true };
  }
  function restore(value) {
    const state = fresh();
    if (!value || typeof value !== 'object') return state;
    state.mode = value.mode === 'practice' ? 'practice' : 'view';
    state.signature = typeof value.signature === 'string' ? value.signature : '';
    state.diagramSignals = value.diagramSignals !== false;
    if (value.answers && typeof value.answers === 'object' && !Array.isArray(value.answers)) {
      Object.entries(value.answers).slice(0, 4000).forEach(([id, answer]) => {
        if (id.length <= 150 && /^[0-9]+:/.test(id) && ['0', '1', ''].includes(answer)) state.answers[id] = answer;
      });
    }
    state.judged = value.judged === true; state.revealed = value.revealed === true; state.hadAnswer = value.hadAnswer === true;
    if (value.first && Number.isInteger(value.first.correct) && Number.isInteger(value.first.total)
      && value.first.correct >= 0 && value.first.correct <= value.first.total && value.first.total <= 4000) state.first = { correct: value.first.correct, total: value.first.total };
    return state;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag); if (text != null) node.textContent = text;
    if (className) node.className = className; return node;
  }
  class Panel {
    constructor(options) {
      Object.assign(this, options); this.state = fresh(); this.renderKey = null;
      this.viewButton.onclick = () => this.setMode('view'); this.practiceButton.onclick = () => this.setMode('practice');
      this.controls.replaceChildren();
      this.score = element('p', '中間点と出力のすべての欄へ0または1を入力してください。', 'practice-score');
      this.score.id = 'practice-score'; this.score.setAttribute('role', 'status');
      const actions = element('div', null, 'practice-actions');
      this.judge = element('button', '判定・採点'); this.judge.id = 'practice-judge'; this.judge.type = 'button'; this.judge.className = 'primary';
      this.reveal = element('button', '解答を見る'); this.reveal.id = 'practice-reveal'; this.reveal.type = 'button';
      this.resetButton = element('button', 'やり直す'); this.resetButton.id = 'practice-reset'; this.resetButton.type = 'button';
      actions.append(this.judge, this.reveal, this.resetButton); this.controls.append(this.score, actions);
      this.judge.onclick = () => {
        if (!this.analysis?.valid) return;
        const result = grade(this.analysis, this.state.answers);
        this.state.judged = true;
        if (!this.state.first && !this.state.hadAnswer && result.empty === 0) this.state.first = { correct: result.correct, total: result.total };
        this.feedback(); this.onChange?.();
      };
      this.reveal.onclick = () => {
        this.state.revealed = !this.state.revealed;
        if (this.state.revealed) this.state.hadAnswer = true;
        this.feedback(); this.onChange?.();
      };
      this.resetButton.onclick = () => {
        const mode = this.state.mode, diagramSignals = this.state.diagramSignals;
        this.state = { ...fresh(), mode, signature: signature(this.analysis), diagramSignals };
        this.renderKey = null; this.render(); this.onChange?.();
      };
    }
    exportState() { return JSON.parse(JSON.stringify(this.state)); }
    restore(value) { this.state = restore(value); this.renderKey = null; }
    setMode(mode) {
      if (mode === this.state.mode || !this.analysis?.valid) return;
      this.state.mode = mode; this.onMode?.(mode, this.state);
      this.renderKey = null; this.render(); this.onChange?.();
    }
    update(analysis, inputValues) {
      this.analysis = analysis; this.inputValues = inputValues;
      const next = signature(analysis);
      if (analysis.valid && next !== this.state.signature) {
        this.state.signature = next; this.state.answers = {}; this.state.judged = false;
        this.state.revealed = false; this.state.hadAnswer = false; this.state.first = null; this.renderKey = null;
      }
      this.render();
    }
    render() {
      const analysis = this.analysis;
      if (!analysis) return;
      const practice = this.state.mode === 'practice';
      this.viewButton.setAttribute('aria-pressed', String(!practice)); this.practiceButton.setAttribute('aria-pressed', String(practice));
      this.practiceButton.disabled = !analysis.valid; this.controls.hidden = !practice || !analysis.valid;
      if (this.note) this.note.textContent = practice ? '−から0/1を選び、入力後はクリックで反転します。長押しで未入力に戻せます。中間点・出力の欄を埋め、判定してください。'
        : '行を選ぶと入力が切り替わります。中間点、最終出力の順に表示します。';
      if (!analysis.valid) {
        root.LogicRenderer.renderMessage(this.table, analysis.errors[0] || '回路を完成させてください。');
        this.renderKey = null; return;
      }
      if (!practice) {
        root.LogicWidgets.renderTruthTable(this.table, { inputNames: analysis.inputs, outputs: columns(analysis),
          rows: analysis.truthTable, activeInputs: this.inputValues, caption: '作成した回路の真理値表',
          onRowSelect: inputs => this.onRow?.(inputs) });
        this.renderKey = null; return;
      }
      const renderKey = signature(analysis) + ':practice';
      if (renderKey === this.renderKey) return;
      this.renderKey = renderKey;
      const scroll = element('div', null, 'practice-table-scroll');
      const table = element('table', null, 'logic-truth-table practice-table');
      table.appendChild(element('caption', '中間点と出力の真理値表を完成させる'));
      const head = element('thead'), header = element('tr');
      [...analysis.inputs, ...columns(analysis).map(column => column.name)].forEach(name => {
        const th = element('th', name); th.scope = 'col'; header.appendChild(th);
      }); head.appendChild(header);
      const body = element('tbody');
      analysis.truthTable.forEach(row => {
        const tr = element('tr');
        analysis.inputs.forEach(name => { const th = element('th', String(row.inputs[name])); th.scope = 'row'; tr.appendChild(th); });
        columns(analysis).forEach(column => {
          const id = key(row, column), td = element('td', null, 'logic-answer-cell'); td.dataset.answerCell = id;
          const label = analysis.inputs.map(name => name + '=' + row.inputs[name]).join('、') + '、' + column.name + 'の値';
          const control = root.LogicWidgets.createTruthAnswerControl({
            value: ['0', '1'].includes(this.state.answers[id]) ? Number(this.state.answers[id]) : null,
            ariaLabel: value => label + '、' + (value == null ? '未入力' : '現在' + value),
            attributes: { 'data-practice-answer': id },
            onChange: value => {
              this.state.answers[id] = value == null ? '' : String(value); this.state.judged = false;
              control.button.dataset.promptLabel = control.button.getAttribute('aria-label');
              this.feedback(); this.onChange?.();
            }
          });
          control.button.dataset.promptLabel = control.button.getAttribute('aria-label');
          const mark = element('span', '', 'practice-mark'); mark.setAttribute('aria-hidden', 'true');
          const answer = element('span', '', 'practice-answer'); answer.hidden = true;
          td.append(control.element, mark, answer); tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      table.append(head, body); scroll.appendChild(table); this.table.replaceChildren(scroll); this.feedback();
    }
    feedback() {
      if (!this.analysis?.valid || this.state.mode !== 'practice') return;
      const result = grade(this.analysis, this.state.answers);
      this.analysis.truthTable.forEach(row => columns(this.analysis).forEach(column => {
        const id = key(row, column), td = [...this.table.querySelectorAll('[data-answer-cell]')].find(cell => cell.dataset.answerCell === id);
        if (!td) return;
        const state = this.state.judged ? result.cells[id] : '';
        td.dataset.result = state;
        const button = td.querySelector('[data-practice-answer]'); button.setAttribute('aria-invalid', String(state === 'wrong'));
        button.setAttribute('aria-label', button.dataset.promptLabel + (state ? '、' + ({ correct: '正解', wrong: '不正解', empty: '未入力' })[state] : '')
          + (this.state.revealed ? '、正解 ' + row.outputs[column.id] : ''));
        const mark = td.querySelector('.practice-mark'); mark.textContent = state === 'correct' ? '○' : state === 'wrong' ? '×' : state === 'empty' ? '—' : '';
        const answer = td.querySelector('.practice-answer'); answer.hidden = !this.state.revealed;
        answer.textContent = this.state.revealed ? '正解 ' + row.outputs[column.id] : '';
      }));
      this.reveal.textContent = this.state.revealed ? '解答を隠す' : '解答を見る';
      this.reveal.setAttribute('aria-pressed', String(this.state.revealed));
      let text = this.state.judged ? '今回：' + result.correct + ' / ' + result.total + '点（' + result.percent + '%）' +
        (result.empty ? '、未入力 ' + result.empty + '欄' : '') : '入力済み ' + result.answered + ' / ' + result.total + '欄。判定後も直して再判定できます。';
      if (this.state.first) text += '　初回：' + this.state.first.correct + ' / ' + this.state.first.total + '点。';
      if (this.state.hadAnswer) text += '　解答確認後の判定は練習用です。';
      this.score.textContent = text;
    }
    textForCopy() {
      const analysis = this.analysis; if (!analysis?.valid) return '';
      return [[...analysis.inputs, ...columns(analysis).map(column => column.name)], ...analysis.truthTable.map(row => [
        ...analysis.inputs.map(name => row.inputs[name]),
        ...columns(analysis).map(column => this.state.mode === 'view' || this.state.revealed ? row.outputs[column.id] : this.state.answers[key(row, column)] || '')
      ])].map(row => row.join('\t')).join('\n');
    }
  }
  return Object.freeze({ grade, signature, fresh, restore, Panel });
});
