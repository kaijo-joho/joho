import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const common = readFileSync(new URL('../common/05_tools_store_contract.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../dist/19_tools_store_distribution.js', import.meta.url), 'utf8');
const origin = 'https://school.example.test';
const teacher = 'teacher@school.example.test';
const student = 'student@school.example.test';
const other = 'other@school.example.test';
const folderId = 'folder_01234567890123456789';
const tokenKey = 'synthetic-binding-key-only-00000000000000';
const plain = value => JSON.parse(JSON.stringify(value));
const iterator = values => { let index = 0; return { hasNext: () => index < values.length, next: () => values[index++] }; };
const user = account => ({ getEmail: () => account });

class Range {
  constructor(sheet, row, column, rows = 1, columns = 1) { Object.assign(this, { sheet, row, column, rows, columns }); }
  getValues() { return Array.from({ length: this.rows }, (_, y) => Array.from({ length: this.columns }, (_, x) => this.sheet.cells[this.row - 1 + y]?.[this.column - 1 + x] ?? '')); }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    assert.equal(values.length, this.rows);
    for (let y = 0; y < this.rows; y++) {
      assert.equal(values[y].length, this.columns);
      const row = this.sheet.cells[this.row - 1 + y] ||= [];
      for (let x = 0; x < this.columns; x++) row[this.column - 1 + x] = values[y][x];
    }
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
  protect() { const p = new Protection(this); this.sheet.protections.push(p); return p; }
}
class Protection {
  constructor(range) { this.range = range; this.description = ''; this.editors = [student]; this.domain = true; this.warning = true; }
  getDescription() { return this.description; }
  setDescription(value) { this.description = value; return this; }
  setRange(range) { this.range = range; return this; }
  setWarningOnly(value) { this.warning = value; return this; }
  addEditors(values) { this.editors = [...new Set([...this.editors, ...values])]; return this; }
  getEditors() { return this.editors.map(user); }
  removeEditors(values) { this.editors = this.editors.filter(v => !values.includes(v)); return this; }
  canDomainEdit() { return this.domain; }
  setDomainEdit(value) { this.domain = value; return this; }
}
class Sheet {
  constructor(name, rows = 1000, columns = 26) { Object.assign(this, { name, rows, columns, cells: [], hidden: false, protections: [], frozen: 0 }); }
  getName() { return this.name; }
  setName(name) { this.name = name; return this; }
  getMaxRows() { return this.rows; }
  getMaxColumns() { return this.columns; }
  getLastRow() { return this.cells.reduce((n, row, index) => row.some(v => v !== '' && v !== undefined && v !== null) ? index + 1 : n, 0); }
  getLastColumn() { return Math.max(0, ...this.cells.map(row => row.reduce((n, v, i) => v !== '' && v !== undefined && v !== null ? i + 1 : n, 0))); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(...args) { return new Range(this, ...args); }
  insertRowsAfter(after, count) { assert.equal(after, this.rows); this.rows += count; }
  insertColumnsAfter(after, count) { assert.equal(after, this.columns); this.columns += count; }
  getProtections() { return this.protections; }
  setFrozenRows(count) { this.frozen = count; return this; }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  isSheetHidden() { return this.hidden; }
}
class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = [new Sheet('Sheet1')]; }
  getId() { return this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null; }
  insertSheet(name) { assert.equal(this.getSheetByName(name), null); const sheet = new Sheet(name); this.sheets.push(sheet); return sheet; }
}
class File {
  constructor(id, name) { Object.assign(this, { id, name, owner: teacher, editors: [], trashed: false, parents: [], sharing: 'PRIVATE', shareable: true }); }
  getId() { return this.id; }
  getOwner() { return this.owner ? user(this.owner) : null; }
  isTrashed() { return this.trashed; }
  getMimeType() { return 'application/vnd.google-apps.spreadsheet'; }
  getParents() { return iterator(this.parents.map(id => ({ getId: () => id }))); }
  moveTo(folder) { this.parents = [folder.getId()]; return this; }
  addEditor(account) { if (!this.editors.includes(account)) this.editors.push(account); return this; }
  getEditors() { return this.editors.map(user); }
  setShareableByEditors(value) { this.shareable = value; return this; }
  getSharingAccess() { return this.sharing; }
}
function utilities() {
  return {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_, text) => [...crypto.createHash('sha256').update(text).digest()],
    computeHmacSha256Signature: (text, key) => [...crypto.createHmac('sha256', key).update(text).digest()],
    base64EncodeWebSafe: input => Buffer.from(typeof input === 'string' ? input : input.map(v => (v + 256) % 256)).toString('base64url'),
    base64DecodeWebSafe: text => [...Buffer.from(text, 'base64url')],
    newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') })
  };
}
function fixture({ registered = false, missingColumn = false, enabled = true } = {}) {
  const ctx = vm.createContext({ Utilities: utilities(), console });
  vm.runInContext(common + '\n' + source, ctx);
  const data = new Map([
    ['TOOLS_STORE_DIST_ENABLED', enabled ? 'true' : 'false'],
    ['TOOLS_STORE_DIST_PROVISIONING_ENABLED', 'true'],
    ['TOOLS_STORE_DIST_ADMIN_ENABLED', 'true'],
    ['TOOLS_STORE_BINDING_KEY', tokenKey],
    ['TOOLS_STORE_ALLOWED_ORIGINS', JSON.stringify([origin])],
    ['TOOLS_STORE_TEACHERS', JSON.stringify([teacher])],
    ['TOOLS_STORE_URL', 'https://script.google.com/macros/s/synthetic-store-deployment/exec']
  ]);
  const properties = { getProperty: key => data.get(key) || null, setProperty: (key, value) => data.set(key, value), deleteProperty: key => data.delete(key) };
  const ledger = new Sheet('個別フォルダ');
  ledger.cells = [['userId', '個別フォルダ名', '個別フォルダID', '旧列'], [student, 'student', folderId, 'KEEP'], [other, 'other', 'folder_other_01234567890', 'OTHER']];
  if (!missingColumn) ledger.cells[0].push('tools保存用GSSID');
  const state = { active: student, effective: teacher, locked: false, lockCalls: 0, creates: 0, flushes: 0 };
  const files = new Map(), spreadsheets = new Map();
  const folders = new Map([folderId, 'folder_other_01234567890'].map(id => [id, { getId: () => id, isTrashed: () => false, getOwner: () => user(teacher) }]));
  const env = {
    properties,
    configuration: () => ctx.ToolsStoreDistribution.parseConfiguration(properties),
    activeAccount: () => state.active,
    effectiveAccount: () => state.effective,
    roster: account => [student, other].includes(account) ? { userId: account, '年': 4, '組': 1, '番': 1, '氏名': '合成テスト' } : null,
    ledger: () => ledger,
    folder: id => { assert.ok(folders.has(id)); return folders.get(id); },
    file: id => { if (!files.has(id)) throw Error('private internal inaccessible id'); return files.get(id); },
    open: id => { if (!spreadsheets.has(id)) throw Error('private internal inaccessible id'); return spreadsheets.get(id); },
    create: name => {
      state.creates++;
      const id = 'spreadsheet_synthetic_' + String(state.creates).padStart(12, '0');
      const ss = new Spreadsheet(id, name), file = new File(id, name);
      spreadsheets.set(id, ss); files.set(id, file); return ss;
    },
    findFiles: name => iterator([...files.values()].filter(file => file.name === name)),
    rangeProtectionType: 'RANGE',
    randomId: () => crypto.randomBytes(16).toString('hex'),
    lock: () => ({ tryLock: () => { state.lockCalls++; if (state.locked) return false; state.locked = true; return true; }, releaseLock: () => { state.locked = false; } }),
    now: () => new Date('2026-10-15T00:00:00.000Z'),
    flush: () => { state.flushes++; }
  };
  const api = ctx.ToolsStoreDistribution.create(env);
  const f = { ctx, data, properties, env, api, ledger, state, files, spreadsheets, folders, request: { tool: 'python', origin } };
  if (registered) {
    const result = api.connection(f.request);
    assert.equal(result.ok, true, JSON.stringify(result));
    f.session = result.value;
    state.lockCalls = 0;
  }
  return f;
}
function code(result, expected) { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, expected); }
function registeredFile(f) { return f.files.get(f.session.spreadsheetId); }
function registeredSS(f) { return f.spreadsheets.get(f.session.spreadsheetId); }

