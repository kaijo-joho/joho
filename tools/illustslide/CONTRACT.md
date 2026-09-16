# イラストスライド illustSlideの内部契約（0.4.6）

開発担当 Codex。現在は計画④まで実装。
ブラウザは通常の script タグで依存順に読み込む。計算・保存用のモジュールはglobalThisとCommonJSへ公開し、編集UIはブラウザ内で初期化する。

0.4.2から配置先は `tools/illustslide/`、保存名は `.illustslide.zip`。旧URLは案内ページを残し、旧 `.ilapo.zip`・保存キー・内部API・文書形式・SVG識別子は互換性を保つ。直接ファイル利用時のブラウザ保存は、旧ページでJSONとして取り出せる。

文書: `{format:'kaijo-ilapo',version:1|2|3,id,name,pages:[page]}`。version1/2を読み込める。image/connectorで最低version2、非空animationsでversion3へ上げる。上がったversionを下げず、引数は変更しない。
ページ: `{id,name,board:{width,height,unit,infinite},objects:[object],animations?:[animation]}`。
幅・高さ・座標はCSS pxの小数。unitは表示単位px/mm/pt。無限ページにも書き出し用の初期width/heightを保持。
オブジェクト: `{id,type:'path'|'text'|'image'|'connector',name,group:null|string,locked:false,matrix:[a,b,c,d,e,f],style}`。
pathは標準SVGの`d`、textは`x,y,runs:[{text,script:'normal'|'super'|'sub'}]`を追加する。
style: `{fill,stroke,strokeWidth,opacity,dash,linecap,linejoin,fontSize,fontFamily,bold,italic}`。
fill/strokeは#RRGGBBかnone、dashは''または数値を空白で区切る。fontFamilyはsans-serif/serif/monospace。
グループは初期版では同じgroup値を持つ平坦な集合。選択・変形は原則グループ全体へ適用。

## IlapoCore (core.js)

`uid(prefix?)`, `clone(value)`, `createDocument()`, `createPage(name?,board?)`, `boardPreset(key,landscape?)`, `presets`。
`validateDocument(input)` は検証済みの複製を返し不正時throw。読み込み時の黙った切り捨て不可。
`makeShape(kind,x,y,w,h,style?)` kind=rect/roundrect/ellipse/triangle/pentagon/diamond/parallelogram/arrow/callout/line。
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
version1ではgeometry正本は各SVG。manifestは文書/ページ情報、オブジェクトIDごとの名前・group・locked等の補足のみ。

version2ではimageのreferenceフラグもmetadataに保存。connectorは接続モデル全体をmetadataに持ち、SVG内には`data-ilapo-connector`グループで通常のpath/textへ展開する。native ZIPは検証したモデルを復元し、通常SVGはグループ化された線・文字として取り込む。XMLの全要素の安全性検査はnativeでも省かない。

`exportPage`の`includeReferences:true`はnative ZIP用。既定falseは参照画像を省く。imageのsrcはPNG/JPEG/WebPのbase64データURLだけを許し、外部URL・埋め込みSVGを拒否する。ZIPのページファイル名はpage.idをencodeURIComponentしたものとする。

## IlapoGeometry (geometry.js)

Paper.jsは同梱版を使用し、geometryは小さな独立scopeで図形計算だけを行う。
`bounds(object)` -> `{x,y,width,height}` 変形後。textは概算でよくDOM実測をUI側で優先。
`boolean(a,b,operation)` -> 新しいpath object。operation=unite/subtract/intersect。
`anchors(object)` -> パスの区間ごとの配列（検証用）。`moveAnchor(object,pathIndex,anchorIndex,dx,dy)` ->新object。

UIはeditor.jsとeditor.css/index.html。DOMの作品表示はSVG、選択枠等は別SVGグループ。保存前のプレビューはHistoryを変更しない。

## IlapoInspector（inspector.js / inspector.css）

`create({onLayout,clearPreview,isBusy})` は `show(request)`、`close({focus?:boolean})`、`reset()`、`sync()` と読み取り専用の `section`・`isOpen`・`root` を返す。
requestは `{section,title,html,label,apply,preview?,scope,refresh,opener}`。labelがnullなら適用・取消フッターを表示しない。htmlはeditor側でエスケープしたフォーム断片だけを渡す。

