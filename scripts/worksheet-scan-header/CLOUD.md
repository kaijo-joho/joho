# 教室スキャン → Mac mini → Drive → GSS

2026-09-27。Mac miniで用紙補正・QR・3桁OMRを読み、Drive保存後にGASで名簿照合するための実装。
記入有無・筆記量・正誤・成績は判定しない。生徒全員の確定操作は要求しない。

**実装済み:** ローカル監視・読取・再送キュー、Driveアップロード、GASのGSS登録・名簿照合、オフライン試験。
**未接続:** 実Mac mini、ScanSnap、学校Drive/GSS、OAuth、本番GASトリガー。
GASの生徒確認画面・重複選択画面、自宅アップロード、記入判定は後続工程。既存`ws`やCommonライブラリは変更していない。

## 処理と責務

1. ScanSnapがMac miniの専用Inboxへ両面PDFを保存。複数人PDFも受け付ける。
2. `cloud_intake.py`が保存状態の安定を確認し、原本コピーとSHA-256を記録する。
3. 既存`scan_stack`で2ページずつ分割し、用紙補正・QR・OMRを読む。Mac miniへ名簿を持たせない。
4. 原本と分割PDFをDriveの非公開`artifacts`フォルダーへ送る。
5. 全PDFのサイズ・チェックサム・保存先を確認後、受付JSONを`receipts`へ最後に送る。
6. GASが受付JSONを取得し、QRの年度・教材から学年を特定し、組・番号を既存GSS名簿へ照合する。
7. 専用GSSへ受付と提出候補を追記。登録完了したJSONにだけDriveの`worksheetImport=registered`を付ける。

Driveをファイルの保存先、GSSをクラウド提出履歴の正本とする。Mac miniのキューは未送信管理・原本保全・再送用。
既存`scan_intake.py`のローカル名簿・選択・誤記台帳とは別入口であり、両方の台帳を双方向同期するものではない。
今後GAS側へ重複選択や訂正を移す際は、既存ローカル台帳との移行範囲を確認する。

## 安全な再送・受付ID

- `receiptId = ws-<原本のSHA-256>`。同一バイト列の再取り込みで受付時刻・受付数を増やさない。
- `attemptId = <receiptId>:<組番号>`。ここで組番号はPDF内の用紙の順番で、生徒のクラスではない。
- DriveのファイルIDを先に予約してキューへ保存する。応答を失っても同じIDで再試行する。
- 同じIDのファイルが既にあればサイズ・MD5・フォルダー・役割を確認し、内容を上書きしない。
- GASは`attemptId`で重複を防ぐ。途中で止まった追記を再開し、受付行を最後に保存する。
- GSSを読む処理は`ws_receipts`に受付行がある候補だけを使う。未完了の候補行を生徒へ表示しない。
- 原本・ローカル解析結果・送信済みPDFを自動削除しない。キュー自体もバックアップ対象。
- キューを失って別のDrive IDで同じ原本を送り直すと、GASは`RECEIPT_CONFLICT`として止める。古い受付を勝手に置換しない。
- 解析済み原本をソフト変更後に再解析してクラウド台帳を更新する処理は、今回の自動再送には含めない。

受付JSONは`worksheet-cloud-receipt/1`。QR識別、3桁、判定・confidence、ページ対応、ファイルIDとハッシュ、
読取コード・設定・座標のハッシュを含む。氏名、メール、名簿、ローカルパス、画像はJSONへ入れない。
生徒氏名等を含むPDF自体は個人情報として扱う。confidenceは正答確率ではない。

## Mac mini側の準備

Python 3.11以上、Poppler、`requirements-cloud.txt`を使用する。専用のPython環境へインストールする。

```bash
python3 -m venv /path/to/private/worksheet-env
/path/to/private/worksheet-env/bin/pip install -r scripts/worksheet-scan-header/requirements-cloud.txt
```

Inbox、キュー、認証情報はGit・Apache公開ディレクトリ・Drive同期ディレクトリの外へ置く。
コードはGit内キューを拒否するが、Apache設定の検査はしない。SQLiteやキューファイルをSMB越しに複数Macで共用しない。

`cloud-settings.example.json`を非公開の場所へコピーし、次を設定する。

| 項目 | 内容 |
|---|---|
| `stationId` | 受付端末／経路の識別子。例`classroom-mini` |
| `artifactFolderId` | 原本・分割PDFの保存先 |
| `receiptFolderId` | 完了通知JSONの保存先。上と別フォルダー |

