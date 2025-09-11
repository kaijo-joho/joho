// ./js/nav.js
(() => {
  'use strict';


  /** 現在ページID（拡張子なし） */
  function getFileName() {
    const path = window.location.pathname;
    const last = path.substring(path.lastIndexOf('/') + 1);   // 例: "py21.html" or ""
    const base = last || 'index';                             // 末尾スラッシュ対策
    return decodeURIComponent(base).replace(/\.html?$/i, ''); // ".html"/".htm" を末尾だけ除去
  }

  /** ドロワーの外枠（aside#nav-drawer, div.panel, button#nav-handle）を用意 */
  function ensureDrawerShell() {
    let drawer = document.getElementById('nav-drawer');
    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.id = 'nav-drawer';
      drawer.setAttribute('role', 'complementary');
      drawer.setAttribute('aria-label', 'サイドナビゲーション');

      // パネル（中身をスクロール）
      const panel = document.createElement('div');
      panel.className = 'nav-drawer__panel';
      drawer.appendChild(panel);

      // 1本線ハンドル（見た目はCSSの ::before で線を描画）
      const handle = document.createElement('button');
      handle.id = 'nav-handle';
      handle.type = 'button';
      handle.setAttribute('aria-label', 'ナビを開閉');
      handle.setAttribute('aria-expanded', 'false');
      drawer.appendChild(handle);

      document.body.appendChild(drawer);
    }

    // 必要要素を取得（なければ補完）
    let panel = drawer.querySelector('.nav-drawer__panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'nav-drawer__panel';
      drawer.appendChild(panel);
    }
    let handle = drawer.querySelector('#nav-handle');
    if (!handle) {
      handle = document.createElement('button');
      handle.id = 'nav-handle';
      handle.type = 'button';
      handle.setAttribute('aria-label', 'ナビを開閉');
      handle.setAttribute('aria-expanded', 'false');
      drawer.appendChild(handle);
    }
    return { drawer, panel, handle };
  }

  /** ナビ本体を構築（JSON定義順を維持／categoryごとに <details><summary>） */
  function buildNav() {
    if (!window.pages) {
      console.warn('[nav.js] window.pages が見つかりません');
      return;
    }

    const { drawer, panel } = ensureDrawerShell();

    const id = getFileName();
    const current = window.pages[id] || null;
    const targetMain = current ? current.mainTitle : null;

    // 置き場の nav#auto-nav を用意（既存があれば中身だけ差し替え）
    let nav = panel.querySelector('#auto-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'auto-nav';
      panel.appendChild(nav);
    } else {
      nav.innerHTML = '';
    }

    // …buildNav() の中で panel と nav を用意した直後あたりに追加…
    // 置き場所: panel.prepend(nav) ではなく「ロゴ → nav」の順にしたいので、nav を append する前にロゴを用意
    let logo = panel.querySelector('.nav-drawer__logo');
    if (!logo) {
      logo = document.createElement('div');
      logo.className = 'nav-drawer__logo';
      logo.innerHTML = `
        <a class="nav-drawer__logoLink" href="index.html" aria-label="海城中学高等学校 情報科">
          <img src="./img/logo.png" class="nav-drawer__logoImg" width="120" height="124"
              alt="海城中学高等学校 情報科 ロゴ">
        </a>`;
      panel.prepend(logo);   // ★ パネルの一番上にロゴを入れる
    }

    // その後に nav を append（既存のまま）
    panel.appendChild(nav);

    // カテゴリーごとの配列を、JSONの出現順で構築
    const categories = Object.create(null);
    const catIds = [];
    const keys = Object.keys(window.pages); // ← 定義順＝JSONの並び順を保持

    for (const key of keys) {
      const details = window.pages[key];
      if (!details) continue;
      if (!details.release) continue;

      // mainTitle が空白なら表示しない
      if (targetMain === '') continue;

      // 同じ mainTitle のみ表示（現在ページが特定できないときは全件）
      if (targetMain && details.mainTitle !== targetMain) continue;
      

      // ページ側で非表示指定されているものは除外（show:false）
      if (details.show === false) continue;

      const category = details.category || '未分類';
      if (!categories[category]) {
        categories[category] = [];
        catIds.push(category); // 初出の順に記録
      }
      categories[category].push({ id: key, ...details });
    }

    // カテゴリごとに <details> を構築（リンクは縦並び <ul><li><a>）
    for (const catId of catIds) {
      const det = document.createElement('details');

      // 現在ページが含まれるカテゴリは初期状態で開く
      if (categories[catId].some(p => p.id === id)) det.open = true;

      const sum = document.createElement('summary');
      sum.textContent = catId;
      det.appendChild(sum);

      const list = document.createElement('ul');
      list.className = 'nav-list';

      categories[catId].forEach(page => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'nav-link';

        // href は fileName 優先（無ければ id.html）
        a.href = page.href || page.fileName || `${page.id}.html`;
        a.textContent = page.title || page.fileName || page.id;

        if (page.id === id) a.setAttribute('aria-current', 'page');

        li.appendChild(a);
        list.appendChild(li);
      });

      det.appendChild(list);
      nav.appendChild(det);
    }

    // ドロワーのホバー開閉（1回だけ張る）
    if (!drawer.dataset.initedDrawer) {
      setupDrawerBehavior(drawer, { openDelay: 360, closeDelay: 1200 }); // 好みで調整
      drawer.dataset.initedDrawer = '1';
    }

    // details/summary のホバー開閉（閉じるのは遅らせる＆高さアニメ）
    setupDetailsBehavior(nav, {
      openDelay: 280,
      closeDelay: 5000,
      animMsOpen: 420,  // ★開く時だけ少し長め
      animMsClose: 240, // ★閉じる時は短め
      easeOpen:  'cubic-bezier(.33, 1, .68, 1)', // ぬるっと
      easeClose: 'cubic-bezier(.2, .7, .2, 1)'   // きびきび
    });
  }

