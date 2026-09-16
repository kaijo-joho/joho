/* Actual-browser CORS checks for the public CSV fetch layer. */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-data-fetch-'));
const key = path.join(temporary, 'key.pem');
const cert = path.join(temporary, 'cert.pem');
const sockets = new Set();
let appServer, csvServer, browser, context;
const requests = [];
const mime = file => file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server && server.listening ? server.close(resolve) : resolve());

function record(req) {
  requests.push({path:new URL(req.url, 'https://127.0.0.1').pathname, headers:req.headers});
}
function csvHeaders(res) { res.setHeader('content-type', 'text/csv; charset=utf-8'); res.setHeader('access-control-allow-origin', '*'); }

(async () => {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-days', '1'], {stdio:'ignore'});
  appServer = http.createServer((req, res) => {
    const name = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\.+([/\\]|$)/, '').replace(/^[/\\]+/, '');
    const file = path.join(root, name || 'tools/graph/index.html');
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, {'content-type':mime(file)}); res.end(error ? 'not found' : data); });
  });
  await listen(appServer);
  csvServer = https.createServer({key:fs.readFileSync(key), cert:fs.readFileSync(cert)}, (req, res) => {
    record(req);
    if (req.url === '/allowed.csv') { csvHeaders(res); return res.end('x,y\n1,2\n'); }
    if (req.url === '/blocked.csv') { res.setHeader('content-type', 'text/csv'); return res.end('x,y\n1,2\n'); }
    if (req.url === '/html') { csvHeaders(res); res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>not CSV</title>'); }
    if (req.url === '/large.csv') {
      csvHeaders(res); res.write(Buffer.alloc(600 * 1024, 0x31));
      return setTimeout(() => { res.write(Buffer.alloc(600 * 1024, 0x32)); res.end(); }, 10);
    }
    if (req.url === '/slow.csv') {
      csvHeaders(res); res.write('x,y\n');
      const interval = setInterval(() => res.write('1,2\n'), 100);
      req.on('close', () => clearInterval(interval));
      return;
    }
    res.writeHead(404); res.end();
  });
  csvServer.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await listen(csvServer);
  const csvBase = `https://127.0.0.1:${csvServer.address().port}`;
  browser = await chromium.launch({channel:'chrome', headless:true});
  context = await browser.newContext({ignoreHTTPSErrors:true});
  await context.addCookies([{name:'session', value:'must-not-be-sent', url:csvBase + '/'}]);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${appServer.address().port}/tools/graph/index.html`);
  await page.waitForFunction(() => typeof GraphDataFetch === 'object' && typeof GraphDataFetch.fetchCSV === 'function');
  const fetchCode = async (url, options) => page.evaluate(async ({url, options}) => {
    try { const result = await GraphDataFetch.fetchCSV(url, options); return {ok:true, bytes:result.bytes.byteLength}; }
    catch (error) { return {ok:false, code:error.code}; }
  }, {url, options});

  assert.deepEqual(await fetchCode(csvBase + '/allowed.csv'), {ok:true, bytes:8}, 'CORS許可済みCSVを実際に読める');
  assert.equal((await fetchCode(csvBase + '/blocked.csv')).code, 'NETWORK', 'CORSヘッダなしはブラウザで読めない');
  assert.equal((await fetchCode(csvBase + '/html')).code, 'FORMAT', 'HTMLのContent-Typeを拒否する');
  assert.equal((await fetchCode(csvBase + '/large.csv')).code, 'TOO_LARGE', 'ストリーム中の1MiB超過を止める');
  assert.equal((await fetchCode(csvBase + '/slow.csv', {timeoutMs:30})).code, 'TIMEOUT', '読込時間切れを区別する');
  const abortCode = await page.evaluate(async url => {
    const controller = new AbortController();
    const pending = GraphDataFetch.fetchCSV(url, {signal:controller.signal, timeoutMs:1000});
    setTimeout(() => controller.abort(), 20);
    try { await pending; return 'OK'; } catch (error) { return error.code; }
  }, csvBase + '/slow.csv');
  assert.equal(abortCode, 'ABORT', '利用者による中止を区別する');

  for (const request of requests) {
    assert.equal(request.headers.cookie, undefined, request.path + ' にCookieを送らない');
    assert.equal(request.headers.authorization, undefined, request.path + ' にAuthorizationを送らない');
    assert.equal(request.headers.referer, undefined, request.path + ' にRefererを送らない');
  }
  console.log('graph data-fetch-browser.test.cjs: ok');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  for (const socket of sockets) socket.destroy();
  if (context) await context.close();
  if (browser) await browser.close();
  await close(csvServer); await close(appServer);
  fs.rmSync(temporary, {recursive:true, force:true});
});
