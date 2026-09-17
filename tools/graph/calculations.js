/* Safe calculated columns for graph data tables. */
(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./expression.js'):root.GraphExpression,
    typeof module==='object'&&module.exports?require('./statistics.js'):root.GraphStatistics
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GraphCalculations=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Expression,Statistics){
  'use strict';
  const LIMIT={columns:20,rows:10000,expression:1000,work:2000000};
  const aggregateNames={sum:'SUM',average:'AVERAGE',min:'MIN',max:'MAX',count:'COUNT','stdev.p':'STDEV.P','stdev.s':'STDEV.S'};
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const fail=message=>{throw new Error(message);};
  const quote=name=>/[\],:@"\\]/.test(name)?'["'+name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"]':'['+name+']';
  function checkedOffset(value){
    if(typeof value!=='number'||!Number.isInteger(value)||Math.abs(value)>10000)throw new RangeError('行オフセットは-10000から10000までの整数にしてください。');
    return value;
  }
  function offsetText(value){return value>0?'+'+value:String(value);}
  function reference(name,row,offset=0,endOffset){
    if(typeof name!=='string')throw new TypeError('列名は文字列にしてください。');
    if(!row){if(offset!==0||endOffset!==undefined)throw new TypeError('行オフセットには行参照を指定してください。');return quote(name);}
    offset=checkedOffset(offset);
    if(endOffset!==undefined){
      endOffset=checkedOffset(endOffset);
      if(offset>endOffset)throw new RangeError('行範囲の開始は終了以下にしてください。');
    }
    const text='[@'+quote(name).slice(1,-1);
    return endOffset!==undefined?text+','+offsetText(offset)+':'+offsetText(endOffset)+']':offset===0?text+']':text+','+offsetText(offset)+']';
  }
  function normalizeFormulas(table){
    if(!table||!Array.isArray(table.columns))throw new TypeError('数表はcolumnsを持つオブジェクトにしてください。');
    const source=table.formulas===undefined?Array(table.columns.length).fill(null):table.formulas;
    if(!Array.isArray(source)||source.length!==table.columns.length)throw new TypeError('計算式は列数と同じ長さにしてください。');
    return source.map(value=>{if(value===null||value==='')return null;if(typeof value!=='string')throw new TypeError('計算式は文字列またはnullにしてください。');if(value.length>LIMIT.expression)throw new RangeError('計算式は1000文字以下にしてください。');return value;});
  }
  function parseSuffix(suffix){
    const match=/^([+-]?\d+)(?::([+-]?\d+))?$/.exec(suffix);
    if(!match)fail('行参照のオフセットが正しくありません。');
    let offset=Number(match[1]),endOffset=match[2]===undefined?undefined:Number(match[2]);
    if(!Number.isSafeInteger(offset)||Math.abs(offset)>10000||endOffset!==undefined&&(!Number.isSafeInteger(endOffset)||Math.abs(endOffset)>10000))fail('行オフセットは-10000から10000までの整数にしてください。');
    if(endOffset!==undefined&&offset>endOffset)fail('行範囲の開始は終了以下にしてください。');
    return {offset,endOffset};
  }
  function parseReference(text,start){
    let i=start+1,row=false;if(text[i]==='@'){row=true;i++;}
    let name='',suffix='',quoted=false,hasSuffix=false;
    if(text[i]==='"'){
      quoted=true;
      const begin=i++;let escaped=false;
      while(i<text.length){const c=text[i++];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"')break;}
      if(text[i-1]!=='"'||(text[i]!==']'&&!(row&&text[i]===',')))fail('列参照の書式が正しくありません。');
      try{name=JSON.parse(text.slice(begin,i));}catch(_){fail('列参照の引用符が正しくありません。');} i++;
      if(i<=text.length&&text[i-1]===','){
        hasSuffix=true;const end=text.indexOf(']',i);if(end<0)fail('列参照の閉じ括弧がありません。');suffix=text.slice(i,end);i=end+1;
      }
    }else{
      const end=text.indexOf(']',i);if(end<0)fail('列参照の閉じ括弧がありません。');name=text.slice(i,end);i=end+1;
      if(row){const comma=name.indexOf(',');if(comma>=0){hasSuffix=true;suffix=name.slice(comma+1);name=name.slice(0,comma);}}
    }
    if(!name||!quoted&&name[0]==='@'||!quoted&&/[:,]/.test(name))fail('列参照の書式が正しくありません。');
    if(!row&&hasSuffix)fail('列参照の書式が正しくありません。');
    const range=hasSuffix?parseSuffix(suffix):{offset:0,endOffset:undefined};
    return {name,row,...range,end:i};
  }
  function refsIn(expression){
    const refs=[];let out='',outside='',i=0;
    while(i<expression.length){
      if(expression[i]==='['){
        const ref=parseReference(expression,i);refs.push(ref);
        out+='vref'+(refs.length-1);outside+=' ';i=ref.end;
      }else{outside+=expression[i];out+=expression[i++];}
    }
    return {text:out,outside,refs};
  }
  function renameReferences(expression,oldName,newName){
    if(typeof expression!=='string'||typeof oldName!=='string'||typeof newName!=='string')throw new TypeError('式と列名は文字列にしてください。');
    let out='',i=0;while(i<expression.length){if(expression[i]!=='['){out+=expression[i++];continue;}const ref=parseReference(expression,i);out+=(ref.name===oldName?reference(newName,ref.row,ref.offset,ref.endOffset):expression.slice(i,ref.end));i=ref.end;}return out;
  }
  function parseLegacyReference(text,start){
    let i=start+1,row=false;if(text[i]==='@'){row=true;i++;}
    let name='',quoted=false;
    if(text[i]==='"'){
      quoted=true;
      const begin=i++;let escaped=false;
      while(i<text.length){const c=text[i++];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"')break;}
      if(text[i-1]!=='"'||text[i]!==']')fail('旧式の列参照の書式が正しくありません。');
      try{name=JSON.parse(text.slice(begin,i));}catch(_){fail('旧式の列参照の引用符が正しくありません。');} i++;
    }else{
      const end=text.indexOf(']',i);if(end<0)fail('旧式の列参照の閉じ括弧がありません。');name=text.slice(i,end);i=end+1;
    }
    if(!name||!quoted&&name[0]==='@')fail('旧式の列参照の書式が正しくありません。');
    return {name,row,end:i};
  }
  function migrateLegacyReferences(expression){
    if(typeof expression!=='string')throw new TypeError('式は文字列にしてください。');
    let out='',outside='',i=0;
    while(i<expression.length){
      if(expression[i]!=='['){out+=expression[i];outside+=expression[i++];continue;}
      const ref=parseLegacyReference(expression,i);
      let unchanged=false;
      try {
        const current=parseReference(expression,i);
        unchanged=current.end===ref.end&&current.name===ref.name&&current.row===ref.row&&current.offset===0&&current.endOffset===undefined;
      } catch(_) { /* An old literal name may be invalid or ambiguous in the new grammar. */ }
      out+=unchanged?expression.slice(i,ref.end):reference(ref.name,ref.row);outside+=' ';i=ref.end;
    }
    if(/\b(?:vref|vagg)\d+\b/.test(outside))fail('内部の変数名は計算式に使えません。');
    return out;
  }
  function validate(table,formulas){
    if(!table||!Array.isArray(table.columns)||!Array.isArray(table.rows))throw new TypeError('数表はcolumnsとrowsを持つオブジェクトにしてください。');
    if(table.columns.length>LIMIT.columns)throw new RangeError('列数は20以下にしてください。');if(table.rows.length>LIMIT.rows)throw new RangeError('行数は10000以下にしてください。');
    const types=table.columnTypes===undefined?table.columns.map(()=> 'number'):table.columnTypes;
    if(!Array.isArray(types)||types.length!==table.columns.length||types.some(t=>!['number','date','category'].includes(t)))throw new TypeError('数表の列の種類が不正です。');
    const names=new Map();table.columns.forEach((name,index)=>{if(typeof name!=='string')throw new TypeError('列名は文字列にしてください。');if(!names.has(name))names.set(name,[]);names.get(name).push(index);});
    table.rows.forEach(row=>{if(!Array.isArray(row)||row.length!==table.columns.length)throw new TypeError('数表の各行は列数と同じ長さにしてください。');row.forEach((value,i)=>{if(types[i]==='number'&&value!==null&&!finite(value))throw new TypeError('数値列には有限な数値またはnullを指定してください。');if(types[i]!=='number'&&value!==null&&typeof value!=='string')throw new TypeError('日付・カテゴリ列は文字列またはnullにしてください。');});});
    formulas.forEach((formula,index)=>{if(formula&&types[index]!=='number')fail('計算列は数値列にしてください。');});
    return {types,names};
  }
  function prepare(expression,names){
    const parsed=refsIn(expression);
    if(/\b(?:vref|vagg)\d+\b/.test(parsed.outside)) {
      fail('内部の変数名は計算式に使えません。');
    }
    const refs=parsed.refs.map((ref,i)=>{
      const matches=names.get(ref.name);
      if(!matches) fail('不明な列「'+ref.name+'」があります。');
      if(matches.length!==1) fail('列名「'+ref.name+'」は重複しているため参照できません。');
      return {...ref,column:matches[0],token:'vref'+i};
    });
    let text=parsed.text,aggregates=[],used=new Set();
    text=text.replace(/\b(sum|average|min|max|count|stdev\.p|stdev\.s)\s*\(\s*(vref\d+)\s*\)/gi,(all,kind,token)=>{
      const ref=refs.find(item=>item.token===token);
      if(!ref||ref.row&&ref.endOffset===undefined) fail('集計関数の引数には列全体または行範囲の参照を1つ指定してください。');
      used.add(token);
      const variable='vagg'+aggregates.length;
      aggregates.push({kind:kind.toLowerCase(),column:ref.column,variable,offset:ref.offset,endOffset:ref.endOffset});
      return variable;
    });
    if(/\b(sum|average|count|stdev\.p|stdev\.s)\s*\(/i.test(text))fail('集計関数の引数には列全体または行範囲の参照を1つ指定してください。');
    for(const ref of refs)if(!ref.row&&!used.has(ref.token))fail('列全体の参照は集計関数の引数にだけ使えます。');
    for(const ref of refs)if(ref.row&&ref.endOffset!==undefined&&!used.has(ref.token))fail('行範囲の参照は集計関数の引数にだけ使えます。');
    // GraphExpression function names are intentionally lowercase; column names remain exact.
    text=text.replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|ln|log|floor|ceil|round|min|max)\s*\(/gi,(all,name)=>name.toLowerCase()+'(').replace(/\b(PI|E)\b/g,(all,name)=>name.toLowerCase());
    const variables=[...refs.filter(ref=>ref.row&&ref.endOffset===undefined).map(ref=>ref.token),...aggregates.map(item=>item.variable)];
    if(!Expression||typeof Expression.compile!=='function')fail('数式エンジンを読み込めません。');
    let compiled;
    try { compiled=Expression.compile(text,{variables,target:false}); }
    catch(error) { fail(error.message); }
    const tokens=text.match(/[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/^,]/gi)||[];
    return {refs,aggregates,compiled,dependencies:new Set(refs.map(ref=>ref.column)),cost:Math.max(1,tokens.length)};
  }
  function aggregate(kind,values){
    if(!Statistics||typeof Statistics.aggregateValues!=='function')fail('統計エンジンを読み込めません。');
    const result=Statistics.aggregateValues(values);
    if(!result.count){if(kind==='sum'||kind==='count')return 0;fail(aggregateNames[kind]+' は数値が必要です。');}
    if(kind==='count')return result.count;
    if(kind==='sum')return result.sum;
    if(kind==='average')return result.mean;
    if(kind==='min')return result.min;
    if(kind==='max')return result.max;
    if(kind==='stdev.s'&&result.count<2)fail('STDEV.S には2個以上の数値が必要です。');
    return kind==='stdev.s'?result.sampleStandardDeviation:result.populationStandardDeviation;
  }
  function evaluate(table){
    const formulas=normalizeFormulas(table);
    const checked=validate(table,formulas);
    const prepared=formulas.map(value=>value?prepare(value,checked.names):null);
    const aggregateKeys=new Set(),windowKeys=new Set();
    prepared.forEach(item=>item&&item.aggregates.forEach(a=>{
      if(a.endOffset===undefined)aggregateKeys.add(a.kind+'\u0000'+a.column);
      else windowKeys.add(a.kind+'\u0000'+a.column+'\u0000'+a.offset+'\u0000'+a.endOffset);
    }));
    const expressionCost=prepared.reduce((total,item)=>total+(item?item.cost:0),0);
    let work=table.rows.length*(expressionCost+aggregateKeys.size);
    for(const key of windowKeys){
      const parts=key.split('\u0000'),startOffset=Number(parts[2]),endOffset=Number(parts[3]),width=endOffset-startOffset+1;
      const first=Math.max(0,-startOffset),last=Math.min(table.rows.length-1,table.rows.length-1-endOffset);
      if(last>=first)work+=(last-first+1)*width;
    }
    if(work>LIMIT.work)throw new RangeError('計算量が上限を超えています。式を簡単にするか、行数を減らしてください。');
    prepared.forEach((item,column)=>{
      if(!item) return;
      if(item.dependencies.has(column)) fail('計算列は自分自身を参照できません。');
      item.dependencies.forEach(dep=>{if(checked.types[dep]!=='number')fail('計算には数値列だけを参照できます。');});
    });
    const order=[],state=Array(formulas.length).fill(0);
    function visit(column){
      if(!prepared[column]||state[column]===2) return;
      if(state[column]===1) fail('計算列の参照が循環しています。');
      state[column]=1;
      prepared[column].dependencies.forEach(dep=>{if(prepared[dep])visit(dep);});
      state[column]=2;order.push(column);
    }
    prepared.forEach((_,i)=>visit(i));
    const rows=table.rows.map(row=>row.slice());
    const errors=[];
    const bad=Array.from({length:rows.length},()=>Array(formulas.length).fill(''));
    const aggregateCache=new Map(),windowCache=new Map();
    function wholeAggregate(a){
      const key=a.kind+'\u0000'+a.column;
      if(!aggregateCache.has(key)){
        let scalar;
        if(rows.some((_,r)=>bad[r][a.column])) scalar={error:'参照先の計算エラーがあります。'};
        else try { const value=aggregate(a.kind,rows.map(row=>row[a.column])); scalar=finite(value)?{value}:{error:'集計結果が計算できません。'}; }
        catch(error) { scalar={error:error.message}; }
        aggregateCache.set(key,scalar);
      }
      return aggregateCache.get(key);
    }
    function rangeAggregate(a,row){
      const start=row+a.offset,end=row+a.endOffset;
      if(start<0||end>=rows.length)return {missing:true};
      const key=a.kind+'\u0000'+a.column+'\u0000'+start+'\u0000'+end;
      if(!windowCache.has(key)){
        let scalar;
        for(let r=start;r<=end;r++)if(bad[r][a.column]){scalar={error:'参照先の計算エラーがあります。'};break;}
        if(!scalar)try { const value=aggregate(a.kind,rows.slice(start,end+1).map(item=>item[a.column])); scalar=finite(value)?{value}:{error:'集計結果が計算できません。'}; }
        catch(error) { scalar={error:error.message}; }
        windowCache.set(key,scalar);
      }
      return windowCache.get(key);
    }
    for(const column of order){
      const item=prepared[column];
      for(let r=0;r<rows.length;r++){
        let message='',missing=false;const scope={};
        for(const ref of item.refs)if(ref.row){
          if(ref.endOffset!==undefined)continue;
          const sourceRow=r+ref.offset;
          if(sourceRow<0||sourceRow>=rows.length)missing=true;
          else if(bad[sourceRow][ref.column]) message='参照先の計算エラーがあります。';
          else if(rows[sourceRow][ref.column]===null) missing=true;
          else scope[ref.token]=rows[sourceRow][ref.column];
        }
        for(const a of item.aggregates){
          const scalar=a.endOffset===undefined?wholeAggregate(a):rangeAggregate(a,r);
          if(scalar.error)message=scalar.error;
          else if(scalar.missing)missing=true;
          else scope[a.variable]=scalar.value;
        }
        let value=null;
        if(!message&&!missing){
          value=item.compiled.evaluate(scope);
          if(!finite(value)) message='計算結果が定義されません（0による除算または定義域外）。';
          else if(Math.abs(value)>1e9) message='計算結果が計算範囲を超えています。';
        }
        if(message){rows[r][column]=null;bad[r][column]=message;errors.push({row:r,column,message});}
        else rows[r][column]=missing?null:value;
      }
    }
    return {rows,errors};
  }
  return {evaluate,normalizeFormulas,reference,renameReferences,migrateLegacyReferences};
});
