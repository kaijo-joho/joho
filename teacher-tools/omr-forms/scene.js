/* SVG preview/print uses the compact editor layout and a fixed QR mask. */
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
  function richAt(svg,runs,x,y,w){var measure=OMRDesigner.measureRich(runs,w),yy=y;measure.lines.forEach(function(line){var baseline=yy+line.font_size*PT,container=node('text',{x:x,y:baseline,'xml:space':'preserve'}),chunks=[];
      line.chars.forEach(function(c){var r=c.run,key=[r.font_size,r.color,r.bold,r.italic,r.underline].join('|'),last=chunks[chunks.length-1];if(last&&last.key===key)last.text+=c.char;else chunks.push({key:key,text:c.char,run:r});});
      chunks.forEach(function(chunk){var r=chunk.run;container.append(node('tspan',{'font-size':r.font_size*PT,fill:r.color,'font-weight':r.bold?'700':'400','font-style':r.italic?'italic':'normal','text-decoration':r.underline?'underline':'none'},chunk.text));});if(chunks.length)svg.append(container);yy+=line.height;});return measure.height;}
  function rich(svg,e){if(e.label)heading(svg,e.x+2,e.y+4,e.label,e.width-4);richAt(svg,e.runs,e.x+1.5,e.y+(e.label?6:1),e.width-3);}
  async function render(d,pageIndex,token,options){options=options||{};var M=OMRDesigner,p=d.pages[pageIndex],g=M.layout(d,p),a=M.profile(d),s=a.s,mx=a.middle,hy=a.top;
    var svg=node('svg',{xmlns:NS,viewBox:'0 0 '+g.width_mm+' '+g.height_mm,width:g.width_mm+'mm',height:g.height_mm+'mm','font-family':'Hiragino Sans, Yu Gothic, sans-serif','data-paper-width':g.width_mm,'data-paper-height':g.height_mm});
    rect(svg,[0,0,g.width_mm,g.height_mm],{fill:'#ffffff',stroke:'none'});
    g.markers.forEach(function(r,i){rect(svg,r,{fill:'#000',stroke:'none','data-marker':g.marker_ids[i]});});
    var titleSize=11*s,titleX=16; text(svg,titleX,hy+4*s,shorten(d.title,mx-titleX-3*s,titleSize),titleSize,{'data-header':'title','font-weight':'700'});
    rect(svg,g.name_rect);text(svg,16,hy+17*s,'氏名',2.8*s/PT);
    g.digit_labels.forEach(function(t){text(svg,t[1],t[2],t[0],6*s,{'text-anchor':'middle','data-identity-heading':t[0]});});
    g.handwriting.forEach(function(b){rect(svg,b.rect,{'data-writing-role':b.role});});
    var defs=new Map(p.fields.map(function(f){return[f.id,f];}));
    g.fields.forEach(function(fg){var f=defs.get(fg.field),role=fg.identity_role,target=svg;if(!role){var element=g.elements.find(function(e){return e.type==='omr'&&e.field_id===f.id;});target=node('g',{'data-element-id':element.id});svg.append(target);}
      if(role&&role!=='grade')text(target,fg.title[0],fg.title[1],{class:'組',number:'番'}[role],2.8*s/PT);else if(!role){var note=fg.choice&&fg.choice.note,noteWidth=note?width(note,6):0,reserved=note?noteWidth+2:0;heading(target,fg.title[0],fg.title[1],f.label,Math.max(0,fg.width-reserved));if(note)text(target,element.x+element.width-2,fg.title[1],note,6,{'text-anchor':'end','data-choice-note':element.id});}
      if(!role){var prompt=node('g',{'data-question':element.id});target.append(prompt);richAt(prompt,element.question_runs||[],element.x+2,element.y+6,element.width-4);}
      var optionsMap=new Map((f.options||[]).map(function(o){return[o.code,o.label];}));
      fg.bubbles.forEach(function(b){if(!role&&f.kind==='multiple')target.append(node('rect',{x:b.x-b.r,y:b.y-b.r,width:2*b.r,height:2*b.r,fill:'none',stroke:'#000','stroke-width':.22,'data-field':f.id,'data-code':b.code,'data-mark-shape':'square'}));else target.append(node('circle',{cx:b.x,cy:b.y,r:b.r,fill:'none',stroke:'#000','stroke-width':.22,'data-field':f.id,'data-code':b.code}));
        if(role==='grade'&&d.grade.mode==='fixed'&&d.grade.premark&&b.code===d.grade.value)target.append(node('circle',{cx:b.x,cy:b.y,r:b.r*.86,fill:'#000'}));
        if(role==='grade'){text(target,b.x+2*s,b.y+1*s,['中1','中2','中3','高1','高2','高3'][Number(b.code)-1],5.5*s,{'data-grade-label':b.code});return;}
        if(role)return;
        if(f.kind==='digits'){if(b.place===0)text(target,b.x,b.y-2.6,b.code,6,{'text-anchor':'middle','data-digit-heading':b.code});if(b.code==='0')text(target,fg.title[0]+10,b.y+1,['一の位','十の位','百の位','千の位','万の位'][f.digits-b.place-1],6);}
        else if((f.layout||'row')==='list')wrapped(target,b.x+4,b.y+1,optionsMap.get(b.code),fg.width-11,8,3.8);
        else{var pitch=(fg.rect[2]-10)/f.options.length;wrapped(target,b.x,b.y+6,optionsMap.get(b.code),pitch-2,7.3,3.5,{'text-anchor':'middle'});}
      });
    });
    var qrText=await M.payload(d,p,token),code=qrcodegen.QrCode.encodeSegments(qrcodegen.QrSegment.makeSegments(qrText),qrcodegen.QrCode.Ecc.HIGH,1,40,0,false),matrixSize=code.size+8,step=g.qr[2]/matrixSize;
    if(step<.45)throw Error('QR識別情報が長すぎます。用紙ID・版を短くしてください');
    for(var row=0;row<code.size;row++)for(var col=0;col<code.size;col++)if(code.getModule(col,row))rect(svg,[g.qr[0]+(col+4)*step,g.qr[1]+(row+4)*step,step+.002,step+.002],{fill:'#000',stroke:'none'});
    svg.append(node('line',{x1:16,y1:g.body_top-1,x2:g.width_mm-10*s,y2:g.body_top-1,stroke:'#000','stroke-width':.25*s}));
    g.elements.forEach(function(e){var group=svg.querySelector('[data-element-id="'+e.id+'"]');if(!group){group=node('g',{'data-element-id':e.id});svg.append(group);}
      if(e.border===true||(e.border===undefined&&e.type==='free'))rect(group,M.rect(e),{'data-border':e.id});
      if(e.type==='text')rich(group,e);
      if(e.type==='free'){heading(group,e.x+2,e.y+4,e.label,e.width-4);var question=M.questionHeight(e);var prompt=node('g',{'data-question':e.id});group.append(prompt);richAt(prompt,e.question_runs||[],e.x+2,e.y+6,e.width-4);for(var i=0;i<e.lines;i++){var start=e.y+6+question,yy=start+(i+1)*(e.y+e.height-2-start)/(e.lines+1);group.append(node('line',{x1:e.x+2,y1:yy,x2:e.x+e.width-2,y2:yy,stroke:'#adb3bf','stroke-width':.15}));}}
      if(e.type==='entry'){heading(group,e.x+2,e.y+4,e.label,e.width-4);var prompt=node('g',{'data-question':e.id});group.append(prompt);richAt(prompt,e.question_runs||[],e.x+2,e.y+6,e.width-4);rect(group,[e.x+2,e.y+6+M.questionHeight(e),e.width-4,Math.max(8,e.height-8-M.questionHeight(e))],{'data-entry-box':e.id});}
      if(options.interactive){rect(group,M.rect(e),{fill:'transparent',stroke:e.id===options.selected?'#2d5ed3':'transparent','stroke-width':.6,'stroke-dasharray':'2 1','data-hit':e.id,class:'element-hit'});if(e.id===options.selected){[['n',e.x,e.y-1,e.width,2],['s',e.x,e.y+e.height-1,e.width,2],['w',e.x-1,e.y,2,e.height],['e',e.x+e.width-1,e.y,2,e.height]].forEach(function(h){rect(group,h.slice(1),{fill:'transparent',stroke:'none','data-resize':e.id,'data-edge':h[0],class:'resize-edge'});});[['nw',e.x,e.y],['n',e.x+e.width/2,e.y],['ne',e.x+e.width,e.y],['w',e.x,e.y+e.height/2],['e',e.x+e.width,e.y+e.height/2],['sw',e.x,e.y+e.height],['s',e.x+e.width/2,e.y+e.height],['se',e.x+e.width,e.y+e.height]].forEach(function(h){rect(group,[h[1]-1.5,h[2]-1.5,3,3],{fill:'#2d5ed3',stroke:'#fff','data-resize':e.id,'data-edge':h[0],class:'resize-handle'});});}}
    });
    return svg;
  }
  return{render:render,node:node,wrap:wrap};
})();
