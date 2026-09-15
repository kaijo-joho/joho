// 保存候補を明示的に選ぶ新しい復元フロー。各ブラウザを専用contextで検証する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { expect } = require('playwright/test');
const base = process.env.JOHO_TEST_URL || 'http://127.0.0.1:8765/';
const url = new URL('tools/logic/', base).href;
const errors = [];
const ready = page => page.locator('body.logic-tool-ready').waitFor();
const dialog = page => page.locator('#logic-file-dialog');
const state = page => page.evaluate(() => logicWorkbenchEditor.snapshot());
const raw = page => page.evaluate(() => ({ current: localStorage.getItem('joho.logic-draft.v1'), archive: localStorage.getItem('joho.logic-draft-archive.v1') }));
const saved = page => expect(page.locator('#draft-status')).toHaveAttribute('data-state', 'saved');
const chooser = async page => {
  await expect(dialog(page)).toBeVisible();
  await dialog(page).locator('[data-draft-id="draft-current"]').click();
  // 起動時以外に開いた一覧では、既定回路に未保存変更があるため確認を経る。
  if (await dialog(page).getByRole('heading', { name: '変更を保存しますか？', exact: true }).isVisible()) {
    await dialog(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
  }
  await expect(dialog(page)).toBeHidden();
};
const preserveEntries = page => page.evaluate(() => JSON.parse(localStorage.getItem('joho.logic-draft-archive.v1') || '{"archives":[]}').archives);
const listen = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(response.url()); });
};

