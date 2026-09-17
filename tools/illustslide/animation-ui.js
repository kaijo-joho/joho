/* 動きの一覧と設定は、選択ポップアップから開く非モーダルの設定パネルに置く。 */
(function (root) {
  'use strict';
  const effects = {fade:'フェード', wipe:'ワイプ', color:'色の変更', move:'移動'};
  const triggers = {click:'クリック時', with:'前の動きと同時', after:'前の動きの後'};
  function create(ctx) {
    const C = root.IlapoCore, A = root.IlapoAnimation, $ = id => document.getElementById(id), esc = ctx.esc;
    const options = (values, selected) => Object.entries(values).map(([key, label]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${label}</option>`).join('');
    function targets() { return ctx.page().objects.filter(o => ctx.selected().includes(o.id) && !(o.type === 'image' && o.reference)).map(o => o.id); }
    function names(ids) { return ids.map(id => ctx.page().objects.find(o => o.id === id)?.name || '図形').join('、'); }
    function preview(page) {
      const doc = C.clone(ctx.document()); doc.pages = [page];
      root.IlapoPresentation.open(C.validateDocument(doc), {pageId:page.id, opener:document.activeElement});
    }
    function list() {
      const page = ctx.page(), animations = page.animations || [], selected = new Set(ctx.selected()), plan = A.compile(page);
      const locations = new Map();
      plan.groups.forEach(g => g.items.forEach(item => locations.set(item.animation.id, {group:g.index, start:item.start})));
      ctx.showInspector('animation','動きと再生順序', `<p class="muted">${esc(page.name)} · クリック ${plan.steps}回。最初の「同時」「後」は、ページを開くと自動で始まります。</p><div class="animation-list">${animations.map((a, i) => {
        const at = locations.get(a.id);
        return `<div class="animation-row ${a.targets.some(id => selected.has(id)) ? 'selected' : ''}"><button type="button" class="animation-title" data-animation-edit="${i}"><strong>${i + 1}. ${effects[a.effect]}${a.mode ? (a.mode === 'in' ? 'で表示' : 'で消す') : ''}</strong><span>${esc(names(a.targets))}</span><small>${at.group ? 'クリック ' + at.group : 'ページ開始'} · ${triggers[a.trigger]} · ${at.start / 1000}秒〜 / ${a.duration / 1000}秒間</small></button><div class="animation-row-actions"><button type="button" data-animation-move="${i},-1" aria-label="動き${i + 1}を前へ" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-animation-move="${i},1" aria-label="動き${i + 1}を後へ" ${i === animations.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-animation-delete="${i}" aria-label="動き${i + 1}を削除">削除</button></div></div>`;
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
      ctx.showInspector('animation',existing ? '動きを編集' : '動きを追加', `<p class="animation-targets">対象：${esc(names(ids))}</p><div class="fields"><label>効果<select id="animation-effect">${options(effects, initial.effect)}</select></label><label>開始<select id="animation-trigger">${options(triggers, initial.trigger)}</select></label><label>時間（秒）<input id="animation-duration" type="number" min="0" max="10" step="any" required value="${initial.duration / 1000}"></label><label>開始を遅らせる（秒）<input id="animation-delay" type="number" min="0" max="10" step="any" required value="${initial.delay / 1000}"></label></div><div id="animation-visibility" class="fields"><label>表示・消去<select id="animation-mode">${options({in:'表示する', out:'消す'}, initial.mode || 'in')}</select></label><label id="animation-direction-field">ワイプの向き<select id="animation-direction">${options({right:'左から右へ →', left:'右から左へ ←', down:'上から下へ ↓', up:'下から上へ ↑'}, initial.direction || 'right')}</select></label></div><div id="animation-motion" class="fields"><label>横に移動（px）<input id="animation-dx" type="number" min="-10000000" max="10000000" step="any" value="${initial.dx ?? ctx.standardSize()}"></label><label>縦に移動（px）<input id="animation-dy" type="number" min="-10000000" max="10000000" step="any" value="${initial.dy ?? 0}"></label></div><div id="animation-colors"><label>変える色<select id="animation-channel">${options(connector ? {stroke:'線・矢印・ラベル'} : {fill:'塗り・文字', stroke:'線'}, initial.channel || (connector ? 'stroke' : 'fill'))}</select></label><div class="swatches">${ctx.palette.map(color => `<button type="button" data-animation-color="${color}" style="--swatch:${color}" aria-label="色 ${color}"></button>`).join('')}</div><div class="row"><input type="color" id="animation-color-picker" aria-label="自由な色を選択"><input id="animation-color-hex" aria-label="色の16進数" maxlength="7" pattern="#[0-9A-Fa-f]{6}"></div><div class="fields three">${['R','G','B'].map(k => `<label>${k}<input id="animation-color-${k}" type="number" min="0" max="255" step="1"></label>`).join('')}</div><p class="muted">「色なし」からの変更は開始直後に色を付けます。線の太さは変えません。</p></div><p id="animation-detail" class="muted"></p><button type="button" id="animation-try">このページを試す</button>`, existing ? '変更' : '追加', () => {
        const animation = read();
        ctx.changePage(p => { p.animations ||= []; const index = p.animations.findIndex(a => a.id === animation.id); if (index < 0) p.animations.push(animation); else p.animations[index] = animation; });
        if(!existing)list();
      },{auto:!!existing,refresh:()=>edit(initial.id)});
      if (image) $('animation-effect').querySelector('[value=color]').disabled = true;
      let color = initial.color || '#2563EB';
      function updateColor(value) {
        color = value.toUpperCase(); $('animation-color-picker').value = color; $('animation-color-hex').value = color;
        ['R','G','B'].forEach((k, i) => $('animation-color-' + k).value = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16));
        document.querySelectorAll('[data-animation-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.animationColor === color)));
      }
      document.querySelectorAll('[data-animation-color]').forEach(b => b.onclick = () => updateColor(b.dataset.animationColor));
      $('animation-color-picker').oninput = () => updateColor($('animation-color-picker').value);
      $('animation-color-hex').oninput = () => { if (/^#[0-9a-f]{6}$/i.test($('animation-color-hex').value)) updateColor($('animation-color-hex').value); };
      ['R','G','B'].forEach(k => $('animation-color-' + k).oninput = () => {
        const values = ['R','G','B'].map(v => $('animation-color-' + v).value);
        if (values.every(v => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 255)) updateColor('#' + values.map(v => Number(v).toString(16).padStart(2, '0')).join(''));
      });
      function fields() {
        const effect = $('animation-effect').value;
        $('animation-visibility').hidden = !['fade','wipe'].includes(effect);
        $('animation-direction-field').hidden = effect !== 'wipe'; $('animation-motion').hidden = effect !== 'move'; $('animation-colors').hidden = effect !== 'color';
        for (const section of ['animation-visibility','animation-direction-field','animation-motion','animation-colors']) $(section).querySelectorAll('input,select').forEach(el => el.disabled = !!el.closest('[hidden]'));
        $('animation-detail').textContent = effect === 'move' ? '正の横は右、正の縦は下。複数の移動は順に足します。図形につながる矢印は追従し、矢印自体を動かす場合は発表中だけ接続を外して移動します。' : ['fade','wipe'].includes(effect) ? '最初の動きが「表示する」の図形は、発表の開始時には隠れています。ワイプは指定した向きへ、図形を表示・消去します。' : '同じ色への複数の動きが重なるときは、一覧で後の動きを優先します。';
      }
      function read() {
        if (!$('inspector-form').reportValidity()) throw Error('入力値を確認してください。');
        const effect = $('animation-effect').value;
        const a = {id:initial.id, targets:ids, effect, trigger:$('animation-trigger').value, duration:Number($('animation-duration').value) * 1000, delay:Number($('animation-delay').value) * 1000};
        if (effect === 'fade' || effect === 'wipe') a.mode = $('animation-mode').value;
        if (effect === 'wipe') a.direction = $('animation-direction').value;
        if (effect === 'move') { a.dx = Number($('animation-dx').value); a.dy = Number($('animation-dy').value); }
        if (effect === 'color') { a.channel = $('animation-channel').value; a.color = color; }
        C.validateAnimation(a, ctx.page()); return a;
      }
      $('animation-effect').onchange = fields;
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
