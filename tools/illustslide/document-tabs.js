(function (global) {
  'use strict';

  function create(options) {
    options = options || {};
    var root = options.root;
    if (!root || typeof root.appendChild !== 'function') {
      throw new TypeError('IlapoDocumentTabs.create requires a root element');
    }

    var onSelect = typeof options.onSelect === 'function' ? options.onSelect : function () {};
    var onClose = typeof options.onClose === 'function' ? options.onClose : function () {};
    var onList = typeof options.onList === 'function' ? options.onList : function () {};
    var records = new Map();
    var activeId = null;
    var destroyed = false;
    var resize = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { reveal(activeId); }) : null;
    if (resize) resize.observe(root);
    var listButton = root.parentElement && root.parentElement.querySelector('#document-list-button');

    root.setAttribute('role', 'tablist');
    if (!root.getAttribute('aria-label')) root.setAttribute('aria-label', '開いている作品');

    function stringId(id) {
      return String(id);
    }

    function normalizeItem(item) {
      item = item || {};
      return {
        id: stringId(item.id),
        name: item.name == null ? '無題の作品' : String(item.name),
        dirty: !!item.dirty,
        saving: !!item.saving,
        status: item.status == null ? '' : String(item.status)
      };
    }

    function statusText(item) {
      var parts = [];
      if (item.dirty) parts.push('未保存');
      if (item.saving) parts.push('保存中');
      if (item.status) parts.push(item.status);
      return parts.join('、');
    }

    function makeRecord(item) {
      var wrapper = document.createElement('div');
      wrapper.className = 'document-tab-item';
      wrapper.dataset.documentTabItem = item.id;

      var tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.documentTab = item.id;
      tab.className = 'document-tab';

      var label = document.createElement('span');
      label.className = 'document-tab-label';
      tab.appendChild(label);

      var dirty = document.createElement('span');
      dirty.className = 'document-tab-dirty';
      dirty.setAttribute('aria-hidden', 'true');
      dirty.textContent = '•';
      tab.appendChild(dirty);

      var state = document.createElement('span');
      state.className = 'document-tab-state';
      tab.appendChild(state);

      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'document-tab-close';
      close.dataset.documentClose = item.id;
      close.setAttribute('aria-label', item.name + 'を閉じる');
      close.textContent = '×';

      wrapper.appendChild(tab);
      wrapper.appendChild(close);
      return { item: item, wrapper: wrapper, tab: tab, close: close, label: label, dirty: dirty, state: state };
    }

    function updateRecord(record, item, selected) {
      record.item = item;
      record.label.textContent = item.name;
      record.dirty.hidden = !item.dirty;
      record.dirty.setAttribute('aria-label', item.dirty ? '未保存の変更' : '');
      record.state.textContent = item.saving ? '保存中' : item.status;
      record.state.hidden = !item.saving && !item.status;
      record.state.classList.toggle('is-saving', item.saving);
      record.tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      record.tab.tabIndex = selected ? 0 : -1;
      record.tab.setAttribute('aria-label', item.name + (statusText(item) ? '（' + statusText(item) + '）' : ''));
      record.tab.dataset.tip = record.tab.getAttribute('aria-label');
      record.close.setAttribute('aria-label', item.name + 'を閉じる');
      record.wrapper.classList.toggle('is-active', selected);
      record.wrapper.classList.toggle('is-dirty', item.dirty);
      record.wrapper.classList.toggle('is-saving', item.saving);
    }

    function focusTab(id, select) {
      var record = records.get(stringId(id));
      if (!record) return;
      record.tab.focus();
      if (select) onSelect(record.item.id);
    }

    function onKeydown(event) {
      var tab = event.target.closest ? event.target.closest('[data-document-tab]') : null;
      if (!tab || !root.contains(tab)) return;
      // Prevent the editor's document-level shortcuts from seeing tab navigation.
      var ids = Array.from(records.keys());
      var index = ids.indexOf(tab.dataset.documentTab);
      if (index < 0) return;
      var next = null;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        next = ids[(index + (event.key === 'ArrowLeft' ? -1 : 1) + ids.length) % ids.length];
      } else if (event.key === 'Home') {
        event.preventDefault();
        next = ids[0];
      } else if (event.key === 'End') {
        event.preventDefault();
        next = ids[ids.length - 1];
      } else if (event.key === 'Delete' || (event.key.toLowerCase() === 'w' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        event.stopPropagation();
        onClose(tab.dataset.documentTab);
        return;
      }
      if (next != null) { event.stopPropagation(); focusTab(next, true); }
    }

    function onClick(event) {
      var close = event.target.closest ? event.target.closest('[data-document-close]') : null;
      if (close && root.contains(close)) {
        event.preventDefault();
        event.stopPropagation();
        onClose(close.dataset.documentClose);
        return;
      }
      var tab = event.target.closest ? event.target.closest('[data-document-tab]') : null;
      if (tab && root.contains(tab)) onSelect(tab.dataset.documentTab);
    }

    root.addEventListener('keydown', onKeydown);
    root.addEventListener('click', onClick);
    if (listButton) listButton.addEventListener('click', onList);

    function render(items, nextActiveId) {
      if (destroyed) return;
      var normalized = Array.isArray(items) ? items.map(normalizeItem) : [];
      activeId = nextActiveId == null ? null : stringId(nextActiveId);
      var nextIds = new Set(normalized.map(function (item) { return item.id; }));
      records.forEach(function (record, id) {
        if (!nextIds.has(id)) {
          if (resize) resize.unobserve(record.wrapper);
          record.wrapper.remove();
          records.delete(id);
        }
      });
      normalized.forEach(function (item, index) {
        var record = records.get(item.id);
        if (!record) {
          record = makeRecord(item);
          records.set(item.id, record);
          if (resize) resize.observe(record.wrapper);
        }
        updateRecord(record, item, item.id === activeId);
        var current = root.children[index];
        if (current !== record.wrapper) root.insertBefore(record.wrapper, current || null);
      });
    }

    function reveal(id) {
      var record = records.get(stringId(id == null ? activeId : id));
      if (!record) return;
      var rootRect = root.getBoundingClientRect();
      var itemRect = record.wrapper.getBoundingClientRect();
      var left = root.scrollLeft + itemRect.left - rootRect.left;
      var right = root.scrollLeft + itemRect.right - rootRect.left;
      var viewLeft = root.scrollLeft;
      var viewRight = viewLeft + root.clientWidth;
      if (left < viewLeft) root.scrollLeft = left;
      else if (right > viewRight) root.scrollLeft = Math.max(0, right - root.clientWidth);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('keydown', onKeydown);
      root.removeEventListener('click', onClick);
      if (listButton) listButton.removeEventListener('click', onList);
      if (resize) resize.disconnect();
      records.clear();
    }

    return { render: render, reveal: reveal, destroy: destroy };
  }

  global.IlapoDocumentTabs = { create: create };
}(typeof window !== 'undefined' ? window : this));
