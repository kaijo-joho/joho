# イラストスライド illustSlideの内部契約（0.4.22）

開発担当 Codex。初期4段階と、位置合わせ・図形管理・文字編集・アウトライン化まで実装。
ブラウザは通常の script タグで依存順に読み込む。計算・保存用のモジュールはglobalThisとCommonJSへ公開し、編集UIはブラウザ内で初期化する。

0.4.2から配置先は `tools/illustslide/`、保存名は `.illustslide.zip`。旧URLは案内ページを残し、旧 `.ilapo.zip`・保存キー・内部API・文書形式・SVG識別子は互換性を保つ。直接ファイル利用時のブラウザ保存は、旧ページでJSONとして取り出せる。

文書: `{format:'kaijo-ilapo',version:1|2|3|4|5|6|7,id,name,pages:[page]}`。version1〜6を読み込める。image/connectorで最低version2、非空animationsでversion3、text.layoutまたはpath.labelでversion4、text.runsまたはpath.label.runsにbold/italic/fill指定があればversion5、page.layersがあればversion6、object.styleまたはpath.label.styleにfillOpacity/strokeOpacityがあればversion7へ上げる。上がったversionを下げず、引数は変更しない。
ページ: `{id,name,board:{width,height,unit,infinite},objects:[object],animations?:[animation],layers?:[layer]}`。
幅・高さ・座標はCSS pxの小数。unitは表示単位px/mm/pt。無限ページにも書き出し用の初期width/heightを保持。
オブジェクト: `{id,type:'path'|'text'|'image'|'connector',name,group:null|string,locked:false,matrix:[a,b,c,d,e,f],style}`。
pathは標準SVGの`d`、textは`x,y,runs:[{text,script:'normal'|'super'|'sub',bold?:boolean,italic?:boolean,fill?:色}]`を追加する。部分書式は省略時に親styleを継承し、falseも明示値として保持する。fillは#RRGGBBまたはnone。
textの任意フィールド`layout:{width:null|正数,align:'left'|'center'|'right'}`は折り返し幅と揃え。pathの任意フィールド`label:{runs,style,align,padding}`は図形内の文章。paddingは0以上のCSS px。省略した既存文書に既定値を追加しない。runsは最大1000区間・合計100000 UTF-16コード単位。余分なキー、不正な書式・数値・揃えは拒否する。
style: `{fill,stroke,strokeWidth,opacity,fillOpacity?,strokeOpacity?,dash,linecap,linejoin,fontSize,fontFamily,bold,italic}`。
fillOpacity/strokeOpacityは0〜1の有限数値、省略時は1。DEFAULT_STYLEや旧文書へ自動補完しない。opacityは塗りと線を合成した後の全体不透明度として既存の意味を保持する。図形内文字はlabel.styleを使い、図形本体のチャンネル値を継承しない。
fill/strokeは#RRGGBBかnone、dashは''または数値を空白で区切る。fontFamilyはsans-serif/serif/monospace。
グループは初期版では同じgroup値を持つ平坦な集合。選択・変形は原則グループ全体へ適用。

## 通常選択とアンカー選択のメニュー（0.4.21）

renderSelectionActionsはtool=directで従来の表示条件を保持し、それ以外は通常選択用の目的別メニューを表示する。selection-transformは反転・90°回転・transformインスペクタ、selection-combineは複数パスの3演算、selection-groupは利用可能なグループ操作と単体にも使える固定を持つ。selection-moreは通常時の名称を「詳細」とし、アンカー時は従来の内容を維持する。PathUI.menuの第2引数includeCombine（省略時true）により、通常選択のアンカーメニューから合成の重複項目を省く。保存形式は変更しない。

右端のobjects-toggleとobjectsセクションは識別子・保存設定を保持し、表示名だけ「レイヤー」にする。各タブは固定のSVGと縦書きspanを持つ。--side-tab-widthは標準26px（--ui-size + 12px）、pointer:coarseでは44pxとし、app・inspector-openの全ブレークポイントと書き出しパネルの位置から共用する。

## 選択メニューの階層（0.4.20）

ルートは従来のcommand-menu、子はそのDOM内へappendするpopover=autoのcommand-submenu。各メニューの本文をmenu-contentへ分け、整列基準の再描画で子を除去しない。再描画で入れ替わった起点ボタンは再接続し、aria-expanded・配置・紫の基準枠を更新する。メニュー操作だけで文書や保存形式を変えない。

data-menuの入口に▼、data-submenuの入口に▶を表示する。選択バーと横に展開できる子メニューはマウスのホバーで開く。横に収まらず起点へ重なる子はホバーで開かず、クリック・タップ・右矢印で開く。子の戻る・左矢印・Escapeは1階層だけ閉じて起点へ戻し、ルートのEscapeは従来の起点へ戻す。上下・Home/Endは現在階層の有効ボタンだけを巡回する。select/inputは標準キー操作を維持する。外側操作・実行・ウィンドウサイズ変更では子も閉じる。

