import { loadStore } from './common-fixture.mjs';

export class FakeRange {
  constructor(sheet, row, column, rows = 1, columns = 1) { Object.assign(this, { sheet, row, column, rows, columns }); }
  getRow() { return this.row; }
  getColumn() { return this.column; }
  getLastRow() { return this.row + this.rows - 1; }
  getLastColumn() { return this.column + this.columns - 1; }
  getValues() {
    this.sheet.reads.push({ row: this.row, column: this.column, rows: this.rows, columns: this.columns });
    if (this.sheet.readFailure?.(this)) throw new Error('synthetic read failure');
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.cells.get(`${this.row + r},${this.column + c}`) ?? ''));
  }
  getFormulas() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => {
      const v = this.sheet.cells.get(`${this.row + r},${this.column + c}`);
      return typeof v === 'string' && v.startsWith('=') ? v : '';
    }));
  }
  setNumberFormat() { return this; }
  setValues(values) {
    const fault = this.sheet.writeFailure?.(this, values);
    let n = 0;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.columns; c++) {
      if (!fault || n < fault.after) this.sheet.cells.set(`${this.row + r},${this.column + c}`, values[r][c]);
      n++;
    }
    this.sheet.writes.push({ row: this.row, column: this.column, rows: this.rows, columns: this.columns });
    if (fault) throw new Error('synthetic interrupted write');
    return this;
  }
  createTextFinder(value) {
    const range = this;
    const finder = {
      entire: false,
      matchEntireCell(v) { this.entire = v; return this; }, useRegularExpression() { return this; },
      findAll() {
        range.sheet.searches.push({ row: range.row, column: range.column, rows: range.rows });
        const found = [];
        for (let r = 0; r < range.rows; r++) for (let c = 0; c < range.columns; c++) {
          const cell = String(range.sheet.cells.get(`${range.row + r},${range.column + c}`) ?? '');
          if (this.entire ? cell === value : cell.includes(value)) found.push(new FakeRange(range.sheet, range.row + r, range.column + c));
        }
        return found;
      }
    };
    return finder;
  }
}
export class FakeSheet {
  constructor(name, rows, columns, hidden) {
    Object.assign(this, { name, rows, columns, hidden });
    this.cells = new Map(); this.reads = []; this.writes = []; this.searches = []; this.protections = [];
  }
  getRange(...args) { return new FakeRange(this, ...args); }
  getMaxRows() { return this.rows; }
  getMaxColumns() { return this.columns; }
  getLastRow() { return Math.max(0, ...[...this.cells.entries()].filter(([, v]) => v !== '').map(([key]) => Number(key.split(',')[0]))); }
  getProtections(type) { return type === 'SHEET' ? this.sheetProtections || [] : this.protections; }
  isSheetHidden() { return this.hidden; }
  protectRange(row, column, rows, columns, options = {}) {
    const range = this.getRange(row, column, rows, columns);
    const p = { getRange: () => range, isWarningOnly: () => !!options.warning, canEdit: () => !!options.editable };
    this.protections.push(p); return p;
  }
}

export function setup(options = {}) {
  let clock = options.now || Date.UTC(2026, 9, 15), nextId = 1;
  const account = options.account || 'student@example.test', owner = 'teacher@example.test';
  const config = { enabled: true, bindingKey: 'synthetic-test-key-only-32-characters', allowedOrigins: ['https://school.example'], allowedDomains: ['example.test'], teacherOwners: [owner], bindingLifetimeMs: 3600000, ...options.config };
  const env = { SpreadsheetApp: { ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' } } };
  const { context, contract: T } = loadStore(env), C = T.constants;
  const guide = new FakeSheet(C.GUIDE, 100, 2, false), data = new FakeSheet(C.SHEET, C.DRAFT_ROWS, 14, true), history = new FakeSheet(C.HISTORY, C.HISTORY_ROWS, 14, true);
  const generation = 'a'.repeat(32), spreadsheetId = 'synthetic_spreadsheet_identifier_0001';
  guide.getRange(1, 1, 6, 2).setValues([['schemaVersion', 1], ['actorKey', T.actorKey(account)], ['generation', generation], ['state', 'active'], ['kind', C.KIND], ['teacherOwner', owner]]);
  guide.protectRange(1, 1, 6, 2);
  for (const sheet of [data, history]) { sheet.getRange(1, 1, 1, 14).setValues([[...C.HEADERS]]); sheet.protectRange(1, 1, 1, 14); sheet.writes = []; }
  const book = { getSheetByName: name => ({ [C.GUIDE]: guide, [C.SHEET]: data, [C.HISTORY]: history })[name] || null,
    getOwner: () => ({ getEmail: () => owner }), getEditors: () => [{ getEmail: () => account }] };
  const locks = { held: false, acquisitions: 0, releases: 0, denied: false };
  const identity = { active: account, effective: account };
  const dependencies = {
    now: () => clock, uuid: () => (nextId++).toString(16).padStart(32, '0'), openBook: id => { if (id !== spreadsheetId) throw new Error('wrong book'); return book; }, owner: () => owner, canEdit: () => true, identity: () => identity,
    lock: () => ({ tryLock() { if (locks.held || locks.denied) return false; locks.held = true; locks.acquisitions++; return true; }, releaseLock() { locks.held = false; locks.releases++; } }), flush() {}
  };
  const service = context.ToolsStoreService.create(config, dependencies);
  function issue(overrides = {}) { return T.issueBinding({ account, spreadsheetId, generation, tool: 'python', origin: config.allowedOrigins[0], ...overrides }, config, clock); }
  const binding = issue();
  function call(action, input = {}, token = binding, origin = config.allowedOrigins[0]) { return service.call(action, input, token, origin); }
  function save(overrides = {}) {
    return call('saveDraft', { tool: 'python', questionId: 'demo-q1', version: 'v1', setId: 'demo', title: '問題', folder: '', requestId: (nextId++).toString(16).padStart(32, '0'), clientId: 'b'.repeat(32), expectedRevision: null, code: 'print(1)', stdin: '', ...overrides });
  }
  return { T, C, context, config, service, dependencies, guide, data, history, book, locks, identity, call, save, issue, binding, advance: ms => { clock += ms; } };
}
