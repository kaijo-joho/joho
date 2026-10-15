# 教員用・問題配布検証GAS

新規検証プロジェクトへ配置する候補。既存dist/gradeへ配置しない。教員1名の本人確認後、圧縮パッケージから問題一覧・本文・雛形だけを返す。

準備・権限案・実機チェック・停止手順は [TEACHER-PREVIEW.md](../../tools/pythoneditor/TEACHER-PREVIEW.md) を参照。`prepare-pythoneditor-preview-gas.mjs` は私有領域へ候補を作るだけで、Googleへ配置しない。

新規WebアプリとOAuthが必要なため、対象と範囲を確認してから有効化する。教員1名のallowlist、sessionだけのRPCを使用し、正本更新・問題採用・正式得点・生徒用GSS・Drive共有・トリガーは操作しない。
