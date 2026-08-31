# 教材サイト内検索

教材サイト内検索は、GitHub Pagesだけで動作するブラウザ内検索です。検索語や検索履歴を保存せず、検索時に外部検索サービスへ送信しません。

## 索引の更新

`js/pages.js`、公開教材HTML、または`data/slides/*.json`を変更した場合は、検索索引を再生成します。

```sh
node scripts/generate-search-index.mjs
node scripts/generate-search-index.mjs --check
node scripts/test-site-search.mjs
```

`--check`は、コミット済みの`data/search-index.json`が現在の教材内容から生成される索引と一致しない場合に失敗します。

## 検索対象

- `js/pages.js`で`release: true`になっている登録済みページ
- 通常HTMLの見出し、本文、コード
- スライド型教材が参照する`data/slides/*.json`の節名、タイトル、ノート、画像の代替テキスト

FAQ、中継ページ、テストページ、未公開ページ、配付用サンプル・解答HTML、`archive/`、`teacher-tools/`は索引へ含めません。FAQは検索モーダルから既存の`faq.html`へ同じ検索語を渡します。

## 実行時の読み込み

検索コアとモーダルUIは共通スクリプトとして読み込みます。検索索引`data/search-index.json`は、利用者が検索モーダルを初めて開いた時だけ取得し、同じページを表示している間は再利用します。
