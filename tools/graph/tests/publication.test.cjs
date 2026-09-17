const assert=require('node:assert/strict');
const P=require('../publication.js'),C=require('../core.js');
(async()=>{
  const original=C.createDocument().output;
  for(const preset of P.presets()){
    const result=P.applyPreset(original,preset.id);
    assert.equal(P.presetId(result),preset.id);
    assert.equal(result.paper,original.paper);assert.equal(result.title,original.title);
    assert.notEqual(result,original);
  }
  assert.equal(P.presetId({...original,width:789}),'custom');
  assert.throws(()=>P.applyPreset(original,'missing'));
  assert.deepEqual(P.rasterSize({width:1600,height:900},2),{width:3200,height:1800});
  assert.throws(()=>P.rasterSize({width:4096,height:4096},2),/大きすぎ/);
  assert.throws(()=>P.rasterSize({width:2400,height:400},4),/大きすぎ/);
  assert.throws(()=>P.rasterSize({width:1000,height:500},0));
  const doc=C.createDocument();assert.equal(P.sourceText(doc),'');
  const s=C.createSeries('data2d');s.name='A';s.source={kind:'reference',title:'公式の表',url:'https://example.com/data',notes:'基準1991–2020。単位℃。利用条件を保持。'};
  doc.series=[s,{...s,name:'B',visible:false},{...s,name:'C',source:{...s.source,notes:'別の条件'}}];
  const text=P.sourceText(doc);assert.match(text,/A／B/);assert.match(text,/\[2\] C/);assert.doesNotMatch(text,/\[3\]/);assert.match(text,/基準1991–2020/);
  const url='data:image/png;base64,iVBORw0KGgo=';
  assert.equal((await P.pngBlob(url).arrayBuffer()).byteLength,8);assert.equal(P.pngBlob(url).type,'image/png');assert.throws(()=>P.pngBlob('data:image/svg+xml,x'));
  let resolve,writeStarted=false,received;
  const image=new Promise(r=>{resolve=r;});
  const environment={ClipboardItem:class{constructor(value){this.value=value;}},navigator:{clipboard:{write(items){writeStarted=true;return items[0].value['image/png'].then(blob=>{received=blob;});}}}};
  const pending=P.copyPNG(image,environment);assert.equal(writeStarted,true,'start clipboard write before rendering resolves');resolve(url);await pending;assert.equal(received.type,'image/png');
  await assert.rejects(P.copyPNG(url,{}),/画像を保存/);
  environment.navigator.clipboard.write=()=>Promise.reject(new Error('denied'));
  await assert.rejects(P.copyPNG(url,environment),/許可/);
  await assert.rejects(P.copyPNG(Promise.reject(new Error('render failed')),environment),/render failed/);
  environment.navigator.clipboard.write=()=>{throw new Error('sync failure');};
  await assert.rejects(P.copyPNG(url,environment),/画像を保存/);
  console.log('publication.test.cjs: ok');
})().catch(error=>{console.error(error);process.exitCode=1;});
