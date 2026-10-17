# 3名限定の学校試用

入口は `?mode=school-trial`。通常モードと問題配布専用の `teacher-preview` を維持し、既存の教員2名・デモ生徒1名だけをサーバーで照合する。名簿への教員追加、通常dist/gradeの切替、教材へのリンク追加、旧Colab・HTMLエディタの変更は行わない。試用結果は本番成績へ計上しない。

## データと権限

| データ | 保存先と責任 |
|---|---|
| 問題・雛形 | 既存の限定配布パッケージ。問題カタログと判定条件を同じ配信世代から取得 |
| 非公開の正本・採点表 | 既存の教員管理GSSと圧縮ScriptProperties。生徒へ正本の閲覧権限を付与しない |
| ローカル判定条件 | 非公開の照合原文をfingerprintへ変換した版固定policy。模範解答・照合原文・署名鍵を配信しない |
| 下書き・履歴・試行・回答 | 教員所有で本人だけを編集者にした個別GSS。基本構成は通常の共通保存方式と共用 |
| 試用提出 | 個別GSSの独立した追記シート。全文・実行記録・ローカル結果・サーバー受付・署名を保存 |
| 教員の回収 | 別途作成が承認された教員専用GSSへ署名・本文hashを検査して転記。本番成績とは接続しない |

各個人GSSは `使い方`、`Python`、`Python履歴`、`Python確認`、`Python確認受付`、`Python試用提出` の6シート。使い方を表示し、データシートを非表示にする。管理情報と各ヘッダーを所有教員だけの実保護にし、本文は本人が編集できるようにする。非表示・保護は機密化の手段ではなく、誤操作防止である。

実メール・GSSID・scope ID・接続用/署名用鍵は公開ソースへ保存しない。試用の固定registryは限定GASのScriptPropertiesに置く。試用2教員は生徒名簿へ混ぜず、`teacherTrial` として本人の保存先だけを使う。デモは通常の生徒と同じ所有者・編集者・保護検査を受ける。

## 評価と提出

ブラウザで既存の行数・コード条件・出力条件を判定する。サーバーはコードを再実行・再採点せず、本人、対象問題と版、policy hash、全文/実行記録hash、固定check群、配点・分母・得点・★の集計対応を検査する。コード条件の★と行数/出力を含めた得点は別に扱う。

署名は受領後の内容改変を検出する。改変可能なブラウザが正しく実行した証明ではない。短い条件のfingerprintには推測の余地があり、秘匿性や試験向けの不正対策を保証しない。学習への取組評価を目的とする。

個別GSSで `pending` → 全文/署名/行hashの読戻し → `committed` の読戻しが完了して「試用提出済み」とする。回収までの待ち時間は受付時刻を変えない。試用の締切はなく `dueAt:null`。通常授業の締切・成績を変更しない。

再送は本人と不変request IDで照会する。同じ本文なら元の署名と受付を返し、異なる本文には同じIDを再利用できない。応答消失時は自動で別の提出を作らず、照会または明示再送を行う。履歴は保持し、最高得点の1回から★を表示する。旧版は旧policyで提出し、配布対象から外れた後も既存requestは照会できる。

採点設定のないコード・確認問題には点数を作らない。確認問題の試行・回答の保存/復元は利用できるが、試用提出は無効。ローカル判定だけで受理済みの★を付けない。

## 保存と復元

生徒には区切りや終了時のJSONファイル保存（⌘S/Ctrl+S）を案内する。ブラウザはすぐ保存し、GSSは問題/セット切替、手動保存、提出、保存して終了、および変更時のみ10分ごとに保存する。通常の保存処理・競合保護・確認journalの分割保存を共用する。

接続cacheと再送控えは `school-trial` とscopeごとのStorageに分ける。コードのブラウザ下書きは既存形式を維持する。アカウント変更時は未保存を検査し、ローカルの控えと引継ぎの確認を行う。クラウド復元前にローカルを保護し、競合時は勝手に捨てない。

## 配置・管理・停止

`scripts/prepare-pythoneditor-trial-gas.mjs` は退避済みの限定配布GASから新しい私有候補を作る。元のmanifest・非公開設定・問題パッケージを保持し、保存serviceの通常向けRPC/doGetは含めない。公開Gitへ私有候補を追加しない。

```sh
node scripts/prepare-pythoneditor-trial-gas.mjs \
  --baseline /private/tmp/<退避済みGAS> \
  --out /private/tmp/<新しい配置候補> \
  --bridge-url <既存の限定GASのexec>
```

