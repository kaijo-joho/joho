/* 選択した図形（または平坦なグループ）の整列計算。ページは変更しない。 */
(function(root){
  'use strict';
  const modes=new Set(['left','center','right','top','middle','bottom','distribute-x','distribute-y','width','height','size']);
  const references=new Set(['object','selection','board']);
  const finite=(value,label)=>{
    const number=Number(value);
    if(!Number.isFinite(number))throw new TypeError(label+'は有限の数値にしてください。');
    return number;
  };
  const box=(value,label)=>{
    if(!value||typeof value!=='object')throw new TypeError(label+'を取得できません。');
    const out={x:finite(value.x,label+'.x'),y:finite(value.y,label+'.y'),width:finite(value.width,label+'.width'),height:finite(value.height,label+'.height')};
    if(out.width<0||out.height<0)throw new RangeError(label+'の幅と高さは0以上にしてください。');
    return out;
  };
  const union=units=>{
    const left=Math.min(...units.map(unit=>unit.b.x)),top=Math.min(...units.map(unit=>unit.b.y));
    const right=Math.max(...units.map(unit=>unit.b.x+unit.b.width)),bottom=Math.max(...units.map(unit=>unit.b.y+unit.b.height));
    return {x:left,y:top,width:right-left,height:bottom-top};
  };
  const labelFor=objects=>{
    const name=String(objects[0]?.name||'').trim()||'図形';
    return objects.length>1?name+'など'+objects.length+'個':name;
  };
  function collect(page,selectedIds,measure){
    if(!page||!Array.isArray(page.objects))throw new TypeError('ページの図形一覧が不正です。');
    if(!Array.isArray(selectedIds))throw new TypeError('選択図形は配列で指定してください。');
    if(typeof measure!=='function')throw new TypeError('外接矩形を測定する関数が必要です。');
    const byId=new Map(page.objects.filter(object=>object&&object.id!=null).map(object=>[object.id,object]));
    const seen=new Set(),units=[];
    selectedIds.forEach(id=>{
      const object=byId.get(id);
      if(!object)return;
      const key=object.group||object.id;
      if(seen.has(key))return;
      seen.add(key);
      const objects=object.group?page.objects.filter(item=>item&&item.group===object.group):[object];
      const ids=objects.map(item=>item.id);
      units.push({key,ids,label:labelFor(objects),b:box(measure(ids,page),'図形の外接矩形')});
    });
    return units;
  }
  const target=(units,key)=>units.find(unit=>unit.key===key)||units[0];
  const boardBox=board=>{
    if(!board||typeof board!=='object')throw new TypeError('用紙の大きさを指定してください。');
    if(board.infinite)throw new RangeError('無限キャンバスでは用紙を基準に整列できません。');
    const out=box({x:0,y:0,width:board.width,height:board.height},'用紙');
    if(out.width<=0||out.height<=0)throw new RangeError('用紙の幅と高さは0より大きくしてください。');
    return out;
  };
  const moved=(unit,matrix)=>{
    const identity=matrix[0]===1&&matrix[1]===0&&matrix[2]===0&&matrix[3]===1&&matrix[4]===0&&matrix[5]===0;
    return identity?null:{ids:unit.ids.slice(),matrix};
  };
  function plan(units,mode,options){
    if(!Array.isArray(units))throw new TypeError('整列する図形は配列で指定してください。');
    if(!modes.has(mode))throw new RangeError('未対応の整列方法です。');
    const checked=units.map((unit,index)=>{
      if(!unit||typeof unit!=='object'||!Array.isArray(unit.ids)||!unit.ids.length)throw new TypeError('整列対象'+(index+1)+'が不正です。');
      return {key:unit.key,ids:unit.ids.slice(),b:box(unit.b,'整列対象'+(index+1)+'の外接矩形')};
    });
    const settings=options||{},reference=settings.reference===undefined?'object':settings.reference;
    if(!references.has(reference))throw new RangeError('未対応の基準です。');
    const needsMany=reference!=='board'||mode==='width'||mode==='height'||mode==='size';
    if(!checked.length)throw new RangeError('整列する図形を選んでください。');
    if(needsMany&&checked.length<2)throw new RangeError('2つ以上の図形またはグループを選んでください。');
    if(mode==='distribute-x'||mode==='distribute-y'){
      if(checked.length<3)throw new RangeError('等間隔に並べるには3つ以上の図形またはグループを選んでください。');
      const axis=mode==='distribute-x'?'x':'y',size=axis==='x'?'width':'height';
      const range=reference==='board'?boardBox(settings.board):union(checked);
      const ordered=checked.slice().sort((a,b)=>a.b[axis]-b.b[axis]);
      const start=range[axis],end=start+range[size],total=ordered.reduce((sum,unit)=>sum+unit.b[size],0),gap=(end-start-total)/(ordered.length-1);
      let cursor=start;
      return ordered.map(unit=>{
        const delta=cursor-unit.b[axis];cursor+=unit.b[size]+gap;
        return moved(unit,[1,0,0,1,axis==='x'?delta:0,axis==='y'?delta:0]);
      }).filter(Boolean);
    }
    const keyUnit=target(checked,settings.key);
    if(mode==='width'||mode==='height'||mode==='size'){
      return checked.map(unit=>{
        if(unit===keyUnit)return null;
        const sx=(mode==='height'||unit.b.width===0)?1:keyUnit.b.width/unit.b.width;
        const sy=(mode==='width'||unit.b.height===0)?1:keyUnit.b.height/unit.b.height;
        const cx=unit.b.x+unit.b.width/2,cy=unit.b.y+unit.b.height/2;
        return moved(unit,[sx,0,0,sy,cx-sx*cx,cy-sy*cy]);
      }).filter(Boolean);
    }
    const range=reference==='board'?boardBox(settings.board):reference==='selection'?union(checked):keyUnit.b;
    return checked.map(unit=>{
      let dx=0,dy=0;
      if(mode==='left')dx=range.x-unit.b.x;
      else if(mode==='center')dx=range.x+range.width/2-(unit.b.x+unit.b.width/2);
      else if(mode==='right')dx=range.x+range.width-(unit.b.x+unit.b.width);
      else if(mode==='top')dy=range.y-unit.b.y;
      else if(mode==='middle')dy=range.y+range.height/2-(unit.b.y+unit.b.height/2);
      else if(mode==='bottom')dy=range.y+range.height-(unit.b.y+unit.b.height);
      return moved(unit,[1,0,0,1,dx,dy]);
    }).filter(Boolean);
  }
  const api=Object.freeze({collect,plan});
  root.IlapoArrange=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
}(globalThis));
