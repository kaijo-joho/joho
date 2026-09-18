const assert=require('assert'),C=require('../core.js'),A=require('../annotations.js');
function doc(){const d=C.createDocument(),s=C.createSeries('data2d');s.id='data';s.rows=[[0,1],[1,3],[2,5],[null,null]];s.errorBars={x:[],y:[0,.1,0,null]};d.series=[s];return d}
function regression(d){const r=C.createAnnotation('regression');r.id='fit';r.seriesId='data';r.model='linear';d.annotations=[r];return r}
{
 const d=doc(),r=regression(d),clean=C.validateDocument(d);assert.equal(clean.version,15);assert.equal(clean.series[0].errorBars.y[1],.1);let out=A.evaluate(clean.annotations[0],clean);assert.equal(out.warning,'');assert(out.segments.length);clean.series[0].rows[2]=[2,9];out=A.evaluate(clean.annotations[0],clean);assert.equal(out.fit.coefficients[1],4);
}
{
 const d=doc();for(const change of [s=>s.errorBars={x:[-1],y:[]},s=>s.errorBars={x:[],y:['x']},s=>s.errorBars={x:[],y:[1]},s=>s.errorBars={x:[],y:[Infinity,0,0,0]}]){const bad=C.clone(d);change(bad.series[0]);assert.throws(()=>C.validateDocument(bad),/誤差/)}
 const three=C.createDocument(),s=C.createSeries('data3d');s.id='three';s.rows=[[1,2,3]];three.series=[s];assert.equal(C.validateDocument(three).series[0].rows[0].length,3);
}
{
 const d=doc();d.series[0].excludedRows=[2,0];const clean=C.validateDocument(d);assert.deepStrictEqual(clean.series[0].excludedRows,[0,2]);
 for(const rows of [[0,0],[-1],[4],['1']]){const bad=C.clone(d);bad.series[0].excludedRows=rows;assert.throws(()=>C.validateDocument(bad),/除外/);}
 const old=C.clone(d);old.version=9;delete old.series[0].excludedRows;assert.equal(C.validateDocument(old).version,15);
 const incompatible=C.clone(d);incompatible.version=9;assert.throws(()=>C.validateDocument(incompatible),/版/);
}
{
 const d=doc(),r=regression(d);for(const change of [x=>x.annotations[0].seriesId='none',x=>x.annotations[0].model='bad',x=>x.annotations[0].showMetrics='yes']){const bad=C.clone(d);change(bad);assert.throws(()=>C.validateDocument(bad),/回帰/)}
 const h=new C.History(d);h.change(x=>C.removeSeries(x,'data'));h.undo();assert.equal(h.document.annotations.length,1);const mem=new Map(),store=new C.Store({getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)});store.save('auto',d);assert.equal(store.load('auto').document.annotations[0].kind,'regression');C.removeSeries(d,'data');assert.equal(d.annotations.length,0);
}
{
 const d=doc();d.version=6;delete d.presentation;delete d.output;delete d.charts;delete d.comparison;delete d.series[0].errorBars;delete d.series[0].interpolation;delete d.series[0].excludedRows;const migrated=C.validateDocument(d);assert.equal(migrated.version,15);assert.deepStrictEqual(migrated.series[0].errorBars,{x:[],y:[]});
 for(let version=1;version<=6;version++){const bad=C.clone(doc());bad.version=version;delete bad.presentation;delete bad.output;if(version<7)assert.throws(()=>C.validateDocument(bad),/版|分析/);}
}
{
 const d=doc(),r=regression(d);d.axes.y.scale='log';d.axes.y.min=.1;assert.equal(A.evaluate(r,d).warning,'');d.series[0].rows=[[0,-1],[1,-2],[2,-3],[null,null]];const failed=A.evaluate(r,d);assert(failed.warning);assert.equal(failed.segments.length,0);assert.equal(C.validateDocument(d).annotations[0].id,'fit');
 d.annotations[0].model='exponential';assert(A.evaluate(r,d).warning);assert.equal(C.validateDocument(d).annotations[0].id,'fit');
}
{
 for(const mode of ['none','x','y','xy']){const columns=mode==='none'?[[1,2],[null,3]]:mode==='xy'?[[1,2,0,.1],[null,3,null,0]]:[[1,2,0],[null,3,null]],parsed=C.parseMeasurementTable(C.tableCSV(columns),mode),series={...parsed,kind:'data2d'};assert.equal(C.measurementMode(series),mode);assert.deepStrictEqual(C.measurementRows(series),columns);}
 for(const version of [1,2,3,4,5,6]){const d=doc();d.version=version;delete d.presentation;delete d.output;delete d.charts;delete d.comparison;delete d.series[0].errorBars;delete d.series[0].interpolation;delete d.series[0].excludedRows;if(version<3)for(const a of Object.values(d.axes)){delete a.symbol;delete a.ticks;}if(version===1)delete d.annotations;const clean=C.validateDocument(d);assert.equal(clean.version,15);assert.deepStrictEqual(clean.series[0].rows,d.series[0].rows);assert.deepStrictEqual(clean.series[0].style,d.series[0].style);}
 const d=doc();for(const values of [[-1,0,0,0],['1',0,0,0],[NaN,0,0,0]]){d.series[0].errorBars.y=values;assert.throws(()=>C.validateDocument(d),/誤差/);}
}
console.log('graph analysis core tests passed');
