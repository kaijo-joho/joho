import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const modulePath=process.env.PLAYWRIGHT_MODULE || 'playwright';
const {chromium,webkit}=require(modulePath);
const {expect}=require(`${modulePath}/test`);
const base=process.env.JOHO_TEST_URL || 'http://127.0.0.1:8896/';
const out=process.env.JOHO_TEST_SCREENSHOTS || '/tmp/is6-browser/';
await mkdir(out,{recursive:true});
const results=[];
const ids=(process.env.JOHO_TEST_IDS || "is61,is62,is63,is64").split(",");
async function go(page,n){await page.evaluate(n=>{location.hash=`headline_${n}`;},n);await expect(page.locator(`#headline_${n}`)).toBeVisible();}
async function fit(page,label){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const b=await page.evaluate(()=>{const s=[...document.querySelectorAll('.lesson-slide')].find(n=>!n.hidden);return {width:innerWidth,page:document.documentElement.scrollWidth,slide:s.scrollWidth,available:s.clientWidth};});
 assert.ok(b.page<=b.width+2,`${label}: document overflow ${JSON.stringify(b)}`);
 assert.ok(b.slide<=b.available+2,`${label}: slide overflow ${JSON.stringify(b)}`);
}
for(const engine of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
 const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
 try {
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await ctx.route('https://**/*',route=>route.abort());
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  for(const id of ids){
   await page.goto(`${base}${id}.html`); await page.locator('body.lesson-slide-ready').waitFor();
   await go(page,1);await page.locator('#headline_1').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#headline_2')).toBeVisible();await page.keyboard.press('ArrowLeft');await expect(page.locator('#headline_1')).toBeVisible();
   for(const progress of await page.locator('[data-lesson-progress]').all()){
    const head=await progress.evaluate(el=>el.closest('section').querySelector('h2').id);
    await page.evaluate(hash=>{location.hash=hash;},head);
    await expect(progress).toHaveAttribute('data-progress-step','0');
    await expect(progress.locator('[data-is-model]')).toBeHidden();
    const next=progress.locator('[data-progress-next]');
    await next.focus();await page.keyboard.press(engine==='webkit'?'Alt+Tab':'Tab');await expect(progress.locator('[data-progress-reset]')).toBeFocused();await page.keyboard.press(engine==='webkit'?'Alt+Shift+Tab':'Shift+Tab');await expect(next).toBeFocused();await page.keyboard.press('Enter');
    await expect(progress).toHaveAttribute('data-progress-step','1');
    await expect(progress.locator('[data-is-model]')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(progress).toHaveAttribute('data-progress-step','2');await expect(next).toBeDisabled();
    const model=progress.locator('[data-is-model]');
    for(const choice of await model.locator('[data-is-select]').all()){
     await choice.focus();await page.keyboard.press('Enter');const state=await choice.getAttribute('data-is-select');
     await expect(choice).toBeFocused();await expect(model).toHaveAttribute('data-is-state',state);
     await expect(choice).toHaveAttribute('aria-pressed','true');
     assert.equal(await model.locator('[data-is-panel]:visible').count(),1,'one comparison state');
     await expect(model.locator(`[data-is-panel="${state}"]`)).toBeVisible();
     await fit(page,`${engine} ${id} ${state}`);
    }
    const state=await model.getAttribute('data-is-state');
    await go(page,6);await page.evaluate(hash=>{location.hash=hash;},head);
    await expect(model).toHaveAttribute('data-is-state',state);await expect(progress).toHaveAttribute('data-progress-step','2');
    const reset=model.locator('[data-is-reset]');await reset.press('Enter');
    await expect(model).toHaveAttribute('data-is-state',await model.getAttribute('data-is-default'));await expect(reset).toBeFocused();
    await progress.locator('[data-progress-prev]').click();await expect(progress).toHaveAttribute('data-progress-step','1');
    await progress.locator('[data-progress-reset]').click();await expect(progress).toHaveAttribute('data-progress-step','0');
    await page.evaluate(el=>window.JohoLessonProgress.set(el,2),await progress.elementHandle());
   }
   for(const width of [1440,720,390]){
    await page.setViewportSize({width,height:1000});
    for(const theme of ['light','dark','system'])for(const size of ['standard','large','xlarge']){
     await page.emulateMedia({colorScheme:theme==='system'?'dark':theme});
     await page.evaluate(({theme,size})=>{window.siteTheme.setPreference(theme);window.siteTextSize.setPreference(size);},{theme,size});
     for(let n=1;n<=7;n++){await go(page,n);await fit(page,`${engine} ${id} ${width} ${theme} ${size} ${n}`);}
    }
    // Full comparison states at the narrowest layout with the largest text.
    for(const model of await page.locator('[data-is-model]').all()){
     const head=await model.evaluate(el=>el.closest('section').querySelector('h2').id);await page.evaluate(hash=>{location.hash=hash;},head);
     for(const choice of await model.locator('[data-is-select]').all()){await choice.click();await fit(page,`${engine} ${id} all states ${width}`);}
    }
    await page.evaluate(()=>{window.siteTheme.setPreference('light');window.siteTextSize.setPreference('standard');});
    if(width!==720)for(let n=1;n<=7;n++){await go(page,n);await page.screenshot({path:`${out}/${engine}-${id}-${width}-${n}.png`});}
   }
   await go(page,6);const term=page.locator('.is-terms summary').first();await term.focus();await page.keyboard.press('Enter');await expect(term.locator('..')).toHaveAttribute('open','');await page.keyboard.press('Enter');
   await go(page,7);await page.locator('textarea').first().fill('自分の説明');await page.locator('.ts-problems summary').first().press('Enter');await expect(page.locator('.ts-problems details').first()).toHaveAttribute('open','');
   const before=await page.locator('[data-lesson-progress]').first().getAttribute('data-progress-step');
   await page.emulateMedia({media:'print'});
   assert.ok(await page.locator('section[data-lesson-slide]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none')));
   assert.ok(await page.locator('[data-is-panel], [data-lesson-stage-from]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none')),'all print comparisons and explanations');
   await expect.poll(()=>page.locator('.is-terms details,.ts-problems details').evaluateAll(nodes=>nodes.every(n=>n.open)),{message:'print disclosures opened'}).toBe(true);
   if(engine==='chrome')await page.pdf({path:`${out}/${id}.pdf`,format:'A4',printBackground:true});
   await page.emulateMedia({media:'screen'});
   assert.equal(await page.locator('[data-lesson-progress]').first().getAttribute('data-progress-step'),before);
   await expect(page.locator('textarea').first()).toHaveValue('自分の説明');
   results.push({engine,id,widths:[1440,720,390],themes:3,textSizes:3,slides:7,errors:0});console.log(`${engine} ${id}: all layout and interaction checks passed`);
  }
  assert.deepEqual(errors,[],'no page exceptions or local HTTP errors');
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:1000}});await noJs.route('https://**/*',route=>route.abort());
  for(const id of ids){const p=await noJs.newPage();await p.goto(`${base}${id}.html`);assert.ok(await p.locator('[data-is-panel],section[data-lesson-slide],[data-lesson-stage-from]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display!=='none')));assert.ok(await p.locator('details').evaluateAll(nodes=>nodes.every(n=>n.open)));await p.close();}
  await noJs.close();
  const touch=await browser.newContext({hasTouch:true,viewport:{width:390,height:1000}});await touch.route('https://**/*',route=>route.abort());
  for(const id of ids){const p=await touch.newPage();await p.goto(`${base}${id}.html#headline_1`);const progress=p.locator('[data-lesson-progress]').first();await progress.locator('[data-progress-next]').tap();await progress.locator('[data-is-select]').last().tap();await expect(progress.locator('[data-is-select]').last()).toHaveAttribute('aria-pressed','true');await progress.locator('[data-is-reset]').tap();await expect(progress.locator('[data-is-model]')).toHaveAttribute('data-is-state',await progress.locator('[data-is-model]').getAttribute('data-is-default'));await p.close();}
  await touch.close();await ctx.close();
 } finally{await browser.close();}
}
await writeFile(`${out}/results-${process.env.JOHO_TEST_BROWSERS || 'all'}.json`,JSON.stringify(results,null,2)+'\n');console.log('technology-society browser checks passed');
