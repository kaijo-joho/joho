/* 動きの一覧と設定は、選択ポップアップから開く非モーダルの設定パネルに置く。 */
(function (root) {
  'use strict';
  const effects = {fade:'フェード', wipe:'ワイプ', color:'色の変更', move:'移動'};
  const triggers = {click:'クリック時', with:'前の動きと同時', after:'前の動きの後'};
  const directions = {right:'右へ', left:'左へ', down:'下へ', up:'上へ'};
  const choices = ['in', 'out'].flatMap(mode => [
    {key:`fade-${mode}`, effect:'fade', mode, label:`フェード${mode === 'in' ? 'イン' : 'アウト'}`, short:'フェード'},
    ...Object.entries(directions).map(([direction, name]) => ({key:`wipe-${direction}-${mode}`, effect:'wipe', mode, direction, label:`ワイプ${mode === 'in' ? 'イン' : 'アウト'}（${name}）`, short:name}))
  ]).concat([{key:'color', effect:'color', label:'色変更', short:'色変更'}, {key:'move', effect:'move', label:'移動', short:'移動'}]);
  function choiceKey(animation) {
    if (animation.effect === 'fade') return `fade-${animation.mode}`;
    if (animation.effect === 'wipe') return `wipe-${animation.direction}-${animation.mode}`;
    return animation.effect;
  }
  const choiceOf = animation => choices.find(choice => choice.key === choiceKey(animation));
  function effectIcon(choice) {
    let body;
    if (choice.effect === 'fade') {
      body = '<rect x="3" y="5" width="25" height="18" rx="2" fill="none" stroke="currentColor" stroke-dasharray="2 2"/>';
      for (let i = 0; i < 5; i++) body += `<rect x="${4 + i * 5}" y="6" width="4" height="16" fill="currentColor" opacity="${choice.mode === 'in' ? (i + 1) / 5 : (5 - i) / 5}"/>`;
    } else if (choice.effect === 'wipe') {
      const rotation = {right:0, down:90, left:180, up:270}[choice.direction];
      // Shade the revealed/remaining half, and move the boundary in the
      // direction used by the player. The +/- badge stays upright.
      body = `<g transform="rotate(${rotation} 16 16)"><rect x="4" y="4" width="24" height="24" rx="2" fill="none" stroke="currentColor" stroke-dasharray="2 2"/><path d="${choice.mode === 'in' ? 'M5 5h11v22H5Z' : 'M16 5h11v22H16Z'}" fill="currentColor" opacity=".25"/><path d="M16 5v22M6 16h19m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    } else if (choice.effect === 'color') {
      body = '<path d="M25 23c-2 5-7 6-12 4C1 22 3 6 14 4c9-2 16 5 14 11-1 4-8 0-8 4 0 2 6 0 5 4Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="11" cy="11" r="2.5" fill="#ef4444"/><circle cx="20" cy="10" r="2.5" fill="#2563eb"/><circle cx="9" cy="19" r="2.5" fill="#f59e0b"/>';
    } else {
      body = '<path d="M16 3v26M3 16h26M12 7l4-4 4 4M12 25l4 4 4-4M7 12l-4 4 4 4M25 12l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    if (choice.mode) body += `<circle cx="26" cy="26" r="5" fill="var(--panel)" stroke="currentColor"/><path d="M23 26h6${choice.mode === 'in' ? 'M26 23v6' : ''}" stroke="currentColor" stroke-width="1.5"/>`;
    return `<svg class="animation-effect-icon" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  function create(ctx) {
    const C = root.IlapoCore, A = root.IlapoAnimation, $ = id => document.getElementById(id), esc = ctx.esc;
    const options = (values, selected) => Object.entries(values).map(([key, label]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${label}</option>`).join('');
    function targets() { return ctx.page().objects.filter(o => ctx.selected().includes(o.id) && !(o.type === 'image' && o.reference)).map(o => o.id); }
    function names(ids) { return ids.map(id => ctx.page().objects.find(o => o.id === id)?.name || '図形').join('、'); }
    function effectCards(initial, image) {
      const button = choice => `<button type="button" class="animation-effect-card" data-animation-choice="${choice.key}" aria-label="${choice.label}" data-tip="${choice.label}" aria-pressed="${choice.key === choiceKey(initial)}" ${image && choice.effect === 'color' ? 'disabled' : ''}>${effectIcon(choice)}<span>${choice.short}</span></button>`;
      return `<div class="animation-effect-cards">${[['in','表示'],['out','消去']].map(([mode, label]) => `<div class="animation-effect-group" role="group" aria-label="${label}の効果"><span class="animation-effect-group-label">${label}</span>${choices.filter(choice => choice.mode === mode).map(button).join('')}</div>`).join('')}<div class="animation-effect-other" role="group" aria-label="変化の効果">${choices.filter(choice => !choice.mode).map(button).join('')}</div></div>`;
    }
    function objectPreview(page, ids) { return root.IlapoObjectPreview.markup(page, ids); }
    function preview(page) {
      const doc = C.clone(ctx.document()); doc.pages = [page];
      root.IlapoPresentation.open(C.validateDocument(doc), {pageId:page.id, opener:document.activeElement});
    }
    function list() {
      const page = ctx.page(), animations = page.animations || [], selected = new Set(ctx.selected()), plan = A.compile(root.IlapoLayers.forOutput(page));
      const locations = new Map();
      plan.groups.forEach(g => g.items.forEach(item => locations.set(item.animation.id, {group:g.index, start:item.start})));
      ctx.showInspector('animation','動きと再生順序', `<p class="muted">${esc(page.name)} · クリック ${plan.steps}回。最初の「同時」「後」は、ページを開くと自動で始まります。</p><div class="animation-list">${animations.map((a, i) => {
        const at = locations.get(a.id), choice = choiceOf(a), name = names(a.targets);
        const timing = at ? `${at.group ? 'クリック ' + at.group : 'ページ開始'} · ${triggers[a.trigger]} · ${at.start / 1000}秒〜 / ${a.duration / 1000}秒間` : '非表示・再生対象外';
        const description = `${i + 1}. ${choice.label} · ${name} · ${timing}`;
        return `<div class="animation-row ${a.targets.some(id => selected.has(id)) ? 'selected' : ''} ${at ? '' : 'animation-row-unavailable'}"><button type="button" class="animation-title" data-animation-edit="${i}" aria-label="${esc(description)}" data-tip="${esc(description)}">${objectPreview(page, a.targets)}<span class="animation-row-effect" aria-hidden="true">${effectIcon(choice)}</span><span class="animation-row-text"><strong>${i + 1}. ${esc(name)}</strong><small>${at ? `${triggers[a.trigger]} · ${a.duration / 1000}秒` : '非表示・再生対象外'}</small></span></button><div class="animation-row-actions"><button type="button" data-animation-move="${i},-1" aria-label="動き${i + 1}を前へ" data-tip="動き${i + 1}を前へ" ${i === 0 ? 'disabled' : ''}>${ctx.icon('up')}</button><button type="button" data-animation-move="${i},1" aria-label="動き${i + 1}を後へ" data-tip="動き${i + 1}を後へ" ${i === animations.length - 1 ? 'disabled' : ''}>${ctx.icon('down')}</button><button type="button" data-animation-delete="${i}" aria-label="動き${i + 1}を削除" data-tip="動き${i + 1}を削除">${ctx.icon('delete')}</button></div></div>`;
      }).join('') || '<p>まだ動きがありません。図形を選んでから追加できます。</p>'}</div><div class="list-actions"><button type="button" id="animation-add" ${targets().length ? '' : 'disabled'}>＋ 選択した図形に追加</button><button type="button" id="animation-preview">このページを試す</button></div><p class="muted">順序の変更・削除はすぐに反映し、元に戻す操作で取り消せます。図形の色や位置は、発表中だけ変化します。</p>`, null);
      $('animation-add').onclick = () => edit();
      $('animation-preview').onclick = () => preview(C.clone(ctx.page()));
      document.querySelectorAll('[data-animation-edit]').forEach(b => b.onclick = () => edit(animations[Number(b.dataset.animationEdit)].id));
      document.querySelectorAll('[data-animation-move]').forEach(b => b.onclick = () => {
        const [i, delta] = b.dataset.animationMove.split(',').map(Number);
        ctx.changePage(p => { const [a] = p.animations.splice(i, 1); p.animations.splice(i + delta, 0, a); }); list();
        document.querySelector(`[data-animation-edit="${i + delta}"]`)?.focus();
      });
      document.querySelectorAll('[data-animation-delete]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.animationDelete);
        ctx.changePage(p => p.animations.splice(i, 1)); list();
        (document.querySelector(`[data-animation-edit="${Math.min(i, ctx.page().animations.length - 1)}"]`) || $('animation-add')).focus();
      });
    }
    function edit(id) {
      const existing = id && ctx.page().animations?.find(a => a.id === id), ids = existing ? existing.targets.slice() : targets();
      if (!ids.length) { ctx.toast('動きを付ける図形を選んでください。下絵は対象に含めません。'); return; }
      const initial = existing || {id:C.uid('animation'), targets:ids, effect:'fade', trigger:'click', duration:600, delay:0, mode:'in'};
      const objects = ctx.page().objects.filter(o => ids.includes(o.id)), image = objects.some(o => o.type === 'image'), connector = objects.some(o => o.type === 'connector');
      let chosen = choiceOf(initial);
      ctx.showInspector('animation',existing ? '動きを編集' : '動きを追加', `<div class="animation-targets">${objectPreview(ctx.page(), ids)}<span>${esc(names(ids))}</span></div><p id="animation-effect-caption" class="animation-effect-caption">${chosen.label}</p>${effectCards(initial, image)}<div class="fields animation-timing"><label>開始<select id="animation-trigger">${options(triggers, initial.trigger)}</select></label><label>時間（秒）<input id="animation-duration" type="number" min="0" max="10" step="any" required value="${initial.duration / 1000}"></label><label>開始を遅らせる（秒）<input id="animation-delay" type="number" min="0" max="10" step="any" required value="${initial.delay / 1000}"></label></div><div id="animation-motion" class="fields"><label>横に移動（px）<input id="animation-dx" type="number" min="-10000000" max="10000000" step="any" value="${initial.dx ?? ctx.standardSize()}"></label><label>縦に移動（px）<input id="animation-dy" type="number" min="-10000000" max="10000000" step="any" value="${initial.dy ?? 0}"></label></div><div id="animation-colors"><label>変える色<select id="animation-channel">${options(connector ? {stroke:'線・矢印・ラベル'} : {fill:'塗り・文字', stroke:'線'}, initial.channel || (connector ? 'stroke' : 'fill'))}</select></label><div class="swatches">${ctx.palette.map(color => `<button type="button" data-animation-color="${color}" style="--swatch:${color}" aria-label="色 ${color}"></button>`).join('')}</div><div class="row"><input type="color" id="animation-color-picker" aria-label="自由な色を選択"><input id="animation-color-hex" aria-label="色の16進数" maxlength="7" pattern="#[0-9A-Fa-f]{6}"></div><p class="muted">「色なし」からの変更は開始直後に色を付けます。線の太さは変えません。</p></div><p id="animation-detail" class="muted"></p><button type="button" id="animation-try">このページを試す</button>`, existing ? '変更' : '追加', () => {
        const animation = read();
        ctx.changePage(p => { p.animations ||= []; const index = p.animations.findIndex(a => a.id === animation.id); if (index < 0) p.animations.push(animation); else p.animations[index] = animation; });
        if(!existing)list();
      },{auto:!!existing,refresh:()=>edit(initial.id)});
      let color = initial.color || '#2563EB';
      function updateColor(value) {
        color = value.toUpperCase(); $('animation-color-picker').value = color; $('animation-color-hex').value = color;
        document.querySelectorAll('[data-animation-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.animationColor === color)));
      }
      document.querySelectorAll('[data-animation-color]').forEach(b => b.onclick = () => updateColor(b.dataset.animationColor));
      $('animation-color-picker').oninput = () => updateColor($('animation-color-picker').value);
      $('animation-color-hex').oninput = () => { if (/^#[0-9a-f]{6}$/i.test($('animation-color-hex').value)) updateColor($('animation-color-hex').value); };
      function fields() {
        const effect = chosen.effect;
        $('animation-effect-caption').textContent = chosen.label;
        document.querySelectorAll('[data-animation-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.animationChoice === chosen.key)));
        $('animation-motion').hidden = effect !== 'move'; $('animation-colors').hidden = effect !== 'color';
        for (const section of ['animation-motion','animation-colors']) $(section).querySelectorAll('input,select').forEach(el => el.disabled = !!el.closest('[hidden]'));
        $('animation-detail').textContent = effect === 'move' ? '正の横は右、正の縦は下。複数の移動は順に足します。図形につながる矢印は追従し、矢印自体を動かす場合は発表中だけ接続を外して移動します。' : ['fade','wipe'].includes(effect) ? '最初の動きが「表示する」の図形は、発表の開始時には隠れています。ワイプは指定した向きへ、図形を表示・消去します。' : '同じ色への複数の動きが重なるときは、一覧で後の動きを優先します。';
      }
      function read() {
        if (!$('inspector-form').reportValidity()) throw Error('入力値を確認してください。');
        const effect = chosen.effect;
        const a = {id:initial.id, targets:ids, effect, trigger:$('animation-trigger').value, duration:Number($('animation-duration').value) * 1000, delay:Number($('animation-delay').value) * 1000};
        if (effect === 'fade' || effect === 'wipe') a.mode = chosen.mode;
        if (effect === 'wipe') a.direction = chosen.direction;
        if (effect === 'move') { a.dx = Number($('animation-dx').value); a.dy = Number($('animation-dy').value); }
        if (effect === 'color') { a.channel = $('animation-channel').value; a.color = color; }
        C.validateAnimation(a, ctx.page()); return a;
      }
      document.querySelectorAll('[data-animation-choice]').forEach(button => button.onclick = () => {
        chosen = choices.find(choice => choice.key === button.dataset.animationChoice);
        fields();
      });
      $('animation-try').onclick = () => {
        try { const a = read(), p = C.clone(ctx.page()); p.animations ||= []; const i = p.animations.findIndex(v => v.id === a.id); if (i < 0) p.animations.push(a); else p.animations[i] = a; preview(p); }
        catch (error) { $('inspector-error').textContent = error.message; $('inspector-error').hidden = false; }
      };
      updateColor(color); fields();
    }
    return {list, edit};
  }
  root.IlapoAnimationUI = {create};
}(globalThis));
