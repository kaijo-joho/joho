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
const TABS = ['main', 'buf', 'unk'];
const state = {tab: 'main', sample: 'hcl', over: {}, inds: {}, cap: 25, speed: 1, approx: true, eq: true, band: true, buf: true, reveal: false, detail: false,
  custom: {kind: 'acid', n: 1}, compare: [], titKey: null, customT: {n: 1}, unkSeed: 1, unkKey: 'vinegar', prevSample: null, unkReveal: false};
const CMP_COLORS = ['#8b5cf6', '#0d9488', '#be185d', '#65a30d', '#0891b2'];
const MAX_CMP = 5;
const hideCmp = new Set();   // 凡例で隠した比較対象の id（画面だけの状態で、保存しない）
const PKA_TOL = 0.2;      // ふつうの種類の pKa は、標準の値から ±0.2 まで調整できる（自作は自由）
let pkaEdit = false;      // pKa の調整中（ボタンを押したときだけ true。保存しない）
let cmpSeq = 0;          // 比較対象の通し番号（同じ種類を複数入れられるので、種類ではなく番号で区別する）
const GHOST_COLORS = ['#8b5cf6', '#0d9488', '#be185d'];
let ghosts = [];          // 残した曲線（保存しない）
let V = 0;                // いまの滴下量（mL）。保存しない
function getSample(key){ return key === 'custom' ? T.customSample(state.custom) : T.sampleByKey(key); }
(function restore(){
  const s = lsGet(KEY.state); if (!s) return;
  if (TABS.includes(s.tab)) state.tab = s.tab;
  if (s.tab === 'ind' || s.tab === 'read') state.tab = 'main';
  if (T.sampleByKey(s.sample)) state.sample = s.sample;
  if (s.over && typeof s.over === 'object') state.over = s.over;
  if (s.inds && typeof s.inds === 'object') state.inds = s.inds;
  if (s.cap === 25 || s.cap === 50) state.cap = s.cap;
  for (const k of ['unkSeed']) if (Number.isInteger(s[k]) && s[k] > 0) state[k] = s[k];
  if (typeof s.prevSample === 'string' && T.sampleByKey(s.prevSample) && !T.sampleByKey(s.prevSample).unknown) state.prevSample = s.prevSample;
  if (typeof s.unkKey === 'string' && T.sampleByKey(s.unkKey) && T.sampleByKey(s.unkKey).unknown) state.unkKey = s.unkKey;
  if (typeof s.unkReveal === 'boolean') state.unkReveal = s.unkReveal;
  if (Array.isArray(s.compare)) state.compare = s.compare.map(e => typeof e === 'string' ? {key: e} : e)
    .filter(e => e && typeof e.key === 'string' && e.key !== 'vinegar' && e.key !== 'custom' && T.sampleByKey(e.key))
    .map(e => { const r = {id: ++cmpSeq, key: e.key}; const ok = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; if (ok(e.C0, 1e-5, 2)) r.C0 = e.C0; if (ok(e.V0, 1, 100)) r.V0 = e.V0; return r; }).slice(0, MAX_CMP);
  if (typeof s.titKey === 'string' && (s.titKey === 'custom' || T.TITRANTS.some(t => t.key === s.titKey))) state.titKey = s.titKey;
  if (s.customT && [1, 2, 3].includes(s.customT.n)) state.customT = {n: s.customT.n};
  if (s.custom && (s.custom.kind === 'acid' || s.custom.kind === 'base') && [1, 2, 3].includes(s.custom.n)) state.custom = {kind: s.custom.kind, n: s.custom.n};
  if (SPEEDS.includes(s.speed)) state.speed = s.speed;
  for (const k of ['approx', 'eq', 'band', 'buf', 'reveal', 'detail']) if (typeof s[k] === 'boolean') state[k] = s[k];
})();
const save = () => lsSet(KEY.state, state);

