# 情報社会（IS）：歴史・情報技術と社会

2026-10-04の制作承認に基づくis61〜is64。各7本文スライド、計28スライド。正式台帳の登録・release/show=falseでの確認用公開は主担当が行う。教材一覧・検索・他の教材からの導線や本文の教材間リンクは追加しない。

## 構成と活動

| ページ | 7スライドの構成 | 中心となる比較 |
| --- | --- | --- |
| is61 情報とメディアの歴史 | 代表的変化／文字と印刷／電信と電話／放送とWeb／新旧の組合せ／語句・ポイント／演習 | 記録・複製・距離・受け手と発信への参加、必要な設備 |
| is62 情報技術と社会の変化 | 計算機から端末／プログラムの用途／共有の作業／端末の融合／情報システム／語句・ポイント／演習 | 利用する人と場所、共同の情報、通信に依存する機能、人の役割 |
| is63 AI・IoTなどの技術活用 | 収集・処理・利用／IoTの条件／AIの学習と入力／生成AI／任せる範囲／語句・ポイント／演習 | 最新・古い値・通信停止、経験していない入力、確認と自動制御 |
| is64 これからの情報社会 | 利用者の視点／情報格差／仕事の作業と役割／匿名性／情報の偏り／語句・ポイント／演習 | 端末・通信・能力・設計、公開名と記録、表示の選択と意見の反響 |

21の比較モデル、64の独自インラインSVGを使用する。図の状態や経路が変わり、各状態に対応する説明を持つ。共通Nextによる「予想→操作→説明」の3段階で進める。is64の情報の偏りは、フィルターバブルとエコーチェンバーを独立した2モデルで比べる。実際の推薦アルゴリズム、AI推論、制御、拡散、統計的効果の計算は行わない。

各末尾にクリックで開く語句まとめ、常時表示のポイント3点、その後に独自の説明問題2問を置く。説明入力は保存・送信せず、再読み込みで消える。説明例はnative detailsで確認する。年号の暗記や製品性能の比較、未来の職業の断定は扱わない。

既存is12のメディア分類・同期/非同期・信頼性の確認手順、cpのCPU/OSの動作、NWの接続方式や情報システムの構成は再制作しない。個人情報・知的財産・認証等の詳しい制度や技術、健康・SNS依存は追加しない。

## 教科書と授業原本

主基準は日文『情報Ⅰ ADVANCED』12〜14、22〜29頁と巻末資料9〜10。今回の比較資料 `textbook-match/body-evidence.csv`、`v838-pages.json`（PDF9〜10/14〜17頁）、`v845-pages.json`（PDF17〜19/27〜34頁）、巻末年表の原本画像 `extra-book-renders/pdf-119.png` を確認した。AI/IoTは教科書では短注と事例であり、今回の詳細モデルは授業の拡張である。図や例題を複製せず、架空の場面・問い・説明を新作した。

授業原本 `/Users/takashi/授業スライド/情報_授業スライド_01情報社会.pptm` をZIP/XMLとして読み、8枚目のコミュニケーションの変遷、11〜12枚目の匿名性、13枚目の情報格差を参考にした。マクロを実行せず、原本を変更しない。原本は `/Users/takashi/Documents/GAS/webedu/ppt/情報_授業スライド_01情報社会.pptm` とSHA256一致（`9e941349baa84cde68b6449ad0443f83acc8c0bce3cdaba1c7714fff22bbf7bd`）。対応する完成版Google Slidesは今回特定・参照していない。

原本の全インターネット以前/以後を一律に「遅い/速い」とする対照は採用せず、電信・電話・放送が以前からあったことを明示する。匿名性は公開する名前とサービス側等の記録を分け、必ず本人を特定できるとも完全匿名とも断定しない。巻末年表の「世界初」や製品発売年を転載せず、代表例の大まかな年代と社会的な変化を用いる。

## 追加の一次資料

すべて2026-10-04にWeb本文を確認。写真や図の取得・転用はせず、事実と概念の確認に利用した。

