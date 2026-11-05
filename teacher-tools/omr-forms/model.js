/* Shared by the GAS editor and local preview. No network, credentials or user records. */
var OMRDesigner = (function () {
  'use strict';
  var sizes={B5:[182,257],A4:[210,297],B4:[257,364]};
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function id(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);}
  function role(f){return f.identity_role||(['grade','class','number'].includes(f.id)?f.id:null);}
  function numeric(p,e){if(!e)return null;if(e.type==='omr'){var f=p.fields.find(function(v){return v.id===e.field_id;});if(f&&f.kind==='digits'&&!role(f))return{method:'mark',digits:f.digits,min:f.min,max:f.max,hasRange:true,field:f};}if(e.type==='entry'&&e.entry_grid&&e.entry_grid.character_set==='digits'){var r=e.numeric_range;return{method:'handwriting',digits:e.entry_grid.cells,min:r?r.min:0,max:r?r.max:null,hasRange:!!r};}return null;}
  function isScoreTarget(d,p,e){var s=d.score_target;return !!(s&&p.uid===s.page_uid&&e.id===s.element_id);}
  function scoreTarget(d){var s=d.score_target;if(!s)return null;var p=d.pages.find(function(v){return v.uid===s.page_uid;}),e=p&&p.elements.find(function(v){return v.id===s.element_id;});return p&&e?{page:p,element:e,numeric:numeric(p,e)}:null;}
  function validateScore(d){if(d.score_target===undefined)return;var s=d.score_target;if(!s||Array.isArray(s)||Object.keys(s).sort().join(',')!=='element_id,page_uid'||!id(s.page_uid)||!id(s.element_id))throw Error('得点欄の指定は用紙全体で1つまでです');var target=scoreTarget(d),n=target&&target.numeric;if(!n||!n.hasRange||n.min!==0||!Number.isSafeInteger(n.max)||n.max<1||n.max>=Math.pow(10,n.digits))throw Error('得点欄には数値入力部品と1以上の整数の満点を指定してください');}
  function setScoreTarget(d,index,elementId){var p=d.pages[index],e=p&&p.elements.find(function(v){return v.id===elementId;});if(!p||!id(p.uid)||!numeric(p,e))throw Error('得点に指定できる数値入力部品が見つかりません');d.score_target={page_uid:p.uid,element_id:elementId};validateScore(d);}
  function clearScoreTarget(d,p,e){if(isScoreTarget(d,p,e))delete d.score_target;}
  function scoreCaption(d,p,e){var n=isScoreTarget(d,p,e)&&numeric(p,e);return n?'満点'+n.max+'点':'';}
  function size(d){var a=sizes[d.paper.size];return d.paper.orientation==='landscape'?[a[1],a[0]]:a.slice();}
  function profile(d){var a=size(d),w=a[0],h=a[1],s=Math.min(w/182,1.12),bytes=51+d.form_id.length+d.layout_version.length,limits=[7,14,24,34,44,58,64,84,98,119,137,155,177,194,220,250],version=limits.findIndex(function(n){return bytes<=n;})+1;if(!version)version=17;var qr=d.geometry_version==='editor-compact/5'?26:Math.max(26,(version*4+25)*.46);return {w:w,h:h,s:s,qr_size:qr,left:Math.min(w-170*s,17.5*s),middle:w-Math.max(101*s,67.75*s+qr),top:9*s,qr_top:5*s,body_top:Math.round(Math.max(5*s+qr+2*s,9*s+22*s,9*s+22.7*s)*1e6)/1e6};}
  var PT=25.4/72;
  function charWidth(c,pt){var factor=c.charCodeAt(0)>=128?1.05:('MW@%'.includes(c)?1.05:("ilI!|'.,:; ".includes(c)?.4:.75));return factor*pt*PT;}
  function measureRich(runs,width){var lines=[],line=[],occupied=0,height=0;
    function flush(force){if(!line.length&&!force)return;var max=Math.max.apply(null,line.map(function(c){return c.run.font_size;}).concat([8])),h=max*PT*1.32;lines.push({chars:line,height:h,font_size:max});height+=h;line=[];occupied=0;}
    var trailing=false;(runs||[]).forEach(function(run){Array.from(run.text.replace(/\t/g,'    ')).forEach(function(ch){var cw=charWidth(ch,run.font_size);if(ch==='\n'){flush(true);trailing=true;return;}if(line.length&&occupied+cw>width)flush(false);line.push({char:ch,run:run,width:cw});occupied+=cw;trailing=false;});});flush(trailing);return{height:height,lines:lines};}
  function padding(e){return e.padding||{top:1,right:e.type==='text'?1.5:2,bottom:e.type==='text'?1:2,left:e.type==='text'?1.5:2};}
  function contentWidth(e){var p=padding(e);return Math.max(1,e.width-(p.left+p.right));}
  function questionHeight(e){return measureRich(e.question_runs||[],contentWidth(e)).height;}
  function plainLines(value,width,pt){return measureRich([{text:value,font_size:pt}],Math.max(1,width)).lines.length||1;}
  function choiceMetrics(f,e){var p=padding(e),w=e.width-(p.left+p.right-4),q=questionHeight(e),list=(f.layout||'row')==='list',offsets=[],needed;
    if(list){var offset=0,lastBottom=0;f.options.forEach(function(o){var lines=plainLines(o.label,w-15,8);offsets.push(offset);lastBottom=13+q+offset+(lines-1)*3.8;offset+=Math.max(11,lines*3.8+2);});needed=Math.max(9+11*f.options.length+q,lastBottom+2);}
    else{var pitch=(w-10)/f.options.length,max=1;f.options.forEach(function(o){max=Math.max(max,plainLines(o.label,pitch-2,7.3));});needed=Math.max(27+q,20+q+(max-1)*3.5);}
    return{offsets:offsets,note:(f.kind==='multiple'?'□':'○')+'を濃く塗りつぶす（✓・×不可）',height:needed+(p.top+p.bottom-3)};
  }
  function minSize(f,e){var base=f.kind==='digits'?98:((f.layout||'row')==='list'?65:Math.max(48,8*f.options.length)),obj=e||{type:'omr',width:base,question_runs:[]},p=padding(obj),w=base+p.left+p.right-4,q=questionHeight(obj);if(f.kind==='digits')return[w,10+9*f.digits+q+(p.top+p.bottom-3)];return[w,choiceMetrics(f,obj).height];}
  function textMinHeight(e){var p=padding(e);return p.top+(e.label?5:0)+measureRich(e.runs||[],contentWidth(e)).height+p.bottom;}
  function entryGridNote(e){return e.entry_grid?'数字を1マス1字':'';}
  function entryMinWidth(e){var p=padding(e),grid=e.entry_grid;if(grid){var note=Array.from(entryGridNote(e)).reduce(function(n,c){return n+charWidth(c,6);},0);return Math.max(24,p.left+p.right+Math.max(grid.cells*grid.cell_size_mm,note));}return Math.max(24,p.left+p.right+(e.entry_box&&e.entry_box.width_mm||8));}
  function entryMinHeight(e){var p=padding(e),grid=e.entry_grid;return (p.top+5+(grid?grid.cell_size_mm+4:e.entry_box&&e.entry_box.height_mm||8)+p.bottom)+questionHeight(e);}
  function entryRect(e){var p=padding(e),box=e.entry_box||{},q=questionHeight(e),grid=e.entry_grid;return[e.x+p.left,e.y+(p.top+5)+q,grid?grid.cells*grid.cell_size_mm:box.width_mm||contentWidth(e),grid?grid.cell_size_mm:box.height_mm||Math.max(8,e.height-(p.top+5+p.bottom)-q)];}
  function entryCells(e){if(!e.entry_grid)return[];var r=entryRect(e),s=e.entry_grid.cell_size_mm;return Array.from({length:e.entry_grid.cells},function(_,i){return[r[0]+i*s,r[1],s,s];});}
  function freeMinHeight(e){var p=padding(e);return (p.top+5+p.bottom)+questionHeight(e)+(e.lines?Math.max(4,e.lines*3):0);}
  function rect(e){return[e.x,e.y,e.width,e.height];}
  function overlaps(a,b){return a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];}
  function fieldGeometry(f,e){var p=padding(e),x=e.x+(p.left-2),y=e.y+(p.top-1),w=e.width-(p.left+p.right-4),h=e.height,min=minSize(f,e);if(e.width<min[0]-.001||h<min[1]-.001)throw Error('OMR部品が小さすぎます: '+f.id);
    var g={field:f.id,kind:f.kind,identity_role:null,bubbles:[],title:[x+2,y+4],width:w-4,rect:rect(e)};
    var q=questionHeight(e);
    if(f.kind==='digits'){for(var p=0;p<f.digits;p++)for(var digit=0;digit<10;digit++)g.bubbles.push({code:String(digit),place:p,x:x+35+digit*6,y:y+11+q+p*9,r:1.7});}
    else if((f.layout||'row')==='list'){g.choice=choiceMetrics(f,e);f.options.forEach(function(o,i){g.bubbles.push({code:String(o.code),place:0,x:x+4,y:y+11+q+g.choice.offsets[i],r:1.7});});}
    else{g.choice=choiceMetrics(f,e);var pitch=(w-10)/f.options.length;f.options.forEach(function(o,i){g.bubbles.push({code:String(o.code),place:0,x:x+5+(i+.5)*pitch,y:y+12+q,r:1.7});});}return g;}
  function layout(d,p){var a=profile(d),w=a.w,h=a.h,s=a.s,edge=6.75*s,ms=3.5*s,front=p.side==='F',mx=a.middle,hy=a.top;
    var points=[['topLeft',edge,edge],['topRight',w-edge,edge],['bottomRight',w-edge,h-edge],['bottomLeft',edge,h-edge],
      ['leftOneThird',edge,h/3-(front?10:0)],['leftTwoThirds',edge,2*h/3+(front?10:0)],['rightOneThird',w-edge,h/3-(front?0:10)],['rightTwoThirds',w-edge,2*h/3+(front?0:16)],
      ['topCenter',w/2,edge],['bottomCenter',w/2,h-edge],['bindingTop',front?20*s:w-35.75*s,edge],['bindingBottom',front?20*s:w-20*s,h-edge],['oppositeBottomInner',front?w-20*s:20*s,h-edge]];
    var g={width_mm:w,height_mm:h,page:p.number,side:p.side,markers:points.map(function(v){return[v[1]-ms/2,v[2]-ms/2,ms,ms];}),marker_ids:points.map(function(v){return v[0];}),
      qr:[w-10*s-a.qr_size,a.qr_top,a.qr_size,a.qr_size],fields:[],header_rect:[a.left-1,hy-1,w-10*s-a.left+2,a.body_top-hy+1],body_top:a.body_top,handwriting:[],digit_labels:[]};
    var firstDigit=mx+14*s,headingY=firstDigit-.6*s<w/2+ms/2?hy+2*s:edge+1*s;
    for(var i=0;i<10;i++)g.digit_labels.push([String(i),mx+(14+4.5*i)*s,headingY]);
    p.fields.forEach(function(f){var r=role(f);if(!r)return;
      if(r==='grade'){
        var grade={field:f.id,kind:f.kind,identity_role:r,bubbles:[],title:[a.left,hy+9*s],width:mx-a.left,rect:[a.left,hy+5*s,mx-a.left,6*s]};
        var gx=a.left+8*s, pitch=(mx-a.left-9*s)/6;
        Array.from('123456').forEach(function(code,i){grade.bubbles.push({code:code,place:0,x:gx+(i+.15)*pitch,y:hy+8*s,r:1.35*s});});
        g.fields.push(grade);return;
      }
      var n=r==='number'?2:1,cy=hy+(5+ (r==='number'?1:0)*6.25)*s;
      var fg={field:f.id,kind:f.kind,identity_role:r,bubbles:[],title:[mx,cy+.95*s],width:60*s,rect:[mx-.7*s,cy-3.2*s,58*s,(n-1)*6.25*s+6.4*s]};
      for(var j=0;j<n;j++){var yy=cy+j*6.25*s;g.handwriting.push({role:r,place:j,rect:[mx+5*s,yy-3*s,6*s,6*s]});Array.from('0123456789').forEach(function(code){fg.bubbles.push({code:code,place:j,x:mx+(14+4.5*Number(code))*s,y:yy,r:1.75*s});});}g.fields.push(fg);
    });
    g.name_rect=[a.left+9*s,hy+12*s,mx-a.left-12*s,8*s];g.elements=clone(p.elements||[]);
    g.elements.forEach(function(e){if(e.type==='omr'){var f=p.fields.find(function(f){return f.id===e.field_id;});g.fields.push(fieldGeometry(f,e));}});
    g.panel_rect=[16,g.body_top,w-32,h-g.body_top-16];return g;}
  function validateRuns(runs,optional){if(!Array.isArray(runs)||(!optional&&!runs.length)||runs.length>1000)throw Error('テキストを入力してください');var count=0;runs.forEach(function(r){if(!r||typeof r.text!=='string')throw Error('テキスト形式が不正です');count+=r.text.length;if(!Number.isFinite(r.font_size)||r.font_size<6||r.font_size>48||!/^#[0-9a-f]{6}$/i.test(r.color)||['bold','italic','underline'].some(function(k){return typeof r[k]!=='boolean';}))throw Error('文字書式が不正です');});if(count>20000)throw Error('文字数が上限を超えています');}
  function validate(d){if(!d||d.schema!=='omr-form/1'||!id(d.form_id)||!id(d.layout_version))throw Error('用紙ID・版・形式を確認してください');
    if(d.geometry_version!==undefined&&!['editor-compact/4','editor-compact/5'].includes(d.geometry_version))throw Error('未対応の配置版です');
    if(!d.paper||!Object.prototype.hasOwnProperty.call(sizes,d.paper.size)||!['portrait','landscape'].includes(d.paper.orientation))throw Error('用紙サイズが不正です');
    if(d.paper.print_mode!==undefined&&!['single','duplex'].includes(d.paper.print_mode))throw Error('印刷方式が不正です');
    if(!Number.isInteger(d.academic_year)||d.academic_year<2000||d.academic_year>2199||!['applications','attendance','scores'].includes(d.purpose))throw Error('年度・用途を確認してください');
    if(typeof d.title!=='string'||!d.title||d.title.length>160)throw Error('用紙名を入力してください');
    if(!d.grade||!['field','fixed','context'].includes(d.grade.mode)||!Array.isArray(d.grade.allowed)||(d.grade.mode==='fixed'&&((typeof d.grade.value!=='string'||!/^[1-6]$/.test(d.grade.value))||typeof d.grade.premark!=='boolean')))throw Error('学年設定が不正です');
    if(!Array.isArray(d.pages)||!d.pages.length||d.pages.length>8)throw Error('ページ数は1〜8です');var fields=new Set(),pageIds=new Set();
    d.pages.forEach(function(p,i){if(p.uid!==undefined){if(!id(p.uid)||pageIds.has(p.uid))throw Error('ページIDが不正です');pageIds.add(p.uid);}if(p.number!==i+1||p.side!==pageSide(d,i)||!Array.isArray(p.fields)||!Array.isArray(p.elements))throw Error('ページ定義を確認してください');
      if(p.elements.length>80)throw Error('部品は1ページ80個までです');var roles=new Set();
      p.fields.forEach(function(f){if(!id(f.id)||fields.has(f.id)||typeof f.label!=='string'||f.label.length>180||typeof f.required!=='boolean')throw Error('読取欄ID・名前・必須性が不正です');fields.add(f.id);
        var rr=role(f);if(rr){if(!['grade','class','number'].includes(rr)||roles.has(rr))throw Error('識別欄が重複しています');roles.add(rr);}
        if(f.kind==='digits'){if(!Number.isInteger(f.digits)||f.digits<1||f.digits>5||!Number.isInteger(f.min)||!Number.isInteger(f.max)||f.min<0||f.max<f.min||f.max>=Math.pow(10,f.digits))throw Error('数値の桁・範囲が不正です');if(rr&&f.digits!==(rr==='number'?2:1))throw Error('組は1桁・番号は2桁です');}
        else if(['single','multiple'].includes(f.kind)){if(!Array.isArray(f.options)||f.options.length<2||f.options.length>12)throw Error('選択肢は2〜12個です');var codes=new Set();f.options.forEach(function(o){if(typeof o.code!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(o.code)||codes.has(o.code)||typeof o.label!=='string'||o.label.length>180)throw Error('選択肢コード・表示名を確認してください');codes.add(o.code);});if(rr==='grade'&&(f.kind!=='single'||f.options.map(function(o){return o.code;}).join('')!=='123456'))throw Error('学年は1〜6の列です');
          if(f.kind==='multiple'&&(!Number.isInteger(f.min_select)||!Number.isInteger(f.max_select)||f.min_select<0||f.max_select<f.min_select||f.max_select>f.options.length))throw Error('選択数が不正です');}
        else throw Error('読取形式が不正です');});
      var ids=new Set(),placed=new Set(),a=profile(d);
      p.elements.forEach(function(e,j){if(!id(e.id)||ids.has(e.id)||!['text','free','entry','omr'].includes(e.type))throw Error('部品ID・種類が不正です');ids.add(e.id);
        ['x','y','width','height'].forEach(function(k){if(typeof e[k]!=='number'||!Number.isFinite(e[k])||Math.abs(e[k])>500)throw Error('配置・サイズが不正です');});
        if(e.required!==undefined&&typeof e.required!=='boolean')throw Error('必須設定が不正です');
        if((e.type==='text'||e.type==='entry')&&e.label!==undefined&&(typeof e.label!=='string'||e.label.length>180))throw Error('テキスト見出しが不正です');
        if(e.border!==undefined&&typeof e.border!=='boolean')throw Error('枠線設定が不正です');
        if(e.padding!==undefined&&(!e.padding||Array.isArray(e.padding)||Object.keys(e.padding).length!==4||['top','right','bottom','left'].some(function(k){return typeof e.padding[k]!=='number'||!Number.isFinite(e.padding[k])||e.padding[k]<0||e.padding[k]>20;})))throw Error('部品の余白は上下左右それぞれ0〜20mmです');
        var inset=padding(e);if(e.width<=inset.left+inset.right||e.height<=inset.top+inset.bottom)throw Error('余白の内側に内容を置ける幅・高さを確保してください: '+e.id);
        if(e.entry_box!==undefined&&(e.type!=='entry'||!e.entry_box||Array.isArray(e.entry_box)||!Object.keys(e.entry_box).length||Object.keys(e.entry_box).some(function(k){var v=e.entry_box[k];return !['width_mm','height_mm'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<(k==='width_mm'?8:4)||v>400;})))throw Error('1行記入枠の幅は8mm以上、高さは4mm以上です');
        if(e.entry_grid!==undefined){var grid=e.entry_grid;if(e.type!=='entry'||!grid||Array.isArray(grid)||Object.keys(grid).sort().join(',')!=='cell_size_mm,cells,character_set'||grid.character_set!=='digits'||!Number.isInteger(grid.cells)||grid.cells<1||grid.cells>20||typeof grid.cell_size_mm!=='number'||!Number.isFinite(grid.cell_size_mm)||grid.cell_size_mm<6||grid.cell_size_mm>20||e.entry_box!==undefined)throw Error('数値入力（手書き）は1〜20マス、1辺6〜20mmです。文字種は数字のみで、1行記入枠との併用はできません');}
        if(e.numeric_range!==undefined){var nr=e.numeric_range;if(e.type!=='entry'||!e.entry_grid||!nr||Array.isArray(nr)||Object.keys(nr).sort().join(',')!=='max,min'||!Number.isSafeInteger(nr.min)||!Number.isSafeInteger(nr.max)||nr.min<0||nr.max<nr.min||nr.max>=Math.pow(10,e.entry_grid.cells))throw Error('手書き数値の範囲は桁数に収まる0以上の整数で指定してください');}
        if(e.width<=0||e.height<=0||e.x<12||e.y<a.body_top||e.x+e.width>a.w-12+.001||e.y+e.height>a.h-16+.001)throw Error('部品が本文の範囲外です: '+e.id);
        for(var n=0;n<j;n++)if(overlaps(rect(e),rect(p.elements[n])))throw Error('部品が重なっています: '+e.id);
        if(e.type==='text')validateRuns(e.runs,false);else if(e.question_runs!==undefined)validateRuns(e.question_runs,true);
        if(e.type==='omr'){var f=p.fields.find(function(f){return f.id===e.field_id;});if(!f||role(f)||placed.has(f.id))throw Error('読取欄と部品の対応が不正です');placed.add(f.id);fieldGeometry(f,e);}
        if(e.type==='free'&&(typeof e.label!=='string'||e.label.length>180||!Number.isInteger(e.lines)||e.lines<0||e.lines>30))throw Error('自由記述欄を確認してください');
        if(e.type==='text'&&e.label&&e.height<textMinHeight(e)-.001)throw Error('テキスト部品が小さすぎます: '+e.id);
        if(e.type==='entry'&&(typeof e.label!=='string'||e.width<entryMinWidth(e)-.001||e.height<entryMinHeight(e)-.001))throw Error((e.entry_grid?'数値入力（手書き）':'1行記入欄')+'が小さすぎます: '+e.id);
        if(e.type==='free'&&e.height<freeMinHeight(e)-.001)throw Error('自由記述欄が小さすぎます: '+e.id);
      });p.fields.forEach(function(f){if(!role(f)&&!placed.has(f.id))throw Error('未配置の読取欄があります: '+f.id);});
    });if(!fields.has('class')||!fields.has('number')||(d.grade.mode==='field'&&!fields.has('grade')))throw Error('年組番の共通欄が必要です');validateScore(d);return d;}
  function canonical(v){if(Array.isArray(v))return'['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+canonical(v[k]);}).join(',')+'}';return JSON.stringify(v);}
  async function hash(d){var raw=new TextEncoder().encode(canonical(d));var bytes=await crypto.subtle.digest('SHA-256',raw);return Array.from(new Uint8Array(bytes)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}
  async function payload(d,p,token){var fingerprint=await hash(d);return['OMRF1',d.form_id,d.layout_version,d.academic_year,d.paper.size+d.paper.orientation[0].toUpperCase(),p.number+'/'+d.pages.length+p.side,fingerprint.slice(0,16),token].join('|');}
  function fresh(prefix){return prefix+'-'+Math.random().toString(16).slice(2,10);}
  function version(){return 'v2-'+Date.now().toString(36)+'-'+Math.random().toString(16).slice(2,6);}
  function place(d,p,w,h){var a=profile(d);for(var y=a.body_top+2;y+h<=a.h-16;y+=4)for(var x=16;x+w<=a.w-12;x+=4){var r=[x,y,w,h];if(!p.elements.some(function(e){return overlaps(r,rect(e));}))return{x:Math.round(x*100)/100,y:Math.round(y*100)/100};}throw Error('部品を置く空きがありません。配置を調整するかページを追加してください');}
  function add(d,index,type,kind){if(type==='digit-entry'){type='entry';kind='digit-entry';}var p=d.pages[index],a=profile(d),e={id:fresh('block'),type:type,border:type==='free',width:Math.min(120,a.w-32),height:type==='free'?24:18};
    if(type==='text')e.runs=[{text:'テキストを入力',font_size:9,color:'#000000',bold:false,italic:false,underline:false}];
    if(type==='free'){e.label='自由記述';e.lines=3;e.question_runs=[];}
    if(type==='entry'){e.label='1行記入';e.required=false;e.question_runs=[];}
    if(type==='entry'&&kind==='digit-entry'){e.label='数値入力';e.entry_grid={character_set:'digits',cells:3,cell_size_mm:8};e.width=Math.max(40,entryMinWidth(e));e.height=entryMinHeight(e);}
    if(type==='omr'){e.question_runs=[];var f={id:fresh('q'),label:kind==='digits'?'数値入力':'設問',kind:kind,required:true};if(kind==='digits'){f.digits=2;f.min=0;f.max=99;}else{f.layout='row';f.options=[{code:'option_1',label:'選択肢1'},{code:'option_2',label:'選択肢2'}];if(kind==='multiple'){f.min_select=1;f.max_select=2;}}var minimum=minSize(f,e);e.width=Math.max(e.width,minimum[0]);e.height=minSize(f,e)[1];e.field_id=f.id;var pos=place(d,p,e.width,e.height);e.x=pos.x;e.y=pos.y;p.fields.push(f);p.elements.push(e);return e;}
    var position=place(d,p,e.width,e.height);e.x=position.x;e.y=position.y;p.elements.push(e);return e;}
  function remove(d,index,elementId){var p=d.pages[index],e=p.elements.find(function(e){return e.id===elementId;});if(!e)throw Error('部品が見つかりません');clearScoreTarget(d,p,e);p.elements=p.elements.filter(function(e){return e.id!==elementId;});if(e.type==='omr')p.fields=p.fields.filter(function(f){return f.id!==e.field_id;});}
  function printMode(d){return d.paper.print_mode||((d.pages||[]).some(function(p){return p.side==='B';})?'duplex':'single');}
  function prepare(d){var result=clone(d),changed=false;if(result.geometry_version===undefined||/^editor-compact\/[1-4]$/.test(result.geometry_version)){result.geometry_version='editor-compact/5';changed=true;}else if(result.geometry_version!=='editor-compact/5')throw Error('未対応の配置版です');if(result.paper.print_mode===undefined){result.paper.print_mode=printMode(result);changed=true;}var pageIds=new Set((result.pages||[]).map(function(p){return p.uid;}).filter(Boolean));(result.pages||[]).forEach(function(p){if(p.uid===undefined){p.uid=uniquePageId(pageIds);pageIds.add(p.uid);changed=true;}});if(changed)result.layout_version=version();return result;}
  function pageSide(d,index){return printMode(d)==='duplex'&&index%2?'B':'F';}
  function setPrintMode(d,mode){if(!['single','duplex'].includes(mode))throw Error('印刷方式が不正です');d.paper.print_mode=mode;d.pages.forEach(function(p,i){p.side=pageSide(d,i);});}
  function uniquePageId(used){var base=fresh('page'),candidate=base,index=1;while(used.has(candidate))candidate=base+'-'+index++;return candidate;}
  function normalizePages(d){var used=new Set();d.pages.forEach(function(p){p.fields.forEach(function(f){if(!role(f))used.add(f.id);});});d.pages.forEach(function(p,i){p.number=i+1;p.side=pageSide(d,i);p.fields.forEach(function(f){var rr=role(f);if(!rr)return;var base=i?'p'+(i+1)+'_'+rr:rr,candidate=base,n=1;while(used.has(candidate))candidate=base+'_'+n++;used.add(candidate);f.id=candidate;f.identity_role=rr;if(i===0)f.required=true;});});}
  function removePage(d,index){if(!Number.isInteger(index)||index<0||index>=d.pages.length)throw Error('削除するページが見つかりません');if(d.pages.length<=1)throw Error('最後の1ページは削除できません');if(d.score_target&&d.score_target.page_uid===d.pages[index].uid)delete d.score_target;d.pages.splice(index,1);normalizePages(d);return Math.min(index,d.pages.length-1);}
  function addPage(d){if(d.pages.length>=8)throw Error('8ページまでです');var number=d.pages.length+1,p={uid:uniquePageId(new Set(d.pages.map(function(p){return p.uid;}))),number:number,side:pageSide(d,number-1),fields:[],elements:[]};d.pages[0].fields.filter(role).forEach(function(f){var value=clone(f),base='p'+number+'_'+role(f),candidate=base,n=1,used=new Set(d.pages.flatMap(function(p){return p.fields.map(function(f){return f.id;});}));while(used.has(candidate))candidate=base+'_'+n++;value.id=candidate;value.identity_role=role(f);value.required=false;p.fields.push(value);});d.pages.push(p);return d.pages.length-1;}
  return{clone:clone,role:role,numeric:numeric,scoreTarget:scoreTarget,isScoreTarget:isScoreTarget,setScoreTarget:setScoreTarget,clearScoreTarget:clearScoreTarget,scoreCaption:scoreCaption,size:size,profile:profile,charWidth:charWidth,measureRich:measureRich,padding:padding,contentWidth:contentWidth,questionHeight:questionHeight,textMinHeight:textMinHeight,entryMinWidth:entryMinWidth,entryMinHeight:entryMinHeight,entryRect:entryRect,entryCells:entryCells,entryGridNote:entryGridNote,freeMinHeight:freeMinHeight,minSize:minSize,rect:rect,overlaps:overlaps,layout:layout,validate:validate,canonical:canonical,hash:hash,payload:payload,version:version,place:place,add:add,remove:remove,prepare:prepare,printMode:printMode,pageSide:pageSide,setPrintMode:setPrintMode,addPage:addPage,removePage:removePage};
})();
