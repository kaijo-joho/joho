/* Shared, deterministic registration/reader contract. No I/O or credentials. */
var OMRRegistration=(function(){
 'use strict';
 var SCHEMA='omr-reader-definition/1',RENDERER='omr-generated-pdf/1';
 function fail(message){throw new Error(message);}
 function pad(value,digits){return String(value).padStart(digits,'0');}
 function qr(number,year,version,page){
  if(typeof number!=='string'||!/^\d{6}$/.test(number)||number==='000000'||!Number.isInteger(year)||year<2000||year>2099||!Number.isInteger(version)||version<1||version>99||!Number.isInteger(page)||page<1||page>99)fail('QRの番号・年度・版・ページが範囲外です');
  return '91'+number+pad(year-2000,2)+pad(version,2)+pad(page,2);
 }
 function parse(value){
  if(typeof value!=='string'||!/^91\d{12}$/.test(value))fail('未対応のQR形式です');
  var result={paperNumber:value.slice(2,8),academicYear:2000+Number(value.slice(8,10)),releaseVersion:Number(value.slice(10,12)),page:Number(value.slice(12,14))};
  if(qr(result.paperNumber,result.academicYear,result.releaseVersion,result.page)!==value)fail('QRが不正です');return result;
 }
 function build(document,number,version){
  var d=document&&document.definition;OMRDesigner.validate(d);
  if(d.geometry_version!=='editor-compact/5')fail('正式登録には現在の配置版で下書きを保存してください');
  qr(number,d.academic_year,version,1);
  var result={schema:OMRDesigner.hasMarkGrid(d)?'omr-reader-definition/2':SCHEMA,qrProtocol:'91',paperNumber:number,academicYear:d.academic_year,releaseVersion:version,
   releaseKey:number+'-'+d.academic_year+'-'+pad(version,2),geometryVersion:d.geometry_version,layoutVersion:d.layout_version,
   metadata:OMRDesigner.clone(document.metadata),title:d.title,grade:OMRDesigner.clone(d.grade),purpose:d.purpose,printMode:OMRDesigner.printMode(d),
   pages:d.pages.map(function(p){var g=OMRDesigner.layout(d,p);return {number:p.number,uid:p.uid,side:p.side,
    paper:{size:d.paper.size,orientation:d.paper.orientation,widthMm:g.width_mm,heightMm:g.height_mm},
    qr:{payload:qr(number,d.academic_year,version,p.number),rectMm:g.qr,version:1,ecc:'H',quietZoneModules:4},
    markers:g.markers.map(function(r,i){return{id:g.marker_ids[i],rectMm:r};}),nameRectMm:g.name_rect,handwriting:g.handwriting,
    fields:g.fields.map(function(f){return{definition:OMRDesigner.clone(p.fields.find(function(x){return x.id===f.field;})),geometry:f};}),
    writingAreas:p.elements.filter(function(e){return e.type==='entry'||e.type==='free';}).map(function(e){return{id:e.id,type:e.type,required:!!e.required,rectMm:OMRDesigner.rect(e),automaticReading:false};})};})};
  if(OMRDesigner.hasMarkGrid(d)){result.requiredCapabilities=['mark-grid-ellipse/1'];d.pages.forEach(function(p,i){result.pages[i].markGroups=p.elements.filter(function(e){return e.type==='mark-grid';}).map(function(e){return{id:e.id,label:e.label,required:e.required,selection:'single',options:OMRDesigner.clone(e.mark_grid.options),geometry:OMRDesigner.markGridGeometry(e)};});});}
  var score=OMRDesigner.scoreTarget(d);if(score){var n=score.numeric,e=score.element;result.scoreTarget={pageUid:score.page.uid,pageNumber:score.page.number,elementId:e.id,inputMethod:n.method,minimum:0,fullScore:n.max,integerOnly:true,blankIsZero:false,automaticReading:n.method==='mark'};if(n.method==='mark')result.scoreTarget.fieldId=e.field_id;else{result.scoreTarget.writingAreaId=e.id;result.scoreTarget.characterSet='digits';result.scoreTarget.cells=e.entry_grid.cells;result.scoreTarget.cellRectsMm=OMRDesigner.entryCells(e);}}
  return result;
 }
 function validate(definition,document){
  if(!definition||![SCHEMA,'omr-reader-definition/2'].includes(definition.schema))fail('読み取り設定の形式が不正です');
  var expected=build(document,definition.paperNumber,definition.releaseVersion);
  if(OMRDesigner.canonical(expected)!==OMRDesigner.canonical(definition))fail('読み取り設定と用紙定義が一致しません');return definition;
 }
 function bubbleCount(page){return page.fields.reduce(function(n,f){return n+f.geometry.bubbles.length;},0)+(page.markGroups||[]).reduce(function(n,g){return n+g.geometry.questions.reduce(function(sum,q){return sum+q.bubbles.length;},0);},0);}
 function validateProof(proof,reader){
  if(!proof||proof.schema!=='omr-pdf-preflight/1'||proof.renderer!==RENDERER||proof.dpi!==300||!Array.isArray(proof.pages)||proof.pages.length!==reader.pages.length)fail('PDF検査の形式が不正です');
  proof.pages.forEach(function(p,i){var r=reader.pages[i],bubbles=bubbleCount(r);
   if(!p||p.number!==r.number||p.widthMm!==r.paper.widthMm||p.heightMm!==r.paper.heightMm||p.qrPayload!==r.qr.payload||p.qrVersion!==1||p.qrModules!==21||p.quietZoneModules!==4||p.markersVerified!==13||p.bubblesVerified!==bubbles||p.textBoundsVerified!==true||!Number.isInteger(p.widthPx)||!Number.isInteger(p.heightPx)||Math.abs(p.widthPx-r.paper.widthMm*300/25.4)>.51||Math.abs(p.heightPx-r.paper.heightMm*300/25.4)>.51||!/^[a-f0-9]{64}$/.test(p.imageSha256))fail('PDFのページ・QR・読取位置の検査が一致しません');
  });return proof;
 }
 return {schema:SCHEMA,renderer:RENDERER,qr:qr,parse:parse,build:build,validate:validate,bubbleCount:bubbleCount,validateProof:validateProof};
})();
