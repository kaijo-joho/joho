import {parseWorksheetQr, provisionalLimits, hashBlob} from './10_model.mjs';
const layoutCache = new Map();
const rowNames = ['class', 'tens', 'ones'];
export async function layouts() {
  if (!layoutCache.size) {
    for (const name of ['b5', 'b5-back', 'a4', 'a4-back']) {
      const r = await fetch(new URL('./layout/' + name + '.json',import.meta.url));
      if (!r.ok) throw Error('LAYOUT_NOT_AVAILABLE');
      layoutCache.set(name, await r.json());
    }
  }
  return [...layoutCache.values()];
}
export function canvas(width, height) {const c = document.createElement('canvas'); c.width = width; c.height = height; return c;}
function percentile(values, p) {
  const hist = new Uint32Array(256); for (const v of values) hist[Math.round(v)]++;
  const target = values.length * p; let total = 0;
  for (let i = 0; i < 256; i++) {total += hist[i]; if (total >= target) return i;}
  return 255;
}
export async function loadImage(blob, turns = 0) {
  if (!(blob instanceof Blob) || blob.size > provisionalLimits.maxInputBytes) throw Error('INPUT_TOO_LARGE');
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const png = head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71;
  const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  if (!png && !jpeg) throw Error('INPUT_FORMAT_UNSUPPORTED');
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > provisionalLimits.maxPixels) throw Error('INPUT_TOO_MANY_PIXELS');
    // Modern Image decoding applies EXIF orientation; output PNG has no orientation dependency.
    const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
    const w = Math.round(image.naturalWidth * scale), h = Math.round(image.naturalHeight * scale), odd = turns % 2;
    const c = canvas(odd ? h : w, odd ? w : h), ctx = c.getContext('2d', {willReadFrequently: true});
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(turns * Math.PI / 2); ctx.drawImage(image, -w / 2, -h / 2, w, h);
    return c;
  } finally {URL.revokeObjectURL(url);}
}
function grayscale(c) {
  const rgba = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, c.width, c.height).data;
  const gray = new Uint8Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round((rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3);
  return gray;
}
export function detectMarkers(c) {
  const gray = grayscale(c), hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let weight = 0, partial = 0, best = 0, threshold = 100;
  for (let t = 0; t < 255; t++) {
    weight += hist[t]; partial += t * hist[t];
    const remaining = gray.length - weight; if (!weight || !remaining) continue;
    const variance = weight * remaining * Math.pow(partial / weight - (sum - partial) / remaining, 2);
    if (variance > best) {best = variance; threshold = t;}
  }
  threshold = Math.min(180, Math.max(10, threshold + 2));
  const w = c.width, h = c.height, seen = new Uint8Array(gray.length), rw = Math.ceil(w * .27), rh = Math.ceil(h * .27);
  const regions = [[0, 0, rw, rh], [w - rw, 0, w, rh], [w - rw, h - rh, w, h], [0, h - rh, rw, h]];
  const points = [];
  for (const [x0, y0, x1, y1] of regions) {
    const candidates = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const start = y * w + x; if (seen[start] || gray[start] > threshold) continue;
      seen[start] = 1; const queue = [start]; let count = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y;
      for (let n = 0; n < queue.length; n++) {
        const i = queue[n], xx = i % w, yy = Math.floor(i / w);
        count++; sx += xx; sy += yy; minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, yy); maxY = Math.max(maxY, yy);
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          const jx = j % w, jy = Math.floor(j / w);
          if (jx < x0 || jx >= x1 || jy < y0 || jy >= y1 || seen[j] || gray[j] > threshold || Math.abs(jx - xx) + Math.abs(jy - yy) !== 1) continue;
          seen[j] = 1; queue.push(j);
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1, fill = count / (bw * bh), fraction = count / gray.length;
      if (fraction < .00006 || fraction > .004 || fill < .72 || bw / bh < .55 || bw / bh > 1.8) continue;
      const cx = sx / count, cy = sy / count;
      const edgeDistance = Math.min(cx, w - cx) / w + Math.min(cy, h - cy) / h;
      candidates.push({x: cx, y: cy, score: edgeDistance + (1 - fill) * .2});
    }
    candidates.sort((a, b) => a.score - b.score);
    if (!candidates.length) return null;
    points.push({x: candidates[0].x, y: candidates[0].y});
  }
  return points;
}
function homography(from, to) {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const {x, y} = from[i], u = to[i].x, v = to[i].y;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let p = 0; p < 8; p++) {
    let m = p; for (let r = p + 1; r < 8; r++) if (Math.abs(rows[r][p]) > Math.abs(rows[m][p])) m = r;
    [rows[p], rows[m]] = [rows[m], rows[p]];
    if (Math.abs(rows[p][p]) < 1e-9) throw Error('INVALID_CORNERS');
    const f = rows[p][p]; for (let j = p; j <= 8; j++) rows[p][j] /= f;
    for (let r = 0; r < 8; r++) if (r !== p) {const t = rows[r][p]; for (let j = p; j <= 8; j++) rows[r][j] -= t * rows[p][j];}
  }
  return rows.map(r => r[8]).concat(1);
}
export function warp(source, sourcePoints, targetPoints, width, height) {
  const matrix = homography(targetPoints, sourcePoints);
  const input = source.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, source.width, source.height).data;
  const out = canvas(width, height), ctx = out.getContext('2d', {willReadFrequently: true}), image = ctx.createImageData(width, height), d = image.data;
  d.fill(255);
  for (let y = 0, k = 0; y < height; y++) for (let x = 0; x < width; x++, k += 4) {
    const denominator = matrix[6] * x + matrix[7] * y + 1;
    const xx = (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator, yy = (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator;
    if (xx < 0 || yy < 0 || xx >= source.width - 1 || yy >= source.height - 1) continue;
    const ix = Math.floor(xx), iy = Math.floor(yy), fx = xx - ix, fy = yy - iy, a = (iy * source.width + ix) * 4;
    for (let channel = 0; channel < 3; channel++) d[k + channel] = input[a + channel] * (1 - fx) * (1 - fy) + input[a + 4 + channel] * fx * (1 - fy)
      + input[a + source.width * 4 + channel] * (1 - fx) * fy + input[a + (source.width + 1) * 4 + channel] * fx * fy;
  }
  ctx.putImageData(image, 0, 0); return out;
}
function targetMarkers(c, width, height) {
  return ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map(key => ({
    x: c.markers[key].center.mm.x / c.page.widthMm * width, y: c.markers[key].center.mm.y / c.page.heightMm * height
  }));
}
function tone(image, brightness, contrast) {
  const ctx = image.getContext('2d', {willReadFrequently: true}), id = ctx.getImageData(0, 0, image.width, image.height);
  const factor = Math.max(.4, 1 + contrast / 100);
  for (let i = 0; i < id.data.length; i += 4) for (let k = 0; k < 3; k++) id.data[i + k] = (id.data[i + k] - 128) * factor + 128 + brightness * 2.55;
  ctx.putImageData(id, 0, 0);
}
function readQr(image, c) {
  const r = c.qr.region.mm, margin = 2.5, scaleX = image.width / c.page.widthMm, scaleY = image.height / c.page.heightMm;
  const x = Math.max(0, Math.floor((r.x - margin) * scaleX)), y = Math.max(0, Math.floor((r.y - margin) * scaleY));
  const w = Math.min(image.width - x, Math.ceil((r.width + margin * 2) * scaleX)), h = Math.min(image.height - y, Math.ceil((r.height + margin * 2) * scaleY));
  const data = image.getContext('2d', {willReadFrequently: true}).getImageData(x, y, w, h);
  const decoded = window.jsQR(data.data, w, h, {inversionAttempts: 'attemptBoth'});
  if (!decoded) return null;
  let qr; try {qr = parseWorksheetQr(decoded.data);} catch (e) {return null;}
  if (qr.side !== c.identity.side) return null;
  const modules = decoded.version * 4 + 17, quiet = r.width * 4 / (modules + 8);
  const expected = [{x: r.x + quiet, y: r.y + quiet}, {x: r.x + r.width - quiet, y: r.y + quiet},
    {x: r.x + r.width - quiet, y: r.y + r.height - quiet}, {x: r.x + quiet, y: r.y + r.height - quiet}];
  const actual = ['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'].map(key => ({
    x: (decoded.location[key].x + x) / scaleX, y: (decoded.location[key].y + y) / scaleY
  }));
  const error = Math.max(...actual.map((p, i) => Math.hypot(p.x - expected[i].x, p.y - expected[i].y)));
  return {qr, error, modules};
}
function markSamples(gray, image, c, mark) {
  const cx = mark.center.mm.x / c.page.widthMm * image.width, cy = mark.center.mm.y / c.page.heightMm * image.height;
  const rx = mark.sampleRadiusMm / c.page.widthMm * image.width, ry = mark.sampleRadiusMm / c.page.heightMm * image.height;
  const inside = [], surrounding = [];
  for (let y = Math.floor(cy - ry * 2.1); y <= cy + ry * 2.1; y++) for (let x = Math.floor(cx - rx * 2.1); x <= cx + rx * 2.1; x++) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    const r = Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2), v = gray[y * image.width + x];
    if (r <= 1) inside.push(v); if (r > 2.8 && r < 4.3) surrounding.push(v);
  }
  return {inside, paper: percentile(surrounding, .9), radius: Math.min(rx, ry)};
}
export function readOmr(image, c) {
  const gray = grayscale(image), rows = {}, issues = [];
  for (const name of rowNames) {
    const samples = c.omr[name].map(mark => markSamples(gray, image, c, mark));
    let selected = null, stable = 0, previous = null;
    const weak = samples.map(s => s.inside.filter(v => v < s.paper * .9).length / s.inside.length);
    for (let t = .65; t <= .875 + .0001; t += .025) {
      const ratios = samples.map(s => s.inside.filter(v => v < s.paper * t).length / s.inside.length);
      const order = ratios.map((v, digit) => ({v, digit})).sort((a, b) => b.v - a.v), a = order[0], b = order[1];
      const othersWeak = Math.max(...weak.filter((_, i) => i !== a.digit));
      const ok = a.v >= .55 && b.v <= .18 && a.v - b.v >= .4 && othersWeak <= .28 && samples.every(s => s.paper >= 90 && s.radius >= 4);
      if (ok && previous === a.digit) stable++; else stable = ok ? 1 : 0;
      previous = ok ? a.digit : null;
      if (stable >= 2) {selected = a.digit; break;}
    }
    const blank = Math.max(...weak) < .08;
    rows[name] = {digit: selected, status: selected === null ? 'REVIEW' : 'OK', blank};
    if (selected === null) issues.push(blank ? 'マークが空欄です。表裏とも3行すべてを塗ってください。' : '複数マーク・薄い塗り・消し跡等で読めません。紙のマークを修正して撮り直してください。');
  }
  return {rows, issues, classNumber: rows.class.digit, number: rows.tens.digit === null || rows.ones.digit === null ? null : rows.tens.digit * 10 + rows.ones.digit};
}
function quality(image, c) {
  const gray = grayscale(image), roi = Math.min(image.height - 2, Math.ceil(40 / c.page.heightMm * image.height));
  let sum = 0, count = 0;
  for (let y = 2; y < roi; y += 2) for (let x = 2; x < image.width - 2; x += 2) {
    const i = y * image.width + x, lap = gray[i - 1] + gray[i + 1] + gray[i - image.width] + gray[i + image.width] - 4 * gray[i];
    sum += lap * lap; count++;
  }
  return {headerSharpness: sum / Math.max(1, count), paperBrightness: percentile(gray, .9)};
}
export async function processImage(blob, options = {}) {
  const began = performance.now(), source = await loadImage(blob, options.turns || 0), corners = options.corners || detectMarkers(source);
  if (!corners) return {source, corners: null, reading: {status: 'REVIEW', message: '四隅の黒いマーカーを確認できません。用紙全体を撮り直すか、マーカーの中心を指定してください。'}};
  if (corners.length !== 4 || new Set(corners.map(p => Math.round(p.x) + ',' + Math.round(p.y))).size !== 4) throw Error('INVALID_CORNERS');
  const candidates = [];
  for (const c of await layouts()) for (let turn = 0; turn < 4; turn++) {
    const rotated = corners.slice(turn).concat(corners.slice(0, turn));
    const width = 1000, height = Math.round(width * c.page.heightMm / c.page.widthMm);
    const image = warp(source, rotated, targetMarkers(c, width, height), width, height);
    tone(image, options.brightness || 0, options.contrast || 0);
    const found = readQr(image, c);
    if (found) candidates.push({...found, c, points: rotated});
  }
  candidates.sort((a, b) => a.error - b.error);
  const best = candidates[0];
  if (!best || best.error > .8 || candidates[1] && candidates[1].error - best.error < .1) {
    return {source, corners, reading: {status: 'REVIEW', message: 'WS識別QRまたは用紙の位置を確認できません。別種類のQRは使えません。撮り直し・画像の差し替え・四隅指定を試してください。'}};
  }
  const c = best.c, width = provisionalLimits.normalizedWidth, height = Math.round(width * c.page.heightMm / c.page.widthMm);
  const corrected = warp(source, best.points, targetMarkers(c, width, height), width, height);
  tone(corrected, options.brightness || 0, options.contrast || 0);
  const omr = readOmr(corrected, c), q = quality(corrected, c), problems = omr.issues.slice();
  const modulePixels = 22 / c.page.widthMm * Math.min(source.width, source.height * c.page.widthMm / c.page.heightMm) / (best.modules + 8);
  if (modulePixels < 3) problems.push('解像度が不足しています。用紙を大きく写して撮り直してください。');
  if (q.headerSharpness < 25) problems.push('画像がぼけています。明るい場所でピントを合わせて撮り直してください。');
  if (q.paperBrightness < 100) problems.push('画像が暗すぎます。明るさを調整するか、撮り直してください。');
  const correctedBlob = await new Promise(resolve => corrected.toBlob(resolve, 'image/png'));
  if (!correctedBlob || correctedBlob.size > provisionalLimits.maxImageBytes) throw Error('OUTPUT_TOO_LARGE');
  return {source, corners, correctedBlob, sha256: await hashBlob(correctedBlob), reading: {
    status: problems.length ? 'REVIEW' : 'OK', message: problems[0] || '', qr: best.qr, classNumber: omr.classNumber,
    number: omr.number, rows: omr.rows, pageSize: c.pageSize, quality: q, sourcePixelsPerModule: modulePixels,
    elapsedMs: Math.round(performance.now() - began), correctedBytes: correctedBlob.size
  }};
}
