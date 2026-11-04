/* SVG preview/print reserves QR space; drafts have no issued distribution QR. */
var OMRScene=(function(){
  'use strict';var NS='http://www.w3.org/2000/svg',PT=25.4/72;
  function node(tag,attrs,text){var e=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){e.setAttribute(k,String(attrs[k]));});if(text!==undefined)e.textContent=text;return e;}
  function text(svg,x,y,value,pt,attrs){var n=node('text',Object.assign({x:x,y:y,'font-size':pt*PT,fill:'#000000'},attrs||{}),value);svg.append(n);return n;}
  function rect(svg,r,attrs){var n=node('rect',Object.assign({x:r[0],y:r[1],width:r[2],height:r[3],fill:'none',stroke:'#555','stroke-width':.22},attrs||{}));svg.append(n);return n;}
  function width(ch,pt){return Array.from(ch).reduce(function(a,c){return a+OMRDesigner.charWidth(c,pt);},0);}
  function wrap(value,w,pt){var lines=[],line='';Array.from(value).forEach(function(ch){if(ch==='\n'||line&&width(line+ch,pt)>w){lines.push(line);line='';if(ch==='\n')return;}line+=ch;});lines.push(line);return lines;}
  function shorten(value,w,pt){var chars=Array.from(value);if(width(value,pt)<=w)return value;while(chars.length&&width(chars.join('')+'…',pt)>w)chars.pop();return chars.join('')+'…';}
  function wrapped(svg,x,y,value,w,pt,leading,attrs){wrap(value,w,pt).forEach(function(line,i){text(svg,x,y+i*leading,line,pt,attrs);});}
  function heading(svg,x,y,value,w){return text(svg,x,y,shorten(value,w,10),10,{'font-weight':'700'});}
  function richAt(svg,runs,x,y,w){var measure=OMRDesigner.measureRich(runs,w),yy=y;measure.lines.forEach(function(line){var baseline=yy+line.font_size*PT,container=node('text',{x:x,y:baseline,'font-size':line.font_size*PT,'xml:space':'preserve'}),chunks=[];
      line.chars.forEach(function(c){var r=c.run,key=[r.font_size,r.color,r.bold,r.italic,r.underline].join('|'),last=chunks[chunks.length-1];if(last&&last.key===key)last.text+=c.char;else chunks.push({key:key,text:c.char,run:r});});
      chunks.forEach(function(chunk){var r=chunk.run;container.append(node('tspan',{'font-size':r.font_size*PT,fill:r.color,'font-weight':r.bold?'700':'400','font-style':r.italic?'italic':'normal','text-decoration':r.underline?'underline':'none'},chunk.text));});if(chunks.length)svg.append(container);yy+=line.height;});return measure.height;}
  function rich(svg,e){var p=OMRDesigner.padding(e),w=OMRDesigner.contentWidth(e);if(e.label)heading(svg,e.x+p.left+.5,e.y+p.top+3,e.label,w-1);richAt(svg,e.runs,e.x+p.left,e.y+p.top+(e.label?5:0),w);}
  async function render(d,pageIndex,token,options){options=options||{};var M=OMRDesigner,p=d.pages[pageIndex],g=M.layout(d,p),a=M.profile(d),s=a.s,mx=a.middle,hy=a.top;
    var svg=node('svg',{xmlns:NS,viewBox:'0 0 '+g.width_mm+' '+g.height_mm,width:g.width_mm+'mm',height:g.height_mm+'mm','font-family':'Hiragino Sans, Yu Gothic, sans-serif','font-size':9*PT,'data-paper-width':g.width_mm,'data-paper-height':g.height_mm});
    rect(svg,[0,0,g.width_mm,g.height_mm],{fill:'#ffffff',stroke:'none'});
    g.markers.forEach(function(r,i){rect(svg,r,{fill:'#000',stroke:'none','data-marker':g.marker_ids[i]});});
    var titleSize=11*s,titleX=16; text(svg,titleX,hy+4*s,shorten(d.title,mx-titleX-3*s,titleSize),titleSize,{'data-header':'title','font-weight':'700'});
    rect(svg,g.name_rect);text(svg,16,hy+17*s,'氏名',2.8*s/PT);
    g.digit_labels.forEach(function(t){text(svg,t[1],t[2],t[0],6*s,{'text-anchor':'middle','data-identity-heading':t[0]});});
    g.handwriting.forEach(function(b){rect(svg,b.rect,{'data-writing-role':b.role});});
    var defs=new Map(p.fields.map(function(f){return[f.id,f];}));
    g.fields.forEach(function(fg){var f=defs.get(fg.field),role=fg.identity_role,target=svg;if(!role){var element=g.elements.find(function(e){return e.type==='omr'&&e.field_id===f.id;});target=node('g',{'data-element-id':element.id});svg.append(target);}
      if(role&&role!=='grade')text(target,fg.title[0],fg.title[1],{class:'組',number:'番'}[role],2.8*s/PT);else if(!role){var inset=M.padding(element),note=fg.choice&&fg.choice.note,noteWidth=note?width(note,6):0,reserved=note?noteWidth+2:0;heading(target,fg.title[0],fg.title[1],f.label,Math.max(0,fg.width-reserved));if(note)text(target,element.x+element.width-inset.right,fg.title[1],note,6,{'text-anchor':'end','data-choice-note':element.id});}
      if(!role){var prompt=node('g',{'data-question':element.id});target.append(prompt);richAt(prompt,element.question_runs||[],element.x+inset.left,element.y+inset.top+5,M.contentWidth(element));}
      var optionsMap=new Map((f.options||[]).map(function(o){return[o.code,o.label];}));
      fg.bubbles.forEach(function(b){var faded=role==='class'&&(b.code==='0'||b.code==='9')||role==='number'&&b.place===0&&Number(b.code)>=5;
        if(!role&&f.kind==='multiple')target.append(node('rect',{x:b.x-b.r,y:b.y-b.r,width:2*b.r,height:2*b.r,fill:'none',stroke:'#000','stroke-width':.22,'data-field':f.id,'data-code':b.code,'data-mark-shape':'square'}));else target.append(node('circle',{cx:b.x,cy:b.y,r:b.r,fill:'none',stroke:faded?'#888':'#000','stroke-width':.22,'data-field':f.id,'data-code':b.code,'data-place':b.place,'data-identity-hint':faded?'faded':'normal'}));
        if(role==='grade'&&d.grade.mode==='fixed'&&d.grade.premark&&b.code===d.grade.value)target.append(node('circle',{cx:b.x,cy:b.y,r:b.r*.86,fill:'#000'}));
        if(role==='grade'){text(target,b.x+2*s,b.y+1*s,['中1','中2','中3','高1','高2','高3'][Number(b.code)-1],5.5*s,{'data-grade-label':b.code});return;}
        if(role==='number'&&b.code==='0'){var right=fg.bubbles.reduce(function(n,v){return Math.max(n,v.x+v.r);},0);text(target,(right+g.qr[0])/2,b.y+.5*s,b.place===0?'（十の位）':'（一の位）',3.7*s,{fill:'#777','text-anchor':'middle','data-number-place':b.place===0?'tens':'ones'});}
        if(role)return;
        if(f.kind==='digits'){if(b.place===0)text(target,b.x,b.y-2.6,b.code,6,{'text-anchor':'middle','data-digit-heading':b.code});if(b.code==='0')text(target,fg.title[0]+10,b.y+1,['一の位','十の位','百の位','千の位','万の位'][f.digits-b.place-1],6);}
        else if((f.layout||'row')==='list')wrapped(target,b.x+4,b.y+1,optionsMap.get(b.code),fg.width-11,8,3.8);
        else{var pitch=(fg.width-6)/f.options.length;wrapped(target,b.x,b.y+6,optionsMap.get(b.code),pitch-2,7.3,3.5,{'text-anchor':'middle'});}
      });
    });
    var qr=node('g',{'data-qr-state':options.qrPayload?'issued':'unissued','aria-label':options.qrPayload?'登録用識別QR':'QR未発行・配付版未登録'});svg.append(qr);
    if(options.qrPayload){
      OMRRegistration.parse(options.qrPayload);
      var code=qrcodegen.QrCode.encodeSegments([qrcodegen.QrSegment.makeNumeric(options.qrPayload)],qrcodegen.QrCode.Ecc.HIGH,1,1,0,false),module=g.qr[2]/29;
      if(code.size!==21)throw Error('QRの規格が一致しません');
      rect(qr,g.qr,{fill:'#fff',stroke:'none'});
      var path='';for(var yy=0;yy<21;yy++)for(var xx=0;xx<21;xx++)if(code.getModule(xx,yy))path+='M'+(g.qr[0]+(xx+4)*module)+' '+(g.qr[1]+(yy+4)*module)+'h'+module+'v'+module+'h-'+module+'z';
      qr.append(node('path',{d:path,fill:'#000','shape-rendering':'crispEdges','data-qr-payload':options.qrPayload}));
    }else{
      rect(qr,g.qr,{stroke:'#777','stroke-dasharray':'1.2 1','data-qr-placeholder':'true'});
      text(qr,g.qr[0]+g.qr[2]/2,g.qr[1]+g.qr[3]/2,'QR未発行',7*s,{'text-anchor':'middle',fill:'#666'});
    }
    svg.append(node('line',{x1:16,y1:g.body_top-1,x2:g.width_mm-10*s,y2:g.body_top-1,stroke:'#000','stroke-width':.25*s}));
    g.elements.forEach(function(e){var group=svg.querySelector('[data-element-id="'+e.id+'"]');if(!group){group=node('g',{'data-element-id':e.id});svg.append(group);}
      if(e.border===true||(e.border===undefined&&e.type==='free'))rect(group,M.rect(e),{'data-border':e.id});
      if(e.type==='text')rich(group,e);
      if(e.type==='free'){var inset=M.padding(e);heading(group,e.x+inset.left,e.y+inset.top+3,e.label,M.contentWidth(e));var question=M.questionHeight(e);var prompt=node('g',{'data-question':e.id});group.append(prompt);richAt(prompt,e.question_runs||[],e.x+inset.left,e.y+inset.top+5,M.contentWidth(e));for(var i=0;i<e.lines;i++){var start=e.y+inset.top+5+question,yy=start+(i+1)*(e.y+e.height-inset.bottom-start)/(e.lines+1);group.append(node('line',{x1:e.x+inset.left,y1:yy,x2:e.x+e.width-inset.right,y2:yy,stroke:'#adb3bf','stroke-width':.15}));}}
      if(e.type==='entry'){var inset=M.padding(e);heading(group,e.x+inset.left,e.y+inset.top+3,e.label,M.contentWidth(e));var prompt=node('g',{'data-question':e.id});group.append(prompt);richAt(prompt,e.question_runs||[],e.x+inset.left,e.y+inset.top+5,M.contentWidth(e));rect(group,M.entryRect(e),{'data-entry-box':e.id});}
      if(options.interactive){rect(group,M.rect(e),{fill:'transparent',stroke:e.id===options.selected?'#2d5ed3':'transparent','stroke-width':.6,'stroke-dasharray':'2 1','data-hit':e.id,class:'element-hit'});if(e.id===options.selected){[['n',e.x,e.y-1,e.width,2],['s',e.x,e.y+e.height-1,e.width,2],['w',e.x-1,e.y,2,e.height],['e',e.x+e.width-1,e.y,2,e.height]].forEach(function(h){rect(group,h.slice(1),{fill:'transparent',stroke:'none','data-resize':e.id,'data-edge':h[0],class:'resize-edge'});});[['nw',e.x,e.y],['n',e.x+e.width/2,e.y],['ne',e.x+e.width,e.y],['w',e.x,e.y+e.height/2],['e',e.x+e.width,e.y+e.height/2],['sw',e.x,e.y+e.height],['s',e.x+e.width/2,e.y+e.height],['se',e.x+e.width,e.y+e.height]].forEach(function(h){rect(group,[h[1]-1.5,h[2]-1.5,3,3],{fill:'#2d5ed3',stroke:'#fff','data-resize':e.id,'data-edge':h[0],class:'resize-handle'});});}}
    });
    return svg;
  }
  function within(box,area,margin){return box&&[box.x,box.y,box.width,box.height].every(Number.isFinite)&&box.x>=area[0]-margin&&box.y>=area[1]-margin&&box.x+box.width<=area[0]+area[2]+margin&&box.y+box.height<=area[1]+area[3]+margin;}
  // getBBox describes glyph/layout cells; PDF clipping concerns painted pixels.
  // Keep a transparent margin so content outside the physical page is visible
  // to this check instead of being silently clipped by the SVG viewport.
  var paintCache=new Map(),PAINT_DPI=300,PAINT_PAD=24;
  function clearPaintCache(){paintCache.clear();}
  if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',clearPaintCache);
  async function paintedBounds(svg,source){
    var view=svg.getAttribute('viewBox').split(/\s+/).map(Number),w=view[2],h=view[3],imageSvg=svg.cloneNode(false),group=source.cloneNode(true);
    group.querySelectorAll('[data-hit],[data-resize]').forEach(function(n){n.remove();});imageSvg.removeAttribute('style');imageSvg.append(group);
    group.querySelectorAll('text').forEach(function(t){if(!t.textContent.trim())return;var x=Number(t.getAttribute('x')),y=Number(t.getAttribute('y'));if(!Number.isFinite(x)||!Number.isFinite(y)||x< -PAINT_PAD||x>w+PAINT_PAD||y< -PAINT_PAD||y>h+PAINT_PAD)throw Error('文字の配置が用紙から大きくはみ出しています。文字量や部品の幅・高さを調整してください。');});
    var scale=PAINT_DPI/25.4,width=Math.ceil((w+2*PAINT_PAD)*scale),height=Math.ceil((h+2*PAINT_PAD)*scale);
    imageSvg.setAttribute('viewBox',[-PAINT_PAD,-PAINT_PAD,w+2*PAINT_PAD,h+2*PAINT_PAD].join(' '));imageSvg.setAttribute('width',width);imageSvg.setAttribute('height',height);imageSvg.setAttribute('preserveAspectRatio','none');
    var serialized=imageSvg.outerHTML,pending=paintCache.get(serialized);
    if(!pending){pending=(async function(){
      var canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      try{
        var im=await new Promise(function(resolve,reject){var image=new Image();image.onload=function(){resolve(image);};image.onerror=function(){reject(Error('文字の描画範囲を検査できませんでした。もう一度お試しください。'));};image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(serialized);});
        var ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('描画範囲の検査に必要なCanvasを利用できません');ctx.clearRect(0,0,width,height);ctx.drawImage(im,0,0,width,height);
        var pixels=ctx.getImageData(0,0,width,height).data,x0=width,y0=height,x1=-1,y1=-1;
        for(var y=0;y<height;y++)for(var x=0,offset=(y*width)*4+3;x<width;x++,offset+=4)if(pixels[offset]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
        if(x1<0){if(group.textContent.trim())throw Error('文字を描画できませんでした。文字の位置や入力内容を確認してください。');return null;}
        if(x0===0||y0===0||x1===width-1||y1===height-1)throw Error('描画が検査範囲の外まで続いています。部品や文字の位置を用紙内へ戻してください。');
        var sx=width/(w+2*PAINT_PAD),sy=height/(h+2*PAINT_PAD);
        return{x:x0/sx-PAINT_PAD,y:y0/sy-PAINT_PAD,width:(x1-x0+1)/sx,height:(y1-y0+1)/sy};
      }finally{canvas.width=canvas.height=1;pixels=null;ctx=null;im=null;}
    })();paintCache.set(serialized,pending);if(paintCache.size>128)paintCache.delete(paintCache.keys().next().value);pending.catch(function(){if(paintCache.get(serialized)===pending)paintCache.delete(serialized);});}
    var box=await pending;return box&&Object.assign({},box);
  }
  function excess(box,area){return{left:Math.max(0,area[0]-box.x),top:Math.max(0,area[1]-box.y),right:Math.max(0,box.x+box.width-area[0]-area[2]),bottom:Math.max(0,box.y+box.height-area[1]-area[3])};}
  function excessText(over,margin){return Object.keys(over).filter(function(k){return over[k]>margin;}).map(function(k){return{left:'左',top:'上',right:'右',bottom:'下'}[k]+' '+over[k].toFixed(1)+'mm';}).join('・');}
  async function componentPaintBounds(svg,d,index){
    var p=d.pages[index],issues=[],paper=OMRDesigner.size(d);
    for(var e of p.elements){
      var source=svg.querySelector('[data-element-id="'+e.id+'"]');if(!source)throw Error('検査する部品が見つかりません');
      var box=await paintedBounds(svg,source);if(!box)continue;
      var area=OMRDesigner.rect(e),over=excess(box,area),outside=!within(box,area,.8),outsidePaper=!within(box,[0,0,paper[0],paper[1]],.1);
      if(outside||outsidePaper){
        var f=p.fields.find(function(f){return f.id===e.field_id;}),label=e.label||f&&f.label||'見出しなし',noun=e.type==='text'?'テキスト部品':e.type==='omr'?'OMR部品':'記入欄部品',content=e.type==='text'?'文字':e.type==='omr'?'文字または読取欄':'文字または記入枠';
        var paperOver=excess(box,[0,0,paper[0],paper[1]]);
        issues.push({elementId:e.id,type:e.type,method:'painted-pixels/300dpi',componentRect:area,box:box,excessMm:over,paperExcessMm:paperOver,message:noun+'「'+label+'」の'+content+'が'+(outsidePaper?'用紙':'部品')+'の範囲を超えています（'+excessText(outsidePaper?paperOver:over,outsidePaper?.1:.8)+'）。幅・高さを調整してください。'});
      }
    }return issues;
  }
  async function headerPaintBounds(svg){
    var group=node('g',{});svg.querySelectorAll('text').forEach(function(t){if(!t.closest('[data-element-id]')&&!t.closest('[data-qr-state]'))group.append(t.cloneNode(true));});return paintedBounds(svg,group);
  }
  return{render:render,node:node,wrap:wrap,componentPaintBounds:componentPaintBounds,headerPaintBounds:headerPaintBounds,clearPaintCache:clearPaintCache,within:within};
})();
