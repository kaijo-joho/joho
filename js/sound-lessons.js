// 波の重ね合わせと標本化定理の操作教材。
(function (root) {
  'use strict';

  const Core = root.SoundCore;
  const Renderer = root.SoundRenderer;
  const Widgets = root.SoundWidgets;
  if (!Core || !Renderer || !Widgets) throw new Error('sound-lessons.jsの依存ファイルが読み込まれていません。');

  let lessonSerial = 0;
  const el = Widgets.element;

  class SuperpositionLab {
    constructor(container) {
      if (!(container instanceof Element)) throw new TypeError('波の重ね合わせ教材の表示先が必要です。');
      lessonSerial += 1;
      this.serial = lessonSerial;
      this.container = container;
      this.state = {
        a: { amplitude: 2, frequency: 1, phaseDegrees: 0 },
        b: { amplitude: 1.5, frequency: 2, phaseDegrees: 90 },
        visible: { a: true, b: true, sum: true },
        selectedTime: 0.25,
        duration: 2
      };
      this.build();
      this.render();
    }

    buildWaveControls(key, label) {
      const prefix = `dr-super-${this.serial}-${key}`;
      const group = el('div', 'dr-card');
      group.appendChild(el('h4', '', label));
      const controls = el('div', 'dr-control-panel dr-control-panel--compact');
      const amplitude = Widgets.createRangeControl({
        id: `${prefix}-amplitude`,
        label: '振幅',
        value: this.state[key].amplitude,
        min: 0,
        max: 3,
        step: 0.25,
        format: value => Widgets.formatNumber(value, 2),
        onInput: value => {
          this.state[key].amplitude = value;
          this.render();
        }
      });
      const frequency = Widgets.createRangeControl({
        id: `${prefix}-frequency`,
        label: '周波数',
        value: this.state[key].frequency,
        min: 0.5,
        max: 4,
        step: 0.5,
        format: value => `${Widgets.formatNumber(value, 1)} Hz`,
        onInput: value => {
          this.state[key].frequency = value;
          this.render();
        }
      });
      const phase = Widgets.createRangeControl({
        id: `${prefix}-phase`,
        label: '位相',
        value: this.state[key].phaseDegrees,
        min: 0,
        max: 315,
        step: 45,
        format: value => `${value}°`,
        onInput: value => {
          this.state[key].phaseDegrees = value;
          this.render();
        }
      });
      controls.append(amplitude.wrapper, frequency.wrapper, phase.wrapper);
      group.appendChild(controls);
      return group;
    }

    build() {
      this.container.classList.add('dr-lab');
      const heading = el('h3', '', '波の重ね合わせを確かめる');
      const intro = el('p', '', '波Aと波Bを同じ時間軸に重ね、選んだ時刻で「高さを足す」ことを確かめます。');
      const controlGrid = el('div', 'dr-wave-control-grid');
      const waveA = this.buildWaveControls('a', '波A（青・実線）');
      const waveB = this.buildWaveControls('b', '波B（橙・破線）');
      controlGrid.replaceChildren(waveA, waveB);

      this.visibility = el('div', 'dr-toggle-row');
      [
        ['a', '波Aを表示'],
        ['b', '波Bを表示'],
        ['sum', '合成波を表示']
      ].forEach(([key, text]) => {
        const label = el('label', 'dr-toggle');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = this.state.visible[key];
        input.addEventListener('change', () => {
          this.state.visible[key] = input.checked;
          this.render();
        });
        label.append(input, document.createTextNode(text));
        this.visibility.appendChild(label);
      });

      const timeControl = Widgets.createRangeControl({
        id: `dr-super-${this.serial}-time`,
        label: '確認する時刻',
        value: this.state.selectedTime,
        min: 0,
        max: this.state.duration,
        step: 0.01,
        format: value => `${Widgets.formatNumber(value, 2)} 秒`,
        onInput: value => {
          this.state.selectedTime = value;
          this.render();
        }
      });
      const selectedPanel = el('div', 'dr-control-panel');
      selectedPanel.appendChild(timeControl.wrapper);
      this.equation = el('p', 'dr-equation');
      this.legend = el('div', 'dr-legend');
      this.legend.innerHTML = [
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--a"></span>波A（実線）</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--b"></span>波B（破線）</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--sum"></span>合成波（太線）</span>'
      ].join('');
      const scroll = el('div', 'dr-visual__scroll');
      scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', '波A、波B、合成波のグラフ。狭い画面では横方向にスクロールできます。');
      scroll.appendChild(el('p', 'dr-visual__hint', '横にスクロールしてグラフ全体を確認できます'));
      this.graph = el('div');
      scroll.appendChild(this.graph);
      this.container.replaceChildren(heading, intro, controlGrid, this.visibility, selectedPanel, this.equation, this.legend, scroll);
    }

    render() {
      const components = {
        a: {
          amplitude: this.state.a.amplitude,
          frequency: this.state.a.frequency,
          phase: Core.degreesToRadians(this.state.a.phaseDegrees),
          offset: 0
        },
        b: {
          amplitude: this.state.b.amplitude,
          frequency: this.state.b.frequency,
          phase: Core.degreesToRadians(this.state.b.phaseDegrees),
          offset: 0
        }
      };
      const result = Renderer.renderSuperposition(this.graph, {
        components,
        visible: this.state.visible,
        selectedTime: this.state.selectedTime,
        duration: this.state.duration
      });
      this.equation.innerHTML = [
        `t = ${Widgets.formatNumber(result.time, 2)} 秒：`,
        `<strong>波A ${Widgets.formatNumber(result.values.a, 2)}</strong>`,
        '+',
        `<strong>波B ${Widgets.formatNumber(result.values.b, 2)}</strong>`,
        '=',
        `<strong>合成波 ${Widgets.formatNumber(result.values.sum, 2)}</strong>`
      ].join(' ');
    }
  }

  class SamplingTheoremLab {
    constructor(container) {
      if (!(container instanceof Element)) throw new TypeError('標本化定理教材の表示先が必要です。');
      lessonSerial += 1;
      this.serial = lessonSerial;
      this.container = container;
      this.state = {
        frequency: 4,
        sampleRate: 10,
        amplitude: 3,
        phaseDegrees: 0,
        duration: 1
      };
      this.build();
      this.render();
    }

    build() {
      this.container.classList.add('dr-lab');
      const heading = el('h3', '', '標本化定理を確かめる');
      const intro = el('p', '', '元の波の周波数と標本化周波数を動かし、標本化する回数によって波形の見え方がどう変わるか調べます。2倍ちょうどにしたときは、位相も動かして標本値の違いを確かめます。');
      const grid = el('div', 'dr-lab-grid');
      const controls = el('div', 'dr-control-panel');
      const frequency = Widgets.createRangeControl({
        id: `dr-theorem-${this.serial}-frequency`,
        label: '元の波の周波数',
        value: this.state.frequency,
        min: 1,
        max: 10,
        step: 0.5,
        format: value => `${Widgets.formatNumber(value, 1)} Hz`,
        onInput: value => {
          this.state.frequency = value;
          this.render();
        }
      });
      const sampleRate = Widgets.createRangeControl({
        id: `dr-theorem-${this.serial}-sample-rate`,
        label: '標本化周波数 fs',
        value: this.state.sampleRate,
        min: 2,
        max: 20,
        step: 1,
        format: value => `${value} Hz`,
        onInput: value => {
          this.state.sampleRate = value;
          this.render();
        }
      });
      const phase = Widgets.createRangeControl({
        id: `dr-theorem-${this.serial}-phase`,
        label: '元の波の位相（境界の確認用）',
        value: this.state.phaseDegrees,
        min: 0,
        max: 180,
        step: 15,
        format: value => `${value}°`,
        onInput: value => {
          this.state.phaseDegrees = value;
          this.render();
        }
      });
      controls.append(frequency.wrapper, sampleRate.wrapper, phase.wrapper);
      const visual = el('div', 'dr-lab-grid__visual');
      this.metrics = el('dl', 'dr-metrics');
      this.status = el('div', 'dr-theorem-status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.legend = el('div', 'dr-legend');
      const scroll = el('div', 'dr-visual__scroll');
      scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', '標本化定理を確認するグラフ。狭い画面では横方向にスクロールできます。');
      scroll.appendChild(el('p', 'dr-visual__hint', '横にスクロールしてグラフ全体を確認できます'));
      this.graph = el('div');
      scroll.appendChild(this.graph);
      visual.append(this.metrics, this.status, this.legend, scroll);
      grid.append(controls, visual);
      const warning = el('p', 'dr-warning-note');
      warning.innerHTML = '<strong>破線について：</strong>破線は「復元された正解波形」ではありません。同じ標本点を通る、元の波とは別の波形です。標本点を折れ線で結んだ表示でもありません。';
      this.container.replaceChildren(heading, intro, grid, warning);
    }

    render() {
      const phase = Core.degreesToRadians(this.state.phaseDegrees);
      const result = Renderer.renderSamplingTheorem(this.graph, {
        frequency: this.state.frequency,
        sampleRate: this.state.sampleRate,
        amplitude: this.state.amplitude,
        phase,
        offset: 0,
        duration: this.state.duration
      });
      const twice = this.state.frequency * 2;
      const metrics = [
        ['元の波の周波数', `${Widgets.formatNumber(this.state.frequency, 1)} Hz`],
        ['標本化周波数', `fs = ${this.state.sampleRate} Hz`],
        ['最大周波数の2倍', `${Widgets.formatNumber(this.state.frequency, 1)} × 2 = ${Widgets.formatNumber(twice, 1)} Hz`]
      ];
      this.metrics.replaceChildren(...metrics.map(([term, value]) => {
        const card = el('div', 'dr-metric');
        card.append(el('dt', '', term), el('dd', '', value));
        return card;
      }));

      this.status.className = `dr-theorem-status is-${result.theorem.state}`;
      if (result.theorem.state === 'sufficient') {
        this.status.innerHTML = `<strong>条件を満たしています：${this.state.sampleRate} Hz &gt; ${Widgets.formatNumber(this.state.frequency, 1)} Hz × 2</strong>標本化周波数が元の波の周波数の2倍より大きいため、元の波形を再現できます。`;
      } else if (result.theorem.state === 'boundary') {
        const detail = result.candidate?.kind === 'boundary-flat'
          ? '現在の位相では標本値がすべて0になり、平らな線とも区別できません。位相を動かして違いを比べてください。'
          : '位相によって標本値は変わります。同じ標本の並びになる別の波形もあり、2倍ちょうどでは元の波形を一意に判断できるとは限りません。';
        this.status.innerHTML = `<strong>2倍ちょうどです：${this.state.sampleRate} Hz = ${Widgets.formatNumber(this.state.frequency, 1)} Hz × 2</strong>${detail}`;
      } else {
        const otherWaveText = result.candidate
          ? `${Widgets.formatNumber(result.candidate.frequency, 2)} Hzの別の波形（破線）`
          : '別の波形';
        this.status.innerHTML = `<strong>標本化する回数が不足しています：${this.state.sampleRate} Hz &lt; ${Widgets.formatNumber(this.state.frequency, 1)} Hz × 2</strong>元の${Widgets.formatNumber(this.state.frequency, 1)} Hzの波形と${otherWaveText}が同じ標本点を通るため、元の波形とは異なる波形として見えてしまいます。`;
      }
      const legendParts = [
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--analog"></span>元の波形（実線）</span>',
        '<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--sample"></span>標本時刻・標本点</span>'
      ];
      if (result.candidate) {
        legendParts.push('<span class="dr-legend__item"><span class="dr-legend__line dr-legend__line--candidate"></span>同じ標本点を通る別の波形（破線）</span>');
      }
      this.legend.innerHTML = legendParts.join('');
    }
  }

  function initializeLessons(scope = document) {
    const instances = [];
    scope.querySelectorAll('[data-sound-superposition]').forEach(container => {
      try {
        instances.push(new SuperpositionLab(container));
      } catch (error) {
        container.textContent = `波の重ね合わせ教材を表示できません：${error.message}`;
        console.error('[sound-lessons] superposition initialization failed:', error);
      }
    });
    scope.querySelectorAll('[data-sound-sampling-theorem]').forEach(container => {
      try {
        instances.push(new SamplingTheoremLab(container));
      } catch (error) {
        container.textContent = `標本化定理教材を表示できません：${error.message}`;
        console.error('[sound-lessons] sampling theorem initialization failed:', error);
      }
    });
    return instances;
  }

  root.SoundLessons = Object.freeze({
    SuperpositionLab,
    SamplingTheoremLab,
    initializeLessons
  });

  function initialize() {
    Widgets.initializeWidgets();
    initializeLessons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
