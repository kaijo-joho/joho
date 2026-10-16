// 確認journal検証の正本を保存GAS向けに生成する。実GAS/GSSは操作しない。
import { readFile, writeFile } from 'node:fs/promises';
const declaration = await readFile(new URL('../tools/pythoneditor/confirmation.mjs', import.meta.url), 'utf8');
const journal = await readFile(new URL('../tools/pythoneditor/confirmation-store.mjs', import.meta.url), 'utf8');
const begin = journal.indexOf('export const JOURNAL_LIMITS = '), end = journal.indexOf('export function mergeJournals(');
if (begin < 0 || end < begin) throw new Error('確認journalの検証関数構造を確認してください。');
let validation = journal.slice(begin, end).replace(/^export /gm, '');
validation = validation.replace(/async function codeHash\(code\) \{[\s\S]*?\n\}\n/, '');
validation = validation.replace('new TextEncoder().encode(JSON.stringify(journal)).byteLength', 'byteLength(JSON.stringify(journal))');
if (validation.includes('new TextEncoder')) throw new Error('GASのUTF-8長検査への変換を確認してください。');
const output = `// GENERATED: node scripts/build-tools-confirmation-contract.mjs
// 正本: tools/pythoneditor/confirmation.mjs, confirmation-store.mjs の検証関数。手で編集しない。
var ToolsConfirmationContract = (function () {
'use strict';
var P = (function () {
${declaration.replace(/^export /gm, '')}
return {normalizeTrial:normalizeTrial,refKey:refKey};
})();
const normalizeTrial = P.normalizeTrial, refKey = P.refKey;
function byteLength(text) { return Utilities.newBlob(String(text)).getBytes().length; }
${validation}
function validate(raw) {
  try {
    const normalized = validateJournal(JSON.parse(ToolsStoreContract.canonical(raw)));
    normalized.trials.forEach(t => {
      if (ToolsStoreContract.hash(t.code) !== t.codeHash) throw fail('journal_invalid', '試行コードのhashが一致しません。');
    });
    return normalized;
  } catch (error) { ToolsStoreContract.fail('journal_invalid', error.message || '確認記録の形式を確認してください。'); }
}
return Object.freeze({validate:validate,byteLength:byteLength});
})();
`;
const destination = new URL('./tools-store-gas/common/06_tools_confirmation_contract.js', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('確認journalのGAS検証が正本と一致しません。');
  console.log('Tools confirmation contract: OK');
} else { await writeFile(destination, output); console.log(destination.pathname); }
