/* Individual visibility must agree across native save, SVG, print and playback. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), http = require('node:http'), path = require('node:path'), os = require('node:os');
let chromium;
try { ({chromium} = require('playwright')); } catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); } catch { res.writeHead(404).end(); }
});
(async () => {
  const supplied = process.argv.find(value => /^https?:/.test(value));
  if (!supplied) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({channel:'chrome', headless:true}), page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(supplied || `http://127.0.0.1:${server.address().port}/illustslide/`);
    await page.waitForFunction(() => !!window.IlapoEditor);
    const report = await page.evaluate(async () => {
      const C = IlapoCore, L = IlapoLayers, S = IlapoSVG, K = IlapoConnectors;
      const d = C.createDocument(), p = d.pages[0];
      p.board = {width: 300, height: 200, unit:'px', infinite:false};
      const red = C.makeShape('rect', 20, 20, 50, 50, {fill:'#ef4444', stroke:'none'});
      red.id = 'hidden-shape'; red.name = 'hidden shape'; red.visible = false;
      const blue = C.makeShape('ellipse', 160, 20, 50, 50, {fill:'#2563eb', stroke:'none'}); blue.id = 'blue';
      const text = C.makeText(20, 125, '非表示の文字'); text.id = 'hidden-text'; text.visible = false;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
      const image = {id:'hidden-image',type:'image',name:'image',group:null,locked:false,visible:false,matrix:[1,0,0,1,0,0],style:C.clone(red.style),x:100,y:100,width:30,height:30,src:canvas.toDataURL(),reference:false};
      const line = K.make({x:0,y:0,objectId:red.id,port:'right'}, {x:0,y:0,objectId:blue.id,port:'left'}, {id:'connection'});
      const hiddenLine = K.make({x:5,y:170,objectId:null,port:'auto'}, {x:150,y:170,objectId:null,port:'auto'}, {id:'hidden-connection'}); hiddenLine.visible = false;
      p.objects = [red, blue, text, image, line, hiddenLine]; K.sync(p);
      p.animations = [
        {id:'hidden-step',targets:[red.id],effect:'fade',mode:'in',trigger:'click',duration:100,delay:0},
        {id:'mixed-step',targets:[blue.id,text.id],effect:'wipe',mode:'out',direction:'right',trigger:'click',duration:100,delay:0}
      ];
      const checked = C.validateDocument(d), before = JSON.stringify(checked), bytes = S.encodeProject(checked), decoded = S.decodeProject(bytes);
      function rejected(change) {
        const files = fflate.unzipSync(bytes), m = JSON.parse(fflate.strFromU8(files['manifest.json'])); change(m);
        files['manifest.json'] = fflate.strToU8(JSON.stringify(m));
        try { S.decodeProject(fflate.zipSync(files)); return false; } catch (_) { return true; }
      }
      const rejectedType = rejected(m => m.pages[0].objects[red.id].visible = 'false');
      const rejectedVersion = rejected(m => m.version = 7);
      const svg = S.exportPage(checked.pages[0]), print = IlapoExport.buildPrintHTML(checked.pages);
      const output = L.forOutput(checked.pages[0]);
      const png = await IlapoExport.png(checked.pages[0], {scale:1, background:'white'}), bitmap = await createImageBitmap(png);
      canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d'); context.drawImage(bitmap,0,0);
      const redPixel = [...context.getImageData(40,40,1,1).data], bluePixel = [...context.getImageData(180,40,1,1).data]; bitmap.close();
      const paper = document.createElement('div'); document.body.append(paper);
      const player = IlapoAnimationPlayer.create(paper, checked.pages[0]), steps = player.getState().steps;
      const playerMarkup = paper.innerHTML; player.destroy(); paper.remove();
      const presentation = IlapoPresentation.open(checked), presentationState = presentation.getState(); presentation.close();
      const html = await IlapoPlaybackExport.buildHTML(checked), parsed = new DOMParser().parseFromString(html,'text/html');
      const playback = JSON.parse(parsed.getElementById('ilapo-playback-data').textContent);
      const preview = IlapoObjectPreview.markup(checked.pages[0], [red.id]);
      const restored = C.clone(checked); L.setObjectVisible(restored.pages[0],red.id,true);
      const old = C.createDocument(); old.pages[0].objects = [C.makeShape('rect',0,0,10,10)];
      return {checked, decoded, rejectedType, rejectedVersion, svg, print, output, sourceLine:line, redPixel, bluePixel,
        steps, playerMarkup, presentationState, playback, preview, restoredSVG:S.exportPage(restored.pages[0]),
        unchanged:before===JSON.stringify(checked), oldRoundTrip:S.decodeProject(S.encodeProject(old)), old};
    });
    assert.equal(report.checked.version, 8);
    assert.deepEqual(report.decoded, report.checked, '全4種類の非表示図形とアニメーションをZIPに保持する');
    assert(report.rejectedType && report.rejectedVersion, '不正な表示値とバージョン偽装を拒否する');
    assert(report.unchanged);
    assert.deepEqual(report.oldRoundTrip, report.old, '旧ZIPは表示キーを補完しない');
    for (const output of [report.svg, report.print, report.playerMarkup]) {
      assert(!output.includes('hidden-shape')); assert(!output.includes('hidden-text'));
      assert(!output.includes('hidden-image')); assert(!output.includes('hidden-connection'));
    }
    assert.deepEqual(report.output.objects.map(object => object.id), ['blue','connection']);
    const connection = report.output.objects[1]; assert.equal(connection.from.objectId, null);
    assert.equal(connection.from.x, report.sourceLine.from.x); assert.equal(connection.from.y, report.sourceLine.from.y);
    assert.deepEqual(report.redPixel, [255,255,255,255]); assert.deepEqual(report.bluePixel, [37,99,235,255]);
    assert.equal(report.steps, 1, '非表示図形だけの動きはクリック数へ数えない');
    assert.deepEqual(report.playback.pages[0].objects.map(object => object.id), ['blue','connection']);
    assert.deepEqual(report.playback.pages[0].animations[0].targets, ['blue']);
    assert(report.preview.includes('hidden-shape') && report.preview.includes('object-preview'), '再表示のため非表示行にも形を示す');
    assert(report.restoredSVG.includes('hidden-shape'));
    assert.deepEqual(errors, []);
    console.log('object-visibility-browser.test.cjs: passed');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
