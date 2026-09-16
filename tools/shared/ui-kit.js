// tools/ のウェブアプリ共通の小さな部品：テーマ（自動・ライト・ダーク）と文字サイズ、ツールチップ、知らせ。
// 使い方は ui-kit.md。外部との通信はしない。読み込めなくてもアプリが動くように、呼び出し側で try/catch する。
(() => {
  'use strict';
  const THEMES = ['auto', 'light', 'dark'], SIZES = ['standard', 'large', 'largest'];

  // ---- テーマ・文字サイズ。<html> の data-theme / data-resolved-theme / data-text-size を付け替える ----
  function theme(opt = {}){
    const key = opt.storageKey || '', media = matchMedia('(prefers-color-scheme: dark)');
    const st = {theme:'auto', textSize:'standard'};
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      if (v && THEMES.includes(v.theme)) st.theme = v.theme;
      if (v && SIZES.includes(v.textSize)) st.textSize = v.textSize;
    } catch {}
    const apply = () => {
      const r = document.documentElement;
      r.dataset.theme = st.theme;
      r.dataset.resolvedTheme = st.theme === 'auto' ? (media.matches ? 'dark' : 'light') : st.theme;
      r.dataset.textSize = st.textSize;
      if (opt.themeSelect) opt.themeSelect.value = st.theme;
      if (opt.sizeSelect) opt.sizeSelect.value = st.textSize;
      if (key) try { localStorage.setItem(key, JSON.stringify(st)); } catch {}
      if (opt.onChange) opt.onChange({theme:st.theme, textSize:st.textSize, dark:r.dataset.resolvedTheme === 'dark'});
    };
    media.addEventListener('change', () => { if (st.theme === 'auto') apply(); });
    if (opt.themeSelect) opt.themeSelect.addEventListener('change', e => { set({theme:e.target.value}); e.target.blur(); });
    if (opt.sizeSelect) opt.sizeSelect.addEventListener('change', e => { set({textSize:e.target.value}); e.target.blur(); });
    function set(next = {}){
      if (THEMES.includes(next.theme)) st.theme = next.theme;
      if (SIZES.includes(next.textSize)) st.textSize = next.textSize;
      apply();
    }
    apply();
    return {get theme(){ return st.theme; }, get textSize(){ return st.textSize; },
      set, apply, isDark: () => document.documentElement.dataset.resolvedTheme === 'dark'};
  }

  // ---- ツールチップ：title を data-tip に移し、マウスを乗せるとすぐ出す ----
  function tooltip(opt = {}){
    const el = document.createElement('div');
    el.className = 'joho-tip'; el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
    const hide = () => el.classList.remove('show');
    const show = target => {
      if (target.hasAttribute('title')){ target.dataset.tip = target.getAttribute('title'); target.removeAttribute('title'); }
      const t = target.dataset.tip;
      if (!t) return;
      el.textContent = t; el.classList.add('show');
      const r = target.getBoundingClientRect(), w = el.offsetWidth, hgt = el.offsetHeight;
      let y = r.bottom + 6;
      if (y + hgt > innerHeight - 4) y = r.top - hgt - 6;
      el.style.left = Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width/2 - w/2)) + 'px';
      el.style.top = y + 'px';
    };
    const over = e => {
      const target = e.target.closest && e.target.closest('[title],[data-tip]');
      if (target && (!opt.skip || !opt.skip(target))) show(target); else hide();
    };
    const out = e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && !t.contains(e.relatedTarget)) hide(); };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('pointerdown', hide, true);
    return {hide, el, destroy(){ document.removeEventListener('mouseover', over); document.removeEventListener('mouseout', out);
      document.removeEventListener('pointerdown', hide, true); el.remove(); }};
  }

  // ---- 画面下の知らせ ----
  let toastEl = null, toastTimer = 0;
  function toast(message, ms = 2400){
    if (!toastEl){ toastEl = document.createElement('div'); toastEl.className = 'joho-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = message; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), Math.max(1200, ms));
  }

  window.JohoUI = {theme, tooltip, toast};
})();
