// py41〜46の探索・整列デモで共有する表示／入力補助
(() => {
  "use strict";

  const MIN_ARRAY_LENGTH = 2;
  const MAX_ARRAY_LENGTH = 12;
  const TILE_STATE_CLASSES = [
    "highlighted",
    "highlighted2",
    "lowlighted",
    "swapped",
    "sorted"
  ];

  function clampArrayLength(input, fallback = 8) {
    const parsed = Number.parseInt(input.value, 10);
    const safeFallback = Math.min(
      Math.max(Number.parseInt(fallback, 10) || 8, MIN_ARRAY_LENGTH),
      MAX_ARRAY_LENGTH
    );
    const length = Number.isNaN(parsed)
      ? safeFallback
      : Math.min(Math.max(parsed, MIN_ARRAY_LENGTH), MAX_ARRAY_LENGTH);

    input.value = length;
    input.min = MIN_ARRAY_LENGTH;
    input.max = MAX_ARRAY_LENGTH;
    input.removeAttribute("aria-invalid");
    return length;
  }

  function readInteger(input) {
    const raw = String(input.value).trim();
    const value = Number(raw);
    const valid = raw !== "" && Number.isInteger(value);

    if (valid) {
      input.removeAttribute("aria-invalid");
      return value;
    }

    input.setAttribute("aria-invalid", "true");
    input.focus();
    return null;
  }

  function range(length) {
    return Array.from({ length }, (_, index) => index);
  }

  function shuffle(values) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  function shuffledRange(length) {
    return shuffle(range(length));
  }

  function renderArray(container, values) {
    container.replaceChildren();
    container.style.setProperty("--algorithm-item-count", values.length);

    const valueElements = values.map((value, index) => {
      const item = document.createElement("div");
      item.className = "item";
      item.setAttribute("role", "listitem");

      const valueElement = document.createElement("div");
      valueElement.className = "divValue";
      valueElement.textContent = value;
      item.appendChild(valueElement);

      const indexElement = document.createElement("div");
      indexElement.className = "divIndex";
      indexElement.textContent = index;
      item.appendChild(indexElement);

      container.appendChild(item);
      return valueElement;
    });

    syncTileLabels(valueElements);
    return valueElements;
  }

  function syncTileLabels(valueElements) {
    valueElements.forEach((valueElement, index) => {
      valueElement.parentElement?.setAttribute(
        "aria-label",
        `インデックス${index}、値${valueElement.textContent || "空"}`
      );
    });
  }

  function clearTileStates(valueElements, { keepSorted = false } = {}) {
    valueElements.forEach(valueElement => {
      TILE_STATE_CLASSES.forEach(className => {
        if (!keepSorted || className !== "sorted") {
          valueElement.classList.remove(className);
        }
      });
    });
  }

  function captureTiles(valueElements) {
    return valueElements.map(valueElement => ({
      text: valueElement.textContent,
      className: valueElement.className
    }));
  }

  function restoreTiles(valueElements, states) {
    valueElements.forEach((valueElement, index) => {
      const state = states[index];
      if (!state) return;
      valueElement.textContent = state.text;
      valueElement.className = state.className;
    });
    syncTileLabels(valueElements);
  }

  function updateStats(root, values) {
    Object.entries(values).forEach(([name, value]) => {
      const target = root.querySelector(`[data-stat="${name}"]`);
      if (target) target.textContent = value;
    });
  }

  function updateActionButtons({ backButton, nextButton, historyLength, completed }) {
    backButton.disabled = historyLength <= 0;
    nextButton.disabled = Boolean(completed);
    nextButton.textContent = completed ? "完了" : "次へ";
  }

  function bindEnter(input, callback) {
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      callback();
    });
  }

  window.AlgorithmDemo = Object.freeze({
    MIN_ARRAY_LENGTH,
    MAX_ARRAY_LENGTH,
    bindEnter,
    captureTiles,
    clampArrayLength,
    clearTileStates,
    range,
    readInteger,
    renderArray,
    restoreTiles,
    shuffle,
    shuffledRange,
    syncTileLabels,
    updateActionButtons,
    updateStats
  });
})();