| 出典とURL | 確認した内容・採用範囲 |
| --- | --- |
| [Met, The Origins of Writing](https://www.metmuseum.org/essays/the-origins-of-writing) | メソポタミアの粘土板による経済的な記録と多様な文書。文字の起源には研究上の幅があるため、唯一の起源や厳密な発明年を断定しない。 |
| [Library of Congress, The Gutenberg Bible](https://www.loc.gov/exhibits/bibles/the-gutenberg-bible.html) | 西欧の金属活字印刷、1455年頃のグーテンベルク聖書。世界最初の印刷とは書かない。 |
| [ITU, From telegraph to telephone](https://www.itu.int/en/history/Pages/ITUsHistory.aspx) | 19世紀の電信・電話、物を運ぶことと電気信号を送ることの違い、設備と国際的な接続。個別の発明者・世界初を列挙しない。 |
| [ITU, Radio](https://www.itu.int/en/history/Pages/ITUsHistory-page-2.aspx) | 1920年代の放送の拡大。個別の国内放送開始日を教えない。 |
| [ITU, Television](https://www.itu.int/en/history/Pages/ITUsHistory-page-4.aspx) | 機械式から電子式へのテレビの発達。細かな発明年や世界初は用いない。 |
| [CERN, The birth of the Web](https://home.cern/science/computing/the-birth-of-the-web/) | 1989年のWebの考案と研究者の情報共有。Webとインターネットを区別する。 |
| [Computer History Museum, Schickard's Calculator and The Pascaline](https://www.computerhistory.org/revolution/calculators/1/47) | 17世紀の歯車式計算機の例。性能や世界初は断定しない。 |
| [Computer History Museum, Computers](https://www.computerhistory.org/timeline/computers/) | 電子計算機・プログラムの変化、PCの広がり、携帯端末への機能融合。代表的な時期にまとめ、製品スペックや原寸比較はしない。 |
| [Computer History Museum, Networking & The Web](https://www.computerhistory.org/timeline/networking-the-web/) | 通信と計算機の並行した発達、異種ネットワークの接続、共同作業や情報共有の拡大。パケット等の仕組みはNWへ委ねる。 |
| [NIST, Internet of Things glossary](https://csrc.nist.gov/glossary/term/internet_of_things) | ネットワークに接続する物、センサー・制御装置などとデータ交換。IoTとAIを同一視しない。 |
| [NIST AI RMF 1.0（2023）](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) | 予測・推薦などの出力、データと利用条件、偏り、妥当性や人の関与。現在の製品能力や正答率は扱わない。公式サイトでは改訂中だが、基礎概念は固定版1.0で確認した。 |
| [NIST Generative AI Profile（2024）](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | もっともらしい誤った出力、根拠確認、利用場面に合う評価。生成AIから実際に出力を取得していない。 |
| [ITU, Development to bridge the digital divide](https://www.itu.int/en/history/Pages/ITUsHistory-page-8.aspx) | 国・地域・社会集団間の利用機会、安価な接続・基盤・能力育成。現時点の人口や利用率は採用しない。 |

British Museum、NHK、Internet Society等の一部ページは取得不可だったため、確認済みの資料として扱わず、上表の一次資料へ切り替えた。

## 実装と表示

共通の `lesson-slide-deck.css/js`、既存 `information-society.css/js`、主担当の `lesson-progress.css/js` を共用する。固有CSSは `.is-technology` 配下のレイアウトと独自図、固有JSは語句・説明例の開閉、印刷時の展開と復元だけを担う。段階進行とスライド移動を複製しない。

SVGにはすべてtitle/descと一意のIDがあり、本文にも判断に必要な情報を置く。全状態の図と文章はソースHTMLに残す。JS無効時は全スライド・全比較・説明を読め、操作ボタンは隠す。印刷時は全比較・段階説明・語句・説明例を展開する。テーマ、3段階文字サイズ、390px、reduced motionを共通変数・基盤で支える。既存IS資産と専用CSS/JSはSHA384 SRIをHTMLへ指定する。

教材以外へのリンクは上記の一次出典のみ。ライセンス未確認の写真や第三者の図を取り込まず、外部原本の生成物にも触れない。

## 検証

```sh
node --check js/technology-society.js
node scripts/test-technology-society-pages.mjs
PLAYWRIGHT_MODULE=/path/to/playwright JOHO_TEST_URL=http://127.0.0.1:8896/ node scripts/test-technology-society-browser.mjs
node scripts/test-lesson-slide-pages.mjs
node scripts/test-information-society-pages.mjs
node scripts/test-information-media-pages.mjs
node scripts/test-information-security-pages.mjs
node scripts/test-logic-applications.mjs
node scripts/test-sound-pages.mjs
node scripts/generate-slide-pages.mjs --check
node scripts/validate-slide-content.mjs
git diff --check
```

2026-10-04に上記をすべて実行し合格した。固有静的検証は4ページ・28スライド・21比較モデルの構造、SVGのtitle/descと一意のID、ローカル参照、SRI、JS無効時のソース本文、教材間リンクを追加していないことを確認する。64のSVGをXMLとしても構文検証した。既存共通スライド571件、音606件、論理回路4件と、既存IS・メディア・セキュリティの静的検証も合格した。

実ブラウザーはChromeとPlaywright WebKitを使用し、4ページすべてで1440/720/390px、明/暗/システムテーマ、標準/大/特大の27組合せと全7スライドを検証した。各比較の全状態も各幅・特大文字で確認した。NextのEnter/Space操作、最終段階の停止、戻る・段階リセット、比較のリセット、Tab/Shift+Tabとフォーカス保持、スライド移動後の段階と比較状態の保持、語句と説明例の開閉、入力保持、タッチ操作、JS無効時の全状態表示を確認し、横方向のはみ出し・ローカル参照のHTTPエラー・JavaScript例外はなかった。WebKitのフォーカス移動はmacOSのキーボード操作設定に対応するAlt+Tabも使用した。

印刷では両エンジンで全段階・全比較・語句・説明例の展開と画面状態の復元を確認した。ChromeのA4 PDFはis61が8頁、is62が8頁、is63が7頁、is64が10頁で、全7本文見出しが含まれる。代表的なPDF紙面をPNGにして図・文章・改ページを目視し、説明課題のみが孤立する改ページを修正した。デスクトップと390pxの代表画面も画像で確認した。PDFは内部検証用で、納品対象はWeb教材である。

この独立実装では正式台帳が未登録のため、共通表紙を加えた統合状態とオンライン反映は主担当が検証する。Safariアプリ・スマートフォン実機・対応する完成版Google Slidesは未確認。