// ---- いまの系 ----
let sys = null, xmax = 20, chartX = 20, cache = null, kp = [], indRep = [];
// 試料に合う滴下液（酸を中和するのは塩基、塩基を中和するのは酸）。選んでいない・合わないときは、試料の標準の滴下液
function titrantFor(smp, key){
  const opp = smp.kind === 'acid' ? 'base' : 'acid';
  const t = key ? T.titrantByKey(key, state.customT.n, opp) : null;
  return t && t.type === opp && !smp.unknown ? t : T.titrantByKey(smp.titrant);
}
const curTitrant = () => titrantFor(getSample(state.sample), state.titKey);
function overOf(key, tt){
  const o = state.over[key] || {}, smp = getSample(key), r = {}, t = tt || (key === state.sample ? curTitrant() : titrantFor(smp, null));
  const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  if (num(o.C0, 1e-5, 2)) r.C0 = o.C0;
  if (smp.unknown) r.C0 = T.unknownConc(state.unkSeed);
  if (num(o.V0, 1, 100)) r.V0 = o.V0;
  if (num(o.Ct, 1e-5, 2)) r.Ct = o.Ct;
  if (t.key === 'custom' && Array.isArray(o.tpKa) && o.tpKa.length === t.n && o.tpKa.every(v => num(v, -5, 16))) r.tpKa = o.tpKa.slice().sort((a, b) => a - b);
  if (Array.isArray(o.pKa) && o.pKa.length === smp.n && o.pKa.every((v, i) => num(v, -5, 16) && (key === 'custom' || Math.abs(v - smp.pKa[i]) <= PKA_TOL + 1e-9))) r.pKa = o.pKa.slice().sort((a, b) => a - b);
  return r;
}
// 指示薬は複数選べる（保存は種類ごとの配列。旧版の文字列は 1 件の配列とみなす）。未選択のときは試料の標準の指示薬
const IND_SHORT = {mo: 'MO', mr: 'MR', bt: 'BTB', pp: 'PP'};
function indsOf(){
  const v = state.inds[state.sample], arr = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [sys.ind];
  return T.INDICATORS.filter(i => i.lo != null && arr.includes(i.key));
}
function setInds(arr){ state.inds[state.sample] = arr; save(); renderStatic(); renderAll(); }
// 重ねて比べられる試料：いまの滴下液で滴定できる種類（酸には塩基、塩基には酸）で、濃度が未知でないもの
function canCompare(k){ if (k === 'custom') return false; const sm = getSample(k); return !!sm && !sm.unknown && sm.kind === (sys.titrant.type === 'base' ? 'acid' : 'base'); }
function rebuild(){
  const smp = getSample(state.sample);
  const tNow = curTitrant();
  sys = T.makeSys(smp, overOf(state.sample, tNow), tNow);
  xmax = Math.min(state.cap, sys.Vmax);
  V = Math.min(V, xmax);
  // 同じ滴下液で滴定する別の試料を重ねて比べる：横軸は、比べるものの最大に合わせる（ビュレットの容量まで）
  const cmpSys = state.compare.filter(e => canCompare(e.key))
    .map((e, i) => { const o = {Ct: sys.Ct, tpKa: sys.titrant.pKa.slice()}; if (e.C0 != null) o.C0 = e.C0; if (e.V0 != null) o.V0 = e.V0;
      return {id: e.id, key: e.key, sys: T.makeSys(getSample(e.key), o, tNow), color: CMP_COLORS[i % CMP_COLORS.length]}; });
  chartX = Math.min(state.cap, Math.max(sys.Vmax, ...cmpSys.map(c => c.sys.Vmax)));
  xmax = chartX; V = Math.min(V, xmax);
  cache = {curve: T.curve(sys, chartX), cmp: cmpSys.map(c => ({id: c.id, key: c.key, label: `${c.sys.name.split(' ')[0]} ${fmt(c.sys.C0)} mol/L`, color: c.color, pts: T.curve(c.sys, chartX).exact}))};
  kp = T.keyPoints(sys, xmax);
  indRep = T.indicatorReport(sys, xmax);
  alphaSeries = sys.n > 0 ? T.alphaCurve(sys, xmax) : [];
  alphaPh = sys.n > 0 ? T.alphaVsPH(sys) : [];
}
const hideAns = () => !!sys && sys.unknown && !state.unkReveal;     // 食酢の滴定：濃度・当量点は答え合わせまで隠す
let alphaSeries = [], alphaPh = [];

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
  <g clip-path="url(#fclip)" id="fLiqG"></g>
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
  const inds = indsOf(), liq = el('fLiqG'), cols = inds.length ? inds.map(i => T.indicatorColor(i, ex.pH)) : [T.WATER], wd = 126 / cols.length;
  if (liq.childElementCount !== cols.length){ liq.innerHTML = cols.map(() => `<rect y="440" height="60" x="0" width="0"/>`).join(''); }
  Array.from(liq.children).forEach((r, i) => { r.setAttribute('x', (70 + i * wd).toFixed(2)); r.setAttribute('width', (wd + .5).toFixed(2)); r.setAttribute('y', (476 - h).toFixed(2)); r.setAttribute('fill', cols[i]); });
  el('bName').textContent = `${sys.titrant.name} ${fmt(sys.Ct)} mol/L`;
  el('fName').textContent = `${sys.name.split(' ')[0]} ${hideAns() ? '（濃度は未知）' : fmt(sys.C0) + ' mol/L'} ${sys.V0} mL`;
  el('fInd').textContent = inds.length ? '指示薬：' + inds.map(i => IND_SHORT[i.key]).join('・') : '';
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
  const showEq = state.eq && !hideAns();
  if (showEq){
    sys.Veq.forEach(v => { if (v <= xmax) vl.push({x: v, color: C.muted, dash: [5, 4], width: 1.1}); });
    if (sys.n > 0) sys.pKa.forEach(pk => { if (!hideAns() && pk > 0.2 && pk < 13.8) hl.push({y: pk, color: C.muted, dash: [2, 4], width: 1, label: 'pKa ' + pk}); });
    hl.push({y: 7, color: C.grid, dash: [2, 3], width: 1});
    if (sys.pI != null && !hideAns()) hl.push({y: sys.pI, color: css('--ok') || '#16803c', dash: [6, 3], width: 1.3, label: '等電点 pI ' + sys.pI.toFixed(2)});
  }
  const series = ghosts.map(g => ({color: g.color, pts: g.pts, width: 2, dash: [2, 4]}));
  cache.cmp.forEach(c => { if (!hideCmp.has(c.id)) series.push({color: c.color, pts: c.pts, width: 2.2}); });
  series.push({color: accent, pts: cache.curve.exact, width: 2.6});
  if (state.approx && sys.approxOK) series.push({color: apC, pts: cache.curve.approx, width: 2, dash: [6, 4]});
  const r = CH.lineChart(ctx, {x: 0, y: 0, w, h}, {x: {min: 0, max: xmax, label: '滴下量（mL）', n: 8}, y: {min: 0, max: 14, label: 'pH', n: 7}, colors: C, series, hlines: hl, vlines: vl});
  plotInfo = r;
  ctx.save();
  ctx.font = '600 11px -apple-system, "Hiragino Sans", sans-serif'; ctx.textBaseline = 'top';
  if (showEq){
    sys.Veq.forEach((v, i) => { if (v > xmax) return; const t = (sys.Veq.length > 1 ? `第 ${i + 1} 当量点 ` : '当量点 ') + fmt(v, 3) + ' mL', x = r.X(v);
      ctx.fillStyle = C.bg; ctx.globalAlpha = .85; const tw = ctx.measureText(t).width; const tx = x + 4 + tw > r.plot.x + r.plot.w ? x - 4 - tw : x + 4;
      ctx.fillRect(tx - 2, r.plot.y + 3 + i * 15, tw + 4, 14); ctx.globalAlpha = 1; ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(t, tx, r.plot.y + 4 + i * 15); });
  }
  if (state.tab === 'buf' && state.buf && sys.n > 0){
    ctx.globalAlpha = .12; ctx.fillStyle = css('--ok') || '#16803c';
    for (const pk of sys.pKa){ const a = r.Y(Math.min(14, pk + 1)), b = r.Y(Math.max(0, pk - 1)); if (pk > -1 && pk < 15) ctx.fillRect(r.plot.x, a, r.plot.w, b - a); }
    ctx.globalAlpha = 1;
  }
  if (state.band && state.tab !== 'buf') for (const id of indsOf()){
    const y0 = r.Y(id.hi), y1 = r.Y(id.lo), gr = ctx.createLinearGradient(0, y1, 0, y0);
    gr.addColorStop(0, id.acid === T.WATER ? '#9ec5e8' : id.acid); gr.addColorStop(1, id.base);
    ctx.globalAlpha = .28; ctx.fillStyle = gr; ctx.fillRect(r.plot.x, y0, r.plot.w, y1 - y0); ctx.globalAlpha = 1;
    ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`${id.name} ${id.lo}–${id.hi}`, r.plot.x + r.plot.w - 4, (y0 + y1) / 2 + (y1 - y0 < 16 ? 12 : 0));
  }
  // いまの点
  const ap = T.approx(sys, V).pH;
  if (state.approx && sys.approxOK && ap != null){ ctx.strokeStyle = apC; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.X(V), r.Y(Math.max(0, Math.min(14, ap))), 6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = danger; ctx.strokeStyle = C.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.X(V), r.Y(ex.pH), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  const tg = (on, inner, attr) => `<button type="button" class="lg-tgl" aria-pressed="${on}" ${attr}>${inner}</button>`;
  const ownName = esc(sys.name.split(' ')[0]);
  $('chartLegend').innerHTML = (cache.cmp.length ? `<span class="lg-cur"><i></i><b>${ownName}</b></span>` : '<span class="lg-cur"><i></i><b>厳密な計算</b></span>')
    + cache.cmp.map(c => tg(!hideCmp.has(c.id), `<i style="border-top-color:${c.color}"></i>${esc(c.label)}`, `data-cmp="${c.id}" title="${esc(c.label)}の曲線を出す／隠す"`)).join('')
    + (sys.approxOK ? tg(state.approx, '<i class="ap"></i>近似の計算', 'data-ap="1" title="近似の計算の曲線（点線）を出す／隠す"') : '<span class="lg-off" title="滴下液が弱い酸・塩基のときは、教科書の近似式がないため、近似の曲線は出せません"><i class="ap"></i>近似の計算（なし）</span>')
    + ghosts.map(g => `<span style="color:${g.color}"><i class="gh"></i>${esc(g.label)}</span>`).join('') + '<span><i class="pt"></i>いまの点</span>';
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
  const exl = T.exactLines(sys, V), na = ap.pH == null, diff = na ? null : ap.pH - ex.pH, q = T.quality(diff);
  $('procHead').textContent = `滴下量 ${V.toFixed(2)} mL` + (ap.label ? `・${ap.label}` : '');
  $('colA').className = 'pcol ap';
  $('colA').innerHTML = `<h4>近似の計算<span class="tag">教科書の式</span></h4><ol>${ap.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>`;
  $('colE').className = 'pcol ex';
  $('colE').innerHTML = `<h4>厳密な計算<span class="tag">電荷のつり合いを解く</span></h4><ol>${exl.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>
    <p class="sub">そのときの濃度（大きい順）</p>${speciesTable(ex)}`;
  // 見出しの下に結果を置く
  if (!na) $('colA').insertAdjacentHTML('beforeend', `<p class="res">pH ≒ ${ap.pH.toFixed(2)}</p>`);
  $('colE').insertAdjacentHTML('beforeend', `<p class="res">pH = ${ex.pH.toFixed(2)}</p>`);
  if (na){ $('cmpBar').innerHTML = `<span>厳密 <b>${ex.pH.toFixed(2)}</b></span><span class="q none">近似なし</span><span class="mut">弱い酸・塩基どうしの滴定は、教科書の近似式では扱えません。電荷のつり合いから解いた値です。</span>`; return; }
  const why = q.level === 'good' ? '近似の条件が成り立っている点です。' : (WHY[ap.role] || '');
  $('cmpBar').innerHTML = `<span>近似 <b>${ap.pH.toFixed(2)}</b></span><span>厳密 <b>${ex.pH.toFixed(2)}</b></span><span>差 <b>${sdiff(diff)}</b></span>
    <span class="q ${q.level}">${q.text}</span><span class="mut">${esc(why)}</span>`;
}
function renderKp(){
  const tb = $('kpTable');
  if (!tb.dataset.key || tb.dataset.key !== state.sample + '|' + JSON.stringify(overOf(state.sample)) + '|' + state.cap){
    tb.dataset.key = state.sample + '|' + JSON.stringify(overOf(state.sample)) + '|' + state.cap;
    tb.innerHTML = '<thead><tr><th>場面</th><th>滴下量 (mL)</th><th>近似</th><th>厳密</th><th>差</th><th>判定</th></tr></thead><tbody>' +
      kp.map((p, i) => `<tr tabindex="0" data-i="${i}" title="クリックすると、この滴下量に移ります"><td>${esc(p.label)}</td><td>${p.V.toFixed(p.V < 1 ? 3 : 2)}</td><td>${p.approx == null ? '—' : p.approx.toFixed(2)}</td><td>${p.exact.toFixed(2)}</td>
        <td>${p.diff == null ? '—' : sdiff(p.diff)}</td><td><span class="q ${p.q.level}">${p.q.text}</span></td></tr>`).join('') + '</tbody>';
  }
  tb.querySelectorAll('tbody tr').forEach(tr => tr.classList.toggle('cur', Math.abs(kp[+tr.dataset.i].V - V) < 0.0005));
}

