// 教員が取得した私有GSSスナップショットを、表示に必要な項目へ投影する。
// このファイルも正本データも、GASの認証・配信実装ではない。
import { validateCatalog } from '../tools/pythoneditor/core.mjs';
export function masterRows(raw) {
  if (Array.isArray(raw)) return raw;
  const sheet = raw?.sheets?.find(s => s.properties?.title === 'Python問題マスター');
  if (!sheet || sheet.data?.length !== 1) throw new Error('Python問題マスターのA1:R範囲を読み込んでください。');
  const rows = sheet.data[0].rowData.map(row => Array.from({length:18},(_,i) => {
    const cell = row.values?.[i]?.userEnteredValue || {};
    if (cell.formulaValue) throw new Error('問題マスターの配信項目に数式を使用できません。');
    return cell.stringValue ?? cell.numberValue ?? cell.boolValue ?? '';
  }));
  if (rows[0][0] !== 'questionId' || rows[0][8] !== 'answerCode' || rows[0][17] !== 'note') throw new Error('問題マスターの列構成を確認してください。');
  return rows.slice(1).filter(row=>row[0]);
}
export function studentCatalog(raw) {
  const rows = masterRows(raw), sets = new Map();
  for (const row of rows) {
    // 編集中も教員のローカル試作では表示。本番採用判定へ流用しない。
    if (row.length !== 18 || !['編集中','採用済み','旧版'].includes(row[12])) throw new Error('問題マスターの行・状態を確認してください。');
    const setId = row[1];
    if (!sets.has(setId)) sets.set(setId,{setId,title:setId,questions:[]});
    const runtime = row[16] ? JSON.parse(row[16]) : {};
    sets.get(setId).questions.push({questionId:row[0],version:row[3],title:row[4],prompt:row[5],templateCode:row[6],setupCode:row[7],
      kind:runtime.hasOriginalInputCell === false ? 'observation' : 'code',
      ...(runtime.useExistingQuestionCode ? {useExistingQuestionCode:runtime.useExistingQuestionCode} : {}),order:row[2]});
  }
  for(const set of sets.values()) {
    set.questions.sort((a,b)=>a.order-b.order);
    const heading=set.questions[0]?.prompt.match(/^#+\s*\*?\*?([^\n]+)/);
    if(heading) set.title=heading[1].replace(/\*+/g,'').trim()+'（'+set.setId+'）';
  }
  // answerCode/explanation/gradingVersion/scoringIds/source* /runtimeConfig/note を渡さない。
  return validateCatalog({schema:'python-editor-catalog-v1',label:'Python問題マスター・教員確認用',sets:[...sets.values()]});
}
