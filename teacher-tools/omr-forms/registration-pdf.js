/* Generated PDFs only. External/Docs-edited PDFs require a separate inspector. */
(function(root){
  'use strict';var SCALE=300/25.4;
  function assert(ok,message){if(!ok)throw Error('PDF検査：'+message);}
  function within(box,rect,margin){return box.x>=rect[0]-margin&&box.y>=rect[1]-margin&&box.x+box.width<=rect[0]+rect[2]+margin&&box.y+box.height<=rect[1]+rect[3]+margin;}
  async function image(url){return new Promise(function(resolve,reject){var im=new Image();im.onload=function(){resolve(im);};im.onerror=function(){reject(Error('用紙画像を生成できません'));};im.src=url;});}
  function jpegData(bytes){var binary='';for(var i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return 'data:image/jpeg;base64,'+btoa(binary);}
  function pixels(ctx,x,y){var data=ctx.getImageData(Math.round(x*SCALE),Math.round(y*SCALE),1,1).data;return(data[0]+data[1]+data[2])/3;}
  async function build(packet,progress){
    var M=OMRDesigner,c=packet.candidate,r=c.readerDefinition,d=c.document.definition;
    OMRRegistration.validate(r,c.document);M.validate(d);await document.fonts.ready;
    var pages=[],proof={schema:'omr-pdf-preflight/1',renderer:OMRRegistration.renderer,dpi:300,documentSha256:c.documentSha256,readerDefinitionSha256:c.readerDefinitionSha256,pages:[]};
    for(var i=0;i<r.pages.length;i++){
      if(progress)progress((i+1)+' / '+r.pages.length+'ページのPDFを生成・検査中…');
      var page=r.pages[i],g=M.layout(d,d.pages[i]),svg=await OMRScene.render(d,i,'',{qrPayload:page.qr.payload}),host=document.createElement('div');
      host.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden';host.append(svg);document.body.append(host);
      try{
        svg.querySelectorAll('text').forEach(function(t){assert(within(t.getBBox(),[0,0,g.width_mm,g.height_mm],.1),'文字が用紙外にはみ出しています');});
        d.pages[i].elements.forEach(function(e){var group=svg.querySelector('[data-element-id="'+e.id+'"]');assert(group&&within(group.getBBox(),M.rect(e),.8),'部品「'+(e.label||e.id)+'」の文字・読取欄が枠外です。高さや幅を広げてください');});
        svg.querySelectorAll('[data-header], [data-identity-heading], [data-grade-label]').forEach(function(t){var b=t.getBBox();assert(!M.overlaps([b.x,b.y,b.width,b.height],g.qr),'ヘッダーとQRが重なっています');});
        var width=Math.round(g.width_mm*SCALE),height=Math.round(g.height_mm*SCALE),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        svg.setAttribute('width',width);svg.setAttribute('height',height);
        var encoded='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg.outerHTML),ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(await image(encoded),0,0,width,height);
        var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/jpeg',.98);});assert(blob,'JPEGを生成できません');
        var jpeg=new Uint8Array(await blob.arrayBuffer());
        // Inspect the encoded image actually embedded in the PDF, not only the SVG.
        ctx.clearRect(0,0,width,height);
        // data: is allowed by the existing image CSP; blob: image access is not.
        ctx.drawImage(await image(jpegData(jpeg)),0,0);
        g.markers.forEach(function(box){for(var dy of [.25,.5,.75])for(var dx of [.25,.5,.75])assert(pixels(ctx,box[0]+box[2]*dx,box[1]+box[3]*dy)<50,'位置補正用■が欠けています');});
        var qr=qrcodegen.QrCode.encodeSegments([qrcodegen.QrSegment.makeNumeric(page.qr.payload)],qrcodegen.QrCode.Ecc.HIGH,1,1,0,false),unit=g.qr[2]/29;
        for(var y=0;y<29;y++)for(var x=0;x<29;x++){var dark=x>=4&&x<25&&y>=4&&y<25&&qr.getModule(x-4,y-4),level=pixels(ctx,g.qr[0]+(x+.5)*unit,g.qr[1]+(y+.5)*unit);assert(dark?level<65:level>220,'QRまたは余白が欠けています');}
        var bubbles=0;g.fields.forEach(function(f){f.bubbles.forEach(function(b){bubbles++;assert(b.x-b.r>0&&b.y-b.r>0&&b.x+b.r<g.width_mm&&b.y+b.r<g.height_mm,'読取欄が用紙外です');assert(pixels(ctx,b.x+b.r,b.y)<200,'読取欄の輪郭が欠けています');});});
        pages.push({widthMm:g.width_mm,heightMm:g.height_mm,widthPx:width,heightPx:height,jpeg:jpeg});
        proof.pages.push({number:page.number,widthMm:g.width_mm,heightMm:g.height_mm,widthPx:width,heightPx:height,qrPayload:page.qr.payload,qrVersion:1,qrModules:21,quietZoneModules:4,markersVerified:13,bubblesVerified:bubbles,textBoundsVerified:true,imageSha256:await OMRArtifacts.sha(jpeg)});
      }finally{host.remove();}
    }
    OMRRegistration.validateProof(proof,r);
    var bytes=OMRPDF.build(pages);return {candidateSha256:packet.reservation.candidateSha256,pdfSha256:await OMRArtifacts.sha(bytes),pdf:new Blob([bytes],{type:'application/pdf'}),proof:proof};
  }
  root.OMRRegistrationPDF={build:build};
})(window);
