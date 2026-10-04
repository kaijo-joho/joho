// Focused browser regressions for color-palette.html.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright JOHO_BROWSER=chrome|webkit node test-color-palette-browser.mjs [URL]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = require(modulePath);
const Core = require(resolve(dirname(fileURLToPath(import.meta.url)), '../js/color-palette-core.js'));
const targetURL = new URL(process.argv[2] || 'http://127.0.0.1:8776/color-palette.html');
const engineName = process.env.JOHO_BROWSER === 'webkit' ? 'webkit' : 'chrome';
const browserType = engineName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch(engineName === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
let checks = 0;
const watchers = [];

function ok(value, message) { assert.ok(value, message); checks += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); checks += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; }
function matches(actual, expected, message) { assert.match(actual, expected, message); checks += 1; }
function close(actual, expected, tolerance, message) { ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`); }

const validPin = { l: 0.52, c: 0.11, h: 133.5, name: 'seed-green' };

async function openApp({ viewport = { width: 1280, height: 1000 }, hasTouch = false, seed = null, blockedStorage = false, startupErrorsExpected = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const watcher = { unexpected: [], expectedConsole: [], allowed: startupErrorsExpected, abortedExternal: [] };
  watchers.push(watcher);
  page.on('pageerror', error => watcher.unexpected.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (watcher.allowed) watcher.expectedConsole.push(text);
    else if (/^Failed to load resource: net::ERR_FAILED/.test(text)) watcher.abortedExternal.push(text);
    else watcher.unexpected.push(`console: ${text}`);
  });
  page.on('response', response => {
    if (response.url().startsWith(targetURL.origin) && response.status() >= 400) {
      watcher.unexpected.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(targetURL.origin)) watcher.unexpected.push(`request failed: ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
  });
  await context.addInitScript(({ seedData, disableStorage }) => {
    window.__paletteClipboard = { writes: [], mode: 'success', execResult: false, execCalls: 0 };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => {
        if (window.__paletteClipboard.mode === 'missing') throw new Error('Clipboard API unavailable');
        if (window.__paletteClipboard.mode === 'reject') throw new Error('synthetic clipboard rejection');
        window.__paletteClipboard.writes.push(String(text));
      } }
    });
    document.execCommand = command => {
      if (command === 'copy') window.__paletteClipboard.execCalls += 1;
      return Boolean(window.__paletteClipboard.execResult);
    };
    if (seedData) {
      localStorage.setItem('oklch-palette-v1', seedData.main);
      if (seedData.recovery !== undefined) localStorage.setItem('oklch-palette-v1-recovery', seedData.recovery);
    }
    if (disableStorage) {
      Storage.prototype.getItem = () => { throw new DOMException('synthetic storage unavailable', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('synthetic storage unavailable', 'SecurityError'); };
    }
  }, { seedData: seed, disableStorage: blockedStorage });
  // The existing tool relies on Tailwind's CDN stylesheet runtime. Test its real layout.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const assetHosts = ['cdn.tailwindcss.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
    return url.origin === targetURL.origin || assetHosts.includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto(targetURL.href, { waitUntil: 'domcontentloaded' });
  await page.locator('#base-swatch').waitFor();
  await page.locator('#main-grid .color-copy').first().waitFor();
  if (watcher.allowed) {
    ok(watcher.expectedConsole.length > 0, 'intentional startup storage error was captured separately');
    watcher.allowed = false;
  }
  return { context, page, watcher };
}

async function expectConsoleErrors(watcher, operation, message) {
  const before = watcher.expectedConsole.length;
  watcher.allowed = true;
  try { await operation(); } finally { watcher.allowed = false; }
  ok(watcher.expectedConsole.length > before, message);
}

