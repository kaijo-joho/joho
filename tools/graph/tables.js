(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphTables = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fail = message => { throw new Error(message); };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  function cell(value, position = '') {
    if (value === null || typeof value === 'string' && value.trim() === '') return null;
    const number = typeof value === 'number' ? value : typeof value === 'string' && numeric.test(value.trim()) ? Number(value) : NaN;
    if (!Number.isFinite(number) || Math.abs(number) > 1e9) fail(position + '：数値は絶対値10億以内で入力してください。欠測は空欄にします。');
    return number;
  }
  function validate(table, kind = 'data2d') {
    if (!['data2d', 'data3d'].includes(kind) || !isObject(table) || !Array.isArray(table.columns) || table.columns.length < (kind === 'data3d' ? 3 : 2) || table.columns.length > 20 || !Array.isArray(table.rows) || table.rows.length > 10000 || !isObject(table.mapping)) fail('数表は2〜20列・10000行以内にしてください。');
    const columns = table.columns.map((name, index) => {
      if (typeof name !== 'string' || !name.trim() || name.length > 80 || /[\r\n\x00-\x1f]/.test(name)) fail((index + 1) + '列目の名前を80文字以内で入力してください。');
      return name;
    });
    const mapping = {};
    for (const key of ['x','y','z','errorX','errorY']) {
      const index = table.mapping[key];
      if (index !== null && (!Number.isInteger(index) || index < 0 || index >= columns.length)) fail('描画する列の割当が不正です。');
      mapping[key] = index;
    }
    if (mapping.x === null || mapping.y === null || mapping.x === mapping.y || (kind === 'data2d' ? mapping.z !== null : mapping.z === null || [mapping.x,mapping.y].includes(mapping.z) || mapping.errorX !== null || mapping.errorY !== null)) fail('座標には異なる列を割り当ててください。');
    for (const key of ['errorX','errorY']) if (mapping[key] !== null && [mapping.x,mapping.y].includes(mapping[key])) fail('誤差棒には座標と異なる列を割り当ててください。');
    const rows = table.rows.map((row, r) => {
      if (!Array.isArray(row) || row.length !== columns.length) fail((r + 1) + '行目の列数が一致しません。');
      return row.map((v, c) => {
        if (v !== null && typeof v !== 'number') fail((r + 1) + '行' + (c + 1) + '列目の値が不正です。');
        const value = cell(v, (r + 1) + '行' + (c + 1) + '列目');
        if ([mapping.errorX,mapping.errorY].includes(c) && value !== null && value < 0) fail((r + 1) + '行目：誤差棒は0以上の幅を指定してください。');
        return value;
      });
    });
    return {columns, rows, mapping};
  }
  function project(table, kind = 'data2d') {
    const t = validate(table, kind), m = t.mapping;
    const out = {rows:t.rows.map(row => (kind === 'data3d' ? [m.x,m.y,m.z] : [m.x,m.y]).map(i => row[i]))};
    if (kind === 'data2d') out.errorBars = {x:m.errorX === null ? [] : t.rows.map(row => row[m.errorX]), y:m.errorY === null ? [] : t.rows.map(row => row[m.errorY])};
    return out;
  }
  function assign(series, table) {
    const clean = validate(table, series.kind), projected = project(clean, series.kind);
    Object.assign(series, projected, {dataTable:clean});
    return series;
  }
  function fromSeries(series, symbols = {x:'x',y:'y',z:'z'}) {
    if (own(series,'dataTable')) return validate(series.dataTable, series.kind);
    const is3 = series.kind === 'data3d', columns = is3 ? [symbols.x,symbols.y,symbols.z] : [symbols.x,symbols.y];
    const mapping = {x:0,y:1,z:is3?2:null,errorX:null,errorY:null}, rows = series.rows.map(row => row.slice());
    if (!is3) for (const [key, axis] of [['errorX','x'],['errorY','y']]) if (series.errorBars?.[axis]?.length) {
      mapping[key] = columns.length; columns.push('Δ' + symbols[axis]); rows.forEach((row,i) => row.push(series.errorBars[axis][i]));
    }
    return validate({columns,rows,mapping}, series.kind);
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
    if (!raw.length) return validate({columns:minimum===3?['x','y','z']:['x','y'],rows:[],mapping:{x:0,y:1,z:minimum===3?2:null,errorX:null,errorY:null}},kind);
    const count=raw[0].length;
    if(count<minimum||count>20)fail('数表の列数が不正です。');
    const isName = v => v.trim()!==''&&!numeric.test(v.trim()), header = raw[0].every(isName);
    if(!header && raw[0].some(isName))fail('見出し行はすべての列に名前を付けてください。');
    const columns = header ? raw.shift().map(v=>v.trim()) : Array.from({length:count},(_,i)=>i<minimum?['x','y','z'][i]:'列'+(i+1));
    const rows = raw.map((row,r)=>{if(row.length!==count)fail((r+1+(header?1:0))+'行目の列数が一致しません。');return row.map((v,c)=>cell(v,(r+1)+'行'+(c+1)+'列目'));});
    const mapping = {x:0,y:1,z:minimum===3?2:null,errorX:null,errorY:null};
    // Extra numeric columns remain available for statistics; assigning an error column is explicit.
    return validate({columns,rows,mapping},kind);
  }
  return {cell,validate,project,assign,fromSeries,fields,parse};
});
