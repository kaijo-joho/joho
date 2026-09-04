// 音のデジタル化と共通HTMLウィジェット。
(function (root) {
  'use strict';

  const Core = root.SoundCore;
  const Renderer = root.SoundRenderer;
  if (!Core || !Renderer) throw new Error('sound-widgets.jsの依存ファイルが読み込まれていません。');

  let widgetSerial = 0;
  let infoTipSerial = 0;

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function createInfoTip(config = {}) {
    infoTipSerial += 1;
    const tone = ['info', 'question', 'warning'].includes(config.tone) ? config.tone : 'info';
    const symbol = config.symbol || (tone === 'question' ? '?' : tone === 'warning' ? '!' : 'i');
    const label = config.label || '補足情報';
    const details = element('details', `dr-info-tip dr-info-tip--${tone}`);
    const summary = element('summary', 'dr-info-tip__trigger', symbol);
    const panel = element('div', 'dr-info-tip__panel');
    panel.id = `dr-info-tip-${infoTipSerial}`;
    panel.setAttribute('role', 'note');
    summary.setAttribute('aria-label', label);
    summary.setAttribute('aria-controls', panel.id);
    summary.title = label;
    if (config.title) panel.appendChild(element('strong', 'dr-info-tip__title', config.title));
    if (config.text) panel.appendChild(element('p', '', config.text));
    details.append(summary, panel);
    return details;
  }

  function formatNumber(value, digits = 3) {
    return Renderer.numberText(value, digits);
  }

  function createRangeControl(config) {
    const wrapper = element('div', 'dr-control');
    const id = config.id;
    const minimum = Number(config.min);
    const maximum = Number(config.max);
    const allowedMin = Number(config.allowedMin ?? minimum);
    const allowedMax = Number(config.allowedMax ?? maximum);
    if (![minimum, maximum, allowedMin, allowedMax].every(Number.isFinite)
      || maximum <= minimum
      || allowedMin < minimum
      || allowedMax > maximum
      || allowedMax < allowedMin) {
      throw new RangeError('スライダーの範囲が不正です。');
    }
    const clampToAllowedRange = value => Math.min(allowedMax, Math.max(allowedMin, Number(value)));
    const initialValue = clampToAllowedRange(config.value);
    const toPercent = value => `${((value - minimum) / (maximum - minimum) * 100).toFixed(4)}%`;
    const label = element('label');
    label.htmlFor = id;
    const name = element('span', '', config.label);
    const output = element('output', '', config.format(initialValue));
    output.htmlFor = id;
    label.append(name, output);
    const input = element('input');
    input.type = 'range';
    input.id = id;
    input.min = String(minimum);
    input.max = String(maximum);
    input.step = String(config.step);
    input.value = String(initialValue);
    const updateRangePosition = value => {
      wrapper.style.setProperty('--dr-range-value-position', toPercent(value));
    };
    if (allowedMin !== minimum || allowedMax !== maximum) {
      wrapper.classList.add('dr-control--bounded-range');
      wrapper.style.setProperty('--dr-range-allowed-start', toPercent(allowedMin));
      wrapper.style.setProperty('--dr-range-allowed-end', toPercent(allowedMax));
      input.setAttribute('aria-valuemin', String(allowedMin));
      input.setAttribute('aria-valuemax', String(allowedMax));
      const availability = element(
        'p',
        'dr-control__availability',
        `共通目盛：${config.format(minimum)}〜${config.format(maximum)} ／ 操作範囲：${config.format(allowedMin)}〜${config.format(allowedMax)}（灰色部分は選択できません）`
      );
      availability.id = `${id}-availability`;
      input.setAttribute('aria-describedby', availability.id);
      wrapper.append(label, input, availability);
    } else {
      wrapper.append(label, input);
    }
    updateRangePosition(initialValue);
    input.addEventListener('input', () => {
      const value = clampToAllowedRange(input.value);
      if (Number(input.value) !== value) input.value = String(value);
      output.value = config.format(value);
      updateRangePosition(value);
      config.onInput(value);
    });
    return { wrapper, input, output };
  }

  function createSelectControl(config) {
    const wrapper = element('div', 'dr-control');
    const label = element('label', '', config.label);
    label.htmlFor = config.id;
    const select = element('select');
    select.id = config.id;
    config.options.forEach(option => {
      const node = element('option', '', option.label);
      node.value = String(option.value);
      node.selected = String(option.value) === String(config.value);
      select.appendChild(node);
    });
    select.addEventListener('change', () => config.onChange(select.value));
    wrapper.append(label, select);
    return { wrapper, select };
  }

  function fixedLessonValue(time) {
    return Core.lessonWaveValue(time, {
      frequency: 0.625,
      amplitudeScale: 1,
      phase: 0,
      center: 4
    });
  }

  function fixedLessonModel(options = {}) {
    const start = Number(options.start ?? 0);
    const end = Number(options.end ?? 0.5);
    const sampleRate = 10;
    const bitDepth = 3;
    const range = { min: 0, max: 8 };
    const wavePoints = Core.waveformPoints(fixedLessonValue, {
      start,
      end,
      count: Math.max(361, Math.round((end - start) * 720) + 1)
    });
    const sampled = Core.sampleSignal(fixedLessonValue, { start, end, sampleRate });
    const samples = Core.quantizeSamples(sampled, { bitDepth, range });
    return { start, end, sampleRate, bitDepth, range, wavePoints, samples };
  }

  class AnalogWaveIntro {
    constructor(container) {
      if (!(container instanceof Element)) throw new TypeError('アナログ波形の表示先が必要です。');
      this.container = container;
      this.build();
      this.render();
    }

    build() {
      this.container.classList.add('dr-card', 'dr-analog-intro');
      const description = element(
        'p',
        'dr-widget-lead',
        '音は空気の振動です。マイクで電気信号に変換すると、時間とともに連続して変化する波形として表せます。'
      );
      const visual = element('figure', 'dr-visual');
      const legend = element('figcaption', 'dr-legend');
      legend.innerHTML = '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--analog"></span>元のアナログ波形</span>';
      const scroll = element('div', 'dr-visual__scroll');
      scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', '音のアナログ波形。狭い画面では横方向にスクロールできます。');
      scroll.appendChild(element('p', 'dr-visual__hint', '横にスクロールしてグラフ全体を確認できます'));
      this.graph = element('div');
      scroll.appendChild(this.graph);
      const point = element('p', 'dr-selected-readout');
      point.innerHTML = '<strong>見るポイント：</strong>横軸は時間、縦軸は電圧です。曲線上では、時間も電圧も連続して変化しています。';
      visual.append(legend, scroll, point);
      this.container.replaceChildren(description, visual);
    }

    render() {
      const model = fixedLessonModel({ end: 1.5 });
      Renderer.renderAnalogWave(this.graph, {
        ...model,
        axisTimeStep: 0.1,
        axisLabelEvery: 2,
        axisVoltageStep: 1
      });
    }
  }

  class PcmWalkthrough {
    constructor(container) {
      if (!(container instanceof Element)) throw new TypeError('デジタル化手順の表示先が必要です。');
      this.container = container;
      this.state = { stage: 1, selectedIndex: null };
      this.pendingAnimationStage = 0;
      this.model = fixedLessonModel();
      this.build();
      this.render();
    }

    build() {
      this.container.classList.add('dr-card', 'dr-guide', 'dr-guide--pcm-walkthrough');
      const setup = element('div', 'dr-guide__setup');
      const setupText = element('p', 'dr-guide__setup-text');
      setupText.innerHTML = '<strong>0. アナログ波形から開始：</strong>同じグラフに要素を順番に追加します。';
      setup.append(
        setupText,
        createInfoTip({
          symbol: 'i',
          tone: 'info',
          label: 'このグラフの固定条件',
          title: '固定条件',
          text: '標本化周期は0.1秒、量子化ビット数は3ビットです。ここでは条件を変えず、変換による見え方の変化に注目します。'
        })
      );
      this.stageSelector = element('fieldset', 'dr-stage-selector dr-stage-selector--walkthrough');
      this.stageSelector.setAttribute('aria-label', '波形に表示する工程');
      const stages = [
        { stage: 1, label: '0. アナログ波形' },
        { stage: 2, label: '1. 標本化' },
        { stage: 3, label: '2. 量子化' },
        { stage: 4, label: '3. 符号化' }
      ];
      this.stageButtons = stages.map(item => {
        const button = element('button', 'dr-stage-button', item.label);
        button.type = 'button';
        button.dataset.stage = String(item.stage);
        button.setAttribute('aria-label', item.label);
        button.addEventListener('click', () => this.setStage(item.stage));
        this.stageSelector.appendChild(button);
        return button;
      });
      this.explanation = element('div', 'dr-guide__explanation dr-guide__explanation--compact');
      this.visual = element('figure', 'dr-visual');
      this.legend = element('figcaption', 'dr-legend');
      const scroll = element('div', 'dr-visual__scroll');
      scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', '標本化・量子化・符号化を順に示すグラフ。狭い画面では横方向にスクロールできます。');
      scroll.appendChild(element('p', 'dr-visual__hint', '横にスクロールしてグラフ全体を確認できます'));
      this.graph = element('div');
      scroll.appendChild(this.graph);
      this.visual.append(this.legend, scroll);
      this.container.replaceChildren(setup, this.stageSelector, this.explanation, this.visual);
    }

    setStage(stage) {
      const nextStage = Math.max(1, Math.min(4, Number(stage) || 1));
      this.pendingAnimationStage = nextStage > this.state.stage ? nextStage : 0;
      this.state.stage = nextStage;
      this.state.selectedIndex = null;
      this.render();
    }

    selectSample(index) {
      this.state.selectedIndex = index;
      this.container.querySelectorAll('[data-sample-index]').forEach(node => {
        node.classList.toggle('is-active', Number(node.dataset.sampleIndex) === index);
      });
    }

    clearSample() {
      this.state.selectedIndex = null;
      this.container.querySelectorAll('[data-sample-index].is-active').forEach(node => {
        node.classList.remove('is-active');
      });
    }

    render() {
      const descriptions = {
        1: {
          title: '0. アナログ波形',
          text: '時間とともに連続して変化する、アナログ波形だけを表示します。',
          point: 'まだ値を取り出していないため、標本点や2進数はありません。次に「標本化」を押してください。'
        },
        2: {
          title: '1. 標本化',
          text: '時間を0.1秒ごとに区切り、その時点の波の高さを取り出します。',
          point: 'この例では標本化の幅は0.1秒です。縦の線と丸い点を左から順に見てください。'
        },
        3: {
          title: '2. 量子化',
          text: '各標本の高さを、最も近い8段階の値にそろえます。',
          point: 'この例は3ビット量子化なので8段階です。この固定例では各点が段階値と重なるため、誤差は0です。'
        },
        4: {
          title: '3. 符号化',
          text: '量子化した段階値を3桁の2進数で表します。この3工程で音をデジタルデータとして表す方法を、パルス符号変調（PCM）方式といいます。',
          point: '値2は010、値3は011、値5は101になります。PCMは「パルス符号変調」の略です。'
        }
      };
      const description = descriptions[this.state.stage];
      this.stageButtons.forEach(button => {
        const stage = Number(button.dataset.stage);
        button.setAttribute('aria-pressed', stage === this.state.stage ? 'true' : 'false');
        button.classList.toggle('is-complete', stage <= this.state.stage);
      });
      const stageTitle = element('strong', 'dr-guide__stage-title', description.title);
      const stageText = element('p', 'dr-guide__stage-text', description.text);
      this.explanation.replaceChildren(
        stageTitle,
        stageText,
        createInfoTip({
          symbol: this.state.stage === 4 ? 'i' : '?',
          tone: this.state.stage === 4 ? 'info' : 'question',
          label: `${description.title}の見るポイント`,
          title: '見るポイント',
          text: description.point
        })
      );
      const legendItems = [
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--analog"></span>アナログ波形</span>'
      ];
      if (this.state.stage >= 2) {
        legendItems.push('<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--sample"></span>標本化した点</span>');
      }
      if (this.state.stage >= 3) {
        legendItems.push('<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--quantized"></span>量子化後の値</span>');
      }
      if (this.state.stage >= 4) {
        legendItems.push('<span class="dr-legend__item"><span class="dr-legend__code">010</span>3ビットの2進数</span>');
      }
      this.legend.innerHTML = legendItems.join('');
      const animationStage = this.pendingAnimationStage;
      Renderer.renderPCM(this.graph, {
        ...this.model,
        stage: this.state.stage,
        animationStage,
        compact: true,
        selectedIndex: this.state.selectedIndex,
        showStaircase: false,
        axisTimeStep: 0.1,
        axisLabelEvery: 1,
        axisVoltageStep: 1
      }, {
        title: `${description.title}の固定例`,
        description: `${description.text} ${description.point}`,
        onSampleSelect: index => this.selectSample(index),
        onSampleClear: () => this.clearSample()
      });
      this.pendingAnimationStage = 0;
      this.clearSample();
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }
  }

  class PcmExplorer {
    constructor(container, options = {}) {
      if (!(container instanceof Element)) throw new TypeError('音のデジタル化グラフの表示先が必要です。');
      widgetSerial += 1;
      this.serial = widgetSerial;
      this.container = container;
      this.state = {
        waveform: options.waveform || 'lesson',
        frequency: Number(options.frequency ?? 0.625),
        amplitude: Number(options.amplitude ?? 4),
        sampleRate: Number(options.sampleRate ?? 10),
        bitDepth: Number(options.bitDepth ?? 3),
        range: { min: 0, max: 8 },
        start: 0,
        end: 1.2,
        stage: Number(options.stage ?? 1),
        selectedIndex: null,
        showStaircase: true
      };
      this.pendingAnimationStage = 0;
      this.build();
      this.render();
    }

    valueAt(time) {
      if (this.state.waveform === 'sine') {
        return Core.sineValue({
          amplitude: this.state.amplitude,
          frequency: this.state.frequency,
          phase: 0,
          offset: 4
        }, time);
      }
      if (this.state.waveform === 'composite') {
        return Core.sumSineWaves([
          {
            amplitude: this.state.amplitude * 0.68,
            frequency: this.state.frequency,
            phase: 0
          },
          {
            amplitude: this.state.amplitude * 0.32,
            frequency: this.state.frequency * 2,
            phase: Math.PI / 3
          }
        ], time, 4);
      }
      return Core.lessonWaveValue(time, {
        frequency: this.state.frequency,
        amplitudeScale: this.state.amplitude / 4,
        phase: 0,
        center: 4
      });
    }

    derive() {
      const wavePoints = Core.waveformPoints(time => this.valueAt(time), {
        start: this.state.start,
        end: this.state.end,
        count: 721
      });
      const sampled = Core.sampleSignal(time => this.valueAt(time), {
        start: this.state.start,
        end: this.state.end,
        sampleRate: this.state.sampleRate
      });
      const samples = Core.quantizeSamples(sampled, {
        bitDepth: this.state.bitDepth,
        range: this.state.range
      });
      return { wavePoints, samples };
    }

    build() {
      this.container.classList.add('dr-explorer');
      this.stageSelector = element('fieldset', 'dr-stage-selector');
      this.stageSelector.appendChild(element('legend', '', '表示する工程'));
      const stages = ['アナログ波形', '標本化', '量子化', '符号化'];
      this.stageLabels = stages.map((name, index) => `${index}. ${name}`);
      this.stageButtons = stages.map((name, index) => {
        const label = this.stageLabels[index];
        const button = element('button', 'dr-stage-button', label);
        button.type = 'button';
        button.dataset.stage = String(index + 1);
        button.setAttribute('aria-label', label);
        button.addEventListener('click', () => {
          const nextStage = index + 1;
          this.pendingAnimationStage = nextStage > this.state.stage ? nextStage : 0;
          this.state.stage = nextStage;
          this.render();
        });
        this.stageSelector.appendChild(button);
        return button;
      });
      this.stageHelp = element('p', 'dr-selected-readout');

      this.controls = element('div', 'dr-control-panel');
      const waveform = createSelectControl({
        id: `dr-pcm-waveform-${this.serial}`,
        label: '波形',
        value: this.state.waveform,
        options: [
          { value: 'lesson', label: 'このページの例' },
          { value: 'sine', label: '正弦波' },
          { value: 'composite', label: '2つの正弦波の合成' }
        ],
        onChange: value => {
          this.state.waveform = value;
          this.render();
        }
      });
      const frequency = createRangeControl({
        id: `dr-pcm-frequency-${this.serial}`,
        label: '波の周波数',
        value: this.state.frequency,
        min: 0.5,
        max: 3,
        step: 0.125,
        format: value => `${formatNumber(value, 3)} Hz`,
        onInput: value => {
          this.state.frequency = value;
          this.render();
        }
      });
      const amplitude = createRangeControl({
        id: `dr-pcm-amplitude-${this.serial}`,
        label: '振幅',
        value: this.state.amplitude,
        min: 1,
        max: 4,
        step: 0.5,
        format: value => formatNumber(value, 1),
        onInput: value => {
          this.state.amplitude = value;
          this.render();
        }
      });
      const sampleRate = createRangeControl({
        id: `dr-pcm-sample-rate-${this.serial}`,
        label: '標本化周波数 fs',
        value: this.state.sampleRate,
        min: 2,
        max: 20,
        step: 1,
        format: value => `${value} Hz`,
        onInput: value => {
          this.state.sampleRate = value;
          this.state.selectedIndex = null;
          this.render();
        }
      });
      this.sampleRateControl = sampleRate;
      this.sampleRateAvailability = element('p', 'dr-control__availability');
      this.sampleRateAvailability.id = `dr-pcm-sample-rate-availability-${this.serial}`;
      this.sampleRateMetrics = element('dl', 'dr-control__metrics');
      this.sampleRateMetrics.id = `dr-pcm-sample-rate-metrics-${this.serial}`;
      sampleRate.input.setAttribute(
        'aria-describedby',
        `${this.sampleRateAvailability.id} ${this.sampleRateMetrics.id}`
      );
      sampleRate.wrapper.append(this.sampleRateAvailability, this.sampleRateMetrics);

      const bitDepth = createRangeControl({
        id: `dr-pcm-bit-depth-${this.serial}`,
        label: '量子化ビット数',
        value: this.state.bitDepth,
        min: 2,
        max: 4,
        step: 1,
        format: value => `${value} bit`,
        onInput: value => {
          this.state.bitDepth = value;
          this.render();
        }
      });
      this.bitDepthControl = bitDepth;
      this.bitDepthAvailability = element('p', 'dr-control__availability');
      this.bitDepthAvailability.id = `dr-pcm-bit-depth-availability-${this.serial}`;
      this.bitDepthMetrics = element('dl', 'dr-control__metrics');
      this.bitDepthMetrics.id = `dr-pcm-bit-depth-metrics-${this.serial}`;
      bitDepth.input.setAttribute(
        'aria-describedby',
        `${this.bitDepthAvailability.id} ${this.bitDepthMetrics.id}`
      );
      bitDepth.wrapper.append(this.bitDepthAvailability, this.bitDepthMetrics);

      this.controls.append(
        waveform.wrapper,
        frequency.wrapper,
        amplitude.wrapper,
        sampleRate.wrapper,
        bitDepth.wrapper
      );

      this.visual = element('figure', 'dr-visual');
      this.legend = element('figcaption', 'dr-legend');
      this.legend.innerHTML = [
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--analog"></span>アナログ波形</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--sample"></span>標本化した点</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--quantized"></span>量子化後の値・階段</span>'
      ].join('');
      this.scroll = element('div', 'dr-visual__scroll');
      this.scroll.tabIndex = 0;
      this.scroll.setAttribute('aria-label', '音をデジタル化する手順の横長グラフ。狭い画面では横方向にスクロールできます。');
      this.scroll.appendChild(element('p', 'dr-visual__hint', '横にスクロールしてグラフ全体を確認できます'));
      this.graph = element('div');
      this.scroll.appendChild(this.graph);
      this.selectedReadout = element('p', 'dr-selected-readout');
      this.visual.append(this.legend, this.scroll, this.selectedReadout);
      this.container.replaceChildren(
        this.stageSelector,
        this.stageHelp,
        this.controls,
        this.visual
      );
    }

    renderControlMetrics() {
      const fs = this.state.sampleRate;
      const period = Core.samplingPeriod(fs);
      const bits = this.state.bitDepth;
      const levels = Core.quantizationLevels(bits);
      const exponent = { 2: '²', 3: '³', 4: '⁴' }[bits] || String(bits);

      const replaceMetrics = (host, metrics) => {
        host.replaceChildren(...metrics.flatMap(([term, value]) => [
          element('dt', '', term),
          element('dd', '', value)
        ]));
      };
      replaceMetrics(this.sampleRateMetrics, [
        ['標本化周期', `T = 1 / fs = 1 / ${fs} = ${formatNumber(period, 4)} 秒`]
      ]);
      replaceMetrics(this.bitDepthMetrics, [
        ['量子化段階数', `2ⁿ = 2${exponent} = ${levels} 段階`]
      ]);
    }

    updateControlAvailability() {
      const settings = [
        {
          control: this.sampleRateControl,
          availability: this.sampleRateAvailability,
          disabled: this.state.stage < 2,
          message: '1. 標本化から変更できます'
        },
        {
          control: this.bitDepthControl,
          availability: this.bitDepthAvailability,
          disabled: this.state.stage < 3,
          message: '2. 量子化から変更できます'
        }
      ];
      settings.forEach(({ control, availability, disabled, message }) => {
        control.input.disabled = disabled;
        control.wrapper.classList.toggle('is-disabled', disabled);
        availability.hidden = !disabled;
        availability.textContent = disabled ? message : '';
      });
    }

    selectSample(index) {
      const selectedIndex = Number(index);
      if (!Number.isInteger(selectedIndex)) {
        this.clearSample();
        return;
      }
      this.state.selectedIndex = selectedIndex;
      this.container.querySelectorAll('[data-sample-index]').forEach(node => {
        node.classList.toggle('is-active', Number(node.dataset.sampleIndex) === selectedIndex);
      });
      if (this.state.stage === 1) {
        this.selectedReadout.innerHTML = '<strong>0. アナログ波形：</strong>「標本化」へ進むと、波形から取り出した点を選べます。';
        return;
      }
      const { samples } = this.derive();
      const sample = samples[selectedIndex];
      if (!sample) return;
      const details = [
        `標本 ${selectedIndex + 1}`,
        `t = ${formatNumber(sample.time, 3)} 秒`,
        `元の値 = ${formatNumber(sample.value, 3)}`
      ];
      if (this.state.stage >= 3) {
        details.push(`量子化後の値 = ${formatNumber(sample.quantizedValue, 3)}`, `段階値 = ${sample.code}`);
      }
      if (this.state.stage >= 4) details.push(`${this.state.bitDepth}bitの2進数 = ${sample.binary}`);
      this.selectedReadout.innerHTML = `<strong>選択中：</strong>${details.join(' ／ ')}`;
    }

    clearSample() {
      this.state.selectedIndex = null;
      this.container.querySelectorAll('[data-sample-index]').forEach(node => {
        node.classList.remove('is-active');
      });
      if (!this.selectedReadout) return;
      if (this.state.stage === 1) {
        this.selectedReadout.innerHTML = '<strong>0. アナログ波形：</strong>「標本化」へ進むと、波形から取り出した点を選べます。';
        return;
      }
      this.selectedReadout.innerHTML = '<strong>標本を選択：</strong>グラフの点にポインタを合わせるか、タップまたはキーボードで選ぶと値を確認できます。';
    }

    render() {
      const stageDescriptions = [
        '連続的に変化する電圧を、時間に沿った曲線として見ます。',
        '一定の時間間隔 T ごとに波形の値を取り出します。縦の補助線と丸い点が標本です。',
        '標本化で得られた波の高さを、最も近い段階値へそろえます。丸が元の値、四角が量子化後の値、赤い点線が誤差です。',
        '量子化した段階値を、量子化ビット数に合わせた桁数の2進数で表します。'
      ];
      this.stageButtons.forEach((button, index) => {
        const stageNumber = index + 1;
        button.setAttribute('aria-pressed', stageNumber === this.state.stage ? 'true' : 'false');
        button.classList.toggle('is-complete', stageNumber <= this.state.stage);
      });
      this.stageHelp.innerHTML = `<strong>${this.stageLabels[this.state.stage - 1]}：</strong>${stageDescriptions[this.state.stage - 1]}`;

      this.state.selectedIndex = null;
      const derived = this.derive();
      this.updateControlAvailability();
      this.renderControlMetrics();
      Renderer.renderPCM(this.graph, {
        ...this.state,
        ...derived,
        animationStage: this.pendingAnimationStage,
        axisTimeStep: 0.1,
        axisLabelEvery: 2,
        axisVoltageStep: 1
      }, {
        onSampleSelect: index => this.selectSample(index),
        onSampleClear: () => this.clearSample()
      });
      this.pendingAnimationStage = 0;
      this.clearSample();
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }
  }

  function initializeWidgets(scope = document) {
    const instances = [];
    scope.querySelectorAll('[data-sound-analog-intro]').forEach(container => {
      try {
        instances.push(new AnalogWaveIntro(container));
      } catch (error) {
        container.textContent = `アナログ波形を表示できません：${error.message}`;
        console.error('[sound-widgets] analog wave initialization failed:', error);
      }
    });
    scope.querySelectorAll('[data-sound-pcm-guide]').forEach(container => {
      try {
        instances.push(new PcmWalkthrough(container));
      } catch (error) {
        container.textContent = `デジタル化の手順を表示できません：${error.message}`;
        console.error('[sound-widgets] digitization walkthrough initialization failed:', error);
      }
    });
    scope.querySelectorAll('[data-sound-pcm]').forEach(container => {
      try {
        const initialStage = Number(container.dataset.stage);
        instances.push(new PcmExplorer(container, {
          stage: Number.isInteger(initialStage) && initialStage >= 1 && initialStage <= 4 ? initialStage : 1
        }));
      } catch (error) {
        container.textContent = `音のデジタル化グラフを表示できません：${error.message}`;
        console.error('[sound-widgets] digitization explorer initialization failed:', error);
      }
    });
    return instances;
  }

  root.SoundWidgets = Object.freeze({
    element,
    formatNumber,
    createRangeControl,
    createSelectControl,
    createInfoTip,
    AnalogWaveIntro,
    PcmWalkthrough,
    PcmExplorer,
    initializeWidgets
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
