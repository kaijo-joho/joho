(function () {
  'use strict';

  const Core = window.CompressionCore;
  const Views = window.CompressionLessonViews;

  const stages = [
    { title: '頻度', description: '文字ごとの頻度と合計を表に入力します。' },
    { title: '木・符号と符号長', description: '丸を2つずつ結合して木を完成させ、木を判定します。その木から符号と符号長を表に入力します。' },
    { title: 'bit数と圧縮率', description: '文字ごとのbit数を求め、式ビルダーで圧縮前後のデータ量を確かめます。' },
    { title: '符号化と復元', description: '指定された文字列を符号化し、ビット列を文字へ復元します。' }
  ];
  const gradeLabels = ['頻度を判定', '符号・符号長を判定', 'bit数・圧縮率を判定', '符号化・復元を判定'];
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
    if (key.startsWith('code:') || key.startsWith('length:')) return 1;
    if (key.startsWith('bits:') || key === 'bitsTotal' || ['originalBits', 'compressedBits', 'rate'].includes(key)) return 2;
    return 3;
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
    const submit = one(root, 'button[type="submit"]');
    const reset = one(root, 'button[type="reset"]');
    if (!feedback || !table || !answerCards || !submit || !reset) throw new Error('段階式クイズに必要な既存要素が見つかりません。');

    const nav = make('div', 'cp-staged-nav');
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', '判定する項目');
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
    root.insertBefore(nav, tableScroll);
    root.insertBefore(panel, tableScroll);

    stages.forEach((stage, stageIndex) => {
      const button = make('button', 'dr-button cp-staged-tab', gradeLabels[stageIndex]);
      button.type = 'button';
      button.id = `${panelId}-tab-${stageIndex + 1}`;
      button.addEventListener('click', () => judgeSelected(stageIndex));
      nav.append(button);
    });

    const fields = all(root, '[data-cp-huffman-field]').map(input => {
      const key = input.dataset.cpHuffmanField;
      const wrapper = input.closest('label') || input.closest('td') || input;
      const fieldStage = stageFor(key);
      input.dataset.cpQuizStage = String(fieldStage);
      return { input, wrapper, key, stage: fieldStage, expected: answers[key], label: input.getAttribute('aria-label') || key };
    });

    let activeStage = 0;
    const valid = [false, false, false, false];
    const stageFeedback = ['', '', '', ''];
    const resized = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    const workspace = make('div', 'cp-quiz-workspace');
    const practiceRoot = make('div', 'cp-quiz-practice');
    practiceRoot.dataset.cpQuizPractice = '';
    practiceRoot.setAttribute('data-lesson-slide-navigation-lock', '');
    const treeHint = make('p', 'cp-hint', '表の頻度を入力し、「頻度を判定」を押すと木を組み立てられます。');
    const practiceFrequency = make('p', 'cp-hint');
    practiceFrequency.dataset.cpPracticeFrequency = '';
    const treeTitle = make('h5', '', '自分で木を組み立てる');
    quizTree.replaceChildren();
    quizTree.dataset.cpTree = '';
    const selection = make('p', 'cp-practice-selection');
    selection.dataset.cpPracticeSelection = '';
    const treeControls = make('div', 'cp-controls cp-enhancement');
    treeControls.hidden = true;
    for (const [key, label] of [['undo', '1つ戻る'], ['reset', '木を最初から'], ['judge', '木を判定']]) {
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
    tableArea.append(source, tableScroll);
    workspace.append(practiceRoot, tableArea);
    const codecPrompt = one(root, '[data-cp-quiz-codec-prompt]');
    panel.append(workspace, answerCards);
    if (codecPrompt) panel.append(codecPrompt);
    panel.append(submit.closest('.cp-controls'), feedback);
    let practice = null;
    let syncingTree = false;
    let formulaHost = null;
    let formulaMounted = false;
    let formulaBuilder = null;
    let formulaDefinition = null;

    function discardFormula() {
      if (formulaBuilder) formulaBuilder.destroy();
      formulaBuilder = null;
      formulaDefinition = null;
      formulaMounted = false;
    }
    function invalidateFrom(stage, clearInputs = false) {
      for (let later = stage; later < valid.length; later += 1) { valid[later] = false; stageFeedback[later] = ''; }
      fields.filter(field => field.stage >= stage).forEach(({ input }) => {
        input.removeAttribute('aria-invalid');
        if (clearInputs) input.value = '';
      });
      if (stage < 3) discardFormula();
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
      treeHint.textContent = show ? '丸を2つ選ぶと自動で結合します。結合済みの根を選んで「結合解除」で戻せます。途中では正誤を表示せず、完成後に「木を判定」で確認します。' : '表の頻度を入力し、「頻度を判定」を押すと木を組み立てられます。';
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
            onChange() { if (!syncingTree) clearAcceptedTree(); },
            onJudge: adoptTree
          });
        } finally { syncingTree = false; }
      }
    }
    const formulaReady = () => valid[0] && valid[1];
    const updateFormulaHost = () => {
      if (!formulaHost) return;
      formulaHost.hidden = !formulaReady();
      if (formulaReady()) mountFormula();
    };

    function showStage(next, focusPanel) {
      activeStage = next;
      root.dataset.cpQuizStage = String(next);
      feedback.textContent = stageFeedback[next];
      feedback.removeAttribute('data-result');
      heading.textContent = '表と木を使って解く';
      description.textContent = '頻度を判定して木を組み立てます。その木から符号・符号長・bit数を表へ入力し、計算と符号化・復元を確かめます。';
      tableScroll.hidden = false;
      practiceRoot.hidden = false;
      source.hidden = false;
      if (codecPrompt) codecPrompt.hidden = false;
      fields.forEach(field => {
        field.wrapper.hidden = ['originalBits', 'compressedBits', 'rate'].includes(field.key);
        field.input.hidden = false;
      });
      const formulaFields = answerCards.querySelectorAll('label');
      formulaFields.forEach(label => {
        const input = one(label, '[data-cp-huffman-field]');
        label.hidden = !input || ['originalBits', 'compressedBits', 'rate'].includes(input.dataset.cpHuffmanField);
      });
      updateFormulaHost();
      submit.textContent = 'すべて判定';
      submit.closest('.cp-controls').hidden = false;
      if (next === 2 && formulaReady()) mountFormula();
      if (focusPanel) panel.focus();
      resized();
    }

    const stageFields = number => fields.filter(field => field.stage === number && !(number === 2 && ['originalBits', 'compressedBits', 'rate'].includes(field.key)));
    const gradeStage = number => {
      if ((number === 1 || number === 3) && (!valid[0] || !acceptedCodes)) {
        valid[number] = false;
        feedback.dataset.result = 'incorrect';
        feedback.textContent = 'まず頻度を確かめ、自分で完成させた木を「木を判定」で確認してください。';
        stageFeedback[number] = feedback.textContent;
        resized();
        return false;
      }
      const current = stageFields(number);
      const complete = current.every(({ input }) => normalize(input.value) !== '');
      if (!complete) {
        current.forEach(({ input }) => input.setAttribute('aria-invalid', String(normalize(input.value) === '')));
        feedback.dataset.result = 'incorrect';
        feedback.textContent = `${stages[number].title}の入力欄をすべて埋めてから判定してください。`;
        valid[number] = false;
      } else {
        Views.gradeFields(current, feedback);
        valid[number] = current.every(({ input }) => input.getAttribute('aria-invalid') === 'false');
      }
      if (number === 3 && !formulaReady()) {
        valid[3] = false;
        feedback.textContent = '先に頻度・木・符号表を判定してください。復元するビット列はその木に合わせて表示します。';
      }
      if (number === 0) {
        showCounts(valid[0]);
      }
      if (number < 2) {
        if (!valid[number]) {
          for (let later = number + 1; later < valid.length; later += 1) { valid[later] = false; stageFeedback[later] = ''; }
        }
        updateFormulaHost();
      }
      if (number === 1) updateFormulaHost();
      if (number === 2) {
        const formulaCorrect = judgeFormula();
        valid[2] = valid[2] && formulaCorrect;
        if (valid[2]) feedback.textContent = 'bit数と圧縮率は正解です。bit数の表と、圧縮前後のbit数・圧縮率の式が合っています。';
        else if (!formulaCorrect) feedback.textContent += ' 圧縮前後のbit数・圧縮率の式と、途中の計算結果を確認してください。';
      }
      if (!valid[number]) {
        for (let later = number + 1; later < valid.length; later += 1) { valid[later] = false; stageFeedback[later] = ''; }
      }
      if (number !== 2) feedback.textContent = `${stages[number].title}：${feedback.textContent}`;
      stageFeedback[number] = feedback.textContent;
      feedback.dataset.result = valid[number] ? 'correct' : 'incorrect';
      resized();
      return valid[number];
    };

    function ensureFormulaHost() {
      if (formulaHost) return;
      formulaHost = make('div', 'cp-staged-formula');
      formulaHost.hidden = true;
      formulaHost.dataset.cpHuffmanFormula = String(index);
      const label = make('h5', '', '圧縮前後のbit数と圧縮率を式で確かめる');
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
        formulaBuilder = Builder.mount(formulaHost, formulaDefinition, {
          onJudge({ rowId, taskId, intermediate, draft }) {
            const judgment = intermediate
              ? formulas.gradeRow(formulaDefinition, draft, rowId)
              : formulas.grade(formulaDefinition, draft, { taskId });
            formulaBuilder.setFeedback(judgment);
          },
          onChange() {
            valid[2] = false;
            valid[3] = false;
            stageFeedback[2] = '式ビルダーの入力を変更しました。bit数と圧縮率をもう一度判定してください。';
            stageFeedback[3] = '';
            feedback.textContent = stageFeedback[activeStage];
            feedback.removeAttribute('data-result');
          }
        });
      } catch (error) {
        formulaMounted = false;
        console.error('ハフマン式ビルダーを初期化できませんでした。', error);
        feedback.textContent = '式ビルダーを読み込めませんでした。再読み込みしてからお試しください。';
      }
    }

    function judgeFormula() {
      const formulas = window.CompressionFormulas;
      if (!formulaReady() || !formulas || !formulaBuilder || !formulaDefinition) return false;
      try {
        const formulaJudgement = formulas.grade(formulaDefinition, formulaBuilder.getDraft());
        formulaBuilder.setFeedback(formulaJudgement);
        return formulaJudgement.status === 'judged' && formulaJudgement.formulaCorrect === true && formulaJudgement.answerCorrect === true
          && formulaJudgement.rows.every(row => row.calculationCorrect !== false);
      } catch (error) {
        console.error('ハフマン式ビルダーの式を判定できませんでした。', error);
        return false;
      }
    }

    function judgeSelected(number) {
      try {
        showStage(number, false);
        if (number === 2 && formulaReady()) mountFormula();
        return gradeStage(number);
      } catch (error) {
        feedback.dataset.result = 'incorrect';
        feedback.textContent = 'この項目を判定できませんでした。入力を確認して再度お試しください。';
        console.error(`ハフマン問題の${stages[number].title}を判定できませんでした。`, error);
        return false;
      }
    }
    root.addEventListener('submit', event => {
      event.preventDefault();
      for (let number = 0; number < stages.length; number += 1) if (!judgeSelected(number)) return;
      feedback.textContent = 'すべて正解です。頻度・符号表・計算・符号化・復元が合っています。';
    });
    root.addEventListener('input', event => {
      const input = event.target.closest && event.target.closest('[data-cp-huffman-field]');
      if (!input) return;
      const changedStage = stageFor(input.dataset.cpHuffmanField);
      input.removeAttribute('aria-invalid');
      feedback.textContent = '';
      feedback.removeAttribute('data-result');
      for (let later = changedStage; later < valid.length; later += 1) { valid[later] = false; stageFeedback[later] = ''; }
      if (changedStage === 0) {
        clearAcceptedTree();
        if (practice) {
          syncingTree = true;
          try { practice.reset(fixture); } finally { syncingTree = false; }
        }
        showCounts(false);
      }
      if (changedStage < 2) {
        discardFormula();
        updateFormulaHost();
      }
      resized();
    });
    root.addEventListener('reset', () => {
      window.setTimeout(() => {
        valid.fill(false);
        stageFeedback.fill('');
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
        showStage(0, false);
      }, 0);
    });

    Views.setupSteps(one(root, '[data-cp-huffman-solution]'), one(root, '[data-cp-huffman-solution-next]'), one(root, '[data-cp-huffman-solution-reset]'));
    all(root, '.cp-enhancement').forEach(element => { element.hidden = false; });
    clearAcceptedTree();
    showCounts(false);
    ensureFormulaHost();
    updateFormulaHost();
    showStage(0, false);
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
