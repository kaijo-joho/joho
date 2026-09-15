#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  try {
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'core.js', 'geometry.js', 'connectors.js', 'svg.js']) await page.addScriptTag({ path: path.join(root, file) });
    const report = await page.evaluate(() => {
      const C = IlapoCore, S = IlapoSVG, K = IlapoConnectors;
      const style = { fill: '#123456', stroke: '#654321', strokeWidth: 2, opacity: .8, dash: '', linecap: 'round', linejoin: 'round', fontSize: 20, fontFamily: 'sans-serif', bold: false, italic: false };
      const p = C.createPage('アニメーション', { width: 360, height: 180, unit: 'px', infinite: false }); p.id = '__proto__';
      const shape = C.makeShape('rect', 10, 20, 70, 40, style); shape.id = '__proto__';
      const text = C.makeText(120, 55, '文字', style); text.id = 'constructor';
      const image = { id: 'image', type: 'image', name: '画像', group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0], style, x: 220, y: 20, width: 20, height: 20, src: 'data:image/png;base64,iVBORw0KGgo=', reference: false };
      const connector = K.make({ x: 0, y: 0, objectId: shape.id, port: 'right' }, { x: 0, y: 0, objectId: text.id, port: 'left' }, { id: 'connector', style: { fill: 'none', stroke: '#00aa00', strokeWidth: 2 } });
      p.objects.push(shape, text, image, connector); K.sync(p);
      p.animations = [
        { id: 'fade', targets: ['__proto__'], effect: 'fade', mode: 'in', trigger: 'click', duration: 120, delay: 0 },
        { id: 'wipe', targets: ['constructor'], effect: 'wipe', mode: 'out', direction: 'left', trigger: 'with', duration: 130, delay: 5 },
        { id: 'color', targets: ['connector'], effect: 'color', channel: 'stroke', color: '#abcdef', trigger: 'after', duration: 140, delay: 10 },
        { id: 'move', targets: ['image'], effect: 'move', dx: 8, dy: -4, trigger: 'with', duration: 150, delay: 15 }
      ];
      const doc = C.validateDocument({ format: 'kaijo-ilapo', version: 3, id: 'constructor', name: 'ZIP', pages: [p] });
      const bytes = S.encodeProject(doc), decoded = S.decodeProject(bytes), ordinary = S.exportPage(doc.pages[0]), portable = S.importSVG(ordinary).page;
      function mutated(change) { const files = fflate.unzipSync(bytes), manifest = JSON.parse(fflate.strFromU8(files['manifest.json'])); change(manifest); files['manifest.json'] = fflate.strToU8(JSON.stringify(manifest)); return fflate.zipSync(files); }
      function rejected(change) { try { S.decodeProject(mutated(change)); return false; } catch (_) { return JSON.stringify(S.decodeProject(bytes)) === JSON.stringify(decoded); } }
      const v1 = C.validateDocument({ format: 'kaijo-ilapo', version: 1, id: 'v1', name: '', pages: [C.createPage()] });
      const v2Page = C.createPage(); const v2Shape = C.makeShape('ellipse', 1, 2, 10, 10); v2Page.objects.push(v2Shape); const v2 = C.validateDocument({ format: 'kaijo-ilapo', version: 2, id: 'v2', name: '', pages: [v2Page] });
      const history = new C.History(doc);
      history.change(d => C.duplicateObjects(d.pages[0], ['__proto__'])); const copiedEffects = history.document.pages[0].animations.length;
      history.undo(); const objectUndo = history.document.pages[0].animations.length === 4;
      history.change(d => C.duplicatePage(d, d.pages[0].id)); const pageCopy = history.document.pages[1]; const pageCopied = pageCopy.animations.length === 4 && pageCopy.animations.every(a => !doc.pages[0].animations.some(source => source.id === a.id));
      history.undo(); const pageUndo = history.document.pages.length === 1 && history.document.pages[0].animations.length === 4;
      return {
        doc, decoded, ordinary, portable, v1: S.decodeProject(S.encodeProject(v1)).version, v2: S.decodeProject(S.encodeProject(v2)).version,
        rejectedUnknown: rejected(m => { m.pages[0].animations[0].extra = true; }),
        rejectedMissing: rejected(m => { m.pages[0].animations[0].targets = ['missing']; }),
        rejectedVersion: rejected(m => { m.version = 99; }), copiedEffects, objectUndo, pageCopied, pageUndo
      };
    });
    assert.deepEqual(report.decoded, report.doc, 'v3 native ZIP round-trips all object and animation semantics exactly');
    assert.equal(report.decoded.pages[0].objects.map(o => o.id).join(','), '__proto__,constructor,image,connector');
    assert.equal(report.decoded.pages[0].animations.length, 4);
    assert(!/animation/i.test(report.ordinary), 'ordinary SVG contains artwork only, without animation metadata');
    assert.match(report.ordinary, /#123456/);
    assert.equal(report.portable.objects.some(o => o.type === 'connector'), false, 'ordinary SVG flattens connector artwork');
    assert.equal(report.v1, 1); assert.equal(report.v2, 2);
    assert(report.rejectedUnknown && report.rejectedMissing && report.rejectedVersion, 'malformed ZIP metadata is rejected without corrupting a valid decode');
    assert.equal(report.copiedEffects, 5); assert(report.objectUndo && report.pageCopied && report.pageUndo, 'object/page copy and undo restore effects');
    console.log('animation-zip.test.cjs: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
