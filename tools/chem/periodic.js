// 周期表と結合：画面の動き。計算は chem-periodic.js、数値は chem-data.js。
(function () {
'use strict';
const $ = id => document.getElementById(id);
const P = ChemPeriodic, D = ChemData, EL = D.ELEMENTS;
const bySym = D.elementBySym;
const hasUI = typeof JohoUI !== 'undefined';
const toast = (msg, ms) => { if (hasUI) JohoUI.toast(msg, ms); else console.log(msg); };
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const KEY = {state: 'joho.chem.periodic.state', view: 'joho.chem.periodic.view', side: 'joho.chem.periodic.side',
  sideW: 'joho.chem.periodic.sideW', help: 'joho.chem.periodic.help.v1'};
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };

// ---- 状態（見ている量・選んだ元素など。ブラウザに自動で保存する） ----
const VIEWS = ['table', 'graph', 'bond'];
const state = {view: 'table', prop: 'en', gmode: 'z', a: 'Na', b: 'Cl', next: 'A', hlCat: null, gfocus: null, qc: null,
  showValue: false, showName: false, showGroup: true};
(function restore(){
  const s = lsGet(KEY.state); if (!s) return;
  if (VIEWS.includes(s.view)) state.view = s.view;
  if (P.PROPS[s.prop]) state.prop = s.prop;
  if (['z', 'period', 'group'].includes(s.gmode)) state.gmode = s.gmode;
  for (const k of ['a', 'b']) if (s[k] === null || (typeof s[k] === 'string' && bySym(s[k]))) state[k] = s[k];
  if (s.next === 'A' || s.next === 'B') state.next = s.next;
  for (const k of ['showValue', 'showName', 'showGroup']) if (typeof s[k] === 'boolean') state[k] = s[k];
})();
const save = () => lsSet(KEY.state, {view: state.view, prop: state.prop, gmode: state.gmode, a: state.a, b: state.b, next: state.next,
  showValue: state.showValue, showName: state.showName, showGroup: state.showGroup});

// ---- 色 ----
const RAMP_L = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];   // 値が大きいほど濃い（ライト）
const RAMP_D = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'];   // 値が大きいほど明るい（ダーク）
const isDark = () => document.documentElement.dataset.resolvedTheme === 'dark';
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function rampColor(t){
  const st = isDark() ? RAMP_D : RAMP_L, x = Math.max(0, Math.min(1, t)) * (st.length - 1), i = Math.min(st.length - 2, Math.floor(x)), f = x - i;
  const a = hex2rgb(st[i]), b = hex2rgb(st[i + 1]);
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const textOn = rgb => lum(rgb) > .3 ? '#0b0b0b' : '#ffffff';
const rgbCss = rgb => 'rgb(' + rgb.join(',') + ')';
const rangeCache = {};
const range = prop => rangeCache[prop] || (rangeCache[prop] = P.propRange(prop));
const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// ---- 周期表を作る（見る量を変えても、マスの作り直しはしない。色と文字だけを更新する） ----
const tables = [];   // {root, compact, cells:Map(Z→button)}
function buildTable(root, compact){
  root.textContent = '';
  const cells = new Map(), pos = new Map();
  const add = (el, r, c) => { el.style.gridRow = r; el.style.gridColumn = c; root.appendChild(el); };
  const div = (cls, text, r, c) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; add(d, r, c); return d; };
  for (let g = 1; g <= 18; g++){ const d = div('gh', String(g), 1, g + 1); d.setAttribute('aria-hidden', 'true'); }
  for (let p = 1; p <= 7; p++){ const d = div('ph', String(p), p + 1, 1); d.setAttribute('aria-hidden', 'true'); }
  const sp = document.createElement('div'); sp.style.height = '6px'; add(sp, 9, '1 / -1');
  div('fl', 'ランタノイド', 10, '2 / span 2').setAttribute('aria-hidden', 'true');
  div('fl', 'アクチノイド', 11, '2 / span 2').setAttribute('aria-hidden', 'true');
  for (const [p, txt, cat] of [[6, '57–71', 'lan'], [7, '89–103', 'act']]){
    const d = div('cell ph2', txt, p + 1, 4); d.style.setProperty('--c', 'var(--' + P.CATEGORY[cat].color + ')'); d.setAttribute('aria-hidden', 'true');
  }
  for (const e of EL){
    const row = e.f ? (e.f === 'La' ? 10 : 11) : e.period + 1;
    const col = e.f ? 4 + e.Z - (e.f === 'La' ? 57 : 89) : e.group + 1;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cell'; b.dataset.z = e.Z; b.dataset.sym = e.sym; b.tabIndex = -1;
    b.innerHTML = '<span class="z">' + e.Z + '</span><span class="s">' + e.sym + '</span><span class="v"></span><span class="badge" hidden></span>';
    add(b, row, col); cells.set(e.Z, b); pos.set(row + ',' + col, b); b.dataset.r = row; b.dataset.c = col;
  }
  const t = {root, compact, cells, pos};
  root.addEventListener('click', ev => { const b = ev.target.closest('.cell[data-sym]'); if (b) pick(b.dataset.sym); });
  root.addEventListener('keydown', ev => arrowNav(t, ev));
  root.addEventListener('focusin', ev => { const b = ev.target.closest('.cell[data-sym]'); if (b) setRoving(t, b); });
  tables.push(t);
  const first = cells.get(EL.find(e => e.sym === (state.a || 'H')).Z); setRoving(t, first);
  return t;
}
function setRoving(t, b){ t.cells.forEach(c => { c.tabIndex = c === b ? 0 : -1; }); }
function arrowNav(t, ev){
  const dirs = {ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0]};
  const d = dirs[ev.key], b = ev.target.closest('.cell[data-sym]');
  if (!d || !b) return;
  ev.preventDefault();
  let r = +b.dataset.r, c = +b.dataset.c;
  for (let i = 0; i < 20; i++){
    r += d[0]; c += d[1];
    if (r < 2 || r > 11 || c < 2 || c > 19) return;
    const n = t.pos.get(r + ',' + c);
    if (n){ n.focus(); return; }
  }
}

