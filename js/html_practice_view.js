// 候補の9教材だけを対象にした入口と埋込表示。本文は同じHTMLを使い、取得/提出は実行しない。
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
        if (!source.includes('data-html-editor-shell="1"') || !source.includes('data-html-editor-build="html-editor-17dbd0add2f3581a"')) throw Error('editor not ready');
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
    const header = element('section'); header.id = 'htmlPracticeReadingHeader';
    const lesson = window.HtmlEditorRouting.catalog.find(row => row.id === parsed.selection.lessonId);
    element('h1', lesson.title, header);
    const label = element('label', '見出し ', header);
    const select = element('select', '', label); select.id = 'htmlPracticeHeading'; select.setAttribute('aria-label', '解説の見出し');
    const top = element('option', '本文の先頭', select); top.value = '';
    for (const heading of doc.querySelectorAll('article h2[id]:not([data-skip-numbering])')) {
      const option = element('option', heading.textContent.trim(), select); option.value = '#' + heading.id;
    }
    doc.body.prepend(header);
    const workflow = doc.querySelector('.html-practice-workflow');
    let fold;
    if (workflow) {
      fold = element('details'); fold.className = 'html-practice-fold';
      element('summary', '取得・保存・提出の手順', fold);
      workflow.before(fold); fold.append(workflow);
    }
    function show(hash, {focus = false} = {}) {
      if (hash && !/^#[A-Za-z0-9_-]{1,100}$/.test(hash)) return;
      const url = new URL(location.href); url.hash = hash;
      if (location.href !== url.href) history.replaceState(null, '', url.href);
      const target = hash ? doc.getElementById(hash.slice(1)) : header;
      if (!target) return;
      for (let node = target.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
      select.value = [...select.options].some(option => option.value === hash) ? hash : '';
      target.scrollIntoView({block:'start', behavior:'instant'});
      if (focus && !select.matches(':focus')) {
        if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
        target.focus({preventScroll:true});
      }
    }
    function prepareLinks() {
      for (const link of doc.querySelectorAll('a[href]:not([data-html-practice-destination])')) {
        if (link.hasAttribute('download')) continue;
        let url, destination;
        try {
          url = new URL(link.href);
          destination = routes.fromLesson(url.href);
        } catch { continue; }
        if (destination) {
          link.dataset.htmlPracticeDestination = url.href;
          link.href = routes.editorUrl(destination.selection);
          // 既存の「別タブ」は尊重。通常クリックだけが現在のエディタを操作する。
          if (link.target === '_blank') link.rel = 'noopener noreferrer';
        } else if (/^https?:$/.test(url.protocol)) {
          link.target = '_blank'; link.rel = 'noopener noreferrer';
        }
      }
    }
    doc.addEventListener('click', event => {
      if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const link = event.target.closest?.('a[data-html-practice-destination]');
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      if (bridge.visit(window, link.dataset.htmlPracticeDestination)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    select.addEventListener('change', () => bridge.visit(window, routes.lessonUrl({...parsed.selection, hash:select.value})));
    prepareLinks();
    new MutationObserver(prepareLinks).observe(doc.body, {subtree:true, childList:true});
    let printOpen = false;
    window.addEventListener('beforeprint', () => { if (fold) { printOpen = fold.open; fold.open = true; } });
    window.addEventListener('afterprint', () => { if (fold) fold.open = printOpen; });
    window.HtmlPracticeLessonView = Object.freeze({show});
    // 初回位置は、親がテーマ反映を終えたiframe load後に一度だけ合わせる。
    bridge.ready(window);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
