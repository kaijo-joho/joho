// GAS管理操作の実コードを使う。Sheets/Properties/Session/Lockだけを合成する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadCommon } from '../../tools-store-gas/tests/common-fixture.mjs';
export const OWNER='admin-fixture-owner@gfe.kaijo.ed.jp', SECOND='admin-fixture-teacher@gfe.kaijo.ed.jp', DEMO='admin-fixture-demo@gfe.kaijo.ed.jp', OUTSIDER='admin-fixture-outsider@gfe.kaijo.ed.jp';
export const plain=value=>JSON.parse(JSON.stringify(value));
const user=account=>({getEmail:()=>account});
class Range {
  constructor(sheet,row,column,rows=1,columns=1){Object.assign(this,{sheet,row,column,rows,columns});assert.ok(row>0&&column>0&&rows>0&&columns>0);assert.ok(row+rows-1<=sheet.rows&&column+columns-1<=sheet.columns);}
  getRow(){return this.row;}getColumn(){return this.column;}getLastRow(){return this.row+this.rows-1;}getLastColumn(){return this.column+this.columns-1;}
  getValues(){return Array.from({length:this.rows},(_,y)=>Array.from({length:this.columns},(_,x)=>this.sheet.cells.get(`${this.row+y},${this.column+x}`)??''));}
  getFormulas(){return Array.from({length:this.rows},(_,y)=>Array.from({length:this.columns},(_,x)=>this.sheet.formulas.get(`${this.row+y},${this.column+x}`)??''));}
  setValues(values){assert.equal(values.length,this.rows);for(let y=0;y<this.rows;y++){assert.equal(values[y].length,this.columns);for(let x=0;x<this.columns;x++){this.sheet.cells.set(`${this.row+y},${this.column+x}`,values[y][x]);this.sheet.formulas.delete(`${this.row+y},${this.column+x}`);}}
    this.sheet.state.mutations.push({type:'cells',book:this.sheet.book.id,sheet:this.sheet.name,row:this.row,column:this.column,rows:this.rows,columns:this.columns});return this;}
  setNumberFormat(){return this;}
  protect(){const protection=new Protection(this);this.sheet.protections.push(protection);this.sheet.state.mutations.push({type:'protection',book:this.sheet.book.id,sheet:this.sheet.name});return protection;}
}
class Protection {
  constructor(range){this.range=range;this.description='';this.editors=[];this.domain=true;this.warning=true;this.audiences=[];}
  getDescription(){return this.description;}setDescription(value){this.description=value;return this;}
  getRange(){return this.range;}setRange(value){this.range=value;return this;}
  setWarningOnly(value){this.warning=value;return this;}isWarningOnly(){return this.warning;}
  addEditor(account){this.editors=[...new Set([...this.editors,account])];return this;}getEditors(){return this.editors.map(user);}
  removeEditors(accounts){this.editors=this.editors.filter(account=>!accounts.includes(account));return this;}
  canDomainEdit(){return this.domain;}setDomainEdit(value){this.domain=value;return this;}
  getTargetAudiences(){return this.audiences.slice();}
  canEdit(){const active=this.range.sheet.state.identity.active;return active===this.range.sheet.book.owner||this.editors.includes(active)||this.domain;}
}
class Sheet {
  constructor(book,name){Object.assign(this,{book,state:book.state,name,rows:1000,columns:26,hidden:false,frozen:0,cells:new Map(),formulas:new Map(),protections:[]});}
  getName(){return this.name;}setName(value){assert.ok(!this.book.getSheetByName(value));this.name=value;return this;}
  getMaxRows(){return this.rows;}getMaxColumns(){return this.columns;}
  getLastRow(){let last=0;for(const[key,value]of this.cells)if(value!==''&&value!==null&&value!==undefined)last=Math.max(last,Number(key.split(',')[0]));for(const key of this.formulas.keys())last=Math.max(last,Number(key.split(',')[0]));return last;}
  getLastColumn(){let last=0;for(const[key,value]of this.cells)if(value!==''&&value!==null&&value!==undefined)last=Math.max(last,Number(key.split(',')[1]));for(const key of this.formulas.keys())last=Math.max(last,Number(key.split(',')[1]));return last;}
  getRange(...args){return new Range(this,...args);}
  insertRowsAfter(after,count){assert.equal(after,this.rows);this.rows+=count;this.state.mutations.push({type:'rows',book:this.book.id,sheet:this.name,count});return this;}
  insertColumnsAfter(after,count){assert.equal(after,this.columns);this.columns+=count;this.state.mutations.push({type:'columns',book:this.book.id,sheet:this.name,count});return this;}
  getProtections(type){assert.equal(type,'RANGE');return this.protections;}
  setFrozenRows(value){this.frozen=value;}
  hideSheet(){assert.ok(this.book.sheets.some(sheet=>sheet!==this&&!sheet.hidden),'cannot hide the only visible sheet');this.hidden=true;return this;}
  showSheet(){this.hidden=false;return this;}isSheetHidden(){return this.hidden;}
}
class Spreadsheet {
  constructor(id,name,state){Object.assign(this,{id,name,state,owner:OWNER,editors:[],viewers:[],sheets:[]});this.sheets.push(new Sheet(this,'Sheet1'));}
  getId(){return this.id;}getUrl(){return `https://docs.google.com/spreadsheets/d/${this.id}/edit`;}
  getOwner(){return this.owner?user(this.owner):null;}getEditors(){return [...new Set([this.owner,...this.editors])].map(user);}getViewers(){return [...new Set([this.owner,...this.editors,...this.viewers])].map(user);}
  addEditor(account){this.state.onAddEditor?.(this,account);if(!this.editors.includes(account))this.editors.push(account);this.state.sharing.push({id:this.id,account});return this;}
  getSheets(){return this.sheets.slice();}getSheetByName(name){return this.sheets.find(sheet=>sheet.name===name)||null;}
  insertSheet(name){assert.ok(!this.getSheetByName(name));const sheet=new Sheet(this,name);this.sheets.push(sheet);this.state.mutations.push({type:'sheet',book:this.id,name});return sheet;}
}
export function trialAdminFixture(){
  const state={identity:{active:OWNER,effective:OWNER},creates:0,opens:[],mutations:[],sharing:[],flushes:0,next:100,logs:[],lock:{held:false,acquisitions:0,releases:0}};
  const loaded=loadCommon({console:{log(value){state.logs.push(value);}}}),{context}=loaded,T=loaded.contract;
  for(const name of ['../50_trial_repository.js','../70_trial_api.js','../98_trial_admin.js'])vm.runInContext(readFileSync(new URL(name,import.meta.url),'utf8'),context);
  const properties={values:new Map(),writes:[],getProperty(key){state.onReadProperty?.(key);return this.values.get(key)??null;},getProperties(){return Object.fromEntries(this.values);},
    setProperty(key,value){state.beforePropertyWrite?.(key,value);this.values.set(key,value);this.writes.push([key,value]);state.afterPropertyWrite?.(key,value);return this;},deleteProperty(key){this.values.delete(key);return this;}};
  const preview={schema:1,enabled:true,editorOrigin:'https://example.invalid',teacherAccounts:[OWNER,SECOND],demoAccounts:[DEMO],sourceFileListId:'synthetic_source_filelist_identifier_0001',gradingSheet:'採点設定py'};
  properties.setProperty('TOOLS_TEACHER_PREVIEW_CONFIG',T.canonical(preview));properties.writes=[];
  const books=new Map(),lock=()=>({tryLock(){if(state.lock.held||state.lock.denied)return false;state.lock.held=true;state.lock.acquisitions++;return true;},releaseLock(){assert.equal(state.lock.held,true);state.lock.held=false;state.lock.releases++;}});
  const open=id=>{state.opens.push(id);assert.ok(books.has(id),'unknown synthetic GSS');return books.get(id);};
  const make=title=>{state.beforeMake?.(title);state.creates++;const id='synthetic_admin_trial_gss_'+String(state.creates).padStart(8,'0'),book=new Spreadsheet(id,title,state);books.set(id,book);state.afterMake?.(book);return book;};
  const identity=()=>state.identity,uuid=()=>String(state.next++).padStart(32,'0'),flush=()=>{state.flushes++;state.onFlush?.();};
  const runtime={properties,identity,open,now:()=>Date.UTC(2026,9,17),scriptLock:lock,userLock:lock,storeURL:()=>properties.getProperty(context.ToolsSchoolTrialAdmin.keys.url)};
  const env={properties,identity,uuid,open,make,flush,rangeProtectionType:'RANGE',lock,runtime:()=>runtime};
  context.PropertiesService={getScriptProperties:()=>properties};context.Session={getActiveUser:()=>user(state.identity.active),getEffectiveUser:()=>user(state.identity.effective)};
  context.SpreadsheetApp={ProtectionType:{RANGE:'RANGE'},create:make,openById:open,flush};context.LockService={getScriptLock:lock};context.Utilities.getUuid=uuid;
  context.schoolTrialEnvironment_=()=>({...runtime,identity});
  const admin=context.ToolsSchoolTrialAdmin.create(env),keys=context.ToolsSchoolTrialAdmin.keys,C=T.constants,R=context.ToolsSchoolTrialRepository.constants;
  function setup(){const raw=properties.getProperty(keys.setup);return raw?JSON.parse(raw):null;}
  function config(){const raw=properties.getProperty(context.ToolsSchoolTrial.keys.config);return raw?JSON.parse(raw):null;}
  function setPreview(change){Object.assign(preview,change);properties.setProperty('TOOLS_TEACHER_PREVIEW_CONFIG',T.canonical(preview));}
  function setSetup(change){const value=setup();change(value);properties.setProperty(keys.setup,T.canonical(value));}
  function select(active=OWNER,effective=active){state.identity.active=active;state.identity.effective=effective;}
  function enable(){properties.setProperty(keys.url,'https://script.google.com/macros/s/synthetic_admin_trial/exec');return admin.enable(true);}
  function trigger(uid='1234567890123456789'){return context.schoolTrialCollectionTrigger(uid===null?undefined:{triggerUid:uid});}
  function stored(){return Object.fromEntries([...books.keys()].map(id=>[id,{owner:books.get(id).owner,editors:[...books.get(id).editors],sheets:books.get(id).sheets.map(s=>({name:s.name,hidden:s.hidden,rows:s.rows,columns:s.columns,cells:[...s.cells],formulas:[...s.formulas],protections:s.protections.map(p=>({warning:p.warning,domain:p.domain,editors:[...p.editors],audiences:[...p.audiences],description:p.description,range:[p.range.row,p.range.column,p.range.rows,p.range.columns]}))}))}]));}
  return {context,T,state,properties,preview,books,env,runtime,admin,keys,C,R,setup,config,setPreview,setSetup,select,enable,trigger,stored};
}
