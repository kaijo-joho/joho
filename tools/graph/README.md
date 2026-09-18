# グラフエディタ 0.23.0 BETA

0.23.0では、2Dグラフの軸を直接クリックして選択できるようにした。右の書式パネルでは横軸・縦軸・高さ軸を選び、軸線の色・幅、目盛、グリッドの表示・色・幅・線種を軸ごとに変更できる。3Dのグリッド線種は実線とし、3Dはパネルから軸を選択する。分析グラフ、比較表示、散布図行列にも同じ書式を反映し、行列は横方向・縦方向ごとに設定する。既存の座標・目盛の詳細設定は併存する。保存形式はversion 15で、未指定の軸書式は従来の全体設定とテーマ表示を保つ。

0.22.0では、1文書1タブの複数ファイル切替に対応した。文書・履歴・表示倍率・保存先を独立して保持し、新規作成と読み込みは新しいタブで開く。未保存タブの終了確認、文書ごとの自動／明示保存、前回の保存先への⌘/Ctrl+Sに対応する。右端のタブは26pxを基準にアイコンと縦書きへそろえた。保存形式はversion 14のまま。詳細は [複数文書と右側タブ](docs/document-tabs.md) を参照。

0.21.0では、共通仕様に合わせ上部ツールバーを標準41pxの1行へ整理した。ファイル・履歴・選択・表示を並べ、右端に設定とヘルプを置く。作図・分析・比較の切替を表示メニューへ移し、グラフ上の見出し行を廃止した。狭い画面は「その他」へ操作をまとめ、テーマは設定内のアイコンで切り替える。この時点では複数ファイルタブを保留し、右の書式パネルを維持した（0.22.0で複数ファイルに対応）。詳細は [上部ツールバーの仕様](docs/toolbar-layout.md) を参照。

0.20.1では、「データを取り込む」の用意済み・URL・ファイル切り替えと、取り込みプレビューにもモーダルの高さ固定を適用した。

0.20.0では、右パネルから自由な色を直接選べるようにし、線幅・不透明度のスライダーと線種の見本ボタンを追加した。数表はクリックでセル選択、矢印キーで移動、Enter・F2・ダブルクリック・文字入力で編集する。表の下・右の＋から行・列を追加でき、列＋には計算列もまとめた。タブ付きモーダルの高さを固定し、広い画面では列の割り当てを常時表示する。保存形式はversion 14を維持する。詳細は [編集画面の整理](docs/dialog-usability.md) を参照。

0.19.0では、数表・数式、座標設定、分析グラフの編集画面を目的別のタブへ整理した。入力途中の値は切り替えても保持し、入力エラーの欄は該当タブ・折りたたみを開いて表示する。数表の行・列・計算操作とデータ取り込みにアイコンを加え、列割り当てと詳しい説明は必要なときに開く。保存形式はversion 14を維持する。詳細は [編集画面の整理](docs/dialog-usability.md) を参照。

0.18.0では、座標設定に軸別の拡大率スライダーと、散布図行列を追加した。数値2〜4列の組み合わせ、対角のヒストグラム、相関係数と使用数、元のデータ行との連動に対応する。相関比較・振り子・東京の月別平年値の3テンプレートを加え、標準テンプレートは33件になった。保存形式はversion 14で、version 1〜13を移行できる。詳細は [軸スライダー・散布図行列](docs/axis-zoom-matrix.md) と [テンプレートの出典と条件](docs/matrix-template-sources.md) を参照。

0.17.0では、PNGコピー、用途別の画像寸法、画像プレビュー、出典・条件のテキストコピーを追加した。数表のCSV保存は右パネルの「…」から「数表・出典」の詳細画面へ移し、別次元の系列を表示するボタンは必要な場合に直接表示する。計算列を使う物理・情報テンプレート4件と、気象庁・NOAAの固定資料データ3件を加え、標準テンプレートは30件、同梱データは7件となった。保存形式はversion 13を維持する。詳細は [教材出力・ライブラリの仕様](docs/publication-library-contract.md) を参照。

