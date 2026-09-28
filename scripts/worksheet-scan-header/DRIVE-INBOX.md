# ScanSnap Cloud → Drive → Mac Studio → GSS

2026-09-28。ScanSnapがGoogle Driveへ保存したPDFをMac Studioで受け取り、
既存のQR・OMR読取、用紙分割、Drive送信、GAS名簿照合へ接続する。
記入判定・成績反映・生徒確認画面は後続工程。Mac miniを経由する必要はない。

## アカウントと保存先

- スキャン用の学校Googleアカウント: ScanSnap Cloudから原本を保存する。
- 処理用の学校Googleアカウント: 共有された原本をMac Studioから取得し、結果を保存する。
- 名簿照合: 専用GASから必要な名簿列だけを読み、専用GSSへ登録する。

取得元は設定したフォルダーの直下のPDFだけ。下位フォルダー、ショートカット、
Google文書などは辿らない。取得元のPDF・名前・親フォルダー・共有権限は変更しない。
取得元は閲覧・ダウンロード権限で足り、編集権限は不要。
ScanSnap Cloudの保存先と、結果の`artifacts`・`receipts`は別フォルダーにする。
入力と出力のフォルダーIDが同じ場合は送信を拒否し、再取込ループを防ぐ。

## Mac Studioの設定

Pythonと依存パッケージの準備は[CLOUD.md](CLOUD.md)を参照。
`drive-inbox-settings.example.json`をGit・公開Web・Drive同期の外へコピーして編集する。

| 設定 | 内容 |
|---|---|
| `sourceFolderId` | ScanSnapの保存先フォルダーID |
| `expectedAccount` | Mac StudioのOAuth認証に使う学校Googleアカウント |
| `stationId` | 例`studio-drive`。処理経路の識別子で、スキャナー個体番号ではない |

常駐用プログラムは、CodexのGoogle Drive接続や`clasp`の認証を流用しない。
処理用アカウントで明示的に認可したOAuthユーザー認証JSONを、Git外の非公開パスに用意する。
取得だけなら`drive.readonly`を使用できるが、認可範囲はそのアカウントが読めるDrive全体に及ぶ。
コードは指定フォルダーだけを読む。スコープ自体がフォルダー限定になるわけではない。
`drive.file`だけでは別のアプリであるScanSnap Cloudが作成したPDFを自動で読めるとは限らない。
送信には既存の[CLOUD.md](CLOUD.md)に記載した書込権限を別途設定する。
受信用・送信用で異なる認証JSONを指定できる。学校のアプリ許可設定も確認する。

### 0. 取得専用の初回認証

Google Cloudでこの受信処理用のプロジェクトを用意し、Drive APIとGoogle Auth Platformを設定する。
学校Workspace内の運用では対象ユーザーを「内部」とし、学校の管理ポリシーで利用できることを確認する。
OAuthクライアントの種類は「デスクトップアプリ」。ダウンロードしたJSONはGit・Drive同期・Web公開の外に置く。
外部ユーザー向けの「テスト」状態では通常リフレッシュトークンが7日で失効するため、そのまま常駐運用にしない。
プロジェクト作成や学校のアプリ許可、Googleの同意画面は利用者が確認して行う。

`requirements-cloud.txt`導入後、非公開フォルダー（権限700）を作り、次を実行する。
以下のメールアドレス・パスは実環境のものへ置き換える。

```bash
python3 scripts/worksheet-scan-header/authorize_drive.py \
  --client-secrets /path/to/private/desktop-client.json \
  --output /path/to/private/drive-read-oauth.json \
  --expected-account teacher@example.edu
```

ブラウザで本人が認証・同意する。コールバックは同じMacの127.0.0.1だけで待ち受け、PKCEを利用する。
Drive APIでアカウントを照合し、継続利用用トークンを得た場合だけ権限600で保存する。
アカウント不一致、既存の保存先、Git内のパス、読取以外の追加スコープは拒否する。
認証コード・トークン・認可URLをコンソールへ出さず、既存認証ファイルを上書きしない。
同意後の検査に失敗してもGoogle側の認可を自動で取り消す処理は行わない。

このCLIが要求する権限は`drive.readonly`のみで、受信に使用する。
Driveへの結果送信・GSSへの登録には別途書込用認証と保存先の設定が必要。
失効時は同じ手順で別名へ再認証し、設定を切り替える。無期限の認証を保証するものではない。

### 1. 接続とPDF一覧だけを確認

```bash
python3 scripts/worksheet-scan-header/drive_inbox.py \
  --settings /path/to/private/drive-inbox-settings.json \
  --credentials-file /path/to/private/drive-read-oauth.json inspect
```

