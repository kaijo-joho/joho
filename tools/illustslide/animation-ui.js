/* 動きの一覧と設定は、選択ポップアップから開く非モーダルの設定パネルに置く。 */
(function(root){
  'use strict';
  const triggers={click:'クリック時',with:'前の動きと同時',after:'前の動きの後'};
  const directions={right:'右へ',left:'左へ',down:'下へ',up:'上へ'};
  const choices=['in','out'].flatMap(mode=>[{key:`fade-${mode}`,effect:'fade',mode,label:`フェード${mode==='in'?'イン':'アウト'}`,short:'フェード'},...Object.entries(directions).map(([direction,name])=>({key:`wipe-${direction}-${mode}`,effect:'wipe',mode,direction,label:`ワイプ${mode==='in'?'イン':'アウト'}（${name}）`,short:name}))]).concat([{key:'color',effect:'color',label:'色変更',short:'色変更'},{key:'move',effect:'move',label:'移動',short:'移動'}]);
  const choiceKey=a=>a.effect==='fade'?`fade-${a.mode}`:a.effect==='wipe'?`wipe-${a.direction}-${a.mode}`:a.effect;
  const choiceOf=a=>choices.find(c=>c.key===choiceKey(a));
  function effectIcon(c){
    let body;
    if(c.effect==='fade'){body='<rect x="3" y="5" width="25" height="18" rx="2" fill="none" stroke="currentColor" stroke-dasharray="2 2"/>';for(let i=0;i<5;i++)body+=`<rect x="${4+i*5}" y="6" width="4" height="16" fill="currentColor" opacity="${c.mode==='in'?(i+1)/5:(5-i)/5}"/>`;}
    else if(c.effect==='wipe'){const r={right:0,down:90,left:180,up:270}[c.direction];body=`<g transform="rotate(${r} 16 16)"><rect x="4" y="4" width="24" height="24" rx="2" fill="none" stroke="currentColor" stroke-dasharray="2 2"/><path d="${c.mode==='in'?'M5 5h11v22H5Z':'M16 5h11v22H16Z'}" fill="currentColor" opacity=".25"/><path d="M16 5v22M6 16h19m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;}
    else if(c.effect==='color')body='<path d="M25 23c-2 5-7 6-12 4C1 22 3 6 14 4c9-2 16 5 14 11-1 4-8 0-8 4 0 2 6 0 5 4Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="11" cy="11" r="2.5" fill="#ef4444"/><circle cx="20" cy="10" r="2.5" fill="#2563eb"/><circle cx="9" cy="19" r="2.5" fill="#f59e0b"/>';
    else body='<path d="M16 3v26M3 16h26M12 7l4-4 4 4M12 25l4 4 4-4M7 12l-4 4 4 4M25 12l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    if(c.mode)body+=`<circle cx="26" cy="26" r="5" fill="var(--panel)" stroke="currentColor"/><path d="M23 26h6${c.mode==='in'?'M26 23v6':''}" stroke="currentColor" stroke-width="1.5"/>`;
    return `<svg class="animation-effect-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  function triggerIcon(key) {
    const body = {
      click: '<rect x="9" y="5" width="14" height="22" rx="7"/><path d="M9 14h14M16 5v9M5 5 3 3M5 11H2M8 2V0"/>',
      with: '<rect x="5" y="5" width="22" height="7" rx="2"/><rect x="5" y="20" width="22" height="7" rx="2"/><path d="M5 14v4M27 14v4"/>',
      after: '<rect x="2" y="5" width="13" height="7" rx="2"/><rect x="17" y="20" width="13" height="7" rx="2"/><path d="M15 8h5v9m-3-3 3 3 3-3"/>'
    }[key];
    return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }
  function create(ctx){
    const C=root.IlapoCore,A=root.IlapoAnimation,$=ctx.inspectorElement||(id=>document.getElementById(id)),esc=ctx.esc;
    let drag=null,listKeys=null;
    const body=()=>$('inspector-body'),q=s=>body()?.querySelector(s),qa=s=>[...(body()?.querySelectorAll(s)||[])];
    const names=ids=>ids.map(id=>ctx.page().objects.find(o=>o.id===id)?.name||'図形').join('、');
    const targets=()=>ctx.page().objects.filter(o=>ctx.selected().includes(o.id)&&!(o.type==='image'&&o.reference)).map(o=>o.id);
    const preview=(page)=>{const doc=C.clone(ctx.document());doc.pages=[page];root.IlapoPresentation.open(C.validateDocument(doc),{pageId:page.id,opener:document.activeElement});};
    const option=(values,selected)=>Object.entries(values).map(([k,v])=>`<option value="${k}" ${k===selected?'selected':''}>${v}</option>`).join('');
    function cards(initial,image){const button=c=>`<button type="button" class="animation-effect-card" data-animation-choice="${c.key}" aria-label="${c.label}" data-tip="${c.label}" aria-pressed="${c.key===choiceKey(initial)}" ${image&&c.effect==='color'?'disabled':''}>${effectIcon(c)}<span>${c.short}</span></button>`;return `<div class="animation-effect-cards">${[['in','表示'],['out','消去']].map(([m,label])=>`<div class="animation-effect-group" role="group" aria-label="${label}の効果"><span class="animation-effect-group-label">${label}</span>${choices.filter(c=>c.mode===m).map(button).join('')}</div>`).join('')}<div class="animation-effect-other" role="group" aria-label="変化の効果">${choices.filter(c=>!c.mode).map(button).join('')}</div></div>`;}
    function cancelDrag(){
      if(!drag)return;
      const state=drag;
      drag=null;
      cancelAnimationFrame(state.scrollFrame||0);
      try { if(state.handle.hasPointerCapture?.(state.pointerId)) state.handle.releasePointerCapture(state.pointerId); } catch (_) {}
      state.rows.forEach(row=>row.classList.remove('animation-row-dragging','animation-row-drop-before','animation-row-drop-after'));
      document.documentElement.classList.remove('animation-order-dragging');
    }
    function move(from, to) {
      if (from === to) return;
      ctx.changePage(page => {
        const [animation] = page.animations.splice(from, 1);
        page.animations.splice(to, 0, animation);
      });
    }
    function dragStart(event, index) {
      if (event.button !== 0 || drag || ctx.isBusy?.()) return;
      const row = event.currentTarget.closest('.animation-row');
      if (!row) return;
      event.preventDefault();
      const pageRef = ctx.page();
      drag = {pointerId:event.pointerId, handle:event.currentTarget, from:index, to:index, row,
        rows:qa('.animation-row[data-animation-index]'), startY:event.clientY, lastY:event.clientY,
        lastX:event.clientX, active:false, inside:true, docId:ctx.document().id, pageId:pageRef.id, pageRef};
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    function updateDrop() {
      if (!drag) return;
      const rect = body()?.getBoundingClientRect();
      drag.inside = !!rect && drag.lastX >= rect.left && drag.lastX <= rect.right && drag.lastY >= rect.top && drag.lastY <= rect.bottom;
      drag.rows.forEach(row => row.classList.remove('animation-row-drop-before','animation-row-drop-after'));
      drag.to = drag.from;
      if (!drag.inside || !drag.active) return;
      // Move only after crossing a neighbouring row's centre. Staying within
      // the source row must not turn a small pointer movement into a reorder.
      for (const row of drag.rows) {
        const index = Number(row.dataset.animationIndex), r = row.querySelector('.animation-row-main').getBoundingClientRect(), middle = r.top + r.height / 2;
        // Pointer coordinates may round half CSS pixels. The one-pixel margin
        // also makes dropping directly on a neighbouring handle reliable.
        if (index < drag.from && drag.lastY <= middle + 1) drag.to = Math.min(drag.to,index);
        if (index > drag.from && drag.lastY >= middle - 1) drag.to = Math.max(drag.to,index);
      }
      if (drag.to !== drag.from) drag.rows[drag.to]?.classList.add(drag.to < drag.from ? 'animation-row-drop-before' : 'animation-row-drop-after');
    }
    function autoScroll() {
      if (!drag) return;
      if (drag.pageRef !== ctx.page() || ctx.isBusy?.()) { cancelDrag(); return; }
      updateDrop();
      const panel = body(), rect = panel?.getBoundingClientRect();
      const amount = !drag.inside || !rect ? 0 : drag.lastY < rect.top + 42 ? -12 : drag.lastY > rect.bottom - 42 ? 12 : 0;
      const before = panel?.scrollTop;
      if (amount) { panel.scrollTop += amount; updateDrop(); }
      drag.scrollFrame = amount && before !== panel.scrollTop ? requestAnimationFrame(autoScroll) : 0;
    }
    function dragMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.lastX = event.clientX; drag.lastY = event.clientY;
      if (!drag.active && Math.abs(event.clientY - drag.startY) < 5) return;
      drag.active = true;
      drag.row.classList.add('animation-row-dragging');
      document.documentElement.classList.add('animation-order-dragging');
      updateDrop();
      if (!drag.scrollFrame) drag.scrollFrame = requestAnimationFrame(autoScroll);
    }
    function dragFinish(event, cancelled) {
      if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
      const state = drag;
      if (event?.clientX != null) { state.lastX = event.clientX; state.lastY = event.clientY; updateDrop(); }
      const safe = state.active && state.inside && state.docId === ctx.document().id && state.pageId === ctx.page().id && state.pageRef === ctx.page() && !ctx.isBusy?.();
      cancelDrag();
      if (!cancelled && safe && state.from !== state.to) { move(state.from,state.to); list(null,state.to); }
    }
    function formMarkup(initial,ids){
      const objects=ctx.page().objects.filter(o=>ids.includes(o.id)),image=objects.some(o=>o.type==='image'),connector=objects.some(o=>o.type==='connector'),chosen=choiceOf(initial);
      return `<div class="animation-edit"><div class="animation-targets">${root.IlapoObjectPreview.markup(ctx.page(),ids)}<span>${esc(names(ids))}</span></div><p id="animation-effect-caption" class="animation-effect-caption">${chosen.label}</p>${cards(initial,image)}<div class="fields animation-timing"><fieldset class="animation-trigger-group"><legend>開始</legend>${Object.entries(triggers).map(([key,label])=>`<button type="button" class="animation-trigger" data-animation-trigger="${key}" aria-label="${label}" data-tip="${label}" aria-pressed="${key===initial.trigger}">${triggerIcon(key)}</button>`).join('')}</fieldset><label>時間（秒）<input id="animation-duration" type="number" min="0" max="10" step="any" required value="${initial.duration/1000}"></label><label>開始を遅らせる（秒）<input id="animation-delay" type="number" min="0" max="10" step="any" required value="${initial.delay/1000}"></label></div><div id="animation-motion" class="fields"><label>横に移動（px）<input id="animation-dx" type="number" min="-10000000" max="10000000" step="any" value="${initial.dx??ctx.standardSize()}"></label><label>縦に移動（px）<input id="animation-dy" type="number" min="-10000000" max="10000000" step="any" value="${initial.dy??0}"></label></div><div id="animation-colors"><label>変える色<select id="animation-channel">${option(connector?{stroke:'線・矢印・ラベル'}:{fill:'塗り・文字',stroke:'線'},initial.channel||(connector?'stroke':'fill'))}</select></label><div class="swatches">${ctx.palette.map(color=>`<button type="button" data-animation-color="${color}" style="--swatch:${color}" aria-label="色 ${color}" data-tip="色 ${color}"></button>`).join('')}</div><div class="row"><input type="color" id="animation-color-picker" aria-label="自由な色を選択"><input id="animation-color-hex" aria-label="色の16進数" maxlength="7" pattern="#[0-9A-Fa-f]{6}"></div></div><p id="animation-detail" class="muted"></p><button type="button" id="animation-try">このページを試す</button></div>`;
    }
    function bindEditor(initial,ids,onApplied){
      let chosen=choiceOf(initial),trigger=initial.trigger,color=initial.color||'#2563EB';
      const updateColor=value=>{color=value.toUpperCase();$('animation-color-picker').value=color;$('animation-color-hex').value=color;qa('[data-animation-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.animationColor===color)));};
      function fields(){$('animation-effect-caption').textContent=chosen.label;qa('[data-animation-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.animationChoice===chosen.key)));qa('[data-animation-trigger]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.animationTrigger===trigger)));$('animation-motion').hidden=chosen.effect!=='move';$('animation-colors').hidden=chosen.effect!=='color';for(const id of ['animation-motion','animation-colors'])$(id).querySelectorAll('input,select').forEach(el=>el.disabled=!!el.closest('[hidden]'));$('animation-detail').textContent=chosen.effect==='move'?'正の横は右、正の縦は下。複数の移動は順に足します。':['fade','wipe'].includes(chosen.effect)?'最初の動きが「表示する」の図形は、発表の開始時には隠れています。':'同じ色への複数の動きが重なるときは、一覧で後の動きを優先します。';}
      function read(){if(!$('inspector-form').reportValidity())throw Error('入力値を確認してください。');const a={id:initial.id,targets:ids,effect:chosen.effect,trigger,duration:Number($('animation-duration').value)*1000,delay:Number($('animation-delay').value)*1000};if(chosen.effect==='fade'||chosen.effect==='wipe')a.mode=chosen.mode;if(chosen.effect==='wipe')a.direction=chosen.direction;if(chosen.effect==='move'){a.dx=Number($('animation-dx').value);a.dy=Number($('animation-dy').value);}if(chosen.effect==='color'){a.channel=$('animation-channel').value;a.color=color;}C.validateAnimation(a,ctx.page());return a;}
      qa('[data-animation-choice]').forEach(b=>b.onclick=()=>{chosen=choices.find(c=>c.key===b.dataset.animationChoice);fields();});qa('[data-animation-trigger]').forEach(b=>b.onclick=()=>{trigger=b.dataset.animationTrigger;fields();});qa('[data-animation-color]').forEach(b=>b.onclick=()=>updateColor(b.dataset.animationColor));$('animation-color-picker').oninput=()=>updateColor($('animation-color-picker').value);$('animation-color-hex').oninput=()=>{if(/^#[0-9a-f]{6}$/i.test($('animation-color-hex').value))updateColor($('animation-color-hex').value);};$('animation-try').onclick=()=>{try{const a=read(),p=C.clone(ctx.page());p.animations||=[];const i=p.animations.findIndex(v=>v.id===a.id);if(i<0)p.animations.push(a);else p.animations[i]=a;preview(p);}catch(e){$('inspector-error').textContent=e.message;$('inspector-error').hidden=false;}};updateColor(color);fields();
      return ()=>{const a=read();ctx.changePage(p=>{p.animations||=[];const i=p.animations.findIndex(v=>v.id===a.id);if(i<0)p.animations.push(a);else p.animations[i]=a;});onApplied?.(a);};
    }
    function list(expandedId,focusIndex){
      cancelDrag();
      listKeys?.abort();
      listKeys=new AbortController();
      const page=ctx.page(),animations=page.animations||[],selected=new Set(ctx.selected()),plan=A.compile(root.IlapoLayers.forOutput(page)),places=new Map();
      plan.groups.forEach(g=>g.items.forEach(item=>places.set(item.animation.id,{group:g.index,start:item.start})));
      let apply;
      const rows=animations.map((a,i)=>{const at=places.get(a.id),choice=choiceOf(a),name=names(a.targets),timing=at?`${at.group?'クリック '+at.group:'ページ開始'} · ${triggers[a.trigger]} · ${at.start/1000}秒〜 / ${a.duration/1000}秒間`:'非表示・再生対象外',description=`${i+1}. ${choice.label} · ${name} · ${timing}`,expanded=a.id===expandedId,dragIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="6" r="1.2"/><circle cx="16" cy="6" r="1.2"/><circle cx="8" cy="12" r="1.2"/><circle cx="16" cy="12" r="1.2"/><circle cx="8" cy="18" r="1.2"/><circle cx="16" cy="18" r="1.2"/></svg>',moreIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';return `<div class="animation-row ${a.targets.some(id=>selected.has(id))?'selected':''} ${at?'':'animation-row-unavailable'}" data-animation-index="${i}"><div class="animation-row-main"><button type="button" class="animation-order-handle" data-animation-handle="${i}" aria-label="動き${i+1}の順序をドラッグして変更" data-tip="ドラッグで順序変更。Alt+↑/↓でも移動できます">${dragIcon}</button><button type="button" class="animation-title" data-animation-edit="${i}" aria-label="${esc(description)}" data-tip="${esc(description)}">${root.IlapoObjectPreview.markup(page,a.targets)}<span class="animation-row-effect" aria-hidden="true">${effectIcon(choice)}</span><span class="animation-row-text"><strong>${i+1}. ${esc(name)}</strong><small><span class="animation-row-trigger">${triggerIcon(a.trigger)}</span>${at?`${triggers[a.trigger]} · ${a.duration/1000}秒`:'非表示・再生対象外'}</small></span></button><button type="button" class="animation-more" data-animation-more="${i}" aria-label="動き${i+1}の詳細メニュー" data-tip="詳細メニュー" aria-expanded="${expanded}">${moreIcon}</button></div>${expanded?`<div class="animation-row-editor"><div class="animation-row-menu"><button type="button" data-animation-close-edit="${i}">編集を閉じる</button><button type="button" class="danger" data-animation-delete="${i}">削除</button></div>${formMarkup(a,a.targets)}</div>`:''}</div>`;}).join('')||'<p>まだ動きがありません。図形を選んでから追加できます。</p>';
      function updateRows(){
        const current=ctx.page(),all=current.animations||[],compiled=A.compile(root.IlapoLayers.forOutput(current)),locations=new Map();
        compiled.groups.forEach(group=>group.items.forEach(item=>locations.set(item.animation.id,{group:group.index,start:item.start})));
        q('#animation-summary').textContent=`${current.name} · クリック ${compiled.steps}回。最初の「同時」「後」は、ページを開くと自動で始まります。`;
        all.forEach((animation,index)=>{
          const row=q(`[data-animation-index="${index}"]`),location=locations.get(animation.id);
          if(!row)return;
          row.classList.toggle('animation-row-unavailable',!location);
          row.querySelector('.animation-row-effect').innerHTML=effectIcon(choiceOf(animation));
          const timing=location?`${location.group?'クリック '+location.group:'ページ開始'} · ${triggers[animation.trigger]} · ${location.start/1000}秒〜 / ${animation.duration/1000}秒間`:'非表示・再生対象外';
          const text=`${index+1}. ${choiceOf(animation).label} · ${names(animation.targets)} · ${timing}`;
          const title=row.querySelector('.animation-title'),small=row.querySelector('.animation-row-text small');
          title.setAttribute('aria-label',text);title.dataset.tip=text;
          if(small)small.innerHTML=`<span class="animation-row-trigger">${triggerIcon(animation.trigger)}</span>${location?`${triggers[animation.trigger]} · ${animation.duration/1000}秒`:'非表示・再生対象外'}`;
        });
      }
      const open=expandedId&&animations.find(a=>a.id===expandedId);
      ctx.showInspector('animation','動きと再生順序',`<p id="animation-summary" class="muted">${esc(page.name)} · クリック ${plan.steps}回。最初の「同時」「後」は、ページを開くと自動で始まります。</p><div class="animation-list">${rows}</div><div class="list-actions"><button type="button" id="animation-add" ${targets().length?'':'disabled'}>＋ 選択した図形に追加</button><button type="button" id="animation-preview">このページを試す</button></div><p class="muted">行のハンドルをドラッグするか、ハンドルにフォーカスして Alt+↑/↓ で順序を変更できます。削除は各行の︙にあります。</p>`,null,open?()=>apply():null,{auto:!!open,refresh:open?()=>list(open.id):undefined});
      const listRoot=q('.animation-list');
      q('#animation-add').onclick=()=>edit();q('#animation-preview').onclick=()=>preview(C.clone(ctx.page()));qa('[data-animation-edit],[data-animation-more]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.animationEdit??b.dataset.animationMore),id=animations[i].id;if(id===expandedId){list();requestAnimationFrame(()=>q(`[data-animation-more="${i}"]`)?.focus());}else list(id);});qa('[data-animation-close-edit]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.animationCloseEdit);list();requestAnimationFrame(()=>q(`[data-animation-more="${i}"]`)?.focus());});qa('[data-animation-delete]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.animationDelete);ctx.changePage(p=>p.animations.splice(i,1));list(null,Math.min(i,ctx.page().animations.length-1));});
      qa('[data-animation-handle]').forEach(h=>{const i=Number(h.dataset.animationHandle);h.addEventListener('pointerdown',e=>dragStart(e,i));h.addEventListener('pointermove',dragMove);h.addEventListener('pointerup',e=>dragFinish(e,false));h.addEventListener('pointercancel',e=>dragFinish(e,true));h.addEventListener('lostpointercapture',e=>dragFinish(e,true));h.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key)||ctx.isBusy?.())return;const to=i+(e.key==='ArrowUp'?-1:1);if(to<0||to>=animations.length)return;e.preventDefault();move(i,to);list(null,to);});});body()?.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&open&&listRoot.isConnected&&listRoot.closest('.inspector-body')?.contains(e.target)){e.preventDefault();e.stopPropagation();const i=animations.findIndex(a=>a.id===open.id);list();requestAnimationFrame(()=>q(`[data-animation-more="${i}"]`)?.focus());}},{signal:listKeys.signal});if(open)apply=bindEditor(open,open.targets,updateRows);if(Number.isInteger(focusIndex))requestAnimationFrame(()=>q(`[data-animation-index="${focusIndex}"] .animation-order-handle`)?.focus());
    }
    function edit(id){listKeys?.abort();cancelDrag();const old=id&&ctx.page().animations?.find(a=>a.id===id);if(old){list(old.id);return;}const ids=targets();if(!ids.length){ctx.toast('動きを付ける図形を選んでください。下絵は対象に含めません。');return;}const initial={id:C.uid('animation'),targets:ids,effect:'fade',trigger:'click',duration:600,delay:0,mode:'in'};let apply;ctx.showInspector('animation','動きを追加',formMarkup(initial,ids),'追加',()=>apply(),{refresh:()=>list()});apply=bindEditor(initial,ids);}
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();e.stopPropagation();cancelDrag();}},true);window.addEventListener('blur',cancelDrag);
    return {list,edit,cancelDrag,get isDragging(){return !!drag;}};
  }
  root.IlapoAnimationUI={create};
}(globalThis));
