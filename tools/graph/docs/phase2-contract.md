# 0.2 の実装契約（2026-09-16）

ユーザーが承認した次段階：2Dの陰関数・媒介変数・極座標、点・補助線・接線・交点。既存3D曲面と数表は維持。3D空間曲線・陰曲面は今回の対象外。

## 文書 version 2

- `kaijo-graph` version 1を読み込み、既存の内容に `annotations:[]` を補ってversion 2へ移行する。保存はversion 2。旧ブラウザ保存キーは維持。未知の版・種類は読み込み前に拒否する。
- 既存のseriesの構成・意味を維持する。
- `implicit`: `expression:'x^2+y^2=9'`、`domain.x/y`で計算範囲。等号なしならF(x,y)=0、等号は最大1つ。独立変数はx,y。
- `parametric`: `expression:''`、`components:{x:'3*cos(t)',y:'2*sin(t)'}`、`interval:[0,2*Math.PI]`。独立変数はt。
- `polar`: `expression:'2*cos(3*theta)'`、`interval:[0,2*Math.PI]`。独立変数はtheta。θと三角関数は文書のrad/degに従う。
- `domain.x/y`、rows、style、sourceなどの共通項目は新しい種類にも残す。components/intervalは対応する種類だけが持つ。
- 既存文書の係数t/thetaを一律に禁止しない。parametricがある文書の係数t、polarがある文書の係数thetaは衝突としてエラー。新種類の独立変数が係数で上書きされないこと。
- `GraphExpression.compile(expr,{...,target:false})` は代入の等号を拒否。従来のtarget:'y'/'z'を保持。`GraphExpression.compileEquation(expr,{variables:['x','y',...],angle})` で左辺−右辺（等号なしはF−0）を評価する。

## 注釈 annotations

共通：`{id,kind,name,visible:true,style:{color:'#dc2626',width:1.5,dash:'dash',opacity:1}}`。2D専用。series/annotationsのIDは文書内で一意。最大100個。

- point: `anchor:{type:'free',x:'1',y:'2'}` または `anchor:{type:'curve',seriesId:'id',at:'1'}`、`projections:true`。curveはfunction/parametric/polarのみ。atは順にx,t,theta。freeの座標とatは係数を利用できる数式。
- guide: `axis:'x'|'y',value:'1'`。x=constantは縦、y=constantは横。valueは係数を利用できる数式。
- tangent: `seriesId:'id',at:'1'`。今回の接線対象は2D functionのみ。接点を含めて描く。有限の微分が数値的に確認できない場合は描かず理由を返す。
- intersection: `seriesIds:['id1','id2'],interval:[-5,5]`。今回の対象は異なる2D function同士。指定区間と双方のdomain内を検索する。有限個の交点を数値近似し、未定義点や漸近線を交点と判定しない。
- 参照不正は読み込み拒否。係数の現在値で位置が未定義のときは文書を保持し、その注釈の描画だけを保留する。
- `GraphCore.createAnnotation(kind)` と `GraphCore.removeSeries(document,id)`（指定系列と依存する注釈を一括削除）を追加。Undoでまとめて復元する。

## 数値モジュール

新しいモジュールはDOM/Plotlyに依存しないUMDとし、ブラウザglobalとNode requireに対応する。解析・評価は必ずGraphExpressionを利用する。

- `GraphCurves.sampleImplicit(series,doc)` / `sampleParametric(series,doc)` / `samplePolar(series,doc)` → `{x:[number|null],y:[number|null],warnings:[]}`。
- `GraphCurves.pointAt(series,doc,at)` → `[x,y]` または null。function/parametric/polarの指定位置。domain/intervalを尊重する。
- 陰関数は格子＋辺上の数値解から描画。格子境界や曖昧セルを扱い、1/x=0やtanの漸近線を偽の曲線にしない。評価回数/点数は有界。格子で捉えられない細部・重根・孤立点は限界を説明する。
- 媒介変数/極座標は有界な分割。未定義点やジャンプを線でつながない。極座標はrad/degの変換を一箇所で行う。
- `GraphAnnotations.evaluate(annotation,doc)` → `{points:[[x,y],...],segments:[[[x1,y1],[x2,y2]],...],warning:''}`。例外は他のグラフへ波及させない。文書・注釈を変更しない。projectionsは原点または表示範囲端へ縦横の読取線を出す。
- 数値微分は左右の整合も検査し、abs(x)のx=0で偽の水平接線を出さない。交点は残差を確認し、根の重複を除く。接する交点も検査し、数値計算で区別できない曲線は、その理由を返して交点の列挙を保留する。

## 描画とUI（親担当）

plot.jsは新モジュールの座標をtraceにし、全traceへ `meta:{objectType:'series'|'annotation',objectId}` を付ける。onSelectは既存系列用、onAnnotationSelectを新設。複数traceを使う注釈でも選択対象を取り違えない。renderの戻り値は `{warnings:[]}`。

左は追加と対象一覧、編集は選択時のポップアップ。既存の保存・配色・履歴・キーボード・非モーダルヘルプを共用する。新機能は2Dのみと明示。テンプレートに円（陰関数）、楕円（媒介変数）、極座標、接線・交点の例を追加する。
