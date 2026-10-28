// 中和滴定：画面の動き。計算は chem-titration.js、グラフは chem-chart.js。
// 設計は docs/titration-design.md。ビュレットとフラスコ（SVG）・滴定曲線（canvas）・計算の過程（近似と厳密の並べ表示）を連動させる。
(function () {
'use strict';
const $ = id => document.getElementById(id);
const S = ChemSim, CH = ChemChart, T = ChemTitration;
const hasUI = typeof JohoUI !== 'undefined';
const toast = (msg, ms) => { if (hasUI) JohoUI.toast(msg, ms); else console.log(msg); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const fmt = (v, n = 3) => S.sig(v, n);
const sdiff = d => Math.abs(d) < 0.005 ? '0.00' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(2);

const KEY = {state: 'joho.chem.titration.state', view: 'joho.chem.titration.view', help: 'joho.chem.titration.help.v1'};
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };

// ---- 状態（選んだ試料・変えた条件・設定。ブラウザに自動で保存する） ----
const SPEEDS = [0.5, 1, 2, 4];
const state = {sample: 'hcl', over: {}, inds: {}, cap: 25, speed: 1, approx: true, eq: true, band: true, detail: false};
let V = 0;                // いまの滴下量（mL）。保存しない
(function restore(){
  const s = lsGet(KEY.state); if (!s) return;
  if (T.sampleByKey(s.sample)) state.sample = s.sample;
  if (s.over && typeof s.over === 'object') state.over = s.over;
  if (s.inds && typeof s.inds === 'object') state.inds = s.inds;
  if (s.cap === 25 || s.cap === 50) state.cap = s.cap;
  if (SPEEDS.includes(s.speed)) state.speed = s.speed;
  for (const k of ['approx', 'eq', 'band', 'detail']) if (typeof s[k] === 'boolean') state[k] = s[k];
})();
const save = () => lsSet(KEY.state, state);

// ---- いまの系 ----
let sys = null, xmax = 20, cache = null, kp = [];
function overOf(key){
  const o = state.over[key] || {}, smp = T.sampleByKey(key), r = {};
  const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  if (num(o.C0, 1e-5, 2)) r.C0 = o.C0;
  if (num(o.V0, 1, 100)) r.V0 = o.V0;
  if (num(o.Ct, 1e-5, 2)) r.Ct = o.Ct;
  if (Array.isArray(o.pKa) && o.pKa.length === smp.n && o.pKa.every(v => num(v, -5, 16))) r.pKa = o.pKa.slice().sort((a, b) => a - b);
  return r;
}
function indOf(){ const k = state.inds[state.sample]; return T.INDICATORS.some(i => i.key === k) ? k : sys.ind; }
function rebuild(){
  const smp = T.sampleByKey(state.sample);
  sys = T.makeSys(smp, overOf(state.sample));
  xmax = Math.min(state.cap, sys.Vmax);
  V = Math.min(V, xmax);
  cache = {curve: T.curve(sys, xmax)};
  kp = T.keyPoints(sys, xmax);
}
const ind = () => T.indicatorByKey(indOf());

// ---- ビュレットとフラスコ（SVG） ----
const SVGNS = 'http://www.w3.org/2000/svg';
const BX1 = 118, BX2 = 148, BY0 = 40, BY1 = 300;     // ビュレットの管：左右の x と、目盛り 0 の y・下端の y
const yOf = v => BY0 + v / state.cap * (BY1 - BY0);
function buildApparatus(){
  const cap = state.cap, minor = cap <= 25 ? 0.5 : 1;
  let g = '';
  for (let v = 0; v <= cap + 1e-9; v += minor){
    const y = yOf(v), big = Math.abs(v / 5 - Math.round(v / 5)) < 1e-9, mid = !big && Math.abs(v - Math.round(v)) < 1e-9;
    const len = big ? 14 : mid ? 10 : 6;
    g += `<line class="tick" x1="${BX1}" x2="${BX1 + len}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"/>`;
    if (big) g += `<text class="tlab" x="${BX1 - 5}" y="${(y + 3.5).toFixed(2)}" text-anchor="end">${v}</text>`;
  }
  const flask = 'M118 380 V408 L74 468 Q70 476 80 476 H186 Q196 476 192 468 L148 408 V380';
  $('appWrap').innerHTML = `<svg viewBox="0 0 300 524" role="img" aria-labelledby="appT appD" preserveAspectRatio="xMidYMid meet">
  <title id="appT">ビュレットと三角フラスコ</title><desc id="appD">ビュレットの液面の目盛りと、三角フラスコの中の液の色</desc>
  <defs><clipPath id="fclip"><path d="${flask} Z"/></clipPath></defs>
  <text class="tlab" id="bName" x="133" y="16" text-anchor="middle" style="font-size:12px;font-weight:700"></text>
  <text class="tlab" x="133" y="31" text-anchor="middle" style="font-size:10px;fill:var(--muted)">mL</text>
  <rect id="bLiquid" x="${BX1 + 1}" y="${BY0}" width="${BX2 - BX1 - 2}" height="${BY1 - BY0}" fill="${T.WATER}" opacity=".85"/>
  <path id="bMenis" class="menis" d=""/>
  ${g}
  <path class="glass" d="M${BX1} 22 V${BY1} H${BX2} V22"/>
  <rect x="126" y="${BY1}" width="14" height="9" class="glass"/>
  <line x1="108" y1="${BY1 + 4.5}" x2="158" y2="${BY1 + 4.5}" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/>
  <path class="glass" d="M128.5 ${BY1 + 9} L137.5 ${BY1 + 9} L135 ${BY1 + 26} L131 ${BY1 + 26} Z"/>
  <g id="readMark"><path d="" fill="var(--accent)" id="readArrow"/><text class="readlab" id="readText" x="166" y="0"></text></g>
  <g id="dropG"><circle class="dropc" cx="133" cy="${BY1 + 34}" r="3"/></g>
  <g clip-path="url(#fclip)"><rect id="fLiquid" x="60" y="440" width="180" height="60" fill="${T.WATER}"/></g>
  <path class="glass" d="${flask}"/>
  <path class="glass" d="M112 380 H154"/>
  <text class="tlab" id="fName" x="133" y="498" text-anchor="middle" style="font-size:11px;fill:var(--muted)"></text>
  <text class="tlab" id="fInd" x="133" y="513" text-anchor="middle" style="font-size:11px;fill:var(--muted)"></text>
</svg>`;
}
function renderApparatus(ex){
  const svg = $('appWrap').firstElementChild; if (!svg) return;
  const y = yOf(V), el = id => svg.querySelector('#' + id);
  el('bLiquid').setAttribute('y', y.toFixed(2)); el('bLiquid').setAttribute('height', Math.max(0, BY1 - y).toFixed(2));
  el('bMenis').setAttribute('d', `M${BX1 + 1} ${(y - 2.2).toFixed(2)} Q${(BX1 + BX2) / 2} ${(y + 3).toFixed(2)} ${BX2 - 1} ${(y - 2.2).toFixed(2)}`);
  el('readArrow').setAttribute('d', `M${BX2 + 4} ${y.toFixed(2)} l10 -5 v10 z`);
  const rt = el('readText'); rt.setAttribute('y', (y + 4).toFixed(2)); rt.textContent = V.toFixed(2);
  const vt = sys.V0 + V, q = Math.min(1, vt / (sys.V0 + state.cap)), h = 30 + 36 * q;
  el('fLiquid').setAttribute('y', (476 - h).toFixed(2)); el('fLiquid').setAttribute('fill', T.indicatorColor(ind(), ex.pH));
  el('bName').textContent = `${sys.titrant.name} ${fmt(sys.Ct)} mol/L`;
  el('fName').textContent = `${sys.name.split(' ')[0]} ${fmt(sys.C0)} mol/L ${sys.V0} mL`;
  el('fInd').textContent = ind().lo != null ? '指示薬：' + ind().name : '';
  svg.classList.toggle('dripping', running);
  svg.querySelector('#dropG').style.display = running ? '' : 'none';
}

// ---- グラフ ----
let plotInfo = null;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawChart(ex){
  const cv = $('chartCv'), {ctx, w, h} = CH.fitCanvas(cv);
  const C = {bg: css('--panel') || '#fff', text: css('--text') || '#1f2933', muted: css('--muted') || '#6b7480', grid: css('--line') || '#e5e8ec', axis: css('--muted') || '#9aa3ad'};
  const accent = css('--accent') || '#2563eb', apC = css('--ap') || '#d97706', danger = css('--danger') || '#d61f1f';
  const hl = [], vl = [];
  if (state.eq){
    sys.Veq.forEach(v => { if (v <= xmax) vl.push({x: v, color: C.muted, dash: [5, 4], width: 1.1}); });
    if (sys.n > 0) sys.pKa.forEach(pk => { if (pk > 0.2 && pk < 13.8) hl.push({y: pk, color: C.muted, dash: [2, 4], width: 1, label: 'pKa ' + pk}); });
    hl.push({y: 7, color: C.grid, dash: [2, 3], width: 1});
  }
  const series = [{color: accent, pts: cache.curve.exact, width: 2.6}];
  if (state.approx) series.push({color: apC, pts: cache.curve.approx, width: 2, dash: [6, 4]});
  const r = CH.lineChart(ctx, {x: 0, y: 0, w, h}, {x: {min: 0, max: xmax, label: '滴下量（mL）', n: 8}, y: {min: 0, max: 14, label: 'pH', n: 7}, colors: C, series, hlines: hl, vlines: vl});
  plotInfo = r;
  ctx.save();
  ctx.font = '600 11px -apple-system, "Hiragino Sans", sans-serif'; ctx.textBaseline = 'top';
  if (state.eq){
    sys.Veq.forEach((v, i) => { if (v > xmax) return; const t = (sys.Veq.length > 1 ? `第 ${i + 1} 当量点 ` : '当量点 ') + fmt(v, 3) + ' mL', x = r.X(v);
      ctx.fillStyle = C.bg; ctx.globalAlpha = .85; const tw = ctx.measureText(t).width; const tx = x + 4 + tw > r.plot.x + r.plot.w ? x - 4 - tw : x + 4;
      ctx.fillRect(tx - 2, r.plot.y + 3 + i * 15, tw + 4, 14); ctx.globalAlpha = 1; ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(t, tx, r.plot.y + 4 + i * 15); });
  }
  const id = ind();
  if (state.band && id.lo != null){
    const y0 = r.Y(id.hi), y1 = r.Y(id.lo), gr = ctx.createLinearGradient(0, y1, 0, y0);
    gr.addColorStop(0, id.acid === T.WATER ? '#9ec5e8' : id.acid); gr.addColorStop(1, id.base);
    ctx.globalAlpha = .28; ctx.fillStyle = gr; ctx.fillRect(r.plot.x, y0, r.plot.w, y1 - y0); ctx.globalAlpha = 1;
    ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`${id.name} ${id.lo}–${id.hi}`, r.plot.x + r.plot.w - 4, (y0 + y1) / 2 + (y1 - y0 < 16 ? 12 : 0));
  }
  // いまの点
  const ap = T.approx(sys, V).pH;
  if (state.approx){ ctx.strokeStyle = apC; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.X(V), r.Y(Math.max(0, Math.min(14, ap))), 6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = danger; ctx.strokeStyle = C.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.X(V), r.Y(ex.pH), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  $('chartLegend').innerHTML = '<span><i></i>厳密な計算</span>' + (state.approx ? '<span><i class="ap"></i>近似の計算</span>' : '') + '<span><i class="pt"></i>いまの点</span>';
}

// ---- 計算の過程 ----
const WHY = {
  strong: '水の電離（[H⁺] = [OH⁻] = 10⁻⁷ mol/L）を無視した近似です。濃度が薄い、または当量点のごく近くでは、無視できなくなります。',
  weak: '弱酸の電離はごくわずかとみなし、C − [H⁺] ≒ C とした近似です。電離する割合が大きい（濃度が薄い・Ka が大きい）と、ずれます。',
  hydrolysis: '塩の加水分解で生じる OH⁻ だけを考えた近似です。',
  amphoteric: 'この形が出入りする 2 つの電離だけを考えた近似です。ほかの電離や水の電離が重なると、ずれます。',
  buffer: '酸と塩の量が、反応や電離で変わらないとみなした近似です。どちらかが少ないとき（滴下の最初や当量点の直前）は、H⁺・OH⁻ の量が無視できず、ずれます。',
  eq: '過不足なく中和した点です。'
};
function speciesTable(ex){
  const sp = ex.species.filter(s => s.conc > 0);
  const mx = Math.max(...sp.map(s => s.conc));
  const rows = sp.filter(s => s.conc > mx * 1e-9).sort((a, b) => b.conc - a.conc).slice(0, 8);
  return '<table><thead><tr><th>イオン・分子</th><th>濃度 (mol/L)</th></tr></thead><tbody>' +
    rows.map(s => `<tr><td>${esc(s.name)}</td><td>${fmt(s.conc)}</td></tr>`).join('') + '</tbody></table>';
}
function renderProcess(ex, ap){
  const exl = T.exactLines(sys, V), diff = ap.pH - ex.pH, q = T.quality(diff);
  $('procHead').textContent = `滴下量 ${V.toFixed(2)} mL・${ap.label}`;
  $('colA').className = 'pcol ap';
  $('colA').innerHTML = `<h4>近似の計算<span class="tag">教科書の式</span></h4><ol>${ap.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>`;
  $('colE').className = 'pcol ex';
  $('colE').innerHTML = `<h4>厳密な計算<span class="tag">電荷のつり合いを解く</span></h4><ol>${exl.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>
    <p class="sub">そのときの濃度（大きい順）</p>${speciesTable(ex)}`;
  // 見出しの下に結果を置く
  $('colA').insertAdjacentHTML('beforeend', `<p class="res">pH ≒ ${ap.pH.toFixed(2)}</p>`);
  $('colE').insertAdjacentHTML('beforeend', `<p class="res">pH = ${ex.pH.toFixed(2)}</p>`);
  const why = q.level === 'good' ? '近似の条件が成り立っている点です。' : (WHY[ap.role] || '');
  $('cmpBar').innerHTML = `<span>近似 <b>${ap.pH.toFixed(2)}</b></span><span>厳密 <b>${ex.pH.toFixed(2)}</b></span><span>差 <b>${sdiff(diff)}</b></span>
    <span class="q ${q.level}">${q.text}</span><span class="mut">${esc(why)}</span>`;
}
function renderKp(){
  const tb = $('kpTable');
  if (!tb.dataset.key || tb.dataset.key !== state.sample + '|' + JSON.stringify(overOf(state.sample)) + '|' + state.cap){
    tb.dataset.key = state.sample + '|' + JSON.stringify(overOf(state.sample)) + '|' + state.cap;
    tb.innerHTML = '<thead><tr><th>場面</th><th>滴下量 (mL)</th><th>近似</th><th>厳密</th><th>差</th><th>判定</th></tr></thead><tbody>' +
      kp.map((p, i) => `<tr tabindex="0" data-i="${i}" title="クリックすると、この滴下量に移ります"><td>${esc(p.label)}</td><td>${p.V.toFixed(p.V < 1 ? 3 : 2)}</td><td>${p.approx.toFixed(2)}</td><td>${p.exact.toFixed(2)}</td>
        <td>${sdiff(p.diff)}</td><td><span class="q ${p.q.level}">${p.q.text}</span></td></tr>`).join('') + '</tbody>';
  }
  tb.querySelectorAll('tbody tr').forEach(tr => tr.classList.toggle('cur', Math.abs(kp[+tr.dataset.i].V - V) < 0.0005));
}

// ---- 描きなおし ----
function renderAll(){
  const ex = T.solveExact(sys, V), ap = T.approx(sys, V);
  renderApparatus(ex); drawChart(ex); renderProcess(ex, ap); renderKp();
  $('seek').value = V;
  $('evRead').textContent = `目盛り ${V.toFixed(2)} mL`;
  $('chipPH').textContent = `pH ${ex.pH.toFixed(2)}`;
  const id = ind();
  $('chipV').innerHTML = `滴下量 ${V.toFixed(2)} mL` + (id.lo != null ? ` <span class="swatch" style="background:${T.indicatorColor(id, ex.pH)}"></span>${esc(id.name)}` : '');
  const nearEq = sys.Veq.findIndex(v => Math.abs(V - v) < 0.0005);
  $('status').textContent = nearEq >= 0 ? (sys.Veq.length > 1 ? `第 ${nearEq + 1} 当量点です` : '当量点です') : (Math.abs(V - xmax) < 1e-9 ? 'グラフの終わりまで滴下しました' : '');
}
function renderStatic(){
  const smp = T.sampleByKey(state.sample);
  $('smpName').textContent = smp.name;
  $('smpNote').textContent = smp.note + (sys.Veq[0] > state.cap ? '（当量点がビュレットの容量を超えます。濃度や体積を変えてください）' : '');
  $('eqn').innerHTML = `${esc(sys.name)} <span class="arr">←</span> ${esc(sys.titrant.name)}`;
  document.querySelectorAll('#smpList .mi').forEach(b => b.classList.toggle('on', b.dataset.key === state.sample));
  document.querySelectorAll('#capSeg [data-cap]').forEach(b => { const on = +b.dataset.cap === state.cap; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('optApprox').checked = state.approx; $('optEq').checked = state.eq; $('optBand').checked = state.band;
  $('seek').max = xmax; $('seek').setAttribute('aria-valuetext', '');
  $('spdSel').value = String(state.speed);
  const o = overOf(state.sample);
  $('inC0').value = o.C0 ?? smp.C0; $('inV0').value = o.V0 ?? smp.V0; $('inCt').value = o.Ct ?? smp.Ct;
  $('lbCt').firstChild.textContent = `${sys.titrant.name} の濃度 `;
  const pk = $('pkaBox');
  pk.hidden = smp.n === 0;
  pk.innerHTML = smp.n === 0 ? '' : '<span>pKa（電離のしやすさ。小さいほど強い酸）</span><div class="pk">' +
    sys.pKa.map((v, i) => `<label>${smp.n === 1 ? (smp.kind === 'base' ? 'NH₄⁺ の pKa' : 'pKa') : 'pKa' + '₁₂₃'[i]}<input type="number" step="any" min="-5" max="16" data-pk="${i}" value="${v}" aria-label="pKa ${i + 1}"></label>`).join('') + '</div>';
  const sel = $('selInd');
  sel.innerHTML = T.INDICATORS.map(i => `<option value="${i.key}">${esc(i.name)}${i.lo != null ? `（${i.lo}–${i.hi}）` : ''}</option>`).join('');
  sel.value = indOf();
  $('btnDetail').setAttribute('aria-expanded', state.detail); $('detail').hidden = !state.detail;
  $('btnDetail').textContent = state.detail ? '詳しい設定 ▲' : '詳しい設定 ▼';
  // 目印の滴下量へ移るボタン
  const jb = [];
  sys.Veq.forEach((v, i) => jb.push({v, t: (sys.Veq.length > 1 ? `第 ${i + 1} 当量点` : '当量点') + ` ${fmt(v, 3)} mL`}));
  if (sys.n > 0) sys.Veq.forEach((v, i) => jb.push({v: v - sys.N0 / sys.Ct / 2, t: '半当量点' + (sys.Veq.length > 1 ? `（第 ${i + 1} 段）` : '')}));
  jb.sort((a, b) => a.v - b.v);
  $('jumpBox').innerHTML = jb.filter(b => b.v <= xmax + 1e-9).map(b => `<button type="button" data-v="${b.v}">${esc(b.t)}</button>`).join('');
  $('kpTable').dataset.key = '';
}

// ---- 滴下の操作 ----
let running = false, raf = 0, last = 0;
function setV(v, stop = true){
  if (stop && running) setRunning(false);
  V = Math.max(0, Math.min(xmax, Math.round(v * 1e6) / 1e6));
  renderAll();
}
function setRunning(on){
  if (on && V >= xmax - 1e-9){ V = 0; }
  running = on;
  $('btnRun').classList.toggle('on', on); $('btnRun').setAttribute('aria-pressed', on); $('btnRun').setAttribute('aria-label', on ? '止める' : '滴下する');
  cancelAnimationFrame(raf);
  if (on){ last = performance.now(); raf = requestAnimationFrame(step); }
  renderAll();
}
function step(now){
  if (!running) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  V = Math.min(xmax, V + dt * state.speed);
  if (V >= xmax - 1e-9){ running = false; $('btnRun').classList.remove('on'); $('btnRun').setAttribute('aria-pressed', false); $('btnRun').setAttribute('aria-label', '滴下する'); renderAll(); return; }
  renderAll();
  raf = requestAnimationFrame(step);
}
$('btnRun').onclick = () => setRunning(!running);
$('btnDrop').onclick = () => setV(V + 0.05);
$('btnReset').onclick = () => setV(0);
$('seek').oninput = e => setV(+e.target.value);
$('spdSel').onchange = e => { state.speed = +e.target.value; save(); };
$('jumpBox').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) setV(+b.dataset.v); };
$('kpTable').onclick = e => { const tr = e.target.closest('tbody tr'); if (tr) setV(kp[+tr.dataset.i].V); };
$('kpTable').onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ const tr = e.target.closest('tbody tr'); if (tr){ e.preventDefault(); setV(kp[+tr.dataset.i].V); } } };
// グラフ：クリック・ドラッグで滴下量を動かす
(function(){
  const cv = $('chartCv'); let drag = false;
  const at = e => { if (!plotInfo) return; const rc = cv.getBoundingClientRect(), p = plotInfo.plot; setV((e.clientX - rc.left - p.x) / p.w * xmax); };
  cv.addEventListener('pointerdown', e => { drag = true; try { cv.setPointerCapture(e.pointerId); } catch {} at(e); });
  cv.addEventListener('pointermove', e => { if (drag) at(e); });
  const end = e => { drag = false; try { cv.releasePointerCapture(e.pointerId); } catch {} };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
})();

