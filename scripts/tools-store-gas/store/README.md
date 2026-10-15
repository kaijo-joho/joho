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
