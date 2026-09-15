# tools/ の共通部品

- [操作しながら読めるヘルプ](help-panel.md): `help-panel.js`・`help-panel.css`。論理回路エディタに組み込み済み。他アプリでの呼び出し方、表示・保存・キーボードの契約をまとめています。
- [editor-lite v1の実装とfm2への引き継ぎ](assignment-lite.md): AES保護保存・HMAC・固定列挙bridge・課題クライアント。論理回路へ組み込み、本番設定は無効のままです。

**fm2との今回の連携は、末尾「2026-09-15追記: fm2との連携はeditor-lite v1で進める」を参照してください。** 以下のRSA方式は既存試作の仕様として保持しています。

## 旧RSA方式の共通基盤（試作・未有効化）

論理回路・構造式・分子模型・フローチャートなどで共用できる、署名付き課題情報・編集履歴・暗号化保存の基盤です。2026-09-15時点では**ライブラリとテストのみ**で、既存エディタは読み込んでいません。通常の保存・自動復元・ファイル形式は変更していません。fm2の発行・提出・教員の閲覧画面も未実装です。

## 対象と限界

- 署名付きの配付情報を、課題・受取人の不透明なID・アプリ・ブラウザ鍵へ紐付けます。
- 本文と変更履歴を一緒に暗号化し、元のブラウザ、または権限を確認した教員側で復号するための形式を提供します。
- 別ブラウザへファイルだけをコピーする行為や、ファイルの一部を書き換える行為に対する抑止・検出を目的とします。**本人作成の証明、完全な不正防止、物理的なMacの固定ではありません。**
- 同じoriginのスクリプトは鍵を使用できます。開発者ツール・XSS・端末の管理権限・プロファイル移行等に耐える保証はありません。履歴や端末時刻は利用者側で作られる情報で、偽造・削除・古い提出物の再利用を完全には防げません。
- 署名するのは発行側の課題情報です。本文をfm2が署名したものではなく、公開鍵を持つ者が暗号化できること自体も作者の証明にはなりません。
- ブラウザデータの削除・別プロファイル・プライベートブラウズの終了等では鍵が失われ得ます。教員による復旧・再発行の運用を用意するまで授業では有効化しません。
- ハードウェア番号、MACアドレス、フォント等による指紋、キー入力の逐次ログ、他サイトの閲覧履歴は取得しません。

## ファイルと責務

| ファイル | 責務 |
|---|---|
| `assignment-security.js` | 信頼する公開鍵による配付情報の検証、ブラウザ鍵の永続化、本文・履歴の検証と暗号化／復号 |
| `assignment-launch.js` | 既知のウィンドウ・厳密なorigin・nonceを使う、一回限りの起動メッセージ受信 |
| 各エディタのアダプター（未実装） | 文書の検証、確定した編集の通知、課題用の自動／明示保存、表示・確認・失敗時の保持 |
| fm2側（未実装） | 学校アカウント認証、署名発行、提出者・課題・期限の検査、保存・受領証、教員認可・復旧 |

ブラウザでは `JohoAssignmentSecurity` / `JohoAssignmentLaunch`、Nodeのテストでは `require()` で読み込みます。読み込むだけではストレージ・通信・DOMを操作しません。実運用の公開鍵・接続先・秘密鍵は含めていません。

### 暗号の構成

標準のWeb Crypto APIを使用し、独自暗号や共通パスワードは使いません。

