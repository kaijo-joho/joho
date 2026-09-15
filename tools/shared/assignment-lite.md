# editor-lite v1：エディタ実装・fm2画面への引き継ぎ

2026-09-15。**実装を置いた段階で、本番は無効**です。fm2側の画面ブリッジ・教員UI・実GAS検証を済ませてから有効にします。旧RSA試作 `assignment-security.js` / `assignment-launch.js` の形式・意味は変更しません。

履歴は、授業での**不正検知の参考情報**です。細かな復元・再生機能や本人制作の証明を目的にしません。物理Macの識別、キー入力、カーソル軌跡、他サイトの閲覧履歴は収集しません。同じoriginの改造クライアント・開発者ツールからの鍵利用、履歴捏造を完全に防げるとは説明しません。

**画面・ヘルプ・エラーでは「提出フォーム」と表記し、内部名fm2を表示しません。** 本資料のfm2は担当者向けの実装名です。通信・保存形式・関数名の識別子は変更しません。

## 部品と組み込み

| ファイル | 責務 |
|---|---|
| `assignment-lite.js` / `JohoAssignmentLite` | canonical、HMAC、AES、作品・履歴・回路スキーマ検証 |
| `assignment-lite-store.js` / `JohoAssignmentLiteStore.Vault` | 非export鍵、暗号化下書き、別タブ更新検査 |
| `assignment-lite-bridge.js` / `JohoAssignmentLiteBridge.create` | 固定列挙の双方向postMessage、origin・Window・nonce・要求対応 |
| `assignment-lite-client.js` / `JohoAssignmentLiteClient.Client` | 開始・再開・確定履歴・途中保存・提出準備と署名検査 |
| `tools/logic/assignment.js` | 通常保存の隔離、回路操作の記録、課題の保存・読込・提出UI |
| `tools/logic/assignment-config.js` | 有効化設定。現状は `enabled:false`、`trustedOrigins:[]` |

上から順に読み込みます。読み込むだけでは鍵作成・DB作成・通信をしません。通常起動の `.logic.json`、名前付き保存、下書き、アーカイブ、画像出力、CP21の演習は維持します。

暗号と通信の部品は他アプリでも利用できます。ただし**今回のfm2 v1の作品型はlogicのみ**です。他アプリの担当者は、その文書型の厳密な検証と保存アダプター、およびfm2側の許可・検証を追加してから組み込みます。既存エディタを一括変更していません。

## 起動：fm2画面担当が実装する部分

1. 学校アカウント・課題・対象ファイル項目をfm2側で確認する。
2. ユーザー操作でエディタを新しいタブとして開き、そのWindow参照を保持する。新しい接続ごとに24byteの乱数nonceを生成する。
3. 固定されたHTTPS origin・そのWindow・nonceでfm2側のbridgeを作る。`role:'fm2'` を指定する。
4. エディタの開始確認後、bridgeで下記RPCを呼び出す。静的ページからGASへ直接fetchしない。

エディタの対応するURL fragmentは以下のキーです。値は必ず `URLSearchParams` でエンコードします。

```js
const fragment = new URLSearchParams({
  assignment: 'editor-lite-v1', bookId, pid, itemId,
  nonce, origin: verifiedBridgeOrigin
});
// window.open(editorUrl + '#' + fragment) の戻り値をbridgeのpeerにする。
```

fragmentに氏名・メール・鍵素材・署名は入れません。routeはサーバー照合の入力で、アクセス許可ではありません。`origin` は**事前に配付コードへ固定した許可リストと完全一致した場合だけ**採用します。リストをURLから作りません。

エディタは `window.opener` と同一のWindow以外から開始しません。GASの実iframeのorigin・Window関係でこの条件が成立するか、まず専用検証課題で確認してください。成立しないときは双方の起動アダプターを調整し、`*` や `*.googleusercontent.com`、任意のURL指定を許可して解決しないでください。

有効化には、エディタの `enabled:true` と厳密な `trustedOrigins` に加え、開始画面へ表示する `retentionNotice`（保管方針・教員への相談先）の設定が必要です。これらは**未設定**です。URLパラメーターだけでは有効化できません。

## 双方向bridge

```js
const connection = JohoAssignmentLiteBridge.create({
  peer: knownEditorWindow, origin: fixedEditorOrigin,
  trustedOrigins: [fixedEditorOrigin], nonce, role: 'fm2',
  onRequest: (operation, payload) => dispatchAllowedOperation(operation, payload)
});
```

メッセージの形式:

