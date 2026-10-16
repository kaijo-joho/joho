# エラー相談室の接続

2026-10-17。Pythonエディタの画面と既存pyerrへ追加するGASソースを実装した。`advice-config.mjs`は`enabled:false`。GAS原本・公開デプロイ・Script Properties・OAuth・権限設定・GSSは変更していない。AIへの実送信も未実施。

## 画面の使い方

コード・出力欄の下の「エラー相談室」、またはエラー行のローカルヒントからパネルを開く。コード・準備コード・エラーは相談用のコピーとして表示し、必要な範囲に編集できる。「相談文」に、期待した動作と実際の違いを書く。エラーがないコードや、まだ実行していないコードも対象にできる。

接続が有効な環境では、学校アカウントに接続してから、コード・エラー・相談文・回答が他の生徒にも相談例として共有されることを確認して送信する。パネルを開くだけでは学校への接続やAI問い合わせは開始しない。接続が無効な公開画面では送信できない。

回答の原因とヒントを見ながら、生徒がコードを修正する。回答や共有履歴は文字列として表示する。AIが返したコードを自動でエディタへ挿入する機能はない。コードの修正や問題切り替えの後も、回答は元の問題・版・実行に結び付く。現在と異なる場合は注意を表示する。

「この端末で送信した相談」には本人別にコピーと回答・未確認番号を保持する。完了・取得期限終了の控えは直近12件を残す。未確認要求は件数整理で削除せず、12件に達したら新規送信を止める。相談本文と完了回答は送信番号別のキーへ追記し、別タブの同時送信や遅い未確認状態の書込みが他の控え・完了回答を消さない。ブラウザ保存に失敗した場合は送信を開始しない。クラウド下書き・正式提出の保存ファイルとは独立し、貸出機での相談履歴持ち出しは対象外。共有済みの回答は「過去の相談」から探せる。

## 通信と回答の照合

GAS接続URLは固定設定のみを受け入れる。`kind=pythoneditor-advice`で起動し、`python-editor-advice-v1`、ランダムchannel、親画面origin、応答source、要求IDを照合する。GASは学校Sessionと許可ユーザーを毎RPCで確認する。actorKeyはGAS内のsaltと本人メールから作り、他のアカウントの送信番号を権限にしない。

| action | 内容 |
| --- | --- |
| session | 本人を表すactorKeyと入力上限を返す |
| consult | 固定した相談を受付し、既存pyerrの判定・再利用・上限・AI処理を共用する |
| getConsultation | 同じ本人のrequestIdから結果を照会する。AIを呼ばない |
| errorTypes | 共有相談の分類と件数 |
| searchHistory | 分類別に最大10件。コード・エラー・相談文・原因・助言の文字列のみ |

相談はrequestId、setId、questionId、version、runId、code、setupCode、errorText、questionText、codeHash、snapshotHashを持つ。codeHashは`SHA256(JSON.stringify([code,setupCode]))`。snapshotHashは`SHA256(JSON.stringify([setId,questionId,version,runId,code,setupCode,errorText]))`。別の相談文を既存回答へ誤って流用しないよう、GAS内のキャッシュ・ログ検索ハッシュには相談文も含める。

受付の短いScriptLockはAI実行前に解放する。同じ本人・requestIdの内容変更を拒否し、処理済み要求を再AIしない。通信が切れたらブラウザ控えを保持し、「結果を照会」で確認する。認証拒否は別経路で迂回しない。

受付・完了の小さい再実行禁止記録はUserPropertiesに保存する。回答本文と元の文脈はScriptCacheに最大6時間置くが、早期に消える場合もある。処理済み本文を取得できない場合は`result_unavailable`、20分を越えた未完了受付は`expired`とし、共有履歴を案内する。相談は正式提出と異なり、サーバーの送信番号から回答本文を永続復元する保証はない。元の共有ログは既存pyerrに残る。

## 本番へ反映する前の具体案

対象は`/Users/takashi/Documents/GAS/pyerr`。既存の`getGeminiAdvice(code,errorMessage)`はHTML互換wrapperとして保持し、内部のデータ処理を末尾`_`の非公開関数へ抽出する。`doGet`へkind分岐を追加し、相談文を既存rawJsonへ保存する。GSS列・既存ログ形式・旧相談画面・旧Colab・grade・HTMLエディタ・学校教材リンクを変更しない。追加/変更ファイルの詳細は[scripts側手順](../../scripts/pythoneditor-advice-gas/README.md)を参照。

本番実施前には、以下の対象と範囲を確認する。

1. pyerrの所有教員、現公開デプロイと復元先の版、変更差分。まず教員だけの検証用デプロイでJSON経路と旧HTML画面を確認する。
2. 許可origin、学校ドメイン、明示する対象ユーザー。既存の問題配布用allowlistを無条件で転用しない。
3. 原本manifestで確認した`USER_DEPLOYING / DOMAIN`を維持する案。利用者は毎回ActiveUserで確認する。新規OAuthプロジェクトやscope、共有先をこの実装で追加しない。学校環境でActiveUserを取得できない場合は拒否し、回避経路を作らない。
4. Script Propertiesへ`PYTHON_EDITOR_ADVICE_CONFIG`とランダムsaltを追加する。初期設定は無効。これらを配置候補の私有設定スクリプトで準備し、既存キーやAPIキーを上書きしない。
5. AIの費用・既存利用上限・共有範囲を確認し、許可した合成コードの1件を教員が実送信して確認する。その後、フロント固定URLと両側のenabledを有効化する。

UserPropertiesの保存容量は実行者に依存する。現在の所有者実行では生徒全体で同じ保存枠を使う可能性がある。合成試験では40件の未完了受付が21,200 bytes、1500件の完了記録が295,500 bytes。短い記録だけでも数千件で上限になるため、授業前に既存使用量と想定相談数を確認する。容量不足では新規受付を止め、過去の記録を勝手に消さない。長期運用の退避先・整理方針や実行者変更は次の運用判断とする。回答の一時保存が消えても二重課金を起こさないことを優先する。

停止時はフロントとGAS設定を無効化し、必要に応じて既存の公開デプロイを変更前の版へ戻す。APIキー・既存共有ログ・受付記録を削除しない。ソースは読取ハッシュを記録した原本と未変更ファイルを保持した私有候補で比較できる。

## 検証と未確認事項

`node --test tools/pythoneditor/tests/*.test.mjs`で相談hash・版/実行照合・本人別保存・異なるorigin/source・タイムアウトと既存保存/提出契約を検査する。`node scripts/pythoneditor-advice-gas/test.mjs --baseline /Users/takashi/Documents/GAS/pyerr`で既存core・HTML互換・共有履歴・同時予約・容量・認証と再実行禁止を合成検証する。

`node scripts/test-pythoneditor-advice-browser.mjs`は実ブラウザとPyodideを使い、GAS・本人・AI回答を合成する。実学校アカウント、実AI、40人同時のGAS遅延/上限、学校Safari/Chrome・貸出機での実機操作は別途確認する。WebKitによる検証はSafari実機の確認を代行しない。
