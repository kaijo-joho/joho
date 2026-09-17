/* DOM adapter for editable graph data tables.  GraphTables owns validation. */
(function(root,factory){
  const tables=typeof module==='object'&&module.exports?require('./tables.js'):root.GraphTables;
  const api=factory(tables);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GraphTableEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(GraphTables){
  'use strict';
  const PAGE_SIZE=50,MAX_COLUMNS=20,MAX_ROWS=10000;
  const REFERENCE_LABELS={row:'（同じ行）',prev:'（1行前）',next:'（1行後）',all:'（列全体）'};
  const AGGREGATE_MENU=[['SUM','合計'],['AVERAGE','平均'],['MIN','最小'],['MAX','最大'],['COUNT','数値の個数'],['STDEV.P','母標準偏差（n）'],['STDEV.S','標本標準偏差（n−1）']];
  if(!GraphTables)throw new Error('GraphTables を先に読み込んでください。');
  const make=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
  const button=(text,handler,icon)=>{const element=make('button','graph-table-editor__button');element.type='button';
    // GraphIcons is loaded after this module, so resolve it only when a control is made.
    const icons=typeof globalThis!=='undefined'&&globalThis.GraphIcons;
    if(icon&&icons&&typeof icons.create==='function'){
      element.append(icons.create(icon,document));
      if(icon==='trash'){element.classList.add('graph-table-editor__icon-button');element.setAttribute('aria-label',text);element.title=text;}
      else element.append(make('span','',text));
    }
    else element.textContent=text;
    element.addEventListener('click',handler);return element;};
  const label=(text,control)=>{const element=make('label','graph-table-editor__label',text);element.appendChild(control);return element;};
  const cloneTable=table=>({columns:table.columns.slice(),columnTypes:(table.columnTypes||table.columns.map(()=> 'number')).slice(),formulas:Array.isArray(table.formulas)?table.formulas.slice():table.columns.map(()=>null),mapping:{...table.mapping},rows:table.rows.map(row=>row.map(value=>value===null?'':String(value)))});
  function mount(parent,series,options={}){
    if(!parent||typeof parent.appendChild!=='function')throw new TypeError('表編集を置く要素が必要です。');
    if(!series||!['data2d','data3d'].includes(series.kind))throw new Error('数表系列だけを編集できます。');
    const symbols={x:'x',y:'y',z:'z',...(options.symbols||{})},kind=series.kind;
    let table=cloneTable(GraphTables.fromSeries(series,symbols)),page=0,focusCell=null,calculationDraft=null,calculationErrorMap=new Map(),refreshCalculationPreview=null;
    const calculations=()=>typeof globalThis!=='undefined'&&globalThis.GraphCalculations?globalThis.GraphCalculations:null;
    const computed=index=>typeof table.formulas[index]==='string'&&table.formulas[index].trim()!=='';
    function displayValue(value){
      if(value===null||value==='')return '';
      const number=Number(value);
      return Number.isFinite(number)?String(Number(number.toPrecision(8))):String(value);
    }
    const numericDraft=source=>({...source,rows:source.rows.map((row,r)=>row.map((value,c)=>source.formulas[c]?null:GraphTables.cell(value,(r+1)+'行'+(c+1)+'列目',source.columnTypes[c])))});
    const checkedCandidate=source=>GraphTables.recalculate(numericDraft(source),kind);
    function refreshCalculations(){
      calculationErrorMap=new Map();
      if(!table.formulas.some(Boolean))return;
      try{
        const result=checkedCandidate(table);
        // Preserve raw input text and its caret while only derived cells change.
        table.rows.forEach((row,r)=>row.forEach((_,c)=>{
          if(computed(c))row[c]=result.table.rows[r][c]===null?'':String(result.table.rows[r][c]);
        }));
        result.errors.forEach(error=>calculationErrorMap.set(error.row+','+error.column,error));
      }catch(error){calculationErrorMap.set('global',error);}
    }
    function showComputedCell(input,row,column){
      const error=calculationErrorMap.get('global')||calculationErrorMap.get(row+','+column);
      input.value=error?'エラー':displayValue(table.rows[row][column]);
      input.title=error?error.message:table.formulas[column];
      input.setAttribute('aria-invalid',String(!!error));
      input.setAttribute('aria-description',error?error.message:'計算結果。列見出しから式を編集できます。');
    }
    function updateComputedCells(){
      root.querySelectorAll('.graph-table-editor__computed-cell').forEach(input=>{
        const [row,column]=input.dataset.cell.split(',').map(Number);
        showComputedCell(input,row-1,column);
      });
      const summary=root.querySelector('.graph-table-editor__calculation-status');
      if(summary){
        const globalError=calculationErrorMap.get('global');
        let selectedError;
        const focused=root.querySelector('.graph-table-editor__computed-cell:focus');
        if(focused){const [row,column]=focused.dataset.cell.split(',').map(Number);selectedError=calculationErrorMap.get((row-1)+','+column);}
        const error=selectedError||calculationErrorMap.values().next().value;
        summary.textContent=globalError?globalError.message:error?'計算エラー '+calculationErrorMap.size+'件。'+(error.row+1)+'行目・'+table.columns[error.column]+'：'+error.message+' エラーのセルを選ぶと、その理由を確認できます。':'';
      }
    }
    let excludedRows=new Set(Array.isArray(series.excludedRows)?series.excludedRows.filter(index=>Number.isInteger(index)&&index>=0&&index<table.rows.length):[]);
    let focusedRow=Number.isInteger(options.selectedRow)&&options.selectedRow>=0&&options.selectedRow<table.rows.length?options.selectedRow:null;
    const selected=new Set();
    let mappingOpen=false;
    const root=make('section','graph-table-editor'),status=make('p','graph-table-editor__status');
    status.setAttribute('role','status');root.appendChild(status);parent.appendChild(root);
    const report=error=>{const message=error instanceof Error?error.message:String(error);status.textContent=message;if(typeof options.onError==='function')options.onError(error);};
    const clearReport=()=>{status.textContent='';};
    const pageCount=()=>Math.max(1,Math.ceil(table.rows.length/PAGE_SIZE));
    const ensurePage=()=>{page=Math.max(0,Math.min(page,pageCount()-1));};
    const blankRow=()=>Array(table.columns.length).fill('');
    function read(){
      try{
        if(calculationDraft)throw new Error('計算列の設定が未適用です。計算列の「適用」または「取消」を押してください。');
        const valid=GraphTables.validate(numericDraft(table),kind);
        clearReport();return valid;
      }catch(error){report(error);throw error;}
    }
    function replace(next){
      if(calculationDraft)throw new Error('先に計算列の設定を適用または取り消してください。');
      table=cloneTable(GraphTables.validate(next,kind));excludedRows.clear();selected.clear();focusedRow=null;page=0;clearReport();render();
    }
    function addColumns(required){
      if(table.columns.length+required>MAX_COLUMNS)throw new Error('数表は20列以内にしてください。');
      for(let count=0;count<required;count++){table.columns.push('列'+(table.columns.length+1));table.columnTypes.push('number');table.formulas.push(null);for(const row of table.rows)row.push('');}
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
        for(let c=columnIndex;c<columnIndex+width;c++)if(computed(c))throw new Error('計算列への貼り付けはできません。');
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
    function mappingDescription(){return [['x','横'],['y','縦'],...(kind==='data3d'?[['z','奥行き']]:[])].map(([key,label])=>label+'：'+(table.columns[table.mapping[key]]||'未選択')).join(' / ');}
    function updateColumnName(index,value){
      const oldName=table.columns[index],name=value.trim(),candidate=cloneTable(table);
      candidate.columns[index]=name;
      if(oldName!==name&&candidate.formulas.some(Boolean)){
        candidate.formulas=candidate.formulas.map(formula=>formula?calculations().renameReferences(formula,oldName,name):null);
      }
      checkedCandidate(candidate);
      table=candidate;
      if(calculationDraft&&oldName!==name){
        try{calculationDraft.formula=calculations().renameReferences(calculationDraft.formula,oldName,name);}catch{}
        const input=root.querySelector('[aria-label="計算式"]');if(input)input.value=calculationDraft.formula;
      }
      root.querySelectorAll('.graph-table-editor__mapping option[value="'+index+'"]').forEach(option=>{option.textContent=name;});
      const description=root.querySelector('.graph-table-editor__mapping-description');if(description)description.textContent=mappingDescription();
      root.querySelectorAll('[data-reference-column="'+index+'"]').forEach(option=>{option.textContent=name+(REFERENCE_LABELS[option.dataset.referenceMode]||'');});
      root.querySelector('[aria-label="前後参照の列"]')?.dispatchEvent(new Event('input'));
      refreshCalculations();updateComputedCells();if(refreshCalculationPreview)refreshCalculationPreview();clearReport();
    }
    function beginCalculation(index){
      if(calculationDraft){report(new Error('先に計算列の設定を適用または取り消してください。'));return;}
      let name='計算列',count=1;while(table.columns.includes(name))name='計算列 '+(++count);
      calculationDraft={index,name:index===null?name:table.columns[index],formula:index===null?'':table.formulas[index]};
      render();root.querySelector('[aria-label="計算式"]').focus();
    }
    function calculationCandidate(){
      const {index,formula}=calculationDraft,name=calculationDraft.name.trim(),candidate=cloneTable(table);
      if(!name)throw new Error('計算列の名前を入力してください。');
      if(!formula.trim())throw new Error('計算式を入力してください。');
      if(index===null){
        if(candidate.columns.length>=MAX_COLUMNS)throw new Error('数表は20列以内にしてください。');
        candidate.columns.push(name);candidate.columnTypes.push('number');candidate.formulas.push(formula);
        candidate.rows.forEach(row=>row.push(''));
      }else{
        const oldName=candidate.columns[index];
        candidate.formulas[index]=formula;
        if(oldName!==name)candidate.formulas=candidate.formulas.map(item=>item?calculations().renameReferences(item,oldName,name):null);
        candidate.columns[index]=name;
      }
      return checkedCandidate(candidate);
    }
    function calculationPanel(){
      const draft=calculationDraft,panel=make('div','graph-table-editor__calculation-panel');
      panel.appendChild(make('h3','',draft.index===null?'計算列を追加':'計算列を編集'));
      panel.appendChild(make('p','graph-table-editor__calculation-lead','式を確認してから適用します。取消すれば、この編集内容は表へ反映されません。'));
      const nameInput=make('input','');nameInput.type='text';nameInput.maxLength=80;nameInput.value=draft.name;nameInput.setAttribute('aria-label','計算列の名前');
      const formula=make('textarea','');formula.rows=2;formula.maxLength=1000;formula.value=draft.formula;formula.setAttribute('aria-label','計算式');
      panel.append(label('名前',nameInput),label('式',formula));
      panel.appendChild(make('p','graph-table-editor__calculation-help','[@列名] は同じ行、[@列名,-1] は1行前、[列名] は列全体。行の範囲も集計できます。'));
      const menus=make('div','graph-table-editor__calculation-menus'),colSelect=make('select',''),fnSelect=make('select','');
      function placeholder(select,text){const option=make('option','',text);option.value='';select.appendChild(option);}
      colSelect.setAttribute('aria-label','列を式へ挿入');placeholder(colSelect,'列を挿入…');
      table.columns.forEach((name,i)=>{
        if(table.columnTypes[i]!=='number')return;
        for(const mode of ['row','prev','next','all']){
          const option=make('option','',name+REFERENCE_LABELS[mode]);
          option.value=mode+':'+i;option.dataset.referenceColumn=i;option.dataset.referenceMode=mode;colSelect.appendChild(option);
        }
      });
      colSelect.addEventListener('change',()=>{
        if(!colSelect.value)return;
        const [mode,rawIndex]=colSelect.value.split(':'),i=Number(rawIndex);
        formula.setRangeText(calculations().reference(table.columns[i],mode!=='all',mode==='prev'?-1:mode==='next'?1:0),formula.selectionStart,formula.selectionEnd,'end');
        formula.dispatchEvent(new Event('input'));colSelect.value='';formula.focus();
      });
      fnSelect.setAttribute('aria-label','関数を式へ挿入');placeholder(fnSelect,'関数を挿入…');
      for(const [value,text] of [...AGGREGATE_MENU,['sqrt','平方根'],['ln','自然対数'],['log','常用対数'],['abs','絶対値']]){
        const option=make('option','',text);option.value=value;fnSelect.appendChild(option);
      }
      fnSelect.addEventListener('change',()=>{
        if(!fnSelect.value)return;
        const start=formula.selectionStart,end=formula.selectionEnd,fn=fnSelect.value;
        formula.setRangeText(fn+'('+formula.value.slice(start,end)+')',start,end,'end');
        formula.setSelectionRange(start+fn.length+1,start+fn.length+1+end-start);
        formula.dispatchEvent(new Event('input'));fnSelect.value='';formula.focus();
      });
      menus.append(colSelect,fnSelect);panel.appendChild(menus);
      panel.appendChild(relativeReferencePanel(draft,formula));
      const preview=make('div','graph-table-editor__calculation-preview');panel.appendChild(preview);
      function updatePreview(){
        draft.name=nameInput.value;draft.formula=formula.value;
        if(!draft.formula.trim()){preview.textContent='式を入力すると先頭5行を確認できます。';return;}
        try{
          const result=calculationCandidate(),column=draft.index===null?result.table.columns.length-1:draft.index;
          preview.replaceChildren(make('strong','','先頭5行のプレビュー'));
          result.table.rows.slice(0,5).forEach((row,i)=>{
            const error=result.errors.find(item=>item.row===i&&item.column===column);
            preview.appendChild(make('div',error?'error':'',(i+1)+'行目: '+(error?'エラー（'+error.message+'）':displayValue(row[column])||'—')));
          });
          if(result.errors.length)preview.appendChild(make('p','error','表全体に計算エラー '+result.errors.length+'件があります。'));
          if(!result.table.rows.length)preview.appendChild(make('p','','入力行を追加すると計算結果を表示します。'));
        }catch(error){preview.replaceChildren(make('p','error',error.message));}
      }
      refreshCalculationPreview=updatePreview;
      formula.addEventListener('input',event=>{draft.formula=formula.value;if(!event.isComposing)updatePreview();});
      formula.addEventListener('compositionend',updatePreview);
      nameInput.addEventListener('input',event=>{draft.name=nameInput.value;if(!event.isComposing)updatePreview();});
      nameInput.addEventListener('compositionend',updatePreview);updatePreview();
      const actions=make('div','graph-table-editor__calculation-actions');
      actions.append(button('適用',()=>{
        try{
          draft.name=nameInput.value;draft.formula=formula.value;
          const result=calculationCandidate();table=cloneTable(result.table);calculationDraft=null;clearReport();render();
        }catch(error){report(error);}
      },'save'),button('取消',()=>{calculationDraft=null;clearReport();render();},'close'));
      panel.appendChild(actions);return panel;
    }
    function relativeReferencePanel(draft,formula){
      const settings=draft.relative||(draft.relative={column:table.columnTypes.findIndex((type,i)=>type==='number'&&i!==draft.index),mode:'single',offset:'-1',start:'-2',end:'0',aggregate:'AVERAGE',open:false});
      const details=make('details','graph-table-editor__relative'),summary=make('summary','','行・範囲を指定…');
      details.open=settings.open;details.appendChild(summary);
      details.addEventListener('toggle',()=>{settings.open=details.open;});
      const fields=make('div','graph-table-editor__relative-fields'),column=make('select',''),mode=make('select',''),aggregate=make('select','');
      column.setAttribute('aria-label','前後参照の列');
      table.columns.forEach((name,i)=>{
        if(table.columnTypes[i]!=='number'||i===draft.index)return;
        const option=make('option','',name);option.value=String(i);option.dataset.referenceColumn=i;column.appendChild(option);
      });
      column.value=String(settings.column);
      mode.setAttribute('aria-label','参照する行');
      for(const [value,text] of [['single','1行を参照'],['window','範囲を集計']]){const option=make('option','',text);option.value=value;mode.appendChild(option);}
      mode.value=settings.mode;
      aggregate.setAttribute('aria-label','範囲の集計方法');
      for(const [value,text] of AGGREGATE_MENU){const option=make('option','',text);option.value=value;aggregate.appendChild(option);}
      aggregate.value=settings.aggregate;
      function offsetInput(key,text){
        const input=make('input','');input.type='number';input.min='-10000';input.max='10000';input.step='1';input.required=true;input.value=settings[key];input.setAttribute('aria-label',text);return input;
      }
      const offset=offsetInput('offset','何行前・後'),start=offsetInput('start','範囲の先頭（前・後）'),end=offsetInput('end','範囲の末尾（前・後）');
      const oneField=label('何行前・後',offset),startField=label('範囲の先頭',start),endField=label('範囲の末尾',end),aggregateField=label('集計方法',aggregate);
      fields.append(label('列',column),label('参照する行',mode),oneField,startField,endField,aggregateField);
      const example=make('code','graph-table-editor__reference-example'),message=make('p','graph-table-editor__calculation-help');
      const insert=button('式へ挿入',()=>{
        try{
          const text=snippet();formula.setRangeText(text,formula.selectionStart,formula.selectionEnd,'end');
          formula.dispatchEvent(new Event('input'));formula.focus();
        }catch(error){message.textContent=error.message;}
      });
      function readOffset(input){
        const value=Number(input.value);
        if(!input.value.trim()||!Number.isInteger(value)||Math.abs(value)>10000)throw new Error('前後の行数は−10000〜10000の整数で指定してください。');
        return value;
      }
      function snippet(){
        if(column.value===''||!table.columns[Number(column.value)])throw new Error('参照する数値列を選んでください。');
        const name=table.columns[Number(column.value)];
        if(mode.value==='single')return calculations().reference(name,true,readOffset(offset));
        const first=readOffset(start),last=readOffset(end);
        if(first>last)throw new Error('範囲の先頭は末尾以下にしてください。');
        return aggregate.value+'('+calculations().reference(name,true,first,last)+')';
      }
      function update(){
        Object.assign(settings,{column:column.value===''?-1:Number(column.value),mode:mode.value,offset:offset.value,start:start.value,end:end.value,aggregate:aggregate.value});
        const window=mode.value==='window';oneField.hidden=window;offset.disabled=window;
        for(const [field,input] of [[startField,start],[endField,end],[aggregateField,aggregate]]){field.hidden=!window;input.disabled=!window;}
        try{example.textContent=snippet();message.textContent='表の外を参照する行や、範囲が表からはみ出す行の結果は空欄になります。';insert.disabled=false;}
        catch(error){example.textContent='';message.textContent=error.message;insert.disabled=true;}
      }
      for(const input of [column,mode,aggregate,offset,start,end])input.addEventListener('input',update);
      details.append(fields,make('p','graph-table-editor__calculation-help','−1 は1行前、0 は同じ行、+1 は1行後。範囲は両端を含み、空欄や回帰から除外した行も数えます。'),example,message,insert);
      update();return details;
    }
    function render(){
      refreshCalculationPreview=null;root.replaceChildren();ensurePage();
      const tools=make('div','graph-table-editor__tools');
      const toolGroup=(title)=>{const group=make('section','graph-table-editor__tool-group'),heading=make('h3','',title),controls=make('div','graph-table-editor__tool-actions');group.append(heading,controls);tools.appendChild(group);return controls;};
      const rows=toolGroup('行');
      rows.append(button('行を追加',()=>{try{const rowIndex=table.rows.length;addRows(1);page=pageCount()-1;focusCell={row:rowIndex+1,column:0};clearReport();render();}catch(error){report(error);}},'plus'));
      rows.append(button('選択行を削除',()=>{if(!selected.size)return;const removed=new Set(selected),nextRows=[],remap=new Map();table.rows.forEach((row,index)=>{if(removed.has(index))return;remap.set(index,nextRows.length);nextRows.push(row);});table.rows=nextRows;excludedRows=new Set([...excludedRows].filter(index=>remap.has(index)).map(index=>remap.get(index)));if(focusedRow!==null)focusedRow=remap.has(focusedRow)?remap.get(focusedRow):null;selected.clear();clearReport();render();},'trash'));
      const useSelected=button('選択行を回帰に使用',()=>{selected.forEach(index=>excludedRows.delete(index));render();});
      const excludeSelected=button('選択行を回帰から除外',()=>{selected.forEach(index=>excludedRows.add(index));render();});
      const useAll=button('全行を回帰に使用',()=>{excludedRows.clear();render();});
      const regressionTools=make('details','graph-table-editor__regression-tools'),regressionSummary=make('summary','', '回帰に使う行の設定'); regressionTools.append(regressionSummary,useSelected,excludeSelected,useAll);
      const columns=toolGroup('列');
      columns.append(button('列を追加',()=>{try{addColumns(1);clearReport();render();}catch(error){report(error);}},'plus'));
      const calculationsGroup=toolGroup('計算');
      calculationsGroup.append(button('計算列を追加',()=>beginCalculation(null),'function'));
      columns.append(button('最後の列を削除',()=>{
        const index=table.columns.length-1,minimum=kind==='data3d'?3:2;
        if(table.columns.length<=minimum){report(new Error('座標列を削除できません。'));return;}
        if(['x','y','z'].some(key=>table.mapping[key]===index)){report(new Error('座標に割り当てた列は削除できません。'));return;}
        if(calculationDraft){report(new Error('先に計算列の設定を適用または取り消してください。'));return;}
        try{
          const candidate=cloneTable(table);
          for(const key of ['errorX','errorY'])if(candidate.mapping[key]===index)candidate.mapping[key]=null;
          candidate.columns.pop();candidate.columnTypes.pop();candidate.formulas.pop();candidate.rows.forEach(row=>row.pop());
          checkedCandidate(candidate);table=candidate;clearReport();render();
        }catch(error){report(error);}
      },'trash'));root.appendChild(tools);
      if(calculationDraft){root.appendChild(calculationPanel());}
      const mappingDetails=make('details','graph-table-editor__mapping-details'),mappingSummary=make('summary','','列の割り当て（軸・誤差）');
      if(globalThis.GraphIcons)mappingSummary.prepend(globalThis.GraphIcons.create('axes',document));
      const description=make('span','graph-table-editor__mapping-description');mappingSummary.appendChild(description);
      mappingDetails.open=mappingOpen;mappingDetails.addEventListener('toggle',()=>{mappingOpen=mappingDetails.open;});mappingDetails.appendChild(mappingSummary);
      const mappings=make('div','graph-table-editor__mappings');
      mappings.append(mappingControl('x','横軸'),mappingControl('y','縦軸'));
      if(kind==='data3d')mappings.append(mappingControl('z','奥行き'));
      else mappings.append(mappingControl('errorX','横誤差'),mappingControl('errorY','縦誤差'));
      const describeMapping=()=>{description.textContent=mappingDescription();};
      mappings.addEventListener('change',describeMapping);describeMapping();
      mappingDetails.appendChild(mappings);root.appendChild(mappingDetails);
      const wrap=make('div','graph-table-editor__table-wrap'),grid=make('table','graph-table-editor__table'),head=make('thead'),header=make('tr');
      refreshCalculations();
      const all=make('input','');all.type='checkbox';all.setAttribute('aria-label','このページの行をすべて選択');
      const start=page*PAGE_SIZE,end=Math.min(table.rows.length,start+PAGE_SIZE),shown=table.rows.slice(start,end);
      all.checked=shown.length>0&&shown.every((_,offset)=>selected.has(start+offset));
      all.addEventListener('change',()=>{shown.forEach((_,offset)=>all.checked?selected.add(start+offset):selected.delete(start+offset));render();});
      const selector=make('th','');selector.scope='col';selector.appendChild(all);header.appendChild(selector);
      table.columns.forEach((name,index)=>{const th=make('th',''),input=make('input',''),type=make('select','graph-table-editor__column-type');th.scope='col';input.type='text';input.maxLength=80;input.value=name;input.setAttribute('aria-label',(index+1)+'列目の名前');input.readOnly=computed(index);input.addEventListener('change',()=>{try{updateColumnName(index,input.value);input.value=table.columns[index];}catch(error){input.value=table.columns[index];report(error);}});for(const pair of [['number','数値'],['date','日付'],['category','カテゴリ']]){const option=make('option','',pair[1]);option.value=pair[0];type.appendChild(option);}type.value=table.columnTypes[index];type.setAttribute('aria-label',(index+1)+'列目の種類');type.disabled=computed(index);type.addEventListener('change',()=>{table.columnTypes[index]=type.value;root.querySelectorAll('[data-column="'+index+'"]').forEach(input=>{input.inputMode=type.value==='number'?'decimal':'text';});refreshCalculations();updateComputedCells();});th.append(input,type);if(computed(index)){const edit=button('式を編集',()=>beginCalculation(index));edit.classList.add('graph-table-editor__formula-edit');edit.setAttribute('aria-label',name+'の式を編集');th.appendChild(edit);}header.appendChild(th);});
      head.appendChild(header);grid.appendChild(head);
      const body=make('tbody');
      shown.forEach((row,offset)=>{const rowIndex=start+offset,tr=make('tr',focusedRow===rowIndex?'graph-table-editor__focused-row':''),th=make('th',''),check=make('input',''),exclude=make('input','');th.scope='row';check.type='checkbox';check.checked=selected.has(rowIndex);check.setAttribute('aria-label',(rowIndex+1)+'行目を選択');check.addEventListener('change',()=>{check.checked?selected.add(rowIndex):selected.delete(rowIndex);});exclude.type='checkbox';exclude.checked=!excludedRows.has(rowIndex);exclude.className='graph-table-editor__regression-checkbox';exclude.setAttribute('aria-label',(rowIndex+1)+'行目を回帰に使用');exclude.title='回帰に使用';exclude.addEventListener('change',()=>{exclude.checked?excludedRows.delete(rowIndex):excludedRows.add(rowIndex);});th.appendChild(check);th.appendChild(document.createTextNode(String(rowIndex+1)));th.appendChild(exclude);tr.appendChild(th);
        row.forEach((value,columnIndex)=>{const td=make('td',''),input=make('input','');input.type='text';input.inputMode=table.columnTypes[columnIndex]==='number'?'decimal':'text';input.dataset.column=columnIndex;input.value=computed(columnIndex)?displayValue(value):value;input.readOnly=computed(columnIndex);input.setAttribute('aria-label',(rowIndex+1)+'行'+(columnIndex+1)+'列');if(computed(columnIndex)){input.classList.add('graph-table-editor__computed-cell');showComputedCell(input,rowIndex,columnIndex);}input.addEventListener('focus',()=>{if(computed(columnIndex))updateComputedCells();focusedRow=rowIndex;if(typeof options.onRowSelect==='function')options.onRowSelect(rowIndex);});input.addEventListener('input',()=>{if(!computed(columnIndex))table.rows[rowIndex][columnIndex]=input.value;});input.addEventListener('change',()=>{if(!computed(columnIndex)){refreshCalculations();updateComputedCells();if(refreshCalculationPreview)refreshCalculationPreview();}});input.addEventListener('paste',event=>paste(event,rowIndex,columnIndex));input.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const nextRow=rowIndex+1;if(nextRow>=table.rows.length)return;if(nextRow>=start+PAGE_SIZE){page=Math.floor(nextRow/PAGE_SIZE);render();}const next=root.querySelector('[data-cell="'+(nextRow+1)+','+columnIndex+'"]');if(next)next.focus();});input.dataset.cell=(rowIndex+1)+','+columnIndex;td.appendChild(input);tr.appendChild(td);});body.appendChild(tr);});
      grid.appendChild(body);wrap.appendChild(grid);root.appendChild(wrap);
      const pager=make('div','graph-table-editor__pager');pager.append(button('前の50行',()=>{page--;render();}));pager.append(make('span','', (table.rows.length?start+1:0)+'〜'+end+'行 / '+table.rows.length+'行'));pager.append(button('次の50行',()=>{page++;render();}));pager.children[0].disabled=page===0;pager.children[2].disabled=page>=pageCount()-1;root.appendChild(pager);
      root.appendChild(regressionTools);
      const details=make('details','graph-table-editor__import'),summary=make('summary','','CSV・TSVを貼り付け');details.appendChild(summary);const textarea=make('textarea','');textarea.setAttribute('aria-label','CSV・TSVを貼り付け');details.appendChild(textarea);details.append(button('表に取り込む',()=>{try{if(!textarea.value.trim())throw new Error('CSV・TSVを入力してから表に取り込んでください。');replace(GraphTables.parse(textarea.value,kind));}catch(error){report(error);}},'upload'));root.appendChild(details);
      const calculationStatus=make('p','graph-table-editor__calculation-status');root.append(calculationStatus,status);updateComputedCells();
      if(focusCell){const target=root.querySelector('[data-cell="'+focusCell.row+','+focusCell.column+'"]');if(target)target.focus();focusCell=null;}
    }
    function getExcludedRows(){return [...excludedRows].sort((a,b)=>a-b);}
    function getSelectedRow(){return focusedRow;}
    function focusRow(index){if(!Number.isInteger(index)||index<0||index>=table.rows.length)return false;focusedRow=index;page=Math.floor(index/PAGE_SIZE);render();const target=root.querySelector('[data-cell="'+(index+1)+',0"]');if(target)target.focus();if(typeof options.onRowSelect==='function')options.onRowSelect(index);return true;}
    render();if(focusedRow!==null)focusRow(focusedRow);return {read,replace,element:root,getExcludedRows,getSelectedRow,focusRow};
  }
  return {mount};
});
