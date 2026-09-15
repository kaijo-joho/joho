/* Run with `node tools/flowchart/tests/browser.test.cjs [http://127.0.0.1:port/]`. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const Core = require('../core.js');
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

async function serve() {
  const root = path.resolve(__dirname, '..');
  const allowed = new Set(['index.html', 'core.js', 'render.js', 'editor.js', 'editor.css', 'storage.js', 'local-autosave.js', 'icon.svg']);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!allowed.has(file)) { res.writeHead(404); res.end(); return; }
    try { const data = await fs.readFile(path.join(root, file)); res.writeHead(200, { 'Content-Type': `${types[path.extname(file)]}; charset=utf-8` }); res.end(data); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}
async function run() {
  const url = process.argv.slice(2).find(arg => /^https?:/.test(arg));
  const interactionsOnly = process.argv.includes('--interactions-only');
  const exportsOnly = process.argv.includes('--exports-only');
  const additionsOnly = process.argv.includes('--additions-only');
  const shapesOnly = process.argv.includes('--shapes-only');
  const learningOnly = process.argv.includes('--learning-only');
  const reviewOnly = process.argv.includes('--review-only');
  const lanesOnly = process.argv.includes('--lanes-only');
  const authoringOnly = process.argv.includes('--authoring-only');
  const imageExportOnly = process.argv.includes('--image-export-only');
  const sizeStyleOnly = process.argv.includes('--size-style-only');
  const popupColorsOnly = process.argv.includes('--popup-colors-only');
  const anyExistingOnly = interactionsOnly || exportsOnly || additionsOnly || shapesOnly || learningOnly || reviewOnly || lanesOnly || authoringOnly || imageExportOnly || sizeStyleOnly || popupColorsOnly;
  const hosting = url ? { url, close: async () => {} } : await serve();
  const artifacts = path.join(os.tmpdir(), 'joho-diagram-browser'); await fs.mkdir(artifacts, { recursive: true });
  const results = [];
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await pw[engine].launch(engine === 'chromium' ? { channel: 'chrome', headless: true } : { headless: true });
      try {
        if (!anyExistingOnly || popupColorsOnly) {
          await checkPopupAndColors(browser, hosting.url, artifacts);
          console.log(`${engine}: selection popup, compact toolbar and color palette passed`);
        }
        if (popupColorsOnly) { results.push({ engine, popupColors: true }); continue; }
        if (!anyExistingOnly || lanesOnly) {
          await checkLaneTools(browser, hosting.url, artifacts);
          console.log(`${engine}: lane add, order, delete, save and print passed`);
        }
        if (lanesOnly) { results.push({ engine, lanes: true }); continue; }
        if (!anyExistingOnly || reviewOnly) {
          await checkReviewTools(browser, hosting.url, artifacts);
          console.log(`${engine}: inspection, route cleanup and print layout passed`);
        }
        if (reviewOnly) { results.push({ engine, review: true }); continue; }
        if (!anyExistingOnly || authoringOnly) {
          await checkAuthoringTools(browser, hosting.url, artifacts);
          console.log(`${engine}: production toolbar, assignment dialog and alignment guides passed`);
        }
        if (authoringOnly) { results.push({ engine, authoring: true }); continue; }
        if (!anyExistingOnly || imageExportOnly) {
          await checkImageExportTools(browser, hosting.url, artifacts);
          console.log(`${engine}: selection image export and clipboard fallback passed`);
        }
        if (imageExportOnly) { results.push({ engine, imageExport: true }); continue; }
        if (!anyExistingOnly || sizeStyleOnly) {
          await checkSizeStyleTools(browser, hosting.url, artifacts);
          await checkSizeStyleDetails(browser, hosting.url, artifacts);
          await checkSizeStyleTouch(browser, hosting.url, artifacts);
          console.log(`${engine}: size matching, style snapshots, locks, groups, history, save and touch passed`);
        }
        if (sizeStyleOnly) { results.push({ engine, sizeStyle: true }); continue; }
        if (!anyExistingOnly || learningOnly) {
          await checkLearningTools(browser, hosting.url, artifacts);
          console.log(`${engine}: lesson, grouping, locking, trace and learning overlay passed`);
        }
        if (learningOnly) { results.push({ engine, learning: true }); continue; }
        if (!exportsOnly) {
          await checkShapeChanges(browser, hosting.url, artifacts);
          console.log(`${engine}: shape conversion, mixed selection, arrow kinds and orthogonal self loops passed`);
        }
        if (shapesOnly) { results.push({ engine, shapes: true }); continue; }
        if (!exportsOnly) {
          await checkInsertAndBranch(browser, hosting.url, artifacts);
          await checkDarkCanvas(browser, hosting.url, artifacts);
          console.log(`${engine}: process insertion, branch sets, template anchors and dark canvas passed`);
        }
        if (additionsOnly) { results.push({ engine, additions: true }); continue; }
        if (!exportsOnly) {
          await checkPointerEditing(browser, hosting.url);
          console.log(`${engine}: pointer connections, loop, label, bend, reconnect and Escape passed`);
          await checkConnectionSnapping(browser, hosting.url);
          console.log(`${engine}: side subdivisions, new connections, reconnect and free placement passed`);
        }
        if (interactionsOnly) { results.push({ engine, pointerEditing: true }); continue; }
        await checkTemplateOutputs(browser, hosting.url, engine, artifacts);
        console.log(`${engine}: all three diagram types saved, reopened and exported`);
        if (exportsOnly) { results.push({ engine, templateOutputs: true }); continue; }
        const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
        const page = await context.newPage(); const errors = [], missing = [];
        page.setDefaultTimeout(12000);
        page.on('pageerror', e => errors.push(e.message));
        page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
        page.on('dialog', d => d.accept());
        await page.goto(hosting.url);
        await page.waitForFunction(() => !!window.DiagramEditor);
        const getDoc = () => page.evaluate(() => window.DiagramEditor.getDocument());
        const commitText = async text => { await page.locator('#inline-editor').fill(text); await page.locator('#inline-editor').press('Control+Enter'); };
        async function place(kind, x, y, text) {
          await page.locator(`[data-tool="node:${kind}"]`).click();
          const box = await page.locator('#stage').boundingBox();
          await page.mouse.click(box.x + x, box.y + y);
          if (text !== undefined) await commitText(text);
        }
        await place('process', 220, 170, '点数を入力\nscore ← 80');
        await place('decision', 490, 330, 'score ≥ 60');
        let d = await getDoc(); assert.equal(d.nodes.length, 2);
        const firstId = d.nodes[0].id, secondId = d.nodes[1].id;
        await page.locator('#connect-button').click();
        await page.locator('#connect-from').selectOption(firstId); await page.locator('#connect-to').selectOption(secondId);
        await page.locator('#connect-label').fill('次へ'); await page.locator('#connect-form button[type=submit]').click();
        d = await getDoc(); assert.equal(d.edges.length, 1); assert.equal(d.edges[0].label.text, '次へ');
        assert.equal(await page.locator('#connect-button').evaluate(el => el === document.activeElement), true);

        const beforeMove = await getDoc();
        const geometryBefore = await page.evaluate(() => DiagramRender.edgeGeometry(DiagramEditor.getDocument(), DiagramEditor.getDocument().edges[0]));
        const box = await page.locator(`[data-node="${firstId}"]`).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 7 }); await page.mouse.up();
        const afterMove = await getDoc(); assert.equal(afterMove.nodes[0].x, beforeMove.nodes[0].x + 80); assert.equal(afterMove.nodes[0].y, beforeMove.nodes[0].y + 60);
        const geometryAfter = await page.evaluate(() => DiagramRender.edgeGeometry(DiagramEditor.getDocument(), DiagramEditor.getDocument().edges[0]));
        assert.notEqual(geometryBefore.path, geometryAfter.path);
        await page.locator('#undo').click(); assert.deepEqual((await getDoc()).nodes, beforeMove.nodes);
        await page.locator('#redo').click(); assert.deepEqual((await getDoc()).nodes, afterMove.nodes);

        await page.locator('#canvas').focus(); await page.keyboard.press('Control+a');
        await clickToolbarAction(page, 'copy-button'); await clickToolbarAction(page, 'paste-button');
        d = await getDoc(); assert.equal(d.nodes.length, 4); assert.equal(d.edges.length, 2);
        assert.ok(d.edges[1].from.nodeId !== d.edges[0].from.nodeId);
        await clickToolbarAction(page, 'delete-button'); assert.equal((await getDoc()).nodes.length, 2); assert.equal((await getDoc()).edges.length, 1);
        await page.locator('#undo').click(); assert.equal((await getDoc()).nodes.length, 4);
        await page.locator('#undo').click(); assert.equal((await getDoc()).nodes.length, 2);

        // Native IME composition must not trigger canvas deletion or Enter handling.
        await page.locator(`[data-node="${firstId}"]`).dblclick();
        await page.locator('#inline-editor').fill('日本語の入力');
        await page.locator('#inline-editor').evaluate(el => { el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', isComposing: true, bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
        assert.equal((await getDoc()).nodes.length, 2); assert.equal(await page.locator('#inline-editor').isVisible(), true);
        await page.locator('#inline-editor').dispatchEvent('compositionend'); await commitText('日本語の入力\n2行目');
        d = await getDoc(); assert.equal(d.nodes[0].text, '日本語の入力\n2行目');

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#file-menu > summary').click(); await page.locator('#save-file').click();
        const download = await downloadPromise; assert.match(download.suggestedFilename(), /\.diagram\.json$/);
        const filePath = path.join(artifacts, `${engine}.diagram.json`); await download.saveAs(filePath);
        const savedDocument = Core.parseDocument(await fs.readFile(filePath, 'utf8'));
        assert.deepEqual(savedDocument, await getDoc());
        const beforeInvalid = await getDoc();
        await page.locator('#file-input').setInputFiles({ name: 'future.diagram.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...beforeInvalid, version: 999 })) });
        await page.waitForFunction(() => document.getElementById('notice').textContent.includes('読み込めません'));
        assert.deepEqual(await getDoc(), beforeInvalid);

        console.log(`${engine}: drawing, history, IME, JSON and recovery passed`);
        await page.locator('#file-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
        assert.deepEqual(await getDoc(), beforeInvalid);
        await page.waitForFunction(() => !!localStorage.getItem('kaijo.diagram.recovery.v1'));
        await page.reload(); await restoreBrowserAuto(page);
        assert.deepEqual(await getDoc(), beforeInvalid);

        const sameNodes = (await getDoc()).nodes;
        await page.locator('#diagram-type').selectOption('activity'); assert.deepEqual((await getDoc()).nodes, sameNodes);
        async function chooseTemplate() {
          await page.locator('[data-pane-button=templates]').click();
          await page.locator('#templates [data-template]').first().click();
          if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-continue').click();
        }
        await chooseTemplate();
        await page.waitForFunction(() => DiagramEditor.getDocument().lanes.length === 2);
        d = await getDoc(); assert.equal(d.diagramType, 'activity'); assert.ok(d.nodes.some(n => n.kind === 'fork')); assert.ok(d.nodes.some(n => n.kind === 'join'));
        const membership = d.nodes.map(n => [n.id,n.laneId]);
        await selectLayer(page, 'lanes');
        await page.locator('#lane-title').fill('作成者'); await page.locator('#lane-title').press('Tab');
        assert.equal((await getDoc()).lanes[0].title, '作成者');
        await page.locator('#lane-select').selectOption(d.lanes[1].id); await page.locator('#lane-title').fill('確認者'); await page.locator('#lane-title').press('Tab');
        assert.equal((await getDoc()).lanes[1].title, '確認者');
        await page.locator('#lane-select').selectOption(d.lanes[0].id); await page.locator('#lane-width').fill('9999'); await page.locator('#lane-width').press('Tab');
        d = await getDoc(); assert.deepEqual(d.nodes.map(n => [n.id,n.laneId]), membership);
        assert.equal(d.lanes[0].x + d.lanes[0].w, d.lanes[1].x); assert.ok(d.lanes[1].w >= 140);
        await selectLayer(page, 'diagram');
        await page.locator('#zoom').selectOption('fit');
        await page.screenshot({path:path.join(artifacts, `${engine}-activity.png`),fullPage:true});

        await page.locator('#diagram-type').selectOption('state'); await chooseTemplate();
        await page.waitForFunction(() => DiagramEditor.getDocument().diagramType === 'state' && DiagramEditor.getDocument().nodes.some(n => n.kind === 'state'));
        d = await getDoc(); assert.ok(d.edges.some(e => e.from.nodeId === e.to.nodeId));
        const routes = await page.evaluate(() => { const d = DiagramEditor.getDocument(); return d.edges.map(e => DiagramRender.edgeGeometry(d,e).path); });
        assert.equal(new Set(routes).size, routes.length, 'Parallel and opposite transitions need distinct paths');
        const labelEdge = d.edges.find(e => e.from.nodeId !== e.to.nodeId);
        await page.evaluate(id => DiagramEditor.select([id]), labelEdge.id);
        await clickToolbarAction(page, 'edit-text'); await commitText('<img src=x onerror=alert(1)> & 条件');
        assert.equal(await page.locator('#scene img').count(), 0);

        // Keyboard placement does not require pointer coordinates.
        const stateCount = (await getDoc()).nodes.length;
        await page.locator('[data-tool="node:state"]').focus(); await page.keyboard.press('Enter');
        await commitText('追加状態'); assert.equal((await getDoc()).nodes.length, stateCount + 1);
        await clickToolbarAction(page, 'delete-button'); assert.equal((await getDoc()).nodes.length, stateCount);
        await page.locator('#canvas').focus(); await page.keyboard.press('Escape'); await page.locator('#zoom').selectOption('fit');
        await page.screenshot({path:path.join(artifacts, `${engine}-state.png`),fullPage:true});

        await page.locator('[data-pane-button=export]').click();
        assert.equal(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el=>el.id); return ids.length === new Set(ids).size; }),true,'SVG previews must not reuse canvas marker IDs');
        let pending = page.waitForEvent('download'); await page.locator('#export-svg').click(); const svgDownload = await pending;
        const svgPath = path.join(artifacts, `${engine}.svg`); await svgDownload.saveAs(svgPath);
        const svg = await fs.readFile(svgPath, 'utf8');
        assert.match(svg, /&lt;img/); assert.doesNotMatch(svg, /<img|foreignObject|data-handle|tabindex/);
        pending = page.waitForEvent('download'); await page.locator('#export-png').click(); const pngDownload = await pending;
        const pngPath = path.join(artifacts, `${engine}.png`); await pngDownload.saveAs(pngPath);
        const png = await fs.readFile(pngPath); assert.equal(png.readUInt32BE(0), 0x89504e47); assert.ok(png.length > 5000);
        await page.locator('[data-close-side]:visible').first().click();

        const layouts = [];
        for (const width of [1280,736,390]) {
          await page.setViewportSize({width,height:860});
          for (const theme of ['light','dark','auto']) {
            await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption(theme);
            for (const size of ['standard','large','largest']) {
              await page.locator('#text-size').selectOption(size);
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
              assert.equal(overflow,false,`${engine} ${width} ${theme} ${size} horizontal overflow`);
            }
            await page.locator('.brand').click(); layouts.push(`${width}/${theme}`);
          }
        }
        await page.screenshot({path:path.join(artifacts, `${engine}-mobile.png`),fullPage:true});
        await clickToolbarAction(page, 'help-button'); assert.equal(await page.locator('#help-dialog').isVisible(),true);
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('help-dialog').open && document.getElementById('help-button') === document.activeElement);
        if (engine === 'chromium') {
          await page.setViewportSize({width:1280,height:860});
          await page.pdf({path:path.join(artifacts,'diagram-print.pdf'),format:'A4',printBackground:true});
          assert.ok(await page.locator('#print-sheet svg').count());
          assert.equal(await page.evaluate(() => [...document.querySelectorAll('#print-sheet [marker-end]')].every(el => {
            const id = el.getAttribute('marker-end').slice(5,-1); return document.getElementById(id)?.closest('svg') === el.closest('svg');
          })),true,'Print arrows must refer to visible markers in the printed SVG');
        }
        assert.deepEqual(errors,[]); assert.deepEqual(missing,[]);
        results.push({engine,passed:true,layouts,downloads:['JSON','SVG','PNG'],errors,missing});

        const touch = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
        const mobile = await touch.newPage(); mobile.on('dialog',d=>d.accept()); await mobile.goto(hosting.url); await mobile.waitForFunction(()=>!!window.DiagramEditor);
        await mobile.locator('[data-tool="node:process"]').tap();
        await mobile.locator('#canvas').tap({position:{x:160,y:180}});
        await mobile.locator('#inline-editor').fill('タップで配置'); await mobile.locator('#inline-editor').press('Control+Enter');
        assert.equal(await mobile.evaluate(()=>DiagramEditor.getDocument().nodes[0].text),'タップで配置');
        assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        await touch.close(); await context.close();
      } finally { await browser.close(); }
    }
  } finally { await hosting.close(); }
  console.log(JSON.stringify({ok:true,artifacts,results},null,2));
}

async function checkImageExportTools(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 }, acceptDownloads: true, ...(browser.browserType().name() === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
  try {
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const doc = Core.createDocument(), a = Core.createNode('process', 100, 130, { id: 'img_a', text: '選択する' }), b = Core.createNode('process', 370, 130, { id: 'img_b', text: '内部接続' }), outside = Core.createNode('text', 760, 320, { id: 'img_outside', text: '含めない文字' });
    const edge = Core.createEdge({ nodeId: a.id, side: 'right', offset: .5 }, { nodeId: b.id, side: 'left', offset: .5 }, { id: 'img_edge', bend: { x: 285, y: 90 }, label: { text: '内部線', dx: 22, dy: -18 } });
    doc.nodes = [a, b, outside]; doc.edges = [edge]; doc.groups = [{ id: 'img_group', memberIds: [a.id, b.id, edge.id] }];
    await loadFixture(page, doc); await page.locator('[data-pane-button=export]').click();
    assert.equal(await page.locator('#export-scope').inputValue(), 'all');
    await page.locator('#export-scope').selectOption('selection');
    for (const id of ['export-png', 'export-svg', 'export-copy-image']) assert.equal(await page.locator(`#${id}`).isDisabled(), true, `Empty selection disables ${id}`);
    await page.evaluate(id => DiagramEditor.select([id]), a.id); await page.waitForFunction(() => !document.getElementById('export-png').disabled);
    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument()); const before = await getDoc();
    await clickToolbarAction(page, 'copy-button');
    const selectedBefore = await page.locator('#selection-status').textContent();
    const download = async (selector, file) => { const pending = page.waitForEvent('download'); await page.locator(selector).click(); const item = await pending; await item.saveAs(file); return fs.readFile(file); };
    const stem = path.join(artifacts, `${browser.browserType().name()}-selection`);
    const svg = await download('#export-svg', `${stem}.svg`); const svgText = svg.toString();
    assert.match(svgText, /選択する|内部接続|内部線/); assert.doesNotMatch(svgText, /含めない文字/); assert.match(svgText, /img_edge/);
    await page.locator('#transparent').uncheck(); await page.locator('#export-scale').selectOption('1'); const white = await download('#export-png', `${stem}-white.png`); const whiteImage = await decodePng(page, white); assert.deepEqual(whiteImage.corner, [255,255,255,255]); assert.ok(whiteImage.ink, 'White PNG contains diagram ink');
    await page.locator('#transparent').check(); await page.locator('#export-scale').selectOption('2'); const transparent = await download('#export-png', `${stem}-transparent.png`); const transparentImage = await decodePng(page, transparent); assert.equal(transparentImage.corner[3], 0, 'Transparent PNG keeps a transparent padding corner'); assert.ok(transparentImage.ink, 'Transparent PNG contains diagram ink'); assert.ok(Math.abs(transparentImage.width - whiteImage.width * 2) <= 1 && Math.abs(transparentImage.height - whiteImage.height * 2) <= 1, '2x PNG dimensions account only for ceiling rounding');
    assert.deepEqual(await getDoc(), before, 'Image export does not change document data or selection');

    // Native clipboard is deliberately observed separately from the fallback path.
    // Attempt the actual platform API before installing the deterministic mock.
    await page.locator('#export-copy-image').click(); await page.waitForFunction(() => !document.getElementById('export-copy-image').disabled);
    const nativeFallback = !await page.locator('#image-copy-fallback').isHidden();
    if (!nativeFallback) assert.equal(await page.locator('#notice').textContent(), '画像をコピーしました', 'Native clipboard reports success when available'); else await page.locator('#image-copy-dismiss').click();
    console.log(`${browser.browserType().name()}: native PNG clipboard ${nativeFallback ? 'unavailable (fallback verified)' : 'write succeeded'}`);
    await page.evaluate(() => { window.__imageWrites = []; navigator.clipboard.write = async items => { window.__imageWrites.push(items); }; });
    await page.locator('#export-copy-image').click(); await page.waitForFunction(() => window.__imageWrites.length === 1);
    assert.equal(await page.locator('#image-copy-fallback').isHidden(), true, 'A supported clipboard write does not show fallback');
    assert.equal(await page.evaluate(() => window.__imageWrites[0][0].types.includes('image/png')), true, 'Clipboard writes a real PNG MIME item');
    const copied = await page.evaluate(async () => { const blob = await window.__imageWrites[0][0].getType('image/png'); return Array.from(new Uint8Array(await blob.arrayBuffer())); });
    const copiedImage = await decodePng(page, Buffer.from(copied)); assert.equal(copiedImage.width, transparentImage.width); assert.equal(copiedImage.height, transparentImage.height); assert.deepEqual(copiedImage.corner, transparentImage.corner, 'Clipboard PNG matches the same settings download');
    assert.deepEqual(await getDoc(), before, 'Copying an image does not change saved data');
    assert.equal(await page.locator('#selection-status').textContent(), selectedBefore); assert.equal(await page.locator('#undo').isDisabled(), true, 'Image copies do not create undo entries');
    await page.screenshot({ path: `${stem}-panel-1280.png`, fullPage: true });
    await page.evaluate(() => { navigator.clipboard.write = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    await page.locator('#export-copy-image').click(); await page.waitForFunction(() => !document.getElementById('image-copy-fallback').hidden);
    assert.equal(await page.locator('#image-copy-download').isVisible(), true, 'Clipboard rejection offers the same PNG for download');
    const fallback = await download('#image-copy-download', `${stem}-fallback.png`); const fallbackImage = await decodePng(page, fallback); assert.equal(fallbackImage.width, copiedImage.width); assert.deepEqual(fallbackImage.corner, copiedImage.corner, 'Fallback download uses the failed-copy PNG snapshot');
    await page.locator('#image-copy-dismiss').focus(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#image-copy-fallback').isHidden(), true, 'Escape dismisses the fallback');
    await openEditMenu(page); await page.locator('#copy-image-button').click(); await page.waitForFunction(() => !document.getElementById('image-copy-fallback').hidden); await page.locator('#image-copy-dismiss').click();
    // Delay encoding so edits made after the click cannot accidentally enter the copied image.
    await page.evaluate(() => {
      window.__originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) { window.__finishPng = () => window.__originalToBlob.call(this, callback, ...args); };
      window.__delayedWrites = [];
      navigator.clipboard.write = async items => { window.__delayedWrites.push(items); window.__delayedPng = await items[0].getType('image/png'); };
    });
    await page.locator('#export-copy-image').click(); await page.waitForFunction(() => !!window.__finishPng);
    for (const id of ['export-copy-image','export-png','copy-image-button']) assert.equal(await page.locator(`#${id}`).isDisabled(), true, 'Image generation blocks duplicate image actions');
    await page.evaluate(() => document.getElementById('export-copy-image').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await page.evaluate(() => window.__delayedWrites.length), 1);
    await page.evaluate(id => DiagramEditor.select([id]), outside.id);
    await page.locator('#file-menu > summary').click(); await page.locator('#document-title').fill('コピー開始後の名前'); await page.locator('#document-title').press('Tab'); await page.locator('#file-menu > summary').press('Escape');
    await page.locator('#transparent').uncheck(); await page.locator('#export-scale').selectOption('4');
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__originalToBlob; window.__finishPng(); });
    await page.waitForFunction(() => !!window.__delayedPng && !document.getElementById('export-copy-image').disabled);
    const delayedBytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.__delayedPng.arrayBuffer())));
    assert.deepEqual(await decodePng(page, Buffer.from(delayedBytes)), copiedImage, 'The in-flight image keeps its original selection, background and resolution');
    assert.equal((await getDoc()).title, 'コピー開始後の名前');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), before, 'Only the actual document edit enters undo history');
    await clickToolbarAction(page, 'paste-button'); assert.equal((await getDoc()).nodes.length, before.nodes.length + 2, 'Image copying retains the editable group in the internal clipboard');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), before);
    await page.evaluate(id => DiagramEditor.select([id]), a.id); await page.locator('#transparent').check(); await page.locator('#export-scale').selectOption('2');
    await page.evaluate(() => { window.ClipboardItem = undefined; }); await page.locator('#export-copy-image').click(); await page.waitForFunction(() => !document.getElementById('image-copy-fallback').hidden); assert.match(await page.locator('#image-copy-message').textContent(), /保存|コピー/); await page.locator('#image-copy-dismiss').click();
    // The selection popup copies only a selection; whole-diagram copying remains in the export panel.
    await page.evaluate(() => DiagramEditor.select([])); await page.locator('#export-scope').selectOption('all'); await page.locator('#export-copy-image').click();
    await page.waitForFunction(() => !document.getElementById('image-copy-fallback').hidden);
    const whole = await download('#image-copy-download', `${stem}-whole.png`), wholeImage = await decodePng(page, whole);
    assert.ok(wholeImage.width > copiedImage.width, 'The whole image includes the distant unselected object');
    await page.locator('#image-copy-dismiss').click(); assert.equal(await page.locator('#export-copy-image').evaluate(el => el === document.activeElement), true);
    await page.locator('#export-scope').selectOption('all'); const wholeSvg = await download('#export-svg', `${stem}-whole.svg`); assert.match(wholeSvg.toString(), /含めない文字/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  const touch = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  try {
    const page = await touch.newPage(); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor); await page.locator('#toolbar-toggle').tap(); await page.locator('#settings-menu > summary').tap(); await page.locator('#text-size').selectOption('largest'); await page.locator('#theme').selectOption('dark'); await page.locator('#settings-menu > summary').press('Escape');
    const mobileDoc = Core.createTemplate('flow-branch'); await loadFixture(page, mobileDoc);
    await page.locator('[data-pane-button=export]').tap(); for (const id of ['export-scope', 'export-copy-image', 'export-png', 'export-svg']) { await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await expectWithinViewport(page, `#${id}`, `${id} fits the mobile export panel`); }
    await page.locator('#export-png').scrollIntoViewIfNeeded(); const pendingDownload = page.waitForEvent('download'); await page.locator('#export-png').tap();
    const mobilePng = await pendingDownload; await mobilePng.saveAs(path.join(artifacts, `${browser.browserType().name()}-image-export-touch.png`));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-image-export-390-dark.png`), fullPage: true });
  } finally { await touch.close(); }
}

async function checkSizeStyleTools(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 } });
  try {
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const doc = Core.createDocument(), a = Core.createNode('process', 100, 120, { id: 'size_a', text: '基準', w: 200, h: 90, style: { fontSize:24, bold:true, stroke:'#b83232', fill:'#ffeeaa', color:'#123456', strokeWidth:3, dashed:true } }), b = Core.createNode('process', 420, 160, { id: 'size_b', text: '対象', w: 120, h: 50, style: { fontSize:12, stroke:'#2255aa', fill:'#ddffdd', color:'#222222', strokeWidth:1, dashed:false } });
    const e = Core.createEdge({ nodeId: a.id, side: 'right', offset: .5 }, { nodeId: b.id, side: 'left', offset: .5 }, { id: 'size_edge', label: { text: '保持', dx: 18, dy: -14 }, bend: { x: 340, y: 90 } }); doc.nodes = [a,b]; doc.edges = [e];
    await loadFixture(page, doc); const getDoc = () => page.evaluate(() => DiagramEditor.getDocument()); await page.evaluate(ids => DiagramEditor.select(ids), [a.id,b.id]); await openEditMenu(page);
    await page.locator('#match-size-button').click(); await page.waitForFunction(() => document.getElementById('size-dialog').open);
    assert.equal(await page.locator('#size-reference').inputValue(), a.id); await page.locator('#size-dimension').selectOption('width'); await page.locator('#size-apply').click();
    let current = await getDoc(); assert.equal(current.nodes.find(n=>n.id===b.id).w, a.w); assert.equal(current.nodes.find(n=>n.id===b.id).h, b.h); assert.equal(current.nodes.find(n=>n.id===b.id).x + current.nodes.find(n=>n.id===b.id).w/2, b.x+b.w/2, 'Width matching preserves center'); assert.deepEqual(current.edges[0], e, 'Size matching preserves edge metadata');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), doc); await page.locator('#redo').click();
    await page.evaluate(ids => DiagramEditor.select(ids), [a.id,b.id]); await openEditMenu(page); await page.locator('#match-size-button').click(); await page.locator('#size-dimension').selectOption('both'); await page.locator('#size-apply').click(); current = await getDoc(); assert.equal(current.nodes.find(n=>n.id===b.id).h,a.h); assert.equal(current.nodes.find(n=>n.id===b.id).w,a.w);
    await page.locator('#undo').click();
    // Style snapshots are independent from ordinary copy/paste and preserve all non-style metadata.
    await page.evaluate(id => DiagramEditor.select([id]), a.id); await openEditMenu(page); await page.locator('#copy-style-button').click(); assert.match(await page.locator('#style-clipboard-status').textContent(), /コピー元/);
    const beforeStyle = await getDoc(); await page.evaluate(id => DiagramEditor.select([id]), b.id); await openEditMenu(page); assert.equal(await page.locator('#paste-style-button').isDisabled(), false); await page.locator('#paste-style-button').click(); current = await getDoc(); const styled = current.nodes.find(n=>n.id===b.id), beforeTarget = beforeStyle.nodes.find(n=>n.id===b.id); assert.deepEqual(styled.style, beforeStyle.nodes.find(n=>n.id===a.id).style); assert.equal(styled.text,beforeTarget.text); assert.equal(styled.x,beforeTarget.x); assert.equal(styled.w,beforeTarget.w);
    await page.evaluate(id => DiagramEditor.select([id]), b.id); await clickToolbarAction(page, 'copy-button'); assert.ok((await getDoc()).nodes.length===2,'Ordinary copy remains separate from style clipboard');
    await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape'); await page.setViewportSize({width:736,height:736}); await page.waitForFunction(()=>document.querySelector('.toolbar').dataset.compact==='true'); await page.evaluate(ids => DiagramEditor.select(ids), [a.id,b.id]); await openEditMenu(page); await page.locator('#match-size-button').click(); await expectWithinViewport(page,'#size-dialog','Size dialog fits at 736px'); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('size-dialog').open && document.querySelector('#edit-menu > summary') === document.activeElement); await page.screenshot({path:path.join(artifacts,`${browser.browserType().name()}-size-style-736-dark.png`),fullPage:true}); assert.deepEqual(errors,[]);
  } finally { await context.close(); }
}

async function checkSizeStyleDetails(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  try {
    const page = await context.newPage(), errors = [], missing = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    page.on('response', r => { if (r.status() === 404 && /\.(js|css|svg|html)(?:\?|$)/.test(r.url())) missing.push(r.url()); });
    page.setDefaultTimeout(12000); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument());
    const select = ids => page.evaluate(ids => DiagramEditor.select(ids), ids);
    const menuAction = async id => { await openEditMenu(page); await page.locator(`#${id}`).click(); };
    const closed = id => page.waitForFunction(id => !document.getElementById(id).open && document.activeElement === document.querySelector('#edit-menu > summary'), id);
    const nonStyle = item => { const copy = structuredClone(item); delete copy.style; return copy; };
    const center = n => [n.x + n.w / 2, n.y + n.h / 2];
    const doc = Core.createDocument('activity');
    const style = { fontSize: 24, bold: true, stroke: '#b83232', fill: '#ffeeaa', color: '#123456', strokeWidth: 3, dashed: true };
    const a = Core.createNode('action', 70, 150, { id: 'detail_a', text: '書式の基準', w: 240, h: 100, laneId: doc.lanes[0].id, style });
    const b = Core.createNode('action', 400, 200, { id: 'detail_b', text: '対象の文字', w: 120, h: 80, laneId: doc.lanes[1].id, style: { fill: '#ddeeff' } });
    const c = Core.createNode('action', 400, 400, { id: 'detail_c', text: 'もう1つの対象', w: 180, h: 70, laneId: doc.lanes[1].id });
    const e = Core.createEdge({ nodeId: a.id, side: 'right', offset: 1 / 3 }, { nodeId: b.id, side: 'left', offset: .5 }, { id: 'detail_link', label: { text: '条件', t: .3, dx: 12, dy: -20 }, bend: { x: 355, y: 170 } });
    const free = Core.createEdge({ x: 80, y: 390 }, { x: 300, y: 420 }, { id: 'detail_free', kind: 'curve', head: 'both', bend: { x: 170, y: 310 }, label: { text: '注記', t: .7, dx: 18, dy: 9 }, style: { stroke: '#674ea7', color: '#274e13', fill: '#cfe2f3', fontSize: 18, strokeWidth: 4 } });
    doc.nodes = [a, b, c]; doc.edges = [e, free];
    await loadFixture(page, doc);
    await select([b.id, a.id]); await menuAction('match-size-button');
    assert.equal(await page.locator('#size-reference').inputValue(), b.id, 'The first selected node is the initial reference, even when document order differs');
    await page.locator('#size-reference').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#size-dimension').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.locator('#size-reference').evaluate(el => el === document.activeElement), true);
    await page.locator('#size-dimension').selectOption('height'); await page.locator('#size-apply').press('Enter'); await closed('size-dialog');
    let current = await getDoc();
    assert.equal(current.nodes[0].h, b.h); assert.equal(current.nodes[0].w, a.w);
    assert.deepEqual(center(current.nodes[0]), center(a)); assert.deepEqual(current.nodes.slice(1), doc.nodes.slice(1));
    assert.deepEqual(current.edges, doc.edges); assert.deepEqual(current.lanes, doc.lanes);
    const anchor = await page.evaluate(id => { const d = DiagramEditor.getDocument(); return DiagramRender.edgeGeometry(d, d.edges.find(e => e.id === id)).from; }, e.id);
    assert.ok(Math.abs(anchor.x - (current.nodes[0].x + current.nodes[0].w)) < 1e-7);
    assert.ok(Math.abs(anchor.y - (current.nodes[0].y + current.nodes[0].h / 3)) < 1e-7, 'Attached endpoint follows the resized shape at its stored fraction');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), doc); await page.locator('#redo').click(); assert.deepEqual(await getDoc(), current);
    await menuAction('match-size-button'); await page.locator('#size-reference').selectOption(a.id); await page.locator('#size-dimension').selectOption('both');
    const beforeCancel = await getDoc(); await page.locator('#size-dialog [data-close-dialog]').click(); await closed('size-dialog'); assert.deepEqual(await getDoc(), beforeCancel);
    await menuAction('match-size-button'); await page.locator('#size-reference').selectOption(a.id); await page.locator('#size-dimension').selectOption('both'); await page.locator('#size-apply').click(); await closed('size-dialog');
    current = await getDoc(); assert.equal(current.nodes[1].w, current.nodes[0].w); assert.equal(current.nodes[1].h, current.nodes[0].h);
    assert.deepEqual(center(current.nodes[1]), center(b));
    await menuAction('match-size-button'); assert.equal(await page.locator('#size-apply').isDisabled(), true); assert.match(await page.locator('#size-note').textContent(), /すでに/);
    await page.keyboard.press('Escape'); await closed('size-dialog'); await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeCancel, 'A no-op adds no history entry');

    // The group includes a free arrow so every style target type is exercised.
    const grouped = Core.clone(doc); grouped.id = Core.uid('doc'); grouped.groups = [{ id: 'detail_group', memberIds: [b.id, c.id, free.id] }];
    await loadFixture(page, grouped); await select([b.id]); await menuAction('copy-style-button');
    assert.equal(await page.locator('#style-dialog').isVisible(), true); assert.equal(await page.locator('#style-reference option').count(), 3);
    await page.locator('#style-reference').selectOption(free.id); await page.locator('#style-copy').press('Enter'); await closed('style-dialog');
    assert.match(await page.locator('#style-clipboard-status').textContent(), /注記/); assert.deepEqual(await getDoc(), grouped); assert.equal(await page.locator('#undo').isDisabled(), true);
    await menuAction('copy-style-button'); await page.keyboard.press('Escape'); await closed('style-dialog');
    assert.match(await page.locator('#style-clipboard-status').textContent(), /注記/, 'Cancelling a new copy keeps the previous style');

    // Keep an ordinary component copy as well as a separate style snapshot.
    await select([a.id]); await clickToolbarAction(page, 'copy-button'); await menuAction('copy-style-button');
    const savedStatus = await page.locator('#save-status').textContent(); assert.equal(await page.locator('#undo').isDisabled(), true);
    await menuAction('copy-style-button'); assert.equal(await page.locator('#save-status').textContent(), savedStatus);
    await openMenuFor(page, '#stroke-color'); await page.locator('#color-target').selectOption('stroke'); await page.locator('#stroke-color').fill('#00aa55'); await page.locator('#stroke-color').dispatchEvent('input');
    assert.equal((await getDoc()).nodes[0].style.stroke, '#00aa55'); await clickToolbarAction(page, 'delete-button');
    assert.ok(!(await getDoc()).nodes.some(n => n.id === a.id));
    await select([b.id]); const beforePaste = await getDoc(); await menuAction('paste-style-button'); const pasted = await getDoc();
    for (const n of pasted.nodes) assert.deepEqual(n, { ...beforePaste.nodes.find(old => old.id === n.id), style: a.style });
    assert.deepEqual(pasted.groups, beforePaste.groups); assert.deepEqual(pasted.lanes, beforePaste.lanes);
    assert.deepEqual(pasted.edges[0], { ...beforePaste.edges[0], style: { ...a.style, fill: beforePaste.edges[0].style.fill } });
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforePaste); await page.locator('#redo').click(); assert.deepEqual(await getDoc(), pasted);
    await menuAction('paste-style-button'); assert.match(await page.locator('#notice').textContent(), /すでに/);
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforePaste, 'Repeated style paste does not create a no-op history entry'); await page.locator('#redo').click();
    await clickToolbarAction(page, 'paste-button'); const ordinaryPaste = await getDoc(), added = ordinaryPaste.nodes.find(n => !pasted.nodes.some(old => old.id === n.id));
    assert.equal(ordinaryPaste.nodes.length, pasted.nodes.length + 1); assert.equal(added.text, a.text); assert.deepEqual(added.style, a.style);
    assert.equal(added.w, a.w); assert.equal(added.h, a.h); assert.deepEqual(ordinaryPaste.edges, pasted.edges, 'Style copy leaves the ordinary component clipboard intact');

    // Loading a different file keeps the style clipboard; copying an arrow preserves target fills.
    const next = Core.createDocument('state'); next.nodes = [Core.createNode('state', 100, 140, { id: 'next_node', variant: 'round', text: '状態は保持', w: 190, h: 90, style: { fill: '#abcdef' } })];
    next.edges = [Core.clone(free), Core.createEdge({ x: 400, y: 170 }, { x: 520, y: 280 }, { id: 'next_edge', kind: 'straight', head: 'none', label: { text: 'ラベルも保持', t: .3, dx: -4, dy: 10 }, style: { fill: '#111111' } })];
    await loadFixture(page, next); await select([next.nodes[0].id]); await menuAction('paste-style-button');
    assert.deepEqual((await getDoc()).nodes[0].style, a.style, 'A copied style survives opening another file');
    await select([free.id]); await menuAction('copy-style-button'); await select([next.nodes[0].id, 'next_edge']);
    const beforeArrowPaste = await getDoc(); await menuAction('paste-style-button'); current = await getDoc();
    for (const [actual, prior] of [[current.nodes[0], beforeArrowPaste.nodes[0]], [current.edges[1], beforeArrowPaste.edges[1]]]) {
      assert.deepEqual(nonStyle(actual), nonStyle(prior)); assert.deepEqual(actual.style, { ...free.style, fill: prior.style.fill });
    }
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeArrowPaste); await page.locator('#redo').click(); assert.deepEqual(await getDoc(), current);
    const outputSvg = await page.evaluate(() => DiagramEditor.exportSVG());
    assert.ok(outputSvg.includes('stroke="#674ea7"')); assert.ok(outputSvg.includes('fill="#ffeeaa"')); assert.ok(outputSvg.includes('状態は保持'));
    assert.doesNotMatch(outputSvg, /size-dialog|style-clipboard|data-handle|data-alignment-guide/);
    const pending = page.waitForEvent('download'); await page.locator('#file-menu > summary').click(); await page.locator('#save-file').click();
    const file = path.join(artifacts, `${browser.browserType().name()}-size-style.diagram.json`); await (await pending).saveAs(file);
    assert.deepEqual(Core.parseDocument(JSON.parse(await fs.readFile(file, 'utf8'))), current);
    await page.reload(); await restoreBrowserAuto(page); assert.deepEqual(await getDoc(), current);
    await select([next.nodes[0].id]); await openEditMenu(page); assert.equal(await page.locator('#paste-style-button').isDisabled(), true);
    assert.match(await page.locator('#style-clipboard-status').textContent(), /まだコピー/); await page.locator('#edit-menu > summary').press('Escape');

    const states = Core.createDocument('state');
    const ref = Core.createNode('state', 60, 160, { id: 'locked_ref', variant: 'round', w: 200, h: 80, text: '固定した基準', locked: true });
    const regular = Core.createNode('state', 360, 160, { id: 'regular_target', variant: 'round', w: 140, h: 70, text: '対象' });
    const circle = Core.createNode('state', 620, 160, { id: 'circle_target', w: 120, h: 120, text: '円形' });
    states.nodes = [ref, regular, circle]; states.groups = [{ id: 'state_group', memberIds: [regular.id, circle.id] }];
    await loadFixture(page, states); await select([ref.id, regular.id]); await menuAction('match-size-button');
    await page.locator('#size-dimension').selectOption('both'); assert.equal(await page.locator('#size-apply').isDisabled(), true); assert.match(await page.locator('#size-note').textContent(), /円形/); assert.deepEqual(await getDoc(), states);
    await page.locator('#size-dimension').selectOption('height'); await page.locator('#size-apply').click(); await closed('size-dialog'); current = await getDoc();
    assert.deepEqual(current.nodes[0], ref); assert.equal(current.nodes[1].h, 80); assert.equal(current.nodes[2].w, 80); assert.equal(current.nodes[2].h, 80); assert.deepEqual(current.groups, states.groups);
    assert.deepEqual(center(current.nodes[1]), center(regular)); assert.deepEqual(center(current.nodes[2]), center(circle));
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), states);
    await select([ref.id]); await menuAction('copy-style-button'); await openEditMenu(page); assert.equal(await page.locator('#paste-style-button').isDisabled(), true, 'Locked source can be copied but cannot be pasted onto');
    await select([regular.id]); await menuAction('lock-button'); await select([ref.id, regular.id]); await menuAction('match-size-button');
    assert.equal(await page.locator('#size-apply').isDisabled(), true); assert.match(await page.locator('#size-note').textContent(), /固定/);
    await page.keyboard.press('Escape'); await closed('size-dialog');
    const lockedDoc = await getDoc();
    for (const [width, theme] of [[1280, 'light'], [736, 'dark']]) {
      await page.setViewportSize({ width, height: 860 }); if (width <= 736) await page.waitForFunction(() => document.querySelector('.toolbar').dataset.compact === 'true'); await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption(theme); await page.locator('#settings-menu > summary').press('Escape');
      await menuAction('copy-style-button'); await expectWithinViewport(page, '#style-dialog', `Style chooser fits ${width}px`);
      await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-style-dialog-${width}-${theme}.png`), fullPage: true });
      await page.keyboard.press('Escape'); await closed('style-dialog'); assert.deepEqual(await getDoc(), lockedDoc);
    }
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  } finally { await context.close(); }
}

async function checkSizeStyleTouch(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  try {
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    await page.locator('#toolbar-toggle').tap(); await page.locator('#settings-menu > summary').tap(); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape');
    const doc = Core.createDocument(), a = Core.createNode('process', 80, 160, { id: 'touch_size_a', text: '基準', w: 240, h: 100, style: { fill: '#ffeeaa', color: '#123456', stroke: '#b83232', fontSize: 24, bold: true, dashed: true } }), b = Core.createNode('process', 80, 370, { id: 'touch_size_b', text: '対象', w: 140, h: 80 }); doc.nodes = [a, b];
    await loadFixture(page, doc); await page.evaluate(ids => DiagramEditor.select(ids), [a.id, b.id]);
    await page.locator('#edit-menu > summary').tap(); await page.locator('#match-size-button').tap();
    await expectWithinViewport(page, '#size-dialog', 'Size dialog fits 390px with largest text');
    for (const id of ['size-reference', 'size-dimension', 'size-apply']) { const box = await page.locator(`#${id}`).boundingBox(); assert.ok(box.height >= 44, `${id} touch target: ${JSON.stringify(box)}`); await expectWithinViewport(page, `#${id}`, `${id} is reachable by touch`); }
    await page.locator('#size-reference').selectOption(b.id); await page.locator('#size-dimension').selectOption('both');
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-size-dialog-390-touch.png`), fullPage: true });
    await page.locator('#size-apply').tap(); await page.waitForFunction(() => !document.getElementById('size-dialog').open);
    const resized = await page.evaluate(() => DiagramEditor.getDocument()); assert.equal(resized.nodes[0].w, b.w); assert.equal(resized.nodes[0].h, b.h);
    await page.locator('#undo').tap(); assert.deepEqual(await page.evaluate(() => DiagramEditor.getDocument()), doc);
    await page.locator('#edit-menu > summary').tap(); await page.locator('#copy-style-button').tap();
    await expectWithinViewport(page, '#style-dialog', 'Style dialog fits 390px with largest text');
    for (const id of ['style-reference', 'style-copy']) { const box = await page.locator(`#${id}`).boundingBox(); assert.ok(box.height >= 44, `${id} touch target: ${JSON.stringify(box)}`); await expectWithinViewport(page, `#${id}`, `${id} is reachable by touch`); }
    await page.locator('#style-reference').selectOption(a.id); await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-style-dialog-390-touch.png`), fullPage: true });
    await page.locator('#style-copy').tap(); await page.waitForFunction(() => !document.getElementById('style-dialog').open);
    await page.evaluate(id => DiagramEditor.select([id]), b.id); await page.locator('#edit-menu > summary').tap();
    await expectWithinViewport(page, '#paste-style-button', 'Style paste fits the compact edit menu'); assert.ok((await page.locator('#paste-style-button').boundingBox()).height >= 44);
    await page.locator('#paste-style-button').tap(); const after = await page.evaluate(() => DiagramEditor.getDocument()); assert.deepEqual(after.nodes[1], { ...b, style: a.style });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); assert.equal(await page.locator('[data-pane-button="lesson"]').isHidden(), true); assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function checkAuthoringTools(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 }, acceptDownloads: true });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    assert.equal(await page.locator('body').getAttribute('data-lesson-tools'), 'off', 'Production starts with dormant authoring tools disabled');
    for (const selector of ['[data-pane-button="lesson"]', '[data-pane="lesson"]']) assert.equal(await page.locator(selector).isHidden(), true, `${selector} stays out of the production UI`);
    for (const id of ['undo', 'redo', 'paste-button']) assert.equal(await page.locator(`#${id}`).evaluate(el => !!el.closest('.top .toolbar')), true, `${id} remains in the top toolbar`);
    for (const id of ['copy-button', 'duplicate-button', 'delete-button', 'group-button', 'ungroup-button', 'lock-button']) assert.equal(await page.locator(`#${id}`).evaluate(el => !!el.closest('#format-bar #edit-menu')), true, `${id} is collected in the selection popup`);
    assert.equal(await page.locator('#connect-button').evaluate(el => !!el.closest('.palette')), true, 'Connection creation remains with lines and arrows');
    assert.equal(await page.locator('.palette-group').count(), 2, 'The left palette contains only shapes and lines');
    const checkTopMenus = async () => {
      for (const [summary, content] of [['#behavior-menu > summary', '#alignment-snap'], ['#settings-menu > summary', '#text-size']]) {
        await openMenuFor(page, summary); await expectWithinViewport(page, content, `${content} fits while its top toolbar menu is open`); await page.locator(summary).press('Escape');
      }
    };
    await checkTopMenus();
    for (const width of [1280, 736]) for (const size of ['standard', 'large', 'largest']) {
      await page.setViewportSize({ width, height: 736 }); await openMenuFor(page, '#settings-menu'); await page.locator('#text-size').selectOption(size); await page.locator('#settings-menu > summary').press('Escape');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Toolbar has no horizontal overflow at ${width}px and ${size}`); await checkTopMenus();
    }
    await page.setViewportSize({ width: 736, height: 736 }); await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-authoring-toolbar-736.png`), fullPage: true });
    await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('standard'); await page.locator('#settings-menu > summary').press('Escape'); await checkTopMenus();
    await openBehaviorMenu(page); await page.locator('#alignment-snap').uncheck(); await page.reload(); await restoreBrowserAuto(page);
    await openBehaviorMenu(page); assert.equal(await page.locator('#alignment-snap').isChecked(), false, 'Disabled alignment snapping survives a reload'); await page.locator('#alignment-snap').check(); await page.reload(); await restoreBrowserAuto(page);
    await openBehaviorMenu(page); assert.equal(await page.locator('#alignment-snap').isChecked(), true, 'Enabled alignment snapping survives a reload'); await page.locator('#behavior-menu > summary').press('Escape');

    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument());
    const author = Core.createDocument(), first = Core.createNode('process', 130, 140, { id: 'author_first', text: '準備' }), second = Core.createNode('process', 460, 140, { id: 'author_second', text: '確認' });
    author.nodes = [first, second]; author.lesson = { instructions: '<b>問題文</b> を読んで完成させる', studentMode: false };
    await page.setViewportSize({ width: 1280, height: 736 }); await loadFixture(page, author);
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-authoring-toolbar-1280.png`), fullPage: true });
    await page.locator(`[data-node="${first.id}"]`).click();
    await openEditMenu(page); await page.locator('#duplicate-button').focus(); await page.keyboard.press('Enter');
    assert.equal((await getDoc()).nodes.length, 3, 'A selection popup action works from the keyboard');
    await page.locator('#undo').click(); assert.equal((await getDoc()).nodes.length, 2, 'Undo remains available in the top toolbar');
    await page.locator(`[data-node="${first.id}"]`).click();
    await openEditMenu(page); await page.locator('#lock-button').click();
    assert.equal((await getDoc()).nodes.find(node => node.id === first.id).locked, true, 'The compact edit menu changes the selected item');
    await page.locator('.edit-more > summary').press('Escape');

    const studentAssignment = Core.clone(author); studentAssignment.id = 'student_assignment'; studentAssignment.lesson.studentMode = true;
    await loadFixture(page, studentAssignment);
    await page.locator('#show-assignment').click(); await page.waitForFunction(() => document.getElementById('assignment-dialog').open);
    assert.equal(await page.locator('#assignment-dialog-text').textContent(), author.lesson.instructions, 'The assignment dialog preserves the stored lesson text as plain text');
    assert.equal(await page.locator('#assignment-dialog-text b').count(), 0, 'Lesson instructions in the dialog are never parsed as HTML');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('assignment-dialog').open);
    assert.equal(await page.locator('#show-assignment').evaluate(el => el === document.activeElement), true, 'Closing the assignment dialog restores focus to its opener');

    // Alignment is checked with grid snapping disabled so the six-screen-pixel guide tolerance is observable.
    const aligned = Core.createDocument();
    const moving = Core.createNode('process', 100, 160, { id: 'guide_moving', text: '移動する' });
    const partner = Core.createNode('process', 320, 160, { id: 'guide_partner', text: '一緒に動く' });
    const target = Core.createNode('process', 560, 160, { id: 'guide_target', text: '固定の目標' });
    const internal = Core.createEdge({ nodeId: moving.id, side: 'right', offset: .5 }, { nodeId: partner.id, side: 'left', offset: .5 }, { id: 'guide_internal', bend: { x: 270, y: 120 } });
    aligned.nodes = [moving, partner, target]; aligned.edges = [internal]; aligned.groups = [{ id: 'guide_group', memberIds: [moving.id, partner.id, internal.id] }];
    await loadFixture(page, aligned); await page.locator('#zoom').selectOption('1');
    await openBehaviorMenu(page); await page.locator('#snap').uncheck(); await page.locator('#alignment-snap').check(); await page.locator('#behavior-menu > summary').press('Escape');
    const dragGroupNearTarget = async ({ finish = true, alt = false } = {}) => {
      const state = await getDoc(), groupNodes = state.nodes.filter(node => node.id !== target.id);
      const right = Math.max(...groupNodes.map(node => node.x + node.w));
      const delta = state.nodes.find(node => node.id === target.id).x - right - 4;
      const startWorld = { x: state.nodes.find(node => node.id === moving.id).x + moving.w / 2, y: state.nodes.find(node => node.id === moving.id).y + moving.h / 2 };
      const start = await screenPoint(page, startWorld);
      const end = await screenPoint(page, { x: startWorld.x + delta, y: startWorld.y });
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      // Playwright mouse.move does not carry modifier state; dispatch the same pointer event used by an Option drag.
      if (alt) await page.evaluate(({ x, y }) => document.querySelector('#canvas').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: x, clientY: y, altKey: true })), end);
      else await page.mouse.move(end.x, end.y, { steps: 5 });
      if (finish) await page.mouse.up();
      return { state, delta };
    };
    const beforeGroup = await getDoc(); await dragGroupNearTarget();
    let current = await getDoc(); const targetNow = current.nodes.find(node => node.id === target.id), movedNow = current.nodes.find(node => node.id === moving.id), partnerNow = current.nodes.find(node => node.id === partner.id);
    assert.equal(partnerNow.x + partnerNow.w, targetNow.x, 'A group snaps to the target edge within the raw six-screen-pixel tolerance');
    assert.equal(partnerNow.x - movedNow.x, partner.x - moving.x, 'Guide snapping keeps group-relative positions');
    assert.deepEqual(current.edges.find(edge => edge.id === internal.id).bend, { x: internal.bend.x + movedNow.x - moving.x, y: internal.bend.y }, 'A grouped manual bend moves by the same snapped delta');
    assert.equal(await page.locator('#overlay [data-alignment-guide]').count(), 0, 'Guides disappear after pointerup');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeGroup, 'One drag creates one undo step');

    await dragGroupNearTarget({ finish: false });
    assert.equal(await page.locator('#overlay [data-alignment-guide="x"]').count(), 1, 'A live vertical guide marks x alignment');
    assert.equal(await page.locator('#overlay [data-alignment-guide="y"]').count(), 1, 'A live horizontal guide marks y alignment');
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-alignment-guide-live.png`), fullPage: true });
    const duringGuide = await getDoc(), svgDuringGuide = await page.evaluate(() => DiagramEditor.exportSVG());
    assert.doesNotMatch(svgDuringGuide, /alignment-guide/, 'Exported SVG never contains a transient alignment overlay');
    assert.deepEqual(await getDoc(), duringGuide, 'Exporting while a guide is visible does not change the document');
    await page.keyboard.press('Escape'); await page.mouse.up(); assert.deepEqual(await getDoc(), beforeGroup, 'Escape cancels a guide drag without changing data');
    assert.equal(await page.locator('#overlay [data-alignment-guide]').count(), 0, 'Escape clears live guides');
    const cancelFixture = Core.clone(aligned); cancelFixture.id = 'guide_pointercancel'; await loadFixture(page, cancelFixture); const beforePointerCancel = await getDoc();
    await dragGroupNearTarget({ finish: false }); await page.evaluate(() => document.getElementById('canvas').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))); await page.mouse.up();
    assert.deepEqual(await getDoc(), beforePointerCancel, 'Pointer cancellation restores the document before a guide drag'); assert.equal(await page.locator('#overlay [data-alignment-guide]').count(), 0, 'Pointer cancellation clears live guides');

    await openBehaviorMenu(page); await page.locator('#alignment-snap').uncheck(); await page.locator('#behavior-menu > summary').press('Escape');
    const withoutGuide = await dragGroupNearTarget(); current = await getDoc();
    assert.equal(await page.locator('#overlay [data-alignment-guide]').count(), 0, 'Disabling alignment has no guide');
    assert.ok(Math.abs(current.nodes.find(node => node.id === moving.id).x - (moving.x + withoutGuide.delta)) < .01, 'With both grid and alignment snapping off, a drag keeps its free position');
    await page.locator('#undo').click();
    await openBehaviorMenu(page); await page.locator('#alignment-snap').check(); await page.locator('#behavior-menu > summary').press('Escape');
    await dragGroupNearTarget({ finish: false, alt: true }); assert.equal(await page.locator('#overlay [data-alignment-guide]').count(), 0, 'Option temporarily disables alignment guides'); await page.keyboard.press('Escape'); await page.mouse.up();

    const lockedTarget = Core.clone(aligned); lockedTarget.id = 'guide_locked_target'; lockedTarget.nodes.find(node => node.id === target.id).locked = true;
    await loadFixture(page, lockedTarget); await page.locator('#zoom').selectOption('1'); await dragGroupNearTarget({ finish: false });
    assert.equal(await page.locator('#overlay [data-alignment-guide="x"]').count(), 1, 'A locked item remains a usable alignment target'); await page.mouse.up();
    const lockedMoving = Core.clone(lockedTarget); lockedMoving.id = 'guide_locked_moving'; lockedMoving.nodes.find(node => node.id === moving.id).locked = true;
    await loadFixture(page, lockedMoving); const beforeLocked = await getDoc();
    const lockedCenter = await screenPoint(page, { x: moving.x + moving.w / 2, y: moving.y + moving.h / 2 }); await page.mouse.move(lockedCenter.x, lockedCenter.y); await page.mouse.down(); await page.mouse.move(lockedCenter.x + 50, lockedCenter.y + 30); await page.mouse.up();
    assert.deepEqual(await getDoc(), beforeLocked, 'A locked selected item cannot move toward a guide');
    const reloadedAligned = Core.clone(aligned); reloadedAligned.id = 'guide_reloaded';
    await loadFixture(page, reloadedAligned); assert.equal(await page.locator('#overlay [data-alignment-guide]').count(), 0, 'Loading a file clears guides');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }

  const touch = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  try {
    const page = await touch.newPage(); page.setDefaultTimeout(12000); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    await page.locator('#toolbar-toggle').tap(); await page.locator('#settings-menu > summary').tap(); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'The production toolbar remains horizontally usable at 390px');
    for (const selector of ['#paste-button', '#connect-button']) {
      await page.locator(selector).scrollIntoViewIfNeeded(); const box = await page.locator(selector).boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44, `${selector} remains a 44px touch target`);
    }
    const mobileDoc = Core.createDocument(), mobileNode = Core.createNode('process', 120, 160, { id: 'authoring_touch_node', text: '操作' }); mobileDoc.nodes = [mobileNode];
    await loadFixture(page, mobileDoc); await page.locator(`[data-node="${mobileNode.id}"]`).tap();
    for (const selector of ['#edit-menu > summary']) {
      const box = await page.locator(selector).boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44, `${selector} is a selection-popup touch target`);
    }
    await page.locator('.edit-more > summary').tap();
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-authoring-edit-menu-390-dark.png`), fullPage: true });
    await page.locator('#lock-button').scrollIntoViewIfNeeded();
    const menuDiagnostic = await page.evaluate(() => {
      const info = selector => { const element = document.querySelector(selector), box = element?.getBoundingClientRect(), style = element && getComputedStyle(element); return { selector, box: box && { x: box.x, y: box.y, width: box.width, height: box.height }, zIndex: style?.zIndex, position: style?.position, overflow: style?.overflow }; };
      const box = document.getElementById('lock-button').getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      return { elements: ['#edit-menu', '#lock-button', '.top', '.palette'].map(info), point: { x, y, stack: document.elementsFromPoint(x, y).slice(0, 5).map(element => ({ tag: element.tagName, id: element.id, className: element.className })) } };
    });
    await expectWithinViewport(page, '#lock-button', 'The compact editing menu stays inside the 390px viewport');
    assert.equal(menuDiagnostic.point.stack[0]?.id, 'lock-button', 'The compact editing menu stays above the palette for touch');
    await page.locator('#lock-button').tap(); await page.locator('.edit-more > summary').tap();
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-authoring-toolbar-390-dark.png`), fullPage: true });
  } finally { await touch.close(); }
}

async function checkLearningTools(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 736 }, acceptDownloads: true });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    // Production hides authoring. This isolated legacy regression intentionally enables it.
    await page.evaluate(() => { document.body.dataset.lessonTools = 'on'; });
    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument());
    const select = ids => page.evaluate(ids => DiagramEditor.select(ids), ids);
    const endpoint = (nodeId, side = 'auto') => ({ nodeId, side, offset: .5 });

    // A group is a real editing unit: its internal connector belongs to it too.
    const groupDoc = Core.createDocument();
    const a = Core.createNode('process', 120, 150, { id: 'learn_a', text: '開始' });
    const b = Core.createNode('process', 420, 150, { id: 'learn_b', text: '処理' });
    const outside = Core.createNode('process', 720, 260, { id: 'learn_outside', text: '別の処理' });
    const e = Core.createEdge(endpoint(a.id, 'right'), endpoint(b.id, 'left'), { id: 'learn_internal', bend: { x: 310, y: 90 }, label: { text: '次へ' } });
    groupDoc.nodes = [a, b, outside]; groupDoc.edges = [e];
    await loadFixture(page, groupDoc);
    await select([a.id, b.id]); await openEditMenu(page); await page.locator('#group-button').click();
    let current = await getDoc(), group = current.groups[0];
    assert.deepEqual(new Set(group.memberIds), new Set([a.id, b.id, e.id]), 'Internal edges must become group members');
    await page.locator(`[data-node="${a.id}"]`).click();
    assert.match(await page.locator('#selection-status').textContent(), /1グループ・2図形・1線を選択/);
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-learning-group.png`), fullPage: true });
    const beforeMove = await getDoc();
    await page.locator(`[data-node="${a.id}"]`).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
    current = await getDoc();
    for (const id of [a.id, b.id]) {
      const old = beforeMove.nodes.find(node => node.id === id), next = current.nodes.find(node => node.id === id);
      assert.equal(next.x, old.x + 1); assert.equal(next.y, old.y + 1);
    }
    assert.deepEqual(current.edges.find(edge => edge.id === e.id).bend, { x: 311, y: 91 }, 'A grouped bent edge moves with its nodes');
    await page.locator('#undo').click(); await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeMove);
    await page.locator('#redo').click(); await page.locator('#redo').click();

    // Alignment moves a group as one unit and does not collapse its members together.
    await select([a.id, b.id, e.id, outside.id]);
    const relative = current.nodes.find(node => node.id === b.id).x - current.nodes.find(node => node.id === a.id).x;
    await openMenuFor(page, '#align-menu'); await page.locator('[data-align="left"]').click();
    current = await getDoc();
    assert.equal(current.nodes.find(node => node.id === b.id).x - current.nodes.find(node => node.id === a.id).x, relative);

    // Locking prevents individual editing, but leaves a fixed item usable as a new connection target.
    await page.locator(`[data-node="${a.id}"]`).click(); await openEditMenu(page); await page.locator('#lock-button').click();
    current = await getDoc();
    group = current.groups[0];
    for (const id of group.memberIds) assert.equal([...current.nodes, ...current.edges].find(item => item.id === id).locked, true);
    const locked = await getDoc();
    await page.locator(`[data-node="${a.id}"]`).dblclick();
    assert.equal(await page.locator('#inline-editor').isHidden(), true, 'A locked item must not open the inline editor');
    assert.equal(await page.locator('#delete-button').isDisabled(), true, 'Locked members disable deletion');
    assert.deepEqual(await getDoc(), locked, 'A selection containing locked members cannot be deleted');
    await select([outside.id]); await page.locator('#connect-button').click();
    await page.locator('#connect-from').selectOption(outside.id); await page.locator('#connect-to').selectOption(a.id);
    await page.locator('#connect-form button[type=submit]').click();
    current = await getDoc();
    assert.ok(current.edges.some(edge => edge.from.nodeId === outside.id && edge.to.nodeId === a.id), 'A new edge may connect to a fixed node');
    await page.locator(`[data-node="${a.id}"]`).click(); await clickToolbarAction(page, 'copy-button'); await clickToolbarAction(page, 'paste-button');
    current = await getDoc();
    assert.equal(current.groups.length, 2, 'Copy/paste preserves the group relationship');
    const copiedGroup = current.groups.find(item => item.id !== group.id);
    assert.ok(copiedGroup.memberIds.every(id => !group.memberIds.includes(id)), 'Pasted group members receive new IDs');
    assert.ok(copiedGroup.memberIds.every(id => ![...current.nodes, ...current.edges].find(item => item.id === id).locked), 'Pasted items are editable');

    // Lesson authoring escapes instruction text, exports a student document, and restores the author exactly.
    await page.locator('[data-pane-button="lesson"]').click();
    await page.locator('#lesson-instructions').fill('<img src=x onerror=alert(1)> 図を完成'); await page.locator('#apply-lesson').click();
    const author = await getDoc();
    assert.equal(author.lesson.instructions, '<img src=x onerror=alert(1)> 図を完成');
    const waitingDownload = page.waitForEvent('download'); await page.locator('#download-lesson').click();
    const lessonDownload = await waitingDownload, lessonPath = path.join(artifacts, `${browser.browserType().name()}-lesson.diagram.json`);
    await lessonDownload.saveAs(lessonPath);
    const distributed = JSON.parse(await fs.readFile(lessonPath, 'utf8'));
    assert.equal(distributed.version, 3); assert.equal(distributed.lesson.studentMode, true);
    assert.deepEqual(distributed.groups, author.groups); assert.ok(distributed.nodes.some(node => node.locked));
    assert.deepEqual(await getDoc(), author, 'Downloading must not turn the author document into a student document');
    await page.locator('#preview-lesson').click(); await page.waitForFunction(() => DiagramEditor.getDocument().lesson?.studentMode === true);
    assert.equal(await page.locator('#lesson-author').isHidden(), true); assert.equal(await page.locator('#lesson-student').isVisible(), true);
    assert.equal(await page.locator('#assignment-instructions').textContent(), author.lesson.instructions, 'Instructions are rendered as text, never HTML');
    for (const size of ['standard', 'large', 'largest']) {
      await openMenuFor(page, '#settings-menu'); await page.locator('#text-size').selectOption(size); await page.locator('.brand').click();
      await expectWithinViewport(page, '#assignment-instructions', `Lesson instructions fit at ${size} text size`);
    }
    await select([outside.id]); await page.locator(`[data-node="${outside.id}"]`).dblclick(); await page.locator('#inline-editor').fill('生徒の入力'); await page.locator('#inline-editor').press('Control+Enter');
    await page.locator(`[data-node="${outside.id}"]`).focus(); await page.keyboard.press('ArrowRight');
    assert.equal((await getDoc()).nodes.find(node => node.id === outside.id).text, '生徒の入力');
    assert.equal(await page.locator('#undo').isDisabled(), false, 'Preview edits are independently undoable'); await page.locator('#undo').click();
    assert.equal((await getDoc()).nodes.find(node => node.id === outside.id).x, author.nodes.find(node => node.id === outside.id).x);
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-lesson-student.png`), fullPage: true });
    await page.locator('#end-lesson-preview').click(); await page.waitForFunction(() => DiagramEditor.getDocument().lesson?.studentMode === false);
    assert.deepEqual(await getDoc(), author, 'Lesson preview changes are discarded on exit');
    assert.equal(await page.locator('#undo').isDisabled(), false, 'Leaving preview restores the author history');
    await page.locator('#preview-lesson').click(); await page.waitForFunction(() => DiagramEditor.getDocument().lesson?.studentMode === true);
    await page.reload(); await restoreBrowserAuto(page);
    // Reload restores the production flag; this isolated legacy path must re-enable authoring explicitly.
    await page.evaluate(() => { document.body.dataset.lessonTools = 'on'; });
    assert.deepEqual(await getDoc(), author, 'Reloading during preview restores the author document from recovery');
    const originalMemberIds = new Set(group.memberIds);
    const studentFixture = { ...distributed, id: 'opened_student_template', nodes: distributed.nodes.filter(node => originalMemberIds.has(node.id) || node.id === outside.id), edges: distributed.edges.filter(edge => originalMemberIds.has(edge.id)), groups: distributed.groups.filter(item => item.id === group.id) };
    await loadFixture(page, studentFixture);
    assert.equal((await getDoc()).lesson.studentMode, true);
    await page.locator(`[data-node="${a.id}"]`).click(); const studentFixed = await getDoc();
    assert.equal(await page.locator('#lock-button').isDisabled(), true, 'Students cannot unlock fixed components');
    await page.locator('#canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Delete');
    assert.deepEqual(await getDoc(), studentFixed, 'Fixed components reject keyboard move and delete in a student file');
    const fixedBox = await page.locator(`[data-node="${a.id}"]`).boundingBox();
    await page.mouse.move(fixedBox.x + fixedBox.width / 2, fixedBox.y + fixedBox.height / 2); await page.mouse.down(); await page.mouse.move(fixedBox.x + fixedBox.width / 2 + 40, fixedBox.y + 20); await page.mouse.up();
    assert.deepEqual(await getDoc(), studentFixed, 'Fixed components reject pointer movement in a student file');
    await select([outside.id]); await page.locator(`[data-node="${outside.id}"]`).dblclick(); await page.locator('#inline-editor').fill('生徒が編集'); await page.locator('#inline-editor').press('Control+Enter');
    assert.equal((await getDoc()).nodes.find(node => node.id === outside.id).text, '生徒が編集');
    const savedStudent = page.waitForEvent('download'); await page.locator('#file-menu > summary').click(); await page.locator('#save-file').click();
    const savedStudentFile = await savedStudent, savedStudentPath = path.join(artifacts, `${browser.browserType().name()}-student-work.diagram.json`); await savedStudentFile.saveAs(savedStudentPath);
    const studentRoundTrip = Core.parseDocument(await fs.readFile(savedStudentPath, 'utf8')); assert.equal(studentRoundTrip.lesson.studentMode, true); assert.equal(studentRoundTrip.nodes.find(node => node.id === outside.id).text, '生徒が編集');
    await loadFixture(page, { ...studentRoundTrip, id: 'student_round_trip' }); assert.deepEqual(await getDoc(), { ...studentRoundTrip, id: 'student_round_trip' });
    if (await page.locator('#edit-lesson').isHidden()) await page.locator('[data-pane-button="lesson"]').click();
    await page.locator('#edit-lesson').click();
    await page.waitForFunction(() => DiagramEditor.getDocument().lesson?.studentMode === false);
    assert.equal(await page.locator('#undo').isDisabled(), true, 'Editing a distributed template starts a new author history');

    // File loading migrates v1 and keeps the lesson data round-trippable.
    const v1 = { format: 'kaijo-diagram', version: 1, id: 'legacy_learning', title: '旧形式', diagramType: 'flowchart', nodes: [Core.createNode('process', 100, 100, { id: 'legacy_node', text: '旧部品' })], edges: [], lanes: [] };
    await loadRawFixture(page, v1); current = await getDoc();
    assert.equal(current.version, 3); assert.deepEqual(current.groups, []); assert.equal(current.lesson, null);

    // Branch choices, forks, join waiting, loops and unavailable paths are exercised through the visible trace bar.
    const traceDoc = Core.createDocument('activity'); traceDoc.lanes = [];
    const start = Core.createNode('initial', 90, 80, { id: 'trace_start' });
    const fork = Core.createNode('fork', 220, 80, { id: 'trace_fork' });
    const left = Core.createNode('action', 190, 190, { id: 'trace_left', text: '左' });
    const right = Core.createNode('action', 360, 190, { id: 'trace_right', text: '右' });
    const join = Core.createNode('join', 270, 330, { id: 'trace_join' });
    const final = Core.createNode('final', 270, 440, { id: 'trace_final' });
    const traceEdge = (from, to, id, options = {}) => Core.createEdge(endpoint(from), endpoint(to), { id, ...options });
    traceDoc.nodes = [start, fork, left, right, join, final];
    traceDoc.edges = [traceEdge(start.id, fork.id, 'trace_start_edge'), traceEdge(fork.id, left.id, 'trace_left_branch'), traceEdge(fork.id, right.id, 'trace_right_branch'), traceEdge(left.id, join.id, 'trace_left_join'), traceEdge(right.id, join.id, 'trace_right_join'), traceEdge(join.id, final.id, 'trace_finish'), traceEdge(left.id, left.id, 'trace_loop', { kind: 'curve' }), traceEdge(left.id, right.id, 'trace_both', { head: 'both' }), Core.createEdge(endpoint(right.id), { x: 600, y: 200 }, { id: 'trace_dangling' }), traceEdge(right.id, final.id, 'trace_none', { head: 'none' })];
    await loadFixture(page, traceDoc); const traceBefore = await getDoc();
    await page.locator('[data-pane-button="trace"]').click(); await page.locator('#trace-start-node').selectOption(start.id); await page.locator('#trace-start').click();
    await page.waitForFunction(() => !document.getElementById('trace-bar').hidden);
    assert.equal(await page.locator('[data-pane-button="trace"]').evaluate(button => button === document.activeElement), false, 'Starting trace closes the side pane');
    await page.locator('[data-trace-node="trace_start"][data-trace-edge="trace_start_edge"]').click();
    await page.locator('[data-trace-node="trace_fork"][data-trace-edge=""]').click();
    assert.equal(await page.locator('[data-trace-node="trace_left"][data-trace-edge="trace_loop"]').count(), 1, 'A self-loop is an available manual choice');
    assert.equal(await page.locator('[data-trace-node="trace_left"][data-trace-edge="trace_both"]').count(), 1, 'A both-headed edge is available from either endpoint');
    const activeTraceDoc = await getDoc(); await page.locator('#canvas').focus(); await page.keyboard.press('Delete'); await page.keyboard.press('Control+z');
    assert.deepEqual(await getDoc(), activeTraceDoc, 'Trace mode disables document deletion and history changes');
    await page.locator('[data-trace-node="trace_left"][data-trace-edge="trace_loop"]').click(); await page.locator('#trace-back').click();
    assert.equal(await page.locator('[data-trace-node="trace_left"][data-trace-edge="trace_loop"]').count(), 1, 'Back returns from a self-loop');
    await page.locator('[data-trace-node="trace_left"][data-trace-edge="trace_both"]').click(); await page.locator('#trace-back').click();
    assert.equal(await page.locator('[data-trace-node="trace_left"][data-trace-edge="trace_both"]').count(), 1, 'Back returns from a both-headed edge');
    const unavailable = page.locator('[data-trace-node="trace_right"][data-trace-edge="trace_dangling"]');
    await expectDisabledTraceChoice(unavailable, 'Dangling paths are explained and disabled');
    await page.locator('[data-trace-node="trace_left"][data-trace-edge="trace_left_join"]').click();
    assert.match(await page.locator('#trace-history').textContent(), /左/);
    assert.equal(await page.locator('[data-trace-node="trace_join"][data-trace-edge="trace_finish"]').count(), 0, 'A join waits for every fork branch');
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-trace-join-wait.png`), fullPage: true });
    await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption('dark'); await page.locator('.brand').click();
    await page.setViewportSize({ width: 390, height: 736 });
    await waitForDiagramWithinCanvas(page);
    for (const size of ['standard', 'large', 'largest']) {
      await openMenuFor(page, '#settings-menu'); await page.locator('#text-size').selectOption(size); await page.locator('.brand').click();
      await expectWithinViewport(page, '#trace-stop', `Trace controls fit at ${size} text size`);
    }
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-trace-join-wait-390-dark.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 736 });
    await page.locator('[data-trace-node="trace_right"][data-trace-edge="trace_right_join"]').click();
    await page.locator('[data-trace-node="trace_join"][data-trace-edge="trace_finish"]').click();
    await page.locator('[data-trace-node="trace_final"][data-trace-edge=""]').click();
    assert.equal(await page.locator('#trace-back').isDisabled(), false); await page.locator('#trace-back').click();
    assert.equal(await page.locator('[data-trace-node="trace_final"][data-trace-edge=""]').count(), 1, 'Back restores the preceding trace state');
    await page.locator('#trace-restart').click();
    assert.equal(await page.locator('[data-trace-node="trace_start"][data-trace-edge="trace_start_edge"]').count(), 1);
    await page.locator('#canvas').focus(); await page.keyboard.press('Escape'); await page.waitForFunction(() => document.getElementById('trace-bar').hidden);
    assert.equal(await page.locator('[data-pane-button="trace"]').evaluate(button => button === document.activeElement), true, 'Stopping returns focus to trace');
    assert.deepEqual(await getDoc(), traceBefore, 'Tracing never mutates the document');
    await page.locator('[data-pane-button="export"]').click();
    assert.doesNotMatch(await page.locator('#export-preview').innerHTML(), /trace-bar|diagram-learning-overlay/);

    for (const theme of ['light', 'dark', 'auto']) { await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption(theme); await page.locator('.brand').click(); }
    for (const width of [1280, 736, 390]) { await page.setViewportSize({ width, height: 736 }); await waitForLayout(page); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); }
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-learning.png`), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  await checkLearningTouch(browser, url);
}

async function expectDisabledTraceChoice(locator, message) {
  assert.equal(await locator.isDisabled(), true, message);
  assert.match(await locator.textContent(), /接続先|方向|進め/, `${message}: an explanation is visible`);
}

async function checkPopupAndColors(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument());
    const a = Core.createNode('process', 100, 150, { id: 'popup_a', text: '基準', style: { fill: '#ffeeaa', stroke: '#b83232', color: '#123456' } });
    const b = Core.createNode('process', 400, 150, { id: 'popup_b', text: '対象', style: { fill: '#ddffdd', stroke: '#2255aa', color: '#222222' } });
    const edge = Core.createEdge({ nodeId: a.id, side: 'right', offset: .5 }, { nodeId: b.id, side: 'left', offset: .5 }, { id: 'popup_edge', style: { fill: '#abcdef' } });
    const doc = Core.createDocument(); doc.nodes = [a, b]; doc.edges = [edge];
    await loadFixture(page, doc);

    // Pasting stays available even when no object is selected.
    await page.evaluate(id => DiagramEditor.select([id]), a.id); await clickToolbarAction(page, 'copy-button');
    await page.evaluate(() => DiagramEditor.select([])); await openToolbarOptions(page);
    assert.equal(await page.locator('#paste-button').isDisabled(), false, 'Paste remains available with no selection');
    await page.locator('#paste-button').click(); assert.equal((await getDoc()).nodes.length, 3);
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), doc);

    await page.evaluate(ids => DiagramEditor.select(ids), [a.id, b.id]);
    await openEditMenu(page);
    for (const id of ['copy-button', 'duplicate-button', 'delete-button', 'match-size-button', 'copy-style-button', 'paste-style-button', 'group-button', 'ungroup-button', 'lock-button', 'copy-image-button']) {
      assert.equal(await page.locator(`#${id}`).isVisible(), true, `${id} is collected in the selection popup`);
    }
    await page.locator('#edit-menu > summary').focus(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#edit-menu > summary').evaluate(element => element === document.activeElement), true, 'Escape returns focus to the popup trigger');

    // A palette color changes only its target, creates one history entry, and survives JSON export.
    await openMenuFor(page, '#color-menu');
    const colorTarget = page.locator('#color-target');
    assert.equal(await colorTarget.inputValue(), 'fill');
    assert.match(await page.locator('#color-value').textContent(), /複数/); assert.equal(await page.locator('#current-color-chip').getAttribute('data-mixed'), 'true');
    assert.equal(await page.locator('#color-swatches button[aria-pressed="true"]').count(), 0, 'Mixed fills leave all swatches unpressed');
    for (const id of ['rgb-red', 'rgb-green', 'rgb-blue']) assert.equal(await page.locator(`#${id}`).inputValue(), '', `Mixed fill leaves ${id} blank`);
    const swatch = page.locator('#color-swatches button[data-color]').first();
    const swatchColor = await swatch.getAttribute('data-color'); assert.match(swatchColor, /^#[0-9a-f]{6}$/i);
    const beforeFill = await getDoc(); await swatch.click(); const afterFill = await getDoc();
    for (const id of [a.id, b.id]) assert.equal(afterFill.nodes.find(node => node.id === id).style.fill.toLowerCase(), swatchColor.toLowerCase());
    assert.deepEqual(afterFill.nodes.map(node => node.style.stroke), beforeFill.nodes.map(node => node.style.stroke));
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeFill, 'Palette application is one undo step');
    await page.locator('#redo').click(); assert.deepEqual(await getDoc(), afterFill);

    await page.evaluate(ids => DiagramEditor.select(ids), [edge.id, a.id]); await openMenuFor(page, '#color-menu');
    assert.equal(await page.locator('#fill-color').inputValue(), afterFill.nodes.find(node => node.id === a.id).style.fill, 'A selected edge before a node does not replace the fill picker value');
    const beforeMixedKinds = await getDoc(); await page.locator('#color-swatches button[data-color]').nth(1).click(); const afterMixedKinds = await getDoc();
    assert.notEqual(afterMixedKinds.nodes.find(node => node.id === a.id).style.fill, beforeMixedKinds.nodes.find(node => node.id === a.id).style.fill);
    assert.equal(afterMixedKinds.edges.find(item => item.id === edge.id).style.fill, beforeMixedKinds.edges.find(item => item.id === edge.id).style.fill, 'Fill changes never alter a selected edge');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeMixedKinds);

    await page.evaluate(ids => DiagramEditor.select(ids), [a.id, b.id]);
    await openMenuFor(page, '#color-menu');
    await colorTarget.selectOption('stroke');
    assert.equal(await page.locator('#stroke-color').isVisible(), true, 'The active free color input remains available');
    assert.equal(await page.locator('#fill-color').isVisible(), false, 'Inactive free color inputs are hidden');
    await page.locator('#stroke-color').fill('#00aa55'); await page.locator('#stroke-color').dispatchEvent('input');
    const custom = await getDoc(); for (const id of [a.id, b.id]) assert.equal(custom.nodes.find(node => node.id === id).style.stroke, '#00aa55');
    await openMenuFor(page, '#color-menu');
    await colorTarget.selectOption('color'); await page.locator('#text-color').fill('#663399'); await page.locator('#text-color').dispatchEvent('input');
    const colored = await getDoc(); for (const id of [a.id, b.id]) assert.equal(colored.nodes.find(node => node.id === id).style.color, '#663399');
    await openMenuFor(page, '#color-menu');
    for (const value of ['', '256', '12.5']) {
      await page.locator('#rgb-red').fill(value); await page.locator('#rgb-green').fill('34'); await page.locator('#rgb-blue').fill('56');
      assert.equal(await page.locator('#apply-rgb').isDisabled(), true, `RGB ${value || 'empty'} does not apply an invalid color`);
    }
    await page.locator('#rgb-red').fill('11'); await page.locator('#rgb-green').fill('34'); await page.locator('#rgb-blue').fill('56');
    const beforeRgb = await getDoc(); await page.locator('#apply-rgb').click(); const afterRgb = await getDoc();
    for (const id of [a.id, b.id]) assert.equal(afterRgb.nodes.find(node => node.id === id).style.color, '#0b2238');
    assert.match(await page.evaluate(() => DiagramEditor.exportSVG()), /#0b2238/i, 'RGB text color appears in exported SVG');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeRgb, 'RGB application is one undo step'); await page.locator('#redo').click(); assert.deepEqual(await getDoc(), afterRgb);
    await openMenuFor(page, '#color-menu'); await page.locator('#apply-rgb').click(); await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeRgb, 'Reapplying the same RGB color adds no history entry'); await page.locator('#redo').click();
    await openMenuFor(page, '#color-menu'); assert.equal(await page.locator('#color-menu .menu-panel').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'The color panel has no horizontal overflow');
    const download = page.waitForEvent('download'); await page.locator('#file-menu > summary').click(); await page.locator('#save-file').click();
    const output = path.join(artifacts, `${browser.browserType().name()}-popup-colors.diagram.json`); await (await download).saveAs(output);
    assert.deepEqual(Core.parseDocument(JSON.parse(await fs.readFile(output, 'utf8'))), afterRgb, 'Palette, custom, and RGB colors are saved in the document');

    await page.evaluate(ids => DiagramEditor.select(ids), [a.id, b.id]); await openMenuFor(page, '#color-menu');
    assert.equal(await page.locator('#color-swatches button[aria-pressed="true"]').count(), 0, 'A custom RGB color leaves all palette swatches unpressed');
    await page.evaluate(id => DiagramEditor.select([id]), a.id); await clickToolbarAction(page, 'lock-button'); await openMenuFor(page, '#color-menu');
    assert.equal(await page.locator('#color-swatches button[data-color]').first().isDisabled(), true, 'A locked selection disables the palette');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }

  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  try {
    const page = await touch.newPage(); page.setDefaultTimeout(12000); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    assert.equal(await page.locator('#toolbar-toggle').getAttribute('aria-expanded'), 'false', 'The compact toolbar starts closed');
    await openToolbarOptions(page); await openMenuFor(page, '#settings-menu'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape');
    const node = Core.createNode('process', 110, 150, { id: 'popup_touch', text: 'タップ' }), doc = Core.createDocument(); doc.nodes = [node]; await loadFixture(page, doc);
    await openToolbarOptions(page);
    await page.locator('#toolbar-toggle').tap(); assert.equal(await page.locator('#toolbar-toggle').getAttribute('aria-expanded'), 'false');
    await page.locator('#toolbar-toggle').tap(); assert.equal(await page.locator('#toolbar-toggle').getAttribute('aria-expanded'), 'true');
    for (const selector of ['#paste-button']) {
      await page.locator(selector).scrollIntoViewIfNeeded(); const box = await page.locator(selector).boundingBox(); assert.ok(box && box.height >= 44, `${selector} remains a touch target`); await expectWithinViewport(page, selector, `${selector} fits the compact toolbar`);
    }
    await page.locator(`[data-node="${node.id}"]`).tap();
    for (const selector of ['#edit-menu > summary', '#shape-menu > summary', '#more-format > summary', '#color-menu > summary']) {
      await page.locator(selector).scrollIntoViewIfNeeded(); const box = await page.locator(selector).boundingBox(); assert.ok(box && box.height >= 44, `${selector} remains a touch target`); await expectWithinViewport(page, selector, `${selector} fits the selection popup`);
    }
    await page.locator('#edit-menu > summary').tap();
    await expectWithinViewport(page, '#delete-button', 'The selection popup fits at 390px with the largest text');
    await page.locator('#color-menu > summary').tap(); await page.locator('#color-swatches button[data-color]').first().tap();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Compact toolbar has no horizontal overflow');
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-popup-colors-390.png`), fullPage: true });
  } finally { await touch.close(); }
}

async function expectWithinViewport(page, selector, message) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= (await page.evaluate(() => innerWidth)) + 1 && box.y + box.height <= (await page.evaluate(() => innerHeight)) + 1, message);
}

async function waitForLayout(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function openToolbarOptions(page) {
  await waitForLayout(page);
  const options = page.locator('#toolbar-options');
  if (!await options.count()) return;
  const compact = await page.locator('.toolbar').getAttribute('data-compact');
  if (compact !== 'true') return;
  if (await options.evaluate(element => element.classList.contains('is-open'))) return;
  const toggle = page.locator('#toolbar-toggle');
  await toggle.click();
  await page.waitForFunction(() => document.getElementById('toolbar-options').classList.contains('is-open'));
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Toolbar toggle reports its expanded state');
}

async function openMenuFor(page, selector) {
  const target = page.locator(selector);
  if (await target.evaluate(element => !!element.closest('#toolbar-options'))) await openToolbarOptions(page);
  const detailIds = await target.evaluate(element => {
    const ids = [];
    if (element.tagName === 'DETAILS' && element.id) ids.push(element.id);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && parent.id) ids.unshift(parent.id);
    }
    return ids;
  });
  for (const id of detailIds) {
    const menu = page.locator(`#${id}`);
    if (!await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  }
}

async function clickToolbarAction(page, id) {
  await openMenuFor(page, `#${id}`);
  await page.locator(`#${id}`).click();
}

async function selectLayer(page, layer, action = 'click') {
  const selector = `button[data-layer="${layer}"]`;
  await openMenuFor(page, selector);
  await page.locator(selector)[action]();
}

async function openEditMenu(page) {
  await openMenuFor(page, '#edit-menu');
}

async function openBehaviorMenu(page) {
  await openMenuFor(page, '#behavior-menu');
}

async function decodePng(page, bytes) {
  return page.evaluate(async base64 => {
    const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw], { type: 'image/png' })); const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = false; for (let index = 0; index < data.length; index += 4) if (data[index + 3] && !(data[index] > 248 && data[index + 1] > 248 && data[index + 2] > 248)) { ink = true; break; }
    return { width: bitmap.width, height: bitmap.height, corner: [...data.slice(0, 4)], ink };
  }, Buffer.from(bytes).toString('base64'));
}

async function waitForDiagramWithinCanvas(page) {
  await page.waitForFunction(() => {
    const canvas = document.getElementById('canvas'), nodes = [...document.querySelectorAll('[data-node]')];
    if (!canvas || !nodes.length) return false;
    const area = canvas.getBoundingClientRect();
    return area.width > 0 && area.height > 0 && nodes.every(node => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.left >= area.left - 2 && box.right <= area.right + 2 && box.top >= area.top - 2 && box.bottom <= area.bottom + 2;
    });
  });
}

async function checkLearningTouch(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    // Production hides authoring. This isolated legacy regression intentionally enables it.
    await page.evaluate(() => { document.body.dataset.lessonTools = 'on'; });
    const doc = Core.createDocument(), a = Core.createNode('process', 90, 120, { id: 'touch_fixed_a', text: '固定' }), b = Core.createNode('process', 245, 120, { id: 'touch_fixed_b', text: '固定' });
    const edge = Core.createEdge({ nodeId: a.id, side: 'right', offset: .5 }, { nodeId: b.id, side: 'left', offset: .5 }, { id: 'touch_fixed_edge' });
    a.locked = b.locked = edge.locked = true; doc.nodes = [a, b]; doc.edges = [edge]; doc.groups = [{ id: 'touch_group', memberIds: [a.id, b.id, edge.id] }]; doc.lesson = { instructions: 'タッチで確認', studentMode: true };
    await loadFixture(page, doc);
    await page.locator('[data-pane-button="lesson"]').tap();
    await page.locator(`[data-node="${a.id}"]`).tap();
    assert.match(await page.locator('#selection-status').textContent(), /1グループ・2図形・1線を選択/);
    assert.equal(await page.locator('#delete-button').isDisabled(), true, 'Touch selection keeps fixed group protected');

    const trace = Core.createDocument(); const start = Core.createNode('process', 100, 120, { id: 'touch_trace_start', text: '開始' }), end = Core.createNode('process', 300, 120, { id: 'touch_trace_end', text: '終了' });
    trace.nodes = [start, end]; trace.edges = [Core.createEdge({ nodeId: start.id, side: 'right', offset: .5 }, { nodeId: end.id, side: 'left', offset: .5 }, { id: 'touch_trace_edge' })];
    await loadFixture(page, trace);
    await page.locator('[data-pane-button="trace"]').tap(); await page.locator('#trace-start-node').selectOption(start.id); await page.locator('#trace-start').tap();
    await page.locator(`[data-trace-node="${start.id}"][data-trace-edge="touch_trace_edge"]`).tap();
    assert.equal(await page.locator(`[data-trace-node="${end.id}"][data-trace-edge=""]`).count(), 1, 'Touch can advance a trace choice');
  } finally { await context.close(); }
}

async function loadRawFixture(page, value) {
  await page.locator('#file-input').setInputFiles({ name: 'legacy.diagram.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.waitForFunction(() => document.getElementById('storage-open-dialog')?.open || document.getElementById('confirm-dialog')?.open);
  if (await page.locator('#storage-open-dialog').evaluate(dialog => dialog.open)) await page.locator('[data-open-source="local-file"]').click();
  await page.waitForFunction(id => DiagramEditor.getDocument().id === id || document.getElementById('confirm-dialog').open, value.id);
  if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-continue').click();
  await page.waitForFunction(id => DiagramEditor.getDocument().id === id, value.id);
}

async function checkReviewTools(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument());
    const endpoint = (nodeId, side) => ({ nodeId, side, offset: .5 });

    // A deliberately obstructed connector produces inspection candidates and can be cleaned up.
    const doc = Core.createDocument();
    const source = Core.createNode('process', 80, 220, { id: 'review_source', text: '開始' });
    const obstacle = Core.createNode('process', 330, 210, { id: 'review_obstacle', text: '障害物' });
    const target = Core.createNode('process', 580, 220, { id: 'review_target', text: '終了' });
    const edge = Core.createEdge(endpoint(source.id, 'right'), endpoint(target.id, 'left'), { id: 'review_edge', kind: 'orthogonal', bend: { x: 330, y: 250 }, label: { text: '進む' } });
    doc.nodes = [source, obstacle, target]; doc.edges = [edge]; doc.lesson = { instructions: '<img src=x onerror=alert(1)> 長い問題文ではない確認文', studentMode: false };
    await loadFixture(page, doc); const original = await getDoc();

    await page.locator('[data-pane-button="inspect"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#inspection-list [data-inspection-key]').length > 0);
    const inspectionSummary = await page.locator('#inspection-summary').textContent();
    assert.doesNotMatch(inspectionSummary, /エラー|採点|点数/, 'Inspection describes improvements without grading');
    const inspection = page.locator('#inspection-list [data-inspection-key]').first();
    const ids = JSON.parse(await inspection.getAttribute('data-inspection-ids'));
    const key = JSON.parse(await inspection.getAttribute('data-inspection-key'));
    assert.ok(Array.isArray(ids) && ids.length && Array.isArray(key) && key.length >= 2, 'Inspection controls carry stable target metadata');
    await inspection.click();
    await waitForInspectionTargetsInView(page, ids);
    assert.deepEqual(await getDoc(), original, 'Selecting an inspection item does not mutate the document');

    await page.evaluate(id => DiagramEditor.select([id]), edge.id);
    assert.equal(await page.locator('#reset-route').textContent(), '経路を整える');
    const beforeReset = await getDoc(); await clickToolbarAction(page, 'reset-route');
    let current = await getDoc(); assert.equal(current.edges.find(item => item.id === edge.id).bend, null, 'Route cleanup removes a manual bend');
    await assertOrthogonalPathAvoids(page, edge.id, obstacle.id);
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeReset, 'Undo restores the manual route');
    await page.locator('#redo').click();
    await page.locator('[data-pane-button="inspect"]').click(); const summaryBeforeTextEdit = await page.locator('#inspection-summary').textContent();
    await page.evaluate(id => DiagramEditor.select([id]), obstacle.id); await clickToolbarAction(page, 'edit-text'); await page.locator('#inline-editor').fill(''); await page.locator('#inline-editor').press('Control+Enter');
    await page.waitForFunction(before => document.getElementById('inspection-summary').textContent !== before, summaryBeforeTextEdit);
    assert.doesNotMatch(await page.locator('#inspection-summary').textContent(), /エラー|採点|点数/, 'Inspection automatically refreshes without becoming a score');
    await page.evaluate(id => DiagramEditor.select([id]), edge.id); await openEditMenu(page); await page.locator('#lock-button').click();
    assert.equal(await page.locator('#reset-route').isDisabled(), true, 'Fixed routes cannot be cleaned up');

    // A trace makes both selection from inspection and route cleanup unavailable.
    await page.locator('[data-pane-button="trace"]').click(); await page.locator('#trace-start-node').selectOption(source.id); await page.locator('#trace-start').click();
    await page.locator('[data-pane-button="inspect"]').click();
    const traceInspection = page.locator('#inspection-list [data-inspection-key]').first();
    if (await traceInspection.count()) assert.equal(await traceInspection.isDisabled(), true, 'Inspection targets cannot be selected while tracing');
    assert.equal(await page.locator('#reset-route').isDisabled(), true, 'Route cleanup is disabled while tracing');
    await page.locator('#canvas').focus(); await page.keyboard.press('Escape');

    // Print preview is a plain-text, non-mutating view of the document.
    await page.locator('[data-pane-button="export"]').click();
    await page.locator('#side-print').click(); await page.waitForFunction(() => document.getElementById('print-dialog').open);
    assert.equal(await page.locator('#print-instructions').isChecked(), true); assert.equal(await page.locator('#print-name').isChecked(), false);
    assert.equal(await page.locator('#print-preview .print-page').count(), 1, 'The ordinary preview starts as one page');
    assert.equal(await page.locator('#print-preview img').count(), 0, 'Instruction text is not parsed as HTML');
    assert.match(await page.locator('#print-preview .print-instructions').textContent(), /<img src=x onerror=alert\(1\)>/, 'Instruction text is printed literally');
    const beforePrint = await getDoc();
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('print-dialog').open);
    assert.equal(await page.locator('#side-print').evaluate(button => button === document.activeElement), true, 'Escape returns focus to the print entry point');

    for (const paper of ['A4', 'B5']) for (const orientation of ['portrait', 'landscape']) for (const includeName of [false, true]) {
      await page.locator('#side-print').click(); await page.waitForFunction(() => document.getElementById('print-dialog').open);
      await page.locator('#print-paper').selectOption(paper); await page.locator('#print-orientation').selectOption(orientation);
      if (await page.locator('#print-name').isChecked() !== includeName) await page.locator('#print-name').click();
      assert.equal(await page.locator('#print-preview .print-name-field').count() > 0, includeName, 'Name-field preference updates the preview');
      assert.equal(await page.locator('#print-preview .print-diagram svg').count(), 1, 'The diagram is present in the print preview');
      assert.match(await page.locator('#print-summary').textContent(), new RegExp(paper));
      await page.locator('#print-submit').click();
      await page.waitForFunction(() => document.querySelector('#print-sheet .print-diagram svg'));
      assert.equal(await page.locator('#print-sheet .print-name-field').count() > 0, includeName, 'beforeprint updates the real print DOM');
      if (browser.browserType().name() === 'chromium') await page.pdf({ path: path.join(artifacts, `print-${paper}-${orientation}-${includeName ? 'name' : 'noname'}.pdf`), preferCSSPageSize: true, printBackground: true });
      await page.locator('#print-dialog [data-close-dialog]').click(); await page.waitForFunction(() => !document.getElementById('print-dialog').open);
      assert.equal(await page.locator('#side-print').evaluate(button => button === document.activeElement), true, 'Close returns focus to the print entry point');
    }
    assert.deepEqual(await getDoc(), beforePrint, 'Inspection, route review, and print preferences never change the document');

    // A concise, ordinary lesson has a stable A4 portrait preview for visual review.
    const cleanDoc = Core.createTemplate('flow-branch'); cleanDoc.id = 'review_clean_print'; cleanDoc.title = 'フローチャートの確認'; cleanDoc.lesson = { instructions: '分岐の矢印と処理の順序を確認しよう。', studentMode: false };
    await loadFixture(page, cleanDoc); if (await page.locator('#side-print').isHidden()) await page.locator('[data-pane-button="export"]').click(); await page.locator('#side-print').click();
    await page.locator('#print-paper').selectOption('A4'); await page.locator('#print-orientation').selectOption('portrait');
    if (await page.locator('#print-name').isChecked()) await page.locator('#print-name').click(); if (!await page.locator('#print-instructions').isChecked()) await page.locator('#print-instructions').click();
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-print-a4-portrait-preview.png`), fullPage: true });
    await page.locator('#print-submit').click(); if (browser.browserType().name() === 'chromium') await page.pdf({ path: path.join(artifacts, 'print-a4-portrait.pdf'), preferCSSPageSize: true, printBackground: true });
    await page.locator('#print-dialog [data-close-dialog]').click();

    // Long instructions may paginate, but their text and the final diagram must remain in the printed DOM.
    const longDoc = { ...beforePrint, id: 'review_long_print', lesson: { instructions: '説明文'.repeat(1200), studentMode: false } };
    await loadFixture(page, longDoc); if (await page.locator('#side-print').isHidden()) await page.locator('[data-pane-button="export"]').click(); await page.locator('#side-print').click();
    await page.waitForFunction(() => document.getElementById('print-dialog').open);
    await page.locator('#print-paper').selectOption('B5'); await page.locator('#print-orientation').selectOption('landscape'); if (!await page.locator('#print-name').isChecked()) await page.locator('#print-name').click(); if (!await page.locator('#print-instructions').isChecked()) await page.locator('#print-instructions').click();
    const longBeforePrint = await getDoc();
    await page.locator('#print-submit').click(); await page.waitForFunction(() => document.querySelector('#print-sheet .print-diagram svg'));
    const printedInstructions = await page.locator('#print-sheet .print-instructions').allTextContents();
    assert.equal(printedInstructions.join(''), longDoc.lesson.instructions, 'Every instruction character is retained across printed pages');
    assert.ok(await page.locator('#print-sheet .print-page').count() > 1, 'Long instructions use more than one printed page');
    await assertMeasuredPrintLayout(page);
    await assertPreviewMatchesPrintSheet(page);
    if (browser.browserType().name() === 'chromium') await page.pdf({ path: path.join(artifacts, 'long-print.pdf'), preferCSSPageSize: true, printBackground: true });
    assert.deepEqual(await getDoc(), longBeforePrint, 'Long-print settings do not alter the document');
    await page.locator('#print-dialog [data-close-dialog]').click();

    // With instructions off, the name field remains and the sheet returns to one diagram page.
    await page.locator('#side-print').click(); if (await page.locator('#print-instructions').isChecked()) await page.locator('#print-instructions').click();
    assert.equal(await page.locator('#print-preview .print-instructions').count(), 0, 'Disabled instructions are omitted from preview');
    assert.equal(await page.locator('#print-preview .print-page').count(), 1, 'Disabled instructions use one print page');
    assert.equal(await page.locator('#print-preview .print-name-field').count(), 1, 'The name field is retained when instructions are omitted');
    await page.locator('#print-submit').click(); await page.waitForFunction(() => document.querySelector('#print-sheet .print-diagram svg'));
    assert.equal(await page.locator('#print-sheet .print-instructions').count(), 0, 'Disabled instructions are omitted from real print DOM');
    assert.equal(await page.locator('#print-sheet .print-name-field').count(), 1, 'The real print DOM keeps the name field');
    assert.deepEqual(await getDoc(), longBeforePrint, 'Instruction preference does not alter the document');
    await page.locator('#print-dialog [data-close-dialog]').click(); await page.reload(); await restoreBrowserAuto(page);
    assert.equal(await page.locator('#print-paper').inputValue(), 'B5'); assert.equal(await page.locator('#print-orientation').inputValue(), 'landscape'); assert.equal(await page.locator('#print-name').isChecked(), true); assert.equal(await page.locator('#print-instructions').isChecked(), false, 'Print preferences survive reload');

    await checkDefaultLabelDrag(page, artifacts, browser.browserType().name());

    await page.setViewportSize({ width: 390, height: 736 }); await page.waitForFunction(() => document.querySelector('.toolbar').dataset.compact === 'true');
    await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('large'); await page.locator('#settings-menu > summary').press('Escape');
    await page.locator('[data-pane-button="inspect"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Review UI fits a 390px viewport at large text');
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-review-390-dark.png`), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  await checkPrintTouch(browser, url, artifacts);
}

async function checkLaneTools(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  try {
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument());
    const laneDoc = Core.createDocument('activity'); laneDoc.lanes = [
      { id: 'lane_a', title: '準備担当のとても長い名前', x: 40, y: 50, w: 220, h: 520, locked: false },
      { id: 'lane_b', title: '確認', x: 290, y: 50, w: 310, h: 520, locked: false },
      { id: 'lane_c', title: '実行', x: 630, y: 50, w: 180, h: 520, locked: false }
    ];
    const a = Core.createNode('action', 80, 150, { id: 'lane_a_node', text: '準備', laneId: 'lane_a' }), a2 = Core.createNode('action', 80, 300, { id: 'lane_a_second', text: '準備2', laneId: 'lane_a' });
    const b = Core.createNode('action', 350, 220, { id: 'lane_b_node', text: '確認', laneId: 'lane_b' }), c = Core.createNode('action', 660, 220, { id: 'lane_c_node', text: '実行', laneId: 'lane_c' });
    const internal = Core.createEdge({ nodeId: a.id, side: 'bottom', offset: .5 }, { nodeId: a2.id, side: 'top', offset: .5 }, { id: 'lane_internal', bend: { x: 205, y: 250 } });
    const free = Core.createEdge({ nodeId: a2.id, side: 'right', offset: .5 }, { x: 230, y: 420 }, { id: 'lane_free', bend: { x: 220, y: 380 } });
    const cross = Core.createEdge({ nodeId: a.id, side: 'right', offset: .5 }, { nodeId: b.id, side: 'left', offset: .5 }, { id: 'lane_cross' });
    laneDoc.nodes = [a, a2, b, c]; laneDoc.edges = [internal, free, cross]; laneDoc.groups = [{ id: 'lane_group', memberIds: [a.id, a2.id, internal.id, free.id] }];
    await loadFixture(page, laneDoc); await closeSidePane(page);
    await selectLayer(page, 'lanes'); await openMenuFor(page, '#add-lane');
    assert.equal(await page.locator('#add-lane').isVisible(), true); await page.locator('#layer-menu > summary').press('Escape');
    await page.locator('#lane-select').selectOption('lane_a'); assert.match(await page.locator('[data-lane="lane_a"]').getAttribute('aria-label'), /準備担当/, 'Long lane titles remain exposed to assistive technology');
    const beforeMove = await getDoc(); await page.locator('#lane-right').click(); const moved = await getDoc();
    const laneById = (doc, id) => doc.lanes.find(lane => lane.id === id), dx = laneById(moved, 'lane_a').x - laneById(beforeMove, 'lane_a').x;
    for (const id of [a.id, a2.id]) assert.equal(moved.nodes.find(node => node.id === id).x, beforeMove.nodes.find(node => node.id === id).x + dx, 'All nodes in a moved lane keep their relative positions');
    assert.equal(moved.edges.find(edge => edge.id === internal.id).bend.x, beforeMove.edges.find(edge => edge.id === internal.id).bend.x + dx, 'Internal manual bends travel with their lane');
    assert.equal(moved.edges.find(edge => edge.id === free.id).to.x, beforeMove.edges.find(edge => edge.id === free.id).to.x + dx, 'Free endpoints travel with their lane');
    assert.equal(moved.edges.find(edge => edge.id === free.id).bend.x, beforeMove.edges.find(edge => edge.id === free.id).bend.x + dx, 'Free-edge manual bends travel with their lane');
    assert.ok(laneById(moved, 'lane_a').x > laneById(moved, 'lane_b').x, 'Right moves a lane across its adjacent neighbor while retaining unequal widths and gaps');
    await page.locator('#lane-left').click(); assert.deepEqual(await getDoc(), beforeMove, 'Left reverses the lane order operation');

    // A fixed or cross-lane group is an atomic unit: unsafe reorder attempts do not partly move it.
    const unsafe = await getDoc(); unsafe.groups = [{ id: 'cross_lane_group', memberIds: [a.id, a2.id, internal.id, free.id, b.id, cross.id] }]; unsafe.nodes.find(node => node.id === a.id).locked = true;
    await loadFixture(page, { ...unsafe, id: 'lane_unsafe' }); await closeSidePane(page); await selectLayer(page, 'lanes'); await page.locator('#lane-select').selectOption('lane_a');
    const beforeUnsafe = await getDoc(); await page.locator('#lane-right').click(); assert.deepEqual(await getDoc(), beforeUnsafe, 'A fixed cross-lane group prevents partial lane reordering');

    // Deleting a lane leaves its diagram content in place, clears assignment, and is fully undoable.
    await loadFixture(page, { ...laneDoc, id: 'lane_delete' }); await closeSidePane(page); await selectLayer(page, 'lanes'); await page.locator('#lane-select').selectOption('lane_b');
    const beforeDelete = await getDoc(); await page.locator('#delete-lane').click(); let deleted = await getDoc();
    assert.equal(deleted.lanes.length, 2); assert.equal(deleted.nodes.find(node => node.id === b.id).laneId, null); assert.equal(deleted.edges.find(edge => edge.id === cross.id).laneId, undefined);
    assert.equal(deleted.nodes.find(node => node.id === b.id).x, beforeDelete.nodes.find(node => node.id === b.id).x, 'Deleting a lane does not move its diagram');
    assert.equal(await page.locator('#lane-select').inputValue(), 'lane_c', 'Deleting the middle lane selects the next lane');
    await page.locator('#undo').click(); assert.deepEqual(await getDoc(), beforeDelete); await page.locator('#redo').click();
    await page.locator('#lane-select').selectOption('lane_c'); await page.locator('#delete-lane').click(); assert.equal((await getDoc()).lanes.length, 1);
    await page.locator('#lane-select').selectOption('lane_a'); await page.locator('#delete-lane').click(); assert.equal((await getDoc()).lanes.length, 0); assert.equal(await page.locator('#lane-bar').isHidden(), true);
    await page.locator('#undo').click(); await page.locator('#redo').click();

    // Lane title focus supports Enter/F2 confirmation and Escape cancellation; keyboard Delete is undoable.
    await loadFixture(page, { ...laneDoc, id: 'lane_keyboard' }); await closeSidePane(page); await selectLayer(page, 'lanes'); await page.locator('#lane-select').selectOption('lane_a');
    const originalTitle = (await getDoc()).lanes.find(lane => lane.id === 'lane_a').title;
    await page.locator('#lane-select').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('F2'); await page.locator('#lane-title').fill('取り消す名前'); await page.keyboard.press('Escape');
    assert.equal((await getDoc()).lanes.find(lane => lane.id === 'lane_a').title, originalTitle, 'Escape cancels lane-title editing');
    await page.locator('#lane-select').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.locator('#lane-title').fill('確定した名前'); await page.keyboard.press('Enter');
    assert.equal((await getDoc()).lanes.find(lane => lane.id === 'lane_a').title, '確定した名前', 'Enter confirms lane-title editing');
    await page.locator('#canvas').focus(); await page.keyboard.press('Delete'); assert.equal((await getDoc()).lanes.length, 2, 'Canvas Delete removes the selected lane'); await page.locator('#undo').click(); assert.equal((await getDoc()).lanes.length, 3, 'Undo restores a keyboard-deleted lane');

    // Width changes at a deleted gap and at the right edge do not move neighboring lanes.
    await page.locator('#lane-select').selectOption('lane_b'); await page.locator('#delete-lane').click(); await page.locator('#lane-select').selectOption('lane_a');
    const beforeGapResize = await getDoc(), laneCX = beforeGapResize.lanes.find(lane => lane.id === 'lane_c').x;
    await page.locator('#lane-width').fill('260'); await page.locator('#lane-width').press('Enter'); assert.equal((await getDoc()).lanes.find(lane => lane.id === 'lane_c').x, laneCX, 'Resizing toward a deleted gap does not move the next lane');
    await page.locator('#lane-select').selectOption('lane_c'); const beforeRightResize = await getDoc(), laneAX = beforeRightResize.lanes.find(lane => lane.id === 'lane_a').x;
    await page.locator('#lane-width').fill('330'); await page.locator('#lane-width').press('Enter'); assert.equal((await getDoc()).lanes.find(lane => lane.id === 'lane_a').x, laneAX, 'Resizing the rightmost lane does not move another lane');

    // Zero-lane and existing-lane additions select the new lane and keep keyboard editing available.
    const empty = Core.createDocument('activity'); empty.lanes = [];
    await loadFixture(page, empty); await closeSidePane(page); await selectLayer(page, 'lanes'); await clickToolbarAction(page, 'add-lane');
    assert.equal((await getDoc()).lanes.length, 1); assert.equal(await page.locator('#lane-title').evaluate(el => el === document.activeElement), true);
    await page.locator('#lane-title').fill('新しい担当'); await page.locator('#lane-title').press('Enter');
    await clickToolbarAction(page, 'add-lane'); await clickToolbarAction(page, 'add-lane'); assert.equal((await getDoc()).lanes.length, 3);
    const savedDoc = await getDoc(); const saved = page.waitForEvent('download'); await page.locator('#file-menu > summary').click(); await page.locator('#save-file').click();
    const file = await saved, filePath = path.join(artifacts, `${browser.browserType().name()}-lanes.diagram.json`); await file.saveAs(filePath);
    const reopened = JSON.parse(await fs.readFile(filePath, 'utf8')); reopened.id = 'lane_reopened'; await loadFixture(page, reopened); assert.equal((await getDoc()).lanes.length, 3, 'Lane count survives saving and reopening');
    assert.match(await page.evaluate(() => DiagramEditor.exportSVG()), /担当|lane/, 'SVG export includes lane content');
    await page.locator('[data-pane-button="export"]').click(); const png = page.waitForEvent('download'); await page.locator('#export-png').click(); await (await png).saveAs(path.join(artifacts, `${browser.browserType().name()}-lanes.png`));
    await page.locator('#side-print').click(); await page.locator('#print-name').check();
    for (const paper of ['A4', 'B5']) { await page.locator('#print-paper').selectOption(paper); await page.locator('#print-submit').click(); assert.equal((await getDoc()).lanes.length, 3); assert.equal(await page.locator('#print-name').isChecked(), true, 'Print settings retain the name preference'); }
    await page.locator('#print-dialog [data-close-dialog]').click(); assert.deepEqual(await getDoc(), { ...savedDoc, id: 'lane_reopened' });

    await checkClassroomLaneOutput(page, artifacts, browser.browserType().name());

    await page.setViewportSize({ width: 390, height: 736 }); await page.waitForFunction(() => document.querySelector('.toolbar').dataset.compact === 'true'); await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.locator('#settings-menu > summary').press('Escape'); await closeSidePane(page);
    await selectLayer(page, 'lanes'); await page.locator('#lane-title').fill('長い担当領域の名前を確認する'); await page.locator('#lane-title').press('Enter');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Lane controls fit 390px dark largest text');
    await page.screenshot({ path: path.join(artifacts, `${browser.browserType().name()}-lanes-390-dark.png`), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  await checkLaneTouch(browser, url);
}

async function checkClassroomLaneOutput(page, artifacts, engine) {
  const doc = Core.createDocument('activity');
  doc.title = '出欠確認の流れ'; doc.lesson = { instructions: '生徒・教員・システムの担当を見て、出欠確認がどの順に進むかを説明しよう。', studentMode: false };
  doc.lanes = [
    { id: 'class_student', title: '生徒（出欠を回答する担当）', x: 40, y: 50, w: 260, h: 540, locked: false },
    { id: 'class_teacher', title: '教員', x: 320, y: 50, w: 260, h: 540, locked: false },
    { id: 'class_system', title: 'システム', x: 600, y: 50, w: 260, h: 540, locked: false }
  ];
  const student = Core.createNode('action', 86, 180, { id: 'class_student_answer', text: '出欠を回答する', laneId: 'class_student' });
  const teacher = Core.createNode('action', 365, 180, { id: 'class_teacher_check', text: '回答を確認する', laneId: 'class_teacher' });
  const system = Core.createNode('action', 645, 180, { id: 'class_system_record', text: '出欠を記録する', laneId: 'class_system' });
  const notice = Core.createNode('action', 365, 360, { id: 'class_teacher_notice', text: '未回答者に連絡する', laneId: 'class_teacher' });
  const ep = node => ({ nodeId: node.id, side: 'auto', offset: .5 });
  doc.nodes = [student, teacher, system, notice]; doc.edges = [Core.createEdge(ep(student), ep(teacher), { id: 'class_answer', label: { text: '回答' } }), Core.createEdge(ep(teacher), ep(system), { id: 'class_record', label: { text: '確認済み' } }), Core.createEdge({ nodeId: system.id, side: 'bottom', offset: .5 }, { nodeId: notice.id, side: 'right', offset: .5 }, { id: 'class_missing', label: { text: '未回答者' } })];
  await loadFixture(page, doc); await closeSidePane(page);
  const header = await page.evaluate(() => {
    const lane = DiagramEditor.getDocument().lanes[0], text = document.querySelector('[data-lane="class_student"] text'); const box = text.getBBox();
    return { y: box.y, bottom: box.y + box.height, laneTop: lane.y, laneHeaderBottom: lane.y + 32 };
  });
  assert.ok(header.y >= header.laneTop && header.bottom <= header.laneHeaderBottom + .01, 'A long classroom lane title fits its 32px header');
  const returnRoute = await page.evaluate(() => { const doc = DiagramEditor.getDocument(), edge = doc.edges.find(item => item.id === 'class_missing'), target = doc.nodes.find(item => item.id === 'class_teacher_notice'), geometry = DiagramRender.edgeGeometry(doc, edge); return { to: geometry.to, target: { x: target.x, y: target.y, w: target.w, h: target.h }, points: geometry.points }; });
  assert.ok(Math.abs(returnRoute.to.x - (returnRoute.target.x + returnRoute.target.w)) < .01 && returnRoute.to.y >= returnRoute.target.y && returnRoute.to.y <= returnRoute.target.y + returnRoute.target.h, 'The return arrow enters the contact process through its right edge');
  await selectLayer(page, 'lanes'); await page.locator('#lane-select').selectOption('class_system');
  assert.equal(await page.locator('#lane-bar').isVisible(), true, 'The classroom editor screenshot shows lane editing controls');
  await page.screenshot({ path: path.join(artifacts, `${engine}-lanes-classroom-editor.png`), fullPage: true });
  await page.locator('[data-pane-button="export"]').click(); const png = page.waitForEvent('download'); await page.locator('#export-png').click(); await (await png).saveAs(path.join(artifacts, `${engine}-lanes-classroom.png`));
  await page.locator('#side-print').click();
  for (const [paper, includeName] of [['A4', false], ['B5', true]]) {
    await page.locator('#print-paper').selectOption(paper); await page.locator('#print-orientation').selectOption('portrait');
    if (await page.locator('#print-name').isChecked() !== includeName) await page.locator('#print-name').click();
    await page.locator('#print-submit').click(); await page.waitForFunction(() => document.querySelector('#print-sheet .print-diagram svg'));
    const layout = await page.evaluate(() => { const sheet = document.getElementById('print-sheet'); sheet.classList.add('is-measuring'); const pages = [...sheet.querySelectorAll('.print-page')], diagram = sheet.querySelector('.print-diagram'), svg = diagram?.querySelector('svg'), d = diagram?.getBoundingClientRect(), s = svg?.getBoundingClientRect(); sheet.classList.remove('is-measuring'); return { pages: pages.length, names: sheet.querySelectorAll('.print-name-field').length, diagram: d && { w: d.width, h: d.height }, svg: s && { w: s.width, h: s.height } }; });
    assert.equal(layout.pages, 1, `${paper} classroom print uses one page`); assert.equal(layout.names, includeName ? 1 : 0, `${paper} classroom print name-field setting is retained`);
    assert.ok(layout.diagram.w > 0 && layout.diagram.h > 0 && layout.svg.w > 0 && layout.svg.h > 0 && layout.svg.w <= layout.diagram.w + 1 && layout.svg.h <= layout.diagram.h + 1, `${paper} classroom diagram fits its print area`);
    if (engine === 'chromium') { const file = path.join(artifacts, `lanes-classroom-${paper}-${includeName ? 'name' : 'noname'}.pdf`); await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true }); await assertPdfPaper(file, paper, includeName); }
  }
  await page.locator('#print-dialog [data-close-dialog]').click();
}

async function assertPdfPaper(file, paper, includeName) {
  const raw = await fs.readFile(file, 'latin1'), pages = [...raw.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(match => ({ w: Number(match[1]), h: Number(match[2]) }));
  const expected = paper === 'B5' ? { w: 515.9, h: 728.5 } : { w: 595.3, h: 841.9 };
  assert.equal(pages.length, 1, `${paper} PDF has exactly one page`); assert.ok(Math.abs(pages[0].w - expected.w) < 2 && Math.abs(pages[0].h - expected.h) < 2, `${paper} PDF uses the requested physical paper dimensions`);
  assert.equal(typeof includeName, 'boolean', 'The PDF test records whether the matching print had a name field');
}

async function checkLaneTouch(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(12000); await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const doc = Core.createDocument('activity'); doc.lanes = [{ id: 'touch_lane_a', title: '担当A', x: 40, y: 50, w: 220, h: 420, locked: false }, { id: 'touch_lane_b', title: '担当B', x: 290, y: 50, w: 220, h: 420, locked: false }];
    await loadFixture(page, doc); await closeSidePane(page); await selectLayer(page, 'lanes', 'tap'); await page.locator('#lane-select').selectOption('touch_lane_a');
    await page.locator('#lane-title').fill('タッチ担当'); await page.locator('#lane-title').press('Enter'); await page.locator('#lane-right').tap(); await page.locator('#lane-left').tap();
    await page.locator('#delete-lane').tap(); assert.equal((await page.evaluate(() => DiagramEditor.getDocument())).lanes.length, 1, 'Touch can edit, reorder, and delete lanes');
  } finally { await context.close(); }
}

async function closeSidePane(page) {
  const close = page.locator('[data-pane]:not([hidden]) [data-close-side]');
  if (await close.count()) await close.click();
}

async function assertMeasuredPrintLayout(page) {
  const metrics = await page.evaluate(() => {
    const sheet = document.getElementById('print-sheet'); sheet.classList.add('is-measuring');
    const pages = [...sheet.querySelectorAll('.print-page')].map((page, pageIndex) => {
      const body = page.querySelector('.print-body').getBoundingClientRect();
      const paragraphs = [...page.querySelectorAll('.print-body .print-instructions')].map(item => ({ bottom: item.getBoundingClientRect().bottom, bodyBottom: body.bottom }));
      const diagram = page.querySelector('.print-diagram'), svg = diagram?.querySelector('svg'), diagramBox = diagram?.getBoundingClientRect(), svgBox = svg?.getBoundingClientRect();
      return { pageIndex, paragraphs, hasDiagram: !!diagram, diagramWidth: diagramBox?.width || 0, diagramHeight: diagramBox?.height || 0, svgWidth: svgBox?.width || 0, svgHeight: svgBox?.height || 0 };
    }); sheet.classList.remove('is-measuring'); return pages;
  });
  metrics.forEach(page => page.paragraphs.forEach(paragraph => assert.ok(paragraph.bottom <= paragraph.bodyBottom + 1, `Instruction paragraph stays inside print body on page ${page.pageIndex + 1}`)));
  const diagrams = metrics.filter(page => page.hasDiagram); assert.equal(diagrams.length, 1, 'Only one printed page contains the diagram');
  assert.equal(diagrams[0].pageIndex, metrics.length - 1, 'The diagram is on the final printed page');
  assert.ok(diagrams[0].diagramWidth > 0 && diagrams[0].diagramHeight > 0 && diagrams[0].svgWidth > 0 && diagrams[0].svgHeight > 0, 'Final diagram and SVG have measurable dimensions');
}

async function assertPreviewMatchesPrintSheet(page) {
  const values = await page.evaluate(() => {
    const style = element => { const computed = getComputedStyle(element); return { text: element.textContent, fontSize: computed.fontSize, lineHeight: computed.lineHeight, margin: computed.margin, padding: computed.padding }; };
    return { preview: [...document.querySelectorAll('#print-preview .print-instructions')].map(style), print: [...document.querySelectorAll('#print-sheet .print-instructions')].map(style) };
  });
  assert.deepEqual(values.preview, values.print, 'Preview paragraphs retain the text and typography of the real print DOM');
}

async function checkDefaultLabelDrag(page, artifacts, engine) {
  const doc = Core.createDocument();
  const source = Core.createNode('process', 80, 240, { id: 'label_source', text: '開始' });
  const blocker = Core.createNode('process', 330, 220, { id: 'label_blocker', text: '中間の図形' });
  const target = Core.createNode('process', 610, 240, { id: 'label_target', text: '終了' });
  const edge = Core.createEdge({ nodeId: source.id, side: 'right', offset: .5 }, { nodeId: target.id, side: 'left', offset: .5 }, { id: 'label_default_edge', kind: 'orthogonal', label: { text: '条件', t: .5, dx: 0, dy: -12 } });
  doc.nodes = [source, blocker, target]; doc.edges = [edge];
  await loadFixture(page, doc);
  const labelGeometry = () => page.evaluate(id => {
    const d = DiagramEditor.getDocument(), edge = d.edges.find(item => item.id === id), geometry = DiagramRender.edgeGeometry(d, edge), matrix = document.getElementById('world').getScreenCTM();
    const point = value => new DOMPoint(value.x, value.y).matrixTransform(matrix);
    return { label: geometry.label, offset: geometry.labelOffset, screen: point(geometry.label), stored: edge.label };
  }, edge.id);
  const before = await labelGeometry();
  assert.notDeepEqual(before.offset, { x: before.stored.dx, y: before.stored.dy }, 'The default label uses a visible obstacle-avoiding offset without changing saved label data');
  const label = page.locator(`[data-edge-label="${edge.id}"]`); assert.equal(await label.count(), 1);
  const labelBox = await label.boundingBox(); assert.ok(labelBox);
  const screenDelta = await page.evaluate(() => {
    const matrix = document.getElementById('world').getScreenCTM(), origin = new DOMPoint(0, 0).matrixTransform(matrix), destination = new DOMPoint(60, 40).matrixTransform(matrix);
    return { x: destination.x - origin.x, y: destination.y - origin.y };
  });
  const dragStart = { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 };
  await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down(); await page.mouse.move(dragStart.x + screenDelta.x, dragStart.y + screenDelta.y, { steps: 8 }); await page.mouse.up();
  const moved = await labelGeometry();
  // WebKit rounds synthetic pointer coordinates after the SVG transform by under a quarter world unit.
  assert.ok(Math.abs(moved.label.x - before.label.x - 60) < .3 && Math.abs(moved.label.y - before.label.y - 40) < .3, `Dragging begins from the visible default label and moves exactly 60px / 40px in world coordinates (${JSON.stringify({ before: before.label, moved: moved.label, screenDelta })})`);
  const movedDocument = await page.evaluate(() => DiagramEditor.getDocument());
  await page.locator('#undo').click();
  const undone = await labelGeometry(); assert.ok(Math.abs(undone.label.x - before.label.x) < .01 && Math.abs(undone.label.y - before.label.y) < .01, 'Undo restores the automatic visible label position');
  await page.locator('#redo').click();
  const saved = page.waitForEvent('download'); await page.locator('#file-menu > summary').click(); await page.locator('#save-file').click();
  const file = await saved, savedPath = path.join(artifacts, `${engine}-default-label.diagram.json`); await file.saveAs(savedPath);
  const restored = JSON.parse(await fs.readFile(savedPath, 'utf8')); restored.id = 'label_default_reopened';
  await loadFixture(page, restored); const reopened = await labelGeometry();
  assert.ok(Math.abs(reopened.label.x - moved.label.x) < .01 && Math.abs(reopened.label.y - moved.label.y) < .01, 'Saving and reopening retains the dragged label position');
  await page.evaluate(id => DiagramEditor.select([id]), edge.id); const beforeLock = await labelGeometry(); await openEditMenu(page); await page.locator('#lock-button').click(); const afterLock = await labelGeometry();
  assert.deepEqual(afterLock.label, beforeLock.label, 'Locking does not mutate the default label display position');
  assert.deepEqual((await page.evaluate(() => DiagramEditor.getDocument())).edges.find(item => item.id === edge.id).label, movedDocument.edges.find(item => item.id === edge.id).label, 'Locking preserves saved label offsets');
}

async function checkPrintTouch(browser, url, artifacts) {
  const context = await browser.newContext({ viewport: { width: 390, height: 736 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const doc = Core.createTemplate('flow-branch'); doc.id = 'touch_print'; doc.title = '印刷確認'; doc.lesson = { instructions: 'タッチで印刷設定を確認します。', studentMode: false };
    await loadFixture(page, doc); await page.locator('[data-pane-button="export"]').tap(); await page.locator('#side-print').tap();
    await page.locator('#print-name').tap(); assert.equal(await page.locator('#print-name').isChecked(), true, 'Touch toggles the name field on');
    await page.locator('#print-name').tap(); assert.equal(await page.locator('#print-name').isChecked(), false, 'Touch toggles the name field off');
    for (const selector of ['#print-paper', '#print-orientation', '#print-instructions', '#print-name', '#print-dialog [data-close-dialog]', '#print-submit']) {
      await page.locator(selector).scrollIntoViewIfNeeded(); await expectWithinViewport(page, selector, `${selector} remains operable in mobile print dialog`);
    }
    assert.ok((await page.locator('#print-preview').boundingBox()).width <= 390, 'Mobile print preview does not overflow horizontally');
    await page.screenshot({ path: path.join(artifacts, browser.browserType().name() === 'chromium' ? 'print-dialog-mobile.png' : 'webkit-print-dialog-mobile.png'), fullPage: true });
  } finally { await context.close(); }
}

async function waitForInspectionTargetsInView(page, ids) {
  await page.waitForFunction(ids => {
    const canvas = document.getElementById('canvas'), doc = DiagramEditor.getDocument(); if (!canvas) return false;
    const area = canvas.getBoundingClientRect(), expanded = new Set(ids);
    for (const group of doc.groups || []) if (group.memberIds.some(id => expanded.has(id))) group.memberIds.forEach(id => expanded.add(id));
    return [...expanded].every(id => {
      const element = document.querySelector(`[data-node="${CSS.escape(id)}"], [data-edge="${CSS.escape(id)}"]`); if (!element) return true;
      const box = element.getBoundingClientRect(); return box.left >= area.left - 2 && box.right <= area.right + 2 && box.top >= area.top - 2 && box.bottom <= area.bottom + 2;
    });
  }, ids);
}

async function assertOrthogonalPathAvoids(page, edgeId, obstacleId) {
  const crosses = await page.evaluate(({ edgeId, obstacleId }) => {
    const doc = DiagramEditor.getDocument(), edge = doc.edges.find(item => item.id === edgeId), obstacle = doc.nodes.find(item => item.id === obstacleId);
    const points = DiagramRender.edgeGeometry(doc, edge).points, inset = 2;
    const left = obstacle.x + inset, right = obstacle.x + obstacle.w - inset, top = obstacle.y + inset, bottom = obstacle.y + obstacle.h - inset;
    return points.slice(1).some((point, index) => {
      const previous = points[index];
      if (Math.abs(previous.y - point.y) < .01) return previous.y > top && previous.y < bottom && Math.max(Math.min(previous.x, point.x), left) < Math.min(Math.max(previous.x, point.x), right);
      if (Math.abs(previous.x - point.x) < .01) return previous.x > left && previous.x < right && Math.max(Math.min(previous.y, point.y), top) < Math.min(Math.max(previous.y, point.y), bottom);
      return false;
    });
  }, { edgeId, obstacleId });
  assert.equal(crosses, false, 'Automatic orthogonal routing avoids unrelated diagram nodes');
}

async function checkPointerEditing(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
    const getDoc = () => page.evaluate(() => DiagramEditor.getDocument());
    const select = id => page.evaluate(id => DiagramEditor.select([id]), id);
    const boxCenter = async locator => { const b = await locator.boundingBox(); assert.ok(b); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const nodeLocator = id => page.locator(`[data-node="${id}"]`);
    const port = (id, side) => page.locator(`[data-port="${id}"][data-side="${side}"][data-offset="0.5"]`).last();
    const dragTo = async (locator, destination) => {
      const p = await boxCenter(locator); await page.mouse.move(p.x, p.y); await page.mouse.down();
      await page.mouse.move(destination.x, destination.y, { steps: 8 }); await page.mouse.up();
    };
    for (const [x, y, label] of [[220,170,'開始処理'],[490,350,'確認処理'],[750,170,'再処理']]) {
      await page.locator('[data-tool="node:process"]').click();
      const stage = await page.locator('#stage').boundingBox(); await page.mouse.click(stage.x + x, stage.y + y);
      await page.locator('#inline-editor').fill(label); await page.locator('#inline-editor').press('Control+Enter');
    }
    const [a,b,c] = (await getDoc()).nodes;
    await nodeLocator(a.id).click(); await port(a.id,'bottom').click(); await nodeLocator(b.id).click();
    let d = await getDoc(); assert.equal(d.edges.length,1); assert.equal(d.edges[0].from.nodeId,a.id); assert.equal(d.edges[0].to.nodeId,b.id);
    const firstEdge = d.edges[0].id;
    await nodeLocator(b.id).click(); await dragTo(port(b.id,'right'),await boxCenter(nodeLocator(c.id)));
    d = await getDoc(); assert.equal(d.edges.length,2); assert.equal(d.edges[1].from.nodeId,b.id); assert.equal(d.edges[1].to.nodeId,c.id);
    await nodeLocator(c.id).click(); await port(c.id,'right').click(); await nodeLocator(c.id).click();
    d = await getDoc(); assert.equal(d.edges.length,3); const loop = d.edges[2]; assert.equal(loop.from.nodeId,c.id); assert.equal(loop.to.nodeId,c.id); assert.equal(loop.kind,'curve');

    await clickToolbarAction(page, 'edit-text'); await page.locator('#inline-editor').fill('もう一度'); await page.locator('#inline-editor').press('Control+Enter');
    const label = page.locator(`[data-edge-label="${loop.id}"]`), originalLabel = (await getDoc()).edges[2].label;
    const labelPoint = await boxCenter(label); await dragTo(label,{x:labelPoint.x-25,y:labelPoint.y+70});
    let edited = (await getDoc()).edges[2]; assert.ok(Math.abs(edited.label.dx-originalLabel.dx+25)<1); assert.ok(Math.abs(edited.label.dy-originalLabel.dy-70)<1);
    const labelAfterMove = structuredClone(edited.label);
    const bend = page.locator(`[data-handle="bend"][data-id="${loop.id}"]`), bendPoint = await boxCenter(bend);
    await dragTo(bend,{x:bendPoint.x-30,y:bendPoint.y+60});
    edited = (await getDoc()).edges[2]; assert.ok(edited.bend); assert.deepEqual(edited.label,labelAfterMove);
    await page.locator('#undo').click(); assert.equal((await getDoc()).edges[2].bend,null); assert.deepEqual((await getDoc()).edges[2].label,labelAfterMove);
    await page.locator('#redo').click(); assert.ok((await getDoc()).edges[2].bend);

    await select(firstEdge);
    await dragTo(page.locator(`[data-handle="endpoint"][data-id="${firstEdge}"][data-endpoint="to"]`),await boxCenter(nodeLocator(c.id)));
    assert.equal((await getDoc()).edges[0].to.nodeId,c.id); assert.equal((await getDoc()).edges[0].from.nodeId,a.id);
    await page.locator('#undo').click(); assert.equal((await getDoc()).edges[0].to.nodeId,b.id);

    await select(a.id); await port(a.id,'bottom').click(); await page.keyboard.press('Escape');
    assert.equal((await getDoc()).edges.length,3);
    await select(a.id); const before = await getDoc(), p = await boxCenter(nodeLocator(a.id));
    await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(p.x+60,p.y+40,{steps:5});
    await page.keyboard.press('Escape'); await page.mouse.up(); assert.deepEqual(await getDoc(),before);
    // A browser quota failure must remain visible after selection-only renders.
    await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === 'kaijo.diagram.recovery.v1') throw new DOMException('Storage is full','QuotaExceededError'); return original.call(this,key,value); }; });
    await page.locator('#canvas').focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.getElementById('save-status').textContent.includes('ブラウザ自動保存に失敗'));
    await select(c.id); assert.match(await page.locator('#save-status').textContent(),/ブラウザ自動保存に失敗/);
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
}

async function checkConnectionSnapping(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  try {
    const page = await context.newPage(), errors = []; page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);
    const getDoc=()=>page.evaluate(()=>DiagramEditor.getDocument());
    const screen=async (x,y)=>page.evaluate(({x,y})=>{const p=new DOMPoint(x,y).matrixTransform(document.getElementById('world').getScreenCTM());return {x:p.x,y:p.y};},{x,y});
    const candidates=async selector=>[...new Set(await page.locator(selector).evaluateAll(els=>els.map(el=>Number(el.dataset.offset))))].sort((a,b)=>a-b);
    async function load(count) {
      const d=Core.createDocument(),n=Core.createNode('process',200,260,{w:300,h:100,text:'接続位置'});d.nodes=[n];
      for(let i=0;i<count;i++)d.edges.push(Core.createEdge({x:200+i*150,y:140},{nodeId:n.id,side:'top',offset:i===0?.61:.5}));
      await loadFixture(page, d);
      return {d,n};
    }
    for(const [total,raw,expected,points] of [[1,.46,.5,[0,.5,1]],[1,.04,0,[0,.5,1]],[1,.96,1,[0,.5,1]],[2,.37,1/3,[0,1/3,.5,2/3,1]],[3,.28,.25,[0,.25,.5,.75,1]]]) {
      const {d,n}=await load(total-1);await page.evaluate(id=>DiagramEditor.select([id]),n.id);
      assert.deepEqual(await candidates(`[data-port="${n.id}"][data-side="top"]`),points);
      await page.locator('[data-tool="edge:straight"]').click();
      const a=await screen(n.x+n.w*.8,n.y-110),b=await screen(n.x+n.w*raw,n.y);
      await page.mouse.click(a.x,a.y);await page.mouse.move(b.x,b.y);
      assert.deepEqual(await candidates(`[data-snap-guide="${n.id}"][data-side="top"]`),points);
      await page.mouse.click(b.x,b.y);
      const next=await getDoc();assert.equal(next.edges.length,total);assert.equal(next.edges.at(-1).to.side,'top');assert.ok(Math.abs(next.edges.at(-1).to.offset-expected)<1e-10);
      assert.deepEqual(next.edges.slice(0,-1),d.edges,'Manual positions must stay fixed when another connection is added');
    }
    const {d,n}=await load(3),id=d.edges[0].id;
    await page.evaluate(id=>DiagramEditor.select([id]),id);
    let handle=await page.locator(`[data-handle=endpoint][data-id="${id}"][data-endpoint=to]`).boundingBox();
    let target=await screen(n.x+n.w*.28,n.y);
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:6});
    assert.deepEqual(await candidates(`[data-snap-guide="${n.id}"][data-side="top"]`),[0,.25,.5,.75,1]);
    await page.screenshot({path:path.join(os.tmpdir(),'joho-diagram-browser',`${browser.browserType().name()}-connection-snap.png`),fullPage:true});
    await page.mouse.up();assert.equal((await getDoc()).edges[0].to.offset,.25);
    await page.locator('#undo').click();assert.equal((await getDoc()).edges[0].to.offset,.61);
    await page.locator('#redo').click();assert.equal((await getDoc()).edges[0].to.offset,.25);
    await openBehaviorMenu(page); await page.locator('#snap').uncheck();await page.evaluate(id=>DiagramEditor.select([id]),id);
    handle=await page.locator(`[data-handle=endpoint][data-id="${id}"][data-endpoint=to]`).boundingBox();target=await screen(n.x+n.w*.37,n.y);
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:6});await page.mouse.up();
    assert.ok(Math.abs((await getDoc()).edges[0].to.offset-.37)<.005);
    const source=await load(1);await openBehaviorMenu(page); await page.locator('#snap').check();await page.evaluate(id=>DiagramEditor.select([id]),source.n.id);
    await page.locator(`[data-port="${source.n.id}"][data-side=top][data-offset="${1/3}"]`).last().click();
    const free=await screen(source.n.x+60,source.n.y-100);await page.mouse.click(free.x,free.y);
    assert.equal((await getDoc()).edges.at(-1).from.offset,1/3,'A source port can start from an exact third');
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
}

async function checkTemplateOutputs(browser, url, engine, artifacts) {
  for (const template of ['flow-branch','activity-parallel','state-device']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    await page.goto(url); await page.waitForFunction(() => !!window.DiagramEditor);
      const file = path.join(artifacts,`${template}.diagram.json`);
      // WebKit reopens the actual files downloaded by Chrome, including lane membership and routes.
      const input = engine === 'chromium' ? Core.serializeDocument(Core.createTemplate(template)) : await fs.readFile(file,'utf8');
      const expected = Core.parseDocument(input);
      await page.locator('#file-input').setInputFiles({ name: `${template}.diagram.json`, mimeType:'application/json', buffer:Buffer.from(input) });
      await page.locator('[data-open-source="local-file"]').click();
      await page.waitForFunction(id => DiagramEditor.getDocument().id === id,expected.id);
      assert.deepEqual(await page.evaluate(() => DiagramEditor.getDocument()),expected);
      await openMenuFor(page, '#settings-menu'); await page.locator('#theme').selectOption('dark'); await page.locator('.brand').click();
      async function download(selector, output) { const waiting=page.waitForEvent('download'); await page.locator(selector).click(); const file=await waiting; await file.saveAs(output); return fs.readFile(output); }
      await page.locator('#file-menu > summary').click();
      const json = await download('#save-file',engine==='chromium'?file:path.join(artifacts,`${engine}-${template}.diagram.json`));
      assert.deepEqual(Core.parseDocument(JSON.parse(json.toString())),expected);
      if (await page.locator('[data-pane-button=export]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-pane-button=export]').click();
      for (const transparent of [false,true]) {
        await page.locator('#transparent').setChecked(transparent);
        const stem=path.join(artifacts,`${engine}-${template}${transparent?'-transparent':''}`);
        const svg=await download('#export-svg',`${stem}.svg`);
        assert.doesNotMatch(svg.toString(),/foreignObject|data-node=|NaN|undefined/);
        const png=await download('#export-png',`${stem}.png`); assert.equal(png.readUInt32BE(0),0x89504e47); assert.ok(png.length>5000);
      }
      if (engine==='chromium') await page.pdf({ path:path.join(artifacts,`${template}-print.pdf`),format:'A4',printBackground:true });
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
  }
}
async function loadFixture(page, doc) {
  await page.locator('#file-input').setInputFiles({name:'test.diagram.json',mimeType:'application/json',buffer:Buffer.from(Core.serializeDocument(doc))});
  await page.waitForFunction(() => document.getElementById('storage-open-dialog')?.open || document.getElementById('confirm-dialog')?.open);
  if (await page.locator('#storage-open-dialog').evaluate(dialog => dialog.open)) await page.locator('[data-open-source="local-file"]').click();
  await page.waitForFunction(id=>DiagramEditor.getDocument().id===id||document.getElementById('confirm-dialog').open,doc.id);
  if(await page.locator('#confirm-dialog').isVisible())await page.locator('#confirm-continue').click();
  await page.waitForFunction(id=>DiagramEditor.getDocument().id===id,doc.id);
}
async function restoreBrowserAuto(page, source = 'browser-auto') {
  await page.waitForFunction(() => !!window.DiagramEditor);
  const dialog = page.locator('#storage-open-dialog');
  if (await dialog.count() && await dialog.evaluate(element => element.open)) {
    const candidate = dialog.locator(`[data-open-source="${source}"]`).first();
    if (await candidate.count()) await candidate.click(); else await page.keyboard.press('Escape');
  }
}
async function screenPoint(page, point) {
  return page.evaluate(({x,y})=>{const p=new DOMPoint(x,y).matrixTransform(document.getElementById('world').getScreenCTM());return {x:p.x,y:p.y};},point);
}
async function checkInsertAndBranch(browser, url, artifacts) {
  const context=await browser.newContext({viewport:{width:1280,height:860}});
  try {
    const page=await context.newPage(),errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('dialog',d=>d.accept());
    await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);
    const getDoc=()=>page.evaluate(()=>DiagramEditor.getDocument());
    const original=Core.createTemplate('flow-sequence');await loadFixture(page,original);
    const old=original.edges[0],point=await page.evaluate(id=>{const d=DiagramEditor.getDocument(),g=DiagramRender.edgeGeometry(d,d.edges.find(e=>e.id===id));return {x:(g.from.x+g.to.x)/2,y:(g.from.y+g.to.y)/2};},old.id);
    await page.locator('[data-tool="node:process"]').click();
    const at=await screenPoint(page,point);await page.mouse.move(at.x,at.y);
    assert.equal(await page.locator(`[data-insertion-preview="${old.id}"]`).count(),1);
    await page.mouse.click(at.x,at.y);await page.locator('#inline-editor').press('Escape');
    let d=await getDoc(),added=d.nodes.at(-1),source=d.nodes.find(n=>n.id===old.from.nodeId),target=d.nodes.find(n=>n.id===old.to.nodeId);
    assert.equal(d.nodes.length,original.nodes.length+1);assert.equal(d.edges.length,original.edges.length+1);
    assert.equal(d.edges[0].to.nodeId,added.id);assert.equal(d.edges.at(-1).to.nodeId,old.to.nodeId);
    assert.ok(added.y>=source.y+source.h+36);assert.ok(target.y>=added.y+added.h+36);
    const inserted=d;await page.locator('#undo').click();assert.deepEqual(await getDoc(),original);await page.locator('#redo').click();assert.deepEqual(await getDoc(),inserted);

    const branchTemplate=Core.createTemplate('flow-branch');await loadFixture(page,branchTemplate);
    const no=branchTemplate.edges.find(e=>e.label.text==='いいえ'),diamond=branchTemplate.nodes.find(n=>n.kind==='decision');
    const geometry=await page.evaluate(id=>{const d=DiagramEditor.getDocument();return DiagramRender.edgeGeometry(d,d.edges.find(e=>e.id===id));},no.id);
    assert.equal(geometry.from.x,diamond.x);assert.equal(geometry.from.y,diamond.y+diamond.h/2);assert.ok(geometry.points[1].x<geometry.from.x);
    await page.evaluate(id=>DiagramEditor.select([id]),no.id);
    await openMenuFor(page,'#insert-process');await page.locator('#insert-process').focus();await page.keyboard.press('Enter');await page.locator('#inline-editor').press('Escape');
    d=await getDoc();assert.deepEqual(d.edges.find(e=>e.id===no.id).from,no.from);assert.equal(d.edges.find(e=>e.id===no.id).label.text,no.label.text);assert.deepEqual(d.edges.at(-1).to,no.to);
    await page.locator('#undo').click();assert.deepEqual(await getDoc(),branchTemplate);
    await page.locator('[data-tool="node:process"]').click();
    const shortLeg=await screenPoint(page,{x:164,y:320});await page.mouse.click(shortLeg.x,shortLeg.y);await page.locator('#inline-editor').press('Escape');
    d=await getDoc();const nearCorner=d.nodes.at(-1);
    assert.deepEqual(d.nodes.slice(0,-1),branchTemplate.nodes,'A bent route must not move its existing nodes');
    for(const n of branchTemplate.nodes)assert.ok(nearCorner.x+nearCorner.w<=n.x||nearCorner.x>=n.x+n.w||nearCorner.y+nearCorner.h<=n.y||nearCorner.y>=n.y+n.h,'Insertion must find a clear point on the same bent route');
    assert.equal(d.edges.find(e=>e.id===no.id).to.side,'right');assert.equal(d.edges.at(-1).from.side,'bottom');
    const labelBox=await page.evaluate(id=>{const d=DiagramEditor.getDocument();return DiagramRender.edgeGeometry(d,d.edges.find(e=>e.id===id)).labelBounds;},no.id);
    for(const n of d.nodes)assert.ok(labelBox.x+labelBox.w<=n.x||labelBox.x>=n.x+n.w||labelBox.y+labelBox.h<=n.y||labelBox.y>=n.y+n.h,'The retained condition label must not be covered by the inserted process');
    await page.locator('#zoom').selectOption('fit');await page.screenshot({path:path.join(artifacts,`${browser.browserType().name()}-insert-process.png`),fullPage:true});

    const blank=Core.createDocument();await loadFixture(page,blank);
    await page.locator('[data-tool=branch]').click();await page.locator('#canvas').click({position:{x:400,y:220}});await page.locator('#inline-editor').press('Escape');
    d=await getDoc();assert.equal(d.nodes.length,4);assert.equal(d.edges.length,4);
    assert.equal(await page.locator('#selection-status').textContent(),'1グループ・4図形・4線を選択');
    assert.deepEqual(d.edges.filter(e=>e.label.text).map(e=>e.label.text).sort(),['いいえ','はい']);
    const decision=d.nodes.find(n=>n.kind==='decision'),start=await screenPoint(page,{x:decision.x+decision.w/2,y:decision.y+decision.h/2}),end=await screenPoint(page,{x:decision.x+decision.w/2+40,y:decision.y+decision.h/2+20});
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
    let moved=await getDoc();d.nodes.forEach(n=>{const m=moved.nodes.find(m=>m.id===n.id);assert.equal(m.x,n.x+40);assert.equal(m.y,n.y+20);});
    await page.locator('#undo').click();assert.deepEqual(await getDoc(),d);await page.locator('#undo').click();assert.deepEqual(await getDoc(),blank);await page.locator('#redo').click();assert.deepEqual(await getDoc(),d);
    await page.screenshot({path:path.join(artifacts,`${browser.browserType().name()}-branch-set.png`),fullPage:true});
    await page.locator('[data-tool=branch]').focus();await page.keyboard.press('Enter');await page.locator('#inline-editor').press('Escape');assert.equal((await getDoc()).nodes.length,8);
    await page.locator('#diagram-type').selectOption('state');assert.equal(await page.locator('[data-tool=branch]').count(),0);
    await page.evaluate(id=>DiagramEditor.select([id]),d.edges[0].id);assert.equal(await page.locator('#insert-process').isVisible(),false);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
  const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try {
    const page=await touch.newPage();page.on('dialog',d=>d.accept());await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);
    const d=Core.createTemplate('flow-sequence');await loadFixture(page,d);await page.locator('[data-tool="node:process"]').tap();await page.locator('#canvas').scrollIntoViewIfNeeded();
    const point=await page.evaluate(()=>{const d=DiagramEditor.getDocument(),g=DiagramRender.edgeGeometry(d,d.edges[1]);return {x:(g.from.x+g.to.x)/2,y:(g.from.y+g.to.y)/2};});
    const at=await screenPoint(page,point);await page.touchscreen.tap(at.x,at.y);await page.locator('#inline-editor').press('Escape');
    assert.equal(await page.evaluate(()=>DiagramEditor.getDocument().nodes.length),d.nodes.length+1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  } finally {await touch.close();}
}
async function checkDarkCanvas(browser, url, artifacts) {
  const context=await browser.newContext({viewport:{width:1280,height:860},colorScheme:'light'});
  try {
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);
    const d=Core.createDocument();Core.addBranch(d,360,180);await loadFixture(page,d);
    const baseline=await page.evaluate(()=>DiagramEditor.exportSVG());
    async function theme(value) { await openMenuFor(page,'#settings-menu');await page.locator('#theme').selectOption(value);await page.locator('#settings-menu > summary').press('Escape'); }
    await theme('dark');
    const fill=()=>page.locator(`[data-node="${d.nodes[1].id}"] polygon`).first().getAttribute('fill');
    assert.equal(await fill(),'#273442');assert.equal(await page.locator('#stage').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(24, 33, 43)');
    assert.equal(await page.locator('#scene marker path').first().getAttribute('fill'),'#e8eef7');
    await page.locator(`[data-node="${d.nodes[0].id}"]`).focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#inline-editor').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(24, 33, 43)');await page.locator('#inline-editor').press('Escape');
    await page.screenshot({path:path.join(artifacts,`${browser.browserType().name()}-dark-canvas.png`),fullPage:true});
    assert.deepEqual(await page.evaluate(()=>DiagramEditor.getDocument()),d);assert.equal(await page.evaluate(()=>DiagramEditor.exportSVG()),baseline);
    await page.locator('[data-pane-button=export]').click();assert.ok(await page.locator('#export-preview [fill="#ffffff"]').count());
    if(browser.browserType().name()==='chromium') { await page.pdf({path:path.join(artifacts,'dark-editor-print.pdf'),format:'A4',printBackground:true});assert.equal(await page.locator('#print-sheet [fill="#273442"]').count(),0); }
    await page.locator('[data-close-side]:visible').first().click();
    await theme('auto');assert.equal(await fill(),'#ffffff');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>!!document.querySelector('#scene [fill="#273442"]'));
    await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>!document.querySelector('#scene [fill="#273442"]'));
    await theme('dark');
    await page.locator('#file-menu > summary').click(); await page.locator('#save-browser').click();
    await page.reload();await restoreBrowserAuto(page, 'browser-manual');assert.equal(await fill(),'#273442');assert.deepEqual(await page.evaluate(()=>DiagramEditor.getDocument()),d);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
}
async function checkShapeChanges(browser, url, artifacts) {
  const context=await browser.newContext({viewport:{width:1280,height:860},acceptDownloads:true});
  try {
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
    await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);
    const getDoc=()=>page.evaluate(()=>DiagramEditor.getDocument());
    const select=ids=>page.evaluate(ids=>DiagramEditor.select(ids),ids);
    const center=n=>({x:n.x+n.w/2,y:n.y+n.h/2});
    const original=Core.createTemplate('flow-branch'),first=original.nodes[1];first.text='点数を調べる\nscore ≥ 60';first.style.fill='#ffeeaa';
    await loadFixture(page,original);await select([first.id]);await openMenuFor(page,'#node-shape');assert.equal(await page.locator('#node-shape').inputValue(),'process');
    await page.locator('#node-shape').focus();await page.locator('#node-shape').selectOption('decision');let d=await getDoc(),converted=d.nodes.find(n=>n.id===first.id);
    assert.equal(converted.kind,'decision');assert.deepEqual(center(converted),center(first));assert.equal(converted.text,first.text);assert.deepEqual(converted.style,first.style);assert.deepEqual(d.edges,original.edges);
    assert.equal(await page.locator('#node-shape').evaluate(el=>el===document.activeElement),true,'Shape picker retains keyboard focus');
    const anchors=await page.evaluate(id=>{const d=DiagramEditor.getDocument();return d.edges.flatMap(e=>['from','to'].filter(end=>e[end].nodeId===id).map(end=>DiagramRender.edgeGeometry(d,e)[end]));},first.id);
    for(const p of anchors)assert.ok(Math.abs(Math.abs((p.x-center(converted).x)/(converted.w/2))+Math.abs((p.y-center(converted).y)/(converted.h/2))-1)<1e-8);
    await page.locator('#node-shape').press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#format-bar')&&document.activeElement.id!=='node-shape'),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#node-shape').evaluate(el=>el===document.activeElement),true);
    await page.locator('#undo').click();assert.deepEqual(await getDoc(),original);await page.locator('#redo').click();assert.deepEqual(await getDoc(),d);
    await page.screenshot({path:path.join(artifacts,`${browser.browserType().name()}-shape-change.png`),fullPage:true});

    await select([first.id,original.nodes[0].id]);await openMenuFor(page,'#node-shape');assert.equal(await page.locator('#node-shape').inputValue(),'');
    await page.locator('#node-shape').selectOption('process');let batch=await getDoc();
    for(const id of [first.id,original.nodes[0].id]){const n=batch.nodes.find(n=>n.id===id),old=d.nodes.find(n=>n.id===id);assert.equal(n.kind,'process');assert.deepEqual(center(n),center(old));assert.equal(n.text,old.text);}
    await page.locator('#undo').click();assert.deepEqual(await getDoc(),d);
    await select([first.id]);await openMenuFor(page,'#node-shape');await page.locator('#node-shape').selectOption('junction');assert.equal((await getDoc()).nodes.find(n=>n.id===first.id).text,first.text);
    await page.locator('#node-shape').selectOption('process');assert.equal(await page.locator(`[data-node="${first.id}"] text`).textContent(),first.text.replace('\n',''));

    const mixed=Core.createTemplate('flow-sequence');mixed.edges[0].kind='curve';mixed.edges[0].bend={x:440,y:70};mixed.edges[1].head='both';
    await loadFixture(page,mixed);await select([mixed.nodes[0].id,mixed.edges[0].id,mixed.edges[1].id]);await openMenuFor(page,'#shape-menu');
    assert.equal(await page.locator('#node-shape').isVisible(),true);assert.equal(await page.locator('#edge-kind').isVisible(),true);assert.equal(await page.locator('#edge-kind').inputValue(),'');assert.equal(await page.locator('#edge-head').inputValue(),'');
    await page.locator('#edge-kind').selectOption('curve');d=await getDoc();assert.deepEqual(d.nodes,mixed.nodes);assert.deepEqual(d.edges[0],mixed.edges[0]);assert.equal(d.edges[1].kind,'curve');
    await page.locator('#edge-head').selectOption('none');d=await getDoc();assert.ok(d.edges.slice(0,2).every(e=>e.head==='none'));assert.deepEqual(d.edges[0].bend,mixed.edges[0].bend);
    await page.locator('#node-shape').selectOption('decision');assert.deepEqual((await getDoc()).edges,d.edges);
    for(const width of [736,390]) {
      await page.setViewportSize({width,height:860});if(width<=736)await page.waitForFunction(()=>document.querySelector('.toolbar').dataset.compact==='true');await openMenuFor(page,'#settings-menu');await page.locator('#theme').selectOption('dark');await page.locator('#text-size').selectOption('largest');await page.locator('#settings-menu > summary').press('Escape');await openMenuFor(page,'#shape-menu');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      for(const id of ['node-shape','edge-kind','edge-head']){const box=await page.locator(`#${id}`).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,`${id} fits ${width}px`);}
    }
    await page.screenshot({path:path.join(artifacts,`${browser.browserType().name()}-shape-controls-mobile.png`),fullPage:true});
    await page.setViewportSize({width:1280,height:860});await openMenuFor(page,'#settings-menu');await page.locator('#text-size').selectOption('standard');await page.locator('#settings-menu > summary').press('Escape');

    const states=Core.createTemplate('state-device');await loadFixture(page,states);const state=states.nodes[0];await select([state.id]);await openMenuFor(page,'#node-shape');
    await page.locator('#node-shape').selectOption('state:round');d=await getDoc();assert.equal(d.nodes[0].variant,'round');assert.deepEqual(center(d.nodes[0]),center(state));assert.deepEqual(d.edges,states.edges);
    await page.locator('#node-shape').selectOption('state:circle');d=await getDoc();assert.equal(d.nodes[0].w,d.nodes[0].h);assert.deepEqual(center(d.nodes[0]),center(state));
    await openMenuFor(page,'#diagram-type');await page.locator('#diagram-type').selectOption('flowchart');await openMenuFor(page,'#node-shape');await page.locator('#node-shape').selectOption('process');assert.equal(await page.locator('#node-shape').inputValue(),'process');assert.equal(Object.hasOwn((await getDoc()).nodes[0],'variant'),false);
    const loop=states.edges.find(e=>e.from.nodeId===e.to.nodeId);await select([loop.id]);await openMenuFor(page,'#edge-kind');
    assert.equal(await page.locator('#edge-kind option[value=straight]').evaluate(el=>el.disabled),true);await page.locator('#edge-kind').selectOption('orthogonal');
    d=await getDoc();const after=d.edges.find(e=>e.id===loop.id);assert.deepEqual(after.from,loop.from);assert.deepEqual(after.to,loop.to);assert.deepEqual(after.label,loop.label);
    const geometry=()=>page.evaluate(id=>{const d=DiagramEditor.getDocument();return DiagramRender.edgeGeometry(d,d.edges.find(e=>e.id===id));},loop.id);
    let g=await geometry();assert.doesNotMatch(g.path,/[CQ]/);assert.ok(g.points.every((p,i)=>!i||p.x===g.points[i-1].x||p.y===g.points[i-1].y));
    await page.locator('#shape-menu > summary').press('Escape');
    const handle=await screenPoint(page,g.handle),dest=await screenPoint(page,{x:g.handle.x+50,y:g.handle.y});
    await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(dest.x,dest.y,{steps:6});await page.mouse.up();assert.ok((await geometry()).handle.x>g.handle.x+30);
    await page.locator('#undo').click();assert.deepEqual(await getDoc(),d);await openMenuFor(page,'#edge-kind');await page.locator('#edge-kind').selectOption('curve');assert.match((await geometry()).path,/C/);await page.locator('#undo').click();assert.equal((await getDoc()).edges.find(e=>e.id===loop.id).kind,'orthogonal');
    await page.locator('#zoom').selectOption('fit');await page.screenshot({path:path.join(artifacts,`${browser.browserType().name()}-orthogonal-loop.png`),fullPage:true});
    const final=await getDoc();let pending=page.waitForEvent('download');await page.locator('#file-menu > summary').click();await page.locator('#save-file').click();let download=await pending;
    const file=path.join(artifacts,`${browser.browserType().name()}-shape-changes.diagram.json`);await download.saveAs(file);assert.deepEqual(Core.parseDocument(JSON.parse(await fs.readFile(file,'utf8'))),final);
    await page.locator('[data-pane-button=export]').click();pending=page.waitForEvent('download');await page.locator('#export-svg').click();download=await pending;const svgFile=path.join(artifacts,`${browser.browserType().name()}-shape-changes.svg`);await download.saveAs(svgFile);
    const svg=await fs.readFile(svgFile,'utf8');assert.ok(svg.includes((await geometry()).path));assert.doesNotMatch(svg,/NaN|data-node=|#273442/);
    await page.reload();await restoreBrowserAuto(page);assert.deepEqual(await getDoc(),final);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
  const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try {
    const page=await touch.newPage();await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);
    const d=Core.createTemplate('flow-sequence');await loadFixture(page,d);
    await page.locator(`[data-node="${d.nodes[2].id}"]`).tap();await openMenuFor(page,'#node-shape');await page.locator('#node-shape').selectOption('decision');
    const changed=await page.evaluate(()=>DiagramEditor.getDocument());assert.equal(changed.nodes[2].kind,'decision');assert.deepEqual(changed.edges,d.edges);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  } finally {await touch.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
