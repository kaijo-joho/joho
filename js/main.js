// ./js/main.js
(() => {
  "use strict";

  if (window.__johoMainBootstrapped) return;
  window.__johoMainBootstrapped = true;

  /** ---------- 小さなユーティリティ ---------- */
  const abs = (u) => new URL(u, location.href).href;

  const loadScript = (src, { async = false, ready = () => false, timeout = 10000 } = {}) =>
    new Promise((resolve, reject) => {
      const a = abs(src);
      if (ready()) {
        resolve(src);
        return;
      }

      const existing = Array.from(document.scripts).find(s => s.src && s.src === a);
      const script = existing || document.createElement("script");
      let timer = null;

      const cleanup = () => {
        clearTimeout(timer);
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };

      const onLoad = () => {
        cleanup();
        if (ready()) {
          resolve(src);
        } else {
          reject(new Error(`loaded but not initialized: ${src}`));
        }
      };

      const onError = () => {
        cleanup();
        reject(new Error(`failed to load: ${src}`));
      };

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      timer = setTimeout(() => {
        cleanup();
        if (ready()) resolve(src);
        else reject(new Error(`timed out while loading: ${src}`));
      }, timeout);

      // addEventListener直前に既存scriptの実行が完了した場合も拾う。
      queueMicrotask(() => {
        if (ready()) {
          cleanup();
          resolve(src);
        }
      });

      if (existing) return;

      script.src = src;
      script.async = async;
      script.defer = false;                // await で順序制御する
      document.head.appendChild(script);
    });

  // 任意スクリプト用：読み込みに失敗しても全体を止めない
  const loadOptionalScript = async (src, options = {}) => {
    try {
      return await loadScript(src, options);
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

  const runInitializer = (name) => {
    const initializer = window[name];
    if (typeof initializer !== 'function') return false;

    try {
      initializer();
      return true;
    } catch (error) {
      console.error(`[main.js] ${name} failed:`, error);
      return false;
    }
  };

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
      // 1) 共通設定とデータを並列で準備する。どれか1つの失敗では全体を止めない。
      await Promise.all([
        loadOptionalScript(PATH.head, {
          ready: () => window.__headInitialized === true
        }),
        loadOptionalScript(PATH.pages, {
          ready: () => Boolean(window.pages && typeof window.pages === 'object')
        }),
        loadOptionalScript(PATH.faq, {
          ready: () => Array.isArray(window.FAQ_DATA)
        })
      ]);

      // 2) DOM 準備
      await domReady();

      // 3) レイアウトの“器”を先に用意（ヘッダー/フッター等）
      await loadOptionalScript(PATH.script, {
        ready: () => typeof window.initLayout === 'function'
      });
      runInitializer('initLayout');

      // 4) ナビ・ハイライト・ドックを並列読み込み
      await Promise.all([
        loadOptionalScript(PATH.nav, {
          ready: () => typeof window.initNav === 'function'
        }),
        loadOptionalScript(PATH.highlightLocal, {
          ready: () => typeof window.highlightCodeBlocksWithIds === 'function'
        }),
        loadOptionalScript(PATH.lessonDock, {
          ready: () => typeof window.initLessonDockFromPages === 'function'
        })
      ]);

      // 5) 利用できる機能だけを個別に初期化する。
      runInitializer('initNav');
      runInitializer('initLessonDockFromPages');

      // 6) ページ固有スクリプト。失敗してもハイライト処理へ進む。
      await loadOptionalScript(PATH.scriptPages, {
        ready: () => typeof window.initPageScripts === 'function'
      });
      runInitializer('initPageScripts');

      // 7) 動的に追加されたコードも含め、最後に一括適用する。
      if (!runInitializer('highlightCodeBlocksWithIds')) {
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
