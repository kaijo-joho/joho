# 物理モデルテンプレートの出典と範囲

`tools/graph/physics-templates.js` は、外部の実測表・図版を転載せず、公開された基本式からブラウザ内で曲線を生成するテンプレートである。すべての系列を `source.kind: "model"` とし、「実測値ではありません」と明記している。

- 等加速度運動と斜方投射は、[OpenStax Physics 5.3 Projectile Motion](https://openstax.org/books/physics/pages/5-3-projectile-motion) の一定加速度の式、重力加速度の成分 `a_y=-g`、水平成分 `a_x=0` を使う。斜方投射は離陸と着地の高さが同じ、`g=9.8 m/s²`、空気抵抗なしという条件で、`t=0..1` を飛行進行度として正規化する。この `t` は秒ではないため、式内で飛行時間を掛けて位置を求める。これにより描画は着地点で終わる。
- 単振動は、[OpenStax Physics 5.5 Simple Harmonic Motion](https://openstax.org/books/physics/pages/5-5-simple-harmonic-motion) の単振動とフックの法則の説明に基づく `d=A cos(2πft+φ)` の理想化した表現である。減衰・外力は含めない。
- 波の重ね合わせは、[OpenStax Physics 14.4 Sound Interference and Resonance](https://openstax.org/books/physics/pages/14-4-sound-interference-and-resonance) の、近い周波数の同振幅波の重ね合わせとうなりの説明に基づく。うなりの周波数は `|f1-f2|` である。縦軸は実測の音圧ではなく相対変位である。
- オームの法則は、[OpenStax College Physics 2e 20.2 Ohm’s Law](https://openstax.org/books/college-physics-2e/pages/20-2-ohms-law-resistance-and-simple-circuits) の `I=V/R` を使う。テンプレートの縦軸を mA にしたため、式の `1000*V/R` は A から mA への単位換算を含む。抵抗値一定のオーム性抵抗だけを表す。
- RC回路の充電は、[OpenStax University Physics Volume 2 10.5 RC Circuits](https://openstax.org/books/university-physics-volume-2/pages/10-5-rc-circuits) の `V_C=E(1-exp(-t/(RC)))` と時定数 `τ=RC` を使う。入力の抵抗は kΩ、容量は μF なので、秒単位の時定数は `R*C/1000` になる。初期無充電、理想直流電源、一定R・C、漏れや内部抵抗を無視する条件である。

OpenStax の資料は式と適用条件の確認に使い、同サイトの図版・表・本文をテンプレートへ複製していない。
