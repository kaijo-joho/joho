const assert=require('node:assert/strict');
const C=require('../calculations.js');

assert.equal(C.reference('気温',true),'[@気温]');
assert.equal(C.reference('気温',true,-1),'[@気温,-1]');
assert.equal(C.reference('気温',true,1),'[@気温,+1]');
assert.equal(C.reference('気温',true,-2,0),'[@気温,-2:0]');
assert.equal(C.reference('気温,-1',true,-2,0),'[@"気温,-1",-2:0]');
assert.equal(C.reference('気温:補正'),'["気温:補正"]');
assert.throws(()=>C.reference('x',false,1),/行オフセット/);
assert.throws(()=>C.reference('x',true,0.5),/整数/);

let source={columns:['x','prev','next'],rows:[[10,null,null],[20,null,null],[30,null,null]],formulas:[null,'[@x,-1]','[@x,+1]']};
let out=C.evaluate(source);
assert.deepEqual(out.rows,[[10,null,20],[20,10,30],[30,20,null]]);
assert.deepEqual(out.errors,[]);
assert.deepEqual(source.rows,[[10,null,null],[20,null,null],[30,null,null]],'入力を変更しない');

const kinds=['SUM','AVERAGE','MIN','MAX','COUNT','STDEV.P','STDEV.S'];
out=C.evaluate({
  columns:['x',...kinds],
  rows:[[1,...Array(kinds.length).fill(null)],[2,...Array(kinds.length).fill(null)],[3,...Array(kinds.length).fill(null)]],
  formulas:[null,...kinds.map(kind=>kind+'([@x,-1:+1])')]
});
assert.deepEqual(out.rows[0].slice(1),Array(kinds.length).fill(null),'端の不完全な範囲は集計しない');
assert.deepEqual(out.rows[2].slice(1),Array(kinds.length).fill(null),'末尾の不完全な範囲は集計しない');
assert.deepEqual(out.rows[1].slice(1),[6,2,1,3,3,Math.sqrt(2/3),1]);
assert.deepEqual(out.errors,[]);

out=C.evaluate({columns:['x','sum','count','mean'],rows:[[1,null,null,null],[null,null,null,null],[3,null,null,null]],formulas:[null,'SUM([@x,-1:+1])','COUNT([@x,-1:+1])','AVERAGE([@x,-1:+1])']});
assert.deepEqual(out.rows[1].slice(1),[4,2,2],'完全な範囲内のnullは既存の集計規則どおり除外する');
out=C.evaluate({columns:['x','sum'],rows:[[1e9,null],[1e-8,null],[-1e9,null]],formulas:[null,'SUM([@x,-1:+1])']});
assert.ok(Math.abs(out.rows[1][1]-1e-8)<1e-20,'範囲集計も補償和を使う');

out=C.evaluate({
  columns:['x','bad','window'],
  rows:[[2,null,null],[0,null,null],[2,null,null],[2,null,null]],
  formulas:[null,'1/[@x]','SUM([@bad,-1:0])']
});
assert.equal(out.rows[0][2],null,'不完全範囲では先行行のエラーを伝播しない');
assert.equal(out.rows[1][2],null);
assert.equal(out.rows[2][2],null);
assert.equal(out.rows[3][2],1);
assert.deepEqual(out.errors.map(error=>[error.row,error.column]),[[1,1],[1,2],[2,2]],'完全な範囲に入るエラーだけを伝播する');

