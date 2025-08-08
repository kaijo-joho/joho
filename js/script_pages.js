//HTML側で先にpages.jsを読み込んでおく

//実習ファイルや課題ファイルをDLする用のGASのURL
//const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxwW7I4ll_cZl1GV0fN7Dx3ECh9bsDHTz8w5wnhqias3spUCQ2A_rXs9DuQmxGIu8xu/exec';
//const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbz0DBGzdhTa04o4FdiSdP54pu7OyT8L_N-3VaUA5JIEAiC7GHvcbUUWdk1GFEh-YyeqNQ/exec';
//const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec'; 2024
const gas_url = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec';

const peer_gas_url = "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzQNvuxX8lqoamXW1YokQwSTit0z1LzB0rnxd99s8bkLcK-ThLgnM5if7cDPdzKEFNzLg/exec";

const html_kadai_apply_status = "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzFa43EUSkm649xmYDJcZaB98KlR_k4e1GORr-jnBS2knqep4dYi_-s8rC6ProPdzfS/exec";
const page_name = getFileName();//現在のページ名を取得（.htmlは含まない）


function loadScript(src, callback) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = callback;
  document.head.appendChild(script);
}

// highlight.js を先に読み込んでから main 実行
loadScript('./js/highlight.js', () => {
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    // すでにDOMContentLoadedが終わっている場合は即実行
    main();
  }
});

function main() {
  highlightCodeBlocksWithIds(); //コードのハイライトと整形
  setImages_image();  //imgタグでclassが'image'のもの
  setImages_screen_shot();//imgタグでclassが'screen_shot'のもの

  addEvent_tableToggleCell();
  setPre();
  const page = pages[page_name];
  const releasedPages = filterByrelease(pages);//releaseがTrueのもののみ抽出する
  const questionFiles = pages[page_name]['questionFile'];

  document.title = page.title + ' | ' + page.mainTitle;//HTMLのタイトル



  //headerタグの中にsidebarを入れる
  document.querySelector("header").innerHTML = getHtml_Sidebar(releasedPages, page_name);

  setInnerHTML('headerbar', getHtml_headerbar(page));//ヘッダーバー（ロゴとメインタイトル）を出力


  setInnerHTML('page_header', getHtml_page_header(page));//ページタイトルを出力

  const nextPage = pages[page.next];
  setInnerHTML('next_page', getHtml_next_page_name(nextPage));//次のページを出力

  setInnerHTML('examples', getHtml_Example(page));//例題を出力
  setInnerHTML('questions', getHtml_Question_and_Quiz(page));//演習問題と確認テストを出力
  setInnerHTML('assignment', getHtml_Question(questionFiles));//課題を出力（article全体ではなくリンクのみ）

  setInnerHTML('html_index', getHtml_Index(releasedPages, page_name));//目次ページの内容を出力（各目次ページのみ）
  //setInnerHTML('section_filelist', getHtml_SectionFileList(releasedPages, page_name));//配付ファイル一覧ページの内容を出力


  /* サイドバーが開いているときにサイドバー以外のところをクリックすると、サイドバーが隠れるようにしたかったが、
      detailsを開く動作でも動作してしまうので、実装見送り。
      後日時間があれば再挑戦。
  var sidebarRight = document.getElementById('sidebar_right');
  var checkbox = document.getElementById('check');

  sidebarRight.addEventListener('click', function() {
      checkbox.checked = !checkbox.checked;
  });
  */

  //†と‡にツールチップで説明を追加。
  addTooltips_to_daggers();

  //各テーブルとulを<div class="x-scroll">...</div>で囲む  対象DOMが既に存在する必要あり。
  setXScroll('table, ul.x-scroll, ul.file-link');
  
}


