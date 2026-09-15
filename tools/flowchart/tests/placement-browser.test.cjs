/* Chrome coverage for previewing and cancelling a reusable part before placement. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const Core = require('../core.js'), Parts = require('../parts.js'), Render = require('../render.js');
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

async function serve() {
  const root = path.resolve(__dirname, '..');
  const allowed = new Set(['index.html','core.js','output.js','render.js','parts.js','layout.js','editor.js','editor.css','storage.js','local-autosave.js','icon.svg']);
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!allowed.has(file)) return res.writeHead(404).end();
    try { res.writeHead(200, {'Content-Type': types[path.extname(file)]}); res.end(await fs.readFile(path.join(root, file))); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {url:`http://127.0.0.1:${server.address().port}/`, close:() => new Promise(resolve => server.close(resolve))};
}
function fixture() {
  const doc = Core.createDocument();
  const a = Core.createNode('process', 60, 90, {id:'preview_a',text:'入力',style:{fill:'#ffdd66'}});
  const b = Core.createNode('decision', 380, 260, {id:'preview_b',text:'条件',style:{stroke:'#1d4ed8'}});
  const e = Core.createEdge({nodeId:a.id,side:'right',offset:.5},{nodeId:b.id,side:'left',offset:.5},
    {id:'preview_edge',kind:'orthogonal',label:{text:'次へ',t:.4,dx:10,dy:-15},waypoints:[{x:270,y:122},{x:270,y:310}]});
  doc.nodes = [a,b]; doc.edges = [e]; return doc;
}
const getDoc = page => page.evaluate(() => DiagramEditor.getDocument());
const getLibrary = page => page.evaluate(() => localStorage.getItem('kaijo.flowchart.parts.auto.v1'));
const getSaved = page => page.evaluate(() => [localStorage.getItem('kaijo.diagram.saved.v1'),localStorage.getItem('kaijo.diagram.recovery.v1')]);
async function load(page, doc) {
  await page.locator('#file-input').setInputFiles({name:'preview.diagram.json',mimeType:'application/json',buffer:Buffer.from(Core.serializeDocument(doc))});
  await page.locator('[data-open-source="local-file"]').click();
  if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-continue').click();
  await page.waitForFunction(id => DiagramEditor.getDocument().id === id, doc.id);
}
async function begin(page) {
  await page.locator('#my-parts').click();
  const candidate = page.locator('[data-parts-source="auto"]');
  if (await candidate.isVisible()) await candidate.click();
  await page.locator('#place-part').click();
  await page.waitForFunction(() => document.getElementById('canvas').dataset.tool === 'part');
  assert.equal(await page.locator('#placement-bar').isVisible(), true);
  assert.equal(await page.locator('#placement-preview .placement-bounds').count(), 1);
  assert.equal(await page.locator('#notice').isHidden(), true, 'A previous cancellation notice is cleared when starting a new placement');
}
async function cancelled(page, doc) {
  assert.deepEqual(await getDoc(page), doc);
  assert.equal(await page.locator('#placement-bar').isHidden(), true);
  assert.equal(await page.locator('#placement-preview > *').count(), 0);
  assert.equal(await page.locator('#undo').isDisabled(), true);
  assert.equal(await page.locator('#canvas').getAttribute('data-tool'), 'select');
}
async function check(browser, url, narrow) {
  const doc = fixture(), part = Parts.capture(doc, [doc.nodes[0].id,doc.nodes[1].id], '繰り返し使う処理');
  const library = Parts.add(Parts.emptyLibrary(), part);
  const context = await browser.newContext({viewport:{width:narrow?390:1280,height:844},hasTouch:narrow});
  try {
    await context.addInitScript(value => localStorage.setItem('kaijo.flowchart.parts.auto.v1', value), JSON.stringify({savedAt:'2026-09-15T00:00:00.000Z',library}));
    const page = await context.newPage(), errors=[]; page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    if (narrow) {
      await page.locator('#toolbar-toggle').click(); await page.locator('#settings-menu > summary').click();
      await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape');
    }
    await load(page, doc);
    await page.locator('#file-menu > summary').click(); await page.locator('#save-browser').click();
    await page.evaluate(id => DiagramEditor.select([id]), doc.nodes[0].id);
    const saved = await getSaved(page), originalLibrary = await getLibrary(page), svg = await page.evaluate(() => DiagramEditor.exportSVG());
    await begin(page);
    assert.equal(await page.locator('#format-bar').isHidden(), true);
    assert.equal(await page.locator('#placement-preview [tabindex],#placement-preview [data-node],#placement-preview [data-edge]').count(), 0);
    assert.equal(await page.locator('#placement-preview').getAttribute('aria-hidden'), 'true');
    assert.deepEqual(await getDoc(page), doc); assert.deepEqual(await getSaved(page), saved); assert.equal(await getLibrary(page), originalLibrary);
    assert.equal(await page.evaluate(() => DiagramEditor.exportSVG()), svg, 'An unplaced preview never enters SVG output');
    await page.locator('#canvas').press('ArrowRight'); await page.locator('#canvas').press('Delete');
    assert.deepEqual(await getDoc(page), doc, 'Placement mode never edits or deletes the original selection');
    await page.locator('#canvas').press('Tab');
    await page.waitForFunction(() => document.activeElement?.id === 'place-part-center');
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#cancel-part-placement').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape'); await cancelled(page, doc);
    assert.equal(await page.locator('#format-bar').isVisible(), true, 'Cancelling restores the original selection tools');
    await begin(page);
    if (narrow) await page.locator('#cancel-part-placement').tap(); else await page.locator('#cancel-part-placement').click();
    await cancelled(page, doc); assert.deepEqual(await getSaved(page), saved);
    await begin(page);
    const bounds = await page.locator('#canvas').boundingBox();
    const target = {x:bounds.x+bounds.width*.7,y:bounds.y+bounds.height*.65};
    if (narrow) {
      for (const id of ['place-part-center','cancel-part-placement']) {
        const box = await page.locator('#'+id).boundingBox(); assert.ok(box.width>=44&&box.height>=44); assert.ok(box.x>=0&&box.x+box.width<=390);
      }
      await page.screenshot({path:path.join(os.tmpdir(),'joho-flowchart-placement-preview-390.png')});
      await page.locator('#place-part-center').tap();
    } else {
      await page.mouse.move(target.x,target.y);
      await page.keyboard.down('Control'); await page.mouse.wheel(0,-40); await page.keyboard.up('Control');
      const offset = await page.locator('#placement-preview').evaluate(el => {const m=el.transform.baseVal.consolidate().matrix;return{x:m.e,y:m.f};});
      const partDoc = Parts.documentFor(part), partBounds = Render.documentBounds(partDoc);
      assert.ok(Math.abs((offset.x+partBounds.x+partBounds.w/2)/10-Math.round((offset.x+partBounds.x+partBounds.w/2)/10))<1e-6);
      await page.screenshot({path:path.join(os.tmpdir(),'joho-flowchart-placement-preview.png')});
      await page.mouse.click(target.x,target.y);
      const placed = await getDoc(page), additions = placed.nodes.filter(n => !doc.nodes.some(old => old.id===n.id));
      for (const source of partDoc.nodes) {
        const copy = additions.find(n => n.text===source.text);
        assert.ok(copy); assert.ok(Math.abs(copy.x-source.x-offset.x)<.001); assert.ok(Math.abs(copy.y-source.y-offset.y)<.001);
      }
    }
    const placed = await getDoc(page);
    assert.equal(placed.nodes.length,doc.nodes.length+2); assert.equal(placed.edges.length,doc.edges.length+1);
    assert.equal(new Set(placed.nodes.map(n=>n.id)).size,placed.nodes.length);
    assert.equal(await page.locator('#placement-preview > *').count(),0); assert.equal(await getLibrary(page),originalLibrary);
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(page),doc); assert.equal(await page.locator('#undo').isDisabled(),true);
    await page.locator('#redo').click(); assert.deepEqual(await getDoc(page),placed);
    await page.locator('#undo').click(); await begin(page); await page.locator('#canvas').press('h');
    assert.equal(await page.locator('#placement-bar').isHidden(),true); assert.equal(await page.locator('#placement-preview > *').count(),0); assert.deepEqual(await getDoc(page),doc);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
}
(async()=>{
  const host=await serve();
  try {const browser=await pw.chromium.launch({channel:'chrome',headless:true});
    try {await check(browser,host.url,false);await check(browser,host.url,true);console.log('chromium: part preview, exact placement, cancellation, saved data, export isolation, Undo/Redo and touch passed');}
    finally {await browser.close();}
  } finally {await host.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
