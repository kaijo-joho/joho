// 分子軌道法の計算をする係（本体の画面を止めないように、別のスレッドで動かす）
// 計算そのものは mo-engine.js（GANSU-Lite、BSD-3-Clause, Copyright (c) 2026, Yasuaki Ito）。
// 基底関数のデータは Basis Set Exchange（BSD-3-Clause, Copyright (c) 2020 The Molecular Sciences
// Software Institute, Virginia Tech）。ライセンスの全文は licenses/ とヘルプにある。
import { singlePoint, basisFrom, initWasm, isWasmAvailable } from './mo-engine.js';

const base = new URL('./', location.href).pathname;   // 例：/tools/bunshi/
let wasmOnce = null;
const gbsCache = new Map();

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

self.onmessage = async (e) => {
  const {id, type, xyz, xyzs, basis: basisName = 'sto-3g'} = e.data || {};
  try {
    await ready();
    const basis = await getBasis(basisName);
    if (type === 'single'){
      const r = await singlePoint(xyz, basis);
      self.postMessage({id, type: 'done', result: r, wasm: isWasmAvailable()});
      return;
    }
    if (type === 'scan'){
      // 剛体スキャン：形は本体側で作って渡してもらい、ここでは 1 点ずつ計算して、そのつど返す
      const out = [];
      for (let i = 0; i < xyzs.length; i++){
        if (stopped.has(id)) { self.postMessage({id, type: 'stopped', results: out}); stopped.delete(id); return; }
        const r = await singlePoint(xyzs[i], basis);
        out.push(r.energy);
        self.postMessage({id, type: 'point', i, energy: r.energy, ms: r.ms, numBasis: r.numBasis});
      }
      self.postMessage({id, type: 'done', results: out, wasm: isWasmAvailable()});
      return;
    }
    if (type === 'stop'){ stopped.add(id); return; }
    throw new Error('知らない指示です：' + type);
  } catch (err) {
    self.postMessage({id, type: 'error', message: err && err.message ? err.message : String(err)});
  }
};

const stopped = new Set();
