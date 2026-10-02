import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../link.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const pagesSource = fs.readFileSync(new URL('../js/pages.js', import.meta.url), 'utf8');
const data = { window: {} };
vm.runInNewContext(pagesSource, data);
const pages = data.window.pages;
function run(query, catalog = pages, dictionaries = {}) {
  const nodes = [], redirects = [], events = {};
  const create = tag => {
    const node = { tag, children: [], appendChild(child) { this.children.push(child); } };
    nodes.push(node); return node;
  };
  const context = {
    URL, console: { debug() {}, error() {} },
    location: { href: 'https://joho.kaijo.ed.jp/link.html?' + query, replace(url) { redirects.push(url); } },
    window: { pages: catalog, ...dictionaries, addEventListener(name, action) { events[name] = action; } },
    document: { createElement: create, body: create('body') }
  };
  vm.runInNewContext(script, context);
  events.DOMContentLoaded();
  return { nodes, redirects };
}
for (const id of ['html11-01', 'html12-01']) {
  test(id + ': published catalog resolves to school-domain GET only', () => {
    const result = run('dl=' + id);
    assert.equal(result.redirects.length, 1);
    const url = new URL(result.redirects[0]);
    assert.equal(url.origin, 'https://script.google.com');
    assert.match(url.pathname, /^\/a\/macros\/gfe\.kaijo\.ed\.jp\/s\/[^/]+\/exec$/);
    assert.equal(url.searchParams.get('target'), id);
    assert.equal(url.searchParams.get('type'), 'htmlPractice');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['target', 'type']);
    assert.equal(result.nodes.find(n => n.tag === 'a').href, url.href);
    assert.equal(run('dl=' + id + '&redirect=0').redirects.length, 0);
  });
}
test('invalid IDs do not redirect or fall back to other dictionaries', () => {
  for (const id of ['', 'html13-01', '__proto__', 'https://example.org/']) {
    const result = run('dl=' + encodeURIComponent(id) + '&id=legacy', pages, {urls:{legacy:{url:'https://example.org/'}}});
    assert.equal(result.redirects.length, 0);
    assert.ok(result.nodes.some(n => n.textContent?.includes('配付リンクを確認できません')));
  }
});
const one = pages.html11.practiceFile[0];
test('unpublished, missing, duplicate or malformed catalog fails closed', () => {
  const cases = [ {}, { a:{practiceFile:[{...one,release:false}]} },
    {a:{practiceFile:[one,one]}}, ...[
      'https://example.org/exec?type=htmlPractice&target=html11-01',
      one.url + '&ans=1', one.url + '&target=html11-01',
      one.url.replace('html11-01','html12-01'), one.url + '#unsafe'
    ].map(url => ({a:{practiceFile:[{...one,url}]}})) ];
  for (const catalog of cases) assert.equal(run('dl=html11-01', catalog).redirects.length, 0);
});
test('existing school-domain catalog is preserved', () => {
  const url = one.url.replace('/macros/s/', '/a/macros/gfe.kaijo.ed.jp/s/');
  assert.equal(run('dl=html11-01', {a:{practiceFile:[{...one,url}]}}).redirects[0], url);
});
test('legacy URL redirect and redirect=0 remain unchanged', () => {
  const dictionaries = { urls: { legacy: { title:'従来リンク', url:'https://example.org/legacy' } } };
  assert.deepEqual(run('u=legacy', {}, dictionaries).redirects, ['https://example.org/legacy']);
  assert.equal(run('u=legacy&redirect=0', {}, dictionaries).nodes.find(n=>n.tag==='a').href, 'https://example.org/legacy');
  assert.equal(run('', {}, dictionaries).redirects.length, 0);
});
test('catalog is loaded before main and no issuance API is present', () => {
  assert.ok(html.indexOf('src="./js/pages.js"') < html.indexOf('src="./js/main.js"'));
  assert.doesNotMatch(script, /issueHtmlPractice|google\.script\.run|fetch\(|XMLHttpRequest/);
});
