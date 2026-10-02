import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { expect } = require(`${process.env.PLAYWRIGHT_MODULE || 'playwright'}/test`);
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8865/';
const output = (process.env.JOHO_TEST_SCREENSHOTS || new URL('../output/is-review/screenshots/', import.meta.url).pathname).replace(/\/?$/, '/');
await mkdir(output, { recursive: true });
const results = [];
const ids = ['is21','is22','is23'];
async function go(page, number) {
  await page.evaluate(n => { location.hash = `#headline_${n}`; }, number);
  await expect(page.locator(`#headline_${number}`)).toBeVisible();
}
async function fits(page, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bounds = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.lesson-slide')].find(el => !el.hidden);
    return { width: innerWidth, page: document.documentElement.scrollWidth, slide: s.scrollWidth, available: s.clientWidth };
  });
  assert.ok(bounds.page <= bounds.width + 2, `${label}: page overflow ${JSON.stringify(bounds)}`);
  assert.ok(bounds.slide <= bounds.available + 2, `${label}: slide overflow ${JSON.stringify(bounds)}`);
}
for (const name of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = await (name === 'webkit' ? webkit.launch() : chromium.launch({channel:'chrome'}));
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    // Existing common analytics/webfonts are not needed by the candidate tests.
    await context.route('https://**/*', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    for (const id of ids) {
      await page.goto(`${base}${id}.html`);
      await page.locator('body.lesson-slide-ready').waitFor();
      await expect(page.locator('#page_header')).toContainText(id === 'is21' ? '2-1.' : id === 'is22' ? '2-2.' : '2-3.');
      const count = await page.locator('section[data-lesson-slide]:not(#page_header)').count();
      assert.ok(count >= 5 && count <= 7, `${id}: scope`);
      const models = page.locator('[data-is-model]');
      for (let index=0; index<await models.count(); index++) {
        const model = models.nth(index);
        const head = await model.evaluate(el => el.closest('section').querySelector('h2').id);
        await page.evaluate(hash => {location.hash = '#'+hash;}, head);
        await expect(model).toBeVisible();
        const choices = model.locator('[data-is-select]');
        const states = await choices.evaluateAll(list => list.map(b => b.dataset.isSelect));
        for (let n=0;n<states.length;n++) {
          const button = choices.nth(n);
          await button.focus();
          await page.keyboard.press(n % 2 ? 'Space' : 'Enter');
          await expect(model).toHaveAttribute('data-is-state', states[n]);
          await expect(button).toHaveAttribute('aria-pressed', 'true');
          await expect(button).toBeFocused();
          assert.equal(await model.locator('[aria-pressed="true"]').count(),1);
          const wrong = await model.locator('[data-is-panel]').evaluateAll((panels,state) => panels.filter(p => p.hidden === p.dataset.isPanel.split(/\s+/).includes(state)).length,states[n]);
          assert.equal(wrong,0,`${id} ${states[n]}: matching explanation visible`);
        }
        const before = await model.getAttribute('data-is-state');
        await go(page,1); await page.evaluate(hash => {location.hash='#'+hash;},head);
        await expect(model).toHaveAttribute('data-is-state',before);
        const reset = model.locator('[data-is-reset]');
        await reset.press('Enter');
        await expect(model).toHaveAttribute('data-is-state',await model.getAttribute('data-is-default'));
        await expect(reset).toBeFocused();
      }
      for (const width of [1440,720,390]) {
        await page.setViewportSize({width,height:1000});
        for (const theme of ['light','dark','system']) for (const size of ['standard','large','xlarge']) {
          await page.emulateMedia({colorScheme:theme === 'system' ? 'dark' : theme});
          await page.evaluate(({theme,size})=>{window.siteTheme.setPreference(theme);window.siteTextSize.setPreference(size);},{theme,size});
          for (let n=1;n<=count;n++) { await go(page,n); await fits(page,`${name} ${id} ${width} ${theme} ${size} ${n}`); }
        }
        await page.evaluate(()=>{window.siteTheme.setPreference('light');window.siteTextSize.setPreference('standard');});
        if(width!==720) for(let n=1;n<=count;n++) {
          await go(page,n);
          await page.screenshot({path:`${output}${name}-${id}-${width}-${n}.png`});
        }
      }
      await page.setViewportSize({width:1440,height:1000});
      await go(page,count);
      const firstTerm = page.locator('.is-terms summary').first();
      await firstTerm.focus(); await page.keyboard.press('Enter');
      await expect(firstTerm.locator('..')).toHaveAttribute('open','');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('a[href*="is31"],a[href*="is32"]').count(),0);
      await page.emulateMedia({media:'print'});
      const printed = await page.locator('section[data-lesson-slide]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none'));
      assert.ok(printed,`${id}: print includes every slide`);
      const panelsPrint = await page.locator('[data-is-panel]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none'));
      assert.ok(panelsPrint,`${id}: print includes every comparison state`);
      await page.emulateMedia({media:'screen'});
      results.push({browser:name,id,slides:count,widths:[1440,720,390],themes:3,textSizes:3,interactions:'keyboard, state retention, reset, glossary, print passed'});
      console.log(`${name} ${id}: layout matrix and interactions passed`);
    }
    assert.deepEqual(errors,[],`${name}: local resources and JS exceptions`);
    const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
    await noJs.route('https://**/*', route=>route.abort());
    for(const id of ids){const p=await noJs.newPage();await p.goto(`${base}${id}.html`);assert.ok(await p.locator('section[data-lesson-slide]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none')));assert.ok(await p.locator('[data-is-panel]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none')));await p.close();}
    await noJs.close(); await context.close();
  } finally { await browser.close(); }
}
await writeFile(`${output}browser-${process.env.JOHO_TEST_BROWSERS || 'all'}-results.json`,JSON.stringify(results,null,2)+'\n');
console.log('IS browser checks passed');
