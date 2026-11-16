// パネル本体と設定の保存は、教材サイトの共通部品を使う。
export function mountDisplayControls(document, window) {
  const trigger = document.querySelector('#display-trigger');
  const panel = document.querySelector('#display-settings');
  if (!trigger || !panel) return null;
  let widget;
  try { widget = window.siteDisplaySettingsUI?.createPanel?.({ idPrefix: 'help-desk-display' }); } catch { /* 本文の表示を継続する。 */ }
  if (!widget) {
    trigger.disabled = true;
    trigger.setAttribute('aria-label', '表示設定を読み込めませんでした');
    return null;
  }
  panel.replaceChildren(widget.element);
  panel.setAttribute('aria-labelledby', widget.element.getAttribute('aria-labelledby'));
  const position = () => {
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(380, Math.max(0, viewportWidth - 16));
    const right = Math.max(8, Math.min(viewportWidth - rect.right, viewportWidth - width - 8));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 60);
    panel.style.setProperty('--display-panel-top', Math.max(8, top) + 'px');
    panel.style.setProperty('--display-panel-width', width + 'px');
    panel.style.setProperty('--display-panel-right', right + 'px');
    panel.style.setProperty('--display-panel-height', Math.max(44, window.innerHeight - top - 8) + 'px');
  };
  const syncOpen = open => {
    trigger.setAttribute('aria-expanded', String(open));
    if (open) { widget.sync(); position(); }
  };
  if (typeof panel.showPopover === 'function') {
    panel.addEventListener('beforetoggle', event => { if (event.newState === 'open') position(); });
    panel.addEventListener('toggle', event => syncOpen(event.newState === 'open'));
  } else {
    // Popover APIのない環境でも、同じパネルへ到達できるようにする。
    panel.removeAttribute('popover'); trigger.removeAttribute('popovertarget'); panel.hidden = true;
    trigger.addEventListener('click', () => { panel.hidden = !panel.hidden; syncOpen(!panel.hidden); });
    const close = restore => {
      if (panel.hidden) return;
      panel.hidden = true; syncOpen(false);
      if (restore) trigger.focus();
    };
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
    });
    document.addEventListener('pointerdown', event => {
      if (!panel.contains(event.target) && !trigger.contains(event.target)) close(panel.contains(document.activeElement));
    });
  }
  window.addEventListener('resize', position);
  document.addEventListener('joho:display-settings-change', position);
  return widget;
}
