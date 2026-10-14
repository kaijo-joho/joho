(function () {
  'use strict';

  const Core = window.CompressionCore;
  if (!Core) return;
  const one = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const number = value => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value);
  const clean = value => value.normalize('NFKC').replace(/[\s・,、]/g, '').toUpperCase();
  const controls = root => all(root, '.cp-enhancement').forEach(element => { element.hidden = false; });
  const rateText = result => `${result.before}文字 → ${result.after}文字：${result.after} ÷ ${result.before} × 100 ＝ ${number(Core.compressionRate(result.before, result.after))}%`;

  function setupSteps(container, next, reset) {
    if (!container || !next || !reset) return;
    const items = all(container, ':scope > li');
    let count = 1;
    const render = () => {
      items.forEach((item, index) => { item.hidden = index >= count; });
      next.disabled = count >= items.length;
      reset.disabled = count <= 1;
    };
    next.addEventListener('click', () => { count = Math.min(count + 1, items.length); render(); });
    reset.addEventListener('click', () => { count = 1; render(); });
    render();
  }

  function setupStringRle(root) {
    const input = one(root, '[data-cp-rle-edit]');
    const before = one(root, '[data-cp-rle-original]');
    const after = one(root, '[data-cp-rle-compressed]');
    const beforeCount = one(root, '[data-cp-rle-before-count]');
    const afterCount = one(root, '[data-cp-rle-after-count]');
    const status = one(root, '[data-cp-rle-step]');
    const rate = one(root, '[data-cp-rle-rate]');
    const numerator = one(root, '[data-cp-rle-numerator]');
    const denominator = one(root, '[data-cp-rle-denominator]');
    const rateAnswer = one(root, '[data-cp-rle-rate-answer]');
    const arrow = one(root, '[data-cp-rle-arrow]');
    const next = one(root, '[data-cp-rle-next]');
    const toggle = one(root, '[data-cp-rle-edit-toggle]');
    const editor = one(root, '[data-cp-rle-editor]');
    const apply = one(root, '[data-cp-rle-apply]');
    const cancel = one(root, '[data-cp-rle-cancel]');
    const editStatus = one(root, '[data-cp-rle-edit-status]');
    if (![input, before, after, status, rate, numerator, denominator, rateAnswer, arrow, next, toggle, editor, apply, cancel, editStatus].every(Boolean)) return;

    let source = input.value.normalize('NFKC').toUpperCase();
    let step = 0;
    let showAnswer = false;
    let busy = false;
    let timer;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isVisible = () => !document.hidden && root.getClientRects().length > 0;
    const stopWipe = () => {
      clearTimeout(timer);
      timer = undefined;
      busy = false;
      arrow.classList.remove('is-wiping');
    };
    const validValue = value => /^[A-Z]{1,40}$/.test(value.normalize('NFKC').toUpperCase());
    const closeEditor = returnFocus => {
      input.value = source;
      input.setAttribute('aria-invalid', 'false');
      editStatus.textContent = 'A〜Zを1〜40文字で入力してください。';
      editor.hidden = true;
      before.hidden = false;
      if (beforeCount) beforeCount.hidden = false;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      toggle.setAttribute('aria-expanded', 'false');
      render();
      if (returnFocus) toggle.focus();
    };
    const render = () => {
      before.replaceChildren();
      after.replaceChildren();
      const result = Core.encodeRle(source);
      result.runs.forEach((run, index) => {
        before.append(make('span', run.value.repeat(run.count), index === (busy ? step : step - 1) ? 'is-current' : ''));
        if (index < step) after.append(make('span', run.encoded, index === step - 1 ? 'is-current' : ''));
      });
      if (beforeCount) beforeCount.textContent = `（${result.before}文字）`;
      const complete = step === result.runs.length;
      if (afterCount) afterCount.textContent = complete ? `（${result.after}文字）` : '';
      const run = result.runs[busy ? step : step - 1];
      status.textContent = busy ? `${run.value}が${run.count}回続くまとまりを圧縮しています。`
        : run ? `${run.value}が${run.count}回続く → ${run.encoded}${complete ? '。圧縮完了。' : ''}`
          : '「次へ」で、同じ文字のまとまりを順に圧縮します。';
      rate.hidden = !complete;
      numerator.textContent = `${result.after}文字`;
      denominator.textContent = `${result.before}文字`;
      numerator.parentElement.setAttribute('aria-label', `圧縮後${result.after}文字を圧縮前${result.before}文字で割る`);
      rateAnswer.hidden = !showAnswer;
      rateAnswer.textContent = showAnswer ? `＝ ${number(Core.compressionRate(result.before, result.after))}%` : '';
      next.disabled = busy || !editor.hidden || showAnswer;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    };
    const finishWipe = () => {
      if (!busy) return;
      const visible = isVisible();
      stopWipe();
      if (visible) step += 1;
      render();
    };
    const validateInput = () => {
      const normalized = input.value.normalize('NFKC').toUpperCase();
      const valid = validValue(input.value);
      input.setAttribute('aria-invalid', String(!valid));
      apply.disabled = !valid;
      editStatus.textContent = valid
        ? 'この文字列を適用できます。'
        : `A〜Zの文字を1〜40文字で入力してください（現在${[...normalized].length}文字）。`;
      return { valid, normalized };
    };
    const openEditor = () => {
      stopWipe();
      input.value = source;
      input.setAttribute('aria-invalid', 'false');
      apply.disabled = false;
      editStatus.textContent = 'A〜Zを1〜40文字で入力してください。';
      editor.hidden = false;
      before.hidden = true;
      if (beforeCount) beforeCount.hidden = true;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      toggle.setAttribute('aria-expanded', 'true');
      render();
      input.focus();
      input.select();
    };
    const applyInput = () => {
      const { valid, normalized } = validateInput();
      if (!valid) {
        input.focus();
        return;
      }
      source = normalized;
      step = 0;
      showAnswer = false;
      stopWipe();
      closeEditor(true);
    };

    input.addEventListener('input', validateInput);
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        applyInput();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor(true);
      }
    });
    toggle.addEventListener('click', () => {
      if (editor.hidden) openEditor();
      else closeEditor(false);
    });
    apply.addEventListener('click', applyInput);
    cancel.addEventListener('click', () => closeEditor(true));
    next.addEventListener('click', () => {
      if (next.disabled || !isVisible()) return;
      if (step === Core.encodeRle(source).runs.length) {
        showAnswer = true;
        render();
      } else if (motion.matches) {
        step += 1;
        render();
      } else {
        busy = true;
        arrow.classList.add('is-wiping');
        render();
        // animationend is the normal completion; the timer also handles suppressed animations.
        timer = setTimeout(finishWipe, 650);
      }
    });
    arrow.addEventListener('animationend', event => {
      if (event.animationName === 'cp-rle-arrow-wipe') finishWipe();
    });
    one(root, '[data-cp-rle-reset]').addEventListener('click', () => {
      stopWipe(); step = 0; showAnswer = false; render();
    });
    const pauseHidden = () => {
      if (busy && !isVisible()) { stopWipe(); render(); }
    };
    document.addEventListener('visibilitychange', pauseHidden);
    document.addEventListener('joho:lesson-slide-change', pauseHidden);
    document.addEventListener('joho:lesson-view-change', pauseHidden);
    motion.addEventListener('change', () => { if (busy) { stopWipe(); render(); } });
    // WebKit can move focus out of a button when it becomes disabled during the wipe.
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && busy && isVisible()) { stopWipe(); render(); }
    });
    controls(root);
    render();
  }

  function setupImageRle(root) {
    const cells = all(root, '[data-cp-image-cell]');
    let pixels = Core.IMAGE_EXAMPLE.flat();
    let step = 0;
    const next = one(root, '[data-cp-image-next]');
    const render = () => {
      const result = Core.encodeRle(pixels.map(value => value ? '黒' : '白').join(''));
      const current = result.runs[step - 1];
      cells.forEach((cell, index) => {
        const color = pixels[index] ? '黒' : '白';
        cell.classList.toggle('cp-cell--black', Boolean(pixels[index]));
        cell.classList.toggle('cp-cell--white', !pixels[index]);
        cell.classList.toggle('is-current', Boolean(current && index >= current.start && index < current.end));
        cell.textContent = color;
        cell.dataset.value = pixels[index] ? 'black' : 'white';
        cell.setAttribute('aria-label', `${Math.floor(index / 5) + 1}行${index % 5 + 1}列、${color}。押すと白黒を切り替えます`);
        cell.setAttribute('aria-pressed', String(Boolean(pixels[index])));
      });
      const runs = one(root, '[data-cp-image-runs]');
      runs.replaceChildren(...result.runs.slice(0, step).map((run, index) => make('li', run.encoded, index === step - 1 ? 'is-current' : '')));
      one(root, '[data-cp-image-step]').textContent = current ? `${current.start + 1}〜${current.end}画素目 → ${current.encoded}${step === result.runs.length ? '。読み取り完了。' : ''}` : '左上から読みます。行をまたいでも同じ色が続けば、1つのまとまりです。';
      one(root, '[data-cp-image-encoded]').textContent = step ? result.runs.slice(0, step).map(run => run.encoded).join('') : '（まだ読み取っていません）';
      one(root, '[data-cp-image-rate-summary]').textContent = step === result.runs.length ? rateText(result) : '元の画像は25画素。「黒」「白」「数字」をそれぞれ1文字として比べます。';
      next.disabled = step >= result.runs.length;
    };
    cells.forEach((cell, index) => cell.addEventListener('click', () => { pixels[index] = 1 - pixels[index]; step = 0; render(); }));
    next.addEventListener('click', () => { step += 1; render(); });
    one(root, '[data-cp-image-reset]').addEventListener('click', () => { pixels = Core.IMAGE_EXAMPLE.flat(); step = 0; render(); });
    controls(root); render();
  }

  function clearFields(root, feedback) {
    all(root, 'input').forEach(input => input.removeAttribute('aria-invalid'));
    feedback.textContent = '';
  }

  function gradeFields(fields, feedback) {
    let correct = 0;
    const mistakes = [];
    fields.forEach(({ input, expected, label }) => {
      const answer = clean(input.value);
      const matches = typeof expected === 'number' ? answer !== '' && /^\d+(?:\.\d+)?$/.test(answer) && Number(answer) === expected : answer === expected;
      input.setAttribute('aria-invalid', String(!matches));
      if (matches) correct += 1;
      else mistakes.push(label);
    });
    feedback.textContent = correct === fields.length ? `全${fields.length}項目正解です。` : `${fields.length}項目中${correct}項目正解です。${mistakes.slice(0, 3).join('、')}${mistakes.length > 3 ? `、ほか${mistakes.length - 3}項目` : ''}を確認しましょう。`;
  }

  function setupStringQuiz(root) {
    const feedback = one(root, '[data-cp-quiz-feedback]');
    root.addEventListener('submit', event => {
      event.preventDefault();
      gradeFields([
        { input: one(root, '[data-cp-answer="compress"]'), expected: Core.encodeRle('EEEECCABAB').encoded, label: '圧縮後の文字列' },
        { input: one(root, '[data-cp-answer="restore"]'), expected: Core.decodeRle('A8E1F1D4'), label: '復元後の文字列' }
      ], feedback);
    });
    root.addEventListener('reset', () => clearFields(root, feedback));
    root.addEventListener('input', event => { event.target.removeAttribute('aria-invalid'); feedback.textContent = ''; });
    setupSteps(one(root, '[data-cp-quiz-solution] ol'), one(root, '[data-cp-quiz-solution-next]'), one(root, '[data-cp-quiz-solution-reset]'));
    controls(root);
  }

  function setupImageQuiz(root) {
    const questions = new Map(['figure2', 'figure3', 'figure4'].map(key => [
      key,
      {
        container: one(root, `[data-cp-image-question="${key}"]`),
        feedback: one(root, `[data-cp-image-feedback="${key}"]`),
        solution: one(root, `[data-cp-image-solution="${key}"]`),
        solutionContent: one(root, `[data-cp-image-solution="${key}"] [data-cp-image-solution-content]`)
      }
    ]));
    if ([...questions.values()].some(question => Object.values(question).some(value => !value))) return;

    const encode = grid => Core.encodeRle(grid.flat().map(value => value ? '黒' : '白').join(''), 3);
    const byKey = key => questions.get(key);
    const clearFeedback = key => {
      const question = byKey(key);
      question.feedback.textContent = '';
      question.solution.hidden = true;
      question.solutionContent.replaceChildren();
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      question.container.removeAttribute('aria-invalid');
      all(question.container, '[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    };
    const addParagraph = (parent, text, className) => {
      const paragraph = make('p', text, className);
      parent.append(paragraph);
      return paragraph;
    };
    const showSolution = (key, explanation) => {
      const question = byKey(key);
      question.solutionContent.replaceChildren();
      explanation.forEach(text => addParagraph(question.solutionContent, text));
      question.solution.hidden = false;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    };
    const check = key => {
      const question = byKey(key);
      const inputs = all(question.container, 'input');
      let isComplete = false;
      let isCorrect = false;
      let explanation = [];

      if (key === 'figure2') {
        const input = one(question.container, '[data-cp-image-answer]');
        const expected = encode(Core.IMAGE_QUESTIONS.figure2);
        const answer = clean(input.value);
        isComplete = answer !== '';
        isCorrect = isComplete && answer === expected.encoded;
        input.setAttribute('aria-invalid', String(!isCorrect));
        explanation = [
          `答えは「${expected.encoded}」です。左上から行末の次も続けて読み、3個以上のまとまりだけ色と個数で表しました。`,
          '黒が6個、白が3個、黒が3個、白が1個、黒が3個の順です。白1個は「白」のままです。'
        ];
      } else if (key === 'figure3') {
        const selected = all(question.container, 'input[name="figure3"]:checked').map(input => Number(input.value)).sort((a, b) => a - b);
        const results = Core.IMAGE_QUESTIONS.figure3.map(encode);
        const noReduction = results.flatMap((result, index) => result.after >= result.before ? [index + 1] : []);
        isComplete = selected.length > 0;
        isCorrect = isComplete && JSON.stringify(selected) === JSON.stringify(noReduction);
        question.container.setAttribute('aria-invalid', String(!isCorrect));
        explanation = [
          `答えは${noReduction.map(number => `図3${number === 1 ? '①' : number === 2 ? '②' : number === 3 ? '③' : '④'}`).join('と')}です。②は白黒が1個ずつ交互に並び、④は行の境目でも同じ色が2個までしか続きません。`,
          '3個以上の連続がないので、そのまま64文字です。①は32文字、③は16文字へ減らせます。'
        ];
      } else {
        const selected = one(question.container, 'input[name="figure4"]:checked');
        const rate = one(question.container, '[data-cp-image-rate]');
        const results = Core.IMAGE_QUESTIONS.figure4.map(encode);
        const shortest = Math.min(...results.map(result => result.after));
        const expectedRate = Core.compressionRate(25, shortest);
        const rateValue = clean(rate.value);
        isComplete = Boolean(selected) && rateValue !== '';
        const validRate = /^\d+(?:\.\d+)?$/.test(rateValue) && Number(rateValue) === expectedRate;
        const validChoice = Boolean(selected) && results[Number(selected.value) - 1]?.after === shortest;
        isCorrect = isComplete && validChoice && validRate;
        one(question.container, '[data-cp-problem-figure="4"]').setAttribute('aria-invalid', String(!validChoice));
        rate.setAttribute('aria-invalid', String(!validRate));
        const optionText = results.map((result, index) => `図4${['①', '②', '③'][index]}は${result.after}文字（${result.encoded}）`).join('。');
        explanation = [
          `${optionText}。最も短いのは図4③の${shortest}文字です。`,
          `圧縮率は圧縮後÷圧縮前×100なので、${shortest} ÷ 25 × 100 ＝ ${number(expectedRate)}%です。`,
          results[1].runs.some(run => run.value === '白' && run.count === 2)
            ? '図4②には白が2個続くまとまりがあり、規則どおり「白白」とそのまま表します。2個のまとまりに個数を付けることはありません。'
            : '同じ色が1個または2個続くところは、色の文字をそのまま残します。'
        ];
      }

      if (!isComplete) {
        question.feedback.textContent = key === 'figure2'
          ? '答えを入力してから判定してください。'
          : key === 'figure3'
            ? '選択肢を1つ以上選んでから判定してください。'
            : '図を1つ選び、圧縮率も入力してから判定してください。';
        question.solution.hidden = true;
        question.solutionContent.replaceChildren();
        (inputs.find(input => input.type === 'text' && !clean(input.value)) || inputs[0]).focus();
        document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
        return;
      }

      question.feedback.textContent = isCorrect ? '正解です。解答・解説を表示します。' : '誤答です。解答・解説を確認しましょう。';
      showSolution(key, explanation);
    };

    questions.forEach((question, key) => {
      one(question.container, `[data-cp-image-check="${key}"]`).addEventListener('click', () => check(key));
      one(question.container, `[data-cp-image-reset="${key}"]`).addEventListener('click', () => {
        all(question.container, 'input').forEach(input => {
          if (input.type === 'text') input.value = '';
          else input.checked = false;
        });
        clearFeedback(key);
      });
      question.container.addEventListener('input', event => {
        if (event.target.matches('input')) clearFeedback(key);
      });
      question.container.addEventListener('change', event => {
        if (event.target.matches('input[type="checkbox"], input[type="radio"]')) clearFeedback(key);
      });
      question.container.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing && event.target.matches('input')) {
          event.preventDefault();
          check(key);
        }
      });
    });
    controls(root);
  }

  let diagramId = 0;
  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderTree(container, forest, {
    active = '', hideCounts = false, hideBits = false, visibleBits = [], reservedDepth = 0, layoutRoot = null,
    selectable = [], selected = [], onSelect = null, newParent = '', tracing = '', leafOrder = [], positionCache = null,
    symbolsOnly = false, description = ''
  } = {}) {
    if (!container) return;
    const roots = [...forest].sort((a, b) => a.prefix.localeCompare(b.prefix) || a.id.localeCompare(b.id));
    const height = node => node.symbol === undefined ? 1 + Math.max(height(node.zero), height(node.one)) : 0;
    const maxHeight = Math.max(reservedDepth, layoutRoot ? height(layoutRoot) : 0, ...roots.map(height));
    const positions = new Map();
    let leaves = leafOrder.length;
    const slots = new Map(leafOrder.map((symbol, index) => [symbol, index]));
    const locate = node => {
      const y = 40 + (maxHeight - height(node)) * 80;
      let x;
      if (node.symbol !== undefined) x = 60 + (slots.has(node.symbol) ? slots.get(node.symbol) : leaves++) * 120;
      else {
        locate(node.zero); locate(node.one);
        x = (positions.get(node.zero.id).x + positions.get(node.one.id).x) / 2;
        // Fixed leaf slots can put different, crossing subtrees at the same centre.
        // Keep each existing parent still and give a new parent the nearest free place.
        if (positionCache) {
          if (positionCache.has(node.id)) x = positionCache.get(node.id).x;
          else {
            const occupied = [...positionCache.values()].filter(point => point.y === y);
            const limit = Math.max(520, leaves * 120) - 34;
            const candidates = [x];
            for (let offset = 80; offset < limit; offset += 80) candidates.push(x - offset, x + offset);
            x = candidates.find(candidate => candidate >= 34 && candidate <= limit && occupied.every(point => Math.abs(point.x - candidate) >= 76)) ?? x;
            positionCache.set(node.id, { x, y });
          }
        }
      }
      positions.set(node.id, { x, y });
    };
    // A fixed final tree keeps every existing circle still while the next parent and branches appear.
    if (layoutRoot) locate(layoutRoot); else roots.forEach(locate);
    const uid = `cp-tree-${++diagramId}`;
    const interactive = typeof onSelect === 'function';
    container.classList.toggle('cp-tree--interactive', interactive);
    const svg = svgElement('svg', { viewBox: `0 0 ${Math.max(520, leaves * 120)} ${maxHeight * 80 + 106}`, role: interactive ? 'group' : 'img', 'aria-labelledby': `${uid}-title ${uid}-desc` });
    // Keep the practice diagram compact; 68-unit hit areas remain at least 44px.
    if (interactive) svg.style.setProperty('--cp-tree-width', `${Math.max(520, leaves * 80)}px`);
    svg.append(svgElement('title', { id: `${uid}-title` }, interactive ? '丸を選んで結合するハフマン木' : hideCounts ? '枝の0と1から符号を読み取るハフマン木' : 'ハフマン木の結合と符号'));
    const descriptions = [];
    const visitDescription = (node, base) => {
      if (node.symbol !== undefined) descriptions.push(`${node.symbol}：${hideCounts ? '回数は空欄' : `${node.count}回`}${hideBits ? '' : `、${node.prefix === base ? '独立した葉' : `この木の根からの枝${node.prefix.slice(base.length)}`}`}`);
      else { visitDescription(node.zero, base); visitDescription(node.one, base); }
    };
    roots.forEach(node => visitDescription(node, node.prefix));
    const visibleBitDescription = hideBits && visibleBits.length
      ? `表示した枝：${visibleBits.map(prefix => `根から${prefix.split('').join('→')}までの最後の枝は${prefix.slice(-1)}`).join('。')}。`
      : '';
    svg.append(svgElement('desc', { id: `${uid}-desc` }, description || `${roots.length}個の木。${descriptions.join('。')}。${hideBits && !visibleBits.length ? '枝の符号はまだ表示していません。' : visibleBitDescription}${interactive ? '結合していない根の丸を2つ選びます。Enterキーまたはスペースキーでも選べます。' : ''}`));
    const edges = svgElement('g', { 'data-cp-tree-edges': '' });
    const nodes = svgElement('g', { 'data-cp-tree-nodes': '' });
    const symbols = node => node.symbol || `${[...node.id.slice('node:'.length)].join('・')}（結合済み）`;
    const tracingPrefixes = new Set(Array.isArray(tracing) ? tracing : tracing ? [tracing] : []);
    const draw = node => {
      const p = positions.get(node.id);
      if (node.symbol === undefined) {
        [node.zero, node.one].forEach((child, bit) => {
          const c = positions.get(child.id);
          const highlighted = active !== '' && active !== 'root' && active.startsWith(child.prefix);
          const joining = node.id === newParent;
          const revealingBit = tracingPrefixes.has(child.prefix);
          const visibleBit = !hideBits || visibleBits.includes(child.prefix);
          const classes = [highlighted ? 'is-current' : '', joining ? 'cp-new-edge' : ''].filter(Boolean).join(' ');
          edges.append(svgElement('line', {
            x1: joining ? c.x : p.x, y1: joining ? c.y : p.y,
            x2: joining ? p.x : c.x, y2: joining ? p.y : c.y,
            class: classes, pathLength: 1, 'data-cp-edge': child.prefix
          }));
          if (visibleBit) edges.append(svgElement('text', {
            x: (p.x + c.x) / 2 + (c.x === p.x ? (bit ? 12 : -12) : c.x > p.x ? 12 : -12), y: (p.y + c.y) / 2,
            class: `cp-edge-label${revealingBit ? ' cp-tracing-label' : ''}`, 'data-cp-edge-label': child.prefix
          }, bit));
          draw(child);
        });
      }
      const canSelect = interactive && selectable.includes(node.id);
      const classes = [active === node.id ? 'is-current' : '', selected.includes(node.id) ? 'is-selected' : '', node.id === newParent ? 'cp-new-node' : ''].filter(Boolean).join(' ');
      const group = svgElement('g', { 'data-cp-node': node.id, class: classes });
      if (canSelect) group.append(svgElement('rect', {
        x: p.x - 34, y: p.y - 34, width: 68, height: 68,
        fill: 'transparent', 'aria-hidden': 'true', 'data-cp-hit-area': node.id
      }));
      if (!symbolsOnly) {
        group.append(svgElement('circle', { cx: p.x, cy: p.y, r: 24 }));
        group.append(svgElement('text', { x: p.x, y: p.y }, hideCounts ? '?' : node.count));
      }
      if (node.symbol !== undefined) group.append(svgElement('text', { x: p.x, y: p.y + 42, class: 'cp-leaf' }, node.symbol));
      if (canSelect) {
        group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', `${symbols(node)}：${node.count}回`);
        group.setAttribute('aria-pressed', String(selected.includes(node.id)));
        group.dataset.cpPracticeNode = node.id;
        group.addEventListener('click', () => onSelect(node.id));
        group.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(node.id); }
        });
        if (selected.includes(node.id)) {
          group.append(svgElement('text', { x: p.x + 34, y: p.y - 30, class: 'cp-selection-order', 'aria-hidden': 'true' }, selected.indexOf(node.id) + 1));
        }
      }
      nodes.append(group);
    };
    roots.forEach(draw); svg.append(edges, nodes); container.replaceChildren(svg);
  }

  function renderCodes(container, fixture, show = true, active = '') {
    if (!container) return;
    container.replaceChildren(...Object.keys(fixture.codes).map(symbol => {
      const card = make('div', undefined, `cp-code-card${symbol === active ? ' is-current' : ''}`);
      card.append(make('strong', symbol), make('small', `${fixture.frequencies[symbol]}回`), make('code', show ? fixture.codes[symbol] : '？'));
      return card;
    }));
  }

  function setupBuild(root) {
    const preset = one(root, '[data-cp-build-preset]');
    const next = one(root, '[data-cp-build-next]');
    const previous = one(root, '[data-cp-build-prev]');
    const treeView = one(root, '[data-cp-tree]');
    const status = one(root, '[data-cp-build-status]');
    const rows = all(root, '[data-cp-build-row]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let step = 0;
    let finishAnimation = null;
    let timer = null;
    let animationTarget = null;
    let diagramFixture = null;
    let diagramStep = -1;
    const cancelAnimation = () => {
      if (timer !== null) window.clearTimeout(timer);
      animationTarget?.removeEventListener('animationend', completeAnimation);
      timer = null;
      animationTarget = null;
      finishAnimation = null;
      root.dataset.cpBuildAnimating = 'false';
    };
    const completeAnimation = () => {
      const finish = finishAnimation;
      cancelAnimation();
      finish?.();
    };
    const leafNames = node => node.symbol !== undefined ? [node.symbol] : [...leafNames(node.zero), ...leafNames(node.one)];
    const describe = node => node.symbol || leafNames(node).join('・');
    const internalNodes = rootNode => {
      const queue = [rootNode], result = [];
      while (queue.length) {
        const node = queue.shift();
        if (node.symbol !== undefined) continue;
        result.push(node);
        queue.push(node.zero, node.one);
      }
      return result;
    };
    const render = (animate = false) => {
      cancelAnimation();
      const fixture = preset ? Core.HUFFMAN_PRACTICE[Number(preset.value)] : Core.HUFFMAN_EXAMPLE;
      const tree = Core.huffmanFromCodes(fixture.frequencies, fixture.codes);
      const letterOrder = Object.keys(fixture.frequencies).sort((a, b) => fixture.frequencies[b] - fixture.frequencies[a] || a.localeCompare(b));
      const branchGroups = internalNodes(tree.root);
      const joinEnd = 2 + tree.steps.length;
      const bitStart = joinEnd + 1;
      const codeStart = bitStart + branchGroups.length;
      const finalStep = codeStart + Object.keys(fixture.codes).length - 1;
      let forest = [];
      let active = '';
      let newParent = '';
      let visibleBits = [];
      let tracing = [];
      let statusText = '';
      let currentSymbol = '';

      if (step === 0) {
        statusText = '前ページの例で、頻度の大きい順に文字を並べます。';
      } else if (step === 1) {
        forest = tree.leaves;
        statusText = '各文字の上に頻度を〇で囲んで示します。';
      } else if (step === 2) {
        forest = tree.leaves;
        statusText = '頻度の小さい２つを選び結合します。';
      } else if (step <= joinEnd) {
        const joinIndex = step - 3;
        const joined = tree.steps[joinIndex];
        forest = joined.forest;
        active = joined.parent.id;
        newParent = joined.parent.id;
        statusText = `${describe(joined.zero)}（${joined.zero.count}）と${describe(joined.one)}（${joined.one.count}）を結合し、${joined.parent.count}にします。`;
        if (step === joinEnd) statusText += ' すべてがつながり、ハフマン木が完成しました。次に、左へつながる線に0、右へつながる線に1を付けます。';
        else statusText += '次に、頻度の小さい２つを選び結合します。';
      } else if (step < codeStart) {
        forest = [tree.root];
        const groupIndex = step - bitStart;
        visibleBits = branchGroups.slice(0, groupIndex + 1).flatMap(node => [node.zero.prefix, node.one.prefix]);
        tracing = [branchGroups[groupIndex].zero.prefix, branchGroups[groupIndex].one.prefix];
        active = branchGroups[groupIndex].prefix || 'root';
        statusText = `${branchGroups[groupIndex].count}の丸から、左へつながる線を0、右へつながる線を1として表示します。`;
        if (step === codeStart - 1) statusText += ' すべての線に0と1が付きました。次に、いちばん上から各文字までの線をたどって読み取ります。';
      } else {
        forest = [tree.root];
        visibleBits = branchGroups.flatMap(node => [node.zero.prefix, node.one.prefix]);
        const symbolIndex = step - codeStart;
        currentSymbol = Object.keys(fixture.codes)[symbolIndex];
        statusText = `いちばん上から${currentSymbol}まで線をたどると、${fixture.codes[currentSymbol].split('').join('→')}となります。符号は${fixture.codes[currentSymbol]}です。`;
        if (step === finalStep) statusText += ' 符号表が完成しました。';
      }

      // Code tracing reuses the completed tree. Its circles and grey branches remain
      // underneath a separate red overlay instead of being replaced or wiped away.
      const reuseDiagram = currentSymbol && diagramFixture === fixture && diagramStep >= codeStart - 1;
      const diagramDescription = step === 0 ? '文字と頻度はまだ表示していません。'
        : step === 1 ? `文字は左から${letterOrder.join('・')}の順です。頻度はまだ表示していません。`
        : `${letterOrder.map(symbol => `${symbol}：${fixture.frequencies[symbol]}回`).join('。')}。文字の上に頻度を丸で囲んで示し、結合した合計を上の丸に書きます。${visibleBits.length ? '線に付けた0と1を、いちばん上から各文字まで順に読み取ります。' : '線の0と1はまだ表示していません。'}`;
      if (!reuseDiagram) renderTree(treeView, forest, {
        layoutRoot: tree.root, reservedDepth: 4, hideBits: true,
        visibleBits, active, newParent: animate ? newParent : '', tracing,
        leafOrder: letterOrder, symbolsOnly: step === 1, description: diagramDescription
      });
      diagramFixture = fixture;
      diagramStep = step;
      const svg = one(treeView, 'svg');
      all(svg, '[data-cp-path-overlay]').forEach(element => element.remove());
      all(svg, '.is-path-label').forEach(element => element.classList.remove('is-path-label'));
      const duration = currentSymbol ? fixture.codes[currentSymbol].length * 280 : newParent ? 580 : 0;
      const waiting = animate && duration > 0 && !reducedMotion.matches;
      rows.forEach(row => {
        const symbol = row.dataset.cpBuildRow;
        const symbolIndex = Object.keys(fixture.codes).indexOf(symbol);
        const codeCell = one(row, '[data-cp-build-code]');
        const symbolCell = one(row, '[data-cp-build-symbol]');
        const countCell = one(row, '[data-cp-build-count]');
        if (symbolCell) symbolCell.textContent = step >= 1 ? symbol : '';
        if (countCell) countCell.textContent = step >= 2 ? fixture.frequencies[symbol] : '';
        const revealed = step >= codeStart + symbolIndex && !(waiting && symbol === currentSymbol);
        codeCell.textContent = revealed ? fixture.codes[symbol] : '';
        row.classList.toggle('is-current', !waiting && symbol === currentSymbol);
      });
      let pathLayer = null;
      let pathLabels = [];
      if (currentSymbol) {
        all(svg, '.is-current, .cp-tracing-label').forEach(element => {
          element.classList.remove('is-current', 'cp-tracing-label');
        });
        const path = fixture.codes[currentSymbol];
        const pathPrefixes = Array.from(path, (_, index) => path.slice(0, index + 1));
        const lines = svgElement('g', { 'data-cp-path-overlay': '', class: 'cp-path-lines', 'aria-hidden': 'true' });
        pathLayer = svgElement('g', { 'data-cp-path-overlay': '', class: 'cp-path-nodes', 'aria-hidden': 'true' });
        pathPrefixes.forEach((prefix, index) => {
          const base = one(svg, `[data-cp-tree-edges] line[data-cp-edge="${prefix}"]`);
          lines.append(svgElement('line', {
            x1: base.getAttribute('x1'), y1: base.getAttribute('y1'),
            x2: base.getAttribute('x2'), y2: base.getAttribute('y2'),
            pathLength: 1, 'data-cp-path-edge': prefix,
            class: `cp-path-edge${waiting ? ' cp-path-wipe' : ''}`, style: `--cp-path-delay:${index * 280}ms`
          }));
        });
        ['root', ...pathPrefixes].forEach(id => {
          const base = one(svg, `[data-cp-node="${id}"] circle`);
          pathLayer.append(svgElement('circle', { cx: base.getAttribute('cx'), cy: base.getAttribute('cy'), r: 28, class: 'cp-path-ring', 'data-cp-path-node': id }));
        });
        pathLabels = pathPrefixes.map(prefix => one(svg, `[data-cp-edge-label="${prefix}"]`));
        svg.insertBefore(lines, one(svg, '[data-cp-tree-nodes]'));
        svg.append(pathLayer);
      }
      const settle = () => {
        // The diagram and the corresponding row are revealed in the same update.
        all(svg, '.cp-path-wipe, .cp-new-node, .cp-new-edge').forEach(element => element.classList.remove('cp-path-wipe', 'cp-new-node', 'cp-new-edge'));
        if (currentSymbol) {
          pathLayer.classList.add('is-complete');
          pathLabels.forEach(label => label.classList.add('is-path-label'));
          const row = rows.find(item => item.dataset.cpBuildRow === currentSymbol);
          one(row, '[data-cp-build-code]').textContent = fixture.codes[currentSymbol];
          row.classList.add('is-current');
        }
        root.dataset.cpBuildAnimating = 'false';
        status.textContent = statusText;
        next.disabled = step >= finalStep;
      };
      root.dataset.cpBuildStep = String(step);
      root.dataset.cpBuildAnimating = String(waiting);
      status.textContent = waiting && currentSymbol ? `いちばん上から${currentSymbol}までの線をたどっています。` : statusText;
      next.disabled = waiting || step >= finalStep;
      previous.disabled = step === 0;
      if (waiting) {
        finishAnimation = settle;
        animationTarget = currentSymbol ? one(svg, '.cp-path-lines').lastElementChild : one(svg, '.cp-new-node');
        animationTarget.addEventListener('animationend', completeAnimation, { once: true });
        // A bounded fallback also settles the display if the browser suppresses an event.
        timer = window.setTimeout(completeAnimation, duration + 120);
      } else settle();
    };
    next.addEventListener('click', () => {
      if (next.disabled) return;
      step += 1; render(true);
    });
    previous.addEventListener('click', () => { step = Math.max(step - 1, 0); render(); });
    one(root, '[data-cp-build-reset]').addEventListener('click', () => { step = 0; render(); });
    if (preset) preset.addEventListener('change', () => { step = 0; render(); });
    document.addEventListener('joho:lesson-slide-change', () => {
      if (root.closest('[data-lesson-slide]')?.hidden) completeAnimation();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) completeAnimation(); });
    window.addEventListener('pagehide', completeAnimation);
    window.addEventListener('beforeprint', completeAnimation);
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) completeAnimation(); });
    controls(root); render();
  }

  function setupCodec(root) {
    const decode = root.dataset.cpCodec === 'decode';
    const fixture = Core.HUFFMAN_EXAMPLE;
    const input = one(root, '[data-cp-codec-input]');
    const form = one(root, '[data-cp-codec-form]');
    const next = one(root, '[data-cp-codec-next]');
    const reset = one(root, '[data-cp-codec-reset]');
    const status = one(root, '[data-cp-codec-status]');
    const sourceDisplay = one(root, '[data-cp-codec-source]');
    const output = one(root, '[data-cp-codec-output]');
    const pendingDisplay = one(root, '[data-cp-codec-pending]');
    const codeRows = all(root, '[data-cp-codec-row]');
    const editor = one(root, '[data-cp-codec-editor]');
    const editButton = one(root, '[data-cp-codec-edit]');
    const cancelButton = one(root, '[data-cp-codec-cancel]');
    const editStatus = one(root, '[data-cp-codec-edit-status]');
    const sourceCount = one(root, '[data-cp-codec-source-count]');
    const outputCount = one(root, '[data-cp-codec-output-count]');
    const stripScroll = one(root, '[data-cp-codec-strip-scroll]');
    const codes = fixture.codes;
    const codeToSymbol = Object.fromEntries(Object.entries(codes).map(([symbol, bits]) => [bits, symbol]));
    let step = 0;
    let source = clean(input.value);
    let editing = false;
    const validSource = value => decode ? /^[01]{1,160}$/.test(value) : /^[A-E]{1,80}$/.test(value);
    const groupsForSource = () => {
      if (!decode) return [...source].map((symbol, index) => ({ symbol, bits: codes[symbol], start: index, end: index + 1 }));
      const groups = [];
      let pending = '';
      let start = 0;
      for (let index = 0; index < source.length; index += 1) {
        pending += source[index];
        const symbol = codeToSymbol[pending];
        if (symbol) {
          groups.push({ symbol, bits: pending, start, end: index + 1 });
          start = index + 1;
          pending = '';
        }
      }
      if (pending) groups.push({ symbol: '', bits: pending, start, end: source.length });
      return groups;
    };
    const render = () => {
      const valid = validSource(source);
      if (sourceCount) sourceCount.textContent = `${source.length}${decode ? 'bit' : '文字'}`;
      codeRows.forEach(row => row.classList.remove('is-current'));
      if (!valid) {
        sourceDisplay.replaceChildren();
        output.replaceChildren();
        pendingDisplay.textContent = '—';
        status.textContent = source
          ? (decode ? '0と1を1〜160bitで入力してください。' : 'A〜Eの文字を1〜80文字で入力してください。')
          : (decode ? 'ビット列を入力してください。' : '文字列を入力してください。');
        next.disabled = true;
        if (outputCount) outputCount.textContent = decode ? '0文字' : '0bit';
        return;
      }

      const groups = groupsForSource();
      const activeIndex = groups.findIndex(group => step > group.start && step <= group.end);
      const active = groups[activeIndex];
      const completed = groups.filter(group => group.symbol && group.end <= step);
      const encoded = completed.map(group => group.bits).join('');
      const decoded = completed.map(group => group.symbol).join('');
      const currentSymbol = active && (!decode || active.end === step) ? active.symbol : '';
      const pending = decode && active && !currentSymbol ? active.bits.slice(0, step - active.start) : '';
      const table = one(root, '[data-cp-codec-grid]');
      table.style.setProperty('--cp-word-count', groups.length);
      sourceDisplay.replaceChildren(make('th', decode ? '元の符号' : '元の文字'));
      output.replaceChildren(make('th', decode ? '復元' : '符号化'));
      sourceDisplay.firstElementChild.scope = output.firstElementChild.scope = 'row';
      groups.forEach((group, column) => {
        const confirmed = Boolean(group.symbol) && group.end <= step;
        const isCurrent = column === activeIndex;
        const sourceCell = make('td', decode ? '' : group.symbol, isCurrent ? 'is-current' : '');
        const outputCell = make('td', confirmed ? (decode ? group.symbol : group.bits) : '', isCurrent ? 'is-current' : '');
        for (const cell of [sourceCell, outputCell]) {
          cell.dataset.cpCodecColumn = String(column);
          // Do not hint at an unread letter through its color while decoding.
          if (!decode || confirmed) cell.dataset.cpFrequencyColumn = group.symbol;
        }
        sourceCell.setAttribute('aria-label', decode ? `${column + 1}つ目の符号：${group.bits}` : `${column + 1}文字目：${group.symbol}`);
        outputCell.setAttribute('aria-label', `${column + 1}列目の${decode ? '復元' : '符号化'}：${confirmed ? outputCell.textContent : '未確定'}`);
        if (decode) {
          sourceCell.append(...[...group.bits].map((bit, offset) => {
            const index = group.start + offset;
            const span = make('span', bit, 'cp-codec-bit');
            span.dataset.cpBitIndex = String(index);
            if (isCurrent && index < step) span.classList.add('is-reading');
            if (index === step - 1) {
              span.classList.add('is-current');
              span.setAttribute('aria-current', 'true');
            }
            return span;
          }));
        }
        sourceDisplay.append(sourceCell);
        output.append(outputCell);
      });
      if (outputCount) outputCount.textContent = decode ? `${decoded.length}文字` : `${encoded.length}bit`;
      pendingDisplay.textContent = decode ? pending || '—' : active?.bits || '—';
      if (decode) {
        if (step === source.length && pending) status.textContent = `入力は符号の途中（${pending}）で終わっています。続きのbitを追加してください。`;
        else if (step === source.length) status.textContent = `復元完了。${decoded.length}文字を確認しました。`;
        else if (currentSymbol) status.textContent = `符号${codes[currentSymbol]}が表の${currentSymbol}と一致しました。${currentSymbol}を復元しました。`;
        else status.textContent = pending ? `表と照合中の符号は${pending}です。次のbitを確認します。` : '次のbitを符号表と照合します。';
      } else if (step < source.length) {
        status.textContent = step === 0
          ? `「次へ」で${source[step]}に対応する符号を表から追加します。`
          : `${source[step - 1]}の符号${codes[source[step - 1]]}を追加しました。次は${source[step]}です。`;
      } else status.textContent = `符号化完了。${source.length}文字を${encoded.length}bitで表しました。`;
      // Keep the current column visible inside the table without moving focus.
      if (stripScroll && stripScroll.clientWidth > 0 && !editing) {
        const current = sourceDisplay.querySelector('td.is-current');
        if (!current) stripScroll.scrollLeft = 0;
        else {
          const bounds = stripScroll.getBoundingClientRect();
          const cellBounds = current.getBoundingClientRect();
          const heading = sourceDisplay.firstElementChild;
          const left = bounds.left + (getComputedStyle(heading).position === 'sticky' ? heading.getBoundingClientRect().width : 0);
          if (cellBounds.right > bounds.right) stripScroll.scrollLeft += cellBounds.right - bounds.right;
          else if (cellBounds.left < left) stripScroll.scrollLeft -= left - cellBounds.left;
        }
      }
      next.disabled = editing || step >= source.length;
      reset.disabled = editing;
      next.setAttribute('aria-label', decode ? '次のbitを復元' : '次の文字を符号化');
      codeRows.find(row => row.dataset.cpCodecRow === currentSymbol)?.classList.add('is-current');
    };
    const closeEditor = () => {
      editing = false;
      if (editor) editor.hidden = true;
      stripScroll.hidden = false;
      editButton?.setAttribute('aria-expanded', 'false');
      input.value = source;
      input.removeAttribute('aria-invalid');
      if (editStatus) editStatus.textContent = '';
      render();
      editButton?.focus({ preventScroll: true });
    };
    editButton?.addEventListener('click', () => {
      if (editing) { closeEditor(); return; }
      editing = true;
      input.value = source;
      input.removeAttribute('aria-invalid');
      editor.hidden = false;
      stripScroll.hidden = true;
      editButton.setAttribute('aria-expanded', 'true');
      next.disabled = true;
      reset.disabled = true;
      input.focus();
      input.select();
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    });
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); if (editStatus) editStatus.textContent = ''; });
    cancelButton?.addEventListener('click', closeEditor);
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = clean(input.value);
      if (!validSource(value)) {
        input.setAttribute('aria-invalid', 'true');
        if (editStatus) editStatus.textContent = decode ? '0と1を1〜160bitで入力してください。' : 'A〜Eの文字を1〜80文字で入力してください。';
        input.focus();
        return;
      }
      source = value;
      step = 0;
      closeEditor();
    });
    next.addEventListener('click', () => {
      if (next.disabled) return;
      step += 1;
      render();
    });
    reset.addEventListener('click', () => { step = 0; render(); });
    controls(root); render();
  }

  function setupHuffmanQuiz(root) {
    const fixture = Core.HUFFMAN_QUESTIONS[Number(root.dataset.cpHuffmanQuiz)];
    const tree = Core.huffmanFromCodes(fixture.frequencies, fixture.codes);
    const originalBits = fixture.text.length * fixture.fixedBits;
    const answers = { frequencyTotal: fixture.text.length, bitsTotal: tree.totalBits, originalBits, compressedBits: tree.totalBits, rate: Core.compressionRate(originalBits, tree.totalBits), encoded: Core.encodeHuffman(fixture.encodeText, fixture.codes), decoded: Core.decodeHuffman(fixture.decodeBits, fixture.codes) };
    const names = { frequency: '出現回数', code: '符号', length: '符号長', bits: '合計bit数', frequencyTotal: '出現回数の合計', bitsTotal: 'bit数の合計', originalBits: '圧縮前のbit数', compressedBits: '圧縮後のbit数', rate: '圧縮率', encoded: '符号化', decoded: '復元' };
    Object.keys(fixture.codes).forEach(symbol => {
      answers[`frequency:${symbol}`] = fixture.frequencies[symbol];
      answers[`code:${symbol}`] = fixture.codes[symbol];
      answers[`length:${symbol}`] = fixture.codes[symbol].length;
      answers[`bits:${symbol}`] = fixture.frequencies[symbol] * fixture.codes[symbol].length;
    });
    const fields = all(root, '[data-cp-huffman-field]').map(input => {
      const key = input.dataset.cpHuffmanField;
      const [kind, symbol] = key.split(':');
      return { input, expected: answers[key], label: `${symbol ? `${symbol}の` : ''}${names[kind]}` };
    });
    const feedback = one(root, '[data-cp-huffman-feedback]');
    let countsVisible = false;
    const updateTree = () => renderTree(one(root, '[data-cp-quiz-tree]'), [tree.root], { hideCounts: !countsVisible });
    updateTree();
    root.addEventListener('submit', event => {
      event.preventDefault(); gradeFields(fields, feedback);
      countsVisible = fields.filter(field => field.input.dataset.cpHuffmanField.startsWith('frequency:')).every(field => field.input.getAttribute('aria-invalid') === 'false');
      updateTree();
    });
    root.addEventListener('reset', () => { clearFields(root, feedback); countsVisible = false; updateTree(); });
    root.addEventListener('input', event => {
      event.target.removeAttribute('aria-invalid'); feedback.textContent = '';
      if (countsVisible) { countsVisible = false; updateTree(); }
    });
    setupSteps(one(root, '[data-cp-huffman-solution]'), one(root, '[data-cp-huffman-solution-next]'), one(root, '[data-cp-huffman-solution-reset]'));
    controls(root);
  }

  window.CompressionLessonViews = Object.freeze({ renderTree, renderCodes, gradeFields, setupSteps, clean });

  function initialize() {
    const widgets = [
      ['[data-cp-string-rle]', setupStringRle], ['[data-cp-image-rle]', setupImageRle],
      ['[data-cp-string-quiz]', setupStringQuiz], ['[data-cp-image-quiz]', setupImageQuiz],
      ['[data-cp-huffman-build]', setupBuild], ['[data-cp-codec]', setupCodec], ['[data-cp-huffman-quiz]', setupHuffmanQuiz]
    ];
    widgets.forEach(([selector, setup]) => all(document, selector).forEach(root => {
      try { setup(root); } catch (error) { console.error('圧縮教材の操作を初期化できませんでした。', error); }
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
