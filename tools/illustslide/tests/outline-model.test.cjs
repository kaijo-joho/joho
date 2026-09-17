#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html>'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); await page.goto('http://127.0.0.1:' + server.address().port + '/');
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'vendor/opentype-1.3.4.min.js', 'core.js', 'geometry.js', 'text-layout.js', 'connectors.js', 'path-edit.js', 'svg.js', 'animation.js', 'stroke-outline.js', 'text-outline.js', 'outline.js']) await page.addScriptTag({ url: file });
    const report = await page.evaluate(async () => {
      const C = IlapoCore, O = IlapoOutline, S = IlapoSVG, K = IlapoConnectors, A = IlapoAnimation;
      const ok = (value, message) => { if (!value) throw Error(message); };
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const style = { ...C.DEFAULT_STYLE, fill: '#9cc6f5', stroke: '#253858', strokeWidth: 8 };
      const makePage = objects => ({ ...C.createPage(), board: { width: 500, height: 250, unit: 'px', infinite: false }, objects });
      const rect = C.makeShape('rect', 30, 30, 120, 80, style); rect.id = 'shape'; rect.group = 'group';
      const marker = C.makeShape('ellipse', 240, 60, 35, 35, style); marker.id = 'marker'; marker.group = 'group';
      const separate = C.makeShape('line', 10, 180, 180, 0, style); separate.id = 'separate';
      const connector = K.make({ objectId: rect.id, port: 'left', ratio: .25, x: 30, y: 50 }, { x: 4, y: 190 }, { id: 'edge', style });
      let input = makePage([rect, separate, marker, connector]); K.sync(input);
      input.animations = [
        { id: 'fade', effect: 'fade', targets: ['shape'], mode: 'in', trigger: 'click', duration: 300, delay: 40 },
        { id: 'color', effect: 'color', targets: ['shape', 'separate'], channel: 'stroke', color: '#ff0000', trigger: 'after', duration: 200, delay: 20 },
        { id: 'move', effect: 'move', targets: ['shape'], dx: 20, dy: -8, trigger: 'after', duration: 100, delay: 60 },
        { id: 'wipe', effect: 'wipe', targets: ['shape'], mode: 'out', direction: 'right', trigger: 'with', duration: 180, delay: 0 }
      ];
      const source = C.clone(input), result = O.convertPage(input, ['shape'], { lines: true, text: false });
      ok(same(input, source), 'model conversion must not mutate input');
      ok(result.converted === 2, 'group selection expands to both shapes');
      const pieces = result.page.objects.filter(o => result.ids.includes(o.id));
      ok(pieces.length === 4 && pieces.every(o => o.type === 'path' && o.group === 'group'), 'fill and stroke stay grouped');
      ok(result.page.objects[0].id === 'shape' && result.page.objects[2].id === 'separate', 'IDs and z-order preserved');
      ok(same(result.page.objects.find(o => o.id === 'separate'), separate), 'unselected object unchanged');
      const edge = result.page.objects.find(o => o.id === 'edge');
      ok(edge.from.objectId === 'shape' && Math.abs(edge.from.x - connector.from.x) < 1e-6 && Math.abs(edge.from.y - connector.from.y) < 1e-6, 'incoming manual connection retained');
      const shapeParts = result.page.objects.slice(0, 2);
      const plan = A.compile(source), nextPlan = A.compile(result.page);
      for (const id of ['fade', 'color', 'move', 'wipe']) {
        const before = plan.groups.flatMap(g => g.items).find(i => i.animation.id === id), after = nextPlan.groups.flatMap(g => g.items).find(i => i.animation.id === id);
        ok(before.start === after.start && before.end === after.end, id + ' retains timing after color channel partition');
      }
      const colored = A.frame(result.page, 1, Infinity);
      ok(colored.page.objects.find(o => o.id === shapeParts[1].id).style.fill.toLowerCase() === '#ff0000', 'stroke animation maps to outline fill');
      ok(colored.page.objects.find(o => o.id === 'separate').style.stroke.toLowerCase() === '#ff0000', 'unconverted stroke animation remains stroke');
      ok(result.page.animations.find(a => a.id === 'wipe').targets.length === 2, 'wipe shares one clipping boundary across pieces');
      for (const part of shapeParts) ok(A.frame(result.page, 1, 190).visuals[part.id].opacity === .5, 'fade affects both pieces');
      const doc = C.validateDocument({ format: 'kaijo-ilapo', version: 4, id: 'outline', name: '輪郭', pages: [source] });
      const history = new C.History(doc); history.change(d => { d.pages[0] = result.page; });
      const convertedDoc = C.clone(history.document);
      history.undo(); ok(same(history.document, doc) && !history.canUndo, 'entire operation is one Undo');
      history.redo(); ok(same(history.document, convertedDoc), 'Redo restores all paths and effects');
      const round = S.decodeProject(S.encodeProject(convertedDoc)); ok(same(round, convertedDoc), 'ZIP round-trips outlined paths, group and animation');
      const ordinary = S.importSVG(S.exportPage(result.page)).page;
      ok(ordinary.objects.length >= result.page.objects.length, 'ordinary SVG imports outlined artwork');
      const anchors = IlapoPathEdit.inspect(shapeParts[1]); ok(anchors.length && anchors.every(p => p.closed), 'stroke contours support direct selection');
      const cut = IlapoGeometry.boolean(shapeParts[1], C.makeShape('rect', 0, 0, 80, 150, style), 'subtract'); C.validateObject(cut); ok(cut.d !== shapeParts[1].d, 'outline can be subtracted like a normal path');
      let locked = false; try { O.convertPage(makePage([{ ...rect, locked: true }]), ['shape'], { lines: true }); } catch (e) { if (!/固定/.test(e.message)) throw e; locked = true; } ok(locked, 'locked shapes reject conversion');
      let noContour = false; try { O.convertPage(makePage([{ ...rect, d: 'M20 20', style: { ...style, fill: 'none', linecap: 'butt' } }]), ['shape'], { lines: true }); } catch (e) { noContour = /輪郭がありません/.test(e.message); } ok(noContour, 'an invisible zero-length stroke cannot claim successful conversion');
      const image = { id: 'image', type: 'image', name: '下絵', group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0], style, x: 0, y: 0, width: 20, height: 20, src: 'data:image/png;base64,iVBORw0KGgo=', reference: false };
      const imageResult = O.convertPage(makePage([rect, image]), ['shape', 'image'], { lines: true }); ok(same(imageResult.page.objects.find(o => o.id === 'image'), C.validateObject(image)), 'image is retained');
      await IlapoTextOutline.prepare('sans');
      let tooLong = false; try { IlapoTextOutline.convert(C.makeText(0, 0, 'A'.repeat(2001), style), { fontId: 'sans' }); } catch (e) { tooLong = /文字数/.test(e.message); } ok(tooLong, 'overlong text is rejected before glyph layout');
      const label = { runs: [{ text: '図 H', script: 'normal' }, { text: '2', script: 'sub' }], style: { ...style, stroke: 'none', fill: '#102030', fontSize: 20 }, align: 'center', padding: 4 };
      const labeled = { ...rect, group: null, label }, text = C.makeText(210, 90, '日本語', { ...style, stroke: 'none', fontSize: 22 }); text.id = 'text';
      const textPage = makePage([labeled, text, K.make({ x: 10, y: 190 }, { x: 220, y: 190 }, { id: 'label-edge', style, label: '接続' })]);
      const textResult = O.convertPage(textPage, textPage.objects.map(o => o.id), { lines: true, text: true, fontId: 'sans' });
      ok(textResult.page.objects.every(o => o.type === 'path' && !o.label && o.style.stroke === 'none'), 'text, label, connector and strokes become ordinary filled paths');
      ok(textResult.warnings.some(s => /追従/.test(s)), 'connector detachment explained');
      ok(!/<text\b/.test(S.exportPage(textResult.page)), 'outlined SVG has no font dependency');
      ok(textPage.objects[0].label === label, 'source label remains editable');
      const labelOnly = O.convertPage(makePage([labeled]), ['shape'], { text: true, lines: false, fontId: 'sans' });
      ok(labelOnly.page.objects.length === 2 && labelOnly.page.objects[0].style.stroke === style.stroke, 'text-only retains shape stroke');
      const lineOnly = O.convertPage(makePage([labeled]), ['shape'], { lines: true, text: false });
      ok(lineOnly.page.objects.some(o => o.type === 'text'), 'line-only retains editable label text');
      const bad = { ...text, runs: [{ text: '😀', script: 'normal' }] }, mixed = makePage([rect, bad]), beforeBad = JSON.stringify(mixed);
      let missing = false; try { O.convertPage(mixed, ['shape', 'text'], { lines: true, text: true, fontId: 'sans' }); } catch (e) { missing = /フォント/.test(e.message); }
      ok(missing && beforeBad === JSON.stringify(mixed), 'one missing glyph rejects entire batch without partial edits');
      const raster = async body => {
        const image = new Image(), url = URL.createObjectURL(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="250">${body}</svg>`], { type: 'image/svg+xml' }));
        try { await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; }); const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 250; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, 500, 250).data; } finally { URL.revokeObjectURL(url); }
      };
      const compare = async (before, after) => {
        const [a, b] = await Promise.all([raster(before), raster(after)]); let difference = 0, coverage = 0;
        for (let i = 0; i < a.length; i += 4) { coverage += a[i + 3] * 4; for (let k = 0; k < 4; k++) difference += Math.abs(a[i + k] * a[i + 3] / 255 - b[i + k] * b[i + 3] / 255); }
        return difference / Math.max(1, coverage);
      };
      const alpha = { ...rect, group: null, style: { ...style, opacity: .45 }, matrix: [1.4, .2, -.2, .9, 40, 20] };
      const alphaResult = O.convertPage(makePage([alpha]), ['shape'], { lines: true });
      const alphaDifference = await compare(S.objectMarkup(alpha), alphaResult.page.objects.map(o => S.objectMarkup(o)).join(''));
      ok(alphaDifference < .015, 'translucent fill/stroke retains appearance: ' + alphaDifference);
      const splitAlpha = { ...rect, group: null, style: { ...style, opacity: 1, fillOpacity: .35, strokeOpacity: .6 }, matrix: [1.4, .2, -.2, .9, 40, 20] };
      const splitAlphaResult = O.convertPage(makePage([splitAlpha]), ['shape'], { lines: true });
      const splitAlphaDifference = await compare(S.objectMarkup(splitAlpha), splitAlphaResult.page.objects.map(o => S.objectMarkup(o)).join(''));
      ok(splitAlphaDifference < .015, 'separate fill/stroke alpha remains visible through the outlined stroke: ' + splitAlphaDifference);
      ok(splitAlphaResult.page.objects.some(o => o.style.fillOpacity === .6 && o.style.stroke === 'none'), 'stroke alpha maps to the outlined fill');
      const combinedAlpha = { ...splitAlpha, style: { ...splitAlpha.style, opacity: .45 } };
      const combinedAlphaResult = O.convertPage(makePage([combinedAlpha]), ['shape'], { lines: true });
      ok(combinedAlphaResult.warnings.some(s => /半透明の線/.test(s)), 'combined global and stroke opacity reports the possible compositing change');
      const outlinedText = { ...text, style: { ...style, fontSize: 44, opacity: .65, strokeWidth: 1.6, fill: '#ff9955' }, runs: [{ text: 'A', script: 'normal' }], matrix: [1.6, .2, .1, .6, -120, 40] };
      const glyph = IlapoTextOutline.convert(outlinedText, { fontId: 'sans' }).objects[0];
      const glyphResult = O.convertPage(makePage([outlinedText]), ['text'], { text: true, lines: false, fontId: 'sans' });
      const glyphDifference = await compare(`<path d="${glyph.d}" transform="matrix(${glyph.matrix})" fill="${glyph.style.fill}" stroke="${glyph.style.stroke}" stroke-width="${glyph.style.strokeWidth}" opacity="${glyph.style.opacity}"/>`, glyphResult.page.objects.map(o => S.objectMarkup(o)).join(''));
      ok(glyphDifference < .03, 'text stroke keeps its original transform: ' + glyphDifference);
      return { converted: result.converted, textPaths: textResult.page.objects.length, alphaDifference, splitAlphaDifference, glyphDifference };
    });
    assert.equal(report.converted, 2);
    console.log('outline-model.test.cjs: passed ' + JSON.stringify(report));
  } finally { await browser.close(); server.close(); }
})().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
