const assert=require('assert');const C=require('../core.js'),A=require('../annotations.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function base(){const d=C.createDocument(),f=C.createSeries('function'),g=C.createSeries('function');f.id='f';g.id='g';f.expression='y=x^2';g.expression='y=x';d.series=[f,g];return d}
function region(d,targets=[{type:'series',id:'f'},{type:'series',id:'g'}]){const r=C.createAnnotation('curveRegion');r.id='region';r.targets=targets;r.interval=['0','1'];d.annotations.push(r);return r}
{
 const d=base(),r=region(d),out=A.evaluate(r,d);near(out.area,1/6);near(out.integral,-1/6);assert(out.polygons.length);const reverse=region(base(),[{type:'series',id:'g'},{type:'series',id:'f'}]);const reversed=A.evaluate(reverse,base());near(reversed.area,1/6);near(reversed.integral,1/6);
}
{
 const d=base();d.parameters=[{name:'h',value:1,min:0,max:3,step:.1}];const r=region(d);r.interval=['pi/h','pi/h+1'];assert.equal(C.validateDocument(d).annotations[0].interval[0],'pi/h');d.angle='deg';r.interval=['0','90'];d.series[0].domain.x=[0,.5];assert(A.evaluate(r,d).warning);
}
{
 const d=base();d.axes.y.scale='log';const r=region(d);assert(A.evaluate(r,d).warning,'対数軸の非正値を拒否する');
}
{
 const d=base(),r=region(d);const clean=C.validateDocument(d);assert.equal(clean.version,8);assert.deepStrictEqual(clean.annotations[0].targets,r.targets);const extra=C.clone(d);extra.annotations[0].targets[0].extra='drop';assert.equal(C.validateDocument(extra).annotations[0].targets[0].extra,undefined);
 for(const mutate of [x=>x.annotations[0].targets=[{type:'axis',axis:'x'},{type:'series',id:'f'}],x=>x.annotations[0].targets=[{type:'series',id:'f'},{type:'series',id:'f'}],x=>x.annotations[0].targets=[{type:'series',id:'missing'},{type:'axis',axis:'x'}],x=>x.annotations[0].interval=['0'],x=>x.annotations[0].kind='unknown']){const bad=C.clone(d);mutate(bad);assert.throws(()=>C.validateDocument(bad));}
}
{
 const d=base(),t=C.createAnnotation('tangent');t.id='t';t.seriesId='f';t.at='0';d.annotations.push(t);const r=region(d,[{type:'tangent',id:'t'},{type:'axis',axis:'x'}]);r.interval=['0','1'];assert.equal(A.evaluate(r,d).warning,'');C.removeSeries(d,'f');assert.equal(d.annotations.length,0,'function→tangent→regionを削除');
}
{
 const d=base(),r=region(d),h=new C.History(d);h.change(x=>x.annotations=[]);h.undo();assert.equal(h.document.annotations.length,1);const mem=new Map(),s=new C.Store({getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)});s.save('auto',d);assert.equal(s.load('auto').document.annotations[0].kind,'curveRegion');const v5=C.clone(d);v5.version=5;delete v5.presentation;delete v5.output;assert.throws(()=>C.validateDocument(v5),/版/);
 for(const v of [1,2,3,4,5]){const old=C.clone(d);old.version=v;delete old.presentation;delete old.output;assert.throws(()=>C.validateDocument(old),/版/);}
}
{
 const d=base();d.parameters=[{name:'h',value:1,min:0,max:3,step:.1}];d.series[0].expression='h*x';const r=region(d,[{type:'series',id:'f'},{type:'axis',axis:'x'}]);r.interval=['0','h'];
 near(A.evaluate(r,d).area,.5);d.parameters[0].value=2;near(A.evaluate(r,d).area,4);
 d.parameters[0].value=0;assert(A.evaluate(r,d).warning);const preserved=C.validateDocument(d);assert.deepStrictEqual(preserved.annotations[0].interval,['0','h']);preserved.parameters[0].value=1;near(A.evaluate(preserved.annotations[0],preserved).area,.5);
 d.parameters=[];d.angle='deg';d.series[0].expression='sin(x)';d.series[0].domain.x=[0,360];r.interval=['0','180'];near(A.evaluate(r,d).integral,360/Math.PI);
 d.angle='rad';d.series[0].domain.x=[0,10];r.interval=['0','pi'];near(A.evaluate(r,d).area,2);
}
{
 const d=base(),t=C.createAnnotation('tangent');t.id='tan';t.seriesId='f';t.at='1';d.annotations.push(t);const r=region(d,[{type:'tangent',id:t.id},{type:'axis',axis:'x'}]);const out=A.evaluate(r,d);assert.equal(out.warning,'');near(out.area,.5);near(out.integral,0);assert.equal(out.polygons.length,2);
 const history=new C.History(d);history.change(x=>C.removeAnnotation(x,'tan'));assert.equal(history.document.annotations.length,0);history.undo();assert.deepStrictEqual(history.document,C.validateDocument(d));
}
{
 const old=C.clone(require('../templates.js').list().find(t=>t.id==='math-triangle-region').document);assert.equal(old.version,5);delete old.presentation;delete old.output;const migrated=C.validateDocument(old);assert.equal(migrated.version,8);assert.deepStrictEqual(migrated.annotations.find(a=>a.kind==='region').segmentIds,old.annotations.find(a=>a.kind==='region').segmentIds);
 for(const mutate of [d=>{const a=d.annotations.find(a=>a.kind==='segment');a.to=a.from;},d=>d.annotations.find(a=>a.kind==='segment').arrows='invalid']){const invalid=C.clone(migrated);mutate(invalid);assert.throws(()=>C.validateDocument(invalid),/線分/);}
 const d=base(),cross=C.createAnnotation('intersection');cross.seriesIds=['f','missing'];d.annotations=[cross];assert.throws(()=>C.validateDocument(d),/交点/);
 const legacyCross=C.createAnnotation('tangentIntersection');legacyCross.tangentIds=['missing','missing2'];d.annotations=[legacyCross];assert.throws(()=>C.validateDocument(d),/接線交点/);
}
console.log('graph curve-region tests passed');
