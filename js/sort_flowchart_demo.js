(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function makeStep(node, edge, description, state, result = "sorting") {
    return { node, edge, description, state: { ...state }, result };
  }

  function arrayText(array) {
    return `[${array.join(", ")}]`;
  }

  function sortState(array, values = {}) {
    return { arr: arrayText(array), ...values };
  }

  function buildBubbleSteps(source) {
    const array = source.slice();
    const n = array.length;
    let comparisons = 0;
    let swaps = 0;
    const steps = [
      makeStep(
        "prepare",
        null,
        `配列 arr = ${arrayText(array)} を準備します。`,
        sortState(array, { n, i: null, j: null, 比較: comparisons, 交換: swaps })
      )
    ];

    for (let i = 0; i < n - 1; i += 1) {
      steps.push(
        makeStep(
          "outer",
          i === 0 ? "prepare-outer" : "pass-outer",
          `i = ${i} です。インデックス番号 ${i} 以降の未整列範囲を調べます。`,
          sortState(array, { n, i, j: null, 比較: comparisons, 交換: swaps })
        )
      );

      for (let j = n - 2; j >= i; j -= 1) {
        steps.push(
          makeStep(
            "inner",
            j === n - 2 ? "outer-inner" : "next-inner",
            `j = ${j} です。末尾側から隣り合う2要素を調べます。`,
            sortState(array, { n, i, j, 比較: comparisons, 交換: swaps })
          )
        );

        const leftValue = array[j];
        const rightValue = array[j + 1];
        comparisons += 1;
        steps.push(
          makeStep(
            "compare",
            "inner-compare",
            `${leftValue} > ${rightValue} は ${leftValue > rightValue ? "True" : "False"} です。`,
            sortState(array, { n, i, j, 比較: comparisons, 交換: swaps })
          )
        );

        let nextEdge = "compare-next";
        if (leftValue > rightValue) {
          [array[j], array[j + 1]] = [array[j + 1], array[j]];
          swaps += 1;
          steps.push(
            makeStep(
              "swap",
              "compare-swap",
              `${leftValue} と ${rightValue} を交換します。配列は ${arrayText(array)} になりました。`,
              sortState(array, { n, i, j, 比較: comparisons, 交換: swaps })
            )
          );
          nextEdge = "swap-next";
        }

        steps.push(
          makeStep(
            "next",
            nextEdge,
            j > i
              ? `j を ${j - 1} にして、1つ左の組を調べます。`
              : `j = i まで比較したので、この巡回は終了です。`,
            sortState(array, { n, i, j, 比較: comparisons, 交換: swaps })
          )
        );
      }

      steps.push(
        makeStep(
          "pass",
          "next-pass",
          `インデックス番号 ${i} の値 ${array[i]} が整列済みになりました。未整列範囲を1つ縮めます。`,
          sortState(array, { n, i, j: i, 比較: comparisons, 交換: swaps })
        )
      );
    }

    steps.push(
      makeStep(
        "done",
        "pass-done",
        `すべての値が昇順に並びました。`,
        sortState(array, { n, i: n - 1, j: null, 比較: comparisons, 交換: swaps }),
        "sorted"
      )
    );
    return steps;
  }

  function buildSelectionSteps(source) {
    const array = source.slice();
    const n = array.length;
    let comparisons = 0;
    let swaps = 0;
    const steps = [
      makeStep(
        "prepare",
        null,
        `配列 arr = ${arrayText(array)} を準備します。`,
        sortState(array, { n, i: null, j: null, min_index: null, 比較: comparisons, 交換: swaps })
      )
    ];

    for (let i = 0; i < n - 1; i += 1) {
      steps.push(
        makeStep(
          "outer",
          i === 0 ? "prepare-outer" : "commit-outer",
          `i = ${i} です。インデックス番号 ${i} 以降から最小値を探します。`,
          sortState(array, { n, i, j: null, min_index: null, 比較: comparisons, 交換: swaps })
        )
      );

      let minIndex = i;
      steps.push(
        makeStep(
          "init-min",
          "outer-init",
          `未整列範囲の先頭を暫定最小値とし、min_index = ${minIndex} にします。`,
          sortState(array, { n, i, j: null, min_index: minIndex, 比較: comparisons, 交換: swaps })
        )
      );

      for (let j = i + 1; j < n; j += 1) {
        steps.push(
          makeStep(
            "scan",
            j === i + 1 ? "init-scan" : "next-scan",
            `j = ${j} の値 ${array[j]} を、暫定最小値 ${array[minIndex]} と比較します。`,
            sortState(array, { n, i, j, min_index: minIndex, 比較: comparisons, 交換: swaps })
          )
        );

        const currentValue = array[j];
        const minValue = array[minIndex];
        comparisons += 1;
        steps.push(
          makeStep(
            "compare",
            "scan-compare",
            `${currentValue} < ${minValue} は ${currentValue < minValue ? "True" : "False"} です。`,
            sortState(array, { n, i, j, min_index: minIndex, 比較: comparisons, 交換: swaps })
          )
        );

        let nextEdge = "compare-next";
        if (currentValue < minValue) {
          minIndex = j;
          steps.push(
            makeStep(
              "update-min",
              "compare-update",
              `より小さい値が見つかったため、min_index = ${minIndex} に更新します。`,
              sortState(array, { n, i, j, min_index: minIndex, 比較: comparisons, 交換: swaps })
            )
          );
          nextEdge = "update-next";
        }

        steps.push(
          makeStep(
            "next-scan",
            nextEdge,
            j < n - 1
              ? `j を ${j + 1} にして、次の要素を調べます。`
              : `未整列範囲の末尾まで調べ終わりました。`,
            sortState(array, { n, i, j, min_index: minIndex, 比較: comparisons, 交換: swaps })
          )
        );
      }

      const shouldSwap = minIndex !== i;
      steps.push(
        makeStep(
          "check-swap",
          "next-check",
          `min_index != i は ${shouldSwap ? "True" : "False"} です。`,
          sortState(array, { n, i, j: n, min_index: minIndex, 比較: comparisons, 交換: swaps })
        )
      );

      let commitEdge = "check-commit";
      if (shouldSwap) {
        const startValue = array[i];
        const minValue = array[minIndex];
        [array[i], array[minIndex]] = [array[minIndex], array[i]];
        swaps += 1;
        steps.push(
          makeStep(
            "swap",
            "check-swap-path",
            `未整列範囲の先頭 ${startValue} と最小値 ${minValue} を交換します。`,
            sortState(array, { n, i, j: n, min_index: minIndex, 比較: comparisons, 交換: swaps })
          )
        );
        commitEdge = "swap-commit";
      }

      steps.push(
        makeStep(
          "commit",
          commitEdge,
          `インデックス番号 ${i} の値 ${array[i]} を整列済みとします。`,
          sortState(array, { n, i, j: null, min_index: minIndex, 比較: comparisons, 交換: swaps })
        )
      );
    }

    steps.push(
      makeStep(
        "done",
        "commit-done",
        `すべての値が昇順に並びました。`,
        sortState(array, { n, i: n - 1, j: null, min_index: null, 比較: comparisons, 交換: swaps }),
        "sorted"
      )
    );
    return steps;
  }

  function buildInsertionSteps(source) {
    const array = source.slice();
    const n = array.length;
    let comparisons = 0;
    let moves = 0;
    const steps = [
      makeStep(
        "prepare",
        null,
        `配列 arr = ${arrayText(array)} を準備し、先頭の要素を整列済みとします。`,
        sortState(array, { n, i: null, j: null, tmp: null, 挿入位置: null, 比較: comparisons, 移動: moves })
      )
    ];

    for (let i = 1; i < n; i += 1) {
      steps.push(
        makeStep(
          "outer",
          i === 1 ? "prepare-outer" : "commit-outer",
          `i = ${i} です。未整列範囲の先頭を、整列済み範囲へ挿入します。`,
          sortState(array, { n, i, j: null, tmp: null, 挿入位置: null, 比較: comparisons, 移動: moves })
        )
      );

      const tmp = array[i];
      let j = i - 1;
      steps.push(
        makeStep(
          "pick",
          "outer-pick",
          `arr[${i}] の値 ${tmp} を tmp に保存し、j = ${j} にします。`,
          sortState(array, { n, i, j, tmp, 挿入位置: null, 比較: comparisons, 移動: moves })
        )
      );

      let firstScan = true;
      let insertEdge = "next-insert";
      while (j >= 0) {
        steps.push(
          makeStep(
            "scan",
            firstScan ? "pick-scan" : "next-scan",
            `整列済み範囲を後ろから調べます。現在は j = ${j} です。`,
            sortState(array, { n, i, j, tmp, 挿入位置: null, 比較: comparisons, 移動: moves })
          )
        );
        firstScan = false;

        const currentValue = array[j];
        comparisons += 1;
        steps.push(
          makeStep(
            "compare",
            "scan-compare",
            `${currentValue} > ${tmp} は ${currentValue > tmp ? "True" : "False"} です。`,
            sortState(array, { n, i, j, tmp, 挿入位置: null, 比較: comparisons, 移動: moves })
          )
        );

        if (currentValue <= tmp) {
          insertEdge = "compare-insert";
          break;
        }

        array[j + 1] = array[j];
        moves += 1;
        steps.push(
          makeStep(
            "shift",
            "compare-shift",
            `${currentValue} をインデックス番号 ${j + 1} へ1つ右にずらします。`,
            sortState(array, { n, i, j, tmp, 挿入位置: null, 比較: comparisons, 移動: moves })
          )
        );

        j -= 1;
        steps.push(
          makeStep(
            "next",
            "shift-next",
            j >= 0
              ? `j を ${j} にして、さらに左の要素を調べます。`
              : `j = -1 となり、整列済み範囲の先頭まで調べ終わりました。`,
            sortState(array, { n, i, j, tmp, 挿入位置: null, 比較: comparisons, 移動: moves })
          )
        );
        insertEdge = "next-insert";
      }

      const insertIndex = j + 1;
      array[insertIndex] = tmp;
      steps.push(
        makeStep(
          "insert",
          insertEdge,
          `tmp の値 ${tmp} をインデックス番号 ${insertIndex} に挿入します。`,
          sortState(array, { n, i, j, tmp, 挿入位置: insertIndex, 比較: comparisons, 移動: moves })
        ),
        makeStep(
          "commit",
          "insert-commit",
          `インデックス番号 0〜${i} が整列済みになりました。`,
          sortState(array, { n, i, j: null, tmp: null, 挿入位置: insertIndex, 比較: comparisons, 移動: moves })
        )
      );
    }

    steps.push(
      makeStep(
        "done",
        "commit-done",
        `すべての値が昇順に並びました。`,
        sortState(array, { n, i: n, j: null, tmp: null, 挿入位置: null, 比較: comparisons, 移動: moves }),
        "sorted"
      )
    );
    return steps;
  }

  function pendingText(stack) {
    if (!stack.length) return "なし";
    return stack.slice().reverse().map(([start, end]) => `${start}..${end}`).join(" → ");
  }

  function buildQuickSteps(source) {
    const array = source.slice();
    const n = array.length;
    const stack = [[0, n - 1]];
    let comparisons = 0;
    let swaps = 0;
    let firstRange = true;
    const steps = [
      makeStep(
        "prepare",
        null,
        `配列 arr = ${arrayText(array)} と、最初の範囲 0..${n - 1} を準備します。`,
        sortState(array, { 範囲: `0..${n - 1}`, pivot: null, left: null, right: null, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
      )
    ];

    while (stack.length) {
      const [start, end] = stack.pop();
      const rangeEdge = firstRange ? "prepare-range" : "next-range";
      firstRange = false;
      const isBaseCase = start >= end;
      steps.push(
        makeStep(
          "range-check",
          rangeEdge,
          `start >= end を確かめます。${start} >= ${end} は ${isBaseCase ? "True" : "False"} です。`,
          sortState(array, { 範囲: `${start}..${end}`, pivot: null, left: start, right: end, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
        )
      );

      if (isBaseCase) {
        steps.push(
          makeStep(
            "skip",
            "range-skip",
            `要素が1個以下の範囲 ${start}..${end} は、そのままで整列済みです。`,
            sortState(array, { 範囲: `${start}..${end}`, pivot: null, left: start, right: end, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
          ),
          makeStep(
            "next-range",
            "skip-next",
            stack.length ? `次の待機範囲を処理します。` : `待機範囲がなくなりました。`,
            sortState(array, { 範囲: `${start}..${end}`, pivot: null, left: null, right: null, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
          )
        );
        continue;
      }

      const middle = Math.floor((start + end) / 2);
      const pivot = array[middle];
      let left = start;
      let right = end;
      steps.push(
        makeStep(
          "setup",
          "range-setup",
          `中央位置 ${middle} の値 ${pivot} を pivot とし、left = ${left}、right = ${right} にします。`,
          sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
        )
      );

      let loopEdge = "setup-loop";
      while (true) {
        const inLoop = left <= right;
        steps.push(
          makeStep(
            "loop",
            loopEdge,
            `left <= right を確かめます。${left} <= ${right} は ${inLoop ? "True" : "False"} です。`,
            sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
          )
        );

        if (!inLoop) break;

        const leftStart = left;
        while (array[left] < pivot) {
          comparisons += 1;
          left += 1;
        }
        comparisons += 1;
        steps.push(
          makeStep(
            "scan-left",
            "loop-left",
            `左から調べ、left を ${leftStart} から ${left} へ進めます。arr[${left}] = ${array[left]} は pivot 以上です。`,
            sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
          )
        );

        const rightStart = right;
        while (array[right] > pivot) {
          comparisons += 1;
          right -= 1;
        }
        comparisons += 1;
        steps.push(
          makeStep(
            "scan-right",
            "left-right",
            `右から調べ、right を ${rightStart} から ${right} へ進めます。arr[${right}] = ${array[right]} は pivot 以下です。`,
            sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
          )
        );

        const canSwap = left <= right;
        steps.push(
          makeStep(
            "check-swap",
            "right-check",
            `left <= right は ${left} <= ${right}、つまり ${canSwap ? "True" : "False"} です。`,
            sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
          )
        );

        if (!canSwap) break;

        const leftValue = array[left];
        const rightValue = array[right];
        [array[left], array[right]] = [array[right], array[left]];
        swaps += 1;
        const previousLeft = left;
        const previousRight = right;
        left += 1;
        right -= 1;
        steps.push(
          makeStep(
            "swap",
            "check-swap-path",
            `位置 ${previousLeft} の ${leftValue} と位置 ${previousRight} の ${rightValue} を交換し、left = ${left}、right = ${right} にします。`,
            sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
          )
        );
        loopEdge = "swap-loop";
      }

      const partitionEdge = steps[steps.length - 1].node === "loop" ? "loop-partition" : "check-partition";
      steps.push(
        makeStep(
          "partition",
          partitionEdge,
          `範囲 ${start}..${end} を、左側 ${start}..${right} と右側 ${left}..${end} に分割しました。`,
          sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
        )
      );

      stack.push([left, end]);
      stack.push([start, right]);
      steps.push(
        makeStep(
          "enqueue",
          "partition-enqueue",
          `左側を先に、続いて右側を同じ方法で処理します。`,
          sortState(array, { 範囲: `${start}..${end}`, pivot, left, right, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
        ),
        makeStep(
          "next-range",
          "enqueue-next",
          `次の待機範囲を取り出します。`,
          sortState(array, { 範囲: `${start}..${end}`, pivot: null, left: null, right: null, 待機範囲: pendingText(stack), 比較: comparisons, 交換: swaps })
        )
      );
    }

    steps.push(
      makeStep(
        "done",
        "next-done",
        `すべての範囲の処理が終わり、値が昇順に並びました。`,
        sortState(array, { 範囲: null, pivot: null, left: null, right: null, 待機範囲: "なし", 比較: comparisons, 交換: swaps }),
        "sorted"
      )
    );
    return steps;
  }

  const graphConfigs = {
    bubble: {
      label: "バブルソート",
      description: "末尾側から隣り合う値を比較・交換し、先頭から整列済みの範囲を広げる。",
      viewBox: "0 0 900 1050",
      nodes: [
        { id: "prepare", kind: "terminal", x: 190, y: 20, width: 520, height: 70, lines: ["配列 arr を準備する"] },
        { id: "outer", kind: "loop", x: 190, y: 130, width: 520, height: 60, lines: [{ text: "i = 0 から n - 2 まで", code: true }] },
        { id: "inner", kind: "loop", x: 190, y: 250, width: 520, height: 60, lines: [{ text: "j = n - 2 から i まで", code: true }] },
        { id: "compare", kind: "decision", x: 190, y: 360, width: 520, height: 130, lines: [{ text: "arr[j] > arr[j + 1]", code: true }] },
        { id: "swap", kind: "process", x: 650, y: 545, width: 230, height: 75, lines: ["隣り合う", "2値を交換"] },
        { id: "next", kind: "loop", x: 190, y: 680, width: 520, height: 60, lines: ["次の組へ", "先頭まで来たら1巡終了"] },
        { id: "pass", kind: "process", x: 270, y: 800, width: 360, height: 70, lines: ["arr[i] を確定し i += 1", "残りがあれば繰り返す"] },
        { id: "done", kind: "terminal", x: 220, y: 950, width: 460, height: 70, lines: ["並べ替え完了"] }
      ],
      edges: [
        { id: "prepare-outer", d: "M450 90 V130" },
        { id: "outer-inner", d: "M450 190 V250" },
        { id: "inner-compare", d: "M450 310 V360" },
        { id: "compare-swap", d: "M710 425 H765 V545", label: "True", labelX: 723, labelY: 408 },
        { id: "compare-next", d: "M450 490 V680", label: "False", labelX: 470, labelY: 530 },
        { id: "swap-next", d: "M765 620 V650 H450 V680" },
        { id: "next-inner", d: "M190 710 H70 V280 H190", dashed: true },
        { id: "next-pass", d: "M450 740 V800" },
        { id: "pass-outer", d: "M270 835 H40 V160 H190", dashed: true },
        { id: "pass-done", d: "M450 870 V950" }
      ]
    },
    selection: {
      label: "選択ソート",
      description: "未整列範囲から最小値の位置を探し、先頭と交換して整列済みの範囲を広げる。",
      viewBox: "0 0 900 1370",
      nodes: [
        { id: "prepare", kind: "terminal", x: 190, y: 20, width: 520, height: 70, lines: ["配列 arr を準備する"] },
        { id: "outer", kind: "loop", x: 190, y: 125, width: 520, height: 60, lines: [{ text: "i = 0 から n - 2 まで", code: true }] },
        { id: "init-min", kind: "process", x: 220, y: 230, width: 460, height: 70, lines: [{ text: "min_index = i", code: true }, "暫定最小値を決める"] },
        { id: "scan", kind: "loop", x: 190, y: 345, width: 520, height: 60, lines: [{ text: "j = i + 1 から n - 1 まで", code: true }] },
        { id: "compare", kind: "decision", x: 190, y: 455, width: 520, height: 130, lines: [{ text: "arr[j] < arr[min_index]", code: true }] },
        { id: "update-min", kind: "process", x: 650, y: 625, width: 230, height: 70, lines: [{ text: "min_index = j", code: true }] },
        { id: "next-scan", kind: "loop", x: 190, y: 720, width: 520, height: 60, lines: ["次の要素へ", "末尾まで来たら探索終了"] },
        { id: "check-swap", kind: "decision", x: 190, y: 850, width: 520, height: 130, lines: [{ text: "min_index != i", code: true }] },
        { id: "swap", kind: "process", x: 650, y: 1020, width: 230, height: 70, lines: ["先頭と最小値を", "交換する"] },
        { id: "commit", kind: "process", x: 190, y: 1140, width: 520, height: 70, lines: ["arr[i] を確定し i += 1", "残りがあれば繰り返す"] },
        { id: "done", kind: "terminal", x: 220, y: 1270, width: 460, height: 70, lines: ["並べ替え完了"] }
      ],
      edges: [
        { id: "prepare-outer", d: "M450 90 V125" },
        { id: "outer-init", d: "M450 185 V230" },
        { id: "init-scan", d: "M450 300 V345" },
        { id: "scan-compare", d: "M450 405 V455" },
        { id: "compare-update", d: "M710 520 H765 V625", label: "True", labelX: 723, labelY: 505 },
        { id: "compare-next", d: "M450 585 V720", label: "False", labelX: 470, labelY: 625 },
        { id: "update-next", d: "M765 695 V700 H450 V720" },
        { id: "next-scan", d: "M190 750 H70 V375 H190", dashed: true },
        { id: "next-check", d: "M450 780 V850" },
        { id: "check-swap-path", d: "M710 915 H765 V1020", label: "True", labelX: 723, labelY: 900 },
        { id: "check-commit", d: "M450 980 V1140", label: "False", labelX: 470, labelY: 1020 },
        { id: "swap-commit", d: "M765 1090 V1110 H450 V1140" },
        { id: "commit-outer", d: "M190 1175 H40 V155 H190", dashed: true },
        { id: "commit-done", d: "M450 1210 V1270" }
      ]
    },
    insertion: {
      label: "挿入ソート",
      description: "未整列の先頭を一時保存し、整列済み範囲を右へずらして適切な位置に挿入する。",
      viewBox: "0 0 900 1190",
      nodes: [
        { id: "prepare", kind: "terminal", x: 190, y: 20, width: 520, height: 70, lines: ["配列 arr を準備し", "先頭を整列済みにする"] },
        { id: "outer", kind: "loop", x: 190, y: 130, width: 520, height: 60, lines: [{ text: "i = 1 から n - 1 まで", code: true }] },
        { id: "pick", kind: "process", x: 210, y: 235, width: 480, height: 80, lines: [{ text: "tmp = arr[i]", code: true }, { text: "j = i - 1", code: true }] },
        { id: "scan", kind: "loop", x: 190, y: 365, width: 520, height: 60, lines: ["整列済み範囲を", "後ろから調べる"] },
        { id: "compare", kind: "decision", x: 190, y: 475, width: 520, height: 130, lines: [{ text: "arr[j] > tmp", code: true }] },
        { id: "shift", kind: "process", x: 650, y: 645, width: 230, height: 75, lines: ["arr[j] を", "右へ1つずらす"] },
        { id: "next", kind: "loop", x: 190, y: 750, width: 520, height: 60, lines: [{ text: "j = j - 1", code: true }, "j < 0 なら挿入へ"] },
        { id: "insert", kind: "process", x: 280, y: 865, width: 340, height: 70, lines: [{ text: "arr[j + 1] = tmp", code: true }, "tmp を挿入する"] },
        { id: "commit", kind: "process", x: 240, y: 985, width: 420, height: 70, lines: ["整列済み範囲を広げ i += 1", "残りがあれば繰り返す"] },
        { id: "done", kind: "terminal", x: 220, y: 1100, width: 460, height: 70, lines: ["並べ替え完了"] }
      ],
      edges: [
        { id: "prepare-outer", d: "M450 90 V130" },
        { id: "outer-pick", d: "M450 190 V235" },
        { id: "pick-scan", d: "M450 315 V365" },
        { id: "scan-compare", d: "M450 425 V475" },
        { id: "compare-shift", d: "M710 540 H765 V645", label: "True", labelX: 723, labelY: 525 },
        { id: "compare-insert", d: "M190 540 H100 V900 H280", label: "False", labelX: 105, labelY: 525 },
        { id: "shift-next", d: "M765 720 V735 H450 V750" },
        { id: "next-scan", d: "M190 780 H70 V395 H190", dashed: true },
        { id: "next-insert", d: "M450 810 V865" },
        { id: "insert-commit", d: "M450 935 V985" },
        { id: "commit-outer", d: "M240 1020 H40 V160 H190", dashed: true },
        { id: "commit-done", d: "M450 1055 V1100" }
      ]
    },
    quick: {
      label: "クイックソート",
      description: "中央位置の値をpivotとして範囲を分割し、左右の部分範囲へ同じ処理を繰り返す。",
      viewBox: "0 0 960 1520",
      nodes: [
        { id: "prepare", kind: "terminal", x: 190, y: 20, width: 520, height: 70, lines: ["配列 arr と最初の範囲を", "準備する"] },
        { id: "range-check", kind: "decision", x: 190, y: 125, width: 520, height: 130, lines: [{ text: "start >= end", code: true }] },
        { id: "skip", kind: "process", x: 730, y: 285, width: 200, height: 70, lines: ["要素が1個以下", "なので処理終了"] },
        { id: "setup", kind: "process", x: 180, y: 330, width: 540, height: 100, lines: ["中央位置の値を pivot にする", { text: "left = start, right = end", code: true }] },
        { id: "loop", kind: "loop", x: 190, y: 480, width: 520, height: 60, lines: [{ text: "left <= right の間", code: true }] },
        { id: "scan-left", kind: "process", x: 210, y: 590, width: 480, height: 70, lines: ["左から pivot 以上の", "値を探す"] },
        { id: "scan-right", kind: "process", x: 210, y: 710, width: 480, height: 70, lines: ["右から pivot 以下の", "値を探す"] },
        { id: "check-swap", kind: "decision", x: 190, y: 830, width: 520, height: 130, lines: [{ text: "left <= right", code: true }] },
        { id: "swap", kind: "process", x: 650, y: 1000, width: 230, height: 80, lines: ["2値を交換し", "left++, right--"] },
        { id: "partition", kind: "process", x: 210, y: 1090, width: 480, height: 70, lines: ["pivotを基準に", "範囲を分割する"] },
        { id: "enqueue", kind: "process", x: 190, y: 1200, width: 520, height: 70, lines: ["左側と右側の範囲を", "同じ方法で処理する"] },
        { id: "next-range", kind: "loop", x: 190, y: 1310, width: 520, height: 60, lines: ["次の範囲へ", "待機範囲がなければ完了"] },
        { id: "done", kind: "terminal", x: 220, y: 1425, width: 460, height: 70, lines: ["並べ替え完了"] }
      ],
      edges: [
        { id: "prepare-range", d: "M450 90 V125" },
        { id: "range-setup", d: "M450 255 V330", label: "False", labelX: 470, labelY: 292 },
        { id: "range-skip", d: "M710 190 H830 V285", label: "True", labelX: 723, labelY: 174 },
        { id: "skip-next", d: "M930 320 H945 V1340 H710" },
        { id: "setup-loop", d: "M450 430 V480" },
        { id: "loop-left", d: "M450 540 V590", label: "True", labelX: 470, labelY: 570 },
        { id: "loop-partition", d: "M190 510 H100 V1125 H210", label: "False", labelX: 105, labelY: 495 },
        { id: "left-right", d: "M450 660 V710" },
        { id: "right-check", d: "M450 780 V830" },
        { id: "check-swap-path", d: "M710 895 H765 V1000", label: "True", labelX: 723, labelY: 880 },
        { id: "check-partition", d: "M450 960 V1090", label: "False", labelX: 470, labelY: 1005 },
        { id: "swap-loop", d: "M765 1080 V1100 H900 V510 H710", dashed: true },
        { id: "partition-enqueue", d: "M450 1160 V1200" },
        { id: "enqueue-next", d: "M450 1270 V1310" },
        { id: "next-range", d: "M190 1340 H40 V190 H190", dashed: true },
        { id: "next-done", d: "M450 1370 V1425" }
      ]
    }
  };

  const builders = {
    bubble: buildBubbleSteps,
    selection: buildSelectionSteps,
    insertion: buildInsertionSteps,
    quick: buildQuickSteps
  };

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function appendNode(svg, node) {
    const { x, y, width, height } = node;
    let shape;
    if (node.kind === "decision") {
      shape = createSvgElement("path", {
        d: `M${x + width / 2} ${y} L${x + width} ${y + height / 2} L${x + width / 2} ${y + height} L${x} ${y + height / 2} Z`,
        class: "flowchart__decision"
      });
    } else if (node.kind === "loop") {
      shape = createSvgElement("path", {
        d: `M${x + 25} ${y} H${x + width - 25} L${x + width} ${y + height / 2} L${x + width - 25} ${y + height} H${x + 25} L${x} ${y + height / 2} Z`,
        class: "flowchart__loop"
      });
    } else {
      shape = createSvgElement("rect", {
        x,
        y,
        width,
        height,
        class: node.kind === "terminal" ? "flowchart__terminal" : "flowchart__process"
      });
      if (node.kind === "terminal") shape.setAttribute("rx", "28");
    }
    shape.setAttribute("data-flow-node", node.id);
    svg.append(shape);

    const lineHeight = 25;
    const lines = node.lines || [];
    const text = createSvgElement("text", {
      x: x + width / 2,
      y: y + height / 2 - ((lines.length - 1) * lineHeight) / 2 + 8,
      class: `flowchart__text${lines.length > 1 ? " flowchart__text--small" : ""}`,
      "data-flow-node": node.id
    });
    lines.forEach((line, index) => {
      const value = typeof line === "string" ? { text: line } : line;
      const tspan = createSvgElement("tspan", {
        x: x + width / 2,
        dy: index === 0 ? 0 : lineHeight
      });
      if (value.code) tspan.setAttribute("class", "flowchart__code");
      tspan.textContent = value.text;
      text.append(tspan);
    });
    svg.append(text);
  }

  function createFlowchartSvg(type, config) {
    const markerId = `${type}-sort-flow-arrow`;
    const descId = `${type}-sort-flow-desc`;
    const svg = createSvgElement("svg", {
      class: `flowchart flowchart--sort flowchart--${type}`,
      viewBox: config.viewBox,
      role: "img",
      "aria-label": `${config.label}のフローチャート`,
      "aria-describedby": descId
    });

    const desc = createSvgElement("desc", { id: descId });
    desc.textContent = config.description;
    svg.append(desc);

    const defs = createSvgElement("defs");
    const marker = createSvgElement("marker", {
      id: markerId,
      viewBox: "0 0 12 12",
      refX: "10",
      refY: "6",
      markerWidth: "12",
      markerHeight: "12",
      markerUnits: "userSpaceOnUse",
      orient: "auto-start-reverse"
    });
    marker.append(createSvgElement("path", {
      class: "flowchart__arrow",
      d: "M0,0 L12,6 L0,12 Z"
    }));
    defs.append(marker);
    svg.append(defs);

    config.edges.forEach((edge) => {
      const path = createSvgElement("path", {
        class: `flowchart__path${edge.dashed ? " flowchart__path--return" : ""}`,
        d: edge.d,
        "data-flow-edge": edge.id,
        "marker-end": `url(#${markerId})`
      });
      svg.append(path);
      if (edge.label) {
        const label = createSvgElement("text", {
          class: "flowchart__branch-label",
          x: edge.labelX,
          y: edge.labelY,
          "data-flow-edge": edge.id
        });
        label.textContent = edge.label;
        svg.append(label);
      }
    });
    config.nodes.forEach((node) => appendNode(svg, node));
    return svg;
  }

  function htmlElement(name, className = "", text = "") {
    const element = document.createElement(name);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function buildDemoUi(root, type, config, array) {
    root.dataset.flowchartDemo = type;

    const setup = htmlElement("div", "flowchart-demo__setup");
    const example = htmlElement("div", "flowchart-demo__example");
    example.append(
      htmlElement("span", "", "例の配列"),
      htmlElement("code", "", arrayText(array))
    );
    const form = htmlElement("form", "flowchart-demo__form");
    const startButton = htmlElement("button", "", "この配列で開始");
    startButton.type = "submit";
    startButton.setAttribute("data-flow-apply", "");
    form.append(startButton);
    setup.append(example, form);

    const hint = htmlElement(
      "p",
      "flowchart-demo__hint",
      "開始前は全体を確認できます。開始後は現在の処理と通った経路を強調します。"
    );
    const panel = htmlElement("div", "flowchart-demo__panel");
    const progress = htmlElement("div", "flowchart-demo__progress");
    progress.setAttribute("data-flow-progress", "");
    const description = htmlElement("p", "flowchart-demo__description");
    description.setAttribute("data-flow-description", "");
    const state = htmlElement("div", "flowchart-demo__state");
    state.setAttribute("data-flow-state", "");
    state.setAttribute("aria-label", "変数と配列の状態");
    const actions = htmlElement("div", "algorithm-actions");
    const restart = htmlElement("button", "", "最初から");
    restart.type = "button";
    restart.setAttribute("data-flow-restart", "");
    const back = htmlElement("button", "", "戻る");
    back.type = "button";
    back.setAttribute("data-flow-back", "");
    const next = htmlElement("button", "algorithm-next", "次へ");
    next.type = "button";
    next.setAttribute("data-flow-next", "");
    actions.append(restart, back, next);
    panel.append(progress, description, state, actions);

    const figure = htmlElement("figure", "flowchart-figure");
    figure.append(createFlowchartSvg(type, config));
    root.replaceChildren(setup, hint, panel, figure);
  }

  function parseArray(value) {
    const array = String(value).split(",").map((part) => Number(part.trim()));
    return array.length > 1 && array.every(Number.isSafeInteger) ? array : [];
  }

  function mountSortFlowchart(root) {
    const type = root.dataset.sortFlowchartDemo;
    const config = graphConfigs[type];
    const buildSteps = builders[type];
    const array = parseArray(root.dataset.flowArray);
    const flowchart = globalThis.FlowchartDemo;
    if (!config || !buildSteps || !array.length || !flowchart || typeof flowchart.mount !== "function") return;

    buildDemoUi(root, type, config, array);
    flowchart.mount(root, buildSteps);
  }

  const api = Object.freeze({
    buildBubbleSteps,
    buildSelectionSteps,
    buildInsertionSteps,
    buildQuickSteps,
    graphConfigs
  });

  globalThis.SortFlowchartDemo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    document.querySelectorAll("[data-sort-flowchart-demo]").forEach(mountSortFlowchart);
  }
})();
