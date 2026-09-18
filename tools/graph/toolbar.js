/* グラフ専用の上部メニュー。文書・保存・履歴は扱わない。 */
(function () {
  'use strict';
  function create(top, options = {}) {
    const more = top.querySelector('#toolbar-more'), secondary = top.querySelector('#toolbar-secondary');
    const home = document.createComment('履歴・選択・表示の通常位置');
    secondary.before(home);
    const states = new Map([...top.querySelectorAll('details.menu')].map(menu => [menu, {pinned: false, timer: null}]));
    let condensed = false, frame;
    const summary = menu => menu.querySelector(':scope > summary');
    const panel = menu => menu.querySelector(':scope > .menu-panel');
    const visible = el => !!el.getClientRects().length;
    function close(menu, restore = false) {
      for (const [child, state] of states) if (child === menu || menu.contains(child)) {
        clearTimeout(state.timer); state.pinned = false; child.open = false;
        summary(child).setAttribute('aria-expanded', 'false');
      }
      if (restore && visible(summary(menu))) summary(menu).focus({preventScroll: true});
    }
    function closeAll() { for (const menu of states.keys()) close(menu); }
    function position() {
      const viewport = window.visualViewport, left = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      for (const menu of states.keys()) {
        if (!menu.open || !visible(menu) || (condensed && menu === top.querySelector('#display-menu'))) continue;
        const box = panel(menu), anchor = summary(menu).getBoundingClientRect();
        const y = Math.max(topEdge + 4, anchor.bottom + 5);
        box.style.maxWidth = Math.max(0, width - 16) + 'px';
        box.style.maxHeight = Math.max(0, topEdge + height - y - 8) + 'px';
        const w = box.getBoundingClientRect().width;
        box.style.left = Math.max(left + 8, Math.min(menu.id === 'view-menu' ? anchor.right - w : anchor.left, left + width - w - 8)) + 'px';
        box.style.top = y + 'px';
      }
    }
    function queuePosition() { cancelAnimationFrame(frame); frame = requestAnimationFrame(position); }
    function open(menu, pinned = false) {
      if (options.isBusy?.()) return;
      options.onOpen?.();
      for (const other of states.keys()) if (other !== menu && !other.contains(menu) && !menu.contains(other)) close(other);
      for (let parent = menu.parentElement.closest('details.menu'); parent && top.contains(parent); parent = parent.parentElement.closest('details.menu')) {
        clearTimeout(states.get(parent).timer); parent.open = true; summary(parent).setAttribute('aria-expanded', 'true');
      }
      const state = states.get(menu); clearTimeout(state.timer); state.pinned ||= pinned;
      menu.open = true; summary(menu).setAttribute('aria-expanded', 'true'); queuePosition();
    }
    function scheduleClose(menu) {
      const state = states.get(menu); clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        if (!state.pinned && !menu.contains(document.activeElement) && !menu.matches(':hover')) close(menu);
      }, 220);
    }
    for (const [menu, state] of states) {
      const trigger = summary(menu), contents = panel(menu);
      trigger.setAttribute('aria-controls', contents.id); trigger.setAttribute('aria-expanded', String(menu.open));
      trigger.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') open(menu); });
      trigger.addEventListener('click', event => {
        event.preventDefault();
        if (menu.open && state.pinned) close(menu); else open(menu, true);
      });
      trigger.addEventListener('keydown', event => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); open(menu, true);
        const controls = [...contents.querySelectorAll('button:not(:disabled),select,input,summary')].filter(visible);
        (event.key === 'ArrowUp' ? controls.at(-1) : controls[0])?.focus();
      });
      menu.addEventListener('pointerleave', () => scheduleClose(menu));
      contents.addEventListener('pointerenter', () => clearTimeout(state.timer));
      menu.addEventListener('focusout', () => scheduleClose(menu));
      menu.addEventListener('toggle', () => { trigger.setAttribute('aria-expanded', String(menu.open)); if (menu.open) queuePosition(); });
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(menu, true); }
      });
    }
    top.addEventListener('keydown', event => {
      if (['Delete', 'Backspace'].includes(event.key)) event.stopPropagation();
    });
    function refresh() {
      const scale = Number.parseFloat(getComputedStyle(top).getPropertyValue('--ui-k')) || 1;
      const next = top.clientWidth < 900 * scale;
      if (next !== condensed) {
        const focused = secondary.contains(document.activeElement) ? document.activeElement : null;
        condensed = next; top.classList.toggle('toolbar-condensed', condensed);
        if (condensed) { more.hidden = false; panel(more).append(secondary); if (focused) open(more, true); }
        else { home.after(secondary); close(more); more.hidden = true; }
        if (focused && visible(focused)) focused.focus({preventScroll: true});
      }
      queuePosition();
    }
    function escape() {
      const focused = document.activeElement?.closest('.top details.menu[open]');
      const menu = focused || [...states.keys()].reverse().find(item => item.open && visible(item));
      if (!menu) return false;
      close(menu, true); return true;
    }
    function returnTarget(element) {
      if (!element || !top.contains(element)) return element;
      let target = element;
      for (let menu = element.closest('details.menu'); menu && top.contains(menu); menu = menu.parentElement.closest('details.menu')) {
        if (!menu.open) target = summary(menu);
      }
      return target;
    }
    new ResizeObserver(refresh).observe(top);
    window.visualViewport?.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('scroll', queuePosition);
    refresh();
    return {close: closeAll, refresh, escape, returnTarget};
  }
  window.GraphToolbar = {create};
})();
