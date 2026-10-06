// 化学系アプリの土台 A（グラフ）：canvas に描く折れ線・点のグラフ。毎コマ描きなおしても軽いように canvas を使う。
// 濃度・時間のグラフのほか、のちの滴定曲線・気体の P-V 図にも使う。ブラウザでは window.ChemChart。
(function (root) {
'use strict';

// canvas を、CSS の大きさ × 画面の解像度（Retina）に合わせる。描くときの座標は CSS の px。
function fitCanvas(cv){
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
  const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return {ctx, w, h, dpr};
}

// きりのよい目盛り（1・2・5 × 10ⁿ）
function niceStep(range, n = 5){
  if (!(range > 0)) return 1;
  const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function niceMax(v, n = 5){ const s = niceStep(v, n); return Math.ceil(v / s - 1e-9) * s || s; }
function ticks(min, max, n = 5){
  const s = niceStep(max - min, n), out = [];
  for (let v = Math.ceil(min / s - 1e-9) * s; v <= max + s * 1e-6; v += s) out.push(Math.abs(v) < s * 1e-9 ? 0 : v);
  return {step: s, values: out};
}
// 目盛りの数の書き方（刻みに合わせた桁数）
function tickText(v, step){
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(Math.min(6, d));
}

// ---- 折れ線グラフ ----
// spec = {x:{min, max, label}, y:{min, max, label}, colors:{bg, text, muted, grid, axis},
//   series:[{color, pts:[[x, y], ...], width, dash, dots, alpha, r}], hlines:[{y, color, dash, label}], vlines:[...], font}
// 戻り値：座標の変換（X(x)・Y(y)）と、グラフの枠（plot）。
function lineChart(ctx, rect, spec){
  const C = Object.assign({bg: '#fff', text: '#1f2933', muted: '#6b7480', grid: '#e5e8ec', axis: '#9aa3ad'}, spec.colors || {});
  const font = spec.font || '-apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
  const fs = spec.fontSize || 11.5;
  const xt = ticks(spec.x.min, spec.x.max, spec.x.n || 6), yt = ticks(spec.y.min, spec.y.max, spec.y.n || 5);
  ctx.save();
  ctx.font = fs + 'px ' + font;
  const yw = Math.max(...yt.values.map(v => ctx.measureText(tickText(v, yt.step)).width));
  const pad = {l: yw + 12 + (spec.y.label ? fs + 6 : 0), r: 12, t: 10, b: fs * 2 + 14 + (spec.x.label ? 2 : 0)};
  const plot = {x: rect.x + pad.l, y: rect.y + pad.t, w: Math.max(10, rect.w - pad.l - pad.r), h: Math.max(10, rect.h - pad.t - pad.b)};
  const X = v => plot.x + (v - spec.x.min) / (spec.x.max - spec.x.min) * plot.w;
  const Y = v => plot.y + plot.h - (v - spec.y.min) / (spec.y.max - spec.y.min) * plot.h;
  ctx.fillStyle = C.bg; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // 方眼と目盛り
  ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yt.values){ const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke(); ctx.fillText(tickText(v, yt.step), plot.x - 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of xt.values){ const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke(); ctx.fillText(tickText(v, xt.step), x, plot.y + plot.h + 5); }
  ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(plot.x + 0.5, plot.y); ctx.lineTo(plot.x + 0.5, plot.y + plot.h + 0.5); ctx.lineTo(plot.x + plot.w, plot.y + plot.h + 0.5); ctx.stroke();
  // 軸の名前
  ctx.fillStyle = C.text;
  if (spec.x.label){ ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(spec.x.label, plot.x + plot.w / 2, rect.y + rect.h - 1); }
  if (spec.y.label){ ctx.save(); ctx.translate(rect.x + fs / 2 + 2, plot.y + plot.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(spec.y.label, 0, 0); ctx.restore(); }
  // 線・点（枠の中だけに描く）
  ctx.save();
  ctx.beginPath(); ctx.rect(plot.x, plot.y - 2, plot.w + 2, plot.h + 4); ctx.clip();
  for (const l of spec.hlines || []){
    ctx.strokeStyle = l.color || C.muted; ctx.lineWidth = l.width || 1.2; ctx.setLineDash(l.dash || [5, 4]);
    const y = Y(l.y); ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke();
  }
  for (const l of spec.vlines || []){
    ctx.strokeStyle = l.color || C.muted; ctx.lineWidth = l.width || 1.2; ctx.setLineDash(l.dash || [5, 4]);
    const x = X(l.x); ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const s of spec.series){
    if (!s.pts || !s.pts.length) continue;
    ctx.globalAlpha = s.alpha == null ? 1 : s.alpha;
    if (s.dots){
      ctx.fillStyle = s.color; const r = s.r || 2;
      for (const [x, y] of s.pts){ ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => { if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y)); });
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // 線の名前（右端に）
  for (const l of spec.hlines || []) if (l.label){
    ctx.font = '600 ' + (fs - 0.5) + 'px ' + font; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = C.bg; ctx.strokeText(l.label, plot.x + plot.w - 4, Y(l.y) - 2);
    ctx.fillStyle = l.color || C.muted; ctx.fillText(l.label, plot.x + plot.w - 4, Y(l.y) - 2);
  }
  ctx.restore();
  return {X, Y, plot};
}

const api = {fitCanvas, niceStep, niceMax, ticks, tickText, lineChart};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemChart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
