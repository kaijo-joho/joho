// Display-state migration and code-viewing regression. Requires a local server and Playwright.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8894/';
const output = process.env.JOHO_TEST_OUTPUT_DIR || '/private/tmp/joho-display-settings-20261026';
await mkdir(output, {recursive:true});

for (const engine of (process.env.JOHO_TEST_BROWSERS || 'chrome,webkit').split(',')) {
  const browser = engine === 'chrome' ? await chromium.launch({channel:'chrome'}) : await webkit.launch();
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}, hasTouch:true});
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => {
      if (message.type()==='error' && /integrity|valid digest|Subresource/i.test(message.text())) failures.push(message.text());
    });
    page.on('response', response => {
      if (response.url().startsWith(base) && response.status() === 404) failures.push(response.url());
    });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('display-test-seeded')) return;
      localStorage.setItem('joho.textSize','large');
      localStorage.setItem('joho.siteTheme','dark');
      localStorage.setItem('unrelated-learning-data','preserve');
      sessionStorage.setItem('display-test-seeded','true');
    });
    const open = async url => {
      await page.goto(new URL(url,base).href);
      await page.locator('.site-display-settings__trigger').waitFor();
      await page.locator('.lesson-dock__btn--search').waitFor();
      await page.waitForFunction(() => window.siteCodeExamples && document.querySelector('pre[data-code-example-enhanced]'));
      await page.evaluate(() => document.fonts.ready);
    };
    const openCodeMenu = async tools => {
      const button = tools.locator('[data-action="menu"]');
      if (await button.getAttribute('aria-expanded') !== 'true') {
        await button.scrollIntoViewIfNeeded();
        await button.press('Enter');
      }
      const menu = page.locator('#' + await button.getAttribute('aria-controls'));
      await expect(menu).toBeVisible();
      return menu;
    };
    await open('py21.html');
    const initial = await page.evaluate(() => siteDisplaySettings.getState());
    assert.equal(initial.textScale,110); assert.equal(initial.theme,'dark');
    assert.equal(initial.codeWrap,false); assert.equal(initial.codeWrapExplicit,false);
    const beforeStorage = await page.evaluate(() => JSON.stringify({...localStorage}));
    await page.evaluate(() => siteDisplaySettings.setPreferences({textScale:113,codeWrap:true,lineSpacing:'relaxed',theme:'light'},{persist:false}));
    assert.equal(await page.evaluate(() => JSON.stringify({...localStorage})),beforeStorage,'iframe-style application does not persist');
    await page.evaluate(() => siteDisplaySettings.setPreferences({textScale:113,codeWrap:true,lineSpacing:'relaxed',theme:'light'}));
    await page.reload();
    await page.waitForFunction(() => window.siteDisplaySettings && document.querySelector('.code-example-tools'));
    assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),113,'custom scale survives reload');
    assert.equal(await page.evaluate(() => siteDisplaySettings.state.lineSpacing),'relaxed');
    const peer=await context.newPage();
    await peer.goto(new URL('py21.html',base).href);
    await peer.waitForFunction(() => window.siteDisplaySettings);
    await peer.evaluate(() => {
      window.displayTestPeerScales=[];
      document.addEventListener('joho:text-size-change',event => displayTestPeerScales.push(event.detail.scale));
    });
    await page.evaluate(() => siteDisplaySettings.setPreferences({textScale:116}));
    await expect.poll(() => peer.evaluate(() => siteDisplaySettings.state.textScale)).toBe(116);
    assert.ok(await peer.evaluate(() => !displayTestPeerScales.includes(120)),'cross-tab notifications do not round custom scales to their nearest preset');
    await peer.close();
    await page.evaluate(() => localStorage.setItem('joho.textSize','large'));
    await page.reload();
    await page.waitForFunction(() => window.siteDisplaySettings && document.querySelector('.code-example-tools'));
    assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),110,'a legacy-only update wins over a stale custom record after reload');
    await page.evaluate(() => {
      const copy = siteDisplaySettings.getState(); copy.textScale = 150;
      siteTextSize.setPreference('xlarge',{persist:false});
    });
    assert.equal(await page.evaluate(() => siteTextSize.scale),120,'legacy named API still works');
    await page.evaluate(() => siteDisplaySettings.reset());
    const resetStorage = await page.evaluate(() => ({...localStorage}));
    assert.equal(resetStorage['unrelated-learning-data'],'preserve');
    for (const key of ['joho.textSize','joho.siteTheme','joho.displaySettings']) assert.equal(resetStorage[key],undefined);

    const sources = await page.locator('pre[data-code-example-enhanced]').evaluateAll(nodes => nodes.map(pre => ({text:pre.textContent,id:pre.id})));
    assert.match(sources[0].text,/例 1-01/,'settings title never participates in lesson numbering');
    const pre = page.locator('pre[data-code-example-enhanced]').first();
    const tools = page.locator('.code-example-tools').first();
    // The original named sizes must retain their exact CSS values in light and dark modes.
    for (const theme of ['light','dark']) {
      for (const [textScale,paragraph,code] of [[100,1.1,theme==='dark'?1.05:1.1],[110,1.22,1.2],[120,1.34,1.3]]) {
        await page.evaluate(({theme,textScale}) => siteDisplaySettings.setPreferences({theme,textScale},{persist:false}),{theme,textScale});
        const measured=await pre.evaluate(node => {
          const probe=document.createElement('span'); probe.style.fontSize='var(--font-size-p)'; document.body.append(probe);
          const root=parseFloat(getComputedStyle(document.documentElement).fontSize);
          const result={paragraph:parseFloat(getComputedStyle(probe).fontSize)/root,code:parseFloat(getComputedStyle(node).fontSize)/root};
          probe.remove(); return result;
        });
        assert.ok(Math.abs(measured.paragraph-paragraph)<.001,'old paragraph preset remains exact');
        assert.ok(Math.abs(measured.code-code)<.001,'old code preset remains exact');
      }
    }
    await page.evaluate(() => siteDisplaySettings.reset());
    const originalSize = await pre.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    await openCodeMenu(tools);
    await tools.locator('[data-action="increase"]').click();
    await expect(tools.locator('[data-action="reset"]')).toHaveText('105%');
    assert.ok(await pre.evaluate(node => parseFloat(getComputedStyle(node).fontSize)) > originalSize);
    await tools.locator('[data-action="wrap"]').click();
    await expect(pre).toHaveAttribute('data-code-example-wrap','true');
    await page.evaluate(() => siteDisplaySettings.setPreferences({textScale:111},{source:'ui'}));
    await expect(tools.locator('[data-action="reset"]')).toHaveText('100%');
    await expect(pre).toHaveAttribute('data-code-example-wrap','false');
    await page.evaluate(() => { siteDisplaySettings.setContext({embeddedLesson:true}); siteDisplaySettings.setPreferences({codeWrap:true}); });
    await tools.locator('[data-action="wrap"]').click();
    await expect(pre).toHaveAttribute('data-code-example-wrap','false');
    await page.evaluate(() => siteDisplaySettings.setPreferences({codeWrap:null}));
    await expect(pre,'clearing an explicit setting also clears local overrides').toHaveAttribute('data-code-example-wrap','true');
    await page.evaluate(() => { siteDisplaySettings.setContext({embeddedLesson:false}); siteDisplaySettings.reset(); });
    await page.evaluate(() => { highlightCodeBlocksWithIds(); highlightCodeBlocksWithIds(); });
    assert.deepEqual(await page.locator('pre[data-code-example-enhanced]').evaluateAll(nodes => nodes.map(pre => ({text:pre.textContent,id:pre.id}))),sources,'view controls never rewrite code');
    assert.equal(await page.locator('.code-example-tools').count(),sources.length,'reinitialization does not duplicate controls');

    const trigger = page.locator('.site-display-settings__trigger');
    const panel = page.locator('.site-display-settings__panel');
    await trigger.press('Enter');
    await expect(panel).toBeVisible();
    const slider = panel.getByRole('slider');
    await slider.focus();
    await page.evaluate(() => siteDisplaySettings.setPreferences({textScale:110}));
    await slider.press('ArrowRight');
    assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),111,'keyboard steps escape detents');
    await slider.evaluate(node => {
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse'}));
      node.value='119'; node.dispatchEvent(new Event('input',{bubbles:true}));
      node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse'}));
    });
    assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),120,'pointer-style input snaps near preset');
    await panel.getByRole('button',{name:'標準：100%',exact:true}).click();
    assert.equal(await page.evaluate(() => siteDisplaySettings.state.textScale),100);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.locator('.site-theme-menu__trigger')).toHaveCount(0,'theme entry is not duplicated');

    for (const width of [1440,720,390,280]) {
      await page.setViewportSize({width,height:1000});
      for (const theme of ['system','light','dark']) {
        for (const textScale of [100,110,120,150]) {
          await page.evaluate(({theme,textScale}) => siteDisplaySettings.setPreferences({theme,textScale,lineSpacing:'relaxed',codeWrap:true},{persist:false}),{theme,textScale});
          await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
          await trigger.press('Enter');
          await expect(panel).toBeVisible();
          const fits = await panel.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 7 && rect.right <= innerWidth - 7 && rect.top >= 0 && rect.bottom <= innerHeight + 1 && node.scrollWidth <= node.clientWidth;
          });
          assert.ok(fits,'settings fit '+width+'px / '+theme+' / '+textScale);
          assert.ok(await tools.evaluate(node => node.getBoundingClientRect().right <= innerWidth),'toolbar fits narrow reading pane');
          if (theme==='light' && textScale===100) {
            await slider.focus();
            await page.waitForTimeout(150); // Wait for the existing menu entry animation before capturing it.
            await page.screenshot({path:path.join(output,engine+'-'+width+'-settings.png')});
          }
          await page.keyboard.press('Escape');
        }
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => siteDisplaySettings.setPreferences({textScale:120,codeWrap:true,lineSpacing:'relaxed',theme:'dark'},{persist:false}));
    const restricted = page.locator('pre.python:not(.example)').first();
    const restrictedTools = restricted.locator('xpath=preceding-sibling::*[1]');
    const originalParent = await restricted.evaluate(node => { window.displayTestOriginalParent=node.parentNode; return node.textContent; });
    const copyCheck = node => {
      const event = new Event('copy',{bubbles:true,cancelable:true}); node.dispatchEvent(event); return event.defaultPrevented;
    };
    assert.equal(await restricted.evaluate(copyCheck),true);
    await restrictedTools.locator('[data-action="menu"]').scrollIntoViewIfNeeded();
    await openCodeMenu(restrictedTools);
    await restrictedTools.locator('[data-action="enlarge"]').evaluate(node => {
      window.displayTestExpansions=[];
      document.addEventListener('joho:code-example-expanded',event => displayTestExpansions.push({...event.detail}));
      node.addEventListener('click',() => { window.displayTestReadingPosition={scrollX,scrollY}; },{capture:true,once:true});
    });
    await restrictedTools.locator('[data-action="enlarge"]').click();
    const modal = page.locator('#site-code-example-dialog');
    await expect(modal).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/code-example-modal-open/);
    assert.equal(await modal.locator('pre').evaluate(copyCheck),true,'copy restriction remains in expanded view');
    assert.equal(await modal.locator('pre').textContent(),originalParent);
    await openCodeMenu(modal.locator('.code-example-tools'));
    await modal.locator('[data-action="increase"]').click();
    await modal.locator('[data-action="wrap"]').click();
    await page.screenshot({path:path.join(output,engine+'-390-code-dialog.png')});
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-action="menu"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await page.waitForTimeout(180);
    assert.equal(await restricted.evaluate(node => node.parentNode===window.displayTestOriginalParent),true);
    assert.ok(await page.evaluate(() => Math.abs(scrollY-displayTestReadingPosition.scrollY)<2),'closing restores the reading position');
    assert.deepEqual(await page.evaluate(() => displayTestExpansions),await page.evaluate(() => [
      {open:true,...displayTestReadingPosition},{open:false,...displayTestReadingPosition}
    ]),'expansion notifications carry the original reading position');
    await expect(restrictedTools.locator('[data-action="menu"]')).toBeFocused();
    await openCodeMenu(restrictedTools);
    await restrictedTools.locator('[data-action="enlarge"]').press('Enter');
    await modal.evaluate(node => node.close());
    await expect(restricted).not.toHaveAttribute('data-code-example-dialog','true');
    await expect(page.locator('html')).not.toHaveClass(/code-example-modal-open/);
    await modal.evaluate(node => { node.savedShowModal=node.showModal; node.showModal=() => { throw new Error('synthetic showModal failure'); }; });
    await openCodeMenu(restrictedTools);
    await restrictedTools.locator('[data-action="enlarge"]').click();
    assert.equal(await page.evaluate(() => displayTestExpansions.at(-1).open),false,'opening failure notifies the host after restoring');
    assert.equal(await restricted.evaluate(node => node.parentNode===window.displayTestOriginalParent),true);
    await expect(page.locator('html')).not.toHaveClass(/code-example-modal-open/);
    await modal.evaluate(node => { node.showModal=node.savedShowModal; delete node.savedShowModal; });

    await open('html23.html?view=lesson');
    assert.ok(await page.locator('pre.html[data-code-example-enhanced]').count());
    assert.ok(await page.locator('pre.css[data-code-example-enhanced]').count());
    await page.evaluate(() => {
      const fixture=document.createElement('pre'); fixture.className='python example'; fixture.id='dynamic-code-test';
      fixture.textContent='if True:\n    print("dynamic")'; document.querySelector('section article').append(fixture);
      highlightEmbeddedCodeBlocks(fixture);
    });
    await expect(page.locator('#dynamic-code-test')).toHaveAttribute('data-code-example-enhanced','true');
    const dynamicText = await page.locator('#dynamic-code-test').textContent();
    const dynamicMenu = await openCodeMenu(page.locator('#dynamic-code-test').locator('xpath=preceding-sibling::*[1]'));
    await dynamicMenu.locator('[data-action="wrap"]').click();
    assert.equal(await page.locator('#dynamic-code-test').textContent(),dynamicText);

    // A same-origin owned explanation gets the embedded default, without storing it globally.
    await page.evaluate(() => {
      siteDisplaySettings.reset();
      const frame=document.createElement('iframe'); frame.id='display-settings-frame';
      frame.style.width='280px'; frame.style.height='700px';
      window.HtmlEditorNavigation={owns: win => win===frame.contentWindow,ready:()=>{}};
      frame.src='html13.html?view=lesson'; document.body.append(frame);
    });
    const frame = page.frameLocator('#display-settings-frame');
    await expect(frame.locator('html')).toHaveClass(/html-practice-embedded/);
    await expect(frame.locator('pre[data-code-example-enhanced]').first()).toHaveAttribute('data-code-example-wrap','true');
    const inherited = await page.locator('#display-settings-frame').evaluate(node => {
      const api=node.contentWindow.siteDisplaySettings;
      const before=JSON.stringify({...localStorage});
      api.setPreferences({textScale:119,lineSpacing:'relaxed',theme:'light',codeWrap:false},{persist:false});
      return {state:api.getState(),preserved:before===JSON.stringify({...localStorage})};
    });
    assert.equal(inherited.state.textScale,119); assert.equal(inherited.state.codeWrap,false); assert.ok(inherited.preserved);
    const frameTrigger = frame.locator('.code-example-menu-trigger').first();
    await frameTrigger.scrollIntoViewIfNeeded();
    await frameTrigger.press('Enter');
    const frameMenu = frame.locator('#' + await frameTrigger.getAttribute('aria-controls'));
    await expect(frameMenu).toBeVisible();
    assert.ok(await frameMenu.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.left >= 7 && rect.right <= innerWidth - 7 && node.scrollWidth <= node.clientWidth;
    }), 'code menu fits the owned 280px explanation iframe');
    await frameMenu.locator('[data-action="increase"]').click();
    await expect(frameMenu.locator('[data-action="reset"]')).toHaveText('105%');
    await frameMenu.locator('[data-action="increase"]').press('Escape');
    await expect(frameTrigger).toBeFocused();
    assert.deepEqual(failures,[],'no runtime errors or local 404');
    console.log(engine+': migration, persistence/reset scope, legacy API, detents, code preservation/copy protection, modal recovery, themes, responsive and owned iframe OK');
    await context.close();

    // The editor loads only these common modules, without main.js or the lesson layout.
    for (const blockedStorage of [false,true]) {
      const isolated = await browser.newContext({viewport:{width:390,height:844}});
      const standalone = await isolated.newPage();
      const standaloneErrors = [];
      standalone.on('pageerror', error => standaloneErrors.push(error.message));
      if (blockedStorage) await standalone.addInitScript(() => {
        for (const method of ['getItem','setItem','removeItem']) {
          Storage.prototype[method] = () => { throw new DOMException('Storage disabled','SecurityError'); };
        }
      });
      const fixtureURL = new URL('__display-settings-fixture.html',base).href;
      await standalone.route(fixtureURL,route => route.fulfill({contentType:'text/html',body:
        '<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<link rel="stylesheet" href="css/display-settings.css">' +
        '<script defer src="js/display_settings.js"></script><script defer src="js/display_settings_ui.js"></script>' +
        '</head><body style="margin:8px"><div id="settings-host"></div></body></html>'
      }));
      await standalone.goto(fixtureURL);
      await standalone.waitForFunction(() => window.siteDisplaySettingsUI?.createPanel);
      assert.equal(await standalone.evaluate(() => Boolean(window.__johoMainBootstrapped)),false);
      if (!blockedStorage) {
        for (const invalid of ['not json',JSON.stringify({version:2,textScale:140})]) {
          assert.equal(await standalone.evaluate(value => {
            localStorage.setItem('joho.displaySettings',value); return siteDisplaySettings.hasStoredPreferences();
          },invalid),false,'invalid shared state must not block legacy editor migration');
        }
        await standalone.evaluate(() => localStorage.removeItem('joho.displaySettings'));
      }
      const result = await standalone.evaluate(() => {
        const api=siteDisplaySettings;
        const defaults=api.getState();
        api.setContext({embeddedLesson:true});
        const embedded=api.getState();
        api.setPreferences({textScale:119,codeWrap:false,lineSpacing:'relaxed',theme:'dark'},{persist:false,source:'editor-parent'});
        const inherited=api.getState();
        window.displayFixture=siteDisplaySettingsUI.createPanel({idPrefix:'editor-display'});
        document.getElementById('settings-host').append(displayFixture.element);
        return {defaults,embedded,inherited};
      });
      assert.equal(result.defaults.textScale,100);
      assert.equal(result.defaults.codeWrap,false);
      assert.equal(result.embedded.codeWrap,true);
      assert.equal(result.embedded.codeWrapExplicit,false);
      assert.equal(result.inherited.textScale,119);
      assert.equal(result.inherited.codeWrap,false);
      await expect(standalone.getByRole('slider')).toHaveValue('119');
      await standalone.getByRole('slider').press('ArrowRight');
      assert.equal(await standalone.evaluate(() => siteDisplaySettings.state.textScale),120);
      await standalone.getByRole('button',{name:'表示設定を初期値に戻す'}).click();
      assert.equal(await standalone.evaluate(() => siteDisplaySettings.state.codeWrap),true,'reset restores the current document context');
      assert.equal(await standalone.evaluate(() => siteDisplaySettings.state.codeWrapExplicit),false);
      assert.ok(await standalone.locator('.site-display-settings__panel').evaluate(node => node.getBoundingClientRect().right <= innerWidth));
      await standalone.evaluate(() => displayFixture.destroy());
      await expect(standalone.locator('.site-display-settings__panel')).toHaveCount(0);
      assert.deepEqual(standaloneErrors,[]);
      await isolated.close();
    }
    console.log(engine+': standalone controller/UI factory, embedded defaults and disabled storage OK');

    const fallbackContext=await browser.newContext();
    const fallback=await fallbackContext.newPage();
    const fallbackErrors=[];
    fallback.on('pageerror',error => fallbackErrors.push(error.message));
    await fallback.route('**/js/display_settings_ui.js*',route => route.fulfill({
      contentType:'application/javascript',body:'window.siteDisplaySettingsUI={version:1,createPanel(){throw new Error("synthetic panel failure")}};'
    }));
    await fallback.goto(new URL('py21.html',base).href);
    await fallback.locator('.lesson-dock__btn--search').waitFor();
    await fallback.locator('pre[data-code-example-enhanced]').first().waitFor();
    await expect(fallback.locator('#site-header')).toHaveCount(1);
    await expect(fallback.locator('.site-display-settings__trigger')).toHaveCount(0);
    await fallback.locator('.lesson-dock__btn--search').click();
    await expect(fallback.locator('#site-search-dialog')).toBeVisible();
    assert.deepEqual(fallbackErrors,[],'a settings-panel failure must not stop the other header features');
    await fallbackContext.close();
    console.log(engine+': optional settings-panel failure remains isolated');
  } finally { await browser.close(); }
}
