# 座学ページ共通スライド基盤

`css/lesson-slide-deck.css`と`js/lesson-slide-deck.js`は、座学ページをHTML内のスライドとして表示する共通基盤である。2026年9月時点では`lc01.html`〜`lc04.html`、`dr31.html`〜`dr32.html`、`nw11.html`〜`nw13.html`へ適用している。共通基盤を変更するタスクは、この文書へ動作、設定、検証方法も記録する。

旧DR専用の`js/dr-slide-deck.js`は廃止し、この共通基盤へ統合している。DRページへ旧ファイルを再度読み込まない。

## シリーズの目次

座学シリーズの目次は英字2文字に`00`を付けたファイルとし、`dr00.html`、`lc00.html`、`nw00.html`を用意する。`py00.html`・`il00.html`と同じ`#html_index`を使い、`js/script_pages.js`が`pages.js`の`mainTitle`、`category`、`title`、`detail`、`fileName`からカテゴリ別のカードを生成する。教材名やリンクをHTMLへ重複記述しない。目次自体にはスライド基盤を適用しない。

目次の`#html_index`には`data-lesson-series="dr"`のようにシリーズ名を付ける。掲載する教材がない場合は「公開中の教材はありません。」と表示する。掲載条件は実習と同じく`release: true`かつ`show !== false`であり、公開前のページを独自に掲載しない。目次自身は`show: false`として自分自身のカードを作らない。

ページの登録・公開・教材との紐付けは[ページ一覧のデータフロー](page-list-data-flow.md)に従い、GSSを変更して生成する。目次を公開すると、同じ`mainTitle`を持つ座学ページの0枚目に目次へのリンクを表示する。目次のURLは登録された`fileName`から取得する。

## タイトルを表示する0枚目

`js/script.js`が`pages.js`から作る`#page_header`を、共通スライド基盤が0枚目として取り込む。HTMLへ表紙を追加・複製しない。0枚目にはシリーズ名`mainTitle`、ページタイトル`title`、説明`detail`、公開された`practiceFile`、公開済みのシリーズ目次へのリンク、「学習を始める」ボタンを表示する。

本文は従来どおり1〜N枚目とし、移動バーに「0 タイトル」を追加する。現在位置は`0 / N`〜`N / N`と表示し、分母は本文の枚数とする。既存の本文見出しIDと自動生成する本文スライドIDは変更しない。`#title`または`#page_header`で表紙へ直接移動できる。表紙を生成できなかった場合も本文スライドは従来の1枚目から表示する。

「学習を始める」は本文1枚目へ進み、その見出しにフォーカスを移す。説明や配付物が多い場合は0枚目の内部でスクロールする。390px幅でも説明を省略せず、文字サイズ・テーマの設定に従う。印刷時は表紙から本文まで順番に表示し、開始ボタンを隠す。JavaScript無効時の本文順は元のHTMLのままとする。

### ワークシートPDF

座学ページの`practiceFile`にはワークシートPDFの教材IDを登録する。共通レイアウトが展開済みの配列からファイル名と「PDFをダウンロード」リンクを生成し、URLは`pages.js`にある値をそのまま使う。複数のPDFにも対応する。配付WebアプリのURLをDrive URLへ独自に置換しない。サイト内の相対URLには`download`属性を付け、外部配付先は新しいタブで開く。

公開フラグが`false`の教材、URLがない教材、未登録の`practiceFile`にはリンクもダウンロード案内も表示しない。既存データとの互換性から、教材側の`release`省略は従来のファイル表示と同じく許容する。PDFの登録は`教材ファイル一覧`・`配布設定一覧`を正本として行い、同じIDが`ファイル一覧`へ反映されたことを確認してから`ページ一覧.practiceFile`で参照する。実習ページの配付ファイルの表示方法は変更しない。

2026年9月7日、目次3ページを`release: false`で登録・確認した後、ユーザーの承認を受けて既存座学9ページと合わせた12ページを`release: true`に変更した。目次にはDRの2ページ、LCの4ページ、NWの3ページを掲載し、新しい目次3ページも検索対象に含める。目次自身の`show: false`は維持する。9ページの`practiceFile`は未登録であり、実際のPDFリンクは教材IDを登録した後に表示される。

## 基本の呼び出し方

ページ固有のCSSより先に共通CSSを、教材固有のJavaScriptより後に共通JavaScriptを読み込む。

```html
<link rel="stylesheet" href="./css/lesson-slide-deck.css">
<link rel="stylesheet" href="./css/教材固有.css">

<script defer src="./js/main.js"></script>
<script defer src="./js/教材固有.js"></script>
<script defer src="./js/lesson-slide-deck.js"></script>
```

`body`へ`data-lesson-slide-deck`、各スライドに`data-lesson-slide`を付ける。スライド名は`data-lesson-slide-title`で指定する。

