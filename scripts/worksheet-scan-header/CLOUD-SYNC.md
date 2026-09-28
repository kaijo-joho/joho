# 結果保存・GSS登録確認・元PDFの整理

`cloud_sync.py`は、Mac Studioの既存キューを使い、Drive保存と登録確認を昼夜とも行う。
元のScanSnap PDFのフォルダー移動だけを、既定で日本時間21:00〜翌07:00に行う。
受付時の原本・解析結果・受付日時・生徒対応を再計算しない。本文の記入判定や成績への反映は含まない。

## 認証と保存先

取得専用OAuthは保持する。追加認可が必要な運用では、学校アカウントを確認して別ファイルへ保存する。

```bash
python3 scripts/worksheet-scan-header/authorize_drive.py \
  --client-secrets /private/path/desktop-client.json \
  --output /private/path/drive-archive-oauth.json \
  --expected-account SCHOOL_ACCOUNT --access archive
```

`archive`は`drive`（Drive全体の編集。権限上は削除も含む）を要求する。
Googleの権限はフォルダー単位ではないため、この範囲への明示的な追加認可が必要。
既存の`manage`は`drive.readonly`・`drive.file`・`drive.metadata`のまま維持する。
2026-09-28の実接続では、これら3権限が認可済みでも、ScanSnapが作った原本の
`addParents` / `removeParents`は403 `appNotAuthorizedToFile`となった。
保存・GSS登録通知の確認と原本移動の認可を区別し、移動できると推定しない。
`archive`は別名の認証ファイルへ保存して検証し、旧認証をバックアップしてから
常駐用`drive-manage-oauth.json`へ切り替える。スクリプトが既存認証を上書きすることはない。
プログラムでは学校アカウントと下記のIDを固定して操作を制限する。ACL変更・削除は行わない。
認証ファイル・キュー・実環境の設定はGitや公開ウェブ、同期フォルダーの外へ置く。

参考: [Driveのスコープ](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)、
[appNotAuthorizedToFile](https://developers.google.com/workspace/drive/api/guides/handle-errors#appnotauthorizedtofile)。

`cloud-sync-settings.example.json`をコピーして設定する。

| 設定 | 内容 |
|---|---|
| `sourceFolderId` | ScanSnapが直接保存するフォルダー |
| `artifactFolderId` | 原本コピーと分割PDFの非公開保存先 |
| `receiptFolderId` | アップロード完了を示す受付JSONの非公開保存先 |
| `processedRootId` / `reviewRootId` | ScanSnapフォルダー直下に作った「処理済み」「要確認」 |
| `expectedAccount` / `stationId` | 取得側と同じアカウントと端末識別子 |
| `ledgerId` | GASが実際に記録する専用GSSのID |
| `subject` | QR教科コード。例`INFO1`。一致しないQRを通常教材フォルダーへ分類しない |
| `timezone` / `archiveStartHour` / `archiveEndHour` | 移動時刻の窓。既定は`Asia/Tokyo`の21時〜翌7時 |
| `maxJobsPerCycle` | 1巡の処理上限。大量投入を一度に無制限で処理しない |

保存先の共有は指定した教員ユーザーだけに限定する。
整理先を元フォルダー配下に置くことで元の共有範囲を維持する。
同名フォルダーを検索して推測せず、作成前に予約したIDをローカル記録へ保存し、再試行も同じIDを使う。
`artifacts`のPDFはGASが固定親・ハッシュを検証するため、整理対象にしない。

## GSS登録の完了条件

GASの構成は[CLOUD.md](CLOUD.md)を参照。専用GSSの3表を使用し、既存名簿へ書き込まない。
`ws_catalog`の年度・教材IDは教員の指定値を設定し、学年は配付一覧のページ対応と授業予定GSSの授業進度から取得する。
取得不能・複数学年の場合はREVIEW。詳しくは[CLOUD.mdの対象学年の取得](CLOUD.md#対象学年の取得)を参照。
初回は手動で実登録を確認後、`installWorksheetReceiptTrigger()`で毎分実行を設定する。
新着JSONがなければDriveの照会だけで終了し、名簿全体を毎分読み直さない。

GASは全候補を書き、最後に`ws_receipts`へ受付行を書いてから、受付JSONのDrive propertiesへ次を記録する。

```text
worksheetImport = registered
worksheetLedger = 回収専用GSSのID
worksheetArchiveStatus = OK / REVIEW / ERROR
```

Macは受付JSONのID・MD5・サイズ・親・役割と、通知先台帳IDを照合する。
`uploaded`だけ、別台帳の通知、欠けた通知では移動しない。
`worksheetArchiveStatus`は画像読取だけでなく名簿照合後の判定を含む。
登録後の再試行は既存の候補と受付行を検証し、生徒対応を勝手に変更しない。

同一教材の原本は「処理済み/年度/教材ID」または「要確認/年度/教材ID」へ分類する。
複数教材・QR不明・対象外教科は「要確認/混在・識別未確定」へ保持する。
原本のDrive ID・サイズ・MD5・元親を検証し、移動先を記録してから親だけを変更する。
移動応答を失った場合も、同じIDの移動先とハッシュを確認して完了を復元する。

## 実行と状態

```bash
python3 scripts/worksheet-scan-header/cloud_sync.py \
  --queue /private/path/queue \
  --settings /private/path/cloud-sync-settings.json \
  --credentials-file /private/path/drive-manage-oauth.json --once
```

`--once`は送信・登録確認を1巡行い、時刻窓内の場合だけ整理も行う。
初回の限定検証は`--archive-now --max-jobs 3`で夜間待ちを外せる。
この指定でも登録通知やハッシュ等の条件は省略しない。
常駐導入は[MONITOR.md](MONITOR.md)の`install_monitor.py --with-cloud`を使う。

実移動の記録は`queue/drive-archive.json`。未完了の送信は既存キュー、GSS登録完了は台帳と受付JSONの通知が正本。
以前の`archive-plan.json`は読取時点の分類候補であり、最新の移動状態ではない。
設定・記録・予約IDを失うと安全な再試行ができないため、原本とともに非公開でバックアップする。

## 検証

```bash
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p 'test_cloud_sync.py' -v
node --test scripts/worksheet-scan-header/tests/cloud-import.test.mjs
```

未登録・別台帳・改変原本・応答喪失・複数教材・再試行・夜間窓を検証する。
実環境では原本ID・MD5・サイズ・所有者・共有範囲の前後一致、GSS行の重複なし、
時間主導トリガーの実行履歴、常駐PIDと最終成功日時を別途確認する。
生徒確認画面・誤記や重複の選択画面・記入量判定は後続工程。