// These fakes exercise actual Sheets ranges, teacher-only protection, identity, and recovery—not merely function output snapshots.
test('初回作成は台帳の専用セルだけ更新し、teacher所有/本人編集/固定保護/非表示を揃える', () => {
  const f = fixture();
  const result = f.api.connection(f.request);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(f.state.creates, 1);
  assert.equal(f.ledger.cells[1][3], 'KEEP');
  assert.equal(f.ledger.cells[2][3], 'OTHER');
  assert.equal(f.ledger.cells[2][4], undefined);
  assert.equal(f.ledger.cells[1][4], result.value.spreadsheetId);
  const file = f.files.get(result.value.spreadsheetId), ss = f.spreadsheets.get(result.value.spreadsheetId);
  assert.deepEqual(file.editors, [student]);
  assert.deepEqual(file.parents, [folderId]);
  assert.equal(file.shareable, false);
  const guide = ss.getSheetByName('使い方');
  assert.equal(guide.getRange(4, 2).getValue(), 'active');
  assert.equal(guide.hidden, false);
  for (const [name, rows] of [['Python', 1025], ['Python履歴', 2049]]) {
    const sheet = ss.getSheetByName(name);
    assert.ok(sheet.rows >= rows);
    assert.equal(sheet.hidden, true);
    assert.deepEqual(sheet.getRange(1, 1, 1, 14).getValues()[0], plain(f.ctx.ToolsStoreContract.constants.HEADERS));
    const p = sheet.protections[0];
    assert.equal(p.range.row, 1); assert.equal(p.range.rows, 1); assert.equal(p.range.columns, 14);
    assert.deepEqual(p.editors, [teacher]); assert.equal(p.domain, false); assert.equal(p.warning, false);
  }
  const payload = f.ctx.ToolsStoreContract.verifyBinding(result.value.binding, f.env.configuration(), f.env.now().getTime());
  assert.equal(payload.account, student); assert.equal(payload.origin, origin); assert.equal(payload.spreadsheetId, ss.getId());
});

