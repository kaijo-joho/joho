// ./js/nav.js
(() => {
  'use strict';

  let cleanup = null;

  /** 教材名から、同じシリーズの公開ページをカテゴリ別に開く。 */
  function buildNav() {
    const pages = window.pages;
    const bind = window.siteHeaderMenus?.bind;
    const courseLabel = document.getElementById('headerbar__course');
    const id = decodeURIComponent(location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '');
    const current = pages?.[id];
    if (id === 'index' || !current?.mainTitle || !courseLabel || !bind) return;

    cleanup?.();
    const root = courseLabel.closest('.site-course-menu') || document.createElement('div');
    root.className = 'site-header-menu site-course-menu';
    if (!root.isConnected) courseLabel.replaceWith(root);
    root.replaceChildren();

    const trigger = document.createElement('button');
    trigger.id = 'headerbar__course';
    trigger.type = 'button';
    trigger.className = 'headerbar__course';
    trigger.setAttribute('aria-label', `${current.mainTitle}の関連ページを開く`);
    const name = document.createElement('span');
    name.className = 'headerbar__course-name';
    name.textContent = current.mainTitle;
    const arrow = document.createElement('span');
    arrow.className = 'headerbar__course-arrow';
    arrow.textContent = '▾';
    arrow.setAttribute('aria-hidden', 'true');
    trigger.append(name, arrow);

    const nav = document.createElement('nav');
    nav.id = 'auto-nav';
    nav.className = 'site-header-panel site-course-menu__panel';
    nav.setAttribute('aria-label', `${current.mainTitle}の関連ページ`);

    const released = Object.values(pages).filter(page =>
      page?.release === true && page.mainTitle === current.mainTitle && page.fileName
    );
    const index = released.find(page => /^[a-z]+00$/i.test(page.id));
    if (index) {
      const link = document.createElement('a');
      link.className = 'site-course-menu__index nav-link';
      link.href = index.fileName;
      link.textContent = 'シリーズの目次へ';
      if (index.id === id) link.setAttribute('aria-current', 'page');
      nav.appendChild(link);
    }

    const categories = new Map();
    released.filter(page => page.show !== false && page !== index).forEach(page => {
      const category = page.category || '関連ページ';
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category).push(page);
    });
    for (const [category, entries] of categories) {
      const details = document.createElement('details');
      details.open = entries.some(page => page.id === id);
      const summary = document.createElement('summary');
      summary.textContent = category;
      const list = document.createElement('ul');
      list.className = 'nav-list';
      entries.forEach(page => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'nav-link';
        link.href = page.fileName;
        link.textContent = page.title || page.id;
        if (page.id === id) link.setAttribute('aria-current', 'page');
        item.appendChild(link);
        list.appendChild(item);
      });
      details.append(summary, list);
      nav.appendChild(details);
    }
    if (!nav.childElementCount) {
      const empty = document.createElement('p');
      empty.className = 'site-header-panel__empty';
      empty.textContent = '公開中の関連ページはありません。';
      nav.appendChild(empty);
    }
    root.append(trigger, nav);
    const popup = bind({ root, trigger, panel: nav });
    cleanup = popup.destroy;
  }

  window.initNav = buildNav;
})();
