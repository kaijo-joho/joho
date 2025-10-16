// ./js/script.js まるっと置き換え可（IIFE）
(() => {
  'use strict';

  const COMMON_DESCRIPTION = {
    dlFile:       '実習のはじめに、下記リンクを<b>右クリック（または ２本指クリック）</b>して<b>リンク先を別名で保存...</b>を選び、各自のパソコンにダウンロードし、<b>HTML実習</b>のフォルダに入れてください。',
    practiceFile: '実習のはじめに、下記リンク先から実習ファイルを各自の個別フォルダにダウンロードしてください。',
    questionFile: 'このページの内容についての問題演習に取り組んでください。',
    quizForm:     'このページの内容についての確認テストに取り組んでください。',
  };

  let inited = false;

  /** ========= メタ情報の取得 ========= 
   * 旧
  function getPageMeta() {
    const id = getFileName();
    const pages =
      (window.page && typeof window.page === 'object' ? window.page : null) ||
      (window.pages && typeof window.pages === 'object' ? window.pages : null) ||
      {};

    const p = pages[id];



    return p;
  }*/

  function getPageMeta() {
    const pages =
      (window.page  && typeof window.page  === 'object' ? window.page  : null) ||
      (window.pages && typeof window.pages === 'object' ? window.pages : null) ||
      {};

    const id = getFileName(); // ここで "index" 等が返る

    // "index" と "index.html" の両取り、拡張子ありなしの両取り
    const candidates = id === 'index'
      ? ['index', 'index.html']
      : [id, `${id}.html`];

    for (const k of candidates) {
      if (k in pages) return pages[k];
    }
    return null;
  }


  const meta = getPageMeta() || {};
  console.log(meta);

  /** ========= ヘッダ生成 ========= */
  function ensureHeader() {
    //const meta = getPageMeta() || {};
    const label = `${meta.mainTitle}` || '';

    let header = document.getElementById('site-header');
    if (!header) {
      header = document.createElement('header');
      header.id = 'site-header';
      header.setAttribute('role', 'banner');
      document.body.insertBefore(header, document.body.firstChild);
    }

    // headerbar要素の作成
    const headerbar = document.createElement('div');
    headerbar.className = 'headerbar';

    // headerbar__brand要素の作成
    const headerbarBrand = document.createElement('div');
    headerbarBrand.className = 'headerbar__brand';
    headerbarBrand.setAttribute('aria-label', '学校名');

    // headerbar__brand内のアンカータグを作成
    const brandLink = document.createElement('a');
    brandLink.href = './index.html';
    brandLink.textContent = '海城中学高等学校'; // 後ろにスペースを追加

    // brandLink内のspan要素を作成
    const subjectSpan = document.createElement('span');
    subjectSpan.className = 'subject';
    subjectSpan.textContent = '情報科';

    // 要素の組み立て
    brandLink.appendChild(subjectSpan);
    headerbarBrand.appendChild(brandLink);

    headerbar.appendChild(headerbarBrand);



    // headerbar__course要素の作成
    if(label !== ''){
      const headerbarCourse = document.createElement('a');
      headerbarCourse.id = 'headerbar__course';
      headerbarCourse.className = 'headerbar__course';
      headerbarCourse.textContent = label;
      headerbarCourse.setAttribute('aria-label', `${label}`);
      headerbarCourse.href = meta.backFile;
      headerbarCourse.classList.remove('is-disabled');
      headerbarCourse.removeAttribute('aria-disabled');
      headerbarCourse.setAttribute('aria-label', '講座名');

      headerbar.appendChild(headerbarCourse);
    }

    // 作成したheaderbarをbody要素などに追加
    header.appendChild(headerbar);


    if(meta.id !== 'link'){
      const ph = document.createElement('section');
      ph.id = 'page_header';
      const phArticle = document.createElement('article');
      phArticle.innerHTML = `
        <h1><a id="title">${meta.title}</a></h1>
        <p class="page_detail">${meta.detail}</p>
      `;

      createDescAndFileList(phArticle, 'dlFile');
      createDescAndFileList(phArticle, 'practiceFile');

      ph.appendChild(phArticle);

      header.after(ph);
    }

    

  }

  function createDescAndFileList(parentElem, type, subDesc = ''){
    if(meta[type] === false) return;
    const p1 = document.createElement('p');
    p1.innerHTML = COMMON_DESCRIPTION[type]; //`実習のはじめに、下記リンク先から実習ファイルを各自の個別フォルダにダウンロードしてください。`;
    parentElem.appendChild(p1);
    
    const ul = createFileList(type);
    if(ul !== null) parentElem.appendChild(ul);

    const p2 = document.createElement('p');
    p2.innerHTML = subDesc;  //提出状況へのリンクを貼る場合にはここにリンク先を記述
    parentElem.appendChild(p2);
  }

  function createFileList(type){
    const files = meta[type]
    if(!files) return null;
    const ul = document.createElement('ul');
    ul.className = 'file-list';
    files.forEach(file => {
      if(!file.release) return;
      const li = document.createElement('li');
      li.className = 'practiceFile_listitem';
      li.innerHTML = type === 'dlFile' ?
        `
          <span class="file-name">${file.text}</span>
          <span class="file-links">
          <a href="${file.url}" class="file-link" type="text/html" download="${file.text}">💾ダウンロード</a> 
          <a href="${file.submitUrl}" class="file-link" target="_blank">📤提出フォーム</a>
          </span>
        ` :
        `
          <span class="file-links">
          <a href="${file.url}" class="file-link" target="_blank">${file.text}</a>
          </span>
        `;
      ul.appendChild(li);
    });
    return ul;
  }


  /** ========= フッタ生成 ========= */
  function ensureFooter() {
    
    // === 演習問題と確認テスト ===
    if( (meta.questionFile !== false || meta.quizForm !== false)){
      let q = document.getElementById('questions');
      if(!q){
        q = document.createElement('section');
        q.id = 'questions';
        document.body.appendChild(q);
      }
      let article = document.createElement('article');
      q.appendChild(article);

      const secTitle = document.createElement('h2');
      secTitle.id = 'questions_title';
      secTitle.innerText = (meta.questionFile !== false && meta.quizForm !== false) ? `演習問題と確認テスト` :
                            meta.questionFile !== false ? `演習問題` : 
                            meta.quizForm !== false ?     `確認テスト` : 
                            '';
      article.appendChild(secTitle);

      // === 演習問題 ===
      if(meta.questionFile !== false){
        const questionTitle = document.createElement('h3');
        questionTitle.id = 'question_title';
        questionTitle.innerText = `演習問題`;
        article.appendChild(questionTitle);
        createDescAndFileList(article, 'questionFile');
      }

      // === 確認テスト ===
      if(meta.quizForm !== false){
        const quizTitle = document.createElement('h3');
        quizTitle.id = 'quiz_title';
        quizTitle.innerText = `確認テスト`;
        article.appendChild(quizTitle);
        createDescAndFileList(article, 'quizForm');
      }
    }


    // === 次回は、、、 ===
    if(meta.next){
      let nextPageElement = document.getElementById('next_page');
      if (!nextPageElement) {
        nextPageElement = document.createElement('section');
        nextPageElement.id = 'next_page';
        document.body.appendChild(nextPageElement);
      }

      const article = document.createElement('article');
      nextPageElement.appendChild(article);

      const secTitle = document.createElement('h2');
      secTitle.id = 'headline_next';
      secTitle.innerText = '次回は、、、';
      article.appendChild(secTitle);


      meta.next.forEach(nextPage => {
        
        const itemTitle = document.createElement('h3');
        article.appendChild(itemTitle);

        const a = document.createElement('a');
        a.href =  nextPage.url;
        a.title = nextPage.title;
        a.textContent = nextPage.text;
        itemTitle.appendChild(a);

        const p = document.createElement('p');
        p.className = 'page_detail';
        p.innerText = nextPage.detail;
        article.appendChild(p);
      });
      
      document.body.appendChild(nextPageElement);
    }
    


    // === フッター ===
    const footer = document.createElement('footer');
    footer.id = 'site-footer';
    footer.setAttribute('role', 'contentinfo');
    document.body.appendChild(footer);
    const year = new Date().getFullYear();
    footer.textContent = `Copyright © ${year} Kaijo Junior and Senior High School. All Rights Reserved.`;
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
          if (!preserveExistingHref && !link.getAttribute('href')) {
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

      wrapTarget.parentNode.insertBefore(fig, wrapTarget);
      fig.appendChild(wrapTarget);
    });
  }
  window.wrapImages = wrapImages;

})();