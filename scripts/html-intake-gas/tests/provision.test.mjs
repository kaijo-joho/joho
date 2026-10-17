import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const clone=v=>JSON.parse(JSON.stringify(v));
const sha=s=>createHash('sha256').update(s).digest('hex');
class Range {
  constructor(sheet,row,col,rows,cols){Object.assign(this,{sheet,row,col,rows,cols});}
  getValues(){return Array.from({length:this.rows},(_,i)=>Array.from({length:this.cols},(_,j)=>this.sheet.values[this.row+i-1]?.[this.col+j-1]??''));}
  getFormulas(){return Array.from({length:this.rows},(_,i)=>Array.from({length:this.cols},(_,j)=>this.sheet.formulas[this.row+i-1]?.[this.col+j-1]??''));}
  setValues(values){this.sheet.writes++;values.forEach((r,i)=>{this.sheet.values[this.row+i-1]??=[];r.forEach((v,j)=>this.sheet.values[this.row+i-1][this.col+j-1]=v);});return this;}
  getRow(){return this.row;}getColumn(){return this.col;}getNumRows(){return this.rows;}getNumColumns(){return this.cols;}
  protect(){const p=new Protection(this);this.sheet.protections.push(p);return p;}
  setWrap(){return this;}setVerticalAlignment(){return this;}setBackground(){return this;}setFontWeight(){return this;}
}
class Protection {
  constructor(range){Object.assign(this,{range,description:'',warning:true,domain:true,editors:[],audiences:[]});}
  getRange(){return this.range;}setRange(r){this.range=r;return this;}getDescription(){return this.description;}setDescription(s){this.description=s;return this;}
  setWarningOnly(v){this.warning=v;return this;}isWarningOnly(){return this.warning;}
  canDomainEdit(){return this.domain;}setDomainEdit(v){this.domain=v;return this;}
  addEditor(a){if(!this.editors.includes(a))this.editors.push(a);return this;}removeEditors(v){this.editors=this.editors.filter(a=>!v.includes(a));return this;}
  getEditors(){return this.editors.map(email=>({getEmail:()=>email}));}getTargetAudiences(){return this.audiences;}
}
class Sheet {
  constructor(book,name){Object.assign(this,{book,name,values:[],formulas:[],protections:[],rows:20,cols:4,hidden:false,writes:0});}
  getName(){return this.name;}setName(v){this.name=v;return this;}
  getLastRow(){return this.values.length;}getMaxRows(){return this.rows;}getMaxColumns(){return this.cols;}
  insertRowsAfter(a,n){assert.equal(a,this.rows);this.rows+=n;}insertColumnsAfter(a,n){assert.equal(a,this.cols);this.cols+=n;}
  getRange(...args){return new Range(this,...args);}getProtections(){return this.protections;}
  hideSheet(){this.hidden=true;}showSheet(){this.hidden=false;}isSheetHidden(){return this.hidden;}
  setFrozenRows(){}setColumnWidth(){}setRowHeights(){}
}
class Book {
  constructor(id,owner,title){Object.assign(this,{id,owner,title,permissions:[{type:'user',role:'owner',emailAddress:owner}],writersCanShare:true,root:true,trashed:false});this.sheets=[new Sheet(this,'new')];}
  getId(){return this.id;}getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id+'/edit';}getOwner(){return {getEmail:()=>this.owner};}
  getSheets(){return this.sheets;}getSheetByName(n){return this.sheets.find(s=>s.name===n)||null;}insertSheet(n){const sheet=new Sheet(this,n);this.sheets.push(sheet);return sheet;}
  getEditors(){return this.permissions.filter(p=>p.role==='writer').map(p=>({getEmail:()=>p.emailAddress}));}
  getViewers(){return this.permissions.filter(p=>p.role==='reader').map(p=>({getEmail:()=>p.emailAddress}));}
}
function fixture(){
  const ctx=vm.createContext({Set,console:{log(){}},Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)})}});
  for(const name of ['00_contract.js','50_store_layout.js','provision/95_html_intake_trial_provision.js','97_trial_store_admin.js'])vm.runInContext(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),ctx,{filename:name});
  const config={schema:1,sourceScriptId:'SYNTHETIC_DIST_PROJECT',intakeScriptId:'SYNTHETIC_INTAKE_PROJECT',owner:'teacher@school.invalid',
    accounts:['stu3@school.invalid','stu4@school.invalid'],individualFolderIds:['SYNTHETIC_FOLDER_STUDENT_3','SYNTHETIC_FOLDER_STUDENT_4']};
  let account=config.owner,seq=0,locked=false;
  const properties={map:new Map(),afterSet:null,getProperty(k){return this.map.get(k)??null;},setProperty(k,v){this.map.set(k,v);this.afterSet?.(k,v);}};
  const books=new Map(),stats={creates:0,shares:0,locks:0};
  const env={setup:()=>clone(config),identity:()=>({active:account,effective:account}),scriptId:()=>config.sourceScriptId,properties,
    bytes:s=>Buffer.byteLength(s),sha,uuid:()=>String(++seq).padStart(32,'0'),ledger:c=>c.accounts.map((a,i)=>({account:a,folderId:c.individualFolderIds[i]})),
    lock:()=>({tryLock(){if(locked)return false;locked=true;stats.locks++;return true;},releaseLock(){locked=false;}}),
    make(title){stats.creates++;const id='SYNTHETIC_SPREADSHEET_'+stats.creates,book=new Book(id,config.owner,title);books.set(id,book);return book;},open:id=>books.get(id),
    file(id){const b=books.get(id);return {id,title:b.title,mimeType:'application/vnd.google-apps.spreadsheet',labels:{trashed:b.trashed},owners:[{emailAddress:b.owner}],parents:[{id:'root',isRoot:b.root}],writersCanShare:b.writersCanShare};},
    permissions:id=>clone(books.get(id).permissions),disableResharing:id=>books.get(id).writersCanShare=false,
    share(id,email){stats.shares++;books.get(id).permissions.push({type:'user',role:'writer',emailAddress:email});},flush(){},rangeProtectionType:'RANGE'};
  const provision=ctx.HtmlIntakeTrialProvision.create(env),state=()=>JSON.parse(properties.getProperty(ctx.HtmlIntakeTrialProvision.key));
  function stores(){return ctx.HtmlIntakeTrialStores.create({...env,setup:()=>({schema:1,scriptId:config.intakeScriptId,owner:config.owner,accounts:config.accounts.slice()}),scriptId:()=>config.intakeScriptId});}
  return {ctx,config,env,properties,books,stats,provision,state,stores,actor:a=>account=a};
}
test('2名だけを1冊ずつ準備し、所有者・本人編集・固定保護・世代・容量を確認する',()=>{
  const f=fixture();assert.equal(f.provision.inspect().preparedCount,0);assert.equal(f.stats.creates,0);
  assert.equal(f.provision.prepareNext().preparedCount,1);assert.equal(f.stats.creates,1);
  assert.equal(f.provision.prepareNext().preparedCount,2);const registry=f.provision.registry();
  assert.equal(f.stats.creates,2);assert.equal(f.stats.shares,2);assert.equal(registry.entries.length,2);
  for(const [i,e] of registry.entries.entries()){
    const b=f.books.get(e.spreadsheetId);assert.equal(b.writersCanShare,false);assert.equal(b.permissions.length,2);
    assert.equal(b.permissions[1].emailAddress,f.config.accounts[i]);assert.equal(b.getSheetByName('HTML提出').rows,6001);
    assert.ok(b.getSheetByName('HTML提出').isSheetHidden());assert.ok(b.getSheetByName('HTML設定').isSheetHidden());
    assert.equal(b.getSheetByName('HTML設定').getRange(5,2,1,1).getValues()[0][0],'active');
  }
  assert.doesNotMatch(JSON.stringify(registry),/@school.invalid.*stu[34]|"account":|secret|source/);
  const ids=[...f.books.keys()],writes=[...f.books.values()].map(b=>b.sheets.reduce((n,s)=>n+s.writes,0));
  assert.equal(f.provision.prepareNext().preparedCount,2);assert.deepEqual([...f.books.keys()],ids);assert.equal(f.stats.shares,2);
  assert.deepEqual([...f.books.values()].map(b=>b.sheets.reduce((n,s)=>n+s.writes,0)),writes);
  assert.equal(f.stores().configure(registry).backupSheetsVerified,true);assert.equal(f.stores().inspect().enabled,false);
});
test('本人以外・台帳違い・ロック競合では作成しない',()=>{
  const f=fixture();f.actor(f.config.accounts[0]);assert.throws(()=>f.provision.prepareNext(),/owner/);assert.equal(f.stats.creates,0);
  f.actor(f.config.owner);f.env.ledger=()=>[];assert.throws(()=>f.provision.prepareNext(),/ledger_changed/);assert.equal(f.stats.creates,0);
  f.env.ledger=c=>c.accounts.map((account,i)=>({account,folderId:c.individualFolderIds[i]}));f.env.lock=()=>({tryLock:()=>false});
  assert.throws(()=>f.provision.prepareNext(),/trial_busy/);assert.equal(f.stats.creates,0);
});
test('作成応答が失われた場合は不明として停止し、自動で重複作成しない',()=>{
  const f=fixture(),make=f.env.make;f.env.make=title=>{make(title);throw Error('lost create response');};
  assert.throws(()=>f.provision.prepareNext(),/lost create/);assert.equal(f.state().entries[0].state,'creating');
  f.env.make=make;assert.throws(()=>f.provision.prepareNext(),/create_uncertain/);assert.equal(f.stats.creates,1);assert.equal(f.stats.shares,0);
});
test('作成済みID保存後の障害は同じファイルで再開し、追加共有を重ねない',()=>{
  const f=fixture(),share=f.env.share;let once=true;f.env.share=(id,a)=>{share(id,a);if(once){once=false;throw Error('lost sharing response');}};
  assert.throws(()=>f.provision.prepareNext(),/lost sharing/);assert.equal(f.state().entries[0].state,'created');
  assert.equal(f.provision.prepareNext().preparedCount,1);assert.equal(f.stats.creates,1);assert.equal(f.stats.shares,1);
});
test('想定外の共有を削除せず停止する',()=>{
  const f=fixture(),make=f.env.make;f.env.make=title=>{const b=make(title);b.permissions.push({type:'group',role:'reader',emailAddress:'group@school.invalid'});return b;};
  assert.throws(()=>f.provision.prepareNext(),/unexpected_sharing/);assert.equal(f.stats.shares,0);assert.equal([...f.books.values()][0].permissions.length,2);
});
test('準備済みの構成が壊れたら修復や再作成で隠さない',()=>{
  const f=fixture();f.provision.prepareNext();const b=[...f.books.values()][0];b.getSheetByName('HTML提出').protections[0].warning=true;
  assert.throws(()=>f.provision.prepareNext(),/protection_mismatch/);assert.equal(f.stats.creates,1);
});
test('保存GASへの登録は本人順・世代・所有者・保護を照合し、別registryへ上書きしない',()=>{
  const f=fixture();f.provision.prepareNext();f.provision.prepareNext();const r=clone(f.provision.registry());
  const wrong=clone(r);wrong.entries.reverse();assert.throws(()=>f.stores().configure(wrong),/registry_invalid/);
  assert.equal(f.stores().configure(r).backupSheetsConfigured,true);const raw=f.properties.getProperty('HTML_INTAKE_TRIAL_STORES_V1');
  assert.equal(f.stores().configure(r).backupSheetsVerified,true);assert.equal(f.properties.getProperty('HTML_INTAKE_TRIAL_STORES_V1'),raw);
  const changed=clone(r);changed.scopeId='f'.repeat(32);changed.entries.forEach(e=>e.scopeId=changed.scopeId);
  assert.throws(()=>f.stores().configure(changed),/metadata_mismatch/);assert.equal(f.properties.getProperty('HTML_INTAKE_TRIAL_STORES_V1'),raw);
});
test('保存GASの登録は共有や作成を呼ばず、学生・別実行者では止まる',()=>{
  const f=fixture();f.provision.prepareNext();f.provision.prepareNext();const r=f.provision.registry(),prior=clone(f.stats);
  f.stores().configure(r);assert.equal(f.stats.creates,prior.creates);assert.equal(f.stats.shares,prior.shares);
  f.actor(f.config.accounts[0]);assert.throws(()=>f.stores().configure(r),/owner/);
});
test('準備済みの権限・再共有・世代・見出し・数式の改変は検出する',()=>{
  for(const alter of [b=>b.owner='other@school.invalid',b=>b.title='別の原本',b=>b.writersCanShare=true,b=>b.permissions.push({type:'domain',role:'reader'}),
    b=>b.root=false,b=>b.getSheetByName('HTML設定').values[3][1]='f'.repeat(32),
    b=>b.getSheetByName('HTML提出').values[0][0]='changed',b=>b.getSheetByName('HTML提出').formulas[0]=['=1']]){
    const f=fixture();f.provision.prepareNext();f.provision.prepareNext();alter([...f.books.values()][0]);assert.throws(()=>f.provision.inspect());assert.equal(f.stats.creates,2);
  }
});
