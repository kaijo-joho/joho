/* Ilapo phase ② exports: raster PNG and vector browser printing. */
(function (root, factory) {
  var api = factory(root);
  root.IlapoExport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MAX_AXIS = 16384;
  var MAX_PIXELS = 32 * 1024 * 1024;
  var PX_PER_MM = 96 / 25.4;

  function error(message) { return new Error('イラストスライド書き出し: ' + message); }
  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }
  function svgModule() {
    if (root.IlapoSVG && typeof root.IlapoSVG.exportPage === 'function') return root.IlapoSVG;
    if (typeof require === 'function') {
      try { var svg = require('./svg.js'); root.IlapoSVG = svg; return svg; } catch (_) { /* browser has no require */ }
    }
    throw error('SVG出力モジュールを読み込めません。');
  }
  function svgSize(svg) {
    var match = String(svg).match(/<svg\b[^>]*\bwidth="([^" ]+)"[^>]*\bheight="([^" ]+)"/i);
    if (!match) throw error('SVGの寸法を読み取れません。');
    var width = finite(match[1], NaN), height = finite(match[2], NaN);
    if (!(width > 0) || !(height > 0)) throw error('SVGの寸法が正しくありません。');
    return { width: width, height: height };
  }
  function selectedPage(page, options) {
    options = options || {};
    if (options.selectionIds != null) {
      if (!Array.isArray(options.selectionIds) || !options.selectionIds.length) throw error('選択した図形がありません。');
      var ids = new Set(options.selectionIds);
      if (!page || !Array.isArray(page.objects) || !page.objects.some(function (o) { return ids.has(o.id); })) throw error('選択した図形がありません。');
    }
    return svgModule().exportPage(page, options);
  }
  function checkedRasterSize(size, scale) {
    var width = Math.ceil(size.width * scale), height = Math.ceil(size.height * scale);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw error('PNGの寸法が正しくありません。');
    if (width > MAX_AXIS || height > MAX_AXIS) throw error('PNGの最大寸法（1辺16384px）を超えています。縮小倍率を指定してください。');
    if (width * height > MAX_PIXELS) throw error('PNGの画素数が多すぎます（最大約3200万画素）。縮小倍率を指定してください。');
    return { width: width, height: height };
  }
  function imageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob), image = new Image();
      var finish = function (fn, value) { URL.revokeObjectURL(url); image.onload = image.onerror = null; fn(value); };
      image.onload = function () { finish(resolve, image); };
      image.onerror = function () { finish(reject, error('SVGを画像として読み込めません。')); };
      image.src = url;
    });
  }
  function canvasBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(error('PNGを作成できません。')); }, 'image/png');
    });
  }
  async function png(page, options) {
    options = options || {};
    if (options.selectionIds != null) {
      if (!Array.isArray(options.selectionIds) || !options.selectionIds.length) throw error('選択した図形がありません。');
      var selectionSet = new Set(options.selectionIds);
      if (!page || !Array.isArray(page.objects) || !page.objects.some(function (o) { return selectionSet.has(o.id); })) throw error('選択した図形がありません。');
    }
    if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') throw error('PNG出力にはブラウザが必要です。');
    var scale = options.scale === undefined ? 1 : finite(options.scale, NaN);
    if (!(scale > 0) || !Number.isFinite(scale)) throw error('倍率は0より大きい数値で指定してください。');
    if (options.background !== undefined && options.background !== 'transparent' && options.background !== 'white') throw error('背景はtransparentまたはwhiteを指定してください。');
    var svg = selectedPage(page, options), size = checkedRasterSize(svgSize(svg), scale), image = await imageFromBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    var canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
    var context = canvas.getContext('2d'); if (!context) throw error('PNG用のCanvasを利用できません。');
    if ((options.background || 'transparent') === 'white') { context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height); }
    context.drawImage(image, 0, 0, size.width, size.height);
    return canvasBlob(canvas);
  }
  function exportEntry(entry, padding) {
    if (!entry || typeof entry !== 'object') throw error('印刷ページはPageまたは{page}で指定してください。');
    var page = entry.page && entry.page.board ? entry.page : entry;
    if (!page.board || !Array.isArray(page.objects)) throw error('印刷ページが正しくありません。');
    var selectionIds = entry.page && entry.page.board ? entry.selectionIds : undefined;
    return { svg: selectedPage(page, { padding: padding, selectionIds: selectionIds }) };
  }
  function paperSize(size) { return [size.width / PX_PER_MM, size.height / PX_PER_MM]; }
  function htmlEscape(value) { return String(value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function buildPrintHTML(pages, options) {
    options = options || {};
    if (!Array.isArray(pages) || !pages.length) throw error('印刷するページがありません。');
    var padding = options.padding === undefined ? 0 : finite(options.padding, NaN);
    if (!Number.isFinite(padding) || padding < 0) throw error('余白は0以上の数値で指定してください。');
    var entries = pages.map(function (entry) { var out = exportEntry(entry, padding); var size = svgSize(out.svg); return { svg: out.svg, paper: paperSize(size) }; });
    var rules = entries.map(function (entry, index) { return '@page ilapo-' + index + '{size:' + entry.paper[0] + 'mm ' + entry.paper[1] + 'mm;margin:0;}'; }).join('');
    var body = entries.map(function (entry, index) { return '<section class="ilapo-print-page" style="page:ilapo-' + index + ';width:' + entry.paper[0] + 'mm;height:' + entry.paper[1] + 'mm">' + entry.svg + '</section>'; }).join('');
    var title = htmlEscape(options.title === undefined ? 'イラストスライド印刷' : options.title);
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title><style>' + rules + 'html,body{margin:0;padding:0;background:#fff;}body{font-size:18px;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.ilapo-print-page{margin:0;padding:0;background:#fff;break-after:page;page-break-after:always;overflow:hidden;}.ilapo-print-page+.ilapo-print-page{break-before:page;page-break-before:always;}.ilapo-print-page:last-child{break-after:auto;page-break-after:auto;}.ilapo-print-page>svg{display:block;width:100%;height:100%;background:#fff;}</style></head><body>' + body + '</body></html>';
  }
  function waitForFrame(frame) {
    return new Promise(function (resolve, reject) {
      var done = false, timer = setTimeout(function () { if (!done) { done = true; reject(error('印刷用ページの読み込みがタイムアウトしました。')); } }, 10000);
      function finish(fn, value) { if (done) return; done = true; clearTimeout(timer); fn(value); }
      frame.addEventListener('load', async function () { try { var doc = frame.contentDocument; if (doc && doc.fonts && doc.fonts.ready) await doc.fonts.ready; var images = Array.from((doc && doc.images) || []); await Promise.all(images.filter(function (image) { return !image.complete; }).map(function (image) { return new Promise(function (r) { image.addEventListener('load', r, { once: true }); image.addEventListener('error', r, { once: true }); }); })); await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); finish(resolve); } catch (e) { finish(reject, e); } }, { once: true });
    });
  }
  var pendingFrames = [];
  function cleanPendingFrames() { pendingFrames.splice(0).forEach(function (frame) { if (frame && frame.parentNode) frame.remove(); }); }
  async function print(pages, options) {
    if (typeof document === 'undefined' || !document.body) throw error('印刷にはブラウザが必要です。');
    cleanPendingFrames();
    var opener = document.activeElement, frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1; frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;visibility:hidden;';
    var html = buildPrintHTML(pages, options); document.body.appendChild(frame);
    var ready = waitForFrame(frame); frame.srcdoc = html;
    try { await ready; } catch (e) { frame.remove(); throw e; }
    await new Promise(function (resolve, reject) {
      var finished = false;
      pendingFrames.push(frame);
      function clean() { if (finished) return; finished = true; pendingFrames = pendingFrames.filter(function (item) { return item !== frame; }); frame.remove(); if (opener && typeof opener.focus === 'function') opener.focus(); resolve(); }
      frame.contentWindow.addEventListener('afterprint', clean, { once: true });
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { pendingFrames = pendingFrames.filter(function (item) { return item !== frame; }); frame.remove(); if (opener && typeof opener.focus === 'function') opener.focus(); reject(e); }
    });
  }
  return { png: png, buildPrintHTML: buildPrintHTML, print: print, MAX_AXIS: MAX_AXIS, MAX_PIXELS: MAX_PIXELS };
}));
