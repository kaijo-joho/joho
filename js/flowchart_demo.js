(() => {
  "use strict";

  const resultLabels = {
    searching: "探索中",
    found: "発見",
    missing: "見つからない",
    sorting: "並べ替え中",
    sorted: "完了"
  };

  function makeStep(node, edge, description, state, result = "searching") {
    return { node, edge, description, state: { ...state }, result };
  }

  function linearState(target, n, i = null, value = null, x = -1) {
    return {
      target,
      n,
      i,
      "arr[i]": value,
      x
    };
  }

  function binaryState(target, n, left, right, mid = null, value = null, x = -1) {
    return {
      target,
      n,
      left,
      right,
      mid,
      "arr[mid]": value,
      x
    };
  }

  function buildLinearSteps(array, target) {
    const n = array.length;
    const steps = [
      makeStep(
        "prepare",
        null,
        `配列 arr と探索値 target = ${target} を準備します。`,
        linearState(target, null, null, null, null)
      ),
      makeStep(
        "init",
        "prepare-init",
        `探索値の位置 x を -1、配列の長さ n を ${n} に初期化します。x = -1 は、まだ見つかっていないことを表します。`,
        linearState(target, n)
      )
    ];

    for (let i = 0; i < n; i += 1) {
      const value = array[i];
      const state = linearState(target, n, i, value);
      steps.push(
        makeStep(
          "loop",
          i === 0 ? "init-loop" : "next-loop",
          `i = ${i} は 0〜${n - 1} の範囲内なので、${i} 番目の要素を調べます。`,
          state
        ),
        makeStep(
          "compare",
          "loop-compare",
          `arr[${i}] は ${value} です。${value} == ${target} は ${value === target ? "True" : "False"} です。`,
          state
        )
      );

      if (value === target) {
        const foundState = linearState(target, n, i, value, i);
        steps.push(
          makeStep(
            "set-found",
            "compare-found",
            `判定が True なので、x = i = ${i} として繰り返しを終了します。`,
            foundState
          ),
          makeStep(
            "found",
            "found-result",
            `探索値 ${target} は、配列のインデックス番号 ${i} にあります。`,
            foundState,
            "found"
          )
        );
        return steps;
      }

      steps.push(
        makeStep(
          "next",
          "compare-next",
          i < n - 1
            ? `判定が False なので、次の要素へ進みます。`
            : `判定が False で、配列の最後まで調べ終わりました。`,
          state
        )
      );
    }

    steps.push(
      makeStep(
        "missing",
        "next-missing",
        `すべての要素を調べても ${target} と一致しなかったため、x は -1 のままです。探索値は存在しません。`,
        linearState(target, n, n - 1, array[n - 1], -1),
        "missing"
      )
    );
    return steps;
  }

  function buildBinarySteps(array, target) {
    const n = array.length;
    let left = 0;
    let right = n - 1;
    const steps = [
      makeStep(
        "prepare",
        null,
        `整列済みの配列 arr と探索値 target = ${target} を準備します。`,
        binaryState(target, null, null, null, null, null, null)
      ),
      makeStep(
        "init",
        "prepare-init",
        `x を -1、n を ${n}、left を 0、right を ${right} に初期化します。`,
        binaryState(target, n, left, right)
      )
    ];

    let firstLoop = true;
    while (left <= right) {
      const loopEdge = firstLoop ? "init-loop" : "repeat-loop";
      firstLoop = false;
      steps.push(
        makeStep(
          "loop",
          loopEdge,
          `left <= right を確かめます。${left} <= ${right} は True なので、探索を続けます。`,
          binaryState(target, n, left, right)
        )
      );

      const mid = Math.floor((left + right) / 2);
      const value = array[mid];
      const comparisonState = binaryState(target, n, left, right, mid, value);
      steps.push(
        makeStep(
          "mid",
          "loop-mid",
          `mid = (${left} + ${right}) // 2 = ${mid} です。中央の値 arr[${mid}] は ${value} です。`,
          comparisonState
        ),
        makeStep(
          "equal",
          "mid-equal",
          `${value} == ${target} は ${value === target ? "True" : "False"} です。`,
          comparisonState
        )
      );

      if (value === target) {
        const foundState = binaryState(target, n, left, right, mid, value, mid);
        steps.push(
          makeStep(
            "set-found",
            "equal-found",
            `判定が True なので、x = mid = ${mid} として繰り返しを終了します。`,
            foundState
          ),
          makeStep(
            "found",
            "found-result",
            `探索値 ${target} は、配列のインデックス番号 ${mid} にあります。`,
            foundState,
            "found"
          )
        );
        return steps;
      }

      steps.push(
        makeStep(
          "less",
          "equal-less",
          `${value} < ${target} は ${value < target ? "True" : "False"} です。`,
          comparisonState
        )
      );

      let repeatEdge;
      if (value < target) {
        left = mid + 1;
        repeatEdge = "left-repeat";
        steps.push(
          makeStep(
            "left",
            "less-left",
            `判定が True なので、left = mid + 1 = ${left} とし、左半分を探索範囲から外します。`,
            binaryState(target, n, left, right, mid, value)
          )
        );
      } else {
        right = mid - 1;
        repeatEdge = "right-repeat";
        steps.push(
          makeStep(
            "right",
            "less-right",
            `判定が False なので、right = mid - 1 = ${right} とし、右半分を探索範囲から外します。`,
            binaryState(target, n, left, right, mid, value)
          )
        );
      }

      const repeatState = binaryState(target, n, left, right, mid, value);
      steps.push(
        makeStep(
          "repeat",
          repeatEdge,
          left <= right
            ? `探索範囲をインデックス番号 ${left}〜${right} に狭め、繰り返します。`
            : `left = ${left}、right = ${right} となり、探索範囲がなくなりました。`,
          repeatState
        )
      );
    }

    steps.push(
      makeStep(
        "missing",
        "repeat-missing",
        `探索範囲がなくなるまで調べても ${target} と一致しなかったため、x は -1 のままです。探索値は存在しません。`,
        binaryState(target, n, left, right, null, null),
        "missing"
      )
    );
    return steps;
  }

  function parseArray(value) {
    const array = String(value)
      .split(",")
      .map((part) => Number(part.trim()));
    return array.length > 0 && array.every(Number.isSafeInteger) ? array : [];
  }

  function collectElements(svg, attribute) {
    const elements = new Map();
    svg.querySelectorAll(`[${attribute}]`).forEach((element) => {
      const key = element.getAttribute(attribute);
      const group = elements.get(key) || [];
      group.push(element);
      elements.set(key, group);
    });
    return elements;
  }

  function markElements(elements, key, className) {
    if (!key || !elements.has(key)) return;
    elements.get(key).forEach((element) => element.classList.add(className));
  }

  function renderState(container, state) {
    const fragment = document.createDocumentFragment();
    Object.entries(state).forEach(([name, value]) => {
      const item = document.createElement("span");
      const code = document.createElement("code");
      item.className = "flowchart-demo__state-item";
      if (name === "arr") item.classList.add("flowchart-demo__state-item--array");
      code.textContent = `${name} = ${value === null ? "—" : value}`;
      item.append(code);
      fragment.append(item);
    });
    container.replaceChildren(fragment);
  }

  function centerCurrentNode(figure, svg, nodeElements, node) {
    if (!nodeElements.has(node)) return;
    const element = nodeElements.get(node)[0];
    if (typeof element.getBBox !== "function" || typeof figure.scrollTo !== "function") return;

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const bounds = svg.getBoundingClientRect();
    if (!viewBox || !viewBox.width || !viewBox.height || !bounds.width || !bounds.height) return;

    try {
      const box = element.getBBox();
      const scaleX = bounds.width / viewBox.width;
      const scaleY = bounds.height / viewBox.height;
      const left = (box.x + box.width / 2 - viewBox.x) * scaleX - figure.clientWidth / 2;
      const top = (box.y + box.height / 2 - viewBox.y) * scaleY - figure.clientHeight / 2;
      const reducedMotion = globalThis.matchMedia
        && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
      figure.scrollTo({
        left: Math.max(0, Math.min(left, figure.scrollWidth - figure.clientWidth)),
        top: Math.max(0, Math.min(top, figure.scrollHeight - figure.clientHeight)),
        behavior: reducedMotion ? "auto" : "smooth"
      });
    } catch (_error) {
      // SVGが非表示などで寸法を取得できない場合も、ステップ操作自体は継続する。
    }
  }

  function setupFlowchart(root, providedBuildSteps = null) {
    const type = root.dataset.flowchartDemo;
    const array = parseArray(root.dataset.flowArray);
    const svg = root.querySelector("svg.flowchart");
    const figure = root.querySelector(".flowchart-figure");
    const form = root.querySelector(".flowchart-demo__form");
    const input = root.querySelector("[data-flow-target]");
    const description = root.querySelector("[data-flow-description]");
    const progress = root.querySelector("[data-flow-progress]");
    const stateContainer = root.querySelector("[data-flow-state]");
    const restartButton = root.querySelector("[data-flow-restart]");
    const backButton = root.querySelector("[data-flow-back]");
    const nextButton = root.querySelector("[data-flow-next]");

    if (!array.length || !svg || !figure || !form || !description
      || !progress || !stateContainer || !restartButton || !backButton || !nextButton) {
      return;
    }

    const buildSteps = providedBuildSteps || (type === "linear" ? buildLinearSteps
      : type === "binary" ? buildBinarySteps
        : null);
    if (!buildSteps) return;

    const nodeElements = collectElements(svg, "data-flow-node");
    const edgeElements = collectElements(svg, "data-flow-edge");
    const taggedElements = svg.querySelectorAll("[data-flow-node], [data-flow-edge]");
    let steps = [];
    let currentIndex = 0;

    function showOverview() {
      steps = [];
      currentIndex = 0;
      taggedElements.forEach((element) => element.classList.remove("is-visited", "is-current"));
      root.classList.remove("is-ready");
      delete root.dataset.flowResult;
      delete svg.dataset.currentNode;
      delete progress.dataset.result;
      progress.textContent = "デモ未開始 ・ 全体表示";
      description.textContent = input
        ? "探索値を指定して「この値で開始」を押すと、処理を順番にたどれます。"
        : "「この配列で開始」を押すと、処理を順番にたどれます。";
      stateContainer.replaceChildren();
      restartButton.disabled = true;
      backButton.disabled = true;
      nextButton.disabled = true;
      nextButton.textContent = "次へ";
    }

    function render() {
      const current = steps[currentIndex];
      if (!current) return;

      taggedElements.forEach((element) => element.classList.remove("is-visited", "is-current"));
      steps.slice(0, currentIndex + 1).forEach((step) => {
        markElements(nodeElements, step.node, "is-visited");
        markElements(edgeElements, step.edge, "is-visited");
      });
      markElements(nodeElements, current.node, "is-current");
      markElements(edgeElements, current.edge, "is-current");

      root.classList.add("is-ready");
      root.dataset.flowResult = current.result;
      svg.dataset.currentNode = current.node;
      progress.dataset.result = current.result;
      progress.textContent = `ステップ ${currentIndex + 1} / ${steps.length} ・ ${resultLabels[current.result]}`;
      description.textContent = current.description;
      renderState(stateContainer, current.state);

      restartButton.disabled = false;
      backButton.disabled = currentIndex === 0;
      nextButton.disabled = currentIndex === steps.length - 1;
      nextButton.textContent = currentIndex === steps.length - 1 ? "完了" : "次へ";
      centerCurrentNode(figure, svg, nodeElements, current.node);
    }

    function start() {
      let target;
      if (input) {
        input.setCustomValidity("");
        target = Number(input.value);
        if (!input.checkValidity() || !Number.isSafeInteger(target)) {
          input.setCustomValidity("探索値には整数を入力してください。");
          input.reportValidity();
          input.focus();
          return;
        }
      }

      steps = input ? buildSteps(array, target) : buildSteps(array);
      currentIndex = 0;
      render();
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      start();
    });
    if (input) input.addEventListener("input", () => input.setCustomValidity(""));
    restartButton.addEventListener("click", () => {
      currentIndex = 0;
      render();
    });
    backButton.addEventListener("click", () => {
      if (currentIndex === 0) return;
      currentIndex -= 1;
      render();
    });
    nextButton.addEventListener("click", () => {
      if (currentIndex >= steps.length - 1) return;
      currentIndex += 1;
      render();
    });

    showOverview();
  }

  const api = Object.freeze({
    buildLinearSteps,
    buildBinarySteps,
    mount: setupFlowchart
  });

  globalThis.FlowchartDemo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    document.querySelectorAll("[data-flowchart-demo]").forEach(setupFlowchart);
  }
})();
