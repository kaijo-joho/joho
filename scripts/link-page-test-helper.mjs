import fs from 'node:fs';
import vm from 'node:vm';

export const html = fs.readFileSync(new URL('../link.html', import.meta.url), 'utf8');
export const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const names = ['quizzes', 'submitForms', 'reviewForms', 'pubFiles', 'notices', 'files', 'urls'];

// VMだけで実行し、外部通信・GAS発行・実ブラウザの転送は行わない。
export async function runLinkPage(query, options = {}) {
  const nodes = [], redirects = [], requests = [], events = {}, timers = new Map();
  const create = tag => {
    const node = { tag, children: [], appendChild(child) { this.children.push(child); } };
    nodes.push(node); return node;
  };
  const value = Object.hasOwn(options, 'jsonValue') ? options.jsonValue : {
    schemaVersion: 1, generatedAt: '2026-10-20T07:04:32.021Z',
    collections: Object.assign(Object.fromEntries(names.map(name => [name, {}])), options.collections)
  };
  const body = create('body'), main = create('main');
  body.appendChild(main);
  const context = {
    URL, AbortController, console: { debug() {}, error() {} },
    location: { href: 'https://joho.kaijo.ed.jp/link.html?' + query, replace(url) { redirects.push(url); } },
    window: { pages: options.pages || {}, ...options.legacyWindow, addEventListener(name, action) { events[name] = action; } },
    document: { createElement: create, body, getElementById(id) { return id === 'main-content' ? main : null; } },
    setTimeout(callback, delay) { const id = timers.size + 1; timers.set(id, {callback, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, request) {
      requests.push({url, request});
      if (options.fetchError) throw new Error('Network unavailable');
      if (options.timeout) {
        return new Promise((resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('Aborted')), {once:true});
          queueMicrotask(() => [...timers.values()][0].callback());
        });
      }
      return { ok: !options.status || options.status === 200, status: options.status || 200,
        async json() { if (options.jsonError) throw new SyntaxError('Invalid JSON'); return value; } };
    }
  };
  vm.runInNewContext(script, context);
  await events.DOMContentLoaded();
  return { nodes, redirects, requests, timers, title: context.document.title };
}