// ---- 試料・設定 ----
function buildSampleMenu(){
  let html = '', grp = '';
  for (const s of T.SAMPLES){
    if (s.group !== grp){ grp = s.group; html += `<div class="gl">${esc(grp)}</div>`; }
    html += `<button type="button" class="mi" role="menuitem" data-key="${s.key}"><span class="dot"></span><span>${esc(s.name)}<small>${esc(s.note)}</small></span></button>`;
  }
  $('smpList').innerHTML = html;
}
function selectSample(key){
  state.sample = key; V = 0; running = false; $('btnRun').classList.remove('on');
  rebuild(); renderStatic(); save(); renderAll();
  const m = $('smpMenu'); m.classList.add('closed'); setTimeout(() => m.classList.remove('closed'), 400);
}
$('smpList').onclick = e => { const b = e.target.closest('.mi'); if (b) selectSample(b.dataset.key); };
function setOver(patch){
  const o = Object.assign({}, state.over[state.sample] || {}, patch);
  state.over[state.sample] = o; V = 0;
  rebuild(); renderStatic(); save(); renderAll();
}
const numIn = (id, key, lo, hi, name) => $(id).onchange = e => {
  const v = parseFloat(e.target.value);
  if (!(v >= lo && v <= hi)){ toast(`${name}は ${lo} 〜 ${hi} の間で入れてください`); e.target.value = overOf(state.sample)[key] ?? T.sampleByKey(state.sample)[key]; return; }
  setOver({[key]: v});
};
numIn('inC0', 'C0', 1e-5, 2, '濃度'); numIn('inV0', 'V0', 1, 100, '体積'); numIn('inCt', 'Ct', 1e-5, 2, '濃度');
$('pkaBox').onchange = e => {
  if (!e.target.matches('[data-pk]')) return;
  const arr = Array.from($('pkaBox').querySelectorAll('[data-pk]')).map(i => parseFloat(i.value));
  if (!arr.every(v => v >= -5 && v <= 16)){ toast('pKa は −5 〜 16 の間で入れてください'); renderStatic(); return; }
  setOver({pKa: arr});
};
$('capSeg').onclick = e => { const b = e.target.closest('[data-cap]'); if (!b) return; state.cap = +b.dataset.cap; rebuild(); buildApparatus(); renderStatic(); save(); renderAll(); };
$('selInd').onchange = e => { state.inds[state.sample] = e.target.value; save(); renderAll(); };
$('btnDefault').onclick = () => { delete state.over[state.sample]; delete state.inds[state.sample]; V = 0; rebuild(); renderStatic(); save(); renderAll(); };
$('btnDetail').onclick = () => { state.detail = !state.detail; renderStatic(); save(); };
for (const [id, k] of [['optApprox', 'approx'], ['optEq', 'eq'], ['optBand', 'band']]) $(id).onchange = e => { state[k] = e.target.checked; save(); renderAll(); };

