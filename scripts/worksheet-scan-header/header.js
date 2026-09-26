/* Pure SVG/coordinate generator. The same file runs in Node and Apps Script V8. */
var WorksheetScanHeader = (function () {
  'use strict';
  const round = n => Math.round(n * 1e6) / 1e6;
  const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  function fiscalYear(date) {
    const jst = new Date(date.getTime() + 9 * 3600000);
    if (!Number.isFinite(jst.getTime())) throw new Error('Invalid date');
    return jst.getUTCFullYear() - (jst.getUTCMonth() < 3 ? 1 : 0);
  }
  function identity(options, config) {
    const parts = options.qrPayload ? String(options.qrPayload).split('|') : [options.subject || config.subject, String(options.year || fiscalYear(new Date())), options.worksheetId, options.side || 'F'];
    if (parts.length !== 4 || parts.some(p => typeof p !== 'string') || !/^[A-Za-z0-9_-]{1,20}$/.test(parts[0]) || !/^[0-9]{4}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{1,20}$/.test(parts[2]) || !/^[FB]$/.test(parts[3])) throw new Error('QR must be subject|year|worksheetId|F or B (ASCII identifiers, max 20 characters)');
    for (const [key, index] of [['subject', 0], ['year', 1], ['worksheetId', 2], ['side', 3]]) {
      if (options[key] !== undefined && String(options[key]) !== parts[index]) throw new Error('QR and ' + key + ' disagree');
    }
    return { subject: parts[0], year: Number(parts[1]), worksheetId: parts[2], side: parts[3], payload: parts.join('|') };
  }
  function textWidth(text, size) {
    return Array.from(text).reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 0.62 : 1), 0) * size;
  }
  function titleLines(title, width, config) {
    if (!title || Array.from(title).length > 200 || /[\x00-\x1f]/.test(title)) throw new Error('Title must be 1-200 printable characters');
    let size = config.titleSize;
    if (textWidth(title, size) <= width) return { lines: [title], size };
    size = Math.max(config.titleMinSize, Math.min(size, width / textWidth(title, 1)));
    if (textWidth(title, size) <= width + 0.001) return { lines: [title], size };
    const lines = [''];
    for (const c of title) {
      if (textWidth(lines[lines.length - 1] + c, size) > width) lines.push('');
      lines[lines.length - 1] += c;
    }
    if (lines.length > 2) {
      lines.length = 2;
      while (textWidth(lines[1] + '…', size) > width) lines[1] = lines[1].slice(0, -1);
      lines[1] += '…';
    }
    return { lines, size };
  }
  function create(options, config, qrLibrary) {
    const paperSize = String(options.pageSize || 'b5').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(config.papers, paperSize)) throw new Error('Only JIS B5 portrait and A4 portrait are supported');
    const paper = config.papers[paperSize], scale = options.scale === undefined ? paper.scale : Number(options.scale);
    const h = config.header, o = config.omr, q = config.qr, m = config.markers;
    if (!Number.isFinite(scale) || scale <= 0 || (paperSize === 'b5' && scale !== 1)) throw new Error('B5 scale is fixed at 1; A4 scale must be positive');
    if (o.diameter * scale < config.limits.minCircleDiameter || o.stroke * scale < config.limits.minStroke || q.size * scale < config.limits.minQrSize) throw new Error('Scale is below reading limits');
    if (h.leftWidth + h.middleWidth + h.rightWidth + h.gap * 2 !== h.width || q.size > h.rightWidth || q.quietModules < 4) throw new Error('Invalid column or quiet-zone geometry');
    const width = paper.width, height = paper.height;
    const hx = width - (h.right + h.width) * scale, hy = h.top * scale;
    if (hx < (m.inset + m.size + m.clearance) * scale || hy + h.height * scale >= height / 2) throw new Error('Header does not fit printable area');
    const id = identity(options, config);
    const title = String(options.title || '音のデジタル表現');
    const qr = qrLibrary.QrCode.encodeSegments(qrLibrary.QrSegment.makeSegments(id.payload), qrLibrary.QrCode.Ecc.MEDIUM, 1, q.maxVersion, -1, false);
    const moduleSize = q.size * scale / (qr.size + q.quietModules * 2);
    if (moduleSize < q.minModule) throw new Error('QR modules are too small; shorten the identifiers');
    const scene = [];
    const rect = (x, y, w, h, fill, stroke, lineWidth, group) => scene.push({ type: 'rect', x, y, width: w, height: h, fill, stroke, lineWidth, group });
    const line = (x1, y1, x2, y2, lineWidth) => scene.push({ type: 'line', x1, y1, x2, y2, lineWidth, group: 'header' });
    const text = (value, x, y, size, anchor = 'start', bold = false) => scene.push({ type: 'text', text: value, x, y, size, anchor, bold, group: 'header' });
    const X = x => hx + x * scale, Y = y => hy + y * scale;
    const box = (x, y, w, hh) => ({ x: round(x), y: round(y), width: round(w), height: round(hh) });
    const normalizeRect = r => ({ x: round(r.x / width), y: round(r.y / height), width: round(r.width / width), height: round(r.height / height) });
    const rectInfo = r => ({ mm: r, normalized: normalizeRect(r) });
    const pointInfo = (x, y) => ({ mm: { x: round(x), y: round(y) }, normalized: { x: round(x / width), y: round(y / height) } });
    const header = rectInfo(box(hx, hy, h.width * scale, h.height * scale));
    const middleX = h.leftWidth + h.gap, rightX = middleX + h.middleWidth + h.gap;
    const columns = { left: rectInfo(box(hx, hy, h.leftWidth * scale, h.height * scale)), middle: rectInfo(box(X(middleX), hy, h.middleWidth * scale, h.height * scale)), right: rectInfo(box(X(rightX), hy, h.rightWidth * scale, h.height * scale)) };
    const fitted = titleLines(title, h.leftWidth - 1, config.text);
    fitted.lines.forEach((v, i) => text(v, hx, Y(5 + i * config.text.titleLineHeight), fitted.size * scale, 'start', true));
    text('氏名', hx, Y(19), config.text.labelSize * scale);
    line(X(9), Y(20), X(h.leftWidth - 1), Y(20), o.stroke * scale);
    const omr = {}, handwriting = {};
    for (let digit = 0; digit < 10; digit++) text(String(digit), X(middleX + o.firstX + digit * o.pitchX), Y(o.headingY), config.text.labelSize * scale, 'middle');
    ['class', 'tens', 'ones'].forEach((row, index) => {
      const localY = o.firstY + index * o.pitchY, y = Y(localY);
      if (index < 2) text(index === 0 ? '組' : '番', X(middleX), y + 0.95 * scale, config.text.labelSize * scale);
      const r = box(X(middleX + o.boxX), y - o.boxSize * scale / 2, o.boxSize * scale, o.boxSize * scale);
      rect(r.x, r.y, r.width, r.height, null, '#000', o.stroke * scale, 'header');
      handwriting[row + '_box'] = rectInfo(r);
      omr[row] = Array.from({ length: 10 }, (_, digit) => {
        const localX = middleX + o.firstX + digit * o.pitchX, x = X(localX), radius = o.diameter * scale / 2;
        scene.push({ type: 'circle', x, y, radius, lineWidth: o.stroke * scale, group: 'header' });
        return { digit, center: pointInfo(x, y), radiusMm: round(radius), radiusNormalized: { x: round(radius / width), y: round(radius / height) }, sampleRadiusMm: round(radius * o.sampleRadiusRatio), headerNormalized: { x: round(localX / h.width), y: round(localY / h.height) } };
      });
    });
    const qx = X(rightX), qy = hy, quiet = q.quietModules * moduleSize;
    rect(qx, qy, q.size * scale, q.size * scale, '#fff', null, 0, 'header');
    // Merge contiguous black modules per row: compact vectors, no raster images.
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (!qr.getModule(x, y)) continue;
        const start = x;
        while (x + 1 < qr.size && qr.getModule(x + 1, y)) x++;
        rect(qx + quiet + start * moduleSize, qy + quiet + y * moduleSize, (x - start + 1) * moduleSize, moduleSize, '#000', null, 0, 'header');
      }
    }
    const label = id.worksheetId + ' ' + id.side;
    text(label, qx + q.size * scale / 2, Y(23.5), Math.min(config.text.idSize, q.size / textWidth(label, 1)) * scale, 'middle');
    const markers = {};
    for (const [key, right, bottom] of [['topLeft', false, false], ['topRight', true, false], ['bottomLeft', false, true], ['bottomRight', true, true]]) {
      const size = m.size * scale, inset = m.inset * scale;
      const x = right ? width - inset - size : inset, y = bottom ? height - inset - size : inset;
      rect(x, y, size, size, '#000', null, 0, 'marker');
      markers[key] = { ...rectInfo(box(x, y, size, size)), center: pointInfo(x + size / 2, y + size / 2), exclusion: rectInfo(box(x - m.clearance * scale, y - m.clearance * scale, size + 2 * m.clearance * scale, size + 2 * m.clearance * scale)) };
    }
    const coordinates = { schemaVersion: config.schemaVersion, origin: 'top-left', axes: 'x-right,y-down', units: 'mm', pageSize: paperSize, page: { widthMm: width, heightMm: height }, scale, dpi: config.dpi, raster: { width: Math.round(width / 25.4 * config.dpi), height: Math.round(height / 25.4 * config.dpi) }, identity: id, title, displayedTitle: fitted.lines, header, columns, qr: { region: rectInfo(box(qx, qy, q.size * scale, q.size * scale)), symbol: rectInfo(box(qx + quiet, qy + quiet, qr.size * moduleSize, qr.size * moduleSize)), center: pointInfo(qx + q.size * scale / 2, qy + q.size * scale / 2), sizeMm: round(q.size * scale), moduleMm: round(moduleSize), quietZoneModules: q.quietModules, quietZoneMm: round(quiet), version: qr.version, modules: qr.size, ecc: 'M' }, omr, handwriting, markers, body: { minTopMm: round((h.top + h.height + config.bodyGap) * scale), minBottomMarginMm: round((m.inset + m.size + m.clearance) * scale) } };
    return { coordinates, scene };
  }
  function svg(model, onlyHeader) {
    const c = model.coordinates, b = onlyHeader ? c.header.mm : { x: 0, y: 0, width: c.page.widthMm, height: c.page.heightMm };
    const attrs = obj => Object.entries(obj).map(([k, v]) => k + '="' + escape(typeof v === 'number' ? round(v) : v) + '"').join(' ');
    const children = model.scene.filter(s => !onlyHeader || s.group === 'header').map(s => {
      if (s.type === 'text') return '<text ' + attrs({ x: s.x, y: s.y, 'font-size': s.size, 'text-anchor': s.anchor, 'font-weight': s.bold ? 700 : 400 }) + '>' + escape(s.text) + '</text>';
      if (s.type === 'line') return '<line ' + attrs({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, stroke: '#000', 'stroke-width': s.lineWidth }) + '/>';
      if (s.type === 'circle') return '<circle ' + attrs({ cx: s.x, cy: s.y, r: s.radius, fill: 'none', stroke: '#000', 'stroke-width': s.lineWidth }) + '/>';
      return '<rect ' + attrs({ x: s.x, y: s.y, width: s.width, height: s.height, fill: s.fill || 'none', stroke: s.stroke || 'none', 'stroke-width': s.lineWidth || 0 }) + '/>';
    }).join('\n');
    return '<svg xmlns="http://www.w3.org/2000/svg" class="ws-scan-svg ws-scan-svg--' + c.pageSize + '" width="' + b.width + 'mm" height="' + b.height + 'mm" viewBox="' + [b.x, b.y, b.width, b.height].join(' ') + '" role="img" aria-label="' + escape(c.title + ' ' + c.identity.side + ' 氏名欄、組と番号のマーク欄、ワークシート識別QR') + '" font-family="Yu Gothic, YuGothic, sans-serif" fill="#000"><title>' + escape(c.title) + '</title><desc>組・出席番号の十の位・一の位を各行1つ塗りつぶす。QR: ' + escape(c.identity.payload) + '</desc>\n' + children + '\n</svg>';
  }
  return { create, svg, escape, fiscalYear };
})();
