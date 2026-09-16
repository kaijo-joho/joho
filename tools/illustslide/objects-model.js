/* 図形一覧の重なり順。変更対象以外の順序・グループは保持する。 */
(function(root) {
  'use strict';
  const keyOf = object => (object.group ? 'g:' + object.group : 'o:' + object.id);
  function units(objects) {
    const grouped = new Map();
    objects.forEach((object, index) => {
      const key = keyOf(object);
      if (!grouped.has(key)) grouped.set(key, {key, id:object.group || object.id, group:!!object.group, items:[], front:index});
      const unit = grouped.get(key); unit.items.push(object); unit.front=index;
    });
    return [...grouped.values()].sort((a,b) => b.front-a.front);
  }
  function reorder(page, sourceKey, targetKey, front) {
    if(sourceKey===targetKey) return;
    const source=page.objects.filter(object=>keyOf(object)===sourceKey);
    const rest=page.objects.filter(object=>keyOf(object)!==sourceKey);
    const indexes=rest.flatMap((object,index)=>keyOf(object)===targetKey?[index]:[]);
    if(!source.length || !indexes.length) return;
    const at=front?Math.max(...indexes)+1:Math.min(...indexes);
    rest.splice(at,0,...source); page.objects=rest;
  }
  function reorderChild(page, sourceId, targetId, front) {
    const group=page.objects.find(object=>object.id===sourceId)?.group;
    if(!group || sourceId===targetId || page.objects.find(object=>object.id===targetId)?.group!==group) return;
    const slots=page.objects.flatMap((object,index)=>object.group===group?[index]:[]);
    const items=slots.map(index=>page.objects[index]);
    const [item]=items.splice(items.findIndex(object=>object.id===sourceId),1);
    const at=items.findIndex(object=>object.id===targetId)+(front?1:0);
    items.splice(at,0,item); slots.forEach((index,i)=>page.objects[index]=items[i]);
  }
  const api=Object.freeze({keyOf,units,reorder,reorderChild});
  root.IlapoObjectsModel=api;
  if(typeof module==='object' && module.exports) module.exports=api;
}(typeof globalThis==='undefined'?this:globalThis));
