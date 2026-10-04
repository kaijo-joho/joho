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
| [NIST Generative AI Profile（2024）](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | もっともらしい誤った出力、根拠確認、利用場面に合う評価。本文の文章案は教材独自の例であり、生成AIの文章出力を取得していない。下記の情景画像は別途画像生成した。 |
| [ITU, Development to bridge the digital divide](https://www.itu.int/en/history/Pages/ITUsHistory-page-8.aspx) | 国・地域・社会集団間の利用機会、安価な接続・基盤・能力育成。現時点の人口や利用率は採用しない。 |

British Museum、NHK、Internet Society等の一部ページは取得不可だったため、確認済みの資料として扱わず、上表の一次資料へ切り替えた。

## 実装と表示

共通の `lesson-slide-deck.css/js`、既存 `information-society.css/js`、主担当の `lesson-progress.css/js` を共用する。固有CSSは `.is-technology` 配下のレイアウトと独自図・情景画像、固有JSは語句・説明例の開閉、印刷時の展開と復元、情景画像の印刷時読み込みを担う。段階進行とスライド移動を複製しない。

SVGにはすべてtitle/descと一意のIDがあり、本文にも判断に必要な情報を置く。全状態の図と文章はソースHTMLに残す。JS無効時は全スライド・全比較・説明を読め、操作ボタンは隠す。印刷時は全比較・段階説明・語句・説明例を展開する。テーマ、3段階文字サイズ、390px、reduced motionを共通変数・基盤で支える。既存IS資産と専用CSS/JSはSHA384 SRIをHTMLへ指定する。

教材以外へのリンクは上記の一次出典のみ。ライセンス未確認の写真や第三者の図を取り込まず、外部原本の生成物にも触れない。

## 生成画像による場面の補強

2026-10-04の追加依頼「isの方は生成画像をたくさん使って、その情景を創造しやすくして」に基づき、built-in `image_gen__imagegen` を実際に12回呼び、1回につき独立した1場面を生成した。合成シートの切り出しやCLI/APIへの切り替えは行っていない。

| ページ | 追加した3場面（本文スライド番号） |
| --- | --- |
| is61 | 手書きの記録と手紙の受渡し（1）／15世紀西欧の架空の印刷工房（2）／地域センターでの番組視聴とネット参加（4） |
| is62 | 帳簿と機械式計算道具（1）／20世紀の架空のコンピュータ室（2）／端末で予定と道順を確認する暮らし（4） |
| is63 | 学校でのセンサー値と実環境の確認（2）／AI分類候補と実物・資料の照合（3）／生成された文章案と参考資料の照合（4） |
| is64 | 利用者を支援する窓口と別の手段（2）／集計・確認と相談対応の分担（3）／本の候補を異なる情報源で比べる（5） |

全画像のaltとcaptionに生成イメージと明記し、架空の場面を通じて人の行為・道具・確認対象を観察する問いを添えた。歴史的な画像は史料写真・特定人物・機種・工房の正確な復元・歴史的事実の直接証拠として扱わない。画像内の細かな文字、値、機器の構造は判断の根拠にせず、事実説明と構造・条件の比較は確認済みの本文と既存SVGで行う。

画像は既存の予想段階（stage 0）に配置し、NextでSVGの比較操作へ進む。7本文スライド、21モデル、64SVG、事実文章と演習の構造を保持する。画像だけに必須情報を置かない。画像には寸法1536×1024、`loading="lazy"`、`decoding="async"`を指定し、テーマ・文字サイズ・狭い画面に応じてcaptionを配置する。印刷では全3場面をcaptionと一緒に展開する。

原状master12枚は `/Users/takashi/Documents/Codex/2026-10-04/task-2/generated-scenes/is6/masters/` に保存し、ツール実出力とのbyte一致とSHA256を確認した。正確なプロンプトは同系列の `prompts.json`、実出力パスの記録は `generation-log.json`、完全な来歴とchecksumは `manifest.json` に保存した。原状PNG計26,034,439 bytesを保持し、Pillowは同解像度でのWebP形式変換と圧縮（quality 82 / method 6）にだけ使用した。内容・構図の編集、切り出し、リサイズは行っていない。

Web用資産は `img/technology-society/scenes/` 内の12WebP、合計1,579,910 bytes。各100,460〜201,016 bytes。リポジトリ側の[画像manifest](../img/technology-society/scenes/manifest.json)にも正確なプロンプト、built-in引数、原画像とWebPのSHA256、寸法、容量、captionを記録する（manifest自体は47,338 bytes）。

WebKitで表紙から直接印刷した場合、画面外の遅延画像が1枚読み込まれないことを実測したため、専用JSの印刷モードで画像のloadingを一時的にeagerへ変更し、終了時にlazyへ復元する。共通スライド・段階進行は変更せず、専用CSS/JSのSRIを4HTMLで更新する。

## 検証

```sh
node --check js/technology-society.js
node scripts/test-technology-society-pages.mjs
node scripts/test-technology-society-scenes.mjs
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

初回制作の印刷検証では両エンジンで全段階・全比較・語句・説明例の展開と画面状態の復元を確認した。表紙登録前のChrome A4 PDFはis61が8頁、is62が8頁、is63が7頁、is64が10頁で、全7本文見出しが含まれた。代表的なPDF紙面をPNGにして図・文章・改ページを目視し、説明課題のみが孤立する改ページを修正した。デスクトップと390pxの代表画面も画像で確認した。PDFは内部検証用で、納品対象はWeb教材である。

初回の独立制作後、主担当の統合で正式台帳の表紙が追加された。今回の画像補強では台帳・公開設定・教材間リンク・検索索引を変更しない。

画像補強後もChromeとPlaywright WebKitで4ページ×1440/720/390px×全テーマ×文字3段階、全7本文、各比較の全状態、Next・戻る・リセット・フォーカス・タッチ・語句・演習・JS無効を再検証して合格した。追加12画像は全状態で縦横比を保ち、captionと画像がはみ出さない。各画像のデコードと自然寸法を確認し、全生成原画像、代表的なデスクトップ・390pxのfigure画像を目視した。追加前のbodyと、追加figureを取り除いた後のbodyが一致することも確認した（空白差を除く）。

fresh-coverからの印刷は、未表示の画像3枚すべての読み込み、各caption、画面復帰後のlazy設定復元を両エンジンで確認した。最終Chrome A4 PDFは表紙込みis61が11頁、is62が10頁、is63が11頁、is64が12頁。Popplerで各PDFに1536×1024の画像が3枚埋め込まれていることと、生成イメージcaptionが3件含まれることを確認した。PDF紙面をPNGで目視し、is61のWebとインターネットの注記のみが孤立した改ページを専用CSSで修正して印刷を再確認した。ページ内JavaScript例外・ローカル資産のHTTPエラーはなく、静的・画像manifest・SRI・既存必須検証とdiffチェックに合格した。

Safariアプリ・スマートフォン実機・対応する完成版Google Slidesは未確認。正式統合後のオンライン反映は主担当が確認する。