test('登録済み接続は再作成・共有変更・ScriptLockを使わない', () => {
  const f = fixture({ registered: true });
  registeredFile(f).addEditor = () => { throw Error('read-only connection changed ACL'); };
  registeredSS(f).getSheetByName('Python').getRange(2, 3).setValue('KEEP STUDENT CODE');
  const result = f.api.connection(f.request);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(f.state.creates, 1); assert.equal(f.state.lockCalls, 0);
  assert.equal(registeredSS(f).getSheetByName('Python').getRange(2, 3).getValue(), 'KEEP STUDENT CODE');
});

test('disabledでは名簿・台帳・Driveへアクセスしない', () => {
  const f = fixture({ enabled: false });
  for (const key of ['ledger', 'roster', 'folder', 'file', 'create']) f.env[key] = () => { throw Error('must not access'); };
  code(f.api.connection(f.request), 'disabled'); assert.equal(f.state.creates, 0);
});

test('学校アカウント未確認・名簿不在・名簿別人・教員実行者不明を拒否', () => {
  let f = fixture(); f.state.active = ''; code(f.api.connection(f.request), 'auth_required');
  f = fixture(); f.state.active = 'unknown@school.example.test'; code(f.api.connection(f.request), 'not_allowed');
  f = fixture(); f.env.roster = () => ({ userId: other, '年': 4 }); code(f.api.connection(f.request), 'not_allowed');
  f = fixture(); f.state.effective = student; code(f.api.connection(f.request), 'invalid_config');
});

test('clientが指定した別人・GSS・URL・未許可tool/originは採用しない', () => {
  const f = fixture();
  for (const input of [{ ...f.request, account: other }, { ...f.request, spreadsheetId: 'forged_id' }, { ...f.request, storeURL: 'https://evil.example' },
    { ...f.request, tool: 'html' }, { ...f.request, origin: 'https://evil.example' }]) code(f.api.connection(input), 'invalid_request');
  assert.equal(f.state.creates, 0);
});