const browserEngines = [['chrome', chromium], ['webkit', webkit]];
for (const [name, engine] of browserEngines.filter(([candidate]) => !process.env.LOGIC_TEST_ENGINE || candidate === process.env.LOGIC_TEST_ENGINE)) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(); listen(page);
    await page.goto(url); await ready(page);
    const initial = await state(page);
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click(); await saved(page);
    const firstDraft = await state(page);
    assert.notDeepEqual(firstDraft, initial);

    // 下書きがある起動時は置換せず、Escで候補を残したまま閉じられる。
    await page.reload(); await ready(page);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('[data-draft-id="draft-current"]')).toBeVisible();
    await expect(dialog(page).locator('[data-new-circuit]')).toBeVisible();
    assert.deepEqual(await state(page), initial, '初回の候補表示だけで前回の下書きを適用しない');
    const beforeEscape = await raw(page);
    await page.keyboard.press('Escape'); await expect(dialog(page)).toBeHidden();
    assert.deepEqual(await raw(page), beforeEscape, 'Escで閉じても未選択の候補を変更しない');
    await page.locator('#draft-status').click(); await chooser(page);
    assert.deepEqual(await state(page), firstDraft, '前回の下書きを明示選択して復元できる');

    // 名前付き保存を作り、未保存変更がある状態での選択確認と退避を確認する。
    await page.getByRole('button', { name: '回路を保存', exact: true }).click();
    await dialog(page).locator('input[type="text"]').fill('復元候補の名前付き保存');
    await dialog(page).getByRole('button', { name: '保存', exact: true }).click(); await saved(page);
    const namedSnapshot = await state(page);
    await page.getByRole('button', { name: 'NOTゲートを追加', exact: true }).click(); await saved(page);
    const dirtyBeforeNamed = await state(page);
    await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
    await dialog(page).getByRole('button', { name: '保存した回路「復元候補の名前付き保存」を読み込む', exact: true }).click();
    await expect(dialog(page).getByRole('heading', { name: '変更を保存しますか？', exact: true })).toBeVisible();
    await dialog(page).getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.deepEqual(await state(page), dirtyBeforeNamed, '読み込み確認をキャンセルして作業中の回路を保つ');
    await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
    await dialog(page).getByRole('button', { name: '保存した回路「復元候補の名前付き保存」を読み込む', exact: true }).click();
    await dialog(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
    assert.deepEqual(await state(page), namedSnapshot);
    assert.ok((await preserveEntries(page)).some(entry => entry.snapshot.graph.nodes.length === dirtyBeforeNamed.graph.nodes.length), '名前付き保存の読み込み前に下書きを退避する');

    // 上書きダイアログを開いた後の別タブ更新・削除は、現在の回路も他レコードも壊さず拒否する。
    const updateRecord = async (recordName, move) => page.evaluate(({ recordName, move }) => {
      const store = new LogicStorage.Store(localStorage);
      const record = store.list().find(item => item.name === recordName);
      if (!record) throw new Error('test record missing');
      const snapshot = structuredClone(record.snapshot);
      snapshot.graph.nodes[0].x += move;
      return store.save({ id: record.id, name: record.name, snapshot });
    }, { recordName, move });
    const recordRaw = recordName => page.evaluate(recordName => {
      const store = new LogicStorage.Store(localStorage);
      const record = store.list().find(item => item.name === recordName);
      return record ? JSON.stringify(record) : null;
    }, recordName);
    await page.evaluate(() => {
      const store = new LogicStorage.Store(localStorage);
      store.save({ name: '競合で変更しない保存', snapshot: logicWorkbenchEditor.snapshot() });
    });
    const unrelatedBefore = await recordRaw('競合で変更しない保存');
    const graphBeforeOpenConflict = await state(page);
    await page.getByRole('button', { name: '回路を保存', exact: true }).click();
    await updateRecord('復元候補の名前付き保存', 19);
    const updatedTarget = await recordRaw('復元候補の名前付き保存');
    await dialog(page).getByRole('button', { name: '上書き保存', exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('.logic-file-error')).toContainText(/別のタブ.*別の回路として保存.*ファイルに保存/);
    assert.deepEqual(await state(page), graphBeforeOpenConflict, '競合した上書きでも編集中の回路を変えない');
    assert.equal(await recordRaw('復元候補の名前付き保存'), updatedTarget, '別タブで更新した対象を上書きしない');
    assert.equal(await recordRaw('競合で変更しない保存'), unrelatedBefore, '無関係な保存を変えない');
    await dialog(page).locator('input[type="text"]').fill('競合を回避した保存');
    await dialog(page).getByRole('button', { name: '別の回路として保存', exact: true }).click();
    await expect(dialog(page)).toBeHidden();
    assert.deepEqual(await state(page), graphBeforeOpenConflict);
    assert.notEqual(await recordRaw('競合を回避した保存'), null, '別名保存で競合を回避できる');
    assert.equal(await recordRaw('復元候補の名前付き保存'), updatedTarget);

    // ダイアログを開く前からsavedFingerprintと保存レコードが食い違う場合も同じく拒否する。
    await updateRecord('競合を回避した保存', 23);
    const beforePreexistingConflict = await recordRaw('競合を回避した保存');
    const graphBeforePreexistingConflict = await state(page);
    await page.getByRole('button', { name: '回路を保存', exact: true }).click();
    await dialog(page).getByRole('button', { name: '上書き保存', exact: true }).click();
    await expect(dialog(page).locator('.logic-file-error')).toContainText(/別のタブ.*別の回路として保存.*ファイルに保存/);
    assert.deepEqual(await state(page), graphBeforePreexistingConflict, '既存の保存差異でも編集中の回路を変えない');
    assert.equal(await recordRaw('競合を回避した保存'), beforePreexistingConflict);
    await dialog(page).locator('input[type="text"]').fill('事前競合を回避した保存');
    await dialog(page).getByRole('button', { name: '別の回路として保存', exact: true }).click();
    assert.notEqual(await recordRaw('事前競合を回避した保存'), null);

    // ダイアログを開いた後に対象が削除された場合も、同じ保存名を勝手に再作成しない。
    const graphBeforeDeletedConflict = await state(page);
    await page.getByRole('button', { name: '回路を保存', exact: true }).click();
    await page.evaluate(() => {
      const store = new LogicStorage.Store(localStorage);
      const record = store.list().find(item => item.name === '事前競合を回避した保存');
      if (!record || !store.remove(record.id)) throw new Error('test record was not removed');
    });
    await dialog(page).getByRole('button', { name: '上書き保存', exact: true }).click();
    await expect(dialog(page).locator('.logic-file-error')).toContainText(/別のタブ.*別の回路として保存.*ファイルに保存/);
    assert.deepEqual(await state(page), graphBeforeDeletedConflict, '削除競合でも編集中の回路を変えない');
    assert.equal(await recordRaw('事前競合を回避した保存'), null, '削除された対象を勝手に再作成しない');
    assert.equal(await recordRaw('競合で変更しない保存'), unrelatedBefore);
    await dialog(page).locator('input[type="text"]').fill('削除競合を回避した保存');
    await dialog(page).getByRole('button', { name: '別の回路として保存', exact: true }).click();
    assert.notEqual(await recordRaw('削除競合を回避した保存'), null);

    // テンプレートとローカル .logic.json の読み込みでも、切り替え前の候補を残す。
    await page.getByRole('button', { name: 'ORゲートを追加', exact: true }).click(); await saved(page);
    const beforeTemplate = await state(page);
    await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'テンプレート「AND」を読み込む', exact: true }).click();
    await dialog(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
    assert.equal(await page.evaluate(() => logicWorkbenchEditor.getAnalysis().valid), true);
    assert.ok((await preserveEntries(page)).some(entry => entry.snapshot.graph.nodes.length === beforeTemplate.graph.nodes.length));
    await page.getByRole('button', { name: 'NOTゲートを追加', exact: true }).click(); await saved(page);
    const beforeFile = await state(page);
    const fileRaw = await page.evaluate(() => LogicStorage.serializeFile({ name: 'ローカル候補', snapshot: logicWorkbenchEditor.snapshot() }));
    await page.getByRole('button', { name: '回路を読み込む', exact: true }).click();
    await dialog(page).locator('input[type="file"]').setInputFiles({ name: 'local.logic.json', mimeType: 'application/json', buffer: Buffer.from(fileRaw) });
    await expect(dialog(page).getByRole('heading', { name: '変更を保存しますか？', exact: true })).toBeVisible();
    await dialog(page).getByRole('button', { name: '保存せず続ける', exact: true }).click();
    await expect(page.locator('#save-status')).toContainText('ローカル候補');
    assert.ok((await preserveEntries(page)).some(entry => entry.snapshot.graph.nodes.length === beforeFile.graph.nodes.length));

    // reloadしても再び候補を選ぶ方式で、アーカイブを残したまま再開できる。
    const archiveBeforeReload = await preserveEntries(page);
    await page.reload(); await ready(page); await chooser(page);
    const archiveAfterReload = await preserveEntries(page);
    assert.ok(archiveBeforeReload.every(before => archiveAfterReload.some(after => after.id === before.id)), '主下書きの選択後も既存archiveを失わない');
    assert.ok(archiveAfterReload.length <= 5, '候補選択後もarchiveの上限を保つ');

    // 別タブが主下書きを更新した後は、このタブの自動保存を停止する。
    const other = await context.newPage(); listen(other); await other.goto(url); await ready(other); await chooser(other);
    await other.getByRole('button', { name: 'ORゲートを追加', exact: true }).click(); await saved(other);
    const otherCurrent = (await raw(other)).current;
    await expect(page.locator('#draft-status')).toHaveAttribute('data-state', 'error');
    await page.getByRole('button', { name: 'NOTゲートを追加', exact: true }).click();
    assert.equal((await raw(page)).current, otherCurrent, '別タブの下書きを上書きしない');
    await context.close();

    // 破損した主下書きは置換せず、読み込み候補も勝手に作らない。
    const broken = await browser.newPage(); listen(broken);
    await broken.addInitScript(() => localStorage.setItem('joho.logic-draft.v1', '{broken'));
    await broken.goto(url); await ready(broken);
    await expect(broken.locator('#draft-status')).toHaveAttribute('data-state', 'error');
    await expect(dialog(broken)).toBeHidden();
    assert.equal(await broken.evaluate(() => localStorage.getItem('joho.logic-draft.v1')), '{broken');
    await broken.close();
    console.log(`${name}: explicit draft choices, archives, dirty confirmation, local/named/template loading and save conflict protection passed`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.log('logic-recovery-browser: passed');
