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

  function makeFileButton(kind, label, onClick, showLabel = false) {
    const paths = {
      save: 'M 5 3 H 17 L 21 7 V 21 H 3 V 3 Z M 7 3 V 9 H 16 V 3 M 7 21 V 14 H 17 V 21',
      open: 'M 3 8 V 5 H 9 L 12 8 H 21 V 11 M 3 8 L 5 21 H 19 L 22 11 H 8 L 5 21',
      export: 'M 12 3 V 15 M 7 8 L 12 3 L 17 8 M 5 13 V 21 H 19 V 13',
      align: 'M 4 3 V 21 M 20 3 V 21 M 8 5 H 16 V 9 H 8 Z M 10 15 H 14 V 19 H 10 Z M 12 9 V 15',
      table: 'M 3 4 H 21 V 20 H 3 Z M 3 9 H 21 M 3 14 H 21 M 9 4 V 20 M 15 4 V 20',
      swap: 'M 4 8 H 20 L 16 4 M 20 16 H 4 L 8 20',
      delete: 'M 4 6 H 20 M 9 6 V 3 H 15 V 6 M 6 6 L 7 21 H 17 L 18 6 M 10 10 V 17 M 14 10 V 17'
    };
    const button = makeButton('', `logic-editor__action-button ${showLabel ? 'logic-editor__export-button' : 'logic-editor__icon-button'}`, onClick);
    button.setAttribute('aria-label', label);
    button.title = label;
    const svg = Renderer.svgElement('svg', {
      class: 'logic-editor__file-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false'
    });
    svg.appendChild(Renderer.svgElement('path', { d: paths[kind] }));
    button.appendChild(svg);
    if (showLabel) button.appendChild(htmlElement('span', '', '出力'));
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
          if (overlap > 1) penalty += 1000000 + overlap * 20000;
          return;
        }
        const horizontal = segment.axis === 'h' ? segment : existing;
        const vertical = segment.axis === 'v' ? segment : existing;
        const crossesHorizontal = vertical.fixed > horizontal.start + 2 && vertical.fixed < horizontal.end - 2;
        const crossesVertical = horizontal.fixed > vertical.start + 2 && horizontal.fixed < vertical.end - 2;
        // 別の信号の交差は許容する。交差を避けるためだけの迂回は作らない。
        if (crossesHorizontal && crossesVertical) penalty += 12;
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
      + routeCollisionPenalty(segments, occupied)
      + length
      + Math.max(0, segments.length - 1) * 24;
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
      this.inputNames = Array.from(options.inputNames || ['A', 'B']);
      this.availableInputNames = Array.from(options.availableInputNames || this.inputNames);
      this.graph = { nodes: [], wires: [] };
      this.inputValues = Object.fromEntries(this.inputNames.map(name => [name, 0]));
      this.nodeSerial = 0;
      this.wireSerial = 0;
      this.pendingFrom = null;
      this.pendingRewire = null;
      this.selected = null;
      this.drag = null;
      this.pan = null;
      this.connectionDrag = null;
      this.paletteDrag = null;
      this.suppressPaletteClick = false;
      this.savingPng = false;
      this.exportShowSignals = options.exportShowSignals !== false;
      this.outputSerial = 0;
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
      this.boundPointerCancel = event => this.cancelPointerGesture(event);
      this.boundKeyDown = event => this.handleDocumentKeyDown(event);
      document.addEventListener('pointermove', this.boundPointerMove);
      document.addEventListener('pointerup', this.boundPointerUp);
      document.addEventListener('pointercancel', this.boundPointerCancel);
      document.addEventListener('keydown', this.boundKeyDown);
      this.render();
    }

    buildShell() {
      this.container.classList.add('logic-editor-host');
      this.editor = htmlElement('div', 'logic-editor');
      const toolbar = htmlElement('div', 'logic-editor__toolbar');
      const palette = htmlElement('div', 'logic-editor__palette');
      palette.setAttribute('role', 'group');
      palette.setAttribute('aria-label', '回路の部品を追加');
      GATES.forEach(gate => {
        const button = makeButton('', 'logic-editor__gate-button', event => {
          if (event.detail === 0 || !this.suppressPaletteClick) this.addGate(gate);
          this.suppressPaletteClick = false;
        });
        button.dataset.gate = gate;
        button.setAttribute('aria-label', `${gate}ゲートを追加`);
        button.title = 'クリックで追加、回路内へドラッグして配置';
        button.addEventListener('pointerdown', event => this.beginPaletteDrag(event, gate, button));
        button.addEventListener('lostpointercapture', event => {
          if (this.paletteDrag?.pointerId === event.pointerId) this.finishPaletteDrag(event, true);
        });
        button.append(
          htmlElement('span', 'logic-editor__gate-plus', '＋'),
          createGateButtonIcon(gate),
          htmlElement('span', 'logic-editor__gate-button-label', gate)
        );
        palette.appendChild(button);
      });
      if (this.options.allowInputDeletion || this.availableInputNames.length > this.inputNames.length) {
        this.addInputButton = makeButton('', 'logic-editor__action-button logic-editor__add-input-button', () => this.addInput());
        palette.appendChild(this.addInputButton);
      }
      if (this.options.allowMultipleOutputs) {
        this.addOutputButton = makeButton('＋ 出力', 'logic-editor__action-button logic-editor__add-output-button', () => this.addOutput());
        this.addOutputButton.setAttribute('aria-label', '出力を追加');
        palette.appendChild(this.addOutputButton);
      }

      const actions = htmlElement('div', 'logic-editor__actions');
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', '回路の編集操作');
      this.undoButton = makeHistoryButton('undo', () => this.undo());
      this.redoButton = makeHistoryButton('redo', () => this.redo());
      this.fileSaveButton = this.options.onSave ? makeFileButton('save', '回路を保存', () => this.options.onSave()) : null;
      this.loadButton = this.options.onLoad ? makeFileButton('open', '回路を読み込む', () => this.options.onLoad()) : null;
      this.exportButton = this.options.onExport ? makeFileButton('export', '回路図を出力', () => this.options.onExport(), true) : null;
      this.alignButton = this.options.enableAlignment ? makeFileButton('align', '回路全体を自動整列', () => this.alignCircuit()) : null;
      if (this.alignButton) this.alignButton.title = '回路全体を自動整列（接続は変えず、Undoで戻せます）';
      this.tableButton = this.options.onToggleTable ? makeFileButton('table', '真理値表を折りたたむ', () => this.options.onToggleTable()) : null;
      this.deleteButton = makeButton('選択を削除', 'logic-editor__action-button logic-editor__delete-button', () => this.deleteSelected());
      this.clearButton = makeButton('全消去', 'logic-editor__action-button logic-editor__action-button--danger', () => {
        if (this.options.onClearRequest) this.options.onClearRequest();
        else this.clear();
      });
      this.swapButton = makeButton('AND ⇄ OR', 'logic-editor__action-button logic-editor__swap-button', () => this.swapSelectedGate());
      if (this.fileSaveButton) {
        this.deleteButton = makeFileButton('delete', '選択を削除', () => this.deleteSelected());
        this.deleteButton.classList.add('logic-editor__delete-button');
        this.swapButton = makeFileButton('swap', 'ANDとORを交換', () => this.swapSelectedGate());
        this.swapButton.classList.add('logic-editor__swap-button');
      }
      if (this.fileSaveButton || this.loadButton || this.exportButton) actions.classList.add('logic-editor__actions--files');
      actions.append(this.undoButton, this.redoButton);
      actions.append(...[this.fileSaveButton, this.loadButton, this.exportButton].filter(Boolean));
      if (this.tableButton) actions.appendChild(this.tableButton);
      if (this.alignButton) actions.appendChild(this.alignButton);
      actions.append(this.swapButton, this.deleteButton, this.clearButton);
      // 見た目だけでなくTab順も、編集操作→部品の追加にそろえる。
      toolbar.append(actions, palette);

      this.help = htmlElement('details', 'logic-editor__help');
      const helpButton = htmlElement('summary', 'logic-editor__help-button', '？');
      helpButton.setAttribute('aria-label', '回路エディタの操作方法');
      const helpContent = htmlElement('div', 'logic-editor__help-content');
      helpContent.append(
        htmlElement('p', '', '＋付きのゲートを回路内へドラッグして配置します。クリック・Enterでも追加できます。端子（●）を順に選ぶか、端子間をドラッグして接続します。部品もドラッグで移動できます。'),
        htmlElement('p', '', '配線を選ぶと両端が強調されます。左端を別の出力端子へ、右端を別の入力端子へドラッグして付け替えます。接続済みの入力端子につなぐと、その端子の古い配線を置き換えます。端子をEnterで順に選ぶ方法でも操作できます。'),
        htmlElement('p', '', `AND・ORゲートは選択後にツールバーで交換できます。入力の箱を選ぶと0/1が切り替わります。選択した${this.options.allowInputDeletion ? '入力・ゲート・配線' : 'ゲート・配線'}は×またはDeleteで削除でき、Undoで戻せます。`)
      );
      if (this.options.allowMultipleOutputs) helpContent.appendChild(htmlElement('p', '', '「＋ 出力」で出力を増やすとF₁・F₂…と表示され、すべての出力を真理値表と保存図で確認できます。出力が2つ以上あるときは、選んだ出力を削除して減らせます。'));
      if (this.fileSaveButton) helpContent.appendChild(htmlElement('p', '', '保存アイコンで作りかけも名前を付けて保存できます。読み込みアイコンから保存した回路やテンプレートを開きます。保存先はこのブラウザだけです。'));
      if (this.tableButton) helpContent.appendChild(htmlElement('p', '', '表のアイコンで真理値表を折りたたむと、回路を広く表示できます。もう一度押すと、現在の入力値に対応する行を強調して真理値表を表示します。'));
      if (this.options.enableAlignment) helpContent.appendChild(htmlElement('p', '', '整列アイコンで、配線をなるべく直線にしながら入力・ゲート・出力の順に並べ直します。部品の追加・移動中は、配線が直線になる位置、横・縦の部品の中心が等間隔になる位置、他の部品と中心がそろう位置に吸着し、補助線が出ます。少し離すと解除されます。Alt（Option）キーを押しながらドラッグすると吸着しません。Escapeで移動をキャンセルでき、確定後もUndoで戻せます。'));
      if (this.exportButton) helpContent.appendChild(htmlElement('p', '', '「出力」でSVG・PNGの形式と0/1の有無を選んで書き出します。保存図は現在の配置・配線を使い、入力・出力を点で示します。'));
      this.help.append(helpButton, helpContent);
      actions.appendChild(this.help);
      this.help.addEventListener('pointerenter', event => {
        clearTimeout(this.helpCloseTimer);
        if (event.pointerType === 'mouse') this.help.open = true;
      });
      this.help.addEventListener('pointerleave', () => {
        this.helpCloseTimer = setTimeout(() => {
          if (!this.help.contains(document.activeElement)) this.help.open = false;
        }, 180);
      });
      this.boundOutsideHelp = event => {
        if (!this.help.contains(event.target)) this.help.open = false;
      };
      document.addEventListener('pointerdown', this.boundOutsideHelp, true);
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
      this.svg.addEventListener('lostpointercapture', event => {
        if (this.drag?.pointerId === event.pointerId) this.cancelPointerGesture(event);
      });
      this.editor.append(toolbar, scrollHint, this.canvasWrap, this.status);
      this.container.replaceChildren(this.editor);
    }

    resetBaseGraph() {
      // 自由編集では追加するC・Dの場所を空けておく。既存部品は追加時に動かさない。
      const count = this.availableInputNames.length;
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
      this.outputSerial = 0;
      this.pendingFrom = null;
      this.pendingRewire = null;
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
      return deepCopy({ graph: this.graph, inputValues: this.inputValues, inputNames: this.inputNames });
    }

    restore(snapshot) {
      this.graph = deepCopy(snapshot.graph);
      this.inputValues = deepCopy(snapshot.inputValues);
      this.inputNames = Array.from(snapshot.inputNames);
      this.updateOutputNames();
      this.pendingFrom = null;
      this.pendingRewire = null;
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
      this.checkpoint();
      this.resetBaseGraph();
      this.commit('ゲートと配線をすべて消去し、出力をFだけに戻しました。Undoで戻せます。');
    }

    alignCircuit() {
      if (!this.options.enableAlignment || this.drag || this.paletteDrag || this.connectionDrag) return;
      try {
        if (!root.LogicLayout) throw new Error('整列機能を読み込めませんでした。ページを再読み込みしてください。');
        const positions = root.LogicLayout.arrange(this.graph, {
          width: WIDTH, height: HEIGHT,
          inputOffset: (node, port) => this.inputPoint(node, port).y - node.y
        });
        const changed = positions.some(point => {
          const node = this.findNode(point.id);
          return node.x !== point.x || node.y !== point.y;
        });
        if (!changed) {
          this.notice = 'すでに整列しています。';
          this.render({ notify: false });
          return;
        }
        this.checkpoint();
        positions.forEach(point => Object.assign(this.findNode(point.id), { x: point.x, y: point.y }));
        this.pendingFrom = null;
        this.pendingRewire = null;
        this.commit('回路全体を整列しました。接続は変わりません。Undoで元の配置に戻せます。');
      } catch (error) {
        this.notice = error.message;
        this.render({ notify: false });
      }
    }

    addGate(type, position) {
      const gate = String(type).toUpperCase();
      if (!GATES.includes(gate)) return;
      this.pendingFrom = null;
      this.pendingRewire = null;
      this.connectionDrag = null;
      this.nodeSerial += 1;
      const lane = (this.nodeSerial - 1) % 5;
      const column = Math.floor((this.nodeSerial - 1) / 5) % 3;
      const node = {
        id: `gate-${Date.now().toString(36)}-${this.nodeSerial}`,
        type: gate,
        x: position ? clamp(position.x, 45, WIDTH - 45) : 285 + column * 145,
        y: position ? clamp(position.y, 42, HEIGHT - 42) : 82 + lane * 86
      };
      this.graph.nodes.push(node);
      this.selected = { kind: 'node', id: node.id };
      this.commit(`${gate}ゲートを追加しました。ドラッグで位置を調整できます。`);
    }

    beginPaletteDrag(event, gate, button) {
      if (event.button !== 0 || this.paletteDrag || this.drag || this.connectionDrag) return;
      event.preventDefault();
      button.focus({ preventScroll: true });
      button.setPointerCapture?.(event.pointerId);
      this.suppressPaletteClick = false;
      this.paletteDrag = {
        gate, button, pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY }, moved: false, position: null
      };
      this.pendingFrom = null;
      this.pendingRewire = null;
    }

    paletteDropPoint(event) {
      const bounds = this.canvasWrap.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom
        || !this.svg.contains(document.elementFromPoint(event.clientX, event.clientY))) return null;
      const point = this.toSvgPoint(event.clientX, event.clientY);
      if (point.x < 0 || point.x > WIDTH || point.y < 0 || point.y > HEIGHT) return null;
      return { x: clamp(point.x, 45, WIDTH - 45), y: clamp(point.y, 42, HEIGHT - 42) };
    }

    finishPaletteDrag(event, cancelled = false) {
      const gesture = this.paletteDrag;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      this.paletteDrag = null;
      gesture.button.classList.remove('is-dragging');
      if (gesture.button.hasPointerCapture?.(event.pointerId)) gesture.button.releasePointerCapture(event.pointerId);
      if (!gesture.moved && !cancelled) return; // 通常のクリックで追加する。
      this.suppressPaletteClick = true; // ドロップ直後のclickで二重追加しない。
      const rawPosition = cancelled ? null : this.paletteDropPoint(event);
      const position = rawPosition ? this.snapPosition({ type: gesture.gate }, rawPosition, gesture, event.altKey) : null;
      if (position) {
        this.addGate(gesture.gate, position);
        this.canvasWrap.focus({ preventScroll: true });
      } else {
        this.notice = 'ゲートの追加をキャンセルしました。';
        this.render({ notify: false });
      }
    }

    drawPalettePreview() {
      const gesture = this.paletteDrag;
      if (!gesture?.moved || !gesture.position) return;
      const preview = Renderer.createGateSymbol(gesture.gate, gesture.position.x, gesture.position.y, {
        className: 'logic-editor-palette-preview'
      });
      preview.setAttribute('aria-hidden', 'true');
      this.svg.appendChild(preview);
    }

    addInput() {
      const name = this.availableInputNames.find(candidate => !this.inputNames.includes(candidate));
      if (!name) return;
      const index = this.availableInputNames.indexOf(name);
      const gap = Math.min(98, 360 / Math.max(1, this.availableInputNames.length - 1));
      const firstY = HEIGHT / 2 - gap * (this.availableInputNames.length - 1) / 2;
      const preferredY = firstY + index * gap;
      const candidates = [preferredY, ...Array.from({ length: 7 }, (_, i) => 50 + i * 68)];
      const y = candidates.find(candidate => this.graph.nodes.every(node => {
        return Math.abs(node.x - 72) >= 90 || Math.abs(node.y - candidate) >= 64;
      })) ?? preferredY;
      const node = { id: `input-${name}`, type: 'input', name, x: 72, y };
      this.inputNames.push(name);
      this.inputNames.sort((left, right) => this.availableInputNames.indexOf(left) - this.availableInputNames.indexOf(right));
      this.inputValues[name] = 0;
      this.graph.nodes.push(node);
      this.pendingFrom = null;
      this.pendingRewire = null;
      this.selected = { kind: 'node', id: node.id };
      this.commit(`入力${name}を追加しました。`);
    }

    swapSelectedGate() {
      const node = this.selected?.kind === 'node' ? this.findNode(this.selected.id) : null;
      if (!node || !['AND', 'OR'].includes(node.type)) return;
      const previousType = node.type;
      node.type = previousType === 'AND' ? 'OR' : 'AND';
      this.pendingFrom = null;
      this.pendingRewire = null;
      this.commit(`${previousType}を${node.type}へ変更しました。接続と位置はそのままです。`);
    }

    updateOutputNames() {
      const outputs = this.graph.nodes.filter(node => node.type === 'output');
      outputs.forEach((node, index) => { node.name = Core.outputName(index, outputs.length); });
    }

    addOutput() {
      if (!this.options.allowMultipleOutputs) return;
      const outputs = this.graph.nodes.filter(node => node.type === 'output');
      const preferredY = outputs.at(-1).y + 98;
      const ys = [preferredY, ...Array.from({ length: 7 }, (_, index) => 50 + index * 68)]
        .filter(y => y >= 42 && y <= HEIGHT - 42);
      const candidates = [828, 728, 628, 528, 428].flatMap(x => ys.map(y => ({ x, y })));
      const score = point => this.graph.nodes.filter(node => Math.abs(node.x - point.x) < 88 && Math.abs(node.y - point.y) < 68).length;
      const position = candidates.sort((left, right) => score(left) - score(right))[0];
      // Serialは履歴から巻き戻さず、現存するIDとも照合して重複を避ける。
      let id;
      do { id = `output-added-${++this.outputSerial}`; } while (this.findNode(id));
      const node = { id, type: 'output', ...position };
      this.graph.nodes.push(node);
      this.updateOutputNames();
      this.pendingFrom = null;
      this.pendingRewire = null;
      this.selected = { kind: 'node', id };
      this.commit(`出力${node.name}を追加しました。配線をつなぐと真理値表にも反映されます。`);
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
      this.pendingRewire = null;
      this.selected = null;
      if (!wire || !from || !to || from.type === 'output' || to.type === 'input'
        || !Number.isInteger(targetPort) || targetPort < 0 || targetPort >= this.inputCount(to)) {
        this.notice = 'その端子へ配線を付け替えることはできません。';
        this.render();
        return;
      }
      if (wire.from === from.id && wire.to === to.id && Number(wire.port) === targetPort) {
        this.notice = '配線の接続は変更されませんでした。';
        this.render();
        return;
      }
      const displaced = this.incomingWire(to.id, targetPort);
      const otherWires = this.graph.wires.filter(candidate => candidate.id !== wire.id && candidate !== displaced);
      const graphWithoutWire = { nodes: this.graph.nodes, wires: otherWires };
      if (Core.wouldCreateCycle(graphWithoutWire, from.id, to.id)) {
        this.notice = '循環する接続には付け替えられません。';
        this.render();
        return;
      }
      wire.from = from.id;
      wire.to = to.id;
      wire.port = targetPort;
      // 検証後にまとめて変更する。失敗やキャンセルでは既存の配線を失わない。
      this.graph.wires = this.graph.wires.filter(candidate => candidate !== displaced || candidate === wire);
      const fromLabel = from.name || from.type;
      const toLabel = to.type === 'output' ? to.name : `${to.type}の入力${targetPort + 1}`;
      this.commit(`配線を${fromLabel}から${toLabel}へ付け替えました。${displaced && displaced !== wire ? 'この端子の古い配線を置き換えました。Undoで戻せます。' : ''}`);
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
      this.pendingRewire = null;
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
      const targetPort = Number(port);
      if (!from || !to || to.type === 'input' || from.type === 'output'
        || !Number.isInteger(targetPort) || targetPort < 0 || targetPort >= this.inputCount(to)) {
        this.notice = 'その向きには接続できません。';
        this.render();
        return;
      }
      const displaced = this.incomingWire(to.id, targetPort);
      if (displaced?.from === from.id) {
        this.pendingFrom = null;
        this.notice = 'この端子には同じ配線が接続されています。';
        this.render();
        return;
      }
      const remainingWires = this.graph.wires.filter(wire => wire !== displaced);
      if (Core.wouldCreateCycle({ nodes: this.graph.nodes, wires: remainingWires }, from.id, to.id)) {
        this.notice = '循環する接続は作成できません。';
        this.render();
        return;
      }
      this.wireSerial += 1;
      this.graph.wires = remainingWires;
      this.graph.wires.push({
        id: `wire-${Date.now().toString(36)}-${this.wireSerial}`,
        from: from.id,
        to: to.id,
        port: targetPort
      });
      this.pendingFrom = null;
      this.selected = null;
      this.commit(`${from.name || from.type}から${to.name || to.type}へ接続しました。${displaced ? 'この端子の古い配線を置き換えました。Undoで戻せます。' : ''}`);
    }

    selectWire(id) {
      this.pendingFrom = null;
      this.pendingRewire = null;
      this.connectionDrag = null;
      this.selected = { kind: 'wire', id };
      this.notice = '配線を選択しました。強調された両端をドラッグして付け替え、×またはDeleteで削除できます。';
      this.render();
    }

    canDeleteNode(node) {
      if (!node) return false;
      if (node.type === 'output') return Boolean(this.options.allowMultipleOutputs && this.graph.nodes.filter(candidate => candidate.type === 'output').length > 1);
      return node.type !== 'input' || Boolean(this.options.allowInputDeletion);
    }

    deleteSelected() {
      if (!this.selected) {
        this.notice = '削除する部品または配線を選択してください。';
        this.render();
        return;
      }
      this.pendingFrom = null;
      this.pendingRewire = null;
      if (this.selected.kind === 'wire') {
        const before = this.graph.wires.length;
        this.graph.wires = this.graph.wires.filter(wire => wire.id !== this.selected.id);
        this.selected = null;
        if (this.graph.wires.length !== before) this.commit('配線を削除しました。Undoで戻せます。');
        return;
      }
      const node = this.findNode(this.selected.id);
      if (!node) return;
      if (!this.canDeleteNode(node)) {
        this.notice = 'この部品は固定されているため削除できません。';
        this.render();
        return;
      }
      this.graph.nodes = this.graph.nodes.filter(candidate => candidate.id !== node.id);
      this.graph.wires = this.graph.wires.filter(wire => wire.from !== node.id && wire.to !== node.id);
      if (node.type === 'input') {
        this.inputNames = this.inputNames.filter(name => name !== node.name);
        delete this.inputValues[node.name];
      }
      this.updateOutputNames();
      this.selected = null;
      const label = node.type === 'input' ? `入力${node.name}` : node.type === 'output' ? `出力${node.name}` : `${node.type}ゲート`;
      this.commit(`${label}と接続配線を削除しました。Undoで戻せます。`);
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
      const selectedWire = this.selected?.kind === 'wire'
        ? this.graph.wires.find(wire => wire.id === this.selected.id) : null;
      const isWireEnd = selectedWire && (kind === 'output'
        ? selectedWire.from === node.id
        : selectedWire.to === node.id && Number(selectedWire.port) === Number(port));
      const selected = kind === 'output' && this.pendingFrom === node.id;
      const dragging = this.connectionDrag?.nodeId === node.id
        && this.connectionDrag?.kind === kind
        && Number(this.connectionDrag?.port) === Number(port);
      const marker = Renderer.svgElement('g', {
        class: `logic-editor-port logic-editor-port--${kind}${connectedWire ? ' is-connected' : ''}${isWireEnd ? ' is-wire-end' : ''}${selected ? ' is-pending' : ''}${dragging ? ' is-dragging' : ''}`,
        tabindex: 0,
        role: 'button',
        'data-node-id': node.id,
        'data-kind': kind,
        'data-port': Number(port),
        'data-focus-key': `port-${node.id}-${kind}-${port}`,
        'data-wire-id': connectedWire?.id || null,
        'aria-label': isWireEnd
          ? `選択した配線の${kind === 'output' ? '左端（接続元）' : '右端（接続先）'}。ドラッグ、またはEnterで付け替え開始`
          : kind === 'output'
          ? `${node.name || node.type}の出力端子。選ぶか、入力端子までドラッグして接続`
          : connectedWire
            ? `${node.name || node.type}の入力${Number(port) + 1}端子、接続済み。クリックで配線を選択、別の端子へドラッグして付け替え`
            : `${node.name || node.type}の入力${Number(port) + 1}端子。選ぶか、出力端子からここまでドラッグして接続`
      });
      if (isWireEnd) marker.appendChild(Renderer.svgElement('circle', {
        class: 'logic-editor-port__endpoint-ring', cx: point.x, cy: point.y, r: 10,
        'aria-hidden': 'true'
      }));
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
        if (this.pendingRewire) {
          const pending = this.pendingRewire;
          const wire = this.graph.wires.find(candidate => candidate.id === pending.id);
          if (wire && pending.kind === kind) {
            this.rewireConnection(wire.id, kind === 'output' ? node.id : wire.from,
              kind === 'input' ? node.id : wire.to, kind === 'input' ? port : wire.port);
          }
        } else if (isWireEnd && !this.pendingFrom) {
          this.pendingRewire = { id: selectedWire.id, kind };
          this.notice = `付け替え先の${kind === 'output' ? '出力' : '入力'}端子をEnterで選んでください。Escでキャンセルできます。`;
          this.render();
        } else if (kind === 'output') this.startConnection(node.id);
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
      this.canvasWrap.focus({ preventScroll: true });
      // 端子は再描画で置き換わるため、タッチの追跡先は残り続けるSVGにする。
      this.svg.setPointerCapture?.(event.pointerId);
      const start = this.toSvgPoint(event.clientX, event.clientY);
      const previousPendingFrom = this.pendingFrom;
      const selectedWire = this.selected?.kind === 'wire'
        ? this.graph.wires.find(wire => wire.id === this.selected.id) : null;
      const connectedWire = previousPendingFrom ? null : kind === 'input'
        ? this.incomingWire(node.id, port)
        : selectedWire?.from === node.id ? selectedWire : null;
      this.pendingRewire = null;
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
        rewireSourceOnly: Boolean(connectedWire && kind === 'output'),
        hoverKind: kind
      };
      if (connectedWire) {
        this.pendingFrom = null;
        this.selected = { kind: 'wire', id: connectedWire.id };
        this.notice = kind === 'output'
          ? '選択した配線の左端を、別の出力端子までドラッグしてください。'
          : '配線の末端を、付け替え先の入力端子または出力端子までドラッグしてください。';
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
        if (gesture.rewireSourceOnly || gesture.hoverKind === 'output') {
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
      if (!this.selected || this.connectionDrag?.moved) return;
      let point;
      let label;
      if (this.selected.kind === 'node') {
        const node = this.findNode(this.selected.id);
        if (!this.canDeleteNode(node)) return;
        point = { x: node.x + 43, y: node.y - 38 };
        label = node.type === 'input' ? `入力${node.name}を削除` : node.type === 'output' ? `出力${node.name}を削除` : `${node.type}ゲートを削除`;
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
        'data-focus-key': 'delete-selection',
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
      this.canvasWrap.focus({ preventScroll: true });
      this.svg.setPointerCapture?.(event.pointerId);
      this.selected = { kind: 'node', id: node.id };
      this.pendingFrom = null;
      this.pendingRewire = null;
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

    snapPosition(node, position, gesture, bypass = false) {
      const result = { x: clamp(position.x, 45, WIDTH - 45), y: clamp(position.y, 42, HEIGHT - 42) };
      const previous = gesture.snap || {};
      gesture.snap = {};
      gesture.guides = [];
      if (!this.options.enableAlignment || bypass) return result;
      const others = this.graph.nodes.filter(other => other.id !== node.id);
      const matrix = this.svg.getScreenCTM?.();
      const scales = { x: Math.hypot(matrix?.a || 1, matrix?.b || 0), y: Math.hypot(matrix?.c || 0, matrix?.d || 1) };
      const overlaps = point => others.some(other => Math.abs(point.x - other.x) < 84 && Math.abs(point.y - other.y) < 84);
      for (const axis of ['x', 'y']) {
        const targets = others.map(other => ({
          key: `center:${axis}:${other.id}`, kind: 'center', priority: 2,
          axis, value: other[axis], reference: other
        }));
        targets.push(...this.spacingSnapTargets(node, result, axis));
        if (axis === 'y') targets.push(...this.wireSnapTargets(node, result));
        // 吸着は画面上7px以内。14px離すまで保持し、境界での細かな振動を防ぐ。
        const candidates = targets.filter(target => {
          const threshold = (previous[axis] === target.key ? 14 : 7) / scales[axis];
          return Math.abs(target.value - position[axis]) <= threshold;
        }).sort((left, right) => {
          const held = Number(previous[axis] === right.key) - Number(previous[axis] === left.key);
          return left.priority - right.priority || held || Math.abs(left.value - position[axis]) - Math.abs(right.value - position[axis]);
        });
        const target = candidates.find(target => {
          const candidate = { ...result, [axis]: target.value };
          return candidate.x >= 45 && candidate.x <= WIDTH - 45 && candidate.y >= 42 && candidate.y <= HEIGHT - 42 && !overlaps(candidate);
        });
        if (!target) continue;
        result[axis] = target.value;
        gesture.snap[axis] = target.key;
        gesture.guides.push(target);
      }
      return result;
    }

    wireSnapTargets(node, position) {
      if (!node.id) return []; // 追加中の部品には、まだ接続されている配線がない。
      const targets = [];
      this.graph.wires.forEach(wire => {
        if (wire.from !== node.id && wire.to !== node.id) return;
        const source = this.findNode(wire.from);
        const destination = this.findNode(wire.to);
        if (!source || !destination) return;
        const offset = this.inputPoint(destination, Number(wire.port)).y - destination.y;
        const value = wire.from === node.id ? destination.y + offset : source.y - offset;
        const moved = { ...node, ...position, y: value };
        const from = this.outputPoint(wire.from === node.id ? moved : source);
        const to = this.inputPoint(wire.to === node.id ? moved : destination, Number(wire.port));
        if (to.x - from.x < 18) return;
        const segments = routeSegments([from, to]);
        const obstacles = this.routingObstacles(new Set([wire.from, wire.to]));
        if (routeObstaclePenalty(segments, obstacles) > 0) return;
        targets.push({ key: `wire:${wire.id}`, kind: 'wire', priority: 0, axis: 'y', value, from, to });
      });
      return targets;
    }

    spacingSnapTargets(node, position, axis) {
      const across = axis === 'x' ? 'y' : 'x';
      // 同じ列・行にある隣同士の部品だけを比較し、遠い列の偶然の一致を避ける。
      const row = this.graph.nodes.filter(other => other.id !== node.id && Math.abs(other[across] - position[across]) <= 28)
        .sort((left, right) => left[axis] - right[axis]);
      const targets = [];
      for (let index = 1; index < row.length; index++) {
        const a = row[index - 1];
        const b = row[index];
        if (Math.abs(a[across] - b[across]) > 28) continue;
        const values = [(a[axis] + b[axis]) / 2, 2 * a[axis] - b[axis], 2 * b[axis] - a[axis]];
        values.forEach((value, mode) => {
          const coordinates = [a[axis], b[axis], value].sort((left, right) => left - right);
          if (coordinates[1] - coordinates[0] < 84) return;
          if (row.some(other => other !== a && other !== b && other[axis] > coordinates[0] && other[axis] < coordinates[2])) return;
          targets.push({ key: `spacing:${axis}:${a.id}:${b.id}:${mode}`, kind: 'spacing', priority: 1, axis, value, references: [a, b] });
        });
      }
      return targets;
    }

    drawAlignmentGuides() {
      const gesture = this.drag?.moved ? this.drag : this.paletteDrag;
      const node = this.drag?.moved ? this.findNode(this.drag.nodeId) : this.paletteDrag?.position;
      if (!node || !gesture?.guides?.length) return;
      gesture.guides.forEach(guide => {
        if (guide.kind === 'spacing') {
          this.drawSpacingGuide(node, guide);
          return;
        }
        if (guide.kind === 'wire') {
          const group = Renderer.svgElement('g', {
            class: 'logic-editor-alignment-guide logic-editor-alignment-guide--wire',
            'data-axis': 'y', 'data-kind': 'wire', 'aria-hidden': 'true'
          });
          group.append(
            Renderer.svgElement('line', { x1: guide.from.x - 8, x2: guide.to.x + 8, y1: guide.from.y - 9, y2: guide.from.y - 9, 'vector-effect': 'non-scaling-stroke' }),
            Renderer.svgElement('text', { class: 'logic-editor-guide-label', x: (guide.from.x + guide.to.x) / 2, y: Math.max(18, guide.from.y - 34), 'text-anchor': 'middle' }, '直線')
          );
          this.svg.appendChild(group);
          return;
        }
        const vertical = guide.axis === 'x';
        const along = vertical ? 'y' : 'x';
        const from = Math.max(8, Math.min(node[along], guide.reference[along]) - 44);
        const to = Math.min((vertical ? HEIGHT : WIDTH) - 8, Math.max(node[along], guide.reference[along]) + 44);
        this.svg.appendChild(Renderer.svgElement('line', {
          class: 'logic-editor-alignment-guide',
          x1: vertical ? guide.value : from, y1: vertical ? from : guide.value,
          x2: vertical ? guide.value : to, y2: vertical ? to : guide.value,
          'data-axis': guide.axis, 'data-kind': 'center', 'aria-hidden': 'true', 'vector-effect': 'non-scaling-stroke'
        }));
      });
    }

    drawSpacingGuide(node, guide) {
      const horizontal = guide.axis === 'x';
      const across = horizontal ? 'y' : 'x';
      const nodes = [...guide.references, node].sort((left, right) => left[guide.axis] - right[guide.axis]);
      const baseline = clamp(Math.min(...nodes.map(item => item[across])) - 54, 24, (horizontal ? HEIGHT : WIDTH) - 24);
      const group = Renderer.svgElement('g', {
        class: 'logic-editor-alignment-guide', 'data-axis': guide.axis, 'data-kind': 'spacing', 'aria-hidden': 'true'
      });
      group.appendChild(Renderer.svgElement('line', {
        x1: horizontal ? nodes[0].x : baseline, y1: horizontal ? baseline : nodes[0].y,
        x2: horizontal ? nodes[2].x : baseline, y2: horizontal ? baseline : nodes[2].y,
        'vector-effect': 'non-scaling-stroke'
      }));
      nodes.forEach(item => group.appendChild(Renderer.svgElement('line', {
        x1: horizontal ? item.x : baseline - 5, y1: horizontal ? baseline - 5 : item.y,
        x2: horizontal ? item.x : baseline + 5, y2: horizontal ? baseline + 5 : item.y,
        'vector-effect': 'non-scaling-stroke'
      })));
      const labelOnRight = !horizontal && baseline < 56;
      group.appendChild(Renderer.svgElement('text', {
        class: 'logic-editor-guide-label',
        x: horizontal ? nodes[1].x : labelOnRight ? Math.max(...nodes.map(item => item.x)) + 54 : baseline - 8,
        y: horizontal ? baseline - 8 : nodes[1].y - 8,
        'text-anchor': horizontal ? 'middle' : labelOnRight ? 'start' : 'end'
      }, '等間隔'));
      this.svg.appendChild(group);
    }

    handlePointerMove(event) {
      if (this.paletteDrag?.pointerId === event.pointerId) {
        event.preventDefault();
        const gesture = this.paletteDrag;
        if (Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y) > 5) gesture.moved = true;
        const position = this.paletteDropPoint(event);
        gesture.position = position ? this.snapPosition({ type: gesture.gate }, position, gesture, event.altKey) : null;
        if (!position) { gesture.snap = {}; gesture.guides = []; }
        gesture.button.classList.toggle('is-dragging', gesture.moved);
        if (gesture.moved) this.render({ notify: false });
        return;
      }
      if (this.pan?.pointerId === event.pointerId) {
        event.preventDefault();
        const pan = this.pan;
        this.canvasWrap.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
        const desiredTop = pan.scrollTop - (event.clientY - pan.y);
        const maximumTop = this.canvasWrap.scrollHeight - this.canvasWrap.clientHeight;
        this.canvasWrap.scrollTop = clamp(desiredTop, 0, maximumTop);
        // 回路内を端までスクロールしたら、残りは外側のスライドへ渡す。
        if (pan.slide) pan.slide.scrollTop = pan.slideTop + desiredTop - this.canvasWrap.scrollTop;
        return;
      }
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
      if (!this.drag.moved) {
        if (Math.hypot(dx, dy) <= 3) return;
        this.drag.moved = true;
      }
      const position = this.snapPosition(node, { x: this.drag.originalX + dx, y: this.drag.originalY + dy }, this.drag, event.altKey);
      Object.assign(node, position);
      this.render({ notify: false });
    }

    handlePointerUp(event) {
      if (this.paletteDrag?.pointerId === event.pointerId) {
        this.finishPaletteDrag(event);
        return;
      }
      if (this.pan?.pointerId === event.pointerId) {
        this.pan = null;
        return;
      }
      if (this.connectionDrag && event.pointerId === this.connectionDrag.pointerId) {
        const gesture = this.connectionDrag;
        this.connectionDrag = null;
        if (gesture.moved) {
          const dropped = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.logic-editor-port');
          const targetKind = this.svg.contains(dropped) ? dropped?.getAttribute('data-kind') : null;
          const targetNodeId = dropped?.getAttribute('data-node-id');
          const targetPort = Number(dropped?.getAttribute('data-port') || 0);
          const rewireWire = gesture.rewireWireId
            ? this.graph.wires.find(wire => wire.id === gesture.rewireWireId)
            : null;
          if (rewireWire && targetKind === 'input' && !gesture.rewireSourceOnly) {
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
      // 高速なドラッグやタッチでmoveが間引かれても、離した位置で確定する。
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) this.handlePointerMove(event);
      const drag = this.drag;
      this.drag = null;
      if (drag.moved) {
        const node = this.findNode(drag.nodeId);
        if (node && (node.x !== drag.originalX || node.y !== drag.originalY)) {
          // 確定するまで履歴に触れず、キャンセル時はRedoもそのまま残す。
          const position = { x: node.x, y: node.y };
          Object.assign(node, { x: drag.originalX, y: drag.originalY });
          this.checkpoint();
          Object.assign(node, position);
          this.commit('部品を移動しました。');
        } else this.render({ notify: false });
      } else if (drag.inputClick) {
        this.toggleInput(drag.nodeId);
      } else {
        this.render();
      }
    }

    handleDocumentKeyDown(event) {
      if (this.destroyed) return;
      if (document.activeElement?.closest?.('dialog[open]')) return;
      if (this.paletteDrag) {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.finishPaletteDrag({ pointerId: this.paletteDrag.pointerId }, true);
        }
        return;
      }
      if (this.drag) {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.cancelPointerGesture({ pointerId: this.drag.pointerId });
        }
        return;
      }
      const withinEditor = this.container.contains(document.activeElement) || this.drag || this.connectionDrag;
      if (event.key === 'Escape' && this.help.open && withinEditor) {
        this.help.open = false;
        this.help.querySelector('summary').focus();
        return;
      }
      if (event.key === 'Escape' && (this.pendingFrom || this.pendingRewire || this.connectionDrag)) {
        this.pendingFrom = null;
        this.pendingRewire = null;
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

    cancelPointerGesture(event) {
      if (this.paletteDrag?.pointerId === event.pointerId) {
        this.finishPaletteDrag(event, true);
        return;
      }
      if (this.pan?.pointerId === event.pointerId) {
        this.pan = null;
        return;
      }
      if (this.drag?.pointerId === event.pointerId) {
        const node = this.findNode(this.drag.nodeId);
        if (node) Object.assign(node, { x: this.drag.originalX, y: this.drag.originalY });
        this.drag = null;
      } else if (this.connectionDrag?.pointerId === event.pointerId) {
        this.connectionDrag = null;
      } else return;
      this.pendingFrom = null;
      this.notice = '操作をキャンセルしました。';
      this.render();
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
        'data-wire-id': wire.id,
        'data-focus-key': `wire-${wire.id}`,
        d: pathData,
        tabindex: 0,
        role: 'button',
        'aria-label': `${fromNode.name || fromNode.type}から${toNode.name || toNode.type}への配線${value == null ? '' : `、信号${value}`}。選択して両端の付け替えや削除ができます`
      });
      const select = event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === 'pointerdown') this.canvasWrap.focus({ preventScroll: true });
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
        'data-node-id': node.id,
        'data-focus-key': `node-${node.id}`,
        transform: `translate(${node.x} ${node.y})`,
        tabindex: 0,
        role: 'button',
        'aria-label': node.type === 'input'
          ? `入力${node.name}、現在${this.inputValues[node.name]}。クリックで切り替え、ドラッグで移動`
          : node.type === 'output' ? `出力${node.name}。ドラッグで移動` : `${node.type}ゲート。クリックまたはEnterで選択、ドラッグで移動`
      });
      group.addEventListener('pointerdown', event => this.startDrag(event, node));
      group.addEventListener('keydown', event => {
        if (node.type === 'input' && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          this.selected = { kind: 'node', id: node.id };
          this.toggleInput(node.id);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.selected = { kind: 'node', id: node.id };
          this.pendingFrom = null;
          this.pendingRewire = null;
          this.render();
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && this.canDeleteNode(node)) {
          event.preventDefault();
          event.stopPropagation();
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
          Renderer.svgElement('text', { class: 'logic-editor-node__label', x: 0, y: value == null ? 7 : -4, 'text-anchor': 'middle' }, node.name)
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
      const focusedKey = this.svg.contains(document.activeElement)
        ? document.activeElement.getAttribute('data-focus-key') : null;
      const analysis = this.getAnalysis();
      const signals = this.evaluateSignals();
      const background = Renderer.svgElement('rect', {
        class: 'logic-editor__background',
        x: 0,
        y: 0,
        width: WIDTH,
        height: HEIGHT,
        rx: 12
      });
      background.addEventListener('pointerdown', event => {
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          const slide = this.container.closest('.lesson-slide');
          this.pan = {
            pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            scrollLeft: this.canvasWrap.scrollLeft, scrollTop: this.canvasWrap.scrollTop,
            slide, slideTop: slide?.scrollTop || 0
          };
          this.svg.setPointerCapture?.(event.pointerId);
        }
        this.pendingFrom = null;
        this.pendingRewire = null;
        this.connectionDrag = null;
        this.selected = null;
        this.notice = '選択を解除しました。';
        this.render();
      });
      const title = Renderer.svgElement('title', {}, '自由に編集できる論理回路');
      const desc = Renderer.svgElement('desc', {}, '左に入力、右に出力があります。端子を順に選ぶか端子間をドラッグして接続します。接続済み入力端子のドラッグで配線を付け替えられます。配線は重なりを避け、同じ出力からは途中で分岐します。');
      this.svg.replaceChildren(title, desc, background);
      this.drawAlignmentGuides();
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
      this.drawPalettePreview();

      const completion = analysis.valid
        ? '回路が完成しました。入力を切り替えたり、真理値表を確認したりできます。'
        : `回路が完成していません：${analysis.errors[0] || 'ゲートを配置してFへ接続してください。'}`;
      this.status.classList.toggle('is-complete', analysis.valid);
      this.status.textContent = this.notice ? `${this.notice}　${completion}` : completion;
      this.updateToolbar(analysis);
      if (focusedKey) {
        const nextFocus = Array.from(this.svg.querySelectorAll('[data-focus-key]'))
          .find(node => node.getAttribute('data-focus-key') === focusedKey);
        (nextFocus || this.canvasWrap).focus({ preventScroll: true });
      }
      if (options.notify !== false && typeof this.options.onChange === 'function') {
        this.options.onChange(this.getState());
      }
    }

    updateToolbar(analysis = this.getAnalysis()) {
      this.undoButton.disabled = this.historyIndex <= 0;
      this.redoButton.disabled = this.historyIndex >= this.history.length - 1;
      const selectedNode = this.selected?.kind === 'node' ? this.findNode(this.selected.id) : null;
      this.deleteButton.disabled = this.selected?.kind !== 'wire' && !this.canDeleteNode(selectedNode);
      const canSwap = selectedNode && ['AND', 'OR'].includes(selectedNode.type);
      this.swapButton.disabled = !canSwap;
      const swapLabel = canSwap ? `${selectedNode.type === 'AND' ? 'OR' : 'AND'}に変更` : 'AND ⇄ OR';
      if (this.fileSaveButton) this.swapButton.setAttribute('aria-label', canSwap ? swapLabel : 'ANDとORを交換');
      else this.swapButton.textContent = swapLabel;
      this.swapButton.title = canSwap ? '接続と位置を保ってゲートを交換' : 'ANDまたはORゲートを選ぶと交換できます';
      if (this.addInputButton) {
        const nextName = this.availableInputNames.find(name => !this.inputNames.includes(name));
        this.addInputButton.disabled = !nextName;
        this.addInputButton.textContent = nextName ? `＋ 入力${nextName}` : '入力A〜D';
        this.addInputButton.setAttribute('aria-label', nextName ? `入力${nextName}を追加` : '入力はすべて追加済みです');
      }
      if (this.addOutputButton) {
        const count = this.graph.nodes.filter(node => node.type === 'output').length;
        this.addOutputButton.title = `出力${Core.outputName(count, count + 1)}を追加`;
      }
      if (this.exportButton) {
        this.exportButton.disabled = !analysis.valid || this.savingPng;
        this.exportButton.title = analysis.valid ? 'SVG・PNGの形式と0/1の有無を選んで出力' : '回路が完成すると画像を出力できます';
      }
    }

    getAnalysis(inputNames) {
      return Core.graphAnalysis(this.graph, inputNames, { allowMultipleOutputs: Boolean(this.options.allowMultipleOutputs) });
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

    // 保存モジュールで検証済みのデータを適用する。置換前へUndoで戻せる。
    loadSnapshot(snapshot) {
      this.checkpoint();
      this.restore(snapshot);
      this.commit('保存した回路を読み込みました。Undoで読み込み前に戻せます。');
    }

    checkpoint() {
      // 真理値表からの入力変更など、まだ履歴にない現在値も置換前に残す。
      if (this.historyIndex >= 0 && JSON.stringify(this.snapshot()) !== JSON.stringify(this.history[this.historyIndex])) this.commit(this.notice);
    }

    loadExpression(expression, options = {}) {
      const parsed = Core.parseAndAnalyze(expression);
      const missing = parsed.inputs.filter(name => !this.availableInputNames.includes(name));
      if (missing.length) throw new Error(`利用できない入力「${missing.join('、')}」が含まれています。`);
      if (options.resetHistory === false) this.checkpoint();
      this.inputNames = this.availableInputNames.filter(name => this.inputNames.includes(name) || parsed.inputs.includes(name));
      this.inputNames.forEach(name => { this.inputValues[name] ??= 0; });
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
      let success = false;
      try {
        this.exportSvg();
        this.notice = '回路図をSVGとして保存しました。';
        success = true;
      } catch (error) {
        this.notice = `SVGを保存できません：${error.message}`;
      }
      this.render({ notify: false });
      return success;
    }

    exportSvg() {
      const { svg, title } = this.createExportDiagram();
      return Renderer.downloadSvg(svg, title);
    }

    async savePng() {
      if (this.savingPng) return false;
      this.savingPng = true;
      this.updateToolbar();
      try {
        const { svg, title } = this.createExportDiagram();
        await Renderer.downloadPng(svg, title);
        this.notice = '回路図をPNGとして保存しました。';
        return true;
      } catch (error) {
        this.notice = `PNGを保存できません：${error.message}`;
        return false;
      } finally {
        this.savingPng = false;
        if (!this.destroyed) this.render({ notify: false });
      }
    }

    createExportDiagram() {
      const analysis = this.getAnalysis();
      if (!analysis.valid) throw new Error(analysis.errors[0] || '回路が完成していません。');
      const temporary = document.createElement('div');
      const title = `論理回路：${analysis.outputs.map(output => output.name).join('、')}`;
      const graph = { nodes: this.graph.nodes.filter(node => analysis.reachable.has(node.id)), wires: this.graph.wires };
      const rendered = Renderer.renderGraphCircuit(temporary, graph, this.computeWireRouting(), {
        signals: this.evaluateSignals(), showSignals: this.exportShowSignals, title
      });
      return { svg: rendered.svg, title };
    }

    destroy() {
      if (this.paletteDrag) this.finishPaletteDrag({ pointerId: this.paletteDrag.pointerId }, true);
      this.destroyed = true;
      document.removeEventListener('pointermove', this.boundPointerMove);
      document.removeEventListener('pointerup', this.boundPointerUp);
      document.removeEventListener('pointercancel', this.boundPointerCancel);
      document.removeEventListener('pointerdown', this.boundOutsideHelp, true);
      document.removeEventListener('keydown', this.boundKeyDown);
      clearTimeout(this.helpCloseTimer);
    }
  }

  root.LogicEditor = LogicEditor;
})(typeof globalThis !== 'undefined' ? globalThis : window);
