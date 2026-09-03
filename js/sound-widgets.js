// PCM Explorerと音教材の共通HTMLウィジェット。
(function (root) {
  'use strict';

  const Core = root.SoundCore;
  const Renderer = root.SoundRenderer;
  if (!Core || !Renderer) throw new Error('sound-widgets.jsの依存ファイルが読み込まれていません。');

  let widgetSerial = 0;

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatNumber(value, digits = 3) {
    return Renderer.numberText(value, digits);
  }

  function createRangeControl(config) {
    const wrapper = element('div', 'dr-control');
    const id = config.id;
    const label = element('label');
    label.htmlFor = id;
    const name = element('span', '', config.label);
    const output = element('output', '', config.format(config.value));
    output.htmlFor = id;
    label.append(name, output);
    const input = element('input');
    input.type = 'range';
    input.id = id;
    input.min = String(config.min);
    input.max = String(config.max);
    input.step = String(config.step);
    input.value = String(config.value);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      output.value = config.format(value);
      config.onInput(value);
    });
    wrapper.append(label, input);
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

  class PcmExplorer {
    constructor(container, options = {}) {
      if (!(container instanceof Element)) throw new TypeError('PCM Explorerの表示先が必要です。');
      widgetSerial += 1;
      this.serial = widgetSerial;
      this.container = container;
      this.state = {
        waveform: options.waveform || 'lesson',
        frequency: Number(options.frequency ?? 0.625),
        amplitude: Number(options.amplitude ?? 4),
        phaseDegrees: Number(options.phaseDegrees ?? 0),
        sampleRate: Number(options.sampleRate ?? 10),
        bitDepth: Number(options.bitDepth ?? 3),
        range: { min: 0, max: 8 },
        start: 0,
        end: 1.5,
        stage: Number(options.stage ?? 1),
        selectedIndex: 0,
        showStaircase: true
      };
      this.build();
      this.render();
    }

    valueAt(time) {
      const phase = Core.degreesToRadians(this.state.phaseDegrees);
      if (this.state.waveform === 'sine') {
        return Core.sineValue({
          amplitude: this.state.amplitude,
          frequency: this.state.frequency,
          phase,
          offset: 4
        }, time);
      }
      if (this.state.waveform === 'composite') {
        return Core.sumSineWaves([
          {
            amplitude: this.state.amplitude * 0.68,
            frequency: this.state.frequency,
            phase
          },
          {
            amplitude: this.state.amplitude * 0.32,
            frequency: this.state.frequency * 2,
            phase: phase + Math.PI / 3
          }
        ], time, 4);
      }
      return Core.lessonWaveValue(time, {
        frequency: this.state.frequency,
        amplitudeScale: this.state.amplitude / 4,
        phase,
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
      const title = element('h3', '', 'PCM Explorer');
      const intro = element('p', '', '段階を1つずつ進め、連続した波形が固定長2進数へ変わる過程を追いましょう。表示は累積されます。');

      this.stageSelector = element('fieldset', 'dr-stage-selector');
      this.stageSelector.appendChild(element('legend', '', '表示する工程'));
      const stages = ['アナログ波形', '標本化', '量子化', '符号化'];
      this.stageButtons = stages.map((name, index) => {
        const button = element('button', 'dr-stage-button', `${index + 1}. ${name}`);
        button.type = 'button';
        button.dataset.stage = String(index + 1);
        button.addEventListener('click', () => {
          this.state.stage = index + 1;
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
          { value: 'lesson', label: '授業資料の例' },
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
      const phase = createRangeControl({
        id: `dr-pcm-phase-${this.serial}`,
        label: '位相',
        value: this.state.phaseDegrees,
        min: 0,
        max: 315,
        step: 45,
        format: value => `${value}°`,
        onInput: value => {
          this.state.phaseDegrees = value;
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
          this.state.selectedIndex = 0;
          this.render();
        }
      });
      const bitDepth = createSelectControl({
        id: `dr-pcm-bit-depth-${this.serial}`,
        label: '量子化ビット数',
        value: this.state.bitDepth,
        options: [2, 3, 4].map(value => ({ value, label: `${value} bit` })),
        onChange: value => {
          this.state.bitDepth = Number(value);
          this.render();
        }
      });
      this.controls.append(
        waveform.wrapper,
        frequency.wrapper,
        amplitude.wrapper,
        phase.wrapper,
        sampleRate.wrapper,
        bitDepth.wrapper
      );

      this.metrics = element('dl', 'dr-metrics');
      this.visual = element('figure', 'dr-visual');
      this.legend = element('figcaption', 'dr-legend');
      this.legend.innerHTML = [
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--analog"></span>アナログ波形</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--sample"></span>標本点・ステム</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--quantized"></span>量子化値・階段</span>'
      ].join('');
      this.scroll = element('div', 'dr-visual__scroll');
      this.scroll.tabIndex = 0;
      this.scroll.setAttribute('aria-label', 'PCM工程の横長グラフ。狭い画面では横方向にスクロールできます。');
      this.scroll.appendChild(element('p', 'dr-visual__hint', '横にスクロールしてグラフ全体を確認できます'));
      this.graph = element('div');
      this.scroll.appendChild(this.graph);
      this.selectedReadout = element('p', 'dr-selected-readout');
      this.visual.append(this.legend, this.scroll, this.selectedReadout);
      this.tableHost = element('div');
      this.container.replaceChildren(
        title,
        intro,
        this.stageSelector,
        this.stageHelp,
        this.controls,
        this.metrics,
        this.visual,
        this.tableHost
      );
    }

    renderMetrics(sampleCount) {
      const fs = this.state.sampleRate;
      const period = Core.samplingPeriod(fs);
      const bits = this.state.bitDepth;
      const levels = Core.quantizationLevels(bits);
      const width = Core.quantizationWidth(bits, this.state.range);
      const metrics = [
        ['標本化周波数', `fs = ${fs} Hz`],
        ['標本化周期', `T = 1 / fs = 1 / ${fs} = ${formatNumber(period, 4)} 秒`],
        ['量子化ビット数', `n = ${bits} bit`],
        ['量子化段階数', `2ⁿ = 2${bits === 2 ? '²' : bits === 3 ? '³' : '⁴'} = ${levels} 段階`],
        ['量子化幅', `(8 − 0) / ${levels} = ${formatNumber(width, 3)}`],
        ['表示範囲の標本数', `0〜1.5秒の範囲内：${sampleCount} 個`]
      ];
      this.metrics.replaceChildren(...metrics.map(([term, value]) => {
        const card = element('div', 'dr-metric');
        card.append(element('dt', '', term), element('dd', '', value));
        return card;
      }));
    }

    renderTable(samples) {
      if (this.state.stage === 1) {
        const note = element('p', 'dr-note', '「標本化」へ進むと、標本ごとの値を表で確認できます。');
        this.tableHost.replaceChildren(note);
        return;
      }
      const table = element('table', 'dr-sample-table');
      table.appendChild(element('caption', '', 'SVGと同期する標本値表（行を選ぶと同じ標本を強調）'));
      const thead = document.createElement('thead');
      const header = document.createElement('tr');
      ['標本', '時刻［秒］', '元の波形値', '量子化値', '量子化番号', '2進数'].forEach(text => {
        header.appendChild(element('th', '', text));
      });
      thead.appendChild(header);
      const tbody = document.createElement('tbody');
      samples.forEach(sample => {
        const row = document.createElement('tr');
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.dataset.sampleIndex = String(sample.index);
        row.setAttribute('aria-label', `標本${sample.index + 1}を選択`);
        const quantizedVisible = this.state.stage >= 3;
        const codeVisible = this.state.stage >= 4;
        [
          String(sample.index + 1),
          formatNumber(sample.time, 3),
          formatNumber(sample.value, 3),
          quantizedVisible ? formatNumber(sample.quantizedValue, 3) : '—',
          quantizedVisible ? String(sample.code) : '—',
          codeVisible ? sample.binary : '—'
        ].forEach(value => row.appendChild(element('td', '', value)));
        const activate = () => this.selectSample(sample.index);
        row.addEventListener('pointerenter', activate);
        row.addEventListener('focus', activate);
        row.addEventListener('click', activate);
        row.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          activate();
        });
        tbody.appendChild(row);
      });
      table.append(thead, tbody);
      const scroll = element('div', 'dr-table-scroll');
      scroll.appendChild(table);
      this.tableHost.replaceChildren(scroll);
    }

    selectSample(index) {
      this.state.selectedIndex = index;
      this.container.querySelectorAll('[data-sample-index]').forEach(node => {
        node.classList.toggle('is-active', Number(node.dataset.sampleIndex) === index);
        if (node.matches('tr')) {
          if (Number(node.dataset.sampleIndex) === index) node.setAttribute('aria-current', 'true');
          else node.removeAttribute('aria-current');
        }
      });
      if (this.state.stage === 1) {
        this.selectedReadout.innerHTML = '<strong>アナログ波形：</strong>「標本化」へ進むと、波形から取り出した点を選べます。';
        return;
      }
      const { samples } = this.derive();
      const sample = samples[index];
      if (!sample) return;
      const details = [
        `標本 ${index + 1}`,
        `t = ${formatNumber(sample.time, 3)} 秒`,
        `元の値 = ${formatNumber(sample.value, 3)}`
      ];
      if (this.state.stage >= 3) {
        details.push(`量子化値 = ${formatNumber(sample.quantizedValue, 3)}`, `番号 = ${sample.code}`);
      }
      if (this.state.stage >= 4) details.push(`${this.state.bitDepth}bitの符号 = ${sample.binary}`);
      this.selectedReadout.innerHTML = `<strong>選択中：</strong>${details.join(' ／ ')}`;
    }

    render() {
      const stageDescriptions = [
        '連続的に変化する電圧を、時間に沿った曲線として見ます。',
        '一定の時間間隔 T ごとに波形の値を取り出します。縦の補助線と丸い点が標本です。',
        '標本値を最も近い段階へそろえます。丸が元の値、四角が量子化値、赤い点線が誤差です。',
        '量子化番号を、量子化ビット数に合わせた固定長2進数へ置き換えます。'
      ];
      this.stageButtons.forEach((button, index) => {
        const stageNumber = index + 1;
        button.setAttribute('aria-pressed', stageNumber === this.state.stage ? 'true' : 'false');
        button.classList.toggle('is-complete', stageNumber <= this.state.stage);
      });
      this.stageHelp.innerHTML = `<strong>工程 ${this.state.stage}：</strong>${stageDescriptions[this.state.stage - 1]}`;

      const derived = this.derive();
      if (this.state.selectedIndex >= derived.samples.length) this.state.selectedIndex = 0;
      this.renderMetrics(derived.samples.length);
      Renderer.renderPCM(this.graph, {
        ...this.state,
        ...derived,
        axisTimeStep: 0.1,
        axisLabelEvery: 2,
        axisVoltageStep: 1
      }, {
        onSampleSelect: index => this.selectSample(index)
      });
      this.renderTable(derived.samples);
      this.selectSample(this.state.selectedIndex);
    }
  }

  function initializeWidgets(scope = document) {
    const instances = [];
    scope.querySelectorAll('[data-sound-pcm]').forEach(container => {
      try {
        instances.push(new PcmExplorer(container));
      } catch (error) {
        container.textContent = `PCM Explorerを表示できません：${error.message}`;
        console.error('[sound-widgets] PCM Explorer initialization failed:', error);
      }
    });
    return instances;
  }

  root.SoundWidgets = Object.freeze({
    element,
    formatNumber,
    createRangeControl,
    createSelectControl,
    PcmExplorer,
    initializeWidgets
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
