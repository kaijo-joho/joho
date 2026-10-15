# 教員1名での問題配布・実機検証

2026-10-16。対象は学校の教員アカウント1名による問題一覧・問題文・雛形の取得。コードと配備候補を準備した段階で、新規GAS作成、OAuth承認、デプロイ、公開エディタの接続有効化は未実施。実機検証済みとは扱わない。

## 配布の流れ

教員が検証用GASで手動配信する。「配付ファイル一覧」のPython問題マスターと指定採点表を読み、既存パーサーで全セット・全版を検証して、gzip＋Base64でScript Propertiesへ保存する。Googleで本人確認した教員1名にだけ、問題一覧・問題文・雛形・準備コードを返す。

- 少数の固定サンプルへ縮めず、正本にある全セット・全版を対象とする。
- 採用前の「編集中」を含む教員専用プレビュー。正本の状態、問題の版、課題設定、締切を変更しない。
- 既存パーサーとの整合性確認のため採点表も読む。基準はGAS内に保持し、ブラウザへは `PythonEditorMaster.publicQuestion` の項目だけを返す。解答・解説・採点基準・原本IDは返さない。
- 生徒別GSSとdist署名bindingを必要とする保存・採点接続は使わない。コードの実行・ブラウザ保存・任意のローカル保存は利用できる。
- 検証GASは既存dist/gradeから分離した新規プロジェクト。同じプロパティキーを使う圧縮処理を既存GASへ配置しない。

## 配置前に確認する具体案

| 対象 | 案 |
|---|---|
| 新規GAS | 指定した学校教員が所有する「Pythonエディタ・教員用配布検証」1件 |
| 実行主体／公開範囲 | 利用者本人として実行 `USER_ACCESSING`／学校ドメイン `DOMAIN` |
| 実際の利用対象 | サーバーのallowlistに明示する教員1名だけ |
| OAuth | `spreadsheets`、`userinfo.email` の2スコープ |
| GSS | 既存のPython問題マスター・指定採点表を読取。作成・書込・共有変更なし |
| フロント | 新規GASの固定 `/exec` URLを専用設定へ反映。通常の保存・採点設定は無効を維持 |
| 検証入口 | `tools/pythoneditor/?mode=teacher-preview`。他のページからのリンクは追加しない |

`spreadsheets` は本人がアクセスできるスプレッドシートの読み書きを許可する広いスコープ。検証コードのSpreadsheet操作は設定した正本の読取だけで、保存先をブラウザから指定させない。Drive・トリガー管理スコープは追加しない。

Googleの[Webアプリ実行主体](https://developers.google.com/apps-script/guides/web#permissions)と[SpreadsheetApp.openByIdのスコープ](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openbyidid)を確認した。初回承認画面・学校管理者の制限は実機未確認。指定教員・GAS所有者・2スコープ・新規配備と専用接続を確認してから実施する。

今年度のColab・HTMLエディタ、既存dist/gradeの公開デプロイ、生徒用GSS、既存共有、正本の採用状態は変更しない。

## 私有の配備候補

実メールや設定値は公開リポジトリへ保存しない。私有の設定JSONに `editorOrigin`、`sourceFileListId`、`teacherAccount`、`gradingSheet` を指定する。

```sh
node scripts/prepare-pythoneditor-preview-gas.mjs \
  --settings /private/tmp/<検証準備>/settings.json \
  --out /private/tmp/<検証準備>/gas
```

これはネットワークへ接続せず、新しい私有領域へ候補を作るだけ。既存フォルダ・GAS・OAuth・共有設定に作用しない。実project IDや既存 `.clasp.json` は流用しない。全JSをGASの同一globalとして構文確認し、二重iframeのブリッジも `session` だけに絞る。`DEPLOYMENT_REVIEW.json` にファイルhash・必要スコープ・無効状態・復元方法を残す。

## 承認後の手順

1. 指定学校アカウントの現在のログインと、新規GASの所有者を確認する。
2. 新規プロジェクトだけへ候補を配置し、2スコープ・利用者実行・学校限定を確認する。
3. `run_setupTeacherPreview_` で無効の専用設定を作る。別設定がある場合は置換しない。
4. `run_inspectTeacherCatalog_` で全セット・版・項目数とdigestを確認する。正本の更新・採用は行わない。
5. `run_publishTeacherCatalog_` で圧縮・復元・hash照合後に配信世代を切り替える。
6. 新規Webアプリの配備・読戻しを確認し、`run_enableTeacherPreview_` で指定世代の入口を有効にする。その固定URLをフロント専用設定へ反映し、公開HTTPを確認する。
7. 学校実機で下記を確認する。初回承認は必要に応じてログイン確認リンクの別タブから行う。

配信データは2時間で期限切れになり、その後の取得を拒否する。延長は教員が手動で再配信する。自動同期トリガーは作らない。同じID・版の内容が変わった場合は差替えを拒否するため、検証中の正本修正が必要なら扱いを別途決める。

## 学校実機のチェック

- 指定教員のChrome・Safariで初回承認、問題一覧・本文・雛形・準備コード・大問/小問を確認する。接続開始から取得完了までの総時間はお知らせに表示する。
- 問題切替と再接続で書きかけを保持し、遅れた応答が編集内容や実行を上書き・停止しないことを確認する。
- 通信断、認証切れ、配信期限切れから再接続し、コードが保護されることを確認する。
- 対象外のアカウントへ問題を返さず、クラウド保存・正式提出・採点が有効にならないことを確認する。
- 無限ループ停止、input、エラー、グラフを学校Macで確認する。今回の変更は実行エンジンを変えない。

教員1名の配布検証は、生徒の初回承認、実40名同時利用、GSS自動保存、貸出機復元、正式提出の締切・再送・旧版採点を検証したことにはならない。

## 停止・復元

検証GASで `run_stopTeacherPreview_` を実行し、フロント専用設定を `enabled:false` へ戻す。圧縮データや正本は削除しない。既存授業用デプロイ・共有を変えないため、旧Colab/HTMLの巻戻しは不要。フロント変更は今回のコミット単位で戻せる。

## 検証記録

追加した単体・合成テスト9件、既存を含む回帰225件が通過。配布専用UIはChrome10項目・WebKit9項目が通過し、通常デモの大問・小問回帰も通過。Google本人確認・GSS・Propertiesは合成で、学校OAuth・実GAS・Jamf管理Macの確認とは区別する。WebKitは実Safariとは区別する。

```sh
node --test scripts/pythoneditor-preview-gas/tests/*.test.mjs
node scripts/test-pythoneditor-preview-browser.mjs
```
