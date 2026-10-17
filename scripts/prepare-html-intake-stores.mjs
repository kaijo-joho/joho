// 所有教員の診断済み2名registryを、新設受付GASの無効HEADへ封入する。ネットワーク操作なし。
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const [baselinePath,outputPath,registryPath]=process.argv.slice(2);
if(!baselinePath||!outputPath||!registryPath)throw Error('Usage: node scripts/prepare-html-intake-stores.mjs PRIVATE_BASELINE PRIVATE_OUTPUT PRIVATE_REGISTRY.json');
const baseline=resolve(baselinePath),out=resolve(outputPath);
if(!baseline.startsWith('/private/tmp/') || !out.startsWith('/private/tmp/') || out===baseline)throw Error('Use separate private temporary directories');
const clasp=JSON.parse(await readFile(join(baseline,'.clasp.json'),'utf8')),manifest=JSON.parse(await readFile(join(baseline,'appsscript.json'),'utf8'));
const context=vm.createContext({});vm.runInContext(await readFile(join(baseline,'99_trial_setup_private.js'),'utf8'),context);
const setup=context.htmlIntakeTrialSetup_(),exported=JSON.parse(await readFile(registryPath,'utf8'));
if(setup.schema!==1 || clasp.scriptId!==setup.scriptId || setup.accounts?.length!==2 || new Set(setup.accounts).size!==2 ||
  exported.kind!=='html-intake-trial-registry-export-v1' || exported.schema!==1 || exported.intakeScriptId!==setup.scriptId ||
  !/^[a-f0-9]{32}$/.test(exported.scopeId) || exported.entries?.length!==2 ||
  new Set(exported.entries.map(e=>e.spreadsheetId)).size!==2 || new Set(exported.entries.map(e=>e.generation)).size!==2 ||
  !exported.entries.every((e,i)=>e.accountIndex===i && e.owner===setup.owner && e.intakeScriptId===setup.scriptId &&
    e.scopeId===exported.scopeId && e.actorKey===createHash('sha256').update(setup.accounts[i]).digest('hex') &&
    /^[a-f0-9]{32}$/.test(e.generation) && /^[A-Za-z0-9_-]{20,160}$/.test(e.spreadsheetId) && /^[A-Za-z0-9_-]{20,160}$/.test(e.individualFolderId)))throw Error('Check the owner-exported two-account registry');
if(manifest.webapp?.executeAs!=='USER_ACCESSING' || manifest.webapp?.access!=='DOMAIN' || manifest.oauthScopes?.length!==2 ||
  manifest.oauthScopes.some(s=>!['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/userinfo.email'].includes(s)))throw Error('Keep the user app restricted to the existing two scopes');
const additions={
  '50_store_layout.js':await readFile(new URL('./html-intake-gas/50_store_layout.js',import.meta.url),'utf8'),
  '97_trial_store_admin.js':await readFile(new URL('./html-intake-gas/97_trial_store_admin.js',import.meta.url),'utf8'),
  '99_trial_stores_private.js':'// 教員が実環境で照合済みの試験保存先。公開Gitへ追加しない。\nfunction htmlIntakeTrialStoreImport_(){return '+JSON.stringify(exported)+';}\n'
};
const names=(await readdir(baseline)).filter(n=>/\.(?:js|gs|html)$/.test(n)||n==='appsscript.json');
if(Object.keys(additions).some(n=>names.includes(n)))throw Error('Do not overwrite an already configured trial');
await mkdir(out,{recursive:true,mode:0o700});if((await readdir(out)).length)throw Error('Output must be empty');
const before={};for(const name of names){const value=await readFile(join(baseline,name));before[name]=createHash('sha256').update(value).digest('hex');await copyFile(join(baseline,name),join(out,name));}
for(const [name,value] of Object.entries(additions)){new vm.Script(value,{filename:name});await writeFile(join(out,name),value,{flag:'wx',mode:0o600});}
const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
const change=stamp+' | Codex | 所有教員限定の試験保存先2件の読戻し検証・登録関数を追加。受付無効・2スコープを保持。';
await writeFile(join(out,'_CHANGELOG.html'),await readFile(join(out,'_CHANGELOG.html'),'utf8')+'\n'+change+'\n');
clasp.filePushOrder=(clasp.filePushOrder?.length?clasp.filePushOrder:names.filter(n=>n.endsWith('.js'))).concat(Object.keys(additions));
await writeFile(join(out,'.clasp.json'),JSON.stringify(clasp,null,2)+'\n');await writeFile(join(out,'.claspignore'),'**/**\n!*.js\n!*.html\n!appsscript.json\n',{flag:'wx',mode:0o600});
await writeFile(join(out,'stores-build.private.json'),JSON.stringify({baseline,before,added:Object.keys(additions),changed:['_CHANGELOG.html'],change,enabled:false,manifestChanged:false},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({prepared:true,allowedAccountCount:2,enabled:false,manifestChanged:false}));
