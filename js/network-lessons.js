// ./js/network-lessons.js
(() => {
  'use strict';

  const GROUP_SELECTOR = '[data-network-reveal-group]';
  const REVEAL_SELECTOR = '[data-network-reveal]';
  const TRANSMISSION_SELECTOR = '[data-network-transmission]';
  const PROTOCOL_SELECTOR = '[data-network-protocol]';
  const LAYER_JOURNEY_SELECTOR = '[data-network-layer-journey]';
  const REVIEW_TERMS_SELECTOR = '[data-network-review-terms]';
  const CONTENT_RESIZE_EVENT = 'joho:lesson-content-resize';
  const REVEAL_CHANGE_EVENT = 'joho:network-reveal-change';

  const PROTOCOL_VISUAL_DESCRIPTIONS = {
    physical: 'ケーブルのコネクタと無線の電波',
    partner: '端末Bの宛先IPアドレス',
    packet: '送信データに付加するヘッダ情報',
    reliability: '壊れたパケットの検出と再送',
    security: '通信を守る鍵'
  };

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

  class NetworkReviewTerms {
    constructor(root) {
      if (!(root instanceof HTMLElement)) throw new TypeError('重要語句のまとまりが必要です。');
      if (root.__networkReviewTerms) return root.__networkReviewTerms;

      this.root = root;
      this.controls = root.querySelector('[data-review-term-controls]');
      this.openAllButton = root.querySelector('[data-review-terms-open]');
      this.closeAllButton = root.querySelector('[data-review-terms-close]');
      this.entries = Array.from(root.querySelectorAll('[data-review-term-toggle]')).map(button => {
        const descriptionId = button.getAttribute('aria-controls');
        const description = descriptionId ? document.getElementById(descriptionId) : null;
        if (!description || !root.contains(description)) {
          throw new Error(`重要語句「${button.textContent.trim()}」の説明が見つかりません。`);
        }
        return {
          button,
          description,
          term: button.textContent.trim()
        };
      });

      if (!this.entries.length) throw new Error('重要語句が見つかりません。');

      this.prepare();
      this.bind();
      this.updateControls();
      root.__networkReviewTerms = this;
    }

    prepare() {
      this.entries.forEach(entry => this.setExpanded(entry, false));
      if (this.controls) this.controls.hidden = false;
      this.root.dataset.networkReviewTermsReady = 'true';
    }

    bind() {
      this.entries.forEach(entry => {
        entry.button.addEventListener('click', () => this.toggle(entry));
        entry.button.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          this.toggle(entry);
        });
      });

      this.openAllButton?.addEventListener('click', () => {
        this.entries.forEach(entry => this.setExpanded(entry, true));
        this.updateControls();
        notifyContentResize();
      });

      this.closeAllButton?.addEventListener('click', () => {
        this.entries.forEach(entry => this.setExpanded(entry, false));
        this.updateControls();
        notifyContentResize();
      });
    }

    toggle(entry) {
      const expanded = entry.button.getAttribute('aria-expanded') === 'true';
      this.setExpanded(entry, !expanded);
      this.updateControls();
      notifyContentResize();
    }

    setExpanded(entry, expanded) {
      entry.button.setAttribute('aria-expanded', String(expanded));
      entry.button.setAttribute('aria-label', `${entry.term}の説明を${expanded ? '閉じる' : '表示'}`);
      entry.button.classList.toggle('is-expanded', expanded);
      entry.description.hidden = !expanded;
    }

    updateControls() {
      const expandedCount = this.entries.filter(entry => entry.button.getAttribute('aria-expanded') === 'true').length;
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
