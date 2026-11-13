# HTMLエディタ：共通標準アイコンの適用

2026-11-13。版0.10.5。公開中のHTMLエディタからアイコンの変更だけを分離した。

## 作業と依存の固定

- worktree: `/private/tmp/joho-html-editor-icons-20261113`
- branch: `codex/html-editor-standard-icons-20261113`
- 最初の基点: `52bf6d87c1781b7a4e5c4c47562682e6c5a1c255`
- 共通依存を取り込んだ基点: `a7f633ff0018c49ca1a2b412ac4344cb906462c3`
- 公開前に他担当の変更を照合した基点: `bd6def47535f1dfd99e1eae0f4ff3c921165884b`。HTML側への並行差分はなかった。
- 共通仕様: ローカル正本 `tools/docs/README.md` の2.1・2.7・2.12・6.3。図柄の正本 `tools/docs/assets/ui-icons.svg` のSHA-256は `e3df73c7939a649fc64e9436b3308fce9e10cdd5b9d1b636d272cada2aef2088`。

共通依存はtools全般担当が単独で公開した版。今回のHTML担当は `tools/shared/` を編集・再コミットしない。

| 共通ファイル | SHA-256 |
| --- | --- |
| `tools/shared/ui-icons.js` | `dd63c189626eab912b47a0d2c2ac029e949f63e24eaeafc85b9019cfb4f4ef5c` |
| `tools/shared/ui-icons.svg` | `2ad761942542bd1439f6118126d1223e04b07ac86a6d09e6a74e8ab656053a44` |

JSのSRIは `sha384-ofiHKJQQjYowpt1TYAgrtCF6fublRt3TKT9qz1+cCulXV9fF9YWrdy0jn10DAGWZ`。`../shared/ui-icons.js?v=20261113` をエディタ初期化より前に読み込む。静的な図柄は `../shared/ui-icons.svg?v=20261113#<ID>` を参照し、動的な図柄は `window.JohoIcons.create/apply` を使う。標準のpathをHTML担当側へ複製しない。

最終課題候補の `codex/html-final-project-local-20261113` は `602c7f0b866c87b79016f4756dee0dee6a884104` のまま保持した。候補のファイル・モード・接続設定をこのブランチへ取り込んでいない。将来その候補を反映する際は、今回のアイコン版との整合を別途確認する。

## 標準IDと操作の対応

| 標準ID | 対象 |
| --- | --- |
| `export` | `taskDownloadBtn` の新規実習ファイルの取得、`downloadBtn` の編集中ファイルのコピー保存 |
| `open` | `openFilesBtn`、`settingsFolderBtn`、`openOtherFileBtn`。保存済みのファイル・フォルダを開く操作 |
| `save` | `saveBtn`、`folderSaveBtn`。Macのファイルへ保存する操作 |
| `view` | `viewMenu > summary`。解説・プレビューの表示操作を開くメニュー |
| `settings` | `displayMenuWrap > summary`。採用元と同じ歯車 |
| `help` | `helpBtn`。既存のヘルプを開く |
| `refresh` | `runBtn`。プレビューのみ更新する |
| `theme-auto` | HTMLエディタ内の表示設定の「自動」 |
| `theme-light` | 同「ライト」 |
| `theme-dark` | 同「ダーク」。肉厚の三日月 |
| `close` | 既存の確認モーダルの `data-choice="close"` ボタン |

共通ヘルプの閉じるボタンは、既に標準と同じ座標・線幅であることを共通担当が確認しており、既存の `JohoToolHelp` を維持する。最小化を閉じる・停止に変えない。

提出のクリップボード＋上矢印、フォルダの再接続・接続解除、復旧の履歴時計、手順のチェックリスト、別タブを開く矢印、境界の開閉は、46種の別操作へ無理に割り当てず既存の図柄を維持した。更新は再接続や復旧と区別し、表示メニューは全画面・全体に合わせる操作と区別した。

## 変更したファイルと維持した契約

実装は `index.html`、`editor.css`、`editor.js`。検証は `tests/image-downloads.test.cjs` と `tests/standard-icons.browser.mjs`。開発記録はこの文書とREADME。

SVGは24×24のviewBox、装飾の `aria-hidden="true"` と `focusable="false"`、currentColor・fill none・線幅1.7・round。ボタン内は22px、設定メニュー内は既存20px、手順内の説明は1emとする。既存の操作範囲・日本語の名前・ツールチップ・有効無効・選択状態・フォーカスを維持する。

`js/display_settings_ui.js`、共通CSS、共有ヘルプ、保存形式・履歴・ショートカット・プレビューの安全制限・配付/提出/採点の契約・GAS/GSS・OAuth・権限・公開設定・生徒データは変更していない。新しい46操作を増設していない。アイコン補助JSの取得に失敗した場合も、エディタの起動・既存の表示設定・閉じる操作を続けられる。

## 検証

- 既存Node/VM回帰323件が成功。エディタ48参照・作品プレビュー4参照のSRI照合を含む。
- 検索索引は既存75ページ、517257 bytesとの一致を確認。本文・索引内容は変更していない。
- ChromeとPlaywright WebKitで標準SVGの実描画、ライト・ダーク・自動のOS追従、selected・disabled・focus、1440pxと390px/文字150%、ツールチップ、ヘルプとモーダルの閉じる・フォーカス復帰を確認。
- 両エンジンで「開く」がOSのファイル選択を開き、選択した合成HTMLを読み込むこと、コピーのダウンロードが編集中の内容と一致することを確認。
- ChromeのOPFSの合成フォルダで、保存ボタンと⌘Sによる上書き保存、プレビュー更新ではディスク・編集内容・Undoを変更しないことを確認。WebKitでフォルダへの直接上書き保存を確認したという意味ではない。
- 共通アイコンJSを遮断する試験でも、起動とテーマ選択を確認した。
- ブラウザ試験のpageerrorとGAS要求は0件。既存教材のフォント・analytics・CDN要求は遮断して記録した。実生徒・実GASへの操作試験ではない。

```sh
node --test tools/htmleditor/tests/*.test.cjs
HTML_ICONS_ENGINE=chromium node tools/htmleditor/tests/standard-icons.browser.mjs
HTML_ICONS_ENGINE=webkit node tools/htmleditor/tests/standard-icons.browser.mjs
node scripts/generate-search-index.mjs --check
```

Playwrightを利用できるNode環境が必要。共通候補の準備中は `HTML_ICONS_SHARED_ROOT` でその `tools/shared` を指定できる。公開依存を取り込んだ最終試験では指定せず、このworktree内の依存を使った。

証跡は `/private/tmp/html-standard-icons-20261113/{chromium,webkit}/report.json` と同フォルダの画面PNG、`/private/tmp/html-icons-unit.log`。これらの一時的な合成データを公開ファイルへ同梱していない。

実機Safari・VoiceOver・生徒端末・実アカウントの配付/提出は未確認。画面の独立監査は担当側の公開報告後にtools監査担当が実施する。

## 公開と戻し方

公開URLは `https://joho.kaijo.ed.jp/tools/htmleditor/index.html`。公開コミット・HTTP読戻しは反映後に下記へ記録する。共通依存の公開確認と、HTML側の公開確認は分ける。

戻す場合は、今回のHTML側のコミットだけを履歴を保つrevertで戻す。共有の `a7f633f` や他担当のコミットをrevert・resetしない。復元前のHTML側は上記の依存基点の版。ローカルの最終課題候補や既存未コミット差分も保持する。
