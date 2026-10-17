// 既存distの教員実行HEADへだけ追加する準備処理。通常doGet・公開版・生徒台帳は変更しない。
// 私有の htmlIntakeProvisionSetup_() がない配置では動作しない。
var HtmlIntakeTrialProvision = (function () {
  'use strict';
  var KEY='HTML_INTAKE_TRIAL_PROVISION_V1';
  function create(env) {
    var L=HtmlIntakeStoreLayout,C=L.constants,yes=L.yes,canonical=L.canonical;
    function owner() {
      var c=env.setup(),who=env.identity();
      yes(c && c.schema===1 && c.sourceScriptId===env.scriptId() && c.intakeScriptId!==c.sourceScriptId &&
        typeof c.owner==='string' && c.owner===who.active && who.effective===who.active &&
        Array.isArray(c.accounts) && c.accounts.length===2 && new Set(c.accounts).size===2 &&
        c.accounts.every(function(a){return /^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(a) && a!==c.owner;}) &&
        Array.isArray(c.individualFolderIds) && c.individualFolderIds.length===2 && new Set(c.individualFolderIds).size===2,'trial_owner_required');
      var rows=env.ledger(c);
      yes(rows.length===2 && rows.every(function(r,i){return r.account===c.accounts[i] && r.folderId===c.individualFolderIds[i];}),'trial_ledger_changed');
      return c;
    }
    function same(c) { yes(canonical(owner())===canonical(c),'trial_setup_changed'); }
    function save(state,c) {
      same(c);var raw=canonical(state);yes(env.bytes(raw)<=8000,'trial_setup_capacity');
      env.properties.setProperty(KEY,raw);yes(env.properties.getProperty(KEY)===raw,'trial_setup_write_uncertain');
    }
    function load(c) {
      var raw=env.properties.getProperty(KEY);if(!raw)return null;
      var s;try{s=JSON.parse(raw);}catch(_){L.fail('trial_setup_corrupt');}
      yes(s && s.schema===1 && s.setupHash===env.sha(canonical(c)) && /^[a-f0-9]{32}$/.test(s.scopeId) &&
        Array.isArray(s.entries) && s.entries.length===2,'trial_setup_corrupt');
      var ids={},generations={},nonces={};
      s.entries.forEach(function(e,i){
        yes(e && e.account===c.accounts[i] && e.individualFolderId===c.individualFolderIds[i] &&
          /^[a-f0-9]{32}$/.test(e.generation) && !generations[e.generation] && /^[a-f0-9]{32}$/.test(e.nonce) && !nonces[e.nonce] &&
          ['planned','creating','created','prepared'].indexOf(e.state)>=0,'trial_setup_corrupt');
        generations[e.generation]=true;nonces[e.nonce]=true;
        if(e.spreadsheetId){yes(/^[A-Za-z0-9_-]{20,160}$/.test(e.spreadsheetId) && !ids[e.spreadsheetId] && ['created','prepared'].indexOf(e.state)>=0,'trial_setup_corrupt');ids[e.spreadsheetId]=true;}
        else yes(e.state==='planned' || e.state==='creating','trial_setup_corrupt');
      });return s;
    }
    function binding(e,s,c) {
      return {account:e.account,actorKey:env.sha(e.account),spreadsheetId:e.spreadsheetId,generation:e.generation,
        individualFolderId:e.individualFolderId,scopeId:s.scopeId,owner:c.owner,intakeScriptId:c.intakeScriptId};
    }
    function drive(e,c,ready) {
      var m=env.file(e.spreadsheetId),p=env.permissions(e.spreadsheetId),owners=0,writers=0;
      yes(m && m.id===e.spreadsheetId && m.title==='HTML実習 試験バックアップ ['+e.nonce+']' && m.mimeType==='application/vnd.google-apps.spreadsheet' &&
        m.labels && m.labels.trashed===false && !m.teamDriveId && m.owners && m.owners.length===1 && m.owners[0].emailAddress===c.owner &&
        Array.isArray(m.parents) && m.parents.length===1 && m.parents[0].isRoot===true,'trial_file_mismatch');
      yes(Array.isArray(p) && p.every(function(v){
        if(v.deleted || v.type!=='user')return false;
        if(v.role==='owner' && v.emailAddress===c.owner){owners++;return true;}
        if(v.role==='writer' && v.emailAddress===e.account){writers++;return true;}
        return false;
      }) && owners===1 && writers<=1 && (!ready || writers===1),'trial_unexpected_sharing');
      if(ready)yes(m.writersCanShare===false,'trial_resharing_enabled');
      return writers===1;
    }
    function protect(sheet,rows,columns,description,c) {
      var existing=sheet.getProtections(env.rangeProtectionType).filter(function(p){return p.getDescription()===description;});
      yes(existing.length<=1,'trial_protection_duplicate');
      var r=sheet.getRange(1,1,rows,columns),p=existing[0] || r.protect().setDescription(description);
      p.setRange(r).setWarningOnly(false).addEditor(c.owner);
      var extra=p.getEditors().map(function(u){return u.getEmail();}).filter(function(a){return a!==c.owner;});
      if(extra.length)p.removeEditors(extra);
      if(p.canDomainEdit())p.setDomainEdit(false);
      L.protection(sheet,rows,columns,c.owner,env);
    }
    function grid(sheet,rows,columns) {
      if(sheet.getMaxRows()<rows)sheet.insertRowsAfter(sheet.getMaxRows(),rows-sheet.getMaxRows());
      if(sheet.getMaxColumns()<columns)sheet.insertColumnsAfter(sheet.getMaxColumns(),columns-sheet.getMaxColumns());
    }
    function prepareBook(e,s,c) {
      same(c);var shared=drive(e,c,false),b=binding(e,s,c),book=env.open(e.spreadsheetId);
      yes(book.getOwner() && book.getOwner().getEmail()===c.owner,'trial_file_mismatch');
      var guide=book.getSheetByName(C.guide);
      if(!guide){var sheets=book.getSheets();yes(sheets.length===1 && sheets[0].getLastRow()===0,'trial_schema_mismatch');guide=sheets[0].setName(C.guide);}
      var meta=book.getSheetByName(C.meta) || book.insertSheet(C.meta),sheet=book.getSheetByName(C.sheet) || book.insertSheet(C.sheet);
      yes(book.getSheets().length===3,'trial_schema_mismatch');
      grid(guide,20,2);grid(meta,10,2);grid(sheet,C.rows,C.headers.length);
      var fixed=L.metadata(b,'preparing'),prior=meta.getRange(1,1,10,2).getValues();
      yes(prior.every(function(row){return row.every(function(v){return v==='';});}) ||
        canonical(prior)===canonical(fixed) || canonical(prior)===canonical(L.metadata(b,'active')),'trial_metadata_mismatch');
      yes(meta.getRange(1,1,10,2).getFormulas().every(function(row){return row.every(function(v){return v==='';});}),'trial_metadata_mismatch');
      meta.getRange(1,1,10,2).setValues(fixed);protect(meta,10,2,'html-intake:metadata:v1',c);
      var header=sheet.getRange(1,1,1,4);
      if(sheet.getLastRow()===0)header.setValues([C.headers.slice()]);
      yes(sheet.getLastRow()===1 && canonical(header.getValues()[0])===canonical(C.headers) && header.getFormulas()[0].every(function(v){return v==='';}),'trial_schema_mismatch');
      protect(sheet,1,4,'html-intake:header:v1',c);sheet.setFrozenRows(1);sheet.hideSheet();meta.hideSheet();
      if(guide.getLastRow()===0){
        guide.getRange(1,1,8,2).setValues([
          ['HTML実習・バックアップ（限定試験）','正式な作業ファイルはMacの「HTML実習」フォルダに保存してください。'],
          ['保存する内容','提出時のHTML本文・使用した採点基準の版・確認結果・受領記録を保存します。'],
          ['画像・CSS','この保存先には画像や別ファイルのCSSを保存しません。Macのフォルダ全体をバックアップしてください。'],
          ['提出の状態','端末内の★だけでは提出完了ではありません。GASの受領表示を確認してください。'],
          ['非表示シート','アプリが使用します。直接変更せず、復旧が必要な場合は授業担当者へ知らせてください。'],
          ['試験の範囲','指定した2アカウントだけの接続準備です。通常の提出経路は変わりません。'],
          ['共有','所有者は授業担当者の学校アカウント、編集できる生徒は本人だけです。'],
          ['現在の状態','準備済み。新しい受付はまだ有効ではありません。']
        ]);
        guide.getRange(1,1,8,2).setWrap(true).setVerticalAlignment('middle');guide.setColumnWidth(1,240);guide.setColumnWidth(2,600);
        guide.setRowHeights(1,8,56);guide.getRange(1,1,1,2).setBackground('#eeeeee').setFontWeight('bold');guide.setFrozenRows(1);
      }
      guide.showSheet();protect(guide,8,2,'html-intake:guide:v1',c);env.flush();same(c);
      env.disableResharing(e.spreadsheetId);drive(e,c,false);same(c);
      if(!shared)env.share(e.spreadsheetId,e.account);
      drive(e,c,true);same(c);
      meta.getRange(1,1,10,2).setValues(L.metadata(b,'active'));env.flush();L.inspect(book,b,env);
      e.state='prepared';save(s,c);
    }
    function inspect() {
      var c=owner(),s=load(c),count=0;
      if(s)s.entries.forEach(function(e){if(e.state==='prepared'){drive(e,c,true);L.inspect(env.open(e.spreadsheetId),binding(e,s,c),env);count++;}});
      return {kind:'html-intake-backup-preparation-v1',ownerVerified:true,allowedAccountCount:2,preparedCount:count,
        createdCount:s?s.entries.filter(function(e){return !!e.spreadsheetId;}).length:0,enabled:false,
        trialRegistryOnly:true,studentLedgerChanged:false,triggersCreated:false};
    }
    function prepareNext() {
      var c=owner(),lock=env.lock();yes(lock.tryLock(1000),'trial_busy');
      try{
        var s=load(c);
        if(!s){s={schema:1,setupHash:env.sha(canonical(c)),scopeId:env.uuid(),entries:c.accounts.map(function(a,i){
          return {account:a,individualFolderId:c.individualFolderIds[i],generation:env.uuid(),nonce:env.uuid(),state:'planned'};
        })};save(s,c);}
        // 先に準備した保存先の破損を、次の生徒の作成で隠さない。
        s.entries.forEach(function(v){if(v.state==='prepared'){drive(v,c,true);L.inspect(env.open(v.spreadsheetId),binding(v,s,c),env);}});
        var e=s.entries.filter(function(v){return v.state!=='prepared';})[0];
        if(e){
          if(!e.spreadsheetId){
            yes(e.state==='planned','trial_create_uncertain');same(c);e.state='creating';save(s,c);
            var book=env.make('HTML実習 試験バックアップ ['+e.nonce+']');
            e.spreadsheetId=book.getId();e.url=book.getUrl();e.state='created';save(s,c);
          }
          prepareBook(e,s,c);
        }
        return inspect();
      }finally{lock.releaseLock();}
    }
    function registry() {
      var c=owner(),s=load(c);yes(s && s.entries.every(function(e){return e.state==='prepared';}),'trial_preparation_required');
      inspect();return {kind:'html-intake-trial-registry-export-v1',schema:1,intakeScriptId:c.intakeScriptId,scopeId:s.scopeId,
        entries:s.entries.map(function(e,i){var b=binding(e,s,c);delete b.account;return Object.assign({accountIndex:i,url:env.open(e.spreadsheetId).getUrl()},b);})};
    }
    return {inspect:inspect,prepareNext:prepareNext,registry:registry};
  }
  return {create:create,key:KEY};
})();