- showModal・暗幕・inert・Tabの閉じ込めを使わない。通常は右側、850px以下は下部へ配置し、キャンバスと別の領域を確保する。ページ一覧はpages、図形一覧はobjects、アイコン・部品はassetsセクションを使い、設定と同じパネルの内容を切り替える。書き出しとは排他的、共通ヘルプとは独立して開く。
- scopeは文書ID・ページID・選択ID・編集リビジョンを含み、アンカー座標では選択点、表示設定では設定値も含む。syncと適用直前に比較し、古い対象への入力を別の対象へ適用しない。ドラッグ中の更新は終了まで待ち、閉じた後の非同期再構築で再度開かない。
- 色・変形・接続・画像のpreviewは検証済みの文書複製から表示用ページを作り、editorのinspectorPreviewだけを更新する。History・文書本体・保存・dirtyを変更しない。不正入力では前回のプレビューも取り消す。適用時だけ通常のchangePageで1履歴にまとめる。
- 適用・取消・対象切替ではフォームを現在の値から作り直す。変形の基準座標や回転・反転の入力を持ち越さない。再構築後は可能な範囲で入力フォーカス・本文スクロール・detailsの開閉を保つ。閉じたパネルの本文は空にし、重複IDを残さない。
- 幅は `kaijo-ilapo:inspector` にCSS pxの数値文字列で保存し、作品データや既存設定形式と分ける。既定320px、220〜520pxかつキャンバス幅を確保できる範囲。モバイル表示だけを理由に保存幅を縮めない。
- パネル内のキーをキャンバス操作へ伝えない。Escapeはリサイズ取消を先に扱い、通常はパネルを閉じる。閉じたらパネル外の起点へ戻し、「キャンバスへ戻る」は開いたまま編集面へフォーカスを移す。

## ページ一覧・選択サブメニュー（0.4.4）

`IlapoPagesUI.create({document,page,selectPage,change,showInspector,showDialog,esc,icon})` は `open()` を返す。ページIDを対象に操作し、DOMの一覧番号を文書参照の正本にしない。切替は選択・編集中のプレビューを解除して表示範囲を合わせ、Historyを変えない。変更は既存のCore/Historyを通す。サムネイルは検証済みページのSVG出力で、下絵を除外する。

pagesのscopeは文書ID・ページID・編集リビジョン。図形の選択だけでは一覧を作り直さず、編集確定時に更新する。右端「ページ」はpagesだけ、「図形」はobjects、「設定」は残りの設定セクションの開閉状態をaria-expandedで示す。文書の入れ替え後に古い一覧のイベントで別の文書を編集しない。

選択バーのdata-menuボタンはマウスpointerenterで開く。ドラッグ・タッチ・モーダル表示中にはホバー起動しない。開くだけではフォーカスを動かさず、ポップアップへの移動を妨げないため閉鎖だけ240ms待つ。クリックやキーボードで開いたメニューは外側クリック・実行・Escapeまで保持する。高さは起点の上／下にある空間から計算し、ボタンへ重ねない。ホバーメニュー表示中のEscapeはパネルやキャンバスへ伝えない。

`IlapoObjectsUI.create({document,page,selected,select,showInspector,esc,icon})` は `open()` を返す。objectsのscopeは文書ID・ページID・編集リビジョン・選択ID。前面から並べ、固定とグループを表示する。選択はeditorのselectionを通してグループ展開を保ち、文書や履歴を変更しない。クリック／Shift追加／上下・Home/End／Enter・Spaceを使用し、再描画後もIDでフォーカスを復元する。

## IlapoAssetsUI（assets-ui.js）

`create(ctx)` -> `{open,focusRegistration}`。`assets`インスペクタで組み込みアイコン、自作部品、登録、JSON保存・追加を扱う。`ctx`はdocument/page/selected/library/insertionPoint/insertObjects/showInspector/showDialog/isOpen/esc/icon/toast/downloadを渡す。配置は既存の文書変更経路を使い、登録・削除・JSON追加はlibraryだけを更新する。

登録対象は呼出し時点の選択全体。文書ID・ページID・選択IDの組で入力名を保持し、同じ選択の編集ではプレビューだけを更新する。選択変更とパネルの再開では入力名を空にする。EnterはIME変換中を除いて登録し、未選択・下絵を含む・200図形超・100部品・保存不能時は無効。登録前に対象の一致を再確認し、失敗時は入力と保存済みデータを保持する。登録データにアニメーションは含めない。

