const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
class Element {
 constructor(tag, document) { this.tag = tag; this.document = document; this.children = []; this.events = {}; this.attrs = {}; this.hidden = false; this.downloads = []; this.blockClick = false; }
 append(n) { this.children.push(n); }
 setAttribute(k, v) { this.attrs[k] = v; }
 removeAttribute(k) { delete this.attrs[k]; delete this[k]; }
 addEventListener(k, f) { this.events[k] = f; }
 focus() { this.document.activeElement = this; }
 click() {
  if (this.blockClick) throw Error('browser blocked download');
  let prevented = false;
  this.events.click?.({preventDefault() { prevented = true; }});
  if (!prevented) this.downloads.push({url: this.href, name: this.download});
 }
}
function setup() {
 let sequence = 0, resolve;
 const revoked = [], calls = [], blobs = new Map();
 const document = {activeElement: null, createElement: t => new Element(t, document)};
 const context = {document, Blob, TextEncoder, URL: {
  createObjectURL: blob => { const url = 'blob:' + (++sequence); blobs.set(url, blob); return url; }, revokeObjectURL: u => revoked.push(u)
 }, HtmlLocalProtocol: {}, HtmlConfirmationCoordinator: {create: () => ({})}, crypto: require('node:crypto').webcrypto};
 vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../local-downloads.js'), 'utf8'), context);
 const container = new Element('div', document), cache = {};
 const provider = {generateFresh(id) {
  calls.push(id);
  return new Promise((r, j) => { resolve = (error, fileName = id + '.html') => error ? j(Error('test failure')) : r({html: 'fresh:' + id + ':' + sequence, fileName}); });
 }};
 const panel = context.HtmlEditorLocalDownloads.create({codec: {}, cache, provider, locks: {}}).createPanel({container, lesson: {
  title: '実習', files: ['html13-01', 'html13-02'].map(id => ({id, fileName: id + '.html'}))
 }});
 const walk = n => [n, ...n.children.flatMap(walk)], rows = walk(container).filter(n => n.tag === 'section');
 return {panel, rows, calls, revoked, blobs, document, finish: (...args) => resolve(...args),
  buttons: rows.map(r => walk(r).find(n => n.tag === 'button')),
  links: rows.map(r => walk(r).find(n => n.tag === 'a')),
  statuses: rows.map(r => walk(r).find(n => n.attrs.role === 'status'))};
}
test('one click fetches and starts one named download, leaving only a small retry link', async () => {
 const h = setup(); h.buttons[0].focus(); const p = h.buttons[0].events.click();
 assert.equal(h.buttons[0].disabled, true); assert.equal(h.links[0].downloads.length, 0);
 h.finish(); await p;
 assert.deepEqual(h.calls, ['html13-01']);
 assert.deepEqual(h.links[0].downloads, [{url: h.links[0].href, name: 'html13-01.html'}]);
 assert.equal(await h.blobs.get(h.links[0].href).text(), 'fresh:html13-01:0');
 assert.equal(h.buttons[0].hidden, true); assert.equal(h.links[0].hidden, false);
 assert.equal(h.links[0].className, 'local-download-retry'); assert.equal(h.document.activeElement, h.links[0]);
 assert.match(h.statuses[0].textContent, /保存を開始しました/); assert.match(h.statuses[0].textContent, /書類／HTML実習/);
 assert.doesNotMatch(h.statuses[0].textContent, /保存しました/);
 await h.buttons[0].events.click(); assert.equal(h.calls.length, 1);
});
test('fallback save uses the already fetched bytes without new issuance or network request', async () => {
 const h = setup(); const p = h.buttons[0].events.click(); h.finish(); await p;
 const original = h.links[0].downloads[0]; h.links[0].click();
 assert.deepEqual(h.links[0].downloads, [original, original]); assert.equal(h.calls.length, 1);
 assert.deepEqual(h.revoked, []);
});
test('two files keep their own save links and dispose revokes each blob', async () => {
 const h = setup(); let p = h.buttons[0].events.click(); h.finish(); await p;
 const first = h.links[0].href; assert.equal(h.links[1].hidden, true);
 p = h.buttons[1].events.click(); h.finish(); await p;
 const second = h.links[1].href;
 assert.notEqual(first, second); assert.equal(h.links[1].download, 'html13-02.html');
 assert.equal(h.links[0].href, first); assert.equal(h.links[0].downloads.length, 1);
 h.panel.dispose(); assert.deepEqual(h.revoked, [first, second]);
 for (const link of h.links) { assert.equal(link.hidden, true); assert.equal(link.href, undefined); link.click(); assert.equal(link.downloads.length, 1); }
});
test('double click and concurrent file request do not duplicate downloads', async () => {
 const h = setup(); const p = h.buttons[0].events.click();
 await h.buttons[0].events.click(); await h.buttons[1].events.click(); assert.equal(h.calls.length, 1);
 h.finish(); await p; assert.equal(h.links[0].downloads.length, 1); assert.equal(h.links[1].downloads.length, 0);
});
test('fetch failure can retry and mismatched names never create a download', async () => {
 const h = setup(); let p = h.buttons[0].events.click(); h.finish(true); await p;
 assert.equal(h.buttons[0].hidden, false); assert.equal(h.buttons[0].disabled, false);
 assert.equal(h.links[0].hidden, true); assert.equal(h.links[0].downloads.length, 0);
 p = h.buttons[0].events.click(); h.finish(false, 'wrong.html'); await p;
 assert.equal(h.links[0].href, undefined); assert.match(h.statuses[0].textContent, /file_name_mismatch/);
 p = h.buttons[0].events.click(); h.finish(); await p; assert.equal(h.links[0].downloads.length, 1);
});
test('closed dialog discards a pending response without starting a download', async () => {
 const h = setup(); const p = h.buttons[0].events.click(); h.panel.dispose(); h.finish(); await p;
 assert.equal(h.links[0].hidden, true); assert.equal(h.links[0].href, undefined);
 assert.equal(h.links[0].downloads.length, 0); assert.equal(h.blobs.size, 0);
 await h.buttons[0].events.click(); assert.equal(h.calls.length, 1);
});
test('blocked automatic click leaves the same file available for explicit retry', async () => {
 const h = setup(); h.links[0].blockClick = true;
 const p = h.buttons[0].events.click(); h.finish(); await p;
 assert.equal(h.buttons[0].hidden, true); assert.equal(h.links[0].hidden, false);
 assert.equal(h.links[0].downloads.length, 0); assert.match(h.statuses[0].textContent, /もう一度保存/);
 h.links[0].blockClick = false; h.links[0].click(); assert.equal(h.links[0].downloads.length, 1);
 assert.equal(h.calls.length, 1);
});
