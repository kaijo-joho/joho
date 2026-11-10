import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {copyFile, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium, webkit} = createRequire(import.meta.url)('playwright');
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const engine = process.env.HTML_PROJECT_PREVIEW_ENGINE || 'chromium';
const project = await mkdtemp('/private/tmp/html-editor-project-fixture-');
const evidence = process.env.HTML_PROJECT_PREVIEW_EVIDENCE || '/private/tmp/html-editor-project-preview-' + engine;
await mkdir(evidence, {recursive:true});
await Promise.all(['pages','styles','images'].map(name => mkdir(join(project,name))));

const html = (title, head, body) => '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>' +
  title + '</title>' + head + '</head><body>' + body + '</body></html>';
const stylesheet = href => '<link rel="stylesheet" href="' + href + '">';
const home = html('海辺の公園', stylesheet('styles/main.css') +
  '<style>.intro { background-image: url("images/park%20photo.png"); } /* url(comment.png) */</style>',
  '<header class="hero"><h1>海辺の公園</h1><p>海を眺めながら散歩できる展望広場です。</p></header>' +
  '<main class="intro"><p><a id="access" href="pages/access.html#arrival">アクセスを見る</a></p>' +
  '<img id="park" src="images/park%20photo.png" width="260" alt="展望広場">' +
  '<img id="icon" src="images/icon.svg" width="32" alt="案内アイコン">' +
  '<p id="inline" style="background-image: url(&quot;images/park%20photo.png&quot;)">公園の案内</p></main>');
const access = html('アクセス', stylesheet('../styles/main.css') +
  '<link rel="stylesheet" href="https://preview-untrusted.invalid/style.css">' +
  '<style>body { background-image: url("https://preview-untrusted.invalid/background.png"); }</style>',
  '<h1 id="arrival">アクセス</h1><a id="home" href="../index.html">トップへ戻る</a>' +
  '<img src="https://preview-untrusted.invalid/pixel.png" alt="外部画像">' +
  '<script>parent.document.body.dataset.studentScript = "ran";</script>');
