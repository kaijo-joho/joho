/* Least-squares fits. Predictions retain normalized coordinates to avoid cancellation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GraphAnalysis=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const models=['linear','proportional','quadratic','exponential','power'];
  function sum(values){let result=0,carry=0;for(const value of values){const adjusted=value-carry,next=result+adjusted;carry=(next-result)-adjusted;result=next;}return result;}
  const mean=values=>values[0]+sum(values.map(v=>v-values[0]))/values.length;
  const dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
  const maximum=values=>values.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
  function quadratic(z,y){
    const columns=[z.map(()=>1),z,z.map(v=>v*v)],q=[],r=Array.from({length:3},()=>[0,0,0]);
    for(let j=0;j<3;j++){
      const v=columns[j].slice();
      // Modified Gram-Schmidt with reorthogonalization, for the small 3-column system.
      for(let pass=0;pass<2;pass++)for(let k=0;k<j;k++){const projection=dot(q[k],v);r[k][j]+=projection;for(let i=0;i<v.length;i++)v[i]-=projection*q[k][i];}
      r[j][j]=Math.sqrt(dot(v,v));
      if(!finite(r[j][j])||r[j][j]<=1e-12*Math.sqrt(z.length))return null;
      q[j]=v.map(value=>value/r[j][j]);
    }
    const rhs=q.map(v=>dot(v,y)),out=[0,0,0];
    for(let i=2;i>=0;i--){let value=rhs[i];for(let j=i+1;j<3;j++)value-=r[i][j]*out[j];out[i]=value/r[i][i];}
    return out;
  }
  function fit(series,model){
    const data=[];let skipped=0,excluded=0;
    const bad=warning=>({warning,model,n:data.length,skipped,excluded,coefficients:null,domain:null,predict:null,r:null,r2:null,rmse:null,residuals:[]});
    if(!models.includes(model)||!series||!Array.isArray(series.rows)||series.rows.length>10000)return bad('分析対象またはモデルが不正です。');
    if(series.dataTable){
      const table=series.dataTable, types=Array.isArray(table.columnTypes)?table.columnTypes:table.columns?.map(()=> 'number');
      const mapping=table.mapping;
      if(!Array.isArray(types)||!mapping||types[mapping.x]==='category'||types[mapping.y]==='category')return bad('カテゴリ軸のデータには回帰分析を使えません。');
      if(types[mapping.y]!=='number')return bad('回帰分析の縦軸には数値列を指定してください。');
    }
    const excludedRows=series.excludedRows===undefined?[]:series.excludedRows;
    if(!Array.isArray(excludedRows)||excludedRows.some(value=>!Number.isInteger(value)||value<0||value>=series.rows.length)||new Set(excludedRows).size!==excludedRows.length)return bad('除外する行が不正です。');
    const excludedSet=new Set(excludedRows);
    for(let i=0;i<series.rows.length;i++){
      const row=series.rows[i];if(!Array.isArray(row)||row.length!==2)return bad('数表の行が不正です。');
      const [x,y]=row;if(x!==null&&!finite(x)||y!==null&&!finite(y))return bad('数表に有限でない値があります。');
      if(excludedSet.has(i)){excluded++;continue;}if(x===null||y===null){skipped++;continue;}
      data.push({i:i+1,x,y});
    }
    const required=model==='quadratic'?3:2;
    if(data.length<required)return bad('分析できる点が不足しています。'+required+'点以上を指定してください。');
    if(model==='exponential'&&data.some(p=>p.y<=0))return bad('指数回帰には縦軸の値がすべて正の数である必要があります。');
    if(model==='power'&&data.some(p=>p.x<=0||p.y<=0))return bad('べき乗回帰には横軸・縦軸の値がすべて正の数である必要があります。');
    const logged=['exponential','power'].includes(model),xs=data.map(p=>model==='power'?Math.log(p.x):p.x),ys=data.map(p=>logged?Math.log(p.y):p.y);
    if(new Set(xs).size<required)return bad('異なる横軸の値が不足しています。');
    const mx=mean(xs),my=mean(ys),sx=maximum(xs.map(x=>x-mx)),sy=maximum(ys.map(y=>y-my))||1;
    if(!finite(sx)||sx===0||!finite(my)||!finite(sy))return bad('数値の尺度を決められません。');
    const z=xs.map(x=>(x-mx)/sx),v=ys.map(y=>(y-my)/sy);
    let coefficients,predict,centered;
    if(model==='proportional'){
      const ax=maximum(xs),ay=maximum(ys)||1,xn=xs.map(x=>x/ax),yn=ys.map(y=>y/ay),slope=dot(xn,yn)/dot(xn,xn);
      coefficients=[0,slope*ay/ax];predict=x=>ay*(slope*(x/ax));
    }else{
      let local;
      if(model==='quadratic'){local=quadratic(z,v);if(!local)return bad('2次式を安定して求められません。横軸の値が近すぎる可能性があります。');}
      else{const zm=mean(z),vm=mean(v),dz=z.map(x=>x-zm),beta=dot(dz,v.map(y=>y-vm))/dot(dz,dz);local=[vm-beta*zm,beta,0];}
      const intercept=my+sy*local[0],linear=sy*local[1]/sx,square=sy*local[2]/sx/sx;
      const evaluate=value=>{const t=(value-mx)/sx;return my+sy*(local[0]+t*(local[1]+t*local[2]));};
      centered={center:mx,scale:sx,coefficients:[intercept,linear,square]};
      if(logged){const A=Math.exp(intercept-linear*mx);coefficients=[A,linear];predict=model==='power'?x=>x>0?Math.exp(evaluate(Math.log(x))):NaN:x=>Math.exp(evaluate(x));if(!(A>0))return bad('係数の桁が小さすぎるため、このモデルを表示できません。');}
      else{coefficients=model==='quadratic'?[intercept-linear*mx+square*mx*mx,linear-2*square*mx,square]:[intercept-linear*mx,linear];predict=evaluate;}
    }
    if(coefficients.some(c=>!finite(c)))return bad('回帰係数が計算できる範囲を超えています。');
    const rawX=data.map(p=>p.x),rawY=data.map(p=>p.y),meanX=mean(rawX),meanY=mean(rawY),residuals=[];
    for(const p of data){const predicted=predict(p.x);if(!finite(predicted))return bad('有限な予測値を求められません。');residuals.push([p.i,p.x,p.y,predicted,p.y-predicted]);}
    const dx=rawX.map(x=>x-meanX),dy=rawY.map(y=>y-meanY),errors=residuals.map(row=>row[4]),xScale=maximum(dx),yScale=maximum(dy),eScale=maximum(errors);
    const xn=dx.map(v=>v/(xScale||1)),yn=dy.map(v=>v/(yScale||1)),en=errors.map(v=>v/(eScale||1)),sxx=dot(xn,xn),sst=dot(yn,yn),sse=dot(en,en);
    const r=xScale&&yScale?Math.max(-1,Math.min(1,dot(xn,yn)/Math.sqrt(sxx)/Math.sqrt(sst))):null,r2=yScale?1-(eScale/yScale)**2*(sse/sst):null,rmse=eScale*Math.sqrt(sse/data.length);
    if(!finite(rmse)||(r!==null&&!finite(r))||(r2!==null&&!finite(r2)))return bad('分析結果が計算できる範囲を超えています。');
    return {warning:'',model,n:data.length,skipped,excluded,coefficients,centered,domain:[Math.min(...rawX),Math.max(...rawX)],predict,r,r2,rmse,residuals};
  }
  function equation(result,x='x',y='y'){
    if(!result||result.warning||!Array.isArray(result.coefficients))return '';
    const number=value=>String(Number(value.toPrecision(8))),terms=[];
    const term=(value,suffix='')=>{if(value===0)return;const magnitude=Math.abs(value),body=(suffix&&magnitude===1?'':number(magnitude))+suffix;terms.push((terms.length?(value<0?' − ':' + '):(value<0?'−':''))+body);};
    const c=result.coefficients,center=result.centered,useCenter=center&&Math.abs(center.center)>1000*center.scale;
    const variable=useCenter?'('+x+(center.center<0?' + ':' − ')+String(Math.abs(center.center))+')':x;
    if(result.model==='exponential')return y+' ≈ '+number(useCenter?Math.exp(center.coefficients[0]):c[0])+' exp('+number(c[1])+' '+variable+')';
    if(result.model==='power')return y+' ≈ '+number(c[0])+' '+x+'^('+number(c[1])+')';
    const values=useCenter?center.coefficients:c;
    if(result.model==='quadratic')term(values[2],variable+'²');term(values[1],variable);term(values[0]);
    return y+' ≈ '+(terms.join('')||'0');
  }
  // Keep this alongside predict: expanding displayed coefficients loses precision for
  // data with a large offset on x.  Dependent annotations therefore use the same
  // normalized basis as the fit itself.
  function derivative(result,x){
    if(!result||result.warning||!finite(x))return null;
    if(result.model==='proportional')return finite(result.coefficients?.[1])?result.coefficients[1]:null;
    if(!result.centered)return null;
    const center=result.centered,scale=center.scale,local=center.coefficients;
    if(!finite(scale)||scale===0||!Array.isArray(local))return null;
    let value;
    if(result.model==='linear'||result.model==='quadratic'){
      value=local[1]+(result.model==='quadratic'?2*(x-center.center)*local[2]:0);
    }else if(result.model==='exponential'){
      const predicted=result.predict(x);
      value=finite(predicted)?predicted*local[1]:null;
    }else if(result.model==='power'){
      if(!(x>0))return null;
      const predicted=result.predict(x);
      value=finite(predicted)?predicted*local[1]/x:null;
    }
    return finite(value)?value:null;
  }
  return {fit,equation,derivative};
});