0.16.0では、計算列に前後の行参照と範囲集計を追加した。`[@気温,-1]` で1行前、`[@気温,+1]` で1行後、`AVERAGE([@気温,-2:0])` で現在を含む直近3行の平均を計算できる。参照はメニューから挿入でき、表からはみ出す範囲は空欄にする。保存形式はversion 13で、旧version 1〜12を読み込める。version 12の列名に含まれるカンマ等は引用して、以前の式の意味を保つ。

0.15.0では、元データを残して式から更新する計算列を追加した。同じ行の `[@列名]` と列全体の `SUM([列名])`・`AVERAGE([列名])` 等を組み合わせ、単位換算・偏差・割合を計算できる。列名・関数の挿入メニュー、プレビュー、計算エラーの表示を備える。保存形式はversion 12で、旧version 1〜11を読み込める。詳しくは [計算列の仕様](docs/calculated-columns.md) を参照。

0.14.0では、複数選択・書式のコピーと、日付・カテゴリ軸を追加した。数表は数値・日付・カテゴリの列を保持し、実際の日数間隔と系列をまたぐカテゴリ順で描画する。表の列型選択、見出し・行番号の固定も追加した。保存形式はversion 11で、旧version 1〜10を読み込める。詳しくは [複数選択・日付とカテゴリの仕様](docs/selection-typed-tables.md) を参照。

0.13.0では、空の区分見出しを隠し、一覧のドラッグ並べ替えを追加した。「︙」のホバー・クリック・タップで表示切替・複製・削除を行い、右パネルは書式を常時表示する。代表色5色とRGB指定1つを置き、線・不透明度・文字の配置を直接調整できる。分析グラフの非表示は比較と画像出力にも反映し、係数の非表示は左の値操作だけを隠して計算値を保つ。保存形式はversion 10の任意項目を追加し、旧作品を維持する。

0.12.0では、選択対象の書式を右パネルへ移し、左の追加を1つの＋にまとめた。各行の「︙」で並べ替え・削除を行った（0.13.0で下記の操作へ変更）。方向別の拡大縮小、座標設定の2列表示、軸の近く／下・左を選べる目盛数値の配置にも対応する。保存形式はversion 10を維持し、以前の作品では目盛数値を従来の下・左に表示する。詳しくは [書式パネルの仕様](docs/inspector-layout.md) を参照。

0.11.0では、物理モデル6件と物性・状態図4件を追加し、標準テンプレートを26件に拡充した。水・二酸化炭素の状態図には三重点・臨界点・1気圧を表示し、対数軸上のラベル配置も修正した。同梱オープンデータは東京に札幌・那覇・太陽系8惑星を加えた4件となり、検索できる。保存形式はversion 10を維持する。出典・計算条件は [テンプレートの出典](docs/template-sources.md) を参照。

0.10.0では、同梱オープンデータ、公開CSVのURL、ローカルCSV・TSVをまとめた取込画面を追加した。文字コード・見出し・列を推測し、プレビュー、列選択、欠測の確認、地域などの抽出、日付の数値変換、出典の保存ができる。直接取得できない公開元はダウンロードして選択する手順を示す。詳細は [オープンデータ取込仕様](docs/open-data-import-plan.md) と [同梱データの出典・利用条件](docs/open-data-sources.md) を参照。保存形式はversion 10を維持する。

0.9.0では、分析グラフごとの軸・書式・回帰式表示と複製、数表の行と点の連動、元データを残した回帰の使用・除外を追加した。詳細は [グラフ編集・行選択の契約](docs/chart-editing-row-link-contract.md) を参照。

0.8.0では、残差グラフ、相関行列からの散布図、ヒストグラム・箱ひげ図、自作テンプレート、複数グラフの比較配置と画像・印刷を追加した。詳細は [分析グラフ・テンプレート・比較](docs/statistical-charts-contract.md) を参照。0.7.0の作図連携・数表・統計・教材出力は維持する。

数学・理科・情報で使うグラフを、数式または数表から作成する独立ウェブアプリ。初期の名称は「グラフエディタ」、開発担当はCodex。既存のフローチャート・イラポ・構造式・分子模型エディタと操作方針をそろえる。

## 実装済みの範囲

