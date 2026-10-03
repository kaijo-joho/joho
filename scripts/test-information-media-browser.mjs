import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { expect } = require(`${process.env.PLAYWRIGHT_MODULE || 'playwright'}/test`);
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8875/';
const output = (process.env.JOHO_TEST_SCREENSHOTS || new URL('../output/media-review/', import.meta.url).pathname).replace(/\/?$/, '/');
await mkdir(output, { recursive: true });
const counts = {is11:6,is12:6};
const results = [];
async function go(page, number) {
  await page.evaluate(n => { location.hash = `#headline_${n}`; }, number);
  await expect(page.locator(`#headline_${number}`)).toBeVisible();
}
async function fits(page, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bounds = await page.evaluate(() => {
    const slide = [...document.querySelectorAll('.lesson-slide')].find(el => !el.hidden);
    return {width:innerWidth,page:document.documentElement.scrollWidth,slide:slide.scrollWidth,available:slide.clientWidth};
  });
  assert.ok(bounds.page <= bounds.width+2 && bounds.slide <= bounds.available+2, `${label}: overflow ${JSON.stringify(bounds)}`);
}
for (const name of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = await (name === 'webkit' ? webkit.launch() : chromium.launch({channel:'chrome'}));
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('https://**/*', route=>route.abort());
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('response', r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    for (const [id,count] of Object.entries(counts)) {
      await page.goto(`${base}${id}.html`);
      await page.locator('body.lesson-slide-ready').waitFor();
      if (!process.env.JOHO_SKIP_METADATA) await expect(page.locator('#page_header')).toContainText(`1-${id.slice(-1)}.`);
      assert.equal(await page.locator('section[data-lesson-slide]:not(#page_header)').count(),count);
      assert.equal(await page.locator('.is-terms details[open]').count(),0,'terms start closed with JS');
      const scenes=page.locator('.is-scene img');
      assert.equal(await scenes.count(), id==='is11'?1:2, 'expected generated scenes');
      for (const scene of await scenes.all()) {
        const sceneHeading=await scene.evaluate(el=>el.closest('section').querySelector('h2').id);
        await page.evaluate(hash=>{location.hash='#'+hash;},sceneHeading);
        await scene.scrollIntoViewIfNeeded();
        await expect.poll(()=>scene.evaluate(im=>im.complete&&im.naturalWidth===1672&&im.naturalHeight===941)).toBe(true);
        await expect(scene.locator('..')).toContainText('架空・AI生成');
      }
      for (const model of await page.locator('[data-is-model]').all()) {
        const head=await model.evaluate(el=>el.closest('section').querySelector('h2').id);
        await page.evaluate(hash=>{location.hash='#'+hash;},head);
        await expect(model).toBeVisible();
        for (const button of await model.locator('[data-is-select]').all()) {
          const state=await button.getAttribute('data-is-select');
          await button.focus(); await page.keyboard.press('Enter');
          await expect(model).toHaveAttribute('data-is-state',state);
          await expect(button).toBeFocused();
          assert.equal(await model.locator('[aria-pressed="true"]').count(),1);
          assert.equal(await model.locator('[data-is-panel]').evaluateAll((panels,s)=>panels.filter(p=>p.hidden===p.dataset.isPanel.split(/\s+/).includes(s)).length,state),0,'selected explanations visible');
          assert.equal(await model.locator('[data-is-highlight]').evaluateAll((nodes,s)=>nodes.filter(n=>n.classList.contains('is-active')!==n.dataset.isHighlight.split(/\s+/).includes(s)).length,state),0,'diagram and explanation highlights agree');
        }
        const state=await model.getAttribute('data-is-state');
        await go(page,1);await page.evaluate(hash=>{location.hash='#'+hash;},head);
        await expect(model).toHaveAttribute('data-is-state',state);
        const reset=model.locator('[data-is-reset]');
        if(await reset.count()) {await reset.press('Space');await expect(model).toHaveAttribute('data-is-state',await model.getAttribute('data-is-default'));await expect(reset).toBeFocused();}
      }
      for (const width of [1440,720,390]) {
        await page.setViewportSize({width,height:1000});
        for(const theme of ['light','dark','system'])for(const size of ['standard','large','xlarge']) {
          await page.emulateMedia({colorScheme:theme==='system'?'dark':theme});
          await page.evaluate(({theme,size})=>{window.siteTheme.setPreference(theme);window.siteTextSize.setPreference(size);},{theme,size});
          for(let n=1;n<=count;n++){await go(page,n);await fits(page,`${name} ${id} ${width} ${theme} ${size} ${n}`);}
        }
        await page.evaluate(()=>{window.siteTheme.setPreference('light');window.siteTextSize.setPreference('standard');});
        if(width!==720)for(let n=1;n<=count;n++){await go(page,n);await page.screenshot({path:`${output}${name}-${id}-${width}-${n}.png`});}
      }
      await go(page,count);
      const firstTerm=page.locator('.is-terms details').first();
      await firstTerm.locator('summary').press('Enter');
      await expect(firstTerm).toHaveAttribute('open','');
      const before=await page.locator('.is-terms details').evaluateAll(nodes=>nodes.map(n=>n.open));
      await page.evaluate(()=>window.siteTheme.setPreference('dark'));
      await page.emulateMedia({media:'print'});
      await expect.poll(()=>page.locator('.is-terms details').evaluateAll(nodes=>nodes.every(n=>n.open))).toBe(true);
      assert.ok(await page.locator('section[data-lesson-slide], [data-is-panel]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none')),'print includes all states and slides');
      await expect(page.locator('.skip-link')).toBeHidden();
      assert.equal(await page.locator('.is-card').first().evaluate(n=>getComputedStyle(n).color),'rgb(32, 48, 64)','dark screen preference remains readable on white paper');
      assert.ok(await page.locator('[data-lesson-slide] article').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(n).backgroundImage==='none')),'print backgrounds stay white in dark theme');
      if(name==='chrome'&&process.env.JOHO_TEST_PDF) await page.pdf({path:`${output}${id}.pdf`,format:'A4',printBackground:true});
      await page.emulateMedia({media:'screen'});
      await expect.poll(()=>page.locator('.is-terms details').evaluateAll(nodes=>nodes.map(n=>n.open))).toEqual(before);
      results.push({browser:name,id,slides:count,widths:[1440,720,390],themes:3,textSizes:3,states:'keyboard, matching panels/highlights, reset, retention',glossary:'closed initially; keyboard, print expansion and restoration passed'});
      console.log(`${name} ${id}: matrix, states and print passed`);
    }
    assert.deepEqual(errors,[],'local assets and JS exceptions');
    const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
    await noJs.route('https://**/*',route=>route.abort());
    for(const id of Object.keys(counts)) {
      const p=await noJs.newPage();await p.goto(`${base}${id}.html`);
      assert.ok(await p.locator('section[data-lesson-slide], [data-is-panel]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none')),'noJS all text visible');
      assert.ok(await p.locator('.is-terms details, details.is-supplement').evaluateAll(nodes=>nodes.every(n=>n.open)),'noJS disclosures open');
      assert.equal(await p.locator('[data-is-select]:visible, [data-is-reset]:visible').count(),0,'noJS inactive controls hidden');
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'noJS mobile fits');
      await p.close();
    }
    await noJs.close();await context.close();
  } finally {await browser.close();}
}
await writeFile(`${output}results-${process.env.JOHO_TEST_BROWSERS || 'all'}.json`,JSON.stringify(results,null,2)+'\n');
console.log('Information media browser checks passed');
