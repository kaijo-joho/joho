// 新設済み・未接続の専用GASへ置く候補だけを作る。ネットワーク/共有操作はしない。
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
const [output,setupFile]=process.argv.slice(2);
if(!output||!setupFile)throw Error('Usage: node scripts/prepare-html-intake-gas.mjs PRIVATE_NEW_PROJECT PRIVATE_SETUP.json');
const out=resolve(output);
if(!out.startsWith('/private/tmp/'))throw Error('Use a separate private temporary directory');
const setup=JSON.parse(await readFile(setupFile,'utf8')),clasp=JSON.parse(await readFile(join(out,'.clasp.json'),'utf8'));
if(setup.schema!==1 || clasp.scriptId!==setup.scriptId || !/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(setup.owner) || !Array.isArray(setup.accounts) || setup.accounts.length!==2 || new Set(setup.accounts).size!==2 || setup.accounts.some(a=>typeof a!=='string'||!/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(a)||a===setup.owner))throw Error('Check the explicitly approved two-account setup');
const existing=await readdir(out);
if(existing.some(name=>/\.(?:js|gs|html)$/.test(name)))throw Error('Do not replace an existing GAS project');
const before=await readFile(join(out,'appsscript.json'),'utf8');
const manifest={timeZone:'Asia/Tokyo',dependencies:{},exceptionLogging:'STACKDRIVER',runtimeVersion:'V8',
  oauthScopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/userinfo.email'],
  executionApi:{access:'MYSELF'},webapp:{executeAs:'USER_ACCESSING',access:'DOMAIN'}};
const names=['00_contract.js','10_service.js','20_repository.js','30_outbox.js','40_teacher_log.js','50_store_layout.js','90_entrypoints.js','97_trial_store_admin.js','98_setup_probe.js','_OVERVIEW.html','_CHANGELOG.html'];
for(const name of names){const source=await readFile(new URL('./html-intake-gas/'+name,import.meta.url),'utf8');if(name.endsWith('.js'))new vm.Script(source,{filename:name});await writeFile(join(out,name),source,{flag:'wx',mode:0o600});}
const privateSource='// 私有の2アカウント限定準備情報。公開Gitへ追加しない。\nfunction htmlIntakeTrialSetup_(){return '+JSON.stringify(setup)+';}\n';
await writeFile(join(out,'99_trial_setup_private.js'),privateSource,{flag:'wx',mode:0o600});
await writeFile(join(out,'appsscript.before-html-intake.json'),before,{flag:'wx',mode:0o600});
await writeFile(join(out,'appsscript.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(join(out,'.claspignore'),'**/**\n!*.js\n!*.html\n!appsscript.json\n',{flag:'wx',mode:0o600});
clasp.filePushOrder=names.filter(name=>name.endsWith('.js')).concat(['99_trial_setup_private.js']);
await writeFile(join(out,'.clasp.json'),JSON.stringify(clasp,null,2)+'\n');
console.log(JSON.stringify({prepared:true,enabled:false,accountCount:2,scopes:manifest.oauthScopes,executeAs:manifest.webapp.executeAs,networkChanged:false,sharingChanged:false}));
