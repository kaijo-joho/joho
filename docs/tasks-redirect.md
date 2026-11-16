# 課題提出・回答状況の固定入口

生徒への案内URLは `https://joho.kaijo.ed.jp/tasks`。

- `tasks.html`を主入口として置き、`tasks/index.html`も同じ共有処理を使う。拡張子なしの`/tasks`、末尾スラッシュ付きの`/tasks/`、`/tasks.html`のいずれでもGASへ直接移動できる構成にする。
- 中継先の正本は、既存の公開生成物`data/links.json`の`collections.urls.taskstatus`。HTMLやJSへGASのデプロイURLを複製せず、このデータ自体も直接編集しない。
- `js/tasks_redirect.js`は、スキーマ・日時・対象項目と、学校ドメイン付きまたは通常のApps Script本番`exec` URLを確認してから`location.replace()`する。GASの認証・課題・掲載設定や権限は変更しない。
- 入口に付けられたクエリ・ハッシュは中継先へ追加しない。`?redirect=0`だけは、自動移動せずリンクを確認するローカル診断用として扱う。
- HTTPエラー、不正データ、未登録、不正なURL、10秒の取得期限では移動せず、再試行の案内を表示する。旧`js/links.js`や別のデプロイ先へfallbackしない。
- 表示だけの設定は既存`js/display_settings.js`を利用する。独立したテーマ設定・保存処理・アプリアイコンは追加しない。共通UIの正本は[アプリ共通仕様](/Users/takashi/Documents/app-common/README.md)を参照する。
- 純粋な中継ページのため、教材のナビゲーション・検索索引へ登録しない。`pages.js`や共有GSSは変更しない。

## 検証

```sh
node --check js/tasks_redirect.js
node scripts/test-tasks-redirect.mjs
JOHO_TEST_URL=http://127.0.0.1:8898/ node scripts/test-tasks-redirect-browser.mjs
```

ブラウザ試験はGASへの移動をローカルの応答へ差し替え、実アカウントでの認証や提出は実行しない。公開後の短いURLのHTTP応答・公開物の読戻しと、GASへログインして表示する実機確認は別に扱う。
