# 保存用GASの実装記録

### 2026-10-15 18:41:32 | Codex | 生徒権限のGSS下書き保存を配置前パッケージとして作成

- 目的: 教員がdistで構成管理する生徒別GSSへ、Pythonエディタから本人権限で自動保存・復元する。
- 実装: dist署名binding・本人/所有者/編集権限・保護・世代/state検証、UserLock、CAS、2bank/2commit、最近16受理metadata、間隔checkpoint、専用フォルダ列、コード/stdin各20万字の分割と読戻し。
- 既存仕様への影響: 旧Colab・HTML・grade・本番distを変更しない。無効既定、提案manifestだけ、.claspと実値を作成しない。
- 配置前確認: 新規USER_ACCESSING/DOMAINとspreadsheets+userinfo.email、教員所有GSSの個別共有・保護、両GASの共通秘密鍵、学校OAuth承認、ブラウザの初回同意と二重iframeを具体案の承認後に実施する。
- 未確認: 学校アカウント実GAS、40名実負荷・クォータ、Safari/Chromeの実認証、実GSSの保護・読戻し。Node合成の成功と区別する。
- 容量: 最新256問版/履歴2048checkpoint、満杯は消さずに停止。履歴の一覧は最近32件、古い版も保存を維持する。
- `gas notes`や共有場所の更新は行わない。実GASディレクトリの変更ではなく、承認前のリポジトリ内パッケージである。
