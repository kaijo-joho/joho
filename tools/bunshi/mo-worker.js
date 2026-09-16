// 分子軌道法の計算をする係（本体の画面を止めないように、別のスレッドで動かす）
// 計算そのものは mo-engine.js（GANSU-Lite、BSD-3-Clause, Copyright (c) 2026, Yasuaki Ito）。
// 基底関数のデータは Basis Set Exchange（BSD-3-Clause, Copyright (c) 2020 The Molecular Sciences
// Software Institute, Virginia Tech）。ライセンスの全文は licenses/ とヘルプにある。
import { singlePoint, energyAndGradient, atomsFromXYZ, basisFrom, initWasm, isWasmAvailable,
  BOHR_TO_ANGSTROM } from './mo-engine.js';

const base = new URL('./', location.href).pathname;   // 例：/tools/bunshi/
let wasmOnce = null;
const gbsCache = new Map();
const stopped = new Set();

async function ready(){
  if (!wasmOnce) wasmOnce = initWasm(base).catch(() => false);   // WASM が読めなくても純 JS で動く
  return wasmOnce;
}

async function getBasis(name){
  if (!gbsCache.has(name)){
    const res = await fetch(`${base}basis/${name}.gbs`);
    if (!res.ok) throw new Error(`基底関数のファイルを読めません（${name}）`);
    gbsCache.set(name, basisFrom(name, await res.text()));
  }
  return gbsCache.get(name);
}

