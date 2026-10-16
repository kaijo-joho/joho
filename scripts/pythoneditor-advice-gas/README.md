# Pythonエディタから既存エラー相談室を使う追加パッケージ

このディレクトリには一般化した追加コードだけを置く。学校固有の設定、既存pyerr原本、APIキー、プロンプトや相談の実データを公開リポジトリへ複製しない。

`prepare-pythoneditor-advice-gas.mjs`は確認済みのpyerr原本を読み取り、`/private/tmp/`の新しい私有コピーだけへ追加する。Google、clasp、AI、GSS、プロパティや権限には作用しない。出力先を再利用せず、原本と既存デプロイを戻し先として保持する。

```sh
node scripts/prepare-pythoneditor-advice-gas.mjs \
  --baseline /path/to/verified-private-pyerr \
  --settings /private/tmp/private-advice-settings.json \
  --out /private/tmp/new-private-pyerr-candidate
node scripts/pythoneditor-advice-gas/test.mjs
node scripts/pythoneditor-advice-gas/test.mjs --baseline /path/to/verified-private-pyerr
```

私有設定JSONの形は次のとおり。ここに示す値は架空の例であり、実アカウントや本番originを設定したファイルは公開しない。

```json
{
  "ownerAccount": "teacher@school.example.invalid",
  "schoolDomain": "school.example.invalid",
  "allowedUsers": ["teacher@school.example.invalid", "demo@school.example.invalid"],
  "editorOrigins": ["https://editor.example.invalid"]
}
```

## 既存との互換性

- `getGeminiAdvice(code,errorMessage)`は従来どおりHTMLを返す。20分岐の処理をprivateのデータcoreへ抽出し、エディタ向けRPCだけJSONで受け取る。
- 空欄の相談文では従来の入力hashを維持する。相談文がある場合は別hashを使い、AIプロンプト・キャッシュ・共有ログの既存`rawJson`へ含める。同じコードでも相談文が違えば回答を混同しない。
- 既存ローカル検出、共有ログ検索、回答再利用、API上限・失敗時の利用回数返却を使う。共有相談文は既存`rawJson`から文字列だけを抽出して最大3000文字を返す。他のrawJson項目は返さない。GSSの列構成や既存HTMLの返り値、既存Colab・gradeは変更しない。
- 既存テストには関数本体の`toString()`を検査する項目がある。専用テストrunnerは、その参照先だけを抽出先へ読み替えて原本テストを実行する。原本のテストファイルは変更しない。HTML wrapperは別の動作テストで検証する。

## 接続と応答

`kind=pythoneditor-advice&origin=<許可origin>&channel=<64hex>`で専用iframeを開く。protocolは`python-editor-advice-v1`。iframeは`window.top`への送信と受信についてorigin/source/channel/idを検査し、session以外ではactorKeyも検査する。サーバーは毎RPCで有効設定・Sessionの学校本人・明示したallowlist・origin・actorKeyを再照合する。匿名の一時キーを学校本人として認めない。

actionsは`session`、`consult`、`getConsultation`、`errorTypes`、`searchHistory`のみ。相談・検索結果はテキストJSONで返す。氏名、メール、修正済みコード、HTML、内部ログ、APIエラー詳細を返さない。エラー相談として本人が送信確認したコード・エラー・相談文だけが対象で、採点や自動修正には使わない。

`consult`は`setId/questionId/version/runId/code/setupCode/errorText/questionText`を受ける。サーバーでも`codeHash=SHA256(JSON.stringify([code,setupCode]))`と`snapshotHash=SHA256(JSON.stringify([setId,questionId,version,runId,code,setupCode,errorText]))`を検査する。質問文を含む全payloadのfingerprintで同一requestIdの本文変更を拒否する。

## 再送と容量

`UserProperties`にはactor+requestId別の予約・fingerprint・再実行禁止記録だけを永続化する。AI中はScriptLockを保持せず、ロックは短い受付/完了記録の処理だけで使う。回答と元の文脈はScriptCacheへ6時間を上限として一時保存する。キャッシュは早期消失する可能性がある。消失時は`result_unavailable`で「過去の相談」を案内し、同じrequestIdを再AIしない。

未完了予約は20分後に期限切れの短い記録へ縮小し、同じ要求を再実行しない。未知の照会は`unknown_request`で返し、照会が新規API呼び出しになることはない。予約は1値2000bytes以内、他機能分を含むUserPropertiesが450KBを超える見込みなら新規受付を拒否する。完了記録を自動削除しないため無限には増やせない。所有者実行ではUserPropertiesの枠が共通になる可能性を見込んだ設計であり、40件同時予約・1500件完了をローカル合成試験する。完了記録は1件約197bytesなので、共有枠なら約2000件台で長期容量上限へ達する。利用者実行なら各利用者の枠になるが、既存の実行者・権限をそのために変更しない。本番の保存容量・既存のプロパティ使用量・長期の件数と永続台帳への移行は別途確認が必要。

通常の短いヒントはそのまま返す。異常に長い回答は原因12000bytes・助言24000bytesを上限にし、途中で省略したことを明記する。共有履歴にも同じ上限と省略表示を使う。制御文字を除去し、JSON化後も1キャッシュ値の100KB上限を超えない範囲にする。

## 本番前に提示・確認する具体的な設定

1. 接続先は既存pyerrプロジェクトの追加候補とし、既存の実行ユーザー・DOMAIN設定・OAuthスコープをコピーで保持する。実機でSessionの学校本人が取得できない場合は拒否し、別の認証経路で回避しない。
2. 許可する教員・検証用アカウント、学校ドメイン、公開エディタoriginを私有設定で明示する。新しいユーザー・originを推測で加えない。
3. 新規プロパティは`PYTHON_EDITOR_ADVICE_CONFIG`（初期`enabled:false`）と`PYTHON_EDITOR_ADVICE_ACTOR_SALT`。所有教員が`run_setupPythonEditorAdvice`で初期化する。既存設定の置換や既存APIキー変更はしない。
4. 生成した候補の差分、既存画面・共有ログ・上限の回帰結果、既存デプロイへ戻せることを確認後に本番配置を判断する。生成は配置・OAuth・権限許可を意味しない。
5. 接続を有効にする前に、AIへの送信対象と費用・対象アカウントの範囲を確認する。有効化は所有教員の`run_enablePythonEditorAdvice`とフロント専用設定の両方が必要。停止は`run_stopPythonEditorAdvice`またはフロント`enabled:false`。既存の通常相談画面は停止しない。
6. 実機では教員/生徒の本人照合、拒否、相談文の共有、応答遅延中の問題切替・編集、通信断後の照会、キャッシュ消失、実40人負荷と上限を確認する。ローカル合成試験を実機検証済みとは報告しない。
