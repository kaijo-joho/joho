#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, load } from './generate.mjs';

const destination = process.argv[2];
if (!destination) throw new Error('Usage: node build-gas.mjs OUTPUT_DIRECTORY');
const { config } = load();
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const script = '// Generated from joho/scripts/worksheet-scan-header. Edit the sources and rebuild.\n'
  + read('vendor/qrcodegen.js') + '\nvar WS_SCAN_CONFIG_ = ' + JSON.stringify(config) + ';\n' + read('header.js') + '\n' + read('gas-adapter.js');
let css = '';
for (const [paper, p] of Object.entries(config.papers)) {
  const bodyTop = (config.header.top + config.header.height + config.bodyGap) * p.scale;
  const bottom = (config.markers.inset + config.markers.size + config.markers.clearance) * p.scale;
  css += ':root[data-paper-size="' + paper + '"] { --ws-scan-body-top: ' + bodyTop + 'mm; --ws-scan-bottom: ' + bottom + 'mm; }\n';
}
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, '05_scan_header.js'), script);
fs.writeFileSync(path.join(destination, '24_scan_style.html'), '<style>\n' + css + read('gas-style.css') + '\n</style>\n');
console.log('Built 05_scan_header.js and 24_scan_style.html in ' + destination);
