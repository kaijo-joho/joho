# ワークシート共通スキャンヘッダー

B5・A4の表面にタイトル・氏名・組/番号OMR・ワークシートQR・四隅マーカー、裏面にタイトル・QR・四隅マーカーを加える共通部品。氏名とOMRは表面だけに置き、裏面の生徒情報は同じ両面PDFの表面から引き継ぐ。寸法の正本は `layout.json`、描画と座標の正本は `header.js`。SVG、PDF、GASで同じ座標を使用する。教材本文・解答・名簿はこのフォルダに含めない。

## 成果物と生成経路

| ファイル | 用途 |
| --- | --- |
| `layout.json` | B5基準の実寸、A4倍率、認識下限 |
| `header.js` | 純粋JSの共通生成器。SVGと描画シーン、座標を生成 |
| `generate.mjs` | Node CLI / モジュール。依存QRをローカルで読み込む |
| `vendor/qrcodegen.js` | Project Nayuki製MITライセンスのQR生成器 |
| `pdf_support.py` | 共通シーンをReportLabのベクター・埋込文字として描画 |
| `make_samples.py` | サンプルSVG・JSON・PDFの再生成 |
| `add_header.py` | 既存PDFへ重ねる。新規ファイルへ出力 |
| `scan_core.py` | 座標JSONを使う共通OpenCV読取コア |
| `scan_poc.py` | ローカルPDF/JPEG/PNGの読取CLI。JSON・コンソール・確認画像を出力 |
| `scan_batch.py` | 複数ファイルの順次検証と正解付きmanifestの照合 |
| `reader-config.json` / `requirements-scan.txt` | 読取閾値・処理上限とPython依存 |
| `read_scan.py` | 旧API互換。内部では同じ読取コアを使用 |
| `read_duplex.py` | 1人分の両面PDFのQR検査と表面から裏面への生徒候補継承 |
| `gas-adapter.js` / `gas-style.css` | 既存ワークシートへの差し込みと紙面調整 |
| `build-gas.mjs` | GAS用 `05_scan_header.js`・`24_scan_style.html` を生成 |
| `tests/` | 座標、PDF保全、読取、ブラウザ印刷の検証 |
| リポジトリルート `templates/worksheets/scan-header/` | 表面は `b5.svg/json`, `a4.svg/json`、裏面は `b5-back.svg/json`, `a4-back.svg/json` |
| リポジトリルート `output/pdf/worksheet-scan-header/` | `b5.pdf`, `a4.pdf`, `comparison.pdf`。各2ページで表面・裏面の順 |

SVGは編集可能なtext・circle・rect・lineで構成する。ただし継続的な変更は生成物を手直しせず、設定・生成器へ戻して再生成する。QRは外部の画像API・CDNを使用しない。

## 表面の寸法と3列レイアウト

単位はmm、原点は用紙左上、xは右、yは下。JIS B5は **182 × 257**、A4は **210 × 297**。ISO B5やA5は使用しない。

| 項目 | B5（1.0倍） | A4（1.12倍） |
| --- | ---: | ---: |
| ヘッダー左上 | (12, 10) | (19.6, 11.2) |
| ヘッダー幅 × 高さ | 160 × 24 | 179.2 × 26.88 |
| 左列／中央列／右列 | 72 / 60 / 22 | 80.64 / 67.2 / 24.64 |
| 列間 | 3 | 3.36 |
| ○の直径／横ピッチ／縦ピッチ | 3 / 4.5 / 5 | 3.36 / 5.04 / 5.6 |
| 手書き枠 | 4 × 4 | 4.48 × 4.48 |
| 線幅 | 0.25 | 0.28 |
| QR外形（quiet zone込み） | 22 × 22 | 24.64 × 24.64 |
| QR左上 | (150, 10) | (174.16, 11.2) |
| マーカー角／端からの距離 | 3.5 / 5 | 3.92 / 5.6 |
| 本文の開始位置下限 | 37 | 41.44 |
| 本文の下余白下限 | 10 | 11.2 |

左列のタイトルは通常3.8mm（約10.8pt）、必要時3.2mm（約9.1pt）まで縮小し、2行まで折り返す。それ以上は末尾を省略し、元タイトルはSVGのtitle/descと座標JSONに残す。氏名の記入線は左列内で幅を確保する。タイトルと氏名は中央列へ侵入しない。

