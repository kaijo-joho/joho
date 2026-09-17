/* Ilapo SVG and project interchange.  SVG is the artwork source of truth. */
(function (root) {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var supported = { svg: 1, g: 1, path: 1, rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1, text: 1, tspan: 1, title: 1, desc: 1, image:1 };
  var blocked = { script: 1, foreignobject: 1, use: 1, iframe: 1, object: 1, embed: 1, animate: 1, animatemotion: 1, set: 1, style: 1, link: 1, audio: 1, video: 1 };
  var serial = 0;
  function uid(prefix) { serial += 1; return (prefix || 'object') + '-' + Date.now().toString(36) + '-' + serial.toString(36); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'; }); }
  function number(value, fallback) { value = Number(value); return Number.isFinite(value) ? value : fallback; }
  function cleanColor(value, fallback) {
    if (value == null) return fallback;
    if (value === 'none' || /^#[0-9a-f]{6}$/i.test(value)) return value;
    if (typeof document === 'undefined' || /^(currentcolor|inherit|initial|unset)$/i.test(value)) return fallback;
    var ctx=document.createElement('canvas').getContext('2d');
    if (!ctx) return fallback;
    ctx.fillStyle='#010203'; ctx.fillStyle=String(value); var one=ctx.fillStyle;
    ctx.fillStyle='#040506'; ctx.fillStyle=String(value); var two=ctx.fillStyle;
    return one===two && /^#[0-9a-f]{6}$/i.test(one) ? one : fallback;
  }
  function cleanDash(value) { return /^\s*(?:\d+(?:\.\d+)?\s*)*$/.test(value || '') ? String(value || '').trim() : ''; }
  function styleOf(style) {
    style = style || {};
    return {
      fill: cleanColor(style.fill, '#000000'), stroke: cleanColor(style.stroke, 'none'), strokeWidth: Math.max(0, number(style.strokeWidth, 1)), opacity: Math.max(0, Math.min(1, number(style.opacity, 1))),
      dash: cleanDash(style.dash), linecap: /^(butt|round|square)$/.test(style.linecap) ? style.linecap : 'butt', linejoin: /^(miter|round|bevel)$/.test(style.linejoin) ? style.linejoin : 'miter',
      fontSize: Math.max(Number.EPSILON, number(style.fontSize, 16)), fontFamily: /^(sans-serif|serif|monospace)$/.test(style.fontFamily) ? style.fontFamily : 'sans-serif', bold: !!style.bold, italic: !!style.italic
    };
  }
  function matrixOf(matrix) { matrix = matrix || [1, 0, 0, 1, 0, 0]; if (!Array.isArray(matrix) || matrix.length !== 6 || matrix.some(function (v) { return !Number.isFinite(Number(v)); })) throw new Error('Invalid SVG matrix'); return matrix.map(Number); }
  function matrixAttr(matrix) { matrix = matrixOf(matrix); return matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 1 && matrix[4] === 0 && matrix[5] === 0 ? '' : ' transform="matrix(' + matrix.join(' ') + ')"'; }
  function attrs(object, options) { options=options||{};var s = styleOf(object.style), idAttr=options.omitId?'':' data-ilapo-id="' + esc(object.id || '') + '"'; return idAttr + matrixAttr(object.matrix) + ' fill="' + s.fill + '" stroke="' + s.stroke + '" stroke-width="' + s.strokeWidth + '" opacity="' + s.opacity + '" stroke-dasharray="' + esc(s.dash) + '" stroke-linecap="' + s.linecap + '" stroke-linejoin="' + s.linejoin + '"' + (['path','image'].includes(object.type)?' font-size="'+s.fontSize+'" font-family="'+s.fontFamily+'" font-weight="'+(s.bold?'bold':'normal')+'" font-style="'+(s.italic?'italic':'normal')+'"':''); }
  function validPath(d) { return typeof d === 'string' && /^[\s,\.\-+0-9a-zA-Z]+$/.test(d) && !/[a-z]/.test(d.replace(/[MmZzLlHhVvCcSsQqTtAaEe]/g, '')); }
  function runsMarkup(runs) {
    return (runs || []).map(function(run) { var shift=run.script==='super'?'super':run.script==='sub'?'sub':'',style='';if(run.bold!==undefined)style+=' font-weight="'+(run.bold?'bold':'normal')+'"';if(run.italic!==undefined)style+=' font-style="'+(run.italic?'italic':'normal')+'"';if(run.fill!==undefined)style+=' fill="'+esc(cleanColor(run.fill,'none'))+'"';return shift||style?'<tspan'+(shift?' baseline-shift="'+shift+'" font-size="70%"':'')+style+'>'+esc(run.text==null?'':run.text)+'</tspan>':esc(run.text==null?'':run.text); }).join('');
  }
  function textMarkup(object, options) {
    options=options||{};
    var style=styleOf(object.style),x=number(object.x,0),y=number(object.y,0),runs=Array.isArray(object.runs)?object.runs:[{text:'',script:'normal'}],extra=options.labelOwner?' data-ilapo-shape-label-text="'+esc(options.labelOwner)+'"':'';
    // Older documents keep their byte-for-byte compatible SVG form.  New
    // wrapped text delegates all line positions to the shared layout runtime.
    if(object.layout!=null) {
      if(!root.IlapoTextLayout||typeof root.IlapoTextLayout.layout!=='function')throw new Error('IlapoTextLayout is required for wrapped SVG text');
      var shaped=root.IlapoTextLayout.layout(object);
      if(!shaped||!Array.isArray(shaped.lines)||!shaped.lines.length)throw new Error('Invalid text layout result');
      var laidOut=shaped.lines.map(function(line){var lx=Number(line.x),ly=Number(line.y);if(!Number.isFinite(lx)||!Number.isFinite(ly)||!Array.isArray(line.runs))throw new Error('Invalid text layout line');return '<tspan x="'+lx+'" y="'+ly+'">'+runsMarkup(line.runs)+'</tspan>';}).join('');
      return '<text xml:space="preserve"'+attrs(object,{omitId:!!options.omitId})+extra+' x="'+x+'" y="'+y+'" font-size="'+style.fontSize+'" font-family="'+style.fontFamily+'" font-weight="'+(style.bold?'bold':'normal')+'" font-style="'+(style.italic?'italic':'normal')+'">'+laidOut+'</text>';
    }
    var body='';
    runs.forEach(function(run){String(run.text==null?'':run.text).split('\n').forEach(function(part,index){if(index)body+='<tspan x="'+x+'" dy="'+(style.fontSize*1.2)+'">';else body+='<tspan>';body+=runsMarkup([Object.assign({},run,{text:part})]);body+='</tspan>';});});
    return '<text xml:space="preserve"'+attrs(object,{omitId:!!options.omitId})+extra+' x="'+x+'" y="'+y+'" font-size="'+style.fontSize+'" font-family="'+style.fontFamily+'" font-weight="'+(style.bold?'bold':'normal')+'" font-style="'+(style.italic?'italic':'normal')+'">'+body+'</text>';
  }
  function objectMarkup(object, options) {
    options=options||{};
    if(object?.type==='connector')return '<g data-ilapo-connector="'+esc(object.id)+'">'+root.IlapoConnectors.renderedParts(object).map(function(part){return objectMarkup(part,options);}).join('')+'</g>';
    if(object?.type==='image'){
      if(!root.IlapoCore.validImageSource(object.src))throw new Error('Unsafe SVG image source');
      return '<image'+attrs(object)+' x="'+number(object.x,0)+'" y="'+number(object.y,0)+'" width="'+number(object.width,1)+'" height="'+number(object.height,1)+'" href="'+esc(object.src)+'" preserveAspectRatio="none"/>';
    }
    if (!object || !/^(path|text)$/.test(object.type)) throw new Error('Unsupported Ilapo object');
    if (object.type === 'path') {
      if (!validPath(object.d)) throw new Error('Invalid SVG path data');
      // Derive labels from the editable source path.  The ordinary-SVG path
      // below may be flattened to protect its document-space stroke width;
      // applying that flattening to shapeText would discard rotations,
      // reflection and shear needed by the derived label's own matrix.
      var label=null;
      if(object.label!=null){
        if(!root.IlapoTextLayout||typeof root.IlapoTextLayout.shapeText!=='function')throw new Error('IlapoTextLayout is required for shape labels');
        label=root.IlapoTextLayout.shapeText(object);
        if(!label||label.type!=='text')throw new Error('Invalid shape label layout result');
      }
      // The stroke width is a document-space value. Bake an object transform for
      // display and ordinary exports so non-uniform scaling cannot distort it.
      // Native ZIP pages request rawTransforms to preserve editable matrix/d data.
      if (!options.rawTransforms && root.IlapoGeometry?.flattenedPath) object=root.IlapoGeometry.flattenedPath(object);
      var path='<path' + attrs(object) + ' d="' + esc(object.d) + '"/>';
      if(label){
        // A derived label is never a document object.  In particular it must
        // not reuse the conventional "<path id>-label" ID in an SVG export.
        return '<g data-ilapo-shape-label="'+esc(object.id||'')+'">'+path+textMarkup(label,{omitId:true,labelOwner:object.id||''})+'</g>';
      }
      return path;
    }
    return textMarkup(object,options);
  }
  function bounds(objects) { var g = root.IlapoGeometry, result = null; (objects || []).forEach(function (o) { if (!g || !g.bounds) return; var b = (g.visualBounds || g.bounds)(o); if (!result) result = { x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height }; else { result.x = Math.min(result.x, b.x); result.y = Math.min(result.y, b.y); result.right = Math.max(result.right, b.x + b.width); result.bottom = Math.max(result.bottom, b.y + b.height); } }); return result;
  }
  function exportPage(page, options) { options = options || {};page=root.IlapoCore.clone(page);root.IlapoConnectors?.sync(page); var objects = (page.objects || []).filter(function (o) { return (options.includeReferences||!(o.type==='image'&&o.reference))&&(!options.selectionIds || options.selectionIds.indexOf(o.id) >= 0); }); var pad = number(options.padding, 20), board = page.board || {}, w = number(board.width, 800), h = number(board.height, 600), x = 0, y = 0;
    if (board.infinite || options.selectionIds) { var b = bounds(objects); if (b) { x = b.x - pad; y = b.y - pad; w = Math.max(1, b.right - b.x + 2 * pad); h = Math.max(1, b.bottom - b.y + 2 * pad); } }
    var body = '', openGroup = null; objects.forEach(function (o) { if (o.group !== openGroup) { if (openGroup) body += '</g>'; openGroup=o.group||null; if(openGroup) body += '<g data-ilapo-group="' + esc(openGroup) + '">'; } body += objectMarkup(o,options); }); if(openGroup) body += '</g>';
    return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="' + SVG_NS + '" width="' + w + '" height="' + h + '" viewBox="' + x + ' ' + y + ' ' + w + ' ' + h + '" data-ilapo-page-id="' + esc(page.id || '') + '">' + body + '</svg>';
  }
  function parseTransform(text) { text=String(text||''); var out = [1, 0, 0, 1, 0, 0], re = /([a-zA-Z]+)\s*\(([^)]*)\)/g, match; if(text.replace(re,'').trim())throw new Error('Invalid SVG transform'); while ((match = re.exec(text))) { var n = match[2].trim().split(/[ ,]+/).filter(Boolean).map(Number), m; if (n.some(function(v){return !Number.isFinite(v);} )) throw new Error('Invalid SVG transform'); if (match[1] === 'matrix' && n.length === 6) m = n; else if (match[1] === 'translate' && (n.length === 1 || n.length === 2)) m = [1,0,0,1,n[0],n[1] || 0]; else if (match[1] === 'scale' && (n.length === 1 || n.length === 2)) m = [n[0],0,0,n[1] == null ? n[0] : n[1],0,0]; else if (match[1] === 'rotate' && (n.length === 1 || n.length === 3)) { var r=n[0]*Math.PI/180,c=Math.cos(r),s=Math.sin(r),cx=n[1]||0,cy=n[2]||0; m=[c,s,-s,c,cx-c*cx+s*cy,cy-s*cx-c*cy]; } else throw new Error('Unsupported SVG transform'); out = combine(out, m); } return out; }
  function combine(a,b) { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]; }
  function scaleDash(dash, scale) { return dash ? dash.trim().split(/\s+/).map(function(n){return Number(n)*scale;}).join(' ') : ''; }
  function uniformStrokeScale(matrix) { var sx=Math.hypot(matrix[0],matrix[1]),sy=Math.hypot(matrix[2],matrix[3]),dot=matrix[0]*matrix[2]+matrix[1]*matrix[3],tolerance=1e-9*Math.max(1,sx,sy);if(Math.abs(sx-sy)>tolerance||Math.abs(dot)>tolerance*Math.max(1,sx,sy))throw new Error('SVGの線には縦横で異なる倍率が使われています。線をアウトライン化するか、縦横比を保って拡大縮小してください。');return sx; }
  function attr(el, name, fallback) { return el.hasAttribute(name) ? el.getAttribute(name) : fallback; }
  function coordinate(value) { var text=String(value).trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text))throw new Error('Invalid SVG coordinate');var n=Number(text),limit=root.IlapoCore&&root.IlapoCore.LIMITS?root.IlapoCore.LIMITS.coordinate:1000000;if(!Number.isFinite(n)||Math.abs(n)>limit)throw new Error('Invalid SVG coordinate');return n; }
  function elementStyle(el, inherited) {
    var base=styleOf(inherited),s={};
    ['fill','stroke','stroke-width','opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','font-size','font-family','font-weight','font-style'].forEach(function(k){if(el.hasAttribute(k))s[k]=el.getAttribute(k);});
    attr(el,'style','').split(';').forEach(function(p){if(!p.trim())return;var q=p.indexOf(':');if(q<=0)throw new Error('Invalid SVG style');s[p.slice(0,q).trim()]=p.slice(q+1).trim();});
    return styleOf({
      fill:s.fill==null?base.fill:cleanColor(s.fill,null),
      stroke:s.stroke==null?base.stroke:cleanColor(s.stroke,null),
      strokeWidth:s['stroke-width']==null?base.strokeWidth:Number(s['stroke-width']),
      opacity:s.opacity==null?base.opacity:base.opacity*Number(s.opacity),
      dash:s['stroke-dasharray']==null?base.dash:s['stroke-dasharray'].trim().split(/[ ,]+/).filter(Boolean).map(Number).join(' '),
      linecap:s['stroke-linecap']==null?base.linecap:s['stroke-linecap'],
      linejoin:s['stroke-linejoin']==null?base.linejoin:s['stroke-linejoin'],
      fontSize:s['font-size']==null?base.fontSize:svgLength(s['font-size'],base.fontSize),
      fontFamily:s['font-family']==null?base.fontFamily:s['font-family'],
      bold:s['font-weight']==null?base.bold:['bold','700'].includes(s['font-weight']),
      italic:s['font-style']==null?base.italic:s['font-style']==='italic'
    });
  }
  function auditTree(el,parentText,inheritedStyle,textDepth) {
    textDepth=textDepth||0;
    var tag=el.localName.toLowerCase();
    if(blocked[tag]||!supported[tag]||(el.namespaceURI&&el.namespaceURI!==SVG_NS))throw new Error('Unsupported SVG element: '+tag);
    var presentation=['fill','stroke','stroke-width','opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','font-size','font-family','font-weight','font-style','fill-rule','stroke-miterlimit'];
    var geometry={svg:['width','height','viewbox','preserveaspectratio','version'],g:[],path:['d'],rect:['x','y','width','height','rx','ry'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],line:['x1','y1','x2','y2'],polygon:['points'],polyline:['points'],text:['x','y'],tspan:['x','y','dy','font-size','baseline-shift'],title:[],desc:[],image:['x','y','width','height','preserveaspectratio']};
    function valueCheck(key,value) {
      if((key==='fill'||key==='stroke')&&cleanColor(value,null)==null)throw new Error('Unsupported SVG color');
      if(key==='font-family'&&!['sans-serif','serif','monospace'].includes(value))throw new Error('Unsupported SVG font family');
      if(key==='font-weight'&&!['normal','bold','400','700'].includes(value))throw new Error('Unsupported SVG font weight');
      if(key==='font-style'&&!['normal','italic'].includes(value))throw new Error('Unsupported SVG font style');
      if(key==='font-size')svgLength(value,16);
      if(key==='stroke-width'&&(!Number.isFinite(Number(value))||Number(value)<0))throw new Error('Unsupported SVG stroke width');
      if(key==='opacity'&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1))throw new Error('Unsupported SVG opacity');
      if(key==='stroke-dasharray'&&value.trim()&&!value.trim().split(/[ ,]+/).every(function(n){return n!==''&&Number.isFinite(Number(n))&&Number(n)>=0;}))throw new Error('Unsupported SVG dash');
      if(key==='stroke-linecap'&&!['butt','round','square'].includes(value))throw new Error('Unsupported SVG linecap');
      if(key==='stroke-linejoin'&&!['miter','round','bevel'].includes(value))throw new Error('Unsupported SVG linejoin');
      if(key==='fill-rule'&&value!=='nonzero')throw new Error('Unsupported SVG fill-rule');
      if(key==='stroke-miterlimit'&&Number(value)!==4)throw new Error('Unsupported SVG miter limit');
    }
    Array.from(el.attributes).forEach(function(a){
      var key=a.name.toLowerCase(),value=a.value;
      if(tag==='image'&&(key==='href'||key==='xlink:href')){if(!root.IlapoCore.validImageSource(value))throw new Error('Unsafe SVG image source');return;}
      if(/^on/.test(key)||/(?:href|src)$/.test(key)||/url\s*\(/i.test(value))throw new Error('Unsafe SVG attribute: '+a.name);
      if(key==='xmlns'||key.startsWith('xmlns:')||key==='id'||key==='class'||key.startsWith('data-'))return;
      if(key==='xml:space'&&tag==='text'&&value==='preserve')return;
      if(key==='transform'&&tag!=='tspan'){parseTransform(value);return;}
      if(key==='style'){
        value.split(';').forEach(function(part){if(!part.trim())return;var q=part.indexOf(':');if(q<1)throw new Error('Invalid SVG style');var name=part.slice(0,q).trim(),v=part.slice(q+1).trim();if(tag==='tspan'&&!['fill','font-weight','font-style'].includes(name))throw new Error('Unsupported SVG tspan style: '+name);if(tag!=='tspan'&&(!presentation.includes(name)||name==='fill-rule'||name==='stroke-miterlimit'))throw new Error('Unsupported SVG style: '+name);valueCheck(name,v);});return;
      }
      if(presentation.includes(key)){if(tag==='tspan'&&!['fill','font-size','font-weight','font-style'].includes(key))throw new Error('Unsupported SVG tspan style');if(tag==='tspan'&&key==='font-size'){if(value!=='70%'||!['super','sub'].includes(attr(el,'baseline-shift','')))throw new Error('Unsupported SVG tspan font-size');return;}valueCheck(key,value);return;}
      if(!(geometry[tag]||[]).includes(key))throw new Error('Unsupported SVG attribute: '+a.name);
      if(tag==='image'&&key==='preserveaspectratio'&&value!=='none')throw new Error('Unsupported SVG image aspect ratio');
      if((tag==='text'&&(key==='x'||key==='y'))||(tag==='tspan'&&(key==='x'||key==='y'||key==='dy')))coordinate(value);
      if(tag==='tspan'){
        var hasX=el.hasAttribute('x'),hasY=el.hasAttribute('y'),hasDy=el.hasAttribute('dy');
        if((hasX||hasY||hasDy)&&!parentText)throw new Error('Unsupported SVG tspan position');
        if((hasX||hasY||hasDy)&&textDepth!==0)throw new Error('Unsupported nested SVG tspan position');
        // Accepted tspan positions are deliberately finite: either the legacy
        // x/dy line break, or one explicit x/y baseline produced by v4.
        if(hasY){if(!hasX||hasDy)throw new Error('Unsupported SVG tspan position');}
        else if(hasX||hasDy){if(!hasX||!hasDy||coordinate(attr(el,'x',''))!==parentText.x||Math.abs(coordinate(attr(el,'dy',''))-parentText.fontSize*1.2)>1e-6)throw new Error('Unsupported SVG tspan position');}
        if((key==='font-size'||key==='baseline-shift')&&(!['super','sub'].includes(attr(el,'baseline-shift',''))||attr(el,'font-size','')!=='70%'))throw new Error('Unsupported SVG tspan font-size');
      }
    });
    var style=tag==='tspan'?inheritedStyle:elementStyle(el,inheritedStyle),context=tag==='text'?{x:coordinate(attr(el,'x',0)),fontSize:style.fontSize}:parentText,nextTextDepth=tag==='text'?0:tag==='tspan'?textDepth+1:textDepth;
    Array.from(el.children).forEach(function(child){auditTree(child,context,style,nextTextDepth);});
  }
  function shapePath(el) { var tag=el.localName.toLowerCase(), n=function(k){var v=Number(attr(el,k,0));if(!Number.isFinite(v))throw new Error('Invalid SVG number');return v;}; if(tag==='path') {var d=attr(el,'d','');if(!validPath(d))throw new Error('Invalid SVG path data');return d;} if(tag==='rect'){var x=n('x'),y=n('y'),w=n('width'),h=n('height'),rx=n('rx'),ry=n('ry'); if(w<0||h<0)throw new Error('Invalid rect'); if(!rx&&!ry)return 'M'+x+' '+y+'H'+(x+w)+'V'+(y+h)+'H'+x+'Z'; rx=Math.min(rx||ry,w/2);ry=Math.min(ry||rx,h/2);return 'M'+(x+rx)+' '+y+'H'+(x+w-rx)+'A'+rx+' '+ry+' 0 0 1 '+(x+w)+' '+(y+ry)+'V'+(y+h-ry)+'A'+rx+' '+ry+' 0 0 1 '+(x+w-rx)+' '+(y+h)+'H'+(x+rx)+'A'+rx+' '+ry+' 0 0 1 '+x+' '+(y+h-ry)+'V'+(y+ry)+'A'+rx+' '+ry+' 0 0 1 '+(x+rx)+' '+y+'Z';} if(tag==='circle'||tag==='ellipse'){var cx=n('cx'),cy=n('cy'),rx=tag==='circle'?n('r'):n('rx'),ry=tag==='circle'?rx:n('ry');if(rx<0||ry<0)throw new Error('Invalid ellipse');return 'M'+(cx-rx)+' '+cy+'A'+rx+' '+ry+' 0 1 0 '+(cx+rx)+' '+cy+'A'+rx+' '+ry+' 0 1 0 '+(cx-rx)+' '+cy+'Z';} if(tag==='line')return 'M'+n('x1')+' '+n('y1')+'L'+n('x2')+' '+n('y2'); var points=(attr(el,'points','')||'').trim();if(!/^[\d\s,\.\-+]+$/.test(points))throw new Error('Invalid SVG points');var vals=points.split(/[\s,]+/).filter(Boolean).map(Number);if(vals.length<4||vals.length%2||vals.some(function(v){return !Number.isFinite(v)}))throw new Error('Invalid SVG points');var d='M'+vals[0]+' '+vals[1];for(var i=2;i<vals.length;i+=2)d+='L'+vals[i]+' '+vals[i+1];return tag==='polygon'?d+'Z':d; }
  function svgLength(value, fallback) {
    if (value == null || value === '') return fallback;
    var match=String(value).trim().match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(px|mm|cm|pt|in)?$/i);
    if(!match)throw new Error('Unsupported SVG length: '+value);
    var factor={px:1,mm:96/25.4,cm:96/2.54,pt:96/72,in:96}[String(match[2]||'px').toLowerCase()];
    var result=Number(match[1])*factor;
    if(!Number.isFinite(result)||result<=0)throw new Error('Invalid SVG dimension');
    return result;
  }
  function importSVG(text, options) {
    options=options||{};
    if(typeof DOMParser==='undefined')throw new Error('SVG import requires a browser DOMParser');
    var xml=new DOMParser().parseFromString(String(text),'image/svg+xml'),svg=xml.documentElement;
    if(xml.querySelector('parsererror')||svg.localName.toLowerCase()!=='svg')throw new Error('Invalid SVG XML');
    if(xml.doctype || Array.from(xml.childNodes).some(function(n){return n.nodeType===7;}))throw new Error('Unsupported SVG external declaration');
    auditTree(svg);
    var objects=[],nativeLabels=[],nativeLabelGroups=[];
    function nativeText(object, meta) {
      if(!meta||meta.text===undefined)return null;
      if(!meta.text||typeof meta.text!=='object'||Array.isArray(meta.text)||Object.keys(meta.text).some(function(k){return !['x','y','runs','layout'].includes(k);})||!Object.hasOwn(meta.text,'x')||!Object.hasOwn(meta.text,'y')||!Object.hasOwn(meta.text,'runs')||!Object.hasOwn(meta.text,'layout'))throw new Error('Invalid text metadata');
      var candidate=Object.assign({},object,{x:meta.text.x,y:meta.text.y,runs:meta.text.runs,layout:meta.text.layout}),checked=root.IlapoCore.validateObject(candidate);
      if(checked.type!=='text'||checked.layout==null)throw new Error('Invalid text metadata');
      return checked;
    }
    function tspanMarks(node) {
      var next={};
      function set(name,value){if(name==='font-weight')next.bold=['bold','700'].includes(value);else if(name==='font-style')next.italic=value==='italic';else if(name==='fill')next.fill=cleanColor(value,null);}
      [['font-weight','bold'],['font-style','normal'],['fill',null]].forEach(function(pair){if(node.hasAttribute(pair[0]))set(pair[0],attr(node,pair[0],pair[1]));});
      attr(node,'style','').split(';').forEach(function(part){if(!part.trim())return;var at=part.indexOf(':');if(at>0)set(part.slice(0,at).trim(),part.slice(at+1).trim());});
      return next;
    }
    function textRuns(node, script, inheritedStyle) {
      if(node.nodeType===1&&node.localName.toLowerCase()==='tspan') inheritedStyle=Object.assign({},inheritedStyle||{},tspanMarks(node));
      var runs=[];Array.from(node.childNodes).forEach(function(c){
        if(c.nodeType===3){if(c.nodeValue){var run={text:c.nodeValue,script:script==='super'||script==='sub'?script:'normal'};if(inheritedStyle){if(inheritedStyle.bold!==undefined)run.bold=inheritedStyle.bold;if(inheritedStyle.italic!==undefined)run.italic=inheritedStyle.italic;if(inheritedStyle.fill!==undefined)run.fill=inheritedStyle.fill;}runs.push(run);}}
        else if(c.nodeType===1&&c.localName.toLowerCase()==='tspan')runs.push.apply(runs,textRuns(c,attr(c,'baseline-shift',script),Object.assign({},inheritedStyle||{},tspanMarks(c))));
      });return runs.length?runs:[{text:'',script:'normal'}];
    }
    function textObjects(child, object) {
      var meta=options.nativeObjects&&Object.hasOwn(options.nativeObjects,object.id)?options.nativeObjects[object.id]:null,restored=nativeText(object,meta);
      if(restored)return [restored];
      var direct=Array.from(child.childNodes),lines=direct.filter(function(n){return n.nodeType===1&&n.localName.toLowerCase()==='tspan'&&n.hasAttribute('x')&&n.hasAttribute('y');});
      if(lines.length){
        if(direct.some(function(n){return (n.nodeType===3&&n.nodeValue.trim())||(n.nodeType===1&&n.localName.toLowerCase()==='tspan'&&(!n.hasAttribute('x')||!n.hasAttribute('y')));}))throw new Error('Unsupported mixed SVG text positioning');
        return lines.map(function(line,index){var copy=Object.assign({},object,{id:index?uid('object'):object.id,x:coordinate(attr(line,'x','')),y:coordinate(attr(line,'y','')),runs:textRuns(line,'normal')});return copy;});
      }
      var runs=[],pendingLine=false;
      function read(n,script,rich) { Array.from(n.childNodes).forEach(function(c){
        if(c.nodeType===3) { var value=(pendingLine?'\n':'')+c.nodeValue;pendingLine=false;if(value){var run={text:value,script:script==='super'||script==='sub'?script:'normal'};if(rich){if(rich.bold!==undefined)run.bold=rich.bold;if(rich.italic!==undefined)run.italic=rich.italic;if(rich.fill!==undefined)run.fill=rich.fill;}runs.push(run);} }
        else if(c.nodeType===1&&c.localName.toLowerCase()==='tspan') { if(c.hasAttribute('x')&&runs.length)pendingLine=true;read(c,attr(c,'baseline-shift',script),Object.assign({},rich||{},tspanMarks(c))); }
      }); }
      read(child,'normal');object.x=coordinate(attr(child,'x',0));object.y=coordinate(attr(child,'y',0));object.runs=runs.length?runs:[{text:'',script:'normal'}];return [object];
    }
    function walk(el,inherited,group,inheritedStyle,labelOwner) {
      Array.from(el.children).forEach(function(child){
        var tag=child.localName.toLowerCase();
        if(tag==='title'||tag==='desc')return;
        if(tag==='svg'||tag==='tspan')throw new Error('Unsupported nested SVG element: '+tag);
        var transform=combine(inherited,parseTransform(attr(child,'transform','')));
        var currentStyle=elementStyle(child,inheritedStyle);
        var nextGroup=tag==='g'?(group||attr(child,'data-ilapo-group',null)||uid('group')):group;
        if(tag==='g') {
          var connectorId=attr(child,'data-ilapo-connector',null);
          if(connectorId&&options.nativeObjects){
            var meta=options.nativeObjects[connectorId];
            if(!meta?.connector||meta.connector.id!==connectorId)throw new Error('Invalid connector metadata');
            objects.push(root.IlapoCore.validateObject(meta.connector));return;
          }
          if(currentStyle.opacity!==inheritedStyle.opacity && child.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline,text,image').length>1)throw new Error('Unsupported SVG group opacity');
          var marked=options.nativeObjects?attr(child,'data-ilapo-shape-label',null):null;
          if(marked!==null){if(labelOwner!==undefined)throw new Error('Invalid nested shape label');nativeLabelGroups.push(marked);}
          walk(child,transform,nextGroup,currentStyle,marked!==null?marked:labelOwner);return;
        }
        if(tag==='text'&&options.nativeObjects&&attr(child,'data-ilapo-shape-label-text',null)!==null){var marker=attr(child,'data-ilapo-shape-label-text','');if(labelOwner!==marker)throw new Error('Invalid shape label marker');nativeLabels.push(marker);return;}
        var object={id:attr(child,'data-ilapo-id',uid('object')),type:tag==='text'?'text':tag==='image'?'image':'path',name:tag==='text'?'文字':tag==='image'?'画像':'図形',group:nextGroup||null,locked:false,matrix:transform,style:currentStyle};
        if(labelOwner!==undefined&&object.id!==labelOwner)throw new Error('Invalid shape label owner');
        if(tag==='text') {
          objects.push.apply(objects,textObjects(child,object));return;
        } else if(tag==='image'){
          object.x=Number(attr(child,'x',0));object.y=Number(attr(child,'y',0));object.width=Number(attr(child,'width',0));object.height=Number(attr(child,'height',0));object.src=attr(child,'href',attr(child,'xlink:href',''));object.reference=false;
          if(!child.hasAttribute('preserveAspectRatio'))throw new Error('Unsupported SVG image aspect ratio');
        } else object.d=shapePath(child);
        objects.push(object);
      });
    }
    walk(svg,parseTransform(attr(svg,'transform','')),null,elementStyle(svg),undefined);
    var vbText=attr(svg,'viewBox','').trim(),vb=vbText?vbText.split(/[ ,]+/).map(Number):[];
    if(vb.length&&(vb.length!==4||vb.some(function(v){return !Number.isFinite(v);})||vb[2]<=0||vb[3]<=0))throw new Error('Invalid SVG viewBox');
    var width=svgLength(attr(svg,'width',null),vb[2]||300),height=svgLength(attr(svg,'height',null),vb[3]||150);
    var aspect=attr(svg,'preserveAspectRatio','xMidYMid meet').trim();
    if(!['none','xMidYMid','xMidYMid meet'].includes(aspect))throw new Error('Unsupported SVG preserveAspectRatio');
    if(vb.length&&!options.preserveCoordinates) {
      var sx=width/vb[2],sy=height/vb[3],tx=0,ty=0;
      if(aspect!=='none'){sx=sy=Math.min(sx,sy);tx=(width-vb[2]*sx)/2;ty=(height-vb[3]*sy)/2;}
      var viewport=[sx,0,0,sy,tx-vb[0]*sx,ty-vb[1]*sy];
      objects.forEach(function(o){o.matrix=combine(viewport,o.matrix);});
    }
    // SVG transforms scale a path stroke. The editor stores path strokes in
    // document coordinates, so normal imports fold a uniform source scale
    // into strokeWidth. A non-uniform source stroke has no equivalent scalar
    // width, so reject it instead of silently averaging. Native ZIP import
    // keeps its raw matrix/d/style representation without this conversion.
    var ilapoSVG=attr(svg,'data-ilapo-page-id',null)!==null;
    // 旧版を含む当アプリのSVGは、保存した線幅を既に作品座標の値として復元する。
    // 外部SVGだけは一様倍率を数値へ正規化し、非等方の線を拒否する。
    if(!options.preserveCoordinates&&!ilapoSVG)objects.forEach(function(o){if(o.type==='path'&&o.style.stroke!=='none'&&o.style.strokeWidth>0){var scale=uniformStrokeScale(o.matrix);o.style.strokeWidth*=scale;o.style.dash=scaleDash(o.style.dash,scale);}});
    var page={id:attr(svg,'data-ilapo-page-id',uid('page')),name:'読み込んだSVG',board:{width:width,height:height,unit:'px',infinite:false},objects:objects};
    if(root.IlapoCore)page=root.IlapoCore.validateDocument({format:'kaijo-ilapo',version:1,id:'import',name:'SVG',pages:[page]}).pages[0];
    return {page:page,warnings:[],nativeLabels:nativeLabels,nativeLabelGroups:nativeLabelGroups};
  }
  function assertZip() { if (!root.fflate || !root.fflate.zipSync || !root.fflate.unzipSync) throw new Error('fflate is required before IlapoSVG'); }
  function encodeProject(input) {
    assertZip();
    var doc=root.IlapoCore.validateDocument(input), manifest={format:'kaijo-ilapo',version:doc.version,id:doc.id,name:doc.name,pages:[]}, files=Object.create(null);
    doc.pages.forEach(function(page,index){
      var file='pages/'+encodeURIComponent(page.id)+'.svg',meta={id:page.id,name:page.name,board:page.board,file:file,objects:Object.create(null)};
      if(page.animations!==undefined)meta.animations=page.animations;
      page.objects.forEach(function(o){
        var m={name:o.name,group:o.group,locked:o.locked};
        if(o.type==='connector')m.connector=o;
        if(o.type==='image')m.reference=o.reference;
        // The SVG remains the source for visible matrix and style.  These
        // fields preserve only the author's reflowable input for v4 text.
        if(o.type==='text'&&o.layout!=null)m.text={x:o.x,y:o.y,runs:o.runs,layout:o.layout};
        if(o.type==='path'&&o.label!=null)m.label=o.label;
        meta.objects[o.id]=m;
      });
      manifest.pages.push(meta);files[file]=root.fflate.strToU8(exportPage(page,{includeReferences:true,rawTransforms:true}));
    });
    files['manifest.json']=root.fflate.strToU8(JSON.stringify(manifest));
    if(Object.values(files).reduce(function(n,b){return n+b.length;},0)>20*1024*1024)throw new Error('Project ZIP exceeds size limit');
    return root.fflate.zipSync(files,{level:6});
  }
  function decodeProject(bytes) {
    assertZip();
    if(!(bytes instanceof Uint8Array)||bytes.length>20*1024*1024)throw new Error('Project ZIP is too large');
    var total=0,files=root.fflate.unzipSync(bytes,{filter:function(file){
      if(file.originalSize>20*1024*1024||file.size>20*1024*1024||(total+=file.originalSize)>20*1024*1024)throw new Error('Project ZIP exceeds size limit');
      return true;
    }}),raw=files['manifest.json'];
    if(!raw)throw new Error('Project manifest is missing');
    var manifest=JSON.parse(root.fflate.strFromU8(raw));
    if(manifest.format!=='kaijo-ilapo'||![1,2,3,4,5].includes(manifest.version)||typeof manifest.id!=='string'||typeof manifest.name!=='string'||!Array.isArray(manifest.pages)||manifest.pages.length>100)throw new Error('Unsupported project manifest');
    var seenPages=new Set(),doc={format:'kaijo-ilapo',version:manifest.version,id:manifest.id,name:manifest.name,pages:[]};
    manifest.pages.forEach(function(meta){
      if(!meta||typeof meta.id!=='string'||typeof meta.name!=='string'||typeof meta.file!=='string'||!meta.board||typeof meta.board!=='object'||!meta.objects||typeof meta.objects!=='object'||Array.isArray(meta.objects)||seenPages.has(meta.id)||!Object.hasOwn(files,meta.file))throw new Error('Invalid project page metadata');
      seenPages.add(meta.id);
      if(meta.animations!==undefined&&(!Array.isArray(meta.animations)||meta.animations.length>1000))throw new Error('Invalid animation metadata');
      var imported=importSVG(root.fflate.strFromU8(files[meta.file]),{preserveCoordinates:true,nativeObjects:manifest.version>=2?meta.objects:null}),page=imported.page,seenObjects=new Set(),labelCounts=new Map(),labelGroups=new Map();
      imported.nativeLabels.forEach(function(owner){labelCounts.set(owner,(labelCounts.get(owner)||0)+1);});
      imported.nativeLabelGroups.forEach(function(owner){labelGroups.set(owner,(labelGroups.get(owner)||0)+1);});
      page.id=meta.id;page.name=meta.name;page.board=meta.board;if(meta.animations!==undefined)page.animations=meta.animations;
      page.objects.forEach(function(o){
        if(seenObjects.has(o.id))throw new Error('Duplicate SVG object ID');
        seenObjects.add(o.id);var m=Object.hasOwn(meta.objects,o.id)?meta.objects[o.id]:null;
        if(m){
          if(typeof m!=='object'||Array.isArray(m)||(m.name!=null&&typeof m.name!=='string')||(m.group!=null&&typeof m.group!=='string')||(m.locked!=null&&typeof m.locked!=='boolean')||Object.keys(m).some(function(k){return !['name','group','locked','connector','reference','text','label'].includes(k);}))throw new Error('Invalid object metadata');
          if(m.connector&&o.type!=='connector')throw new Error('Invalid connector metadata');
          if(m.reference!==undefined){if(o.type!=='image'||typeof m.reference!=='boolean')throw new Error('Invalid image metadata');o.reference=m.reference;}
          if(m.text!==undefined){if(manifest.version<4||o.type!=='text')throw new Error('Invalid text metadata');/* text was type-checked while parsing its SVG counterpart. */}
          if(m.label!==undefined){
            if(manifest.version<4||o.type!=='path'||labelCounts.get(o.id)!==1||labelGroups.get(o.id)!==1)throw new Error('Invalid shape label metadata');
            var checked=root.IlapoCore.validateObject(Object.assign({},o,{label:m.label}));o.label=checked.label;
          }
          o.name=typeof m.name==='string'?m.name:o.name;o.group=typeof m.group==='string'?m.group:null;o.locked=!!m.locked;
        }
      });
      Object.keys(meta.objects).forEach(function(id){if(!seenObjects.has(id))throw new Error('Manifest metadata refers to missing SVG object');});
      labelCounts.forEach(function(count,owner){if(count!==1||labelGroups.get(owner)!==1||!Object.hasOwn(meta.objects,owner)||meta.objects[owner].label===undefined)throw new Error('Invalid shape label metadata');});
      labelGroups.forEach(function(count,owner){if(count!==1||labelCounts.get(owner)!==1||!Object.hasOwn(meta.objects,owner)||meta.objects[owner].label===undefined)throw new Error('Invalid shape label metadata');});
      doc.pages.push(page);
    });
    return root.IlapoCore.validateDocument(doc);
  }
  var api={objectMarkup:objectMarkup,exportPage:exportPage,importSVG:importSVG,encodeProject:encodeProject,decodeProject:decodeProject}; root.IlapoSVG=api; if(typeof module==='object'&&module.exports)module.exports=api;
}(typeof globalThis!=='undefined'?globalThis:this));