// ---- 上部バー・キーボード ----
function fitBar(){
  const bar = $('topBar');
  bar.classList.remove('tight', 'tighter', 'tightest');
  for (const c of ['tight', 'tighter', 'tightest']){ if (bar.scrollWidth <= bar.clientWidth + 1) return; bar.classList.add(c); }
}
function onResize(){ fitBar(); if (sys) renderAll(); }
addEventListener('resize', onResize);
new ResizeObserver(() => { if (sys) renderAll(); }).observe($('chartWrap'));
let help = null;
document.addEventListener('keydown', e => {
  if (help && help.root.contains(e.target)) return;
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  const tgt = e.target.matches ? e.target : document.body;
  if (tgt.matches('input:not([type=range]), textarea, select')) return;
  if (e.key === '?'){ e.preventDefault(); $('btnHelp').click(); return; }
  if (e.key === ' ' && !tgt.matches('button, a, summary, input, tr')){ e.preventDefault(); setRunning(!running); return; }
  if ((e.key === 'r' || e.key === 'R') && !tgt.matches('input')){ e.preventDefault(); setV(0); }
  if (e.key === 'ArrowRight' && !tgt.matches('input, tr')){ e.preventDefault(); setV(V + (e.shiftKey ? 1 : 0.05)); }
  if (e.key === 'ArrowLeft' && !tgt.matches('input, tr')){ e.preventDefault(); setV(V - (e.shiftKey ? 1 : 0.05)); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && running) setRunning(false); });

