// Browser regressions for the reworked teacher color-palette tool.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright JOHO_BROWSER=chrome|webkit node test-color-palette-browser.mjs [URL]
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = require(modulePath);
const Core = require(resolve(dirname(fileURLToPath(import.meta.url)), '../js/color-palette-core.js'));
const Model = require(resolve(dirname(fileURLToPath(import.meta.url)), '../js/color-palette-model.js'));
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

function attachWatcher(page) {
  const watcher = { errors: [], responses: [] };
  watchers.push(watcher);
  page.on('pageerror', error => watcher.errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') watcher.errors.push(`console: ${message.text()}`); });
  page.on('response', response => {
    if (response.url().startsWith(targetURL.origin) && response.status() >= 400) watcher.responses.push(`${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(targetURL.origin)) watcher.responses.push(`failed: ${request.url()} ${request.failure()?.errorText || ''}`);
  });
  return watcher;
}

async function prepareContext(context, { seed = null, blockedStorage = false, locksUnsupported = false } = {}) {
  await context.addInitScript(({ seedValue, blockStorage, removeLocks }) => {
    const nativeGet = Storage.prototype.getItem, nativeSet = Storage.prototype.setItem;
    window.__paletteStorageRead = key => nativeGet.call(localStorage, key);
    window.__paletteClipboard = { writes: [], mode: 'success', execResult: false, execCalls: 0 };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => {
        if (window.__paletteClipboard.mode === 'reject') throw new Error('synthetic clipboard rejection');
        window.__paletteClipboard.writes.push(String(text));
      }
    }});
    document.execCommand = command => {
      if (command === 'copy') window.__paletteClipboard.execCalls += 1;
      return Boolean(window.__paletteClipboard.execResult);
    };
    if (seedValue !== null) nativeSet.call(localStorage, 'oklch-palette-v1', seedValue);
    if (blockStorage) {
      Storage.prototype.getItem = () => { throw new DOMException('synthetic storage denied', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('synthetic storage denied', 'SecurityError'); };
    }
    if (removeLocks) Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  }, { seedValue: seed, blockStorage: blockedStorage, removeLocks: locksUnsupported });
}

async function openPage(context, { viewport = { width: 1280, height: 1000 }, seed = null, blockedStorage = false, locksUnsupported = false } = {}) {
  await prepareContext(context, { seed, blockedStorage, locksUnsupported });
  const page = await context.newPage();
  const watcher = attachWatcher(page);
  page.setDefaultTimeout(12000);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === targetURL.origin ? route.continue() : route.abort();
  });
  await page.setViewportSize(viewport);
  await page.goto(targetURL.href, { waitUntil: 'domcontentloaded' });
  await page.locator('#workspace:not([disabled])').waitFor();
  await page.locator('#main-grid .grid-cell').first().waitFor();
  return { page, watcher };
}

async function newPage({ viewport, seed, blockedStorage, locksUnsupported } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 }, acceptDownloads: true, colorScheme: 'light' });
  const result = await openPage(context, { viewport, seed, blockedStorage, locksUnsupported });
  return { ...result, context };
}

async function stored(page) {
  const raw = await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1'));
  return raw === null ? null : JSON.parse(raw);
}

async function waitStored(page, predicate, message, vars = {}) {
  await page.waitForFunction(({ predicateText, captured }) => {
    try {
      const value = JSON.parse(window.__paletteStorageRead('oklch-palette-v1'));
      return Function('value', 'captured', `with (captured) { return (${predicateText})(value); }`)(value, captured);
    } catch (_) { return false; }
  }, { predicateText: predicate.toString(), captured: vars }, { timeout: 12000 });
  checks += 1;
}

async function waitForHex(page, value) {
  await page.waitForFunction(expected => document.querySelector('#disp-hex').textContent.toUpperCase() === expected.toUpperCase(), value);
  checks += 1;
}

async function setHex(page, value) {
  if (await page.locator('#panel-rgb').evaluate(el => el.hidden)) await page.locator('#sub-tab-rgb').click();
  await page.locator('#input-hex').fill(value);
  await waitForHex(page, value.startsWith('#') ? value : `#${value}`);
}

async function setOklch(page, { l, c, h }) {
  if (await page.locator('#panel-oklch').evaluate(el => el.hidden)) await page.locator('#sub-tab-oklch').click();
  await page.locator('#num-l').fill(String(l));
  await page.locator('#num-c').fill(String(c));
  await page.locator('#num-h').fill(String(h));
}

function expectedCssValue(color, format) {
  if (format === 'oklch') return `oklch(${color.l.toFixed(8)} ${color.c.toFixed(8)} ${color.h.toFixed(6)})`;
  if (format === 'rgb') return `rgb(${color.r}, ${color.g}, ${color.b})`;
  if (format === 'hex') return `#${Core.rgbToHex(color.r, color.g, color.b)}`;
  const values = format === 'hsl' ? Model.rgbToHsl(color.r,color.g,color.b) : Model.rgbToHsv(color.r,color.g,color.b);
  return `${format}(${values.h.toFixed(3)}, ${values.s.toFixed(3)}%, ${(values.l ?? values.v).toFixed(3)}%)`;
}

async function cssBaseValue(page) {
  await page.locator('#btn-css-grid').click();
  await page.waitForFunction(() => document.querySelector('#css-modal').open);
  const css = await page.locator('#css-output').inputValue();
  const line = css.split('\n').find(value => value.includes('/* Base */'));
  ok(Boolean(line), 'grid CSS contains a base color variable');
  return { css, value: line.match(/:\s*(.+);/)[1] };
}

async function nativeColorPixel(page, value) {
  return page.evaluate(input => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,1,1); ctx.fillStyle = input; ctx.fillRect(0,0,1,1);
    return { supported: CSS.supports('color', input), rgba: Array.from(ctx.getImageData(0,0,1,1).data) };
  }, value);
}

async function closeDialog(page) { if (await page.locator('#css-modal').evaluate(el => el.open)) await page.keyboard.press('Escape'); }

async function checkResponsive(page, width, expectedOverflow = false) {
  await page.setViewportSize({ width, height: 900 });
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    gridClient: document.querySelector('.grid-scroll').clientWidth,
    gridScroll: document.querySelector('.grid-scroll').scrollWidth,
    gridTop: document.querySelector('#grid-section').getBoundingClientRect().top + scrollY
  }));
  ok(layout.document <= layout.viewport + 1, `${width}px page has no horizontal overflow (${layout.document}/${layout.viewport})`);
  if (expectedOverflow) ok(layout.gridScroll > layout.gridClient, `${width}px palette grid scrolls inside its own container`);
  return layout;
}

