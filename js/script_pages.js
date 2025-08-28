//HTML側で先にpages.jsを読み込んでおく

//実習ファイルや課題ファイルをDLする用のGASのURL
//const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxwW7I4ll_cZl1GV0fN7Dx3ECh9bsDHTz8w5wnhqias3spUCQ2A_rXs9DuQmxGIu8xu/exec';
//const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbz0DBGzdhTa04o4FdiSdP54pu7OyT8L_N-3VaUA5JIEAiC7GHvcbUUWdk1GFEh-YyeqNQ/exec';
//const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec'; 2024
const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec';

const gas_url_review = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzQNvuxX8lqoamXW1YokQwSTit0z1LzB0rnxd99s8bkLcK-ThLgnM5if7cDPdzKEFNzLg/exec';
const gas_url_quiz = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec';

const html_kadai_apply_status = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzFa43EUSkm649xmYDJcZaB98KlR_k4e1GORr-jnBS2knqep4dYi_-s8rC6ProPdzfS/exec';
const page_name = getFileName();//現在のページ名を取得（.htmlは含まない）


function loadScript(src, callback) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = callback;
  document.head.appendChild(script);
}


function main() {
  addEvent_tableToggleCell();
  setPre();
  const page = pages[page_name];
  const releasedPages = filterByrelease(pages);//releaseがTrueのもののみ抽出する

  document.title = page.title + ' | ' + page.mainTitle;//HTMLのタイトル

  setInnerHTML('html_index', getHtml_Index(releasedPages, page_name));//目次ページの内容を出力（各目次ページのみ）

  //†と‡にツールチップで説明を追加。
  addTooltips_to_daggers();

  //各テーブルとulを<div class="x-scroll">...</div>で囲む  対象DOMが既に存在する必要あり。
  setXScroll('table, ul.x-scroll, ul.file-link');
  document.dispatchEvent(new Event('pages:ready'));
}


function addTooltips_to_daggers() {
  // <h3> と <h4> タグを全て選択
  const headers = document.querySelectorAll('h3, h4');

  headers.forEach(header => {
    // headerの中のテキストノードに対して処理を実行
    if (header.textContent.includes('†')) {
      const originalText = header.innerHTML;
      // †を特定のspanタグで置き換える
      const modifiedText = originalText.replace(/(†)/g, '<span class="dagger"             tooltip-data="応用的な内容： 初学者はスキップしてよいが、授業ではあとから必要になる項目。">$1</span>');
      header.innerHTML = modifiedText;

    } else if (header.textContent.includes('‡')) {
      const originalText = header.innerHTML;
      // †を特定のspanタグで置き換える
      const modifiedText = originalText.replace(/(‡)/g, '<span class="double-dagger dagger" tooltip-data="発展的な内容： 授業では扱うことはないが、将来Pythonを学ぶときには修得しておきたい項目。">$1</span>');
      header.innerHTML = modifiedText;
    }
  });
}

function addEvent_tableToggleCell() {
  //class="table-toggle-cell"をつけたtable内の<td class="transparent clickable">〜</td>をクリックすると、文字色を透明から黒色にする。
  // セルがクリックされた時のイベントハンドラを設定
  document.querySelectorAll('.table-toggle-cell').forEach(table => {
    table.addEventListener('click', function (e) {
      // クリックされた要素が<td>の場合、'transparent' クラスをトグルします
      if (e.target.tagName === 'TD' && e.target.classList.contains('clickable')) {
        e.target.classList.toggle('transparent');
      }
    });
  });
}


function filterByrelease(pages) {
  const releasedPages = {};
  for (let key in pages) {
    if (pages[key].release === true) {
      releasedPages[key] = pages[key];
    }
  }
  return releasedPages;
}


function setInnerHTML(id, str) {
  //特定のidのタグにstrを内包する
  const elem = document.getElementById(id);
  if (elem && str.trim() !== '') {
    elem.innerHTML = str;
  }
}

function setPre() {
  //preタグでexample以外のものにコピー禁止をつける。
  const preBlocks = document.querySelectorAll('pre');

  preBlocks.forEach(pre => {
    const className = pre.className || '';
    if (!className.includes('example') && !className.includes('result') && !className.includes('copy-ok')) {
      // コピー系イベントをすべて禁止
      pre.addEventListener('copy', e => e.preventDefault());
      pre.addEventListener('cut', e => e.preventDefault());
      pre.addEventListener('contextmenu', e => e.preventDefault()); // 右クリック禁止
      pre.addEventListener('selectstart', e => e.preventDefault()); // 選択禁止
      pre.style.userSelect = 'none'; // 視覚的な選択も禁止
    }
  });
  
}


function setXScroll(selector) {
  //各タグを<div class="x-scroll">...</div>で囲む
  //対象をすべて取得
  const targets = document.querySelectorAll(selector);

  //各要素を<div class="x-scroll">...</div>で囲む
  targets.forEach((target) => {

    const div = document.createElement('div');
    div.className = 'x-scroll';
    target.parentElement.insertBefore(div, target);
    div.appendChild(target);
  })
}


function getHtml_Index(pages, page_name) {
  //目次ページの内容を出力（各目次ページのみ）
  const thisPage = pages[page_name];
  let cnt = 0;
  let previous_category_index = '';
  let html = ``;
  for (let key in pages) {
    const page = pages[key];
    if (page.mainTitle == thisPage.mainTitle && page.show != false) {
      if (page['category'] != previous_category_index) {
        if (cnt != 0) {
          html += `</article>`;
        }
        html += `<article>`;
        html += `<h2 id="${page.category}">${page.category}</h2>`;
        cnt += 1;
      }
      html += `<h3><a href="${page.fileName}" title="${page.detail}">${page.title}</a></h3>`;
      html += `<p>${page.detail}</p>`;
      previous_category_index = page.category;
    }
  }
  html += `</article>`;

  return html;
}


// ファイル末尾あたりに追加
window.initPageScripts = main;