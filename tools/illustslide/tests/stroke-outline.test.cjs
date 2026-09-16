#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 220 } });
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'core.js', 'geometry.js', 'path-edit.js', 'stroke-outline.js']) {
      await page.addScriptTag({ path: path.join(root, file) });
    }
    const report = await page.evaluate(async () => {
      const C = IlapoCore, G = IlapoGeometry, P = IlapoPathEdit, O = IlapoStrokeOutline;
      const style = extra => ({ ...C.DEFAULT_STYLE, fill: 'none', stroke: '#000000', strokeWidth: 12, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', ...extra });
      const make = (id, d, extra, matrix = [1, 0, 0, 1, 0, 0]) => ({ id, type: 'path', name: id, group: null, locked: false, matrix, style: style(extra), d });
      const raster = async (body, scale = 1) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${240 * scale}" height="${160 * scale}" viewBox="0 0 240 160">${body}</svg>`;
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
          const image = new Image();
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
          const canvas = document.createElement('canvas'); canvas.width = 240 * scale; canvas.height = 160 * scale;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        } finally { URL.revokeObjectURL(url); }
      };
      const compare = async (object, scale = 1) => {
        const before = JSON.stringify(object), flat = G.flattenedPath(object);
        let outlined; try { outlined = O.path(object); } catch (error) { throw new Error(object.id + ': ' + error.message); }
        if (!outlined) return { id: object.id, outlined: null, unchanged: before === JSON.stringify(object), ratio: 0, outputLength: 0, anchors: 0 };
        const source = await raster(`<path d="${flat.d}" fill="none" stroke="#000" stroke-width="${object.style.strokeWidth}" stroke-dasharray="${object.style.dash}" stroke-linecap="${object.style.linecap}" stroke-linejoin="${object.style.linejoin}" stroke-miterlimit="4"/>`, scale);
        const target = await raster(`<path d="${outlined}" fill="#000" fill-rule="nonzero"/>`, scale);
        let expected = 0, actual = 0, difference = 0;
        for (let i = 3; i < source.length; i += 4) { expected += source[i]; actual += target[i]; difference += Math.abs(source[i] - target[i]); }
        const candidate = { ...object, id: object.id + '-outline', matrix: [1, 0, 0, 1, 0, 0], style: style({ fill: '#000000', stroke: 'none', strokeWidth: 0 }), d: outlined };
        C.validateObject(candidate);
        const inspected = P.inspect(candidate), anchors = inspected.reduce((sum, child) => sum + child.segments.length, 0);
        return { id: object.id, outlined, unchanged: before === JSON.stringify(object), ratio: difference / Math.max(1, expected, actual), outputLength: outlined.length, anchors, subpaths: inspected.length, expected, actual };
      };
      const cases = [
        make('round-end', 'M20 38L205 38', { linecap: 'round' }),
        make('square-end', 'M20 66L205 66', { linecap: 'square' }),
        make('miter-corner', 'M20 138L92 26L164 138', { linejoin: 'miter' }),
        make('bevel-corner', 'M28 140L92 30L156 140', { linejoin: 'bevel' }),
        make('round-corner', 'M18 120L82 50L152 120', { linejoin: 'round' }),
        make('miter-l', 'M40 40H150V130', { strokeWidth: 20, linejoin: 'miter' }),
        make('bevel-l', 'M40 40H150V130', { strokeWidth: 20, linejoin: 'bevel' }),
        make('dashed', 'M20 24L200 24L200 135', { dash: '17 8', linecap: 'square', linejoin: 'round' }),
        make('compound-hole', 'M20 20H210V140H20Z M72 60H158V104H72Z', { linejoin: 'round' }),
        make('transformed-curve', 'M12 92C44 4 112 12 150 76S205 130 222 44', { strokeWidth: 4, linecap: 'round', linejoin: 'round' }, [1.35, .28, -.42, .74, 8, 12]),
        make('hairline', 'M16 112C62 12 148 18 210 100', { strokeWidth: .04, linecap: 'round', linejoin: 'round' }),
        make('zero-round', 'M120 80', { linecap: 'round' }),
        make('zero-square', 'M150 80', { linecap: 'square' }),
        make('zero-butt', 'M180 80', { linecap: 'butt' })
      ];
      const results = [];
      for (const object of cases) results.push(await compare(object, ['hairline', 'miter-l', 'bevel-l'].includes(object.id) ? 12 : 1));
      const original = cases[0], invalid = { ...original, d: 'M0 0C10000000 0 10000000 10000000 0 10000000', style: style({ strokeWidth: .04 }) };
      let overLimit = false; try { O.path(invalid); } catch (error) { overLimit = /^線のアウトライン化:/.test(error.message); }
      const denseDash = make('dense-dash', 'M0 0H10000', { dash: '.00001 .00001' });
      let denseDashRejected = false; try { O.path(denseDash); } catch (error) { denseDashRejected = /^線のアウトライン化:/.test(error.message); }
      return { results, overLimit, denseDashRejected, constants: { maxPoints: O.MAX_POINTS } };
    });
    const byId = Object.fromEntries(report.results.map(result => [result.id, result]));
    for (const result of report.results) {
      assert.equal(result.unchanged, true, result.id + ' preserves the editable source object');
      assert.ok(result.outputLength <= 100000, result.id + ' stays inside the Core path limit');
      if (result.id === 'zero-butt') { assert.equal(result.outlined, null); continue; }
      assert.ok(result.outlined, result.id + ' creates a filled path');
      assert.ok(result.anchors > 0, result.id + ' remains editable as path anchors');
    }
    assert.equal(byId['miter-l'].subpaths, 1, 'miter L字は内部の矩形を残さず一つの輪郭になる');
    assert.equal(byId['bevel-l'].subpaths, 1, 'bevel L字は内部の矩形を残さず一つの輪郭になる');
    assert.ok(byId['miter-l'].anchors <= 10 && byId['bevel-l'].anchors <= 10, 'L字に内部矩形由来のアンカーを残さない');
    // Pixel comparison includes caps, corners, dashes, a compound contour and
    // a non-uniform world transform. Hairline coverage is intentionally tiny.
    for (const id of ['round-end', 'square-end', 'miter-corner', 'bevel-corner', 'round-corner', 'dashed', 'compound-hole', 'transformed-curve']) {
      assert.ok(byId[id].ratio < .09, id + ' visual difference: ' + byId[id].ratio);
    }
    for (const id of ['miter-l', 'bevel-l']) assert.ok(byId[id].ratio < .035, id + ' outer corner at 12x: ' + byId[id].ratio);
    assert.ok(byId.hairline.ratio < .4, 'hairline keeps subpixel coverage at 12x: ' + byId.hairline.ratio);
    assert.ok(byId['zero-round'].actual > 0 && byId['zero-square'].actual > 0, 'zero-length round/square paths have visible outlines');
    assert.equal(report.overLimit, true, 'excessive curve subdivision is rejected before an oversized output is made');
    assert.equal(report.denseDashRejected, true, 'dense dashes are rejected before allocating thousands of runs');
    console.log('stroke-outline.test.cjs: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