```js
{type:'joho.assignment-lite.request',version:1,nonce,requestId,operation,payload}
{type:'joho.assignment-lite.response',version:1,nonce,requestId,operation,ok:true,result}
{type:'joho.assignment-lite.response',version:1,nonce,requestId,operation,ok:false,error:{message}}
```

outer `requestId` はbridgeが作る通信対応ID。payload内の `requestId` はfm2サーバーの冪等性IDです。**混同・置換しません。** 保存の再送ではpayloadを固定し、outer IDは変わって構いません。20秒でタイムアウト。過去の要求は再実行せず応答を返します。応答キャッシュは接続ごと1200件までで、自動追い出しはしません。

| 方向・operation | fm2側の処理 |
|---|---|
| editor→fm2 `register-key` | `registerFmEditorKeyFromPage(payload)` |
| editor→fm2 `challenge` | `getFmEditorChallengeFromPage(payload)` |
| editor→fm2 `start` | `startFmEditorAssignmentFromPage(payload)` |
| editor→fm2 `checkpoint` | `saveFmEditorCheckpointFromPage(payload)` |
| editor→fm2 `resume` | `resumeFmEditorAssignmentFromPage(payload)` |
| editor→fm2 `prepare-submit` | 下記のファイルをフォームへセット。サーバーの正式提出は呼ばない |
| fm2→editor `sign-submit` | 最終フォーム全体を検査してHMACを返す |
| fm2→editor `submission-result` | 正式提出結果を通知する |
| fm2→editor `close` | 暗号保存して接続終了を表示。通常編集への強制切替はしない |

RPCは `google.script.run` の成功をPromise resolve、失敗をrejectへ対応させます。生の例外・スタック・鍵・本文をconsoleやログへ出しません。エディタ側は一般化したエラーを表示するため、詳しい対処（未登録鍵・世代競合・期限等）はfm2画面でも案内してください。

### 提出準備 → 全フォームの認証 → 正式結果

`prepare-submit` のpayload:

```js
{
  prepareId, route:{bookId,pid,itemId}, sessionId,browserKeyId,revision,
  receipt, // 最新checkpointのreceipt
  file:{itemId,name:'circuit.assignment-lite.json',mimeType:'application/json',size,base64}
}
```

- `file` のbase64は通常base64、UTF-8の平文作品JSON。ファイル全体を途中保存と同じbyte列にします。ローカルAESファイルを提出しません。
- fm2は対象のファイル1項目にセットし、追加の全設問・期限確認・再提出規則を維持します。fileのキー・名前・mimeType・size・base64を加工しないでください。
- 受取応答は `{received:true,prepareId,submitted:false}`。この段階は**未提出**です。
- ユーザーがfm2の最終提出ボタンを押したら、フォームを固定して次を呼びます。

```js
const editorProof = await connection.request('sign-submit', {
  prepareId, sessionId, revision,
  payload // 従来の全フォーム。editorProofはまだ付けない
});
// editorProof = {itemId,sessionId,browserKeyId,revision,mac}
payload.editorProof = editorProof;
// 既存submitAssignmentFromPage(payload)を実行。フォーム変更時は新requestIdで再確認。
```

エディタはroute/session/revision、対象file全体、準備ID、同じrequestIdで内容が変わっていないことを検査します。MACは全フォームから `editorProof` だけを除いたcanonical JSONのhashを含みます。他の設問を署名対象から省きません。確認待ちは編集・途中保存を止めます。「提出待ちを解除して編集する」は古い準備IDの署名を無効にします。

正式提出結果をfm2の既存APIで確認した後だけ、次を送ります。`attemptId` は既存結果から得た提出IDです。検査できる結果が返らない場合は成功として通知しません。

```js
await connection.request('submission-result', {
  prepareId, requestId: payload.requestId,
  submitted: true, attemptId
});
// 失敗時は submitted:false, attemptId:''。タイムアウトを成功にしない。
```

既にMACを返したrequestIdに対応する正式結果だけを表示します。再読込後の正式提出状況はfm2で確認します。既定ではエディタ側へ正式提出済み状態を永続記憶しません。

## 保護ファイルと保存先

- IndexedDB: **`joho.assignment-lite.v1`**（version 1）。`keys` storeの `browser` に `{browserKeyId,aes,hmac}`。`drafts` storeのsessionIdに `{token,envelope}`。
- `aes`: AES-GCM 256bit、`extractable:false`、encrypt/decrypt。`hmac`: HMAC-SHA-256、32byte、`extractable:false`、sign。
- HMAC素材は登録中だけメモリに保持し、登録応答の確認後に破棄します。登録応答を失ったときは同じ素材で再試行。再読込後は既存CryptoKeyでchallenge/startを試し、未登録なら停止します。既存鍵を黙って作り直しません。新鍵の準備・教員復旧はfm2側の運用と調整してください。
- `browserKeyId = base64url(SHA-256(rawHmacKey))`。ハードウェアの識別子ではありません。
- 保存は直列化。暗号化の後、IDB transaction内で直前のtokenと照合して更新します。他タブの更新を無言で上書きしません。