// ---- タブ：緩衝液・指示薬 ----
function renderTabs(){
  document.querySelectorAll('#tabSeg [data-tab]').forEach(b => { const on = b.dataset.tab === state.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  const m = state.tab, unk = m === 'unk', buf = m === 'buf', main = m === 'main', hide = hideAns();
  $('bufCtl').hidden = !buf; $('appPanel').hidden = buf;
  $('tabBuf').hidden = !buf;
  $('tabUnk').hidden = !unk; $('tabUnk').classList.toggle('unk-wide', unk && !hide);
  $('chartPanel').hidden = unk && hide;                   // 未知試料は答え合わせまでグラフを隠す
  $('indBar').hidden = !main;
  $('btnDetail').hidden = !main; $('btnSmp').hidden = unk;
  $('kpPanel').hidden = !main || hide; $('procPanel').hidden = !main || hide; $('tabInd').hidden = !main || hide;
}
function renderBuf(ex){
  const smp = getSample(state.sample), one = sys.n === 1;
  $('pkaSlRow').hidden = !one;
  if (one){ const sl = $('pkaSl'); if (document.activeElement !== sl) sl.value = sys.pKa[0]; $('pkaSlVal').textContent = sys.pKa[0].toFixed(2);
    $('pkaSlLbl').textContent = smp.kind === 'base' ? (smp.key === 'custom' ? 'BH⁺ の pKa' : 'NH₄⁺ の pKa') : 'pKa'; }
  $('bufNote').textContent = sys.n === 0 ? '強酸×強塩基には緩衝のはたらきがありません。弱酸・弱塩基の試料で試しましょう。' : (one ? '半当量点（pH = pKa）のまわりで、pH が変わりにくい。' : '各段の半当量点（pH = pKa）のまわりで、pH が変わりにくい。');
  $('optBuf').checked = state.buf; $('optBuf').disabled = sys.n === 0;
  $('alphaBox').hidden = sys.n === 0; if (sys.n > 0) drawAlpha();
  $('btnGhostClear').disabled = !ghosts.length; $('btnGhost').disabled = ghosts.length >= 3 && false;
  const b = T.bufferTest(sys, V), dsp = d => (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2);
  const ratio = Math.abs(b.d) > 1e-6 ? Math.abs(b.dWater) / Math.abs(b.d) : Infinity;
  $('bufCard').innerHTML = `<div class="bufc"><div class="bc"><h4>いまの液に ${b.dV} mL 加えると</h4>${esc(sys.titrant.name)} を ${b.dV} mL 加える（${fmt(b.dV * sys.Ct)} mmol）<br>pH ${b.before.toFixed(2)} → ${b.after.toFixed(2)}　<span class="big">変化 ${dsp(b.d)}</span></div>
    <div class="bc"><h4>同じ体積の純水に、同じ量を加えると</h4>pH 7.00 → ${b.water.toFixed(2)}　<span class="big">変化 ${dsp(b.dWater)}</span></div>
    <div class="bc"><h4>くらべると</h4>${Math.abs(b.d) < Math.abs(b.dWater) ? `純水の変化の約 1/${ratio < 1e3 ? Math.round(ratio) : '1000 以上'}。` + (Math.abs(b.d) < 0.2 ? '<b>緩衝液として働いている</b>点です。' : '') : '純水と同じくらい変わる点です（緩衝のはたらきは小さい）。'}
    <br><span class="mut">滴下量を動かして、変化の小さい点（半当量点のまわり）と大きい点（当量点のまわり）を比べましょう。</span></div></div>`;
}
function drawAlphaPh(C){
  const cv = $('alphaPhCv'), {ctx, w, h} = CH.fitCanvas(cv), ex = T.solveExact(sys, V);
  const vl = sys.pKa.map(pk => ({x: pk, color: C.muted, dash: [5, 4], width: 1.1})); if (sys.pI != null) vl.push({x: sys.pI, color: css('--ok') || '#16803c', dash: [7, 3], width: 1.5}); vl.push({x: ex.pH, color: css('--danger') || '#d61f1f', width: 1.6, dash: [4, 3]});
  const r = CH.lineChart(ctx, {x: 0, y: 0, w, h}, {x: {min: 0, max: 14, label: 'pH', n: 7}, y: {min: 0, max: 1, label: 'モル分率', n: 5}, colors: C,
    series: alphaPh.map((se, i) => ({color: ALPHA_COLORS[i % 4], pts: se.pts, width: 2.4})), vlines: vl});
  ctx.save(); ctx.font = '600 11px -apple-system, "Hiragino Sans", sans-serif'; ctx.fillStyle = C.text; ctx.textBaseline = 'top';
  sys.pKa.forEach((pk, i) => { if (pk < 0 || pk > 14) return; const t = (sys.n > 1 ? `pKa${'₁₂₃'[i]} ` : 'pKa ') + pk, tw = ctx.measureText(t).width, x = r.X(pk), tx = x + 4 + tw > r.plot.x + r.plot.w ? x - 4 - tw : x + 4;
    ctx.textAlign = 'left'; ctx.fillText(t, tx, r.plot.y + 4 + (i % 2) * 14); });
  if (sys.pI != null){ const x = r.X(sys.pI), t = 'pI ' + sys.pI.toFixed(2), tw = ctx.measureText(t).width; ctx.fillStyle = css('--ok') || '#16803c'; ctx.textAlign = 'left'; ctx.fillText(t, x + 4 + tw > r.plot.x + r.plot.w ? x - 4 - tw : x + 4, r.plot.y + 32); }
  ctx.restore();
}
const ALPHA_COLORS = ['#2563eb', '#d97706', '#0d9488', '#be185d'];
function drawAlpha(){
  const cv = $('alphaCv'), {ctx, w, h} = CH.fitCanvas(cv);
  const C = {bg: css('--panel') || '#fff', text: css('--text') || '#1f2933', muted: css('--muted') || '#6b7480', grid: css('--line') || '#e5e8ec', axis: css('--muted') || '#9aa3ad'};
  const vl = [{x: V, color: css('--danger') || '#d61f1f', width: 1.6, dash: [4, 3]}];
  if (state.eq && !hideAns()) sys.Veq.forEach(v => { if (v <= xmax) vl.push({x: v, color: C.muted, dash: [5, 4], width: 1}); });
  CH.lineChart(ctx, {x: 0, y: 0, w, h}, {x: {min: 0, max: xmax, label: '滴下量（mL）', n: 8}, y: {min: 0, max: 1, label: '割合', n: 5}, colors: C,
    series: alphaSeries.map((se, i) => ({color: ALPHA_COLORS[i % 4], pts: se.pts, width: 2.4})), vlines: vl});
  drawAlphaPh(C);
  $('alphaLegend').innerHTML = alphaSeries.map((se, i) => `<span style="color:${ALPHA_COLORS[i % 4]}"><i></i>${esc(se.name)}</span>`).join('');
}
function renderInd(ex){
  const sel = indsOf(), cur = sel.map(i => i.key);
  $('indMsg').textContent = sel.length ? sel.map(id => `${id.name}：pH ${id.lo} 以下は${id.accidName}、${id.hi} 以上は${id.baseName}。`).join('') + '選んだら ▶ で滴下して、フラスコの色が変わる滴下量を当量点（縦の点線）と比べましょう。' : '指示薬を選んでください（複数選べます。試料を決める画面でも選べます）。';
  $('optReveal').checked = state.reveal; $('optReveal').disabled = hideAns();
  const tb = $('indTable'); tb.hidden = !state.reveal || hideAns();
  if (state.reveal && !hideAns()){
    const gl = {good: '適切', fair: 'ややずれる', bad: '不適切'};
    tb.innerHTML = '<thead><tr><th>指示薬</th><th>変色域</th><th>当量点</th><th>色が変わる滴下量 (mL)</th><th>当量点とのずれ (mL)</th><th>判定</th></tr></thead><tbody>' +
      indRep.map(r => r.events.map((e, i) => `<tr class="${cur.includes(r.key) ? 'mine' : ''}"><td>${i === 0 ? esc(r.name) : ''}</td><td>${i === 0 ? r.lo + '–' + r.hi : ''}</td>
        <td>${sys.Veq.length > 1 ? `第 ${e.eq + 1}（${e.ve.toFixed(1)} mL）` : e.ve.toFixed(1) + ' mL'}</td>
        <td>${e.changes ? e.V.toFixed(2) : '—'}</td><td>${e.changes ? (e.err >= 0 ? '+' : '−') + Math.abs(e.err).toFixed(2) : '—'}</td>
        <td><span class="q ${e.grade}">${e.changes ? gl[e.grade] : '色が変わらない'}</span></td></tr>`).join('')).join('') + '</tbody>';
  }
}
function toggleInd(k){ const cur = indsOf().map(i => i.key); setInds(T.INDICATORS.map(i => i.key).filter(x => x === k ? !cur.includes(x) : cur.includes(x))); }
$('optReveal').onchange = e => { state.reveal = e.target.checked; save(); renderAll(); };
$('optBuf').onchange = e => { state.buf = e.target.checked; save(); renderAll(); };
// 画面の切り替え：「未知試料の滴定」は食酢（濃度が未知）に固定し、出るときは元の試料・滴下試料・比較対象へ戻す
let stash = null;
function setMode(m){
  if (!TABS.includes(m) || m === state.tab) return;
  if (running) setRunning(false);
  const from = state.tab;
  state.tab = m;
  if (m === 'unk'){
    stash = {compare: state.compare.slice(), titKey: state.titKey};
    state.prevSample = state.sample;
    state.unkSeed++; state.unkReveal = false; $('unkRes').textContent = ''; $('unkAns').value = '';   // 入るたびに新しい問題
    selectSample(state.unkKey);
  } else if (from === 'unk'){
    switchSample(state.prevSample && T.sampleByKey(state.prevSample) ? state.prevSample : 'hcl');
    if (stash){ state.titKey = stash.titKey; rebuild(); state.compare = stash.compare.filter(e => canCompare(e.key)); stash = null; rebuild(); renderStatic(); }
  } else { renderStatic(); }
  save(); renderAll();
}
$('tabSeg').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) setMode(b.dataset.tab); };
$('seekB').oninput = e => setV(+e.target.value);
$('pkaSl').oninput = e => {
  const v = Math.round(+e.target.value * 100) / 100, o = Object.assign({}, state.over[state.sample] || {}, {pKa: [v]});
  state.over[state.sample] = o; rebuild(); renderStatic(); save(); renderAll();
};
$('btnGhost').onclick = () => {
  const smp = getSample(state.sample), o = overOf(state.sample);
  const lab = smp.name.split(' ')[0] + (sys.n === 1 ? ` pKa ${sys.pKa[0]}` : '') + (o.C0 ? ` ${fmt(o.C0)} mol/L` : '');
  ghosts.push({label: lab, pts: cache.curve.exact.slice(), color: GHOST_COLORS.find(c => !ghosts.some(g => g.color === c)) || GHOST_COLORS[0]});
  if (ghosts.length > 3) ghosts.shift();
  renderAll(); toast('いまの曲線を残しました。条件を変えると、見比べられます');
};
$('btnGhostClear').onclick = () => { ghosts = []; renderAll(); };

