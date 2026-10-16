// 教員が取得した私有GSSスナップショットを、表示に必要な項目へ投影する。
// このファイルも正本データも、GASの認証・配信実装ではない。
import { validateCatalog } from '../tools/pythoneditor/core.mjs';
import { parseCodeRefs, normalizeCheck, publicCheck, validateReferenceGraph } from '../tools/pythoneditor/confirmation.mjs';
export const MASTER_LEGACY_HEADERS = ['questionId','setId','order','version','title','prompt','templateCode','setupCode','answerCode','explanation',
  'gradingVersion','scoringIds','status','sourceFileId','sourceCellIds','sourceHash','runtimeConfig','note'];
export const MASTER_HEADERS = [...MASTER_LEGACY_HEADERS, 'kind', 'codeRefs', 'checkType', 'checkConfig'];
function headerWidth(header) {
  const expected = header?.length === 18 ? MASTER_LEGACY_HEADERS : MASTER_HEADERS;
  if (header?.length !== expected.length || !expected.every((value, i) => header[i] === value))
    throw new Error('問題マスターは従来のA:R、または kind / codeRefs / checkType / checkConfig を末尾に加えたA:Vを読み込んでください。');
  return expected.length;
}
export function masterRows(raw) {
  if (Array.isArray(raw)) {
    if (raw[0]?.[0] === 'questionId') { const width = headerWidth(raw[0]); if (raw.some(row => row.length !== width)) throw new Error('問題マスターの行の列数が一致しません。'); return raw.slice(1).filter(row => row[0]); }
    if (raw.length && (![18, 22].includes(raw[0]?.length) || raw.some(row => row.length !== raw[0].length)))
      throw new Error('問題マスターの行の列数は18列または22列で統一してください。');
    return raw;
  }
  const sheet = raw?.sheets?.find(s => s.properties?.title === 'Python問題マスター');
  if (!sheet || sheet.data?.length !== 1) throw new Error('Python問題マスターのA1:RまたはA1:V範囲を読み込んでください。');
  const data = sheet.data[0].rowData, width = data?.[0]?.values?.length;
  if (![18, 22].includes(width)) throw new Error('問題マスターの列数は18列または22列にしてください。');
  const rows = data.map(row => Array.from({length:width},(_,i) => {
    const cell = row.values?.[i]?.userEnteredValue || {};
    if (cell.formulaValue) throw new Error('問題マスターの配信項目に数式を使用できません。');
    return cell.stringValue ?? cell.numberValue ?? cell.boolValue ?? '';
  }));
  if (data.some(row => row.values?.length > width)) throw new Error('問題マスターの列構成を確認してください。');
  headerWidth(rows[0]);
  return rows.slice(1).filter(row=>row[0]);
}
export function studentCatalog(raw) {
  const rows = masterRows(raw), sets = new Map();
  for (const row of rows) {
    // 編集中も教員のローカル試作では表示。本番採用判定へ流用しない。
    if (![18, 22].includes(row.length) || !['編集中','採用済み','旧版'].includes(row[12])) throw new Error('問題マスターの行・状態を確認してください。');
    const setId = row[1];
    if (!sets.has(setId)) sets.set(setId,{setId,title:setId,questions:[]});
    const runtime = row[16] ? JSON.parse(row[16]) : {};
    const kind = typeof row[18] === 'string' ? row[18].trim() : row[18] == null ? '' : null;
    if (!['', 'code', 'confirmation'].includes(kind)) throw new Error(`${row[0]}: kind は空欄・code・confirmation のいずれかにしてください。`);
    let confirmation = {};
    if (kind === 'confirmation') {
      if (row[6] || row[7] || row[10] || row[11] || runtime.useExistingQuestionCode || runtime.scoringRanges?.length)
        throw new Error(`${row[0]}: 確認問題のコード・準備コード・採点版・採点ID・採点範囲は空欄にし、codeRefs で参照してください。`);
      try { confirmation = { codeRefs: parseCodeRefs(row[19]), checkType: String(row[20] || '').trim(),
        checkConfig: publicCheck(String(row[20] || '').trim(), normalizeCheck(String(row[20] || '').trim(), row[21])) }; }
      catch (error) { throw new Error(`${row[0]}: ${error.message}`); }
    } else if (row.slice(19, 22).some(value => value !== '' && value !== null && value !== undefined))
      throw new Error(`${row[0]}: codeRefs / checkType / checkConfig は確認問題の行だけに設定してください。`);
    sets.get(setId).questions.push({questionId:row[0],setId,version:row[3],title:row[4],prompt:row[5],templateCode:row[6],setupCode:row[7],
      kind:kind === 'confirmation' ? kind : runtime.hasOriginalInputCell === false ? 'observation' : 'code', ...confirmation,
      ...(runtime.useExistingQuestionCode ? {useExistingQuestionCode:runtime.useExistingQuestionCode} : {}),order:row[2]});
  }
  for(const set of sets.values()) {
    set.questions.sort((a,b)=>a.order-b.order);
    const heading=set.questions[0]?.prompt.match(/^#+\s*\*?\*?([^\n]+)/);
    if(heading) set.title=heading[1].replace(/\*+/g,'').trim()+'（'+set.setId+'）';
  }
  const questions = [...sets.values()].flatMap(set => set.questions);
  for (const q of questions.filter(q => q.kind === 'confirmation')) for (const ref of q.codeRefs) {
    const source = questions.filter(other => other.questionId === ref.questionId && other.version === ref.version);
    if (source.length !== 1 || source[0].kind !== 'code' || source[0].setId !== q.setId)
      throw new Error(`${q.questionId}: 参照元 ${ref.questionId}@${ref.version} は同じ問題セットのコード問題として一意に指定してください。`);
  }
  validateReferenceGraph(questions);
  // answerCode/explanation/gradingVersion/scoringIds/source* /runtimeConfig/note / checkConfig.private を渡さない。
  const schema = [...sets.values()].some(set => set.questions.some(q => q.kind === 'confirmation')) ? 'python-editor-catalog-v2' : 'python-editor-catalog-v1';
  return validateCatalog({schema,label:'Python問題マスター・教員確認用',sets:[...sets.values()]});
}
