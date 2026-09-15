// 独立ツールの補助UI。回路データ・解析・履歴には触れない。
(() => {
  'use strict';

  function tooltips({ busy }) {
    const tip = document.createElement('div');
    tip.id = 'logic-tooltip'; tip.className = 'tool-tooltip'; tip.role = 'tooltip'; tip.hidden = true;
    document.body.appendChild(tip);
    let owner = null, hovered = null, keyboardFocus = false, leaveTimer;
    const targetFor = target => {
      const node = target?.closest?.('button, select, [data-tip], [title]');
      return node?.namespaceURI === 'http://www.w3.org/1999/xhtml' ? node : null;
    };
    function readTitle(node) {
      if (node?.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !node.hasAttribute('title')) return;
      node.dataset.tip = node.getAttribute('title');
      node.removeAttribute('title');
    }
    function scan(node) {
      readTitle(node);
      node.querySelectorAll?.('[title]').forEach(readTitle);
    }
    function label(node) {
      readTitle(node);
      const text = node.dataset.tip || node.getAttribute('aria-label') || node.textContent.trim();
      return `${text}${node.dataset.shortcut ? `（${node.dataset.shortcut}）` : ''}`;
    }
    function hide() {
      clearTimeout(leaveTimer);
      if (owner) {
        const ids = (owner.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
        if (ids.length) owner.setAttribute('aria-describedby', ids.join(' '));
        else owner.removeAttribute('aria-describedby');
      }
      owner = null; tip.hidden = true;
    }
    function position() {
      if (!owner?.isConnected || !owner.getClientRects().length || busy()) { hide(); return; }
      const box = owner.getBoundingClientRect();
      tip.style.left = '8px'; tip.style.top = '8px';
      const rect = tip.getBoundingClientRect();
      const width = document.documentElement.clientWidth, height = window.innerHeight;
      tip.style.left = `${Math.max(8, Math.min(width - rect.width - 8, box.left + (box.width - rect.width) / 2))}px`;
      tip.style.top = `${Math.max(8, Math.min(height - rect.height - 8, box.bottom + 6 + rect.height <= height - 8 ? box.bottom + 6 : box.top - rect.height - 6))}px`;
    }
    function show(node) {
      if (!node || busy()) return;
      clearTimeout(leaveTimer);
      if (owner !== node) hide();
      if (!label(node)) return;
      owner = node;
      // native dialogのトップレイヤーでも隠れないよう、対象と同じ層に置く。
      const host = node.closest('dialog') || document.body;
      if (tip.parentNode !== host) host.appendChild(tip);
      tip.textContent = label(node); tip.hidden = false;
      const ids = new Set((node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(tip.id); node.setAttribute('aria-describedby', [...ids].join(' '));
      position();
    }
    scan(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(scan);
        else readTitle(record.target);
      }
      if (owner) {
        const next = label(owner);
        if (tip.textContent !== next) tip.textContent = next;
        position();
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title', 'aria-label', 'hidden', 'data-tip', 'data-shortcut'] });
    document.addEventListener('pointerover', event => {
      if (event.pointerType !== 'mouse') return;
      if (tip.contains(event.target)) { clearTimeout(leaveTimer); return; }
      hovered = targetFor(event.target);
      if (hovered) show(hovered);
    });
    document.addEventListener('pointerout', event => {
      if (event.pointerType !== 'mouse') return;
      const next = targetFor(event.relatedTarget);
      if (owner && (next === owner || tip.contains(event.relatedTarget))) return;
      hovered = null;
      leaveTimer = setTimeout(() => { if (!keyboardFocus || document.activeElement !== owner) hide(); }, 120);
    });
    document.addEventListener('pointerdown', () => { keyboardFocus = false; hide(); }, true);
    document.addEventListener('focusin', event => { if (keyboardFocus) show(targetFor(event.target)); });
    document.addEventListener('focusout', () => { if (!hovered) hide(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { hide(); return; }
      if (event.key === 'Tab') keyboardFocus = true;
      else hide();
    }, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('joho:overlay-open', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    return { hide };
  }

  function resizePanel({ handle, panel, width = 300, busy, onCommit, onDragging }) {
    let requested = width, drag = null;
    function limits() {
      const viewport = document.documentElement.clientWidth;
      const available = viewport <= 850 ? viewport - 68
        : viewport - document.querySelector('.palette').getBoundingClientRect().width - 44 - 282;
      const max = Math.max(120, Math.min(560, available));
      return { min: Math.min(220, max), max };
    }
    function apply(value = requested) {
      const { min, max } = limits();
      const effective = Math.round(Math.max(min, Math.min(max, value)));
      panel.style.setProperty('--side-width', `${effective}px`);
      handle.setAttribute('aria-valuemin', String(min)); handle.setAttribute('aria-valuemax', String(max));
      handle.setAttribute('aria-valuenow', String(effective));
      handle.setAttribute('aria-valuetext', `${effective}px`);
      return effective;
    }
    function finish(cancelled = false) {
      if (!drag) return;
      const previous = drag; drag = null;
      if (handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
      if (cancelled) requested = previous.requested;
      else { requested = apply(); onCommit(requested); }
      apply(); document.body.classList.remove('is-resizing-panel'); onDragging(false);
    }
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || busy() || drag) return;
      event.preventDefault(); handle.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, width: apply(), requested };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('is-resizing-panel'); onDragging(true);
    });
    handle.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      event.preventDefault(); requested = apply(drag.width + drag.x - event.clientX);
    });
    handle.addEventListener('pointerup', event => { if (drag?.id === event.pointerId) finish(); });
    handle.addEventListener('pointercancel', event => { if (drag?.id === event.pointerId) finish(true); });
    handle.addEventListener('lostpointercapture', () => finish(true));
    document.addEventListener('keydown', event => {
      if (!drag) return;
      if (event.key === 'Escape') finish(true);
      event.preventDefault(); event.stopPropagation();
    }, true);
    handle.addEventListener('keydown', event => {
      if (busy() || event.altKey || event.ctrlKey || event.metaKey) return;
      const current = apply(), { min, max } = limits(), step = event.shiftKey ? 64 : 16;
      const values = { ArrowLeft: current + step, ArrowRight: current - step, Home: min, End: max, Enter: 300 };
      if (!(event.key in values)) return;
      event.preventDefault(); event.stopPropagation();
      requested = apply(values[event.key]); onCommit(requested);
    });
    handle.addEventListener('dblclick', () => { if (!busy()) { requested = apply(300); onCommit(requested); } });
    window.addEventListener('resize', () => { finish(true); apply(); });
    window.addEventListener('blur', () => finish(true));
    apply();
    return { refresh: () => apply() };
  }

  window.LogicToolUI = Object.freeze({ tooltips, resizePanel });
})();
