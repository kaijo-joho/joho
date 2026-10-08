/* ローカルHTML/CSSの編集。認証と採点は配付・提出サーバーの責務。 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Practice = window.HtmlPracticeEditor;
  const Workflow = window.HtmlEditorWorkflow;
  const Onboarding = window.HtmlEditorOnboarding;
  const Diagnostics = window.HtmlEditorDiagnostics;
  const HintUsage = window.HtmlEditorHintUsage || {missing:status => ({v:1,status}),create() { throw Error('ヒント記録を利用できません。'); }};
  const catalog = Practice.lessons(window.HtmlLessons.LESSONS);
  let cm, fs, preview, recovery, doc, selectedLesson, navigation, busy = false, replacing = false;
  let autoTimer, toastTimer, submissionPanel = null;
  let folderMemory = null, rememberedFolder = null, folderMemoryIssue = '';
  let localDownloads=null, updateFileIdentity=()=>{};
  let diagnostics = null, hintUsage = null;
  const editable = path => /\.(html?|css)$/i.test(path);
  const content = () => cm.getValue();
  const dirty = () => doc && content() !== doc.savedContent;
  function notify(message) {
    $('toast').textContent = message; $('toast').style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').style.display = 'none'; }, 5000);
  }
  function errorMessage(error) { return error && error.message || '操作を完了できませんでした。'; }
  function displayState() {
    document.body.classList.toggle('has-document', Boolean(doc));
    $('emptyState').hidden = Boolean(doc);
    $('documentStatus').hidden = !doc;
    $('currentFileLabel').textContent = doc?.fileName || '';
    $('dirtyMark').hidden = !dirty();
    $('saveState').textContent = dirty() ? '未保存の変更があります。' : doc?.saveMessage || '';
    for (const id of ['saveBtn','folderSaveBtn','downloadBtn','submitBtn','runBtn','openPreviewTabBtn']) $(id).disabled = !doc || busy;
    $('findErrorsBtn').hidden = !diagnostics?.result.errors.length;
    $('findErrorsBtn').disabled = !doc || busy;
    for (const id of ['openFilesBtn','practiceOpenBtn','openOtherFileBtn','connectFolderBtn','settingsFolderBtn','reconnectFolderBtn']) $(id).disabled = busy;
    $('disconnectBtn').disabled = !fs.getFileList().length && !fs.isConnected() && !rememberedFolder && !folderMemoryIssue || busy;
    $('folderStatusText').textContent = fs.isConnected() ? '保存先フォルダ：' + fs.getDirectoryName() :
      fs.getFileList().length ? '読み取り専用：上書き保存にはフォルダ接続が必要です。' : 'フォルダ未接続';
    $('folderMemoryNotice').textContent = folderMemoryIssue || (!fs.isSupported() ?
      'このブラウザでは上書き保存用の接続先を記憶できません。必要なフォルダはその都度読み込みます。' : rememberedFolder ?
      '前回のフォルダ：' + rememberedFolder.name + '。許可が続いていれば次回も自動接続します。ファイルは自動で開きません。' :
      '接続したフォルダをこのブラウザに記憶します。');
    $('reconnectFolderBtn').hidden = fs.isConnected() || !rememberedFolder;
    $('folderAlert').hidden = fs.isConnected();
    $('connectFolderBtn').textContent = rememberedFolder ? '前回のフォルダへ再接続' : 'フォルダを接続…';
    $('folderAlertMessage').textContent = rememberedFolder ?
      '前回の「' + rememberedFolder.name + '」を使うには、再接続ボタンで利用許可を確認してください。別のフォルダは「設定」から選べます。' : fs.isSupported() ?
      '上書き保存や画像・リンクの確認には、実習フォルダを接続してください。' :
      'このブラウザでは上書き保存できません。「保存」からコピーをダウンロードできます。画像の確認にはフォルダ全体を読み込みます。';
    updateSubmission();
    updateFileIdentity();
  }
  const catalogState = () => window.HtmlEditorStartup.catalogState();
  function preparationState() {
    return Onboarding.assess({doc, source:doc ? content() : '', connected:fs.isConnected(), directory:fs.dirHandle,
      directoryName:fs.getDirectoryName(), files:fs.getFileList(), lessonId:selectedLesson?.id});
  }
  function submissionState() {
    const preparation = preparationState();
    if (preparation.active && !preparation.ready) return {ready:false, message:preparation.message};
    return doc ? Workflow.submission(window.pages, doc.fileName, content(), window.htmlPracticeLinks, catalogState()) :
      {ready:false, message:'配付された実習ファイルを開くと、提出条件を確認できます。'};
  }
  function updateSubmission() {
    const preparation = preparationState();
    $('onboardingStatus').hidden = !preparation.active;
    $('onboardingSteps').replaceChildren();
    if (preparation.active) {
      for (const step of preparation.steps) textNode($('onboardingSteps'), (step.done ? '✓ 確認済み：' : '未確認：') + step.text, 'li');
      $('onboardingMessage').textContent = preparation.message;
    }
    const state = submissionState();
    $('submissionState').textContent = state.message;
    $('submitBtn').classList.toggle('success', state.ready);
    $('submitBtn').dataset.available = String(state.ready);
    $('submitLabel').textContent = '提出';
    $('submitBtn').dataset.tip = state.ready ? '保存済みの実習ファイルを提出します。フォームで「提出する」を押すまで送信は完了しません。' : '提出の準備状況：' + state.message;
  }
  function snapshot(kind, destination = 'browser') {
    return {docId:doc.docId, fileName:doc.fileName, lessonId:doc.lessonId,
      mode:'lesson', kind, destination, content:content()};
  }
  function autoSave() {
    clearTimeout(autoTimer);
    if (!doc || !doc.hasWork || doc.lastAutoContent === content()) return;
    try {
      if (!recovery) throw Error('ブラウザの保存領域を利用できません。');
      recovery.save(snapshot('auto'));
      doc.lastAutoContent = content();
      $('recoveryState').textContent = '復旧用の控え：' + new Date().toLocaleTimeString('ja-JP');
    } catch (error) {
      $('recoveryState').textContent = '自動保存に失敗しました。Macへ保存してください。' + errorMessage(error);
    }
  }
  function replaceDocument(text, fileName, options = {}) {
    clearTimeout(autoTimer);
    clearDiagnostics(); hintUsage = null;
    replacing = true;
    const task = Practice.taskForFile(fileName);
    doc = {docId:crypto.randomUUID(), fileName, lessonId:task ? task.slice(0,6) : options.lessonId || selectedLesson.id,
      binding:options.binding || null, openedFrom:options.openedFrom || null, verifiedSave:null, diskContent:options.diskContent ?? text,
      savedContent:options.restored ? null : text, hasWork:Boolean(options.hasWork),
      saveMessage:options.message || 'ファイルを開きました。'};
    cm.setOption('mode', /\.css$/i.test(fileName) ? 'css' : 'htmlmixed');
    cm.setValue(text);
    try {
      const proof = Practice.inspect(content());
      if (proof) {
        try {
          let storage = null; try { storage = localStorage; } catch { /* 任意記録だけ利用不可 */ }
          hintUsage = HintUsage.create(storage, {fileKey:proof.localFileId || proof.issueId,
            targetId:proof.assignmentId, fileName:proof.fileName, validatorVersion:Diagnostics.VERSION});
        } catch { /* 記録の失敗で編集・提出を止めない。 */ }
        const start = content().indexOf(proof.marker), label = document.createElement('span');
        label.className = 'issued-marker'; label.textContent = '本人用の配付情報（編集しない）';
        cm.markText(cm.posFromIndex(start), cm.posFromIndex(start + proof.marker.length),
          {replacedWith:label, atomic:true, readOnly:true});
      }
    } catch { /* 不正な配付情報でも本文は保持。提出時に案内する。 */ }
    cm.clearHistory();
    if (!options.restored) doc.savedContent = content();
    replacing = false; displayState(); runPreview(options.fragment);
    requestAnimationFrame(() => cm.refresh());
    if (doc.hasWork) autoSave();
  }
  async function exclusive(action) {
    if (busy || $('actionDialog').open) return;
    const opener = document.activeElement;
    busy = true; cm.setOption('readOnly', true); $('app').setAttribute('aria-busy', 'true'); displayState();
    try { await action(); }
    catch (error) { if (error.name !== 'AbortError') notify(errorMessage(error)); }
    finally {
      busy = false; cm.setOption('readOnly', doc ? false : 'nocursor'); $('app').removeAttribute('aria-busy'); displayState();
      if (!$('actionDialog').open && document.activeElement === document.body && opener?.isConnected && !opener.disabled) opener.focus();
    }
  }
  function textNode(parent, text, tag = 'p') {
    const node = document.createElement(tag); node.textContent = text; parent.append(node); return node;
  }
  function modal(title, build, options = {}) {
    const dialog = $('actionDialog'), opener = document.activeElement;
    if (dialog.open) throw Error('開いている確認画面を閉じてください。');
    $('actionTitle').textContent = title; $('actionBody').replaceChildren(); $('actionButtons').replaceChildren();
    $('actionError').hidden = true;
    return new Promise(resolve => {
      let settled = false;
      function finish(value) {
        if (settled) return;
        if (options.canClose && !options.canClose()) return;
        settled = true; dialog.close(); dialog.removeEventListener('cancel', cancel);
        if (opener?.isConnected) opener.focus(); resolve(value);
      }
      function cancel(event) { event.preventDefault(); finish(null); }
      function button(label, value, callback) {
        const node = textNode($('actionButtons'), label, 'button');
        node.type = 'button'; node.className = 'btn'; node.dataset.choice = value;
        node.addEventListener('click', async () => {
          node.disabled = true;
          try {
            if (callback && await callback() === false) return;
            finish(value);
          } catch (error) {
            $('actionError').textContent = errorMessage(error); $('actionError').hidden = false;
          } finally { node.disabled = false; }
        });
        return node;
      }
      dialog.addEventListener('cancel', cancel);
      build($('actionBody'), button, finish);
      dialog.showModal();
      dialog.scrollTop = 0;
    });
  }
  async function allowReplace({navigation = false} = {}) {
    if (!dirty()) return true;
    autoSave();
    const result = await modal(navigation ? '未保存の変更があります' : '開いている内容を切り替えますか？', (body, button) => {
      textNode(body, doc.fileName + ' に未保存の変更があります。' + (navigation ? '別ページへ移動する前にMacへ保存してください。編集中の内容は保持します。' : '切り替える前にMacへ保存してください。'));
      button(navigation ? '保存して移動する' : '保存して開く', 'save');
      button(navigation ? '保存せずに移動する' : '保存せずに開く', 'discard');
      button('キャンセル', 'cancel');
    });
    if (result === 'discard') return true;
    if (result !== 'save') return false;
    if (fs.isConnected()) return saveToFile(doc.binding !== fs.dirHandle);
    download();
    // ダウンロードの完了はブラウザから検証できない。本人の確認までは切り替えない。
    return await modal('保存したファイルを確認', (body, button) => {
      textNode(body, 'ダウンロードした ' + doc.fileName + ' の保存先と内容を確認してください。元のファイルへの上書き保存ではありません。');
      button(navigation ? '保存を確認して移動する' : '保存を確認して開く', 'confirmed');
      button('キャンセル', 'cancel');
    }) === 'confirmed';
  }
  function setLesson(id, taskId = '', hash = '') {
    navigation.navigate({lessonId:id, taskId, hash});
  }
  async function beforeLessonVisit() {
    if (busy || $('actionDialog').open) return false;
    if (!dirty()) return true;
    let allowed = false;
    await exclusive(async () => { allowed = await allowReplace({navigation:true}); });
    return allowed;
  }
  function externalLessonVisit(href) {
    return exclusive(async () => {
      if (!await allowReplace({navigation:true})) return;
      await modal('別ページを開く', (body, button) => {
        textNode(body, '編集中のファイルはこの画面に保持しています。次のボタンで別タブを開いてください。');
        const link = textNode(body, '別ページを開く（別タブ）', 'a');
        link.className = 'btn'; link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        button('閉じる', 'close');
      });
    });
  }
  function renderLesson({lessonId:id, taskId, hash}) {
    selectedLesson = catalog.find(row => row.id === id) || catalog[1];
    $('lessonSelect').value = selectedLesson.id;
    $('taskSelect').replaceChildren();
    for (const task of selectedLesson.files) {
      const option = document.createElement('option'); option.value = task.id;
      option.textContent = task.fileName + ' — ' + task.title; $('taskSelect').append(option);
    }
    if (taskId) $('taskSelect').value = taskId;
    $('taskSelect').disabled = !selectedLesson.files.length;
    updateDistribution();
    // 教材の選択は文書名、保存先、Undo、配付情報を変更しない。
  }
  function updateDistribution() {
    const state = Workflow.distribution(window.pages, $('taskSelect').value, window.htmlPracticeLinks, catalogState());
    $('distributionState').textContent = state.message;
    $('distributionState').dataset.state = state.kind;
    updateSubmission();
  }
  function distributionDialog() {
    return exclusive(async () => {
      let panel;
      try {
        await modal('課題ファイルのダウンロード', (body, button, finish) => {
          panel = localDownloads ? localDownloads.createPanel({container:body,lesson:selectedLesson}) : window.HtmlEditorDownload.create({container:body, dialog:$('actionDialog'), lesson:selectedLesson,
            stateFor:id => Workflow.distribution(window.pages, id, window.htmlPracticeLinks, catalogState()), requestClose:() => finish('close')});
          button('閉じる', 'close');
        }, {canClose:() => !panel || panel.canClose()});
      } finally { panel?.dispose(); }
    });
  }
  function practiceSteps() {
    return exclusive(() => modal('実習の手順', (body, button) => {
      textNode(body, '初回はFinderで「書類」に「HTML実習」フォルダを作ります。次回からは同じフォルダを使います。');
      const list = document.createElement('ol'); body.append(list);
      function step(id, label, text) { const li = document.createElement('li'); list.append(li); menuHint(li, id, label); li.append(document.createTextNode(text)); }
      if (localDownloads) textNode(list, '学校アカウント：赤い案内が出ている場合は、先に「学校アカウントを確認する」を押します。ログイン画面が表示できない場合は「表示・ログインで困ったとき」から別タブでログインし、本人確認画面だけを開き直します。', 'li');
      step('taskDownloadBtn', 'ダウンロード', '：新しい課題の実習ファイルを取得します。通常はMacの「ダウンロード」に入るので、Finderで名前を変えずに「書類／HTML実習」へ移動します。');
      step('displayMenuWrap', '設定', '：初回は「フォルダを接続・変更…」で「HTML実習」を選びます。フォルダ選択中にHTMLがグレー表示でも正常です。次回は許可が続いていれば自動接続し、許可の確認が必要な場合は「前回のフォルダへ再接続」を押します。');
      step('openFilesBtn', '開く', '：接続したフォルダの一覧から今回の実習ファイルを選びます。初回の接続直後は、そのまま一覧が開きます。新しく移動したファイルや画像も「開く」で一覧に取り込みます。');
      step('runBtn', 'プレビューを更新', selectedLesson.id === 'html11' ?
        '：今回は html11-01.html を開くだけで、コードの編集は不要です。そのまま次の保存へ進みます。' :
        '：コードを編集し、このアイコン（⌘Enter）で表示を確認します。更新と保存は別の操作です。');
      step('saveBtn', '保存', '：コード欄のファイル名の横にあります（⌘S）。上書き保存して「Macのファイルに保存しました」を確認します。' + (selectedLesson.id === 'html11' ? '準備確認の3項目が確認済みになることも確かめます。' : ''));
      step('submitBtn', '提出', '：保存済みファイルを準備し、フォームの「提出する」を押します。受領と★を確認してください。別タブ・ダウンロード保存ではファイルを選びます。');
      textNode(body, 'プレビュー更新とファイル保存は別の操作です。直接保存できない場合はダウンロード先・内容・ファイル名をFinderで確認してください。');
      if (selectedLesson.id === 'html11') textNode(body, '導入課題の準備確認には、フォルダへ上書き保存できるGoogle Chromeを使います。フォルダ名とファイルの読み書きを確認しますが、書類フォルダ内かどうかや新しく作ったかどうかは確認できません。準備確認はこの画面内だけの案内で、提出物の採点結果とは別です。');
      textNode(body, '本人用の配付情報は削除・変更しないでください。受付期間内は何回でも再提出できますが、同じ課題の新しい提出は60秒以上あけます。');
      if (localDownloads) textNode(body, '本人確認の有効期間は90日です。期限切れは「学校アカウント」から再確認します。既に取得した実習ファイルの確認情報は自動では変わりません。提出時に更新を求められたら、そのファイルを開いたまま「開いている実習ファイルの確認情報を更新」を選び、Macへ保存してから提出します。別のアカウントを使う場合は「利用するアカウントを変更」を選びます。');
      textNode(body, '続きの作業は「開く」から再開します。「ダウンロード」で取り直しても途中の編集内容には戻りません。作業後は画像も含むフォルダ全体をバックアップしてください。万が一の復旧は「設定」→「復旧候補を開く…」から行います。');
      button('閉じる', 'close');
    }));
  }
  function menuHint(parent, id, label) {
    const badge = document.createElement('span'); badge.className = 'menu-hint';
    const icon = $(id)?.querySelector('svg');
    if (icon) badge.append(icon.cloneNode(true));
    badge.append(document.createTextNode(label)); parent.append(badge);
  }
  function runPreview(fragment = '') {
    if (!doc) return;
    if (/\.css$/i.test(doc.fileName)) {
      const result = Diagnostics.check(content(), {mode:'css', supports:(name, value) => CSS.supports(name, value),
        selector:value => { try { document.createDocumentFragment().querySelector(value); return true; } catch { return false; } }});
      preview.update('<html><body></body></html>', doc.fileName);
      if (!result.valid) preview.showBlocked();
      $('previewNotice').textContent = result.valid ? 'CSSは保存してから、参照しているHTMLを開いて確認します。' : 'コードに問題があります。修正してから更新してください。';
      $('previewNotice').hidden = false; receiveDiagnostics(result); return;
    }
    preview.update(content(), doc.fileName, fragment);
  }
  function clearDiagnostics() {
    diagnostics = null;
    cm?.clearGutter('error-hints');
    if ($('findErrorsBtn')) $('findErrorsBtn').hidden = true;
    if ($('hintNotice')) $('hintNotice').hidden = true;
  }
  function receiveDiagnostics(result) {
    clearDiagnostics();
    if (doc) diagnostics = {result, docId:doc.docId, source:content()};
    displayState();
  }
  function currentDiagnostics() {
    return diagnostics && doc?.docId === diagnostics.docId && content() === diagnostics.source;
  }
  async function hintConsent() {
    if (doc.hintConsent || hintUsage?.hasConsent()) return true;
    const result = await modal('ヒントを使う前に', (body, button) => {
      textNode(body, 'まずは自分でコードを見直してみましょう。');
      textNode(body, 'ヒントを使うと、その利用履歴が提出時に授業担当者へ送られます。');
      button('ヒントを使う', 'use').style.marginRight = 'auto';
      const reviewButton = button('自分で見直す', 'cancel');
      reviewButton.classList.add('primary'); reviewButton.autofocus = true;
    });
    if (result !== 'use') return false;
    doc.hintConsent = true; hintUsage?.consent(); return true;
  }
  function recordHint(kind, diagnostic) {
    try { hintUsage?.record(kind, diagnostic); } catch { /* 任意記録だけ失敗。 */ }
    $('hintNotice').textContent = 'ヒントの利用記録は、保存確認済みファイルをここから提出したときに授業担当者へ送られます。まずは自分で見直しましょう。' +
      (!hintUsage || hintUsage.isPartial() ? ' この環境では記録の全部または一部を保存できません。編集・提出は続けられます。' : '');
    $('hintNotice').hidden = false;
  }
  function findErrors() {
    exclusive(async () => {
      if (!currentDiagnostics() || !diagnostics.result.errors.length || !await hintConsent() || !currentDiagnostics()) return;
      const byLine = new Map();
      for (const error of diagnostics.result.errors) {
        if (!byLine.has(error.line)) byLine.set(error.line, []);
        byLine.get(error.line).push(error);
      }
      cm.clearGutter('error-hints');
      for (const [line, errors] of byLine) {
        const marker = document.createElement('button');
        marker.type = 'button'; marker.className = 'error-hint-marker'; marker.textContent = '⚠';
        marker.setAttribute('aria-label', line + '行目のエラーのヒントを表示');
        marker.dataset.tip = 'ヒントを表示します。利用記録は提出時に授業担当者へ送られます。';
        marker.addEventListener('click', () => exclusive(async () => {
          if (!currentDiagnostics()) return;
          await modal(line + '行目のヒント', (body, button) => {
            errors.forEach(error => textNode(body, error.message));
            textNode(body, 'この表示の利用記録も提出時に授業担当者へ送られます。修正方法は自分で考えてみましょう。');
            button('閉じる', 'close');
            // 表示した内容のみ記録し、プレビュー更新やキャンセルは数えない。
            recordHint('detail', errors[0]);
          });
        }));
        cm.setGutterMarker(line - 1, 'error-hints', marker);
      }
      recordHint('locations');
      notify('行番号の横の⚠からヒントを確認できます。編集すると印は消えます。');
    });
  }
  function safeRelativeLink(href, base) {
    if (/^[a-z][a-z0-9+.-]*:|^\/|\\|[\u0000-\u001f\u007f]|%(?:2f|5c|00)/i.test(href)) return null;
    try {
      const separator = href.indexOf('#');
      const relative = separator < 0 ? href : href.slice(0, separator);
      const fragment = separator < 0 ? '' : href.slice(separator);
      if (relative.includes('?')) return null;
      const parts = base.split('/').slice(0, -1);
      for (const part of decodeURIComponent(relative).split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { if (!parts.length) return null; parts.pop(); }
        else parts.push(part);
      }
      const path = parts.join('/');
      return editable(path) && fs.fileEntries.has(path) ? {path, fragment} : null;
    } catch { return null; }
  }
  async function loadFile(path, fragment = '') {
    let value = await fs.readFile(path); // 読取失敗は現在の文書に触れない。
    const hadChanges = dirty();
    if (!await allowReplace()) return;
    // 同じファイルを「保存して開く」場合、確認前に読んだ旧内容で戻さない。
    // 再読取に失敗しても、保存した現在の文書をそのまま保持する。
    if (hadChanges) value = await fs.readFile(path);
    autoSave();
    replaceDocument(value, path, {binding:fs.isConnected() ? fs.dirHandle : null,
      openedFrom:fs.isConnected() ? fs.dirHandle : null, diskContent:value, hasWork:true, fragment});
    if (Practice.taskForFile(path)) setLesson(doc.lessonId, Practice.taskForFile(path));
    setPane('center');
  }
  async function fileList() {
    const files = fs.getFileList();
    const selected = await modal(fs.isConnected() ? '実習フォルダ内のファイル' : '読み込んだファイル', (body, button, finish) => {
      textNode(body, fs.isConnected() ? fs.getDirectoryName() + '：開くファイルを選んでください。' : '読み込んだファイルから選んでください。');
      if (!files.length) textNode(body, '開けるファイルがありません。Finderで実習ファイルを移動し、もう一度「開く」を押してください。フォルダの変更は「設定」から行えます。');
      for (const path of files) {
        if (editable(path)) {
          const item = document.createElement('button'); item.type = 'button'; item.className = 'file-entry btn';
          item.textContent = path; item.addEventListener('click', () => finish(path)); body.append(item);
        } else textNode(body, path + '（表示用の素材）');
      }
      button('閉じる', 'cancel');
    });
    if (selected && selected !== 'cancel') await loadFile(selected);
  }
  async function openFolder() {
    if (!fs.isSupported()) { $('directoryInput').click(); return; }
    await exclusive(async () => {
      await fs.openDirectory();
      rememberedFolder = fs.dirHandle;
      try {
        if (!folderMemory) throw Error('ブラウザの記憶領域を利用できません。');
        await folderMemory.save(rememberedFolder); folderMemoryIssue = '';
      } catch {
        folderMemoryIssue = 'フォルダの記憶に失敗しました。今回は使えますが、次回は再選択が必要な場合があります。';
        try { await folderMemory?.forget(); } catch { folderMemoryIssue += '以前の接続先が残っている可能性があります。'; }
      }
      if (doc) { doc.binding = null; doc.openedFrom = null; doc.verifiedSave = null; } // 同名ファイルが別フォルダにあっても自動上書きしない。
      displayState(); runPreview();
      notify(folderMemoryIssue || 'フォルダを接続・記憶しました。開くファイルを選んでください。');
      await fileList();
    });
  }
  function openSavedFile() {
    if (busy || $('actionDialog').open) return;
    if (fs.isConnected()) return exclusive(async () => { await fs.scanDirectory(); displayState(); runPreview(); await fileList(); });
    if (rememberedFolder) return reconnectFolder(true);
    if (fs.getFileList().length > 1) return exclusive(fileList);
    $('fileInput').click();
  }
  function reconnectFolder(openList = false) {
    return exclusive(async () => {
      if (!rememberedFolder) return;
      if (!await fs.reconnectDirectory(rememberedFolder, {requestPermission:true})) {
        notify('フォルダの利用が許可されませんでした。内容は保持しています。「設定」から選び直すこともできます。'); return;
      }
      if (doc) { doc.binding = null; doc.openedFrom = null; doc.verifiedSave = null; }
      displayState(); runPreview();
      notify('前回のフォルダへ再接続しました。');
      if (openList) await fileList();
    });
  }
  function restoreFolderConnection() {
    return exclusive(async () => {
      if (!folderMemory || !fs.isSupported()) return;
      try {
        rememberedFolder = await folderMemory.load();
        if (rememberedFolder) await fs.reconnectDirectory(rememberedFolder); // 起動時に許可を要求しない。
      } catch {
        folderMemoryIssue = '前回のフォルダに自動接続できませんでした。「設定」から再接続・選び直しができます。';
        notify(folderMemoryIssue);
      }
      // 接続先だけを復元する。編集中のファイル・ブラウザの控えは開かない。
    });
  }
  async function importSelection(input, directory) {
    const files = [...input.files]; input.value = '';
    if (!files.length) return;
    await exclusive(async () => {
      const staged = new window.HtmlFileSystem();
      try {
        await staged.importFiles(files, {directory});
        const editingFiles = staged.getFileList().filter(editable);
        if (!directory && editingFiles.length === 1) {
          const path = editingFiles[0], value = await staged.readFile(path);
          if (!await allowReplace()) { staged.disconnect(); return; }
          autoSave(); fs.disconnect(); fs = staged; preview.fs = fs;
          replaceDocument(value, path, {hasWork:true, message:'読み取り専用で開きました。Macへの保存はダウンロードを使います。'});
          if (Practice.taskForFile(path)) setLesson(doc.lessonId, Practice.taskForFile(path));
          setPane('center');
        } else {
          fs.disconnect(); fs = staged; preview.fs = fs;
          if (doc) { doc.binding = null; doc.openedFrom = null; doc.verifiedSave = null; }
          displayState(); runPreview(); await fileList();
        }
      } catch (error) { if (fs !== staged) staged.disconnect(); throw error; }
    });
  }
  async function saveToFile(explicit = false) {
    if (!doc) return false;
    doc.verifiedSave = null; // 取消・権限喪失・書込失敗を以前の成功で隠さない。
    if (!fs.isConnected()) throw Error('書き込み可能なフォルダを接続してください。このブラウザではダウンロードで保存することもできます。');
    if (doc.binding !== fs.dirHandle && !explicit) throw Error('保存先を確認できません。「開く」から開き直すか、保存先フォルダを確認してください。');
    const saved = {docId:doc.docId, fileName:doc.fileName, content:content(), binding:fs.dirHandle};
    const exists = fs.fileEntries.has(saved.fileName);
    if (doc.binding === fs.dirHandle && exists && await fs.readFile(saved.fileName) !== doc.diskContent) {
      throw Error('Mac上のファイルが別の操作で変更されています。上書きせず、編集中の内容をダウンロードして比較してください。');
    }
    if (explicit && doc.binding !== fs.dirHandle) {
      const yes = await modal('保存先を確認', (body, button) => {
        textNode(body, fs.getDirectoryName() + '/' + saved.fileName);
        textNode(body, exists ? '同名ファイルがあります。内容を上書きします。' : 'この場所にファイルを作成します。');
        button(exists ? '上書き保存する' : '保存する', 'save');
        button('キャンセル', 'cancel');
      });
      if (yes !== 'save') return false;
    }
    if (doc.docId !== saved.docId || content() !== saved.content || fs.dirHandle !== saved.binding) throw Error('内容または保存先が変わりました。もう一度保存してください。');
    await fs.writeFile(saved.fileName, saved.content);
    if (doc.docId !== saved.docId) throw Error('文書が切り替わりました。保存内容を確認してください。');
    doc.binding = saved.binding; doc.diskContent = saved.content; doc.savedContent = saved.content; doc.hasWork = true;
    doc.verifiedSave = {directory:saved.binding, content:saved.content}; // writeFileはclose後に同じファイルを読み戻して照合済み。
    doc.saveMessage = 'Macのファイルに保存しました：' + saved.fileName;
    try {
      if (!recovery) throw Error('保存領域を利用できません。');
      recovery.save({...snapshot('manual', 'file'), content:saved.content});
    } catch { $('recoveryState').textContent = 'Macへ保存できましたが、ブラウザの控えは保存できませんでした。'; }
    displayState(); notify(doc.saveMessage);
    return content() === saved.content;
  }
  function save() {
    return exclusive(async () => {
      if (!doc) return;
      if (fs.isConnected()) await saveToFile(doc.binding !== fs.dirHandle);
      else await modal('上書き保存できません', (body, button) => {
        textNode(body, 'フォルダ未接続、または読み取り専用で開いています。上書き保存するには「設定」で実習フォルダを接続してください。編集中の内容は保持しています。');
        textNode(body, 'このままコピーをダウンロードすることもできます。元のファイルへの上書き保存ではないため、Finderで保存先・ファイル名・内容を確認してください。');
        button('コピーをダウンロード', 'download', () => { download(); });
        button('閉じる', 'close');
      });
      runPreview();
    });
  }
  function download(text = content(), name = doc?.fileName) {
    if (!name) return;
    const blob = new Blob([text], {type:/\.css$/i.test(name) ? 'text/css;charset=utf-8' : 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name.split('/').pop(); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify('ダウンロードを開始しました。保存先とファイル名を確認してください。');
  }
  async function restore() {
    let result;
    try {
      if (!recovery) throw Error('ブラウザの保存領域を利用できません。');
      result = recovery.list();
    } catch (error) { $('recoveryState').textContent = errorMessage(error); notify(errorMessage(error)); return; }
    const choice = await modal('復旧候補', (body, button, finish) => {
      textNode(body, '日時とファイル名を確認して選んでください。選ぶと編集画面に取り出しますが、Macのファイルは上書きしません。選ばなかった控えも削除しません。');
      textNode(body, '自動保存は編集を止めた後の控え、ファイル保存時の控えは保存成功時の内容です。画像・フォルダ一式や編集履歴すべてのバックアップではありません。');
      textNode(body, $('recoveryState').textContent);
      if (!result.items.length) textNode(body, '復元できる控えがありません。');
      if (result.errors.length) textNode(body, '読み取れない控えが ' + result.errors.length + ' 件あります。元データは保持しています。');
      const list = document.createElement('div'); list.className = 'recovery-list'; body.append(list);
      result.items.forEach(item => {
        const label = (item.kind === 'auto' ? '自動保存' : 'ファイル保存時') + ' / ' + item.fileName + ' / ' +
          new Date(item.savedAt).toLocaleString('ja-JP') + (item.destination === 'file' ? ' / ファイル保存時の控え' : '');
        const node = textNode(list, label, 'button'); node.type = 'button'; node.className = 'btn file-entry';
        node.addEventListener('click', () => finish(item));
      });
      button('キャンセル', 'cancel');
    });
    if (!choice || choice === 'cancel') return;
    if (!await allowReplace()) return;
    autoSave();
    replaceDocument(choice.content, choice.fileName, {lessonId:choice.lessonId, restored:true, hasWork:true,
      message:'控えから復旧しました。Macの保存先は再確認してください。'});
    setLesson(doc.lessonId, Practice.taskForFile(choice.fileName) || ''); setPane('center'); notify('控えを復旧しました。Macのファイルは変更していません。');
  }
  async function submit() {
    await exclusive(async () => {
      const state = submissionState();
      if (!state.ready) { notify(state.message); return; }
      const receipt = Practice.submission(window.pages, doc.fileName, content(), window.htmlPracticeLinks);
      const fixed = {docId:doc.docId, source:content(), fileName:doc.fileName, url:receipt.url};
      let hintSnapshot = HintUsage.missing('unavailable');
      try { if (hintUsage) hintSnapshot = hintUsage.snapshot(); } catch { /* 提出自体は継続 */ }
      let savedToFile = false;
      if (doc.binding && doc.binding === fs.dirHandle) {
        savedToFile = await saveToFile();
        if (!savedToFile) return;
      }
      try {
      await modal('実習ファイルの提出', (body, button, finish) => {
        function unchanged() {
          try {
            const preparation = preparationState();
            return (!preparation.active || preparation.ready) && catalogState() === 'ready' && doc.docId === fixed.docId && doc.fileName === fixed.fileName && content() === fixed.source &&
              Practice.submission(window.pages, doc.fileName, content(), window.htmlPracticeLinks).url === fixed.url;
          } catch { return false; }
        }
        function openForm() {
          submissionPanel = window.HtmlEditorSubmission.create({container:body, dialog:$('actionDialog'),
            url:fixed.url, targetId:receipt.proof.assignmentId, isCurrent:unchanged, requestClose:() => finish('close'),
            savedFile:savedToFile ? {fileName:fixed.fileName, text:fixed.source, hintUsage:hintSnapshot} : null});
        }
        button('閉じる', 'close');
        // 接続先へ書込・読戻し確認済み。ダウンロード用の自己確認は重ねない。
        if (savedToFile) { openForm(); return; }
        textNode(body, receipt.fileName);
        textNode(body, 'まだ提出は完了していません。提出フォームでこの実習ファイルを選択して送信し、受領と★を確認してください。');
        let downloaded = false;
        const down = textNode(body, '実習ファイルを保存する', 'button'); down.type = 'button'; down.className = 'btn'; down.id = 'submitDownload';
        if (!savedToFile) textNode(body, '通常は「ダウンロード」に保存されます。Finderで「書類／HTML実習」へ移動してください。同名の編集中ファイルを上書きせず、提出する最新版の名前と内容を確認します。');
        const label = document.createElement('label'); label.className = 'confirm-download';
        const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'downloadConfirmed';
        label.append(check, document.createTextNode('保存したファイル名と保存先を確認しました。')); body.append(label);
        if (preparationState().active) { down.hidden = true; label.hidden = true; } // 導入課題は自己申告のダウンロード確認で代替しない。
        const link = textNode(body, '提出画面を開く', 'a'); link.className = 'btn primary'; link.id = 'submissionLink';
        link.href = fixed.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.hidden = !savedToFile;
        if (savedToFile) textNode(body, 'Macのファイルへの保存を確認しました。');
        down.addEventListener('click', () => {
          if (!unchanged()) { notify('内容または提出先が変わりました。確認画面を閉じて、もう一度提出を準備してください。'); return; }
          download(fixed.source, fixed.fileName); downloaded = true; check.checked = false; link.hidden = !savedToFile;
        });
        check.addEventListener('change', () => { link.hidden = !savedToFile && !(downloaded && check.checked); });
        link.addEventListener('click', event => {
          if (!unchanged() || !(savedToFile || downloaded && check.checked)) {
            event.preventDefault(); link.hidden = true;
            $('actionError').textContent = '内容または提出先が変わりました。確認画面を閉じて保存し直してください。'; $('actionError').hidden = false;
            return;
          }
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          openForm();
        });
      }, {canClose:() => !submissionPanel || submissionPanel.canClose()});
      } finally { submissionPanel?.dispose(); submissionPanel = null; }
    });
    // exclusive中は提出ボタンがdisabledなので、解除後にフォーカスを戻す。
    if (!$('actionDialog').open) $('submitBtn').focus();
  }
  function setPane(name) {
    document.body.dataset.pane = name;
    document.querySelectorAll('[data-pane]').forEach(node => { if (node.tagName === 'BUTTON') node.setAttribute('aria-pressed', String(node.dataset.pane === name)); });
    if (name === 'left') {
      document.body.classList.remove('left-collapsed');
      $('toggleLessonBtn').setAttribute('aria-pressed', 'false');
      $('toggleLessonBtn').textContent = 'エディタを広く表示';
    }
    requestAnimationFrame(() => cm.refresh());
  }
  function initSplitters() {
    for (const [id, paneId, sign] of [['splitLeft','leftPane',1],['splitRight','rightPane',-1]]) {
      const splitter = $(id), pane = $(paneId);
      let x = null;
      function move(delta) {
        const maximum = id === 'splitLeft' ? $('mainContainer').clientWidth * .5 : $('editingPanes').clientWidth - 186;
        const width = Math.max(id === 'splitLeft' ? 220 : 180, Math.min(maximum, pane.offsetWidth + delta * sign));
        pane.style.width = width + 'px'; pane.style.flex = 'none'; cm.refresh();
      }
      splitter.addEventListener('pointerdown', event => { event.preventDefault(); x = event.clientX; splitter.setPointerCapture(event.pointerId); });
      splitter.addEventListener('pointermove', event => { if (x === null) return; move(event.clientX - x); x = event.clientX; });
      for (const name of ['pointerup','pointercancel','lostpointercapture']) splitter.addEventListener(name, () => { x = null; });
      splitter.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault(); move(event.key === 'ArrowLeft' ? -20 : 20);
      });
    }
  }
  function closeMenus(trigger = document.activeElement) {
    const owner = trigger?.closest('.menu-wrap[open]');
    document.querySelectorAll('.menu-wrap[open]').forEach(node => node.open = false);
    if (owner) owner.querySelector('summary').focus();
  }
  function disconnectFolder() {
    return exclusive(async () => {
      if (folderMemory) await folderMemory.forget(); // 記憶の解除に失敗したら成功扱いせず、現状を保持。
      rememberedFolder = null;
      folderMemoryIssue = folderMemory ? '' : 'この環境では記憶領域を使えません。今回の接続だけを解除しました。以前の記憶がある場合は削除できていません。';
      autoSave(); fs.disconnect(); if (doc) { doc.binding = null; doc.openedFrom = null; doc.verifiedSave = null; }
      displayState(); runPreview();
      notify(folderMemoryIssue || 'フォルダの接続と記憶を解除しました。編集中の内容は保持しています。');
    });
  }
  function setupHelp() {
    try {
      if (!window.JohoToolHelp?.create) throw Error('help unavailable');
      window.JohoToolHelp.create({title:'HTMLエディタの使い方', storageKey:'joho.htmleditor.help.v1',
        opener:$('helpBtn'), root:$('helpWindow'), isBusy:() => busy, returnToEditor:() => doc ? cm.focus() : $('practiceOpenBtn').focus(),
        bounds:() => ({top:$('toolbar').getBoundingClientRect().bottom + 8, bottom:innerHeight - 8})});
    } catch {
      // 小窓の共通部品を取得できなくても、保存・復元の説明は読めるようにする。
      $('helpBtn').addEventListener('click', event => {
        event.currentTarget.focus();
        exclusive(() => modal('HTMLエディタの使い方', (body, button) => {
          for (const section of document.querySelectorAll('#helpWindow [data-help-topic]')) {
            const copy = section.cloneNode(true); copy.hidden = false; body.append(copy);
          }
          button('閉じる', 'close');
        }));
      });
    }
  }
  function init() {
    fs = new window.HtmlFileSystem();
    try { recovery = window.HtmlEditorRecovery.create(localStorage); } catch { recovery = null; }
    try { folderMemory = window.HtmlEditorFolderMemory.create(indexedDB); } catch { folderMemoryIssue = 'この環境ではフォルダを記憶できません。接続は今回のみ有効です。'; }
    preview = new window.HtmlPreview({iframe:$('previewIframe'), fs, onDiagnostics:receiveDiagnostics,
      onTitle:title => {
        const label = $('previewTitle');
        label.hidden = title === null || /\.css$/i.test(doc?.fileName || '');
        label.textContent = label.hidden ? '' : title || 'タイトル未設定';
        label.dataset.tip = label.hidden ? '' : title ? 'HTMLのtitleタグ：' + title : 'HTMLのtitleタグがないか、中が空です。';
      },
      onNotice:message => { if (/\.css$/i.test(doc?.fileName || '')) return; $('previewNotice').textContent = message; $('previewNotice').hidden = !message; },
      onNavigate:href => exclusive(async () => {
        if (!doc) return;
        const link = safeRelativeLink(href, doc.fileName);
        if (!link) throw Error('リンク先を読み込んだフォルダ内で見つけられません。パスを確認してください。');
        await loadFile(link.path, link.fragment);
      })});
    cm = CodeMirror.fromTextArea($('codeEditor'), {
      mode:'htmlmixed', lineNumbers:true, gutters:['CodeMirror-linenumbers','error-hints'], autoCloseTags:false, smartIndent:false, electricChars:false,
      indentUnit:2, tabSize:2, lineWrapping:true, readOnly:'nocursor',
      extraKeys:{Tab:editor => { if (doc && !busy) editor.replaceSelection('  ', 'end', '+input'); },
        Enter:editor => { if (doc && !busy) editor.replaceSelection('\n', 'end', '+input'); },
        'Cmd-S':save, 'Ctrl-S':save, 'Cmd-O':openSavedFile, 'Ctrl-O':openSavedFile,
        'Cmd-Enter':() => runPreview(), 'Ctrl-Enter':() => runPreview()}
    });
    for (const lesson of catalog) {
      const option = document.createElement('option'); option.value = lesson.id; option.textContent = lesson.title; $('lessonSelect').append(option);
    }
    navigation = window.HtmlEditorNavigationMount({iframe:$('lessonIframe'), onSelect:renderLesson, onError:notify,
      beforeVisit:beforeLessonVisit, hasUnsaved:dirty, openExternal:externalLessonVisit});
    // 起動時は空のまま。ローカルファイルも復旧候補も自動では開かない。
    displayState();
    cm.on('change', () => {
      if (replacing || !doc) return;
      clearDiagnostics();
      doc.hasWork = true; displayState(); clearTimeout(autoTimer); autoTimer = setTimeout(autoSave, 500);
    });
    $('lessonSelect').addEventListener('change', async event => {
      const value = event.target.value; event.target.value = selectedLesson.id;
      closeMenus(event.target);
      await navigation.request({lessonId:value});
    });
    $('taskSelect').addEventListener('change', async event => {
      const value = event.target.value; event.target.value = navigation.selection.taskId;
      closeMenus(event.target);
      await navigation.request({...navigation.selection, taskId:value});
    });
    $('taskDownloadBtn').addEventListener('click', event => { event.currentTarget.focus(); distributionDialog(); });
    $('practiceStepsBtn').addEventListener('click', event => { event.currentTarget.focus(); practiceSteps(); });
    document.addEventListener('pages:ready', updateDistribution);
    document.addEventListener('html-editor:catalog-change', updateDistribution);
    for (const id of ['openFilesBtn','practiceOpenBtn']) $(id).addEventListener('click', event => { closeMenus(event.currentTarget); openSavedFile(); });
    $('openOtherFileBtn').addEventListener('click', event => { closeMenus(event.currentTarget); if (!busy) $('fileInput').click(); });
    $('fileInput').addEventListener('change', () => importSelection($('fileInput'), false));
    $('directoryInput').addEventListener('change', () => importSelection($('directoryInput'), true));
    $('settingsFolderBtn').addEventListener('click', event => { closeMenus(event.currentTarget); if (!busy) openFolder(); });
    $('connectFolderBtn').addEventListener('click', () => { if (!busy) rememberedFolder ? reconnectFolder(true) : openFolder(); });
    $('reconnectFolderBtn').addEventListener('click', event => { closeMenus(event.currentTarget); reconnectFolder(true); });
    $('disconnectBtn').addEventListener('click', event => { closeMenus(event.currentTarget); disconnectFolder(); });
    $('saveBtn').addEventListener('click', save);
    $('folderSaveBtn').addEventListener('click', event => { closeMenus(event.currentTarget); exclusive(() => saveToFile(true)); });
    $('downloadBtn').addEventListener('click', event => { closeMenus(event.currentTarget); if (!busy) download(); });
    $('restoreBtn').addEventListener('click', event => { closeMenus(event.currentTarget); exclusive(() => restore()); });
    $('submitBtn').addEventListener('click', event => { event.currentTarget.focus(); submit(); });
    $('runBtn').addEventListener('click', () => runPreview());
    $('findErrorsBtn').addEventListener('click', findErrors);
    $('openPreviewTabBtn').addEventListener('click', () => { if (doc && !busy) { runPreview(); preview.openInNewTab(); } });
    $('toggleLessonBtn').addEventListener('click', event => {
      const collapsed = document.body.classList.toggle('left-collapsed');
      event.currentTarget.setAttribute('aria-pressed', String(collapsed));
      event.currentTarget.textContent = collapsed ? '解説とエディタを並べて表示' : 'エディタを広く表示';
      closeMenus(event.currentTarget); cm.refresh();
    });
    document.querySelectorAll('#paneNav button').forEach(button => button.addEventListener('click', () => setPane(button.dataset.pane)));
    document.addEventListener('click', event => { if (!event.target.closest('.menu-wrap')) closeMenus(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('actionDialog').open) {
        const open = document.querySelector('.menu-wrap[open]');
        if (open) { closeMenus(); open.querySelector('summary').focus(); }
      }
    });
    function positionMenus() {
      document.querySelectorAll('.menu-wrap[open]').forEach(details => {
        details.style.setProperty('--menu-top', (details.querySelector('summary').getBoundingClientRect().bottom + 6) + 'px');
      });
    }
    window.addEventListener('resize', positionMenus);
    try {
      if (!window.JohoUI?.theme) throw Error('theme unavailable');
      window.JohoUI.theme({storageKey:'joho.htmleditor.ui.v1', themeSelect:$('themeSelect'), sizeSelect:$('sizeSelect'), onChange:() => cm.refresh()});
    } catch {
      $('themeSelect').disabled = true; $('sizeSelect').disabled = true; $('displayNotice').hidden = false;
    }
    setupHelp();
    if(window.HTML_LOCAL_V3_CONFIG?.enabled===true) {
      const config=window.HTML_LOCAL_V3_CONFIG,box=document.createElement('section');box.setAttribute('aria-label','HTML実習の本人確認');
      box.className='identity-toolbar';$('toolbar').append(box);
      const status=textNode(box,'学校アカウントの確認状態を読み込んでいます…');status.setAttribute('role','status');status.className='identity-status';
      const warning=document.createElement('section');warning.className='identity-alert';warning.setAttribute('role','alert');
      const warningMessage=textNode(warning,'⚠ 学校アカウントが未確認です。実習ファイルの取得前に本人確認してください。');
      const warningButton=textNode(warning,'学校アカウントを確認する','button');warningButton.type='button';warningButton.className='btn';$('toolbar').after(warning);
      const accountMenu=textNode(box,'','details');accountMenu.className='menu-wrap identity-menu';const accountSummary=textNode(accountMenu,'⚠️未接続','summary');accountSummary.className='btn';const accountActions=textNode(accountMenu,'','div');accountActions.className='menu-dropdown identity-actions';
      const profileInfo=textNode(accountActions,'','div');profileInfo.className='identity-profile';profileInfo.hidden=true;
      const profileName=textNode(profileInfo,''),profileId=textNode(profileInfo,'');
      textNode(profileInfo,'このブラウザで最後に確認したアカウントです。Google側で切り替えた場合は、ここでも確認し直してください。');
      const confirmButton=textNode(accountActions,'学校アカウントを確認する','button');confirmButton.type='button';confirmButton.className='btn';
      const profileButton=textNode(accountActions,'氏名を取得して再確認','button');profileButton.type='button';profileButton.className='btn';profileButton.hidden=true;
      const switchButton=textNode(accountActions,'利用するアカウントを変更','button');switchButton.type='button';switchButton.className='btn';switchButton.hidden=true;
      const renewalButton=textNode(accountActions,'開いている実習ファイルの確認情報を更新','button');renewalButton.type='button';renewalButton.className='btn';
      async function register(switchAccount){
        if(busy || submissionPanel?.needsAttention() || dirty()){notify('未保存の変更を保存し、提出処理を終えてから本人確認してください。');return;}
        if(switchAccount && !window.confirm('本人確認情報を切り替えます。保存済みファイルは変更しません。続けますか？'))return;
        const opener=document.activeElement;
        confirmButton.disabled=profileButton.disabled=switchButton.disabled=warningButton.disabled=true;accountMenu.open=false;status.textContent=switchAccount?'利用するアカウントを確認しています…':'学校アカウントを確認しています…';
        try {await localDownloads.register({switchAccount,safeToSwitch:true});await renderIdentity();}
        catch(e){status.textContent=e.message==='identity_confirmation_canceled'?'本人確認を中止しました。編集内容はそのままです。':e.message==='switch_confirmation_required'?'前回と異なるアカウントです。「学校アカウント」から「利用するアカウントを変更」を選んでください。':'本人確認を完了できませんでした。もう一度確認してください。（'+errorMessage(e)+'）';}
        finally{confirmButton.disabled=profileButton.disabled=switchButton.disabled=warningButton.disabled=false;(opener===warningButton && !warning.hidden ? warningButton : accountSummary).focus();}
      }
      let identityState=null,identityViewRevision=0;
      updateFileIdentity=()=>{
        const mismatch=Boolean(doc && localDownloads?.compareFileIdentity?.(identityState,content())==='mismatch');
        $('fileIdentityWarning').hidden=!mismatch;
      };
      async function renderIdentity(){
        const revision=++identityViewRevision,state=await localDownloads.load(),ready=state.status==='ready';
        if(revision!==identityViewRevision)return;
        identityState=state;
        accountSummary.textContent=ready ? state.displayName || state.label || '確認済み' : '⚠️未接続';
        accountSummary.setAttribute('aria-label',ready?'確認済みの学校アカウント：'+(state.displayName || state.label || ''):'学校アカウント未接続。本人確認する');
        accountSummary.dataset.tip=ready?'確認済みの氏名・ユーザーIDを表示します。アカウントの再確認・変更もできます。':'学校アカウントの本人確認を行います。';
        profileInfo.hidden=!ready;
        profileName.textContent='氏名：'+(state.displayName || '未取得（再確認すると取得できます）');
        profileId.textContent='ユーザーID：'+(state.label || '');
        profileButton.hidden=!ready || Boolean(state.displayName);
        status.textContent=ready?'確認済み':state.status==='expired'?'学校アカウントの確認期限が切れています。':'学校アカウント未確認';
        confirmButton.hidden=ready;switchButton.hidden=!['ready','expired'].includes(state.status);warning.hidden=ready;
        warningMessage.textContent=state.status==='expired'?'⚠ 本人確認の期限が切れています。学校アカウントをもう一度確認してください。':'⚠ 学校アカウントが未確認です。実習ファイルの取得前に本人確認してください。';
        updateFileIdentity();
      }
      function identityReadFailed(){
        identityViewRevision++;identityState=null;accountSummary.textContent='⚠️未接続';accountSummary.setAttribute('aria-label','学校アカウントの確認情報を読み込めません');
        profileInfo.hidden=profileButton.hidden=true;confirmButton.hidden=false;switchButton.hidden=true;
        status.textContent='確認情報を読み込めません。既存のファイルは保持しています。';warning.hidden=false;
        warningMessage.textContent='⚠ 本人確認の状態を読み込めません。ページを開き直してください。既存の実習ファイルは保持しています。';updateFileIdentity();
      }
      async function bridge(ticket,oldToken='') {let response;const controller=new AbortController();try{await modal('学校アカウントの本人確認',(body,button,finish)=>{
        button('閉じる','close');window.HtmlEditorLocalDownloads.confirmationBridge({container:body,dialog:$('actionDialog'),url:config.identityUrl,ticket,oldToken,signal:controller.signal}).then(r=>{response=r;finish('confirmed');}).catch(e=>{if(e.message!=='identity_confirmation_canceled')notify(errorMessage(e));finish('failed');});
      });}finally{controller.abort();}if(!response)throw Error('identity_confirmation_canceled');return response;}
      try {
        localDownloads=window.HtmlEditorLocalDownloads.create({confirm:ticket=>bridge(ticket)});
        confirmButton.addEventListener('click',()=>register(false));warningButton.addEventListener('click',()=>register(false));switchButton.addEventListener('click',()=>register(true));profileButton.addEventListener('click',()=>register(true));
        renewalButton.addEventListener('click',()=>exclusive(async()=>{
          if(submissionPanel?.needsAttention()){notify('提出処理を終えてから確認情報を更新してください。');return;}
          if(!doc)return;const snapshot=content(),proof=Practice.inspect(snapshot);if(proof?.protocolVersion!==3){notify('この実習ファイルは確認情報の更新対象ではありません。');return;}
          const ticket=await localDownloads.cache.beginConfirmation({refreshForFile:true,safeToSwitch:true});
          try {
          const reply=await bridge(ticket,proof.identity),replacement=await localDownloads.renewFile(snapshot,reply);
          if(content()!==snapshot)throw Error('編集中の内容が変わったため更新を止めました。');
          await localDownloads.cache.acceptConfirmation(ticket,{nonce:reply.nonce,token:reply.token,label:reply.label,...('displayName' in reply?{displayName:reply.displayName}:{})});
          const newProof=Practice.inspect(replacement);
          cm.operation(()=>{
            cm.getAllMarks().forEach(mark=>{const at=mark.find();if(at?.from.line===0 && at?.from.ch===0)mark.clear();});
            cm.replaceRange(newProof.marker,{line:0,ch:0},{line:0,ch:proof.marker.length},'+identity-update');
            const label=document.createElement('span');label.className='issued-marker';label.textContent='本人確認・課題情報（編集しない）';
            cm.markText({line:0,ch:0},{line:0,ch:newProof.marker.length},{replacedWith:label,atomic:true,readOnly:true});
          });
          displayState();await renderIdentity();notify('本文を保持して確認情報を更新しました。「保存」でMacの実習ファイルへ保存してください。');
          }catch(error){localDownloads.cache.cancelConfirmation();throw error;}
        }));
        renderIdentity().catch(identityReadFailed);
        // Reads local data only; another tab's change never triggers Google authentication.
        window.addEventListener('focus',()=>renderIdentity().catch(identityReadFailed));
        accountMenu.addEventListener('toggle',()=>{if(accountMenu.open)renderIdentity().catch(identityReadFailed);});
      }catch(e){status.textContent='新方式を準備できませんでした。既存の配付を利用してください。';warningMessage.textContent='⚠ 本人確認を準備できません。ページを開き直し、同じ表示が続く場合は授業担当者に知らせてください。';warningButton.disabled=true;localDownloads=null;}
    }
    // Include the dynamically created account menu in positioning and exclusive opening.
    document.querySelectorAll('.menu-wrap').forEach(details => details.addEventListener('toggle', () => {
      if (details.open) { document.querySelectorAll('.menu-wrap').forEach(other => { if (other !== details) other.open = false; }); positionMenus(); }
    }));
    document.querySelectorAll('[data-menu-hint]').forEach(node => { const label = node.textContent; node.replaceChildren(); menuHint(node, node.dataset.menuHint, label); });
    try { window.JohoUI?.tooltip({keyboard:true}); } catch { /* 説明が使えなくても編集は継続。 */ }
    initSplitters();
    window.addEventListener('beforeunload', event => { autoSave(); if (dirty() || submissionPanel?.needsAttention()) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('pagehide', autoSave);
    if (!window.HtmlEditorStartup.ready()) return;
    requestAnimationFrame(() => cm.refresh());
    restoreFolderConnection();
  }
  window.addEventListener('DOMContentLoaded', () => {
    try { init(); }
    catch (error) { console.error('HTMLエディタの初期化に失敗しました。', error); window.HtmlEditorStartup?.fail(); }
  });
})();
