// 9教材の入口。埋込でも学校名を含む通常教材を表示し、実習操作は親エディタへ集約する。
(function () {
  'use strict';
  const doc = document;
  function element(tag, text, parent) {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  }
  function start() {
    if (!window.HtmlEditorRouting || doc.body.dataset.htmlEditorEntry !== 'candidate') return;
    const routes = window.HtmlEditorRouting.create(new URL('./tools/htmleditor/index.html', location.href).href);
    let parsed;
    try { parsed = routes.fromLesson(location.href, {entryOnly:true}); }
    catch { parsed = null; }
    if (!parsed) return; // 不明なパラメータでも、教材本文を消さない。
    let bridge = null;
    try {
      if (parent !== window && parsed.view === 'lesson' &&
          parent.location.origin === location.origin &&
          parent.HtmlEditorNavigation?.owns(window)) bridge = parent.HtmlEditorNavigation;
    } catch { /* 任意サイトからの埋込では表示を変えない。 */ }
    if (bridge) embedded(routes, parsed, bridge);
    else if (parent === window) standalone(routes, parsed);
  }
  function standalone(routes, parsed) {
    // 共通レイアウトがSECTIONを本文へまとめるため、案内も本文と同じ並びに置く。
    const bar = element('section'); bar.id = 'htmlPracticeEntry'; bar.setAttribute('aria-label', '教材の開き方');
    const status = element('p', '解説のみを表示しています。印刷はブラウザの印刷を使ってください。', bar);
    status.id = 'htmlPracticeEntryStatus';
    const open = element('a', 'エディタで開く（別タブ）', bar);
    open.id = 'htmlPracticeEditorLink'; open.href = routes.editorUrl(parsed.selection);
    open.target = '_blank'; open.rel = 'noopener noreferrer';
    doc.body.prepend(bar);
    if (parsed.view === 'lesson') return;
    let stopped = false, controller;
    const cancel = element('a', 'このまま解説を読む', bar);
    cancel.id = 'htmlPracticeStay'; cancel.href = routes.lessonUrl(parsed.selection, {task:true});
    const retry = element('button', 'もう一度エディタを開く', bar); retry.type = 'button'; retry.hidden = true;
    cancel.addEventListener('click', event => {
      if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault(); stopped = true; controller?.abort();
      history.replaceState(null, '', cancel.href);
      status.textContent = '解説のみを表示しています。印刷はブラウザの印刷を使ってください。';
      cancel.hidden = true; retry.hidden = true;
    });
    async function launch() {
      stopped = false; retry.hidden = true;
      status.textContent = 'エディタを開いています。解説だけで読むこともできます。';
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        // 404や異なる配備先へ自動転送しない。静的な入口HTMLの存在確認のみ。
        const probe = new URL('tools/htmleditor/index.html', routes.rootUrl).href;
        const response = await fetch(probe, {signal:controller.signal, cache:'no-store', credentials:'same-origin', redirect:'error'});
        if (!response.ok || response.url !== probe || !/text\/html/i.test(response.headers.get('content-type') || '')) throw Error('editor unavailable');
        const source = await response.text();
        if (!source.includes('data-html-editor-shell="1"') || !source.includes('data-html-editor-build="html-editor-54206ec4bf0bfbca"')) throw Error('editor not ready');
        if (!stopped) location.replace(routes.editorUrl(parsed.selection));
      } catch {
        if (!stopped) {
          status.textContent = 'エディタを確認できないため、解説を表示しています。';
          retry.hidden = false;
        }
      } finally { clearTimeout(timeout); }
    }
    retry.addEventListener('click', launch);
    window.addEventListener('pagehide', () => { stopped = true; controller?.abort(); });
    launch();
  }
  function embedded(routes, parsed, bridge) {
    doc.documentElement.classList.add('html-practice-embedded');
    function show(hash, {focus = false} = {}) {
      if (hash && !/^#[A-Za-z0-9_-]{1,100}$/.test(hash)) return;
      const url = new URL(location.href); url.hash = hash;
      if (location.href !== url.href) history.replaceState(null, '', url.href);
      const target = hash ? doc.getElementById(hash.slice(1)) : doc.getElementById('page_header') || doc.body;
      if (!target) return;
      // 実習手順はエディタ上部へ移したため、非表示の記事へスクロールしない。
      if (target.closest('.html-practice-workflow')) return;
      for (let node = target.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
      target.scrollIntoView({block:'start', behavior:'instant'});
      if (focus) {
        if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
        target.focus({preventScroll:true});
      }
    }
    // リンクの未保存確認は親navigationが全教材の動的ナビを含めて一括で担当する。
    window.HtmlPracticeLessonView = Object.freeze({show});
    // 初回位置は、親がテーマ反映を終えたiframe load後に一度だけ合わせる。
    bridge.ready(window);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
