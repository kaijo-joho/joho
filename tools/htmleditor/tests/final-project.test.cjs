const test = require('node:test');
const assert = require('node:assert/strict');
const Project = require('../final-project.js');
const entry = (path,size=0) => ({path,size});

test('最終課題は直下index.html、許可形式、50件、容量とNFCパスを検査し、OSメタデータだけを列挙して除外',()=>{
  const plan=Project.inspectPaths([entry('index.html',5),entry('images/写真.png',8),entry('.DS_Store'),entry('__MACOSX/._index.html')]);
  assert.equal(plan.files.length,2); assert.equal(plan.total,13); assert.equal(plan.excluded.length,2);
  for(const bad of ['a.js','movie.mp4','notes.txt','.htaccess','images/../a.png','/index.html','a\\b.png','a%20b.png','e\u0301.png', 'a/'.repeat(8)+'b.png','あ'.repeat(81)+'.png']){
    assert.throws(()=>Project.inspectPaths([entry('index.html'),entry(bad)]),bad);
  }
  assert.throws(()=>Project.inspectPaths([entry('folder/index.html')]));
  assert.throws(()=>Project.inspectPaths([entry('index.html'),entry('INDEX.HTML')]));
  assert.throws(()=>Project.inspectPaths([entry('index.html'),entry('a.css'),entry('a.css/inner.html')]));
  assert.throws(()=>Project.inspectPaths([entry('index.html'),entry('Images/a.png'),entry('images/b.png')]));
  assert.throws(()=>Project.inspectPaths([entry('index.html'),entry('Straße.png'),entry('STRASSE.png')]));
  assert.throws(()=>Project.inspectPaths([entry('index.html'),...Array.from({length:50},(_,i)=>entry(i+'.png'))]));
  assert.throws(()=>Project.inspectPaths([entry('index.html',20*1024*1024+1)]));
  assert.throws(()=>Project.inspectPaths([entry('index.html',20*1024*1024),entry('a.css',20*1024*1024),entry('b.png',11*1024*1024)]));
});
test('ZIPはUTF-8・CRC・実サイズ付きで作り、同じ保存済み本文には同じbytesを返す',async()=>{
  const files=[{path:'index.html',raw:new TextEncoder().encode('<html><body>作品</body></html>')}];
  const a=await Project.pack(files), b=await Project.pack(files);
  assert.deepEqual(Buffer.from(await a.arrayBuffer()),Buffer.from(await b.arrayBuffer()));
  const raw=new Uint8Array(await a.arrayBuffer()), view=new DataView(raw.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  assert.equal(view.getUint16(6,true),0x800);
  assert.equal(view.getUint32(14,true),Project.crc32(files[0].raw));
  assert.equal(view.getUint32(22,true),files[0].raw.length);
  assert.equal(new DataView(raw.buffer,raw.length-22).getUint16(8,true),1);
  assert.equal(Project.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
});
test('画像の拡張子と内容の不一致を通さない',()=>{
  assert.throws(()=>Project.checkContent(new Uint8Array([1,2,3]),'a.png'));
  Project.checkContent(new Uint8Array([137,80,78,71,13,10,26,10]),'a.png');
});
test('10MiBを超えるZIPは送信用の候補にしない',async()=>{
  const {randomBytes}=require('node:crypto');
  await assert.rejects(Project.pack([{path:'index.html',raw:randomBytes(10*1024*1024+1)}]),/10MiB/);
});