JSON追加は一時libraryで検証し、読み込み完了後に取得した既存データへ新しい部品IDで追加して原子的に保存する。完了時の再描画はassetsパネルが開いている場合だけ。削除確認が閉じた後に一覧を更新し、次の部品または追加ボタンへフォーカスを移す。サムネイルはIDごとに保持し、削除時に破棄する。既存の保存キー・JSONのversionは変更しない。

## 接続矢印・画像・部品・発表

connectorのmatrixは常に単位行列。追加フィールドは`from,to,waypoints,route,startArrow,endArrow,label,labelOffset`。
端点は`{x,y,objectId:null|string,port:'auto'|'top'|'right'|'bottom'|'left',ratio:0..1,normal?:{x,y}}`。x/yとnormalは直近のworld座標・接続方向のキャッシュ。参照先は同じページの非connectorオブジェクト。ratioは図形のローカル境界での辺内の位置で、端点は実輪郭まで伸ばす。
waypointsはworld座標`{x,y}`の配列（最大100）。routeはstraight/orthogonal、矢じりはnone/triangle/open、labelは2000文字以下、labelOffsetはworldの相対座標。normalは回転した図形の直角線の出入り方向にも使う。

`IlapoConnectors.make(from,to,options)`, `sync(page)`（キャッシュ更新・切れた参照解除）, `points(connector,page?)`, `renderedParts(connector,page?)`, `bounds(connector,visual?,page?)`, `transform(connector,matrix)`（非破壊）。transformは端点・点・ラベルずれを変換し、matrixは単位行列を保つ。Coreの移動・複製にも同じ座標モデルを使い、編集確定後とプレビュー時にsyncする。

0.4.5のsyncは旧端点とnormalから現在の図形上で同じ方向の輪郭点を求め、その差分でwaypointsを移動してから端点を再解決する。軸ごとに旧from→to内の位置を0〜1へclampして差分を補間し、端点間の幅がほぼ0なら1/2。自由端・消えた参照先の差分は0。normalのない初回は経路を移動せず端点だけ更新する。小数誤差の1e-7以内は差分0とし、同じ形状での再計算による移動を防ぐ。データの追加項目・versionの変更はない。

Core.transformObjectとConnectors.transformは端点・点を変換したらnormalを破棄する。これにより、選択した矢印を含む移動・複製でsyncが点を二重に動かさない。図形の辺・接続先を変更するUIも旧normalを引き継がず、変更後にsyncする。

直角経路は各waypointの間を水平・垂直線で結び、端点の出入り方向を満たす候補から短い経路を選ぶ。向かい合うポートの中間の折れ曲がりを優先する。明示waypointを通り、一般の障害物回避は行わない。
`moveSegment(connector,index,position)`は描画経路のindex番目の線を垂直方向へずらし、両端を保ってwaypointsへ反映した複製を返す。移動量0は変更なし、100点超過はthrow。
`portPoint(object,port,ratio)`は輪郭上のworld点、`attachmentAt(object,worldPoint)`はローカルの辺・比率から求めた端点を返す。UIの吸着候補と接続先ハイライトは文書・SVG出力へ保存しない。左パレットのconnectorは直線、connector-orthogonalは直角で作成する。

imageは`x,y,width,height,src,reference`を追加する。reference=trueは下絵で通常の出力から除外するが、編集用ファイルには保存する。lockedは普通のオブジェクトと同じ意味。元画像の画素と表示寸法を分ける。

`IlapoAssets.icons()`, `instantiateIcon(id,{x,y,size})`, `createLibrary(storage)`, `imageFromFile(file,{x,y,maxWidth,maxHeight})`。
libraryのlist/save/remove/instantiate/exportJSON/importJSONは原子的に保存する。sizeは挿入時の最長辺px。UIの「部品集を追加」は既存の部品を保持し、新しい部品IDで追加する。ライブラリ形式は`{format:'kaijo-ilapo-components',version:1,components:[{id,name,objects}]}`。配置後は元の部品に依存しない。