- 2D関数 `y=f(x)`、3D曲面 `z=f(x,y)`。複数の系列を重ね、表示・非表示を切り替える。2D/3Dを切り替えても、別の次元の系列は保持する。
- 2D陰関数 `F(x,y)=0` / `左辺=右辺`、媒介変数 `x(t),y(t)`、極座標 `r(theta)`。計算範囲と媒介変数の区間を指定。
- 自由点・曲線上の点、軸への読取線、縦横の補助線、`y=f(x)` の接線、関数・接線から任意の2対象を選ぶ統一した交点、2点を共有IDで結ぶ線分、文字注釈。線分は終点から続け、既存点へ接続できる。参照元の式や係数を変えると連動し、元の系列・注釈を削除すると依存する注釈もまとめて削除・Undo復元。2Dで表示し、3Dへの切替中も保持。
- 数式の四則・累乗・括弧・暗黙乗算、三角関数、逆三角関数、平方根、指数・対数、絶対値、丸め、min/max。定数pi/e、係数、ラジアン／度。lnは自然対数、logは常用対数。
- 2〜20列・1万行までの2D/3D数表をセル編集でき、CSV・TSVの全列を保持する。x・y・z・横誤差・縦誤差の列は明示的に割り当て、未使用列も保存する。3/4列CSVの誤差列を自動推定せず、散布図・折れ線・補間・欠測・誤差棒へ反映する。
- 係数の追加・数値入力・スライダー、設定した最小値・最大値・刻み幅。値のスライダーと数値欄は左パネルに常設し、操作中は描画と接線式をプレビュー、確定時だけ1回の履歴・保存へ反映する。
- 軸の数式用記号・表示名・単位・範囲・通常／対数目盛・目盛間隔と表記（自動・小数・分数・π）・等縮尺・凡例・グリッド。軸を選んで、軸線の色・幅、目盛、グリッドの表示・色・幅・線種を個別に設定できる。2Dでは軸を直接クリックでき、3Dでは右パネルで横・縦・高さを選ぶ。分析・比較・散布図行列にも反映し、行列は横・縦方向別に設定する。既存の座標・目盛の詳細設定はそのまま使える。記号はUnicode識別子を使え、数式入力と連動する。表示名と単位は表示用で、値を換算しない。
- 注釈ラベルの表示・位置・文字サイズ、点・文字のドラッグ。接線式は左一覧で常に確認でき、図中の表示は設定で切り替える。表示は基本8桁の有効数字で丸め、計算と保存の精度は保つ。旧文書の図中接線式は非表示で移行する。数値だけの自由点・文字位置はドラッグで更新できるが、`1/2` や係数を含む式は失わず、ダイアログで編集する。
- 接線は左の追加メニューから座標欄を開き、入力中に線と方程式をプレビューして登録する。詳細は右ペインの編集画面または一覧のダブルクリックで開く。未登録のプレビューは履歴・保存・書き出しに含めない。
- 追加操作は左の1つの「＋追加」に集約し、数式・数表・CSV、点・線分・領域・接線・交点・文字・補助線、回帰・分析グラフ・係数を同じ入口から選ぶ。選択すると右ペインへ移り、「書式」タブで編集する。書式は最初からすべて表示し、数式・数表などの詳細設定と関連グラフ追加はモーダルで行う。左の各行は同じ区分内でドラッグでき、Option/Alt＋↑↓・Home・Endでも並べ替えられる。「︙」へホバーするかクリック・タップして、表示切替・複製・削除を行う。各操作はUndoで戻せる。空の点・線分・文字、分析グラフ、係数の区分は見出しごと隠す。係数スライダーは初期表示し、非表示にしても数式の計算値は変わらない。詳細は [右インスペクターの配置契約](docs/inspector-layout.md) を参照。
- 右の書式パネルから選択した曲線上の点・接線・交点、数表の回帰・分布図などの関連グラフを追加できる。グラフの空白クリック／タップまたはEscapeで選択解除し、ドラッグ・拡大縮小中は選択を保つ。
- 数表から直線、原点を通る直線、2次、指数、べき乗の5種類の回帰を作成できる。回帰曲線は点・接線・交点・領域の参照元にできる。回帰式、R²、Pearsonの相関係数r、RMSE、残差一覧と残差CSVを確認し、元の数表を変更すると再計算する。
- 選択列の統計量（n、欠測数、合計、平均、中央値、最小、最大、nで割る分散・標準偏差、n−1で割る不偏分散・標準偏差）と、ペアごとの有効数付きPearson相関行列を表示・CSV出力できる。
- 残差グラフ（横軸の値／予測値）、相関行列セルからの散布図と回帰、ヒストグラム、複数列の箱ひげ図。元の数表に連動し、四分位数の計算方法・最小最大のひげを明記する。分析グラフは12枚まで保存できる。
- 作図と分析グラフを最大6枚、1〜3列で比較。順序を変え、単独表示と切り替え、まとめてPNG・SVG・印刷へ出力する。狭い画面は1列。
- 自作テンプレートを20件まで登録し、名前・説明の変更、ファイルへの保存・取り込み・削除ができる。数表の値も含める例示用と、列・設定だけ残す再利用用を選べる。
- テンプレート：2次関数、正弦関数の比較、水の飽和蒸気圧、理想気体PVモデル、計算量比較、放物面・鞍型曲面、円の方程式、媒介変数の楕円と点、極座標の花形、接線と交点。
- 元の式・数値・出典を保存するJSON。自動保存と明示保存をブラウザ内で独立保持し、再開時に選択。ローカルファイルの明示保存・自動保存。
- 現在のグラフをPNG、2DをSVGで書き出す。PNGを直接コピーし、画像の確認画面から同じ画像を保存できる。プリント・16:9スライド・正方形のサイズ設定、幅・高さ・余白・文字サイズ、白／透明背景、A4／JIS B5の縦横と印刷用タイトルを設定できる。作品全体の出典・条件をテキストでコピーできる。数表の詳細画面から編集中の値をCSV保存し、統計量もCSVへ出力する。
- 左一覧は式を大きく表示し、種別の常設文字を省いて余白・行間を詰める。種別はツールチップと読み上げで伝え、非表示・別モードの状態は残す。上部1行、ファイルのアイコン、illustSlideと同じUndo・Redoの線画、狭い幅の開閉メニュー、テーマ3種類、操作文字3段階、キーボード、共通の非モーダルヘルプ。

