// A fixed fictional collection for observing intersections, not identifying real people.
(() => {
  'use strict';
  function initialize() {
    document.querySelectorAll('[data-is-filter-lab]').forEach(lab => {
      const attributes = [...lab.querySelectorAll('[data-is-attribute]')];
      const people = [...lab.querySelectorAll('[data-is-person]')];
      const reset = lab.querySelector('[data-is-filter-reset]');
      const count = lab.querySelector('[data-is-match-count]');
      const selected = lab.querySelector('[data-is-active-attributes]');
      if (!attributes.length || !people.length || !reset || !count || !selected) return;
      const update = () => {
        const active = attributes.filter(input => input.checked);
        let matches = 0;
        people.forEach(person => {
          const features = new Set((person.dataset.isFeatures || '').split(/\s+/));
          const matching = active.every(input => features.has(input.value));
          person.classList.toggle('is-match', matching);
          person.classList.toggle('is-outside', !matching);
          person.dataset.isMatching = String(matching);
          person.querySelector('[data-is-person-status]').textContent = matching ? '一致' : '条件外';
          if (matching) matches += 1;
        });
        count.textContent = `この教材の ${people.length} 人のうち ${matches} 人が一致`;
        selected.textContent = active.length
          ? `選んだ条件：${active.map(input => input.dataset.isAttribute).join('、')}。すべてに合う記録を示しています。`
          : `条件なし：${people.length} 人すべてを表示しています。`;
        lab.dataset.isMatchCount = String(matches);
        document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      };
      attributes.forEach(input => {
        input.disabled = false;
        input.addEventListener('change', update);
      });
      reset.disabled = false;
      reset.addEventListener('click', () => {
        attributes.forEach(input => { input.checked = false; });
        update();
      });
      update();
      lab.dataset.isFilterReady = 'true';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once: true});
  else initialize();
})();
