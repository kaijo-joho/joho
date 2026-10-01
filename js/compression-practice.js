// 再利用可能なハフマン木作成widget。選択中は正誤を表示せず、完成後にまとめて判定する。
(function (root) {
  'use strict';

  const mounted = new WeakMap();
  const bySelector = (host, selector) => host.querySelector(selector);
  const everySelector = (host, selector) => [...host.querySelectorAll(selector)];
  const cloneTree = node => node.symbol !== undefined
    ? { id: node.id, prefix: node.prefix, symbol: node.symbol, count: node.count }
    : { id: node.id, prefix: node.prefix, count: node.count, zero: cloneTree(node.zero), one: cloneTree(node.one) };

  function mount(host, { fixture, onChange, onJudge } = {}) {
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
    if (![tree, selection, status, joinButton, undoButton, resetButton, judgeButton, frequency, codes].every(Boolean)) {
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
      selection.textContent = chosen.length
        ? `選択：${chosen.map((node, index) => `${index + 1}つ目（${index === 0 ? '0' : '1'}の枝）＝${nodeLabel(node)}(${node.count})`).join('、')}`
        : '図の丸から、結合する根を2つ選びます。';
      const complete = forest.length === 1;
      const depth = Math.max(0, Object.keys(currentFixture.frequencies).length - 1);
      Views.renderTree(tree, forest, {
        reservedDepth: depth,
        selectable: complete ? [] : forest.map(node => node.id),
        selected,
        onSelect: selectNode,
        newParent
      });
      const displayCodes = complete ? Core.codesFromTree(forest[0]) : Object.fromEntries(Object.keys(currentFixture.frequencies).map(symbol => [symbol, '']));
      Views.renderCodes(codes, { frequencies: currentFixture.frequencies, codes: displayCodes }, complete);
      const frequencyText = Object.entries(currentFixture.frequencies).map(([symbol, count]) => `${symbol}${count}`).join('・');
      frequency.textContent = currentPresetIndex === null ? `頻度：${frequencyText}` : `例${currentPresetIndex + 1}：${frequencyText}`;
      presets.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.cpPracticePreset) === currentPresetIndex)));
      const requiredJoins = Math.max(0, Object.keys(currentFixture.frequencies).length - 1);
      const bitInfo = complete ? ` 完成時の合計は${Core.totalBits(forest[0])}bitです。` : '';
      status.textContent = notice || `結合${joins.length} / ${requiredJoins}。${complete ? `木が完成しました。${bitInfo}符号を確認して「${judgeButton.textContent}」を押してください。` : '結合する2つの根を選んでください。'}`;
      joinButton.disabled = complete || selected.length !== 2;
      undoButton.disabled = checkpoints.length === 0;
      judgeButton.disabled = !complete;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }

    function selectNode(id) {
      const index = selected.indexOf(id);
      if (index >= 0) selected.splice(index, 1);
      else if (selected.length < 2) selected.push(id);
      else return;
      // 選択操作だけでは正誤や親側の判定状態を変えない。
      render();
      focusNode(id);
    }

    function reset(nextFixture, nextPresetIndex) {
      const validatedFixture = validateFixture(nextFixture || currentFixture);
      const initialForest = Core.createForest(validatedFixture.frequencies);
      currentFixture = validatedFixture;
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

    joinButton.addEventListener('click', () => {
      const result = Core.joinForest(forest, selected);
      if (!result.ok) {
        notice = result.message;
        render();
        return;
      }
      checkpoints.push({ forest: forest.map(cloneTree), joins: joins.map(item => ({ selectedIds: [...item.selectedIds] })) });
      joins.push({ selectedIds: [...selected] });
      forest = result.forest;
      selected = [];
      judgment = null;
      notice = '';
      render(result.parent.id);
      emitChange();
      if (forest.length > 1) focusNode(forest[0].id);
      else judgeButton.focus({ preventScroll: true });
    });

    undoButton.addEventListener('click', () => {
      const previous = checkpoints.pop();
      if (!previous) return;
      forest = previous.forest;
      joins = previous.joins;
      selected = [];
      judgment = null;
      notice = '';
      render();
      emitChange();
      focusNode(forest[0].id);
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
      judgment = Core.gradeForest(forest, { frequencies: currentFixture.frequencies, joins: joins.map(item => ({ selectedIds: [...item.selectedIds] })) });
      notice = judgment.message;
      render();
      if (typeof onJudge === 'function') onJudge(judgmentSnapshot(judgment), stateSnapshot());
    });

    const api = Object.freeze({
      getState: stateSnapshot,
      reset(nextFixture) { reset(nextFixture); return stateSnapshot(); }
    });
    mounted.set(host, api);
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
