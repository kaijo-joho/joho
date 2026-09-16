// logo.svg is the editable source; icon.svg is its standalone reversed-color export.
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../logo.svg', import.meta.url), 'utf8');
const match = source.match(/^<svg\b[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>\s*$/);
if (!match || match[1] !== '-7 -12 126 126') throw new Error('Unexpected logo.svg structure');
const colors = { '#00548a': '#ffffff', '#2e80e8': '#9ad8ff', '#ffffff': '#00548a' };
const artwork = match[2].replace(/\s*<(title|desc)>[\s\S]*?<\/\1>/g, '')
  .replace(/#00548a|#2e80e8|#ffffff/g, color => colors[color]).trim();
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <title>イラストスライド illustSlide</title>
  <!-- Generated from logo.svg by scripts/generate-icon.mjs. -->
  <rect x="2" y="2" width="60" height="60" rx="13" fill="#00548a"/>
  <svg x="4" y="3" width="56" height="58" viewBox="${match[1]}">
    ${artwork}
  </svg>
</svg>
`;
const destination = new URL('../icon.svg', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== icon) throw new Error('Regenerate icon.svg with scripts/generate-icon.mjs');
  console.log('illustSlide icon matches logo.svg');
} else {
  await writeFile(destination, icon);
  console.log('Generated illustSlide icon.svg');
}