`IlapoPresentation.open(doc,{pageId?,opener?})`は検証・複製した文書を表示し、next/previous/close/getStateを返す。図形編集と独立し、発表のキー操作を編集画面へ伝えない。自由キャンバスの表示比率は書き出したSVGのviewBoxから取る。自分で開始した全画面だけを終了し、モーダルを閉じたら元のフォーカスとbody overflowへ戻す。

全画面の対象は `.ilapo-present-viewport`。dialog自体やdocumentElementは対象にせず、ヘッダー・操作列・編集画面を含めない。fullscreenchange時に余白なしの最大サイズへ再計算し、paperへフォーカスを移す。全画面中のTabはpaperに留める。通常表示では操作列と従来の余白を保つ。同じpresentation.js/CSSを再生用HTMLへ同梱する。


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


## アニメーション（version3）

page.animationsは省略可。効果は共通で `{id,targets:[objectId],effect,trigger,duration,delay}`。
effect=fade/wipe/color/move、trigger=click/with/after、duration/delayは0〜10000ミリ秒。
追加フィールドはfade:`{mode:'in'|'out'}`、wipe:`{mode,direction:'left'|'right'|'up'|'down'}`、
color:`{channel:'fill'|'stroke',color:'#RRGGBB'}`、move:`{dx,dy}`（CSS px）。
効果に無関係なキー、重複ID、空対象、他ページや存在しない対象を拒否する。下絵への効果と画像の色変更、connectorのfill色変更は禁止する。
ページ1000件・文書5000件・効果対象5000個まで。limitsは実用的なフレームレートの保証ではない。

Core.validateAnimation(value,page)は検証済み複製。pruneAnimations(page)は削除・下絵化された対象と空効果を除去する。History.changeのfn後もpruneし、通常のvalidateDocumentと読み込みは不正参照を拒否する。
図形の部分複製は対象の交差だけを新IDへ写し、効果IDも新しくする。ページ複製は全対象を写す。
ZIPのページmetadata.animationsへ保存し、未設定と空配列を区別して往復する。SVGにはアニメーションを含めない。

IlapoAnimation.compile(page) -> `{groups:[{index,duration,items:[{animation,start,end,fromColors?}]}],steps}`。
group0は最初のclick前の自動効果。clickで次のgroup、withは直前のstart、afterは直前のendにdelayを加える。durationは各群の最大end。
frame(page,step,time=Infinity,{plan?}) -> `{page,visuals}` は非破壊。過去の群を完了・現在の群だけ時刻評価・未来は未適用。最初の表示効果がinの対象だけ初期非表示。
visualsはnull-prototype辞書、値は `{opacity,reveal:null|{fraction,direction,animationId}}`。opacityは元style.opacityへの倍率。wipeはopacity1でclipだけを縮め、animationIdで複数対象のworld境界を共有する。
moveはworld移動量の累積。colorは開始時の色からRGB線形補間。同じ表示／色の項目では一覧の後を優先する。色なし→色は開始後に即時切替。
planは同じpageから作ったものだけを使う。再生は時間関数から毎回求め、DOMの前回状態を計算の入力にしない。

IlapoAnimationPlayer.create(paper,page,{onChange?}) -> next/previous/reset/seek(step,time?)/finish/getState/destroy/svg。
getStateはstep/steps/playing/time/duration。next/previousは群を操作できたかbooleanを返す。次へを再生途中に押すと完了。前へは前群の完了時点、resetはgroup0から再生する。
RAFを所有し、close/reset/seekで取り消す。reduced-motionは群を即完了する。frameの複製だけをK.syncして移動中の接続を描き直す。下絵・編集枠・ハンドルを表示しない。

Presentationの返却APIにreset/seekを追加し、getState.animationにPlayer状態を入れる。群の前後が尽きたらページを切り替える。前ページは全効果後、次ページは初期状態。Homeは先頭の初期状態、Endは最終の全効果後。
IlapoAnimationUI.create(ctx)のlist/edit(id?)は設定パネルのanimationセクションを利用する。プレビューは未確定pageだけの検証済み複製をPresentationへ渡す。
IlapoPlaybackExport.buildHTML(doc)はPromise<string>。アプリと同じ配信元の固定されたruntimeファイルだけを読み込み、JSONのHTML終了タグとUnicode行区切りをエスケープして埋め込む。下絵を除いた文書・埋め込み画像・CSS・Paper.jsのライセンスを同梱し、生成HTMLは外部通信を必要としない。
