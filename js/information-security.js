// Term disclosures only. Models and slide navigation use the existing shared code.
(() => {
  'use strict';
  function initialize() {
    const terms = [...document.querySelectorAll('.is-security .is-terms details')];
    terms.forEach(details => {
      // Open source preserves complete content without JavaScript.
      details.open = false;
      details.addEventListener('toggle', () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize')));
    });
    let beforePrint = null;
    const setPrint = printing => {
      if (printing && beforePrint === null) {
        beforePrint = terms.map(details => details.open);
        terms.forEach(details => { details.open = true; });
      } else if (!printing && beforePrint !== null) {
        terms.forEach((details, index) => { details.open = beforePrint[index]; });
        beforePrint = null;
      }
    };
    window.addEventListener('beforeprint', () => setPrint(true));
    window.addEventListener('afterprint', () => setPrint(false));
    const printMedia = window.matchMedia('print');
    if (printMedia.addEventListener) printMedia.addEventListener('change', event => setPrint(event.matches));
    else printMedia.addListener(event => setPrint(event.matches));
    setPrint(printMedia.matches);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