```html
<body data-lesson-slide-deck>
  <section data-lesson-slide data-lesson-slide-title="導入">
    <article>
      <h2 id="headline_1">(1) 導入</h2>
      <!-- 本文 -->
    </article>
  </section>

  <section data-lesson-slide data-lesson-slide-title="操作する">
    <article>
      <h2 id="headline_2">(2) 操作する</h2>
      <!-- 本文 -->
    </article>
  </section>
</body>
```

通常は0枚目のタイトルから表示する。エディタなどの専用UIを最初に開くページでは、`body`の`data-lesson-default-slide`へ対象スライド内の見出しIDを指定できる。URLに見出しハッシュがある場合は、ハッシュで指定されたスライドを優先する。

```html
<body data-lesson-slide-deck data-lesson-default-slide="headline_2">
```

## 上部のスライド移動バー

- 共通基盤が学校名ヘッダー`#site-header`の直後へ、前後ボタンとスライド選択メニューを1つだけ生成する。0枚目と本文のどちらを表示してもバーの位置を変えない。ヘッダーがない場合はスライド表示領域の直前へ置く。
- バーはヘッダーの直下に追従し、本文とは独立して表示する。ヘッダーの高さは初期表示、画面幅・文字サイズの変更時に再計測する。見た目だけCSSで順序を入れ替えず、DOM上もヘッダー、移動バー、スライド表示領域の順にする。
- 中央にはスライド順のボタンを横一列に並べ、番号とタイトルから直接選べるようにする。現在のスライドを背景・番号・下線で強調し、`aria-current="step"`でも示す。下部の移動バーは追加しない。
- 表示は、全タイトル、現在と次のタイトル、現在のタイトルだけ、ネイティブ`select`の順に切り替える。タイトルを省くボタンは番号だけを表示する。表示するタイトルは途中で切らず、番号だけの場合も`aria-label`と`title`には全文を残す。最終スライドでは存在しない「次」を優先対象に含めない。
- 切替は画面幅だけで決めず、中央に使える実際の幅、スライド枚数、タイトルの描画幅、文字サイズから判断する。全タイトルが収まらない場合は、まず左右の「前のスライド」「次のスライド」を矢印表示にして幅を確保し、それでも収まらなければタイトルを優先順に減らす。初期表示、フォント読込完了、画面幅・文字サイズ・現在スライドの変更時に再計測する。計測用のコピーは操作・読み上げの対象にしない。
- 560px以下、または全番号と現在のタイトルを一列に収められない場合は、中央をネイティブ`select`へ切り替える。「現在の番号 / 本文の枚数」とスライド名を表示し、開くと0枚目を含む全スライドから直接選べる。横並びボタンと`select`は同時に表示しない。前後ボタンの`aria-label`には移動先を含め、ボタンは幅・高さ44px以上、`select`は高さ44px以上を確保する。
- 前後ボタンや横並びのボタンで移動したらスライド見出しへフォーカスを移す。`select`で移動した場合は選択欄にフォーカスを残し、矢印キーによる連続選択を妨げない。短いタイトルを選び直して横並びが収まるようになっても、選択欄からフォーカスが外れるまでは`select`を保つ。画面幅・文字サイズを変更した場合は再判定する。Enter、Escapeなどはブラウザ標準の選択操作に任せる。`select`を開く操作では`joho:overlay-open`を送出し、左目次やLessonDockなどを閉じる。
- 幅や文字サイズの変更で横並びボタンと`select`が切り替わるときは、非表示になる操作部品にフォーカスがあった場合だけ、新しい選択欄または現在の番号ボタンへフォーカスを引き継ぐ。本文の操作中にはフォーカスを移さない。
- URLハッシュやブラウザ履歴からスライドが変わった場合も、現在の番号ボタン、表示を優先するタイトル、`select`の選択値、読み上げ用の進行状況を同期する。
- 最終スライドでは、公開済みの次教材があるときに右ボタンを「次の教材」に切り替え、教材名を`aria-label`へ含める。遷移先は`js/pages.js`の`next`から公開対象だけを選び、次教材がなければ「完了」として無効化する。未掲載の教材へはクリック・キーボードともに遷移しない。
- LessonDockは共通の右下配置を使う。旧下部バーを避けるための座学ページ専用`bottom: 112px`は使用しない。
- スライド内の手順や問題の操作は対象の図・問題の近くに置く。「前の手順／次の手順」「次の問題」など対象が分かる名称を使い、共通のスライド移動と区別する。
- 印刷時は移動バーを隠し、画面上で`hidden`になっているスライドや表示切替パネルも元の順に表示する。印刷用セレクタは通常時の非表示指定を上書きできる詳細度にする。

