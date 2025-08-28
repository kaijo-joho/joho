// ./js/head.js
// --- role -------------------------------------------------------------
// このファイルは main.js から最初に読み込まれる「ヘッダー専用」ローダです。
// 目的: <head> 内のメタ/フォント/CDN/MathJax/共通CSS/ファビコンの整備のみを行う。
// 注意: body（DOM本体）を直接操作しない（ヘッダー専用）。
//       ナビやページ固有処理は nav.js / script_pages.js / script.js に委譲します。
// ----------------------------------------------------------------------

(function () {
  // ---------- helpers ----------
  const abs = (u) => new URL(u, location.href).href;
  const hasLink = (rel, href) =>
    Array.from(document.head.querySelectorAll(`link[rel="${rel}"]`))
      .some(l => l.href === abs(href));
  const hasScript = (src) =>
    Array.from(document.scripts).some(s => s.src && s.src === abs(src));

  const addLink = (rel, href, attrs = {}) => {
    if (hasLink(rel, href)) return;
    const el = document.createElement('link');
    el.rel = rel;
    el.href = href;
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'crossorigin' && v === true) el.setAttribute('crossorigin', ''); // anonymous
      else el.setAttribute(k, v);
    }
    document.head.appendChild(el);
  };
  const addStylesheet = (href) => addLink('stylesheet', href);
  const addPreconnect = (href, cross = false) => addLink('preconnect', href, { crossorigin: cross });

  // 動的に挿入する <script> では defer は効きません（仕様）。順序制御は main.js 側で行います。
  const addScriptSrc = (src, { async = false, defer = true, onload } = {}) => {
    if (hasScript(src)) return;
    const s = document.createElement('script');
    s.src = src; s.defer = defer; s.async = async;
    if (typeof onload === 'function') s.addEventListener('load', onload, { once: true });
    document.head.appendChild(s);
  };

  // 使う側
  const addInlineScript = (text) => {
    const s = document.createElement('script');
    s.text = text;
    document.head.appendChild(s);
  };

  // ---------- meta / title ----------
  if (!document.head.querySelector('meta[charset]')) {
    const m = document.createElement('meta'); m.setAttribute('charset', 'UTF-8');
    document.head.appendChild(m);
  }
  if (!document.head.querySelector('meta[name="viewport"]')) {
    const m = document.createElement('meta');
    m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(m);
  }

  // ---------- 共通CSS/JS（必要に応じて編集） ----------
  // Lightbox & jQuery
  addStylesheet('https://cdnjs.cloudflare.com/ajax/libs/lightbox2/2.7.1/css/lightbox.min.css');
  addScriptSrc('https://code.jquery.com/jquery-1.12.4.min.js');            // 互換重視
  addScriptSrc('https://cdnjs.cloudflare.com/ajax/libs/lightbox2/2.7.1/js/lightbox.min.js');

  // MathJax
  window.MathJax = window.MathJax || {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
    svg: { fontCache: 'global' }
  };
  addScriptSrc('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js');

  // ---------- Google Fonts ----------
  addPreconnect('https://fonts.googleapis.com');
  addPreconnect('https://fonts.gstatic.com', true);
  addStylesheet('https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700&display=swap');

  // ---------- Google Analytics (gtag.js) ----------
  addScriptSrc(`https://www.googletagmanager.com/gtag/js?id=G-ZW1B1EX70P`, { async: true, defer: false });
  addInlineScript(
  `window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-ZW1B1EX70P', { transport_type: 'beacon' })`
  );

  // ---------- Favicon（共通 | 強制的に img/favicon.ico を使用） ----------
  (function ensureFavicon(){
    // 既存の icon 系 <link> は全て削除してから、共通を1つだけ設定
    document.head
      .querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
      .forEach(el => el.remove());

    // head.js の場所（.../js/head.js）を基準に絶対URLを作る
    const self = Array.from(document.scripts).find(s => s.src && /\/js\/head\.js(\?.*)?$/i.test(s.src));
    const base = self ? self.src.replace(/\/js\/head\.js(\?.*)?$/i, '/') : (location.origin + '/');
    const asset = (p) => new URL(p, base).href;

    const ico = asset('img/favicon.ico');     // ← ここだけ維持すればOK（js と同階層に img/ がある想定）
    addLink('icon', ico, { type: 'image/x-icon' });
    addLink('shortcut icon', ico, { type: 'image/x-icon' }); // 互換目的（古いIE系）
  })();

  // ---------- サイト固有 ----------
  //addScriptSrc('./js/pages.js');
  //addScriptSrc('./js/script_pages.js');
  //addScriptSrc('./js/script.js');
  addStylesheet('./css/css.css');
  //addScriptSrc('./js/nav.js', { onload: () => {
  //  if (typeof window.buildNav === 'function') window.buildNav();
  //}});
})();
