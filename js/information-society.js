// Information Society models: state comparison only; no legal verdicts or scoring.
(() => {
  'use strict';
  const includes = (element, key, state) => (element.dataset[key] || '').split(/\s+/).includes(state);
  function initialize() {
    document.querySelectorAll('.is-table-wrap[tabindex]').forEach(table => {
      // Browsers with touch emulation do not consistently scroll focused regions.
      table.addEventListener('keydown', event => {
        if (event.target !== table || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || table.scrollWidth <= table.clientWidth) return;
        event.preventDefault();
        table.scrollLeft += (event.key === 'ArrowRight' ? 1 : -1) * Math.max(80, table.clientWidth / 2);
      });
    });
    document.querySelectorAll('[data-is-model]').forEach(model => {
      if (model.dataset.isReady) return;
      const own = selector => [...model.querySelectorAll(selector)].filter(node => node.closest('[data-is-model]') === model);
      const choices = own('[data-is-select]');
      const states = choices.map(button => button.dataset.isSelect);
      const initial = states.includes(model.dataset.isDefault) ? model.dataset.isDefault : states[0];
      if (!initial) return;
      const panels = own('[data-is-panel]');
      const highlights = own('[data-is-highlight]');
      const apply = state => {
        if (!states.includes(state)) return;
        model.dataset.isState = state;
        choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.isSelect === state)));
        panels.forEach(panel => { panel.hidden = !includes(panel, 'isPanel', state); });
        highlights.forEach(node => node.classList.toggle('is-active', includes(node, 'isHighlight', state)));
        document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      };
      choices.forEach(button => button.addEventListener('click', () => apply(button.dataset.isSelect)));
      own('[data-is-reset]').forEach(button => button.addEventListener('click', () => apply(initial)));
      model.dataset.isReady = 'true';
      apply(initial);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
