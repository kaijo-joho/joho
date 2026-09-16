(function (root, factory) {
  const tables = root.GraphTables || (typeof module === 'object' && module.exports ? require('./tables.js') : null);
  const api = factory(tables);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphDataImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GraphTables) {
  'use strict';
  const BYTE_LIMIT = 1024 * 1024, RECORD_LIMIT = 10050, COLUMN_LIMIT = 100;
  const fail = message => { throw new Error(message); };
  const missingTokens = new Set(['', 'na', 'n/a', 'null', 'nan', '--', '---', '…', '...', '×', 'x', '-']);
  // "番号" や "区分" は有用な数値軸にもなり得るため、品質を明示する語だけを扱う。
  const qualityName = /(品質|quality|flag|均質)/i;
  const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const decoder = (name, options) => {
    try { return new TextDecoder(name, options); } catch (_) { fail('この文字コードは読み取れません。UTF-8またはShift_JISのCSVを選んでください。'); }
  };
  function bytesOf(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    fail('読み込むデータが不正です。');
  }
  function decode(value, encoding = 'auto') {
    const bytes = bytesOf(value);
    if (bytes.byteLength > BYTE_LIMIT) fail('CSVは1MiB以内にしてください。');
    const bom16le = bytes[0] === 0xff && bytes[1] === 0xfe;
    const bom16be = bytes[0] === 0xfe && bytes[1] === 0xff;
    const bom8 = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    let name = encoding;
    if (encoding === 'auto') {
      if (bom16le) name = 'utf-16le';
      else if (bom16be) name = 'utf-16be';
      else if (bom8) name = 'utf-8';
      else {
        try { return {text: decoder('utf-8', {fatal:true}).decode(bytes), encoding:'utf-8'}; }
        catch (_) { name = 'shift_jis'; }
      }
    }
    const normalized = String(name).toLowerCase().replace(/[_ ]/g, '-');
    const label = normalized === 'sjis' || normalized === 'shift-jis' ? 'shift_jis' : normalized;
    try { return {text: decoder(label, {fatal:true, ignoreBOM:false}).decode(bytes), encoding: label === 'shift_jis' ? 'shift_jis' : label}; }
    catch (_) { fail('文字コードを読み取れません。UTF-8またはShift_JISを確認してください。'); }
  }
  function checkText(text) {
    if (typeof text !== 'string') fail('CSVの本文が不正です。');
    // The source bytes were bounded before decoding. Shift_JIS may grow when
    // re-encoded as UTF-8; bound the decoded string without rejecting that growth.
    if (text.length > BYTE_LIMIT) fail('CSVは1MiB以内にしてください。');
    const trimmed = text.replace(/^\uFEFF/, '').trimStart();
    if (/^(?:<!doctype\b|<html\b|<head\b|<body\b|<script\b)/i.test(trimmed)) fail('HTMLはCSVとして取り込めません。');
    if (/^(?:\{|\[)/.test(trimmed)) fail('JSONはCSVとして取り込めません。');
    if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail('バイナリ形式のデータは取り込めません。');
  }
  function parseWithDelimiter(text, delimiter) {
    const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const records = [], row = []; let value = '', quoted = false, closed = false;
    const push = () => {
      row.push(value); records.push(row.splice(0)); value = ''; closed = false;
      if (records.length > RECORD_LIMIT) fail('CSVは10050行以内にしてください。');
    };
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        if (ch === '"' && source[i + 1] === '"') { value += '"'; i++; }
        else if (ch === '"') { quoted = false; closed = true; }
        else value += ch;
      } else if (ch === '"') {
        if (value !== '' || closed) fail('CSVの引用符が不正です。');
        quoted = true;
      } else if (ch === delimiter) {
        row.push(value); value = ''; closed = false;
        if (row.length >= COLUMN_LIMIT) fail('CSVは100列以内にしてください。');
      } else if (ch === '\n') push();
      else {
        if (closed) fail('CSVの引用符の後に区切り文字が必要です。');
        value += ch;
      }
    }
    if (quoted) fail('CSVの引用符が閉じていません。');
    if (value !== '' || row.length || closed || source.endsWith('\n') === false) push();
    if (records.some(record => record.length > COLUMN_LIMIT)) fail('CSVは100列以内にしてください。');
    return records;
  }
  function bestDelimiter(text) {
    const options = [',', '\t', ';']; let best = ',', score = -Infinity;
    let columnLimitError = null;
    options.forEach(delimiter => {
      let records;
      try { records = parseWithDelimiter(text, delimiter); } catch (error) {
        if (/100列/.test(error.message)) columnLimitError = error;
        return;
      }
      const populated = records.filter(row => row.some(v => v.trim() !== ''));
      const frequency = new Map();
      populated.filter(row => row.length > 1).forEach(row => frequency.set(row.length, (frequency.get(row.length) || 0) + 1));
      let mode = 1, consistent = 0;
      frequency.forEach((count, width) => {
        if (count > consistent || count === consistent && width > mode) { mode = width; consistent = count; }
      });
      const candidate = (mode > 1 ? 100000 : 0) + consistent * 100 + mode;
      if (candidate > score) { score = candidate; best = delimiter; }
    });
    if (score < 100000 && columnLimitError) throw columnLimitError;
    return best;
  }
  function normalizeNumber(value) {
    return String(value).trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[＋－]/g, c => c === '＋' ? '+' : '-').replace(/，/g, ',').replace(/．/g, '.');
  }
  function missing(value) {
    const v = normalizeNumber(value).toLowerCase();
    return missingTokens.has(v) || /^\/+$/u.test(v);
  }
  function numberValue(value) {
    const v = normalizeNumber(value);
    if (missing(v)) return null;
    const plain = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(v) ? v.replace(/,/g, '') : v;
    if (!numericPattern.test(plain)) return undefined;
    const n = Number(plain);
    return Number.isFinite(n) && Math.abs(n) <= 1e9 ? n : undefined;
  }
  function dateValue(value) {
    const v = String(value).trim();
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(v);
    if (!match) return undefined;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : undefined;
  }
  function suggest(records) {
    let startRow = 1;
    for (let r = 0; r < records.length; r++) {
      const values = records[r].filter(v => !missing(v));
      // x=1, y=NA and "地域名,値" are both ordinary data rows.  A header row
      // contains no strict number or ISO date, so one such value is enough here.
      if (records[r].length >= 2 && (values.some(v => numberValue(v) !== undefined || dateValue(v) !== undefined) || values.length === 0 && r > 0 && records[r - 1].some(v => !missing(v)))) { startRow = r + 1; break; }
    }
    let headerRow = 0;
    if (startRow > 1) {
      const candidate = records[startRow - 2];
      if (candidate && candidate.some(v => String(v).trim() !== '') && candidate.filter(v => !missing(v) && numberValue(v) === undefined && dateValue(v) === undefined).length) headerRow = startRow - 1;
    }
    return {headerRow, startRow};
  }
  function parse(text, options = {}) {
    checkText(text);
    const requested = options.delimiter === undefined ? 'auto' : options.delimiter;
    if (!['auto', ',', '\t', ';'].includes(requested)) fail('区切り文字の指定が不正です。');
    const delimiter = requested === 'auto' ? bestDelimiter(text) : requested;
    const records = parseWithDelimiter(text, delimiter);
    return {records, delimiter, suggested:suggest(records)};
  }
  function inspect(parsed, options = {}) {
    if (!parsed || !Array.isArray(parsed.records)) fail('CSVの解析結果が不正です。');
    const records = parsed.records;
    const suggested = parsed.suggested || suggest(records);
    const headerRow = options.headerRow === undefined ? suggested.headerRow : options.headerRow;
    const startRow = options.startRow === undefined ? suggested.startRow : options.startRow;
    if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow > records.length || !Number.isInteger(startRow) || startRow < 1 || startRow > records.length + 1 || headerRow >= startRow) fail('見出し行またはデータ開始行が不正です。');
    const width = Math.max(0, ...records.map(row => row.length));
    const rows = records.slice(startRow - 1);
    const headerName = index => {
      if (!headerRow) return '列' + (index + 1);
      const current = (records[headerRow - 1][index] || '').replace(/\s+/g, ' ').trim();
      let earlier = '';
      for (let r = headerRow - 2; r >= 0; r--) {
        const value = (records[r][index] || '').replace(/\s+/g, ' ').trim();
        if (value) { earlier = value; break; }
      }
      if (!current) return earlier || '列' + (index + 1);
      // A final units row is often selected as the nearest header in public CSVs.
      // Retain the preceding label without preventing manual header-row selection.
      if (earlier && /^(?:[\[\(（【].+[\]\)）】]|[℃°%]|mm|hPa)$/i.test(current)) return earlier + ' ' + current;
      return current;
    };
    const columns = Array.from({length:width}, (_, index) => {
      const name = headerName(index);
      let numeric = 0, missingCount = 0, invalid = 0, dates = 0, values = 0;
      rows.forEach(row => {
        const value = row[index] === undefined ? '' : row[index];
        if (missing(value)) { missingCount++; return; }
        values++;
        if (numberValue(value) !== undefined) numeric++;
        else if (dateValue(value) !== undefined) dates++;
        else invalid++;
      });
      // A column with otherwise consistent values remains selectable so that the
      // preview can show its exceptional cells and the user can choose how to
      // handle them. Mixed number/date columns remain text.
      const type = values === 0 ? 'empty' : numeric > 0 && dates === 0 ? 'number' : dates > 0 && numeric === 0 ? 'date' : 'text';
      return {index, name, type, numeric, missing:missingCount, invalid, quality:qualityName.test(name)};
    });
    const usable = columns.filter(column => !column.quality && (column.type === 'number' || column.type === 'date'));
    const x = (usable.find(column => column.type === 'date') || usable[0] || columns[0] || {index:0}).index;
    const y = (usable.find(column => column.type === 'number' && column.index !== x) || usable.find(column => column.index !== x) || columns[1] || {index:1}).index;
    const z = (usable.find(column => column.type === 'number' && ![x,y].includes(column.index)) || {}).index;
    return {headerRow, startRow, columns, rows, suggested:{x, y, z:Number.isInteger(z) ? z : null}};
  }
  function project(inspection, options = {}) {
    if (!GraphTables) fail('数表モジュールを読み込めません。');
    const kind = options.kind || 'data2d';
    if (!['data2d','data3d'].includes(kind) || !inspection || !Array.isArray(inspection.columns) || !Array.isArray(inspection.rows)) fail('取込設定が不正です。');
    const axes = {x: options.x === undefined ? inspection.suggested.x : options.x, y: options.y === undefined ? inspection.suggested.y : options.y, z: kind === 'data3d' ? (options.z === undefined ? inspection.suggested.z : options.z) : null};
    const axisList = kind === 'data3d' ? [axes.x,axes.y,axes.z] : [axes.x,axes.y];
    if (axisList.some(i => !Number.isInteger(i)) || new Set(axisList).size !== axisList.length) fail('x・y・zには異なる列を指定してください。');
    axisList.forEach(i => { const column=inspection.columns[i]; if (!column || !['number','date'].includes(column.type) || (i !== axes.x && column.type !== 'number')) fail('軸には数値列を指定してください。'); });
    let selected;
    if (options.columns === undefined) {
      selected = axisList.slice();
      inspection.columns.filter(c => c.type === 'number' && !c.quality && !selected.includes(c.index)).slice(0, 20 - selected.length).forEach(c => selected.push(c.index));
    } else {
      if (!Array.isArray(options.columns)) fail('取り込む列の指定が不正です。');
      selected = options.columns.slice();
    }
    if (selected.some(i => !Number.isInteger(i) || !inspection.columns[i]) || new Set(selected).size !== selected.length) fail('取り込む列の指定が不正です。');
    axisList.forEach(i => { if (!selected.includes(i)) selected.unshift(i); });
    if (selected.length > 20) fail('取り込む列は20列以内にしてください。');
    if (selected.some(i => !['number','date'].includes(inspection.columns[i].type))) fail('文字列または空の列は数表に取り込めません。');
    const notes = [], xColumn = inspection.columns[axes.x];
    if (selected.some(i => inspection.columns[i].quality)) notes.push('品質情報の列を明示して数表へ含めます。');
    const omitted = inspection.columns.filter(c => !selected.includes(c.index)).map(c => c.name);
    const textNames = inspection.columns.filter(c => c.type === 'text' && !selected.includes(c.index)).map(c => c.name);
    if (textNames.length) notes.push('文字列の列は数表へ含めません：' + textNames.join('、'));
    if (omitted.length) notes.push('取り込まなかった列：' + omitted.join('、'));
    const dateMode = options.dateMode || 'days';
    if (!['days','year','month'].includes(dateMode)) fail('日付の変換方法が不正です。');
    const filter = options.filter;
    if (filter && (!Number.isInteger(filter.column) || !inspection.columns[filter.column] || typeof filter.value !== 'string')) fail('抽出条件が不正です。');
    let filteredRows=0, blankRows=0, missingCount=0, invalidCount=0;
    const kept = [];
    inspection.rows.forEach((row, rowIndex) => {
      if (row.every(value => value === '')) { blankRows++; return; }
      if (row.length !== inspection.columns.length) fail((inspection.startRow + rowIndex) + '行目の列数が一致しません。行末の説明も列として確認してください。');
      if (filter && row[filter.column] !== filter.value) { filteredRows++; return; }
      kept.push({row, rowIndex});
    });
    if (blankRows) notes.push('空文字だけの' + blankRows + '行は数表から除外しました。');
    if (filter) notes.push('抽出：' + inspection.columns[filter.column].name + ' が「' + filter.value + '」の行（対象外 ' + filteredRows + '行）');
    let dateOrigin = null;
    if (xColumn.type === 'date' && dateMode === 'days') for (const item of kept) { const date=dateValue(item.row[axes.x]); if (date) { dateOrigin=date; break; } }
    if (xColumn.type === 'date' && dateMode === 'days' && !dateOrigin) fail('抽出後に有効な日付がないため、経過日数へ変換できません。');
    const dateNumber = value => {
      const date = dateValue(value); if (!date) return undefined;
      if (dateMode === 'days') return (date.getTime() - dateOrigin.getTime()) / 86400000;
      if (dateMode === 'year') return date.getUTCFullYear();
      return date.getUTCMonth() + 1;
    };
    const rows = kept.map(item => selected.map(index => {
      const row = item.row;
      const raw = row[index];
      if (missing(raw)) { missingCount++; return null; }
      const value = index === axes.x && xColumn.type === 'date' ? dateNumber(raw) : numberValue(raw);
      if (value === undefined) {
        invalidCount++;
        if (options.invalidAsMissing === true) return null;
        fail((inspection.startRow + item.rowIndex) + '行' + (index + 1) + '列目に数値として扱えない値があります。欠測として扱う場合は設定を変更してください。');
      }
      return value;
    }));
    const columns = selected.map(index => {
      if (index !== axes.x || xColumn.type !== 'date') return inspection.columns[index].name;
      if (dateMode === 'days') return xColumn.name + '（' + dateOrigin.toISOString().slice(0,10) + 'からの経過日）';
      return xColumn.name + (dateMode === 'year' ? '（年）' : '（月）');
    });
    const mapping = {x:selected.indexOf(axes.x), y:selected.indexOf(axes.y), z:kind === 'data3d' ? selected.indexOf(axes.z) : null, errorX:null, errorY:null};
    const table = GraphTables.validate({columns, rows, mapping}, kind);
    if (xColumn.type === 'date') {
      if (dateMode === 'days') notes.push('日付の横軸は' + dateOrigin.toISOString().slice(0,10) + 'を起点とする経過日数（日）です。');
      else if (dateMode === 'year') notes.push('日付の横軸は年（西暦）に変換しました。');
      else notes.push('日付の横軸は月（1〜12）に変換しました。年は値に含めません。');
    }
    if (missingCount) notes.push('欠測トークンを空欄として取り込みました：' + missingCount + 'セル。');
    if (invalidCount) notes.push('数値として扱えない値を空欄として取り込みました：' + invalidCount + 'セル。');
    return {table, summary:{rows:rows.length, missing:missingCount, invalid:invalidCount, omittedColumns:omitted, filteredRows}, notes};
  }
  return {decode, parse, inspect, project, numberValue, dateValue};
});
