# フォルダ再接続の応答停止からの復帰

2026-11-16、HTMLエディタ 0.10.6。基点は `b53fb8cd2e191b685a0560b404559d6bb7b5e574`。

## 報告と確認できた範囲

数日後の利用でフォルダ再接続を求められ、まれに接続変更・解除のボタンも使えなくなるとの報告があった。Chromeの「Cookieと他のサイトデータ」も削除すると改善したとの回答を受けた。実際の障害時の端末状態・API応答は取得していないため、その障害の原因は断定しない。

公開版相当の基点で、保存済みのフォルダハンドルの `queryPermission()` が返らない状況をChromeで再現すると、起動時の排他処理が終了せず、接続変更・解除も無期限に無効となった。許可確認・フォルダ列挙・ファイル読取り・CSS読取りに待機期限がなかった。

Chromeでは、フォルダの記憶と権限の継続は別の状態である。ブラウザによる再確認自体は起こり得る。継続許可の選択肢が出る環境では、それを選ぶと再確認を減らせる。エディタから許可を強制しない。

- [Chromeの継続許可に関する公式説明](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- [File System Access APIの公式説明](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

## 修正

- 接続確認・接続後の走査・素材の再走査の読取処理に、許可確認から数えて15秒の期限を設ける。時間切れは成功や接続解除として扱わず、従来の排他処理を終了して設定から再選択・解除できるようにする。
- OSのフォルダ選択画面を待つ時間は含めない。選択後に読取期限を開始する。書込み・読戻しによる保存確定の処理には期限を追加しない。
- 取消・時間切れ・別の接続・明示的な解除・ファイル取込後の古い読取結果は採用しない。新規に仮生成したBlob URLだけを破棄し、現在のファイル一覧・接続・素材は成功まで置き換えない。
- 自動接続の時間切れでは、設定から変更・解除できる案内を出す。記憶済みハンドルの自動削除、サイトデータ全消去、本人情報・復旧用の控えの削除はしない。

## 検証

- Node回帰329件成功。新規6件は、許可確認・明示的な許可要求・列挙・getFile・CSS読取りの応答停止、途中Blobの破棄、遅延応答、接続変更・解除・取込との競合、OS選択待ち、走査失敗時の編集中パス保持を検査する。
- Chromeの実エンジンでOPFSの合成フォルダとIndexedDBを使い、APIを意図的に停止して確認した。標準15秒の許可確認停止は約15.1秒で操作可能に戻った。列挙・getFile・許可要求の検証だけは300msへ短縮した同じ処理を使う。
- 時間切れ後の再接続・接続変更・明示的な解除で、編集内容・Undo・未保存表示・復旧用の控え・無関係な保存データを保持し、旧応答で接続先と記憶先が変わらないことを確認した。起動時には許可要求を自動表示しない。
- WebKitの合成作品で、素材の追加・差替え・削除、CSS背景、別タブとFinder案内の既存検査が成功した。SRIはメイン48参照・作品プレビュー4参照が一致し、検索索引75ページと差分形式の検査も成功した。
- ブラウザ試験は実生徒データ、Googleアカウント、GAS、実際の生徒フォルダへアクセスしない。数日間の権限失効そのもの、生徒端末、Safariアプリ、報告された障害の同一条件での再現は未確認。

実行コマンド:

```sh
node --test tools/htmleditor/tests/*.test.cjs
node tools/htmleditor/tests/folder-recovery.browser.mjs
HTML_PROJECT_PREVIEW_ENGINE=webkit node tools/htmleditor/tests/project-preview.browser.mjs
node scripts/generate-search-index.mjs --check
```

Playwrightを利用できる環境で実行する。フォルダ復帰試験はMacのGoogle Chromeを使用する。合成試験の記録は `/private/tmp/html-folder-recovery-20261116/`、修正前の再現記録は `/private/tmp/html-folder-repro-before.json`、WebKitは `/private/tmp/html-folder-recovery-webkit-preview/` に保存した。一時証拠は公開物へ含めない。

## 監査・公開・復元

作業ブランチは `codex/html-folder-recovery-20261116`、作業場所は `/private/tmp/joho-html-folder-recovery-20261116`。コード版は `e3cc70c4639fd0c703a46abbffe3f320e30ecf33`。

2026-11-16、指定のtools監査担当が、基点からこのコード版までの9ファイルを読み取り監査した。公開前に修正が必要な指摘はなかった。監査側でもNode329件、SRI52参照、Chrome合成5ケース、標準期限で約15.14秒後の復帰を確認した。遅延応答・既存データの保持と、書込み/保存確定処理が不変であることも確認した。監査の一時証拠は `/private/tmp/html-folder-audit-20261116-jh8vgakq/audit-result.json`。実機・実障害の未確認範囲は上記と同じ。

コード版を `origin/main` へpushした。2026-11-16 09:39 JST、公開サイトの `index.html`・`filesystem.js`・`editor.js`・`project-preview.html` の4ファイルがHTTP 200でコード版とbytes一致した。JSは実際の参照URLの `?v=html-editor-folder-recovery-20261116-r1` で確認した。初回は旧版だったため再送せず待機後に読戻した。証拠は `/private/tmp/html-folder-recovery-20261116/public-before.json` と同 `public-after.json`。公開bytesの一致は、生徒端末での受入確認や数日後の再利用確認とは区別する。

不具合時はこの改修のコードコミットだけを履歴を残してrevertする。エディタと作品プレビューの参照URL・SRIも同じコミットで戻す。他担当の公開変更、元checkoutの未コミット差分、最終課題の未公開候補 `602c7f0b866c87b79016f4756dee0dee6a884104` は戻さない。利用者のフォルダ・本人情報・復旧データ・GAS設定の変更は復元操作へ含めない。
