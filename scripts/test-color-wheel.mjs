import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('img/color-wheel.svg', root), 'utf8');
const circles = [...svg.matchAll(/<g data-color="(#[0-9A-F]{6})">\s*<circle cx="(\d+)" cy="(\d+)" r="146" fill="(#[0-9A-F]{6})"[^>]*\/>\s*<text[^>]*>([^<]+)<\/text>\s*<text[^>]*>(#[0-9A-F]{6})<\/text>/g)];
assert.equal(circles.length, 12, 'twelve labeled hue samples');
const bytes = await readFile(new URL('img/color-wheel.png', root));
assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
const chunks = []; let width, height, channels;
for (let offset = 8; offset < bytes.length;) {
  const length = bytes.readUInt32BE(offset);
  const type = bytes.subarray(offset + 4, offset + 8).toString();
  const data = bytes.subarray(offset + 8, offset + 8 + length);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    assert.equal(data[8], 8, '8-bit channel values');
    assert.ok([2, 6].includes(data[9]), 'RGB or RGBA image');
    assert.equal(data[12], 0, 'non-interlaced image');
    channels = data[9] === 6 ? 4 : 3;
  }
  if (type === 'IDAT') chunks.push(data);
  offset += 12 + length;
}
assert.equal(width, 1578); assert.equal(height, 1432);
const raw = inflateSync(Buffer.concat(chunks));
const stride = width * channels;
assert.equal(raw.length, height * (stride + 1));
const pixels = Buffer.alloc(height * stride);
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  assert.ok(filter <= 4);
  for (let x = 0; x < stride; x++) {
    const at = y * stride + x;
    const left = x >= channels ? pixels[at - channels] : 0;
    const above = y ? pixels[at - stride] : 0;
    const upperLeft = y && x >= channels ? pixels[at - stride - channels] : 0;
    const predictors = [0, left, above, Math.floor((left + above) / 2), paeth(left, above, upperLeft)];
    pixels[at] = (raw[y * (stride + 1) + 1 + x] + predictors[filter]) & 255;
  }
}
for (const [, code, cx, cy, fill, name, label] of circles) {
  assert.equal(fill, code, `${name}: paint matches code`);
  assert.equal(label, code, `${name}: printed code matches paint`);
  for (const dx of [-35, 0, 35]) {
    const at = (Number(cy) + 88) * stride + (Number(cx) + dx) * channels;
    const actual = `#${pixels.subarray(at, at + 3).toString('hex').toUpperCase()}`;
    assert.equal(actual, code, `${name}: interior PNG pixel matches printed code`);
    if (channels === 4) assert.equal(pixels[at + 3], 255, `${name}: opaque sample`);
  }
}
assert.match(await readFile(new URL('html32.html', root), 'utf8'), /img\/color-wheel\.png/, 'HTML教材は従来の共通画像を維持');
const colorPage = await readFile(new URL('color.html', root), 'utf8');
assert.doesNotMatch(colorPage, /img\/color-wheel\.png/, '配色ページのRGB環はHTML/CSSで描画');
const nodes = [...colorPage.matchAll(/class="color-wheel__node" data-color="(#[A-F0-9]{6})" style="--angle:(\d+)deg;--swatch:(#[A-F0-9]{6});--ink:#[A-F0-9]{6}"><span>[^<]+<\/span><small>(#[A-F0-9]{6})<\/small>/g)];
assert.equal(nodes.length, 12, 'HTMLのRGB環も12色');
nodes.forEach(([, code, angle, fill, label], index) => {
  assert.equal(code, circles[index][1], '既存の色指定を保持');
  assert.equal(angle, String(index * 30), '規則的な30度間隔');
  assert.equal(fill, label, 'HTMLでも塗りとHEX表示が一致');
});
console.log('Color wheel: 12 HTML/CSS samples preserve the existing HEX colors; 36 original PNG pixels match; html32 image reference preserved.');
