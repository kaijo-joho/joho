# 連続スキャンの取り込みと提出履歴

2026-09-27追加。学校での個別・代理・クラス一括スキャンを、ローカルファイルから取り込むCLI。紙面、QR、OMRの読取コアは既存のまま使用する。

通常の受領に生徒の確定操作は必要ない。重複や判明した誤記などの例外を確認対象へ出す。成績への反映、筆記量判定、筆跡の類似照合、スキャナ制御、常駐監視、Google Drive/GSS接続、生徒向けWeb画面は行わない。

## 入力と表裏の境界

- 1ファイルに1人でも複数人でもよい。PDFの1–2ページ、3–4ページ…を同じ物理用紙の2面として扱う。1用紙は1課題、両面2ページが前提。
- 両面読み取り、白紙削除なし、ページの削除・並べ替え・表裏合成なしで、各用紙の2面が隣接する出力を使用する。実機ごとの確認は別途必要。
- 用紙を入れる表裏が逆でも、その組のQRがB/Fなら受け付ける。出力PDFのページ順は原本どおりで、`reversedPages` に残す。
- B5/A4や教材が異なる用紙が混在しても、各組の表裏が一致し、教材設定に登録されていれば処理する。
- 奇数ページ、QR不明、F/F・B/B、教材や用紙体系の不一致など、境界が疑わしい場合は **そのPDF全体を保留** する。ページを1枚ずらして復旧したり、別ファイルをつないだりしない。
- OMRだけが不明瞭で、同じ用紙のF/Bは確認できた場合、その組だけをREVIEWとし、ほかの組は処理する。
- JPEG/PNG単独は原本と診断を保存するが、裏面が揃っていないため提出への対応付けはしない。片面画像の読取実験には既存の `scan_poc.py` を使える。
- 初期上限は200ページ、500 MiB。`--max-pages` / `--max-bytes` で変更できる（ページ上限は最大1000）。分割後の読取には既存の1ファイル100 MiB、1ページ4000万画素などの制限も適用する。各組を順次処理し、全ページ画像を一度にメモリへ載せない。

**検出できないこと:** 同じ教材の裏面QRは全員同じ。重送でAさんの表面とBさんの裏面だけが撮れた場合や、用紙が丸ごと抜けた場合は、この処理だけでは保証できない。「QRの整合性がある」と「本人の両面である」は別である。

## 保管と実行環境

Python 3.11以上、macOS/Linux、既存の `requirements-scan.txt` とPopplerを使用する。追加のPython依存はない。履歴DBは標準ライブラリのSQLite。

保管先には、**Gitリポジトリ・Apacheの公開ディレクトリ・Drive/SMBの同期先以外のローカルディレクトリ**を使う。コードはGit配下への台帳作成とレポート出力を拒否するが、Apacheの設定までは検出しない。名簿設定も公開リポジトリへ置かない。

Mac miniからMac Studioへ運ぶ対象は原本ファイルと受信情報。SQLiteを複数MacやSMB上で同時に開かない。同じMac内のCLI同時実行はファイルロックで直列化する。これはScanSnap複数台の実機同時動作を検証した意味ではない。

## 名簿・教材設定

`intake-settings.example.json` は架空の生徒3人と教材2件のみ。コピーして実際の設定を作り、`--settings` で渡す。既存GSSへのアクセスは行わない。

- `roster`: `year`（年度）、`grade`（学年）、`studentIdentifier`（組1桁＋番号2桁の文字列）、`studentKey`（生徒を示す安定したID）。氏名・メールアドレスはこの初期スキーマに入れない。`studentKey`は同一年度内で一意とする。
- `worksheets`: QRの `subject` / `year` / `worksheetId`、対象 `grade`、履歴を比較する範囲 `period`、締切 `dueAt`。
- 同じQRから複数学年を選ぶ設定は拒否する。複数学年で使う教材は教材IDを分ける。時刻から学年・組を推定しない。
- `dueAt`: タイムゾーン付きISO 8601、または `null`。例 `2026-10-01T15:00:00+09:00`。未指定の締切は推測せず、その課題を提出履歴フラグの母数から除外する。
- `period`: 例 `2026-term2`。年度・教科・学年・periodが一致する課題だけで履歴を比較する。
- `eligibleStudentKeys`: 任意。対象生徒を限定するときのID配列。省略時はその年度・学年の名簿全員。空配列は対象者なし。未配付・免除などを除いた対象者を明示できる。
- `reviewRules`: `minClosedAssignments=5`、`maxSparseSubmissions=2` が初期値。未知の項目、名簿重複、タイムゾーンなし日時はエラー。

