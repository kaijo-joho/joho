#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
global.IlapoCore=require('../core.js');
global.IlapoGeometry={bounds:o=>o.type==='connector'?{x:Math.min(o.from.x,o.to.x),y:Math.min(o.from.y,o.to.y),width:Math.abs(o.from.x-o.to.x),height:Math.abs(o.from.y-o.to.y)}:{x:o.matrix[4],y:o.matrix[5],width:10*Math.abs(o.matrix[0]),height:10*Math.abs(o.matrix[3])}};
global.IlapoConnectors=require('../connectors.js');
const A=require('../assets.js');
class Memory{constructor(){this.m=new Map();}getItem(k){return this.m.get(k)||null;}setItem(k,v){this.m.set(k,v);}}
const memory=new Memory(),lib=A.createLibrary(memory);
assert.equal(A.icons().length,10);const icon=A.instantiateIcon('person',{x:12,y:8,size:40});assert.equal(icon[0].type,'path');assert.deepEqual(icon[0].matrix.slice(4),[12,8]);assert.equal(icon[0].style.strokeWidth,.8,'icon size applies its one-time stroke scaling to the document style');
icon[0].style.dash='2 1';const saved=lib.save('人物',icon);assert.equal(lib.list()[0].name,'人物');const made=lib.instantiate(saved.id,{x:100,y:30,size:20});assert.equal(made[0].group!==null,true);assert.equal(made[0].locked,false);assert.equal(made[0].matrix[4],100);assert.equal(Math.abs(made[0].matrix[0]),2);assert.equal(made[0].style.strokeWidth,4,'component placement applies its uniform scale to a path stroke once');assert.equal(made[0].style.dash,'10 5','component placement scales dash intervals once');
const backup=lib.exportJSON();assert.throws(()=>lib.importJSON('{bad'));assert.equal(lib.exportJSON(),backup);lib.remove(saved.id);assert.equal(lib.list().length,0);lib.importJSON(backup);assert.equal(lib.list().length,1);assert.throws(()=>lib.save('参照',[{...icon[0],type:'image',reference:true}]));
const objects=Array.from({length:201},()=>A.instantiateIcon('pc',{size:40})[0]);assert.throws(()=>lib.save('多すぎる',objects));assert.equal(lib.exportJSON(),backup);
assert.throws(()=>lib.save('重複',[icon[0],icon[0]]));assert.equal(lib.exportJSON(),backup);
const duplicate=JSON.parse(backup);duplicate.components.push(duplicate.components[0]);assert.throws(()=>lib.importJSON(JSON.stringify(duplicate)));assert.equal(lib.exportJSON(),backup);
const bad=JSON.parse(backup);bad.components[0].objects[0].onclick='alert(1)';assert.throws(()=>lib.importJSON(JSON.stringify(bad)));assert.equal(lib.exportJSON(),backup);
const broken=new Memory();broken.setItem('kaijo-ilapo:components','{broken');const brokenLib=A.createLibrary(broken);assert.throws(()=>brokenLib.list());assert.throws(()=>brokenLib.save('保存',icon));assert.equal(broken.getItem('kaijo-ilapo:components'),'{broken','corrupt data is not silently overwritten');
const full=new Memory();full.setItem('kaijo-ilapo:components',backup);full.setItem=()=>{throw new Error('quota');};const fullLib=A.createLibrary(full);assert.throws(()=>fullLib.save('新規',icon),/quota/);assert.equal(fullLib.exportJSON(),backup);
const nonzero=JSON.parse(backup);nonzero.components[0].objects[0].matrix[4]=35;nonzero.components[0].objects[0].matrix[5]=40;lib.importJSON(JSON.stringify(nonzero));const repositioned=lib.instantiate(nonzero.components[0].id,{x:100,y:200,size:20});assert.equal(repositioned[0].matrix[4],100);assert.equal(repositioned[0].matrix[5],200);
console.log('assets.test.cjs: passed');