const elName = e => e.name + '（' + e.sym + '）';
function cellTip(e){
  const pr = state.prop;
  let s = e.name + '（' + e.sym + '・' + e.Z + '）';
  if (pr === 'cat') return s + '　' + P.CATEGORY[e.cat].name;
  const v = P.propValue(pr, e), u = P.PROPS[pr].unit;
  if (v != null) return s + '　' + P.PROPS[pr].short + ' ' + P.fmtVal(pr, v) + (u ? ' ' + u : '');
  if (pr === 'ea' && e.eaState === 'none') return s + '　電子親和力：なし（電子を受け取ると不安定）';
  return s + '　' + P.PROPS[pr].short + '：データなし';
}
function updateTable(t){
  const pr = state.prop, num = P.PROPS[pr].kind === 'num', rg = num ? range(pr) : null;
  const A = state.a && bySym(state.a), B = state.b && bySym(state.b);
  const focusEl = A;
  t.cells.forEach((b, Z) => {
    const e = EL[Z - 1];
    let cls = 'cell', style = '', val = '';
    if (!num){
      b.style.removeProperty('background'); b.style.removeProperty('color');
      b.style.setProperty('--c', 'var(--' + P.CATEGORY[e.cat].color + ')');
      if (state.showName && !t.compact) val = e.name;
      if (state.hlCat && state.hlCat !== e.cat) cls += ' dim';
    } else {
      const v = P.propValue(pr, e);
      b.style.removeProperty('--c');
      if (v == null){ cls += ' nodata'; b.style.removeProperty('background'); b.style.removeProperty('color'); }
      else {
        const rgb = rampColor((v - rg.min) / (rg.max - rg.min));
        b.style.background = rgbCss(rgb); b.style.color = textOn(rgb);
      }
      if (v != null && state.showValue && !t.compact) val = P.fmtVal(pr, v);
      else if (state.showName && !t.compact) val = e.name;
    }
    const isA = A && A.sym === e.sym, isB = B && B.sym === e.sym;
    if (isA) cls += ' selA';
    if (isB) cls += ' selB';
    if (!t.compact && state.showGroup && focusEl && !isA && ((e.period === focusEl.period && !e.f && !focusEl.f) || (e.group != null && e.group === focusEl.group))) cls += ' rel';
    b.className = cls;
    b.querySelector('.v').textContent = val;
    const bd = b.querySelector('.badge');
    bd.hidden = !(isA || isB); bd.textContent = isA && isB ? 'A B' : isA ? 'A' : 'B';
    const tip = cellTip(e);
    b.dataset.tip = tip; b.setAttribute('aria-label', tip + (isA ? '（A に選択中）' : '') + (isB ? '（B に選択中）' : ''));
  });
}

// ---- 凡例 ----
function renderLegend(){
  const lg = $('legend'), pr = state.prop, def = P.PROPS[pr];
  let h = '<span class="pname">' + esc(def.label) + (def.unit ? '（' + def.unit + '）' : '') + '</span>';
  if (def.kind === 'cat'){
    for (const k of Object.keys(P.CATEGORY)){
      const c = P.CATEGORY[k];
      h += '<button type="button" class="lg' + (state.hlCat === k ? ' on' : '') + '" data-cat="' + k + '" aria-pressed="' + (state.hlCat === k) + '" title="' + esc(c.name) + 'だけを目立たせる">' +
        '<span class="sw" style="background:var(--' + c.color + ')"></span>' + esc(c.name) + '</button>';
    }
  } else {
    const rg = range(pr), st = (isDark() ? RAMP_D : RAMP_L).join(',');
    h += '<span class="rl">' + P.fmtVal(pr, rg.min) + '</span><span class="ramp" style="background:linear-gradient(90deg,' + st + ')" role="img" aria-label="色の濃さ：左が小さい値、右が大きい値"></span>' +
      '<span class="rl">' + P.fmtVal(pr, rg.max) + '</span><span class="nd"><span class="sw nodata"></span>データなし</span>';
  }
  lg.innerHTML = h;
}
$('legend').addEventListener('click', ev => {
  const b = ev.target.closest('[data-cat]'); if (!b) return;
  state.hlCat = state.hlCat === b.dataset.cat ? null : b.dataset.cat;
  renderLegend(); tables.forEach(updateTable);
});

// ---- 選ぶ ----
function pick(sym){
  if (state.next === 'A'){ state.a = sym; state.next = 'B'; state.gfocus = null; } else { state.b = sym; state.next = 'A'; }
  state.qc = null;
  save(); renderAll();
}
function setNext(w){ state.next = w; save(); renderChips(); toast((w === 'A' ? 'A' : 'B') + ' を選びなおします。元素をクリックしてください'); }
function renderChips(){
  const mk = (k, sym, cls) => {
    const e = sym && bySym(sym), el = $('chip' + k);
    el.className = 'chip pick ' + cls + (state.next === k ? ' next' : '');
    el.innerHTML = '<span class="k">' + k + '</span>' + (e ? esc(e.sym + ' ' + e.name) : '<span style="color:var(--muted)">未選択</span>');
    el.setAttribute('aria-pressed', String(state.next === k));
  };
  mk('A', state.a, 'a'); mk('B', state.b, 'b');
  const v = $('verdict'), A = state.a && bySym(state.a), B = state.b && bySym(state.b);
  if (A && B){
    const r = P.judge(A, B, {qc: state.qc});
    v.hidden = false; v.textContent = A.sym + '–' + B.sym + '：' + r.label;
  } else { v.hidden = true; }
}
$('chipA').onclick = () => setNext('A');
$('chipB').onclick = () => setNext('B');
$('chipSwap').onclick = () => { [state.a, state.b] = [state.b, state.a]; state.qc = null; state.gfocus = null; save(); renderAll(); };
$('chipClear').onclick = clearSel;
function clearSel(){ state.a = null; state.b = null; state.next = 'A'; state.gfocus = null; state.qc = null; save(); renderAll(); }
$('verdict').onclick = () => setView('bond');

