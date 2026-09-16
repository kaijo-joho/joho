# 共通の小さな部品（テーマ・文字サイズ・ツールチップ・知らせ）

`tools/shared/ui-kit.css` と `tools/shared/ui-kit.js`。構造式エディタ（`tools/kouzoushiki/`）から切り出したもので、共通仕様（`tools/docs/README.md` の 2.6・2.7）に合わせてあります。外部との通信はしません。

```html
<link rel="stylesheet" href="../shared/ui-kit.css">
<script src="../shared/ui-kit.js"></script>
```

- ライトの配色（`--bg` `--panel` `--line` `--text` `--muted` `--accent` `--accent-soft` `--danger`）は**各アプリの `:root`** に置きます（共通ファイルが読めなくても画面が崩れないように）。
- このファイルは、その上に**ダークの色**・**文字サイズ**（`--ui-size` `--ui-k`）・ツールチップ・知らせの体裁を重ねます。作図面を持つアプリは `--paper`（紙）と `--grid`（方眼の点）も使えます。

## テーマと文字サイズ

```js
const view = JohoUI.theme({
  storageKey: 'kouzoushiki-view',            // アプリごとに別のキー。文書とは混ぜない
  themeSelect: document.getElementById('themeSel'),   // <select>（自動・ライト・ダーク）
  sizeSelect: document.getElementById('textSizeSel'), // <select>（標準・大・特大）
  onChange: ({dark}) => redraw(dark)          // 作図面の線の色を変えるときなどに
});
view.set({theme:'dark'});   // プログラムから変えるとき
view.isDark();              // いまダークで表示しているか
```

- `<html>` に `data-theme`（利用者の選択）、`data-resolved-theme`（実際の表示）、`data-text-size` を付けます。CSS は `:root[data-theme="dark"], :root[data-resolved-theme="dark"]` で書きます（論理回路エディタ・フローチャートエディタと同じ）。
- 自動のときは OS の設定に追い、切り替わったら `onChange` が呼ばれます。
- 文字サイズは変数だけを渡します。**どこを拡大するかは各アプリ**で決めます（構造式エディタは操作部だけ `zoom:var(--ui-k)`、作図面は倍率で変える）。位置を JS で決める要素に `zoom` を掛けると座標がずれるので、文字サイズだけ変えます。

## ツールチップ

```js
JohoUI.tooltip();                                   // ページ全体に効く
JohoUI.tooltip({skip: el => el.closest('.no-tip')}); // 出したくないところ
```

`title` を `data-tip` に移して、マウスを乗せるとすぐ出します（ブラウザ標準の遅い `title` は使いません）。画面の外にはみ出すときは上に出します。

## 知らせ

```js
JohoUI.toast('ブラウザに保存しました');
JohoUI.toast('長めに出したい知らせ', 4000);
```

画面下の中央に数秒出ます。同時に 1 つだけです。

## 気をつけること

- 読み込みに失敗してもアプリが動くように、呼び出しは `try { … } catch { … }` で囲み、失敗したときの代わりの動き（ツールチップなしなど）を用意します。
- テーマを変えても、文書に保存した色は変えません。画像の書き出しは出力の設定に従います（構造式エディタは白い紙に黒で書き出します）。
- 文字サイズを変えても、上部のツールバーは 1 行に保ちます（共通仕様 2.1）。
