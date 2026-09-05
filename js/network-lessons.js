// ./js/network-lessons.js
(() => {
  'use strict';

  const GROUP_SELECTOR = '[data-network-reveal-group]';
  const REVEAL_SELECTOR = '[data-network-reveal]';
  const TRANSMISSION_SELECTOR = '[data-network-transmission]';
  const PROTOCOL_SELECTOR = '[data-network-protocol]';
  const LAYER_JOURNEY_SELECTOR = '[data-network-layer-journey]';
  const REVIEW_TERMS_SELECTOR = '[data-network-review-terms]';
  const INTERFACE_FLOW_SELECTOR = '[data-network-interface-flow]';
  const MEDIUM_DEMO_SELECTOR = '[data-network-medium-demo]';
  const SWITCH_DEMO_SELECTOR = '[data-network-switch-demo]';
  const STEP_DEMO_SELECTOR = '[data-network-step-demo]';
  const QUIZ_SELECTOR = '[data-network-quiz]';
  const CONTENT_RESIZE_EVENT = 'joho:lesson-content-resize';
  const REVEAL_CHANGE_EVENT = 'joho:network-reveal-change';

  const PROTOCOL_VISUAL_DESCRIPTIONS = {
    physical: 'ケーブルのコネクタと無線の電波',
    partner: '端末Bの宛先IPアドレス',
    packet: '送信データに付加するヘッダ情報',
    reliability: '壊れたパケットの検出と再送',
    security: '通信を守る鍵'
  };

  const INTERFACE_FLOW_STEPS = [
    '上の階層から、相手へ送りたいデータを受け取ります。',
    '同じLAN内で届けられるように、宛先などの情報を付け加えます。',
    'データと届けるための情報を、機器が扱える0と1の並びにします。',
    '0と1を電気・光・電波の変化にして、ケーブルや空間へ送り出します。'
  ];

  const SWITCH_DEMO_STEPS = [
    {
      title: '送信前',
      description: '表にはまだ何も記録されていません。',
      rows: [],
      ports: [],
      movers: [],
      results: []
    },
    {
      title: 'PC1から送信',
      description: 'PC1が、PC2宛のデータをポートAへ送ります。',
      rows: [],
      ports: ['a'],
      movers: ['outbound'],
      results: []
    },
    {
      title: 'PC1を記録',
      description: '受け取ったポートAと、送信元PC1のMACアドレスを記録します。',
      rows: ['pc1'],
      ports: ['a'],
      movers: [],
      results: []
    },
    {
      title: '複数のポートへ転送',
      description: 'PC2の場所は未登録なので、BとCへコピーを送ります。PC2は受信し、PC3は破棄します。',
      rows: ['pc1'],
      ports: ['b', 'c'],
      movers: ['flood-b', 'flood-c'],
      results: ['received', 'discard']
    },
    {
      title: 'PC2から返信',
      description: 'PC2の返信を受け取り、PC2がポートBにいることを記録します。',
      rows: ['pc1', 'pc2'],
      ports: ['b'],
      movers: ['reply-in'],
      results: []
    },
    {
      title: '記録を使って転送',
      description: 'PC1はポートAにいると分かっているので、返信をAだけへ送ります。',
      rows: ['pc1', 'pc2'],
      ports: ['a'],
      movers: ['reply-out'],
      results: []
    }
  ];

  const LAYER_JOURNEY_STEPS = [
    {
      phase: 'send',
      side: 'send',
      layer: 'application',
      x: 120,
      y: 55,
      segments: ['data'],
      action: '送るデータ',
      packetLabel: '送信するデータ',
      description: '送信側の第4層で、アプリケーションがデータを用意しています。'
    },
    {
      phase: 'send',
      side: 'send',
      layer: 'transport',
      x: 120,
      y: 85,
      segments: ['data', 'transport'],
      action: 'TCP/UDPヘッダを付ける',
      packetLabel: 'データにTCPまたはUDPのヘッダを付けた状態',
      description: '送信側の第3層で、データにTCPまたはUDPのヘッダを付けています。'
    },
    {
      phase: 'send',
      side: 'send',
      layer: 'internet',
      x: 120,
      y: 115,
      segments: ['data', 'transport', 'internet'],
      action: 'IPヘッダを付ける',
      packetLabel: 'データにTCPまたはUDPのヘッダとIPヘッダを付けた状態',
      description: '送信側の第2層で、宛先ネットワークを示すIPヘッダを付けています。'
    },
    {
      phase: 'send',
      side: 'send',
      layer: 'interface',
      x: 120,
      y: 145,
      segments: ['data', 'transport', 'internet', 'interface'],
      action: 'イーサネットヘッダを付ける',
      packetLabel: 'データに三つのヘッダを付けた状態',
      description: '送信側の第1層で、次の機器へ渡すためのイーサネットヘッダを付けています。'
    },
    {
      phase: 'medium',
      side: null,
      layer: null,
      x: 260,
      y: 170,
      segments: [],
      action: '0/1のビット列を信号に変換',
      packetLabel: '0と1のビット列を二つの高さで表した信号',
      description: '0と1のビット列を信号へ変換し、送信側から受信側へ伝送しています。'
    },
    {
      phase: 'receive',
      side: 'receive',
      layer: 'interface',
      x: 400,
      y: 145,
      segments: ['data', 'transport', 'internet', 'interface'],
      reading: 'interface',
      action: 'イーサネットヘッダを読んで外す',
      packetLabel: '受信側でイーサネットヘッダを読み取っている状態',
      description: '受信側の第1層で、信号をビット列へ戻し、イーサネットヘッダを読んで外します。'
    },
    {
      phase: 'receive',
      side: 'receive',
      layer: 'internet',
      x: 400,
      y: 115,
      segments: ['data', 'transport', 'internet'],
      reading: 'internet',
      action: 'IPヘッダを読んで外す',
      packetLabel: '受信側でIPヘッダを読み取っている状態',
      description: '受信側の第2層で、IPヘッダを読んで外し、上の層へ渡します。'
    },
    {
      phase: 'receive',
      side: 'receive',
      layer: 'transport',
      x: 400,
      y: 85,
      segments: ['data', 'transport'],
      reading: 'transport',
      action: 'TCP/UDPヘッダを読んで外す',
      packetLabel: '受信側でTCPまたはUDPのヘッダを読み取っている状態',
      description: '受信側の第3層で、TCPまたはUDPのヘッダを読んで外し、データを結合します。'
    },
    {
      phase: 'receive',
      side: 'receive',
      layer: 'application',
      x: 400,
      y: 55,
      segments: ['data'],
      action: '元のデータを受け取る',
      packetLabel: '受信側のアプリケーションへ届いた元のデータ',
      description: '受信側の第4層で、アプリケーションが元のデータを受け取っています。'
    }
  ];

  const TRANSMISSION_STEPS = {
    circuit: [
      {
        title: '送るデータ',
        narration: '端末Aから宛先Aへ、ひとまとまりのデータを送ります。',
        description: '端末Aから宛先Aへデータを送る前の状態です。'
      },
      {
        title: '通信の準備',
        narration: '通信を始める前に、端末Aから宛先Aまでの1本の経路を確保します。',
        description: '端末Aと宛先Aの間に、通信中だけ占有する経路が示されています。'
      },
      {
        title: 'ネットワーク内を送る',
        narration: '確保した同じ経路を、データに見立てた点の列が途切れずに進みます。',
        description: '確保された1本の経路上を、データを表す点の列が移動します。'
      },
      {
        title: '回線の共有',
        narration: '通信中はこの経路を占有します。同じ回線を使いたい端末Bは、空くまで待ちます。',
        description: '端末Aが経路を占有しているため、端末Bは空くまで待っています。'
      },
      {
        title: '受信と終了',
        narration: '宛先Aがデータを受け取って通信が終わると、確保していた経路を解放します。',
        description: '宛先Aがデータを受け取り、専用の経路が解放された状態です。'
      }
    ],
    packet: [
      {
        title: '送るデータ',
        narration: '端末Aから宛先Aへ、ひとまとまりのデータを送ります。',
        description: '端末Aから宛先Aへデータを送る前の状態です。'
      },
      {
        title: '通信の準備',
        narration: 'データをA1〜A4に分割し、それぞれに宛先と順番を示すヘッダ情報を付けます。',
        description: '端末AのデータがA1からA4までの小さなパケットに分割されています。'
      },
      {
        title: 'ネットワーク内を送る',
        narration: '交換機はヘッダ情報を見て、空いている経路へ各パケットを転送します。',
        description: 'A1からA4までのパケットが複数の異なる経路を進みます。'
      },
      {
        title: '回線の共有',
        narration: 'A宛とB宛の小包が回線を交互に使います。Aの小包はA2、A1、A4、A3の順に到着します。',
        description: 'A宛とB宛のパケットが回線を共有し、A宛のパケットは番号とは異なる順に到着します。'
      },
      {
        title: '受信と終了',
        narration: '宛先Aは番号を見てA1〜A4を正しい順に並べ、元のデータへ戻します。',
        description: '宛先Aがパケットを番号順に並べ直し、元のデータへ復元します。'
      }
    ]
  };

  const TRANSMISSION_VISUALS = {
    'source-data': (mode, step) => step === 0 || (mode === 'circuit' && step === 1),
    'circuit-route': (mode, step) => mode === 'circuit' && step >= 1 && step <= 3,
    'circuit-dots': (mode, step) => mode === 'circuit' && step === 2,
    'circuit-in-use': (mode, step) => mode === 'circuit' && step === 3,
    'circuit-wait': (mode, step) => mode === 'circuit' && step === 3,
    'circuit-received': (mode, step) => mode === 'circuit' && step === 4,
    'packet-split': (mode, step) => mode === 'packet' && step === 1,
    'packet-routes-a': (mode, step) => mode === 'packet' && (step === 2 || step === 3),
    'packet-routes-b': (mode, step) => mode === 'packet' && step === 3,
    'packet-movers-a': (mode, step) => mode === 'packet' && (step === 2 || step === 3),
    'packet-movers-b': (mode, step) => mode === 'packet' && step === 3,
    'packet-shared': (mode, step) => mode === 'packet' && step === 3,
    'packet-arrivals': (mode, step) => mode === 'packet' && step === 3,
    'packet-restored': (mode, step) => mode === 'packet' && step === 4,
    'packet-reassembly': (mode, step) => mode === 'packet' && step === 4
  };

  function revealNumber(button, fallbackIndex) {
    return button.querySelector('.nw-reveal__number')?.textContent?.trim() || String(fallbackIndex + 1);
  }

  function answerText(button) {
    return button.querySelector('.nw-reveal__answer')?.textContent?.trim() || '';
  }

  function notifyContentResize() {
    document.dispatchEvent(new CustomEvent(CONTENT_RESIZE_EVENT));
  }

  class NetworkRevealGroup {
    constructor(group) {
      if (!(group instanceof HTMLElement)) throw new TypeError('穴埋めのグループが必要です。');
      if (group.__networkRevealGroup) return group.__networkRevealGroup;

      this.group = group;
      this.buttons = Array.from(group.querySelectorAll(REVEAL_SELECTOR));
      this.toolbar = group.querySelector('[data-network-reveal-toolbar]');
      this.progress = this.toolbar?.querySelector('[data-network-reveal-progress]') || null;
      this.allButton = this.toolbar?.querySelector('[data-network-reveal-all]') || null;
      this.resetButton = this.toolbar?.querySelector('[data-network-reveal-reset]') || null;

      if (!this.buttons.length) throw new Error('穴埋めボタンが見つかりません。');

      this.prepare();
      this.bind();
      this.updateControls();
      group.__networkRevealGroup = this;
    }

    prepare() {
      this.buttons.forEach((button, index) => {
        const prompt = button.querySelector('.nw-reveal__prompt');
        const answer = button.querySelector('.nw-reveal__answer');
        const number = revealNumber(button, index);

        button.type = 'button';
        button.dataset.networkRevealReady = 'true';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', `空欄${number}の答えを表示`);
        button.classList.remove('is-revealed');
        if (prompt) prompt.hidden = false;
        if (answer) answer.hidden = true;
      });

      if (this.toolbar) this.toolbar.hidden = false;
    }

    bind() {
      this.buttons.forEach((button, index) => {
        button.addEventListener('click', () => this.reveal(button, index));
        button.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          this.reveal(button, index);
        });
      });

      this.allButton?.addEventListener('click', () => {
        this.buttons.forEach((button, index) => this.setRevealed(button, index, true));
        this.updateControls();
        this.emitChange('all');
        notifyContentResize();
      });

      this.resetButton?.addEventListener('click', () => {
        this.buttons.forEach((button, index) => this.setRevealed(button, index, false));
        this.updateControls();
        this.emitChange('reset');
        notifyContentResize();
      });
    }

    setRevealed(button, index, revealed) {
      const prompt = button.querySelector('.nw-reveal__prompt');
      const answer = button.querySelector('.nw-reveal__answer');
      const number = revealNumber(button, index);
      const answerLabel = answerText(button);

      button.classList.toggle('is-revealed', revealed);
      button.setAttribute('aria-pressed', String(revealed));
      button.setAttribute(
        'aria-label',
        revealed ? `空欄${number}の答え：${answerLabel}` : `空欄${number}の答えを表示`
      );
      if (prompt) prompt.hidden = revealed;
      if (answer) answer.hidden = !revealed;
    }

    reveal(button, index) {
      if (button.classList.contains('is-revealed')) return;
      this.setRevealed(button, index, true);
      this.updateControls();
      this.emitChange('reveal', button);
      notifyContentResize();
    }

    emitChange(action, button = null) {
      this.group.dispatchEvent(new CustomEvent(REVEAL_CHANGE_EVENT, {
        detail: { action, button }
      }));
    }

    updateControls() {
      const revealedCount = this.buttons.filter(button => button.classList.contains('is-revealed')).length;
      if (this.progress) this.progress.textContent = `${revealedCount} / ${this.buttons.length}`;
      if (this.allButton) this.allButton.disabled = revealedCount === this.buttons.length;
      if (this.resetButton) this.resetButton.disabled = revealedCount === 0;
    }
  }

  class NetworkProtocol {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('プロトコルの図が必要です。');
      if (root.__networkProtocol) return root.__networkProtocol;

      this.root = root;
      this.group = root.closest(GROUP_SELECTOR);
      if (!this.group) throw new Error('プロトコルの穴埋めグループが見つかりません。');

      this.roleButtons = Array.from(root.querySelectorAll('[data-protocol-role]'));
      this.visuals = new Map(
        Array.from(root.querySelectorAll('[data-protocol-visual]'))
          .map(visual => [visual.dataset.protocolVisual, visual])
      );
      this.details = new Map(
        Array.from(root.querySelectorAll('[data-protocol-detail]'))
          .map(detail => [detail.dataset.protocolDetail, detail])
      );
      this.description = root.querySelector('[data-protocol-description]');
      this.summary = root.querySelector('[data-protocol-summary]');
      this.currentKey = 'intro';
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

      if (this.roleButtons.length !== this.visuals.size) {
        throw new Error('プロトコルの役割と図の数が一致しません。');
      }

      this.prepare();
      this.group.addEventListener(REVEAL_CHANGE_EVENT, event => this.handleRevealChange(event));
      root.__networkProtocol = this;
    }

    prepare() {
      this.root.dataset.networkProtocolReady = 'true';
      this.render('intro');
    }

    handleRevealChange(event) {
      const action = event.detail?.action;
      const button = event.detail?.button;
      const key = button?.dataset.protocolKey;
      const role = button?.dataset.protocolRole;

      if (action === 'reset') {
        this.currentKey = 'intro';
      } else if (action === 'all') {
        this.currentKey = 'complete';
      } else if (key && this.details.has(key)) {
        this.currentKey = key;
      }

      this.render(this.currentKey, action === 'reveal' ? role : null);
    }

    render(detailKey, animatedRole = null) {
      const revealedRoles = new Set(
        this.roleButtons
          .filter(button => button.classList.contains('is-revealed'))
          .map(button => button.dataset.protocolRole)
      );

      this.visuals.forEach((visual, role) => {
        const visible = revealedRoles.has(role);
        visual.toggleAttribute('hidden', !visible);
        visual.classList.remove('is-animating');
        if (visible && role === animatedRole && !this.reducedMotion) {
          void visual.getBoundingClientRect();
          visual.classList.add('is-animating');
        }
      });

      this.roleButtons.forEach(button => {
        button.classList.toggle('is-protocol-current', button.dataset.protocolKey === detailKey);
      });

      this.details.forEach((detail, key) => {
        detail.hidden = key !== detailKey;
      });

      const allRolesRevealed = this.roleButtons.every(button => button.classList.contains('is-revealed'));
      if (this.summary) this.summary.hidden = !allRolesRevealed;
      this.updateDescription(revealedRoles);
    }

    updateDescription(revealedRoles) {
      if (!this.description) return;
      const visibleDescriptions = Object.entries(PROTOCOL_VISUAL_DESCRIPTIONS)
        .filter(([role]) => revealedRoles.has(role))
        .map(([, description]) => description);

      this.description.textContent = visibleDescriptions.length
        ? `端末Aと端末Bを結ぶ通信に、${visibleDescriptions.join('、')}が示されています。`
        : '端末Aと端末Bがネットワークでつながっています。番号を選ぶと、通信を支える約束が図に加わります。';
    }
  }

  class NetworkLayerJourney {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('プロトコル階層の図が必要です。');
      if (root.__networkLayerJourney) return root.__networkLayerJourney;

      this.root = root;
      this.step = Math.min(
        LAYER_JOURNEY_STEPS.length - 1,
        Math.max(0, Number.parseInt(root.dataset.step || '0', 10) || 0)
      );
      this.renderedStep = null;
      this.controls = root.querySelector('[data-layer-journey-controls]');
      this.previousButton = root.querySelector('[data-layer-journey-prev]');
      this.nextButton = root.querySelector('[data-layer-journey-next]');
      this.resetButton = root.querySelector('[data-layer-journey-reset]');
      this.stepIndex = root.querySelector('[data-layer-journey-index]');
      this.layerChoices = Array.from(root.querySelectorAll('[data-layer-choice]'));
      this.routeNodes = Array.from(root.querySelectorAll('[data-layer-route-node]'));
      this.traveler = root.querySelector('[data-layer-traveler]');
      this.routeSignal = root.querySelector('[data-layer-route-signal]');
      this.routeDescription = root.querySelector('[data-layer-route-description]');
      this.packet = root.querySelector('[data-layer-packet]');
      this.packetAction = root.querySelector('[data-layer-packet-action]');
      this.packetSegments = Array.from(root.querySelectorAll('[data-layer-segment]'));
      this.binarySignal = root.querySelector('[data-layer-binary-signal]');
      this.stepDetails = Array.from(root.querySelectorAll('[data-layer-journey-step]'));
      this.summary = root.querySelector('[data-layer-journey-summary]');
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

      if (this.layerChoices.length !== 4 || this.stepDetails.length !== LAYER_JOURNEY_STEPS.length) {
        throw new Error('プロトコル階層の役割または段階が不足しています。');
      }

      this.bind();
      this.root.dataset.networkLayerJourneyReady = 'true';
      if (this.controls) this.controls.hidden = false;
      this.render(false);
      root.__networkLayerJourney = this;
    }

    bind() {
      this.previousButton?.addEventListener('click', () => this.setStep(this.step - 1));
      this.nextButton?.addEventListener('click', () => this.setStep(this.step + 1));
      this.resetButton?.addEventListener('click', () => this.setStep(0));
      this.controls?.addEventListener('keydown', event => {
        const keys = {
          ArrowLeft: this.step - 1,
          ArrowRight: this.step + 1,
          Home: 0,
          End: LAYER_JOURNEY_STEPS.length - 1
        };
        if (!(event.key in keys)) return;
        event.preventDefault();
        this.setStep(keys[event.key]);
      });
    }

    setStep(nextStep) {
      const boundedStep = Math.min(LAYER_JOURNEY_STEPS.length - 1, Math.max(0, nextStep));
      if (boundedStep === this.step) return;
      this.step = boundedStep;
      this.render(true);
    }

    render(animate) {
      const previousStep = this.renderedStep;
      const step = LAYER_JOURNEY_STEPS[this.step];
      const previousSegments = new Set(
        previousStep === null ? [] : LAYER_JOURNEY_STEPS[previousStep].segments
      );
      const visibleSegments = new Set(step.segments);

      this.root.dataset.step = String(this.step);
      this.root.dataset.phase = step.phase;
      this.layerChoices.forEach(choice => {
        const current = choice.dataset.layerChoice === step.layer;
        choice.classList.toggle('is-current', current);
        if (current) {
          choice.setAttribute('aria-current', 'step');
        } else {
          choice.removeAttribute('aria-current');
        }
      });
      this.routeNodes.forEach(node => {
        node.classList.toggle(
          'is-current',
          node.dataset.layerRouteNode === step.layer && node.dataset.layerRouteSide === step.side
        );
      });

      if (this.traveler) {
        this.traveler.toggleAttribute('hidden', step.phase === 'medium');
        this.traveler.style.setProperty('--nw-layer-x', `${step.x}px`);
        this.traveler.style.setProperty('--nw-layer-y', `${step.y}px`);
      }
      if (this.routeSignal) this.routeSignal.toggleAttribute('hidden', step.phase !== 'medium');
      if (this.packet) {
        this.packet.hidden = step.phase === 'medium';
        this.packet.setAttribute('aria-label', step.packetLabel);
      }
      if (this.binarySignal) {
        this.binarySignal.hidden = step.phase !== 'medium';
        this.binarySignal.setAttribute('aria-label', step.packetLabel);
      }
      if (this.packetAction) this.packetAction.textContent = step.action;

      this.packetSegments.forEach(segment => {
        const key = segment.dataset.layerSegment;
        const visible = visibleSegments.has(key);
        segment.toggleAttribute('hidden', !visible);
        segment.classList.remove('is-entering');
        segment.classList.toggle('is-being-read', key === step.reading);
        if (animate && step.phase === 'send' && visible && !previousSegments.has(key) && !this.reducedMotion) {
          void segment.getBoundingClientRect();
          segment.classList.add('is-entering');
        }
      });

      this.stepDetails.forEach((detail, index) => {
        detail.hidden = index !== this.step;
      });
      if (this.summary) this.summary.hidden = this.step !== LAYER_JOURNEY_STEPS.length - 1;
      if (this.stepIndex) this.stepIndex.textContent = String(this.step + 1);
      if (this.previousButton) this.previousButton.disabled = this.step === 0;
      if (this.nextButton) this.nextButton.disabled = this.step === LAYER_JOURNEY_STEPS.length - 1;
      if (this.resetButton) this.resetButton.disabled = this.step === 0;
      if (this.routeDescription) this.routeDescription.textContent = step.description;

      this.root.classList.remove('is-signal-animating');
      if (animate && step.phase === 'medium' && !this.reducedMotion) {
        void this.root.getBoundingClientRect();
        this.root.classList.add('is-signal-animating');
      }

      this.renderedStep = this.step;
      notifyContentResize();
    }
  }

  class NetworkTransmission {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('伝送方式の比較領域が必要です。');
      if (root.__networkTransmission) return root.__networkTransmission;

      this.root = root;
      this.mode = root.dataset.mode in TRANSMISSION_STEPS ? root.dataset.mode : 'circuit';
      this.step = Math.min(4, Math.max(0, Number.parseInt(root.dataset.step || '0', 10) || 0));
      this.modeButtons = Array.from(root.querySelectorAll('[data-transmission-mode]'));
      this.definitions = Array.from(root.querySelectorAll('[data-transmission-definition]'));
      this.visuals = Array.from(root.querySelectorAll('[data-transmission-visual]'));
      this.paths = new Map(
        Array.from(root.querySelectorAll('[data-transmission-path]')).map(path => [path.dataset.transmissionPath, path])
      );
      this.movers = new Map(
        Array.from(root.querySelectorAll('[data-transmission-mover]')).map(mover => [mover.dataset.transmissionMover, mover])
      );
      this.arrivalSlots = new Map(
        Array.from(root.querySelectorAll('[data-transmission-arrival]')).map(slot => [slot.dataset.transmissionArrival, slot])
      );
      this.stepIndex = root.querySelector('[data-transmission-step-index]');
      this.stepTitle = root.querySelector('[data-transmission-step-title]');
      this.modeLabel = root.querySelector('[data-transmission-mode-label]');
      this.narration = root.querySelector('[data-transmission-narration]');
      this.description = root.querySelector('[data-transmission-description]');
      this.markers = Array.from(root.querySelectorAll('[data-transmission-step-marker]'));
      this.controls = root.querySelector('[data-transmission-controls]');
      this.previousButton = root.querySelector('[data-transmission-prev]');
      this.replayButton = root.querySelector('[data-transmission-replay]');
      this.nextButton = root.querySelector('[data-transmission-next]');
      this.animationFrame = 0;
      this.animationGeneration = 0;
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };

      if (this.modeButtons.length !== 2 || this.definitions.length !== 2) {
        throw new Error('2つの伝送方式がそろっていません。');
      }

      this.bind();
      this.root.classList.add('is-ready');
      if (this.controls) this.controls.hidden = false;
      this.render(false);
      root.__networkTransmission = this;
    }

    bind() {
      this.modeButtons.forEach(button => {
        button.addEventListener('click', () => {
          const mode = button.dataset.transmissionMode;
          if (!(mode in TRANSMISSION_STEPS) || mode === this.mode) return;
          this.mode = mode;
          this.step = 0;
          this.render(false);
        });
      });

      this.previousButton?.addEventListener('click', () => this.setStep(this.step - 1));
      this.nextButton?.addEventListener('click', () => this.setStep(this.step + 1));
      this.replayButton?.addEventListener('click', () => this.render(true));
    }

    setStep(nextStep) {
      const boundedStep = Math.min(4, Math.max(0, nextStep));
      if (boundedStep === this.step) return;
      this.step = boundedStep;
      this.render(true);
    }

    render(animate) {
      this.cancelAnimation();
      const stepContent = TRANSMISSION_STEPS[this.mode][this.step];
      const modeLabel = this.mode === 'circuit' ? '方式①' : '方式②';

      this.root.dataset.mode = this.mode;
      this.root.dataset.step = String(this.step);
      this.modeButtons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.transmissionMode === this.mode));
      });
      this.definitions.forEach(definition => {
        const active = definition.dataset.transmissionDefinition === this.mode;
        definition.hidden = !active;
        definition.classList.toggle('is-active', active);
      });
      this.visuals.forEach(visual => {
        const rule = TRANSMISSION_VISUALS[visual.dataset.transmissionVisual];
        visual.toggleAttribute('hidden', !(rule && rule(this.mode, this.step)));
      });

      if (this.stepIndex) this.stepIndex.value = String(this.step + 1);
      if (this.stepTitle) this.stepTitle.textContent = stepContent.title;
      if (this.modeLabel) this.modeLabel.textContent = modeLabel;
      if (this.narration) this.narration.textContent = stepContent.narration;
      if (this.description) this.description.textContent = stepContent.description;

      this.markers.forEach((marker, index) => {
        marker.classList.toggle('is-current', index === this.step);
        marker.classList.toggle('is-complete', index < this.step);
      });
      if (this.previousButton) this.previousButton.disabled = this.step === 0;
      if (this.nextButton) this.nextButton.disabled = this.step === 4;
      if (this.replayButton) this.replayButton.disabled = !this.hasAnimation();

      this.resetMoverState();
      if (animate && this.hasAnimation()) this.animateStep();
      notifyContentResize();
    }

    hasAnimation() {
      return (this.mode === 'circuit' && this.step === 2)
        || (this.mode === 'packet' && (this.step === 2 || this.step === 3));
    }

    resetMoverState() {
      this.root.classList.remove('is-animating', 'is-animation-complete');
      this.movers.forEach(mover => {
        mover.classList.remove('is-arrived');
        mover.removeAttribute('transform');
        mover.style.removeProperty('opacity');
      });
      this.arrivalSlots.forEach(slot => slot.classList.remove('is-arrived'));
    }

    animationPlan() {
      if (this.mode === 'circuit' && this.step === 2) {
        return [
          ['circuit-1', 0, .83, 0, 1000],
          ['circuit-2', 0, .75, 90, 1000],
          ['circuit-3', 0, .67, 180, 1000],
          ['circuit-4', 0, .59, 270, 1000],
          ['circuit-5', 0, .51, 360, 1000],
          ['circuit-6', 0, .43, 450, 1000]
        ];
      }

      if (this.mode === 'packet' && this.step === 2) {
        return [
          ['a1', 0, .52, 0, 1120],
          ['a2', 0, .66, 140, 920],
          ['a3', 0, .46, 280, 1180],
          ['a4', 0, .31, 420, 980]
        ];
      }

      if (this.mode === 'packet' && this.step === 3) {
        return [
          ['a2', .66, 1, 0, 620, 'a2'],
          ['a1', .52, 1, 90, 760, 'a1'],
          ['a4', .31, 1, 200, 850, 'a4'],
          ['a3', .46, 1, 310, 950, 'a3'],
          ['b1', 0, 1, 140, 1100, 'b1'],
          ['b2', 0, 1, 400, 980, 'b2']
        ];
      }

      return [];
    }

    animateStep() {
      const plan = this.animationPlan()
        .map(([name, start, end, delay, duration, arrival]) => ({
          mover: this.movers.get(name),
          start,
          end,
          delay,
          duration,
          arrival,
          arrived: false
        }))
        .filter(item => item.mover && this.paths.has(item.mover.dataset.transmissionPathRef));

      if (!plan.length) return;
      const generation = ++this.animationGeneration;
      this.root.classList.add('is-animating');
      plan.forEach(item => {
        this.positionMover(item.mover, item.start);
        item.mover.style.opacity = '0';
      });

      if (this.reducedMotion.matches) {
        plan.forEach(item => this.finishMover(item));
        this.root.classList.remove('is-animating');
        this.root.classList.add('is-animation-complete');
        return;
      }

      const startTime = performance.now();
      const tick = now => {
        if (generation !== this.animationGeneration) return;
        let running = false;

        plan.forEach(item => {
          const elapsed = now - startTime - item.delay;
          if (elapsed < 0) {
            running = true;
            return;
          }

          const progress = Math.min(1, elapsed / item.duration);
          const eased = 1 - Math.pow(1 - progress, 2);
          item.mover.style.opacity = '1';
          this.positionMover(item.mover, item.start + ((item.end - item.start) * eased));
          if (progress < 1) {
            running = true;
          } else if (!item.arrived) {
            this.finishMover(item);
          }
        });

        if (running) {
          this.animationFrame = requestAnimationFrame(tick);
        } else {
          this.animationFrame = 0;
          this.root.classList.remove('is-animating');
          this.root.classList.add('is-animation-complete');
        }
      };

      this.animationFrame = requestAnimationFrame(tick);
    }

    positionMover(mover, progress) {
      const path = this.paths.get(mover.dataset.transmissionPathRef);
      if (!path || typeof path.getTotalLength !== 'function') return;
      const length = path.getTotalLength();
      const point = path.getPointAtLength(Math.min(1, Math.max(0, progress)) * length);
      mover.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }

    finishMover(item) {
      this.positionMover(item.mover, item.end);
      item.mover.style.opacity = '1';
      item.arrived = true;
      if (!item.arrival) return;
      item.mover.classList.add('is-arrived');
      this.arrivalSlots.get(item.arrival)?.classList.add('is-arrived');
    }

    cancelAnimation() {
      this.animationGeneration += 1;
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  class NetworkInterfaceFlow {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('信号へ変換する図が必要です。');
      if (root.__networkInterfaceFlow) return root.__networkInterfaceFlow;

      this.root = root;
      this.step = Math.min(
        INTERFACE_FLOW_STEPS.length - 1,
        Math.max(0, Number.parseInt(root.dataset.step || '0', 10) || 0)
      );
      this.controls = root.querySelector('[data-interface-flow-controls]');
      this.previousButton = root.querySelector('[data-interface-flow-prev]');
      this.nextButton = root.querySelector('[data-interface-flow-next]');
      this.resetButton = root.querySelector('[data-interface-flow-reset]');
      this.stepIndex = root.querySelector('[data-interface-flow-index]');
      this.stages = Array.from(root.querySelectorAll('[data-interface-stage]'));
      this.narration = root.querySelector('[data-interface-flow-narration]');
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };

      if (this.stages.length !== INTERFACE_FLOW_STEPS.length) {
        throw new Error('信号へ変換する4段階がそろっていません。');
      }

      this.bind();
      this.root.classList.add('is-ready');
      if (this.controls) this.controls.hidden = false;
      this.render(false);
      root.__networkInterfaceFlow = this;
    }

    bind() {
      this.previousButton?.addEventListener('click', () => this.setStep(this.step - 1));
      this.nextButton?.addEventListener('click', () => this.setStep(this.step + 1));
      this.resetButton?.addEventListener('click', () => this.setStep(0));
      this.controls?.addEventListener('keydown', event => {
        const keys = {
          ArrowLeft: this.step - 1,
          ArrowRight: this.step + 1,
          Home: 0,
          End: INTERFACE_FLOW_STEPS.length - 1
        };
        if (!(event.key in keys)) return;
        event.preventDefault();
        this.setStep(keys[event.key]);
      });
    }

    setStep(nextStep) {
      const boundedStep = Math.min(INTERFACE_FLOW_STEPS.length - 1, Math.max(0, nextStep));
      if (boundedStep === this.step) return;
      this.step = boundedStep;
      this.render(true);
    }

    render(animate) {
      this.root.dataset.step = String(this.step);
      this.stages.forEach((stage, index) => {
        const current = index === this.step;
        stage.classList.toggle('is-current', current);
        stage.classList.toggle('is-complete', index < this.step);
        if (current) {
          stage.setAttribute('aria-current', 'step');
        } else {
          stage.removeAttribute('aria-current');
        }
      });
      if (this.stepIndex) this.stepIndex.textContent = String(this.step + 1);
      if (this.narration) this.narration.textContent = INTERFACE_FLOW_STEPS[this.step];
      if (this.previousButton) this.previousButton.disabled = this.step === 0;
      if (this.nextButton) this.nextButton.disabled = this.step === INTERFACE_FLOW_STEPS.length - 1;
      if (this.resetButton) this.resetButton.disabled = this.step === 0;

      this.root.classList.remove('is-signal-animating');
      if (animate && this.step === INTERFACE_FLOW_STEPS.length - 1 && !this.reducedMotion.matches) {
        void this.root.getBoundingClientRect();
        this.root.classList.add('is-signal-animating');
      }
    }
  }

  class NetworkMediumDemo {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('伝送媒体の比較図が必要です。');
      if (root.__networkMediumDemo) return root.__networkMediumDemo;

      this.root = root;
      this.replayButton = root.querySelector('[data-medium-replay]');
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
      this.replayButton?.addEventListener('click', () => this.play());
      this.root.dataset.networkMediumDemoReady = 'true';
      root.__networkMediumDemo = this;
    }

    play() {
      this.root.classList.remove('is-playing', 'is-animation-complete');
      void this.root.getBoundingClientRect();
      if (this.reducedMotion.matches) {
        this.root.classList.add('is-animation-complete');
      } else {
        this.root.classList.add('is-playing');
      }
    }
  }

  class NetworkSwitchDemo {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('スイッチングハブの転送図が必要です。');
      if (root.__networkSwitchDemo) return root.__networkSwitchDemo;

      this.root = root;
      this.step = Math.min(
        SWITCH_DEMO_STEPS.length - 1,
        Math.max(0, Number.parseInt(root.dataset.step || '0', 10) || 0)
      );
      this.controls = root.querySelector('[data-switch-controls]');
      this.previousButton = root.querySelector('[data-switch-prev]');
      this.nextButton = root.querySelector('[data-switch-next]');
      this.replayButton = root.querySelector('[data-switch-replay]');
      this.resetButton = root.querySelector('[data-switch-reset]');
      this.stepIndex = root.querySelector('[data-switch-index]');
      this.status = root.querySelector('[data-switch-status]');
      this.stepDetails = Array.from(root.querySelectorAll('[data-switch-step]'));
      this.tableRows = new Map(
        Array.from(root.querySelectorAll('[data-switch-table-row]'))
          .map(row => [row.dataset.switchTableRow, row])
      );
      this.ports = new Map(
        Array.from(root.querySelectorAll('[data-switch-port]'))
          .map(port => [port.dataset.switchPort, port])
      );
      this.results = new Map(
        Array.from(root.querySelectorAll('[data-switch-result]'))
          .map(result => [result.dataset.switchResult, result])
      );
      this.paths = new Map(
        Array.from(root.querySelectorAll('[data-switch-path]'))
          .map(path => [path.dataset.switchPath, path])
      );
      this.movers = new Map(
        Array.from(root.querySelectorAll('[data-switch-mover]'))
          .map(mover => [mover.dataset.switchMover, mover])
      );
      this.mobileTableRows = new Map(
        Array.from(root.querySelectorAll('[data-switch-mobile-table-row]'))
          .map(row => [row.dataset.switchMobileTableRow, row])
      );
      this.mobilePorts = new Map(
        Array.from(root.querySelectorAll('[data-switch-mobile-port]'))
          .map(port => [port.dataset.switchMobilePort, port])
      );
      this.mobileResults = new Map(
        Array.from(root.querySelectorAll('[data-switch-mobile-result]'))
          .map(result => [result.dataset.switchMobileResult, result])
      );
      this.mobilePaths = new Map(
        Array.from(root.querySelectorAll('[data-switch-mobile-path]'))
          .map(path => [path.dataset.switchMobilePath, path])
      );
      this.mobileMovers = new Map(
        Array.from(root.querySelectorAll('[data-switch-mobile-mover]'))
          .map(mover => [mover.dataset.switchMobileMover, mover])
      );
      this.animationFrame = 0;
      this.animationGeneration = 0;
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };

      if (this.stepDetails.length !== SWITCH_DEMO_STEPS.length) {
        throw new Error('スイッチングハブの6段階がそろっていません。');
      }

      this.bind();
      this.root.classList.add('is-ready');
      if (this.controls) this.controls.hidden = false;
      this.render(false);
      root.__networkSwitchDemo = this;
    }

    bind() {
      this.previousButton?.addEventListener('click', () => this.setStep(this.step - 1));
      this.nextButton?.addEventListener('click', () => this.setStep(this.step + 1));
      this.replayButton?.addEventListener('click', () => this.render(true));
      this.resetButton?.addEventListener('click', () => this.setStep(0));
      this.controls?.addEventListener('keydown', event => {
        const keys = {
          ArrowLeft: this.step - 1,
          ArrowRight: this.step + 1,
          Home: 0,
          End: SWITCH_DEMO_STEPS.length - 1
        };
        if (!(event.key in keys)) return;
        event.preventDefault();
        this.setStep(keys[event.key]);
      });
    }

    setStep(nextStep) {
      const boundedStep = Math.min(SWITCH_DEMO_STEPS.length - 1, Math.max(0, nextStep));
      if (boundedStep === this.step) return;
      this.step = boundedStep;
      this.render(true);
    }

    render(animate) {
      this.cancelAnimation();
      const step = SWITCH_DEMO_STEPS[this.step];
      const visibleRows = new Set(step.rows);
      const activePorts = new Set(step.ports);
      const visibleResults = new Set(step.results);
      const activeMovers = new Set(step.movers);

      this.root.dataset.step = String(this.step);
      this.tableRows.forEach((row, key) => {
        row.toggleAttribute('hidden', !visibleRows.has(key));
        row.classList.toggle('is-current', visibleRows.has(key));
      });
      this.mobileTableRows.forEach((row, key) => {
        row.toggleAttribute('hidden', !visibleRows.has(key));
        row.classList.toggle('is-current', visibleRows.has(key));
      });
      this.ports.forEach((port, key) => {
        port.classList.toggle('is-active', activePorts.has(key));
      });
      this.mobilePorts.forEach((port, key) => {
        port.classList.toggle('is-active', activePorts.has(key));
      });
      this.results.forEach((result, key) => {
        result.toggleAttribute('hidden', !visibleResults.has(key));
      });
      this.mobileResults.forEach((result, key) => {
        result.toggleAttribute('hidden', !visibleResults.has(key));
      });
      this.stepDetails.forEach((detail, index) => {
        detail.hidden = index !== this.step;
      });
      this.movers.forEach((mover, key) => {
        const visible = activeMovers.has(key);
        mover.toggleAttribute('hidden', !visible);
        mover.style.removeProperty('opacity');
        if (visible) this.positionMover(mover, animate ? 0 : 1);
      });
      this.mobileMovers.forEach((mover, key) => {
        const visible = activeMovers.has(key);
        mover.toggleAttribute('hidden', !visible);
        mover.style.removeProperty('opacity');
        if (visible) this.positionMover(mover, animate ? 0 : 1);
      });

      if (this.stepIndex) this.stepIndex.textContent = String(this.step + 1);
      if (this.status) this.status.textContent = `${step.title}：${step.description}`;
      if (this.previousButton) this.previousButton.disabled = this.step === 0;
      if (this.nextButton) this.nextButton.disabled = this.step === SWITCH_DEMO_STEPS.length - 1;
      if (this.resetButton) this.resetButton.disabled = this.step === 0;
      if (this.replayButton) this.replayButton.disabled = step.movers.length === 0;

      if (animate && step.movers.length) this.animateMovers(step.movers);
    }

    animateMovers(names) {
      const items = names
        .flatMap((name, index) => [
          { mover: this.movers.get(name), delay: index * 120 },
          { mover: this.mobileMovers.get(name), delay: index * 120 }
        ])
        .filter(item => item.mover && this.pathForMover(item.mover));
      if (!items.length) return;

      if (this.reducedMotion.matches) {
        items.forEach(item => this.positionMover(item.mover, 1));
        this.root.classList.add('is-animation-complete');
        return;
      }

      const generation = ++this.animationGeneration;
      const startTime = performance.now();
      this.root.classList.remove('is-animation-complete');
      this.root.classList.add('is-animating');
      items.forEach(item => {
        this.positionMover(item.mover, 0);
        item.mover.style.opacity = '0';
      });

      const tick = now => {
        if (generation !== this.animationGeneration) return;
        let running = false;
        items.forEach(item => {
          const elapsed = now - startTime - item.delay;
          if (elapsed < 0) {
            running = true;
            return;
          }
          const progress = Math.min(1, elapsed / 900);
          const eased = 1 - Math.pow(1 - progress, 2);
          item.mover.style.opacity = '1';
          this.positionMover(item.mover, eased);
          if (progress < 1) running = true;
        });

        if (running) {
          this.animationFrame = requestAnimationFrame(tick);
        } else {
          this.animationFrame = 0;
          this.root.classList.remove('is-animating');
          this.root.classList.add('is-animation-complete');
        }
      };
      this.animationFrame = requestAnimationFrame(tick);
    }

    positionMover(mover, progress) {
      const path = this.pathForMover(mover);
      if (!path || typeof path.getTotalLength !== 'function') return;
      const length = path.getTotalLength();
      const point = path.getPointAtLength(Math.min(1, Math.max(0, progress)) * length);
      mover.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }

    pathForMover(mover) {
      const desktopKey = mover.dataset.switchPathRef;
      const mobileKey = mover.dataset.switchMobilePathRef;
      return desktopKey ? this.paths.get(desktopKey) : this.mobilePaths.get(mobileKey);
    }

    cancelAnimation() {
      this.animationGeneration += 1;
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.root.classList.remove('is-animating', 'is-animation-complete');
    }
  }

  class NetworkStepDemo {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('段階表示する図が必要です。');
      if (root.__networkStepDemo) return root.__networkStepDemo;

      this.root = root;
      this.details = Array.from(root.querySelectorAll('[data-network-step-detail]'));
      this.visuals = Array.from(root.querySelectorAll('[data-network-step-visual]'));
      this.controls = root.querySelector('[data-network-step-controls]');
      this.previousButton = root.querySelector('[data-network-step-prev]');
      this.nextButton = root.querySelector('[data-network-step-next]');
      this.replayButton = root.querySelector('[data-network-step-replay]');
      this.resetButton = root.querySelector('[data-network-step-reset]');
      this.stepIndex = root.querySelector('[data-network-step-index]');
      this.stepCount = root.querySelector('[data-network-step-count]');
      this.status = root.querySelector('[data-network-step-status]');
      this.statusTitle = root.querySelector('[data-network-step-status-title]');
      this.statusDescription = root.querySelector('[data-network-step-status-description]');
      this.step = Math.min(
        this.details.length - 1,
        Math.max(0, Number.parseInt(root.dataset.step || '0', 10) || 0)
      );
      this.animationFrame = 0;
      this.animationGeneration = 0;
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };

      if (!this.details.length) throw new Error('段階ごとの説明が見つかりません。');

      this.bind();
      this.root.classList.add('is-ready');
      if (this.controls) this.controls.hidden = false;
      this.render(false);
      root.__networkStepDemo = this;
    }

    bind() {
      this.previousButton?.addEventListener('click', () => this.setStep(this.step - 1));
      this.nextButton?.addEventListener('click', () => this.setStep(this.step + 1));
      this.replayButton?.addEventListener('click', () => this.play());
      this.resetButton?.addEventListener('click', () => this.setStep(0));
      this.controls?.addEventListener('keydown', event => {
        const nextSteps = {
          ArrowLeft: this.step - 1,
          ArrowRight: this.step + 1,
          Home: 0,
          End: this.details.length - 1
        };
        if (!(event.key in nextSteps)) return;
        event.preventDefault();
        this.setStep(nextSteps[event.key]);
      });
    }

    stepsFor(visual) {
      return String(visual.dataset.networkStepVisual || '')
        .split(/[\s,]+/)
        .map(value => Number.parseInt(value, 10))
        .filter(Number.isInteger);
    }

    visibleMovers() {
      return this.visuals.filter(visual => !visual.hasAttribute('hidden') && visual.hasAttribute('data-network-step-mover'));
    }

    pathFor(mover) {
      const key = mover.dataset.networkStepPathRef;
      const svg = mover.closest('svg');
      if (!key || !svg) return null;
      return Array.from(svg.querySelectorAll('[data-network-step-path]'))
        .find(path => path.dataset.networkStepPath === key) || null;
    }

    setStep(nextStep) {
      const boundedStep = Math.min(this.details.length - 1, Math.max(0, nextStep));
      if (boundedStep === this.step) return;
      this.step = boundedStep;
      this.render(true);
    }

    render(animate) {
      this.cancelAnimation();
      this.root.dataset.step = String(this.step);
      this.visuals.forEach(visual => {
        visual.toggleAttribute('hidden', !this.stepsFor(visual).includes(this.step));
      });
      this.details.forEach((detail, index) => {
        const current = index === this.step;
        detail.hidden = !current;
        detail.classList.toggle('is-current', current);
        if (current) detail.setAttribute('aria-current', 'step');
        else detail.removeAttribute('aria-current');
      });

      const currentDetail = this.details[this.step];
      if (this.statusTitle) this.statusTitle.textContent = currentDetail?.dataset.stepTitle || `段階${this.step + 1}`;
      if (this.statusDescription) this.statusDescription.textContent = currentDetail?.textContent?.trim() || '';
      if (this.stepIndex) this.stepIndex.textContent = String(this.step + 1);
      if (this.stepCount) this.stepCount.textContent = String(this.details.length);
      if (this.previousButton) this.previousButton.disabled = this.step === 0;
      if (this.nextButton) this.nextButton.disabled = this.step === this.details.length - 1;
      if (this.resetButton) this.resetButton.disabled = this.step === 0;

      const movers = this.visibleMovers();
      if (this.replayButton) this.replayButton.disabled = movers.length === 0;
      movers.forEach(mover => this.positionMover(mover, animate ? 0 : 1));
      notifyContentResize();
      if (animate && movers.length) this.play();
    }

    play() {
      const movers = this.visibleMovers();
      if (!movers.length) return;
      this.cancelAnimation();

      const items = movers.map(mover => {
        const path = this.pathFor(mover);
        if (!path || typeof path.getTotalLength !== 'function') return null;
        return { mover, path, length: path.getTotalLength() };
      }).filter(Boolean);
      if (!items.length) return;

      if (this.reducedMotion.matches) {
        items.forEach(item => this.positionMover(item.mover, 1, item.path, item.length));
        this.root.classList.add('is-animation-complete');
        return;
      }

      items.forEach(item => this.positionMover(item.mover, 0, item.path, item.length));
      const duration = Math.max(450, Number.parseInt(this.root.dataset.stepDuration || '1150', 10) || 1150);
      const generation = ++this.animationGeneration;
      const startedAt = performance.now();
      this.root.classList.add('is-animating');

      const tick = now => {
        if (generation !== this.animationGeneration) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        items.forEach(item => this.positionMover(item.mover, eased, item.path, item.length));
        if (progress < 1) {
          this.animationFrame = requestAnimationFrame(tick);
          return;
        }
        this.animationFrame = 0;
        this.root.classList.remove('is-animating');
        this.root.classList.add('is-animation-complete');
      };
      this.animationFrame = requestAnimationFrame(tick);
    }

    positionMover(mover, progress, path = this.pathFor(mover), length = path?.getTotalLength?.()) {
      if (!path || !Number.isFinite(length)) return;
      const point = path.getPointAtLength(length * Math.min(1, Math.max(0, progress)));
      mover.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }

    cancelAnimation() {
      this.animationGeneration += 1;
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.root.classList.remove('is-animating', 'is-animation-complete');
    }
  }

  class NetworkQuiz {
    constructor(root) {
      if (!(root instanceof HTMLFormElement)) throw new TypeError('ネットワークの問題フォームが必要です。');
      if (root.__networkQuiz) return root.__networkQuiz;

      this.root = root;
      this.questions = Array.from(root.querySelectorAll('[data-network-question]'));
      this.checkButton = root.querySelector('[data-network-quiz-check]');
      this.resetButton = root.querySelector('[data-network-quiz-reset]');
      this.score = root.querySelector('[data-network-quiz-score]');

      if (!this.questions.length) throw new Error('問題が見つかりません。');

      this.checkButton?.addEventListener('click', () => this.check());
      this.root.addEventListener('change', event => this.clearQuestion(event.target));
      this.root.addEventListener('reset', () => requestAnimationFrame(() => this.reset()));
      this.root.dataset.networkQuizReady = 'true';
      root.__networkQuiz = this;
    }

    clearQuestion(target) {
      const question = target instanceof Element ? target.closest('[data-network-question]') : null;
      if (!question) return;
      question.classList.remove('is-correct', 'is-incorrect', 'is-unanswered');
      const feedback = question.querySelector('[data-network-feedback]');
      if (feedback) feedback.textContent = '';
      if (this.score) this.score.textContent = '未判定';
    }

    check() {
      let answered = 0;
      let correct = 0;
      this.questions.forEach(question => {
        const selected = question.querySelector('input[type="radio"]:checked');
        const feedback = question.querySelector('[data-network-feedback]');
        const isCorrect = selected?.value === question.dataset.correct;
        question.classList.toggle('is-unanswered', !selected);
        question.classList.toggle('is-correct', Boolean(selected && isCorrect));
        question.classList.toggle('is-incorrect', Boolean(selected && !isCorrect));

        if (!selected) {
          if (feedback) feedback.textContent = '答えを選んでください。';
          return;
        }

        answered += 1;
        if (isCorrect) correct += 1;
        if (feedback) {
          feedback.textContent = `${isCorrect ? '正解。' : '確認。'}${question.dataset.explanation || ''}`;
        }
      });

      if (!this.score) return;
      this.score.textContent = answered === this.questions.length
        ? `${correct} / ${this.questions.length} 正解`
        : `${answered} / ${this.questions.length} 問を判定`;
    }

    reset() {
      this.questions.forEach(question => {
        question.classList.remove('is-correct', 'is-incorrect', 'is-unanswered');
        const feedback = question.querySelector('[data-network-feedback]');
        if (feedback) feedback.textContent = '';
      });
      if (this.score) this.score.textContent = '未判定';
    }
  }

  class NetworkReviewTerms {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('重要語句のまとまりが必要です。');
      if (root.__networkReviewTerms) return root.__networkReviewTerms;

      this.root = root;
      this.controls = root.querySelector('[data-review-term-controls]');
      this.openAllButton = root.querySelector('[data-review-terms-open]');
      this.closeAllButton = root.querySelector('[data-review-terms-close]');
      this.entries = Array.from(root.querySelectorAll('[data-review-term]'));
      this.pendingScroll = null;

      if (!this.entries.length) throw new Error('重要語句が見つかりません。');

      this.prepare();
      this.bind();
      this.updateControls();
      root.__networkReviewTerms = this;
    }

    prepare() {
      if (this.controls) this.controls.hidden = false;
      this.root.dataset.networkReviewTermsReady = 'true';
    }

    bind() {
      this.entries.forEach(entry => {
        const summary = entry.querySelector('summary');
        summary?.addEventListener('pointerdown', () => this.rememberScrollPosition());
        summary?.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') this.rememberScrollPosition();
        });
        entry.addEventListener('toggle', () => {
          this.updateControls();
          this.restoreScrollPosition();
        });
      });

      this.openAllButton?.addEventListener('click', () => this.setAll(true));

      this.closeAllButton?.addEventListener('click', () => this.setAll(false));
    }

    rememberScrollPosition() {
      const slide = this.root.closest('.lesson-slide');
      if (!slide) return;
      this.pendingScroll = { slide, scrollTop: slide.scrollTop };
    }

    restoreScrollPosition() {
      if (!this.pendingScroll) return;
      const { slide, scrollTop } = this.pendingScroll;
      this.pendingScroll = null;
      slide.scrollTop = scrollTop;
      requestAnimationFrame(() => {
        slide.scrollTop = scrollTop;
        requestAnimationFrame(() => {
          slide.scrollTop = scrollTop;
        });
      });
    }

    setAll(open) {
      const slide = this.root.closest('.lesson-slide');
      const scrollTop = slide?.scrollTop;
      this.entries.forEach(entry => {
        entry.open = open;
      });
      this.updateControls();
      if (!slide || typeof scrollTop !== 'number') return;
      slide.scrollTop = scrollTop;
      requestAnimationFrame(() => {
        slide.scrollTop = scrollTop;
      });
    }

    updateControls() {
      const expandedCount = this.entries.filter(entry => entry.open).length;
      if (this.openAllButton) this.openAllButton.disabled = expandedCount === this.entries.length;
      if (this.closeAllButton) this.closeAllButton.disabled = expandedCount === 0;
    }
  }

  function initialize() {
    document.querySelectorAll(GROUP_SELECTOR).forEach(group => {
      try {
        new NetworkRevealGroup(group);
      } catch (error) {
        console.warn('ネットワーク教材の穴埋めを初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(PROTOCOL_SELECTOR).forEach(root => {
      try {
        new NetworkProtocol(root);
      } catch (error) {
        console.warn('プロトコルの図を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(LAYER_JOURNEY_SELECTOR).forEach(root => {
      try {
        new NetworkLayerJourney(root);
      } catch (error) {
        console.warn('プロトコル階層の図を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(TRANSMISSION_SELECTOR).forEach(root => {
      try {
        new NetworkTransmission(root);
      } catch (error) {
        console.warn('データの伝送方式を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(INTERFACE_FLOW_SELECTOR).forEach(root => {
      try {
        new NetworkInterfaceFlow(root);
      } catch (error) {
        console.warn('信号へ変換する図を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(MEDIUM_DEMO_SELECTOR).forEach(root => {
      try {
        new NetworkMediumDemo(root);
      } catch (error) {
        console.warn('伝送媒体の比較図を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(SWITCH_DEMO_SELECTOR).forEach(root => {
      try {
        new NetworkSwitchDemo(root);
      } catch (error) {
        console.warn('スイッチングハブの転送図を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(STEP_DEMO_SELECTOR).forEach(root => {
      try {
        new NetworkStepDemo(root);
      } catch (error) {
        console.warn('ネットワークの段階図を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(QUIZ_SELECTOR).forEach(root => {
      try {
        new NetworkQuiz(root);
      } catch (error) {
        console.warn('ネットワークの問題演習を初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(REVIEW_TERMS_SELECTOR).forEach(root => {
      try {
        new NetworkReviewTerms(root);
      } catch (error) {
        console.warn('重要語句のまとめを初期化できませんでした。', error);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
