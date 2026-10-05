/* 保存確認済みの実習ファイルだけ認証フォームへ渡す。本人情報・採点結果は親へ返さない。 */
(function (root) {
  'use strict';
  const CHANNEL = 'joho-html-submission-v1';
  const ORIGIN = 'https://joho.kaijo.ed.jp';
  const TRANSFER = 'saved-html-v1';
  const MESSAGES = Object.freeze({
    loading:'学校アカウントと提出条件を確認しています…',
    ready:'提出フォームで保存した実習ファイルを選択してください。まだ提出は完了していません。',
    selected:'ファイルを選択しました。フォーム内の「提出する」を押してください。',
    sending:'提出を受け付けています。この画面を閉じずにお待ちください。',
    checking:'受領状況を確認しています…',
    uncertain:'送信結果をまだ確認できません。フォーム内の「受領状況を再確認」を使ってください。',
    received:'提出を受け付けました。詳細はフォーム内で確認してください。',
    'previous-received':'前回の受領を確認しました。今回の保存済みファイルはまだ提出していません。',
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
  function create({container, dialog, url, targetId, isCurrent, requestClose, savedFile = null}) {
    if (!validUrl(url, targetId) || !isCurrent()) throw Error('提出先を確認できません。保存してから提出を準備し直してください。');
    if (savedFile && (savedFile.fileName !== targetId + '.html' || typeof savedFile.text !== 'string' || !savedFile.text.length ||
        new TextEncoder().encode(savedFile.text).length > 2 * 1024 * 1024)) throw Error('保存済みファイルを確認できません。');
    const file = savedFile ? Object.freeze({fileName:savedFile.fileName, text:savedFile.text,
      hintUsage:root.HtmlEditorHintUsage ? root.HtmlEditorHintUsage.normalize(savedFile.hintUsage, targetId, savedFile.fileName) : {v:1,status:'unavailable'}}) : null;
    let phase = 'loading', protectedResult = '', source = null, sourceOrigin = '', disposed = false, slowTimer, transfer = false, frame = null, bridge = '';
    const node = (parent, text, tag = 'p', className = '') => {
      const element = document.createElement(tag); element.textContent = text;
      if (className) element.className = className;
      parent.append(element); return element;
    };
    function needsAttention() { return protectedResult === 'pending' || ['selected','previous-received','sending','uncertain','checking','grading','downloading'].includes(phase); }
    function canClose() {
      if (protectedResult === 'pending' || phase === 'sending' || phase === 'uncertain' || phase === 'checking') return root.confirm('提出処理中、または受領結果をまだ確認できていません。閉じても送信は取り消されません。閉じますか？');
      if (phase === 'selected' || phase === 'previous-received') return root.confirm('今回のファイルはまだ提出していません。提出フォームを閉じますか？');
      if (phase === 'grading') return root.confirm('提出は受け付けていますが、採点結果を確認中です。閉じますか？');
      if (phase === 'downloading') return root.confirm('控えを取得中です。閉じると保存できない場合があります。閉じますか？');
      return true;
    }
    dialog.classList.add('download-open','submission-open'); container.replaceChildren();
    const help = root.HtmlEditorDownload.loginHelp(container, () => {
      if (disposed) return;
      if (protectedResult === 'pending') { help.say('提出処理中、または受領結果が不明です。フォーム内の「受領状況を再確認」を使ってください。自動再送はしません。'); return; }
      if (protectedResult === 'receipt') { help.say('提出は受け付けています。フォーム内で採点結果や控えを確認してください。修正して再提出するときは、フォーム内の「もう一度提出する」から編集へ戻ります。'); return; }
      if (!isCurrent() || !canClose() || !isCurrent()) return;
      startFrame();
      help.say('フォームだけを開き直しました。ファイルは自動送信されません。フォーム内の案内を確認してください。');
    });
    node(help.body, '別タブでは、Macに保存した実習ファイルを選び直してください。');
    const external = node(help.body, '別タブで開く', 'a', 'btn');
    external.href = url; external.target = '_blank'; external.rel = 'noopener noreferrer';
    external.addEventListener('click', event => {
      if (!isCurrent() || !canClose()) { event.preventDefault(); return; }
      // 元フォームを残したまま二重操作を誘わない。クリックの新規タブ起動後に閉じる。
      phase = 'ready'; setTimeout(requestClose, 0);
    });
    const status = node(container, '', 'p', 'download-status'); status.setAttribute('role', 'status'); status.tabIndex = -1;
    const spinner = node(status, '', 'span', 'download-spinner'); spinner.setAttribute('aria-hidden', 'true');
    const label = node(status, '提出フォームを読み込んでいます…', 'span');
    const receive = event => {
      const data = event.data;
      if (disposed || !frame?.isConnected || !root.HtmlEditorDownload.gasOrigin(event.origin) ||
          !root.HtmlEditorDownload.withinFrame(event.source, frame.contentWindow) || !data ||
          data.channel !== CHANNEL || data.bridge !== bridge || data.targetId !== targetId) return;
      if (data.type === 'hello') {
        if (source && (source !== event.source || sourceOrigin !== event.origin) || !isCurrent()) return;
        source = event.source; sourceOrigin = event.origin;
        transfer = Boolean(file && data.fileTransfer === TRANSFER);
        source.postMessage({channel:CHANNEL,type:'connect',bridge,targetId,
          layout:'integrated-v1',fileTransfer:transfer ? TRANSFER : '',
          theme:document.documentElement.dataset.resolvedTheme,fontSize:document.documentElement.dataset.textSize}, event.origin);
        return;
      }
      if (event.source !== source || event.origin !== sourceOrigin) return;
      if (data.type === 'file-request' && transfer && /^[a-f0-9]{32}$/.test(data.requestId) && Number.isSafeInteger(data.transferId) && data.transferId > 0) {
        const current = isCurrent();
        source.postMessage({channel:CHANNEL,type:current ? 'saved-file' : 'file-unavailable',bridge,targetId,
          requestId:data.requestId,transferId:data.transferId,...(current ? file : {})}, sourceOrigin);
        return;
      }
      if (data.type === 'layout' && data.layout === 'integrated-v1') {
        // 以後の状態・スピナーは内側のフォームが担当。二重表示しない。
        status.hidden = true; clearTimeout(slowTimer); return;
      }
      if (data.type === 'height' && Number.isInteger(data.height) && data.height >= 0 && data.height <= 20000) {
        frame.style.height = Math.max(200, Math.min(1600, data.height)) + 'px'; return;
      }
      if (data.type !== 'state') return;
      if (data.phase === 'edit') { requestClose(); return; }
      if (data.phase === 'escape') { requestClose(); return; }
      if (!Object.prototype.hasOwnProperty.call(MESSAGES, data.phase)) return;
      phase = data.phase; clearTimeout(slowTimer);
      if (['sending','uncertain','checking'].includes(phase)) protectedResult = 'pending';
      else if (['received','grading','downloading'].includes(phase)) protectedResult = 'receipt';
      else if (phase === 'previous-received') protectedResult = '';
      label.textContent = MESSAGES[phase]; spinner.hidden = !['loading','sending','checking','grading','downloading'].includes(phase);
    };
    function clearFrame() {
      clearTimeout(slowTimer); root.removeEventListener('message', receive);
      frame?.remove(); frame = null; source = null; sourceOrigin = ''; transfer = false; bridge = '';
    }
    function startFrame() {
      clearFrame(); phase = 'loading'; protectedResult = ''; status.hidden = false; spinner.hidden = false;
      label.textContent = '提出フォームを読み込んでいます…';
      if (root.location.origin === ORIGIN && root.top === root) {
        try { bridge = Array.from(root.crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2,'0')).join(''); } catch { /* 別タブへ案内 */ }
      }
      if (!bridge) { spinner.hidden = true; label.textContent = 'この場所では埋め込み表示を利用できません。「別タブで開く」を使ってください。'; return; }
      frame = document.createElement('iframe'); frame.className = 'download-frame';
      frame.title = targetId + '.html の提出フォーム'; frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals');
      const embedded = new URL(url); embedded.searchParams.set('embed','html-editor'); embedded.searchParams.set('bridge',bridge);
      root.addEventListener('message', receive);
      slowTimer = setTimeout(() => {
        label.textContent = '表示に時間がかかっています。「表示・ログインで困ったとき」から学校アカウントを確認してください。';
        help.element.open = true;
      }, 20000);
      frame.src = embedded.href; container.append(frame);
    }
    startFrame();
    status.focus();
    return {canClose, needsAttention, dispose() {
      disposed = true; clearFrame(); dialog.classList.remove('download-open','submission-open');
    }};
  }
  const api = Object.freeze({create, validUrl});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HtmlEditorSubmission = api;
})(typeof window === 'undefined' ? globalThis : window);
