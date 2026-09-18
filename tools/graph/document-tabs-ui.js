/* 上部ツールバー内の複数文書タブ。文書の保存・履歴の判断は呼び出し側が持つ。 */
(function () {
  'use strict';

  function create(root, options = {}) {
    if (!root) throw new Error('文書タブの配置先がありません。');
    let latestTabs = [], active = null, menuPinned = false, menuTimer;

    const emit = (name, id) => {
      if (name === 'select') options.onSelect?.(id);
      if (name === 'close') options.onClose?.(id);
    };
    const tabById = id => latestTabs.find(tab => tab.id === id);

    function close() {
      const menu = root.querySelector('.graph-document-tabs__menu');
      if (menu) {
        clearTimeout(menuTimer);
        menuPinned = false;
        menu.open = false;
        menu.querySelector(':scope > summary')?.setAttribute('aria-expanded', 'false');
      }
    }

    function keepInView(strip, tab) {
      const stripBox = strip.getBoundingClientRect(), tabBox = tab.getBoundingClientRect();
      const left = tabBox.left - stripBox.left + strip.scrollLeft, right = tabBox.right - stripBox.left + strip.scrollLeft;
      if (tabBox.width >= strip.clientWidth) strip.scrollLeft = Math.max(0, left);
      else if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }

    function focusTab(id) {
      const strip = root.querySelector('[role="tablist"]');
      const tab = [...root.querySelectorAll('[role="tab"]')].find(item => item.dataset.documentTabId === id);
      if (!tab || !strip) return;
      keepInView(strip, tab);
      tab.focus({ preventScroll: true });
    }

    function select(id, focus = false) {
      if (!tabById(id)) return;
      close();
      emit('select', id);
      if (focus) queueMicrotask(() => focusTab(id));
    }

    function nextId(id, direction) {
      const index = latestTabs.findIndex(tab => tab.id === id);
      if (index < 0) return id;
      if (direction === 'first') return latestTabs[0]?.id;
      if (direction === 'last') return latestTabs.at(-1)?.id;
      return latestTabs[(index + direction + latestTabs.length) % latestTabs.length]?.id;
    }

    function onTabKeydown(event) {
      const id = event.currentTarget.dataset.documentTabId;
      const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : null;
      if (direction !== null) {
        event.preventDefault();
        const target = nextId(id, direction);
        if (target) select(target, true);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function menuChoices(panel) {
      return [...panel.querySelectorAll('[role="menuitemradio"]:not(:disabled)')];
    }

    function onMenuKeydown(event, panel) {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const choices = menuChoices(panel), index = choices.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      choices[next]?.focus({ preventScroll: true });
    }

    function documentTab(tab) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'graph-document-tabs__tab';
      button.role = 'tab';
      button.dataset.documentTabId = tab.id;
      button.setAttribute('aria-selected', String(tab.id === active));
      button.setAttribute('aria-label', tab.name + (tab.dirty ? '（未保存）' : '') + (tab.busy ? '（処理中）' : ''));
      button.title = tab.name + (tab.dirty ? '（未保存）' : '');
      if (tab.busy) button.setAttribute('aria-busy', 'true');
      button.tabIndex = tab.id === active ? 0 : -1;
      const name = document.createElement('span');
      name.className = 'graph-document-tabs__name';
      name.textContent = tab.name;
      button.append(name);
      if (tab.dirty) {
        const dirty = document.createElement('span');
        dirty.className = 'graph-document-tabs__dirty';
        dirty.setAttribute('aria-hidden', 'true');
        dirty.textContent = '●';
        button.append(dirty);
      }
      button.addEventListener('click', () => select(tab.id));
      button.addEventListener('keydown', onTabKeydown);
      return button;
    }

    function closeButton(tab) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'graph-document-tabs__close';
      button.dataset.documentTabClose = tab.id;
      button.setAttribute('aria-label', tab.name + 'を閉じる');
      button.title = tab.name + 'を閉じる';
      button.textContent = '×';
      button.disabled = !!tab.busy;
      button.addEventListener('click', event => { event.stopPropagation(); close(); emit('close', tab.id); });
      button.addEventListener('keydown', event => {
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); }
      });
      return button;
    }

    function menu(rootTabs) {
      const details = document.createElement('details');
      details.className = 'graph-document-tabs__menu';
      const summary = document.createElement('summary');
      summary.setAttribute('aria-label', '開いているグラフの一覧');
      summary.setAttribute('aria-expanded', 'false');
      summary.title = '開いているグラフの一覧';
      summary.textContent = '▾';
      const panel = document.createElement('div');
      panel.className = 'graph-document-tabs__menu-panel';
      panel.setAttribute('role', 'menu');
      for (const tab of rootTabs) {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(tab.id === active));
        item.dataset.documentTabId = tab.id;
        item.textContent = tab.name + (tab.dirty ? ' ●' : '');
      item.setAttribute('aria-busy', String(!!tab.busy));
        item.addEventListener('click', () => select(tab.id));
        panel.append(item);
      }
      details.append(summary, panel);
      const open = pinned => {
        clearTimeout(menuTimer);
        details.open = true;
        menuPinned ||= pinned;
        summary.setAttribute('aria-expanded', 'true');
        if (pinned) summary.focus({ preventScroll: true });
        options.onMenuOpen?.();
      };
      const scheduleClose = () => {
        clearTimeout(menuTimer);
        menuTimer = setTimeout(() => { if (!menuPinned && !details.contains(document.activeElement) && !details.matches(':hover')) close(); }, 220);
      };
      summary.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') open(false); });
      summary.addEventListener('click', event => { event.preventDefault(); if (details.open && menuPinned) close(); else open(true); });
      summary.addEventListener('keydown', event => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); open(false);
        const choices = menuChoices(panel);
        (event.key === 'ArrowUp' ? choices.at(-1) : choices[0])?.focus();
      });
      details.addEventListener('toggle', () => summary.setAttribute('aria-expanded', String(details.open)));
      details.addEventListener('pointerleave', scheduleClose);
      panel.addEventListener('pointerenter', () => clearTimeout(menuTimer));
      details.addEventListener('focusout', scheduleClose);
      details.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); summary.focus({ preventScroll: true }); }
        if (event.key === 'Delete' || event.key === 'Backspace') event.stopPropagation();
        onMenuKeydown(event, panel);
      });
      return details;
    }

    function render(tabs, activeId) {
      const focused = document.activeElement;
      const focusId = focused?.dataset?.documentTabId || focused?.dataset?.documentTabClose;
      const focusClose = !!focused?.dataset?.documentTabClose;
      latestTabs = Array.isArray(tabs) ? tabs.map(tab => ({ id: String(tab.id), name: String(tab.name || '無題のグラフ'), dirty: !!tab.dirty, busy: !!tab.busy })) : [];
      active = latestTabs.some(tab => tab.id === String(activeId)) ? String(activeId) : latestTabs[0]?.id || null;
      root.classList.add('graph-document-tabs');
      root.replaceChildren();
      const strip = document.createElement('div');
      strip.className = 'graph-document-tabs__strip';
      strip.setAttribute('role', 'tablist');
      strip.setAttribute('aria-label', '開いているグラフ');
      for (const tab of latestTabs) {
        const item = document.createElement('div');
        item.className = 'graph-document-tabs__item';
        item.append(documentTab(tab), closeButton(tab));
        strip.append(item);
      }
      root.append(strip, menu(latestTabs));
      const restore = focusId && latestTabs.some(tab => tab.id === focusId) ? root.querySelector(focusClose ? '[data-document-tab-close="' + CSS.escape(focusId) + '"]' : '[role="tab"][data-document-tab-id="' + CSS.escape(focusId) + '"]') : null;
      if (restore) restore.focus({ preventScroll: true });
      const activeButton = root.querySelector('[role="tab"][aria-selected="true"]');
      if (activeButton) keepInView(strip, activeButton);
    }

    function refresh() {
      render(latestTabs, active);
    }

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        const strip = root.querySelector('[role="tablist"]');
        const activeButton = root.querySelector('[role="tab"][aria-selected="true"]');
        if (strip && activeButton) keepInView(strip, activeButton);
      }).observe(root);
    }
    document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); }, true);
    document.addEventListener('focusin', event => { if (!root.contains(event.target)) close(); }, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !root.querySelector('.graph-document-tabs__menu')?.open) return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
      root.querySelector('.graph-document-tabs__menu > summary')?.focus({ preventScroll: true });
    }, true);

    return { render, close, refresh };
  }

  window.GraphDocumentTabs = { create };
})();
