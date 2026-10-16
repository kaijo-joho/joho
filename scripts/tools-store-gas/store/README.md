# tools共通の下書き保存GAS（配置前の実装）

2026-10-15。生徒本人として実行する新規GAS。初版の接続対象はPythonだけ。既存のHTMLエディタ、Colab、distの既存配付、gradeの正式採点を変更しない。正式得点・提出記録はこのGSSへ保存しない。

## 承認が必要な配置

- `appsscript.proposed.json`は提案であり、稼働設定ではない。`.clasp.json`や実scriptIdは含めない。
- 新規プロジェクトへ`common/05_tools_store_contract.js`とこのディレクトリの`.js`/橋`.html`を配置する。
- 実行は`USER_ACCESSING`、アクセスは学校ドメイン限定の`DOMAIN`。既存dist/gradeの実行者は変更しない。
- 提案スコープは`spreadsheets`と`userinfo.email`。保存先の所有者・編集者は`Spreadsheet.getOwner()/getEditors()`で確認し、保存GASにDrive権限を要求しない。[Google公式仕様](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet#getOwner())
- 学校管理者の許可、初回OAuth承認、Safari/Chromeの認証・二重iframe、公開デプロイ、実GSSの作成・生徒への共有・保護設定は未実施。承認後に別手順で検証する。

ScriptPropertiesへ次の**設定名**を用意する。実値はコード・公開資料・ブラウザへ含めない。

| 設定名 | 用途 |
|---|---|
| `TOOLS_STORE_ENABLED` | `true`のときだけ有効。未設定は無効 |
| `TOOLS_STORE_CONFIRMATION_ENABLED` | 確認journalの分割保存だけを追加で許可。未設定は無効 |
| `TOOLS_STORE_BINDING_KEY` | distと共有するサーバー専用HMAC鍵。32文字以上 |
| `TOOLS_STORE_ALLOWED_ORIGINS` | エディタoriginのJSON配列。ワイルドカードなし |
| `TOOLS_STORE_ALLOWED_DOMAINS` | 学校アカウントのドメインのJSON配列 |
| `TOOLS_STORE_TEACHER_OWNERS` | 許可する教員所有者メールのJSON配列 |

鍵の実値はこの試作では生成・保存していない。初回認証はトップレベルで承認を済ませてからエディタで接続し直す場合がある。接続確認だけでは保存済みにせず、対象コードの書込と読み戻しの成功を確認する。

## 保存先と保護

distが教員権限で生徒ごとに1つのGSSを作成・取得し、既存の個別フォルダに対応付けて管理する。保存GASは構成や共有を変更しない。

- `使い方`を表示し、A1:B6のスキーマ・本人hash・世代・state・kind・所有者は教員限定で保護する。
- `Python`と`Python履歴`は非表示、A1:N1の見出しだけ教員限定の保護、本文A2:Nは生徒が編集可能。本文の警告のみ保護は許容する。
- 14列は`recordKey, recordKind, metaJson, フォルダ, code01..05, stdin01..05`。D列が擬似フォルダの専用1列。`j:`付き文字列で数式として評価されず、メタデータ内のフォルダと一致するか検査する。
- 既存の余分な空列は許容する。追加列に別見出しがある場合は構成不一致として止め、削除しない。
- 保存GASは本人のactive/effectiveアカウント一致、学校ドメイン、署名binding、実際の教員所有者・本人の編集権限、保護、保存先世代、stateを確認する。ブラウザから任意のGSS ID・本人メールは受け付けない。
- 構成更新はdistが`upgrading`にしてから行う。保存時も各書込の前後で世代/stateを再検証する。既存本文の位置を変える更新は、実行中処理が終わる保守時間を確保し、本文を退避してから行う。

## APIと保存確認

入口は`?kind=toolsstore&origin=...&channel=<64hex>`。許可したoriginとnonce/channelを橋・エディタ双方で照合する。GAS公開RPCは`toolsStoreRpc(action,input,binding,origin)`で、橋が固定した第4引数と署名bindingのoriginが一致する必要がある。

| action | 本文 | 戻り値 |
|---|---|---|
| `session` | `{}` | 本人、actorKey、保存先ID、schemaVersion |
| `listDrafts` | `{tool:'python'}` | 本文を含まない最新一覧 |
| `getDraft` | `{tool,questionId,version,revision?}` | 全文のdraftと最近32件のcheckpoint metadata |
| `saveDraft` | `{tool,questionId,version,setId,title,folder,requestId,expectedRevision,code,stdin,clientId,preserveRevision?,baseCode?,baseStdin?}` | `saved`または`conflict`、draft、receipt/checkpoint |
| `lookupSave` | `{tool,requestId}` | `saved`と証拠metadata、または`missing` |

- 全文コード・stdinは各20万UTF-16文字まで、各5セルへ45,000文字ずつ分割し、サロゲート対を分断しない。1セル先頭の`j:`により式注入を防ぐ。保存時に長さ・SHA-256を読み戻して確認する。
- `expectedRevision:null`は新規だけ。既存のremoteを取得せずに自動保存できない。競合時はremote全文を返し、勝手に採用しない。
- `preserveRevision=expectedRevision`は利用者がローカルを採用する際の指定。上書きされるremoteをcheckpointしてからcommitする。端末clientIdの変更時も同様に保存する。
- 同じrequestIdは不変の要求だけを再送する。最新固定ブロック内に最近16件のrequestId・要求hash・受理metadataを保持し、重複書込をしない。通常保存応答は全文、`lookupSave`と重複応答のdraftは**metadataだけ**の場合がある。クライアントは元の送信本文を保持し、question/version/revision・codeHash・stdinHashを照合してから保存済みにする。
- 保持範囲外のrequestIdは`missing`。受理していないと断定せず、元のCAS条件で再送・競合処理する。最新revisionへ勝手に差し替えて再送しない。

## 書込方式と容量

- `UserLock`で同じ生徒の端末間だけ直列化する。他生徒と`ScriptLock`を共有しない。共通スクリプト/API側の上限までなくなるという意味ではない。
- 最新表は1問1版につきデータ2行とcommit2行。非アクティブなデータを準備・読戻ししてからcommitを切り替える。途中書込・commit失敗のときは直前の有効版を残す。
- 履歴本文は初回・通常5分間隔・端末変更・明示的な競合解決時にcheckpointする。毎回の全文追記や履歴全走査をしない。通常保存は固定の最新表と必要な直前checkpointだけを読む。
- 初版は最新256問版（1,025行）とcheckpoint 2,048件（2,049行）。旧版も別の問版として残す。満杯ならデータを消さず停止し、distによる構成更新へ戻す。授業全範囲を縮小するための制限ではなく、容量監視・増設が必要な上限である。
- APIで表示する履歴は最近32件。さらに古いcheckpointも削除せず、revisionを指定した復元は履歴のキー列から探す。この明示的な復元だけは過去キー列の検索を許容する。
- GSSを直接編集した破損は通常データとして扱わず停止する。非表示・保護は誤操作防止であり、正式評価の根拠には使わない。

## 検証

`node --test scripts/tools-store-gas/tests/common-contract.test.mjs scripts/tools-store-gas/tests/store-repository.test.mjs scripts/tools-store-gas/tests/store-bridge.test.mjs`

Node fake GSS/署名/橋で本人・世代・origin・保護、CAS、貸出端末、20万字、式先頭、途中書込、応答消失、再送、checkpoint、40名の独立環境を検証する。40名テストは合成であり、実GASの応答時間・クォータ・学校アカウント40名同時利用の検証ではない。

## 確認journalの追加契約（2026-10-17・本番無効）

従来の`schemaVersion:1`と`Python`/`Python履歴`は保持する。確認journalのデータ形式もportable schema1で、試行1000件・回答2000件・UTF-8 JSON 4MiBまで。`common/06_tools_confirmation_contract.js`はブラウザの`confirmation.mjs`と`confirmation-store.mjs`の検証関数から生成する。未知のscore等の項目、重複試行ID、存在しない試行への回答参照、不正なID/版、コードのSHA-256不一致を拒否する。JSONを正規化し、全体のSHA-256とUTF-8バイト数を読戻してから保存済みとする。学習用の記録であり、入力・出力・端末日時・hashを正式な受付や正解の証明にはしない。

### 分割RPC

すべて既存の本人・binding・origin・UserLockと、所有者・編集権限・保護・世代/stateを再照合する。ブラウザから任意の保存先IDや本人メールを受け取らない。

| action | 入力（すべてtool:'python'） | 戻り値 |
|---|---|---|
| `getConfirmationJournal` | `{tool}` | 空なら`{journal,revision:null,journalHash,byteLength,chunkCount:0,chunkSize:32000}`。既存ならmanifest |
| `getConfirmationJournalChunk` | `{tool,revision,readId,index}` | `{revision,index,text,chunkHash}` |
| `releaseConfirmationRead` | `{tool,revision,readId}` | `{state:'released',revision}` |
| `beginConfirmationSave` | `{tool,requestId,expectedRevision,journalHash,byteLength,chunkCount}` | `{state:'uploading',requestId,received:[index...]}`、または既知のsaved/conflict |
| `putConfirmationChunk` | `{tool,requestId,index,text}` | `{state:'uploading',requestId,index,chunkHash}` |
| `saveConfirmationJournal` | `{tool,requestId,expectedRevision}` | `{state:'saved',requestId,revision,journalHash}`、またはconflict |
| `lookupConfirmationSave` | `{tool,requestId}` | saved/conflict、または`{state:'pending'|'missing',requestId}` |

manifestは`{revision,journalHash,byteLength,chunkCount,chunkSize:32000,readId}`。conflictはこれに`state:'conflict'`を付ける。元のexpectedRevision・requestId・journalHash・byteLength・chunkCountを途中で変更しない。chunkも同じ番号で異なる本文を送ったら拒否する。4MiBのjournal全体を1 RPCへ入れる直接保存方式は用意しない。クライアント側はcanonicalな本文をUTF-16 32000文字以下で分割し、サロゲート対を分断しない。受信時は全chunkのrevision/index/hashと全体hash/バイト数を照合してから取り込む。

### 追加シートと途中失敗の保護

- 教員として動くdistだけが非表示の`Python確認`（1067行以上）と`Python確認受付`（4097行以上）を準備する。4列ヘッダーだけを教員限定で保護し、本文は本人が編集できる。利用者GASはシート・行・保護・共有を追加しない。
- `Python確認`はcommitポインター2行と8つの分割バンク。1バンクはmetadata1行＋最大132chunk行。各chunkは`j:`付きの1セルへ入れ、式として評価させない。直前の有効commitを保持して別バンクへ準備し、検証後だけポインターを切り替える。
- readIdごとに5分の読取リースを持ち、chunk取得で更新する。読取中のバンクは再利用せず、別端末で最新版が変わっても指定revisionを最後まで読める。終了時は必ずreleaseする。通信断等でリース切れの場合は明示エラーとし、新旧chunkを混ぜない。8つのバンクは読取保護の一時世代であり、永久履歴の保存機能ではない。
- 未commitのバンクは20分経過後に再利用できる。不変の受付記録を残すため、元の要求で再beginして再準備できる。別端末が先にcommitしていればCAS競合になり、現在のjournalを上書きしない。
- 受付一覧はrequestIdと要求fingerprintを同じセルへ先に固定する。応答消失・metadata/本文/commitの部分書込では同IDの照会・再送で回復し、勝手に別要求へ置換しない。直前commitの受付結果を確定してから次の要求を受け付ける。初版4096件の受付記録は自動削除せず、満杯では保存を停止して教員へ通知する。

### 教員による更新と承認前の境界

1. 保存GASとdistの候補を生成・差分確認し、旧デプロイ・台帳・対象GSSを退避する。本番反映・共有変更は別途承認する。
2. distに`TOOLS_STORE_DIST_CONFIRMATION_ENABLED=true`を明示する案。既存admin/provisionの許可も必要。指定教員が対象1名をpreviewし、`prepareToolsStoresV1`を既存の`PREPARE_TOOLS_STORES_V1`で実行する。初版の構成を壊さず追加し、準備中は`upgrading`で保存を止める。追加時にgenerationを更新するため、生徒は再接続して新bindingを取得する。
3. activeな保存先の追加シートが片方だけ消えている場合は、空シートで隠して自動復旧しない。元データの所在を先に確認する。
4. 追加シート・保護・所有者・本文の保持を読戻し、保存GASの`TOOLS_STORE_CONFIRMATION_ENABLED=true`を限定対象で確認する。旧構成の保存先は通常のコード保存を継続し、確認同期だけ`confirmation_upgrade_required`で止める。
5. 初回OAuth、貸出機→自端末、通信断、認証切れ、実40名で検証後に利用範囲を判断する。ここでは本番/GSS/プロパティ/権限/トリガーを操作していない。停止は確認用フラグをfalseにし、追加シートや受付記録を削除しない。

4MiB全体を20秒ごとに送る設計は授業運用の既定にしない。小さいjournalでも変更の集約と直列化を行い、大きいjournalでは1回の保存に最大132 RPCが必要になることを表示・実測する。40名の実GAS応答時間・GSS書込量・初回取得時間は未測定。規模が増えれば試行の差分追記など別の契約が必要で、今回の合成試験だけで実運用負荷が解決したとは判断しない。

```sh
node scripts/build-tools-confirmation-contract.mjs --check
node --test scripts/tools-store-gas/tests/*.test.mjs scripts/tools-store-gas-test-prepare.mjs
```