表の元データ、近似式による計算値、資料から採った数値を出典欄で区別する。水の数表はIAPWSの式による**計算値**であり、実測値とは表示しない。出典と条件は [テンプレートの出典](docs/template-sources.md) を参照。

接続した線分で囲まれた領域の塗りつぶし・不透明度・面積表示にも対応する。頂点・係数の変更に追従し、境界の削除もUndoで復元できる。単純な凹多角形に対応し、自己交差・零面積・未定義時は領域だけを非描画にして理由を表示する。テンプレート「三角形の領域と面積」で試せる。

関数・登録済みの接線と横軸、または2つの関数・接線の間も塗りつぶせる。「領域」で「曲線と軸・曲線の間」を選び、境界2つと区間を指定する。区間にpiや係数の式を使え、係数の変更に追従する。面積は非負、定積分は「第1 − 第2」の符号付き積分として区別し、交差した複数部分を含めて計算する。色・不透明度・数値表示は右の書式パネルで変更できる。テンプレート「曲線の間の面積」「面積と定積分の違い」を追加した。詳細は [曲線による領域](docs/curve-regions-contract.md)。

## 数値処理と表示

数式は許可した構文木を解釈し、JavaScriptとして実行しない。実数として定義されない点や非有限値は描画しない。2Dはサンプル数に上限を持つ適応分割、3Dは格子による数値表示。典型的な漸近線・未定義領域で線や面を切る。任意の数式のすべての不連続や非常に細かい振動を検出する保証はなく、厳密な数式処理・数学的証明には使わない。

陰関数は表示範囲と定義範囲の共通部を格子化し、辺の残差を確認して線を描く。重根・孤立点・格子より細かい曲線は検出できない場合がある。媒介変数・極座標も有限分割し、明らかな不連続をつながない。接線は左右の数値微分を比較し、交点は指定区間と両式の定義範囲を数値探索する。数値的に区別できない式は理由を表示し、解を数学的に証明するものではない。曲線のサンプリングは1系列あたり30,000回の式評価・12,000描画点を上限とし、上限到達は表示する。

