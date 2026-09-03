(function () {
  'use strict';

  const SINGLE_PROBLEMS = [
    { type: 'singleOutput', level: 1, structureExpr: 'A-B', inputs: { A: 1, B: 0 } },
    { type: 'singleOutput', level: 1, structureExpr: 'A_B', inputs: { A: 0, B: 1 } },
    { type: 'singleOutput', level: 1, structureExpr: 'A^B', inputs: { A: 1, B: 1 } },
    { type: 'singleOutput', level: 1, structureExpr: 'nA', inputs: { A: 0 } },
    { type: 'singleOutput', level: 2, structureExpr: '(A-B)_C', inputs: { A: 1, B: 0, C: 1 } },
    { type: 'singleOutput', level: 2, structureExpr: 'n(A_B)', inputs: { A: 0, B: 0 } },
    { type: 'singleOutput', level: 2, structureExpr: '(A^B)-C', inputs: { A: 0, B: 1, C: 1 } },
    { type: 'singleOutput', level: 3, structureExpr: 'n((A-B)_C)', inputs: { A: 1, B: 1, C: 0 } },
    { type: 'singleOutput', level: 3, structureExpr: '(nA-B)_(A-nB)', inputs: { A: 1, B: 0 } }
  ];

  const TABLE_PROBLEMS = [
    { type: 'truthTable', level: 1, structureExpr: 'A-B' },
    { type: 'truthTable', level: 1, structureExpr: 'A_B' },
    { type: 'truthTable', level: 1, structureExpr: 'A^B' },
    { type: 'truthTable', level: 1, structureExpr: 'nA' },
    { type: 'truthTable', level: 2, structureExpr: 'n(A-B)' },
    { type: 'truthTable', level: 2, structureExpr: '(A-B)_C' },
    { type: 'truthTable', level: 2, structureExpr: 'A-(B_C)' },
    { type: 'truthTable', level: 3, structureExpr: '(A^B)-nC' }
  ];

  const BUILD_PROBLEMS = [
    { type: 'buildCircuit', level: 1, structureExpr: 'A-B', hint: '基本ゲート1個で作れます。' },
    { type: 'buildCircuit', level: 1, structureExpr: 'A_B', hint: '基本ゲート1個で作れます。' },
    { type: 'buildCircuit', level: 2, structureExpr: 'A^B', hint: 'XOR専用ゲートは使わず、AND・OR・NOTを組み合わせます。' },
    { type: 'buildCircuit', level: 2, structureExpr: 'n(A-B)', hint: 'ANDの結果を反転する回路です。' },
    { type: 'buildCircuit', level: 2, structureExpr: 'n(A_B)', hint: 'ORの結果を反転する回路です。' },
    { type: 'buildCircuit', level: 2, structureExpr: '(A-B)_C', hint: '3入力・2段の回路です。' },
    { type: 'buildCircuit', level: 3, structureExpr: '(nA-B)_(A-nB)', hint: '同じ真理値表を作れれば、回路の形は問いません。' }
  ];

  function chooseProblem(pool, previousExpression) {
    const candidates = pool.filter(item => item.structureExpr !== previousExpression);
    return candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setFeedback(target, message, kind) {
    target.className = `logic-feedback${kind ? ` is-${kind}` : ''}`;
    target.textContent = message;
  }

  function initialize() {
    if (!byId('logic-quiz-tabs') || !window.LogicCore) return;

    const Core = window.LogicCore;
    const Renderer = window.LogicRenderer;
    const Widgets = window.LogicWidgets;
    const score = { attempted: 0, correct: 0 };
    const state = {
      single: null,
      table: null,
      build: null,
      last: { single: '', table: '', build: '' }
    };
    let buildEditor = null;

    function updateScore() {
      document.querySelectorAll('[data-logic-score]').forEach(output => {
        output.textContent = `解答 ${score.attempted}問 ／ 正解 ${score.correct}問`;
      });
    }

    function record(result, correct) {
      if (!result.counted) {
        result.counted = true;
        score.attempted += 1;
      }
      if (correct && !result.recordedCorrect) {
        result.recordedCorrect = true;
        score.correct += 1;
      }
      updateScore();
    }

    function renderSingleProblem() {
      const result = state.single;
      const analysis = result.analysis;
      const prompt = byId('single-prompt');
      prompt.replaceChildren();
      const text = document.createElement('div');
      text.textContent = `次の回路について、入力が下の値のとき、出力Fはいくつですか？（Level ${result.problem.level}）`;
      const inputList = document.createElement('div');
      inputList.className = 'logic-prompt__inputs';
      analysis.inputs.forEach(name => {
        const bit = document.createElement('span');
        bit.className = 'logic-prompt__bit';
        bit.textContent = `${name} = ${result.problem.inputs[name]}`;
        inputList.appendChild(bit);
      });
      prompt.append(text, inputList);
      Renderer.renderCircuit(byId('single-circuit'), analysis.ast, {
        inputs: result.problem.inputs,
        showSignals: result.answered,
        title: result.answered ? '解説用の信号値つき回路図' : '出力値を求める問題の回路図',
        description: result.answered
          ? '入力値と各配線の信号、中間ゲートの出力、最終出力Fを表示しています。'
          : '回答前のため信号値を隠した論理回路図です。'
      });
      document.querySelectorAll('[data-single-answer]').forEach(button => {
        button.disabled = result.answered;
      });
    }

    function newSingleProblem() {
      const problem = chooseProblem(SINGLE_PROBLEMS, state.last.single);
      state.last.single = problem.structureExpr;
      state.single = {
        problem,
        analysis: Core.parseAndAnalyze(problem.structureExpr),
        answered: false,
        counted: false
      };
      setFeedback(byId('single-feedback'), '0または1を選んでください。', '');
      renderSingleProblem();
    }

    document.querySelectorAll('[data-single-answer]').forEach(button => {
      button.addEventListener('click', () => {
        const result = state.single;
        if (!result || result.answered) return;
        result.answered = true;
        const answer = Number(button.dataset.singleAnswer);
        const correctAnswer = Core.evaluate(result.analysis.ast, result.problem.inputs);
        const correct = answer === correctAnswer;
        record(result, correct);
        setFeedback(
          byId('single-feedback'),
          correct
            ? `正解です。F = ${correctAnswer} です。配線上の数字を順に確認しましょう。`
            : `不正解です。正しい出力は F = ${correctAnswer} です。中間値を追って確認しましょう。`,
          correct ? 'correct' : 'wrong'
        );
        renderSingleProblem();
      });
    });
    byId('single-next').addEventListener('click', newSingleProblem);

    function renderTableCircuit() {
      const result = state.table;
      Renderer.renderCircuit(byId('table-circuit'), result.analysis.ast, {
        inputs: result.activeInputs || {},
        showSignals: result.judged && Boolean(result.activeInputs),
        title: result.judged && result.activeInputs ? '選択した行の信号値つき回路図' : '真理値表を完成させる問題の回路図',
        description: result.judged && result.activeInputs
          ? '選択した真理値表の行について、各配線の信号を表示しています。'
          : '判定前のため信号値を隠した論理回路図です。'
      });
    }

    function renderTableAnswers() {
      const result = state.table;
      Widgets.renderTruthTable(byId('table-answer-grid'), {
        inputNames: result.analysis.inputs,
        rows: result.analysis.truthTable,
        editableValues: result.answers,
        judged: result.judged,
        activeInputs: result.activeInputs,
        selectAfterJudgement: true,
        caption: result.judged
          ? '判定結果（行を選ぶと信号を確認できます）'
          : '真理値表を完成させてください',
        hoverHint: result.judged
          ? ''
          : '未入力の−に触れると0と1を選べます。入力後はクリックで切り替え、長押しで未入力にも戻せます',
        onAnswerChange: (index, value) => {
          result.answers[index] = value;
        },
        onRowSelect: inputs => {
          result.activeInputs = inputs;
          renderTableAnswers();
          renderTableCircuit();
        }
      });
    }

    function newTableProblem() {
      const problem = chooseProblem(TABLE_PROBLEMS, state.last.table);
      state.last.table = problem.structureExpr;
      const analysis = Core.parseAndAnalyze(problem.structureExpr);
      state.table = {
        problem,
        analysis,
        answers: analysis.truthTable.map(() => null),
        activeInputs: null,
        judged: false,
        counted: false
      };
      byId('table-question-text').textContent =
        `回路を読み取り、F列をすべて完成させてください。（Level ${problem.level}）`;
      byId('table-judge').disabled = false;
      setFeedback(byId('table-feedback'), 'F欄をすべて0または1で埋めます。操作方法はF列のⓘに触れると確認できます。', '');
      renderTableCircuit();
      renderTableAnswers();
    }

    byId('table-judge').addEventListener('click', () => {
      const result = state.table;
      if (!result || result.judged) return;
      result.judged = true;
      result.activeInputs = { ...result.analysis.truthTable[0].inputs };
      const correct = result.answers.every((answer, index) => answer === result.analysis.truthTable[index].output);
      const unanswered = result.answers.filter(value => value == null).length;
      record(result, correct);
      byId('table-judge').disabled = true;
      setFeedback(
        byId('table-feedback'),
        correct
          ? '全セル正解です。表の行を選び、回路上で信号の流れを確認できます。'
          : `正解ではないセルがあります${unanswered ? `（未回答 ${unanswered}セル）` : ''}。色と各セルの表示を確認し、行を選んで回路を確かめましょう。`,
        correct ? 'correct' : 'wrong'
      );
      renderTableCircuit();
      renderTableAnswers();
    });
    byId('table-next').addEventListener('click', newTableProblem);

    function updateBuildCandidate(editorState) {
      const target = state.build;
      if (!target) return;
      const analysis = Core.graphAnalysis(editorState.graph, target.analysis.inputs);
      byId('build-judge').disabled = !analysis.valid;
    }

    function newBuildProblem() {
      const problem = chooseProblem(BUILD_PROBLEMS, state.last.build);
      state.last.build = problem.structureExpr;
      const analysis = Core.parseAndAnalyze(problem.structureExpr);
      state.build = { problem, analysis, counted: false, solved: false };
      byId('build-question-text').textContent =
        `次の真理値表と同じ働きをする回路を組み立ててください。（Level ${problem.level}） ${problem.hint}`;
      Widgets.renderTruthTable(byId('build-target-table'), {
        inputNames: analysis.inputs,
        rows: analysis.truthTable,
        caption: '目標の真理値表'
      });
      if (buildEditor) buildEditor.destroy();
      buildEditor = new window.LogicEditor(byId('build-editor'), {
        inputNames: analysis.inputs,
        onChange: updateBuildCandidate
      });
      byId('build-judge').disabled = true;
      setFeedback(
        byId('build-feedback'),
        '回路をFまで完成させると判定できます。回路の形ではなく、真理値表が一致すれば正解です。',
        ''
      );
      window.logicQuizBuildEditor = buildEditor;
    }

    byId('build-judge').addEventListener('click', () => {
      const result = state.build;
      if (!result || !buildEditor) return;
      const candidate = buildEditor.getAnalysis(result.analysis.inputs);
      if (!candidate.valid) {
        setFeedback(byId('build-feedback'), `回路が完成していません：${candidate.errors[0]}`, 'info');
        return;
      }
      const correct = candidate.truthCode === result.analysis.truthCode;
      record(result, correct);
      if (correct) result.solved = true;
      setFeedback(
        byId('build-feedback'),
        correct
          ? '正解です。作成した回路の真理値表が目標と一致しました。'
          : 'まだ一致しません。入力の組み合わせごとの出力Fを見直し、回路を修正して再判定しましょう。',
        correct ? 'correct' : 'wrong'
      );
    });
    byId('build-next').addEventListener('click', newBuildProblem);

    const tabs = Array.from(document.querySelectorAll('[role="tab"][data-mode]'));
    function activateTab(mode, focus = false) {
      tabs.forEach(tab => {
        const active = tab.dataset.mode === mode;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
        if (focus && active) tab.focus();
      });
      document.querySelectorAll('.logic-quiz-panel').forEach(panel => {
        panel.hidden = panel.dataset.panel !== mode;
      });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.mode));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === 'ArrowRight' ? 1 : -1;
        const next = tabs[(index + offset + tabs.length) % tabs.length];
        activateTab(next.dataset.mode, true);
      });
    });

    updateScore();
    newSingleProblem();
    newTableProblem();
    newBuildProblem();
    activateTab('single');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
