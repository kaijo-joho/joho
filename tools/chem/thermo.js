// エネルギー図エディタ（thermo.html）の画面の処理。計算は chem-energy.js、定数・ライブラリは chem-data.js。
// 開発資料は docs/thermo-design.md（設計）・docs/DEVELOPMENT.md（決定事項・更新の記録）。
(() => {
'use strict';
const E = window.ChemEnergy, D = window.ChemData;
const $ = id => document.getElementById(id);
const hasUI = typeof JohoUI !== 'undefined';
const toast = (msg, ms) => { if (hasUI) JohoUI.toast(msg, ms); else console.log(msg); };
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const KEY = {auto: 'joho.chem.thermo.auto', saves: 'joho.chem.thermo.saves', prefs: 'joho.chem.thermo.prefs',
  view: 'joho.chem.thermo.view', side: 'joho.chem.thermo.side', sideW: 'joho.chem.thermo.sideW', help: 'joho.chem.thermo.help.v1'};
// 係数の選択肢（値は分数の文字。逆向きは「逆向き」ボタンで負にする）
const COEFS = [['1', '×1'], ['2', '×2'], ['3', '×3'], ['4', '×4'], ['1/2', '×½'], ['3/2', '×3/2'], ['1/3', '×⅓'], ['1/4', '×¼']];
const EQ_COLORS = 6;   // 式ごとの色の数（CSS の --eq0〜--eq5）
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// ===================== 文書 =====================
// doc = {app, version, name, target:{text, dh}, eqs:[{id, text, dh, on, mult, rev}], scale}
// on：この式を使うか、mult：何倍か（×1・×2・×½ など。分数の文字）、rev：逆向きに使うか
// dh はいつも「ΔH」の文字で持つ（旧課程の表示では、欄に Q = −ΔH を出す）
let uid = 1;
const newEq = (text = '', dh = '') => ({id: uid++, text, dh: String(dh), on: false, mult: '1', rev: false});
// 計算に渡す係数（使わない式は 0、逆向きは負）
const coefOf = e => e.on ? (e.rev ? '-' : '') + e.mult : '0';
const blankDoc = () => ({app: 'chem-thermo', version: 1, name: '無題', target: {text: '', dh: '?'}, eqs: [newEq(), newEq()], scale: 'even'});
let doc = blankDoc();

// 読み込んだ内容を確かめて、足りないところを補う（ファイルやブラウザの保存から読むとき）
function sanitize(o){
  if (!o || typeof o !== 'object' || o.app !== 'chem-thermo') throw new Error('エネルギー図エディタのファイルではありません');
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const okMult = c => { const f = E.Frac.parse(str(c, 12)); return f && f.sign > 0 && +f <= 20 ? f.toString() : '1'; };
  const t = o.target && typeof o.target === 'object' ? o.target : {};
  const d = {app: 'chem-thermo', version: 1, name: str(o.name, 60).trim() || '無題', target: {text: str(t.text, 300), dh: str(t.dh, 30)},
    eqs: [], scale: o.scale === 'prop' ? 'prop' : 'even'};
  for (const e of (Array.isArray(o.eqs) ? o.eqs : []).slice(0, 20)) if (e && typeof e === 'object') {
    const item = {id: uid++, text: str(e.text, 300), dh: str(e.dh, 30), on: false, mult: '1', rev: false};
    if (typeof e.coef === 'string'){   // 0.1 の保存（係数を 1 つの文字で持っていた）を読み替える
      const f = E.Frac.parse(str(e.coef, 12));
      if (f && !f.isZero && +f.abs() <= 20){ item.on = true; item.mult = f.abs().toString(); item.rev = f.sign < 0; }
    } else { item.on = e.on === true; item.mult = okMult(e.mult); item.rev = e.rev === true; }
    d.eqs.push(item);
  }
  if (!d.eqs.length) d.eqs.push(newEq());
  return d;
}
// 保存する中身（id は保存しない）
const content = d => ({app: d.app, version: d.version, name: d.name, target: {text: d.target.text, dh: d.target.dh},
  eqs: d.eqs.map(e => ({text: e.text, dh: e.dh, on: e.on, mult: e.mult, rev: e.rev})), scale: d.scale});
const contentJSON = d => JSON.stringify(content(d));

// ===================== 元に戻す・やり直し =====================
const hist = {undo: [], redo: []};
let typing = null;   // 文字を打っている欄（打ち続けている間は 1 回の変更にまとめる）
function commit(){
  hist.undo.push(contentJSON(doc)); if (hist.undo.length > 200) hist.undo.shift();
  hist.redo.length = 0; syncUndo();
}
function undo(){ if (!hist.undo.length) return; hist.redo.push(contentJSON(doc)); doc = sanitize(JSON.parse(hist.undo.pop())); typing = null; renderAll(); changed(); }
function redo(){ if (!hist.redo.length) return; hist.undo.push(contentJSON(doc)); doc = sanitize(JSON.parse(hist.redo.pop())); typing = null; renderAll(); changed(); }
function syncUndo(){ $('btnUndo').disabled = !hist.undo.length; $('btnRedo').disabled = !hist.redo.length; }

// ===================== 設定（文書とは別にブラウザへ覚える） =====================
const prefs = Object.assign({old: false, answer: false}, lsGet(KEY.prefs) || {});
function setPref(k, v){ prefs[k] = v; lsSet(KEY.prefs, prefs); syncPrefs(); renderAll(); }
function syncPrefs(){
  $('optOld').checked = prefs.old; $('optAnswer').checked = prefs.answer;
  $('btnAnswer').hidden = !prefs.answer;
}

// ===================== 左：式の欄 =====================
const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const negStr = s => { s = String(s).trim(); if (!/^[+-]?\d+(\.\d+)?$/.test(E.normalize(s))) return s; s = E.normalize(s); return s.startsWith('-') ? s.slice(1) : '-' + s.replace(/^\+/, ''); };
const dhShown = s => prefs.old ? negStr(s) : s;       // 欄に出す値（旧課程は Q）
const dhStored = s => prefs.old ? negStr(s) : s;      // 欄の値から ΔH へ

function buildCard(kind, i){
  const isT = kind === 'target';
  const d = isT ? doc.target : doc.eqs[i];
  const card = el('div', 'card' + (isT ? ' target' : ''));
  card.dataset.kind = kind; if (!isT){ card.dataset.i = i; card.style.setProperty('--c', 'var(--eq' + (i % EQ_COLORS) + ')'); }
  const head = el('div', 'card-head');
  const no = el('span', 'eq-no'); no.textContent = isT ? '目的' : '(' + (i + 1) + ')';
  head.append(no, el('span', 'grow'));
  const del = el('button', 'card-del', {title: isT ? '目的の式を消す' : 'この式を消す', 'aria-label': isT ? '目的の式を消す' : '式 ' + (i + 1) + ' を消す'});
  del.textContent = '×';
  del.onclick = () => {
    commit();
    if (isT) doc.target = {text: '', dh: '?'};
    else { doc.eqs.splice(i, 1); if (!doc.eqs.length) doc.eqs.push(newEq()); }
    renderAll(); changed();
  };
  head.append(del);
  const txt = el('input', 'eq-text', {type: 'text', spellcheck: 'false', autocomplete: 'off',
    placeholder: isT ? 'C(黒鉛) + 1/2O2(気) -> CO(気)' : 'C(黒鉛) + O2(気) -> CO2(気)', 'aria-label': isT ? '目的の式' : '式 ' + (i + 1)});
  txt.value = d.text;
  const row = el('div', 'eq-row');
  const lbl = el('span', 'lbl'); lbl.textContent = prefs.old ? 'Q =' : 'ΔH =';
  const dh = el('input', 'eq-dh', {type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off',
    placeholder: isT ? '?' : (prefs.old ? '393.5' : '-393.5'), title: prefs.old ? '発熱量 Q（kJ）。発熱は正、吸熱は負。求める値は ?' : 'ΔH（kJ）。発熱は負、吸熱は正。求める値は ?',
    'aria-label': (isT ? '目的の式' : '式 ' + (i + 1)) + 'の ' + (prefs.old ? 'Q' : 'ΔH')});
  dh.value = dhShown(d.dh);
  const unit = el('span', 'lbl'); unit.textContent = 'kJ';
  row.append(lbl, dh, unit);
  if (!isT){
    const use = el('button', 'use' + (d.on ? ' on' : ''), {title: 'この式を組み立てに使う／使わない', 'aria-pressed': String(d.on)});
    use.textContent = d.on ? '使う' : '使わない';
    const ctl = el('span', 'ctl' + (d.on ? '' : ' off'));
    const sel = el('select', '', {title: 'この式を何倍して使うか（×1・×2・×½ など）', 'aria-label': '式 ' + (i + 1) + ' の倍率'});
    const opts = COEFS.slice();
    if (!opts.some(o => o[0] === d.mult)) opts.push([d.mult, '×' + E.fracText(E.Frac.parse(d.mult) || E.ONE)]);
    for (const [v, t] of opts){ const o = el('option'); o.value = v; o.textContent = t; sel.append(o); }
    sel.value = d.mult;
    const rev = el('button', 'rev' + (d.rev ? ' on' : ''), {title: '式を逆向きに使う（左辺と右辺を入れかえ、ΔH の符号を変える）', 'aria-pressed': String(d.rev)});
    rev.textContent = '逆向き';
    // 倍率や向きをさわったら、その式を使う状態にする（使わない状態のまま選んでも、値は覚えている）
    use.onclick = () => { commit(); d.on = !d.on; renderList(); changed(); };
    sel.onchange = () => { if (sel.value === d.mult && d.on) return; commit(); d.mult = sel.value; d.on = true; renderList(); changed(); };
    rev.onclick = () => { commit(); d.rev = !d.rev; d.on = true; renderList(); changed(); };
    ctl.append(sel, rev);
    const sp = el('span', 'grow'); sp.style.flex = '1';
    row.append(sp, use, ctl);
  }
  const prev = el('div', 'eq-prev');
  const msg = el('div', 'eq-msg');
  card.append(head, txt, row, prev, msg);
  // 入力：打っている間は 1 回の変更にまとめる
  const onInput = (field, get) => () => {
    const k = kind + ':' + (isT ? '' : d.id) + ':' + field;
    if (typing !== k){ commit(); typing = k; }
    get(); changed();
  };
  txt.addEventListener('input', onInput('text', () => { d.text = txt.value; }));
  dh.addEventListener('input', onInput('dh', () => { d.dh = dhStored(dh.value); }));
  // 式の中に ΔH を書いたときは、欄を離れたときに ΔH の欄へ移す
  txt.addEventListener('change', () => {
    typing = null;
    const m = E.normalize(txt.value).match(/(?:^|[\s,;、])(?:Δ|⊿|[dD])H\s*=?\s*(.*)$/);
    if (m){ d.dh = E.normalize(m[1]).replace(/\s*kJ(\/mol)?$/i, ''); d.text = E.normalize(txt.value).slice(0, m.index).replace(/[\s,;、]+$/, ''); txt.value = d.text; dh.value = dhShown(d.dh); changed(); }
  });
  dh.addEventListener('change', () => { typing = null; });
  txt.addEventListener('focus', () => { lastField = txt; });
  card.addEventListener('mouseenter', () => hlArrow(isT ? 'target' : i, true));
  card.addEventListener('mouseleave', () => hlArrow(isT ? 'target' : i, false));
  return card;
}
let lastField = null;
function renderList(){
  const t = $('targetCard'); t.replaceChildren(buildCard('target'));
  const list = $('eqList'); list.replaceChildren(...doc.eqs.map((e, i) => buildCard('eq', i)));
}
function renderAll(){ renderList(); refresh(); syncUndo(); syncView(); $('docName').textContent = doc.name; document.title = doc.name + ' – エネルギー図エディタ'; }

// 記号を入れるボタン：最後にさわった式の欄のカーソルの位置へ
$('tools').addEventListener('mousedown', e => { if (e.target.closest('[data-ins]')) e.preventDefault(); });   // 欄のフォーカスを外さない
$('tools').addEventListener('click', e => {
  const b = e.target.closest('[data-ins]'); if (!b) return;
  const f = lastField && document.body.contains(lastField) ? lastField : document.querySelector('#targetCard .eq-text');
  const s = f.selectionStart ?? f.value.length, en = f.selectionEnd ?? f.value.length;
  f.value = f.value.slice(0, s) + b.dataset.ins + f.value.slice(en);
  f.focus(); f.setSelectionRange(s + b.dataset.ins.length, s + b.dataset.ins.length);
  f.dispatchEvent(new Event('input', {bubbles: true}));
});
// 物質のボタン：よく使う物質と、いま書いてある式に出てくる物質（打ちにくい形を選んで入れられる）
const FIXED_SPECIES = ['C(黒鉛)', 'H2(気)', 'O2(気)', 'N2(気)', 'CO2(気)', 'H2O(液)', 'H2O(気)'];
function speciesText(sp){
  if (sp.kind === 'e') return 'e-';
  if (sp.kind !== 'species') return '';
  const n = Math.abs(sp.charge);
  const charge = sp.charge ? (n > 1 ? n : '') + (sp.charge > 0 ? '+' : '-') : '';
  return sp.formula + charge + (sp.state ? '(' + sp.state + ')' : '');
}
let speciesKey = '';
function drawSpeciesButtons(r){
  const texts = [...FIXED_SPECIES];
  for (const sp of r.species.values()){ const t = speciesText(sp); if (t && !texts.includes(t)) texts.push(t); }
  const key = texts.join('|');
  if (key === speciesKey) return;
  speciesKey = key;
  const box = $('insSpecies'); box.replaceChildren();
  texts.slice(0, 24).forEach((t, i) => {
    const b = el('button', i >= FIXED_SPECIES.length ? 'dyn' : '', {'data-ins': t, title: t + ' を入れる' + (i >= FIXED_SPECIES.length ? '（いま書いてある式に出てくる物質）' : '')});
    try { b.innerHTML = E.segsToHTML(E.speciesSegs(E.parseTerm(t).sp)); } catch { b.textContent = t; }
    box.append(b);
  });
}

// 式を足す：自分で入力するか、ライブラリから選ぶか
let fillTarget = 0;   // ライブラリから選ぶために足した空の式（次に選んだ式がここへ入る）
$('btnAdd').onclick = () => $('dlgAdd').showModal();
$('addFree').onclick = () => {
  $('dlgAdd').close();
  commit(); doc.eqs.push(newEq()); renderAll(); changed();
  const inp = [...document.querySelectorAll('#eqList .eq-text')].pop(); inp && inp.focus();
};
$('addLib').onclick = () => {
  $('dlgAdd').close();
  commit(); const e = newEq(); doc.eqs.push(e); fillTarget = e.id; renderAll(); changed();
  if (openPane !== 'lib') openSide('lib'); else $('libSearch').focus();
  if (narrow()) openTools(false);
  toast('右のライブラリで、入れたい式の「追加」を押します', 3500);
};

// ===================== 計算して表示を更新 =====================
const okEq = p => p && !p.empty && !p.errors.length;
// 小数の桁：入力された ΔH の文字の桁に合わせる（-283.0 なら 1 桁）
function digitsOf(strs){
  let d = 0;
  for (const s of strs){ const m = E.normalize(s || '').match(/\.(\d+)/); if (m) d = Math.max(d, Math.min(2, m[1].length)); }
  return d;
}
function compute(){
  const T = doc.target.text.trim() ? E.parseEquation(doc.target.text, doc.target.dh) : null;
  const eqs = doc.eqs.map(e => e.text.trim() ? E.parseEquation(e.text, e.dh) : null);
  const coefs = doc.eqs.map((e, i) => okEq(eqs[i]) ? (E.Frac.parse(coefOf(e)) || E.ZERO) : E.ZERO);
  const species = E.collectSpecies([T, ...eqs].filter(okEq));
  const digits = digitsOf([doc.target.dh, ...doc.eqs.map(e => e.dh)]);
  const r = {T, eqs, coefs, species, digits, path: null, heights: null, groups: [], mode: 'empty'};
  const opt = {old: prefs.old, digits, targetLabel: '目的'};
  if (okEq(T)){
    const used = coefs.some(c => !c.isZero);
    if (!used && typeof T.dh === 'number'){
      r.mode = 'single';
      r.groups = [E.groupFromEquation(T, '目的', species, Object.assign({kind: 'target'}, opt))];
    } else {
      r.path = E.buildPath(T, eqs.map(p => okEq(p) ? p : null), coefs);
      r.heights = E.levelHeights(r.path, T, eqs);
      r.groups = [E.groupFromPath(r.path, r.heights, T, eqs, species, opt)];
      r.mode = r.path.matched ? 'matched' : used ? 'building' : 'start';
    }
  } else if (!T){
    r.groups = eqs.map((p, i) => okEq(p) ? E.groupFromEquation(p, '(' + (i + 1) + ')', species, Object.assign({eqIndex: i}, opt)) : null).filter(Boolean);
    r.mode = r.groups.length ? 'free' : 'empty';
  } else r.mode = 'badTarget';
  return r;
}
let last = null;
function refresh(){
  const r = last = compute();
  const solved = r.heights && r.heights.solved;
  // 式の欄：表示・エラー・求めた値
  const show = (card, p, extra) => {
    const prev = card.querySelector('.eq-prev'), msg = card.querySelector('.eq-msg');
    card.classList.toggle('bad', !!(p && p.errors.length));
    prev.innerHTML = okEq(p) ? E.segsToHTML(E.equationSegs(p, {old: prefs.old, digits: r.digits})) : '';
    const lines = [];
    if (p) for (const m of p.errors) lines.push('<div class="eq-msg err">' + E.esc(m) + '</div>');
    if (p) for (const m of p.warnings) lines.push('<div class="eq-msg warn">' + E.esc(m) + '</div>');
    if (extra) lines.push(extra);
    msg.innerHTML = lines.join('');
  };
  // 自分で入力した式の ΔH が空のとき、生成エンタルピーの表から計算した値を候補として見せる（押したときだけ入れる）
  const suggest = (p, who, allow) => {
    if (!allow || !okEq(p)) return '';
    const v = D.suggestDH(p); if (v == null) return '';
    const shown = prefs.old ? 'Q = ' + E.numText(-v, 1) : 'ΔH = ' + E.numText(v, 1);
    return '<div class="eq-msg hint">表の値から：' + shown + ' kJ <button class="sbtn mini" data-fill="' + who + '" data-v="' + v + '" title="この値を ΔH の欄に入れる">入れる</button></div>';
  };
  const tCard = document.querySelector('#targetCard .card');
  let tExtra = '';
  if (!(solved && solved.kind === 'target')) tExtra = suggest(r.T, 'target', prefs.answer && (doc.target.dh === '?' || doc.target.dh === ''));   // 目的の式は答えになるので、「答えを見る」を出す設定のときだけ
  if (solved && solved.kind === 'target') tExtra = '<div class="eq-msg solved">' + (prefs.old ? 'Q = ' + E.numText(-solved.value, r.digits) : 'ΔH = ' + E.numText(solved.value, r.digits)) + ' kJ（組み立てて求めた値）</div>';
  if (tCard) show(tCard, r.T, tExtra);
  document.querySelectorAll('#eqList .card').forEach(card => {
    const i = +card.dataset.i, p = r.eqs[i];
    let extra = '';
    if (solved && solved.kind === 'eq' && solved.eq === i) extra = '<div class="eq-msg solved">' + (prefs.old ? 'Q = ' + E.numText(-solved.value, r.digits) : 'ΔH = ' + E.numText(solved.value, r.digits)) + ' kJ（目的の式から求めた値）</div>';
    const c = E.Frac.parse(coefOf(doc.eqs[i])) || E.ZERO;
    if (p && p.errors.length && !c.isZero) extra += '<div class="eq-msg err">直すまで、この式は図に使いません</div>';
    extra += suggest(p, i, doc.eqs[i].dh.trim() === '');
    card.classList.toggle('unused', c.isZero);
    show(card, p, extra);
  });
  drawDiagram(r);
  drawStatus(r);
  drawCalc(r);
  drawHint(r);
  drawSpeciesButtons(r);
  if (openPane === 'exp') drawExportPreview();
}

// 画面の配色から図の色を読む
function themeColors(){
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return {ink: v('--ink'), muted: v('--muted'), target: v('--arrow-target'), step: v('--arrow-step'), spect: v('--spect'),
    eqs: Array.from({length: EQ_COLORS}, (_, i) => v('--eq' + i))};
}
function drawDiagram(r){
  const box = $('dia');
  if (!r.groups.length){
    box.innerHTML = '<div class="empty">' + (r.mode === 'badTarget'
      ? '目的の式に直すところがあります。左の赤い字を見てください。'
      : '左の欄に式を入れると、ここにエネルギー図が出ます。<br>はじめての人は <button class="sbtn primary" id="btnEx">例題を開く</button>') + '</div>';
    const b = $('btnEx'); if (b) b.onclick = () => openSide('lib');
    return;
  }
  box.innerHTML = E.diagramSVG(r.groups, {scale: doc.scale, old: prefs.old, colors: themeColors()}).svg;
  const svg = box.querySelector('svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'エネルギー図');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  fitSVG();
}
// 図を画面いっぱいに（文字が大きくなりすぎないよう 1.6 倍まで。小さくなりすぎないよう 0.7 倍までで、あふれたらスクロール）
function fitSVG(){
  const box = $('dia'), svg = box.querySelector('svg'); if (!svg) return;
  const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
  const cw = box.clientWidth - 28, ch = box.clientHeight - 52;
  const k = Math.max(0.7, Math.min(1.6, cw / w, ch / h));
  svg.style.width = Math.floor(w * k) + 'px'; svg.style.height = Math.floor(h * k) + 'px';
}

// 左の欄：立式の状況（目的の式になったか。まだ残っている物質）
function sideText(v){ const a = v.abs(); return (v.sign > 0 ? '右辺に ' : '左辺に ') + (a.eq(1) ? '1' : E.fracText(a)); }
function drawStatus(r){
  const box = $('buildStatus');
  let cls = '', h = '';
  if (r.mode === 'matched'){ cls = 'ok'; h = '<b>✓ 目的の式になりました</b>'; }
  else if (r.mode === 'building'){
    cls = 'no'; h = '<b>まだ目的の式ではありません</b>';
    const tvec = E.vectorOf(r.T), items = [];
    for (const [k] of r.path.residual){
      const sp = r.species.get(k); if (!sp) continue;
      const name = E.segsToHTML(E.speciesSegs(sp));
      const s = r.path.sum.get(k) || E.ZERO, t = tvec.get(k) || E.ZERO;
      if (t.isZero) items.push(name + ' が' + (s.sign > 0 ? '右辺' : '左辺') + 'に残っています（' + E.esc(s.abs().eq(1) ? '1' : E.fracText(s.abs())) + '）');
      else items.push(name + '：目的の式は' + sideText(t) + '、いまは' + (s.isZero ? 'なし' : sideText(s)));
    }
    h += items.slice(0, 5).map(x => '<div>' + x + '</div>').join('') + (items.length > 5 ? '<div>ほか ' + (items.length - 5) + ' 件</div>' : '');
  } else if (r.mode === 'start' || r.mode === 'single'){
    cls = 'idle'; h = '与えられた式の［使わない］を押して「使う」にし、倍率（×2 など）と「逆向き」を選びます。';
  }
  box.className = 'build-status ' + cls; box.hidden = !h; box.innerHTML = h;
}

// 下の欄：式の足し引きと計算
function drawCalc(r){
  const box = $('calc');
  if (!r.path || !r.path.steps.length){ box.innerHTML = ''; return; }
  const ov = r.heights.overrides;
  const result = r.path.matched ? r.heights.targetDH : null;
  const c = E.calcText(r.path.steps, r.eqs, result, {digits: r.digits, old: prefs.old, overrides: ov});
  box.innerHTML = '<span class="combo">' + E.esc(c.combo) + '</span><span>' + E.esc(c.expr.replace(/ = ([^=]*kJ)$/, '')) +
    (result != null ? ' = <span class="res">' + E.esc(c.expr.match(/ = ([^=]*kJ)$/)[1]) + '</span>' : '') + '</span>';
}

const HINTS = {
  empty: '左の「目的の式」に求めたい反応を、「与えられた式」に問題の式と ΔH を入れます',
  free: '目的の式を入れると、与えられた式を組み立ててヘスの法則を使えます',
  single: '与えられた式を「使う」にすると、目的の式を回り道で組み立てられます',
  start: '与えられた式を「使う」にして、倍率（×2 など）と「逆向き」を選び、目的の式を組み立てます',
  building: 'まだ目的の式になっていません。左の「残っている物質」を消すには、どの式をどう使うか考えます',
  matched: '目的の式ができました。図の回り道（式ごとの色）とまっすぐの道（青・太い線）の ΔH が等しいことを確かめましょう',
  badTarget: '目的の式の赤い字を見て、式を直します',
};
function drawHint(r){ $('hint').textContent = HINTS[r.mode] || ''; }

// 図の矢印と左の式を対応させる
function hlArrow(k, on){
  const sel = k === 'target' ? '#dia .arrow[data-kind="target"]' : '#dia .arrow[data-eq="' + k + '"]';
  document.querySelectorAll(sel).forEach(a => a.classList.toggle('hl', on));
}
$('dia').addEventListener('mouseover', e => {
  const a = e.target.closest('.arrow'); document.querySelectorAll('.card.hl').forEach(c => c.classList.remove('hl'));
  if (!a) return;
  const card = a.dataset.kind === 'target' ? document.querySelector('#targetCard .card') : document.querySelector('#eqList .card[data-i="' + a.dataset.eq + '"]');
  if (card) card.classList.add('hl');
});
$('dia').addEventListener('mouseleave', () => document.querySelectorAll('.card.hl').forEach(c => c.classList.remove('hl')));
$('dia').addEventListener('click', e => {
  const a = e.target.closest('.arrow'); if (!a) return;
  const card = a.dataset.kind === 'target' ? document.querySelector('#targetCard .card') : document.querySelector('#eqList .card[data-i="' + a.dataset.eq + '"]');
  if (!card) return;
  if (narrow()) openTools(true);
  card.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  card.querySelector('.eq-text').focus({preventScroll: true});
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-fill]'); if (!b) return;
  commit();
  const v = String(b.dataset.v);
  if (b.dataset.fill === 'target') doc.target.dh = v; else doc.eqs[+b.dataset.fill].dh = v;
  renderAll(); changed(); toast('ΔH の欄に入れました');
});

// ===================== 組み立ての補助 =====================
$('btnClearCoef').onclick = () => {
  if (doc.eqs.every(e => !e.on)) return toast('使う式はありません');
  commit(); doc.eqs.forEach(e => { e.on = false; }); renderAll(); changed(); toast('すべての式を「使わない」にしました');
};
$('btnAnswer').onclick = () => {
  const r = compute();
  if (!okEq(r.T)) return toast('先に目的の式を入れます');
  const idx = r.eqs.map((p, i) => okEq(p) ? i : -1).filter(i => i >= 0);
  if (!idx.length) return toast('与えられた式がありません');
  const res = E.solveCombination(E.vectorOf(r.T), idx.map(i => E.vectorOf(r.eqs[i])));
  if (!res.ok){
    const miss = (res.missing || []).map(k => E.segsToHTML(E.speciesSegs(r.species.get(k) || {kind: 'aq'})).replace(/<[^>]+>/g, ''));
    return toast(miss.length ? miss.join('、') + ' がどの与えられた式にも出てこないので、目的の式を作れません' : 'この式の組み合わせでは、目的の式を作れません', 4500);
  }
  commit();
  doc.eqs.forEach(e => { e.on = false; });
  idx.forEach((i, k) => { const c = res.coefs[k]; if (!c.isZero){ Object.assign(doc.eqs[i], {on: true, mult: c.abs().toString(), rev: c.sign < 0}); } });
  renderAll(); changed(); toast('係数を入れて、図を完成させました');
};

// ===================== 表示（段の高さ） =====================
function syncView(){
  document.querySelectorAll('#scaleSeg [data-scale]').forEach(b => b.classList.toggle('on', b.dataset.scale === doc.scale));
  $('viewName').textContent = doc.scale === 'prop' ? 'ΔH に比例' : '等間隔';
}
$('scaleSeg').onclick = e => {
  const b = e.target.closest('[data-scale]'); if (!b || b.dataset.scale === doc.scale) return;
  commit(); doc.scale = b.dataset.scale; syncView(); changed();
};

// ===================== 保存 =====================
// save.mark：最後に明示的に保存したときの中身。いまの中身と違えば「保存していない変更あり」
const save = {mark: '', where: '', time: 0, fileHandle: null, autoFile: false, fileTimer: 0, autoTimer: 0};
function changed(){
  refresh(); syncUndo();
  clearTimeout(save.autoTimer); save.autoTimer = setTimeout(autoSave, 300);
  if (save.autoFile){ clearTimeout(save.fileTimer); save.fileTimer = setTimeout(() => writeFile(save.fileHandle, true), 1200); }
  syncSaveStatus();
}
function autoSave(){
  const ok = lsSet(KEY.auto, {doc: content(doc), time: Date.now(), mark: save.mark, where: save.where, savedAt: save.time});
  if (!ok) $('saveStatus').classList.add('warn');
  syncSaveStatus(ok);
}
const dirty = () => contentJSON(doc) !== save.mark;
const timeText = t => { const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
function syncSaveStatus(okAuto = true){
  const s = $('saveStatus');
  s.classList.toggle('warn', !okAuto);
  if (!okAuto){ s.textContent = 'ブラウザに自動保存できません（保存の容量・設定を確かめます）'; return; }
  if (save.autoFile) s.textContent = 'ファイル「' + save.fileHandle.name + '」に自動保存中';
  else if (!dirty() && save.time) s.textContent = (save.where || '保存') + '済み（' + timeText(save.time) + '）';
  else s.textContent = '自動保存済み・' + (save.time ? '保存後に変更あり' : 'まだ保存していません');
}
function markSaved(where){ save.mark = contentJSON(doc); save.where = where; save.time = Date.now(); autoSave(); syncSaveStatus(); }

function saveBrowser(){
  const list = lsGet(KEY.saves) || [];
  const i = list.findIndex(x => x.name === doc.name);
  const item = {name: doc.name, time: Date.now(), doc: content(doc)};
  if (i >= 0) list.splice(i, 1);
  list.unshift(item);
  if (list.length > 30) list.length = 30;
  if (!lsSet(KEY.saves, list)) return toast('ブラウザに保存できませんでした（容量がいっぱいかもしれません）', 4000);
  markSaved('ブラウザに保存');
  toast('ブラウザに「' + doc.name + '」を保存しました');
}
const fileName = () => (doc.name || 'エネルギー図').replace(/[\\/:*?"<>|]/g, '_') + '.json';
async function writeFile(h, quiet){
  try {
    const w = await h.createWritable(); await w.write(JSON.stringify(content(doc), null, 1)); await w.close();
    save.fileHandle = h; markSaved('ファイルに保存');
    if (!quiet) toast('ファイル「' + h.name + '」に保存しました');
    return true;
  } catch (e){
    if (save.autoFile){ save.autoFile = false; syncAutoItem(); }
    toast('ファイルに保存できませんでした：' + e.message, 4500); return false;
  }
}
async function pickSaveFile(){
  return showSaveFilePicker({suggestedName: fileName(), types: [{description: 'エネルギー図（JSON）', accept: {'application/json': ['.json']}}]});
}
async function saveFile(){
  if (window.showSaveFilePicker){
    try { await writeFile(await pickSaveFile()); } catch (e){ if (e.name !== 'AbortError') toast('保存できませんでした：' + e.message); }
  } else {
    download(new Blob([JSON.stringify(content(doc), null, 1)], {type: 'application/json'}), fileName());
    markSaved('ファイルに保存'); toast('ダウンロードのフォルダに保存しました');
  }
}
function saveMain(){ if (save.fileHandle) writeFile(save.fileHandle); else saveBrowser(); }
function download(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function toggleAutoFile(){
  if (save.autoFile){ save.autoFile = false; syncAutoItem(); syncSaveStatus(); return toast('ファイルへの自動保存を止めました'); }
  if (!window.showSaveFilePicker) return toast('このブラウザでは、ファイルへの自動保存は使えません（Chrome で使えます）', 4000);
  try {
    const h = await pickSaveFile();
    if (await writeFile(h, true)){ save.autoFile = true; syncAutoItem(); syncSaveStatus(); toast('ファイル「' + h.name + '」への自動保存を始めました'); }
  } catch (e){ if (e.name !== 'AbortError') toast('始められませんでした：' + e.message); }
}
function syncAutoItem(){
  $('miAutoLabel').textContent = save.autoFile ? 'ファイルへの自動保存を停止' : 'ファイルへの自動保存を開始…';
  $('icAutoStart').hidden = save.autoFile; $('icAutoStop').hidden = !save.autoFile;
}

// 読み込み・新規作成：保存していない変更があるときは、どうするか尋ねる
function confirmDialog(title, text, buttons){
  return new Promise(res => {
    const dlg = $('dlgConfirm');
    $('cfTitle').textContent = title; $('cfText').textContent = text;
    const row = $('cfRow'); row.replaceChildren();
    for (const [label, val, primary] of buttons){
      const b = el('button', 'sbtn' + (primary ? ' primary' : '')); b.textContent = label;
      b.onclick = () => { dlg.close(); res(val); }; row.append(b);
    }
    dlg.onclose = () => res(null);
    dlg.showModal();
  });
}
async function okToReplace(){
  if (!dirty() || isBlank(doc)) return true;
  const v = await confirmDialog('保存していない変更があります', '「' + doc.name + '」を保存してから切り替えますか。',
    [['やめる', null], ['保存しない', 'drop'], ['ブラウザに保存する', 'save', true]]);
  if (v === 'save'){ saveBrowser(); return true; }
  return v === 'drop';
}
const isBlank = d => !d.target.text.trim() && d.eqs.every(e => !e.text.trim());
function loadDoc(d, where){
  commit();
  doc = d; save.fileHandle = null; save.autoFile = false; syncAutoItem();
  renderAll(); markSaved(where);
}
async function newDoc(){
  if (!await okToReplace()) return;
  commit(); doc = blankDoc(); save.fileHandle = null; save.autoFile = false; save.time = 0; save.where = '';
  syncAutoItem(); renderAll(); save.mark = contentJSON(doc); changed();
  document.querySelector('#targetCard .eq-text').focus();
}
async function openFile(){
  if (!await okToReplace()) return;
  try {
    let text, handle = null;
    if (window.showOpenFilePicker){
      [handle] = await showOpenFilePicker({types: [{description: 'エネルギー図（JSON）', accept: {'application/json': ['.json']}}]});
      text = await (await handle.getFile()).text();
    } else {
      text = await new Promise((res, rej) => {
        const inp = el('input', '', {type: 'file', accept: '.json,application/json'});
        inp.onchange = () => inp.files[0] ? inp.files[0].text().then(res, rej) : rej(Object.assign(new Error(''), {name: 'AbortError'}));
        inp.click();
      });
    }
    const d = sanitize(JSON.parse(text));
    loadDoc(d, 'ファイルから開いた');
    if (handle && handle.createWritable) save.fileHandle = handle;
    toast('「' + doc.name + '」を開きました');
  } catch (e){
    if (e.name !== 'AbortError') toast('開けませんでした：' + (e instanceof SyntaxError ? 'ファイルの形式が違います' : e.message), 4500);
  }
}
function openSavedDialog(){
  const list = lsGet(KEY.saves) || [];
  const auto = lsGet(KEY.auto);
  const box = $('openList'); box.replaceChildren();
  const row = (title, sub, onOpen, onDel) => {
    const c = el('div', 'cand'); const d = el('div');
    const b = el('b'); b.textContent = title; const s = el('span'); s.textContent = sub; d.append(b, s);
    const ob = el('button', 'sbtn primary'); ob.textContent = '開く'; ob.onclick = onOpen;
    c.append(d, ob);
    if (onDel){ const db = el('button', 'sbtn'); db.textContent = '消す'; db.title = 'ブラウザから消す'; db.onclick = onDel; c.append(db); }
    box.append(c);
  };
  const fmt = t => new Date(t).toLocaleString('ja-JP', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
  if (auto && auto.doc) row('自動保存：' + (auto.doc.name || '無題'), fmt(auto.time) + '（最後に開いていた内容）', async () => {
    $('dlgOpen').close(); if (!await okToReplace()) return; try { loadDoc(sanitize(auto.doc), '自動保存から開いた'); } catch (e){ toast(e.message); }
  });
  list.forEach((it, i) => row(it.name, fmt(it.time), async () => {
    $('dlgOpen').close(); if (!await okToReplace()) return;
    try { loadDoc(sanitize(it.doc), 'ブラウザに保存'); toast('「' + it.name + '」を開きました'); } catch (e){ toast(e.message); }
  }, async () => {
    const v = await confirmDialog('ブラウザから消す', '「' + it.name + '」を消します。元に戻せません。', [['やめる', null], ['消す', 'del', true]]);
    if (v === 'del'){ const l = lsGet(KEY.saves) || []; l.splice(i, 1); lsSet(KEY.saves, l); }
    openSavedDialog();
  }));
  if (!list.length && !(auto && auto.doc)){ const p = el('p'); p.textContent = 'ブラウザに保存した内容はまだありません。'; box.append(p); }
  if (!$('dlgOpen').open) $('dlgOpen').showModal();
}
async function rename(){
  $('nameInput').value = doc.name;
  $('dlgName').showModal(); $('nameInput').select();
}
$('nameOk').onclick = () => {
  const v = $('nameInput').value.trim().slice(0, 60);
  $('dlgName').close();
  if (!v || v === doc.name) return;
  commit(); doc.name = v; renderAll(); changed();
};
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); $('nameOk').click(); } });
document.querySelectorAll('dialog [data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });

$('miNew').onclick = newDoc; $('miRename').onclick = rename; $('docName').onclick = rename;
$('miSave').onclick = saveMain; $('miSaveBrowser').onclick = saveBrowser; $('miSaveFile').onclick = saveFile;
$('miOpenSaved').onclick = openSavedDialog; $('miOpen').onclick = openFile; $('miAuto').onclick = toggleAutoFile;
$('saveStatus').onclick = openSavedDialog;
$('kbSave').textContent = isMac ? '⌘S' : 'Ctrl+S'; $('kbOpen').textContent = isMac ? '⌘O' : 'Ctrl+O';
$('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
if (!isMac){ $('btnUndo').title = '元に戻す (Ctrl+Z)'; $('btnRedo').title = 'やり直し (Ctrl+Shift+Z)'; }
// メニューの項目を押したら、いったん閉じる（ホバーで開いたままにしない）
document.querySelectorAll('.hmenu').forEach(m => {
  m.addEventListener('click', e => { if (e.target.closest('.mi')){ m.classList.add('closed'); document.activeElement && document.activeElement.blur(); } });
  m.addEventListener('mouseleave', () => m.classList.remove('closed'));
});

// ===================== 右のパネル（ライブラリ・書き出し） =====================
let openPane = '';
function openSide(p){
  openPane = openPane === p ? '' : p;
  $('sidePanel').classList.toggle('open', !!openPane);
  $('paneLib').hidden = openPane !== 'lib'; $('paneExp').hidden = openPane !== 'exp';
  document.querySelectorAll('.side-tab').forEach(t => { t.classList.toggle('on', t.dataset.pane === openPane); t.setAttribute('aria-selected', String(t.dataset.pane === openPane)); });
  try { localStorage.setItem(KEY.side, openPane); } catch {}
  if (openPane === 'lib') renderLib();
  if (openPane === 'exp') drawExportPreview();
  requestAnimationFrame(fitSVG);
}
document.querySelectorAll('.side-tab').forEach(t => { t.onclick = () => openSide(t.dataset.pane); });
document.querySelectorAll('.side-close').forEach(b => { b.onclick = () => openSide(''); });
$('btnLib').onclick = () => { if (openPane !== 'lib') openSide('lib'); else $('libSearch').focus(); if (narrow()) openTools(false); };
// パネルの幅：左端をドラッグで変える
function setSideW(w){ w = Math.max(240, Math.min(620, w)); document.documentElement.style.setProperty('--side-w', w + 'px'); return w; }
$('sideResize').addEventListener('pointerdown', e => {
  const r = $('sideResize'); r.classList.add('drag'); r.setPointerCapture(e.pointerId);
  const x0 = e.clientX, w0 = $('sidePanel').querySelector('.side-main').getBoundingClientRect().width;
  const mv = ev => { setSideW(w0 + (x0 - ev.clientX)); fitSVG(); };
  const up = ev => { r.classList.remove('drag'); r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up);
    try { localStorage.setItem(KEY.sideW, String(Math.round(w0 + (x0 - ev.clientX)))); } catch {} };
  r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up);
});

// ライブラリ
let LIB = null, EXAMPLES = null;
function renderLib(){
  if (!LIB){ LIB = D.library(); EXAMPLES = D.examples(); }
  const q = E.normalize($('libSearch').value).replace(/\s/g, '').toLowerCase();
  const hit = (...s) => !q || s.some(x => E.normalize(x).replace(/\s/g, '').toLowerCase().includes(q));
  const box = $('libList'); box.replaceChildren();
  const opened = lsGet(KEY.side + '.open') || ['examples'];
  const sec = (id, title, note, fill) => {
    const d = el('details', 'lib'); d.dataset.id = id;
    if (q || opened.includes(id)) d.open = true;
    const s = el('summary'); s.textContent = title; d.append(s);
    if (note){ const n = el('div', 'note'); n.textContent = note; d.append(n); }
    const n = fill(d);
    d.addEventListener('toggle', () => { if (q) return; const o = new Set(lsGet(KEY.side + '.open') || ['examples']); if (d.open) o.add(id); else o.delete(id); lsSet(KEY.side + '.open', [...o]); });
    if (n) box.append(d);
  };
  sec('examples', '例題', '目的の式と与えられた式を、まとめて入れ替えます（元に戻すで戻せます）', d => {
    let n = 0;
    EXAMPLES.forEach(ex => {
      if (!hit(ex.name, ex.target, ...ex.eqs.map(x => x.text))) return;
      const b = el('button', 'ex-item'); b.textContent = ex.name; b.onclick = () => loadExample(ex); d.append(b); n++;
    });
    return n;
  });
  for (const cat of LIB){
    sec(cat.id, cat.title, cat.note, d => {
      let n = 0;
      for (const it of cat.items){
        if (!hit(it.name || '', it.text)) continue;
        const p = E.parseEquation(it.text, String(it.dh));
        const item = el('div', 'lib-item');
        const nm = el('div', 'nm'); nm.textContent = it.name || '';
        const eq = el('div', 'eq'); eq.innerHTML = E.segsToHTML(E.equationSegs(p, {old: prefs.old, digits: digitsOf([String(it.dh)])}));
        const acts = el('div', 'acts');
        const bt = el('button', 'sbtn'); bt.textContent = '目的の式に'; bt.title = '目的の式にする（ΔH は ? にする）'; bt.onclick = () => useLib(it, 'target');
        const ba = el('button', 'sbtn primary'); ba.textContent = '追加'; ba.title = '与えられた式に加える'; ba.onclick = () => useLib(it, 'eq');
        acts.append(bt, ba); item.append(nm, eq, acts); d.append(item); n++;
      }
      return n;
    });
  }
  if (!box.children.length){ const p = el('p'); p.style.color = 'var(--muted)'; p.textContent = '見つかりませんでした'; box.append(p); }
}
$('libSearch').addEventListener('input', renderLib);
function useLib(it, where){
  commit();
  if (where === 'target'){ doc.target = {text: it.text, dh: '?'}; toast('目的の式に入れました'); }
  else {
    let i = doc.eqs.findIndex(e => e.id === fillTarget && !e.text.trim());
    if (i < 0) i = doc.eqs.findIndex(e => !e.text.trim());
    fillTarget = 0;
    if (i < 0){ doc.eqs.push(newEq()); i = doc.eqs.length - 1; }
    Object.assign(doc.eqs[i], {text: it.text, dh: String(it.dh), on: false, mult: '1', rev: false});
    toast('(' + (i + 1) + ') に入れました');
  }
  renderAll(); changed();
}
function loadExample(ex){
  commit();
  doc = {app: 'chem-thermo', version: 1, name: ex.name, target: {text: ex.target, dh: '?'},
    eqs: ex.eqs.map(x => newEq(x.text, x.dh)), scale: doc.scale};
  save.fileHandle = null; save.autoFile = false; save.time = 0; save.where = ''; syncAutoItem();
  renderAll(); changed();
  if (narrow()) openSide('');
  toast('例題「' + ex.name + '」を開きました');
}

// 書き出し：白い紙に書く（画面の配色は関係ない）
function exportSVG(){
  const r = last || compute();
  if (!r.groups.length) return null;
  const color = $('expColor').checked;
  const colors = color ? {ink: '#1f2933', muted: '#6b7480', target: '#2563eb', step: '#7c3aed', spect: '#d9480f'}
    : {ink: '#000000', muted: '#555555', target: '#000000', step: '#000000', spect: '#000000', eqs: ['#000000']};
  if (!$('expTrans').checked) colors.bg = '#ffffff';
  return E.diagramSVG(r.groups, {scale: doc.scale, old: prefs.old, colors});
}
function drawExportPreview(){
  const d = exportSVG();
  $('expPrev').innerHTML = d ? d.svg : '<span style="color:#6b7480;font-size:12px;padding:20px">図がまだありません</span>';
  if ($('expName').dataset.auto !== 'no') $('expName').value = doc.name === '無題' ? 'エネルギー図' : doc.name;
}
['expColor', 'expTrans'].forEach(id => $(id).addEventListener('change', drawExportPreview));
$('expName').addEventListener('input', () => { $('expName').dataset.auto = 'no'; });
async function pngBlob(d, scale){
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg);
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = Math.ceil(d.width * scale); cv.height = Math.ceil(d.height * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
$('expSave').onclick = async () => {
  const d = exportSVG(); if (!d) return toast('図がまだありません');
  const name = ($('expName').value.trim() || 'エネルギー図').replace(/[\\/:*?"<>|]/g, '_');
  if ($('expFmt').value === 'svg') download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + d.svg], {type: 'image/svg+xml'}), name + '.svg');
  else download(await pngBlob(d, +$('expScale').value), name + '.png');
  toast('ダウンロードのフォルダに保存しました');
};
$('expCopy').onclick = async () => {
  const d = exportSVG(); if (!d) return toast('図がまだありません');
  try {
    await navigator.clipboard.write([new ClipboardItem({'image/png': pngBlob(d, +$('expScale').value)})]);
    toast('画像をコピーしました。Word・PowerPoint に貼り付けられます');
  } catch (e){ toast('コピーできませんでした：' + e.message, 4000); }
};

// ===================== 狭い画面：左の式の一覧を引き出しにする =====================
const narrow = () => matchMedia('(max-width:900px)').matches;
function openTools(on){ $('app').classList.toggle('tools-open', on); }
$('btnTools').onclick = () => openTools(!$('app').classList.contains('tools-open'));
$('toolsBack').onclick = () => openTools(false);
function onResize(){
  document.documentElement.style.setProperty('--top-h', $('topBar').getBoundingClientRect().height + 'px');
  if (!narrow()) openTools(false);
  fitSVG();
}
addEventListener('resize', onResize);
new ResizeObserver(fitSVG).observe($('wrap'));

// ===================== キーボード =====================
let help = null;
document.addEventListener('keydown', e => {
  if (help && help.root.contains(e.target)) return;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const k = e.key.toLowerCase();
  const inField = e.target.matches && e.target.matches('input, textarea, select');
  if (mod && k === 's'){ e.preventDefault(); saveMain(); return; }
  if (mod && k === 'o'){ e.preventDefault(); openFile(); return; }
  if (e.isComposing || document.querySelector('dialog[open]')) return;
  if (mod && k === 'z' && !inField){ e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && k === 'y' && !inField && !isMac){ e.preventDefault(); redo(); return; }
  if (!inField && !mod && e.key === '?'){ e.preventDefault(); $('btnHelp').click(); return; }
  if (e.key === 'Escape' && $('app').classList.contains('tools-open')) openTools(false);
});

// ===================== 起動 =====================
// アイコンだけのボタンに、読み上げ用の短い名前を付ける（title の先頭）
for (const b of document.querySelectorAll('button[title]')){
  if (b.getAttribute('aria-label') || b.textContent.trim()) continue;
  const t = b.getAttribute('title').split(/[（(：:]/)[0].trim(); if (t) b.setAttribute('aria-label', t);
}
if (hasUI) JohoUI.tooltip({keyboard: true, skip: n => n.closest('.tool-help')});
try { $('favicon').href = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString($('appIcon'))); } catch {}
try {
  help = JohoToolHelp.create({
    root: $('operation-help'), opener: $('btnHelp'), title: 'エネルギー図エディタの使い方', storageKey: KEY.help,
    bounds: () => ({top: $('topBar').getBoundingClientRect().bottom + 8, bottom: $('wrap').getBoundingClientRect().bottom - 8}),
    initialRight: () => $('wrap').getBoundingClientRect().right - 12,
    returnToEditor: () => { const f = lastField || document.querySelector('#targetCard .eq-text'); f && f.focus(); }
  });
} catch {   // ヘルプが読めなくても、式を入れる・保存はできるようにする
  $('operation-help').hidden = true;
  $('btnHelp').onclick = () => toast('使い方を読み込めませんでした（../shared/help-panel.js が必要です）');
}
let view = null;
function syncSetMenu(v){
  document.querySelectorAll('#themeSeg [data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === v.theme));
  document.querySelectorAll('#sizeSeg [data-size]').forEach(b => b.classList.toggle('on', b.dataset.size === v.textSize));
}
try {
  view = JohoUI.theme({storageKey: KEY.view, onChange: v => { syncSetMenu(v); if (last) drawDiagram(last); onResize(); }});
  $('themeSeg').onclick = e => { const b = e.target.closest('[data-theme]'); if (b) view.set({theme: b.dataset.theme}); };
  $('sizeSeg').onclick = e => { const b = e.target.closest('[data-size]'); if (b) view.set({textSize: b.dataset.size}); };
} catch { document.querySelectorAll('#themeSeg, #sizeSeg').forEach(n => { n.previousElementSibling.hidden = true; n.hidden = true; }); }
$('optOld').onchange = e => setPref('old', e.target.checked);
$('optAnswer').onchange = e => setPref('answer', e.target.checked);
syncPrefs();

// 直前に開いていた内容（自動保存）をそのまま表示する（共通仕様 4.2）。はじめての人には例題を 1 つ出しておく
const auto = lsGet(KEY.auto);
let restored = false;
if (auto && auto.doc){
  try { doc = sanitize(auto.doc); save.mark = auto.mark || ''; save.where = auto.where || ''; save.time = auto.savedAt || 0; restored = true; }
  catch { toast('前回の内容を読めなかったので、新しく始めます'); }
}
if (!restored){
  const ex = D.examples()[0];
  doc = {app: 'chem-thermo', version: 1, name: ex.name, target: {text: ex.target, dh: '?'}, eqs: ex.eqs.map(x => newEq(x.text, x.dh)), scale: 'even'};
  save.mark = contentJSON(doc);
}
try { const w = +localStorage.getItem(KEY.sideW); if (w) setSideW(w); } catch {}
let savedPane = ''; try { savedPane = localStorage.getItem(KEY.side) || ''; } catch {}
syncAutoItem();
renderAll();
if (['lib', 'exp'].includes(savedPane) && !narrow()) openSide(savedPane);
syncSaveStatus();
onResize();
if (!hasUI) setTimeout(() => alert('共通部品（../shared/ui-kit.js）を読み込めませんでした。ページを再読み込みしてください。'), 200);

// 検証用（最後まで読み込めたことの印にもする）
window.__thermo = {E, D, get doc(){ return doc; }, compute, refresh, sanitize, loadExample, get last(){ return last; }};
})();
