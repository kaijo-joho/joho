// 頻度を数える導入と、自分で最小の2節点を選ぶハフマン木の練習。
(function () {
  'use strict';
  const one = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const resized = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));

  function setupFrequency(root) {
    const fixture = window.CompressionCore.HUFFMAN_EXAMPLE;
    const Views = window.CompressionLessonViews;
    const source = one(root, '[data-cp-frequency-text]');
    const form = one(root, '[data-cp-frequency-form]');
    const result = one(root, '[data-cp-frequency-result]');
    const status = one(root, '[data-cp-frequency-status]');
    const scanStatus = one(root, '[data-cp-frequency-scan-status]');
    const bars = one(root, '[data-cp-frequency-bars]');
    const next = one(root, '[data-cp-frequency-next]');
    const characters = Array.from(fixture.text);
    let step = 0, selected = '';
    const fields = Object.keys(fixture.frequencies).map(symbol => ({
      input: one(form, `[data-cp-frequency-answer="${symbol}"]`),
      expected: fixture.frequencies[symbol], label: `${symbol}の頻度`
    }));
    source.replaceChildren(...characters.map((symbol, index) => {
      const button = make('button', symbol, 'cp-frequency-character');
      button.type = 'button'; button.setAttribute('aria-label', `${index + 1}文字目の${symbol}。同じ文字を強調する`);
      button.addEventListener('click', () => { selected = selected === symbol ? '' : symbol; render(); });
      return button;
    }));
    function render() {
      all(source, 'button').forEach((button, index) => {
        button.setAttribute('aria-pressed', String(button.textContent === selected));
        button.classList.toggle('is-current', index === step - 1);
      });
      const counts = Object.fromEntries(Object.keys(fixture.frequencies).map(symbol => [symbol, 0]));
      characters.slice(0, step).forEach(symbol => { counts[symbol] += 1; });
      bars.replaceChildren(...Object.keys(counts).map(symbol => {
        const row = make('div', undefined, 'cp-frequency-row');
        const track = make('div', undefined, 'cp-frequency-track');
        const bar = make('div', undefined, 'cp-frequency-bar');
        bar.style.setProperty('--cp-bar', `${counts[symbol] / characters.length * 100}%`);
        track.append(bar); row.append(make('strong', symbol), track, make('span', `${counts[symbol]}回`));
        return row;
      }));
      scanStatus.textContent = `${step} / ${characters.length}文字を読み取りました。${step ? `今回の文字：${characters[step - 1]}。` : '「1文字を数える」で頻度の増え方を確かめられます。'}${step === characters.length ? '数えた頻度を上の欄に入力して判定しましょう。' : ''}`;
      next.disabled = step >= characters.length;
      resized();
    }
    form.addEventListener('submit', event => {
      event.preventDefault(); Views.gradeFields(fields, status);
      const correct = fields.every(field => field.input.getAttribute('aria-invalid') === 'false');
      result.hidden = !correct;
      if (correct) status.textContent = '頻度は正解です。下の符号表と、固定長・可変長のデータ量を比較しましょう。符号の作り方は次のスライドで確かめます。';
      resized();
    });
    form.addEventListener('input', event => {
      event.target.removeAttribute('aria-invalid'); status.textContent = ''; result.hidden = true; resized();
    });
    next.addEventListener('click', () => { step += 1; selected = ''; render(); });
    one(root, '[data-cp-frequency-reset]').addEventListener('click', () => {
      step = 0; selected = ''; result.hidden = true; status.textContent = '';
      fields.forEach(field => { field.input.value = ''; field.input.removeAttribute('aria-invalid'); }); render();
    });
    all(root, '.cp-enhancement').forEach(node => { node.hidden = false; }); result.hidden = true; render();
  }

  function setupPractice(root) {
    const Core = window.CompressionPracticeCore;
    const Views = window.CompressionLessonViews;
    const fixtures = window.CompressionCore.HUFFMAN_PRACTICE;
    const preset = one(root, '[data-cp-build-preset]');
    const candidates = one(root, '[data-cp-practice-candidates]');
    const selection = one(root, '[data-cp-practice-selection]');
    const status = one(root, '[data-cp-build-status]');
    const join = one(root, '[data-cp-practice-join]');
    const undo = one(root, '[data-cp-practice-undo]');
    let fixture, forest, history = [], selected = [], message = '';
    const label = node => node.symbol || `${[...node.id.slice('node:'.length)].join('・')}（結合済み）`;
    function render() {
      candidates.replaceChildren(...forest.slice().sort((a, b) => a.id.localeCompare(b.id)).map(node => {
        const button = make('button', `${label(node)}：${node.count}回`, 'dr-button cp-practice-node');
        button.type = 'button'; button.dataset.cpPracticeNode = node.id;
        button.setAttribute('aria-pressed', String(selected.includes(node.id)));
        button.disabled = forest.length === 1;
        button.addEventListener('click', () => {
          const index = selected.indexOf(node.id);
          if (index >= 0) { selected.splice(index, 1); message = ''; }
          else if (selected.length < 2) { selected.push(node.id); message = ''; }
          else { message = '2つまで選べます。変更するときは、選択済みの節点をもう一度押してください。'; }
          const focusId = node.id; render();
          all(candidates, 'button').find(button => button.dataset.cpPracticeNode === focusId)?.focus({ preventScroll: true });
        });
        return button;
      }));
      const chosen = selected.map(id => forest.find(node => node.id === id));
      selection.textContent = chosen.length ? `選択：${chosen.map((node, index) => `${index === 0 ? '0の枝' : '1の枝'}＝${label(node)}(${node.count})`).join('、')}` : '残っている節点から、頻度の小さい2つを選びます。';
      Views.renderTree(one(root, '[data-cp-tree]'), forest);
      const done = forest.length === 1;
      Views.renderCodes(one(root, '[data-cp-codes]'), { frequencies: fixture.frequencies, codes: done ? Core.codesFromTree(forest[0]) : fixture.codes }, done);
      status.textContent = message ? `結合${history.length} / 4。${message}` : `結合${history.length} / 4。${done ? `木が完成しました。合計${Core.totalBits(forest[0])}bitです。根から枝をたどり、符号を確認しましょう。` : '同じ頻度の候補が複数ある場合は、どれを選んでも条件を満たせば正解です。'}`;
      join.disabled = done || selected.length !== 2; undo.disabled = history.length === 0;
      resized();
    }
    function reset() {
      fixture = fixtures[Number(preset.value)]; forest = Core.createForest(fixture.frequencies);
      history = []; selected = []; message = ''; render();
    }
    join.addEventListener('click', () => {
      const result = Core.joinForest(forest, selected);
      message = result.message;
      if (result.ok) {
        history.push(forest); forest = result.forest; selected = [];
        if (forest.length === 1) message += ` 木が完成しました。合計${Core.totalBits(forest[0])}bit。符号は枝の向きで異なりますが、どれもこの木で復元できます。`;
      }
      render();
      (forest.length === 1 ? one(root, '[data-cp-practice-reset]') : all(candidates, 'button')[0])?.focus({ preventScroll: true });
    });
    undo.addEventListener('click', () => {
      if (!history.length) return;
      forest = history.pop(); selected = []; message = '1つ前の結合へ戻りました。'; render();
      (undo.disabled ? all(candidates, 'button')[0] : undo)?.focus({ preventScroll: true });
    });
    one(root, '[data-cp-practice-reset]').addEventListener('click', reset);
    preset.addEventListener('change', reset);
    all(root, '.cp-enhancement').forEach(node => { node.hidden = false; }); reset();
  }

  function initialize() {
    [[ '[data-cp-frequency-example]', setupFrequency ], [ '[data-cp-huffman-practice]', setupPractice ]].forEach(([selector, setup]) => {
      all(document, selector).forEach(root => { try { setup(root); } catch (error) { console.error('頻度・ハフマン木の練習を初期化できませんでした。', error); } });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
