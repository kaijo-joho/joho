#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '..');
const sourceOtfRoot = process.env.ILAPO_OUTLINE_OTF_DIR ? path.resolve(process.env.ILAPO_OUTLINE_OTF_DIR) : null;
const style = { fill: '#123456', stroke: '#654321', strokeWidth: 2, opacity: .75, dash: '3 2', linecap: 'round', linejoin: 'bevel', fontSize: 32, fontFamily: 'sans-serif', bold: true, italic: true };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  let file = path.resolve(root, '.' + pathname);
  if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html>'); return; }
  if (pathname.startsWith('/__source-otf__/')) {
    file = sourceOtfRoot && path.resolve(sourceOtfRoot, '.' + pathname.slice('/__source-otf__'.length));
    if (!file || !file.startsWith(sourceOtfRoot + path.sep)) { response.writeHead(404); response.end(); return; }
  }
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(file).pipe(response);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); await page.goto(base);
    for (const file of ['vendor/opentype-1.3.4.min.js', 'vendor/paper-core-0.12.18.min.js', 'core.js', 'geometry.js', 'text-layout.js', 'connectors.js', 'text-outline.js']) await page.addScriptTag({ url: base + file });
    const report = await page.evaluate(async () => {
      const style = { fill: '#123456', stroke: '#654321', strokeWidth: 2, opacity: .75, dash: '3 2', linecap: 'round', linejoin: 'bevel', fontSize: 32, fontFamily: 'sans-serif', bold: true, italic: true };
      const direct = { id: 'direct', type: 'text', name: '本文', group: 'g', locked: false, matrix: [0, 1, -1, 0, 300, 80], x: 20, y: 50, runs: [{ text: '日本語 A', script: 'normal' }, { text: '2', script: 'super' }, { text: '\nB', script: 'sub' }], style, layout: { width: 180, align: 'center' } };
      let unprepared = ''; try { IlapoTextOutline.convert(direct, { fontId: 'sans' }); } catch (error) { unprepared = String(error.message); }
      await Promise.all([IlapoTextOutline.prepare('sans'), IlapoTextOutline.prepare('serif')]);
      const before = JSON.stringify(direct), sans = IlapoTextOutline.convert(direct, { fontId: 'sans' }), serif = IlapoTextOutline.convert({ ...direct, style: { ...style, bold: false, italic: false, fontFamily: 'serif' }, layout: { width: null, align: 'right' } }, { fontId: 'serif' });
      const rich = IlapoTextOutline.convert({ ...direct, runs: [{ text: '赤', script: 'normal', bold: false, fill: '#ff0000' }, { text: '青', script: 'normal', italic: true, fill: '#0000ff' }] }, { fontId: 'sans' });
      const shape = { id: 'box', type: 'path', name: '箱', group: null, locked: false, d: 'M0 0H240V80H0Z', matrix: [1, 0, 0, 1, 0, 0], style, label: { runs: [{ text: '図形内 日本語', script: 'normal' }], style, align: 'center', padding: 8 } };
      const shapeOutline = IlapoTextOutline.convert(shape, { fontId: 'sans' });
      const connector = IlapoConnectors.make({ x: 0, y: 0 }, { x: 200, y: 0 }, { id: 'edge', label: '接続 日本語', style });
      const connectorOutline = IlapoTextOutline.convert(connector, { fontId: 'sans', page: { objects: [connector] } });
      let missing = '', empty = ''; try { IlapoTextOutline.convert({ ...direct, runs: [{ text: '😀', script: 'normal' }] }, { fontId: 'sans' }); } catch (error) { missing = String(error.message); }
      try { IlapoTextOutline.convert({ ...direct, runs: [{ text: '   \n', script: 'normal' }] }, { fontId: 'sans' }); } catch (error) { empty = String(error.message); }
      const woff = opentype.parse(await (await fetch('fonts/NotoSansJP-Regular.woff')).arrayBuffer());
      const probe = '日本語Ab2';
      let otf = null; const sourceResponse = await fetch('__source-otf__/NotoSansJP-Regular.otf'); if (sourceResponse.ok) otf = opentype.parse(await sourceResponse.arrayBuffer());
      const woffGlyphs = woff.stringToGlyphs(probe).map(glyph => glyph.index), otfGlyphs = otf && otf.stringToGlyphs(probe).map(glyph => glyph.index);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), node = document.createElementNS(svg.namespaceURI, 'path'); node.setAttribute('d', sans.objects[0].d); svg.append(node); document.body.append(svg); const box = node.getBBox(); svg.remove();
      return { fonts: IlapoTextOutline.fonts(), before: before === JSON.stringify(direct), unprepared, validated: !!IlapoCore.validateObject(sans.objects[0]), sans, serif, rich, shapeOutline, connectorOutline, missing, empty, woffGlyphs, otfGlyphs, woffAdvance: woff.getAdvanceWidth(probe, 32), otfAdvance: otf && otf.getAdvanceWidth(probe, 32), box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    });
    assert.deepEqual(report.fonts.map(font => font.id), ['sans', 'serif']);
    assert.equal(report.before, true, 'conversion never mutates its source text'); assert.match(report.unprepared, /読み込んでから/); assert.equal(report.validated, true, 'compound outline is a normal validated path');
    for (const result of [report.sans, report.serif, report.shapeOutline, report.connectorOutline]) {
      assert.equal(result.objects.length, 1); assert.match(result.objects[0].d, /^M/); assert.ok(result.objects[0].d.length > 100); assert.ok(result.objects[0].d.length <= 90000); assert.doesNotMatch(result.objects[0].d, /NaN|undefined/);
    }
    assert.deepEqual(report.sans.objects[0].matrix, [0, 1, -1, 0, 300, 80]);
    assert.deepEqual(report.sans.objects[0].style, style);
    assert.equal(report.rich.objects.length,2,'部分書式は別々の編集可能な輪郭へ変換する');
    assert.deepEqual(report.rich.objects.map(object=>({fill:object.style.fill,bold:object.style.bold,italic:object.style.italic})),[{fill:'#ff0000',bold:false,italic:true},{fill:'#0000ff',bold:true,italic:true}]);
    assert.equal(report.shapeOutline.sourceKind, 'shape-label'); assert.equal(report.connectorOutline.sourceKind, 'connector-label');
    assert.match(report.missing, /フォントにありません/); assert.match(report.empty, /可視の文字/);
    assert.ok(report.woffGlyphs.every(index => index > 0), 'WOFF1 parses every required glyph'); assert.ok(report.woffAdvance > 0, 'WOFF1 preserves usable advance widths');
    if (report.otfGlyphs) { assert.deepEqual(report.woffGlyphs, report.otfGlyphs, 'WOFF1 preserves glyph mapping'); assert.ok(Math.abs(report.woffAdvance - report.otfAdvance) < .0001, 'WOFF1 preserves advance widths'); }
    assert.ok(report.box.width > 0 && report.box.height > 0, 'compound outline renders: ' + JSON.stringify(report.box));
    console.log('text-outline.test.cjs: passed');
  } finally { await browser.close(); server.close(); }
})().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
