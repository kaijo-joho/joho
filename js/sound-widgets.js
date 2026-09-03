// 音のデジタル化と共通HTMLウィジェット。
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
      const title = element('h3', '', 'まず、元のアナログ波形を見る');
      const description = element(
        'p',
        '',
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
      this.container.replaceChildren(title, description, visual);
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
      this.state = { stage: 2, selectedIndex: 0 };
      this.model = fixedLessonModel();
      this.build();
      this.render();
    }

    build() {
      this.container.classList.add('dr-card', 'dr-guide');
      const title = element('h3', '', '固定した条件で順に見る');
      const intro = element('p', '', '先ほどのアナログ波形を、0.1秒間隔・3ビットでデジタル化します。ここでは条件を変えず、3つの手順に注目します。');
      this.stageSelector = element('fieldset', 'dr-stage-selector dr-stage-selector--three');
      this.stageSelector.appendChild(element('legend', '', '確認する手順'));
      const stages = [
        { stage: 2, label: '1. 標本化' },
        { stage: 3, label: '2. 量子化' },
        { stage: 4, label: '3. 符号化' }
      ];
      this.stageButtons = stages.map(item => {
        const button = element('button', 'dr-stage-button', item.label);
        button.type = 'button';
        button.dataset.stage = String(item.stage);
        button.addEventListener('click', () => {
          this.state.stage = item.stage;
          this.render();
        });
        this.stageSelector.appendChild(button);
        return button;
      });
      this.explanation = element('div', 'dr-guide__explanation');
      this.visual = element('figure', 'dr-visual');
      const legend = element('figcaption', 'dr-legend');
      legend.innerHTML = [
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--analog"></span>アナログ波形</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--sample"></span>標本化した点</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--quantized"></span>量子化後の値</span>'
      ].join('');
      const scroll = element('div', 'dr-visual__scroll');
      scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', '標本化・量子化・符号化を順に示すグラフ。狭い画面では横方向にスクロールできます。');
      scroll.appendChild(element('p', 'dr-visual__hint', '横にスクロールしてグラフ全体を確認できます'));
      this.graph = element('div');
      scroll.appendChild(this.graph);
      this.sampleReadout = element('p', 'dr-selected-readout');
      this.visual.append(legend, scroll, this.sampleReadout);
      const actions = element('div', 'dr-guide__actions');
      this.previousButton = element('button', 'dr-button', '前の手順');
      this.previousButton.type = 'button';
      this.previousButton.addEventListener('click', () => {
        this.state.stage = Math.max(2, this.state.stage - 1);
        this.render();
      });
      this.nextButton = element('button', 'dr-button dr-button--primary', '次の手順');
      this.nextButton.type = 'button';
      this.nextButton.addEventListener('click', () => {
        this.state.stage = Math.min(4, this.state.stage + 1);
        this.render();
      });
      actions.append(this.previousButton, this.nextButton);
      this.container.replaceChildren(title, intro, this.stageSelector, this.explanation, this.visual, actions);
    }

    selectSample(index) {
      this.state.selectedIndex = index;
      this.container.querySelectorAll('[data-sample-index]').forEach(node => {
        node.classList.toggle('is-active', Number(node.dataset.sampleIndex) === index);
      });
      const sample = this.model.samples[index];
      if (!sample) return;
      const parts = [
        `時刻 ${formatNumber(sample.time, 1)} 秒`,
        `波の高さ ${formatNumber(sample.value, 1)}`
      ];
      if (this.state.stage >= 3) parts.push(`量子化後 ${formatNumber(sample.quantizedValue, 1)}`, `段階値 ${sample.code}`);
      if (this.state.stage >= 4) parts.push(`3ビットの2進数 ${sample.binary}`);
      this.sampleReadout.innerHTML = `<strong>選んだ点：</strong>${parts.join(' ／ ')}`;
    }

    render() {
      const descriptions = {
        2: {
          title: '1. 標本化（サンプリング）',
          text: 'アナログ信号の横軸（時間）に沿って、一定の間隔で波の高さ（電圧の強さ）を取り出します。',
          point: 'この例では標本化の幅は0.1秒です。縦の線と丸い点を左から順に見てください。'
        },
        3: {
          title: '2. 量子化',
          text: '標本化で得られた波の高さを、縦軸（電圧）に沿って最も近い段階値にそろえます。',
          point: 'この例は3ビット量子化なので8段階です。この固定例では各点が段階値と重なるため、誤差は0です。'
        },
        4: {
          title: '3. 符号化（コード化）',
          text: '量子化した段階値を2進数で表現します。3ビットなので、どの値も3桁の0と1で表します。',
          point: '値2は010、値3は011、値5は101になります。PCMは「パルス符号変調」の略です。'
        }
      };
      const description = descriptions[this.state.stage];
      this.stageButtons.forEach(button => {
        const stage = Number(button.dataset.stage);
        button.setAttribute('aria-pressed', stage === this.state.stage ? 'true' : 'false');
        button.classList.toggle('is-complete', stage <= this.state.stage);
      });
      const heading = element('h4', '', description.title);
      this.explanation.replaceChildren(
        heading,
        element('p', '', description.text),
        element('p', 'dr-guide__point', description.point)
      );
      Renderer.renderPCM(this.graph, {
        ...this.model,
        stage: this.state.stage,
        selectedIndex: this.state.selectedIndex,
        showStaircase: false,
        axisTimeStep: 0.1,
        axisLabelEvery: 1,
        axisVoltageStep: 1
      }, {
        title: `${description.title}の固定例`,
        description: `${description.text} ${description.point}`,
        onSampleSelect: index => this.selectSample(index)
      });
      this.previousButton.disabled = this.state.stage === 2;
      this.nextButton.disabled = this.state.stage === 4;
      this.nextButton.textContent = this.state.stage === 4 ? '3つの手順を確認しました' : '次の手順';
      this.selectSample(this.state.selectedIndex);
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
      const title = element('h3', '', '標本化周波数と量子化ビット数を変えてみる');
      const intro = element('p', '', 'ここからは条件を自由に変えます。値を動かし、標本化した点の数や量子化の段階がどう変わるか確かめましょう。工程の表示は累積されます。');

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
        ['量子化の幅', `(8 − 0) / ${levels} = ${formatNumber(width, 3)}`],
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
      ['標本', '時刻［秒］', '元の波形値', '量子化後の値', '段階値', '2進数'].forEach(text => {
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
        details.push(`量子化後の値 = ${formatNumber(sample.quantizedValue, 3)}`, `段階値 = ${sample.code}`);
      }
      if (this.state.stage >= 4) details.push(`${this.state.bitDepth}bitの2進数 = ${sample.binary}`);
      this.selectedReadout.innerHTML = `<strong>選択中：</strong>${details.join(' ／ ')}`;
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
    AnalogWaveIntro,
    PcmWalkthrough,
    PcmExplorer,
    initializeWidgets
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
