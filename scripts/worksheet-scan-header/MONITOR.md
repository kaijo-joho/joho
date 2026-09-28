# Mac Studioでの常駐監視

2026-09-28。ScanSnap Cloud → Google Drive → Mac Studio の取得・QR/OMR解析を常駐化する。
`--with-cloud`で結果のDrive保存、専用GASのGSS登録確認、元PDFの夜間整理を追加できる。
本文の記入判定・成績反映は実行しない。

## 動作と時刻

| 日本時間（土日も同じ） | 通常の新着確認間隔 |
|---|---:|
| 07:00〜17:00 | 60秒 |
| 17:00〜24:00 | 5分 |
| 00:00〜07:00 | 30分 |

新規受信、保存直後で待機中のPDF、1巡の上限を超えるPDFがあれば、最後の検出から10分間は30秒間隔。
時間帯の境界を越えて待たない。通信障害・個別ダウンロード失敗は再試行を繰り返し、最大30分まで間隔を延ばす。
処理にかかった時間はこの間隔に加わる。Drive到着をプッシュ通知で受ける方式ではない。
`monitor-settings.json`で時刻・間隔・保存安定待ち時間・容量余裕を変更できる。変更後はサービスを再起動する。

`poller`・`analyzer`と、任意の`cloud`が独立して動く。

1. **poller:** 指定フォルダー直下のPDFを検出し、サイズ・ハッシュ・変更時刻を照合して原本を保存する。
   受付IDは原本SHA-256由来。`received`の状態と原本が揃ってから取得済み記録を保存する。
2. **analyzer:** `received`を順番に1件ずつ読み取り、結果・分割PDF・デバッグ画像を保存して`prepared`にする。
   空き時の確認は5秒間隔。OpenCVは1スレッド。受付ID単位のロックで同じ原本の同時解析・送信を防ぐ。
3. **cloud:** 未送信の原本コピー・分割PDF・receipt JSONを送信し、GASによる登録完了通知を確認する。
   元のScanSnap PDFの移動だけを夜間に限定する。アップロードと登録確認は昼も行う。

解析中の受付IDロックは別の新着受信を妨げない。読取前に原本ハッシュを再検証する。
クラッシュ・再起動後は`received`から再開し、`prepared`/`uploaded`は再解析しない。
解析処理の例外は受付ID別に再試行時刻を保持し、後ろのPDFは先に処理できる。
認識結果の`REVIEW`/`ERROR`は解析完了した結果として保存し、無限に再解析しない。
再読取したい場合は既存結果の差し替えではなく、別の検証出力として扱う。

## 導入

既存のPython仮想環境・Poppler・取得専用OAuth・`drive-inbox-settings.json`が必要。
[DRIVE-INBOX.md](DRIVE-INBOX.md)で取得先と学校アカウントを確認してから導入する。
認証ファイルはGit・公開ディレクトリ・Drive同期フォルダーの外へ置く。

```bash
python3 scripts/worksheet-scan-header/install_monitor.py \
  --runtime "$HOME/Library/Application Support/WorksheetIntake" \
  --python "$HOME/Library/Application Support/WorksheetIntake/venv/bin/python" \
  --pdftoppm /absolute/path/to/pdftoppm \
  --revision SOURCE_COMMIT_SHA --activate
```

クラウド接続時は、別途認可した`drive-manage-oauth.json`と`cloud-sync-settings.json`を導入先へ置き、
上記に`--with-cloud`を追加する。設定項目と登録完了条件は[CLOUD-SYNC.md](CLOUD-SYNC.md)を参照。
認可なしで読み取り専用から書込みへ切り替えない。

導入時にソースと座標JSONを非公開の`releases/<日時>/`へ複製し、ファイルハッシュとリビジョンを記録する。
実行中のコードはGit作業ツリーの変更に影響されない。再導入時も以前のリリースを残す。
稼働中ジョブの停止直後、launchdが再登録を一時的に拒否する場合は10秒以内で再試行する。
解消しなければ導入失敗として旧plistを復元する。復元時も同じ再試行を行う。
`--activate`を外すとplist作成まで（既に起動中の場合は更新を拒否）。

以下を`~/Library/LaunchAgents/`へ置く。

- `jp.kaijo.worksheet-poller.plist`
- `jp.kaijo.worksheet-analyzer.plist`
- `jp.kaijo.worksheet-cloud.plist`（`--with-cloud`指定時）

**ユーザーがログインすると起動し、ログイン中に終了した場合はlaunchdが再起動する。**
再起動後のログイン前・ログアウト中・本体のスリープ中は処理できない。
画面ロックだけなら動作を継続する。ログイン前も動かすLaunchDaemonやMacのスリープ設定の変更は本導入に含めない。
本体が停止している間もDriveにPDFは残り、復帰後に未受信分を取得する。

