import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {expect}=require(`${process.env.PLAYWRIGHT_MODULE||'playwright'}/test`);
const base=process.env.JOHO_TEST_URL||'http://127.0.0.1:8866/';
const output=(process.env.JOHO_TEST_SCREENSHOTS||new URL('../output/is-supplements/',import.meta.url).pathname).replace(/\/?$/,'/');
await mkdir(output,{recursive:true});
const ids=['is21','is22','is23','is31','is32'];
const results=[];
async function go(page,hash){
 await page.evaluate(h=>{location.hash='#'+h},hash);
 await expect(page.locator('#'+hash)).toBeVisible();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
for(const name of (process.env.JOHO_TEST_BROWSERS||'chrome,webkit').split(',')){
 const browser=await(name==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',hasTouch:true});
  await context.route('https://**/*',route=>route.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const tab=name==='webkit'?'Alt+Tab':'Tab';const back=name==='webkit'?'Alt+Shift+Tab':'Shift+Tab';
  for(const id of ids){
   await page.goto(`${base}${id}.html`);await page.locator('body.lesson-slide-ready').waitFor();
   const supplements=page.locator('details.is-supplement');const count=await supplements.count();assert.ok(count>0,id+' has supplements');
   assert.ok((await supplements.evaluateAll(ns=>ns.map(n=>n.open))).every(open=>!open),id+' starts compact');
   for(const details of await supplements.all()){
    const headline=await details.evaluate(n=>n.closest('section').querySelector('h2').id);
    await go(page,headline);
    const summary=details.locator('summary');
    // Traverse from the preceding control; the last summary may otherwise leave the document for browser chrome.
    await summary.focus();await page.keyboard.press(back);await page.keyboard.press(tab);await expect(summary).toBeFocused();
    await summary.press('Enter');await expect(details).toHaveAttribute('open','');await expect(summary).toBeFocused();
    await summary.press('Space');await expect(details).not.toHaveAttribute('open','');await expect(summary).toBeFocused();
    await summary.tap();await expect(details).toHaveAttribute('open','');await summary.tap();await expect(details).not.toHaveAttribute('open','');
   }
   for(const width of [1440,720,390]){
    await page.setViewportSize({width,height:1000});
    for(const theme of ['light','dark','system'])for(const size of ['standard','large','xlarge']){
     await page.emulateMedia({colorScheme:theme==='light'?'light':'dark'});
     await page.evaluate(({theme,size})=>{window.siteTheme.setPreference(theme);window.siteTextSize.setPreference(size)},{theme,size});
     for(const details of await supplements.all()){
      const headline=await details.evaluate(n=>n.closest('section').querySelector('h2').id);
      await go(page,headline);
      const summary=details.locator('summary');await summary.click();await expect(details).toHaveAttribute('open','');
      await expect(details.locator('p').first()).toBeVisible();
      const dimensions=await details.evaluate(n=>({page:document.documentElement.scrollWidth,width:innerWidth,scroll:n.closest('section').scrollWidth,client:n.closest('section').clientWidth}));
      assert.ok(dimensions.page<=width+2&&dimensions.scroll<=dimensions.client+2,`${name} ${id} ${width} ${theme} ${size}: ${JSON.stringify(dimensions)}`);
      await summary.click();await expect(details).not.toHaveAttribute('open','');
     }
    }
   }
   await page.setViewportSize({width:1440,height:1000});
   await page.evaluate(()=>{window.siteTheme.setPreference('light');window.siteTextSize.setPreference('standard')});
   const first=supplements.first();const hash=await first.evaluate(n=>n.closest('section').querySelector('h2').id);
   await go(page,hash);await first.locator('summary').scrollIntoViewIfNeeded();
   await page.screenshot({path:`${output}${name}-${id}-closed.png`});
   await first.locator('summary').click();await page.screenshot({path:`${output}${name}-${id}-open.png`});
   const before=await supplements.evaluateAll(ns=>ns.map(n=>n.open));
   await page.emulateMedia({media:'print'});
   for(const details of await supplements.all()){await expect(details).toHaveAttribute('open','');await expect(details.locator('p').first()).toBeVisible()}
   await page.emulateMedia({media:'screen'});
   await expect.poll(()=>supplements.evaluateAll(ns=>ns.map(n=>n.open))).toEqual(before);
   await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
   assert.ok((await supplements.evaluateAll(ns=>ns.map(n=>n.open))).every(Boolean));
   await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
   assert.deepEqual(await supplements.evaluateAll(ns=>ns.map(n=>n.open)),before);
   results.push({browser:name,id,supplements:count,expandedLayoutCases:count*27,keyboard:'Enter/Space/Tab roundtrip',touch:true,print:'all expanded, prior states restored'});
   console.log(`${name} ${id}: ${count} supplements, ${count*27} expanded layouts, keyboard/touch/print passed`);
  }
  assert.deepEqual(errors,[],'supplement script errors');await context.close();
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:1000}});await noJs.route('https://**/*',route=>route.abort());
  for(const id of ids){
   const page=await noJs.newPage();await page.goto(`${base}${id}.html`);
   for(const details of await page.locator('details.is-supplement').all()){
    await expect(details).toHaveAttribute('open','');await expect(details.locator('p').first()).toBeVisible();
    await details.locator('summary').click();await expect(details).not.toHaveAttribute('open','');await details.locator('summary').click();await expect(details).toHaveAttribute('open','');
   }
   await page.emulateMedia({media:'print'});
   for(const details of await page.locator('details.is-supplement').all())await expect(details.locator('p').first()).toBeVisible();
   await page.close();
  }
  await noJs.close();
 }finally{await browser.close()}
}
await writeFile(output+'results.json',JSON.stringify(results,null,2)+'\n');
console.log('IS supplement checks passed');
