/* 接続の操作と、選択した矢印の経路を見ながら設定するパネル。 */
(function(root){
  'use strict';
  root.IlapoConnectorUI={create:function(ctx){
    const C=root.IlapoCore,K=root.IlapoConnectors,G=root.IlapoGeometry;
    const $=id=>document.getElementById(id),esc=ctx.esc;
    let pending=null,active=null,activeOwner=null;
    const current=()=>ctx.page().objects.find(o=>ctx.selected().length===1&&o.id===ctx.selected()[0]&&o.type==='connector');
    const endpoint=(p,id=null)=>({x:p.x,y:p.y,objectId:id,port:'auto',ratio:.5});
    function targetAt(event,p){
      if(event.altKey)return endpoint(ctx.snap(p,event));
      const objects=ctx.page().objects;
      const hit=document.elementsFromPoint(event.clientX,event.clientY).map(el=>el.closest('[data-object]')?.dataset.object).map(id=>objects.find(o=>o.id===id&&o.type!=='connector'&&!(o.type==='image'&&o.reference))).find(Boolean);
      if(hit)return endpoint(p,hit.id);
      return endpoint(ctx.snap(p,event));
    }
    function newConnector(a,b){const size=ctx.standardSize();return K.make(a,b,{style:{stroke:'#1E3A5F',fill:'none',strokeWidth:Math.max(.04,size/80),fontSize:Math.max(.2,size*.12),linecap:'round',linejoin:'round'}});}
    function pointerDown(event,p,base){
      if(ctx.tool()==='connector'){
        const a=pending||targetAt(event,p),b=targetAt(event,p),completing=!!pending;
        ctx.setDrag({kind:'connector-new',start:p,base,originalSelection:ctx.selected().slice(),connector:newConnector(a,b),completing});return true;
      }
      const handle=event.target.closest('[data-connection-handle]')?.dataset.connectionHandle,hit=event.target.closest('[data-object]')?.dataset.object;
      const o=current();
      if(ctx.tool()==='direct'&&o&&handle){
        if(!ctx.editable())return true;active=handle;activeOwner=o.id;
        ctx.setDrag({kind:'connector-handle',start:p,base,originalSelection:ctx.selected().slice(),id:o.id,handle});return true;
      }
      if(ctx.tool()==='direct'&&ctx.page().objects.some(o=>o.id===hit&&o.type==='connector')){
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
      if(d.handle==='from'||d.handle==='to')o[d.handle]=targetAt(event,p);
      else if(d.handle==='label'){o.labelOffset.x+=p.x-d.start.x;o.labelOffset.y+=p.y-d.start.y;}
      else o.waypoints[Number(d.handle)]={x:sp.x,y:sp.y};
      K.sync(result);ctx.setPreview(result);return true;
    }
    function finishDrag(d,result){
      if(d.kind==='connector-new'){
        if(d.moved||d.completing){
          const o=result?.objects.find(o=>o.id===d.connector.id)||d.connector;
          if(Math.hypot(o.from.x-o.to.x,o.from.y-o.to.y)<1e-7&&!o.from.objectId&&!o.to.objectId){pending=null;ctx.toast('終点を別の位置に指定してください。');return true;}
          if(ctx.changePage(p=>p.objects.push(o))){pending=null;ctx.setTool('direct');ctx.select([o.id]);}
        }else{pending=C.clone(d.connector.from);ctx.toast('終点をクリックしてください。Escapeで取り消せます。');}
        return true;
      }
      if(d.kind==='connector-handle'){if(d.moved&&result)ctx.changePage(p=>p.objects=result.objects);return true;}return false;
    }
    function render(page,z){
      if(pending&&ctx.tool()==='connector')return `<circle cx="${pending.x}" cy="${pending.y}" r="${6/z}" fill="#fff" stroke="#2563eb" stroke-width="${2/z}"/>`;
      const id=current()?.id,o=page.objects.find(o=>o.id===id);
      if(ctx.tool()!=='direct'||!o)return null;
      const handles=[['from',o.from],...o.waypoints.map((p,i)=>[String(i),p]),['to',o.to]];
      const label=K.renderedParts(o).find(p=>p.type==='text');if(label){const b=G.bounds(label);handles.push(['label',{x:b.x+b.width/2,y:b.y+b.height/2}]);}
      return handles.map(([key,p])=>`<g data-connection-handle="${key}" style="cursor:move"><circle cx="${p.x}" cy="${p.y}" r="${14/z}" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="${(key==='label'?4:5)/z}" fill="${active===key?'#2563eb':'#fff'}" stroke="${key==='label'?'#9333ea':'#2563eb'}" stroke-width="${1.5/z}"/></g>`).join('');
    }
    function addBetween(){
      const objects=ctx.page().objects.filter(o=>ctx.selected().includes(o.id)&&o.type!=='connector'&&!(o.type==='image'&&o.reference));
      if(objects.length!==2){ctx.toast('接続する図形を2つ選んでください。');return;}
      const ends=objects.map(o=>{const b=G.bounds(o);return endpoint({x:b.x+b.width/2,y:b.y+b.height/2},o.id);}),o=newConnector(...ends);
      if(ctx.changePage(p=>p.objects.push(o))){ctx.setTool('direct');ctx.select([o.id]);}
    }
    function addWaypoint(p){const o=current();if(!o||!ctx.editable())return;const list=[o.from,...o.waypoints,o.to];let nearest={distance:Infinity,index:0};list.slice(1).forEach((b,i)=>{const a=list[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(distance<nearest.distance)nearest={distance,index:i};});ctx.changePage(page=>page.objects.find(v=>v.id===o.id).waypoints.splice(nearest.index,0,{x:p.x,y:p.y}));active=String(nearest.index);}
    function doubleClick(event,p){if(ctx.tool()!=='direct')return false;const hit=event.target.closest('[data-object]')?.dataset.object;if(current()?.id!==hit)return false;addWaypoint(ctx.snap(p,event));return true;}
    function dialog(){
      const source=current();if(!source||!ctx.editable())return;const o=C.clone(source),targets=ctx.page().objects.filter(v=>v.type!=='connector');
      const choices=(values,value)=>values.map(([key,label])=>`<option value="${esc(key)}" ${key===value?'selected':''}>${esc(label)}</option>`).join('');
      const ports=[['auto','自動（輪郭へ接続）'],['top','上'],['right','右'],['bottom','下'],['left','左']];
      const ends=['from','to'].map((key,i)=>`<fieldset><legend>${i?'終点':'始点'}</legend><label>接続先<select id="connection-${key}-target">${choices([['','接続なし（座標指定）'],...targets.map(v=>[v.id,v.name||'図形'])],o[key].objectId||'')}</select></label><div class="fields"><label>接続位置<select id="connection-${key}-port">${choices(ports,o[key].port)}</select></label><label>辺の位置（0〜1）<input id="connection-${key}-ratio" type="number" min="0" max="1" step="any" value="${o[key].ratio}"></label><label>X（px）<input id="connection-${key}-x" type="number" step="any" required value="${ctx.round(o[key].x)}"></label><label>Y（px）<input id="connection-${key}-y" type="number" step="any" required value="${ctx.round(o[key].y)}"></label></div></fieldset>`).join('');
      const arrows=[['none','なし'],['triangle','三角'],['open','開いた矢印']];
      ctx.showInspector('connection','接続・経路',`<label>経路<select id="connection-route">${choices([['straight','直線・折れ線'],['orthogonal','直角']],o.route)}</select></label><div class="fields"><label>始点の矢印<select id="connection-start">${choices(arrows,o.startArrow)}</select></label><label>終点の矢印<select id="connection-end">${choices(arrows,o.endArrow)}</select></label></div><label>ラベル<textarea id="connection-label" maxlength="2000">${esc(o.label)}</textarea></label><div class="fields"><label>ラベルの横ずれ（px）<input id="connection-label-x" type="number" step="any" required value="${o.labelOffset.x}"></label><label>ラベルの縦ずれ（px）<input id="connection-label-y" type="number" step="any" required value="${o.labelOffset.y}"></label></div>${ends}<h3>折れ曲がり点</h3><div id="connection-points"></div><button id="connection-add-point" type="button">＋ 点を追加</button><p class="muted">点は始点から順番に通ります。キャンバスでは点をドラッグ、線をダブルクリックして追加できます。接続先を動かすと端点が追従します。</p>`,'適用',()=>{const checked=read();ctx.changePage(p=>p.objects[p.objects.findIndex(v=>v.id===o.id)]=checked);active=null;},{preview:()=>ctx.previewChange(p=>{const checked=read();p.objects[p.objects.findIndex(v=>v.id===o.id)]=checked;})});
      function read(){
        readRows();o.route=$('connection-route').value;o.startArrow=$('connection-start').value;o.endArrow=$('connection-end').value;o.label=$('connection-label').value;o.labelOffset={x:Number($('connection-label-x').value),y:Number($('connection-label-y').value)};
        for(const key of ['from','to'])o[key]={objectId:$('connection-'+key+'-target').value||null,port:$('connection-'+key+'-port').value,ratio:Number($('connection-'+key+'-ratio').value),x:Number($('connection-'+key+'-x').value),y:Number($('connection-'+key+'-y').value)};
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
    function convert(){const o=current();if(!o||!ctx.editable())return;const parts=K.renderedParts(o),group=C.uid('group');parts.forEach(p=>{p.id=C.uid('object');p.group=group;p.locked=false;});if(ctx.changePage(page=>page.objects.splice(page.objects.findIndex(v=>v.id===o.id),1,...parts)))ctx.select(parts.map(p=>p.id));}
    function keyboard(event){
      if(event.key==='Escape'&&pending){pending=null;ctx.render();return true;}
      const o=current();if(ctx.tool()!=='direct'||!o)return false;
      if(event.key==='Enter'){dialog();return true;}
      if(activeOwner===o.id&&active!==null&&/^\d+$/.test(active)&&Number(active)<o.waypoints.length&&['Delete','Backspace'].includes(event.key)){
        if(ctx.editable())ctx.changePage(p=>p.objects.find(v=>v.id===o.id).waypoints.splice(Number(active),1));active=null;return true;
      }
      return false;
    }
    return {pointerDown,pointerMove,finishDrag,render,doubleClick,dialog,addBetween,convert,keyboard,reset:()=>{pending=null;active=null;},hint:()=>pending?'終点をクリック · Escapeで取消':'接続元から接続先へドラッグ、または順にクリック · Optionで接続を解除'};
  }};
}(globalThis));
