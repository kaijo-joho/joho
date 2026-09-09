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
      if (stage === 3 && channel !== null) {
        ctx.fillStyle = textColor(rgb);
        ctx.font = `bold ${size * .3}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Core.binary(Core.quantize(sample[channel], bits), bits), x + size / 2, y + size / 2);
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

  function codeTable(samples, channel) {
    const table = node('table', 'im-value-table');
    table.append(node('caption', '', `${channels[channel]}成分の2進数（左上から右へ1行ずつ）`));
    const head = node('thead');
    const heading = node('tr');
    for (const text of ['行／列', '1', '2', '3', '4', '5', '6', '7', '8']) {
      const th = node('th', '', text); th.scope = 'col'; heading.append(th);
    }
    head.append(heading); table.append(head);
    const body = node('tbody');
    for (let row = 0; row < 8; row += 1) {
      const tr = node('tr'); const th = node('th', '', String(row + 1)); th.scope = 'row'; tr.append(th);
      for (let col = 0; col < 8; col += 1) tr.append(node('td', '', Core.binary(Core.quantize(samples[row * 8 + col][channel], 2), 2)));
      body.append(tr);
    }
    table.append(body);
    return table;
  }

  async function initializeGuide(host) {
    const source = await sourceImage();
    const samples = Core.sampleRgb(source.data, 800, 800, 8, 8);
    const canvas = host.querySelector('[data-image-guide-canvas]');
    const channelControl = host.querySelector('[data-image-channel]');
    const caption = host.querySelector('[data-image-guide-caption]');
    const stepText = host.querySelector('[data-image-stage-text]');
    const detail = node('details', 'dr-reveal-item im-code-table');
    detail.append(node('summary', '', '符号化した値を表で確認'));
    const tableHost = node('div', 'im-table-scroll');
    tableHost.tabIndex = 0; tableHost.setAttribute('aria-label', '8×8画素の符号化の表。横にスクロールできます。');
    detail.append(tableHost); host.append(detail);
    const channelImages = new Map();
    let stage = 0;
    function update(nextStage = stage) {
      stage = nextStage;
      const channel = Number(channelControl.value);
      if (stage === 0) {
        if (!channelImages.has(channel)) {
          const part = node('canvas'); part.width = 800; part.height = 800;
          const ctx = part.getContext('2d'); const pixels = ctx.createImageData(800, 800);
          for (let i = 0; i < source.data.length; i += 4) { pixels.data[i + channel] = source.data[i + channel]; pixels.data[i + 3] = 255; }
          ctx.putImageData(pixels, 0, 0); channelImages.set(channel, part);
        }
        canvas.getContext('2d').drawImage(channelImages.get(channel), 0, 0, canvas.width, canvas.height);
      } else drawSamples(canvas, samples, 8, 2, channel, stage);
      const descriptions = [
        `${channels[channel]}（${channelNames[channel]}）成分の明るさを取り出します。まず、なめらかな色の変化を見てください。`,
        '縦横を8つずつに区切り、各画素内の平均の明るさを取り出します。',
        '各画素の明るさを0〜3の4段階に分けます。1画素のこの成分に必要なビット数は2bitです。',
        '段階値0・1・2・3を、2桁の2進数00・01・10・11で表します。左上から右へ1行ずつ並べます。'
      ];
      stepText.textContent = descriptions[stage];
      const stageNames = ['元の明るさ', '標本化：8×8画素', '量子化：4階調', '符号化：各画素2bit'];
      caption.textContent = `${channels[channel]}成分 ／ ${stageNames[stage]}`;
      canvas.setAttribute('aria-label', `${channels[channel]}成分の気球の画像。${descriptions[stage]}`);
      detail.hidden = stage !== 3;
      if (stage === 3) tableHost.replaceChildren(codeTable(samples, channel));
    }
    channelControl.addEventListener('change', () => update());
    reveal(host); stages(host, update);
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
    const grid = node('div', 'im-encoding-grid');
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', '4×4画素の符号化。左上から右へ1行ずつ並んでいます。');
    const entries = Core.grayscaleExample().map((value, index) => {
      const label = node('label', 'im-encoding-cell');
      const swatch = node('span', 'im-pixel-tone', `段階${value.code}`);
      const brightness = Core.tone(value.code, 3);
      swatch.style.backgroundColor = `rgb(${brightness},${brightness},${brightness})`;
      swatch.style.color = textColor([brightness, brightness, brightness]);
      const input = node('input'); input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('aria-label', `${value.row + 1}行${value.column + 1}列、段階${value.code}を3桁の2進数で入力`);
      const result = node('span', 'im-cell-result'); result.id = `im-cell-result-${index}`;
      input.setAttribute('aria-describedby', result.id);
      label.append(swatch, input, result); grid.append(label);
      input.addEventListener('input', () => {
        label.classList.remove('is-correct', 'is-incorrect'); input.removeAttribute('aria-invalid'); result.textContent = '';
        feedback.textContent = '入力を変更しました。もう一度「判定」で確認できます。';
      });
      return { value, label, input, result };
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
