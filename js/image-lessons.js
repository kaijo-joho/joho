(() => {
  'use strict';
  const Core = globalThis.ImageCore;
  if (!Core) return;
  const scriptBase = new URL('../', document.currentScript.src);
  const channels = ['R', 'G', 'B'];
  const channelNames = ['赤', '緑', '青'];
  const svgNS = 'http://www.w3.org/2000/svg';
  const format = value => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value);
  const resized = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));

  function textColor(rgb) {
    const linear = rgb.map(value => value / 255 <= .04045 ? value / 255 / 12.92 : ((value / 255 + .055) / 1.055) ** 2.4);
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    return luminance > .179 ? '#000' : '#fff';
  }

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function svgNode(tag, attributes) {
    const result = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(([name, value]) => result.setAttribute(name, String(value)));
    return result;
  }

  function reveal(host) {
    host.querySelectorAll('.im-enhancement').forEach(item => { item.hidden = false; });
  }

  function stages(host, update) {
    const buttons = [...host.querySelectorAll('[data-stage]')];
    function select(stage) {
      buttons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.stage) === stage)));
      update(stage);
      resized();
    }
    buttons.forEach(button => button.addEventListener('click', () => select(Number(button.dataset.stage))));
    select(0);
  }

  let sourcePromise;
  function sourceImage() {
    if (!sourcePromise) {
      sourcePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          try {
            const canvas = node('canvas');
            canvas.width = 800;
            canvas.height = 800;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(image, 0, 0, 800, 800);
            resolve({ canvas, data: ctx.getImageData(0, 0, 800, 800).data });
          } catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error('見本画像を読み込めませんでした。'));
        image.src = new URL('img/digital-representation/balloon.svg', scriptBase).href;
      });
    }
    return sourcePromise;
  }

  function drawSamples(canvas, samples, resolution, bits, channel = null, stage = 2) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width / resolution;
    samples.forEach((sample, index) => {
      const values = sample.map(value => stage >= 2 ? Core.tone(Core.quantize(value, bits), bits) : Math.round(value));
      const rgb = channel === null ? values : [0, 0, 0].map((_, c) => c === channel ? values[channel] : 0);
      const x = index % resolution * size;
      const y = Math.floor(index / resolution) * size;
      ctx.fillStyle = `rgb(${rgb.join(',')})`;
      ctx.fillRect(x, y, size, size);
      if (channel !== null && (stage === 3 || (stage === 2 && resolution <= 16))) {
        const code = Core.quantize(sample[channel], bits);
        const label = stage === 3 ? Core.binary(code, bits) : String(code);
        const lines = stage === 3 && bits > 4 ? [label.slice(0, 4), label.slice(4)] : [label];
        ctx.fillStyle = textColor(rgb);
        ctx.font = `bold ${size * Math.min(.36, 1.3 / Math.min(label.length, 4))}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((line, row) => ctx.fillText(line, x + size / 2, y + size * (lines.length === 1 ? .5 : .32 + row * .38)));
      }
    });
    if (resolution <= 20 && stage >= 1 && channel !== null) {
      ctx.beginPath();
      for (let i = 1; i < resolution; i += 1) {
        ctx.moveTo(i * size, 0); ctx.lineTo(i * size, canvas.height);
        ctx.moveTo(0, i * size); ctx.lineTo(canvas.width, i * size);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function zoomTable(samples, resolution, start, channel, bits, stage) {
    const table = node('table', 'im-value-table');
    table.append(node('caption', '', ['標本化：平均の明るさ', '量子化：段階値', '符号化：2進数'][stage - 1]));
    const head = node('thead');
    const heading = node('tr');
    for (const text of ['行／列', ...Array.from({ length: 4 }, (_, index) => String(start + index + 1))]) {
      const th = node('th', '', text); th.scope = 'col'; heading.append(th);
    }
    head.append(heading); table.append(head);
    const body = node('tbody');
    for (let row = start; row < start + 4; row += 1) {
      const tr = node('tr'); const th = node('th', '', String(row + 1)); th.scope = 'row'; tr.append(th);
      for (let col = start; col < start + 4; col += 1) {
        const brightness = samples[row * resolution + col][channel];
        const code = Core.quantize(brightness, bits);
        const label = stage === 1 ? brightness.toFixed(1) : stage === 2 ? String(code) : Core.binary(code, bits);
        tr.append(node('td', '', label));
      }
      body.append(tr);
    }
    table.append(body);
    return table;
  }

  async function initializeGuide(host) {
    const source = await sourceImage();
    const channelControl = host.querySelector('[data-image-channel]');
    const resolutionControl = host.querySelector('[data-image-guide-resolution]');
    const bitsControl = host.querySelector('[data-image-guide-bits]');
    const canvases = Object.fromEntries([...host.querySelectorAll('[data-image-guide-canvas]')].map(canvas => [canvas.dataset.imageGuideCanvas, canvas]));
    const captions = Object.fromEntries([...host.querySelectorAll('[data-image-guide-caption]')].map(caption => [caption.dataset.imageGuideCaption, caption]));
    const figures = [...host.querySelectorAll('[data-image-guide-step]')];
    const previous = host.querySelector('[data-image-guide-prev]');
    const next = host.querySelector('[data-image-guide-next]');
    const scroller = host.querySelector('.im-pipeline-scroll');
    const stepText = host.querySelector('[data-image-stage-text]');
    const zoom = host.querySelector('[data-image-guide-zoom]');
    const channelImages = new Map();
    const sampledImages = new Map();
    const stageNames = ['元画像', '光の成分に分解', '標本化', '量子化', '符号化'];
    let stage = 0;
    function update() {
      const channel = Number(channelControl.value);
      const resolution = Number(resolutionControl.value);
      const bits = Number(bitsControl.value);
      if (!sampledImages.has(resolution)) sampledImages.set(resolution, Core.sampleRgb(source.data, 800, 800, resolution, resolution));
      const samples = sampledImages.get(resolution);
      if (!channelImages.has(channel)) {
        const part = node('canvas'); part.width = 800; part.height = 800;
        const ctx = part.getContext('2d'); const pixels = ctx.createImageData(800, 800);
        for (let i = 0; i < source.data.length; i += 4) { pixels.data[i + channel] = source.data[i + channel]; pixels.data[i + 3] = 255; }
        ctx.putImageData(pixels, 0, 0); channelImages.set(channel, part);
      }
      canvases.component.getContext('2d').drawImage(channelImages.get(channel), 0, 0);
      const start = resolution / 2 - 2;
      for (const [name, process] of [['sample', 1], ['quantize', 2], ['encode', 3]]) {
        const canvas = canvases[name];
        drawSamples(canvas, samples, resolution, bits, channel, process);
        const ctx = canvas.getContext('2d'); const cell = canvas.width / resolution;
        // 同じ4×4画素の範囲を示す。表の拡大表示でも行・列を変えない。
        ctx.strokeStyle = '#000'; ctx.lineWidth = canvas.width / 140;
        ctx.strokeRect(start * cell, start * cell, 4 * cell, 4 * cell);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = canvas.width / 280;
        ctx.strokeRect(start * cell, start * cell, 4 * cell, 4 * cell);
      }
      const resolutionText = `幅の1/${resolution}（${resolution}×${resolution}画素）`;
      const bitsText = `${Core.levels(bits)}階調（${bits}bit）`;
      host.querySelector('[data-image-guide-resolution-output]').textContent = resolutionText;
      host.querySelector('[data-image-guide-bits-output]').textContent = bitsText;
      resolutionControl.setAttribute('aria-valuetext', resolutionText);
      bitsControl.setAttribute('aria-valuetext', bitsText);
      captions.component.textContent = `${channels[channel]}（${channelNames[channel]}）成分`;
      captions.sample.textContent = `${resolution}×${resolution}画素`;
      captions.quantize.textContent = `明るさを${Core.levels(bits)}段階に`;
      captions.encode.textContent = `各画素を${bits}桁の2進数に`;
      for (const [name, canvas] of Object.entries(canvases)) canvas.setAttribute('aria-label', `${channels[channel]}成分の気球。${captions[name].textContent}`);
      const descriptions = [
        '元画像の輪郭と濃淡を見てから、「次へ」で光の成分に分けましょう。',
        `${channels[channel]}（${channelNames[channel]}）成分の明るさを取り出しました。画像の形はそのままです。`,
        `縦横を${resolution}つずつに区切り、各画素内の平均の明るさを取り出しました。スライダーで標本化の間隔を変えられます。`,
        `各画素の明るさを0〜${Core.levels(bits) - 1}の${Core.levels(bits)}段階に分けました。標本化した図と比べ、階調数も変えてみましょう。`,
        `段階値を${bits}桁の2進数にしました。左上から右へ1行ずつ並べます。細かい符号は、下の「枠内の4×4画素を拡大して確認」で読めます。`
      ];
      stepText.textContent = descriptions[stage];
      figures.forEach((figure, index) => {
        figure.classList.toggle('is-pending', index > stage);
        figure.setAttribute('aria-hidden', String(index > stage));
      });
      previous.disabled = stage === 0; next.disabled = stage === 4;
      previous.setAttribute('aria-label', stage ? `前の工程：${stageNames[stage - 1]}` : '最初の工程です');
      next.setAttribute('aria-label', stage < 4 ? `次の工程：${stageNames[stage + 1]}` : 'すべての工程を表示しました');
      host.querySelector('[data-image-guide-progress]').textContent = `${stage + 1} / 5`;
      zoom.hidden = stage < 2;
      host.querySelector('[data-image-guide-zoom-caption]').textContent = `${channels[channel]}成分の${start + 1}〜${start + 4}行・${start + 1}〜${start + 4}列です。平均値は小数第1位まで表示しています。`;
      const tables = host.querySelector('[data-image-guide-zoom-tables]');
      tables.replaceChildren();
      for (let process = 1; process <= stage - 1; process += 1) {
        const scroll = node('div', 'im-table-scroll'); scroll.tabIndex = 0;
        scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `${stageNames[process + 1]}の4×4画素の表`);
        scroll.append(zoomTable(samples, resolution, start, channel, bits, process)); tables.append(scroll);
      }
      resized();
    }
    function move(amount) {
      stage = Math.max(0, Math.min(4, stage + amount)); update();
      const target = figures[stage].getBoundingClientRect(); const visible = scroller.getBoundingClientRect();
      if (target.right > visible.right) scroller.scrollLeft += target.right - visible.right + 4;
      else if (target.left < visible.left) scroller.scrollLeft -= visible.left - target.left + 4;
    }
    let frame;
    function scheduleUpdate() { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }
    resolutionControl.addEventListener('input', scheduleUpdate); bitsControl.addEventListener('input', scheduleUpdate);
    channelControl.addEventListener('change', () => update());
    previous.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));
    zoom.addEventListener('toggle', resized);
    host.classList.add('im-guide-ready');
    reveal(host); update();
  }

  async function initializeExplorer(host) {
    const source = await sourceImage();
    const resolutionControl = host.querySelector('[data-image-resolution]');
    const bitsControl = host.querySelector('[data-image-bits]');
    const canvas = host.querySelector('[data-image-explorer-canvas]');
    const caption = host.querySelector('[data-image-explorer-caption]');
    const metrics = host.querySelector('[data-image-metrics]');
    let sampledResolution = 0;
    let samples;
    function update() {
      const resolution = Number(resolutionControl.value);
      const bits = Number(bitsControl.value);
      if (sampledResolution !== resolution) {
        samples = Core.sampleRgb(source.data, 800, 800, resolution, resolution);
        sampledResolution = resolution;
      }
      // 800×800でも画素を一括転送し、64万回のCanvas描画を避ける。
      const small = node('canvas'); small.width = resolution; small.height = resolution;
      const ctx = small.getContext('2d'); const pixels = ctx.createImageData(resolution, resolution);
      samples.forEach((sample, index) => {
        for (let channel = 0; channel < 3; channel += 1) pixels.data[index * 4 + channel] = Core.tone(Core.quantize(sample[channel], bits), bits);
        pixels.data[index * 4 + 3] = 255;
      });
      ctx.putImageData(pixels, 0, 0);
      const target = canvas.getContext('2d'); target.imageSmoothingEnabled = false;
      target.drawImage(small, 0, 0, canvas.width, canvas.height);
      const size = Core.imageSize(resolution, resolution, bits * 3);
      const description = `${resolution}×${resolution}画素 ／ 各色${Core.levels(bits)}階調`;
      caption.textContent = description;
      canvas.setAttribute('aria-label', `条件を変えた気球の画像。${description}。${bits === 8 ? '各色の明るさを細かく表しています。' : '色の変化が段階的に見えます。'}`);
      metrics.replaceChildren();
      for (const [label, value] of [
        ['全画素数', `${format(size.pixels)}画素`],
        ['1画素あたり', `${bits}bit×3色＝${bits * 3}bit`],
        ['表せる色数', `${format(2 ** (bits * 3))}色`],
        ['データ量', `${format(size.bytes)}B`]
      ]) metrics.append(node('dt', '', label), node('dd', '', value));
      resized();
    }
    resolutionControl.addEventListener('change', update); bitsControl.addEventListener('change', update);
    host.querySelector('[data-image-reset]').addEventListener('click', () => { resolutionControl.value = '50'; bitsControl.value = '2'; update(); });
    update(); reveal(host);
  }

  function drawGrayscale(layer, stage, values) {
    layer.replaceChildren();
    if (stage >= 1) values.forEach(value => {
      const brightness = stage >= 2 ? Core.tone(value.code, 3) : Math.round(value.brightness);
      const x = value.column * 80; const y = value.row * 80;
      layer.append(svgNode('rect', { x, y, width: 80, height: 80, fill: `rgb(${brightness},${brightness},${brightness})`, stroke: '#888', 'stroke-width': 1 }));
      if (stage >= 2) {
        const label = svgNode('text', { x: x + 40, y: y + 42, fill: textColor([brightness, brightness, brightness]), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-family': 'ui-monospace, monospace', 'font-size': stage === 3 ? 24 : 28, 'font-weight': 700 });
        label.textContent = stage === 3 ? value.binary : String(value.code); layer.append(label);
      }
    });
  }

  function grayscalePicture(stage, values) {
    const svg = svgNode('svg', { class: 'im-picture', viewBox: '0 0 320 320', role: 'img', 'aria-labelledby': `im-quiz-picture-title-${stage} im-quiz-picture-desc-${stage}` });
    const title = svgNode('title', { id: `im-quiz-picture-title-${stage}` });
    title.textContent = ['元のグレースケール画像', '4×4画素に標本化した画像', '8階調に量子化した画像'][stage];
    const desc = svgNode('desc', { id: `im-quiz-picture-desc-${stage}` });
    desc.textContent = stage < 2 ? '左上が明るく、右下が暗い画像。同じ画像の変化を左から順に比べます。' : '段階値は1行目が6、5、4、3。2行目は5、4、3、2。3行目は4、3、2、1。4行目は3、2、1、0です。';
    svg.append(title, desc);
    if (stage === 0) {
      const defs = svgNode('defs', {});
      const gradient = svgNode('linearGradient', { id: 'im-quiz-gray-gradient', x1: 0, y1: 0, x2: 1, y2: 1 });
      gradient.append(svgNode('stop', { 'stop-color': '#fff' }), svgNode('stop', { offset: 1, 'stop-color': '#000' }));
      defs.append(gradient); svg.append(defs, svgNode('rect', { width: 320, height: 320, fill: 'url(#im-quiz-gray-gradient)' }));
    }
    const layer = svgNode('g', {}); drawGrayscale(layer, stage, values); svg.append(layer);
    return svg;
  }

  function initializeGrayscale(host) {
    const values = Core.grayscaleExample();
    const layer = host.querySelector('[data-image-grayscale-layer]');
    const caption = host.querySelector('[data-image-grayscale-caption]');
    const bitstream = host.querySelector('[data-image-bitstream]');
    const text = host.querySelector('[data-image-stage-text]');
    const descriptions = [
      '左上から右下へ、明るさが連続して変わっています。',
      '縦横を4つずつに区切り、各マス内の平均の明るさを取り出します。',
      '明るさを0〜7の8段階に分けます。図の数字は、その画素の段階値です。',
      '8段階を3桁の2進数で表します。例えば、段階6は110、段階3は011です。'
    ];
    function update(stage) {
      drawGrayscale(layer, stage, values);
      caption.textContent = ['元のグレースケール画像', '標本化：4×4画素', '量子化：8階調', '符号化：1画素3bit'][stage];
      text.textContent = descriptions[stage];
      bitstream.hidden = stage !== 3;
      bitstream.textContent = `1行目の符号：${values.slice(0, 4).map(value => value.binary).join(' ')}（12bit）`;
    }
    reveal(host); stages(host, update);
  }

  const normalize = value => value.normalize('NFKC').trim();
  function numberAnswer(value) {
    const text = normalize(value);
    return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) ? Number(text) : NaN;
  }

  function initializeEncoding(host) {
    const feedback = host.querySelector('[data-image-encoding-feedback]');
    const values = Core.grayscaleExample();
    host.querySelectorAll('[data-image-quiz-picture]').forEach(picture => picture.append(grayscalePicture(Number(picture.dataset.imageQuizPicture), values)));
    const quantized = host.querySelector('[data-image-quiz-picture="2"] svg');
    const highlight = svgNode('g', { visibility: 'hidden', 'aria-hidden': 'true', 'pointer-events': 'none' });
    highlight.append(svgNode('rect', { x: 2, y: 2, width: 76, height: 76, fill: 'none', stroke: '#000', 'stroke-width': 5 }), svgNode('rect', { x: 2, y: 2, width: 76, height: 76, fill: 'none', stroke: '#fff', 'stroke-width': 2 }));
    quantized.append(highlight);
    const grid = node('table', 'im-encoding-grid');
    grid.append(node('caption', 'im-sr-only', '4×4画素の符号化の解答表。量子化の図と同じ位置に入力します。'));
    const body = node('tbody'); grid.append(body);
    const entries = values.map((value, index) => {
      if (value.column === 0) body.append(node('tr'));
      const cell = node('td', 'im-encoding-cell');
      const input = node('input'); input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('aria-label', `${value.row + 1}行${value.column + 1}列、段階${value.code}を3桁の2進数で入力`);
      const result = node('span', 'im-cell-result'); result.id = `im-cell-result-${index}`;
      input.setAttribute('aria-describedby', result.id);
      cell.append(input, result); body.lastElementChild.append(cell);
      input.addEventListener('focus', () => { highlight.setAttribute('visibility', 'visible'); highlight.setAttribute('transform', `translate(${value.column * 80} ${value.row * 80})`); });
      input.addEventListener('blur', () => highlight.setAttribute('visibility', 'hidden'));
      input.addEventListener('input', () => {
        cell.classList.remove('is-correct', 'is-incorrect'); input.removeAttribute('aria-invalid'); result.textContent = '';
        feedback.textContent = '入力を変更しました。もう一度「判定」で確認できます。';
      });
      return { value, label: cell, input, result };
    });
    host.querySelector('[data-image-encoding-grid]').append(grid);
    host.addEventListener('submit', event => {
      event.preventDefault();
      let correct = 0; let empty = 0;
      entries.forEach(({ value, label, input, result }) => {
        const answer = normalize(input.value); const valid = answer === value.binary;
        if (!answer) empty += 1;
        if (valid) correct += 1;
        label.classList.toggle('is-correct', valid); label.classList.toggle('is-incorrect', !valid);
        input.setAttribute('aria-invalid', String(!valid));
        result.textContent = valid ? '○ 正解' : !answer ? '未入力' : !/^[01]{3}$/.test(answer) ? '0・1で3桁' : '再確認';
      });
      feedback.textContent = `${correct}／16画素が正解です。${empty ? `未入力は${empty}画素です。` : ''}${correct === 16 ? '画像全体では16画素×3bit＝48bitです。' : '左から4・2・1の重みを確かめましょう。'}`;
      resized();
    });
    host.querySelector('[data-image-encoding-clear]').addEventListener('click', () => {
      entries.forEach(({ label, input, result }) => { input.value = ''; input.removeAttribute('aria-invalid'); label.classList.remove('is-correct', 'is-incorrect'); result.textContent = ''; });
      feedback.textContent = '入力を消しました。';
    });
    reveal(host);
  }

  function initializeSizeQuiz(host) {
    const fullColor = host.dataset.imageSizeQuiz === 'full-color';
    const expected = fullColor
      ? { levels: Core.levels(8), size: Core.imageSize(4096, 3072, 24, 1024).megabytes }
      : { bits: 15, size: Core.imageSize(1000, 800, 15, 1000).megabytes };
    const feedback = host.querySelector('[data-image-size-feedback]');
    const inputs = [...host.querySelectorAll('input')];
    inputs.forEach(input => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); feedback.textContent = ''; }));
    host.addEventListener('submit', event => {
      event.preventDefault();
      const results = inputs.map(input => {
        const valid = numberAnswer(input.value) === expected[input.name];
        input.setAttribute('aria-invalid', String(!valid));
        return `${input.name === 'size' ? 'データ量' : fullColor ? '階調数' : 'ビット数'}：${valid ? '正解' : normalize(input.value) ? 'もう一度確認' : '未入力'}`;
      });
      feedback.textContent = results.join(' ／ ');
      resized();
    });
    const solution = host.querySelector('[data-image-solution]');
    const steps = [...solution.querySelectorAll('ol > li')];
    const next = solution.querySelector('[data-image-solution-next]');
    let count = 1;
    function update() {
      steps.forEach((step, index) => { step.hidden = index >= count; });
      next.disabled = count === steps.length;
      next.textContent = next.disabled ? '解説はここまで' : '次へ';
      resized();
    }
    next.addEventListener('click', () => { count = Math.min(steps.length, count + 1); update(); });
    host.querySelector('details').addEventListener('toggle', resized);
    reveal(host); update();
  }

  async function safely(host, initialize) {
    try { await initialize(host); }
    catch (error) {
      console.error('画像教材の初期化に失敗しました', error);
      host.append(node('p', 'im-hint', '操作用の図を読み込めませんでした。再読み込みしてください。本文の説明はそのまま読めます。'));
    }
  }

  function initialize() {
    for (const [selector, setup] of [
      ['[data-image-guide]', initializeGuide], ['[data-image-explorer]', initializeExplorer],
      ['[data-image-grayscale]', initializeGrayscale], ['[data-image-encoding-quiz]', initializeEncoding],
      ['[data-image-size-quiz]', initializeSizeQuiz]
    ]) document.querySelectorAll(selector).forEach(host => safely(host, setup));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