// ---- くわしい情報（右のパネル） ----
function valenceInfo(e){
  const outer = e.shells ? e.shells[e.shells.length - 1] : null;
  if (e.cat === 'noble') return {outer: outer != null ? outer : (e.sym === 'He' ? 2 : 8), val: 0, text: '0 個（貴ガスは安定で、ふつう結合しない）'};
  if (e.cat === 'trans' || e.cat === 'lan' || e.cat === 'act') return {outer, val: null, text: '決まらない（内側の電子も反応に関わる）'};
  const g = e.group, val = g <= 2 ? g : g - 10;
  return {outer: outer != null ? outer : val, val, text: val + ' 個'};
}
function shellSVG(e){
  const sh = e.shells; if (!sh) return '';
  const n = sh.length, R0 = 16, dr = 13, size = 2 * (R0 + dr * n) + 6, c = size / 2;
  let s = '<svg class="shell-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="電子殻のモデル（' + sh.join('・') + '）">' +
    '<circle class="nuc" cx="' + c + '" cy="' + c + '" r="12"/><text x="' + c + '" y="' + (c + 3.5) + '">' + e.Z + '+</text>';
  sh.forEach((k, i) => {
    const r = R0 + dr * (i + 1);
    s += '<circle class="orb" cx="' + c + '" cy="' + c + '" r="' + r + '"/>';
    for (let j = 0; j < k; j++){
      const ang = -Math.PI / 2 + 2 * Math.PI * j / k;
      s += '<circle class="e' + (i === n - 1 ? ' outer' : '') + '" cx="' + (c + r * Math.cos(ang)).toFixed(1) + '" cy="' + (c + r * Math.sin(ang)).toFixed(1) + '" r="2.6"/>';
    }
  });
  return s + '</svg>';
}
const SHELL_NAMES = ['K', 'L', 'M', 'N', 'O', 'P'];
function elemCard(e, which){
  const cat = P.CATEGORY[e.cat], vi = valenceInfo(e);
  const pr = k => { const v = P.propValue(k, e), u = P.PROPS[k].unit; return v == null ? null : P.fmtVal(k, v) + (u ? ' ' + u : ''); };
  const ea = pr('ea') || (e.eaState === 'none' ? 'なし（電子を受け取ると不安定）' : 'データなし');
  const ions = e.ions.length ? e.ions.map(q => P.ionText(e.sym, q)).join('、') : 'ふつうはイオンにならない';
  let ionR = '';
  if (e.ions.length){
    const ir = e.ions.map(q => { const r = D.ION_RADIUS[D.ionKey(e.sym, q)]; return r ? P.ionText(e.sym, q) + ' ' + r + ' pm' : null; }).filter(Boolean);
    ionR = ir.length ? ir.join('、') : '';
  }
  let h = '<div class="el-card ' + which.toLowerCase() + '"><div class="el-head"><div class="el-tile" style="--c:var(--' + cat.color + ')"><span class="z">' + e.Z + '</span><span class="s">' + e.sym + '</span></div>' +
    '<div><div class="nm">' + which + '：' + esc(e.name) + '</div><div class="sub">' + esc(cat.name) + '　' + (e.group != null ? '第 ' + e.period + ' 周期・' + e.group + ' 族' : '第 ' + e.period + ' 周期（' + (e.f === 'La' ? 'ランタノイド' : 'アクチノイド') + '）') + '</div></div></div>';
  h += '<dl><dt>原子量</dt><dd>' + esc(e.mass) + (typeof e.mass === 'string' ? '（質量数）' : '') + '</dd>' +
    '<dt>電気陰性度</dt><dd>' + (pr('en') || (e.cat === 'noble' ? 'なし（貴ガス）' : 'データなし')) + '</dd>' +
    '<dt>イオン化エネルギー</dt><dd>' + (pr('ie') || 'データなし') + '</dd>' +
    '<dt>電子親和力</dt><dd>' + ea + '</dd>' +
    '<dt>原子半径</dt><dd>' + (pr('r') || 'なし') + '</dd>' +
    '<dt>主なイオン</dt><dd>' + esc(ions) + '</dd>' + (ionR ? '<dt>イオン半径</dt><dd>' + esc(ionR) + '</dd>' : '') + '</dl>';
  // 原子半径とイオン半径の比べ
  const ir0 = e.ionR;
  if (e.r && ir0){
    const mx = Math.max(e.r, ir0);
    h += '<div class="rbars" aria-label="原子とイオンの半径の比べ"><div class="rbar"><span>' + e.sym + '（原子）</span><span class="t"><span class="f" style="width:' + (100 * e.r / mx) + '%"></span></span><span>' + e.r + ' pm</span></div>' +
      '<div class="rbar"><span>' + P.ionText(e.sym, e.ions[0]) + '</span><span class="t"><span class="f ion" style="width:' + (100 * ir0 / mx) + '%"></span></span><span>' + ir0 + ' pm</span></div>' +
      '<div style="color:var(--muted)">' + (e.ions[0] > 0 ? '陽イオンは原子より小さくなる（電子を失い、残った電子が核に強く引かれる）' : '陰イオンは原子より大きくなる（電子が増えて、反発し合う）') + '</div></div>';
  }
  // 電子配置
  if (e.shells){
    h += '<div class="shell-row">' + shellSVG(e) + '<div style="font-size:12.5px;line-height:1.7"><b>電子殻ごとの電子の数</b><br>' +
      e.shells.map((k, i) => SHELL_NAMES[i] + '殻 ' + k).join('　') + '<br>最外殻電子：' + vi.outer + ' 個<br>価電子：' + vi.text + '</div></div>';
  } else {
    h += '<div style="font-size:12.5px;color:var(--muted)">電子殻の図は原子番号 54 までを表示します。</div>';
  }
  h += '<div class="mini"><button type="button" class="sbtn" data-gp="period" data-sym="' + e.sym + '"' + (e.f ? ' disabled' : '') + ' title="この元素と同じ周期の元素を、左から右へ並べたグラフ">同じ周期のグラフ</button>' +
    '<button type="button" class="sbtn" data-gp="group" data-sym="' + e.sym + '"' + (e.group == null ? ' disabled' : '') + ' title="この元素と同じ族の元素を、上から下へ並べたグラフ">同じ族のグラフ</button></div></div>';
  return h;
}
function renderElem(){
  const A = state.a && bySym(state.a), B = state.b && bySym(state.b);
  let h = '';
  if (A) h += elemCard(A, 'A');
  if (B) h += elemCard(B, 'B');
  if (!h) h = '<div class="empty">周期表の元素を<b>クリック</b>すると、ここにくわしい情報が出ます。<br>1 つ目が <b>A</b>、2 つ目が <b>B</b> です。</div>';
  $('elemBody').innerHTML = h;
}
$('elemBody').addEventListener('click', ev => {
  const b = ev.target.closest('[data-gp]'); if (!b || b.disabled) return;
  state.gfocus = b.dataset.sym; state.gmode = b.dataset.gp;
  if (state.prop === 'cat') state.prop = 'en';
  setView('graph');
});

