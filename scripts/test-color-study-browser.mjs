// PLAYWRIGHT_MODULE=/path/to/playwright JOHO_BROWSER=webkit node scripts/test-color-study-browser.mjs [base URL]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = require(modulePath);
const { expect } = require(`${modulePath}/test`);
const base = new URL(process.argv[2] || 'http://127.0.0.1:8774/');
const name = process.env.JOHO_BROWSER === 'webkit' ? 'WebKit' : 'Chrome';
const engine = name === 'WebKit' ? webkit : chromium;
const browser = await engine.launch(name === 'Chrome' ? { channel: 'chrome', headless: true } : { headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === base.origin && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
});
const page = await context.newPage();
const load = async file => {
  await page.goto(new URL(file, base).href, { waitUntil: 'networkidle' });
  await page.locator('#site-header').waitFor();
};
const frame = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  await load('color.html');
  await expect(page.locator('a[href="./color-rgb.html"]')).toBeVisible();
  check(await page.locator('.color-wheel__node').count() === 24, '両方の環がHTML/CSSの12色');
  await page.locator('#study-hue').fill('60');
  await expect(page.locator('[data-hsl-current-values]')).toContainText('#FFFF00');
  await expect(page.locator('[data-hsl-reference-values]')).toContainText('#FF0000');
  await page.locator('[data-hsl-save]').click();
  await page.locator('#study-hue').fill('180');
  await expect(page.locator('[data-hsl-reference-values]')).toContainText('#FFFF00');
  await expect(page.locator('[data-hsl-current-values]')).toContainText('#00FFFF');
  await page.locator('[data-hsl-reset]').click();
  await expect(page.locator('[data-hsl-reference-values]')).toContainText('#FF0000');
  await page.locator('#study-saturation').press('Home');
  await expect(page.locator('[data-hsl-current-values]')).toContainText('#808080');
  await page.locator('#study-saturation').press('End');
  await page.locator('#study-lightness').press('Home');
  await expect(page.locator('[data-hsl-current-values]')).toContainText('#000000');
  await page.locator('#study-lightness').press('End');
  await expect(page.locator('[data-hsl-current-values]')).toContainText('#FFFFFF');
  await page.locator('[data-hsl-reset]').click();
  checks += 10;

  const contrast = page.locator('[data-color-contrast]');
  const colors = () => contrast.locator('[data-contrast-sample]').evaluateAll(nodes => nodes.map(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]));
  let pair = await colors();
  check(pair[0][1] === pair[1][1] && pair[0][1] === 'rgb(128, 128, 128)', '対比実験の文字色は同一');
  await contrast.locator('[data-contrast-swap]').click();
  check((await colors())[0][0] === pair[1][0], '背景だけを入れ替える');
  await page.locator('#contrast-mode').selectOption('hue');
  pair = await colors();
  check(pair[0][0] !== pair[1][0] && pair[0][1] === pair[1][1], '色相の対比も文字色を保持');
  await contrast.locator('[data-contrast-reveal]').press('Enter');
  await expect(contrast.locator('#contrast-answer')).toBeVisible();
  await contrast.locator('[data-contrast-reveal]').press('Space');
  await expect(contrast.locator('#contrast-answer')).toBeHidden();
  checks += 2;

  const after = page.locator('[data-color-afterimage]');
  const circle = after.locator('[data-afterimage-circle]');
  for (const color of ['red','yellow','green','blue']) {
    await after.locator(`[data-afterimage-color="${color}"]`).click();
    await expect(after).toHaveAttribute('data-phase', 'idle');
    await after.locator('[data-afterimage-next]').press('Enter');
    await expect(after).toHaveAttribute('data-phase', 'view');
    check(await circle.evaluate(node => getComputedStyle(node).transitionDuration) === '0s', '白への切替を遅延させない');
    await circle.press('Space');
    await expect(after).toHaveAttribute('data-phase', 'white');
    check(await circle.evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(255, 255, 255)', 'テーマによらない白');
    await after.locator('[data-afterimage-next]').click();
    await expect(after).toHaveAttribute('data-phase', 'view');
    checks += 4;
  }

  const viewCases = [];
  for (const file of ['color.html', 'color-rgb.html']) {
    await load(file);
    for (const width of [1440,720,390]) {
      await page.setViewportSize({width,height:1000});
      for (const theme of ['system','light','dark']) for (const size of ['standard','large','xlarge']) {
        await page.evaluate(({theme,size}) => { window.siteTheme.setPreference(theme); window.siteTextSize.setPreference(size); }, {theme,size});
        await frame();
        const result = await page.evaluate(() => {
          const wheels = [...document.querySelectorAll('.color-wheel')];
          const wheelFits = wheels.every(wheel => {
            const r = wheel.getBoundingClientRect();
            return [...wheel.querySelectorAll('.color-wheel__node')].every(node => { const b=node.getBoundingClientRect(); return b.left>=r.left-1 && b.right<=r.right+1 && b.top>=r.top-1 && b.bottom<=r.bottom+1; });
          });
          const frame = document.querySelector('.color-samples__table-frame');
          const table = document.querySelector('#color-code');
          const compactRows = [...document.querySelectorAll('.color-strip')].filter(row=>row.querySelector(':scope > .cc-tile-col06'));
          return { fits:document.documentElement.scrollWidth<=innerWidth+1, wheelFits,
            compactRowsFit: compactRows.every(row=>row.scrollWidth<=row.clientWidth+1),
            frameScroll: frame ? frame.scrollWidth>frame.clientWidth : null,
            tableDisplay: table ? getComputedStyle(table).display : null,
            tableOverflow: table ? getComputedStyle(table).overflowX : null,
            tableFont: table ? parseFloat(getComputedStyle(table).fontSize) : null
          };
        });
        check(result.fits, `${file} ${width}px ${theme}/${size}: ページが横に出ない`);
        check(result.wheelFits, '円が色相環の領域内に収まる');
        check(result.compactRowsFit, '6色の補色一覧が枠内に収まる');
        if(file==='color-rgb.html') {
          check(result.tableDisplay==='table' && result.tableOverflow==='visible', '横スクロールは表枠へ任せる');
          if(width===390) check(result.frameScroll, '狭い画面では表枠を横スクロールできる');
        }
        viewCases.push({file,width,theme,size,...result});
      }
    }
  }
  const fonts = viewCases.filter(c=>c.file==='color-rgb.html' && c.width===390 && c.theme==='light').map(c=>c.tableFont);
  check(fonts[0]<fonts[1] && fonts[1]<fonts[2], '見本表も3段階の文字サイズに従う');

  for (const osTheme of ['light','dark']) {
    await page.emulateMedia({colorScheme:osTheme});
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>window.siteTheme.setPreference(theme),theme);
      const color = await page.locator('main').evaluate(node => getComputedStyle(node).color);
      check(color=== (theme==='dark'?'rgb(204, 204, 204)':'rgb(51, 51, 51)'), 'OSと異なる手動テーマでも本文色が追従');
    }
  }

  await page.setViewportSize({width:390,height:1000});
  const samples = page.locator('.color-samples__table-frame');
  await samples.evaluate(node=>node.scrollLeft=250);
  const oldCell = await page.locator('#color-samples-body td').first().elementHandle();
  for (const saturation of [0,25,50,75,100]) {
    await page.locator('#s-slider').fill(String(saturation));
    const faults = await page.locator('#color-samples-body td').evaluateAll(cells => cells.filter(cell=>{
      const rgb=[...cell.querySelectorAll('[data-channel]')].map(line=>Number(line.textContent.split(':')[1]));
      const hex='#'+rgb.map(value=>value.toString(16).padStart(2,'0').toUpperCase()).join('');
      const css=getComputedStyle(cell);
      return hex!==cell.querySelector('strong').textContent || css.backgroundColor!==`rgb(${rgb.join(', ')})` || getComputedStyle(cell.querySelector('strong')).color!==css.color;
    }).length);
    check(faults===0, `彩度${saturation}: 全252セルの値・背景・文字色一致`);
    check(await samples.evaluate(node=>node.scrollLeft)>=249, '更新時に横スクロール位置を保持');
  }
  check(await oldCell.evaluate(node=>node===document.querySelector('#color-samples-body td')), 'セルを作り直さない');
  await page.locator('#s-slider').press('Home');
  await expect(page.locator('#saturation')).toHaveText('0%');
  await page.locator('#s-slider').press('ArrowRight');
  await expect(page.locator('#saturation')).toHaveText('1%');
  await page.locator('#s-slider').press('End');
  await expect(page.locator('#saturation')).toHaveText('100%');
  await expect(page.locator('#s-slider')).toBeFocused();
  checks += 4;

  const touch = await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await touch.route('**/*',route=>new URL(route.request().url()).origin===base.origin?route.continue():route.abort());
  const touchPage = await touch.newPage();
  await touchPage.goto(new URL('color.html',base).href,{waitUntil:'networkidle'});
  await touchPage.locator('[data-afterimage-next]').tap();
  await expect(touchPage.locator('[data-color-afterimage]')).toHaveAttribute('data-phase','view');
  await touchPage.locator('[data-afterimage-circle]').tap();
  await expect(touchPage.locator('[data-color-afterimage]')).toHaveAttribute('data-phase','white');
  await touchPage.goto(new URL('color-rgb.html',base).href,{waitUntil:'networkidle'});
  const slider = touchPage.locator('#s-slider');
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  await touchPage.touchscreen.tap(box.x+box.width*.35,box.y+box.height/2);
  check(Number(await slider.inputValue())<70, 'タッチで彩度を変更');
  await touch.close();

  const noJs = await browser.newContext({javaScriptEnabled:false});
  await noJs.route('**/*',route=>new URL(route.request().url()).origin===base.origin?route.continue():route.abort());
  const staticPage = await noJs.newPage();
  for (const file of ['color.html','color-rgb.html']) {
    await staticPage.goto(new URL(file,base).href);
    await expect(staticPage.locator('noscript p')).toContainText('JavaScript');
    await expect(staticPage.locator('noscript p')).toBeVisible();
    check(await staticPage.locator('input:not([disabled]),button:not([disabled])').count()===0, 'JS無効時は反応しない操作欄を無効化');
  }
  check(await staticPage.locator('h1').count()===1, '見本ページの見出し');
  await noJs.close();
  await page.emulateMedia({reducedMotion:'reduce'});
  await load('color.html');
  await page.locator('[data-afterimage-next]').click();
  await page.locator('[data-afterimage-next]').click();
  await expect(page.locator('[data-color-afterimage]')).toHaveAttribute('data-phase','white');
  check(errors.length===0, `例外・同一サイト404なし: ${errors.join('\n')}`);

  if(process.env.JOHO_SCREENSHOT_DIR) {
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>window.siteTheme.setPreference('dark'));
    await page.locator('.color-wheel--rgb').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${process.env.JOHO_SCREENSHOT_DIR}/color-rgb-wheel-dark.png`});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>window.siteTheme.setPreference('light'));
    await page.locator('.color-wheel--psychological').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${process.env.JOHO_SCREENSHOT_DIR}/color-psychological-mobile.png`});
    await load('color-rgb.html');
    await page.locator('#s-slider').fill('50');
    await page.locator('#table-heading').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${process.env.JOHO_SCREENSHOT_DIR}/color-samples-mobile.png`});
    await page.locator('.color-samples__table-frame').evaluate(node=>window.scrollTo({top:node.getBoundingClientRect().top+window.scrollY-100,behavior:'instant'}));
    await page.screenshot({path:`${process.env.JOHO_SCREENSHOT_DIR}/color-samples-table-mobile.png`});
    await load('color.html');
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-color-attributes]').screenshot({path:`${process.env.JOHO_SCREENSHOT_DIR}/color-attributes.png`});
    await page.locator('[data-color-contrast]').screenshot({path:`${process.env.JOHO_SCREENSHOT_DIR}/color-contrast.png`});
    await page.locator('[data-color-afterimage]').screenshot({path:`${process.env.JOHO_SCREENSHOT_DIR}/color-afterimage.png`});
  }
  console.log(`${name}: ${checks}件合格（2ページ×3幅×3テーマ×3文字サイズ、3実験、252色見本、キー/タッチ、JS無効、例外/404）`);
} finally {
  await context.close();
  await browser.close();
}
