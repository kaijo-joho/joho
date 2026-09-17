/* 見た目を通常のパスへ展開する。元ページは変更しない。 */
(function(root){
  'use strict';
  const C=root.IlapoCore,I=[1,0,0,1,0,0];
  const hasStroke=o=>o.style.stroke!=='none'&&o.style.strokeWidth>0;
  const hasText=o=>o.type==='text'?o.runs.some(r=>r.text.trim()):o.type==='path'?!!o.label?.runs.some(r=>r.text.trim()):o.type==='connector'?!!o.label.trim():false;
  const checkPage=p=>C.validateDocument({format:'kaijo-ilapo',version:4,id:'outline-check',name:'',pages:[p]}).pages[0];
  function inspect(page,ids){
    const objects=page.objects.filter(o=>ids.includes(o.id));
    return {lines:objects.filter(o=>['path','connector'].includes(o.type)&&hasStroke(o)).length,text:objects.filter(hasText).length,locked:objects.some(o=>o.locked||page.layers?.some(l=>l.objectIds.includes(o.id)&&(!l.visible||l.locked))),images:objects.filter(o=>o.type==='image').length};
  }
  function convertPage(input,ids,options={}){
    const page=checkPage(input),known=new Set(C.expandSelection(page,ids)),info=inspect(page,[...known]);
    if(info.locked)throw Error('固定を解除してからアウトライン化してください。');
    if(!options.lines&&!options.text)throw Error('変換する線または文字を選んでください。');
    if(known.size>100)throw Error('一度に変換できるのは100個までです。選択を分けてください。');
    root.IlapoConnectors.sync(page);
    const mapping=new Map(),changed=new Set(),warnings=new Set();
    function makePath(source,d,fill,matrix=I){
      const style={...source.style,fill,stroke:'none',strokeWidth:0,dash:''};
      // This path is the former stroke.  Once it is painted as a fill, carry
      // the stroke channel's alpha across and discard irrelevant channels.
      if(source.style.strokeOpacity!==undefined)style.fillOpacity=source.style.strokeOpacity;
      else delete style.fillOpacity;
      delete style.strokeOpacity;
      return {id:C.uid('object'),type:'path',name:source.name,group:null,locked:false,matrix:matrix.slice(),style,d};
    }
    function expandStroke(source,local=false,keepFill=false){
      if(!hasStroke(source))return [{object:C.clone(source),channels:{fill:'fill',stroke:'stroke'}}];
      const work=local?{...source,matrix:I}:source,d=root.IlapoStrokeOutline.path(work);
      if(!d)throw Error('描画できる線の輪郭がありません。長さや線端を調整してください。');
      const edge=makePath(source,d,source.style.stroke,local?source.matrix:I),out=[];
      if(source.style.fill!=='none'||keepFill){
        let body={...C.clone(source),style:{...source.style,stroke:'none'}};delete body.style.strokeOpacity;delete body.label;
        // SVG applies opacity after painting fill and stroke. With separate
        // objects, cut their overlap only when the opaque former stroke hides
        // the fill.  A translucent stroke must retain the fill below it.
        const fillOpacity=source.style.fillOpacity===undefined?1:source.style.fillOpacity;
        const strokeOpacity=source.style.strokeOpacity===undefined?1:source.style.strokeOpacity;
        if(source.style.opacity<1&&strokeOpacity===1&&fillOpacity>0&&source.style.fill!=='none'){
          const cut=root.IlapoGeometry.boolean({...body,matrix:local?I:body.matrix},{...edge,matrix:local?I:edge.matrix},'subtract');
          body={...body,d:cut.d,matrix:local?source.matrix.slice():I.slice()};
        }else if(source.style.opacity<1&&strokeOpacity>0&&strokeOpacity<1&&fillOpacity>0&&source.style.fill!=='none'){
          warnings.add('全体不透明度と半透明の線を分けるため、重なる部分の濃さが変わる場合があります。');
        }
        if(body.d.trim())out.push({object:body,channels:{fill:'fill'}});
      }
      out.push({object:edge,channels:{stroke:'fill'}});return out;
    }
    function textParts(text){
      const result=root.IlapoTextOutline.convert(text,{fontId:options.fontId||'sans'});
      if(!result.objects.length)throw Error('文字の輪郭がありません。');
      for(const note of result.warnings||[])warnings.add(note);
      return result.objects.flatMap(glyph=>expandStroke(glyph,true,true));
    }
    function renderParts(source){
      const keepFill=(page.animations||[]).some(a=>a.effect==='color'&&a.channel==='fill'&&a.targets.includes(source.id));
      if(source.type==='text')return textParts(source);
      if(source.type==='connector'){
        warnings.add('変換した接続矢印は通常の図形になり、接続先への追従を終了します。');
        return root.IlapoConnectors.renderedParts(source,page).flatMap(part=>{
          if(part.type==='text')return (options.text?textParts(part):[{object:part,channels:{fill:'fill'}}]).map(item=>({...item,channels:{stroke:'fill'}}));
          return (options.lines&&hasStroke(part)?expandStroke(part):[{object:part,channels:{fill:'fill',stroke:'stroke'}}]).map(item=>({...item,channels:{stroke:item.object.style.fill!=='none'?'fill':'stroke'}}));
        });
      }
      const body=C.clone(source);delete body.label;
      const parts=options.lines&&hasStroke(body)?expandStroke(body,false,keepFill):[{object:body,channels:{fill:'fill',stroke:'stroke'}}];
      if(source.label){
        const text=root.IlapoTextLayout.shapeText(source);
        parts.push(...(options.text?textParts(text):[{object:text,channels:{}}]).map(item=>({...item,channels:{}})));
        warnings.add('図形内の文字は独立したパスまたは文字に分け、図形とグループにまとめます。');
      }
      return parts;
    }
    const output=[];
    for(const source of page.objects){
      const eligible=known.has(source.id)&&((options.text&&hasText(source))||(options.lines&&['path','connector'].includes(source.type)&&hasStroke(source)));
      if(!eligible){output.push(source);continue;}
      const parts=renderParts(source);
      if(!parts.length)throw Error('変換結果に図形がありません。');
      const group=source.group||(parts.length>1?C.uid('group'):null);
      if(parts.length>1&&(page.animations||[]).some(a=>a.effect==='fade'&&a.targets.includes(source.id)))warnings.add('複数の図形に分かれるため、フェード中に重なる部分の濃さが変わる場合があります。');
      parts.forEach((part,i)=>{part.object.id=i?C.uid('object'):source.id;part.object.name=i?source.name+'（'+(part.object.type==='text'?'文字':'輪郭')+'）':source.name;part.object.group=group;part.object.locked=false;part.object=C.validateObject(part.object);output.push(part.object);});
      mapping.set(source.id,{source,parts});changed.add(source.id);
      if(output.length>5000)throw Error('アウトライン化後の図形が多すぎます。選択を分けてください。');
    }
    page.objects=output;
    if(page.layers)page.layers.forEach(layer=>{layer.objectIds=layer.objectIds.flatMap(id=>mapping.has(id)?mapping.get(id).parts.map(p=>p.object.id):[id]);});
    // Retain motion/visibility on every resulting piece. Stroke-color effects
    // become fill-color effects only for the pieces that used to be strokes.
    if(page.animations)page.animations=page.animations.flatMap(animation=>{
      if(animation.effect!=='color')return [{...animation,targets:animation.targets.flatMap(id=>mapping.has(id)?mapping.get(id).parts.map(p=>p.object.id):[id])}];
      const channels=new Map();
      for(const id of animation.targets){
        const parts=mapping.get(id)?.parts||[{object:{id},channels:{fill:'fill',stroke:'stroke'}}];
        let retained=false;
        for(const part of parts){const channel=part.channels[animation.channel];if(!channel)continue;retained=true;if(!channels.has(channel))channels.set(channel,[]);channels.get(channel).push(part.object.id);}
        if(!retained)warnings.add('変換先がなくなった線色・塗り色の動きは解除されます。');
      }
      return [...channels].map(([channel,targets],i)=>({...animation,id:i?C.uid('animation'):animation.id,channel,targets:[...new Set(targets)],...(i?{trigger:'with',delay:0}:{})}));
    });
    for(const connector of page.objects.filter(o=>o.type==='connector'))for(const key of ['from','to']){
      const endpoint=connector[key],entry=mapping.get(endpoint.objectId);if(!entry)continue;
      const representative=entry.parts[0].object;
      if(endpoint.port!=='auto'&&(entry.source.type!==representative.type||JSON.stringify(entry.source.matrix)!==JSON.stringify(representative.matrix)))connector[key]=root.IlapoConnectors.attachmentAt(representative,endpoint);
    }
    root.IlapoConnectors.sync(page);
    const selection=new Set([...known,...[...mapping.values()].flatMap(entry=>entry.parts.map(p=>p.object.id))]);
    return {page:checkPage(page),ids:page.objects.filter(o=>selection.has(o.id)).map(o=>o.id),converted:changed.size,warnings:[...warnings]};
  }
  const api={inspect,convertPage};root.IlapoOutline=api;if(typeof module==='object'&&module.exports)module.exports=api;
}(globalThis));
