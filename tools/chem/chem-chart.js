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

// ---- 反応のエネルギー図（反応の進み方 × エネルギー）。SVG の文字列を返す。色は CSS（.ep-*）で付ける ----
// o = {Ea1, dH, EaCat（触媒ありの Ea₁。なければ null）, react, prod（物質の文字。SVG の tspan を含めてよい）, irreversible}
function energyProfileSVG(o){
  const W = 330, H = 210, top = 26, bot = 160;
  const lo = Math.min(0, o.dH), hi = o.Ea1;
  const y = E => top + (hi - E) / (hi - lo || 1) * (bot - top);
  const y0 = y(0), yP = y(o.Ea1), yD = y(o.dH);
  const curve = peak => 'M34 ' + y0 + ' L98 ' + y0 + ' C130 ' + y0 + ' 138 ' + peak + ' 165 ' + peak + ' C192 ' + peak + ' 200 ' + yD + ' 232 ' + yD + ' L296 ' + yD;
  const n = v => (Math.round(v * 10) / 10).toString().replace('-', '−');
  const arrow = (x, ya, yb, cls) => '<line class="ep-ar ' + (cls || '') + '" x1="' + x + '" y1="' + ya + '" x2="' + x + '" y2="' + yb + '" marker-end="url(#epHead)"/>';
  let s = '<svg class="ep" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="反応のエネルギー図">' +
    '<defs><marker id="epHead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8z" class="ep-head"/></marker></defs>' +
    '<line class="ep-axis" x1="18" y1="' + (bot + 18) + '" x2="18" y2="10" marker-end="url(#epHead)"/><text class="ep-t sm" x="22" y="14">エネルギー</text>' +
    '<line class="ep-axis" x1="18" y1="' + (bot + 18) + '" x2="' + (W - 8) + '" y2="' + (bot + 18) + '" marker-end="url(#epHead)"/><text class="ep-t sm" x="' + (W - 10) + '" y="' + (bot + 32) + '" text-anchor="end">反応の進み方</text>';
  // 触媒ありの道すじ（点線）と、右上の凡例
  if (o.EaCat != null) s += '<path class="ep-cat" d="' + curve(y(o.EaCat)) + '"/>' +
    '<line class="ep-cat" x1="' + (W - 158) + '" y1="9" x2="' + (W - 138) + '" y2="9"/><text class="ep-t cat" x="' + (W - 134) + '" y="13">触媒あり（Ea₁ ' + n(o.EaCat) + '）</text>';
  s += '<path class="ep-curve" d="' + curve(yP) + '"/>';
  // 活性化エネルギー（正反応・逆反応）と ΔH の矢印
  s += '<line class="ep-guide" x1="98" y1="' + yP + '" x2="296" y2="' + yP + '"/>';
  s += arrow(66, y0, yP + 2, 'f') + '<text class="ep-t f" x="62" y="' + ((y0 + yP) / 2) + '" text-anchor="end">Ea₁</text><text class="ep-t f sm" x="62" y="' + ((y0 + yP) / 2 + 13) + '" text-anchor="end">' + n(o.Ea1) + '</text>';
  if (o.EaCat != null) s += arrow(82, y0, y(o.EaCat) + 2, 'cat');
  s += arrow(268, yD, yP + 2, o.irreversible ? 'b dim' : 'b') + '<text class="ep-t b" x="273" y="' + ((yD + yP) / 2) + '">Ea₂</text><text class="ep-t b sm" x="273" y="' + ((yD + yP) / 2 + 13) + '">' + n(o.Ea1 - o.dH) + '</text>';
  s += '<line class="ep-guide" x1="232" y1="' + y0 + '" x2="314" y2="' + y0 + '"/>';
  if (Math.abs(yD - y0) > 6) s += arrow(308, y0, yD - (yD > y0 ? 2 : -2), 'h');
  // ΔH の文字は、矢印の出発点（反応物の高さ）の線の上か下に（生成物の文字と重ならないように）
  s += '<text class="ep-t h" x="' + (W - 4) + '" y="' + (yD > y0 ? y0 - 4 : y0 + 13) + '" text-anchor="end">ΔH = ' + n(o.dH) + '</text>';
  s += '<text class="ep-t lv" x="66" y="' + (y0 + 15) + '" text-anchor="middle">' + o.react + '</text>';
  s += '<text class="ep-t lv" x="250" y="' + (yD + (yD >= y0 - 1 ? 15 : -6) + (Math.abs(yD - y0) < 16 && yD >= y0 ? 0 : 0)) + '" text-anchor="middle">' + o.prod + '</text>';
  return s + '</svg>';
}

