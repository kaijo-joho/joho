import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const script = fs.readFileSync(new URL('../js/tasks_redirect.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../tasks.html', import.meta.url), 'utf8');
const directoryEntry = fs.readFileSync(new URL('../tasks/index.html', import.meta.url), 'utf8');
const published = JSON.parse(fs.readFileSync(new URL('../data/links.json', import.meta.url), 'utf8'));
const target = published.collections.urls.taskstatus;
const fixture = item => ({ schemaVersion: 1, generatedAt: '2026-11-16T00:00:00.000Z', collections: { urls: { taskstatus: item } } });

async function run({ url = 'https://example.test/tasks', data = published, status = 200, jsonError, fetchError, timeout, navigationError } = {}) {
  const requests = [], redirects = [], timers = new Map();
  const nodes = Object.fromEntries(['status', 'fallback', 'link', 'recovery', 'retry'].map(name => ['tasks-' + name, {
    hidden: ['fallback', 'recovery'].includes(name), textContent: '', handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    removeAttribute(name) { delete this[name]; }
  }]));
  const context = {
    URL, AbortController,
    location: { href: url, replace(value) { if (navigationError) throw new Error('Navigation blocked'); redirects.push(value); } },
    document: { currentScript: { src: 'https://example.test/js/tasks_redirect.js?v=20261116' }, getElementById(id) { return nodes[id]; } },
    setTimeout(callback, delay) { const id = timers.size + 1; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(value, options) {
      requests.push({ url: value, options });
      if (fetchError) throw new Error('Offline');
      if (timeout) return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        queueMicrotask(() => [...timers.values()][0].callback());
      });
      return { ok: status === 200, status, async json() { if (jsonError) throw new SyntaxError('Invalid JSON'); return data; } };
    }
  };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, requests, redirects, timers, async retry() { await nodes['tasks-retry'].handlers.click(); } };
}

test('both static entries use the same controller and root-relative assets', () => {
  assert.equal(directoryEntry.replaceAll('../', './'), entry);
  for (const html of [entry, directoryEntry]) {
    assert.match(html, /name="robots" content="noindex"/);
    assert.match(html, /name="referrer" content="no-referrer"/);
    assert.match(html, /js\/display_settings\.js/);
    assert.match(html, /<noscript>/);
    assert.doesNotMatch(html, /script\.google\.com|js\/main\.js|meta[^>]+http-equiv/i);
  }
});

test('published taskstatus is the only destination for every entry path', async () => {
  for (const path of ['/tasks', '/tasks/', '/tasks.html', '/tasks/index.html']) {
    const result = await run({ url: 'https://example.test' + path + '?teacher=true&next=https%3A%2F%2Fevil.test%2F#private' });
    assert.deepEqual(result.redirects, [target.url]);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].url, 'https://example.test/data/links.json');
    assert.equal(result.requests[0].options.cache, 'no-cache');
    assert.equal(result.requests[0].options.credentials, 'omit');
    assert.equal(result.requests[0].options.redirect, 'error');
    assert.equal(result.requests[0].options.referrerPolicy, 'no-referrer');
    assert.equal(result.timers.size, 0);
  }
});

test('redirect=0 displays the verified manual link using text only', async () => {
  const title = '<img src=x onerror=alert(1)>';
  const result = await run({ url: 'https://example.test/tasks?redirect=0', data: fixture({ ...target, title }) });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.nodes['tasks-link'].href, target.url);
  assert.equal(result.nodes['tasks-link'].textContent, title + 'を開く');
  assert.equal(result.nodes['tasks-fallback'].hidden, false);
  assert.equal(result.nodes['tasks-recovery'].hidden, true);
  assert.doesNotMatch(script, /innerHTML|localStorage|postMessage|js\/links\.js/);
});

test('network, HTTP, JSON and timeout errors stay on the entry and allow retry', async () => {
  for (const options of [{ fetchError: true }, { status: 404 }, { status: 500 }, { jsonError: true }, { timeout: true }]) {
    const result = await run(options);
    assert.deepEqual(result.redirects, []);
    assert.equal(result.nodes['tasks-fallback'].hidden, true);
    assert.equal(result.nodes['tasks-recovery'].hidden, false);
    assert.equal(result.nodes['tasks-retry'].disabled, false);
    assert.equal(result.nodes['tasks-link'].href, undefined);
    assert.equal(result.timers.size, 0);
    await result.retry();
    assert.equal(result.requests.length, 2);
  }
});

test('invalid or missing catalog data never navigates or exposes a link', async () => {
  const invalid = [null, {}, { ...published, schemaVersion: 2 }, { ...published, generatedAt: '2026-11-16' },
    { ...published, collections: [] }, { ...published, collections: { urls: {} } }, fixture(null), fixture({ ...target, title: '' }),
    ...['javascript:alert(1)', 'http://script.google.com/macros/s/id/exec', 'https://evil.test/macros/s/id/exec',
      'https://script.google.com/macros/s/id/dev', 'https://user:pass@script.google.com/macros/s/id/exec',
      'https://script.google.com/a/macros/other.example/s/id/exec', target.url + '#private', target.url + '\n',
      'https://script.google.com/\\evil'].map(url => fixture({ ...target, url }))];
  for (const data of invalid) {
    const result = await run({ data });
    assert.deepEqual(result.redirects, []);
    assert.equal(result.nodes['tasks-recovery'].hidden, false);
    assert.equal(result.nodes['tasks-link'].href, undefined);
    assert.equal(result.timers.size, 0);
  }
});

test('navigation failure retains a verified manual link without inventing a destination', async () => {
  const result = await run({ navigationError: true });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.nodes['tasks-link'].href, target.url);
  assert.equal(result.nodes['tasks-fallback'].hidden, false);
  assert.match(result.nodes['tasks-status'].textContent, /下のリンク/);
});
