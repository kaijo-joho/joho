'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
let chromium;
try { ({chromium}=require('playwright')); } catch { ({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();
    for(const file of ['vendor/paper-core-0.12.18.min.js','vendor/fflate-0.8.2.umd.js','core.js','geometry.js','svg.js'])await page.addScriptTag({path:path.resolve(__dirname,'..',file)});
    const result=await page.evaluate(()=>{
      const wrap=(attrs,body)=>`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
      const input=(attrs,body='<rect width="10" height="10"/>')=>IlapoSVG.importSVG(wrap(attrs,body)).page;
      const doubled=input('width="48" height="48" viewBox="0 0 24 24"','<rect width="24" height="24"/>');
      const a4=input('width="210mm" height="297mm" viewBox="0 0 210 297"','<rect width="210" height="297"/>');
      const small=input('width="18px" height="18px"');
      const none=input('width="60" height="30" viewBox="0 0 10 10" preserveAspectRatio="none"');
      const meet=input('width="60" height="30" viewBox="0 0 10 10"');
      const refused=[];
      for(const body of ['<rect width="10" height="10" fill="not-a-color"/>','<text style="font-family:Arial">x</text>','<text x="0" font-size="20"><tspan x="5" dy="24">x</tspan></text>','<text x="0" font-size="20"><tspan x="0" dy="25">x</tspan></text>','<text><tspan fill="red">x</tspan></text>','<path d="M0 0L10 10" fill-opacity=".5"/>','<text><script>alert(1)</script></text>','<path d="M0 0L1"/>']) {
        try{input('',body);refused.push(false);}catch(_){refused.push(true);}
      }
      const thick=IlapoCore.makeShape('rect',0,0,10,10,{stroke:'#000000',strokeWidth:20,linejoin:'round'});thick.matrix=[2,0,0,2,0,0];
      const p=IlapoCore.createPage('太い線',{width:100,height:100,unit:'px',infinite:false});p.objects=[thick];
      const svg=IlapoSVG.exportPage(p,{selectionIds:[thick.id],padding:0});
      const doc=IlapoCore.createDocument();doc.pages[0].board.infinite=true;
      const t=IlapoCore.makeText(-80,-20,'x  2\n日本語',{fontSize:.8,fill:'#112233',stroke:'none'});t.runs=[{text:'x  ',script:'normal'},{text:'2',script:'super'},{text:'\n日本語',script:'normal'}];
      doc.pages[0].objects=[thick,t];
      const resumed=IlapoSVG.decodeProject(IlapoSVG.encodeProject(doc));
      return {doubleBox:IlapoGeometry.bounds(doubled.objects[0]),defaultStyle:doubled.objects[0].style,a4box:IlapoGeometry.bounds(a4.objects[0]),a4board:a4.board,small:small.board,none:none.objects[0].matrix,meet:meet.objects[0].matrix,refused,thickView:svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number),doc,resumed};
    });
    assert.equal(result.doubleBox.width,48);assert.equal(result.doubleBox.height,48);
    assert.equal(result.defaultStyle.fill,'#000000');assert.equal(result.defaultStyle.stroke,'none');
    assert.ok(Math.abs(result.a4box.width-210*96/25.4)<1e-8);assert.ok(Math.abs(result.a4board.height-297*96/25.4)<1e-8);
    assert.equal(result.small.width,18);assert.deepEqual(result.none,[6,0,0,3,0,0]);assert.deepEqual(result.meet,[3,0,0,3,15,0]);
    assert.ok(result.refused.every(Boolean),'unsupported SVG must be rejected without silently changing artwork');
    assert.ok(result.thickView[0]<=-20&&result.thickView[1]<=-20&&result.thickView[2]>=60&&result.thickView[3]>=60,'include transformed stroke extent');
    assert.deepEqual(result.resumed,result.doc,'native project must preserve geometry, typography and metadata');
    console.log('Ilapo SVG compatibility tests passed');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