function htmlIntakeProvisionEnvironment_() {
  var ledgerSheet=null,ledgerPositions=null;
  return {setup:function(){return htmlIntakeProvisionSetup_();},identity:function(){return {active:Session.getActiveUser().getEmail(),effective:Session.getEffectiveUser().getEmail()};},
    scriptId:function(){return ScriptApp.getScriptId();},properties:PropertiesService.getScriptProperties(),lock:function(){return LockService.getScriptLock();},
    sha:function(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');},
    bytes:function(text){return Utilities.newBlob(text).getBytes().length;},uuid:function(){return Utilities.getUuid().replace(/-/g,'');},
    ledger:function(c){
      if(!ledgerSheet){
        ledgerSheet=SpreadsheetApp.openById(c.ledgerId).getSheetById(c.ledgerSheetId);
        HtmlIntakeStoreLayout.yes(ledgerSheet && ledgerSheet.getName()==='個別フォルダ' && ledgerSheet.getLastRow()<=2314,'trial_ledger_changed');
        var width=ledgerSheet.getLastColumn(),header=ledgerSheet.getRange(1,1,1,width).getValues()[0];
        HtmlIntakeStoreLayout.yes(width>=3 && width<=20 && header.indexOf('userId')===0 && header.indexOf('個別フォルダID')===2,'trial_ledger_changed');
        var values=ledgerSheet.getRange(2,1,ledgerSheet.getLastRow()-1,3).getValues();
        ledgerPositions=c.accounts.map(function(a){var matches=[];values.forEach(function(row,i){if(row[0]===a)matches.push(i+2);});HtmlIntakeStoreLayout.yes(matches.length===1,'trial_ledger_changed');return matches[0];});
      }
      return c.accounts.map(function(a,i){
        var range=ledgerSheet.getRange(ledgerPositions[i],1,1,3),row=range.getValues()[0],formula=range.getFormulas()[0];
        HtmlIntakeStoreLayout.yes(row[0]===a && !formula[0] && !formula[2],'trial_ledger_changed');return {account:row[0],folderId:row[2]};
      });
    },
    file:function(id){return Drive.Files.get(id,{fields:'id,title,mimeType,labels(trashed),owners(emailAddress),parents(id,isRoot),writersCanShare,teamDriveId'});},
    permissions:function(id){
      var out=[],token;do{var page=Drive.Permissions.list(id,{maxResults:100,pageToken:token,fields:'items(id,type,role,emailAddress,deleted),nextPageToken'});
        out=out.concat(page.items || []);token=page.nextPageToken;HtmlIntakeStoreLayout.yes(out.length<=100 && !token,'trial_unexpected_sharing');
      }while(token);return out;
    },
    disableResharing:function(id){Drive.Files.update({writersCanShare:false},id);},
    share:function(id,account){Drive.Permissions.insert({type:'user',role:'writer',value:account},id,{sendNotificationEmails:false});},
    open:function(id){return SpreadsheetApp.openById(id);},make:function(title){return SpreadsheetApp.create(title,20,4);},
    flush:function(){SpreadsheetApp.flush();},rangeProtectionType:SpreadsheetApp.ProtectionType.RANGE};
}
function run_inspectHtmlBackupTrial(){var r=HtmlIntakeTrialProvision.create(htmlIntakeProvisionEnvironment_()).inspect();console.log(JSON.stringify(r));return r;}
function run_prepareNextHtmlBackupTrial(){var r=HtmlIntakeTrialProvision.create(htmlIntakeProvisionEnvironment_()).prepareNext();console.log(JSON.stringify(r));return r;}
function run_exportHtmlBackupTrialRegistry(){var r=HtmlIntakeTrialProvision.create(htmlIntakeProvisionEnvironment_()).registry();console.log(JSON.stringify(r));return r;}
