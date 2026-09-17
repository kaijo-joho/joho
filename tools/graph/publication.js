/* 教材用の画像サイズ・クリップボード・出典文字列。図の描画処理は既存の描画器を使う。 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GraphPublication=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const presets=[
    {id:'worksheet',name:'プリント掲載（1600 × 1200）',width:1600,height:1200,margin:72,fontSize:24},
    {id:'slide',name:'スライド 16:9（1600 × 900）',width:1600,height:900,margin:72,fontSize:28},
    {id:'square',name:'正方形（1000 × 1000）',width:1000,height:1000,margin:64,fontSize:24}
  ];
  const keys=['width','height','margin','fontSize'];
  function presetId(output){return presets.find(p=>keys.every(key=>output[key]===p[key]))?.id||'custom';}
  function applyPreset(output,id){
    const preset=presets.find(p=>p.id===id);if(!preset)throw new Error('画像サイズの設定を選んでください。');
    return {...output,...Object.fromEntries(keys.map(key=>[key,preset[key]]))};
  }
  function rasterSize(output,scale){
    if(!Number.isInteger(scale)||scale<1||scale>4)throw new Error('画像の倍率は1〜4で指定してください。');
    if(!['width','height'].every(key=>Number.isInteger(output[key])&&output[key]>=320&&output[key]<=4096))throw new Error('画像の幅・高さは320〜4096pxで指定してください。');
    const width=output.width*scale,height=output.height*scale;
    if(width>8192||height>8192||width*height>33554432)throw new Error('画像が大きすぎます。幅・高さか倍率を小さくしてください。');
    return {width,height};
  }
  function sourceText(doc){
    const sources=new Map(),names={user:'自分のデータ',reference:'資料の数値',model:'式・モデルからの値'};
    for(const series of doc.series){
      const source=series.source;
      if(!source||![source.title,source.url,source.notes].some(Boolean))continue;
      const key=JSON.stringify([source.kind,source.title,source.url,source.notes]);
      if(!sources.has(key))sources.set(key,{source,names:[]});
      const entry=sources.get(key),name=series.name||'無題の系列';if(!entry.names.includes(name))entry.names.push(name);
    }
    if(!sources.size)return '';
    return (doc.name||'無題のグラフ')+' — 出典・条件\n\n'+[...sources.values()].map(({source,names:seriesNames},i)=>
      '['+(i+1)+'] '+seriesNames.join('／')+'\n'+[names[source.kind]||'出典',source.title,source.url,source.notes].filter(Boolean).join('\n')
    ).join('\n\n');
  }
  function pngBlob(url){
    if(typeof url!=='string'||!url.startsWith('data:image/png;base64,'))throw new Error('PNG画像を作成できませんでした。');
    const bytes=Uint8Array.from(atob(url.slice('data:image/png;base64,'.length)),c=>c.charCodeAt(0));
    return new Blob([bytes],{type:'image/png'});
  }
  function copyPNG(image,environment=globalThis){
    const clipboard=environment.navigator?.clipboard,Item=environment.ClipboardItem;
    if(!clipboard?.write||!Item)return Promise.reject(new Error('この環境では画像をコピーできません。「画像を保存」でPNGを保存して貼り付けてください。'));
    const blob=Promise.resolve(image).then(pngBlob);
    // クリックの直後に書き込みを開始し、PNGの生成をPromiseで渡す。
    let write;try{write=clipboard.write([new Item({'image/png':blob})]);}catch(error){write=Promise.reject(error);}
    return Promise.allSettled([blob,write]).then(([rendered,copied])=>{
      if(rendered.status==='rejected')throw rendered.reason;
      if(copied.status==='rejected')throw new Error('画像をコピーできませんでした。ブラウザの許可を確認するか、「画像を保存」を使ってください。');
    });
  }
  return {presets:()=>presets.map(p=>({...p})),presetId,applyPreset,rasterSize,sourceText,pngBlob,copyPNG};
});