中央列には数字0〜9を上段に一度だけ置く。次の3行は組、番号十の位、番号一の位。印刷上の行ラベルは「組」「番」のみで、補助説明・記入例は載せない。左側の枠と○の中心高さを一致させる。B5の○中心はx=101+4.5×数字、y=17.5 / 22.5 / 27.5。マークは円のみで、1行に1個を塗りつぶす。

### 裏面

氏名・記入線・数字見出し・3つの手書き枠・30個の円を生成しない。タイトルはQR左側の135mm（B5基準）を利用できる。QRサイズ・x位置と四隅マーカーは表面と共通。`back.top = 5` によりヘッダーとQRを5mm×scale上へ寄せる。

| 項目 | B5 | A4 |
| --- | ---: | ---: |
| ヘッダー左上 | (12, 5) | (19.6, 5.6) |
| QR左上 | (150, 5) | (174.16, 5.6) |
| QR外形 | 22 × 22 | 24.64 × 24.64 |
| 本文開始位置下限 | 32 | 35.84 |
| 表面より増える本文の高さ | 5 | 5.6 |

この高さをdr31の語句記入欄、dr32の演習下書き欄、dr41/dr42の計算欄へ配分する。表面の印刷配置・マーク座標を維持し、本文・解答データは変更しない。

## 縮尺ルール

`papers.b5.scale = 1` を固定し、`papers.a4.scale = 1.12` を初期値とする。A4倍率は設定で変更できる。列幅・行高・文字・線・マーク・QR・quiet zone・内部余白・四隅マーカーを同じ係数で拡大する。ページ全体や教材本文はCSS transformで縮小しない。

ヘッダーは右上から位置決めする。`x = page.width - (header.right + header.width) × scale`、`y = (表面: header.top / 裏面: back.top) × scale`。ヘッダー内の点は `(x + localX × scale, y + localY × scale)`。各四隅マーカーは対応するページ端から `inset × scale` 内側へ置く。

最低円直径3mm、最低線幅0.2mm、最低QR外形22mm、最低QRモジュール0.45mmを満たさない設定はエラーにする。下限への個別の丸めは行わず、相対位置・比率を保つ。用紙外や余白との衝突もエラーにする。これは印刷/スキャン試験で調整する設計値であり、あらゆる機器での読取保証ではない。

用紙の実寸比は幅約1.1538・高さ約1.1556であり、1.12倍とは異なる。そのためページに対する正規化座標は用紙別になる。**ヘッダー内の正規化座標は両用紙で同一**。解析処理は同一で、用紙別JSONを選ぶ。

## QRと識別の仕様

形式は `subject|academicYear|worksheetId|side`。例は `INFO1|2026|WS05|F`、既存GASは `INFO1|2026|dr31|F` / `INFO1|2026|dr31|B`。年度は4月始まりの日本の年度。CLIでは `--year` の明示を推奨し、省略時は生成日のJST年度を使用する。GASではページを生成したサーバー時刻から決める。過年度用の再印刷ではCLIで対象年度を明示する。

subjectとworksheetIdはASCII英数字・`_`・`-`の1〜20文字、yearは4桁、sideはF/B。既存の小文字IDを大文字へ変換しない。引数とQR文字列のID・年度・面が食い違う場合は止める。QRはワークシート識別だけを持ち、生徒・メール・解答・公開日時を含めない。クラスは1桁、番号は00〜99を読み取れるが、有効な値かどうかは名簿側で照合する。複数学年で同じ用紙を使う場合は回収バッチ等から対象学年を指定する必要がある。

QR Model 2、誤り訂正M、バージョン1〜4の範囲で最小サイズを選択し、四辺に4モジュールのquiet zoneを確保する。22mmは余白を含む外形で、シンボル本体の寸法はJSONの `qr.symbol` に記録する。構造に収まらない長い文字列は拒否する。余白への文字・枠線・本文の侵入を禁止する。

