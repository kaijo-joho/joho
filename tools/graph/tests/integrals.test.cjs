const assert=require('assert'), I=require('../integrals.js');
let r=I.compute(x=>x,x=>0,[0,2]);assert(Math.abs(r.integral-2)<1e-3);assert(Math.abs(r.area-2)<1e-9);assert.equal(r.warning,'');
r=I.compute(x=>x,x=>0,[-1,1]);assert(Math.abs(r.integral)<1e-3);assert(Math.abs(r.area-1)<1e-6);assert(r.polygons.length>1);
assert(I.compute(x=>1/x,x=>0,[-1,1]).warning);
assert(I.compute(x=>1/(x-.3),x=>0,[0,1]).warning);
for(const scale of [1e-12,1e12]){r=I.compute(x=>scale*x*x,x=>0,[0,1]);assert(!r.warning);assert(Math.abs(r.integral-scale/3)<=Math.abs(scale)*1e-7);}
assert(I.compute(x=>1e-4/(x-.3),x=>0,[0,1]).warning,'小さい倍率の極も拒否する');
assert(I.compute(x=>1/(x-.3)**2,x=>0,[0,1]).warning);
assert(I.compute(x=>Math.tan(x),x=>0,[0,3]).warning);
for(const [f, expected] of [[Math.sqrt,2/3],[x=>Math.abs(x-.3),.29],[x=>1e6*(x-.3),290000],[x=>1e-18*(x-.3),2.9e-19]]){
  r=I.compute(f,x=>0,[0,1]);assert.equal(r.warning,'');assert(Math.abs(r.area-expected)<=Math.abs(expected)*1e-7);
}
r=I.compute(Math.sin,x=>0,[0,2*Math.PI]);assert.equal(r.warning,'');assert(Math.abs(r.area-4)<1e-8);assert.equal(r.integral,0);assert.equal(r.polygons.length,2);
assert(require('../regions.js').containsPoint(r.polygons[0],r.labelPoint),'ラベルは領域内部に置く');
r=I.compute(x=>x-.3,x=>0,[0,1]);assert.equal(r.warning,'');assert.equal(r.polygons.length,2);
for(const [polygon,lo,hi] of [[r.polygons[0],0,.3],[r.polygons[1],.3,1]]){
  assert(Math.abs(Math.min(...polygon.map(p=>p[0]))-lo)<1e-11);assert(Math.abs(Math.max(...polygon.map(p=>p[0]))-hi)<1e-11);
  const rootPoints=polygon.filter(p=>Math.abs(p[0]-.3)<1e-11);assert(rootPoints.length>=2);assert(rootPoints.every(p=>Math.abs(p[1])<1e-11),'交点を共有頂点にする');
}
for(const scale of [1e-20,1e20])assert(I.compute(x=>scale/(x-.3),x=>0,[0,1]).warning);
r=I.compute(x=>1,x=>0,[0,1e-14]);assert.equal(r.warning,'');assert(Math.abs(r.area-1e-14)<1e-25);
r=I.compute(x=>x*x,x=>x*x,[0,1]);assert.equal(r.warning,'');assert.equal(r.area,0);assert.equal(r.integral,0);assert.equal(r.polygons.length,0);assert.deepEqual(r.labelPoint,[.5,.25]);
assert(I.compute(x=>Math.log(x),x=>0,[0,1]).warning);
assert(I.compute(x=>{throw Error('invalid')},x=>0,[0,1]).warning);
assert(I.compute(x=>Number.MAX_VALUE,x=>-Number.MAX_VALUE,[0,1]).warning);
r=I.compute(x=>Math.sin(256*Math.PI*x),x=>0,[0,1]);assert(r.warning||Math.abs(r.area-2/Math.PI)<1e-6,'周期と分割幅が一致してもゼロと誤認しない');
console.log('graph integrals tests passed');
