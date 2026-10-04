/* Small, shared progression inside a lesson. Slide navigation remains in lesson-slide-deck.js. */
(() => {
  'use strict';
  const states = new WeakMap();
  const selector = '[data-lesson-progress]';
  const own = (root, query) => Array.from(root.querySelectorAll(query))
    .filter(element => element.closest(selector) === root);
  const number = value => /^\d+$/.test(String(value)) ? Number(value) : null;
  const resolve = value => typeof value === 'string' ? document.querySelector(value) : value;

  function initialize(root) {
    if (states.has(root)) return states.get(root);
    const stages = own(root, '[data-lesson-stage], [data-lesson-stage-from]');
    const values = stages.flatMap(element => [number(element.dataset.lessonStage), number(element.dataset.lessonStageFrom)])
      .filter(value => value !== null);
    const declared = number(root.dataset.progressCount);
    const total = declared && declared > 0 ? declared : Math.max(0, ...values) + 1;
    const buttons = {
      next: own(root, '[data-progress-next]'),
      prev: own(root, '[data-progress-prev]'),
      reset: own(root, '[data-progress-reset]'),
    };
    const statuses = own(root, '[data-progress-status]');
    const state = { step: 0, total, set };
    states.set(root, state);
    root.classList.add('lesson-progress-ready');

    function set(value, notify = true) {
      const requested = Number(value);
      if (!Number.isFinite(requested)) return;
      state.step = Math.min(total - 1, Math.max(0, Math.trunc(requested)));
      root.dataset.progressStep = String(state.step);
      stages.forEach(element => {
        const exact = number(element.dataset.lessonStage);
        const from = number(element.dataset.lessonStageFrom);
        const visible = exact !== null ? exact === state.step : from === null || state.step >= from;
        element.hidden = !visible;
        // SVG does not expose the HTML hidden property in every browser.
        element.toggleAttribute('hidden', !visible);
        if (element.namespaceURI === 'http://www.w3.org/2000/svg') {
          if (!visible) element.setAttribute('aria-hidden', 'true');
          else element.removeAttribute('aria-hidden');
        }
      });
      buttons.next.forEach(button => { button.disabled = state.step === total - 1; });
      buttons.prev.forEach(button => { button.disabled = state.step === 0; });
      statuses.forEach(status => { status.textContent = `${state.step + 1} / ${total}`; });
      if (notify) {
        root.dispatchEvent(new CustomEvent('joho:lesson-progress', {
          bubbles: true, detail: { step: state.step, total, id: root.id || '' },
        }));
        document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      }
    }
    buttons.next.forEach(button => button.addEventListener('click', () => set(state.step + 1)));
    buttons.prev.forEach(button => button.addEventListener('click', () => set(state.step - 1)));
    buttons.reset.forEach(button => button.addEventListener('click', () => set(0)));
    set(0, false);
    return state;
  }

  window.JohoLessonProgress = Object.freeze({
    get(root) {
      const element = resolve(root);
      if (!element) return null;
      const state = initialize(element);
      return { step: state.step, total: state.total, id: element.id || '' };
    },
    set(root, step) { const element = resolve(root); if (element) initialize(element).set(step); },
    reset(root) { const element = resolve(root); if (element) initialize(element).set(0); },
    initialize,
  });
  const boot = () => document.querySelectorAll(selector).forEach(initialize);
  let printStates = null;
  window.addEventListener('beforeprint', () => {
    if (printStates) return;
    printStates = Array.from(document.querySelectorAll(selector), root => {
      const state = initialize(root);
      const saved = { state, step: state.step };
      // Reveal the complete diagram for paper without changing any user input.
      state.set(state.total - 1, false);
      return saved;
    });
  });
  window.addEventListener('afterprint', () => {
    if (!printStates) return;
    printStates.forEach(({ state, step }) => state.set(step, false));
    printStates = null;
    document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