// ---- 形についての小道具（座標はボーア、角度は度）----
const sub = (X, i, j) => [X[3*i] - X[3*j], X[3*i+1] - X[3*j+1], X[3*i+2] - X[3*j+2]];
const cross = (u, v) => [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
const dot = (u, v) => u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
function dihedralOf(X, [a, b, c, d]){
  const b1 = sub(X, b, a), b2 = sub(X, c, b), b3 = sub(X, d, c);
  const n1 = cross(b1, b2), n2 = cross(b2, b3);
  const L = Math.hypot(...b2) || 1e-12, m = cross(n1, b2).map(v => v/L);
  return Math.atan2(dot(m, n2), dot(n1, n2))*180/Math.PI;
}
function rotateAtoms(X, b, c, idxs, rad){   // b→c の軸のまわりに idxs を回す
  const ax = sub(X, c, b), L = Math.hypot(...ax) || 1e-12, u = ax.map(v => v/L);
  const ca = Math.cos(rad), sa = Math.sin(rad);
  for (const i of idxs){
    const p = sub(X, i, b);
    const k = dot(u, p), cr = cross(u, p);
    for (let q = 0; q < 3; q++) X[3*i + q] = X[3*b + q] + p[q]*ca + cr[q]*sa + u[q]*k*(1 - ca);
  }
}
function setDihedral(X, atoms, target, move){   // 二面角をきっちり target にする（向きが逆なら戻して逆に回す）
  const cur = dihedralOf(X, atoms);
  let d = ((target - cur + 540) % 360) - 180;
  if (Math.abs(d) < 1e-9) return;
  rotateAtoms(X, atoms[1], atoms[2], move, d*Math.PI/180);
  const now = dihedralOf(X, atoms);
  if (Math.abs(((now - target + 540) % 360) - 180) > 0.05)
    rotateAtoms(X, atoms[1], atoms[2], move, -2*d*Math.PI/180);
}
// 二面角を変える向き（∂φ/∂x）。φ は 4 原子だけの関数なので、その 12 成分を数値微分で求める（幾何だけなので軽い）
function dihedralDirection(X, atoms, n){
  const t = new Float64Array(n), h = 1e-6;
  for (const i of atoms) for (let q = 0; q < 3; q++){
    const k = 3*i + q, x0 = X[k];
    X[k] = x0 + h; const p = dihedralOf(X, atoms);
    X[k] = x0 - h; const m = dihedralOf(X, atoms);
    X[k] = x0;
    t[k] = (((p - m + 540) % 360) - 180)/(2*h);
  }
  let nrm = 0; for (let i = 0; i < n; i++) nrm += t[i]*t[i];
  nrm = Math.sqrt(nrm);
  if (nrm < 1e-12) return null;
  for (let i = 0; i < n; i++) t[i] /= nrm;
  return t;
}
// 勾配から、分子全体の平行移動と回転の成分を取り除く（形を変えない動きを消す）
function projectTR(g, X, nAt){
  for (let q = 0; q < 3; q++){
    let s = 0; for (let i = 0; i < nAt; i++) s += g[3*i + q];
    s /= nAt; for (let i = 0; i < nAt; i++) g[3*i + q] -= s;
  }
  const c = [0, 0, 0];
  for (let i = 0; i < nAt; i++) for (let q = 0; q < 3; q++) c[q] += X[3*i + q]/nAt;
  const bas = [];
  for (let k = 0; k < 3; k++){
    const v = new Float64Array(3*nAt);
    for (let i = 0; i < nAt; i++){
      const r = [X[3*i] - c[0], X[3*i + 1] - c[1], X[3*i + 2] - c[2]];
      const e = [0, 0, 0]; e[k] = 1;
      v[3*i] = e[1]*r[2] - e[2]*r[1];
      v[3*i + 1] = e[2]*r[0] - e[0]*r[2];
      v[3*i + 2] = e[0]*r[1] - e[1]*r[0];
    }
    for (const b of bas){ let d = 0; for (let i = 0; i < v.length; i++) d += v[i]*b[i]; for (let i = 0; i < v.length; i++) v[i] -= d*b[i]; }
    let nrm = 0; for (let i = 0; i < v.length; i++) nrm += v[i]*v[i];
    nrm = Math.sqrt(nrm);
    if (nrm < 1e-8) continue;
    for (let i = 0; i < v.length; i++) v[i] /= nrm;
    bas.push(v);
  }
  for (const b of bas){ let d = 0; for (let i = 0; i < g.length; i++) d += g[i]*b[i]; for (let i = 0; i < g.length; i++) g[i] -= d*b[i]; }
}

// 構造最適化（BFGS 法）。fix があれば、その二面角を保ったまま形を整える
async function optimize(id, zs, X0, basis, opts = {}){
  const nAt = zs.length, n = 3*nAt;
  const maxIter = opts.maxIter ?? 40, thr = opts.forceThreshold ?? 4.5e-4, fix = opts.fix || null;
  let X = Float64Array.from(X0), trust = fix ? 0.2 : 0.3;
  let H = null, prevX = null, prevG = null, prevE = null, converged = false, last = null, iters = 0;
  const t0 = performance.now(), eye = () => { const M = new Float64Array(n*n); for (let i = 0; i < n; i++) M[i*n + i] = 1; return M; };
  if (fix) setDihedral(X, fix.atoms, fix.value, fix.move);
  for (let iter = 0; iter < maxIter; iter++){
    if (stopped.has(id)) return {stopped: true, X, energy: last, iters, ms: performance.now() - t0};
    const {energy, gradient, numBasis} = await energyAndGradient(zs, X, basis, {});
    const g = Float64Array.from(gradient);
    projectTR(g, X, nAt);
    if (fix){   // 二面角を変える向きの成分を取り除く（その向きには動かさない）
      const t = dihedralDirection(X, fix.atoms, n);
      if (t){ let d = 0; for (let i = 0; i < n; i++) d += g[i]*t[i]; for (let i = 0; i < n; i++) g[i] -= d*t[i]; }
    }
    let maxF = 0; for (let i = 0; i < n; i++) maxF = Math.max(maxF, Math.abs(g[i]));
    if (prevE != null && energy > prevE){   // 上がったら一歩戻して刻みを半分に
      X = Float64Array.from(prevX); trust *= 0.5; H = eye();
      if (trust < 1e-3) break;
      continue;
    }
    last = energy; iters = iter + 1;
    if (opts.onStep) opts.onStep(iter, energy, maxF, numBasis, X);
    if (maxF < thr) { converged = true; break; }
    if (!H) H = eye();
    if (prevG && prevX){
      const s = new Float64Array(n), y = new Float64Array(n);
      for (let i = 0; i < n; i++) { s[i] = X[i] - prevX[i]; y[i] = g[i] - prevG[i]; }
      let sy = 0; for (let i = 0; i < n; i++) sy += s[i]*y[i];
      if (sy > 1e-10){
        const Hy = new Float64Array(n);
        for (let i = 0; i < n; i++){ let v = 0; for (let j = 0; j < n; j++) v += H[i*n + j]*y[j]; Hy[i] = v; }
        let yHy = 0; for (let i = 0; i < n; i++) yHy += y[i]*Hy[i];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
          H[i*n + j] += ((sy + yHy)*s[i]*s[j])/(sy*sy) - (Hy[i]*s[j] + s[i]*Hy[j])/sy;
      }
    }
    const dir = new Float64Array(n);
    for (let i = 0; i < n; i++){ let v = 0; for (let j = 0; j < n; j++) v += H[i*n + j]*g[j]; dir[i] = -v; }
    let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(dir[i]));
    const sc = mx > trust ? trust/mx : 1;
    prevX = Float64Array.from(X); prevG = g; prevE = energy;
    for (let i = 0; i < n; i++) X[i] += dir[i]*sc;
    if (fix) setDihedral(X, fix.atoms, fix.value, fix.move);   // ずれを厳密に直す
  }
  return {converged, X, energy: last, iters, ms: performance.now() - t0};
}