ブラウザ表示と画像出力はPlotly.jsの固定版をローカル同梱して使用する。ライブラリ・同梱データの表示にCDNや外部サーバーへの接続は不要。公開CSVのURL取り込みを利用者が実行したときだけ公開元へ取得要求を送り、Cookie・認証情報・編集中の数表は送信しない。サーバー代理取得は行わない。出典ページのリンクは利用者が開いたときに遷移する。3DにはWebGLが必要で、初版の3D出力はPNG。白または透明な背景を選べ、編集画面のテーマを変更しない。

曲線領域の面積・定積分は適応Simpson法による数値近似。各境界の指定範囲に区間全体が入ることを確認し、交差点で塗り分ける。非有限値・対数軸で描けない部分・未収束・計算上限では数値と塗りを出さず理由を表示する。1領域につき32768座標での境界評価を上限とし、広義積分や陰関数・媒介変数の閉曲線は対象外。細かい振動や尖った形状の完全な検出は保証しない。

## 保存と互換性

形式は `kaijo-graph` version 15。`axes.x`・`axes.y`・`axes.z` の任意の `style` は、`color`、`width`、`grid`、`gridColor`、`gridWidth`、`gridDash`、`tickMarks`、`tickLabels` を必要な項目だけ保存する。未指定項目は全体設定・テーマによる従来の表示を使う。0.13.0の `charts[].visible` と `parameters[].visible` は省略時に表示する任意項目。係数を非表示にしても定義は有効で、分析グラフの比較所属IDも保持する。version 1〜14を読み込んで移行し、多列数表・計算列の式・回帰参照・表示・出力に加えて分析グラフの軸・書式、比較配置、数表の回帰除外行を保存する。旧形式へ新フィールドや回帰注釈を混在させた文書は受け付けない。保存するのは元の数値・式・設定で、補間点や回帰計算結果は保存しない。計算列の結果はキャッシュとして保存し、読込時に入力値と式から再計算する。ファイル名は `名前.graph.json`。3Dカメラの向き、選択状態、テーマは作品の数値データとは分ける。

ブラウザの保存キーは `kaijo-graph:auto` / `kaijo-graph:saved`、表示設定は `kaijo-graph:settings`、ヘルプは `kaijo-graph:help`。他アプリの保存領域と共用しない。保存済みの片方が壊れても他方を選べる。読込時は検証が成功するまで現在の文書を置き換えない。

文書は2MB、100系列、100注釈、20係数、数表は1系列10000行・全体50000行まで。CSV入力は1MB。数値は有限で、データ座標と軸範囲には絶対値10億までの境界を設ける。これらは入力の保護境界であり、最大量での操作速度を保証する値ではない。

ローカル自動保存はChromeで明示的に選択したファイルへ行う。明示保存と別のファイルを使い、このセッションで終了する。書き込み順序、外部変更検出、停止後の古い保存、明示保存先との混同を防ぐため、検証済みの `../illustslide/local-autosave.js` を変更せず利用する。グラフアプリがファイル選択とJSONエンコーダーを渡すため、イラポの保存形式や保存データは使用しない。ブラウザ保存やダウンロードも利用できる。

## 構成

