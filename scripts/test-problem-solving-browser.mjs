import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const modulePath=process.env.PLAYWRIGHT_MODULE||'/Users/takashi/Documents/GAS/webedu/node_modules/playwright';
const {chromium,webkit}=require(modulePath);
const base=process.env.JOHO_TEST_URL||'http://127.0.0.1:8875/';
const output=process.env.JOHO_TEST_OUTPUT||'/tmp/is5-review';
await mkdir(output,{recursive:true});
const rawPages=await readFile(new URL('../js/pages.js',import.meta.url),'utf8');
const metadata=Object.fromEntries([['is51','5-1. 問題を発見し、整理する'],['is52','5-2. アイデアを出し、解決策を考える'],['is53','5-3. 実行し、評価して改善する']].map(([id,title])=>[id,{id,title,mainTitle:'情報社会',category:'問題解決',detail:'理想と現状を比べ、解決策を試して改善する。',fileName:`${id}.html`,release:false,show:false,next:[],back:[]} ]));
const results=[];
async function go(page,n) {await page.evaluate(n=>{location.hash=`#headline_${n}`;},n);await page.locator(`#headline_${n}`).waitFor({state:'visible'});}
async function openStep(page,n,step=2) {await go(page,n); await page.evaluate(({n,step})=>window.JohoLessonProgress.set(document.querySelector(`#headline_${n}`).closest('article').querySelector('[data-lesson-progress]'),step),{n,step});}
async function fit(page,label) {
  // ResizeObserver and the deck must finish matching the wrapped header before capture.
  await page.waitForFunction(()=>{
    const header=document.querySelector('#site-header'), nav=document.querySelector('.lesson-slide-deck__navigation');
    if(!header||!nav) return true;
    const h=header.getBoundingClientRect(), n=nav.getBoundingClientRect();
    const configured=parseFloat(nav.style.getPropertyValue('--lesson-slide-header-height'));
    return Math.abs(h.height-configured)<1 && n.top>=h.bottom-1;
  });
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const state=await page.evaluate(()=>{const slide=[...document.querySelectorAll('.lesson-slide')].find(x=>!x.hidden);return {w:innerWidth,page:document.documentElement.scrollWidth,slide:slide.scrollWidth,client:slide.clientWidth};});
  assert.ok(state.page<=state.w+2,`${label}: page overflow ${JSON.stringify(state)}`);
  assert.ok(state.slide<=state.client+2,`${label}: slide overflow ${JSON.stringify(state)}`);
  const small=await page.locator('[data-ps-widget] :is(button,select,input[type="text"],input[type="range"])').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,id:el.id,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})).filter(item=>item.width>0&&item.height<43.5));
  assert.deepEqual(small,[],`${label}: 44px learning controls`);
  const vertical=await page.evaluate(()=>{const h=document.querySelector('#site-header').getBoundingClientRect(),n=document.querySelector('.lesson-slide-deck__navigation').getBoundingClientRect(),s=[...document.querySelectorAll('.lesson-slide')].find(x=>!x.hidden).getBoundingClientRect();return {headerBottom:h.bottom,navTop:n.top,navBottom:n.bottom,slideTop:s.top};});
  assert.ok(vertical.navTop>=vertical.headerBottom-1&&vertical.slideTop>=vertical.navBottom-1,`${label}: header overlap ${JSON.stringify(vertical)}`);
}
for(const name of (process.env.JOHO_TEST_BROWSERS||'chrome,webkit').split(',')) {
  const browser=await (name==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('https://**/*',r=>r.abort());
    // Candidate metadata is supplied in-memory only. The canonical pages.js is never edited here.
    await context.route('**/js/pages.js',r=>r.fulfill({contentType:'application/javascript',body:rawPages+`\nObject.assign(window.pages,${JSON.stringify(metadata)});`}));
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    for(const id of Object.keys(metadata)) {
      await page.goto(`${base}${id}.html`);await page.locator('body.lesson-slide-ready').waitFor();
      assert.match(await page.locator('#page_header').innerText(),new RegExp(metadata[id].title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      assert.equal(await page.locator('.is-terms details[open]').count(),0);
      for(let n=1;n<=5;n++) {
        await go(page,n);const group=page.locator(`#${id}-progress-${n}`);
        assert.equal(await group.getAttribute('data-progress-step'),'0');
        await group.locator('[data-progress-next]').press('Enter');assert.equal(await group.getAttribute('data-progress-step'),'1');
        await group.locator('[data-progress-next]').press('Space');assert.equal(await group.getAttribute('data-progress-step'),'2');
        assert.equal(await group.locator('[data-progress-next]').isDisabled(),true);
        assert.equal(await group.locator('.is-observe').isVisible(),true);
        await group.locator('[data-progress-prev]').press('Enter');assert.equal(await group.getAttribute('data-progress-step'),'1');
        await group.locator('[data-progress-reset]').press('Enter');assert.equal(await group.getAttribute('data-progress-step'),'0');
      }
      // Meaningful learning actions, editing and reset.
      if(id==='is51') {
        await openStep(page,1);await page.locator('[data-ps-target]').focus();await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('[data-ps-target-output]').innerText(),'3件以下');
        assert.equal(await page.locator('[data-ps-target-dot]').getAttribute('cx'),'250');
        await page.locator('[data-ps-widget="goal"] [data-ps-reset]').click();assert.equal(await page.locator('[data-ps-target]').inputValue(),'2');
        await openStep(page,3);const fields=page.locator('[data-ps-fact]');
        for(let i=0;i<await fields.count();i++) await fields.nth(i).selectOption(await fields.nth(i).getAttribute('data-ps-fact'));
        await page.locator('[data-ps-widget="facts"] [data-ps-check]').click();assert.match(await page.locator('[data-ps-widget="facts"] [data-ps-feedback]').innerText(),/5項目中5項目/);
        await fields.first().selectOption('interpretation');await page.locator('[data-ps-widget="facts"] [data-ps-check]').click();assert.match(await page.locator('[data-ps-widget="facts"] [data-ps-feedback]').innerText(),/5項目中4項目/);
        await openStep(page,5);for(const state of ['overlap','missing','complete']) {await page.locator(`[data-is-model="ps51-mece"] [data-is-select="${state}"]`).press('Enter');assert.equal(await page.locator(`[data-is-panel="${state}"] svg`).isVisible(),true);}
      }
      if(id==='is52') {
        await openStep(page,2);await page.locator('[data-ps-idea]').fill('<script>安全に文字として扱う</script>');await page.locator('[data-ps-idea]').press('Enter');
        assert.equal(await page.locator('[data-ps-added]').innerText(),'<script>安全に文字として扱う</script>');assert.equal(await page.locator('[data-ps-added] script').count(),0);
        await page.locator('[data-ps-widget="brain"] [data-ps-reset]').click();assert.equal(await page.locator('[data-ps-added]').count(),0);
        await openStep(page,3);const cardSelect=page.locator('#ps52-card-1');await cardSelect.focus();await cardSelect.selectOption('place');
        assert.equal(await page.locator('[data-ps-bucket="place"] [data-ps-card]').count(),1);assert.equal(await cardSelect.evaluate(el=>el===document.activeElement),true);
        await page.locator('[data-ps-widget="cards"] [data-ps-reset]').click();assert.equal(await page.locator('[data-ps-bucket="pool"] [data-ps-card]').count(),6);
        await openStep(page,4);const weights=page.locator('[data-ps-weight]');await weights.nth(0).selectOption('3');assert.match(await page.locator('[data-ps-widget="rank"] [data-ps-feedback]').innerText(),/現在はBが最上位/);
        await weights.nth(0).selectOption('1');await weights.nth(1).selectOption('3');assert.match(await page.locator('[data-ps-widget="rank"] [data-ps-feedback]').innerText(),/現在はCが最上位/);
        await page.locator('[data-ps-widget="rank"] [data-ps-reset]').click();assert.match(await page.locator('[data-ps-widget="rank"] [data-ps-feedback]').innerText(),/現在はAが最上位/);
      }
      if(id==='is53') {
        await openStep(page,2);await page.locator('[data-ps-prep]').selectOption('4');assert.match(await page.locator('[data-ps-widget="schedule"] [data-ps-feedback]').innerText(),/終わる前/);
        await page.locator('[data-ps-trial]').selectOption('5');assert.match(await page.locator('[data-ps-widget="schedule"] [data-ps-feedback]').innerText(),/条件を満たし/);
        await page.locator('[data-ps-widget="schedule"] [data-ps-reset]').click();assert.equal(await page.locator('[data-ps-prep]').inputValue(),'2');
      }
      for(const model of await page.locator('[data-is-model]').all()) {
        const n=await model.evaluate(el=>Number(el.closest('section').querySelector('h2').id.split('_')[1]));await openStep(page,n);
        for(const choice of await model.locator('[data-is-select]').all()) {await choice.press('Space');assert.equal(await choice.getAttribute('aria-pressed'),'true');}
        await model.locator('[data-is-reset]').press('Enter');assert.equal(await model.getAttribute('data-is-state'),await model.getAttribute('data-is-default'));
      }
      await go(page,7);const quiz=page.locator('[data-ps-widget="quiz"]');await quiz.locator('input').first().check();await quiz.locator('[data-ps-check]').click();assert.equal(await quiz.locator('[data-ps-answer-text]').isVisible(),true);
      await quiz.locator(`input[value="${await quiz.getAttribute('data-ps-answer')}"]`).check();await quiz.locator('[data-ps-check]').click();assert.match(await quiz.locator('[data-ps-feedback]').innerText(),/一致/);await quiz.locator('[data-ps-reset]').click();assert.equal(await quiz.locator('input:checked').count(),0);
      await go(page,6);await page.locator('.is-terms summary').first().press('Enter');assert.equal(await page.locator('.is-terms details').first().getAttribute('open'),'');
      for(const width of [1440,720,390]) {
        await page.setViewportSize({width,height:1000});
        for(const theme of ['light','dark','system']) for(const size of ['standard','large','xlarge']) {
          await page.emulateMedia({colorScheme:theme==='system'?'dark':theme});
          await page.evaluate(({theme,size})=>{window.siteTheme.setPreference(theme,{persist:false});window.siteTextSize.setPreference(size,{persist:false});},{theme,size});
          for(let n=1;n<=7;n++) {if(n<=5) await openStep(page,n);else await go(page,n);await fit(page,`${name} ${id} ${width} ${theme} ${size} ${n}`);}
        }
      }
      await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{window.siteTheme.setPreference('light',{persist:false});window.siteTextSize.setPreference('standard',{persist:false});});
      await openStep(page,id==='is51'?5:id==='is52'?4:2);await fit(page,`${name} ${id} desktop screenshot`);await page.screenshot({path:`${output}/${name}-${id}-desktop.png`});
      await page.setViewportSize({width:390,height:900});await fit(page,`${name} ${id} mobile screenshot`);await page.screenshot({path:`${output}/${name}-${id}-mobile.png`});
      const saved=await page.evaluate(()=>[...document.querySelectorAll('[data-lesson-progress]')].map(el=>el.dataset.progressStep));
      await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('.is-terms details:not([open])').count(),0);
      for(const stage of await page.locator('[data-lesson-stage-from]').all()) assert.equal(await stage.isVisible(),true);
      for(const panel of await page.locator('[data-is-panel]').all()) assert.equal(await panel.isVisible(),true);
      await page.emulateMedia({media:'screen'});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));
      assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('[data-lesson-progress]')].map(el=>el.dataset.progressStep)),saved);
      // Common slide navigation and hash preserve widget state.
      await page.evaluate(()=>{location.hash='#headline_1';});await page.locator('.lesson-slide-deck__button--next').press('Enter');assert.equal(await page.locator('#headline_2').isVisible(),true);
      await page.evaluate(()=>{location.hash='#headline_1';});await page.locator('#headline_1').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#headline_2').isVisible(),true);
      results.push({browser:name,id,layouts:189,status:'passed'});
    }
    assert.deepEqual(errors,[]);
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});await nojs.route('https://**/*',r=>r.abort());const fallback=await nojs.newPage();
    for(const id of Object.keys(metadata)) {await fallback.goto(`${base}${id}.html`);assert.equal(await fallback.locator('section[data-lesson-slide]:visible').count(),7);for(const stage of await fallback.locator('[data-lesson-stage-from]').all())assert.equal(await stage.isVisible(),true);assert.equal(await fallback.locator('.is-terms details:not([open])').count(),0);const widths=await fallback.evaluate(()=>({w:innerWidth,page:document.documentElement.scrollWidth}));assert.ok(widths.page<=widths.w+2);}
    await nojs.close();await context.close();
  } finally {await browser.close();}
}
await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
