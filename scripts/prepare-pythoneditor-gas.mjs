// 確認済みのリモート原本のコピーへ追加する。実プロジェクト、設定、デプロイは操作しない。
import { readFile, writeFile, mkdir, readdir, stat, cp, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const arg=name=>{const n=process.argv.indexOf(name);return n>=0?process.argv[n+1]:null;};
const baseline=arg('--baseline'),out=arg('--out');
if(!baseline||!out)throw new Error('--baseline（確認済みリモート原本）と --out（新しい一時ディレクトリ）が必要です。');
const base=resolve(baseline),target=resolve(out);
if(!target.startsWith('/private/tmp/')||target===base||target.startsWith(base+'/'))throw new Error('出力先は原本と別の/private/tmp/内を指定してください。');
let exists=false;try{await access(target);exists=true;}catch{}if(exists)throw new Error('既存の出力先を置換しません。新しいパスを指定してください。');
const bundle=new URL('./pythoneditor-gas/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',bundle),'utf8'));
const source=await readFile(join(base,'00_code.js'),'utf8');
const needles=['renderHtmlEntryPage_','renderHtmlPracticePage_'].map(fn=>`    if (e && e.parameter && e.parameter.kind === 'html') return ${fn}(e);`);
const matches=needles.filter(n=>source.split(n).length===2),needle=matches[0];
if(matches.length!==1||source.includes("kind === 'pythoneditor'"))throw new Error('doGetの原本が確認済み構造と異なります。手作業の確認が必要です。');
const hook="    if (e && e.parameter && e.parameter.kind === 'pythoneditor') return renderPythonEditorBridge_(e);\n";
const clasp=JSON.parse(await readFile(join(base,'.clasp.json'),'utf8'));
if(clasp.rootDir && clasp.rootDir!=='.')throw new Error('rootDirを確認してください。');
for(const f of manifest.files){try{await access(join(base,f));throw new Error(`追加予定ファイルが原本に存在します: ${f}`);}catch(e){if(e.code!=='ENOENT')throw e;}}
const digest=text=>createHash('sha256').update(text).digest('hex'),hashes={};
for(const item of await readdir(base)) {
  if(item==='.git'||item==='node_modules')continue;
  const info=await stat(join(base,item));
  if(info.isFile())hashes[item]=digest(await readFile(join(base,item)));
}
await mkdir(target,{recursive:false});await cp(base,target,{recursive:true,filter:path=>!path.split('/').some(p=>p==='.git'||p==='node_modules')});
await writeFile(join(target,'00_code.js'),source.replace(needle,hook+needle));
for(const file of manifest.files)await cp(new URL(file,bundle),join(target,file));
clasp.filePushOrder=[...(clasp.filePushOrder||[]),...manifest.files];
await writeFile(join(target,'.clasp.json'),JSON.stringify(clasp,null,2)+'\n');
const at=new Date().toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'});
const append=async(file,line)=>{let before='';try{before=await readFile(join(target,file),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(join(target,file),before+'\n'+line+'\n');};
await append('_CHANGELOG.html',`${at} | Codex | 独立Pythonエディタ専用のGSS下書き・版固定採点・提出受付/結果照会を追加。旧py/ss/htmlと設定・ログは保持。既定で無効。`);
await append('AI_NOTES.md',`${at} | Codex | Python新版: kind=pythoneditorのみ追加。保存先は非公開GSSの専用4シート、問題編集正本はPython問題マスター、受付条件は課題設定.item=pythoneditor。旧Colabには未接続。配置後もPYTHON_EDITOR_CONFIG.enabled=falseで止め、採用版・対象・日時は別途確認。新OAuth・権限・既存リンクは変更しない。実機/40名実GAS検証は未完了。`);
const unchanged=[];
for(const [file,sha]of Object.entries(hashes))if(!['00_code.js','.clasp.json','_CHANGELOG.html','AI_NOTES.md'].includes(file)){
  if(digest(await readFile(join(target,file)))!==sha)throw new Error('範囲外変更: '+file);unchanged.push(file);
}
await writeFile(target+'-review.json',JSON.stringify({baseline:base,target,at,baselineHashes:hashes,unchanged,added:manifest.files,
  modified:['00_code.js','.clasp.json','_CHANGELOG.html','AI_NOTES.md'],pushed:false,deployed:false,rollback:'保持したbaselineと既存デプロイ版/プロパティへ戻す。新版GSS行は削除せず保護する。'},null,2));
console.log(JSON.stringify({target,review:target+'-review.json',unchangedFiles:unchanged.length,addedFiles:manifest.files.length,pushed:false,deployed:false}));
