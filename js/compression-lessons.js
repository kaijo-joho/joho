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
    const status = one(root, '[data-cp-rle-step]');
    const rate = one(root, '[data-cp-rle-rate]');
    const next = one(root, '[data-cp-rle-next]');
    let step = 0;
    const render = () => {
      const text = input.value.normalize('NFKC').toUpperCase();
      const valid = /^[A-Z]{1,40}$/.test(text);
      input.setAttribute('aria-invalid', String(!valid));
      before.replaceChildren(); after.replaceChildren();
      if (!valid) {
        before.textContent = text || '（未入力）';
        status.textContent = 'A〜Zの文字を1〜40文字で入力してください。';
        rate.textContent = ''; next.disabled = true; return;
      }
      const result = Core.encodeRle(text);
      result.runs.forEach((run, index) => {
        before.append(make('span', run.value.repeat(run.count), index === step - 1 ? 'is-current' : ''));
        if (index < step) after.append(make('span', run.encoded, `cp-token${index === step - 1 ? ' is-current' : ''}`));
      });
      if (!step) after.textContent = '「次のまとまり」で圧縮を進めます。';
      const run = result.runs[step - 1];
      status.textContent = run ? `${step} / ${result.runs.length}：${run.value}が${run.count}回続く → ${run.encoded}${step === result.runs.length ? '。圧縮完了。' : ''}` : `0 / ${result.runs.length}：左端から、同じ文字のまとまりを読みます。`;
      rate.textContent = step === result.runs.length ? rateText(result) : `元の文字数：${result.before}文字。すべてのまとまりを圧縮して比べましょう。`;
      next.disabled = step >= result.runs.length;
    };
    input.addEventListener('input', () => { step = 0; render(); });
    next.addEventListener('click', () => { step += 1; render(); });
    one(root, '[data-cp-rle-reset]').addEventListener('click', () => { step = 0; render(); });
    controls(root); render();
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
      one(root, '[data-cp-image-step]').textContent = current ? `${step} / ${result.runs.length}：${current.start + 1}〜${current.end}画素目 → ${current.encoded}${step === result.runs.length ? '。読み取り完了。' : ''}` : '左上から読みます。行をまたいでも同じ色が続けば、1つのまとまりです。';
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
    const feedback = one(root, '[data-cp-image-quiz-feedback]');
    one(root, '[data-cp-image-quiz-submit]').addEventListener('click', () => {
      const encode = grid => Core.encodeRle(grid.flat().map(value => value ? '黒' : '白').join(''), 3);
      const figure2 = one(root, '[data-cp-image-answer]');
      const figure3 = all(root, 'input[name="figure3"]:checked').map(input => Number(input.value));
      const figure4 = one(root, 'input[name="figure4"]:checked');
      const rate = one(root, '[data-cp-image-rate]');
      const options = Core.IMAGE_QUESTIONS.figure4.map(encode);
      const shortest = Math.min(...options.map(result => result.after));
      const noReduction = Core.IMAGE_QUESTIONS.figure3.map(encode).flatMap((result, index) => result.after >= result.before ? [index + 1] : []);
      const checks = [
        clean(figure2.value) === encode(Core.IMAGE_QUESTIONS.figure2).encoded,
        JSON.stringify(figure3) === JSON.stringify(noReduction),
        Boolean(figure4 && options[Number(figure4.value) - 1].after === shortest),
        /^\d+(?:\.\d+)?$/.test(clean(rate.value)) && Number(clean(rate.value)) === Core.compressionRate(25, shortest)
      ];
      figure2.setAttribute('aria-invalid', String(!checks[0]));
      rate.setAttribute('aria-invalid', String(!checks[3]));
      const labels = ['図2の文字列', '図3の選択', '図4の選択', '圧縮率'];
      feedback.textContent = checks.every(Boolean) ? '全4項目正解です。連続のしかたによる違いを説明してみましょう。' : `4項目中${checks.filter(Boolean).length}項目正解です。${labels.filter((_, index) => !checks[index]).join('、')}を確認しましょう。`;
    });
    one(root, '[data-cp-image-quiz-reset]').addEventListener('click', () => {
      all(root, 'input').forEach(input => { if (input.type === 'text') input.value = ''; else input.checked = false; });
      clearFields(root, feedback);
    });
    root.addEventListener('input', event => { event.target.removeAttribute('aria-invalid'); feedback.textContent = ''; });
    controls(root);
  }

  let diagramId = 0;
  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderTree(container, forest, { active = '', hideCounts = false } = {}) {
    if (!container) return;
    const roots = [...forest].sort((a, b) => a.prefix.localeCompare(b.prefix));
    const height = node => node.symbol === undefined ? 1 + Math.max(height(node.zero), height(node.one)) : 0;
    const maxHeight = Math.max(...roots.map(height));
    const positions = new Map();
    let leaves = 0;
    const locate = node => {
      const y = 40 + (maxHeight - height(node)) * 80;
      let x;
      if (node.symbol !== undefined) x = 60 + leaves++ * 120;
      else { locate(node.zero); locate(node.one); x = (positions.get(node.zero).x + positions.get(node.one).x) / 2; }
      positions.set(node, { x, y });
    };
    roots.forEach(locate);
    const uid = `cp-tree-${++diagramId}`;
    const svg = svgElement('svg', { viewBox: `0 0 ${Math.max(520, leaves * 120)} ${maxHeight * 80 + 106}`, role: 'img', 'aria-labelledby': `${uid}-title ${uid}-desc` });
    svg.append(svgElement('title', { id: `${uid}-title` }, hideCounts ? '枝の0と1から符号を読み取るハフマン木' : 'ハフマン木の結合と符号'));
    const descriptions = [];
    const visitDescription = (node, base) => {
      if (node.symbol !== undefined) descriptions.push(`${node.symbol}：${hideCounts ? '回数は空欄' : `${node.count}回`}、${node.prefix === base ? '独立した葉' : `この木の根からの枝${node.prefix.slice(base.length)}`}`);
      else { visitDescription(node.zero, base); visitDescription(node.one, base); }
    };
    roots.forEach(node => visitDescription(node, node.prefix));
    svg.append(svgElement('desc', { id: `${uid}-desc` }, `${roots.length}個の木。${descriptions.join('。')}。`));
    const edges = svgElement('g');
    const nodes = svgElement('g');
    const draw = node => {
      const p = positions.get(node);
      if (node.symbol === undefined) {
        [node.zero, node.one].forEach((child, bit) => {
          const c = positions.get(child);
          const highlighted = active !== '' && active.startsWith(child.prefix);
          edges.append(svgElement('line', { x1: p.x, y1: p.y, x2: c.x, y2: c.y, class: highlighted ? 'is-current' : '' }));
          edges.append(svgElement('text', { x: (p.x + c.x) / 2 + (bit ? 12 : -12), y: (p.y + c.y) / 2, class: 'cp-edge-label' }, bit));
          draw(child);
        });
      }
      const group = svgElement('g', { 'data-cp-node': node.id, class: active === node.id || (active === 'root' && node.id === 'root') ? 'is-current' : '' });
      group.append(svgElement('circle', { cx: p.x, cy: p.y, r: 24 }));
      group.append(svgElement('text', { x: p.x, y: p.y }, hideCounts ? '?' : node.count));
      if (node.symbol !== undefined) group.append(svgElement('text', { x: p.x, y: p.y + 42, class: 'cp-leaf' }, node.symbol));
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
    let step = 0;
    const render = () => {
      const fixture = preset ? Core.HUFFMAN_PRACTICE[Number(preset.value)] : Core.HUFFMAN_EXAMPLE;
      const tree = Core.huffmanFromCodes(fixture.frequencies, fixture.codes);
      const current = tree.steps[step - 1];
      renderTree(one(root, '[data-cp-tree]'), current ? current.forest : tree.leaves, { active: current ? current.parent.id : '' });
      renderCodes(one(root, '[data-cp-codes]'), fixture, step === tree.steps.length);
      one(root, '[data-cp-build-status]').textContent = current ? `結合${step} / ${tree.steps.length}：${current.zero.count} ＋ ${current.one.count} ＝ ${current.parent.count}。${step === tree.steps.length ? '木が完成。根から0・1をたどって各文字の符号を読みます。' : '残っている数から、最も少ない2つを探しましょう。'}` : `結合0 / ${tree.steps.length}：各文字の出現回数から、最も少ない2つを探しましょう。`;
      next.disabled = step >= tree.steps.length; previous.disabled = step === 0;
    };
    next.addEventListener('click', () => { step += 1; render(); });
    previous.addEventListener('click', () => { step -= 1; render(); });
    one(root, '[data-cp-build-reset]').addEventListener('click', () => { step = 0; render(); });
    if (preset) preset.addEventListener('change', () => { step = 0; render(); });
    controls(root); render();
  }

  function setupCodec(root) {
    const decode = root.dataset.cpCodec === 'decode';
    const fixture = Core.HUFFMAN_EXAMPLE;
    const tree = Core.huffmanFromCodes(fixture.frequencies, fixture.codes);
    const input = one(root, '[data-cp-codec-input]');
    const next = one(root, '[data-cp-codec-next]');
    const status = one(root, '[data-cp-codec-status]');
    let step = 0;
    const render = () => {
      const source = clean(input.value);
      const valid = decode ? /^[01]{1,80}$/.test(source) : /^[A-E]{1,80}$/.test(source);
      input.setAttribute('aria-invalid', String(!valid));
      const sourceDisplay = one(root, '[data-cp-codec-source]');
      const output = one(root, '[data-cp-codec-output]');
      sourceDisplay.replaceChildren(); output.replaceChildren();
      renderCodes(one(root, '[data-cp-codes]'), fixture);
      if (!valid) {
        sourceDisplay.textContent = source || '（未入力）';
        status.textContent = decode ? '0と1を1〜80桁で入力してください。' : 'A〜Eの文字を1〜80文字で入力してください。';
        next.disabled = true; renderTree(one(root, '[data-cp-tree]'), [tree.root]); return;
      }
      [...source].forEach((char, index) => sourceDisplay.append(make('span', char, index === step - 1 ? 'is-current' : '')));
      let active = 'root';
      let symbol = '';
      let message = '';
      if (decode) {
        let node = tree.root;
        let restored = '';
        for (const bit of source.slice(0, step)) {
          node = bit === '0' ? node.zero : node.one;
          active = node.id; symbol = node.symbol || '';
          if (symbol) { restored += symbol; node = tree.root; }
        }
        output.textContent = restored || '（まだ文字は確定していません）';
        message = step === 0 ? '根からスタート。1bitずつ枝をたどります。' : symbol ? `${source[step - 1]}の枝で${symbol}に到着 → ${symbol}を復元。${step < source.length ? '次は根から読みます。' : '復元完了。'}` : `途中の節点です。${step === source.length ? '符号の途中で終わっています。続きを入力してください。' : '次のbitを読んで枝をたどります。'}`;
      } else {
        [...source.slice(0, step)].forEach((char, index) => output.append(make('span', fixture.codes[char], `cp-token${index === step - 1 ? ' is-current' : ''}`)));
        symbol = source[step - 1] || '';
        active = symbol ? fixture.codes[symbol] : 'root';
        message = symbol ? `${symbol} → ${fixture.codes[symbol]}（${fixture.codes[symbol].length}bit）。${step === source.length ? '符号化完了。' : ''}` : '左端の文字から、符号表を使って置き換えます。';
        if (!step) output.textContent = '（まだ符号化していません）';
      }
      renderCodes(one(root, '[data-cp-codes]'), fixture, true, symbol);
      renderTree(one(root, '[data-cp-tree]'), [tree.root], { active });
      status.textContent = `${step} / ${source.length}：${message}`;
      next.disabled = step >= source.length;
    };
    input.addEventListener('input', () => { step = 0; render(); });
    next.addEventListener('click', () => { step += 1; render(); });
    one(root, '[data-cp-codec-reset]').addEventListener('click', () => { step = 0; render(); });
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