// ---- 食酢の滴定（濃度が未知） ----
function unkRefresh(){ rebuild(); renderStatic(); save(); renderAll(); }
const UNK_IND = ['mo', 'pp'];
// 未知試料の画面：試料の種類・指示薬（メチルオレンジかフェノールフタレイン）を選んで、濃度を求める
function renderUnk(){
  const smp = getSample(state.sample); if (!smp.unknown) return;
  const what = smp.unkWhat || '';
  $('unkTtl').textContent = `${smp.unkSub}の濃度を求めよう`;
  $('unkDesc').textContent = `${what ? 'うすめた食酢' : smp.unkSub} ${fmt(sys.V0, 3)} mL を ${fmt(sys.Ct)} mol/L の ${sys.titrant.name} で滴定します`;
  $('unkLbl').textContent = `${what ? what + 'の' : ''}${smp.unkSub}の濃度`;
  const sel = $('unkSel'); if (!sel.options.length) sel.innerHTML = T.SAMPLES.filter(x => x.unknown).map(x => `<option value="${x.key}">${esc(x.unkSub)}${x.unkWhat ? '（食酢）' : ''}</option>`).join('');
  sel.value = state.sample;
  const on = indsOf().map(i => i.key);
  $('unkInd').innerHTML = '<span class="mut">指示薬</span>' + UNK_IND.map(k => { const i = T.indicatorByKey(k);
    return `<button type="button" role="radio" aria-checked="${on.includes(k)}" class="chip-btn sm${on.includes(k) ? ' on' : ''}" data-uind="${k}" title="${esc(i.name)}（${i.lo}–${i.hi}）"><span class="sw2" style="background:linear-gradient(90deg,${i.acid === T.WATER ? '#ffffff' : i.acid} 50%,${i.base} 50%)"></span>${esc(i.name)}</button>`; }).join('');
  $('unkGuide').innerHTML = `指示薬の色が変わる（または pH が急に変わる）ところまで滴下して、ビュレットの目盛りを読み、${esc(smp.unkEq)}（物質量の比 1 : 1）から、${esc(smp.unkSub)}の濃度を計算します。`;
}
$('unkSel').onchange = e => {
  if (running) setRunning(false);
  state.unkKey = e.target.value; state.unkSeed++; state.unkReveal = false; $('unkRes').textContent = ''; $('unkAns').value = '';
  selectSample(state.unkKey);
};
$('unkInd').onclick = e => { const b = e.target.closest('[data-uind]'); if (!b) return; setInds([b.dataset.uind]); const n = $('unkInd').querySelector(`[data-uind=${b.dataset.uind}]`); if (n) n.focus(); };
// 答えが出たあとの一言：選んだ指示薬で、色が変わる点が当量点からどれだけずれたか
function unkIndNote(){
  const id = indsOf()[0], r = id && indRep.find(x => x.key === id.key), e = r && r.events[0]; if (!e) return '';
  if (!e.changes) return `${id.name}では、この滴定の色が変わりません。`;
  return e.grade === 'good' ? `${id.name}は、当量点（${fmt(e.ve, 3)} mL）のすぐ近くで色が変わるので、適した指示薬です。`
    : `${id.name}では、色が変わる点が当量点（${fmt(e.ve, 3)} mL）から約 ${Math.abs(e.err).toFixed(2)} mL ${e.err > 0 ? '後' : '前'}にずれます。この試料には、ほかの指示薬のほうが適しています。`;
}
function unkReveal(msg){ state.unkReveal = true; save(); rebuild(); renderStatic(); renderAll(); $('unkRes').innerHTML = msg + ' ' + esc(unkIndNote()); }
$('unkCheck').onclick = () => {
  const ans = parseFloat($('unkAns').value), C = sys.C0, smp = getSample(state.sample);
  if (!isFinite(ans)){ $('unkRes').textContent = '濃度（mol/L）を入れてください。'; return; }
  if (Math.abs(ans - C) / C <= 0.03){
    unkReveal(`<span class="ok">正解です。</span> 濃度は ${fmt(C, 3)} mol/L（当量点は ${fmt(sys.Veq[0], 3)} mL）。` + (smp.unkOrig ? `もとの食酢は ${smp.unkOrig} 倍の ${fmt(C * smp.unkOrig, 3)} mol/L です。` : ''));
    return;
  }
  $('unkRes').innerHTML = `<span class="ng">ちがうようです。</span> ${esc(smp.unkSub)}と${esc(sys.titrant.name)}は物質量が 1 : 1 で反応します。${esc(sys.titrant.name)}の物質量（mmol）= ${fmt(sys.Ct)} × 滴下量（mL）、濃度 = その物質量 ÷ ${fmt(sys.V0, 3)} mL です。滴下量は、色が変わった点のビュレットの目盛りを読み直しましょう。`;
};
$('unkAns').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); $('unkCheck').click(); } };
$('unkShow').onclick = () => unkReveal(`答え：${fmt(sys.C0, 3)} mol/L（当量点 ${fmt(sys.Veq[0], 3)} mL）。`);
$('unkNew').onclick = () => { state.unkSeed++; state.unkReveal = false; V = 0; if (running) setRunning(false); $('unkRes').textContent = ''; $('unkAns').value = ''; unkRefresh(); };

