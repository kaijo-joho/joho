#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  for (const file of ['vendor/paper-core-0.12.18.min.js', 'core.js', 'geometry.js', 'connectors.js']) await page.addScriptTag({ path: path.join(root, file) });
  const report = await page.evaluate(() => {
    const diamond = IlapoCore.makeShape('triangle', 0, 0, 100, 100);
    diamond.id = 'diamond';
    const ellipse = IlapoCore.makeShape('ellipse', 200, 0, 100, 100);
    ellipse.id = 'ellipse';
    ellipse.matrix = [0, 1, -1, 0, 300, 0];
    const c = IlapoConnectors.make({ x: 0, y: 0, objectId: 'diamond', port: 'right' }, { x: 0, y: 0, objectId: 'ellipse', port: 'left' });
    return IlapoConnectors.points(c, { objects: [diamond, ellipse, c] });
  });
  // A triangular path's rightward ray meets its sloped edge at x=75, not its bbox at x=100.
  assert.ok(Math.abs(report[0].x - 75) < .01 && Math.abs(report[0].y - 50) < .01, JSON.stringify(report));
  assert.ok(Number.isFinite(report.at(-1).x) && Number.isFinite(report.at(-1).y));
  console.log('connectors-browser.test.cjs: passed');
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
