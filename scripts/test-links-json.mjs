import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {html, script, runLinkPage} from './link-page-test-helper.mjs';

const categories = [
  ['quizzes', ['quiz','quizzes','q'], ['quizId','qId','qid','q']],
  ['submitForms', ['submit','s'], ['submitFormId','sId','sid','s']],
  ['reviewForms', ['review','r'], ['reviewFormId','rId','rid','r']],
  ['pubFiles', ['pub','p'], ['pubFileId','pId','pid','p']],
  ['notices', ['notice','notices','n'], ['noticeId','nId','nid','n']],
  ['files', ['file','files','f'], ['fileId','fId','fid','f']],
  ['urls', ['url','urls','u'], ['urlId','uId','uid','u']]
];
const item = (type,id) => ({title:'教材 '+type+'/'+id,url:'https://example.org/'+type+'/'+id});
const collections = Object.fromEntries(categories.map(([type]) => [type,{shared:item(type,'shared'),[type]:item(type,type)}]));
const published = JSON.parse(fs.readFileSync(new URL('../data/links.json',import.meta.url),'utf8'));
const publishedCount = Object.values(published.collections).reduce((n,rows)=>n+Object.keys(rows).length,0);

for (const [type, aliases, params] of categories) {
  test(type+': type aliases retain explicit lookup and redirect=0', async () => {
    for (const alias of aliases) {
      for (const typeParam of ['type','t']) {
        const result=await runLinkPage(typeParam+'='+alias.toUpperCase()+'&id=shared&redirect=0',{collections});
        assert.equal(result.nodes.find(n=>n.tag==='a').href,collections[type].shared.url);
        assert.deepEqual(result.redirects,[]);
        assert.equal(result.requests.length,1);
        assert.equal(result.requests[0].url,'./data/links.json');
        assert.equal(result.requests[0].request.cache,'no-cache');
        assert.equal(result.timers.size,0);
      }
    }
  });
  test(type+': long/short ID aliases retain automatic redirect', async () => {
    for (const param of params) {
      const result=await runLinkPage(param+'=shared',{collections});
      assert.deepEqual(result.redirects,[collections[type].shared.url]);
    }
  });
}
test('id priority, trimmed values, cross lookup and declared category priority stay compatible', async () => {
  for(const query of ['id=quizzes&q=urls','id=%20quizzes%20','type=unknown&id=quizzes','type=file&id=quizzes']) {
    assert.deepEqual((await runLinkPage(query,{collections})).redirects,[collections.quizzes.quizzes.url]);
  }
  assert.deepEqual((await runLinkPage('q=shared&type=file',{collections})).redirects,[collections.files.shared.url]);
  assert.deepEqual((await runLinkPage('id=shared',{collections})).redirects,[collections.quizzes.shared.url]);
  assert.deepEqual((await runLinkPage('q=&qid=quizzes',{collections})).redirects,[collections.quizzes.quizzes.url]);
});
test('label uses text only, link label retains item title, and private description is not rendered', async () => {
  const title='<img src=x onerror=alert(1)>',label='<script>test</script>';
  const result=await runLinkPage('f=sample&label='+encodeURIComponent(label)+'&redirect=0',{
    collections:{files:{sample:{title,url:'https://example.org/',description:'PRIVATE NOTE'}}}
  });
  assert.equal(result.nodes.find(n=>n.tag==='a').textContent,title);
  assert.equal(result.nodes.find(n=>n.tag==='h3').textContent,'『'+label+'』を開いています．．．');
  assert.equal(result.title,label+' を開いています．．．');
  assert.ok(!result.nodes.some(n=>n.textContent==='PRIVATE NOTE'));
  assert.doesNotMatch(script,/innerHTML/);
});
test('no ID performs no fetch, and missing/prototype/retired typing IDs never redirect', async () => {
  const empty=await runLinkPage('',{collections});
  assert.equal(empty.requests.length,0);
  for(const query of ['u=absent','id=__proto__','id=constructor','id=toString','typingId=L1']) {
    const result=await runLinkPage(query,{collections});
    assert.equal(result.redirects.length,0);
    assert.ok(result.nodes.some(n=>n.textContent?.includes('見つかりませんでした')));
  }
});
for(const options of [{fetchError:true},{status:404},{status:500},{jsonError:true},{timeout:true}]) {
  test('JSON load failure stops with a visible message: '+JSON.stringify(options),async()=>{
    const result=await runLinkPage('id=shared',{...options,collections,legacyWindow:{quizzes:{shared:item('old','shared')}}});
    assert.equal(result.redirects.length,0);
    assert.ok(result.nodes.some(n=>n.textContent?.includes('読み込めませんでした')));
    assert.equal(result.timers.size,0);
  });
}
test('unsupported version, missing/array collections and bad items stop without partial output',async()=>{
  const empty=Object.fromEntries(categories.map(([name])=>[name,{}]));
  const doc = collections => ({schemaVersion:1,generatedAt:'2026-10-20T07:04:32.021Z',collections});
  const badDocs=[null,{}, {...doc(empty),schemaVersion:2},doc([]),
    {schemaVersion:1,collections:empty},...['invalid',12,'2026-10-20'].map(generatedAt=>({...doc(empty),generatedAt})),
    doc({...empty,files:[]}), doc({files:{}}),
    ...['javascript:alert(1)','http://example.org/','data:text/html,test','https://user:pw@example.org/','https://example.org/\\evil','https://example.org/\n'].map(url=>doc({...empty,files:{bad:{title:'bad',url}}})),
    doc({...empty,files:{bad:{title:'',url:'https://example.org/'}}})
  ];
  for(const jsonValue of badDocs) {
    const result=await runLinkPage('id=shared',{jsonValue});
    assert.equal(result.redirects.length,0);
    assert.ok(result.nodes.some(n=>n.textContent?.includes('読み込めませんでした')));
  }
});
test('asynchronous content stays in the static main landmark before the common footer',async()=>{
  assert.match(html,/<body>\s*<main id="main-content"><\/main>/);
  for(const options of [{collections},{fetchError:true}]) {
    const result=await runLinkPage('q=shared&redirect=0',options);
    assert.ok(result.nodes.find(n=>n.tag==='main').children.some(n=>n.tag==='section'));
    assert.ok(!result.nodes.find(n=>n.tag==='body').children.some(n=>n.tag==='section'));
  }
});
test('published payload has only allowed fields and all '+publishedCount+' routes resolve through the JSON',async()=>{
  const jsonValue=published;
  assert.deepEqual(Object.keys(jsonValue).sort(),['collections','generatedAt','schemaVersion']);
  assert.equal(jsonValue.schemaVersion,1);
  assert.equal(jsonValue.collections.typing,undefined);
  let checked=0;
  for(const [name, aliases] of categories) {
    for(const [id,entry] of Object.entries(jsonValue.collections[name])) {
      assert.deepEqual(Object.keys(entry).sort(),['title','url']);
      const result=await runLinkPage('type='+aliases[0]+'&id='+encodeURIComponent(id)+'&redirect=0',{jsonValue});
      assert.equal(result.nodes.find(n=>n.tag==='a').href,entry.url);
      assert.equal(result.nodes.find(n=>n.tag==='a').textContent,entry.title);
      assert.equal(result.redirects.length,0); checked++;
    }
  }
  assert.ok(checked>0);
  assert.equal(checked,publishedCount);
  assert.doesNotMatch(html,/src=["'][^"']*js\/links\.js/);
});
