/* 軸を見ながら変更する書式パネル。変更と履歴管理はエディタへ委ねる。 */
(function (root) {
  'use strict';
  function render(parent, options) {
    const {axis, title, values, ticks, labelPosition, onStyle, onAxis, onPreview, onCancel, onError, onDetail, onReset} = options;
    const doc=parent.ownerDocument,U=root.GraphStyleUI;
    const node=(tag,text,attrs={})=>{const el=doc.createElement(tag);if(text!=null)el.textContent=text;for(const[key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;};
    const attempt=action=>{try{action();}catch(error){onError(error);}};
    const button=(text,label,action,attrs={})=>{const el=node('button',text,{type:'button','aria-label':label,...attrs});el.addEventListener('click',()=>attempt(action));return el;};
    parent.replaceChildren();parent.hidden=false;parent.classList.remove('has-colors');
    parent.dataset.selectionKey='axis:'+options.viewId+':'+options.key;
    const header=node('div',null,{class:'axis-inspector-heading'}),detail=button(null,'軸の詳細設定',onDetail,{'data-quick-control':'axis-detail',class:'icon-button','aria-haspopup':'dialog','data-tip':'軸の詳細設定'});
    detail.append(root.GraphIcons.create('edit',doc));header.append(node('strong',title),detail);parent.append(header);
    const section=(name)=>{const el=node('fieldset',null,{class:'axis-style-section'});el.append(node('legend',name));parent.append(el);return el;};
    function palette(parent,key,label){
      const heading=node('div',null,{class:'axis-color-heading'});heading.append(node('span',label,{class:'axis-field-label'}));parent.append(heading);
      const colors=node('div',null,{class:'quick-palette axis-palette',role:'group','aria-label':label});parent.append(colors);
      const current=axis.style?.[key]??null;
      const sync=value=>{auto.setAttribute('aria-pressed',String(value===null));for(const el of colors.querySelectorAll('[data-axis-color]'))el.setAttribute('aria-pressed',String(el.dataset.axisColor===value));U.sync(colors.querySelector('input'),value||values[key]);};
      const apply=value=>{onStyle({[key]:value});sync(value);};
      const auto=button('自動',label+'を自動にする',()=>apply(null),{'aria-pressed':String(current===null),'data-quick-control':'axis-'+key+'-auto',class:'axis-auto-color'});heading.append(auto);
      for(const[value,name]of [['#2563eb','青'],['#dc2626','赤'],['#16a34a','緑'],['#9333ea','紫'],['#111827','黒']]){
        const el=button(null,label+'：'+name,()=>apply(value),{class:'quick-color','aria-pressed':String(current===value),'data-axis-color':value,'data-quick-control':'axis-'+key+'-'+value.slice(1)});el.style.setProperty('--swatch-color',value);el.append(node('span',null,{'aria-hidden':'true'}));colors.append(el);
      }
      colors.append(U.color(current||values[key],value=>attempt(()=>apply(value)),{key:'axis-'+key+'-rgb',label:label+'（RGB）',document:doc}));
    }
    function range(parent,key,label){U.range(parent,{label,value:values[key],min:.5,max:10,step:.5,key:'axis-'+key,onCommit:value=>onStyle({[key]:value}),onPreview:value=>onPreview({[key]:value}),onCancel,onError});}
    function check(parent,key,label){const wrap=node('label',null,{class:'check'}),input=node('input',null,{type:'checkbox','data-quick-control':'axis-'+key});input.checked=values[key];wrap.append(input,doc.createTextNode(label));parent.append(wrap);input.addEventListener('change',()=>{try{onStyle({[key]:input.checked});}catch(error){input.checked=!input.checked;onError(error);}});return input;}
    const line=section('軸線');palette(line,'color','軸の色');range(line,'width','軸の太さ');
    const tickSection=section('目盛');check(tickSection,'tickMarks','目盛の線を表示');check(tickSection,'tickLabels','目盛の数値を表示');
    function field(parent,label,key,el,value,read){
      const wrap=node('label',null,{class:'axis-inspector-field'});wrap.append(node('span',label),el);parent.append(wrap);el.setAttribute('aria-label',label);el.dataset.quickControl='axis-'+key;el.value=value;let committed=value;
      el.addEventListener('change',()=>{try{onAxis(key,read(el.value));committed=el.value;}catch(error){el.value=committed;onError(error);}});return el;
    }
    if(ticks){
      field(tickSection,'目盛の間隔（空欄で自動）','step',node('input',null,{type:'text',maxlength:100,placeholder:'例：1、1/2、π/2',spellcheck:'false'}),ticks.step??'',value=>value);
      const format=node('select');for(const[value,label]of [['auto','自動'],['decimal','小数'],['fraction','分数'],['pi','π の倍数']])format.append(node('option',label,{value}));
      field(tickSection,'目盛の表記','format',format,ticks.format||'auto',value=>value);
    }
    if(labelPosition){
      const position=node('select');for(const[value,label]of [['axis','軸の近く'],['edge',options.key==='x'?'全体の下':'全体の左']])position.append(node('option',label,{value}));
      field(tickSection,'目盛の数値の位置','labelPosition',position,labelPosition,value=>value);
    }
    const grid=section('グリッド');check(grid,'grid','グリッドを表示');palette(grid,'gridColor','グリッドの色');range(grid,'gridWidth','グリッドの太さ');
    if(options.gridDashAllowed!==false)U.dash(grid,{label:'グリッドの線種',value:values.gridDash,key:'axis-gridDash',onChange:value=>attempt(()=>onStyle({gridDash:value}))});
    else grid.append(node('p','3Dのグリッドは実線で表示します。',{class:'small muted'}));
    parent.append(button('軸の書式を標準に戻す','軸の書式を標準に戻す',onReset,{class:'full-button','data-quick-control':'axis-reset'}));
  }
  root.GraphAxisInspector=Object.freeze({render});
}(typeof globalThis!=='undefined'?globalThis:this));
