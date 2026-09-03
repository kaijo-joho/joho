// lc02/lc03で共有する、クリック・ドラッグ接続式の組合せ回路エディタ。
(function (root) {
  'use strict';

  const Core = root.LogicCore;
  const Renderer = root.LogicRenderer;
  if (!Core || !Renderer) throw new Error('logic-editor.jsの依存ファイルが読み込まれていません。');

  const WIDTH = 900;
  const HEIGHT = 520;
  const GATES = Core.BASIC_GATES;

  function htmlElement(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeButton(label, className, onClick) {
    const button = htmlElement('button', className, label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function createHistoryIcon(direction) {
    const svg = Renderer.svgElement('svg', {
      class: 'logic-editor__history-icon',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    svg.appendChild(Renderer.svgElement('path', {
      class: 'logic-editor__history-icon-path',
      d: 'M 9 6.5 L 4.5 11 L 9 15.5 M 5 11 H 13 C 16.6 11 19 13.2 19 16.5 V 18',
      transform: direction === 'redo' ? 'translate(24 0) scale(-1 1)' : null
    }));
    return svg;
  }

  function makeHistoryButton(direction, onClick) {
    const label = direction === 'undo' ? '元に戻す' : 'やり直す';
    const button = makeButton('', 'logic-editor__action-button logic-editor__history-button', onClick);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.appendChild(createHistoryIcon(direction));
    return button;
  }

  function createSaveIcon() {
    const svg = Renderer.svgElement('svg', {
      class: 'logic-editor__save-icon',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    svg.append(
      Renderer.svgElement('path', {
        class: 'logic-editor__save-icon-path',
        d: 'M 12 3 V 15 M 7.5 10.5 L 12 15 L 16.5 10.5'
      }),
      Renderer.svgElement('path', {
        class: 'logic-editor__save-icon-path',
        d: 'M 5 18 H 19'
      })
    );
    return svg;
  }

  function makeSaveButton(onClick) {
    const button = makeButton('', 'logic-editor__action-button logic-editor__save-button', onClick);
    button.append(
      createSaveIcon(),
      htmlElement('span', 'logic-editor__save-button-label', 'SVG保存')
    );
    return button;
  }

  function createGateButtonIcon(type) {
    const gate = String(type).toUpperCase();
    const geometry = Renderer.gateGeometry(gate);
    const center = { x: 55, y: 32 };
    const svg = Renderer.svgElement('svg', {
      class: 'logic-editor__gate-icon',
      viewBox: '0 0 110 64',
      'aria-hidden': 'true',
      focusable: 'false',
      preserveAspectRatio: 'xMidYMid meet'
    });
    geometry.inputYs.forEach(offsetY => {
      svg.appendChild(Renderer.svgElement('line', {
        class: 'logic-editor__gate-icon-wire',
        x1: 5,
        y1: center.y + offsetY,
        x2: center.x + geometry.inputX,
        y2: center.y + offsetY
      }));
    });
    svg.appendChild(Renderer.svgElement('line', {
      class: 'logic-editor__gate-icon-wire',
      x1: center.x + geometry.outputX,
      y1: center.y,
      x2: 105,
      y2: center.y
    }));
    const symbol = Renderer.createGateSymbol(gate, center.x, center.y);
    symbol.querySelector('title')?.remove();
    symbol.setAttribute('aria-hidden', 'true');
    svg.appendChild(symbol);
    return svg;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function routePoint(x, y) {
    return {
      x: Number(Number(x).toFixed(1)),
      y: Number(Number(y).toFixed(1))
    };
  }

  function compactRoutePoints(points) {
    const compact = [];
    points.forEach(point => {
      const next = routePoint(point.x, point.y);
      const previous = compact[compact.length - 1];
      if (previous && previous.x === next.x && previous.y === next.y) return;
      compact.push(next);
      while (compact.length >= 3) {
        const first = compact[compact.length - 3];
        const middle = compact[compact.length - 2];
        const last = compact[compact.length - 1];
        const sameHorizontal = first.y === middle.y && middle.y === last.y;
        const sameVertical = first.x === middle.x && middle.x === last.x;
        if (!sameHorizontal && !sameVertical) break;
        compact.splice(compact.length - 2, 1);
      }
    });
    return compact;
  }

  function routeSegments(points) {
    const compact = compactRoutePoints(points);
    const segments = [];
    for (let index = 1; index < compact.length; index += 1) {
      const from = compact[index - 1];
      const to = compact[index];
      if (from.x !== to.x && from.y !== to.y) continue;
      segments.push({
        from,
        to,
        axis: from.y === to.y ? 'h' : 'v',
        fixed: from.y === to.y ? from.y : from.x,
        start: from.y === to.y ? Math.min(from.x, to.x) : Math.min(from.y, to.y),
        end: from.y === to.y ? Math.max(from.x, to.x) : Math.max(from.y, to.y)
      });
    }
    return segments;
  }

  function segmentsToPath(segments) {
    return segments.map(segment => {
      const command = segment.axis === 'h' ? `H ${segment.to.x}` : `V ${segment.to.y}`;
      return `M ${segment.from.x} ${segment.from.y} ${command}`;
    }).join(' ');
  }

  function segmentLength(segment) {
    return segment.end - segment.start;
  }

  function routeCollisionPenalty(segments, occupied) {
    let penalty = 0;
    segments.forEach(segment => {
      occupied.forEach(existing => {
        if (segment.axis === existing.axis) {
          if (Math.abs(segment.fixed - existing.fixed) > 0.5) return;
          const overlap = Math.min(segment.end, existing.end) - Math.max(segment.start, existing.start);
          if (overlap > 1) penalty += 1000 + overlap * 20;
          return;
        }
        const horizontal = segment.axis === 'h' ? segment : existing;
        const vertical = segment.axis === 'v' ? segment : existing;
        const crossesHorizontal = vertical.fixed > horizontal.start + 2 && vertical.fixed < horizontal.end - 2;
        const crossesVertical = horizontal.fixed > vertical.start + 2 && horizontal.fixed < vertical.end - 2;
        if (crossesHorizontal && crossesVertical) penalty += 3;
      });
    });
    return penalty;
  }

  function routeObstaclePenalty(segments, obstacles) {
    let penalty = 0;
    segments.forEach(segment => {
      obstacles.forEach(rectangle => {
        if (segment.axis === 'h') {
          const insideY = segment.fixed > rectangle.top && segment.fixed < rectangle.bottom;
          const overlap = Math.min(segment.end, rectangle.right) - Math.max(segment.start, rectangle.left);
          if (insideY && overlap > 1) penalty += 1 + overlap;
          return;
        }
        const insideX = segment.fixed > rectangle.left && segment.fixed < rectangle.right;
        const overlap = Math.min(segment.end, rectangle.bottom) - Math.max(segment.start, rectangle.top);
        if (insideX && overlap > 1) penalty += 1 + overlap;
      });
    });
    return penalty;
  }

  function routeScore(segments, occupied, obstacles = []) {
    const length = segments.reduce((sum, segment) => sum + segmentLength(segment), 0);
    return routeObstaclePenalty(segments, obstacles) * 1000000
      + routeCollisionPenalty(segments, occupied) * 1000
      + length
      + Math.max(0, segments.length - 1) * 8;
  }

  function routeAnchor(segments, offset = 22) {
    if (!segments.length) return { x: WIDTH / 2, y: HEIGHT / 2 };
    const horizontal = segments
      .filter(segment => segment.axis === 'h')
      .sort((left, right) => segmentLength(right) - segmentLength(left))[0];
    const selected = horizontal || [...segments].sort((left, right) => segmentLength(right) - segmentLength(left))[0];
    if (selected.axis === 'h') {
      return routePoint((selected.start + selected.end) / 2, clamp(selected.fixed - offset, 22, HEIGHT - 22));
    }
    return routePoint(clamp(selected.fixed + offset, 22, WIDTH - 22), (selected.start + selected.end) / 2);
  }

  class LogicEditor {
    constructor(container, options = {}) {
      if (!(container instanceof Element)) throw new TypeError('回路エディタの表示先が必要です。');
      this.container = container;
      this.options = options;
      this.inputNames = Array.from(options.inputNames || ['A', 'B', 'C', 'D']);
      this.graph = { nodes: [], wires: [] };
      this.inputValues = Object.fromEntries(this.inputNames.map(name => [name, 0]));
      this.nodeSerial = 0;
      this.wireSerial = 0;
      this.pendingFrom = null;
      this.selected = null;
      this.drag = null;
      this.connectionDrag = null;
      this.currentWireRoutes = new Map();
      this.valueBadgePositions = [];
      this.notice = '';
      this.history = [];
      this.historyIndex = -1;
      this.destroyed = false;
      this.buildShell();
      this.resetBaseGraph();
      if (options.initialExpression) this.loadExpression(options.initialExpression, { resetHistory: false });
      this.resetHistory();
      this.boundPointerMove = event => this.handlePointerMove(event);
      this.boundPointerUp = event => this.handlePointerUp(event);
      this.boundKeyDown = event => this.handleDocumentKeyDown(event);
      document.addEventListener('pointermove', this.boundPointerMove);
      document.addEventListener('pointerup', this.boundPointerUp);
      document.addEventListener('keydown', this.boundKeyDown);
      this.render();
    }

    buildShell() {
      this.container.classList.add('logic-editor-host');
      this.editor = htmlElement('div', 'logic-editor');
      const toolbar = htmlElement('div', 'logic-editor__toolbar');
      const palette = htmlElement('div', 'logic-editor__palette');
      palette.setAttribute('role', 'group');
      palette.setAttribute('aria-label', '追加するゲート');
      GATES.forEach(gate => {
        const button = makeButton('', 'logic-editor__gate-button', () => this.addGate(gate));
        button.dataset.gate = gate;
        button.setAttribute('aria-label', `${gate}ゲートを追加`);
        button.append(
          htmlElement('span', 'logic-editor__gate-plus', '＋'),
          createGateButtonIcon(gate),
          htmlElement('span', 'logic-editor__gate-button-label', gate)
        );
        palette.appendChild(button);
      });

      const actions = htmlElement('div', 'logic-editor__actions');
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', '回路の編集操作');
      this.undoButton = makeHistoryButton('undo', () => this.undo());
      this.redoButton = makeHistoryButton('redo', () => this.redo());
      this.saveButton = this.options.enableSvgSave ? makeSaveButton(() => this.saveSvg()) : null;
      this.deleteButton = makeButton('選択を削除', 'logic-editor__action-button logic-editor__delete-button', () => this.deleteSelected());
      this.clearButton = makeButton('全消去', 'logic-editor__action-button logic-editor__action-button--danger', () => this.clear());
      if (this.saveButton) actions.classList.add('logic-editor__actions--with-save');
      actions.append(this.undoButton, this.redoButton);
      if (this.saveButton) actions.appendChild(this.saveButton);
      actions.append(this.deleteButton, this.clearButton);
      toolbar.append(palette, actions);

      const guide = htmlElement(
        'p',
        'logic-editor__guide',
        '① ＋付きのゲートを選ぶ　② 端子（●）を順に選ぶか、端子間をドラッグする。接続済みの入力端子をドラッグすると配線を付け替えられます。'
      );
      const scrollHint = htmlElement(
        'p',
        'logic-editor__scroll-hint',
        'キャンバスの空いている場所をスワイプすると、左右に移動できます。'
      );
      this.status = htmlElement('div', 'logic-editor__status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.canvasWrap = htmlElement('div', 'logic-editor__canvas-wrap');
      this.canvasWrap.tabIndex = 0;
      this.canvasWrap.setAttribute('aria-label', '横にスクロールできる論理回路編集エリア');
      this.svg = Renderer.svgElement('svg', {
        class: 'logic-editor__canvas',
        viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
        role: 'application',
        'aria-label': '論理回路編集キャンバス。ゲートを移動し、小さな黒い端子を順番に選ぶか、端子間をドラッグして接続・付け替えします。',
        preserveAspectRatio: 'xMidYMid meet'
      });
      this.canvasWrap.appendChild(this.svg);
      this.editor.append(toolbar, scrollHint, this.canvasWrap, this.status);
      this.container.replaceChildren(guide, this.editor);
    }

    resetBaseGraph() {
      const count = this.inputNames.length;
      const gap = Math.min(98, 360 / Math.max(1, count - 1));
      const firstY = count === 1 ? HEIGHT / 2 : HEIGHT / 2 - gap * (count - 1) / 2;
      this.graph = {
        nodes: [
          ...this.inputNames.map((name, index) => ({
            id: `input-${name}`,
            type: 'input',
            name,
            x: 72,
            y: firstY + index * gap
          })),
          { id: 'output-F', type: 'output', name: 'F', x: 828, y: HEIGHT / 2 }
        ],
        wires: []
      };
      this.nodeSerial = 0;
      this.wireSerial = 0;
      this.pendingFrom = null;
      this.selected = null;
      this.connectionDrag = null;
      this.currentWireRoutes = new Map();
    }

    resetHistory() {
      this.history = [this.snapshot()];
      this.historyIndex = 0;
      this.updateToolbar();
    }

    snapshot() {
      return deepCopy({ graph: this.graph, inputValues: this.inputValues });
    }

    restore(snapshot) {
      this.graph = deepCopy(snapshot.graph);
      this.inputValues = deepCopy(snapshot.inputValues);
      this.pendingFrom = null;
      this.selected = null;
      this.connectionDrag = null;
      this.render();
    }

    commit(message) {
      this.history.splice(this.historyIndex + 1);
      this.history.push(this.snapshot());
      if (this.history.length > 80) this.history.shift();
      this.historyIndex = this.history.length - 1;
      this.notice = message || '';
      this.render();
    }

    undo() {
      if (this.historyIndex <= 0) return;
      this.historyIndex -= 1;
      this.notice = '1つ前の状態に戻しました。';
      this.restore(this.history[this.historyIndex]);
    }

    redo() {
      if (this.historyIndex >= this.history.length - 1) return;
      this.historyIndex += 1;
      this.notice = '操作をやり直しました。';
      this.restore(this.history[this.historyIndex]);
    }

    clear() {
      this.resetBaseGraph();
      this.commit('ゲートと配線をすべて消去しました。Undoで戻せます。');
    }

    addGate(type) {
      const gate = String(type).toUpperCase();
      if (!GATES.includes(gate)) return;
      this.pendingFrom = null;
      this.connectionDrag = null;
      this.nodeSerial += 1;
      const lane = (this.nodeSerial - 1) % 5;
      const column = Math.floor((this.nodeSerial - 1) / 5) % 3;
      const node = {
        id: `gate-${Date.now().toString(36)}-${this.nodeSerial}`,
        type: gate,
        x: 285 + column * 145,
        y: 82 + lane * 86
      };
      this.graph.nodes.push(node);
      this.selected = { kind: 'node', id: node.id };
      this.commit(`${gate}ゲートを追加しました。ドラッグで位置を調整できます。`);
    }

    findNode(id) {
      return this.graph.nodes.find(node => node.id === id);
    }

    incomingWire(nodeId, port) {
      return this.graph.wires.find(wire => {
        return wire.to === nodeId && Number(wire.port) === Number(port);
      }) || null;
    }

    rewireConnection(wireId, fromId, toId, port) {
      const wire = this.graph.wires.find(candidate => candidate.id === wireId);
      const from = this.findNode(fromId);
      const to = this.findNode(toId);
      const targetPort = Number(port);
      this.pendingFrom = null;
      this.selected = null;
      if (!wire || !from || !to || from.type === 'output' || to.type === 'input') {
        this.notice = 'その端子へ配線を付け替えることはできません。';
        this.render();
        return;
      }
      if (wire.from === from.id && wire.to === to.id && Number(wire.port) === targetPort) {
        this.notice = '配線の接続は変更されませんでした。';
        this.render();
        return;
      }
      const otherWires = this.graph.wires.filter(candidate => candidate.id !== wire.id);
      if (otherWires.some(candidate => candidate.to === to.id && Number(candidate.port) === targetPort)) {
        this.notice = 'この入力端子には、すでに別の配線があります。';
        this.render();
        return;
      }
      const graphWithoutWire = { nodes: this.graph.nodes, wires: otherWires };
      if (Core.wouldCreateCycle(graphWithoutWire, from.id, to.id)) {
        this.notice = '循環する接続には付け替えられません。';
        this.render();
        return;
      }
      wire.from = from.id;
      wire.to = to.id;
      wire.port = targetPort;
      const fromLabel = from.name || from.type;
      const toLabel = to.type === 'output' ? 'F' : `${to.type}の入力${targetPort + 1}`;
      this.commit(`配線を${fromLabel}から${toLabel}へ付け替えました。`);
    }

    inputCount(node) {
      if (!node) return 0;
      if (node.type === 'output') return 1;
      return Core.REQUIRED_INPUTS[node.type] || 0;
    }

    outputPoint(node) {
      if (node.type === 'input') return { x: node.x + 38, y: node.y };
      const geometry = Renderer.gateGeometry(node.type);
      return { x: node.x + geometry.outputX, y: node.y };
    }

    inputPoint(node, port) {
      if (node.type === 'output') return { x: node.x - 35, y: node.y };
      const geometry = Renderer.gateGeometry(node.type);
      return { x: node.x + geometry.inputX, y: node.y + geometry.inputYs[port] };
    }

    connectionPath(from, to) {
      return Renderer.orthogonalWirePath(from, to);
    }

    routingObstacles(excludedIds = new Set()) {
      return this.graph.nodes
        .filter(node => !excludedIds.has(node.id))
        .map(node => {
          const halfWidth = node.type === 'input' || node.type === 'output' ? 42 : 46;
          const halfHeight = node.type === 'input' || node.type === 'output' ? 36 : 45;
          return {
            id: node.id,
            left: node.x - halfWidth,
            right: node.x + halfWidth,
            top: node.y - halfHeight,
            bottom: node.y + halfHeight
          };
        });
    }

    routingLaneCandidates(from, targets, direction) {
      const targetXs = targets.map(target => target.x);
      const nearestX = direction > 0 ? Math.min(...targetXs) : Math.max(...targetXs);
      const paddedStart = from.x + direction * 30;
      const paddedEnd = nearestX - direction * 30;
      const lower = Math.min(paddedStart, paddedEnd);
      const upper = Math.max(paddedStart, paddedEnd);
      const midpoint = (from.x + nearestX) / 2;
      const preferred = from.x + (nearestX - from.x) * 0.46;
      const raw = [preferred, midpoint];
      [18, -18, 36, -36, 54, -54, 72, -72].forEach(offset => raw.push(preferred + offset));
      for (let part = 1; part <= 5; part += 1) raw.push(lower + (upper - lower) * part / 6);
      const safeLower = upper - lower < 12 ? Math.min(from.x, nearestX) + 8 : lower;
      const safeUpper = upper - lower < 12 ? Math.max(from.x, nearestX) - 8 : upper;
      return Array.from(new Set(raw.map(value => {
        const bounded = safeUpper >= safeLower ? clamp(value, safeLower, safeUpper) : midpoint;
        return Number(bounded.toFixed(1));
      })));
    }

    chooseSingleWireRoute(entry, occupied, obstacles = []) {
      const { from, to } = entry;
      const direction = to.x >= from.x ? 1 : -1;
      const candidates = [];
      if (from.y === to.y) candidates.push(routeSegments([from, to]));
      this.routingLaneCandidates(from, [to], direction).forEach(laneX => {
        candidates.push(routeSegments([
          from,
          { x: laneX, y: from.y },
          { x: laneX, y: to.y },
          to
        ]));
      });

      const escapeX = clamp(from.x + direction * 28, 20, WIDTH - 20);
      const approachX = clamp(to.x - direction * 28, 20, WIDTH - 20);
      const middleY = (from.y + to.y) / 2;
      const detourYs = [
        middleY,
        middleY - 24,
        middleY + 24,
        Math.min(from.y, to.y) - 28,
        Math.max(from.y, to.y) + 28
      ];
      detourYs.forEach(value => {
        const laneY = clamp(value, 22, HEIGHT - 22);
        candidates.push(routeSegments([
          from,
          { x: escapeX, y: from.y },
          { x: escapeX, y: laneY },
          { x: approachX, y: laneY },
          { x: approachX, y: to.y },
          to
        ]));
      });

      const usable = candidates.filter(segments => segments.length);
      const chosen = usable.sort((left, right) => {
        return routeScore(left, occupied, obstacles) - routeScore(right, occupied, obstacles);
      })[0] || [];
      return {
        path: segmentsToPath(chosen),
        segments: chosen,
        labelPoint: routeAnchor(chosen, 16),
        deletePoint: routeAnchor(chosen, 25),
        score: routeScore(chosen, occupied, obstacles)
      };
    }

    chooseWireBundle(entries, occupied, direction) {
      const from = entries[0].from;
      const yCounts = new Map();
      entries.forEach(entry => yCounts.set(entry.to.y, (yCounts.get(entry.to.y) || 0) + 1));
      const yIndexes = new Map();
      const branchYByWire = new Map();
      entries.forEach(entry => {
        const count = yCounts.get(entry.to.y);
        const index = yIndexes.get(entry.to.y) || 0;
        yIndexes.set(entry.to.y, index + 1);
        const offset = count > 1 ? (index - (count - 1) / 2) * 18 : 0;
        branchYByWire.set(entry.wire.id, clamp(entry.to.y + offset, 24, HEIGHT - 24));
      });

      const commonObstacles = this.routingObstacles(new Set([entries[0].wire.from]));
      const candidates = this.routingLaneCandidates(from, entries.map(entry => entry.to), direction).map(laneX => {
        const branchYs = entries.map(entry => branchYByWire.get(entry.wire.id));
        const minimumY = Math.min(from.y, ...branchYs);
        const maximumY = Math.max(from.y, ...branchYs);
        const trunk = routeSegments([from, { x: laneX, y: from.y }]);
        const bus = routeSegments([{ x: laneX, y: minimumY }, { x: laneX, y: maximumY }]);
        const common = [...trunk, ...bus];
        const branches = new Map();
        const branchOccupied = [...occupied, ...common];
        let score = routeScore(common, occupied, commonObstacles);
        entries.forEach(entry => {
          const branchY = branchYByWire.get(entry.wire.id);
          const branchEntry = {
            ...entry,
            from: { x: laneX, y: branchY }
          };
          const branchObstacles = this.routingObstacles(new Set([entry.wire.from, entry.wire.to]));
          const branch = this.chooseSingleWireRoute(branchEntry, branchOccupied, branchObstacles);
          branches.set(entry.wire.id, branch.segments);
          branchOccupied.push(...branch.segments);
          score += branch.score;
        });
        const allSegments = [...common, ...Array.from(branches.values()).flat()];
        return { laneX, common, branches, allSegments, score };
      });
      const chosen = candidates.sort((left, right) => left.score - right.score)[0];
      if (!chosen) return null;

      const branchCounts = new Map();
      entries.forEach(entry => {
        const y = branchYByWire.get(entry.wire.id);
        branchCounts.set(y, (branchCounts.get(y) || 0) + 1);
      });
      const branchYs = Array.from(branchCounts.keys());
      const minimumY = Math.min(from.y, ...branchYs);
      const maximumY = Math.max(from.y, ...branchYs);
      const junctions = Array.from(new Set([from.y, ...branchYs]))
        .filter(y => {
          const directionCount = Number(y > minimumY)
            + Number(y < maximumY)
            + Number(y === from.y)
            + (branchCounts.get(y) || 0);
          return directionCount >= 3;
        })
        .map(y => routePoint(chosen.laneX, y));
      const trunkSegments = chosen.common.filter(segment => segment.axis === 'h');
      return {
        bundle: {
          sourceId: entries[0].wire.from,
          path: segmentsToPath(chosen.common),
          segments: chosen.common,
          junctions,
          labelPoint: routeAnchor(trunkSegments.length ? trunkSegments : chosen.common, 16)
        },
        routes: entries.map(entry => {
          const segments = chosen.branches.get(entry.wire.id) || [];
          return {
            wire: entry.wire,
            path: segmentsToPath(segments),
            segments,
            deletePoint: routeAnchor(segments, 25)
          };
        }),
        occupied: chosen.allSegments
      };
    }

    computeWireRouting(excludedWireId = null) {
      const groups = new Map();
      this.graph.wires.forEach(wire => {
        if (wire.id === excludedWireId) return;
        const fromNode = this.findNode(wire.from);
        const toNode = this.findNode(wire.to);
        if (!fromNode || !toNode) return;
        const entry = {
          wire,
          fromNode,
          toNode,
          from: this.outputPoint(fromNode),
          to: this.inputPoint(toNode, Number(wire.port))
        };
        if (!groups.has(wire.from)) groups.set(wire.from, []);
        groups.get(wire.from).push(entry);
      });

      const occupied = [];
      const routes = new Map();
      const bundles = [];
      const badgeSources = new Set();
      groups.forEach(entries => {
        const directions = new Map();
        entries.forEach(entry => {
          const direction = entry.to.x >= entry.from.x ? 1 : -1;
          if (!directions.has(direction)) directions.set(direction, []);
          directions.get(direction).push(entry);
        });
        directions.forEach((directionEntries, direction) => {
          const sourceId = directionEntries[0].wire.from;
          const showValue = !badgeSources.has(sourceId);
          badgeSources.add(sourceId);
          if (directionEntries.length > 1) {
            const result = this.chooseWireBundle(directionEntries, occupied, Number(direction));
            if (!result) return;
            result.bundle.showValue = showValue;
            bundles.push(result.bundle);
            result.routes.forEach(route => routes.set(route.wire.id, route));
            occupied.push(...result.occupied);
            return;
          }
          const entry = directionEntries[0];
          const obstacles = this.routingObstacles(new Set([entry.wire.from, entry.wire.to]));
          const route = this.chooseSingleWireRoute(entry, occupied, obstacles);
          route.showValue = showValue;
          routes.set(directionEntries[0].wire.id, route);
          occupied.push(...route.segments);
        });
      });
      return { bundles, routes };
    }

    startConnection(nodeId) {
      const node = this.findNode(nodeId);
      if (!node || node.type === 'output') return;
      this.connectionDrag = null;
      if (this.pendingFrom === nodeId) {
        this.pendingFrom = null;
        this.notice = '接続をキャンセルしました。';
      } else {
        this.pendingFrom = nodeId;
        this.selected = { kind: 'node', id: nodeId };
        this.notice = '接続先の黒い入力端子を選んでください。Escでキャンセルできます。';
      }
      this.render();
    }

    finishConnection(nodeId, port) {
      this.connectionDrag = null;
      if (!this.pendingFrom) {
        this.notice = '先に、接続元の出力端子を選んでください。';
        this.render();
        return;
      }
      const from = this.findNode(this.pendingFrom);
      const to = this.findNode(nodeId);
      if (!from || !to || to.type === 'input' || from.type === 'output') {
        this.notice = 'その向きには接続できません。';
        this.render();
        return;
      }
      if (this.graph.wires.some(wire => wire.to === nodeId && Number(wire.port) === Number(port))) {
        this.notice = 'この入力端子には、すでに配線があります。';
        this.render();
        return;
      }
      if (Core.wouldCreateCycle(this.graph, from.id, to.id)) {
        this.notice = '循環する接続は作成できません。';
        this.render();
        return;
      }
      this.wireSerial += 1;
      this.graph.wires.push({
        id: `wire-${Date.now().toString(36)}-${this.wireSerial}`,
        from: from.id,
        to: to.id,
        port: Number(port)
      });
      this.pendingFrom = null;
      this.selected = null;
      this.commit(`${from.name || from.type}から${to.name || to.type}へ接続しました。`);
    }

    selectWire(id) {
      this.pendingFrom = null;
      this.connectionDrag = null;
      this.selected = { kind: 'wire', id };
      this.notice = '配線を選択しました。「選択を削除」またはDeleteキーで消せます。';
      this.render();
    }

    deleteSelected() {
      if (!this.selected) {
        this.notice = '削除するゲートまたは配線を選択してください。';
        this.render();
        return;
      }
      if (this.selected.kind === 'wire') {
        const before = this.graph.wires.length;
        this.graph.wires = this.graph.wires.filter(wire => wire.id !== this.selected.id);
        this.selected = null;
        if (this.graph.wires.length !== before) this.commit('配線を削除しました。Undoで戻せます。');
        return;
      }
      const node = this.findNode(this.selected.id);
      if (!node) return;
      if (node.type === 'input' || node.type === 'output') {
        this.notice = '入力端子と出力Fは固定部品のため削除できません。';
        this.render();
        return;
      }
      this.graph.nodes = this.graph.nodes.filter(candidate => candidate.id !== node.id);
      this.graph.wires = this.graph.wires.filter(wire => wire.from !== node.id && wire.to !== node.id);
      this.selected = null;
      this.commit(`${node.type}ゲートと接続配線を削除しました。Undoで戻せます。`);
    }

    toggleInput(nodeId) {
      const node = this.findNode(nodeId);
      if (!node || node.type !== 'input') return;
      this.inputValues[node.name] = this.inputValues[node.name] ? 0 : 1;
      this.commit(`入力${node.name}を${this.inputValues[node.name]}にしました。`);
    }

    evaluateSignals() {
      const incoming = new Map();
      this.graph.wires.forEach(wire => incoming.set(`${wire.to}:${wire.port}`, wire));
      const cache = new Map();
      const visiting = new Set();
      const evaluateNode = node => {
        if (!node) return null;
        if (cache.has(node.id)) return cache.get(node.id);
        if (visiting.has(node.id)) return null;
        if (node.type === 'input') {
          const value = Number(this.inputValues[node.name]) || 0;
          cache.set(node.id, value);
          return value;
        }
        visiting.add(node.id);
        const operands = [];
        for (let port = 0; port < this.inputCount(node); port += 1) {
          const wire = incoming.get(`${node.id}:${port}`);
          const source = wire ? this.findNode(wire.from) : null;
          operands.push(source ? evaluateNode(source) : null);
        }
        visiting.delete(node.id);
        if (operands.some(value => value == null)) {
          cache.set(node.id, null);
          return null;
        }
        let value;
        if (node.type === 'output') value = operands[0];
        else if (node.type === 'NOT') value = operands[0] ? 0 : 1;
        else if (node.type === 'AND') value = operands[0] && operands[1] ? 1 : 0;
        else if (node.type === 'OR') value = operands[0] || operands[1] ? 1 : 0;
        else value = null;
        cache.set(node.id, value);
        return value;
      };
      this.graph.nodes.forEach(evaluateNode);
      return cache;
    }

    makePort(node, kind, port) {
      const point = kind === 'output' ? this.outputPoint(node) : this.inputPoint(node, port);
      const connectedWire = kind === 'input' ? this.incomingWire(node.id, port) : null;
      const selected = kind === 'output' && this.pendingFrom === node.id;
      const dragging = this.connectionDrag?.nodeId === node.id
        && this.connectionDrag?.kind === kind
        && Number(this.connectionDrag?.port) === Number(port);
      const marker = Renderer.svgElement('g', {
        class: `logic-editor-port logic-editor-port--${kind}${connectedWire ? ' is-connected' : ''}${selected ? ' is-pending' : ''}${dragging ? ' is-dragging' : ''}`,
        tabindex: 0,
        role: 'button',
        'data-node-id': node.id,
        'data-kind': kind,
        'data-port': Number(port),
        'data-wire-id': connectedWire?.id || null,
        'aria-label': kind === 'output'
          ? `${node.name || node.type}の出力端子。選ぶか、入力端子までドラッグして接続`
          : connectedWire
            ? `${node.name || node.type}の入力${Number(port) + 1}端子、接続済み。クリックで配線を選択、別の端子へドラッグして付け替え`
            : `${node.name || node.type}の入力${Number(port) + 1}端子。選ぶか、出力端子からここまでドラッグして接続`
      });
      marker.append(
        Renderer.svgElement('circle', {
          class: 'logic-editor-port__hit',
          cx: point.x,
          cy: point.y,
          r: 14
        }),
        Renderer.svgElement('circle', {
          class: 'logic-editor-port__dot',
          cx: point.x,
          cy: point.y,
          r: selected ? 5.5 : 4.5
        })
      );
      const activate = event => {
        event.preventDefault();
        event.stopPropagation();
        if (kind === 'output') this.startConnection(node.id);
        else if (connectedWire && !this.pendingFrom) this.selectWire(connectedWire.id);
        else this.finishConnection(node.id, Number(port));
      };
      marker.addEventListener('pointerdown', event => this.beginPortGesture(event, node, kind, Number(port)));
      marker.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      });
      return marker;
    }

    beginPortGesture(event, node, kind, port) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const start = this.toSvgPoint(event.clientX, event.clientY);
      const previousPendingFrom = this.pendingFrom;
      const connectedWire = kind === 'input' && !previousPendingFrom
        ? this.incomingWire(node.id, port)
        : null;
      this.connectionDrag = {
        pointerId: event.pointerId,
        nodeId: node.id,
        kind,
        port: Number(port),
        start,
        current: start,
        moved: false,
        previousPendingFrom,
        wasPendingSame: kind === 'output' && previousPendingFrom === node.id,
        rewireWireId: connectedWire?.id || null,
        hoverKind: kind
      };
      if (connectedWire) {
        this.pendingFrom = null;
        this.selected = null;
        this.notice = '配線の末端を、付け替え先の入力端子または出力端子までドラッグしてください。';
      } else if (kind === 'output') {
        this.pendingFrom = node.id;
        this.selected = { kind: 'node', id: node.id };
        this.notice = '入力端子までドラッグするか、接続先の端子を選んでください。';
      } else {
        this.notice = previousPendingFrom
          ? 'この入力端子で離すと接続します。'
          : '出力端子までドラッグすると接続できます。';
      }
      this.render({ notify: false });
    }

    drawConnectionPreview() {
      const gesture = this.connectionDrag;
      if (!gesture?.moved) return;
      const node = this.findNode(gesture.nodeId);
      if (!node) return;
      let from;
      let to;
      const rewireWire = gesture.rewireWireId
        ? this.graph.wires.find(wire => wire.id === gesture.rewireWireId)
        : null;
      if (rewireWire) {
        const sourceNode = this.findNode(rewireWire.from);
        const destinationNode = this.findNode(rewireWire.to);
        if (!sourceNode || !destinationNode) return;
        if (gesture.hoverKind === 'output') {
          from = gesture.current;
          to = this.inputPoint(destinationNode, Number(rewireWire.port));
        } else {
          from = this.outputPoint(sourceNode);
          to = gesture.current;
        }
      } else {
        const fixed = gesture.kind === 'output'
          ? this.outputPoint(node)
          : this.inputPoint(node, Number(gesture.port));
        from = gesture.kind === 'output' ? fixed : gesture.current;
        to = gesture.kind === 'output' ? gesture.current : fixed;
      }
      this.svg.append(
        Renderer.svgElement('path', {
          class: 'logic-editor-wire-preview',
          d: this.connectionPath(from, to),
          'aria-hidden': 'true'
        }),
        Renderer.svgElement('circle', {
          class: 'logic-editor-wire-preview__end',
          cx: gesture.current.x,
          cy: gesture.current.y,
          r: 5,
          'aria-hidden': 'true'
        })
      );
    }

    drawDeleteControl() {
      if (!this.selected) return;
      let point;
      let label;
      if (this.selected.kind === 'node') {
        const node = this.findNode(this.selected.id);
        if (!node || node.type === 'input' || node.type === 'output') return;
        point = { x: node.x + 43, y: node.y - 38 };
        label = `${node.type}ゲートを削除`;
      } else if (this.selected.kind === 'wire') {
        const wire = this.graph.wires.find(candidate => candidate.id === this.selected.id);
        const fromNode = wire ? this.findNode(wire.from) : null;
        const toNode = wire ? this.findNode(wire.to) : null;
        if (!wire || !fromNode || !toNode) return;
        point = this.currentWireRoutes.get(wire.id)?.deletePoint;
        if (!point) {
          const from = this.outputPoint(fromNode);
          const to = this.inputPoint(toNode, Number(wire.port));
          point = routePoint((from.x + to.x) / 2, (from.y + to.y) / 2 - 25);
        }
        label = '選択した配線を削除';
      } else {
        return;
      }
      point.x = Math.max(24, Math.min(WIDTH - 24, point.x));
      point.y = Math.max(24, Math.min(HEIGHT - 24, point.y));
      const control = Renderer.svgElement('g', {
        class: 'logic-editor-delete-control',
        transform: `translate(${point.x} ${point.y})`,
        tabindex: 0,
        role: 'button',
        'aria-label': label
      });
      control.append(
        Renderer.svgElement('circle', { class: 'logic-editor-delete-control__hit', cx: 0, cy: 0, r: 28 }),
        Renderer.svgElement('circle', { class: 'logic-editor-delete-control__button', cx: 0, cy: 0, r: 13 }),
        Renderer.svgElement('text', {
          class: 'logic-editor-delete-control__mark',
          x: 0,
          y: 1,
          'text-anchor': 'middle'
        }, '×')
      );
      const remove = event => {
        event.preventDefault();
        event.stopPropagation();
        this.deleteSelected();
      };
      control.addEventListener('pointerdown', remove);
      control.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') remove(event);
      });
      this.svg.appendChild(control);
    }

    startDrag(event, node) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.selected = { kind: 'node', id: node.id };
      this.pendingFrom = null;
      this.connectionDrag = null;
      this.drag = {
        nodeId: node.id,
        pointerId: event.pointerId,
        start: this.toSvgPoint(event.clientX, event.clientY),
        originalX: node.x,
        originalY: node.y,
        moved: false,
        inputClick: node.type === 'input'
      };
      this.notice = node.type === 'input'
        ? `入力${node.name}をクリックすると0/1、ドラッグすると移動します。`
        : `${node.name || node.type}を選択しました。ドラッグで移動できます。`;
      this.render();
    }

    toSvgPoint(clientX, clientY) {
      const point = this.svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const matrix = this.svg.getScreenCTM();
      return matrix ? point.matrixTransform(matrix.inverse()) : { x: clientX, y: clientY };
    }

    handlePointerMove(event) {
      if (this.connectionDrag && event.pointerId === this.connectionDrag.pointerId) {
        event.preventDefault();
        const point = this.toSvgPoint(event.clientX, event.clientY);
        const dx = point.x - this.connectionDrag.start.x;
        const dy = point.y - this.connectionDrag.start.y;
        if (Math.hypot(dx, dy) > 4) this.connectionDrag.moved = true;
        this.connectionDrag.current = {
          x: clamp(point.x, 0, WIDTH),
          y: clamp(point.y, 0, HEIGHT)
        };
        const hoveredPort = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.logic-editor-port');
        this.connectionDrag.hoverKind = hoveredPort?.getAttribute('data-kind') || null;
        if (this.connectionDrag.moved) this.render({ notify: false });
        return;
      }
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const node = this.findNode(this.drag.nodeId);
      if (!node) return;
      const point = this.toSvgPoint(event.clientX, event.clientY);
      const dx = point.x - this.drag.start.x;
      const dy = point.y - this.drag.start.y;
      if (Math.hypot(dx, dy) > 3) this.drag.moved = true;
      node.x = Math.max(45, Math.min(WIDTH - 45, this.drag.originalX + dx));
      node.y = Math.max(42, Math.min(HEIGHT - 42, this.drag.originalY + dy));
      this.render({ notify: false });
    }

    handlePointerUp(event) {
      if (this.connectionDrag && event.pointerId === this.connectionDrag.pointerId) {
        const gesture = this.connectionDrag;
        this.connectionDrag = null;
        if (gesture.moved) {
          const dropped = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.logic-editor-port');
          const targetKind = dropped?.getAttribute('data-kind');
          const targetNodeId = dropped?.getAttribute('data-node-id');
          const targetPort = Number(dropped?.getAttribute('data-port') || 0);
          const rewireWire = gesture.rewireWireId
            ? this.graph.wires.find(wire => wire.id === gesture.rewireWireId)
            : null;
          if (rewireWire && targetKind === 'input') {
            this.rewireConnection(rewireWire.id, rewireWire.from, targetNodeId, targetPort);
            return;
          }
          if (rewireWire && targetKind === 'output') {
            this.rewireConnection(rewireWire.id, targetNodeId, rewireWire.to, rewireWire.port);
            return;
          }
          if (rewireWire) {
            this.pendingFrom = null;
            this.notice = '配線の付け替えをキャンセルしました。';
            this.render();
            return;
          }
          if (gesture.kind === 'output' && targetKind === 'input') {
            this.pendingFrom = gesture.nodeId;
            this.finishConnection(targetNodeId, targetPort);
            return;
          }
          if (gesture.kind === 'input' && targetKind === 'output') {
            this.pendingFrom = targetNodeId;
            this.finishConnection(gesture.nodeId, gesture.port);
            return;
          }
          this.pendingFrom = gesture.kind === 'input' ? gesture.previousPendingFrom : null;
          this.notice = '接続できませんでした。入力端子と出力端子の間をドラッグしてください。';
          this.render();
          return;
        }
        if (gesture.rewireWireId) {
          this.pendingFrom = null;
          this.selectWire(gesture.rewireWireId);
          return;
        }
        if (gesture.kind === 'output') {
          if (gesture.wasPendingSame) {
            this.pendingFrom = null;
            this.notice = '接続をキャンセルしました。';
          } else {
            this.pendingFrom = gesture.nodeId;
            this.notice = '接続先の黒い入力端子を選んでください。Escでキャンセルできます。';
          }
          this.render();
          return;
        }
        this.pendingFrom = gesture.previousPendingFrom;
        this.finishConnection(gesture.nodeId, gesture.port);
        return;
      }
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const drag = this.drag;
      this.drag = null;
      if (drag.moved) {
        this.commit('部品を移動しました。');
      } else if (drag.inputClick) {
        this.toggleInput(drag.nodeId);
      } else {
        this.render();
      }
    }

    handleDocumentKeyDown(event) {
      if (this.destroyed) return;
      const withinEditor = this.container.contains(document.activeElement) || this.drag || this.connectionDrag;
      if (event.key === 'Escape' && (this.pendingFrom || this.connectionDrag)) {
        this.pendingFrom = null;
        this.connectionDrag = null;
        this.notice = '接続をキャンセルしました。';
        this.render();
        return;
      }
      if (!withinEditor) return;
      const editable = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if (editable) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && this.selected) {
        event.preventDefault();
        this.deleteSelected();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
      }
    }

    drawWireValue(point, value) {
      if (!point || value == null) return;
      const candidates = [
        point,
        { x: point.x - 25, y: point.y },
        { x: point.x + 25, y: point.y },
        { x: point.x, y: point.y - 24 },
        { x: point.x, y: point.y + 24 },
        { x: point.x - 50, y: point.y },
        { x: point.x + 50, y: point.y }
      ].map(candidate => ({
        x: clamp(candidate.x, 14, WIDTH - 14),
        y: clamp(candidate.y, 14, HEIGHT - 14)
      }));
      const obstacles = this.routingObstacles();
      const score = candidate => {
        const badgeOverlap = this.valueBadgePositions.reduce((total, existing) => {
          return total + (Math.abs(existing.x - candidate.x) < 24 && Math.abs(existing.y - candidate.y) < 24 ? 10000 : 0);
        }, 0);
        const nodeOverlap = obstacles.reduce((total, rectangle) => {
          const inside = candidate.x > rectangle.left - 11
            && candidate.x < rectangle.right + 11
            && candidate.y > rectangle.top - 11
            && candidate.y < rectangle.bottom + 11;
          return total + (inside ? 1000 : 0);
        }, 0);
        return badgeOverlap + nodeOverlap
          + Math.abs(candidate.x - point.x)
          + Math.abs(candidate.y - point.y);
      };
      const placed = candidates.sort((left, right) => score(left) - score(right))[0];
      this.valueBadgePositions.push(placed);
      const { x, y } = placed;
      const badge = Renderer.svgElement('g', { class: `logic-editor-value${value === 1 ? ' is-one' : ''}` });
      badge.append(
        Renderer.svgElement('rect', { x: x - 10, y: y - 10, width: 20, height: 20, rx: 6 }),
        Renderer.svgElement('text', { x, y: y + 1, 'text-anchor': 'middle' }, String(value))
      );
      this.svg.appendChild(badge);
    }

    drawWireBundle(bundle, signals) {
      const value = signals.get(bundle.sourceId);
      if (bundle.path) {
        this.svg.appendChild(Renderer.svgElement('path', {
          class: `logic-editor-wire logic-editor-wire--bundle${value === 1 ? ' is-one' : ''}`,
          d: bundle.path,
          'data-source': bundle.sourceId,
          'data-value': value == null ? '' : value,
          'aria-hidden': 'true'
        }));
      }
      bundle.junctions.forEach(point => {
        this.svg.appendChild(Renderer.svgElement('circle', {
          class: `logic-editor-junction${value === 1 ? ' is-one' : ''}`,
          cx: point.x,
          cy: point.y,
          r: 4.2,
          'data-source': bundle.sourceId,
          'aria-hidden': 'true'
        }));
      });
      if (bundle.showValue) this.drawWireValue(bundle.labelPoint, value);
    }

    drawWire(wire, signals, route) {
      const fromNode = this.findNode(wire.from);
      const toNode = this.findNode(wire.to);
      if (!fromNode || !toNode || !route?.path) return;
      const pathData = route.path;
      const value = signals.get(fromNode.id);
      const selected = this.selected?.kind === 'wire' && this.selected.id === wire.id;
      const path = Renderer.svgElement('path', {
        class: `logic-editor-wire${value === 1 ? ' is-one' : ''}${selected ? ' is-selected' : ''}`,
        d: pathData,
        'data-wire-id': wire.id,
        'data-source': wire.from,
        'data-value': value == null ? '' : value
      });
      const hit = Renderer.svgElement('path', {
        class: 'logic-editor-wire-hit',
        d: pathData,
        tabindex: 0,
        role: 'button',
        'aria-label': `配線${value == null ? '' : `、信号${value}`}。選択して削除できます`
      });
      const select = event => {
        event.preventDefault();
        event.stopPropagation();
        this.selectWire(wire.id);
      };
      hit.addEventListener('pointerdown', select);
      hit.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') select(event);
      });
      this.svg.append(path, hit);
      if (route.showValue) this.drawWireValue(route.labelPoint, value);
    }

    drawNode(node, signals) {
      const selected = this.selected?.kind === 'node' && this.selected.id === node.id;
      const group = Renderer.svgElement('g', {
        class: `logic-editor-node logic-editor-node--${node.type.toLowerCase()}${selected ? ' is-selected' : ''}`,
        transform: `translate(${node.x} ${node.y})`,
        tabindex: 0,
        role: node.type === 'input' ? 'button' : 'group',
        'aria-label': node.type === 'input'
          ? `入力${node.name}、現在${this.inputValues[node.name]}。クリックで切り替え、ドラッグで移動`
          : node.type === 'output' ? '出力F。ドラッグで移動' : `${node.type}ゲート。ドラッグで移動`
      });
      group.addEventListener('pointerdown', event => this.startDrag(event, node));
      group.addEventListener('keydown', event => {
        if (node.type === 'input' && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          this.toggleInput(node.id);
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && node.type !== 'input' && node.type !== 'output') {
          event.preventDefault();
          this.selected = { kind: 'node', id: node.id };
          this.deleteSelected();
        }
      });

      const value = signals.get(node.id);
      if (node.type === 'input') {
        group.append(
          Renderer.svgElement('rect', { class: 'logic-editor-node__box', x: -34, y: -29, width: 68, height: 58, rx: 11 }),
          Renderer.svgElement('text', { class: 'logic-editor-node__label', x: -11, y: 6, 'text-anchor': 'middle' }, node.name),
          Renderer.svgElement('text', { class: `logic-editor-node__bit${value === 1 ? ' is-one' : ''}`, x: 17, y: 6, 'text-anchor': 'middle' }, String(value))
        );
      } else if (node.type === 'output') {
        group.append(
          Renderer.svgElement('rect', {
            class: `logic-editor-node__box logic-editor-node__box--output${value === 1 ? ' is-one' : ''}`,
            x: -31,
            y: -29,
            width: 62,
            height: 58,
            rx: 11
          }),
          Renderer.svgElement('text', { class: 'logic-editor-node__label', x: 0, y: value == null ? 7 : -4, 'text-anchor': 'middle' }, 'F')
        );
        if (value != null) {
          group.appendChild(Renderer.svgElement('text', {
            class: `logic-editor-node__bit${value === 1 ? ' is-one' : ''}`,
            x: 0,
            y: 18,
            'text-anchor': 'middle'
          }, String(value)));
        }
      } else {
        group.appendChild(Renderer.createGateSymbol(node.type, 0, 0));
        group.appendChild(Renderer.svgElement('text', {
          class: 'logic-editor-node__gate-name',
          x: 0,
          y: 43,
          'text-anchor': 'middle'
        }, node.type));
        if (value != null) {
          group.appendChild(Renderer.svgElement('text', {
            class: `logic-editor-node__gate-value${value === 1 ? ' is-one' : ''}`,
            x: Renderer.gateGeometry(node.type).outputX + 13,
            y: -16,
            'text-anchor': 'middle'
          }, String(value)));
        }
      }
      this.svg.appendChild(group);

      if (node.type !== 'input') {
        for (let port = 0; port < this.inputCount(node); port += 1) {
          this.svg.appendChild(this.makePort(node, 'input', port));
        }
      }
      if (node.type !== 'output') this.svg.appendChild(this.makePort(node, 'output', 0));
    }

    render(options = {}) {
      const analysis = Core.graphAnalysis(this.graph);
      const signals = this.evaluateSignals();
      const background = Renderer.svgElement('rect', {
        class: 'logic-editor__background',
        x: 0,
        y: 0,
        width: WIDTH,
        height: HEIGHT,
        rx: 12
      });
      background.addEventListener('pointerdown', () => {
        this.pendingFrom = null;
        this.connectionDrag = null;
        this.selected = null;
        this.notice = '選択を解除しました。';
        this.render();
      });
      const title = Renderer.svgElement('title', {}, '自由に編集できる論理回路');
      const desc = Renderer.svgElement('desc', {}, '左に入力、右に出力Fがあります。端子を順に選ぶか端子間をドラッグして接続します。接続済み入力端子のドラッグで配線を付け替えられます。配線は重なりを避け、同じ出力からは途中で分岐します。');
      this.svg.replaceChildren(title, desc, background);
      const rewiringWireId = this.connectionDrag?.moved ? this.connectionDrag.rewireWireId : null;
      const routing = this.computeWireRouting(rewiringWireId);
      this.currentWireRoutes = routing.routes;
      this.valueBadgePositions = [];
      routing.bundles.forEach(bundle => this.drawWireBundle(bundle, signals));
      this.graph.wires.forEach(wire => {
        if (wire.id !== rewiringWireId) this.drawWire(wire, signals, routing.routes.get(wire.id));
      });
      this.drawConnectionPreview();
      this.graph.nodes.forEach(node => this.drawNode(node, signals));
      this.drawDeleteControl();

      const completion = analysis.valid
        ? '回路が完成しました。入力を切り替えたり、真理値表を確認したりできます。'
        : `回路が完成していません：${analysis.errors[0] || 'ゲートを配置してFへ接続してください。'}`;
      this.status.classList.toggle('is-complete', analysis.valid);
      this.status.textContent = this.notice ? `${this.notice}　${completion}` : completion;
      this.updateToolbar(analysis);
      if (options.notify !== false && typeof this.options.onChange === 'function') {
        this.options.onChange(this.getState());
      }
    }

    updateToolbar(analysis = this.getAnalysis()) {
      this.undoButton.disabled = this.historyIndex <= 0;
      this.redoButton.disabled = this.historyIndex >= this.history.length - 1;
      this.deleteButton.disabled = !this.selected;
      if (this.saveButton) {
        const filename = Core.createSvgFilename();
        this.saveButton.disabled = !analysis.valid;
        this.saveButton.title = analysis.valid
          ? `${filename} として保存`
          : `回路を完成すると ${filename} として保存できます`;
        this.saveButton.setAttribute('aria-label', this.saveButton.title);
      }
    }

    getAnalysis(inputNames) {
      return Core.graphAnalysis(this.graph, inputNames);
    }

    getState() {
      const analysis = this.getAnalysis();
      return {
        graph: deepCopy(this.graph),
        inputValues: { ...this.inputValues },
        analysis
      };
    }

    setInputValues(values) {
      this.inputNames.forEach(name => {
        this.inputValues[name] = Number(values?.[name]) || 0;
      });
      this.notice = '真理値表の入力を回路に設定しました。';
      this.render();
    }

    loadExpression(expression, options = {}) {
      const parsed = Core.parseAndAnalyze(expression);
      const missing = parsed.inputs.filter(name => !this.inputNames.includes(name));
      if (missing.length) throw new Error(`利用できない入力「${missing.join('、')}」が含まれています。`);
      const diagramAst = Core.toBasicGateAst(parsed.ast);
      this.resetBaseGraph();
      const inputNodes = new Map(this.graph.nodes.filter(node => node.type === 'input').map(node => [node.name, node]));
      const occupied = new Map();

      function astDepth(node) {
        return node.type === 'input' ? 0 : 1 + Math.max(...node.inputs.map(astDepth));
      }
      const maxDepth = astDepth(diagramAst);

      const create = node => {
        if (node.type === 'input') return inputNodes.get(node.name);
        const children = node.inputs.map(create);
        this.nodeSerial += 1;
        const depth = astDepth(node);
        const x = 245 + (depth / Math.max(1, maxDepth)) * 430;
        let y = children.reduce((sum, child) => sum + child.y, 0) / children.length;
        const laneKey = String(Math.round(x / 40));
        const used = occupied.get(laneKey) || [];
        while (used.some(existingY => Math.abs(existingY - y) < 62)) y += 68;
        if (y > HEIGHT - 55) y = Math.max(55, y - 136);
        used.push(y);
        occupied.set(laneKey, used);
        const gate = {
          id: `gate-loaded-${this.nodeSerial}`,
          type: node.gate,
          x,
          y
        };
        this.graph.nodes.splice(this.graph.nodes.length - 1, 0, gate);
        children.forEach((child, port) => {
          this.wireSerial += 1;
          this.graph.wires.push({
            id: `wire-loaded-${this.wireSerial}`,
            from: child.id,
            to: gate.id,
            port
          });
        });
        return gate;
      };

      const rootNode = create(diagramAst);
      const output = this.findNode('output-F');
      output.y = rootNode.y;
      this.wireSerial += 1;
      this.graph.wires.push({
        id: `wire-loaded-${this.wireSerial}`,
        from: rootNode.id,
        to: output.id,
        port: 0
      });
      this.notice = '回路例をAND・OR・NOTで読み込みました。';
      if (options.resetHistory !== false) this.resetHistory();
      this.render();
    }

    saveSvg() {
      try {
        this.exportSvg();
        this.notice = '回路図をSVGとして保存しました。';
      } catch (error) {
        this.notice = `SVGを保存できません：${error.message}`;
      }
      this.render({ notify: false });
    }

    exportSvg() {
      const analysis = this.getAnalysis();
      if (!analysis.valid) throw new Error(analysis.errors[0] || '回路が完成していません。');
      const temporary = document.createElement('div');
      const displayExpression = Core.toDisplayExpr(analysis.ast);
      const rendered = Renderer.renderCircuit(temporary, analysis.ast, {
        inputs: this.inputValues,
        title: `論理回路：${displayExpression}`
      });
      return Renderer.downloadSvg(rendered.svg, `論理回路：${displayExpression}`);
    }

    destroy() {
      this.destroyed = true;
      document.removeEventListener('pointermove', this.boundPointerMove);
      document.removeEventListener('pointerup', this.boundPointerUp);
      document.removeEventListener('keydown', this.boundKeyDown);
    }
  }

  root.LogicEditor = LogicEditor;
})(typeof globalThis !== 'undefined' ? globalThis : window);
