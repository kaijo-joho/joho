const assert = require('node:assert/strict');
const Charts = require('../charts.js'), Symbols = require('../symbols.js');
const source = {id:'s',kind:'data2d',rows:[[1,2],[2,4],[3,7]],excludedRows:[],errorBars:{x:[],y:[]}};
const doc = {series:[source],annotations:[{id:'r',kind:'regression',seriesId:'s',model:'linear'}]};
const scatter = Charts.create('scatter',{seriesId:'s',model:'linear'});
scatter.axes.x = {label:'時刻 <t>',unit:'s',min:1,max:3,step:1,format:'pi'};
scatter.style = {pointSize:14,width:4,dash:'dash'};scatter.labels = {equation:true,metrics:true};
let result = Charts.build(scatter,doc,{dark:true});
assert.equal(result.layout.xaxis.title.text,'時刻 &lt;t&gt; [s]');
assert.deepEqual(result.layout.xaxis.ticktext,['1','2','3'],'Arbitrary numeric coordinates must not be relabeled with approximate pi multiples');
assert.equal(result.data[0].marker.size,14);assert.equal(result.data[1].line.dash,'dash');
assert.match(result.layout.annotations[0].text,/n=3/);assert.equal(result.layout.annotations[0].font.color,'#f9fafb');
scatter.axes.x = {...scatter.axes.x,min:0,max:1,step:1/3,format:'fraction'};
result = Charts.build(scatter,doc);assert(result.layout.xaxis.ticktext.includes('1/3'));assert(!result.layout.xaxis.ticktext.includes('333/1000'));
for(const format of ['auto','decimal','fraction','pi']){
  scatter.axes.x = {...scatter.axes.x,min:-1e9,max:1e9,step:1e-300,format};
  result = Charts.build(scatter,doc);assert(result.layout.xaxis.tickvals.length<=200);assert(result.layout.xaxis.tickvals.every(Number.isFinite));
  assert.deepEqual(result.layout.xaxis.ticktext,result.layout.xaxis.tickvals.map(value=>Symbols.formatTick(value,format)));
}
scatter.axes.x = {...scatter.axes.x,min:null,max:null,step:null,format:'pi'};
result = Charts.build(scatter,doc);assert(result.layout.xaxis.tickvals.length>0);assert.deepEqual(result.layout.xaxis.ticktext,result.layout.xaxis.tickvals.map(value=>Symbols.formatTick(value,'pi')));
const histogram = Charts.create('histogram',{seriesId:'s',column:1});histogram.axes.y.step=.5;
result=Charts.build(histogram,doc);assert(result.layout.yaxis.tickvals.some(value=>value===.5));
// All twenty full columns must work without expanding 200,000 arguments into Math.min/max.
const columns=Array.from({length:20},(_,i)=>'列 <'+i+'>'),rows=Array.from({length:10000},(_,i)=>columns.map((_,j)=>i+j));
const wide={series:[{...source,dataTable:{columns,rows,mapping:{x:0,y:1,z:null,errorX:null,errorY:null}}}],annotations:[]};
const box=Charts.create('box',{seriesId:'s',columns:columns.map((_,i)=>i)});box.axes.y.format='fraction';
result=Charts.build(box,wide);assert.equal(result.data.length,20);assert(result.layout.yaxis.tickvals.length<=200);assert(result.data.every(trace=>!('y' in trace)),'Box quartiles use the precomputed contract only');
assert.match(result.summary,/列 <0>: n=10000/);assert.match(result.data[0].hovertemplate,/最小=/);assert.match(result.data[0].hovertemplate,/&lt;0&gt;/);
console.log('chart-presentation.test.cjs: ok');
