// tools共通のファイルメニュー。保存処理は各アプリのアダプターへ渡す。
(() => {
  'use strict';
  const paths = Object.freeze({
    document: 'M5 3h9l5 5v13H5zM14 3v6h5', new: 'M12 4v16M4 12h16',
    rename: 'M4 16L16 4l4 4L8 20H4zM13 7l4 4',
    save: 'M4 3h14l3 3v15H3V3zM7 3v7h10V3M7 21v-7h10v7',
    open: 'M3 7V4h7l2 3h9v13H3zM3 10h18',
    auto: 'M20 8a8 8 0 1 0 0 8M20 3v6h-6',
    stop: 'M5 5h14v14H5z'
  });
  const items = Object.freeze([
    ['new', '新規作成', 'new'], ['rename', '名前を変更…', 'rename'],
    ['save', '保存', 'save', 's', true], ['browserSave', 'ブラウザに保存', 'save'],
    ['fileSave', 'ファイルに保存…', 'save'],
    ['browserOpen', 'ブラウザから開く…', 'open', '', true],
    ['fileOpen', 'ファイルから開く…', 'open', 'o'],
    ['auto', 'ファイルへの自動保存を開始…', 'auto', '', true]
  ]);
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[name]); svg.appendChild(path); return svg;
  }
  function mount(host, { onAction, busy = () => false } = {}) {
    host.classList.add('joho-file-menu');
    const summary = document.createElement('summary');
    summary.setAttribute('aria-label', 'ファイル・保存と読み込み');
    summary.setAttribute('aria-haspopup', 'menu');
    summary.append(icon('document'), document.createTextNode('▾'));
    const menu = document.createElement('div'); menu.className = 'joho-file-menu__items'; menu.setAttribute('role', 'menu');
    const controls = new Map();
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
    items.forEach(([id, name, glyph, key, separated]) => {
      if (separated) { const hr = document.createElement('hr'); hr.setAttribute('role', 'separator'); menu.appendChild(hr); }
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem');
      button.dataset.fileAction = id;
      const label = document.createElement('span'); label.textContent = name;
      const shortcut = document.createElement('kbd'); shortcut.textContent = key ? modifier + key.toUpperCase() : '';
      button.append(icon(glyph), label, shortcut);
      button.addEventListener('click', () => {
        if (busy()) return;
        host.open = false; summary.focus({ preventScroll: true }); onAction?.(id, summary);
      });
      controls.set(id, { button, label }); menu.appendChild(button);
    });
    host.replaceChildren(summary, menu);
    const close = restore => { host.open = false; if (restore) summary.focus({ preventScroll: true }); };
    let openedByHover = false;
    host.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && !busy()) { openedByHover = !host.open; host.open = true; }
    });
    summary.addEventListener('click', event => {
      if (openedByHover && event.detail > 0) { event.preventDefault(); openedByHover = false; }
    });
    host.addEventListener('pointerleave', () => {
      setTimeout(() => { if (!host.matches(':hover') && !host.contains(document.activeElement)) close(false); }, 160);
    });
    document.addEventListener('pointerdown', event => { if (!host.contains(event.target)) close(false); });
    host.addEventListener('keydown', event => {
      if (event.key === 'Escape' && host.open) { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); host.open = true;
        const enabled = [...controls.values()].map(item => item.button).filter(button => !button.disabled);
        const index = enabled.indexOf(document.activeElement);
        enabled[event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
          (index + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length]?.focus();
      }
    });
    host.addEventListener('focusout', () => setTimeout(() => {
      if (!host.contains(document.activeElement) && !host.matches(':hover')) close(false);
    }));
    return {
      summary, close,
      update({ autosaving = false, disabled = false } = {}) {
        controls.forEach(({ button }) => { button.disabled = disabled; });
        const control = controls.get('auto');
        control.label.textContent = 'ファイルへの自動保存を' + (autosaving ? '停止' : '開始…');
        control.button.querySelector('svg').replaceWith(icon(autosaving ? 'stop' : 'auto'));
      }
    };
  }
  window.JohoFileMenu = Object.freeze({ mount, icon, items });
})();
