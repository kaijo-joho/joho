(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DiagramOutput=api;
})(typeof globalThis!=='undefined'?globalThis:this,function() {
  'use strict';
  const fail=message=>{throw new Error(message);};
  function number(value,min,max,label) {
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`${label}を${min}〜${max}の数値で指定してください。`);
    return value;
  }
  function padding(value=32) {
    if(typeof value==='number')value={top:value,right:value,bottom:value,left:value};
    if(!value||typeof value!=='object'||Array.isArray(value))fail('余白を数値で指定してください。');
    return Object.fromEntries(['top','right','bottom','left'].map(key=>[key,number(value[key],0,1000,'余白')]));
  }
  function bounds(value) {
    if(!value||!['x','y','w','h'].every(key=>Number.isFinite(value[key]))||value.w<=0||value.h<=0)fail('図の大きさを取得できません。');
    return value;
  }
  function imageLayout(box,options={}) {
    const b=bounds(box),p=padding(options.padding),viewBox={x:b.x-p.left,y:b.y-p.top,w:b.w+p.left+p.right,h:b.h+p.top+p.bottom};
    const mode=options.mode??'scale';let requested;
    if(mode==='scale') {
      requested=options.scale??1;if(![1,2,4].includes(requested))fail('画像の倍率を選んでください。');
    } else if(mode==='width'||mode==='height') {
      const size=number(options[mode],1,100000,'画像の寸法');if(!Number.isInteger(size))fail('画像の寸法は整数で指定してください。');
      requested=size/(mode==='width'?viewBox.w:viewBox.h);
    } else fail('画像の寸法の指定方法を選んでください。');
    const scale=Math.min(requested,8192/viewBox.w,8192/viewBox.h,Math.sqrt(32000000/(viewBox.w*viewBox.h)));
    const width=Math.max(1,Math.floor(viewBox.w*scale+1e-8)),height=Math.max(1,Math.floor(viewBox.h*scale+1e-8));
    return {viewBox,width,height,scale,adjusted:scale<requested-1e-8,padding:p};
  }
  function printLayout(box,options) {
    const b=bounds(box),aw=number(options.availableWidth,.001,1000,'印刷領域の幅'),ah=number(options.availableHeight,.001,1000,'印刷領域の高さ');
    const mode=options.mode??'fit',align=options.align??'center',valign=options.valign??'middle';
    if(!['fit','width'].includes(mode)||!['left','center','right'].includes(align)||!['top','middle','bottom'].includes(valign))fail('印刷の配置を選んでください。');
    const fit=Math.min(aw/b.w,ah/b.h),requested=mode==='width'?number(options.width,1,1000,'印刷する図の幅')/b.w:fit,scale=Math.min(requested,fit);
    const width=b.w*scale,height=b.h*scale,x=(aw-width)*({left:0,center:.5,right:1}[align]),y=(ah-height)*({top:0,middle:.5,bottom:1}[valign]);
    return {width,height,x,y,adjusted:scale<requested-1e-8};
  }
  return Object.freeze({padding,imageLayout,printLayout});
});
