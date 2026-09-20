/* Browser-level checks for the static presentation viewer. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const Core = require('../core.js');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function fixture() {
  const doc = Core.createDocument();
  doc.id = 'presentation-document'; doc.name = '発表テスト';
  doc.pages[0].id = 'page-a'; doc.pages[0].name = '最初のページ';
  const second = Core.createPage('最後のページ', { width: 720, height: 1280, unit: 'px', infinite: false });
  second.id = 'page-b'; doc.pages.push(second);
  return Core.validateDocument(doc);
}

test('presentation viewer keeps document isolated and navigates without wrapping', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.setContent('<button id="opener">発表</button><style>' + source('presentation.css') + '</style>');
  await page.addScriptTag({ content: source('core.js') });
  await page.addScriptTag({ content: source('svg.js') });
  await page.addScriptTag({ content: source('layers.js') });
  await page.addScriptTag({ content: source('presentation-data.js') });
  await page.addScriptTag({ content: source('presentation.js') });
  const original = fixture();
  await page.evaluate(doc => {window.inputDocument=doc;window.viewer = IlapoPresentation.open(doc, { pageId: 'page-b', opener: document.getElementById('opener') });}, original);
  assert.equal(await page.evaluate(() => viewer.getState().pageId), 'page-b');
  assert.equal(await page.locator('.ilapo-present-document').textContent(), '発表テスト');
  assert.equal(await page.locator('.ilapo-present-status').textContent(), '2 / 2　最後のページ');
  assert.equal(await page.locator('.ilapo-present-next').isDisabled(), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 1);
  await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>viewer.getState().currentPage),2,'Space advances from the initially focused slide');
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>viewer.getState().currentPage),2,'Enter advances without closing the viewer');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 1);
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 2);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 2);
  assert.deepEqual(await page.evaluate(() => window.inputDocument), original);
  await page.locator('.ilapo-present-paper').click();
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 2, 'last page does not wrap after paper click');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#ilapo-presentation', { state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
});

test('presentation traps focus, supports swipe, fullscreen fallback, and narrow layouts', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 736 }, isMobile: true, hasTouch: true });
  await page.setContent('<button id="opener">発表</button><style>' + source('presentation.css') + '</style>');
  await page.addScriptTag({ content: source('core.js') });
  await page.addScriptTag({ content: source('svg.js') });
  await page.addScriptTag({ content: source('layers.js') });
  await page.addScriptTag({ content: source('presentation-data.js') });
  await page.addScriptTag({ content: source('presentation.js') });
  await page.evaluate(doc => {
    doc.pages.push({...structuredClone(doc.pages[1]),id:'page-c',name:'3ページ'});
    const dialog = IlapoPresentation.open(doc, { opener: document.getElementById('opener') });
    window.viewer = dialog;
    const element = document.querySelector('.ilapo-present-viewport');
    element.requestFullscreen = () => { Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element }); document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
    document.exitFullscreen = () => { Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null }); document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
  }, fixture());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const heights = await page.locator('.ilapo-present-dialog button').evaluateAll(buttons => buttons.filter(button => !button.hidden).map(button => button.getBoundingClientRect().height));
  assert(heights.every(height => height >= 44), 'touch controls retain a 44px target');
  await page.locator('.ilapo-present-fullscreen').click();
  assert.equal(await page.evaluate(() => viewer.getState().fullscreen), true);
  await page.locator('.ilapo-present-fullscreen').click();
  assert.equal(await page.evaluate(() => viewer.getState().fullscreen), false);
  await page.locator('.ilapo-present-close').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('ilapo-present-close')), true, 'Tab cycles inside the viewer');
  const viewport = page.locator('.ilapo-present-viewport');
  await viewport.dispatchEvent('pointerdown', { clientX: 300, clientY: 350 });
  await viewport.dispatchEvent('pointerup', { clientX: 100, clientY: 350 });
  await viewport.dispatchEvent('click');
  assert.equal(await page.evaluate(() => viewer.getState().currentPage), 2, 'left swipe advances');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#ilapo-presentation', { state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
});

test('free canvas uses artwork ratio, reopening cleans up, and existing fullscreen is retained',async t=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:900,height:700}});
  await page.setContent('<button id="opener">発表</button><style>'+source('presentation.css')+'</style>');
  for(const file of ['core.js','geometry.js','svg.js','layers.js','presentation-data.js','presentation.js'])await page.addScriptTag({content:source(file)});
  const result=await page.evaluate(()=>{
    const d=IlapoCore.createDocument(),p=d.pages[0];p.board=IlapoCore.boardPreset('free');p.objects=[IlapoCore.makeText(-50,-20,'自由キャンバス',{fontSize:40,stroke:'none'})];
    Object.defineProperty(document,'fullscreenElement',{configurable:true,value:document.documentElement});let exitCalls=0;document.exitFullscreen=()=>{exitCalls++;return Promise.resolve();};
    const v=IlapoPresentation.open(d,{opener:document.getElementById('opener')}),svg=document.querySelector('.ilapo-present-paper svg'),b=document.querySelector('.ilapo-present-paper').getBoundingClientRect(),box=svg.viewBox.baseVal;
    const ratio=b.width/b.height,expected=box.width/box.height;v.close();
    const v2=IlapoPresentation.open(d,{opener:document.getElementById('opener')});const v3=IlapoPresentation.open(d,{opener:document.getElementById('opener')});
    const onlyOne=document.querySelectorAll('#ilapo-presentation').length===1&&v2.getState().open===false;v3.close();
    return {ratio,expected,onlyOne,overflow:document.body.style.overflow,exitCalls};
  });
  assert(Math.abs(result.ratio-result.expected)<.001);assert(result.onlyOne);assert.equal(result.overflow,'');assert.equal(result.exitCalls,0);
});
