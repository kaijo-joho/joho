// ブラウザ自動操作。HTTPSのテスト用2 originをローカルで応答し、実際のfm2には接続しない。
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { subtle } = webcrypto;
const rsa = { modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const signer = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', ...rsa }, false, ['sign', 'verify']);
const recovery = await subtle.generateKey({ name: 'RSA-OAEP', ...rsa }, false, ['wrapKey', 'unwrapKey']);
const config = { appId: 'logic', issuer: 'fm2',
  signingKeys: { test: await subtle.exportKey('jwk', signer.publicKey) },
  recoveryKeys: { test: await subtle.exportKey('jwk', recovery.publicKey) } };
const assets = new Map(await Promise.all(['assignment-security.js', 'assignment-launch.js'].map(async name =>
  ['/' + name, await readFile(new URL('../tools/shared/' + name, import.meta.url), 'utf8')])));
const editorHtml = '<!doctype html><meta charset="utf-8"><title>課題基盤テスト</title>'
  + '<script src="/assignment-security.js"></script><script src="/assignment-launch.js"></script>';
const issuerHtml = '<!doctype html><meta charset="utf-8"><title>発行側テスト</title>'
  + '<button onclick="window.child=window.open(\'https://editor.test/\')">開く</button>'
  + '<iframe src="/frame"></iframe><script>window.messages=[];'
  + 'addEventListener("message",event=>{if(event.origin==="https://editor.test"&&event.source===window.child)window.messages.push(event.data);});</script>';
async function grantFor(registration) {
  const now = Math.floor(Date.now() / 1000);
  const data = [{ alg: 'RS256', typ: 'joho-assignment+jwt', kid: 'test' },
    { v: 1, iss: 'fm2', aud: 'logic', sub: 'test-recipient', jti: 'test-issue', assignmentId: 'test-assignment',
      iat: now, exp: now + 3600, browserKeyId: registration.browserKeyId, recoveryKeyId: 'test', allowImport: false }
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return data + '.' + Buffer.from(await subtle.sign('RSASSA-PKCS1-v1_5', signer.privateKey, Buffer.from(data))).toString('base64url');
}
async function clientIn(page) {
  await page.evaluate(config => {
    window.assignmentClient = JohoAssignmentSecurity.createClient({ ...config,
      validateDocument: document => typeof document.text === 'string' });
  }, config);
}
async function configure(context, errors) {
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'editor.test' && assets.has(url.pathname)) {
      await route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: assets.get(url.pathname) });
    } else if (url.hostname === 'editor.test' && url.pathname === '/') {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: editorHtml });
    } else if (url.hostname === 'issuer.test' && ['/', '/frame'].includes(url.pathname)) {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: url.pathname === '/' ? issuerHtml : '<!doctype html><title>別Window</title>' });
    } else {
      errors.push('Unexpected request: ' + url.href); await route.abort();
    }
  });
}

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  const errors = [];
  try {
    const context = await browser.newContext();
    await configure(context, errors);
    const page = await context.newPage();
    await page.goto('https://editor.test/');
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    assert.deepEqual(await page.evaluate(() => indexedDB.databases()), [], '読み込むだけではDBを作らない');
    await clientIn(page);
    assert.deepEqual(await page.evaluate(() => indexedDB.databases()), [], '設定だけではDBを作らない');
    await page.evaluate(() => localStorage.setItem('normal-editor-test', '通常保存を保持'));

    // 2タブが同時に初期化しても同じ永続鍵へ収束する（実IndexedDBの一意制約）。
    const second = await context.newPage();
    await second.goto('https://editor.test/'); await clientIn(second);
    const [registration, secondRegistration] = await Promise.all([
      page.evaluate(() => assignmentClient.prepareBrowser()), second.evaluate(() => assignmentClient.prepareBrowser())
    ]);
    assert.equal(registration.browserKeyId, secondRegistration.browserKeyId);
    const keyInfo = await page.evaluate(async () => {
      const record = await JohoAssignmentSecurity.createIndexedDBKeyStore().read('logic');
      let rejected = false;
      try { await crypto.subtle.exportKey('jwk', record.privateKey); } catch (_) { rejected = true; }
      return { type: record.privateKey.type, extractable: record.privateKey.extractable, rejected };
    });
    assert.deepEqual(keyInfo, { type: 'private', extractable: false, rejected: true });
    const grant = await grantFor(registration);
    const encrypted = await page.evaluate(async grant => {
      let session = await assignmentClient.start(grant, { document: { text: 'テスト本文' }, name: '仮の課題' });
      session = await assignmentClient.record(session, { text: '編集済みの本文' });
      return assignmentClient.seal(session);
    }, grant);
    assert.equal(encrypted.includes('編集済みの本文'), false);
    await page.reload(); await clientIn(page);
    assert.deepEqual(await page.evaluate(() => assignmentClient.prepareBrowser()), registration, 'reload後も鍵を保持');
    const reopened = await page.evaluate(text => assignmentClient.open(text), encrypted);
    assert.deepEqual(reopened.work.entries.map(item => item.document.text), ['テスト本文', '編集済みの本文']);
    assert.equal(await page.evaluate(() => localStorage.getItem('normal-editor-test')), '通常保存を保持');
    assert.equal(await second.evaluate(async text => (await assignmentClient.open(text)).work.entries.length, encrypted), 2);

    // 別プロファイル相当では同じURLでも復号できず、openは代わりの鍵を作らない。
    const isolated = await browser.newContext(); await configure(isolated, errors);
    const outsider = await isolated.newPage(); await outsider.goto('https://editor.test/'); await clientIn(outsider);
    assert.equal(await outsider.evaluate(async text => {
      try { await assignmentClient.open(text); return 'opened'; } catch (error) { return error.code; }
    }, encrypted), 'WRONG_BROWSER');
    assert.equal(await outsider.evaluate(async () => (await JohoAssignmentSecurity.createIndexedDBKeyStore().read('logic')) == null), true);
    await isolated.close();

    // 実Window/postMessage。fm2本体ではなく、固定originの発行画面を模したテスト。
    const issuer = await context.newPage(); await issuer.goto('https://issuer.test/');
    const popupPromise = issuer.waitForEvent('popup');
    await issuer.getByRole('button', { name: '開く' }).click();
    const popup = await popupPromise; await popup.waitForLoadState(); await clientIn(popup);
    await popup.evaluate(() => {
      window.launchState = 'pending';
      JohoAssignmentLaunch.receive({ client: assignmentClient, sourceWindow: opener, sourceOrigin: 'https://issuer.test', timeoutMs: 10000 })
        .then(result => { window.launchState = 'received'; window.launchResult = result; })
        .catch(error => { window.launchState = error.message; });
    });
    await issuer.waitForFunction(() => window.messages.length === 1);
    const ready = await issuer.evaluate(() => window.messages[0]);
    const validGrant = await grantFor(ready);
    const message = { type: 'joho.assignment.launch', version: 1, nonce: ready.nonce, grant: validGrant };
    const frame = issuer.frames().find(frame => frame.url() === 'https://issuer.test/frame');
    await frame.evaluate(message => parent.child.postMessage(message, 'https://editor.test'), message);
    // 同originでも違うWindowからの通知では完了しない。往復メッセージでイベント順を同期する。
    await popup.evaluate(() => new Promise(resolve => {
      const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
      channel.port2.postMessage('tick');
    }));
    assert.equal(await popup.evaluate(() => window.launchState), 'pending');
    await issuer.evaluate(message => window.child.postMessage(message, 'https://editor.test'), message);
    await popup.waitForFunction(() => window.launchState !== 'pending');
    assert.equal(await popup.evaluate(() => window.launchState), 'received');
    assert.equal(await popup.evaluate(() => window.launchResult.claims.browserKeyId), registration.browserKeyId);
    await popup.close(); await issuer.close(); await second.close();

    // 鍵を消した場合は課題を読めない。通常保存を消したり別の鍵へ勝手に差し替えたりしない。
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('joho.assignments.keys.v1');
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    }));
    assert.equal(await page.evaluate(async text => {
      try { await assignmentClient.open(text); return 'opened'; } catch (error) { return error.code; }
    }, encrypted), 'WRONG_BROWSER');
    assert.equal(await page.evaluate(async () => (await JohoAssignmentSecurity.createIndexedDBKeyStore().read('logic')) == null), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('normal-editor-test')), '通常保存を保持');
    // ブラウザ生成の暗号をサーバー相当のNodeで復号する。秘密鍵はブラウザへ渡さない。
    const server = require('../tools/shared/assignment-security.js').createClient({ ...config, crypto: webcrypto,
      keyStore: { async read() {}, async add() { throw new Error('Not for server'); } },
      validateDocument: document => typeof document.text === 'string' });
    assert.deepEqual(await server.openForRecovery(encrypted, recovery.privateKey), reopened);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${name}: 永続鍵・競合・再読込・プロファイル分離・postMessage・鍵消失・サーバー相当の復号 OK`);
  } finally { await browser.close(); }
}
