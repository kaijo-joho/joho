/* Run with the bundled Chrome runtime: node tools/illustslide/tests/export-browser.test.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const root = path.resolve(__dirname, '..');
const artifacts = '/private/tmp/illustslide-export-qa';

async function main() {
  await fs.mkdir(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('about:blank');
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'core.js', 'geometry.js', 'svg.js', 'export.js']) await page.addScriptTag({ path: path.join(root, file) });
    const result = await page.evaluate(async () => {
      const style = { fill: '#ff0000', stroke: 'none', strokeWidth: 0, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 18, fontFamily: 'sans-serif', bold: false, italic: false };
      const small = IlapoCore.createPage('18px', { width: 18, height: 18, unit: 'px', infinite: false });
      small.objects.push(IlapoCore.makeShape('rect', 2, 2, 4, 4, style));
      const transparent = await IlapoExport.png(small, { background: 'transparent' });
      const white = await IlapoExport.png(small, { background: 'white' });
      async function pixels(blob) { const url = URL.createObjectURL(blob), image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); const data = ctx.getImageData(0, 0, image.width, image.height); let nonwhite = 0; for (let i = 0; i < data.data.length; i += 4) if (data.data[i] < 245 || data.data[i + 1] < 245 || data.data[i + 2] < 245 || data.data[i + 3] < 255) nonwhite++; URL.revokeObjectURL(url); return { width: image.width, height: image.height, corner: Array.from(data.data.slice(0, 4)), center: Array.from(data.data.slice((3 * image.width + 3) * 4, (3 * image.width + 4) * 4)), nonwhite }; }
      const free = IlapoCore.createPage('自由', { width: 100, height: 100, unit: 'px', infinite: true });
      const left = IlapoCore.makeShape('rect', -30, -20, 10, 10, style); const right = IlapoCore.makeShape('rect', 40, 30, 10, 10, style); free.objects.push(left, right);
      const allFree = await IlapoExport.png(free, { padding: 0 }); const selected = await IlapoExport.png(free, { selectionIds: [left.id], padding: 0, scale: 2 });
      const textPage = IlapoCore.createPage('文字', IlapoCore.boardPreset('a4'));
      const text = IlapoCore.makeText(10, 40, '', style); text.runs = [{ text: '日本語 H', script: 'normal' }, { text: '2', script: 'sub' }, { text: '+', script: 'super' }]; textPage.objects.push(text);
      const b5 = IlapoCore.createPage('B5', IlapoCore.boardPreset('b5')); b5.objects.push(IlapoCore.makeShape('rect', 20, 20, 30, 30, style));
      const printHTML = IlapoExport.buildPrintHTML([{ page: textPage }, { page: b5 }]);
      const customPage = IlapoCore.createPage('任意', { width: 210 * 96 / 25.4, height: 100 * 96 / 25.4, unit: 'mm', infinite: false }); customPage.objects.push(text);
      const freePage = IlapoCore.createPage('自由比', { width: 1280, height: 720, unit: 'px', infinite: true });
      const tinyPage = IlapoCore.createPage('18px', { width: 18, height: 18, unit: 'px', infinite: false });
      const textPng = await IlapoExport.png(textPage, { background: 'white' });
      const oversized = IlapoCore.createPage('大', { width: 20000, height: 10, unit: 'px', infinite: false });
      let oversizedMessage = ''; try { await IlapoExport.png(oversized); } catch (e) { oversizedMessage = e.message; }
      return { transparent: await pixels(transparent), white: await pixels(white), free: await pixels(allFree), selected: await pixels(selected), text: await pixels(textPng), textPngBytes: Array.from(new Uint8Array(await textPng.arrayBuffer())), printHTML, customHTML: IlapoExport.buildPrintHTML([customPage]), freeHTML: IlapoExport.buildPrintHTML([freePage]), tinyHTML: IlapoExport.buildPrintHTML([tinyPage]), oversizedMessage };
    });
    assert.deepEqual(result.transparent.corner, [0, 0, 0, 0], 'transparent PNG keeps alpha at an empty corner');
    assert.deepEqual(result.white.corner, [255, 255, 255, 255], 'white PNG paints the background');
    assert.equal(result.transparent.width, 18); assert.equal(result.transparent.height, 18);
    assert(result.free.width > 0 && result.free.height > 0, 'negative free-canvas bounds export');
    assert(result.selected.width < result.free.width * 2 && result.selected.height < result.free.height * 2, 'selection-only export is cropped');
    assert(result.text.nonwhite > 0, 'Japanese text PNG contains non-white pixels');
    assert.match(result.printHTML, /日本語/); assert.match(result.printHTML, /baseline-shift="sub"/); assert.match(result.printHTML, /baseline-shift="super"/);
    assert.match(result.printHTML, /@page ilapo-0\{size:[0-9.]+mm [0-9.]+mm/); assert.match(result.printHTML, /page:ilapo-1/); assert.match(result.printHTML, /page-break-before:always/); assert.match(result.printHTML, /:last-child\{break-after:auto/);
    assert.match(result.oversizedMessage, /最大寸法/);
    await fs.writeFile(path.join(artifacts, 'small-transparent.png'), Buffer.from(await page.evaluate(async () => { const p = IlapoCore.createPage('18', { width: 18, height: 18, unit: 'px', infinite: false }); p.objects.push(IlapoCore.makeShape('rect', 2, 2, 4, 4, { fill: '#ff0000', stroke: 'none', strokeWidth: 0, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 18, fontFamily: 'sans-serif', bold: false, italic: false })); const b = await IlapoExport.png(p); return new Uint8Array(await b.arrayBuffer()); })));
    const pdfPage = await browser.newPage(); await pdfPage.setContent(result.printHTML, { waitUntil: 'load' });
    const pdf = await pdfPage.pdf({ path: path.join(artifacts, 'mixed-pages-headless.pdf'), printBackground: true, preferCSSPageSize: true });
    assert(pdf.length > 1000 && (await fs.stat(path.join(artifacts, 'mixed-pages-headless.pdf'))).size === pdf.length);
    const mediaBoxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.equal(mediaBoxes.length, 2, 'mixed PDF contains exactly two media boxes');
    assert(Math.abs(mediaBoxes[0][0] - 210 / 25.4 * 72) < 1 && Math.abs(mediaBoxes[0][1] - 297 / 25.4 * 72) < 1, 'first PDF page is A4');
    assert(Math.abs(mediaBoxes[1][0] - 182 / 25.4 * 72) < 1 && Math.abs(mediaBoxes[1][1] - 257 / 25.4 * 72) < 1, 'second PDF page is JIS B5');
    console.log('headless media boxes: ' + JSON.stringify(mediaBoxes.slice(0, 2)));
    async function onePagePDF(html, name, expected) { const p = await browser.newPage(); await p.setContent(html, { waitUntil: 'load' }); const data = await p.pdf({ path: path.join(artifacts, name), printBackground: true, preferCSSPageSize: true }); const boxes = [...data.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)/g)].map(m => [Number(m[1]), Number(m[2])]); assert.equal(boxes.length, 1, name + ' has one page'); assert(Math.abs(boxes[0][0] - expected[0]) < 1 && Math.abs(boxes[0][1] - expected[1]) < 1, name + ' MediaBox'); await p.close(); }
    await onePagePDF(result.customHTML, 'custom-210x100mm.pdf', [210 / 25.4 * 72, 100 / 25.4 * 72]);
    await onePagePDF(result.freeHTML, 'free-1280x720px.pdf', [1280 / 96 * 72, 720 / 96 * 72]);
    await onePagePDF(result.tinyHTML, 'tiny-18px.pdf', [18 / 96 * 72, 18 / 96 * 72]);
    await fs.writeFile(path.join(artifacts, 'japanese-text.png'), Buffer.from(result.textPngBytes));
    const printCheck = await page.evaluate(async () => { const p = IlapoCore.createPage('印刷', { width: 18, height: 18, unit: 'px', infinite: false }); const opener = document.createElement('button'); opener.textContent = 'opener'; document.body.appendChild(opener); opener.focus(); const oldAppend = document.body.appendChild; document.body.appendChild = function (node) { const result = oldAppend.call(this, node); if (node.tagName === 'IFRAME' && node.getAttribute('aria-hidden') === 'true') node.addEventListener('load', () => setTimeout(() => node.contentWindow.dispatchEvent(new Event('afterprint')), 100), { once: true }); return result; }; try { await IlapoExport.print([p]); return { focused: document.activeElement === opener, frames: document.querySelectorAll('iframe[aria-hidden="true"]').length }; } finally { document.body.appendChild = oldAppend; opener.remove(); } });
    assert.deepEqual(printCheck, { focused: true, frames: 0 }, 'mocked iframe print cleans up after afterprint and restores focus');
    console.log('Ilapo export browser checks passed');
    console.log('QA artifacts: ' + artifacts);
    console.log('Chrome headless PDF media boxes verified as A4 + JIS B5; interactive print-dialog behavior remains unverified.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
