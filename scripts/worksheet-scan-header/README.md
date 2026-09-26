# ワークシート共通スキャンヘッダー

B5・A4の表裏に、氏名・組/番号OMR・ワークシートQR・四隅マーカーを加える共通部品。寸法の正本は `layout.json`、描画と座標の正本は `header.js`。SVG、PDF、GASで同じ座標を使用する。教材本文・解答・名簿はこのフォルダに含めない。

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
| `read_scan.py` | OpenCV接続例。マーカー補正、QR照合、OMR黒画素率 |
| `gas-adapter.js` / `gas-style.css` | 既存ワークシートへの差し込みと紙面調整 |
| `build-gas.mjs` | GAS用 `05_scan_header.js`・`24_scan_style.html` を生成 |
| `tests/` | 座標、PDF保全、読取、ブラウザ印刷の検証 |
| リポジトリルート `templates/worksheets/scan-header/` | `b5.svg`, `a4.svg`, `b5.json`, `a4.json` |
| リポジトリルート `output/pdf/worksheet-scan-header/` | `b5.pdf`, `a4.pdf`, `comparison.pdf` |

SVGは編集可能なtext・circle・rect・lineで構成する。ただし継続的な変更は生成物を手直しせず、設定・生成器へ戻して再生成する。QRは外部の画像API・CDNを使用しない。

## 寸法と3列レイアウト

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

## 縮尺ルール

`papers.b5.scale = 1` を固定し、`papers.a4.scale = 1.12` を初期値とする。A4倍率は設定で変更できる。列幅・行高・文字・線・マーク・QR・quiet zone・内部余白・四隅マーカーを同じ係数で拡大する。ページ全体や教材本文はCSS transformで縮小しない。

ヘッダーは右上から位置決めする。`x = page.width - (header.right + header.width) × scale`、`y = header.top × scale`。ヘッダー内の点は `(x + localX × scale, y + localY × scale)`。各四隅マーカーは対応するページ端から `inset × scale` 内側へ置く。

最低円直径3mm、最低線幅0.2mm、最低QR外形22mm、最低QRモジュール0.45mmを満たさない設定はエラーにする。下限への個別の丸めは行わず、相対位置・比率を保つ。用紙外や余白との衝突もエラーにする。これは印刷/スキャン試験で調整する設計値であり、あらゆる機器での読取保証ではない。

用紙の実寸比は幅約1.1538・高さ約1.1556であり、1.12倍とは異なる。そのためページに対する正規化座標は用紙別になる。**ヘッダー内の正規化座標は両用紙で同一**。解析処理は同一で、用紙別JSONを選ぶ。

## QRと識別の仕様

形式は `subject|academicYear|worksheetId|side`。例は `INFO1|2026|WS05|F`、既存GASは `INFO1|2026|dr31|F` / `INFO1|2026|dr31|B`。年度は4月始まりの日本の年度。CLIでは `--year` の明示を推奨し、省略時は生成日のJST年度を使用する。GASではページを生成したサーバー時刻から決める。過年度用の再印刷ではCLIで対象年度を明示する。

subjectとworksheetIdはASCII英数字・`_`・`-`の1〜20文字、yearは4桁、sideはF/B。既存の小文字IDを大文字へ変換しない。引数とQR文字列のID・年度・面が食い違う場合は止める。QRはワークシート識別だけを持ち、生徒・メール・解答・公開日時を含めない。クラスは1桁、番号は00〜99を読み取れるが、有効な値かどうかは名簿側で照合する。複数学年で同じ用紙を使う場合は回収バッチ等から対象学年を指定する必要がある。

QR Model 2、誤り訂正M、バージョン1〜4の範囲で最小サイズを選択し、四辺に4モジュールのquiet zoneを確保する。22mmは余白を含む外形で、シンボル本体の寸法はJSONの `qr.symbol` に記録する。構造に収まらない長い文字列は拒否する。余白への文字・枠線・本文の侵入を禁止する。

