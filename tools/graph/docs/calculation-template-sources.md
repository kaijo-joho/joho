# 計算列テンプレートの根拠と前提

この文書に対応する4つのグラフテンプレートは、授業で計算列の動作を確認するための `MODEL/模擬データ` です。表の数値は再現可能な固定値であり、実際の測定値・生徒のデータ・オープンデータを転載していません。利用者は数表の元の列を自分の測定値へ置き換え、計算列とグラフを再計算できます。

## テンプレートと式

| ID | 内容 | 計算列 |
| --- | --- | --- |
| `calculation-acceleration-interval` | 等加速度運動 | 前行との差分を時間差で割る区間平均速度、時刻の前行との平均 |
| `calculation-ohm-resistance` | オームの法則 | `R = 1000V/I`（電流を mA から A へ換算） |
| `calculation-hooke-regression` | フックの法則 | `F = mg`（質量 g を kg へ換算）、伸び cm を m へ換算 |
| `calculation-sensor-moving-average` | センサー時系列 | 前行との差分、直近3行の平均 |

### 等加速度運動

位置は `s = 2t + t²` (m)、時刻間隔は1 s、加速度は一定で `2 m/s²` と仮定しています。1行目は前行がないため、区間平均速度と区間中点時刻を `null` にします。横軸は区間中点時刻、縦軸は区間平均速度です。

### オームの法則

電圧 (V) と電流 (mA) の模擬値から抵抗 (Ω) を計算します。電流値は抵抗約200 Ωの関係に小さな決定的なばらつきを加えたものです。直線回帰は電流と電圧に適用し、残差グラフはその回帰を参照します。0 V の 0 A を含めず、抵抗の除算が未定義になる行を作らない設計です。

### フックの法則

質量は g、伸びは cm の元データとして残し、計算列で力 (N) と伸び (m) を作ります。`g = 9.8 m/s²`、ばね定数は一定、一次元の小さな伸びと仮定しています。回帰の横軸は力、縦軸は伸びです。

### センサー時系列

時刻間隔1 sの固定センサー値を用います。差分は1行目を `null`、3点移動平均は窓がそろわない最初の2行を `null` とします。生値・差分・移動平均を一つの数表に置き、比較設定の2枚の散布図が同じ系列の生値列と移動平均列を参照します。

## 参考にした標準的関係

関係式の確認には、次の公開教材を参照しました。数値データの取得や転載はしていません。

- [OpenStax, Projectile Motion（等加速度運動の式の一覧）](https://openstax.org/books/physics/pages/5-3-projectile-motion)
- [OpenStax, Ohm's Law: Resistance and Simple Circuits](https://openstax.org/books/college-physics-2e/pages/20-2-ohms-law-resistance-and-simple-circuits)
- [OpenStax, Elasticity: Stress and Strain](https://openstax.org/books/college-physics-2e/pages/5-3-elasticity-stress-and-strain)
