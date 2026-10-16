# Python問題マスター：確認問題の編集契約

2026-10-16。編集正本は既存の1シートに置く。1行をコード問題または確認問題とし、既存A:Rの18列は保持、S:Vへ次の4列を追加する。既存125行の追加欄は空欄のままとし、問題文・雛形・採点・版・従来のobservationを変更しない。

| 列 | 名前 | 入れるもの |
|---|---|---|
| S | kind | 通常はcode、確認問題はconfirmation。空欄は従来方式で判定 |
| T | codeRefs | 参照元の問題ID@版。複数はカンマ区切り。JSON配列でも可 |
| U | checkType | inputCases / resultCoverage / attemptLimit / compareRuns / answer |
| V | checkConfig | 方式ごとのJSON。任意プログラム・評価式は実行しない |

## 行と版の扱い

コード問題のcodeRefs/checkType/checkConfigは空欄。確認問題は固有のquestionIdとversion、既存列のsetId/order/title/prompt/statusを持ち、templateCode/setupCode/gradingVersion/scoringIds/採点範囲は空欄にする。コードはcodeRefsで参照する。例は `demo-code@v1`。構造化する場合は `[{"questionId":"demo-code","version":"v1"}]`。

参照は同じ問題セットのコード問題に限定し、確認問題や自分自身は参照できない。compareRunsだけ複数参照できる。参照元の版も本人が取得するカタログへ含める必要があり、閲覧権限のない旧版は自動取得しない。answerも現段階はコード参照1件が必要。

採用・配信済みと同じID/版の問題本文・雛形・確認設定は差し替えない。変更時は旧版を残して新しい版を作り、参照元の版も明示する。新たな確認問題を実課題へ加える際は、教員が問題文・条件を作成して配信する。今回の列追加だけでは既存課題を確認問題へ変換しない。

旧18列と新22列を読める。確認問題入りの配布は `python-editor-catalog-v2`、従来問題だけならv1を維持する。列名・参照・方式・設定が不正なら配信前に停止し、前の配信を保つ。

## 5方式の設定例

以下は公開用の独自例で、学校問題の基準ではない。

### inputCases：入力条件を試す

```json
{"cases":[{"id":"below","label":"6より小さい整数","inputs":[{"index":0,"kind":"integer","op":"lt","value":6}]},{"id":"boundary","label":"ちょうど6","inputs":[{"index":0,"kind":"integer","op":"eq","value":6}]},{"id":"above","label":"6より大きい整数","inputs":[{"index":0,"kind":"integer","op":"gt","value":6}]}]}
```

indexは0から数えたinputの順番。kindはinteger/number/text、opはeq/ne/gt/gte/lt/lte/any（textはeq/ne/any）。1ケースのinputsをすべて満たす正常終了を記録する。「条件を試した」と「出力が正しい」を分け、ブラウザでは前者を示す。非公開の出力照合値は任意で `private.expectedOutputs.<caseId>={"mode":"lastLine","text":"..."}` に保持できるが、現段階の正式採点へは接続しない。

### resultCoverage：結果の種類を観察する

```json
{"results":["北","東","南","西"],"requiredDistinct":3,"output":"lastLine"}
```

定義した文字列だけを数え、同じ結果を重複計上しない。outputはlastLine（最後の行）またはexact（標準出力全体、末尾改行を除く）。入力プロンプトと入力エコーは照合用標準出力へ含めない。途中に数値などがあるだけで別の種類にしない。未達は未確認として扱い、乱数の不運を正式な不正解としない。最大試行数・授業時の未達の扱いは別途決める。

### attemptLimit：目標回数以内に数当てする

```json
{"range":{"min":1,"max":100},"maxGuesses":"theoretical","guessPrompt":"予想: ","successOutput":"正解","output":"lastLine"}
```

theoreticalは候補N個に対して `ceil(log2(N+1))`。1〜100なら7回、1〜128なら8回。固定の正整数でも指定できる。guessPromptと一致するinputの回答を数え、正解した回答も含める。範囲外・整数以外・EOFを含む試行は達成対象にせず、履歴は残す。正常終了と指定した成功出力が必要。これは指定回数で正解表示まで進んだことの確認であり、二分探索の正しい実装の証明ではない。

### compareRuns：複数の試行を比較する

```json
{"conditions":[{"id":"a","label":"方法Aの結果"},{"id":"b","label":"方法Bの結果"}],"codePolicy":"variants","question":"比較する実行結果を選びましょう。"}
```

条件ごとに異なる正常試行を生徒が選ぶ。sameCodeは現在の同じコードだけ、variantsは意図的なコード変更も比較に使う。ラベルどおりの実験や数学的な正しさを自動で保証しない。比較の理由を問う場合は別のanswer行を加える。

### answer：観察後の回答を記録する

```json
{"format":"choice","question":"比較する前にそろえるものは？","choices":[{"id":"input","label":"入力値"},{"id":"name","label":"変数名の文字数"}],"private":{"expectedAnswer":"input"}}
```

format=numberではchoicesを置かず、数値を受け取る。正答を持つ場合はprivate.expectedAnswerに置く。private全体を配布前に取り除き、ブラウザは「回答済み・正誤未判定」を表示する。採点基準や正答を渡してローカルの合否を正式得点にすることはしない。

## 試行記録と保存

問題マスターには試行を追記しない。端末内の別journalに、参照元ID/版、実行コード全文とSHA-256、実際に消費した入力（プロンプト・値）、入力プロンプトを除く標準出力、標準エラー、終了区分、出力上限、端末日時、確認回答を保存する。通常の出力表示・提出用stdout/inputEcho/outputTextは従来形式を保持する。

同じ参照元・版でもコードが変われば現在の達成集計へ混ぜない。以前のコードへ戻した場合は、内容が一致する履歴を再利用できる。エラー・停止・出力上限は履歴に残すが達成集計に使わない。端末日時やhashは正式な受付証明ではない。

ブラウザ自動保存と任意JSONファイルの保存・取込みを実装した。別タブ・取込みの同一ID衝突や異なる回答は上書きせず停止する。上限は暫定で試行1000件・回答2000件・UTF-8 JSON 4MiB。古い記録を自動削除せず、容量・破損・保存拒否では警告して画面内に保持する。

確認journalのGSS保存・正式提出・採点・★への計上は未接続。参照元コードの通常の下書き保存・採点とは独立する。ここを実接続する前に提出項目、サーバー側再確認、配点、旧版扱いを定める。今年度Colabと旧gradeの動作は保持する。

## 実装の正本

検証・学習用判定の正本はconfirmation.mjs。GAS45は `node scripts/build-pythoneditor-confirmation.mjs` で生成し、`--check` で一致確認する。非公開設定はGASの固定スナップショット内に保持し、公開プロジェクターから除く。JS/JSON内に任意コードを埋める採点方式は受け付けない。