/** ドロワー（左からスライド）の開閉挙動 */
function setupDrawerBehavior(drawer, { openDelay = 360, closeDelay = 1200 } = {}) {
  const handle = drawer.querySelector('#nav-handle');
  const panel  = drawer.querySelector('.nav-drawer__panel');

  const devNoAutoClose =
    ['localhost', '127.0.0.1'].includes(location.hostname) ||
    /\bdev=1\b/.test(location.search) ||
    localStorage.getItem('nav.devNoAutoClose') === '1';

  const cannotAutoClose = () => devNoAutoClose || drawer.classList.contains('is-pinned');

  let openTimer = null, closeTimer = null;
  const cancelAll = () => { clearTimeout(openTimer); clearTimeout(closeTimer); };

  // ★ 追加: ホバー/フォーカス/直近操作の検知
  const isHovering = () => drawer.matches(':hover');
  const hasFocusWithin = () => drawer.contains(document.activeElement);
  let lastInteractAt = 0;
  const bumpInteract = () => { lastInteractAt = Date.now(); };

  // ★ 追加: ユーザ操作中は閉じ予約を止める
  panel.addEventListener('wheel',  () => { clearTimeout(closeTimer); bumpInteract(); }, { passive: true });
  panel.addEventListener('scroll', () => { clearTimeout(closeTimer); bumpInteract(); }, { passive: true });
  drawer.addEventListener('focusin', () => { clearTimeout(closeTimer); bumpInteract(); });

  const recentlyInteracted = () => (Date.now() - lastInteractAt) < 800; // 適宜調整

  const open  = () => {
    clearTimeout(closeTimer);          // 開いた瞬間、閉じ予約は必ず解除
    drawer.classList.add('is-open');
    handle.setAttribute('aria-expanded', 'true');
  };

  // ★ 変更: 実行直前ガードを追加
  const close = (force = false) => {
    if (!force) {
      if (cannotAutoClose()) return;
      if (isHovering()) return;        // まだホバー中なら閉じない
      if (hasFocusWithin()) return;    // キーボード操作中など
      if (recentlyInteracted()) return;// 直近のスクロール/ホイール中
    }
    clearTimeout(openTimer);
    drawer.classList.remove('is-open');
    handle.setAttribute('aria-expanded', 'false');
  };

  // ハンドルにホバー → 少し待って開く
  handle.addEventListener('mouseenter', () => {
    clearTimeout(closeTimer);
    openTimer = setTimeout(open, openDelay);
  });

  // ★ 変更: relatedTarget に加えて :hover も見る（誤予約抑止）
  handle.addEventListener('mouseleave', (e) => {
    if (cannotAutoClose()) return;
    const to = e.relatedTarget;
    if (isHovering() || (to && drawer.contains(to))) return; // 内側への移動/ホバー中は予約しない
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => close(), closeDelay);
  });

  // 本体に入っている間は閉じカウントを止める
  drawer.addEventListener('mouseenter', () => {
    clearTimeout(closeTimer);
  });

  // 本体から出たら「しばらくして」閉じる
  drawer.addEventListener('mouseleave', () => {
    if (cannotAutoClose()) return;
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => close(), closeDelay);
  });

  // クリック/タップで即トグル（手動は常に有効）
  handle.addEventListener('click', (e) => {
    e.preventDefault();
    const willOpen = !drawer.classList.contains('is-open');
    cancelAll();
    if (willOpen) open(); else close(true);  // 手動は force=true で閉じる
  });

  if (devNoAutoClose) open();
}

  /** details/summary のホバー開閉（自動クローズ遅延＋高さアニメ） */
  function setupDetailsBehavior(
    nav,
    {
      openDelay = 280,
      closeDelay = 5000,
      animMsOpen = 420,
      animMsClose = 240,
      easeOpen = 'cubic-bezier(.33, 1, .68, 1)',
      easeClose = 'cubic-bezier(.2, .7, .2, 1)'
    } = {}
  ) {
    const prefersReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) { animMsOpen = 0; animMsClose = 0; }

    nav.querySelectorAll('details').forEach((det) => {
      const sum  = det.querySelector('summary');
      const list = det.querySelector('.nav-list');
      if (!list) return;

      let openTimer = null, closeTimer = null;

      if (!det.open) {
        list.style.overflow = 'hidden';
        list.style.height   = '0px';
      }

      const animate = (expand) => new Promise((resolve) => {
        const start = expand ? 0 : (list.offsetHeight || list.scrollHeight);
        const end   = expand ? list.scrollHeight : 0;
        const dur   = expand ? animMsOpen : animMsClose;
        const ease  = expand ? easeOpen   : easeClose;

        list.style.overflow = 'hidden';
        list.style.height   = start + 'px';
        if (dur > 0) list.style.transition = `height ${dur}ms ${ease}`;
        void list.offsetHeight;                // reflow
        requestAnimationFrame(() => { list.style.height = end + 'px'; });

        const done = () => {
          list.removeEventListener('transitionend', done);
          list.style.transition = '';
          if (expand) {
            list.style.height = '';
            list.style.overflow = '';
          } else {
            list.style.height = '0px';
          }
          resolve();
        };
        if (dur === 0) { done(); }
        else { list.addEventListener('transitionend', done, { once: true }); }
      });

      const open  = async () => { if (det.open) return; det.open = true; await animate(true);  };
      const close = async () => { if (!det.open) return; await animate(false); det.open = false; };

      const scheduleOpen  = () => { clearTimeout(closeTimer); if (!det.open) openTimer  = setTimeout(open,  openDelay);  };
      const scheduleClose = () => { clearTimeout(openTimer);  closeTimer = setTimeout(close, closeDelay); };

      det.addEventListener('mouseenter', scheduleOpen);
      det.addEventListener('mouseleave', scheduleClose);

      if (sum) {
        sum.addEventListener('click', (e) => {
          e.preventDefault();
          clearTimeout(openTimer); clearTimeout(closeTimer);
          if (det.open) { close(); } else { open(); }
        });
      }
    });
  }

  // main.js から呼ぶ公開関数（自動実行しない）
  window.initNav = buildNav;

}
)();