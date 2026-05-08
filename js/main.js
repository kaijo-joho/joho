// ./js/main.js
(() => {
  "use strict";

  /** ---------- 小さなユーティリティ ---------- */
  const abs = (u) => new URL(u, location.href).href;

  const loadScript = (src, { async = false } = {}) =>
    new Promise((resolve, reject) => {
      const a = abs(src);
      const dup = Array.from(document.scripts).some(s => s.src && s.src === a);
      if (dup) return resolve(src);

      const s = document.createElement("script");
      s.src = src;
      s.async = async;
      s.defer = false;                // await で順序制御する
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error(`failed to load: ${src}`));
      document.head.appendChild(s);
    });

  const loadCSS = (href) =>
    new Promise((resolve, reject) => {
      const a = abs(href);
      const dup = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some(l => l.href === a);
      if (dup) return resolve(href);

      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = () => resolve(href);
      l.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
      document.head.appendChild(l);
    });

  // 任意スクリプト用：読み込みに失敗しても全体を止めない
  const loadOptionalScript = async (src, { async = false } = {}) => {
    try {
      return await loadScript(src, { async });
    } catch (e) {
      console.warn(`[main.js] optional script skipped: ${src}`, e);
      return null;
    }
  };

  // DOM準備
  const domReady = () =>
    document.readyState === 'loading'
      ? new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }))
      : Promise.resolve();

  /** ---------- パス定義（必要なら調整） ---------- */
  const PATH = {
    head: "./js/head.js",                 // フォント/CDN/MathJax/CSS 等（即時実行）
    pages: "./js/pages.js",               // window.pages を定義
    faq: "./js/faq.js",                   // FAQ_DATA / FAQ_CATEGORY_DATA を定義
    nav: "./js/nav.js",                   // window.initNav()
    scriptPages: "./js/script_pages.js",  // window.initPageScripts()
    highlightLocal: "./js/highlight.js",  // 自前のハイライト
    lessonDock: "./js/lesson_dock.js",    // フローティングドック
    script: "./js/script.js"              // レイアウトやその他の共通初期化
  };

  /** ---------- 起動シーケンス ---------- */
  (async function bootstrap() {
    try {
      // 1) ヘッダ系（副作用的に設定される想定）
      await loadScript(PATH.head);

      // 2) pages を先に用意（以降の機能が依存）
      await loadScript(PATH.pages);

      // 3) FAQデータを用意
      //    lesson_dock.js の初期化前に FAQ_DATA が存在している必要がある。
      //    万一 faq.js が存在しない環境でも、LessonDock全体は止めない。
      await loadOptionalScript(PATH.faq);

      // 4) DOM 準備
      await domReady();

      // 5) レイアウトの“器”を先に用意（ヘッダー/フッター等）
      await loadScript(PATH.script);
      if (typeof window.initLayout === "function") {
        window.initLayout();
      }

      // 6) ナビ・ハイライト・ドックを並列読み込み
      //    FAQ_DATA は上で読み込み済みなので、lesson_dock.js 側で参照できる。
      await Promise.all([
        loadScript(PATH.nav),
        loadScript(PATH.highlightLocal),
        loadScript(PATH.lessonDock)
      ]);

      // 7) 念のため DOM 準備を再確認
      await domReady();

      // 8) ナビ初期化
      if (typeof window.initNav === "function") {
        window.initNav();
      }

      // 9) ドック（pages + FAQ_DATA から生成）
      if (typeof window.initLessonDockFromPages === "function") {
        window.initLessonDockFromPages();
      } else {
        console.warn("[main.js] lesson_dock.js が見つかりません。PATH.lessonDock のパスと Network タブを確認してください。");
      }

      // 10) ページ固有スクリプトを読み込んでから初期化
      await loadScript(PATH.scriptPages);
      if (typeof window.initPageScripts === "function") {
        try {
          window.initPageScripts();
        } catch (e) {
          console.error("[main.js] initPageScripts failed:", e);
        }
      }

      // 11) コードハイライトを最後に一括適用
      if (typeof window.highlightCodeBlocksWithIds === "function") {
        window.highlightCodeBlocksWithIds();
      } else {
        console.warn("[main.js] highlightCodeBlocksWithIds() が見つかりませんでした。");
      }

    } catch (err) {
      console.error("[main.js] bootstrap failed:", err);
    }
  })();
})();


function getFileName() {
  // HTMLファイル名（拡張子なし）を取得
  const path = window.location.pathname;                 // 例: "/", "/index.html", "/about.html"
  let name = path.substring(path.lastIndexOf('/') + 1);  // 例: "", "index.html", "about.html"

  // "/" のように末尾スラッシュのみなら "index"
  if (!name) return 'index';

  // ".html" / ".htm" を末尾だけ外す
  name = name.replace(/\.html?$/i, '');

  return name;                                           // 例: "index", "about"
}