async function setOklch(page, { l, c, h }) {
  await page.locator('#main-tab-editor').click();
  await page.locator('#sub-tab-oklch').click();
  await page.locator('#num-l').fill(String(l));
  await page.locator('#num-c').fill(String(c));
  await page.locator('#num-h').fill(String(h));
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (delta !== 0) {
    s = l > .5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  const s = max === 0 ? 0 : delta / max;
  if (delta !== 0) {
    if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: max * 100 };
}

function expectedFormatted(color, format) {
  if (format === 'oklch') return `oklch(${color.l.toFixed(8)} ${color.c.toFixed(8)} ${color.h.toFixed(6)})`;
  if (format === 'rgb') return `rgb(${color.r}, ${color.g}, ${color.b})`;
  if (format === 'hex') return `#${Core.rgbToHex(color.r, color.g, color.b)}`;
  if (format === 'hsl') {
    const value = rgbToHsl(color.r, color.g, color.b);
    return `hsl(${value.h.toFixed(3)}, ${value.s.toFixed(3)}%, ${value.l.toFixed(3)}%)`;
  }
  const value = rgbToHsv(color.r, color.g, color.b);
  return `hsv(${value.h.toFixed(3)}, ${value.s.toFixed(3)}%, ${value.v.toFixed(3)}%)`;
}

async function copyBase(page, format) {
  await page.locator('#format-select').selectOption(format);
  await page.locator('#base-swatch').locator('xpath=..').hover();
  await page.evaluate(() => { window.__paletteClipboard.writes.length = 0; });
  await page.locator('#base-swatch').locator('xpath=..').locator('button').first().click();
  await page.waitForFunction(() => window.__paletteClipboard.writes.length > 0);
  return page.evaluate(() => window.__paletteClipboard.writes.at(-1));
}

async function colorPixel(page, value) {
  return page.evaluate(color => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return { accepted: CSS.supports('color', color), rgba: Array.from(context.getImageData(0, 0, 1, 1).data) };
  }, value);
}

