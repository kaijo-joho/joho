(function(global) {
  'use strict';

  const COURSE_KEYS = ['il', 'html', 'ss', 'py'];
  const AI_COURSE_KEYS = [...COURSE_KEYS, 'dr', 'lc', 'nw'];

  const FAQBOT_WEB_APP_URL =
    'https://script.google.com/macros/s/AKfycbzSuitUdIidJRMXTrJCOcdxE1fdcFLj8NB-LfHM1z0KABRzv463y131Y6KR2TYoOtk/exec';

  const COURSE_LABEL_FALLBACK = {
    il: 'Illustrator実習',
    html: 'HTML実習',
    ss: 'スプレッドシート実習',
    py: 'Python講座'
  };

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
      .normalize('NFKC')
      .toLocaleLowerCase('ja')
      .replace(/\s+/g, ' ')
      .trim();
  };

  function getCourseLabel(course) {
    const categories = Array.isArray(global.FAQ_CATEGORY_DATA) ? global.FAQ_CATEGORY_DATA : [];
    return categories.find(item => item.type === 'course' && item.key === course)?.label ||
      COURSE_LABEL_FALLBACK[course] || course || 'すべて';
  }

  function stripHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    return template.content.textContent || '';
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
    const tokens = normalizeForSearch(state.q).split(' ').filter(Boolean);
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
        if (!tokens.length) return true;
        const target = getSearchTarget(faq);
        return tokens.every(token => target.includes(token));
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

  function renderFaqCard(faq, { compact = false } = {}) {
    const details = el('details', { class: `faq-card${compact ? ' faq-card--compact' : ''}` });

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

  // 検索語やハッシュを引き継がず、講座・元ページだけをAI相談室へ渡す。
  function buildFaqBotUrl(state = {}, { baseUrl = location.href, pageKey = 'faq' } = {}) {
    const faqBotUrl = new URL(FAQBOT_WEB_APP_URL);
    const returnUrl = new URL(baseUrl);
    returnUrl.search = '';
    returnUrl.hash = '';
    returnUrl.username = '';
    returnUrl.password = '';

    if (AI_COURSE_KEYS.includes(state.course)) {
      faqBotUrl.searchParams.set('course', state.course);
      if (COURSE_KEYS.includes(state.course) && /\/faq\.html$/.test(returnUrl.pathname)) {
        returnUrl.searchParams.set('course', state.course);
      }
    }
    faqBotUrl.searchParams.set('page', /^[A-Za-z0-9._-]{1,40}$/.test(pageKey) ? pageKey : 'faq');
    faqBotUrl.searchParams.set('returnUrl', returnUrl.href);
    return faqBotUrl.href;
  }

  function renderAiEscalation(state, { baseUrl = location.href, pageKey = 'faq', idPrefix = 'faq', onCancel } = {}) {
    const section = el('section', {
      class: 'faq-ai-escalation',
      'aria-labelledby': `${idPrefix}-ai-escalation-title`
    });

    section.appendChild(el('h3', {
      id: `${idPrefix}-ai-escalation-title`,
      class: 'faq-ai-escalation__title'
    }, 'AIに質問しますか？'));

    section.appendChild(el('p', { class: 'faq-ai-escalation__lead' },
      '「はい」を選ぶと、学校のGoogleアカウントで利用するAI相談室へ移動します。質問は移動先で改めて入力してください。'
    ));

    section.appendChild(el('p', { class: 'faq-ai-escalation__note' },
      '検索語は引き継がれません。氏名、メールアドレス、学籍番号などの個人情報は入力しないでください。'
    ));

    const yesLink = el('a', {
      href: buildFaqBotUrl(state, { baseUrl, pageKey }),
      referrerpolicy: 'no-referrer',
      class: 'faq-ai-escalation__yes',
      'data-faqbot-link': ''
    }, 'はい、AI相談室へ');

    const noButton = el('button', {
      type: 'button',
      class: 'faq-ai-escalation__no'
    }, 'いいえ、検索を続ける');

    noButton.addEventListener('click', () => {
      if (typeof onCancel === 'function') onCancel();
    });

    section.appendChild(el('div', { class: 'faq-ai-escalation__actions' }, [
      yesLink,
      noButton
    ]));

    return section;
  }

  global.siteFaq = {
    COURSE_KEYS, normalizeForSearch, applyFilters, renderFaqCard, renderAiEscalation, buildFaqBotUrl
  };
})(window);
