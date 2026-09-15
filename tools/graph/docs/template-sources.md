# グラフテンプレートの出典

`tools/graph/templates.js` の初期テンプレートには、数式モデルと、数式から作った水の飽和蒸気圧の数表を収録している。数式モデルは教材用に定義したもので、実測値を意味しない。

水の数表は、[IAPWS SR1-86(1992): Revised Supplementary Release on Saturation Properties of Ordinary Water Substance](https://www.iapws.org/relguide/Supp-sat.html) の飽和圧力式を使った計算値である。IAPWS はこの式を飽和条件での簡便な近似式として公開している。臨界温度 `Tc=647.096 K`、臨界圧力 `pc=22.064 MPa` と公式係数から計算し、MPa を kPa に換算した。IAPWS-95 が通常の水の国際標準であることは [IAPWS-95 (2018)](https://www.iapws.org/relguide/IAPWS-95.html) に示されている。

表の温度は 0.01°C（三重点）と 10, 20, …, 100°C、圧力は kPa で小数第3位に丸めた。0.01–100°C は飽和曲線の範囲内である。表の点の間はグラフアプリの `data2d` の仕様に従い直線補間し、平滑化や適用範囲外への外挿は行わない。したがって、これらを「実測データ」と表示しない。

公式式の利用条件に従い、リリース全体やデータベースを転載せず、授業テンプレートに必要な係数と少数の計算結果だけを保持している。