async function checkCopiedFormats(page, lch, phase) {
  await setOklch(page, lch);
  const expectedColor = Core.mapToSrgb(lch.l, lch.c, lch.h);
  for (const format of ['oklch', 'rgb', 'hex', 'hsl', 'hsv']) {
    const copied = await copyBase(page, format);
    equal(copied, expectedFormatted(expectedColor, format), `${phase} ${format} copy uses effective color`);
    if (format !== 'hsv') {
      const pixel = await colorPixel(page, copied);
      ok(pixel.accepted, `${phase} ${format} value is a native CSS color`);
      for (let channel = 0; channel < 3; channel += 1) {
        ok(Math.abs(pixel.rgba[channel] - [expectedColor.r, expectedColor.g, expectedColor.b][channel]) <= 1,
          `${phase} ${format} canvas channel ${channel} matches mapped sRGB`);
      }
    }

    await page.getByRole('button', { name: 'CSS (Grid Only)', exact: true }).click();
    const css = await page.locator('#css-output').inputValue();
    const baseLine = css.match(/^\s*(--[\w-]+):\s*([^;]+);\s*\/\* Base \*\//m);
    ok(Boolean(baseLine), `${phase} ${format} CSS includes a base variable`);
    const expectedCssValue = format === 'hsv' ? `#${Core.rgbToHex(expectedColor.r, expectedColor.g, expectedColor.b)}` : expectedFormatted(expectedColor, format);
    equal(baseLine[2], expectedCssValue, `${phase} ${format} CSS base variable uses effective color`);
    if (format !== 'hsv') {
      const cssPixel = await colorPixel(page, baseLine[2]);
      ok(cssPixel.accepted, `${phase} ${format} CSS value parses natively`);
      for (let channel = 0; channel < 3; channel += 1) {
        ok(Math.abs(cssPixel.rgba[channel] - [expectedColor.r, expectedColor.g, expectedColor.b][channel]) <= 1,
          `${phase} ${format} CSS canvas channel ${channel} matches mapped sRGB`);
      }
    }
    await page.keyboard.press('Escape');
    await page.locator('#css-modal').waitFor({ state: 'hidden' });
  }
}

function parseRgbText(text) {
  const match = text.match(/^(\d+),\s*(\d+),\s*(\d+)$/);
  assert.ok(match, `RGB display ${text}`);
  return match.slice(1).map(Number);
}

try {
  const main = await openApp();
  const { page, watcher } = main;
  const targetInGamut = { l: 0.55, c: 0.08, h: 150 };
  await checkCopiedFormats(page, targetInGamut, 'in-gamut');
  const outGamut = { l: 0.7, c: 0.37, h: 30 };
  await checkCopiedFormats(page, outGamut, 'out-of-gamut');
  ok((await page.locator('#gamut-notice').textContent()).includes('色域外'), 'out-of-gamut notice appears while requested LCH remains active');
  const storedAfterMapped = await page.evaluate(() => JSON.parse(localStorage.getItem('oklch-palette-v1')));
  close(storedAfterMapped.state.l, outGamut.l, 1e-10, 'requested L retained in storage');
  close(storedAfterMapped.state.c, outGamut.c, 1e-10, 'requested C retained in storage');
  close(storedAfterMapped.state.h, outGamut.h, 1e-10, 'requested H retained in storage');

  // Numeric HSL and HSV edits must update the color through their own conversion paths.
  await page.locator('#sub-tab-hsl').click();
  const beforeHsl = await page.locator('#disp-rgb').textContent();
  await page.locator('#num-hsl-h').fill('210');
  const afterHsl = await page.locator('#disp-rgb').textContent();
  ok(beforeHsl !== afterHsl, 'numeric HSL hue changes the RGB result');
  ok((await page.locator('#disp-hsl').textContent()).startsWith('210°'), 'numeric HSL hue is reflected in summary');
  await page.locator('#btn-show-hsv').click();
  const beforeHsv = await page.locator('#disp-rgb').textContent();
  await page.locator('#num-hsv-h').fill('60');
  ok((await page.locator('#disp-rgb').textContent()) !== beforeHsv, 'numeric HSV hue changes the RGB result');
  ok((await page.locator('#disp-hsv').textContent()).startsWith('60°'), 'numeric HSV hue is reflected in summary');

  // Blank and out-of-range fields stay invalid without overwriting the last valid saved color.
  await page.locator('#btn-show-hsl').click();
  const validBeforeInvalid = await page.evaluate(() => ({
    raw: localStorage.getItem('oklch-palette-v1'),
    hex: document.querySelector('#disp-hex').textContent
  }));
  await page.locator('#sub-tab-oklch').click();
  await page.locator('#num-c').fill('');
  equal(await page.locator('#num-c').getAttribute('aria-invalid'), 'true', 'blank chroma is marked invalid');
  equal(await page.evaluate(() => localStorage.getItem('oklch-palette-v1')), validBeforeInvalid.raw, 'blank chroma does not overwrite the saved color');
  await page.locator('#sub-tab-hsl').click();
  await page.locator('#num-hsl-h').fill('999');
  equal(await page.locator('#num-hsl-h').getAttribute('aria-invalid'), 'true', 'out-of-range HSL hue is marked invalid');
  equal(await page.evaluate(() => localStorage.getItem('oklch-palette-v1')), validBeforeInvalid.raw, 'invalid edits do not save over last valid state');
  await page.locator('#sub-tab-rgb').click();
  for (const [selector, value, message] of [
    ['#num-r', '', 'blank RGB'], ['#num-r', '12.5', 'non-integer RGB'],
    ['#input-count', '', 'blank count'], ['#input-count', '2.5', 'invalid count'],
    ['#input-hex', 'ZZZZZZ', 'invalid HEX']
  ]) {
    await page.locator(selector).fill(value);
    equal(await page.locator(selector).getAttribute('aria-invalid'), 'true', `${message} is marked invalid`);
    equal(await page.evaluate(() => localStorage.getItem('oklch-palette-v1')), validBeforeInvalid.raw, `${message} preserves the last valid saved state`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#base-swatch').waitFor();
  equal(await page.locator('#disp-hex').textContent(), validBeforeInvalid.hex, 'reload restores last valid color after blank/invalid input');
  equal(await page.locator('#num-c').getAttribute('aria-invalid'), null, 'reload clears invalid edit marker');

  // Normal persistence and generated lightness rows, including the .99/.995 seam.
  await setOklch(page, { l: 0.995, c: 0.12, h: 240 });
  const stateAt995 = await page.evaluate(() => JSON.parse(localStorage.getItem('oklch-palette-v1')).state);
  close(stateAt995.l, 0.995, 1e-10, 'normal OKLCH state persists');
  const generatedBase = await page.locator('#main-grid .color-copy').evaluateAll(nodes => nodes
    .filter(node => node.getAttribute('aria-label')?.includes('99.5%'))
    .length);
  ok(generatedBase > 0, 'grid includes requested 99.5 percent base row');
  const rgbBounds = await page.locator('.val-table').boundingBox();
  ok(rgbBounds && rgbBounds.x >= 0 && rgbBounds.x + rgbBounds.width <= 1281, 'numeric color table fits desktop viewport');
  const trigger = page.getByRole('button', { name: 'CSS (Grid Only)', exact: true });
  await trigger.click();
  const dialog = page.locator('#css-modal');
  ok(await dialog.evaluate(node => node.open), 'CSS output uses native dialog');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('onclick') === "openCssModal('grid', this)");
  ok(await trigger.evaluate(node => document.activeElement === node), 'Escape returns focus to CSS trigger');
  await trigger.click();
  const dialogBounds = await dialog.boundingBox();
  await page.mouse.click(2, 2);
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('onclick') === "openCssModal('grid', this)");
  ok(dialogBounds && await trigger.evaluate(node => document.activeElement === node), 'backdrop closes dialog and restores focus');
  await page.locator('#main-grid .color-copy').first().focus();
  await page.evaluate(() => { window.__paletteClipboard.writes.length = 0; });
  await page.locator('#main-grid .color-copy').first().press('Enter');
  await page.waitForFunction(() => window.__paletteClipboard.writes.length > 0);
  ok(true, 'keyboard Enter copies a focused grid color');

  // CSS copy reports success and failure inside the native top-layer dialog.
  await page.getByRole('button', { name: 'CSS (Grid Only)', exact: true }).click();
  const cssText = await page.locator('#css-output').inputValue();
  await page.evaluate(() => { window.__paletteClipboard.writes.length = 0; });
  await page.locator('#css-modal').getByRole('button', { name: 'Copy All', exact: true }).click();
  await page.locator('#css-copy-status').getByText('CSSをコピーしました。').waitFor();
  equal(await page.evaluate(() => window.__paletteClipboard.writes.at(-1)), cssText, 'CSS copy captures the full textarea text');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  for (const mode of ['missing', 'reject']) {
    await page.evaluate(mode => { window.__paletteClipboard.mode = mode; window.__paletteClipboard.execResult = false; }, mode);
    await page.getByRole('button', { name: 'CSS (Grid Only)', exact: true }).click();
    await expectConsoleErrors(watcher, async () => {
      await page.locator('#css-modal').getByRole('button', { name: 'Copy All', exact: true }).click();
      await page.locator('#css-copy-status').getByText('コピーできませんでした。CSS出力の文字列を選択してコピーしてください。').waitFor();
    }, `${mode} clipboard and failed execCommand are recorded as expected`);
    ok((await page.locator('#css-copy-status').textContent()).includes('コピーできませんでした'), `${mode} clipboard failure is visible in the dialog`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  }

  // Stock deduplication, hostile-but-inert names, normalized CSS identifiers and parser validation.
  await page.locator('#main-tab-stock').click();
  const manual = page.locator('#manual-hex');
  await manual.fill('#225386'); await manual.press('Enter');
  equal(await page.locator('#stock-container .color-copy').count(), 1, 'manual stock adds one color');
  await manual.fill('225386'); await manual.press('Enter');
  equal(await page.locator('#stock-container .color-copy').count(), 1, 'duplicate manual RGB color is rejected');
  await manual.fill('#ff0000'); await manual.press('Enter');
  await manual.fill('#0000ff'); await manual.press('Enter');
  equal(await page.locator('#stock-container .color-copy').count(), 3, 'distinct manual colors are retained');
  const names = page.locator('#stock-container input[aria-label="ストックの名前"]');
  const hostile = 'Quoted " <img src=x onerror="window.__paletteXss=1"> & Name';
  for (const [index, name] of [[0, 'Primary / CTA'], [1, 'primary:cta'], [2, hostile]]) {
    const input = names.nth(index);
    await input.fill(name);
    await input.dispatchEvent('change');
  }
  equal(await page.locator('#stock-container img').count(), 0, 'stock label text cannot inject markup');
  equal(await names.nth(2).inputValue(), hostile, 'quoted hostile label round-trips as text');
  equal(await page.evaluate(() => window.__paletteXss || null), null, 'hostile label does not execute code');
  await page.getByRole('button', { name: 'CSS (Stock Only)', exact: true }).click();
  const stockCss = await page.locator('#css-output').inputValue();
  const stockNames = [...stockCss.matchAll(/^\s*(--[^:\s]+):\s*([^;]+);/gm)].map(match => match[1]);
  equal(stockNames.length, 3, 'stock CSS exports each stocked color');
  equal(new Set(stockNames).size, 3, 'normalized duplicate stock names receive unique suffixes');
  ok(stockNames.every(name => /^--[\w-]+$/.test(name)), 'all generated stock property names are valid simple identifiers');
  ok(stockNames.includes('--primary-cta') && stockNames.includes('--primary-cta-2'), 'duplicate names normalize to stable distinct variables');
  const parseResult = await page.evaluate(css => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const rule = style.sheet.cssRules[0];
    const values = Array.from(rule.style, name => [name, rule.style.getPropertyValue(name)]);
    style.remove();
    return { ruleCount: style.sheet?.cssRules?.length ?? values.length, values };
  }, stockCss);
  equal(parseResult.values.length, 3, 'stock CSS parses into three custom properties');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#base-swatch').waitFor();
  await page.locator('#main-tab-stock').click();
  equal(await page.locator('#stock-container .color-copy').count(), 3, 'stock colors survive reload');
  equal(await page.locator('#stock-container input[aria-label="ストックの名前"]').nth(2).inputValue(), hostile, 'hostile name survives reload safely');

  // Fallback failure paths report failure and do not claim success.
  await page.evaluate(() => { window.__paletteClipboard.mode = 'missing'; window.__paletteClipboard.execResult = false; });
  await expectConsoleErrors(watcher, async () => {
    await page.locator('#main-grid .color-copy').first().click();
    await page.getByText('コピーできませんでした。CSS出力の文字列を選択してコピーしてください。').waitFor();
  }, 'navigator and execCommand failure is recorded as expected');
  ok((await page.locator('#toast').textContent()).includes('コピーできませんでした'), 'missing clipboard plus failed execCommand shows failure');
  await page.evaluate(() => { window.__paletteClipboard.mode = 'reject'; window.__paletteClipboard.execResult = false; });
  await expectConsoleErrors(watcher, async () => {
    await page.locator('#main-grid .color-copy').first().click();
    await page.getByText('コピーできませんでした。CSS出力の文字列を選択してコピーしてください。').waitFor();
  }, 'rejected navigator and failed execCommand are recorded as expected');
  ok((await page.locator('#toast').textContent()).includes('コピーできませんでした'), 'rejected clipboard plus failed execCommand shows failure');
  await main.context.close();

  // Touch controls and narrow viewport must remain usable without page-level overflow.
  const mobile = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const mobilePage = mobile.page;
  const mobileLayout = await mobilePage.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  ok(mobileLayout.scroll <= mobileLayout.viewport + 1, '390px viewport has no page-level horizontal overflow');
  for (const selector of ['#btn-inc', '#btn-dec', '#num-l', '#num-c', '#num-h']) {
    ok(await mobilePage.locator(selector).isVisible(), `mobile control visible: ${selector}`);
  }
  await mobilePage.locator('#sub-tab-rgb').tap();
  ok(await mobilePage.locator('#num-r').isVisible(), 'RGB controls available in their touch tab');
  await mobilePage.locator('#sub-tab-hsl').tap();
  ok(await mobilePage.locator('#num-hsl-h').isVisible(), 'HSL controls available in their touch tab');
  await mobilePage.locator('#btn-show-hsv').tap();
  ok(await mobilePage.locator('#num-hsv-h').isVisible(), 'HSV controls available in their touch tab');
  await mobilePage.locator('#btn-inc').tap();
  equal(await mobilePage.locator('#input-count').inputValue(), '17', 'touch increment control changes palette count');
  await mobilePage.locator('#btn-dec').tap();
  equal(await mobilePage.locator('#input-count').inputValue(), '16', 'touch decrement control changes palette count');
  const tableOnMobile = await mobilePage.locator('.val-table').boundingBox();
  ok(tableOnMobile && tableOnMobile.x >= 0 && tableOnMobile.x + tableOnMobile.width <= 391, 'numeric table remains inside mobile viewport');
  await mobilePage.locator('#main-grid .color-copy').first().focus();
  await mobilePage.evaluate(() => { window.__paletteClipboard.writes.length = 0; });
  await mobilePage.locator('#main-grid .color-copy').first().press('Enter');
  await mobilePage.waitForFunction(() => window.__paletteClipboard.writes.length > 0);
  ok(true, 'keyboard copy works at touch viewport');
  await mobile.context.close();

  // Legacy RGB-only saves, invalid null state recovery and malformed JSON preserve usable data.
  const oldData = JSON.stringify({
    state: { r: 34, g: 83, b: 134, count: 6, outputFormat: 'hex', hsvMode: 'hsl' },
    pinnedColors: [validPin]
  });
  const legacy = await openApp({ seed: { main: oldData } });
  equal(await legacy.page.locator('#disp-hex').textContent(), '#225386', 'legacy RGB-only state restores its color');
  equal(await legacy.page.locator('#input-count').inputValue(), '6', 'legacy palette count remains valid');
  ok(await legacy.page.locator('#view-stock').evaluate(node => node.classList.contains('hidden')), 'legacy stock view is initially hidden');
  await legacy.page.locator('#main-tab-stock').click();
  equal(await legacy.page.locator('#stock-container .color-copy').count(), 1, 'legacy valid stock survives migration');
  await legacy.context.close();

  const nullStateRaw = JSON.stringify({ state: null, pinnedColors: [validPin, { l: null, c: Infinity, h: 'bad', name: 'invalid' }] });
  const nullState = await openApp({ seed: { main: nullStateRaw } });
  equal(await nullState.page.evaluate(() => localStorage.getItem('oklch-palette-v1-recovery')), nullStateRaw, 'invalid null-state source is preserved as recovery');
  const repaired = await nullState.page.evaluate(() => JSON.parse(localStorage.getItem('oklch-palette-v1')));
  equal(repaired.pinnedColors.length, 1, 'valid pin is retained while invalid pin is discarded');
  equal(repaired.pinnedColors[0].name, validPin.name, 'valid pin metadata survives recovery');
  await nullState.context.close();

  const malformed = await openApp({ seed: { main: '{broken' }, startupErrorsExpected: true });
  equal(await malformed.page.evaluate(() => localStorage.getItem('oklch-palette-v1-recovery')), '{broken', 'malformed JSON is backed up verbatim');
  ok(await malformed.page.locator('#base-swatch').isVisible(), 'malformed storage recovers to a usable editor');
  await malformed.context.close();

  // Storage denial is expected to log errors, but the editor remains interactive and reports failed saves.
  const unavailable = await openApp({ blockedStorage: true, startupErrorsExpected: true });
  await expectConsoleErrors(unavailable.watcher, async () => {
    await unavailable.page.locator('#num-l').fill('0.61');
    await unavailable.page.getByText('ブラウザーへの保存に失敗しました。CSSをコピーして保管してください。').waitFor();
  }, 'blocked storage save errors are captured as expected');
  ok((await unavailable.page.locator('#disp-oklch').textContent()).startsWith('0.610'), 'storage failure does not block editor controls');
  await unavailable.context.close();

  for (const watcher of watchers) {
    equal(watcher.unexpected.length, 0, `no unexpected browser errors: ${watcher.unexpected.join(' | ')}`);
  }
  console.log(`color-palette-browser (${engineName}): ${checks} checks passed`);
} catch (error) {
  console.error(`color-palette-browser (${engineName}) failed after ${checks} checks: ${error.stack || error}`);
  for (const watcher of watchers) if (watcher.unexpected.length) console.error(`Unexpected browser errors: ${watcher.unexpected.join(' | ')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