arrangeは整列6方向と等間隔2方向、arrange-detailsは基準の種類・基準図形・サイズ合わせを持つ。基準変更時は両方の本文を更新し、計算自体は既存IlapoArrangeを使う。selection-moreは旧editと旧selection-moreを統合し、重複操作を作らない。flip-h/vは既存aroundとCore.transformObjectsを使い、選択範囲の中心を基準とした反転を通常のchangePage経路で1履歴にする。文字やグループを含め全体を反転する操作で、点の編集状態では入口を隠す。

## 書式の入力部品（0.4.19）

色はパレット・native color input・16進数欄を使い、nativeピッカーにあるRGB数値欄をパネルへ重複して置かない。文字色・アニメーション色も同じ原則にする。色なし・混在・部分書式の既存の意味を維持する。

書式パネルのfillOpacity/strokeOpacity/opacity/strokeWidthはrangeと精密numberを同じpatchへ結ぶ。rangeの刻みは不透明度1%、線幅は通常0.1px、boardの幅・高さがともに72px以下なら0.01px。線幅の上限は通常20px、小用紙4pxと、対象の保存値の最大値を比較し、数値入力時も必要なら広げる。numberはstep=anyでモデルの有効範囲を受け付ける。rangeの表示丸めを文書へ戻さず、初期化・タブ切替で任意キーの補完や値の丸めをしない。混在はnumberを空欄・rangeを薄い表示とし、aria-valuetextでも示す。

dash/linecap/linejoinはaria-pressed付きの単一選択ボタン群とし、SVGプレビュー・aria-label・data-tip・選択名を持つ。対象に効く項目だけを表示し、従来の値・適用先の判定は変えない。カスタムdashもプレビューと名称を保持する。スライダーのpointerdownで入力の履歴groupを区切り、1回のドラッグ内のinput/changeは同じUndoへまとめる。書式ボタンは従来どおり離散操作として扱う。UI変更による文書形式の追加はない。

## IlapoArrange（arrange.js、0.4.17）

`collect(page,selectedIds,measure)` は選択順を保ち、平坦なグループを1単位とする `[{key,ids,label,b}]` を返す。`measure(ids,page)` で作品座標の外接範囲を求め、未知のIDは除く。`plan(units,mode,{reference,key,board})` は適用する `[{ids,matrix}]` だけを返す純粋計算で、入力を変更しない。

`reference` はobject／selection／board。左右・上下・各中央への整列では、指定keyの外接範囲／選択全体の外接範囲／原点0,0の用紙範囲を使う。boardだけは1単位でも位置整列でき、自由キャンバスでは拒否する。グループ内部の配置を維持する。distribute-x/yは3単位以上で辺間を等間隔にし、board以外では選択範囲の両端を保つ。width／height／sizeは2単位以上で、referenceに関係なくkeyの寸法に合わせる。各単位の中心を保ち、幅・高さが0の軸は拡縮しない。恒等変換は返さない。

editorで固定・非表示を判定し、計算結果を1回のchangePageへ渡す。接続の追従と履歴・自動保存は通常の編集経路を使う。基準の種類・基準図形はUI状態とし、作品形式を変更しない。選択IDの順序または文書・ページが変わったらkeyを選択の先頭へ戻す。メニュー内のselectは標準のキー操作を使い、方向アイコンはbuttonとaria-labelで操作する。紫の基準枠は編集専用SVG要素で、出力に含めない。

## IlapoCore (core.js)

`uid(prefix?)`, `clone(value)`, `createDocument()`, `createPage(name?,board?)`, `boardPreset(key,landscape?)`, `presets`。
`validateDocument(input)` は検証済みの複製を返し不正時throw。読み込み時の黙った切り捨て不可。
`makeShape(kind,x,y,w,h,style?)` kind=rect/roundrect/ellipse/triangle/pentagon/diamond/parallelogram/arrow/callout/line。
`makeText(x,y,text,style?)`。
`multiply(a,b)`, `transformObjects(page,ids,matrix)`, `expandSelection(page,ids)`, `duplicateObjects(page,ids,dx?,dy?)` は新ID配列を返す。
`groupObjects(page,ids)`, `ungroupObjects(page,ids)`, `removeObjects(page,ids)`, `reorderObjects(page,ids,mode)` mode=front/back/forward/backward。
`duplicatePage(doc,id)`, `removePage(doc,id)`, `movePage(doc,id,delta)`。
`History` new History(doc); `.document`, `.change(fn,{group}?)` (cloneへfnして検証、既定1undo・group指定時の連結は後述), `.undo()`, `.redo()`, `.replace(doc)`, `.canUndo`, `.canRedo`。無変更は履歴なし、例外時元文書保持。
`Store` new Store(storage); `.save(doc,kind)` kind=auto/saved, `.list()` [{kind,at,document}], 壊れた一方があっても他方を返す。保存失敗throw。

## IlapoLayers（layers.js、0.4.15）

