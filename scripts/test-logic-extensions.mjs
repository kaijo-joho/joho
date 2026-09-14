import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console, document: { readyState: 'loading', addEventListener() {} } });
for (const name of ['core', 'renderer', 'applications', 'extensions']) {
  vm.runInContext(await readFile(path.join(root, `js/logic-${name}.js`), 'utf8'), context, { filename: `logic-${name}.js` });
}
const { CIRCUITS, evaluate, point } = context.LogicExtensions;
assert.deepEqual(Array.from(CIRCUITS, item => item.id), ['parity-generator', 'parity-checker', 'multiplexer', 'decoder', 'two-bit-adder']);
assert.equal(context.LogicApplications.CIRCUITS.length, 4, '既存の採点対象4回路は変更しない');

const html = await readFile(path.join(root, 'cp22.html'), 'utf8');
const usageKeywords = {
  'parity-generator': /UART通信[\s\S]*送信側/,
  'parity-checker': /UART通信[\s\S]*受信側/,
  multiplexer: /CPU内[\s\S]*演算に使う数値/,
  decoder: /メモリ[\s\S]*読み書きする場所/,
  'two-bit-adder': /CPUの演算装置[\s\S]*アドレスの計算/
};
for (const { id } of CIRCUITS) {
  const panel = html.split(`<div id="extension-${id}" `)[1]?.split('class="logic-extension-workbench"')[0];
  assert.ok(panel, `${id}: 発展パネルがある`);
  assert.match(panel, /<strong>機能：<\/strong>/, `${id}: 機能を常時表示`);
  assert.match(panel, /class="logic-extension-use"><strong>用途：<\/strong>/, `${id}: 用途を常時表示`);
  assert.match(panel, />しくみ・用途<\/button>/, `${id}: 詳しい説明への入口`);
  const dialog = html.split(`<dialog id="extension-${id}-help" `)[1]?.split('</dialog>')[0];
  assert.ok(dialog, `${id}: 詳しい説明がある`);
  assert.deepEqual([...dialog.matchAll(/<h4>([^<]+)<\/h4>/g)].map(match => match[1]), ['どのような機能？', 'どこで使う？', 'しくみと例']);
  assert.match(dialog, /class="lesson-supplement-dialog__body" tabindex="0" role="region" aria-label="[^"]+"/, `${id}: 長い説明をキーボードでスクロールできる`);
  assert.match(dialog, usageKeywords[id], `${id}: 具体的な使用場面`);
}
assert.match(html, /パリティを使う設定/, '通信でのパリティは設定に依存する');
assert.match(html, /この回路だけで、誤りを直したり再送したりすることはできません/, '検出と訂正・再送を区別する');
assert.match(html, /データを保存する機能は別の回路が担当/, 'デコーダは記憶回路そのものではない');