| ファイル | 役割 |
|---|---|
| `expression.js` | 制限付き数式解析と実数評価 |
| `symbols.js` | 軸記号の変換・検証、目盛表記、注釈の安全な文字表示 |
| `icons.js` | 操作に共用する安全な線画SVGアイコン |
| `dialog-ui.js` / `dialog-ui.css` | 入力を保持するタブ・見出し・入力エラー箇所の表示 |
| `selection.js` | 複数選択の参照と書式コピー・一括適用 |
| `list-reorder.js` | 一覧のドラッグ・タッチ・キーボード並べ替え |
| `view-controls.js` | 線形・対数軸の方向別拡大縮小と範囲検証 |
| `core.js` | 文書検証・履歴・ブラウザ保存・CSV/TSV |
| `curves.js` | 陰関数・媒介変数・極座標のサンプリングと曲線上の点 |
| `annotations.js` | 点・補助線・接線・交点・領域の数値計算 |
| `regions.js` | 線分の閉路追跡・単純多角形の検査・面積・包含判定 |
| `integrals.js` | 曲線間の適応数値積分・面積・交差による塗り分割 |
| `analysis.js` | 正規化した座標による5種類の最小二乗回帰・統計量・残差 |
| `data-curves.js` | 元の行順と欠測を保持するPCHIP補間 |
| `tables.js` / `table-editor.js` / `table-editor.css` | 数表のセル編集・列割当・CSV/TSV |
| `calculations.js` | 計算列の参照・依存順検査・制限付きの式評価 |
| `statistics.js` | 四分位数を含む統計量・Pearson相関行列 |
| `charts.js` / `workspace.js` | 残差・散布・分布図、比較配置と画像合成 |
| `template-library.js` | 自作テンプレートの検証・ブラウザ保存・ファイル形式 |
| `plot.js` | 2D/3D描画・関数と曲面のサンプリング・画像出力 |
| `publication.js` | 用途別寸法・PNGクリップボード・出典テキスト |
| `templates.js` | 式・数表・条件を持つ初期テンプレート |
| `physics-templates.js` | 係数を変えて調べる物理モデル6件 |
| `science-templates.js` | 出典と適用範囲を持つ物性・状態図4件 |
| `calculation-templates.js` | 速度・抵抗・単位換算・移動平均の計算列テンプレート4件 |
| `water-properties.js` / `co2-properties.js` | 公開相関式による相境界・水の密度の計算 |
| `editor.js` / `editor.css` / `index.html` | 操作画面 |
| `document-sessions.js` / `document-store.js` | 文書別の履歴・未保存判定・ブラウザ保存 |
| `document-tabs-ui.js` / `document-tabs.css` | 複数文書タブ・右側タブ |
| `toolbar.js` / `toolbar.css` | 1行ツールバー・ホバーメニュー・狭い画面への再配置 |
| `style-ui.js` / `style-ui.css` | 色・線種・スライダーの直接操作 |
| `dialog-ui.js` / `dialog-ui.css` | タブとモーダル内の共通操作 |
| `vendor/` | 固定版Plotly.jsとライセンス |
| `../shared/help-panel.*` | 共通の非モーダルヘルプ |
| `../shared/ui-kit.*` | 共通UIの配色・文字サイズ変数とツールチップ（既存ファイルを変更せず参照） |

ビルド工程は不要。リポジトリをHTTPサーバーで配信して `tools/graph/` を開く。

## 続く実装

残差・分布・相関の可視化、自作テンプレート、複数グラフの比較配置、複数選択・書式コピー、日付・カテゴリ軸、計算列、前後の行参照・移動平均、教材への画像コピーは実装済み。次の候補は、表操作の仕上げと授業で必要な資料の追加。日付計算や自己列の前行を使う漸化式は、必要な授業例を確認してから仕様を決める。

3Dの空間曲線・等高線・断面の拡張は保留。

以上は今後の計画。一般の3D陰曲面・CAS・重み付き回帰・授業管理・課題提出連携は未実装。

## 検証

