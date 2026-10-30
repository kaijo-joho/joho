/* Shared by the GAS editor and local preview. No network, credentials or user records. */
var OMRDesigner = (function () {
  'use strict';
  var sizes={B5:[182,257],A4:[210,297],B4:[257,364]};
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function id(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);}
  function role(f){return f.identity_role||(['grade','class','number'].includes(f.id)?f.id:null);}
  function size(d){var a=sizes[d.paper.size];return d.paper.orientation==='landscape'?[a[1],a[0]]:a.slice();}
  function profile(d){var a=size(d),w=a[0],h=a[1],s=Math.min(w/182,1.12),qr=(d.form_id.length+d.layout_version.length>45?32:24)*s;return {w:w,h:h,s:s,qr_size:qr,left:Math.min(w-170*s,17.5*s),middle:w-101*s,top:10*s,body_top:Math.round((10*s+qr+3*s+2)*1e6)/1e6};}
  function minSize(f){if(f.kind==='digits')return[98,10+9*f.digits];if((f.layout||'row')==='list')return[65,9+11*f.options.length];return[Math.max(48,8*f.options.length),27];}
  function rect(e){return[e.x,e.y,e.width,e.height];}
  function overlaps(a,b){return a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];}
  function fieldGeometry(f,e){var x=e.x,y=e.y,w=e.width,h=e.height,min=minSize(f);if(w<min[0]-.001||h<min[1]-.001)throw Error('OMR部品が小さすぎます: '+f.id);
    var g={field:f.id,kind:f.kind,identity_role:null,bubbles:[],title:[x+2,y+4],width:w-4,rect:rect(e)};
    if(f.kind==='digits'){for(var p=0;p<f.digits;p++)for(var digit=0;digit<10;digit++)g.bubbles.push({code:String(digit),place:p,x:x+35+digit*6,y:y+11+p*9,r:1.7});}
    else if((f.layout||'row')==='list')f.options.forEach(function(o,i){g.bubbles.push({code:String(o.code),place:0,x:x+4,y:y+11+i*11,r:1.7});});
    else{var pitch=(w-10)/f.options.length;f.options.forEach(function(o,i){g.bubbles.push({code:String(o.code),place:0,x:x+5+(i+.5)*pitch,y:y+12,r:1.7});});}return g;}
  function layout(d,p){var a=profile(d),w=a.w,h=a.h,s=a.s,edge=6.75*s,ms=3.5*s,front=p.side==='F',mx=a.middle,hy=a.top;
    var points=[['topLeft',edge,edge],['topRight',w-edge,edge],['bottomRight',w-edge,h-edge],['bottomLeft',edge,h-edge],
      ['leftOneThird',edge,h/3-(front?10:0)],['leftTwoThirds',edge,2*h/3+(front?10:0)],['rightOneThird',w-edge,h/3-(front?0:10)],['rightTwoThirds',w-edge,2*h/3+(front?0:16)],
      ['topCenter',w/2,edge],['bottomCenter',w/2,h-edge],['bindingTop',front?20*s:w-35.75*s,edge],['bindingBottom',front?20*s:w-20*s,h-edge],['oppositeBottomInner',front?w-20*s:20*s,h-edge]];
    var g={width_mm:w,height_mm:h,page:p.number,side:p.side,markers:points.map(function(v){return[v[1]-ms/2,v[2]-ms/2,ms,ms];}),marker_ids:points.map(function(v){return v[0];}),
      qr:[w-10*s-a.qr_size,hy,a.qr_size,a.qr_size],fields:[],header_rect:[a.left-1,hy-1,w-10*s-a.left+2,a.body_top-hy+1],body_top:a.body_top,handwriting:[],digit_labels:[]};
    for(var i=0;i<10;i++)g.digit_labels.push([String(i),mx+(14+4.5*i)*s,edge+1*s]);
    p.fields.forEach(function(f){var r=role(f);if(!r)return;
      if(r==='grade'){
        var grade={field:f.id,kind:f.kind,identity_role:r,bubbles:[],title:[a.left,hy+11*s],width:mx-a.left,rect:[a.left,hy+7*s,mx-a.left,6*s]};
        var gx=a.left+8*s, pitch=(mx-a.left-9*s)/6;
        Array.from('123456').forEach(function(code,i){grade.bubbles.push({code:code,place:0,x:gx+(i+.15)*pitch,y:hy+10*s,r:1.35*s});});
        g.handwriting.push({role:r,place:0,rect:[a.left,hy+7*s,5*s,6*s]});g.fields.push(grade);return;
      }
      var n=r==='number'?2:1,cy=hy+(7+ (r==='number'?1:0)*6.25)*s;
      var fg={field:f.id,kind:f.kind,identity_role:r,bubbles:[],title:[mx,cy+.95*s],width:60*s,rect:[mx-.7*s,cy-3.2*s,58*s,(n-1)*6.25*s+6.4*s]};
      for(var j=0;j<n;j++){var yy=cy+j*6.25*s;g.handwriting.push({role:r,place:j,rect:[mx+5*s,yy-3*s,6*s,6*s]});Array.from('0123456789').forEach(function(code){fg.bubbles.push({code:code,place:j,x:mx+(14+4.5*Number(code))*s,y:yy,r:1.75*s});});}g.fields.push(fg);
    });
    g.name_rect=[a.left+9*s,hy+16*s,mx-a.left-12*s,8*s];g.elements=clone(p.elements||[]);
    g.elements.forEach(function(e){if(e.type==='omr'){var f=p.fields.find(function(f){return f.id===e.field_id;});g.fields.push(fieldGeometry(f,e));}});
    g.panel_rect=[16,g.body_top,w-32,h-g.body_top-16];return g;}
  function validate(d){if(!d||d.schema!=='omr-form/1'||!id(d.form_id)||!id(d.layout_version))throw Error('用紙ID・版・形式を確認してください');
    if(d.geometry_version!==undefined&&d.geometry_version!=='editor-compact/1')throw Error('未対応の配置版です');
    if(!d.paper||!Object.prototype.hasOwnProperty.call(sizes,d.paper.size)||!['portrait','landscape'].includes(d.paper.orientation))throw Error('用紙サイズが不正です');
    if(d.paper.print_mode!==undefined&&!['single','duplex'].includes(d.paper.print_mode))throw Error('印刷方式が不正です');
    if(!Number.isInteger(d.academic_year)||d.academic_year<2000||d.academic_year>2199||!['applications','attendance','scores'].includes(d.purpose))throw Error('年度・用途を確認してください');
    if(typeof d.title!=='string'||!d.title||d.title.length>160)throw Error('用紙名を入力してください');
    if(!d.grade||!['field','fixed','context'].includes(d.grade.mode)||!Array.isArray(d.grade.allowed)||(d.grade.mode==='fixed'&&((typeof d.grade.value!=='string'||!/^[1-6]$/.test(d.grade.value))||typeof d.grade.premark!=='boolean')))throw Error('学年設定が不正です');
    if(!Array.isArray(d.pages)||!d.pages.length||d.pages.length>8)throw Error('ページ数は1〜8です');var fields=new Set();
    d.pages.forEach(function(p,i){if(p.number!==i+1||p.side!==pageSide(d,i)||!Array.isArray(p.fields)||!Array.isArray(p.elements))throw Error('ページ定義を確認してください');
      if(p.elements.length>80)throw Error('部品は1ページ80個までです');var roles=new Set();
      p.fields.forEach(function(f){if(!id(f.id)||fields.has(f.id)||typeof f.label!=='string'||f.label.length>180||typeof f.required!=='boolean')throw Error('読取欄ID・名前・必須性が不正です');fields.add(f.id);
        var rr=role(f);if(rr){if(!['grade','class','number'].includes(rr)||roles.has(rr))throw Error('識別欄が重複しています');roles.add(rr);}
        if(f.kind==='digits'){if(!Number.isInteger(f.digits)||f.digits<1||f.digits>5||!Number.isInteger(f.min)||!Number.isInteger(f.max)||f.min<0||f.max<f.min||f.max>=Math.pow(10,f.digits))throw Error('数値の桁・範囲が不正です');if(rr&&f.digits!==(rr==='number'?2:1))throw Error('組は1桁・番号は2桁です');}
        else if(['single','multiple'].includes(f.kind)){if(!Array.isArray(f.options)||f.options.length<2||f.options.length>12)throw Error('選択肢は2〜12個です');var codes=new Set();f.options.forEach(function(o){if(typeof o.code!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(o.code)||codes.has(o.code)||typeof o.label!=='string'||o.label.length>180)throw Error('選択肢コード・表示名を確認してください');codes.add(o.code);});if(rr==='grade'&&(f.kind!=='single'||f.options.map(function(o){return o.code;}).join('')!=='123456'))throw Error('学年は1〜6の列です');
          if(f.kind==='multiple'&&(!Number.isInteger(f.min_select)||!Number.isInteger(f.max_select)||f.min_select<0||f.max_select<f.min_select||f.max_select>f.options.length))throw Error('選択数が不正です');}
        else throw Error('読取形式が不正です');});
      var ids=new Set(),placed=new Set(),a=profile(d);
      p.elements.forEach(function(e,j){if(!id(e.id)||ids.has(e.id)||!['text','free','omr'].includes(e.type))throw Error('部品ID・種類が不正です');ids.add(e.id);
        ['x','y','width','height'].forEach(function(k){if(typeof e[k]!=='number'||!Number.isFinite(e[k])||Math.abs(e[k])>500)throw Error('配置・サイズが不正です');});
        if(e.border!==undefined&&typeof e.border!=='boolean')throw Error('枠線設定が不正です');
        if(e.width<=0||e.height<=0||e.x<12||e.y<a.body_top||e.x+e.width>a.w-12+.001||e.y+e.height>a.h-16+.001)throw Error('部品が本文の範囲外です: '+e.id);
        for(var n=0;n<j;n++)if(overlaps(rect(e),rect(p.elements[n])))throw Error('部品が重なっています: '+e.id);
        if(e.type==='omr'){var f=p.fields.find(function(f){return f.id===e.field_id;});if(!f||role(f)||placed.has(f.id))throw Error('読取欄と部品の対応が不正です');placed.add(f.id);fieldGeometry(f,e);}
        if(e.type==='free'&&(typeof e.label!=='string'||e.label.length>180||!Number.isInteger(e.lines)||e.lines<0||e.lines>30))throw Error('自由記述欄を確認してください');
        if(e.type==='text'){if(!Array.isArray(e.runs)||!e.runs.length||e.runs.length>1000)throw Error('テキストを入力してください');var count=0;e.runs.forEach(function(r){if(typeof r.text!=='string')throw Error('テキスト形式が不正です');count+=r.text.length;if(!Number.isFinite(r.font_size)||r.font_size<6||r.font_size>48||!/^#[0-9a-f]{6}$/i.test(r.color)||['bold','italic','underline'].some(function(k){return typeof r[k]!=='boolean';}))throw Error('文字書式が不正です');});if(count>20000)throw Error('文字数が上限を超えています');}
      });p.fields.forEach(function(f){if(!role(f)&&!placed.has(f.id))throw Error('未配置の読取欄があります: '+f.id);});
    });if(!fields.has('class')||!fields.has('number')||(d.grade.mode==='field'&&!fields.has('grade')))throw Error('年組番の共通欄が必要です');return d;}
  function canonical(v){if(Array.isArray(v))return'['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+canonical(v[k]);}).join(',')+'}';return JSON.stringify(v);}
  async function hash(d){var raw=new TextEncoder().encode(canonical(d));var bytes=await crypto.subtle.digest('SHA-256',raw);return Array.from(new Uint8Array(bytes)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}
  async function payload(d,p,token){var fingerprint=await hash(d);return['OMRF1',d.form_id,d.layout_version,d.academic_year,d.paper.size+d.paper.orientation[0].toUpperCase(),p.number+'/'+d.pages.length+p.side,fingerprint.slice(0,16),token].join('|');}
  function fresh(prefix){return prefix+'-'+Math.random().toString(16).slice(2,10);}
  function version(){return 'v2-'+Date.now().toString(36)+'-'+Math.random().toString(16).slice(2,6);}
  function place(d,p,w,h){var a=profile(d);for(var y=a.body_top+2;y+h<=a.h-16;y+=4)for(var x=16;x+w<=a.w-12;x+=4){var r=[x,y,w,h];if(!p.elements.some(function(e){return overlaps(r,rect(e));}))return{x:Math.round(x*100)/100,y:Math.round(y*100)/100};}throw Error('部品を置く空きがありません。配置を調整するかページを追加してください');}
  function add(d,index,type,kind){var p=d.pages[index],a=profile(d),e={id:fresh('block'),type:type,border:type==='free',width:Math.min(120,a.w-32),height:type==='free'?24:18};
    if(type==='text')e.runs=[{text:'テキストを入力',font_size:9,color:'#000000',bold:false,italic:false,underline:false}];
    if(type==='free'){e.label='自由記述';e.lines=3;}
    if(type==='omr'){var f={id:fresh('q'),label:kind==='digits'?'得点・数値':'設問',kind:kind,required:true};if(kind==='digits'){f.digits=2;f.min=0;f.max=99;}else{f.layout='row';f.options=[{code:'option_1',label:'選択肢1'},{code:'option_2',label:'選択肢2'}];if(kind==='multiple'){f.min_select=1;f.max_select=2;}}var minimum=minSize(f);e.width=Math.max(e.width,minimum[0]);e.height=minimum[1];e.field_id=f.id;var pos=place(d,p,e.width,e.height);e.x=pos.x;e.y=pos.y;p.fields.push(f);p.elements.push(e);return e;}
    var position=place(d,p,e.width,e.height);e.x=position.x;e.y=position.y;p.elements.push(e);return e;}
  function remove(d,index,elementId){var p=d.pages[index],e=p.elements.find(function(e){return e.id===elementId;});if(!e)throw Error('部品が見つかりません');p.elements=p.elements.filter(function(e){return e.id!==elementId;});if(e.type==='omr')p.fields=p.fields.filter(function(f){return f.id!==e.field_id;});}
  function printMode(d){return d.paper.print_mode||((d.pages||[]).some(function(p){return p.side==='B';})?'duplex':'single');}
  function prepare(d){var result=clone(d),changed=false;if(result.geometry_version===undefined){result.geometry_version='editor-compact/1';changed=true;}else if(result.geometry_version!=='editor-compact/1')throw Error('未対応の配置版です');if(result.paper.print_mode===undefined){result.paper.print_mode=printMode(result);changed=true;}if(changed)result.layout_version=version();return result;}
  function pageSide(d,index){return printMode(d)==='duplex'&&index%2?'B':'F';}
  function setPrintMode(d,mode){if(!['single','duplex'].includes(mode))throw Error('印刷方式が不正です');d.paper.print_mode=mode;d.pages.forEach(function(p,i){p.side=pageSide(d,i);});}
  function addPage(d){if(d.pages.length>=8)throw Error('8ページまでです');var number=d.pages.length+1,p={number:number,side:pageSide(d,number-1),fields:[],elements:[]};d.pages[0].fields.filter(role).forEach(function(f){var value=clone(f);value.id='p'+number+'_'+role(f);value.identity_role=role(f);value.required=false;p.fields.push(value);});d.pages.push(p);return d.pages.length-1;}
  return{clone:clone,role:role,size:size,profile:profile,minSize:minSize,rect:rect,overlaps:overlaps,layout:layout,validate:validate,canonical:canonical,hash:hash,payload:payload,version:version,place:place,add:add,remove:remove,prepare:prepare,printMode:printMode,pageSide:pageSide,setPrintMode:setPrintMode,addPage:addPage};
})();
