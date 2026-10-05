const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const Routing = require('../routing.js');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'js/html_practice_view.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'tools/htmleditor/index.html'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup({href = 'https://joho.kaijo.ed.jp/html11.html', body = shell, response = {}, fail = false, pending = false} = {}) {
  const nodes = [], events = {}, redirects = [], fetches = [], timers = [];
  let observe;
  function node(tag) {
    const n = {tagName:tag.toUpperCase(), children:[], style:{}, hidden:false, textContent:'', listeners:{},
      append(child) { this.children.push(child); }, prepend(child) { this.children.unshift(child); },
      setAttribute(k,v) { this[k] = v; }, addEventListener(k,f) { this.listeners[k] = f; }};
    nodes.push(n); return n;
  }
  const doc = {readyState:'complete', body:node('body'), createElement:node, querySelectorAll:() => []};
  doc.body.dataset = {htmlEditorEntry:'candidate'};
  const ctx = {document:doc, URL, AbortController, HtmlEditorRouting:Routing,
    DOMParser:class {
      parseFromString(html, type) {
        assert.equal(type, 'text/html');
        const tag = html.replace(/<!--[\s\S]*?-->/g, '').match(/<html\b[^>]*>/i)?.[0] || '';
        const attrs = new Map([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1],m[3]]));
        return {documentElement:{getAttribute:name => attrs.get(name) ?? null}};
      }
    },
    location:{href, replace:u => redirects.push(u)}, history:{replaceState:(_a,_b,u) => ctx.location.href = u},
    addEventListener:(k,f) => events[k] = f,
    MutationObserver:class { constructor(fn) { observe = fn; } observe() {} },
    setTimeout:f => { timers.push(f); return timers.length; }, clearTimeout() {},
    fetch:async (url, options) => {
      fetches.push({url, options});
      if (fail) throw Error('network');
      if (pending) return new Promise((_resolve,reject) => options.signal.addEventListener('abort', () => reject(Error('abort'))));
      return {ok:true, url, headers:{get:() => 'text/html'}, text:async () => body, ...response};
    }};
  ctx.window = ctx; ctx.parent = ctx;
  vm.runInNewContext(source, ctx);
  return {nodes, events, redirects, fetches, timers, doc, observe:() => observe(),
    id:id => nodes.find(n => n.id === id), retry:() => nodes.find(n => n.tagName === 'BUTTON'),
    setPending:value => pending = value, setFail:value => fail = value};
}

test('確認済み旧版と現行版は全10教材の同lesson/taskへ自動遷移する', async () => {
  for (const build of ['html-editor-v3-20261002-enabled', 'html-editor-account-name-20261004']) {
    for (const lesson of Routing.entryLessonIds) {
      const h = setup({href:`https://joho.kaijo.ed.jp/${lesson}.html`, body:`<html data-html-editor-shell="1" data-html-editor-build="${build}">`});
      await tick(); assert.equal(h.redirects.length, 1);
      const url = new URL(h.redirects[0]);
      assert.equal(url.searchParams.get('lesson'), lesson);
      assert.equal(url.searchParams.get('task'), `${lesson}-01`);
      assert.equal(h.fetches[0].options.cache, 'no-store');
    }
  }
});

test('現行shellの入口互換性番号で自動起動する', async () => {
  const h = setup(); await tick(); assert.equal(h.redirects.length, 1);
});

test('見た目のbuild名が変わっても入口仕様が同じなら全10教材で自動起動する', async () => {
  const futureShell = shell.replace(/data-html-editor-build="[^"]+"/, 'data-html-editor-build="html-editor-future-ui"');
  for (const lesson of Routing.entryLessonIds) {
    const h = setup({href:`https://joho.kaijo.ed.jp/${lesson}.html`, body:futureShell}); await tick();
    assert.deepEqual(h.redirects, [`https://joho.kaijo.ed.jp/tools/htmleditor/index.html?lesson=${lesson}&task=${lesson}-01`]);
  }
});