## スライドの全画面表示

`data-lesson-slide-deck`で共通基盤を初期化した座学ページでは、サイトヘッダーの文字サイズ・テーマ切替の右隣に「スライドを全画面表示」アイコンを生成する。実習ページやシリーズ目次には追加しない。各HTMLへのボタンの記述は不要である。

クリック・Enter・SpaceでブラウザのFullscreen APIを呼び出す。全画面中は学校名・表示設定を含む`#site-header`を隠し、その分もスライドの表示領域へ割り当てる。上部のスライド移動バーは残し、同じ全画面ボタンをバーの右端へ移して「全画面表示を終了」に切り替える。終了ボタンまたはブラウザ標準のEsc操作で通常表示へ戻り、ボタンを元のヘッダーへ戻してフォーカスする。ブラウザ側の操作による終了も`fullscreenchange`で同期する。

全画面の対象要素は`document.documentElement`とする。見える範囲からヘッダーを除きつつ、本文外にあるLessonDock・左目次・検索・補足dialogと文書の背景も維持するためである。スライドや教材固有のDOMは作り直さず、現在のスライド・URLハッシュ・穴埋めや入力の状態を維持する。全画面の切替時は`joho:overlay-open`で開いているパネルを閉じ、移動バーとスライドの高さ・幅を再計測する。全画面内で開いたdialogは既存の閉じる操作とフォーカス復帰に従う。

標準APIとSafariのWebKit接頭辞付きAPIに対応する。全画面APIが使えない環境ではアイコンを生成せず、通常の教材操作を提供する。要求が拒否された場合は切替前の表示を維持し、移動バー内に再試行の案内を表示する。状態の切替はAPIの成功に合わせ、疑似的な全画面表示へは切り替えない。アイコンの操作領域は44px、状態は`aria-pressed`、操作名は`aria-label`で示す。テーマ・文字サイズ・本文の最大幅は既存の共通設定を引き継ぐ。

検証時は座学9ページで開始・終了、ヘッダーの表示復帰、スライド位置・ハッシュ・教材の入力状態を確認する。デスクトップ・半画面・390px幅で移動バーの選択UIと終了ボタンが収まり、本文内スクロールを使えることを確認する。キーボード・タッチ、ライト・ダーク・自動、3段階の文字サイズ、LessonDock・検索・補足dialog、要求拒否・非対応環境も確認する。ブラウザ自体のウィンドウ最大化とは区別し、実際のFullscreen APIによる動作と未確認の環境を記録する。

2026年9月8日、Chrome・WebKitで座学9ページの実際のFullscreen APIによる開始・終了を検証した。1440px・720px・390px幅、全テーマ・文字サイズ、教材の操作状態保持、検索・LessonDock・左目次・本文内外の補足dialog、キーボード・タッチ、印刷・JavaScript無効時を確認し、ページ内例外とローカル資産の404は発生しなかった。非対応・要求拒否・再試行はテスト用のAPI設定で確認し、接頭辞付きAPIの経路も検証した。Escによる終了はWebKitで確認済み。Chromeでは終了APIを直接呼び出した場合の状態・フォーカス復帰まで確認し、実画面のEsc操作とSafariアプリ自体での確認は未実施である。

## 専用UIを含むスライド

エディタや問題演習では、外側のスライドへレイアウト種別を指定する。

```html
<section data-lesson-slide data-lesson-slide-layout="workspace">
  <article>...</article>
</section>
```

指定できる値は`workspace`と`exercise`である。これらは本文余白を小さくし、操作領域を広く取る。矢印キーを教材内の操作に使う領域だけへ`data-lesson-slide-navigation-lock`を付ける。スライド全体には付けず、見出しへフォーカスがあるときは左右キーで前後移動できる状態を保つ。

大きな回路図、真理値表、エディタは文字やタップ対象を過度に縮小せず、その部品または現在のスライド内だけをスクロール可能にする。ページ全体の横スクロールは発生させない。

本文幅は通常ページの上限へ固定せず、最大化・全画面表示では画面幅の96%まで広げる。ただし極端に横長にならないよう1480pxを上限とし、狭い画面では左右8px以上の余白を残す。

教材固有JavaScriptが表示内容の高さを大きく変えた場合は、`document`へ`joho:lesson-content-resize`を送出し、共通基盤へ表示領域の再計測を依頼する。

