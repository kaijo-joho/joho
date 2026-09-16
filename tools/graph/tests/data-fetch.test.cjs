const assert = require('assert');
const Fetch = require('../data-fetch.js');
const encoder = new TextEncoder();
const stream = (chunks, fail) => new ReadableStream({
  start(controller) { this.i = 0; this.controller = controller; },
  pull(controller) { if (fail && this.i === fail.at) return controller.error(fail.error); if (this.i >= chunks.length) return controller.close(); controller.enqueue(encoder.encode(chunks[this.i++])); }
});
const response = (body, options = {}) => new Response(body, { status:options.status || 200, headers:options.headers || { 'content-type':'text/csv' } });
const rejects = async (fn, code) => { await assert.rejects(fn, error => error.code === code); };

(async () => {
  assert.equal(Fetch.validateURL(' https://example.test/a.csv#part '), 'https://example.test/a.csv');
  for (const url of ['http://example.test/a.csv', 'file:///a.csv', 'data:text/csv,x', 'javascript:1', 'https://u:p@example.test/a.csv', 'https://example.test/a.csv?appId=x', 'https://example.test/a.csv?api_key=x', 'https://example.test/a.csv?access_token=x', 'https://example.test/a.csv?token=x', 'https://example.test/a.csv?password=x', 'https://example.test/a.csv?X-Amz-Credential=x', 'https://example.test/a.csv?X-Amz-Signature=x', 'https://example.test/a.csv?client_id=x']) await rejects(() => Promise.resolve().then(() => Fetch.validateURL(url)), 'INVALID_URL');

  let request;
  const loaded = await Fetch.fetchCSV('https://example.test/a.csv', { fetchImpl: async (url, init) => { request = { url, init }; return response('x,y\n1,2\n', { headers:{ 'content-type':'text/csv; charset=UTF-8' } }); } });
  assert.equal(new TextDecoder().decode(loaded.bytes), 'x,y\n1,2\n'); assert.equal(loaded.charset, 'utf-8');
  assert.deepEqual({ method:request.init.method, mode:request.init.mode, credentials:request.init.credentials, referrerPolicy:request.init.referrerPolicy }, { method:'GET', mode:'cors', credentials:'omit', referrerPolicy:'no-referrer' });

  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ type:'opaque' }) }), 'NETWORK');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => { throw new TypeError('network'); } }), 'NETWORK');
  let http; await assert.rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => response('', { status:404 }) }), error => (http = error).code === 'HTTP'); assert.equal(http.status, 404);
  for (const type of ['text/html', 'application/json', 'application/xml', 'application/pdf', 'application/zip', 'application/vnd.ms-excel']) await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => response('x', { headers:{ 'content-type':type } }) }), 'FORMAT');
  const noType = await Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ ok:true, type:'basic', url:'https://example.test/a', headers:new Headers(), body:stream(['x,y\n1,2']) }) }); assert.equal(noType.contentType, '');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { maxBytes:2, fetchImpl: async () => response('abc', { headers:{ 'content-type':'text/csv', 'content-length':'3' } }) }), 'TOO_LARGE');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { maxBytes:2, fetchImpl: async () => response(stream(['a', 'bc'])) }), 'TOO_LARGE');
  const neverCancel = { locked:false, cancel:() => new Promise(() => {}) };
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ ok:true, type:'basic', url:'https://example.test/a', headers:new Headers({ 'content-type':'text/html' }), body:neverCancel }) }), 'FORMAT');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { timeoutMs:10, fetchImpl: async () => response(new ReadableStream({ pull() {} })) }), 'TIMEOUT');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { timeoutMs:10, fetchImpl: () => new Promise(() => {}) }), 'TIMEOUT');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ ok:false, status:500, type:'basic', headers:new Headers(), body:neverCancel }) }), 'HTTP');
  let cancelled = 0;
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ ok:false, status:503, type:'basic', headers:new Headers(), body:{ locked:false, cancel:() => { cancelled++; } } }) }), 'HTTP'); assert.equal(cancelled, 1);
  const unlocked = stream(['x,y\n1,2']);
  await Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ ok:true, type:'basic', url:'https://example.test/a', headers:new Headers({ 'content-type':'text/x-csv' }), body:unlocked }) }); assert.equal(unlocked.locked, false);
  const abort = new AbortController(); const pending = Fetch.fetchCSV('https://example.test/a', { signal:abort.signal, fetchImpl: () => new Promise(() => {}) }); abort.abort(); await rejects(() => pending, 'ABORT');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ ok:true, type:'basic', url:'http://example.test/rejected.csv', headers:new Headers({ 'content-type':'text/csv' }), body:stream(['x']) }) }), 'INVALID_URL');
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => response(stream(['x'], { at:1, error:new Error('reader failed') })) }), 'NETWORK');
  const unhandled = []; const onUnhandled = error => unhandled.push(error); process.on('unhandledRejection', onUnhandled);
  const badReader = { read:() => Promise.reject(new Error('read failed')), cancel:() => Promise.reject(new Error('cancel failed')), releaseLock:() => {} };
  await rejects(() => Fetch.fetchCSV('https://example.test/a', { fetchImpl: async () => ({ ok:true, type:'basic', url:'https://example.test/a', headers:new Headers({ 'content-type':'text/csv' }), body:{ getReader:() => badReader } }) }), 'NETWORK');
  await new Promise(resolve => setTimeout(resolve, 0)); process.removeListener('unhandledRejection', onUnhandled); assert.deepEqual(unhandled, []);
  console.log('data-fetch tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