// 描画用の接続データから求めた値を、独立した算術の定義と全パターンで照合する。
function expected(id, v) {
  if (id === 'parity-generator') return { P: (v.A + v.B + v.C) % 2 };
  if (id === 'parity-checker') return { E: (v.A + v.B + v.C + v.P) % 2 };
  if (id === 'multiplexer') return { F: v.S ? v.B : v.A };
  if (id === 'decoder') return Object.fromEntries(['Y₀', 'Y₁', 'Y₂', 'Y₃'].map((key, i) => [key, Number(i === 2 * v['A₁'] + v['A₀'])]));
  const sum = 2 * v['A₁'] + v['A₀'] + 2 * v['B₁'] + v['B₀'];
  return { 'C₂': (sum >> 2) & 1, 'S₁': (sum >> 1) & 1, 'S₀': sum & 1 };
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const key = p => `${p[0]},${p[1]}`;
const on = (p, s) => p[0] >= s.x1 && p[0] <= s.x2 && p[1] >= s.y1 && p[1] <= s.y2;
function directions(p, segments) {
  const dirs = new Set();
  for (const s of segments.filter(s => on(p, s))) {
    if (s.x1 < p[0]) dirs.add('left');
    if (s.x2 > p[0]) dirs.add('right');
    if (s.y1 < p[1]) dirs.add('up');
    if (s.y2 > p[1]) dirs.add('down');
  }
  return dirs.size;
}

let rowCount = 0;
for (const circuit of CIRCUITS) {
  const { id, diagram: spec } = circuit;
  const rows = context.LogicApplications.makeRows(circuit);
  assert.equal(rows.length, 2 ** circuit.inputs.length, `${id}: 全入力パターン`);
  rowCount += rows.length;
  for (const row of rows) {
    assert.deepEqual(JSON.parse(JSON.stringify(row.outputs)), expected(id, row.inputs), `${id}: ${JSON.stringify(row.inputs)}`);
    const result = evaluate(circuit, row.inputs);
    if (id === 'two-bit-adder') assert.equal(result.signals['low-both'], row.inputs['A₀'] & row.inputs['B₀'], 'C₁は1の位からの桁上がり');
    for (const nodeId of Object.keys(spec.nodes)) assert.ok([0, 1].includes(result.signals[nodeId]), `${id}: ${nodeId}の配線の値`);
  }
  const inputNodes = Object.values(spec.nodes).filter(node => node.kind === 'input');
  assert.equal(inputNodes.length, circuit.inputs.length, `${id}: 入力の始点は1つずつ`);
  assert.equal(new Set(inputNodes.map(node => node.label)).size, circuit.inputs.length);
  const gates = Object.entries(spec.nodes).filter(([, node]) => node.kind === 'gate');
  assert.ok(gates.every(([, node]) => ['AND', 'OR', 'NOT'].includes(node.gate)), `${id}: 基本ゲートだけで構成`);
  assert.equal(circuit.compiled.valid, true, `${id}: 循環・未接続なし`);

  const allSegments = [];
  const allJunctions = [];
  for (const net of spec.nets) {
    const start = point(spec, net.from);
    const ends = net.branches.map(branch => point(spec, branch.to));
    const segments = [];
    for (const branch of net.branches) {
      const points = [start, ...(branch.via || []), point(spec, branch.to)];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        assert.ok(a[0] === b[0] || a[1] === b[1], `${id}/${net.from}: 直交配線`);
        for (const p of [a, b]) assert.ok(p[0] >= 0 && p[0] <= spec.width && p[1] >= 0 && p[1] <= spec.height, `${id}: 図の範囲内`);
        if (same(a, b)) continue;
        segments.push({ from: net.from, x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]), y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]), horizontal: a[1] === b[1] });
      }
    }
    const candidates = segments.flatMap(s => [[s.x1, s.y1], [s.x2, s.y2]]);
    for (const h of segments.filter(s => s.horizontal)) {
      for (const v of segments.filter(s => !s.horizontal)) {
        const p = [v.x1, h.y1];
        if (on(p, h) && on(p, v)) candidates.push(p);
      }
    }
    const actual = new Set((net.junctions || []).map(key));
    const required = new Set(candidates.filter(p => !same(p, start) && !ends.some(end => same(end, p)) && directions(p, segments) >= 3).map(key));
    assert.deepEqual(actual, required, `${id}/${net.from}: ●は実際の分岐点だけ（曲がり角には付けない）`);
    allJunctions.push(...(net.junctions || []).map(p => ({ p, from: net.from })));
    allSegments.push(...segments);
  }
  for (const [i, a] of allSegments.entries()) {
    for (const b of allSegments.slice(i + 1)) {
      if (a.from === b.from || a.horizontal !== b.horizontal) continue;
      const overlap = a.horizontal
        ? a.y1 === b.y1 && Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1)
        : a.x1 === b.x1 && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1);
      assert.equal(overlap, false, `${id}: 異なる信号${a.from}/${b.from}の配線を重ねない`);
    }
    for (const [nodeId, node] of gates) {
      const throughGate = a.horizontal
        ? a.y1 > node.y - 22 && a.y1 < node.y + 22 && a.x2 > node.x - 24 && a.x1 < node.x + 24
        : a.x1 > node.x - 24 && a.x1 < node.x + 24 && a.y2 > node.y - 22 && a.y1 < node.y + 22;
      assert.equal(throughGate, false, `${id}: ${a.from}の配線が${nodeId}の内部を通らない`);
    }
  }
  for (const junction of allJunctions) {
    assert.ok(!allSegments.some(s => s.from !== junction.from && on(junction.p, s)), `${id}: 分岐点が別の信号と交差しない`);
  }
}

console.log(`logic-extensions: 5回路の機能・用途、全${rowCount}パターンの真理値、直交配線、分岐、非重複を検証`);
