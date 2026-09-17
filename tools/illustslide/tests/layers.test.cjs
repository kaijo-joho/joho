'use strict';
const assert = require('assert');
const C = require('../core.js');
const L = require('../layers.js');

function page() { const p = C.createPage('レイヤー'); const a = C.makeShape('rect', 0, 0, 10, 10), b = C.makeShape('rect', 10, 0, 10, 10), c = C.makeShape('rect', 20, 0, 10, 10); a.id='a'; b.id='b'; c.id='c'; p.objects=[a,b,c]; return p; }

const old = page(), oldBefore = C.clone(old);
assert.deepEqual(L.list(old).map(layer=>layer.objectIds), [['a','b','c']]);
assert.deepEqual(L.orderedObjects(old).map(object=>object.id), ['a','b','c']);
assert.deepEqual(old, oldBefore, '旧ページはレイヤー操作前に変化しない');
L.rename(old, 'default', '通常'); assert.equal(old.layers[0].name, '通常', '暗黙defaultは明示操作時だけ実体化する');

const p = page(), first = L.create(p, '背景'), second = L.create(p, '前景');
assert.equal(p.layers.length, 3); assert.deepEqual(p.layers[0].objectIds, ['a','b','c']); assert.deepEqual(p.layers[1].objectIds, []);
L.rename(p, second, '文字'); L.setVisible(p, first, false); L.setLocked(p, second, true);
assert.equal(L.layerOf(p, 'a').id, 'default'); assert.equal(p.layers[2].name, '文字'); assert.equal(L.visible(p, 'a'), true); assert.equal(L.locked(p, 'a'), false);
L.setVisible(p, first, true); L.setLocked(p, second, false); L.moveObjects(p, ['c'], first);
assert.deepEqual(L.orderedObjects(p).map(object=>object.id), ['a','b','c']); L.move(p, first, -1);
assert.deepEqual(L.orderedObjects(p).map(object=>object.id), ['c','a','b']);
L.remove(p, first); assert.deepEqual(p.layers.find(layer=>layer.id==='default').objectIds.sort(), ['a','b','c'], '削除したレイヤーの内容を隣へ保持する');

const invalid = page(); invalid.layers=[{id:'one',name:'1',visible:true,locked:false,objectIds:['a']},{id:'two',name:'2',visible:true,locked:false,objectIds:['a','b','c']}];
assert.throws(()=>C.validateDocument({format:'kaijo-ilapo',version:6,id:'d',name:'d',pages:[invalid]}), /duplicate layer object id/);
invalid.layers=[{id:'one',name:'1',visible:true,locked:false,objectIds:['a','b','c']}]; invalid.objects[0].group='g'; invalid.objects[1].group='g';
assert.equal(C.validateDocument({format:'kaijo-ilapo',version:6,id:'d',name:'d',pages:[invalid]}).version,6);
const outOfOrder=C.clone(invalid); outOfOrder.objects=[outOfOrder.objects[1],outOfOrder.objects[0],outOfOrder.objects[2]]; assert.throws(()=>C.validateDocument({format:'kaijo-ilapo',version:6,id:'d',name:'d',pages:[outOfOrder]}),/レイヤー順/);
const documentWithLayers={format:'kaijo-ilapo',version:6,id:'copy-doc',name:'複製',pages:[C.clone(invalid)]}; const copyId=C.duplicatePage(documentWithLayers, invalid.id); const copy=documentWithLayers.pages.find(item=>item.id===copyId); assert.notEqual(copy.layers[0].id,invalid.layers[0].id); assert.notEqual(copy.layers[0].objectIds[0],invalid.layers[0].objectIds[0]); assert.equal(C.validateDocument(documentWithLayers).pages.length,2,'ページ複製後もレイヤー参照を検証できる');
const crossing=C.clone(invalid); crossing.layers=[{id:'one',name:'1',visible:true,locked:false,objectIds:['a','c']},{id:'two',name:'2',visible:true,locked:false,objectIds:['b']}];
assert.throws(()=>C.validateDocument({format:'kaijo-ilapo',version:6,id:'d',name:'d',pages:[crossing]}), /group crosses layers/);

const grouped=page(), l1=L.create(grouped,'1'), l2=L.create(grouped,'2'); L.moveObjects(grouped,['b'],l2); assert.throws(()=>C.groupObjects(grouped,['a','b']),/異なるレイヤー/);
const before=C.clone(grouped); grouped.objects.push(C.makeShape('rect',30,0,10,10)); grouped.objects.at(-1).id='d'; L.reconcile(grouped,before,l2); assert(L.layerOf(grouped,'d').id===l2, '新規オブジェクトを指定レイヤーへ入れる');
grouped.objects.find(object=>object.id==='b').group='new-group'; grouped.objects.push(C.makeShape('rect',40,0,10,10)); grouped.objects.at(-1).id='e'; grouped.objects.at(-1).group='new-group'; L.reconcile(grouped,C.clone(grouped),'default'); assert.equal(L.layerOf(grouped,'e').id,l2,'既存グループに加わる新規オブジェクトはグループのレイヤーを優先する');
const guarded=page(), guardedLayer=L.create(guarded,'固定'); L.moveObjects(guarded,['a'],guardedLayer); L.setLocked(guarded,guardedLayer,true); guarded.objects.push(C.makeShape('rect',50,0,10,10)); guarded.objects.at(-1).id='guarded-new'; assert.throws(()=>L.reconcile(guarded,null,guardedLayer),/非表示または固定/); L.setLocked(guarded,guardedLayer,false); L.reconcile(guarded,null,'default'); L.setLocked(guarded,guardedLayer,true); assert.throws(()=>C.removeObjects(guarded,['a']),/非表示または固定/); const matrix=guarded.objects.find(object=>object.id==='a').matrix.slice(); C.transformObjects(guarded,['a'],[1,0,0,1,10,0]); assert.deepEqual(guarded.objects.find(object=>object.id==='a').matrix,matrix,'固定レイヤーの変形を行わない');

const copied=page(), copyLayer=L.create(copied,'上'); L.moveObjects(copied,['b'],copyLayer); const duplicated=C.duplicateObjects(copied,['b']); assert.equal(L.layerOf(copied,duplicated[0]).id,copyLayer); C.removeObjects(copied,[duplicated[0]]); assert(!copyLayer.objectIds?.includes?.(duplicated[0]));
const history=new C.History({format:'kaijo-ilapo',version:6,id:'history',name:'履歴',pages:[copied]}); history.change(doc=>L.moveObjects(doc.pages[0],['a'],copyLayer)); history.undo(); assert.equal(L.layerOf(history.document.pages[0],'a').id, copied.layers[0].id); history.redo(); assert.equal(L.layerOf(history.document.pages[0],'a').id,copyLayer);

const output=page(), outputLayer=L.create(output,'隠す'); L.moveObjects(output,['c'],outputLayer); L.setVisible(output,outputLayer,false); output.animations=[{id:'an',targets:['c']}]; const exported=L.forOutput(output); assert.deepEqual(exported.objects.map(object=>object.id),['a','b']); assert.deepEqual(output.objects.map(object=>object.id),['a','b','c'],'出力は元を変更しない'); assert.equal(exported.animations.length,0);
console.log('layers.test.cjs: passed');
