import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),script=fileURLToPath(new URL('../../prepare-html-intake-gas.mjs',import.meta.url));
test('新設専用の2名限定候補だけを作り、利用者実行・2スコープ・未接続を保つ',async()=>{
  const out=await mkdtemp('/private/tmp/html-intake-prepare-test-');
  const setup={schema:1,scriptId:'SYNTHETIC_SCRIPT_NOT_REAL',owner:'teacher@school.invalid',accounts:['stu3@school.invalid','stu4@school.invalid']};
  await writeFile(out+'/.clasp.json',JSON.stringify({scriptId:setup.scriptId}));
  await writeFile(out+'/appsscript.json','{"timeZone":"America/New_York"}\n');
  await writeFile(out+'/setup.json',JSON.stringify(setup));
  await exec(process.execPath,[script,out,out+'/setup.json']);
  const manifest=JSON.parse(await readFile(out+'/appsscript.json','utf8'));
  assert.equal(manifest.webapp.executeAs,'USER_ACCESSING');assert.equal(manifest.webapp.access,'DOMAIN');assert.equal(manifest.executionApi.access,'MYSELF');assert.equal(manifest.oauthScopes.length,2);assert.ok(manifest.oauthScopes.every(scope=>!scope.includes('/drive')));
  assert.equal(await readFile(out+'/appsscript.before-html-intake.json','utf8'),'{"timeZone":"America/New_York"}\n');
  assert.match(await readFile(out+'/90_entrypoints.js','utf8'),/enabled:false/);
  await assert.rejects(exec(process.execPath,[script,out,out+'/setup.json']),/Do not replace/);
});
test('教員だけの準備確認はGSSを作成・共有・有効化せず、別本人では止まる',async()=>{
  let account='teacher@school.invalid';const logs=[];
  const context=vm.createContext({Set,Session:{getActiveUser:()=>({getEmail:()=>account}),getEffectiveUser:()=>({getEmail:()=>account})},
    htmlIntakeTrialSetup_:()=>({schema:1,owner:'teacher@school.invalid',accounts:['stu3@school.invalid','stu4@school.invalid']}),
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},console:{log:s=>logs.push(s)}});
  vm.runInContext(await readFile(new URL('../98_setup_probe.js',import.meta.url),'utf8'),context);
  const result=context.run_inspectHtmlIntakeTrial();assert.equal(result.ownerVerified,true);assert.equal(result.allowedAccountCount,2);assert.equal(result.createdStudentData,false);assert.equal(result.sharingChanged,false);assert.equal(result.enabled,false);
  assert.doesNotMatch(logs.join(''),/@|source|secret|spreadsheetId/);
  account='stu3@school.invalid';assert.throws(()=>context.run_inspectHtmlIntakeTrial(),/trial_owner_required/);
});
test('dist準備は最新控えを保持し、3追加と説明2件だけで公開版とmanifestを変えない',async()=>{
  const baseline=await mkdtemp('/private/tmp/html-intake-dist-fixture-'),out=await mkdtemp('/private/tmp/html-intake-dist-output-');
  const setup={schema:1,sourceScriptId:'SYNTHETIC_DIST_NOT_REAL',intakeScriptId:'SYNTHETIC_INTAKE_NOT_REAL',owner:'teacher@school.invalid',
    accounts:['stu3@school.invalid','stu4@school.invalid'],individualFolderIds:['SYNTHETIC_STUDENT_FOLDER_3','SYNTHETIC_STUDENT_FOLDER_4'],
    ledgerId:'SYNTHETIC_LEDGER_NOT_REAL',ledgerSheetId:123,sourceFiles:['appsscript.json','00_code.js','_OVERVIEW.html','_CHANGELOG.html']};
  const manifest=JSON.stringify({webapp:{executeAs:'USER_DEPLOYING',access:'DOMAIN'},dependencies:{enabledAdvancedServices:[{userSymbol:'Drive',serviceId:'drive',version:'v2'}]}});
  await writeFile(baseline+'/.clasp.json',JSON.stringify({scriptId:setup.sourceScriptId}));
  await writeFile(baseline+'/appsscript.json',manifest);await writeFile(baseline+'/00_code.js','function doGet(){return "unchanged";}\n');
  await writeFile(baseline+'/_OVERVIEW.html','original overview');await writeFile(baseline+'/_CHANGELOG.html','original history');await writeFile(baseline+'/setup.json',JSON.stringify(setup));
  const builder=fileURLToPath(new URL('../../prepare-html-intake-provision.mjs',import.meta.url));
  await exec(process.execPath,[builder,baseline,out,baseline+'/setup.json']);
  assert.equal(await readFile(out+'/appsscript.json','utf8'),manifest);assert.equal(await readFile(out+'/00_code.js','utf8'),'function doGet(){return "unchanged";}\n');
  assert.equal(await readFile(baseline+'/_CHANGELOG.html','utf8'),'original history');
  assert.equal(JSON.parse(await readFile(out+'/provision-build.private.json','utf8')).publicDeploymentChanged,false);
  const order=JSON.parse(await readFile(out+'/.clasp.json','utf8')).filePushOrder;
  assert.deepEqual(order.slice(0,3),setup.sourceFiles.slice(1));assert.equal(order.length,6);
  const privateSource=await readFile(out+'/94_html_intake_provision_scope_private.js','utf8');assert.match(privateSource,/stu3@school.invalid/);
  assert.doesNotMatch(await readFile(out+'/95_html_intake_trial_provision.js','utf8'),/stu3@school.invalid/);
  await assert.rejects(exec(process.execPath,[builder,baseline,out,baseline+'/setup.json']),/Output must be empty/);
});
test('保存先封入は元GASと2スコープを保持し、2名の順序・hash違いを拒否する',async()=>{
  const baseline=await mkdtemp('/private/tmp/html-intake-stores-baseline-'),out=await mkdtemp('/private/tmp/html-intake-stores-output-');
  const setup={schema:1,scriptId:'SYNTHETIC_INTAKE_NOT_REAL',owner:'teacher@school.invalid',accounts:['stu3@school.invalid','stu4@school.invalid']};
  const manifest=JSON.stringify({webapp:{executeAs:'USER_ACCESSING',access:'DOMAIN'},oauthScopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/userinfo.email']});
  await writeFile(baseline+'/.clasp.json',JSON.stringify({scriptId:setup.scriptId}));await writeFile(baseline+'/appsscript.json',manifest);
  await writeFile(baseline+'/99_trial_setup_private.js','function htmlIntakeTrialSetup_(){return '+JSON.stringify(setup)+';}');
  await writeFile(baseline+'/90_entrypoints.js','function htmlIntakeCandidateConfig_(){return {enabled:false};}\n');await writeFile(baseline+'/_CHANGELOG.html','old history');
  const scopeId='c'.repeat(32),registry={kind:'html-intake-trial-registry-export-v1',schema:1,scopeId,intakeScriptId:setup.scriptId,entries:setup.accounts.map((a,i)=>({
    accountIndex:i,owner:setup.owner,intakeScriptId:setup.scriptId,scopeId,actorKey:createHash('sha256').update(a).digest('hex'),
    generation:String(i+1).repeat(32),spreadsheetId:'SYNTHETIC_PERSONAL_STORE_'+i,individualFolderId:'SYNTHETIC_PERSONAL_FOLDER_'+i}))};
  await writeFile(baseline+'/registry.json',JSON.stringify(registry));
  const builder=fileURLToPath(new URL('../../prepare-html-intake-stores.mjs',import.meta.url));
  await exec(process.execPath,[builder,baseline,out,baseline+'/registry.json']);assert.equal(await readFile(out+'/appsscript.json','utf8'),manifest);
  assert.equal(await readFile(out+'/90_entrypoints.js','utf8'),'function htmlIntakeCandidateConfig_(){return {enabled:false};}\n');
  assert.equal(await readFile(baseline+'/_CHANGELOG.html','utf8'),'old history');
  await assert.rejects(exec(process.execPath,[builder,baseline,out,baseline+'/registry.json']),/Output must be empty/);
  registry.entries.reverse();await writeFile(baseline+'/registry.json',JSON.stringify(registry));const second=await mkdtemp('/private/tmp/html-intake-stores-invalid-');
  await assert.rejects(exec(process.execPath,[builder,baseline,second,baseline+'/registry.json']),/owner-exported/);
});