// ---- 分子のエネルギーの分布（形の目安）。横軸のエネルギーは縮めて、Ea を「基準の温度の kT の 4 倍」の位置に描く ----
// o = {T, Tcmp（比べる温度）, Tref, Ea, EaCat（なければ null）}。f(E) ∝ √E·exp(−E/kT)（教科書の図と同じ形）
function distributionSVG(o){
  const W = 330, H = 176, x0 = 30, x1 = W - 12, yb = 140, yt = 22;
  const unit = 1 / 4;                        // 基準の温度の kT を Ea の 1/4 として描く
  const th = T => unit * T / o.Tref;         // 横軸は Ea = 1
  const Emax = 1.7;
  const f = (E, T) => { const t = th(T); return Math.sqrt(E) * Math.exp(-E / t) / Math.pow(t, 1.5); };
  const fmax = Math.max(f(th(Math.min(o.T, o.Tcmp)) / 2, Math.min(o.T, o.Tcmp)), 1e-9) * 1.08;
  const X = E => x0 + E / Emax * (x1 - x0), Y = v => yb - v / fmax * (yb - yt);
  const pts = (T, from = 0) => { const a = []; for (let i = 0; i <= 120; i++){ const E = from + (Emax - from) * i / 120; a.push(X(E).toFixed(1) + ' ' + Y(f(E, T)).toFixed(1)); } return a; };
  const line = T => 'M' + pts(T).join(' L');
  const area = (T, from) => 'M' + X(from).toFixed(1) + ' ' + yb + ' L' + pts(T, from).join(' L') + ' L' + X(Emax).toFixed(1) + ' ' + yb + 'z';
  let s = '<svg class="mb" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="分子のエネルギーの分布">';
  if (o.EaCat != null) s += '<path class="mb-area cat" d="' + area(o.T, o.EaCat) + '"/>';
  s += '<path class="mb-area" d="' + area(o.T, 1) + '"/>';
  s += '<path class="mb-cmp" d="' + line(o.Tcmp) + '"/><path class="mb-line" d="' + line(o.T) + '"/>';
  s += '<line class="mb-ea" x1="' + X(1) + '" y1="' + (yt - 6) + '" x2="' + X(1) + '" y2="' + yb + '"/><text class="ep-t f" x="' + (X(1) + 4) + '" y="' + (yt + 4) + '">Ea</text>';
  if (o.EaCat != null) s += '<line class="mb-ea cat" x1="' + X(o.EaCat) + '" y1="' + (yt + 10) + '" x2="' + X(o.EaCat) + '" y2="' + yb + '"/><text class="ep-t cat" x="' + (X(o.EaCat) - 4) + '" y="' + (yt + 20) + '" text-anchor="end">触媒あり</text>';
  s += '<line class="ep-axis" x1="' + x0 + '" y1="' + yb + '" x2="' + x1 + '" y2="' + yb + '"/><line class="ep-axis" x1="' + x0 + '" y1="' + yb + '" x2="' + x0 + '" y2="' + (yt - 10) + '"/>';
  s += '<text class="ep-t sm" x="' + x1 + '" y="' + (yb + 15) + '" text-anchor="end">分子のエネルギー →</text>';
  s += '<text class="ep-t sm" x="' + (x0 - 4) + '" y="' + (yt - 12) + '">分子の数の割合</text>';
  s += '<line class="mb-line" x1="' + (x1 - 120) + '" y1="' + (yt + 40) + '" x2="' + (x1 - 100) + '" y2="' + (yt + 40) + '"/><text class="ep-t sm" x="' + (x1 - 95) + '" y="' + (yt + 44) + '">' + o.T + ' K</text>';
  s += '<line class="mb-cmp" x1="' + (x1 - 120) + '" y1="' + (yt + 56) + '" x2="' + (x1 - 100) + '" y2="' + (yt + 56) + '"/><text class="ep-t sm" x="' + (x1 - 95) + '" y="' + (yt + 60) + '">' + o.Tcmp + ' K</text>';
  return s + '</svg>';
}

const api = {fitCanvas, niceStep, niceMax, ticks, tickText, lineChart, energyProfileSVG, distributionSVG};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemChart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