`page.layers` は背面→前面順の `[{id,name,visible,locked,objectIds:[id]}]`。1〜100個。すべての図形がちょうど1つのレイヤーに属し、グループはレイヤーをまたがない。レイヤー内のobjectIdsは背面→前面順、全レイヤーを連結した順とpage.objectsを一致させる。不正なID・重複・所属漏れ・順序不一致は検証で拒否する。幾何情報は従来どおりobjectsに置く。

`list(page)`、`layerOf(page,objectOrId)`、`visible(page,objectOrId)`、`locked(page,objectOrId)`、`orderedObjects(page)`。layersなしのページには非破壊の仮想defaultレイヤーを返す。可視性はレイヤーで、固定は個別固定との論理和で判定する。
`create(page,name?)`、`rename(page,id,name)`、`setVisible(page,id,value)`、`setLocked(page,id,value)`、`move(page,id,delta)`（+1が前面）、`moveObjects(page,ids,targetId)`、`remove(page,id)`。削除は最後のレイヤーを拒否し、図形を隣へ移す。グループ移動は全構成員を扱う。これらの変更はeditorのHistoryを通す。
`reconcile(page,beforePage?,activeId?)` は削除済みの所属を除き、新規図形を現在レイヤーへ割り当てて順序を揃える。既存グループの所属を優先し、非表示・固定の現在レイヤーへの追加は拒否する。layersなしのページには何も追加しない。通常の図形操作は所属と順序を保持する。合体・連結・矢印変換・アウトライン化では増減した図形IDと所属を同時に更新する。
`forOutput(page)` は可視図形だけの複製を返し、動きの対象も絞る。元ページは変更しない。非表示だけを対象とする動きは取り除く。接続はフィルタ前の端点を保持し、出力用の複製で接続先不在を解消する。

追加先レイヤーは文書ID・ページIDごとのUI状態で、作品JSONやUndoには保存しない。単一レイヤーの図形選択で追加先を合わせる。レイヤーを直接選ぶと図形選択を解除する。ページ全体のプレビューを可視図形だけのデータで置き換えない。PathUI・ConnectorUI・OutlineUIへ `isVisible(object,page?)` / `isLocked(object,page?)` を注入し、Guides.prepareの第5引数は `{isVisible}` とする。

## IlapoSVG (svg.js)

`objectMarkup(object,options?)` は表示用安全SVG文字列。通常はpathの変形を表示用の座標へ反映し、作品座標の`strokeWidth`・`dash`を使う。カメラ・出力倍率には追従するが、図形の変形行列では線を再拡大しない。文字・画像の変形方法は従来どおり。
`exportPage(page,{selectionIds?,padding?}={})` 標準SVG文字列。無限ページはGeometry.boundsから全作品+余白。
`importSVG(text)` -> `{page,warnings:[]}`。外部通信/スクリプトは禁止、未対応要素は明示的にthrowかwarningsで呼び出し側が表示。通常SVG基本形状/path/text/g/transform対応。
`encodeProject(doc)` -> Uint8Array ZIP (fflate) 各ページSVG + manifest.json。`decodeProject(bytes)` ->検証済doc。
version1ではgeometry正本は各SVG。manifestは文書/ページ情報、オブジェクトIDごとの名前・group・locked等の補足のみ。

version2ではimageのreferenceフラグもmetadataに保存。connectorは接続モデル全体をmetadataに持ち、SVG内には`data-ilapo-connector`グループで通常のpath/textへ展開する。native ZIPは検証したモデルを復元し、通常SVGはグループ化された線・文字として取り込む。XMLの全要素の安全性検査はnativeでも省かない。

version4はmetadataの`text:{x,y,runs,layout}`で入力時の文章・揃え・幅を、`label`で図形内の文章・書式・余白を保持する。textのmatrix/style、pathのd/matrix/styleは従来どおりSVGを正本とする。通常SVGは行ごとに明示したtspanのx/yで表示し、再取り込みでは配置済みの行ごとのtextになる。native ZIPは著者のrunsとlayoutを復元する。図形ラベルは元pathから派生させ、表示用のpath本体だけをflattenする。派生文字には図形IDを付けず、groupとlabel textの所有者markerを検証して重複取り込みを防ぐ。markerやmetadataが欠損・重複・不一致なら拒否し、nativeでもXML監査を省略しない。

version5は部分書式の任意キーをrunsへ追加する。折り返し付き文字・図形ラベルは上記metadataで保持し、通常の文字はSVGのtspanを正本とする。部分書式がない古いrunへ不要な既定値を補わず、明示falseも保存する。

version6はmanifestの各ページにlayersを記録する。非表示の図形もnative SVGに保持し、復元後に所属・順序を含めて検証する。通常のSVGでは非表示図形を省く。

version7は塗りと線の不透明度をSVGのfill-opacity/stroke-opacityへ保存する。属性がない旧SVGは任意キーを補完せず、継承値と子の上書きをSVGの規則で扱う。全体opacityとの乗算を各属性へ焼き込まない。path.label.styleとconnectorは既存のmetadataにも保持する。connectorの矢じりの塗り・輪郭およびラベルにはstrokeOpacityを対応付ける。通常のSVGでtspanごとに不透明度が異なる入力は、未対応として拒否する。

