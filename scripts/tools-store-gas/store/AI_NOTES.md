# 保存用GASの実装記録

### 2026-10-15 | Codex | 圧縮採点基準・本人権限採点・教員の同期と結果回収を追加（本番保留）

- 新規30/31/32/33と既存Python判定の固定コピーを同じ候補GASへ配置。Common依存を追加せず、学校データは教員の同期時だけ取得する。
- gzip/Base64・分割・hash読戻し・pointer/CAS・active/previous世代整理・旧採用版保持・TTL失効停止。名簿は全件検証し、登録保存先の本人権限だけ格納する。
- 本人GSSへ用途別HMAC署名の受付/採点、教員が中央保存・全履歴の読戻し後に完了ack。本人GSS本文の編集可能性を正式評価の根拠に使わない。
- RPC冒頭の到着時刻、UserLock前の署名到着証明、同一要求再送、1問の締切内最高点、旧版/旧期限での採点を保持。
- 新しいフロントのstudentGrading、採点・同期・回収・トリガー・採点表追加の設定は全て無効既定。提案scopeへscript.scriptappを追加したが実OAuth/設定変更は行っていない。
- 既存grade/Colab/HTML/本番dist・GSS・権限・実トリガーを変更しない。候補コピー生成とfake/ローカルブラウザ検証だけ。詳細はtools/pythoneditor/STUDENT-GRADING.mdと同VERIFICATION資料。

### 2026-10-15 18:41:32 | Codex | 生徒権限のGSS下書き保存を配置前パッケージとして作成

- 目的: 教員がdistで構成管理する生徒別GSSへ、Pythonエディタから本人権限で自動保存・復元する。
- 実装: dist署名binding・本人/所有者/編集権限・保護・世代/state検証、UserLock、CAS、2bank/2commit、最近16受理metadata、間隔checkpoint、専用フォルダ列、コード/stdin各20万字の分割と読戻し。
- 既存仕様への影響: 旧Colab・HTML・grade・本番distを変更しない。無効既定、提案manifestだけ、.claspと実値を作成しない。
- 配置前確認: 新規USER_ACCESSING/DOMAINとspreadsheets+userinfo.email、教員所有GSSの個別共有・保護、両GASの共通秘密鍵、学校OAuth承認、ブラウザの初回同意と二重iframeを具体案の承認後に実施する。
- 未確認: 学校アカウント実GAS、40名実負荷・クォータ、Safari/Chromeの実認証、実GSSの保護・読戻し。Node合成の成功と区別する。
- 容量: 最新256問版/履歴2048checkpoint、満杯は消さずに停止。履歴の一覧は最近32件、古い版も保存を維持する。
- `gas notes`や共有場所の更新は行わない。実GASディレクトリの変更ではなく、承認前のリポジトリ内パッケージである。
