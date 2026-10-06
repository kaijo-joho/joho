// 化学系アプリの土台 A（粒子）：2 次元の箱の中で分子がぶつかり、エネルギーが十分な衝突だけが反応する。
// 計算の部分は DOM に触らない（Node でテストする：dev/test-sim.cjs）。描く関数は canvas の ctx を受け取る。
// ブラウザでは window.ChemParticles。ChemSim（乱数）を先に読み込む。設計は docs/reaction-design.md の 2・3 章。
//
// しくみ（設計 2.2）：
// - 粒子は円（分子は原子の円を並べた形で描く）。弾性衝突。温度は一定に保つ（恒温槽）。
// - 2 つの粒子の反応は、衝突の「中心を結ぶ向き」のエネルギー E が、しきい値 E* 以上のときだけ起こす。
//   衝突のうち E ≥ E* のものの割合は exp(−E*/kT)。そこで、ほしい反応の回数 R（回/秒、数値計算の速さから）と、
//   ぶつかる回数の見込み Z から、exp(−E*/kT) = R / Z となる E* を毎回決める。粒子の数の平均が数値計算に合う。
// - 1 つの粒子の反応（分解など）は、粒子ごとに一定の確率で起こす。3 つ以上の粒子の反応は、回数を決めて近くの粒子を集める。
(function (root) {
'use strict';
const S = (typeof module === 'object' && module.exports) ? require('./chem-sim.js') : root.ChemSim;

// 原子の半径（箱の座標の単位）と色。色は分子模型エディタ（bunshi）の原子の色に合わせる。
const ATOM = {
  H: {r: 4.6, color: '#ffffff'}, C: {r: 6.8, color: '#333333'}, N: {r: 6.6, color: '#2152e6'}, O: {r: 6.3, color: '#e01f1f'},
  F: {r: 5.8, color: '#8fe050'}, Cl: {r: 7.6, color: '#1fb840'}, Br: {r: 8.2, color: '#8c2919'}, I: {r: 8.8, color: '#7a2ea1'},
  S: {r: 7.6, color: '#f2d11a'}, Na: {r: 8.0, color: '#ab5cf2'}
};
const atomOf = el => ATOM[el] || {r: 6.5, color: '#9aa3ad'};
const BOND = 0.72;   // 結合している原子どうしの重なり（中心の間の距離 = (r₁ + r₂) × BOND）

// 分子の形（いまは原子を横一列に並べる。3 原子までなら教科書の図に近い）
function moleculeShape(atoms){
  const parts = []; let x = 0;
  atoms.forEach((el, i) => {
    const a = atomOf(el);
    if (i > 0) x += (atomOf(atoms[i - 1]).r + a.r) * BOND;
    parts.push({el, x, y: 0, r: a.r, color: a.color});
  });
  const mid = (parts[0].x + parts[parts.length - 1].x) / 2;
  parts.forEach(p => { p.x -= mid; });
  const r = Math.max(...parts.map(p => Math.abs(p.x) + p.r));
  return {parts, r};
}

// 見やすさのため、重い分子と軽い分子の速さの差を小さくする：箱の中の質量 = (M/2)^(1/3)（H₂ を 1 とする）
const effMass = M => Math.cbrt(M / 2.016);
// 温度の基準（kT = 1 のとき）で、質量 1 の粒子の速さの 2 乗平均が 200 になるように
const KT_UNIT = 20000;
// 衝突の回数の見込みの補正に数える衝突の勢い（kT の何倍以上か）。混み合うと中くらいの勢いの衝突（かごの中でのぶつかり直し）が
// 増えるが、反応に効く強い衝突はあまり増えない。3kT 以上で数えると、反応の回数が計算に合う（dev/test-sim.cjs）。
const GTH = 3;

// ---- 箱を作る ----
// opt = {w, h, species:[{key, atoms:[...], M}], channels:[{reac:[i, j], prod:[k, l]}], seed, kT（基準の温度で 1）}
function createBox(opt){
  const rand = S.rng(opt.seed || 1);
  const sp = opt.species.map(s => {
    const shape = moleculeShape(s.atoms || [s.key]);
    return {key: s.key, shape, r: shape.r, m: effMass(s.M || 2), tint: s.tint || null};
  });
  const nS = sp.length;
  const channels = (opt.channels || []).map(ch => ({reac: ch.reac.slice(), prod: ch.prod.slice(),
    kind: ch.reac.length === 1 ? 'uni' : ch.reac.length === 2 ? 'bi' : 'event', Estar: Infinity, p: 0, saturated: false, events: 0,
    eff: {req: 0, got: 0}}));
  const box = {w: opt.w, h: opt.h, kT: opt.kT || 1, sp, channels, P: [], counts: new Array(nS).fill(0), flashes: [], time: 0,
    // 衝突の回数の見込みの補正（実際の回数 ÷ 見込みの回数。粒子の大きさで混み合うと 1 より大きくなる）
    coll: new Map(), gAll: {obs: 0, exp: 0}, rand};
  const maxR = () => Math.max(...sp.map(s => s.r));
  const pairKey = (a, b) => a < b ? a * 64 + b : b * 64 + a;

  // 速さをマクスウェル分布から選ぶ（2 次元：各成分が平均 0、分散 kT/m の正規分布）
  function thermalV(s){ const sd = Math.sqrt(box.kT * KT_UNIT / sp[s].m); return [rand.normal() * sd, rand.normal() * sd]; }
  function addParticle(s, x, y){
    const [vx, vy] = thermalV(s);
    const p = {s, x, y, vx, vy, a: rand() * Math.PI * 2, w: (rand() - 0.5) * 6};
    box.P.push(p); box.counts[s]++;
    return p;
  }
  // 空いている場所を探して置く
  function freeSpot(r){
    for (let k = 0; k < 400; k++){
      const x = r + rand() * (box.w - 2 * r), y = r + rand() * (box.h - 2 * r);
      if (box.P.every(q => (q.x - x) ** 2 + (q.y - y) ** 2 > (sp[q.s].r + r) ** 2)) return [x, y];
    }
    return [r + rand() * (box.w - 2 * r), r + rand() * (box.h - 2 * r)];
  }
  box.fill = counts => {
    box.P = []; box.counts.fill(0); box.flashes = []; box.time = 0;
    channels.forEach(c => { c.events = 0; });
    // 大きい粒子から置く（詰まりにくい）
    const order = counts.map((n, s) => s).sort((a, b) => sp[b].r - sp[a].r);
    for (const s of order) for (let i = 0; i < counts[s]; i++){ const [x, y] = freeSpot(sp[s].r); addParticle(s, x, y); }
    // 反応させずに少し動かして、位置と速さをならし、衝突の回数の見込みの補正（g）を測っておく
    box.coll.clear(); box.gAll = {obs: 0, exp: 0};
    for (let i = 0; i < (opt.warmup ?? 240); i++) box.step(1 / 120, []);
    box.time = 0; box.flashes = [];
  };
  box.setKT = kT => {   // 温度を変える：速さをまとめて √(新/旧) 倍
    const f = Math.sqrt(kT / box.kT); box.kT = kT;
    for (const p of box.P){ p.vx *= f; p.vy *= f; }
  };
  box.setSize = (w, h) => {   // 箱の大きさを変える（体積・ピストン。はみ出した粒子は中へ戻す）
    box.w = w; box.h = h;
    for (const p of box.P){ const r = sp[p.s].r; p.x = Math.min(Math.max(p.x, r), w - r); p.y = Math.min(Math.max(p.y, r), h - r); }
  };

  // 2 つの種類の粒子が 1 秒にぶつかる回数の見込み（補正前）：2d·⟨v相対⟩·（組の数）/ 面積
  //   d = 半径の和、⟨v相対⟩ = √(π kT / 2μ)（2 次元のマクスウェル分布の平均の速さ）
  function zExpected(a, b){
    const na = box.counts[a], nb = box.counts[b];
    const pairs = a === b ? na * (na - 1) / 2 : na * nb;
    if (pairs <= 0) return 0;
    const mu = sp[a].m * sp[b].m / (sp[a].m + sp[b].m);
    const vrel = Math.sqrt(Math.PI * box.kT * KT_UNIT / (2 * mu));
    return 2 * (sp[a].r + sp[b].r) * vrel * pairs / (box.w * box.h);
  }
  function gOf(key){
    const c = box.coll.get(key), gAll = (box.gAll.obs + 20) / (box.gAll.exp + 20);
    if (!c) return gAll;
    return (c.obs + 40 * gAll) / (c.exp + 40);
  }

  // ---- 1 回分（dt 秒）進める。rates[ch] = その反応がほしい回数（回/秒） ----
  box.step = (dt, rates = []) => {
    const P = box.P, kTE = box.kT * KT_UNIT;
    // しきい値 E* を決める（設計 2.2）
    channels.forEach((ch, ci) => {
      ch.saturated = false;
      const R = Math.max(0, rates[ci] || 0);
      if (ch.kind === 'bi'){
        // 理想の式どおりにはならない分（混み合うと、勢いの強い衝突の割合が少し変わる）を、
        // 「見込んだ回数」と「実際に起きた回数」の比（約 15 秒の平均）で補正する。
        const Z = gOf(pairKey(ch.reac[0], ch.reac[1])) * zExpected(ch.reac[0], ch.reac[1]);
        const eta = Math.min(2, Math.max(0.5, (ch.eff.got + 10) / (ch.eff.req + 10)));
        ch.p = Z > 0 ? R / Z / eta : 0;
        ch.req = Math.min(1, ch.p) * Z * eta * dt;   // この刻みで起こるはずの回数（補正の前の見込みで）
        if (ch.p >= 1){ ch.saturated = true; ch.Estar = 0; }
        else ch.Estar = ch.p > 0 ? -Math.log(ch.p) * kTE : Infinity;
      } else if (ch.kind === 'uni'){
        const n = box.counts[ch.reac[0]];
        ch.p = n > 0 ? R / n * dt : 0;   // 1 つの粒子が、この dt の間に反応する確率
      } else ch.p = R * dt;               // この dt の間に起こる回数の平均
    });
    const chOf = new Map();
    channels.forEach((ch, ci) => { if (ch.kind === 'bi') chOf.set(pairKey(ch.reac[0], ch.reac[1]), ci); });

    // 動かす・壁で跳ね返す
    for (const p of P){
      p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.w * dt;
      const r = sp[p.s].r;
      if (p.x < r){ p.x = r; p.vx = Math.abs(p.vx); } else if (p.x > box.w - r){ p.x = box.w - r; p.vx = -Math.abs(p.vx); }
      if (p.y < r){ p.y = r; p.vy = Math.abs(p.vy); } else if (p.y > box.h - r){ p.y = box.h - r; p.vy = -Math.abs(p.vy); }
    }
    // 升目に分ける（近くの粒子だけ調べる）
    const cs = 2 * maxR(), cols = Math.max(1, Math.ceil(box.w / cs)), rows = Math.max(1, Math.ceil(box.h / cs));
    const head = new Int32Array(cols * rows).fill(-1), next = new Int32Array(P.length);
    const cellOf = p => Math.min(cols - 1, Math.max(0, p.x / cs | 0)) + Math.min(rows - 1, Math.max(0, p.y / cs | 0)) * cols;
    P.forEach((p, i) => { const c = cellOf(p); next[i] = head[c]; head[c] = i; });
    const used = new Uint8Array(P.length), reacted = [];
    const obs = new Map();
    for (let i = 0; i < P.length; i++){
      const p = P[i], cx = Math.min(cols - 1, p.x / cs | 0), cy = Math.min(rows - 1, p.y / cs | 0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        for (let j = head[x + y * cols]; j !== -1; j = next[j]){
          if (j <= i || used[i] || used[j]) continue;
          const q = P[j], ddx = p.x - q.x, ddy = p.y - q.y, rr = sp[p.s].r + sp[q.s].r, d2 = ddx * ddx + ddy * ddy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = ddx / d, ny = ddy / d;
          const vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
          const mp = sp[p.s].m, mq = sp[q.s].m;
          if (vn < 0){   // 近づいている：衝突
            const key = pairKey(p.s, q.s), E = 0.5 * mp * mq / (mp + mq) * vn * vn;
            // 補正のために数えるのは、勢いのある衝突（E ≥ GTH·kT）だけ。重なりの押し戻しでできる弱い接触などを数えないため。
            // 見込みの方も、衝突のうち E ≥ GTH·kT の割合 exp(−GTH) を掛けて比べる。
            if (E >= GTH * kTE) obs.set(key, (obs.get(key) || 0) + 1);
            const ci = chOf.get(key);
            if (ci !== undefined && E >= channels[ci].Estar){ used[i] = used[j] = 1; reacted.push({ci, idx: [i, j]}); continue; }
            const f = 2 * vn / (mp + mq);
            p.vx -= f * mq * nx; p.vy -= f * mq * ny; q.vx += f * mp * nx; q.vy += f * mp * ny;
          }
          // 重なりを押し戻す（質量の比で）
          const ov = rr - d, wp = mq / (mp + mq), wq = mp / (mp + mq);
          p.x += nx * ov * wp; p.y += ny * ov * wp; q.x -= nx * ov * wq; q.y -= ny * ov * wq;
        }
      }
    }
    // 衝突の回数の見込みの補正を更新する（約 5 秒で入れかわる平均）
    const decay = Math.exp(-dt / 5);
    box.gAll.obs *= decay; box.gAll.exp *= decay;
    for (let a = 0; a < nS; a++) for (let b = a; b < nS; b++){
      const key = pairKey(a, b), e = zExpected(a, b) * dt * Math.exp(-GTH), o = obs.get(key) || 0;
      const c = box.coll.get(key) || {obs: 0, exp: 0};
      c.obs = c.obs * decay + o; c.exp = c.exp * decay + e; box.coll.set(key, c);
      box.gAll.obs += o; box.gAll.exp += e;
    }
    // 反応の回数の補正を更新する
    const decayE = Math.exp(-dt / 15);
    channels.forEach((ch, ci) => {
      if (ch.kind !== 'bi') return;
      const got = reacted.filter(e => e.ci === ci).length;
      ch.eff.req = ch.eff.req * decayE + (ch.req || 0) / Math.min(2, Math.max(0.5, (ch.eff.got + 10) / (ch.eff.req + 10)));
      ch.eff.got = ch.eff.got * decayE + got;
    });
    // 1 つの粒子の反応
    channels.forEach((ch, ci) => {
      if (ch.kind !== 'uni' || ch.p <= 0) return;
      for (let i = 0; i < P.length; i++) if (!used[i] && P[i].s === ch.reac[0] && rand() < ch.p){ used[i] = 1; reacted.push({ci, idx: [i]}); }
    });
    // 3 つ以上の粒子の反応：回数を決め、近くの粒子を集める（見た目のための処理）
    channels.forEach((ch, ci) => {
      if (ch.kind !== 'event' || ch.p <= 0) return;
      let n = rand.poisson(ch.p);
      while (n-- > 0){
        const first = pickFree(ch.reac[0], used, null); if (first < 0) break;
        const idx = [first]; used[first] = 1;
        for (const s of ch.reac.slice(1)){ const k = pickFree(s, used, P[first]); if (k < 0) break; idx.push(k); used[k] = 1; }
        if (idx.length < ch.reac.length){ idx.forEach(k => { used[k] = 0; }); break; }
        reacted.push({ci, idx});
      }
    });
    // 組み換える：反応した粒子を消し、その場所に生成物を置く
    if (reacted.length){
      const remove = new Set();
      for (const {ci, idx} of reacted){
        const ch = channels[ci], pos = idx.map(k => P[k]);
        idx.forEach(k => remove.add(k));
        const cx = pos.reduce((s, p) => s + p.x, 0) / pos.length, cy = pos.reduce((s, p) => s + p.y, 0) / pos.length;
        ch.events++;
        box.flashes.push({x: cx, y: cy, t: box.time, ci});
        ch.prod.forEach((s, k) => {
          let x, y;
          if (ch.prod.length === pos.length){ x = pos[k].x; y = pos[k].y; }
          else if (ch.prod.length === 1){ x = cx; y = cy; }
          else { const ang = rand() * Math.PI * 2 + k * 2 * Math.PI / ch.prod.length, rr = sp[s].r * 1.1; x = cx + Math.cos(ang) * rr; y = cy + Math.sin(ang) * rr; }
          const r = sp[s].r;
          pendingAdd.push([s, Math.min(Math.max(x, r), box.w - r), Math.min(Math.max(y, r), box.h - r)]);
        });
        for (const k of idx) box.counts[P[k].s]--;
      }
      box.P = P.filter((p, i) => !remove.has(i));
      for (const [s, x, y] of pendingAdd) addParticle(s, x, y);
      pendingAdd.length = 0;
    }
    // 温度を保つ（ベレンゼンの方法：運動エネルギーの平均を kT に、約 0.3 秒でゆっくり近づける。2 次元では 1 粒子あたり kT）
    let ke = 0; for (const p of box.P) ke += 0.5 * sp[p.s].m * (p.vx * p.vx + p.vy * p.vy);
    if (box.P.length && ke > 0){
      const ratio = ke / (box.P.length * kTE);
      const lam = Math.sqrt(Math.min(1.21, Math.max(0.81, 1 + dt / 0.3 * (1 / ratio - 1))));
      for (const p of box.P){ p.vx *= lam; p.vy *= lam; }
    }
    box.time += dt;
    box.flashes = box.flashes.filter(f => box.time - f.t < 0.5);
  };
  const pendingAdd = [];
  function pickFree(s, used, near){
    let best = -1, bd = Infinity;
    for (let k = 0; k < box.P.length; k++){
      if (used[k] || box.P[k].s !== s) continue;
      if (!near){ if (best < 0 || rand() < 1 / (k + 1)) best = k; continue; }   // 近い粒子を選ぶ前の 1 つめはでたらめに
      const d = (box.P[k].x - near.x) ** 2 + (box.P[k].y - near.y) ** 2;
      if (d < bd){ bd = d; best = k; }
    }
    return best;
  }
  // 温度の目安（いまの運動エネルギーから。基準の温度で 1）
  box.kTnow = () => { let ke = 0; for (const p of box.P) ke += 0.5 * sp[p.s].m * (p.vx * p.vx + p.vy * p.vy); return box.P.length ? ke / box.P.length / KT_UNIT : 0; };
  return box;
}

// ---- 描く ----
// view = {x, y, scale}：箱の座標 → canvas の座標。opt = {dark, labels, flashColors:[...], bg, tint:{color, alpha}}
function drawBox(ctx, box, view, opt = {}){
  const {x: ox, y: oy, scale: k} = view;
  ctx.save();
  ctx.fillStyle = opt.bg || (opt.dark ? '#16191e' : '#ffffff');
  ctx.fillRect(ox, oy, box.w * k, box.h * k);
  if (opt.tint && opt.tint.alpha > 0){
    ctx.globalAlpha = Math.min(0.5, opt.tint.alpha); ctx.fillStyle = opt.tint.color;
    ctx.fillRect(ox, oy, box.w * k, box.h * k); ctx.globalAlpha = 1;
  }
  // 反応した場所を光らせる（0.5 秒で消える輪）
  for (const f of box.flashes){
    const age = (box.time - f.t) / 0.5;
    ctx.globalAlpha = Math.max(0, 1 - age) * 0.85;
    ctx.strokeStyle = (opt.flashColors || ['#f59e0b', '#14b8a6'])[f.ci] || '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(ox + f.x * k, oy + f.y * k, (12 + age * 22) * k, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const edge = opt.dark ? '#0b0d10' : '#3b4048';
  ctx.lineWidth = Math.max(0.8, 1.1 * k);
  for (const p of box.P){
    const shp = box.sp[p.s].shape, ca = Math.cos(p.a), sa = Math.sin(p.a);
    for (const a of shp.parts){
      const ax = ox + (p.x + a.x * ca - a.y * sa) * k, ay = oy + (p.y + a.x * sa + a.y * ca) * k;
      ctx.beginPath(); ctx.arc(ax, ay, a.r * k, 0, Math.PI * 2);
      ctx.fillStyle = a.color; ctx.fill(); ctx.strokeStyle = edge; ctx.stroke();
    }
    if (opt.labels){
      ctx.font = '600 ' + Math.max(8, 9 * k) + 'px -apple-system, "Hiragino Sans", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = opt.dark ? '#000' : '#fff'; ctx.strokeText(box.sp[p.s].label || box.sp[p.s].key, ox + p.x * k, oy + p.y * k);
      ctx.fillStyle = opt.dark ? '#fff' : '#111'; ctx.fillText(box.sp[p.s].label || box.sp[p.s].key, ox + p.x * k, oy + p.y * k);
      ctx.lineWidth = Math.max(0.8, 1.1 * k);
    }
  }
  ctx.restore();
}
// 1 つの分子の形だけを描く（凡例用）
function drawMolecule(ctx, shape, x, y, k, dark){
  ctx.save(); ctx.lineWidth = 1;
  for (const a of shape.parts){
    ctx.beginPath(); ctx.arc(x + a.x * k, y + a.y * k, a.r * k, 0, Math.PI * 2);
    ctx.fillStyle = a.color; ctx.fill(); ctx.strokeStyle = dark ? '#0b0d10' : '#3b4048'; ctx.stroke();
  }
  ctx.restore();
}

const api = {ATOM, atomOf, moleculeShape, effMass, KT_UNIT, createBox, drawBox, drawMolecule};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemParticles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
