// 論理回路図のSVG・PNG書き出しオプションをChrome/WebKitで検証する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const baseURL = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';

async function inspectPng(page, path) {
  const bytes = await readFile(path);
  return page.evaluate(async raw => {
    const blob = new Blob([new Uint8Array(raw)], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        // 書き出し図の右端中央は回路を避けた背景部分。
        pixel: [...context.getImageData(canvas.width - 5, Math.floor(canvas.height / 2), 1, 1).data]
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [...bytes]);
}

async function exportUiChecks(page, name) {
  const exportTab = page.locator('[data-pane-button="export"]');
  if (await exportTab.getAttribute('aria-expanded') !== 'true') await exportTab.click();
  const panel = page.locator('#export-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('input[name="format"]')).toHaveCount(2);
  await expect(panel.locator('#export-background')).toBeVisible();
  await expect(panel.locator('#export-scale')).toBeVisible();
  await expect(panel.locator('#export-filename')).toBeVisible();
  await expect(panel.locator('#export-copy')).toBeVisible();
  assert.equal(await panel.locator('button, input, select').evaluateAll(nodes =>
    nodes.some(node => /0\/1/.test(node.getAttribute('aria-label') || node.textContent || ''))), false,
  `${name}: 0/1 control remains in toolbar only`);

  const before = await page.evaluate(() => logicWorkbenchEditor.snapshot());
  await panel.locator('#export-background').selectOption('transparent');
  await expect(panel.locator('#export-preview')).toHaveAttribute('data-background', 'transparent');
  assert.match(await panel.locator('#export-preview').evaluate(node => getComputedStyle(node).backgroundImage), /conic-gradient/,
    `${name}: transparent preview uses checkerboard`);
  await panel.locator('input[name="format"][value="svg"]').check();
  await panel.locator('#export-filename').fill('ui-svg.html');
  const svgDownloadPromise = page.waitForEvent('download');
  await panel.locator('#export-submit').click();
  const svgDownload = await svgDownloadPromise;
  assert.equal(svgDownload.suggestedFilename(), 'ui-svg.svg', `${name}: SVG extension and filename`);
  const svgPath = await svgDownload.path();
  assert.ok(svgPath);
  const svgText = await readFile(svgPath, 'utf8');
  assert.match(svgText, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svgText, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svgText, /class="logic-svg__background"[^>]*fill="transparent"/);
  assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), before,
    `${name}: SVG export does not modify the circuit model`);

  await panel.locator('input[name="format"][value="png"]').check();
  await panel.locator('#export-background').selectOption('transparent');
  await panel.locator('#export-scale').selectOption('4');
  await panel.locator('#export-filename').fill('ui-png.js');
  const natural = await page.evaluate(() => {
    const { svg } = logicWorkbenchEditor.createExportDiagram();
    return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height };
  });
  const pngDownloadPromise = page.waitForEvent('download');
  await panel.locator('#export-submit').click();
  const pngDownload = await pngDownloadPromise;
  assert.equal(pngDownload.suggestedFilename(), 'ui-png.png', `${name}: PNG extension and filename`);
  const pngPath = await pngDownload.path();
  assert.ok(pngPath);
  const png = await inspectPng(page, pngPath);
  assert.deepEqual([png.width, png.height], [natural.width * 4, natural.height * 4], `${name}: UI 4x dimensions`);
  assert.deepEqual(png.pixel, [0, 0, 0, 0], `${name}: UI transparent PNG alpha`);
  assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), before,
    `${name}: PNG export does not modify the circuit model`);

  // ClipboardItemへは画像Blobを待たずPromiseを渡し、クリック直後のユーザー操作権限を保つ。
  await page.evaluate(() => {
    const originalClipboard = navigator.clipboard;
    const originalItem = window.ClipboardItem;
    let captured = null;
    Object.defineProperty(window, 'ClipboardItem', { configurable: true, writable: true,
      value: class { constructor(data) { this.data = data; } } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write(items) {
      captured = items[0]?.data?.['image/png'];
      return Promise.resolve();
    } } });
    window.__logicExportClipboardRestore = () => {
      Object.defineProperty(window, 'ClipboardItem', { configurable: true, writable: true, value: originalItem });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
    };
    window.__logicExportClipboardResult = () => ({ promise: typeof captured?.then === 'function' });
  });
  await panel.locator('#export-copy').click();
  const clipboardResult = await page.evaluate(() => {
    const result = window.__logicExportClipboardResult();
    window.__logicExportClipboardRestore();
    delete window.__logicExportClipboardResult;
    delete window.__logicExportClipboardRestore;
    return result;
  });
  assert.equal(clipboardResult.promise, true, `${name}: ClipboardItem receives a Promise<Blob>`);
  await expect(panel.locator('#export-error')).toBeHidden();

  // クリップボード拒否時は、PNG保存へ案内するエラーを表示する。
  await page.evaluate(() => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write() { return Promise.reject(new Error('denied')); }
    } });
    window.__logicExportClipboardRestore = () => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
  });
  await panel.locator('#export-copy').click();
  await expect(panel.locator('#export-error')).toBeVisible();
  await expect(panel.locator('#export-error')).toContainText(/許可|PNGを書き出して/);
  await page.evaluate(() => { window.__logicExportClipboardRestore(); delete window.__logicExportClipboardRestore; });
  assert.deepEqual(await page.evaluate(() => logicWorkbenchEditor.snapshot()), before,
    `${name}: clipboard operations do not modify the circuit model`);
  console.log(`${name}: independent editor export UI, downloads, checker preview, clipboard Promise and fallback passed`);
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(new URL('tools/logic/', baseURL).href);
    await page.locator('body.logic-tool-ready').waitFor();
    const checks = await page.evaluate(async () => {
      const host = document.createElement('div');
      const rendered = LogicRenderer.renderCircuit(host, LogicCore.parse('A_B'), { inputs: { A: 1, B: 0 } });
      const before = rendered.svg.outerHTML;
      const white = LogicRenderer.serializeSvg(rendered.svg, '白 <回路>', { background: 'white' });
      const transparent = LogicRenderer.serializeSvg(rendered.svg, '透過', { background: 'transparent' });
      const parse = value => new DOMParser().parseFromString(value, 'image/svg+xml');
      const whiteXml = parse(white);
      const transparentXml = parse(transparent);
      const sourceUrl = URL.createObjectURL;
      const revoked = [];
      URL.createObjectURL = blob => sourceUrl.call(URL, blob);
      const originalRevoke = URL.revokeObjectURL;
      URL.revokeObjectURL = url => { revoked.push(url); return originalRevoke.call(URL, url); };
      try {
        const blobs = await Promise.all([1, 2, 4].map(scale =>
          LogicRenderer.createPngBlob(rendered.svg, '回路', { scale, background: 'transparent' })));
        const dims = [];
        const readPixel = async blob => {
          const url = URL.createObjectURL(blob);
          try {
            const image = new Image();
            await new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = reject;
              image.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            return [...context.getImageData(canvas.width - 5, Math.floor(canvas.height / 2), 1, 1).data];
          } finally {
            URL.revokeObjectURL(url);
          }
        };
        for (const blob of blobs) {
          const url = URL.createObjectURL(blob);
          try {
            const image = new Image();
            await new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = reject;
              image.src = url;
            });
            dims.push([image.naturalWidth, image.naturalHeight]);
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        const whiteBlob = await LogicRenderer.createPngBlob(rendered.svg, '回路', { scale: 1, background: 'white' });
        return {
          before,
          after: rendered.svg.outerHTML,
          whiteError: whiteXml.querySelector('parsererror')?.textContent || '',
          transparentError: transparentXml.querySelector('parsererror')?.textContent || '',
          whiteBackground: whiteXml.querySelector('.logic-svg__background')?.getAttribute('fill'),
          transparentBackground: transparentXml.querySelector('.logic-svg__background')?.getAttribute('fill'),
          whiteGate: whiteXml.querySelector('.logic-gate__body')?.getAttribute('fill'),
          transparentGate: transparentXml.querySelector('.logic-gate__body')?.getAttribute('fill'),
          dims,
          transparentPixel: await readPixel(blobs[0]),
          whitePixel: await readPixel(whiteBlob),
          revoked: revoked.length
        };
      } finally {
        URL.createObjectURL = sourceUrl;
        URL.revokeObjectURL = originalRevoke;
      }
    });
    assert.equal(checks.before, checks.after, `${name}: live SVG is not modified`);
    assert.equal(checks.whiteError, '', `${name}: white SVG is valid XML`);
    assert.equal(checks.transparentError, '', `${name}: transparent SVG is valid XML`);
    assert.equal(checks.whiteBackground, '#ffffff', `${name}: white background is exported`);
    assert.equal(checks.transparentBackground, 'transparent', `${name}: transparent background is exported`);
    assert.equal(checks.whiteGate, '#f8fafc', `${name}: white gate fill is retained`);
    assert.equal(checks.transparentGate, '#f8fafc', `${name}: transparent export does not hollow gates`);
    assert.deepEqual(checks.dims[1], checks.dims[0].map(value => value * 2), `${name}: 2x dimensions`);
    assert.deepEqual(checks.dims[2], checks.dims[0].map(value => value * 4), `${name}: 4x dimensions`);
    assert.deepEqual(checks.transparentPixel, [0, 0, 0, 0], `${name}: transparent PNG has transparent pixels`);
    assert.deepEqual(checks.whitePixel, [255, 255, 255, 255], `${name}: white PNG has opaque white pixels`);
    assert.ok(checks.revoked >= 3, `${name}: temporary SVG object URLs are released`);

    const download = await page.evaluate(async () => {
      const host = document.createElement('div');
      const rendered = LogicRenderer.renderCircuit(host, LogicCore.parse('A_B'));
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = () => 'blob:logic-export-test';
      URL.revokeObjectURL = () => {};
      try {
        const originalClick = HTMLAnchorElement.prototype.click;
        let name = '';
        HTMLAnchorElement.prototype.click = function () { name = this.download; };
        try { LogicRenderer.downloadSvg(rendered.svg, '回路', { filename: '../長い\\名前.html' }); }
        finally { HTMLAnchorElement.prototype.click = originalClick; }
        return name;
      } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    });
    assert.equal(download, '_長い_名前.svg', `${name}: filename is sanitized and extension is normalized`);
    console.log(`${name}: SVG/PNG background, scale, XML, clone safety, filename and URL cleanup passed`);
    await exportUiChecks(page, name);
  } finally {
    await browser.close();
  }
}
