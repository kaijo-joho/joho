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

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 680 } });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setContent('<div id="paper"></div>');
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'core.js', 'geometry.js', 'connectors.js', 'svg.js', 'animation.js', 'layers.js', 'animation-player.js']) await page.addScriptTag({ path: path.join(root, file) });
    const result = await page.evaluate(() => {
      const C = IlapoCore, P = IlapoAnimationPlayer;
      const style = { fill: '#4477AA', stroke: 'none', strokeWidth: 0, opacity: .8, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 18, fontFamily: 'sans-serif', bold: false, italic: false };
      const make = (id, x, visible = true) => { const o = C.makeShape('rect', x, 20, 40, 30, style); o.id = id; o.visible = visible; return o; };
      const fixture = C.createPage('hidden', { width: 240, height: 100, unit: 'px', infinite: false });
      fixture.objects = [make('hidden', 10, true), make('shown', 70, true), make('off', 130, true)];
      fixture.layers = [
        { id: 'back', name: 'back', visible: false, locked: false, objectIds: ['hidden'] },
        { id: 'front', name: 'front', visible: true, locked: false, objectIds: ['shown', 'off'] }
      ];
      fixture.animations = [
        { id: 'wipe', targets: ['shown'], effect: 'wipe', mode: 'in', direction: 'right', trigger: 'with', duration: 1000, delay: 0 },
        { id: 'hidden-only', targets: ['hidden'], effect: 'fade', mode: 'in', trigger: 'click', duration: 1000, delay: 0 }
      ];
      const original = C.clone(fixture), snapshots = {};
      for (const mode of ['hide', 'ghost', 'show']) {
        const host = document.createElement('div'); document.body.append(host);
        const player = P.create(host, fixture, { hiddenMode: mode });
        snapshots[mode] = { state: player.getState(), nodes: [...host.querySelectorAll('[data-animation-object]')].map(g => ({id: g.dataset.animationObject, opacity: Number(g.getAttribute('opacity'))})), unchanged: JSON.stringify(fixture) === JSON.stringify(original) };
        player.seek(0, 500);
        const entry=id=>host.querySelector(`[data-animation-object="${id}"]`);
        snapshots[mode].mid = { hiddenOpacity: entry('hidden') ? Number(entry('hidden').getAttribute('opacity')) : null, shownOpacity: Number(entry('shown').getAttribute('opacity')), clips: host.querySelectorAll('[clip-path]').length, ghost: entry('shown').nextElementSibling.getAttribute('display') === 'none' ? null : Number(entry('shown').nextElementSibling.getAttribute('opacity')) };
        if (mode === 'ghost') { player.setHiddenMode('show'); snapshots[mode].showAfterSet = Number(host.querySelector('[data-animation-object="hidden"]').getAttribute('opacity')); }
        player.destroy(); host.remove();
      }
      const syncHost = document.createElement('div'); document.body.append(syncHost);
      const syncPage = C.createPage('sync', { width: 120, height: 80, unit: 'px', infinite: false }), syncObject = make('sync-object', 0); syncPage.objects = [syncObject]; syncPage.animations = [{id: 'sync-animation', targets: ['sync-object'], effect: 'fade', mode: 'in', trigger: 'with', duration: 1000, delay: 0}];
      const syncPlayer = P.create(syncHost, syncPage);
      const invalid = []; for (const state of [{step: -1, time: 0, playing: false}, {step: 0, time: -1, playing: false}, {step: 0, time: Infinity, playing: false}, {step: 0, time: '10', playing: false}, {step: 0, time: 0, playing: 'yes'}]) { try { syncPlayer.sync(state, Infinity); } catch (e) { invalid.push(e instanceof RangeError); } }
      const synced = syncPlayer.sync({step: 0, time: 10, playing: false}, 20); const continuing = syncPlayer.sync({step: 0, time: 10, playing: true}, 20); syncPlayer.finish(); const finished = syncPlayer.getState(); const unchangedAfterSync = JSON.stringify(fixture) === JSON.stringify(original); syncPlayer.destroy(); const destroyed=syncPlayer.getState(),afterDestroy=syncPlayer.sync({step:0,time:0,playing:false}); syncHost.remove();
      const direction = C.createPage('方向', {width:240,height:120,unit:'px',infinite:false}); direction.objects=['left','right','up','down'].map((id,index)=>make(id,index*50)); direction.animations=direction.objects.map((object,index)=>({id:'wipe-'+object.id,targets:[object.id],effect:'wipe',mode:'in',direction:object.id,trigger:'with',duration:1000,delay:0})); const directionHost=document.createElement('div');document.body.append(directionHost);const directionPlayer=P.create(directionHost,direction,{hiddenMode:'ghost'});directionPlayer.seek(0,500);const directions=direction.objects.map(object=>{const node=directionHost.querySelector(`[data-animation-object="${object.id}"]`),clip=node.getAttribute('clip-path'),ghost=node.nextElementSibling;return {id:object.id,clip,ghost:ghost.getAttribute('display') !== 'none',mask:ghost.getAttribute('mask')};});directionPlayer.seek(0,Infinity);const completedGhosts=[...directionHost.querySelectorAll('.ilapo-animation-ghost')].filter(node=>node.getAttribute('display') !== 'none').length;directionPlayer.destroy();directionHost.remove();
      const connectorPage=C.createPage('接続', {width:240,height:100,unit:'px',infinite:false}), mover=make('mover',10), target=make('target',160); const connector=IlapoConnectors.make({x:0,y:0,objectId:'mover',port:'right',ratio:.5},{x:0,y:0,objectId:'target',port:'left',ratio:.5},{id:'hidden-connector'});connectorPage.objects=[mover,target,connector];connectorPage.layers=[{id:'visible',name:'表示',visible:true,locked:false,objectIds:['mover','target']},{id:'hidden',name:'非表示',visible:false,locked:false,objectIds:['hidden-connector']}];connectorPage.animations=[{id:'move',targets:['mover'],effect:'move',dx:60,dy:0,trigger:'with',duration:1000,delay:0}];const connectorHost=document.createElement('div');document.body.append(connectorHost);const connectorPlayer=P.create(connectorHost,connectorPage,{hiddenMode:'ghost'});connectorPlayer.seek(0,0);const connectorStart=connectorHost.querySelector('[data-animation-object="hidden-connector"] path').getAttribute('d');connectorPlayer.seek(0,500);const connectorMid=connectorHost.querySelector('[data-animation-object="hidden-connector"] path').getAttribute('d');connectorPlayer.destroy();connectorHost.remove();
      const fadePage=C.createPage('fade',{width:100,height:60,unit:'px',infinite:false}),fade=make('fade',10);fadePage.objects=[fade];fadePage.animations=[{id:'fade-in',targets:['fade'],effect:'fade',mode:'in',trigger:'with',duration:1000,delay:0}];const fadeHost=document.createElement('div');document.body.append(fadeHost);const fadePlayer=P.create(fadeHost,fadePage,{hiddenMode:'ghost'});const fadeGhostAtStart=Number(fadeHost.querySelector('[data-animation-object]').getAttribute('opacity'));fadePlayer.seek(0,Infinity);const fadeGhostAtEnd=Number(fadeHost.querySelector('[data-animation-object]').getAttribute('opacity'));fadePlayer.destroy();fadeHost.remove();
      return {snapshots, synced, continuing, finished, invalid, unchangedAfterSync,destroyed,afterDestroy,directions,completedGhosts,connectorStart,connectorMid,fadeGhostAtStart,fadeGhostAtEnd};
    });
    assert.equal(result.snapshots.hide.nodes.length, 2, 'hide omits non-output objects');
    assert.equal(result.snapshots.hide.state.steps, 0, 'hidden-only animation does not add a step');
    assert.equal(result.snapshots.ghost.nodes.length, 3, 'ghost keeps original stacking order');
    assert.equal(result.snapshots.show.nodes.length, 3, 'show keeps original stacking order');
    assert.equal(result.snapshots.ghost.nodes.find(n => n.id === 'hidden').opacity, .3, 'ghost uses one outer 30 percent opacity');
    assert.equal(result.snapshots.show.nodes.find(n => n.id === 'hidden').opacity, 1, 'show uses normal group opacity');
    assert.equal(result.snapshots.ghost.mid.hiddenOpacity, .3, 'ghostの外側は通常style.opacityを重ねず30%にする'); assert.equal(result.snapshots.ghost.mid.shownOpacity, 1, 'wipe keeps the visible portion at normal opacity');
    assert.equal(result.snapshots.ghost.mid.ghost, .3, '部分ワイプの未表示部分だけをghostで描く');
    assert(result.snapshots.ghost.mid.clips > 0, 'wipe still uses a clip');
    assert(result.snapshots.hide.unchanged && result.snapshots.ghost.unchanged && result.snapshots.show.unchanged && result.unchangedAfterSync, 'player never mutates source');
    assert.equal(result.snapshots.ghost.showAfterSet, 1, 'setHiddenMode updates existing player nodes');
    assert.deepEqual(result.invalid, Array(5).fill(true)); assert.equal(result.synced.time, 10); assert.equal(result.synced.playing, false); assert(result.continuing.time >= 30); assert.equal(result.continuing.playing, true); assert.equal(result.finished.time, Infinity); assert.equal(result.finished.playing, false); assert.deepEqual(result.afterDestroy,result.destroyed,'destroy後の同期は状態もDOMも変更しない');
    assert.equal(result.directions.length,4); assert(result.directions.every(item=>item.clip&&item.ghost&&item.mask),'4方向の部分ワイプは通常部とghost部を分けて描く'); assert.equal(result.completedGhosts,0,'ワイプ完了後はghostを残さない');
    assert.notEqual(result.connectorStart,result.connectorMid,'非表示コネクタも現在フレームの移動先へ追従する');
    assert.equal(result.fadeGhostAtStart,.3);assert.equal(result.fadeGhostAtEnd,1,'ghostは登場前は30%、登場後は通常表示');
    const pixels = await page.evaluate(async () => {
      const results=[];
      for (const direction of ['left','right','up','down']) for (const mode of ['in','out']) for (const hiddenMode of ['hide','ghost','show']) {
        const page=IlapoCore.createPage('pixel',{width:120,height:100,unit:'px',infinite:false}),object=IlapoCore.makeShape('rect',10,10,100,80,{fill:'#000000',stroke:'none',opacity:.5});object.id='pixel';page.objects=[object];
        page.animations=[{id:'wipe',targets:['pixel'],effect:'wipe',mode,direction,trigger:'with',duration:1000,delay:0}];
        const host=document.createElement('div');document.body.append(host);const player=IlapoAnimationPlayer.create(host,page,{hiddenMode});player.seek(0,500);
        const svg=player.svg.cloneNode(true);svg.removeAttribute('style');svg.setAttribute('width','120');svg.setAttribute('height','100');
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'})),image=new Image();image.src=url;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=120;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,120,100);ctx.drawImage(image,0,0);
        const horizontal=['left','right'].includes(direction),near=ctx.getImageData(horizontal?30:60,horizontal?50:30,1,1).data[0],far=ctx.getImageData(horizontal?90:60,horizontal?50:70,1,1).data[0];
        results.push({direction,mode,hiddenMode,near,far});URL.revokeObjectURL(url);player.destroy();host.remove();
      }
      return results;
    });
    for (const row of pixels) {
      const nearVisible = (['right','down'].includes(row.direction)) === (row.mode==='in');
      const normal=127,hidden=row.hiddenMode==='hide'?255:row.hiddenMode==='ghost'?217:127;
      assert(Math.abs(row.near-(row.hiddenMode==='show'||nearVisible?normal:hidden))<=2,JSON.stringify(row)+' near pixel');
      assert(Math.abs(row.far-(row.hiddenMode==='show'||!nearVisible?normal:hidden))<=2,JSON.stringify(row)+' far pixel');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await page.evaluate(() => {
      const C=IlapoCore,page=C.createPage('reduced',{width:100,height:60,unit:'px',infinite:false}),object=C.makeShape('rect',0,0,20,20);object.id='reduced-object';page.objects=[object];page.animations=[{id:'reduced-fade',targets:[object.id],effect:'fade',mode:'in',trigger:'with',duration:1000,delay:0}];const host=document.createElement('div');document.body.append(host);const player=IlapoAnimationPlayer.create(host,page);const state=player.sync({step:0,time:0,playing:true},10);player.destroy();host.remove();return state;
    });
    assert.equal(reduced.playing,false); assert.equal(reduced.time,Infinity,'reduced-motion中の同期再生は直ちに完了する');
    console.log('presenter-player-browser.test.cjs: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
