const assert=require('assert');
const S=require('../statistics.js');
const near=(actual,expected,tolerance=1e-12)=>assert(Math.abs(actual-expected)<=tolerance,actual+' is not near '+expected);

let d=S.describe([2,4,4,4,5,5,7,9,null]);
assert.equal(d.n,8);assert.equal(d.missing,1);assert.equal(d.sum,40);assert.equal(d.mean,5);assert.equal(d.median,4.5);assert.equal(d.min,2);assert.equal(d.max,9);near(d.variance,4);near(d.standardDeviation,2);near(d.sampleVariance,32/7);near(d.sampleStandardDeviation,Math.sqrt(32/7));
d=S.describe([]);assert.equal(d.mean,null);assert(d.warning);
d=S.describe([3]);assert.equal(d.variance,0);assert.equal(d.sampleVariance,null);assert(d.warning);
assert.throws(()=>S.describe([1,NaN]),TypeError);assert.throws(()=>S.describe([Infinity]),TypeError);

let r=S.pearson([[1,2],[2,4],[3,6],[null,8],[4,null]],0,1);near(r.r,1);assert.equal(r.n,3);assert.equal(r.missing,2);
r=S.pearson([[1,6],[2,4],[3,2]],0,1);near(r.r,-1);
r=S.pearson([[2,1],[2,2]],0,1);assert.equal(r.r,null);assert.match(r.warning,/一定/);
r=S.pearson([[1,1]],0,1);assert.equal(r.r,null);assert.match(r.warning,/2組/);
assert.throws(()=>S.pearson([[1,undefined]],0,1),TypeError);
assert.throws(()=>S.pearson([[null,NaN]],0,1),TypeError);

const large=Array.from({length:1000},(_,i)=>[1e15+i*0.125,-2e14+i*0.25]);
r=S.pearson(large,0,1);near(r.r,1,1e-12);
d=S.describe(large.map(row=>row[0]));near(d.mean,1e15+62.5);assert(d.variance!==null);
const tiny=Array.from({length:10},(_,i)=>1e-300*(i+1));d=S.describe(tiny);assert.equal(d.variance,null);assert(d.standardDeviation>0);
d=S.describe([0,1e-200]);assert.equal(d.variance,null);assert(d.standardDeviation>0);assert.match(d.warning,/小さすぎ/);

const table={columns:['x','y','z'],rows:[[1,2,7],[2,4,7],[3,6,null],[null,8,7]]};
const m=S.matrix(table);assert.deepStrictEqual(m.columns,['x','y','z']);assert.deepStrictEqual(m.indices,[0,1,2]);near(m.values[0][1],1);assert.equal(m.values[0][1],m.values[1][0]);assert.equal(m.counts[0][1],m.counts[1][0]);assert.equal(m.values[2][2],null);assert(m.warnings[2][2]);
const summary=S.summarize(table,[1,0]);assert.deepStrictEqual(summary.map(item=>[item.index,item.name,item.n,item.missing]),[[1,'y',4,0],[0,'x',3,1]]);
assert.throws(()=>S.matrix({columns:Array(21).fill('x'),rows:[]}),RangeError);
assert.throws(()=>S.summarize({columns:['x'],rows:[[undefined]]}),TypeError);
assert.equal(S.describe([Number.MIN_VALUE,Number.MIN_VALUE]).median,Number.MIN_VALUE);
console.log('graph statistics tests passed');