test('未知の入口仕様、未確認旧版、shellなし、404、別配備、非HTMLは手動リンクと再試行を残す', async () => {
  for (const options of [
    {body:shell.replace('data-html-editor-entry-version="1"', 'data-html-editor-entry-version="2"')},
    {body:shell.replace('data-html-editor-entry-version="1"', 'data-html-editor-entry-version=""')},
    {body:'<html data-html-editor-shell="1" data-html-editor-build="unknown">'},
    {body:'data-html-editor-build="html-editor-account-name-20261004"'},
    {body:'<!-- ' + shell + ' --><html>'},
    {response:{ok:false}}, {response:{url:'https://example.org/'}},
    {response:{headers:{get:() => 'text/plain'}}}, {fail:true}
  ]) {
    const h = setup(options); await tick(); assert.equal(h.redirects.length, 0);
    assert.equal(h.retry().hidden, false);
    assert.match(h.id('htmlPracticeEditorLink').href, /lesson=html11&task=html11-01$/);
    assert.ok(h.nodes.some(n => n.textContent.includes('編集済みのファイルは取得し直さず')));
  }
});

test('解説専用、未知引数、別教材task、重複引数、対象外ページは自動起動しない', async () => {
  for (const suffix of ['html11.html?view=lesson', 'html12.html?task=html11-01', 'html11.html?unknown=1',
    'html11.html?task=html11-01&task=html11-01', 'html18.html']) {
    const h = setup({href:'https://joho.kaijo.ed.jp/' + suffix}); await tick();
    assert.equal(h.fetches.length, 0); assert.equal(h.redirects.length, 0);
  }
});

test('4秒超のabort後も再試行でき、解説を読む選択で遷移しない', async () => {
  const h = setup({pending:true}); h.timers[0](); await tick();
  assert.equal(h.redirects.length, 0); assert.equal(h.retry().hidden, false);
  h.setPending(false); await h.retry().listeners.click();
  assert.equal(h.redirects.length, 1);
  const stay = setup({pending:true});
  stay.id('htmlPracticeStay').listeners.click({button:0, preventDefault() {}}); await tick();
  assert.equal(stay.redirects.length, 0); assert.equal(stay.retry().hidden, true);
});

test('pagehideで確認を停止し、BFCache復帰後は手動再試行できる', async () => {
  const h = setup({pending:true}); h.events.pagehide(); await tick();
  h.events.pageshow({persisted:true}); assert.equal(h.retry().hidden, false);
  h.setPending(false); await h.retry().listeners.click(); assert.equal(h.redirects.length, 1);
});

test('後から生成された取得ボタンだけ同課題のエディタへ揃え、提出・別教材・不正taskを維持', () => {
  const h = setup({href:'https://joho.kaijo.ed.jp/html13.html?view=lesson'});
  function entry(task) {
    const link = {href:'https://script.google.com/legacy', setAttribute(k,v) { this[k] = v; }};
    return {link, querySelector:selector => selector.includes('filename') ? {textContent:task + '.html'} : link};
  }
  const rows = [entry('html13-02'), entry('html11-01'), entry('html13-99')];
  h.doc.querySelectorAll = () => rows; h.observe();
  assert.match(rows[0].link.href, /lesson=html13&task=html13-02$/);
  assert.equal(rows[0].link.textContent, 'エディタで開いて取得');
  assert.equal(rows[1].link.href, 'https://script.google.com/legacy');
  assert.equal(rows[2].link.href, 'https://script.google.com/legacy');
});

test('全10HTMLの入口version/SRIと全ローカルSRIが実bytesに一致する', () => {
  const digest = bytes => 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64');
  for (const lesson of Routing.entryLessonIds) {
    const html = fs.readFileSync(path.join(root, lesson + '.html'), 'utf8');
    assert.match(html, /html_practice_view\.js\?v=html-editor-entry-compat-1-20261005/);
    for (const match of html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^"]*)?" integrity="([^"]+)"/g)) {
      assert.equal(match[2], digest(fs.readFileSync(path.join(root, match[1]))), lesson + ': ' + match[1]);
    }
  }
});
