/* Descriptive statistics and Pearson correlations for graph data tables. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GraphStatistics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const add=(total,carry,value)=>{
    const adjusted=value-carry;
    const next=total+adjusted;
    return [next,(next-total)-adjusted];
  };
  function compensated(values){
    let total=0,carry=0;
    for(const value of values)[total,carry]=add(total,carry,value);
    return total;
  }
  function checkedValues(values,label){
    if(!Array.isArray(values))throw new TypeError((label||'値')+'は配列にしてください。');
    const numeric=[];let missing=0;
    for(const value of values){
      if(value===null){missing++;continue;}
      if(!finite(value))throw new TypeError((label||'値')+'には有限な数値またはnullだけを指定してください。');
      numeric.push(value);
    }
    return {numeric,missing};
  }
  // This helper is shared by calculated columns. Neumaier summation retains a
  // small residual when a large positive and negative value cancel.
  function aggregateValues(values){
    const {numeric}=checkedValues(values,'値');
    let sum=0,correction=0;
    for(const value of numeric){
      const next=sum+value;
      correction+=Math.abs(sum)>=Math.abs(value)?sum-next+value:value-next+sum;
      sum=next;
    }
    const total=sum+correction;
    let populationStandardDeviation=null,sampleStandardDeviation=null;
    if(numeric.length){
      const base=numeric[0];let scale=0;
      for(const value of numeric)scale=Math.max(scale,Math.abs(value-base));
      if(scale===0){populationStandardDeviation=0;sampleStandardDeviation=numeric.length>1?0:null;}
      else{
        const normalized=numeric.map(value=>(value-base)/scale);
        const mean=compensated(normalized)/normalized.length;
        const squares=compensated(normalized.map(value=>(value-mean)**2));
        populationStandardDeviation=scale*Math.sqrt(squares/normalized.length);
        if(numeric.length>1)sampleStandardDeviation=scale*Math.sqrt(squares/(normalized.length-1));
      }
    }
    return {count:numeric.length,sum:total,mean:numeric.length?total/numeric.length:null,min:numeric.length?Math.min(...numeric):null,max:numeric.length?Math.max(...numeric):null,populationStandardDeviation,sampleStandardDeviation};
  }
  function finiteOrNull(value,warnings,message){
    if(finite(value))return value;
    warnings.push(message);
    return null;
  }
  function varianceFromDeviation(deviation,hasSpread,warnings,overflowMessage,underflowMessage){
    if(!finite(deviation)){warnings.push(overflowMessage);return null;}
    const variance=deviation*deviation;
    if(hasSpread&&variance===0){warnings.push(underflowMessage);return null;}
    return finiteOrNull(variance,warnings,overflowMessage);
  }
  // Japanese secondary-school convention: for an odd-sized data set, leave the
  // overall median out before taking the medians of the lower and upper halves.
  // This is also Plotly's "exclusive" quartile convention, but is calculated
  // here so every output (including precomputed box traces) agrees exactly.
  function medianOfSorted(values){
    const middle=Math.floor(values.length/2);
    if(values.length%2)return values[middle];
    const lower=values[middle-1],upper=values[middle],difference=upper-lower;
    return finite(difference)?lower+difference/2:lower/2+upper/2;
  }
  function quartiles(sorted){
    const n=sorted.length;
    if(!n)return {q1:null,q3:null,iqr:null};
    if(n===1)return {q1:sorted[0],q3:sorted[0],iqr:0};
    const middle=Math.floor(n/2);
    const lower=sorted.slice(0,middle),upper=sorted.slice(n%2?middle+1:middle);
    const q1=medianOfSorted(lower),q3=medianOfSorted(upper),iqr=q3-q1;
    return {q1,q3,iqr:finite(iqr)?iqr:null};
  }
  function describe(values){
    const {numeric,missing}=checkedValues(values,'値');
    const n=numeric.length;
    const result={n,missing,sum:null,mean:null,median:null,min:null,max:null,q1:null,q3:null,iqr:null,variance:null,standardDeviation:null,sampleVariance:null,sampleStandardDeviation:null,warning:''};
    if(n===0){result.warning='数値がありません。';return result;}
    const warnings=[];
    const aggregates=aggregateValues(numeric);
    const sorted=numeric.slice().sort((a,b)=>a-b);
    result.min=sorted[0];result.max=sorted[n-1];
    result.median=finiteOrNull(medianOfSorted(sorted),warnings,'中央値を計算できる範囲を超えています。');
    const spread=quartiles(sorted);
    result.q1=finiteOrNull(spread.q1,warnings,'第1四分位数を計算できる範囲を超えています。');
    result.q3=finiteOrNull(spread.q3,warnings,'第3四分位数を計算できる範囲を超えています。');
    result.iqr=spread.iqr===null?null:finiteOrNull(spread.iqr,warnings,'四分位範囲を計算できる範囲を超えています。');
    result.sum=finiteOrNull(aggregates.sum,warnings,'合計を計算できる範囲を超えています。');
    const hasSpread=aggregates.min!==aggregates.max;
    result.mean=finiteOrNull(aggregates.mean,warnings,'平均を計算できる範囲を超えています。');
    if(result.mean!==null){
      const populationDeviation=aggregates.populationStandardDeviation;
      result.variance=varianceFromDeviation(populationDeviation,hasSpread,warnings,'分散を計算できる範囲を超えています。','分散が小さすぎて表現できません。');
      result.standardDeviation=finiteOrNull(populationDeviation,warnings,'標準偏差を計算できる範囲を超えています。');
      if(n>1){
        const sampleDeviation=aggregates.sampleStandardDeviation;
        result.sampleVariance=varianceFromDeviation(sampleDeviation,hasSpread,warnings,'標本分散を計算できる範囲を超えています。','標本分散が小さすぎて表現できません。');
        result.sampleStandardDeviation=finiteOrNull(sampleDeviation,warnings,'標本標準偏差を計算できる範囲を超えています。');
      }else warnings.push('標本分散と標本標準偏差には2個以上の数値が必要です。');
    }
    result.warning=warnings.join(' ');
    return result;
  }
  function columnIndex(value,label){
    if(!Number.isInteger(value)||value<0)throw new TypeError((label||'列番号')+'は0以上の整数にしてください。');
    return value;
  }
  function pearson(rows,firstColumn,secondColumn){
    if(!Array.isArray(rows))throw new TypeError('行は配列にしてください。');
    const first=columnIndex(firstColumn,'第1列番号'),second=columnIndex(secondColumn,'第2列番号');
    const x=[],y=[];let missing=0;
    for(const row of rows){
      if(!Array.isArray(row)||row.length<=Math.max(first,second))throw new TypeError('数表の行または列番号が不正です。');
      const a=row[first],b=row[second];
      // A null is a missing observation, but it must not conceal a malformed
      // value in the other selected column.
      if(a!==null&&!finite(a)||b!==null&&!finite(b))throw new TypeError('数表には有限な数値またはnullだけを指定してください。');
      if(a===null||b===null){missing++;continue;}
      x.push(a);y.push(b);
    }
    const result={r:null,n:x.length,missing,warning:''};
    if(x.length<2){result.warning='相関係数には同じ行に2組以上の数値が必要です。';return result;}
    let scaleX=0,scaleY=0;
    for(let i=0;i<x.length;i++){scaleX=Math.max(scaleX,Math.abs(x[i]-x[0]));scaleY=Math.max(scaleY,Math.abs(y[i]-y[0]));}
    if(scaleX===0||scaleY===0){result.warning='一定の値だけの列では相関係数を計算できません。';return result;}
    const normalizedX=x.map(value=>(value-x[0])/scaleX),normalizedY=y.map(value=>(value-y[0])/scaleY);
    const meanX=compensated(normalizedX)/x.length,meanY=compensated(normalizedY)/y.length;
    let xy=0,xyCarry=0,xx=0,xxCarry=0,yy=0,yyCarry=0;
    for(let i=0;i<x.length;i++){
      const dx=normalizedX[i]-meanX,dy=normalizedY[i]-meanY;
      [xy,xyCarry]=add(xy,xyCarry,dx*dy);
      [xx,xxCarry]=add(xx,xxCarry,dx*dx);
      [yy,yyCarry]=add(yy,yyCarry,dy*dy);
    }
    const r=xy/Math.sqrt(xx)/Math.sqrt(yy);
    if(!finite(r)){result.warning='相関係数を計算できる範囲を超えています。';return result;}
    result.r=Math.max(-1,Math.min(1,r));
    return result;
  }
  function validateTable(table){
    if(!table||!Array.isArray(table.columns)||!Array.isArray(table.rows))throw new TypeError('数表はcolumnsとrowsを持つオブジェクトにしてください。');
    if(table.columns.length>20)throw new RangeError('列数は20以下にしてください。');
    if(table.rows.length>10000)throw new RangeError('行数は10000以下にしてください。');
    for(const name of table.columns)if(typeof name!=='string')throw new TypeError('列名は文字列にしてください。');
    const types=table.columnTypes===undefined?table.columns.map(()=> 'number'):table.columnTypes;
    if(!Array.isArray(types)||types.length!==table.columns.length||types.some(type=>!['number','date','category'].includes(type)))throw new TypeError('数表の列の種類が不正です。');
    for(const row of table.rows){
      if(!Array.isArray(row)||row.length!==table.columns.length)throw new TypeError('数表の各行は列数と同じ長さにしてください。');
      row.forEach((value,index)=>{if(types[index]==='number')checkedValues([value],'数表');else if(value!==null&&typeof value!=='string')throw new TypeError('日付・カテゴリ列は文字列またはnullにしてください。');});
    }
  }
  function selectedIndices(table,indices){
    if(indices===undefined)indices=table.columns.map((_,index)=>index);
    if(!Array.isArray(indices))throw new TypeError('列番号は配列にしてください。');
    const out=indices.map(index=>columnIndex(index));
    const types=table.columnTypes||table.columns.map(()=> 'number');
    if(out.some(index=>index>=table.columns.length)||new Set(out).size!==out.length)throw new RangeError('列番号が不正または重複しています。');
    if(out.some(index=>types[index]!=='number'))throw new TypeError('統計量には数値列だけを指定してください。');
    return out;
  }
  function matrix(table,indices){
    validateTable(table);
    const selected=selectedIndices(table,indices),size=selected.length;
    const values=Array.from({length:size},()=>Array(size).fill(null));
    const counts=Array.from({length:size},()=>Array(size).fill(0));
    const warnings=Array.from({length:size},()=>Array(size).fill(''));
    for(let row=0;row<size;row++)for(let column=row;column<size;column++){
      const result=pearson(table.rows,selected[row],selected[column]);
      values[row][column]=values[column][row]=result.r;
      counts[row][column]=counts[column][row]=result.n;
      warnings[row][column]=warnings[column][row]=result.warning;
    }
    return {columns:selected.map(index=>table.columns[index]),indices:selected,values,counts,warnings};
  }
  function summarize(table,indices){
    validateTable(table);
    return selectedIndices(table,indices).map(index=>Object.assign({index,name:table.columns[index]},describe(table.rows.map(row=>row[index]))));
  }
  return {describe,pearson,matrix,summarize,aggregateValues};
});
