// 化学反応式ビルダーの画面：物質のカードを左辺・右辺へ入れ、係数を書き、途中式（式を写す・式を足す・両辺から消す）を作る。
// 式の構造・変形・採点はコア（chem-equation.js）に任せる。呼び出し方は計算式ビルダー（js/lesson-formula-builder.js）にそろえる：
//   ChemEquationBuilder.mount(host, definition, {onChange(draft), onJudge({taskId, rowId, draft})})
//   → {getDraft, setDraft, reset, setFeedback, setAnswersVisible, setDisabled, destroy}
// 操作：カードを選んでから式の欄（挿入位置）を押す、欄を押してからカードを押す、ドラッグする、のどれでも入る。
// 式の中の物質を押すと選ばれ、× で消せる。選んだまま別の欄を押すと移る。Escape で選びを取り消す。
(function (root) {
'use strict';
const Q = root.ChemEquation;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const SIDE_NAME = {lhs: '左辺', rhs: '右辺'};
const clone = o => JSON.parse(JSON.stringify(o));

function mount(host, def, opts = {}){
  if (!Q) throw new Error('chem-equation.js が読み込まれていません');
  let draft = Q.emptyDraft(def), feedback = {}, answersShown = false, disabled = false;
  let picked = null, cursor = null, selected = null, drag = null, suppressClick = false, entryMsg = '', dialogCtx = null;
  const ui = document.createElement('div');
  ui.className = 'chem-eq-builder';
  host.appendChild(ui);
  const dlg = document.createElement('dialog');
  dlg.className = 'ceq-dialog';
  host.appendChild(dlg);

  // ---- 下書きの補助 ----
  const rowsOf = taskId => draft.rows.filter(r => r.taskId === taskId);
  const rowById = id => draft.rows.find(r => r.id === id);
  const rowLabel = id => { const i = draft.rows.indexOf(rowById(id)); return i < 0 ? '消した式' : '式' + (i + 1); };
  // 表示順（小問の順）に並べなおし、式の番号を表示どおりにする
  const ordered = () => def.tasks.flatMap(t => rowsOf(t.id));
  const newId = () => { let i = draft.rows.length + 1; while (rowById('r' + i)) i++; return 'r' + i; };
  const spOf = text => Q.species(text);
  const allCards = () => [...new Set([...def.given, ...(def.common || []), ...draft.custom])];
  function changed(taskId, row){
    if (row && row.origin && !row.origin.edited) row.origin.edited = true;
    if (taskId) delete feedback[taskId];
    if (opts.onChange) try { opts.onChange(clone(draft)); } catch (e){ console.error('[equation-builder] onChange:', e); }
  }

  // ---- 描画 ----
  const cardHTML = (text, extra = '') => {
    const sp = spOf(text);
    return `<button type="button" class="ceq-card${picked === text ? ' is-picked' : ''}" data-card="${esc(text)}" data-fk="card:${esc(text)}" aria-pressed="${picked === text}" aria-label="${esc(sp.error ? text : Q.speciesText(sp))}${extra}"${disabled ? ' disabled' : ''}><span class="ceq-dots" aria-hidden="true">⠿</span><span class="ceq-f">${sp.error ? esc(text) : Q.speciesHTML(sp)}</span></button>`;
  };
  function slotHTML(row, side, i, n){
    const on = cursor && cursor.rowId === row.id && cursor.side === side && cursor.index === i;
    const label = n ? `${rowLabel(row.id)}の${SIDE_NAME[side]}の ${i + 1} 番目に入れる` : `${rowLabel(row.id)}の${SIDE_NAME[side]}に入れる`;
    return `<button type="button" class="ceq-slot${on ? ' is-active' : ''}${n ? '' : ' is-empty'}" data-row="${row.id}" data-side="${side}" data-i="${i}" data-fk="slot:${row.id}:${side}:${i}" aria-label="${label}" aria-pressed="${on}"${disabled ? ' disabled' : ''}>${n ? '' : SIDE_NAME[side]}</button>`;
  }
  function sideHTML(row, side){
    const terms = row[side];
    let h = `<div class="ceq-side" data-row="${row.id}" data-side="${side}" role="group" aria-label="${rowLabel(row.id)}の${SIDE_NAME[side]}">`;
    terms.forEach((t, i) => {
      const sp = spOf(t.sp), name = sp.error ? t.sp : Q.speciesText(sp);
      const sel = selected && selected.rowId === row.id && selected.side === side && selected.index === i;
      h += slotHTML(row, side, i, terms.length);
      if (i) h += '<span class="ceq-plus" aria-hidden="true">+</span>';
      h += `<span class="ceq-term${sel ? ' is-selected' : ''}">` +
        `<input class="ceq-coef" inputmode="numeric" autocomplete="off" maxlength="3" value="${esc(t.coef)}" data-row="${row.id}" data-side="${side}" data-i="${i}" data-fk="coef:${row.id}:${side}:${i}" aria-label="${rowLabel(row.id)}、${SIDE_NAME[side]}の ${name} の係数（1 は空欄）"${disabled ? ' disabled' : ''}>` +
        `<button type="button" class="ceq-sp" data-row="${row.id}" data-side="${side}" data-i="${i}" data-fk="term:${row.id}:${side}:${i}" aria-pressed="${sel}" aria-label="${SIDE_NAME[side]}の ${i + 1} 番目、${esc(name)}（押すと選んで、移す・消すができます）"${disabled ? ' disabled' : ''}>${sp.error ? esc(t.sp) : Q.speciesHTML(sp)}</button>` +
        (sel ? `<button type="button" class="ceq-del" data-del="1" data-fk="del:${row.id}:${side}:${i}" aria-label="${esc(name)} を消す">×</button>` : '') + '</span>';
    });
    h += slotHTML(row, side, terms.length, terms.length) + '</div>';
    return h;
  }
  // 途中式の出どころ（HTML）。化学式は下付き・上付きで出す
  function originHTML(o){
    if (!o) return '';
    const sfx = o.edited ? '（あとで直した）' : '';
    if (o.op === 'copy') return `${rowLabel(o.rowId)}を写した式${sfx}`;
    if (o.op === 'add') return esc(o.items.map(x => rowLabel(x.rowId) + (x.k && x.k !== '1' ? ` ×${x.k}` : '')).join(' ＋ ')) + ` を足した式${sfx}`;
    if (o.op === 'cancel'){ const sp = spOf(o.sp); return `${rowLabel(o.rowId)}の両辺から ${esc(o.n && o.n !== '1' ? o.n : '')}${sp.error ? esc(o.sp) : Q.speciesHTML(sp)} を消した式${sfx}`; }
    return '';
  }
  function feedbackHTML(task){
    const j = feedback[task.id];
    if (!j) return '';
    if (j.status !== 'judged') return `<p class="ceq-fb is-error">判定できません：${esc((j.messages || []).join('／'))}</p>`;
    if (j.correct) return '<p class="ceq-fb is-ok">◯ 正しい反応式です。</p>';
    const items = j.items.map(i => `<li class="${i.ok === true ? 'is-ok' : i.ok === false ? 'is-error' : 'is-skip'}">${i.ok === true ? '◯' : i.ok === false ? '×' : '－'} ${esc(i.label)}</li>`).join('');
    return `<ul class="ceq-check" aria-label="判定の結果">${items}</ul>` + (j.messages.length ? `<p class="ceq-fb is-error">${j.messages.map(esc).join('<br>')}</p>` : '');
  }
  function taskHTML(task, ti){
    const rows = rowsOf(task.id), last = rows[rows.length - 1];
    const full = draft.rows.length >= Q.LIMITS.rows, common = Q.commonSpecies(last, def).length > 0;
    const filled = draft.rows.filter(r => r.lhs.length && r.rhs.length).length;
    const rowsH = rows.map(row => `<div class="ceq-row" data-row="${row.id}">` +
      `<div class="ceq-row-head"><span class="ceq-row-label">${rowLabel(row.id)}</span>${row.origin ? `<span class="ceq-origin">${originHTML(row.origin)}</span>` : ''}</div>` +
      `<div class="ceq-line"><div class="ceq-eq">${sideHTML(row, 'lhs')}<span class="ceq-rhs"><span class="ceq-arrow" aria-label="反応して">→</span>${sideHTML(row, 'rhs')}</span></div>` +
      (row === last ? `<button type="button" class="ceq-judge" data-judge="${task.id}" data-fk="judge:${task.id}"${disabled ? ' disabled' : ''}>判定</button>` : '') + '</div></div>').join('');
    const ans = answersShown ? `<p class="ceq-answer"><b>答え</b> ${task.answers.map(a => Q.equationHTML(a)).join('<span class="ceq-or">（または）</span>')}</p>` : '';
    const dis = b => disabled || b ? ' disabled' : '';
    return `<section class="ceq-task" data-task="${task.id}" aria-label="${esc(task.label)}"><h4>${def.tasks.length > 1 ? `(${ti + 1}) ` : ''}${esc(task.label)}</h4>` +
      `<div class="ceq-rows">${rowsH}</div><div class="ceq-feedback" aria-live="polite">${feedbackHTML(task)}</div>` +
      `<div class="ceq-tools">` +
      `<button type="button" class="ceq-tool" data-op="copy" data-task="${task.id}" data-fk="op:copy:${task.id}"${dis(full || !(last.lhs.length || last.rhs.length))} title="最後の式を写して、下に新しい行を作る">式を写す</button>` +
      `<button type="button" class="ceq-tool" data-op="add" data-task="${task.id}" data-fk="op:add:${task.id}"${dis(full || !filled)} title="式を（何倍かして）足し合わせた式を、下に作る">式を足す</button>` +
      `<button type="button" class="ceq-tool" data-op="cancel" data-task="${task.id}" data-fk="op:cancel:${task.id}"${dis(full || !common)} title="${common ? '両辺にある物質を、両辺から同じ数だけ消した式を、下に作る' : '最後の式の両辺に同じ物質があるときに使えます'}">両辺から消す</button>` +
      (rows.length > 1 ? `<button type="button" class="ceq-tool" data-op="remove" data-task="${task.id}" data-fk="op:remove:${task.id}"${dis(false)}>最後の式を消す</button>` : '') +
      `</div>${ans}</section>`;
  }
  function render(){
    const a = document.activeElement, fk = a && ui.contains(a) && a.dataset ? a.dataset.fk : null;
    const pos = a && a.classList && a.classList.contains('ceq-coef') ? a.selectionStart : null;
    const given = def.given.map(t => cardHTML(t)).join(''), common = (def.common || []).filter(t => !def.given.includes(t)).map(t => cardHTML(t)).join('');
    const custom = draft.custom.filter(t => !def.given.includes(t) && !(def.common || []).includes(t)).map(t => cardHTML(t, '（入力した物質）')).join('');
    ui.classList.toggle('is-disabled', disabled);
    ui.classList.toggle('is-placing', !!(picked || selected));   // カード・物質を選んでいる間は、入れられる位置を見せる
    ui.innerHTML = (def.title ? `<h3 class="ceq-title">${esc(def.title)}</h3>` : '') +
      `<div class="ceq-palette" role="group" aria-label="式に入れる物質">` +
      `<div class="ceq-cards"><span class="ceq-plabel">問題の物質</span>${given}${common ? `<span class="ceq-sep" aria-hidden="true"></span><span class="ceq-plabel">その他</span>${common}` : ''}${custom ? `<span class="ceq-sep" aria-hidden="true"></span>${custom}` : ''}</div>` +
      (def.freeEntry ? `<div class="ceq-entry"><input class="ceq-input" data-fk="entry" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="化学式を入力" aria-label="化学式を入力（例：NaCl、NH4+）"${disabled ? ' disabled' : ''}>` +
        `<span class="ceq-preview" aria-hidden="true"></span><button type="button" class="ceq-insert" data-fk="entry-insert"${disabled ? ' disabled' : ''}>${cursor ? '挿入' : 'カードにする'}</button>` +
        `<span class="ceq-entry-msg" role="status">${esc(entryMsg)}</span></div>` : '') +
      `<details class="ceq-help"><summary data-fk="help">反応式の組み立て方</summary><div class="ceq-help-panel">` +
      `<p>物質のカードを選んでから、式の「左辺」「右辺」の欄を押すと入ります（欄を先に押しても、ドラッグしてもよい）。</p>` +
      `<p>係数は物質の前の小さな欄に書きます。1 のときは空欄のままにします。</p>` +
      `<p>式の中の物質を押すと選ばれます。× で消し、別の欄を押すとそこへ移ります。Escape で選びを取り消します。</p>` +
      (def.freeEntry ? `<p>カードにない物質は「化学式を入力」に書きます。数字はそのまま（H2O）、イオンは最後に符号を付けます（NH4+、SO42−）。</p>` : '') +
      `<p>「式を写す」「式を足す」「両辺から消す」で、下に途中の式を作れます。判定するのは、それぞれの小問の最後の式です。</p></div></details></div>` +
      `<div class="ceq-tasks">${def.tasks.map(taskHTML).join('')}</div>`;
    if (fk){ const el = ui.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el){ el.focus({preventScroll: true}); if (pos != null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch {} } }
  }

  // ---- 編集 ----
  function insert(text, at){
    const row = rowById(at.rowId); if (!row) return;
    if (row[at.side].length >= Q.LIMITS.terms) return;
    row[at.side].splice(at.index, 0, {sp: text, coef: ''});
    picked = null; cursor = null; selected = null;
    changed(row.taskId, row); render();
    const el = ui.querySelector(`[data-fk="term:${row.id}:${at.side}:${at.index}"]`); if (el) el.focus({preventScroll: true});
  }
  function move(from, to){
    const a = rowById(from.rowId), b = rowById(to.rowId); if (!a || !b) return;
    if (a !== b || from.side !== to.side){ if (b[to.side].length >= Q.LIMITS.terms) return; }
    const [t] = a[from.side].splice(from.index, 1);
    let idx = to.index; if (a === b && from.side === to.side && from.index < idx) idx--;
    b[to.side].splice(idx, 0, t);
    selected = null; cursor = null;
    changed(a.taskId, a); if (b !== a) changed(b.taskId, b);
    render();
    const el = ui.querySelector(`[data-fk="term:${b.id}:${to.side}:${idx}"]`); if (el) el.focus({preventScroll: true});
  }
  function remove(at){
    const row = rowById(at.rowId); if (!row) return;
    row[at.side].splice(at.index, 1); selected = null;
    changed(row.taskId, row); render();
    const n = row[at.side].length, el = ui.querySelector(`[data-fk="${n ? `term:${row.id}:${at.side}:${Math.min(at.index, n - 1)}` : `slot:${row.id}:${at.side}:0`}"]`); if (el) el.focus({preventScroll: true});
  }
  function addRow(taskId, lhs, rhs, origin){
    const rs = rowsOf(taskId), tail = rs[rs.length - 1];
    let pos = draft.rows.indexOf(tail) + 1;
    // 最後の行が手つかず（空で、操作で作った行でもない）なら、それと置き換える
    const replace = !tail.lhs.length && !tail.rhs.length && !tail.origin;
    if (!replace && draft.rows.length >= Q.LIMITS.rows) return null;
    if (replace){ pos--; draft.rows.splice(pos, 1); }
    const row = {id: newId(), taskId, lhs, rhs, origin};
    draft.rows.splice(pos, 0, row);
    changed(taskId); return row;
  }
  function entry(){
    const inp = ui.querySelector('.ceq-input'); if (!inp) return;
    const sp = spOf(inp.value);
    if (sp.error){ entryMsg = sp.error; render(); const i2 = ui.querySelector('.ceq-input'); if (i2){ i2.value = inp.value; i2.focus(); } return; }
    entryMsg = '';
    const exist = allCards().find(t => spOf(t).key === sp.key);
    const text = exist || sp.text;
    if (!exist){ draft.custom = [...draft.custom, text].slice(-8); changed(null); }
    if (cursor) insert(text, cursor);
    else { picked = text; render(); const c = ui.querySelector(`[data-fk="card:${CSS.escape(text)}"]`); if (c) c.focus(); }
  }

  // ---- 操作のダイアログ（式を足す・両辺から消す） ----
  function openDialog(kind, taskId, opener){
    const task = def.tasks.find(t => t.id === taskId), last = rowsOf(taskId).slice(-1)[0];
    let body;
    if (kind === 'add'){
      const rows = ordered().filter(r => r.lhs.length && r.rhs.length);
      body = `<h4>式を足す</h4><p class="ceq-dlg-note">足す式を選び、それぞれ何倍するかを決めます。結果は「${esc(task.label)}」の下に新しい式として入ります（両辺に同じ物質が残っても、自動では消しません）。</p>` +
        rows.map(r => `<div class="ceq-dlg-row"><label><input type="checkbox" data-pick="${r.id}"> ${rowLabel(r.id)}</label><span class="ceq-dlg-eq">${eqHTML(r)}</span>` +
          `<label class="ceq-mult">×<input type="text" inputmode="numeric" maxlength="2" value="1" data-mult="${r.id}" aria-label="${rowLabel(r.id)}を何倍するか"></label></div>`).join('');
    } else {
      const com = Q.commonSpecies(last, def);
      body = `<h4>両辺から消す</h4><p class="ceq-dlg-note">${rowLabel(last.id)}の両辺にある物質を選び、消す数を決めます。</p>` +
        com.map((c, i) => `<div class="ceq-dlg-row"><label><input type="radio" name="ceq-cancel" value="${esc(c.key)}" data-text="${esc(c.text)}" data-max="${esc(c.max)}"${i ? '' : ' checked'}> <span class="ceq-f">${c.html}</span>（左辺 ${esc(c.left)}、右辺 ${esc(c.right)}）</label></div>`).join('') +
        `<label class="ceq-dlg-n">消す数 <input type="text" inputmode="numeric" maxlength="3" value="${esc(com[0] ? com[0].max : '1')}" data-n aria-label="両辺から消す数"></label>`;
    }
    dialogCtx = {kind, taskId, opener};
    dlg.innerHTML = `<form method="dialog" class="ceq-dlg-form">${body}<p class="ceq-dlg-msg" role="status"></p><div class="ceq-dlg-btns"><button type="submit" value="ok" class="ceq-dlg-ok">${kind === 'add' ? '足す' : '消す'}</button><button type="submit" value="cancel">やめる</button></div></form>`;
    dlg.querySelectorAll('input[type=radio]').forEach(r => r.onchange = () => { const nIn = dlg.querySelector('[data-n]'); if (nIn) nIn.value = r.dataset.max; });
    dlg.querySelectorAll('[data-mult]').forEach(m => m.oninput = () => { const c = dlg.querySelector(`[data-pick="${m.dataset.mult}"]`); if (c) c.checked = true; });
    dlg.returnValue = '';   // 前回の「足す」「消す」が残っていると、やめたときにフォーカスを戻せない
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    const first = dlg.querySelector('input'); if (first) first.focus();
  }
  const eqHTML = r => r.lhs.map(t => termHTML(t)).join(' + ') + ' → ' + r.rhs.map(t => termHTML(t)).join(' + ');
  const termHTML = t => { const sp = spOf(t.sp); return esc(t.coef) + (sp.error ? esc(t.sp) : Q.speciesHTML(sp)); };
  function applyDialog(){
    const {kind, taskId} = dialogCtx, msg = dlg.querySelector('.ceq-dlg-msg');
    if (kind === 'add'){
      const items = [...dlg.querySelectorAll('[data-pick]')].filter(c => c.checked).map(c => ({row: rowById(c.dataset.pick), rowId: c.dataset.pick, label: rowLabel(c.dataset.pick), k: (dlg.querySelector(`[data-mult="${c.dataset.pick}"]`).value || '1').trim()}));
      const res = Q.sumRows(items, def);
      if (res.error){ msg.textContent = res.error; return false; }
      addRow(taskId, res.lhs, res.rhs, {op: 'add', items: items.map(x => ({rowId: x.rowId, k: x.k.normalize('NFKC')}))});
    } else {
      const r = dlg.querySelector('input[type=radio]:checked'), n = (dlg.querySelector('[data-n]').value || '').trim(), last = rowsOf(taskId).slice(-1)[0];
      if (!r){ msg.textContent = '消す物質を選んでください'; return false; }
      const res = Q.cancel(last, r.value, n, def);
      if (res.error){ msg.textContent = res.error; return false; }
      addRow(taskId, res.lhs, res.rhs, {op: 'cancel', rowId: last.id, sp: r.dataset.text, n: n.normalize('NFKC') === r.dataset.max ? r.dataset.max : n.normalize('NFKC')});
    }
    return true;
  }
  dlg.addEventListener('submit', e => {
    const ok = e.submitter && e.submitter.value === 'ok';
    if (ok && !applyDialog()){ e.preventDefault(); return; }
    if (ok){ render(); const ctx = dialogCtx; setTimeout(() => { const rs = rowsOf(ctx.taskId), el = ui.querySelector(`[data-fk="judge:${ctx.taskId}"]`) || ui.querySelector(`[data-row="${rs[rs.length - 1].id}"] .ceq-slot`); if (el) el.focus(); }); }
  });
  dlg.addEventListener('close', () => {
    const ctx = dialogCtx; dialogCtx = null;
    if (ctx && dlg.returnValue !== 'ok'){ const el = ui.querySelector(`[data-fk="op:${ctx.kind}:${ctx.taskId}"]`); if (el) el.focus(); }
  });

  // ---- 押す・入力する ----
  const at = el => ({rowId: el.dataset.row, side: el.dataset.side, index: +el.dataset.i});
  ui.addEventListener('click', e => {
    if (disabled) return;
    if (suppressClick){ suppressClick = false; e.preventDefault(); return; }
    const t = e.target.closest('button'); if (!t || !ui.contains(t)) return;
    if (t.dataset.card != null){
      const text = t.dataset.card;
      if (cursor) insert(text, cursor);
      else { picked = picked === text ? null : text; selected = null; render(); }
    } else if (t.classList.contains('ceq-slot')){
      const p = at(t);
      if (picked) insert(picked, p);
      else if (selected) move(selected, p);
      else { cursor = cursor && cursor.rowId === p.rowId && cursor.side === p.side && cursor.index === p.index ? null : p; render(); }
    } else if (t.classList.contains('ceq-sp')){
      const p = at(t);
      if (picked){ insert(picked, Object.assign(p, {index: p.index + 1})); return; }   // カードを選んだまま物質を押したら、その後ろに入れる
      selected = selected && selected.rowId === p.rowId && selected.side === p.side && selected.index === p.index ? null : p; cursor = null; render();
    } else if (t.dataset.del){ if (selected) remove(selected); }
    else if (t.dataset.judge){
      const taskId = t.dataset.judge, row = rowsOf(taskId).slice(-1)[0];
      if (opts.onJudge) opts.onJudge({taskId, rowId: row.id, draft: clone(draft)});
    } else if (t.dataset.op){
      const taskId = t.dataset.task, last = rowsOf(taskId).slice(-1)[0];
      if (t.dataset.op === 'copy'){ addRow(taskId, clone(last.lhs), clone(last.rhs), {op: 'copy', rowId: last.id}); render(); }
      else if (t.dataset.op === 'remove'){ const rs = rowsOf(taskId); if (rs.length > 1){ draft.rows.splice(draft.rows.indexOf(last), 1); changed(taskId); render(); } }
      else openDialog(t.dataset.op, taskId, t);
    } else if (t.classList.contains('ceq-insert')) entry();
  });
  ui.addEventListener('input', e => {
    const el = e.target;
    if (el.classList.contains('ceq-coef')){
      const row = rowById(el.dataset.row); if (!row) return;
      const term = row[el.dataset.side][+el.dataset.i]; if (!term) return;
      term.coef = el.value.slice(0, 3);
      const had = !!feedback[row.taskId];
      changed(row.taskId, row);
      if (had){ const fb = ui.querySelector(`[data-task="${row.taskId}"] .ceq-feedback`); if (fb) fb.innerHTML = ''; }
      el.classList.toggle('is-invalid', !!Q.coefficient(el.value, def).error);
    } else if (el.classList.contains('ceq-input')){
      const sp = spOf(el.value), pv = ui.querySelector('.ceq-preview');
      if (pv) pv.innerHTML = el.value.trim() && !sp.error ? Q.speciesHTML(sp) : '';
      if (entryMsg){ entryMsg = ''; const m = ui.querySelector('.ceq-entry-msg'); if (m) m.textContent = ''; }
    }
  });
  ui.addEventListener('keydown', e => {
    if (e.target.classList.contains('ceq-input') && e.key === 'Enter'){ e.preventDefault(); entry(); return; }
    if (e.target.classList.contains('ceq-coef') && e.key === 'Enter'){ e.preventDefault(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.classList.contains('ceq-sp')){ e.preventDefault(); remove(at(e.target)); return; }
    if (e.key === 'Escape'){
      const help = ui.querySelector('.ceq-help[open]');
      if (help){ help.open = false; help.querySelector('summary').focus(); e.stopPropagation(); return; }
      if (picked || cursor || selected){ picked = null; cursor = null; selected = null; render(); e.stopPropagation(); }
    }
  });
  // 欄外を押したら、挿入位置の表示を消す（計算式ビルダーと同じ）
  const outside = e => { if (cursor && !ui.contains(e.target) && !dlg.contains(e.target)){ cursor = null; render(); } };
  document.addEventListener('pointerdown', outside, true);

  // ---- ドラッグ（マウス・タッチ・ペン） ----
  ui.addEventListener('pointerdown', e => {
    if (disabled || e.button > 0) return;
    const src = e.target.closest('.ceq-card, .ceq-sp'); if (!src) return;
    drag = {src, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, ghost: null, target: null,
      text: src.dataset.card != null ? src.dataset.card : null, from: src.classList.contains('ceq-sp') ? at(src) : null};
  });
  function nearestSlot(x, y){
    const el = document.elementFromPoint(x, y); if (!el) return null;
    const slot = el.closest('.ceq-slot'); if (slot && ui.contains(slot)) return slot;
    const sideEl = el.closest('.ceq-side, .ceq-term'); const sd = sideEl && (sideEl.classList.contains('ceq-side') ? sideEl : sideEl.closest('.ceq-side'));
    if (!sd || !ui.contains(sd)) return null;
    let best = null, bd = Infinity;
    for (const s of sd.querySelectorAll('.ceq-slot')){ const r = s.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x); if (d < bd){ bd = d; best = s; } }
    return best;
  }
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on){
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.on = true; ui.classList.add('is-dragging');
      const g = document.createElement('div'); g.className = 'ceq-ghost'; g.innerHTML = drag.src.querySelector('.ceq-f') ? drag.src.querySelector('.ceq-f').innerHTML : drag.src.innerHTML;
      document.body.appendChild(g); drag.ghost = g;
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX + 8}px, ${e.clientY + 8}px)`;
    const s = nearestSlot(e.clientX, e.clientY);
    if (s !== drag.target){ if (drag.target) drag.target.classList.remove('is-dragover'); drag.target = s; if (s) s.classList.add('is-dragover'); }
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.on) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    ui.classList.remove('is-dragging'); if (d.ghost) d.ghost.remove();
    if (d.target && e.type === 'pointerup'){ const p = at(d.target); if (d.text != null) insert(d.text, p); else if (d.from) move(d.from, p); }
    else if (d.target) d.target.classList.remove('is-dragover');
  };
  document.addEventListener('pointermove', onMove, {passive: false});
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);

  render();
  return {
    getDraft: () => clone(draft),
    setDraft(d){ const s = Q.sanitizeDraft(def, d); if (s){ draft = s; feedback = {}; picked = cursor = selected = null; render(); } return !!s; },
    reset(newDef){ if (newDef) def = newDef; draft = Q.emptyDraft(def); feedback = {}; answersShown = false; picked = cursor = selected = null; entryMsg = ''; render(); },
    setFeedback(j){ if (!j || !j.taskId) return; feedback[j.taskId] = j; render(); },
    setAnswersVisible(v){ answersShown = !!v; render(); },
    setDisabled(v){ disabled = !!v; render(); },
    destroy(){
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
      try { if (dlg.open) dlg.close(); } catch {}
      ui.remove(); dlg.remove();
    }
  };
}
root.ChemEquationBuilder = {mount};
})(typeof globalThis !== 'undefined' ? globalThis : this);