try {
  // Requested LCH, native CSS output and the browser preview must represent the same sRGB color.
  {
    const { context, page, watcher } = await newPage();
    await setOklch(page, { l: 0.62, c: 0.36, h: 250 });
    const requested = { l: 0.62, c: 0.36, h: 250 }, effective = Core.mapToSrgb(requested.l, requested.c, requested.h);
    await waitStored(page, doc => Math.abs(doc.state.l - 0.62) < 1e-10 && Math.abs(doc.state.c - 0.36) < 1e-10, 'requested LCH persists');
    equal(await page.locator('#disp-hex').textContent(), `#${Core.rgbToHex(effective.r,effective.g,effective.b)}`, 'summary reports effective mapped RGB');
    const preview = await page.locator('#base-swatch').evaluate(el => getComputedStyle(el).backgroundColor);
    matches(preview, new RegExp(`${effective.r},\\s*${effective.g},\\s*${effective.b}`), 'base preview uses mapped sRGB');
    for (const format of ['oklch','hex','rgb','hsl','hsv']) {
      await page.locator('#format-select').selectOption(format);
      const { value } = await cssBaseValue(page);
      const cssFormat = format === 'hsv' ? 'hex' : format;
      equal(value, expectedCssValue(effective, cssFormat), `${format} CSS export uses mapped sRGB`);
      if (cssFormat !== 'hsv') {
        const pixel = await nativeColorPixel(page, value);
        ok(pixel.supported, `${format} export is accepted as a native CSS color`);
        for (let channel = 0; channel < 3; channel += 1) close(pixel.rgba[channel], [effective.r,effective.g,effective.b][channel], 1, `${format} exported channel ${channel} matches preview`);
      }
      if (format === 'hsv') matches((await page.locator('#css-output').inputValue()), /HSVはCSS色関数ではないため、HEXで出力します/,'HSV export explains CSS fallback');
      await closeDialog(page);
    }
    await checkResponsive(page, 1280);
    await checkResponsive(page, 720, true);
    const mobile = await checkResponsive(page, 390, true);
    ok(mobile.gridTop < 1000, 'grid remains reachable near the top on narrow screens');
    equal(await page.locator('#main-grid .grid-cell[tabindex="0"]').count(), 1, 'grid exposes one roving keyboard tab stop');
    await page.locator('#main-grid .grid-cell[tabindex="0"]').focus();
    const startIndex = Number(await page.locator('#main-grid .grid-cell:focus').getAttribute('data-index'));
    await page.keyboard.press('ArrowRight');
    const nextIndex = Number(await page.locator('#main-grid .grid-cell:focus').getAttribute('data-index'));
    equal(nextIndex, Math.min(startIndex + 1, 16 * 10 - 1), 'arrow key moves focus through the grid');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#selected-label').textContent.includes('選択色'));
    equal((await page.locator('#selected-label').textContent()).includes('選択色'), true, 'keyboard activation selects the grid color');
    await page.waitForFunction(() => window.__paletteClipboard.writes.length > 0);
    ok(await page.evaluate(() => window.__paletteClipboard.writes.length > 0), 'keyboard activation copies the selected grid color');
    await page.locator('#btn-css-grid').click();
    ok(await page.locator('#css-modal').evaluate(el => el.open), 'CSS opens in a native dialog');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#css-modal').open);
    equal(await page.locator('#btn-css-grid').evaluate(el => document.activeElement === el), true, `Escape restores focus to CSS trigger (active=${await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)})`);
    await page.locator('#main-tab-stock').click();
    await page.locator('#btn-css-stock').click();
    await page.evaluate(() => { window.__paletteClipboard.mode = 'reject'; window.__paletteClipboard.execResult = false; });
    await page.locator('#btn-copy-css').click();
    await page.locator('#css-copy-status').getByText('コピーできませんでした。').waitFor();
    ok((await page.evaluate(() => window.__paletteClipboard.execCalls)) > 0, 'clipboard failure tries the legacy copy path');
    await closeDialog(page);
    equal(watcher.errors.length, 0, `main browser errors: ${watcher.errors.join('; ')}`);
    equal(watcher.responses.length, 0, `main local resource errors: ${watcher.responses.join('; ')}`);
    await context.close();
  }

  // Invalid and incomplete edits stay visibly invalid and do not replace the saved color.
  {
    const { context, page, watcher } = await newPage();
    const before = await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1'));
    await page.locator('#sub-tab-rgb').click();
    await page.locator('#num-r').fill('127.5');
    equal(await page.locator('#num-r').getAttribute('aria-invalid'), 'true', 'fractional RGB is marked invalid');
    equal(await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1')), before, 'fractional RGB leaves storage unchanged');
    await page.locator('#num-r').blur();
    equal(await page.locator('#num-r').getAttribute('aria-invalid'), null, 'blur restores a valid RGB input');
    await page.locator('#sub-tab-oklch').click();
    await page.locator('#num-c').fill('');
    equal(await page.locator('#num-c').getAttribute('aria-invalid'), 'true', 'empty chroma is marked invalid');
    equal(await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1')), before, 'empty chroma leaves storage unchanged');
    await page.locator('#num-c').blur();
    await page.locator('#input-count').fill('2.5');
    equal(await page.locator('#input-count').getAttribute('aria-invalid'), 'true', 'fractional grid count is marked invalid');
    equal(await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1')), before, 'invalid count leaves storage unchanged');
    await page.locator('#sub-tab-rgb').click();
    await page.locator('#input-hex').fill('#12zz00');
    equal(await page.locator('#input-hex').getAttribute('aria-invalid'), 'true', 'invalid HEX is marked invalid');
    equal(await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1')), before, 'invalid HEX leaves storage unchanged');
    await page.locator('#input-hex').blur();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#workspace:not([disabled])').waitFor();
    equal(await page.locator('#disp-hex').textContent(), '#225386', 'reload retains last valid color after invalid edits');
    equal(watcher.errors.length, 0, `invalid-input browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }

  // HSL/HSV latent hue and saturation survive powerless gray, black and white axes.
  {
    const { context, page, watcher } = await newPage();
    await setHex(page, '#808080');
    await page.locator('#sub-tab-hsl').click();
    await page.locator('#num-hsl-h').fill('240');
    await page.locator('#num-hsl-s').fill('0');
    await waitStored(page, doc => Math.abs(doc.state.hsl.h - 240) < 0.01 && doc.state.hsl.s === 0, 'HSL gray stores a powerless hue');
    const gray = await page.evaluate(() => JSON.parse(window.__paletteStorageRead('oklch-palette-v1')));
    close(gray.state.hsl.h, 240, 0.01, 'gray retains the entered HSL hue');
    await page.locator('#num-hsl-s').fill('100');
    await waitStored(page, doc => doc.state.r < 3 && doc.state.g < 3 && doc.state.b > 250, 'latent HSL hue returns to blue when saturation rises');
    ok((await page.locator('#disp-rgb').textContent()).split(',').map(Number)[2] > 250, 'HSL gray hue becomes visible after saturation increases');
    await setHex(page, '#808080');
    await page.locator('#sub-tab-hsl').click();
    await page.locator('#num-hsl-h').fill('240');
    await page.waitForFunction(() => JSON.parse(window.__paletteStorageRead('oklch-palette-v1')).state.hsl.h === 240);
    await page.locator('#btn-show-hsv').click();
    await page.locator('#num-hsv-s').fill('100');
    await waitStored(page, doc => doc.state.hsv.h === 240 && doc.state.b > 120 && doc.state.r < 3 && doc.state.g < 3, 'HSL achromatic hue carries into HSV and restores blue');
    await setHex(page, '#000000');
    await page.locator('#sub-tab-hsl').click();
    await page.locator('#btn-show-hsv').click();
    await page.locator('#num-hsv-h').fill('210');
    await waitStored(page, doc => Math.abs(doc.state.hsv.h - 210) < 0.01, 'black HSV hue edit saves');
    await page.locator('#num-hsv-s').fill('60');
    await waitStored(page, doc => Math.abs(doc.state.hsv.s - 60) < 0.01, 'black HSV saturation edit saves');
    await page.locator('#num-hsv-v').fill('0');
    await waitStored(page, doc => doc.state.hsv.v === 0, 'black HSV value edit saves');
    let black = await page.evaluate(() => JSON.parse(window.__paletteStorageRead('oklch-palette-v1')));
    close(black.state.hsv.h, 210, 0.01, 'black retains HSV hue');
    close(black.state.hsv.s, 60, 0.01, 'black retains HSV saturation');
    await page.locator('#num-hsv-v').fill('100');
    await waitStored(page, doc => doc.state.b > doc.state.g && doc.state.g > doc.state.r, 'latent HSV hue and saturation return to blue when value rises');
    equal(watcher.errors.length, 0, `latent component browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }

  // Legacy migration and malformed-storage recovery are isolated in fresh contexts.
  {
    const legacy = JSON.stringify({
      state: { l: 0.54, c: 0.1, h: 190, count: 9, outputFormat: 'hex' },
      pinnedColors: [
        { l: 0.6, c: 0.1, h: 20, name: 'Primary / CTA' },
        { l: 0.5, c: 0.08, h: 220, name: 'primary:cta' }
      ]
    });
    const { context, page, watcher } = await newPage({ seed: legacy });
    await waitStored(page, doc => doc.schemaVersion === 2 && doc.pinnedColors.length === 2, 'legacy palette migrates');
    const migrated = await stored(page);
    deepEqual(migrated.pinnedColors.map(pin => pin.id), ['legacy-1','legacy-2'], 'legacy IDs are deterministic');
    deepEqual(migrated.pinnedColors.map(pin => pin.cssName), ['primary-cta','primary-cta-2'], 'legacy CSS aliases match old naming');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#workspace:not([disabled])').waitFor();
    deepEqual((await stored(page)).pinnedColors.map(pin => pin.id), ['legacy-1','legacy-2'], 'migration is stable after reload');
    equal(watcher.errors.length, 0, `migration browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }
  {
    const { context, page, watcher } = await newPage({ seed: '{broken' });
    await page.waitForFunction(() => window.__paletteStorageRead('oklch-palette-v1-recovery') === '{broken');
    const recovered = await stored(page);
    equal(recovered.schemaVersion, 2, 'malformed storage recovers to a valid document');
    equal(await page.locator('#storage-warning').isVisible(), false, 'recovered malformed data leaves editor usable');
    equal(watcher.errors.length, 0, `malformed recovery browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }

  // Blocked storage and missing Web Locks take a usable, explicit volatile path.
  for (const mode of ['storage-denied','locks-unsupported']) {
    const setup = mode === 'storage-denied' ? { blockedStorage: true } : { locksUnsupported: true };
    const { context, page, watcher } = await newPage(setup);
    const original = await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1'));
    ok(await page.locator('#storage-warning').isVisible(), `${mode} displays a persistence warning`);
    await page.locator('#btn-inc').click();
    equal(await page.locator('#input-count').inputValue(), '17', `${mode} still allows editing in memory`);
    equal(await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1')), original, `${mode} does not claim a saved state`);
    ok(await page.locator('#btn-save-json').isEnabled(), `${mode} retains JSON backup action`);
    equal(watcher.errors.length, 0, `${mode} browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }

  // Permanent CSS aliases survive human-name edits and deletion; undo restores the same stock identity.
  {
    const { context, page, watcher } = await newPage();
    await page.locator('#btn-stock-base').click();
    await waitStored(page, doc => doc.pinnedColors.length === 1, 'first stock is saved');
    const first = (await stored(page)).pinnedColors[0];
    await page.locator('#main-tab-stock').click();
    let card = page.locator(`.stock-card[data-id="${first.id}"]`);
    await card.locator('[data-field="cssName"]').fill('primary');
    await card.locator('[data-field="cssName"]').press('Tab');
    await waitStored(page, doc => doc.pinnedColors[0]?.cssName === 'primary', 'custom CSS alias saves');
    await page.locator('#main-tab-editor').click();
    await setHex(page, '#C04020');
    await page.locator('#btn-stock-base').click();
    await waitStored(page, doc => doc.pinnedColors.length === 2, 'second stock is saved');
    const second = (await stored(page)).pinnedColors.find(pin => pin.id !== first.id);
    await page.locator('#main-tab-stock').click();
    card = page.locator(`.stock-card[data-id="${second.id}"]`);
    await card.locator('[data-field="cssName"]').fill('secondary');
    await card.locator('[data-field="cssName"]').press('Tab');
    await waitStored(page, doc => doc.pinnedColors.find(pin => pin.id === id)?.cssName === 'secondary', 'second stable alias saves', { id: second.id });
    await card.locator('[data-field="cssName"]').fill('primary');
    await card.locator('[data-field="cssName"]').press('Tab');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('CSS名'));
    equal(await card.locator('[data-field="cssName"]').inputValue(), 'secondary', 'a live CSS alias cannot be duplicated');
    card = page.locator(`.stock-card[data-id="${first.id}"]`);
    await card.locator('[data-field="remove"]').click();
    await waitStored(page, doc => doc.pinnedColors.length === 1, 'first stock is deleted');
    card = page.locator(`.stock-card[data-id="${second.id}"]`);
    await page.locator('#btn-undo').click();
    await waitStored(page, doc => doc.pinnedColors.length === 2, 'undo restores the deleted stock');
    equal((await stored(page)).pinnedColors.find(pin => pin.id === first.id).cssName, 'primary', 'undo restores stock identity and CSS alias');
    await page.locator('#btn-redo').click();
    await waitStored(page, doc => doc.pinnedColors.length === 1, 'redo removes the restored stock');
    await card.locator('[data-field="name"]').fill('<img src=x onerror=alert(1)>');
    await card.locator('[data-field="name"]').press('Tab');
    await waitStored(page, doc => doc.pinnedColors[0]?.name.startsWith('<img'), 'hostile display name is stored as text');
    equal(await page.locator('#stock-container img').count(), 0, 'stock name cannot inject markup');
    equal(await card.locator('[data-field="name"]').inputValue(), '<img src=x onerror=alert(1)>', 'hostile display name remains editable text');
    equal(await card.locator('[data-field="cssName"]').inputValue(), 'secondary', 'human rename leaves CSS alias unchanged');
    await page.locator('#btn-css-stock').click();
    matches(await page.locator('#css-output').inputValue(), /--secondary:/, 'stock CSS retains permanent alias');
    ok(!/--primary:/.test(await page.locator('#css-output').inputValue()), 'deleted alias is absent from stock export');
    await closeDialog(page);
    equal(watcher.errors.length, 0, `stock browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }

  // JSON download/import, strict atomic rejection, and Undo/Redo around replacement.
  {
    const { context, page, watcher } = await newPage();
    const before = await stored(page);
    await page.locator('#input-count').fill('12');
    await waitStored(page, doc => doc.state.count === 12, 'count edit saves');
    await page.locator('#btn-undo').click();
    await waitStored(page, doc => doc.state.count === 16, 'Undo restores count');
    await page.locator('#btn-redo').click();
    await waitStored(page, doc => doc.state.count === 12, 'Redo reapplies count');
    const downloadWait = page.waitForEvent('download');
    await page.locator('#btn-save-json').click();
    const download = await downloadWait;
    matches(download.suggestedFilename(), /^oklch-palette-\d{4}-\d{2}-\d{2}\.json$/, 'JSON export receives a date-based filename');
    const downloaded = JSON.parse(await readFile(await download.path(), 'utf8'));
    equal(downloaded.schemaVersion, 2, 'JSON export uses the current schema');
    equal(downloaded.state.count, 12, 'JSON export contains the current palette');
    const importDoc = structuredClone(downloaded); importDoc.state.count = 18;
    await page.locator('#json-file').setInputFiles({ name: 'palette.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importDoc)) });
    await waitStored(page, doc => doc.state.count === 18, 'valid JSON replaces the palette');
    await page.locator('#btn-undo').click();
    await waitStored(page, doc => doc.state.count === 12, 'Undo restores the pre-import document');
    await page.locator('#btn-redo').click();
    await waitStored(page, doc => doc.state.count === 18, 'Redo restores imported document');
    const beforeInvalid = await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1'));
    const invalidDoc = structuredClone(importDoc); invalidDoc.state.count = 2;
    await page.locator('#json-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalidDoc)) });
    await page.getByText(/読み込めませんでした/).waitFor();
    equal(await page.evaluate(() => window.__paletteStorageRead('oklch-palette-v1')), beforeInvalid, 'invalid JSON import leaves stored document untouched');
    equal((await stored(page)).state.count, 18, 'invalid JSON import leaves live document untouched');
    equal(watcher.errors.length, 0, `JSON browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }

  // Cross-tab commands serialize against the latest document; stale Undo cannot erase remote edits.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true, colorScheme: 'light' });
    const { page: pageA, watcher: watchA } = await openPage(context);
    const { page: pageB, watcher: watchB } = await openPage(context);
    const hasLocks = await pageA.evaluate(() => Boolean(navigator.locks?.request));
    if (hasLocks) {
      const cellsA = pageA.locator('#main-grid .grid-cell');
      const cellsB = pageB.locator('#main-grid .grid-cell');
      await cellsA.nth(2).click(); await cellsB.nth(7).click();
      await Promise.all([pageA.locator('#btn-stock-selected').click(), pageB.locator('#btn-stock-selected').click()]);
      await waitStored(pageA, doc => doc.pinnedColors.length === 2, 'simultaneous tab additions preserve both stocks');
      await pageB.waitForFunction(() => document.querySelectorAll('.stock-card').length === 2);
      await pageA.locator('#input-count').fill('14');
      await waitStored(pageA, doc => doc.state.count === 14 && doc.pinnedColors.length === 2, 'tab state edit preserves remote stock');
      await pageB.waitForFunction(() => JSON.parse(window.__paletteStorageRead('oklch-palette-v1')).state.count === 14);

      await pageA.locator('#main-grid .grid-cell').nth(4).click();
      await pageA.locator('#btn-stock-selected').click();
      await waitStored(pageA, doc => doc.pinnedColors.length === 3, 'local stock operation enters Undo history');
      const target = (await stored(pageA)).pinnedColors[2];
      await pageB.locator('#main-tab-stock').click();
      await pageB.waitForFunction(id => Boolean(document.querySelector(`.stock-card[data-id="${id}"]`)), target.id);
      await pageB.locator(`.stock-card[data-id="${target.id}"] input[data-field="name"]`).fill('remote-change');
      await pageB.locator(`.stock-card[data-id="${target.id}"] input[data-field="name"]`).press('Tab');
      await waitStored(pageB, doc => doc.pinnedColors.find(pin => pin.id === id)?.name === 'remote-change', 'remote rename saves', { id: target.id });
      await pageA.locator('#main-tab-stock').click();
      await pageA.waitForFunction(id => document.querySelector(`.stock-card[data-id="${id}"] input[data-field="name"]`)?.value === 'remote-change', target.id);
      await pageA.locator('#btn-undo').click();
      await pageA.getByText('別タブで対象が変更されたため').waitFor();
      const afterGuard = (await stored(pageA)).pinnedColors.find(pin => pin.id === target.id);
      equal(afterGuard.name, 'remote-change', 'guarded Undo does not erase a remote rename');
      equal((await stored(pageA)).pinnedColors.length, 3, 'guarded Undo keeps remote stock');

      // A remote H change between two edits in one local gesture must split the Undo group.
      await pageA.locator('#main-tab-editor').click();
      const lField = pageA.locator('#num-l');
      await pageA.locator('#sub-tab-oklch').click();
      const initialL = (await stored(pageA)).state.l;
      const firstL = initialL > 0.7 ? 0.61 : 0.71;
      const secondL = firstL + 0.03;
      await lField.focus(); await lField.fill(String(firstL));
      await waitStored(pageA, doc => Math.abs(doc.state.l - expectedL) < 1e-10, 'first local gesture edit saves', { expectedL: firstL });
      await pageB.locator('#main-tab-editor').click();
      await pageB.locator('#num-h').fill('210');
      await waitStored(pageB, doc => Math.abs(doc.state.h - 210) < 1e-8, 'remote hue edit saves');
      await pageA.waitForFunction(() => Math.abs(JSON.parse(window.__paletteStorageRead('oklch-palette-v1')).state.h - 210) < 1e-8);
      await lField.fill(String(secondL));
      await waitStored(pageA, doc => Math.abs(doc.state.l - expectedL) < 1e-10 && Math.abs(doc.state.h - 210) < 1e-8, 'continued local gesture preserves remote hue', { expectedL: secondL });
      await pageA.locator('#btn-undo').click();
      await waitStored(pageA, doc => Math.abs(doc.state.l - expectedL) < 1e-10 && Math.abs(doc.state.h - 210) < 1e-8, 'Undo reverts local edit without erasing remote hue', { expectedL: firstL });
    } else {
      ok(await pageA.locator('#storage-warning').isVisible(), 'missing Web Locks disables cross-tab persistence safely');
    }
    equal(watchA.errors.length, 0, `cross-tab A browser errors: ${watchA.errors.join('; ')}`);
    equal(watchB.errors.length, 0, `cross-tab B browser errors: ${watchB.errors.join('; ')}`);
    await context.close();
  }

  // The app theme changes the work surface but leaves the comparison specimen colors untouched.
  {
    const { context, page, watcher } = await newPage();
    await page.locator('#comparison-fg').fill('#000000');
    await page.locator('#comparison-fg').press('Tab');
    await page.locator('#comparison-bg').fill('#FFFFFF');
    await page.locator('#comparison-bg').press('Tab');
    await waitStored(page, doc => doc.state.comparisonFG === '#000000' && doc.state.comparisonBG === '#FFFFFF', 'comparison colors save');
    const sampleBefore = await page.locator('#comparison-preview').evaluate(el => ({ fg:getComputedStyle(el).color, bg:getComputedStyle(el).backgroundColor }));
    const lightPage = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
    await page.locator('#theme-toggle').click(); await page.locator('#theme-menu [data-theme-mode="dark"]').click();
    await waitStored(page, doc => doc.state.themeMode === 'dark', 'dark theme preference saves');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    equal(await page.locator('html').getAttribute('data-theme'), 'dark', 'dark theme applies to the full app');
    const darkPage = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
    ok(darkPage !== lightPage, 'dark theme changes the application surface');
    deepEqual(await page.locator('#comparison-preview').evaluate(el => ({ fg:getComputedStyle(el).color, bg:getComputedStyle(el).backgroundColor })), sampleBefore, 'theme changes do not recolor comparison sample');
    await page.locator('#theme-toggle').click(); await page.locator('#theme-menu [data-theme-mode="auto"]').click();
    await waitStored(page, doc => doc.state.themeMode === 'auto', 'automatic theme preference saves');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    equal(await page.locator('html').getAttribute('data-theme'), 'dark', 'automatic theme follows dark system preference');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    equal(await page.locator('html').getAttribute('data-theme'), 'light', 'automatic theme follows light system preference');
    const ratio = await page.locator('#contrast-ratio').textContent();
    matches(ratio, /21(?:\.00|\.0000)?\s*:\s*1/, 'black on white reports the full 21:1 contrast ratio');
    equal(watcher.errors.length, 0, `theme browser errors: ${watcher.errors.join('; ')}`);
    await context.close();
  }

  console.log(`color-palette-browser (${engineName}): ${checks} checks passed`);
} finally {
  for (const watcher of watchers) {
    if (watcher.errors.length || watcher.responses.length) {
      console.error(JSON.stringify({ errors: watcher.errors, responses: watcher.responses }, null, 2));
    }
  }
  await browser.close();
}
