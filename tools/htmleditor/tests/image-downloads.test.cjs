const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Images=require('../image-downloads.js'),crypto=require('node:crypto');
const base='https://joho.kaijo.ed.jp/tools/htmleditor/index.html?lesson=html14';
const root=path.resolve(__dirname,'../../..'),asset=Images.forLesson('html14')[0];
test('登録9画像は実教材リンク・原本の容量・SHA-256に一致する',()=>{
  assert.equal(Images.assets.length,9);
  for(const image of Images.assets){
    const bytes=fs.readFileSync(path.join(root,'html/images',image.name));
    assert.equal(bytes.length,image.size);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),image.sha256);
    assert(fs.readFileSync(path.join(root,image.lessonId+'.html'),'utf8').includes('./html/images/'+image.name));
  }
  assert.equal(Images.forLesson('html12').length,0);assert(Object.isFrozen(asset));
});
test('現在の教材の明示画像だけ扱い、外部・別教材・クエリ・任意画像・偽の定義を拒否',()=>{
  const url=Images.assetUrl(asset,base);assert.equal(Images.fromLink('html14',url,base),asset);
  for(const href of [url+'?x',url+'#x',url.replace('joho.kaijo.ed.jp','example.org'),url.replace('photo01','private'),url.replace('photo01.jpg','x.svg'),'javascript:alert(1)'])assert.equal(Images.fromLink('html14',href,base),null);
  assert.equal(Images.fromLink('html15',url,base),null);assert.throws(()=>Images.assetUrl({...asset},base));
});
test('エディタのSRIは画像保存モジュールを含む全37資産の実内容と一致する',()=>{
  const html=fs.readFileSync(path.join(root,'tools/htmleditor/index.html'),'utf8');let count=0;
  assert.match(html,/<script src="image-downloads\.js[^>]+integrity="sha384-[^"]+"/);
  for(const tag of html.matchAll(/<(?:script|link)\b[^>]+>/g)){
    const integrity=/integrity="([^"]+)"/.exec(tag[0]),source=/(?:src|href)="([^"?]+)(?:\?[^"]*)?"/.exec(tag[0]);
    if(!integrity||!source)continue;
    const file=path.resolve(root,'tools/htmleditor',source[1]);
    assert.equal(integrity[1],'sha384-'+crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64'),source[1]);count++;
  }
  assert.equal(count,37);
});
test('取得は公開画像のみ、資格情報なし・redirect禁止・容量/ハッシュ検証',async()=>{
  const bytes=fs.readFileSync(path.join(root,'html/images',asset.name)),calls=[];
  const fetch=async(url,options)=>{calls.push([url,options]);return new Response(bytes,{headers:{'content-type':asset.mime,'content-length':String(bytes.length)}});};
  const actual=await Images.fetchAsset(asset,{base,fetch});assert.deepEqual(Buffer.from(actual),bytes);
  assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].mode,'same-origin');
  for(const [data,mime,length] of [[bytes,'text/html',bytes.length],[Buffer.alloc(asset.size),asset.mime,asset.size],[bytes,asset.mime,9],[Buffer.concat([bytes,Buffer.from([0])]),asset.mime,null]]){
    await assert.rejects(Images.fetchAsset(asset,{base,fetch:async()=>new Response(data,{headers:{'content-type':mime,...(length===null?{}:{'content-length':String(length)})}})}));
  }
  await assert.rejects(Images.fetchAsset(asset,{base,fetch:async()=>({ok:true,url:'https://example.org/a',headers:new Headers({'content-type':asset.mime})})}));
  const decoded=await Images.fetchAsset(asset,{base,fetch:async()=>new Response(bytes,{headers:{'content-type':asset.mime,'content-encoding':'gzip','content-length':'123'}})});
  assert.deepEqual(Buffer.from(decoded),bytes,'圧縮時のContent-Lengthより、展開後のバイト数・ハッシュで判定');
});