macOSのBackground優先度で動作し、数値ライブラリのスレッドも1に制限する。
既定では2 GiBの空き容量余裕に、原本取得・複製用の1 GiBを加えた容量未満では新規処理を保留する。
原本や未処理PDFを容量確保のために削除しない。

## 状態とログ

導入先の`monitor-installation.json`に使用中のリリース・plist・復元用保存先がある。
`queue/monitor/`には以下を保存する。

- `poller-status.json`: 最終試行・成功日時、次回確認、短時間確認の期限、失敗回数、今回の件数。
- `analyzer-status.json`: 解析中・待機・再試行、未解析件数、直近の完了日時と認識状態。
- `cloud-status.json`: 送信・登録確認・移動の今回の結果、最終成功日時と再試行状態。
- `analysis-retries.json`: 解析例外の受付ID別再試行時刻。
- `last-poll-reports.json`: 直近の変化・要確認理由（変化なしで上書きしない。過去の記録の可能性がある）。
- `poller.log` / `analyzer.log`: 2 MiB × 本体＋3世代。氏名・生徒番号・OAuth例外本文を出さない。
- `*-launch.log`: 起動時の失敗など少量の標準出力。通常の繰返し記録は上記のローテーションログへ出す。

稼働中の確認（JSONが残っているだけでは稼働証明にならない）:

```bash
launchctl print "gui/$(id -u)/jp.kaijo.worksheet-poller"
launchctl print "gui/$(id -u)/jp.kaijo.worksheet-analyzer"
launchctl print "gui/$(id -u)/jp.kaijo.worksheet-cloud"  # クラウド接続時
```

ログの異常・認証失効は状態に残すが、メールや生徒への通知は実装していない。
初回運用では最終成功日時と滞留を教員が確認する。件数が増えた場合は実測して間隔・容量を見直す。
状態JSONは起動中のスナップショットであり、解析中は完了まで更新されない。

停止（原本・結果・設定を削除しない）:

```bash
launchctl bootout "gui/$(id -u)/jp.kaijo.worksheet-poller"
launchctl bootout "gui/$(id -u)/jp.kaijo.worksheet-analyzer"
launchctl bootout "gui/$(id -u)/jp.kaijo.worksheet-cloud"  # クラウド接続時
```

再開:

```bash
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.kaijo.worksheet-poller.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.kaijo.worksheet-analyzer.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.kaijo.worksheet-cloud.plist"  # クラウド接続時
```

`bootout`だけでは次回ログイン時の起動を止めない。長期停止は対象のplistをLaunchAgents外へ保管する。
更新失敗時はインストーラーが旧plistへ戻し、元々動いていたサービスを起動する。
手動復元は停止後、`service-backups/<日時>/`の旧plistを戻して再開する。
初回導入前へ戻す場合は停止し、今回作成したplistをLaunchAgents外へ保管する。
どちらの場合もキュー・原本・結果・OAuthファイルは保持する。

## 処理済みフォルダーの分類方針

QRにある年度とワークシートIDを使う。

```text
ScanSnap保存先（未処理・再試行中）
処理済み/
  2026/
    dr41/
    dr42/
要確認/
  2026/
    dr41/
  混在・識別未確定/
```

認識済みの各受付ディレクトリへ`archive-plan.json`を作り、読取時点の分類候補を記録する。
これは保守的な旧計画で、移動完了の正本ではない。実際の移動は`cloud_sync.py`の専用記録で追跡する。
`--with-cloud`で接続済みの場合も、`prepared`や`uploaded`だけで提出登録完了とみなさない。
原本と結果の保全・GSS登録完了の照合・対象Driveへの書込認可が揃った原本だけ移動する。
移動用の「処理済み」「要確認」はScanSnap保存先の配下へ作り、元と同じ共有範囲を維持する。
通常は日本時間21:00〜翌07:00の確認時に整理する。移動後もファイルID・内容は保持する。

同一原本PDFに複数のワークシートIDが混在する場合、原本をどれか1つの教材フォルダーへ推測で振り分けない。
原本は「混在・識別未確定」扱いとし、分割済み用紙にはそれぞれのワークシートIDによる分類候補を記録する。
QRが不明・表裏が不一致のものも要確認。教科・年度・IDの完全な組は計画JSONに保持する。
他教科へ展開するときは教科ごとのルートを分けるなどして、同名IDが衝突しないようにする。

## 検証

```bash
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p 'test_monitor.py' -v
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p 'test_*.py' -v
```

時間帯境界・夜間からの短時間確認・通信障害・空き容量不足・同時解析防止・解析中の新規受信・
解析例外後の継続・再起動後の受付再利用・原本改変拒否・分類計画のGSS完了条件をオフラインで検証する。
実機ではlaunchdのPID、指定Driveへの成功確認、再起動後のPID変更と取得済み記録の保持を別途確認する。
大量投入時の所要時間、OS本体の再起動・再ログイン、Google認証の長期継続は運用中の確認事項。
