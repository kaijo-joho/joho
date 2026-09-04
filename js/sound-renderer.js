// 音のデジタル表現で共通利用するSVG描画モジュール。
(function (root) {
  'use strict';

  const Core = root.SoundCore;
  if (!Core) throw new Error('sound-renderer.jsより先にsound-core.jsを読み込んでください。');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let svgSerial = 0;

  function svgElement(name, attributes = {}, text = '') {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value != null) node.setAttribute(key, String(value));
    });
    if (text !== '') node.textContent = text;
    return node;
  }

  function assertTarget(target) {
    if (!(target instanceof Element)) throw new TypeError('SVGの表示先要素を指定してください。');
  }

  function createSvg(options = {}) {
    const width = Number(options.width ?? 960);
    const height = Number(options.height ?? 460);
    svgSerial += 1;
    const titleId = `dr-svg-title-${svgSerial}`;
    const descriptionId = `dr-svg-description-${svgSerial}`;
    const svg = svgElement('svg', {
      class: `dr-svg${options.className ? ` ${options.className}` : ''}`,
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-labelledby': `${titleId} ${descriptionId}`,
      preserveAspectRatio: 'xMidYMid meet'
    });
    svg.append(
      svgElement('title', { id: titleId }, options.title || '波形グラフ'),
      svgElement('desc', { id: descriptionId }, options.description || '時間に対する波形の変化を表すグラフです。')
    );
    return svg;
  }

  function createPlot(options = {}) {
    const width = Number(options.width ?? 960);
    const height = Number(options.height ?? 460);
    const margin = {
      top: Number(options.margin?.top ?? 34),
      right: Number(options.margin?.right ?? 30),
      bottom: Number(options.margin?.bottom ?? 70),
      left: Number(options.margin?.left ?? 70)
    };
    const xMin = Number(options.xMin ?? 0);
    const xMax = Number(options.xMax ?? 1);
    const yMin = Number(options.yMin ?? -1);
    const yMax = Number(options.yMax ?? 1);
    if (![width, height, xMin, xMax, yMin, yMax, ...Object.values(margin)].every(Number.isFinite)) {
      throw new TypeError('SVG座標には有限の数値を指定してください。');
    }
    if (xMax <= xMin || yMax <= yMin) throw new RangeError('SVG座標範囲が不正です。');
    const left = margin.left;
    const right = width - margin.right;
    const top = margin.top;
    const bottom = height - margin.bottom;
    const x = value => left + (Number(value) - xMin) / (xMax - xMin) * (right - left);
    const y = value => bottom - (Number(value) - yMin) / (yMax - yMin) * (bottom - top);
    return Object.freeze({
      width,
      height,
      margin: Object.freeze(margin),
      xMin,
      xMax,
      yMin,
      yMax,
      left,
      right,
      top,
      bottom,
      x,
      y
    });
  }

  function numberText(value, digits = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    if (Math.abs(number) < 1e-10) return '0';
    return Number(number.toFixed(digits)).toString();
  }

  function pathFromPoints(points, plot) {
    if (!Array.isArray(points) || points.length === 0) return '';
    return points.map((point, index) => {
      const prefix = index === 0 ? 'M' : 'L';
      return `${prefix} ${numberText(plot.x(point.time), 2)} ${numberText(plot.y(point.value), 2)}`;
    }).join(' ');
  }

  function layer(name, className = '') {
    return svgElement('g', {
      class: `dr-svg__layer dr-svg__layer--${name}${className ? ` ${className}` : ''}`,
      'data-layer': name
    });
  }

  function appendPlotBackground(target, plot) {
    target.appendChild(svgElement('rect', {
      class: 'dr-svg__plot-background',
      x: plot.left,
      y: plot.top,
      width: plot.right - plot.left,
      height: plot.bottom - plot.top,
      rx: 8
    }));
  }

  function ticks(min, max, step) {
    const values = [];
    const interval = Number(step);
    if (!(interval > 0)) return values;
    for (let value = min, guard = 0; value <= max + Core.EPSILON && guard < 1000; value += interval, guard += 1) {
      values.push(Number(value.toFixed(10)));
    }
    return values;
  }

  function appendAxes(svg, plot, options = {}) {
    const timeAxis = layer('time-axis');
    const voltageAxis = layer('voltage-axis');
    const grid = layer('grid');
    const xStep = Number(options.xStep ?? (plot.xMax - plot.xMin) / 10);
    const yStep = Number(options.yStep ?? (plot.yMax - plot.yMin) / 8);
    const xValues = ticks(plot.xMin, plot.xMax, xStep);
    const yValues = ticks(plot.yMin, plot.yMax, yStep);

    xValues.forEach((value, index) => {
      const x = plot.x(value);
      grid.appendChild(svgElement('line', {
        class: 'dr-svg__grid-line',
        x1: x,
        y1: plot.top,
        x2: x,
        y2: plot.bottom
      }));
      const showLabel = options.labelEveryX == null || index % options.labelEveryX === 0 || index === xValues.length - 1;
      if (showLabel) {
        timeAxis.appendChild(svgElement('text', {
          class: 'dr-svg__tick-label',
          x,
          y: plot.bottom + 24,
          'text-anchor': 'middle'
        }, numberText(value, 3)));
      }
    });

    yValues.forEach(value => {
      const y = plot.y(value);
      grid.appendChild(svgElement('line', {
        class: 'dr-svg__grid-line',
        x1: plot.left,
        y1: y,
        x2: plot.right,
        y2: y
      }));
      voltageAxis.appendChild(svgElement('text', {
        class: 'dr-svg__tick-label',
        x: plot.left - 12,
        y: y + 4,
        'text-anchor': 'end'
      }, numberText(value, 3)));
    });

    timeAxis.append(
      svgElement('line', {
        class: 'dr-svg__axis-line',
        x1: plot.left,
        y1: plot.bottom,
        x2: plot.right,
        y2: plot.bottom
      }),
      svgElement('text', {
        class: 'dr-svg__axis-label',
        x: plot.right,
        y: plot.bottom + 48,
        'text-anchor': 'end'
      }, options.xLabel || '時間［秒］')
    );
    voltageAxis.append(
      svgElement('line', {
        class: 'dr-svg__axis-line',
        x1: plot.left,
        y1: plot.top,
        x2: plot.left,
        y2: plot.bottom
      }),
      svgElement('text', {
        class: 'dr-svg__axis-label',
        x: plot.left,
        y: plot.top - 13,
        'text-anchor': 'start'
      }, options.yLabel || '電圧')
    );

    // 指定されたレイヤー順を保つため、時間軸・電圧軸・グリッドの順に返す。
    svg.append(timeAxis, voltageAxis, grid);
  }

  function appendWave(layerNode, points, plot, className, label) {
    layerNode.appendChild(svgElement('path', {
      class: `dr-svg__wave ${className}`,
      d: pathFromPoints(points, plot),
      fill: 'none',
      'aria-label': label
    }));
  }

  function staircasePath(samples, plot) {
    if (!samples.length) return '';
    let d = `M ${numberText(plot.x(samples[0].time), 2)} ${numberText(plot.y(samples[0].quantizedValue), 2)}`;
    for (let index = 1; index < samples.length; index += 1) {
      const x = plot.x(samples[index].time);
      d += ` H ${numberText(x, 2)} V ${numberText(plot.y(samples[index].quantizedValue), 2)}`;
    }
    return d;
  }

  function bindSampleTargets(svg, samples, options = {}) {
    const onSelect = options.onSampleSelect;
    const onClear = options.onSampleClear;
    if (typeof onSelect !== 'function') return;
    svg.querySelectorAll('.dr-svg__sample-target').forEach(target => {
      const index = Number(target.dataset.sampleIndex);
      const activate = () => onSelect(index, samples[index]);
      target.addEventListener('pointerenter', activate);
      target.addEventListener('focus', activate);
      target.addEventListener('click', activate);
      target.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      });
    });
    if (typeof onClear === 'function') {
      svg.addEventListener('pointerleave', () => {
        // キーボード操作中の明示的なフォーカス表示は、ポインタ位置にかかわらず維持する。
        if (svg.querySelector('.dr-svg__sample-target:focus-visible')) return;
        onClear();
      });
      svg.addEventListener('focusout', event => {
        if (event.relatedTarget && svg.contains(event.relatedTarget)) return;
        onClear();
      });
    }
  }

  function renderAnalogWave(target, model, options = {}) {
    assertTarget(target);
    const width = 1040;
    const height = 390;
    const range = model.range || Core.DEFAULT_VOLTAGE_RANGE;
    const plot = createPlot({
      width,
      height,
      xMin: model.start,
      xMax: model.end,
      yMin: range.min,
      yMax: range.max,
      margin: { top: 38, right: 28, bottom: 70, left: 68 }
    });
    const svg = createSvg({
      width,
      height,
      className: 'dr-svg--analog-intro',
      title: options.title || '音のアナログ波形',
      description: options.description || '横軸を時間、縦軸を電圧として、連続的に変化する音の電気信号を曲線で示します。'
    });

    const drawingArea = layer('drawing-area');
    appendPlotBackground(drawingArea, plot);
    svg.appendChild(drawingArea);
    appendAxes(svg, plot, {
      xStep: model.axisTimeStep ?? 0.1,
      yStep: model.axisVoltageStep ?? 1,
      labelEveryX: model.axisLabelEvery ?? 2
    });
    const analogLayer = layer('analog-wave');
    appendWave(analogLayer, model.wavePoints || [], plot, 'dr-svg__wave--analog', '時間とともに連続的に変化するアナログ波形');
    svg.appendChild(analogLayer);
    target.replaceChildren(svg);
    return { svg, plot };
  }

  function renderPCM(target, model, options = {}) {
    assertTarget(target);
    const width = 1160;
    const compact = model.compact === true;
    const height = compact ? 330 : 520;
    const stage = Math.max(1, Math.min(4, Number(model.stage) || 1));
    const animationStage = Math.max(0, Math.min(4, Number(model.animationStage) || 0));
    const range = model.range || Core.DEFAULT_VOLTAGE_RANGE;
    const samples = model.samples || [];
    const plot = createPlot({
      width,
      height,
      xMin: model.start,
      xMax: model.end,
      yMin: range.min,
      yMax: range.max,
      margin: compact
        ? { top: 26, right: 28, bottom: 86, left: 68 }
        : { top: 38, right: 28, bottom: 145, left: 68 }
    });
    const svg = createSvg({
      width,
      height,
      className: `dr-svg--pcm${animationStage ? ` dr-svg--stage-enter-${animationStage}` : ''}`,
      title: options.title || '音のデジタル化の手順',
      description: options.description || 'アナログ波形から一定間隔で値を取り出し、最も近い段階値へそろえ、決められたビット数の2進数で表す手順を示します。'
    });

    const drawingArea = layer('drawing-area');
    appendPlotBackground(drawingArea, plot);
    svg.appendChild(drawingArea);
    appendAxes(svg, plot, {
      xStep: model.axisTimeStep ?? 0.1,
      yStep: model.axisVoltageStep ?? 1,
      labelEveryX: model.axisLabelEvery ?? 2
    });

    const quantizationLayer = layer('quantization-levels');
    if (stage >= 3) {
      const widthValue = Core.quantizationWidth(model.bitDepth, range);
      const levels = Core.quantizationLevels(model.bitDepth);
      for (let code = 0; code < levels; code += 1) {
        const value = range.min + code * widthValue;
        quantizationLayer.appendChild(svgElement('line', {
          class: 'dr-svg__quantization-line',
          x1: plot.left,
          y1: plot.y(value),
          x2: plot.right,
          y2: plot.y(value),
          style: `--dr-sequence: ${code}`
        }));
      }
    }
    svg.appendChild(quantizationLayer);

    const analogLayer = layer('analog-wave');
    appendWave(analogLayer, model.wavePoints || [], plot, 'dr-svg__wave--analog', '連続したアナログ波形');
    svg.appendChild(analogLayer);

    const sampleGuideLayer = layer('sample-guides');
    if (stage >= 2) {
      samples.forEach(sample => {
        sampleGuideLayer.appendChild(svgElement('line', {
          class: 'dr-svg__sample-guide',
          x1: plot.x(sample.time),
          y1: plot.top,
          x2: plot.x(sample.time),
          y2: plot.bottom,
          style: `--dr-sequence: ${sample.index}`,
          'data-sample-index': sample.index
        }));
      });
    }
    svg.appendChild(sampleGuideLayer);

    const sampleLayer = layer('samples');
    if (stage >= 2) {
      samples.forEach(sample => {
        const x = plot.x(sample.time);
        const y = plot.y(sample.value);
        sampleLayer.append(
          svgElement('line', {
            class: 'dr-svg__stem',
            x1: x,
            y1: plot.bottom,
            x2: x,
            y2: y,
            style: `--dr-sequence: ${sample.index}`,
            'data-sample-index': sample.index
          }),
          svgElement('circle', {
            class: 'dr-svg__sample-point',
            cx: x,
            cy: y,
            r: 5.5,
            style: `--dr-sequence: ${sample.index}`,
            'data-sample-index': sample.index
          })
        );
      });
    }
    svg.appendChild(sampleLayer);

    const quantizedPointLayer = layer('quantized-points');
    if (stage >= 3) {
      samples.forEach(sample => {
        quantizedPointLayer.appendChild(svgElement('rect', {
          class: 'dr-svg__quantized-point',
          x: plot.x(sample.time) - 5,
          y: plot.y(sample.quantizedValue) - 5,
          width: 10,
          height: 10,
          rx: 1.5,
          style: `--dr-sequence: ${sample.index}`,
          'data-sample-index': sample.index
        }));
      });
    }
    svg.appendChild(quantizedPointLayer);

    const errorLayer = layer('quantization-errors');
    if (stage >= 3) {
      samples.forEach(sample => {
        errorLayer.appendChild(svgElement('line', {
          class: 'dr-svg__error-line',
          x1: plot.x(sample.time),
          y1: plot.y(sample.value),
          x2: plot.x(sample.time),
          y2: plot.y(sample.quantizedValue),
          style: `--dr-sequence: ${sample.index}`,
          'data-sample-index': sample.index
        }));
      });
    }
    svg.appendChild(errorLayer);

    const staircaseLayer = layer('staircase');
    if (stage >= 3 && model.showStaircase !== false) {
      staircaseLayer.appendChild(svgElement('path', {
        class: 'dr-svg__staircase',
        d: staircasePath(samples, plot),
        fill: 'none',
        'aria-label': '量子化後の値の階段状表示'
      }));
    }
    svg.appendChild(staircaseLayer);

    const valueLayer = layer('quantized-values');
    if (stage >= 3) {
      samples.forEach(sample => {
        const quantizedY = plot.y(sample.quantizedValue);
        const labelY = Math.max(plot.top + 15, quantizedY - 11);
        valueLayer.appendChild(svgElement('text', {
          class: 'dr-svg__value-label',
          x: plot.x(sample.time),
          y: labelY,
          'text-anchor': 'middle',
          style: `--dr-sequence: ${sample.index}`,
          'data-sample-index': sample.index
        }, numberText(sample.quantizedValue, 2)));
      });
    }
    svg.appendChild(valueLayer);

    const binaryLayer = layer('binary-codes');
    if (stage >= 4) {
      binaryLayer.appendChild(svgElement('text', {
        class: 'dr-svg__code-heading',
        x: plot.left,
        y: plot.bottom + (compact ? 40 : 82),
        style: '--dr-sequence: 0'
      }, `${model.bitDepth}ビットの2進数`));
      samples.forEach(sample => {
        binaryLayer.appendChild(svgElement('text', {
          class: 'dr-svg__binary-label',
          x: plot.x(sample.time),
          y: plot.bottom + (compact ? 68 : 112),
          'text-anchor': 'middle',
          style: `--dr-sequence: ${sample.index}`,
          'data-sample-index': sample.index
        }, sample.binary));
      });
    }
    svg.appendChild(binaryLayer);

    const highlightLayer = layer('selected-sample');
    if (stage >= 2) samples.forEach(sample => {
      const previousX = sample.index > 0 ? plot.x(samples[sample.index - 1].time) : plot.x(sample.time);
      const nextX = sample.index < samples.length - 1 ? plot.x(samples[sample.index + 1].time) : plot.x(sample.time);
      const halfLeft = sample.index > 0 ? (plot.x(sample.time) - previousX) / 2 : Math.max(16, (nextX - plot.x(sample.time)) / 2);
      const halfRight = sample.index < samples.length - 1 ? (nextX - plot.x(sample.time)) / 2 : Math.max(16, (plot.x(sample.time) - previousX) / 2);
      highlightLayer.appendChild(svgElement('rect', {
        class: 'dr-svg__sample-target',
        x: plot.x(sample.time) - Math.max(18, halfLeft),
        y: plot.top,
        width: Math.max(36, halfLeft + halfRight),
        height: plot.bottom - plot.top + (stage >= 4 ? (compact ? 76 : 122) : 0),
        fill: 'transparent',
        tabindex: 0,
        role: 'button',
        'aria-label': `標本${sample.index + 1}。時刻${numberText(sample.time, 3)}秒、元の値${numberText(sample.value, 3)}${stage >= 3 ? `、量子化後の値${numberText(sample.quantizedValue, 3)}、段階値${sample.code}` : ''}${stage >= 4 ? `、2進数${sample.binary}` : ''}`,
        'data-sample-index': sample.index
      }));
    });
    svg.appendChild(highlightLayer);

    target.replaceChildren(svg);
    bindSampleTargets(svg, samples, options);
    return { svg, plot };
  }

  function renderSuperposition(target, model, options = {}) {
    assertTarget(target);
    const width = 960;
    const height = 440;
    const components = model.components;
    const span = Math.max(
      2,
      Math.abs(components.a.amplitude) + Math.abs(components.b.amplitude) + 0.5
    );
    const plot = createPlot({
      width,
      height,
      xMin: 0,
      xMax: model.duration,
      yMin: -span,
      yMax: span,
      margin: { top: 38, right: 24, bottom: 66, left: 66 }
    });
    const svg = createSvg({
      width,
      height,
      className: 'dr-svg--superposition',
      title: options.title || '2つの波と合成波',
      description: options.description || '同じ時刻における波Aと波Bの高さを足すと合成波の高さになることを示します。'
    });
    const background = layer('drawing-area');
    appendPlotBackground(background, plot);
    svg.appendChild(background);
    appendAxes(svg, plot, { xStep: model.duration / 8, yStep: 1, yLabel: '高さ' });

    const pointsA = Core.waveformPoints(t => Core.sineValue(components.a, t), { start: 0, end: model.duration, count: 481 });
    const pointsB = Core.waveformPoints(t => Core.sineValue(components.b, t), { start: 0, end: model.duration, count: 481 });
    const sumPoints = Core.waveformPoints(t => Core.sumSineWaves([components.a, components.b], t), { start: 0, end: model.duration, count: 481 });
    const waves = layer('waves');
    if (model.visible.a) appendWave(waves, pointsA, plot, 'dr-svg__wave--a', '波A');
    if (model.visible.b) appendWave(waves, pointsB, plot, 'dr-svg__wave--b', '波B');
    if (model.visible.sum) appendWave(waves, sumPoints, plot, 'dr-svg__wave--sum', '波Aと波Bの合成波');
    svg.appendChild(waves);

    const selected = layer('selected-time');
    const time = Math.max(0, Math.min(model.duration, model.selectedTime));
    const values = {
      a: Core.sineValue(components.a, time),
      b: Core.sineValue(components.b, time),
      sum: Core.sumSineWaves([components.a, components.b], time)
    };
    selected.appendChild(svgElement('line', {
      class: 'dr-svg__selected-time-line',
      x1: plot.x(time),
      y1: plot.top,
      x2: plot.x(time),
      y2: plot.bottom
    }));
    ['a', 'b', 'sum'].forEach(key => {
      if (!model.visible[key]) return;
      selected.appendChild(svgElement('circle', {
        class: `dr-svg__selected-value dr-svg__selected-value--${key}`,
        cx: plot.x(time),
        cy: plot.y(values[key]),
        r: key === 'sum' ? 6 : 4.5
      }));
    });
    svg.appendChild(selected);
    target.replaceChildren(svg);
    return { svg, plot, values, time };
  }

  function renderSamplingTheorem(target, model, options = {}) {
    assertTarget(target);
    const width = 960;
    const height = 440;
    const amplitude = Number(model.amplitude ?? 3);
    const offset = Number(model.offset ?? 0);
    const padding = Math.max(0.5, Math.abs(amplitude) * 0.25);
    const verticalSpan = Math.ceil(Math.abs(amplitude) + padding);
    const plot = createPlot({
      width,
      height,
      xMin: 0,
      xMax: model.duration,
      yMin: offset - verticalSpan,
      yMax: offset + verticalSpan,
      margin: { top: 38, right: 24, bottom: 66, left: 66 }
    });
    const theorem = Core.samplingTheoremState(model.frequency, model.sampleRate);
    const original = {
      amplitude,
      frequency: model.frequency,
      phase: model.phase,
      offset
    };
    const candidate = Core.aliasCandidate({ ...original, sampleRate: model.sampleRate });
    const samples = Core.sampleSignal(t => Core.sineValue(original, t), {
      start: 0,
      end: model.duration,
      sampleRate: model.sampleRate
    });
    const originalPoints = Core.waveformPoints(t => Core.sineValue(original, t), {
      start: 0,
      end: model.duration,
      count: 721
    });
    const svg = createSvg({
      width,
      height,
      className: `dr-svg--sampling-theorem is-${theorem.state}`,
      title: options.title || '標本化定理を確かめるグラフ',
      description: options.description || '元の正弦波、標本時刻と標本点、同じ標本点を通る別の波形を表示します。破線は復元結果ではありません。'
    });
    const background = layer('drawing-area');
    appendPlotBackground(background, plot);
    svg.appendChild(background);
    appendAxes(svg, plot, { xStep: model.duration / 10, yStep: 1, yLabel: '振幅' });

    const originalLayer = layer('original-wave');
    appendWave(originalLayer, originalPoints, plot, 'dr-svg__wave--original', '元の波形（実線）');
    svg.appendChild(originalLayer);

    const guides = layer('sample-guides');
    const points = layer('sample-points');
    samples.forEach(sample => {
      const x = plot.x(sample.time);
      guides.appendChild(svgElement('line', {
        class: 'dr-svg__sample-guide',
        x1: x,
        y1: plot.top,
        x2: x,
        y2: plot.bottom
      }));
      points.appendChild(svgElement('circle', {
        class: 'dr-svg__theorem-sample',
        cx: x,
        cy: plot.y(sample.value),
        r: 5,
        'aria-label': `時刻${numberText(sample.time, 3)}秒の標本値${numberText(sample.value, 3)}`
      }));
    });
    svg.append(guides, points);

    const candidateLayer = layer('alias-candidate');
    if (candidate) {
      const candidatePoints = Core.waveformPoints(t => Core.sineValue(candidate, t), {
        start: 0,
        end: model.duration,
        count: 721
      });
      appendWave(
        candidateLayer,
        candidatePoints,
        plot,
        'dr-svg__wave--candidate',
        '同じ標本点を通る別の波形（破線。復元結果ではありません）'
      );
    }
    svg.appendChild(candidateLayer);
    target.replaceChildren(svg);
    return { svg, plot, theorem, candidate, samples };
  }

  function renderDigitizationProblem(target, model, options = {}) {
    assertTarget(target);
    const width = 900;
    const height = 390;
    const range = model.range || Core.DEFAULT_VOLTAGE_RANGE;
    const interval = 1 / model.sampleRate;
    const end = model.start + interval * (model.values.length - 1);
    const plot = createPlot({
      width,
      height,
      xMin: model.start,
      xMax: end,
      yMin: range.min,
      yMax: range.max,
      margin: { top: 34, right: 26, bottom: 66, left: 62 }
    });
    const svg = createSvg({
      width,
      height,
      className: 'dr-svg--quiz-wave',
      title: options.title || 'デジタル化する波形',
      description: options.description || '格子上の標本値を通る滑らかな波形です。標本時刻の値を読み取ってください。'
    });
    const background = layer('drawing-area');
    appendPlotBackground(background, plot);
    svg.appendChild(background);
    appendAxes(svg, plot, { xStep: interval, yStep: Core.quantizationWidth(model.bitDepth, range), labelEveryX: 1 });

    const quantization = layer('quantization-levels');
    const levels = Core.quantizationLevels(model.bitDepth);
    const widthValue = Core.quantizationWidth(model.bitDepth, range);
    for (let code = 0; code < levels; code += 1) {
      const value = range.min + code * widthValue;
      quantization.appendChild(svgElement('line', {
        class: 'dr-svg__quantization-line',
        x1: plot.left,
        y1: plot.y(value),
        x2: plot.right,
        y2: plot.y(value)
      }));
    }
    svg.appendChild(quantization);

    const points = Core.waveformPoints(
      time => Math.min(
        range.max,
        Math.max(range.min, Core.gridWaveValue(model.values, time, { start: model.start, interval }))
      ),
      { start: model.start, end, count: Math.max(241, model.values.length * 80) }
    );
    const wave = layer('analog-wave');
    appendWave(wave, points, plot, 'dr-svg__wave--analog', '読み取るアナログ波形');
    svg.appendChild(wave);

      const guides = layer('sample-guides');
    model.values.forEach((value, index) => {
      const time = model.start + index * interval;
      guides.append(
        svgElement('line', {
          class: 'dr-svg__sample-guide',
          x1: plot.x(time),
          y1: plot.top,
          x2: plot.x(time),
          y2: plot.bottom
        }),
        svgElement('circle', {
          class: 'dr-svg__sample-point',
          cx: plot.x(time),
          cy: plot.y(value),
          r: 5
        })
      );
    });
    svg.appendChild(guides);
    target.replaceChildren(svg);
    return { svg, plot };
  }

  root.SoundRenderer = Object.freeze({
    svgElement,
    createSvg,
    createPlot,
    pathFromPoints,
    numberText,
    renderAnalogWave,
    renderPCM,
    renderSuperposition,
    renderSamplingTheorem,
    renderDigitizationProblem
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
