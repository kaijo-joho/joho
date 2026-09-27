/* 提出フォームの表示専用。ファイル・本人情報・採点結果を親へ受け渡さない。 */
(function (root) {
  'use strict';
  const CHANNEL = 'joho-html-submission-v1';
  const ORIGIN = 'https://joho.kaijo.ed.jp';
  const MESSAGES = Object.freeze({
    loading:'学校アカウントと提出条件を確認しています…',
    ready:'提出フォームで保存した実習ファイルを選択してください。まだ提出は完了していません。',
    selected:'ファイルを選択しました。フォーム内の「提出する」を押してください。',
    sending:'提出を受け付けています。この画面を閉じずにお待ちください。',
    checking:'受領状況を確認しています…',
    uncertain:'送信結果をまだ確認できません。フォーム内の「受領状況を再確認」を使ってください。',
    received:'提出を受け付けました。詳細はフォーム内で確認してください。',
    grading:'提出は受け付けています。採点結果を確認しています…',
    downloading:'提出した実習ファイルの控えを取得しています…',
    error:'提出フォーム内の案内を確認してください。表示できない場合は「別タブで開く」を使えます。'
  });
  function validUrl(value, targetId) {
    try {
      const url = new URL(value);
      return /^html\d{2}-\d{2}$/.test(targetId) && url.origin === 'https://script.google.com' && !url.username && !url.password && !url.hash &&
        /^\/(?:macros|a\/macros\/gfe\.kaijo\.ed\.jp)\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) &&
        url.searchParams.size === 3 && url.searchParams.get('kind') === 'html' && url.searchParams.get('flow') === 'normal' && url.searchParams.get('kadai') === targetId;
    } catch { return false; }
  }
  function create({container, dialog, url, targetId, isCurrent, requestClose}) {
    if (!validUrl(url, targetId) || !isCurrent()) throw Error('提出先を確認できません。保存してから提出を準備し直してください。');
    let phase = 'loading', source = null, disposed = false, slowTimer;
    const node = (parent, text, tag = 'p', className = '') => {
      const element = document.createElement(tag); element.textContent = text;
      if (className) element.className = className;
      parent.append(element); return element;
    };
    function needsAttention() { return ['selected','sending','uncertain','checking','grading','downloading'].includes(phase); }
    function canClose() {
      if (phase === 'sending' || phase === 'uncertain' || phase === 'checking') return root.confirm('提出処理中、または受領結果をまだ確認できていません。閉じても送信は取り消されません。閉じますか？');
      if (phase === 'selected') return root.confirm('選択したファイルはまだ提出していません。提出フォームを閉じますか？');
      if (phase === 'grading') return root.confirm('提出は受け付けていますが、採点結果を確認中です。閉じますか？');
      if (phase === 'downloading') return root.confirm('控えを取得中です。閉じると保存できない場合があります。閉じますか？');
      return true;
    }
    dialog.classList.add('download-open'); container.replaceChildren();
    const heading = node(container, targetId + '.html の提出フォーム', 'h3'); heading.tabIndex = -1;
    const external = node(container, '別タブで開く', 'a', 'btn');
    external.href = url; external.target = '_blank'; external.rel = 'noopener noreferrer';
    external.addEventListener('click', event => {
      if (!isCurrent() || !canClose()) { event.preventDefault(); return; }
      // 元フォームを残したまま二重操作を誘わない。クリックの新規タブ起動後に閉じる。
      phase = 'ready'; setTimeout(requestClose, 0);
    });
    const status = node(container, '', 'p', 'download-status'); status.setAttribute('role', 'status');
    const spinner = node(status, '', 'span', 'download-spinner'); spinner.setAttribute('aria-hidden', 'true');
    const label = node(status, '提出フォームを読み込んでいます…', 'span');
    node(container, 'ログインや表示がうまくいかない場合は「別タブで開く」を使ってください。ファイルは自動送信されません。フォーム内で選び、「提出する」を押します。', 'p', 'download-note');
    const frame = document.createElement('iframe'); frame.className = 'download-frame';
    frame.title = targetId + '.html の提出フォーム'; frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals');
    const receive = event => {
      const data = event.data;
      if (disposed || !frame.isConnected || !root.HtmlEditorDownload.gasOrigin(event.origin) ||
          !root.HtmlEditorDownload.withinFrame(event.source, frame.contentWindow) || !data ||
          data.channel !== CHANNEL || data.bridge !== bridge || data.targetId !== targetId) return;
      if (data.type === 'hello') {
        if (source && source !== event.source || !isCurrent()) return;
        source = event.source;
        source.postMessage({channel:CHANNEL,type:'connect',bridge,targetId,
          theme:document.documentElement.dataset.resolvedTheme,fontSize:document.documentElement.dataset.textSize}, event.origin);
        return;
      }
      if (event.source !== source || data.type !== 'state') return;
      if (data.phase === 'escape') { requestClose(); return; }
      if (!Object.prototype.hasOwnProperty.call(MESSAGES, data.phase)) return;
      phase = data.phase; clearTimeout(slowTimer);
      label.textContent = MESSAGES[phase]; spinner.hidden = !['loading','sending','checking','grading','downloading'].includes(phase);
    };
    let bridge = '';
    if (root.location.origin === ORIGIN && root.top === root) {
      try { bridge = Array.from(root.crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2,'0')).join(''); } catch { /* 別タブへ案内 */ }
    }
    if (bridge) {
      const embedded = new URL(url); embedded.searchParams.set('embed','html-editor'); embedded.searchParams.set('bridge',bridge);
      root.addEventListener('message', receive);
      slowTimer = setTimeout(() => { label.textContent = '表示に時間がかかっています。ログインが必要な場合は「別タブで開く」を使ってください。'; }, 20000);
      frame.src = embedded.href; container.append(frame);
    } else { spinner.hidden = true; label.textContent = 'この場所では埋め込み表示を利用できません。「別タブで開く」を使ってください。'; }
    heading.focus();
    return {canClose, needsAttention, dispose() {
      disposed = true; clearTimeout(slowTimer); root.removeEventListener('message', receive);
      frame.remove(); source = null; dialog.classList.remove('download-open');
    }};
  }
  const api = Object.freeze({create, validUrl});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HtmlEditorSubmission = api;
})(typeof window === 'undefined' ? globalThis : window);