アカウント一致・フォルダー参照を確認し、PDFのID・サイズ・日時・件数を表示する。
PDF本体の取得、QR/OMR読取、Drive書込、GSS書込は行わない。
0件は正常な空フォルダー。未認証・権限不足・一覧取得失敗を0件として扱わない。

### 2. 新着を取得してQR・OMRを読む

```bash
python3 scripts/worksheet-scan-header/drive_inbox.py \
  --settings /path/to/private/drive-inbox-settings.json \
  --credentials-file /path/to/private/drive-read-oauth.json pull \
  --queue /path/to/private/WorksheetQueue
```

直近15秒以内に変更されたファイルは次回へ回す。既定1巡20件、`--limit`で最大100件。
500 MiB・200ページの既存入力上限を継承する。取得前後のDriveメタデータ、
実ファイルのサイズとMD5を照合してから、既存の`CloudQueue.prepare`へ渡す。
転送途中のデータやハッシュ不一致は受け付けず、次回に再取得する。

`watch`へ替えると30秒間隔で繰り返す。間隔は`--interval`で指定できる。
保存完了から読取完了まで待ち時間がある。実際の認識時間・同時投入時の滞留は実機で測定する。
この監視が行うのは取得とローカル読取だけ。OS常駐登録や自動送信は行わない。

### 3. 既存の送信・GSS登録へ渡す

```bash
python3 scripts/worksheet-scan-header/cloud_intake.py \
  --queue /path/to/private/WorksheetQueue send \
  --settings /path/to/private/cloud-settings.json \
  --credentials-file /path/to/private/drive-upload-oauth.json
```

送信設定の`stationId`も`studio-drive`とする。取得時に作ったものと同じキューを使う。
送信先・GSSの指定と認証が整ってから実行する。原本の保全コピー、分割PDF、最後に受付JSONを保存し、
既存GASが登録する。ScanSnap保存先の原本と保全コピーは別ファイルとして保持する。
GSSへ登録する原本IDは保全コピー側。元のScanSnapファイルとの対応はローカルの`drive-inbox.json`に残る。
`uploaded`はDrive送信完了だけを表し、GSSの`ws_receipts`への登録は別途確認する。
GAS・送信設定・生徒向けUIの手順と未実装範囲は[CLOUD.md](CLOUD.md)を参照。

## 再起動・重複・原本の変更

- 取得元アカウント・フォルダー・経路をキューへ固定し、設定の取り違えを拒否する。
- DriveファイルIDと内容ハッシュを記録する。同じPDFを再取得しても、既存のSHA-256受付IDを再利用する。
- 異なるDrive IDでも完全に同じバイト列なら1受付にまとめる。同じ紙の再スキャンは通常別バイト列となる。
- ローカル受付後、取得済み記録の保存前に停止しても、次回は同じ受付へ戻れる。
- 取得済み原本の内容が変わった場合は`REVIEW / SOURCE_CHANGED`をコンソールJSONに出す。
  原本・以前の認識結果を自動で差し替えず、既存GSSの生徒対応も上書きしない。この警告のGSS転記は未実装。
- Drive上の改名や共有変更だけで内容が同じ場合は、再受付しない。
- `receivedAt`は最初に受け付けたPDFのDrive作成日時を使用する。紙を置いた実時刻や授業日時の保証ではない。
- キューと取得記録はMac Studioのローカル非公開領域に置き、バックアップする。SMB上で共有して実行しない。
- スキャナーを区別したい場合は保存先フォルダー・設定・キューを分ける。同一フォルダーから個体を推測しない。

`pull`の終了コード: 0=処理成功または対象なし、1=取得/読取ERROR、2=REVIEW。
`WAITING`や`PENDING`はキュー状態で、認識結果のOK/REVIEW/ERRORとは別。
元PDFが消された場合、既存のローカル受付は取り消さない。自動削除・移動・共有変更は行わない。

## 検証範囲

```bash
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p test_drive_inbox.py -v
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p test_authorize_drive.py -v
python3 -m unittest discover -s scripts/worksheet-scan-header/tests -p test_cloud_intake.py -v
node --test scripts/worksheet-scan-header/tests/cloud-import.test.mjs
```

通信・Drive/Sheetsは模擬環境で検証する。学校アカウントのOAuth、常駐実行、実スキャン精度、
Drive到着からGSS登録までの時間は別途実機検証が必要。

参照: [Drive PDFダウンロード](https://developers.google.com/workspace/drive/api/guides/manage-downloads)、
[Drive権限スコープ](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)。
初回認証: [GoogleのデスクトップOAuth](https://developers.google.com/identity/protocols/oauth2/native-app)、
[トークン失効条件](https://developers.google.com/identity/protocols/oauth2)、
[google-auth-oauthlib](https://googleapis.dev/python/google-auth-oauthlib/latest/reference/google_auth_oauthlib.flow.html)。
