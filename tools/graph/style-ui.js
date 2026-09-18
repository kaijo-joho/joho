/* 書式の直接操作。数値入力・線の見本・ブラウザの色選択を共用する。 */
(function (root) {
  'use strict';
  const controls=new WeakMap();
  function node(doc,tag,text,attrs={}){const element=doc.createElement(tag);if(text!==null)element.textContent=text;for(const[key,value]of Object.entries(attrs))element.setAttribute(key,value);return element;}
  function range(parent,{label,value,min,max,step,key,onCommit=()=>{},onPreview=()=>{},onCancel=()=>{},onError=()=>{}}){
    const doc=parent.ownerDocument,box=node(doc,'div',null,{class:'style-range'}),heading=node(doc,'div',null,{class:'style-range-heading'});
    const number=node(doc,'input',null,{type:'number',min,max,step:'any','aria-label':label}),slider=node(doc,'input',null,{type:'range',min,max,step,'aria-label':label+'（スライダー）'});
    if(key){number.dataset.quickControl=key;slider.dataset.quickControl=key+'-slider';}
    heading.append(node(doc,'span',label),number);box.append(heading,slider);parent.append(box);let committed=value;
    function sync(next){committed=next;number.value=next===null?'':next;number.defaultValue=number.value;number.placeholder=next===null?'混在':'';slider.value=next===null?min:next;slider.setAttribute('aria-valuetext',next===null?'混在':String(next));}
    function commit(){try{if(number.value.trim()===''||!Number.isFinite(Number(number.value)))throw new Error('数値を入力してください。');const next=Number(number.value);if(next<min||next>max)throw new Error(label+'は'+min+'〜'+max+'で指定してください。');onCommit(next);sync(next);}catch(error){sync(committed);onCancel();onError(error);}}
    slider.addEventListener('input',()=>{number.value=slider.value;slider.setAttribute('aria-valuetext',number.value);onPreview(Number(slider.value));});
    slider.addEventListener('change',commit);
    slider.addEventListener('pointercancel',()=>{sync(committed);onCancel();});
    number.addEventListener('input',()=>{const next=Number(number.value);if(number.value.trim()!==''&&Number.isFinite(next)&&next>=min&&next<=max){slider.value=next;slider.setAttribute('aria-valuetext',number.value);}});
    number.addEventListener('change',commit);
    for(const input of [number,slider])input.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();sync(committed);onCancel();}});
    controls.set(number,{sync});sync(value);return number;
  }
  function dash(parent,{label='線種',value,key,onChange=()=>{}}){
    const doc=parent.ownerDocument,box=node(doc,'div',null,{class:'style-dash'}),group=node(doc,'div',null,{class:'style-dash-buttons',role:'group','aria-label':label});
    box.append(node(doc,'span',label),group);parent.append(box);if(key)group.dataset.quickControl=key;
    function sync(next){group.value=next;for(const button of group.children)button.setAttribute('aria-pressed',String(button.dataset.dash===next));}
    for(const [kind,name]of [['solid','実線'],['dash','破線'],['dot','点線']]){
      const button=node(doc,'button',null,{type:'button','aria-label':name,'data-tip':name,'data-dash':kind});if(key)button.dataset.quickControl=key+'-'+kind;
      button.append(root.GraphIcons.create('line-'+kind,doc));button.addEventListener('click',()=>{onChange(kind);sync(kind);});group.append(button);
    }
    controls.set(group,{sync});sync(value);return group;
  }
  function color(value,onChange,{key='custom-color',label='自由な色（RGB）',document:doc=root.document}={}){
    const wrap=node(doc,'label',null,{class:'quick-color custom-color direct-color','data-tip':'自由な色・RGBで指定'}),input=node(doc,'input',null,{type:'color','aria-label':label,'data-quick-control':key});
    const swatch=node(doc,'span',null,{'aria-hidden':'true'});wrap.append(swatch,input);
    function sync(next){input.value=next||'#2563eb';wrap.style.setProperty('--swatch-color',next||'#64748b');}
    input.addEventListener('change',()=>{onChange(input.value);sync(input.value);});controls.set(input,{sync});sync(value);return wrap;
  }
  function sync(element,value){if(controls.has(element)){controls.get(element).sync(value);return true;}return false;}
  root.GraphStyleUI=Object.freeze({range,dash,color,sync});
}(typeof globalThis!=='undefined'?globalThis:this));
