// 教材選択だけの履歴。文書・保存先・Undo・本人用の配付情報には触れない。
(function () {
  'use strict';
  function mount({iframe, onSelect, onError, beforeVisit = async () => true, hasUnsaved = () => false, openExternal}) {
    const routes = window.HtmlEditorRouting.create(location.href);
    let current, frameLesson = '', loadingTimer, displayedDocument, displayedHash, displayedScrollY, keepReadingPosition = false;
    let readingDocument, observedScrollY = 0, visiting = false;
    const linkedDocuments = new WeakSet();
    const notice = document.getElementById('lessonNotice');
    const explanation = document.getElementById('lessonOnlyLink');
    const message = text => { notice.textContent = text; notice.hidden = !text; };
    function theme() {
      try {
        const win = iframe.contentWindow;
        const preference = document.documentElement.dataset.theme || 'auto';
        const size = document.documentElement.dataset.textSize || 'standard';
        const sitePreference = preference === 'auto' ? 'system' : preference;
        const siteSize = size === 'largest' ? 'xlarge' : size;
        if (win.siteTheme && win.siteTheme.preference !== sitePreference) win.siteTheme.setPreference(sitePreference, {persist:false});
        if (win.siteTextSize && win.siteTextSize.preference !== siteSize) win.siteTextSize.setPreference(siteSize, {persist:false});
      } catch { /* 読取不可のiframeへ表示設定を送らない。 */ }
    }
    function readingMoved() {
      return displayedDocument === iframe.contentDocument &&
        Math.abs(iframe.contentWindow.scrollY - displayedScrollY) > 1;
    }
    function observeReading(frameDocument) {
      const win = frameDocument.defaultView;
      if (!win || readingDocument === frameDocument) return;
      readingDocument = frameDocument; observedScrollY = win.scrollY;
      const keep = () => { if (readingDocument === frameDocument) keepReadingPosition = true; };
      for (const type of ['wheel','touchmove','pointerdown']) frameDocument.addEventListener(type, keep, {passive:true});
      // ready通知からloadまででも、スクロールバー・支援技術の操作を見失わない。
      // 初期URL・テーマ適用による位置は、この監視を始める前の基準値として扱う。
      win.addEventListener('scroll', () => {
        if (readingDocument !== frameDocument) return;
        // 初回配置後は、入力以外のスクロール（支援技術を含む）も読書位置として守る。
        // 初回前はURLハッシュやレイアウト確定による自動移動と区別できないため、入力でのみ守る。
        if (displayedDocument === frameDocument && (Math.abs(win.scrollY - observedScrollY) > 1 || readingMoved())) keep();
        observedScrollY = win.scrollY;
      }, {passive:true});
      frameDocument.addEventListener('keydown', event => {
        if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) keep();
      });
    }
    function scroll(focus = false, force = false) {
      try {
        const view = iframe.contentWindow.HtmlPracticeLessonView;
        const frameDocument = iframe.contentDocument;
        if (view && (force || displayedDocument !== frameDocument || displayedHash !== current.hash)) {
          view.show(current.hash, {focus}); displayedDocument = frameDocument; displayedHash = current.hash;
          displayedScrollY = iframe.contentWindow.scrollY; observedScrollY = displayedScrollY;
        }
      } catch { /* 解説・印刷の独立リンクを残す。 */ }
    }
    function navigate(value, mode = 'push', focus = false) {
      const next = routes.normalize(value), url = routes.editorUrl(next);
      const anchorChanged = current?.hash !== next.hash;
      if (frameLesson === next.lessonId && !anchorChanged && mode === 'push') keepReadingPosition = true;
      if (mode === 'push' && location.href !== url) history.pushState(null, '', url);
      else if (mode === 'replace' && location.href !== url) history.replaceState(null, '', url);
      current = next;
      explanation.href = routes.lessonUrl(next, {task:true});
      document.title = window.HtmlEditorRouting.catalog.find(row => row.id === next.lessonId).title + ' — HTMLエディタ';
      onSelect(next);
      if (frameLesson !== next.lessonId) {
        frameLesson = next.lessonId; keepReadingPosition = false;
        readingDocument = null; displayedDocument = null; displayedHash = undefined;
        message('解説を読み込んでいます。');
        clearTimeout(loadingTimer);
        loadingTimer = setTimeout(() => message('解説を読み込めませんでした。上部の「表示の切り替え」から解説ページを別タブで開けます。'), 8000);
        const target = routes.lessonUrl(next);
        // iframeの独立した履歴を増やさず、戻る/進むは親URLの選択だけに揃える。
        if (!iframe.hasAttribute('src')) iframe.src = target;
        else iframe.contentWindow.location.replace(target);
      } else if (anchorChanged || focus) { keepReadingPosition = false; scroll(focus, true); }
      return next;
    }
    async function request(value, mode = 'push', focus = false) {
      if (visiting) return false;
      const next = routes.normalize(value);
      if (next.lessonId === current.lessonId && next.taskId === current.taskId) {
        navigate(next, mode, focus); return true;
      }
      visiting = true;
      try {
        if (!await beforeVisit()) return false;
        navigate(next, mode, focus); return true;
      } catch (error) { onError(error.message || '教材を切り替えられませんでした。編集内容は保持しています。'); return false; }
      finally { visiting = false; }
    }
    function prepareDocument(frameDocument) {
      if (linkedDocuments.has(frameDocument)) return;
      linkedDocuments.add(frameDocument);
      // 通常教材のヘッダーを含む全リンクを捕捉する。後から生成されるナビも対象。
      function followLink(event) {
        if (event.defaultPrevented || event.button > 1 || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.hasAttribute('download')) return;
        let url, value;
        try {
          url = new URL(link.dataset.htmlPracticeDestination || link.href, frameDocument.URL);
          if (!/^https?:$/.test(url.protocol) || url.username || url.password) return;
        } catch { return; }
        // 未対応の教材パラメータもiframeを置き換えず、別タブの確認対象にする。
        try { value = routes.fromLesson(url.href); } catch { value = null; }
        const here = new URL(frameDocument.URL);
        const samePage = url.origin === here.origin && url.pathname === here.pathname && url.search === here.search;
        if (samePage && url.hash && !value) return;
        const separate = event.button === 1 || event.metaKey || event.ctrlKey || event.shiftKey || link.target === '_blank';
        if (value && !separate) {
          const selection = {...value.selection};
          if (selection.lessonId === current.lessonId && !url.searchParams.has('task')) selection.taskId = current.taskId;
          event.preventDefault(); event.stopImmediatePropagation();
          void request(selection, 'push', true); return;
        }
        // HTML教材以外をiframe内や親画面へ開かず、明示操作による別タブへ。
        const href = value ? routes.editorUrl(value.selection) : url.href;
        if (value) link.dataset.htmlPracticeDestination = url.href;
        link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        if (hasUnsaved() && openExternal) {
          event.preventDefault(); event.stopImmediatePropagation(); openExternal(href);
        }
      }
      frameDocument.addEventListener('click', followLink, true);
      frameDocument.addEventListener('auxclick', followLink, true);
    }
    function loaded() {
      try {
        const value = routes.fromLesson(iframe.contentWindow.location.href);
        if (!value || value.selection.lessonId !== current.lessonId) return;
        clearTimeout(loadingTimer);
        const frameDocument = iframe.contentDocument;
        const valid = frameDocument.querySelector('article');
        const embedded = iframe.contentWindow.HtmlPracticeLessonView;
        message(!valid ? '解説を表示できませんでした。「表示の切り替え」から別タブで開いてください。' :
          window.HtmlEditorRouting.entryLessonIds.includes(current.lessonId) && !embedded ?
            '解説を通常表示しています。見出しへ移動できない場合は「表示の切り替え」から別タブで開いてください。' : '');
        theme();
        prepareDocument(frameDocument);
        observeReading(frameDocument);
        // load配送がscrollイベントより先でも、初回配置後に変わった読書位置は保持する。
        if (readingMoved()) keepReadingPosition = true;
        // 初回アンカーの位置合わせは、iframeの最終レイアウト後に親だけが行う。
        // interactiveからloadまでに利用者が読んだ位置は、上の監視で保持する。
        if (frameDocument.readyState === 'complete' && !keepReadingPosition) scroll(false);
      } catch { message('解説を確認できませんでした。「表示の切り替え」から別タブで開いてください。'); }
    }
    iframe.addEventListener('load', loaded);
    function historyChanged() {
      try {
        const next = routes.fromEditor(location.href);
        if (next.lessonId === current.lessonId && next.taskId === current.taskId) navigate(next, 'none');
        else {
          // 確認中やキャンセル時には表示中の教材とURLを一致させる。
          history.replaceState(null, '', routes.editorUrl(current));
          void request(next, 'replace');
        }
      }
      catch { onError('教材のURLを確認できません。編集中の内容はそのままです。'); }
    }
    window.addEventListener('popstate', historyChanged);
    window.addEventListener('hashchange', historyChanged);
    new MutationObserver(theme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme','data-resolved-theme','data-text-size']});
    // 同一originの、現在の教材iframeだけから操作できる窓口。postMessageは受け付けない。
    window.HtmlEditorNavigation = Object.freeze({
      owns(win) { return win === iframe.contentWindow; },
      ready(win) { if (win === iframe.contentWindow) loaded(); },
      visit(win, href) {
        if (win !== iframe.contentWindow) return false;
        try {
          const value = routes.fromLesson(href);
          if (!value) return false;
          const selection = {...value.selection};
          // 同じ教材の見出し移動では、選択中の第2課題を第1課題へ戻さない。
          if (selection.lessonId === current.lessonId && !new URL(href).searchParams.has('task')) selection.taskId = current.taskId;
          void request(selection, 'push', true); return true;
        } catch { return false; }
      },
      get selection() { return {...current}; },
      routes
    });
    navigate(routes.fromEditor(location.href), 'replace');
    return Object.freeze({navigate, request, get selection() { return {...current}; }});
  }
  window.HtmlEditorNavigationMount = mount;
})();
