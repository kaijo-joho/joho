// cp22の発展。図の接続から値を計算し、入力・配線・真理値表を連動させる。
(function (root) {
  'use strict';

  const Core = root.LogicCore;
  const Renderer = root.LogicRenderer;
  const Applications = root.LogicApplications;
  const Widgets = root.LogicWidgets;

  function diagram(width, height) {
    return { width, height, pointOutputs: true, nodes: {}, nets: [], groups: [], labels: [] };
  }

  function terminal(spec, id, kind, label, x, y) {
    spec.nodes[id] = { kind, label, x, y };
  }

  function gate(spec, id, type, x, y) {
    spec.nodes[id] = { kind: 'gate', gate: type, x, y };
  }

  function point(spec, reference) {
    const [id, port = 'out'] = reference.split(':');
    const node = spec.nodes[id];
    if (node.kind !== 'gate') return [node.x, node.y];
    const geometry = Renderer.gateGeometry(node.gate);
    return port === 'out'
      ? [node.x + geometry.outputX, node.y]
      : [node.x + geometry.inputX, node.y + geometry.inputYs[Number(port)]];
  }

  // 同じ信号は1本の幹線から分岐する。3方向以上が接する所だけに●を付ける。
  function connect(spec, from, targets, busX) {
    const start = point(spec, from);
    const ends = targets.map(to => point(spec, to));
    const ys = [...new Set([start[1], ...ends.map(end => end[1])])];
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const junctions = ys.filter(y => [
      y === start[1] && start[0] < busX,
      ends.some(end => end[1] === y && end[0] > busX),
      y > minY,
      y < maxY
    ].filter(Boolean).length >= 3).map(y => [busX, y]);
    spec.nets.push({ from, junctions, branches: targets.map((to, index) => ({
      to, via: [[busX, start[1]], [busX, ends[index][1]]]
    })) });
  }

  // 半加算の和の部分。XOR記号を使わずOR・AND・NOT・ANDへ展開する。
  function halfStage(spec, prefix, x, y) {
    const ref = key => `${prefix}-${key}`;
    gate(spec, ref('any'), 'OR', x, y - 65);
    gate(spec, ref('both'), 'AND', x, y + 65);
    gate(spec, ref('not'), 'NOT', x + 130, y + 65);
    gate(spec, ref('sum'), 'AND', x + 260, y - 20);
    connect(spec, ref('any'), [`${ref('sum')}:0`], x + 185);
    connect(spec, ref('not'), [`${ref('sum')}:1`], x + 210);
    return {
      a: [`${ref('any')}:0`, `${ref('both')}:0`],
      b: [`${ref('any')}:1`, `${ref('both')}:1`],
      both: ref('both'), not: `${ref('not')}:0`, sum: ref('sum')
    };
  }

  function parityGenerator() {
    const spec = diagram(1250, 435);
    terminal(spec, 'A', 'input', 'A', 100, 76);
    terminal(spec, 'B', 'input', 'B', 100, 234);
    terminal(spec, 'C', 'input', 'C', 100, 384);
    const first = halfStage(spec, 'ab', 300, 155);
    const second = halfStage(spec, 'abc', 770, 240);
    terminal(spec, 'P', 'output', 'P', 1130, 220);
    connect(spec, 'A', first.a, 150);
    connect(spec, 'B', first.b, 190);
    connect(spec, first.both, [first.not], 375);
    connect(spec, first.sum, second.a, 690);
    connect(spec, 'C', second.b, 650);
    connect(spec, second.both, [second.not], 845);
    connect(spec, second.sum, ['P'], 1090);
    return spec;
  }

  function parityChecker() {
    const spec = diagram(1300, 550);
    for (const [id, y] of [['A', 46], ['B', 204], ['C', 301], ['P', 459]]) {
      terminal(spec, id, 'input', id, 100, y);
    }
    const ab = halfStage(spec, 'ab', 300, 125);
    const cp = halfStage(spec, 'cp', 300, 380);
    const final = halfStage(spec, 'check', 810, 250);
    terminal(spec, 'E', 'output', 'E', 1180, 230);
    connect(spec, 'A', ab.a, 150);
    connect(spec, 'B', ab.b, 190);
    connect(spec, 'C', cp.a, 150);
    connect(spec, 'P', cp.b, 190);
    connect(spec, ab.both, [ab.not], 375);
    connect(spec, cp.both, [cp.not], 375);
    connect(spec, ab.sum, final.a, 670);
    connect(spec, cp.sum, final.b, 710);
    connect(spec, final.both, [final.not], 885);
    connect(spec, final.sum, ['E'], 1130);
    return spec;
  }

  function multiplexer() {
    const spec = diagram(850, 400);
    terminal(spec, 'A', 'input', 'A', 100, 86);
    terminal(spec, 'B', 'input', 'B', 100, 314);
    terminal(spec, 'S', 'input', 'S', 100, 200);
    gate(spec, 'notS', 'NOT', 270, 150);
    gate(spec, 'selectA', 'AND', 450, 100);
    gate(spec, 'selectB', 'AND', 450, 300);
    gate(spec, 'merge', 'OR', 640, 200);
    terminal(spec, 'F', 'output', 'F', 740, 200);
    connect(spec, 'A', ['selectA:0'], 190);
    connect(spec, 'B', ['selectB:1'], 190);
    connect(spec, 'S', ['notS:0', 'selectB:0'], 210);
    connect(spec, 'notS', ['selectA:1'], 350);
    connect(spec, 'selectA', ['merge:0'], 545);
    connect(spec, 'selectB', ['merge:1'], 580);
    connect(spec, 'merge', ['F'], 705);
    return spec;
  }

  function decoder() {
    const spec = diagram(830, 560);
    terminal(spec, 'A1', 'input', 'A₁', 100, 70);
    terminal(spec, 'A0', 'input', 'A₀', 100, 500);
    gate(spec, 'notA1', 'NOT', 265, 150);
    gate(spec, 'notA0', 'NOT', 265, 420);
    [100, 220, 340, 460].forEach((y, index) => {
      gate(spec, `match${index}`, 'AND', 590, y);
      terminal(spec, `Y${index}`, 'output', `Y${['₀','₁','₂','₃'][index]}`, 710, y);
      connect(spec, `match${index}`, [`Y${index}`], 660);
    });
    connect(spec, 'A1', ['notA1:0', 'match2:0', 'match3:0'], 170);
    connect(spec, 'A0', ['notA0:0', 'match1:1', 'match3:1'], 210);
    connect(spec, 'notA1', ['match0:0', 'match1:0'], 385);
    connect(spec, 'notA0', ['match0:1', 'match2:1'], 435);
    return spec;
  }

  function twoBitAdder() {
    const spec = diagram(1320, 700);
    terminal(spec, 'A0', 'input', 'A₀', 100, 51);
    terminal(spec, 'B0', 'input', 'B₀', 100, 209);
    terminal(spec, 'A1', 'input', 'A₁', 100, 346);
    terminal(spec, 'B1', 'input', 'B₁', 100, 504);
    const low = halfStage(spec, 'low', 280, 130);
    const high = halfStage(spec, 'high', 280, 425);
    const final = halfStage(spec, 'final', 800, 440);
    gate(spec, 'carry', 'OR', 1060, 605);
    terminal(spec, 'C2', 'output', 'C₂', 1190, 605);
    terminal(spec, 'S1', 'output', 'S₁', 1190, 420);
    terminal(spec, 'S0', 'output', 'S₀', 1190, 110);
    spec.groups.push(
      { x: 220, y: 0, width: 395, height: 225, label: '1の位：半加算回路' },
      { x: 220, y: 285, width: 910, height: 395, label: '2の位：全加算回路' }
    );
    spec.labels.push({ x: 530, y: 249, node: low.both, text: 'C₁' });
    connect(spec, 'A0', low.a, 150);
    connect(spec, 'B0', low.b, 185);
    connect(spec, 'A1', high.a, 150);
    connect(spec, 'B1', high.b, 185);
    connect(spec, low.sum, ['S0'], 1160);
    spec.nets.push({ from: low.both, junctions: [[350, 195], [650, 389]], branches: [
      { to: low.not, via: [[350, 195]] },
      { to: final.b[0], via: [[350, 195], [350, 260], [650, 260], [650, 389]] },
      { to: final.b[1], via: [[350, 195], [350, 260], [650, 260], [650, 519]] }
    ] });
    connect(spec, high.sum, final.a, 710);
    spec.nets.push({ from: high.both, junctions: [[350, 490]], branches: [
      { to: high.not, via: [[350, 490]] },
      { to: 'carry:0', via: [[350, 490], [350, 650], [990, 650], [990, 591]] }
    ] });
    connect(spec, final.both, [final.not, 'carry:1'], 880);
    connect(spec, final.sum, ['S1'], 1140);
    connect(spec, 'carry', ['C2'], 1140);
    return spec;
  }

  const CIRCUITS = [
    { id: 'parity-generator', name: 'パリティ生成回路', inputs: ['A', 'B', 'C'], outputs: ['P'], diagram: parityGenerator() },
    { id: 'parity-checker', name: 'パリティ検査回路', inputs: ['A', 'B', 'C', 'P'], outputs: ['E'], diagram: parityChecker() },
    { id: 'multiplexer', name: 'セレクタ', inputs: ['A', 'B', 'S'], outputs: ['F'], diagram: multiplexer() },
    { id: 'decoder', name: 'デコーダ', inputs: ['A₁', 'A₀'], outputs: ['Y₀', 'Y₁', 'Y₂', 'Y₃'], diagram: decoder() },
    { id: 'two-bit-adder', name: '2ビット加算回路', inputs: ['A₁', 'A₀', 'B₁', 'B₀'], outputs: ['C₂', 'S₁', 'S₀'], diagram: twoBitAdder() }
  ];

  // 入力の表示名だけを内部のA〜Dへ対応付け、検証・計算は既存Coreを共用する。
  CIRCUITS.forEach(circuit => {
    const graph = {
      nodes: Object.entries(circuit.diagram.nodes).map(([id, node]) => ({
        id, type: node.kind === 'gate' ? node.gate : node.kind,
        name: node.kind === 'input' ? String.fromCharCode(65 + circuit.inputs.indexOf(node.label)) : node.label
      })),
      wires: circuit.diagram.nets.flatMap(net => net.branches.map((branch, index) => ({
        id: `${net.from}-${index}`, from: net.from.split(':')[0],
        to: branch.to.split(':')[0], port: Number(branch.to.split(':')[1] || 0)
      })))
    };
    circuit.compiled = Core.graphToAst(graph, { allowMultipleOutputs: true });
    if (!circuit.compiled.valid) throw new Error(`${circuit.name}: ${circuit.compiled.errors.join(' ')}`);
    circuit.evaluate = inputs => evaluate(circuit, inputs).outputs;
  });

  function evaluate(circuit, inputs) {
    const mapped = Object.fromEntries(circuit.inputs.map((name, index) => [String.fromCharCode(65 + index), inputs[name]]));
    const signals = {}, outputs = {};
    circuit.compiled.outputs.forEach(output => {
      const detail = Core.evaluateDetailed(output.ast, mapped);
      const collect = node => {
        signals[node.sourceId] = detail.values[node.id];
        (node.inputs || []).forEach(collect);
      };
      collect(output.ast);
      signals[output.id] = detail.value;
      outputs[circuit.diagram.nodes[output.id].label] = detail.value;
    });
    return { signals, outputs };
  }

  function resultText(circuit, inputs, result) {
    const { outputs, signals } = result;
    if (circuit.id === 'parity-generator') return `データの1は${inputs.A + inputs.B + inputs.C}個。P＝${outputs.P}を加えると、全体の1は偶数個になります。`;
    if (circuit.id === 'parity-checker') return outputs.E
      ? 'E＝1：1の個数が奇数なので、偶数パリティの規則と合いません。誤りを検出しました。'
      : 'E＝0：1の個数は偶数です。誤りは検出されませんが、誤りがないと断定はできません。';
    if (circuit.id === 'multiplexer') return `S＝${inputs.S}なので、入力${inputs.S ? 'B' : 'A'}を選択。F＝${outputs.F}です。`;
    if (circuit.id === 'decoder') return `A₁A₀＝${inputs['A₁']}${inputs['A₀']}₂（10進数の${2 * inputs['A₁'] + inputs['A₀']}）。${circuit.outputs.find(name => outputs[name])}だけが1になります。`;
    return `${inputs['A₁']}${inputs['A₀']}₂ ＋ ${inputs['B₁']}${inputs['B₀']}₂ ＝ ${outputs['C₂']}${outputs['S₁']}${outputs['S₀']}₂。下の桁からの桁上がりC₁＝${signals['low-both']}。`;
  }

  function initialize() {
    document.querySelectorAll('[data-logic-extension]').forEach(host => {
      if (host.dataset.extensionReady) return;
      const circuit = CIRCUITS.find(item => item.id === host.dataset.logicExtension);
      if (!circuit) return;
      const values = Object.fromEntries(circuit.inputs.map(name => [name, 0]));
      const controls = host.querySelector('[data-extension-inputs]');
      const diagramHost = host.querySelector('[data-extension-diagram]');
      const tableHost = host.querySelector('[data-extension-table]');
      const resultHost = host.querySelector('[data-extension-result]');
      if (!controls || !diagramHost || !tableHost || !resultHost) return;
      diagramHost.tabIndex = 0;
      diagramHost.setAttribute('role', 'region');
      diagramHost.setAttribute('aria-label', `${circuit.name}の回路図。横にスクロールできます`);
      const rows = Applications.makeRows(circuit);
      const svg = Applications.renderApplicationDiagram(diagramHost, circuit, { gateTerminals: false });
      function update() {
        const result = evaluate(circuit, values);
        Applications.updateApplicationSignals(svg, result.signals);
        resultHost.textContent = resultText(circuit, values, result);
        controls.querySelectorAll('[data-input]').forEach(button => {
          const name = button.dataset.input;
          button.textContent = String(values[name]);
          button.setAttribute('aria-pressed', values[name] ? 'true' : 'false');
          button.setAttribute('aria-label', `入力${name}。現在${values[name]}。クリックして切り替え`);
        });
        tableHost.querySelectorAll('tr[data-row]').forEach(tr => {
          const active = circuit.inputs.every(name => rows[Number(tr.dataset.row)].inputs[name] === values[name]);
          tr.classList.toggle('is-active', active);
          if (active) tr.setAttribute('aria-current', 'true');
          else tr.removeAttribute('aria-current');
        });
      }
      Widgets.createInputControls(controls, circuit.inputs, values, update);
      Widgets.renderTruthTable(tableHost, {
        inputNames: circuit.inputs, outputs: circuit.outputs.map(name => ({ id: name, name })),
        rows, activeInputs: values, caption: '真理値表（行を選ぶと入力を再現）',
        onRowSelect: inputs => { Object.assign(values, inputs); update(); }
      });
      const tableScroller = tableHost.querySelector('.logic-table-scroll');
      tableScroller.tabIndex = 0;
      tableScroller.setAttribute('role', 'region');
      tableScroller.setAttribute('aria-label', `${circuit.name}の真理値表。全${rows.length}行`);
      update();
      host.dataset.extensionReady = 'true';
    });
  }

  root.LogicExtensions = Object.freeze({ CIRCUITS, evaluate, point, initialize });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})(typeof globalThis !== 'undefined' ? globalThis : window);
