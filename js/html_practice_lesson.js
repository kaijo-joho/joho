// 教材本文の入口。URL・表示名は pages.js の公開DTOを共通部へ渡す。
(function (root) {
  'use strict';
  const doc = root.document;
  function render() {
    const api = root.htmlPracticeLinks;
    const file = root.location.pathname.split('/').pop();
    const pageId = /^html\d{2}\.html$/.test(file) ? file.slice(0, -5) : '';
    const page = root.pages && root.pages[pageId];
    const rows = page && page.release === true && Array.isArray(page.practiceFile) ? page.practiceFile : [];
    const slots = Array.from(doc.querySelectorAll('[data-html-practice]'));
    slots.forEach(slot => {
      const output = slot.querySelector('[data-html-practice-actions]');
      const fallback = slot.querySelector('[data-html-practice-fallback]');
      if (!output || !fallback) return;
      output.replaceChildren();
      fallback.hidden = false;
      const id = slot.dataset.htmlPractice;
      if (!pageId || !api || typeof api.createEntry !== 'function' ||
          !/^html\d{2}-\d{2}$/.test(id) || !id.startsWith(pageId + '-') ||
          slots.filter(other => other.dataset.htmlPractice === id).length !== 1) return;
      const candidates = rows.filter(row => row && row.id === id);
      if (candidates.length !== 1) return;
      const entry = api.createEntry(candidates[0]);
      if (!entry) return;
      output.appendChild(entry);
      fallback.hidden = true;
    });
  }
  // main.js の非同期初期化前後のどちらで読まれても動く。ポーリングや通信はしない。
  doc.addEventListener('pages:ready', render);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', render, {once: true});
  else render();
})(window);
