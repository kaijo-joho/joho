#!/usr/bin/env node
/* Losslessly wrap a CFF/OpenType sfnt as WOFF1.  No font subsetting occurs. */
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';

const input = process.argv[2], output = process.argv[3];
if (!input || !output) throw new Error('Usage: node otf-to-woff1.mjs input.otf output.woff');
const sfnt = await readFile(input);
if (sfnt.length < 12 || sfnt.toString('ascii', 0, 4) !== 'OTTO') throw new Error('Only OpenType CFF (OTTO) fonts are accepted.');
const tableCount = sfnt.readUInt16BE(4), records = [];
if (sfnt.length < 12 + tableCount * 16) throw new Error('Truncated sfnt directory.');
for (let index = 0; index < tableCount; index++) {
  const at = 12 + index * 16, tag = sfnt.toString('ascii', at, at + 4), checksum = sfnt.readUInt32BE(at + 4), offset = sfnt.readUInt32BE(at + 8), length = sfnt.readUInt32BE(at + 12);
  if (offset + length > sfnt.length) throw new Error('Truncated sfnt table: ' + tag);
  const original = sfnt.subarray(offset, offset + length), compressed = deflateSync(original, { level: 9 }), stored = compressed.length < original.length ? compressed : original;
  if (!stored.equals(original) && !inflateSync(stored).equals(original)) throw new Error('Lossless WOFF verification failed: ' + tag);
  records.push({ tag, checksum, original, stored });
}
const align4 = value => (value + 3) & ~3, headerLength = 44 + tableCount * 20, totalSfntSize = 12 + tableCount * 16 + records.reduce((sum, record) => sum + align4(record.original.length), 0);
let size = headerLength; records.forEach(record => { record.offset = size; size += align4(record.stored.length); });
const woff = Buffer.alloc(size); woff.write('wOFF', 0, 'ascii'); sfnt.copy(woff, 4, 0, 4); woff.writeUInt32BE(size, 8); woff.writeUInt16BE(tableCount, 12); woff.writeUInt16BE(0, 14); woff.writeUInt32BE(totalSfntSize, 16); woff.writeUInt16BE(1, 20); woff.writeUInt16BE(0, 22);
records.forEach((record, index) => { const at = 44 + index * 20; woff.write(record.tag, at, 'ascii'); woff.writeUInt32BE(record.offset, at + 4); woff.writeUInt32BE(record.stored.length, at + 8); woff.writeUInt32BE(record.original.length, at + 12); woff.writeUInt32BE(record.checksum, at + 16); record.stored.copy(woff, record.offset); });
await writeFile(output, woff);
console.log(JSON.stringify({ input, output, sfntBytes: sfnt.length, woffBytes: woff.length, tables: tableCount }));
