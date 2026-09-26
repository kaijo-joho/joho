/* 配付ページの表示だけを担当する。原本・発行番号・本人情報は親画面へ渡さない。 */
(function (root) {
  'use strict';
  const CHANNEL = 'joho-html-distribution-v1';
  const ORIGIN = 'https://joho.kaijo.ed.jp';
  const STATES = new Set(['loading','ready','issuing','uncertain','issued','download-started','error','escape']);
  function gasOrigin(origin) {
    return typeof origin === 'string' && /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin);
  }
  function withinFrame(source, frameWindow) {
    // GASの外枠とHTML Serviceの内枠を区別し、このiframeの子孫だけを受け入れる。
    try {
      for (let depth = 0; source && depth < 5; depth++) {
        if (source === frameWindow) return true;
        const parent = source.parent;
        if (parent === source) return false;
        source = parent;
      }
    } catch { /* 関係を確認できなければ拒否する。 */ }
    return false;
  }
  function nonce() {
    return Array.from(root.crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
  }
  function create({container, dialog, lesson, stateFor, requestClose}) {
    let disposeFrame = () => {}, phase = '', disposed = false, frameOpen = false, selectedTask = '';
    const node = (parent, text, tag = 'p', className = '') => {
      const element = document.createElement(tag); element.textContent = text;
      if (className) element.className = className;
      parent.append(element); return element;
    };
    function canClose() {
      if (['issuing','uncertain'].includes(phase)) return root.confirm('発行処理中、または結果をまだ確認できていません。閉じても発行は取り消されません。閉じますか？');
      if (phase === 'issued') return root.confirm('発行したHTMLをまだ保存していません。保存用リンクを閉じますか？');
      return true;
    }
    function clearFrame() {
      disposeFrame(); disposeFrame = () => {}; phase = ''; frameOpen = false;
      dialog.classList.remove('download-open');
    }
    function showList(focusTask) {
      if (disposed) return;
      clearFrame(); container.replaceChildren();
      node(container, lesson.title);
      node(container, '対象ファイルを選ぶと、この画面内に配付ページを表示します。学校アカウント・対象学年・課題設定を確認して、本人用HTMLを発行します。');
      if (!lesson.files.length) node(container, 'この教材には配付するHTML課題はありません。');
      for (const task of lesson.files) {
        const state = stateFor(task.id);
        node(container, task.fileName + ' — ' + task.title, 'h3');
        if (!state.item) { node(container, state.message); continue; }
        const link = node(container, task.fileName + ' をダウンロード', 'a', 'btn file-entry');
        link.href = state.item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.dataset.taskDownload = task.id;
        link.addEventListener('click', event => {
          const fresh = stateFor(task.id);
          if (!fresh.item || fresh.item.url !== link.href) {
            event.preventDefault(); showList(task.id); return;
          }
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); showFrame(task, fresh.item);
        });
      }
      node(container, '取得したHTMLは、名前を変えずに「書類／HTML実習」へ保存してください。取り直しても途中の編集内容は戻りません。');
      if (focusTask) container.querySelector('[data-task-download="' + focusTask + '"]')?.focus();
    }
    function showFrame(task, item) {
      clearFrame(); container.replaceChildren(); selectedTask = task.id; frameOpen = true;
      dialog.classList.add('download-open');
      const heading = node(container, task.fileName + ' — ' + task.title, 'h3'); heading.tabIndex = -1;
      const controls = node(container, '', 'div', 'download-controls');
      const back = node(controls, '課題一覧へ戻る', 'button', 'btn'); back.type = 'button';
      back.addEventListener('click', () => { if (canClose()) showList(task.id); });
      const external = node(controls, '別タブで開く', 'a', 'btn');
      external.href = item.url; external.target = '_blank'; external.rel = 'noopener noreferrer';
      external.addEventListener('click', event => {
        if (stateFor(task.id).item?.url !== item.url) { event.preventDefault(); showList(task.id); }
      });
      const status = node(container, '', 'p', 'download-status'); status.setAttribute('role', 'status');
      const spinner = node(status, '', 'span', 'download-spinner'); spinner.setAttribute('aria-hidden', 'true');
      const label = node(status, '配付ページを読み込んでいます…', 'span');
      node(container, 'ログインや表示がうまくいかない場合は「別タブで開く」を使ってください。ダウンロード後は、この画面を閉じて保存したファイルを開きます。', 'p', 'download-note');
      const frame = document.createElement('iframe'); frame.className = 'download-frame';
      frame.title = task.fileName + ' の配付ページ'; frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals');
      let bridge, source = null;
      if (root.location.origin !== ORIGIN || root.top !== root) {
        spinner.hidden = true; label.textContent = 'この場所では埋め込み表示を利用できません。「別タブで開く」から取得してください。';
        heading.focus(); return;
      }
      try { bridge = nonce(); } catch {
        spinner.hidden = true; label.textContent = '安全な接続情報を作れません。「別タブで開く」から取得してください。';
        heading.focus(); return;
      }
      const url = new URL(item.url); url.searchParams.set('embed', 'html-editor'); url.searchParams.set('bridge', bridge);
      const slowTimer = setTimeout(() => {
        label.textContent = '表示に時間がかかっています。学校アカウントのログインが必要な場合は「別タブで開く」を使ってください。';
      }, 20000);
      const receive = event => {
        const data = event.data;
        if (disposed || !frame.isConnected || !gasOrigin(event.origin) || !withinFrame(event.source, frame.contentWindow) ||
            !data || data.channel !== CHANNEL || data.bridge !== bridge || data.targetId !== task.id) return;
        if (data.type === 'hello') {
          if (source && source !== event.source) return;
          if (stateFor(task.id).item?.url !== item.url) { showList(task.id); return; }
          source = event.source;
          source.postMessage({channel:CHANNEL,type:'connect',bridge,targetId:task.id,
            theme:document.documentElement.dataset.resolvedTheme,fontSize:document.documentElement.dataset.textSize}, event.origin);
          return;
        }
        if (event.source !== source || data.type !== 'state' || !STATES.has(data.phase)) return;
        if (data.phase === 'escape') { requestClose(); return; }
        phase = data.phase;
        if (phase === 'loading') { label.textContent = '学校アカウントと課題設定を確認しています…'; return; }
        clearTimeout(slowTimer); spinner.hidden = true;
        if (phase === 'ready') label.textContent = '配付ページを表示しました。画面内の案内に従って取得してください。';
        else if (phase === 'issuing') { spinner.hidden = false; label.textContent = '本人用HTMLを発行しています。完了までお待ちください。'; }
        else if (phase === 'uncertain') label.textContent = '発行結果をまだ確認できません。配付ページ内の同じボタンで確認し直してください。';
        else if (phase === 'issued') label.textContent = '発行しました。配付ページ内の「HTMLを保存する」を押してください。';
        else if (phase === 'download-started') label.textContent = '保存を開始しました。Macにファイルが保存されたことを確認してください。';
        else label.textContent = '配付ページ内の案内を確認してください。必要な場合は「別タブで開く」を使えます。';
      };
      root.addEventListener('message', receive);
      disposeFrame = () => { clearTimeout(slowTimer); root.removeEventListener('message', receive); frame.remove(); source = null; };
      frame.src = url.href; container.append(frame); heading.focus();
    }
    function catalogChanged() {
      if (!disposed && !frameOpen) showList(selectedTask);
    }
    document.addEventListener('pages:ready', catalogChanged);
    document.addEventListener('html-editor:catalog-change', catalogChanged);
    showList();
    return {
      canClose,
      dispose() {
        disposed = true; clearFrame();
        document.removeEventListener('pages:ready', catalogChanged);
        document.removeEventListener('html-editor:catalog-change', catalogChanged);
      }
    };
  }
  const api = Object.freeze({create,gasOrigin,withinFrame});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HtmlEditorDownload = api;
})(typeof window === 'undefined' ? globalThis : window);
