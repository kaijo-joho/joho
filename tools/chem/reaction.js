// 反応速度と化学平衡：画面の動き。計算は chem-sim.js、粒子は chem-particles.js、グラフは chem-chart.js、反応の定数は chem-data.js。
// 設計は docs/reaction-design.md。0.1 は「反応を見る」だけ（H₂ + I₂ ⇄ 2HI）。
(function () {
'use strict';
const $ = id => document.getElementById(id);
const S = ChemSim, PT = ChemParticles, CH = ChemChart, D = ChemData, E = ChemEnergy;
const hasUI = typeof JohoUI !== 'undefined';
const toast = (msg, ms) => { if (hasUI) JohoUI.toast(msg, ms); else console.log(msg); };
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const fHTML = f => E.segsToHTML(E.formulaSegs(f));   // H2 → H₂（下付き）

const KEY = {state: 'joho.chem.reaction.state', view: 'joho.chem.reaction.view', side: 'joho.chem.reaction.side',
  sideW: 'joho.chem.reaction.sideW', help: 'joho.chem.reaction.help.v1'};
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };

// ---- 状態（選んだ反応・初めの状態・設定。ブラウザに自動で保存する） ----
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const COUNTS = [100, 200, 400];
const state = {preset: 'hi', start: 'react', count: 200, speed: 1, labels: false, eqLines: false, dots: true};
(function restore(){
  const s = lsGet(KEY.state); if (!s) return;
  if (D.reactionPreset(s.preset)) state.preset = s.preset;
  if (typeof s.start === 'string') state.start = s.start;
  if (COUNTS.includes(s.count)) state.count = s.count;
  if (SPEEDS.includes(s.speed)) state.speed = s.speed;
  for (const k of ['labels', 'eqLines', 'dots']) if (typeof s[k] === 'boolean') state[k] = s[k];
})();
const save = () => lsSet(KEY.state, state);

// ---- 色（グラフの線。ダークでは明るめ） ----
const LINE = {H2: ['#2a78d6', '#5c9cf0'], I2: ['#8b3fb8', '#c084fc'], HI: ['#d9480f', '#ff8a4c']};
const PALETTE = [['#2a78d6', '#5c9cf0'], ['#d9480f', '#ff8a4c'], ['#16803c', '#4ade80'], ['#8b3fb8', '#c084fc'], ['#b45309', '#fbbf24']];
const isDark = () => document.documentElement.dataset.resolvedTheme === 'dark';
const lineColor = (key, i) => (LINE[key] || PALETTE[i % PALETTE.length])[isDark() ? 1 : 0];
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---- シミュレーション ----
const BOX_W = 800, BOX_H = 533;   // 箱の座標（canvas には縮めて描く）
const DT = 1 / 240;               // 粒子の箱の 1 刻み（秒）。粗いと、速い粒子の衝突の勢いが正しく出ない
let pre, consts, cn, sp, sigma, box, ode, sim;
function presetStart(){ return pre.starts.find(s => s.key === state.start) || pre.starts[0]; }
function newSim(){
  pre = D.reactionPreset(state.preset);
  if (!pre.starts.some(s => s.key === state.start)) state.start = pre.starts[0].key;
  sp = pre.species;
  consts = S.constants(pre, pre.Tref);
  cn = S.network(pre, consts);
  // 1 mol/L あたりの粒子の数：最初の初めの状態の濃度の合計を、選んだ粒子の数にする（どの初めの状態でも同じ値）
  const c0Sum = sp.reduce((s, x) => s + (pre.starts[0].c[x.key] || 0), 0);
  sigma = state.count / c0Sum;
  const c0 = sp.map(x => presetStart().c[x.key] || 0);
  const counts = c0.map(c => Math.round(c * sigma));
  box = PT.createBox({w: BOX_W, h: BOX_H, species: sp, channels: S.channelsOf(cn), seed: (Math.random() * 2 ** 31) | 0});
  box.fill(counts);
  // 計算は、粒子の数に丸めた濃度から始める（線と点の出発点をそろえる）
  ode = {c: Float64Array.from(counts, n => n / sigma), h: undefined};
  sim = {t: 0, acc: 0, hist: [{t: 0, c: Array.from(ode.c)}], dots: [{t: 0, n: counts.slice()}], evLog: [{t: 0, e: box.channels.map(c => c.events)}],
    eq: S.equilibrium(cn, Array.from(ode.c)), c0: Array.from(ode.c)};
  renderStatic();
  drawAll();
}

// 1 コマ分進める
let running = false, lastTs = 0, uiTimer = 0;
function advance(realDt){
  sim.acc += realDt * state.speed;
  let n = Math.floor(sim.acc / DT);
  const maxSteps = Math.ceil(0.25 / DT * state.speed);   // 遅いパソコンでは追いつこうとしない
  if (n > maxSteps){ n = maxSteps; sim.acc = 0; } else sim.acc -= n * DT;
  if (!n) return false;
  for (let i = 0; i < n; i++) box.step(DT, S.particleRates(cn, box.counts, sigma));
  const t1 = sim.t + n * DT;
  ode.h = S.integrate(cn, ode.c, t1 - sim.t, {h: ode.h}).h;
  sim.t = t1;
  // 記録：線は 0.1 秒ごと、点は 0.25 秒ごと
  const last = sim.hist[sim.hist.length - 1];
  if (sim.t - last.t >= 0.1 - 1e-9) sim.hist.push({t: sim.t, c: Array.from(ode.c)});
  const lastD = sim.dots[sim.dots.length - 1];
  if (sim.t - lastD.t >= 0.25 - 1e-9) sim.dots.push({t: sim.t, n: box.counts.slice()});
  sim.evLog.push({t: sim.t, e: box.channels.map(c => c.events)});
  while (sim.evLog.length > 2 && sim.t - sim.evLog[1].t >= 1) sim.evLog.shift();
  // 長く動かしたら、古い記録を間引く（グラフの線は 1 つおきに）
  if (sim.hist.length > 4000) sim.hist = sim.hist.filter((h, i) => i % 2 === 0 || i === sim.hist.length - 1);
  if (sim.dots.length > 2000) sim.dots = sim.dots.filter((h, i) => i % 2 === 0 || i === sim.dots.length - 1);
  return true;
}
function frame(ts){
  if (!running){ lastTs = 0; return; }
  const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  if (advance(dt)){
    drawAll();
    if (ts - uiTimer > 200){ uiTimer = ts; renderLive(); }
  }
  requestAnimationFrame(frame);
}
function setRunning(on){
  running = on;
  $('btnPlay').classList.toggle('on', on);
  $('btnPlay').setAttribute('aria-label', on ? '止める' : '動かす');
  $('pausedMark').hidden = on;
  if (on){ lastTs = 0; requestAnimationFrame(frame); }
  renderLive();
}
function reset(){ const was = running; setRunning(false); newSim(); renderLive(); if (was) setRunning(true); }

// ---- 描く ----
function drawBox(){
  const cv = $('boxCv'), {ctx, w, h} = CH.fitCanvas(cv);
  const k = Math.min(w / BOX_W, h / BOX_H), ox = (w - BOX_W * k) / 2, oy = (h - BOX_H * k) / 2;
  ctx.clearRect(0, 0, w, h);
  // 色のある気体（I₂ など）は、濃さに合わせて箱をうすく色づける
  const tintSp = sp.findIndex(x => x.tint);
  const tint = tintSp >= 0 ? {color: sp[tintSp].tint, alpha: (isDark() ? 0.22 : 0.2) * (box.counts[tintSp] / sigma) / sim.c0.reduce((a, b) => Math.max(a, b), 1e-9)} : null;
  PT.drawBox(ctx, box, {x: ox, y: oy, scale: k}, {dark: isDark(), labels: state.labels, tint, bg: css('--paper') || undefined,
    flashColors: [css('--kf') || '#d97706', css('--kb') || '#0d9488']});
  ctx.strokeStyle = css('--line') || '#d9dde3'; ctx.lineWidth = 1; ctx.strokeRect(ox + 0.5, oy + 0.5, BOX_W * k - 1, BOX_H * k - 1);
}
function drawChart(){
  const cv = $('chartCv'), {ctx, w, h} = CH.fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const tMax = Math.max(30, CH.niceMax(sim.t * 1.08 + 1, 6));
  const yTop = Math.max(...sim.c0, ...sim.eq, ...ode.c) * 1.08;
  const series = [];
  // 前の物質と同じ濃度で動く物質（H₂ と I₂ など）は、線が重なって見えなくなるので破線にする
  const same = i => sp.some((y, j) => j < i && sim.hist.every(hh => Math.abs(hh.c[i] - hh.c[j]) < 1e-12));
  sp.forEach((x, i) => {
    const col = lineColor(x.key, i);
    if (state.dots) series.push({color: col, dots: true, alpha: 0.38, r: 2, pts: sim.dots.map(d => [d.t, d.n[i] / sigma])});
    series.push({color: col, width: 2.4, dash: same(i) ? [7, 7] : null, pts: sim.hist.map(hh => [hh.t, hh.c[i]])});
  });
  const hlines = state.eqLines ? sp.map((x, i) => ({y: sim.eq[i], color: lineColor(x.key, i), dash: [6, 5], label: ''})) : [];
  CH.lineChart(ctx, {x: 0, y: 0, w, h}, {
    x: {min: 0, max: tMax, label: '時間（s・模型の時間）'}, y: {min: 0, max: CH.niceMax(yTop, 5), label: '濃度（mol/L）'},
    colors: {bg: css('--paper') || '#fff', text: css('--text'), muted: css('--muted'), grid: isDark() ? '#2a2e35' : '#eceef1', axis: css('--muted')},
    series, hlines});
}
function drawAll(){ drawBox(); drawChart(); }

// ---- 文字の表示 ----
function eqnHTML(){
  const side = list => list.map(([k, n]) => (n > 1 ? n : '') + fHTML(sp.find(x => x.key === k).f)).join(' + ');
  return side(pre.react) + '<span class="arr">⇄</span>' + side(pre.prod);
}
const fmtT = T => T + ' K（' + Math.round(T - 273) + ' ℃）';
// 濃度の式の文字（[H₂] など）
const br = key => '[' + fHTML(sp.find(x => x.key === key).f) + ']';
const powTxt = (s, n) => n > 1 ? s + '<sup>' + n + '</sup>' : s;
function kUnit(order){
  if (order === 1) return '/s';
  if (order === 2) return 'L/(mol·s)';
  return 'L<sup>' + (order - 1) + '</sup>/(mol<sup>' + (order - 1) + '</sup>·s)';
}
function renderStatic(){
  $('rxName').innerHTML = pre.short;
  $('eqn').innerHTML = eqnHTML();
  $('rxList').innerHTML = D.REACTION_PRESETS.map(p => '<button type="button" class="mi' + (p.key === state.preset ? ' on' : '') + '" role="menuitemradio" aria-checked="' + (p.key === state.preset) +
    '" data-rx="' + p.key + '"><span class="dot"></span><span>' + p.short + '<small>' + esc(p.name) + '</small></span></button>').join('') +
    '<div class="mi" style="cursor:default;color:var(--muted)"><span></span><span><small>ほかの反応は、次の版から増やします</small></span></div>';
  $('startSeg').innerHTML = pre.starts.map(s => '<button type="button" role="radio" data-start="' + s.key + '" aria-checked="' + (s.key === state.start) + '" class="' + (s.key === state.start ? 'on' : '') + '">' + s.label + '</button>').join('');
  // 分子の凡例（形・化学式・粒子の数・グラフの線の色）
  $('molLegend').innerHTML = sp.map((x, i) => '<span class="ml" title="' + esc(x.name) + '"><canvas data-mol="' + i + '"></canvas><span class="f">' + fHTML(x.f) + '</span>' +
    '<span class="sw" style="background:' + lineColor(x.key, i) + '"></span><span class="n" data-n="' + i + '"></span></span>').join('');
  document.querySelectorAll('#molLegend canvas').forEach(cv => {
    const {ctx, w, h} = CH.fitCanvas(cv), shp = box.sp[+cv.dataset.mol].shape, k = Math.min(0.9, (w - 4) / (2 * shp.r), (h - 2) / (2 * shp.r));
    ctx.clearRect(0, 0, w, h); PT.drawMolecule(ctx, shp, w / 2, h / 2, k, isDark());
  });
  $('chartLegend').innerHTML = '<span><i></i>計算の値</span>' + (state.dots ? '<span><i class="dot"></i>粒子の数から</span>' : '') + (state.eqLines ? '<span><i class="dash"></i>平衡の濃度</span>' : '');
  $('chipTemp').textContent = '温度 ' + fmtT(pre.Tref);
  document.querySelectorAll('#countSeg [data-count]').forEach(b => b.classList.toggle('on', +b.dataset.count === state.count));
  $('optLabels').checked = state.labels; $('optEq').checked = state.eqLines; $('optDots').checked = state.dots;
  $('spdVal').textContent = speedText(state.speed);
  $('spdDown').disabled = state.speed <= SPEEDS[0]; $('spdUp').disabled = state.speed >= SPEEDS[SPEEDS.length - 1];
}
const speedText = v => '×' + (v === 0.25 ? '¼' : v === 0.5 ? '½' : v);

// いまの状態（Q と K・速さ）
function qkInfo(c){
  const lnQ = S.lnQ(cn, c), lnK = Math.log(consts.K);
  const Q = Math.exp(lnQ);
  let kind;
  if (Math.abs(lnQ - lnK) < 0.02) kind = 'eq';
  else kind = lnQ < lnK ? 'fwd' : 'bwd';
  return {Q, kind};
}
function renderLive(){
  const c = Array.from(ode.c), {Q, kind} = qkInfo(c);
  $('chipTime').textContent = '時間 ' + sim.t.toFixed(1) + ' s';
  const qTxt = !isFinite(Q) ? '∞' : S.sig(Q);
  $('chipQK').innerHTML = 'Q = ' + qTxt + (kind === 'eq' ? ' ≈ ' : kind === 'fwd' ? ' &lt; ' : ' &gt; ') + 'K = ' + S.sig(consts.K);
  const st = $('status');
  st.textContent = kind === 'eq' ? '平衡（v₁ = v₂）：見かけ上、濃度が変わらない' : kind === 'fwd' ? '正反応の向きに進んでいる（v₁ > v₂）' : '逆反応の向きに進んでいる（v₁ < v₂）';
  st.classList.toggle('eq', kind === 'eq');
  // 箱の上：この 1 秒の反応の回数
  const a = sim.evLog[0], b = sim.evLog[sim.evLog.length - 1], span = b.t - a.t;
  if (span > 0.5){
    const r = b.e.map((e, i) => Math.round((e - a.e[i]) / span));
    $('evRate').innerHTML = '正反応 <b class="kf">' + r[0] + '</b> 回/s ・ 逆反応 <b class="kb">' + (r[1] ?? 0) + '</b> 回/s';
  } else $('evRate').textContent = running ? '' : '';
  document.querySelectorAll('#molLegend [data-n]').forEach(n => { n.textContent = box.counts[+n.dataset.n] + ' 個'; });
  $('hint').textContent = running ? '光った所で反応が起きています（橙：正反応、青緑：逆反応）' : '▶（スペースキー）で動かします';
  if (openPane === 'num') renderNum(c, Q, kind);
}
function renderNum(c, Q, kind){
  const V = pre.V, T = pre.Tref, r = S.rates(cn, c)[0];
  const rows = sp.map((x, i) => '<tr><td><span class="sw" style="background:' + lineColor(x.key, i) + '"></span><span class="f">' + fHTML(x.f) + '</span></td>' +
    '<td>' + box.counts[i] + '</td><td>' + S.sig(c[i] * V) + '</td><td>' + S.sig(c[i]) + '</td><td>' + S.sig(S.partialPressure(c[i], T)) + '</td></tr>').join('');
  const kExpr = (list) => list.map(([k, n]) => powTxt(br(k), n)).join('');
  const numExpr = list => list.map(([k, n]) => powTxt('(' + S.sig(c[sp.findIndex(x => x.key === k)]) + ')', n)).join(' × ');
  const ordF = pre.react.reduce((s, [, n]) => s + n, 0), ordB = pre.prod.reduce((s, [, n]) => s + n, 0);
  const qTxt = !isFinite(Q) ? '∞（反応物がない）' : S.sig(Q);
  const verdict = kind === 'eq' ? '<span class="verdict eq">Q ≈ K：平衡</span>' : kind === 'fwd' ? '<span class="verdict">Q &lt; K：正反応の向きに進む</span>' : '<span class="verdict">Q &gt; K：逆反応の向きに進む</span>';
  const dn = consts.dn;
  const kp = S.Kp(consts.K, T, dn);
  $('numBody').innerHTML =
    '<div class="card"><h4>いまの量（' + esc(fmtT(T)) + '、体積 ' + V + ' L）</h4>' +
      '<table class="ntbl"><tr><th>物質</th><th>粒子</th><th>物質量<br>mol</th><th>濃度<br>mol/L</th><th>分圧<br>Pa</th></tr>' + rows + '</table>' +
      '<p class="small">物質量・濃度・分圧は計算の値。「粒子」は箱の中の数（1 個 = ' + S.sig(V / sigma) + ' mol）。</p></div>' +
    '<div class="card"><h4>平衡定数と反応商</h4>' +
      '<div class="frm">K = <span class="big">' + kExpr(pre.prod) + ' / ' + kExpr(pre.react) + '</span></div>' +
      '<dl class="kv"><dt>K（濃度）</dt><dd><b>' + S.sig(consts.K) + '</b>（' + esc(fmtT(T)) + '）</dd>' +
      '<dt>Kp（分圧）</dt><dd>' + S.sig(kp) + (dn === 0 ? '（Δn = 0 なので K と同じ）' : ' Pa<sup>' + dn + '</sup>（Kp = K(RT)<sup>' + dn + '</sup>）') + '</dd>' +
      '<dt>いまの Q</dt><dd>' + numExpr(pre.prod) + ' / (' + numExpr(pre.react) + ') = <b>' + qTxt + '</b></dd></dl>' +
      '<p>' + verdict + '</p></div>' +
    '<div class="card"><h4>速さ（正反応 v₁・逆反応 v₂）</h4>' +
      '<dl class="kv"><dt>v₁ = k₁' + kExpr(pre.react) + '</dt><dd><b class="kf">' + S.sig(r.vf) + '</b> mol/(L·s)</dd>' +
      '<dt>v₂ = k₂' + kExpr(pre.prod) + '</dt><dd><b class="kb">' + S.sig(r.vb) + '</b> mol/(L·s)</dd>' +
      '<dt>k₁</dt><dd>' + S.sig(consts.k1) + ' ' + kUnit(ordF) + '</dd>' +
      '<dt>k₂</dt><dd>' + S.sig(consts.k2) + ' ' + kUnit(ordB) + '</dd>' +
      '<dt>k₁ / k₂</dt><dd><b>' + S.sig(consts.k1 / consts.k2) + '</b> = K</dd></dl>' +
      '<p class="small">平衡では v₁ = v₂ なので、k₁' + kExpr(pre.react) + ' = k₂' + kExpr(pre.prod) + '。だから K = k₁ / k₂ になります。速度定数は模型の時間での値です。</p></div>' +
    '<div class="card"><h4>この反応のエネルギー</h4>' +
      '<dl class="kv"><dt>活性化エネルギー（正反応）Ea₁</dt><dd>' + consts.Ea1 + ' kJ/mol</dd>' +
      '<dt>活性化エネルギー（逆反応）Ea₂</dt><dd>' + S.sig(consts.Ea2, 4) + ' kJ/mol</dd>' +
      '<dt>反応エンタルピー ΔH</dt><dd>' + consts.dH + ' kJ（' + (consts.dH < 0 ? '発熱' : '吸熱') + '）</dd></dl>' +
      '<p class="small">ΔH = Ea₁ − Ea₂。ΔH は生成エンタルピーの表から（2 × 26.5 − 62.4）。</p></div>';
}

// ---- 操作 ----
$('btnPlay').onclick = () => setRunning(!running);
$('btnReset').onclick = () => { reset(); toast('最初からやり直しました'); };
$('startSeg').onclick = e => { const b = e.target.closest('[data-start]'); if (!b || b.dataset.start === state.start) return; state.start = b.dataset.start; save(); reset(); };
$('rxList').onclick = e => {
  const b = e.target.closest('[data-rx]'); if (!b) return;
  const m = $('rxMenu'); m.classList.add('closed'); setTimeout(() => m.classList.remove('closed'), 400);
  if (b.dataset.rx !== state.preset){ state.preset = b.dataset.rx; save(); reset(); }
};
$('countSeg').onclick = e => { const b = e.target.closest('[data-count]'); if (!b) return; state.count = +b.dataset.count; save(); reset(); toast('粒子の数を変えて、最初からやり直しました'); };
$('optLabels').onchange = e => { state.labels = e.target.checked; save(); drawAll(); };
$('optEq').onchange = e => { state.eqLines = e.target.checked; save(); renderStatic(); drawAll(); };
$('optDots').onchange = e => { state.dots = e.target.checked; save(); renderStatic(); drawAll(); };
function setSpeed(dir){
  const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(state.speed) + dir));
  state.speed = SPEEDS[i]; save(); renderStatic();
}
$('spdDown').onclick = () => setSpeed(-1);
$('spdUp').onclick = () => setSpeed(1);
$('chipQK').onclick = () => { if (openPane !== 'num') openSide('num'); };

