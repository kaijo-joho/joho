// Disclosures only. State comparisons and Next use shared lesson components.
(() => {
  'use strict';
  function initialize() {
    const details = [...document.querySelectorAll('.is-technology .is-terms details, .is-technology .ts-problems details')];
    details.forEach(node => {
      node.open = false;
      node.addEventListener('toggle', () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize')));
    });
    let saved = null;
    function printMode(printing) {
      if (printing && saved === null) {
        saved = details.map(node => node.open);
        details.forEach(node => { node.open = true; });
      } else if (!printing && saved !== null) {
        details.forEach((node,index) => { node.open = saved[index]; });
        saved = null;
      }
    }
    window.addEventListener('beforeprint', () => printMode(true));
    window.addEventListener('afterprint', () => printMode(false));
    const media = window.matchMedia('print');
    if (media.addEventListener) media.addEventListener('change', event => printMode(event.matches));
    else media.addListener(event => printMode(event.matches));
    printMode(media.matches);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
