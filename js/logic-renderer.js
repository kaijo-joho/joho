// ASTから、拡大縮小可能なSVG論理回路図を生成する。
(function (root) {
  'use strict';

  const Core = root.LogicCore;
  if (!Core) throw new Error('logic-renderer.jsより先にlogic-core.jsを読み込んでください。');

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgElement(name, attributes = {}, text = '') {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value != null) element.setAttribute(key, String(value));
    });
    if (text !== '') element.textContent = text;
    return element;
  }

  function gateGeometry(type) {
    const gate = String(type).toUpperCase();
    if (!Core.BASIC_GATES.includes(gate)) {
      throw new TypeError(`回路図で使用できるゲートはAND・OR・NOTだけです（指定: ${type}）。`);
    }
    return gate === 'NOT'
      ? { inputX: -31, outputX: 38, inputYs: [0] }
      : { inputX: -31, outputX: 31, inputYs: [-14, 14] };
  }

  function createGateSymbol(type, x = 0, y = 0, options = {}) {
    const gate = String(type).toUpperCase();
    const group = svgElement('g', {
      class: `logic-gate logic-gate--${gate.toLowerCase()}${options.className ? ` ${options.className}` : ''}`,
      transform: `translate(${x} ${y})`,
      'data-gate': gate
    });
    const title = svgElement('title', {}, gate === 'NOT' ? 'NOTゲート（否定）' : `${gate}ゲート`);
    group.appendChild(title);

    if (gate === 'AND') {
      group.appendChild(svgElement('path', {
        class: 'logic-gate__body',
        d: 'M -30 -26 L -8 -26 C 17 -26 30 -15 30 0 C 30 15 17 26 -8 26 L -30 26 Z'
      }));
    } else if (gate === 'OR') {
      group.appendChild(svgElement('path', {
        class: 'logic-gate__body',
        d: 'M -31 -26 C -12 -22 9 -19 30 0 C 9 19 -12 22 -31 26 C -18 10 -18 -10 -31 -26 Z'
      }));
    } else if (gate === 'NOT') {
      group.appendChild(svgElement('path', {
        class: 'logic-gate__body',
        d: 'M -30 -24 L 23 0 L -30 24 Z'
      }));
      group.appendChild(svgElement('circle', {
        class: 'logic-gate__body logic-gate__not-bubble',
        cx: 30,
        cy: 0,
        r: 6
      }));
    } else {
      throw new TypeError(`未対応のゲート「${type}」です。`);
    }
    return group;
  }

  const INTERNAL_STYLE = `
    .logic-svg { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; }
    .logic-svg__background { fill: var(--logic-svg-bg, #ffffff); }
    .logic-wire { fill: none; stroke: var(--logic-wire, #64748b); stroke-width: 3; stroke-linecap: round; stroke-linejoin: miter; }
    .logic-wire.is-one { stroke: var(--logic-one, #d9483b); stroke-width: 5; }
    .logic-gate__body { fill: var(--logic-gate-fill, #f8fafc); stroke: var(--logic-gate-stroke, #23384d); stroke-width: 2.6; }
    .logic-gate__detail { fill: none; stroke: var(--logic-gate-stroke, #23384d); stroke-width: 2.6; }
    .logic-terminal { fill: var(--logic-gate-stroke, #23384d); }
    .logic-terminal.is-one { fill: var(--logic-one, #d9483b); }
    .logic-node-label { fill: var(--logic-text, #17212b); font-size: 18px; font-weight: 700; }
    .logic-node-sub { fill: var(--logic-muted, #536577); font-size: 12px; }
    .logic-value-badge { fill: var(--logic-value-bg, #ffffff); stroke: var(--logic-wire, #64748b); stroke-width: 1.5; }
    .logic-value-badge.is-one { stroke: var(--logic-one, #d9483b); fill: var(--logic-one-soft, #fff0ed); }
    .logic-value-text { fill: var(--logic-text, #17212b); font-size: 13px; font-weight: 800; text-anchor: middle; dominant-baseline: central; }
    .logic-output-box { fill: var(--logic-output-bg, #eef5fb); stroke: var(--logic-gate-stroke, #23384d); stroke-width: 2; }
    .logic-output-box.is-one { fill: var(--logic-one-soft, #fff0ed); stroke: var(--logic-one, #d9483b); }
    .logic-port-dot { fill: var(--logic-svg-bg, #ffffff); stroke: var(--logic-gate-stroke, #23384d); stroke-width: 2; }
  `;

  function appendValueBadge(svg, x, y, value, label) {
    const group = svgElement('g', {
      class: `logic-value${value === 1 ? ' is-one' : ''}`,
      'aria-label': `${label || '信号'}は${value}`
    });
    group.appendChild(svgElement('rect', {
      class: `logic-value-badge${value === 1 ? ' is-one' : ''}`,
      x: x - 10,
      y: y - 10,
      width: 20,
      height: 20,
      rx: 6
    }));
    group.appendChild(svgElement('text', {
      class: 'logic-value-text',
      x,
      y: y + 0.5
    }, String(value)));
    svg.appendChild(group);
  }

  function computeLayout(ast) {
    let leafCursor = 0;
    const positions = new Map();

    function depth(node) {
      if (node.type === 'input') return 0;
      return 1 + Math.max(...node.inputs.map(depth));
    }

    function place(node) {
      if (node.type === 'input') {
        const position = { x: 66, y: 66 + leafCursor * 78, depth: 0 };
        leafCursor += 1;
        positions.set(node.id, position);
        return position;
      }
      const childPositions = node.inputs.map(place);
      const nodeDepth = depth(node);
      const position = {
        x: 90 + nodeDepth * 145,
        y: childPositions.reduce((sum, child) => sum + child.y, 0) / childPositions.length,
        depth: nodeDepth
      };
      positions.set(node.id, position);
      return position;
    }

    const rootPosition = place(ast);
    const maxDepth = depth(ast);
    const height = Math.max(210, 132 + Math.max(1, leafCursor - 1) * 78);
    const outputX = Math.max(430, rootPosition.x + 118);
    const width = outputX + 82;
    return { positions, width, height, outputX, maxDepth };
  }

  function orthogonalWirePath(from, to) {
    if (from.y === to.y) return `M ${from.x} ${from.y} H ${to.x}`;
    const middleX = Number(((from.x + to.x) / 2).toFixed(2));
    return `M ${from.x} ${from.y} H ${middleX} V ${to.y} H ${to.x}`;
  }

  function wireLabelPoint(from, to) {
    if (from.y === to.y) return { x: (from.x + to.x) / 2, y: from.y - 17 };
    const middleX = (from.x + to.x) / 2;
    return { x: (from.x + middleX) / 2, y: from.y - 14 };
  }

  function renderCircuit(target, ast, options = {}) {
    if (!(target instanceof Element)) throw new TypeError('SVGの表示先要素を指定してください。');
    const inputValues = options.inputs || {};
    const showSignals = options.showSignals !== false;
    const titleText = options.title || `論理回路 ${Core.toStructureExpr(ast)}`;
    const descriptionText = options.description || 'AND・OR・NOTの基本ゲートを通り、右端の出力Fへ信号が流れる論理回路図です。';
    const diagramAst = Core.toBasicGateAst(ast);
    const detailed = showSignals ? Core.evaluateDetailed(diagramAst, inputValues) : { value: null, values: {} };
    const layout = computeLayout(diagramAst);
    const svg = svgElement('svg', {
      class: 'logic-svg',
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      style: `--logic-natural-width: ${layout.width}px`,
      role: 'img',
      'aria-labelledby': `logic-title-${Math.random().toString(36).slice(2)}`,
      preserveAspectRatio: 'xMidYMid meet'
    });
    const titleId = svg.getAttribute('aria-labelledby');
    const descriptionId = `${titleId}-description`;
    svg.setAttribute('aria-describedby', descriptionId);
    svg.append(
      svgElement('title', { id: titleId }, titleText),
      svgElement('desc', { id: descriptionId }, descriptionText),
      svgElement('style', {}, INTERNAL_STYLE),
      svgElement('rect', {
        class: 'logic-svg__background',
        x: 0,
        y: 0,
        width: layout.width,
        height: layout.height,
        rx: 12
      })
    );

    const edges = [];
    (function collectEdges(node) {
      if (node.type !== 'gate') return;
      node.inputs.forEach((child, port) => {
        edges.push({ child, parent: node, port });
        collectEdges(child);
      });
    })(diagramAst);

    edges.forEach(({ child, parent, port }) => {
      const childPosition = layout.positions.get(child.id);
      const parentPosition = layout.positions.get(parent.id);
      const childGeometry = child.type === 'gate' ? gateGeometry(child.gate) : null;
      const parentGeometry = gateGeometry(parent.gate);
      const from = {
        x: child.type === 'gate' ? childPosition.x + childGeometry.outputX : childPosition.x + 26,
        y: childPosition.y
      };
      const to = {
        x: parentPosition.x + parentGeometry.inputX,
        y: parentPosition.y + parentGeometry.inputYs[port]
      };
      const value = showSignals ? detailed.values[child.id] : null;
      const path = svgElement('path', {
        class: `logic-wire${value === 1 ? ' is-one' : ''}`,
        d: orthogonalWirePath(from, to),
        'data-value': showSignals ? value : '',
        'aria-label': showSignals ? `信号 ${value}` : '配線'
      });
      svg.appendChild(path);
      svg.appendChild(svgElement('circle', {
        class: `logic-terminal${value === 1 ? ' is-one' : ''}`,
        cx: to.x,
        cy: to.y,
        r: 3.6
      }));
      if (showSignals) {
        const labelPoint = wireLabelPoint(from, to);
        appendValueBadge(svg, labelPoint.x, labelPoint.y, value, '配線の信号');
      }
    });

    const rootPosition = layout.positions.get(diagramAst.id);
    const rootGeometry = diagramAst.type === 'gate' ? gateGeometry(diagramAst.gate) : null;
    const rootOut = {
      x: diagramAst.type === 'gate' ? rootPosition.x + rootGeometry.outputX : rootPosition.x + 26,
      y: rootPosition.y
    };
    const fIn = { x: layout.outputX - 30, y: rootPosition.y };
    const rootValue = showSignals ? detailed.value : null;
    svg.appendChild(svgElement('path', {
      class: `logic-wire${rootValue === 1 ? ' is-one' : ''}`,
      d: orthogonalWirePath(rootOut, fIn),
      'data-value': showSignals ? rootValue : '',
      'aria-label': showSignals ? `出力直前の信号 ${rootValue}` : '出力Fへの配線'
    }));
    if (showSignals) appendValueBadge(svg, (rootOut.x + fIn.x) / 2, rootOut.y - 17, rootValue, '出力信号');

    function drawNode(node) {
      const position = layout.positions.get(node.id);
      if (node.type === 'input') {
        const value = showSignals ? detailed.values[node.id] : null;
        svg.appendChild(svgElement('line', {
          class: `logic-wire${value === 1 ? ' is-one' : ''}`,
          x1: position.x,
          y1: position.y,
          x2: position.x + 26,
          y2: position.y
        }));
        svg.appendChild(svgElement('circle', {
          class: `logic-terminal${value === 1 ? ' is-one' : ''}`,
          cx: position.x,
          cy: position.y,
          r: 5
        }));
        svg.appendChild(svgElement('text', {
          class: 'logic-node-label',
          x: position.x - 16,
          y: position.y + 6,
          'text-anchor': 'end'
        }, node.name));
        if (showSignals) appendValueBadge(svg, position.x + 13, position.y - 17, value, `入力${node.name}`);
        return;
      }
      node.inputs.forEach(drawNode);
      svg.appendChild(createGateSymbol(node.gate, position.x, position.y));
      if (showSignals) {
        appendValueBadge(
          svg,
          position.x + gateGeometry(node.gate).outputX + 9,
          position.y - 18,
          detailed.values[node.id],
          `${node.gate}ゲートの出力`
        );
      }
    }
    drawNode(diagramAst);

    svg.appendChild(svgElement('rect', {
      class: `logic-output-box${rootValue === 1 ? ' is-one' : ''}`,
      x: layout.outputX - 30,
      y: rootPosition.y - 27,
      width: 60,
      height: 54,
      rx: 10
    }));
    svg.appendChild(svgElement('text', {
      class: 'logic-node-label',
      x: layout.outputX,
      y: rootPosition.y - (showSignals ? 5 : -6),
      'text-anchor': 'middle'
    }, 'F'));
    if (showSignals) {
      svg.appendChild(svgElement('text', {
        class: 'logic-node-label',
        x: layout.outputX,
        y: rootPosition.y + 17,
        'text-anchor': 'middle'
      }, String(rootValue)));
    }

    const scrollHint = document.createElement('div');
    scrollHint.className = 'logic-circuit__scroll-hint';
    scrollHint.setAttribute('aria-hidden', 'true');
    scrollHint.textContent = '↔ 回路図は左右に動かせます';
    target.replaceChildren(scrollHint, svg);
    return { svg, output: rootValue, values: detailed.values, layout, diagramAst };
  }

  function renderMessage(target, message) {
    const wrapper = document.createElement('div');
    wrapper.className = 'logic-circuit-message';
    wrapper.setAttribute('role', 'status');
    wrapper.textContent = message;
    target.replaceChildren(wrapper);
    return wrapper;
  }

  function serializeSvg(svg, title) {
    if (!(svg instanceof SVGElement)) throw new TypeError('保存するSVG要素が見つかりません。');
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('width', clone.viewBox.baseVal.width || 900);
    clone.setAttribute('height', clone.viewBox.baseVal.height || 520);
    if (title) clone.querySelector('title').textContent = title;
    return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\\n${new XMLSerializer().serializeToString(clone)}`;
  }

  function downloadSvg(svg, structureExpr) {
    const source = serializeSvg(svg, `論理回路 ${structureExpr}`);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = Core.createSvgFilename(structureExpr);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return anchor.download;
  }

  root.LogicRenderer = Object.freeze({
    SVG_NS,
    svgElement,
    gateGeometry,
    createGateSymbol,
    orthogonalWirePath,
    wireLabelPoint,
    renderCircuit,
    renderMessage,
    serializeSvg,
    downloadSvg
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
