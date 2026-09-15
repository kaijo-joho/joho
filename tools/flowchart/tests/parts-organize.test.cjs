const assert=require('node:assert/strict');
const Core=require('../core.js');
const Parts=require('../parts.js');
const cases=[];const test=(name,fn)=>{fn();cases.push(name);};const clone=value=>JSON.parse(JSON.stringify(value));
const stamp=['2026-09-15T00:00:00.000Z','2026-09-16T00:00:00.000Z','2026-09-17T00:00:00.000Z'];
function item(id,name,category,updatedAt=stamp[0]){const out={id,name,diagramType:'flowchart',updatedAt,selection:{format:'kaijo-diagram-selection',version:3,nodes:[Core.createNode('process',0,0,{id:`node_${id}`,text:name})],edges:[],groups:[]}};if(category!==undefined)out.category=category;return out;}
function library(items){return Parts.parseLibrary({format:'kaijo-flowchart-parts',version:1,items});}
test('Version 1 files without categories retain their exact normalized item shape',()=>{
  const raw={format:'kaijo-flowchart-parts',version:1,items:[item('old','旧部品')]},parsed=Parts.parseLibrary(raw);assert.equal(parsed.version,1);assert.equal(Object.hasOwn(parsed.items[0],'category'),false);assert.equal(Parts.serializeLibrary(parsed),JSON.stringify(raw));
});
test('Categories trim, validate Unicode length, and remain omitted when empty',()=>{
  const parsed=library([item('a','名前','  手順  '),item('b','空','   ')]);assert.equal(parsed.items[0].category,'手順');assert.equal(Object.hasOwn(parsed.items[1],'category'),false);
  for(const bad of [null,1,{},'あ'.repeat(41)])assert.throws(()=>library([item('bad','不正',bad)]),/カテゴリ/);
  assert.throws(()=>Parts.update(parsed,'a',{category:1}),/カテゴリ/);
});
test('Update changes name and category atomically and no-op updates preserve timestamps',()=>{
  const base=library([item('a','元','分類')]),before=clone(base),same=Parts.update(base,'a',{name:'元',category:' 分類 '});assert.deepEqual(same,base);assert.equal(same.items[0].updatedAt,stamp[0]);
  assert.throws(()=>Parts.update(base,'a',{name:'x'.repeat(81),category:'次'}),/1〜80/);assert.deepEqual(base,before);
  const changed=Parts.update(base,'a',{name:'  新名 ',category:'  次  '});assert.equal(changed.items[0].name,'新名');assert.equal(changed.items[0].category,'次');assert.notEqual(changed.items[0].updatedAt,stamp[0]);assert.equal(base.items[0].name,'元');
  const renamed=Parts.rename(base,'a','別名');assert.equal(renamed.items[0].name,'別名');assert.equal(renamed.items[0].category,'分類');
});
test('Capture, merge, serialization, preview and placement preserve categories without changing diagrams',()=>{
  const source=Core.createDocument(),node=Core.createNode('process',40,50,{id:'source'});source.nodes=[node];const captured=Parts.capture(source,[node.id],'保存',' 手順 ');assert.equal(captured.category,'手順');
  const merged=Parts.merge(library([item('a','既存','既存')]),library([captured]));const copied=merged.items.find(entry=>entry.category==='手順');assert.ok(copied);assert.equal(Parts.parseLibrary(Parts.serializeLibrary(merged)).items.find(entry=>entry.category==='手順').id,copied.id);
  const preview=Parts.documentFor(copied),target=Core.createDocument();Parts.place(target,copied,{x:300,y:240});assert.equal(preview.nodes[0].text,'');assert.equal(target.nodes.length,1);assert.equal(target.nodes[0].text,'');
});
test('List supports NFKC AND query, category filters, stable sorts and has no source side effects',()=>{
  const base=library([item('a','ＡＢＣ 10','手順',stamp[1]),item('b','abc 2','例',stamp[2]),item('c','あいう','手順',stamp[2]),item('d','abc 2','',stamp[2])]),before=clone(base);
  assert.deepEqual(Parts.list(base,{query:'abc ２'}).map(entry=>entry.id),['b','d']);assert.deepEqual(Parts.list(base,{category:'手順'}).map(entry=>entry.id),['a','c']);assert.deepEqual(Parts.list(base,{category:''}).map(entry=>entry.id),['d']);
  assert.deepEqual(Parts.list(base,{sort:'name'}).map(entry=>entry.id),['b','d','a','c']);assert.deepEqual(Parts.list(base,{sort:'updated'}).map(entry=>entry.id),['b','c','d','a']);assert.deepEqual(Parts.categories(base),['手順','例']);assert.deepEqual(base,before);
  for(const options of [{query:1},{category:1},{sort:'other'}])assert.throws(()=>Parts.list(base,options));
});
test('Manual move swaps only adjacent entries, preserves timestamps, and serializes in the new order',()=>{
  const base=library([item('a','A','',stamp[0]),item('b','B','',stamp[1]),item('c','C','',stamp[2])]);const up=Parts.move(base,'b',-1),down=Parts.move(up,'b',1);assert.deepEqual(up.items.map(entry=>entry.id),['b','a','c']);assert.deepEqual(down.items.map(entry=>entry.id),['a','b','c']);assert.equal(up.items[0].updatedAt,stamp[1]);assert.deepEqual(Parts.move(base,'a',-1),base);assert.deepEqual(Parts.move(base,'c',1),base);assert.deepEqual(Parts.parseLibrary(Parts.serializeLibrary(up)).items.map(entry=>entry.id),['b','a','c']);assert.throws(()=>Parts.move(base,'a',2),/方向/);
});
console.log(JSON.stringify({ok:true,cases},null,2));
