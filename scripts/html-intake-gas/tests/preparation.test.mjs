import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
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