// ---- 描きなおし ----
function renderAll(){
  const ex = T.solveExact(sys, V), ap = T.approx(sys, V);
  syncApproxBtn(); renderTabs(); renderApparatus(ex); drawChart(ex); renderProcess(ex, ap); renderKp();
  if (state.tab === 'buf') renderBuf(ex); else if (state.tab === 'main') renderInd(ex); else renderUnk();
  $('seekB').max = xmax; $('seekB').value = V; $('seekBVal').textContent = V.toFixed(2) + ' mL';
  $('seek').value = V;
  $('evRead').textContent = `目盛り ${V.toFixed(2)} mL`;
  $('chipPH').textContent = `pH ${ex.pH.toFixed(2)}`;
  $('chipV').innerHTML = `滴下量 ${V.toFixed(2)} mL` + indsOf().map(id => ` <span class="swatch" style="background:${T.indicatorColor(id, ex.pH)}"></span>${esc(IND_SHORT[id.key])}`).join('');
  const nearEq = hideAns() ? -1 : sys.Veq.findIndex(v => Math.abs(V - v) < 0.0005);
  $('status').textContent = nearEq >= 0 ? (sys.Veq.length > 1 ? `第 ${nearEq + 1} 当量点です` : '当量点です') : (Math.abs(V - xmax) < 1e-9 ? 'グラフの終わりまで滴下しました' : '');
}
function renderStatic(){
  const smp = getSample(state.sample);
  $('smpName').textContent = smp.name;
  const noteT = sys.titrant.key === smp.titrant ? smp.note : '標準とは別の滴下液（' + sys.titrant.name + '）で滴定しています。';
  $('smpNote').textContent = noteT + (sys.pI != null ? ` 等電点 pI = ${sys.pI.toFixed(2)}。` : '') + (sys.Veq[0] > state.cap ? '（当量点がビュレットの容量を超えます。濃度や体積を変えてください）' : '');
  $('eqn').innerHTML = `${esc(hideAns() && !sys.name.includes('未知') ? sys.name + '（濃度は未知）' : sys.name)} <span class="arr">←</span> ${esc(sys.titrant.name)}`;
  renderCmp();
  document.querySelectorAll('#smpList .mi').forEach(b => { const on = b.dataset.key === state.sample; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  document.querySelectorAll('#capSeg [data-cap]').forEach(b => { const on = +b.dataset.cap === state.cap; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('optApprox').checked = state.approx; $('optEq').checked = state.eq; $('optBand').checked = state.band;
  $('seek').max = xmax; $('seek').setAttribute('aria-valuetext', '');
  $('spdSel').value = String(state.speed);
  const o = overOf(state.sample);
  $('inC0').disabled = !!smp.unknown; $('inC0').value = smp.unknown ? '' : (o.C0 ?? smp.C0); $('inV0').value = o.V0 ?? smp.V0; $('inCt').value = sys.Ct;
  $('lbCt').firstChild.textContent = `${sys.titrant.name} の濃度 `;
  $('lbCap').textContent = '容量（ビュレットの目盛りの最大）';
  const pk = $('pkaBox'), isC = smp.key === 'custom', canEdit = isC || pkaEdit, adj = !isC && state.over[state.sample] && Array.isArray(overOf(state.sample).pKa);
  pk.hidden = smp.n === 0;
  pk.innerHTML = smp.n === 0 ? '' : '<span>pKa（電離のしやすさ。小さいほど強い酸）</span><div class="pk">' +
    sys.pKa.map((v, i) => `<label>${smp.n === 1 ? (smp.kind === 'base' ? (isC ? 'BH⁺ の pKa' : 'NH₄⁺ の pKa') : 'pKa') : 'pKa' + '₁₂₃'[i]}<input type="number" step="${isC ? 'any' : '0.01'}" min="${isC ? -5 : +(smp.pKa[i] - PKA_TOL).toFixed(2)}" max="${isC ? 16 : +(smp.pKa[i] + PKA_TOL).toFixed(2)}" data-pk="${i}" value="${v}" aria-label="pKa ${i + 1}"${canEdit ? '' : ' readonly'}></label>`).join('') + '</div>' +
    (isC ? '' : `<div class="pk-act"><button type="button" class="sbtn" data-pkact="${pkaEdit ? 'done' : 'edit'}" aria-pressed="${pkaEdit}">${pkaEdit ? '調整を終える' : 'pKa を調整する'}</button>${adj ? '<button type="button" class="sbtn" data-pkact="reset">標準の値に戻す</button>' : ''}</div><small class="mut">${adj ? '標準の値（' + smp.pKa.join('、') + '）から調整中です。' : '標準の値です。'}調整できるのは ±${PKA_TOL} までです。自由に変えるときは、種類で「架空の酸・塩基」を選びます。</small>`);
  const isel = indsOf().map(i => i.key);
  $('indBar').innerHTML = '<span class="mut">指示薬</span>' + T.INDICATORS.filter(i => i.lo != null).map(i => `<button type="button" role="checkbox" aria-checked="${isel.includes(i.key)}" class="chip-btn sm${isel.includes(i.key) ? ' on' : ''}" data-ind="${i.key}" title="${esc(i.name)}（${i.lo}–${i.hi}）"><span class="sw2" style="background:linear-gradient(90deg,${i.acid === T.WATER ? '#ffffff' : i.acid} 50%,${i.base} 50%)"></span>${esc(IND_SHORT[i.key])}</button>`).join('');
  $('indSel').innerHTML = T.INDICATORS.filter(i => i.lo != null).map(i => `<label class="chk inl"><input type="checkbox" data-ind="${i.key}"${isel.includes(i.key) ? ' checked' : ''}><span class="sw2" style="background:linear-gradient(90deg,${i.acid === T.WATER ? '#ffffff' : i.acid} 50%,${i.base} 50%)"></span><span>${esc(i.name)}<small>（${i.lo}–${i.hi}）</small></span></label>`).join('');
  $('custBox').hidden = state.sample !== 'custom';
  document.querySelectorAll('#custKind [data-kind]').forEach(b => { const on = b.dataset.kind === state.custom.kind; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  document.querySelectorAll('#custN [data-n]').forEach(b => { const on = +b.dataset.n === state.custom.n; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('dlgName').innerHTML = `${esc(sys.name)}${hideAns() ? '（濃度は未知）' : ' ' + fmt(sys.C0) + ' mol/L'} ${fmt(sys.V0, 3)} mL <span class="arr">←</span> ${esc(sys.titrant.name)} ${fmt(sys.Ct)} mol/L`;
  $('dlgNote').textContent = noteT;
  // 試料の種類（価数・pKa は種類で決まる）
  let sh = '', grp = '';
  for (const x of T.SAMPLES){ if (x.unknown) continue; if (x.group !== grp){ if (grp) sh += '</optgroup>'; grp = x.group; sh += `<optgroup label="${esc(grp)}">`; } sh += `<option value="${x.key}">${esc(x.key === 'custom' ? '架空の酸・塩基（価数・pKa を自作）' : x.label)}</option>`; }
  $('selSpecies').innerHTML = sh + '</optgroup>'; $('selSpecies').value = state.sample;
  // 滴下液の種類（酸には塩基、塩基には酸）
  const tl = T.titrantsFor(smp.kind), opp = smp.kind === 'acid' ? 'base' : 'acid';
  $('selTit').innerHTML = tl.map(t => `<option value="${t.key}">${esc(t.label)}</option>`).join('') + `<option value="custom">${esc(opp === 'acid' ? '自作の酸（弱酸）' : '自作の塩基（弱塩基）')}</option>`;
  $('selTit').value = sys.titrant.key; $('selTit').disabled = !!smp.unknown; $('inCt').disabled = !!smp.unknown;
  $('custTBox').hidden = sys.titrant.key !== 'custom';
  document.querySelectorAll('#custTN [data-n]').forEach(b => { const on = +b.dataset.n === state.customT.n; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const tp = $('tpkaBox'), tt = sys.titrant;
  tp.hidden = !(tt.n > 0);
  tp.innerHTML = tt.n > 0 ? `<span>pKa（${tt.type === 'base' ? '共役酸の pKa。大きいほど強い塩基' : '小さいほど強い酸'}）</span><div class="pk">` + tt.pKa.map((v, i) => `<label>${tt.n === 1 ? 'pKa' : 'pKa' + '₁₂₃'[i]}<input type="number" step="any" min="-5" max="16" data-tpk="${i}" value="${v}" aria-label="滴下液の pKa ${i + 1}"${tt.key === 'custom' ? '' : ' readonly'}></label>`).join('') + '</div>' + (tt.key === 'custom' ? '' : '<small class="mut">この種類の値です。自由に変えるときは、種類で「自作」を選びます。</small>') : '';
  // 目印の滴下量へ移るボタン
  const jb = [];
  if (!hideAns()) sys.Veq.forEach((v, i) => jb.push({v, t: (sys.Veq.length > 1 ? `第 ${i + 1} 当量点` : '当量点') + ` ${fmt(v, 3)} mL`}));
  if (sys.n > 0 && !hideAns()) sys.Veq.forEach((v, i) => jb.push({v: v - sys.dVeq / 2, t: '半当量点' + (sys.Veq.length > 1 ? `（第 ${i + 1} 段）` : '')}));
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
    if (s.unknown) continue;
    if (s.group !== grp){ grp = s.group; html += `<div class="gl">${esc(grp)}</div>`; }
    html += `<button type="button" class="mi" role="option" data-key="${s.key}"><span class="dot"></span><span>${esc(s.name)}<small>${esc(s.note)}</small></span></button>`;
  }
  $('smpList').innerHTML = html;
}
// ---- 比較対象（対象試料のグラフに重ねる試料）：種類・濃度・体積を行ごとに決める ----
function cmpOptions(sel){
  let h = '', grp = '';
  for (const x of T.SAMPLES){ if (!canCompare(x.key)) continue; if (x.group !== grp){ if (grp) h += '</optgroup>'; grp = x.group; h += `<optgroup label="${esc(grp)}">`; } h += `<option value="${x.key}"${x.key === sel ? ' selected' : ''}>${esc(x.label)}</option>`; }
  return h + (grp ? '</optgroup>' : '');
}
function renderCmp(){
  const list = $('cmpList'), act = document.activeElement, keep = act && list.contains(act) ? act.id : null;
  list.innerHTML = state.compare.map((e, i) => { const sm = getSample(e.key), col = CMP_COLORS[i % CMP_COLORS.length];
    return `<div class="cmprow" data-id="${e.id}"><i class="cmpsw" style="border-top-color:${col}" aria-hidden="true"></i>
      <label class="fld"><span>種類</span><select id="cmpS${e.id}" data-f="key" aria-label="比較対象${i + 1}の種類">${cmpOptions(e.key)}</select></label>
      <label class="fld"><span>濃度 <small>mol/L</small></span><input type="number" id="cmpC${e.id}" data-f="C0" min="0.00001" max="2" step="any" inputmode="decimal" value="${e.C0 ?? sm.C0}" aria-label="比較対象${i + 1}の濃度"></label>
      <label class="fld"><span>体積 <small>mL</small></span><input type="number" id="cmpV${e.id}" data-f="V0" min="1" max="100" step="any" inputmode="decimal" value="${e.V0 ?? sm.V0}" aria-label="比較対象${i + 1}の体積"></label>
      <button type="button" class="ic cmpdel" data-del="${e.id}" aria-label="比較対象${i + 1}を外す" title="外す">×</button></div>`; }).join('');
  if (keep){ const el = $(keep); if (el) el.focus(); }
  const n = state.compare.length, has = T.SAMPLES.some(x => canCompare(x.key));
  $('cmpInfo').textContent = `${sys.titrant.name}（${fmt(sys.Ct)} mol/L）で滴定する試料を、最大 ${MAX_CMP} 件まで重ねて比べられます。` + (n ? '' : ' 「＋ 比較対象を追加」を押してください。');
  $('btnCmpAdd').disabled = n >= MAX_CMP || !has; $('cmpClear').hidden = !n;
}
$('btnCmpAdd').onclick = () => {
  if (state.compare.length >= MAX_CMP) return;
  // 最初は、対象試料とは別の種類（なければ同じ種類）にする
  const ks = T.SAMPLES.map(x => x.key).filter(canCompare), used = new Set([state.sample, ...state.compare.map(x => x.key)]);
  const key = ['ch3cooh', 'hcl', 'nh3', 'naoh'].find(k => ks.includes(k) && !used.has(k)) || ks.find(k => !used.has(k)) || ks[0]; if (!key) return;
  const e = {id: ++cmpSeq, key}; state.compare.push(e);
  save(); rebuild(); renderStatic(); renderAll(); const el = $('cmpS' + e.id); if (el) el.focus();
};
$('cmpClear').onclick = () => { state.compare = []; save(); rebuild(); renderStatic(); renderAll(); $('btnCmpAdd').focus(); };
$('cmpList').onclick = e => {
  const d = e.target.closest('[data-del]'); if (!d) return;
  state.compare = state.compare.filter(x => String(x.id) !== d.dataset.del);
  save(); rebuild(); renderStatic(); renderAll(); $('btnCmpAdd').focus();
};
$('cmpList').onchange = e => {
  const f = e.target.dataset.f, row = e.target.closest('.cmprow'); if (!f || !row) return;
  const en = state.compare.find(x => String(x.id) === row.dataset.id); if (!en) return;
  if (f === 'key'){ en.key = e.target.value; delete en.C0; delete en.V0; }
  else { const v = parseFloat(e.target.value), lo = f === 'C0' ? 1e-5 : 1, hi = f === 'C0' ? 2 : 100;
    if (!(v >= lo && v <= hi)){ toast(`${f === 'C0' ? '濃度' : '体積'}は ${lo} 〜 ${hi} の間で入れてください`); renderCmp(); return; }
    en[f] = v; }
  save(); rebuild(); renderStatic(); renderAll();
};
// プリセット：試料と滴下液を、標準の組み合わせ・標準の条件にまとめて設定する
function selectSample(key){
  delete state.over[key]; state.titKey = null;
  switchSample(key);
}
function switchSample(key){
  pkaEdit = false;
  state.sample = key; ghosts = []; V = 0; running = false; $('btnRun').classList.remove('on');
  const t = curTitrant(); if (state.titKey && t.key !== state.titKey) state.titKey = null;
  rebuild(); state.compare = state.compare.filter(e => canCompare(e.key));
  rebuild(); renderStatic(); save(); renderAll();
}
// 試料の種類を選ぶ：価数・pKa は種類で決まる。変えた体積・濃度は、種類を替えても残す
function chooseSpecies(key){
  const prev = overOf(state.sample), so = {}, cur = getSample(state.sample);
  // 「架空の酸・塩基」を選ぶと、いまの試料の価数・pKa を写して始める（写した直後の曲線は同じ）
  if (key === 'custom' && state.sample !== 'custom' && !cur.unknown){ state.custom = {kind: cur.kind, n: Math.max(1, cur.n)}; if (cur.n > 0) so.pKa = sys.pKa.slice(); }
  if (prev.V0 != null) so.V0 = prev.V0;
  if (prev.C0 != null && !getSample(key).unknown) so.C0 = prev.C0;
  if (prev.Ct != null) so.Ct = prev.Ct;
  state.over[key] = so;
  switchSample(key);
}
// 滴下液の種類を選ぶ：濃度・pKa はその種類の標準に戻る
function chooseTitrant(key){
  state.titKey = key; const o = state.over[state.sample] || (state.over[state.sample] = {}); delete o.Ct; delete o.tpKa;
  V = 0; ghosts = []; if (running) setRunning(false);
  rebuild(); renderStatic(); save(); renderAll();
}
$('smpList').onclick = e => { const b = e.target.closest('.mi'); if (b){ selectSample(b.dataset.key); showTpl(false, true); toast('テンプレートから設定しました'); } };
function setOver(patch){
  const o = Object.assign({}, state.over[state.sample] || {}, patch);
  state.over[state.sample] = o; V = 0;
  rebuild(); renderStatic(); save(); renderAll();
}
const numIn = (id, key, lo, hi, name) => $(id).onchange = e => {
  const v = parseFloat(e.target.value);
  if (!(v >= lo && v <= hi)){ toast(`${name}は ${lo} 〜 ${hi} の間で入れてください`); e.target.value = overOf(state.sample)[key] ?? getSample(state.sample)[key]; return; }
  setOver({[key]: v});
};
numIn('inC0', 'C0', 1e-5, 2, '濃度'); numIn('inV0', 'V0', 1, 100, '体積'); numIn('inCt', 'Ct', 1e-5, 2, '濃度');
$('pkaBox').onchange = e => {
  if (!e.target.matches('[data-pk]')) return;
  const smp = getSample(state.sample), isC = smp.key === 'custom';
  const arr = Array.from($('pkaBox').querySelectorAll('[data-pk]')).map(i => parseFloat(i.value));
  if (isC ? !arr.every(v => v >= -5 && v <= 16) : !arr.every((v, i) => Math.abs(v - smp.pKa[i]) <= PKA_TOL + 1e-9)){
    toast(isC ? 'pKa は −5 〜 16 の間で入れてください' : `pKa は、標準の値から ±${PKA_TOL} の間で入れてください`); renderStatic(); return; }
  setOver({pKa: arr});
};
// ふつうの種類の pKa：ボタンを押したときだけ、標準の値から ±0.2 まで調整できる
$('pkaBox').onclick = e => {
  const b = e.target.closest('[data-pkact]'); if (!b) return;
  const a = b.dataset.pkact;
  if (a === 'reset'){ const o = state.over[state.sample]; if (o) delete o.pKa; pkaEdit = false; V = 0; rebuild(); renderStatic(); save(); renderAll(); const f = $('pkaBox').querySelector('[data-pkact]'); if (f) f.focus(); return; }
  pkaEdit = a === 'edit'; renderStatic();
  const f = pkaEdit ? $('pkaBox').querySelector('input') : $('pkaBox').querySelector('[data-pkact]'); if (f) f.focus();
};
$('capSeg').onclick = e => { const b = e.target.closest('[data-cap]'); if (!b) return; state.cap = +b.dataset.cap; rebuild(); buildApparatus(); renderStatic(); save(); renderAll(); };
$('indBar').onclick = e => { const b = e.target.closest('[data-ind]'); if (b){ const k = b.dataset.ind; toggleInd(k); const n = $('indBar').querySelector(`[data-ind=${k}]`); if (n) n.focus(); } };
$('indSel').onchange = e => { const c = e.target.closest('[data-ind]'); if (c) toggleInd(c.dataset.ind); };
$('btnDefault').onclick = () => { delete state.over[state.sample]; delete state.inds[state.sample]; V = 0; rebuild(); renderStatic(); save(); renderAll(); };
// ---- 試料を選ぶ・条件を決めるモーダル ----
const dlg = $('smpDlg'); $('selSpecies').onchange = e => chooseSpecies(e.target.value);
$('selTit').onchange = e => chooseTitrant(e.target.value);
$('custTBox').onclick = e => { const n = e.target.closest('[data-n]'); if (!n) return; state.customT.n = +n.dataset.n; const o = state.over[state.sample]; if (o) delete o.tpKa; V = 0; rebuild(); renderStatic(); save(); renderAll(); };
$('tpkaBox').onchange = e => {
  if (!e.target.matches('[data-tpk]')) return;
  const arr = Array.from($('tpkaBox').querySelectorAll('[data-tpk]')).map(i => parseFloat(i.value));
  if (!arr.every(v => v >= -5 && v <= 16)){ toast('pKa は −5 〜 16 の間で入れてください'); renderStatic(); return; }
  const o = state.over[state.sample] || (state.over[state.sample] = {}); o.tpKa = arr; V = 0; rebuild(); renderStatic(); save(); renderAll();
};
let dlgOpener = null;
function openDlg(opener){
  pkaEdit = false;
  dlgOpener = opener || $('btnSmp');
  try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  showTpl(false);
  $('selSpecies').focus();
}
// テンプレート（プリセット）の一覧：開くと本体を隠して一覧を出し、選ぶ（または「戻る」）と元に戻る
function showTpl(on, focusBack){
  $('tplView').hidden = !on; $('dlgBody').hidden = on; $('btnTpl').setAttribute('aria-expanded', on);
  if (on){ const cur = $('smpList').querySelector('.mi.on'); if (cur) cur.scrollIntoView({block: 'nearest'}); (cur || $('tplBack')).focus(); }
  else if (focusBack) $('btnTpl').focus();
}
$('btnTpl').onclick = () => showTpl(true);
$('tplBack').onclick = () => showTpl(false, true);
dlg.addEventListener('cancel', e => { if (!$('tplView').hidden){ e.preventDefault(); showTpl(false, true); } });
function closeDlg(){ if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => { try { (dlgOpener || $('btnSmp')).focus(); } catch {} });
dlg.addEventListener('click', e => { if (e.target === dlg) closeDlg(); });      // 外側（暗い部分）をクリックしても閉じる
$('btnSmp').onclick = () => openDlg($('btnSmp'));
$('btnDetail').onclick = () => openDlg($('btnDetail'));
$('smpDlgX').onclick = closeDlg; $('smpDlgOk').onclick = closeDlg;
// 近似の曲線の表示・非表示（グラフの見出しのボタン）
function syncApproxBtn(){ $('optApprox').disabled = !sys.approxOK; $('optApprox').checked = state.approx; }
$('chartLegend').onclick = e => {
  const b = e.target.closest('.lg-tgl'); if (!b) return;
  if (b.dataset.ap){ state.approx = !state.approx; save(); }
  else { const id = +b.dataset.cmp; if (hideCmp.has(id)) hideCmp.delete(id); else hideCmp.add(id); }
  renderAll();
  const nb = $('chartLegend').querySelector(b.dataset.ap ? '[data-ap]' : `[data-cmp="${b.dataset.cmp}"]`); if (nb) nb.focus();
};
for (const [id, k] of [['optApprox', 'approx'], ['optEq', 'eq'], ['optBand', 'band']]) $(id).onchange = e => { state[k] = e.target.checked; save(); renderAll(); };

$('custBox').onclick = e => {
  const k = e.target.closest('[data-kind]'), n = e.target.closest('[data-n]'); if (!k && !n) return;
  if (k) state.custom.kind = k.dataset.kind; if (n) state.custom.n = +n.dataset.n;
  if (state.over.custom) delete state.over.custom.pKa;
  delete state.inds.custom; ghosts = []; V = 0; if (running) setRunning(false);
  rebuild(); renderStatic(); save(); renderAll();
};

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
  if (dlg.open) return;
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

// 保存された画面と試料が食い違うときは、画面に合わせる
if (state.tab === 'unk'){ if (!T.sampleByKey(state.sample).unknown) state.sample = state.unkKey; else state.unkKey = state.sample; }
else if (T.sampleByKey(state.sample).unknown) state.sample = state.prevSample || 'hcl';
buildSampleMenu();
rebuild();
buildApparatus();
renderStatic();
onResize();
renderAll();
if (!hasUI) setTimeout(() => alert('共通部品（../shared/ui-kit.js）を読み込めませんでした。ページを再読み込みしてください。'), 200);

// 検証用（最後まで読み込めたことの印にもする）
window.__titration = {T, get ghosts(){ return ghosts; }, get cmp(){ return cache.cmp; }, get indRep(){ return indRep; }, state, get sys(){ return sys; }, get V(){ return V; }, get xmax(){ return xmax; }, get kp(){ return kp; }, setV, setRunning, selectSample, renderAll, setMode, get plot(){ return plotInfo; }};
})();