const toAng = X => Array.from(X, v => v*BOHR_TO_ANGSTROM);

self.onmessage = async (e) => {
  const d = e.data || {};
  const {id, type, xyz, xyzs, angles, fix, basis: basisName = 'sto-3g', maxIter, forceThreshold} = d;
  if (type === 'stop'){ stopped.add(id); return; }
  try {
    await ready();
    const basis = await getBasis(basisName);
    if (type === 'single'){
      const r = await singlePoint(xyz, basis);
      self.postMessage({id, type: 'done', result: r, wasm: isWasmAvailable()});
    } else if (type === 'scan'){
      const out = [];
      for (let i = 0; i < xyzs.length; i++){
        if (stopped.has(id)) { stopped.delete(id); self.postMessage({id, type: 'stopped', results: out}); return; }
        const r = await singlePoint(xyzs[i], basis);
        out.push(r.energy);
        self.postMessage({id, type: 'point', i, energy: r.energy, ms: r.ms, numBasis: r.numBasis});
      }
      self.postMessage({id, type: 'done', results: out, wasm: isWasmAvailable()});
    } else if (type === 'rscan'){
      // 緩和スキャン：各点で、二面角を固定したまま構造最適化してからエネルギーを取る
      const out = [];
      let prev = null, lastProg = 0;   // 進み具合は送りすぎない（送るたびに本体の画面が止まるため）
      for (let i = 0; i < xyzs.length; i++){
        if (stopped.has(id)) { stopped.delete(id); self.postMessage({id, type: 'stopped', results: out}); return; }
        const {zs, coords} = atomsFromXYZ(xyzs[i]);
        const X0 = prev && prev.length === coords.length ? Float64Array.from(prev) : coords;   // 前の点の形から始める
        const r = await optimize(id, zs, X0, basis, {
          fix: {atoms: fix.atoms, value: angles[i], move: fix.move},
          maxIter: maxIter ?? 15, forceThreshold: forceThreshold ?? 1e-3,
          onStep: (iter, energy, maxF) => {
            const now = performance.now();
            if (iter === 0 || now - lastProg > 500) { lastProg = now; self.postMessage({id, type: 'rprog', i, iter, energy, maxForce: maxF}); }
          },
        });
        if (r.stopped) { stopped.delete(id); self.postMessage({id, type: 'stopped', results: out}); return; }
        prev = r.X;
        out.push(r.energy);
        self.postMessage({id, type: 'point', i, energy: r.energy, ms: r.ms, iters: r.iters, converged: r.converged});
      }
      self.postMessage({id, type: 'done', results: out, wasm: isWasmAvailable()});
    } else if (type === 'optimize'){
      const {zs, coords} = atomsFromXYZ(xyz);
      const r = await optimize(id, zs, coords, basis, {
        maxIter, forceThreshold,
        onStep: (iter, energy, maxF, numBasis, X) => self.postMessage({id, type: 'ostep', iter, energy, maxForce: maxF, numBasis, coords: toAng(X)}),
      });
      if (r.stopped) stopped.delete(id);
      self.postMessage({id, type: 'odone', converged: r.converged, stopped: !!r.stopped, energy: r.energy, coords: toAng(r.X)});
    } else throw new Error('知らない指示です：' + type);
  } catch (err) {
    self.postMessage({id, type: 'error', message: err && err.message ? err.message : String(err)});
  }
};
