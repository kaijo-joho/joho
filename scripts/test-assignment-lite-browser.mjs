// 実fm2・実生徒データへ接続しない。固定HTTPS originの合成相手と往復する。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8766/';
const editorOrigin = 'https://editor.example.test', fmOrigin = 'https://fm2.example.test';
const protocol = await readFile(new URL('../tools/shared/assignment-lite.js', import.meta.url), 'utf8');
const bridgeCode = await readFile(new URL('../tools/shared/assignment-lite-bridge.js', import.meta.url), 'utf8');
const mockCode = await readFile(new URL('./fixtures/assignment-lite-mock.js', import.meta.url), 'utf8');
const getLocal = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => /joho\.logic-(circuits|draft)/.test(key)).map(key => [key, localStorage.getItem(key)])));
const getState = page => page.evaluate(() => logicWorkbenchEditor.snapshot());
const ready = page => page.locator('body.logic-tool-ready').waitFor();
const assignment = page => page.locator('#assignment-dialog');
for (const [engineName, engine] of [['chrome', chromium], ['webkit', webkit]].filter(([name]) => !process.env.LOGIC_TEST_ENGINE || name === process.env.LOGIC_TEST_ENGINE)) {
  const browser = await engine.launch(engineName === 'chrome' ? { channel: 'chrome' } : {});
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    // 未有効：通常の作品を変えず、DB・鍵を作らない。URLの任意指定でも昇格しない。
    const normal = await context.newPage(); normal.on('pageerror', error => errors.push(error.message));
    await normal.goto(new URL('tools/logic/#assignment=editor-lite-v1&origin=https://evil.test', base).href); await ready(normal);
    assert.equal(await normal.evaluate(() => logicAssignment.active), false);
    assert.equal(await normal.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'joho.assignment-lite.v1')), false);
    await normal.getByRole('button', { name: 'ORゲートを追加', exact: true }).click();
    await expect(normal.locator('#draft-status')).toHaveAttribute('data-state', 'saved');
    await normal.close();
    // 合成HTTPS配信。設定はこのテストだけで差し替え、リポジトリの本番設定はfalseのまま。
    await context.route(editorOrigin + '/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/assignment-config.js')) return route.fulfill({ contentType: 'text/javascript', body:
        `window.JohoLogicAssignmentConfig={enabled:true,trustedOrigins:['${fmOrigin}'],retentionNotice:'合成テストのみ。実際の提出先・保管方針ではありません。'};` });
      const response = await context.request.get(new URL(path, base).href);
      await route.fulfill({ response });
    });
    await context.route(fmOrigin + '/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic fm2</title><button id="open">合成課題を開く</button>' }));
    const fm = await context.newPage(); fm.on('pageerror', error => errors.push(error.message));
    await fm.goto(fmOrigin); await fm.addScriptTag({ content: protocol }); await fm.addScriptTag({ content: bridgeCode }); await fm.addScriptTag({ content: mockCode });
    await fm.evaluate(({ editorOrigin }) => {
      const P = JohoAssignmentLite;
      window.mock = new AssignmentLiteMock(); window.nonce = P.b64url(P.random(24));
      document.getElementById('open').onclick = () => {
        window.editorPopup = window.open(editorOrigin + '/tools/logic/');
        window.connection = JohoAssignmentLiteBridge.create({ peer: editorPopup, origin: editorOrigin, trustedOrigins: [editorOrigin], nonce, role: 'fm2', onRequest: (operation, data) => mock.request(operation, data) });
      };
    }, { editorOrigin });
    const popup = context.waitForEvent('page'); await fm.locator('#open').click(); const page = await popup;
    page.on('pageerror', error => errors.push(error.message)); await ready(page);
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click(); await expect(page.locator('#draft-status')).toHaveAttribute('data-state', 'saved');
    const before = await getState(page), normalStorage = await getLocal(page);
    const nonce = await fm.evaluate(() => nonce);
    const offer = (pid = 'logic_test') => page.evaluate(({ fmOrigin, nonce, pid }) => logicAssignment.offer({ peer: opener, origin: fmOrigin, nonce, route: { bookId: 'synthetic_book', pid, itemId: 'work' } }), { fmOrigin, nonce, pid });
    await offer(); await expect(assignment(page)).toBeVisible();
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0, '確認前は鍵を作らない');
    await assignment(page).getByRole('button', { name: 'キャンセル', exact: true }).click(); assert.equal(await page.evaluate(() => logicAssignment.active), false);
    await offer(); await assignment(page).getByRole('button', { name: '確認して開始', exact: true }).click();
    await expect(assignment(page).getByRole('heading', { name: '課題の保存・提出' })).toBeVisible();
    assert.equal((await getState(page)).graph.wires.length, 0, '新規課題は通常作品を持ち込まない');
    await page.keyboard.press('Escape'); await expect(assignment(page)).toBeHidden();
    await page.getByRole('button', { name: 'ANDゲートを追加', exact: true }).click();
    await expect(page.locator('#assignment-status')).toContainText('ブラウザ保存済み');
    const newState = await getState(page);
    await page.evaluate(() => logicWorkbenchEditor.undo()); await page.evaluate(() => logicWorkbenchEditor.redo());
    await expect(page.locator('#assignment-status')).toContainText('ブラウザ保存済み');
    assert.deepEqual(await getState(page), newState); assert.deepEqual(await getLocal(page), normalStorage, '通常の下書き・名前付き保存へ流出しない');
    // 0/1表示・選択・ヘルプ・テーマは記録しない。
    const readWork = (sessionId = 'synthetic_session') => page.evaluate(async sessionId => {
      const vault = new JohoAssignmentLiteStore.Vault(), keys = await vault.identity(), stored = await vault.load(sessionId);
      return JohoAssignmentLite.decrypt(stored.envelope, keys, sessionId);
    }, sessionId);
    const prior = await readWork();
    await page.evaluate(() => { logicWorkbenchEditor.toggleSignals(); logicWorkbenchEditor.clearSelection(); });
    assert.equal((await readWork()).workText, prior.workText);
    // ⌘/Ctrl+Sも課題保存。保護ファイルに平文作品を入れない。
    await page.keyboard.press('Control+s'); await expect(assignment(page)).toBeVisible();
    assert(!/fm2/i.test(await assignment(page).innerText()), 'UIへ内部名を表示しない');
    const downloadPromise = page.waitForEvent('download'); await assignment(page).getByRole('button', { name: '保護ファイルを保存', exact: true }).click();
    const downloaded = await downloadPromise, encrypted = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    assert.equal(encrypted.format, 'kaijo-assignment-lite-local'); assert(!JSON.stringify(encrypted).includes('entries'));
    await assignment(page).getByRole('button', { name: '提出フォームへ途中保存', exact: true }).click();
    await expect(page.locator('#assignment-states')).toContainText('第1版'); await expect(page.locator('#assignment-states')).toContainText('正式提出：未完了');
    assert.equal(JSON.parse(await fm.evaluate(() => mock.raw)).entries.length, 4, 'start/edit/undo/redoだけ');
    // 実IndexedDBに非export鍵が保存され、再読込しても同じ鍵・履歴を使う。
    const firstId = await page.evaluate(async () => (await new JohoAssignmentLiteStore.Vault().identity()).browserKeyId);
    await page.keyboard.press('Escape'); await page.reload(); await ready(page);
    await page.keyboard.press('Escape');
    await offer(); await assignment(page).getByRole('button', { name: '確認して開始', exact: true }).click();
    await expect(page.locator('#assignment-states')).toContainText('第1版'); assert.deepEqual(await getState(page), newState);
    assert.equal(await page.evaluate(async () => (await new JohoAssignmentLiteStore.Vault().identity()).browserKeyId), firstId);
    await assignment(page).getByRole('button', { name: '提出へ進む', exact: true }).click();
    await expect(page.locator('#assignment-status')).toContainText('提出フォームで確認中');
    assert.equal(await page.locator('#logic-editor').evaluate(node => node.inert), true);
    const signed = await fm.evaluate(async () => {
      const prepared = mock.prepared;
      const payload = { bookId: 'synthetic_book', pid: 'logic_test', requestId: 'synthetic_submit', values: { title: '合成提出' }, files: [prepared.file] };
      const proof = await connection.request('sign-submit', { prepareId: prepared.prepareId, sessionId: prepared.sessionId, revision: prepared.revision, payload });
      await connection.request('submission-result', { prepareId: prepared.prepareId, requestId: payload.requestId, submitted: true, attemptId: 'synthetic_attempt' });
      return proof;
    });
    assert.equal(signed.browserKeyId, firstId); await expect(page.locator('#assignment-states')).toContainText('正式提出：提出完了');
    await expect(assignment(page).getByRole('button', { name: '提出待ちを解除して編集する', exact: true })).toHaveCount(0);
    // 小画面・ダーク・拡大文字・フォーカス操作。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.textSize = 'largest'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await assignment(page).boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    if (process.env.JOHO_TEST_ARTIFACTS) await page.screenshot({ path: `${process.env.JOHO_TEST_ARTIFACTS}/${engineName}-assignment-390.png` });
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await assignment(page).getByRole('button', { name: '課題を保存して通常編集へ戻る', exact: true }).click();
    await expect(assignment(page)).toBeHidden(); assert.equal(await page.evaluate(() => logicAssignment.active), false);
    assert.deepEqual(await getLocal(page), normalStorage);
    // 再読込後の通常初期回路へ戻る。課題のUndoで通常作品へ戻ることもない。
    assert.notDeepEqual(await getState(page), newState); assert.notDeepEqual(before, newState);
    assert.equal(await page.locator('#logic-editor').evaluate(node => node.inert), false);
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.clearButton.disabled), false);
    // 別の合成課題：持込み可。名前付き保存は読めるが書き換えない。
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(snapshot => { new LogicStorage.Store(localStorage).save({ name: '合成持込', snapshot }); }, before);
    const storageBeforeImport = await getLocal(page);
    await fm.evaluate(() => { mock.session = { ...mock.session, sessionId: 'synthetic_import_session', allowImport: true }; mock.head = null; mock.raw = null; mock.receipts.clear(); });
    await offer('logic_import_test'); await assignment(page).getByRole('button', { name: '確認して開始', exact: true }).click();
    await expect(page.locator('#assignment-states')).toContainText('履歴：1件'); await page.keyboard.press('Escape');
    await page.keyboard.press('Control+o');
    await assignment(page).getByRole('button', { name: '通常の保存・ファイル・テンプレートから持ち込む', exact: true }).click();
    await page.getByRole('button', { name: '保存した回路「合成持込」を読み込む', exact: true }).click();
    await assignment(page).getByRole('button', { name: '持ち込む', exact: true }).click();
    await expect(page.locator('#assignment-status')).toContainText('ブラウザ保存済み'); assert.deepEqual(await getState(page), before);
    assert.equal(JSON.parse((await readWork('synthetic_import_session')).workText).entries.at(-1).action, 'import');
    assert.deepEqual(await getLocal(page), storageBeforeImport);
    await page.getByRole('button', { name: '全消去', exact: true }).click();
    await assignment(page).getByRole('button', { name: '保存して全消去', exact: true }).click();
    await expect(assignment(page)).toBeHidden(); assert.equal((await getState(page)).graph.wires.length, 0);
    await page.evaluate(() => logicWorkbenchEditor.undo()); await expect(page.locator('#assignment-status')).toContainText('ブラウザ保存済み');
    assert.deepEqual(await getState(page), before);
    await fm.evaluate(() => { mock.loseNextResponse = true; });
    await page.locator('#assignment-status').click(); await assignment(page).getByRole('button', { name: '提出フォームへ途中保存', exact: true }).click();
    await expect(assignment(page).getByRole('button', { name: '同じ内容を提出フォームへ再送', exact: true })).toBeEnabled();
    assert.equal(await page.locator('#logic-editor').evaluate(node => node.inert), true);
    await assignment(page).getByRole('button', { name: '同じ内容を提出フォームへ再送', exact: true }).click();
    await expect(page.locator('#assignment-states')).toContainText('第1版');
    assert.equal(await page.locator('#logic-editor').evaluate(node => node.inert), false);
    assert.equal(JSON.parse((await readWork('synthetic_import_session')).workText).entries.length, 4);
    await assignment(page).getByRole('button', { name: '課題を保存して通常編集へ戻る', exact: true }).click();
    await expect(assignment(page)).toBeHidden(); assert.deepEqual(await getLocal(page), storageBeforeImport);
    await context.close(); assert.deepEqual(errors, []); console.log(`${engineName}: editor-lite 通常隔離・鍵・暗号保存・再開・提出・390px 合格`);
  } finally { await browser.close(); }
}
