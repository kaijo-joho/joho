# 実験データの分析（2026-09-16、0.6.0）

## 今回の範囲

- 2D数表の誤差棒、回帰曲線、回帰式・R²・Pearsonの相関係数r・RMSE・残差、残差CSV、補間方法の選択。3Dデータの分析、重み付き回帰、信頼区間、自動外れ値除去は今回の対象外。
- 回帰は直線、原点を通る直線、2次式、指数、べき乗。すべての完全な(x,y)行を等しい重みで使い、欠測行のみ除外する。指数はy>0、べき乗はx>0かつy>0が必要で、不適合行を無言で捨てない。
- 指数・べき乗は対数変換後の最小二乗。R²と残差・RMSEは元のyの尺度で計算する。R²は1−SSE/SST（負の値も許す）、yが一定なら未定義。RMSEはsqrt(SSE/n)。rは元のx・yのPearson相関で、因果関係を意味しない。
- 新規数表は散布図を基本にし、直線で結ぶ／滑らかな補間を明示的に選ぶ。滑らかな補間はPCHIP。欠測行をまたがず、元の行順を変更せず、各連続区間のxが厳密に単調な場合だけ使う。外挿しない。無効な場合は理由と元の点を表示する。

## 保存形式と連携

- `kaijo-graph` version 7。version 1〜6を保持して移行。旧版への新フィールド／regression混入は拒否。新しい計算結果自体は保存しない。
- data2d系列に `errorBars:{x:[],y:[]}` と `interpolation:'linear'|'monotone'` を追加。空の誤差配列は非使用、使用する配列はrowsと同じ長さで、非負の有限数またはnull。値は絶対座標での対称な±幅。幅0も有効、空欄ではその棒だけ出さない。重みとはしない。
- 誤差棒の表示はxのみ、yのみ、x・y両方、なしの4モード。3列CSVの第3列はy誤差として読み、数表の編集画面でx誤差へ変更できる。4列CSVはx,y,x誤差,y誤差とする。
- 数表入力はx,y／x,y,Δy／x,y,Δx／x,y,Δx,Δy。行の追加・削除に誤差値を同じ表内で追従させ、CSVにも選択した列を出す。data3dの列仕様は維持する。
- `regression` 注釈は共通id/name/visible/style/labelに加え、`seriesId`（data2d参照）、`model:'linear'|'proportional'|'quadratic'|'exponential'|'power'`、`showEquation`、`showMetrics`を持つ。モデルを変えても同じ注釈ID。元の数表を変更すると再計算し、削除時は回帰注釈も再帰削除／Undo復元する。分析失敗時も設定を保持する。
- 回帰線は観測xの最小〜最大で描画する。表示範囲が対数軸に適さない部分は描かず理由を示す。2D専用で、3D表示中は保持。色・線幅・線種は通常の選択ポップアップ、名前・式・R²は同じラベルにまとめてドラッグ可能。

## 独立モジュールのAPI

- `GraphAnalysis.fit(series, model)` → `{warning,model,n,skipped,coefficients,domain:[minX,maxX],predict(x),r,r2,rmse,residuals}`。エラー時はwarning付きで数値や描画可能な関数を返さない。residualsは `[元の行番号(1始まり),x,y,近似値,y−近似値]` の配列。
- 係数順は直線 `[切片,傾き]`、原点直線 `[0,傾き]`、2次 `[定数,1次,2次]`、指数／べき乗 `[A,B]`（A exp(Bx)／A x^B）。予測は中心化・尺度調整した内部計算で安定性を保つ。点数不足、異なるxの不足、階数不足、非有限の計算は拒否する。
- `GraphAnalysis.equation(result,xSymbol='x',ySymbol='y')` → プレーンテキストの近似式。数値表示は8有効桁。任意の軸記号を使い、HTMLとして扱わない。
- `GraphDataCurves.interpolate(rows)` → `{rows,warning}`。有限の連続ブロックをPCHIPで描画用に補間し、null行で切断する。最大20000描画点。元データと元の誤差棒を描画用補間点に複製しない。
- `GraphAnnotations.evaluate(regression,doc)` → `{points:[],segments:[curvePoints],labelPoint,fit,warning}`。`fit`はGraphAnalysisの戻り値。回帰の書式・ラベルはGraphPlotで描画する。

## UI・検証・参照

- 数表を選択したポップアップの「回帰分析」、または左の追加メニューから作成。分析画面にモデル・式・数値・残差一覧を置き、確定で回帰注釈を追加／更新する。詳細は注釈の「︙」で開く。元の数表・出典を改変しない。
- 補間方法、誤差棒の方向、回帰モデル、図中の式・R²表示は各画面で明示的に選ぶ。残差一覧はCSVへ書き出せる。新規テンプレート「ばねの伸びと力（合成データ）」「時間と濃度（合成データ）」は合成データであり、実測値や外部原本の転載として扱わない。
- 誤差棒の幅が対数軸の非正側に届く場合、その棒を出さず理由を表示する。元の点と他の有効な棒は保持する。
- 練習テンプレートは合成データと明記し、実測データや外部原本の転載と表示しない。既存の蒸気圧表は数値・出典を変更しない。
- 単体テストで既知の係数・残差・R²・r、欠測、制約違反、桁の大きいデータ、補間の単調性・欠測切断、保存移行を確認する。Chromeで追加・再編集・追従・選択・Undo・CSV/JSON/PNG/SVG・390px・テーマ・キーボード・タッチを確認する。Safari実機は作成者の指示で省略する。
- 計算手法の参照：[NIST 最小二乗](https://www.itl.nist.gov/div898/handbook/pmd/section4/pmd431.htm)、[SciPy PCHIPの定義](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html)。ライブラリのコードは転載せず、数式を独自実装する。

## 次の候補

残差の図示、回帰の信頼区間、複数グラフの比較配置、実験データの測定条件テンプレートを候補とする。3Dデータの分析、重み付き回帰、自動外れ値除去は今回の範囲外である。
