/* フローチャートの既存操作を共通UIへ接続する。外部通信・文書保存は行わない。 */
(() => {
  'use strict';
  const VERSION = '2026.11.20';
  const $ = id => document.getElementById(id);
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  const aliases = {
    hand: 'pan', trash: 'delete',
    alignLeft: 'align-left', alignCenter: 'align-center', alignRight: 'align-right',
    alignTop: 'align-top', alignMiddle: 'align-middle', alignBottom: 'align-bottom'
  };
  function applyIcons() {
    if (!window.JohoIcons) return;
    document.querySelectorAll('[data-icon]').forEach(host => {
      const id = aliases[host.dataset.icon] || host.dataset.icon;
      if (!JohoIcons.has(id) || host.querySelector('svg')?.dataset.johoIcon === id) return;
      host.replaceChildren(JohoIcons.create(id, { className: 'ui-icon' }));
    });
    const controls = {
      'help-button': 'help', 'zoom-in': 'zoom-in', 'zoom-out': 'zoom-out',
      'trace-start': 'play', 'trace-restart': 'restart', 'trace-stop': 'stop'
    };
    for (const [id, icon] of Object.entries(controls)) {
      const button = $(id);
      if (!button || button.querySelector('[data-joho-icon]')) continue;
      if (id === 'help-button' || id.startsWith('zoom-')) button.replaceChildren(JohoIcons.create(icon));
      else button.prepend(JohoIcons.create(icon));
    }
    const lock = $('lock-button')?.querySelector('[data-icon]');
    if (lock) {
      const id = $('lock-button').getAttribute('aria-pressed') === 'true' ? 'unlock' : 'lock';
      if (lock.querySelector('svg')?.dataset.johoIcon !== id) lock.replaceChildren(JohoIcons.create(id, { className: 'ui-icon' }));
    }
  }
  const topics = [
    ['op-place', '部品を置く・選ぶ', ['左の部品を選び、作図画面をクリックします。', '複数選択はShift＋クリック、または空白からの範囲選択を使います。']],
    ['op-text', '文字を編集する', ['部品をダブルクリックするか、選んでEnterを押します。', 'Enterで改行、⌘/Ctrl＋Enterで確定、Escapeで取り消します。']],
    ['op-connect', '図形をつなぐ', ['線の種類を選び、図形の端の○から相手へドラッグします。', '○と接続先を順にクリックするか、「接続先を選ぶ」も使えます。']],
    ['op-route', '線の経路を直す', ['線を選び、端の○で接続先、中央の◇で経路を調整します。', '直角の線は「形」→「折れ曲がり点を編集…」で点を編集できます。']],
    ['op-activity', '担当領域を編集する', ['アクティビティ図で「編集対象」を「担当領域」にします。', '領域の追加・名前・幅・順番を調整し、図形の編集時は「図形・線」に戻します。']],
    ['op-save-browser', '保存・読み込み', ['「ファイル・保存と読み込み」で「ブラウザに保存」または「ファイルに保存…」を選びます。', '保存候補は「ブラウザから開く…」、手元の図は「ファイルから開く…」から選びます。', '自動保存と明示保存は別です。大切な図は再編集用ファイルでも残してください。']],
    ['op-format', '文字の位置・書式・色', ['部品を選び、「書式」で文字の大きさ・揃え・余白を指定します。', '「色」で塗り・線色・文字色を選んで適用します。']],
    ['op-align', '位置やつながり順を整える', ['移動時の吸着は上部の「操作」で選びます。', 'つながった図形を選び、「整列」→「つながり順に自動配置」を開きます。', '現在と適用後を見比べてから適用します。']],
    ['op-transitions', '状態遷移の矢印を整える', ['状態間の矢印を選び、「形」→「遷移の矢印・ラベルを調整…」を開きます。', '間隔・自己ループ・ラベル位置を選び、プレビューを見て適用します。']],
    ['op-insert', '途中へ処理を入れる', ['「処理」を選んで線をクリックするか、線を選んで「処理を挿入」を押します。', '追加した処理の文字と、前後の接続を確認します。']],
    ['op-flow-branch', '分岐セットを置く', ['フローチャートの「分岐セット」を選び、作図画面へ置きます。', '条件や処理の文字をダブルクリックして書き換えます。']],
    ['op-shape', '図形や矢印の形を変える', ['部品を選び、「形」を開きます。', '「図形の形」「矢印の形」「矢じり」から変更します。']],
    ['op-match-size', '大きさをそろえる', ['図形を2つ以上選び、「編集」→「大きさをそろえる…」を開きます。', '基準の図形と、そろえる幅・高さを指定します。']],
    ['op-copy-style', '書式を使い回す', ['元の部品を選び、「編集」→「書式をコピー」を押します。', '複数選択時はコピー元を選び、「コピーする」を押します。', '相手を選んで「書式を貼り付け」を押します。']],
    ['op-stacking', '重なりを編集する', ['部品を選び、「重なり」から前後の順番を変更します。', '背後の部品は「重なった部品を選ぶ」の候補から選べます。']],
    ['op-group', 'グループ・固定', ['複数の部品を選び、「編集」→「グループ化」でまとめます。', '自分の図を固定・解除する場合は「固定」「固定を解除」を使います。課題の固定は教員へ確認してください。']],
    ['op-parts', 'マイ部品を使う', ['部品を選び、「編集」→「部品セットとして登録…」で登録します。', '「マイ部品」で選び、「配置する」の後に位置をクリックします。', '一覧の保存は、図全体の保存とは別に行います。']],
    ['op-export-image', '画像をコピー・保存する', ['右の「書き出し」で図全体・選択部分を選びます。', 'プレビュー、PNGの寸法、余白、透明背景を確認します。', '「画像をコピー」「PNGを保存」「SVGを保存」から選びます。']],
    ['op-print', '印刷する', ['「印刷…」でA4・B5（JIS）と縦・横を選びます。', '問題文・氏名欄、図の寸法と配置をプレビューで確認します。', '「印刷する…」からブラウザの印刷画面へ進みます。']],
    ['op-trace', '経路を手動でたどる', ['右の「トレース」で開始する図形を選びます。', '矢印の候補を自分で選び、経路を確認します。', '「トレースを終了」またはEscapeで編集へ戻ります。']],
    ['op-inspect', '図を点検する', ['右の「点検」で空欄や未接続などの候補を読みます。', '候補を選び、課題や図の意図に合わせて見直します。点数や正誤判定ではありません。']],
    ['op-display', '表示を変える', ['表示倍率は下部の倍率欄や全体表示で変えます。', 'テーマと操作部の文字サイズは「表示設定」で選びます。']],
    ['op-edit-history', 'キーボード操作', ['作図画面にフォーカスして操作します。入力欄やヘルプ内のキー操作とは区別します。', '通常のコピーは再編集する部品用です。ほかのアプリへ画像を貼る場合は「画像をコピー」を使います。']]
  ];
  const paragraphTopics = {
    '文字の位置を調整する': 'op-format', 'つながり順に並べる': 'op-align',
    '状態遷移を整える': 'op-transitions', '担当ごとに作図する': 'op-activity',
    'マイ部品を整理する': 'op-parts', '位置をそろえる': 'op-align',
    '画像を使う': 'op-export-image', '途中に処理を入れる': 'op-insert',
    '分岐をまとめて作る': 'op-flow-branch', '形を変える': 'op-shape',
    '大きさをそろえる': 'op-match-size', '書式を使い回す': 'op-copy-style',
    '操作を選ぶ': 'op-place', '色を選ぶ': 'op-format',
    '重なりを編集する': 'op-stacking', 'まとめる・固定する': 'op-group',
    '手動トレース': 'op-trace', '部品セットを使う': 'op-parts',
    '出力の大きさ': 'op-export-image', '経路を整える': 'op-route',
    '図の点検': 'op-inspect', '保存内容を選ぶ': 'op-save-browser', '印刷': 'op-print'
  };
  function createHelp(options) {
    if (!window.JohoToolHelp) return null;
    const fallback = $('help-dialog'), source = fallback.querySelector('.help');
    const root = document.createElement('aside'); root.id = 'operation-help'; root.hidden = true;
    const sections = new Map();
    for (const [id, title, steps] of topics) {
      const section = document.createElement('section'); section.dataset.helpTopic = id; section.dataset.helpTitle = title;
      const h = document.createElement('h3'); h.textContent = title;
      const summary = document.createElement('ol'); summary.className = 'help-summary';
      steps.forEach(text => { const li = document.createElement('li'); li.textContent = text; summary.append(li); });
      const details = document.createElement('details'), label = document.createElement('summary'); label.textContent = '補足・注意';
      details.append(label); section.append(h, summary, details); root.append(section); sections.set(id, details);
    }
    const basics = ['op-place','op-text','op-connect','op-route','op-activity','op-save-browser'];
    [...source.querySelector(':scope > ol').children].forEach((li, index) => {
      const list = document.createElement('ol'); list.append(li.cloneNode(true)); sections.get(basics[index])?.append(list);
    });
    source.querySelectorAll(':scope > p').forEach(p => {
      if (p.hasAttribute('data-lesson-help')) return;
      const label = p.querySelector('strong')?.textContent.replace(/：$/, '');
      const id = paragraphTopics[label] || (p.textContent.includes('吸着') ? 'op-align' : p.textContent.includes('ダークモード') ? 'op-display' : 'op-edit-history');
      sections.get(id).append(p.cloneNode(true));
    });
    sections.get('op-edit-history').append(source.querySelector('table').cloneNode(true));
    const about = document.createElement('section'); about.dataset.helpTopic = 'about'; about.dataset.helpTitle = 'このアプリについて';
    const heading = document.createElement('h3'); heading.textContent = 'このアプリについて'; about.append(heading);
    for (const text of [
      'フローチャートエディタ　バージョン ' + VERSION,
      '海城中学高等学校 情報科',
      '推奨環境はmacOSのGoogle Chromeです。ログインは不要です。',
      '図はブラウザ内または利用者が選んだファイルへ保存します。図や問題文を外部サーバーへ送って保存・提出する機能はありません。',
      '点検は見直し候補、トレースは手動の経路確認です。正誤や提出の完了を判定する機能ではありません。',
      'Copyright © 2026 Kaijo Junior and Senior High School. All Rights Reserved.'
    ]) { const p = document.createElement('p'); p.textContent = text; about.append(p); }
    root.append(about); document.body.append(root);
    const oldHandler = $('help-button').onclick; $('help-button').onclick = null;
    try {
      const help = JohoToolHelp.create({
        root, opener: $('help-button'), title: 'フローチャートの使い方',
        storageKey: 'joho.flowchart.help.v1',
        bounds: () => ({ top: document.querySelector('.top').getBoundingClientRect().bottom + 8, bottom: $('stage').getBoundingClientRect().bottom - 8 }),
        initialRight: () => $('stage').getBoundingClientRect().right - 12,
        isBusy: options.helpBusy || options.busy, returnToEditor: () => $('canvas').focus({ preventScroll: true })
      });
      fallback.remove();
      return help;
    } catch {
      root.remove(); $('help-button').onclick = oldHandler;
      return null;
    }
  }
  function create(options) {
    let menu = null, help = null, tooltip = null;
    if (window.JohoFileMenu) {
      const host = $('file-menu'), titleInput = $('document-title'), note = $('save-shortcut'), print = $('print-button');
      const original = [...host.childNodes];
      try {
        menu = JohoFileMenu.mount(host, {
          busy: options.busy,
          onAction: (id, opener) => {
            if (id === 'rename') { openRename(opener); return; }
            options.actions[id]?.(opener);
          }
        });
        const ids = { new:'new-file', rename:'rename-file', save:'save-current', browserSave:'save-browser', fileSave:'save-file', browserOpen:'open-file', fileOpen:'open-local-file', auto:'autosave-settings' };
        for (const [action, id] of Object.entries(ids)) host.querySelector('[data-file-action="' + action + '"]').id = id;
        menu.summary.dataset.tip = 'ファイル・保存と読み込み';
        const panel = host.querySelector('.joho-file-menu__items');
        print.setAttribute('role', 'menuitem');
        const hr = document.createElement('hr'); panel.append(hr, print, note);
        // 共通8項目のキー操作へ、アプリ固有の印刷項目の境界だけを接続する。
        host.addEventListener('keydown', event => {
          const items = [...panel.querySelectorAll('button[role=menuitem]')].filter(button => !button.disabled);
          const first = items[0], previous = items.at(-2);
          let target = null;
          if (event.key === 'End' || event.key === 'ArrowUp' && event.target === first || event.key === 'ArrowDown' && event.target === previous) target = print;
          else if (event.target === print && event.key === 'ArrowUp') target = previous;
          else if (event.target === print && event.key === 'ArrowDown') target = first;
          if (!target) return;
          event.preventDefault(); event.stopImmediatePropagation(); host.open = true; target.focus();
        }, true);
        const dialog = document.createElement('dialog'); dialog.id = 'rename-dialog'; dialog.className = 'format-dialog';
        const form = document.createElement('form'); form.id = 'rename-form';
        const h = document.createElement('h2'); h.id = 'rename-title'; h.textContent = '名前を変更'; dialog.setAttribute('aria-labelledby', h.id);
        const label = document.createElement('label'); label.className = 'stack'; label.append(document.createTextNode('図の名前'), titleInput);
        titleInput.onchange = null; titleInput.required = true;
        titleInput.addEventListener('input', () => titleInput.setCustomValidity(''));
        const actions = document.createElement('div'); actions.className = 'dialog-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'キャンセル'; cancel.onclick = () => dialog.close();
        const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'primary'; submit.textContent = '変更する';
        actions.append(cancel, submit); form.append(h, label, actions); dialog.append(form); document.body.append(dialog);
        let renameId = null;
        function openRename(opener) {
          options.finishText(); renameId = options.getDocument().id;
          titleInput.value = options.getDocument().title; titleInput.setCustomValidity('');
          options.openDialog(dialog, opener); titleInput.focus(); titleInput.select();
        }
        form.onsubmit = event => {
          event.preventDefault(); const title = titleInput.value.trim();
          if (!title) { titleInput.setCustomValidity('図の名前を入力してください。'); titleInput.reportValidity(); return; }
          if (options.getDocument().id !== renameId) { dialog.close(); return; }
          options.rename(title); dialog.close();
        };
      } catch {
        host.replaceChildren(...original); menu = null;
      }
    }
    try { help = createHelp(options); } catch { /* 従来のヘルプを残す。 */ }
    const paletteButton = $('palette-toggle'), palette = $('parts-palette');
    paletteButton.onclick = () => {
      palette.hidden = !palette.hidden;
      $('app').dataset.paletteCollapsed = String(palette.hidden);
      paletteButton.setAttribute('aria-expanded', String(!palette.hidden));
      paletteButton.setAttribute('aria-label', palette.hidden ? '部品パレットを開く' : '部品パレットを閉じる');
      paletteButton.dataset.tip = paletteButton.getAttribute('aria-label');
      options.layout(); help?.refresh();
    };
    paletteButton.hidden = false;
    try { if (window.JohoIcons) {
      const select = $('theme'), label = select.closest('label'), group = document.createElement('div');
      group.className = 'theme-options'; group.setAttribute('role','group'); group.setAttribute('aria-label','テーマ');
      for (const [value, name] of [['auto','自動'],['light','ライト'],['dark','ダーク']]) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.themeChoice = value;
        button.setAttribute('aria-label','テーマ：' + name); button.dataset.tip = 'テーマ：' + name;
        button.append(JohoIcons.create('theme-' + value));
        button.onclick = () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles:true })); };
        group.append(button);
      }
      label.append(group); select.hidden = true;
    } } catch {
      $('theme').closest('label').querySelector('.theme-options')?.remove();
      $('theme').hidden = false;
    }
    try { tooltip = window.JohoUI?.tooltip({ keyboard:true }); } catch { /* 保存や編集とは独立。 */ }
    document.querySelectorAll('button[aria-label],summary[aria-label]').forEach(button => {
      if (!button.dataset.tip && !button.title) button.dataset.tip = button.getAttribute('aria-label');
    });
    const update = ({ blocked = false, autosaving = false } = {}) => {
      try { menu?.update({ autosaving }); } catch { /* 補助描画の失敗で編集を止めない。 */ }
      for (const id of ['new-file','rename-file','open-file','open-local-file','autosave-settings']) if ($(id)) $(id).disabled = blocked;
      document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === $('theme').value)));
      try { applyIcons(); } catch { /* 元の図柄と操作名を残す。 */ }
    };
    update();
    return Object.freeze({
      update, help, menu, version: VERSION, modifier,
      contains: target => !!help?.root.contains(target),
      refresh: () => help?.refresh(),
      hideTooltip: () => tooltip?.hide()
    });
  }
  window.FlowchartUI = Object.freeze({ create, applyIcons, version: VERSION, modifier });
})();
