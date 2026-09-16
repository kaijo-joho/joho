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
  try {
    const page = await browser.newPage();
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'core.js', 'geometry.js', 'text-layout.js', 'svg.js']) await page.addScriptTag({ path: path.join(root, file) });
    const report = await page.evaluate(() => {
      const C = IlapoCore, S = IlapoSVG, style = { ...C.DEFAULT_STYLE, fontSize: 20, fill: '#123456', stroke: 'none' };
      const text = {
        id: 'wrapped', type: 'text', name: '折返し', group: null, locked: false, matrix: [1, 0, 0, 1, 11, 13], style,
        x: 20, y: 50, runs: [{ text: '日本語 H', script: 'normal' }, { text: '2', script: 'super' }, { text: '\n空行\n', script: 'normal' }, { text: 'x', script: 'sub' }],
        layout: { width: 75, align: 'center' }
      };
      const shape = {
        id: 'shape', type: 'path', name: '説明', group: null, locked: false, matrix: [1.2, 0, 0, .8, 5, 7], style: { ...style, fill: '#eeeeee', stroke: '#000000', strokeWidth: 2 }, d: 'M0 0H180V90H0Z',
        label: { runs: [{ text: '図の', script: 'normal' }, { text: '2', script: 'super' }, { text: '\n説明', script: 'sub' }], style, align: 'right', padding: 8 }
      };
      const doc = C.validateDocument({ format: 'kaijo-ilapo', version: 4, id: 'text-svg', name: '文字', pages: [{ id: 'page', name: '1', board: { width: 240, height: 140, unit: 'px', infinite: false }, objects: [text, shape] }] });
      const zip = S.encodeProject(doc), round = S.decodeProject(zip), ordinary = S.exportPage(doc.pages[0]), imported = S.importSVG(ordinary).page;
      const matrices = [[Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, 80, 22], [1.8, 0, 0, .45, 100, 16], [-1, 0, 0, 1, 190, 30], [1, .35, .2, 1, 25, 62]];
      const transformed = C.validateDocument({ format: 'kaijo-ilapo', version: 4, id: 'transforms', name: '変形', pages: [{ id: 'transforms-page', name: '変形', board: { width: 320, height: 180, unit: 'px', infinite: false }, objects: matrices.map((matrix, index) => ({
        id: 'transformed-' + index, type: 'path', name: '変形', group: null, locked: false, matrix, style: shape.style, d: 'M0 0H45V22H0Z',
        label: { runs: [{ text: 'L', script: 'normal' }, { text: String(index + 1), script: 'super' }], style, align: 'center', padding: 3 }
      })) }] });
      function matrixAttr(value) { const match = (value || '').match(/^matrix\(([^)]+)\)$/); return match ? match[1].trim().split(/[ ,]+/).map(Number) : [1, 0, 0, 1, 0, 0]; }
      function derivedMarkup(markup, id) {
        const xml = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + markup + '</svg>', 'image/svg+xml'), node = xml.querySelector('[data-ilapo-shape-label="' + id + '"] text');
        return { matrix: matrixAttr(node.getAttribute('transform')), lines: Array.from(node.children).filter(child => child.localName === 'tspan').map(line => ({ x: Number(line.getAttribute('x')), y: Number(line.getAttribute('y')), text: line.textContent })) };
      }
      const expectedTransforms = transformed.pages[0].objects.map(path => { const label = IlapoTextLayout.shapeText(path), lines = IlapoTextLayout.layout(label).lines; return { matrix: label.matrix, lines: lines.map(line => ({ x: line.x, y: line.y, text: line.runs.map(run => run.text).join('') })) }; });
      const screenTransforms = transformed.pages[0].objects.map(path => derivedMarkup(S.objectMarkup(path), path.id));
      const ordinaryTransforms = (() => { const source = S.exportPage(transformed.pages[0]), xml = new DOMParser().parseFromString(source, 'image/svg+xml'); return transformed.pages[0].objects.map(path => { const node = xml.querySelector('[data-ilapo-shape-label="' + path.id + '"] text'); return { matrix: matrixAttr(node.getAttribute('transform')), lines: Array.from(node.children).filter(child => child.localName === 'tspan').map(line => ({ x: Number(line.getAttribute('x')), y: Number(line.getAttribute('y')), text: line.textContent })) }; }); })();
      const transformedRound = S.decodeProject(S.encodeProject(transformed));
      function mutate(change) { const files = fflate.unzipSync(zip), manifest = JSON.parse(fflate.strFromU8(files['manifest.json'])); change(manifest, files); files['manifest.json'] = fflate.strToU8(JSON.stringify(manifest)); return fflate.zipSync(files); }
      function rejected(change) { try { S.decodeProject(mutate(change)); return false; } catch (_) { return true; } }
      let unsafeTspan = false;
      try { S.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10"><tspan x="0" y="10" dy="2">x</tspan></text></svg>'); } catch (_) { unsafeTspan = true; }
      let nestedPosition = false;
      try { S.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10"><tspan x="0" y="20">a<tspan x="90" y="50">b</tspan></tspan></text></svg>'); } catch (_) { nestedPosition = true; }
      return {
        doc, round, ordinary, imported, transformed, transformedRound, expectedTransforms, screenTransforms, ordinaryTransforms,
        unsafeTspan, nestedPosition,
        extraText: rejected(m => { m.pages[0].objects.wrapped.text.extra = true; }),
        missingLabel: rejected((m, files) => { const file = m.pages[0].file, source = fflate.strFromU8(files[file]).replace(/ data-ilapo-shape-label-text="shape"/g, ''); files[file] = fflate.strToU8(source); }),
        old: S.decodeProject(S.encodeProject(C.validateDocument({ format: 'kaijo-ilapo', version: 1, id: 'old', name: 'old', pages: [C.createPage()] })))
      };
    });
    assert.deepEqual(report.round, report.doc, 'v4 ZIP restores authored runs, layout and path labels exactly');
    assert.match(report.ordinary, /<tspan x="[^"]+" y="[^"]+">/, 'wrapped text writes explicit portable baselines');
    assert.match(report.ordinary, /data-ilapo-shape-label="shape"/, 'path and derived label share an SVG group');
    assert.doesNotMatch(report.ordinary, /data-ilapo-id="shape-label"/, 'derived label ID cannot collide with a document object ID');
    assert.equal(report.imported.objects.filter(o => o.type === 'path').length, 1);
    assert.ok(report.imported.objects.filter(o => o.type === 'text').length >= 3, 'ordinary SVG keeps every visible wrapped and label line as editable text');
    assert.deepEqual(report.screenTransforms, report.expectedTransforms, 'screen SVG markup retains each source-derived label matrix and line baselines');
    assert.deepEqual(report.ordinaryTransforms, report.expectedTransforms, 'ordinary SVG retains label matrices and line baselines through path flattening');
    assert.deepEqual(report.transformedRound, report.transformed, 'native ZIP preserves rotation, non-uniform resize, reflection and shear source paths');
    assert(report.unsafeTspan && report.nestedPosition && report.extraText && report.missingLabel, 'unsupported positional SVG and malformed v4 metadata are rejected');
    assert.equal(report.old.version, 1, 'legacy ZIP stays readable');
    console.log('text-svg.test.cjs: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