`exportPage`の`includeReferences:true`と`includeHidden:true`はnative ZIP用。既定falseは参照画像を省く。imageのsrcはPNG/JPEG/WebPのbase64データURLだけを許し、外部URL・埋め込みSVGを拒否する。ZIPのページファイル名はpage.idをencodeURIComponentしたものとする。

native ZIPでは`rawTransforms:true`も指定し、元のd・matrix・styleを各SVGへそのまま保持する。表示・通常SVG・PNG・PDF・発表はこの指定を使わない。外部アプリで線幅まで一致する持ち出しには通常のSVGを書き出す。

外部SVGのパスはviewBoxを含む全変形から一様倍率を求め、線幅・破線長を作品座標へ正規化する。線がある非等方変形・せん断は明示的に拒否し、元の作品を置き換えない。`preserveCoordinates`のnative読込と`data-ilapo-page-id`を持つ旧版を含む自アプリSVGは保存済みの線幅をそのまま復元する。XML安全性検査はすべての場合で維持する。

## アウトライン化（0.4.10）

`IlapoStrokeOutline.path(path,options?)` は元オブジェクトを変更せず、作品座標の線を塗る通常の非ゼロ規則の複合パス文字列を返す。可視の輪郭がない場合はnull。Paper.jsの専用scopeを再利用する。曲線を線幅に応じて分割し、線端・角・破線を展開してBoolean unionで内部境界を除く。MAX_CURVES=2048、MAX_POINTS=4096、破線走査2048、結合部品2048、最終pathLength100000の制限を持つ。異常値・過大な分割は処理前または生成中にthrowする。

`IlapoTextOutline.fonts()` は `{id,label}` の候補、`prepare('sans'|'serif')` は書体の読み込みPromise、`convert(text,{fontId})` は準備済み書体を使う同期処理で `{objects:[path],fontId,fontLabel,sourceKind,ownerId}` を返す。同じ有効色・太字・斜体の連続区間を複合パスにまとめ、ローカル座標のdと元matrix/styleを返す。異なる部分書式は複数パスとなる。図形ラベルと接続ラベルも派生textとして受け取れる。未準備・欠字・空白のみ・上限超過はthrow。prepare失敗のPromiseをキャッシュに残さず再試行可能にする。

opentype.js 1.3.4を同梱し、フォントは同じ配信元のWOFF1を必要時だけ取得する。フォントの固定版・ハッシュ・OFLはfonts/README.md。任意フォントのアップロードやOSフォントの取得は行わない。TextLayoutへ同梱書体のadvance幅を渡して揃え・折返しを計算し、通常の編集文字のgeneric fontFamilyは変更しない。変換用書体の差異をUIで明示する。字形は最大2000・d文字列は90000。斜体は基線周りのshear 0.2。

`IlapoOutline.inspect(page,ids)` は変換可能な線・文字の数と固定・画像の有無を返す。`convertPage(page,ids,{lines,text,fontId})` はページを複製・検証してから選択グループ全体を処理し、`{page,ids,converted,warnings}` を返す。入力は変更しない。固定を含む選択、100オブジェクト超過、1件でも変換不能なら一括でthrow。最初の生成物が元IDを継ぎ、他の部分に新ID、必要に応じて共通groupを付ける。線の生成物はstrokeOpacityをfillOpacityへ写す。全体opacity<1かつstrokeOpacity=1では塗りから重なりを引き算して二重合成を避ける。半透明の線は下の塗りを透かすため切り抜かず、全体opacityも1未満なら濃さが変わり得る旨をwarningsへ返す。文字の線はローカルで輪郭化してから元matrixを適用し、パスの固定線幅とは区別する。

接続矢印はrenderedPartsを通常の図形にする。移動・フェード・ワイプは生成物の全IDへ引き継ぐ。色の効果は元fill/strokeから生成物のfill/strokeへ対応付け、同じ動きが2つのchannelへ分かれる場合は後半をtrigger=with,delay=0として元の時刻を維持する。対象がなくなった色の動きは警告して解除する。分割した図形のフェードは重なり部分の合成が変わり得るため警告する。元IDへ接続する未変換矢印は接続先を保持し、座標系が変わった手動接続を再計算する。

`IlapoOutlineUI.create(ctx).open()` は選択ポップアップから右インスペクタへ表示する。元ページ・選択ID・revision scopeとDOMアンカーを保持し、読み込み世代と選択書体の一致を確認してからプレビューする。閉じる・再度開く・対象/ページ/作品変更・リセット後に古いPromiseの結果を適用しない。プレビュー中は文書・履歴・保存を変えず、キャッシュ済みの変換結果を1回のchangePageで確定する。適用後は結果を選択しパネルを閉じる。

## IlapoGeometry (geometry.js)

