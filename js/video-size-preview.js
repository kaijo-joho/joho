/* 動画サイズ比較用。描画時は量子化済みの2枚を重ねるだけにする。 */
(() => {
  'use strict';

  const SOURCE_WIDTH = 320;
  const SOURCE_HEIGHT = 180;
  const MAX_CACHE_ENTRIES = 2;
  const paletteBits = { 1: [1, 0, 0], 4: [1, 2, 1], 8: [3, 3, 2], 16: [5, 6, 5], 24: [8, 8, 8] };
  const channelTables = Object.fromEntries(Object.entries(paletteBits).map(([bits, channels]) => [bits,
    channels.map(count => {
      const maximum = (1 << count) - 1;
      return Uint8ClampedArray.from({ length: 256 }, (_, value) => maximum ? Math.round(value * maximum / 255) * 255 / maximum : 0);
    })
  ]));
  // 4bitは風景の代表色16色を使う。パレット自体の情報量は計算の対象外。
  const palette16 = ['233e50', '2e6886', '58a2bb', '78b9df', '9bcee7', 'bfdfee', 'e0f0f4', 'd5e5ed', 'ffffff', 'fff1bd', 'edbb65', '3d7058', '598661', '739865', '8cb287', 'a8c68d']
    .map(hex => [0, 2, 4].map(start => parseInt(hex.slice(start, start + 2), 16)));
  const paletteLookup = Uint8Array.from({ length: 32768 }, (_, key) => {
    const rgb = [key >> 10, key >> 5 & 31, key & 31].map(value => value * 255 / 31);
    let closest = 0, distance = Infinity;
    palette16.forEach((color, index) => {
      const next = color.reduce((sum, value, channel) => sum + (value - rgb[channel]) ** 2, 0);
      if (next < distance) { closest = index; distance = next; }
    });
    return closest;
  });
  const classFills = {
    'vd-landscape-sky': 'url(#vd-landscape-sky)', 'vd-landscape-hill': 'url(#vd-landscape-hill)',
    'vd-landscape-grass': 'url(#vd-landscape-grass)', 'vd-landscape-cloud': 'url(#vd-landscape-cloud)',
    'vd-landscape-wing': 'url(#vd-landscape-wing)'
  };
  const variables = {
    '--vd-scene-sun': '#fff1bd', '--vd-scene-ink': '#233e50', '--vd-scene-tail': '#ddebf0',
    '--vd-scene-body': '#e9f3f5', '--vd-scene-beak': '#edbb65'
  };

  function canvas(width, height) {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return element;
  }

  function resolveStyles(element) {
    if (element.nodeType !== Node.ELEMENT_NODE) return;
    for (const name of (element.getAttribute('class') || '').split(/\s+/)) {
      if (classFills[name]) element.setAttribute('fill', classFills[name]);
    }
    for (const attribute of ['fill', 'stroke']) {
      const value = element.getAttribute(attribute);
      if (!value || !value.includes('var(')) continue;
      element.setAttribute(attribute, value.replace(/var\((--[\w-]+),\s*([^)]*)\)/g, (all, name, fallback) => variables[name] || fallback));
    }
    for (const child of element.children) resolveStyles(child);
  }

  function svgFor(defs, groupId, viewBox, width, height) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('xmlns', ns);
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    const localDefs = document.createElementNS(ns, 'defs');
    for (const id of ['vd-landscape-sky', 'vd-landscape-hill', 'vd-landscape-grass', 'vd-landscape-cloud', 'vd-landscape-wing']) {
      const source = defs.querySelector(`#${id}`);
      if (source) localDefs.append(source.cloneNode(true));
    }
    const sourceGroup = defs.querySelector(`#${groupId}`);
    if (!sourceGroup) throw new Error(`VideoSizePreview: #${groupId} が見つかりません。`);
    const group = sourceGroup.cloneNode(true);
    resolveStyles(group);
    if (groupId === 'vd-landscape') {
      const sceneHeight = SOURCE_WIDTH * height / width;
      group.querySelector('.vd-landscape-sky').setAttribute('height', sceneHeight);
      group.querySelectorAll('.vd-landscape-hill, .vd-landscape-grass').forEach(part => part.setAttribute('transform', `translate(0 ${sceneHeight - SOURCE_HEIGHT})`));
    }
    svg.append(localDefs, group);
    return new XMLSerializer().serializeToString(svg);
  }

  async function rasterize(svgText, width, height) {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('VideoSizePreview: SVGを画像に変換できません。'));
        image.src = url;
      });
      const result = canvas(width, height);
      const context = result.getContext('2d', { alpha: true });
      context.imageSmoothingEnabled = true;
      context.drawImage(image, 0, 0, width, height);
      return result;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function quantize(target, bits, binaryAlpha) {
    const componentBits = paletteBits[bits];
    if (!componentBits) throw new Error('VideoSizePreview: 対応していない色数です。');
    if (bits === 24 && !binaryAlpha) return;
    const tables = channelTables[bits];
    const context = target.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, target.width, target.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      if (binaryAlpha) {
        data[i + 3] = data[i + 3] >= 128 ? 255 : 0;
        if (!data[i + 3]) continue;
      }
      if (bits === 1) {
        const value = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114 >= 128 ? 255 : 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        continue;
      }
      if (bits === 4) {
        const key = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3;
        [data[i], data[i + 1], data[i + 2]] = palette16[paletteLookup[key]];
        continue;
      }
      data[i] = tables[0][data[i]];
      data[i + 1] = tables[1][data[i + 1]];
      data[i + 2] = tables[2][data[i + 2]];
    }
    context.putImageData(image, 0, 0);
  }

  function assertSettings(settings) {
    const { width, height, bits } = settings || {};
    const allowedSizes = new Set(['400x300', '800x600', '1600x1200', '1920x1080']);
    if (!allowedSizes.has(`${width}x${height}`) || !paletteBits[bits]) throw new Error('VideoSizePreview: 解像度または1画素のbit数が不正です。');
  }

  function create(output, defs) {
    if (!(output instanceof HTMLCanvasElement) || !defs) throw new Error('VideoSizePreview: canvasとdefsが必要です。');
    const cache = new Map();
    let latestRequest = 0;
    let active = null;

    async function prepare(settings) {
      const { width, height, bits } = settings;
      const birdWidth = Math.max(1, Math.round(width * 67 / SOURCE_WIDTH));
      const birdHeight = Math.max(1, Math.round(width * 39 / SOURCE_WIDTH));
      const [background, bird] = await Promise.all([
        rasterize(svgFor(defs, 'vd-landscape', `0 0 ${SOURCE_WIDTH} ${SOURCE_WIDTH * height / width}`, width, height), width, height),
        rasterize(svgFor(defs, 'vd-flight-bird', '0 0 67 39', birdWidth, birdHeight), birdWidth, birdHeight)
      ]);
      quantize(background, bits, false);
      quantize(bird, bits, true);
      return { width, height, bits, background, bird };
    }

    function retain(key, entry) {
      cache.delete(key);
      cache.set(key, entry);
      while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    }

    const api = {
      async configure(settings) {
        assertSettings(settings);
        const request = ++latestRequest;
        active = null;
        const key = `${settings.width}x${settings.height}/${settings.bits}`;
        let entry = cache.get(key);
        if (!entry) {
          entry = { promise: prepare(settings) };
          retain(key, entry);
          entry.promise.then((prepared) => {
            entry.prepared = prepared;
          }, () => {
            if (cache.get(key) === entry) cache.delete(key);
          });
        } else {
          retain(key, entry);
        }
        const prepared = entry.prepared || await entry.promise;
        if (request !== latestRequest) return;
        output.width = prepared.width;
        output.height = prepared.height;
        active = prepared;
        api.draw(0);
      },

      draw(seconds) {
        if (!active || !Number.isFinite(seconds)) return;
        const context = output.getContext('2d', { alpha: false });
        context.imageSmoothingEnabled = false;
        context.drawImage(active.background, 0, 0);
        const phase = ((seconds % 4) + 4) % 4 / 4;
        const progress = phase < .5 ? phase * 2 : 2 - phase * 2;
        const x = Math.round((active.width - active.bird.width) * progress);
        const y = Math.round(active.height * .28 - active.bird.height / 2);
        context.drawImage(active.bird, x, y);
      }
    };
    return api;
  }

  globalThis.VideoSizePreview = { create };
})();
