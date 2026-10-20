// 読取り済みdistの公開版/HEADそれぞれへ同じ狭い変更を適用する。外部書込みなし。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('./html-download-gas/',import.meta.url));
export const added=['48_html_download_availability.js','25_htmlDownloadAvailability.html'];
export const changed=['00_code.js','_CHANGELOG.html','_OVERVIEW.html'];
export function updateRoute(source){
 const before="  if(parameters.type==='htmlIdentity')return HtmlIdentityConfirmation.render(parameters);";
 assert.equal(source.split(before).length,2,'unexpected dist route; inspect latest source');
 return source.replace(before,before+"\n  if(parameters.type==='htmlDownload')return HtmlDownloadAvailability.render(parameters);");
}
export function prepare(before,stage,order,stamp){
 assert.notEqual(path.resolve(before),path.resolve(stage));
 assert(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp));
 const names=fs.readdirSync(before).filter(n=>/\.(js|gs|html)$/.test(n)||n==='appsscript.json').sort();
 order=order.map(n=>path.basename(n));assert.deepEqual([...order].sort(),names);
 fs.mkdirSync(stage,{recursive:true});assert.equal(fs.readdirSync(stage).length,0);
 for(const name of names)fs.copyFileSync(path.join(before,name),path.join(stage,name));
 for(const name of added){assert(!names.includes(name));fs.copyFileSync(directory+name,path.join(stage,name));}
 fs.writeFileSync(stage+'/00_code.js',updateRoute(fs.readFileSync(before+'/00_code.js','utf8')));
 const note='HTML v3新規ダウンロード時の読取専用可否RPCと埋込接続を追加。配布設定一覧のrelease/学年TASK・課題設定の年度/学年/status/startAtを毎回照合。原本/本人情報の発行・Driveコピー・GSS/ログ書込は行わない。提出受付・既存HTML・Colab/SS・新Python・鍵/権限は保持。';
 fs.appendFileSync(stage+'/_CHANGELOG.html','\n'+stamp+' | Codex | '+note+' filePushOrderは48と25の2件追加のみ。\n');
 fs.appendFileSync(stage+'/_OVERVIEW.html','\n## HTML v3新規取得の軽量確認（2026-10-20）\n\n'+note+'\n'+
  'type=htmlDownload&embed=html-editorの専用画面は承認済み親origin/source/bridge/nonceと接続した後に1回だけRPCを呼ぶ。署名済み90日本人情報を現在のGoogle利用者・生徒名簿と照合し、配付の可否だけを返す。可否の成功キャッシュや通常ファイルへのフォールバックは置かない。指定教員の配付確認例外は既存の教員照合で維持する。提出開始判定・intakeEnabled・採点モード・提出期限を配付開始の条件へ流用しない。公開サイトの原本を秘匿する機構ではない。\n');
 const control={...JSON.parse(fs.readFileSync(before+'/.clasp.json','utf8')),rootDir:'.',skipSubdirectories:true,filePushOrder:[...order,...added]};
 assert.deepEqual([...control.filePushOrder].sort(),[...names,...added].sort());
 fs.writeFileSync(stage+'/.clasp.json',JSON.stringify(control,null,2)+'\n');
 return {stage,files:names.length+added.length,added,changed,manifestUnchanged:true,remoteWrites:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [before,stage,orderFile,stamp]=process.argv.slice(2);assert(before&&stage&&orderFile);
 console.log(JSON.stringify(prepare(before,stage,JSON.parse(fs.readFileSync(orderFile,'utf8')),stamp)));
}
