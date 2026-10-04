import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/Users/takashi/Documents/GAS/webedu/node_modules/playwright');
const base=process.env.JOHO_TEST_URL||'http://127.0.0.1:8877/';
const output=process.env.JOHO_TEST_OUTPUT||'/tmp/is5-enhance-print';
await mkdir(output,{recursive:true});
const pages=await readFile(new URL('../js/pages.js',import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome'}),results=[];
try {
  for(const id of ['is51','is52','is53']) {
    // A new context guarantees that no scene has been visited or cached before print.
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('https://**/*',r=>r.abort());
    await context.route('**/js/pages.js',r=>r.fulfill({contentType:'application/javascript',body:pages+`\nwindow.pages.${id}={id:'${id}',title:'確認用',mainTitle:'情報社会',category:'問題解決',fileName:'${id}.html',release:false,show:false,next:[],back:[]};`}));
    const page=await context.newPage();await page.goto(`${base}${id}.html`);await page.locator('body.lesson-slide-ready').waitFor();
    const before=await page.locator('.ps-scene img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),complete:img.complete,naturalWidth:img.naturalWidth})));
    const pdf=await page.pdf({path:`${output}/${id}-fresh.pdf`,format:'A4',printBackground:true,margin:{top:'12mm',right:'12mm',bottom:'12mm',left:'12mm'}});
    const after=await page.locator('.ps-scene img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight})));
    assert.equal(after.length,3);assert.ok(after.every(img=>img.complete&&img.naturalWidth===1672&&img.naturalHeight===941),`${id}: fresh print loads all images`);
    // The PDF must contain each raster scene at its original intrinsic dimensions.
    const source=pdf.toString('latin1');
    const imageCount=(source.match(/\/Width 1672\s*\/Height 941/g)||[]).length;
    assert.equal(imageCount,3,`${id}: three raster scenes embedded in fresh PDF`);
    assert.equal(await page.locator('[data-lesson-progress][data-progress-step="0"]').count(),5);
    results.push({id,before,after,pdfBytes:pdf.length,pdfSceneImages:imageCount,status:'passed'});
    await context.close();
  }
} finally {await browser.close();}
await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
const safari=await webkit.launch(),webkitResults=[];
try {
  for(const width of [1440,390]) for(const id of ['is51','is52','is53']) {
    const context=await safari.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    await context.route('https://**/*',r=>r.abort());
    await context.route('**/js/pages.js',r=>r.fulfill({contentType:'application/javascript',body:pages+`\nwindow.pages.${id}={id:'${id}',title:'確認用',mainTitle:'情報社会',category:'問題解決',fileName:'${id}.html',release:false,show:false,next:[],back:[]};`}));
    const page=await context.newPage();await page.goto(`${base}${id}.html`);await page.locator('body.lesson-slide-ready').waitFor();
    assert.equal(await page.locator('#page_header').isVisible(),true);
    const before=await page.locator('.ps-scene img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),naturalWidth:img.naturalWidth,loading:img.getAttribute('loading')})));
    const saved=await page.locator('[data-lesson-progress]').evaluateAll(groups=>groups.map(group=>group.dataset.progressStep));
    await page.emulateMedia({media:'print'});await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));
    await page.waitForFunction(()=>[...document.querySelectorAll('.ps-scene img')].every(img=>img.complete&&img.naturalWidth===1672));
    assert.equal(await page.locator('.ps-scene img[loading="eager"]').count(),3);
    // A second print notification must not replace the saved original lazy settings.
    await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));
    const printed=await page.locator('.ps-scene img').evaluateAll(images=>images.map(img=>({naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,loading:img.getAttribute('loading')})));
    await page.emulateMedia({media:'screen'});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));
    const restored=await page.locator('.ps-scene img').evaluateAll(images=>images.map(img=>img.getAttribute('loading')));
    assert.deepEqual(restored,before.map(img=>img.loading));
    assert.deepEqual(await page.locator('[data-lesson-progress]').evaluateAll(groups=>groups.map(group=>group.dataset.progressStep)),saved);
    webkitResults.push({id,width,before,printed,restored,status:'passed'});await context.close();
  }
} finally {await safari.close();}
await writeFile(`${output}/webkit-results.json`,JSON.stringify(webkitResults,null,2));
console.log(JSON.stringify(webkitResults,null,2));