Paper.jsは同梱版を使用し、geometryは小さな独立scopeで図形計算だけを行う。
`bounds(object)` -> `{x,y,width,height}` 変形後。折り返す文字はTextLayoutを使い、通常文字はブラウザ上でrunごとの太字・斜体も含めたSVGを計測する。DOMのない環境は概算。
`visualBounds(object)`は描画と同じ作品座標の線幅を含む境界を返す。`flattenedPath(object)`は元モデルを変更せず、変形後のdと単位行列を持つ表示用pathを返す。線を拡大しない平行移動だけなら元objectを利用する。
`boolean(a,b,operation)` -> 新しいpath object。operation=unite/subtract/intersect。
`anchors(object)` -> パスの区間ごとの配列（検証用）。`moveAnchor(object,pathIndex,anchorIndex,dx,dy)` ->新object。

UIはeditor.jsとeditor.css/index.html。DOMの作品表示はSVG、選択枠等は別SVGグループ。保存前のプレビューはHistoryを変更しない。

## IlapoTextLayout / IlapoTextUI（0.4.9）

`layout(text,options?)`は行ごとの`x,y,width,runs`と`bounds,inkBounds`を返す。DOMを変更しない。Canvasの文字計測を使い、テストでは`options.measure`を注入できる。書式の境界をまたぐ書記素も分割せず、日本語・空行・上付き下付きの位置を同じ計算で画面とSVGへ渡す。width:nullは最長行を基準に整列する。x/yは最初の行の基準位置。

`shapeText(path)`は保存しない派生textを返す。元のローカル外接範囲に軸方向の実倍率を適用して文字幅を求め、行列からその倍率を除いて文字の太さ・サイズを維持する。回転・反転は引き継ぐ。図形の高さ中央へ配置するが、輪郭に沿う流し込みはしない。過大な余白は表示時に軸ごとに制限し、著者の指定値は保存したままにする。pathの`bounds`は図形本体を返し、`visualBounds`ははみ出たラベルの描画範囲も含める。

文字UIは右のtextセクション。0.4.14の`IlapoRichText.create(element,options)`がcontenteditableのDOM Rangeとrunsを対応付け、部分書式をUTF-16選択範囲から書記素単位へ広げて適用する。表示DOMには検証済みのspanとtextContentだけを使い、貼り付けはtext/plainを取得する。範囲なしの書式は次の入力へ適用し、全文変更は明示的な全文選択を使う。size/family/alignは親style/layoutへ適用する。

compositionstartから最終inputまでDOMを再描画しない。compositionend後のタイマーで確定文字を読み、data-rich-composingを外してchangeを発火する。Inspectorはこのフラグ中の即時反映を待ち、追加のEnterなしで確定内容を保存する。Enterは改行。入力欄の破棄・ページや対象切替後に古いタイマーを適用しない。通常の即時反映・欄ごとのUndoに従い、新規文字は最初の有効入力で1個だけ追加する。閉じても反映済みの文字は保持する。

`IlapoTextMarkdown.parse(source)`は`{runs,diagnostics}`を返す独立した変換器。GAS/cmn/markdown.jsのインライン記法（太字・斜体・上付き・下付き・#RRGGBBの色）に合わせるが、GASのHTML変換器を同梱・呼び出しはしない。未対応ブロック・リンク・HTML・style、未閉じの記号は原文と案内を残す。UIはMarkdown専用欄で解析・プレビューし、明示的な挿入を1つのUndoにする。通常入力へ自動変換を追加しない。HTML生成や外部通信は行わない。

部分書式はTextLayoutの計測・改行・位置決定へ引き継ぎ、SVGのtspanへ明示する。再編集用ZIPでもrunの省略値とfalseを保持する。文字色アニメーションは各runの有効fillを起点として評価する。図形本体のfillアニメーションでlabelの文字色は変えない。

部品の初回配置では、path.labelの文字サイズ・線・破線・余白を配置倍率に合わせる。通常の図形変形ではラベルの保存値を拡大しない。

## IlapoGrid（grid.js、0.4.11）

`step(settings,event?)` は有効な吸着間隔（なし=0、pixel=1、grid=gridStep）を返す。Option中は0。`point(point,settings,event?)` は絶対座標、`moveDelta(box,delta,settings,event?)` は外接枠の左上、`nudgeDelta(origin,delta,settings,event?)` はキーで動かす軸だけをそろえる。すべて入力を変更しない。`resize(original,proposed,{x,y,uniform},settings,event?)` は動かす辺と反対側の固定位置を保ち、ゼロ寸法へ丸めない。uniformは縦横比を保ち、主軸を目盛りにそろえる。`matches(value,interval)` は浮動小数の誤差を許容して目盛りとの一致を判定する。

設定キーは既存のsnap・snapPixel・gridStepを維持し、pixelGridを追加する。新規はpixelGrid/snapPixel=true。保存済みの明示falseは維持する。単位px・固定用紙・縦横とも72以下を適用したときはpixelGrid/snapPixel=true,snap=false,gridStep=1にする。既存作品の座標は設定変更だけで書き換えない。

