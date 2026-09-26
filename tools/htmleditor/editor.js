/* ローカルHTML/CSSの編集。認証と採点は配付・提出サーバーの責務。 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Practice = window.HtmlPracticeEditor;
  const Workflow = window.HtmlEditorWorkflow;
  const catalog = Practice.lessons(window.HtmlLessons.LESSONS);
  let cm, fs, preview, recovery, doc, selectedLesson, navigation, busy = false, replacing = false;
  let autoTimer, toastTimer;
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
    $('fileListBtn').disabled = !fs.getFileList().length || busy;
    $('disconnectBtn').disabled = !fs.getFileList().length && !fs.isConnected() || busy;
    $('folderStatusText').textContent = fs.isConnected() ? '保存先フォルダ：' + fs.getDirectoryName() :
      fs.getFileList().length ? '読み取り専用：保存はダウンロードで行います。' : 'フォルダ未接続';
    $('folderAlert').hidden = fs.isConnected();
    $('folderAlertMessage').textContent = fs.isSupported() ?
      '上書き保存や画像・リンクの確認には、実習フォルダを接続してください。' :
      'このブラウザでは上書き保存できません。「保存」でダウンロードしてください。画像の確認にはフォルダ全体を読み込みます。';
    updateSubmission();
  }
  const catalogState = () => window.HtmlEditorStartup.catalogState();
  function submissionState() { return doc ? Workflow.submission(window.pages, doc.fileName, content(), window.htmlPracticeLinks, catalogState()) :
    {ready:false, message:'配付された本人用HTMLを開くと、提出条件を確認できます。'}; }
  function updateSubmission() {
    const state = submissionState();
    $('submissionState').textContent = state.message;
    $('submitBtn').classList.toggle('success', state.ready);
    $('submitBtn').dataset.available = String(state.ready);
    $('submitLabel').textContent = state.ready ? '提出' : '提出条件';
    $('submitBtn').setAttribute('aria-label', state.ready ? '学校の課題を提出する' : '学校の課題の提出条件を確認');
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
    replacing = true;
    const task = Practice.taskForFile(fileName);
    doc = {docId:crypto.randomUUID(), fileName, lessonId:task ? task.slice(0,6) : options.lessonId || selectedLesson.id,
      binding:options.binding || null, diskContent:options.diskContent ?? text,
      savedContent:options.restored ? null : text, hasWork:Boolean(options.hasWork),
      saveMessage:options.message || 'ファイルを開きました。'};
    cm.setOption('mode', /\.css$/i.test(fileName) ? 'css' : 'htmlmixed');
    cm.setValue(text);
    try {
      const proof = Practice.inspect(content());
      if (proof) {
        const start = content().indexOf(proof.marker), label = document.createElement('span');
        label.className = 'issued-marker'; label.textContent = '本人用の配付情報（編集しない）';
        cm.markText(cm.posFromIndex(start), cm.posFromIndex(start + proof.marker.length),
          {replacedWith:label, atomic:true, readOnly:true});
      }
    } catch { /* 不正な配付情報でも本文は保持。提出時に案内する。 */ }
    cm.clearHistory();
    if (!options.restored) doc.savedContent = content();
    replacing = false; displayState(); runPreview();
    requestAnimationFrame(() => cm.refresh());
    if (doc.hasWork) autoSave();
  }
  async function exclusive(action) {
    if (busy || $('actionDialog').open) return;
    busy = true; cm.setOption('readOnly', true); $('app').setAttribute('aria-busy', 'true'); displayState();
    try { await action(); }
    catch (error) { if (error.name !== 'AbortError') notify(errorMessage(error)); }
    finally { busy = false; cm.setOption('readOnly', doc ? false : 'nocursor'); $('app').removeAttribute('aria-busy'); displayState(); }
  }
  function textNode(parent, text, tag = 'p') {
    const node = document.createElement(tag); node.textContent = text; parent.append(node); return node;
  }
  function modal(title, build) {
    const dialog = $('actionDialog'), opener = document.activeElement;
    if (dialog.open) throw Error('開いている確認画面を閉じてください。');
    $('actionTitle').textContent = title; $('actionBody').replaceChildren(); $('actionButtons').replaceChildren();
    $('actionError').hidden = true;
    return new Promise(resolve => {
      let settled = false;
      function finish(value) {
        if (settled) return;
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
    });
  }
  async function allowReplace() {
    if (!dirty()) return true;
    autoSave();
    const result = await modal('開いている内容を切り替えますか？', (body, button) => {
      textNode(body, doc.fileName + ' に未保存の変更があります。切り替える前にMacへ保存してください。');
      button('保存して開く', 'save');
      button('保存せずに開く', 'discard');
      button('キャンセル', 'cancel');
    });
    if (result === 'discard') return true;
    if (result !== 'save') return false;
    if (fs.isConnected()) return saveToFile(doc.binding !== fs.dirHandle);
    download();
    // ダウンロードの完了はブラウザから検証できない。本人の確認までは切り替えない。
    return await modal('保存したファイルを確認', (body, button) => {
      textNode(body, 'ダウンロードした ' + doc.fileName + ' の保存先と内容を確認してください。元のファイルへの上書き保存ではありません。');
      button('保存を確認して開く', 'confirmed');
      button('キャンセル', 'cancel');
    }) === 'confirmed';
  }
  function setLesson(id, taskId = '', hash = '') {
    navigation.navigate({lessonId:id, taskId, hash});
  }
  function renderLesson({lessonId:id, taskId, hash}) {
    selectedLesson = catalog.find(row => row.id === id) || catalog[1];
    $('lessonSelect').value = selectedLesson.id;
    $('readingLessonSelect').value = selectedLesson.id;
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
    const link = $('personalLink');
    const state = Workflow.distribution(window.pages, $('taskSelect').value, window.htmlPracticeLinks, catalogState());
    const item = state.item;
    link.hidden = !item; link.removeAttribute('href');
    if (item) link.href = item.url;
    $('distributionState').textContent = state.message;
    $('distributionState').dataset.state = state.kind;
    updateSubmission();
  }
  function runPreview() {
    if (!doc) return;
    if (/\.css$/i.test(doc.fileName)) {
      $('previewNotice').textContent = 'CSSは保存してから、参照しているHTMLを開いて確認します。';
      $('previewNotice').hidden = false; preview.update('', doc.fileName); return;
    }
    preview.update(content(), doc.fileName);
  }
  function safeRelativeLink(href, base) {
    if (/^[a-z][a-z0-9+.-]*:|^\/|\\|[\u0000-\u001f\u007f]|%(?:2f|5c|00)/i.test(href)) return null;
    try {
      const [relative] = href.split('#');
      if (relative.includes('?')) return null;
      const parts = base.split('/').slice(0, -1);
      for (const part of decodeURIComponent(relative).split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { if (!parts.length) return null; parts.pop(); }
        else parts.push(part);
      }
      const path = parts.join('/');
      return editable(path) && fs.fileEntries.has(path) ? path : null;
    } catch { return null; }
  }
  async function loadFile(path) {
    const value = await fs.readFile(path); // 読取失敗は現在の文書に触れない。
    if (!await allowReplace()) return;
    autoSave();
    replaceDocument(value, path, {binding:fs.isConnected() ? fs.dirHandle : null, diskContent:value, hasWork:true});
    if (Practice.taskForFile(path)) setLesson(doc.lessonId, Practice.taskForFile(path));
    setPane('center');
  }
  async function fileList() {
    const files = fs.getFileList();
    const selected = await modal('読み込んだファイル', (body, button, finish) => {
      if (!files.length) textNode(body, 'まず「ファイルを開く」または「フォルダを開く」で読み込んでください。');
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
      if (doc) doc.binding = null; // 同名ファイルが別フォルダにあっても自動上書きしない。
      displayState(); runPreview();
      notify('フォルダを読み込みました。編集内容は保持しています。開くファイルを選んでください。');
      await fileList();
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
          fs.disconnect(); fs = staged; preview.fs = fs; if (doc) doc.binding = null;
          displayState(); runPreview(); await fileList();
        }
      } catch (error) { if (fs !== staged) staged.disconnect(); throw error; }
    });
  }
  async function saveToFile(explicit = false) {
    if (!doc) return false;
    if (!fs.isConnected()) throw Error('書き込み可能なフォルダを接続してください。このブラウザではダウンロードで保存することもできます。');
    if (doc.binding !== fs.dirHandle && !explicit) throw Error('保存先を確認できません。ファイルから開き直すか、保存先フォルダを確認してください。');
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
      else download();
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
    const choice = await modal('ブラウザの控えから復旧', (body, button, finish) => {
      textNode(body, '日時とファイル名を確認して選んでください。選ばなかった控えは削除しません。');
      if (!result.items.length) textNode(body, '復元できる控えがありません。');
      if (result.errors.length) textNode(body, '読み取れない控えが ' + result.errors.length + ' 件あります。元データは保持しています。');
      result.items.forEach(item => {
        const label = (item.kind === 'auto' ? '自動保存' : '明示保存') + ' / ' + item.fileName + ' / ' +
          new Date(item.savedAt).toLocaleString('ja-JP') + (item.destination === 'file' ? ' / ファイル保存時の控え' : '');
        const node = textNode(body, label, 'button'); node.type = 'button'; node.className = 'btn file-entry';
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
      let savedToFile = false;
      if (doc.binding && doc.binding === fs.dirHandle) {
        savedToFile = await saveToFile();
        if (!savedToFile) return;
      }
      await modal('HTMLを保存して提出へ', (body, button) => {
        textNode(body, receipt.fileName);
        textNode(body, 'まだ提出は完了していません。提出画面でこのHTMLを選択して送信し、受領と★を確認してください。');
        let downloaded = false;
        const down = textNode(body, 'HTMLをダウンロード', 'button'); down.type = 'button'; down.className = 'btn'; down.id = 'submitDownload';
        const label = document.createElement('label'); label.className = 'confirm-download';
        const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'downloadConfirmed';
        label.append(check, document.createTextNode('保存したファイル名と保存先を確認しました。')); body.append(label);
        const link = textNode(body, '提出画面を開く', 'a'); link.className = 'btn primary'; link.id = 'submissionLink';
        link.href = fixed.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.hidden = !savedToFile;
        if (savedToFile) textNode(body, 'Macのファイルへの保存を確認しました。');
        function unchanged() {
          try {
            return catalogState() === 'ready' && doc.docId === fixed.docId && doc.fileName === fixed.fileName && content() === fixed.source &&
              Practice.submission(window.pages, doc.fileName, content(), window.htmlPracticeLinks).url === fixed.url;
          } catch { return false; }
        }
        down.addEventListener('click', () => {
          if (!unchanged()) { notify('内容または提出先が変わりました。確認画面を閉じて、もう一度提出を準備してください。'); return; }
          download(fixed.source, fixed.fileName); downloaded = true; check.checked = false; link.hidden = !savedToFile;
        });
        check.addEventListener('change', () => { link.hidden = !savedToFile && !(downloaded && check.checked); });
        link.addEventListener('click', event => {
          if (!unchanged() || !(savedToFile || downloaded && check.checked)) {
            event.preventDefault(); link.hidden = true;
            $('actionError').textContent = '内容または提出先が変わりました。確認画面を閉じて保存し直してください。'; $('actionError').hidden = false;
          }
        });
        button('閉じる', 'close');
      });
    });
  }
  function setPane(name) {
    document.body.dataset.pane = name;
    document.querySelectorAll('[data-pane]').forEach(node => { if (node.tagName === 'BUTTON') node.setAttribute('aria-pressed', String(node.dataset.pane === name)); });
    if (name === 'left') document.body.classList.remove('left-collapsed');
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
      autoSave(); fs.disconnect(); if (doc) doc.binding = null;
      displayState(); runPreview();
      notify('フォルダの接続を解除しました。編集中の内容は保持しています。');
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
    preview = new window.HtmlPreview({iframe:$('previewIframe'), fs,
      onNotice:message => { if (/\.css$/i.test(doc?.fileName || '')) return; $('previewNotice').textContent = message; $('previewNotice').hidden = !message; },
      onNavigate:href => exclusive(async () => {
        if (!doc) return;
        const path = safeRelativeLink(href, doc.fileName);
        if (!path) throw Error('リンク先を読み込んだフォルダ内で見つけられません。パスを確認してください。');
        await loadFile(path);
      })});
    cm = CodeMirror.fromTextArea($('codeEditor'), {
      mode:'htmlmixed', lineNumbers:true, autoCloseTags:false, smartIndent:false, electricChars:false,
      indentUnit:2, tabSize:2, lineWrapping:true, readOnly:'nocursor',
      extraKeys:{Tab:editor => { if (doc && !busy) editor.replaceSelection('  ', 'end', '+input'); },
        Enter:editor => { if (doc && !busy) editor.replaceSelection('\n', 'end', '+input'); },
        'Cmd-S':save, 'Ctrl-S':save, 'Cmd-O':() => $('fileInput').click(), 'Ctrl-O':() => $('fileInput').click(),
        'Cmd-Enter':runPreview, 'Ctrl-Enter':runPreview}
    });
    for (const lesson of catalog) {
      for (const id of ['lessonSelect','readingLessonSelect']) {
        const option = document.createElement('option'); option.value = lesson.id; option.textContent = lesson.title; $(id).append(option);
      }
    }
    navigation = window.HtmlEditorNavigationMount({iframe:$('lessonIframe'), onSelect:renderLesson, onError:notify});
    // 起動時は空のまま。ローカルファイルも復旧候補も自動では開かない。
    displayState();
    cm.on('change', () => {
      if (replacing || !doc) return;
      doc.hasWork = true; displayState(); clearTimeout(autoTimer); autoTimer = setTimeout(autoSave, 500);
    });
    $('lessonSelect').addEventListener('change', event => setLesson(event.target.value));
    $('readingLessonSelect').addEventListener('change', event => setLesson(event.target.value));
    $('taskSelect').addEventListener('change', () => navigation.navigate({...navigation.selection, taskId:$('taskSelect').value}));
    $('personalLink').addEventListener('click', event => {
      const item = Workflow.distribution(window.pages, $('taskSelect').value, window.htmlPracticeLinks, catalogState()).item;
      if (!item || item.url !== event.currentTarget.href) { event.preventDefault(); updateDistribution(); notify('配付設定が変わりました。もう一度確認してください。'); }
    });
    document.addEventListener('pages:ready', updateDistribution);
    document.addEventListener('html-editor:catalog-change', updateDistribution);
    for (const id of ['openFilesBtn','practiceOpenBtn']) $(id).addEventListener('click', event => { if (!busy) { closeMenus(event.currentTarget); $('fileInput').click(); } });
    $('fileInput').addEventListener('change', () => importSelection($('fileInput'), false));
    $('directoryInput').addEventListener('change', () => importSelection($('directoryInput'), true));
    for (const id of ['openFolderBtn','connectFolderBtn','settingsFolderBtn']) $(id).addEventListener('click', event => {
      closeMenus(event.currentTarget); if (!busy) openFolder();
    });
    $('disconnectBtn').addEventListener('click', event => { closeMenus(event.currentTarget); disconnectFolder(); });
    $('fileListBtn').addEventListener('click', event => { closeMenus(event.currentTarget); exclusive(fileList); });
    $('saveBtn').addEventListener('click', save);
    $('folderSaveBtn').addEventListener('click', event => { closeMenus(event.currentTarget); exclusive(() => saveToFile(true)); });
    $('downloadBtn').addEventListener('click', event => { closeMenus(event.currentTarget); if (!busy) download(); });
    $('restoreBtn').addEventListener('click', event => { closeMenus(event.currentTarget); exclusive(() => restore()); });
    $('submitBtn').addEventListener('click', event => { event.currentTarget.focus(); submit(); });
    $('runBtn').addEventListener('click', runPreview);
    $('openPreviewTabBtn').addEventListener('click', () => { if (doc && !busy) { runPreview(); preview.openInNewTab(); } });
    for (const id of ['collapseLeftBtn','expandLeftBtn']) $(id).addEventListener('click', () => {
      document.body.classList.toggle('left-collapsed'); cm.refresh();
    });
    document.querySelectorAll('#paneNav button').forEach(button => button.addEventListener('click', () => setPane(button.dataset.pane)));
    document.addEventListener('click', event => { if (!event.target.closest('.menu-wrap')) closeMenus(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('actionDialog').open) {
        const open = document.querySelector('.menu-wrap[open]');
        if (open) { closeMenus(); open.querySelector('summary').focus(); }
      }
    });
    document.querySelectorAll('.menu-wrap').forEach(details => details.addEventListener('toggle', () => {
      if (details.open) document.querySelectorAll('.menu-wrap').forEach(other => { if (other !== details) other.open = false; });
    }));
    try {
      if (!window.JohoUI?.theme) throw Error('theme unavailable');
      window.JohoUI.theme({storageKey:'joho.htmleditor.ui.v1', themeSelect:$('themeSelect'), sizeSelect:$('sizeSelect'), onChange:() => cm.refresh()});
    } catch {
      $('themeSelect').disabled = true; $('sizeSelect').disabled = true; $('displayNotice').hidden = false;
    }
    setupHelp();
    initSplitters();
    window.addEventListener('beforeunload', event => { autoSave(); if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('pagehide', autoSave);
    if (!window.HtmlEditorStartup.ready()) return;
    requestAnimationFrame(() => cm.refresh());
  }
  window.addEventListener('DOMContentLoaded', () => {
    try { init(); }
    catch { window.HtmlEditorStartup?.fail(); }
  });
})();
