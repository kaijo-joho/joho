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
  const quote=name=>/[\]@"\\]/.test(name)?'["'+name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"]':'['+name+']';
  function reference(name,row){
    if(typeof name!=='string')throw new TypeError('列名は文字列にしてください。');
    const text=quote(name); return row?'[@'+text.slice(1):text;
  }
  function normalizeFormulas(table){
    if(!table||!Array.isArray(table.columns))throw new TypeError('数表はcolumnsを持つオブジェクトにしてください。');
    const source=table.formulas===undefined?Array(table.columns.length).fill(null):table.formulas;
    if(!Array.isArray(source)||source.length!==table.columns.length)throw new TypeError('計算式は列数と同じ長さにしてください。');
    return source.map(value=>{if(value===null||value==='')return null;if(typeof value!=='string')throw new TypeError('計算式は文字列またはnullにしてください。');if(value.length>LIMIT.expression)throw new RangeError('計算式は1000文字以下にしてください。');return value;});
  }
  function parseReference(text,start){
    let i=start+1,row=false;if(text[i]==='@'){row=true;i++;}
    let name='';
    if(text[i]==='"'){
      const begin=i++;let escaped=false;
      while(i<text.length){const c=text[i++];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"')break;}
      if(text[i-1]!=='"'||text[i]!==']')fail('列参照の書式が正しくありません。');
      try{name=JSON.parse(text.slice(begin,i));}catch(_){fail('列参照の引用符が正しくありません。');} i++;
    }else{
      const end=text.indexOf(']',i);if(end<0)fail('列参照の閉じ括弧がありません。');name=text.slice(i,end);i=end+1;
      if(!name||name[0]==='@')fail('列参照の書式が正しくありません。');
    }
    return {name,row,end:i};
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
    let out='',i=0;while(i<expression.length){if(expression[i]!=='['){out+=expression[i++];continue;}const ref=parseReference(expression,i);out+=(ref.name===oldName?reference(newName,ref.row):expression.slice(i,ref.end));i=ref.end;}return out;
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
      if(!ref||ref.row) fail('集計関数の引数には列全体の参照を1つ指定してください。');
      used.add(token);
      const variable='vagg'+aggregates.length;
      aggregates.push({kind:kind.toLowerCase(),column:ref.column,variable});
      return variable;
    });
    if(/\b(sum|average|count|stdev\.p|stdev\.s)\s*\(/i.test(text))fail('集計関数の引数には列全体の参照を1つ指定してください。');
    for(const ref of refs)if(!ref.row&&!used.has(ref.token))fail('列全体の参照は集計関数の引数にだけ使えます。');
    // GraphExpression function names are intentionally lowercase; column names remain exact.
    text=text.replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|ln|log|floor|ceil|round|min|max)\s*\(/gi,(all,name)=>name.toLowerCase()+'(').replace(/\b(PI|E)\b/g,(all,name)=>name.toLowerCase());
    const variables=[...refs.filter(ref=>ref.row).map(ref=>ref.token),...aggregates.map(item=>item.variable)];
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
    const aggregateKeys=new Set();
    prepared.forEach(item=>item&&item.aggregates.forEach(a=>aggregateKeys.add(a.kind+'\u0000'+a.column)));
    const expressionCost=prepared.reduce((total,item)=>total+(item?item.cost:0),0);
    const work=table.rows.length*(expressionCost+aggregateKeys.size);
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
    const aggregateCache=new Map();
    for(const column of order){
      const item=prepared[column],scalars={};
      for(const a of item.aggregates){
        const key=a.kind+'\u0000'+a.column;
        if(!aggregateCache.has(key)){
          let scalar;
          if(rows.some((_,r)=>bad[r][a.column])) scalar={error:'参照先の計算エラーがあります。'};
          else try { const value=aggregate(a.kind,rows.map(row=>row[a.column])); scalar=finite(value)?{value}:{error:'集計結果が計算できません。'}; }
          catch(error) { scalar={error:error.message}; }
          aggregateCache.set(key,scalar);
        }
        scalars[a.variable]=aggregateCache.get(key);
      }
      for(let r=0;r<rows.length;r++){
        let message='',missing=false;const scope={};
        for(const ref of item.refs)if(ref.row){
          if(bad[r][ref.column]) message='参照先の計算エラーがあります。';
          else if(rows[r][ref.column]===null) missing=true;
          else scope[ref.token]=rows[r][ref.column];
        }
        for(const a of item.aggregates){const scalar=scalars[a.variable];if(scalar.error)message=scalar.error;else scope[a.variable]=scalar.value;}
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
  return {evaluate,normalizeFormulas,reference,renameReferences};
});
