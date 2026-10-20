# HTML v3の新規ダウンロード可否確認

2026-10-20、作成者承認による追加。可否確認はdist、原本配信と生成は公開サイト・ブラウザを担当する。既存の90日確認情報・実習ファイル形式・提出経路は変えない。

- 現在のGoogle利用者・名簿と、既存の署名済み本人情報を照合する。
- 配布設定一覧の一意な対象行、公開・学年TASK、課題設定の当年度・学年・item=html・対象・statusとstartAtを取得のたびに確認する。
- Colab等のTASK配付と同様、開始時刻ちょうどから許可する。提出用intakeEnabled・採点モード・標準/最終提出期限を配付へ流用しない。
- 可否以外のDrive原本・採点版の取得、GSS/プロパティ/ログ書込、ロック、キャッシュ、本人情報の再発行は行わない。指定教員だけの配付例外は既存の教員照合を使う。
- 返却は対象・可否・安全な理由のみ。開始前の場合だけ開始日時を返す。メール・氏名・署名・Drive/GSS IDは返さない。
- エディタとGASはorigin/source/bridge/nonceを照合する。本人情報をURLへ入れず、接続後だけPOSTメッセージで渡す。1回の接続でRPCは1回、次の取得で新たに照会する。
- 失敗は新規取得を止め、既存ファイルや同じ取得済み内容の保存再試行は妨げない。公開原本の直URL・旧クライアントからの取得を秘匿する仕組みではない。

`prepare-html-download-availability-gas.mjs`は、読取り済みの公開版・HEADへ個別に適用する。00の専用routeと変更記録2件を変更し、48/25の2ファイルを順序末尾へ追加する。manifest・既存ファイル順序・共有ライブラリは保持する。新しい公開版に未公開の受付準備コードを混入させない。

```sh
node --test scripts/html-download-gas/tests/*.test.mjs tools/htmleditor/tests/*.test.cjs
node --check scripts/html-download-gas/48_html_download_availability.js
git diff --check
```

合成テストはGoogleログイン・実GSSの遅延・生徒Mac/Safari・40名負荷の証明ではない。本番反映・読戻しと復元点はGit除外の運用工程へ記録する。