## 取り込み

リポジトリのルートから実行する例。保管先・名簿・入力は自分の環境のパスを指定する。

```bash
python3 scripts/worksheet-scan-header/scan_intake.py \
  --store "$HOME/WorksheetScans" --json \
  ingest /path/to/completed-class.pdf \
  --settings /path/to/private/intake-settings.json \
  --scanner-id classroom-1
```

処理順は、保存完了したファイルのコピー・SHA-256 → 用紙ごとの分割 → 既存OpenCV読取 → 教材・名簿照合 → 履歴登録。

同じ原本バイト列の再取り込みは、ファイル名やスキャナが違っても既存のバッチを返す。受信イベントだけを追加し、提出回数・初回受付日時は増やさない。別スキャンやPDFの再保存でバイト列が変わったものは別候補になる。見た目の類似だけで統合しない。

受付日時は原本コピー完了時。遅延転送では、Mac mini等で記録した信頼できる時刻を `--received-at 2026-09-27T09:05:00+09:00` で渡せる。PDFメタデータや生徒申告から自動採用しない。解析終了時刻で受付日時を更新しない。

終了コード: 0=OK、2=REVIEW、1=ERROR。JSONは `--json` 指定時に標準出力、要約は標準エラー。正常な組とREVIEWの組が混在する場合、正常な組の受領も保存される。読み取りERRORの原本も残る。

## 保存内容と再解析

```text
WorksheetScans/
  ledger.sqlite3
  ledger.lock
  batches/batch-.../
    original.pdf
    run-.../
      settings.json
      reader-config.json
      sheet-0001.pdf
      sheet-0001-reading/result.json
      sheet-0001-reading/page-01-markers.png
      sheet-0001-reading/page-01-normalized.png
      sheet-0001-reading/page-01-header.png
      stack-result.json
      intake-result.json
```

原本・過去の解析結果は上書きしない。分割PDFも原本のページ内容・順序を保持する。`attemptId` はバッチIDと組番号、`sourcePages` は原本PDFのページ番号。用紙ごとの相対ファイルパスから原本・結果へ辿れる。既存読取JSON内のデバッグ画像は絶対パスなので、保管場所は固定する。

同じ原本を再解析する場合:

```bash
python3 scripts/worksheet-scan-header/scan_intake.py \
  --store "$HOME/WorksheetScans" --json \
  ingest /path/to/completed-class.pdf \
  --settings /path/to/private/intake-settings.json --retry
```

新しいrunを保存し、同じ `attemptId` の最新解析を更新する。受付日時・提出回数は変わらず、以前のrunは残る。解析途中で終了したバッチは、同じ入力を取り込み直すと再開できる。保存済み原本のSHA不一致は停止する。

再解析で対応付けが不明になった場合は最新結果を確認対象へ出す。選択済みPDFの生徒対応が変わっても、その選択を新しい生徒へ移さない。これは、**別ファイルの再スキャンが失敗しても以前の正常な提出を残す**動作とは別である。

コード更新・閾値調整後の一括再解析、原本転送、バックアップ、自動削除はこのCLIから自動実行しない。

## 一覧・確認対象

```bash
python3 scripts/worksheet-scan-header/scan_intake.py \
  --store "$HOME/WorksheetScans" --json \
  report --settings /path/to/private/intake-settings.json \
  --output /path/to/private/report-20260927.json
```