// ---- 起動 ----
for (const b of document.querySelectorAll('button[title]')){
  if (b.getAttribute('aria-label') || b.textContent.trim()) continue;
  const t = b.getAttribute('title').split(/[（(：:]/)[0].trim(); if (t) b.setAttribute('aria-label', t);
}
if (hasUI) JohoUI.tooltip({keyboard: true, skip: n => n.closest('.tool-help')});
try { $('favicon').href = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString($('appIcon'))); } catch {}
try {
  help = JohoToolHelp.create({
    root: $('operation-help'), opener: $('btnHelp'), title: '中和滴定の使い方', storageKey: KEY.help,
    bounds: () => ({top: $('topBar').getBoundingClientRect().bottom + 8, bottom: $('wrap').getBoundingClientRect().bottom - 8}),
    initialRight: () => $('wrap').getBoundingClientRect().right - 12,
    returnToEditor: () => $('btnRun').focus()
  });
} catch {
  $('operation-help').hidden = true;
  $('btnHelp').onclick = () => toast('使い方を読み込めませんでした（../shared/help-panel.js が必要です）');
}
function syncSetMenu(v){
  document.querySelectorAll('#themeSeg [data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === v.theme));
  document.querySelectorAll('#sizeSeg [data-size]').forEach(b => b.classList.toggle('on', b.dataset.size === v.textSize));
}
try {
  const view = JohoUI.theme({storageKey: KEY.view, onChange: v => { syncSetMenu(v); if (sys){ renderAll(); } onResize(); }});
  $('themeSeg').onclick = e => { const b = e.target.closest('[data-theme]'); if (b) view.set({theme: b.dataset.theme}); };
  $('sizeSeg').onclick = e => { const b = e.target.closest('[data-size]'); if (b) view.set({textSize: b.dataset.size}); };
} catch { document.querySelectorAll('#themeSeg, #sizeSeg').forEach(n => { n.previousElementSibling.hidden = true; n.hidden = true; }); }

buildSampleMenu();
rebuild();
buildApparatus();
renderStatic();
onResize();
renderAll();
if (!hasUI) setTimeout(() => alert('共通部品（../shared/ui-kit.js）を読み込めませんでした。ページを再読み込みしてください。'), 200);

// 検証用（最後まで読み込めたことの印にもする）
window.__titration = {T, state, get sys(){ return sys; }, get V(){ return V; }, get xmax(){ return xmax; }, get kp(){ return kp; }, setV, setRunning, selectSample, renderAll, get plot(){ return plotInfo; }};
})();