assert.throws(()=>C.evaluate({columns:['x','z'],rows:[[1,null]],formulas:[null,'[@x,-1:0]+1']}),/行範囲/);
assert.throws(()=>C.evaluate({columns:['x','z'],rows:[[1,null]],formulas:[null,'SUM([@x,-1])']}),/集計関数/);
assert.throws(()=>C.evaluate({columns:['x','z'],rows:[[1,null]],formulas:[null,'[@x,]']}),/オフセット/);
assert.throws(()=>C.evaluate({columns:['x','z'],rows:[[1,null]],formulas:[null,'[@"x",]']}),/オフセット/);
assert.throws(()=>C.evaluate({columns:['x','z'],rows:[[1,null]],formulas:[null,'SUM([@x,-1.5:0])']}),/オフセット/);
assert.throws(()=>C.evaluate({columns:['x','z'],rows:[[1,null]],formulas:[null,'SUM([@x,1:-1])']}),/開始/);
assert.throws(()=>C.evaluate({columns:['x','z'],rows:[[1,null]],formulas:[null,'SUM([@x,-10001:0])']}),/10000/);
assert.throws(()=>C.evaluate({columns:['kind','z'],columnTypes:['category','number'],rows:[['A',null]],formulas:[null,'[@kind,-1]']}),/数値/);
assert.throws(()=>C.evaluate({columns:['x'],rows:[[1]],formulas:['[@x,-1]']}),/自分自身/);
assert.throws(()=>C.evaluate({columns:['a','b'],rows:[[1,2]],formulas:['[@b,-1]','[@a,+1]']}),/循環/);

out=C.evaluate({columns:['気温,-1','気温:補正','z'],rows:[[2,3,null]],formulas:[null,null,'[@"気温,-1"]+[@"気温:補正"]']});
assert.equal(out.rows[0][2],5);
assert.equal(C.renameReferences('[@x,-1]+SUM([@"n,m",-2:0])+[@"x:y"]','x','a,b'),'[@"a,b",-1]+SUM([@"n,m",-2:0])+[@"x:y"]');
assert.equal(C.renameReferences('[@"n,m",-2:0]','n,m','x:y'),'[@"x:y",-2:0]');
assert.throws(()=>C.evaluate({columns:['x','x','z'],rows:[[1,2,null]],formulas:[null,null,'[@x,-1]']}),/重複/);
const reserved='a]@"\\,:';
const reservedReference=C.reference(reserved,true,-1);
assert.equal(reservedReference,'[@"a]@\\"\\\\,:",-1]');
assert.equal(C.renameReferences(reservedReference,reserved,'x'),'[@x,-1]');
assert.equal(C.migrateLegacyReferences(C.reference(reserved,true)),C.reference(reserved,true));

assert.equal(C.migrateLegacyReferences('[@x]+SUM([x])'),'[@x]+SUM([x])','変更不要な参照は保持する');
assert.equal(C.migrateLegacyReferences('[@気温,-1]+[x,y]+[@"既存,名"]'),'[@"気温,-1"]+["x,y"]+[@"既存,名"]');
assert.equal(C.migrateLegacyReferences('[@"@x"]+["@x"]'),'[@"@x"]+["@x"]','引用された@始まりの旧列名を保持する');
const migrated=C.migrateLegacyReferences('[@x,-1]');
out=C.evaluate({columns:['x','x,-1','z'],rows:[[1,7,null]],formulas:[null,null,migrated]});
assert.equal(out.rows[0][2],7,'旧式の名前衝突を相対参照へ読み替えない');
assert.throws(()=>C.migrateLegacyReferences('[@x'),/旧式/);
assert.throws(()=>C.migrateLegacyReferences('vref0+[@x]'),/内部/);

const rows=Array.from({length:10000},(_,i)=>[i,...Array(8).fill(null)]);
const shared={columns:['x','a','b','c','d','e','f','g','h'],rows,formulas:[null,...Array(8).fill('SUM([@x,-94:+95])')]};
out=C.evaluate(shared);
assert.equal(out.errors.length,0,'同じ範囲集計は共有キャッシュ内で上限以下に収まる');
assert.equal(out.rows[500][1],(406+595)*190/2);
assert.throws(()=>C.evaluate({columns:['x','z'],rows:Array.from({length:10000},()=>[1,null]),formulas:[null,'SUM([@x,-102:+102])']}),/計算量/);

console.log('relative-calculations.test.cjs: ok');
