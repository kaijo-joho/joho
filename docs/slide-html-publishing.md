# Googleスライド由来教材の公開運用

## 位置づけ

GoogleスライドをそのままHTMLへ変換するのではなく、次の役割分担で公開する。

- スライド画面・タイトル: 視覚原本。PNGと見出しを生成する。
- 発表者ノート: 学習者に公開する文章原本。独自MarkdownからHTMLへ変換する。
- `pages.js`のページ情報: 実習ファイル、演習問題、確認テスト、次回ページの原本。
- `js/ss*.js`と`img_slide/*.png`: 自動生成物。直接編集しない。

発表者ノートの内容はすべて公開用として扱う。教員だけの進行メモは、公開部分と分離する変換仕様を実装するまで発表者ノートへ混在させない。

## 使い分け

### 手順中心のページ

`ss11`〜`ss22`と同様に、ページ本文全体をスライドから生成する。

```html
<div id="content"><!-- slide_pages.js --></div>
<section id="examples_and_questions"><!-- script_pages.js --></section>
<script src="js/slide_pages.js"></script>
```

### ハイブリッドページ

概念説明・表・数式はHTMLに記述し、操作手順だけをスライドから差し込む。
`data-slide-section`は、スライド側の`[[SECTION_HEADER]]`で生成されるセクション名と完全一致させる。

```html
<section>
  <article>
    <h2>相関係数の考え方</h2>
    <p>概念説明は検索・コピーしやすいHTMLで記述する。</p>

    <h3>スプレッドシートでの操作</h3>
    <div
      data-slide-content
      data-slide-source="ss31"
      data-slide-section="スプレッドシートでの操作"
      data-slide-layout="inline"
      data-slide-heading-level="4"
    ></div>
  </article>
</section>
<script src="js/slide_pages.js"></script>
```

指定できる属性:

- `data-slide-source`: `js/<ID>.js`の`<ID>`。省略時はHTMLファイル名を使う。
- `data-slide-section`: 差し込むセクション名。省略時は全データを使う。
- `data-slide-layout`: `inline`または`sections`。明示的な差し込み先では`inline`が既定。
- `data-slide-heading-level`: `inline`内のスライドタイトル。`3`〜`6`、既定は`3`。
- `data-slide-section-heading`: `sections`表示時にセクション見出しを省く場合は`false`。

現行の生成JSは`window.slidesData`を使うため、1つのHTMLページで指定できるスライド原本は1つとする。同じ原本の複数セクションは複数箇所へ差し込める。

## 公開手順

通常公開では、個別のJSON更新・PNG更新を組み合わせず、Commonメニューの「PNG＋JSON一括公開」を使う。

1. Googleスライドと公開用発表者ノートを編集する。
2. 全PNGと`slidesData` JSを生成する。
3. JS内の画像参照と生成PNG一式を検証する。
4. PNGとJSをGitHubへ1コミットで反映する。
5. 対象ページをブラウザで確認する。

ページ別のPNG化や「保存してJSON更新」は、公開済み素材の補修時だけ使用する。

## 公開前検証

リポジトリで次を実行する。

```console
node scripts/validate-slide-content.mjs
```

検査対象:

- HTMLが参照する`js/<ID>.js`の存在と構文
- `title`、`note`、`section`、`imageAlt`の型
- 公開前の制御記号の残存
- 指定セクションの存在
- 参照PNGの存在
- `#content`と演習・次回ブロックのソース順

ブラウザでは`slides:ready`イベントの`detail.errors`が空であること、画像404がないこと、本文・演習問題・次回ページの順序を確認する。

## アクセシビリティ

生成データに`imageAlt`があれば画像の代替テキストとして使用し、未設定時だけスライドタイトルへフォールバックする。操作上重要な情報は画像だけに置かず、発表者ノートにも文章として記述する。
