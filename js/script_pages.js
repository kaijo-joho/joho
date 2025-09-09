// script_pages.js
// HTML側で pages.js を先に読み込む（または main.js の bootstrap で PATH.pages を await 済み前提）

/* ===================== 小ユーティリティ ===================== */
function loadScript(src, callback) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = callback;
  document.head.appendChild(script);
}

// 現在ページのIDを決定（?id= を優先。なければファイル名。index/拡張子揺れにも対応）
function getPageId() {
  const u = new URL(location.href);
  const byQuery = u.searchParams.get('id');
  if (byQuery) return byQuery;

  // main.js に getFileName() があればそれを使う（互換）
  if (typeof getFileName === 'function') return getFileName();

  let name = u.pathname.split('/').pop() || 'index';
  return name.replace(/\.html?$/,''); // .html/.htm を除去
}

/* ===================== メイン処理 ===================== */
function main() {
  // 事前ユーティリティ（落ちても他に影響しないように）
  try { addEvent_tableToggleCell(); } catch(e){ console.error('[script_pages] addEvent_tableToggleCell failed', e); }
  try { setPre(); } catch(e){ console.error('[script_pages] setPre failed', e); }

  const allPages = (typeof window !== 'undefined' ? window.pages : undefined) || {};
  const pageId   = getPageId();
  const page     = allPages[pageId];

  if (!page) {
    console.warn(`[script_pages] pages['${pageId}'] が未定義です。keys=`, Object.keys(allPages));
    return; // ← 未定義なら素直に中断（以降で .title を触らない）
  }

  // release=true のみ抽出
  const releasedPages = filterByrelease(allPages);

  // タイトル設定（存在する要素を優先採用）
  try {
    const left  = page.title || page.mainTitle || document.title;
    const right = page.mainTitle && page.mainTitle !== left ? ` | ${page.mainTitle}` : '';
    document.title = `${left}${right}`;
  } catch(e){
    console.error('[script_pages] set document.title failed', e);
  }

  // 目次HTML（対象セクションのみ）を出力
  try {
    setInnerHTML('html_index', getHtml_Index(releasedPages, pageId));
  } catch(e){
    console.error('[script_pages] render index failed', e);
  }

  // †/‡ のツールチップ
  try { addTooltips_to_daggers(); } catch(e){ console.error('[script_pages] addTooltips_to_daggers failed', e); }

  // 横スクロールラッパ（重複ラップを回避）
  try { setXScroll('table, ul.x-scroll, ul.file-link'); } catch(e){ console.error('[script_pages] setXScroll failed', e); }

  document.dispatchEvent(new Event('pages:ready'));
}

/* ===================== 機能群 ===================== */
function addTooltips_to_daggers() {
  const headers = document.querySelectorAll('h3, h4');
  headers.forEach(header => {
    if (header.textContent.includes('†')) {
      header.innerHTML = header.innerHTML.replace(/(†)/g,
        '<span class="dagger" tooltip-data="応用的な内容： 初学者はスキップしてよいが、授業ではあとから必要になる項目。">$1</span>');
    } else if (header.textContent.includes('‡')) {
      header.innerHTML = header.innerHTML.replace(/(‡)/g,
        '<span class="double-dagger dagger" tooltip-data="発展的な内容： 授業では扱うことはないが、将来Pythonを学ぶときには修得しておきたい項目。">$1</span>');
    }
  });
}

function addEvent_tableToggleCell() {
  // <table class="table-toggle-cell"> 内の <td class="clickable transparent"> をクリックで透明⇄表示
  document.querySelectorAll('.table-toggle-cell').forEach(table => {
    table.addEventListener('click', (e) => {
      if (e.target.tagName === 'TD' && e.target.classList.contains('clickable')) {
        e.target.classList.toggle('transparent');
      }
    });
  });
}

function filterByrelease(pages) {
  const releasedPages = {};
  for (const key in pages) {
    if (Object.prototype.hasOwnProperty.call(pages, key) && pages[key]?.release === true) {
      releasedPages[key] = pages[key];
    }
  }
  return releasedPages;
}

function setInnerHTML(id, str) {
  const elem = document.getElementById(id);
  if (!elem) return;
  if (typeof str !== 'string') return;
  const s = str.trim();
  if (s) elem.innerHTML = s;
}

function setPre() {
  // pre のうち example/result/copy-ok 以外はコピー禁止
  const preBlocks = document.querySelectorAll('pre');
  preBlocks.forEach(pre => {
    const className = pre.className || '';
    if (!className.includes('example') && !className.includes('result') && !className.includes('copy-ok')) {
      pre.addEventListener('copy', e => e.preventDefault());
      pre.addEventListener('cut', e => e.preventDefault());
      pre.addEventListener('contextmenu', e => e.preventDefault());
      pre.addEventListener('selectstart', e => e.preventDefault());
      pre.style.userSelect = 'none';
    }
  });
}

function setXScroll(selector) {
  // 各要素を <div class="x-scroll"> で1回だけラップ（重複防止）
  const targets = document.querySelectorAll(selector);
  targets.forEach(target => {
    if (!target || !target.parentElement) return;
    if (target.closest('div.x-scroll')) return; // 既にラップ済み
    const div = document.createElement('div');
    div.className = 'x-scroll';
    target.parentElement.insertBefore(div, target);
    div.appendChild(target);
  });
}

// 目次セクションを生成（thisPage 未定義でも落ちない）
function getHtml_Index(pagesDict, currentId) {
  const all = (typeof window !== 'undefined' ? window.pages : undefined) || {};
  const thisMainTitle = all[currentId]?.mainTitle || pagesDict[currentId]?.mainTitle;
  if (!thisMainTitle) return '';

  let html = '';
  let opened = false;
  let previousCategory = '';

  // 安定した並びが必要ならここでキーソートも可能
  for (const key of Object.keys(pagesDict)) {
    const page = pagesDict[key];
    if (!page) continue;
    if (page.mainTitle === thisMainTitle && page.show !== false) {
      if (page.category !== previousCategory) {
        if (opened) html += '</article>';
        html += '<article>';
        html += `<h2 id="${page.category}">${page.category}</h2>`;
        opened = true;
      }
      const fileName = page.fileName || `${page.id}.html`;
      const detail   = page.detail || '';
      const title    = page.title  || page.id;
      html += `<h3><a href="${fileName}" title="${detail}">${title}</a></h3>`;
      if (detail) html += `<p>${detail}</p>`;
      previousCategory = page.category;
    }
  }
  if (opened) html += '</article>';
  return html;
}

/* ===================== エクスポート ===================== */
window.initPageScripts = main;