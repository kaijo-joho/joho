// ./js/lesson_dock.js
(() => {
  'use strict';

  const OVERLAY_OPEN_EVENT = 'joho:overlay-open';

  // ==================== アイコン設定（任意） ====================
  const ICON_PATHS = {
    // practicefile: './img/icons/notebook.svg',
    // exercise:     './img/icons/exercise.svg',
    // quiz:         { src: './img/icons/quiz.svg', emoji: '📝' },
    // download:     './img/icons/download.svg',
    // next:         './img/icons/next.svg',
    // faq:          './img/icons/faq.svg'
  };

  const DEFAULT_EMOJI = {
    practicefile: '💾',
    exercise:     '✍️',
    quiz:         '📝',
    download:     '📥',
    faq:          '💬',
    next:         '⏭',
    search:       '🔎',
    menu:         '☰'
  };

  const svgIcon = (body) => `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" focusable="false">
      ${body}
    </svg>`;

  const DEFAULT_SVG = {
    practicefile: svgIcon('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4"/>'),
    exercise:     svgIcon('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
    quiz:         svgIcon('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h4M9 16h2"/>'),
    download:     svgIcon('<path d="M12 3v12M8 11l4 4 4-4M5 21h14"/>'),
    faq:          svgIcon('<path d="M21 12a8 8 0 0 1-9 8 9 9 0 0 1-4 1l1-3a8 8 0 1 1 12-6Z"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.5-2.2 1.7-2.2 3M12 16h.01"/>'),
    next:         svgIcon('<path d="m6 7 5 5-5 5M13 7l5 5-5 5"/>'),
    search:       svgIcon('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
    menu:         svgIcon('<path d="M4 6h16M4 12h16M4 18h16"/>')
  };

  // ==================== helpers ====================
  const $  = (sel, root = document) => root.querySelector(sel);

  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'className') {
        n.className = v;
      } else if (k === 'dataset') {
        for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
      } else if (k === 'html') {
        n.innerHTML = String(v);
      } else {
        n.setAttribute(k, v === true ? '' : String(v));
      }
    }

    for (const c of children.flat()) {
      if (c == null) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }

    return n;
  };

  const asArray = (x) => Array.isArray(x) ? x : (x ? [x] : []);

  const pageId = () => {
    const last = location.pathname.substring(location.pathname.lastIndexOf('/') + 1) || 'index.html';
    return decodeURIComponent(last).replace(/\.html?$/i, '');
  };

  const textOf = (o) => o?.text || o?.name || o?.title || o?.label || o?.fileName;

  // 互換用：必要なときだけ使う
  const idOf   = (o) => o?.id ?? o?.target ?? o?.fileId ?? o?.slug;
  const fileURL = (id) => (window.SITE_CONFIG?.fileBase || '') + encodeURIComponent(id);
  const quizURL = (id) => (window.SITE_CONFIG?.quizBase || '') + encodeURIComponent(id);

  // ==================== 設定（既定は厳格モード） ====================
  const LD_CFG = (() => {
    const c = window.SITE_CONFIG?.lessonDock || {};
    return {
      strictUrl:      c.strictUrl !== false,        // 既定: true
      enableFallback: c.enableFallback === true,    // 既定: false
      maxFaqItems:    Number(c.maxFaqItems || 20)   // FAQ表示最大数
    };
  })();

  // ==================== icons ====================
  function getIconConf(key) {
    const fromGlobal = window.SITE_CONFIG?.lessonDockIcons?.[key];
    const fromLocal  = ICON_PATHS?.[key];
    const pick = (fromGlobal !== undefined) ? fromGlobal : fromLocal;

    if (!pick) return { src: '', emoji: DEFAULT_EMOJI[key], svg: DEFAULT_SVG[key] || '' };
    if (typeof pick === 'string') return { src: pick, emoji: DEFAULT_EMOJI[key], svg: '' };
    if (typeof pick === 'object') {
      return {
        src: pick.src || '',
        emoji: pick.emoji || DEFAULT_EMOJI[key],
        svg: pick.svg || ''
      };
    }

    return { src: '', emoji: DEFAULT_EMOJI[key], svg: DEFAULT_SVG[key] || '' };
  }

  function createIconNode(key) {
    const { src, emoji, svg } = getIconConf(key);

    if (!src) {
      if (svg) {
        return el('span', {
          class: 'ld-svg-only',
          'aria-hidden': 'true',
          html: svg
        });
      }
      return el('span', { class: 'ld-emoji-only', 'aria-hidden': 'true' }, emoji);
    }

    const wrap = el('span', { class: 'ld-icon is-emoji' });
    const img  = el('img', { class: 'ld-icon__img', alt: '', 'aria-hidden': 'true', decoding: 'async' });

    img.addEventListener('load',  () => {
      wrap.classList.remove('is-emoji');
      wrap.classList.add('is-img');
    });

    img.addEventListener('error', () => {
      wrap.classList.remove('is-img');
      wrap.classList.add('is-emoji');
    });

    img.src = src;

    const em = el('span', { class: 'ld-icon__emoji', 'aria-hidden': 'true' }, emoji);

    wrap.appendChild(img);
    wrap.appendChild(em);

    return wrap;
  }

  // ==================== page / course helpers ====================

  function inferCourseFromPageKey(pageKey) {
    const key = String(pageKey || '');

    if (key.startsWith('html')) return 'html';
    if (key.startsWith('il'))   return 'il';
    if (key.startsWith('ss'))   return 'ss';
    if (key.startsWith('py'))   return 'py';

    return '';
  }

  function normalizePageKey(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';

    try {
      s = decodeURIComponent(s);
    } catch (e) {}

    s = s.replace(/[?#].*$/, '');
    s = s.replace(/\/+$/, '');
    s = s.split('/').pop();
    s = s.replace(/\.html?$/i, '');

    return s.trim();
  }

  // ==================== FAQ helpers ====================

  function getFaqData() {
    return Array.isArray(window.FAQ_DATA) ? window.FAQ_DATA : [];
  }

  function getFaqCategoryData() {
    return Array.isArray(window.FAQ_CATEGORY_DATA) ? window.FAQ_CATEGORY_DATA : [];
  }

  function getCategoryLabel(type, key) {
    const hit = getFaqCategoryData().find(x => x.type === type && x.key === key);
    return hit?.label || key || '';
  }

  function faqMatchesPage(faq, currentPageKey, currentCourse) {
    if (!faq) return false;

    // faq.js は基本的に公開行だけだが、念のため
    if (faq.status && faq.status !== '公開') return false;

    const displayPages = Array.isArray(faq.displayPages)
      ? faq.displayPages.map(normalizePageKey).filter(Boolean)
      : [];

    // displayPages指定あり → そのページだけ
    if (displayPages.length > 0) {
      return displayPages.includes(currentPageKey);
    }

    // displayPages空欄 → course全体
    return faq.course === currentCourse;
  }

  function getFaqsForPage(currentPageKey) {
    const currentCourse = inferCourseFromPageKey(currentPageKey);

    if (!currentCourse) return [];

    return getFaqData()
      .filter(faq => faqMatchesPage(faq, currentPageKey, currentCourse))
      .sort((a, b) => {
        const pa = Number(a.priority ?? 999);
        const pb = Number(b.priority ?? 999);
        if (pa !== pb) return pa - pb;

        const sa = Number(a.sortOrder ?? 9999);
        const sb = Number(b.sortOrder ?? 9999);
        if (sa !== sb) return sa - sb;

        return String(a.faqId || '').localeCompare(String(b.faqId || ''));
      })
      .slice(0, LD_CFG.maxFaqItems);
  }

  function buildFaqPageUrl(course, query = '') {
    const url = new URL('./faq.html', location.href);
    const trimmedQuery = String(query || '').trim();

    if (course) url.searchParams.set('course', course);
    if (trimmedQuery) url.searchParams.set('q', trimmedQuery);

    return url.href;
  }

  // ==================== 中間モデルの構築 ====================
  function normalizeItem(raw, kind) {
    if (!raw || raw.release === false) return null;

    const text = textOf(raw) || '';
    let url = raw.url || '';

    if (!url && LD_CFG.enableFallback) {
      const fid = idOf(raw);
      if (fid) {
        url = (kind === 'quiz') ? quizURL(fid) : fileURL(fid);
        if (url) console.warn('[lesson_dock] fallback URL used:', kind, text || fid, url);
      }
    }

    if (!url) {
      if (LD_CFG.strictUrl) return null;
    }

    return { ...raw, text, url };
  }

  function listFrom(rawList, kind) {
    return asArray(rawList)
      .map((it) => normalizeItem(it, kind))
      .filter(Boolean);
  }

  function buildLessonDockModel(curr, pages, currentPageKey) {
    const course       = inferCourseFromPageKey(currentPageKey);
    const practicefile = listFrom(curr.practiceFile, 'practicefile');
    const exercise     = listFrom(curr.questionFile, 'exercise');
    const quiz         = listFrom(curr.quizForm,     'quiz');
    const download     = listFrom(curr.dlFile,       'download');
    const faq          = getFaqsForPage(currentPageKey);

    const resolveOneNext = (nx) => {
      if (!nx) return null;

      if (typeof nx === 'string') {
        const p = pages[nx] || {};
        if (p.release === false) return null;

        const url = p.url || p.fileName || `${nx}.html`;
        if (!url && LD_CFG.strictUrl) return null;

        return {
          title: p.title || nx,
          detail: p.detail || '',
          url: url || ''
        };
      }

      if (typeof nx === 'object') {
        if (nx.release === false) return null;

        const pid = nx.id;
        const p = pid ? (pages[pid] || {}) : {};
        if (p.release === false) return null;

        let url = nx.url || '';

        if (!url && pid) {
          url = p.url || p.fileName || `${pid}.html` || '';
        }

        if (!url && LD_CFG.strictUrl) return null;

        return {
          title: nx.title || nx.text || pid || '次回',
          detail: nx.detail || '',
          url: url || ''
        };
      }

      return null;
    };

    let nextArr = [];

    if (Array.isArray(curr.next)) {
      nextArr = curr.next.map(resolveOneNext).filter(Boolean);
    } else {
      const one = resolveOneNext(curr.next);
      if (one) nextArr = [one];
    }

    return {
      course,
      practicefile,
      exercise,
      quiz,
      download,
      faq,
      next: nextArr
    };
  }

  // ==================== sections ====================

  function secList(title, items) {
    const sec = el('div', { class: 'ld-sec' });
    sec.appendChild(el('h3', { class: 'ld-sec__title' }, title));

    const ul = el('ul', { class: 'ld-sec__list' });

    items.forEach(it => {
      const a = el('a', { href: it.url, target: '_blank', rel: 'noopener' }, it.text || title);
      ul.appendChild(el('li', { class: 'ld-sec__item' }, a));
    });

    sec.appendChild(ul);

    return sec;
  }

  function secDownload(title, items) {
    const sec = el('div', { class: 'ld-sec' });
    sec.appendChild(el('h3', { class: 'ld-sec__title' }, title));

    const ul = el('ul', { class: 'ld-sec__list' });

    items.forEach(it => {
      const label = it.text || it.title || it.fileName || 'ダウンロード';
      const downloadName = it.downloadName || it.fileName || '';

      const li = el('li', { class: 'ld-sec__item ld-pair' }, [
        el('span', { class: 'ld-pair__title' }, label),
        el('span', { class: 'ld-pair__links' }, [
          el('a', {
            href: it.url,
            download: downloadName,
            rel: 'noopener',
            class: 'ld-pair__link',
            'aria-label': `${label} をダウンロード`
          }, 'ダウンロード'),
          it.submitUrl ? el('a', {
            href: it.submitUrl,
            target: '_blank',
            rel: 'noopener',
            class: 'ld-pair__link',
            'aria-label': `${label} の提出フォーム`
          }, '提出フォーム') : null
        ].filter(Boolean))
      ]);

      ul.appendChild(li);
    });

    sec.appendChild(ul);

    return sec;
  }

  function secFaq(title, items, course, idSuffix = '') {
    const sec = el('div', { class: 'ld-sec ld-sec--faq' });
    sec.appendChild(el('h3', { class: 'ld-sec__title' }, title));

    const searchId = `lesson-dock-faq-search${idSuffix ? `-${idSuffix}` : ''}`;

    const searchInput = el('input', {
      id: searchId,
      type: 'search',
      class: 'ld-faq-search__input',
      placeholder: 'キーワードを入力',
      autocomplete: 'off',
      enterkeyhint: 'search'
    });

    const searchForm = el('form', {
      class: 'ld-faq-search__form',
      role: 'search',
      'aria-label': 'FAQを検索'
    }, [
      searchInput,
      el('button', {
        type: 'submit',
        class: 'ld-faq-search__button'
      }, '検索')
    ]);

    searchForm.addEventListener('submit', event => {
      event.preventDefault();

      const query = searchInput.value.trim();
      searchInput.value = query;

      if (!query) {
        searchInput.focus();
        return;
      }

      window.open(buildFaqPageUrl(course, query), '_blank', 'noopener');
    });

    const search = el('div', { class: 'ld-faq-search' }, [
      el('label', {
        class: 'ld-faq-search__label',
        for: searchId
      }, 'FAQ全体を検索'),
      searchForm,
      el('a', {
        href: buildFaqPageUrl(course),
        target: '_blank',
        rel: 'noopener',
        class: 'ld-faq-search__all'
      }, 'すべてのFAQを見る')
    ]);

    sec.appendChild(search);

    const wrap = el('div', { class: 'ld-faq-list' });

    items.forEach((faq) => {
      const det = el('details', {
        class: 'ld-faq'
      });

      const summary = el('summary', { class: 'ld-faq__summary' });

      // 質問
      const q = el('span', { class: 'ld-faq__q' });

      if (faq.questionHtml) {
        q.innerHTML = faq.questionHtml;
      } else {
        q.textContent = faq.question || '質問';
      }

      summary.appendChild(q);
      

      // 短い回答
      if (faq.shortAnswerHtml || faq.shortAnswer) {
        const short = el('span', { class: 'ld-faq__short' });

        if (faq.shortAnswerHtml) {
          short.innerHTML = faq.shortAnswerHtml;
        } else {
          short.textContent = faq.shortAnswer || '';
        }

        summary.appendChild(short);
      }

      // タグ
      summary.appendChild(el('span', { class: 'ld-faq__meta' }, [
        faq.unit ? el('span', { class: 'ld-faq__tag' }, faq.unit) : null,
        faq.category ? el('span', { class: 'ld-faq__tag' }, faq.category) : null
      ].filter(Boolean)));

      const body = el('div', { class: 'ld-faq__body' });

      if (faq.bodyHtml) {
        body.innerHTML = faq.bodyHtml;
      } else if (faq.shortAnswerHtml) {
        body.innerHTML = faq.shortAnswerHtml;
      } else {
        body.textContent = faq.shortAnswer || '';
      }

      // 関連教材リンク
      if (faq.relatedPage) {
        const related = el('p', { class: 'ld-faq__related' });
        related.appendChild(el('a', {
          href: faq.relatedPage,
          target: '_blank',
          rel: 'noopener'
        }, '関連教材を開く'));
        body.appendChild(related);
      }

      det.appendChild(summary);
      det.appendChild(body);
      wrap.appendChild(det);
    });

    sec.appendChild(wrap);

    return sec;
  }

  function secNexts(nextList) {
    const sec = el('div', { class: 'ld-sec' });
    sec.appendChild(el('h3', { class: 'ld-sec__title' }, '次回'));

    const wrap = el('div', { class: 'ld-next__cards' });

    nextList.forEach(next => {
      const card = el('a', {
        href: next.url,
        className: 'ld-next__card',
        'aria-label': `次回 ${next.title || ''}`
      }, [
        el('div', { className: 'ld-next__title'  }, next.title || ''),
        el('div', { className: 'ld-next__detail' }, next.detail || '')
      ]);

      wrap.appendChild(card);
    });

    sec.appendChild(wrap);

    return sec;
  }

  // ==================== group (button + panel) ====================

  function buildGroup({
    key,
    label,
    section,
    directUrl = '',
    groupClass = '',
    triggerLabel = label
  }) {
    const group = el('div', {
      class: `lesson-dock__group${groupClass ? ` ${groupClass}` : ''}`
    });
    const panelId = `lesson-dock-panel-${key}`;
    const isDirectLink = Boolean(directUrl);

    const triggerAttrs = {
      class: `lesson-dock__btn lesson-dock__btn--${key}`,
      'aria-label': isDirectLink ? `${triggerLabel}へ移動` : triggerLabel,
      'aria-controls': panelId,
      'aria-expanded': 'false',
      dataset: { label: triggerLabel }
    };

    if (isDirectLink) triggerAttrs.href = directUrl;
    else triggerAttrs.type = 'button';

    const btn = el(isDirectLink ? 'a' : 'button', triggerAttrs, createIconNode(key));

    const panel = el('div', {
      id: panelId,
      class: `lesson-dock__panel lesson-dock__panel--${key}`,
      role: 'group',
      'aria-label': label
    });

    if (section) panel.appendChild(section);

    group.appendChild(btn);
    group.appendChild(panel);

    return { group, btn, panel, isDirectLink };
  }

  function buildActionButton({ key, label, onActivate }) {
    const group = el('div', {
      class: `lesson-dock__group lesson-dock__group--${key}`
    });
    const btn = el('button', {
      type: 'button',
      class: `lesson-dock__btn lesson-dock__btn--${key}`,
      'aria-label': label,
      dataset: { label }
    }, createIconNode(key));

    btn.addEventListener('click', event => {
      event.preventDefault();
      onActivate?.(btn);
    });
    group.appendChild(btn);
    return { group, btn };
  }

  // ==================== hover open / delayed close ====================

  function wireHover(
    { group, btn, panel, isDirectLink },
    {
      openDelay = 220,
      closeDelay = 420,
      onBeforeOpen = () => {},
      onOpened = () => {},
      onClosed = () => {}
    } = {}
  ) {
    let tOpen = null;
    let tClose = null;

    const open  = () => {
      clearTimeout(tClose);
      if (panel.classList.contains('is-open')) return;
      onBeforeOpen();
      panel.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      onOpened();
    };

    const close = () => {
      clearTimeout(tOpen);
      clearTimeout(tClose);
      if (!panel.classList.contains('is-open')) return;
      panel.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      onClosed();
    };

    const scheduleOpen  = () => {
      clearTimeout(tClose);
      tOpen = setTimeout(open, openDelay);
    };

    const scheduleClose = () => {
      clearTimeout(tOpen);
      clearTimeout(tClose);

      if (group.contains(document.activeElement)) return;

      tClose = setTimeout(() => {
        if (!group.contains(document.activeElement)) close();
      }, closeDelay);
    };

    btn.addEventListener('mouseenter', scheduleOpen);
    panel.addEventListener('mouseenter', () => clearTimeout(tClose));
    group.addEventListener('mouseenter', () => clearTimeout(tClose));
    group.addEventListener('mouseleave', scheduleClose);
    panel.addEventListener('focusin', () => {
      clearTimeout(tClose);
      open();
    });
    panel.addEventListener('focusout', event => {
      if (panel.contains(event.relatedTarget)) return;
      scheduleClose();
    });

    if (!isDirectLink) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();

        const willOpen = !panel.classList.contains('is-open');

        clearTimeout(tOpen);
        clearTimeout(tClose);

        if (willOpen) open();
        else close();
      });
    }

    return { group, btn, panel, open, close };
  }

  // ==================== entry point ====================

  function initLessonDockFromPages() {
    if (!window.pages) return;

    const id = pageId();
    const curr = window.pages[id] || null;
    const searchAvailable =
      document.documentElement.dataset.siteSearchReady === 'true' &&
      typeof window.openSiteSearch === 'function';

    if (!curr && !searchAvailable) return;

    const model = buildLessonDockModel(curr || {}, window.pages, id);

    // デバッグ用
    window.lessonDockData = model;

    if (typeof window.__lessonDockCleanup === 'function') {
      window.__lessonDockCleanup();
    }
    $('#lesson-dock')?.remove();

    const root  = el('div', { id: 'lesson-dock', class: 'lesson-dock' });
    const stack = el('div', { class: 'lesson-dock__stack' });

    root.appendChild(stack);

    const groups = [];
    const compactSections = [];

    if (model.practicefile.length) {
      groups.push(buildGroup({
        key: 'practicefile',
        label: '実習ファイル',
        section: secList('実習ファイル', model.practicefile),
        groupClass: 'lesson-dock__group--desktop'
      }));
      compactSections.push(secList('実習ファイル', model.practicefile));
    }

    if (model.exercise.length) {
      groups.push(buildGroup({
        key: 'exercise',
        label: '演習問題',
        section: secList('演習問題', model.exercise),
        groupClass: 'lesson-dock__group--desktop'
      }));
      compactSections.push(secList('演習問題', model.exercise));
    }

    if (model.quiz.length) {
      groups.push(buildGroup({
        key: 'quiz',
        label: '確認テスト',
        section: secList('確認テスト', model.quiz),
        groupClass: 'lesson-dock__group--desktop'
      }));
      compactSections.push(secList('確認テスト', model.quiz));
    }

    if (model.download.length) {
      groups.push(buildGroup({
        key: 'download',
        label: 'ダウンロードファイル',
        section: secDownload('ダウンロードファイル', model.download),
        groupClass: 'lesson-dock__group--desktop'
      }));
      compactSections.push(secDownload('ダウンロードファイル', model.download));
    }

    if (model.course) {
      groups.push(buildGroup({
        key: 'faq',
        label: 'よくある質問',
        section: secFaq('よくある質問', model.faq, model.course),
        groupClass: 'lesson-dock__group--desktop'
      }));
      compactSections.push(secFaq('よくある質問', model.faq, model.course, 'compact'));
    }

    if (compactSections.length) {
      groups.push(buildGroup({
        key: 'menu',
        label: '教材メニュー',
        section: el('div', { class: 'ld-compact-menu' }, compactSections),
        groupClass: 'lesson-dock__group--compact'
      }));
    }

    if (model.next.length) {
      groups.push(buildGroup({
        key: 'next',
        label: '次回',
        section: secNexts(model.next),
        directUrl: model.next.length === 1 ? model.next[0].url : '',
        groupClass: 'lesson-dock__group--next',
        triggerLabel: model.next.length === 1
          ? `次回：${model.next[0].title || '次のページ'}`
          : `次回（${model.next.length}件）`
      }));
    }

    const searchAction = searchAvailable
      ? buildActionButton({
          key: 'search',
          label: '教材サイト内検索',
          onActivate: button => window.openSiteSearch(button)
        })
      : null;

    if (!groups.length && !searchAction) return;

    groups.forEach(g => stack.appendChild(g.group));
    if (searchAction) stack.appendChild(searchAction.group);
    document.body.appendChild(root);

    const controllers = [];
    let activeController = null;

    groups.forEach(group => {
      let controller = null;
      controller = wireHover(group, {
        openDelay: 220,
        closeDelay: 420,
        onBeforeOpen: () => {
          controllers.forEach(other => {
            if (other !== controller) other.close();
          });
          document.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, {
            detail: { source: 'lesson-dock' }
          }));
        },
        onOpened: () => {
          activeController = controller;
        },
        onClosed: () => {
          if (activeController === controller) activeController = null;
        }
      });
      controllers.push(controller);
    });

    const closeAll = () => controllers.forEach(controller => controller.close());

    const handleExternalOverlay = event => {
      if (event.detail?.source === 'lesson-dock') return;
      closeAll();
    };

    const handleOutsidePointer = event => {
      if (!root.contains(event.target)) closeAll();
    };

    const handleEscape = event => {
      if (event.key !== 'Escape' || !activeController) return;
      const trigger = activeController.btn;
      closeAll();
      trigger.focus();
    };

    const compactQuery = window.matchMedia('(max-width: 900px), (max-height: 600px)');
    const handleCompactChange = () => closeAll();

    document.addEventListener(OVERLAY_OPEN_EVENT, handleExternalOverlay);
    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);

    if (typeof compactQuery.addEventListener === 'function') {
      compactQuery.addEventListener('change', handleCompactChange);
    } else {
      compactQuery.addListener(handleCompactChange);
    }

    window.__lessonDockCleanup = () => {
      closeAll();
      document.removeEventListener(OVERLAY_OPEN_EVENT, handleExternalOverlay);
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);

      if (typeof compactQuery.removeEventListener === 'function') {
        compactQuery.removeEventListener('change', handleCompactChange);
      } else {
        compactQuery.removeListener(handleCompactChange);
      }
    };
  }

  // main.js から呼ぶ
  window.initLessonDockFromPages = initLessonDockFromPages;
})();