出力先の既存ファイルは上書きしない。主な項目:

- `groups`: 年度・教科・課題・学年・生徒ごとの受領候補。`submissionCount` は同じファイルの再受信を除いた回数。
- `attempts`: 成功・REVIEW・ERROR・除外を含めた全組の履歴。`readingStatus` は認識、`intakeStatus` は表裏・教材・名簿まで含めた受付判定。元の読取結果はそのまま保存。
- `reviewQueue`: 重複、本人不明、読取不能、解析中断、未解決誤記、選択済みPDFが利用できなくなった場合など。本人を特定できない入力も消えない。
- `caseCounts`: **判明した**誤記件数、修正済み、未解決、取消。未発見の誤記を数えたものではない。
- `events`: 受信・再受信・解析・選択・除外・修正の日時、操作者ラベル、理由。
- `gradingEnabled=false`、`requiresStudentConfirmation=false`。

候補が1件なら自動で `selectedAttemptId` を設定し、全員の確定操作を要求しない。複数なら `duplicate_submission` として選択を保留する。読み取りに失敗した新しいファイルは、過去の正常な候補を置き換えない。

提出履歴フラグは、対象かつ締切を過ぎた課題が5件以上あり、そのうち受領できた課題が1～2件の場合に付ける。同じ課題の再スキャンを課題数へ重複計上しない。最初の課題や締切未設定の課題だけでは付かない。`--at` はこの履歴判定の基準時刻を指定するもので、台帳全体の過去時点スナップショットではない。

`sparse_submission_history` は確認順を決める材料。受領を取り消したり、減点したり、生徒へ誤記と断定したりしない。履歴が少ない生徒が正しく提出を始めた場合も含まれる。

## 例外の選択・訂正（ローカル管理者用）

以下はローカルCLIの管理操作。`--actor` は監査用のラベルであり、ログイン認証ではない。将来のWeb画面から直接呼ぶ際には、学校アカウント・本人の範囲・教員権限をサーバー側で確認する必要がある。

重複候補から1件を選択:

```bash
python3 scripts/worksheet-scan-header/scan_intake.py \
  --store "$HOME/WorksheetScans" --actor teacher \
  select batch-EXAMPLE:1 --note "氏名欄と両面を確認"
```

選択はそのPDFに固定し、別のスキャンが後から来ても自動で差し替えない。再度 `select` すれば変更でき、どちらも履歴に残る。単に対象外と分かった候補は `exclude`、取り消しは `restore` を使う（引数は `select` と同様）。

判明した番号誤記を案件として登録し、修正後のスキャンと対応付け:

```bash
python3 scripts/worksheet-scan-header/scan_intake.py \
  --store "$HOME/WorksheetScans" --actor teacher \
  mistake-open batch-WRONG:1 --note "氏名欄から番号誤記を確認"

python3 scripts/worksheet-scan-header/scan_intake.py \
  --store "$HOME/WorksheetScans" --actor teacher \
  mistake-resolve case-EXAMPLE --replacement batch-FIXED:1 \
  --note "原本と修正後を比較して確認"
```

誤記登録した元の候補は受領候補から除外するが、原本は残す。修正先は同じ教科・年度・課題の正常な別スキャンに限定し、1件の修正先で複数案件を解決したことにしない。集計件数だけで自動的に解決扱いにはしない。

判定自体を取り消す場合は `mistake-cancel case-EXAMPLE --note "取消理由"`。取消案件も履歴に残る。解決後に修正先を除外した場合などは `resolved_replacement_unavailable` として再確認対象になる。

## 検証

```bash
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p 'test_scan*.py' -v
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p test_duplex.py -v
```

追加テストはダミーPDFと架空の名簿だけを使用する。用紙混在・逆順・途中の欠落・QR/OMR不明・同時取り込み・再受信・再解析・重複選択・誤記の解決/取消・提出履歴フラグ・実QR/OMRを通る統合検証を含む。実際の生徒用紙やScanSnap本体での精度・操作性は未検証。
