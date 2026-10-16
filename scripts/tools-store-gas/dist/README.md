# dist追加パッケージ

このフォルダは既存distへ追加する候補コードです。本番dist、配付ファイル一覧GSS、共有設定には反映していません。HTMLエディタ・旧版Colab・gradeの経路は変更しません。

## 台帳

既存の「個別フォルダ」シートへ `tools保存用GSSID` 列を1列追加し、`userId` と `個別フォルダID` に対応させます。既存列や旧版のIDを変更しません。生徒の入力したGSSIDを正本にしません。

接続時に名簿との完全一致、台帳重複、実フォルダ・GSSの教員所有、GSSの親フォルダ、本人用metadata、schemaを検証します。既存IDの権限拒否・削除・構成破損で新しいGSSへ切り替えません。教員の事前準備は10名までの明示対象に限定します。

## 追加ファイルと入口

- `19_tools_store_distribution.js`
- `25_toolsStoreConnection.html`
- 共通の `05_tools_store_contract.js`（パッケージの `common/`）

新しいルートだけを既存doGetへ追加します。

```js
if (e && e.parameter && e.parameter.type === 'toolsStore') {
  return renderToolsStoreConnectionV1_(e);
}
```

既存doGet本体の置換はしません。配備候補は本番から新しく取得したbaselineへ追加し、現在のHTMLエディタ接続・Colab配付経路が同一であることを差分で検証してから反映します。共有dirtyディレクトリや古い退避版をそのままpushしません。

## ScriptProperties（実値未設定）

| 名前 | 役割 | 未設定時 |
|---|---|---|
| `TOOLS_STORE_DIST_ENABLED` | 生徒の接続入口。文字列 `true` のときだけ有効 | 無効 |
| `TOOLS_STORE_DIST_PROVISIONING_ENABLED` | GSS作成・共有・保護等の構成管理を許可 | 無効 |
| `TOOLS_STORE_DIST_ADMIN_ENABLED` | 明示した教員用の台帳追加・事前準備を許可 | 無効 |
| `TOOLS_STORE_BINDING_KEY` | 保存用GASと共有する32文字以上の署名鍵 | 未設定 |
| `TOOLS_STORE_ALLOWED_ORIGINS` | 許可するHTTPS originのJSON配列 | 空配列 |
| `TOOLS_STORE_TEACHERS` | 実行者・所有者・管理操作を許可する教員メールのJSON配列 | 空配列 |
| `TOOLS_STORE_URL` | 新しい保存用GASの固定 `/exec` URL | 未設定 |

鍵・実メール・実GSSID・本番URLをこのファイルへ書き込みません。署名鍵はブラウザへ渡しません。接続時に返すbindingは保存先・本人・origin・1時間の有効期限を制限した署名情報です。生徒権限の保存用GASがGoogleで確認した本人と再照合します。

## 承認後に行う教員の準備操作案

以下の関数を提供していますが、今回実行していません。新たな共有・保護や本番GAS反映の前に、対象アカウント・件数・戻し方を確認します。

1. 生徒接続 `TOOLS_STORE_DIST_ENABLED=false` のまま、教員リスト等を設定する。
2. 読み取り専用 `previewToolsStorePreparationV1({accounts: [...]})` で明示対象を確認する。台帳・Drive・cache・triggerを変更しない。
3. 台帳と既存ファイル・共有状態のバックアップを保存する。
4. 管理・構成管理フラグだけを有効化し、`initializeToolsStoreLedgerColumnV1()` で不足する専用列を追加する。
5. `prepareToolsStoresV1({accounts: [...], confirmation: 'PREPARE_TOOLS_STORES_V1'})` で10名以下ずつ準備する。
6. 作成したファイルの所有者・本人だけの編集権限・保護・非表示・台帳対応を別経路で確認する。
7. 生徒本人実行の保存用GASで初回承認・保存・再読込・別端末復元を確認した後、生徒接続を有効化する。

保存先は教員所有のGSSを本人の既存個別フォルダへ配置し、本人へ編集権限を付与、編集者による再共有を無効化します。案内 `使い方` を表示、`Python` / `Python履歴` を非表示にします。案内A1:B6とデータ各シートの見出しA1:N1は教員限定保護とし、本文には書き込めます。D列の `フォルダ` を疑似フォルダとして扱い、コード等と同じ行のJSON metadataとの一致を確認します。非表示は秘匿機能ではありません。

## 再試行・構成更新

初回作成と教員の構成整備にだけScriptLockを使い、登録済み接続はロック・共有変更をしません。40名の初回接続集中は事前作成で避けます。作成前にScriptPropertiesへ意図を記録し、作成後に応答が失われても同じファイルを照合して続行します。候補がゼロ・複数・別人・別フォルダなら新規作成せず教員確認へ止めます。

構成整備中はmetadataを `upgrading` にしてwriterを止め、データ本文には触れず、完了後に `active` へ戻します。`retired` は再有効化しません。active版の必須データシートが消えている場合、空のシートを作って正常と見せません。今回の構成整備は案内、固定見出し・保護、末尾への空行/空列追加だけで、既存本文の行列位置や内容を動かしません。ScriptLockは保存用GASのUserLockと共有されません。将来、本文範囲の移動・並べ替え・書き換え・世代変更を行う場合は、先に `upgrading` を設定してflushし、既存保存用GASの実行が終了するまで待つ保守時間（現行実行上限6分以上を目安に実運用条件も確認）を設けてから、その版専用の移行処理を実行します。

## 検証の範囲

Nodeのfake Drive/GSSとmessageブリッジのテストです。Google上の実権限、学校アカウントでの承認、Safari/Chromeの初回認証、40名同時利用は未検証です。初回Google承認は別タブで各GASを開いてからエディタへ戻る手順が必要になる場合があり、実機で確認します。

## 確認journal用の追加構成（2026-10-17）

`TOOLS_STORE_DIST_CONFIRMATION_ENABLED`は未設定で無効。承認後に教員が明示し、対象1名のpreview→prepareで`Python確認`と`Python確認受付`を追加する案。利用者GASからの作成・保護変更は行わない。旧schemaVersion1、Python本文、Python履歴、台帳のGSSIDは保持し、追加時はgenerationを更新して再接続させる。active版で追加シートが片方消失していれば空で作り直さず停止する。

本番の設定・GSS・権限はこのソース変更で操作していない。詳細・分割RPC・停止・容量は[保存用GASの契約](../store/README.md#確認journalの追加契約2026-10-17本番無効)を参照する。
