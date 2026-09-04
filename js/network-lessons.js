// ./js/network-lessons.js
(() => {
  'use strict';

  const GROUP_SELECTOR = '[data-network-reveal-group]';
  const REVEAL_SELECTOR = '[data-network-reveal]';
  const TRANSMISSION_SELECTOR = '[data-network-transmission]';
  const CONTENT_RESIZE_EVENT = 'joho:lesson-content-resize';

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
        notifyContentResize();
      });

      this.resetButton?.addEventListener('click', () => {
        this.buttons.forEach((button, index) => this.setRevealed(button, index, false));
        this.updateControls();
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
      notifyContentResize();
    }

    updateControls() {
      const revealedCount = this.buttons.filter(button => button.classList.contains('is-revealed')).length;
      if (this.progress) this.progress.textContent = `${revealedCount} / ${this.buttons.length}`;
      if (this.allButton) this.allButton.disabled = revealedCount === this.buttons.length;
      if (this.resetButton) this.resetButton.disabled = revealedCount === 0;
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

  function initialize() {
    document.querySelectorAll(GROUP_SELECTOR).forEach(group => {
      try {
        new NetworkRevealGroup(group);
      } catch (error) {
        console.warn('ネットワーク教材の穴埋めを初期化できませんでした。', error);
      }
    });

    document.querySelectorAll(TRANSMISSION_SELECTOR).forEach(root => {
      try {
        new NetworkTransmission(root);
      } catch (error) {
        console.warn('データの伝送方式を初期化できませんでした。', error);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
