import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const c = vm.createContext({});
vm.runInContext(readFileSync(new URL('../gas/05_grade_sources.js', import.meta.url), 'utf8'), c);
const source = {subject:'INFO1', year:2026, distributionId:'distribution-0001', scheduleId:'schedule-0001',
  lectureAliases:{dr41:['di09'], dr42:['di12']}};
const material = {subject:'INFO1',year:2026,worksheetId:'dr41',grade:9,enabled:true};
const pages = [{id:'dr41',worksheetApp:'dr41'},{id:'dr42',worksheetApp:'dr42'}];
const plan = (lectureKeys='di09',grade=3,year=2026,status='active') => ({lessonPlanKey:'plan_A',year,grade,lectureKeys,status});
const resolve = (plans, m=material, s=source) => c.WorksheetGradeSource.resolve(m,s,pages,plans);

test('dr41/dr42 resolve through explicit legacy keys, preserving source grade changes', () => {
  for (const [id,key] of [['dr41','di09'],['dr42','di12']]) {
    assert.equal(resolve([plan(key)], {...material,worksheetId:id}).grade, 3);
    assert.equal(resolve([plan(key,4)], {...material,worksheetId:id}).grade, 4);
  }
});
test('exact comma-separated page IDs work independently of worksheet ID and release', () => {
  const p=[{id:'lesson41',worksheetApp:'dr41',release:false}];
  assert.equal(c.WorksheetGradeSource.resolve(material,source,p,[plan('unrelated, lesson41')]).grade,3);
  assert.equal(resolve([plan('di091')]).gradeIssue,'worksheet_grade_not_found');
});
test('only active rows for the QR year contribute; repeated classes or lessons are harmless', () => {
  assert.equal(resolve([plan('di09',4,2025),plan(),plan()]).grade,3);
  assert.equal(resolve([plan('di09',4,2026,'empty'),plan()]).grade,3);
  assert.equal(resolve([plan('di09',4,2025)]).gradeIssue,'worksheet_grade_not_found');
});
test('different grades across current and old keys remain REVIEW', () => {
  assert.equal(resolve([plan(),plan('dr41',4)]).gradeIssue,'worksheet_grade_ambiguous');
});
test('missing mappings and malformed relevant grades do not use stale grade 9', () => {
  assert.equal(c.WorksheetGradeSource.resolve(material,source,[],[plan()]).gradeIssue,'worksheet_page_unresolved');
  for (const grade of ['',0,'中3',3.5]) assert.equal(resolve([plan('di09',grade)]).gradeIssue,'worksheet_grade_source_invalid');
  assert.equal(resolve([],material,null).gradeIssue,'worksheet_grade_source_missing');
  assert.throws(()=>resolve([plan()],material,{...source,year:2025}),/GRADE_SOURCE_MISMATCH/);
});
test('source bindings and aliases require explicit valid config', () => {
  assert.equal(c.WorksheetGradeSource.config([source]).length,1);
  assert.throws(()=>c.WorksheetGradeSource.config([source,source]),/DUPLICATE_GRADE_SOURCE/);
  assert.throws(()=>c.WorksheetGradeSource.config([{...source,lectureAliases:{dr41:[3]}}]),/INVALID_LECTURE_ALIAS/);
  assert.throws(()=>c.WorksheetGradeSource.config([{...source,grade:3}]),/INVALID_GRADE_SOURCES/);
});
