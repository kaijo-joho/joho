(() => {
  'use strict';

  const OVERLAY_OPEN_EVENT = 'joho:overlay-open';
  const PAGE_SIZE = 20;
  const SEARCH_DELAY_MS = 160;
  const COURSE_FILTERS = [
    { value: '', label: 'すべて' },
    { value: 'dr', label: 'デジタル表現' },
    { value: 'lc', label: '論理回路' },
    { value: 'nw', label: 'ネットワーク' },
    { value: 'html', label: 'HTML' },
    { value: 'il', label: 'Illustrator' },
    { value: 'ss', label: 'スプレッドシート' },
    { value: 'py', label: 'Python' }
  ];

  const loaderScript = document.currentScript;
  const siteBaseUrl = loaderScript?.src
    ? new URL('../', loaderScript.src)
    : new URL('./', document.baseURI);
  const indexUrl = new URL('data/search-index.json', siteBaseUrl).href;
  const searchCore = window.__siteSearchCore;
  try {
    delete window.__siteSearchCore;
  } catch {}

  let initialized = false;
  let indexPromise = null;
  let documents = [];
  let dialog = null;
  let input = null;
  let status = null;
  let resultsList = null;
  let loadMoreButton = null;
  let faqLink = null;
  let faqTab = null;
  let faqTabLabel = null;
  let siteTab = null;
  let faqView = null;
  let siteView = null;
  let faqContent = null;
  let filterGroup = null;
  let filterButtons = [];
  let currentCourse = '';
  let currentView = 'faq';
  let currentResults = [];
  let visibleCount = PAGE_SIZE;
  let debounceTimer = null;
  let composing = false;
  let opener = null;
  let searchSequence = 0;

  const core = () => searchCore;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'dataset') {
        for (const [dataKey, dataValue] of Object.entries(value)) {
          if (dataValue != null) node.dataset[dataKey] = dataValue;
        }
      } else if (key === 'textContent') node.textContent = String(value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }

    for (const child of children.flat()) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function appendHighlighted(parent, value, tokens) {
    const text = String(value || '');
    const ranges = core().findMatchRanges(text, tokens);
    let cursor = 0;

    for (const range of ranges) {
      if (range.start > cursor) parent.append(text.slice(cursor, range.start));
      parent.appendChild(el('mark', { className: 'site-search__mark' }, text.slice(range.start, range.end)));
      cursor = range.end;
    }
    if (cursor < text.length) parent.append(text.slice(cursor));
  }

  function resultUrl(document, section) {
    const url = new URL(document.url, siteBaseUrl);
    if (section?.anchor) url.hash = section.anchor;
    return url.href;
  }

  function createResultItem(result) {
    const item = el('li', { className: 'site-search__result' });
    const link = el('a', {
      className: 'site-search__result-link',
      href: resultUrl(result.document, result.section)
    });

    const meta = el('div', { className: 'site-search__result-meta' });
    meta.appendChild(el('span', { className: 'site-search__course' }, result.document.courseLabel || 'その他'));
    if (result.document.category) {
      meta.appendChild(el('span', { className: 'site-search__category' }, result.document.category));
    }

    const title = el('h3', { className: 'site-search__result-title' });
    appendHighlighted(title, result.document.title, result.tokens);

    link.append(meta, title);

    if (result.section?.heading && result.section.heading !== result.document.title) {
      const heading = el('p', { className: 'site-search__result-heading' });
      appendHighlighted(heading, result.section.heading, result.tokens);
      link.appendChild(heading);
    }

    if (result.snippet) {
      const snippet = el('p', { className: 'site-search__snippet' });
      appendHighlighted(snippet, result.snippet, result.tokens);
      link.appendChild(snippet);
    }

    item.appendChild(link);
    return item;
  }

  function updateFaqLink() {
    if (!faqLink || !input) return;
    const query = input.value.trim();
    faqLink.href = core().buildFaqUrl(siteBaseUrl.href, query, currentCourse);
    faqLink.textContent = query ? '同じ語でFAQを検索' : 'すべてのFAQを見る';
  }

  function renderPrompt() {
    currentResults = [];
    visibleCount = PAGE_SIZE;
    resultsList.replaceChildren();
    status.textContent = '検索語を入力してください。';
    loadMoreButton.hidden = true;
    updateFaqLink();
  }

  function renderResults() {
    resultsList.replaceChildren(
      ...currentResults.slice(0, visibleCount).map(createResultItem)
    );

    const query = input.value.trim();
    if (currentResults.length === 0) {
      status.textContent = `「${query}」に一致する教材はありません。`;
      resultsList.appendChild(el('li', {
        className: 'site-search__empty'
      }, '検索語を短くするか、別の表記で試してください。'));
    } else {
      const shown = Math.min(visibleCount, currentResults.length);
      status.textContent = `${currentResults.length}件中 ${shown}件を表示しています。`;
    }

    loadMoreButton.hidden = visibleCount >= currentResults.length;
    updateFaqLink();
  }

  function renderLoadError(error) {
    currentResults = [];
    resultsList.replaceChildren();
    status.textContent = '検索索引を読み込めませんでした。';

    const retry = el('button', {
      type: 'button',
      className: 'site-search__retry'
    }, '再試行');
    retry.addEventListener('click', () => {
      indexPromise = null;
      documents = [];
      retry.disabled = true;
      status.textContent = '検索索引を読み込んでいます…';

      loadIndex()
        .then(() => {
          if (input.value.trim()) searchNow({ resetCount: true });
          else renderPrompt();
        })
        .catch(renderLoadError);
    });

    resultsList.appendChild(el('li', { className: 'site-search__empty' }, [
      el('p', {}, '通信状態を確認して、もう一度お試しください。'),
      retry
    ]));
    loadMoreButton.hidden = true;
    updateFaqLink();
    console.error('[site_search] search index load failed:', error);
  }

  function loadIndex() {
    if (indexPromise) return indexPromise;

    indexPromise = (async () => {
      const response = await fetch(indexUrl, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const index = await response.json();
      if (!core().validateIndex(index)) throw new Error('unsupported search index');
      documents = index.documents.filter(document =>
        window.pages?.[document.id]?.release === true
      );
      renderCourseFilters();
      return documents;
    })().catch(error => {
      indexPromise = null;
      throw error;
    });

    return indexPromise;
  }

  async function searchNow({ resetCount = true } = {}) {
    clearTimeout(debounceTimer);
    const sequence = ++searchSequence;
    const query = input.value.trim();
    if (resetCount) visibleCount = PAGE_SIZE;

    if (!query) {
      renderPrompt();
      return;
    }

    status.textContent = '検索しています…';
    resultsList.replaceChildren();
    loadMoreButton.hidden = true;
    updateFaqLink();

    try {
      const loadedDocuments = await loadIndex();
      if (sequence !== searchSequence) return;

      currentResults = core().searchDocuments(loadedDocuments, query, {
        course: currentCourse
      });
      renderResults();
    } catch (error) {
      if (sequence !== searchSequence) return;
      renderLoadError(error);
    }
  }

  function scheduleSearch() {
    if (composing) return;
    updateFaqLink();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchNow({ resetCount: true }), SEARCH_DELAY_MS);
  }

  function focusCurrentView(view = currentView) {
    const target = view === 'faq'
      ? faqContent.querySelector('.ld-faq-search__input, a[href], button, summary')
      : input;
    target?.focus({ preventScroll: true });
    if (target instanceof HTMLInputElement) target.select();
  }

  function prepareSiteSearch() {
    if (input.value.trim()) {
      searchNow({ resetCount: true });
      return;
    }

    if (documents.length) {
      renderPrompt();
      return;
    }

    status.textContent = '検索索引を読み込んでいます…';
    loadIndex()
      .then(() => {
        if (dialog.open && currentView === 'site' && !input.value.trim()) renderPrompt();
      })
      .catch(error => {
        if (dialog.open && currentView === 'site') renderLoadError(error);
      });
  }

  function setView(view, { prepare = true } = {}) {
    currentView = view === 'site' ? 'site' : 'faq';
    const faqSelected = currentView === 'faq';

    faqTab.setAttribute('aria-selected', String(faqSelected));
    siteTab.setAttribute('aria-selected', String(!faqSelected));
    faqTab.tabIndex = faqSelected ? 0 : -1;
    siteTab.tabIndex = faqSelected ? -1 : 0;
    faqView.hidden = !faqSelected;
    siteView.hidden = faqSelected;

    if (!faqSelected && prepare) prepareSiteSearch();
  }

  function setFaqContent(content, count = 0, course = '') {
    faqContent.replaceChildren();

    if (content instanceof Node) {
      faqContent.appendChild(content);
    } else {
      const fallbackUrl = core().buildFaqUrl(siteBaseUrl.href, '', course);
      faqContent.appendChild(el('div', { className: 'site-search__faq-fallback' }, [
        el('p', {}, 'FAQページで、質問や困りごとを検索できます。'),
        el('a', {
          className: 'site-search__faq-link',
          href: fallbackUrl,
          target: '_blank',
          rel: 'noopener'
        }, 'すべてのFAQを見る')
      ]));
    }

    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
    faqTabLabel.textContent = normalizedCount > 0
      ? `よくある質問（${normalizedCount}）`
      : 'よくある質問';
  }

  function renderCourseFilters() {
    if (!filterGroup) return;

    const availableCourses = new Set(documents.map(document => document.course));
    if (currentCourse && !availableCourses.has(currentCourse)) currentCourse = '';

    filterButtons = COURSE_FILTERS
      .filter(filter => !filter.value || availableCourses.has(filter.value))
      .map(filter => {
        const button = el('button', {
          type: 'button',
          className: 'site-search__filter',
          'aria-pressed': String(filter.value === currentCourse),
          dataset: { course: filter.value }
        }, filter.label);

        button.addEventListener('click', () => {
          currentCourse = filter.value;
          filterButtons.forEach(candidate => {
            candidate.setAttribute('aria-pressed', String(candidate === button));
          });
          searchNow({ resetCount: true });
        });
        return button;
      });

    filterGroup.replaceChildren(...filterButtons);
  }

  function createFilter() {
    filterGroup = el('div', {
      className: 'site-search__filters',
      role: 'group',
      'aria-label': '講座で絞り込む'
    });
    renderCourseFilters();
    return filterGroup;
  }

  function createDialog() {
    dialog = el('dialog', {
      id: 'site-search-dialog',
      className: 'site-search',
      'aria-modal': 'true',
      'aria-labelledby': 'site-search-title',
      'aria-describedby': 'site-search-help'
    });

    const panel = el('div', { className: 'site-search__panel' });
    const header = el('header', { className: 'site-search__header' });
    const headingWrap = el('div', {}, [
      el('h2', {
        id: 'site-search-title',
        className: 'site-search__title',
        'data-skip-numbering': ''
      }, '検索・よくある質問'),
      el('p', { id: 'site-search-help', className: 'site-search__help' }, 'FAQと教材サイト内検索を切り替えられます。')
    ]);
    const closeButton = el('button', {
      type: 'button',
      className: 'site-search__close',
      'aria-label': '検索・よくある質問を閉じる'
    }, '×');
    closeButton.addEventListener('click', () => dialog.close());
    header.append(headingWrap, closeButton);

    const tabs = el('div', {
      className: 'site-search__tabs',
      role: 'tablist',
      'aria-label': '調べ方を選ぶ'
    });
    faqTabLabel = el('span', { className: 'site-search__tab-label' }, 'よくある質問');
    faqTab = el('button', {
      id: 'site-search-tab-faq',
      type: 'button',
      className: 'site-search__tab',
      role: 'tab',
      'aria-selected': 'true',
      'aria-controls': 'site-search-view-faq'
    }, [window.siteHeaderMenus?.createIcon?.('faq'), faqTabLabel]);
    siteTab = el('button', {
      id: 'site-search-tab-site',
      type: 'button',
      className: 'site-search__tab',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': 'site-search-view-site',
      tabindex: '-1'
    }, [
      window.siteHeaderMenus?.createIcon?.('search'),
      el('span', { className: 'site-search__tab-label' }, '教材サイト内検索')
    ]);
    tabs.append(faqTab, siteTab);

    const selectTab = event => {
      const next = event.currentTarget === siteTab ? 'site' : 'faq';
      setView(next);
    };
    faqTab.addEventListener('click', selectTab);
    siteTab.addEventListener('click', selectTab);
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home'
        ? 'faq'
        : event.key === 'End'
          ? 'site'
          : currentView === 'faq' ? 'site' : 'faq';
      setView(next);
      (next === 'site' ? siteTab : faqTab).focus({ preventScroll: true });
    });

    faqContent = el('div', { className: 'site-search__faq-content' });
    faqView = el('section', {
      id: 'site-search-view-faq',
      className: 'site-search__view site-search__view--faq',
      role: 'tabpanel',
      'aria-labelledby': faqTab.id
    }, faqContent);

    input = el('input', {
      id: 'site-search-input',
      type: 'search',
      className: 'site-search__input',
      placeholder: '例：バイナリサーチ、plt.plot',
      autocomplete: 'off',
      enterkeyhint: 'search'
    });

    const form = el('form', {
      className: 'site-search__form',
      role: 'search',
      'aria-label': '教材サイト内を検索'
    }, [
      el('label', { className: 'site-search__label', for: input.id }, '検索語'),
      el('div', { className: 'site-search__form-row' }, [
        input,
        el('button', { type: 'submit', className: 'site-search__submit' }, '検索')
      ])
    ]);
    form.addEventListener('submit', event => {
      event.preventDefault();
      input.value = input.value.trim();
      if (!input.value.trim()) {
        renderPrompt();
        input.focus();
        return;
      }
      searchNow({ resetCount: true });
    });

    input.addEventListener('compositionstart', () => {
      composing = true;
      clearTimeout(debounceTimer);
    });
    input.addEventListener('compositionend', () => {
      composing = false;
      scheduleSearch();
    });
    input.addEventListener('input', scheduleSearch);

    status = el('p', { className: 'site-search__status' }, '検索語を入力してください。');
    resultsList = el('ol', { className: 'site-search__results' });
    loadMoreButton = el('button', {
      type: 'button',
      className: 'site-search__more',
      hidden: true
    }, 'さらに表示');
    loadMoreButton.addEventListener('click', () => {
      visibleCount += PAGE_SIZE;
      renderResults();
    });

    faqLink = el('a', {
      className: 'site-search__faq-link',
      href: core().buildFaqUrl(siteBaseUrl.href),
      target: '_blank',
      rel: 'noopener'
    }, 'すべてのFAQを見る');

    const resultsRegion = el('div', {
      className: 'site-search__results-region',
      role: 'region',
      'aria-label': '検索結果'
    }, [status, resultsList, loadMoreButton]);

    const footer = el('footer', { className: 'site-search__footer' }, [
      el('span', {}, '質問形式で探す場合は'),
      faqLink
    ]);

    siteView = el('section', {
      id: 'site-search-view-site',
      className: 'site-search__view site-search__view--site',
      role: 'tabpanel',
      'aria-labelledby': siteTab.id,
      hidden: true
    }, [form, createFilter(), resultsRegion, footer]);

    panel.append(header, tabs, faqView, siteView);
    dialog.appendChild(panel);
    document.body.appendChild(dialog);

    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      dialog.close();
    }, { capture: true });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('site-search-is-open');
      const target = opener;
      opener = null;
      if (target instanceof HTMLElement && target.isConnected) {
        target.focus({ preventScroll: true });
      }
    });
    document.addEventListener(OVERLAY_OPEN_EVENT, event => {
      if (event.detail?.source === 'site-search' || !dialog.open) return;
      dialog.close();
    });
  }

  function initSiteSearch() {
    if (initialized) return true;
    if (!core() || typeof core().searchDocuments !== 'function') {
      console.warn('[site_search] search core is unavailable');
      return false;
    }

    const probe = document.createElement('dialog');
    if (typeof probe.showModal !== 'function') {
      console.warn('[site_search] dialog.showModal() is unavailable');
      return false;
    }

    createDialog();
    initialized = true;
    document.documentElement.dataset.siteSearchReady = 'true';
    return true;
  }

  function openSiteSearch(trigger = null, options = {}) {
    if (!initialized && !initSiteSearch()) return false;
    if (dialog.open) return true;

    setFaqContent(options.faqContent, options.faqCount, options.course);
    setView(options.defaultView === 'site' ? 'site' : 'faq', { prepare: false });
    faqView.scrollTop = 0;
    opener = trigger instanceof HTMLElement ? trigger : document.activeElement;
    document.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, {
      detail: { source: 'site-search' }
    }));

    dialog.showModal();
    document.documentElement.classList.add('site-search-is-open');
    const viewToFocus = currentView;
    requestAnimationFrame(() => focusCurrentView(viewToFocus));

    if (currentView === 'site') prepareSiteSearch();
    return true;
  }

  window.initSiteSearch = initSiteSearch;
  window.openSiteSearch = openSiteSearch;
})();
