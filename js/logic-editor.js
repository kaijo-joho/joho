// lc02/lc03で共有する、クリック接続式の組合せ回路エディタ。
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
      palette.appendChild(htmlElement('span', 'logic-editor__toolbar-label', 'ゲートを追加'));
      GATES.forEach(gate => {
        const button = makeButton(gate, 'logic-editor__gate-button', () => this.addGate(gate));
        button.dataset.gate = gate;
        palette.appendChild(button);
      });

      const actions = htmlElement('div', 'logic-editor__actions');
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', '回路の編集操作');
      this.undoButton = makeButton('↶ Undo', 'logic-editor__action-button', () => this.undo());
      this.redoButton = makeButton('↷ Redo', 'logic-editor__action-button', () => this.redo());
      this.deleteButton = makeButton('選択を削除', 'logic-editor__action-button', () => this.deleteSelected());
      this.clearButton = makeButton('全消去', 'logic-editor__action-button logic-editor__action-button--danger', () => this.clear());
      actions.append(this.undoButton, this.redoButton, this.deleteButton, this.clearButton);
      toolbar.append(palette, actions);

      const guide = htmlElement(
        'p',
        'logic-editor__guide',
        '① ゲートを追加　② 出力端子（○）を選ぶ　③ 接続先の入力端子（○）を選ぶ。部品はドラッグで移動できます。'
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
        'aria-label': '論理回路編集キャンバス。ゲートを移動し、丸い端子を順番に選んで接続します。',
        preserveAspectRatio: 'xMidYMid meet'
      });
      this.canvasWrap.appendChild(this.svg);
      this.editor.append(toolbar, guide, scrollHint, this.status, this.canvasWrap);
      this.container.replaceChildren(this.editor);
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

    inputCount(node) {
      if (!node) return 0;
      if (node.type === 'output') return 1;
      return Core.REQUIRED_INPUTS[node.type] || 0;
    }

    outputPoint(node) {
      if (node.type === 'input') return { x: node.x + 38, y: node.y };
      const geometry = Renderer.gateGeometry(node.type);
      return { x: node.x + geometry.outputX + 6, y: node.y };
    }

    inputPoint(node, port) {
      if (node.type === 'output') return { x: node.x - 38, y: node.y };
      const geometry = Renderer.gateGeometry(node.type);
      return { x: node.x + geometry.inputX - 6, y: node.y + geometry.inputYs[port] };
    }

    connectionPath(from, to) {
      return Renderer.orthogonalWirePath(from, to);
    }

    startConnection(nodeId) {
      const node = this.findNode(nodeId);
      if (!node || node.type === 'output') return;
      if (this.pendingFrom === nodeId) {
        this.pendingFrom = null;
        this.notice = '接続をキャンセルしました。';
      } else {
        this.pendingFrom = nodeId;
        this.selected = { kind: 'node', id: nodeId };
        this.notice = '接続先の白い入力端子を選んでください。Escでキャンセルできます。';
      }
      this.render();
    }

    finishConnection(nodeId, port) {
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
      const selected = kind === 'output' && this.pendingFrom === node.id;
      const circle = Renderer.svgElement('circle', {
        class: `logic-editor-port logic-editor-port--${kind}${selected ? ' is-pending' : ''}`,
        cx: point.x,
        cy: point.y,
        r: selected ? 12 : 10,
        tabindex: 0,
        role: 'button',
        'aria-label': kind === 'output'
          ? `${node.name || node.type}の出力端子。接続元にする`
          : `${node.name || node.type}の入力${Number(port) + 1}端子。ここへ接続`
      });
      const activate = event => {
        event.preventDefault();
        event.stopPropagation();
        if (kind === 'output') this.startConnection(node.id);
        else this.finishConnection(node.id, Number(port));
      };
      circle.addEventListener('pointerdown', activate);
      circle.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      });
      return circle;
    }

    startDrag(event, node) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.selected = { kind: 'node', id: node.id };
      this.pendingFrom = null;
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
      const withinEditor = this.container.contains(document.activeElement) || this.drag;
      if (event.key === 'Escape' && this.pendingFrom) {
        this.pendingFrom = null;
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

    drawWire(wire, signals) {
      const fromNode = this.findNode(wire.from);
      const toNode = this.findNode(wire.to);
      if (!fromNode || !toNode) return;
      const from = this.outputPoint(fromNode);
      const to = this.inputPoint(toNode, Number(wire.port));
      const pathData = this.connectionPath(from, to);
      const value = signals.get(fromNode.id);
      const selected = this.selected?.kind === 'wire' && this.selected.id === wire.id;
      const path = Renderer.svgElement('path', {
        class: `logic-editor-wire${value === 1 ? ' is-one' : ''}${selected ? ' is-selected' : ''}`,
        d: pathData,
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
      if (value != null) {
        const labelPoint = Renderer.wireLabelPoint(from, to);
        const { x, y } = labelPoint;
        const badge = Renderer.svgElement('g', { class: `logic-editor-value${value === 1 ? ' is-one' : ''}` });
        badge.append(
          Renderer.svgElement('rect', { x: x - 10, y: y - 10, width: 20, height: 20, rx: 6 }),
          Renderer.svgElement('text', { x, y: y + 1, 'text-anchor': 'middle' }, String(value))
        );
        this.svg.appendChild(badge);
      }
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
      background.addEventListener('click', () => {
        this.pendingFrom = null;
        this.selected = null;
        this.notice = '選択を解除しました。';
        this.render();
      });
      const title = Renderer.svgElement('title', {}, '自由に編集できる論理回路');
      const desc = Renderer.svgElement('desc', {}, '左に入力、右に出力Fがあります。ゲートを追加し、丸い端子を順に選択して配線します。');
      this.svg.replaceChildren(title, desc, background);
      this.graph.wires.forEach(wire => this.drawWire(wire, signals));
      this.graph.nodes.forEach(node => this.drawNode(node, signals));

      const completion = analysis.valid
        ? `回路完成：${analysis.structureExpr} ／ truthCode ${analysis.truthCode}`
        : `回路が完成していません：${analysis.errors[0] || 'ゲートを配置してFへ接続してください。'}`;
      this.status.classList.toggle('is-complete', analysis.valid);
      this.status.textContent = this.notice ? `${this.notice}　${completion}` : completion;
      this.updateToolbar();
      if (options.notify !== false && typeof this.options.onChange === 'function') {
        this.options.onChange(this.getState());
      }
    }

    updateToolbar() {
      this.undoButton.disabled = this.historyIndex <= 0;
      this.redoButton.disabled = this.historyIndex >= this.history.length - 1;
      this.deleteButton.disabled = !this.selected;
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
      this.notice = `例「${parsed.structureExpr}」をAND・OR・NOTで読み込みました。`;
      if (options.resetHistory !== false) this.resetHistory();
      this.render();
    }

    exportSvg() {
      const analysis = this.getAnalysis();
      if (!analysis.valid) throw new Error(analysis.errors[0] || '回路が完成していません。');
      const temporary = document.createElement('div');
      const rendered = Renderer.renderCircuit(temporary, analysis.ast, {
        inputs: this.inputValues,
        title: `論理回路 ${analysis.structureExpr}`
      });
      return Renderer.downloadSvg(rendered.svg, analysis.structureExpr);
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
