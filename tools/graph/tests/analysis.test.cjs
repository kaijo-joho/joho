const assert=require('assert'),A=require('../analysis.js'),near=(a,b)=>assert(Math.abs(a-b)<1e-7);
let rows=[[0,1],[1,3],[2,5]],copy=JSON.stringify(rows),r=A.fit({rows},'linear');assert.equal(JSON.stringify(rows),copy);assert.deepStrictEqual(r.coefficients,[1,2]);near(r.rmse,0);assert.equal(r.r2,1);
r=A.fit({rows:[[0,1],[1,4],[2,9],[null,3]]},'quadratic');near(r.coefficients[0],1);near(r.coefficients[1],2);near(r.coefficients[2],1);assert.equal(r.skipped,1);
r=A.fit({rows:[[0,2],[1,2*Math.E],[2,2*Math.E**2]]},'exponential');near(r.coefficients[0],2);near(r.coefficients[1],1);
r=A.fit({rows:[[1,3],[2,12],[4,48]]},'power');near(r.coefficients[0],3);near(r.coefficients[1],2);
assert(A.fit({rows:[[0,1],[1,-1]]},'exponential').warning);assert(A.fit({rows:[[1,1],[1,2]]},'linear').warning);assert(A.fit({rows:[[0,1],[1,1]]},'linear').r2===null);assert.match(A.equation(A.fit({rows:[[0,1],[1,3]]},'linear'),'時間','温度'),/時間|温度/);
const large=Array.from({length:10000},(_,i)=>[1e9+i,1e-3*i]);r=A.fit({rows:large},'linear');assert(!r.warning);near(r.predict(1e9+5000),5);assert(A.fit({rows:[[0,1],[1,100],[2,1]]},'exponential').r2<0);
console.log('graph analysis tests passed');
// Large offsets with small variations must use normalized predictions, not expanded coefficients.
const quadraticRows=Array.from({length:9},(_,i)=>{const t=i-4;return[1e8+t,2*t*t-3*t+4];});
r=A.fit({rows:quadraticRows},'quadratic');assert.equal(r.warning,'');near(r.predict(1e8+.5),3);assert(r.rmse<1e-12);
r=A.fit({rows:[[1e9-3,.001],[1e9-2,.002],[1e9-1,.003]]},'linear');assert.equal(r.warning,'');assert(Math.abs(r.predict(1e9-1.5)-.0025)<1e-16);
assert(A.fit({rows:[[0,0],[1e-14,1],[1,2]]},'quadratic').warning);
r=A.fit({rows:[[0,1],[1,3],[2,4],[null,5]]},'linear');near(r.coefficients[0],7/6);near(r.coefficients[1],1.5);near(r.r2,27/28);near(r.rmse,Math.sqrt(1/18));near(r.r,Math.sqrt(27/28));assert.deepStrictEqual(r.residuals.map(p=>p[0]),[1,2,3]);assert.equal(r.skipped,1);
r=A.fit({rows:[[0,1],[1,3],[2,4]]},'proportional');near(r.coefficients[1],11/5);near(r.r2,43/70);near(r.predict(0),0);
r=A.fit({rows:[[0,1],[1,-2],[null,4]]},'exponential');assert(r.warning);assert.equal(r.n,2);assert.equal(r.skipped,1);assert.equal(r.predict,null);
r=A.fit({rows:[[1,1e-15],[2,2e-15],[3,3e-15]]},'linear');assert(Math.abs(r.coefficients[1]-1e-15)<1e-28);assert.match(A.equation(r),/e-15/);
assert(!/\+\s*-/.test(A.equation(A.fit({rows:[[0,-2],[1,1],[2,4]]},'linear'))));
