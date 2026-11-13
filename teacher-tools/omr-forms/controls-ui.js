/* Presentation only. Shared icon/tooltip distributions are pinned by the build. */
(function(){
 'use strict';
 var icons=window.JohoIcons,ui=window.JohoUI;if(!icons||!ui)return;
 var mac=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent),mod=mac?'⌘':'Ctrl+',shift=mac?'⇧':'Shift+';
 var controls={
  'file-menu-button':['file','ファイル・保存と読み込み'],
  'new-document':['new','新しい用紙を作成する…'],
  'duplicate-document':['duplicate','現在の用紙を別の用紙として複製する'],
  'save-browser':['save','下書きをこのブラウザに保存する（'+mod+'S）'],
  'save':['save','再編集用のバックアップをPCに保存する…'],
  'cloud-save-menu':['save','版を確定し、クラウド保存・QR発行・読み取り設定登録へ進む…'],
  'browser-recoveries':['open','このブラウザの下書き・自動保存を選んで開く…'],
  'load':['open','PCの再編集用バックアップを開く（'+mod+'O）…'],
  'cloud-list':['open','クラウドの確定済みの版を選んで開く…'],
  'registered-pdf':['export','確定済みの版のPDFをPCへ出力する'],
  'undo':['undo','元に戻す（'+mod+'Z）','元に戻す'],
  'redo':['redo','やり直し（'+mod+shift+'Z）','やり直し'],
  'palette-toggle':['new','部品を追加するパレットを開閉する'],
  'settings-button':['settings','表示テーマ・操作部の文字サイズなどの設定を開く','設定'],
  'help-button':['help','OMR用紙エディタの使い方を開く','ヘルプ'],
  'rename-document':['rename','この用紙の名前を変更する…'],
  'close-document':['close','このタブを閉じる…（ブラウザ内の保存データは残ります）'],
  'settings-close':['close','設定を閉じる'],
  'help-close':['close','ヘルプを閉じる'],
  'connection-close':['close','ログイン確認画面を閉じる'],
  'connection-retry':['refresh','Googleログイン状態を再確認する'],
  'add-option':['new','選択肢を追加する'],
  'mark-add-option':['new','編集中の一覧に選択肢を追加する'],
  'add-page':['new','ページを追加する'],
  'delete':['delete','選択した部品を削除する（元に戻すで復元できます）'],
  'cloud-save':['save','下書きをこのブラウザに保存する'],
  'registered-reader':['export','登録済みの読み取り設定JSONをPCに保存する（管理者向け）'],
  'export-definition':['export','編集中の用紙定義JSONをPCに保存する（開発用）'],
  'qr-flow-close':['close','QR発行・印刷の画面を閉じる'],
  'qr-flow-pdf':['export','確定済みの版のPDFをPCに保存する']
 };
 var hints={
  'new-menu-button':'新規作成・複製のメニューを開く',
  'save-menu-button':'保存方法を選ぶ',
  'open-menu-button':'用紙を開く方法を選ぶ',
  'pdf-menu-button':'印刷・PDF出力のメニューを開く',
  'qr-action':'Googleログイン確認・版の確定保存・QR発行・印刷へ進む…',
  'connect-menu':'用紙管理へのGoogleログインを確認する…',
  'confirm-registration':'Googleログインを確認し、クラウド保存・QR発行・読み取り設定登録を行う',
  'print':'QR発行状態を確認して、確定版PDFから印刷する…',
  'proof-print':'識別QRを付けずに確認印刷する…（配付用は確定版PDFを使用）',
  'qr-flow-print':'確定済みの版のPDFを開いて印刷する',
  'registration-history':'登録履歴を開き、中断した登録を確認する…',
  'mark-edit-options':'右パネルで選択肢を編集する…',
  'mark-choice-apply':'編集中の選択肢を紙面に適用して戻る',
  'mark-choice-cancel':'一覧の変更を取り消して戻る（元の選択肢は保持）',
  'apply-field':'設問テキスト・読み取り欄・位置などの設定をまとめて適用する',
  'selection-close':'部品の選択を解除する',
  'theme':'操作画面のテーマを変更する（用紙の色は変わりません）',
  'ui-size':'操作部の文字サイズを変更する（用紙内の文字は変わりません）',
  'zoom':'用紙の表示倍率を変更する（印刷寸法は変わりません）'
 };
 var states=new WeakMap(),tip=ui.tooltip({keyboard:true}),active=null;
 var roots=Array.from(document.querySelectorAll('header.toolbar,#side-tabs,#right-dock,#palette,#settings-panel,#help-panel,#document-dialog,#connection-dialog,#registration-dialog,#print-warning-dialog,#tab-menu'));
 function label(n){var copy=n.cloneNode(true);copy.querySelectorAll('svg,kbd,[aria-hidden="true"]').forEach(function(e){e.remove();});return(copy.textContent||'').replace(/\s+/g,' ').trim();}
 function describe(n){
  if(controls[n.id])return controls[n.id];
  if(n.matches('[data-close-panel],#document-dialog button[value="cancel"]'))return['close',n.getAttribute('aria-label')||'用紙の画面を閉じる'];
  if(n.matches('.tab-more'))return['more','この用紙のメニュー（名前変更・タブを閉じる）'];
  if(n.matches('#options-list .choice-row button,[data-choice-remove]'))return['delete',n.getAttribute('aria-label')||'この選択肢を削除'];
  if(n.matches('[data-delete-page]'))return['delete',n.getAttribute('aria-label')||'このページを削除'];
  if(n.matches('[data-delete-local]'))return['delete',null];
  if(n.matches('#side-tabs [data-panel="export"]'))return['export','保存・書き出しパネルを開閉する'];
  return null;
 }
 function decorate(n){
  if(!n.matches('button,a[title],a[data-tip],select[aria-label],#theme,#ui-size,#zoom'))return;
  var state=states.get(n);if(!state){state={nativeTitle:null};states.set(n,state);}
  var title=n.getAttribute('title');if(title!==null){state.nativeTitle=title||null;n.removeAttribute('title');}
  var spec=describe(n),aria=n.getAttribute('aria-label'),name=spec&&spec[2]||(aria!==state.generatedName?aria:null)||label(n);
  // Text controls and selects retain their native labels. Only mapped icon
  // controls get an explicit name; update names we generated after text changes.
  if(spec&&name&&(spec[2]||!aria||aria===state.generatedName)){
   state.generatedName=name;if(aria!==name)n.setAttribute('aria-label',name);
  }
  var message=spec&&spec[1]||state.nativeTitle||hints[n.id]||name;
  // Dynamic registration/disabled-state explanations take precedence over defaults.
  if(state.nativeTitle&&(!controls[n.id]||n.matches('[data-delete-page],[data-delete-local]')))message=state.nativeTitle;
  if(n.matches('.choice-drag-handle'))message=(n.getAttribute('aria-label')||'選択肢の順序')+'。ドラッグ、↑↓・Home・Endキーで並べ替えます';
  if(message&&n.dataset.tip!==message)n.dataset.tip=message;
  if(!spec)return;
  var existing=n.querySelector(':scope > svg');
  if(!existing||existing.dataset.johoIcon!==spec[0]){
   if(existing)icons.apply(existing,spec[0]);else{
    existing=icons.create(spec[0],{className:'omr-control-icon'});
    var marker=n.querySelector(':scope > span[aria-hidden="true"]');if(n.closest('#side-tabs')&&marker)marker.remove();
    Array.from(n.childNodes).filter(function(c){return c.nodeType===3;}).forEach(function(c){if(/^[\s×︙]+$/.test(c.textContent))c.remove();else if(spec[0]==='new')c.textContent=c.textContent.replace(/^\s*[＋+]\s*/, '');});
    n.prepend(existing);
   }
  }
  existing.classList.add('omr-control-icon');n.classList.add('omr-icon-control');
 }
 function refresh(root){if(root.matches&&root.matches('svg,svg *,[role="tooltip"]'))return;if(root.matches)decorate(root);root.querySelectorAll('button,a[title],a[data-tip],select[aria-label],#theme,#ui-size,#zoom').forEach(decorate);}
 function target(event){return event.target.closest&&event.target.closest('button,a,select,[data-tip],[title]');}
 function prepare(event){
  var n=target(event);if(!n||!roots.some(function(root){return root.contains(n);}))return;
  decorate(n);active=n;var dialog=n.closest('dialog[open]'),parent=dialog||document.body;if(tip.el.parentElement!==parent)parent.append(tip.el);
 }
 document.addEventListener('mouseover',prepare,true);document.addEventListener('focusin',prepare,true);
 document.addEventListener('click',tip.hide);document.addEventListener('close',tip.hide,true);
 var observer=new MutationObserver(function(records){
  var changed=new Set();records.forEach(function(r){var n=r.target.nodeType===1?r.target:r.target.parentElement;if(!n||n.closest('svg,[role="tooltip"]'))return;changed.add(n);});
  changed.forEach(refresh);
  if(active&&tip.el.classList.contains('show')){
   if(!active.isConnected||active.closest('[hidden]')||active.closest('dialog:not([open])'))tip.hide();
   else if(tip.el.textContent!==(active.dataset.tip||'')){
    // Close a changed explanation instead of keeping the old width/position.
    // The shared tooltip lays out the latest text on the next hover/focus.
    tip.hide();tip.el.textContent=active.dataset.tip||'';
   }
  }
 });
 roots.forEach(function(root){refresh(root);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['title','aria-label','disabled','hidden']});});
 document.querySelectorAll('#save-browser kbd,#load kbd').forEach(function(k){k.textContent=mod+(k.closest('#save-browser')?'S':'O');});
 // No editor shortcuts or storage handlers are installed here.
 window.OMRControls={refresh:refresh,hideTip:tip.hide};
})();
