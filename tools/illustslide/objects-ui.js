/* illustSlide: 右パネルで図形・グループを管理する。 */
(function() {
  'use strict';
  const TYPES={path:'図形',text:'文字',image:'画像',connector:'接続矢印'};

  function create(ctx) {
    const M=window.IlapoObjectsModel, esc=ctx.esc;
    let expanded=new Set(), expansionScope='', drag=null, bindings=null;
    const body=()=>document.getElementById('inspector-body');
    const scope=()=>ctx.document().id+'|'+ctx.page().id;
    const icon=key=>ctx.icon(key);
    const pickId=id=>'object-pick-'+id;
    const groupPickId=id=>'object-group-pick-'+id;
    const named=object=>object.name||'名前なし';

    function action(command,id,label,ic,options={}) {
      return `<button type="button" class="object-action" id="object-${command}-${esc(id)}" data-object-command="${command}" data-object-id="${esc(id)}" ${options.key?`data-object-key="${esc(options.key)}"`:''} aria-label="${esc(label)}" data-tip="${esc(label)}" ${options.pressed==null?'':`aria-pressed="${options.pressed}"`} ${options.disabled?'disabled':''}>${icon(ic)}</button>`;
    }
    function handle(kind,name) {
      return `<button type="button" class="object-drag-handle" tabindex="-1" data-object-drag="${kind}" aria-label="${esc(name)}の重なり順をドラッグ" data-tip="ドラッグして重なり順を変更">☷</button>`;
    }
    function row(object,unit,index,unitIndex,length) {
      const selected=ctx.selected().includes(object.id), name=named(object), type=TYPES[object.type]||'図形';
      return `<div class="object-row ${selected?'selected':''}" data-object-row="${esc(object.id)}" data-object-unit="${esc(unit.id)}" data-object-key="${esc(unit.key)}">
        ${handle(unit.group?'child':'unit',name)}
        <button type="button" class="object-pick" id="${esc(pickId(object.id))}" data-pick-object="${esc(object.id)}" data-object-pick="${esc(object.id)}" aria-pressed="${selected}" aria-label="${esc(type+'、'+name+(object.locked?'、固定':''))}">${icon(object.type==='path'?'path':object.type)}<span class="object-name">${esc(name)}</span>${object.locked?'<small>固定</small>':''}</button>
        <div class="object-actions">
          ${action('rename',object.id,name+'の名前を変更','edit')}
          ${action('lock',object.id,name+(object.locked?'の固定を解除':'を固定'),object.locked?'unlock':'lock',{pressed:object.locked})}
          ${!unit.group?moves(unit,unitIndex,length):''}
          ${unit.group?action('child-before',object.id,name+'をグループ内で前へ','up',{disabled:index===unit.items.length-1})+action('child-after',object.id,name+'をグループ内で後へ','down',{disabled:index===0}):''}
        </div>
      </div>`;
    }
    function moves(unit,index,length) {
      const name=unit.group?'グループ':named(unit.items[0]);
      return `<div class="object-unit-moves">${action('before',unit.id,name+'を前へ移動','up',{key:unit.key,disabled:index===0})}${action('after',unit.id,name+'を後へ移動','down',{key:unit.key,disabled:index===length-1})}</div>`;
    }
    function markup() {
      const units=M.units(ctx.page().objects), selected=new Set(ctx.selected());
      if(!units.length) return '<p>図形はまだありません。</p>';
      return '<p class="muted">上ほど前面です。グループ内の図形は展開して操作できます。</p><ol id="object-rows" class="object-list" aria-label="図形の一覧">'+units.map((unit,index)=>{
        const outer=`data-object-unit="${esc(unit.id)}" data-object-key="${esc(unit.key)}"`;
        if(!unit.group) return `<li class="object-unit" ${outer}>${row(unit.items[0],unit,0,index,units.length)}</li>`;
        const open=expanded.has(unit.id), allSelected=unit.items.every(o=>selected.has(o.id)), locked=unit.items.every(o=>o.locked), mixed=unit.items.some(o=>o.locked)&&!locked;
        return `<li class="object-unit object-group ${allSelected?'selected':''}" ${outer}>
          <div class="object-group-head">${handle('unit','グループ')}
            <button type="button" class="object-group-toggle" id="object-group-toggle-${esc(unit.id)}" data-object-group-toggle="${esc(unit.id)}" aria-expanded="${open}" aria-controls="object-group-${esc(unit.id)}" aria-label="グループを${open?'折りたたむ':'展開'}">${icon(open?'down':'right')}</button>
            <button type="button" class="object-group-pick" id="${esc(groupPickId(unit.id))}" data-object-group-pick="${esc(unit.id)}" data-object-command="group-select" data-object-id="${esc(unit.id)}" aria-pressed="${allSelected}" aria-label="グループ（${unit.items.length}個）をまとめて選択"><span class="object-name">グループ（${unit.items.length}個）</span></button>
            <div class="object-group-actions">${mixed?'<small>一部固定</small>':locked?'<small>固定</small>':''}${action('group-lock',unit.id,locked?'グループの固定を解除':'グループを固定',locked?'unlock':'lock',{pressed:mixed?'mixed':locked})}${moves(unit,index,units.length)}</div>
          </div>
          <ol id="object-group-${esc(unit.id)}" class="object-children" ${open?'':'hidden'}>${unit.items.slice().reverse().map((object,i)=>`<li>${row(object,unit,unit.items.length-1-i)}</li>`).join('')}</ol>
        </li>`;
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
    function perform(command,id,key) {
      if(command==='rename') return rename(id);
      if(command==='group-select') return select(ctx.page().objects.filter(o=>o.group===id).map(o=>o.id),false);
      if(command==='lock'||command==='group-lock') {
        ctx.changePage(page=>{
          const objects=page.objects.filter(o=>command==='group-lock'?o.group===id:o.id===id), lock=objects.some(o=>!o.locked);
          objects.forEach(o=>o.locked=lock);
        });
      } else if(command==='before'||command==='after') {
        const units=M.units(ctx.page().objects), index=units.findIndex(unit=>unit.key===key), target=units[index+(command==='before'?-1:1)];
        if(target) ctx.changePage(page=>M.reorder(page,key,target.key,command==='before'));
      } else if(command==='child-before'||command==='child-after') {
        const object=ctx.page().objects.find(o=>o.id===id), items=ctx.page().objects.filter(o=>object?.group&&o.group===object.group), index=items.indexOf(object), target=items[index+(command==='child-before'?1:-1)];
        if(target) ctx.changePage(page=>M.reorderChild(page,id,target.id,command==='child-before'));
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
      ctx.showInspector('objects','図形',markup(),null);
      const panel=body(), rows=panel.querySelector('#object-rows');
      if(!rows) return;
      const valid=()=>scope()===initialScope&&!ctx.isBusy?.()&&rows.isConnected;
      const listen=(target,name,callback)=>target.addEventListener(name,callback,{signal:bindings.signal});
      const picks=()=>[...rows.querySelectorAll('[data-object-pick],[data-object-group-pick]')].filter(button=>button.getClientRects().length);
      function pick(button,add) {
        if(button.dataset.objectGroupPick) select(ctx.page().objects.filter(o=>o.group===button.dataset.objectGroupPick).map(o=>o.id),add);
        else select([button.dataset.objectPick],add);
      }
      function expand(id,show,focusId) {
        if(show) expanded.add(id); else expanded.delete(id);
        open(); focusAfter(focusId||groupPickId(id));
      }
      listen(rows,'click',event=>{
        if(!valid()||drag) return;
        const toggle=event.target.closest('[data-object-group-toggle]'), selected=event.target.closest('[data-object-pick],[data-object-group-pick]'), command=event.target.closest('[data-object-command]');
        if(toggle) expand(toggle.dataset.objectGroupToggle,!expanded.has(toggle.dataset.objectGroupToggle),toggle.id);
        else if(selected) {pick(selected,event.shiftKey);focusAfter(selected.id);}
        else if(command) perform(command.dataset.objectCommand,command.dataset.objectId,command.dataset.objectKey);
      });
      listen(rows,'keydown',event=>{
        if(!valid()) {cancelDrag();return;}
        if(!event.isComposing&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z') {event.preventDefault();event.stopPropagation();cancelDrag();ctx.execute(event.shiftKey?'redo':'undo');return;}
        if(event.key==='Escape'&&drag) {event.preventDefault();event.stopPropagation();cancelDrag();return;}
        const toggle=event.target.closest('[data-object-group-toggle]');
        const button=event.target.closest('[data-object-pick],[data-object-group-pick]')||toggle?.closest('.object-group').querySelector('[data-object-group-pick]');
        if(!button) return;
        if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
          event.preventDefault();event.stopPropagation();
          const list=picks(), index=list.indexOf(button), next=event.key==='Home'?0:event.key==='End'?list.length-1:Math.max(0,Math.min(list.length-1,index+(event.key==='ArrowDown'?1:-1))), target=list[next];
          pick(target,event.shiftKey);focusAfter(target.id);
        } else if(event.key==='ArrowRight'&&button.dataset.objectGroupPick) {
          event.preventDefault();event.stopPropagation();
          const id=button.dataset.objectGroupPick;
          if(!expanded.has(id)) expand(id,true);
          else {const child=button.closest('.object-group').querySelector('[data-object-pick]');if(child){pick(child,false);focusAfter(child.id);}}
        } else if(event.key==='ArrowLeft') {
          const group=button.closest('.object-group'); if(!group) return;
          event.preventDefault();event.stopPropagation();
          if(button.dataset.objectGroupPick) expand(button.dataset.objectGroupPick,false);
          else focusAfter(groupPickId(group.dataset.objectUnit));
        } else if(!toggle&&(event.key==='Enter'||event.key===' ')) {
          event.preventDefault();event.stopPropagation();pick(button,event.shiftKey);focusAfter(button.id);
        }
      });
      function previewDrop() {
        const target=document.elementFromPoint(drag.x,drag.y)?.closest(drag.kind==='child'?'.object-row':'.object-unit');
        panel.querySelectorAll('.drop-before,.drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'));
        if(!target||!rows.contains(target)||target===drag.row||drag.kind==='child'&&target.dataset.objectUnit!==drag.group) {drag.target=null;return;}
        drag.target=drag.kind==='child'?target.dataset.objectRow:target.dataset.objectKey;
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
      listen(rows,'pointerdown',event=>{
        const handle=event.target.closest('[data-object-drag]');
        if(!handle||event.button!==0||!valid()||drag) return;
        const kind=handle.dataset.objectDrag, row=handle.closest(kind==='child'?'.object-row':'.object-unit');
        event.preventDefault();event.stopPropagation();handle.focus({preventScroll:true});
        drag={kind,row,handle,pointer:event.pointerId,id:kind==='child'?row.dataset.objectRow:row.dataset.objectKey,group:row.dataset.objectUnit,target:null,front:false,page:ctx.page(),x:event.clientX,y:event.clientY};
        drag.frame=requestAnimationFrame(autoScroll);
        row.classList.add('dragging');handle.setPointerCapture(event.pointerId);window.addEventListener('blur',cancelDrag);
      });
      listen(rows,'pointermove',event=>{
        if(!drag||event.pointerId!==drag.pointer) return;
        if(!valid()||ctx.page()!==drag.page) {cancelDrag();return;}
        drag.x=event.clientX;drag.y=event.clientY;previewDrop();
      });
      listen(rows,'pointerup',event=>{
        if(!drag||event.pointerId!==drag.pointer) return;
        const previous=drag, current=valid()&&ctx.page()===previous.page;
        cancelDrag();if(!current||!previous.target) return;
        if(previous.kind==='child') ctx.changePage(page=>M.reorderChild(page,previous.id,previous.target,previous.front));
        else ctx.changePage(page=>M.reorder(page,previous.id,previous.target,previous.front));
        const id=previous.kind==='child'?pickId(previous.id):previous.id.startsWith('g:')?groupPickId(previous.row.dataset.objectUnit):pickId(previous.row.dataset.objectUnit);
        focusAfter(id);
      });
      listen(rows,'pointercancel',cancelDrag);listen(rows,'lostpointercapture',cancelDrag);
    }
    return Object.freeze({open,get isDragging(){return !!drag;},cancelDrag});
  }
  window.IlapoObjectsUI=Object.freeze({create});
}());
