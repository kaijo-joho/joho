// Private GAS fixtures are supplied by path; no answer data belongs in this repo.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || require('node:os').homedir() + '/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixture = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const inspect = process.argv.includes('--inspect');
const useWebkit = process.argv.includes('--webkit');
fs.mkdirSync(output, { recursive: true });
let runningBrowser;
(async () => {
  const browser = useWebkit ? await webkit.launch() : await chromium.launch({ channel: 'chrome', headless: true });
  runningBrowser = browser;
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const report = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const id of ['dr31', 'dr32', 'dr41', 'dr42']) {
    for (const paper of ['a4', 'b5']) {
      for (const answers of [false, true]) {
        await page.goto('file://' + path.join(fixture, id + '-released.html'));
        await page.locator('select[data-paper-size]').selectOption(paper);
        if (answers) await page.locator('[data-reveal-all]').click();
        await page.emulateMedia({ media: 'print' });
        const metrics = await page.evaluate(() => [...document.querySelectorAll('.ws-page')].map(p => {
          const r = p.getBoundingClientRect();
          const content = [...p.children].filter(el => !el.classList.contains('ws-scan-layer') && !el.classList.contains('ws-scan-mobile'));
          const end = Math.max(...content.map(el => el.getBoundingClientRect().bottom));
          const clipped = [...p.querySelectorAll('.ws-answer__value:not([hidden])')].filter(el => {
            if (!el.getClientRects().length) return false;
            const a = el.getBoundingClientRect(), b = el.parentElement.getBoundingClientRect();
            return a.right > b.right + 1 || a.bottom > b.bottom + 1 || a.left < b.left - 1 || a.top < b.top - 1;
          }).map(el => el.parentElement.dataset.answerId);
          const svg = [...p.querySelectorAll('.ws-scan-layer > svg')].filter(el => getComputedStyle(el).display !== 'none');
          return { side: p.dataset.scanSide, nameFields: [...(svg[0]?.querySelectorAll('text') || [])].filter(t => t.textContent === '氏名').length, widthMm: r.width * 25.4 / 96, heightMm: r.height * 25.4 / 96, usedMm: (end - r.top) * 25.4 / 96, spareMm: (r.bottom - end) * 25.4 / 96, contentSpareMm: (r.bottom - parseFloat(getComputedStyle(p).paddingBottom) - end) * 25.4 / 96, clipped, visibleHeaders: svg.length, marks: svg[0]?.querySelectorAll('circle').length, qrDescription: svg[0]?.querySelector('desc').textContent };
        }));
        const name = id + '-' + paper + '-' + (answers ? 'answers' : 'blank');
        report.push({ name, metrics });
        if (!useWebkit) await page.pdf({ path: path.join(output, name + '.pdf'), printBackground: true, preferCSSPageSize: true });
        if (!inspect) for (const m of metrics) {
          assert.ok(m.contentSpareMm >= -0.15, name + ' content overflow ' + m.contentSpareMm);
          assert.deepEqual(m.clipped, [], name + ' clipped answers');
          assert.equal(m.visibleHeaders, 1);
          assert.ok(['F', 'B'].includes(m.side));
          assert.equal(m.marks, m.side === 'F' ? 30 : 0);
          assert.equal(m.nameFields, m.side === 'F' ? 1 : 0);
          assert.ok(m.qrDescription.includes('INFO1|2026|' + id + '|' + m.side));
        }
        await page.emulateMedia({ media: 'screen' });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of ['locked', 'released', 'teacher']) {
      await page.goto('file://' + path.join(fixture, id + '-' + mode + '.html'));
      if (mode !== 'locked') await page.locator('[data-reveal-all]').click();
      const before = await page.locator('.is-revealed').count();
      for (const paper of ['b5', 'a4']) {
        await page.locator('select[data-paper-size]').selectOption(paper);
        assert.equal(await page.locator('.is-revealed').count(), before);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id + ' mobile overflow');
      }
      if (mode === 'locked') assert.equal(await page.locator('[data-reveal-all]').isVisible(), false);
      else {
        await page.locator('[data-hide-all]').click();
        const first = page.locator('[data-answer-id]').first();
        await first.focus(); await page.keyboard.press('Enter');
        assert.equal(await first.getAttribute('aria-pressed'), 'true');
        const explain = page.locator('[data-dialog-open]').first();
        await explain.click();
        await page.keyboard.press('Escape');
        assert.equal(await explain.evaluate(el => el === document.activeElement), true);
      }
    }
    // Narrow-screen printing must restore the same paper/header geometry.
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('.ws-scan-layer').first().isVisible());
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 1200, height: 900 });
  }
  assert.deepEqual(errors, []);
  await browser.close();
  fs.writeFileSync(path.join(output, useWebkit ? 'webkit-report.json' : 'chrome-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.map(r => ({ name: r.name, spare: r.metrics.map(m => +m.contentSpareMm.toFixed(2)), clipped: r.metrics.map(m => m.clipped) })), null, 2));
})().catch(async error => { console.error(error); await runningBrowser?.close(); process.exitCode = 1; });