外側形式（`.assignment-lite.local.json`）:

```js
{format:'kaijo-assignment-lite-local',version:1,appId:'logic',sessionId,browserKeyId,iv,ciphertext}
```

ivは保存ごとに新しい12byte、暗号文は128bit認証tag付きAES-GCM。base64url・パディングなしです。AADはUTF-8の次のcanonical JSON:

```js
['joho.assignment-lite.local.v1', appId, sessionId, browserKeyId]
```

暗号化する内部データは `{route,session,workText,pending}`。`workText` が全文書・全履歴。`pending` はnull、または応答待ちcheckpointの `{requestId,revision,payloadHash}`。その間は作品を固定します。通常 `.logic.json`、旧 `kaijo-assignment-encrypted`、旧IndexedDB `joho.assignments.keys.v1` と互換化・流用しません。

通常の保存候補から課題を復元しません。fm2から開き直して、認証後に同sessionの保護下書きを再開します。持込みが許可された課題だけ、通常の保存・ファイル・テンプレートを読む経路を表示／許可し、importを記録します。保護ファイルの読込も現在の履歴を消さず、1操作として追記します。

容量不足・別タブ競合でも暗号ファイルへの退避は可能です。通常平文保存へはフォールバックしません。教員が救出できるのは**fm2側の最後のcheckpoint**で、失ったローカルAES鍵の復号・未送信変更の救出ではありません。

## 履歴の粒度・上限

- 確定した追加・削除・移動・接続変更・整列・0/1の値変更・Undo/Redoを1操作として記録します。表示上の0/1のオンオフや選択は記録しません。
- 配線や部品のドラッグ途中は記録しません。普通のUndoスタック（80件）と課題の追記履歴は別です。
- `start` / `recover` から開始。許可された既存回路の持込みは `import`。復旧は新sessionの最初のdocumentとfm2のbaselineHashを一致させ、旧履歴を新鍵へ連結しません。
- 作品全体6MiB・1000件・構造ノード250000・深さ48。上限前の履歴を保持し、上限を超える新しい編集は適用せず案内します。上限を理由に古い履歴を間引きません。単純な回路でも、授業前に想定操作数と保存速度を確認してください。
- 履歴chainは `H0=sha(canonical(['fm2.editor-lite.history.v1',sessionId]))`、`Hn=sha(canonical([Hn-1,entry]))`。保存済みprefixとの連続性を確認します。
- fm2正本のcanonical・MAC契約は[README末尾](README.md#lite-v1の通信要点)を参照。RFC 8785とは呼びません。

## 検証と有効化前の残作業

```sh
node scripts/test-assignment-lite.mjs
# ローカルHTTPサーバーのURLを指定。Chrome / Playwright WebKitの合成相手のみ。
JOHO_TEST_URL=http://127.0.0.1:8766/ node scripts/test-assignment-lite-browser.mjs
```

合成固定ベクターは `scripts/fixtures/assignment-lite-vector.json`。公開用のテスト値で、運用鍵ではありません。単体テストはcanonical・スキーマ・AES・MAC・応答喪失・再送・世代・提出すり替え・復旧baseline・bridge許可先を検査します。ブラウザテストは通常モード未有効化、実IndexedDB、通常保存との隔離、再開、全フォームの提出確認、390pxを対象とします。

授業での有効化条件:

1. fm2の画面ブリッジと既存フォームへのファイル連携を実装する。本仕様のresponse/prepare/sign/resultの形を双方で確認する。
2. 教員の途中保存閲覧・鍵の登録状況確認・新鍵への復旧・失効UIを実装する。
3. 学校アカウントを使う専用の検証課題（必須json1項目・相互評価なし）で、ChromeとSafariアプリの起動・保存・提出・閲覧・復旧を確認する。
4. 初期登録の応答喪失と再読込、未登録鍵、別アカウント、鍵消失、期限、同時提出、別タブ、容量不足を実機で確認する。
5. originとWindow関係、保管期間と相談先を確定し、エディタ設定とfm2設定を明示的に有効化する。

この実装だけを根拠に本番を有効化しません。fm2のGAS・設定・鍵・実生徒データには今回変更を加えていません。