// ---- グラフ ----
function niceTicks(max){
  const raw = max / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag, top = Math.ceil(max / step) * step, t = [];
  for (let v = 0; v <= top + 1e-9; v += step) t.push(+v.toFixed(6));
  return {step, top, t};
}
function renderGraph(){
  const body = $('graphBody'), pr = state.prop === 'cat' ? 'en' : state.prop, def = P.PROPS[pr];
  $('gmodeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.gmode === state.gmode));
  const focus = (state.gfocus && bySym(state.gfocus)) || (state.a && bySym(state.a)) || null;
  let msg = '';
  if (state.gmode === 'period' && !focus) msg = '「A」に元素を選ぶと、その元素と同じ周期をグラフにします。周期表で元素をクリックしてください。';
  if (state.gmode === 'group' && !focus) msg = '「A」に元素を選ぶと、その元素と同じ族をグラフにします。周期表で元素をクリックしてください。';
  if (state.gmode === 'period' && focus && focus.f) msg = focus.name + 'はランタノイド・アクチノイドなので、周期の並びでは表せません。';
  if (state.gmode === 'group' && focus && focus.group == null) msg = focus.name + 'には族がありません（ランタノイド・アクチノイド）。';
  if (msg){ body.innerHTML = '<div class="empty">' + esc(msg) + '</div>'; $('graphTitle').textContent = ''; $('graphNote').textContent = ''; return; }
  const S = P.chartSeries(state.gmode, pr, focus);
  $('graphTitle').textContent = S.title + 'の' + def.label + (def.unit ? '（' + def.unit + '）' : '');
  const W = Math.max(320, body.clientWidth), H = Math.max(260, body.clientHeight);
  const m = {l: 54, r: 16, t: 22, b: state.gmode === 'z' ? 52 : 40};
  const vals = S.pts.map(p => p.v).filter(v => v != null);
  if (!vals.length){ body.innerHTML = '<div class="empty">この量のデータがありません。</div>'; return; }
  const ty = niceTicks(Math.max(...vals)), yTop = ty.top;
  const xs = S.pts.map(p => p.x), xmin = state.gmode === 'z' ? 0.5 : state.gmode === 'period' ? 0.5 : 0.5,
    xmax = state.gmode === 'z' ? 56.5 : state.gmode === 'period' ? 18.5 : Math.max(...xs) + 0.5;
  const X = x => m.l + (x - xmin) / (xmax - xmin) * (W - m.l - m.r), Y = v => H - m.b - v / yTop * (H - m.t - m.b);
  const A = state.a && bySym(state.a), B = state.b && bySym(state.b);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc($('graphTitle').textContent) + 'のグラフ"><g class="gy">';
  for (const v of ty.t){
    s += '<line class="ggrid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (m.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + (def.digits ? +v.toFixed(2) : v) + '</text>';
  }
  s += '</g><line class="gaxis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
  // x 軸
  s += '<g class="gx">';
  if (state.gmode === 'z'){
    const ends = [2, 10, 18, 36, 54], starts = [1, 3, 11, 19, 37, 55];
    ends.forEach(e => { s += '<line class="gsep" x1="' + X(e + .5) + '" x2="' + X(e + .5) + '" y1="' + m.t + '" y2="' + Y(0) + '"/>'; });
    starts.forEach((st, i) => {
      const en = i < ends.length ? ends[i] : 56, w = X(en + .5) - X(st - .5);
      s += '<text class="gper" x="' + (X(st - .5) + w / 2) + '" y="' + (Y(0) + 32) + '" text-anchor="middle">' + (w >= 64 ? '第 ' + (i + 1) + ' 周期' : (w >= 22 ? i + 1 : '')) + '</text>';
    });
    for (const z of [1, 10, 20, 30, 40, 50]) s += '<text x="' + X(z) + '" y="' + (Y(0) + 15) + '" text-anchor="middle">' + z + '</text>';
  } else {
    for (const p of S.pts) s += '<text x="' + X(p.x) + '" y="' + (Y(0) + 15) + '" text-anchor="middle">' + p.xl + '</text>';
  }
  s += '<text x="' + m.l + '" y="' + (H - 4) + '" text-anchor="start">横軸：' + (state.gmode === 'z' ? '原子番号' : S.xlabel) + '</text></g>';
  // 折れ線（値のない元素の場所で切る）
  let run = [], runs = [];
  for (const p of S.pts){ if (p.v == null){ if (run.length) runs.push(run); run = []; } else run.push(p); }
  if (run.length) runs.push(run);
  for (const r of runs) if (r.length > 1) s += '<polyline class="gline" points="' + r.map(p => X(p.x).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ') + '"/>';
  // 点・文字・クリックの当たり
  const dots = [], labels = [], hits = [];
  for (const p of S.pts){
    if (p.v == null) continue;
    const e = p.el, isA = A && A.sym === e.sym, isB = B && B.sym === e.sym, cx = X(p.x).toFixed(1), cy = Y(p.v).toFixed(1);
    dots.push('<circle class="gdot' + (isA ? ' selA' : '') + (isB ? ' selB' : '') + '" cx="' + cx + '" cy="' + cy + '" r="' + (isA || isB ? 7 : 4.5) + '"/>');
    const edge = state.gmode !== 'z' || e.group === 1 || e.group === 18 || isA || isB;
    if (edge && !(state.gmode === 'z' && e.Z > 56)) labels.push('<text class="glbl" x="' + cx + '" y="' + (+cy - 10) + '" text-anchor="middle">' + e.sym + '</text>');
    hits.push('<circle class="ghit" data-sym="' + e.sym + '" data-tip="' + esc(e.name + '（' + e.sym + '）  ' + def.short + ' ' + P.fmtVal(pr, p.v) + (def.unit ? ' ' + def.unit : '')) + '" cx="' + cx + '" cy="' + cy + '" r="11"/>');
  }
  s += dots.join('') + labels.join('') + hits.join('') + '</svg>';
  body.innerHTML = s;
  const note = state.prop === 'cat' ? '（元素の種類は量ではないので、電気陰性度のグラフを出しています）　' : '';
  $('graphNote').textContent = note + def.note + (state.gmode === 'z' ? '　縦の点線は周期の区切りです。値のない元素の場所は、線を切ってあります。' : '');
}
$('graphBody').addEventListener('click', ev => { const h = ev.target.closest('.ghit'); if (h) pick(h.dataset.sym); });
$('gmodeSeg').onclick = ev => { const b = ev.target.closest('[data-gmode]'); if (!b) return; state.gmode = b.dataset.gmode; state.gfocus = null; save(); renderGraph(); };

// ---- 結合 ----
const TRI = {x0: 44, y0: 270, w: 330, h: 250, dmax: 3.4, ymin: .5, ymax: 4.2};
const triX = d => TRI.x0 + d / TRI.dmax * TRI.w, triY = m => TRI.y0 - (m - TRI.ymin) / (TRI.ymax - TRI.ymin) * TRI.h;
function triangleSVG(r){
  const A = [0, .79], B = [0, 3.98], C = [3.19, 2.385], mAB = [0, 2.385], mAC = [1.595, 1.5875], mBC = [1.595, 3.1825], G = [1.0633, 2.385];
  const pt = p => triX(p[0]).toFixed(1) + ',' + triY(p[1]).toFixed(1), poly = (cls, ps) => '<polygon class="' + cls + '" points="' + ps.map(pt).join(' ') + '" opacity=".6"/>';
  let s = '<svg class="bond-svg" viewBox="0 0 420 320" role="img" aria-label="電気陰性度の平均と差で結合の種類を見る三角形。選んだ組み合わせは差 ' + r.d + '、平均 ' + r.mean + ' の位置">';
  s += poly('reg-m', [A, mAB, G, mAC]) + poly('reg-c', [B, mBC, G, mAB]) + poly('reg-i', [C, mAC, G, mBC]);
  s += '<polygon points="' + [A, B, C].map(pt).join(' ') + '" fill="none" stroke="var(--muted)" stroke-width="1.2"/>';
  s += '<text class="reg-t" x="' + triX(.12) + '" y="' + triY(1.25) + '">金属結合</text><text class="reg-t" x="' + triX(.12) + '" y="' + triY(3.5) + '">共有結合</text><text class="reg-t" x="' + triX(1.95) + '" y="' + triY(2.78) + '">イオン結合</text>';
  // 軸
  s += '<line x1="' + TRI.x0 + '" y1="' + TRI.y0 + '" x2="' + (TRI.x0 + TRI.w + 6) + '" y2="' + TRI.y0 + '" stroke="var(--muted)"/><line x1="' + TRI.x0 + '" y1="' + TRI.y0 + '" x2="' + TRI.x0 + '" y2="' + (TRI.y0 - TRI.h - 6) + '" stroke="var(--muted)"/>';
  for (const d of [0, 1, 2, 3]) s += '<text class="mut" x="' + triX(d) + '" y="' + (TRI.y0 + 14) + '" text-anchor="middle">' + d + '</text>';
  for (const v of [1, 2, 3, 4]) s += '<text class="mut" x="' + (TRI.x0 - 6) + '" y="' + (triY(v) + 4) + '" text-anchor="end">' + v + '</text>';
  s += '<text class="mut" x="' + (TRI.x0 + TRI.w / 2) + '" y="' + (TRI.y0 + 30) + '" text-anchor="middle">電気陰性度の差 ΔEN</text>';
  s += '<text class="mut" transform="translate(11 ' + (TRI.y0 - TRI.h / 2) + ') rotate(-90)" text-anchor="middle">電気陰性度の平均</text>';
  // 目安の点
  for (const [x, y] of [['Na', 'Na'], ['Si', 'Si'], ['Cl', 'Cl'], ['H', 'Cl'], ['C', 'O'], ['Na', 'Cl'], ['Mg', 'O'], ['Cs', 'F']]){
    if ((x === r.a.sym && y === r.b.sym) || (x === r.b.sym && y === r.a.sym)) continue;   // 選んだ組み合わせと同じ目安の点は、重ねない
    const a = bySym(x), b = bySym(y), d = Math.abs(a.en - b.en), mn = (a.en + b.en) / 2, px = triX(d), py = triY(mn);
    s += '<circle class="tri-ref" cx="' + px + '" cy="' + py + '" r="2.5"/><text class="tri-ref-t" x="' + (px + 5) + '" y="' + (py + 3) + '">' + x + (x === y ? '' : '–') + (x === y ? '' : y) + '</text>';
  }
  const px = triX(r.d), py = triY(r.mean);
  s += '<circle class="tri-pt" cx="' + px + '" cy="' + py + '" r="7"/><text x="' + (px + 10) + '" y="' + (py + 16) + '" font-weight="700">' + r.a.sym + (r.same ? '' : '–') + (r.same ? '' : r.b.sym) + '</text></svg>';
  return s;
}
// 電子のかたよりの図
function biasSVG(r){
  const A = r.a, B = r.b, W = 360, H = 96, ya = 48, xa = 80, xb = 280;
  const rad = e => 13 + (e.r || 25) * .13;
  let s = '<svg class="bond-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="共有電子対のかたよりの図">';
  const circle = (e, x) => '<circle cx="' + x + '" cy="' + ya + '" r="' + rad(e).toFixed(1) + '" fill="var(--' + P.CATEGORY[e.cat].color + ')" stroke="var(--muted)"/><text x="' + x + '" y="' + (ya + 5) + '" text-anchor="middle" font-weight="700" style="font-size:15px">' + e.sym + '</text>';
  s += circle(A, xa) + circle(B, xb);
  if (r.kind === 'metallic'){
    const pts = [[130, 30], [160, 62], [190, 36], [215, 66], [145, 48], [235, 44], [175, 52], [200, 50]];
    s += pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.8" fill="var(--selB)"/>').join('') + '<text class="mut" x="180" y="88" text-anchor="middle">自由電子</text>';
  } else {
    const hiB = B.en >= A.en, sft = Math.min(1, r.d / 2.0) * (hiB ? 1 : -1);
    const cx = (xa + xb) / 2 + sft * (xb - xa) / 2 * (r.kind === 'ionic' ? 1 : .8);
    s += '<circle cx="' + (cx - 5) + '" cy="' + ya + '" r="3.2" fill="var(--selB)"/><circle cx="' + (cx + 5) + '" cy="' + ya + '" r="3.2" fill="var(--selB)"/>';
    if (!r.same){
      const ion = r.kind === 'ionic' || r.kind === 'mixed';
      const hiX = hiB ? xb : xa, loX = hiB ? xa : xb, hiE = hiB ? B : A, loE = hiB ? A : B;
      s += '<text x="' + hiX + '" y="14" text-anchor="middle" font-weight="700">' + (ion && r.ionic ? P.ionText(hiE.sym, r.ionic.qa) : 'δ−') + '</text><text x="' + loX + '" y="14" text-anchor="middle" font-weight="700">' + (ion && r.ionic ? P.ionText(loE.sym, r.ionic.qc) : 'δ+') + '</text>';
    }
    s += '<text class="mut" x="180" y="90" text-anchor="middle">' + (r.same ? '電子対はまんなか' : (r.kind === 'ionic' ? '電子が' + (hiB ? B : A).sym + 'に移っている' : '電子対が' + (hiB ? B : A).sym + 'のほうへかたよる')) + '</text>';
  }
  return s + '</svg>';
}
// 横棒（エネルギーなど）。rows:[{label, v, cls}]。center：0 を中央に置く（正は右・負は左）
function bars(rows, center){
  const mx = Math.max(...rows.map(r => Math.abs(r.v)));
  return rows.map(r => {
    const wpct = Math.abs(r.v) / mx * (center ? 50 : 100);
    const pos = center ? (r.v >= 0 ? 'left:50%' : 'right:50%') : 'left:0';
    return '<div class="ebar' + (r.total ? ' total' : '') + '"><span>' + r.label + '</span><span class="track">' + (center ? '<span class="mid"></span>' : '') +
      '<span class="fill ' + r.cls + '" style="' + pos + ';width:' + wpct.toFixed(1) + '%"></span></span><span class="num">' + (center ? sgn(r.v) : r.v.toFixed(1)) + '</span></div>';
  }).join('');
}
function ionicCard(r){
  const I = r.ionic, m = r.metal, x = r.other, f = r.formula;
  const mi = P.ionText(m.sym, I.qc), xi = P.ionText(x.sym, I.qa);
  let h = '<div class="card2"><h4>イオン結合：電子の受け渡しとエネルギー</h4>';
  h += '<p><span class="formula">' + f.text + '</span>' + (f.name ? '　' + esc(f.name) : '') + '　（' + mi + ' が ' + f.cation.n + ' 個、' + xi + ' が ' + f.anion.n + ' 個）</p>';
  if (r.chargeChoices.length > 1){
    h += '<p class="sel-chg"><label>' + esc(m.name) + 'のイオンの価数：<select id="selCharge">' + r.chargeChoices.map(q => '<option value="' + q + '"' + (q === I.qc ? ' selected' : '') + '>' + P.ionText(m.sym, q) + '</option>').join('') + '</select></label></p>';
  }
  if (I.simple && I.transfer != null){
    const rows = [
      {label: m.sym + '(気) → ' + mi + '(気) ＋ e⁻<br><span class="small">イオン化エネルギー（電子を渡す）</span>', v: I.ie, cls: 'cost'},
      {label: x.sym + '(気) ＋ e⁻ → ' + xi + '(気)<br><span class="small">電子親和力（電子を受け取る）</span>', v: -I.ea, cls: 'gain'},
      {label: '電子の受け渡しだけの差し引き', v: I.transfer, cls: I.transfer > 0 ? 'cost' : 'gain', total: true}];
    if (I.attract != null) rows.push({label: mi + ' と ' + xi + ' が近づく引力<br><span class="small">点電荷とみなした見積り（目安）</span>', v: I.attract, cls: 'gain'});
    if (I.net != null) rows.push({label: mi + '–' + xi + ' のイオン対ができる全体（目安）', v: I.net, cls: I.net > 0 ? 'cost' : 'gain', total: true});
    h += '<div style="font-size:12px;color:var(--muted);margin-bottom:2px">単位 kJ/mol。＋は吸収（エネルギーが上がる＝損）、−は放出（安定になる）。</div>' + bars(rows, true);
    h += '<p>' + (I.transfer > 0 ? '電子を渡すだけでは、<b>' + I.transfer.toFixed(1) + ' kJ/mol の損</b>です。それでもイオン結合ができるのは、反対の電荷のイオンどうしの<b>引力で大きく安定になる</b>からです。' :
      '電子の受け渡しだけで、すでに' + Math.abs(I.transfer).toFixed(1) + ' kJ/mol 安定になります。') + '</p>';
    if (I.attract != null) h += '<p class="small">引力は −138935 × (価数の積) ÷ (イオン半径の和 ' + (I.rc + I.ra) + ' pm) で見積もっています。結晶の半径を使うので、気体のイオン対の実際の値より小さめに出ます。</p>';
    if (I.lattice != null) h += '<p>結晶では、1 つのイオンが多くの反対の電荷のイオンに囲まれるので、さらに安定になります。<b>格子エネルギー ' + I.lattice.toFixed(1) + ' kJ/mol</b>（' + P.subs(f.plain) + '(固) をばらばらの気体のイオンにするのに必要なエネルギー）。エネルギー図エディタの「ボルン・ハーバー」の例題で、回路の図にして確かめられます。</p>';
  } else {
    h += '<p>' + esc(m.name) + 'が ' + mi + '、' + esc(x.name) + 'が ' + xi + ' になる組み合わせです。2 価以上のイオンをつくるには、第一イオン化エネルギーだけでなく第二以降のエネルギーも必要になるので、このアプリでは 1 価どうしの組み合わせだけエネルギーを計算します。</p>' +
      '<p class="small">参考：' + m.sym + ' の第一イオン化エネルギー ' + (m.ie != null ? m.ie.toFixed(1) + ' kJ/mol' : 'データなし') + '、' + x.sym + ' の電子親和力 ' + (x.ea != null ? x.ea.toFixed(1) + ' kJ/mol' : 'データなし') + '。' +
      (I.attract != null ? '　イオン対の引力の目安 ' + sgn(I.attract) + ' kJ/mol。' : '') + '</p>';
  }
  return h + '</div>';
}
function covalentCard(r){
  const a = r.a, b = r.b, ha = P.handsOf(a), hb = P.handsOf(b), f = r.formula, pa = r.pauling;
  let h = '<div class="card2"><h4>共有結合：電子対のかたより</h4>' + biasSVG(r);
  if (ha && hb && !r.same) h += '<p>' + esc(a.name) + 'は手を ' + ha + ' 本、' + esc(b.name) + 'は手を ' + hb + ' 本出して、電子対を共有します。</p>';
  else if (ha && r.same) h += '<p>' + esc(a.name) + 'は手を ' + ha + ' 本出して、同じ原子どうしで電子対を共有します。</p>';
  if (f && f.text) h += '<p>' + (f.self ? '単体の姿：' : '手の数から考えた式：') + '<span class="formula">' + f.text + '</span>' + (f.note ? '　<span class="small">' + esc(f.note) + '</span>' : '') + '</p>';
  else if (!r.same) h += '<p class="small">第 3 周期以降の元素は、相手によって手の数が変わるので、式は出しません。</p>';
  if (r.kind !== 'covalent' || r.d >= P.T_POLAR) h += '<p>電子を強く引きつけるのは <b>' + esc(r.hi.name) + '（電気陰性度 ' + r.hi.en.toFixed(2) + '）</b>。' + esc(r.hi.name) + '側が δ−、' + esc(r.lo.name) + '側が δ+ になります。</p>';
  h += '</div>';
  if (pa){
    const [, xs] = pa.pair;
    h += '<div class="card2"><h4>結合エネルギーから見る電気陰性度（ポーリングの考え方）</h4>' + bars([
      {label: 'H–H の結合エネルギー', v: pa.dAA, cls: 'gain'}, {label: xs + '–' + xs + ' の結合エネルギー', v: pa.dBB, cls: 'gain'},
      {label: '2 つの平均（幾何平均）', v: pa.mean, cls: 'gain', total: true}, {label: 'H–' + xs + ' の結合エネルギー', v: pa.dAB, cls: 'cost'}], false) +
      '<p>H–' + xs + ' は、平均より <b>' + pa.excess.toFixed(1) + ' kJ/mol</b> 強い結合です。この差は、結合にイオンの性質（極性）が加わった分と考えられ、(ΔEN)² にほぼ比例します：96.5 × ' + pa.dEN.toFixed(2) + '² ＝ ' + pa.predicted.toFixed(1) + ' kJ/mol。</p>' +
      '<p class="small">結合エネルギーは「気体の原子」の生成エンタルピーから計算した値です（エネルギー図エディタと同じ表）。</p></div>';
  }
  return h;
}
function renderBond(){
  const out = $('bondResult'), A = state.a && bySym(state.a), B = state.b && bySym(state.b);
  if (!A || !B){
    out.innerHTML = '<div class="empty"><b>A と B を選びましょう。</b><br>左の周期表で元素をクリックします（1 つ目が A、2 つ目が B）。<br>同じ元素を 2 回クリックすると、同じ原子どうしの結合（Cl₂ など）を考えられます。</div>';
    return;
  }
  const r = P.judge(A, B, {qc: state.qc});
  let h = '<div class="pair"><span class="atom"><i class="a">A</i>' + esc(A.name) + '（' + A.sym + '）</span><span class="dash">と</span><span class="atom"><i class="b">B</i>' + esc(B.name) + '（' + B.sym + '）</span></div>';
  h += '<div class="vd"><div class="kind">' + esc(r.label) + '</div><p>' + esc(r.reason) + '</p></div>';
  if (r.d != null){
    h += '<div class="metrics"><div class="metric"><b>' + r.d.toFixed(2) + '</b><span>電気陰性度の差 ΔEN（' + A.en.toFixed(2) + ' と ' + B.en.toFixed(2) + '）</span></div>' +
      '<div class="metric"><b>' + r.mean.toFixed(2) + '</b><span>電気陰性度の平均</span></div>' +
      '<div class="metric"><b>約 ' + r.ionicPct + ' %</b><span>イオン結合性の目安</span></div></div>';
    h += '<div class="card2"><h4>電気陰性度の「差」と「平均」で見る（ケテラーの三角形）</h4>' + triangleSVG(r) +
      '<p class="small">三角形は電気陰性度だけで見た目安です。金・白金のように、電気陰性度が大きくても金属結合の物質があります。イオン結合性は 1 − e<sup>−(ΔEN)²/4</sup> で見積もっています。</p></div>';
  }
  if ((r.kind === 'ionic' || r.kind === 'mixed') && r.ionic) h += ionicCard(r);
  else if ((r.kind === 'ionic' || r.kind === 'mixed')) h += '<div class="card2"><p class="small">この組み合わせでは、ふつうのイオンの式を作れません。</p></div>';
  if (r.kind === 'covalent' || r.kind === 'polar') h += covalentCard(r);
  if (r.kind === 'metallic'){
    h += '<div class="card2"><h4>金属結合</h4>' + biasSVG(r) + '<p>価電子が特定の原子に決まらず、金属全体を動きまわります。そのため、電気をよく通し（電気伝導性）、たたくと広がり（展性）、引くと延びます（延性）。</p></div>';
  }
  if (r.kind === 'noble') h += '<div class="card2"><p>最外殻の電子の数が 8（He は 2）で満たされ、電子を受け渡しする必要がないので、ふつうは結合しません。</p></div>';
  h += '<details class="rule"><summary>判定のしかた（目安）</summary><p>貴ガス → 結合しない。金属どうし → 金属結合。金属と非金属（半金属を含む）→ ΔEN が ' + P.T_IONIC + ' 以上でイオン結合、それより小さいと共有結合の性質もあるイオン結合。非金属どうし → ΔEN が ' + P.T_POLAR + ' より小さいと極性がほとんどない共有結合、' + P.T_POLAR + ' 以上は極性共有結合。結合の種類は連続的に変わるので、境目の値は目安です。</p></details>';
  out.innerHTML = h;
  const sel = $('selCharge');
  if (sel) sel.onchange = () => { state.qc = +sel.value; renderBond(); renderChips(); };
}

// ---- 全体の描き直し ----
const HINTS = {
  table: '元素をクリックして A・B に選ぶ（A → B → A … の順）。上の「見る量」で色分けする量を変えられます',
  graph: '点をクリックすると A・B に選べます。縦軸の量は上の「見る量」で変えられます',
  bond: '左の周期表で A と B を選ぶと、結合の種類を考えられます'};
function renderAll(){
  $('propName').textContent = P.PROPS[state.prop].short || P.PROPS[state.prop].label;
  document.querySelectorAll('#propList .mi').forEach(b => { const on = b.dataset.prop === state.prop; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  if (state.view !== 'graph' || true) renderLegend();
  for (const t of tables) updateTable(t);
  renderChips(); renderElem();
  if (state.view === 'graph') renderGraph();
  if (state.view === 'bond') renderBond();
  $('hint').textContent = HINTS[state.view];
}
function setView(v){
  if (!VIEWS.includes(v)) return;
  if (v === 'graph' && state.prop === 'cat') state.prop = 'en';
  state.view = v;
  document.querySelectorAll('#viewSeg button').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  $('vTable').hidden = v !== 'table'; $('vGraph').hidden = v !== 'graph'; $('vBond').hidden = v !== 'bond';
  save(); renderAll(); fitTable();
}
$('viewSeg').onclick = ev => { const b = ev.target.closest('[data-view]'); if (b) setView(b.dataset.view); };

// 見る量のメニュー
(function(){
  $('propList').innerHTML = P.PROP_ORDER.map(k => {
    const d = P.PROPS[k];
    return '<button type="button" class="mi" role="menuitemradio" data-prop="' + k + '"><span class="dot"></span><span>' + esc(d.label) + (d.unit ? '（' + d.unit + '）' : '') + '</span></button>';
  }).join('');
  $('propList').onclick = ev => {
    const b = ev.target.closest('[data-prop]'); if (!b) return;
    state.prop = b.dataset.prop; state.hlCat = null; save(); renderAll();
    const m = $('propMenu'); m.classList.add('closed'); setTimeout(() => m.classList.remove('closed'), 400);
    $('btnProp').focus();
  };
})();

// ---- 右のパネル ----
let openPane = '';
const narrow = () => matchMedia('(max-width:900px)').matches;
function openSide(p){
  openPane = openPane === p ? '' : p;
  $('sidePanel').classList.toggle('open', !!openPane);
  document.querySelectorAll('.side-pane').forEach(n => { n.hidden = n.id !== 'pane' + openPane.charAt(0).toUpperCase() + openPane.slice(1); });
  document.querySelectorAll('.side-tab').forEach(t => { t.classList.toggle('on', t.dataset.pane === openPane); t.setAttribute('aria-selected', String(t.dataset.pane === openPane)); });
  lsSet(KEY.side, openPane || 'none');
  onResize();
}
document.querySelectorAll('.side-tab').forEach(t => { t.onclick = () => openSide(t.dataset.pane); });
document.querySelectorAll('.side-close').forEach(b => { b.onclick = () => openSide(openPane); });
function setSideW(w){ w = Math.max(260, Math.min(560, w)); document.documentElement.style.setProperty('--side-w', w + 'px'); return w; }
$('sideResize').addEventListener('pointerdown', e => {
  const r = $('sideResize'); r.classList.add('drag'); r.setPointerCapture(e.pointerId);
  const mv = ev => { setSideW(innerWidth - ev.clientX - 26); };
  const up = () => { r.classList.remove('drag'); r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up);
    lsSet(KEY.sideW, String(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--side-w')) || 340)); onResize(); };
  r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up);
});

// ---- 設定 ----
const optMap = {optValue: 'showValue', optName: 'showName', optGroup: 'showGroup'};
for (const [id, k] of Object.entries(optMap)){ $(id).checked = state[k]; $(id).onchange = e => { state[k] = e.target.checked; save(); renderAll(); }; }

// ---- 上部のバーは文字を大きくしても 1 行に保つ（共通仕様 2.1） ----
function fitBar(){
  const bar = $('topBar');
  bar.classList.remove('tight', 'tighter', 'tightest');
  for (const c of ['tight', 'tighter', 'tightest']){
    if (bar.scrollWidth <= bar.clientWidth + 1) return;
    bar.classList.add(c);
  }
}
// 周期表は、見えている高さに全体が収まる大きさにする（広い画面で下が切れないように）
function fitTable(){
  const sc = document.querySelector('#vTable .tbl-scroll');
  if (!sc || $('vTable').hidden) return;
  const h = sc.clientHeight - 4;
  $('tblWrap').style.maxWidth = Math.max(600, Math.min(1500, Math.floor(h * 1.78))) + 'px';
}
function onResize(){
  fitBar();
  fitTable();
  document.documentElement.style.setProperty('--top-h', $('topBar').getBoundingClientRect().height + 'px');
  if (state.view === 'graph') renderGraph();
}
addEventListener('resize', onResize);
new ResizeObserver(() => { if (state.view === 'graph') renderGraph(); }).observe($('graphBody'));
new ResizeObserver(() => fitTable()).observe($('wrap'));

// ---- キーボード ----
let help = null;
document.addEventListener('keydown', e => {
  if (help && help.root.contains(e.target)) return;
  if (e.isComposing) return;
  const inField = e.target.matches && e.target.matches('input, textarea, select');
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!inField && !mod && e.key === '?'){ e.preventDefault(); $('btnHelp').click(); return; }
  if (e.key === 'Escape' && !inField && (state.a || state.b)){ clearSel(); }
});

// ---- 起動 ----
for (const b of document.querySelectorAll('button[title]')){
  if (b.getAttribute('aria-label') || b.textContent.trim()) continue;
  const t = b.getAttribute('title').split(/[（(：:]/)[0].trim(); if (t) b.setAttribute('aria-label', t);
}
if (hasUI) JohoUI.tooltip({keyboard: true, skip: n => n.closest('.tool-help')});
try { $('favicon').href = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString($('appIcon'))); } catch {}
try {
  help = JohoToolHelp.create({
    root: $('operation-help'), opener: $('btnHelp'), title: '周期表と結合の使い方', storageKey: KEY.help,
    bounds: () => ({top: $('topBar').getBoundingClientRect().bottom + 8, bottom: $('wrap').getBoundingClientRect().bottom - 8}),
    initialRight: () => $('wrap').getBoundingClientRect().right - 12,
    returnToEditor: () => { const c = document.querySelector('.cell[tabindex="0"]'); c && c.focus(); }
  });
} catch {   // ヘルプが読めなくても、周期表は使えるようにする
  $('operation-help').hidden = true;
  $('btnHelp').onclick = () => toast('使い方を読み込めませんでした（../shared/help-panel.js が必要です）');
}
let view = null;
function syncSetMenu(v){
  document.querySelectorAll('#themeSeg [data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === v.theme));
  document.querySelectorAll('#sizeSeg [data-size]').forEach(b => b.classList.toggle('on', b.dataset.size === v.textSize));
}
try {
  view = JohoUI.theme({storageKey: KEY.view, onChange: v => { syncSetMenu(v); renderAll(); onResize(); }});
  $('themeSeg').onclick = e => { const b = e.target.closest('[data-theme]'); if (b) view.set({theme: b.dataset.theme}); };
  $('sizeSeg').onclick = e => { const b = e.target.closest('[data-size]'); if (b) view.set({textSize: b.dataset.size}); };
} catch { document.querySelectorAll('#themeSeg, #sizeSeg').forEach(n => { n.previousElementSibling.hidden = true; n.hidden = true; }); }

buildTable($('ptable'), false);
buildTable($('bondTable'), true);
try { const w = +localStorage.getItem(KEY.sideW); if (w) setSideW(w); } catch {}
let savedPane = ''; try { savedPane = localStorage.getItem(KEY.side) || ''; } catch {}
setView(state.view);
if ((savedPane === 'elem' || (savedPane === '' && !narrow() && innerWidth > 1100)) && !narrow()) openSide('elem');
onResize();
if (!hasUI) setTimeout(() => alert('共通部品（../shared/ui-kit.js）を読み込めませんでした。ページを再読み込みしてください。'), 200);

// 検証用（最後まで読み込めたことの印にもする）
window.__periodic = {P, D, state, pick, setView, clearSel, renderAll, get tables(){ return tables; }};
})();
