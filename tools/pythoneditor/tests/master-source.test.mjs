import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudFixture } from './cloud-fixture.mjs';

test('採点表の配付URL列の数式は採用を妨げず、問題・判定列と見出しの数式は拒否する', () => {
  const f = createCloudFixture(), M = f.ctx.PythonEditorMaster;
  const master = [Array.from(M.headers), ['q1','exercise',1,'v1','問題','説明','# start\n\n# end','','','','rubric-v1','q1','採用済み','','','',
    JSON.stringify({ scoringRanges: [{regionId:'r1',scoringId:'q1',startMarker:'# start',endMarker:'# end'}] }), '']];
  const rubric = [
    ['questionId','questionTitle','minLines','ruleId','target','ruleType','stepNo','stepMode','keyword','points','enabled','python','output','url','note'],
    ['q1','問題',1,'rule1','code','match',1,'single','print',1,true,'','','https://example.invalid','']
  ];
  const formulas = { master: master.map(r=>r.map(()=>'')), rubric: rubric.map(r=>r.map(()=>'')) };
  formulas.rubric[1][13] = '=BYROW(...)';
  function sheet(values, key) { return { getLastRow:()=>values.length, getLastColumn:()=>values[0].length,
    getRange:()=>({getValues:()=>values, getFormulas:()=>formulas[key]}) }; }
  f.ctx.Common = { SSID: { fileList: 'synthetic-private-source' } };
  f.ctx.SpreadsheetApp = { openById(id) { assert.equal(id, 'synthetic-private-source'); return {
    getSheetByName:name=>name==='Python問題マスター'?sheet(master,'master'):sheet(rubric,'rubric') }; } };
  const spec = {setId:'exercise',version:'v1',gradingSheet:'採点設定py_20261014'};
  assert.equal(M.read(spec).canAdopt, true);
  for (const [key,row,col] of [['rubric',1,8],['rubric',0,13],['master',1,6]]) {
    formulas[key][row][col] = '=UNTRUSTED()';
    assert.throws(()=>M.read(spec), e=>e.pythonEditorCode==='snapshot_invalid');
    formulas[key][row][col] = '';
  }
});