参考: [DENSO WAVEのコード領域仕様](https://www.qrcode.com/en/howto/code.html)、[Project Nayuki QR Code generator](https://www.nayuki.io/page/qr-code-generator-library)。

## 四隅マーカーと座標JSON

B5のマーカー左上は、左上(5,5)、右上(173.5,5)、左下(5,248.5)、右下(173.5,248.5)。黒の塗り四角とし、周囲1.5mm×scaleの余白を確保する。プリンタがこの位置を印字できることを実機で確認する。

JSONの `schemaVersion` は `worksheet-scan-header/1`。用紙、scale、想定DPI=300、丸めた画像幅/高さ、identityを含む。矩形は `mm:{x,y,width,height}` と `normalized:{x,y,width,height}`、中心は `mm:{x,y}` と `normalized:{x,y}` を持つ。

- `header`、`columns.left/middle/right`: 外接矩形と3列。
- `qr.region/symbol/center/sizeMm/moduleMm/quietZoneMm`: QR外形、本体、中心、寸法。
- `omr.class/tens/ones[0..9]`: 30円の中心・半径・測定半径・`headerNormalized`。
- `handwriting.class_box/tens_box/ones_box`: 各1桁の手書き枠。
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

dr31・dr32・dr41・dr42の両面に差し込む。元のタイトル欄は返すHTMLからだけ置き換え、`30_*.html` / `31_*_answers.html` はそのまま保つ。JS無効時もA4ヘッダーを印刷できる。用紙切替は既存data属性で表示するSVGを切り替え、解答の取得や公開判定を行わない。390px画面ではヘッダーのみ小さなプレビューにし、印刷時は選択用紙へ戻す。

本文は10.5pt/9ptと0/2/4mmのインデントを維持する。段落余白、図表寸法、語句表行間、計算欄を用紙別に調整する。解答が入っても紙面を動かさない。実教材の解答入りHTML/PDFはGASのローカル `_tests` のみへ保存し、教材サイトへコミットしない。

## OpenCVとの接続

```sh
python3 scripts/worksheet-scan-header/read_scan.py scan.png templates/worksheets/scan-header/b5.json
```

用紙別JSONと一致するQRを使う。四隅近くの黒四角を検出し、四角の対角線の交点を基準へ写像する。0/90/180/270度の候補を試し、想定位置のQRが一致した向きだけ採用する。4点が欠ける場合やQR不一致時は停止する。同じ形の四角だけでは上下を決定できないので、QRの向き・位置を併用する。

円の輪郭を黒画素率へ含めないよう、半径の65%を測定する。初期の仮閾値は黒画素率55%以上かつ他の候補20%未満。未記入・二重マーク・薄い/曖昧なマークは数字を決めず、人手確認へ回す。JSONには全30個の黒画素率も返す。

検証には200dpiのPDF画像と台形歪み・ぼかし・4方向回転の人工画像を使う。**実際の筆記具・複写機・影・紙折れ・消し跡への閾値調整、名簿照合、学年/回収バッチの管理、記入状況判定、採点は今後の工程**。候補が1組00番等の形式上有効な値でも、名簿照合が通るまでは生徒を確定しない。スキャン画像・名簿を外部へ送らない。

## 検証

```sh
node --test scripts/worksheet-scan-header/tests/layout.test.mjs
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p 'test_*.py'
python3 scripts/worksheet-scan-header/tests/verify_scan.py --report /tmp/scan-report.json
node scripts/worksheet-scan-header/tests/browser.cjs /path/to/private/fixtures /path/to/private/output
```

読取検証にはOpenCV（`opencv-python-headless`）が必要。ブラウザ検証にはPlaywrightとChromeを使い、`PLAYWRIGHT_MODULE` でモジュールを指定できる。`--webkit` はWebKit補助検証。GAS側の既存68テストも実行する。

実機確認では、原寸で印刷したB5/A4の四隅欠け、マーク直径、QR・消し跡の判定、両面の向き、スキャン後の座標補正を確認する。Chrome PDFやWebKitの検証は、物理プリンタやSafari印刷プレビューの確認の代わりにはしない。
