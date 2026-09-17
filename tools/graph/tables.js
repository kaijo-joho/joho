(function (root, factory) {
  const calculations = typeof module === 'object' && module.exports ? require('./calculations.js') : root.GraphCalculations;
  const api = factory(calculations);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphTables = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Calculations) {
  'use strict';
  const fail = message => { throw new Error(message); };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const TYPES = ['number', 'date', 'category'];
  function dateString(value, position = '') {
    if (typeof value !== 'string') fail(position + '：日付は YYYY-MM-DD、YYYY/M/D、または YYYY-MM で入力してください。');
    const match = value.trim().match(/^(\d{4})([-\/])(\d{1,2})(?:\2(\d{1,2}))?$/);
    if (!match) fail(position + '：日付の形式が不正です。');
    const year = +match[1], month = +match[3], day = match[4] === undefined ? null : +match[4];
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day !== null && (day < 1 || day > 31)) fail(position + '：日付が不正です。');
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day ?? 1); date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || day !== null && date.getUTCDate() !== day) fail(position + '：日付が不正です。');
    return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + (day === null ? '' : '-' + String(day).padStart(2, '0'));
  }
  function dateNumber(value, position = '') {
    const parts = dateString(value, position).split('-'), date = new Date(0);
    date.setUTCFullYear(+parts[0], +parts[1] - 1, +(parts[2] || 1)); date.setUTCHours(0, 0, 0, 0);
    return date.getTime() / 86400000;
  }
  function dateFromNumber(day) {
    if (!Number.isInteger(day)) fail('日付の数値が不正です。');
    const date = new Date(day * 86400000);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) fail('日付の数値が不正です。');
    return date.toISOString().slice(0, 10);
  }
  function dateTicks(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [];
    const firstDay = dateNumber('0001-01-01'), lastDay = dateNumber('9999-12-31');
    min = Math.max(firstDay, min); max = Math.min(lastDay, max);
    if (min > max) return [];
    const span = max - min, ticks = [];
    if (span <= 100) {
      const step = span > 45 ? 7 : span > 14 ? 2 : 1;
      for (let day = Math.ceil(min / step) * step; day <= max && ticks.length < 100; day += step) ticks.push(day);
    } else {
      const start = new Date(Math.floor(min) * 86400000);
      const step = span > 365 * 3 ? 12 * Math.max(1, Math.ceil(span / 365.2425 / 8)) : span > 365 ? 2 : 1;
      let month = start.getUTCFullYear() * 12 + (step >= 12 ? 0 : start.getUTCMonth());
      for (let count = 0; count < 100; count++, month += step) {
        const date = new Date(0); date.setUTCFullYear(Math.floor(month / 12), month % 12, 1); date.setUTCHours(0,0,0,0);
        const day = date.getTime() / 86400000;
        if (day > max) break;
        if (day >= min) ticks.push(day);
      }
    }
    return ticks;
  }
  function categoryString(value, position = '') {
    if (typeof value !== 'string') fail(position + '：カテゴリは文字列で入力してください。');
    const clean = value.trim();
    if (!clean || clean.length > 160 || /[\r\n\x00-\x1f]/.test(clean)) fail(position + '：カテゴリは改行なし160文字以内で入力してください。');
    return clean;
  }
  function cell(value, position = '', type = 'number') {
    if (!TYPES.includes(type)) fail('列の種類が不正です。');
    if (value === null || typeof value === 'string' && value.trim() === '') return null;
    if (type === 'date') { dateString(value, position); return value.trim(); }
    if (type === 'category') return categoryString(value, position);
    const number = typeof value === 'number' ? value : typeof value === 'string' && numeric.test(value.trim()) ? Number(value) : NaN;
    if (!Number.isFinite(number) || Math.abs(number) > 1e9) fail(position + '：数値は絶対値10億以内で入力してください。欠測は空欄にします。');
    return number;
  }
  function validatedTable(table, kind = 'data2d') {
    if (!['data2d', 'data3d'].includes(kind) || !isObject(table) || !Array.isArray(table.columns) || table.columns.length < (kind === 'data3d' ? 3 : 2) || table.columns.length > 20 || !Array.isArray(table.rows) || table.rows.length > 10000 || !isObject(table.mapping)) fail('数表は2〜20列・10000行以内にしてください。');
    const columns = table.columns.map((name, index) => {
      if (typeof name !== 'string' || !name.trim() || name.length > 80 || /[\r\n\x00-\x1f]/.test(name)) fail((index + 1) + '列目の名前を80文字以内で入力してください。');
      return name;
    });
    const types = own(table, 'columnTypes') ? table.columnTypes : columns.map(() => 'number');
    if (!Array.isArray(types) || types.length !== columns.length || types.some(type => !TYPES.includes(type))) fail('列の種類が不正です。');
    const formulas = own(table, 'formulas') ? table.formulas : columns.map(() => null);
    if (!Array.isArray(formulas) || formulas.length !== columns.length || formulas.some((value,index) => value !== null && (typeof value !== 'string' || !value.trim() || value.length > 1000 || types[index] !== 'number'))) fail('計算列は数値列に1000文字以内の式を指定してください。');
    const hasFormulas = formulas.some(value => value !== null);
    const mapping = {};
    for (const key of ['x', 'y', 'z', 'errorX', 'errorY']) {
      const index = table.mapping[key];
      if (index !== null && (!Number.isInteger(index) || index < 0 || index >= columns.length)) fail('描画する列の割当が不正です。');
      mapping[key] = index;
    }
    if (mapping.x === null || mapping.y === null || mapping.x === mapping.y || (kind === 'data2d' ? mapping.z !== null : mapping.z === null || [mapping.x, mapping.y].includes(mapping.z) || mapping.errorX !== null || mapping.errorY !== null)) fail('座標には異なる列を割り当ててください。');
    for (const key of ['errorX', 'errorY']) if (mapping[key] !== null && ([mapping.x, mapping.y].includes(mapping[key]) || types[mapping[key]] !== 'number')) fail('誤差棒には座標と異なる数値列を割り当ててください。');
    if (kind === 'data3d' && [mapping.x, mapping.y, mapping.z].some(index => types[index] !== 'number')) fail('3Dの座標には数値列を指定してください。');
    const rows = table.rows.map((row, r) => {
      if (!Array.isArray(row) || row.length !== columns.length) fail((r + 1) + '行目の列数が一致しません。');
      return row.map((value, c) => {
        if (formulas[c] !== null) return null; // Formula results are derived from the source values.
        if (types[c] === 'number' && value !== null && typeof value !== 'number') fail((r + 1) + '行' + (c + 1) + '列目の値が不正です。');
        const clean = cell(value, (r + 1) + '行' + (c + 1) + '列目', types[c]);
        if ([mapping.errorX, mapping.errorY].includes(c) && clean !== null && clean < 0) fail((r + 1) + '行目：誤差棒は0以上の幅を指定してください。');
        return clean;
      });
    });
    const out = {columns, rows, mapping};
    if (types.some(type => type !== 'number')) out.columnTypes = types.slice();
    let errors = [];
    if (hasFormulas) {
      if (!Calculations) fail('計算列の処理を読み込めません。ページを再読み込みしてください。');
      out.formulas = formulas.slice();
      const result = Calculations.evaluate(out);
      out.rows = result.rows;
      errors = result.errors;
      for (const [index,row] of out.rows.entries()) for (const key of ['errorX','errorY']) if (mapping[key] !== null && row[mapping[key]] !== null && row[mapping[key]] < 0) fail((index + 1) + '行目：誤差棒は0以上の幅を指定してください。');
    }
    return {table:out, errors};
  }
  function validate(table, kind = 'data2d') {
    return validatedTable(table, kind).table;
  }
  function calculationErrors(table) {
    if (!table || !own(table, 'formulas')) return [];
    return validatedTable(table, table.mapping?.z === null ? 'data2d' : 'data3d').errors;
  }
  function calculationWarning(table) {
    const errors = calculationErrors(table);
    return errors.length ? '計算列に' + errors.length + '件のエラーがあります。該当値は描画・集計から除外しています。数表で理由を確認してください。' : '';
  }
  function project(table, kind = 'data2d', axes) {
    const clean = validate(table, kind), types = clean.columnTypes || clean.columns.map(() => 'number'), mapping = clean.mapping;
    const keys = kind === 'data3d' ? ['x', 'y', 'z'] : ['x', 'y'], categories = {};
    for (const key of keys) {
      const column = mapping[key];
      if (types[column] !== 'category') continue;
      const names = Array.isArray(axes?.[key]?.categories) ? axes[key].categories : [...new Set(clean.rows.map(row => row[column]).filter(value => value !== null))];
      categories[key] = new Map(names.map((value, index) => [value, index]));
    }
    const coordinate = (value, column, key) => {
      if (value === null) return null;
      if (types[column] === 'date') return dateNumber(value);
      if (types[column] === 'category') return categories[key].get(value) ?? null;
      return value;
    };
    const out = {rows:clean.rows.map(row => keys.map(key => coordinate(row[mapping[key]], mapping[key], key)))};
    if (kind === 'data2d') out.errorBars = {x:mapping.errorX === null ? [] : clean.rows.map(row => row[mapping.errorX]), y:mapping.errorY === null ? [] : clean.rows.map(row => row[mapping.errorY])};
    return out;
  }
  function assign(series, table, axes) {
    const clean = validate(table, series.kind);
    Object.assign(series, project(clean, series.kind, axes), {dataTable:clean});
    return series;
  }
  function fromSeries(series, symbols = {x:'x', y:'y', z:'z'}) {
    if (own(series, 'dataTable')) return validate(series.dataTable, series.kind);
    const is3 = series.kind === 'data3d', columns = is3 ? [symbols.x, symbols.y, symbols.z] : [symbols.x, symbols.y];
    const mapping = {x:0, y:1, z:is3 ? 2 : null, errorX:null, errorY:null}, rows = series.rows.map(row => row.slice());
    if (!is3) for (const [key, axis] of [['errorX', 'x'], ['errorY', 'y']]) if (series.errorBars?.[axis]?.length) {
      mapping[key] = columns.length; columns.push('Δ' + symbols[axis]); rows.forEach((row, index) => row.push(series.errorBars[axis][index]));
    }
    return validate({columns, rows, mapping}, series.kind);
  }
  function numericColumnIndices(table) {
    const clean = validate(table, table.mapping?.z === null ? 'data2d' : 'data3d'), types = clean.columnTypes || clean.columns.map(() => 'number');
    return types.flatMap((type, index) => type === 'number' ? [index] : []);
  }
  // RFC-style quoted fields, with comma or tab separators. Reject incomplete quotes.
  function fields(text) {
    if (typeof text !== 'string' || text.length > 1024 * 1024) fail('CSVは1MB以内にしてください。');
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    let quoted = false, firstLine = '';
    for (let i=0; i<normalized.length; i++) { const ch=normalized[i]; if(ch==='"') { if(quoted&&normalized[i+1]==='"'){i++;continue;} quoted=!quoted; } if(ch==='\n'&&!quoted)break; if(!quoted)firstLine+=ch; }
    const sep = firstLine.includes('\t') ? '\t' : ',', rows = []; let row = [], value = '', inQuote = false, closed = false;
    const pushRow = () => { row.push(value); if (row.some(v => v.trim() !== '') || row.length > 1) rows.push(row); row=[];value='';closed=false; if(rows.length>10001)fail('数表は10000行以内にしてください。'); };
    for (let i=0; i<normalized.length; i++) {
      const ch = normalized[i];
      if (inQuote) { if(ch==='"'&&normalized[i+1]==='"'){value+='"';i++;} else if(ch==='"'){inQuote=false;closed=true;} else value+=ch; }
      else if(ch==='"') { if(value!==''||closed)fail('CSVの引用符が不正です。');inQuote=true; }
      else if(ch===sep) {row.push(value);value='';closed=false; if(row.length>=20)fail('数表は20列以内にしてください。');}
      else if(ch==='\n')pushRow();
      else {if(closed)fail('CSVの引用符の後に区切りが必要です。');value+=ch;}
    }
    if(inQuote)fail('CSVの引用符が閉じていません。');
    if(value!==''||row.length||closed)pushRow();
    return rows;
  }

  function parse(text, kind = 'data2d') {
    const raw = fields(text), minimum = kind === 'data3d' ? 3 : 2;
    if (!raw.length) return validate({columns:minimum === 3 ? ['x','y','z'] : ['x','y'], rows:[], mapping:{x:0, y:1, z:minimum === 3 ? 2 : null, errorX:null, errorY:null}}, kind);
    const count = raw[0].length;
    if (count < minimum || count > 20) fail('数表の列数が不正です。');
    const isName = value => value.trim() !== '' && !numeric.test(value.trim()) && !/^\d{4}[-\/]\d{1,2}/.test(value.trim());
    const header = raw[0].every(isName);
    const columns = header ? raw.shift().map(value => value.trim()) : Array.from({length:count}, (_,index) => index < minimum ? ['x','y','z'][index] : '列' + (index + 1));
    // Validate row lengths before inspecting columns so malformed input yields a useful error.
    raw.forEach((row,index) => { if (row.length !== count) fail((index + 1 + (header ? 1 : 0)) + '行目の列数が一致しません。'); });
    const types = Array.from({length:count}, (_,column) => {
      const values = raw.map(row => row[column]).filter(value => value.trim() !== '');
      if (!values.length || values.some(value => numeric.test(value.trim()))) return 'number';
      if (values.some(value => /^\d{4}[-\/]\d{1,2}/.test(value.trim()))) return 'date';
      return 'category';
    });
    if (kind === 'data3d' && types.slice(0,3).some(type => type !== 'number')) fail('3Dの座標には数値列を指定してください。');
    const rows = raw.map((row,r) => row.map((value,c) => cell(value, (r + 1) + '行' + (c + 1) + '列目', types[c])));
    return validate({columns, columnTypes:types, rows, mapping:{x:0,y:1,z:minimum === 3 ? 2 : null,errorX:null,errorY:null}}, kind);
  }
  return {cell, recalculate:validatedTable, calculationErrors, calculationWarning, dateString, dateNumber, dateFromNumber, dateTicks, categoryString, validate, project, assign, fromSeries, numericColumnIndices, fields, parse};
});
