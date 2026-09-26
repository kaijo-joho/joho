#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export function load(configPath = path.join(ROOT, 'layout.json')) {
  const context = vm.createContext({});
  for (const name of ['vendor/qrcodegen.js', 'header.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, name), 'utf8'), context, { filename: name });
  return { api: context.WorksheetScanHeader, qr: context.qrcodegen, config: JSON.parse(fs.readFileSync(configPath, 'utf8')) };
}
export function generate(options, configPath) {
  const { api, qr, config } = load(configPath);
  const model = api.create(options, config, qr);
  return { ...model, svg: api.svg(model), headerSvg: api.svg(model, true) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error('Use --options JSON --out PREFIX, or --options JSON --format json');
    flags[argv[i].slice(2)] = argv[i + 1];
  }
  const model = generate(JSON.parse(flags.options || '{}'), flags.config);
  if (flags.format === 'json') process.stdout.write(JSON.stringify(model));
  else {
    if (!flags.out) throw new Error('--out is required');
    fs.mkdirSync(path.dirname(flags.out), { recursive: true });
    fs.writeFileSync(flags.out + '.svg', model.svg + '\n');
    fs.writeFileSync(flags.out + '.json', JSON.stringify(model.coordinates, null, 2) + '\n');
    console.log(flags.out + '.svg / .json');
  }
}
