/* 接続の操作と、選択した矢印の経路を見ながら設定するパネル。 */
(function(root){
  'use strict';
  root.IlapoConnectorUI={create:function(ctx){
    const C=root.IlapoCore,K=root.IlapoConnectors,G=root.IlapoGeometry;
    const $=id=>document.getElementById(id),esc=ctx.esc;
    let pending=null,active=null,activeOwner=null,attachmentPreview=null;
    const drawing=()=>['connector','connector-orthogonal'].includes(ctx.tool());
    // The editor supplies layer predicates.  Keep legacy embeddings working without them.
    const isVisible=(object,page=ctx.page())=>!!object&&(ctx.isVisible?ctx.isVisible(object,page):true);
    const isLocked=(object,page=ctx.page())=>!!object&&(ctx.isLocked?ctx.isLocked(object,page):!!object.locked);
    const editableObject=(object,page=ctx.page())=>isVisible(object,page)&&!isLocked(object,page);
    const canInsert=()=>ctx.canInsert?ctx.canInsert():true;
    function clearPending(){if(pending)ctx.clearToast?.();pending=null;}
    const current=()=>ctx.page().objects.find(o=>ctx.selected().length===1&&o.id===ctx.selected()[0]&&o.type==='connector'&&isVisible(o));
    const endpoint=(p,id=null)=>({x:p.x,y:p.y,objectId:id,port:'auto',ratio:.5});
    function targetAt(event,p,pin=false){
      attachmentPreview=null;
      if(event.altKey)return endpoint(ctx.snap(p,event));
      const objects=ctx.page().objects.filter(object=>isVisible(object));
      let hit=document.elementsFromPoint(event.clientX,event.clientY).map(el=>el.closest('[data-object]')?.dataset.object).map(id=>objects.find(o=>o.id===id&&o.type!=='connector'&&!(o.type==='image'&&o.reference))).find(Boolean);
      const tolerance=12/ctx.zoom();
      if(!hit){
        for(const object of objects.slice().reverse()){
          if(object.type==='connector'||object.type==='image'&&object.reference)continue;
          const b=G.bounds(object);if(p.x<b.x-tolerance||p.x>b.x+b.width+tolerance||p.y<b.y-tolerance||p.y>b.y+b.height+tolerance)continue;
          const at=K.attachmentAt(object,p);if(Math.hypot(at.x-p.x,at.y-p.y)<=tolerance){hit=object;pin=true;break;}
        }
      }
      if(hit){
        let at=K.attachmentAt(hit,p);
        const ports=['top','right','bottom','left'].flatMap(port=>[0,.25,.5,.75,1].map(ratio=>({...K.portPoint(hit,port,ratio),objectId:hit.id,port,ratio})));
        const nearest=ports.reduce((best,q)=>Math.hypot(q.x-p.x,q.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?q:best);
        if(Math.hypot(nearest.x-p.x,nearest.y-p.y)<=tolerance)at=nearest;
        else if(!pin&&Math.hypot(at.x-p.x,at.y-p.y)>tolerance)at=endpoint(p,hit.id);
        attachmentPreview={object:hit,ports,at:at.port==='auto'?K.attachmentAt(hit,p):at};
        return at;
      }
      return endpoint(ctx.snap(p,event));
    }
    function newConnector(a,b){const size=ctx.standardSize(),elbow=ctx.tool()==='connector-orthogonal';return K.make(a,b,{name:elbow?'カギ型矢印':'接続矢印',route:elbow?'orthogonal':'straight',style:{stroke:'#1E3A5F',fill:'none',strokeWidth:Math.max(.04,size/80),fontSize:Math.max(.2,size*.12),linecap:'round',linejoin:'round'}});}
    function pointerDown(event,p,base){
      if(drawing()){
        if(!canInsert()){ctx.toast('現在のレイヤーが非表示または固定のため追加できません。');return true;}
        const a=pending||targetAt(event,p),b=targetAt(event,p),completing=!!pending;
        ctx.setDrag({kind:'connector-new',start:p,base,originalSelection:ctx.selected().slice(),connector:newConnector(a,b),completing});return true;
      }
      const handle=event.target.closest('[data-connection-handle]')?.dataset.connectionHandle,hit=event.target.closest('[data-object]')?.dataset.object;
      const o=current();
      if(ctx.tool()==='direct'&&o&&handle){
        if(!editableObject(o)||!ctx.editable())return true;active=handle;activeOwner=o.id;
        ctx.setDrag({kind:'connector-handle',start:p,base,originalSelection:ctx.selected().slice(),id:o.id,handle});return true;
      }
      if(ctx.tool()==='direct'&&ctx.page().objects.some(o=>o.id===hit&&o.type==='connector'&&isVisible(o))){
        active=null;ctx.select(event.shiftKey?[...new Set([...ctx.selected(),hit])]:[hit]);return true;
      }
      return false;
    }
    function pointerMove(event,p,d){
      if(d.kind==='connector-new'){
        d.connector.to=targetAt(event,p);const result=C.clone(d.base);result.objects.push(C.clone(d.connector));K.sync(result);ctx.setPreview(result);return true;
      }
      if(d.kind!=='connector-handle')return false;
      const result=C.clone(d.base),o=result.objects.find(o=>o.id===d.id),sp=ctx.snap(p,event);
      if(d.handle==='from'||d.handle==='to')o[d.handle]=targetAt(event,p,true);
      else if(d.handle.startsWith('segment:')){
        const index=Number(d.handle.split(':')[1]),at=K.points(o)[index],position=ctx.snap({x:at.x+p.x-d.start.x,y:at.y+p.y-d.start.y},event);
        try{Object.assign(o,K.moveSegment(o,index,position));}catch(error){ctx.toast(error.message);return true;}
      }
      else if(d.handle==='label'){o.labelOffset.x+=p.x-d.start.x;o.labelOffset.y+=p.y-d.start.y;}
      else o.waypoints[Number(d.handle)]={x:sp.x,y:sp.y};
      K.sync(result);ctx.setPreview(result);return true;
    }
    function finishDrag(d,result){
      attachmentPreview=null;
      if(d.kind==='connector-new'){
        if(d.moved||d.completing){
          const o=result?.objects.find(o=>o.id===d.connector.id)||d.connector;
          if(Math.hypot(o.from.x-o.to.x,o.from.y-o.to.y)<1e-7&&!o.from.objectId&&!o.to.objectId){pending=null;ctx.toast('終点を別の位置に指定してください。');return true;}
          if(canInsert()&&ctx.changePage(p=>p.objects.push(o))){clearPending();ctx.setTool('direct');ctx.select([o.id]);}
        }else{pending=C.clone(d.connector.from);ctx.toast('終点をクリックしてください。Escapeで取り消せます。');}
        return true;
      }
      if(d.kind==='connector-handle'){if(d.moved&&result)ctx.changePage(p=>p.objects=result.objects);return true;}return false;
    }
    function render(page,z){
      let target='';
      if(attachmentPreview&&isVisible(attachmentPreview.object,page)){const {object,ports,at}=attachmentPreview,b=G.bounds(object);target=`<g class="connection-target" pointer-events="none"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="#16835d" stroke-width="${1/z}" stroke-dasharray="${4/z} ${3/z}"/>${ports.map(q=>`<circle cx="${q.x}" cy="${q.y}" r="${3/z}" fill="#fff" stroke="#16835d" stroke-width="${1/z}"/>`).join('')}<circle cx="${at.x}" cy="${at.y}" r="${7/z}" fill="#16835d" stroke="#fff" stroke-width="${2/z}"/></g>`;}
      if(drawing())return target+(pending?`<circle cx="${pending.x}" cy="${pending.y}" r="${6/z}" fill="#fff" stroke="#2563eb" stroke-width="${2/z}"/>`:'');
      const id=current()?.id,o=page.objects.find(o=>o.id===id);
      if(ctx.tool()!=='direct'||!o||!isVisible(o,page))return null;
      if(isLocked(o,page))return '';
      let segments='';const hitRadius=matchMedia('(pointer:coarse)').matches?22:14;
      if(o.route==='orthogonal'){
        const list=K.points(o);
        segments=list.slice(1).map((b,i)=>{const a=list[i];if(Math.hypot(b.x-a.x,b.y-a.y)*z<hitRadius*2+8)return '';const x=(a.x+b.x)/2,y=(a.y+b.y)/2,key='segment:'+i,vertical=a.x===b.x;
          return `<g data-connection-handle="${key}" style="cursor:${vertical?'ew':'ns'}-resize"><title>折れ曲がり位置を${vertical?'左右':'上下'}にドラッグ</title><circle cx="${x}" cy="${y}" r="${22/z}" fill="transparent"/><rect x="${x-4/z}" y="${y-4/z}" width="${8/z}" height="${8/z}" rx="${1/z}" fill="${active===key?'#2563eb':'#dbeafe'}" stroke="#2563eb" stroke-width="${1.5/z}"/></g>`;
        }).join('');
      }
      const handles=[['from',o.from],...o.waypoints.map((p,i)=>[String(i),p]),['to',o.to]];
      const label=K.renderedParts(o).find(p=>p.type==='text');if(label){const b=G.bounds(label);handles.push(['label',{x:b.x+b.width/2,y:b.y+b.height/2}]);}
      return target+segments+handles.map(([key,p])=>`<g data-connection-handle="${key}" style="cursor:move"><title>${key==='from'?'始点の接続位置':key==='to'?'終点の接続位置':key==='label'?'ラベルの位置':'折れ曲がり点'}をドラッグ</title><circle cx="${p.x}" cy="${p.y}" r="${hitRadius/z}" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="${(key==='label'?4:5)/z}" fill="${active===key?'#2563eb':p.objectId?'#dcfce7':'#fff'}" stroke="${key==='label'?'#9333ea':p.objectId?'#16835d':'#2563eb'}" stroke-width="${1.5/z}"/></g>`).join('');
    }
    function addBetween(){
      if(!canInsert()){ctx.toast('現在のレイヤーが非表示または固定のため追加できません。');return;}
      const objects=ctx.page().objects.filter(o=>ctx.selected().includes(o.id)&&isVisible(o)&&o.type!=='connector'&&!(o.type==='image'&&o.reference));
      if(objects.length!==2){ctx.toast('接続する図形を2つ選んでください。');return;}
      const ends=objects.map(o=>{const b=G.bounds(o);return endpoint({x:b.x+b.width/2,y:b.y+b.height/2},o.id);}),o=newConnector(...ends);
      if(ctx.changePage(p=>p.objects.push(o))){ctx.setTool('direct');ctx.select([o.id]);}
    }
    function addWaypoint(p){
      const o=current();if(!o||!editableObject(o)||!ctx.editable())return;const list=o.route==='orthogonal'?K.points(o):[o.from,...o.waypoints,o.to];let nearest={distance:Infinity,index:0};
      list.slice(1).forEach((b,i)=>{const a=list[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(distance<nearest.distance)nearest={distance,index:i};});
      const points=list.slice(1,-1).map(q=>({x:q.x,y:q.y}));if(points.length>=100){ctx.toast('折れ曲がり点は100個までです。');return;}
      points.splice(nearest.index,0,{x:p.x,y:p.y});
      if(ctx.changePage(page=>page.objects.find(v=>v.id===o.id).waypoints=points)){active=String(nearest.index);activeOwner=o.id;}
    }
    function doubleClick(event,p,target=event.target){if(ctx.tool()!=='direct')return false;const o=current(),hit=target.closest('[data-object]')?.dataset.object;if(!o||o.id!==hit)return false;addWaypoint(ctx.snap(p,event));return true;}
    function dialog(){
      const source=current();if(!source||!editableObject(source)||!ctx.editable())return;const o=C.clone(source),targets=ctx.page().objects.filter(v=>isVisible(v)&&v.type!=='connector'&&!(v.type==='image'&&v.reference));
      const choices=(values,value)=>values.map(([key,label])=>`<option value="${esc(key)}" ${key===value?'selected':''}>${esc(label)}</option>`).join('');
      const ports=[['auto','自動（輪郭へ接続）'],['top','上'],['right','右'],['bottom','下'],['left','左']];
      const ends=['from','to'].map((key,i)=>`<fieldset><legend>${i?'終点':'始点'}</legend><label>接続先<select id="connection-${key}-target">${choices([['','接続なし（座標指定）'],...targets.map(v=>[v.id,v.name||'図形'])],o[key].objectId||'')}</select></label><div class="fields"><label>接続位置<select id="connection-${key}-port">${choices(ports,o[key].port)}</select></label><label>辺の位置（0〜1）<input id="connection-${key}-ratio" type="number" min="0" max="1" step="any" value="${o[key].ratio}"></label><label>X（px）<input id="connection-${key}-x" type="number" step="any" required value="${ctx.round(o[key].x)}"></label><label>Y（px）<input id="connection-${key}-y" type="number" step="any" required value="${ctx.round(o[key].y)}"></label></div></fieldset>`).join('');
      const arrows=[['none','なし'],['triangle','三角'],['open','開いた矢印']];
      ctx.showInspector('connection','接続・経路',`<label>経路<select id="connection-route">${choices([['straight','直線・折れ線'],['orthogonal','カギ型（直角）']],o.route)}</select></label><div class="fields"><label>始点の矢印<select id="connection-start">${choices(arrows,o.startArrow)}</select></label><label>終点の矢印<select id="connection-end">${choices(arrows,o.endArrow)}</select></label></div><label>ラベル<textarea id="connection-label" maxlength="2000">${esc(o.label)}</textarea></label><details class="style-extra"><summary>ラベルの文字書式</summary><div class="fields"><label>文字サイズ（px）<input id="connection-font-size" type="number" required min="0.01" step="any" value="${o.style.fontSize}"></label><label>書体<select id="connection-font-family">${choices([['sans-serif','ゴシック'],['serif','明朝'],['monospace','等幅']],o.style.fontFamily)}</select></label></div><div class="row"><label class="check"><input id="connection-bold" type="checkbox" ${o.style.bold?'checked':''}>太字</label><label class="check"><input id="connection-italic" type="checkbox" ${o.style.italic?'checked':''}>斜体</label></div><p class="muted">文字色と不透明度は「書式・色」の線に合わせます。</p></details><div class="fields"><label>ラベルの横ずれ（px）<input id="connection-label-x" type="number" step="any" required value="${o.labelOffset.x}"></label><label>ラベルの縦ずれ（px）<input id="connection-label-y" type="number" step="any" required value="${o.labelOffset.y}"></label></div>${ends}<h3>折れ曲がり点</h3><div id="connection-points"></div><button id="connection-add-point" type="button">＋ 点を追加</button><p class="muted">キャンバスの丸い端点で接続位置、線上の四角で折れ曲がり位置を調整できます。点のドラッグ・線のダブルクリックで追加も可能です。接続先の移動に合わせて経路も追従します。</p>`,'適用',()=>{const checked=read();ctx.changePage(p=>p.objects[p.objects.findIndex(v=>v.id===o.id)]=checked);active=null;},{preview:()=>ctx.previewChange(p=>{const checked=read();p.objects[p.objects.findIndex(v=>v.id===o.id)]=checked;})});
      function read(){
        readRows();o.route=$('connection-route').value;o.startArrow=$('connection-start').value;o.endArrow=$('connection-end').value;o.label=$('connection-label').value;o.labelOffset={x:Number($('connection-label-x').value),y:Number($('connection-label-y').value)};
        for(const key of ['from','to'])o[key]={objectId:$('connection-'+key+'-target').value||null,port:$('connection-'+key+'-port').value,ratio:Number($('connection-'+key+'-ratio').value),x:Number($('connection-'+key+'-x').value),y:Number($('connection-'+key+'-y').value)};
        Object.assign(o.style,{fontSize:Number($('connection-font-size').value),fontFamily:$('connection-font-family').value,bold:$('connection-bold').checked,italic:$('connection-italic').checked});
        return C.validateObject(o);
      }
      function readRows(){o.waypoints.forEach((p,i)=>{p.x=Number($('connection-point-x-'+i).value);p.y=Number($('connection-point-y-'+i).value);});}
      function rows(){
        $('connection-points').innerHTML=o.waypoints.map((p,i)=>`<div class="connection-point-row"><span>${i+1}</span><label>X<input id="connection-point-x-${i}" aria-label="点${i+1}のX" type="number" step="any" required value="${p.x}"></label><label>Y<input id="connection-point-y-${i}" aria-label="点${i+1}のY" type="number" step="any" required value="${p.y}"></label><button type="button" data-connection-remove="${i}" aria-label="点${i+1}を削除">×</button></div>`).join('');
        $('connection-points').querySelectorAll('[data-connection-remove]').forEach(b=>b.onclick=()=>{readRows();o.waypoints.splice(Number(b.dataset.connectionRemove),1);rows();$('connection-add-point').focus();});
        $('connection-add-point').disabled=o.waypoints.length>=100;
      }
      $('connection-add-point').onclick=()=>{readRows();const p=o.waypoints.at(-1)||o.from;o.waypoints.push({x:(p.x+o.to.x)/2,y:(p.y+o.to.y)/2});rows();$('connection-point-x-'+(o.waypoints.length-1)).focus();};
      for(const key of ['from','to']){
        function update(){const attached=!!$('connection-'+key+'-target').value;$('connection-'+key+'-port').disabled=!attached;$('connection-'+key+'-ratio').disabled=!attached||$('connection-'+key+'-port').value==='auto';for(const axis of ['x','y'])$('connection-'+key+'-'+axis).disabled=attached;}
        $('connection-'+key+'-target').onchange=update;$('connection-'+key+'-port').onchange=update;update();
      }
      rows();
    }
    function convert(){const o=current();if(!o||!editableObject(o)||!ctx.editable())return;const parts=K.renderedParts(o),group=C.uid('group');parts.forEach(p=>{p.id=C.uid('object');p.group=group;p.locked=false;});if(ctx.changePage(page=>{const index=page.objects.findIndex(v=>v.id===o.id);page.objects.splice(index,1,...parts);if(Array.isArray(page.layers))for(const layer of page.layers){const at=layer.objectIds.indexOf(o.id);if(at>=0){layer.objectIds.splice(at,1,...parts.map(part=>part.id));break;}}}))ctx.select(parts.map(p=>p.id));}
    function keyboard(event){
      if(event.key==='Escape'&&pending){clearPending();ctx.render();return true;}
      const o=current();if(ctx.tool()!=='direct'||!o)return false;
      if(event.key==='Enter'){dialog();return true;}
      if(activeOwner===o.id&&active!==null&&/^\d+$/.test(active)&&Number(active)<o.waypoints.length&&['Delete','Backspace'].includes(event.key)){
        if(editableObject(o)&&ctx.editable())ctx.changePage(p=>p.objects.find(v=>v.id===o.id).waypoints.splice(Number(active),1));active=null;return true;
      }
      return false;
    }
    return {pointerDown,pointerMove,finishDrag,render,doubleClick,dialog,addBetween,convert,keyboard,cancel:()=>{attachmentPreview=null;},reset:()=>{clearPending();active=null;attachmentPreview=null;},hint:()=>pending?'終点をクリック · Escapeで取消':'接続元から接続先へドラッグ、または順にクリック · 輪郭の点へ吸着 · Optionで接続を解除'};
  }};
}(globalThis));
