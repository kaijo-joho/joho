# 教員側のHTML試験GSS準備

承認済み2名だけ。生徒の通常操作から呼ばず、既存distの**編集用HEADだけ**へ配置する。既存の公開版・doGet・manifest・Commonは変更しない。秘密鍵や実アカウント・IDを公開Gitへ置かない。

1. 対象distの最新全ソース・順序・公開版を私有フォルダへ退避する。古いdirty作業コピーを使わない。
2. 対象2名の既存「個別フォルダ」行と所有教員を読取り確認する。私有設定へowner・2 accounts・対応フォルダID・台帳/シートID・受付GAS IDを固定する。
3. `scripts/prepare-html-intake-provision.mjs`に最新控え・空の出力先・私有設定を渡す。93は構成検証、94は私有設定、95は準備処理。元ファイル順序を保持して末尾へ追加する。
4. 差分・構文・テスト・直前HEAD一致を確認してpushする。公開deploymentを更新しない。
5. 所有教員が`run_inspectHtmlBackupTrial`を実行する。これは読取だけ。`run_prepareNextHtmlBackupTrial`は1回1冊まで作成・構成・本人共有し、次の実行で2冊目を準備する。完了後の同じ実行は検証だけ。
6. 準備結果・共有/所有/再共有禁止・保護/非表示/世代/容量を読み戻す。`run_exportHtmlBackupTrialRegistry`は2件を検証して私有の対応情報を返す。本文・点数・鍵は出力しない。
7. `scripts/prepare-html-intake-stores.mjs`に受付GASの最新控えとその対応情報を渡し、元の無効入口・2スコープを保った登録候補を作る。受付GASの所有教員が`run_configureHtmlIntakeTrialStores`、続いて`run_verifyHtmlIntakeTrialStores`を実行する。GSSを再作成・再共有しない。

保存先は今回は教員のマイドライブ直下。既存フォルダから他の共有を継承させず、本人のwriterだけを追加する。共通の本番台帳は書き換えず、試験用の専用対応情報に保存する。既存Python用GSSへHTML用シートを無断追加しない。

作成前にScriptPropertiesへ意図を保存する。作成応答を失ってIDが分からない状態は`trial_create_uncertain`で停止し、もう1冊作らない。タイトル中の乱数・所有者・保存先と意図を授業担当者が照合してから手動で再開を判断する。作成ID保存後の構成/共有の中断は同じIDで再開する。準備済みの保護や本文シートが壊れた場合、空シート作成で正常に見せない。

コードの切戻しは、後続変更がないことを読取り照合してから退避元HEADへ戻す。公開版はもともと変更しない。試験GSS・専用対応情報は自動削除せず、必要ならリンク停止後も保存/受領記録を保全する。`GAS_SKIP_NOTES=1`で無関係な全プロジェクト記録を外部送信せず、今回分のAI_NOTESを私有工程に残す。