NWシリーズの語句の穴埋めは`js/network-lessons.js`の共通処理を使い、同じボタンの再操作で個別に非表示へ戻せる。表示数や連動する図を含む仕様は[Networkシリーズの編集方針](page-specific-editing-notes.md#networknwシリーズ)を参照する。

## 1枚の中の表示切替

複数の説明を同時に縦積みしない場合は、表示切替グループを使う。

```html
<div data-lesson-view-group data-lesson-default-view="and">
  <div data-lesson-view-controls aria-label="ゲートを選ぶ">
    <button data-lesson-view="and">AND</button>
    <button data-lesson-view="or">OR</button>
  </div>
  <div id="gate-and" data-lesson-view-panel="and">...</div>
  <div id="gate-or" data-lesson-view-panel="or">...</div>
</div>
```

初期化後はタブとして動作し、左右キー・Home・Endで切り替えられる。パネル内のIDをURLハッシュへ指定すると、そのパネルを含むスライドと表示項目が直接開く。

## 補足情報

短い補足は`data-lesson-supplement-preview`でホバー・フォーカス時に示し、詳しい内容は`dialog`で開く。タッチ端末ではホバーを前提にせず、ボタンから同じ内容を開けるようにする。

```html
<button
  data-lesson-supplement-open="operation-guide"
  data-lesson-supplement-preview="詳しい操作を確認できます。"
>詳しい操作</button>

<dialog id="operation-guide" data-lesson-supplement-dialog>
  <button data-lesson-supplement-close aria-label="詳しい操作を閉じる">×</button>
  <!-- 補足本文 -->
</dialog>
```

ダイアログはEscape、閉じるボタン、背景の選択で閉じ、呼び出し元へフォーカスを戻す。

## 共通の動作

- 前後ボタン、現在位置、各スライドへの直接移動を自動生成する。
- 左右キーとPageUp／PageDownで前後移動する。フォーム、タブ、リンク、教材操作領域では奪わない。
- 現在の見出しIDをURLハッシュへ反映し、直リンクとブラウザ履歴から表示位置を復元する。
- 最終スライドの次ページは`js/pages.js`の`next`から取得し、HTMLへ重複記述しない。
- テーマ、3段階の文字サイズ、`prefers-reduced-motion`、印刷表示へ対応する。
- JavaScript無効時は元のHTML順で本文を表示する。

### ページ間リンクと掲載状態

`release: false`は、アップロード済みのHTMLをURLで直接確認できる状態のまま、他ページからのリンク掲載を止める設定とする。直接開いたページの表示や、同じページ内のスライド移動・ハッシュリンクは制限しない。

`js/script.js`の`window.isPageLinkReleased`で、リンク自身と遷移先の`pages.js`登録情報を確認する。どちらかが`release: false`ならリンクを作らない。IDを持たないURL指定も、登録された`fileName`と照合する。URLのクエリ・ハッシュや相対パスの表記差で未掲載判定を回避しない。登録のない補助ページや外部URLは従来どおり扱う。

この判定は上部の「次の教材」、本文末尾の次回案内、LessonDock、ヘッダーの戻り先、本文内の教材リンク、検索結果で共有する。`next`が明示されている場合は、その公開対象が空でも旧HTMLの`#next_page`へフォールバックしない。`data-lesson-slide-next-url`や旧HTMLからの取得でも同じ掲載判定を通す。

本文中のページ参照は`<span data-page-link="lc02">自由接続モード</span>`のようにページIDで指定する。共通レイアウトが公開済みページの`fileName`からリンクを作り、未掲載・未登録・JavaScript無効時は文言だけを表示する。登録済みの未掲載ページを指す既存の固定リンクも、共通レイアウト初期化時に文言へ置き換える。新しく固定URLを本文へ重複記述しない。

共通基盤を変更した場合は次を実行する。

```sh
node --check js/lesson-slide-deck.js
node --check js/script.js
node --check js/script_pages.js
node scripts/test-page-links.mjs
node scripts/test-lesson-slide-pages.mjs
node scripts/test-logic-applications.mjs
node scripts/test-sound-pages.mjs
git diff --check
```

UI変更時はデスクトップ幅、MacBook Airの半画面程度の幅、390px幅で、バーがヘッダー直下に収まること、LessonDockと重ならないこと、前後移動・番号ボタン・`select`・URLハッシュが同期することを確認する。4段階の表示、切替境界、長いタイトル・異なる枚数、最終スライドの優先表示、リサイズ時のフォーカス引継ぎも確認する。ライト・ダーク・自動、3段階の文字サイズ、Tab・Shift+Tab・Enter・Escape、教材内のキーボード・ドラッグ・タッチ操作、補足dialogのフォーカス復帰と各パネルの排他制御、スライド内スクロール、JavaScript無効時の本文順、印刷時の全スライド表示も確認する。

0枚目を変更するときは、`pages.js`のタイトル・説明との一致、本文1枚目への移動、表紙と既存見出しのハッシュ、本文番号の維持、PDF未登録・複数・非公開・URLなしの場合を確認する。目次はシリーズ別の件数・順番と公開条件、自分自身を掲載しないこと、実習の`py00`・`il00`への影響も確認する。
