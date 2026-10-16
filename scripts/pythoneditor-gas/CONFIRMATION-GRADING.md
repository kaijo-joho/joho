# 確認問題の正式提出・採点契約（配置前）

通常のコード提出と旧エンジンは維持する。確認問題は`confirmation-v1`として同じsubmit/照会/再処理経路へ送信し、サーバーが採用版のprivate条件から判定する。端末のpassed/completed/scoreは受け付けない。試行記録・日時・コードhashは実行の真正性を保証しない。Pythonのサーバー再実行は行わない。

## 採点を有効にする明示設定

既存のPython問題マスターruntimeConfigへ、任意の`confirmationGrading`を設定する。新しい列は作らない。設定なしはgraded=false/canSubmit=falseで、学習用確認のまま。既定配点は設けない。次の形のschema/version/checksを全て明示する。実課題への設定・採用・配信・本番接続は別途確認する。

- schemaは1。versionは採点定義のID。
- checksは1〜100件でidの重複を禁止する。pointsは明示した有限の0〜1000、合計は0より大きくする。
- inputCasesの各checkは`{id,points,require}`。idはcasesのIDを全て一度ずつ指定する。requireはinput（その入力を試した記録）またはinputAndOutput（同じ試行のprivate出力条件にも適合）。後者はcheckConfig.private.expectedOutputs[id]が必須。
- resultCoverageの各checkは`{id,points,distinctAtLeast}`。閾値は1〜requiredDistinctで重複不可。requiredDistinctの閾値を必ず含める。単一の全達成条件か、段階条件かも明示設定で選ぶ。
- attemptLimitは1件の`{id,points,require:'withinLimit'}`。公開設定の推測範囲・回数上限・成功表示を使う。
- compareRunsはconditionsのIDを全て一度ずつ指定する。checkは`{id,points,require,inputs?,output?}`。requireはselection/input/output/inputAndOutput。inputを含む場合は既存の入力predicate配列、outputを含む場合は`{mode,text}`を必須にし、使わない項目は指定しない。selectionは異なる有効な試行を選択した事実だけを採点する。実際にその条件であることまで採点する場合はinput/output条件を指定する。
- answerは1件の`{id,points,require:'correct'}`。checkConfig.private.expectedAnswerが必須。数値回答はabsoluteToleranceとrelativeToleranceを両方明示する（厳密一致は両方0）。許容幅は`max(absoluteTolerance,relativeTolerance*abs(expectedAnswer))`。選択式へ誤差を指定しない。

正規化した採点定義、private正答、専用engineVersionは採用snapshotのhashへ含める。同じID・版を変更せず、新版を作る。参照元も同じセットの採用済みコード問題の指定版へ固定し、現在配信中の版へ自動変換しない。private項目・内部採点定義は配布投影へ出さない。★は明示したpoints>0のcheckごとに1つで、達成したcheck数を表示する。正式点は明示pointsの獲得合計/満点である。これらは設定された場合の実装契約であり、実課題の配点を承認したことを意味しない。

## 提出と保存

wireはkind/questionId/version/assignmentId/requestId/sources/journalだけ（再送時のintakeTicketを除く）。sourcesは`{questionId,version,code}`の配列。journalはportable schema1のtrialsとresponsesを使い、当該確認問題のcodeRefsに属する試行と当該確認問題の回答だけを含める。関係のない問題の回答、重複ID、欠けた選択先、未知metadataを拒否する。sourcesのhashはサーバーで計算し、trial.codeHashもコード全文から再計算する。通常は提出する現在コードと一致する成功・非切捨て試行だけを判定する。compareRunsのvariantsだけは変更前コードを明示的に許容する。

サーバーは`SHA256(canonical({questionId,version,sources,journal}))`をevidenceHashとして計算する。receiptにkindとevidenceHashを返す。通常コードのreceipt.codeHashは変更しない。確認記録全文と回答を専用の受付行へ不変保存し、応答消失後も同じrequestIdで照会・再処理する。保存本文の上限960000文字を超えたときは切り捨てず拒否する。

締切はRPC入口のサーバー受付時刻。署名付き到着証明、本人と本文の照合、結果保存/読戻し後のsubmitted、再提出履歴、締切内最高点は既存契約を共用する。成績や★を別提出の部分結果から寄せ集めない。旧版の最高点には旧版の分母と版を返す。ローカル学習用の達成表示とは独立する。

## 検証

`node --test tools/pythoneditor/tests/confirmation-server.test.mjs`で5方式、private除去、旧版、締切、再送、結果保存失敗、偽metadata、hash、payload上限を合成確認する。実GAS・学校アカウント・40人負荷・正式配点・GSS採用は別工程。新47はmanifest経由のgrade候補と、問題配布previewの準備コピーに含める。通常13エンジンと旧Colab経路は変更しない。
