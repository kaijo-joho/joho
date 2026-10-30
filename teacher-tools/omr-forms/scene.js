/* SVG preview/print uses the compact editor layout and a fixed QR mask. */
var OMRScene=(function(){
  'use strict';var NS='http://www.w3.org/2000/svg',PT=25.4/72;
  function node(tag,attrs,text){var e=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){e.setAttribute(k,String(attrs[k]));});if(text!==undefined)e.textContent=text;return e;}
  function text(svg,x,y,value,pt,attrs){var n=node('text',Object.assign({x:x,y:y,'font-size':pt*PT,fill:'#000000'},attrs||{}),value);svg.append(n);return n;}
  function rect(svg,r,attrs){var n=node('rect',Object.assign({x:r[0],y:r[1],width:r[2],height:r[3],fill:'none',stroke:'#555','stroke-width':.22},attrs||{}));svg.append(n);return n;}
  function width(ch,pt){return(Array.from(ch).reduce(function(a,c){return a+(c.charCodeAt(0)<128?.54:1);},0))*pt*PT;}
  function wrap(value,w,pt){var lines=[],line='';Array.from(value).forEach(function(ch){if(ch==='\n'||line&&width(line+ch,pt)>w){lines.push(line);line='';if(ch==='\n')return;}line+=ch;});lines.push(line);return lines;}
  function shorten(value,w,pt){var chars=Array.from(value);if(width(value,pt)<=w)return value;while(chars.length&&width(chars.join('')+'…',pt)>w)chars.pop();return chars.join('')+'…';}
  function wrapped(svg,x,y,value,w,pt,leading,attrs){wrap(value,w,pt).forEach(function(line,i){text(svg,x,y+i*leading,line,pt,attrs);});}
  function rich(svg,e){var xx=e.x+1.5,yy=e.y+1,line=[],occupied=0,available=e.width-3;
    function flush(){var max=Math.max.apply(null,line.map(function(c){return c.run.font_size;}).concat([8]));var baseline=yy+max*PT;line.forEach(function(c){text(svg,xx,baseline,c.char,c.run.font_size,{fill:c.run.color,'font-weight':c.run.bold?'700':'400','font-style':c.run.italic?'italic':'normal','text-decoration':c.run.underline?'underline':'none'});xx+=width(c.char,c.run.font_size);});yy+=max*PT*1.32;xx=e.x+1.5;line=[];occupied=0;}
    e.runs.forEach(function(run){Array.from(run.text.replace(/\t/g,'    ')).forEach(function(ch){var cw=width(ch,run.font_size);if(ch==='\n'||line.length&&occupied+cw>available){flush();if(ch==='\n')return;}line.push({char:ch,run:run});occupied+=cw;});});if(line.length)flush();
  }
  async function render(d,pageIndex,token,options){options=options||{};var M=OMRDesigner,p=d.pages[pageIndex],g=M.layout(d,p),a=M.profile(d),s=a.s,mx=a.middle,hy=a.top;
    var svg=node('svg',{xmlns:NS,viewBox:'0 0 '+g.width_mm+' '+g.height_mm,width:g.width_mm+'mm',height:g.height_mm+'mm','font-family':'Hiragino Sans, Yu Gothic, sans-serif','data-paper-width':g.width_mm,'data-paper-height':g.height_mm});
    rect(svg,[0,0,g.width_mm,g.height_mm],{fill:'#ffffff',stroke:'none'});
    g.markers.forEach(function(r,i){rect(svg,r,{fill:'#000',stroke:'none','data-marker':g.marker_ids[i]});});
    var titleSize=9*s; text(svg,a.left,hy+4*s,shorten(d.title,mx-a.left-3*s,titleSize),titleSize,{'data-header':'title'});
    rect(svg,g.name_rect);text(svg,a.left,hy+21*s,'氏名',2.8*s/PT);
    g.digit_labels.forEach(function(t){text(svg,t[1],t[2],t[0],6*s,{'text-anchor':'middle','data-identity-heading':t[0]});});
    g.handwriting.forEach(function(b){rect(svg,b.rect,{'data-writing-role':b.role});if(b.role==='grade')text(svg,b.rect[0]+b.rect[2]+.5*s,b.rect[1]+4*s,'年',5*s);});
    var defs=new Map(p.fields.map(function(f){return[f.id,f];}));
    g.fields.forEach(function(fg){var f=defs.get(fg.field),role=fg.identity_role,target=svg;if(!role){var element=g.elements.find(function(e){return e.type==='omr'&&e.field_id===f.id;});target=node('g',{'data-element-id':element.id});svg.append(target);}
      if(role!=='grade')text(target,fg.title[0],fg.title[1],role?{class:'組',number:'番'}[role]:f.label,role?2.8*s/PT:9);
      var optionsMap=new Map((f.options||[]).map(function(o){return[o.code,o.label];}));
      fg.bubbles.forEach(function(b){target.append(node('circle',{cx:b.x,cy:b.y,r:b.r,fill:'none',stroke:'#000','stroke-width':.22,'data-field':f.id,'data-code':b.code}));
        if(role==='grade'&&d.grade.mode==='fixed'&&d.grade.premark&&b.code===d.grade.value)target.append(node('circle',{cx:b.x,cy:b.y,r:b.r*.86,fill:'#000'}));
        if(role==='grade'){text(target,b.x+2*s,b.y+1*s,['中1','中2','中3','高1','高2','高3'][Number(b.code)-1],5.5*s,{'data-grade-label':b.code});return;}
        if(role)return;
        if(f.kind==='digits'){if(b.place===0)text(target,b.x,b.y-2.6,b.code,6,{'text-anchor':'middle','data-digit-heading':b.code});if(b.code==='0')text(target,fg.title[0]+10,b.y+1,['一の位','十の位','百の位','千の位','万の位'][f.digits-b.place-1],6);}
        else if((f.layout||'row')==='list')wrapped(target,b.x+4,b.y+1,optionsMap.get(b.code),fg.width-11,8,3.8);
        else{var pitch=(fg.rect[2]-10)/f.options.length;wrapped(target,b.x,b.y+6,optionsMap.get(b.code),pitch-2,7.3,3.5,{'text-anchor':'middle'});}
      });
    });
    var qrText=await M.payload(d,p,token),code=qrcodegen.QrCode.encodeSegments(qrcodegen.QrSegment.makeSegments(qrText),qrcodegen.QrCode.Ecc.MEDIUM,1,40,0,false),matrixSize=code.size+8,step=g.qr[2]/matrixSize;
    if(step<.45)throw Error('QR識別情報が長すぎます。用紙ID・版を短くしてください');
    for(var row=0;row<code.size;row++)for(var col=0;col<code.size;col++)if(code.getModule(col,row))rect(svg,[g.qr[0]+(col+4)*step,g.qr[1]+(row+4)*step,step+.002,step+.002],{fill:'#000',stroke:'none'});
    var caption=d.academic_year+' '+d.form_id+' '+p.number+'/'+d.pages.length+' '+p.side;
    text(svg,g.qr[0],hy+a.qr_size+2.2*s,shorten(caption,a.qr_size,5*s),5*s,{'data-header':'caption'});
    svg.append(node('line',{x1:a.left,y1:g.body_top-1,x2:g.width_mm-10*s,y2:g.body_top-1,stroke:'#000','stroke-width':.25*s}));
    g.elements.forEach(function(e){var group=svg.querySelector('[data-element-id="'+e.id+'"]');if(!group){group=node('g',{'data-element-id':e.id});svg.append(group);}
      if(e.border===true||(e.border===undefined&&e.type==='free'))rect(group,M.rect(e),{'data-border':e.id});
      if(e.type==='text')rich(group,e);
      if(e.type==='free'){text(group,e.x+2,e.y+4,e.label,8);for(var i=0;i<e.lines;i++){var yy=e.y+6+(i+1)*(e.height-8)/(e.lines+1);group.append(node('line',{x1:e.x+2,y1:yy,x2:e.x+e.width-2,y2:yy,stroke:'#adb3bf','stroke-width':.15}));}}
      if(options.interactive){rect(group,M.rect(e),{fill:'transparent',stroke:e.id===options.selected?'#2d5ed3':'transparent','stroke-width':.6,'stroke-dasharray':'2 1','data-hit':e.id,class:'element-hit'});if(e.id===options.selected){[['n',e.x,e.y-1,e.width,2],['s',e.x,e.y+e.height-1,e.width,2],['w',e.x-1,e.y,2,e.height],['e',e.x+e.width-1,e.y,2,e.height]].forEach(function(h){rect(group,h.slice(1),{fill:'transparent',stroke:'none','data-resize':e.id,'data-edge':h[0],class:'resize-edge'});});[['nw',e.x,e.y],['n',e.x+e.width/2,e.y],['ne',e.x+e.width,e.y],['w',e.x,e.y+e.height/2],['e',e.x+e.width,e.y+e.height/2],['sw',e.x,e.y+e.height],['s',e.x+e.width/2,e.y+e.height],['se',e.x+e.width,e.y+e.height]].forEach(function(h){rect(group,[h[1]-1.5,h[2]-1.5,3,3],{fill:'#2d5ed3',stroke:'#fff','data-resize':e.id,'data-edge':h[0],class:'resize-handle'});});}}
    });
    return svg;
  }
  return{render:render,node:node,wrap:wrap};
})();
