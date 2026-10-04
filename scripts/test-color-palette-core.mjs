import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const corePath = resolve(here, '../js/color-palette-core.js');
const Core = require(corePath);

function close(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

function deterministicRandom(seed) {
  let value = seed >>> 0;
  return function () {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

// Known sRGB values and round trips catch accidental extra color-space matrix application.
for (const [name, rgb] of Object.entries({
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255],
  cyan: [0, 255, 255], magenta: [255, 0, 255], yellow: [255, 255, 0], gray: [128, 128, 128], sample: [34, 83, 134]
})) {
  const lch = Core.rgbToOklch(...rgb);
  const roundTrip = Core.oklchToRgb(lch.l, lch.c, lch.h);
  assert.deepEqual(roundTrip, { r: rgb[0], g: rgb[1], b: rgb[2] }, `${name} round trip`);
}

for (let value = 0; value <= 255; value += 1) {
  const lch = Core.rgbToOklch(value, value, value);
  assert.equal(lch.c, 0, `neutral chroma at ${value}`);
  assert.equal(lch.h, 0, `neutral hue at ${value}`);
  assert.deepEqual(Core.oklchToRgb(lch.l, lch.c, lch.h), { r: value, g: value, b: value }, `neutral round trip at ${value}`);
}

const random = deterministicRandom(0xC01A7E);
for (let sample = 0; sample < 5000; sample += 1) {
  const rgb = [0, 0, 0].map(() => Math.floor(random() * 256));
  const lch = Core.rgbToOklch(...rgb);
  assert.deepEqual(Core.oklchToRgb(lch.l, lch.c, lch.h), { r: rgb[0], g: rgb[1], b: rgb[2] }, `RGB cube sample ${rgb}`);
}

const inGamut = Core.mapToSrgb(0.55, 0.08, 150);
assert.equal(inGamut.inGamut, true);
assert.equal(inGamut.mapped, false);
close(inGamut.c, 0.08);

const mapped = Core.mapToSrgb(0.7, 0.37, 30);
assert.equal(mapped.inGamut, false);
assert.equal(mapped.mapped, true);
close(mapped.l, 0.7);
close(mapped.h, 30);
assert.ok(mapped.c >= 0 && mapped.c < 0.37);
const mappedLinear = Core.oklchToLinearRgb(mapped.l, mapped.c, mapped.h);
for (const channel of Object.values(mappedLinear)) {
  assert.ok(channel >= -1e-7 && channel <= 1 + 1e-7, `mapped channel ${channel} in sRGB gamut`);
}
const justOutside = Core.oklchToLinearRgb(mapped.l, mapped.c + 1e-6, mapped.h);
assert.ok(Object.values(justOutside).some(channel => channel < -1e-7 || channel > 1 + 1e-7), 'mapped chroma is at the sRGB boundary');
assert.deepEqual(Core.oklchToRgb(0.7, 0.37, 30), { r: mapped.r, g: mapped.g, b: mapped.b });
assert.equal(Core.rgbToHex(mapped.r, mapped.g, mapped.b).length, 6);
assert.match(Core.rgbToHex(34, 83, 134), /^[0-9A-F]{6}$/);
assert.equal(Core.rgbToHex(34, 83, 134), '225386');
assert.deepEqual(Core.mapToSrgb(0.5, 0.08, 390), Core.mapToSrgb(0.5, 0.08, 30));

for (const [L, expectedRgb] of [[0, 0], [1, 255]]) {
  const endpoint = Core.mapToSrgb(L, 0.2, 210);
  assert.deepEqual([endpoint.r, endpoint.g, endpoint.b], [expectedRgb, expectedRgb, expectedRgb]);
  assert.equal(endpoint.l, L);
  assert.equal(endpoint.c, 0);
  assert.equal(endpoint.mapped, true);
}

for (const value of [0, 0.001, 0.01, 0.1, 0.435, 0.8, 0.98, 0.989, 0.99, 0.995, 1]) {
  const result = Core.generateLightnessSteps(value);
  assert.equal(result.steps.length, 10, `ten rows for L=${value}`);
  assert.equal(result.steps[result.baseIndex], value, `exact base L=${value}`);
  assert.equal(result.steps.filter(step => step === value).length, 1, `one base row for L=${value}`);
  assert.deepEqual(result.steps, [...result.steps].sort((a, b) => b - a), `descending rows for L=${value}`);
  assert.equal(new Set(result.steps).size, 10, `no duplicate rows for L=${value}`);
  assert.ok(result.steps.every(step => step >= 0 && step <= 1), `bounded rows for L=${value}`);
}
assert.equal(Core.generateLightnessSteps(1).baseIndex, 0);
assert.equal(Core.generateLightnessSteps(0).baseIndex, 9);

for (const invalid of [NaN, Infinity, -Infinity, '0.5', null]) {
  assert.throws(() => Core.rgbToOklch(invalid, 0, 0), TypeError);
  assert.throws(() => Core.oklchToLinearRgb(invalid, 0.1, 0), TypeError);
  assert.throws(() => Core.generateLightnessSteps(invalid), TypeError);
}
for (const [args, ErrorType] of [
  [[-1, 0, 0], RangeError], [[256, 0, 0], RangeError],
  [[0.5, -0.1, 0], RangeError], [[0.5, 0.1, NaN], TypeError],
  [[0.5, 0.1, Infinity], TypeError]
]) assert.throws(() => Core.oklchToLinearRgb(...args), ErrorType);
assert.throws(() => Core.rgbToHex(256, 0, 0), RangeError);
assert.throws(() => Core.rgbToHex(1.5, 0, 0), TypeError);
assert.throws(() => Core.generateLightnessSteps(1.01), RangeError);

// The browser path publishes the same API on globalThis when CommonJS is absent.
const source = await readFile(corePath, 'utf8');
const browserContext = vm.createContext({});
vm.runInContext(source, browserContext, { filename: corePath });
assert.equal(typeof browserContext.ColorPaletteCore.mapToSrgb, 'function');
assert.deepEqual(JSON.parse(JSON.stringify(browserContext.ColorPaletteCore.oklchToRgb(1, 0, 0))), { r: 255, g: 255, b: 255 });

console.log('color-palette-core: all checks passed');