- 配付情報: Compact JWS、RS256（RSA SHA-256署名）。アダプターが固定した公開鍵IDだけを許可。ファイルやURLの指定で信頼する公開鍵を追加しません。
- ブラウザ鍵: RSA-OAEP / SHA-256、3072ビット。秘密鍵は `extractable:false` の `CryptoKey` としてIndexedDBに保存。公開鍵だけを発行側へ送ります。
- 復旧鍵: 教員側が管理するRSA-OAEP / SHA-256公開鍵（2048〜4096ビット）。署名鍵と分離します。秘密鍵はエディタ、配付ファイル、リポジトリに置きません。
- 本文暗号: AES-GCM 256ビット、128ビット認証タグ。保存ごとに新しい本文鍵と96ビットのランダムIVを生成します。
- 本文鍵はブラウザ公開鍵と復旧公開鍵でそれぞれ包みます。署名付き配付情報・暗号方式・IV・両方の包みをAAD（認証対象の付加情報）に含めます。いずれかの改変で復号を拒否します。
- ブラウザ鍵IDは `{e,kty,n}` をキー名順にJSON化したもののSHA-256・base64urlです。鍵の保存は `joho.assignments.keys.v1` / `keys` ストアのアプリID単位。複数タブの初期化は一意制約で調停し、既存の鍵を上書きしません。