```sh
node tools/graph/tests/dialog-usability-browser.test.cjs
node tools/graph/tests/dialog-height-browser.test.cjs
node tools/graph/tests/style-controls-browser.test.cjs
node tools/graph/tests/table-grid-browser.test.cjs
node tools/graph/tests/table-usability-browser.test.cjs
node tools/graph/tests/import-usability-browser.test.cjs
node tools/graph/tests/publication.test.cjs
node tools/graph/tests/publication-library-browser.test.cjs
node tools/graph/tests/calculation-templates.test.cjs
node tools/graph/tests/reference-data.test.cjs
node tools/graph/tests/calculations.test.cjs
node tools/graph/tests/calculation-core.test.cjs
node tools/graph/tests/calculation-table-browser.test.cjs
node tools/graph/tests/selection.test.cjs
node tools/graph/tests/multiselect-browser.test.cjs
node tools/graph/tests/typed-tables.test.cjs
node tools/graph/tests/typed-tables-browser.test.cjs
node tools/graph/tests/typed-charts.test.cjs
node tools/graph/tests/typed-axis-plot-browser.test.cjs
node tools/graph/tests/view-controls.test.cjs
node tools/graph/tests/axis-label-position.test.cjs
node tools/graph/tests/axis-label-browser.test.cjs
node tools/graph/tests/inspector-browser.test.cjs
node tools/graph/tests/sidebar-actions-browser.test.cjs
node tools/graph/tests/list-reorder-browser.test.cjs
node tools/graph/tests/core.test.cjs
node tools/graph/tests/axis-style.test.cjs
node tools/graph/tests/axis-inspector-browser.test.cjs
node tools/graph/tests/templates.test.cjs
node tools/graph/tests/plot.test.cjs
node tools/graph/tests/curves.test.cjs
node tools/graph/tests/annotations.test.cjs
node tools/graph/tests/regions.test.cjs
node tools/graph/tests/integrals.test.cjs
node tools/graph/tests/curve-regions.test.cjs
node tools/graph/tests/region-plot.test.cjs
node tools/graph/tests/analysis.test.cjs
node tools/graph/tests/analysis-core.test.cjs
node tools/graph/tests/analysis-plot.test.cjs
node tools/graph/tests/tables-core.test.cjs
node tools/graph/tests/statistics.test.cjs
node tools/graph/tests/charts.test.cjs
node tools/graph/tests/charts-core.test.cjs
node tools/graph/tests/template-library.test.cjs
node tools/graph/tests/workspace.test.cjs
node tools/graph/tests/charts-browser.test.cjs
node tools/graph/tests/template-library-browser.test.cjs
node tools/graph/tests/regression-links.test.cjs
node tools/graph/tests/publication-plot.test.cjs
node tools/graph/tests/data-curves.test.cjs
node tools/graph/tests/symbols.test.cjs
node tools/graph/tests/plot-browser.test.cjs
node tools/graph/tests/browser.test.cjs
node tools/graph/tests/phase2-browser.test.cjs
node tools/graph/tests/phase3-browser.test.cjs
node tools/graph/tests/usability-browser.test.cjs
node tools/graph/tests/quick-style-browser.test.cjs
node tools/graph/tests/quick-tangent-browser.test.cjs
node tools/graph/tests/selection-browser.test.cjs
node tools/graph/tests/sidebar-browser.test.cjs
node tools/graph/tests/regions-browser.test.cjs
node tools/graph/tests/curve-regions-browser.test.cjs
node tools/graph/tests/analysis-browser.test.cjs
node tools/graph/tests/local-autosave-browser.test.cjs
node tools/graph/tests/data-import.test.cjs
node tools/graph/tests/data-fetch.test.cjs
node tools/graph/tests/data-fetch-browser.test.cjs
node tools/graph/tests/open-data-browser.test.cjs
node tools/graph/tests/chart-presentation.test.cjs
node tools/graph/tests/chart-editing-link-browser.test.cjs
node tools/graph/tests/row-selection-browser.test.cjs
node tools/graph/tests/table-editor-excluded-browser.test.cjs
node --check tools/graph/editor.js
git diff --check
```

Chromeを使い、2D・3D描画、式の演算順位、係数、CSVと欠測、保存復元、不正入力時の保持、PNG/SVG/JSON出力、狭い画面、テーマ、キーボード・タッチを確認する。ローカル自動保存はグラフの実UIと模擬ファイルハンドルで、JSONの保存・更新、明示保存先との混同防止、外部変更による停止を確認する。OSの実ファイル選択画面による自動保存は未確認。Safari実機確認は作成者の指示により省略。

## 公開先

`https://joho.kaijo.ed.jp/tools/graph/`。独立ツールとして `tools/index.html` に掲載し、教材の「ページ一覧」GSSや生成物 `js/pages.js` には登録しない。

文書・モジュールの詳細は [0.2実装契約](docs/phase2-contract.md)、[0.3実装契約](docs/phase3-contract.md)、[交点と操作性の調整](docs/usability-contract.md)、[線分による領域](docs/regions-contract.md)、[実験データの分析](docs/data-analysis-contract.md) を参照。