test('台帳に専用列がなければ作成せず、教員による列追加だけを許可', () => {
  const f = fixture({ missingColumn: true });
  code(f.api.connection(f.request), 'preparation_required');
  code(f.api.ensureLedgerColumn(), 'not_allowed');
  f.state.active = teacher;
  const preview = f.api.preview({ accounts: [student] });
  assert.equal(preview.ok, true); assert.equal(preview.value.accounts[0].state, 'ledger_column_required');
  assert.equal(f.ledger.cells[0].length, 4);
  assert.equal(f.api.ensureLedgerColumn().value.state, 'created');
  assert.equal(f.api.ensureLedgerColumn().value.state, 'existing');
  assert.deepEqual(f.ledger.cells[0], ['userId', '個別フォルダ名', '個別フォルダID', '旧列', 'tools保存用GSSID']);
  assert.equal(f.ledger.cells[1][3], 'KEEP'); assert.equal(f.state.creates, 0);
});

test('provision/adminフラグがなければGSSと権限を変更しない', () => {
  const f = fixture();
  f.data.set('TOOLS_STORE_DIST_PROVISIONING_ENABLED', 'false');
  code(f.api.connection(f.request), 'preparation_required');
  f.state.active = teacher;
  code(f.api.prepare({ accounts: [student], confirmation: 'PREPARE_TOOLS_STORES_V1' }), 'disabled');
  code(f.api.ensureLedgerColumn(), 'disabled');
  assert.equal(f.state.creates, 0);
});

test('台帳の重複userId/重複GSSID/不正folder・登録先交換を拒否', () => {
  let f = fixture(); f.ledger.cells.push([...f.ledger.cells[1]]); code(f.api.connection(f.request), 'ledger_invalid');
  f = fixture({ registered: true }); f.ledger.cells[2][4] = f.session.spreadsheetId; code(f.api.connection(f.request), 'ledger_invalid');
  f = fixture(); f.ledger.cells[1][2] = ''; code(f.api.connection(f.request), 'ledger_invalid');
  f = fixture({ registered: true }); f.state.active = other; f.ledger.cells[1][4] = ''; f.ledger.cells[2][4] = f.session.spreadsheetId;
  code(f.api.connection(f.request), 'store_invalid'); assert.equal(f.state.creates, 1);
});

test('登録済みGSSの権限拒否・削除・別人所有で新規GSSへ逃げない', () => {
  let f = fixture({ registered: true }); f.files.delete(f.session.spreadsheetId); code(f.api.connection(f.request), 'store_unavailable'); assert.equal(f.state.creates, 1);
  f = fixture({ registered: true }); registeredFile(f).trashed = true; code(f.api.connection(f.request), 'store_unavailable'); assert.equal(f.state.creates, 1);
  f = fixture({ registered: true }); registeredFile(f).owner = other; code(f.api.connection(f.request), 'store_invalid'); assert.equal(f.state.creates, 1);
});

test('metadata/generation/schema/owner/header破損はコードを触らず停止', () => {
  for (const [row, value] of [[1, 2], [2, 'other_actor'], [3, 'bad'], [5, 'wrong-kind'], [6, other]]) {
    const f = fixture({ registered: true }), ss = registeredSS(f);
    ss.getSheetByName('Python').getRange(2, 4).setValue('ORIGINAL');
    ss.getSheetByName('使い方').getRange(row, 2).setValue(value);
    code(f.api.connection(f.request), 'store_invalid');
    assert.equal(ss.getSheetByName('Python').getRange(2, 4).getValue(), 'ORIGINAL'); assert.equal(f.state.creates, 1);
  }
  const f = fixture({ registered: true }); registeredSS(f).getSheetByName('Python').getRange(1, 3).setValue('bad-header');
  code(f.api.connection(f.request), 'store_invalid');
});

test('upgrading/retiredの旧保存先は接続に使わない', () => {
  const f = fixture({ registered: true }), guide = registeredSS(f).getSheetByName('使い方');
  guide.getRange(4, 2).setValue('upgrading'); code(f.api.connection(f.request), 'store_busy');
  guide.getRange(4, 2).setValue('retired'); code(f.api.connection(f.request), 'store_retired');
});

