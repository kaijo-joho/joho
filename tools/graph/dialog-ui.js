/* Dialog-local navigation. Panels remain mounted so switching never loses drafts. */
(function (root) {
  'use strict';
  let nextId = 0;
  const owners = new WeakMap();
  function decorate(element, icon) {
    if (!root.GraphIcons) return element;
    element.classList.add('with-icon');
    element.prepend(root.GraphIcons.create(icon, element.ownerDocument));
    return element;
  }
  function tabs(parent, entries, label = '設定の分類') {
    const doc = parent.ownerDocument, group = doc.createElement('div'), nav = doc.createElement('div');
    group.className = 'dialog-tabs'; nav.className = 'dialog-tab-list'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', label);
    group.append(nav); parent.append(group);
    const panels = {}, controls = [];
    function activate(key, focus = false) {
      for (const item of controls) {
        const active = item.key === key;
        item.button.setAttribute('aria-selected', String(active)); item.button.tabIndex = active ? 0 : -1;
        item.panel.hidden = !active;
        if (active && focus) item.button.focus();
      }
    }
    for (const { key, label, icon } of entries) {
      const id = 'dialog-section-' + (++nextId), button = doc.createElement('button'), panel = doc.createElement('div');
      button.type = 'button'; button.textContent = label; button.id = id + '-tab'; button.dataset.dialogTab = key;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', id); decorate(button, icon);
      panel.id = id; panel.className = 'dialog-tab-panel'; panel.dataset.dialogPanel = key;
      panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id);
      button.addEventListener('click', () => activate(key));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const index = controls.findIndex(item => item.button === button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length;
        activate(controls[next].key, true);
      });
      controls.push({ key, button, panel }); panels[key] = panel; owners.set(panel, () => activate(key));
      nav.append(button); group.append(panel);
    }
    activate(entries[0].key);
    return { panels, activate, element: group };
  }
  function reveal(element) {
    const ancestors = [];
    for (let node = element; node; node = node.parentElement) ancestors.push(node);
    for (const node of ancestors.reverse()) {
      if (owners.has(node)) owners.get(node)();
      if (node.tagName === 'DETAILS') node.open = true;
    }
  }
  function section(parent, label, icon) {
    const doc = parent.ownerDocument, box = doc.createElement('fieldset'), legend = doc.createElement('legend');
    box.className = 'dialog-section'; legend.textContent = label; decorate(legend, icon); box.append(legend); parent.append(box); return box;
  }
  root.GraphDialogUI = Object.freeze({ tabs, reveal, section, decorate });
}(typeof globalThis !== 'undefined' ? globalThis : this));
