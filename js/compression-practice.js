// 図の丸から最小の2節点を選ぶハフマン木の練習。
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

  function setupPractice(root) {
    const Core = window.CompressionPracticeCore;
    const Views = window.CompressionLessonViews;
    const fixtures = window.CompressionCore.HUFFMAN_PRACTICE;
    const presets = all(root, '[data-cp-practice-preset]');
    const tree = one(root, '[data-cp-tree]');
    const selection = one(root, '[data-cp-practice-selection]');
    const status = one(root, '[data-cp-build-status]');
    const join = one(root, '[data-cp-practice-join]');
    const undo = one(root, '[data-cp-practice-undo]');
    let presetIndex = 0, fixture, forest, history = [], selected = [], message = '';
    const label = node => node.symbol || `${[...node.id.slice('node:'.length)].join('・')}（結合済み）`;
    const focusNode = id => all(tree, '[data-cp-practice-node]').find(node => node.dataset.cpPracticeNode === id)?.focus({ preventScroll: true });
    function selectNode(id) {
      const index = selected.indexOf(id);
      if (index >= 0) { selected.splice(index, 1); message = ''; }
      else if (selected.length < 2) { selected.push(id); message = ''; }
      else message = '2つまで選べます。変更するときは、選択済みの丸をもう一度押してください。';
      render(); focusNode(id);
    }
    function render(newParent = '') {
      const chosen = selected.map(id => forest.find(node => node.id === id));
      selection.textContent = chosen.length ? `選択：${chosen.map((node, index) => `${index + 1}つ目（${index === 0 ? '0' : '1'}の枝）＝${label(node)}(${node.count})`).join('、')}` : '図の丸から、頻度の小さい2つを選びます。';
      const done = forest.length === 1;
      Views.renderTree(tree, forest, { reservedDepth: 4, selectable: done ? [] : forest.map(node => node.id), selected, onSelect: selectNode, newParent });
      Views.renderCodes(one(root, '[data-cp-codes]'), { frequencies: fixture.frequencies, codes: done ? Core.codesFromTree(forest[0]) : fixture.codes }, done);
      status.textContent = message ? `結合${history.length} / 4。${message}` : `結合${history.length} / 4。${done ? `木が完成しました。合計${Core.totalBits(forest[0])}bitです。根から枝をたどり、符号を確認しましょう。` : '同じ頻度の候補が複数ある場合は、どれを選んでも条件を満たせば正解です。'}`;
      join.disabled = done || selected.length !== 2; undo.disabled = history.length === 0;
      presets.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.cpPracticePreset) === presetIndex)));
      one(root, '[data-cp-practice-frequency]').textContent = `例${presetIndex + 1}：${Object.entries(fixture.frequencies).map(([symbol, count]) => `${symbol}${count}`).join('・')}`;
      resized();
    }
    function reset() {
      fixture = fixtures[presetIndex]; forest = Core.createForest(fixture.frequencies);
      history = []; selected = []; message = ''; render();
    }
    join.addEventListener('click', () => {
      const result = Core.joinForest(forest, selected);
      message = result.message;
      if (result.ok) {
        history.push(forest); forest = result.forest; selected = [];
        if (forest.length === 1) message += ` 木が完成しました。合計${Core.totalBits(forest[0])}bit。符号は枝の向きで異なりますが、どれもこの木で復元できます。`;
      }
      render(result.ok ? result.parent.id : '');
      if (forest.length === 1) one(root, '[data-cp-practice-reset]').focus({ preventScroll: true });
      else focusNode(forest[0].id);
    });
    undo.addEventListener('click', () => {
      if (!history.length) return;
      forest = history.pop(); selected = []; message = '1つ前の結合へ戻りました。'; render();
      if (undo.disabled) focusNode(forest[0].id); else undo.focus({ preventScroll: true });
    });
    one(root, '[data-cp-practice-reset]').addEventListener('click', reset);
    presets.forEach(button => button.addEventListener('click', () => { presetIndex = Number(button.dataset.cpPracticePreset); reset(); }));
    all(root, '.cp-enhancement').forEach(node => { node.hidden = false; }); reset();
  }

  function initialize() {
    [[ '[data-cp-huffman-practice]', setupPractice ]].forEach(([selector, setup]) => {
      all(document, selector).forEach(root => { try { setup(root); } catch (error) { console.error('ハフマン木の練習を初期化できませんでした。', error); } });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