// ---- 右のパネル ----
let openPane = '';
const narrow = () => matchMedia('(max-width:900px)').matches;
function openSide(p){
  openPane = openPane === p ? '' : p;
  $('sidePanel').classList.toggle('open', !!openPane);
  document.querySelectorAll('.side-pane').forEach(n => { n.hidden = n.id !== 'pane' + openPane.charAt(0).toUpperCase() + openPane.slice(1); });
  document.querySelectorAll('.side-tab').forEach(t => { t.classList.toggle('on', t.dataset.pane === openPane); t.setAttribute('aria-selected', String(t.dataset.pane === openPane)); });
  lsSet(KEY.side, openPane || 'none');
  onResize(); renderLive();
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

// ---- 上部のバーは文字を大きくしても 1 行に保つ（共通仕様 2.1） ----
function fitBar(){
  const bar = $('topBar');
  bar.classList.remove('tight', 'tighter', 'tightest');
  for (const c of ['tight', 'tighter', 'tightest']){
    if (bar.scrollWidth <= bar.clientWidth + 1) return;
    bar.classList.add(c);
  }
}
function onResize(){ fitBar(); if (sim) drawAll(); }
addEventListener('resize', onResize);
new ResizeObserver(() => { if (sim) drawAll(); }).observe($('wrap'));

// ---- キーボード ----
let help = null;
document.addEventListener('keydown', e => {
  if (help && help.root.contains(e.target)) return;
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  const inField = e.target.matches && e.target.matches('input, textarea, select');
  if (inField) return;
  if (e.key === '?'){ e.preventDefault(); $('btnHelp').click(); return; }
  if (e.key === ' ' && !(e.target.matches && e.target.matches('button, a, summary'))){ e.preventDefault(); setRunning(!running); return; }
  if (e.key === 'r' || e.key === 'R'){ e.preventDefault(); $('btnReset').click(); }
});
// ブラウザのタブが隠れたら止める（戻ったら、止めた状態のまま）
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
    root: $('operation-help'), opener: $('btnHelp'), title: '反応速度と化学平衡の使い方', storageKey: KEY.help,
    bounds: () => ({top: $('topBar').getBoundingClientRect().bottom + 8, bottom: $('wrap').getBoundingClientRect().bottom - 8}),
    initialRight: () => $('wrap').getBoundingClientRect().right - 12,
    returnToEditor: () => $('btnPlay').focus()
  });
} catch {   // ヘルプが読めなくても、シミュレーションは使えるようにする
  $('operation-help').hidden = true;
  $('btnHelp').onclick = () => toast('使い方を読み込めませんでした（../shared/help-panel.js が必要です）');
}
let view = null;
function syncSetMenu(v){
  document.querySelectorAll('#themeSeg [data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === v.theme));
  document.querySelectorAll('#sizeSeg [data-size]').forEach(b => b.classList.toggle('on', b.dataset.size === v.textSize));
}
try {
  view = JohoUI.theme({storageKey: KEY.view, onChange: v => { syncSetMenu(v); if (sim){ renderStatic(); renderLive(); } onResize(); }});
  $('themeSeg').onclick = e => { const b = e.target.closest('[data-theme]'); if (b) view.set({theme: b.dataset.theme}); };
  $('sizeSeg').onclick = e => { const b = e.target.closest('[data-size]'); if (b) view.set({textSize: b.dataset.size}); };
} catch { document.querySelectorAll('#themeSeg, #sizeSeg').forEach(n => { n.previousElementSibling.hidden = true; n.hidden = true; }); }

try { const w = +localStorage.getItem(KEY.sideW); if (w) setSideW(w); } catch {}
let savedPane = ''; try { savedPane = localStorage.getItem(KEY.side) || ''; } catch {}
newSim();
if ((savedPane === 'num' || (savedPane === '' && innerWidth > 1200)) && !narrow()) openSide('num');
renderLive();
onResize();
// 「動きを減らす」設定のときは止めた状態で始める。そうでなければ、開いたらすぐ動かす
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
setRunning(!reduceMotion);
if (!hasUI) setTimeout(() => alert('共通部品（../shared/ui-kit.js）を読み込めませんでした。ページを再読み込みしてください。'), 200);

// 検証用（最後まで読み込めたことの印にもする）
window.__reaction = {S, PT, state, get sim(){ return sim; }, get box(){ return box; }, get ode(){ return ode; }, get consts(){ return consts; },
  get sigma(){ return sigma; }, setRunning, reset, advance, drawAll};
})();
