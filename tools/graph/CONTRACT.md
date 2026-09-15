# グラフエディタ 0.1 実装契約（初版の記録）

現行0.2の追加仕様・version 2への移行は [0.2実装契約](docs/phase2-contract.md) を優先する。

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

上部1行、狭い幅はメニュー。左は数式・数表の追加と対象の一覧、選択した対象の式・表・書式・表示範囲の編集はキャンバス上のポップアップから。右のタブでテンプレートと書き出し。共通非モーダルヘルプ。テーマ3種類、文字3段階。

初版は2D関数、3D曲面、2D/3D点列、パラメーター、数表/CSV、基本テンプレート、ブラウザ/ローカルの自動・明示保存、PNG/2D SVG。陰関数、媒介変数、CAS、回帰、誤差棒は後続段階。