SVGのpixel-patternはuserSpaceOnUseの1×1、pixel-gridは用紙の範囲（無限用紙はviewport）へ描く。原点は固定しパンでずれない。zoom>=8かつpixelGridの時だけ表示し、strokeWidth=.8/zoomで画面上の太さを維持する。artworkの上、選択・ガイドの下に置きpointer-events=noneとする。通常の点グリッドは別設定だが、1px方眼と間隔が重なる場合は点の表示だけを省く。SVG/PNG/PDF/発表は文書から出力し補助表示を含めない。

アンカーの吸着では有効間隔に合う他アンカー／パスだけを優先し、なければGrid.pointでそろえる。曲線ハンドルも0.4.12以降はGrid.pointを使い、Option時は小数を保持する。図形への接続端点は輪郭追従を優先する。数値入力と読み込みの座標は丸めない。

## IlapoGuides（guides.js）

`prepare(page,selectedIds,getBounds,viewport)`で選択全体の外接範囲と画面内の参照図形を記録し、`move(session,delta,{zoom,enabled,alt,fallback,accept?})`・`resize(session,proposedBox,{zoom,enabled,alt,x,y,uniform,accept?})`で補正座標とガイドを返す。元文書・履歴は変更しない。`x/y`は動く辺のstart/end、指定なしの軸は変えない。uniformでは1軸の吸着を採用して縦横比と反対側の固定点を維持する。

選択・下絵・接続矢印は参照から除き、通常の固定図形は参照できる。グループは1外接範囲。有限用紙の端・中央を追加し、無限用紙に原点を追加しない。吸着範囲は7画面px。accept(axis,position)があれば、移動後の外接枠の左上／サイズ変更中の辺が有効な目盛りに合う候補だけを採用する。最も近い端・中央・等間隔候補を採用し、位置合わせ候補がない軸には既存グリッドの移動量を使う。等間隔候補は直交方向で重なる近隣の図形から求める。

`markup(result,zoom,unit)`の出力は専用の`#alignment-guides`へだけ配置する。線・ラベルのサイズは表示倍率で補正し、距離は用紙単位で表示する。ドラッグ中のsession/表示だけに保持し、キャンセル・完了・ツール切替で除去する。Alt/Shiftキーだけの変化も最後のポインタ座標から再計算する。表示設定`smartGuides`は既定true、作品とは別の既存設定キーへ保存する。

## 統合選択（0.4.13）

上部のdata-tool=selectを選択系の唯一の入口とし、内部tool=select/directは全体／アンカーの状態として保持する。両状態で選択ツールをactiveにする。未選択の図形を押した時だけPathUI.pickで実頂点・輪郭を調べ、該当する場合はdirect、それ以外の内側はselectへ切り替える。選択済みの図形や表示済みハンドルでは再判定しない。初期はselect。選択系の状態は選択解除・ページ切替でselectに戻す。A/Vと選択ポップアップからの明示切替も維持する。

PathUI.pickは実際のDOM対象を優先し、細線の空振り時だけ前面順に輪郭を探す。許容距離はマウス9px・タッチ14pxをzoomで換算し、実頂点を辺より優先する。表示用座標のinspect/nearestを使い、元モデルは変更しない。最初のpointerdownで1点または区間の両端を選び、同じジェスチャで移動を開始する。

ドラッグは開始時のbase・selectionIds・originalNodesを保持し、move/transformは固定したselectionIdsで計算する。directの内側moveはrefsを保持し、edgeだけを解除する。全体選択の外接枠の辺には透明なヒット領域を設け、角の操作領域とは重ねない。通常の履歴・プレビュー・取消・吸着を共用する。

空白の非ドラッグpointerupで全解除、空白のdragは開始時のselect/directに従う範囲選択。Escはドラッグ取消・メニュー終了・専用操作の取消を優先し、それ以外では全解除する。内側dblclickは文字編集、direct輪郭dblclickは点追加に使う。dblclickの対象が再描画・pointer captureでcanvasへ移った場合はelementFromPointで補い、接続矢印の処理は選択中のconnectorと実際の対象IDが一致するときだけ受け取る。選択状態は作品・保存形式へ追加しない。

## 即時反映と履歴（0.4.12）

0.4.14では候補表示用の`#hover-preview`を作品と選択枠から分離する。頂点は点と輪を、内側はグループを含む全体範囲を表示する。選択状態と実際のクリック判定を優先し、リサイズ・ベジェ・接続ハンドルには裏の頂点候補を重ねない。候補表示はpointer-events=noneで文書や履歴に含めず、操作開始・画面外への移動・再描画・ツール切替で無効にする。タッチではホバーを使わない。オブジェクト設定内のpages/objects/assetsタブは外し、右端の独立ボタンだけを入口にする。

選択ポップアップは選択内容ごとに主要操作を表示し、複数パスのBooleanと単一パスのアンカー追加を直接呼び出せる。区間未選択のanchor-addは1点追加モードへ入り、選択パスの輪郭だけを対象にする。成功・Escape・選択変更で終了し、モードは文書へ保存しない。狭い画面で省略するパスメニューはselection-moreからも開ける。

