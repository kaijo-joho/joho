// ./js/script.js
(() => {
  'use strict';

  const COMMON_DESCRIPTION = {
    dlFile_gdrive:'実習のはじめに、下記リンク先から実習ファイルを各自のパソコンに保存してください。',
    dlFile_local: '実習のはじめに、下記リンクを<b>右クリック（または ２本指クリック）</b>して<b>リンク先を別名で保存...</b>を選び、各自のパソコンに保存してください。',
    dlFile:       '実習のはじめに、下記リンク先から実習ファイルを各自のパソコンに保存してください。',
    practiceFile: '実習のはじめに、下記リンク先から実習ファイルを各自の個別フォルダにダウンロードしてください。',
    questionFile: 'このページの内容についての問題演習に取り組んでください。',
    quizForm:     'このページの内容についての確認テストに取り組んでください。',
  };

  let inited = false;

  /** ========= メタ情報の取得 ========= */
  function getCurrentPageId() {
    const name = location.pathname.split('/').pop() || 'index';
    return name.replace(/\.html?$/i, '') || 'index';
  }

  function getPageMeta() {
    const pages =
      (window.page  && typeof window.page  === 'object' ? window.page  : null) ||
      (window.pages && typeof window.pages === 'object' ? window.pages : null) ||
      {};

    const id = getCurrentPageId();

    // "index" と "index.html" の両取り、拡張子ありなしの両取り
    const candidates = id === 'index'
      ? ['index', 'index.html']
      : [id, `${id}.html`];

    for (const k of candidates) {
      if (k in pages) return pages[k];
    }
    return null;
  }

  const meta = getPageMeta();

  function hasMeaningfulContent(element) {
    if (!element) return false;
    return Array.from(element.childNodes).some(node =>
      node.nodeType === Node.ELEMENT_NODE ||
      (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '')
    );
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function releasedItems(type) {
    const items = meta && Array.isArray(meta[type]) ? meta[type] : [];
    return items.filter(item =>
      item && item.release !== false && text(item.url) !== ''
    );
  }

  /** ========= ヘッダ生成 ========= */
  function ensureHeader() {
    const label = meta ? text(meta.mainTitle) : '';
    const legacyHeader = document.getElementById('headerbar');
    const keepLegacyHeader = hasMeaningfulContent(legacyHeader);

    // コメントだけの旧プレースホルダーは、空白領域を残さないよう除去する。
    if (legacyHeader && !keepLegacyHeader) legacyHeader.remove();

    let header = document.getElementById('site-header');
    if (!header && !keepLegacyHeader) {
      header = document.createElement('header');
      header.id = 'site-header';
      header.setAttribute('role', 'banner');
      document.body.insertBefore(header, document.body.firstChild);
    }

    if (header && !header.querySelector('.headerbar')) {
      const headerbar = document.createElement('div');
      headerbar.className = 'headerbar';

      const headerbarBrand = document.createElement('div');
      headerbarBrand.className = 'headerbar__brand';
      headerbarBrand.setAttribute('aria-label', '学校名');

      const brandLink = document.createElement('a');
      brandLink.href = './index.html';
      brandLink.append('海城中学高等学校');

      const subjectSpan = document.createElement('span');
      subjectSpan.className = 'subject';
      subjectSpan.textContent = '情報科';
      brandLink.appendChild(subjectSpan);
      headerbarBrand.appendChild(brandLink);
      headerbar.appendChild(headerbarBrand);

      if (label !== '') {
        const headerbarCourse = document.createElement('a');
        headerbarCourse.id = 'headerbar__course';
        headerbarCourse.className = 'headerbar__course';
        headerbarCourse.textContent = label;
        headerbarCourse.setAttribute('aria-label', '講座名');
        const backFile = text(meta.backFile);
        if (backFile) {
          headerbarCourse.href = backFile;
        } else {
          headerbarCourse.classList.add('is-disabled');
          headerbarCourse.setAttribute('aria-disabled', 'true');
        }
        headerbar.appendChild(headerbarCourse);
      }

      header.appendChild(headerbar);
    }

    if (!meta || meta.id === 'link' || text(meta.title) === '') return;

    let pageHeader = document.getElementById('page_header');
    if (pageHeader && hasMeaningfulContent(pageHeader)) return;

    if (!pageHeader) {
      pageHeader = document.createElement('section');
      pageHeader.id = 'page_header';
      const anchor = header || (keepLegacyHeader ? legacyHeader : null);
      if (anchor) anchor.after(pageHeader);
      else document.body.insertBefore(pageHeader, document.body.firstChild);
    }

    const article = document.createElement('article');
    const h1 = document.createElement('h1');
    const titleAnchor = document.createElement('a');
    titleAnchor.id = 'title';
    titleAnchor.textContent = text(meta.title);
    h1.appendChild(titleAnchor);
    article.appendChild(h1);

    const detail = text(meta.detail);
    if (detail) {
      const detailParagraph = document.createElement('p');
      detailParagraph.className = 'page_detail';
      detailParagraph.textContent = detail;
      article.appendChild(detailParagraph);
    }

    if (meta.mainTitle === 'Python講座' && !['py00', 'py91'].includes(meta.id)) {
      const errorGuide = document.createElement('p');
      errorGuide.append('エラーが出たら');
      const errorLink = document.createElement('a');
      errorLink.href = './py91.html';
      errorLink.target = '_blank';
      errorLink.rel = 'noopener';
      errorLink.textContent = 'エラー処理';
      errorGuide.append(errorLink, 'を参照し修正してください。');
      article.appendChild(errorGuide);
    }

    createDescAndFileList(article, 'dlFile');
    createDescAndFileList(article, 'practiceFile');
    pageHeader.appendChild(article);
  }

  function createDescAndFileList(parentElem, type, subDesc = '') {
    const files = releasedItems(type);
    if (files.length === 0) return false;

    const p1 = document.createElement('p');
    p1.innerHTML = COMMON_DESCRIPTION[type] || '';
    parentElem.appendChild(p1);

    const { ul, hasRightClickFile } = createFileList(files, type);
    parentElem.appendChild(ul);

    if (hasRightClickFile) {
      const pGuide = document.createElement('p');
      pGuide.innerHTML = '※右クリックしてメニューを開き<b>リンク先を別名で保存...</b>を選択する';
      pGuide.className = 'small-text';
      parentElem.appendChild(pGuide);
    }

    if (text(subDesc)) {
      const p2 = document.createElement('p');
      p2.innerHTML = subDesc;
      parentElem.appendChild(p2);
    }
    return true;
  }

  function createFileList(files, type) {
    const ul = document.createElement('ul');
    ul.className = 'file-list';
    let hasRightClickFile = false;

    files.forEach(file => {
      const url = text(file.url);
      const label = text(file.text) || text(file.title) || text(file.fileName) || 'ファイルを開く';
      const isLocalFile = url.startsWith('./');
      if (isLocalFile) hasRightClickFile = true;

      const li = document.createElement('li');
      li.className = 'practiceFile_listitem';
      const links = document.createElement('span');
      links.className = 'file-links';

      if (type === 'dlFile') {
        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = label;
        li.appendChild(name);

        const download = document.createElement('a');
        download.href = url;
        download.className = 'file-link';
        download.textContent = `💾ダウンロード${isLocalFile ? '(右クリック)' : ''}`;
        if (isLocalFile) download.setAttribute('download', label);
        links.appendChild(download);

        const submitUrl = text(file.submitUrl);
        if (submitUrl) {
          links.append(' ');
          const submit = document.createElement('a');
          submit.href = submitUrl;
          submit.className = 'file-link';
          submit.target = '_blank';
          submit.rel = 'noopener';
          submit.textContent = '📤提出フォーム';
          links.appendChild(submit);
        }
      } else {
        const open = document.createElement('a');
        open.href = url;
        open.className = 'file-link';
        open.target = '_blank';
        open.rel = 'noopener';
        open.textContent = label;
        links.appendChild(open);
      }

      li.appendChild(links);
      ul.appendChild(li);
    });

    return { ul, hasRightClickFile };
  }
  /** ========= フッタ生成 ========= */
  function ensureFooter() {
    const groups = [
      { type: 'questionFile', title: '演習問題' },
      { type: 'quizForm', title: '確認テスト' }
    ].filter(group => releasedItems(group.type).length > 0);

    if (groups.length > 0) {
      let q = document.getElementById('questions');
      if (!q) {
        q = document.createElement('section');
        q.id = 'questions';
        document.body.appendChild(q);
      }

      if (!hasMeaningfulContent(q)) {
        const article = document.createElement('article');
        q.appendChild(article);

        const secTitle = document.createElement('h2');
        secTitle.id = 'questions_title';
        secTitle.textContent = groups.length === 2 ? '演習問題と確認テスト' : groups[0].title;
        article.appendChild(secTitle);

        groups.forEach(group => {
          const itemTitle = document.createElement('h3');
          itemTitle.id = group.type === 'questionFile' ? 'question_title' : 'quiz_title';
          itemTitle.textContent = group.title;
          article.appendChild(itemTitle);
          createDescAndFileList(article, group.type);
        });
      }
    }

    const nextItems = meta && Array.isArray(meta.next)
      ? meta.next.filter(item => item && item.release !== false && text(item.url) !== '')
      : [];
    if (nextItems.length > 0) {
      let nextPageElement = document.getElementById('next_page');
      if (!nextPageElement) {
        nextPageElement = document.createElement('section');
        nextPageElement.id = 'next_page';
        document.body.appendChild(nextPageElement);
      }


      if (!hasMeaningfulContent(nextPageElement)) {
        const article = document.createElement('article');
        nextPageElement.appendChild(article);

        const secTitle = document.createElement('h2');
        secTitle.id = 'headline_next';
        secTitle.textContent = '次回は、、、';
        article.appendChild(secTitle);

        nextItems.forEach(nextPage => {
          const itemTitle = document.createElement('h3');
          const link = document.createElement('a');
          link.href = text(nextPage.url);
          link.title = text(nextPage.title);
          link.textContent = text(nextPage.text) || text(nextPage.title) || '次のページ';
          itemTitle.appendChild(link);
          article.appendChild(itemTitle);

          const detail = text(nextPage.detail);
          if (detail) {
            const p = document.createElement('p');
            p.className = 'page_detail';
            p.textContent = detail;
            article.appendChild(p);
          }
        });
      }
    }

    let footer = document.getElementById('site-footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.id = 'site-footer';
      footer.setAttribute('role', 'contentinfo');
      document.body.appendChild(footer);
    }
    if (text(footer.textContent) === '') {
      const year = new Date().getFullYear();
      footer.textContent = `Copyright © ${year} Kaijo Junior and Senior High School. All Rights Reserved.`;
    }
  }

  /** ========= 初期化 ========= */
  function initLayout() {
    if (inited) return;
    inited = true;

    ensureHeader();
    ensureFooter();


    // ダーク/ライト切替でも背景色を追従
    try {
      const mq = matchMedia('(prefers-color-scheme: dark)');
    } catch {}
    
    // ★追加：背景用 figure を先に作ってから、中央寄せ/ライトボックス化
    try { wrapImages(); } catch (e) { console.error('[wrapImages] failed', e); }
    try { enhanceImages(); } catch (e) { console.error('[enhanceImages] failed', e); }
  }

  window.initLayout = initLayout;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout, { once: true });
  } else {
    initLayout();
  }




  /**
   * imgをfigure.img-wrapperで囲む ⇐ ダークモードで透過背景画像の文字（黒とか）が見にくいので背景をつけるため
   * 画像の中央寄せ・ライトボックス化をまとめて行う
   */
  // 画像の中央寄せ・ライトボックス化（改良版）
  function enhanceImages(opts = {}) {
    const {
      // 中央寄せの対象
      centerSelector     = 'img.image, img.screen_shot',
      // ライトボックスの対象
      lightboxSelector   = 'img.screen_shot',
      // 除外（機能ごとに分ける）
      excludeCenter      = '.no-wrap, [data-no-wrap]',  // ← ラップだけ除外
      excludeLightbox    = '',                          // ← 既定で除外なし
      // lightbox 設定
      lightboxGroup      = 'abc',
      lightboxClass      = 'expand-img',
      // 中央寄せ用ラッパ
      centerClass        = 'center',
      // 既存 a の href を上書きしない
      preserveExistingHref = true
    } = opts;

    document.querySelectorAll('img').forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;

      let doCenter   = img.matches(centerSelector);
      let doLightbox = img.matches(lightboxSelector);

      // 除外（それぞれ個別に）
      if (excludeCenter   && img.closest(excludeCenter))   doCenter   = false;
      if (excludeLightbox && img.closest(excludeLightbox)) doLightbox = false;

      if (!doCenter && !doLightbox) return;

      // ---- 1) ライトボックス化 ----
      let wrapTarget = img;           // このノードを最終的に中央寄せで包む
      if (doLightbox) {
        let link = img.closest('a');
        const candidateHref = img.dataset.large || img.currentSrc || img.src || '';

        if (!link) {
          // a が無ければ作って img を包む
          link = document.createElement('a');
          link.href = candidateHref;
          link.setAttribute('data-lightbox', lightboxGroup);
          link.classList.add(lightboxClass);
          img.parentNode.insertBefore(link, img);
          link.appendChild(img);
        } else {
          // 既存 a を活かしつつ最低限の属性を補う
          if (candidateHref && (!preserveExistingHref || !link.getAttribute('href'))) {
            link.href = candidateHref;
          }
          if (!link.getAttribute('data-lightbox')) {
            link.setAttribute('data-lightbox', lightboxGroup);
          }
          link.classList.add(lightboxClass);
        }
        wrapTarget = img.closest('a'); // 中央寄せは a ごと
      }

      // ---- 2) 中央寄せ ----
      // wrapImages() 併用時：figure.img-wrapper があればそれごと中央寄せ
      const outerMost =
        wrapTarget.closest('figure.img-wrapper') || wrapTarget;

      if (!outerMost.closest('.' + centerClass)) {
        const div = document.createElement('div');
        div.className = centerClass;
        outerMost.parentNode.insertBefore(div, outerMost);
        div.appendChild(outerMost);
      }
    });
    
  }
  window.enhanceImages = enhanceImages;

  // ★追加: 画像/リンクを <figure class="img-wrapper"> で包む（除外対応）
  // ★追加: 画像/リンクを <figure class="img-wrapper"> で包む（除外対応）
  function wrapImages(opts = {}) {
    const {
      // 除外：この条件に当たる画像は通常はラップしない
      exclude = '.no-wrap, [data-no-wrap], .slide_img, .screen_shot, img[height], .inline-icon',
      // 強制ラップ：この条件に当たる画像（またはその祖先に該当クラスがある場合）は必ずラップ
      // 例）画像自身に .wrap-always / data-wrap="force" を付ける、または親コンテナに付けて配下の全画像を強制ラップ
      force   = '.wrap-always, [data-wrap="force"]'
    } = opts;

    document.querySelectorAll('img').forEach(img => {
      // すでにラップ済みならスキップ
      if (img.closest('figure.img-wrapper')) return;

      // 強制ラップ判定（自分 or 祖先に force が付いていれば true）
      const mustWrap = force && img.closest(force);

      // 強制ラップでない場合のみ、除外を適用
      if (!mustWrap && exclude && img.closest(exclude)) return;

      // リンク付きなら a ごと包む。そうでなければ img を包む。
      const anchor = img.closest('a');
      const wrapTarget = anchor || img;

      const fig = document.createElement('figure');
      fig.className = 'img-wrapper';

      // img 側の指定を wrapper に反映
      if (img.classList.contains('no-radius') || img.hasAttribute('data-no-radius')) {
        fig.classList.add('no-radius');
      }

      wrapTarget.parentNode.insertBefore(fig, wrapTarget);
      fig.appendChild(wrapTarget);
    });
  }
  window.wrapImages = wrapImages;

})();
