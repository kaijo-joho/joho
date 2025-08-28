// ./js/lesson_dock.js
(() => {
  'use strict';

  // ==================== アイコン設定（任意） ====================
  const ICON_PATHS = {
    // practicefile: './img/icons/notebook.svg',
    // exercise:     './img/icons/exercise.svg',
    // quiz:         { src: './img/icons/quiz.svg', emoji: '📝' },
    // download:     './img/icons/download.svg',
    // next:         './img/icons/next.svg'
  };

  const DEFAULT_EMOJI = {
    practicefile: '💾',
    exercise:     '✍️',
    quiz:         '📝',
    download:     '📥',
    next:         '⏭'
  };

  // ==================== helpers ====================
  const $  = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'className') n.className = v;
      else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
      else n.setAttribute(k, v === true ? '' : String(v));
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
      strictUrl:    c.strictUrl !== false,     // 既定: true（URL必須）
      enableFallback: c.enableFallback === true // 既定: false（自動構築しない）
    };
  })();

  // ==================== icons ====================
  function getIconConf(key) {
    const fromGlobal = window.SITE_CONFIG?.lessonDockIcons?.[key];
    const fromLocal  = ICON_PATHS?.[key];
    const pick = (fromGlobal !== undefined) ? fromGlobal : fromLocal;
    if (!pick) return { src: '', emoji: DEFAULT_EMOJI[key] };
    if (typeof pick === 'string') return { src: pick, emoji: DEFAULT_EMOJI[key] };
    if (typeof pick === 'object') return { src: pick.src || '', emoji: pick.emoji || DEFAULT_EMOJI[key] };
    return { src: '', emoji: DEFAULT_EMOJI[key] };
  }
  function createIconNode(key) {
    const { src, emoji } = getIconConf(key);
    if (!src) return el('span', { class: 'ld-emoji-only', 'aria-hidden': 'true' }, emoji);
    const wrap = el('span', { class: 'ld-icon is-emoji' });
    const img  = el('img', { class: 'ld-icon__img', alt: '', 'aria-hidden': 'true', decoding: 'async' });
    img.addEventListener('load',  () => { wrap.classList.remove('is-emoji'); wrap.classList.add('is-img'); });
    img.addEventListener('error', () => { wrap.classList.remove('is-img');   wrap.classList.add('is-emoji'); });
    img.src = src;
    const em  = el('span', { class: 'ld-icon__emoji', 'aria-hidden': 'true' }, emoji);
    wrap.appendChild(img); wrap.appendChild(em);
    return wrap;
  }

  // ==================== 中間モデルの構築 ====================
  function normalizeItem(raw, kind) {
    if (!raw) return null;

    // ラベルの決定
    const text = textOf(raw) || '';
    // URLの決定（原則JSON必須）
    let url = raw.url || '';

    if (!url && LD_CFG.enableFallback) {
      const fid = idOf(raw);
      if (fid) {
        url = (kind === 'quiz') ? quizURL(fid) : fileURL(fid);
        if (url) console.warn('[lesson_dock] fallback URL used:', kind, text || fid, url);
      }
    }
    if (!url) {
      // strict のときは非表示にする
      if (LD_CFG.strictUrl) return null;
    }

    // 余剰フィールドは素通し（将来拡張用）
    const out = { ...raw, text, url };
    return out;
  }

  function listFrom(rawList, kind) {
    return asArray(rawList)
      .map((it) => normalizeItem(it, kind))
      .filter(Boolean);
  }

  function buildLessonDockModel(curr, pages) {
    const practicefile = listFrom(curr.practiceFile, 'practicefile');
    const exercise     = listFrom(curr.questionFile, 'exercise');
    const quiz         = listFrom(curr.quizForm,     'quiz');
    const download     = listFrom(curr.dlFile,       'download'); // submitUrl を保持

    // next: false | オブジェクト | 配列 | 文字列(id)
    const resolveOneNext = (nx) => {
      if (!nx) return null;

      // 文字列（ページID）
      if (typeof nx === 'string') {
        const p = pages[nx] || {};
        const url = p.url || p.fileName || `${nx}.html`;
        if (!url && LD_CFG.strictUrl) return null;
        return { title: p.title || nx, detail: p.detail || '', url: url || '' };
      }

      // オブジェクト
      if (typeof nx === 'object') {
        const pid = nx.id;
        let url = nx.url || '';
        if (!url && pid) {
          const p = pages[pid] || {};
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

    return { practicefile, exercise, quiz, download, next: nextArr };
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

  // ダウンロード専用：タイトル + [ダウンロード][提出フォーム]
  function secDownload(title, items) {
    const sec = el('div', { class: 'ld-sec' });
    sec.appendChild(el('h3', { class: 'ld-sec__title' }, title));
    const ul = el('ul', { class: 'ld-sec__list' });

    items.forEach(it => {
      const label = it.text || it.title || it.fileName || 'ダウンロード';
      const li = el('li', { class: 'ld-sec__item ld-pair' }, [
        el('span', { class: 'ld-pair__title' }, label),
        el('span', { class: 'ld-pair__links' }, [
          el('a', {
            href: it.url, target: '_blank', rel: 'noopener',
            class: 'ld-pair__link', 'aria-label': `${label} をダウンロード`
          }, 'ダウンロード'),
          it.submitUrl ? el('a', {
            href: it.submitUrl, target: '_blank', rel: 'noopener',
            class: 'ld-pair__link', 'aria-label': `${label} の提出フォーム`
          }, '提出フォーム') : null
        ].filter(Boolean))
      ]);
      ul.appendChild(li);
    });

    sec.appendChild(ul);
    return sec;
  }

  // 次回：配列なら複数カード
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
  function buildGroup({ key, label, section }) {
    const group = el('div', { class: 'lesson-dock__group' });

    const btn = el('button', {
      type: 'button',
      class: `lesson-dock__btn lesson-dock__btn--${key}`,
      'aria-label': label,
      'aria-expanded': 'false'
    }, createIconNode(key));

    const panel = el('div', { class: 'lesson-dock__panel', role: 'group', 'aria-label': label });
    if (section) panel.appendChild(section);

    group.appendChild(btn);
    group.appendChild(panel);
    return { group, btn, panel };
  }

  // ==================== hover open / delayed close ====================
  function wireHover({ group, btn, panel }, { openDelay = 220, closeDelay = 420 } = {}) {
    let tOpen = null, tClose = null;
    const open  = () => { clearTimeout(tClose); panel.classList.add('is-open');  btn.setAttribute('aria-expanded', 'true');  };
    const close = () => { clearTimeout(tOpen);  panel.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); };

    const scheduleOpen  = () => { clearTimeout(tClose); tOpen  = setTimeout(open,  openDelay); };
    const scheduleClose = () => { clearTimeout(tOpen);  tClose = setTimeout(close, closeDelay); };

    btn.addEventListener('mouseenter', scheduleOpen);
    panel.addEventListener('mouseenter', () => clearTimeout(tClose));
    group.addEventListener('mouseenter', () => clearTimeout(tClose));
    group.addEventListener('mouseleave', scheduleClose);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const willOpen = !panel.classList.contains('is-open');
      clearTimeout(tOpen); clearTimeout(tClose);
      if (willOpen) open(); else close();
    });
  }

  // ==================== entry point ====================
  function initLessonDockFromPages() {
    if (!window.pages) return;
    const id   = pageId();
    const curr = window.pages[id];
    if (!curr) return;

    // 中間JSONに正規化
    const model = buildLessonDockModel(curr, window.pages);
    // デバッグ用に公開（任意）
    window.lessonDockData = model;

    // 旧DOMを消して作り直し
    $('#lesson-dock')?.remove();
    const root  = el('div', { id: 'lesson-dock', class: 'lesson-dock' });
    const stack = el('div', { class: 'lesson-dock__stack' });
    root.appendChild(stack);

    const groups = [];

    if (model.practicefile.length) {
      groups.push(buildGroup({
        key: 'practicefile',
        label: '実習ファイル',
        section: secList('実習ファイル', model.practicefile)
      }));
    }
    if (model.exercise.length) {
      groups.push(buildGroup({
        key: 'exercise',
        label: '演習問題',
        section: secList('演習問題', model.exercise)
      }));
    }
    if (model.quiz.length) {
      groups.push(buildGroup({
        key: 'quiz',
        label: '確認テスト',
        section: secList('確認テスト', model.quiz)
      }));
    }
    if (model.download.length) {
      groups.push(buildGroup({
        key: 'download',
        label: 'ダウンロードファイル',
        section: secDownload('ダウンロードファイル', model.download)
      }));
    }
    if (model.next.length) {
      groups.push(buildGroup({
        key: 'next',
        label: '次回',
        section: secNexts(model.next)
      }));
    }

    if (!groups.length) return;

    groups.forEach(g => stack.appendChild(g.group));
    document.body.appendChild(root);

    // ホバー開閉（遅延）
    groups.forEach(g => wireHover(g, { openDelay: 220, closeDelay: 420 }));
  }

  // main.js から呼ぶ
  window.initLessonDockFromPages = initLessonDockFromPages;
})();