保存先は指定した教員ユーザーのみがアクセスできるフォルダーとする。現版は全員・ドメイン・グループ共有の保存先を拒否する。
権限変更は行わない。生徒へのPDF提供は別途GASの本人確認とファイル権限を実装してから行う。
クラス全員の原本を生徒へ共有しない。

認証には、専用のGoogle OAuthクライアントで承認済みの`authorized_user`形式JSONを明示的に渡す。
`clasp`やCodex接続の認証情報は流用しない。認証情報をコード・設定例・Git・ログへ入れない。
必要なDrive API権限と保存先へのアクセスを確認し、最小限のスコープで設定する。
`drive.file`の場合はそのOAuthアプリへ許可されたフォルダーが必要で、既存IDを指定するだけではアクセスを取得できない。
OAuthの作成・同意、フォルダーの用意、既存権限の変更は自動実行しない。

### 1ファイルをローカルで読み取る（ネット接続なし）

```bash
python3 scripts/worksheet-scan-header/cloud_intake.py \
  --queue /path/to/private/WorksheetQueue \
  prepare /path/to/completed.pdf --station-id classroom-mini
```

これは読取結果と送信予定を準備するだけで、Driveには何も送らない。QRの表裏・教材照合は維持する。
奇数ページや表裏不整合ならその原本全体を保留し、推測した番号は送らない。
OMRだけが不明な用紙は他の正常な用紙と分けて扱う。JPEG/PNG単独は両面未完了として保留する。

### Driveへ送信する

```bash
python3 scripts/worksheet-scan-header/cloud_intake.py \
  --queue /path/to/private/WorksheetQueue \
  send --settings /path/to/private/cloud-settings.json \
  --credentials-file /path/to/private/drive-oauth.json
```

未送信の受付を順番に送る。通信失敗はキューに残り、同じコマンドで再送できる。
`--receipt-id ws-...`で1受付を指定すれば、送信済みも再検証する。
`uploaded`はDrive保存完了を意味し、GSS登録成功ではない。JSONの`cloudRegistration`は`not_verified`のまま。
GSS登録はGASの実行結果と`ws_receipts`で別に確認する。

### 監視

```bash
python3 scripts/worksheet-scan-header/cloud_intake.py \
  --queue /path/to/private/WorksheetQueue \
  watch --inbox /path/to/ScanInbox --station-id classroom-mini \
  --upload --settings /path/to/private/cloud-settings.json \
  --credentials-file /path/to/private/drive-oauth.json
```

`--upload`を省略するとローカル読取のみ。`--once`は1巡で終了するため、初回は観測だけとなり、
15秒以上後にもう一度実行すると安定したファイルを取り込む。`.partial`・隠しファイル・シンボリックリンクは無視する。
安定時間は保存完了の完全な保証ではないので、可能なら保存中は一時名、完了後に`.pdf`へ変更する運用を使う。
コピー中の変更は拒否する。後からファイルが変化した場合は新たに観測・保存し、古い原本も保持する。
監視は下位フォルダーを巡回せず、スキャナ制御・白紙削除設定・OS常駐登録は行わない。
ScanSnapは両面・白紙削除なし・各用紙の表裏が隣接する設定を実機で確認する。

`status`でキュー一覧をJSON表示する。ログにSDKの生エラーや認証情報は出さず、受付IDとエラー種別を表示する。

## GAS側の準備

`gas/00_receipt_core.js`と`gas/10_receipt_import.js`を**専用GASプロジェクト**へ置く。
既存のワークシート配付・解答公開アプリ`ws`やCommonライブラリへ混ぜない。
Drive拡張サービスv3を有効にする。Drive読取・受付JSONのプロパティ更新、名簿読取・専用台帳への書込が必要。
Webアプリ公開や匿名HTTP受付は不要。既存GASのデプロイ／権限を変更しない。

スクリプトプロパティ:

| キー | 内容 |
|---|---|
| `WS_ARTIFACT_FOLDER_ID` | Mac mini側と同じ原本・分割PDFフォルダー |
| `WS_RECEIPT_FOLDER_ID` | Mac mini側と同じ受付JSONフォルダー |
| `WS_LEDGER_ID` | 新設または指定された回収専用GSS。名簿GSSとは別にする |
| `WS_ROSTER_ID` | 既存の名簿GSS（読取専用） |
| `WS_ROSTER_SHEET` | 例`生徒名簿` |
| `WS_ROSTER_YEAR` | その名簿が示す年度。例`2026` |
| `WS_ROSTER_COLUMNS` | `studentKey`・`grade`・`classNumber`・`number`と実際の列名の対応JSON |
| `WS_IMPORT_LIMIT` | 任意。1回の受付数、初期20、最大50 |

