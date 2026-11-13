// tools共通のファイルメニュー。保存処理は各アプリのアダプターへ渡す。
(() => {
  'use strict';
  const sprite = new URL('ui-icons.svg?v=20261113', document.currentScript.src).href;
  const iconIds = Object.freeze({
    document: 'file', new: 'new', rename: 'rename', save: 'save', open: 'open',
    auto: 'refresh', stop: 'stop'
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
    const id = iconIds[name];
    if (!id) throw new RangeError('未定義のファイルメニューアイコン: ' + name);
    if (window.JohoIcons) return window.JohoIcons.create(id);
    // 既存アプリは新しい補助JSを読み込まなくても、同じ共通SVGを利用できる。
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false'); svg.setAttribute('data-joho-icon', id);
    svg.setAttribute('width', '22'); svg.setAttribute('height', '22');
    svg.setAttribute('style', 'fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', sprite + '#' + id); svg.appendChild(use); return svg;
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
          index < 0 ? (event.key === 'ArrowUp' ? enabled.length - 1 : 0) :
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
