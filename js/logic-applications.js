// 有名な組合せ回路を、回路図・真理値表・機能・名称の順に調べる教材。
(function (root) {
  'use strict';

  const Widgets = root.LogicWidgets;

  const SVG_STYLE = `
    .logic-svg { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; }
    .logic-svg__background { fill: var(--logic-svg-bg, #ffffff); }
    .logic-wire { fill: none; stroke: var(--logic-wire, #64748b); stroke-width: 3; stroke-linecap: round; stroke-linejoin: miter; }
    .logic-gate__body { fill: var(--logic-gate-fill, #f8fafc); stroke: var(--logic-gate-stroke, #23384d); stroke-width: 2.6; }
    .logic-terminal, .logic-junction { fill: var(--logic-gate-stroke, #23384d); }
    .logic-node-label { fill: var(--logic-text, #17212b); font-size: 18px; font-weight: 800; }
    .logic-stage-box { fill: color-mix(in oklab, var(--theme-color, #225386) 5%, transparent); stroke: var(--logic-border, #b9cad8); stroke-width: 1.5; stroke-dasharray: 7 6; }
    .logic-stage-label { fill: var(--logic-muted, #536577); font-size: 13px; font-weight: 700; }
    .logic-output-box { fill: var(--logic-output-bg, #eef5fb); stroke: var(--logic-gate-stroke, #23384d); stroke-width: 2; }
  `;

  const DIAGRAMS = {
    majority: {
      width: 880,
      height: 410,
      nodes: {
        A: { kind: 'input', x: 55, y: 75, label: 'A' },
        B: { kind: 'input', x: 55, y: 200, label: 'B' },
        C: { kind: 'input', x: 55, y: 330, label: 'C' },
        ab: { kind: 'gate', gate: 'AND', x: 330, y: 80 },
        ac: { kind: 'gate', gate: 'AND', x: 330, y: 200 },
        bc: { kind: 'gate', gate: 'AND', x: 330, y: 320 },
        top: { kind: 'gate', gate: 'OR', x: 520, y: 130 },
        final: { kind: 'gate', gate: 'OR', x: 680, y: 220 },
        F: { kind: 'output', x: 820, y: 220, label: 'F' }
      },
      nets: [
        { from: 'A', junctions: [[130, 75]], branches: [
          { to: 'ab:0', via: [[130, 75], [130, 66]] },
          { to: 'ac:0', via: [[130, 75], [130, 186]] }
        ] },
        { from: 'B', junctions: [[170, 200]], branches: [
          { to: 'ab:1', via: [[170, 200], [170, 94]] },
          { to: 'bc:0', via: [[170, 200], [170, 306]] }
        ] },
        { from: 'C', junctions: [[210, 330]], branches: [
          { to: 'ac:1', via: [[210, 330], [210, 214]] },
          { to: 'bc:1', via: [[210, 330], [210, 334]] }
        ] },
        { from: 'ab:out', branches: [{ to: 'top:0', via: [[440, 80], [440, 116]] }] },
        { from: 'ac:out', branches: [{ to: 'top:1', via: [[450, 200], [450, 144]] }] },
        { from: 'top:out', branches: [{ to: 'final:0', via: [[610, 130], [610, 206]] }] },
        { from: 'bc:out', branches: [{ to: 'final:1', via: [[600, 320], [600, 234]] }] },
        { from: 'final:out', branches: [{ to: 'F' }] }
      ]
    },
    comparator: {
      width: 970,
      height: 500,
      nodes: {
        A: { kind: 'input', x: 55, y: 120, label: 'A' },
        B: { kind: 'input', x: 55, y: 380, label: 'B' },
        notA: { kind: 'gate', gate: 'NOT', x: 250, y: 190 },
        notB: { kind: 'gate', gate: 'NOT', x: 250, y: 310 },
        greater: { kind: 'gate', gate: 'AND', x: 465, y: 105 },
        less: { kind: 'gate', gate: 'AND', x: 465, y: 395 },
        different: { kind: 'gate', gate: 'OR', x: 650, y: 250 },
        equal: { kind: 'gate', gate: 'NOT', x: 775, y: 250 },
        G: { kind: 'output', x: 910, y: 105, label: 'G' },
        E: { kind: 'output', x: 910, y: 250, label: 'E' },
        L: { kind: 'output', x: 910, y: 395, label: 'L' }
      },
      nets: [
        { from: 'A', junctions: [[130, 120]], branches: [
          { to: 'greater:0', via: [[130, 120], [130, 91]] },
          { to: 'notA:0', via: [[130, 120], [130, 190]] }
        ] },
        { from: 'B', junctions: [[165, 380]], branches: [
          { to: 'less:1', via: [[165, 380], [165, 409]] },
          { to: 'notB:0', via: [[165, 380], [165, 310]] }
        ] },
        { from: 'notB:out', branches: [{ to: 'greater:1', via: [[360, 310], [360, 119]] }] },
        { from: 'notA:out', branches: [{ to: 'less:0', via: [[390, 190], [390, 381]] }] },
        { from: 'greater:out', junctions: [[545, 105]], branches: [
          { to: 'G', via: [[545, 105], [545, 68], [880, 68], [880, 105]] },
          { to: 'different:0', via: [[545, 105], [545, 236]] }
        ] },
        { from: 'less:out', junctions: [[570, 395]], branches: [
          { to: 'L' },
          { to: 'different:1', via: [[570, 395], [570, 264]] }
        ] },
        { from: 'different:out', branches: [{ to: 'equal:0' }] },
        { from: 'equal:out', branches: [{ to: 'E' }] }
      ]
    },
    halfAdder: {
      width: 900,
      height: 410,
      nodes: {
        A: { kind: 'input', x: 55, y: 100, label: 'A' },
        B: { kind: 'input', x: 55, y: 300, label: 'B' },
        any: { kind: 'gate', gate: 'OR', x: 300, y: 95 },
        both: { kind: 'gate', gate: 'AND', x: 300, y: 285 },
        notBoth: { kind: 'gate', gate: 'NOT', x: 470, y: 285 },
        sum: { kind: 'gate', gate: 'AND', x: 630, y: 160 },
        S: { kind: 'output', x: 840, y: 160, label: 'S' },
        C: { kind: 'output', x: 840, y: 320, label: 'C' }
      },
      nets: [
        { from: 'A', junctions: [[140, 100]], branches: [
          { to: 'any:0', via: [[140, 100], [140, 81]] },
          { to: 'both:0', via: [[140, 100], [140, 271]] }
        ] },
        { from: 'B', junctions: [[180, 300]], branches: [
          { to: 'any:1', via: [[180, 300], [180, 109]] },
          { to: 'both:1', via: [[180, 300], [180, 299]] }
        ] },
        { from: 'any:out', branches: [{ to: 'sum:0', via: [[520, 95], [520, 146]] }] },
        { from: 'both:out', junctions: [[380, 285]], branches: [
          { to: 'notBoth:0', via: [[380, 285]] },
          { to: 'C', via: [[380, 285], [380, 320]] }
        ] },
        { from: 'notBoth:out', branches: [{ to: 'sum:1', via: [[550, 285], [550, 174]] }] },
        { from: 'sum:out', branches: [{ to: 'S' }] }
      ]
    },
    fullAdder: {
      width: 1180,
      height: 560,
      groups: [
        { x: 205, y: 35, width: 415, height: 245, label: '第1段' },
        { x: 670, y: 155, width: 385, height: 260, label: '第2段' }
      ],
      nodes: {
        A: { kind: 'input', x: 55, y: 80, label: 'A' },
        B: { kind: 'input', x: 55, y: 210, label: 'B' },
        Cin: { kind: 'input', x: 55, y: 450, label: 'Cin' },
        any1: { kind: 'gate', gate: 'OR', x: 260, y: 80 },
        both1: { kind: 'gate', gate: 'AND', x: 260, y: 210 },
        notBoth1: { kind: 'gate', gate: 'NOT', x: 420, y: 210 },
        sum1: { kind: 'gate', gate: 'AND', x: 570, y: 120 },
        any2: { kind: 'gate', gate: 'OR', x: 720, y: 200 },
        both2: { kind: 'gate', gate: 'AND', x: 720, y: 360 },
        notBoth2: { kind: 'gate', gate: 'NOT', x: 860, y: 360 },
        sum2: { kind: 'gate', gate: 'AND', x: 1000, y: 250 },
        carry: { kind: 'gate', gate: 'OR', x: 1000, y: 455 },
        S: { kind: 'output', x: 1140, y: 250, label: 'S' },
        Cout: { kind: 'output', x: 1140, y: 455, label: 'Cout' }
      },
      nets: [
        { from: 'A', junctions: [[120, 80]], branches: [
          { to: 'any1:0', via: [[120, 80], [120, 66]] },
          { to: 'both1:0', via: [[120, 80], [120, 196]] }
        ] },
        { from: 'B', junctions: [[155, 210]], branches: [
          { to: 'any1:1', via: [[155, 210], [155, 94]] },
          { to: 'both1:1', via: [[155, 210], [155, 224]] }
        ] },
        { from: 'any1:out', branches: [{ to: 'sum1:0', via: [[480, 80], [480, 106]] }] },
        { from: 'both1:out', junctions: [[335, 210]], branches: [
          { to: 'notBoth1:0', via: [[335, 210]] },
          { to: 'carry:0', via: [[335, 210], [335, 525], [930, 525], [930, 441]] }
        ] },
        { from: 'notBoth1:out', branches: [{ to: 'sum1:1', via: [[500, 210], [500, 134]] }] },
        { from: 'sum1:out', junctions: [[630, 120]], branches: [
          { to: 'any2:0', via: [[630, 120], [630, 186]] },
          { to: 'both2:0', via: [[630, 120], [630, 346]] }
        ] },
        { from: 'Cin', junctions: [[590, 450]], branches: [
          { to: 'any2:1', via: [[590, 450], [590, 214]] },
          { to: 'both2:1', via: [[590, 450], [590, 374]] }
        ] },
        { from: 'any2:out', branches: [{ to: 'sum2:0', via: [[920, 200], [920, 236]] }] },
        { from: 'both2:out', junctions: [[800, 360]], branches: [
          { to: 'notBoth2:0', via: [[800, 360]] },
          { to: 'carry:1', via: [[800, 360], [800, 469]] }
        ] },
        { from: 'notBoth2:out', branches: [{ to: 'sum2:1', via: [[930, 360], [930, 264]] }] },
        { from: 'sum2:out', branches: [{ to: 'S' }] },
        { from: 'carry:out', branches: [{ to: 'Cout' }] }
      ]
    }
  };

  const CIRCUITS = [
    {
      id: 'majority',
      marker: 'A',
      name: '多数決回路',
      inputs: ['A', 'B', 'C'],
      outputs: ['F'],
      evaluate: ({ A, B, C }) => ({ F: Number(A + B + C >= 2) }),
      functionChoices: [
        ['same', '3つの入力がすべて同じときだけ、Fを1にする'],
        ['majority', '3つの入力のうち、2つ以上が1のとき、Fを1にする'],
        ['add', 'AとBを足し、Cを前の桁からの桁上がりとして加える']
      ],
      correctFunction: 'majority',
      nameChoices: ['比較回路', '多数決回路', '全加算回路', '半加算回路'],
      summary: '3つの入力の多数派を出力する回路です。1が2つ以上ならFは1、0が2つ以上ならFは0になります。',
      facts: ['入力が011・101・110・111のときFが1になります。', '投票結果や、複数のセンサーの判定をまとめる考え方に利用できます。']
    },
    {
      id: 'comparator',
      marker: 'B',
      name: '比較回路',
      inputs: ['A', 'B'],
      outputs: ['G', 'E', 'L'],
      evaluate: ({ A, B }) => ({
        G: Number(A > B),
        E: Number(A === B),
        L: Number(A < B)
      }),
      functionChoices: [
        ['add', 'AとBを足し、和と桁上がりの2つを出力する'],
        ['compare', 'AとBの大小と一致を調べ、G・E・Lのどれか1つを1にする'],
        ['select', '選択信号に応じてAまたはBの一方を出力する']
      ],
      correctFunction: 'compare',
      nameChoices: ['半加算回路', '多数決回路', '比較回路', '全加算回路'],
      summary: '1ビットのAとBを比べる回路です。GはA＞B、EはA＝B、LはA＜Bを表し、常にどれか1つだけが1になります。',
      facts: ['GはGreater、EはEqual、LはLessの頭文字です。', '複数ビットへ広げると、2進数の大小を調べられます。']
    },
    {
      id: 'halfAdder',
      marker: 'C',
      name: '半加算回路',
      inputs: ['A', 'B'],
      outputs: ['S', 'C'],
      evaluate: ({ A, B }) => ({
        S: (A + B) % 2,
        C: Number(A + B >= 2)
      }),
      functionChoices: [
        ['compare', 'AとBの大小を調べ、大小関係ごとに別の出力を1にする'],
        ['half-add', 'AとBを1桁の2進数として加え、和Sと桁上がりCを出力する'],
        ['full-add', 'A・B・前の桁からの桁上がりを加え、和と次の桁上がりを出す']
      ],
      correctFunction: 'half-add',
      nameChoices: ['全加算回路', '比較回路', '半加算回路', '多数決回路'],
      summary: '2つの1ビットを加算する回路です。Sはその桁の和、Cは次の桁への桁上がりを表します。',
      facts: ['A＝1、B＝1では、1＋1＝10₂なのでS＝0、C＝1です。', '前の桁から来る桁上がりは入力できないため、「半」加算回路と呼ばれます。']
    },
    {
      id: 'fullAdder',
      marker: 'D',
      name: '全加算回路',
      inputs: ['A', 'B', 'Cin'],
      outputs: ['S', 'Cout'],
      evaluate: ({ A, B, Cin }) => ({
        S: (A + B + Cin) % 2,
        Cout: Number(A + B + Cin >= 2)
      }),
      functionChoices: [
        ['majority', '3つの入力の多数派だけを、1つの出力として取り出す'],
        ['half-add', 'AとBだけを加え、前の桁からの桁上がりは扱わない'],
        ['full-add', 'A・B・前の桁からの桁上がりCinを加え、和Sと次の桁上がりCoutを出す']
      ],
      correctFunction: 'full-add',
      nameChoices: ['多数決回路', '半加算回路', '比較回路', '全加算回路'],
      summary: 'A、B、前の桁からの桁上がりCinを加算し、和Sと次の桁への桁上がりCoutを出す回路です。',
      facts: ['A＝B＝Cin＝1では、1＋1＋1＝11₂なのでS＝1、Cout＝1です。', '全加算回路を桁ごとにつなぐと、複数桁の2進数を加算できます。']
    }
  ];

  function createElement(name, options = {}) {
    const element = document.createElement(name);
    if (options.className) element.className = options.className;
    if (options.text != null) element.textContent = options.text;
    Object.entries(options.attributes || {}).forEach(([key, value]) => {
      if (value != null) element.setAttribute(key, String(value));
    });
    return element;
  }

  function makeRows(circuit) {
    const count = 2 ** circuit.inputs.length;
    return Array.from({ length: count }, (_, rowIndex) => {
      const inputs = {};
      circuit.inputs.forEach((name, inputIndex) => {
        inputs[name] = (rowIndex >> (circuit.inputs.length - inputIndex - 1)) & 1;
      });
      return { inputs, outputs: circuit.evaluate(inputs) };
    });
  }

  function endpoint(spec, reference) {
    const [nodeId, port = 'out'] = String(reference).split(':');
    const node = spec.nodes[nodeId];
    if (!node) throw new Error(`回路図の接続先「${nodeId}」が見つかりません。`);
    if (node.kind === 'input') return { x: node.x, y: node.y };
    if (node.kind === 'output') return { x: node.x - 30, y: node.y };
    const geometry = root.LogicRenderer.gateGeometry(node.gate);
    if (port === 'out') return { x: node.x + geometry.outputX, y: node.y };
    const index = Number(port);
    return { x: node.x + geometry.inputX, y: node.y + geometry.inputYs[index] };
  }

  function orthogonalPath(points) {
    const compact = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
    let path = `M ${compact[0][0]} ${compact[0][1]}`;
    for (let index = 1; index < compact.length; index += 1) {
      const previous = compact[index - 1];
      const current = compact[index];
      if (previous[1] === current[1]) path += ` H ${current[0]}`;
      else if (previous[0] === current[0]) path += ` V ${current[1]}`;
      else throw new Error(`斜めの配線は使用できません（${previous.join(',')} → ${current.join(',')}）。`);
    }
    return path;
  }

  function renderApplicationDiagram(target, circuit) {
    const Renderer = root.LogicRenderer;
    const spec = DIAGRAMS[circuit.id];
    const svg = Renderer.svgElement('svg', {
      class: 'logic-svg logic-application-svg',
      viewBox: `0 0 ${spec.width} ${spec.height}`,
      style: `--logic-natural-width: ${spec.width}px`,
      role: 'img',
      'aria-labelledby': `logic-application-title-${circuit.id}`,
      'aria-describedby': `logic-application-description-${circuit.id}`,
      preserveAspectRatio: 'xMidYMid meet'
    });
    svg.append(
      Renderer.svgElement('title', { id: `logic-application-title-${circuit.id}` }, `回路${circuit.marker}の回路図`),
      Renderer.svgElement('desc', { id: `logic-application-description-${circuit.id}` }, `入力${circuit.inputs.join('、')}から、AND・OR・NOTゲートだけを通り、出力${circuit.outputs.join('、')}へつながる組合せ回路です。`),
      Renderer.svgElement('style', {}, SVG_STYLE),
      Renderer.svgElement('rect', {
        class: 'logic-svg__background', x: 0, y: 0, width: spec.width, height: spec.height, rx: 12
      })
    );

    (spec.groups || []).forEach(group => {
      svg.appendChild(Renderer.svgElement('rect', {
        class: 'logic-stage-box', x: group.x, y: group.y, width: group.width, height: group.height, rx: 12
      }));
      svg.appendChild(Renderer.svgElement('text', {
        class: 'logic-stage-label', x: group.x + 12, y: group.y + 20
      }, group.label));
    });

    spec.nets.forEach(net => {
      const start = endpoint(spec, net.from);
      net.branches.forEach(branch => {
        const end = endpoint(spec, branch.to);
        const points = [[start.x, start.y], ...(branch.via || []), [end.x, end.y]];
        svg.appendChild(Renderer.svgElement('path', {
          class: 'logic-wire',
          d: orthogonalPath(points),
          'aria-hidden': 'true'
        }));
      });
      (net.junctions || []).forEach(([x, y]) => {
        svg.appendChild(Renderer.svgElement('circle', {
          class: 'logic-junction', cx: x, cy: y, r: 4.2, 'aria-hidden': 'true'
        }));
      });
    });

    Object.values(spec.nodes).filter(node => node.kind === 'gate').forEach(node => {
      svg.appendChild(Renderer.createGateSymbol(node.gate, node.x, node.y));
    });

    Object.values(spec.nodes).filter(node => node.kind === 'input').forEach(node => {
      svg.appendChild(Renderer.svgElement('circle', {
        class: 'logic-terminal', cx: node.x, cy: node.y, r: 5
      }));
      svg.appendChild(Renderer.svgElement('text', {
        class: 'logic-node-label', x: node.x - 15, y: node.y + 6, 'text-anchor': 'end'
      }, node.label));
    });

    Object.values(spec.nodes).filter(node => node.kind === 'gate').forEach(node => {
      const geometry = Renderer.gateGeometry(node.gate);
      geometry.inputYs.forEach(offset => {
        svg.appendChild(Renderer.svgElement('circle', {
          class: 'logic-terminal', cx: node.x + geometry.inputX, cy: node.y + offset, r: 3.6
        }));
      });
      if (node.gate !== 'NOT') {
        svg.appendChild(Renderer.svgElement('circle', {
          class: 'logic-terminal', cx: node.x + geometry.outputX, cy: node.y, r: 3.6
        }));
      }
    });

    Object.values(spec.nodes).filter(node => node.kind === 'output').forEach(node => {
      svg.appendChild(Renderer.svgElement('rect', {
        class: 'logic-output-box', x: node.x - 30, y: node.y - 27, width: 60, height: 54, rx: 10
      }));
      svg.appendChild(Renderer.svgElement('text', {
        class: 'logic-node-label', x: node.x, y: node.y + 6, 'text-anchor': 'middle'
      }, node.label));
    });

    const hint = createElement('div', { className: 'logic-circuit__scroll-hint', text: '↔ 回路図は左右に動かせます' });
    hint.setAttribute('aria-hidden', 'true');
    target.replaceChildren(hint, svg);
    return svg;
  }

  function createInitialState(circuit) {
    const rows = makeRows(circuit);
    return {
      rows,
      answers: rows.map(() => Object.fromEntries(circuit.outputs.map(output => [output, null]))),
      truthSolved: false,
      functionSelected: '',
      functionSolved: false,
      nameSelected: '',
      nameSolved: false
    };
  }

  function setFeedback(target, text, kind = '') {
    target.className = `logic-feedback${kind ? ` is-${kind}` : ''}`;
    target.textContent = text;
  }

  function initialize() {
    const selector = document.getElementById('logic-circuit-selector');
    const challengeHost = document.getElementById('logic-application-challenge');
    const progress = document.getElementById('logic-application-progress');
    if (!selector || !challengeHost || !progress || !root.LogicRenderer) return;

    const states = Object.fromEntries(CIRCUITS.map(circuit => [circuit.id, createInitialState(circuit)]));
    let activeId = CIRCUITS[0].id;

    function solvedCount() {
      return CIRCUITS.filter(circuit => states[circuit.id].nameSolved).length;
    }

    function updateProgress() {
      const solved = solvedCount();
      progress.textContent = `完成 ${solved} / ${CIRCUITS.length}`;
      progress.classList.toggle('is-complete', solved === CIRCUITS.length);
    }

    function renderSelector() {
      selector.replaceChildren();
      CIRCUITS.forEach(circuit => {
        const state = states[circuit.id];
        const button = createElement('button', {
          className: `logic-circuit-selector__button${circuit.id === activeId ? ' is-active' : ''}${state.nameSolved ? ' is-solved' : ''}`,
          attributes: {
            type: 'button',
            'aria-pressed': String(circuit.id === activeId),
            'aria-label': `回路${circuit.marker}${state.nameSolved ? `、正解は${circuit.name}` : ''}`
          }
        });
        button.append(
          createElement('span', { className: 'logic-circuit-selector__marker', text: circuit.marker }),
          createElement('span', { text: state.nameSolved ? circuit.name : `回路${circuit.marker}` }),
          createElement('span', { className: 'logic-circuit-selector__status', text: state.nameSolved ? '✓' : '' })
        );
        button.addEventListener('click', () => {
          activeId = circuit.id;
          renderSelector();
          renderChallenge();
        });
        selector.appendChild(button);
      });
    }

    function renderTruthTable(container, circuit, state, feedback, functionStep) {
      const scroll = createElement('div', { className: 'logic-table-scroll' });
      const table = createElement('table', { className: 'logic-truth-table logic-application-table' });
      table.appendChild(createElement('caption', { text: '出力欄を選び、真理値表を完成させてください' }));
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      circuit.inputs.forEach(name => {
        headRow.appendChild(createElement('th', { text: name, attributes: { scope: 'col' } }));
      });
      circuit.outputs.forEach((name, index) => {
        headRow.appendChild(createElement('th', {
          className: index === 0 ? 'logic-truth-table__divider' : '',
          text: name,
          attributes: { scope: 'col' }
        }));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');

      state.rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        circuit.inputs.forEach(name => tr.appendChild(createElement('td', { text: row.inputs[name] })));
        circuit.outputs.forEach((output, outputIndex) => {
          const cell = createElement('td', {
            className: `${outputIndex === 0 ? 'logic-truth-table__divider ' : ''}logic-answer-cell ${state.truthSolved ? 'is-correct' : ''}`.trim()
          });
          const control = Widgets.createTruthAnswerControl({
            value: state.answers[rowIndex][output],
            readOnly: state.truthSolved,
            disabled: state.truthSolved,
            className: 'logic-application-table__answer',
            attributes: { 'data-row': rowIndex, 'data-output': output },
            ariaLabel: current => `${circuit.inputs.map(name => `${name}=${row.inputs[name]}`).join('、')}のとき、${output}は${current == null ? '未入力' : current}`,
            onChange: next => {
              state.answers[rowIndex][output] = next;
              cell.classList.remove('is-correct', 'is-wrong', 'is-unanswered');
              setFeedback(feedback, 'すべての出力欄を埋めたら、「真理値表を判定」を選びます。');
            }
          });
          cell.appendChild(control.element);
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scroll.appendChild(table);
      container.appendChild(scroll);

      const actions = createElement('div', { className: 'logic-question-actions' });
      const judge = createElement('button', {
        className: 'logic-primary-button',
        text: state.truthSolved ? '真理値表 正解 ✓' : '真理値表を判定',
        attributes: { type: 'button', disabled: state.truthSolved ? '' : null }
      });
      judge.addEventListener('click', () => {
        const answerButtons = Array.from(table.querySelectorAll('[data-row][data-output]'));
        const unanswered = answerButtons.filter(button => state.answers[Number(button.dataset.row)][button.dataset.output] == null);
        if (unanswered.length) {
          setFeedback(feedback, `未入力の欄が${unanswered.length}個あります。すべて0または1にしてください。`, 'info');
          unanswered[0].focus();
          return;
        }
        let correct = true;
        answerButtons.forEach(button => {
          const rowIndex = Number(button.dataset.row);
          const output = button.dataset.output;
          const cell = button.closest('td');
          const matches = state.answers[rowIndex][output] === state.rows[rowIndex].outputs[output];
          cell.classList.remove('is-correct', 'is-wrong', 'is-unanswered');
          cell.classList.add(matches ? 'is-correct' : 'is-wrong');
          if (!matches) correct = false;
        });
        if (!correct) {
          setFeedback(feedback, '赤い欄を見直しましょう。入力ごとに左からゲートの出力を追ってください。', 'wrong');
          return;
        }
        state.truthSolved = true;
        answerButtons.forEach(button => { button.disabled = true; });
        judge.disabled = true;
        judge.textContent = '真理値表 正解 ✓';
        functionStep.hidden = false;
        setFeedback(feedback, '全セル正解です。次に、この入出力が表す機能を考えましょう。', 'correct');
      });
      actions.appendChild(judge);
      container.append(actions, feedback);
    }

    function renderChoiceStep(container, options) {
      const heading = createElement('h4', { className: 'logic-application-step__title', text: options.title });
      const description = createElement('p', { className: 'logic-application-step__prompt', text: options.prompt });
      const choices = createElement('div', { className: 'logic-choice-grid', attributes: { role: 'group', 'aria-label': options.title } });
      options.choices.forEach(([value, label]) => {
        const isSelected = options.selected() === value;
        const button = createElement('button', {
          className: `logic-choice-button${isSelected ? ' is-selected' : ''}${isSelected && options.solved() ? ' is-correct' : ''}`,
          text: label,
          attributes: {
            type: 'button',
            'aria-pressed': String(isSelected),
            disabled: options.solved() ? '' : null
          }
        });
        button.addEventListener('click', () => {
          if (options.solved()) return;
          options.select(value);
          choices.querySelectorAll('.logic-choice-button').forEach(choice => {
            const selected = choice === button;
            choice.classList.toggle('is-selected', selected);
            choice.setAttribute('aria-pressed', String(selected));
            choice.classList.remove('is-wrong');
          });
          setFeedback(options.feedback, '選んだ答えを判定してください。');
          judge.disabled = false;
        });
        choices.appendChild(button);
      });
      const actions = createElement('div', { className: 'logic-question-actions' });
      const judge = createElement('button', {
        className: 'logic-primary-button',
        text: options.solved() ? `${options.solvedLabel} ✓` : '判定',
        attributes: { type: 'button', disabled: options.solved() || !options.selected() ? '' : null }
      });
      judge.addEventListener('click', () => {
        if (!options.selected()) return;
        if (options.selected() !== options.correctValue) {
          const selectedButton = Array.from(choices.children).find(button => button.getAttribute('aria-pressed') === 'true');
          if (selectedButton) selectedButton.classList.add('is-wrong');
          setFeedback(options.feedback, options.wrongText, 'wrong');
          return;
        }
        options.markSolved();
        choices.querySelectorAll('button').forEach(button => { button.disabled = true; });
        const selectedButton = Array.from(choices.children).find(button => button.getAttribute('aria-pressed') === 'true');
        if (selectedButton) selectedButton.classList.add('is-correct');
        judge.disabled = true;
        judge.textContent = `${options.solvedLabel} ✓`;
        setFeedback(options.feedback, options.correctText, 'correct');
        options.onSolved();
      });
      actions.appendChild(judge);
      container.append(heading, description, choices, actions, options.feedback);
    }

    function renderChallenge() {
      const circuit = CIRCUITS.find(item => item.id === activeId);
      const state = states[circuit.id];
      challengeHost.replaceChildren();

      const card = createElement('section', { className: 'logic-application-card', attributes: { 'aria-labelledby': `logic-application-${circuit.id}` } });
      const header = createElement('header', { className: 'logic-application-card__header' });
      const titleWrap = createElement('div');
      titleWrap.append(
        createElement('span', { className: 'logic-application-card__eyebrow', text: `${circuit.inputs.length}入力・${circuit.outputs.length}出力` }),
        createElement('h3', { text: state.nameSolved ? `回路${circuit.marker}：${circuit.name}` : `回路${circuit.marker}`, attributes: { id: `logic-application-${circuit.id}` } })
      );
      const reset = createElement('button', { className: 'logic-secondary-button logic-application-reset', text: 'この回路を最初から', attributes: { type: 'button' } });
      reset.addEventListener('click', () => {
        states[circuit.id] = createInitialState(circuit);
        renderSelector();
        updateProgress();
        renderChallenge();
      });
      header.append(titleWrap, reset);

      const diagramStep = createElement('section', { className: 'logic-application-step logic-application-step--diagram' });
      diagramStep.appendChild(createElement('h4', { className: 'logic-application-step__title', text: '1. 回路図を読む' }));
      diagramStep.appendChild(createElement('p', { className: 'logic-application-step__prompt', text: `入力${circuit.inputs.join('・')}が、どのゲートへ分岐しているかを追いましょう。` }));
      const figure = document.createElement('figure');
      figure.className = 'logic-application-figure';
      const diagram = createElement('div', { className: 'logic-circuit logic-application-diagram' });
      renderApplicationDiagram(diagram, circuit);
      figure.append(diagram, createElement('figcaption', { text: `回路${circuit.marker}（AND・OR・NOTのみで構成）` }));
      diagramStep.appendChild(figure);

      const truthStep = createElement('section', { className: 'logic-application-step' });
      truthStep.appendChild(createElement('h4', { className: 'logic-application-step__title', text: '2. 真理値表を完成させる' }));
      truthStep.appendChild(createElement('p', { className: 'logic-application-step__prompt', text: '入力の組み合わせごとに、回路を通ったあとの出力を求めます。' }));
      const truthFeedback = createElement('div', {
        className: `logic-feedback${state.truthSolved ? ' is-correct' : ''}`,
        text: state.truthSolved ? '全セル正解です。' : '未入力の−に触れて0か1を選びます。入力後はクリックで切り替え、長押しで未入力にも戻せます。',
        attributes: { role: 'status', 'aria-live': 'polite' }
      });

      const functionStep = createElement('section', { className: 'logic-application-step logic-application-step--locked', attributes: { hidden: state.truthSolved ? null : '' } });
      const functionFeedback = createElement('div', { className: `logic-feedback${state.functionSolved ? ' is-correct' : ''}`, text: state.functionSolved ? '機能を正しく説明できました。' : '最もよく表している説明を1つ選びます。', attributes: { role: 'status', 'aria-live': 'polite' } });

      const nameStep = createElement('section', { className: 'logic-application-step logic-application-step--locked', attributes: { hidden: state.functionSolved ? null : '' } });
      const nameFeedback = createElement('div', { className: `logic-feedback${state.nameSolved ? ' is-correct' : ''}`, text: state.nameSolved ? `正解は「${circuit.name}」です。` : 'この働きを持つ回路の名前を選びます。', attributes: { role: 'status', 'aria-live': 'polite' } });

      renderTruthTable(truthStep, circuit, state, truthFeedback, functionStep);
      renderChoiceStep(functionStep, {
        title: '3. 回路の機能を考える',
        prompt: '完成した真理値表は、どのような働きを表していますか？',
        choices: circuit.functionChoices,
        selected: () => state.functionSelected,
        select: value => { state.functionSelected = value; },
        solved: () => state.functionSolved,
        correctValue: circuit.correctFunction,
        solvedLabel: '機能 正解',
        feedback: functionFeedback,
        wrongText: 'もう一度、出力が1になる行に注目して考えましょう。',
        correctText: '正解です。最後に、この機能を持つ回路の名前を当てましょう。',
        markSolved: () => { state.functionSolved = true; },
        onSolved: () => { nameStep.hidden = false; }
      });

      renderChoiceStep(nameStep, {
        title: '4. 回路の名前を当てる',
        prompt: '回路図と機能に合う名前はどれですか？',
        choices: circuit.nameChoices.map(name => [name, name]),
        selected: () => state.nameSelected,
        select: value => { state.nameSelected = value; },
        solved: () => state.nameSolved,
        correctValue: circuit.name,
        solvedLabel: '名称 正解',
        feedback: nameFeedback,
        wrongText: '機能の説明と名前の意味を結び付けて、もう一度選びましょう。',
        correctText: `正解です。回路${circuit.marker}は「${circuit.name}」です。`,
        markSolved: () => { state.nameSolved = true; },
        onSolved: () => {
          reveal.hidden = false;
          nextButton.hidden = false;
          titleWrap.querySelector('h3').textContent = `回路${circuit.marker}：${circuit.name}`;
          renderSelector();
          updateProgress();
          if (solvedCount() === CIRCUITS.length) {
            nextButton.textContent = '4回路をすべて完成しました';
            nextButton.disabled = true;
          }
        }
      });

      const reveal = createElement('aside', { className: 'logic-application-reveal', attributes: { hidden: state.nameSolved ? null : '' } });
      reveal.append(
        createElement('p', { className: 'logic-application-reveal__label', text: '回路の正体' }),
        createElement('h4', { text: circuit.name }),
        createElement('p', { text: circuit.summary })
      );
      const facts = document.createElement('ul');
      circuit.facts.forEach(fact => facts.appendChild(createElement('li', { text: fact })));
      reveal.appendChild(facts);

      const footer = createElement('div', { className: 'logic-question-actions logic-application-card__footer' });
      const nextButton = createElement('button', {
        className: 'logic-primary-button',
        text: solvedCount() === CIRCUITS.length ? '4回路をすべて完成しました' : '次の未完成の回路へ',
        attributes: { type: 'button', hidden: state.nameSolved ? null : '', disabled: solvedCount() === CIRCUITS.length ? '' : null }
      });
      nextButton.addEventListener('click', () => {
        const next = CIRCUITS.find(item => !states[item.id].nameSolved);
        if (!next) return;
        activeId = next.id;
        renderSelector();
        renderChallenge();
        document.getElementById(`logic-application-${next.id}`)?.focus({ preventScroll: true });
        challengeHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      footer.appendChild(nextButton);

      card.append(header, diagramStep, truthStep, functionStep, nameStep, reveal, footer);
      challengeHost.appendChild(card);
    }

    renderSelector();
    updateProgress();
    renderChallenge();
  }

  root.LogicApplications = Object.freeze({ CIRCUITS, makeRows, renderApplicationDiagram, initialize });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})(typeof globalThis !== 'undefined' ? globalThis : window);
