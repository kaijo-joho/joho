/* DOM adapter for editable graph data tables.  GraphTables owns validation. */
(function(root,factory){
  const tables=typeof module==='object'&&module.exports?require('./tables.js'):root.GraphTables;
  const api=factory(tables);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GraphTableEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(GraphTables){
  'use strict';
  const PAGE_SIZE=50,MAX_COLUMNS=20,MAX_ROWS=10000;
  if(!GraphTables)throw new Error('GraphTables を先に読み込んでください。');
  const make=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
  const button=(text,handler)=>{const element=make('button','graph-table-editor__button',text);element.type='button';element.addEventListener('click',handler);return element;};
  const label=(text,control)=>{const element=make('label','graph-table-editor__label',text);element.appendChild(control);return element;};
  const cloneTable=table=>({columns:table.columns.slice(),columnTypes:(table.columnTypes||table.columns.map(()=> 'number')).slice(),mapping:{...table.mapping},rows:table.rows.map(row=>row.map(value=>value===null?'':String(value)))});
  function mount(parent,series,options={}){
    if(!parent||typeof parent.appendChild!=='function')throw new TypeError('表編集を置く要素が必要です。');
    if(!series||!['data2d','data3d'].includes(series.kind))throw new Error('数表系列だけを編集できます。');
    const symbols={x:'x',y:'y',z:'z',...(options.symbols||{})},kind=series.kind;
    let table=cloneTable(GraphTables.fromSeries(series,symbols)),page=0,focusCell=null;
    let excludedRows=new Set(Array.isArray(series.excludedRows)?series.excludedRows.filter(index=>Number.isInteger(index)&&index>=0&&index<table.rows.length):[]);
    let focusedRow=Number.isInteger(options.selectedRow)&&options.selectedRow>=0&&options.selectedRow<table.rows.length?options.selectedRow:null;
    const selected=new Set();
    const root=make('section','graph-table-editor'),status=make('p','graph-table-editor__status');
    status.setAttribute('role','status');root.appendChild(status);parent.appendChild(root);
    const report=error=>{const message=error instanceof Error?error.message:String(error);status.textContent=message;if(typeof options.onError==='function')options.onError(error);};
    const clearReport=()=>{status.textContent='';};
    const pageCount=()=>Math.max(1,Math.ceil(table.rows.length/PAGE_SIZE));
    const ensurePage=()=>{page=Math.max(0,Math.min(page,pageCount()-1));};
    const blankRow=()=>Array(table.columns.length).fill('');
    function read(){
      try{
        const raw={columns:table.columns.slice(),columnTypes:table.columnTypes.slice(),mapping:{...table.mapping},rows:table.rows.map((row,rowIndex)=>row.map((value,columnIndex)=>GraphTables.cell(value,(rowIndex+1)+'行'+(columnIndex+1)+'列目',table.columnTypes[columnIndex])))};
        const valid=GraphTables.validate(raw,kind);
        // Keep this adapter's editable representation independent from the
        // renderer, while still exercising GraphTables' projection contract.
        GraphTables.project(valid,kind);
        clearReport();return valid;
      }catch(error){report(error);throw error;}
    }
    function replace(next){
      table=cloneTable(GraphTables.validate(next,kind));excludedRows.clear();selected.clear();focusedRow=null;page=0;clearReport();render();
    }
    function addColumns(required){
      if(table.columns.length+required>MAX_COLUMNS)throw new Error('数表は20列以内にしてください。');
      for(let count=0;count<required;count++){table.columns.push('列'+(table.columns.length+1));table.columnTypes.push('number');for(const row of table.rows)row.push('');}
    }
    function addRows(required){
      if(table.rows.length+required>MAX_ROWS)throw new Error('数表は10000行以内にしてください。');
      for(let count=0;count<required;count++)table.rows.push(blankRow());
    }
    function paste(event,rowIndex,columnIndex){
      const text=event.clipboardData&&event.clipboardData.getData('text/plain');
      if(!text||(!text.includes('\t')&&!/[\r\n]/.test(text)))return;
      event.preventDefault();
      try{
        const matrix=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));
        const width=Math.max(...matrix.map(row=>row.length));
        if(matrix.some(row=>row.length!==width))throw new Error('貼り付ける表の列数が一致しません。');
        const addColumnCount=Math.max(0,columnIndex+width-table.columns.length),addRowCount=Math.max(0,rowIndex+matrix.length-table.rows.length);
        // Check both dimensions before changing a draft, so an oversized paste
        // never leaves a partially expanded table behind.
        if(table.columns.length+addColumnCount>MAX_COLUMNS)throw new Error('数表は20列以内にしてください。');
        if(table.rows.length+addRowCount>MAX_ROWS)throw new Error('数表は10000行以内にしてください。');
        addColumns(addColumnCount);addRows(addRowCount);
        matrix.forEach((row,offset)=>row.forEach((value,columnOffset)=>{table.rows[rowIndex+offset][columnIndex+columnOffset]=value;}));
        clearReport();render();
      }catch(error){report(error);}
    }
    function mappingControl(key,text){
      const select=make('select','graph-table-editor__mapping');
      select.setAttribute('aria-label',text+'の列');
      const unused=make('option','',key==='x'||key==='y'||key==='z'?'選択してください':'未使用');unused.value='';select.appendChild(unused);
      table.columns.forEach((name,index)=>{const option=make('option','',name);option.value=String(index);select.appendChild(option);});
      select.value=table.mapping[key]===null?'':String(table.mapping[key]);
      if((kind==='data3d'&&(key==='errorX'||key==='errorY'))||(kind==='data2d'&&key==='z'))select.disabled=true;
      select.addEventListener('change',()=>{table.mapping[key]=select.value===''?null:Number(select.value);});
      return label(text,select);
    }
    function updateColumnName(index,value){
      table.columns[index]=value;
      root.querySelectorAll('.graph-table-editor__mapping option[value="'+index+'"]').forEach(option=>{option.textContent=value;});
    }
    function render(){
      root.replaceChildren();ensurePage();
      const tools=make('div','graph-table-editor__tools');
      tools.append(button('行を追加',()=>{try{const rowIndex=table.rows.length;addRows(1);page=pageCount()-1;focusCell={row:rowIndex+1,column:0};clearReport();render();}catch(error){report(error);}}));
      tools.append(button('選択行を削除',()=>{if(!selected.size)return;const removed=new Set(selected),nextRows=[],remap=new Map();table.rows.forEach((row,index)=>{if(removed.has(index))return;remap.set(index,nextRows.length);nextRows.push(row);});table.rows=nextRows;excludedRows=new Set([...excludedRows].filter(index=>remap.has(index)).map(index=>remap.get(index)));if(focusedRow!==null)focusedRow=remap.has(focusedRow)?remap.get(focusedRow):null;selected.clear();clearReport();render();}));
      const useSelected=button('選択行を回帰に使用',()=>{selected.forEach(index=>excludedRows.delete(index));render();});
      const excludeSelected=button('選択行を回帰から除外',()=>{selected.forEach(index=>excludedRows.add(index));render();});
      const useAll=button('全行を回帰に使用',()=>{excludedRows.clear();render();});
      const regressionTools=make('details','graph-table-editor__regression-tools'),regressionSummary=make('summary','', '回帰に使う行の設定'); regressionTools.append(regressionSummary,useSelected,excludeSelected,useAll);tools.append(regressionTools);
      tools.append(button('列を追加',()=>{try{addColumns(1);clearReport();render();}catch(error){report(error);}}));
      tools.append(button('最後の列を削除',()=>{
        const index=table.columns.length-1,minimum=kind==='data3d'?3:2;
        if(table.columns.length<=minimum){report(new Error('座標列を削除できません。'));return;}
        if(['x','y','z'].some(key=>table.mapping[key]===index)){report(new Error('座標に割り当てた列は削除できません。'));return;}
        for(const key of ['errorX','errorY'])if(table.mapping[key]===index)table.mapping[key]=null;
        table.columns.pop();table.columnTypes.pop();table.rows.forEach(row=>row.pop());clearReport();render();
      }));root.appendChild(tools);
      const mappings=make('div','graph-table-editor__mappings');
      mappings.append(mappingControl('x','横軸'),mappingControl('y','縦軸'));
      if(kind==='data3d')mappings.append(mappingControl('z','奥行き'));
      else mappings.append(mappingControl('errorX','横誤差'),mappingControl('errorY','縦誤差'));
      root.appendChild(mappings);
      const wrap=make('div','graph-table-editor__table-wrap'),grid=make('table','graph-table-editor__table'),head=make('thead'),header=make('tr');
      const all=make('input','');all.type='checkbox';all.setAttribute('aria-label','このページの行をすべて選択');
      const start=page*PAGE_SIZE,end=Math.min(table.rows.length,start+PAGE_SIZE),shown=table.rows.slice(start,end);
      all.checked=shown.length>0&&shown.every((_,offset)=>selected.has(start+offset));
      all.addEventListener('change',()=>{shown.forEach((_,offset)=>all.checked?selected.add(start+offset):selected.delete(start+offset));render();});
      const selector=make('th','');selector.scope='col';selector.appendChild(all);header.appendChild(selector);
      table.columns.forEach((name,index)=>{const th=make('th',''),input=make('input',''),type=make('select','graph-table-editor__column-type');th.scope='col';input.type='text';input.maxLength=80;input.value=name;input.setAttribute('aria-label',(index+1)+'列目の名前');input.addEventListener('input',()=>updateColumnName(index,input.value));for(const pair of [['number','数値'],['date','日付'],['category','カテゴリ']]){const option=make('option','',pair[1]);option.value=pair[0];type.appendChild(option);}type.value=table.columnTypes[index];type.setAttribute('aria-label',(index+1)+'列目の種類');type.addEventListener('change',()=>{table.columnTypes[index]=type.value;root.querySelectorAll('[data-column="'+index+'"]').forEach(input=>{input.inputMode=type.value==='number'?'decimal':'text';});});th.append(input,type);header.appendChild(th);});
      head.appendChild(header);grid.appendChild(head);
      const body=make('tbody');
      shown.forEach((row,offset)=>{const rowIndex=start+offset,tr=make('tr',focusedRow===rowIndex?'graph-table-editor__focused-row':''),th=make('th',''),check=make('input',''),exclude=make('input','');th.scope='row';check.type='checkbox';check.checked=selected.has(rowIndex);check.setAttribute('aria-label',(rowIndex+1)+'行目を選択');check.addEventListener('change',()=>{check.checked?selected.add(rowIndex):selected.delete(rowIndex);});exclude.type='checkbox';exclude.checked=!excludedRows.has(rowIndex);exclude.className='graph-table-editor__regression-checkbox';exclude.setAttribute('aria-label',(rowIndex+1)+'行目を回帰に使用');exclude.title='回帰に使用';exclude.addEventListener('change',()=>{exclude.checked?excludedRows.delete(rowIndex):excludedRows.add(rowIndex);});th.appendChild(check);th.appendChild(document.createTextNode(String(rowIndex+1)));th.appendChild(exclude);tr.appendChild(th);
        row.forEach((value,columnIndex)=>{const td=make('td',''),input=make('input','');input.type='text';input.inputMode=table.columnTypes[columnIndex]==='number'?'decimal':'text';input.dataset.column=columnIndex;input.value=value;input.setAttribute('aria-label',(rowIndex+1)+'行'+(columnIndex+1)+'列');input.addEventListener('focus',()=>{focusedRow=rowIndex;if(typeof options.onRowSelect==='function')options.onRowSelect(rowIndex);});input.addEventListener('input',()=>{table.rows[rowIndex][columnIndex]=input.value;});input.addEventListener('paste',event=>paste(event,rowIndex,columnIndex));input.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const nextRow=rowIndex+1;if(nextRow>=table.rows.length)return;if(nextRow>=start+PAGE_SIZE){page=Math.floor(nextRow/PAGE_SIZE);render();}const next=root.querySelector('[data-cell="'+(nextRow+1)+','+columnIndex+'"]');if(next)next.focus();});input.dataset.cell=(rowIndex+1)+','+columnIndex;td.appendChild(input);tr.appendChild(td);});body.appendChild(tr);});
      grid.appendChild(body);wrap.appendChild(grid);root.appendChild(wrap);
      const pager=make('div','graph-table-editor__pager');pager.append(button('前の50行',()=>{page--;render();}));pager.append(make('span','', (table.rows.length?start+1:0)+'〜'+end+'行 / '+table.rows.length+'行'));pager.append(button('次の50行',()=>{page++;render();}));pager.children[0].disabled=page===0;pager.children[2].disabled=page>=pageCount()-1;root.appendChild(pager);
      const details=make('details','graph-table-editor__import'),summary=make('summary','','CSV・TSVを貼り付け');details.appendChild(summary);const textarea=make('textarea','');textarea.setAttribute('aria-label','CSV・TSVを貼り付け');details.appendChild(textarea);details.append(button('表に取り込む',()=>{try{if(!textarea.value.trim())throw new Error('CSV・TSVを入力してから表に取り込んでください。');replace(GraphTables.parse(textarea.value,kind));}catch(error){report(error);}}));root.appendChild(details);
      root.appendChild(status);
      if(focusCell){const target=root.querySelector('[data-cell="'+focusCell.row+','+focusCell.column+'"]');if(target)target.focus();focusCell=null;}
    }
    function getExcludedRows(){return [...excludedRows].sort((a,b)=>a-b);}
    function getSelectedRow(){return focusedRow;}
    function focusRow(index){if(!Number.isInteger(index)||index<0||index>=table.rows.length)return false;focusedRow=index;page=Math.floor(index/PAGE_SIZE);render();const target=root.querySelector('[data-cell="'+(index+1)+',0"]');if(target)target.focus();if(typeof options.onRowSelect==='function')options.onRowSelect(index);return true;}
    render();if(focusedRow!==null)focusRow(focusedRow);return {read,replace,element:root,getExcludedRows,getSelectedRow,focusRow};
  }
  return {mount};
});
