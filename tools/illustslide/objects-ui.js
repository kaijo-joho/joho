/* illustSlide: 右パネルで図形・グループを管理する。 */
(function() {
  'use strict';
  const TYPES={path:'図形',text:'文字',image:'画像',connector:'接続矢印'};

  function create(ctx) {
    const M=window.IlapoObjectsModel, L=window.IlapoLayers, esc=ctx.esc;
    let expanded=new Set(), expansionScope='', drag=null, bindings=null;
    const body=()=>document.getElementById('inspector-body');
    const scope=()=>ctx.document().id+'|'+ctx.page().id;
    const icon=key=>ctx.icon(key);
    const pickId=id=>'object-pick-'+id;
    const groupPickId=id=>'object-group-pick-'+id;
    const named=object=>object.name||'名前なし';
    const layers=()=>L.list(ctx.page());
    const activeLayer=()=>ctx.activeLayer?.()||layers().at(-1)?.id;
    const objectsFor=layer=>{const ids=new Set(layer.objectIds);return ctx.page().objects.filter(object=>ids.has(object.id));};

    function action(command,id,label,ic,options={}) {
      return `<button type="button" class="object-action" id="object-${command}-${esc(id)}" data-object-command="${command}" data-object-id="${esc(id)}" ${options.key?`data-object-key="${esc(options.key)}"`:''} aria-label="${esc(label)}" data-tip="${esc(label)}" ${options.pressed==null?'':`aria-pressed="${options.pressed}"`} ${options.disabled?'disabled':''}>${icon(ic)}</button>`;
    }
    function handle(kind,name) {
      return `<button type="button" class="object-drag-handle" data-object-drag="${kind}" aria-label="${esc(name)}の重なり順をドラッグ" data-tip="ドラッグして重なり順を変更">☷</button>`;
    }
    function preview(object) {
      const rendered=window.IlapoObjectPreview?.markup?.(ctx.page(),[object.id]);
      return rendered||`<span class="object-preview" aria-hidden="true">${icon(object.type==='path'?'path':object.type)}</span>`;
    }
    function row(object,unit) {
      const selected=ctx.selected().includes(object.id), name=named(object), type=TYPES[object.type]||'図形';
      const visible=object.visible!==false;
      return `<div class="object-row ${selected?'selected':''} ${visible?'':'object-hidden'}" data-object-row="${esc(object.id)}" data-object-unit="${esc(unit.id)}" data-object-key="${esc(unit.key)}">
        ${handle(unit.group?'child':'unit',name)}
        <button type="button" class="object-pick" id="${esc(pickId(object.id))}" data-pick-object="${esc(object.id)}" data-object-pick="${esc(object.id)}" aria-pressed="${selected}" aria-label="${esc(type+'、'+name+(object.locked?'、固定':'')+(visible?'':'、非表示'))}">${preview(object)}<span class="object-name">${esc(name)}</span></button>
        <div class="object-actions">
          ${action('rename',object.id,name+'の名前を変更','edit')}
          ${action('visible',object.id,name+(object.visible===false?'を表示':'を非表示'),'view',{pressed:object.visible!==false})}
          ${action('lock',object.id,name+(object.locked?'の固定を解除':'を固定'),object.locked?'unlock':'lock',{pressed:object.locked})}
        </div>
      </div>`;
    }
    function layerObjectsMarkup(layer) {
      const units=M.units(objectsFor(layer)), selected=new Set(ctx.selected());
      if(!units.length) return '<p class="muted object-empty">このレイヤーには図形がありません。</p>';
      return '<ol class="object-list object-rows" data-object-rows="'+esc(layer.id)+'" aria-label="'+esc(layer.name)+'の図形一覧">'+units.map((unit,index)=>{
        const outer=`data-object-unit="${esc(unit.id)}" data-object-key="${esc(unit.key)}"`;
        if(!unit.group) return `<li class="object-unit" ${outer}>${row(unit.items[0],unit)}</li>`;
        const open=expanded.has(layer.id+'|'+unit.id), visibleItems=unit.items.filter(o=>L.visible(ctx.page(),o.id)), allSelected=visibleItems.length>0&&visibleItems.every(o=>selected.has(o.id)), locked=unit.items.every(o=>o.locked), mixed=unit.items.some(o=>o.locked)&&!locked;
        return `<li class="object-unit object-group ${allSelected?'selected':''}" ${outer}>
          <div class="object-group-head">${handle('unit','グループ')}
            <button type="button" class="object-group-toggle" id="object-group-toggle-${esc(layer.id+'-'+unit.id)}" data-object-group-toggle="${esc(unit.id)}" aria-expanded="${open}" aria-controls="object-group-${esc(layer.id+'-'+unit.id)}" aria-label="グループを${open?'折りたたむ':'展開'}">${icon(open?'down':'right')}</button>
            <button type="button" class="object-group-pick" id="${esc(groupPickId(unit.id))}" data-object-group-pick="${esc(unit.id)}" data-object-command="group-select" data-object-id="${esc(unit.id)}" aria-pressed="${allSelected}" aria-label="グループ（${unit.items.length}個）をまとめて選択"><span class="object-name">グループ（${unit.items.length}個）</span></button>
            <div class="object-group-actions">${mixed?'<small>一部固定</small>':locked?'<small>固定</small>':''}${action('group-lock',unit.id,locked?'グループの固定を解除':'グループを固定',locked?'unlock':'lock',{pressed:mixed?'mixed':locked})}</div>
          </div>
          <ol id="object-group-${esc(layer.id+'-'+unit.id)}" class="object-children" ${open?'':'hidden'}>${unit.items.slice().reverse().map(object=>`<li>${row(object,unit)}</li>`).join('')}</ol>
        </li>`;
      }).join('')+'</ol>';
    }
    function markup() {
      return '<div class="layer-toolbar"><button type="button" class="object-layer-add" data-object-command="layer-create">'+icon('plus')+'<span>レイヤーを追加</span></button>'+(ctx.selected().length?'<button type="button" class="object-layer-move-selection" data-object-command="move-selection">'+icon('layers')+'<span>選択図形をレイヤーへ移動</span></button>':'')+'</div><p class="muted">上ほど前面です。レイヤーを選ぶと、新しい図形の追加先になります。</p><ol id="object-rows" class="object-layers" aria-label="レイヤーと図形の一覧">'+layers().slice().reverse().map(layer=>{
        const index=layers().indexOf(layer),current=activeLayer()===layer.id;
        return '<li class="object-layer '+(current?'active ':'')+(!layer.visible?'hidden-layer':'')+'" data-layer-id="'+esc(layer.id)+'"><div class="object-layer-head">'+handle('layer',layer.name)+'<button type="button" class="object-layer-pick" id="object-layer-'+esc(layer.id)+'" data-layer-pick="'+esc(layer.id)+'" aria-pressed="'+current+'" aria-label="'+esc(layer.name+'を現在のレイヤーにする')+'">'+icon('layers')+'<span class="object-name">'+esc(layer.name)+'</span></button><div class="object-layer-actions">'+action('layer-rename',layer.id,layer.name+'の名前を変更','edit')+action('layer-visible',layer.id,layer.name+(layer.visible?'を非表示':'を表示'),'view',{pressed:layer.visible})+action('layer-lock',layer.id,layer.name+(layer.locked?'の固定を解除':'を固定'),layer.locked?'unlock':'lock',{pressed:layer.locked})+action('layer-remove',layer.id,layer.name+'を削除','delete',{disabled:layers().length===1})+'</div></div><div class="object-layer-content '+(!layer.visible||layer.locked?'layer-objects-disabled':'')+'">'+layerObjectsMarkup(layer)+'</div></li>';
      }).join('')+'</ol>';
    }
    function focusAfter(id) {
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        let target=document.getElementById(id);
        if(target?.disabled) target=target.closest('.object-row')?.querySelector('[data-object-pick]')||target.closest('.object-group-head')?.querySelector('[data-object-group-pick]');
        target?.focus({preventScroll:true});
      }));
    }
    function select(ids,add) {
      ctx.select(add?[...ctx.selected(),...ids]:ids);
    }
    function rename(id) {
      const object=ctx.page().objects.find(o=>o.id===id), initialScope=scope();
      if(!object) return;
      ctx.showDialog('図形名を変更',`<label>名前<input id="object-name" maxlength="120" required value="${esc(object.name)}"></label>`,'変更',()=>{
        if(scope()!==initialScope) throw Error('編集するページが変わりました。図形を選び直してください。');
        const name=document.getElementById('object-name').value.trim();
        if(!name) throw Error('名前を入力してください。');
        ctx.changePage(page=>{const target=page.objects.find(o=>o.id===id);if(target)target.name=name;});
        focusAfter('object-rename-'+id);
      });
    }
    function renameLayer(id) {
      const layer=layers().find(item=>item.id===id), initialScope=scope();
      if(!layer) return;
      ctx.showDialog('レイヤー名を変更',`<label>名前<input id="layer-name" maxlength="120" required value="${esc(layer.name)}"></label>`,'変更',()=>{
        if(scope()!==initialScope) throw Error('編集するページが変わりました。');
        const name=document.getElementById('layer-name').value.trim();
        if(!name) throw Error('名前を入力してください。');
        ctx.changePage(page=>L.rename(page,id,name));
        focusAfter('object-layer-'+id);
      });
    }
    function moveSelection() {
      const selected=ctx.selected(); if(!selected.length) return;
      const sources=new Set(selected.map(id=>L.layerOf(ctx.page(),id)?.id));
      const options=layers().filter(layer=>(sources.size!==1||!sources.has(layer.id))&&layer.visible&&!layer.locked).slice().reverse();
      if(!options.length) throw Error('移動先にできる表示中・未固定のレイヤーがありません。');
      ctx.showDialog('選択図形をレイヤーへ移動',`<label>移動先<select id="object-target-layer">${options.map(layer=>`<option value="${esc(layer.id)}">${esc(layer.name)}</option>`).join('')}</select></label>`,'移動',()=>{
        const target=document.getElementById('object-target-layer').value;
        if(ctx.changePage(page=>L.moveObjects(page,selected,target))){ctx.setActiveLayer?.(target);ctx.select(selected);}
        focusAfter('object-layer-'+target);
      });
    }
    function reorderLayer(page,layerId,sourceKey,targetKey,front) {
      if(!Array.isArray(page.layers)) { M.reorder(page,sourceKey,targetKey,front); return; }
      const layer=L.list(page).find(item=>item.id===layerId), byId=new Map(page.objects.map(object=>[object.id,object]));
      const items=layer.objectIds.map(id=>byId.get(id)).filter(Boolean);
      M.reorderItems(items,sourceKey,targetKey,front); layer.objectIds=items.map(object=>object.id); L.reconcile(page);
    }
    function reorderChildLayer(page,layerId,sourceId,targetId,front) {
      if(!Array.isArray(page.layers)) { M.reorderChild(page,sourceId,targetId,front); return; }
      const layer=L.list(page).find(item=>item.id===layerId), byId=new Map(page.objects.map(object=>[object.id,object]));
      const items=layer.objectIds.map(id=>byId.get(id)).filter(Boolean);
      M.reorderChild({objects:items},sourceId,targetId,front); layer.objectIds=items.map(object=>object.id); L.reconcile(page);
    }
    function perform(command,id,key) {
      if(command==='layer-create') { let created; ctx.changePage(page=>created=L.create(page)); ctx.setActiveLayer?.(created); ctx.select([]); focusAfter('object-layer-'+created); return; }
      if(command==='move-selection') return moveSelection();
      if(command==='layer-rename') return renameLayer(id);
      if(command==='layer-visible'||command==='layer-lock') { ctx.changePage(page=>{const layer=L.list(page).find(item=>item.id===id); if(command==='layer-visible') L.setVisible(page,id,!layer.visible); else L.setLocked(page,id,!layer.locked);}); focusAfter('object-layer-'+id); return; }
      if(command==='layer-front'||command==='layer-back') { ctx.changePage(page=>L.move(page,id,command==='layer-front'?1:-1)); focusAfter('object-layer-'+id); return; }
      if(command==='layer-remove') { const layer=layers().find(item=>item.id===id); if(!layer) return; const index=layers().indexOf(layer), receiver=layers()[index>0?index-1:1]; if(!receiver) return; ctx.showDialog('レイヤーを削除',`<p><strong>${esc(layer.name)}</strong> を削除します。このレイヤーの図形 ${layer.objectIds.length} 個は、隣の<strong>${esc(receiver.name)}</strong>へ移します。</p>`,'削除',()=>{let next;const current=activeLayer()===id;if(ctx.changePage(page=>next=L.remove(page,id))&&current)ctx.setActiveLayer?.(next);focusAfter('object-layer-'+next);});return; }
      if(command==='group-select') return select(ctx.page().objects.filter(o=>o.group===id&&L.visible(ctx.page(),o.id)).map(o=>o.id),false);
      if(command==='visible') {
        ctx.changePage(page=>{const object=page.objects.find(item=>item.id===id);if(object)L.setObjectVisible(page,id,object.visible===false);});
        focusAfter('object-visible-'+id); return;
      }
      const member=ctx.page().objects.find(object=>object.id===id||object.group===id);
      const layer=L.layerOf(ctx.page(),member); if(!layer||!layer.visible||layer.locked) return;
      if(command==='rename')return rename(id);
      if(command==='lock'||command==='group-lock') {
        ctx.changePage(page=>{
          const objects=page.objects.filter(o=>command==='group-lock'?o.group===id:o.id===id), lock=objects.some(o=>!o.locked);
          objects.forEach(o=>o.locked=lock);
        });
      } else if(command==='before'||command==='after') {
        const units=M.units(objectsFor(layer)), index=units.findIndex(unit=>unit.key===key), target=units[index+(command==='before'?-1:1)];
        if(target) ctx.changePage(page=>reorderLayer(page,layer.id,key,target.key,command==='before'));
      } else if(command==='child-before'||command==='child-after') {
        const object=ctx.page().objects.find(o=>o.id===id), items=objectsFor(layer).filter(o=>object?.group&&o.group===object.group), index=items.indexOf(object), target=items[index+(command==='child-before'?1:-1)];
        if(target) ctx.changePage(page=>reorderChildLayer(page,layer.id,id,target.id,command==='child-before'));
      }
      focusAfter('object-'+command+'-'+id);
    }
    function cancelDrag() {
      if(!drag) return;
      const previous=drag; drag=null;
      cancelAnimationFrame(previous.frame);
      previous.row.classList.remove('dragging');
      body().querySelectorAll('.drop-before,.drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'));
      window.removeEventListener('blur',cancelDrag);
      try { if(previous.handle.hasPointerCapture(previous.pointer)) previous.handle.releasePointerCapture(previous.pointer); } catch(_) {}
    }

    function open() {
      cancelDrag(); bindings?.abort(); bindings=new AbortController();
      const initialScope=scope();
      if(expansionScope!==initialScope) { expanded=new Set(); expansionScope=initialScope; }
      ctx.showInspector('objects','レイヤー',markup(),null);
      const panel=body(), rows=panel.querySelector('#object-rows');
      if(!rows) return;
      for(const layer of layers()){
        const content=[...rows.querySelectorAll('.object-layer')].find(el=>el.dataset.layerId===layer.id)?.querySelector('.object-layer-content');
        if(!content)continue;
        if(!layer.visible)content.querySelectorAll('[data-object-pick],[data-object-group-pick]').forEach(button=>button.disabled=true);
        else content.querySelectorAll('[data-object-pick]').forEach(button=>{if(!L.visible(ctx.page(),button.dataset.objectPick))button.disabled=true;});
        if(!layer.visible||layer.locked)content.querySelectorAll('[data-object-command]:not([data-object-command=group-select]):not([data-object-command=visible]),[data-object-drag]').forEach(button=>button.disabled=true);
      }
      const valid=()=>scope()===initialScope&&!ctx.isBusy?.()&&rows.isConnected;
      const listen=(target,name,callback)=>target.addEventListener(name,callback,{signal:bindings.signal});
      const picks=()=>[...rows.querySelectorAll('[data-layer-pick],[data-object-pick],[data-object-group-pick]')].filter(button=>!button.disabled&&button.getClientRects().length);
      function pick(button,add) {
        if(button.dataset.layerPick) { ctx.setActiveLayer?.(button.dataset.layerPick); ctx.select([]); }
        else if(button.dataset.objectGroupPick) select(ctx.page().objects.filter(o=>o.group===button.dataset.objectGroupPick&&L.visible(ctx.page(),o.id)).map(o=>o.id),add);
        else if(L.visible(ctx.page(),button.dataset.objectPick)) select([button.dataset.objectPick],add);
      }
      function expand(id,layerId,show,focusId) {
        const expansionId=layerId+'|'+id;
        if(show) expanded.add(expansionId); else expanded.delete(expansionId);
        open(); focusAfter(focusId||groupPickId(id));
      }
      listen(panel,'click',event=>{
        if(!valid()||drag) return;
        const toggle=event.target.closest('[data-object-group-toggle]'), selected=event.target.closest('[data-layer-pick],[data-object-pick],[data-object-group-pick]'), command=event.target.closest('[data-object-command]');
        if(toggle) expand(toggle.dataset.objectGroupToggle,toggle.closest('.object-layer').dataset.layerId,!expanded.has(toggle.closest('.object-layer').dataset.layerId+'|'+toggle.dataset.objectGroupToggle),toggle.id);
        else if(selected) {pick(selected,event.shiftKey);focusAfter(selected.id);}
        else if(command) { try { perform(command.dataset.objectCommand,command.dataset.objectId,command.dataset.objectKey); } catch(error) { ctx.toast?.(error.message||'操作できませんでした。'); } }
      });
      listen(panel,'keydown',event=>{
        if(!valid()) {cancelDrag();return;}
        if(!event.isComposing&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z') {event.preventDefault();event.stopPropagation();cancelDrag();ctx.execute(event.shiftKey?'redo':'undo');return;}
        if(event.key==='Escape'&&drag) {event.preventDefault();event.stopPropagation();cancelDrag();return;}
        const toggle=event.target.closest('[data-object-group-toggle]'), dragHandle=event.target.closest('[data-object-drag]');
        const handleButton=dragHandle?.dataset.objectDrag==='layer'?dragHandle.closest('.object-layer')?.querySelector('[data-layer-pick]'):dragHandle?.dataset.objectDrag==='child'?dragHandle.closest('.object-row')?.querySelector('[data-object-pick]'):dragHandle?.closest('.object-group')?.querySelector('[data-object-group-pick]');
        const button=event.target.closest('[data-layer-pick],[data-object-pick],[data-object-group-pick]')||toggle?.closest('.object-group').querySelector('[data-object-group-pick]')||handleButton;
        if(!button) return;
        if(event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowUp','ArrowDown'].includes(event.key)) {
          event.preventDefault();event.stopPropagation();
          const forward=event.key==='ArrowUp';
          if(button.dataset.layerPick) { ctx.changePage(page=>L.move(page,button.dataset.layerPick,forward?1:-1)); focusAfter(button.id); return; }
          const objectId=button.dataset.objectPick, unitId=button.dataset.objectGroupPick;
          const member=ctx.page().objects.find(object=>object.id===objectId||object.group===unitId), layer=L.layerOf(ctx.page(),member);
          if(!layer||!layer.visible||layer.locked) return;
          if(objectId&&member?.group) {
            const members=objectsFor(layer).filter(object=>object.group===member.group), index=members.indexOf(member), target=members[index+(forward?1:-1)];
            if(target&&!member.locked&&!target.locked) ctx.changePage(page=>reorderChildLayer(page,layer.id,member.id,target.id,forward));
          } else {
            const units=M.units(objectsFor(layer)), key=M.keyOf(member), index=units.findIndex(unit=>unit.key===key), target=units[index+(forward?-1:1)];
            const moving=unitId?units[index].items:[member];
            if(target&&moving.every(object=>!object.locked)&&target.items.every(object=>!object.locked)) ctx.changePage(page=>reorderLayer(page,layer.id,key,target.key,forward));
          }
          focusAfter(button.id); return;
        }
        if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
          event.preventDefault();event.stopPropagation();
          const list=picks(), index=list.indexOf(button), next=event.key==='Home'?0:event.key==='End'?list.length-1:Math.max(0,Math.min(list.length-1,index+(event.key==='ArrowDown'?1:-1))), target=list[next];
          pick(target,event.shiftKey);focusAfter(target.id);
        } else if(event.key==='ArrowRight'&&button.dataset.objectGroupPick) {
          event.preventDefault();event.stopPropagation();
          const id=button.dataset.objectGroupPick;
          const layer=button.closest('.object-layer').dataset.layerId;
          if(!expanded.has(layer+'|'+id)) expand(id,layer,true);
          else {const child=button.closest('.object-group').querySelector('[data-object-pick]');if(child){pick(child,false);focusAfter(child.id);}}
        } else if(event.key==='ArrowLeft') {
          const group=button.closest('.object-group'); if(!group) return;
          event.preventDefault();event.stopPropagation();
          if(button.dataset.objectGroupPick) expand(button.dataset.objectGroupPick,button.closest('.object-layer').dataset.layerId,false);
          else focusAfter(groupPickId(group.dataset.objectUnit));
        } else if(!toggle&&(event.key==='Enter'||event.key===' ')) {
          event.preventDefault();event.stopPropagation();pick(button,event.shiftKey);focusAfter(button.id);
        }
      });
      function previewDrop() {
        const target=document.elementFromPoint(drag.x,drag.y)?.closest(drag.kind==='layer'?'.object-layer':drag.kind==='child'?'.object-row':'.object-unit');
        panel.querySelectorAll('.drop-before,.drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'));
        if(!target||!rows.contains(target)||target===drag.row||drag.kind!=='layer'&&target.closest('.object-layer')?.dataset.layerId!==drag.layerId||drag.kind==='child'&&target.dataset.objectUnit!==drag.group) {drag.target=null;return;}
        drag.target=drag.kind==='layer'?target.dataset.layerId:drag.kind==='child'?target.dataset.objectRow:target.dataset.objectKey;
        const rect=target.getBoundingClientRect();drag.front=drag.y<rect.top+rect.height/2;
        target.classList.add(drag.front?'drop-before':'drop-after');
      }
      function autoScroll(time) {
        if(!drag) return;
        if(!valid()||ctx.page()!==drag.page) {cancelDrag();return;}
        const edge=panel.getBoundingClientRect(), previous=panel.scrollTop;
        const inside=drag.x>=edge.left&&drag.x<=edge.right&&drag.y>=edge.top&&drag.y<=edge.bottom;
        const direction=inside?(drag.y<edge.top+28?-1:drag.y>edge.bottom-28?1:0):0;
        panel.scrollTop+=direction*Math.min(32,time-(drag.time||time))*.5;
        drag.time=time;
        if(panel.scrollTop!==previous) previewDrop();
        drag.frame=requestAnimationFrame(autoScroll);
      }
      listen(panel,'pointerdown',event=>{
        const handle=event.target.closest('[data-object-drag]');
        if(!handle||event.button!==0||!valid()||drag) return;
        const kind=handle.dataset.objectDrag, row=handle.closest(kind==='layer'?'.object-layer':kind==='child'?'.object-row':'.object-unit'), layer=row?.closest('.object-layer');
        if(!layer) return;
        const moving=kind==='layer'?[]:kind==='child'?[row.dataset.objectRow]:objectsFor(L.list(ctx.page()).find(item=>item.id===layer.dataset.layerId)).filter(object=>M.keyOf(object)===row.dataset.objectKey).map(object=>object.id);
        if(kind!=='layer'&&(layer.classList.contains('hidden-layer')||layer.querySelector('[data-object-command="layer-lock"]')?.getAttribute('aria-pressed')==='true'||moving.some(id=>L.locked(ctx.page(),id)))) return;
        event.preventDefault();event.stopPropagation();handle.focus({preventScroll:true});
        drag={kind,row,handle,pointer:event.pointerId,id:kind==='layer'?layer.dataset.layerId:kind==='child'?row.dataset.objectRow:row.dataset.objectKey,group:row.dataset.objectUnit,layerId:layer.dataset.layerId,target:null,front:false,page:ctx.page(),x:event.clientX,y:event.clientY};
        drag.frame=requestAnimationFrame(autoScroll);
        row.classList.add('dragging');handle.setPointerCapture(event.pointerId);window.addEventListener('blur',cancelDrag);
      });
      listen(panel,'pointermove',event=>{
        if(!drag||event.pointerId!==drag.pointer) return;
        if(!valid()||ctx.page()!==drag.page) {cancelDrag();return;}
        drag.x=event.clientX;drag.y=event.clientY;previewDrop();
      });
      listen(panel,'pointerup',event=>{
        if(!drag||event.pointerId!==drag.pointer) return;
        const previous=drag, current=valid()&&ctx.page()===previous.page;
        cancelDrag();if(!current||!previous.target) return;
        if(previous.kind==='layer') ctx.changePage(page=>{const source=L.list(page).find(item=>item.id===previous.id), target=L.list(page).find(item=>item.id===previous.target), from=L.list(page).indexOf(source);let to=L.list(page).indexOf(target)+(previous.front?1:0);if(from<to)to-=1;L.move(page,previous.id,to-from);});
        else if(previous.kind==='child') ctx.changePage(page=>reorderChildLayer(page,previous.layerId,previous.id,previous.target,previous.front));
        else ctx.changePage(page=>reorderLayer(page,previous.layerId,previous.id,previous.target,previous.front));
        const id=previous.kind==='layer'?'object-layer-'+previous.id:previous.kind==='child'?pickId(previous.id):previous.id.startsWith('g:')?groupPickId(previous.row.dataset.objectUnit):pickId(previous.row.dataset.objectUnit);
        focusAfter(id);
      });
      listen(panel,'pointercancel',cancelDrag);listen(panel,'lostpointercapture',cancelDrag);
    }
    return Object.freeze({open,get isDragging(){return !!drag;},cancelDrag});
  }
  window.IlapoObjectsUI=Object.freeze({create});
}());
