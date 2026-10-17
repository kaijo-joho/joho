// 最新dist読取控えから、教員がIDEで実行する2名限定の準備HEADを組み立てる。
// このスクリプト自体はGoogleへ接続せず、GSS/共有/台帳/公開版を変更しない。
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const [baselinePath,outputPath,setupPath]=process.argv.slice(2);
if(!baselinePath || !outputPath || !setupPath)throw Error('Usage: node scripts/prepare-html-intake-provision.mjs PRIVATE_BASELINE PRIVATE_OUTPUT PRIVATE_SETUP.json');
const baseline=resolve(baselinePath),out=resolve(outputPath),setup=JSON.parse(await readFile(setupPath,'utf8'));
if(!baseline.startsWith('/private/tmp/') || !out.startsWith('/private/tmp/') || out===baseline)throw Error('Use separate private temporary directories');
const clasp=JSON.parse(await readFile(join(baseline,'.clasp.json'),'utf8'));
if(setup.schema!==1 || clasp.scriptId!==setup.sourceScriptId || setup.intakeScriptId===setup.sourceScriptId ||
  !/^[A-Za-z0-9_-]{20,160}$/.test(setup.intakeScriptId) || !/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(setup.owner) ||
  !Array.isArray(setup.accounts) || setup.accounts.length!==2 || new Set(setup.accounts).size!==2 ||
  setup.accounts.some(a=>typeof a!=='string'||!/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(a)||a===setup.owner) ||
  !Array.isArray(setup.individualFolderIds) || setup.individualFolderIds.length!==2 || new Set(setup.individualFolderIds).size!==2 ||
  setup.individualFolderIds.some(id=>!/^[A-Za-z0-9_-]{20,160}$/.test(id)) ||
  !/^[A-Za-z0-9_-]{20,160}$/.test(setup.ledgerId) || !Number.isInteger(setup.ledgerSheetId))throw Error('Check the explicitly approved private setup');
const names=(await readdir(baseline)).filter(name=>/\.(?:js|gs|html)$/.test(name)||name==='appsscript.json');
const order=setup.sourceFiles;
if(!Array.isArray(order) || new Set(order).size!==order.length || order.some(n=>!names.includes(n)) || order.length!==names.length)throw Error('Require the exact freshly read remote source order');
const manifest=JSON.parse(await readFile(join(baseline,'appsscript.json'),'utf8'));
if(manifest.webapp?.executeAs!=='USER_DEPLOYING' || manifest.webapp?.access!=='DOMAIN' ||
  !manifest.dependencies?.enabledAdvancedServices?.some(s=>s.userSymbol==='Drive'&&s.serviceId==='drive'&&s.version==='v2'))throw Error('Check the teacher-side existing dist manifest');
const extras=['93_html_intake_store_layout.js','94_html_intake_provision_scope_private.js','95_html_intake_trial_provision.js'];
if(extras.some(n=>names.includes(n)))throw Error('Do not replace an existing preparation deployment');
await mkdir(out,{recursive:true,mode:0o700});
if((await readdir(out)).length)throw Error('Output must be empty');
const sha=s=>createHash('sha256').update(s).digest('hex'),before={};
for(const name of order){const value=await readFile(join(baseline,name));before[name]=sha(value);await copyFile(join(baseline,name),join(out,name));}
const privateSetup={...setup};delete privateSetup.sourceFiles;
const additions={
  [extras[0]]:await readFile(new URL('./html-intake-gas/50_store_layout.js',import.meta.url),'utf8'),
  [extras[1]]:'// 私有の承認済み2アカウントと準備先。公開Gitへ追加しない。\nfunction htmlIntakeProvisionSetup_(){return '+JSON.stringify(privateSetup)+';}\n',
  [extras[2]]:await readFile(new URL('./html-intake-gas/provision/95_html_intake_trial_provision.js',import.meta.url),'utf8')
};
for(const [name,value] of Object.entries(additions)){new vm.Script(value,{filename:name});await writeFile(join(out,name),value,{flag:'wx',mode:0o600});}
const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
const change=stamp+' | Codex | 所有教員だけのHTML2名限定バックアップ準備をHEADへ追加。通常公開版・受付・台帳は変更しない。';
await writeFile(join(out,'_CHANGELOG.html'),await readFile(join(out,'_CHANGELOG.html'),'utf8')+'\n'+change+'\n');
await writeFile(join(out,'_OVERVIEW.html'),await readFile(join(out,'_OVERVIEW.html'),'utf8')+'\n\n## HTMLバックアップの限定準備（2026-10-17）\n\n93〜95は所有教員がIDEから実行する2名限定の準備処理。既存の生徒台帳は読み取りのみで、保存先は試験専用registryへ記録する。GSSは教員のマイドライブへ作成し、本人だけ編集共有、再共有は禁止。個別フォルダへの移動やPython試用の変更はしない。1回1冊まで、作成成否不明は重複作成せず停止する。Webアプリの公開版へは反映しない。\n');
clasp.filePushOrder=order.filter(n=>n!=='appsscript.json').concat(extras);
await writeFile(join(out,'.clasp.json'),JSON.stringify(clasp,null,2)+'\n');
await writeFile(join(out,'.claspignore'),'**/**\n!*.js\n!*.html\n!appsscript.json\n',{flag:'wx',mode:0o600});
await writeFile(join(out,'provision-build.private.json'),JSON.stringify({kind:'html-intake-provision-build-v1',baseline,sourceOrder:order,before,added:extras,
  changed:['_CHANGELOG.html','_OVERVIEW.html'],publicDeploymentChanged:false,manifestChanged:false,change},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({prepared:true,allowedAccountCount:2,addedFiles:extras,publicDeploymentChanged:false,manifestChanged:false,studentLedgerChanged:false}));