参考: [DENSO WAVEのコード領域仕様](https://www.qrcode.com/en/howto/code.html)、[Project Nayuki QR Code generator](https://www.nayuki.io/page/qr-code-generator-library)。

## 四隅マーカーと座標JSON

B5のマーカー左上は、左上(5,5)、右上(173.5,5)、左下(5,248.5)、右下(173.5,248.5)。黒の塗り四角とし、周囲1.5mm×scaleの余白を確保する。プリンタがこの位置を印字できることを実機で確認する。

JSONの `schemaVersion` は `worksheet-scan-header/2`。用紙、scale、想定DPI=300、丸めた画像幅/高さ、identityを含む。矩形は `mm:{x,y,width,height}` と `normalized:{x,y,width,height}`、中心は `mm:{x,y}` と `normalized:{x,y}` を持つ。

- `header`、`columns.left/middle/right`: 外接矩形と列。裏面はleftを拡張しmiddleはnull。
- `qr.region/symbol/center/sizeMm/moduleMm/quietZoneMm`: QR外形、本体、中心、寸法。
- `omr.class/tens/ones[0..9]`: 表面の30円の中心・半径・測定半径・`headerNormalized`。裏面は空オブジェクト。
- `handwriting.class_box/tens_box/ones_box`: 表面の各1桁の手書き枠。裏面は空オブジェクト。
- `studentIdentitySource`: 表面は`front-omr`、裏面は`paired-front`。
- `markers.topLeft/topRight/bottomLeft/bottomRight`: 黒四角・中心・周囲を含む禁止領域。
- `body`: 本文が使える縦方向の境界。

円の正規化半径はx方向/y方向を別々に記録する（縦横比が違うページでは同じ数値にならない）。正規化したページ座標からピクセルへは `x / pageWidth × imageWidth`、`y / pageHeight × imageHeight` で変換する。PDF原点へは `x_pt=x_mm×72/25.4`、`y_pt=(pageHeight-y_mm)×72/25.4`。DPIを変えてもmm座標は同じ。

## 生成手順

Node.jsとPython、`requirements.txt` のライブラリを使用する。PDFへ日本語フォントを埋め込むため、利用許諾のあるTrueType/TTCフォントを用意する。macOSのMicrosoft Wordがある環境では同梱の游ゴシックを使用する。別環境は `--font` / `--bold-font` または `WS_HEADER_FONT` / `WS_HEADER_BOLD_FONT` で指定する。フォントファイル自体は成果物へ同梱しない。

リポジトリルートから実行:

```sh
python3 scripts/worksheet-scan-header/make_samples.py
node scripts/worksheet-scan-header/generate.mjs --options '{"pageSize":"b5","title":"音のデジタル表現","year":2026,"worksheetId":"WS05","side":"F"}' --out /tmp/ws05-b5
```

`--config` で別の設定JSONを指定できる。`generate.mjs --format json` は共通描画シーンも含むJSONを標準出力へ返す。サンプルのB5/A4 PDFは各用紙の実寸。比較PDFはA3横の中へ両者を**90%**で並べた閲覧用で、機械読取用原紙にしない。通常の印刷は単独PDFを選び、実際のサイズ/100%にする。

いずれのPDFも1ページ目が表面、2ページ目が裏面。単独の裏面SVG/JSON生成には `"side":"B"` を指定する。旧版の裏面OMR用JSONを新しい紙へ使わず、用紙と面に合う第2版JSONへ更新する。

## 既存PDFへのオーバーレイ

```sh
python3 scripts/worksheet-scan-header/add_header.py input.pdf output.pdf \
  --title "音のデジタル表現" --worksheet-id WS05 --year 2026

python3 scripts/worksheet-scan-header/add_header.py input.pdf output.pdf \
  --title "音のデジタル表現" --worksheet-id WS05 \
  --front-payload 'INFO1|2026|WS05|F' --back-payload 'INFO1|2026|WS05|B'
```

1〜2ページの各MediaBoxからB5/A4を自動判定し、表F→裏Bで生成する。裏面のみは `--first-side B`。`--qr-payload` は `--front-payload` と同義。表のpayloadだけを指定したときは同じ情報の末尾をBにして裏面へ使う。用紙が混在する2ページにも対応する。

本文を消去・縮小・移動せず、上からベクターを加える。Poppler `pdftoppm` でヘッダーとマーカー領域の既存インクを確認し、衝突したら出力を止める。`--pdftoppm` で実行ファイルを指定可能。**上部が既存タイトルや本文で埋まったPDFは、原稿側のレイアウトを先に調整する。** 白で塗りつぶして隠さない。

原本と同じパス、既存出力、既存座標サイドカーは拒否し、元PDFを読取専用に扱う。暗号化、署名/フォーム、回転付き、標準外CropBox、UserUnit、縦以外の用紙は、正立した通常PDFへの書き出しを要求する。出力横に `.coordinates.json` を保存する。

## 既存GASワークシートとの接続

```sh
node scripts/worksheet-scan-header/build-gas.mjs /path/to/GAS/ws
```

生成される2ファイルを同じGASプロジェクトへ置き、`10_webapp.js` の本文生成を `addWorksheetScanHeader_(readWorksheetHtml_(definition.template), definition, WorksheetScanHeader.fiscalYear(new Date()))`、スタイルを `readWorksheetHtml_('21_style') + readWorksheetHtml_('24_scan_style')` とする。

dr31・dr32・dr41・dr42の表面には全要素、裏面にはタイトル・QR・四隅マーカーを差し込む。articleの `data-scan-side="F/B"` で余白と記入欄を切り替える。元のタイトル欄は返すHTMLからだけ置き換え、`30_*.html` / `31_*_answers.html` はそのまま保つ。JS無効時もA4ヘッダーを印刷できる。用紙切替は既存data属性で表示するSVGを切り替え、解答の取得や公開判定を行わない。390px画面ではヘッダーのみ小さなプレビューにし、印刷時は選択用紙へ戻す。

本文は10.5pt/9ptと0/2/4mmのインデントを維持する。段落余白、図表寸法、語句表行間、計算欄を用紙別に調整する。解答が入っても紙面を動かさない。実教材の解答入りHTML/PDFはGASのローカル `_tests` のみへ保存し、教材サイトへコミットしない。

## ローカルOpenCV読取PoC

Python 3.11以上と `requirements-scan.txt` を使う。PDF入力にはローカルのPoppler `pdftoppm` が必要。画像入力にはPoppler、Node、ReportLab、日本語フォントは不要。処理中の通信、ScanSnap・Drive・GSS接続、名簿照合、本文の筆記量判定は実装しない。

```sh
python3 -m venv /tmp/worksheet-scan-venv
/tmp/worksheet-scan-venv/bin/pip install -r scripts/worksheet-scan-header/requirements-scan.txt

# 単独の表面画像。用紙は自動選択。
/tmp/worksheet-scan-venv/bin/python scripts/worksheet-scan-header/scan_poc.py scan.jpg \
  --output /tmp/scan-result-001

# 1人分の両面PDF。必要時は --pdftoppm /path/to/pdftoppm を付ける。
/tmp/worksheet-scan-venv/bin/python scripts/worksheet-scan-header/scan_poc.py student.pdf \
  --output /tmp/scan-result-002

# 複数ファイル。フォルダ指定は直下のPDF/JPEG/PNGのみ。別ファイル間で表裏を結合しない。
/tmp/worksheet-scan-venv/bin/python scripts/worksheet-scan-header/scan_batch.py /path/to/scans \
  --output /tmp/scan-batch-001
```

`--output` は新しいディレクトリを指定する。入力・既存結果を上書きしない。`--paper b5` / `--paper a4` で候補を限定できるが、QR位置の照合は省略しない。`--coordinates-dir` で4つの座標JSONのディレクトリ、`--config` で **reader-config.jsonの項目** の上書きを指定できる（ヘッダー生成用layout.jsonとは別）。縮尺を変更した用紙は、同時に生成した座標JSONを使う。

画像は1枚の表面だけでも判定する。PDFは原則1人分の表裏として扱い、1ページPDFは欠落としてREVIEWにする。意図した片面PDFだけ `--single-page` で単ページとして検証できる。2ページPDFの照合をこの指定で省略することはできない。裏面だけの場合、生徒識別値は出さず `missing_front` とする。PDFの3ページ以上・暗号化・破損・処理上限超過はERROR。

### 処理と用紙選択

1. JPEG/PNGはEXIF回転を反映し、透過部分を白へ合成してグレースケール化。PDFは300dpiで画像化する。1ファイル100MiB、1ページ4000万画素、PDF描画60秒を初期上限とする。
2. 各画像隅の20%以内から、白抜きを持たない塗り四角を検出する。各隅が一意でない場合、欠け・複数候補をREVIEWとする。用紙全体を含む画像を入力し、広い机面や別用紙を含む写真は先に用紙単位へ切り出す。
3. 四角の対角線の交点を、JSONのマーカー中心へ透視変換する。B5/A4と4方向の回転候補を試す。正規化画像のサイズはJSONの `raster`、円の中心・半径はmm座標から求める。
4. 固定QR領域の周辺を復号し、実際のモジュール数と4モジュールのquiet zoneからQR外形を照合する。**サンプルJSONのQRバージョンへ固定しない。** 四隅の最大位置誤差0.45mm以下、候補間の誤差差0.12mm以上を初期条件とし、識別が曖昧ならREVIEW。マーカー寸法差25%超、原画像でQRが1モジュール3px未満、OMR測定半径4px未満もREVIEW。
5. QRがFの場合だけ、30円の内側（JSONの `sampleRadiusMm`、現行は印刷半径の65%）を測定する。各円周辺の明るい画素（90パーセンタイル）を紙の明るさとし、その65%未満を濃い黒画素、90%未満を薄い筆跡として別々に記録する。円枠を黒画素率に含めない。
6. 各行の最多・2位・差・薄い2個目の筆跡を評価し、3行すべてOKの場合だけ `class + tens + ones` を文字列として返す（例 `307`＝3組07番）。00〜99や組0の名簿上の妥当性は別工程で確認する。

B5/A4は縦横比が近いため、画像寸法やPDFのMediaBoxだけでは判定しない。`pageSize` は **採用したヘッダーの座標体系** を表し、写真から物理的な紙寸法を測った値ではない。A4原稿を全体縮小してB5へ印刷した画像はA4の座標体系になり得る。PDFの実寸情報は `inputMetadata` に別途残す。

### 判定とconfidence

| 条件 | 初期値・扱い |
| --- | --- |
| 最多の濃い黒画素率 | 0.55以上 |
| 2位の濃い黒画素率 | 0.18未満 |
| 最多と2位の差 | 0.40以上 |
| 他の数字の薄い筆跡率 | 0.28未満 |
| 全領域がほぼ白 | 濃い・薄い筆跡とも0.08未満なら未記入 |
| 薄い塗り、部分塗り、二重、消し残り、小さい判定差 | REVIEW。`digit: null` |
| マーカー・QR・座標照合が不確実 | REVIEW。OMRを確定しない |
| ファイルが読めない、非対応入力、設定不正、描画失敗 | ERROR |

`OK` は上の条件に適合したという意味で、名簿上の生徒本人を確認した意味ではない。各段階・各行に0〜1の `confidence` を出す。これは実スキャンで校正した正答確率ではなく **判定条件への適合度**。OMRは最多黒率、1−2位黒率、判定差、1−他候補の薄い筆跡率の最小値。REVIEW行は0.49以下、座標補正が信用できなければ0。QRは最大位置誤差から計算し、ページ・ファイルは成立した各判定の最小値を使用する。

### 出力

- `result.json`: スキーマ `worksheet-scan-result/1`。ファイル状態、confidence、`studentIdentifier`、各ページ、表裏照合、設定値、入力SHA-256、座標JSONのパス/SHA-256、OpenCVバージョンを含む。
- `pages[].rows.class/tens/ones`: 10個の `blackRatios`、`weakInkRatios`、各測定円の中心・半径・背景値、最多・2位・差、`status`、`confidence`、`issues`。`candidateDigit` は要確認時の参考値で、確定した `digit` と区別する。
- `page-01-markers.png`: 入力上の検出マーカーと候補。四隅が不足しても検出途中の画像を残す。
- `page-01-normalized.png`: 正規化した用紙、四隅・QR予定領域（青）・検出QR（紫）・OMR測定円を描画。
- `page-01-header.png`: 同じ画像のヘッダー拡大確認用。緑の太線は確定、橙の太線は要確認候補。30領域に数字と黒画素率を添える。裏面にはOMRを描かない。

補正方向を決定できないときはマーカー画像だけを残し、架空のQR/OMR位置を描かない。通常はコンソールへ要約を表示し、`--json` では標準出力にJSON、標準エラーに要約を出す。単一CLIの終了コードはOK=0、REVIEW=2、ERROR=1。

後工程は **ファイル直下の `status` と `studentAssignments`** を利用する。ページ単位で表面の数字が読めても、表裏照合がREVIEWならファイル直下の `studentIdentifier` はnull、`studentAssignments` は空にする。

### 表裏照合

同じ教科・年度・ワークシートIDのF/B各1枚で、両面の読取がOKの場合だけ表面の3桁を継承する。`sourcePage` に表面の実ページ番号を記録する。B→Fの逆順はQRで復元してOKとし、必ず `reversedPages: true` と `warnings: ["reversed_pages"]` を記録・コンソール表示する。90度などの画像回転とは別に扱う。

裏面/表面の欠落、F/F・B/B、教科・年度・IDの混在、用紙体系の不一致、片面のQR/OMR不明瞭はREVIEWとし、継承しない。**同じ教材・年度を使う別の生徒の裏面混入は、QRに生徒IDがないため検出できない。** 1人分を1つのPDFにする前提を維持し、別PDF間の自動ペアリングは行わない。

### 一括検証と正解データ

`scan_batch.py` は1ファイルずつ処理する。壊れた入力があっても次へ進み、ファイルごとの出力を連番フォルダへ保存する。`batch-result.json` にOK/REVIEW/ERROR件数と結果ファイルへのパスをまとめる。正解データなしの場合、認識精度を計算しない。

実スキャンを評価するときは、次のmanifestを人手でラベル付けする。入力パスはmanifestのディレクトリからの相対パスでもよい。期待する識別値は先頭ゼロを保持する文字列、REVIEW/ERRORではnullにする。

```json
{
  "schemaVersion": "worksheet-scan-cases/1",
  "cases": [
    {"input": "b5-filled.jpg", "expected": {"status": "OK", "studentIdentifier": "307", "pageSize": "b5"}},
    {"input": "double-mark.png", "expected": {"status": "REVIEW", "studentIdentifier": null}}
  ]
}
```

```sh
python3 scripts/worksheet-scan-header/scan_batch.py --manifest /path/to/manifest.json \
  --output /tmp/labeled-scan-check
```

期待値との一致・不一致・**誤ったOK判定（falseAcceptances）** を集計する。正解付きでは、期待したREVIEW/ERRORも成功とし、全件一致=終了0、不一致あり=終了1。正解なしではERRORを含むと終了1、REVIEWだけを含むと終了2、それ以外は終了0。

### 再現用の人工スキャン

既存サンプルPDFと共通生成器から、B5/A4の記入済みPNG/JPEG、回転、台形歪み、影、ぼけ、二重マーク、薄い塗り、消し跡、QR/マーカー欠落、両面逆順・欠落・混在、QRバージョン1〜4、破損ファイルを作る。すべてダミーで、実際の生徒情報を含まない。生成にはNodeとPopplerも必要。

```sh
python3 scripts/worksheet-scan-header/tests/make_scan_cases.py --output /tmp/scan-cases
python3 scripts/worksheet-scan-header/scan_batch.py --manifest /tmp/scan-cases/manifest.json \
  --output /tmp/scan-cases-results
```

実際の筆記具・プリンタ・複写機・紙折れ・消し方の違いは別途実スキャンで検証する。人工画像の成功率を実運用精度とみなさない。生徒のスキャン・認識結果・確認画像はリポジトリ外に保管し、公開コミットしない。

2026-09-26にOpenCV 5.0.0で上記の人工50ケースを検証し、期待結果50件すべて一致（OK 22件、REVIEW 26件、ERROR 2件）、誤ったOK判定0件を確認した。逆の用紙を明示指定するケースと同点候補も別テストでREVIEWを確認。PDF画像化で生じる小さな文字片をマーカーとして拾わないよう、マーカー候補の最小面積を画像全体の0.00008に設定している。実紙スキャンでの評価は未実施。

旧 `read_scan.py` / `read_duplex.py` は既存テスト向けの互換APIとして残す。行の小文字状態（ok/blank/ambiguous）など旧形式は新しいCLIの契約と異なる。新規接続には `scan_poc.py` / `scan_batch.py` を使用する。

## 検証

```sh
node --test scripts/worksheet-scan-header/tests/layout.test.mjs
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p 'test_*.py'
python3 scripts/worksheet-scan-header/tests/verify_scan.py --report /tmp/scan-report.json
node scripts/worksheet-scan-header/tests/browser.cjs /path/to/private/fixtures /path/to/private/output
```

読取検証にはOpenCV（`opencv-python-headless`）が必要。両面テストは実際のPDFを描画してQRを復号し、正順・逆順で3組27番を表面から裏面へ継承することも確認する。ブラウザ検証にはPlaywrightとChromeを使い、`PLAYWRIGHT_MODULE` でモジュールを指定できる。`--webkit` はWebKit補助検証。GAS側を変更した場合は同プロジェクトのテストも実行する。ローカル読取PoCだけの変更ではGASを更新しない。

実機確認では、原寸で印刷したB5/A4の四隅欠け、マーク直径、QR・消し跡の判定、両面の向き、スキャン後の座標補正を確認する。Chrome PDFやWebKitの検証は、物理プリンタやSafari印刷プレビューの確認の代わりにはしない。
