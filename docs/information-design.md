# 情報デザイン：id11〜id15

2026-10-04制作。本文31枚。正式なページ一覧登録・公開処理は主担当が行う。確認用は`release: false`とし、本文に新ページ相互・既存教材へのリンクを追加しない。既存color/il/html/dr本文、URL、pages.js、検索索引、共通基盤は変更していない。

| ID | タイトル | 本文枚数 | 固有の比較・操作 |
| --- | --- | ---: | --- |
| id11 | 情報を整理して伝える | 6 | 来場者/担当者の情報選択、6企画をLATCHの5基準で再整理、見出し・整列・余白の変更 |
| id12 | 色の使い方 | 7 | HSLの見本、色相環、明度/彩度/色相/補色の対比、心理補色の白い面への切替、文字と背景、配色の役割 |
| id13 | UDとアクセシビリティ | 6 | 利用者と環境、文字・形の追加、グレースケール、文脈別alt/画像なし、キーボードによる会場案内 |
| id14 | UIと操作の分かりやすさ | 6 | 記号/操作名の比較、押す/引く手掛かり、2つの評価観点、削除結果と取り消し |
| id15 | 試作・評価・改善 | 6 | 利用者と課題の選択、構造/整列/余白/配色/図表のBefore/After、感想と行動記録 |

各ページの末尾は、重要語句・ポイントのクリック開閉、続いて3問の問題演習。演習の考え方は最初から表示せず、detailsで確認する。JS無効時にはdetailsを含む本文を読める。

## 共通基盤と専用差分

`lesson-slide-deck.css/js`による0枚目・スライド移動・ハッシュ・キーボード・フォーカス・全画面を共用。0枚目は正式メタデータから作り、HTMLへ複製しない。`information-society.css/js`の状態比較モデル・テーマ変数・表現を共用し、固有操作は`information-design.css/js`に限定する。

主な操作スライドは主担当の`lesson-progress.css/js`を参照する。`data-lesson-progress`内に0=予想、1=操作、2=説明を置き、累積表示に`data-lesson-stage-from`を使う。Next・前の段階・はじめからは共通処理に任せ、移動ロジックを専用JSへ重複実装しない。固有の「選択を戻す」「Beforeへ戻す」は比較対象や入力を戻す操作であり、共通の進行段階リセットとは別にする。

SVGは短いラベル・図形を中心にし、長い説明はHTMLへ置く。すべてtitle/descを持ち、必要な情報を図だけに閉じ込めない。専用の入口図は独自SVGで、文脈別altの見本に使う。色の状態は文字・形・凡例も併用する。グレースケールは見本のみに適用する。

IS共通と専用CSS/JSのSRIを各HTMLへ設定。共通progressのSRIは統合時に主担当が設定する。共通ファイルは本担当のコミットに含めない。

## 根拠と既存教材との分担

- 日文『情報Ⅰ ADVANCED』34〜39頁。提供された`textbook-match/body-evidence.csv`、v838/v845抽出本文、v838のPDF20〜22枚目の画像を確認。LATCH、UD、カラーUD、アクセシビリティ/ユーザビリティ、シグニファイアを基準にした。
- 巻頭資料3〜4。v845の3/4枚目の抽出本文と`extra-book-renders/pdf-002.png`の見開きを確認。構造、整列、余白、配色、図表の改善と色属性・対比を使った。原本画像そのものはサイトへ転載していない。
- `/Users/takashi/授業スライド`の4つのPPTMを検索し、「03デジタル」100〜104枚目の色3属性・色相環・彩度・明度の本文を確認。本単元固有の情報デザインPPT/Google Slides原本は特定できていない。原本は変更していない。
- 既存color、il11/12、html14/31/32、dr22/41/43、is11/12/4xの内容と共通表示を確認。抽象化/可視化/構造化は短い導入にとどめ、実習の具体操作を再制作しない。
- RGB/CMY、カラーコード、階調、画像容量、画面・印刷の発色・計算はDR側に残す。一般的なPDCAは問題解決単元、id15は試作した案内・画面の評価に集中する。
- [W3C WAI：色だけに頼らない表現](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)、[altの判断手順](https://www.w3.org/WAI/tutorials/images/decision-tree/)、[Webアクセシビリティの概要](https://www.w3.org/WAI/fundamentals/accessibility-intro/)を2026-10-04に直接確認。説明に必要な出典リンクのみ本文へ置いた。

HSLのLは設定値であり知覚明度の尺度としない。補色を必ず読みやすい配色と扱わない。色の印象は文化・経験・場面で異なる。心理補色の残像を描画で偽装せず、白い面へ切り替えるだけの任意見本にした。色覚シミュレーションは実装せず、グレースケールを全員の見え方の再現と説明しない。コントラスト比やWCAGの適合判定・万能な読みやすさスコアは付けていない。

## 検証

`test-information-design-pages.mjs`は31枚の構造、SVGタイトル/説明、ID、参照、SRI、演習・まとめ、未公開相互リンク禁止、検索非掲載を検証する。126項目に合格。

```sh
node --check js/information-design.js
node --check scripts/test-information-design-pages.mjs
node --check scripts/test-information-design-browser.mjs
node scripts/test-information-design-pages.mjs
node scripts/test-lesson-slide-pages.mjs
node scripts/test-logic-applications.mjs
node scripts/test-sound-pages.mjs
node scripts/generate-slide-pages.mjs --check
node scripts/validate-slide-content.mjs
git diff --check
```

既存座学571件、音教材606件、論理回路4回路、生成チェック7ページ、スライド検証HTML8/データ7/エントリ103/画像84件も合格。

ブラウザ検証はPlaywrightのChromeとWebKitで実施。1440/720/390px、light/dark/system、標準/大/特大、31枚すべての横はみ出しを確認（2ブラウザで計1674条件）。Next・前・リセット・境界、Enter/Space、状態比較、LATCHの6件維持と五十音/時刻順、HSLの矢印キー、カラーUD、文脈別alt、フォーム結果、削除/取り消しのフォーカス、評価課題、Before/After、スライドの矢印移動・見出しフォーカス、語句開閉、印刷時の全スライド/段階/比較状態、390pxのJS無効fallbackが通過。ページ内JS例外・ローカル404なし。

```sh
python3 -m http.server 8873 --bind 127.0.0.1
PLAYWRIGHT_MODULE=/Users/takashi/Documents/GAS/webedu/node_modules/playwright \
  node scripts/test-information-design-browser.mjs
```

正式登録前のローカル検証は、ブラウザのリクエストを差し替えて5ページの確認用メタデータを与える。pages.jsは書き換えない。統合後の実メタデータ検証は`JOHO_ID_METADATA_FIXTURE=0`で実行可能。`JOHO_ID_TEST_IDS=id12,id15`などで対象を限定できる。スクリーンショットと結果は標準で`/tmp/id-design-review`へ出力し、公開ソースには含めない。

初回の目視でid15フローの先頭に共通ol番号が残る点を発見し、専用CSSで修正。最終検証ではid12の4つの対比とid15の改善全要素を有効にしたAfter状態を含め、2ページの全表示行列を再確認済み。自動テーマのOS light/dark追随も確認した。追加でChrome/WebKitのTab/Shift+Tab、390pxのタップによるLATCH・改善操作を確認し、固有操作・印刷・JS無効fallbackも再確認した。最終結果と画面は`/tmp/id-design-final`、追加入力確認は`/tmp/id-design-input-final`に保存。

Safariアプリ自体・実際のスクリーンリーダー・紙への印刷は未確認。オンライン反映・正式台帳・共通progress SRI・リリース設定は主担当の統合工程で確認する。
