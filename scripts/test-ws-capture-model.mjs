// Synthetic page records only. QR determines sides; no image or student data.
import assert from 'node:assert/strict';
import {checkPages} from '../assets/ws-home/10_model.mjs';
const page=(side,reading={})=>({correctedBlob:new Blob(['synthetic']),reading:{status:'OK',qr:{subject:'INFO1',year:2026,worksheetId:'dr41',side},classNumber:3,number:7,...reading}});
const front=page('F'),back=page('B');let passed=0;
function test(name,fn){fn();passed++;console.log('OK '+name);}
test('normal photo order maps to the matching submission sides',()=>{
  const r=checkPages({F:front,B:back});assert.equal(r.ok,true);assert.equal(r.pages.F,front);assert.equal(r.pages.B,back);
});
test('reversed photo order maps by QR without moving or mutating the inputs',()=>{
  const input=Object.freeze({F:back,B:front}),r=checkPages(input);
  assert.equal(r.ok,true);assert.equal(r.pages.F,front);assert.equal(r.pages.B,back);assert.equal(input.F,back);assert.equal(input.B,front);
});
for(const side of ['F','B'])test('two '+side+' photos cannot be submitted',()=>{
  const r=checkPages({F:page(side),B:page(side)});assert.equal(r.ok,false);assert.match(r.errors[0].message,/2枚/);
});
test('one photo stays incomplete',()=>assert.equal(checkPages({F:back}).ok,false));
test('different worksheets are rejected even in reversed order',()=>{
  const other=page('B',{qr:{...back.reading.qr,worksheetId:'dr43'}});assert.equal(checkPages({F:other,B:front}).ok,false);
});
test('different school years are rejected',()=>{
  const other=page('B',{qr:{...back.reading.qr,year:2025}});assert.equal(checkPages({F:front,B:other}).ok,false);
});
test('different marked identities are rejected',()=>assert.equal(checkPages({F:back,B:page('F',{number:8})}).ok,false));
test('unread back marks remain mandatory',()=>assert.equal(checkPages({F:page('B',{status:'REVIEW',message:'マークが空欄です。'}),B:front}).ok,false));
test('pending originals cannot pass confirmation',()=>assert.equal(checkPages({F:{originalBlob:new Blob(),reading:{status:'PENDING'}},B:front}).ok,false));
test('missing QR side cannot pass confirmation',()=>assert.equal(checkPages({F:page('F',{qr:null}),B:back}).ok,false));
test('missing mark values cannot pass even with a claimed OK status',()=>assert.equal(checkPages({F:front,B:page('B',{number:null})}).ok,false));
console.log(JSON.stringify({mode:'SYNTHETIC_SIDE_MAPPING',passed}));
