(function () {
  'use strict';

  function initialize() {
    if (!window.LogicWidgets) return;
    window.logicLessonExplorers = window.LogicWidgets.initializeExplorers(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
