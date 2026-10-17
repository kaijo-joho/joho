import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trialAdminFixture as fixture, OWNER, SECOND, DEMO, OUTSIDER, plain } from './trial-admin-fixture.mjs';
const code=expected=>error=>error.toolsTrialCode===expected||error.toolsStoreCode===expected;
test('個人だけの準備は3GSSに限定し、中央と試用config/有効化/署名鍵を作らない',()=>{
  const f=fixture(),result=f.context.run_prepareSchoolTrialPersonalStores();
  assert.equal(result.personalOnly,true);assert.equal(result.enabled,false);assert.equal(result.files.length,3);assert.equal(f.state.creates,3);assert.equal(f.books.size,3);
  assert.deepEqual(plain(result.files.map(file=>file.sheets)),[6,6,6]);assert.deepEqual(f.state.sharing.map(share=>share.account),[SECOND,DEMO]);
  const setup=f.setup();assert.equal(setup.entries[3].role,'central');assert.equal(setup.entries[3].state,'planned');assert.equal(setup.entries[3].spreadsheetId,undefined);
  assert.deepEqual(setup.entries.slice(0,3).map(entry=>entry.state),['prepared','prepared','prepared']);assert.equal(f.config(),null);
  for(const key of [f.context.ToolsSchoolTrial.keys.binding,f.context.ToolsSchoolTrial.keys.signing,f.keys.trigger])assert.equal(f.properties.getProperty(key),null);
  const before=f.stored(),savedSetup=f.setup(),shares=f.state.sharing.length;f.state.mutations=[];f.admin.prepare(true);
  assert.deepEqual(f.stored(),before);assert.deepEqual(f.setup(),savedSetup);assert.equal(f.state.creates,3);assert.equal(f.state.sharing.length,shares);assert.equal(f.state.mutations.length,0);assert.equal(f.config(),null);
});
test('個人3件の設定は作成・共有を増やさず、中央なし・無効状態・専用鍵で開始する',()=>{
  const f=fixture();f.admin.prepare(true);const before=f.stored(),setup=f.setup(),shares=f.state.sharing.length;f.state.mutations=[];f.state.opens=[];
  const result=f.context.run_configureSchoolTrialPersonalOnly(),config=f.config();
  assert.equal(result.files.length,3);assert.equal(result.enabled,false);assert.equal(config.centralId,null);assert.equal(config.enabled,false);assert.equal(config.scopeId,setup.scopeId);
  assert.deepEqual(config.participants.map(p=>({account:p.account,role:p.role,spreadsheetId:p.spreadsheetId,generation:p.generation})),setup.entries.slice(0,3).map(({account,role,spreadsheetId,generation})=>({account,role,spreadsheetId,generation})));
  assert.equal(f.state.creates,3);assert.equal(f.state.sharing.length,shares);assert.equal(f.state.mutations.length,0);assert.deepEqual(f.stored(),before);assert.deepEqual(f.setup(),setup);
  for(const key of [f.context.ToolsSchoolTrial.keys.binding,f.context.ToolsSchoolTrial.keys.signing])assert.match(f.properties.getProperty(key),/^[a-f0-9]{64}$/);
  assert.equal(f.properties.getProperty(f.keys.trigger),null);assert.ok(f.state.opens.every(id=>config.participants.some(p=>p.spreadsheetId===id)));
  assert.equal(f.admin.inspect().files.length,3);assert.equal(f.setup().entries[3].state,'planned');
});
test('個人設定は未準備・別所有者・header/保護/共有の不整合では鍵やconfigを作らない',()=>{
  const fresh=fixture();assert.throws(()=>fresh.admin.configurePersonalOnly(),code('preparation_required'));assert.equal(fresh.state.creates,0);assert.equal(fresh.properties.writes.length,0);
  for(const mutate of [f=>f.select(SECOND),f=>f.setSetup(s=>s.entries[1].state='created'),
    f=>f.books.get(f.setup().entries[1].spreadsheetId).getSheetByName(f.C.HISTORY).cells.set('1,2','BROKEN'),
    f=>f.books.get(f.setup().entries[2].spreadsheetId).getSheetByName(f.C.GUIDE).protections[0].audiences.push('unexpected'),
    f=>f.books.get(f.setup().entries[2].spreadsheetId).viewers.push(OUTSIDER)]){
    const f=fixture();f.admin.prepare(true);mutate(f);const before=f.stored(),props=f.properties.getProperties(),shares=f.state.sharing.length;f.state.mutations=[];
    assert.throws(()=>f.admin.configurePersonalOnly());assert.deepEqual(f.stored(),before);assert.deepEqual(f.properties.getProperties(),props);assert.equal(f.state.mutations.length,0);assert.equal(f.state.creates,3);assert.equal(f.state.sharing.length,shares);assert.equal(f.config(),null);
  }
});
test('中央なしの有効化・再設定は既存本文と鍵を保持し、回収トリガーをarmしない',()=>{
  const f=fixture();f.admin.prepare(true);f.admin.configurePersonalOnly();assert.throws(()=>f.admin.enable(true),code('url_required'));assert.equal(f.enable().enabled,true);
  for(const entry of f.setup().entries.slice(0,3))f.books.get(entry.spreadsheetId).getSheetByName(f.R.SHEET).getRange(2,1,1,2).setValues([['existing receipt','KEEP']]);
  const before=f.stored(),config=f.config(),props=f.properties.getProperties(),setup=f.setup(),shares=f.state.sharing.length;f.state.mutations=[];f.properties.writes=[];
  assert.equal(f.admin.configurePersonalOnly().enabled,true);assert.equal(f.admin.prepare(true).enabled,true);assert.deepEqual(f.stored(),before);assert.deepEqual(f.setup(),setup);assert.deepEqual(f.config(),config);assert.deepEqual(f.properties.getProperties(),props);assert.equal(f.properties.writes.length,0);
  assert.equal(f.state.creates,3);assert.equal(f.state.sharing.length,shares);assert.equal(f.state.mutations.length,0);assert.equal(f.properties.getProperty(f.keys.trigger),null);assert.throws(()=>f.trigger(),code('account_denied'));
  f.setPreview({enabled:false});assert.equal(f.admin.enable(false).enabled,false);assert.equal(f.config().centralId,null);assert.deepEqual(f.stored(),before);
});
test('個人設定の応答消失は同じconfigと鍵で再開し、鍵消失時は再発行せず停止する',()=>{
  const f=fixture();f.admin.prepare(true);let lost=true;
  f.state.afterPropertyWrite=key=>{if(lost&&key===f.context.ToolsSchoolTrial.keys.config){lost=false;throw new Error('synthetic config response lost');}};
  assert.throws(()=>f.admin.configurePersonalOnly(),/config response lost/);const config=f.config(),props=f.properties.getProperties(),before=f.stored();f.state.afterPropertyWrite=null;
  assert.equal(f.admin.configurePersonalOnly().enabled,false);assert.deepEqual(f.config(),config);assert.deepEqual(f.properties.getProperties(),props);assert.deepEqual(f.stored(),before);assert.equal(f.state.creates,3);
  f.properties.deleteProperty(f.context.ToolsSchoolTrial.keys.signing);const missing=f.properties.getProperties();assert.throws(()=>f.admin.configurePersonalOnly(),code('key_configuration'));assert.throws(()=>f.admin.prepare(),code('key_configuration'));assert.deepEqual(f.properties.getProperties(),missing);assert.equal(f.state.creates,3);
});
test('個人運用後の中央追加は中央IDだけを変更し、有効状態・scope・世代・鍵・受付を維持する',()=>{
  for(const enabled of [false,true]){
    const f=fixture();f.admin.prepare(true);f.admin.configurePersonalOnly();if(enabled)f.enable();
    const initial=f.setup(),config=f.config(),ids=config.participants.map(p=>p.spreadsheetId),keyNames=[f.context.ToolsSchoolTrial.keys.binding,f.context.ToolsSchoolTrial.keys.signing];
    for(const id of ids){const book=f.books.get(id);book.getSheetByName(f.C.SHEET).getRange(2,1,1,2).setValues([['existing draft','KEEP']]);book.getSheetByName(f.R.SHEET).getRange(2,1,1,2).setValues([['existing receipt','KEEP']]);}
    const keys=keyNames.map(key=>f.properties.getProperty(key)),before=f.stored(),shares=f.state.sharing.length,raw=f.properties.getProperty(f.context.ToolsSchoolTrial.keys.config);f.state.mutations=[];
    const result=f.admin.prepare(),next=f.config();assert.equal(result.files.length,4);assert.equal(result.enabled,enabled);assert.equal(f.state.creates,4);assert.equal(f.state.sharing.length,shares);assert.deepEqual({...next,centralId:null},config);
    assert.equal(next.centralId,f.setup().entries[3].spreadsheetId);assert.deepEqual(f.setup().entries.slice(0,3),initial.entries.slice(0,3));assert.deepEqual(keyNames.map(key=>f.properties.getProperty(key)),keys);assert.equal(f.properties.getProperty('PYTHON_EDITOR_SCHOOL_TRIAL_LAST_CONFIG_V1'),raw);
    for(const id of ids)assert.deepEqual(f.stored()[id],before[id]);assert.ok(f.state.mutations.every(m=>m.book===next.centralId));assert.equal(f.properties.getProperty(f.keys.trigger),null);
    const full=f.properties.getProperties();assert.throws(()=>f.admin.configurePersonalOnly(),code('config_changed'));assert.deepEqual(f.properties.getProperties(),full);assert.equal(f.state.creates,4);
  }
});
test('中央追加前に既存configの中央ID以外の変更を拒否し、中央を作成しない',()=>{
  for(const mutate of [c=>c.scopeId='f'.repeat(32),c=>c.participants[1].generation='f'.repeat(32),c=>c.participants.reverse(),
    c=>c.centralId='synthetic_unregistered_central_identifier',c=>c.extra=true,c=>c.enabled='true']){
    const f=fixture();f.admin.prepare(true);f.admin.configurePersonalOnly();const config=f.config();mutate(config);f.properties.setProperty(f.context.ToolsSchoolTrial.keys.config,f.T.canonical(config));
    const before=f.stored(),props=f.properties.getProperties(),shares=f.state.sharing.length;assert.throws(()=>f.admin.prepare());assert.deepEqual(f.stored(),before);assert.deepEqual(f.properties.getProperties(),props);assert.equal(f.state.creates,3);assert.equal(f.state.sharing.length,shares);
  }
});
test('中央のID記録応答が消失しても個人運用を維持し、既存4番から再開する',()=>{
  const f=fixture();f.admin.prepare(true);f.admin.configurePersonalOnly();f.enable();const original=f.config();let lost=true;
  f.state.afterPropertyWrite=(key,value)=>{if(lost&&key===f.keys.setup&&JSON.parse(value).entries[3].state==='created'){lost=false;throw new Error('synthetic central ID response lost');}};
  assert.throws(()=>f.admin.prepare(),/central ID response lost/);const centralId=f.setup().entries[3].spreadsheetId;assert.equal(f.state.creates,4);assert.deepEqual(f.config(),original);assert.equal(f.admin.inspect().files.length,3);
  f.state.afterPropertyWrite=null;assert.equal(f.admin.prepare().enabled,true);assert.equal(f.config().centralId,centralId);assert.equal(f.state.creates,4);assert.deepEqual({...f.config(),centralId:null},original);
});
test('個人準備後の全体準備は既存3件の本文とID/世代を保持し、中央4番だけを追加する',()=>{
  const f=fixture();f.admin.prepare(true);const initial=f.setup(),ids=initial.entries.slice(0,3).map(entry=>entry.spreadsheetId);
  for(const id of ids)f.books.get(id).getSheetByName(f.C.SHEET).getRange(2,1,1,2).setValues([['existing personal draft','KEEP']]);
  const before=f.stored(),shares=f.state.sharing.length;f.state.mutations=[];const result=f.admin.prepare(),setup=f.setup(),config=f.config();
  assert.equal(f.state.creates,4);assert.equal(f.books.size,4);assert.equal(result.files.length,4);assert.equal(result.enabled,false);assert.equal(config.enabled,false);
  assert.deepEqual(setup.entries.slice(0,3),initial.entries.slice(0,3));assert.equal(setup.scopeId,initial.scopeId);assert.equal(setup.entries[3].state,'prepared');assert.equal(config.centralId,setup.entries[3].spreadsheetId);
  assert.ok(!ids.includes(config.centralId));assert.deepEqual(config.participants.map(entry=>entry.spreadsheetId),ids);assert.equal(f.state.sharing.length,shares);
  for(const id of ids)assert.deepEqual(f.stored()[id],before[id]);assert.ok(f.state.mutations.every(mutation=>mutation.book===config.centralId));
});
test('全体が有効な後の個人読戻しは有効状態を正しく返し、構成を変えない',()=>{
  const f=fixture();f.admin.prepare();f.enable();const before=f.stored(),config=f.config(),creates=f.state.creates;
  assert.equal(f.admin.prepare(true).enabled,true);assert.deepEqual(f.stored(),before);assert.deepEqual(f.config(),config);assert.equal(f.state.creates,creates);
});
test('所有教員だけが固定3アカウントの4GSSを準備し、本人共有・6/2シート・owner保護を揃える',()=>{
  const f=fixture(),result=f.admin.prepare();assert.equal(f.state.creates,4);assert.equal(result.enabled,false);assert.equal(result.files.length,4);
  assert.deepEqual(plain(result.files.map(file=>file.sheets)),[6,6,6,2]);assert.deepEqual(f.state.sharing.map(s=>s.account),[SECOND,DEMO]);
  const setup=f.setup();assert.equal(new Set(setup.entries.map(e=>e.spreadsheetId)).size,4);assert.equal(f.config().enabled,false);
  for(const entry of setup.entries){const book=f.books.get(entry.spreadsheetId);assert.equal(book.owner,OWNER);assert.deepEqual(book.editors,entry.account===OWNER?[]:[entry.account]);assert.deepEqual(book.viewers,[]);
    const guide=book.getSheetByName(f.C.GUIDE);assert.equal(guide.hidden,false);assert.equal(guide.getRange(3,2).getValues()[0][0],entry.generation);
    for(const sheet of book.sheets){assert.equal(sheet.hidden,sheet!==guide);assert.equal(sheet.protections.length,1);const p=sheet.protections[0];assert.equal(p.warning,false);assert.equal(p.domain,false);assert.deepEqual(p.editors,[OWNER]);assert.deepEqual(p.getTargetAudiences(),[]);
      assert.equal(p.range.getRow(),1);assert.equal(p.range.getColumn(),1);assert.equal(p.range.getLastRow(),sheet===guide?6:1);}
  }
  assert.equal(f.admin.inspect().files.length,4);assert.equal(f.state.lock.held,false);
});
test('非所有教員・デモ・対象外・本人不一致・不正allowlistは作成共有前に拒否する',()=>{
  for(const [active,effective]of [[SECOND,SECOND],[DEMO,DEMO],[OUTSIDER,OUTSIDER],[OWNER,SECOND],['',OWNER]]){const f=fixture();f.select(active,effective);assert.throws(()=>f.admin.prepare(),code('owner_only'));assert.equal(f.state.creates,0);assert.equal(f.properties.writes.length,0);}
  for(const change of [{teacherAccounts:[OWNER]},{teacherAccounts:[OWNER,OWNER]},{demoAccounts:[OWNER]},{demoAccounts:[OUTSIDER,DEMO]},{teacherAccounts:[OWNER,'external@example.invalid']}]){const f=fixture();f.setPreview(change);assert.throws(()=>f.admin.prepare());assert.equal(f.state.creates,0);assert.equal(f.state.sharing.length,0);}
});
test('作成intentを先に記録し、makeの成否不明時は再実行で重複作成しない',()=>{
  const f=fixture();f.state.beforeMake=()=>assert.equal(f.setup().entries.find(e=>e.state==='creating').spreadsheetId,undefined);
  f.state.afterMake=()=>{throw new Error('synthetic lost creation response');};assert.throws(()=>f.admin.prepare(),/creation response/);assert.equal(f.state.creates,1);assert.equal(f.setup().entries[0].state,'creating');
  f.state.afterMake=null;assert.throws(()=>f.admin.prepare(),code('create_uncertain'));assert.equal(f.state.creates,1);assert.equal(f.state.lock.held,false);
});
test('ID記録の応答消失は保存済IDから再開し、本文を持つファイルを作り直さない',()=>{
  const f=fixture();let lost=true;f.state.afterPropertyWrite=(key,value)=>{if(lost&&key===f.keys.setup&&JSON.parse(value).entries[0].state==='created'){lost=false;throw new Error('synthetic ID response lost');}};
  assert.throws(()=>f.admin.prepare(),/ID response lost/);assert.equal(f.state.creates,1);const first=f.setup().entries[0].spreadsheetId;
  f.state.afterPropertyWrite=null;f.admin.prepare();assert.equal(f.state.creates,4);assert.equal(f.setup().entries[0].spreadsheetId,first);
});
test('準備済みの再実行は本文・履歴・世代・署名鍵・共有を変更しない',()=>{
  const f=fixture();f.admin.prepare();for(const entry of f.setup().entries){const book=f.books.get(entry.spreadsheetId);for(const sheet of book.sheets.filter(s=>s.name!==f.C.GUIDE))sheet.getRange(2,1,1,2).setValues([['existing record','KEEP']]);}
  const before=f.stored(),setup=f.setup(),binding=f.properties.getProperty(f.context.ToolsSchoolTrial.keys.binding),signing=f.properties.getProperty(f.context.ToolsSchoolTrial.keys.signing),shares=f.state.sharing.length;
  f.state.mutations=[];f.admin.prepare();assert.deepEqual(f.stored(),before);assert.deepEqual(f.setup(),setup);assert.equal(f.state.sharing.length,shares);assert.equal(f.state.mutations.length,0);
  assert.equal(f.properties.getProperty(f.context.ToolsSchoolTrial.keys.binding),binding);assert.equal(f.properties.getProperty(f.context.ToolsSchoolTrial.keys.signing),signing);
});
test('setupのaccount/role/ID/nonce/世代の破損は全ファイルの作成共有前に拒否する',()=>{
  for(const mutate of [s=>s.entries[3].account=OUTSIDER,s=>s.entries[3].role='demo',s=>s.entries[1].role='demo',s=>s.entries[1].account=OUTSIDER,
    s=>s.entries[1].spreadsheetId=s.entries[0].spreadsheetId,s=>s.entries[1].generation=s.entries[0].generation,s=>s.entries[1].nonce=s.entries[0].nonce,s=>s.entries[0].state='planned']){
    const f=fixture();f.admin.prepare();f.setSetup(mutate);const before=f.stored(),shares=f.state.sharing.length;assert.throws(()=>f.admin.prepare(),code('setup_invalid'));assert.deepEqual(f.stored(),before);assert.equal(f.state.creates,4);assert.equal(f.state.sharing.length,shares);}
});
test('作成済みファイルのowner/共有増加は取り消しや再共有をせず停止する',()=>{
  for(const mutate of [book=>book.owner=OUTSIDER,book=>book.editors.push(OUTSIDER),book=>book.viewers.push(OUTSIDER),book=>book.editors=[]]){
    const f=fixture();f.admin.prepare();const book=f.books.get(f.setup().entries[1].spreadsheetId);mutate(book);const before=f.stored(),shares=f.state.sharing.length;assert.throws(()=>f.admin.prepare(),code('unexpected_sharing'));assert.deepEqual(f.stored(),before);assert.equal(f.state.sharing.length,shares);assert.equal(f.state.creates,4);}
});
test('全header/metadata/hidden/保護/容量の不整合はinspectで拒否し、修復して本文を上書きしない',()=>{
  for(const mutate of [(f,b)=>b.getSheetByName(f.C.HISTORY).cells.set('1,2','BROKEN'),(f,b)=>b.getSheetByName(f.C.CONFIRMATION.RECEIPTS).formulas.set('1,1','=A1'),
    (f,b)=>b.getSheetByName(f.C.GUIDE).cells.set('3,2','other-generation'),(f,b)=>b.getSheetByName(f.R.SHEET).hidden=false,
    (f,b)=>b.getSheetByName(f.C.GUIDE).hidden=true,(f,b)=>b.getSheetByName(f.C.SHEET).protections[0].domain=true,
    (f,b)=>b.getSheetByName(f.C.HISTORY).protections[0].warning=true,(f,b)=>b.getSheetByName(f.C.CONFIRMATION.SHEET).protections[0].editors.push(DEMO),
    (f,b)=>b.getSheetByName(f.C.GUIDE).protections[0].audiences.push('synthetic-target-audience'),
    (f,b)=>b.getSheetByName(f.R.SHEET).protections[0].getTargetAudiences=undefined,
    (f,b)=>b.getSheetByName(f.R.SHEET).rows=2,(f,b)=>b.insertSheet('unexpected')]){
    const f=fixture();f.admin.prepare();mutate(f,f.books.get(f.setup().entries[2].spreadsheetId));const before=f.stored();assert.throws(()=>f.admin.inspect());assert.throws(()=>f.admin.prepare());assert.deepEqual(f.stored(),before);assert.equal(f.state.creates,4);}
});
test('既存configだけがある場合とconfig registry改変時は新規作成や切替をしない',()=>{
  const fresh=fixture();fresh.properties.setProperty(fresh.context.ToolsSchoolTrial.keys.config,'{}');assert.throws(()=>fresh.admin.prepare(),code('existing_config_without_setup'));assert.equal(fresh.state.creates,0);
  const f=fixture();f.admin.prepare();const c=f.config();c.participants[0].generation='f'.repeat(32);f.properties.setProperty(f.context.ToolsSchoolTrial.keys.config,f.T.canonical(c));assert.throws(()=>f.admin.inspect(),code('config_changed'));assert.equal(f.state.creates,4);
});
test('enableはURLと全読戻しを要求し、stopはpreview停止中も所有教員が実行できる',()=>{
  const f=fixture();f.admin.prepare();assert.throws(()=>f.admin.enable(true),code('url_required'));assert.equal(f.config().enabled,false);assert.equal(f.enable().enabled,true);assert.equal(f.config().enabled,true);
  assert.equal(JSON.parse(f.properties.getProperty(f.keys.trigger)).armed,true);assert.equal(JSON.parse(f.properties.getProperty(f.keys.trigger)).triggerUid,null);
  const before=f.stored();f.setPreview({enabled:false});assert.equal(f.admin.enable(false).enabled,false);assert.equal(f.config().enabled,false);assert.deepEqual(f.stored(),before);
  f.select(SECOND);assert.throws(()=>f.admin.enable(false),code('owner_only'));
});
test('スクリプトロックが混雑した管理操作はGSS/共有を変更しない',()=>{
  const f=fixture();f.state.lock.denied=true;assert.throws(()=>f.admin.prepare(),code('busy'));assert.equal(f.state.creates,0);assert.equal(f.properties.writes.length,0);
});
test('UIトリガーの最初のowner UIDをpinし、同じUIDのみ回収して別UIDを拒否する',()=>{
  const f=fixture();f.admin.prepare();f.enable();f.select('',OWNER);assert.equal(f.trigger().copied,0);assert.equal(JSON.parse(f.properties.getProperty(f.keys.trigger)).triggerUid,'1234567890123456789');
  assert.equal(f.trigger().copied,0);assert.throws(()=>f.trigger('9999999999999999999'),code('account_denied'));assert.equal(f.state.lock.held,false);assert.equal(f.state.lock.acquisitions,f.state.lock.releases);
  f.select('',SECOND);assert.throws(()=>f.trigger(),code('account_denied'));assert.equal(JSON.parse(f.properties.getProperty(f.keys.trigger)).triggerUid,'1234567890123456789');
});
test('トリガーのevent/effective owner/active identity/停止/未arm/UID読戻し異常を拒否する',()=>{
  for(const mutate of [f=>f.select('',SECOND),f=>f.select(OUTSIDER,OWNER),f=>f.properties.deleteProperty(f.keys.trigger),
    f=>f.properties.setProperty(f.keys.trigger,f.T.canonical({schema:1,armed:false,triggerUid:null})),f=>f.admin.enable(false)]){
    const f=fixture();f.admin.prepare();f.enable();mutate(f);const before=f.stored();assert.throws(()=>f.trigger());assert.deepEqual(f.stored(),before);}
  const f=fixture();f.admin.prepare();f.enable();assert.throws(()=>f.trigger(null),code('account_denied'));
  const raw=f.properties.getProperty(f.keys.trigger);f.state.afterPropertyWrite=(key)=>{if(key===f.keys.trigger)f.properties.values.set(key,raw);};assert.throws(()=>f.trigger(),code('configuration_required'));assert.equal(f.state.lock.held,false);
});
test('初回UID pinはロック競合で別UIDへ書換えず、回収開始前にpinロックを解放する',()=>{
  const f=fixture();f.admin.prepare();f.enable();let nested=false;
  f.state.afterPropertyWrite=(key)=>{if(!nested&&key===f.keys.trigger){nested=true;assert.throws(()=>f.trigger('9999999999999999999'),code('busy'));}};
  assert.equal(f.trigger().copied,0);assert.equal(JSON.parse(f.properties.getProperty(f.keys.trigger)).triggerUid,'1234567890123456789');assert.equal(f.state.lock.held,false);
});
test('管理wrapperは実GASのSpreadsheet/Protectionメソッドだけを呼び、scopeを増やさない',()=>{
  const f=fixture();const result=f.context.run_prepareSchoolTrial();assert.equal(result.files.length,4);assert.equal(f.state.creates,4);
  const manifest=JSON.parse(readFileSync(new URL('../../pythoneditor-preview-gas/appsscript.proposed.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.oauthScopes,['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/userinfo.email']);assert.equal(manifest.webapp.executeAs,'USER_ACCESSING');assert.equal(manifest.webapp.access,'DOMAIN');
  const source=readFileSync(new URL('../98_trial_admin.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:ScriptApp|DriveApp)\s*\./);
});