所有教員がGASの管理関数を実行する。

1. `run_prepareSchoolTrialPersonalStores` は3名の個別GSSだけを作成・本人共有する。回収GSS・接続configは未作成のまま。
2. `run_configureSchoolTrialPersonalOnly` は3名分を読戻して接続設定と専用鍵を用意する。`centralId:null`、初回は無効。回収先なしで保存・試用提出・照会を利用できる。
3. Driveの実permissionで所有者、本人以外の編集者なし、一般アクセスが制限付きであることを確認する。編集者の再共有を無効にする設定は、本人への編集権限付与とは別の承認事項として扱う。
4. `run_inspectSchoolTrial` で全構成を読戻し、私有の `run_configureSchoolTrialEndpoint` で同じexecを固定する。
5. `run_enableSchoolTrial` と専用 `trial-config.mjs` を有効にする。通常の保存/採点設定は無効のまま。
6. 試用版の回収は所有教員が `run_collectSchoolTrial` を手動実行する。定期回収トリガーは設置しない。

回収先が未設定なら回収はGSS接続前に停止し、回収トリガーも有効にしない。追加作成が承認された後の `run_prepareSchoolTrial` は既存3名分を再作成せず、中央GSSだけを作成して接続する。個人GSSID・scope・世代・署名鍵・受付履歴・有効状態を維持する。23時〜5時の利用制限は別途設計中。夜間の定期回収は本番向けの候補とし、試用版は手動回収を維持する。

OAuthは既存の `spreadsheets` と `userinfo.email`、Webアプリは `USER_ACCESSING` / `DOMAIN` のまま。トリガーはGAS UIで設置し、実行時のeffective ownerと最初に記録したtrigger UIDを照合する。ScriptApp APIの追加権限を3名へ要求しない。

`google.script.run` とはJSON文字列で往復する。採点範囲の終端なし、未受付、評価対象外を表す `null` をobject変換で欠落させないためである。JSON窓口も既存RPCの本人・権限・保存検査を通し、別の認証経路は設けない。

停止は `run_stopSchoolTrial`、フロントの `trial-config.mjs enabled:false`。個別GSS・再送控え・履歴・署名鍵を削除しない。旧公開版と退避ソースへ戻せるようにし、通常授業の設定を巻き戻さない。

## 検証範囲

```sh
node --test tools/pythoneditor/tests/*.test.mjs \
  scripts/tools-store-gas/tests/*.test.mjs \
  scripts/pythoneditor-preview-gas/tests/*.test.mjs \
  scripts/pythoneditor-trial-gas/tests/*.test.mjs
node scripts/build-pythoneditor-local-assessment.mjs --check
node scripts/test-pythoneditor-school-trial-browser.mjs
```

合成試験では固定3role、第四者拒否、別人binding、保存/確認journal、再送・通信断・不完全書込、署名改変、旧版、最高評価、回収重複、停止・所有者/保護不整合、貸出機相当の新規context復元を確認する。ブラウザ試験は実UI/実GASロジックを合成のSession/Sheetsへ接続し、実Googleアカウントと区別する。実共有・実アカウント・40人授業の負荷は別に検証記録を残す。

### 2026-10-17の反映と確認

- 3名の個人GSSを作成し、教員所有・対象本人のみ編集者・一般アクセス制限付き・6シート・管理情報の保護を実データで読戻した。
- 限定試用GAS v10を同じURLへ反映。退避した配布専用v7と試用v9を保持し、配置した21ファイルの一致を確認した。
- 公開エディタの所有教員アカウントで、125項目取得、`input()`を含むPython実行、下書き保存、控えを残す復元、署名付き提出、100点・★★★・履歴表示を確認した。個人GSSの受付行も `committed`、全文・実行記録・受付・署名ありと読戻した。
- 自動試験431件とChrome/WebKit各20グループの合成ブラウザ試験が成功。ほか2名の本人ログインと40人の実機同時利用は未検証。
- 承認後に所有教員専用の回収GSSを追加して接続した。既存3名の保存先・scope・有効状態を保持し、試用提出1件を回収。元の全文・署名・受付との一致と、2回目の回収が0件であることを実GSSで確認した。
- 個人3冊と回収用1冊で「編集者がアクセス許可を変更して共有できるようにする」を無効化した。本人の編集権限と一般アクセスの制限付き設定を維持。定期回収トリガーは今回追加していない。
