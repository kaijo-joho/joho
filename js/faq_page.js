// ./js/faq_page.js
(() => {
  'use strict';

  const COURSE_KEYS = ['il', 'html', 'ss', 'py'];

  const COURSE_LABEL_FALLBACK = {
    il: 'Illustrator実習',
    html: 'HTML実習',
    ss: 'スプレッドシート実習',
    py: 'Python講座'
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;

      if (k === 'className') {
        n.className = v;
      } else if (k === 'dataset') {
        for (const [dk, dv] of Object.entries(v)) {
          if (dv != null) n.dataset[dk] = dv;
        }
      } else if (k === 'html') {
        n.innerHTML = String(v);
      } else {
        n.setAttribute(k, v === true ? '' : String(v));
      }
    }

    for (const child of children.flat()) {
      if (child == null) continue;
      n.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }

    return n;
  };

  const normalizeText = (s) => String(s || '').trim();

  const normalizeForSearch = (s) => {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getFaqData = () => Array.isArray(window.FAQ_DATA) ? window.FAQ_DATA : [];
  const getCategoryData = () => Array.isArray(window.FAQ_CATEGORY_DATA) ? window.FAQ_CATEGORY_DATA : [];

  function getParam(name) {
    return new URL(location.href).searchParams.get(name) || '';
  }

  function setParam(name, value) {
    const url = new URL(location.href);

    if (value) {
      url.searchParams.set(name, value);
    } else {
      url.searchParams.delete(name);
    }

    history.replaceState(null, '', url);
  }

  function getCategoryItems(type, parent = '') {
    return getCategoryData()
      .filter(x => x.type === type)
      .filter(x => parent ? x.parent === parent : true)
      .filter(x => x.enabled !== false)
      .sort((a, b) => Number(a.sortOrder ?? 9999) - Number(b.sortOrder ?? 9999));
  }

  function getCourseLabel(course) {
    const hit = getCategoryData().find(x => x.type === 'course' && x.key === course);
    return hit?.label || COURSE_LABEL_FALLBACK[course] || course || 'すべて';
  }

  function getCourseFromQuery() {
    const c = normalizeText(getParam('course'));
    return COURSE_KEYS.includes(c) ? c : '';
  }

  function getInitialState() {
    return {
      course: getCourseFromQuery(),
      unit: normalizeText(getParam('unit')),
      category: normalizeText(getParam('type')) || normalizeText(getParam('faqCategory')),
      keyword: normalizeText(getParam('keyword')),
      q: normalizeText(getParam('q'))
    };
  }

  function getAllKeywords(faqs) {
    const set = new Set();

    faqs.forEach(faq => {
      if (Array.isArray(faq.keywords)) {
        faq.keywords.forEach(k => {
          const s = normalizeText(k);
          if (s) set.add(s);
        });
      }
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html || '');
    return div.textContent || div.innerText || '';
  }

  function getSearchTarget(faq) {
    return normalizeForSearch([
      faq.faqId,
      faq.course,
      faq.courseLabel,
      faq.unit,
      faq.category,
      faq.question,
      faq.shortAnswer,
      stripHtml(faq.bodyHtml),
      Array.isArray(faq.keywords) ? faq.keywords.join(' ') : ''
    ].join(' '));
  }

  function applyFilters(faqs, state) {
    const q = normalizeForSearch(state.q);
    const keyword = normalizeText(state.keyword);

    return faqs
      .filter(faq => faq.status === '公開' || !faq.status)
      .filter(faq => state.course ? faq.course === state.course : true)
      .filter(faq => state.unit ? faq.unit === state.unit : true)
      .filter(faq => state.category ? faq.category === state.category : true)
      .filter(faq => {
        if (!keyword) return true;
        return Array.isArray(faq.keywords) && faq.keywords.includes(keyword);
      })
      .filter(faq => {
        if (!q) return true;
        return getSearchTarget(faq).includes(q);
      })
      .sort((a, b) => {
        const ca = String(a.course || '');
        const cb = String(b.course || '');
        if (ca !== cb) return ca.localeCompare(cb);

        const pa = Number(a.priority ?? 999);
        const pb = Number(b.priority ?? 999);
        if (pa !== pb) return pa - pb;

        const sa = Number(a.sortOrder ?? 9999);
        const sb = Number(b.sortOrder ?? 9999);
        if (sa !== sb) return sa - sb;

        return String(a.faqId || '').localeCompare(String(b.faqId || ''));
      });
  }

  function renderCourseTabs(state, onChange) {
    const wrap = el('div', {
      class: 'faq-course-tabs',
      role: 'tablist',
      'aria-label': '実習の種類'
    });

    const makeBtn = (label, value) => {
      const active = state.course === value || (!state.course && !value);

      const btn = el('button', {
        type: 'button',
        class: `faq-course-tab${active ? ' is-active' : ''}`,
        'aria-pressed': active ? 'true' : 'false'
      }, label);

      btn.addEventListener('click', () => {
        state.course = value;
        state.unit = '';
        state.keyword = '';

        setParam('course', value);
        setParam('unit', '');
        setParam('keyword', '');

        onChange();
      });

      return btn;
    };

    wrap.appendChild(makeBtn('すべて', ''));

    getCategoryItems('course').forEach(c => {
      wrap.appendChild(makeBtn(c.label, c.key));
    });

    return wrap;
  }

  function renderSelect(labelText, value, options, onChange, emptyLabel = 'すべて') {
    const label = el('label', { class: 'faq-filter-label' });
    label.appendChild(el('span', { class: 'faq-filter-label__text' }, labelText));

    const select = el('select', { class: 'faq-filter-select' });
    select.appendChild(el('option', { value: '' }, emptyLabel));

    options.forEach(opt => {
      const option = el('option', { value: opt.value }, opt.label);
      if (opt.value === value) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      onChange(select.value);
    });

    label.appendChild(select);

    return label;
  }

  function renderFilterArticle(state, onChange) {
    const allFaqs = getFaqData();
    const baseFaqs = state.course
      ? allFaqs.filter(faq => faq.course === state.course)
      : allFaqs;

    const units = Array.from(
      new Set(baseFaqs.map(faq => normalizeText(faq.unit)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'ja'));

    const categories = Array.from(
      new Set(baseFaqs.map(faq => normalizeText(faq.category)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'ja'));

    const keywords = getAllKeywords(baseFaqs);

    const article = el('article', { class: 'faq-filter-article' });

    const title = state.course
      ? `${getCourseLabel(state.course)}のFAQ`
      : 'すべてのFAQ';

    article.appendChild(el('h2', { class: 'faq-filter-title' }, title));

    article.appendChild(el('p', { class: 'faq-filter-lead' },
      state.course
        ? `${getCourseLabel(state.course)}に関するFAQを表示しています。条件を変更して絞り込めます。`
        : 'すべての分野のFAQを表示しています。分野・単元・カテゴリ・キーワードで絞り込めます。'
    ));

    article.appendChild(renderCourseTabs(state, onChange));

    const controls = el('div', { class: 'faq-controls' });

    const search = el('label', { class: 'faq-search' }, [
      el('span', { class: 'faq-filter-label__text' }, '検索'),
      el('input', {
        type: 'search',
        class: 'faq-search__input',
        value: state.q || '',
        placeholder: '例：PNG、保存、文字、エラー'
      })
    ]);

    const searchInput = search.querySelector('input');
    let timer = null;

    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.q = searchInput.value.trim();
        setParam('q', state.q);
        onChange();
      }, 120);
    });

    const unitSelect = renderSelect(
      '単元',
      state.unit,
      units.map(x => ({ value: x, label: x })),
      (v) => {
        state.unit = v;
        setParam('unit', v);
        onChange();
      }
    );

    const categorySelect = renderSelect(
      'FAQカテゴリ',
      state.category,
      categories.map(x => ({ value: x, label: x })),
      (v) => {
        state.category = v;
        setParam('type', v);
        onChange();
      }
    );

    const keywordSelect = renderSelect(
      'キーワード',
      state.keyword,
      keywords.map(x => ({ value: x, label: x })),
      (v) => {
        state.keyword = v;
        setParam('keyword', v);
        onChange();
      }
    );

    const resetBtn = el('button', {
      type: 'button',
      class: 'faq-reset'
    }, '条件をリセット');

    resetBtn.addEventListener('click', () => {
      state.course = '';
      state.unit = '';
      state.category = '';
      state.keyword = '';
      state.q = '';

      const url = new URL(location.href);
      ['course', 'category', 'unit', 'type', 'faqCategory', 'keyword', 'q'].forEach(k => {
        url.searchParams.delete(k);
      });
      history.replaceState(null, '', url);

      onChange();
    });

    controls.appendChild(search);
    controls.appendChild(unitSelect);
    controls.appendChild(categorySelect);
    controls.appendChild(keywordSelect);
    controls.appendChild(resetBtn);

    article.appendChild(controls);

    return article;
  }

  function renderResultSummary(state, count, total) {
    const parts = [];

    if (state.course) parts.push(getCourseLabel(state.course));
    if (state.unit) parts.push(state.unit);
    if (state.category) parts.push(state.category);
    if (state.keyword) parts.push(`キーワード：${state.keyword}`);
    if (state.q) parts.push(`検索：${state.q}`);

    const text = parts.length
      ? `${parts.join(' / ')} のFAQ：${count}件`
      : `FAQ：${count}件`;

    const summary = el('div', { class: 'faq-result-summary' });
    summary.appendChild(el('strong', {}, text));

    if (count !== total) {
      summary.appendChild(el('span', {}, `（全${total}件中）`));
    }

    return summary;
  }

  function renderFaqCard(faq) {
    const details = el('details', { class: 'faq-card' });

    const summary = el('summary', { class: 'faq-card__summary' });

    summary.appendChild(el('span', { class: 'faq-card__course' }, getCourseLabel(faq.course)));
    
    const q = el('span', { class: 'faq-card__question' });

    if (faq.questionHtml) {
      q.innerHTML = faq.questionHtml;
    } else {
      q.textContent = faq.question || '質問';
    }

    summary.appendChild(q);


    if (faq.shortAnswerHtml || faq.shortAnswer) {
      const short = el('span', { class: 'faq-card__short' });
      if (faq.shortAnswerHtml) {
        short.innerHTML = faq.shortAnswerHtml;
      } else {
        short.textContent = faq.shortAnswer;
      }
      summary.appendChild(short);
    }

    const meta = el('span', { class: 'faq-card__meta' });

    if (faq.unit) meta.appendChild(el('span', { class: 'faq-card__tag' }, faq.unit));
    if (faq.category) meta.appendChild(el('span', { class: 'faq-card__tag' }, faq.category));

    if (Array.isArray(faq.keywords)) {
      faq.keywords.slice(0, 6).forEach(k => {
        meta.appendChild(el('span', { class: 'faq-card__tag faq-card__tag--keyword' }, k));
      });
    }

    summary.appendChild(meta);

    const body = el('div', { class: 'faq-card__body' });

    if (faq.bodyHtml) {
      body.innerHTML = faq.bodyHtml;
    } else if (faq.shortAnswerHtml) {
      body.innerHTML = faq.shortAnswerHtml;
    } else {
      body.textContent = faq.shortAnswer || '';
    }

    const links = [];

    if (faq.relatedPage) {
      links.push(el('a', {
        href: faq.relatedPage,
        target: '_blank',
        rel: 'noopener',
        class: 'faq-card__related-link'
      }, '関連教材を開く'));
    }

    if (faq.relatedSlide) {
      links.push(el('a', {
        href: faq.relatedSlide,
        target: '_blank',
        rel: 'noopener',
        class: 'faq-card__related-link'
      }, '関連スライドを開く'));
    }

    if (links.length) {
      body.appendChild(el('div', { class: 'faq-card__related' }, links));
    }

    details.appendChild(summary);
    details.appendChild(body);

    return details;
  }

  function renderResultsArticle(state) {
    const allFaqs = getFaqData().filter(faq => faq.status === '公開' || !faq.status);
    const filtered = applyFilters(allFaqs, state);

    const article = el('article', { class: 'faq-results-article' });

    article.appendChild(renderResultSummary(state, filtered.length, allFaqs.length));

    if (!filtered.length) {
      article.appendChild(el('p', { class: 'faq-empty' }, '条件に一致するFAQはありません。'));
      return article;
    }

    const list = el('div', { class: 'faq-list' });

    filtered.forEach(faq => {
      list.appendChild(renderFaqCard(faq));
    });

    article.appendChild(list);

    return article;
  }

  function renderApp() {
    const root = $('#faq-app');
    if (!root) return;

    if (!getFaqData().length) {
      root.innerHTML = `
        <article>
          <p>FAQデータが見つかりません。<code>js/faq.js</code> が読み込まれているか確認してください。</p>
        </article>
      `;
      return;
    }

    const state = getInitialState();

    const update = () => {
      root.innerHTML = '';
      root.appendChild(renderFilterArticle(state, update));
      root.appendChild(renderResultsArticle(state));
    };

    update();
  }

  function waitForFaqDataAndRender() {
    let count = 0;
    const max = 80;

    const tick = () => {
      if (Array.isArray(window.FAQ_DATA)) {
        renderApp();
        return;
      }

      count++;
      if (count > max) {
        const root = $('#faq-app');
        if (root) {
          root.innerHTML = `
            <article>
              <p>FAQデータの読み込みに失敗しました。</p>
            </article>
          `;
        }
        return;
      }

      setTimeout(tick, 50);
    };

    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForFaqDataAndRender, { once: true });
  } else {
    waitForFaqDataAndRender();
  }

  document.addEventListener('pages:ready', () => {
    if (Array.isArray(window.FAQ_DATA)) renderApp();
  });
})();