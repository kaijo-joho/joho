# グラフエディタ 0.1 実装契約（初版の記録）

現行0.22.0の複数文書・保存先・終了確認と右側タブは [複数文書と右側タブ](docs/document-tabs.md) を参照する。0.21.0の上部共通仕様への適用は [上部ツールバー](docs/toolbar-layout.md) を参照する。保存形式はversion 14を維持する。

0.20.1のデータ取り込みモーダルの高さ固定、0.20.0の書式スライダー・直接色選択・数表のセル選択と、0.19.0のタブ付き編集画面は [編集画面の整理](docs/dialog-usability.md) を参照する。0.18.0の軸別拡大率と散布図行列は [軸スライダー・散布図行列](docs/axis-zoom-matrix.md) を参照する。

0.17.0のPNGコピー・プレビュー・出典出力・テンプレート拡充は [教材出力・ライブラリの仕様](docs/publication-library-contract.md) を参照する。

0.16.0の計算列・前後の行参照とversion 13への移行は [計算列の仕様](docs/calculated-columns.md) を参照する。

0.14.0の複数選択・書式コピー、日付・カテゴリ列とversion 11への移行は [追加仕様](docs/selection-typed-tables.md) を参照する。

0.13.0の右インスペクター・一覧操作・追加メニュー・ズーム操作は [右インスペクターの配置契約](docs/inspector-layout.md) を参照する。

0.10.0のオープンデータ取込は [取込仕様](docs/open-data-import-plan.md) を参照。文書version 10を維持し、出典は既存の `source` に保存する。0.9.0の分析グラフ編集・行選択・回帰除外は [グラフ編集・行選択の契約](docs/chart-editing-row-link-contract.md) を参照。0.8.0から継続する分析グラフ・自作テンプレート・比較配置は [分析グラフ・テンプレート・比較の契約](docs/statistical-charts-contract.md) を、0.7.0から継続する数表・統計・回帰連携・教材出力は [数表・統計・教材出力契約](docs/tables-publication-contract.md) を参照する。この文書は旧版の履歴として保持する。

0.5.0までの追加仕様・version 6への移行の記録は [0.2実装契約](docs/phase2-contract.md)、[0.3実装契約](docs/phase3-contract.md)、[交点と操作性の調整](docs/usability-contract.md)、[線分による領域](docs/regions-contract.md)、[曲線による領域](docs/curve-regions-contract.md) に残す。

新規の独立ツール。既存アプリは参照のみ。通常のブラウザ内処理で完結し、授業管理機能は対象外。

## 文書

```js
{format:'kaijo-graph',version:1,name:'無題のグラフ',mode:'2d',angle:'rad',
 axes:{x:{label:'x',unit:'',min:-10,max:10,scale:'linear'},
       y:{label:'y',unit:'',min:-10,max:10,scale:'linear'},
       z:{label:'z',unit:'',min:-10,max:10,scale:'linear'}},
 equalScale:false,grid:true,legend:true,parameters:[],series:[]}
```

- mode: `2d` / `3d`、angle: `rad` / `deg`。scale: `linear` / `log`（logは正の範囲）。
- parameter: `{name:'a',value:1,min:-5,max:5,step:0.1}`。x,y,z,e,piや関数名を予約する。
- series: `{id,kind,name,expression,domain:{x:[-10,10],y:[-10,10]},rows:[],visible:true,style:{color:'#2563eb',width:2,dash:'solid',points:false,lines:true,opacity:0.85},source:{kind:'user',title:'',url:'',notes:''}}`
- kind: `function`（y=f(x)）、`surface`（z=f(x,y)）、`data2d`（x,y数表）、`data3d`（x,y,z数表）。表のrowsは数値配列の配列。欠測はnullを含む行として線を切る。
- source.kind: `user` / `reference` / `model`。出典URLはhttpsのみか空。外部の内容は実行しない。
- 図の描画結果を正本にせず、元の数式・数値・単位・出典を保持する。

## 分担API

ブラウザは通常script、NodeはCommonJS。ビルド不要。

- `GraphExpression.compile(expression,{variables:['x','a'],angle:'rad',target:'y'})` → `{evaluate(scope)}`。targetは2Dがy、3Dがz。エラーは日本語。eval/new Functionは禁止。
- `GraphCore.createDocument()` / `createSeries(kind)` / `validateDocument(input)` / `clone(value)` / `uid()`。
- `GraphCore.History(document)`：`.document`、`.change(mutator)`、`.replace(doc)`、`.undo()`、`.redo()`、`.canUndo`、`.canRedo`。
- `GraphCore.Store(storage)`：`.save(kind,doc)`、`.load(kind)`、`.list()`。kindは`auto`/`saved`、loadは`{document,at}`またはnull。listは`[{kind,at,name}]`。自動保存と明示保存は別々に保持。
- `GraphCore.parseTable(text,dimensions)` → rows。CSV/TSV、任意の先頭見出し行、空欄はnull。厳密な数値、不正行はエラー。
- `GraphCore.tableCSV(rows,headers)` → text。
- `GraphPlot.sampleFunction(series,doc)` / `sampleSurface(series,doc)` → 描画用配列。サンプル数は上限を持ち、不連続・未定義領域は接続しない。
- `GraphPlot.render(element,doc,{dark:false,onSelect(id),onViewChange(view)})` → Promise。Plotlyイベントのハンドラーを重複させない。Plotly既定ツールバー・外部リンクは非表示。2D/3Dの切替で該当種類を表示。
- `GraphPlot.exportImage(element,{format:'svg'|'png',scale:2,background:'white'|'transparent'})` → data URL。SVGは2Dのみで、3D時は明確なエラー。
- `GraphPlot.resetView(element,doc)` / `resize(element)`。
- `GraphTemplates.list()`：`[{id,name,category,description,document}]` の深いコピー。文書に図の元データと出典を含める。

## 操作の構成

上部1行、狭い幅はメニュー。追加は左の1つの「＋追加」に集約し、選択対象は右ペインの「書式」タブで編集する。右のタブでテンプレートと書き出しを扱い、共通非モーダルヘルプを使う。詳細な配置・並べ替え・ズーム操作は [右インスペクターの配置契約](docs/inspector-layout.md) に従う。

初版は2D関数、3D曲面、2D/3D点列、パラメーター、数表/CSV、基本テンプレート、ブラウザ/ローカルの自動・明示保存、PNG/2D SVG。陰関数、媒介変数、CAS、回帰、誤差棒は後続段階。
