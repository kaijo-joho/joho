# 座学ページ共通スライド基盤

`css/lesson-slide-deck.css`と`js/lesson-slide-deck.js`は、座学ページをHTML内のスライドとして表示する共通基盤である。2026年9月時点では`lc01.html`〜`lc04.html`へ適用している。

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

## 専用UIを含むスライド

エディタや問題演習では、外側のスライドへレイアウト種別を指定する。

```html
<section data-lesson-slide data-lesson-slide-layout="workspace">
  <article>...</article>
</section>
```

指定できる値は`workspace`と`exercise`である。これらは本文余白を小さくし、操作領域を広く取る。矢印キーを教材内の操作に使う領域だけへ`data-lesson-slide-navigation-lock`を付ける。スライド全体には付けず、見出しへフォーカスがあるときは左右キーで前後移動できる状態を保つ。

大きな回路図、真理値表、エディタは文字やタップ対象を過度に縮小せず、その部品または現在のスライド内だけをスクロール可能にする。ページ全体の横スクロールは発生させない。

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

構造の回帰確認は次で行う。

```sh
node scripts/test-lesson-slide-pages.mjs
```