通常の設定フォームはrequest.auto=trueとし、input/changeと書式ボタンのclickを同じターンのmicrotaskへまとめる。フォーム固有handlerの後に有効性・IME・request token・scopeを確認してapplyする。自己commit直後だけsignatureを更新し、入力のたびにDOMを再作成しない。外部の編集・選択・ページ変更・Undoではrevisionを含むscopeでフォームを更新する。閉じたrequestの保留処理は破棄する。

Inspector.changeGroupは即時applyの実行中だけ有効。History.change(fn,{group})は連続する同一groupの変更を1履歴へまとめる。欄のfocusout・他欄・離散ボタン操作で新しいgroupにする。通常change/undo/redo/replaceで連結を解除し、不正な変更では履歴を保持する。自分のgroupの開始状態へ戻った場合は空の履歴を除去し、その前の別操作とは結合しない。

変形とアンカー座標はフォーム開始時のbaseを複製して再計算する。新規文字はIDでupsertし、入力のたびに追加しない。空の新規文字・不正な数値・IME変換中は反映しない。反映後は通常の作品・自動保存・明示保存を使い、Escapeや閉じるでは取消さない。パネル内の⌘Z/⇧⌘Zは作品のUndo/Redoに渡す。

用紙の寸法は即時反映し、小用紙のピクセル設定自動補正はchange/clickの確定操作時に行う。既存の動きの編集は即時、新規追加は「追加」を維持。アウトライン化・登録・出力などの実行操作はautoを使わず、プレビューと実行ボタンを維持する。従来のInspector仕様のうち通常設定のpreview/apply/resetに関する記載は、この節を優先する。

## IlapoInspector（inspector.js / inspector.css）

`create({onLayout,clearPreview,isBusy})` は `show(request)`、`close({focus?:boolean})`、`reset()`、`sync()` と読み取り専用の `section`・`isOpen`・`root` を返す。
requestは `{section,title,html,label,apply,auto?,preview?,scope,refresh,opener}`。labelがnullなら適用・取消フッターを表示しない。htmlはeditor側でエスケープしたフォーム断片だけを渡す。

- showModal・暗幕・inert・Tabの閉じ込めを使わない。通常は右側、850px以下は下部へ配置し、キャンバスと別の領域を確保する。ページ一覧はpages、図形一覧はobjects、アイコン・部品はassetsセクションを使い、設定と同じパネルの内容を切り替える。書き出しとは排他的、共通ヘルプとは独立して開く。
- scopeは文書ID・ページID・選択ID・編集リビジョンを含み、アンカー座標では選択点、表示設定では設定値も含む。syncと適用直前に比較し、古い対象への入力を別の対象へ適用しない。ドラッグ中の更新は終了まで待ち、閉じた後の非同期再構築で再度開かない。
- 色・変形・接続・画像のpreviewは検証済みの文書複製から表示用ページを作り、editorのinspectorPreviewだけを更新する。History・文書本体・保存・dirtyを変更しない。不正入力では前回のプレビューも取り消す。適用時だけ通常のchangePageで1履歴にまとめる。
- 適用・取消・対象切替ではフォームを現在の値から作り直す。変形の基準座標や回転・反転の入力を持ち越さない。再構築後は可能な範囲で入力フォーカス・本文スクロール・detailsの開閉を保つ。閉じたパネルの本文は空にし、重複IDを残さない。
- 幅は `kaijo-ilapo:inspector` にCSS pxの数値文字列で保存し、作品データや既存設定形式と分ける。既定320px、220〜520pxかつキャンバス幅を確保できる範囲。モバイル表示だけを理由に保存幅を縮めない。
- パネル内のキーをキャンバス操作へ伝えない。Escapeはリサイズ取消を先に扱い、通常はパネルを閉じる。閉じたらパネル外の起点へ戻し、「キャンバスへ戻る」は開いたまま編集面へフォーカスを移す。

## ページ一覧・選択サブメニュー（0.4.4）

`IlapoPagesUI.create({document,page,selectPage,change,showInspector,showDialog,esc,icon})` は `open()` を返す。ページIDを対象に操作し、DOMの一覧番号を文書参照の正本にしない。切替は選択・編集中のプレビューを解除して表示範囲を合わせ、Historyを変えない。変更は既存のCore/Historyを通す。サムネイルは検証済みページのSVG出力で、下絵を除外する。

pagesのscopeは文書ID・ページID・編集リビジョン。図形の選択だけでは一覧を作り直さず、編集確定時に更新する。右端のページ・図形・部品・用紙サイズ・表示と吸着・動きと再生順序は、それぞれpages・objects・assets・board・view・animationの開閉状態をaria-expandedで示す。書き出しも同じレールに置く。これら全体パネルではinspector-tabsを非表示にし、選択図形のパネルに全体設定のタブを混ぜない。文書の入れ替え後に古い一覧のイベントで別の文書を編集しない。

