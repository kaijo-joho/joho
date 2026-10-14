(function () {
  'use strict';

  const Core = window.CompressionCore;
  const Views = window.CompressionLessonViews;

  const stages = [
    { id: 'frequency', title: '頻度' }, { id: 'code', title: '符号' },
    { id: 'length', title: '符号長' }, { id: 'bits', title: 'bit数' },
    { id: 'encoded', title: '符号化' }, { id: 'decoded', title: '復元' }
  ];
  const one = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const normalize = value => Views.clean(value).replace(/％/g, '%');
  const stageFor = key => {
    if (key.startsWith('frequency:') || key === 'frequencyTotal') return 0;
    if (key.startsWith('code:')) return 1;
    if (key.startsWith('length:')) return 2;
    if (key.startsWith('bits:') || key === 'bitsTotal' || ['originalBits', 'compressedBits', 'rate'].includes(key)) return 3;
    return key === 'encoded' ? 4 : 5;
  };

  function expectedAnswers(fixture, tree) {
    const answers = {
      frequencyTotal: fixture.text.length,
      bitsTotal: tree.totalBits,
      originalBits: fixture.text.length * fixture.fixedBits,
      compressedBits: tree.totalBits,
      rate: Core.compressionRate(fixture.text.length * fixture.fixedBits, tree.totalBits),
      encoded: Core.encodeHuffman(fixture.encodeText, fixture.codes),
      decoded: Core.decodeHuffman(fixture.decodeBits, fixture.codes)
    };
    Object.keys(fixture.codes).forEach(symbol => {
      answers[`frequency:${symbol}`] = fixture.frequencies[symbol];
      answers[`code:${symbol}`] = fixture.codes[symbol];
      answers[`length:${symbol}`] = fixture.codes[symbol].length;
      answers[`bits:${symbol}`] = fixture.frequencies[symbol] * fixture.codes[symbol].length;
    });
    return answers;
  }

  function init(root) {
    const index = Number(root.dataset.cpStagedHuffmanQuiz);
    const fixture = Core.HUFFMAN_QUESTIONS[index];
    if (!fixture) throw new RangeError('ハフマン問題の番号が正しくありません。');

    const answers = expectedAnswers(fixture, Core.huffmanFromCodes(fixture.frequencies, fixture.codes));
    const decodedText = Core.decodeHuffman(fixture.decodeBits, fixture.codes);
    let acceptedCodes = null;
    const feedback = one(root, '[data-cp-huffman-feedback]');
    const tableScroll = one(root, '.cp-table-scroll');
    const table = tableScroll && one(tableScroll, 'table');
    const quizTree = one(root, '[data-cp-quiz-tree]');
    const answerCards = one(root, '.cp-answer-fields');
    const reset = one(root, 'button[type="reset"]');
    if (!feedback || !table || !answerCards || !reset) throw new Error('ハフマン問題に必要な既存要素が見つかりません。');
    const codecFeedback = [4, 5].map(number => one(root, `[data-cp-huffman-codec-feedback="${stages[number].id}"]`));
    const feedbackFor = number => number < 4 ? feedback : codecFeedback[number - 4];

    const nav = make('div', 'cp-quiz-column-controls');
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', '表の列を判定');
    const spacer = make('span');
    spacer.setAttribute('aria-hidden', 'true');
    nav.append(spacer);
    const columns = document.createElement('colgroup');
    for (let column = 0; column < 5; column += 1) columns.append(document.createElement('col'));
    table.insertBefore(columns, table.tHead);
    const panel = make('section', 'cp-staged-panel');
    const panelId = `cp-huffman-stage-${index}-panel`;
    panel.id = panelId;
    panel.setAttribute('role', 'region');
    panel.tabIndex = -1;
    const heading = make('h4', 'cp-staged-title');
    heading.id = `${panelId}-title`;
    panel.setAttribute('aria-labelledby', heading.id);
    const description = make('p', 'cp-staged-description');
    panel.append(heading, description);
    root.insertBefore(panel, tableScroll);

    stages.slice(0, 4).forEach((stage, stageIndex) => {
      const button = make('button', 'dr-button cp-quiz-column-judge', '判定');
      button.type = 'button';
      button.setAttribute('aria-label', `${stage.title}を判定`);
      button.dataset.cpHuffmanJudge = stage.id;
      button.addEventListener('click', () => judgeSelected(stageIndex));
      nav.append(button);
    });
    for (const number of [4, 5]) {
      one(root, `[data-cp-huffman-judge="${stages[number].id}"]`).addEventListener('click', () => judgeSelected(number));
    }

    const fields = all(root, '[data-cp-huffman-field]').map(input => {
      const key = input.dataset.cpHuffmanField;
      const wrapper = input.closest('label') || input.closest('td') || input;
      const fieldStage = stageFor(key);
      input.dataset.cpQuizStage = String(fieldStage);
      return { input, wrapper, key, stage: fieldStage, expected: answers[key], label: input.getAttribute('aria-label') || key };
    });

    const valid = stages.map(() => false);
    const resized = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    const workspace = make('div', 'cp-quiz-workspace');
    const practiceRoot = make('div', 'cp-quiz-practice');
    practiceRoot.dataset.cpQuizPractice = '';
    practiceRoot.setAttribute('data-lesson-slide-navigation-lock', '');
    const treeHint = make('p', 'cp-hint', '表の頻度を入力し、頻度列の「判定」を押すと木を組み立てられます。');
    const practiceFrequency = make('p', 'cp-hint');
    practiceFrequency.dataset.cpPracticeFrequency = '';
    const treeTitle = make('h5', '', '自分で木を組み立てる');
    quizTree.replaceChildren();
    quizTree.dataset.cpTree = '';
    const selection = make('p', 'cp-practice-selection');
    selection.dataset.cpPracticeSelection = '';
    const treeControls = make('div', 'cp-controls cp-enhancement');
    treeControls.hidden = true;
    for (const [key, label] of [['undo', '1つ戻る'], ['reset', '木を作り直す'], ['judge', '木を判定']]) {
      const button = make('button', 'dr-button', label);
      button.type = 'button';
      button.dataset[`cpPractice${key[0].toUpperCase()}${key.slice(1)}`] = '';
      treeControls.append(button);
    }
    const treeStatus = make('p', 'cp-feedback');
    treeStatus.dataset.cpBuildStatus = '';
    treeStatus.setAttribute('role', 'status');
    const codes = make('div', 'cp-codes');
    codes.dataset.cpCodes = '';
    practiceRoot.append(treeTitle, treeHint, practiceFrequency, quizTree, selection, treeControls, treeStatus, codes);
    const tableArea = make('div', 'cp-quiz-table-area');
    const source = make('p', 'cp-quiz-source');
    source.append(make('span', '', '元の文字列'), make('strong', '', one(root, '[data-cp-quiz-source]')?.textContent || fixture.text));
    const tableHint = make('p', 'cp-hint cp-quiz-table-hint', '表の入力欄は ↑ ↓ ← → キーで移動できます。');
    tableHint.id = `${panelId}-table-hint`;
    all(table, 'input[data-cp-huffman-field]').forEach(input => {
      input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), tableHint.id].filter(Boolean).join(' '));
    });
    table.addEventListener('keydown', event => {
      const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const step = steps[event.key];
      const input = event.target.closest?.('input[data-cp-huffman-field]');
      if (!step || !input || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      const cell = input.closest('td');
      const row = cell?.parentElement;
      if (!row || row.parentElement.tagName !== 'TBODY') return;
      const rows = [...row.parentElement.rows];
      let rowIndex = rows.indexOf(row);
      let column = cell.cellIndex;
      event.preventDefault();
      event.stopPropagation();
      while (true) {
        rowIndex += step[0];
        column += step[1];
        if (rowIndex < 0 || rowIndex >= rows.length || column < 0 || column >= rows[rowIndex].cells.length) break;
        const target = one(rows[rowIndex].cells[column], 'input[data-cp-huffman-field]:not([disabled])');
        if (!target || target.hidden) continue;
        target.focus();
        target.select();
        break;
      }
    });
    tableScroll.append(nav);
    tableArea.append(source, tableScroll, feedback, tableHint);
    workspace.append(practiceRoot, tableArea);
    panel.append(workspace, answerCards, reset.closest('.cp-controls'));
    let practice = null;
    let syncingTree = false;
    let formulaHost = null;
    let formulaMounted = false;
    let formulaBuilder = null;
    let formulaDefinition = null;
    let pendingFormulaDraft = null;

    function discardFormula(preserveDraft = false) {
      if (preserveDraft && formulaBuilder) pendingFormulaDraft = formulaBuilder.getDraft();
      else if (!preserveDraft) pendingFormulaDraft = null;
      if (formulaBuilder) formulaBuilder.destroy();
      formulaBuilder = null;
      formulaDefinition = null;
      formulaMounted = false;
    }
    function invalidateFrom(stage, clearInputs = false) {
      for (let later = stage; later < valid.length; later += 1) {
        valid[later] = false;
        feedbackFor(later).textContent = '';
        feedbackFor(later).removeAttribute('data-result');
      }
      fields.filter(field => field.stage >= stage).forEach(({ input }) => {
        input.removeAttribute('aria-invalid');
        if (clearInputs) input.value = '';
      });
      if (stage < 4) discardFormula();
      feedback.textContent = '';
      feedback.removeAttribute('data-result');
    }
    function clearAcceptedTree() {
      const hadAcceptedTree = acceptedCodes !== null;
      acceptedCodes = null;
      const decodeBits = one(root, '[data-cp-quiz-decode-bits]');
      if (decodeBits) decodeBits.textContent = '（木を判定すると表示します）';
      invalidateFrom(1, hadAcceptedTree);
      updateFormulaHost();
    }
    function adoptTree(judgment, state) {
      if (judgment.correct && state.complete) {
        const unchanged = acceptedCodes && Object.keys(state.codes).every(symbol => acceptedCodes[symbol] === state.codes[symbol]);
        if (!unchanged) invalidateFrom(1);
        acceptedCodes = { ...state.codes };
        const chosenFixture = { ...fixture, codes: acceptedCodes, decodeBits: Core.encodeHuffman(decodedText, acceptedCodes) };
        Object.assign(answers, expectedAnswers(chosenFixture, Core.huffmanFromCodes(fixture.frequencies, acceptedCodes)));
        fields.forEach(field => { field.expected = answers[field.key]; });
        const decodeBits = one(root, '[data-cp-quiz-decode-bits]');
        if (decodeBits) decodeBits.textContent = chosenFixture.decodeBits;
        treeHint.textContent = 'この木の符号を表へ入力してください。先に選んだ丸が左の0、後に選んだ丸が右の1です。';
      } else clearAcceptedTree();
      resized();
    }
    function showCounts(show) {
      treeHint.textContent = show ? '丸を2つ選ぶと自動で結合します。結合済みの根を選んで「結合解除」で戻せます。途中では正誤を表示せず、完成後に「木を判定」で確認します。' : '表の頻度を入力し、頻度列の「判定」を押すと木を組み立てられます。';
      quizTree.hidden = false;
      practiceFrequency.hidden = !show;
      selection.hidden = !show;
      treeStatus.hidden = !show;
      codes.hidden = !show;
      treeControls.hidden = !show;
      if (!show) {
        const letters = Object.keys(fixture.frequencies);
        Views.renderTree(quizTree, letters.map(symbol => ({ id: symbol, prefix: '', symbol, count: 0 })), {
          hideCounts: true, hideBits: true, leafOrder: letters, reservedDepth: letters.length - 1
        });
        return;
      }
      if (!window.CompressionPractice?.mount) throw new Error('ハフマン木の練習を読み込めませんでした。');
      if (!practice) {
        syncingTree = true;
        try {
          practice = window.CompressionPractice.mount(practiceRoot, {
            fixture,
            sortLeavesByFrequency: true,
            onChange() { if (!syncingTree) clearAcceptedTree(); },
            onJudge: adoptTree
          });
        } finally { syncingTree = false; }
      }
    }
    const codeReady = () => valid[0] && valid[1] && valid[2];
    const tableTotal = () => {
      const raw = normalize(fields.find(field => field.key === 'bitsTotal').input.value);
      return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
    };
    const formulaReady = () => codeReady() && tableTotal() !== null;
    const updateFormulaHost = () => {
      if (!formulaHost) return;
      formulaHost.hidden = !formulaReady();
      if (formulaReady()) mountFormula();
    };

    const stageFields = number => fields.filter(field => field.stage === number && !['originalBits', 'compressedBits', 'rate'].includes(field.key));
    function gradeStage(number) {
      const output = feedbackFor(number);
      let message;
      if (number > 0 && (!valid[0] || !acceptedCodes)) {
        valid[number] = false;
        message = 'まず頻度の列を判定し、自分で完成させた木を「木を判定」で確認してください。';
      } else if (number >= 3 && !codeReady()) {
        valid[number] = false;
        message = '先に符号と符号長の列を判定してください。';
      } else {
        const current = stageFields(number);
        const complete = current.every(({ input }) => normalize(input.value) !== '');
        if (!complete) {
          current.forEach(({ input }) => input.setAttribute('aria-invalid', String(normalize(input.value) === '')));
          valid[number] = false;
          message = '入力欄をすべて埋めてから判定してください。';
        } else {
          Views.gradeFields(current, output);
          valid[number] = current.every(({ input }) => input.getAttribute('aria-invalid') === 'false');
          message = output.textContent;
        }
      }
      if (number === 0) {
        if (!valid[0]) clearAcceptedTree();
        showCounts(valid[0]);
      } else if ((number === 1 || number === 2) && !valid[number]) {
        invalidateFrom(3);
      }
      output.textContent = `${stages[number].title}：${message}`;
      output.dataset.result = valid[number] ? 'correct' : 'incorrect';
      updateFormulaHost();
      resized();
      return valid[number];
    }

    function ensureFormulaHost() {
      if (formulaHost) return;
      formulaHost = make('div', 'cp-staged-formula');
      formulaHost.hidden = true;
      formulaHost.dataset.cpHuffmanFormula = String(index);
      const label = make('h5', '', '圧縮前のbit数と圧縮率を式で確かめる');
      formulaHost.append(label);
      panel.insertBefore(formulaHost, answerCards);
    }

    function mountFormula() {
      const formulas = window.CompressionFormulas;
      const Builder = window.LessonFormulaBuilder;
      ensureFormulaHost();
      if (!formulas || typeof formulas.defineHuffman !== 'function' || !Builder || typeof Builder.mount !== 'function') return;
      if (!formulaReady() || formulaMounted) return;
      formulaMounted = true;
      try {
        formulaDefinition = formulas.defineHuffman(index, { codes: acceptedCodes });
        // Show the student's table total, without supplying the correct answer.
        formulaDefinition.quantities.find(item => item.id === 'compressedBits').value = String(tableTotal());
        formulaBuilder = Builder.mount(formulaHost, formulaDefinition, {
          onJudge({ rowId, taskId, intermediate, draft }) {
            const judgment = intermediate
              ? formulas.gradeRow(formulaDefinition, draft, rowId)
              : formulas.grade(formulaDefinition, draft, { taskId });
            formulaBuilder.setFeedback(judgment);
          }
        });
        if (pendingFormulaDraft) {
          formulaBuilder.setDraft(pendingFormulaDraft);
          pendingFormulaDraft = null;
        }
      } catch (error) {
        formulaMounted = false;
        console.error('ハフマン式ビルダーを初期化できませんでした。', error);
        feedback.textContent = '式ビルダーを読み込めませんでした。再読み込みしてからお試しください。';
      }
    }

    function judgeSelected(number) {
      try {
        root.dataset.cpQuizStage = String(number);
        return gradeStage(number);
      } catch (error) {
        const output = feedbackFor(number);
        output.dataset.result = 'incorrect';
        output.textContent = 'この項目を判定できませんでした。入力を確認して再度お試しください。';
        console.error(`ハフマン問題の${stages[number].title}を判定できませんでした。`, error);
        return false;
      }
    }
    root.addEventListener('submit', event => event.preventDefault());
    root.addEventListener('keydown', event => {
      const input = event.target.closest?.('input[data-cp-huffman-field]');
      if (event.key !== 'Enter' || event.isComposing || !input || input.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      judgeSelected(stageFor(input.dataset.cpHuffmanField));
    });
    root.addEventListener('input', event => {
      const input = event.target.closest?.('[data-cp-huffman-field]');
      if (!input) return;
      const changedStage = stageFor(input.dataset.cpHuffmanField);
      const output = feedbackFor(changedStage);
      input.removeAttribute('aria-invalid');
      output.textContent = '';
      output.removeAttribute('data-result');
      valid[changedStage] = false;
      if (changedStage === 0) {
        clearAcceptedTree();
        if (practice) {
          syncingTree = true;
          try { practice.reset(fixture); } finally { syncingTree = false; }
        }
        showCounts(false);
      } else if (changedStage === 1 || changedStage === 2) {
        invalidateFrom(3);
        updateFormulaHost();
      } else if (input.dataset.cpHuffmanField === 'bitsTotal') {
        discardFormula(true);
        updateFormulaHost();
      }
      resized();
    });
    root.addEventListener('reset', () => {
      window.setTimeout(() => {
        valid.fill(false);
        clearAcceptedTree();
        if (practice) {
          syncingTree = true;
          try { practice.reset(fixture); } finally { syncingTree = false; }
        }
        fields.forEach(({ input }) => { input.removeAttribute('aria-invalid'); });
        feedback.textContent = '';
        feedback.removeAttribute('data-result');
        showCounts(false);
        updateFormulaHost();
        resized();
      }, 0);
    });

    Views.setupSteps(one(root, '[data-cp-huffman-solution]'), one(root, '[data-cp-huffman-solution-next]'), one(root, '[data-cp-huffman-solution-reset]'));
    all(root, '.cp-enhancement').forEach(element => { element.hidden = false; });
    clearAcceptedTree();
    showCounts(false);
    ensureFormulaHost();
    updateFormulaHost();
    heading.textContent = '表と木を使って解く';
    description.textContent = '頻度を判定して木を組み立てます。その木から符号・符号長・bit数を表へ入力し、各列の下で判定します。';
    fields.forEach(field => { field.wrapper.hidden = ['originalBits', 'compressedBits', 'rate'].includes(field.key); });
    resized();
  }

  function initialize() {
    document.querySelectorAll('[data-cp-string-rate-formula]').forEach(host => {
      try {
        const formulas = window.CompressionFormulas;
        const Builder = window.LessonFormulaBuilder;
        if (!formulas || typeof formulas.defineRleRate !== 'function' || !Builder || typeof Builder.mount !== 'function') {
          throw new Error('共通の式ビルダーを読み込めませんでした。');
        }
        const definition = formulas.defineRleRate();
        let builder;
        builder = Builder.mount(host, definition, {
          onJudge({ rowId, taskId, intermediate, draft }) {
            builder.setFeedback(intermediate
              ? formulas.gradeRow(definition, draft, rowId)
              : formulas.grade(definition, draft, { taskId }));
          }
        });
        const form = host.closest('form');
        if (form) form.addEventListener('reset', () => builder.reset(definition));
      } catch (error) {
        console.error('ランレングス法の圧縮率式を初期化できませんでした。', error);
      }
    });
    document.querySelectorAll('[data-cp-staged-huffman-quiz]').forEach(root => {
      try {
        if (!Core || !Views) throw new Error('ハフマン問題の共通処理を読み込めませんでした。');
        init(root);
      }
      catch (error) { console.error('段階式ハフマン問題を初期化できませんでした。', error); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