test('保存先の追加共有・公開・別folderへの移動は拒否', () => {
  let f = fixture({ registered: true }); registeredFile(f).editors.push(other); code(f.api.connection(f.request), 'store_invalid');
  f = fixture({ registered: true }); registeredFile(f).sharing = 'DOMAIN_WITH_LINK'; code(f.api.connection(f.request), 'store_invalid');
  f = fixture({ registered: true }); registeredFile(f).parents = ['folder_other_01234567890']; code(f.api.connection(f.request), 'store_invalid');
});

test('教員preflightは読取専用、prepareはコードを保持して構成を冪等に整備', () => {
  const f = fixture({ registered: true }), ss = registeredSS(f);
  const sheet = ss.getSheetByName('Python'); sheet.getRange(2, 3).setValue('UNCHANGED CODE');
  f.state.active = teacher;
  const writes = f.state.flushes;
  assert.equal(f.api.preview({ accounts: [student] }).value.accounts[0].state, 'registered');
  assert.equal(f.state.flushes, writes);
  const input = { accounts: [student], confirmation: 'PREPARE_TOOLS_STORES_V1' };
  assert.equal(f.api.prepare(input).value.results[0].state, 'ready');
  assert.equal(f.api.prepare(input).value.results[0].state, 'ready');
  assert.equal(sheet.getRange(2, 3).getValue(), 'UNCHANGED CODE');
  assert.equal(f.state.creates, 1); assert.equal(sheet.protections.length, 1);
  assert.equal(ss.getSheetByName('使い方').protections.length, 1);
});

test('10名までの明示対象だけ事前準備し、他生徒の台帳へ書かない', () => {
  const f = fixture(); f.state.active = teacher;
  code(f.api.prepare({ accounts: [student], confirmation: 'wrong' }), 'invalid_request');
  code(f.api.prepare({ accounts: Array.from({ length: 11 }, (_, i) => `student${i}@school.example.test`), confirmation: 'PREPARE_TOOLS_STORES_V1' }), 'invalid_request');
  const result = f.api.prepare({ accounts: [student], confirmation: 'PREPARE_TOOLS_STORES_V1' });
  assert.equal(result.value.results[0].state, 'ready');
  assert.equal(f.ledger.cells[2][4], undefined); assert.equal(f.state.creates, 1);
});

test('作成後ID控え前の障害でも同じ孤立ファイルを回復し二重作成しない', () => {
  const f = fixture(), originalCreate = f.env.create;
  f.env.create = name => { originalCreate(name); throw Error('response lost after creation'); };
  code(f.api.connection(f.request), 'creation_uncertain');
  assert.equal(f.state.creates, 1); assert.equal(f.ledger.cells[1][4], undefined);
  f.env.create = originalCreate;
  const result = f.api.connection(f.request);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(f.state.creates, 1);
  assert.equal(f.ledger.cells[1][4], result.value.spreadsheetId);
});

test('作成の成否不明で候補ゼロ/複数なら再作成しない', () => {
  const f = fixture(); f.env.create = () => { throw Error('creation unavailable'); };
  code(f.api.connection(f.request), 'creation_uncertain');
  code(f.api.connection(f.request), 'creation_uncertain'); assert.equal(f.state.creates, 0);
  const g = fixture(), originalCreate = g.env.create;
  g.env.create = name => { originalCreate(name); originalCreate(name); throw Error('uncertain duplicate'); };
  code(g.api.connection(g.request), 'creation_uncertain');
  g.env.create = originalCreate;
  code(g.api.connection(g.request), 'creation_uncertain'); assert.equal(g.state.creates, 2);
});

test('ジャーナルが消えても既知名の孤立ファイルがあれば新規作成しない', () => {
  const f = fixture(), originalCreate = f.env.create;
  f.env.create = name => { originalCreate(name); throw Error('lost reply'); };
  code(f.api.connection(f.request), 'creation_uncertain');
  for (const key of [...f.data.keys()]) if (key.startsWith('TOOLS_STORE_PENDING_')) f.data.delete(key);
  f.env.create = originalCreate;
  code(f.api.connection(f.request), 'creation_uncertain'); assert.equal(f.state.creates, 1);
});

