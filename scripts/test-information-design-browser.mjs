import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const pw = process.env.PLAYWRIGHT_MODULE || '/Users/takashi/Documents/GAS/webedu/node_modules/playwright';
const { chromium, webkit } = require(pw);
const { expect } = require(`${pw}/test`);
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8873/';
const output = process.env.JOHO_TEST_SCREENSHOTS || '/tmp/id-design-review';
const allSpecs = { id11:6,id12:7,id13:6,id14:6,id15:6 };
const specs = process.env.JOHO_ID_TEST_IDS ? Object.fromEntries(Object.entries(allSpecs).filter(([id]) => process.env.JOHO_ID_TEST_IDS.split(',').includes(id))) : allSpecs;
await mkdir(output,{recursive:true});
const summary=[];
async function go(page, n) {
 await page.evaluate(value => { location.hash=`#headline_${value}`; },n);
 await expect(page.locator(`#headline_${n}`)).toBeVisible();
}
async function fit(page,label) {
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const b=await page.evaluate(()=>{const s=[...document.querySelectorAll('.lesson-slide')].find(e=>!e.hidden);return {screen:innerWidth,page:document.documentElement.scrollWidth,slide:s.scrollWidth,available:s.clientWidth};});
 assert.ok(b.page<=b.screen+2 && b.slide<=b.available+2,`${label}: overflow ${JSON.stringify(b)}`);
}
async function stageAll(page) { await page.evaluate(()=>document.querySelectorAll('[data-lesson-progress]').forEach(el=>window.JohoLessonProgress.set(el,2))); }
async function openCase(page, key, state='after') {
 const container=page.locator(`[data-id-extra-case="${key}"]`);
 const n=await container.evaluate(el=>Number(el.closest('section').querySelector('h2').id.split('_')[1]));
 await go(page,n);await container.evaluate(el=>{el.open=true;});
 await container.locator(`[data-is-select="${state}"]`).press('Enter');
 return container.locator(`[data-is-panel="${state}"]`);
}
for (const name of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
 const browser=await(name==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('https://**/*',r=>r.abort());
  // Metadata is owned by the formal ledger. A route fixture checks the shared cover before its registration.
  if(process.env.JOHO_ID_METADATA_FIXTURE !== '0') await context.route('**/js/pages.js',async route=>{
   const response=await route.fetch();
   let body=await response.text();
   body+='\n'+Object.keys(allSpecs).map((id,i)=>`window.pages[${JSON.stringify(id)}]={id:${JSON.stringify(id)},fileName:${JSON.stringify(id+'.html')},mainTitle:'情報デザイン',title:${JSON.stringify(['情報を整理して伝える','色の使い方','UDとアクセシビリティ','UIと操作の分かりやすさ','試作・評価・改善'][i])},detail:'確認用教材',release:false};`).join('\n');
   await route.fulfill({response,body});
  });
  const page=await context.newPage();const errors=[];
  const forwardTab=name==='webkit'?'Alt+Tab':'Tab';
  const backTab=name==='webkit'?'Alt+Shift+Tab':'Shift+Tab';
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  for(const [id,count] of Object.entries(specs)) {
   await page.goto(`${base}${id}.html`);await page.locator('body.lesson-slide-ready').waitFor();
   assert.equal(await page.locator('section[data-lesson-slide]:not(#page_header)').count(),count);
   assert.equal(await page.locator('.is-terms details[open]').count(),0);
   assert.equal(await page.locator('[data-id-extra-case]').count(),3);
   for(const progress of await page.locator('[data-lesson-progress]').all()) {
    const n=await progress.evaluate(el=>Number(el.closest('section').querySelector('h2').id.split('_')[1]));await go(page,n);
    await progress.evaluate(el=>{for(let n=el.parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});
    await expect(progress).toHaveAttribute('data-progress-step','0');
    await expect(progress.locator('[data-progress-prev]')).toBeDisabled();
    await progress.locator('[data-progress-next]').press('Enter');await expect(progress).toHaveAttribute('data-progress-step','1');
    await progress.locator('[data-progress-next]').press('Space');await expect(progress).toHaveAttribute('data-progress-step','2');
    await expect(progress.locator('[data-progress-next]')).toBeDisabled();
    await progress.locator('[data-progress-prev]').press('Enter');await expect(progress).toHaveAttribute('data-progress-step','1');
    await progress.locator('[data-progress-reset]').press('Enter');await expect(progress).toHaveAttribute('data-progress-step','0');
   }
   await stageAll(page);
   for(const model of await page.locator('[data-is-model]').all()) {
    const n=await model.evaluate(el=>Number(el.closest('section').querySelector('h2').id.split('_')[1]));await go(page,n);
    const collapsed = model.locator('xpath=ancestor::details');if(await collapsed.count())await collapsed.first().evaluate(el=>{el.open=true;});
    for(const button of await model.locator('[data-is-select]').all()) {
     const state=await button.getAttribute('data-is-select');await button.focus();await page.keyboard.press('Enter');
     await expect(model).toHaveAttribute('data-is-state',state);await expect(button).toBeFocused();
     assert.equal(await model.locator('[aria-pressed="true"]').count(),1);
     if(id==='id11' && await model.getAttribute('data-is-model')==='id11-latch') {
      assert.equal(await model.locator('[data-id-event]').count(),6);
      if(state==='time')await expect(model.locator('[data-id-event]').first()).toHaveAttribute('data-id-event','総合案内');
      if(state==='alphabet')assert.deepEqual(await model.locator('[data-id-event]').evaluateAll(els=>els.map(e=>e.dataset.idEvent)),['アート展示','囲碁体験','演劇','音楽演奏','科学展示','総合案内']);
     }
    }
    await model.locator('[data-is-reset]').press('Space');await expect(model).toHaveAttribute('data-is-state',await model.getAttribute('data-is-default'));
   }
   if(id==='id11') {await go(page,4);const c=page.locator('[data-id-layout]');for(const checkbox of await c.locator('input').all())await checkbox.check();await expect(c.locator('.id-layout-sample')).toHaveClass(/has-space/);await c.locator('[data-id-layout-reset]').click();await expect(c.locator('input:checked')).toHaveCount(0);}
   if(id==='id12') {await go(page,1);const c=page.locator('[data-id-color]');const h=c.locator('[name=h]');await h.focus();await page.keyboard.press('ArrowRight');await expect(c.locator('[data-id-value=h]')).toHaveText('211°');assert.match(await c.locator('[data-id-swatch]').getAttribute('fill'),/211/);await c.locator('[data-id-color-reset]').click();await expect(h).toHaveValue('210');}
   if(id==='id13') {
    await go(page,2);await page.locator('[data-is-select=both]').click();await page.locator('[data-id-grayscale]').check();await expect(page.locator('[data-id-gray]')).toHaveClass(/is-gray/);assert.equal(await page.locator('[data-is-panel=both] .id-cue-items span:not(.id-marker)').count(),3);
    await go(page,3);await page.locator('[data-id-alt-hide]').check();await expect(page.locator('[data-id-alt-text]')).toContainText('図書館入口');await page.locator('[data-is-select=decorative]').click();await expect(page.locator('[data-id-alt-image]')).toHaveAttribute('alt','');await expect(page.locator('[data-id-alt-text]')).toContainText('空のalt');
    await go(page,4);await page.locator('#id13-place').selectOption('科学室');await page.locator('[data-id-keyboard] button[type=submit]').press('Enter');await expect(page.locator('[data-id-keyboard-result]')).toContainText('2階');await page.locator('[data-id-keyboard-reset]').click();await expect(page.locator('#id13-place')).toHaveValue('講堂');
    await page.locator('#id13-place').focus();await page.keyboard.press(forwardTab);await expect(page.locator('[data-id-keyboard] button[type=submit]')).toBeFocused();
    await page.keyboard.press(backTab);await expect(page.locator('#id13-place')).toBeFocused();
   }
   if(id==='id14') {
    await go(page,1);await page.locator('[data-is-panel=vague] [data-id-ui-action]').click();await expect(page.locator('[data-is-panel=vague] [data-id-ui-status]')).toContainText('道順');
    await go(page,4);await page.locator('[data-id-delete]').press('Enter');await expect(page.locator('[data-id-undo-button]')).toBeFocused();await expect(page.locator('[data-id-undo-status]')).toContainText('削除しました');await page.locator('[data-id-undo-button]').press('Enter');await expect(page.locator('[data-id-delete]')).toBeFocused();await expect(page.locator('[data-id-undo-list]')).toContainText('音楽演奏');await page.locator('[data-id-undo-reset]').click();
    for(const state of ['before','after']) {
     const icons=await openCase(page,'id14-two-icons',state);
     await icons.locator('[data-id-demo-action=copy]').press('Enter');await expect(icons.locator('[data-id-demo-action-result]')).toContainText('担当者へは送っていません');
     await icons.locator('[data-id-demo-action=send]').press('Space');await expect(icons.locator('[data-id-demo-action-result]')).toContainText('実際の送信は行いません');
     const form=await openCase(page,'id14-input',state);
     await form.locator('button[type=submit]').press('Enter');await expect(form.locator('input')).toHaveValue('7');await expect(form.locator('input')).toHaveAttribute('aria-invalid','true');
     await expect(form.locator('[data-id-input-result]')).toContainText(state==='after'?'1〜4の整数':'入力エラー');
     if(state==='after') {await page.setViewportSize({width:390,height:1000});await fit(page,`${name} input correction mobile`);await form.screenshot({path:`${output}/${name}-id14-input-error-390.png`});await page.setViewportSize({width:1440,height:1000});}
     await form.locator('input').fill('2');await form.locator('input').press('Enter');await expect(form.locator('[data-id-input-result]')).toContainText('参加人数2人');await expect(form.locator('input')).toHaveAttribute('aria-invalid','false');
     await form.locator('[data-id-input-reset]').press('Enter');await expect(form.locator('input')).toHaveValue('7');await expect(form.locator('input')).toBeFocused();
    }
    const immediate=await openCase(page,'id14-review','before');await immediate.locator('[data-id-booking-start]').press('Enter');await expect(immediate.locator('[data-id-booking-result]')).toContainText('14:00で予約を確定');await expect(immediate.locator('[data-id-booking-reset]')).toBeFocused();await immediate.locator('[data-id-booking-reset]').press('Enter');
    const booking=await openCase(page,'id14-review');await booking.locator('[data-id-booking-start]').press('Enter');await expect(booking.locator('[data-id-booking-summary]')).toHaveText('相談の時刻：14:00');await expect(booking.locator('[data-id-booking-edit]')).toBeFocused();
    await booking.locator('[data-id-booking-edit]').press('Enter');await expect(booking.locator('select')).toBeFocused();await booking.locator('select').selectOption('15:00');await booking.locator('[data-id-booking-start]').press('Enter');await expect(booking.locator('[data-id-booking-summary]')).toHaveText('相談の時刻：15:00');
    await page.setViewportSize({width:390,height:1000});await fit(page,`${name} booking review mobile`);await booking.screenshot({path:`${output}/${name}-id14-review-edit15-390.png`});await page.setViewportSize({width:1440,height:1000});
    await booking.locator('[data-id-booking-confirm]').press('Enter');await expect(booking.locator('[data-id-booking-result]')).toContainText('15:00で予約を確定');await expect(booking.locator('select')).toBeDisabled();await booking.locator('[data-id-booking-reset]').press('Enter');await expect(booking.locator('select')).toHaveValue('14:00');await expect(booking.locator('select')).toBeEnabled();await expect(booking.locator('[data-id-booking-review]')).toBeHidden();
   }
   if(id==='id15') {
    await go(page,2);await page.locator('#id15-audience').selectOption('staff');await page.locator('[data-id-criteria] input[value=help]').check();await expect(page.locator('[data-id-criteria-output]')).toContainText('案内係');await expect(page.locator('[data-id-criteria-output]')).toContainText('相談先');await page.locator('[data-id-criteria-reset]').click();
    await go(page,3);for(const c of await page.locator('[data-id-redesign] input').all())await c.check();await expect(page.locator('[data-id-chart-figure]')).toBeVisible();await page.locator('[data-id-redesign-reset]').click();await expect(page.locator('[data-id-chart-figure]')).toBeHidden();
   }
   await page.evaluate(()=>window.siteTheme.setPreference('system'));
   await page.emulateMedia({colorScheme:'light'});
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--is-panel').trim()),'#fff');
   await page.emulateMedia({colorScheme:'dark'});
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--is-panel').trim()),'#14212c');
   await stageAll(page);
   if(id==='id11') {const c=await openCase(page,'id11-evacuation');for(const value of ['10:00','9:50','教室','出口A','出口B'])await expect(c).toContainText(value);await expect(c.locator('tbody th')).toHaveText(['1階','2階']);const b=await openCase(page,'id11-library');await expect(b).toContainText('自然・棚A');await expect(b.locator('.id-example-books li')).toHaveCount(3);}
   if(id==='id12') {const c=await openCase(page,'id12-backdrop');await expect(c.locator('rect[fill="#fff"]')).toHaveCount(1);const s=await openCase(page,'id12-scale');assert.deepEqual(await s.locator('rect').evaluateAll(els=>els.map(e=>e.getAttribute('height'))),['40','80','120']);}
   if(id==='id13') {const r=await openCase(page,'id13-route');await expect(r.locator('[stroke-dasharray]')).toHaveCount(1);await expect(r).toContainText('昇降機');const t=await openCase(page,'id13-timetable');await expect(t).toContainText('水曜日の8:30の便は利用できません');const c=await openCase(page,'id13-chart-text');await expect(c.locator('tbody td')).toHaveText(['60冊','90冊','75冊']);}
   if(!process.env.JOHO_ID_INTERACTIONS_ONLY) for(const width of [1440,720,390]) {
    await page.setViewportSize({width,height:1000});
    for(const theme of ['light','dark','system'])for(const size of ['standard','large','xlarge']) {
     await page.emulateMedia({colorScheme:theme==='system'?'dark':theme});
     await page.evaluate(({theme,size})=>{window.siteTheme.setPreference(theme);window.siteTextSize.setPreference(size);},{theme,size});
     if(id==='id15')await page.locator('[data-id-redesign] input').evaluateAll(els=>els.forEach(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}));
     for(let n=1;n<=count;n++){
      await go(page,n);await fit(page,`${name} ${id} ${width} ${theme} ${size} slide${n}`);
      for(const model of await page.locator('.lesson-slide:not([hidden]) [data-id-extra-case] [data-is-model]').all())for(const state of ['before','after']) {
       await model.locator(`[data-is-select=${state}]`).press('Enter');await fit(page,`${name} ${id} ${width} ${theme} ${size} ${await model.getAttribute('data-is-model')} ${state}`);
       assert.ok(await model.locator('select:visible,input[type="text"]:visible').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)),`${name} ${id} ${width} ${theme} ${size}: new select/text input touch targets`);
      }
     }
    }
    await page.evaluate(()=>{window.siteTheme.setPreference('light');window.siteTextSize.setPreference('standard');});
    if(width!==720)for(let n=1;n<=count;n++){await go(page,n);await page.screenshot({path:`${output}/${name}-${id}-${width}-${n}.png`});}
    if(width!==720)for(const model of await page.locator('[data-id-extra-case] [data-is-model]').all()) {
     const key=await model.getAttribute('data-is-model');
     for(const state of ['before','after']) {const panel=await openCase(page,key,state);await model.screenshot({path:`${output}/${name}-${key}-${width}-${state}.png`});await panel.screenshot({path:`${output}/${name}-${key}-${width}-${state}-content.png`});}
    }
   }
   await go(page,count-1);const term=page.locator('.is-terms summary').first();await term.press('Enter');await expect(term.locator('..')).toHaveAttribute('open','');await term.press('Space');
   // Keyboard deck navigation from a heading, with hash and focus restoration.
   await page.locator(`#headline_${count-1}`).focus();await page.keyboard.press('ArrowRight');await expect(page.locator(`#headline_${count}`)).toBeVisible();await expect(page.locator(`#headline_${count}`)).toBeFocused();
   await page.locator('[data-id-extra-case]').first().evaluate(el=>{el.open=false;window.JohoLessonProgress.reset(el.querySelector('[data-lesson-progress]'));});
   const saved=await page.evaluate(()=>({stages:[...document.querySelectorAll('[data-lesson-progress]')].map(e=>e.dataset.progressStep),details:[...document.querySelectorAll('details.is-supplement')].map(e=>e.open),models:[...document.querySelectorAll('[data-is-model]')].map(e=>e.dataset.isState)}));
   await page.emulateMedia({media:'print'});
   await expect.poll(()=>page.locator('[data-id-extra-case]').evaluateAll(els=>els.every(e=>e.open))).toBe(true);
   assert.ok(await page.locator('section[data-lesson-slide]').evaluateAll(els=>els.every(e=>getComputedStyle(e).display!=='none')),'print includes every slide');
   assert.ok(await page.locator('[data-lesson-stage],[data-lesson-stage-from]').evaluateAll(els=>els.every(e=>getComputedStyle(e).display!=='none')),'print includes stages');
   assert.ok(await page.locator('[data-is-panel]').evaluateAll(els=>els.every(e=>getComputedStyle(e).display!=='none')),'print includes model panels');
   for(const example of await page.locator('[data-id-extra-case]').all())for(const state of ['before','after'])await expect(example.locator(`[data-is-panel=${state}]`)).toBeVisible();
   await page.emulateMedia({media:'screen'});
   await expect.poll(()=>page.evaluate(()=>({stages:[...document.querySelectorAll('[data-lesson-progress]')].map(e=>e.dataset.progressStep),details:[...document.querySelectorAll('details.is-supplement')].map(e=>e.open),models:[...document.querySelectorAll('[data-is-model]')].map(e=>e.dataset.isState)})),{message:'print restores stages, details and model states'}).toEqual(saved);
   summary.push({browser:name,id,slides:count,extraCases:3,widths:process.env.JOHO_ID_INTERACTIONS_ONLY?[]:[1440,720,390],themes:3,textSizes:3,progress:'every new and original case: keyboard Next, previous, reset, boundaries',operations:'both states, icon actions, invalid/corrected input, review/edit/confirm/reset',print:'all slides/stages/panels/cases and screen restoration'});
   console.log(`${name} ${id}: ${process.env.JOHO_ID_INTERACTIONS_ONLY ? 'interactions, print and fallback' : 'interactions and layout matrix'} passed`);
  }
  assert.deepEqual(errors,[],'no JS exceptions or local HTTP errors');
  const fallback=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});await fallback.route('https://**/*',r=>r.abort());
  for(const id of Object.keys(specs)){const p=await fallback.newPage();await p.goto(`${base}${id}.html`);assert.ok(await p.locator('section[data-lesson-slide], [data-is-panel], [data-lesson-stage], [data-lesson-stage-from]').evaluateAll(els=>els.every(e=>getComputedStyle(e).display!=='none')));assert.ok(await p.locator('.is-terms details,[data-id-extra-case]').evaluateAll(els=>els.every(e=>e.open)));assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));if(id==='id14'){await expect(p.locator('[data-id-booking-summary]')).toHaveText('相談の時刻：14:00');await expect(p.locator('[data-id-input-demo] button[type=submit]:disabled')).toHaveCount(2);}await p.close();}
  await fallback.close();await context.close();
  const touch=await browser.newContext({hasTouch:true,viewport:{width:390,height:900}});await touch.route('https://**/*',r=>r.abort());
  for(const id of Object.keys(specs).filter(id=>['id11','id15'].includes(id))) {
   const p=await touch.newPage();await p.goto(`${base}${id}.html#headline_3`);await p.locator('body.lesson-slide-ready').waitFor();await stageAll(p);
   if(id==='id11'){await p.locator('[data-is-model="id11-latch"] [data-is-select=location]').tap();await expect(p.locator('[data-is-model="id11-latch"]')).toHaveAttribute('data-is-state','location');}
   else {await p.locator('[data-id-redesign] label').filter({hasText:'整列'}).tap();await expect(p.locator('.id-redesign-sample')).toHaveClass(/has-alignment/);await p.locator('[data-id-redesign-reset]').tap();await expect(p.locator('[data-id-redesign] input:checked')).toHaveCount(0);}
   await fit(p,`${name} ${id} touch`);await p.close();
  }
  for(const id of Object.keys(specs)) {
   const p=await touch.newPage();await p.goto(`${base}${id}.html`);await p.locator('body.lesson-slide-ready').waitFor();
   for(const example of await p.locator('[data-id-extra-case]').all()) {
    const n=await example.evaluate(el=>Number(el.closest('section').querySelector('h2').id.split('_')[1]));await go(p,n);
    await example.locator('summary').tap();await expect(example).toHaveAttribute('open','');
    await example.locator('[data-progress-next]').tap();await example.locator('[data-is-select=after]').tap();await expect(example.locator('[data-is-model]')).toHaveAttribute('data-is-state','after');
    await example.locator('[data-progress-next]').tap();await fit(p,`${name} ${id} new case touch`);
    await example.locator('[data-is-reset]').tap();await expect(example.locator('[data-is-model]')).toHaveAttribute('data-is-state','before');
    await example.locator('[data-progress-reset]').tap();await expect(example.locator('[data-lesson-progress]')).toHaveAttribute('data-progress-step','0');
    await example.locator('summary').tap();await expect(example).not.toHaveAttribute('open','');
   }
   await p.close();
  }
  await touch.close();
 }finally{await browser.close();}
}
await writeFile(`${output}/results.json`,JSON.stringify(summary,null,2)+'\n');
console.log('Information design browser checks passed.');
