// 再利用可能なハフマン木作成widget。選択中は正誤を表示せず、完成後にまとめて判定する。
(function (root) {
  'use strict';

  const mounted = new WeakMap();
  const bySelector = (host, selector) => host.querySelector(selector);
  const everySelector = (host, selector) => [...host.querySelectorAll(selector)];
  const cloneTree = node => node.symbol !== undefined
    ? { id: node.id, prefix: node.prefix, symbol: node.symbol, count: node.count }
    : { id: node.id, prefix: node.prefix, count: node.count, zero: cloneTree(node.zero), one: cloneTree(node.one) };

  function mount(host, { fixture, sortLeavesByFrequency = false, onChange, onJudge } = {}) {
    if (!host || typeof host.querySelector !== 'function') throw new TypeError('widgetのroot要素を指定してください');
    if (mounted.has(host)) return mounted.get(host);
    const Core = root.CompressionPracticeCore;
    const Views = root.CompressionLessonViews;
    if (!Core || !Views) throw new Error('圧縮教材の木描画機能を読み込んでください');
    const defaultFixture = { frequencies: { A: 9, B: 7, C: 3, D: 2, E: 1 } };
    const presets = everySelector(host, '[data-cp-practice-preset]');
    const presetMode = fixture === undefined && presets.length > 0 && root.CompressionCore?.HUFFMAN_PRACTICE?.length;
    let currentPresetIndex = presetMode
      ? Math.max(0, presets.findIndex(button => button.getAttribute('aria-pressed') === 'true'))
      : null;
    let currentFixture = fixture || (presetMode ? root.CompressionCore.HUFFMAN_PRACTICE[currentPresetIndex] : defaultFixture);
    const tree = bySelector(host, '[data-cp-tree]');
    const selection = bySelector(host, '[data-cp-practice-selection]');
    const status = bySelector(host, '[data-cp-build-status]');
    const joinButton = bySelector(host, '[data-cp-practice-join]');
    const undoButton = bySelector(host, '[data-cp-practice-undo]');
    const resetButton = bySelector(host, '[data-cp-practice-reset]');
    const judgeButton = bySelector(host, '[data-cp-practice-judge]');
    const frequency = bySelector(host, '[data-cp-practice-frequency]');
    const codes = bySelector(host, '[data-cp-codes]');
    if (![tree, selection, status, undoButton, resetButton, judgeButton, frequency, codes].every(Boolean)) {
      throw new Error('ハフマン練習widgetに必要な表示要素がありません');
    }
    if (onChange !== undefined && typeof onChange !== 'function') throw new TypeError('onChangeは関数で指定してください');
    if (onJudge !== undefined && typeof onJudge !== 'function') throw new TypeError('onJudgeは関数で指定してください');
    host.classList.add('cp-huffman-practice');

    let forest = [];
    let joins = [];
    let checkpoints = [];
    let selected = [];
    let judgment = null;
    let notice = '';
    let leafOrder = [];
    let positionCache = new Map();

    function validateFixture(value) {
      if (!value || typeof value !== 'object' || !value.frequencies) throw new RangeError('出現回数を含むfixtureを指定してください');
      return { frequencies: Object.fromEntries(Object.entries(value.frequencies)) };
    }
    function judgmentSnapshot(value) {
      return value ? {
        ...value,
        expectedCounts: value.expectedCounts && [...value.expectedCounts],
        selectedCounts: value.selectedCounts && [...value.selectedCounts],
        codes: value.codes && { ...value.codes }
      } : null;
    }
    function stateSnapshot() {
      const complete = forest.length === 1;
      const treeValue = complete ? cloneTree(forest[0]) : null;
      const codeValue = complete ? { ...Core.codesFromTree(treeValue) } : null;
      return {
        forest: forest.map(cloneTree),
        codes: codeValue,
        complete,
        judgment: judgmentSnapshot(judgment)
      };
    }
    function emitChange() { if (typeof onChange === 'function') onChange(stateSnapshot()); }
    const nodeLabel = node => node.symbol || `${[...node.id.slice('node:'.length)].join('・')}（結合済み）`;
    const focusNode = id => everySelector(tree, '[data-cp-practice-node]').find(node => node.dataset.cpPracticeNode === id)?.focus({ preventScroll: true });

    function render(newParent = '') {
      const chosen = selected.map(id => forest.find(node => node.id === id)).filter(Boolean);
      const removable = chosen.length === 1 && chosen[0].symbol === undefined
        && joins.some(item => item.parentId === chosen[0].id);
      selection.textContent = chosen.length
        ? `選択：${chosen.map((node, index) => `${index + 1}つ目${chosen.length === 2 ? `（${index === 0 ? '0' : '1'}の枝）` : ''}＝${nodeLabel(node)}(${node.count})`).join('、')}${removable ? '。近くの「結合解除」でこの結合と、それ以降の結合を戻します。' : ''}`
        : '図の丸を2つ選ぶと自動で結合します。結合した根を1つ選ぶと「結合解除」を表示します。';
      const complete = forest.length === 1;
      const depth = Math.max(0, Object.keys(currentFixture.frequencies).length - 1);
      Views.renderTree(tree, forest, {
        reservedDepth: depth,
        leafOrder,
        positionCache,
        selectable: forest.map(node => node.id),
        selected,
        onSelect: selectNode,
        newParent
      });
      if (removable) renderUnjoinButton(chosen[0]);
      const displayCodes = complete ? Core.codesFromTree(forest[0]) : Object.fromEntries(Object.keys(currentFixture.frequencies).map(symbol => [symbol, '']));
      Views.renderCodes(codes, { frequencies: currentFixture.frequencies, codes: displayCodes }, complete);
      const frequencyText = Object.entries(currentFixture.frequencies).map(([symbol, count]) => `${symbol}${count}`).join('・');
      frequency.textContent = currentPresetIndex === null ? `頻度：${frequencyText}` : `例${currentPresetIndex + 1}：${frequencyText}`;
      presets.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.cpPracticePreset) === currentPresetIndex)));
      const requiredJoins = Math.max(0, Object.keys(currentFixture.frequencies).length - 1);
      const bitInfo = complete ? ` 完成時の合計は${Core.totalBits(forest[0])}bitです。` : '';
      status.textContent = notice || `結合${joins.length} / ${requiredJoins}。${complete ? `木が完成しました。${bitInfo}符号を確認して「${judgeButton.textContent}」を押してください。` : '結合する2つの根を選んでください。'}`;
      if (joinButton) joinButton.disabled = complete || selected.length !== 2;
      undoButton.disabled = checkpoints.length === 0;
      judgeButton.disabled = !complete;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }

    function selectNode(id) {
      const index = selected.indexOf(id);
      if (index >= 0) selected.splice(index, 1);
      else if (selected.length < 2) selected.push(id);
      else return;
      // 2つ目の選択で結合し、正誤は完成後の採点まで表示しない。
      if (selected.length === 2) joinSelected();
      else { render(); focusNode(id); }
    }

    function positionUnjoinButton(button, id) {
      const circle = [...tree.querySelectorAll('[data-cp-node]')]
        .find(element => element.dataset.cpNode === id)?.querySelector('circle');
      if (!circle) return;
      const bounds = circle.getBoundingClientRect();
      const viewport = tree.getBoundingClientRect();
      const canvas = tree.querySelector('svg').getBoundingClientRect();
      const width = button.offsetWidth;
      const height = button.offsetHeight;
      const centreX = bounds.left + bounds.width / 2;
      const centreY = bounds.top + bounds.height / 2;
      const obstacles = [...tree.querySelectorAll('[data-cp-node]')]
        .filter(element => element.dataset.cpNode !== id).map(element => element.getBoundingClientRect());
      const candidates = [
        { x: bounds.right + 12, y: centreY - height / 2 },
        { x: bounds.left - width - 12, y: centreY - height / 2 },
        { x: centreX - width / 2, y: bounds.top - height - 14 },
        { x: centreX - width / 2, y: bounds.bottom + 14 }
      ];
      const point = candidates.find(candidate => candidate.x >= canvas.left && candidate.x + width <= canvas.right
        && candidate.y >= viewport.top + 4 && candidate.y + height <= canvas.bottom
        && obstacles.every(obstacle => candidate.x + width + 4 <= obstacle.left || candidate.x - 4 >= obstacle.right
          || candidate.y + height + 4 <= obstacle.top || candidate.y - 4 >= obstacle.bottom))
        // The reserved strip above the tree remains free even in a dense, crossed tree.
        || { x: Math.max(canvas.left, Math.min(centreX - width / 2, canvas.right - width)), y: viewport.top + 8 };
      button.style.left = `${point.x - viewport.left + tree.scrollLeft}px`;
      button.style.top = `${point.y - viewport.top + tree.scrollTop}px`;
    }

    function renderUnjoinButton(node) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dr-button cp-practice-unjoin';
      button.dataset.cpPracticeUnjoin = node.id;
      button.textContent = '結合解除';
      button.title = 'この結合と、それ以降の結合を戻す';
      button.setAttribute('aria-label', `${nodeLabel(node)}の結合と、それ以降の結合を戻す`);
      button.addEventListener('click', () => unjoin(node.id));
      tree.append(button);
      positionUnjoinButton(button, node.id);
    }

    function joinSelected() {
      const result = Core.joinForest(forest, selected);
      if (!result.ok) {
        notice = result.message;
        selected = [];
        render();
        return;
      }
      checkpoints.push({
        forest: forest.map(cloneTree),
        joins: joins.map(item => ({ selectedIds: [...item.selectedIds], parentId: item.parentId })),
        positionCache: new Map([...positionCache].map(([id, point]) => [id, { ...point }]))
      });
      joins.push({ selectedIds: [...selected], parentId: result.parent.id });
      forest = result.forest;
      selected = [];
      judgment = null;
      notice = '';
      render(result.parent.id);
      emitChange();
      if (forest.length > 1) focusNode(forest[0].id);
      else judgeButton.focus({ preventScroll: true });
    }

    function unjoin(parentId) {
      const joinIndex = joins.findIndex(item => item.parentId === parentId);
      const checkpoint = checkpoints[joinIndex];
      if (joinIndex < 0 || !checkpoint) return;
      forest = checkpoint.forest.map(cloneTree);
      joins = checkpoint.joins.map(item => ({ selectedIds: [...item.selectedIds], parentId: item.parentId }));
      positionCache = new Map([...checkpoint.positionCache].map(([id, point]) => [id, { ...point }]));
      checkpoints = checkpoints.slice(0, joinIndex);
      selected = [];
      judgment = null;
      notice = 'この結合と、それ以降の結合を戻しました。';
      render();
      emitChange();
      focusNode(forest[0]?.id);
    }

    function reset(nextFixture, nextPresetIndex) {
      const validatedFixture = validateFixture(nextFixture || currentFixture);
      const initialForest = Core.createForest(validatedFixture.frequencies);
      currentFixture = validatedFixture;
      leafOrder = Object.keys(validatedFixture.frequencies);
      if (sortLeavesByFrequency) {
        leafOrder.sort((a, b) => validatedFixture.frequencies[b] - validatedFixture.frequencies[a] || a.localeCompare(b));
      }
      positionCache = new Map();
      if (nextPresetIndex !== undefined) currentPresetIndex = nextPresetIndex;
      else if (nextFixture && currentPresetIndex !== null) {
        const matchingIndex = root.CompressionCore.HUFFMAN_PRACTICE.findIndex(item => JSON.stringify(item.frequencies) === JSON.stringify(validatedFixture.frequencies));
        currentPresetIndex = matchingIndex < 0 ? null : matchingIndex;
      }
      forest = initialForest;
      joins = [];
      checkpoints = [];
      selected = [];
      judgment = null;
      notice = '';
      render();
      emitChange();
    }

    if (joinButton) joinButton.addEventListener('click', joinSelected);

    undoButton.addEventListener('click', () => {
      const previous = checkpoints.pop();
      if (!previous) return;
      forest = previous.forest;
      joins = previous.joins.map(item => ({ selectedIds: [...item.selectedIds], parentId: item.parentId }));
      positionCache = new Map([...previous.positionCache].map(([id, point]) => [id, { ...point }]));
      selected = [];
      judgment = null;
      notice = '';
      render();
      emitChange();
      focusNode(forest[0]?.id);
    });

    resetButton.addEventListener('click', () => reset());
    if (presetMode) presets.forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.cpPracticePreset);
      const presetFixture = root.CompressionCore.HUFFMAN_PRACTICE[index];
      if (!presetFixture) return;
      reset(presetFixture, index);
    }));
    judgeButton.addEventListener('click', () => {
      if (forest.length !== 1) return;
      judgment = Core.gradeForest(forest, { frequencies: currentFixture.frequencies, joins: joins.map(item => ({ selectedIds: [...item.selectedIds], parentId: item.parentId })) });
      notice = judgment.message;
      render();
      if (typeof onJudge === 'function') onJudge(judgmentSnapshot(judgment), stateSnapshot());
    });

    const api = Object.freeze({
      getState: stateSnapshot,
      reset(nextFixture) { reset(nextFixture); return stateSnapshot(); }
    });
    mounted.set(host, api);
    if (typeof root.ResizeObserver === 'function') {
      const observer = new root.ResizeObserver(() => {
        const button = bySelector(tree, '[data-cp-practice-unjoin]');
        if (button) positionUnjoinButton(button, button.dataset.cpPracticeUnjoin);
      });
      observer.observe(tree, { box: 'border-box' });
    }
    everySelector(host, '.cp-enhancement').forEach(element => { element.hidden = false; });
    reset(currentFixture, currentPresetIndex === null ? undefined : currentPresetIndex);
    return api;
  }

  root.CompressionPractice = Object.freeze({ mount });

  function initialize() {
    if (!root.document || !root.CompressionPracticeCore) return;
    root.document.querySelectorAll('[data-cp-huffman-practice]').forEach(host => {
      try { mount(host); }
      catch (error) { console.error('ハフマン木の練習を初期化できませんでした。', error); }
    });
  }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
  }
})(typeof window === 'object' ? window : globalThis);