function getFileName() {
  //HTMLファイル名を取得
  var path = window.location.pathname;
  var fileName = path.substring(path.lastIndexOf('/') + 1).replace('.html', '');
  return fileName;
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
  } else {
    //console.warn(`setInnerHTML: '${id}' が見つからないか、空文字です`);
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



function setImages_image() {
  //img class="image"の画像にcenterクラスをつける
  let images = document.querySelectorAll('img.image'); //imgタグでclassが'image'のもの

  for (let i = 0; i < images.length; i++) {
    let image = images[i];

    let divTag = document.createElement('div');
    divTag.className = 'center';

    image.parentNode.insertBefore(divTag, image);
    divTag.appendChild(image);
  }
}



function setImages_screen_shot() {
  //img class="screen_shot"の画像をクリックすると拡大表示されるようにする
  let images = document.querySelectorAll('img.screen_shot');//imgタグでclassが'screen_shot'のもの

  for (let i = 0; i < images.length; i++) {
    let image = images[i];

    let divTag = document.createElement('div');
    divTag.className = 'center';

    let aTag = document.createElement('a');
    aTag.href = image.src;
    aTag.setAttribute('data-lightbox', 'abc');
    aTag.className = 'expand-img';
    //aTag.setAttribute('border', '0');

    image.parentNode.insertBefore(divTag, image);
    divTag.appendChild(aTag);
    aTag.appendChild(image);
  }
}

function getHtml_headerbar(page) {
  //ヘッダーバー（ロゴとメインタイトル）を出力
  let html = ``;
  html += `<div id="logo">`;
  html += `  <a href="index.html" title="海城中学高等学校 情報科">`;
  html += `    <img src="./img/logo.png" id="img_logo">`;
  html += `  </a>`;
  html += `</div>`;
  html += `<div id="main_title">`;
  html += `  <a href="${page.back}.html" title="${page.mainTitle}">${page.mainTitle}</a>`;
  html += `</div>`;
  return html;
}
function getHtml_page_header(page) {
  // ページタイトルを出力
  let html = ``;
  html += `<article>`;
  html += `  <h1><a id="title">${page.title}</a></h1>`;
  html += `  <p>${page.detail}</p>`;

  html += getHtml_practiceFile(page.practiceFile);
  html += getHtml_dlFile(page.dlFile);



  html += `</article>`;
  return html;
}

function getHtml_practiceFile(files){
  if(!files) return ''; // practiceFileがなければ空白を返す
  
  const releaseFiles = files.filter(file => file.release === true); // 公開されているファイルを抽出
  if(!releaseFiles) return ''; // 公開されているファイルがなければ空白を返す

  let html = ``;

  html += `<p>実習のはじめに、下記リンク先から実習ファイルを各自の個別フォルダにダウンロードしてください。</p>`;
  html += `<ul class="file-link">`;

  for (let file of releaseFiles) {
    html += `<li class="practiceFile_listitem">`;
    html += `  <a href="${gas_url}?type=file&target=${file.id}" target="_blank">${file.fileName}</a>`;

    if (file.answerFileId && file.answerFile.release) { // 解答ファイルが存在して公開されている場合
      html += `（<a href="${gas_url}?type=file&target=${file.id}" target="_blank">解答</a>）`;
    }
    html += getHtml_submitForm(file.submitForm, file.id); //提出フォームが指定されていれば、提出フォームを表示する
    html += `</li>`;
  }

  html += `</ul>`;
  return html;
}


function getHtml_submitForm(form, response = undefined){
  if (!form || !form.id) return '';
  if (!form.release) return `【提出フォーム（※準備中）】`;

  if (form.url){
    return `【<a href="${form.url}" target="_blank">提出フォーム</a>】`;
  } else if (response) {
    return `【<a href="${gas_url}?type=form&target=${form.id}&res=${response}" target="_blank">提出フォーム</a>】`;
  } else {
    return `【<a href="${gas_url}?type=form&target=${form.id}" target="_blank">提出フォーム</a>】`;
  }
}

function getHtml_dlFile(files){
  if(!files) return ''; // dlFileがなければ空白を返す
  let html = ``;
  html += `<p>実習のはじめに、下記リンクを<b>右クリック（または ２本指クリック）</b>して<b>リンク先を別名で保存...</b>を選び、各自のパソコンにダウンロードし、<b>HTML実習</b>のフォルダに入れてください。<br></p>`;
  html += `<ul class="file-link">`;

  for (let file of files) {
    html += `<li class="practiceFile_listitem">`;
    html += `  <a href="${file.path}" type="text/html" download>${file.fileName}</a>`;
    html += getHtml_submitForm(file.submitForm, file.fileName); //提出フォームが指定されていれば、提出フォームを表示する
    html += `</li>`;
  }
  html += `</ul>`;
  html += `<p>現在のあなたの提出状況は <a href="${html_kadai_apply_status}" target="_blank">HTML実習 課題提出状況</a> から確認できます。</p>`;
  return html;
}




function getHtml_next_page_name(page) {
  //次のページを出力  ここでのpageは次のページ情報
  if (!page) { return ''; }

  let html = ``;
  html += `<article>`;
  html += `  <h2 id="headline_next">次回は、、、</h2>`;
  html += `  <h3><a href="${page.fileName}" title="${page.title}">${page.title}</a></h3>`;
  html += `  <p>${page.detail}</p>`;
  html += `</article>`;
  html += ``;

  return html;
}

function getHtml_Sidebar(pages, page_name) {
  let sidebar_left = getHtml_Sidebar_left();
  let sidebar_right = getHtml_Sidebar_right(pages, page_name);
  let html = ``;
  html += `<input type="checkbox" id="check">`;
  html += `<div id="sidebar" for="check">`;
  html += `  <div id="sidebar_left">${sidebar_left}</div>`;
  html += `  <div id="sidebar_right">${sidebar_right}</div>`;
  html += `</div>`;
  html += `<div id="headerbar"><!-- script_pages.js --></div>`;
  html += `<section id="page_header"><!-- script_pages.js --></section>`;
  return html;
}


function getHtml_Sidebar_left() {
  let html = ``;
  html += `<label for="check">`;
  html += `  <div id="closeBtn">`;
  html += `    <img src="./img/icon-menu.svg" id="closeBtn_icon" alt="Menu Icon">`;
  html += `  </div>`;
  html += `</label>`;

  return html;
}

function getHtml_Sidebar_right(pages, page_name) {
  //ナビゲーションを出力
  let cnt = 0;
  let previous_category_nav = '';
  let category = pages[page_name]['category'];
  

  let html = `<nav>`;
  for (let key in pages) {
    if (pages[key]['mainTitle'] == pages[page_name]['mainTitle'] && pages[key]['show'] != false) {
      if (pages[key]['category'] != previous_category_nav) {
        if (cnt != 0) {
          html += `</ul></details>`;
        }
        if (pages[key]['category'] == category) {
          html += `<details open>`;
        } else {
          html += `<details>`
        }
        html += `    <summary><ul><li><a>${pages[key]['category']}</a></li></ul></summary>`;
        html += `    <ul>`;
        cnt += 1;
      }
      html += `        <li><a href="${pages[key]['fileName']}" title="${pages[key]['detail']}">${pages[key]['title']}</a></li>`;
      previous_category_nav = pages[key]['category'];
    }
  }
  html += `</ul></details></nav>`;

  return html;
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

function getHtml_SectionFileList(pages, page_name) {
  const currentPage = pages[page_name];
  let cnt = 0;
  let previousCategory = '';
  let html = ``;

  for (let key in pages) {
    const page = pages[key];

    if (page.mainTitle === currentPage.mainTitle && page.show !== false) {
      if (page.category !== previousCategory) {
        if (cnt !== 0) {
          html += `</article>`;
        }
        html += `<article>`;
        html += `<h2 id="${page.category}">${page.category}</h2>`;
        cnt += 1;
      }

      html += `<h3><a href="${page.fileName}" title="${page.detail}">${page.title}</a></h3>`;
      html += `<p>${page.detail}</p>`;
      html += `<ul>`;

      // 実習ファイル
      if (page.id && page.id_title) {
        html += `<li>実習ファイル</li><ul>`;
        html += `<li><a href="${gas_url}?type=file&target=${page.id}" title="${page.title}" target="_blank">${page.title}</a></li>`;
        html += `</ul>`;
      }

      // 例題
      if (Array.isArray(page.exampleFile) && page.exampleFile.length > 0) {
        html += `<li>例題</li><ul>`;
        page.exampleFile.forEach(file => {
          if (file.release) {
            html += `<li><a href="${gas_url}?type=file&target=${file.id}" target="_blank">${file.fileName}</a></li>`;
          }
        });
        html += `</ul>`;
      }

      // 演習問題
      if (Array.isArray(page.questionFile) && page.questionFile.length > 0) {
        html += `<li>演習問題</li><ul>`;
        html += getHtml_Question_li(page.questionFile);
        html += `</ul>`;
      }

      // 確認テスト
      if (Array.isArray(page.quizForm) && page.quizForm.length > 0) {
        html += `<li>確認テスト</li><ul>`;
        html += getHtml_Quiz_li(page.quizForm);
        html += `</ul>`;
      }

      html += `</ul>`;
      previousCategory = page.category;
    }
  }

  if (cnt > 0) {
    html += `</article>`;
  }

  return html;
}


function getHtml_Example(page) {
  const files = page.exampleFile;
  if (!files || files.length === 0) return '';
  const releaseFiles = files.filter(file => file.release === true);
  if (releaseFiles.length === 0) return '';

  let html = '<h3>例題のダウンロード</h3><ul class="file-link">';
  for (let file of files) {
    if (file.release) {
      html += `<li>`;
      html += `<a href="${gas_url}?type=file&target=${file.id}" target="_blank" title="${file.title}">${file.title}</a>`;
      html += `</li>`;
    }
  }

  html += `</ul>`;
  return html;
}

function getHtml_Question_and_Quiz(page) {
  // 演習問題と確認テストを出力
  const questionFiles = page['questionFile'];
  const quizFiles = page['quizForm'];

  const existQuestion = Array.isArray(questionFiles) && questionFiles.length > 0;
  const existQuiz = Array.isArray(quizFiles) && quizFiles.length > 0;

  if (!existQuestion && !existQuiz) {
    return '';
  }

  let title = '';
  if (existQuestion && existQuiz) {
    title = '演習問題と確認テスト';
  } else if (existQuestion) {
    title = '演習問題';
  } else {
    title = '確認テスト';
  }

  let html = '';
  html += '<article>';
  html += `<h2 id="questions">${title}</h2>`;

  if (existQuestion) {
    html += getHtml_Question(questionFiles, '演習問題');
  }

  if (existQuiz) {
    html += getHtml_Quiz(quizFiles, '確認テスト');
  }

  html += `</article>`;
  return html;
}

function getHtml_Question(files, title = undefined) {
  if (!Array.isArray(files) || files.length < 1) return '';

  let html = ``;

  if (title !== undefined && title !== '') {
    html += `<h3>${title}</h3>`;
  }

  html += `<ul class="file-link">`;
  html += getHtml_Question_li(files);
  html += `</ul>`;

  return html;
}

function getHtml_Question_li(files) {
  var html = ``;
  for (let file of files) {

    html += `<li>`;

    const title = file['title'] || file['fileName'] || '無題';

    if (file.release) {
      html += `<a href="${gas_url}?type=file&target=${file['id']}" target="_blank">${title}</a>`;
    } else {
      html += `${title} <準備中>`;
    }
    
    if (file.answerFileId !== false && file.answerFileId !== true) {  // 解答ファイルがある場合
      const answerFile = file.answerFile;
      console.log(answerFile.release);
      if (answerFile.release) {
        if (file.id == file.answerFile.id){ // 問題ファイルidと解答ファイルidが同じ場合は、解答ファイルから問題ファイルを生成した場合なので、元ファイルを開く。
          html += `（<a href="${gas_url}?type=file&target=${answerFile.id}&ans=true" target="_blank">解答</a>）`
        } else {
          html += `（<a href="${gas_url}?type=file&target=${answerFile.id}" target="_blank">解答</a>）`;
        }
        
      } else {
        html += `（解答: 準備中）`;
      }
    }
    html += getHtml_submitForm(file.submitForm, file.id); //提出フォームが指定されていれば、提出フォームを表示する

    html += `</li>`;
  }
  return html;
}


function getHtml_Quiz(files, title = undefined) {
  if (!Array.isArray(files) || files.length < 1) return '';

  let html = ``;

  if (title !== undefined && title !== '') {
    html += `<h3>${title}</h3>`;
  }

  html += `<ul class="file-link">`;
  html += getHtml_Quiz_li(files);
  html += `</ul>`;

  return html;
}

function getHtml_Quiz_li(files) {
  //console.log(files);
  var html = ``;
  for (let file of files) {
    if (file.release) {
      html += `<li><a href="${gas_url}?type=form&target=${file.id}" target="_blank" title="${file.title}">${file.title}</a>`;
    } else {
      html += `${file.title} <準備中>`
    }
  }
  return html;
}


