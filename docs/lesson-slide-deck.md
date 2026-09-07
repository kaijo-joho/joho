# 座学ページ共通スライド基盤

`css/lesson-slide-deck.css`と`js/lesson-slide-deck.js`は、座学ページをHTML内のスライドとして表示する共通基盤である。2026年9月時点では`lc01.html`〜`lc04.html`、`dr31.html`〜`dr32.html`、`nw11.html`〜`nw13.html`へ適用している。共通基盤を変更するタスクは、この文書へ動作、設定、検証方法も記録する。

旧DR専用の`js/dr-slide-deck.js`は廃止し、この共通基盤へ統合している。DRページへ旧ファイルを再度読み込まない。

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

## 上部のスライド移動バー

- 共通基盤が学校名ヘッダー`#site-header`の直後へ、前後ボタンとスライド選択メニューを1つだけ生成する。ページ紹介`#page_header`や本文より前に置き、最初のスライドだけページ紹介が表示されてもバーの位置を変えない。ヘッダーがない場合はスライド表示領域の直前へ置く。
- バーはヘッダーの直下に追従し、本文とは独立して表示する。ヘッダーの高さは初期表示、画面幅・文字サイズの変更時に再計測する。見た目だけCSSで順序を入れ替えず、DOM上もヘッダー、移動バー、ページ紹介、スライド本文の順にする。
- 中央にはスライド順のボタンを横一列に並べ、番号とタイトルから直接選べるようにする。現在のスライドを背景・番号・下線で強調し、`aria-current="step"`でも示す。下部の移動バーは追加しない。
- 表示は、全タイトル、現在と次のタイトル、現在のタイトルだけ、ネイティブ`select`の順に切り替える。タイトルを省くボタンは番号だけを表示する。表示するタイトルは途中で切らず、番号だけの場合も`aria-label`と`title`には全文を残す。最終スライドでは存在しない「次」を優先対象に含めない。
- 切替は画面幅だけで決めず、中央に使える実際の幅、スライド枚数、タイトルの描画幅、文字サイズから判断する。全タイトルが収まらない場合は、まず左右の「前のスライド」「次のスライド」を矢印表示にして幅を確保し、それでも収まらなければタイトルを優先順に減らす。初期表示、フォント読込完了、画面幅・文字サイズ・現在スライドの変更時に再計測する。計測用のコピーは操作・読み上げの対象にしない。
- 560px以下、または全番号と現在のタイトルを一列に収められない場合は、中央をネイティブ`select`へ切り替える。「現在の番号 / 総数」とスライド名を表示し、開くと全スライドから直接選べる。横並びボタンと`select`は同時に表示しない。前後ボタンの`aria-label`には移動先を含め、ボタンは幅・高さ44px以上、`select`は高さ44px以上を確保する。
- 前後ボタンや横並びのボタンで移動したらスライド見出しへフォーカスを移す。`select`で移動した場合は選択欄にフォーカスを残し、矢印キーによる連続選択を妨げない。短いタイトルを選び直して横並びが収まるようになっても、選択欄からフォーカスが外れるまでは`select`を保つ。画面幅・文字サイズを変更した場合は再判定する。Enter、Escapeなどはブラウザ標準の選択操作に任せる。`select`を開く操作では`joho:overlay-open`を送出し、左目次やLessonDockなどを閉じる。
- 幅や文字サイズの変更で横並びボタンと`select`が切り替わるときは、非表示になる操作部品にフォーカスがあった場合だけ、新しい選択欄または現在の番号ボタンへフォーカスを引き継ぐ。本文の操作中にはフォーカスを移さない。
- URLハッシュやブラウザ履歴からスライドが変わった場合も、現在の番号ボタン、表示を優先するタイトル、`select`の選択値、読み上げ用の進行状況を同期する。
- 最終スライドでは、次教材があるときに右ボタンを「次の教材」に切り替え、教材名を`aria-label`へ含める。遷移先は従来どおり`js/pages.js`の`next`などから取得する。次教材がなければ「完了」として無効化する。
- LessonDockは共通の右下配置を使う。旧下部バーを避けるための座学ページ専用`bottom: 112px`は使用しない。
- スライド内の手順や問題の操作は対象の図・問題の近くに置く。「前の手順／次の手順」「次の問題」など対象が分かる名称を使い、共通のスライド移動と区別する。
- 印刷時は移動バーを隠し、画面上で`hidden`になっているスライドや表示切替パネルも元の順に表示する。印刷用セレクタは通常時の非表示指定を上書きできる詳細度にする。

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

共通基盤を変更した場合は次を実行する。

```sh
node --check js/lesson-slide-deck.js
node scripts/test-lesson-slide-pages.mjs
node scripts/test-logic-applications.mjs
node scripts/test-sound-pages.mjs
git diff --check
```

UI変更時はデスクトップ幅、MacBook Airの半画面程度の幅、390px幅で、バーがヘッダー直下に収まること、LessonDockと重ならないこと、前後移動・番号ボタン・`select`・URLハッシュが同期することを確認する。4段階の表示、切替境界、長いタイトル・異なる枚数、最終スライドの優先表示、リサイズ時のフォーカス引継ぎも確認する。ライト・ダーク・自動、3段階の文字サイズ、Tab・Shift+Tab・Enter・Escape、教材内のキーボード・ドラッグ・タッチ操作、補足dialogのフォーカス復帰と各パネルの排他制御、スライド内スクロール、JavaScript無効時の本文順、印刷時の全スライド表示も確認する。
