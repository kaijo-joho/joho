const assert = require('assert');
const AxisStyle = require('../axis-style.js');
const Core = require('../core.js');

assert.deepStrictEqual(AxisStyle.validate({ color:'#123abc', width:2, grid:false, gridColor:null, gridWidth:.5, gridDash:'dot', tickMarks:false, tickLabels:true, ignored:'drop' }), { color:'#123abc', width:2, grid:false, gridColor:null, gridWidth:.5, gridDash:'dot', tickMarks:false, tickLabels:true });
for (const value of [{color:'#123abz'}, {color:''}, {width:.4}, {grid:'true'}, {gridColor:'blue'}, {gridWidth:11}, {gridDash:'longdash'}, {tickMarks:0}, null]) assert.throws(() => AxisStyle.validate(value), /軸の書式/);
const layout = AxisStyle.apply({showgrid:true,ticks:'outside'}, {color:null,width:3,gridColor:null,gridWidth:2,gridDash:'dash',tickMarks:false,tickLabels:false}, {foreground:'#101010',gridColor:'#eeeeee'});
assert.deepStrictEqual(layout, {showgrid:true,ticks:'',color:'#101010',linecolor:'#101010',tickcolor:'#101010',tickfont:{color:'#101010'},linewidth:3,gridcolor:'#eeeeee',gridwidth:2,griddash:'dash',showticklabels:false});
assert.deepStrictEqual(AxisStyle.apply({title:{text:'x',font:{size:14}},tickfont:{size:11,color:'#ffffff'}},{color:'#123abc'},{showLine:true}),{title:{text:'x',font:{size:14,color:'#123abc'}},tickfont:{size:11,color:'#123abc'},color:'#123abc',linecolor:'#123abc',tickcolor:'#123abc',showline:true});

const legacy = Core.createDocument(); legacy.version = 14;
const migrated = Core.validateDocument(legacy);
assert.equal(migrated.version, 15);
assert.equal(migrated.axes.x.style, undefined, '未編集文書では軸書式を保存しない');
const styled = Core.createDocument(); styled.axes.x.style = { color:'#112233', width:2, ignored:true };
assert.deepStrictEqual(Core.validateDocument(styled).axes.x.style, {color:'#112233',width:2});
const mixed = Core.clone(styled); mixed.version = 14;
assert.throws(() => Core.validateDocument(mixed), /版と軸の書式/);
const invalid = Core.clone(styled); invalid.axes.x.style = {gridDash:'invalid'};
assert.throws(() => Core.validateDocument(invalid), /軸の書式/);
console.log('axis-style.test.cjs: ok');
