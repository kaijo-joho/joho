document.addEventListener('DOMContentLoaded', () => {
  const htmlFileName = location.pathname.split('/').pop().replace('.html', '');
  const scriptPath = `js/${htmlFileName}.js`;

  const dataScript = document.createElement('script');
  dataScript.src = scriptPath;
  dataScript.onload = () => renderSlides();
  dataScript.onerror = () => {
    const el = document.getElementById('content');
    if (el) el.textContent = 'スライドデータが見つかりません';
    else console.error('content 要素が見つかりませんでした');
  };

  const head = document.head || document.getElementsByTagName('head')[0];
  if (head) {
    head.appendChild(dataScript);
  } else {
    console.error('head 要素が見つかりませんでした');
  }

  function renderSlides() {
    const content = document.getElementById('content');
    if (!content) {
      console.error('content 要素が見つかりません');
      return;
    }

    if (!window.slidesData || !Array.isArray(window.slidesData)) {
      content.textContent = 'スライドデータが読み込まれていません。';
      return;
    }

    const container = document.createElement('div');
    container.classList.add('slides-container');

    let currentSection = null;
    let currentArticle = null;
    let headlineCount = 0; // h2 の順番カウント

    window.slidesData.forEach(entry => {

      if (entry.slideTitle) {
        /*
        const h1 = document.createElement('h1');
        h1.textContent = entry.slideTitle;
        container.appendChild(h1);
        */
        return;
        
      }


      if (entry.section) {
        // 新しいセクションを開始
        headlineCount++; // カウントをインクリメント

        currentSection = document.createElement('section');
        currentArticle = document.createElement('article');

        const h2 = document.createElement('h2');
        h2.textContent = entry.section;
        h2.id = `headline_${headlineCount}`; // ← ID追加！
        currentArticle.appendChild(h2);

        currentSection.appendChild(currentArticle);
        container.appendChild(currentSection);
        return;
      }

      // スライド（同じセクション内）
      if (!currentArticle) {
        // セクションなしなら仮のセクション作成
        currentSection = document.createElement('section');
        currentArticle = document.createElement('article');
        currentSection.appendChild(currentArticle);
        container.appendChild(currentSection);
      }

      const h3 = document.createElement('h3');
      h3.textContent = entry.title;
      currentArticle.appendChild(h3);

      const note = document.createElement('div');
      note.className = 'note';
      note.innerHTML = entry.note;
      currentArticle.appendChild(note);

      if (entry.image) {
        const img = document.createElement('img');
        img.src = entry.image;
        img.alt = entry.title;
        img.className = 'slide_img screen_shot'; // クラス両方つける
        img.style.maxWidth = '90%';

        // aタグとdivでラップ
        const aTag = document.createElement('a');
        aTag.href = img.src;
        aTag.setAttribute('data-lightbox', 'abc');
        aTag.className = 'expand-img';

        const divTag = document.createElement('div');
        divTag.className = 'center';

        aTag.appendChild(img);
        divTag.appendChild(aTag);

        if (entry.showInDetails) {
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = '画像を表示';
          details.appendChild(summary);
          details.appendChild(divTag); // ← ラップした画像を入れる
          currentArticle.appendChild(details);
        } else {
          currentArticle.appendChild(divTag); // ← ラップしてそのまま入れる
        }
      }
    });

    content.innerHTML = '';
    content.appendChild(container);
  }
});

