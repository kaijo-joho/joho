#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const near = (a, b, label) => assert.ok(Math.abs(a - b) < .03, `${label}: ${a} != ${b}`);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 680 } });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setContent('<style>' + source('presentation.css') + '</style><div id="paper"></div>');
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'core.js', 'geometry.js', 'connectors.js', 'svg.js', 'animation.js', 'animation-player.js', 'presentation.js']) await page.addScriptTag({ path: path.join(root, file) });
    const result = await page.evaluate(() => {
      const C = IlapoCore, P = IlapoAnimationPlayer, G = IlapoGeometry;
      const style = { fill: '#4477AA', stroke: 'none', strokeWidth: 0, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 18, fontFamily: 'sans-serif', bold: false, italic: false };
      const make = (id, x, y, w = 40, h = 30) => { const o = C.makeShape('rect', x, y, w, h, style); o.id = id; return o; };
      const fixture = C.createPage('動き', { width: 320, height: 180, unit: 'px', infinite: false }); const a = make('a', 10, 20);
      fixture.objects = [a]; fixture.animations = [
        { id: 'auto-in', targets: ['a'], effect: 'fade', mode: 'in', trigger: 'with', duration: 10000, delay: 0 },
        { id: 'auto-after', targets: ['a'], effect: 'move', dx: 30, dy: 0, trigger: 'after', duration: 10000, delay: 0 },
        { id: 'click-color', targets: ['a'], effect: 'color', channel: 'fill', color: '#FF0000', trigger: 'click', duration: 400, delay: 0 }
      ];
      const original = C.clone(fixture), paper = document.getElementById('paper'), player = P.create(paper, fixture);
      const initial = player.getState(), autoAtHalf = player.seek(0, 5000), autoAtEnd = player.seek(0, Infinity);
      player.reset(); const resetPlaying = player.getState().playing; player.next(); const finishDuringPlay = player.getState();
      player.next(); const clickPlaying = player.getState().playing; player.previous(); const previous = player.getState(); player.reset(); const reset = player.getState(); player.destroy(); const afterDestroy = player.getState();

      function clipCase(direction, mode) {
        const one = C.createPage('clip', { width: 160, height: 100, unit: 'px', infinite: false }), shape = make('shape', 10, 20, 100, 50); one.objects = [shape]; one.animations = [{ id: direction + mode, targets: ['shape'], effect: 'wipe', mode, direction, trigger: 'with', duration: 100, delay: 0 }];
        const host = document.createElement('div'); document.body.append(host); const p = P.create(host, one); p.seek(0, 50); const group = host.querySelector('[data-animation-object="shape"]'), rect = host.querySelector(group.getAttribute('clip-path').slice(4, -1) + ' rect'), b = (G.visualBounds || G.bounds)(shape); const out = { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')), width: Number(rect.getAttribute('width')), height: Number(rect.getAttribute('height')), b }; p.destroy(); host.remove(); return out;
      }
      const clips = {}; for (const direction of ['left', 'right', 'up', 'down']) for (const mode of ['in', 'out']) clips[direction + mode] = clipCase(direction, mode);
      const union = C.createPage('union', { width: 300, height: 100, unit: 'px', infinite: false }); union.objects = [make('left', 0, 20), make('right', 200, 20)]; union.animations = [{ id: 'shared', targets: ['left', 'right'], effect: 'wipe', mode: 'in', direction: 'right', trigger: 'with', duration: 100, delay: 0 }];
      const unionHost = document.createElement('div'); document.body.append(unionHost); const unionPlayer = P.create(unionHost, union); unionPlayer.seek(0, 50); const unionRects = [...unionHost.querySelectorAll('[data-animation-object]')].map(g => { const r = unionHost.querySelector(g.getAttribute('clip-path').slice(4, -1) + ' rect'); return { id: g.dataset.animationObject, x: Number(r.getAttribute('x')), width: Number(r.getAttribute('width')) }; }); unionPlayer.destroy(); unionHost.remove();

      const free = C.createPage('free', C.boardPreset('free')); free.objects = [make('left', -100, 0), make('right', 160, 0)]; free.animations = [{ id: 'leftward', targets: ['left'], effect: 'move', dx: -150, dy: 20, trigger: 'with', duration: 100, delay: 0 }, { id: 'rightward', targets: ['right'], effect: 'move', dx: 120, dy: -20, trigger: 'with', duration: 100, delay: 0 }];
      const freeHost = document.createElement('div'); freeHost.style.cssText = 'width:500px;height:300px'; document.body.append(freeHost); const freePlayer = P.create(freeHost, free); const beforeBox = freePlayer.svg.getAttribute('viewBox'); freePlayer.seek(0, 50); const middleBox = freePlayer.svg.getAttribute('viewBox'); freePlayer.seek(0, Infinity); const finalBox = freePlayer.svg.getAttribute('viewBox'); freePlayer.destroy(); freeHost.remove();
      return { original, initial, autoAtHalf, autoAtEnd, resetPlaying, finishDuringPlay, clickPlaying, previous, reset, afterDestroy, clips, unionRects, beforeBox, middleBox, finalBox, unchanged: JSON.stringify(fixture) === JSON.stringify(original) };
    });
    assert.equal(result.initial.step, 0); assert.equal(result.initial.playing, false, 'a bare player is deterministic until reset/play is requested');
    assert.equal(result.autoAtHalf.playing, false); assert.equal(result.autoAtEnd.playing, false);
    assert.equal(result.resetPlaying, true); assert.equal(result.finishDuringPlay.step, 0); assert.equal(result.finishDuringPlay.playing, false, 'next during autoplay finishes without advancing');
    assert.equal(result.clickPlaying, true); assert.equal(result.previous.step, 0); assert.equal(result.previous.playing, false); assert.equal(result.reset.step, 0); assert.equal(result.afterDestroy.playing, false); assert(result.unchanged);
    for (const [key, clip] of Object.entries(result.clips)) {
      const horizontal = key.startsWith('left') || key.startsWith('right');
      near(horizontal ? clip.width / clip.b.width : clip.height / clip.b.height, .5, key + ' fraction');
      const expectedFar = key === 'leftin' || key === 'rightout' || key === 'upin' || key === 'downout';
      near(horizontal ? (clip.x - clip.b.x) / clip.b.width : (clip.y - clip.b.y) / clip.b.height, expectedFar ? .5 : 0, key + ' origin');
    }
    assert.equal(result.unionRects.length, 2); assert.equal(result.unionRects[0].x, result.unionRects[1].x); assert.equal(result.unionRects[0].width, result.unionRects[1].width); assert(result.unionRects[0].width > 100, 'two wipe targets share a union clip, so the left target is fully revealed while the right remains hidden');
    assert.equal(result.beforeBox, result.middleBox); assert.equal(result.beforeBox, result.finalBox, 'free canvas camera is stable while opposite moves run');
    const opened = await page.evaluate(() => { const C = IlapoCore, d = C.createDocument(), p = d.pages[0], o = C.makeShape('rect', 0, 0, 20, 20); o.id = 'auto'; p.objects = [o]; p.animations = [{ id: 'entry', targets: ['auto'], effect: 'fade', mode: 'in', trigger: 'with', duration: 10000, delay: 0 }, { id: 'after', targets: ['auto'], effect: 'move', dx: 4, dy: 0, trigger: 'after', duration: 10000, delay: 0 }]; window.presentationSource = C.clone(d); window.presentationViewer = IlapoPresentation.open(d); return { animation: presentationViewer.getState().animation, source: C.clone(d) }; });
    assert.equal(opened.animation.step, 0); assert.equal(opened.animation.playing, true, 'presentation automatically starts with/after group 0'); await page.evaluate(() => presentationViewer.close()); assert.deepEqual(await page.evaluate(() => window.presentationSource), opened.source);

    const touch = await browser.newContext({ viewport: { width: 390, height: 736 }, isMobile: true, hasTouch: true }); const mobile = await touch.newPage();
    await mobile.setContent('<button id="open">発表</button><style>' + source('presentation.css') + '</style>');
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'core.js', 'geometry.js', 'connectors.js', 'svg.js', 'animation.js', 'animation-player.js', 'presentation.js']) await mobile.addScriptTag({ path: path.join(root, file) });
    const mobileFixture = await mobile.evaluate(() => { const C = IlapoCore, d = C.createDocument(), p = d.pages[0], o = C.makeShape('rect', 10, 10, 30, 30); o.id = 'one'; p.objects = [o]; p.animations = [{ id: 'zero', targets: ['one'], effect: 'fade', mode: 'in', trigger: 'with', duration: 0, delay: 0 }, { id: 'next', targets: ['one'], effect: 'fade', mode: 'out', trigger: 'click', duration: 0, delay: 0 }]; window.sourceDocument = C.clone(d); window.viewer = IlapoPresentation.open(d, { opener: document.getElementById('open') }); return C.clone(d); });
    const box = await mobile.locator('.ilapo-present-viewport').boundingBox(); const cdp = await touch.newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .8, y: box.y + box.height * .5, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .2, y: box.y + box.height * .5, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mobile.waitForFunction(() => viewer.getState().animation.step === 1);
    const oneStep = await mobile.evaluate(() => viewer.getState().animation.step); await mobile.locator('.ilapo-present-reset').tap(); const resetStep = await mobile.evaluate(() => viewer.getState().animation.step);
    const noOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth); await mobile.keyboard.press('Escape'); const closed = await mobile.evaluate(() => !document.getElementById('ilapo-presentation') && JSON.stringify(window.sourceDocument) === JSON.stringify(window.sourceDocument));
    assert.equal(oneStep, 1, 'one touch swipe advances exactly one click group'); assert.equal(resetStep, 0); assert(noOverflow && closed); assert.deepEqual(await mobile.evaluate(() => window.sourceDocument), mobileFixture, 'closing presentation preserves the source document');
    await touch.close();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const reduced = await page.evaluate(() => { const C = IlapoCore, p = C.createPage(); const o = C.makeShape('rect', 0, 0, 20, 20); o.id = 'reduce'; p.objects = [o]; p.animations = [{ id: 'long', targets: ['reduce'], effect: 'fade', mode: 'in', trigger: 'with', duration: 10000, delay: 0 }]; const host = document.createElement('div'); document.body.append(host); window.reducedPlayer = IlapoAnimationPlayer.create(host, p); reducedPlayer.reset(); return reducedPlayer.getState().playing; });
    assert.equal(reduced, true); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForFunction(() => !reducedPlayer.getState().playing); assert.equal(await page.evaluate(() => reducedPlayer.getState().time), Infinity); await page.evaluate(() => reducedPlayer.destroy());
    console.log('animation-player.test.cjs: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