Commonの現行コードでは、`生徒名簿`の先頭列でアカウントを照合し、学年・組・番号に`年`・`組`・`番`を使っている。
実GSSの先頭列名を確認し、`studentKey`へその列を指定する。列名や年度を推測して設定しない。
読み取るのは本人キー・学年・組・番号の4列だけで、名簿を変更しない。名簿の重複・欠損は照合を停止する。

例（`account`は仮の列名）:

```json
{"studentKey":"account","grade":"年","classNumber":"組","number":"番"}
```

1. `setupWorksheetReceiptTables()`を一度実行し、専用GSSに3表を作る。既存表の列が異なる場合は停止し、書き換えない。
2. `ws_catalog`へ`subject / year / worksheetId / grade / enabled`を登録する。QRから学年が一意に決まる必要がある。
3. 架空名簿・架空スキャンで`importWorksheetReceipts()`を手動実行し、Drive→GSSを確認する。
4. 学校アカウント・保存先・実用紙で確認後に、必要な時間主導トリガーを設定する。トリガーはコードから自動作成しない。

初期案は毎分実行だが、これは即時通知ではない。アップロード完了後にポーリング待ちがある。
1回最大20受付、約210秒を超えたら後続を次回へ回し、スクリプトロックで同時登録を防ぐ。
機種・クラス分の同時投入・GAS実行時間と上限を測定して間隔と件数を調整する。

## GSSに保存するもの

- `ws_receipts`: 原本単位の受付ID・日時・端末・Drive原本ID・JSON ID・ハッシュ・読取状態。
- `ws_attempts`: 用紙単位の受付ID・ページ・QR・組番号・照合した生徒キー・状態・confidence・分割PDF ID。
- `ws_catalog`: QR識別と学年の対応。名簿の年度と一致しない教材はREVIEW。

`readingStatus`は画像読取の状態、`intakeStatus`は名簿照合を含む状態。両方を保存する。
ERRORや本人不明の候補も保持する。正常候補1件なら自動選択、同じ生徒・教材の複数候補は選択保留にするための
`WorksheetReceipt.groups()`を用意した。重複候補の選択・誤記訂正のWeb操作は未実装。
全員に確定操作を要求しない。今回の受信台帳で`OK`になっても成績確定を意味しない。

Mac miniのキューの実行順は1つのロックで直列化する。GASも専用プロジェクト1つを登録担当とし、
同じ台帳へ別GASプロジェクトを同時に書き込ませない。受信表の手編集も避ける。
GASは同じ受付JSONの再実行で過去の本人対応や判定結果を再計算・上書きしない。

## 後続の記入判定

Mac Studioが登録済み・解析対象の`attemptId`とDrive PDF IDを取得し、ローカルで記入判定する想定。
元PDFを上書きせず、`attemptId / analysisVersion / sourceHash / result / completedAt`を持つ別結果をDriveへ保存し、
GSSの判定状態・結果への参照を更新する。提出受付日時・提出回数・生徒対応を変更しない。
今回は`writingStatus=NOT_STARTED`のみで、定期取得・画像差分・点検・成績反映は実装していない。

## 検証と本番接続の確認点

```bash
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p test_cloud_intake.py -v
node --test scripts/worksheet-scan-header/tests/cloud-import.test.mjs
```

ローカル試験は架空名簿・模擬Drive/Sheetsと既存のQR/OMR処理を使う。
本番は別途、Mac miniの処理速度・Apacheへの影響、ScanSnap複数台、OAuth、非公開保存先、
GSS実列・年度・教材登録、GASのDriveサービス・時間主導実行、送信断からの回復を確認する。
公開リンク・生徒への共有はこの受信処理から作成しない。

参照: [Driveアップロードと事前予約ID](https://developers.google.com/workspace/drive/api/guides/manage-uploads)、
[Apps ScriptのDrive拡張サービス](https://developers.google.com/apps-script/advanced/drive)、
[Apps Scriptの上限](https://developers.google.com/apps-script/guides/services/quotas)。
