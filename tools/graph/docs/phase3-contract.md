# 0.3 実装契約（2026-09-16）

承認範囲は①任意の軸記号と数式連動、②注釈・目盛・配置・点のドラッグ。追加依頼の接線同士の交点、座標2点の線分、線分の接続も含む。閉じた線分による領域・塗りつぶしは③で実装する。

## 文書と責務

- 文書 version 3。v1/v2を移行し、既存の式・数表・出典・保存キー・履歴を保持。新種類の混入した旧版を黙って削らない。
- 軸は内部キー x/y/z を維持し、各軸に `symbol:'x'` と `ticks:{step:null,format:'auto'}` を追加。format は auto/decimal/fraction/pi。step は実座標単位の正数またはnull。label は表示名、symbol は入力記号、unit は表示単位。
- 保存する数式は従来の x/y/z を用いる正規形。表示と入力の境界だけ GraphSymbols で変換。軸を改名しても数値・位置・式の意味は変わらない。表示名だけの変更は入力記号を変えない。
- 軸symbolは英字・ギリシャ文字・日本語などUnicode識別子（空白・演算記号なし、先頭文字、最大32文字）。3軸間・係数名との重複と関数名/定数名を拒否。既存係数のASCII規則は維持。
- 媒介変数のtと極座標のthetaは各系列の局所的な変数。軸のsymbolをtにしても媒介変数成分のtを置換しない。係数との既存衝突チェックも維持する。

## GraphSymbols（新規 symbols.js、DOM非依存UMD）

- `validateAxes(axes,parameters)`：記号と衝突を検証し、失敗は日本語Error。
- `toCanonical(text,doc,kind)` / `toDisplay(text,doc,kind)`：function は x/y、surface は x/y/z、implicit は x/y、parametric/polar/scalar は軸記号を置換しない。日本語/Greekの識別子も単位ごとに処理。数値リテラル（1e3等）・関数名・係数の部分文字列を置換しない。πは入力時piへ、polarのθはthetaへ。xy等の未知識別子の意味は変更しない。
- `richText(text)`：HTMLをエスケープし、`v_0` / `v_{max}` / `m^2` / `m^{2}` だけを安全なsub/supとして表示。改行はbr。他の任意HTMLは不可。
- `formatTick(value,format)`：πの倍数、分数、小数の有限な文字列。`ticksFor(axis)` → `{tickmode:'array',tickvals,ticktext}` またはauto用 `{}`。logは既定Plotly目盛。手動step/formatの目盛数は最大200に間引き、有界。

## 注釈

全注釈に `label:{visible:true,dx:12,dy:-12,size:13}` を追加。dx/dyは右/下が正のpx、各-500〜500、size8〜48。

- 既存 point / guide / tangent / intersection は維持。
- `segment`：`from:'pointId',to:'pointId',arrows:'none'|'end'|'both'`。端点参照先はpointまたはtangentIntersection。異なるIDが必要。同じ座標に重ねただけでは接続扱いにせず、同じIDの端点を共有する。座標から追加するときはpoint2つとsegment1つを一括追加する。
- `tangentIntersection`：`tangentIds:['id1','id2']`。異なるtangent2つの無限直線としての交点。平行・数値的に区別不能・微分不可は理由を表示し保留。
- `text`：`anchor:{type:'free',x:'0',y:'0'},text:'説明'`（最大2000文字）。位置は係数を使える数式。表示はGraphSymbols.richText。矢印はsegment.arrowsで提供。
- 参照を二段階で検証し、配列順が変わっても有効。循環や不正な種類を拒否。3D表示中も注釈を保持。
- `GraphCore.removeAnnotation(doc,id)` と既存 removeSeries は依存する注釈を再帰的に一括削除。戻す操作でまとめて復元。

## GraphAnnotationsの拡張

- `evaluate` の従来戻り値 `{points,segments,warning}` を維持。textは配置点1個（描画側でマーカーを出さない）、segmentは両端の線分のみ、tangentIntersectionは点1個。
- `tangentLine(annotation,doc)` → `{point:[x,y],slope,warning:''}`、不可はpoint:null/slope:nullとwarning。evaluate接線と共用し、クリップ済みの線分から交点を求めない。
- `anchorForDrag(annotation,doc,[x,y])` → point/text用の新anchor、不可ならnull。point自由点は座標、曲線上の点はfunctionならx、媒介/極なら現在位置付近を含め有界探索で最近点のt/thetaを求める。曲線の定義域・区間を守る。係数を含む座標式/atはドラッグ不可（式を勝手に失わない）。数値座標は少なくとも12桁を保持する。
- 表示だけ非表示の端点も参照評価できる。参照先の削除・未定義は他の描画へ波及させない。

## 親の統合

plot.js/editor.js/index.html/editor.css：入力境界で記号変換、軸設定・目盛、注釈追加・接続・文字・矢印、ラベルの表示位置・サイズ、ドラッグ。ドラッグ中はプレビュー、確定時だけ1履歴・1保存。Escape/pointercancelは復元。選択した点/文字とラベルをドラッグでき、キーボードとダイアログも使える。

共有点を使う線分は点の移動に追従。線分選択から「終点から続ける」、既存点の選択で閉じた輪郭を作れる。③ではこの共有点IDの構造を使って領域を定義する。

旧機能・数値誤差・不正入力・v1/v2移行・再保存・Unicode記号・点/線分参照・取り消し・出力・狭幅を検証。Safariは既定どおり省略。

## 実装状況（0.3）

この契約の範囲は実装済み。`kaijo-graph` version 3へ保存し、version 1・2は既存内容を保持して移行する。軸の記号・表示名・単位は別の責務として扱い、保存する数式は正規形を維持する。

数値だけの自由点・文字注釈はドラッグできる。係数や演算を含む位置式・曲線上の位置式は、式を失わないためドラッグでは変更せず、ダイアログで編集する。共有点を使う線分の接続と終点からの継続は実装済みだが、閉じた線分から領域を作る機能と塗りつぶしは次段階の対象である。

検証は `tests/core.test.cjs`、`symbols.test.cjs`、`annotations.test.cjs`、`phase3-browser.test.cjs` を含むREADME記載の手順で行う。OSの実ファイル選択画面によるローカル自動保存は対象外とする。