`extractable:false` はJavaScriptの鍵エクスポートを禁止する指定で、鍵の使用・端末ディスク・物理端末への固定を保証しません。[CryptoKey.extractable](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/extractable)、[Web Cryptoの安全上の注意](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#security-developers)を参照してください。

## 呼び出し契約

### クライアントの設定

```js
const client = JohoAssignmentSecurity.createClient({
  appId: 'logic',
  issuer: 'fm2',
  signingKeys: trustedSigningPublicKeys, // { keyId: publicRSAJwk }
  recoveryKeys: trustedRecoveryPublicKeys, // { keyId: publicRSAJwk }
  validateDocument(document, { index, action }) {
    // 各アプリの版・個数上限・参照先・型・座標等を同期的に検査する。
    // 不正ならthrowまたはfalse。Promiseは禁止。
    LogicStorage.normalizeSnapshot(document);
  }
});
```

発行者・署名鍵・復旧公開鍵・教材の検証関数はすべて必須です。検証関数にはコピーを渡し、戻り値を正規化結果として採用しません。呼出側で保存対象を正規化してから渡します。クライアントやファイルを信頼するだけでなく、提出側でも同じ意味検証を行います。

`keyStore`（非同期の `read(appId)` / `add(record)`）、`crypto`、`now` はテスト・サーバーアダプター用の注入点です。通常の生徒用コードで保存を省略するストアへ置き換えないでください。

### 配付情報

署名ヘッダーは `{alg:'RS256', typ:'joho-assignment+jwt', kid:'登録済みの鍵ID'}`。署名対象のclaimsは次の項目だけです。

| 項目 | 内容 |
|---|---|
| `v` | 1 |
| `iss` / `aud` | 設定済み発行者 / 対象アプリID |
| `sub` | 受取人に対応する不透明なID。氏名・メールアドレスを直接入れない |
| `jti` / `assignmentId` | 発行ID / 課題ID |
| `iat` / `exp` | 発行時刻 / **開始情報**の有効期限（UNIX秒） |
| `browserKeyId` | 受け取ったブラウザ公開鍵の指紋 |
| `recoveryKeyId` | 登録済みの教員用復旧公開鍵ID |
| `allowImport` | 過去の作品・テンプレート等の持ち込みを認めるか（真偽値） |

IDは英数字・`.`・`_`・`-`（1〜128文字、先頭英数字）。ブラウザ鍵IDは43文字のbase64urlです。個人情報を入れないことは発行側の責任です。未知のclaims・鍵ID・アルゴリズム、未署名情報、別アプリの情報は拒否します。

署名された配付情報は暗号化ファイルの外側にあり、誰でも読めます。ログイン権限や提出権限を持つトークンとして扱わず、fm2は提出時に再認証・対象照合を行います。`exp` は開始期限であり提出期限ではありません。保存・過去作品の復号は期限切れでも可能とし、提出期限・失効・再発行はサーバーが別に検査します。時刻判定をクライアントだけに任せません。

### 開始から保存・復元まで

1. 明示的な課題開始で `await client.prepareBrowser()`。IndexedDBの保存と読戻しに成功した `{appId,browserKeyId,publicJwk}` を発行側へ渡します。
2. 学校アカウントを認証した発行側から署名付き情報を受け取り、`await client.start(grant, {document, name, imported})` でセッションを作ります。途中作品の持ち込みなら必ず `imported:true`。
3. **確定した編集単位**で `session = await client.record(session, document, {action, detail})`。ドラッグ途中・テーマ・表示倍率・選択だけでは記録しません。
4. `const encryptedText = await client.seal(session)`。アダプターがこれを課題専用の自動保存／明示保存先へ保存します。ライブラリ自体は作品ファイルを書き込みません。
5. `session = await client.open(encryptedText)`。署名・鍵・暗号・全履歴・教材データの検証が成功してから `session.work.entries.at(-1).document` を編集画面へ反映します。

各メソッドは元のセッションを変更しません。複数の編集・保存はアダプターで直列化し、古い保存の完了が新しい内容を上書きしないようにします。途中で失敗したら編集内容・元のファイル・未保存状態を保持し、成功表示を出しません。

`verifyGrant(grant)` は開始時の検証。`{allowExpired:true}` は保存・復号用で、権限・署名の検査を省く指定ではありません。

### 編集履歴

各要素は `{seq, action, detail, at, browserKeyId, document}`。最初は `start` または `start-import`、以後は `edit` / `undo` / `redo` / `import` / `checkpoint`。1操作ごとに文書全体のスナップショットを記録します。

- Undoでも記録を削除せず新しい履歴として追記。変化のない `edit` は追加しません。
- 全履歴のアプリID・発行ID・鍵ID・連番・型を検査。初版では履歴途中での鍵の変更を扱いません。復旧後の再発行・引継ぎ履歴はfm2側の別の監査記録が必要です。
- 通常のUndoスタックとは別物です。ファイル読込・テンプレート等の持ち込みも記録し、`allowImport:false` なら禁止します。クリア・切替で課題情報や履歴だけを落としてはいけません。
- 上限は1000件、本文と全履歴を合わせてUTF-8で6MiB、暗号化ファイルで10MiB。JSONの深さ48・ノード数250000等の上限にも達したら拒否します。古い履歴を自動削除しません。
- 上限エラー時も作業を失わせず、元の保存を保持して案内することがUI側の有効化条件です。授業前に代表的な課題量でサイズ・速度を確認してください。
- 操作時刻と履歴は参考情報です。サーバー受領時刻と区別し、自動的な不正認定に使いません。[OWASPのログの信頼境界](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#event-data-sources)も参照してください。

### 起動メッセージ

`JohoAssignmentLaunch.receive({client, sourceWindow, sourceOrigin, signal?, timeoutMs?})` は、既知の発行画面のWindow参照と、設定で固定したHTTPSのoriginが必要です。URLパラメーターをそのまま信用して設定しません。GASの実際のウィンドウ・origin・リダイレクト挙動は接続時に実機で確認します。

エディタから `sourceWindow.postMessage(..., sourceOrigin)` で送る内容:

```js
{ type: 'joho.assignment.ready', version: 1, nonce, appId, browserKeyId, publicJwk }
```

発行側から同じnonceで返す内容:

```js
{ type: 'joho.assignment.launch', version: 1, nonce, grant }
```

24バイトのランダムnonce、`event.origin`、`event.source`、署名、アプリ、ブラウザ鍵を検査し、成功すると `{grant,claims}` を返します。受信だけで文書を置き換えません。タイムアウト・取消・失敗・完了でリスナーを除去します。発行側も対象Window・origin・nonce・payloadを検査してください。`*`、常設の無条件リスナー、URLへの個人情報や署名情報の埋め込みは使いません。[postMessageの安全上の注意](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)に従います。

## 有効化前に必要な作業（未実装）

- **fm2:** 学校アカウントと課題の権限照合 → 公開鍵登録・署名発行 → 提出時の再認証・失効/期限/発行ID/受取人/アプリの検査 → 本文・履歴の検証・サーバー受領記録。リプレイ・重複送信・再提出・通信失敗も扱う。
- **鍵運用:** 署名鍵と復旧鍵の安全な発行・保管、鍵ID、公開鍵の固定、ローテーション、古い作品に必要な鍵の保持、復旧担当の権限と監査。実在の鍵を開発用テストへ流用しない。
- **教員の閲覧・復旧:** `openForRecovery(text, privateCryptoKey)` は暗号処理の部品だけで、教員認証機能ではありません。教員権限を確認したバックエンドで使用し、秘密鍵を生徒UIへ渡さない。GAS上でこのWeb Cryptoコードがそのまま動くわけではなく、fm2担当が復号先・実行方式・認可・再発行を整備する必要があります。
- **各エディタ:** 正規化アダプター、編集の直列化、履歴記録、課題モード表示、既存作品の保存確認、課題用ファイルの識別、全保存経路・自動復元・アーカイブの保護、適切なエラー表示。既存の通常保存先へ平文を漏らさない。通常の保存形式や候補を破壊しない。
- **持ち込み・出力:** 既存作品を課題へ持ち込めるかは課題の設定で明示する。持ち込む場合は `start-import` から始まり、それ以前の編集を証明しない。PNG・SVG・通常JSONへの出力を課題モードで認めるかも、教師の課題設定として決める。暗号化を理由に画像の転載等まで防げるとは説明しない。
- **利用説明:** 課題モードでは作品・履歴・不透明な受取人ID等をfm2へ送ること、送信先・時点・記録範囲・保管期間、端末変更・鍵消失時の相談先を生徒へ説明する。通常モードの「外部送信しない」というヘルプを課題モードへ無条件に流用しない。
- **互換性:** 共通化のために単一HTMLのアプリを一括で分割しない。読み込み／組み込み方法と担当範囲をアプリごとに決める。プライベートブラウズや永続保存不可の環境は課題開始前に案内する。

**署名発行・提出検証・教員の閲覧／復旧が揃い、正常系と障害系を実際のfm2で確認してから課題モードを有効化します。現在は通常のエディタから直接提出できません。**

## 検証

```sh
node --check tools/shared/assignment-security.js
node --check tools/shared/assignment-launch.js
node scripts/test-assignment-security.mjs
# Playwrightが利用できるNode環境で実行
node scripts/test-assignment-security-browser.mjs
```

単体テストは実行時に生成したテスト鍵だけで、署名・期限・暗号化往復・改変拒否・教員復号・鍵保存障害・履歴上限・アプリ別検証・メッセージ検証を確認します。ブラウザテストはGoogle ChromeとPlaywright WebKitで実際のIndexedDB/CryptoKey、2タブ競合、再読込、別プロファイル、鍵消失、実Window間のpostMessage、Node側の復号を確認します。テスト用HTTPSの応答はローカルで差し替え、実際のfm2や生徒データには接続しません。

Safariアプリでの実機操作、物理的に別のMac、実際のfm2、教員の復旧UI、課題用の自動保存・提出は未確認／未実装です。

## 2026-09-15追記: fm2との連携はeditor-lite v1で進める

**今回採用するのは追加課金なしの簡易方式です。上記のRSA／教員復号方式は試作として保持し、その形式やAPIの意味を変更しません。** 論理回路エディタへの組込みと共通クライアントを追加しました。fm2サーバー側はローカル実装済みですが、fm2の画面間ブリッジ・教員UI・実GASでの検証は別作業です。授業ではまだ有効化しません。

詳細な受け渡し契約の正本は、fm2の `/Users/takashi/Documents/GAS/fm2/_docs/editor-assignment-integration-design.md` 第11〜17章です。第1〜10章のCloud Run/KMS案は保留です。実装はfm2の `70_EditorAssignmentProtocol.js` / `71_EditorAssignmentService.js`、共通の合成テストベクターは `_tests/editor-assignment-lite-vector.json` を参照します。

### エディタ担当への依頼

1. ブラウザ用AES-GCM鍵と、32byteランダムHMAC-SHA-256鍵を別々に作る。どちらも非エクスポートCryptoKeyとしてIndexedDBへ保存する。HMAC素材は登録時だけ認証済みfm2へHTTPSで渡し、その後はローカルの平文鍵素材を保持しない。fm2は検証用HMAC素材をScript Propertiesへ保管する。全員共通の固定鍵は使わない。
2. `browserKeyId = base64url(SHA-256(rawHmacKey))`（43文字、パディングなし）。既存RSA公開鍵の指紋とは別物。登録成功後の再読込でも同じ鍵を使い、別鍵へ黙って変更しない。
3. 課題モードの保存は通常モードと分離したAES暗号文にする。新しい外側形式・IndexedDB名・AADを定義して本READMEへ追記する。既存 `kaijo-assignment-encrypted` v1を別の意味で再利用しない。
4. fm2へは平文 `kaijo-assignment-lite-work` v1とHMACをHTTPSで渡す。fm2はローカルAES暗号文を復号しない。作品の全確定操作を履歴へ直列追記し、Undoでも古い履歴を削除しない。
5. ローカル暗号保存・fm2途中保存・正式提出の3状態を明確に区別する。途中保存の `submitted:false` で提出完了を表示しない。正式提出は必ずfm2の従来フォームを確認して確定する。
6. 教員復旧後は新sessionの `recover` 履歴から始める。fm2の `recoveryDocument` と最初のdocumentを一致させ、旧履歴を書き換えて新鍵の履歴へ連結しない。
7. 通常の `.logic.json`・下書き・アーカイブ・画像出力は維持する。課題モードの通常読込・保存・テンプレート・キーボード・タブ終了の全経路を確認する。実GASでの起動・提出・教員閲覧・復旧を確認するまで未有効化とする。

### lite v1の通信要点

HMAC入力は `fm2.editor-lite.v1\n` に次のオブジェクトのcanonical JSONを連結したUTF-8です。

```js
{ purpose, bookId, pid, itemId, sessionId, browserKeyId, requestId, revision, payloadHash, challenge }
```

- purposeは `start,resume,checkpoint,submit`。startだけsessionIdは空文字列。revisionは数値の整数。
- canonicalはキーをJavaScript `.sort()` の順で再帰整列、配列順維持、プリミティブはJSON.stringify。RFC 8785とは呼ばない。不正Unicode、非有限数値、非JSON値、危険なキーは拒否する。固定ベクターのtranscript・鍵ID・macを完全一致させる。
- start/resumeのpayloadHashは空文字列のSHA-256。120秒以内・1回限りのサーバーchallengeを取得して使う。再送ではchallengeを取り直す。
- checkpointのpayloadHashは送るworkTextそのもののUTF-8 SHA-256。submitは**最終フォーム全体からeditorProofだけを除いたcanonical JSON**のUTF-8 SHA-256。hash/macはbase64url・パディングなし。
- checkpoint/submitのchallengeは空文字列。同じ操作の再送ではrequestId・内容を固定する。変更時は新しいrequestId。
- 正式提出前にcheckpointを保存し、そのreceiptと同じraw byte列・revisionを使う。fm2の全設問入力後、最終payloadのHMACをエディタへ要求する。対象課題・session・ファイルhashを確認してから認証し、任意データの署名機にしない。
- `payload.editorProof = {itemId,sessionId,browserKeyId,revision,mac}` を付けて既存 `submitAssignmentFromPage` へ渡す。対象ファイル以外の必須設問、ファイル検査、期限・再提出規則も維持する。

平文作品の形:

```js
{
  format: 'kaijo-assignment-lite-work', version: 1, appId: 'logic', sessionId, name,
  entries: [{seq: 1, action: 'start', detail: '', at: '2026-09-15T03:00:00.000Z', document}]
}
```

旧形式と違いentryにbrowserKeyIdを入れません。documentは正規化した論理回路の `{graph,inputNames,inputValues}`。全履歴込み6MiB・1000件、名前60文字、深さ48・JSONノード250000。未知キーを削除して合格にしません。フォーム全体はbase64膨張込みcanonical JSONで12MiB以内です。

fm2のRPCは `registerFmEditorKeyFromPage` → `getFmEditorChallengeFromPage` → `startFmEditorAssignmentFromPage`、`saveFmEditorCheckpointFromPage`、`resumeFmEditorAssignmentFromPage`。静的エディタから直接fetchする入口ではなく、認証済みfm2画面の固定列挙ブリッジが代理します。実装時は `joho.assignment-lite.request/response` v1の名前空間を使用し、既知Window・厳密なorigin・接続nonce・requestId・許可操作を照合します。既存 `joho.assignment.ready/launch` のgrant契約には混在させません。

GAS iframeの実originとWindow関係は実機検証が必要です。`*`、`*.googleusercontent.com`、URLパラメーターから指定された任意originを許可して接続を成立させないでください。ブリッジ・教員UIはfm2側の残作業です。

### 確認できること・復旧の限界

- 確認表示は「配付先アカウント一致」「登録鍵で検証」「保存済み履歴との整合性」。同じ物理Mac・実際の操作者・すべての未送信操作を証明するものではありません。改造クライアントによる履歴捏造も完全には防げません。
- ブラウザ鍵を失った場合、教員は**最後にfm2へ保存できた作品**から新鍵へ復旧します。端末内だけにある暗号文を復号して救出する方式ではありません。未送信の編集は復旧できないため、最終fm2保存日時を表示します。
- 初期対象は必須jsonファイル1項目・相互評価なしの検証課題のみです。既存の通常提出を保護形式へ一括移行しません。停止時も保護指定課題の未検証添付への自動フォールバックは行いません。
- fm2ローカル検証は専用36ケースと既存11スイート（計139件＋日次サマリー）で成功。実接続、教員の閲覧・復旧UI、実GASの保存・同時実行、Chrome／Safariでの往復は別途検証します。今回、本番設定・鍵・データ作成、push・deployは行っていません。

### エディタ側の実装追記（2026-09-15）

- 実装: `assignment-lite.js` / `assignment-lite-store.js` / `assignment-lite-bridge.js` / `assignment-lite-client.js`。旧RSAのライブラリ・保存形式には変更を加えません。
- 新しいローカル外側形式は **`kaijo-assignment-lite-local` v1**。`{format,version,appId,sessionId,browserKeyId,iv,ciphertext}` とし、AES-GCM 256bit・12byteのランダムIV・128bit tagで保護します。
- AADはUTF-8の `canonical(['joho.assignment-lite.local.v1',appId,sessionId,browserKeyId])`。暗号化する内部は `{route,session,workText,pending}`。`pending` はnullまたは応答待ちcheckpointの `{requestId,revision,payloadHash}` です。
- IndexedDBは **`joho.assignment-lite.v1`**。`keys` storeの `browser` に非exportなAES/HMAC鍵、`drafts` storeのsessionIdに世代token付き暗号文を保存します。通常localStorageへ本文・履歴・鍵は保存しません。
- 確定編集だけを追記し、表示・選択・ドラッグ途中・キー入力は記録しません。履歴は不正検知の参考情報で、詳細な操作再生・本人制作の証明には使いません。
- 回路エディタの課題保存メニューで、ブラウザ保護保存／fm2途中保存／正式提出を分けます。保護ファイルの退避・読込、持込み制御、通常作品へ戻る操作を用意しました。
- **fm2担当は [assignment-lite.md](assignment-lite.md) の「起動」「双方向bridge」を参照してください。** `prepare-submit` / `sign-submit` / `submission-result` のpayloadと応答、各RPCへの対応、Window/originの実機確認条件を定義しています。
- `tools/logic/assignment-config.js` は `enabled:false`・許可originなし・保管方針未設定です。URLだけでは有効化できません。fm2のGAS・設定・鍵・生徒データはこのエディタ実装で変更していません。上段の36件＋139件はfm2担当からの報告であり、本実装の検証結果とは分けます。
