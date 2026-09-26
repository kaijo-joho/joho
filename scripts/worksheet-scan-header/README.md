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
| `read_scan.py` | OpenCV接続例。マーカー補正、QR照合、OMR黒画素率 |
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

## OpenCVとの接続

```sh
python3 scripts/worksheet-scan-header/read_scan.py scan.png templates/worksheets/scan-header/b5.json
python3 scripts/worksheet-scan-header/read_scan.py back.png templates/worksheets/scan-header/b5-back.json
python3 scripts/worksheet-scan-header/read_duplex.py student-duplex.pdf --pdftoppm /path/to/pdftoppm
```

用紙別JSONと一致するQRを使う。四隅近くの黒四角を検出し、四角の対角線の交点を基準へ写像する。0/90/180/270度の候補を試し、想定位置のQRが一致した向きだけ採用する。4点が欠ける場合やQR不一致時は停止する。同じ形の四角だけでは上下を決定できないので、QRの向き・位置を併用する。

円の輪郭を黒画素率へ含めないよう、半径の65%を測定する。初期の仮閾値は黒画素率55%以上かつ他の候補20%未満。未記入・二重マーク・薄い/曖昧なマークは数字を決めず、人手確認へ回す。JSONには全30個の黒画素率も返す。

裏面の単ページ読取はQRだけを返し、OMR抽出・生徒候補の推定を行わない。両面読取は1人分の1〜2ページPDFを入力とし、MediaBoxでB5/A4を選び、QRからIDと面を発見して次を検証する。

| 条件 | 出力と継承 |
| --- | --- |
| 同じ教科・年度・IDのFとB各1枚 | 表面の読取候補を両面へ割当。`sourcePage`で元のページ番号を記録 |
| B→Fの逆順 | `reversedPages: true`と`reversed_pages`警告。実際のFを取得元として継承 |
| 裏面欠落・表面欠落 | `missing_back` / `missing_front`。継承しない |
| F/F・B/B | `duplicate_front` / `duplicate_back`。継承しない |
| 教科・年度・IDの不一致 | `worksheet_mismatch`。継承しない |
| QR読取失敗・不正 | `unreadable_qr`。継承しない |
| 表面OMRが未記入・複数・曖昧 | `unreadable_student`。継承しない |

問題がある結果は `status: review`、`studentAssignments: []`。照合できる表裏でも名簿照合は必須であり、`requiresRosterMatch: true` を保持する。画像の90/180/270度回転補正と、PDF内のF/Bページ順序の逆転検出は別に記録する。

QRは生徒を含まないため、**同じ教材・年度を使う別の生徒の裏面が混入した場合は、このQRだけでは検出できない**。1人分の表裏を同じPDFにまとめる回収工程を前提とし、別PDF間の自動組合せや複数生徒を含むバッチの推測ペアリングは行わない。

検証には200dpiのPDF画像と台形歪み・ぼかし・4方向回転の人工画像を使う。**実際の筆記具・複写機・影・紙折れ・消し跡への閾値調整、名簿照合、学年/回収バッチの管理、記入状況判定、採点は今後の工程**。候補が1組00番等の形式上有効な値でも、名簿照合が通るまでは生徒を確定しない。スキャン画像・名簿を外部へ送らない。

## 検証

```sh
node --test scripts/worksheet-scan-header/tests/layout.test.mjs
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p 'test_*.py'
python3 scripts/worksheet-scan-header/tests/verify_scan.py --report /tmp/scan-report.json
node scripts/worksheet-scan-header/tests/browser.cjs /path/to/private/fixtures /path/to/private/output
```

読取検証にはOpenCV（`opencv-python-headless`）が必要。両面テストは実際のPDFを描画してQRを復号し、正順・逆順で3組27番を表面から裏面へ継承することも確認する。ブラウザ検証にはPlaywrightとChromeを使い、`PLAYWRIGHT_MODULE` でモジュールを指定できる。`--webkit` はWebKit補助検証。GAS側の70テストも実行する。

実機確認では、原寸で印刷したB5/A4の四隅欠け、マーク直径、QR・消し跡の判定、両面の向き、スキャン後の座標補正を確認する。Chrome PDFやWebKitの検証は、物理プリンタやSafari印刷プレビューの確認の代わりにはしない。
