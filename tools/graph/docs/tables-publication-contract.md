# 回帰の連携・数表・統計・教材出力（0.7.0）

## 範囲

今回のAは回帰曲線と既存作図の連携、Bは数表のセル編集と列の割当、Cは教材向けの軸表示・画像寸法・印刷。基本統計量と相関行列を併せて実装する。3Dの断面・等高線・空間曲線は保留を維持する。

## 保存形式

- `kaijo-graph` version 8。version 1〜7は従来の表示を保って移行する。旧versionへ新フィールドを混入した文書は拒否する。
- 数表系列は任意で `dataTable:{columns:string[],rows:(number|null)[][],mapping:{x,y,z,errorX,errorY}}` を保持する。2〜20列、10000行まで。mappingは0始まりの列番号またはnull。2Dではx・yが必須、zはnull。3Dではx・y・zが必須、誤差列はnull。座標列の重複は認めない。列名は80文字まで。空欄は欠測で、0と区別する。
- 元の全列をdataTableに保持し、既存のrows/errorBarsは列割当から作る。読み込み時は両者の一致を検証し、不一致を無言で上書きしない。dataTableを持たない既存の数表も読み込める。文書2MB・全体50000行の上限は維持する。
- 点の回帰参照は `anchor:{type:'regression',regressionId,at}`。接線は既存seriesId、または `target:{type:'regression',id}` の一方だけを持つ。交点・曲線領域のtargetsに `{type:'regression',id}` を追加。参照元の削除は既存同様に再帰削除し、Undoで一緒に復元する。
- `presentation:{axisArrows:false,originLabel:false,tickMarks:true,tickLabels:true}` を追加。旧版は従来の見た目に合わせてtickMarks:falseへ移行する。軸矢印と原点Oは2D用。原点Oは両軸が通常目盛で0を表示範囲に含むときだけ表示する。
- `output:{width:1200,height:800,margin:64,fontSize:16,paper:'a4',orientation:'landscape',title:true}` を追加。画像の幅・高さは320〜4096px、余白16〜200px、文字8〜36px。用紙はA4／JIS B5、縦横。画像出力の倍率は1〜4で、最終寸法8192px・総画素33554432以内。用紙サイズと向きは印刷時に適用する。
- 描画用の補間点、回帰係数、統計計算結果は保存せず、元データから再計算する。

標準偏差・分散の定義を確認するときは [NIST/SEMATECH e-Handbook of Statistical Methods: Descriptive Statistics](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm) を参照する。Pearson相関係数の計算条件は [SciPy `pearsonr` documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html) の定義を参照する。

## 操作と数値の意味

- 数表はセルを直接編集し、行・列の追加削除、矩形の貼り付け、CSV/TSVの読み込み、列名・描画列の割当を同じ画面で扱う。50行ずつ表示し、適用前の変更は文書へ反映しない。CSVの未使用列を捨てない。
- 回帰への点・接線・交点・領域は内部精度の予測関数を使い、表示用に丸めた回帰式を再入力しない。観測xの最小〜最大を有効区間にし、外挿しない。接線そのものは従来と同じ直線として扱う。再計算に失敗した場合は設定を保持して理由を表示する。
- 統計量は有効数・欠測数・合計・平均・中央値・最小・最大・分散・標準偏差。分散と標準偏差はnで割る値とn−1で割る値を別々に表示する。n=0やn−1=0の結果を0と表示しない。
- 相関行列は同じ数表の選択列のPearson相関。各組で両値がある行のみを使う（ペアごとの欠測除外）。セルごとに使用数nを表示する。2組未満、定数列は未定義。変数ごとの標本が異なる場合があるため、相関行列が常に正定値になるとは限らない。別々の数表を行順だけで結合しない。
- 統計量・相関行列・使用数のCSVを書き出せる。表示は8有効桁、保存・再計算の値は丸めない。相関は因果関係を示さない。
- 教材用の画像・印刷は白背景を基本とし、画像では透明背景も選べる。編集画面のテーマ、3Dの視点、元データを変更しない。印刷はプレビューで内容を確認して開始する。

## 検証

既知の統計結果、欠測の組合せ、定数列、少数データ、大きなオフセット、数表の保存整合性、旧版移行、不正参照、削除とUndo、回帰への作図連携を自動検証する。Chromeでセル入力・貼り付け・列割当・CSV/JSON/画像・印刷用PDF、390px、テーマ、キーボード操作を確認する。Safariは作成者の指示で省略する。
