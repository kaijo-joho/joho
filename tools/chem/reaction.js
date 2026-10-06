// 反応速度と化学平衡：画面の動き。計算は chem-sim.js、粒子は chem-particles.js、グラフは chem-chart.js、反応の定数は chem-data.js。
// 設計は docs/reaction-design.md。タブは「反応を見る」「速度を調べる」（0.2）。「平衡を調べる」は 0.3 で足す。
(function () {
'use strict';
const $ = id => document.getElementById(id);
const S = ChemSim, PT = ChemParticles, CH = ChemChart, D = ChemData, E = ChemEnergy;
const hasUI = typeof JohoUI !== 'undefined';
const toast = (msg, ms) => { if (hasUI) JohoUI.toast(msg, ms); else console.log(msg); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const fHTML = f => E.segsToHTML(E.formulaSegs(f));   // H2 → H₂（下付き）
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const fText = f => f.replace(/(\D)(\d+)/g, (m, a, d) => a + d.split('').map(x => SUBS[x]).join(''));   // SVG 用（下付きの文字）

const KEY = {state: 'joho.chem.reaction.state', view: 'joho.chem.reaction.view', side: 'joho.chem.reaction.side',
  sideW: 'joho.chem.reaction.sideW', help: 'joho.chem.reaction.help.v1'};
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };

// ---- 状態（選んだ反応・タブ・条件・設定。ブラウザに自動で保存する） ----
const TABS = ['view', 'rate'];
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
const COUNTS = [100, 200, 400];
const state = {tab: 'view', preset: 'hi', start: 'react', count: 200, speed: 1, labels: false, eqLines: false, dots: true,
  T: {}, c0: {}, cat: false, rev: true, records: {}};
(function restore(){
  const s = lsGet(KEY.state); if (!s) return;
  if (TABS.includes(s.tab)) state.tab = s.tab;
  if (D.reactionPreset(s.preset)) state.preset = s.preset;
  if (typeof s.start === 'string') state.start = s.start;
  if (COUNTS.includes(s.count)) state.count = s.count;
  if (SPEEDS.includes(s.speed)) state.speed = s.speed;
  for (const k of ['labels', 'eqLines', 'dots', 'cat', 'rev']) if (typeof s[k] === 'boolean') state[k] = s[k];
  for (const k of ['T', 'c0', 'records']) if (s[k] && typeof s[k] === 'object') state[k] = s[k];
})();
const save = () => lsSet(KEY.state, state);

// ---- 色（グラフの線。ダークでは明るめ） ----
const LINE = {H2: ['#2a78d6', '#5c9cf0'], I2: ['#8b3fb8', '#c084fc'], HI: ['#d9480f', '#ff8a4c'],
  A: ['#2a78d6', '#5c9cf0'], B: ['#d9480f', '#ff8a4c'], H2O2: ['#0e7490', '#22d3ee'], H2O: ['#64748b', '#94a3b8'], O2: ['#d61f1f', '#f87171']};
const PALETTE = [['#2a78d6', '#5c9cf0'], ['#d9480f', '#ff8a4c'], ['#16803c', '#4ade80'], ['#8b3fb8', '#c084fc'], ['#b45309', '#fbbf24']];
const isDark = () => document.documentElement.dataset.resolvedTheme === 'dark';
const lineColor = (key, i) => (LINE[key] || PALETTE[i % PALETTE.length])[isDark() ? 1 : 0];
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---- 反応と条件 ----
const BOX_W = 800, BOX_H = 533;   // 箱の座標（canvas には縮めて描く）
const DT = 1 / 240;               // 粒子の箱の 1 刻み（秒）。粗いと、速い粒子の衝突の勢いが正しく出ない
const P_MAX = 0.25;               // 1 回の衝突で反応する割合の上限の目安。これを超えるときは時間をゆっくり進める
                                  // （大きいと、近くの分子から先に反応して「よく混ざっている」前提がくずれ、粒子が計算より遅れる。0.5 で約 2 割遅れた）
let pre, consts, cn, sp, sigma, box, ode, sim, ghost = null, viewT = null;
const Tnow = () => { const T = +state.T[pre.key]; return T >= pre.Tmin && T <= pre.Tmax ? T : pre.Tref; };
const catOn = () => state.tab === 'rate' && state.cat && !!pre.catEa;
const revOn = () => !(state.tab === 'rate' && !state.rev);
const isRev = () => pre.Kref != null;
const chartSp = () => sp.map((x, i) => i).filter(i => !sp[i].solvent);   // グラフに出す物質（溶媒の水は出さない）
const refKey = () => pre.vRef || pre.react[0][0];
const refIdx = () => sp.findIndex(x => x.key === refKey());
function presetStart(){ return pre.starts.find(s => s.key === state.start) || pre.starts[0]; }
// 初めの濃度：速度のタブでは反応物ごとのスライダー、反応を見るタブでは「初めの状態」
function startConc(){
  if (state.tab === 'rate'){
    const c = (state.c0[pre.key] = state.c0[pre.key] || {});
    return sp.map(x => {
      const rg = (pre.c0Range || {})[x.key];
      if (!rg) return 0;
      const def = pre.starts[0].c[x.key] || rg[0], v = +c[x.key];
      return v >= rg[0] - 1e-9 && v <= rg[1] + 1e-9 ? v : def;
    });
  }
  return sp.map(x => presetStart().c[x.key] || 0);
}
function makeConsts(){ consts = S.constants(pre, Tnow(), {catalyst: catOn(), reverse: revOn()}); }

// ---- シミュレーション ----
function newSim(){
  pre = D.reactionPreset(state.preset);
  if (!pre.starts.some(s => s.key === state.start)) state.start = pre.starts[0].key;
  sp = pre.species;
  makeConsts();
  cn = S.network(pre, consts);
  // 1 mol/L あたりの粒子の数：最初の「初めの状態」の濃度の合計を、選んだ粒子の数にする
  const c0Sum = sp.reduce((s, x) => s + (pre.starts[0].c[x.key] || 0), 0);
  sigma = state.count / c0Sum;
  const counts = startConc().map(c => Math.round(c * sigma));
  box = PT.createBox({w: BOX_W, h: BOX_H, species: sp, channels: S.channelsOf(cn), seed: (Math.random() * 2 ** 31) | 0, kT: Tnow() / pre.Tref});
  box.fill(counts);
  ode = {c: Float64Array.from(counts, n => n / sigma), h: undefined};   // 計算は、粒子の数に丸めた濃度から始める
  sim = {t: 0, acc: 0, scale: 1, hist: [{t: 0, c: Array.from(ode.c)}], dots: [{t: 0, n: counts.slice()}],
    evLog: [{t: 0, e: box.channels.map(c => c.events)}], snaps: [], c0: Array.from(ode.c), eq: null};
  sim.eq = eqFrom(ode.c);
  viewT = null;
  chooseScale(true);
  takeSnap();
}
const eqFrom = c => isRev() && revOn() ? S.equilibrium(cn, Array.from(c)) : null;
const condNow = () => ({T: Tnow(), cat: state.cat, rev: state.rev});

// 1 回の衝突で反応する割合が大きすぎるとき（温度が高い・触媒ありで速い反応）は、模型の時間をゆっくり進める（×½・×¼ …）
function chooseScale(force){
  const R = S.particleRates(cn, box.counts, sigma, 1);
  let pmax = 0;
  box.channels.forEach((ch, i) => { if (ch.kind === 'bi'){ const Z = box.zOf(i); if (Z > 0) pmax = Math.max(pmax, R[i] / Z); } });
  let s = 1; while (pmax * s > P_MAX && s > 1 / 1024) s /= 2;
  if (force || s < sim.scale) sim.scale = s;
  else if (s > sim.scale && pmax * sim.scale * 2 <= P_MAX * 0.6) sim.scale = Math.min(1, sim.scale * 2);   // 戻すときは余裕をもって
}
// 場面の記録（0.25 秒ごと）。時間のスライダーで戻るときに使う
function takeSnap(){
  sim.snaps.push({t: sim.t, box: box.snapshot(), c: Array.from(ode.c), cond: condNow(), scale: sim.scale});
  if (sim.snaps.length > 1000) sim.snaps = sim.snaps.filter((x, i) => i % 2 === 0 || i === sim.snaps.length - 1);
}

let running = false, lastTs = 0, uiTimer = 0;
function advance(realDt){
  sim.acc += realDt * state.speed;
  let n = Math.floor(sim.acc / DT);
  const maxSteps = Math.ceil(0.25 / DT * state.speed);   // 遅いパソコンでは追いつこうとしない
  if (n > maxSteps){ n = maxSteps; sim.acc = 0; } else sim.acc -= n * DT;
  if (!n) return false;
  chooseScale(false);
  for (let i = 0; i < n; i++) box.step(DT, S.particleRates(cn, box.counts, sigma, sim.scale));
  const dtm = n * DT * sim.scale;   // 模型の時間
  ode.h = S.integrate(cn, ode.c, dtm, {h: ode.h}).h;
  sim.t += dtm;
  // 記録：線は 0.1 秒ごと、点は 0.25 秒ごと、場面は 0.25 秒ごと
  if (sim.t - sim.hist[sim.hist.length - 1].t >= 0.1 - 1e-9) sim.hist.push({t: sim.t, c: Array.from(ode.c)});
  if (sim.t - sim.dots[sim.dots.length - 1].t >= 0.25 - 1e-9) sim.dots.push({t: sim.t, n: box.counts.slice()});
  if (sim.t - sim.snaps[sim.snaps.length - 1].t >= 0.25 - 1e-9) takeSnap();
  sim.evLog.push({t: sim.t, e: box.channels.map(c => c.events)});
  while (sim.evLog.length > 2 && sim.t - sim.evLog[1].t >= 1) sim.evLog.shift();
  // 長く動かしたら、古い記録を間引く
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
    syncSeek();
    if (ts - uiTimer > 200){ uiTimer = ts; renderLive(); }
  }
  requestAnimationFrame(frame);
}
function setRunning(on){
  if (on && viewT !== null) resumeFromView();
  running = on;
  $('btnPlay').classList.toggle('on', on);
  $('btnPlay').setAttribute('aria-label', on ? '止める' : '動かす');
  if (on){ lastTs = 0; requestAnimationFrame(frame); }
  renderLive();
}
function reset(){ setRunning(false); newSim(); renderStatic(); renderLive(); drawAll(); }

// ---- 時間のスライダー：前の場面を見る・そこから続ける ----
function snapAt(t){ let s = sim.snaps[0]; for (const x of sim.snaps){ if (x.t <= t + 1e-9) s = x; else break; } return s; }
function seekTo(t){
  if (running) setRunning(false);
  viewT = t >= sim.t - 1e-6 ? null : snapAt(t).t;
  renderLive(); drawAll();
}
// 前の場面から続ける：その場面の粒子・濃度・条件に戻し、あとの記録を消す。
// keepCond：条件はいまの値（スライダーなどで変えたばかりの値）のままにする
function resumeFromView(keepCond){
  const s = snapAt(viewT);
  box.restore(s.box);
  ode.c = Float64Array.from(s.c); ode.h = undefined;
  sim.t = s.t; sim.scale = s.scale; sim.acc = 0;
  sim.hist = sim.hist.filter(h => h.t <= s.t + 1e-9);
  if (!sim.hist.length || sim.hist[sim.hist.length - 1].t < s.t - 1e-9) sim.hist.push({t: s.t, c: s.c.slice()});
  sim.dots = sim.dots.filter(d => d.t <= s.t + 1e-9);
  sim.snaps = sim.snaps.filter(x => x.t <= s.t + 1e-9);
  sim.evLog = [{t: s.t, e: box.channels.map(c => c.events)}];
  // 条件もその場面に戻す
  if (!keepCond){ state.T[pre.key] = s.cond.T; state.cat = s.cond.cat; state.rev = s.cond.rev; save(); }
  makeConsts(); S.setConstants(cn, consts);
  sim.eq = eqFrom(ode.c);
  viewT = null;
  renderStatic();
}
function syncSeek(){
  const t = viewT ?? sim.t;
  $('seek').max = sim.t.toFixed(2);
  $('seek').value = t.toFixed(2);
  $('tLabel').textContent = t.toFixed(1) + ' s';
}
// いま画面に出す状態（スライダーで前の場面を見ているときは、その場面）
function shown(){
  if (viewT === null) return {t: sim.t, c: Array.from(ode.c), counts: box.counts, box, past: false};
  const s = snapAt(viewT);
  return {t: s.t, c: s.c, counts: s.box.counts, box: box.viewOf(s.box), past: true, cond: s.cond};
}

// ---- 条件を変える（温度・触媒・逆反応は、動かしている途中でもそのまま効く） ----
function applyConditions(){
  if (viewT !== null) resumeFromView(true);
  makeConsts(); S.setConstants(cn, consts);
  box.setKT(Tnow() / pre.Tref);
  ode.h = undefined;
  sim.eq = eqFrom(ode.c);
  chooseScale(false);
  renderStatic(); renderLive(); drawAll();
}

// ---- 描く ----
function drawBox(st){
  const cv = $('boxCv'), {ctx, w, h} = CH.fitCanvas(cv);
  const k = Math.min(w / BOX_W, h / BOX_H), ox = (w - BOX_W * k) / 2, oy = (h - BOX_H * k) / 2;
  ctx.clearRect(0, 0, w, h);
  // 色のある気体（I₂ など）は、濃さに合わせて箱をうすく色づける
  const ti = sp.findIndex(x => x.tint);
  const tint = ti >= 0 ? {color: sp[ti].tint, alpha: (isDark() ? 0.22 : 0.2) * (st.counts[ti] / sigma) / Math.max(...pre.starts.map(s => s.c[sp[ti].key] || 0), 1e-9)} : null;
  PT.drawBox(ctx, st.box, {x: ox, y: oy, scale: k}, {dark: isDark(), labels: state.labels, tint, bg: css('--paper') || undefined,
    flashColors: [css('--kf') || '#d97706', css('--kb') || '#0d9488']});
  ctx.strokeStyle = css('--line') || '#d9dde3'; ctx.lineWidth = 1; ctx.strokeRect(ox + 0.5, oy + 0.5, BOX_W * k - 1, BOX_H * k - 1);
}
function halfTimes(){
  const i = refIdx(), c0 = sim.c0[i];
  if (!(c0 > 0)) return {};
  const ser = sim.hist.map(h => ({t: h.t, v: h.c[i]}));
  return {i, c0, t1: S.crossTime(ser, c0 / 2), t2: S.crossTime(ser, c0 / 4)};
}
function drawChart(st){
  const cv = $('chartCv'), {ctx, w, h} = CH.fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const idx = chartSp();
  const tEnd = Math.max(sim.t, ghost ? ghost.tEnd : 0);
  const tMax = Math.max(20, CH.niceMax(tEnd * 1.08 + 1, 6));
  let yTop = 0;
  for (const hh of sim.hist) for (const i of idx) yTop = Math.max(yTop, hh.c[i]);
  if (ghost) for (const s of ghost.series) for (const [, v] of s.pts) yTop = Math.max(yTop, v);
  if (sim.eq) for (const i of idx) yTop = Math.max(yTop, sim.eq[i]);
  const series = [];
  if (ghost) for (const s of ghost.series) series.push({color: s.color, width: 1.8, dash: [3, 4], alpha: 0.75, pts: s.pts});
  // 前の物質と同じ濃度で動く物質（H₂ と I₂ など）は、線が重なって見えなくなるので破線にする
  const same = i => idx.some(j => j < i && sim.hist.every(hh => Math.abs(hh.c[i] - hh.c[j]) < 1e-12));
  for (const i of idx){
    const col = lineColor(sp[i].key, i);
    if (state.dots) series.push({color: col, dots: true, alpha: 0.38, r: 2, pts: sim.dots.map(d => [d.t, d.n[i] / sigma])});
    series.push({color: col, width: 2.4, dash: same(i) ? [7, 7] : null, pts: sim.hist.map(hh => [hh.t, hh.c[i]])});
  }
  const hlines = state.eqLines && sim.eq ? idx.map(i => ({y: sim.eq[i], color: lineColor(sp[i].key, i), dash: [6, 5]})) : [];
  const vlines = [];
  // 速度のタブ：半減期（基準の物質が初めの ½・¼ になるところ）
  const hf = state.tab === 'rate' ? halfTimes() : {};
  if (hf.c0){
    hlines.push({y: hf.c0 / 2, color: css('--muted'), dash: [2, 4], label: '初めの ½'});
    if (hf.t2 != null) hlines.push({y: hf.c0 / 4, color: css('--muted'), dash: [2, 4], label: '初めの ¼'});
    if (hf.t1 != null) vlines.push({x: hf.t1, color: css('--muted'), dash: [2, 4]});
    if (hf.t2 != null) vlines.push({x: hf.t2, color: css('--muted'), dash: [2, 4]});
  }
  if (st.past) vlines.push({x: st.t, color: css('--accent'), dash: [], width: 1.6});
  const r = CH.lineChart(ctx, {x: 0, y: 0, w, h}, {
    x: {min: 0, max: tMax, label: '時間（s・模型の時間）'}, y: {min: 0, max: CH.niceMax(yTop * 1.08 || 1, 5), label: '濃度（mol/L）'},
    colors: {bg: css('--paper') || '#fff', text: css('--text'), muted: css('--muted'), grid: isDark() ? '#2a2e35' : '#eceef1', axis: css('--muted')},
    series, hlines, vlines});
  // 半減期の文字
  ctx.font = '600 11.5px -apple-system, "Hiragino Sans", sans-serif'; ctx.fillStyle = css('--text'); ctx.textBaseline = 'top';
  const lab = (t, txt, dy) => { const x = r.X(t); const right = x > r.plot.x + r.plot.w - 90; ctx.textAlign = right ? 'right' : 'left'; ctx.fillText(txt, x + (right ? -4 : 4), r.plot.y + dy); };
  if (hf.t1 != null) lab(hf.t1, 't½ = ' + hf.t1.toFixed(1) + ' s', 4);
  if (hf.t2 != null) lab(hf.t2, '¼ まで ' + hf.t2.toFixed(1) + ' s', 20);
}
function drawAll(){ const st = shown(); drawBox(st); drawChart(st); }

// ---- 文字の表示 ----
const spOf = key => sp.find(x => x.key === key);
const sideHTML = list => list.map(([k, n]) => (n > 1 ? n : '') + fHTML(spOf(k).f)).join(' + ');
const sideText = list => list.map(([k, n]) => (n > 1 ? n : '') + fText(spOf(k).f)).join(' + ');
const eqnHTML = () => sideHTML(pre.react) + '<span class="arr">' + (isRev() ? '⇄' : '→') + '</span>' + sideHTML(pre.prod);
const fmtT = T => T + ' K（' + Math.round(T - 273) + ' ℃）';
const br = key => '[' + fHTML(spOf(key).f) + ']';
const powTxt = (s, n) => n > 1 ? s + '<sup>' + n + '</sup>' : s;
function kUnit(order){
  if (order === 1) return '/s';
  if (order === 2) return 'L/(mol·s)';
  return 'L<sup>' + (order - 1) + '</sup>/(mol<sup>' + (order - 1) + '</sup>·s)';
}
const orderList = () => pre.order ? Object.entries(pre.order) : pre.react;
const orderSum = list => list.reduce((s, [, n]) => s + n, 0);
const rateLawHTML = () => 'v = k' + orderList().map(([k, n]) => powTxt(br(k), n)).join('');
function renderStatic(){
  document.querySelectorAll('#tabSeg [data-tab]').forEach(b => { const on = b.dataset.tab === state.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  $('rxName').innerHTML = pre.short;
  $('eqn').innerHTML = eqnHTML();
  $('rxList').innerHTML = D.REACTION_PRESETS.map(p => '<button type="button" class="mi' + (p.key === state.preset ? ' on' : '') + '" role="menuitemradio" aria-checked="' + (p.key === state.preset) +
    '" data-rx="' + p.key + '"><span class="dot"></span><span>' + p.short + '<small>' + esc(p.name) + '</small></span></button>').join('');
  const rate = state.tab === 'rate';
  // 初めの状態（反応を見るタブ）
  $('startCtl').hidden = rate || pre.starts.length < 2;
  $('startSeg').innerHTML = pre.starts.map(s => '<button type="button" role="radio" data-start="' + s.key + '" aria-checked="' + (s.key === state.start) + '" class="' + (s.key === state.start ? 'on' : '') + '">' + s.label + '</button>').join('');
  // 温度
  const ts = $('tSlider'); ts.min = pre.Tmin; ts.max = pre.Tmax; ts.step = pre.Tstep; ts.value = Tnow();
  $('tVal').textContent = fmtT(Tnow());
  // 初めの濃度（速度のタブ）
  $('c0Ctl').hidden = !rate;
  if (rate){
    const c0 = startConc();
    $('c0Ctl').innerHTML = '<span class="lbl">初めの濃度</span>' + Object.entries(pre.c0Range || {}).map(([k, rg]) => {
      const i = sp.findIndex(x => x.key === k);
      return '<label class="mini-sl" title="初めの濃度（mol/L。変えると最初に戻る）"><span>' + br(k) + '<sub>0</sub></span><input type="range" data-c0="' + k + '" min="' + rg[0] + '" max="' + rg[1] + '" step="' + rg[2] + '" value="' + c0[i] + '" aria-label="' + esc(spOf(k).name) + 'の初めの濃度"><span class="val" data-c0v="' + k + '">' + c0[i].toFixed(2) + '</span></label>';
    }).join('');
  }
  $('catCtl').hidden = !rate || !pre.catEa;
  document.querySelectorAll('#catSeg [data-cat]').forEach(b => { const on = (b.dataset.cat === '1') === state.cat; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  $('revCtl').hidden = !rate || !isRev();
  document.querySelectorAll('#revSeg [data-rev]').forEach(b => { const on = (b.dataset.rev === '1') === state.rev; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  $('btnCompare').hidden = !rate;
  $('tabRatePane').hidden = !rate;
  // 分子の凡例
  $('molLegend').innerHTML = sp.map((x, i) => '<span class="ml" title="' + esc(x.name) + (x.solvent ? '（溶媒。グラフには出さない）' : '') + '"><canvas data-mol="' + i + '"></canvas><span class="f">' + fHTML(x.f) + '</span>' +
    (x.solvent ? '' : '<span class="sw" style="background:' + lineColor(x.key, i) + '"></span>') + '<span class="n" data-n="' + i + '"></span></span>').join('');
  document.querySelectorAll('#molLegend canvas').forEach(cv => {
    const {ctx, w, h} = CH.fitCanvas(cv), shp = box.sp[+cv.dataset.mol].shape, k = Math.min(0.9, (w - 4) / (2 * shp.r), (h - 2) / (2 * shp.r));
    ctx.clearRect(0, 0, w, h); PT.drawMolecule(ctx, shp, w / 2, h / 2, k, isDark(), box.sp[+cv.dataset.mol].label);
  });
  $('chartLegend').innerHTML = '<span><i></i>計算の値</span>' + (state.dots ? '<span><i class="dot"></i>粒子の数から</span>' : '') +
    (state.eqLines && sim.eq ? '<span><i class="dash"></i>平衡の濃度</span>' : '') +
    (ghost ? '<span class="gh"><i class="dot2"></i>比べる：' + esc(ghost.label) + '<button type="button" class="x" id="ghostClear" title="比べる線を消す" aria-label="比べる線を消す">×</button></span>' : '');
  if (ghost) $('ghostClear').onclick = () => { ghost = null; renderStatic(); drawAll(); };
  document.querySelectorAll('#countSeg [data-count]').forEach(b => b.classList.toggle('on', +b.dataset.count === state.count));
  $('optLabels').checked = state.labels; $('optEq').checked = state.eqLines; $('optDots').checked = state.dots;
  $('spdSel').value = String(state.speed);
  if (openPane === 'rate') renderRateStatic();
}

// いまの状態（Q と K）
function qkInfo(c, rev){
  if (!isRev()) return {kind: 'irr'};
  const lnQ = S.lnQ(cn, c), lnK = Math.log(consts.K), Q = Math.exp(lnQ);
  if (!rev) return {Q, kind: 'norev'};
  return {Q, kind: Math.abs(lnQ - lnK) < 0.02 ? 'eq' : lnQ < lnK ? 'fwd' : 'bwd'};
}
// 表示する速さ（基準の物質が減る速さ。教科書の v）
// v₁ = k₁·Π[反応物]^次数、v₂ = k₂·Π[生成物]^係数（k は、いまの条件か、見ている場面の条件の定数）
function dispRates(c, k){
  const pw = list => list.reduce((s, [kk, n]) => s * Math.pow(Math.max(0, c[sp.findIndex(x => x.key === kk)]), n), 1);
  return {v1: k.k1 * pw(orderList()), v2: k.k2 * pw(pre.prod)};
}
// 前の場面を見ているときは、その場面の条件の定数
const constsOf = st => st.cond ? S.constants(pre, st.cond.T, {catalyst: state.tab === 'rate' && st.cond.cat && !!pre.catEa, reverse: !(state.tab === 'rate' && !st.cond.rev)}) : consts;
function renderLive(){
  const st = shown(), c = st.c, k = constsOf(st), {Q, kind} = qkInfo(c, k.reverse);
  $('chipQK').hidden = kind === 'irr';
  if (kind !== 'irr') $('chipQK').innerHTML = 'Q = ' + (!isFinite(Q) ? '∞' : S.sig(Q)) + (kind === 'norev' ? '、' : kind === 'eq' ? ' ≈ ' : kind === 'fwd' ? ' &lt; ' : ' &gt; ') + 'K = ' + S.sig(k.K);
  const msg = {eq: '平衡（v₁ = v₂）：見かけ上、濃度が変わらない', fwd: '正反応の向きに進んでいる（v₁ > v₂）', bwd: '逆反応の向きに進んでいる（v₁ < v₂）',
    norev: '逆反応を止めている：正反応だけが進む', irr: spOf(refKey()).name + 'が減っていく（逆反応は起こらない）'}[kind];
  $('status').textContent = (st.past ? '【' + st.t.toFixed(1) + ' s の場面】' : '') + msg;
  $('status').classList.toggle('eq', kind === 'eq');
  const v = dispRates(c, k);
  $('chipV').innerHTML = (isRev() ? 'v₁ = ' : 'v = ') + S.sig(v.v1) + (isRev() && k.reverse ? '　v₂ = ' + S.sig(v.v2) : '') + ' mol/(L·s)';
  // 箱の上：この 1 秒の反応の回数（模型の時間で）
  const a = sim.evLog[0], b = sim.evLog[sim.evLog.length - 1], span = b.t - a.t;
  if (!st.past && span > 0.3){
    const r = b.e.map((e, i) => Math.round((e - a.e[i]) / span));
    $('evRate').innerHTML = '正反応 <b class="kf">' + r[0] + '</b> 回/s' + (isRev() ? ' ・ 逆反応 <b class="kb">' + (r[1] ?? 0) + '</b> 回/s' : '');
  } else $('evRate').textContent = '';
  document.querySelectorAll('#molLegend [data-n]').forEach(n => { n.textContent = st.counts[+n.dataset.n] + ' 個'; });
  // 再生の表示
  const atStart = sim.t === 0 && !running;
  $('bigPlay').hidden = !atStart;
  $('pausedMark').hidden = running || atStart;
  $('pausedMark').textContent = st.past ? st.t.toFixed(1) + ' s の場面（▶ でここから続ける）' : '止めています（▶ で続ける）';
  $('scaleNote').hidden = sim.scale >= 1 || st.past || !running;
  $('scaleNote').textContent = '反応が速いので、時間を ' + fracText(sim.scale) + ' の速さで進めています';
  syncSeek();
  $('hint').textContent = running ? '光った所で反応が起きています（橙：正反応' + (isRev() ? '、青緑：逆反応' : '') + '）' :
    st.past ? '時間のつまみで前の場面を見ています。▶ でここから続けます' : '箱の ▶（スペースキー）で動かします';
  if (openPane === 'num') renderNum(st, Q, kind, k);
  if (openPane === 'rate') renderRateLive(st, k);
}
const fracText = s => s >= 1 ? '1' : '1/' + Math.round(1 / s);
function renderNum(st, Q, kind, k){
  const c = st.c, V = pre.V, T = k.T, v = dispRates(c, k);
  const rows = sp.map((x, i) => '<tr><td><span class="sw" style="background:' + (x.solvent ? 'transparent' : lineColor(x.key, i)) + '"></span><span class="f">' + fHTML(x.f) + '</span></td>' +
    '<td>' + st.counts[i] + '</td>' + (x.solvent ? '<td colspan="3" class="mut">（溶媒）</td>' :
    '<td>' + S.sig(c[i] * V) + '</td><td>' + S.sig(c[i]) + '</td><td>' + (x.st === '気' ? S.sig(S.partialPressure(c[i], T)) : '—') + '</td>') + '</tr>').join('');
  const kExpr = list => list.map(([kk, n]) => powTxt(br(kk), n)).join('');
  const numExpr = list => list.map(([kk, n]) => powTxt('(' + S.sig(c[sp.findIndex(x => x.key === kk)]) + ')', n)).join(' × ');
  let html = '<div class="card"><h4>いまの量（' + esc(fmtT(T)) + '、体積 ' + V + ' L）</h4>' +
    '<table class="ntbl"><tr><th>物質</th><th>粒子</th><th>物質量<br>mol</th><th>濃度<br>mol/L</th><th>分圧<br>Pa</th></tr>' + rows + '</table>' +
    '<p class="small">物質量・濃度・分圧は計算の値。「粒子」は箱の中の数（1 個 = ' + S.sig(V / sigma) + ' mol）。</p></div>';
  if (isRev()){
    const qTxt = !isFinite(Q) ? '∞（反応物がない）' : S.sig(Q);
    const verdict = {eq: '<span class="verdict eq">Q ≈ K：平衡</span>', fwd: '<span class="verdict">Q &lt; K：正反応の向きに進む</span>',
      bwd: '<span class="verdict">Q &gt; K：逆反応の向きに進む</span>', norev: '<span class="verdict">逆反応を止めているので、平衡にはならない</span>'}[kind];
    const kp = S.Kp(k.K, T, k.dn);
    html += '<div class="card"><h4>平衡定数と反応商</h4>' +
      '<div class="frm">K = <span class="big">' + kExpr(pre.prod) + ' / ' + kExpr(pre.react) + '</span></div>' +
      '<dl class="kv"><dt>K（濃度）</dt><dd><b>' + S.sig(k.K) + '</b>（' + esc(fmtT(T)) + '）</dd>' +
      '<dt>Kp（分圧）</dt><dd>' + S.sig(kp) + (k.dn === 0 ? '（Δn = 0 なので K と同じ）' : ' Pa<sup>' + k.dn + '</sup>（Kp = K(RT)<sup>' + k.dn + '</sup>）') + '</dd>' +
      '<dt>いまの Q</dt><dd>' + numExpr(pre.prod) + ' / (' + numExpr(pre.react) + ') = <b>' + qTxt + '</b></dd></dl>' +
      '<p>' + verdict + '</p></div>';
  }
  const ordF = orderSum(orderList()), ordB = orderSum(pre.prod);
  html += '<div class="card"><h4>速さ' + (isRev() ? '（正反応 v₁・逆反応 v₂）' : '') + '</h4>' +
    '<dl class="kv"><dt>' + (isRev() ? 'v₁ = k₁' : 'v = k') + kExpr(orderList()) + '</dt><dd><b class="kf">' + S.sig(v.v1) + '</b> mol/(L·s)</dd>' +
    (isRev() ? '<dt>v₂ = k₂' + kExpr(pre.prod) + '</dt><dd><b class="kb">' + S.sig(v.v2) + '</b> mol/(L·s)' + (k.reverse ? '' : '（止めている）') + '</dd>' : '') +
    '<dt>' + (isRev() ? 'k₁' : 'k') + '</dt><dd>' + S.sig(k.k1) + ' ' + kUnit(ordF) + '</dd>' +
    (isRev() ? '<dt>k₂</dt><dd>' + S.sig(k.k1 / k.K) + ' ' + kUnit(ordB) + '</dd><dt>k₁ / k₂</dt><dd><b>' + S.sig(k.K) + '</b> = K</dd>' : '') + '</dl>' +
    (isRev() ? '<p class="small">平衡では v₁ = v₂ なので、k₁' + kExpr(pre.react) + ' = k₂' + kExpr(pre.prod) + '。だから K = k₁ / k₂ になります。' : '<p class="small">') +
    'v は ' + fHTML(spOf(refKey()).f) + ' が減る速さ。速度定数は模型の時間での値です。</p></div>';
  html += '<div class="card"><h4>この反応のエネルギー</h4>' +
    '<dl class="kv"><dt>活性化エネルギー（正反応）Ea₁</dt><dd>' + S.sig(k.Ea1, 4) + ' kJ/mol' + (k.catalyst ? '（触媒あり）' : '') + '</dd>' +
    '<dt>活性化エネルギー（逆反応）Ea₂</dt><dd>' + S.sig(k.Ea2, 4) + ' kJ/mol</dd>' +
    '<dt>反応エンタルピー ΔH</dt><dd>' + pre.dH + ' kJ（' + (pre.dH < 0 ? '発熱' : '吸熱') + '）' + (k.nu > 1 ? '。' + fHTML(spOf(refKey()).f) + ' 1 mol あたり ' + k.dHref + ' kJ' : '') + '</dd></dl>' +
    '<p class="small">ΔH = Ea₁ − Ea₂' + (pre.abstract ? '（記号の反応なので、値は例）' : '。ΔH は生成エンタルピーの表から') + '。</p></div>';
  $('numBody').innerHTML = html;
}

// ---- 右の「速さ」パネル ----
function renderRateStatic(){
  const T = Tnow(), ref = spOf(refKey());
  // エネルギー図（基準の物質 1 mol あたり）
  const react = pre.react.map(([k, n]) => (consts.nu > 1 ? '' : n > 1 ? n : '') + fText(spOf(k).f)).join(' + ');
  const prod = consts.nu > 1 ? pre.prod.map(([k, n]) => { const m = n / consts.nu; return (m === 1 ? '' : m === 0.5 ? '½' : m) + fText(spOf(k).f); }).join(' + ') : sideText(pre.prod);
  $('epFig').innerHTML = CH.energyProfileSVG({Ea1: pre.Ea1, dH: consts.dHref, EaCat: catOn() ? pre.Ea1 - pre.catEa : null, react, prod, irreversible: !isRev()});
  $('epNote').innerHTML = (consts.nu > 1 ? fHTML(ref.f) + ' 1 mol あたり、' : '') + '単位は kJ/mol。' +
    (pre.catEa ? '触媒を「あり」にすると、点線の道すじ（Ea が ' + pre.catEa + ' kJ/mol 低い、模型の触媒）になる。' + esc(pre.catNote || '') : '') +
    (!isRev() ? '逆反応は Ea₂ がとても大きいので、ほとんど起こらない。' : '') + '触媒は Ea₁ と Ea₂ を同じだけ下げるので、ΔH は変わらない。';
  // 分布（形の目安）
  $('mbFig').innerHTML = CH.distributionSVG({T, Tcmp: T - 10, Tref: pre.Tref, Ea: 1, EaCat: catOn() ? (pre.Ea1 - pre.catEa) / pre.Ea1 : null});
  const fr = (Ea, TT) => S.fractionAbove(Ea, TT);
  const ratio = fr(pre.Ea1, T) / fr(pre.Ea1, T - 10);
  $('mbNote').innerHTML = '<p class="small">温度が高いと、エネルギーの大きい分子が増え、Ea を超える分子（色の部分）が増える。図は形の目安（横軸は縮めてある。実際の Ea は RT の約 ' + Math.round(pre.Ea1 * 1000 / (S.R * T)) + ' 倍で、Ea を超える分子はごくわずか）。</p>' +
    '<dl class="kv"><dt>Ea を超える割合 e<sup>−Ea/RT</sup></dt><dd>' + S.sig(fr(pre.Ea1, T)) + '（' + T + ' K）</dd>' +
    '<dt>10 K 低いとき（' + (T - 10) + ' K）と比べて</dt><dd><b>' + ratio.toFixed(2) + ' 倍</b></dd>' +
    (pre.catEa ? '<dt>触媒ありでは</dt><dd>' + S.sig(fr(pre.Ea1 - pre.catEa, T)) + '（触媒なしの <b>' + S.sig(fr(pre.Ea1 - pre.catEa, T) / fr(pre.Ea1, T)) + ' 倍</b>）</dd>' : '') + '</dl>';
  renderRecords();
}
function renderRateLive(st, k){
  const ord = orderList(), os = orderSum(ord), v = dispRates(st.c, k);
  const ordTxt = ord.map(([kk, n]) => fHTML(spOf(kk).f) + ' について ' + n + ' 次').join('、') + (ord.length > 1 ? '、全体で ' + os + ' 次' : '');
  $('rateLaw').innerHTML = '<h4>反応速度式</h4><div class="frm"><span class="big">' + rateLawHTML() + '</span></div>' +
    '<dl class="kv"><dt>反応の次数</dt><dd>' + ordTxt + '</dd>' +
    '<dt>速度定数 k</dt><dd><b>' + S.sig(k.k1) + '</b> ' + kUnit(os) + '（' + k.T + ' K' + (k.catalyst ? '・触媒あり' : '') + '）</dd>' +
    '<dt>いまの v</dt><dd>' + S.sig(v.v1) + ' mol/(L·s)</dd></dl>' +
    '<p class="small">v は ' + fHTML(spOf(refKey()).f) + ' が減る速さ。' + (isRev() && k.reverse ? '逆反応も起こるので、見かけの速さは v₁ − v₂（' + S.sig(v.v1 - v.v2) + '）。' : '') +
    (pre.order ? '反応速度式は反応式の係数からは決まらず、実験で決める（この反応は一次反応）。' : '模型では、反応式どおりに 1 回の衝突で起こる（素反応）として速度式を決めている。') + '</p>';
  const hf = halfTimes(), ref = spOf(refKey());
  const t12 = hf.t1 != null && hf.t2 != null ? hf.t2 - hf.t1 : null;
  $('halfLife').innerHTML = '<h4>半減期（' + fHTML(ref.f) + ' が半分になる時間）</h4>' +
    '<dl class="kv"><dt>初め → ½</dt><dd>' + (hf.t1 != null ? '<b>' + hf.t1.toFixed(1) + ' s</b>' : 'まだ') + '</dd>' +
    '<dt>½ → ¼</dt><dd>' + (t12 != null ? '<b>' + t12.toFixed(1) + ' s</b>' : hf.t1 != null && sim.eq && sim.eq[hf.i] > hf.c0 / 4 ? '¼ までは減らない（平衡）' : 'まだ') + '</dd></dl>' +
    '<p class="small">一次反応では、半減期は濃度によらず一定（2 つが同じ）。二次反応では、濃度が下がると半減期が長くなる（½ → ¼ の方が長い）。' +
    (isRev() && k.reverse ? '逆反応を「止める」にすると、正反応だけの半減期がわかる。' : '') + '</p>';
}
function renderRecords(){
  const recs = state.records[pre.key] || [];
  const ks = Object.keys(pre.c0Range || {});
  if (!recs.length){ $('recTable').innerHTML = '<p class="small mut">まだ記録はありません。</p>'; return; }
  $('recTable').innerHTML = '<table class="ntbl rec"><tr><th>#</th>' + ks.map(k => '<th>' + br(k) + '<sub>0</sub></th>').join('') + '<th>温度</th><th>触媒</th><th>初めの速さ v₀<br>mol/(L·s)</th></tr>' +
    recs.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + ks.map(k => '<td>' + (+r.c[k]).toFixed(2) + '</td>').join('') + '<td>' + r.T + ' K</td><td>' + (r.cat ? 'あり' : 'なし') + '</td><td><b>' + S.sig(r.v0) + '</b></td></tr>').join('') + '</table>';
}

// ---- 操作 ----
$('btnPlay').onclick = () => setRunning(!running);
$('bigPlay').onclick = () => setRunning(true);
$('btnReset').onclick = () => { reset(); toast('最初に戻しました（▶ で動かす）'); };
$('seek').addEventListener('input', e => seekTo(+e.target.value));
$('spdSel').onchange = e => { const v = +e.target.value; if (SPEEDS.includes(v)){ state.speed = v; save(); } };
$('tabSeg').onclick = e => {
  const b = e.target.closest('[data-tab]'); if (!b || b.dataset.tab === state.tab) return;
  state.tab = b.dataset.tab; save(); reset();
  if (!narrow() && innerWidth > 1200) openSide(state.tab === 'rate' ? 'rate' : 'num', true);
  else if (openPane === 'rate' && state.tab !== 'rate') openSide('num', true);
};
$('startSeg').onclick = e => { const b = e.target.closest('[data-start]'); if (!b || b.dataset.start === state.start) return; state.start = b.dataset.start; save(); reset(); };
$('rxList').onclick = e => {
  const b = e.target.closest('[data-rx]'); if (!b) return;
  const m = $('rxMenu'); m.classList.add('closed'); setTimeout(() => m.classList.remove('closed'), 400);
  if (b.dataset.rx !== state.preset){ state.preset = b.dataset.rx; ghost = null; save(); reset(); }
};
$('tSlider').addEventListener('input', e => { state.T[pre.key] = +e.target.value; save(); applyConditions(); });
$('c0Ctl').addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.c0; if (!k) return;
  document.querySelector('[data-c0v="' + k + '"]').textContent = (+e.target.value).toFixed(2);
});
$('c0Ctl').addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.c0; if (!k) return;
  (state.c0[pre.key] = state.c0[pre.key] || {})[k] = Math.round(+e.target.value * 100) / 100; save(); reset();
});
$('catSeg').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; state.cat = b.dataset.cat === '1'; save(); applyConditions(); };
$('revSeg').onclick = e => { const b = e.target.closest('[data-rev]'); if (!b) return; state.rev = b.dataset.rev === '1'; save(); applyConditions(); };
$('btnCompare').onclick = () => {
  if (sim.t === 0){ toast('先に ▶ で動かしてから「比べる」を押してください'); return; }
  const idx = chartSp(), c0 = sim.snaps[0].cond;
  ghost = {tEnd: sim.t, label: c0.T + ' K' + (pre.catEa ? '・触媒' + (c0.cat ? 'あり' : 'なし') : '') + '・' +
      Object.keys(pre.c0Range || {}).map(k => sim.c0[sp.findIndex(x => x.key === k)].toFixed(2)).join('/') + ' mol/L',
    series: idx.map(i => ({color: lineColor(sp[i].key, i), pts: sim.hist.map(h => [h.t, h.c[i]])}))};
  reset();
  toast('いまのグラフを点線で残しました。条件を変えて ▶ で動かすと比べられます', 4000);
};
$('btnRecord').onclick = () => {
  const ks = Object.keys(pre.c0Range || {}), c = {};
  ks.forEach(k => { c[k] = sim.c0[sp.findIndex(x => x.key === k)]; });
  const T0 = sim.snaps[0].cond.T, cat0 = sim.snaps[0].cond.cat && !!pre.catEa;
  const k0 = S.constants(pre, T0, {catalyst: cat0});
  const v0 = k0.k1 * orderList().reduce((s, [kk, n]) => s * Math.pow(sim.c0[sp.findIndex(x => x.key === kk)], n), 1);
  const recs = (state.records[pre.key] = state.records[pre.key] || []);
  recs.push({c, T: T0, cat: cat0, v0});
  if (recs.length > 20) recs.shift();
  save(); renderRecords();
  toast('記録しました。初めの濃度を変えて、また記録しましょう');
};
$('btnRecClear').onclick = () => { state.records[pre.key] = []; save(); renderRecords(); };
$('countSeg').onclick = e => { const b = e.target.closest('[data-count]'); if (!b) return; state.count = +b.dataset.count; save(); reset(); toast('粒子の数を変えて、最初に戻しました'); };
$('optLabels').onchange = e => { state.labels = e.target.checked; save(); drawAll(); };
$('optEq').onchange = e => { state.eqLines = e.target.checked; save(); renderStatic(); drawAll(); };
$('optDots').onchange = e => { state.dots = e.target.checked; save(); renderStatic(); drawAll(); };
$('chipQK').onclick = () => { if (openPane !== 'num') openSide('num'); };
$('chipV').onclick = () => { if (state.tab === 'rate' && openPane !== 'rate') openSide('rate'); };

// ---- 右のパネル ----
let openPane = '';
const narrow = () => matchMedia('(max-width:900px)').matches;
function openSide(p, keepOpen){
  openPane = openPane === p && !keepOpen ? '' : p;
  $('sidePanel').classList.toggle('open', !!openPane);
  document.querySelectorAll('.side-pane').forEach(n => { n.hidden = n.id !== 'pane' + openPane.charAt(0).toUpperCase() + openPane.slice(1); });
  document.querySelectorAll('.side-tab').forEach(t => { t.classList.toggle('on', t.dataset.pane === openPane); t.setAttribute('aria-selected', String(t.dataset.pane === openPane)); });
  lsSet(KEY.side, openPane || 'none');
  if (openPane === 'rate') renderRateStatic();
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
  const tgt = e.target.matches ? e.target : document.body;
  if (tgt.matches('input:not([type=range]), textarea, select')) return;
  if (e.key === '?'){ e.preventDefault(); $('btnHelp').click(); return; }
  if (e.key === ' ' && !tgt.matches('button, a, summary, input')){ e.preventDefault(); setRunning(!running); return; }
  if ((e.key === 'r' || e.key === 'R') && !tgt.matches('input')){ e.preventDefault(); $('btnReset').click(); }
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
renderStatic();
if (!narrow() && (savedPane === 'num' || savedPane === 'rate' || (savedPane === '' && innerWidth > 1200))){
  openSide(state.tab === 'rate' && savedPane !== 'num' ? 'rate' : 'num', true);
}
onResize();
// 開いたときは止めておく（箱の ▶ で動かす。作成者の指示 2026-10-06）
setRunning(false);
drawAll();
if (!hasUI) setTimeout(() => alert('共通部品（../shared/ui-kit.js）を読み込めませんでした。ページを再読み込みしてください。'), 200);

// 検証用（最後まで読み込めたことの印にもする）
window.__reaction = {S, PT, state, get sim(){ return sim; }, get box(){ return box; }, get ode(){ return ode; }, get consts(){ return consts; },
  get sigma(){ return sigma; }, get viewT(){ return viewT; }, get ghost(){ return ghost; }, setRunning, reset, advance, drawAll, seekTo, applyConditions};
})();