test('初期化途中の障害は同じGSSで再開して既存コードを保持', () => {
  const f = fixture(), originalFlush = f.env.flush;
  f.env.flush = () => { originalFlush(); if (f.state.flushes === 2) throw Error('interrupt after writing sheets'); };
  code(f.api.connection(f.request), 'internal');
  assert.equal(f.state.creates, 1);
  const ss = [...f.spreadsheets.values()][0]; ss.getSheetByName('Python').getRange(2, 4).setValue('KEEP DURING RECOVERY');
  f.env.flush = originalFlush;
  const result = f.api.connection(f.request);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(f.state.creates, 1);
  assert.equal(ss.getSheetByName('Python').getRange(2, 4).getValue(), 'KEEP DURING RECOVERY');
});

test('台帳確定直後の応答消失でも登録済みGSSへ接続できる', () => {
  const f = fixture(), originalDelete = f.properties.deleteProperty;
  f.properties.deleteProperty = () => { throw Error('lost finalization'); };
  code(f.api.connection(f.request), 'internal');
  assert.ok(f.ledger.cells[1][4]); assert.equal(f.state.creates, 1);
  f.properties.deleteProperty = originalDelete;
  assert.equal(f.api.connection(f.request).ok, true); assert.equal(f.state.creates, 1);
});

test('初回準備ロックを取れなければ再作成せずbusy、例外でも解放する', () => {
  const f = fixture(); f.state.locked = true;
  code(f.api.connection(f.request), 'store_busy'); assert.equal(f.state.creates, 0);
  f.state.locked = false; f.env.create = () => { throw Error('create fail'); };
  code(f.api.connection(f.request), 'creation_uncertain'); assert.equal(f.state.locked, false);
});

test('内部例外のGSS ID・メール・鍵をブラウザへそのまま返さない', () => {
  const f = fixture(); f.env.ledger = () => { throw Error(`sensitive ${teacher} ${tokenKey}`); };
  const result = f.api.connection(f.request);
  code(result, 'internal'); assert.ok(!JSON.stringify(result).includes(tokenKey)); assert.ok(!JSON.stringify(result).includes(teacher));
});


test('生徒の接続を無効にしたまま、明示的に許可した教員だけ事前準備できる', () => {
  const f = fixture({ enabled: false }); f.state.active = teacher;
  const result = f.api.prepare({ accounts: [student], confirmation: 'PREPARE_TOOLS_STORES_V1' });
  assert.equal(result.ok, true); assert.equal(result.value.results[0].state, 'ready');
  f.state.active = student; code(f.api.connection(f.request), 'disabled');
  assert.equal(f.state.creates, 1);
});

test('active版の必須シートが消失しても教員prepareは空シートで隠さない', () => {
  const f = fixture({ registered: true }), ss = registeredSS(f);
  ss.sheets = ss.sheets.filter(sheet => sheet.name !== 'Python');
  f.state.active = teacher;
  const result = f.api.prepare({ accounts: [student], confirmation: 'PREPARE_TOOLS_STORES_V1' });
  assert.equal(result.value.results[0].state, 'blocked'); assert.equal(result.value.results[0].code, 'store_invalid');
  assert.equal(ss.getSheetByName('Python'), null);
  assert.equal(ss.getSheetByName('使い方').getRange(4, 2).getValue(), 'active');
});

test('作成中に台帳が並べ替えられても本人行を再照合して専用セルだけ登録する', () => {
  const f = fixture(), originalCreate = f.env.create;
  f.env.create = name => {
    const ss = originalCreate(name);
    [f.ledger.cells[1], f.ledger.cells[2]] = [f.ledger.cells[2], f.ledger.cells[1]];
    return ss;
  };
  const result = f.api.connection(f.request);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(f.ledger.cells[1][0], other); assert.equal(f.ledger.cells[1][4], undefined);
  assert.equal(f.ledger.cells[2][0], student); assert.equal(f.ledger.cells[2][4], result.value.spreadsheetId);
});
