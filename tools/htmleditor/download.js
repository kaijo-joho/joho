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
  // 配付・提出で共通の案内。Googleの認証操作は別タブで本人が行う。
  function loginHelp(container, retry, {identity = false} = {}) {
    const node = (parent, text, tag = 'p', className = '') => {
      const element = document.createElement(tag); element.textContent = text;
      if (className) element.className = className;
      parent.append(element); return element;
    };
    const element = node(container, '', 'details', 'submission-help');
    node(element, '表示・ログインで困ったとき', 'summary');
    const body = node(element, '', 'div', 'form-login-help');
    node(body, '学校のGoogleアカウント（@gfe.kaijo.ed.jp）でログインしてください。ログイン後は、この画面に戻ってフォームだけを開き直せます。編集中の内容はそのまま残ります。');
    const actions = node(body, '', 'div', 'download-controls');
    const login = node(actions, 'Googleにログイン', 'a', 'btn');
    login.href = 'https://accounts.google.com/'; login.target = '_blank'; login.rel = 'noopener noreferrer';
    const retryButton = node(actions, identity ? '本人確認画面だけを開き直す' : 'フォームだけを開き直す', 'button', 'btn'); retryButton.type = 'button';
    retryButton.addEventListener('click', retry);
    node(body, '複数アカウントでうまく開けない場合は、すべてのGoogleアカウントからログアウトし、学校アカウントだけでログインし直してください');
    node(body, '同じChromeプロファイルで使っているGmailやGoogleドライブなど、他のGoogleサービスもログアウトされます。ログアウトは必要な場合だけ自分で行ってください。');
    node(body, '複数アカウントの利用時に、この操作で開けた事例があります。表示できない原因が必ず同じとは限りません。');
    node(body, identity ? '本人確認のボタンが表示された後は、その画面内で操作してください。確認処理中は画面を開き直しません。' : '発行・提出中、結果不明、発行結果が未保存のときは開き直さず、フォーム内の同じボタンや受領状況の再確認を使ってください。');
    const notice = node(body, '', 'p', 'form-retry-notice'); notice.setAttribute('role', 'status');
    return {element, body, retryButton, say(message) { element.open = true; notice.textContent = message; }};
  }
  function create({container, dialog, lesson, stateFor, requestClose}) {
    let disposeFrame = () => {}, phase = '', protectedResult = '', disposed = false, frameOpen = false, selectedTask = '';
    const node = (parent, text, tag = 'p', className = '') => {
      const element = document.createElement(tag); element.textContent = text;
      if (className) element.className = className;
      parent.append(element); return element;
    };
    function canClose() {
      if (protectedResult === 'unknown' || ['issuing','uncertain'].includes(phase)) return root.confirm('発行処理中、または結果をまだ確認できていません。閉じても発行は取り消されません。閉じますか？');
      if (protectedResult === 'unsaved' || phase === 'issued') return root.confirm('発行したHTMLをまだ保存していません。保存用リンクを閉じますか？');
      return true;
    }
    function clearFrame() {
      disposeFrame(); disposeFrame = () => {}; phase = ''; protectedResult = ''; frameOpen = false;
      dialog.classList.remove('download-open','distribution-open','distribution-integrated');
    }
    function showList(focusTask) {
      if (disposed) return;
      clearFrame(); container.replaceChildren();
      node(container, lesson.title);
      node(container, '対象ファイルを選ぶと、この画面内に配付ページを表示します。学校アカウント・対象学年・課題設定を確認して、実習ファイルを発行します。');
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
      node(container, '通常は「ダウンロード」に保存されます。Finderで実習ファイルを「書類／HTML実習」へ移動してください。ファイル名に「(1)」などが付いた場合は、編集中のファイルを上書きしないよう確認してから指定の名前に戻します。取り直しても途中の編集内容は戻りません。');
      if (focusTask) container.querySelector('[data-task-download="' + focusTask + '"]')?.focus();
    }
    function showFrame(task, item, reopen = false) {
      clearFrame(); container.replaceChildren(); selectedTask = task.id; frameOpen = true;
      dialog.classList.add('download-open','distribution-open');
      const heading = node(container, task.fileName + ' — ' + task.title, 'h3'); heading.tabIndex = -1;
      const controls = node(container, '', 'div', 'download-controls');
      const back = node(controls, '課題一覧へ戻る', 'button', 'btn'); back.type = 'button';
      back.addEventListener('click', () => { if (canClose()) showList(task.id); });
      const help = loginHelp(container, () => {
        if (disposed || !frameOpen) return;
        if (protectedResult === 'unknown') { help.say('発行結果をまだ確認できません。開き直すと結果を見失うため、配付ページ内の同じボタンで確認し直してください。'); return; }
        if (protectedResult === 'unsaved') { help.say('発行した実習ファイルがまだ保存されていません。配付ページ内の「実習ファイルを保存する」を使ってください。'); return; }
        const fresh = stateFor(task.id);
        if (!fresh.item || fresh.item.url !== item.url) { help.say('配付先が変わりました。課題一覧へ戻って確認してください。'); return; }
        showFrame(task, fresh.item, true);
      });
      if (reopen) help.say('フォームだけを開き直しました。実習ファイルは自動発行されません。');
      node(help.body, '別タブで配付ページを開く場合は、発行・保存を開いた画面で続けてください。');
      const external = node(help.body, '別タブで開く', 'a', 'btn');
      external.href = item.url; external.target = '_blank'; external.rel = 'noopener noreferrer';
      external.addEventListener('click', event => {
        if (stateFor(task.id).item?.url !== item.url) { event.preventDefault(); if (canClose()) showList(task.id); return; }
        if (!canClose()) { event.preventDefault(); return; }
        // 二つの画面での重複発行を誘わず、別タブを開いた後にこちらを閉じる。
        phase = 'ready'; setTimeout(requestClose, 0);
      });
      const status = node(container, '', 'p', 'download-status'); status.setAttribute('role', 'status');
      const spinner = node(status, '', 'span', 'download-spinner'); spinner.setAttribute('aria-hidden', 'true');
      const label = node(status, '配付ページを読み込んでいます…', 'span');
      const frame = document.createElement('iframe'); frame.className = 'download-frame';
      frame.title = task.fileName + ' の配付ページ'; frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals');
      let bridge, source = null, sourceOrigin = '', integrated = false;
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
        label.textContent = '表示に時間がかかっています。「表示・ログインで困ったとき」から学校アカウントを確認してください。';
        help.element.open = true;
      }, 20000);
      const receive = event => {
        const data = event.data;
        if (disposed || !frame.isConnected || !gasOrigin(event.origin) || !withinFrame(event.source, frame.contentWindow) ||
            !data || data.channel !== CHANNEL || data.bridge !== bridge || data.targetId !== task.id) return;
        if (data.type === 'hello') {
          if (source && (source !== event.source || sourceOrigin !== event.origin)) return;
          if (stateFor(task.id).item?.url !== item.url) { showList(task.id); return; }
          source = event.source; sourceOrigin = event.origin;
          source.postMessage({channel:CHANNEL,type:'connect',bridge,targetId:task.id,
            layout:'integrated-v1',
            theme:document.documentElement.dataset.resolvedTheme,fontSize:document.documentElement.dataset.textSize}, event.origin);
          return;
        }
        if (event.source !== source || event.origin !== sourceOrigin) return;
        if (data.type === 'layout' && data.layout === 'integrated-v1') {
          if (document.activeElement === heading) back.focus();
          integrated = true; status.hidden = true; heading.hidden = true;
          dialog.classList.add('distribution-integrated'); clearTimeout(slowTimer); return;
        }
        if (integrated && data.type === 'height' && Number.isInteger(data.height) && data.height >= 0 && data.height <= 20000) {
          frame.style.height = Math.max(200, Math.min(1600, data.height)) + 'px'; return;
        }
        if (data.type !== 'state' || !STATES.has(data.phase)) return;
        if (data.phase === 'escape') { requestClose(); return; }
        phase = data.phase;
        // 通信エラーや再読込中の通知だけで結果不明・未保存を解除しない。
        if (phase === 'issuing' || phase === 'uncertain') protectedResult = 'unknown';
        else if (phase === 'issued') protectedResult = 'unsaved';
        else if (phase === 'download-started') protectedResult = '';
        if (phase === 'loading') { label.textContent = '学校アカウントと課題設定を確認しています…'; return; }
        clearTimeout(slowTimer); spinner.hidden = true;
        if (phase === 'ready') label.textContent = '配付ページを表示しました。画面内の案内に従って取得してください。';
        else if (phase === 'issuing') { spinner.hidden = false; label.textContent = '実習ファイルを発行しています。完了までお待ちください。'; }
        else if (phase === 'uncertain') label.textContent = '発行結果をまだ確認できません。配付ページ内の同じボタンで確認し直してください。';
        else if (phase === 'issued') label.textContent = '発行しました。配付ページ内の「実習ファイルを保存する」を押してください。';
        else if (phase === 'download-started') label.textContent = 'ダウンロードを開始しました。Finderの「ダウンロード」で実習ファイルを確認し、「書類／HTML実習」へ移動してください。';
        else label.textContent = '配付ページ内の案内を確認してください。必要な場合は「別タブで開く」を使えます。';
      };
      root.addEventListener('message', receive);
      disposeFrame = () => { clearTimeout(slowTimer); root.removeEventListener('message', receive); frame.remove(); source = null; };
      frame.src = url.href; container.append(frame);
      if (reopen) help.retryButton.focus(); else heading.focus();
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
  const api = Object.freeze({create,gasOrigin,withinFrame,loginHelp});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HtmlEditorDownload = api;
})(typeof window === 'undefined' ? globalThis : window);
