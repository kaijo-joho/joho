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

  const postProcessSlideContent = () => {
    const slideRoots = Array.from(document.querySelectorAll('.slides-container'));
    if (slideRoots.length === 0) return false;

    runInitializer('enhanceGeneratedPageContent');
    runInitializer('wrapImages');
    runInitializer('enhanceImages');
    runInitializer('highlightCodeBlocksWithIds');

    const mathRoots = slideRoots.filter(root => !root.dataset.mathJaxProcessed);
    if (mathRoots.length > 0 && typeof window.MathJax?.typesetPromise === 'function') {
      mathRoots.forEach(root => { root.dataset.mathJaxProcessed = 'pending'; });
      window.MathJax.typesetPromise(mathRoots)
        .then(() => {
          mathRoots.forEach(root => { root.dataset.mathJaxProcessed = 'true'; });
        })
        .catch(error => {
          mathRoots.forEach(root => { delete root.dataset.mathJaxProcessed; });
          console.error('[main.js] MathJax slide typesetting failed:', error);
        });
    }

    return true;
  };

  document.addEventListener('slides:ready', event => {
    if (event.detail?.errors?.length) {
      console.warn('[main.js] slide rendering completed with errors:', event.detail.errors);
    }
    postProcessSlideContent();
  });

  /** ---------- パス定義（必要なら調整） ---------- */
  const PATH = {
    displaySettings: "./js/display_settings.js?v=display-settings-20261026", // 単独利用可能な表示設定
    displaySettingsUI: "./js/display_settings_ui.js?v=display-settings-20261026", // 共通の設定パネル
    head: "./js/head.js",                 // フォント/CDN/MathJax/CSS 等（即時実行）
    pages: "./js/pages.js",               // window.pages を定義
    faqShared: "./js/faq_shared.js",       // FAQ検索・表示・AI導線の共通処理
    faq: "./js/faq.js",                   // FAQ_DATA / FAQ_CATEGORY_DATA を定義
    nav: "./js/nav.js",                   // window.initNav()
    scriptPages: "./js/script_pages.js?v=html-entry-1e8c1a0dba1571e8",  // window.initPageScripts()
    highlightLocal: "./js/highlight.js?v=display-settings-20261026",  // 自前のハイライト
    codeExamples: "./js/code_examples.js?v=code-menu-20261026", // コード例の表示操作
    searchCore: "./js/site_search_core.js", // window.__siteSearchCore
    siteSearch: "./js/site_search.js",     // window.initSiteSearch()
    lessonDock: "./js/lesson_dock.js?v=html-entry-1e8c1a0dba1571e8",    // フローティングドック
    htmlPracticeLinks: "./js/html_practice_links.js?v=practice-file-20260927", // 通常HTMLの取得・提出リンク
    script: "./js/script.js?v=display-settings-20261026"              // レイアウトやその他の共通初期化
  };

  /** ---------- 起動シーケンス ---------- */
  (async function bootstrap() {
    try {
      // 1) 共通設定とデータを並列で準備する。どれか1つの失敗では全体を止めない。
      await Promise.all([
        loadOptionalScript(PATH.displaySettings, {
          ready: () => window.siteDisplaySettings?.version === 1
        }),
        loadOptionalScript(PATH.displaySettingsUI, {
          ready: () => typeof window.siteDisplaySettingsUI?.createPanel === 'function'
        }),
        loadOptionalScript(PATH.head, {
          ready: () => window.__headInitialized === true
        }),
        loadOptionalScript(PATH.pages, {
          ready: () => Boolean(window.pages && typeof window.pages === 'object')
        }),
        loadOptionalScript(PATH.faqShared, {
          ready: () => Boolean(window.siteFaq)
        }),
        loadOptionalScript(PATH.faq, {
          ready: () => Array.isArray(window.FAQ_DATA)
        }),
        loadOptionalScript(PATH.htmlPracticeLinks, {
          ready: () => typeof window.htmlPracticeLinks?.normalize === 'function'
        })
      ]);

      // 2) DOM 準備
      await domReady();

      // 3) レイアウトの“器”を先に用意（ヘッダー/フッター等）
      await loadOptionalScript(PATH.script, {
        ready: () => typeof window.initLayout === 'function'
      });
      runInitializer('initLayout');

      // 4) ナビ・ハイライト・検索コアを並列読み込み
      await Promise.all([
        loadOptionalScript(PATH.nav, {
          ready: () => typeof window.initNav === 'function'
        }),
        loadOptionalScript(PATH.highlightLocal, {
          ready: () => typeof window.highlightCodeBlocksWithIds === 'function'
        }),
        loadOptionalScript(PATH.codeExamples, {
          ready: () => typeof window.siteCodeExamples?.enhance === 'function'
        }),
        loadOptionalScript(PATH.searchCore, {
          ready: () => Boolean(window.__siteSearchCore?.searchDocuments)
        })
      ]);

      // 5) 検索UIとLessonDockを準備する。検索を先に初期化してからDockへ入口を追加する。
      await Promise.all([
        loadOptionalScript(PATH.siteSearch, {
          ready: () =>
            typeof window.initSiteSearch === 'function' &&
            typeof window.openSiteSearch === 'function'
        }),
        loadOptionalScript(PATH.lessonDock, {
          ready: () => typeof window.initLessonDockFromPages === 'function'
        })
      ]);

      // 6) 利用できる機能だけを個別に初期化する。
      runInitializer('initNav');
      runInitializer('initSiteSearch');
      runInitializer('initLessonDockFromPages');

      // 7) ページ固有スクリプト。失敗してもハイライト処理へ進む。
      await loadOptionalScript(PATH.scriptPages, {
        ready: () => typeof window.initPageScripts === 'function'
      });
      runInitializer('initPageScripts');

      // 8) 動的に追加されたコードも含め、最後に一括適用する。
      if (!runInitializer('highlightCodeBlocksWithIds')) {
        console.warn("[main.js] highlightCodeBlocksWithIds() が見つかりませんでした。");
      }
      postProcessSlideContent();

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
