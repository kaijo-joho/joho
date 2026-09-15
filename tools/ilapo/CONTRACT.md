# イラポの内部契約（0.2）

開発担当 Codex。現在は計画②まで実装。既存アプリは変更しない。
ブラウザは通常の script タグで依存順に読み込む。各モジュールは globalThis と CommonJS の双方へ公開する。

文書: `{format:'kaijo-ilapo',version:1,id,name,pages:[page]}`。
ページ: `{id,name,board:{width,height,unit,infinite},objects:[object]}`。
幅・高さ・座標はCSS pxの小数。unitは表示単位px/mm/pt。無限ページにも書き出し用の初期width/heightを保持。
オブジェクト: `{id,type:'path'|'text',name,group:null|string,locked:false,matrix:[a,b,c,d,e,f],style}`。
pathは標準SVGの`d`、textは`x,y,runs:[{text,script:'normal'|'super'|'sub'}]`を追加する。
style: `{fill,stroke,strokeWidth,opacity,dash,linecap,linejoin,fontSize,fontFamily,bold,italic}`。
fill/strokeは#RRGGBBかnone、dashは''または数値を空白で区切る。fontFamilyはsans-serif/serif/monospace。
グループは初期版では同じgroup値を持つ平坦な集合。選択・変形は原則グループ全体へ適用。

## IlapoCore (core.js)

`uid(prefix?)`, `clone(value)`, `createDocument()`, `createPage(name?,board?)`, `boardPreset(key,landscape?)`, `presets`。
`validateDocument(input)` は検証済みの複製を返し不正時throw。読み込み時の黙った切り捨て不可。
`makeShape(kind,x,y,w,h,style?)` kind=rect/roundrect/ellipse/triangle/pentagon/line。
`makeText(x,y,text,style?)`。
`multiply(a,b)`, `transformObjects(page,ids,matrix)`, `expandSelection(page,ids)`, `duplicateObjects(page,ids,dx?,dy?)` は新ID配列を返す。
`groupObjects(page,ids)`, `ungroupObjects(page,ids)`, `removeObjects(page,ids)`, `reorderObjects(page,ids,mode)` mode=front/back/forward/backward。
`duplicatePage(doc,id)`, `removePage(doc,id)`, `movePage(doc,id,delta)`。
`History` new History(doc); `.document`, `.change(fn)` (cloneへfnして検証・1undo), `.undo()`, `.redo()`, `.replace(doc)`, `.canUndo`, `.canRedo`。無変更は履歴なし、例外時元文書保持。
`Store` new Store(storage); `.save(doc,kind)` kind=auto/saved, `.list()` [{kind,at,document}], 壊れた一方があっても他方を返す。保存失敗throw。

## IlapoSVG (svg.js)

`objectMarkup(object)` は表示用安全SVG文字列。
`exportPage(page,{selectionIds?,padding?}={})` 標準SVG文字列。無限ページはGeometry.boundsから全作品+余白。
`importSVG(text)` -> `{page,warnings:[]}`。外部通信/スクリプトは禁止、未対応要素は明示的にthrowかwarningsで呼び出し側が表示。通常SVG基本形状/path/text/g/transform対応。
`encodeProject(doc)` -> Uint8Array ZIP (fflate) 各ページSVG + manifest.json。`decodeProject(bytes)` ->検証済doc。
geometry正本は各SVG。manifestは文書/ページ情報、オブジェクトIDごとの名前・group・locked等の補足のみ。

## IlapoGeometry (geometry.js)

Paper.jsは同梱版を使用し、geometryは小さな独立scopeで図形計算だけを行う。
`bounds(object)` -> `{x,y,width,height}` 変形後。textは概算でよくDOM実測をUI側で優先。
`boolean(a,b,operation)` -> 新しいpath object。operation=unite/subtract/intersect。
`anchors(object)` -> パスの区間ごとの配列（検証用）。`moveAnchor(object,pathIndex,anchorIndex,dx,dy)` ->新object。

UIはeditor.jsとeditor.css/index.html。DOMの作品表示はSVG、選択枠等は別SVGグループ。保存前のプレビューはHistoryを変更しない。


## IlapoPathEdit (path-edit.js)

`inspect(object)` -> `[{closed,segments:[{point,handleIn,handleOut}]}]`。pointはworld座標、handleはworldの相対ベクトル。refsは`{id?,path,index}`。同じobject内の複数subpathを扱う。

- `moveAnchors(object,refs,dx,dy)`、`moveHandle(object,ref,'in'|'out',worldPoint,{independent?})`
- `nearest(object,worldPoint)` -> `{point,distance,path,index,t}`、区間なしはnull。tは曲線のtimeで、長さ比ではない。
- `addAnchor(object,worldPoint)` -> `{object,ref}`。最近点のtimeでベジェ曲線を分割し形を保つ。
- `deleteAnchors(object,refs,{open?})`。既定open=trueは選択点で切断、falseは接続削除。残る線がなければnull。
- `setAnchorType(object,refs,'corner'|'smooth')`、`roundCorners(object,refs,radius)`。角丸の半径はworldのpx、直線同士のみ。
- `openPath(object,ref)`、`closePaths(object,pathIndexes)`
- `joinEndpoints(a,refA,b,refB,'line'|'merge'|'smooth')`。aとbのidが同じ場合は同一objectのパスとして処理。
- `boolean(objects,'union'|'subtract'|'intersect')`。閉路のみ。最初に選んだobjectの書式を採用し、空結果はnull。

すべて非破壊で入力を変更しない。返すobjectは元（連結／合体は最初）のid/name/group/style/matrixを保持し、dだけを更新する。worldで判定・計算し、必要な結果は元matrixの逆でlocalへ戻す。保存形式version1は変えない。

## IlapoPathUI (path-ui.js)

`create(context)`でeditorに接続する。refs、選択区間、吸着ターゲットはUIだけが保持する。直接選択ツールは`direct`、図形全体は`select`。読み取り専用`IlapoEditor.getAnchors()`は現在のrefsの複製を返す。

## IlapoExport (export.js)

`png(page,{selectionIds?,padding?,scale?,background?})` -> Promise<Blob>。selectionIdsのnull/省略は全ページ。背景はtransparent/white。倍率はCSSpxに対する倍率。

`buildPrintHTML(pages,{title?,padding?})`は安全に生成したSVGを各sectionに置き、ページごとの@pageで寸法を指定する。pagesはPage配列（または{page}の配列）で、外部の生SVG文字列は受理しない。
`print(pages,options)`はiframeのフォントとレイアウトを待ってChrome印刷を開き、afterprintで片付ける。ユーザーは印刷画面でPDFに保存を選ぶ。画面UI・アンカー・グリッドは出力しない。
