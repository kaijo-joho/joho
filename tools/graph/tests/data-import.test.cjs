const assert = require('assert');
const Import = require('../data-import.js');

const parsed = Import.parse('資料の説明\n日付,値,品質情報\n2026/2/28,"1,200",8\n2026-02-29,NA,9\n\n');
assert.equal(parsed.delimiter, ',');
assert.deepEqual(parsed.suggested, {headerRow:2, startRow:3});
const inspected = Import.inspect(parsed);
assert.equal(inspected.columns[0].type, 'date');
assert.equal(inspected.columns[1].type, 'number');
assert.equal(inspected.columns[2].quality, true);
assert.equal(inspected.columns[1].missing, 2);
const out = Import.project(inspected, {kind:'data2d', x:0, y:1, invalidAsMissing:true});
assert.deepEqual(out.table.rows, [[0,1200],[null,null]]);
assert.match(out.table.columns[0], /経過日/);
assert.equal(out.summary.rows, 2);
assert.match(out.notes.join(' '), /空文字だけ/);

assert.deepEqual(Import.parse('a;b\n"x\ny";2', {delimiter:';'}).records, [['a','b'],['x\ny','2']]);
assert.equal(Import.numberValue('１，２３４.５e1'), 12345);
assert.equal(Import.numberValue('-1,234'), -1234);
assert.equal(Import.numberValue('1 2'), undefined);
assert.equal(Import.dateValue('2024-02-29').toISOString().slice(0,10), '2024-02-29');
assert.equal(Import.dateValue('2025-02-29'), undefined);
assert.throws(() => Import.parse('<html>no</html>'), /HTML/);
assert.throws(() => Import.project(Import.inspect(Import.parse('x,y\n1,2\n3,注記'))), /数値として/);
assert.throws(() => Import.project(Import.inspect(Import.parse('x,y\n1,2\n3'))), /列数/);
const filtered = Import.project(Import.inspect(Import.parse('x,y,地域\n1,2,A\n3,4,B')), {x:0,y:1,filter:{column:2,value:'B'}});
assert.deepEqual(filtered.table.rows, [[3,4]]);
assert.equal(filtered.summary.filteredRows, 1);

assert.equal(Import.decode(new TextEncoder().encode('x,y\n1,2')).encoding, 'utf-8');
assert.equal(Import.decode(Uint8Array.from([0xef,0xbb,0xbf,0x78,0x2c,0x79])).text, 'x,y');
assert.match(Import.decode(Uint8Array.from([0x93,0xfa,0x2c,0x92,0x6c,0x0a,0x31,0x2c,0x32])).text, /^日,値/);
assert.equal(Import.decode(Buffer.from('\ufeffx,y', 'utf16le')).encoding, 'utf-16le');
assert.throws(() => Import.decode(new Uint8Array(1024 * 1024 + 1)), /1MiB/);
assert.throws(() => Import.parse('x'.repeat(1024 * 1024 + 1)), /1MiB/);
assert.throws(() => Import.parse('x\n'.repeat(10051)), /10050行/);
assert.throws(() => Import.parse(Array.from({length:101}, () => 'x').join(',')), /100列/);
assert.equal(Import.inspect(Import.parse('"年\n西暦",値\n2026,2')).columns[0].name, '年 西暦');
const sjisLarge = Buffer.alloc(700000); for (let i=0;i<sjisLarge.length;i+=2) { sjisLarge[i]=0x93;sjisLarge[i+1]=0xfa; }
assert.equal(Import.parse(Import.decode(sjisLarge).text).records[0][0].length, 350000, '文字コード変換後のUTF-8バイト数だけで元ファイルを拒否しない');

const leadingMissing = Import.parse('x,y\n1,NA\n2,3');
assert.deepEqual(leadingMissing.suggested, {headerRow:1, startRow:2});
const allMissing = Import.project(Import.inspect(Import.parse('x,y\nNA,NA\n1,2')));
assert.deepEqual(allMissing.table.rows, [[null,null],[1,2]]);
const months = Import.project(Import.inspect(Import.parse('日付,値\n2026-01-31,1\n2027-12-01,2')), {x:0,y:1,dateMode:'month'});
assert.deepEqual(months.table.rows, [[1,1],[12,2]]);
assert.match(months.table.columns[0], /月/);
assert.match(months.notes.join(' '), /1〜12/);
assert.throws(() => Import.project(Import.inspect(Import.parse('日付,値\n2026-01-01,1\nNA,2')), {x:0,y:1,filter:{column:1,value:'2'}}), /有効な日付/);

const tenThousand = 'x,y\n' + Array.from({length:10000}, (_, i) => i + ',' + (i + 1)).join('\n');
const largeParsed = Import.parse(tenThousand);
assert.equal(largeParsed.records.length, 10001);
assert.equal(Import.project(Import.inspect(largeParsed)).table.rows.length, 10000);
console.log('data import tests passed');
