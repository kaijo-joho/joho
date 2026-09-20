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

  function zoomTable(samples, resolution, region, channel, bits, stage) {
    const table = node('table', 'im-value-table');
    table.setAttribute('aria-label', `${channels[channel]}成分・${['標本化：平均の明るさ', '量子化：段階値', '符号化：2進数'][stage - 1]}。${region.startRow + 1}〜${region.startRow + 4}行・${region.startColumn + 1}〜${region.startColumn + 4}列。`);
    const body = node('tbody');
    for (let row = region.startRow; row < region.startRow + 4; row += 1) {
      const tr = node('tr');
      for (let col = region.startColumn; col < region.startColumn + 4; col += 1) {
        const brightness = samples[row * resolution + col][channel];
        const code = Core.quantize(brightness, bits);
        const label = stage === 1 ? brightness.toFixed(1) : stage === 2 ? String(code) : Core.binary(code, bits);
        const value = stage === 1 ? Math.round(brightness) : Core.tone(code, bits);
        const rgb = [0, 0, 0].map((_, c) => c === channel ? value : 0);
        const cell = node('td');
        if (stage === 3 && bits > 4) {
          cell.append(node('span', 'im-pixel-code-line', label.slice(0, 4)), node('span', 'im-pixel-code-line', label.slice(4)));
        } else cell.textContent = label;
        cell.style.backgroundColor = `rgb(${rgb.join(',')})`;
        cell.style.color = textColor(rgb);
        const selected = row === region.row && col === region.column;
        cell.classList.toggle('is-selected', selected);
        cell.setAttribute('aria-label', `${row + 1}行${col + 1}列：${label}${selected ? '（選択中の画素）' : ''}`);
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);
    return table;
  }

  function initializeGuidePopover(host, popup, triggers, renderContent, selectPixel = null) {
    // 背景効果と横スクロールの領域に切り取られないよう、ポップアップをbody直下へ置く。
    popup.setAttribute('data-lesson-slide-navigation-lock', '');
    document.body.append(popup);
    let active = null;
    let pinned = false;
    let closeTimer;
    let pointerFrame;
    let restoringFocus = false;
    let enabled = true;

    function close() {
      clearTimeout(closeTimer);
      cancelAnimationFrame(pointerFrame);
      const opener = active;
      const hadFocus = popup.contains(document.activeElement);
      active = null; pinned = false; popup.hidden = true;
      opener?.setAttribute('aria-expanded', 'false');
      if (opener && hadFocus) {
        restoringFocus = true;
        opener.focus({ preventScroll: true });
        restoringFocus = false;
      }
    }
    function position() {
      if (!active) return;
      const style = getComputedStyle(host);
      popup.style.fontSize = style.fontSize;
      popup.style.fontFamily = style.fontFamily;
      popup.style.lineHeight = style.lineHeight;
      const rect = active.getBoundingClientRect();
      const slide = host.closest('[data-lesson-slide]').getBoundingClientRect();
      const scroll = host.querySelector('.im-guide-scroll').getBoundingClientRect();
      const topEdge = Math.max(8, slide.top + 8);
      const bottomEdge = Math.min(window.innerHeight, slide.bottom) - 8;
      if (rect.bottom < topEdge || rect.top > bottomEdge || rect.right < scroll.left || rect.left > scroll.right) { close(); return; }
      if (selectPixel) {
        // 正方形を保ったまま、画像と重ならない上下左右の空きへ収める。
        const leftEdge = 8;
        const rightEdge = document.documentElement.clientWidth - 8;
        const maxSize = Math.min(360, rightEdge - leftEdge, bottomEdge - topEdge);
        const choices = [
          { side: 'right', space: rightEdge - rect.right - 8 },
          { side: 'left', space: rect.left - leftEdge - 8 },
          { side: 'below', space: bottomEdge - rect.bottom - 8 },
          { side: 'above', space: rect.top - topEdge - 8 }
        ].map(choice => ({ ...choice, size: Math.floor(Math.min(maxSize, choice.space)) }));
        const best = choices.reduce((largest, choice) => choice.size > largest.size ? choice : largest);
        if (best.size <= 0) { close(); return; }
        popup.style.setProperty('--im-zoom-size', `${best.size}px`);
        const horizontal = best.side === 'left' || best.side === 'right';
        const left = horizontal ? (best.side === 'right' ? rect.right + 8 : rect.left - best.size - 8) : rect.left + (rect.width - best.size) / 2;
        const top = horizontal ? rect.top + (rect.height - best.size) / 2 : (best.side === 'below' ? rect.bottom + 8 : rect.top - best.size - 8);
        popup.style.left = `${Math.max(leftEdge, Math.min(left, rightEdge - best.size))}px`;
        popup.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - best.size))}px`;
        return;
      }
      // 表が画像と重なってマウスの追従を妨げないよう、上下の空きに収める。
      const belowSpace = bottomEdge - rect.bottom - 8;
      const aboveSpace = rect.top - topEdge - 8;
      popup.style.maxHeight = `${Math.max(80, bottomEdge - topEdge)}px`;
      const naturalHeight = popup.getBoundingClientRect().height;
      const below = belowSpace >= naturalHeight || belowSpace >= aboveSpace;
      popup.style.maxHeight = `${Math.max(80, below ? belowSpace : aboveSpace)}px`;
      const size = popup.getBoundingClientRect();
      const top = below ? rect.bottom + 8 : rect.top - size.height - 8;
      popup.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - size.height))}px`;
      popup.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - size.width) / 2, document.documentElement.clientWidth - size.width - 8))}px`;
    }
    function open(trigger, pin = false, point = null) {
      if (!enabled) return;
      clearTimeout(closeTimer);
      const changedTrigger = active !== trigger;
      if (changedTrigger) {
        close();
        document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: popup.id } }));
        active = trigger;
      }
      const changedPixel = selectPixel?.(trigger, point);
      if (changedTrigger || changedPixel) renderContent(trigger, popup);
      pinned = pin || pinned;
      popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      position();
    }
    function scheduleClose() {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (!pinned && active && !active.matches(':hover, :focus-visible') && !popup.matches(':hover, :focus-within')) close();
      }, 180);
    }
    triggers.forEach(trigger => {
      trigger.setAttribute('aria-controls', popup.id);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch' && !pinned) open(trigger, false, event);
      });
      trigger.addEventListener('pointermove', event => {
        if (!selectPixel || active !== trigger || pinned || event.pointerType === 'touch') return;
        const point = { clientX: event.clientX, clientY: event.clientY };
        cancelAnimationFrame(pointerFrame);
        pointerFrame = requestAnimationFrame(() => {
          if (active === trigger && !pinned) open(trigger, false, point);
        });
      });
      trigger.addEventListener('pointerleave', scheduleClose);
      trigger.addEventListener('focus', () => {
        if (!restoringFocus && trigger.matches(':focus-visible')) open(trigger);
      });
      trigger.addEventListener('click', event => {
        if (!enabled) return;
        const point = event.detail ? event : null;
        if (active === trigger && pinned) {
          if (selectPixel?.(trigger, point)) { renderContent(trigger, popup); position(); }
          else close();
        } else {
          open(trigger, true, point);
          if (event.detail === 0) popup.focus({ preventScroll: true });
        }
      });
      trigger.addEventListener('keydown', event => {
        if (!enabled || !selectPixel || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        open(trigger, false, { key: event.key });
      });
    });
    popup.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    popup.addEventListener('pointerleave', scheduleClose);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) {
        event.preventDefault(); event.stopPropagation(); close();
      }
    }, true);
    document.addEventListener('pointerdown', event => {
      if (active && !active.contains(event.target) && !popup.contains(event.target)) close();
    });
    document.addEventListener('focusin', event => {
      if (active && !active.contains(event.target) && !popup.contains(event.target)) close();
    });
    document.addEventListener('scroll', event => {
      if (!popup.contains(event.target)) position();
    }, true);
    window.addEventListener('resize', position);
    document.addEventListener('joho:lesson-slide-change', () => close());
    document.addEventListener('joho:overlay-open', event => {
      if (event.detail?.source !== popup.id) close();
    });
    return { close, setEnabled(value) {
      enabled = value;
      if (!enabled) close();
      triggers.forEach(trigger => { trigger.disabled = !enabled; });
    } };
  }

  async function initializeGuide(host) {
    const source = await sourceImage();
    const resolutionControl = host.querySelector('[data-image-guide-resolution]');
    const bitsControl = host.querySelector('[data-image-guide-bits]');
    const captions = Object.fromEntries([...host.querySelectorAll('[data-image-guide-caption]')].map(caption => [caption.dataset.imageGuideCaption, caption]));
    const rows = [...host.querySelectorAll('[data-image-guide-row]')];
    const helpButtons = [...host.querySelectorAll('[data-image-guide-help]')];
    const zoomToggle = host.querySelector('[data-image-guide-zoom-toggle]');
    const descriptions = [...host.querySelectorAll('[data-image-guide-description]')];
    const stageNames = ['元画像', '光の成分に分解', '標本化', '量子化', '符号化'];
    const processNames = ['component', 'sample', 'quantize', 'encode'];
    const canvases = [];
    const sampledImages = new Map();
    let resolution = 0;
    let bits = 0;
    let samples;
    let selected = { column: 0, row: 0 };

    // 行ごとに同じ元画像を置き、左から右へ各成分の工程をそろえる。
    const original = rows[0].querySelector('figure');
    rows.forEach((row, channel) => {
      if (channel > 0) row.append(original.cloneNode(true));
      const channelName = channels[channel];
      processNames.forEach((name, process) => {
        const figure = node('figure');
        figure.dataset.imageGuideStep = String(process + 1);
        const canvas = node('canvas', 'im-picture');
        canvas.width = canvas.height = process === 3 ? 1600 : 800;
        canvas.dataset.imageGuideCanvas = processNames[process];
        canvas.dataset.imageChannel = String(channel);
        canvas.setAttribute('role', 'img');
        if (process > 0) {
          const button = node('button', 'im-guide-image-button');
          button.type = 'button'; button.tabIndex = 0;
          button.dataset.imageGuideZoomTrigger = String(process);
          button.dataset.imageChannel = String(channel);
          button.setAttribute('aria-label', `${channelName}（${channelNames[channel]}）の${stageNames[process + 1]}：枠内の4×4画素を拡大`);
          button.setAttribute('aria-describedby', 'im-guide-zoom-help');
          const selection = node('span', 'im-guide-selection');
          selection.setAttribute('aria-hidden', 'true');
          button.append(canvas, selection); figure.append(button);
        } else {
          figure.append(canvas);
          const ctx = canvas.getContext('2d');
          const pixels = ctx.createImageData(800, 800);
          for (let i = 0; i < source.data.length; i += 4) {
            pixels.data[i + channel] = source.data[i + channel]; pixels.data[i + 3] = 255;
          }
          ctx.putImageData(pixels, 0, 0);
          canvas.setAttribute('aria-label', `${channelName}（${channelNames[channel]}）成分のなめらかな明るさ`);
        }
        canvases.push({ canvas, channel, process }); row.append(figure);
      });
    });
    function region() {
      return { ...selected,
        startColumn: Math.max(0, Math.min(resolution - 4, selected.column - 1)),
        startRow: Math.max(0, Math.min(resolution - 4, selected.row - 1)) };
    }
    function updateSelection() {
      const current = region();
      host.style.setProperty('--im-selection-x', `${current.startColumn / resolution * 100}%`);
      host.style.setProperty('--im-selection-y', `${current.startRow / resolution * 100}%`);
      host.style.setProperty('--im-selection-size', `${4 / resolution * 100}%`);
    }
    function selectPixel(trigger, point) {
      if (!point) return false;
      let { column, row } = selected;
      if (point.key) {
        if (point.key === 'ArrowLeft') column -= 1;
        if (point.key === 'ArrowRight') column += 1;
        if (point.key === 'ArrowUp') row -= 1;
        if (point.key === 'ArrowDown') row += 1;
        if (point.key === 'Home') column = row = 0;
        if (point.key === 'End') column = row = resolution - 1;
      } else {
        const rect = trigger.querySelector('canvas').getBoundingClientRect();
        column = Math.floor((point.clientX - rect.left) / rect.width * resolution);
        row = Math.floor((point.clientY - rect.top) / rect.height * resolution);
      }
      column = Math.max(0, Math.min(resolution - 1, column));
      row = Math.max(0, Math.min(resolution - 1, row));
      if (column === selected.column && row === selected.row) return false;
      selected = { column, row }; updateSelection();
      return true;
    }
    const zoom = initializeGuidePopover(host, host.querySelector('[data-image-guide-zoom]'), [...host.querySelectorAll('[data-image-guide-zoom-trigger]')], (trigger, popup) => {
      const channel = Number(trigger.dataset.imageChannel);
      const process = Number(trigger.dataset.imageGuideZoomTrigger);
      const current = region();
      popup.setAttribute('aria-label', `${channels[channel]}（${channelNames[channel]}）・${stageNames[process + 1]}の4×4画素。選択：${selected.row + 1}行・${selected.column + 1}列。`);
      popup.querySelector('[data-image-guide-zoom-table]').replaceChildren(zoomTable(samples, resolution, current, channel, bits, process));
    }, selectPixel);
    const explanation = initializeGuidePopover(host, host.querySelector('[data-image-guide-description-popup]'), helpButtons, (trigger, popup) => {
      const index = Number(trigger.dataset.imageGuideHelp);
      popup.setAttribute('aria-label', `${stageNames[index]}の説明`);
      popup.textContent = descriptions[index].textContent;
    });

    function update() {
      zoom.close(); explanation.close();
      const nextResolution = Number(resolutionControl.value);
      const nextBits = Number(bitsControl.value);
      if (resolution !== nextResolution || bits !== nextBits) {
        if (resolution !== nextResolution) {
          selected = resolution ? {
            column: Math.floor((selected.column + .5) * nextResolution / resolution),
            row: Math.floor((selected.row + .5) * nextResolution / resolution)
          } : { column: nextResolution / 2 - 1, row: nextResolution / 2 - 1 };
        }
        resolution = nextResolution; bits = nextBits;
        if (!sampledImages.has(resolution)) sampledImages.set(resolution, Core.sampleRgb(source.data, 800, 800, resolution, resolution));
        samples = sampledImages.get(resolution);
        canvases.filter(item => item.process > 0).forEach(({ canvas, channel, process }) => {
          drawSamples(canvas, samples, resolution, bits, channel, process);
        });
        updateSelection();
      }
      const resolutionText = `幅の1/${resolution}（${resolution}×${resolution}画素）`;
      const bitsText = `${Core.levels(bits)}階調（${bits}bit）`;
      host.querySelector('[data-image-guide-resolution-output]').textContent = resolutionText;
      host.querySelector('[data-image-guide-bits-output]').textContent = bitsText;
      resolutionControl.setAttribute('aria-valuetext', resolutionText);
      bitsControl.setAttribute('aria-valuetext', bitsText);
      captions.sample.textContent = `${resolution}×${resolution}画素`;
      captions.quantize.textContent = `明るさを${Core.levels(bits)}段階に`;
      captions.encode.textContent = `各画素を${bits}桁の2進数に`;
      canvases.filter(item => item.process > 0).forEach(({ canvas, channel, process }) => {
        canvas.setAttribute('aria-label', `${channels[channel]}成分の気球の${stageNames[process + 1]}。${captions[processNames[process]].textContent}`);
      });
      descriptions[2].textContent = `標本化：画像の縦・横をそれぞれ${resolution}等分し、各マス内の平均の明るさを取り出します。このマス目が画素（ピクセル）です。拡大表では平均値を小数第1位まで表示します。`;
      descriptions[3].textContent = `量子化：各画素の明るさを0〜${Core.levels(bits) - 1}の${Core.levels(bits)}段階の値にします。標本化した画像と比べ、スライダーで階調数も変えてみましょう。`;
      descriptions[4].textContent = `符号化：段階値を${bits}桁の2進数で表し、左上から右へ1行ずつ並べます。画像にマウスを重ねると、その付近の符号を拡大して読めます。`;
      resized();
    }
    let frame;
    function scheduleUpdate() { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }
    resolutionControl.addEventListener('input', scheduleUpdate); bitsControl.addEventListener('input', scheduleUpdate);
    zoomToggle.addEventListener('click', () => {
      const enabled = zoomToggle.getAttribute('aria-pressed') !== 'true';
      zoomToggle.setAttribute('aria-pressed', String(enabled));
      zoomToggle.title = enabled ? '拡大表を非表示にする' : '拡大表を表示する';
      host.classList.toggle('im-guide-zoom-disabled', !enabled);
      zoom.setEnabled(enabled);
    });
    host.classList.add('im-guide-ready');
    reveal(host); update();
  }

  async function initializeExplorer(host) {
    const source = await sourceImage();
    const resolutions = [10, 20, 50, 100, 200, 800];
    const resolutionControl = host.querySelector('[data-image-resolution]');
    const bitsControl = host.querySelector('[data-image-bits]');
    const canvas = host.querySelector('[data-image-explorer-canvas]');
    const caption = host.querySelector('[data-image-explorer-caption]');
    const metrics = host.querySelector('[data-image-metrics]');
    const gradationBands = [...host.querySelectorAll('[data-image-gradation-channel]')].map(band => ({
      channel: band.dataset.imageGradationChannel === 'gray' ? null : Number(band.dataset.imageGradationChannel),
      steps: band.querySelector('[data-image-gradation-steps]'),
      description: band.querySelector('[data-image-gradation-description]')
    }));
    let sampledResolution = 0;
    let samples;
    let animation = 0;
    function update() {
      const resolution = resolutions[Number(resolutionControl.value)];
      const bits = Number(bitsControl.value);
      const levels = Core.levels(bits);
      const resolutionLabel = `${resolution}×${resolution}画素`;
      const gradationLabel = `${levels}階調（${bits}bit）`;
      host.querySelector('[data-image-resolution-output]').textContent = resolutionLabel;
      resolutionControl.setAttribute('aria-valuetext', resolutionLabel);
      host.querySelector('[data-image-bits-output]').textContent = gradationLabel;
      bitsControl.setAttribute('aria-valuetext', gradationLabel);
      host.querySelector('[data-image-gradation-caption]').textContent = `量子化後：${gradationLabel}`;
      gradationBands.forEach(({ channel, steps, description }) => {
        const endColor = channel === null ? '白' : channelNames[channel];
        description.textContent = `${channel === null ? '明るさの目安です。' : ''}黒から${endColor}までを${levels}段階に分け、各段階を${bits}bitで表します。`;
        steps.replaceChildren(...Array.from({ length: levels }, (_, code) => {
          const tone = Core.tone(code, bits);
          const rgb = [0, 1, 2].map(component => channel === null || component === channel ? tone : 0);
          return svgNode('rect', { x: code * 1024 / levels, width: 1024 / levels, height: 56, fill: `rgb(${rgb.join(',')})` });
        }));
      });
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
      for (const [label, calculation, value] of [
        ['全画素数', `${resolution} × ${resolution} ＝`, `${format(size.pixels)}画素`],
        ['1画素あたり', `${bits}bit × 3色 ＝`, `${bits * 3}bit`],
        ['表せる色数', `${levels} × ${levels} × ${levels} ＝`, `${format(2 ** (bits * 3))}色`],
        ['データ量', `${resolution} × ${resolution} × ${bits * 3} ÷ 8 ＝`, `${format(size.bytes)}B`]
      ]) {
        const detail = node('dd');
        detail.append(node('span', 'im-metric-calculation', calculation), node('strong', '', value));
        metrics.append(node('dt', '', label), detail);
      }
      resized();
    }
    function scheduleUpdate() {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(update);
    }
    resolutionControl.addEventListener('input', scheduleUpdate);
    bitsControl.addEventListener('input', scheduleUpdate);
    host.querySelector('[data-image-reset]').addEventListener('click', () => { resolutionControl.value = '2'; bitsControl.value = '2'; update(); });
    update(); reveal(host);
  }

  function drawGrayscale(layer, stage, values, { resolution = 4, bits = 3, showValues = true } = {}) {
    const cellSize = 320 / resolution;
    layer.replaceChildren();
    if (stage >= 1) values.forEach(value => {
      const brightness = stage >= 2 ? Core.tone(value.code, bits) : Math.round(value.brightness);
      const x = value.column * cellSize; const y = value.row * cellSize;
      layer.append(svgNode('rect', { x, y, width: cellSize, height: cellSize, fill: `rgb(${brightness},${brightness},${brightness})`, stroke: '#888', 'stroke-width': 1 }));
      if (stage >= 2 && showValues) {
        const label = svgNode('text', { x: x + cellSize / 2, y: y + cellSize / 2 + 2, fill: textColor([brightness, brightness, brightness]), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-family': 'ui-monospace, monospace', 'font-size': cellSize * (stage === 3 ? .3 : .35), 'font-weight': 700 });
        label.textContent = stage === 3 ? value.binary : String(value.code); layer.append(label);
      }
    });
  }

  function grayscalePicture(stage, values, { resolution = 4, bits = 3, idPrefix = 'im-quiz', showValues = true } = {}) {
    const svg = svgNode('svg', { class: 'im-picture', viewBox: '0 0 320 320', role: 'img', 'aria-labelledby': `${idPrefix}-picture-title-${stage} ${idPrefix}-picture-desc-${stage}` });
    const title = svgNode('title', { id: `${idPrefix}-picture-title-${stage}` });
    title.textContent = ['元のグレースケール画像', `${resolution}×${resolution}画素に標本化した画像`, `${Core.levels(bits)}階調に量子化した画像`, `各画素を${bits}桁の2進数で符号化した画像`][stage];
    const desc = svgNode('desc', { id: `${idPrefix}-picture-desc-${stage}` });
    desc.textContent = '左上が明るく、右下が暗い画像。同じ画像の変化を左から順に比べます。';
    if (stage >= 2 && showValues) {
      desc.textContent = Array.from({ length: resolution }, (_, row) => `${row + 1}行目は${values.slice(row * resolution, (row + 1) * resolution).map(value => stage === 3 ? value.binary : value.code).join('、')}`).join('。') + 'です。';
    }
    svg.append(title, desc);
    if (stage === 0) {
      const defs = svgNode('defs', {});
      const gradient = svgNode('linearGradient', { id: `${idPrefix}-gray-gradient`, x1: 0, y1: 0, x2: 1, y2: 1 });
      gradient.append(svgNode('stop', { 'stop-color': '#fff' }), svgNode('stop', { offset: 1, 'stop-color': '#000' }));
      defs.append(gradient); svg.append(defs, svgNode('rect', { width: 320, height: 320, fill: `url(#${idPrefix}-gray-gradient)` }));
    }
    const layer = svgNode('g', {}); drawGrayscale(layer, stage, values, { resolution, bits, showValues }); svg.append(layer);
    return svg;
  }

  function initializeGrayscale(host) {
    const options = { resolution: 5, bits: 4, idPrefix: 'im-gray-demo', showValues: false };
    const values = Core.grayscaleExample(options.resolution, options.bits);
    host.querySelectorAll('[data-image-gray-picture]').forEach(picture => {
      const stage = Number(picture.dataset.imageGrayPicture);
      picture.append(grayscalePicture(stage, values, options));
      const button = host.querySelector(`[data-image-gray-values="${stage}"]`);
      if (!button) return;
      button.addEventListener('click', () => {
        const showValues = button.getAttribute('aria-pressed') !== 'true';
        picture.replaceChildren(grayscalePicture(stage, values, { ...options, showValues }));
        button.setAttribute('aria-pressed', String(showValues));
        button.textContent = `${stage === 2 ? '段階値' : '2進数'}を${showValues ? '隠す' : '表示'}`;
        resized();
      });
    });
    reveal(host);
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

  function initializeFormats(host) {
    const buttons = [...host.querySelectorAll('[data-image-format-zoom]')];
    const caption = host.querySelector('[data-image-format-caption]');
    function update(zoom) {
      host.style.setProperty('--im-format-zoom', zoom);
      buttons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.imageFormatZoom) === zoom)));
      caption.textContent = zoom === 1
        ? '同じ円と直線を、異なる方法で保存した画像です。'
        : `全体を表示したときの${zoom}倍です。円と直線が交わる部分で、輪郭を比べましょう。`;
      resized();
    }
    buttons.forEach(button => button.addEventListener('click', () => update(Number(button.dataset.imageFormatZoom))));
    reveal(host);
    update(1);
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
      ['[data-image-size-quiz]', initializeSizeQuiz], ['[data-image-formats]', initializeFormats]
    ]) document.querySelectorAll(selector).forEach(host => safely(host, setup));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
