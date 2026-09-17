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
      const transformedStroke=input('width="48" height="48" viewBox="0 0 24 24"','<path d="M2 2H22" fill="none" stroke="#123456" stroke-width="3" stroke-dasharray="3 1"/>').objects[0];
      let nonuniformStrokeRefused=false;try{input('','<path transform="scale(2 1)" d="M0 0H10" fill="none" stroke="#123456" stroke-width="3"/>');}catch(_){nonuniformStrokeRefused=true;}
      const legacyIlapo=input('data-ilapo-page-id="legacy-046"','<path data-ilapo-id="old-path" transform="matrix(3 0 0 .5 7 11)" d="M0 0H10V10H0Z" fill="none" stroke="#123456" stroke-width="8"/>').objects[0];
      const none=input('width="60" height="30" viewBox="0 0 10 10" preserveAspectRatio="none"');
      const meet=input('width="60" height="30" viewBox="0 0 10 10"');
      const coloredText=input('', '<text><tspan fill="red">x</tspan></text>').objects[0];
      const scriptedText=input('', '<text><tspan baseline-shift="super" font-size="70%">2</tspan></text>').objects[0];
      const channelOpacity=input('', '<path d="M0 0H10V10Z" fill="#123456" stroke="#654321" fill-opacity=".4" stroke-opacity=".7"/>').objects[0];
      const inheritedChannelOpacity=input('', '<g fill-opacity=".3" stroke-opacity=".6"><path d="M0 0H10" stroke="#123456"/></g>').objects[0];
      const legacyChannels=input('', '<path d="M0 0H10" stroke="#123456"/>').objects[0];
      const refused=[];
      for(const [name,body] of [['invalid-color','<rect width="10" height="10" fill="not-a-color"/>'],['font-family','<text style="font-family:Arial">x</text>'],['unsafe-position','<text x="0" font-size="20"><tspan x="5" dy="24">x</tspan></text>'],['wrong-line-height','<text x="0" font-size="20"><tspan x="0" dy="25">x</tspan></text>'],['partial-font-size','<text><tspan font-size="15">x</tspan></text>'],['bad-fill-opacity','<path d="M0 0L10 10" fill-opacity="1.1"/>'],['script','<text><script>alert(1)</script></text>'],['bad-path','<path d="M0 0L1"/>']]) {
        try{input('',body);refused.push([name,false]);}catch(_){refused.push([name,true]);}
      }
      const thick=IlapoCore.makeShape('rect',0,0,10,10,{stroke:'#000000',strokeWidth:20,linejoin:'round'});thick.matrix=[2,0,0,2,0,0];
      const p=IlapoCore.createPage('太い線',{width:100,height:100,unit:'px',infinite:false});p.objects=[thick];
      const svg=IlapoSVG.exportPage(p,{selectionIds:[thick.id],padding:0});
      const stretched=IlapoCore.makeShape('rect',0,0,10,10,{fill:'none',stroke:'#123456',strokeWidth:8});stretched.id='stretched';stretched.matrix=[3,0,0,.5,7,11];
      const stretchedPage=IlapoCore.createPage('横長',{width:100,height:100,unit:'px',infinite:false});stretchedPage.objects=[stretched];
      const stretchedSvg=IlapoSVG.exportPage(stretchedPage),stretchedImported=IlapoSVG.importSVG(stretchedSvg).page.objects[0],stretchedZip=IlapoSVG.decodeProject(IlapoSVG.encodeProject({format:'kaijo-ilapo',version:1,id:'stretched-doc',name:'横長',pages:[stretchedPage]})),stretchedBounds=IlapoGeometry.visualBounds(stretched);
      const doc=IlapoCore.createDocument();doc.pages[0].board.infinite=true;
      const t=IlapoCore.makeText(-80,-20,'x  2\n日本語',{fontSize:.8,fill:'#112233',stroke:'none'});t.runs=[{text:'x  ',script:'normal'},{text:'2',script:'super'},{text:'\n日本語',script:'normal'}];
      doc.pages[0].objects=[thick,t];
      const resumed=IlapoSVG.decodeProject(IlapoSVG.encodeProject(doc));
      const channelDoc={format:'kaijo-ilapo',version:1,id:'channels',name:'',pages:[{...IlapoCore.createPage(),objects:[channelOpacity]}]};
      const checkedChannels=IlapoCore.validateDocument(channelDoc), channelSvg=IlapoSVG.exportPage(checkedChannels.pages[0]), channelZip=IlapoSVG.decodeProject(IlapoSVG.encodeProject(checkedChannels));
      return {coloredText,scriptedText,channelOpacity,inheritedChannelOpacity,legacyChannels,channelSvg,channelZip,checkedChannels,doubleBox:IlapoGeometry.bounds(doubled.objects[0]),defaultStyle:doubled.objects[0].style,a4box:IlapoGeometry.bounds(a4.objects[0]),a4board:a4.board,small:small.board,transformedStroke,nonuniformStrokeRefused,none:none.objects[0].matrix,meet:meet.objects[0].matrix,refused,thickView:svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number),stretchedSvg,stretchedImported,stretchedZip,stretched,stretchedBounds,legacyIlapo,doc,resumed};
    });
    assert.equal(result.doubleBox.width,48);assert.equal(result.doubleBox.height,48);
    assert.equal(result.defaultStyle.fill,'#000000');assert.equal(result.defaultStyle.stroke,'none');
    assert.ok(Math.abs(result.a4box.width-210*96/25.4)<1e-8);assert.ok(Math.abs(result.a4board.height-297*96/25.4)<1e-8);
    assert.equal(result.small.width,18);assert.deepEqual(result.none,[6,0,0,3,0,0]);assert.deepEqual(result.meet,[3,0,0,3,15,0]);
    assert.deepEqual(result.transformedStroke.matrix,[2,0,0,2,0,0]);assert.equal(result.transformedStroke.style.strokeWidth,6,'viewBox scale preserves an imported path stroke in document coordinates');assert.equal(result.transformedStroke.style.dash,'6 2','viewBox scale preserves imported dash intervals');
    assert.equal(result.nonuniformStrokeRefused,true,'a non-uniform external SVG stroke is rejected instead of being silently averaged');
    assert.deepEqual(result.legacyIlapo.matrix,[3,0,0,.5,7,11]);assert.equal(result.legacyIlapo.style.strokeWidth,8,'0.4.6以前の当アプリSVGは非等方行列を回収できる');
    assert.deepEqual(result.coloredText.runs,[{text:'x',script:'normal',fill:'#ff0000'}],'supported tspan color must be preserved');
    assert.deepEqual(result.scriptedText.runs,[{text:'2',script:'super'}],'existing super/sub tspan remains importable');
    assert.equal(result.channelOpacity.style.fillOpacity,.4);assert.equal(result.channelOpacity.style.strokeOpacity,.7);
    assert.equal(result.inheritedChannelOpacity.style.fillOpacity,.3);assert.equal(result.inheritedChannelOpacity.style.strokeOpacity,.6,'group channel alpha is inherited safely');
    assert.equal(Object.hasOwn(result.legacyChannels.style,'fillOpacity'),false);assert.equal(Object.hasOwn(result.legacyChannels.style,'strokeOpacity'),false,'SVG without channel attributes stays compact');
    assert.equal(result.checkedChannels.version,7);assert.match(result.channelSvg,/fill-opacity="0.4"/);assert.match(result.channelSvg,/stroke-opacity="0.7"/);
    assert.deepEqual(result.channelZip,result.checkedChannels,'native ZIP preserves opacity channels');
    assert.deepEqual(result.refused.map(item=>item[1]),Array(8).fill(true),'unsupported SVG must be rejected without silently changing artwork: '+JSON.stringify(result.refused));
    assert.ok(result.thickView[0]<=-10&&result.thickView[1]<=-10&&result.thickView[2]>=40&&result.thickView[3]>=40,'include document-space stroke extent');
    assert.match(result.stretchedSvg,/stroke-width="8"/);assert.doesNotMatch(result.stretchedSvg,/transform="matrix\(3 0 0 0\.5 7 11\)"/,'ordinary SVG bakes path transforms before stroking');
    assert.deepEqual(result.stretchedImported.matrix,[1,0,0,1,0,0]);assert.equal(result.stretchedImported.style.strokeWidth,8);
    assert.deepEqual(result.stretchedZip.pages[0].objects[0],result.stretched,'native ZIP preserves the editable path matrix');
    assert.ok(Math.abs(result.stretchedBounds.x-3)<1e-8&&Math.abs(result.stretchedBounds.y-7)<1e-8&&Math.abs(result.stretchedBounds.width-38)<1e-8&&Math.abs(result.stretchedBounds.height-13)<1e-8,'visual bounds use the unscaled document stroke width');
    assert.deepEqual(result.resumed,result.doc,'native project must preserve geometry, typography and metadata');
    console.log('Ilapo SVG compatibility tests passed');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
