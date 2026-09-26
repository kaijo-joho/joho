// 独立した起動案内。編集中の内容や保存領域は読まず、失敗時も解説への入口を残す。
(function () {
  'use strict';
  let failed = false, ready = false, delayed = false;
  const catalogLoaded = new Set(), catalogFailed = new Set();
  let catalogTimedOut = false;
  const $ = id => document.getElementById(id);
  function catalogState() {
    if (catalogFailed.size) return 'error';
    const dataReady = window.pages && typeof window.pages === 'object' && !Array.isArray(window.pages);
    const linksReady = typeof window.htmlPracticeLinks?.normalize === 'function';
    if (dataReady && linksReady) return 'ready';
    if (catalogLoaded.has('data') && !dataReady || catalogLoaded.has('links') && !linksReady) return 'error';
    return catalogTimedOut ? 'timeout' : 'loading';
  }
  function announceCatalog() { document.dispatchEvent(new Event('html-editor:catalog-change')); }
  const catalogTimer = setTimeout(() => { catalogTimedOut = true; announceCatalog(); }, 8000);
  document.addEventListener('load', event => {
    const part = event.target?.dataset?.editorCatalog;
    if (!['data','links'].includes(part)) return;
    catalogLoaded.add(part); catalogFailed.delete(part);
    if (catalogState() === 'ready') clearTimeout(catalogTimer);
    announceCatalog();
  }, true);
  function render() {
    if (!$('startupMessage')) return;
    if (failed) $('startupMessage').textContent = 'エディタを起動できませんでした。ページを再読み込みするか、解説を開いてください。';
    else if (delayed) $('startupMessage').textContent = '起動に時間がかかっています。待つか、解説を開いてください。';
    const params = new URL(location.href).searchParams;
    const id = params.get('lesson') || (params.get('task') || '').slice(0, 6);
    const known = [...document.querySelectorAll('#startupLessonList a')].find(link => link.dataset.lesson === id);
    if (known) {
      const url = new URL(known.href);
      if (/^#[A-Za-z0-9_-]{1,100}$/.test(location.hash)) url.hash = location.hash;
      $('startupLessonLink').href = url.href;
      $('startupLessonLink').textContent = known.textContent + ' の解説を開く';
    }
  }
  const timer = setTimeout(() => { if (!ready) { delayed = true; render(); } }, 10000);
  function fail() { if (ready) return; failed = true; clearTimeout(timer); render(); }
  window.addEventListener('error', event => {
    const part = event.target?.dataset?.editorCatalog;
    const brokenScript = [...document.scripts].find(script => script.dataset.editorCatalog && script.src === event.filename);
    if (part || brokenScript) { catalogFailed.add(part || brokenScript.dataset.editorCatalog); announceCatalog(); }
    if (event.target?.hasAttribute?.('data-editor-required') ||
        [...document.scripts].some(script => script.hasAttribute('data-editor-required') && script.src === event.filename)) fail();
  }, true);
  document.addEventListener('DOMContentLoaded', render, {once:true});
  window.HtmlEditorStartup = Object.freeze({
    fail,
    catalogState,
    ready() {
      if (failed) return false;
      ready = true; clearTimeout(timer);
      $('app').hidden = false; $('startupFallback').hidden = true;
      document.documentElement.dataset.editorReady = 'true';
      return true;
    }
  });
})();