const css = [
  '.hero { padding: 1.5rem; color: #12364e; background: #d1e6f0 url(../images/park\\ photo.png) center / cover; }',
  '.intro { padding: 1rem; background-size: 180px auto; }',
  '.hero::after { content: "url(literal.png)"; display: none; }'
].join('\n');
await Promise.all([
  writeFile(join(project,'index.html'),home), writeFile(join(project,'pages/access.html'),access),
  writeFile(join(project,'styles/main.css'),css),
  writeFile(join(project,'images/icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="#146d7b"/></svg>'),
  copyFile(join(root,'html/images/seaside-park.png'),join(project,'images/park photo.png'))
]);
const types = {'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const fixturePrefix = '/__project/';
    const directory = path.startsWith(fixturePrefix) ? project : root;
    const file = resolve(directory, '.' + (directory === project ? path.slice(fixturePrefix.length - 1) : path));
    if (!file.startsWith(directory + sep)) throw new Error('outside test root');
    const bytes = await readFile(file);
    response.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream'}).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(0,'127.0.0.1',done); });
const origin = 'http://127.0.0.1:' + server.address().port;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch(existsSync(chrome) ? {executablePath:chrome} : {});
const report = {engine, checks:[], errors:[], untrustedRequests:[]};
const context = await browser.newContext({viewport:{width:1200,height:880}});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname === 'preview-untrusted.invalid') report.untrustedRequests.push(url.pathname);
  return url.origin === origin || ['about:', 'blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort();
});
const consoleErrors = [];
context.on('page', tab => {
  tab.on('pageerror', error => report.errors.push(error.message));
  tab.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
});
const page = await context.newPage();
let popup;
if (engine === 'chromium') {
  await page.addInitScript(() => {
    // テスト専用のフォルダ。実際のMacのファイル選択・保存許可には触れない。
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('HTML最終課題',{create:true});
    window.putProjectFile = async (path, url) => {
      const parts = path.split('/');
      let directory = await window.showDirectoryPicker();
      for (const part of parts.slice(0,-1)) directory = await directory.getDirectoryHandle(part,{create:true});
      const file = await directory.getFileHandle(parts.at(-1),{create:true});
      const writer = await file.createWritable();
      await writer.write(await (await fetch(url)).blob());
      await writer.close();
    };
  });
}
const frame = (tab, id) => tab.frameLocator('#' + id);
const finderButton = tab => tab.locator('#projectPreviewFinder summary');
const finderPath = tab => tab.locator('#projectPreviewFinderPath');
const finderUnsaved = tab => tab.locator('#projectPreviewFinderUnsaved');
const folderPrefix = engine === 'chromium' ? 'HTML最終課題 / ' : '';
async function openViewer() {
  const pending = context.waitForEvent('page');
  await page.locator('#openPreviewTabBtn').click();
  const tab = await pending;
  await tab.locator('#projectPreviewFile').filter({hasText:/^index\.html$/}).waitFor();
  await page.waitForFunction(() => !document.querySelector('#app').hasAttribute('aria-busy'));
  return tab;
}
async function waitImage(tab, id, width) {
  await tab.waitForFunction(({id,width}) => {
    const image = document.getElementById(id).contentDocument?.querySelector('#park');
    return image?.complete && image.naturalWidth === width;
  }, {id,width});
}
async function backgrounds(tab, id) {
  return frame(tab,id).locator('.hero').evaluate(async hero => {
    const doc = hero.ownerDocument;
    const nodes = [hero, doc.querySelector('.intro'), doc.querySelector('#inline')];
    return Promise.all(nodes.map(async node => {
      const url = /^url\("([^"]+)"\)$/.exec(getComputedStyle(node).backgroundImage)?.[1];
      if (!url?.startsWith('blob:')) return 0;
      const image = doc.createElement('img');
      image.src = url;
      await image.decode();
      return image.naturalWidth;
    }));
  });
}
try {
  await page.goto(origin+'/tools/htmleditor/index.html?lesson=html25');
  await page.waitForSelector('#app:not([hidden])');
  if (engine === 'chromium') {
    await page.evaluate(async () => {
      for (const path of ['index.html','pages/access.html','styles/main.css','images/icon.svg']) await window.putProjectFile(path,'/__project/'+path);
    });
    await page.locator('#connectFolderBtn').click();
  } else await page.locator('#directoryInput').setInputFiles(project);
  await page.getByRole('button',{name:'index.html',exact:true}).click();
  await frame(page,'previewIframe').getByRole('heading',{name:'海辺の公園'}).waitFor();
  await page.waitForFunction(() => !document.querySelector('#app').hasAttribute('aria-busy'));
  popup = await openViewer();
  await finderButton(popup).click();
  assert.equal(await finderPath(popup).innerText(),folderPrefix+'index.html');
  assert.equal(await finderUnsaved(popup).isHidden(),true);
  await popup.close();
  await page.evaluate(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    const start = cm.getValue().indexOf('<h1>') + 4;
    cm.replaceRange('の見どころ', cm.posFromIndex(start + '海辺の公園'.length));
  });
  const editorState = () => page.evaluate(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    return {text:cm.getValue(), history:cm.historySize(), file:document.querySelector('#currentFileLabel').textContent};
  });
  const edited = await editorState();
  if (engine === 'chromium') {
    assert.equal(await frame(page,'previewIframe').locator('#park').getAttribute('src'),null);
    await page.evaluate(() => window.putProjectFile('images/park photo.png','/__project/images/park%20photo.png'));
    await page.locator('#runBtn').click();
    await waitImage(page,'previewIframe',1536);
    await page.waitForFunction(() => !document.querySelector('#app').hasAttribute('aria-busy'));
    assert.deepEqual(await editorState(),edited);
    await page.evaluate(() => window.putProjectFile('images/park photo.png','/html/images/evolution_of_internet.png'));
    await page.locator('#runBtn').click();
    await page.waitForFunction(() => {
      const image = document.querySelector('#previewIframe').contentDocument?.querySelector('#park');
      return image?.complete && image.naturalWidth === 1024;
    });
    await page.waitForFunction(() => !document.querySelector('#app').hasAttribute('aria-busy'));
    const replacementWidth = await frame(page,'previewIframe').locator('#park').evaluate(image => image.naturalWidth);
    assert.deepEqual(await backgrounds(page,'previewIframe'),[replacementWidth,replacementWidth,replacementWidth]);
    await page.evaluate(async () => {
      const images = await (await window.showDirectoryPicker()).getDirectoryHandle('images');
      await images.removeEntry('park photo.png');
    });
    await page.locator('#runBtn').click();
    await page.waitForFunction(() => document.querySelector('#previewIframe').contentDocument?.querySelector('#park')?.getAttribute('src') === null);
    await page.waitForFunction(() => !document.querySelector('#app').hasAttribute('aria-busy'));
    assert.match(await page.locator('#previewNotice').innerText(),/images\/park%20photo\.png/);
    assert.deepEqual(await editorState(),edited);
    assert.equal(await page.evaluate(async () => (await (await (await window.showDirectoryPicker()).getFileHandle('index.html')).getFile()).text()),home);
    await page.evaluate(() => window.putProjectFile('images/park photo.png','/__project/images/park%20photo.png'));
    report.checks.push('Folder refresh updates added, replaced and removed images and preserves editor and disk contents');
  }
  await page.locator('#runBtn').click();
  await waitImage(page,'previewIframe',1536);
  assert.deepEqual(await backgrounds(page,'previewIframe'),[1536,1536,1536]);
  await page.waitForFunction(() => !document.querySelector('#app').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#previewNotice').isHidden(),true);
  report.checks.push('Inline, HTML style and linked CSS images load and CSS strings and comments are ignored');

  popup = await openViewer();
  await waitImage(popup,'projectPreviewFrame',1536);
  const banner = popup.getByRole('banner',{name:'作品プレビュー'});
  await banner.getByText('未保存の編集を含みます').waitFor();
  await frame(popup,'projectPreviewFrame').getByRole('heading',{name:'海辺の公園の見どころ'}).waitFor();
  assert.deepEqual(await backgrounds(popup,'projectPreviewFrame'),[1536,1536,1536]);
  assert.equal(await popup.evaluate(() => window.opener === null),true);
  const bannerSize = () => banner.evaluate(node => ({width:node.getBoundingClientRect().width,viewport:innerWidth,color:getComputedStyle(node).backgroundColor}));
  const wide = await bannerSize();
  assert.equal(wide.width,wide.viewport);
  assert.equal(wide.color,'rgb(12, 76, 131)');
  await popup.screenshot({path:join(evidence,'project-preview.png'),clip:{x:0,y:0,width:1200,height:420}});
  const guide = popup.locator('.finder-guide');
  const work = popup.locator('#projectPreviewFrame');
  const workBounds = await work.boundingBox();
  assert.equal(await guide.isHidden(),true);
  assert.equal(await finderButton(popup).textContent(),'ⓘ Finderで開く方法');
  await finderButton(popup).focus();
  await popup.keyboard.press('Enter');
  assert.equal(await guide.isVisible(),true);
  assert.equal(await finderPath(popup).innerText(),folderPrefix+'index.html');
  assert.equal(await finderUnsaved(popup).innerText(),'Finderから開くと、最後に保存した内容が表示されます。');
  assert.equal(await finderUnsaved(popup).isVisible(),true);
  assert.match(await guide.innerText(),/⌘S[\s\S]*「このアプリケーションで開く」から Chrome または Safari/);
  assert.deepEqual(await work.boundingBox(),workBounds);
  const buttonBounds = await finderButton(popup).boundingBox();
  assert.equal(buttonBounds.x + buttonBounds.width,wide.width-16);
  await popup.screenshot({path:join(evidence,'project-preview-finder-guide.png'),clip:{x:0,y:0,width:1200,height:420}});
  await popup.keyboard.press('Escape');
  assert.equal(await guide.isHidden(),true);
  assert.equal(await finderButton(popup).evaluate(node => document.activeElement === node),true);
  await popup.setViewportSize({width:390,height:760});
  const narrow = await bannerSize();
  assert.equal(narrow.width,narrow.viewport);
  await finderButton(popup).click();
  const guideBounds = await guide.boundingBox();
  assert.ok(guideBounds.x >= 0 && guideBounds.x + guideBounds.width <= narrow.width);
  assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth),narrow.width);
  await finderButton(popup).click();
  await page.close();
  const view = frame(popup,'projectPreviewFrame');
  await view.locator('#access').click();
  await view.getByRole('heading',{name:'アクセス',exact:true}).waitFor({timeout:6000});
  assert.equal(await popup.locator('#projectPreviewFile').textContent(),'pages/access.html');
  await finderButton(popup).click();
  assert.equal(await finderPath(popup).innerText(),folderPrefix+'pages/access.html');
  await finderButton(popup).click();
  assert.equal(await view.locator('script').count(),0);
  assert.equal(await popup.evaluate(() => document.body.dataset.studentScript),undefined);
  await view.locator('#home').click();
  await view.getByRole('heading',{name:'海辺の公園の見どころ'}).waitFor();
  await waitImage(popup,'projectPreviewFrame',1536);
  assert.equal(await finderPath(popup).textContent(),folderPrefix+'index.html');
  report.checks.push('Blue banner spans both widths and links and local images survive closing the editor');
  report.checks.push('Finder guide stays inside both widths and follows links, with keyboard controls and an unsaved-only note');
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.untrustedRequests,[]);
  report.checks.push('No page exceptions, student scripts or remote asset requests');
} catch (error) {
  report.failure = error.message;
  report.console = consoleErrors;
  if (popup) {
    report.viewer = await popup.evaluate(() => {
      const frame = document.querySelector('#projectPreviewFrame');
      return {notice:document.querySelector('#projectPreviewNotice')?.textContent,
        title:document.title, rendered:frame?.srcdoc.slice(-1000), frameUrl:frame?.contentDocument?.URL,
        frameText:frame?.contentDocument?.body?.innerText, frameTitle:frame?.contentDocument?.title};
    }).catch(() => null);
  }
  throw error;
} finally {
  await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));
  await context.close();
  await browser.close();
  await new Promise(done => server.close(done));
}
console.log(JSON.stringify(report));