選択バーのdata-menuボタンはマウスpointerenterで開く。ドラッグ・タッチ・モーダル表示中にはホバー起動しない。開くだけではフォーカスを動かさず、ポップアップへの移動を妨げないため閉鎖だけ240ms待つ。クリックやキーボードで開いたメニューは外側クリック・実行・Escapeまで保持する。高さは起点の上／下にある空間から計算し、ボタンへ重ねない。ホバーメニュー表示中のEscapeはパネルやキャンバスへ伝えない。

## 図形一覧（objects-model.js / objects-ui.js / objects.css、0.4.8）

`IlapoObjectsModel.units(objects)` は前面からの一覧単位を返す。`keyOf(object)` はグループの`g:`と単体の`o:`を分け、グループIDと図形IDの衝突を避ける。グループの表示位置は最前面の構成員で決める。読み出しでは元配列を変更しない。

`reorder(page,sourceKey,targetKey,front)` は対象単位だけを抜いて、指定先の前面／背面へ挿入する。対象内の順序と、対象以外の全図形の相対順を保持する。`reorderChild(page,sourceId,targetId,front)` は同一グループ内に限定し、そのグループの元の配列位置だけを入れ替える。無効な対象・同一対象は何もしない。呼出側のchangePageで確定し、モデル自身はHistoryを持たない。

`IlapoObjectsUI.create({document,page,selected,select,showInspector,changePage,showDialog,execute,isBusy,esc,icon})` は `open()`・`cancelDrag()`・読み取り専用`isDragging`を返す。objectsのscopeは文書ID・ページID・編集リビジョン・選択ID。選択はeditorのselectionを通して従来のグループ選択を保つ。

- 折り畳みは文書／ページごとのUI状態で、保存・履歴に入れない。クリック／Shift追加／上下・Home/End／Enter・Spaceで選択し、左右でグループを開閉する。折り畳まれた子はキーボード移動の対象外。フォーカス復元では任意IDをCSS用にエスケープする。
- 名前は既存nameへ保存する。名前・個別固定・グループ固定・前後ボタンの変更は1回のchangePage。グループの一部固定は混在表示し、押すと全体固定になる。一覧内の⌘Z／Ctrl+ZとShift併用はexecuteのUndo/Redoへ渡し、その他のキーはキャンバスへ伝えない。
- 並べ替えは専用ハンドルのPointer Eventsを使い、タッチではそのハンドルだけtouch-action:none。挿入表示と端での自動スクロールはUIのみ。pointerupで一度確定する。Escape・pointercancel・lostpointercapture・blurは確定せず終了する。
- 開いたDOMのイベントはAbortControllerで再構築時に破棄する。ドラッグ中はInspectorのsyncを保留し、ページ参照・文書／ページID・DOM接続状態が変わったら取消。ページ／作品／設定切替でもcancelDragを呼ぶ。選択・開閉だけで非連続グループを再配列しない。

## 上部と追加ツール（0.4.22）

上部はbrand（ロゴのみtools一覧リンク）／file・Undo・Redo／select／present／document-title／settings・helpの1行。標準は高さ41px、ボタン32×30px。--ui-kを共通と同じ1・1.15・1.3とし、30pxの操作部・上下各5pxを拡大する。pointer:coarseは44px以上。700px以下（coarseは850px以下）では履歴ボタンを隠し、fileメニューの構築時に同じUndo/Redoを補う。発表・設定は常時アクセスできる。

fileは既存のnew／rename／save-browser／save-local／recovery／open-file／auto-start・stopを呼ぶ。保存形式・保存キー・新規／読込前の未保存確認・beforeunloadは変えない。selectは統合選択とpan、すべて選択を提供し、対象の編集は選択ポップアップへ残す。insert/view/moreと上部pagesの重複は置かない。図形・文字・接続・画像・SVG追加・貼り付けは左、用紙・グリッドと吸着は右、倍率は下部を使う。複数ファイルのタブは共通仕様4.5の詳細合意まで未実装。

settingsはテーマと操作部文字サイズの単一選択ボタン群。data-theme-choice・data-ui-sizeのクリックでsettingsとaria-pressedを同期し、メニューを保つ。既存のkaijo-ilapo:settingsを使い、作品・保存済みファイル・履歴を変えない。テーマ用SVGは教材サイトと同じ端末・太陽・月の意匠。viewパネルのscopeはcanvas設定のみを含め、外観設定でviewを再構築したり入力を失わない。

トップと選択バーは共通のポップオーバー処理を使う。ホバーは表示のみでフォーカスや文書を変えず、別メニューにフォーカスがある間はホバーで切り替えない。クリック・タップ・上下キー・Escapeでも操作可能。サイズ変更で上部高さとメニュー位置、左右パレット・書き出しパネルの上端を同期する。

560px以下は同一の左パレットを非モーダルで開閉し、Escape・外側操作・ツール選択で閉じる。外側のキャンバスを押して閉じた1回目のpointerdownで図形を置かない。Tabを閉じ込めず、隠れるパネルへフォーカスを残さない。

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
